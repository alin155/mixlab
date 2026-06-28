# Admin Docker GitHub Run Artifact Evidence

Generated: 2026-06-28T22:48:10.990Z
Mode: admin-docker-github-run-artifact
Repo: alin155/mixlab
Workflow: docker-admin.yml
Run: 28338518625
Run URL: https://github.com/alin155/mixlab/actions/runs/28338518625

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
- Head branch: admin-docker-candidate-b945418df2a447fd39bb9c88f781322594fc11c0
- Head SHA: b945418df2a447fd39bb9c88f781322594fc11c0
- Event: workflow_dispatch

## Source Control

- Local branch: codex/windows-first-run-autostart-20260615104835
- Local HEAD: b945418df2a447fd39bb9c88f781322594fc11c0
- Worktree dirty: no
- Changed paths: 0

## Artifact Readiness

- Artifact dir: .local-dev/admin-docker-github-runs/28338518625/mixlab-admin-docker-release-gates
- Readiness JSON: docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260628T224810Z.json
- Readiness Markdown: docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260628T224810Z.md
- Readiness result: candidate-ready
- Readiness failed gates: 0

## Gates

| Gate | Category | Status | Blocks run candidate | Blocks current candidate | Blocks run staging | Blocks current staging | Blocks deploy | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| github-run-artifact-no-side-effects | safety | pass | no | no | no | no | no | Uses gh run view/download and local JSON validation only; does not contact NAS, Docker daemon, Windows Runner, Cutter, or Admin runtime services. |
| github-run-successful | github-run | pass | yes | yes | yes | yes | yes | status=completed, conclusion=success, url=https://github.com/alin155/mixlab/actions/runs/28338518625 |
| release-gates-artifact-downloaded | artifact | pass | yes | yes | yes | yes | yes | .local-dev/admin-docker-github-runs/28338518625/mixlab-admin-docker-release-gates |
| github-artifact-readiness-generated | readiness | pass | yes | yes | yes | yes | yes | docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260628T224810Z.json |
| github-artifact-candidate-ready | readiness | pass | yes | yes | yes | yes | yes | github_candidate_artifact_ready=true, result=candidate-ready |
| github-artifact-staging-handoff-ready | readiness | blocked | no | no | yes | yes | yes | staging_handoff_ready=false, blockers=nas-release-inputs-intake-complete, returned-evidence-precheck-passed, release-inputs-ready, image-push-explicitly-approved, current-and-rollback-tags-provided, staging-runbook-ready |
| run-head-matches-current-head | source-control | pass | no | yes | no | yes | yes | run.headSha=b945418df2a447fd39bb9c88f781322594fc11c0, local.head=b945418df2a447fd39bb9c88f781322594fc11c0 |
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
- Staging blockers from readiness: nas-release-inputs-intake-complete, returned-evidence-precheck-passed, release-inputs-ready, image-push-explicitly-approved, current-and-rollback-tags-provided, staging-runbook-ready.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-github-run-artifact-20260628T224810Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-github-run-artifact-20260628T224810Z.md
