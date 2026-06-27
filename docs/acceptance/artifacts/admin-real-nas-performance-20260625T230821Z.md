# Admin Real NAS Performance Probe 2026-06-25T23:08:21.267Z

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
- Admin read model freshness: `fresh`
- Admin read model exists: `true`
- Admin read model video count: `11394`
- Admin read model reconciliation: action `none`, reason `fresh`, scan mode `no-scan`, requires background reconcile `false`, safe for page request `true`
- Source-video status read model freshness: `fresh`
- Source-video status read model persisted: `fresh`

## Endpoint Results

| endpoint | phase | first status | success | cold | p50 | p95 | max | gate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| health | shell | 200 | 2/2 | 1.5ms | 1.5ms | 1.5ms | 1.5ms | pass |
| auth_status | shell | 200 | 2/2 | 12.9ms | 12.9ms | 13.6ms | 13.6ms | pass |
| library_status | shell | 200 | 2/2 | 28.8ms | 12.7ms | 28.8ms | 28.8ms | pass |
| data_loading_plan | shell | 200 | 2/2 | 0.9ms | 0.6ms | 0.9ms | 0.9ms | pass |
| read_model_status | diagnostic | 200 | 2/2 | 89.2ms | 89.2ms | 96.3ms | 96.3ms | pass |
| read_model_reconcile_status | diagnostic | 200 | 2/2 | 0.5ms | 0.3ms | 0.5ms | 0.5ms | pass |
| protection_status | route | 200 | 2/2 | 13.3ms | 12.7ms | 13.3ms | 13.3ms | pass |
| release_gates | route | 200 | 2/2 | 57.4ms | 38.7ms | 57.4ms | 57.4ms | pass |
| preprocess_safety | route | 200 | 2/2 | 14.3ms | 13.7ms | 14.3ms | 14.3ms | pass |
| operations_overview | route | 200 | 2/2 | 135.7ms | 135.7ms | 147.7ms | 147.7ms | pass |
| operation_log | route | 200 | 2/2 | 23.8ms | 13.0ms | 23.8ms | 23.8ms | pass |
| source_videos_first_page | route | 200 | 2/2 | 13.7ms | 0.8ms | 13.7ms | 13.7ms | pass |
| source_videos_processing | route | 200 | 2/2 | 86.1ms | 86.1ms | 90.1ms | 90.1ms | pass |
| source_videos_index_required | route | 200 | 2/2 | 244.4ms | 233.7ms | 244.4ms | 244.4ms | pass |
| source_videos_queued | route | 200 | 2/2 | 199.3ms | 198.0ms | 199.3ms | 199.3ms | pass |
| source_videos_failed | route | 200 | 2/2 | 82.4ms | 82.4ms | 84.3ms | 84.3ms | pass |
| preprocess_jobs | route | 200 | 2/2 | 454.1ms | 454.1ms | 483.1ms | 483.1ms | pass |
| index_versions | route | 200 | 2/2 | 237.1ms | 1.2ms | 237.1ms | 237.1ms | pass |
| cutter_users | route | 200 | 2/2 | 32.6ms | 15.1ms | 32.6ms | 32.6ms | pass |
| dashboard_metrics | background | 200 | 3/3 | 302.4ms | 309.5ms | 310.4ms | 310.4ms | pass |

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
