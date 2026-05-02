# M8 Cutter Workspace UI Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind the cutter workbench cut-list, cut-queue, and local-library pages to the M7 workspace API while preserving fixture-mode visual review.

**Architecture:** Keep the Apple-HIG cutter UI components from M4. Add a small API-mapping layer in `apps/cutter-web/src/state/` so React components consume the existing UI state shape, while runtime mode submits real `clip-list.json` rows and reads real cut jobs/local exports through `CutterApiClient`. Fixture mode remains deterministic for screenshots.

**Tech Stack:** React 19, TypeScript, Node test runner, existing `@mixlab/cutter-api`, `@mixlab/cutter-local`, and `@mixlab/ui-foundation`.

---

## Scope Contract

This step:

- M8: Cutter Workspace UI Binding.

Spec sources:

- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/09_剪辑师工作台规格.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/10_搜索与文案阅读器规格.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/11_本地剪切与导出规格.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/14_验收标准与测试剧本.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/18_API接口草案.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/21_视觉与交互设计规范.md`

Traceability IDs:

- `PROD-002`, `PROD-003`
- `CUTTER-001`, `CUTTER-005`, `CUTTER-006`, `CUTTER-007`
- `ACC-006`, `ACC-007`

Explicitly not doing:

- Desktop/Tauri packaging.
- Native reveal/open-file commands.
- Multi-worker queue scheduler.
- New visual direction or page redesign.
- Admin backend persistence.

Acceptance:

- In API mode, submitting the cut list calls `/cutter/clip-lists` and `/cutter/cut-jobs`, not only local fixture state.
- In API mode, queue page reads `/cutter/cut-jobs` and local library reads `/cutter/local-clips`.
- In fixture mode, existing visual screenshots remain stable and useful.
- Source browsing/search stays non-blocking and remains ready-only.

---

## File Structure

- Modify `packages/cutter-api/src/index.ts`: include `library_id` in `/cutter/source-library` so the UI can write traceable clip lists.
- Modify `packages/cutter-api/src/index.test.ts`: assert the `library_id` is exposed.
- Modify `apps/cutter-web/src/api.ts`: add optional `library_id` to `SourceLibraryResponse`.
- Modify `apps/cutter-web/src/state/cut-list.ts`: persist `source_relative_path` in UI cut-list rows and add `toCreateClipListRequest`.
- Modify `apps/cutter-web/src/state/cut-queue.ts`: add API-to-UI queue mapping.
- Modify `apps/cutter-web/src/state/*.test.ts`: TDD coverage for mapping and request construction.
- Modify `apps/cutter-web/src/features/cut-queue/CutQueuePage.tsx`: add optional refresh/run-next controls without changing the page structure.
- Modify `apps/cutter-web/src/app/CutterApp.tsx`: detect fixture/API mode, submit real clip lists, load real jobs, run next job, refresh local library.
- Modify `apps/cutter-web/src/fixture-client.ts`: provide fixture `library_id` and keep new APIs deterministic.
- Modify `README.md`, `docs/spec-traceability.md`, and create `docs/acceptance/m8-cutter-workspace-ui-binding.md`.

---

### Task 1: Public Library ID For Cutter UI

**Files:**

- Modify: `packages/cutter-api/src/index.ts`
- Modify: `packages/cutter-api/src/index.test.ts`
- Modify: `apps/cutter-web/src/api.ts`
- Modify: `apps/cutter-web/src/fixture-client.ts`

- [ ] **Step 1: Write failing API/client assertions**

Add assertions:

```ts
assert.equal(catalog.data.library_id, "lib_main_001");
```

and add `library_id?: string` to the expected cutter web `SourceLibraryResponse` test fixture.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node --test --import tsx packages/cutter-api/src/index.test.ts apps/cutter-web/src/api.test.ts
```

Expected: fails because `/cutter/source-library` does not expose `library_id`.

- [ ] **Step 3: Implement library id exposure**

Reuse the existing server helper that reads `.mixlab-library/library.json` and add `library_id` to the `/cutter/source-library` JSON response. Update TS client types and fixture data.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
node --test --import tsx packages/cutter-api/src/index.test.ts apps/cutter-web/src/api.test.ts
```

Expected: pass.

### Task 2: Cut-List Request Mapping

**Files:**

- Modify: `apps/cutter-web/src/state/cut-list.ts`
- Modify: `apps/cutter-web/src/cutter-state.test.ts`

- [ ] **Step 1: Write failing mapping tests**

Add tests:

```ts
const request = toCreateClipListRequest({
  libraryId: "lib_main_001",
  title: "待剪清单",
  items: [cut]
});
assert.equal(request.items[0].source_relative_path, "source-videos/cashflow.mp4");
assert.equal(request.items[0].begin_ms, 10000);
assert.equal(request.items[0].selected_text.includes("现金流"), true);
```

- [ ] **Step 2: Run state tests and verify RED**

Run:

```bash
node --test --import tsx apps/cutter-web/src/cutter-state.test.ts
```

Expected: fails because `source_relative_path` and `toCreateClipListRequest` are missing.

- [ ] **Step 3: Implement request mapping**

Add `source_relative_path` to `CutListItem`, set it from `SourceVideoCard.relative_path`, and implement:

```ts
toCreateClipListRequest(input: {
  libraryId: string;
  title: string;
  items: readonly CutListItem[];
}): CreateClipListRequest
```

Sort rows by `order`, preserve cut mode and rolls, and throw when a row lacks a portable source relative path.

- [ ] **Step 4: Run state tests and verify GREEN**

Run:

```bash
node --test --import tsx apps/cutter-web/src/cutter-state.test.ts
```

Expected: pass.

### Task 3: Cut-Queue API Mapping

**Files:**

- Modify: `apps/cutter-web/src/state/cut-queue.ts`
- Modify: `apps/cutter-web/src/cutter-state.test.ts`

- [ ] **Step 1: Write failing queue mapping tests**

Add tests:

```ts
const jobs = mapApiCutJobsToQueueJobs({ jobs: [apiDoneJob, apiFailedJob] });
assert.equal(jobs[0].queue_job_id, "CJ20260502-0001");
assert.equal(jobs[0].status, "done");
assert.equal(jobs[0].progress, 100);
assert.equal(jobs[1].error_message, "ffmpeg failed");
```

- [ ] **Step 2: Run state tests and verify RED**

Run:

```bash
node --test --import tsx apps/cutter-web/src/cutter-state.test.ts
```

Expected: fails because the API queue mapper is missing.

- [ ] **Step 3: Implement queue mapping**

Add:

```ts
mapApiCutJobsToQueueJobs(catalog: CutJobCatalog): CutQueueJob[]
```

Map API statuses to progress: `pending=0`, `running=50`, `done=100`, `failed=0`, `cancelled=0`. Keep source traceability and fallback labels readable.

- [ ] **Step 4: Run state tests and verify GREEN**

Run:

```bash
node --test --import tsx apps/cutter-web/src/cutter-state.test.ts
```

Expected: pass.

### Task 4: Queue Page Controls

**Files:**

- Modify: `apps/cutter-web/src/features/cut-queue/CutQueuePage.tsx`
- Modify: `apps/cutter-web/src/cutter-app.test.ts`

- [ ] **Step 1: Write failing render test**

Add a test render with `onRefresh` and `onRunNext`, then assert:

```ts
assert.match(html, /刷新队列/);
assert.match(html, /执行下一个/);
```

- [ ] **Step 2: Run render tests and verify RED**

Run:

```bash
node --test --import tsx apps/cutter-web/src/cutter-app.test.ts
```

Expected: fails because the buttons are not rendered.

- [ ] **Step 3: Add optional controls**

Add optional `onRefresh` and `onRunNext` props. Render buttons in the existing header button group only when handlers are provided.

- [ ] **Step 4: Run render tests and verify GREEN**

Run:

```bash
node --test --import tsx apps/cutter-web/src/cutter-app.test.ts
```

Expected: pass.

### Task 5: CutterApp Runtime Binding

**Files:**

- Modify: `apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `apps/cutter-web/src/fixture-client.ts`
- Test: existing app/state/client tests.

- [ ] **Step 1: Write failing behavior-oriented tests where practical**

Use state tests for request/queue mapping and component render tests for queue controls. This app has no DOM interaction test harness; build/typecheck will verify the React integration.

- [ ] **Step 2: Implement API-mode behavior**

In `CutterApp`:

- Detect API mode from `VITE_MIXLAB_CUTTER_API_BASE_URL`.
- Do not seed demo cut-list/queue in API mode.
- On load, call `client.listCutJobs()` and map to UI jobs.
- On submit, call `client.createClipList(toCreateClipListRequest(...))`, then `client.submitCutJobs(...)`, then refresh jobs.
- On run-next, call `client.runNextCutJob()`, refresh jobs, and refresh local clips.
- On local-clip refresh, update `data.localClips` without reloading source library/search.
- Keep fixture mode exactly as visual-preview friendly as before.

- [ ] **Step 3: Run targeted checks**

Run:

```bash
node --test --import tsx apps/cutter-web/src/cutter-state.test.ts apps/cutter-web/src/cutter-app.test.ts apps/cutter-web/src/api.test.ts
npm run typecheck
```

Expected: pass.

### Task 6: Documentation And Acceptance

**Files:**

- Modify: `README.md`
- Modify: `docs/spec-traceability.md`
- Create: `docs/acceptance/m8-cutter-workspace-ui-binding.md`

- [ ] **Step 1: Update docs**

Document that `VITE_MIXLAB_CUTTER_API_BASE_URL` now binds cut-list submission, queue refresh/run-next, and local library refresh to the M7 API.

- [ ] **Step 2: Update traceability**

Update:

- `CUTTER-005`: accepted with UI-to-API submit binding.
- `CUTTER-006`: accepted with UI queue refresh/run-next binding.
- `CUTTER-007`: partial or accepted depending on native reveal/open remaining.
- `ACC-006`: partial with UI/API automated evidence.
- `ACC-007`: partial with UI/API automated evidence.

- [ ] **Step 3: Create acceptance record**

Record commands, scope, explicit non-scope, and remaining Tauri/native work.

### Task 7: Full Verification And Commit

**Files:**

- All touched files.

- [ ] **Step 1: Run verification**

Run:

```bash
npm run typecheck
npm test
npm run build:cutter-web
npm run build:admin-web
npm run build:ui-fixtures
npm run visual:ui-foundation
npm run visual:admin-web
npm run visual:cutter-web
git diff --check
```

Expected: pass.

- [ ] **Step 2: Review and scan**

Run:

```bash
git diff --stat
rg -n "sk-<real-key-prefix>|<real-key-fingerprint>|<real-dashscope-key>" .
```

Expected: no real DashScope key fingerprint appears.

- [ ] **Step 3: Commit**

Run:

```bash
git add README.md apps/cutter-web docs packages/cutter-api
git commit -m "feat: bind cutter workspace UI to queue API"
```

Expected: commit succeeds on `codex/m8-cutter-workspace-ui-binding`.

---

## Self-Review

Spec coverage:

- `09` is covered by binding independent cut-list, cut-queue, and local-library pages to real workspace APIs.
- `10` is preserved because source detail/search routes are untouched and remain non-blocking.
- `11` is covered by cut-list submission, queue execution controls, and local export refresh.
- `14` sections 6 and 7 are covered by automated UI/API evidence; manual desktop acceptance remains later.
- `18` is covered by API route consumption from the cutter web client.
- `21` is preserved because no visual redesign is introduced.

Placeholder scan:

- No placeholders or future-only implementation steps are required for this milestone.

Type consistency:

- UI cut-list rows keep `cut_list_item_id`; API clip-list rows use M7 `source_relative_path`, segment ids, selected text, and cut mode.
- UI queue rows keep `queue_job_id`; API jobs use `cut_job_id` and are mapped at the boundary.
