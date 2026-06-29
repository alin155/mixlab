# Admin Docker Live Readonly Probe

Generated: 2026-06-29T15:52:19.674Z

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
- Session token present: yes

## Observed

- Auth mode: password
- Authenticated: true
- Library root: /data/PublicLibrary
- Runtime path profile: docker
- Current index: v010471
- Counts: total 11394, ready 10471
- Build: sha 5a50922bc82f1b6728f247ed33e5885ab8cf6bef, version 5a50922bc82f1b6728f247ed33e5885ab8cf6bef, image tag 5a50922bc82f1b6728f247ed33e5885ab8cf6bef
- Release gates: overall attention, allowed false

## Summary

- Passed: 22
- Failed: 0
- Blocked: 0
- Needs external proof: 2
- Upload blockers: admin-worker-live-flags, cutter-release-compatibility-live

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
admin_web_root | GET / | 200 | yes | 30.3ms | none
auth_status | GET /api/admin/auth/status | 200 | yes | 15.7ms | none
library_status | GET /api/admin/library/status | 200 | yes | 9.7ms | none
release_gates | GET /api/admin/release-gates | 200 | yes | 64.0ms | none
dashboard_metrics | GET /api/admin/dashboard/metrics | 200 | yes | 454.7ms | none
data_loading_plan | GET /api/admin/data-loading/plan | 200 | yes | 13.1ms | none
preprocess_supervisor_status | GET /api/admin/preprocess/supervisor/status | 200 | yes | 9.1ms | none

## Gates

| Gate | Title | Category | Status | Blocks Docker Upload | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
target-url-configured | Explicit NAS Docker Admin target URL configured | target | pass | no | Probe target was supplied explicitly. | n/a
target-url-admin-web-shape | Target URL is the NAS Docker admin-web root | target | pass | no | admin-web-url: Target URL shape is compatible with the NAS Docker admin-web root. | n/a
get-only-live-probe | Live probe uses GET only | safety | pass | no | methods=GET,GET,GET,GET,GET,GET,GET | n/a
admin-web-root-live | Admin Web root reachable | live-admin | pass | no | HTTP 200, 681 bytes | n/a
admin-api-proxy-live | Admin API proxy reachable through Admin Web | live-admin | pass | no | At least one Admin API JSON endpoint responded; auth=HTTP 200, ok, library=HTTP 200, ok, supervisor=HTTP 200, ok | n/a
current-admin-api-contract-live | Current Admin Architecture v1 API contract is live | live-admin | pass | no | auth/status, release-gates, and data-loading/plan all responded. | n/a
auth-context-live | Protected live gate endpoints are readable | live-admin | pass | no | auth_mode=password, authenticated=true | n/a
runtime-path-profile-live | Docker runtime path profile and library root | live-docker | pass | no | runtime_path_profile=docker, library_root=/data/PublicLibrary, expected=/data/PublicLibrary | Live release gates and library status must show Docker profile with /data/PublicLibrary.
build-version-health | Build version and image tag are live | live-docker | pass | no | 构建版本信息完整。 | n/a
version-health-parity-contract-live | Version and health parity contract is exposed live | live-docker | pass | no | status=ready, image_tag=5a50922bc82f1b6728f247ed33e5885ab8cf6bef, services=admin-web,admin-api,admin-worker | n/a
preprocess-disk | NAS disk protection passes live gate | live-nas | pass | no | 公共素材库磁盘空间通过门禁。 | n/a
disk-space-protection-contract-live | Disk-space protection preflight contract is exposed live | live-nas | pass | no | status=healthy, usage=68%, threshold=92%, scope=preprocess-and-docker-upload | n/a
usage-events-tolerance | usage-events tolerance passes live gate | live-nas | pass | no | usage-events 可正常读取，修复工具处于待命状态。 | n/a
usage-events-repair-contract-live | usage-events repair dry-run contract is exposed live | live-nas | pass | no | scope=usage-events-only, dry_run_command=npx tsx scripts/acceptance/usage-events-repair.ts --library-root '/data/PublicLibrary', projection=/data/PublicLibrary/.mixlab-library/admin-read-model/usage-metrics.sqlite | n/a
processing-recovery | V001440 / processing recovery gate passes | live-nas | pass | no | 没有需要恢复的 processing 任务。 | n/a
processing-recovery-contract-live | Processing recovery preflight contract is exposed live | live-nas | pass | no | scope=processing-to-queued-only, bulk=POST /api/admin/preprocess/recover-processing, count=0 | n/a
current-index | Current Cutter index gate passes | live-nas | pass | no | 当前索引指针通过基础门禁。 | n/a
dashboard-metrics-live | Dashboard metrics read does not fail live | live-admin | pass | no | HTTP 200, 10925 bytes | n/a
data-loading-contract-live | Data-loading contract is readable live | live-admin | pass | no | HTTP 200, 12679 bytes | n/a
supervisor-status-live | Supervisor status is readable without starting workers | live-admin | pass | no | HTTP 200, 181 bytes | n/a
admin-worker-env-proof-contract-live | admin-worker env proof contract is exposed live | live-docker | pass | no | status=external-proof-required, scope=admin-worker-env-only, service=admin-worker | n/a
admin-worker-live-flags | Running admin-worker opt-in flags are externally verified | live-docker | needs-external-proof | yes | Admin API GET endpoints cannot prove the running admin-worker container environment. | Capture NAS admin-worker.env and admin-worker.inspect.json, then run admin-worker-env-proof to show standalone workers are disabled, /data/PublicLibrary roots are used, and no secrets are written to reports.
cutter-compatibility-proof-contract-live | Cutter compatibility proof contract is exposed live | cutter-compatibility | pass | no | status=external-proof-required, scope=cutter-compatibility-only, expected_ready_count=10471 | n/a
cutter-release-compatibility-live | Cutter release/index/search compatibility is externally verified | cutter-compatibility | needs-external-proof | yes | Admin API GET endpoints cannot prove Windows Cutter compatibility after a Docker release candidate. | Run admin-cutter-compatibility-proof with staged-candidate windows_acceptance and real_cut_smoke reports, then archive the accepted proof.

## Scope

This is not a Docker deployment and not a Docker upload approval. It only narrows the live proof gap using existing GET endpoints on an explicitly configured target.

Worker runtime environment proof and Cutter compatibility proof remain external unless separate accepted artifacts are attached in a later release gate.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-release-live-readonly-20260629T155219Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-release-live-readonly-20260629T155219Z.md
