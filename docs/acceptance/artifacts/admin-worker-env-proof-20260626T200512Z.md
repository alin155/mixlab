# Admin Worker Environment Proof

Generated: 2026-06-26T20:05:12.481Z

Mode: admin-worker-env-proof

Result: blocked

Proof accepted: no

Docker upload allowed: no

This report reads exported evidence files only. It does not contact Docker, restart containers, enable workers, write NAS files, repair usage-events, recover jobs, publish indexes, or change Cutter protocols.

## Sources

- Env file: not provided
- Inspect JSON: not provided

## Observations

- Env file present: no
- Inspect JSON present: no
- Env file flags: preprocess=missing, publish=missing
- Running flags: preprocess=missing, publish=missing
- Library roots: admin=missing, preprocess=missing
- Image: unknown
- Container: unknown

## Collection Instructions

- On the NAS host, export the running admin-worker environment without secrets when possible: docker compose --env-file .env -f docker-compose.yml exec admin-worker env | sort > admin-worker.env
- On the NAS host, export container metadata: docker inspect $(docker compose --env-file .env -f docker-compose.yml ps -q admin-worker) > admin-worker.inspect.json
- Copy those files into a local evidence folder and run: MIXLAB_ADMIN_WORKER_ENV_FILE=<path>/admin-worker.env MIXLAB_ADMIN_WORKER_INSPECT_JSON=<path>/admin-worker.inspect.json npm run validate:admin-worker-env-proof
- Do not paste secrets into chat. The report records only required flags, library roots, image, and container name.

## Summary

- Passed: 1
- Blocked: 6
- Upload blockers: env-file-provided, inspect-json-provided, env-file-worker-flags-disabled, inspect-worker-flags-disabled, admin-worker-library-roots, admin-worker-image-observed

## Gates

| Gate | Category | Status | Blocks Docker Upload | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- |
worker-env-proof-no-side-effects | safety | pass | no | This report reads exported evidence files only; it does not contact Docker, restart containers, enable workers, or write NAS files. | n/a
env-file-provided | evidence | blocked | yes | No MIXLAB_ADMIN_WORKER_ENV_FILE was provided. | Provide an exported admin-worker.env file from the NAS host.
inspect-json-provided | evidence | blocked | yes | No MIXLAB_ADMIN_WORKER_INSPECT_JSON was provided. | Provide docker inspect JSON for the running admin-worker container.
env-file-worker-flags-disabled | worker-flags | blocked | yes | env file: MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=missing, MIXLAB_ENABLE_READY_PUBLISH_WORKER=missing | Both standalone admin-worker flags must be 0 before Docker release gates allow upload or staging.
inspect-worker-flags-disabled | worker-flags | blocked | yes | docker inspect: MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=missing, MIXLAB_ENABLE_READY_PUBLISH_WORKER=missing | Both standalone admin-worker flags must be 0 before Docker release gates allow upload or staging.
admin-worker-library-roots | runtime-paths | blocked | yes | MIXLAB_ADMIN_LIBRARY_ROOT=missing, MIXLAB_PREPROCESS_LIBRARY_ROOT=missing, expected=/data/PublicLibrary | Running admin-worker must use /data/PublicLibrary for both Admin and preprocess library roots.
admin-worker-image-observed | image | blocked | yes | No running image was observed in docker inspect evidence. | docker inspect evidence must include the running admin-worker image.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-worker-env-proof-20260626T200512Z.json
- Markdown: docs/acceptance/artifacts/admin-worker-env-proof-20260626T200512Z.md
