# Admin Real NAS Performance Probe 2026-06-29T09:00:42.329Z

## Scope

This report measures read-only Admin API performance against a real public-library root. It separates shell, route, diagnostic and background endpoints so route-blocking work does not get mixed with expensive background scans.

## Environment

- API: `http://127.0.0.1:53978`
- Auth mode: `disabled`
- Authenticated: `true`
- Library root: `/Volumes/MixLab/PublicLibrary`
- Source videos path: `/Volumes/MixLab/PublicLibrary/source-videos`
- Current index: `v010471`
- Updated at: `2026-06-25T19:07:13.162Z`
- Counts: total `11394`, ready `10471`, processing `0`, queued `904`, failed `0`, index-required `19`
- Disk: 14.8 TiB available / 43.4 TiB total (65.9% used)

## Read Model Control Surface

- Admin read model storage: `sqlite`
- Admin read model freshness: `fresh`
- Admin read model exists: `true`
- Admin read model video count: `11394`
- Admin read model reconciliation: action `none`, reason `fresh`, scan mode `no-scan`, requires background reconcile `false`, safe for page request `true`
- Source-video status read model freshness: `fresh`
- Source-video status read model persisted: `fresh`

## Read Model Projection Readiness

| projection | status | reason | scan mode | requires background reconcile | safe for page request | video count | current video count |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| material_summary | ready | ready | no-scan | false | true | 11394 | 11394 |
| production_summary | ready | ready | no-scan | false | true | 11394 | 11394 |
| process_history | ready | ready | no-scan | false | true | 11394 | 11394 |

## Endpoint Results

| endpoint | phase | first status | success | cold | p50 | p95 | max | gate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| health | shell | 200 | 2/2 | 2.8ms | 2.3ms | 2.8ms | 2.8ms | pass |
| auth_status | shell | 200 | 2/2 | 1.7ms | 1.3ms | 1.7ms | 1.7ms | pass |
| library_status | shell | 200 | 2/2 | 24.4ms | 5.7ms | 24.4ms | 24.4ms | pass |
| data_loading_plan | shell | 200 | 2/2 | 1.3ms | 0.7ms | 1.3ms | 1.3ms | pass |
| read_model_status | diagnostic | 200 | 2/2 | 92.7ms | 92.7ms | 95.7ms | 95.7ms | pass |
| read_model_reconcile_status | diagnostic | 200 | 2/2 | 1.5ms | 0.6ms | 1.5ms | 1.5ms | pass |
| protection_status | route | 200 | 2/2 | 1.1ms | 0.6ms | 1.1ms | 1.1ms | pass |
| release_gates | route | 200 | 2/2 | 80.9ms | 23.5ms | 80.9ms | 80.9ms | pass |
| preprocess_safety | route | 200 | 2/2 | 1.1ms | 0.5ms | 1.1ms | 1.1ms | pass |
| operations_overview | route | 200 | 2/2 | 105.7ms | 105.7ms | 107.4ms | 107.4ms | pass |
| operation_log | route | 200 | 2/2 | 110.9ms | 1.8ms | 110.9ms | 110.9ms | pass |
| source_videos_first_page | route | 200 | 2/2 | 3.3ms | 1.7ms | 3.3ms | 3.3ms | pass |
| source_videos_processing | route | 200 | 2/2 | 84.9ms | 84.9ms | 98.0ms | 98.0ms | pass |
| source_videos_index_required | route | 200 | 2/2 | 386.8ms | 232.9ms | 386.8ms | 386.8ms | pass |
| source_videos_queued | route | 200 | 2/2 | 236.9ms | 207.1ms | 236.9ms | 236.9ms | pass |
| source_videos_failed | route | 200 | 2/2 | 84.9ms | 84.9ms | 107.1ms | 107.1ms | pass |
| preprocess_jobs | route | 200 | 2/2 | 480.0ms | 208.4ms | 480.0ms | 480.0ms | pass |
| index_versions | route | 200 | 2/2 | 239.7ms | 1.8ms | 239.7ms | 239.7ms | pass |
| cutter_users | route | 200 | 2/2 | 23.2ms | 3.6ms | 23.2ms | 23.2ms | pass |
| dashboard_metrics | background | 200 | 3/3 | 1208.2ms | 2.6ms | 1208.2ms | 1208.2ms | pass |

## Runtime Source Summary

| endpoint | runtime samples | actual data source | scan mode | cache status | fallback reasons | repair reasons | runtime slow |
| --- | ---: | --- | --- | --- | --- | --- | ---: |
| health | 0/2 | none | none | none | none | none | 0 |
| auth_status | 0/2 | none | none | none | none | none | 0 |
| library_status | 0/2 | none | none | none | none | none | 0 |
| data_loading_plan | 0/2 | none | none | none | none | none | 0 |
| read_model_status | 0/2 | none | none | none | none | none | 0 |
| read_model_reconcile_status | 0/2 | none | none | none | none | none | 0 |
| protection_status | 0/2 | none | none | none | none | none | 0 |
| release_gates | 0/2 | none | none | none | none | none | 0 |
| preprocess_safety | 0/2 | none | none | none | none | none | 0 |
| operations_overview | 0/2 | none | none | none | none | none | 0 |
| operation_log | 0/2 | none | none | none | none | none | 0 |
| source_videos_first_page | 2/2 | admin-read-model=2 | paged-list=2 | unknown=2 | none | none | 0 |
| source_videos_processing | 2/2 | admin-read-model=2 | paged-list=2 | hit=2 | none | none | 0 |
| source_videos_index_required | 2/2 | admin-read-model=2 | paged-list=2 | hit=2 | none | none | 0 |
| source_videos_queued | 2/2 | admin-read-model=2 | paged-list=2 | hit=2 | none | none | 0 |
| source_videos_failed | 2/2 | admin-read-model=2 | paged-list=2 | hit=2 | none | none | 0 |
| preprocess_jobs | 2/2 | admin-read-model=2 | status-scan=2 | hit=2 | none | none | 0 |
| index_versions | 2/2 | current-index=2 | paged-list=2 | hit=1, miss=1 | none | none | 0 |
| cutter_users | 0/2 | none | none | none | none | none | 0 |
| dashboard_metrics | 3/3 | admin-read-model=3 | no-scan=3 | hit=2, miss=1 | none | none | 0 |

## Runtime Component Timing Summary

| endpoint | component | samples | avg | max | data source | scan mode | cache status | detail |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| source_videos_processing | status_store_page | 2 | 88.5ms | 95.0ms | admin-read-model=2 | paged-list=2 | hit=2 | status=processing;offset=0;limit=20;manifests=0=2 |
| source_videos_processing | library_counts | 2 | 0.0ms | 0.0ms | library-manifest=2 | no-scan=2 | not-applicable=2 | video_count=11394;status=processing;offset=0;limit=20=2 |
| source_videos_index_required | status_store_page | 2 | 306.5ms | 383.0ms | admin-read-model=2 | paged-list=2 | hit=2 | status=index-required;offset=0;limit=20;manifests=19=2 |
| source_videos_index_required | library_counts | 2 | 0.0ms | 0.0ms | library-manifest=2 | no-scan=2 | not-applicable=2 | video_count=11394;status=index-required;offset=0;limit=20=2 |
| source_videos_queued | status_store_page | 2 | 220.0ms | 235.0ms | admin-read-model=2 | paged-list=2 | hit=2 | status=queued;offset=0;limit=20;manifests=20=2 |
| source_videos_queued | library_counts | 2 | 0.0ms | 0.0ms | library-manifest=2 | no-scan=2 | not-applicable=2 | video_count=11394;status=queued;offset=0;limit=20=2 |
| source_videos_failed | status_store_page | 2 | 93.0ms | 104.0ms | admin-read-model=2 | paged-list=2 | hit=2 | status=failed;offset=0;limit=20;manifests=0=2 |
| source_videos_failed | library_counts | 2 | 0.5ms | 1.0ms | library-manifest=2 | no-scan=2 | not-applicable=2 | video_count=11394;status=failed;offset=0;limit=20=2 |
| preprocess_jobs | runtime_load | 2 | 130.5ms | 261.0ms | runtime-telemetry=2 | no-scan=2 | not-applicable=2 | status=healthy=2 |
| preprocess_jobs | preprocess_job_page | 2 | 208.5ms | 212.0ms | admin-read-model=2 | paged-list=2 | hit=2 | offset=0;limit=20;manifests=20;snapshots=0=2 |
| preprocess_jobs | concurrency_policy | 2 | 0.5ms | 1.0ms | admin-settings=2 | no-scan=2 | not-applicable=2 | concurrency=1=2 |
| preprocess_jobs | library_counts | 2 | 0.0ms | 0.0ms | library-manifest=2 | no-scan=2 | not-applicable=2 | video_count=11394;ready=10471;queued=904;processing=0;failed=0;index_required=19=2 |
| index_versions | index_package_validation | 1 | 181.0ms | 181.0ms | index-version-packages=1 | paged-list=1 | not-applicable=1 | versions=8;directory_ms=0;current_ms=0=1 |
| index_versions | current_pointer_fast_page | 1 | 55.0ms | 55.0ms | current-index=1 | paged-list=1 | hit=1 | offset=0;limit=8;result=hit;versions=8=1 |
| index_versions | cache_lookup | 1 | 0.0ms | 0.0ms | current-index=1 | no-scan=1 | hit=1 | offset=0;limit=8=1 |
| dashboard_metrics | usage_metrics | 1 | 800.0ms | 800.0ms | usage-events=1 | status-scan=1 | miss=1 | usage_projection=summary-stored=1 |
| dashboard_metrics | production_summary | 1 | 222.0ms | 222.0ms | admin-read-model=1 | no-scan=1 | none | none |
| dashboard_metrics | status_summary | 1 | 91.0ms | 91.0ms | admin-read-model=1 | no-scan=1 | none | none |
| dashboard_metrics | material_summary | 1 | 89.0ms | 89.0ms | admin-read-model=1 | no-scan=1 | none | none |
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
