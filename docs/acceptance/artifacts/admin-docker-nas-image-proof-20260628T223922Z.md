# Admin Docker NAS Image Proof

Generated: 2026-06-28T22:39:22.599Z
Mode: admin-docker-nas-image-proof
Result: blocked
Proof accepted: no
Docker deploy allowed: no

## Release Inputs

- current_image_tag: <blocked>
- rollback_image_tag: <blocked>
- workflow inputs: <blocked>

## Observations

- Env file: docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T223915Z/admin-docker-release-inputs/admin-docker-current.env
- Inspect JSON: docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T223915Z/admin-docker-release-inputs/admin-docker-current.inspect.json
- Env MIXLAB_IMAGE_TAG: latest
- Stable rollback tag: no
- Missing services: none
- Inconsistent tags: none

| Service | Container | Image | Repository | Tag |
| --- | --- | --- | --- | --- |
| admin-api | mixlab-server-admin-api-1 | ghcr.io/alin155/mixlab-admin-runtime:latest | ghcr.io/alin155/mixlab-admin-runtime | latest |
| admin-web | mixlab-server-admin-web-1 | ghcr.io/alin155/mixlab-admin-web:latest | ghcr.io/alin155/mixlab-admin-web | latest |
| admin-worker | mixlab-server-admin-worker-1 | ghcr.io/alin155/mixlab-admin-runtime:latest | ghcr.io/alin155/mixlab-admin-runtime | latest |

## Gates

| Gate | Category | Status | Blocks release inputs | Evidence |
| --- | --- | --- | --- | --- |
| nas-image-proof-no-side-effects | safety | pass | no | This report reads a sanitized MIXLAB_IMAGE_TAG evidence file and docker inspect JSON only; it does not contact NAS, Docker, GHCR, GitHub, Admin API, or Cutter API. |
| nas-env-file-provided | evidence | pass | no | docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T223915Z/admin-docker-release-inputs/admin-docker-current.env |
| nas-inspect-json-provided | evidence | pass | no | docs/acceptance/artifacts/admin-docker-nas-ugos-returned-evidence-20260628T223915Z/admin-docker-release-inputs/admin-docker-current.inspect.json |
| current-tag-stable-for-rollback | rollback | blocked | yes | MIXLAB_IMAGE_TAG=latest |
| all-admin-services-present | image | pass | no | admin-web, admin-api, and admin-worker were found. |
| admin-image-repositories-match | image | pass | no | admin-api=ghcr.io/alin155/mixlab-admin-runtime, admin-web=ghcr.io/alin155/mixlab-admin-web, admin-worker=ghcr.io/alin155/mixlab-admin-runtime |
| admin-image-tags-consistent | rollback | pass | no | env=latest, service_tags=latest |

## Collection Instructions

- Prefer the sanitized collector on the NAS host: copy scripts/acceptance/admin-docker-nas-release-inputs-collector.sh into the Compose project folder, then run sh admin-docker-nas-release-inputs-collector.sh <output-dir>.
- On the NAS host, export only the current Compose image tag without secrets: grep '^MIXLAB_IMAGE_TAG=' .env > admin-docker-current.env
- On the NAS host, export sanitized running Admin container image metadata containing only service name, container name, and image tag; do not store full docker inspect Config.Env secrets.
- Copy those files into a local evidence folder and run: MIXLAB_ADMIN_DOCKER_NAS_ENV_FILE=<path>/admin-docker-current.env MIXLAB_ADMIN_DOCKER_NAS_INSPECT_JSON=<path>/admin-docker-current.inspect.json npm run validate:admin-docker-nas-image-proof
- Do not use MIXLAB_IMAGE_TAG=latest as rollback evidence; latest is mutable and cannot prove a stable rollback point.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-nas-image-proof-20260628T223922Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-nas-image-proof-20260628T223922Z.md
