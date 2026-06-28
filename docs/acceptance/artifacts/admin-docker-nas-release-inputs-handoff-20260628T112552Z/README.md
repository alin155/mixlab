# Admin Docker NAS Release Inputs Handoff

Generated: 2026-06-28T11:25:52.349Z
Mode: admin-docker-nas-release-inputs-handoff
Result: ready-for-nas-collection
Handoff package ready: yes
Push execution allowed: no
Docker deploy allowed: no

## Sources

- Pre-staging handoff: docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260628T102339Z.json
- Candidate ref proof: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T101658Z.json
- Release inputs: docs/acceptance/artifacts/admin-docker-release-inputs-20260628T102350Z.json
- Collector source: /Users/huaqihang/Documents/mixlab/scripts/acceptance/admin-docker-nas-release-inputs-collector.sh

## Candidate

- candidate_sha: b062bc387c1fdb2a391320c1c36233b782cb000a
- candidate_release_ref: admin-docker-candidate-b062bc387c1fdb2a391320c1c36233b782cb000a
- candidate_ref_proof_accepted: true

## NAS Side

- Bundle dir: docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T112552Z
- Run from the NAS Compose project folder: sh ./nas/RUN_ON_NAS.sh
- Copy back: Copy the generated admin-docker-release-inputs/ folder back to the Mac repo without adding full .env, secrets, or full docker inspect output.

### Quickstart Scripts

- NAS runner: docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T112552Z/nas/RUN_ON_NAS.sh
- Local installer: docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T112552Z/local/install-nas-runner.sh
- Local validator: docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T112552Z/local/validate-returned-evidence.sh

```sh
sh ./local/install-nas-runner.sh <nas-compose-project-dir>
```

```sh
sh ./nas/RUN_ON_NAS.sh
```

```sh
sh ./local/validate-returned-evidence.sh <copied-admin-docker-release-inputs-dir>
```

The local validator first rejects missing required files, unexpected files, and sensitive fields, then runs intake and refreshes release readiness.

## Local Validation Commands

```sh
MIXLAB_ADMIN_DOCKER_NAS_ENV_FILE=<copied-admin-docker-release-inputs-dir>/admin-docker-current.env \
  MIXLAB_ADMIN_DOCKER_NAS_INSPECT_JSON=<copied-admin-docker-release-inputs-dir>/admin-docker-current.inspect.json \
  MIXLAB_ACCEPTANCE_OUTPUT_DIR=docs/acceptance/artifacts \
  npm run validate:admin-docker-nas-image-proof
```

```sh
MIXLAB_ADMIN_WORKER_ENV_FILE=<copied-admin-docker-release-inputs-dir>/admin-worker.env \
  MIXLAB_ADMIN_WORKER_INSPECT_JSON=<copied-admin-docker-release-inputs-dir>/admin-worker.inspect.json \
  MIXLAB_ACCEPTANCE_OUTPUT_DIR=docs/acceptance/artifacts \
  npm run validate:admin-worker-env-proof
```

```sh
MIXLAB_ADMIN_DOCKER_NAS_DISK_PROOF_JSON=<copied-admin-docker-release-inputs-dir>/admin-docker-disk-proof.json \
  MIXLAB_ACCEPTANCE_OUTPUT_DIR=docs/acceptance/artifacts \
  npm run validate:admin-docker-nas-disk-proof
```

```sh
MIXLAB_ADMIN_DOCKER_PRESTAGING_HANDOFF_REPORT=docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260628T102339Z.json \
  MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_PROOF_REPORT=docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T101658Z.json \
  MIXLAB_ADMIN_DOCKER_NAS_IMAGE_PROOF_REPORT=docs/acceptance/artifacts/admin-docker-nas-image-proof-*.json \
  MIXLAB_ACCEPTANCE_OUTPUT_DIR=docs/acceptance/artifacts \
  npm run validate:admin-docker-release-inputs
```

```sh
MIXLAB_ADMIN_DOCKER_RELEASE_INPUTS_REPORT=docs/acceptance/artifacts/admin-docker-release-inputs-*.json \
  MIXLAB_ADMIN_DOCKER_NAS_DISK_PROOF_REPORT=docs/acceptance/artifacts/admin-docker-nas-disk-proof-*.json \
  MIXLAB_DOCKER_CURRENT_IMAGE_TAG=<accepted-current-image-tag> \
  MIXLAB_DOCKER_TARGET_IMAGE_TAG=b062bc387c1fdb2a391320c1c36233b782cb000a \
  MIXLAB_DOCKER_ROLLBACK_IMAGE_TAG=<same-as-current-image-tag> \
  MIXLAB_ACCEPTANCE_OUTPUT_DIR=docs/acceptance/artifacts \
  npm run validate:admin-docker-staging-runbook
```

## Forbidden Actions

- Do not run push_images=true from this handoff package.
- Do not edit NAS .env during evidence collection.
- Do not restart NAS containers during evidence collection.
- Do not enable admin-worker or ready-publish workers.
- Do not run scan apply, index repair, snapshot restore, or production preprocessing from these instructions.
- Do not copy full .env, full docker inspect output, ASR keys, bearer tokens, or private transcript text into the returned evidence.

## Gates

| Gate | Category | Status | Blocks Handoff | Blocks Inputs | Blocks Push | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| handoff-no-side-effects | safety | pass | no | no | no | no | This report reads existing local JSON reports and copies the sanitized NAS collector; it does not contact NAS, Docker, GitHub, Admin API, or Cutter. |
| prestaging-handoff-provided | source | pass | no | yes | yes | yes | docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260628T102339Z.json |
| candidate-ref-proof-provided | source | pass | no | yes | yes | yes | docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T101658Z.json |
| release-inputs-report-provided | source | pass | no | yes | yes | yes | docs/acceptance/artifacts/admin-docker-release-inputs-20260628T102350Z.json |
| collector-source-provided | nas-collection | pass | no | no | yes | yes | /Users/huaqihang/Documents/mixlab/scripts/acceptance/admin-docker-nas-release-inputs-collector.sh |
| candidate-ref-proof-accepted | candidate | pass | no | yes | yes | yes | candidate_ref_proof_accepted=true |
| candidate-ref-proof-does-not-approve-deploy | safety | pass | yes | yes | yes | yes | candidate_ref_proof.docker_deploy_allowed=false |
| release-inputs-still-blocked-for-nas-collection | release-boundary | pass | no | yes | yes | yes | status=blocked, release_input_blockers=nas-image-proof-provided, nas-image-proof-accepted, nas-proof-does-not-approve-deploy, current-and-rollback-tags-present, rollback-tag-matches-current, target-tag-differs-from-current, workflow-command-has-no-placeholders |
| release-inputs-do-not-approve-push-or-deploy | safety | pass | yes | yes | yes | yes | push_execution_allowed=false, docker_deploy_allowed=false |

## Summary

- Handoff gate blockers: none
- Release-input gate blockers: none
- Push-execution gate blockers: none
- Docker-deploy gate blockers: none
- Source release-input blockers to resolve by NAS collection: nas-image-proof-provided, nas-image-proof-accepted, nas-proof-does-not-approve-deploy, current-and-rollback-tags-present, rollback-tag-matches-current, target-tag-differs-from-current, workflow-command-has-no-placeholders
- Unexpected release-input blockers: none
- Missing expected release-input blockers: none

## Next Actions

- If the NAS Compose project folder is mounted on this Mac, run: sh ./local/install-nas-runner.sh <nas-compose-project-dir>.
- Otherwise copy the handoff bundle's nas/ folder to the NAS Compose project folder that contains docker-compose.yml and .env.
- On the NAS shell host, run the quickstart script: sh ./nas/RUN_ON_NAS.sh
- Copy the generated admin-docker-release-inputs/ folder back to the Mac repository.
- Run the local validator: sh ./local/validate-returned-evidence.sh <copied-admin-docker-release-inputs-dir>.
- Stop if any returned proof is blocked, if release_inputs_ready=false, or if the staging runbook carries nas-disk-risk-carried-forward.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T112552Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T112552Z.md
- Bundle dir: docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T112552Z
- Manifest: docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T112552Z/MANIFEST.json
- README: docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T112552Z/README.md
- Operator checklist: docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T112552Z/OPERATOR-CHECKLIST.md
- Collector: docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T112552Z/nas/admin-docker-nas-release-inputs-collector.sh
- NAS runner: docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T112552Z/nas/RUN_ON_NAS.sh
- Local installer: docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T112552Z/local/install-nas-runner.sh
- Local validator: docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-20260628T112552Z/local/validate-returned-evidence.sh
