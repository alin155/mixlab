# Admin Real NAS Performance Probe 2026-06-25T18:43:29.716Z

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
| health | shell | 200 | 2/2 | 6.6ms | 1.7ms | 6.6ms | 6.6ms | pass |
| auth_status | shell | 200 | 2/2 | 3.0ms | 0.9ms | 3.0ms | 3.0ms | pass |
| library_status | shell | 200 | 2/2 | 9.9ms | 4.8ms | 9.9ms | 9.9ms | pass |
| data_loading_plan | shell | 200 | 2/2 | 0.7ms | 0.5ms | 0.7ms | 0.7ms | pass |
| read_model_status | diagnostic | 200 | 2/2 | 8.9ms | 3.8ms | 8.9ms | 8.9ms | pass |
| protection_status | route | 200 | 2/2 | 0.5ms | 0.4ms | 0.5ms | 0.5ms | pass |
| release_gates | route | 200 | 2/2 | 32.8ms | 31.0ms | 32.8ms | 32.8ms | pass |
| preprocess_safety | route | 200 | 2/2 | 1.3ms | 1.3ms | 1.7ms | 1.7ms | pass |
| source_videos_first_page | route | 200 | 2/2 | 0.4ms | 0.3ms | 0.4ms | 0.4ms | pass |
| source_videos_processing | route | 200 | 2/2 | 0.5ms | 0.5ms | 6.1ms | 6.1ms | pass |
| source_videos_index_required | route | 200 | 2/2 | 0.5ms | 0.4ms | 0.5ms | 0.5ms | pass |
| source_videos_queued | route | 200 | 2/2 | 0.4ms | 0.4ms | 0.4ms | 0.4ms | pass |
| source_videos_failed | route | 200 | 2/2 | 0.3ms | 0.3ms | 0.3ms | 0.3ms | pass |
| preprocess_jobs | route | 200 | 2/2 | 274.0ms | 261.0ms | 274.0ms | 274.0ms | pass |
| index_versions | route | 200 | 2/2 | 212.9ms | 0.6ms | 212.9ms | 212.9ms | pass |
| cutter_users | route | 200 | 2/2 | 24.5ms | 18.8ms | 24.5ms | 24.5ms | pass |
| dashboard_metrics | background | 200 | 3/3 | 291.9ms | 291.9ms | 301.5ms | 301.5ms | pass |

## Findings

- Slow gates: none
- Error/timeout samples: none
- Shell endpoints are expected to stay under 1s p95; route endpoints are expected to stay under 1s p95 after runtime/read-model warm-up; `dashboard_metrics` is background-only and has an 8s p95 budget.

## Notes

- All endpoint probes use GET requests only.
- When MIXLAB_ADMIN_AUTH_MODE=disabled is used for an isolated local probe, timings represent business I/O after authentication rather than password/session overhead.
- The source-video-status-read-model-v1 persistent JSON file is generated cache under .mixlab-library/admin/read-models and does not rewrite source-video manifests.
