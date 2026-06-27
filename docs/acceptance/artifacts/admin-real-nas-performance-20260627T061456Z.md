# Admin Real NAS Performance Probe 2026-06-27T06:14:56.962Z

## Scope

This report measures read-only Admin API performance against a real public-library root. It separates shell, route, diagnostic and background endpoints so route-blocking work does not get mixed with expensive background scans.

## Environment

- API: `http://127.0.0.1:3889`
- Auth mode: `password`
- Authenticated: `false`
- Library root: `unknown`
- Source videos path: `unknown`
- Current index: `unknown`
- Updated at: `unknown`
- Counts: total `n/a`, ready `n/a`, processing `n/a`, queued `n/a`, failed `n/a`, index-required `n/a`
- Disk: n/a available / n/a total (n/a% used)

## Read Model Control Surface

- Admin read model storage: `unknown`
- Admin read model freshness: `unknown`
- Admin read model exists: `unknown`
- Admin read model video count: `n/a`
- Admin read model reconciliation: action `unknown`, reason `unknown`, scan mode `unknown`, requires background reconcile `unknown`, safe for page request `unknown`
- Source-video status read model freshness: `unknown`
- Source-video status read model persisted: `unknown`

## Endpoint Results

| endpoint | phase | first status | success | cold | p50 | p95 | max | gate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| health | shell | 200 | 2/2 | 0.6ms | 0.5ms | 0.6ms | 0.6ms | pass |
| auth_status | shell | 200 | 2/2 | 0.8ms | 0.8ms | 1.4ms | 1.4ms | pass |
| library_status | shell | 401 | 0/1 | 0.4ms | n/a | n/a | n/a | n/a |
| data_loading_plan | shell | 401 | 0/1 | 0.3ms | n/a | n/a | n/a | n/a |
| read_model_status | diagnostic | 401 | 0/1 | 0.4ms | n/a | n/a | n/a | n/a |
| read_model_reconcile_status | diagnostic | 401 | 0/1 | 0.5ms | n/a | n/a | n/a | n/a |
| protection_status | route | 401 | 0/1 | 0.6ms | n/a | n/a | n/a | n/a |
| release_gates | route | 401 | 0/1 | 0.4ms | n/a | n/a | n/a | n/a |
| preprocess_safety | route | 401 | 0/1 | 0.3ms | n/a | n/a | n/a | n/a |
| operations_overview | route | 401 | 0/1 | 0.3ms | n/a | n/a | n/a | n/a |
| operation_log | route | 401 | 0/1 | 0.2ms | n/a | n/a | n/a | n/a |
| source_videos_first_page | route | 401 | 0/1 | 0.2ms | n/a | n/a | n/a | n/a |
| source_videos_processing | route | 401 | 0/1 | 2.7ms | n/a | n/a | n/a | n/a |
| source_videos_index_required | route | 401 | 0/1 | 0.3ms | n/a | n/a | n/a | n/a |
| source_videos_queued | route | 401 | 0/1 | 0.2ms | n/a | n/a | n/a | n/a |
| source_videos_failed | route | 401 | 0/1 | 0.2ms | n/a | n/a | n/a | n/a |
| preprocess_jobs | route | 401 | 0/1 | 0.2ms | n/a | n/a | n/a | n/a |
| index_versions | route | 401 | 0/1 | 0.2ms | n/a | n/a | n/a | n/a |
| cutter_users | route | 401 | 0/1 | 0.2ms | n/a | n/a | n/a | n/a |
| dashboard_metrics | background | 401 | 0/1 | 0.2ms | n/a | n/a | n/a | n/a |

## Runtime Source Summary

| endpoint | runtime samples | actual data source | cache status | fallback reasons | repair reasons | runtime slow |
| --- | ---: | --- | --- | --- | --- | ---: |
| health | 0/2 | none | none | none | none | 0 |
| auth_status | 0/2 | none | none | none | none | 0 |
| library_status | 0/1 | none | none | none | none | 0 |
| data_loading_plan | 0/1 | none | none | none | none | 0 |
| read_model_status | 0/1 | none | none | none | none | 0 |
| read_model_reconcile_status | 0/1 | none | none | none | none | 0 |
| protection_status | 0/1 | none | none | none | none | 0 |
| release_gates | 0/1 | none | none | none | none | 0 |
| preprocess_safety | 0/1 | none | none | none | none | 0 |
| operations_overview | 0/1 | none | none | none | none | 0 |
| operation_log | 0/1 | none | none | none | none | 0 |
| source_videos_first_page | 0/1 | none | none | none | none | 0 |
| source_videos_processing | 0/1 | none | none | none | none | 0 |
| source_videos_index_required | 0/1 | none | none | none | none | 0 |
| source_videos_queued | 0/1 | none | none | none | none | 0 |
| source_videos_failed | 0/1 | none | none | none | none | 0 |
| preprocess_jobs | 0/1 | none | none | none | none | 0 |
| index_versions | 0/1 | none | none | none | none | 0 |
| cutter_users | 0/1 | none | none | none | none | 0 |
| dashboard_metrics | 0/1 | none | none | none | none | 0 |

## Findings

- Slow gates: none
- Error/timeout samples: `library_status` 0/1, `data_loading_plan` 0/1, `read_model_status` 0/1, `read_model_reconcile_status` 0/1, `protection_status` 0/1, `release_gates` 0/1, `preprocess_safety` 0/1, `operations_overview` 0/1, `operation_log` 0/1, `source_videos_first_page` 0/1, `source_videos_processing` 0/1, `source_videos_index_required` 0/1, `source_videos_queued` 0/1, `source_videos_failed` 0/1, `preprocess_jobs` 0/1, `index_versions` 0/1, `cutter_users` 0/1, `dashboard_metrics` 0/1
- Runtime fallbacks: none
- Runtime repairs: none
- Shell endpoints are expected to stay under 1s p95; route endpoints are expected to stay under 1s p95 after runtime/read-model warm-up; `dashboard_metrics` is background-only and has an 8s p95 budget.

## Notes

- All endpoint probes use GET requests only.
- The probe checks read-model reconcile status but never starts, cancels, applies, repairs or publishes any command.
- Runtime Source Summary is derived from response meta.runtime fields and does not perform any additional scans.
- When MIXLAB_ADMIN_AUTH_MODE=disabled is used for an isolated local probe, timings represent business I/O after authentication rather than password/session overhead.
- The source-video-status-read-model-v1 persistent JSON file is generated cache under .mixlab-library/admin/read-models and does not rewrite source-video manifests.
- The admin.sqlite read model is an optimization and must remain rebuildable from source-video manifests; it is not the asset source of truth.
