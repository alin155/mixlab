# Admin Real NAS Performance Probe 2026-06-27T10:16:31.526Z

## Scope

This report measures read-only Admin API performance against a real public-library root. It separates shell, route, diagnostic and background endpoints so route-blocking work does not get mixed with expensive background scans.

## Environment

- API: `http://127.0.0.1:52663`
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
| health | shell | 200 | 2/2 | 1.8ms | 1.2ms | 1.8ms | 1.8ms | pass |
| auth_status | shell | 200 | 2/2 | 1.9ms | 1.3ms | 1.9ms | 1.9ms | pass |
| library_status | shell | 200 | 2/2 | 26.6ms | 4.8ms | 26.6ms | 26.6ms | pass |
| data_loading_plan | shell | 200 | 2/2 | 0.9ms | 0.7ms | 0.9ms | 0.9ms | pass |
| read_model_status | diagnostic | 200 | 2/2 | 65.6ms | 65.6ms | 68.1ms | 68.1ms | pass |
| read_model_reconcile_status | diagnostic | 200 | 2/2 | 0.6ms | 0.4ms | 0.6ms | 0.6ms | pass |
| protection_status | route | 200 | 2/2 | 0.9ms | 0.5ms | 0.9ms | 0.9ms | pass |
| release_gates | route | 200 | 2/2 | 97.1ms | 20.5ms | 97.1ms | 97.1ms | pass |
| preprocess_safety | route | 200 | 2/2 | 1.8ms | 1.0ms | 1.8ms | 1.8ms | pass |
| operations_overview | route | 200 | 2/2 | 88.8ms | 87.8ms | 88.8ms | 88.8ms | pass |
| operation_log | route | 200 | 2/2 | 23.8ms | 0.5ms | 23.8ms | 23.8ms | pass |
| source_videos_first_page | route | 200 | 2/2 | 1.0ms | 0.7ms | 1.0ms | 1.0ms | pass |
| source_videos_processing | route | 200 | 2/2 | 64.2ms | 63.3ms | 64.2ms | 64.2ms | pass |
| source_videos_index_required | route | 200 | 2/2 | 183.5ms | 183.5ms | 183.6ms | 183.6ms | pass |
| source_videos_queued | route | 200 | 2/2 | 136.2ms | 136.2ms | 139.9ms | 139.9ms | pass |
| source_videos_failed | route | 200 | 2/2 | 64.5ms | 64.5ms | 68.1ms | 68.1ms | pass |
| preprocess_jobs | route | 200 | 2/2 | 411.8ms | 142.7ms | 411.8ms | 411.8ms | pass |
| index_versions | route | 200 | 2/2 | 256.6ms | 0.5ms | 256.6ms | 256.6ms | pass |
| cutter_users | route | 200 | 2/2 | 26.7ms | 1.1ms | 26.7ms | 26.7ms | pass |
| dashboard_metrics | background | 200 | 3/3 | 471.5ms | 2.0ms | 471.5ms | 471.5ms | pass |

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
| source_videos_processing | status_store_page | 2 | 62.5ms | 63.0ms | admin-read-model=2 | paged-list=2 | hit=2 | status=processing;offset=0;limit=20;manifests=0=2 |
| source_videos_processing | library_counts | 2 | 0.0ms | 0.0ms | library-manifest=2 | no-scan=2 | not-applicable=2 | video_count=11394;status=processing;offset=0;limit=20=2 |
| source_videos_index_required | status_store_page | 2 | 183.0ms | 183.0ms | admin-read-model=2 | paged-list=2 | hit=2 | status=index-required;offset=0;limit=20;manifests=19=2 |
| source_videos_index_required | library_counts | 2 | 0.0ms | 0.0ms | library-manifest=2 | no-scan=2 | not-applicable=2 | video_count=11394;status=index-required;offset=0;limit=20=2 |
| source_videos_queued | status_store_page | 2 | 137.0ms | 139.0ms | admin-read-model=2 | paged-list=2 | hit=2 | status=queued;offset=0;limit=20;manifests=20=2 |
| source_videos_queued | library_counts | 2 | 0.0ms | 0.0ms | library-manifest=2 | no-scan=2 | not-applicable=2 | video_count=11394;status=queued;offset=0;limit=20=2 |
| source_videos_failed | status_store_page | 2 | 65.5ms | 67.0ms | admin-read-model=2 | paged-list=2 | hit=2 | status=failed;offset=0;limit=20;manifests=0=2 |
| source_videos_failed | library_counts | 2 | 0.0ms | 0.0ms | library-manifest=2 | no-scan=2 | not-applicable=2 | video_count=11394;status=failed;offset=0;limit=20=2 |
| preprocess_jobs | runtime_load | 2 | 131.5ms | 263.0ms | runtime-telemetry=2 | no-scan=2 | not-applicable=2 | status=blocked=2 |
| preprocess_jobs | preprocess_job_page | 2 | 142.5ms | 147.0ms | admin-read-model=2 | paged-list=2 | hit=2 | offset=0;limit=20;manifests=20;snapshots=0=2 |
| preprocess_jobs | concurrency_policy | 2 | 2.0ms | 4.0ms | admin-settings=2 | no-scan=2 | not-applicable=2 | concurrency=1=2 |
| preprocess_jobs | library_counts | 2 | 0.0ms | 0.0ms | library-manifest=2 | no-scan=2 | not-applicable=2 | video_count=11394;ready=10471;queued=904;processing=0;failed=0;index_required=19=2 |
| index_versions | index_package_validation | 1 | 219.0ms | 219.0ms | index-version-packages=1 | paged-list=1 | not-applicable=1 | versions=8;directory_ms=0;current_ms=0=1 |
| index_versions | current_pointer_fast_page | 1 | 37.0ms | 37.0ms | current-index=1 | paged-list=1 | hit=1 | offset=0;limit=8;result=hit;versions=8=1 |
| index_versions | cache_lookup | 1 | 0.0ms | 0.0ms | current-index=1 | no-scan=1 | hit=1 | offset=0;limit=8=1 |
| dashboard_metrics | production_summary | 1 | 156.0ms | 156.0ms | admin-read-model=1 | no-scan=1 | none | none |
| dashboard_metrics | material_summary | 1 | 144.0ms | 144.0ms | admin-read-model=1 | no-scan=1 | none | none |
| dashboard_metrics | usage_metrics | 1 | 100.0ms | 100.0ms | admin-read-model=1 | no-scan=1 | none | none |
| dashboard_metrics | status_summary | 1 | 67.0ms | 67.0ms | admin-read-model=1 | no-scan=1 | none | none |
| dashboard_metrics | current_index_version | 1 | 1.0ms | 1.0ms | current-index=1 | no-scan=1 | none | none |
| dashboard_metrics | transcript_metrics | 1 | 1.0ms | 1.0ms | current-index=1 | no-scan=1 | none | none |
| dashboard_metrics | dashboard_metrics_cache | 2 | 0.0ms | 0.0ms | admin-read-model=2 | no-scan=2 | hit=2 | none |
| dashboard_metrics | library_manifest | 1 | 0.0ms | 0.0ms | library-manifest=1 | no-scan=1 | none | none |
| dashboard_metrics | preprocess_jobs | 1 | 0.0ms | 0.0ms | library-manifest=1 | no-scan=1 | none | summary-mode=1 |
| dashboard_metrics | runtime_load | 1 | 0.0ms | 0.0ms | runtime-telemetry=1 | no-scan=1 | none | none |

## Runtime Component Contract Gates

| endpoint | gate | expected components | observed components | missing components |
| --- | --- | --- | --- | --- |
| source_videos_processing | pass | library_counts, status_store_page | library_counts, status_store_page | none |
| source_videos_index_required | pass | library_counts, status_store_page | library_counts, status_store_page | none |
| source_videos_queued | pass | library_counts, status_store_page | library_counts, status_store_page | none |
| preprocess_jobs | pass | concurrency_policy, library_counts, preprocess_job_page, runtime_load | concurrency_policy, library_counts, preprocess_job_page, runtime_load | none |
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
