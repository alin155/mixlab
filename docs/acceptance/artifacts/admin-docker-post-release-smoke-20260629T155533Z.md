# Admin Docker Post-release Smoke

Generated: 2026-06-29T15:55:33.183Z

Mode: admin-docker-post-release-smoke

Result: ready

Post-release smoke ready: yes

Image push allowed: no

Docker deploy allowed: no

Preprocess execution allowed: no

NAS file mutation: no

This smoke sends only GET requests. It does not approve image push, restart Docker containers, start/stop workers, queue/retry/recover/publish videos, repair indexes, mutate NAS files, or change Cutter protocols. Session-token values are not written to this report.

## Target

- Base URL: http://192.168.1.27:18080
- Normalized base URL: http://192.168.1.27:18080
- Safe to probe: yes
- Classification: Target URL shape is compatible with the NAS Docker admin-web root.
- Notes: This only validates target shape; API/version/disk/worker/Cutter proof gates still decide readiness.
- Session token present: yes
- Expected library root: /data/PublicLibrary
- Expected ready count: 10471
- Expected index version: v010471
- Expected target image tag: 5a50922bc82f1b6728f247ed33e5885ab8cf6bef

## Observed

- Auth mode: password
- Authenticated: true
- Library root: /data/PublicLibrary
- Ready count: 10471
- Current index: v010471
- Build sha: 5a50922bc82f1b6728f247ed33e5885ab8cf6bef
- Build version: 5a50922bc82f1b6728f247ed33e5885ab8cf6bef
- Image tag: 5a50922bc82f1b6728f247ed33e5885ab8cf6bef
- Release gates: attention, release_allowed=false
- Data loading strategy: shell-first-route-owned-v1
- Cutter users: 16
- Preprocess safety: healthy
- Preprocess supervisor state: idle
- Preprocess jobs: 20

## Summary

- Passed: 10
- Blocked: 0
- Failed: 0
- MVP blockers: none

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
admin_web_root | GET / | 200 | yes | 30.5ms | none
health | GET /health | 200 | yes | 12.6ms | none
auth_status | GET /api/admin/auth/status | 200 | yes | 8.2ms | none
library_status | GET /api/admin/library/status | 200 | yes | 10.7ms | none
release_gates | GET /api/admin/release-gates | 200 | yes | 95.2ms | none
data_loading_plan | GET /api/admin/data-loading/plan | 200 | yes | 10.8ms | none
cutter_users | GET /api/admin/cutter-users | 200 | yes | 15.2ms | none
preprocess_safety | GET /api/admin/preprocess/safety | 200 | yes | 9.7ms | none
preprocess_supervisor_status | GET /api/admin/preprocess/supervisor/status | 200 | yes | 7.2ms | none
preprocess_jobs | GET /api/admin/preprocess/jobs?limit=20 | 200 | yes | 294.0ms | none

## Gates

| Gate | Category | Status | Blocks MVP Completion | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- |
final-admin-target | target | pass | yes | Target URL shape is compatible with the NAS Docker admin-web root. | n/a
read-only-probe-boundary | safety | pass | yes | All post-release smoke probes are GET-only and exclude scan/apply/publish/repair/queue/retry/recover/start/stop/cancel paths. | n/a
final-url-required-requests | admin-mvp | pass | yes | All required final smoke endpoints responded successfully. | n/a
admin-session-proven | auth | pass | yes | GET /api/admin/auth/status returned authenticated=true. | n/a
docker-health-version-target | docker | pass | yes | Observed build_sha=5a50922bc82f1b6728f247ed33e5885ab8cf6bef, image_tag=5a50922bc82f1b6728f247ed33e5885ab8cf6bef. | n/a
public-library-invariants | library | pass | yes | root=/data/PublicLibrary, ready=10471, index=v010471. | n/a
release-gates-safe | docker | pass | yes | release_overall_status=attention, release_allowed=false, docker_upload_allowed=null. | n/a
data-loading-plan-readable | admin-mvp | pass | yes | strategy=shell-first-route-owned-v1. | n/a
cutter-users-readable | admin-mvp | pass | yes | cutter_user_count=16. | n/a
preprocess-readonly-ready | preprocess | pass | yes | safety=healthy, supervisor_idle=true, jobs=20. | n/a

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-post-release-smoke-20260629T155533Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-post-release-smoke-20260629T155533Z.md
