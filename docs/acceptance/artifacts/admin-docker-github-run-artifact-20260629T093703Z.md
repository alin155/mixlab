# Admin Docker GitHub Run Artifact Evidence

Generated: 2026-06-29T09:37:03.729Z
Mode: admin-docker-github-run-artifact
Repo: alin155/mixlab
Workflow: docker-admin.yml
Run: 28362489637
Run URL: https://github.com/alin155/mixlab/actions/runs/28362489637

## Decision

- GitHub run candidate ready: yes
- Current worktree candidate ready: no
- GitHub run staging handoff ready: no
- Current worktree staging handoff ready: no
- Docker deploy allowed: no
- Result: github-run-candidate-ready
- Summary: GitHub run artifact proves its remote commit has a smoked Docker candidate, but it does not yet prove the current local worktree.

## Run

- Status: completed
- Conclusion: success
- Head branch: admin-docker-candidate-8a7939c1e8b2220d45d52c5fe329692516c32e4d
- Head SHA: 8a7939c1e8b2220d45d52c5fe329692516c32e4d
- Event: workflow_dispatch

## Source Control

- Local branch: codex/windows-first-run-autostart-20260615104835
- Local HEAD: 8a7939c1e8b2220d45d52c5fe329692516c32e4d
- Worktree dirty: yes
- Changed paths: 2

## Artifact Readiness

- Artifact dir: .local-dev/admin-docker-github-runs/28362489637/mixlab-admin-docker-release-gates
- Readiness JSON: docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260629T093703Z.json
- Readiness Markdown: docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260629T093703Z.md
- Readiness result: candidate-ready
- Readiness failed gates: 0

## Gates

| Gate | Category | Status | Blocks run candidate | Blocks current candidate | Blocks run staging | Blocks current staging | Blocks deploy | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| github-run-artifact-no-side-effects | safety | pass | no | no | no | no | no | Uses gh run view/download and local JSON validation only; does not contact NAS, Docker daemon, Windows Runner, Cutter, or Admin runtime services. |
| github-run-successful | github-run | pass | yes | yes | yes | yes | yes | status=completed, conclusion=success, url=https://github.com/alin155/mixlab/actions/runs/28362489637 |
| release-gates-artifact-downloaded | artifact | pass | yes | yes | yes | yes | yes | .local-dev/admin-docker-github-runs/28362489637/mixlab-admin-docker-release-gates |
| github-artifact-readiness-generated | readiness | pass | yes | yes | yes | yes | yes | docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260629T093703Z.json |
| github-artifact-candidate-ready | readiness | pass | yes | yes | yes | yes | yes | github_candidate_artifact_ready=true, result=candidate-ready |
| github-artifact-staging-handoff-ready | readiness | blocked | no | no | yes | yes | yes | staging_handoff_ready=false, blockers=nas-release-inputs-intake-complete, returned-evidence-precheck-passed, release-inputs-ready, image-push-explicitly-approved, staging-runbook-ready |
| run-head-matches-current-head | source-control | pass | no | yes | no | yes | yes | run.headSha=8a7939c1e8b2220d45d52c5fe329692516c32e4d, local.head=8a7939c1e8b2220d45d52c5fe329692516c32e4d |
| current-worktree-clean | source-control | blocked | no | yes | no | yes | yes | 2 changed path(s) are present |
| run-artifact-does-not-approve-deploy | release-boundary | pass | yes | yes | yes | yes | yes | readiness.docker_deploy_allowed=false |

## Blockers

- GitHub run candidate blockers: none
- Current worktree candidate blockers: current-worktree-clean
- GitHub run staging blockers: github-artifact-staging-handoff-ready
- Current worktree staging blockers: github-artifact-staging-handoff-ready, current-worktree-clean
- Docker deploy blockers: github-artifact-staging-handoff-ready, current-worktree-clean

## Next Actions

- Archive or commit the current candidate changes before treating a remote run as proof for this exact worktree.
- For staging handoff, rerun workflow_dispatch with push_images=true plus current/rollback tags after candidate artifact readiness is green.
- Staging blockers from readiness: nas-release-inputs-intake-complete, returned-evidence-precheck-passed, release-inputs-ready, image-push-explicitly-approved, staging-runbook-ready.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-github-run-artifact-20260629T093703Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-github-run-artifact-20260629T093703Z.md
