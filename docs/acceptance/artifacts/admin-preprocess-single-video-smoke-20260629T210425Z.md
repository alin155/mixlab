# Admin Preprocess Single Video Smoke

Generated: 2026-06-29T21:04:25.758Z

Mode: admin-preprocess-single-video-smoke

Execution mode: dry-run

Result: dry-run-ready

Dry-run ready: yes

Single-video smoke passed: no

NAS file mutation: no

Production batch allowed: no

Publish allowed: no

Docker deploy allowed: no

This script is intentionally narrow. Dry-run mode sends only GET requests and writes local acceptance artifacts. Execute mode is allowed to POST only /api/admin/preprocess/supervisor/start with { limit: 1, source_video_id }. It never publishes a Cutter index, never runs a batch, and never records session tokens.

## Post-File Check Policy

- Allow SMB stale post-file view: yes

## Target

- Base URL: http://192.168.1.27:18080
- Normalized base URL: http://192.168.1.27:18080
- Safe to probe: yes
- Classification: Target URL shape is compatible with the NAS Docker admin-web root.
- Session token present: yes
- Source video: V006276
- Expected library root: /data/PublicLibrary
- Expected ready count: 10471
- Expected index version: v010471

## Observed

- Authenticated: true
- Before: root=/data/PublicLibrary, ready=10471, processing=0, index=v010471
- Candidate before: status=queued, visible=false, size=13138432, path=陶矜2/2024年素材/2403上海花絮/100CANON/0Q9A2919.MP4
- Safety: status=healthy, safe_to_start=true
- Supervisor before: idle
- Start HTTP: null
- Supervisor after: n/a, claimed=null, succeeded=null, failed=null
- After: ready=null, processing=null, index=n/a, candidate_status=queued, candidate_visible=false

## Readiness Report

- Path: docs/acceptance/artifacts/admin-preprocess-production-readiness-20260629T200816Z.json
- Status: ready-for-single-video-review
- Phase 0/1 ready: true
- Smoke review ready: true
- Ready count: 10471
- Index version: v010471

## Snapshot

- Status: captured
- Mount root: /Volumes/MixLab/PublicLibrary
- Snapshot dir: docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T210425Z/pre-smoke-snapshot
- Missing required: none
- Missing optional: .mixlab-library/admin-read-model/admin.sqlite-wal, .mixlab-library/admin-read-model/admin.sqlite-shm
- Error: none

| Label | Required | Relative Path | Bytes |
| --- | --- | --- | --- |
library-ledger | yes | .mixlab-library/library.json | 472
source-video-manifest | yes | .mixlab-library/videos/V006276/source-video.json | 621
preprocess-job | no | .mixlab-library/videos/V006276/preprocess-job.json | 141
preprocess-log | no | .mixlab-library/logs/V006276.log | 65
admin-read-model | no | .mixlab-library/admin-read-model/admin.sqlite | 21536768

## Post-Execute NAS Files

- Status: not-run
- Mount root: /Volumes/MixLab/PublicLibrary
- Attempts: 0
- Wait elapsed: 0ms
- Refresh command configured: false
- Refresh attempted: false
- Refresh exit code: null
- Refresh error: none
- Error: none

| Relative Path | Exists | Parsed | Contains NUL | Bytes | Fields | Error |
| --- | --- | --- | --- | --- | --- | --- |
.mixlab-library/videos/V006276/source-video.json | no | no | n/a | n/a | {} | none
.mixlab-library/videos/V006276/preprocess-job.json | no | no | n/a | n/a | {} | none
.mixlab-library/library.json | no | no | n/a | n/a | {} | none

## Summary

- Passed: 11
- Blocked: 0
- Failed: 0
- Needs follow-up: 4
- Dry-run blockers: none
- Execute blockers: execute-body-is-single-target, single-video-execution-succeeded, post-smoke-baseline-preserved

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
auth_status | GET /api/admin/auth/status | 200 | yes | 8.2ms | none
library_status_before | GET /api/admin/library/status | 200 | yes | 8.2ms | none
preprocess_safety | GET /api/admin/preprocess/safety | 200 | yes | 7.4ms | none
supervisor_status_before | GET /api/admin/preprocess/supervisor/status | 200 | yes | 5.8ms | none
source_videos_processing_before | GET /api/admin/source-videos?status=processing&limit=20 | 200 | yes | 15.1ms | none
source_video_before | GET /api/admin/source-videos/V006276 | 200 | yes | 8.8ms | none

## Gates

| Gate | Category | Status | Blocks Dry-run | Blocks Execute | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
single-video-scope-only | scope | pass | yes | yes | source_video_id=V006276. | n/a
nas-docker-admin-target | target | pass | yes | yes | Target URL shape is compatible with the NAS Docker admin-web root. | n/a
readiness-report-green | target | pass | yes | yes | status=ready-for-single-video-review, ready=true, smoke_review=true, ready_count=10471, index=v010471. | n/a
admin-session-authenticated | auth | pass | yes | yes | auth/status returned authenticated=true. | n/a
baseline-before-preserved | library | pass | yes | yes | root=/data/PublicLibrary, ready=10471, index=v010471. | n/a
candidate-is-queued-and-hidden | library | pass | yes | yes | status=queued, visible_to_cutters=false, path=陶矜2/2024年素材/2403上海花絮/100CANON/0Q9A2919.MP4, size=13138432. | n/a
no-processing-before-smoke | preprocess | pass | yes | yes | library_processing=0. | processing_count must be 0 and the bounded processing list must respond before any smoke.
preprocess-safety-healthy | preprocess | pass | yes | yes | status=healthy, safe_to_start=true, disk=healthy. | preprocess/safety must report healthy and safe_to_start=true.
supervisor-idle-before-smoke | preprocess | pass | yes | yes | supervisor_idle=true, state=idle. | Supervisor must be idle before single-video smoke.
pre-smoke-snapshot-captured | snapshot | pass | yes | yes | Copied 5 files to docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T210425Z/pre-smoke-snapshot. | n/a
dry-run-does-not-post | execution | pass | yes | no | No POST request was sent. | n/a
execute-body-is-single-target | execution | needs-follow-up | no | yes | Dry-run only. Set MIXLAB_ADMIN_PREPROCESS_SMOKE_EXECUTE=1 after Docker target contains targeted start support. | Run the same script with execute=1 only after the new Docker image is deployed.
single-video-execution-succeeded | execution | needs-follow-up | no | yes | start_http=null, final_state=n/a, claimed=null, succeeded=null, failed=null. | After execute, supervisor must return idle with last_result total=1 succeeded=1 failed=0.
post-smoke-baseline-preserved | postcheck | needs-follow-up | no | yes | Dry-run only; no post-smoke mutation check was needed. | After execute, ready/index must remain at the expected baseline and the target should be index-required but hidden.
post-smoke-nas-file-persistence | postcheck | needs-follow-up | no | no | Dry-run only; direct NAS post-file persistence check runs after execute. | After execute, direct source-video.json, preprocess-job.json, and library.json on the NAS mount must match API postcheck and contain no NUL padding.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T210425Z.json
- Markdown: docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T210425Z.md
