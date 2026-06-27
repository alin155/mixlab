# Admin Real NAS Performance Probe 2026-06-25T22:51:43.474Z

## Scope

This report measures read-only Admin API performance against a real public-library root. It separates shell, route, diagnostic and background endpoints so route-blocking work does not get mixed with expensive background scans.

## Environment

- API: `http://127.0.0.1:3891`
- Auth mode: `disabled`
- Authenticated: `true`
- Library root: `/Volumes/MixLab/PublicLibrary`
- Source videos path: `/Volumes/MixLab/PublicLibrary/source-videos`
- Current index: `v010471`
- Updated at: `2026-06-25T19:07:13.162Z`
- Counts: total `11394`, ready `10471`, processing `0`, queued `904`, failed `0`, index-required `19`
- Disk: 627.8 GiB available / 29.0 TiB total (97.9% used)

## Read Model Control Surface

- Admin read model storage: `sqlite`
- Admin read model freshness: `missing`
- Admin read model exists: `false`
- Admin read model video count: `0`
- Admin read model reconciliation: action `build`, reason `missing_store`, scan mode `full-reconcile`, requires background reconcile `true`, safe for page request `false`
- Source-video status read model freshness: `fresh`
- Source-video status read model persisted: `fresh`

## Endpoint Results

| endpoint | phase | first status | success | cold | p50 | p95 | max | gate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| health | shell | 200 | 2/2 | 6.0ms | 0.8ms | 6.0ms | 6.0ms | pass |
| auth_status | shell | 200 | 2/2 | 0.7ms | 0.7ms | 1.0ms | 1.0ms | pass |
| library_status | shell | 200 | 2/2 | 4.6ms | 4.3ms | 4.6ms | 4.6ms | pass |
| data_loading_plan | shell | 200 | 2/2 | 0.7ms | 0.5ms | 0.7ms | 0.7ms | pass |
| read_model_status | diagnostic | 200 | 2/2 | 5.2ms | 4.5ms | 5.2ms | 5.2ms | pass |
| read_model_reconcile_status | diagnostic | 200 | 2/2 | 0.4ms | 0.3ms | 0.4ms | 0.4ms | pass |
| protection_status | route | 200 | 2/2 | 0.5ms | 0.4ms | 0.5ms | 0.5ms | pass |
| release_gates | route | 200 | 2/2 | 32.5ms | 16.3ms | 32.5ms | 32.5ms | pass |
| preprocess_safety | route | 200 | 2/2 | 0.6ms | 0.5ms | 0.6ms | 0.6ms | pass |
| operations_overview | route | 200 | 2/2 | 18.7ms | 18.7ms | 20.1ms | 20.1ms | pass |
| operation_log | route | 200 | 2/2 | 6.5ms | 4.9ms | 6.5ms | 6.5ms | pass |
| source_videos_first_page | route | 200 | 2/2 | 0.9ms | 0.4ms | 0.9ms | 0.9ms | pass |
| source_videos_processing | route | 200 | 2/2 | 0.6ms | 0.4ms | 0.6ms | 0.6ms | pass |
| source_videos_index_required | route | 200 | 2/2 | 0.6ms | 0.5ms | 0.6ms | 0.6ms | pass |
| source_videos_queued | route | 200 | 2/2 | 0.5ms | 0.5ms | 0.6ms | 0.6ms | pass |
| source_videos_failed | route | 200 | 2/2 | 0.5ms | 0.4ms | 0.5ms | 0.5ms | pass |
| preprocess_jobs | route | 200 | 2/2 | 259.0ms | 259.0ms | 261.0ms | 261.0ms | pass |
| index_versions | route | 200 | 2/2 | 208.5ms | 0.7ms | 208.5ms | 208.5ms | pass |
| cutter_users | route | 200 | 2/2 | 22.2ms | 1.4ms | 22.2ms | 22.2ms | pass |
| dashboard_metrics | background | 200 | 3/3 | 280.6ms | 282.9ms | 283.1ms | 283.1ms | pass |

## Findings

- Slow gates: none
- Error/timeout samples: none
- Shell endpoints are expected to stay under 1s p95; route endpoints are expected to stay under 1s p95 after runtime/read-model warm-up; `dashboard_metrics` is background-only and has an 8s p95 budget.

## Notes

- All endpoint probes use GET requests only.
- The probe checks read-model reconcile status but never starts, cancels, applies, repairs or publishes any command.
- When MIXLAB_ADMIN_AUTH_MODE=disabled is used for an isolated local probe, timings represent business I/O after authentication rather than password/session overhead.
- The source-video-status-read-model-v1 persistent JSON file is generated cache under .mixlab-library/admin/read-models and does not rewrite source-video manifests.
- The admin.sqlite read model is an optimization and must remain rebuildable from source-video manifests; it is not the asset source of truth.
