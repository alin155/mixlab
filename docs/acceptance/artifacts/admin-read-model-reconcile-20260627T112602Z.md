# Admin Read Model Reconcile 2026-06-27T11:26:02.597Z

## Scope

This report gates a real NAS admin.sqlite read-model reconcile. It may write generated read-model metadata under `.mixlab-library/admin-read-model/` and operation-log entries, but it must not modify source-video manifests, library counts, release/index artifacts, or Cutter protocol data.

## Environment

- API: `http://127.0.0.1:3892`
- Expected library root: `/Volumes/MixLab/PublicLibrary`
- Mode: `apply`
- Allow reconcile: `true`
- Force reconcile: `true`
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
| disk-available | pass | disk_available_bytes=681541509120, minimum=1073741824 |
| source-video-status-fresh | pass | source-video-status freshness=fresh, persisted=fresh |
| reconcile-not-running | pass | status=idle, phase=idle |
| reconcile-action-safe | pass | action=none, reason=fresh, scan_mode=no-scan |
| no-manual-review | pass | action=none, freshness=fresh |

## Read Model Before

- admin.sqlite freshness: `fresh`
- admin.sqlite exists: `true`
- reconciliation action: `none`
- reconciliation reason: `fresh`
- scan mode: `no-scan`
- safe for page request: `true`
- material projection: status `ready`, reason `ready`, scan mode `no-scan`, requires background reconcile `false`, safe for page request `true`
- production projection: status `ready`, reason `ready`, scan mode `no-scan`, requires background reconcile `false`, safe for page request `true`
- process-history projection: status `missing`, reason `missing_metadata`, scan mode `full-reconcile`, requires background reconcile `true`, safe for page request `true`

## Reconcile Action

- Started: `true`
- Accepted: `true`
- Terminal status: `succeeded`
- Terminal phase: `completed`
- Poll count: `187`
- Duration: `258953.4ms`

## Read Model After

- admin.sqlite freshness: `fresh`
- admin.sqlite exists: `true`
- admin.sqlite video count: `11394`
- reconciliation action: `none`
- reconciliation reason: `fresh`
- scan mode: `no-scan`
- safe for page request: `true`
- material projection: status `ready`, reason `ready`, scan mode `no-scan`, requires background reconcile `false`, safe for page request `true`
- production projection: status `ready`, reason `ready`, scan mode `no-scan`, requires background reconcile `false`, safe for page request `true`
- process-history projection: status `ready`, reason `ready`, scan mode `no-scan`, requires background reconcile `false`, safe for page request `true`

## Invariants

| invariant | status | detail |
| --- | --- | --- |
| library-total-count-unchanged | pass | before=11394, after=11394 |
| library-ready-count-unchanged | pass | before=10471, after=10471 |
| library-updated-at-unchanged | pass | before=2026-06-25T19:07:13.162Z, after=2026-06-25T19:07:13.162Z |
| current-index-version-unchanged | pass | before=v010471, after=v010471 |
| source-video-status-remains-fresh | pass | freshness=fresh |
| reconcile-terminal-success | pass | terminal_status=succeeded |
| admin-read-model-fresh | pass | freshness=fresh |
| admin-read-model-safe-for-page | pass | safe_for_page_request=true |
| admin-read-model-no-scan | pass | scan_mode=no-scan |
| admin-read-model-counts-match-library | pass | store_total=11394, library_total=11394 |
| dashboard-material-projection-ready | pass | status=ready, reason=ready, requires_background_reconcile=false |
| dashboard-production-projection-ready | pass | status=ready, reason=ready, requires_background_reconcile=false |
| process-history-projection-ready | pass | status=ready, reason=ready, requires_background_reconcile=false |
| operation-log-readable | fail | status=n/a |
| post-probes-pass | fail | source_videos_index_required:timeout, source_videos_queued:timeout, preprocess_jobs:timeout, process_history_readiness:timeout, process_history:timeout |
| process-history-readiness-ready | fail | ready=unknown, reason=unknown |
| process-history-no-scan-hit | fail | history_available=unknown, source=unknown, scan_mode=unknown |

## Post-Reconcile Probes

| probe | request | status | gate | duration |
| --- | --- | ---: | --- | ---: |
| source_videos_index_required | GET /api/admin/source-videos?status=index-required&limit=20 | n/a | fail | 15001.3ms |
| source_videos_queued | GET /api/admin/source-videos?status=queued&limit=20 | n/a | fail | 15001.7ms |
| preprocess_jobs | GET /api/admin/preprocess/jobs?limit=20 | n/a | fail | 15002.2ms |
| process_history_readiness | GET /api/admin/preprocess/process-history/readiness | n/a | fail | 15002.6ms |
| process_history | GET /api/admin/preprocess/process-history?limit=20&window_days=30 | n/a | fail | 15003.0ms |

## Result

- Status: `failed`
- Passed: `false`
- Summary: One or more reconcile gates failed. Inspect preflight, terminal status, and invariants.
