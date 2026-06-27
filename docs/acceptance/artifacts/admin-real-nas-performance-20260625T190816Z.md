# Admin Real NAS Performance Probe 2026-06-25T19:08:16.596Z

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
- Disk: 628.8 GiB available / 29.0 TiB total (97.9% used)

## Endpoint Results

| endpoint | phase | first status | success | cold | p50 | p95 | max | gate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| health | shell | 200 | 2/2 | 20.8ms | 16.3ms | 20.8ms | 20.8ms | pass |
| auth_status | shell | 200 | 2/2 | 11.4ms | 11.4ms | 13.5ms | 13.5ms | pass |
| library_status | shell | 200 | 2/2 | 43.9ms | 42.7ms | 43.9ms | 43.9ms | pass |
| data_loading_plan | shell | 200 | 2/2 | 0.9ms | 0.5ms | 0.9ms | 0.9ms | pass |
| read_model_status | diagnostic | 200 | 2/2 | 38.3ms | 35.2ms | 38.3ms | 38.3ms | pass |
| protection_status | route | 200 | 2/2 | 26.0ms | 24.8ms | 26.0ms | 26.0ms | pass |
| release_gates | route | 200 | 2/2 | 110.8ms | 99.6ms | 110.8ms | 110.8ms | pass |
| preprocess_safety | route | 200 | 2/2 | 13.6ms | 13.6ms | 23.3ms | 23.3ms | pass |
| source_videos_first_page | route | 200 | 2/2 | 18.8ms | 0.7ms | 18.8ms | 18.8ms | pass |
| source_videos_processing | route | 200 | 2/2 | 16.2ms | 13.0ms | 16.2ms | 16.2ms | pass |
| source_videos_index_required | route | 200 | 2/2 | 11.7ms | 11.7ms | 13.9ms | 13.9ms | pass |
| source_videos_queued | route | 200 | 2/2 | 16.1ms | 16.1ms | 17.8ms | 17.8ms | pass |
| source_videos_failed | route | 200 | 2/2 | 16.6ms | 14.1ms | 16.6ms | 16.6ms | pass |
| preprocess_jobs | route | 200 | 2/2 | 310.6ms | 299.9ms | 310.6ms | 310.6ms | pass |
| index_versions | route | 200 | 2/2 | 299.6ms | 2.4ms | 299.6ms | 299.6ms | pass |
| cutter_users | route | 200 | 2/2 | 33.9ms | 16.7ms | 33.9ms | 33.9ms | pass |
| dashboard_metrics | background | 200 | 3/3 | 340.4ms | 356.4ms | 366.5ms | 366.5ms | pass |

## Findings

- Slow gates: none
- Error/timeout samples: none
- Shell endpoints are expected to stay under 1s p95; route endpoints are expected to stay under 1s p95 after runtime/read-model warm-up; `dashboard_metrics` is background-only and has an 8s p95 budget.

## Notes

- All endpoint probes use GET requests only.
- When MIXLAB_ADMIN_AUTH_MODE=disabled is used for an isolated local probe, timings represent business I/O after authentication rather than password/session overhead.
- The source-video-status-read-model-v1 persistent JSON file is generated cache under .mixlab-library/admin/read-models and does not rewrite source-video manifests.
