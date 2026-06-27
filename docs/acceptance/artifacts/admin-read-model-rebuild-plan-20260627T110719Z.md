# Admin Read Model Rebuild Plan 2026-06-27T11:07:19.864Z

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
- Disk: 634.7 GiB available / 29.0 TiB total

## Current Read Model

- Store path: `/Volumes/MixLab/PublicLibrary/.mixlab-library/admin-read-model/admin.sqlite`
- Storage: `sqlite`
- Exists: `true`
- Freshness: `fresh`
- Video count: `11394`
- Reconciliation: action `none`, reason `fresh`, scan mode `no-scan`, safe for page request `true`
- Reconciler runtime: status `succeeded`, phase `completed`

## Read Model Projection Readiness

| projection | status | reason | scan mode | requires background reconcile | safe for page request | video count | current video count |
| --- | --- | --- | --- | --- | --- | ---: | ---: |
| material_summary | ready | ready | no-scan | false | true | 11394 | 11394 |
| production_summary | ready | ready | no-scan | false | true | 11394 | 11394 |

## Process History State

- Current process-history status: `hit`
- Current process-history source: `admin-read-model`
- Current process-history scan mode: `no-scan`
- Readiness ready: `true`
- Readiness reason: `ready`
- Last error: `none`
- Expected job snapshot rows: `11394`
- Snapshot metadata row count: `11394`
- Snapshot table row count: `11394`

## Plan

- Mode: `plan-only`
- Needed: `false`
- Planned action: `no-op`
- Reason: `ready`
- Separate execution required: `true`
- Runner: `scripts/acceptance/admin-read-model-reconcile.ts`

Required environment for a later execution:

- none

Allowed mutation paths for later execution:

- none

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
| request-success | pass | all probe requests returned ok |
| library-root | pass | root_path=/Volumes/MixLab/PublicLibrary, expected=/Volumes/MixLab/PublicLibrary |
| disk-available | pass | disk_available=634.7 GiB, minimum=1.0 GiB |
| reconcile-not-running | pass | status=succeeded, phase=completed |
| process-history-currently-no-scan | pass | status=hit, source=admin-read-model, scan_mode=no-scan |
| readiness-explains-state | pass | ready=true, reason=ready, last_error=none |
| projection-plan-covers-background-reconcile | pass | projection_reasons=none, plan_needed=false |
| bounded-mutation-scope-only | pass | allowed=none, forbidden=6 |
| protected-invariants-recorded | pass | total=11394, ready=10471, updated_at=2026-06-25T19:07:13.162Z, index=v010471 |

## Requests

| probe | request | status | gate | duration |
| --- | --- | ---: | --- | ---: |
| auth_status | GET /api/admin/auth/status | 200 | pass | 65.3ms |
| library_status | GET /api/admin/library/status | 200 | pass | 57.8ms |
| read_model_status | GET /api/admin/read-model/status | 200 | pass | 98.3ms |
| reconcile_status | GET /api/admin/read-model/reconcile/status | 200 | pass | 0.8ms |
| process_history_readiness | GET /api/admin/preprocess/process-history/readiness | 200 | pass | 279.8ms |
| process_history | GET /api/admin/preprocess/process-history?limit=20&window_days=30 | 200 | pass | 14021.1ms |

## Result

- Status: `passed`
- Passed: `true`
- Summary: plan-only rebuild gate passed; no rebuild needed
