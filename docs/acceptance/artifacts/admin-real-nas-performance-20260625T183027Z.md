# Admin Real NAS Performance Probe 2026-06-25T18:30:27.872Z

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
| health | shell | 200 | 2/2 | 13.3ms | 1.0ms | 13.3ms | 13.3ms | pass |
| auth_status | shell | 200 | 2/2 | 0.8ms | 0.6ms | 0.8ms | 0.8ms | pass |
| library_status | shell | 200 | 2/2 | 24.0ms | 24.0ms | 5720.0ms | 5720.0ms | slow |
| data_loading_plan | shell | 200 | 2/2 | 3.2ms | 3.2ms | 3.9ms | 3.9ms | pass |
| read_model_status | diagnostic | 200 | 2/2 | 83.9ms | 3.0ms | 83.9ms | 83.9ms | pass |
| protection_status | route | 200 | 2/2 | 2.3ms | 2.3ms | 2.3ms | 2.3ms | pass |
| release_gates | route | n/a | 0/1 | 8003.2ms | n/a | n/a | n/a | n/a |

## Findings

- Slow gates: `library_status` p95 5720.0ms
- Error/timeout samples: `release_gates` 0/1
- Shell endpoints are expected to stay under 1s p95; route endpoints are expected to stay under 1s p95 after runtime/read-model warm-up; `dashboard_metrics` is background-only and has an 8s p95 budget.

## Notes

- All endpoint probes use GET requests only.
- When MIXLAB_ADMIN_AUTH_MODE=disabled is used for an isolated local probe, timings represent business I/O after authentication rather than password/session overhead.
- The source-video-status-read-model-v1 persistent JSON file is generated cache under .mixlab-library/admin/read-models and does not rewrite source-video manifests.
