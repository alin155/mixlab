# Admin Isolated No-Repair Performance Probe 2026-06-27T14:01:22.549Z

## Scope

This report starts a temporary local Admin API, runs the no-repair performance probe, and shuts the temporary API down. It is local acceptance evidence, not a NAS Docker deployment.

## Environment

- API: `http://127.0.0.1:60558`
- Library root: `/Volumes/MixLab/PublicLibrary`
- Expected library root: `/Volumes/MixLab/PublicLibrary`
- Auth: `disabled`, authenticated `true`
- Temporary server: `127.0.0.1:60558`, health wait `383.7ms`
- Performance artifacts: `docs/acceptance/artifacts/admin-real-nas-performance-20260627T140123Z.json`, `docs/acceptance/artifacts/admin-real-nas-performance-20260627T140123Z.md`

## Summary

- Endpoints: `20`
- Failed endpoint samples: `0`
- Slow endpoint gates: `0`
- Runtime repair endpoint count: `0`
- Runtime component contract failures: `0`
- High-risk route evidence failures: `0` / `4`
- Read-only probe: `true`
- Disable page-time store repair: `true`

## High-Risk Route Runtime Evidence

| route | success | runtime | p95 | target | data source | scan mode | cache | fallback | repair | components | evidence |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- | --- |
| source_videos_processing | 2/2 | 2/2 | 81.5ms | 1000.0ms | admin-read-model=2 | paged-list=2 | hit=2 | none | none | status_store_page max 79.0ms, library_counts max 1.0ms | complete |
| source_videos_index_required | 2/2 | 2/2 | 230.5ms | 1000.0ms | admin-read-model=2 | paged-list=2 | hit=2 | none | none | status_store_page max 227.0ms, library_counts max 0.0ms | complete |
| preprocess_jobs | 2/2 | 2/2 | 447.0ms | 1000.0ms | admin-read-model=2 | status-scan=2 | hit=2 | none | none | runtime_load max 259.0ms, preprocess_job_page max 195.0ms, concurrency_policy max 1.0ms, library_counts max 0.0ms | complete |
| index_versions | 2/2 | 2/2 | 286.2ms | 1000.0ms | current-index=2 | paged-list=2 | hit=1, miss=1 | none | none | index_package_validation max 240.0ms, current_pointer_fast_page max 42.0ms, cache_lookup max 0.0ms | complete |

## Gates

| gate | status | detail |
| --- | --- | --- |
| isolated-auth-disabled | pass | auth_mode=disabled, authenticated=true |
| library-root-match | pass | observed=/Volumes/MixLab/PublicLibrary, expected=/Volumes/MixLab/PublicLibrary |
| no-repair-sample-policy | pass | read_only_probe=true, disable_page_time_store_repair=true |
| no-runtime-repair-samples | pass | runtime_repair_endpoint_count=0 |
| required-runtime-components-present | pass | contract_count=5 |
| high-risk-route-runtime-evidence-complete | pass | routes=source_videos_processing,source_videos_index_required,preprocess_jobs,index_versions |
| all-endpoint-samples-succeeded | pass | endpoint_count=20 |
| performance-targets-met | pass | no slow endpoint gates |

## Result

- Status: `passed`
- Summary: Isolated auth-disabled no-repair performance probe passed.

## Notes

- This runner starts a temporary local Admin API with MIXLAB_ADMIN_AUTH_MODE=disabled and shuts it down after the probe.
- The child performance probe sends X-MixLab-Admin-Read-Only-Probe: true on GET requests.
- High-risk route runtime evidence must expose data source, scan mode, cache status and component timing for processing, index-required, preprocess/jobs and index/versions.
- This runner does not start workers, run scan/apply/publish/repair commands, deploy Docker, or kill the user's existing 3889/5176 services.
- Passing this runner proves the sampled route set met the current performance gates for the observed library root; it does not complete Admin Architecture v1.
