# Admin Docker Version/API Parity Plan

Generated: 2026-06-29T01:13:12.668Z

Mode: docker-version-api-parity-plan

Result: blocked

Docker image/API update required: yes

Docker deploy allowed now: no

This report reads an archived live-readonly artifact only. It does not deploy Docker, build images, push images, restart containers, enable workers, write NAS files, repair usage-events, recover jobs, publish indexes, or change Cutter protocols.

## Source

- Artifact: docs/acceptance/artifacts/admin-docker-release-live-readonly-20260629T011306Z.json
- Target: http://192.168.1.27:18080
- Normalized target: http://192.168.1.27:18080
- Target kind: admin-web-url
- Target safe to probe: yes
- Expected library root: /data/PublicLibrary

## Observations

- Admin Web reachable: yes
- Admin API proxy reachable: yes
- Live target: admin-web-url, safe=yes
- Current API contract ready: no
- Missing current endpoints: /api/admin/auth/status, /api/admin/release-gates, /api/admin/data-loading/plan
- Version/health parity contract: missing (unknown)
- admin-worker env proof contract: missing (unknown)
- Cutter compatibility proof contract: missing (unknown)
- Library root: /data/PublicLibrary
- Current index: v010471
- Counts: total 11394, ready 10471
- Disk: status unknown, usage unknown%
- Build: sha unknown, version unknown, image tag unknown

## Decision

The targeted live-readonly artifact does not expose the full current Admin Architecture v1 API, version_health_parity contract, admin_worker_env_proof contract, and cutter_compatibility_proof contract, so an image/API parity update is required later. Deployment remains blocked until release gates and external proofs pass.

## User Assistance Required Later

- Provide or approve NAS Docker image/version parity evidence before any deploy: current image tag, target image tag, and rollback tag.
- Provide external admin-worker environment proof from the NAS host or exported Docker inspect/.env output.
- Run or allow the Windows Cutter compatibility smoke only after a staged Docker release candidate exists.
- Do not provide credentials as a workaround for missing API routes; first point NAS Docker at an image exposing the current Admin API contract.

## Summary

- Passed: 6
- Blocked: 4
- Needs external proof: 2
- Upload blockers: current-admin-api-contract-parity, version-health-parity-contract, admin-worker-env-proof-contract, cutter-compatibility-proof-contract, admin-worker-env-external-proof, cutter-compatibility-external-proof

## Gates

| Gate | Category | Status | Blocks Docker Upload | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- |
parity-plan-no-deploy | safety | pass | no | This report reads an archived live-readonly artifact only; it does not contact NAS Docker, build images, push images, restart containers, or write NAS files. | n/a
live-artifact-targeted | live-evidence | pass | no | Target artifact is explicit and probe-safe: http://192.168.1.27:18080 (admin-web-url). | Run MIXLAB_ADMIN_DOCKER_LIVE_BASE_URL=<target> npm run validate:admin-docker-release-live-readonly before parity planning.
admin-web-root-observed | live-evidence | pass | no | HTTP 200, ok, 54.9ms | Admin Web root must be reachable before comparing API/image parity.
admin-api-proxy-observed | live-evidence | pass | no | auth=HTTP 404, not_found 路由不存在, 13.1ms; library=HTTP 200, ok, 964ms; supervisor=HTTP 200, ok, 12.1ms | At least one Admin API JSON endpoint must respond through Admin Web before diagnosing image/API parity.
current-admin-api-contract-parity | api-contract | blocked | yes | Missing current endpoints: /api/admin/auth/status, /api/admin/release-gates, /api/admin/data-loading/plan. | Deploy or stage an Admin image exposing /api/admin/auth/status, /api/admin/release-gates, and /api/admin/data-loading/plan, then rerun the GET-only live-readonly probe.
version-health-parity-contract | api-contract | blocked | yes | The archived live-readonly artifact does not include a complete version_health_parity contract. | Deploy or stage an Admin image exposing version_health_parity from /api/admin/release-gates, then rerun the GET-only live-readonly probe.
admin-worker-env-proof-contract | docker-runtime | blocked | yes | The archived live-readonly artifact does not include a complete admin_worker_env_proof contract. | Deploy or stage an Admin image exposing admin_worker_env_proof from /api/admin/release-gates, then rerun the GET-only live-readonly probe.
cutter-compatibility-proof-contract | cutter-compatibility | blocked | yes | The archived live-readonly artifact does not include a complete cutter_compatibility_proof contract. | Deploy or stage an Admin image exposing cutter_compatibility_proof from /api/admin/release-gates, then rerun the GET-only live-readonly probe.
docker-library-root-parity | docker-runtime | pass | no | library_root=/data/PublicLibrary, expected=/data/PublicLibrary | NAS Docker Admin must report /data/PublicLibrary before any release update is allowed.
nas-disk-risk | nas-risk | pass | no | disk_status=unknown | Free space or prove write-block behavior with live release gates before enabling preprocessing in Docker.
admin-worker-env-external-proof | docker-runtime | needs-external-proof | yes | The live-readonly Admin API artifact cannot inspect the running admin-worker container environment. | Capture target Docker .env and running admin-worker environment showing standalone workers remain disabled unless explicitly opted in.
cutter-compatibility-external-proof | cutter-compatibility | needs-external-proof | yes | A Docker Admin parity plan cannot prove Windows Cutter still reads the release/index/search protocol. | Run and archive Cutter compatibility smoke after a separately gated Docker release candidate is staged.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-version-parity-plan-20260629T011312Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-version-parity-plan-20260629T011312Z.md

