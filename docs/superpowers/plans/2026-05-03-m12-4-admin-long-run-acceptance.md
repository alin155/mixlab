# M12.4 Admin Long-Run Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the management end can run a real long-running preprocessing workflow on the current external source library, and close stability or data-exposure defects found during that run.

**Architecture:** Treat M12.4 as an acceptance-and-hardening milestone. Keep the existing single-process admin API, supervisor, and manifest lifecycle. Add only narrow safety fixes discovered by evidence, then collect a reproducible acceptance report from the live `/Volumes/Allen移动硬盘/source-library` workflow.

**Tech Stack:** TypeScript, Node test runner, React admin web, local Admin API on `127.0.0.1:3889`, Vite admin web on `127.0.0.1:5174`, DashScope temporary upload and ASR through the configured runtime.

---

## Scope Check

M12.4 is not a new UI-design milestone. It does not introduce new product pages, distributed workers, Windows/NAS deployment, or cutter-side redesign. Its only product goal is to make the current admin preprocessing path credible under real long-run use.

## Files

- Create: `docs/acceptance/m12-4-admin-long-run-acceptance.md`
  - Human-readable evidence report for the live run.
- Modify: `docs/spec-traceability.md`
  - Update only rows whose evidence improves during M12.4.
- Modify: `packages/admin-api/src/index.ts`
  - Redact supervisor `last_result` before returning Admin API responses.
- Modify: `packages/admin-api/src/index.test.ts`
  - Guard against leaking signed DashScope URLs, object keys, file URLs, or per-item raw ASR payloads from admin status endpoints.

## Task 1: Acceptance Baseline

- [x] Capture baseline from `/api/admin/library/status`, `/api/admin/preprocess/jobs`, and `/api/admin/dashboard/metrics`.
- [x] Record total, ready, queued, processing, failed, current index, runtime load, and average processing time.
- [x] Save the initial report to `docs/acceptance/m12-4-admin-long-run-acceptance.md`.

## Task 2: Redact Admin Supervisor Results

- [x] Write a failing Admin API test that starts the supervisor with a fake runner returning a successful item containing `audio_object_key`, `audio_file_url`, and `transcription_url`.
- [x] Assert `/api/admin/preprocess/supervisor/status` and `/api/admin/preprocess/jobs` expose only aggregate counts under `last_result`, and do not contain `Signature=`, `security-token`, `transcription_url`, `audio_file_url`, or `audio_object_key`.
- [x] Implement a redaction helper in `packages/admin-api/src/index.ts` that maps `PreprocessSupervisorStatus.last_result` to `{ total_claimed_count, succeeded_count, failed_count }`.
- [x] Run `node --test --import tsx packages/admin-api/src/index.test.ts` and verify the focused test turns green.

## Task 3: Start Real Long-Run Preprocessing

- [x] Confirm the live queue is not already running.
- [x] In the browser, click `启动预处理流水线` once. This is authorized by the user and will submit extracted audio to the configured DashScope temporary upload and ASR service.
- [x] Capture samples at start, during running, and after at least one safe boundary.
- [x] Verify the browser updates automatically without manual refresh.

## Task 4: Pause, Continue, And Failure Isolation

- [x] Observe a safe boundary stop during the live run.
- [x] Verify the supervisor returns to idle after the current video boundary and does not corrupt completed videos.
- [x] Click `启动预处理流水线` again to continue.
- [x] Verify completed videos remain complete, queue counts only move forward, and failed videos do not block later videos.

## Task 5: Artifact And Visibility Sampling

- [x] Pick at least three newly completed videos from this M12.4 run.
- [x] Confirm each has `source-video.json`, `preprocess-job.json`, `transcript.json`, `subtitles.srt`, cover, keyframes, and ready visibility.
- [x] Confirm the current index version includes the newly ready videos.
- [x] Confirm the cutter public library/search endpoint sees ready videos and does not see queued or processing videos.

## Task 6: Report And Verification

- [x] Update `docs/acceptance/m12-4-admin-long-run-acceptance.md` with baseline, actions, samples, artifacts, defects, and final status.
- [x] Update `docs/spec-traceability.md` for M12.4-supported ADMIN/LIB/ACC rows.
- [x] Run `git diff --check`.
- [x] Run `npm run typecheck`.
- [x] Run `npm test`.
- [x] Browser-check `#/dashboard` and `#/preprocess-jobs`.
