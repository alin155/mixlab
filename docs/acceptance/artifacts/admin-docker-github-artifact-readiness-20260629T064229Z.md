# Admin Docker GitHub Artifact Readiness

Generated: 2026-06-29T06:42:29.100Z
Mode: admin-docker-github-artifact-readiness
Artifact dir: .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates

## Decision

- GitHub candidate artifact ready: yes
- Staging handoff ready: no
- Docker deploy allowed: no
- Result: candidate-ready
- Summary: GitHub Admin Docker artifact proves a coherent smoked candidate; staging handoff and deploy remain separately gated.

## Sources

- Admin Docker local smoke: .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-docker-local-smoke-20260629T063855Z.json
- Admin Docker candidate contract proof: .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-docker-candidate-contract-proof-20260629T063959Z.json
- Admin Docker live read-only probe: .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-docker-release-live-readonly-20260629T064000Z.json
- Admin Docker version parity plan: .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-docker-version-parity-plan-20260629T064000Z.json
- Admin worker env proof: .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-worker-env-proof-20260629T064000Z.json
- Cutter compatibility proof: .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-cutter-compatibility-proof-20260629T064001Z.json
- Admin Docker NAS release-inputs intake: .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-docker-nas-release-inputs-intake-20260629T064141Z.json
- Admin Docker staging runbook: .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-docker-staging-runbook-20260629T064142Z.json
- Admin Docker release readiness summary: .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-docker-release-readiness-summary-20260629T064142Z.json

## Observations

- Local smoke: accepted, passed=true
- Smoked image tag: 9c015b9105e97954240020781f79daae3f954bde
- Smoked build sha: 9c015b9105e97954240020781f79daae3f954bde
- Candidate: ready-for-candidate-review, ready=true
- Candidate source: local-smoke-report, local_smoke_passed=true
- Candidate observed image tag: 9c015b9105e97954240020781f79daae3f954bde
- Target image tag: 9c015b9105e97954240020781f79daae3f954bde
- Target tag matches smoke: yes
- Image push approval accepted: true
- Current image tag: latest
- Rollback image tag: latest
- Release-inputs intake: blocked, complete=false, returned_precheck_passed=false, ready=false
- Release-inputs push/deploy allowed: push=false, deploy=false
- Release-inputs intake blockers: returned-dir-provided, returned-files-complete, returned-evidence-precheck-passed, nas-image-proof-accepted, admin-worker-proof-accepted, nas-disk-proof-accepted, release-inputs-generated, staging-runbook-generated
- Release-input blockers: returned-dir-provided, returned-files-complete, returned-evidence-precheck-passed, nas-image-proof-accepted, release-inputs-generated, release-inputs-ready
- Staging review ready: false
- Release review ready: false
- Staging blockers: image-push-proof-accepted, parity-report-blockers-clear, worker-env-proof-accepted, cutter-compatibility-proof-accepted
- Release blockers: live-readonly-blockers-clear, parity-plan-blockers-clear, worker-proof-accepted, cutter-proof-accepted, nas-release-inputs-intake-complete, nas-collection-path-prepared, nas-handoff-kit-ready, returned-evidence-precheck-passed, release-inputs-ready, staging-runbook-ready, summary-does-not-approve-upload

## Gates

| Gate | Category | Status | Blocks candidate | Blocks staging | Blocks deploy | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| github-artifact-readiness-no-side-effects | safety | pass | no | no | no | Reads archived release-gate reports only; does not contact Docker, NAS, Windows Runner, Cutter, or Admin services. |
| artifact-admin-docker-local-smoke-present | artifact | pass | yes | yes | yes | .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-docker-local-smoke-20260629T063855Z.json |
| artifact-admin-docker-candidate-contract-proof-present | artifact | pass | yes | yes | yes | .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-docker-candidate-contract-proof-20260629T063959Z.json |
| artifact-admin-docker-release-live-readonly-present | artifact | pass | yes | yes | yes | .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-docker-release-live-readonly-20260629T064000Z.json |
| artifact-admin-docker-version-parity-plan-present | artifact | pass | yes | yes | yes | .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-docker-version-parity-plan-20260629T064000Z.json |
| artifact-admin-worker-env-proof-present | artifact | pass | yes | yes | yes | .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-worker-env-proof-20260629T064000Z.json |
| artifact-admin-cutter-compatibility-proof-present | artifact | pass | yes | yes | yes | .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-cutter-compatibility-proof-20260629T064001Z.json |
| artifact-admin-docker-nas-release-inputs-intake-present | artifact | pass | yes | yes | yes | .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-docker-nas-release-inputs-intake-20260629T064141Z.json |
| artifact-admin-docker-staging-runbook-present | artifact | pass | yes | yes | yes | .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-docker-staging-runbook-20260629T064142Z.json |
| artifact-admin-docker-release-readiness-summary-present | artifact | pass | yes | yes | yes | .local-dev/admin-docker-github-runs/28353418715/mixlab-admin-docker-release-gates/admin-docker-release-readiness-summary-20260629T064142Z.json |
| release-boundary-does-not-approve-deploy | release-boundary | pass | yes | yes | yes | staging.docker_deploy_allowed=false, release.docker_upload_allowed=false, release_inputs_intake.push_execution_allowed=false, release_inputs_intake.docker_deploy_allowed=false |
| local-docker-smoke-passed | candidate | pass | yes | yes | yes | local_smoke_passed=true, status=accepted |
| local-smoke-build-identity-current | candidate | pass | yes | yes | yes | image_tag=9c015b9105e97954240020781f79daae3f954bde, build_sha=9c015b9105e97954240020781f79daae3f954bde |
| candidate-derived-from-local-smoke | candidate | pass | yes | yes | yes | source.kind=local-smoke-report, source.local_smoke_passed=true |
| candidate-contract-ready | candidate | pass | yes | yes | yes | candidate_contract_ready=true, status=ready-for-candidate-review |
| candidate-build-matches-smoke | candidate | pass | yes | yes | yes | candidate.image_tag=9c015b9105e97954240020781f79daae3f954bde, smoke.image_tag=9c015b9105e97954240020781f79daae3f954bde, candidate.build_sha=9c015b9105e97954240020781f79daae3f954bde, smoke.build_sha=9c015b9105e97954240020781f79daae3f954bde |
| target-tag-matches-smoked-image | image | pass | yes | yes | yes | target=9c015b9105e97954240020781f79daae3f954bde, smoke.image_tag=9c015b9105e97954240020781f79daae3f954bde, runbook.target_tag_matches_local_smoke=true |
| nas-release-inputs-intake-complete | release-inputs | blocked | no | yes | yes | intake blockers=returned-dir-provided, returned-files-complete, returned-evidence-precheck-passed, nas-image-proof-accepted, admin-worker-proof-accepted, nas-disk-proof-accepted, release-inputs-generated, staging-runbook-generated |
| returned-evidence-precheck-passed | release-inputs | blocked | no | yes | yes | returned_precheck_passed=false |
| release-inputs-ready | release-inputs | blocked | no | yes | yes | release input blockers=returned-dir-provided, returned-files-complete, returned-evidence-precheck-passed, nas-image-proof-accepted, release-inputs-generated, release-inputs-ready |
| image-push-explicitly-approved | staging | pass | no | yes | yes | image_push_approval.accepted=true |
| current-and-rollback-tags-provided | staging | pass | no | yes | yes | current=latest, rollback=latest |
| staging-runbook-ready | staging | blocked | no | yes | yes | staging_review_ready=false, blockers=image-push-proof-accepted, parity-report-blockers-clear, worker-env-proof-accepted, cutter-compatibility-proof-accepted |

## Blockers

- Candidate artifact blockers: none
- Staging handoff blockers: nas-release-inputs-intake-complete, returned-evidence-precheck-passed, release-inputs-ready, staging-runbook-ready
- Docker deploy blockers: nas-release-inputs-intake-complete, returned-evidence-precheck-passed, release-inputs-ready, staging-runbook-ready

## Next Actions

- Run the NAS release-inputs collector, copy admin-docker-release-inputs/ back to the Mac repo, then rerun intake:admin-docker-nas-release-inputs.
- Regenerate release inputs from accepted pre-staging, candidate-ref, and NAS current-image proof before staging handoff.
- Clear staging runbook blockers before treating the GitHub artifact as staging-handoff ready.
- Keep Docker deploy blocked until release readiness blockers are resolved in a separate release decision.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260629T064229Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260629T064229Z.md
