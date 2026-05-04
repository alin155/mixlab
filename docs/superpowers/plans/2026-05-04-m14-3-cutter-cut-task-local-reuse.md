# M14.3 Cutter Cut Task Local Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Complete the cutter-side loop where submitted cut jobs keep refreshing, completed jobs update the local material library, and new local clips participate in material locator search.

**Architecture:** Add small state helpers for cut job refresh decisions, queue summaries, and fixture local clip creation. Keep `CutterApp` as the orchestration owner for API polling and fixture-mode simulation. Keep M14.1 navigation unchanged and enhance the existing `素材定位`, `剪切任务`, and `本地素材库` pages only.

**Tech Stack:** React, TypeScript, node:test, Vite cutter web, Playwright fixture smoke.

---

### Task 1: Cut Task Refresh State Helpers

**Files:**
- Create: `/Users/allen/Documents/mixlab/apps/cutter-web/src/state/cut-task-refresh.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-state.test.ts`

- [x] **Step 1:** Add failing tests for queue summary and refresh decisions:

```ts
import {
  cutQueueSummary,
  hasActiveCutJobs,
  shouldAutoRefreshCutJobs,
  shouldRefreshLocalClipsAfterQueueUpdate
} from "./state/cut-task-refresh.ts";

test("cut task refresh helpers summarize jobs and refresh only useful cutter routes", () => {
  const jobs = [
    item({ cut_list_item_id: "cut-a", order: 1 }),
    item({ cut_list_item_id: "cut-b", order: 2 })
  ];
  const queue = createQueueJobsFromCutList(jobs, { createdAt: "2026-05-04T10:00:00.000Z" });
  const activeQueue = [
    { ...queue[0]!, status: "pending" as const, progress: 0 },
    { ...queue[1]!, status: "running" as const, progress: 50 }
  ];

  assert.deepEqual(cutQueueSummary(activeQueue), {
    pending: 1,
    running: 1,
    done: 0,
    failed: 0,
    cancelled: 0,
    total: 2
  });
  assert.equal(hasActiveCutJobs(activeQueue), true);
  assert.equal(hasActiveCutJobs([{ ...activeQueue[0]!, status: "done", progress: 100 }]), false);
  assert.equal(
    shouldAutoRefreshCutJobs({
      apiMode: true,
      hasData: true,
      loginGateVisible: false,
      route: "material-locator",
      hasSubmittedCutJobs: true,
      jobs: []
    }),
    true
  );
  assert.equal(
    shouldAutoRefreshCutJobs({
      apiMode: true,
      hasData: true,
      loginGateVisible: false,
      route: "settings",
      hasSubmittedCutJobs: true,
      jobs: activeQueue
    }),
    false
  );
});

test("local clips refresh only when queue gains completed jobs", () => {
  const queue = createQueueJobsFromCutList([item({ cut_list_item_id: "cut-a", order: 1 })], {
    createdAt: "2026-05-04T10:00:00.000Z"
  });

  assert.equal(
    shouldRefreshLocalClipsAfterQueueUpdate(queue, [
      { ...queue[0]!, status: "done", progress: 100 }
    ]),
    true
  );
  assert.equal(
    shouldRefreshLocalClipsAfterQueueUpdate([{ ...queue[0]!, status: "done", progress: 100 }], [
      { ...queue[0]!, status: "done", progress: 100 }
    ]),
    false
  );
});
```

- [x] **Step 2:** Run `node --test --import tsx apps/cutter-web/src/cutter-state.test.ts` and confirm failure because `cut-task-refresh.ts` is missing.
- [x] **Step 3:** Implement `cutQueueSummary`, `hasActiveCutJobs`, `shouldAutoRefreshCutJobs`, and `shouldRefreshLocalClipsAfterQueueUpdate`.
- [x] **Step 4:** Re-run focused state tests.

### Task 2: Fixture Local Clip Completion Helpers

**Files:**
- Create: `/Users/allen/Documents/mixlab/apps/cutter-web/src/state/local-clip-reuse.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-state.test.ts`

- [x] **Step 1:** Add failing tests proving a completed cut-list item becomes a searchable local clip and duplicate ids are not appended twice:

```ts
import {
  appendCompletedLocalClip,
  localClipFromCutListItem
} from "./state/local-clip-reuse.ts";

test("completed cut-list items become local clips for reuse search", () => {
  const cut = createCutListItemFromSegments({
    sourceVideo,
    segments: transcriptSegments.slice(0, 2),
    cutMode: "smart",
    title: "现金流安全片段"
  });
  const clip = localClipFromCutListItem(cut, "clip-finished-001");

  assert.equal(clip.local_clip_id, "clip-finished-001");
  assert.equal(clip.title, "现金流安全片段");
  assert.equal(clip.source_title, "现金流管理与风险控制");
  assert.equal(clip.selected_text.includes("现金流"), true);
  assert.equal(clip.duration_ms, 11_400);

  const catalog = appendCompletedLocalClip({ local_clip_count: 0, clips: [] }, clip);
  assert.equal(catalog.local_clip_count, 1);
  assert.equal(appendCompletedLocalClip(catalog, clip).local_clip_count, 1);
});
```

- [x] **Step 2:** Run focused state tests and confirm failure.
- [x] **Step 3:** Implement helpers in `local-clip-reuse.ts`.
- [x] **Step 4:** Re-run focused state tests.

### Task 3: Cut Queue Page Production Visibility

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/cut-queue/CutQueuePage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/styles.css`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [x] **Step 1:** Add failing render tests asserting the cut task page displays summary counts and auto-refresh language when supplied:

```ts
const html = renderToStaticMarkup(
  h(CutQueuePage, {
    jobs: data.queue,
    autoRefreshEnabled: true,
    lastUpdatedLabel: "刚刚更新"
  })
);

for (const text of ["等待中", "剪切中", "已完成", "失败", "自动刷新", "刚刚更新"]) {
  assert.match(html, new RegExp(text));
}
```

- [x] **Step 2:** Run `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` and confirm failure.
- [x] **Step 3:** Add `autoRefreshEnabled?: boolean` and `lastUpdatedLabel?: string` props, render summary cards via `cutQueueSummary`, and add minimal CSS.
- [x] **Step 4:** Re-run cutter app tests.

### Task 4: CutterApp API Auto Refresh And Local Clip Refresh

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [x] **Step 1:** Add failing pure helper tests importing `cutNoticeForCompletedLocalClips` from `CutterApp.tsx`:

```ts
assert.equal(cutNoticeForCompletedLocalClips(1), "剪切完成 · 本地素材已更新 1");
assert.equal(cutNoticeForCompletedLocalClips(0), "");
```

- [x] **Step 2:** Run cutter app tests and confirm failure.
- [x] **Step 3:** Implement `cutNoticeForCompletedLocalClips`.
- [x] **Step 4:** In API mode, set `hasSubmittedCutJobs` after successful submission. Add an interval effect using `shouldAutoRefreshCutJobs` that refreshes jobs while on `material-locator` or `cut-tasks`. When `shouldRefreshLocalClipsAfterQueueUpdate` is true, call `refreshLocalClips`.
- [x] **Step 5:** Pass `autoRefreshEnabled` and `lastUpdatedLabel` to `CutQueuePage`.
- [x] **Step 6:** Re-run cutter app tests.

### Task 5: Fixture Mode Completion Simulation

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [x] **Step 1:** Add failing tests that `appendCompletedLocalClip` output participates in `buildMaterialLocatorSections` before public results.
- [x] **Step 2:** Run focused tests and confirm failure if Task 2 helpers are not wired into the test.
- [x] **Step 3:** In fixture mode direct cut, enqueue the pending job, then use short timers to mark it running and done. On done, append a local clip using `localClipFromCutListItem` and show `cutNoticeForCompletedLocalClips(1)`.
- [x] **Step 4:** Re-run focused tests.

### Task 6: Verification And Browser Smoke

**Files:** read-only unless failures require targeted fixes.

- [x] **Step 1:** Run `node --test --import tsx apps/cutter-web/src/cutter-state.test.ts`.
- [x] **Step 2:** Run `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts`.
- [x] **Step 3:** Run `npm run typecheck`.
- [x] **Step 4:** Run `npm test`.
- [x] **Step 5:** Run `npm run build:cutter-web`.
- [x] **Step 6:** Run `git diff --check`.
- [x] **Step 7:** Run a fixture-mode Playwright smoke test: open `#material-locator`, cut a selected span, wait for `剪切完成 · 本地素材已更新 1`, verify `#local-library` count increases, then search the selected phrase and verify the `本地素材` section appears before `公共原素材`.
