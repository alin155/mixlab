# Admin Docker Pre-Staging Handoff

Generated: 2026-06-28T19:50:10.589Z
Mode: admin-docker-prestaging-handoff

## Decision

- Ready to request release inputs: yes
- Staging execution ready: no
- Docker deploy allowed: no
- Result: ready-for-release-inputs
- Summary: A smoked Admin Docker candidate and current NAS baseline are available; release inputs can be requested, but staging and deploy remain blocked.

## Candidate

- GitHub run: 28333837849
- GitHub run URL: https://github.com/alin155/mixlab/actions/runs/28333837849
- Head SHA: f9aa9bc7dea187dc3029c90389d5c3c08938dd58
- Current worktree candidate ready: yes
- GitHub run candidate ready: yes
- Immutable candidate ref ready: yes

## Live Baseline

- Target URL: http://192.168.1.27:18080
- Library root: /data/PublicLibrary
- Ready video count: 10471
- Total video count: 11394
- Current index: v010471
- Disk usage percent: 98
- Disk status: blocked
- Live upload blockers: current-admin-api-contract-live, auth-context-live, build-version-health, version-health-parity-contract-live, preprocess-disk, disk-space-protection-contract-live, usage-events-tolerance, usage-events-repair-contract-live, processing-recovery, processing-recovery-contract-live, current-index, data-loading-contract-live, admin-worker-env-proof-contract-live, admin-worker-live-flags, cutter-compatibility-proof-contract-live, cutter-release-compatibility-live
- Current API contract blocked: yes

## Release Input Request

- Target image tag: f9aa9bc7dea187dc3029c90389d5c3c08938dd58
- Candidate branch: admin-docker-candidate-f9aa9bc7dea187dc3029c90389d5c3c08938dd58
- Workflow ref: admin-docker-candidate-f9aa9bc7dea187dc3029c90389d5c3c08938dd58
- Release ref setup: git tag admin-docker-candidate-f9aa9bc7dea187dc3029c90389d5c3c08938dd58 f9aa9bc7dea187dc3029c90389d5c3c08938dd58 && git push origin refs/tags/admin-docker-candidate-f9aa9bc7dea187dc3029c90389d5c3c08938dd58:refs/tags/admin-docker-candidate-f9aa9bc7dea187dc3029c90389d5c3c08938dd58
- Workflow command: gh workflow run docker-admin.yml --repo alin155/mixlab --ref admin-docker-candidate-f9aa9bc7dea187dc3029c90389d5c3c08938dd58 -f push_images=true -f current_image_tag=<current-admin-docker-image-tag> -f rollback_image_tag=<current-admin-docker-image-tag>
- Candidate ref proof command: MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_SHA=f9aa9bc7dea187dc3029c90389d5c3c08938dd58 MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_TAG=admin-docker-candidate-f9aa9bc7dea187dc3029c90389d5c3c08938dd58 MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_RUN_ID=<tag-ref-push-images-false-run-id> MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_ARTIFACT_DIR=<downloaded-tag-ref-release-gates-artifact-dir> npm run validate:admin-docker-candidate-ref-proof
- NAS image proof command: MIXLAB_ADMIN_DOCKER_NAS_ENV_FILE=<path>/admin-docker-current.env MIXLAB_ADMIN_DOCKER_NAS_INSPECT_JSON=<path>/admin-docker-current.inspect.json npm run validate:admin-docker-nas-image-proof
- Release inputs command: MIXLAB_ADMIN_DOCKER_PRESTAGING_HANDOFF_REPORT=<path>/admin-docker-prestaging-handoff.json MIXLAB_ADMIN_DOCKER_NAS_IMAGE_PROOF_REPORT=<path>/admin-docker-nas-image-proof.json npm run validate:admin-docker-release-inputs
- Initial library preprocess worker: 0
- Initial ready publish worker: 0
- Initial DASHSCOPE_API_KEY: blank-unless-canary-approved
- Library root: /data/PublicLibrary

| Input | Status | Source | Value |
| --- | --- | --- | --- |
| explicit_push_images_approval | required | human release decision | workflow_dispatch:push_images=true |
| current_image_tag | required | accepted admin-docker-nas-image-proof report before staging | <required> |
| rollback_image_tag | required | same accepted admin-docker-nas-image-proof value as current_image_tag for the first update | <required> |

### Forbidden Before Staged Proof

- Do not edit NAS .env or restart NAS containers before the pushed-image workflow succeeds.
- Do not enable library preprocess worker, ready publish worker, scan apply, index repair, or release publish for initial staging.
- Do not treat the existing 18080 legacy Admin target as staged candidate proof.
- Do not mutate Cutter release/index before staged live-readonly and Cutter compatibility proof pass.

### Post-Staging Required Proofs

- Run GET-only live-readonly against the staged Admin Web root and require current Admin API contract endpoints to pass.
- Export staged admin-worker env/inspect evidence and require admin-worker-env-proof accepted.
- Run Windows Cutter compatibility proof with staged-candidate windows_acceptance and real_cut_smoke reports.
- Verify ready count stays at 10471 and current index stays v010471 unless a later separately approved publish phase changes them.

## Gates

| Gate | Category | Status | Blocks release inputs | Blocks staging | Blocks deploy | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| prestaging-handoff-no-side-effects | safety | pass | no | no | no | Reads archived GitHub run and live-readonly reports only; does not contact NAS, Docker, GHCR, GitHub, Windows Runner, Admin API, or Cutter API. |
| current-worktree-candidate-ready | candidate | pass | no | no | yes | current_worktree_candidate_ready=true, github_run_candidate_ready=true, immutable_candidate_ref_ready=true, run=https://github.com/alin155/mixlab/actions/runs/28333837849 |
| handoff-does-not-approve-deploy | safety | pass | yes | yes | yes | run.docker_deploy_allowed=false, live.docker_upload_allowed=false |
| live-baseline-observed | live-baseline | pass | no | no | yes | target=http://192.168.1.27:18080, library_root=/data/PublicLibrary, ready=10471, index=v010471 |
| legacy-live-target-not-mistaken-for-staged-candidate | live-baseline | pass | no | yes | yes | Current live upload blockers include current API/data-loading contract gaps: current-admin-api-contract-live, version-health-parity-contract-live, disk-space-protection-contract-live, usage-events-repair-contract-live, processing-recovery-contract-live, data-loading-contract-live, admin-worker-env-proof-contract-live, cutter-compatibility-proof-contract-live |
| nas-disk-risk-carried-forward | live-baseline | blocked | no | yes | yes | disk_usage=98%, disk_status=blocked, live_upload_blockers=current-admin-api-contract-live, auth-context-live, build-version-health, version-health-parity-contract-live, preprocess-disk, disk-space-protection-contract-live, usage-events-tolerance, usage-events-repair-contract-live, processing-recovery, processing-recovery-contract-live, current-index, data-loading-contract-live, admin-worker-env-proof-contract-live, admin-worker-live-flags, cutter-compatibility-proof-contract-live, cutter-release-compatibility-live |
| explicit-push-approval-required | release-input | blocked | no | yes | yes | github_run_staging_handoff_ready=false |
| current-and-rollback-tags-required | release-input | blocked | no | yes | yes | Pre-staging report cannot infer NAS current image tag or rollback tag from HTTP probes. |
| staged-live-readonly-required | external-proof | blocked | no | yes | yes | Current report only observes the existing NAS Admin target before staging. |
| admin-worker-env-proof-required | external-proof | blocked | no | yes | yes | HTTP probes cannot prove running admin-worker container env flags or image tag. |
| cutter-compatibility-proof-required | external-proof | blocked | no | yes | yes | Pre-staging proof cannot prove Windows Cutter behavior after the Docker candidate is staged. |

## Blockers

- Release input blockers: none
- Staging execution blockers: nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required, staged-live-readonly-required, admin-worker-env-proof-required, cutter-compatibility-proof-required
- Docker deploy blockers: nas-disk-risk-carried-forward, explicit-push-approval-required, current-and-rollback-tags-required, staged-live-readonly-required, admin-worker-env-proof-required, cutter-compatibility-proof-required

## Next Actions

- Export a sanitized current NAS Admin Docker MIXLAB_IMAGE_TAG evidence file and docker inspect evidence, then run validate:admin-docker-nas-image-proof before choosing release inputs.
- Run validate:admin-docker-release-inputs with the accepted pre-staging handoff and NAS image proof reports to generate the exact push_images=true command.
- Use the accepted NAS image proof current_image_tag and rollback_image_tag values before staging; both should match for the first update.
- Resolve the current NAS disk blocked state before staging execution; do not treat a generated push_images=true command as approval while disk risk is carried forward.
- Before explicit push approval, create or verify the immutable release ref admin-docker-candidate-f9aa9bc7dea187dc3029c90389d5c3c08938dd58 points at candidate SHA f9aa9bc7dea187dc3029c90389d5c3c08938dd58.
- Run the candidate release ref with push_images=false and generate validate:admin-docker-candidate-ref-proof before treating the ref as pinned release evidence.
- After explicit approval, rerun the Admin Docker workflow with --ref admin-docker-candidate-f9aa9bc7dea187dc3029c90389d5c3c08938dd58, push_images=true, current_image_tag=<current-tag>, rollback_image_tag=<current-tag>, and target image f9aa9bc7dea187dc3029c90389d5c3c08938dd58.
- Do not change NAS .env or restart containers until the pushed-image run completes and produces release-gates artifacts.
- For initial staging, keep MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0, MIXLAB_ENABLE_READY_PUBLISH_WORKER=0, and leave DASHSCOPE_API_KEY blank unless a separate controlled-preprocess canary is approved.
- After staging, rerun live-readonly, admin-worker-env-proof, and Cutter compatibility proof before treating the MVP as complete.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260628T195010Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-prestaging-handoff-20260628T195010Z.md
