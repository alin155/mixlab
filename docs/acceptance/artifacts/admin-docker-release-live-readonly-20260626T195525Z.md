# Admin Docker Live Readonly Probe

Generated: 2026-06-26T19:55:25.545Z

Mode: live-readonly-get

Result: blocked

Live readiness ready: no

Docker upload allowed: no

This probe sends only GET requests. It does not start Docker, enable workers, repair usage-events, recover processing jobs, publish indexes, mutate NAS files, or change Cutter protocols. Optional session-token values are not written to the report; only `session_token_present` is recorded.

## Target

- Base URL configured: yes
- Base URL: http://192.168.1.27:18080
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

- Passed: 7
- Failed: 0
- Blocked: 8
- Needs external proof: 2
- Upload blockers: current-admin-api-contract-live, auth-context-live, build-version-health, preprocess-disk, usage-events-tolerance, processing-recovery, current-index, data-loading-contract-live, admin-worker-live-flags, cutter-release-compatibility-live

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
admin_web_root | GET / | 200 | yes | 31.9ms | none
auth_status | GET /api/admin/auth/status | 404 | no | 9.7ms | not_found
library_status | GET /api/admin/library/status | 200 | yes | 1135.6ms | none
release_gates | GET /api/admin/release-gates | 404 | no | 5.9ms | not_found
dashboard_metrics | GET /api/admin/dashboard/metrics | 200 | yes | 5526.9ms | none
data_loading_plan | GET /api/admin/data-loading/plan | 404 | no | 12.1ms | not_found
preprocess_supervisor_status | GET /api/admin/preprocess/supervisor/status | 200 | yes | 4.7ms | none

## Gates

| Gate | Title | Category | Status | Blocks Docker Upload | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
target-url-configured | Explicit NAS Docker Admin target URL configured | target | pass | no | Probe target was supplied explicitly. | n/a
get-only-live-probe | Live probe uses GET only | safety | pass | no | methods=GET,GET,GET,GET,GET,GET,GET | n/a
admin-web-root-live | Admin Web root reachable | live-admin | pass | no | HTTP 200, 413 bytes | n/a
admin-api-proxy-live | Admin API proxy reachable through Admin Web | live-admin | pass | no | At least one Admin API JSON endpoint responded; auth=HTTP 404, not_found 路由不存在, library=HTTP 200, ok, supervisor=HTTP 200, ok | n/a
current-admin-api-contract-live | Current Admin Architecture v1 API contract is live | live-admin | blocked | yes | Required current endpoints are missing or blocked: auth=HTTP 404, not_found 路由不存在, release_gates=HTTP 404, not_found 路由不存在, data_loading_plan=HTTP 404, not_found 路由不存在 | Deploy or point to an Admin API image exposing /api/admin/auth/status, /api/admin/release-gates, and /api/admin/data-loading/plan.
auth-context-live | Protected live gate endpoints are readable | live-admin | blocked | yes | auth_mode=unknown, authenticated=null; protected endpoints may require MIXLAB_ADMIN_DOCKER_LIVE_SESSION_TOKEN. | Provide a reviewed Admin session token only through MIXLAB_ADMIN_DOCKER_LIVE_SESSION_TOKEN; do not write it into docs.
runtime-path-profile-live | Docker runtime path profile and library root | live-docker | pass | no | runtime_path_profile=unknown, library_root=/data/PublicLibrary, expected=/data/PublicLibrary | Live release gates and library status must show Docker profile with /data/PublicLibrary.
build-version-health | Build version and image tag are live | live-docker | blocked | yes | build-version-health was not available from live release gates. | Run the live-readonly probe against an authenticated NAS Docker Admin target that exposes /api/admin/release-gates.
preprocess-disk | NAS disk protection passes live gate | live-nas | blocked | yes | preprocess-disk was not available from live release gates. | Run the live-readonly probe against an authenticated NAS Docker Admin target that exposes /api/admin/release-gates.
usage-events-tolerance | usage-events tolerance passes live gate | live-nas | blocked | yes | usage-events-tolerance was not available from live release gates. | Run the live-readonly probe against an authenticated NAS Docker Admin target that exposes /api/admin/release-gates.
processing-recovery | V001440 / processing recovery gate passes | live-nas | blocked | yes | processing-recovery was not available from live release gates. | Run the live-readonly probe against an authenticated NAS Docker Admin target that exposes /api/admin/release-gates.
current-index | Current Cutter index gate passes | live-nas | blocked | yes | current-index was not available from live release gates. | Run the live-readonly probe against an authenticated NAS Docker Admin target that exposes /api/admin/release-gates.
dashboard-metrics-live | Dashboard metrics read does not fail live | live-admin | pass | no | HTTP 200, 7405 bytes | n/a
data-loading-contract-live | Data-loading contract is readable live | live-admin | blocked | yes | Data-loading plan not proven: HTTP 404, not_found 路由不存在 | Run GET /api/admin/data-loading/plan successfully against the NAS Docker target.
supervisor-status-live | Supervisor status is readable without starting workers | live-admin | pass | no | HTTP 200, 181 bytes | n/a
admin-worker-live-flags | Running admin-worker opt-in flags are externally verified | live-docker | needs-external-proof | yes | Admin API GET endpoints cannot prove the running admin-worker container environment. | Capture target Docker .env and running admin-worker environment showing standalone workers are disabled unless explicitly opted in.
cutter-release-compatibility-live | Cutter release/index/search compatibility is externally verified | cutter-compatibility | needs-external-proof | yes | Admin API GET endpoints cannot prove Windows Cutter compatibility after a Docker release candidate. | Run Cutter compatibility smoke against the current release/index/search path and archive the report.

## Scope

This is not a Docker deployment and not a Docker upload approval. It only narrows the live proof gap using existing GET endpoints on an explicitly configured target.

Worker runtime environment proof and Cutter compatibility proof remain external unless separate accepted artifacts are attached in a later release gate.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-release-live-readonly-20260626T195525Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-release-live-readonly-20260626T195525Z.md
