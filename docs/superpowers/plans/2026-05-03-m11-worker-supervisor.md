# M11 Worker Supervisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the M11 admin-side preprocessing production loop so source-folder switches stay consistent and the admin can start, stop, and observe preprocessing work from the management UI.

**Architecture:** The scanner remains the authority for discovered source videos and prunes stale manifest directories that are no longer in the active scan. The admin API owns an in-memory preprocessing supervisor that launches a controlled preprocessing worker process, exposes Chinese status APIs, and leaves expensive real runs opt-in through the admin UI. The admin web queue page reads supervisor status and shows queue capacity, pending work, last run outcome, and safe controls.

**Tech Stack:** TypeScript, Node.js `node:test`, existing `library-fs`, `preprocess-core`, `admin-api`, React admin web.

---

## File Structure

- Modify `packages/library-fs/src/scanner.ts`
  - Add stale manifest pruning after a successful scan.
  - Add `source_video_ids` to `library.json` so the current scan has an explicit active set.
- Modify `packages/library-fs/src/scanner.test.ts`
  - Add regression tests for source-folder path switches and disabled folders.
- Create `packages/admin-api/src/preprocess-supervisor.ts`
  - Encapsulate worker start/stop/status logic and make it testable with an injected runner.
- Modify `packages/admin-api/src/index.ts`
  - Add `/api/admin/preprocess/supervisor/status`, `/start`, `/stop`.
  - Include supervisor status in queue data.
- Modify `packages/admin-api/src/index.test.ts`
  - Test supervisor API status transitions with a fake runner.
- Modify `apps/admin-web/src/api.ts`
  - Add supervisor response types, client methods, and fixture data.
- Modify `apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx`
  - Replace static native-boundary copy with real service state and controls.
- Modify `apps/admin-web/src/app/AdminApp.tsx`
  - Wire start/stop supervisor actions.
- Modify `apps/admin-web/src/admin-app.test.ts`
  - Assert queue page renders Chinese worker controls and no stale English.

---

### Task 1: Source Scan Consistency

**Files:**
- Modify: `packages/library-fs/src/scanner.test.ts`
- Modify: `packages/library-fs/src/scanner.ts`

- [ ] **Step 1: Write the failing stale-manifest regression test**

Append this behavior to `packages/library-fs/src/scanner.test.ts`:

```ts
test("prunes manifests that no longer belong to the current enabled source folders", async () => {
  const libraryRoot = await makeLibraryRoot();
  const externalSource = path.join(libraryRoot, "external-source");

  await writeDummyFile(path.join(libraryRoot, "source-videos", "旧素材.mp4"));
  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  const settings = await readAdminSettings(libraryRoot);
  await writeAdminSettings(libraryRoot, {
    ...settings,
    source_folders: settings.source_folders.map((folder) =>
      folder.id === "src_default"
        ? { ...folder, path: externalSource }
        : folder
    )
  });
  await writeDummyFile(path.join(externalSource, "新素材.mp4"));

  const result = await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:05:00Z"
  });

  assert.equal(result.total_video_count, 1);
  assert.deepEqual(result.source_video_ids, ["V000002"]);
  await assert.rejects(
    () => readFile(
      path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json"),
      "utf8"
    ),
    /ENOENT/
  );

  const manifest = await readJson<{ relative_path: string; source_folder_id?: string }>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "source-video.json")
  );
  assert.equal(manifest.relative_path, "src_default/新素材.mp4");
  assert.equal(manifest.source_folder_id, "src_default");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- packages/library-fs/src/scanner.test.ts
```

Expected: FAIL because `V000001/source-video.json` still exists after the second scan.

- [ ] **Step 3: Implement pruning and active id manifest fields**

In `packages/library-fs/src/scanner.ts`, import `rm`, add a helper that removes manifest directories not in the current successful scan and not preserved from skipped folders:

```ts
async function pruneInactiveManifestDirectories(input: {
  library_root: string;
  existing_manifests: SourceVideoManifest[];
  active_source_video_ids: Set<string>;
}): Promise<string[]> {
  const pruned: string[] = [];

  for (const manifest of input.existing_manifests) {
    if (input.active_source_video_ids.has(manifest.source_video_id)) {
      continue;
    }

    await rm(path.join(videosRoot(input.library_root), manifest.source_video_id), {
      recursive: true,
      force: true
    });
    pruned.push(manifest.source_video_id);
  }

  return pruned;
}
```

Call it after `includedSourceVideoIds` is final and before writing manifests. Extend the scan result with no new public field for now; the test observes filesystem and library count behavior. In `writeLibraryManifest`, add:

```ts
source_video_ids: input.manifests
  .map((manifest) => manifest.source_video_id)
  .sort((left, right) => numericSourceVideoId(left) - numericSourceVideoId(right)),
```

- [ ] **Step 4: Run the scanner tests and verify GREEN**

Run:

```bash
npm test -- packages/library-fs/src/scanner.test.ts
```

Expected: PASS.

---

### Task 2: Supervisor Core

**Files:**
- Create: `packages/admin-api/src/preprocess-supervisor.ts`
- Modify: `packages/admin-api/src/index.test.ts`

- [ ] **Step 1: Write the failing API supervisor test**

Add a test in `packages/admin-api/src/index.test.ts` that creates the admin server with a fake supervisor runner. The fake runner should not run FFmpeg or DashScope; it should resolve with one successful item.

```ts
test("starts, reports, and stops the preprocessing supervisor through Chinese admin API", async () => {
  const libraryRoot = await makeLibraryRoot();
  let runCount = 0;

  await withServer(
    libraryRoot,
    async (baseUrl) => {
      const idle = await getJson(baseUrl, "/api/admin/preprocess/supervisor/status");
      assert.equal(idle.data.state, "idle");
      assert.equal(idle.data.state_label, "未运行");

      const started = await postJson(baseUrl, "/api/admin/preprocess/supervisor/start", { limit: 1 });
      assert.equal(started.data.state, "running");
      assert.equal(started.data.state_label, "运行中");

      await new Promise((resolve) => setTimeout(resolve, 25));

      const finished = await getJson(baseUrl, "/api/admin/preprocess/supervisor/status");
      assert.equal(finished.data.state, "idle");
      assert.equal(finished.data.last_result.total_claimed_count, 1);
      assert.equal(runCount, 1);

      const stopped = await postJson(baseUrl, "/api/admin/preprocess/supervisor/stop");
      assert.equal(stopped.data.state, "idle");
    },
    {
      async runOnce() {
        runCount += 1;
        return {
          scan_result: {
            total_video_count: 1,
            new_video_count: 0,
            existing_video_count: 1,
            source_video_ids: ["V000001"]
          },
          total_claimed_count: 1,
          succeeded_count: 1,
          failed_count: 0,
          items: []
        };
      }
    }
  );
});
```

Update `withServer` in the test file to accept an optional fake runner and pass it to `createAdminApiServer`.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- packages/admin-api/src/index.test.ts
```

Expected: FAIL because supervisor routes do not exist.

- [ ] **Step 3: Create supervisor core**

Create `packages/admin-api/src/preprocess-supervisor.ts` with:

```ts
import type { AdminRuntimePolicy } from "../../library-fs/src/index.ts";
import type { RunLibraryTextPreprocessWorkerResult } from "../../preprocess-core/src/index.ts";

export type PreprocessSupervisorState = "idle" | "running" | "stopping" | "failed";

export interface PreprocessSupervisorRunInput {
  limit?: number;
  runtime_policy: AdminRuntimePolicy;
}

export interface PreprocessSupervisorRunner {
  runOnce(input: PreprocessSupervisorRunInput): Promise<RunLibraryTextPreprocessWorkerResult>;
}

export interface PreprocessSupervisorStatus {
  state: PreprocessSupervisorState;
  state_label: string;
  worker_id: string;
  started_at: string;
  stopped_at: string;
  last_error: string;
  stop_requested: boolean;
  last_result: RunLibraryTextPreprocessWorkerResult | null;
}
```

Implement `createPreprocessSupervisor({ runner, now, worker_id })` with `status()`, `start({ limit, runtime_policy })`, and `stop()`. `start` should return immediately with state `running`, run the injected runner in the background, set `last_result`, and return to `idle` unless an error sets `failed`.

- [ ] **Step 4: Wire admin API routes**

In `packages/admin-api/src/index.ts`:

- Add optional `preprocess_runner?: PreprocessSupervisorRunner` to `CreateAdminApiServerInput`.
- Create a supervisor inside `createAdminApiServer`.
- Add GET `/api/admin/preprocess/supervisor/status`.
- Add POST `/api/admin/preprocess/supervisor/start`, parsing optional positive integer `limit`.
- Add POST `/api/admin/preprocess/supervisor/stop`.
- Add `supervisor: supervisor.status()` to `/api/admin/preprocess/jobs`.

- [ ] **Step 5: Run the API tests and verify GREEN**

Run:

```bash
npm test -- packages/admin-api/src/index.test.ts
```

Expected: PASS.

---

### Task 3: Real Worker Runner Boundary

**Files:**
- Modify: `packages/admin-api/src/index.ts`
- Modify: `packages/admin-api/package.json`

- [ ] **Step 1: Add a readiness test for missing DashScope key**

In `packages/admin-api/src/index.test.ts`, add a test that starts the supervisor without a `DASHSCOPE_API_KEY` and expects `invalid_request` with a Chinese message:

```ts
test("refuses to start real preprocessing when DashScope key is missing", async () => {
  const libraryRoot = await makeLibraryRoot();
  const server = createAdminApiServer({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    now: () => "2026-05-02T12:00:00.000Z",
    env: {} as NodeJS.ProcessEnv
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const response = await postJson(
      `http://127.0.0.1:${(address as AddressInfo).port}`,
      "/api/admin/preprocess/supervisor/start",
      { limit: 1 }
    );
    assert.equal(response.ok, false);
    assert.equal(response.error_code, "invalid_request");
    assert.match(response.message, /语音识别接口密钥未配置/);
  } finally {
    server.close();
    await once(server, "close");
  }
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- packages/admin-api/src/index.test.ts
```

Expected: FAIL because real-run readiness is not implemented.

- [ ] **Step 3: Implement the real runner factory**

In `packages/admin-api/src/index.ts`, import existing runtime pieces from `asr-core`, `ffmpeg-core`, `library-fs`, and `preprocess-core`. Build a default runner only when no fake runner is provided. It should:

- Read `DASHSCOPE_API_KEY`.
- Read current admin settings for audio mode and concurrency.
- Use `runLibraryTextPreprocessWorker`.
- Use `resolveFfmpegRuntime`, `buildFfprobeSourceMetadataPlan`, `parseFfprobeSourceMetadata`.
- Use `createDashScopeTemporaryFileAudioUploader`.
- Use `runSourceVideoTextPreprocess`.
- Use the current admin runtime policy audio mode instead of only environment variables.

Throw `语音识别接口密钥未配置，无法启动真实预处理服务` if no key is configured.

- [ ] **Step 4: Update package dependencies**

Add `@mixlab/asr-core`, `@mixlab/oss-core`, and `@mixlab/preprocess-core` to `packages/admin-api/package.json` dependencies because the admin API now owns the production supervisor boundary.

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

---

### Task 4: Admin Web Queue Binding

**Files:**
- Modify: `apps/admin-web/src/api.ts`
- Modify: `apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx`
- Modify: `apps/admin-web/src/app/AdminApp.tsx`
- Modify: `apps/admin-web/src/admin-app.test.ts`

- [ ] **Step 1: Write the failing admin UI test**

In `apps/admin-web/src/admin-app.test.ts`, extend the preprocess queue test to assert:

```ts
for (const text of [
  "预处理服务",
  "运行中",
  "启动预处理服务",
  "停止预处理服务",
  "上次处理",
  "本次限制"
]) {
  assert.match(html, new RegExp(text));
}
```

- [ ] **Step 2: Run the admin web test and verify RED**

Run:

```bash
npm test -- apps/admin-web/src/admin-app.test.ts
```

Expected: FAIL because the supervisor data and controls are not rendered.

- [ ] **Step 3: Add API types and client methods**

In `apps/admin-web/src/api.ts`, add:

```ts
export interface AdminPreprocessSupervisorStatus {
  state: "idle" | "running" | "stopping" | "failed";
  state_label: string;
  worker_id: string;
  started_at: string;
  stopped_at: string;
  last_error: string;
  stop_requested: boolean;
  last_result: {
    total_claimed_count: number;
    succeeded_count: number;
    failed_count: number;
  } | null;
}
```

Add `supervisor: AdminPreprocessSupervisorStatus` to `AdminPreprocessJobsResponse` and client methods:

```ts
getPreprocessSupervisorStatus(): Promise<AdminPreprocessSupervisorStatus>;
startPreprocessSupervisor(limit?: number): Promise<AdminPreprocessSupervisorStatus>;
stopPreprocessSupervisor(): Promise<AdminPreprocessSupervisorStatus>;
```

Update fixture data with `state: "running"` so the test renders service status.

- [ ] **Step 4: Render controls on the queue page**

In `PreprocessJobsPage.tsx`, accept:

```ts
onStartPreprocessSupervisor?: () => void;
onStopPreprocessSupervisor?: () => void;
```

Render the supervisor status in the inspector and add enabled controls:

- `启动预处理服务`
- `停止预处理服务`
- `处理未处理`
- `重试失败`

Do not render English worker state labels.

- [ ] **Step 5: Wire actions in AdminApp**

In `AdminApp.tsx`, add action handlers:

```ts
onStartPreprocessSupervisor: () =>
  runAction("启动预处理服务", (api) => api.startPreprocessSupervisor()),
onStopPreprocessSupervisor: () =>
  runAction("停止预处理服务", (api) => api.stopPreprocessSupervisor()),
```

Pass them into `PreprocessJobsPage`.

- [ ] **Step 6: Run admin web tests**

Run:

```bash
npm test -- apps/admin-web/src/admin-app.test.ts apps/admin-web/src/api.test.ts
```

Expected: PASS.

---

### Task 5: Live Library Verification

**Files:**
- No source edits unless verification exposes a bug.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm test
npm run typecheck
git diff --check
```

Expected: all PASS.

- [ ] **Step 2: Restart the local admin API and rescan the configured source folder**

Run the admin API against the existing live test library and rescan:

```bash
curl -s -X POST http://127.0.0.1:3889/api/admin/library/scan
curl -s http://127.0.0.1:3889/api/admin/library/status
curl -s http://127.0.0.1:3889/api/admin/source-videos
```

Expected:

- `video_count` is `41`.
- `unprocessed_video_count` is `41`.
- `/api/admin/source-videos` returns 41 rows.
- Old `V000001` from the previous temp folder is absent after rescan.

- [ ] **Step 3: Do not start a full paid ASR run automatically**

Only verify supervisor status and readiness by calling status. A real start against the 127G folder should be done as a controlled small batch after the user is ready for cost/time:

```bash
curl -s http://127.0.0.1:3889/api/admin/preprocess/supervisor/status
```

Expected: returns Chinese state fields and does not consume ASR quota.

---

## Self-Review

**Spec coverage:** M11 covers the stale manifest problem, multi-folder source scan consistency, production worker start/stop/status, admin queue visibility, and live validation against `/Volumes/Allen移动硬盘/source-library`.

**Intentional deferrals:** Full ready-publish automation, parallel ASR execution, persistent worker recovery after API restart, and cutter-side consumption remain later milestones. M11 creates the supervisor boundary needed for those without forcing expensive 35T processing during UI testing.

**Risk controls:** Real preprocessing start refuses to run without DashScope key, exposes optional limits, and final live verification checks status before any paid ASR call.
