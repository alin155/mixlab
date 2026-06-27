# Admin Docker Live Readonly Probe

Generated: 2026-06-27T14:52:08.999Z

Mode: live-readonly-get

Result: blocked

Live readiness ready: no

Docker upload allowed: no

This probe sends only GET requests. It does not start Docker, enable workers, repair usage-events, recover processing jobs, publish indexes, mutate NAS files, or change Cutter protocols. Optional session-token values are not written to the report; only `session_token_present` is recorded.

## Target

- Base URL configured: no
- Base URL: not configured
- Expected library root: /data/PublicLibrary
- Session token present: no

## Observed

- Auth mode: unknown
- Authenticated: null
- Library root: unknown
- Runtime path profile: unknown
- Current index: unknown
- Counts: total n/a, ready n/a
- Build: sha unknown, version unknown, image tag unknown
- Release gates: overall unknown, allowed null

## Summary

- Passed: 1
- Failed: 0
- Blocked: 17
- Needs external proof: 2
- Upload blockers: target-url-configured, admin-web-root-live, admin-api-proxy-live, current-admin-api-contract-live, auth-context-live, runtime-path-profile-live, build-version-health, preprocess-disk, disk-space-protection-contract-live, usage-events-tolerance, usage-events-repair-contract-live, processing-recovery, processing-recovery-contract-live, current-index, dashboard-metrics-live, data-loading-contract-live, supervisor-status-live, admin-worker-live-flags, cutter-release-compatibility-live

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
none | n/a | n/a | n/a | n/a | n/a

## Gates

| Gate | Title | Category | Status | Blocks Docker Upload | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
target-url-configured | Explicit NAS Docker Admin target URL configured | target | blocked | yes | MIXLAB_ADMIN_DOCKER_LIVE_BASE_URL is not set; the probe will not guess a NAS address. | Set MIXLAB_ADMIN_DOCKER_LIVE_BASE_URL to the NAS Docker admin-web URL.
get-only-live-probe | Live probe uses GET only | safety | pass | no | methods=none | n/a
admin-web-root-live | Admin Web root reachable | live-admin | blocked | yes | Admin Web root not proven: request not run | Probe the NAS admin-web root URL and archive a successful HTTP response.
admin-api-proxy-live | Admin API proxy reachable through Admin Web | live-admin | blocked | yes | No Admin API JSON endpoint was proven; auth=request not run, library=request not run, supervisor=request not run | Probe at least one /api/admin/* JSON endpoint through the NAS admin-web proxy.
current-admin-api-contract-live | Current Admin Architecture v1 API contract is live | live-admin | blocked | yes | Required current endpoints are missing or blocked: auth=request not run, release_gates=request not run, data_loading_plan=request not run | Deploy or point to an Admin API image exposing /api/admin/auth/status, /api/admin/release-gates, and /api/admin/data-loading/plan.
auth-context-live | Protected live gate endpoints are readable | live-admin | blocked | yes | auth_mode=unknown, authenticated=null; protected endpoints may require MIXLAB_ADMIN_DOCKER_LIVE_SESSION_TOKEN. | Provide a reviewed Admin session token only through MIXLAB_ADMIN_DOCKER_LIVE_SESSION_TOKEN; do not write it into docs.
runtime-path-profile-live | Docker runtime path profile and library root | live-docker | blocked | yes | runtime_path_profile=unknown, library_root=unknown, expected=/data/PublicLibrary | Live release gates and library status must show Docker profile with /data/PublicLibrary.
build-version-health | Build version and image tag are live | live-docker | blocked | yes | build-version-health was not available from live release gates. | Run the live-readonly probe against an authenticated NAS Docker Admin target that exposes /api/admin/release-gates.
preprocess-disk | NAS disk protection passes live gate | live-nas | blocked | yes | preprocess-disk was not available from live release gates. | Run the live-readonly probe against an authenticated NAS Docker Admin target that exposes /api/admin/release-gates.
disk-space-protection-contract-live | Disk-space protection preflight contract is exposed live | live-nas | blocked | yes | Live release gates did not expose a complete disk_space_protection contract with GET preflight endpoints, threshold env var, no worker start, and no ready/Cutter mutations. | Deploy an Admin API that returns disk_space_protection from /api/admin/release-gates before Docker upload review.
usage-events-tolerance | usage-events tolerance passes live gate | live-nas | blocked | yes | usage-events-tolerance was not available from live release gates. | Run the live-readonly probe against an authenticated NAS Docker Admin target that exposes /api/admin/release-gates.
usage-events-repair-contract-live | usage-events repair dry-run contract is exposed live | live-nas | blocked | yes | Live release gates did not expose a complete usage_events_repair contract with dry-run/apply commands and no ready/Cutter mutations. | Deploy an Admin API that returns usage_events_repair from /api/admin/release-gates before Docker upload review.
processing-recovery | V001440 / processing recovery gate passes | live-nas | blocked | yes | processing-recovery was not available from live release gates. | Run the live-readonly probe against an authenticated NAS Docker Admin target that exposes /api/admin/release-gates.
processing-recovery-contract-live | Processing recovery preflight contract is exposed live | live-nas | blocked | yes | Live release gates did not expose a complete processing_recovery contract with GET preflight endpoints, idle-supervisor requirement, and no ready/Cutter mutations. | Deploy an Admin API that returns processing_recovery from /api/admin/release-gates before Docker upload review.
current-index | Current Cutter index gate passes | live-nas | blocked | yes | current-index was not available from live release gates. | Run the live-readonly probe against an authenticated NAS Docker Admin target that exposes /api/admin/release-gates.
dashboard-metrics-live | Dashboard metrics read does not fail live | live-admin | blocked | yes | Dashboard metrics not proven: request not run | Run GET /api/admin/dashboard/metrics successfully against the NAS Docker target.
data-loading-contract-live | Data-loading contract is readable live | live-admin | blocked | yes | Data-loading plan not proven: request not run | Run GET /api/admin/data-loading/plan successfully against the NAS Docker target.
supervisor-status-live | Supervisor status is readable without starting workers | live-admin | blocked | yes | Supervisor status not proven: request not run | Run GET /api/admin/preprocess/supervisor/status successfully; do not call start/stop.
admin-worker-live-flags | Running admin-worker opt-in flags are externally verified | live-docker | needs-external-proof | yes | Admin API GET endpoints cannot prove the running admin-worker container environment. | Capture target Docker .env and running admin-worker environment showing standalone workers are disabled unless explicitly opted in.
cutter-release-compatibility-live | Cutter release/index/search compatibility is externally verified | cutter-compatibility | needs-external-proof | yes | Admin API GET endpoints cannot prove Windows Cutter compatibility after a Docker release candidate. | Run Cutter compatibility smoke against the current release/index/search path and archive the report.

## Scope

This is not a Docker deployment and not a Docker upload approval. It only narrows the live proof gap using existing GET endpoints on an explicitly configured target.

Worker runtime environment proof and Cutter compatibility proof remain external unless separate accepted artifacts are attached in a later release gate.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-release-live-readonly-20260627T145209Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-release-live-readonly-20260627T145209Z.md
