# Admin Docker Live Readonly Probe

Generated: 2026-06-28T03:25:24.184Z

Mode: live-readonly-get

Result: blocked

Live readiness ready: no

Docker upload allowed: no

This probe sends only GET requests. It does not start Docker, enable workers, repair usage-events, recover processing jobs, publish indexes, mutate NAS files, or change Cutter protocols. Optional session-token values are not written to the report; only `session_token_present` is recorded.

## Target

- Base URL configured: yes
- Base URL: http://192.168.1.27:18080
- Normalized base URL: http://192.168.1.27:18080
- Target kind: admin-web-url
- Safe to probe: yes
- Target classification: Target URL shape is compatible with the NAS Docker admin-web root.
- Target notes: This only validates target shape; API/version/disk/worker/Cutter proof gates still decide readiness.
- Expected library root: /data/PublicLibrary
- Session token present: no

## Observed

- Auth mode: unknown
- Authenticated: null
- Library root: /data/PublicLibrary
- Runtime path profile: unknown
- Current index: v010471
- Counts: total 11394, ready 10471
- Build: sha unknown, version unknown, image tag unknown
- Release gates: overall unknown, allowed null

## Summary

- Passed: 8
- Failed: 0
- Blocked: 14
- Needs external proof: 2
- Upload blockers: current-admin-api-contract-live, auth-context-live, build-version-health, version-health-parity-contract-live, preprocess-disk, disk-space-protection-contract-live, usage-events-tolerance, usage-events-repair-contract-live, processing-recovery, processing-recovery-contract-live, current-index, data-loading-contract-live, admin-worker-env-proof-contract-live, admin-worker-live-flags, cutter-compatibility-proof-contract-live, cutter-release-compatibility-live

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
admin_web_root | GET / | 200 | yes | 29.5ms | none
auth_status | GET /api/admin/auth/status | 404 | no | 11.4ms | not_found
library_status | GET /api/admin/library/status | 200 | yes | 986.2ms | none
release_gates | GET /api/admin/release-gates | 404 | no | 5.1ms | not_found
dashboard_metrics | GET /api/admin/dashboard/metrics | 200 | yes | 6013.1ms | none
data_loading_plan | GET /api/admin/data-loading/plan | 404 | no | 12.2ms | not_found
preprocess_supervisor_status | GET /api/admin/preprocess/supervisor/status | 200 | yes | 6.2ms | none

## Gates

| Gate | Title | Category | Status | Blocks Docker Upload | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
target-url-configured | Explicit NAS Docker Admin target URL configured | target | pass | no | Probe target was supplied explicitly. | n/a
target-url-admin-web-shape | Target URL is the NAS Docker admin-web root | target | pass | no | admin-web-url: Target URL shape is compatible with the NAS Docker admin-web root. | n/a
get-only-live-probe | Live probe uses GET only | safety | pass | no | methods=GET,GET,GET,GET,GET,GET,GET | n/a
admin-web-root-live | Admin Web root reachable | live-admin | pass | no | HTTP 200, 413 bytes | n/a
admin-api-proxy-live | Admin API proxy reachable through Admin Web | live-admin | pass | no | At least one Admin API JSON endpoint responded; auth=HTTP 404, not_found 路由不存在, library=HTTP 200, ok, supervisor=HTTP 200, ok | n/a
current-admin-api-contract-live | Current Admin Architecture v1 API contract is live | live-admin | blocked | yes | Required current endpoints are missing or blocked: auth=HTTP 404, not_found 路由不存在, release_gates=HTTP 404, not_found 路由不存在, data_loading_plan=HTTP 404, not_found 路由不存在 | Deploy or point to an Admin API image exposing /api/admin/auth/status, /api/admin/release-gates, and /api/admin/data-loading/plan.
auth-context-live | Protected live gate endpoints are readable | live-admin | blocked | yes | auth_mode=unknown, authenticated=null; protected endpoints may require MIXLAB_ADMIN_DOCKER_LIVE_SESSION_TOKEN. | Provide a reviewed Admin session token only through MIXLAB_ADMIN_DOCKER_LIVE_SESSION_TOKEN; do not write it into docs.
runtime-path-profile-live | Docker runtime path profile and library root | live-docker | pass | no | runtime_path_profile=unknown, library_root=/data/PublicLibrary, expected=/data/PublicLibrary | Live release gates and library status must show Docker profile with /data/PublicLibrary.
build-version-health | Build version and image tag are live | live-docker | blocked | yes | build-version-health was not available from live release gates. | Run the live-readonly probe against an authenticated NAS Docker Admin target that exposes /api/admin/release-gates.
version-health-parity-contract-live | Version and health parity contract is exposed live | live-docker | blocked | yes | Live release gates did not expose a complete version_health_parity contract with expected services, GET health preflight endpoints, external Docker proof requirements, and no ready/Cutter mutations. | Deploy an Admin API that returns version_health_parity from /api/admin/release-gates before Docker upload review.
preprocess-disk | NAS disk protection passes live gate | live-nas | blocked | yes | preprocess-disk was not available from live release gates. | Run the live-readonly probe against an authenticated NAS Docker Admin target that exposes /api/admin/release-gates.
disk-space-protection-contract-live | Disk-space protection preflight contract is exposed live | live-nas | blocked | yes | Live release gates did not expose a complete disk_space_protection contract with GET preflight endpoints, threshold env var, no worker start, and no ready/Cutter mutations. | Deploy an Admin API that returns disk_space_protection from /api/admin/release-gates before Docker upload review.
usage-events-tolerance | usage-events tolerance passes live gate | live-nas | blocked | yes | usage-events-tolerance was not available from live release gates. | Run the live-readonly probe against an authenticated NAS Docker Admin target that exposes /api/admin/release-gates.
usage-events-repair-contract-live | usage-events repair dry-run contract is exposed live | live-nas | blocked | yes | Live release gates did not expose a complete usage_events_repair contract with dry-run/apply commands and no ready/Cutter mutations. | Deploy an Admin API that returns usage_events_repair from /api/admin/release-gates before Docker upload review.
processing-recovery | V001440 / processing recovery gate passes | live-nas | blocked | yes | processing-recovery was not available from live release gates. | Run the live-readonly probe against an authenticated NAS Docker Admin target that exposes /api/admin/release-gates.
processing-recovery-contract-live | Processing recovery preflight contract is exposed live | live-nas | blocked | yes | Live release gates did not expose a complete processing_recovery contract with GET preflight endpoints, idle-supervisor requirement, and no ready/Cutter mutations. | Deploy an Admin API that returns processing_recovery from /api/admin/release-gates before Docker upload review.
current-index | Current Cutter index gate passes | live-nas | blocked | yes | current-index was not available from live release gates. | Run the live-readonly probe against an authenticated NAS Docker Admin target that exposes /api/admin/release-gates.
dashboard-metrics-live | Dashboard metrics read does not fail live | live-admin | pass | no | HTTP 200, 7406 bytes | n/a
data-loading-contract-live | Data-loading contract is readable live | live-admin | blocked | yes | Data-loading plan not proven: HTTP 404, not_found 路由不存在 | Run GET /api/admin/data-loading/plan successfully against the NAS Docker target.
supervisor-status-live | Supervisor status is readable without starting workers | live-admin | pass | no | HTTP 200, 181 bytes | n/a
admin-worker-env-proof-contract-live | admin-worker env proof contract is exposed live | live-docker | blocked | yes | Live release gates did not expose a complete admin_worker_env_proof contract with disabled worker flags, /data/PublicLibrary roots, proof command, no secrets, no worker start, and no ready/Cutter mutations. | Deploy an Admin API that returns admin_worker_env_proof from /api/admin/release-gates before Docker upload review.
admin-worker-live-flags | Running admin-worker opt-in flags are externally verified | live-docker | needs-external-proof | yes | Admin API GET endpoints cannot prove the running admin-worker container environment. | Capture NAS admin-worker.env and admin-worker.inspect.json, then run admin-worker-env-proof to show standalone workers are disabled, /data/PublicLibrary roots are used, and no secrets are written to reports.
cutter-compatibility-proof-contract-live | Cutter compatibility proof contract is exposed live | cutter-compatibility | blocked | yes | Live release gates did not expose a complete cutter_compatibility_proof contract with Windows acceptance and real-cut report requirements, proof command, staged-candidate boundary, and no ready/Cutter mutations. | Deploy an Admin API that returns cutter_compatibility_proof from /api/admin/release-gates before Docker upload review.
cutter-release-compatibility-live | Cutter release/index/search compatibility is externally verified | cutter-compatibility | needs-external-proof | yes | Admin API GET endpoints cannot prove Windows Cutter compatibility after a Docker release candidate. | Run admin-cutter-compatibility-proof with staged-candidate windows_acceptance and real_cut_smoke reports, then archive the accepted proof.

## Scope

This is not a Docker deployment and not a Docker upload approval. It only narrows the live proof gap using existing GET endpoints on an explicitly configured target.

Worker runtime environment proof and Cutter compatibility proof remain external unless separate accepted artifacts are attached in a later release gate.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-release-live-readonly-20260628T032524Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-release-live-readonly-20260628T032524Z.md
