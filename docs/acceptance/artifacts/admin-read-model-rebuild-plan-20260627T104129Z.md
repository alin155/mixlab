# Admin Read Model Rebuild Plan 2026-06-27T10:41:29.799Z

## Scope

This is a plan-only gate for a live NAS Admin read-model rebuild or migration. It uses GET requests only and does not start reconcile, scan, apply, repair, publish, rebuild, Docker upload, or Cutter protocol work.

## Environment

- API: `http://127.0.0.1:3889`
- Expected library root: `/Volumes/MixLab/PublicLibrary`
- Actual library root: `unknown`
- Auth mode: `password`
- Authenticated: `false`
- Current index: `unknown`
- Library updated at: `unknown`
- Counts: total `n/a`, ready `n/a`, queued `n/a`, processing `n/a`, failed `n/a`, index-required `n/a`
- Disk: n/a available / n/a total

## Current Read Model

- Store path: `unknown`
- Storage: `unknown`
- Exists: `unknown`
- Freshness: `unknown`
- Video count: `n/a`
- Reconciliation: action `unknown`, reason `unknown`, scan mode `unknown`, safe for page request `unknown`
- Reconciler runtime: status `unknown`, phase `unknown`

## Read Model Projection Readiness

| projection | status | reason | scan mode | requires background reconcile | safe for page request | video count | current video count |
| --- | --- | --- | --- | --- | --- | ---: | ---: |
| material_summary | unavailable | missing_projection_status | no-scan | unknown | unknown | n/a | n/a |
| production_summary | unavailable | missing_projection_status | no-scan | unknown | unknown | n/a | n/a |

## Process History State

- Current process-history status: `unavailable`
- Current process-history source: `unknown`
- Current process-history scan mode: `unknown`
- Readiness ready: `null`
- Readiness reason: `unknown`
- Last error: `none`
- Expected job snapshot rows: `n/a`
- Snapshot metadata row count: `n/a`
- Snapshot table row count: `n/a`

## Plan

- Mode: `plan-only`
- Needed: `true`
- Planned action: `force-rebuild-derived-admin-read-model`
- Reason: `process_history:unknown`
- Separate execution required: `true`
- Runner: `scripts/acceptance/admin-read-model-reconcile.ts`

Required environment for a later execution:

- `MIXLAB_ADMIN_API_BASE_URL=http://127.0.0.1:3889`
- `MIXLAB_ADMIN_READ_MODEL_EXPECT_ROOT=/Volumes/MixLab/PublicLibrary`
- `MIXLAB_ADMIN_READ_MODEL_RECONCILE_ALLOW=true`
- `MIXLAB_ADMIN_READ_MODEL_RECONCILE_FORCE=true`

Allowed mutation paths for later execution:

- `/.mixlab-library/admin-read-model/admin.sqlite`
- `/.mixlab-library/admin-read-model/admin.sqlite-*`
- `/.mixlab-library/admin-read-model`
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
- dashboard material and production projections become ready or the follow-up run is treated as failed.
- process-history readiness becomes ready or the follow-up run is treated as failed.

## Gates

| gate | status | detail |
| --- | --- | --- |
| get-only-plan | pass | requests=GET /api/admin/auth/status, GET /api/admin/library/status, GET /api/admin/read-model/status, GET /api/admin/read-model/reconcile/status, GET /api/admin/preprocess/process-history/readiness, GET /api/admin/preprocess/process-history?limit=20&window_days=30 |
| request-success | fail | library_status:401,read_model_status:401,reconcile_status:401,process_history_readiness:401,process_history:401 |
| library-root | fail | root_path=unknown, expected=/Volumes/MixLab/PublicLibrary |
| disk-available | fail | disk_available=n/a, minimum=1.0 GiB |
| reconcile-not-running | pass | status=unknown, phase=unknown |
| process-history-currently-no-scan | fail | status=unavailable, source=unknown, scan_mode=unknown |
| readiness-explains-state | fail | ready=null, reason=unknown, last_error=none |
| projection-plan-covers-background-reconcile | pass | projection_reasons=none, plan_needed=true |
| bounded-mutation-scope-only | pass | allowed=/.mixlab-library/admin-read-model/admin.sqlite, /.mixlab-library/admin-read-model/admin.sqlite-*, /.mixlab-library/admin-read-model, /Volumes/MixLab/PublicLibrary/.mixlab-library/admin/operation-log/events.ndjson, forbidden=6 |
| protected-invariants-recorded | fail | total=n/a, ready=n/a, updated_at=unknown, index=unknown |

## Requests

| probe | request | status | gate | duration |
| --- | --- | ---: | --- | ---: |
| auth_status | GET /api/admin/auth/status | 200 | pass | 69.5ms |
| library_status | GET /api/admin/library/status | 401 | fail | 1.2ms |
| read_model_status | GET /api/admin/read-model/status | 401 | fail | 1.2ms |
| reconcile_status | GET /api/admin/read-model/reconcile/status | 401 | fail | 0.6ms |
| process_history_readiness | GET /api/admin/preprocess/process-history/readiness | 401 | fail | 0.5ms |
| process_history | GET /api/admin/preprocess/process-history?limit=20&window_days=30 | 401 | fail | 0.4ms |

## Result

- Status: `failed`
- Passed: `false`
- Summary: failed gates: request-success, library-root, disk-available, process-history-currently-no-scan, readiness-explains-state, protected-invariants-recorded
