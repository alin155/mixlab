# Admin Read Model Reconcile 2026-06-25T22:59:33.277Z

## Scope

This report gates a real NAS admin.sqlite read-model reconcile. It may write generated read-model metadata under `.mixlab-library/admin-read-model/` and operation-log entries, but it must not modify source-video manifests, library counts, release/index artifacts, or Cutter protocol data.

## Environment

- API: `http://127.0.0.1:3891`
- Expected library root: `/Volumes/MixLab/PublicLibrary`
- Mode: `apply`
- Allow reconcile: `true`
- Library root: `/Volumes/MixLab/PublicLibrary`
- Counts before: total `11394`, ready `10471`, queued `904`, index-required `19`

## Preflight Gates

| gate | status | detail |
| --- | --- | --- |
| health | pass | status=200 |
| auth-status | pass | status=200 |
| library-status | pass | status=200 |
| read-model-status | pass | status=200 |
| reconcile-status | pass | status=200 |
| library-root | pass | root_path=/Volumes/MixLab/PublicLibrary, expected=/Volumes/MixLab/PublicLibrary |
| disk-available | pass | disk_available_bytes=674128388096, minimum=1073741824 |
| source-video-status-fresh | pass | source-video-status freshness=fresh, persisted=fresh |
| reconcile-not-running | pass | status=idle, phase=idle |
| reconcile-action-safe | pass | action=build, reason=missing_store, scan_mode=full-reconcile |
| no-manual-review | pass | action=build, freshness=missing |

## Read Model Before

- admin.sqlite freshness: `missing`
- admin.sqlite exists: `false`
- reconciliation action: `build`
- reconciliation reason: `missing_store`
- scan mode: `full-reconcile`
- safe for page request: `false`

## Reconcile Action

- Started: `true`
- Accepted: `true`
- Terminal status: `succeeded`
- Terminal phase: `completed`
- Poll count: `97`
- Duration: `100211.5ms`

## Read Model After

- admin.sqlite freshness: `fresh`
- admin.sqlite exists: `true`
- admin.sqlite video count: `11394`
- reconciliation action: `none`
- reconciliation reason: `fresh`
- scan mode: `no-scan`
- safe for page request: `true`

## Invariants

| invariant | status | detail |
| --- | --- | --- |
| library-total-count-unchanged | pass | before=11394, after=11394 |
| library-ready-count-unchanged | pass | before=10471, after=10471 |
| library-updated-at-unchanged | pass | before=2026-06-25T19:07:13.162Z, after=2026-06-25T19:07:13.162Z |
| source-video-status-remains-fresh | fail | freshness=building |
| reconcile-terminal-success | pass | terminal_status=succeeded |
| admin-read-model-fresh | pass | freshness=fresh |
| admin-read-model-safe-for-page | pass | safe_for_page_request=true |
| admin-read-model-no-scan | pass | scan_mode=no-scan |
| admin-read-model-counts-match-library | pass | store_total=11394, library_total=11394 |
| operation-log-readable | pass | status=200 |
| post-probes-pass | pass | source_videos_index_required:ok, source_videos_queued:ok, preprocess_jobs:ok |

## Post-Reconcile Probes

| probe | request | status | gate | duration |
| --- | --- | ---: | --- | ---: |
| source_videos_index_required | GET /api/admin/source-videos?status=index-required&limit=20 | 200 | pass | 627.1ms |
| source_videos_queued | GET /api/admin/source-videos?status=queued&limit=20 | 200 | pass | 1654.5ms |
| preprocess_jobs | GET /api/admin/preprocess/jobs?limit=20 | 200 | pass | 2217.8ms |

## Result

- Status: `failed`
- Passed: `false`
- Summary: One or more reconcile gates failed. Inspect preflight, terminal status, and invariants.
