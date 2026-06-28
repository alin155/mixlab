# Admin Docker NAS Handoff Transfer

Generated: 2026-06-28T20:44:03.519Z
Mode: admin-docker-nas-handoff-transfer
Result: transferred
Transfer completed: yes
Push execution allowed: no
Docker deploy allowed: no
NAS PublicLibrary writes allowed: no
Docker runtime touched: no

## Paths

- Source archive: dist/acceptance/admin-docker-nas-handoff-kit.tar.gz
- Destination dir: /Volumes/MixLab/安装包/mixlab-admin-docker-handoff
- Destination archive: /Volumes/MixLab/安装包/mixlab-admin-docker-handoff/admin-docker-nas-handoff-kit.tar.gz

## Observations

- Source sha256: 6a3474ca67b3a4d8c09210ff3a7e8441053faead3b5a8577dce345e75058f132
- Destination sha256: 6a3474ca67b3a4d8c09210ff3a7e8441053faead3b5a8577dce345e75058f132
- Source size: 9802
- Destination size: 9802
- Dry run: no

## Gates

| Gate | Status | Blocks Transfer | Evidence |
| --- | --- | --- | --- |
| transfer-is-handoff-only | pass | no | This report copies a prepared handoff archive only; it does not contact Docker, edit compose/.env, start containers, enable workers, preprocess media, publish indexes, or write PublicLibrary. |
| destination-not-public-library | pass | no | destination=/Volumes/MixLab/安装包/mixlab-admin-docker-handoff, public_library=false, recycle=false |
| source-archive-present | pass | no | dist/acceptance/admin-docker-nas-handoff-kit.tar.gz sha256=6a3474ca67b3a4d8c09210ff3a7e8441053faead3b5a8577dce345e75058f132 size=9802 |
| destination-archive-written | pass | no | /Volumes/MixLab/安装包/mixlab-admin-docker-handoff/admin-docker-nas-handoff-kit.tar.gz sha256=6a3474ca67b3a4d8c09210ff3a7e8441053faead3b5a8577dce345e75058f132 size=9802 |
| destination-sha-matches-source | pass | no | source_sha=6a3474ca67b3a4d8c09210ff3a7e8441053faead3b5a8577dce345e75058f132, destination_sha=6a3474ca67b3a4d8c09210ff3a7e8441053faead3b5a8577dce345e75058f132 |
| transfer-does-not-approve-deploy | pass | no | push_execution_allowed=false, docker_deploy_allowed=false, nas_public_library_writes_allowed=false, docker_runtime_touched=false |

## Summary

- Transfer blockers: none

## Next Actions

- NAS share now has /Volumes/MixLab/安装包/mixlab-admin-docker-handoff/admin-docker-nas-handoff-kit.tar.gz.
- From the NAS desktop or NAS shell, extract admin-docker-nas-handoff-kit.tar.gz, run sh ./KIT-SELF-CHECK.sh, then copy its nas/ folder into the Admin Docker Compose project folder.
- Run sh ./nas/RUN_ON_NAS.sh from the Compose project folder, then copy admin-docker-release-inputs/ back to this Mac repo.
- Keep push_images=false, do not edit NAS .env, do not restart containers, and do not enable workers during evidence collection.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-nas-handoff-transfer-20260628T204403Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-nas-handoff-transfer-20260628T204403Z.md
