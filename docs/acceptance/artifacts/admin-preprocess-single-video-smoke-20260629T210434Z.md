# Admin Preprocess Single Video Smoke

Generated: 2026-06-29T21:04:34.875Z

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

## Post-File Check Policy

- Allow SMB stale post-file view: yes

## Target

- Base URL: http://192.168.1.27:18080
- Normalized base URL: http://192.168.1.27:18080
- Safe to probe: yes
- Classification: Target URL shape is compatible with the NAS Docker admin-web root.
- Session token present: yes
- Source video: V005167
- Expected library root: /data/PublicLibrary
- Expected ready count: 10471
- Expected index version: v010471

## Observed

- Authenticated: true
- Before: root=/data/PublicLibrary, ready=10471, processing=0, index=v010471
- Candidate before: status=queued, visible=false, size=12057632, path=陶矜2/2023年素材/2311北京/17号视频/稳定器/100EOS5D/0M4A4126.MOV
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
- Snapshot dir: docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T210434Z/pre-smoke-snapshot
- Missing required: none
- Missing optional: .mixlab-library/admin-read-model/admin.sqlite-wal, .mixlab-library/admin-read-model/admin.sqlite-shm
- Error: none

| Label | Required | Relative Path | Bytes |
| --- | --- | --- | --- |
library-ledger | yes | .mixlab-library/library.json | 472
source-video-manifest | yes | .mixlab-library/videos/V005167/source-video.json | 653
preprocess-job | no | .mixlab-library/videos/V005167/preprocess-job.json | 141
preprocess-log | no | .mixlab-library/logs/V005167.log | 65
admin-read-model | no | .mixlab-library/admin-read-model/admin.sqlite | 21536768

## Post-Execute NAS Files

- Status: checked
- Mount root: /Volumes/MixLab/PublicLibrary
- Attempts: 37
- Wait elapsed: 180025ms
- Refresh command configured: false
- Refresh attempted: false
- Refresh exit code: null
- Refresh error: none
- Error: none

| Relative Path | Exists | Parsed | Contains NUL | Bytes | Fields | Error |
| --- | --- | --- | --- | --- | --- | --- |
.mixlab-library/videos/V005167/source-video.json | yes | yes | yes | 785 | {"source_video_id":"V005167","preprocess_status":"queued","visible_to_cutters":false,"transcript_path":"","srt_path":"","cover_path":"","keyframes_path":""} | none
.mixlab-library/videos/V005167/preprocess-job.json | yes | yes | yes | 205 | {"source_video_id":"V005167","status":"queued","attempt":3,"worker_id":"admin","claimed_at":"2026-06-24T12:49:15.282Z"} | none
.mixlab-library/library.json | yes | yes | no | 472 | {"video_count":11394,"ready_video_count":10471,"queued_video_count":876,"processing_video_count":0,"index_required_video_count":47,"updated_at":"2026-06-29T20:49:24.535Z"} | none

## Summary

- Passed: 13
- Blocked: 0
- Failed: 0
- Needs follow-up: 2
- Dry-run blockers: none
- Execute blockers: none

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
auth_status | GET /api/admin/auth/status | 200 | yes | 8.7ms | none
library_status_before | GET /api/admin/library/status | 200 | yes | 16.8ms | none
preprocess_safety | GET /api/admin/preprocess/safety | 200 | yes | 8.2ms | none
supervisor_status_before | GET /api/admin/preprocess/supervisor/status | 200 | yes | 6.7ms | none
source_videos_processing_before | GET /api/admin/source-videos?status=processing&limit=20 | 200 | yes | 39.4ms | none
source_video_before | GET /api/admin/source-videos/V005167 | 200 | yes | 8.3ms | none
supervisor_start | POST /api/admin/preprocess/supervisor/start | 200 | yes | 13.8ms | none
supervisor_status_poll | GET /api/admin/preprocess/supervisor/status | 200 | yes | 5.8ms | none
supervisor_status_poll | GET /api/admin/preprocess/supervisor/status | 200 | yes | 181.4ms | none
supervisor_status_poll | GET /api/admin/preprocess/supervisor/status | 200 | yes | 10.8ms | none
supervisor_status_poll | GET /api/admin/preprocess/supervisor/status | 200 | yes | 14.4ms | none
supervisor_status_after | GET /api/admin/preprocess/supervisor/status | 200 | yes | 12.9ms | none
library_status_after | GET /api/admin/library/status | 200 | yes | 11.1ms | none
source_videos_processing_after | GET /api/admin/source-videos?status=processing&limit=20 | 200 | yes | 60.4ms | none
source_video_after | GET /api/admin/source-videos/V005167 | 200 | yes | 17.5ms | none
preprocess_job_log_after | GET /api/admin/preprocess/jobs/J005167/log | 200 | yes | 13.4ms | none

## Gates

| Gate | Category | Status | Blocks Dry-run | Blocks Execute | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
single-video-scope-only | scope | pass | yes | yes | source_video_id=V005167. | n/a
nas-docker-admin-target | target | pass | yes | yes | Target URL shape is compatible with the NAS Docker admin-web root. | n/a
readiness-report-green | target | pass | yes | yes | status=ready-for-single-video-review, ready=true, smoke_review=true, ready_count=10471, index=v010471. | n/a
admin-session-authenticated | auth | pass | yes | yes | auth/status returned authenticated=true. | n/a
baseline-before-preserved | library | pass | yes | yes | root=/data/PublicLibrary, ready=10471, index=v010471. | n/a
candidate-is-queued-and-hidden | library | pass | yes | yes | status=queued, visible_to_cutters=false, path=陶矜2/2023年素材/2311北京/17号视频/稳定器/100EOS5D/0M4A4126.MOV, size=12057632. | n/a
no-processing-before-smoke | preprocess | pass | yes | yes | library_processing=0. | processing_count must be 0 and the bounded processing list must respond before any smoke.
preprocess-safety-healthy | preprocess | pass | yes | yes | status=healthy, safe_to_start=true, disk=healthy. | preprocess/safety must report healthy and safe_to_start=true.
supervisor-idle-before-smoke | preprocess | pass | yes | yes | supervisor_idle=true, state=idle. | Supervisor must be idle before single-video smoke.
pre-smoke-snapshot-captured | snapshot | pass | yes | yes | Copied 5 files to docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T210434Z/pre-smoke-snapshot. | n/a
dry-run-does-not-post | execution | needs-follow-up | no | no | Execution mode was explicitly requested. | n/a
execute-body-is-single-target | execution | pass | no | yes | start_body={"limit":1,"source_video_id":"V005167"}. | n/a
single-video-execution-succeeded | execution | pass | no | yes | start_http=200, final_state=idle, claimed=1, succeeded=1, failed=0. | After execute, supervisor must return idle with last_result total=1 succeeded=1 failed=0.
post-smoke-baseline-preserved | postcheck | pass | no | yes | ready_after=10471, index_after=v010471, processing_after=0, source_status_after=index-required, source_visible_after=false. | After execute, ready/index must remain at the expected baseline and the target should be index-required but hidden.
post-smoke-nas-file-persistence | postcheck | needs-follow-up | no | no | status=checked, attempts=37, wait_ms=180025, refresh_configured=false, refresh_attempted=false, refresh_exit=null, source=queued, source_visible=false, job=queued, direct_ready=10471, direct_processing=0, direct_index_required=47, api_index_required=48, direct_queued=876, no_nul=false, diagnosis=smb-stale-post-file-view-suspected, stale_policy_enabled=true. | API and supervisor evidence passed, but the long-running Mac SMB file view looked stale. Run a fresh-process or container-side NAS file check before increasing batch size.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T210434Z.json
- Markdown: docs/acceptance/artifacts/admin-preprocess-single-video-smoke-20260629T210434Z.md
