# Admin Read Model Rebuild Plan 2026-06-26T11:18:45.812Z

## Scope

This is a plan-only gate for a live NAS Admin read-model rebuild or migration. It uses GET requests only and does not start reconcile, scan, apply, repair, publish, rebuild, Docker upload, or Cutter protocol work.

## Environment

- API: `http://127.0.0.1:3892`
- Expected library root: `/Volumes/MixLab/PublicLibrary`
- Actual library root: `/Volumes/MixLab/PublicLibrary`
- Auth mode: `disabled`
- Authenticated: `true`
- Current index: `v010471`
- Library updated at: `2026-06-25T19:07:13.162Z`
- Counts: total `11394`, ready `10471`, queued `904`, processing `0`, failed `0`, index-required `19`
- Disk: 627.8 GiB available / 29.0 TiB total

## Current Read Model

- Store path: `/Volumes/MixLab/PublicLibrary/.mixlab-library/admin-read-model/admin.sqlite`
- Storage: `sqlite`
- Exists: `true`
- Freshness: `fresh`
- Video count: `11394`
- Reconciliation: action `none`, reason `fresh`, scan mode `no-scan`, safe for page request `true`
- Reconciler runtime: status `idle`, phase `idle`

## Process History State

- Current process-history status: `safe-miss`
- Current process-history source: `admin-read-model`
- Current process-history scan mode: `no-scan`
- Readiness ready: `false`
- Readiness reason: `snapshot_incomplete`
- Last error: `none`
- Expected job snapshot rows: `11394`
- Snapshot metadata row count: `0`
- Snapshot table row count: `0`

## Plan

- Mode: `plan-only`
- Needed: `true`
- Planned action: `force-rebuild-derived-admin-read-model`
- Separate execution required: `true`
- Runner: `scripts/acceptance/admin-read-model-reconcile.ts`

Required environment for a later execution:

- `MIXLAB_ADMIN_API_BASE_URL=http://127.0.0.1:3892`
- `MIXLAB_ADMIN_READ_MODEL_EXPECT_ROOT=/Volumes/MixLab/PublicLibrary`
- `MIXLAB_ADMIN_READ_MODEL_RECONCILE_ALLOW=true`
- `MIXLAB_ADMIN_READ_MODEL_RECONCILE_FORCE=true`

Allowed mutation paths for later execution:

- `/Volumes/MixLab/PublicLibrary/.mixlab-library/admin-read-model/admin.sqlite`
- `/Volumes/MixLab/PublicLibrary/.mixlab-library/admin-read-model/admin.sqlite-*`
- `/Volumes/MixLab/PublicLibrary/.mixlab-library/admin-read-model`
- `/Volumes/MixLab/PublicLibrary/.mixlab-library/admin/operation-log/events.ndjson`

Forbidden effects:

- Do not modify source-video manifests.
- Do not modify library.json counts or library.updated_at.
- Do not modify release/index artifacts or Cutter release/search protocols.
- Do not requeue, rerun, delete, hide, or downline ready source videos.
- Do not upload Docker images or change NAS container configuration in this step.
- Do not use operation-log audit entries as a business-state source of truth.

Post-run invariants:

- library.video_count stays unchanged.
- library.ready_video_count stays unchanged.
- library.updated_at stays unchanged.
- current_index_version stays unchanged.
- admin-read-model freshness becomes fresh and safe_for_page_request remains true.
- process-history readiness becomes ready or the follow-up run is treated as failed.

## Gates

| gate | status | detail |
| --- | --- | --- |
| get-only-plan | pass | requests=GET /api/admin/auth/status, GET /api/admin/library/status, GET /api/admin/read-model/status, GET /api/admin/read-model/reconcile/status, GET /api/admin/preprocess/process-history/readiness, GET /api/admin/preprocess/process-history?limit=20&window_days=30 |
| request-success | pass | all probe requests returned ok |
| library-root | pass | root_path=/Volumes/MixLab/PublicLibrary, expected=/Volumes/MixLab/PublicLibrary |
| disk-available | pass | disk_available=627.8 GiB, minimum=1.0 GiB |
| reconcile-not-running | pass | status=idle, phase=idle |
| process-history-currently-no-scan | pass | status=safe-miss, source=admin-read-model, scan_mode=no-scan |
| readiness-explains-state | pass | ready=false, reason=snapshot_incomplete, last_error=none |
| bounded-mutation-scope-only | pass | allowed=/Volumes/MixLab/PublicLibrary/.mixlab-library/admin-read-model/admin.sqlite, /Volumes/MixLab/PublicLibrary/.mixlab-library/admin-read-model/admin.sqlite-*, /Volumes/MixLab/PublicLibrary/.mixlab-library/admin-read-model, /Volumes/MixLab/PublicLibrary/.mixlab-library/admin/operation-log/events.ndjson, forbidden=6 |
| protected-invariants-recorded | pass | total=11394, ready=10471, updated_at=2026-06-25T19:07:13.162Z, index=v010471 |

## Requests

| probe | request | status | gate | duration |
| --- | --- | ---: | --- | ---: |
| auth_status | GET /api/admin/auth/status | 200 | pass | 53.4ms |
| library_status | GET /api/admin/library/status | 200 | pass | 64.0ms |
| read_model_status | GET /api/admin/read-model/status | 200 | pass | 100.6ms |
| reconcile_status | GET /api/admin/read-model/reconcile/status | 200 | pass | 0.7ms |
| process_history_readiness | GET /api/admin/preprocess/process-history/readiness | 200 | pass | 169.6ms |
| process_history | GET /api/admin/preprocess/process-history?limit=20&window_days=30 | 200 | pass | 137.8ms |

## Result

- Status: `passed`
- Passed: `true`
- Summary: plan-only rebuild gate passed; reason=snapshot_incomplete; execute separate reconcile runner if proceeding
