# Admin Real NAS Performance Probe 2026-06-25T23:02:51.913Z

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
| health | shell | 200 | 2/2 | 1.6ms | 1.5ms | 1.6ms | 1.6ms | pass |
| auth_status | shell | 200 | 2/2 | 3.0ms | 0.9ms | 3.0ms | 3.0ms | pass |
| library_status | shell | 200 | 2/2 | 5.1ms | 0.8ms | 5.1ms | 5.1ms | pass |
| data_loading_plan | shell | 200 | 2/2 | 0.9ms | 0.7ms | 0.9ms | 0.9ms | pass |
| read_model_status | diagnostic | 200 | 2/2 | 343.2ms | 329.8ms | 343.2ms | 343.2ms | pass |
| read_model_reconcile_status | diagnostic | 200 | 2/2 | 1.6ms | 0.9ms | 1.6ms | 1.6ms | pass |
| protection_status | route | 200 | 2/2 | 1.3ms | 0.8ms | 1.3ms | 1.3ms | pass |
| release_gates | route | 200 | 2/2 | 47.1ms | 17.0ms | 47.1ms | 47.1ms | pass |
| preprocess_safety | route | 200 | 2/2 | 0.7ms | 0.5ms | 0.7ms | 0.7ms | pass |
| operations_overview | route | 200 | 2/2 | 357.0ms | 357.0ms | 373.3ms | 373.3ms | pass |
| operation_log | route | 200 | 2/2 | 14.1ms | 6.4ms | 14.1ms | 14.1ms | pass |
| source_videos_first_page | route | 200 | 2/2 | 1.5ms | 0.7ms | 1.5ms | 1.5ms | pass |
| source_videos_processing | route | 200 | 2/2 | 453.0ms | 430.0ms | 453.0ms | 453.0ms | pass |
| source_videos_index_required | route | 200 | 2/2 | 530.8ms | 530.8ms | 540.9ms | 540.9ms | pass |
| source_videos_queued | route | 200 | 2/2 | 1448.8ms | 1448.8ms | 1457.6ms | 1457.6ms | slow |
| source_videos_failed | route | 200 | 2/2 | 436.1ms | 436.1ms | 442.4ms | 442.4ms | pass |
| preprocess_jobs | route | 200 | 2/2 | 1759.8ms | 1718.4ms | 1759.8ms | 1759.8ms | slow |
| index_versions | route | 200 | 2/2 | 260.6ms | 1.6ms | 260.6ms | 260.6ms | pass |
| cutter_users | route | 200 | 2/2 | 27.5ms | 2.7ms | 27.5ms | 27.5ms | pass |
| dashboard_metrics | background | 200 | 3/3 | 299.8ms | 299.8ms | 300.4ms | 300.4ms | pass |

## Findings

- Slow gates: `source_videos_queued` p95 1457.6ms, `preprocess_jobs` p95 1759.8ms
- Error/timeout samples: none
- Shell endpoints are expected to stay under 1s p95; route endpoints are expected to stay under 1s p95 after runtime/read-model warm-up; `dashboard_metrics` is background-only and has an 8s p95 budget.

## Notes

- All endpoint probes use GET requests only.
- The probe checks read-model reconcile status but never starts, cancels, applies, repairs or publishes any command.
- When MIXLAB_ADMIN_AUTH_MODE=disabled is used for an isolated local probe, timings represent business I/O after authentication rather than password/session overhead.
- The source-video-status-read-model-v1 persistent JSON file is generated cache under .mixlab-library/admin/read-models and does not rewrite source-video manifests.
- The admin.sqlite read model is an optimization and must remain rebuildable from source-video manifests; it is not the asset source of truth.
