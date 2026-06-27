# Admin Read Model Reconcile 2026-06-25T22:59:27.637Z

## Scope

This report gates a real NAS admin.sqlite read-model reconcile. It may write generated read-model metadata under `.mixlab-library/admin-read-model/` and operation-log entries, but it must not modify source-video manifests, library counts, release/index artifacts, or Cutter protocol data.

## Environment

- API: `http://127.0.0.1:3891`
- Expected library root: `/Volumes/MixLab/PublicLibrary`
- Mode: `dry-run`
- Allow reconcile: `false`
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

- Started: `false`
- Accepted: `false`
- Terminal status: `idle`
- Terminal phase: `idle`
- Poll count: `0`
- Duration: `n/a`

## Read Model After

- admin.sqlite freshness: `missing`
- admin.sqlite exists: `false`
- admin.sqlite video count: `0`
- reconciliation action: `build`
- reconciliation reason: `missing_store`
- scan mode: `full-reconcile`
- safe for page request: `false`

## Invariants

| invariant | status | detail |
| --- | --- | --- |
| library-total-count-unchanged | pass | before=11394, after=11394 |
| library-ready-count-unchanged | pass | before=10471, after=10471 |
| library-updated-at-unchanged | pass | before=2026-06-25T19:07:13.162Z, after=2026-06-25T19:07:13.162Z |
| source-video-status-remains-fresh | pass | freshness=fresh |
| operation-log-readable | pass | status=200 |
| post-probes-pass | pass | source_videos_index_required:ok, source_videos_queued:ok, preprocess_jobs:ok |

## Post-Reconcile Probes

| probe | request | status | gate | duration |
| --- | --- | ---: | --- | ---: |
| source_videos_index_required | GET /api/admin/source-videos?status=index-required&limit=20 | 200 | pass | 1.2ms |
| source_videos_queued | GET /api/admin/source-videos?status=queued&limit=20 | 200 | pass | 1.4ms |
| preprocess_jobs | GET /api/admin/preprocess/jobs?limit=20 | 200 | pass | 262.8ms |

## Result

- Status: `dry-run`
- Passed: `true`
- Summary: Preflight passed; reconcile was not started because allow flag is not enabled.
