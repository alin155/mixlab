# Admin Docker NAS UGOS Returned Evidence

Generated: 2026-06-28T22:39:15.230Z
Mode: admin-docker-nas-ugos-returned-evidence
Result: generated
Returned dir: docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T223915Z/admin-docker-release-inputs
Push execution allowed: no
Docker deploy allowed: no
Docker runtime touched: no

## Sources

- UGOS base URL: http://192.168.1.27:9999
- Admin live base URL: http://192.168.1.27:18080

## Observations

- Image tag: latest
- Disk usage: 98
- Admin containers: admin-api:latest, admin-web:latest, admin-worker:latest
- Worker allowlisted env keys: MIXLAB_ADMIN_DOCKER_MVP_MODE, MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER, MIXLAB_ENABLE_READY_PUBLISH_WORKER, MIXLAB_ADMIN_LIBRARY_ROOT, MIXLAB_PREPROCESS_LIBRARY_ROOT

## Gates

| Gate | Status | Blocks Collection | Evidence |
| --- | --- | --- | --- |
| ugos-returned-evidence-no-side-effects | pass | no | Uses UGOS Docker read endpoints and Admin live-readonly GET endpoints only; it does not start/stop containers, push/pull images, exec into containers, edit NAS files, or run preprocess. |
| admin-containers-discovered | pass | no | admin-web, admin-api, admin-worker found |
| admin-worker-detail-readable | pass | no | mixlab-server-admin-worker-1 |
| disk-readonly-status-readable | pass | no | usage_percent=98 |
| docker-deploy-not-approved | pass | no | push_execution_allowed=false, docker_deploy_allowed=false, docker_runtime_touched=false |

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T223915Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T223915Z.md
- Returned evidence directory: docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T223915Z/admin-docker-release-inputs
