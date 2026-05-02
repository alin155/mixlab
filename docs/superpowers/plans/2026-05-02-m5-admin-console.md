# M5 Admin Console MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. This milestone builds the formal admin web MVP on top of M3 UI foundation; it does not implement the Go admin backend.

**Goal:** Deliver the first formal素材库管理端 UI that governs public-library status, settings, source metadata, preprocessing jobs, index publication, Doctor diagnostics, and ASR runtime settings without drifting into generic SaaS dashboard styling.

**Architecture:** `apps/admin-web` is a Vite React app that imports `@mixlab/ui-foundation` primitives and talks only through a typed Admin API client matching `18_API接口草案.md`. The app uses a fixture client by default for deterministic local acceptance, while `createAdminApiClient()` can point at a future backend through `VITE_MIXLAB_ADMIN_API_BASE_URL`. A Playwright visual script captures each admin page at `1536x1024` and verifies required page boundaries, metadata controls, preprocessing failure/retry visibility, index current state, Doctor JSON export, ASR redaction, and Apple-HIG structure.

**Tech Stack:** TypeScript, React, Vite, `@mixlab/ui-foundation`, Node built-in test runner, Playwright with local Chrome.

---

## Step Guard

Every task in this M starts with this declaration:

```text
This step: M5 Formal Management Console MVP
Spec sources: 08_素材库管理端规格.md, 18_API接口草案.md, 19_增量预处理与可见性规则.md, 21_视觉与交互设计规范.md, 22_运行时依赖与ASR配置.md
Traceability IDs: ADMIN-001, ADMIN-002, ADMIN-003, ADMIN-004, ADMIN-005, ADMIN-006, ADMIN-007
Hi-fi screen: /Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/admin-console-apple-hig.png
Files to change: apps/admin-web, scripts/visual, package.json, README.md, docs
Explicitly not doing: Go admin backend, real preprocessing orchestration, real filesystem writes from UI, cutter UI rebuild, Tauri shell, SQLite production search
Acceptance: npm run typecheck; npm test; npm run build:cutter-web; npm run build:ui-fixtures; npm run build:admin-web; npm run visual:ui-foundation; npm run visual:admin-web
```

---

## File Structure

- Create `apps/admin-web/package.json`: formal admin web package.
- Create `apps/admin-web/tsconfig.json`: React/Vite TypeScript config.
- Create `apps/admin-web/index.html`: app entry.
- Create `apps/admin-web/src/api.ts`: typed Admin API client, fixture data client, JSON envelope unwrapping, secret-safe response shape.
- Create `apps/admin-web/src/api.test.ts`: TDD tests for API envelope parsing, endpoint paths, fixture data, failed-job visibility, and key redaction.
- Create `apps/admin-web/src/app/navigation.ts`: required admin nav items and route helpers.
- Create `apps/admin-web/src/app/view-model.ts`: status tone mapping, count summary, page guard, ASR redaction helpers.
- Create `apps/admin-web/src/app/view-model.test.ts`: TDD tests for admin page coverage and no forbidden UI patterns.
- Create `apps/admin-web/src/app/AdminApp.tsx`: shell, router, data loading, page composition.
- Create `apps/admin-web/src/features/dashboard/DashboardPage.tsx`: dashboard.
- Create `apps/admin-web/src/features/library-settings/LibrarySettingsPage.tsx`: library settings/path checks.
- Create `apps/admin-web/src/features/source-videos/SourceVideosPage.tsx`: source video management and public metadata inspector.
- Create `apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx`: preprocessing jobs.
- Create `apps/admin-web/src/features/index-publish/IndexPublishPage.tsx`: index publication.
- Create `apps/admin-web/src/features/doctor/DoctorPage.tsx`: Doctor report and JSON export panel.
- Create `apps/admin-web/src/features/settings/SettingsPage.tsx`: ASR/FFmpeg/runtime settings.
- Create `apps/admin-web/src/main.tsx`: Vite/React entry.
- Create `apps/admin-web/src/styles.css`: app-specific layout polish using M3 tokens.
- Create `scripts/visual/check-admin-web-screenshots.ts`: screenshot verification for admin routes.
- Modify `package.json`: add `dev:admin-web`, `build:admin-web`, `visual:admin-web`.
- Modify `README.md`: document admin web commands and product status.
- Modify `docs/spec-traceability.md`: update ADMIN rows to partial/MVP status.
- Create `docs/acceptance/m5-admin-console.md`: acceptance record and screenshot artifact paths.

---

## Task 1: Admin API Contract And Fixture Client

**Files:**

- Create: `apps/admin-web/package.json`
- Create: `apps/admin-web/tsconfig.json`
- Create: `apps/admin-web/index.html`
- Create: `apps/admin-web/src/api.test.ts`
- Create: `apps/admin-web/src/api.ts`
- Modify: `package.json`

**Steps:**

- [x] Add root scripts:

```json
{
  "dev:admin-web": "npm run dev -w @mixlab/admin-web",
  "build:admin-web": "npm run build -w @mixlab/admin-web",
  "visual:admin-web": "tsx scripts/visual/check-admin-web-screenshots.ts"
}
```

- [x] Create `apps/admin-web/package.json` with Vite, React, and `@mixlab/ui-foundation`.
- [x] Create `api.test.ts` first. Tests must prove:
  - `unwrapAdminResponse({ ok: true, data })` returns `data`.
  - `unwrapAdminResponse({ ok: false, error_code, message })` throws a readable error.
  - `createAdminApiClient({ base_url, fetch })` calls `/api/admin/library/status`, `/api/admin/source-videos`, `/api/admin/preprocess/jobs`, `/api/admin/index/versions`, `/api/admin/doctor/report`, and `/api/admin/settings/runtime`.
  - `createFixtureAdminApiClient()` returns counts with ready, failed, and index-required separated.
  - fixture jobs include one failed retryable job and later successful jobs.
  - fixture runtime settings expose `dashscope_api_key_configured: true` but do not contain a real key string.
- [x] Run:

```bash
node --test --import tsx apps/admin-web/src/api.test.ts
```

Expected: fail until `api.ts` exists.

- [x] Implement `api.ts` with:
  - `AdminApiEnvelope<T>`.
  - status/source/jobs/index/doctor/runtime interfaces.
  - `unwrapAdminResponse`.
  - `createAdminApiClient`.
  - `createFixtureAdminApiClient`.
  - `loadAdminDashboardData(client)`.
- [x] Re-run the API test.

Expected: pass.

---

## Task 2: App Navigation And View Model Guards

**Files:**

- Create: `apps/admin-web/src/app/navigation.ts`
- Create: `apps/admin-web/src/app/view-model.ts`
- Create: `apps/admin-web/src/app/view-model.test.ts`

**Steps:**

- [x] Create `view-model.test.ts` first. Tests must prove:
  - navigation includes `仪表盘`, `公共素材库设置`, `原视频管理`, `预处理任务`, `索引发布`, `健康诊断`, `设置`.
  - navigation passes `validateRequiredPages("admin", labels)`.
  - page markup strings reject `hero`, `marketing`, `heavy-dashboard-card`, and `admin-kpi-card-wall`.
  - `adminStatusTone("failed")` returns `failed`.
  - `adminStatusTone("index-required")` returns `warning`.
  - `formatAdminDuration(60000)` returns `01:00`.
  - `redactConfiguredSecret(true)` returns `已配置，已隐藏`.
- [x] Run:

```bash
node --test --import tsx apps/admin-web/src/app/view-model.test.ts
```

Expected: fail until helpers exist.

- [x] Implement `navigation.ts`:
  - `ADMIN_NAV_ITEMS`.
  - `AdminRoute`.
  - `routeFromHash(hash)`.
- [x] Implement `view-model.ts`:
  - `adminStatusTone(status)`.
  - `formatAdminDuration(ms)`.
  - `formatAdminFileSize(bytes)`.
  - `redactConfiguredSecret(configured)`.
  - `assertAdminNavigationContract()`.
- [x] Re-run the view-model test.

Expected: pass.

---

## Task 3: Formal Admin App Pages

**Files:**

- Create: `apps/admin-web/src/app/AdminApp.tsx`
- Create: `apps/admin-web/src/features/dashboard/DashboardPage.tsx`
- Create: `apps/admin-web/src/features/library-settings/LibrarySettingsPage.tsx`
- Create: `apps/admin-web/src/features/source-videos/SourceVideosPage.tsx`
- Create: `apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx`
- Create: `apps/admin-web/src/features/index-publish/IndexPublishPage.tsx`
- Create: `apps/admin-web/src/features/doctor/DoctorPage.tsx`
- Create: `apps/admin-web/src/features/settings/SettingsPage.tsx`
- Create: `apps/admin-web/src/main.tsx`
- Create: `apps/admin-web/src/styles.css`
- Create: `apps/admin-web/src/admin-app.test.ts`

**Steps:**

- [x] Create `admin-app.test.ts` first using `react-dom/server`. Tests must prove:
  - dashboard render includes total, ready, processing, queued, unprocessed, failed, index-required, disk usage, active task, and current index.
  - library settings render root/source-videos/.mixlab-library/library_id/protocol/path checks.
  - source video page render includes cover/public metadata tags/description/lecturer/course/category/cutter visibility.
  - preprocessing jobs render active, queued, completed, failed retry, stage, log path, and error reason.
  - index page render includes current pointer, historical versions, ready count, schema version, validation, and atomic switch copy.
  - Doctor page render includes check rows and `导出诊断 JSON`.
  - settings page render includes DashScope provider/model/audio mode/key configured status/last failure reason and no key value.
- [x] Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts
```

Expected: fail until page components exist.

- [x] Implement `AdminApp.tsx`:
  - imports `@mixlab/ui-foundation/tokens.css` and `layout.css` through `main.tsx`.
  - uses `MacWindow`, `Sidebar`, `UnifiedToolbar`, `InspectorPanel`.
  - loads fixture client by default.
  - routes with hash values: `#/dashboard`, `#/library-settings`, `#/source-videos`, `#/preprocess-jobs`, `#/index-publish`, `#/doctor`, `#/settings`.
  - marks root with `data-admin-web-ready="true"`.
- [x] Implement all feature pages using `@mixlab/ui-foundation` primitives and app CSS.
- [x] Re-run admin app tests.

Expected: pass.

---

## Task 4: Admin Visual Screenshot Verification

**Files:**

- Create: `scripts/visual/check-admin-web-screenshots.ts`
- Create directory on run: `docs/acceptance/artifacts/m5-admin-console`
- Modify: `package.json`

**Steps:**

- [x] Implement the visual script to:
  - start Vite for `apps/admin-web` on `127.0.0.1:4295`.
  - open local Chrome through Playwright.
  - capture each route at `1536x1024`:
    - `dashboard.png`
    - `library-settings.png`
    - `source-videos.png`
    - `preprocess-jobs.png`
    - `index-publish.png`
    - `doctor.png`
    - `settings.png`
  - assert every page has `.ml-window`, `.ml-sidebar`, `.ml-toolbar`.
  - assert dashboard has `Ready`, `Failed`, and `Index Required`.
  - assert source videos page has public metadata fields.
  - assert jobs page has failed/retry and later success visibility.
  - assert Doctor page has export JSON.
  - assert settings page does not include `sk-`.
  - always shut down Vite.
- [x] Run:

```bash
npm run visual:admin-web
```

Expected: screenshots are created and checks pass.

---

## Task 5: Docs, Final Verification, And Commit

**Files:**

- Modify: `README.md`
- Modify: `docs/spec-traceability.md`
- Create: `docs/acceptance/m5-admin-console.md`
- Modify: `docs/superpowers/plans/2026-05-02-m5-admin-console.md`

**Steps:**

- [x] Update README current implementation status with `apps/admin-web` and admin visual command.
- [x] Update traceability:
  - `ADMIN-001` through `ADMIN-007` become `partial` with “M5 admin web MVP exists; backend write orchestration remains later.”
  - keep acceptance text honest where real backend or filesystem writes are not implemented.
- [x] Create `m5-admin-console.md` with scope, not-implemented list, screenshot artifact paths, verification commands, and known remaining work.
- [x] Run:

```bash
npm run typecheck
npm test
npm run build:cutter-web
npm run build:ui-fixtures
npm run build:admin-web
npm run visual:ui-foundation
npm run visual:admin-web
```

Expected: all pass.

- [x] Mark all M5 plan checkboxes complete.
- [x] Commit:

```bash
git add .
git commit -m "feat: add M5 admin console MVP"
```

Expected: commit succeeds on `codex/m5-admin-console`.

---

## Stop Conditions

Stop and report only if:

- M5 implementation would require real Go backend writes or public-library mutation.
- The admin UI exposes any real API key or secret value.
- A page cannot map to `08`, `18`, `19`, `21`, or `22`.
- Screenshot verification cannot launch local Chrome.
- Full verification fails after implementation and the failure cannot be localized.

