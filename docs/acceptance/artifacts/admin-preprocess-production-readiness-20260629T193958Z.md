# Admin Preprocess Production Readiness

Generated: 2026-06-29T19:39:58.281Z

Mode: admin-preprocess-production-readiness

Phase: phase-0-1-readiness

Result: ready-for-single-video-review

Phase 0/1 readiness ready: yes

Single-video smoke review ready: yes

Single-video smoke allowed by this report: no

Production batch allowed: no

Preprocess execution allowed: no

Worker start allowed: no

Publish allowed: no

NAS file mutation: no

This readiness probe sends only GET requests to Admin endpoints and reads optional archived proof reports. It does not start workers, process videos, recover/queue/retry/publish items, change Docker, mutate NAS files, or change Cutter protocols. Session-token values are not written to this report.

## Target

- Base URL: http://192.168.1.27:18080
- Normalized base URL: http://192.168.1.27:18080
- Safe to probe: yes
- Classification: Target URL shape is compatible with the NAS Docker admin-web root.
- Notes: This only validates target shape; API/version/disk/worker/Cutter proof gates still decide readiness.
- Session token present: yes
- Expected library root: /data/PublicLibrary
- Expected ready count: 10471
- Expected index version: v010471

## Observed

- Auth: mode=password, authenticated=true
- Library: root=/data/PublicLibrary, total=11394, ready=10471, queued=894, processing=0, index_required=29, current_index=v010471
- Release gates: attention
- Data loading: strategy=shell-first-route-owned-v1, hidden_full_scan_allowed=false
- Preprocess safety: status=healthy, safe_to_start=true, disk=68%/92%
- Supervisor: idle
- Bounded probes: jobs=20, processing=0, queued=1, index_required=1
- Runtime: ffmpeg=true, ffprobe=true, asr_key=true
- Worker proof: status=accepted, image=ghcr.io/alin155/mixlab-admin-runtime:7f522691369862093257c228b4fdace00e20d1fa
- Cutter baseline: status=passed, visible_ready=10471, release=v010471

## External Reports

- Worker env proof: docs/acceptance/artifacts/admin-worker-env-proof-20260629T185859Z.json
- Windows Cutter acceptance: docs/acceptance/artifacts/windows_acceptance-20260629T193424Z-3fbdca7b/report.json

## Summary

- Passed: 14
- Blocked: 0
- Failed: 0
- Needs follow-up: 2
- Phase 0/1 blockers: none
- Single-video smoke blockers: pre-smoke-snapshot-required, single-video-smoke-runbook-required

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
admin_web_root | GET / | 200 | yes | 30.0ms | none
health | GET /health | 200 | yes | 14.8ms | none
auth_status | GET /api/admin/auth/status | 200 | yes | 5.9ms | none
library_status | GET /api/admin/library/status | 200 | yes | 12.8ms | none
release_gates | GET /api/admin/release-gates | 200 | yes | 71.9ms | none
data_loading_plan | GET /api/admin/data-loading/plan | 200 | yes | 11.1ms | none
preprocess_safety | GET /api/admin/preprocess/safety | 200 | yes | 6.9ms | none
preprocess_supervisor_status | GET /api/admin/preprocess/supervisor/status | 200 | yes | 5.5ms | none
preprocess_jobs | GET /api/admin/preprocess/jobs?limit=20 | 200 | yes | 296.5ms | none
source_videos_processing | GET /api/admin/source-videos?status=processing&limit=20 | 200 | yes | 13.5ms | none
source_videos_queued | GET /api/admin/source-videos?status=queued&limit=1 | 200 | yes | 27.3ms | none
source_videos_index_required | GET /api/admin/source-videos?status=index-required&limit=1 | 200 | yes | 12.8ms | none
runtime_settings | GET /api/admin/settings/runtime | 200 | yes | 149.5ms | none

## Gates

| Gate | Category | Status | Blocks Phase 0/1 | Blocks Single-video Smoke | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
read-only-no-write-scope | scope | pass | yes | yes | All probes are GET-only and exclude scan/apply/publish/repair/queue/retry/recover/start/stop/cancel paths. | n/a
nas-docker-admin-target | target | pass | yes | yes | Target URL shape is compatible with the NAS Docker admin-web root. | n/a
required-read-endpoints | target | pass | yes | yes | All required Phase 0/1 read endpoints responded successfully. | n/a
admin-session-authenticated | auth | pass | yes | yes | auth/status returned authenticated=true. | n/a
ready-index-baseline-preserved | library | pass | yes | yes | root=/data/PublicLibrary, ready=10471, index=v010471. | n/a
queue-and-index-required-visible | library | pass | yes | yes | library queued=894, index_required=29, queued_probe=1, index_required_probe=1. | The Admin API must expose at least one queued item for the next single-video smoke and must expose index-required items without auto-publish.
no-active-processing-before-smoke | preprocess | pass | yes | yes | library processing=0, processing_probe=0. | n/a
preprocess-disk-safety-healthy | preprocess | pass | yes | yes | status=healthy, safe_to_start=true, disk=healthy, usage=68%, block=92%. | preprocess/safety must report healthy, safe_to_start=true, and disk not blocked.
preprocess-supervisor-idle | preprocess | pass | yes | yes | supervisor_idle=true, state=idle. | Supervisor must be idle before single-video smoke setup.
bounded-preprocess-jobs-readable | preprocess | pass | yes | yes | jobs=20. | GET /api/admin/preprocess/jobs?limit=20 must succeed before monitoring any smoke.
data-loading-no-hidden-full-scan | preprocess | pass | yes | yes | strategy=shell-first-route-owned-v1, hidden_full_scan_allowed=false. | Data loading plan must keep scan-heavy reads route-owned/read-model backed before production preprocessing.
ffmpeg-ffprobe-asr-visible | runtime | pass | yes | yes | ffmpeg=true, ffprobe=true, asr_key=true. | settings/runtime must show ffmpeg=true, ffprobe=true, and DashScope ASR key configured before a real preprocess smoke.
worker-env-proof-accepted | worker | pass | yes | yes | proof_accepted=true, image=ghcr.io/alin155/mixlab-admin-runtime:7f522691369862093257c228b4fdace00e20d1fa | Provide MIXLAB_ADMIN_WORKER_ENV_PROOF_REPORT from validate:admin-worker-env-proof showing worker flags and /data/PublicLibrary roots.
windows-cutter-baseline-preserved | cutter | pass | yes | yes | status=passed, visible_ready=10471, release=v010471, runner=0.1.32. | Provide MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT with status=passed, ready count >= baseline, and release/index v010471.
pre-smoke-snapshot-required | next-phase | needs-follow-up | no | yes | This Phase 0/1 readiness report is no-write and does not create NAS snapshots. | Before Phase 2, create a reviewed snapshot/rollback point for the selected queued source video and affected manifests/read-model entries.
single-video-smoke-runbook-required | next-phase | needs-follow-up | no | yes | This report does not start workers, queue/retry/recover/publish videos, or run a real preprocess job. | Run the future controlled single-video smoke with explicit candidate id, timeout, concurrency=1, no publish, and post-smoke Cutter compatibility check.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-preprocess-production-readiness-20260629T193958Z.json
- Markdown: docs/acceptance/artifacts/admin-preprocess-production-readiness-20260629T193958Z.md
