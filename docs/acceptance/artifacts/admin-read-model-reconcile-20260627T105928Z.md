# Admin Read Model Reconcile 2026-06-27T10:59:28.827Z

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
| disk-available | pass | disk_available_bytes=681560952832, minimum=1073741824 |
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
- material projection: status `missing`, reason `missing_metadata`, scan mode `full-reconcile`, requires background reconcile `true`, safe for page request `true`
- production projection: status `ready`, reason `ready`, scan mode `no-scan`, requires background reconcile `false`, safe for page request `true`

## Reconcile Action

- Started: `true`
- Accepted: `true`
- Terminal status: `succeeded`
- Terminal phase: `completed`
- Poll count: `159`
- Duration: `188565.5ms`

## Read Model After

- admin.sqlite freshness: `unknown`
- admin.sqlite exists: `unknown`
- admin.sqlite video count: `n/a`
- reconciliation action: `unknown`
- reconciliation reason: `unknown`
- scan mode: `unknown`
- safe for page request: `unknown`
- material projection: status `unknown`, reason `unknown`, scan mode `unknown`, requires background reconcile `unknown`, safe for page request `unknown`
- production projection: status `unknown`, reason `unknown`, scan mode `unknown`, requires background reconcile `unknown`, safe for page request `unknown`

## Invariants

| invariant | status | detail |
| --- | --- | --- |
| library-total-count-unchanged | pass | before=11394, after=11394 |
| library-ready-count-unchanged | pass | before=10471, after=10471 |
| library-updated-at-unchanged | pass | before=2026-06-25T19:07:13.162Z, after=2026-06-25T19:07:13.162Z |
| current-index-version-unchanged | pass | before=v010471, after=v010471 |
| source-video-status-remains-fresh | fail | freshness=unknown |
| reconcile-terminal-success | pass | terminal_status=succeeded |
| admin-read-model-fresh | fail | freshness=unknown |
| admin-read-model-safe-for-page | fail | safe_for_page_request=unknown |
| admin-read-model-no-scan | fail | scan_mode=unknown |
| admin-read-model-counts-match-library | fail | store_total=n/a, library_total=11394 |
| dashboard-material-projection-ready | fail | status=unknown, reason=unknown, requires_background_reconcile=unknown |
| dashboard-production-projection-ready | fail | status=unknown, reason=unknown, requires_background_reconcile=unknown |
| operation-log-readable | pass | status=200 |
| post-probes-pass | pass | source_videos_index_required:ok, source_videos_queued:ok, preprocess_jobs:ok, process_history_readiness:ok, process_history:ok |
| process-history-readiness-ready | pass | ready=true, reason=ready |
| process-history-no-scan-hit | pass | history_available=true, source=admin-read-model, scan_mode=no-scan |

## Post-Reconcile Probes

| probe | request | status | gate | duration |
| --- | --- | ---: | --- | ---: |
| source_videos_index_required | GET /api/admin/source-videos?status=index-required&limit=20 | 200 | pass | 326.1ms |
| source_videos_queued | GET /api/admin/source-videos?status=queued&limit=20 | 200 | pass | 6845.7ms |
| preprocess_jobs | GET /api/admin/preprocess/jobs?limit=20 | 200 | pass | 10984.2ms |
| process_history_readiness | GET /api/admin/preprocess/process-history/readiness | 200 | pass | 314.9ms |
| process_history | GET /api/admin/preprocess/process-history?limit=20&window_days=30 | 200 | pass | 13999.9ms |

## Result

- Status: `failed`
- Passed: `false`
- Summary: One or more reconcile gates failed. Inspect preflight, terminal status, and invariants.
