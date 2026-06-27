# Admin Isolated No-Repair Performance Probe 2026-06-27T10:16:30.938Z

## Scope

This report starts a temporary local Admin API, runs the no-repair performance probe, and shuts the temporary API down. It is local acceptance evidence, not a NAS Docker deployment.

## Environment

- API: `http://127.0.0.1:52663`
- Library root: `/Volumes/MixLab/PublicLibrary`
- Expected library root: `/Volumes/MixLab/PublicLibrary`
- Auth: `disabled`, authenticated `true`
- Temporary server: `127.0.0.1:52663`, health wait `474.4ms`
- Performance artifacts: `docs/acceptance/artifacts/admin-real-nas-performance-20260627T101631Z.json`, `docs/acceptance/artifacts/admin-real-nas-performance-20260627T101631Z.md`

## Summary

- Endpoints: `20`
- Failed endpoint samples: `0`
- Slow endpoint gates: `0`
- Runtime repair endpoint count: `0`
- Runtime component contract failures: `0`
- Read-only probe: `true`
- Disable page-time store repair: `true`

## Gates

| gate | status | detail |
| --- | --- | --- |
| isolated-auth-disabled | pass | auth_mode=disabled, authenticated=true |
| library-root-match | pass | observed=/Volumes/MixLab/PublicLibrary, expected=/Volumes/MixLab/PublicLibrary |
| no-repair-sample-policy | pass | read_only_probe=true, disable_page_time_store_repair=true |
| no-runtime-repair-samples | pass | runtime_repair_endpoint_count=0 |
| required-runtime-components-present | pass | contract_count=5 |
| all-endpoint-samples-succeeded | pass | endpoint_count=20 |
| performance-targets-met | pass | no slow endpoint gates |

## Result

- Status: `passed`
- Summary: Isolated auth-disabled no-repair performance probe passed.

## Notes

- This runner starts a temporary local Admin API with MIXLAB_ADMIN_AUTH_MODE=disabled and shuts it down after the probe.
- The child performance probe sends X-MixLab-Admin-Read-Only-Probe: true on GET requests.
- This runner does not start workers, run scan/apply/publish/repair commands, deploy Docker, or kill the user's existing 3889/5176 services.
- Passing this runner proves the sampled route set met the current performance gates for the observed library root; it does not complete Admin Architecture v1.
