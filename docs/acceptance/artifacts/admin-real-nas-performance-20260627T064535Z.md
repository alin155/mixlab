# Admin Real NAS Performance Probe 2026-06-27T06:45:35.352Z

## Scope

This report measures read-only Admin API performance against a real public-library root. It separates shell, route, diagnostic and background endpoints so route-blocking work does not get mixed with expensive background scans.

## Environment

- API: `http://127.0.0.1:61477`
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
| health | shell | 200 | 2/2 | 3.4ms | 3.4ms | 4.4ms | 4.4ms | pass |
| auth_status | shell | 200 | 2/2 | 1.5ms | 1.1ms | 1.5ms | 1.5ms | pass |
| library_status | shell | 200 | 2/2 | 37.8ms | 6.3ms | 37.8ms | 37.8ms | pass |
| data_loading_plan | shell | 200 | 2/2 | 1.3ms | 0.9ms | 1.3ms | 1.3ms | pass |
| read_model_status | diagnostic | 200 | 2/2 | 72.6ms | 72.6ms | 73.8ms | 73.8ms | pass |
| read_model_reconcile_status | diagnostic | 200 | 2/2 | 0.6ms | 0.3ms | 0.6ms | 0.6ms | pass |
| protection_status | route | 200 | 2/2 | 0.6ms | 0.4ms | 0.6ms | 0.6ms | pass |
| release_gates | route | 200 | 2/2 | 102.1ms | 19.6ms | 102.1ms | 102.1ms | pass |
| preprocess_safety | route | 200 | 2/2 | 0.9ms | 0.5ms | 0.9ms | 0.9ms | pass |
| operations_overview | route | 200 | 2/2 | 97.0ms | 97.0ms | 100.4ms | 100.4ms | pass |
| operation_log | route | 200 | 2/2 | 33.4ms | 0.6ms | 33.4ms | 33.4ms | pass |
| source_videos_first_page | route | 200 | 2/2 | 1.7ms | 0.7ms | 1.7ms | 1.7ms | pass |
| source_videos_processing | route | 200 | 2/2 | 87.9ms | 87.9ms | 101.5ms | 101.5ms | pass |
| source_videos_index_required | route | 200 | 2/2 | 288.0ms | 288.0ms | 300.2ms | 300.2ms | pass |
| source_videos_queued | route | 200 | 2/2 | 244.0ms | 234.5ms | 244.0ms | 244.0ms | pass |
| source_videos_failed | route | 200 | 2/2 | 109.1ms | 100.8ms | 109.1ms | 109.1ms | pass |
| preprocess_jobs | route | 200 | 2/2 | 914.6ms | 843.2ms | 914.6ms | 914.6ms | pass |
| index_versions | route | 200 | 2/2 | 280.8ms | 1.8ms | 280.8ms | 280.8ms | pass |
| cutter_users | route | 200 | 2/2 | 28.0ms | 2.6ms | 28.0ms | 28.0ms | pass |
| dashboard_metrics | background | 200 | 3/3 | 2254.0ms | 1.5ms | 2254.0ms | 2254.0ms | pass |

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
| dashboard_metrics | 3/3 | admin-read-model=3 | hit=2, miss=1 | none | none | 1 |

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
