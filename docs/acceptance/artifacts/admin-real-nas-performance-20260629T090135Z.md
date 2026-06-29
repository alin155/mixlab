# Admin Real NAS Performance Probe 2026-06-29T09:01:35.673Z

## Scope

This report measures read-only Admin API performance against a real public-library root. It separates shell, route, diagnostic and background endpoints so route-blocking work does not get mixed with expensive background scans.

## Environment

- API: `http://127.0.0.1:3889`
- Auth mode: `password`
- Authenticated: `true`
- Library root: `/Volumes/MixLab/PublicLibrary`
- Source videos path: `/data/PublicLibrary/source-videos`
- Current index: `v010471`
- Updated at: `2026-06-25T19:07:13.162Z`
- Counts: total `11394`, ready `10471`, processing `0`, queued `904`, failed `0`, index-required `19`
- Disk: 14.8 TiB available / 43.4 TiB total (65.9% used)

## Read Model Control Surface

- Admin read model storage: `unknown`
- Admin read model freshness: `unknown`
- Admin read model exists: `unknown`
- Admin read model video count: `n/a`
- Admin read model reconciliation: action `unknown`, reason `unknown`, scan mode `unknown`, requires background reconcile `unknown`, safe for page request `unknown`
- Source-video status read model freshness: `unknown`
- Source-video status read model persisted: `unknown`

## Read Model Projection Readiness

| projection | status | reason | scan mode | requires background reconcile | safe for page request | video count | current video count |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| material_summary | unknown | unknown | unknown | unknown | unknown | n/a | n/a |
| production_summary | unknown | unknown | unknown | unknown | unknown | n/a | n/a |
| process_history | unknown | unknown | unknown | unknown | unknown | n/a | n/a |

## Endpoint Results

| endpoint | phase | first status | success | cold | p50 | p95 | max | gate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| health | shell | 200 | 2/2 | 0.7ms | 0.5ms | 0.7ms | 0.7ms | pass |
| auth_status | shell | 200 | 2/2 | 1.3ms | 0.9ms | 1.3ms | 1.3ms | pass |
| library_status | shell | 200 | 2/2 | 35.1ms | 5.7ms | 35.1ms | 35.1ms | pass |
| data_loading_plan | shell | 404 | 0/1 | 1.3ms | n/a | n/a | n/a | n/a |
| read_model_status | diagnostic | 404 | 0/1 | 0.8ms | n/a | n/a | n/a | n/a |
| read_model_reconcile_status | diagnostic | 404 | 0/1 | 0.6ms | n/a | n/a | n/a | n/a |
| protection_status | route | 404 | 0/1 | 0.6ms | n/a | n/a | n/a | n/a |
| release_gates | route | 404 | 0/1 | 0.5ms | n/a | n/a | n/a | n/a |
| preprocess_safety | route | 404 | 0/1 | 0.5ms | n/a | n/a | n/a | n/a |
| operations_overview | route | 404 | 0/1 | 0.5ms | n/a | n/a | n/a | n/a |
| operation_log | route | 404 | 0/1 | 0.5ms | n/a | n/a | n/a | n/a |
| source_videos_first_page | route | 200 | 2/2 | 65.9ms | 1.3ms | 65.9ms | 65.9ms | pass |
| source_videos_processing | route | 200 | 2/2 | 1.1ms | 0.9ms | 1.1ms | 1.1ms | pass |
| source_videos_index_required | route | n/a | 0/1 | 15003.1ms | n/a | n/a | n/a | n/a |
| source_videos_queued | route | 200 | 2/2 | 5624.0ms | 5624.0ms | 5870.7ms | 5870.7ms | slow |
| source_videos_failed | route | 200 | 2/2 | 179.3ms | 179.3ms | 345.6ms | 345.6ms | pass |
| preprocess_jobs | route | 200 | 2/2 | 1118.9ms | 1118.9ms | 3690.1ms | 3690.1ms | slow |
| index_versions | route | 200 | 2/2 | 1119.5ms | 174.9ms | 1119.5ms | 1119.5ms | slow |
| cutter_users | route | 200 | 2/2 | 383.0ms | 315.1ms | 383.0ms | 383.0ms | pass |
| dashboard_metrics | background | 200 | 3/3 | 1355.7ms | 1355.7ms | 1535.1ms | 1535.1ms | pass |

## Runtime Source Summary

| endpoint | runtime samples | actual data source | scan mode | cache status | fallback reasons | repair reasons | runtime slow |
| --- | ---: | --- | --- | --- | --- | --- | ---: |
| health | 0/2 | none | none | none | none | none | 0 |
| auth_status | 0/2 | none | none | none | none | none | 0 |
| library_status | 0/2 | none | none | none | none | none | 0 |
| data_loading_plan | 0/1 | none | none | none | none | none | 0 |
| read_model_status | 0/1 | none | none | none | none | none | 0 |
| read_model_reconcile_status | 0/1 | none | none | none | none | none | 0 |
| protection_status | 0/1 | none | none | none | none | none | 0 |
| release_gates | 0/1 | none | none | none | none | none | 0 |
| preprocess_safety | 0/1 | none | none | none | none | none | 0 |
| operations_overview | 0/1 | none | none | none | none | none | 0 |
| operation_log | 0/1 | none | none | none | none | none | 0 |
| source_videos_first_page | 0/2 | none | none | none | none | none | 0 |
| source_videos_processing | 0/2 | none | none | none | none | none | 0 |
| source_videos_index_required | 0/1 | none | none | none | none | none | 0 |
| source_videos_queued | 0/2 | none | none | none | none | none | 0 |
| source_videos_failed | 0/2 | none | none | none | none | none | 0 |
| preprocess_jobs | 0/2 | none | none | none | none | none | 0 |
| index_versions | 0/2 | none | none | none | none | none | 0 |
| cutter_users | 0/2 | none | none | none | none | none | 0 |
| dashboard_metrics | 0/3 | none | none | none | none | none | 0 |


## Runtime Component Contract Gates

| endpoint | gate | expected components | observed components | missing components |
| --- | --- | --- | --- | --- |
| source_videos_processing | missing | library_counts, status_store_page | none | library_counts, status_store_page |
| source_videos_index_required | missing | library_counts, status_store_page | none | library_counts, status_store_page |
| source_videos_queued | missing | library_counts, status_store_page | none | library_counts, status_store_page |
| preprocess_jobs | missing | concurrency_policy, library_counts, preprocess_job_page, runtime_load | none | concurrency_policy, library_counts, preprocess_job_page, runtime_load |
| index_versions | missing | cache_lookup | none | cache_lookup |


## Findings

- Slow gates: `source_videos_queued` p95 5870.7ms, `preprocess_jobs` p95 3690.1ms, `index_versions` p95 1119.5ms
- Error/timeout samples: `data_loading_plan` 0/1, `read_model_status` 0/1, `read_model_reconcile_status` 0/1, `protection_status` 0/1, `release_gates` 0/1, `preprocess_safety` 0/1, `operations_overview` 0/1, `operation_log` 0/1, `source_videos_index_required` 0/1
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
