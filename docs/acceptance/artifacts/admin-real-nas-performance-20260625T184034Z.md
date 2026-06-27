# Admin Real NAS Performance Probe 2026-06-25T18:40:34.091Z

## Scope

This report measures read-only Admin API performance against a real public-library root. It separates shell, route, diagnostic and background endpoints so route-blocking work does not get mixed with expensive background scans.

## Environment

- API: `http://127.0.0.1:3891`
- Auth mode: `disabled`
- Authenticated: `true`
- Library root: `/Volumes/MixLab/PublicLibrary`
- Source videos path: `/Volumes/MixLab/PublicLibrary/source-videos`
- Current index: `v010471`
- Updated at: `2026-06-24T13:06:42.230Z`
- Counts: total `11394`, ready `10471`, processing `1`, queued `903`, failed `0`, index-required `19`
- Disk: 628.8 GiB available / 29.0 TiB total (97.9% used)

## Endpoint Results

| endpoint | phase | first status | success | cold | p50 | p95 | max | gate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| health | shell | 200 | 2/2 | 12.5ms | 0.9ms | 12.5ms | 12.5ms | pass |
| auth_status | shell | 200 | 2/2 | 13.1ms | 13.1ms | 16.9ms | 16.9ms | pass |
| library_status | shell | 200 | 2/2 | 5.0ms | 0.7ms | 5.0ms | 5.0ms | pass |
| data_loading_plan | shell | 200 | 2/2 | 0.5ms | 0.5ms | 0.5ms | 0.5ms | pass |
| read_model_status | diagnostic | 200 | 2/2 | 13.9ms | 13.9ms | 13.9ms | 13.9ms | pass |
| protection_status | route | 200 | 2/2 | 0.7ms | 0.6ms | 0.7ms | 0.7ms | pass |
| release_gates | route | 200 | 2/2 | 46.9ms | 29.4ms | 46.9ms | 46.9ms | pass |
| preprocess_safety | route | 200 | 2/2 | 0.7ms | 0.5ms | 0.7ms | 0.7ms | pass |
| source_videos_first_page | route | 200 | 2/2 | 7383.3ms | 2.3ms | 7383.3ms | 7383.3ms | slow |
| source_videos_processing | route | 200 | 2/2 | 16.6ms | 8.9ms | 16.6ms | 16.6ms | pass |
| source_videos_index_required | route | 200 | 2/2 | 10.2ms | 7.9ms | 10.2ms | 10.2ms | pass |
| source_videos_queued | route | 200 | 2/2 | 0.8ms | 0.6ms | 0.8ms | 0.8ms | pass |
| source_videos_failed | route | 200 | 2/2 | 0.5ms | 0.4ms | 0.5ms | 0.5ms | pass |
| preprocess_jobs | route | 200 | 2/2 | 276.2ms | 264.3ms | 276.2ms | 276.2ms | pass |
| index_versions | route | 200 | 2/2 | 205.1ms | 0.9ms | 205.1ms | 205.1ms | pass |
| cutter_users | route | 200 | 2/2 | 21.4ms | 18.9ms | 21.4ms | 21.4ms | pass |
| dashboard_metrics | background | 200 | 3/3 | 286.2ms | 288.3ms | 290.7ms | 290.7ms | pass |

## Findings

- Slow gates: `source_videos_first_page` p95 7383.3ms
- Error/timeout samples: none
- Shell endpoints are expected to stay under 1s p95; route endpoints are expected to stay under 1s p95 after runtime/read-model warm-up; `dashboard_metrics` is background-only and has an 8s p95 budget.

## Notes

- All endpoint probes use GET requests only.
- When MIXLAB_ADMIN_AUTH_MODE=disabled is used for an isolated local probe, timings represent business I/O after authentication rather than password/session overhead.
- The source-video-status-read-model-v1 persistent JSON file is generated cache under .mixlab-library/admin/read-models and does not rewrite source-video manifests.
