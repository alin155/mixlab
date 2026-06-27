# Admin Real NAS Performance Probe 2026-06-25T18:33:27.407Z

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
| health | shell | 200 | 2/2 | 20.5ms | 16.1ms | 20.5ms | 20.5ms | pass |
| auth_status | shell | 200 | 2/2 | 13.5ms | 13.5ms | 14.0ms | 14.0ms | pass |
| library_status | shell | 200 | 2/2 | 44.5ms | 44.5ms | 51.4ms | 51.4ms | pass |
| data_loading_plan | shell | 200 | 2/2 | 0.9ms | 0.6ms | 0.9ms | 0.9ms | pass |
| read_model_status | diagnostic | 200 | 2/2 | 37.2ms | 32.6ms | 37.2ms | 37.2ms | pass |
| protection_status | route | 200 | 2/2 | 31.5ms | 29.4ms | 31.5ms | 31.5ms | pass |
| release_gates | route | 200 | 2/2 | 112.5ms | 101.1ms | 112.5ms | 112.5ms | pass |
| preprocess_safety | route | 200 | 2/2 | 18.7ms | 16.3ms | 18.7ms | 18.7ms | pass |
| source_videos_first_page | route | 200 | 2/2 | 148.8ms | 0.8ms | 148.8ms | 148.8ms | pass |
| source_videos_processing | route | 200 | 2/2 | 50.8ms | 27.3ms | 50.8ms | 50.8ms | pass |
| source_videos_index_required | route | 200 | 2/2 | 145.8ms | 96.2ms | 145.8ms | 145.8ms | pass |
| source_videos_queued | route | 200 | 2/2 | 161.5ms | 102.4ms | 161.5ms | 161.5ms | pass |
| source_videos_failed | route | 200 | 2/2 | 18.0ms | 17.1ms | 18.0ms | 18.0ms | pass |
| preprocess_jobs | route | 200 | 2/2 | 4238.4ms | 491.4ms | 4238.4ms | 4238.4ms | slow |
| index_versions | route | 200 | 2/2 | 272.4ms | 0.7ms | 272.4ms | 272.4ms | pass |
| cutter_users | route | 200 | 2/2 | 32.8ms | 13.8ms | 32.8ms | 32.8ms | pass |
| dashboard_metrics | background | 200 | 3/3 | 343.3ms | 346.4ms | 354.7ms | 354.7ms | pass |

## Findings

- Slow gates: `preprocess_jobs` p95 4238.4ms
- Error/timeout samples: none
- Shell endpoints are expected to stay under 1s p95; route endpoints are expected to stay under 1s p95 after runtime/read-model warm-up; `dashboard_metrics` is background-only and has an 8s p95 budget.

## Notes

- All endpoint probes use GET requests only.
- When MIXLAB_ADMIN_AUTH_MODE=disabled is used for an isolated local probe, timings represent business I/O after authentication rather than password/session overhead.
- The source-video-status-read-model-v1 persistent JSON file is generated cache under .mixlab-library/admin/read-models and does not rewrite source-video manifests.
