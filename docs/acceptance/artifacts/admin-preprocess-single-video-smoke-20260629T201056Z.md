# Admin Preprocess Single Video Smoke

Generated: 2026-06-29T20:10:56.232Z

Mode: admin-preprocess-single-video-smoke

Execution mode: execute

Result: failed

Dry-run ready: yes

Single-video smoke passed: no

NAS file mutation: yes

Production batch allowed: no

Publish allowed: no

Docker deploy allowed: no

This script is intentionally narrow. Dry-run mode sends only GET requests and writes local acceptance artifacts. Execute mode is allowed to POST only /api/admin/preprocess/supervisor/start with { limit: 1, source_video_id }. It never publishes a Cutter index, never runs a batch, and never records session tokens.

## Target

- Base URL: http://192.168.1.27:18080
- Normalized base URL: http://192.168.1.27:18080
- Safe to probe: yes
- Classification: Target URL shape is compatible with the NAS Docker admin-web root.
- Session token present: yes
- Source video: V005615
- Expected library root: /data/PublicLibrary
- Expected ready count: 10471
- Expected index version: v010471

## Observed

- Authenticated: true
- Before: root=/data/PublicLibrary, ready=10471, processing=0, index=v010471
- Candidate before: status=queued, visible=false, size=8392519, path=陶矜2/2023年素材/陶矜2023.4月沈阳/C0203.MP4
- Safety: status=healthy, safe_to_start=true
- Supervisor before: idle
- Start HTTP: 200
- Supervisor after: idle, claimed=1, succeeded=1, failed=0
- After: ready=10471, processing=0, index=v010471, candidate_status=index-required, candidate_visible=false

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
- Snapshot dir: docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T201056Z/pre-smoke-snapshot
- Missing required: none
- Missing optional: .mixlab-library/admin-read-model/admin.sqlite-wal, .mixlab-library/admin-read-model/admin.sqlite-shm
- Error: none

| Label | Required | Relative Path | Bytes |
| --- | --- | --- | --- |
library-ledger | yes | .mixlab-library/library.json | 472
source-video-manifest | yes | .mixlab-library/videos/V005615/source-video.json | 602
preprocess-job | no | .mixlab-library/videos/V005615/preprocess-job.json | 141
preprocess-log | no | .mixlab-library/logs/V005615.log | 65
admin-read-model | no | .mixlab-library/admin-read-model/admin.sqlite | 21536768

## Post-Execute NAS Files

- Status: checked
- Mount root: /Volumes/MixLab/PublicLibrary
- Attempts: 37
- Wait elapsed: 180022ms
- Refresh command configured: false
- Refresh attempted: false
- Refresh exit code: null
- Refresh error: none
- Error: none

| Relative Path | Exists | Parsed | Contains NUL | Bytes | Fields | Error |
| --- | --- | --- | --- | --- | --- | --- |
.mixlab-library/videos/V005615/source-video.json | yes | yes | yes | 737 | {"source_video_id":"V005615","preprocess_status":"queued","visible_to_cutters":false,"transcript_path":"","srt_path":"","cover_path":"","keyframes_path":""} | none
.mixlab-library/videos/V005615/preprocess-job.json | yes | yes | yes | 205 | {"source_video_id":"V005615","status":"queued","attempt":3,"worker_id":"admin","claimed_at":"2026-06-24T12:49:15.282Z"} | none
.mixlab-library/library.json | yes | yes | no | 472 | {"video_count":11394,"ready_video_count":10471,"queued_video_count":884,"processing_video_count":0,"index_required_video_count":39,"updated_at":"2026-06-29T19:43:38.116Z"} | none

## Summary

- Passed: 13
- Blocked: 0
- Failed: 1
- Needs follow-up: 1
- Dry-run blockers: none
- Execute blockers: post-smoke-nas-file-persistence

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
auth_status | GET /api/admin/auth/status | 200 | yes | 6.9ms | none
library_status_before | GET /api/admin/library/status | 200 | yes | 13.0ms | none
preprocess_safety | GET /api/admin/preprocess/safety | 200 | yes | 6.6ms | none
supervisor_status_before | GET /api/admin/preprocess/supervisor/status | 200 | yes | 6.7ms | none
source_videos_processing_before | GET /api/admin/source-videos?status=processing&limit=20 | 200 | yes | 37.9ms | none
source_video_before | GET /api/admin/source-videos/V005615 | 200 | yes | 7.8ms | none
supervisor_start | POST /api/admin/preprocess/supervisor/start | 200 | yes | 12.7ms | none
supervisor_status_poll | GET /api/admin/preprocess/supervisor/status | 200 | yes | 4.6ms | none
supervisor_status_poll | GET /api/admin/preprocess/supervisor/status | 200 | yes | 15.4ms | none
supervisor_status_poll | GET /api/admin/preprocess/supervisor/status | 200 | yes | 24.3ms | none
supervisor_status_poll | GET /api/admin/preprocess/supervisor/status | 200 | yes | 15.7ms | none
supervisor_status_after | GET /api/admin/preprocess/supervisor/status | 200 | yes | 12.7ms | none
library_status_after | GET /api/admin/library/status | 200 | yes | 8.0ms | none
source_videos_processing_after | GET /api/admin/source-videos?status=processing&limit=20 | 200 | yes | 27.9ms | none
source_video_after | GET /api/admin/source-videos/V005615 | 200 | yes | 17.8ms | none
preprocess_job_log_after | GET /api/admin/preprocess/jobs/J005615/log | 200 | yes | 12.0ms | none

## Gates

| Gate | Category | Status | Blocks Dry-run | Blocks Execute | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
single-video-scope-only | scope | pass | yes | yes | source_video_id=V005615. | n/a
nas-docker-admin-target | target | pass | yes | yes | Target URL shape is compatible with the NAS Docker admin-web root. | n/a
readiness-report-green | target | pass | yes | yes | status=ready-for-single-video-review, ready=true, smoke_review=true, ready_count=10471, index=v010471. | n/a
admin-session-authenticated | auth | pass | yes | yes | auth/status returned authenticated=true. | n/a
baseline-before-preserved | library | pass | yes | yes | root=/data/PublicLibrary, ready=10471, index=v010471. | n/a
candidate-is-queued-and-hidden | library | pass | yes | yes | status=queued, visible_to_cutters=false, path=陶矜2/2023年素材/陶矜2023.4月沈阳/C0203.MP4, size=8392519. | n/a
no-processing-before-smoke | preprocess | pass | yes | yes | library_processing=0. | processing_count must be 0 and the bounded processing list must respond before any smoke.
preprocess-safety-healthy | preprocess | pass | yes | yes | status=healthy, safe_to_start=true, disk=healthy. | preprocess/safety must report healthy and safe_to_start=true.
supervisor-idle-before-smoke | preprocess | pass | yes | yes | supervisor_idle=true, state=idle. | Supervisor must be idle before single-video smoke.
pre-smoke-snapshot-captured | snapshot | pass | yes | yes | Copied 5 files to docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T201056Z/pre-smoke-snapshot. | n/a
dry-run-does-not-post | execution | needs-follow-up | no | no | Execution mode was explicitly requested. | n/a
execute-body-is-single-target | execution | pass | no | yes | start_body={"limit":1,"source_video_id":"V005615"}. | n/a
single-video-execution-succeeded | execution | pass | no | yes | start_http=200, final_state=idle, claimed=1, succeeded=1, failed=0. | After execute, supervisor must return idle with last_result total=1 succeeded=1 failed=0.
post-smoke-baseline-preserved | postcheck | pass | no | yes | ready_after=10471, index_after=v010471, processing_after=0, source_status_after=index-required, source_visible_after=false. | After execute, ready/index must remain at the expected baseline and the target should be index-required but hidden.
post-smoke-nas-file-persistence | postcheck | fail | no | yes | status=checked, attempts=37, wait_ms=180022, refresh_configured=false, refresh_attempted=false, refresh_exit=null, source=queued, source_visible=false, job=queued, direct_ready=10471, direct_processing=0, direct_index_required=39, api_index_required=40, direct_queued=884, no_nul=false. | After execute, direct source-video.json, preprocess-job.json, and library.json on the NAS mount must match API postcheck and contain no NUL padding.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T201056Z.json
- Markdown: docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T201056Z.md
