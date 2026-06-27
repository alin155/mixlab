# Admin Docker Version/API Parity Plan

Generated: 2026-06-26T19:59:50.701Z

Mode: docker-version-api-parity-plan

Result: blocked

Docker image/API update required: yes

Docker deploy allowed now: no

This report reads an archived live-readonly artifact only. It does not deploy Docker, build images, push images, restart containers, enable workers, write NAS files, repair usage-events, recover jobs, publish indexes, or change Cutter protocols.

## Source

- Artifact: docs/acceptance/artifacts/admin-docker-release-live-readonly-20260626T195525Z.json
- Target: http://192.168.1.27:18080
- Expected library root: /data/PublicLibrary

## Observations

- Admin Web reachable: yes
- Admin API proxy reachable: yes
- Current API contract ready: no
- Missing current endpoints: /api/admin/auth/status, /api/admin/release-gates, /api/admin/data-loading/plan
- Library root: /data/PublicLibrary
- Current index: v010471
- Counts: total 11394, ready 10471
- Disk: status blocked, usage 98%
- Build: sha unknown, version unknown, image tag unknown

## Decision

NAS Docker is reachable but does not expose the current Admin Architecture v1 API contract, so an image/API parity update is required later. Deployment remains blocked until release gates and external proofs pass.

## User Assistance Required Later

- Provide or approve NAS Docker image/version parity evidence before any deploy: current image tag, target image tag, and rollback tag.
- Provide external admin-worker environment proof from the NAS host or exported Docker inspect/.env output.
- Run or allow the Windows Cutter compatibility smoke only after a staged Docker release candidate exists.
- Do not provide credentials as a workaround for missing API routes; first point NAS Docker at an image exposing the current Admin API contract.

## Summary

- Passed: 5
- Blocked: 2
- Needs external proof: 2
- Upload blockers: current-admin-api-contract-parity, nas-disk-risk, admin-worker-env-external-proof, cutter-compatibility-external-proof

## Gates

| Gate | Category | Status | Blocks Docker Upload | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- |
parity-plan-no-deploy | safety | pass | no | This report reads an archived live-readonly artifact only; it does not contact NAS Docker, build images, push images, restart containers, or write NAS files. | n/a
live-artifact-targeted | live-evidence | pass | no | Target artifact is explicit: http://192.168.1.27:18080. | Run MIXLAB_ADMIN_DOCKER_LIVE_BASE_URL=<target> npm run validate:admin-docker-release-live-readonly before parity planning.
admin-web-root-observed | live-evidence | pass | no | HTTP 200, ok, 31.9ms | Admin Web root must be reachable before comparing API/image parity.
admin-api-proxy-observed | live-evidence | pass | no | auth=HTTP 404, not_found 路由不存在, 9.7ms; library=HTTP 200, ok, 1135.6ms; supervisor=HTTP 200, ok, 4.7ms | At least one Admin API JSON endpoint must respond through Admin Web before diagnosing image/API parity.
current-admin-api-contract-parity | api-contract | blocked | yes | Missing current endpoints: /api/admin/auth/status, /api/admin/release-gates, /api/admin/data-loading/plan. | Deploy or stage an Admin image exposing /api/admin/auth/status, /api/admin/release-gates, and /api/admin/data-loading/plan, then rerun the GET-only live-readonly probe.
docker-library-root-parity | docker-runtime | pass | no | library_root=/data/PublicLibrary, expected=/data/PublicLibrary | NAS Docker Admin must report /data/PublicLibrary before any release update is allowed.
nas-disk-risk | nas-risk | blocked | yes | disk_status=blocked, usage_percent=98 | Free space or prove write-block behavior with live release gates before enabling preprocessing in Docker.
admin-worker-env-external-proof | docker-runtime | needs-external-proof | yes | The live-readonly Admin API artifact cannot inspect the running admin-worker container environment. | Capture target Docker .env and running admin-worker environment showing standalone workers remain disabled unless explicitly opted in.
cutter-compatibility-external-proof | cutter-compatibility | needs-external-proof | yes | A Docker Admin parity plan cannot prove Windows Cutter still reads the release/index/search protocol. | Run and archive Cutter compatibility smoke after a separately gated Docker release candidate is staged.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-version-parity-plan-20260626T195950Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-version-parity-plan-20260626T195950Z.md
