# M14.4 Cutter Real Cut Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make real API-mode cutter submissions automatically run local FFmpeg cut jobs until the queue is empty, then refresh local reusable materials.

**Architecture:** Add a small cutter-web pipeline helper that drives `runNextCutJob()` sequentially and reports Chinese UI state. Keep `CutterApp` as the orchestration owner: after submitting a cut job it starts the pipeline, refreshes queue/local clips, and passes pipeline state to `CutQueuePage`. Do not add a daemon, concurrency, cancellation, or priority controls in this milestone.

**Tech Stack:** React, TypeScript, node:test, Vite cutter web, Playwright smoke.

---

### Task 1: Cut Pipeline State Helper

**Files:**
- Create: `/Users/allen/Documents/mixlab/apps/cutter-web/src/state/cut-pipeline.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-state.test.ts`

- [x] **Step 1:** Add failing tests for pipeline state labels and sequential run behavior:

```ts
import {
  cutPipelineDetailLabel,
  cutPipelineStatusLabel,
  idleCutPipelineState,
  runCutPipeline
} from "./state/cut-pipeline.ts";

test("cut pipeline labels expose Chinese running, completed, failed and idle states", () => {
  assert.equal(cutPipelineStatusLabel(idleCutPipelineState), "本机剪切空闲");
  assert.equal(cutPipelineStatusLabel({ ...idleCutPipelineState, status: "running" }), "本机剪切运行中");
  assert.equal(cutPipelineStatusLabel({ ...idleCutPipelineState, status: "completed" }), "本机剪切已完成");
  assert.equal(cutPipelineStatusLabel({ ...idleCutPipelineState, status: "failed" }), "本机剪切失败");
  assert.equal(
    cutPipelineDetailLabel({
      status: "completed",
      processed_count: 3,
      done_count: 2,
      failed_count: 1,
      message: "本机剪切已完成",
      last_updated_label: "刚刚更新"
    }),
    "已处理 3 个任务，完成 2 个，失败 1 个。"
  );
});

test("cut pipeline runs pending jobs sequentially and refreshes local clips after completed jobs", async () => {
  const states: string[] = [];
  let queueRefreshes = 0;
  let localRefreshes = 0;
  const jobs = [
    {
      cut_job_id: "CJ20260504-0001",
      clip_list_id: "CL20260504-0001",
      status: "failed" as const,
      source_video_id: "V000001",
      begin_ms: 1000,
      end_ms: 2000
    },
    {
      cut_job_id: "CJ20260504-0002",
      clip_list_id: "CL20260504-0001",
      status: "done" as const,
      source_video_id: "V000001",
      begin_ms: 3000,
      end_ms: 5000,
      export_clip_id: "E000001"
    },
    null
  ];

  const result = await runCutPipeline({
    runNextCutJob: async () => jobs.shift() ?? null,
    refreshQueueJobs: async () => {
      queueRefreshes += 1;
    },
    refreshLocalClips: async () => {
      localRefreshes += 1;
    },
    onState(state) {
      states.push(cutPipelineStatusLabel(state));
    }
  });

  assert.equal(result.status, "completed");
  assert.equal(result.processed_count, 2);
  assert.equal(result.done_count, 1);
  assert.equal(result.failed_count, 1);
  assert.equal(queueRefreshes, 2);
  assert.equal(localRefreshes, 1);
  assert.deepEqual(states, ["本机剪切运行中", "本机剪切运行中", "本机剪切运行中", "本机剪切已完成"]);
});
```

- [x] **Step 2:** Run `node --test --import tsx apps/cutter-web/src/cutter-state.test.ts` and confirm failure because `cut-pipeline.ts` does not exist.
- [x] **Step 3:** Implement `CutPipelineState`, `idleCutPipelineState`, `cutPipelineStatusLabel`, `cutPipelineDetailLabel`, and `runCutPipeline`.
- [x] **Step 4:** Re-run focused state tests.

### Task 2: Cut Queue Pipeline Visibility

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/cut-queue/CutQueuePage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/styles.css`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [x] **Step 1:** Add failing render assertions that `CutQueuePage` shows Chinese pipeline state and uses the user-facing fallback action `继续剪切` instead of `执行下一个`:

```ts
const html = renderToStaticMarkup(
  h(CutQueuePage, {
    jobs: data.queue,
    autoRefreshEnabled: true,
    lastUpdatedLabel: "刚刚更新",
    pipelineState: {
      status: "running",
      processed_count: 1,
      done_count: 1,
      failed_count: 0,
      message: "本机剪切运行中",
      last_updated_label: "刚刚更新"
    },
    onRunNext: () => undefined
  })
);

for (const text of ["本机剪切运行中", "已处理 1 个任务", "继续剪切"]) {
  assert.match(html, new RegExp(text));
}
assert.equal(html.includes("执行下一个"), false);
```

- [x] **Step 2:** Run `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts` and confirm failure.
- [x] **Step 3:** Add `pipelineState?: CutPipelineState` prop, render `cutPipelineStatusLabel()` and `cutPipelineDetailLabel()`, and change the manual fallback button label to `继续剪切`.
- [x] **Step 4:** Add minimal CSS for the pipeline status card.
- [x] **Step 5:** Re-run cutter app tests.

### Task 3: CutterApp Pipeline Orchestration

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [x] **Step 1:** Add pure helper tests for pipeline notices exported from `CutterApp.tsx`:

```ts
import { cutNoticeForPipelineResult } from "./app/CutterApp.tsx";

assert.equal(
  cutNoticeForPipelineResult({
    status: "completed",
    processed_count: 2,
    done_count: 2,
    failed_count: 0,
    message: "本机剪切已完成",
    last_updated_label: "刚刚更新"
  }),
  "剪切完成 · 本地素材已更新 2"
);
assert.equal(
  cutNoticeForPipelineResult({
    status: "completed",
    processed_count: 2,
    done_count: 1,
    failed_count: 1,
    message: "本机剪切已完成",
    last_updated_label: "刚刚更新"
  }),
  "剪切完成 1 个 · 失败 1 个"
);
```

- [x] **Step 2:** Run cutter app tests and confirm failure.
- [x] **Step 3:** Import `useRef`, `runCutPipeline`, `idleCutPipelineState`, and `CutPipelineState`.
- [x] **Step 4:** Add `cutPipelineRunningRef` and `cutPipelineState` in `CutterApp`.
- [x] **Step 5:** Implement `runRealCutPipeline()` with a ref guard. It should skip fixture mode and login-gated state, call `runCutPipeline()`, update state via `onState`, set completion notice, refresh queue, and surface Chinese errors.
- [x] **Step 6:** After successful direct cut and bulk cut submission in API mode, call `void runRealCutPipeline()`.
- [x] **Step 7:** Pass `pipelineState` and `onRunNext={runRealCutPipeline}` into `CutQueuePage`.
- [x] **Step 8:** Re-run focused app tests.

### Task 4: Runtime API Safety

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/api.test.ts`
- Read: `/Users/allen/Documents/mixlab/apps/cutter-web/src/api.ts`

- [x] **Step 1:** Add a focused API client test confirming `runNextCutJob()` still sends cutter auth headers and handles `null` responses:

```ts
let observedDevice = "";
let observedSession = "";
const client = createCutterApiClient({
  base_url: "http://127.0.0.1:3789",
  auth: {
    device_id: "device-001",
    session_token: "session-001"
  },
  fetch: async (url, init) => {
    assert.equal(String(url), "http://127.0.0.1:3789/cutter/cut-jobs/run-next");
    const headers = new Headers(init?.headers);
    observedDevice = headers.get("X-MixLab-Device-Id") ?? "";
    observedSession = headers.get("X-MixLab-Session-Token") ?? "";
    return makeJsonResponse({ schema_version: "1.0", data: null });
  }
});

assert.equal(await client.runNextCutJob(), null);
assert.equal(observedDevice, "device-001");
assert.equal(observedSession, "session-001");
```

- [x] **Step 2:** Run `node --test --import tsx apps/cutter-web/src/api.test.ts` and confirm pass or implement the minimal client fix if it fails.

### Task 5: Verification And Browser Smoke

**Files:** read-only unless failures require targeted fixes.

- [x] **Step 1:** Run `node --test --import tsx apps/cutter-web/src/cutter-state.test.ts`.
- [x] **Step 2:** Run `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts`.
- [x] **Step 3:** Run `node --test --import tsx apps/cutter-web/src/api.test.ts`.
- [x] **Step 4:** Run `npm run typecheck`.
- [x] **Step 5:** Run `npm test`.
- [x] **Step 6:** Run `npm run build:cutter-web`.
- [x] **Step 7:** Run `git diff --check`.
- [x] **Step 8:** Run fixture smoke for UI continuity: cut from `#material-locator`, wait for completed local material, verify local section remains first.
- [x] **Step 9:** Run real API smoke with a temporary library/workspace and injected fast cut runner when possible; otherwise document the blocker and run package-level Cutter API tests that cover `run-next`.
