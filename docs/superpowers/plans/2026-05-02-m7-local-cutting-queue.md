# M7 Local Cutting Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production-shaped cutter local workspace: persistent cut lists, a local cut queue, reusable export clips, and one `export-clip.json` per completed export.

**Architecture:** Public library files remain read-only for cutter workflows. A new `@mixlab/cutter-local` package owns cutter-side workspace data under the cutter workspace root, while `@mixlab/cutter-api` resolves ready public sources through `@mixlab/library-fs` and writes only local workspace artifacts. Existing preview-compatible `/cutter/local-clips` routes remain available, but when `workspace_root` is configured they are backed by workspace exports rather than `.mixlab-library/local-clips`.

**Tech Stack:** TypeScript, Node.js file-system APIs, Node test runner, existing `@mixlab/protocol`, `@mixlab/library-fs`, and `@mixlab/ffmpeg-core`.

---

## Scope Contract

This step:

- M7: Local Cutting, Queue, And Export Manifests.

Spec sources:

- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/07_数据模型与Manifest.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/09_剪辑师工作台规格.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/11_本地剪切与导出规格.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/12_权限与路径解析规格.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/14_验收标准与测试剧本.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/18_API接口草案.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/21_视觉与交互设计规范.md`

Traceability IDs:

- `PROD-002`, `PROD-003`
- `LIB-005`
- `CUTTER-005`, `CUTTER-006`, `CUTTER-007`, `CUTTER-008`
- `ACC-006`, `ACC-007`

Explicitly not doing:

- Tauri native open-file/open-folder commands.
- Desktop packaging.
- Multi-worker queue concurrency.
- Admin-side metadata editing persistence.
- UI redesign beyond API/client contract wiring needed for M7.
- Windows/NAS final acceptance.

Acceptance:

- Cut-list rows persist in a cutter workspace and preserve source traceability.
- Submitted cut jobs can run through an injected or default FFmpeg runner.
- Completed jobs write an output video and `export-clip.json`.
- Cutter local library lists workspace exports with media/detail URLs.
- Tests prove cutter writes do not create `.mixlab-library/local-clips` in the public library when a workspace root is configured.

---

## File Structure

- Create `packages/cutter-local/package.json`: workspace package metadata and dependencies.
- Create `packages/cutter-local/src/export-manifest.ts`: export ids, safe file names, workspace-relative paths, manifest writing, listing, detail lookup.
- Create `packages/cutter-local/src/cut-list.ts`: persistent clip-list ids, cut-list schemas, write/read/list helpers.
- Create `packages/cutter-local/src/cut-queue.ts`: job ids, queue persistence, run-one-job orchestration, job status transitions.
- Create `packages/cutter-local/src/index.ts`: public exports for API/server use.
- Create `packages/cutter-local/src/*.test.ts`: TDD coverage for export manifests, cut lists, and queue execution/failure behavior.
- Modify `packages/cutter-api/package.json`: add `@mixlab/cutter-local`.
- Modify `packages/cutter-api/src/index.ts`: add optional `workspace_root`, workspace-backed local clips, clip-list and cut-job routes.
- Modify `packages/cutter-api/src/index.test.ts`: preserve legacy public-library local clip route and add workspace-backed route coverage.
- Modify `apps/cutter-web/src/api.ts`: expose cut-list and cut-job client methods/types for the product UI to bind later.
- Modify `apps/cutter-web/src/api.test.ts`: cover the new client request shapes.
- Modify `README.md`: document the workspace-backed M7 bridge behavior.
- Modify `docs/spec-traceability.md`: update M7 traceability statuses.
- Create `docs/acceptance/m7-local-cutting-queue.md`: record scope, verification, and remaining work.

---

### Task 1: Export Clip Manifest Package Slice

**Files:**

- Create: `packages/cutter-local/package.json`
- Create: `packages/cutter-local/src/export-manifest.ts`
- Create: `packages/cutter-local/src/index.ts`
- Test: `packages/cutter-local/src/export-manifest.test.ts`

- [ ] **Step 1: Write the failing export-manifest tests**

Create tests that assert:

```ts
assert.equal(await allocateNextExportClipId(workspaceRoot), "E000001");
assert.equal(buildExportClipFileName({ export_clip_id: "E000001", selected_text: "现金流，是企业的血液。不是账面数字/非法", extension: ".mp4" }), "E000001_现金流，是企业的血液。不是账面数字_非法.mp4");
assert.equal(manifest.output_file, "export-clips/E000001/E000001_现金流，是企业的血液.mp4");
assert.equal((await listExportClips({ workspace_root: workspaceRoot })).local_clip_count, 1);
```

- [ ] **Step 2: Run the export-manifest tests and verify RED**

Run:

```bash
node --test --import tsx packages/cutter-local/src/export-manifest.test.ts
```

Expected: fails because `@mixlab/cutter-local` and export helpers do not exist.

- [ ] **Step 3: Implement the export-manifest helpers**

Implement:

```ts
allocateNextExportClipId(workspaceRoot: string): Promise<string>
buildExportClipFileName(input: { export_clip_id: string; selected_text: string; extension?: string }): string
buildExportClipArtifactPaths(input: { workspace_root: string; export_clip_id: string; selected_text: string; extension?: string }): ExportClipArtifactPaths
writeExportClipManifest(input: WriteExportClipManifestInput): Promise<ExportClipView>
listExportClips(input: { workspace_root: string }): Promise<ExportClipCatalog>
getExportClipDetail(input: { workspace_root: string; export_clip_id: string }): Promise<ExportClipView | null>
```

All output paths must be workspace-relative and traversal-safe. The manifest must pass `validateExportClipManifest`.

- [ ] **Step 4: Run the export-manifest tests and verify GREEN**

Run:

```bash
node --test --import tsx packages/cutter-local/src/export-manifest.test.ts
```

Expected: pass.

### Task 2: Persistent Cut Lists

**Files:**

- Create: `packages/cutter-local/src/cut-list.ts`
- Modify: `packages/cutter-local/src/index.ts`
- Test: `packages/cutter-local/src/cut-list.test.ts`

- [ ] **Step 1: Write the failing cut-list tests**

Create tests that assert:

```ts
const list = await writeClipList({
  workspace_root: workspaceRoot,
  library_id: "lib_main_001",
  title: "现金流混剪",
  items: [
    {
      source_video_id: "V000001",
      source_title: "01_现金流",
      source_relative_path: "source-videos/01_现金流.mp4",
      start_segment_id: "V000001-S000001",
      end_segment_id: "V000001-S000002",
      begin_ms: 1000,
      end_ms: 5200,
      selected_text: "现金流，是企业的血液。不是账面数字。",
      cut_mode: "smart"
    }
  ],
  now: "2026-05-02T10:00:00Z"
});
assert.equal(list.clip_list_id, "CL20260502-0001");
assert.equal((await listClipLists({ workspace_root: workspaceRoot })).clip_lists[0].item_count, 1);
```

- [ ] **Step 2: Run the cut-list tests and verify RED**

Run:

```bash
node --test --import tsx packages/cutter-local/src/cut-list.test.ts
```

Expected: fails because cut-list helpers do not exist.

- [ ] **Step 3: Implement cut-list persistence**

Implement:

```ts
writeClipList(input: WriteClipListInput): Promise<ClipListManifest>
readClipList(input: { workspace_root: string; clip_list_id: string }): Promise<ClipListManifest | null>
listClipLists(input: { workspace_root: string }): Promise<ClipListCatalog>
```

Persist each manifest at `clip-lists/<clip_list_id>/clip-list.json`, normalize `item_id` as `CLI000001`, and keep list ordering stable.

- [ ] **Step 4: Run the cut-list tests and verify GREEN**

Run:

```bash
node --test --import tsx packages/cutter-local/src/cut-list.test.ts
```

Expected: pass.

### Task 3: Queue Execution And Export Artifacts

**Files:**

- Create: `packages/cutter-local/src/cut-queue.ts`
- Modify: `packages/cutter-local/src/index.ts`
- Test: `packages/cutter-local/src/cut-queue.test.ts`

- [ ] **Step 1: Write the failing cut-queue tests**

Create tests that assert:

```ts
const jobs = await submitClipListToQueue({ workspace_root: workspaceRoot, clip_list, now: "2026-05-02T10:01:00Z" });
assert.equal(jobs.jobs[0].status, "pending");

const result = await runNextCutJob({
  workspace_root: workspaceRoot,
  library_root: libraryRoot,
  now: () => "2026-05-02T10:02:00Z",
  resolve_source: async () => sourceDetail,
  cut_runner: async ({ output_path }) => writeFile(output_path, "clip-bytes")
});
assert.equal(result?.status, "done");
assert.equal((await listExportClips({ workspace_root: workspaceRoot })).local_clip_count, 1);
```

Also test that a thrown runner error marks the job `failed` with `error_message`.

- [ ] **Step 2: Run the cut-queue tests and verify RED**

Run:

```bash
node --test --import tsx packages/cutter-local/src/cut-queue.test.ts
```

Expected: fails because queue helpers do not exist.

- [ ] **Step 3: Implement the queue**

Implement:

```ts
submitClipListToQueue(input: SubmitClipListToQueueInput): Promise<CutJobSubmission>
listCutJobs(input: { workspace_root: string }): Promise<CutJobCatalog>
getCutJob(input: { workspace_root: string; cut_job_id: string }): Promise<CutJobManifest | null>
runNextCutJob(input: RunNextCutJobInput): Promise<CutJobManifest | null>
```

Statuses are `pending`, `running`, `done`, `failed`, and `cancelled`. `runNextCutJob` processes the oldest pending job, writes the video to the workspace export path, writes `export-clip.json`, and persists final job state.

- [ ] **Step 4: Run the cut-queue tests and verify GREEN**

Run:

```bash
node --test --import tsx packages/cutter-local/src/cut-queue.test.ts
```

Expected: pass.

### Task 4: Cutter API Workspace Wiring

**Files:**

- Modify: `packages/cutter-api/package.json`
- Modify: `packages/cutter-api/src/index.ts`
- Modify: `packages/cutter-api/src/index.test.ts`

- [ ] **Step 1: Write the failing API integration test**

Add a test that creates a server with both `library_root` and `workspace_root`, posts `/cutter/local-clips`, and asserts:

```ts
assert.equal(created.data.local_clip_id, "E000001");
assert.equal(created.data.export_clip_id, "E000001");
assert.equal(created.data.media_url, "/cutter/local-clips/E000001/media");
assert.equal(await exists(path.join(workspaceRoot, "export-clips", "E000001", "export-clip.json")), true);
assert.equal(await exists(path.join(libraryRoot, ".mixlab-library", "local-clips")), false);
```

Also add `POST /cutter/clip-lists`, `POST /cutter/cut-jobs`, `GET /cutter/cut-jobs`, and `POST /cutter/cut-jobs/run-next` tests using an injected runner.

- [ ] **Step 2: Run the API tests and verify RED**

Run:

```bash
node --test --import tsx packages/cutter-api/src/index.test.ts
```

Expected: fails on missing `workspace_root` behavior and queue routes.

- [ ] **Step 3: Implement workspace-aware API behavior**

Add optional `workspace_root` to `CreateCutterApiServerInput` and `MIXLAB_CUTTER_WORKSPACE_ROOT` to env config. When `workspace_root` exists:

- `/cutter/local-clips` lists workspace exports.
- `/cutter/local-clips/:export_clip_id` reads workspace export detail.
- `/cutter/local-clips/:export_clip_id/media` streams workspace output video.
- `POST /cutter/local-clips` creates a single-item clip list, submits one job, runs it immediately, and returns the completed export.
- `/cutter/clip-lists` persists submitted rows.
- `/cutter/cut-jobs` submits/list jobs.
- `/cutter/cut-jobs/run-next` runs one pending job for the local bridge.

Keep legacy public-library local clip behavior when `workspace_root` is absent so existing preview tests remain valid.

- [ ] **Step 4: Run API tests and verify GREEN**

Run:

```bash
node --test --import tsx packages/cutter-api/src/index.test.ts
```

Expected: pass.

### Task 5: Cutter Web API Client Contract

**Files:**

- Modify: `apps/cutter-web/src/api.ts`
- Modify: `apps/cutter-web/src/api.test.ts`

- [ ] **Step 1: Write failing client tests**

Add tests that assert:

```ts
await client.createClipList({ library_id: "lib_main_001", title: "剪切清单", items: [...] });
assert.equal(String(url), "http://127.0.0.1:3789/cutter/clip-lists");

await client.submitCutJobs({ clip_list_id: "CL20260502-0001" });
assert.equal(String(url), "http://127.0.0.1:3789/cutter/cut-jobs");

await client.listCutJobs();
assert.equal(String(url), "http://127.0.0.1:3789/cutter/cut-jobs");
```

- [ ] **Step 2: Run client tests and verify RED**

Run:

```bash
node --test --import tsx apps/cutter-web/src/api.test.ts
```

Expected: fails because methods are missing.

- [ ] **Step 3: Implement client methods and types**

Add `ClipList`, `CutListItemInput`, `CutJob`, `CutJobCatalog`, `createClipList`, `submitCutJobs`, `listCutJobs`, and `runNextCutJob` to the cutter API client.

- [ ] **Step 4: Run client tests and verify GREEN**

Run:

```bash
node --test --import tsx apps/cutter-web/src/api.test.ts
```

Expected: pass.

### Task 6: Documentation And Traceability

**Files:**

- Modify: `README.md`
- Modify: `docs/spec-traceability.md`
- Create: `docs/acceptance/m7-local-cutting-queue.md`

- [ ] **Step 1: Update project documentation**

Document `@mixlab/cutter-local`, `MIXLAB_CUTTER_WORKSPACE_ROOT`, workspace-backed `/cutter/local-clips`, clip-list routes, queue routes, and the fact that cutter writes stay out of the public library.

- [ ] **Step 2: Update traceability**

Set:

- `LIB-005`: `partial` with `clip-list.json` and `export-clip.json` helpers now covered.
- `CUTTER-005`: `accepted` for persistence/API, UI polish remains separately noted.
- `CUTTER-006`: `accepted` for production queue persistence and runner boundary.
- `CUTTER-007`: `accepted` for reusable workspace exports and traceability.
- `CUTTER-008`: `accepted`.
- `ACC-006`: `partial` with automated export evidence, manual UI/video acceptance still pending.
- `ACC-007`: `partial` with automated local library/detail/media evidence, native reveal/open still pending.

- [ ] **Step 3: Create the M7 acceptance record**

Record implemented scope, verification commands, explicit non-scope, and known remaining work.

### Task 7: Full Verification And Commit

**Files:**

- All touched files.

- [ ] **Step 1: Install/update workspace links**

Run:

```bash
npm install
```

Expected: workspace lockfile includes `@mixlab/cutter-local`.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
node --test --import tsx packages/cutter-local/src/*.test.ts
node --test --import tsx packages/cutter-api/src/index.test.ts apps/cutter-web/src/api.test.ts
```

Expected: pass.

- [ ] **Step 3: Run full verification**

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

- [ ] **Step 4: Review diff and scan for secrets**

Run:

```bash
git diff --stat
git diff -- package-lock.json package.json packages/cutter-local packages/cutter-api apps/cutter-web docs README.md
rg -n "sk-|DASHSCOPE_API_KEY|api_key|accessKeySecret|AccessKeySecret" .
```

Expected: diff matches M7 scope; no newly committed secret values.

- [ ] **Step 5: Commit**

Run:

```bash
git add package-lock.json package.json packages/cutter-local packages/cutter-api apps/cutter-web docs README.md
git commit -m "feat: add M7 local cutting queue"
```

Expected: commit succeeds on `codex/m7-local-cutting-queue`.

---

## Self-Review

Spec coverage:

- `07` is covered by `clip-list.json` and `export-clip.json` helpers.
- `09` is covered by workspace-local cut lists, local library exports, and queue routes.
- `11` is covered by cut modes, runner boundary, job statuses, and export manifests.
- `12` is covered by workspace-relative output files and traversal rejection.
- `14` sections 6 and 7 are covered by automated evidence; manual end-user desktop acceptance remains for a later stage.
- `18` is covered by local bridge route additions.
- `21` remains preserved because this milestone does not redesign product UI.

Placeholder scan:

- No implementation step depends on undefined future work.
- Native shell open/reveal and packaging are explicitly out of scope.

Type consistency:

- Export identifiers use `E000001`.
- Cut-list identifiers use `CLYYYYMMDD-0001`.
- Cut-job identifiers use `CJYYYYMMDD-0001`.
- UI client methods map directly to API routes.
