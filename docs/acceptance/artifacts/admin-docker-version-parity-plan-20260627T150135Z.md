# Admin Docker Version/API Parity Plan

Generated: 2026-06-27T15:01:35.471Z

Mode: docker-version-api-parity-plan

Result: blocked

Docker image/API update required: yes

Docker deploy allowed now: no

This report reads an archived live-readonly artifact only. It does not deploy Docker, build images, push images, restart containers, enable workers, write NAS files, repair usage-events, recover jobs, publish indexes, or change Cutter protocols.

## Source

- Artifact: docs/acceptance/artifacts/admin-docker-release-live-readonly-20260627T150126Z.json
- Target: not configured
- Expected library root: /data/PublicLibrary

## Observations

- Admin Web reachable: no
- Admin API proxy reachable: no
- Current API contract ready: no
- Missing current endpoints: /api/admin/auth/status, /api/admin/release-gates, /api/admin/data-loading/plan
- Version/health parity contract: missing (unknown)
- Library root: unknown
- Current index: unknown
- Counts: total unknown, ready unknown
- Disk: status unknown, usage unknown%
- Build: sha unknown, version unknown, image tag unknown

## Decision

NAS Docker is reachable but does not expose the current Admin Architecture v1 API contract, so an image/API parity update is required later. Deployment remains blocked until release gates and external proofs pass.

## User Assistance Required Later

- Provide or approve NAS Docker image/version parity evidence before any deploy: current image tag, target image tag, and rollback tag.
- Provide external admin-worker environment proof from the NAS host or exported Docker inspect/.env output.
- Run or allow the Windows Cutter compatibility smoke only after a staged Docker release candidate exists.
- Do not provide credentials as a workaround for missing API routes; first point NAS Docker at an image exposing the current Admin API contract.

## Summary

- Passed: 2
- Blocked: 6
- Needs external proof: 2
- Upload blockers: live-artifact-targeted, admin-web-root-observed, admin-api-proxy-observed, current-admin-api-contract-parity, version-health-parity-contract, docker-library-root-parity, admin-worker-env-external-proof, cutter-compatibility-external-proof

## Gates

| Gate | Category | Status | Blocks Docker Upload | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- |
parity-plan-no-deploy | safety | pass | no | This report reads an archived live-readonly artifact only; it does not contact NAS Docker, build images, push images, restart containers, or write NAS files. | n/a
live-artifact-targeted | live-evidence | blocked | yes | The source live-readonly artifact did not use an explicit NAS Docker target. | Run MIXLAB_ADMIN_DOCKER_LIVE_BASE_URL=<target> npm run validate:admin-docker-release-live-readonly before parity planning.
admin-web-root-observed | live-evidence | blocked | yes | request not present | Admin Web root must be reachable before comparing API/image parity.
admin-api-proxy-observed | live-evidence | blocked | yes | auth=request not present; library=request not present; supervisor=request not present | At least one Admin API JSON endpoint must respond through Admin Web before diagnosing image/API parity.
current-admin-api-contract-parity | api-contract | blocked | yes | Missing current endpoints: /api/admin/auth/status, /api/admin/release-gates, /api/admin/data-loading/plan. | Deploy or stage an Admin image exposing /api/admin/auth/status, /api/admin/release-gates, and /api/admin/data-loading/plan, then rerun the GET-only live-readonly probe.
version-health-parity-contract | api-contract | blocked | yes | The archived live-readonly artifact does not include a complete version_health_parity contract. | Deploy or stage an Admin image exposing version_health_parity from /api/admin/release-gates, then rerun the GET-only live-readonly probe.
docker-library-root-parity | docker-runtime | blocked | yes | library_root=unknown, expected=/data/PublicLibrary | NAS Docker Admin must report /data/PublicLibrary before any release update is allowed.
nas-disk-risk | nas-risk | pass | no | disk_status=unknown | Free space or prove write-block behavior with live release gates before enabling preprocessing in Docker.
admin-worker-env-external-proof | docker-runtime | needs-external-proof | yes | The live-readonly Admin API artifact cannot inspect the running admin-worker container environment. | Capture target Docker .env and running admin-worker environment showing standalone workers remain disabled unless explicitly opted in.
cutter-compatibility-external-proof | cutter-compatibility | needs-external-proof | yes | A Docker Admin parity plan cannot prove Windows Cutter still reads the release/index/search protocol. | Run and archive Cutter compatibility smoke after a separately gated Docker release candidate is staged.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-version-parity-plan-20260627T150135Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-version-parity-plan-20260627T150135Z.md
