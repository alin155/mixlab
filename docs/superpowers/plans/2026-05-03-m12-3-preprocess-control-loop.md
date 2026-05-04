# M12.3 Preprocess Control Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin preprocessing pipeline behave like a real long-running production loop with live stages, safe pause, failure isolation, and state-aware controls.

**Architecture:** Add persistent job-stage updates to the library lifecycle, thread stage callbacks through the preprocess worker and text preprocess function, and make the Admin API/UI consume those stages. Keep the existing single-process supervisor and manifest protocol shape, only adding runtime job fields.

**Tech Stack:** TypeScript, Node test runner, React server-render tests, MixLab manifests, local Admin API.

---

### Task 1: Persist Live Preprocess Stages

**Files:**
- Modify: `packages/library-fs/src/preprocess-lifecycle.ts`
- Modify: `packages/library-fs/src/preprocess-lifecycle.test.ts`
- Modify: `packages/library-fs/src/index.ts`

- [ ] Add a failing test that calls `updatePreprocessJobStage` after claiming `V000001` and expects `preprocess-job.json` to contain `current_stage: "extract-audio"` and `stage_updated_at`.
- [ ] Implement `updatePreprocessJobStage(input)` so it only updates processing jobs and preserves attempt, worker, claim time, and existing error fields.
- [ ] Export `updatePreprocessJobStage` through `packages/library-fs/src/index.ts`.

### Task 2: Report Stages From Real Text Preprocessing

**Files:**
- Modify: `packages/preprocess-core/src/index.ts`
- Modify: `packages/preprocess-core/src/index.test.ts`

- [ ] Add a failing test that passes `on_stage` to `runSourceVideoTextPreprocess` and expects the ordered stages `extract-audio`, `upload-audio`, `asr`, `write-transcript`.
- [ ] Add optional `on_stage(stage)` to `RunSourceVideoTextPreprocessInput`.
- [ ] Call `on_stage` before FFmpeg extraction, upload, ASR, and artifact writing.

### Task 3: Connect Worker Stages To Job Records

**Files:**
- Modify: `packages/preprocess-core/src/library-worker.ts`
- Modify: `packages/preprocess-core/src/library-worker.test.ts`

- [ ] Add a failing test proving `runLibraryTextPreprocessWorker` writes `probe-media`, `extract-audio`, and `asr` stages into `preprocess-job.json`.
- [ ] Extend `LibraryTextPreprocessInput` with optional `on_stage`.
- [ ] Call `updatePreprocessJobStage` before media probing.
- [ ] Pass an `on_stage` callback into `preprocess_source_video` that writes the current stage for the claimed video.

### Task 4: Honor Safe Pause At Video Boundaries

**Files:**
- Modify: `packages/admin-api/src/index.test.ts`
- Modify: `packages/admin-api/src/index.ts`

- [ ] Add a failing pipeline test where `should_stop` becomes true after the first successful worker cycle, and assert only one video is claimed while publishing completed artifacts still happens.
- [ ] Adjust `runAdminPreprocessPipeline` to check `should_stop` before claiming the next cycle while still publishing artifacts after the current cycle.
- [ ] Keep failure isolation behavior: failed items increment failure counts and the next cycle still runs when not stopped.

### Task 5: Show Real Stages And State-Aware Controls

**Files:**
- Modify: `packages/admin-api/src/index.test.ts`
- Modify: `packages/admin-api/src/index.ts`
- Modify: `apps/admin-web/src/admin-app.test.ts`
- Modify: `apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx`
- Modify: `apps/admin-web/src/app/chinese.ts`

- [ ] Add a failing API test where a processing job has `current_stage: "upload-audio"` and `/api/admin/preprocess/jobs` returns `stage_label: "上传音频"` with stage progress above the generic processing baseline.
- [ ] Update `jobStageFromManifest` to prefer `current_stage` for running jobs and add Chinese labels for `probe-media` and `write-transcript`.
- [ ] Add a failing frontend test proving the start button is disabled while running and the pause button is disabled while idle.
- [ ] Update `PreprocessJobsPage` so start/pause handlers are only passed when the current supervisor state allows the action.

### Task 6: Verification

**Files:**
- No production file changes unless verification reveals a defect.

- [ ] Run `node --test --import tsx packages/library-fs/src/preprocess-lifecycle.test.ts`.
- [ ] Run `node --test --import tsx packages/preprocess-core/src/index.test.ts packages/preprocess-core/src/library-worker.test.ts`.
- [ ] Run `node --test --import tsx packages/admin-api/src/index.test.ts`.
- [ ] Run `node --test --import tsx apps/admin-web/src/admin-app.test.ts`.
- [ ] Run `git diff --check`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Refresh `http://127.0.0.1:5174/#/preprocess-jobs` and verify the visible UI uses Chinese stage labels and state-aware controls.
