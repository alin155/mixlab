# Admin Docker Release Gate Dry Run

Generated: 2026-06-26T19:39:19.569Z

Mode: dry-run-static

Result: blocked

Release ready: no

Docker upload allowed: no

This dry-run does not start Docker, workers, or NAS writes. It reads local static deployment files, reuses the NAS Docker compose validator, and records which live gates still need separate evidence.

## Summary

- Passed: 8
- Failed: 0
- Blocked: 0
- Needs live proof: 6
- Upload blockers: usage-events-live-tolerance, v001440-recovery-live, disk-space-live, docker-health-version-live, admin-worker-live-flags, cutter-release-compatibility-live

## Static Compose

- Compose path: `deploy/nas/mixlab/docker-compose.yml`
- Env example path: `deploy/nas/mixlab/.env.example`
- Static validator: passed
- Errors: none

## Gates

| Gate | Title | Category | Status | Blocks Docker Upload | Evidence | Required Live Evidence | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
dry-run-no-side-effects | Dry-run has no Docker or NAS side effects | safety | pass | no | This report reads local static deployment files only; it does not start Docker, workers, or NAS writes. | n/a | none
compose-static-contract | NAS Docker compose static contract | static | pass | no | Static validator passed for deploy/nas/mixlab/docker-compose.yml and deploy/nas/mixlab/.env.example. | n/a | none
path-isolation-static | Path isolation is explicit in compose | static | pass | no | Compose maps PUBLIC_LIBRARY_HOST_PATH into /data/PublicLibrary for runtime services; Mac /Volumes paths are not baked into Docker defaults. | n/a | none
image-tag-static-parity | Admin image tag parity is statically declared | static | pass | no | admin-api, admin-worker, and admin-web use the same MIXLAB_IMAGE_TAG default contract. | n/a | none
healthcheck-static-defined | Admin container healthchecks are declared | static | pass | no | admin-api checks /health on 127.0.0.1:3889 and admin-web checks its internal HTTP root. | n/a | none
worker-flags-default-disabled | Standalone worker flags default disabled | static | pass | no | MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER and MIXLAB_ENABLE_READY_PUBLISH_WORKER default to 0 in compose and .env.example. | n/a | none
api-worker-not-public | admin-api and admin-worker are not host-published | static | pass | no | Static validation confirms only admin-web publishes a host port. | n/a | none
disk-threshold-static | Disk protection threshold is statically configured | static | pass | no | MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT defaults to 92 for admin-api and admin-worker. | n/a | none
usage-events-live-tolerance | usage-events live tolerance and repair proof | live-nas | needs-live-proof | yes | Static files cannot prove the target NAS events file is readable, tolerant of malformed rows, and repairable in the deployed container. | Run a gated live usage-events health/repair check against the target NAS library path and archive the result. | none
v001440-recovery-live | V001440 / stuck processing recovery proof | live-nas | needs-live-proof | yes | Static files cannot prove the target stuck-job recovery path is safe for the current NAS state. | Run the separately gated recovery drill or recovery preflight and prove ready counts, current index, and Cutter-visible release remain unchanged unless explicitly approved. | none
disk-space-live | NAS disk space live protection proof | live-nas | needs-live-proof | yes | The static disk threshold exists, but current NAS free space and write-block behavior must be checked on the target host. | Capture target NAS disk availability and prove admin-api/admin-worker block unsafe preprocessing writes below the configured threshold. | none
docker-health-version-live | Live Docker health and version parity proof | live-docker | needs-live-proof | yes | Static compose can declare images and healthchecks, but cannot prove the deployed containers run the intended tag and are healthy. | After a separately approved deploy rehearsal, record admin-web/admin-api/admin-worker image tags, /health output, and version/build parity. | none
admin-worker-live-flags | Live admin-worker opt-in state proof | live-docker | needs-live-proof | yes | Static defaults are disabled, but the target .env and running container environment still need live verification before upload/enablement. | Capture the target Docker .env and running admin-worker environment showing standalone workers are disabled unless explicitly opted in. | none
cutter-release-compatibility-live | Cutter release/index/search compatibility proof | cutter-compatibility | needs-live-proof | yes | Static Admin Docker checks cannot prove Windows Cutter continues reading the current release/index/search protocol. | Run the Cutter compatibility smoke against the current release/index/search path after any Docker release candidate is staged. | none

## Scope

This report is a release-gate dry-run. It intentionally keeps `release_ready=false` and `docker_upload_allowed=false` until live NAS/Docker/Cutter evidence is produced for usage-events tolerance, V001440 recovery, disk space, health/version parity, admin-worker live flags, and Cutter compatibility.

Static evidence includes the standalone worker flags default disabled contract from R.121. It does not prove the target NAS Docker deployment is safe to upload or enable.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-release-gate-dry-run-20260626T193919Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-release-gate-dry-run-20260626T193919Z.md
