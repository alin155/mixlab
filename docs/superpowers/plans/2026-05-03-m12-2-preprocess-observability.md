# M12.2 Preprocess Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the admin preprocessing page into a readable production monitor for long-running video preprocessing.

**Architecture:** Extend the Admin API preprocess job snapshot with computed observability fields, then render those fields in the admin web preprocessing page. Keep manifest protocol unchanged and keep production actions centralized in the dashboard/preprocess flow.

**Tech Stack:** TypeScript, React server-render tests, Node test runner, local Admin API, MixLab library manifests.

---

### Task 1: API Contract And Smart Scan Tests

**Files:**
- Modify: `apps/admin-web/src/api.ts`
- Modify: `apps/admin-web/src/admin-app.test.ts`
- Modify: `packages/admin-api/src/index.test.ts`

- [ ] Add failing frontend tests asserting preprocess jobs expose and render observability language: `流水线总览`, `当前处理视频`, `预计剩余`, `预计完成`, `负荷建议`.
- [ ] Add failing API test asserting `/api/admin/preprocess/jobs` returns queue positions, Chinese labels, elapsed time, estimated start/done times, and observability summary.
- [ ] Add failing smart scan test asserting blocked runtime load recommends system-risk handling before starting more preprocessing.

### Task 2: Backend Preprocess Snapshot

**Files:**
- Modify: `packages/admin-api/src/index.ts`

- [ ] Extend `PreprocessJobsResponse` job rows with status/stage labels, queue position, estimated start/done, and estimated remaining.
- [ ] Add `observability` to preprocess jobs response with running job, pipeline progress, all-done estimate, queue duration estimate, throughput label, and load advice.
- [ ] Compute elapsed from job timestamps and current time instead of returning `0`.
- [ ] Keep raw log path in API for diagnostics but keep UI from showing it.

### Task 3: Frontend Type And Product Rendering

**Files:**
- Modify: `apps/admin-web/src/api.ts`
- Modify: `apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx`
- Modify: `apps/admin-web/src/features/shared.tsx`
- Modify: `apps/admin-web/src/styles.css`

- [ ] Add typed fields for job observability.
- [ ] Render `流水线总览` and `当前处理视频`.
- [ ] Update queue row copy to use queue position and estimated start instead of internal stage.
- [ ] Render load advice in the right inspector.
- [ ] Ensure visible labels remain Chinese.

### Task 4: Verification

**Files:**
- Modify: relevant tests only if behavior changes require updated expectations.

- [ ] Run focused admin web tests.
- [ ] Run focused admin API tests.
- [ ] Run `git diff --check`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Browser-check dashboard and preprocess pages against the running local app.
