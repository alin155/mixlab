# Admin Docker Release Gate Dry Run

Generated: 2026-06-27T15:26:07.378Z

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
usage-events-live-tolerance | usage-events live tolerance and repair proof | live-nas | needs-live-proof | yes | Static files cannot prove the target NAS events file is readable, tolerant of malformed rows, and repairable through the reviewed usage-events repair workflow. | Run `npx tsx scripts/acceptance/usage-events-repair.ts --library-root <target>` as dry-run, archive the JSON/Markdown report, and only run `--apply` after separate reviewed maintenance approval. | none
v001440-recovery-live | V001440 / stuck processing recovery proof | live-nas | needs-live-proof | yes | Static files cannot prove the target stuck-job recovery path is safe for the current NAS state or that the deployed Admin API exposes the processing_recovery preflight contract. | Run GET /api/admin/release-gates and verify processing_recovery, then archive GET /api/admin/preprocess/safety plus processing source-videos/jobs evidence before any separately reviewed recovery command. | none
disk-space-live | NAS disk space live protection proof | live-nas | needs-live-proof | yes | The static disk threshold exists, but current NAS free space, write-block behavior, and the deployed disk_space_protection contract must be checked on the target host. | Run GET /api/admin/release-gates and verify disk_space_protection, then archive GET /api/admin/preprocess/safety plus GET /api/admin/library/status evidence proving the configured threshold, no worker start, and no ready/Cutter mutation scope. | none
docker-health-version-live | Live Docker health and version parity proof | live-docker | needs-live-proof | yes | Static compose can declare images and healthchecks, but cannot prove the deployed containers run the intended tag, expose version_health_parity, and are healthy. | Run GET /api/admin/release-gates and verify version_health_parity, then archive admin-web root, admin-api /health, release-gates build metadata, admin-web/admin-api/admin-worker image tags, health state, and rollback tag before any separately approved deploy rehearsal. | none
admin-worker-live-flags | Live admin-worker opt-in state proof | live-docker | needs-live-proof | yes | Static defaults are disabled, but the target API must expose admin_worker_env_proof and the running container environment still needs live env/inspect verification before upload/enablement. | Run GET /api/admin/release-gates and verify admin_worker_env_proof, then run `npx tsx scripts/acceptance/admin-worker-env-proof.ts` with NAS-exported admin-worker.env plus admin-worker.inspect.json showing standalone workers are disabled and /data/PublicLibrary roots are used. | none
cutter-release-compatibility-live | Cutter release/index/search compatibility proof | cutter-compatibility | needs-live-proof | yes | Static Admin Docker checks cannot prove the target API exposes cutter_compatibility_proof or that Windows Cutter continues reading the current release/index/search protocol. | Run GET /api/admin/release-gates and verify cutter_compatibility_proof, then run `npx tsx scripts/acceptance/admin-cutter-compatibility-proof.ts` with staged-candidate windows_acceptance and real_cut_smoke reports. | none

## Scope

This report is a release-gate dry-run. It intentionally keeps `release_ready=false` and `docker_upload_allowed=false` until live NAS/Docker/Cutter evidence is produced for usage-events tolerance, V001440 recovery, disk space, health/version parity, admin-worker live flags, and Cutter compatibility.

Static evidence includes the standalone worker flags default disabled contract from R.121. It does not prove the target NAS Docker deployment is safe to upload or enable.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-release-gate-dry-run-20260627T152607Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-release-gate-dry-run-20260627T152607Z.md
