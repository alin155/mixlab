# Admin Docker Local Smoke

Generated: 2026-06-29T03:18:51.796Z

Result: accepted

Local smoke passed: yes

Docker upload allowed: no

NAS live evidence: no

Local Docker MVP smoke passed. This validates the local candidate shape only; Docker upload remains blocked until NAS/staging release gates pass.

## Boundary

- This is a local Docker candidate smoke only.
- It uses an isolated local library under `.local-dev/admin-docker-local-smoke`.
- It does not contact NAS Docker, restart live containers, write NAS files, publish indexes, or change Cutter protocols.

## Observations

- Run requested: yes
- Web URL: http://127.0.0.1:18081/
- Work dir: .local-dev/admin-docker-local-smoke/20260629T031851Z
- Compose file: .local-dev/admin-docker-local-smoke/20260629T031851Z/docker-compose.yml
- Public library host path: .local-dev/admin-docker-local-smoke/20260629T031851Z/PublicLibrary
- Docker CLI available: yes
- Docker Compose available: yes
- Static contract ok: yes

## Build Identity

- Image tag: 73ab7b355051d7325174111f955cd8356d42787d
- Build SHA: 73ab7b355051d7325174111f955cd8356d42787d
- Build version: 73ab7b355051d7325174111f955cd8356d42787d
- MVP mode: v0.1

## Static Contract

| Check | Status | Evidence |
| --- | --- | --- |
nas-compose-static-contract | pass | NAS compose static contract passes, including MVP mode, disabled standalone workers, /data/PublicLibrary roots, and admin-web-only port publication.
runtime-dockerfile-mvp-arg | pass | admin-runtime Dockerfile defaults MIXLAB_ADMIN_DOCKER_MVP_MODE to v0.1.
runtime-dockerfile-mvp-env | pass | admin-runtime image persists MIXLAB_ADMIN_DOCKER_MVP_MODE into the runtime environment.
web-dockerfile-mvp-arg | pass | admin-web Dockerfile defaults MIXLAB_ADMIN_DOCKER_MVP_MODE to v0.1.
web-dockerfile-mvp-vite-env | pass | admin-web build receives VITE_MIXLAB_ADMIN_DOCKER_MVP_MODE from the Docker MVP mode arg.

## Probes

| Probe | Status | HTTP | Duration | Evidence |
| --- | --- | --- | --- | --- |
admin_web_root | pass | 200 | 7.4ms | ok
auth_status | pass | 200 | 7.3ms | ok
library_status | pass | 200 | 5ms | ok
release_gates | pass | 200 | 25.6ms | ok
data_loading_plan | pass | 200 | 4.5ms | ok

## Worker Env

- Env collected: yes
- Flags: mvp=v0.1, preprocess=0, publish=0
- Roots: admin=/data/PublicLibrary, preprocess=/data/PublicLibrary

## Summary

- Passed: 11
- Blocked: 1
- Failed: 0
- Skipped: 0
- Local smoke blockers: none
- Docker upload blockers: local-smoke-not-nas-live-evidence

## Gates

| Gate | Category | Status | Blocks Local Smoke | Blocks Docker Upload | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
local-smoke-no-nas-side-effects | safety | pass | no | no | The script builds local images and mounts .local-dev/admin-docker-local-smoke/*/PublicLibrary when run; it never contacts NAS Docker, restarts live containers, writes NAS files, publishes indexes, or changes Cutter protocols. | n/a
static-contract-ready | static-contract | pass | no | no | Dockerfiles and NAS compose defaults preserve MVP mode, disabled standalone workers, /data/PublicLibrary roots, and admin-web-only publication. | n/a
explicit-run-requested | operator-intent | pass | no | no | MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN=1 is set. | Set MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN=1 on a Docker-capable machine to run the full local smoke.
docker-cli-available | docker-runtime | pass | no | no | Docker version 28.0.4, build b8034c0 | Install/start Docker Desktop, Colima, or a compatible Docker context before running this smoke.
docker-compose-available | docker-runtime | pass | no | no | Docker Compose version v2.38.2 | A working docker compose command is required for the local candidate smoke.
admin-runtime-image-built | docker-build | pass | no | no | docker build -f docker/admin-runtime.Dockerfile -t mixlab-admin-runtime:local-mvp-smoke --build-arg MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1 --build-arg MIXLAB_BUILD_SHA=73ab7b355051d7325174111f955cd8356d42787d --build-arg MIXLAB_BUILD_VERSION=73ab7b355051d7325174111f955cd8356d42787d --build-arg MIXLAB_IMAGE_TAG=73ab7b355051d7325174111f955cd8356d42787d . -> ok | n/a
admin-web-image-built | docker-build | pass | no | no | docker build -f docker/admin-web.Dockerfile -t mixlab-admin-web:local-mvp-smoke --build-arg MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1 --build-arg MIXLAB_BUILD_SHA=73ab7b355051d7325174111f955cd8356d42787d --build-arg MIXLAB_BUILD_VERSION=73ab7b355051d7325174111f955cd8356d42787d --build-arg MIXLAB_IMAGE_TAG=73ab7b355051d7325174111f955cd8356d42787d . -> ok | n/a
local-compose-up | compose | pass | no | no | docker compose -f .local-dev/admin-docker-local-smoke/20260629T031851Z/docker-compose.yml up -d -> ok | n/a
local-endpoint-probes | probe | pass | no | no | admin_web_root=HTTP 200 ok 7.4ms; auth_status=HTTP 200 ok 7.3ms; library_status=HTTP 200 ok 5ms; release_gates=HTTP 200 ok 25.6ms; data_loading_plan=HTTP 200 ok 4.5ms | n/a
release-gates-mvp-contract | probe | pass | no | no | release-gates admin_worker_env_proof requires MVP mode v0.1, disabled standalone workers, and /data/PublicLibrary roots. | n/a
admin-worker-env-local-proof | worker-env | pass | no | no | mvp=v0.1, preprocess=0, publish=0, adminRoot=/data/PublicLibrary, preprocessRoot=/data/PublicLibrary | n/a
local-smoke-not-nas-live-evidence | release-boundary | blocked | no | yes | Passing this local smoke validates a Docker candidate shape only. Docker upload/deploy still requires NAS staging/live-readonly, worker-env proof from the NAS host, Cutter compatibility reports, disk gate, and rollback gate. | Run the staged/NAS release gates after local Docker smoke passes.

## Run Instructions

- MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN=1 MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_WEB_PORT=18081 npm run validate:admin-docker-local-smoke
- The smoke builds local-only images, starts an isolated local compose stack, probes admin-web and /api/admin/* through nginx, collects admin-worker env, then runs docker compose down.
- Do not use this as NAS live evidence. NAS release still needs live-readonly, worker-env proof, Cutter compatibility proof, disk gate, and rollback/staging approval.

## Artifacts

- JSON: .local-dev/admin-docker-release-gates/admin-docker-local-smoke-20260629T031851Z.json
- Markdown: .local-dev/admin-docker-release-gates/admin-docker-local-smoke-20260629T031851Z.md
