# Admin Process History Live Readonly Probe 2026-06-27T11:48:59.547Z

## Scope

This report validates the route-owned preprocess process-history read-model contract against a live Admin API. It is GET-only and does not start reconcile, scan, apply, repair, publish, rebuild, Docker upload, or Cutter protocol work.

## Environment

- API: `http://127.0.0.1:3892`
- Expected library root: `/Volumes/MixLab/PublicLibrary`
- Actual library root: `/Volumes/MixLab/PublicLibrary`
- Auth mode: `disabled`
- Authenticated: `true`
- Current index: `v010471`
- Library updated at: `2026-06-25T19:07:13.162Z`
- Counts: total `11394`, ready `10471`

## Read Model

- Storage: `sqlite`
- Exists: `true`
- Freshness: `fresh`
- Video count: `11394`
- Reconciliation: action `none`, reason `fresh`, scan mode `no-scan`, safe for page request `true`

## Data Loading Contract

- Endpoint found: `true`
- Route found: `true`
- Owner: `unknown`
- Read model: `admin-read-model-v1`
- Scan mode: `no-scan`
- Readiness endpoint found: `true`
- Readiness route found: `true`
- Readiness read model: `admin-read-model-v1`
- Readiness scan mode: `no-scan`

## Process History

- Status: `hit`
- Available: `true`
- Actual data source: `admin-read-model`
- Cache status: `hit`
- Scan mode: `no-scan`
- Window days: `30`
- Limit: `20`
- Returned count: `20`
- Item count: `20`

## Process History Readiness

- Ready: `true`
- Reason: `ready`
- Actual data source: `admin-read-model`
- Scan mode: `no-scan`
- Expected job snapshot rows: `11394`
- Snapshot complete: `true`
- Snapshot metadata row count: `11394`
- Snapshot table row count: `11394`
- Metadata row count matches: `true`
- Table row count matches: `true`

## Gates

| gate | result | detail |
| --- | --- | --- |
| get-only-probe | pass | methods=auth_status:GET,library_status:GET,read_model_status:GET,data_loading_plan:GET,process_history_readiness:GET,process_history:GET |
| request-success | pass | all probe requests returned ok |
| library-root | pass | root_path=/Volumes/MixLab/PublicLibrary, expected=/Volumes/MixLab/PublicLibrary |
| read-model-page-safe | pass | storage=sqlite, exists=true, freshness=fresh, scan_mode=no-scan, safe_for_page_request=true |
| data-loading-contract | pass | endpoint_found=true, route_found=true, scan_mode=no-scan, read_model=admin-read-model-v1, readiness_endpoint_found=true, readiness_route_found=true, readiness_scan_mode=no-scan, readiness_read_model=admin-read-model-v1 |
| process-history-no-scan | pass | status=hit, actual_data_source=admin-read-model, cache_status=hit, scan_mode=no-scan |
| process-history-readiness-no-scan | pass | ready=true, reason=ready, expected=11394, metadata=11394, table=11394, scan_mode=no-scan |
| process-history-bounded | pass | limit=20, window_days=30, item_count=20, returned_count=20 |

## Requests

| name | method | path | status | result | duration | bytes |
| --- | --- | --- | ---: | --- | ---: | ---: |
| auth_status | GET | /api/admin/auth/status | 200 | ok | 52.5ms | 133 |
| library_status | GET | /api/admin/library/status | 200 | ok | 26.2ms | 732 |
| read_model_status | GET | /api/admin/read-model/status | 200 | ok | 101.0ms | 2052 |
| data_loading_plan | GET | /api/admin/data-loading/plan | 200 | ok | 1.1ms | 12679 |
| process_history_readiness | GET | /api/admin/preprocess/process-history/readiness | 200 | ok | 538.4ms | 925 |
| process_history | GET | /api/admin/preprocess/process-history?limit=20&window_days=30 | 200 | ok | 614.0ms | 9930 |

## Result

- Status: `passed`
- Summary: process-history hit through admin-read-model with no-scan; readiness=ready
- Failed gates: none

## Notes

- All probe requests use GET only.
- This probe never starts, cancels, applies, repairs, publishes, rebuilds, or deploys any command.
- A process-history hit proves the live admin.sqlite job snapshot can serve the route-owned panel. A safe miss is still acceptable as no-scan evidence but means the live read model needs a separate gated rebuild before the panel can show rows.
- The admin.sqlite read model is a rebuildable query projection; source-video manifests, preprocess-job files and release/index outputs remain the durable facts.
