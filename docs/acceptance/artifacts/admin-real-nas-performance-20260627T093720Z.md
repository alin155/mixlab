# Admin Real NAS Performance Probe 2026-06-27T09:37:20.955Z

## Scope

This report measures read-only Admin API performance against a real public-library root. It separates shell, route, diagnostic and background endpoints so route-blocking work does not get mixed with expensive background scans.

## Environment

- API: `http://127.0.0.1:51307`
- Auth mode: `disabled`
- Authenticated: `true`
- Library root: `/Volumes/MixLab/PublicLibrary`
- Source videos path: `/Volumes/MixLab/PublicLibrary/source-videos`
- Current index: `v010471`
- Updated at: `2026-06-25T19:07:13.162Z`
- Counts: total `11394`, ready `10471`, processing `0`, queued `904`, failed `0`, index-required `19`
- Disk: 634.8 GiB available / 29.0 TiB total (97.9% used)

## Read Model Control Surface

- Admin read model storage: `sqlite`
- Admin read model freshness: `fresh`
- Admin read model exists: `true`
- Admin read model video count: `11394`
- Admin read model reconciliation: action `none`, reason `fresh`, scan mode `no-scan`, requires background reconcile `false`, safe for page request `true`
- Source-video status read model freshness: `fresh`
- Source-video status read model persisted: `fresh`

## Endpoint Results

| endpoint | phase | first status | success | cold | p50 | p95 | max | gate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| health | shell | 200 | 2/2 | 2.8ms | 1.8ms | 2.8ms | 2.8ms | pass |
| auth_status | shell | 200 | 2/2 | 1.3ms | 1.3ms | 2.3ms | 2.3ms | pass |
| library_status | shell | 200 | 2/2 | 25.7ms | 5.9ms | 25.7ms | 25.7ms | pass |
| data_loading_plan | shell | 200 | 2/2 | 1.0ms | 0.7ms | 1.0ms | 1.0ms | pass |
| read_model_status | diagnostic | 200 | 2/2 | 74.1ms | 74.1ms | 78.2ms | 78.2ms | pass |
| read_model_reconcile_status | diagnostic | 200 | 2/2 | 0.9ms | 0.6ms | 0.9ms | 0.9ms | pass |
| protection_status | route | 200 | 2/2 | 0.9ms | 0.6ms | 0.9ms | 0.9ms | pass |
| release_gates | route | 200 | 2/2 | 49.9ms | 19.9ms | 49.9ms | 49.9ms | pass |
| preprocess_safety | route | 200 | 2/2 | 1.0ms | 0.5ms | 1.0ms | 1.0ms | pass |
| operations_overview | route | 200 | 2/2 | 84.6ms | 84.6ms | 88.4ms | 88.4ms | pass |
| operation_log | route | 200 | 2/2 | 25.7ms | 0.4ms | 25.7ms | 25.7ms | pass |
| source_videos_first_page | route | 200 | 2/2 | 1.1ms | 0.5ms | 1.1ms | 1.1ms | pass |
| source_videos_processing | route | 200 | 2/2 | 72.2ms | 72.2ms | 77.2ms | 77.2ms | pass |
| source_videos_index_required | route | 200 | 2/2 | 237.9ms | 228.6ms | 237.9ms | 237.9ms | pass |
| source_videos_queued | route | 200 | 2/2 | 193.7ms | 188.1ms | 193.7ms | 193.7ms | pass |
| source_videos_failed | route | 200 | 2/2 | 78.0ms | 77.6ms | 78.0ms | 78.0ms | pass |
| preprocess_jobs | route | 200 | 2/2 | 473.8ms | 473.8ms | 494.0ms | 494.0ms | pass |
| index_versions | route | 200 | 2/2 | 211.5ms | 1.5ms | 211.5ms | 211.5ms | pass |
| cutter_users | route | 200 | 2/2 | 25.8ms | 2.8ms | 25.8ms | 25.8ms | pass |
| dashboard_metrics | background | 200 | 3/3 | 942.4ms | 1.1ms | 942.4ms | 942.4ms | pass |

## Runtime Source Summary

| endpoint | runtime samples | actual data source | cache status | fallback reasons | repair reasons | runtime slow |
| --- | ---: | --- | --- | --- | --- | ---: |
| health | 0/2 | none | none | none | none | 0 |
| auth_status | 0/2 | none | none | none | none | 0 |
| library_status | 0/2 | none | none | none | none | 0 |
| data_loading_plan | 0/2 | none | none | none | none | 0 |
| read_model_status | 0/2 | none | none | none | none | 0 |
| read_model_reconcile_status | 0/2 | none | none | none | none | 0 |
| protection_status | 0/2 | none | none | none | none | 0 |
| release_gates | 0/2 | none | none | none | none | 0 |
| preprocess_safety | 0/2 | none | none | none | none | 0 |
| operations_overview | 0/2 | none | none | none | none | 0 |
| operation_log | 0/2 | none | none | none | none | 0 |
| source_videos_first_page | 2/2 | admin-read-model=2 | unknown=2 | none | none | 0 |
| source_videos_processing | 2/2 | admin-read-model=2 | hit=2 | none | none | 0 |
| source_videos_index_required | 2/2 | admin-read-model=2 | hit=2 | none | none | 0 |
| source_videos_queued | 2/2 | admin-read-model=2 | hit=2 | none | none | 0 |
| source_videos_failed | 2/2 | admin-read-model=2 | hit=2 | none | none | 0 |
| preprocess_jobs | 2/2 | admin-read-model=2 | hit=2 | none | none | 0 |
| index_versions | 2/2 | current-index=2 | hit=1, miss=1 | none | none | 0 |
| cutter_users | 0/2 | none | none | none | none | 0 |
| dashboard_metrics | 3/3 | admin-read-model=3 | hit=2, miss=1 | none | none | 0 |

## Runtime Component Timing Summary

| endpoint | component | samples | avg | max | data source | scan mode | cache status | detail |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| index_versions | index_package_validation | 1 | 162.0ms | 162.0ms | index-version-packages=1 | paged-list=1 | not-applicable=1 | versions=8;directory_ms=0;current_ms=0=1 |
| index_versions | current_pointer_fast_page | 1 | 46.0ms | 46.0ms | current-index=1 | paged-list=1 | hit=1 | offset=0;limit=8;result=hit;versions=8=1 |
| index_versions | cache_lookup | 1 | 0.0ms | 0.0ms | current-index=1 | no-scan=1 | hit=1 | offset=0;limit=8=1 |
| dashboard_metrics | production_summary | 1 | 363.0ms | 363.0ms | admin-read-model=1 | no-scan=1 | none | none |
| dashboard_metrics | runtime_load | 1 | 260.0ms | 260.0ms | runtime-telemetry=1 | no-scan=1 | none | none |
| dashboard_metrics | material_summary | 1 | 143.0ms | 143.0ms | admin-read-model=1 | no-scan=1 | none | none |
| dashboard_metrics | usage_metrics | 1 | 103.0ms | 103.0ms | admin-read-model=1 | no-scan=1 | none | none |
| dashboard_metrics | status_summary | 1 | 67.0ms | 67.0ms | admin-read-model=1 | no-scan=1 | none | none |
| dashboard_metrics | transcript_metrics | 1 | 2.0ms | 2.0ms | current-index=1 | no-scan=1 | none | none |
| dashboard_metrics | current_index_version | 1 | 1.0ms | 1.0ms | current-index=1 | no-scan=1 | none | none |
| dashboard_metrics | dashboard_metrics_cache | 2 | 0.0ms | 0.0ms | admin-read-model=2 | no-scan=2 | hit=2 | none |
| dashboard_metrics | library_manifest | 1 | 0.0ms | 0.0ms | library-manifest=1 | no-scan=1 | none | none |
| dashboard_metrics | preprocess_jobs | 1 | 0.0ms | 0.0ms | library-manifest=1 | no-scan=1 | none | summary-mode=1 |

## Runtime Component Contract Gates

| endpoint | gate | expected components | observed components | missing components |
| --- | --- | --- | --- | --- |
| preprocess_jobs | missing | concurrency_policy, library_counts, preprocess_job_page, runtime_load | none | concurrency_policy, library_counts, preprocess_job_page, runtime_load |
| index_versions | pass | cache_lookup | cache_lookup, current_pointer_fast_page, index_package_validation | none |


## Findings

- Slow gates: none
- Error/timeout samples: none
- Runtime fallbacks: none
- Runtime repairs: none
- Shell endpoints are expected to stay under 1s p95; route endpoints are expected to stay under 1s p95 after runtime/read-model warm-up; `dashboard_metrics` is background-only and has an 8s p95 budget.

## Notes

- All endpoint probes use GET requests only and send X-MixLab-Admin-Read-Only-Probe: true to disable page-time derived-store repair.
- The probe checks read-model reconcile status but never starts, cancels, applies, repairs, publishes, or runs any command.
- Runtime Source Summary is derived from response meta.runtime fields and does not perform any additional scans.
- When MIXLAB_ADMIN_AUTH_MODE=disabled is used for an isolated local probe, timings represent business I/O after authentication rather than password/session overhead.
- The source-video-status-read-model-v1 persistent JSON file is generated cache under .mixlab-library/admin/read-models and does not rewrite source-video manifests.
- The admin.sqlite read model is an optimization and must remain rebuildable from source-video manifests; it is not the asset source of truth.
