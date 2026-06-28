# Admin Worker Environment Proof

Generated: 2026-06-28T22:20:14.913Z

Mode: admin-worker-env-proof

Result: blocked

Proof accepted: no

Docker upload allowed: no

This report reads exported evidence files only. It does not contact Docker, restart containers, enable workers, write NAS files, repair usage-events, recover jobs, publish indexes, or change Cutter protocols.

## Sources

- Env file: docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T221951Z/admin-docker-release-inputs/admin-worker.env
- Inspect JSON: docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T221951Z/admin-docker-release-inputs/admin-worker.inspect.json

## Observations

- Env file present: yes
- Inspect JSON present: yes
- Env file flags: mvp=missing, preprocess=1, publish=1
- Running flags: mvp=missing, preprocess=1, publish=1
- Library roots: admin=/data/PublicLibrary, preprocess=missing
- Image: ghcr.io/alin155/mixlab-admin-runtime:latest
- Container: mixlab-server-admin-worker-1

## Collection Instructions

- Prefer the sanitized collector on the NAS host: copy scripts/acceptance/admin-docker-nas-release-inputs-collector.sh into the Compose project folder, then run sh admin-docker-nas-release-inputs-collector.sh <output-dir>.
- Manual fallback on the NAS host: docker compose --env-file .env -f docker-compose.yml exec -T admin-worker sh -lc 'printf "%s\n" "MIXLAB_ADMIN_DOCKER_MVP_MODE=${MIXLAB_ADMIN_DOCKER_MVP_MODE:-}" "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=${MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER:-}" "MIXLAB_ENABLE_READY_PUBLISH_WORKER=${MIXLAB_ENABLE_READY_PUBLISH_WORKER:-}"' > admin-worker.env
- On the NAS host, export sanitized admin-worker inspect metadata containing only image, name, required worker flags, and library roots; do not store full Config.Env with secrets.
- Copy those files into a local evidence folder and run: MIXLAB_ADMIN_WORKER_ENV_FILE=<path>/admin-worker.env MIXLAB_ADMIN_WORKER_INSPECT_JSON=<path>/admin-worker.inspect.json npm run validate:admin-worker-env-proof
- Do not paste secrets into chat. Evidence files and reports must record only required flags, library roots, image, and container name.

## Summary

- Passed: 4
- Blocked: 3
- Upload blockers: env-file-worker-flags-disabled, inspect-worker-flags-disabled, admin-worker-library-roots

## Gates

| Gate | Category | Status | Blocks Docker Upload | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- |
worker-env-proof-no-side-effects | safety | pass | no | This report reads sanitized evidence files only; it does not contact Docker, restart containers, enable workers, or write NAS files. | n/a
env-file-provided | evidence | pass | no | Read docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T221951Z/admin-docker-release-inputs/admin-worker.env. | Provide a sanitized admin-worker.env file from the NAS host containing only the required MVP worker flags.
inspect-json-provided | evidence | pass | no | Read docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T221951Z/admin-docker-release-inputs/admin-worker.inspect.json. | Provide sanitized docker inspect JSON for the running admin-worker container without full Config.Env secrets.
env-file-worker-flags-disabled | worker-flags | blocked | yes | env file: MIXLAB_ADMIN_DOCKER_MVP_MODE=missing, MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=1, MIXLAB_ENABLE_READY_PUBLISH_WORKER=1 | Admin worker must run in Docker MVP v0.1 mode and both standalone admin-worker flags must be 0 before Docker release gates allow upload or staging.
inspect-worker-flags-disabled | worker-flags | blocked | yes | docker inspect: MIXLAB_ADMIN_DOCKER_MVP_MODE=missing, MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=1, MIXLAB_ENABLE_READY_PUBLISH_WORKER=1 | Admin worker must run in Docker MVP v0.1 mode and both standalone admin-worker flags must be 0 before Docker release gates allow upload or staging.
admin-worker-library-roots | runtime-paths | blocked | yes | MIXLAB_ADMIN_LIBRARY_ROOT=/data/PublicLibrary, MIXLAB_PREPROCESS_LIBRARY_ROOT=missing, expected=/data/PublicLibrary | Running admin-worker must use /data/PublicLibrary for both Admin and preprocess library roots.
admin-worker-image-observed | image | pass | no | image=ghcr.io/alin155/mixlab-admin-runtime:latest, container=mixlab-server-admin-worker-1 | docker inspect evidence must include the running admin-worker image.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-worker-env-proof-20260628T222014Z.json
- Markdown: docs/acceptance/artifacts/admin-worker-env-proof-20260628T222014Z.md
