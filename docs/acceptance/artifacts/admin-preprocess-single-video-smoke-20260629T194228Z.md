# Admin Preprocess Single Video Smoke

Generated: 2026-06-29T19:42:28.523Z

Mode: admin-preprocess-single-video-smoke

Execution mode: execute

Result: passed

Dry-run ready: yes

Single-video smoke passed: yes

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
- Source video: V000488
- Expected library root: /data/PublicLibrary
- Expected ready count: 10471
- Expected index version: v010471

## Observed

- Authenticated: true
- Before: root=/data/PublicLibrary, ready=10471, processing=0, index=v010471
- Candidate before: status=queued, visible=false, size=68044281, path=王牧笛/2025年素材/20250813牧笛北大游学/视频/DJI_20250813123435_0207_D.MP4
- Safety: status=healthy, safe_to_start=true
- Supervisor before: idle
- Start HTTP: 200
- Supervisor after: idle, claimed=1, succeeded=1, failed=0
- After: ready=10471, processing=0, index=v010471, candidate_status=index-required, candidate_visible=false

## Readiness Report

- Path: docs/acceptance/artifacts/admin-preprocess-production-readiness-20260629T193958Z.json
- Status: ready-for-single-video-review
- Phase 0/1 ready: true
- Smoke review ready: true
- Ready count: 10471
- Index version: v010471

## Snapshot

- Status: captured
- Mount root: /Volumes/MixLab/PublicLibrary
- Snapshot dir: docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T194228Z/pre-smoke-snapshot
- Missing required: none
- Missing optional: .mixlab-library/admin-read-model/admin.sqlite-wal, .mixlab-library/admin-read-model/admin.sqlite-shm
- Error: none

| Label | Required | Relative Path | Bytes |
| --- | --- | --- | --- |
library-ledger | yes | .mixlab-library/library.json | 472
source-video-manifest | yes | .mixlab-library/videos/V000488/source-video.json | 692
preprocess-job | no | .mixlab-library/videos/V000488/preprocess-job.json | 141
preprocess-log | no | .mixlab-library/logs/V000488.log | 65
admin-read-model | no | .mixlab-library/admin-read-model/admin.sqlite | 21536768

## Post-Execute NAS Files

- Status: checked
- Mount root: /Volumes/MixLab/PublicLibrary
- Attempts: 2
- Wait elapsed: 253ms
- Refresh command configured: true
- Refresh attempted: true
- Refresh exit code: 0
- Refresh error: none
- Error: none

| Relative Path | Exists | Parsed | Contains NUL | Bytes | Fields | Error |
| --- | --- | --- | --- | --- | --- | --- |
.mixlab-library/videos/V000488/source-video.json | yes | yes | no | 828 | {"source_video_id":"V000488","preprocess_status":"index-required","visible_to_cutters":false,"transcript_path":".mixlab-library/videos/V000488/transcript.json","srt_path":".mixlab-library/videos/V000488/subtitles.srt","cover_path":"","keyframes_path":""} | none
.mixlab-library/videos/V000488/preprocess-job.json | yes | yes | no | 205 | {"source_video_id":"V000488","status":"index-required","attempt":4,"worker_id":"admin-worker-30","claimed_at":"2026-06-29T19:42:52.132Z","completed_at":"2026-06-29T19:42:58.591Z"} | none
.mixlab-library/library.json | yes | yes | no | 472 | {"video_count":11394,"ready_video_count":10471,"queued_video_count":886,"processing_video_count":0,"index_required_video_count":37,"updated_at":"2026-06-29T19:42:58.603Z"} | none

## Summary

- Passed: 14
- Blocked: 0
- Failed: 0
- Needs follow-up: 1
- Dry-run blockers: none
- Execute blockers: none

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
auth_status | GET /api/admin/auth/status | 200 | yes | 5.7ms | none
library_status_before | GET /api/admin/library/status | 200 | yes | 6.9ms | none
preprocess_safety | GET /api/admin/preprocess/safety | 200 | yes | 1192.5ms | none
supervisor_status_before | GET /api/admin/preprocess/supervisor/status | 200 | yes | 7.5ms | none
source_videos_processing_before | GET /api/admin/source-videos?status=processing&limit=20 | 200 | yes | 81.3ms | none
source_video_before | GET /api/admin/source-videos/V000488 | 200 | yes | 10.1ms | none
supervisor_start | POST /api/admin/preprocess/supervisor/start | 200 | yes | 1049.7ms | none
supervisor_status_poll | GET /api/admin/preprocess/supervisor/status | 200 | yes | 5.0ms | none
supervisor_status_poll | GET /api/admin/preprocess/supervisor/status | 200 | yes | 11.3ms | none
supervisor_status_poll | GET /api/admin/preprocess/supervisor/status | 200 | yes | 455.6ms | none
supervisor_status_poll | GET /api/admin/preprocess/supervisor/status | 200 | yes | 14.1ms | none
supervisor_status_after | GET /api/admin/preprocess/supervisor/status | 200 | yes | 11.4ms | none
library_status_after | GET /api/admin/library/status | 200 | yes | 9.2ms | none
source_videos_processing_after | GET /api/admin/source-videos?status=processing&limit=20 | 200 | yes | 68.0ms | none
source_video_after | GET /api/admin/source-videos/V000488 | 200 | yes | 1047.0ms | none
preprocess_job_log_after | GET /api/admin/preprocess/jobs/J000488/log | 200 | yes | 13.1ms | none

## Gates

| Gate | Category | Status | Blocks Dry-run | Blocks Execute | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
single-video-scope-only | scope | pass | yes | yes | source_video_id=V000488. | n/a
nas-docker-admin-target | target | pass | yes | yes | Target URL shape is compatible with the NAS Docker admin-web root. | n/a
readiness-report-green | target | pass | yes | yes | status=ready-for-single-video-review, ready=true, smoke_review=true, ready_count=10471, index=v010471. | n/a
admin-session-authenticated | auth | pass | yes | yes | auth/status returned authenticated=true. | n/a
baseline-before-preserved | library | pass | yes | yes | root=/data/PublicLibrary, ready=10471, index=v010471. | n/a
candidate-is-queued-and-hidden | library | pass | yes | yes | status=queued, visible_to_cutters=false, path=王牧笛/2025年素材/20250813牧笛北大游学/视频/DJI_20250813123435_0207_D.MP4, size=68044281. | n/a
no-processing-before-smoke | preprocess | pass | yes | yes | library_processing=0. | processing_count must be 0 and the bounded processing list must respond before any smoke.
preprocess-safety-healthy | preprocess | pass | yes | yes | status=healthy, safe_to_start=true, disk=healthy. | preprocess/safety must report healthy and safe_to_start=true.
supervisor-idle-before-smoke | preprocess | pass | yes | yes | supervisor_idle=true, state=idle. | Supervisor must be idle before single-video smoke.
pre-smoke-snapshot-captured | snapshot | pass | yes | yes | Copied 5 files to docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T194228Z/pre-smoke-snapshot. | n/a
dry-run-does-not-post | execution | needs-follow-up | no | no | Execution mode was explicitly requested. | n/a
execute-body-is-single-target | execution | pass | no | yes | start_body={"limit":1,"source_video_id":"V000488"}. | n/a
single-video-execution-succeeded | execution | pass | no | yes | start_http=200, final_state=idle, claimed=1, succeeded=1, failed=0. | After execute, supervisor must return idle with last_result total=1 succeeded=1 failed=0.
post-smoke-baseline-preserved | postcheck | pass | no | yes | ready_after=10471, index_after=v010471, processing_after=0, source_status_after=index-required, source_visible_after=false. | After execute, ready/index must remain at the expected baseline and the target should be index-required but hidden.
post-smoke-nas-file-persistence | postcheck | pass | no | yes | status=checked, attempts=2, wait_ms=253, refresh_configured=true, refresh_attempted=true, refresh_exit=0, source=index-required, source_visible=false, job=index-required, direct_ready=10471, direct_processing=0, direct_index_required=37, api_index_required=37, direct_queued=886, no_nul=true. | n/a

## Artifacts

- JSON: docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T194228Z.json
- Markdown: docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T194228Z.md
