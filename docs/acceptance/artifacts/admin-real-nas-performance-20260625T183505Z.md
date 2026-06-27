# Admin Real NAS Performance Probe 2026-06-25T18:35:05.957Z

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
| health | shell | 200 | 2/2 | 270.5ms | 256.8ms | 270.5ms | 270.5ms | pass |
| auth_status | shell | 200 | 2/2 | 398.2ms | 247.0ms | 398.2ms | 398.2ms | pass |
| library_status | shell | 200 | 2/2 | 615.4ms | 78.7ms | 615.4ms | 615.4ms | pass |
| data_loading_plan | shell | 200 | 2/2 | 1.1ms | 0.8ms | 1.1ms | 1.1ms | pass |
| read_model_status | diagnostic | 200 | 2/2 | 316.0ms | 316.0ms | 1125.1ms | 1125.1ms | slow |
| protection_status | route | 200 | 2/2 | 467.1ms | 2.2ms | 467.1ms | 467.1ms | pass |
| release_gates | route | 200 | 2/2 | 484.3ms | 20.8ms | 484.3ms | 484.3ms | pass |
| preprocess_safety | route | 200 | 2/2 | 347.8ms | 3.3ms | 347.8ms | 347.8ms | pass |
| source_videos_first_page | route | 200 | 2/2 | 2432.8ms | 1.2ms | 2432.8ms | 2432.8ms | slow |
| source_videos_processing | route | 200 | 2/2 | 1518.0ms | 6.7ms | 1518.0ms | 1518.0ms | slow |
| source_videos_index_required | route | 200 | 2/2 | 2379.6ms | 1052.7ms | 2379.6ms | 2379.6ms | slow |
| source_videos_queued | route | 200 | 2/2 | 793.9ms | 170.6ms | 793.9ms | 793.9ms | pass |
| source_videos_failed | route | 200 | 2/2 | 14.3ms | 0.8ms | 14.3ms | 14.3ms | pass |
| preprocess_jobs | route | 200 | 2/2 | 335.6ms | 334.2ms | 335.6ms | 335.6ms | pass |
| index_versions | route | 200 | 2/2 | 224.8ms | 0.7ms | 224.8ms | 224.8ms | pass |
| cutter_users | route | 200 | 2/2 | 29.0ms | 14.5ms | 29.0ms | 29.0ms | pass |
| dashboard_metrics | background | 200 | 3/3 | 293.8ms | 293.8ms | 298.0ms | 298.0ms | pass |

## Findings

- Slow gates: `read_model_status` p95 1125.1ms, `source_videos_first_page` p95 2432.8ms, `source_videos_processing` p95 1518.0ms, `source_videos_index_required` p95 2379.6ms
- Error/timeout samples: none
- Shell endpoints are expected to stay under 1s p95; route endpoints are expected to stay under 1s p95 after runtime/read-model warm-up; `dashboard_metrics` is background-only and has an 8s p95 budget.

## Notes

- All endpoint probes use GET requests only.
- When MIXLAB_ADMIN_AUTH_MODE=disabled is used for an isolated local probe, timings represent business I/O after authentication rather than password/session overhead.
- The source-video-status-read-model-v1 persistent JSON file is generated cache under .mixlab-library/admin/read-models and does not rewrite source-video manifests.
