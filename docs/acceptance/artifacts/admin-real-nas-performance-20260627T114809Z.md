# Admin Real NAS Performance Probe 2026-06-27T11:48:09.447Z

## Scope

This report measures read-only Admin API performance against a real public-library root. It separates shell, route, diagnostic and background endpoints so route-blocking work does not get mixed with expensive background scans.

## Environment

- API: `http://127.0.0.1:55266`
- Auth mode: `disabled`
- Authenticated: `true`
- Library root: `/Volumes/MixLab/PublicLibrary`
- Source videos path: `/Volumes/MixLab/PublicLibrary/source-videos`
- Current index: `v010471`
- Updated at: `2026-06-25T19:07:13.162Z`
- Counts: total `11394`, ready `10471`, processing `0`, queued `904`, failed `0`, index-required `19`
- Disk: 634.7 GiB available / 29.0 TiB total (97.9% used)

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
| health | shell | 200 | 2/2 | 5.1ms | 4.6ms | 5.1ms | 5.1ms | pass |
| auth_status | shell | 200 | 2/2 | 8.5ms | 1.1ms | 8.5ms | 8.5ms | pass |
| library_status | shell | 200 | 2/2 | 13.6ms | 10.7ms | 13.6ms | 13.6ms | pass |
| data_loading_plan | shell | 200 | 2/2 | 0.9ms | 0.7ms | 0.9ms | 0.9ms | pass |
| read_model_status | diagnostic | 200 | 2/2 | 62.5ms | 62.5ms | 72.8ms | 72.8ms | pass |
| read_model_reconcile_status | diagnostic | 200 | 2/2 | 0.5ms | 0.3ms | 0.5ms | 0.5ms | pass |
| protection_status | route | 200 | 2/2 | 3.9ms | 0.4ms | 3.9ms | 3.9ms | pass |
| release_gates | route | 200 | 2/2 | 269.5ms | 22.4ms | 269.5ms | 269.5ms | pass |
| preprocess_safety | route | 200 | 2/2 | 1.0ms | 0.5ms | 1.0ms | 1.0ms | pass |
| operations_overview | route | 200 | 2/2 | 147.4ms | 139.9ms | 147.4ms | 147.4ms | pass |
| operation_log | route | 200 | 2/2 | 12.4ms | 0.7ms | 12.4ms | 12.4ms | pass |
| source_videos_first_page | route | 200 | 2/2 | 1.3ms | 0.5ms | 1.3ms | 1.3ms | pass |
| source_videos_processing | route | 200 | 2/2 | 108.9ms | 88.1ms | 108.9ms | 108.9ms | pass |
| source_videos_index_required | route | 200 | 2/2 | 58.6ms | 58.6ms | 323.6ms | 323.6ms | pass |
| source_videos_queued | route | 200 | 2/2 | 229.1ms | 196.0ms | 229.1ms | 229.1ms | pass |
| source_videos_failed | route | 200 | 2/2 | 79.9ms | 79.9ms | 82.9ms | 82.9ms | pass |
| preprocess_jobs | route | 200 | 2/2 | 450.4ms | 212.4ms | 450.4ms | 450.4ms | pass |
| index_versions | route | 200 | 2/2 | 302.0ms | 1.3ms | 302.0ms | 302.0ms | pass |
| cutter_users | route | 200 | 2/2 | 35.5ms | 2.5ms | 35.5ms | 35.5ms | pass |
| dashboard_metrics | background | 200 | 3/3 | 431.8ms | 1.8ms | 431.8ms | 431.8ms | pass |

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
| source_videos_index_required | 2/2 | admin-read-model=2 | hit=2 | status-store:unreadable-store=1 | none | 0 |
| source_videos_queued | 2/2 | admin-read-model=2 | hit=2 | none | none | 0 |
| source_videos_failed | 2/2 | admin-read-model=2 | hit=2 | none | none | 0 |
| preprocess_jobs | 2/2 | admin-read-model=2 | hit=2 | none | none | 0 |
| index_versions | 2/2 | current-index=2 | hit=1, miss=1 | none | none | 0 |
| cutter_users | 0/2 | none | none | none | none | 0 |
| dashboard_metrics | 3/3 | admin-read-model=3 | hit=2, miss=1 | none | none | 0 |

## Runtime Component Timing Summary

| endpoint | component | samples | avg | max | data source | scan mode | cache status | detail |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| source_videos_processing | status_store_page | 2 | 96.5ms | 107.0ms | admin-read-model=2 | paged-list=2 | hit=2 | status=processing;offset=0;limit=20;manifests=0=2 |
| source_videos_processing | library_counts | 2 | 0.0ms | 0.0ms | library-manifest=2 | no-scan=2 | not-applicable=2 | video_count=11394;status=processing;offset=0;limit=20=2 |
| source_videos_index_required | status_store_page | 2 | 188.0ms | 323.0ms | admin-read-model=2 | paged-list=2 | hit=1, miss=1 | status=index-required;offset=0;limit=20;manifests=0;miss=status-store:unreadable-store=1, status=index-required;offset=0;limit=20;manifests=19=1 |
| source_videos_index_required | status_read_model | 1 | 5.0ms | 5.0ms | admin-read-model=1 | status-scan=1 | unknown=1 | status=index-required;ids=19;fallback=status-store:unreadable-store=1 |
| source_videos_index_required | library_counts | 2 | 0.0ms | 0.0ms | library-manifest=2 | no-scan=2 | not-applicable=2 | video_count=11394;status=index-required;offset=0;limit=20=2 |
| source_videos_queued | status_store_page | 2 | 209.5ms | 224.0ms | admin-read-model=2 | paged-list=2 | hit=2 | status=queued;offset=0;limit=20;manifests=20=2 |
| source_videos_queued | library_counts | 2 | 2.0ms | 4.0ms | library-manifest=2 | no-scan=2 | not-applicable=2 | video_count=11394;status=queued;offset=0;limit=20=2 |
| source_videos_failed | status_store_page | 2 | 80.5ms | 82.0ms | admin-read-model=2 | paged-list=2 | hit=2 | status=failed;offset=0;limit=20;manifests=0=2 |
| source_videos_failed | library_counts | 2 | 0.0ms | 0.0ms | library-manifest=2 | no-scan=2 | not-applicable=2 | video_count=11394;status=failed;offset=0;limit=20=2 |
| preprocess_jobs | runtime_load | 2 | 131.5ms | 263.0ms | runtime-telemetry=2 | no-scan=2 | not-applicable=2 | status=blocked=2 |
| preprocess_jobs | preprocess_job_page | 2 | 194.0ms | 204.0ms | admin-read-model=2 | paged-list=2 | hit=2 | offset=0;limit=20;manifests=20;snapshots=0=2 |
| preprocess_jobs | concurrency_policy | 2 | 3.0ms | 6.0ms | admin-settings=2 | no-scan=2 | not-applicable=2 | concurrency=1=2 |
| preprocess_jobs | library_counts | 2 | 0.0ms | 0.0ms | library-manifest=2 | no-scan=2 | not-applicable=2 | video_count=11394;ready=10471;queued=904;processing=0;failed=0;index_required=19=2 |
| index_versions | index_package_validation | 1 | 255.0ms | 255.0ms | index-version-packages=1 | paged-list=1 | not-applicable=1 | versions=8;directory_ms=0;current_ms=0=1 |
| index_versions | current_pointer_fast_page | 1 | 45.0ms | 45.0ms | current-index=1 | paged-list=1 | hit=1 | offset=0;limit=8;result=hit;versions=8=1 |
| index_versions | cache_lookup | 1 | 0.0ms | 0.0ms | current-index=1 | no-scan=1 | hit=1 | offset=0;limit=8=1 |
| dashboard_metrics | production_summary | 1 | 162.0ms | 162.0ms | admin-read-model=1 | no-scan=1 | none | none |
| dashboard_metrics | usage_metrics | 1 | 107.0ms | 107.0ms | admin-read-model=1 | no-scan=1 | none | none |
| dashboard_metrics | status_summary | 1 | 79.0ms | 79.0ms | admin-read-model=1 | no-scan=1 | none | none |
| dashboard_metrics | material_summary | 1 | 78.0ms | 78.0ms | admin-read-model=1 | no-scan=1 | none | none |
| dashboard_metrics | transcript_metrics | 1 | 1.0ms | 1.0ms | current-index=1 | no-scan=1 | none | none |
| dashboard_metrics | current_index_version | 1 | 0.0ms | 0.0ms | current-index=1 | no-scan=1 | none | none |
| dashboard_metrics | dashboard_metrics_cache | 2 | 0.0ms | 0.0ms | admin-read-model=2 | no-scan=2 | hit=2 | none |
| dashboard_metrics | library_manifest | 1 | 0.0ms | 0.0ms | library-manifest=1 | no-scan=1 | none | none |
| dashboard_metrics | preprocess_jobs | 1 | 0.0ms | 0.0ms | library-manifest=1 | no-scan=1 | none | summary-mode=1 |
| dashboard_metrics | runtime_load | 1 | 0.0ms | 0.0ms | runtime-telemetry=1 | no-scan=1 | none | none |

## Runtime Component Contract Gates

| endpoint | gate | expected components | observed components | missing components |
| --- | --- | --- | --- | --- |
| source_videos_processing | pass | library_counts, status_store_page | library_counts, status_store_page | none |
| source_videos_index_required | pass | library_counts, status_store_page | library_counts, status_read_model, status_store_page | none |
| source_videos_queued | pass | library_counts, status_store_page | library_counts, status_store_page | none |
| preprocess_jobs | pass | concurrency_policy, library_counts, preprocess_job_page, runtime_load | concurrency_policy, library_counts, preprocess_job_page, runtime_load | none |
| index_versions | pass | cache_lookup | cache_lookup, current_pointer_fast_page, index_package_validation | none |


## Findings

- Slow gates: none
- Error/timeout samples: none
- Runtime fallbacks: `source_videos_index_required` status-store:unreadable-store=1
- Runtime repairs: none
- Shell endpoints are expected to stay under 1s p95; route endpoints are expected to stay under 1s p95 after runtime/read-model warm-up; `dashboard_metrics` is background-only and has an 8s p95 budget.

## Notes

- All endpoint probes use GET requests only and send X-MixLab-Admin-Read-Only-Probe: true to disable page-time derived-store repair.
- The probe checks read-model reconcile status but never starts, cancels, applies, repairs, publishes, or runs any command.
- Runtime Source Summary is derived from response meta.runtime fields and does not perform any additional scans.
- When MIXLAB_ADMIN_AUTH_MODE=disabled is used for an isolated local probe, timings represent business I/O after authentication rather than password/session overhead.
- The source-video-status-read-model-v1 persistent JSON file is generated cache under .mixlab-library/admin/read-models and does not rewrite source-video manifests.
- The admin.sqlite read model is an optimization and must remain rebuildable from source-video manifests; it is not the asset source of truth.
