# Admin Docker GitHub Run Artifact Evidence

Generated: 2026-06-29T03:45:26.708Z
Mode: admin-docker-github-run-artifact
Repo: alin155/mixlab
Workflow: docker-admin.yml
Run: 28347083834
Run URL: https://github.com/alin155/mixlab/actions/runs/28347083834

## Decision

- GitHub run candidate ready: yes
- Current worktree candidate ready: yes
- GitHub run staging handoff ready: no
- Current worktree staging handoff ready: no
- Docker deploy allowed: no
- Result: current-worktree-candidate-ready
- Summary: GitHub run artifact proves the current clean worktree has a smoked Docker candidate; staging and deploy remain separately gated.

## Run

- Status: completed
- Conclusion: success
- Head branch: admin-docker-candidate-9c015b9105e97954240020781f79daae3f954bde
- Head SHA: 9c015b9105e97954240020781f79daae3f954bde
- Event: workflow_dispatch

## Source Control

- Local branch: codex/windows-first-run-autostart-20260615104835
- Local HEAD: 9c015b9105e97954240020781f79daae3f954bde
- Worktree dirty: no
- Changed paths: 0

## Artifact Readiness

- Artifact dir: .local-dev/admin-docker-github-runs/28347083834/mixlab-admin-docker-release-gates
- Readiness JSON: docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260629T034526Z.json
- Readiness Markdown: docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260629T034526Z.md
- Readiness result: candidate-ready
- Readiness failed gates: 0

## Gates

| Gate | Category | Status | Blocks run candidate | Blocks current candidate | Blocks run staging | Blocks current staging | Blocks deploy | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| github-run-artifact-no-side-effects | safety | pass | no | no | no | no | no | Uses gh run view/download and local JSON validation only; does not contact NAS, Docker daemon, Windows Runner, Cutter, or Admin runtime services. |
| github-run-successful | github-run | pass | yes | yes | yes | yes | yes | status=completed, conclusion=success, url=https://github.com/alin155/mixlab/actions/runs/28347083834 |
| release-gates-artifact-downloaded | artifact | pass | yes | yes | yes | yes | yes | .local-dev/admin-docker-github-runs/28347083834/mixlab-admin-docker-release-gates |
| github-artifact-readiness-generated | readiness | pass | yes | yes | yes | yes | yes | docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260629T034526Z.json |
| github-artifact-candidate-ready | readiness | pass | yes | yes | yes | yes | yes | github_candidate_artifact_ready=true, result=candidate-ready |
| github-artifact-staging-handoff-ready | readiness | blocked | no | no | yes | yes | yes | staging_handoff_ready=false, blockers=nas-release-inputs-intake-complete, returned-evidence-precheck-passed, release-inputs-ready, image-push-explicitly-approved, staging-runbook-ready |
| run-head-matches-current-head | source-control | pass | no | yes | no | yes | yes | run.headSha=9c015b9105e97954240020781f79daae3f954bde, local.head=9c015b9105e97954240020781f79daae3f954bde |
| current-worktree-clean | source-control | pass | no | yes | no | yes | yes | git status --porcelain is empty |
| run-artifact-does-not-approve-deploy | release-boundary | pass | yes | yes | yes | yes | yes | readiness.docker_deploy_allowed=false |

## Blockers

- GitHub run candidate blockers: none
- Current worktree candidate blockers: none
- GitHub run staging blockers: github-artifact-staging-handoff-ready
- Current worktree staging blockers: github-artifact-staging-handoff-ready
- Docker deploy blockers: github-artifact-staging-handoff-ready

## Next Actions

- For staging handoff, rerun workflow_dispatch with push_images=true plus current/rollback tags after candidate artifact readiness is green.
- Staging blockers from readiness: nas-release-inputs-intake-complete, returned-evidence-precheck-passed, release-inputs-ready, image-push-explicitly-approved, staging-runbook-ready.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-github-run-artifact-20260629T034526Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-github-run-artifact-20260629T034526Z.md
