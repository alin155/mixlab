# Admin Docker Image Push Proof

Generated: 2026-06-29T10:00:34.866Z
Mode: admin-docker-image-push-proof
Result: blocked
Proof accepted: no
Push execution allowed: no
Docker deploy allowed: no

This report reads archived reports only. It does not contact GitHub, GHCR, Docker, NAS, Admin API, Cutter API, or Windows Runner.

## Sources

- GitHub run artifact: docs/acceptance/artifacts/admin-docker-github-run-artifact-20260629T095804Z.json
- GitHub artifact readiness: docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260629T095804Z.json
- Release inputs: docs/acceptance/artifacts/admin-docker-release-inputs-20260629T095931Z.json
- Push decision package: docs/acceptance/artifacts/admin-docker-push-decision-package-20260629T100027Z.json

## Observations

- GitHub run successful: true
- GitHub run event: workflow_dispatch
- GitHub run head SHA: 5a50922bc82f1b6728f247ed33e5885ab8cf6bef
- GitHub run head branch: admin-docker-candidate-5a50922bc82f1b6728f247ed33e5885ab8cf6bef
- GitHub run URL: https://github.com/alin155/mixlab/actions/runs/28363633436
- GitHub run candidate ready: true
- GitHub run staging handoff ready: false
- GitHub artifact status: candidate-ready
- GitHub candidate artifact ready: true
- GitHub artifact staging handoff ready: false
- Image push approval accepted: false
- Artifact staging handoff blockers: nas-release-inputs-intake-complete, returned-evidence-precheck-passed, release-inputs-ready, image-push-explicitly-approved, staging-runbook-ready
- Release inputs ready: true
- Push decision package ready: true
- Current image tag: 9c015b9105e97954240020781f79daae3f954bde
- Target image tag: 5a50922bc82f1b6728f247ed33e5885ab8cf6bef
- Rollback image tag: 9c015b9105e97954240020781f79daae3f954bde
- Workflow command ready: true
- Run head matches target: true
- Source reports nondeploy: true

## Gates

| Gate | Category | Status | Blocks Proof | Blocks Staging Execution | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
image-push-proof-no-side-effects | safety | pass | no | no | no | Reads archived GitHub run, artifact readiness, release inputs, and push decision reports only; it does not contact GitHub, GHCR, NAS, Docker, Admin API, Cutter API, or Windows Runner.
source-reports-do-not-approve-push-or-deploy | safety | pass | yes | yes | yes | run.deploy=false, readiness.deploy=false, release_inputs.push=false, release_inputs.deploy=false, push_package.push=false, push_package.deploy=false
release-inputs-ready | release-inputs | pass | yes | yes | yes | release_inputs_ready=true
push-decision-package-ready | release-decision | pass | yes | yes | yes | push_decision_package_ready=true
workflow-command-ready | release-decision | pass | yes | yes | yes | release_inputs_command_ready=true, push_package_command_matches=true
github-run-successful | github-run | pass | yes | yes | yes | status=completed, conclusion=success, url=https://github.com/alin155/mixlab/actions/runs/28363633436
github-run-is-workflow-dispatch | github-run | pass | yes | yes | yes | event=workflow_dispatch
github-run-target-ref-matches-release-inputs | image | pass | yes | yes | yes | run.headSha=5a50922bc82f1b6728f247ed33e5885ab8cf6bef, run.headBranch=admin-docker-candidate-5a50922bc82f1b6728f247ed33e5885ab8cf6bef, target=5a50922bc82f1b6728f247ed33e5885ab8cf6bef
github-candidate-artifact-ready | artifact | pass | yes | yes | yes | github_run_candidate_ready=true, github_candidate_artifact_ready=true, readiness_status=candidate-ready
image-push-approval-observed-in-artifact | image | blocked | yes | yes | yes | image_push_approval_accepted=false
image-push-blocker-cleared-from-artifact | image | blocked | yes | yes | yes | artifact_staging_handoff_blockers=nas-release-inputs-intake-complete, returned-evidence-precheck-passed, release-inputs-ready, image-push-explicitly-approved, staging-runbook-ready

## Next Actions

- Resolve image push proof blockers: image-push-approval-observed-in-artifact, image-push-blocker-cleared-from-artifact.
- Keep staging execution blocked until a successful push_images=true workflow run is archived and this proof is accepted.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-image-push-proof-20260629T100034Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-image-push-proof-20260629T100034Z.md
