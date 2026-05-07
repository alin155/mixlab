# M12 Smart Scan And Preprocess Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable version of the admin dashboard smart scan workflow and make the preprocessing queue readable as a long-running production monitor.

**Architecture:** Keep M12.1 mostly in the admin web layer by composing existing Admin API operations for scanning, doctor checks, queueing, and worker start. Add small view-model helpers for smart-scan recommendations and preprocessing production status so the UX is deterministic and testable. Do not add a new backend workflow endpoint yet; the backend already exposes the primitives needed for this milestone.

**Tech Stack:** React 19, TypeScript, Node test runner, existing Admin API client, existing admin UI foundation components.

---

### Task 1: Smart Scan View Model

**Files:**
- Modify: `apps/admin-web/src/api.ts`
- Modify: `apps/admin-web/src/admin-app.test.ts`

- [ ] **Step 1: Write failing tests for smart scan recommendations**

Add tests that call `createAdminSmartScanReport(data)` for states with queued videos but idle supervisor, unprocessed videos, failed videos, index-required videos, and doctor failures.

- [ ] **Step 2: Run targeted admin web tests and confirm failure**

Run: `node --test --import tsx apps/admin-web/src/admin-app.test.ts`

Expected: failure because `createAdminSmartScanReport` does not exist.

- [ ] **Step 3: Implement `AdminSmartScanReport` and `createAdminSmartScanReport`**

The report should include:
- summary title and detail
- severity: `healthy | attention | blocked`
- recommended primary action
- suggestion rows for scan, queue, start worker, retry failures, publish index, and doctor issues

- [ ] **Step 4: Run targeted admin web tests and confirm pass**

Run: `node --test --import tsx apps/admin-web/src/admin-app.test.ts`

Expected: pass.

### Task 2: Dashboard Smart Scan Center

**Files:**
- Modify: `apps/admin-web/src/app/AdminApp.tsx`
- Modify: `apps/admin-web/src/features/dashboard/DashboardPage.tsx`
- Modify: `apps/admin-web/src/admin-app.test.ts`

- [ ] **Step 1: Write failing render tests**

Dashboard should render:
- one primary `智能扫描` button
- smart scan report
- suggested next action, especially `启动预处理服务`
- no dashboard `处理未处理` primary button

- [ ] **Step 2: Run targeted test and confirm failure**

Run: `node --test --import tsx apps/admin-web/src/admin-app.test.ts`

- [ ] **Step 3: Implement dashboard smart scan UI**

Add dashboard props:
- `smartScanReport`
- `onRunSmartScan`
- `onApplySmartScanPrimaryAction`

`AdminApp` should compose the first action:
- click `智能扫描`: run `scanSourceVideos`, `runDoctor`, reload dashboard, then show the report based on current/refreshed state.
- primary recommendation executes one of existing actions: queue unprocessed, start supervisor, retry failed, repair index, or run doctor.

- [ ] **Step 4: Run targeted test and confirm pass**

Run: `node --test --import tsx apps/admin-web/src/admin-app.test.ts`

### Task 3: Preprocess Production Monitor

**Files:**
- Modify: `apps/admin-web/src/api.ts`
- Modify: `apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx`
- Modify: `apps/admin-web/src/features/shared.tsx`
- Modify: `apps/admin-web/src/app/chinese.ts`
- Modify: `apps/admin-web/src/admin-app.test.ts`

- [ ] **Step 1: Write failing tests for production status and queue wording**

The queue page must render:
- `40 个视频已排队，但预处理服务未运行`
- `建议启动预处理服务`
- queued rows as `等待处理`, `排队第 N 位`, and estimated duration
- no `queued-by-admin`
- no `.mixlab-library/logs/...` in queue rows
- no misleading `0%` for queued rows

- [ ] **Step 2: Run targeted test and confirm failure**

Run: `node --test --import tsx apps/admin-web/src/admin-app.test.ts`

- [ ] **Step 3: Implement production monitor helpers and UI**

Add helper functions:
- `createPreprocessProductionStatus(data)`
- `jobStatusDisplay(job, index)`

Update queue page:
- top status banner
- current task section
- queue rows with business wording
- move technical log path to inspector summary only

- [ ] **Step 4: Run targeted test and confirm pass**

Run: `node --test --import tsx apps/admin-web/src/admin-app.test.ts`

### Task 4: Full Verification

**Files:**
- Test-only verification

- [ ] **Step 1: Run full tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 3: Run diff hygiene**

Run: `git diff --check`

Expected: exit 0.

- [ ] **Step 4: Browser sanity check**

Use the running admin web at `http://127.0.0.1:5174/#/dashboard` and `#/preprocess-jobs` to verify the smart scan and production monitor are visible.
