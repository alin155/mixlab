# Admin Docker Local Smoke

Generated: 2026-06-27T19:14:24.969Z

Result: blocked

Local smoke passed: no

Docker upload allowed: no

NAS live evidence: no

Local Docker MVP smoke was not executed because MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN=1 was not set. Static checks still ran.

## Boundary

- This is a local Docker candidate smoke only.
- It uses an isolated local library under `.local-dev/admin-docker-local-smoke`.
- It does not contact NAS Docker, restart live containers, write NAS files, publish indexes, or change Cutter protocols.

## Observations

- Run requested: no
- Web URL: http://127.0.0.1:18081/
- Work dir: .local-dev/admin-docker-local-smoke/20260627T191424Z
- Compose file: .local-dev/admin-docker-local-smoke/20260627T191424Z/docker-compose.yml
- Public library host path: .local-dev/admin-docker-local-smoke/20260627T191424Z/PublicLibrary
- Docker CLI available: no
- Docker Compose available: no
- Static contract ok: yes

## Static Contract

| Check | Status | Evidence |
| --- | --- | --- |
nas-compose-static-contract | pass | NAS compose static contract passes, including MVP mode, disabled standalone workers, /data/PublicLibrary roots, and admin-web-only port publication.
runtime-dockerfile-mvp-arg | pass | admin-runtime Dockerfile defaults MIXLAB_ADMIN_DOCKER_MVP_MODE to v0.1.
runtime-dockerfile-mvp-env | pass | admin-runtime image persists MIXLAB_ADMIN_DOCKER_MVP_MODE into the runtime environment.
web-dockerfile-mvp-arg | pass | admin-web Dockerfile defaults MIXLAB_ADMIN_DOCKER_MVP_MODE to v0.1.
web-dockerfile-mvp-vite-env | pass | admin-web build receives VITE_MIXLAB_ADMIN_DOCKER_MVP_MODE from the Docker MVP mode arg.

## Probes

No endpoint probes were run.

## Worker Env

- Env collected: no
- Flags: mvp=missing, preprocess=missing, publish=missing
- Roots: admin=missing, preprocess=missing

## Summary

- Passed: 2
- Blocked: 4
- Failed: 0
- Skipped: 6
- Local smoke blockers: explicit-run-requested, docker-cli-available, docker-compose-available
- Docker upload blockers: explicit-run-requested, docker-cli-available, docker-compose-available, local-smoke-not-nas-live-evidence

## Gates

| Gate | Category | Status | Blocks Local Smoke | Blocks Docker Upload | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
local-smoke-no-nas-side-effects | safety | pass | no | no | The script builds local images and mounts .local-dev/admin-docker-local-smoke/*/PublicLibrary when run; it never contacts NAS Docker, restarts live containers, writes NAS files, publishes indexes, or changes Cutter protocols. | n/a
static-contract-ready | static-contract | pass | no | no | Dockerfiles and NAS compose defaults preserve MVP mode, disabled standalone workers, /data/PublicLibrary roots, and admin-web-only publication. | n/a
explicit-run-requested | operator-intent | blocked | yes | yes | MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN is not 1, so the script did not build images or start containers. | Set MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN=1 on a Docker-capable machine to run the full local smoke.
docker-cli-available | docker-runtime | blocked | yes | yes | spawn docker ENOENT | Install/start Docker Desktop, Colima, or a compatible Docker context before running this smoke.
docker-compose-available | docker-runtime | blocked | yes | yes | docker CLI is not available | A working docker compose command is required for the local candidate smoke.
admin-runtime-image-built | docker-build | skipped | no | no | Image build was not attempted. | n/a
admin-web-image-built | docker-build | skipped | no | no | Image build was not attempted. | n/a
local-compose-up | compose | skipped | no | no | Compose up was not attempted. | n/a
local-endpoint-probes | probe | skipped | no | no | Endpoint probes were not attempted. | n/a
release-gates-mvp-contract | probe | skipped | no | no | Release-gates contract was not evaluated because endpoint probes did not pass. | n/a
admin-worker-env-local-proof | worker-env | skipped | no | no | admin-worker env was not collected. | n/a
local-smoke-not-nas-live-evidence | release-boundary | blocked | no | yes | Passing this local smoke validates a Docker candidate shape only. Docker upload/deploy still requires NAS staging/live-readonly, worker-env proof from the NAS host, Cutter compatibility reports, disk gate, and rollback gate. | Run the staged/NAS release gates after local Docker smoke passes.

## Run Instructions

- MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN=1 MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_WEB_PORT=18081 npm run validate:admin-docker-local-smoke
- The smoke builds local-only images, starts an isolated local compose stack, probes admin-web and /api/admin/* through nginx, collects admin-worker env, then runs docker compose down.
- Do not use this as NAS live evidence. NAS release still needs live-readonly, worker-env proof, Cutter compatibility proof, disk gate, and rollback/staging approval.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-local-smoke-20260627T191424Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-local-smoke-20260627T191424Z.md
