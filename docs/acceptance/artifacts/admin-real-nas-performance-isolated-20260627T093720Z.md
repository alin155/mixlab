# Admin Isolated No-Repair Performance Probe 2026-06-27T09:37:20.477Z

## Scope

This report starts a temporary local Admin API, runs the no-repair performance probe, and shuts the temporary API down. It is local acceptance evidence, not a NAS Docker deployment.

## Environment

- API: `http://127.0.0.1:51307`
- Library root: `/Volumes/MixLab/PublicLibrary`
- Expected library root: `/Volumes/MixLab/PublicLibrary`
- Auth: `disabled`, authenticated `true`
- Temporary server: `127.0.0.1:51307`, health wait `367.6ms`
- Performance artifacts: `docs/acceptance/artifacts/admin-real-nas-performance-20260627T093720Z.json`, `docs/acceptance/artifacts/admin-real-nas-performance-20260627T093720Z.md`

## Summary

- Endpoints: `20`
- Failed endpoint samples: `0`
- Slow endpoint gates: `0`
- Runtime repair endpoint count: `0`
- Runtime component contract failures: `1`
- Read-only probe: `true`
- Disable page-time store repair: `true`

## Gates

| gate | status | detail |
| --- | --- | --- |
| isolated-auth-disabled | pass | auth_mode=disabled, authenticated=true |
| library-root-match | pass | observed=/Volumes/MixLab/PublicLibrary, expected=/Volumes/MixLab/PublicLibrary |
| no-repair-sample-policy | pass | read_only_probe=true, disable_page_time_store_repair=true |
| no-runtime-repair-samples | pass | runtime_repair_endpoint_count=0 |
| required-runtime-components-present | blocked | preprocess_jobs missing=concurrency_policy,library_counts,preprocess_job_page,runtime_load |
| all-endpoint-samples-succeeded | pass | endpoint_count=20 |
| performance-targets-met | pass | no slow endpoint gates |

## Result

- Status: `failed`
- Summary: Isolated auth-disabled no-repair performance probe failed one or more gates.

## Notes

- This runner starts a temporary local Admin API with MIXLAB_ADMIN_AUTH_MODE=disabled and shuts it down after the probe.
- The child performance probe sends X-MixLab-Admin-Read-Only-Probe: true on GET requests.
- This runner does not start workers, run scan/apply/publish/repair commands, deploy Docker, or kill the user's existing 3889/5176 services.
- Passing this runner proves the sampled route set met the current performance gates for the observed library root; it does not complete Admin Architecture v1.
