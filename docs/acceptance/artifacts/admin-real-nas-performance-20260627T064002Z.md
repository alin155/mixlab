# Admin Real NAS Performance Probe 2026-06-27T06:40:02.859Z

## Scope

This report measures read-only Admin API performance against a real public-library root. It separates shell, route, diagnostic and background endpoints so route-blocking work does not get mixed with expensive background scans.

## Environment

- API: `http://127.0.0.1:61171`
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
| health | shell | 200 | 2/2 | 6.2ms | 1.3ms | 6.2ms | 6.2ms | pass |
| auth_status | shell | 200 | 2/2 | 1.1ms | 0.9ms | 1.1ms | 1.1ms | pass |
| library_status | shell | 200 | 2/2 | 30.0ms | 6.0ms | 30.0ms | 30.0ms | pass |
| data_loading_plan | shell | 200 | 2/2 | 1.0ms | 0.6ms | 1.0ms | 1.0ms | pass |
| read_model_status | diagnostic | 200 | 2/2 | 76.3ms | 76.3ms | 81.0ms | 81.0ms | pass |
| read_model_reconcile_status | diagnostic | 200 | 2/2 | 0.9ms | 0.6ms | 0.9ms | 0.9ms | pass |
| protection_status | route | 200 | 2/2 | 0.9ms | 0.6ms | 0.9ms | 0.9ms | pass |
| release_gates | route | 200 | 2/2 | 108.5ms | 20.5ms | 108.5ms | 108.5ms | pass |
| preprocess_safety | route | 200 | 2/2 | 1.0ms | 0.6ms | 1.0ms | 1.0ms | pass |
| operations_overview | route | 200 | 2/2 | 91.9ms | 91.9ms | 98.0ms | 98.0ms | pass |
| operation_log | route | 200 | 2/2 | 3932.2ms | 9.3ms | 3932.2ms | 3932.2ms | slow |
| source_videos_first_page | route | 200 | 2/2 | 3.3ms | 1.2ms | 3.3ms | 3.3ms | pass |
| source_videos_processing | route | 200 | 2/2 | 86.8ms | 77.0ms | 86.8ms | 86.8ms | pass |
| source_videos_index_required | route | 200 | 2/2 | 231.6ms | 231.6ms | 247.1ms | 247.1ms | pass |
| source_videos_queued | route | 200 | 2/2 | 189.4ms | 189.4ms | 196.7ms | 196.7ms | pass |
| source_videos_failed | route | 200 | 2/2 | 82.5ms | 74.7ms | 82.5ms | 82.5ms | pass |
| preprocess_jobs | route | 200 | 2/2 | 720.2ms | 720.2ms | 740.9ms | 740.9ms | pass |
| index_versions | route | 200 | 2/2 | 323.0ms | 2.0ms | 323.0ms | 323.0ms | pass |
| cutter_users | route | 200 | 2/2 | 37.1ms | 2.8ms | 37.1ms | 37.1ms | pass |
| dashboard_metrics | background | 200 | 3/3 | 2209.0ms | 1.5ms | 2209.0ms | 2209.0ms | pass |

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

- Slow gates: `operation_log` p95 3932.2ms
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
