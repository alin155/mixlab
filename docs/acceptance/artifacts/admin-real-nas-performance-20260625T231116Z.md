# Admin Real NAS Performance Probe 2026-06-25T23:11:16.963Z

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
| health | shell | 200 | 2/2 | 7.9ms | 1.0ms | 7.9ms | 7.9ms | pass |
| auth_status | shell | 200 | 2/2 | 0.7ms | 0.6ms | 0.7ms | 0.7ms | pass |
| library_status | shell | 200 | 2/2 | 16.3ms | 0.8ms | 16.3ms | 16.3ms | pass |
| data_loading_plan | shell | 200 | 2/2 | 0.7ms | 0.6ms | 0.7ms | 0.7ms | pass |
| read_model_status | diagnostic | 200 | 2/2 | 71.1ms | 67.1ms | 71.1ms | 71.1ms | pass |
| read_model_reconcile_status | diagnostic | 200 | 2/2 | 0.5ms | 0.4ms | 0.5ms | 0.5ms | pass |
| protection_status | route | 200 | 2/2 | 0.6ms | 0.5ms | 0.6ms | 0.6ms | pass |
| release_gates | route | 200 | 2/2 | 40.5ms | 13.2ms | 40.5ms | 40.5ms | pass |
| preprocess_safety | route | 200 | 2/2 | 0.6ms | 0.5ms | 0.6ms | 0.6ms | pass |
| operations_overview | route | 200 | 2/2 | 91.0ms | 90.6ms | 91.0ms | 91.0ms | pass |
| operation_log | route | 200 | 2/2 | 20.2ms | 0.6ms | 20.2ms | 20.2ms | pass |
| source_videos_first_page | route | 200 | 2/2 | 0.7ms | 0.3ms | 0.7ms | 0.7ms | pass |
| source_videos_processing | route | 200 | 2/2 | 77.8ms | 75.4ms | 77.8ms | 77.8ms | pass |
| source_videos_index_required | route | 200 | 2/2 | 222.9ms | 222.9ms | 229.8ms | 229.8ms | pass |
| source_videos_queued | route | 200 | 2/2 | 189.8ms | 182.9ms | 189.8ms | 189.8ms | pass |
| source_videos_failed | route | 200 | 2/2 | 76.3ms | 76.3ms | 78.8ms | 78.8ms | pass |
| preprocess_jobs | route | 200 | 2/2 | 438.5ms | 438.5ms | 465.0ms | 465.0ms | pass |
| index_versions | route | 200 | 2/2 | 221.3ms | 0.9ms | 221.3ms | 221.3ms | pass |
| cutter_users | route | 200 | 2/2 | 28.2ms | 2.4ms | 28.2ms | 28.2ms | pass |
| dashboard_metrics | background | 200 | 3/3 | 294.4ms | 294.4ms | 302.9ms | 302.9ms | pass |

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
