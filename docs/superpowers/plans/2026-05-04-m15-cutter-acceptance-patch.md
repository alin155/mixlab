# M15 Cutter Acceptance Patch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the real cutter workflow easier to accept-test by adding real failed cut retry, clearer task diagnosis, and verified UI feedback.

**Architecture:** Add retry as a workspace-local cut queue operation, expose it through Cutter API with the same cutter-session guard, wire it into the cutter-web API client and task page, then extend tests and smoke coverage. Keep retry scoped to failed jobs only; reuse the existing front-end-driven cut pipeline after a retry.

**Tech Stack:** TypeScript, Node HTTP server, React, node:test, Playwright smoke, bundled FFmpeg.

---

### Task 1: Cutter Local Retry Primitive

**Files:**
- Modify: `/Users/allen/Documents/mixlab/packages/cutter-local/src/cut-queue.ts`
- Modify: `/Users/allen/Documents/mixlab/packages/cutter-local/src/cut-queue.test.ts`
- Modify: `/Users/allen/Documents/mixlab/packages/cutter-local/src/index.ts`

- [x] **Step 1: Add failing tests for retrying failed jobs**

Add tests in `/Users/allen/Documents/mixlab/packages/cutter-local/src/cut-queue.test.ts`:

```ts
test("retries failed cut jobs by returning them to pending", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-retry-");
  const clipList = await makeClipList(workspaceRoot);
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-04T10:00:00.000Z"
  });

  const failed = await runNextCutJob({
    workspace_root: workspaceRoot,
    library_root: workspaceRoot,
    now: () => "2026-05-04T10:01:00.000Z",
    resolve_source: () => ({
      source_video_id: "V000001",
      title: "现金流",
      relative_path: "source-videos/01.mp4",
      source_video_file_path: "/missing/source.mp4"
    }),
    cut_runner: () => {
      throw new Error("ffmpeg failed");
    }
  });

  assert.equal(failed?.status, "failed");
  assert.match(failed?.error_message ?? "", /ffmpeg failed/);

  const retried = await retryCutJob({
    workspace_root: workspaceRoot,
    cut_job_id: failed!.cut_job_id,
    now: "2026-05-04T10:02:00.000Z"
  });

  assert.equal(retried.status, "pending");
  assert.equal(retried.error_message, undefined);
  assert.equal(retried.started_at, undefined);
  assert.equal(retried.finished_at, undefined);
  assert.equal(retried.export_clip_id, undefined);
  assert.equal(retried.output_file, undefined);
  assert.equal(retried.updated_at, "2026-05-04T10:02:00.000Z");
});

test("retry rejects non-failed cut jobs", async () => {
  const workspaceRoot = await makeRoot("mixlab-cutter-local-retry-non-failed-");
  const clipList = await makeClipList(workspaceRoot);
  const submission = await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: "2026-05-04T10:00:00.000Z"
  });

  await assert.rejects(
    () =>
      retryCutJob({
        workspace_root: workspaceRoot,
        cut_job_id: submission.jobs[0]!.cut_job_id,
        now: "2026-05-04T10:01:00.000Z"
      }),
    /only failed cut jobs can be retried/
  );
});
```

- [x] **Step 2: Run focused test and verify RED**

Run:

```bash
node --test --import tsx packages/cutter-local/src/cut-queue.test.ts
```

Expected: fails because `retryCutJob` is not implemented or exported.

- [x] **Step 3: Implement retryCutJob**

Add to `/Users/allen/Documents/mixlab/packages/cutter-local/src/cut-queue.ts`:

```ts
export interface RetryCutJobInput {
  workspace_root: string;
  cut_job_id: string;
  now: string;
}

export async function retryCutJob(input: RetryCutJobInput): Promise<CutJobManifest> {
  const job = await getCutJob({
    workspace_root: input.workspace_root,
    cut_job_id: input.cut_job_id
  });

  if (!job) {
    throw new Error("cut job not found");
  }

  if (job.status !== "failed") {
    throw new Error("only failed cut jobs can be retried");
  }

  const retried: CutJobManifest = {
    ...job,
    status: "pending",
    updated_at: input.now,
    started_at: undefined,
    finished_at: undefined,
    error_message: undefined,
    export_clip_id: undefined,
    output_file: undefined
  };
  await writeCutJob(input.workspace_root, retried);
  return retried;
}
```

Export `retryCutJob` and `RetryCutJobInput` from `/Users/allen/Documents/mixlab/packages/cutter-local/src/index.ts`.

- [x] **Step 4: Re-run focused test and verify GREEN**

Run:

```bash
node --test --import tsx packages/cutter-local/src/cut-queue.test.ts
```

Expected: all cutter-local cut queue tests pass.

### Task 2: Cutter API and Client Retry Endpoint

**Files:**
- Modify: `/Users/allen/Documents/mixlab/packages/cutter-api/src/index.ts`
- Modify: `/Users/allen/Documents/mixlab/packages/cutter-api/src/index.test.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/api.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/api.test.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/fixture-client.ts`

- [x] **Step 1: Add failing Cutter API endpoint tests**

Add an API test that creates a failed job, calls `POST /cutter/cut-jobs/:id/retry`, and asserts status returns `pending`; also assert anonymous requests are rejected and non-failed jobs return 409.

- [x] **Step 2: Run focused Cutter API tests and verify RED**

Run:

```bash
node --test --import tsx packages/cutter-api/src/index.test.ts
```

Expected: retry route returns 404.

- [x] **Step 3: Add protected retry route**

In `/Users/allen/Documents/mixlab/packages/cutter-api/src/index.ts`, import `retryCutJob`, parse `/cutter/cut-jobs/:cut_job_id/retry`, guard with `requireCutterSession`, call `retryCutJob`, and return the retried job. Map "not found" to 404 and "only failed" to 409 with Chinese messages.

- [x] **Step 4: Add failing cutter-web API client test**

Add a test in `/Users/allen/Documents/mixlab/apps/cutter-web/src/api.test.ts` verifying:

```ts
await client.retryCutJob("CJ20260504-0001")
```

uses `POST http://127.0.0.1:3789/cutter/cut-jobs/CJ20260504-0001/retry` with cutter auth headers.

- [x] **Step 5: Implement client and fixture method**

Add `retryCutJob(cutJobId: string): Promise<CutJob>` to `CutterApiClient`, implement the real client call, and add fixture behavior that turns a failed fixture job back to `pending`.

- [x] **Step 6: Re-run focused API/client tests**

Run:

```bash
node --test --import tsx packages/cutter-api/src/index.test.ts
node --test --import tsx apps/cutter-web/src/api.test.ts
```

Expected: both pass.

### Task 3: Cutter Task UI Diagnosis and Real Retry Control

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/cut-queue/CutQueuePage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-state.test.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/styles.css`

- [x] **Step 1: Add failing render tests**

Update cut task render tests so failed rows must show:

- `失败原因`
- the error message
- `重试`

Also add a render case without `onRetryFailed` where `重试` is absent, proving there is no dead button.

- [x] **Step 2: Run focused render tests and verify RED**

Run:

```bash
node --test --import tsx apps/cutter-web/src/cutter-app.test.ts
```

Expected: fails because the page does not expose failed reason or conditional retry behavior.

- [x] **Step 3: Update CutQueuePage**

Add prop:

```ts
onRetryFailed?: (cutJobId: string) => void;
```

Show selected text and failed reason. Render `重试` only for failed jobs when `onRetryFailed` exists.

- [x] **Step 4: Wire retry into CutterApp**

Add handler:

```ts
async retryFailedCutJob(cutJobId: string) {
  if (!apiMode) {
    setQueueJobs((current) =>
      current.map((job) =>
        job.queue_job_id === cutJobId && job.status === "failed"
          ? { ...job, status: "pending", progress: 0, error_message: undefined }
          : job
      )
    );
    return;
  }

  try {
    const retried = await client.retryCutJob(cutJobId);
    setQueueJobs((current) => [
      mapApiCutJobsToQueueJobs({ job_count: 1, jobs: [retried] })[0]!,
      ...current.filter((job) => job.queue_job_id !== cutJobId)
    ]);
    setCutNotice("已重试失败任务 · 等待本机剪切");
    setHasSubmittedCutJobs(true);
    await refreshQueueJobs();
    void runRealCutPipeline();
  } catch (retryError) {
    setError(retryError instanceof Error ? retryError.message : "重试剪切任务失败");
  }
}
```

Pass it to `CutQueuePage`.

- [x] **Step 5: Re-run focused UI tests**

Run:

```bash
node --test --import tsx apps/cutter-web/src/cutter-app.test.ts
node --test --import tsx apps/cutter-web/src/cutter-state.test.ts
```

Expected: both pass.

### Task 4: Smoke and Final Verification

**Files:**
- Modify if needed: `/Users/allen/Documents/mixlab/scripts/smoke/cutter-api-web.ts`
- Modify: `/Users/allen/Documents/mixlab/docs/superpowers/plans/2026-05-04-m15-cutter-acceptance-patch.md`

- [x] **Step 1:** Ensure smoke still validates the successful real search-select-cut-reuse path.
- [x] **Step 2:** Run `node --test --import tsx packages/cutter-local/src/cut-queue.test.ts`.
- [x] **Step 3:** Run `node --test --import tsx packages/cutter-api/src/index.test.ts`.
- [x] **Step 4:** Run `node --test --import tsx apps/cutter-web/src/api.test.ts`.
- [x] **Step 5:** Run `node --test --import tsx apps/cutter-web/src/cutter-app.test.ts`.
- [x] **Step 6:** Run `node --test --import tsx apps/cutter-web/src/cutter-state.test.ts`.
- [x] **Step 7:** Run `npm run typecheck`.
- [x] **Step 8:** Run `npm test`.
- [x] **Step 9:** Run `npm run build:cutter-web`.
- [x] **Step 10:** Run `npm run smoke:cutter-api-web`.
- [x] **Step 11:** Run `git diff --check`.
- [x] **Step 12:** Commit with `feat: complete M15 cutter acceptance patch`.
