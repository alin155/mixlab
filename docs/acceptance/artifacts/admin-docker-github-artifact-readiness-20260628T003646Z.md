# Admin Docker GitHub Artifact Readiness

Generated: 2026-06-28T00:36:46.132Z
Mode: admin-docker-github-artifact-readiness
Artifact dir: .local-dev/admin-docker-github-runs/28306384634/mixlab-admin-docker-release-gates

## Decision

- GitHub candidate artifact ready: yes
- Staging handoff ready: no
- Docker deploy allowed: no
- Result: candidate-ready
- Summary: GitHub Admin Docker artifact proves a coherent smoked candidate; staging handoff and deploy remain separately gated.

## Sources

- Admin Docker local smoke: .local-dev/admin-docker-github-runs/28306384634/mixlab-admin-docker-release-gates/admin-docker-local-smoke-20260628T003106Z.json
- Admin Docker candidate contract proof: .local-dev/admin-docker-github-runs/28306384634/mixlab-admin-docker-release-gates/admin-docker-candidate-contract-proof-20260628T003209Z.json
- Admin Docker live read-only probe: .local-dev/admin-docker-github-runs/28306384634/mixlab-admin-docker-release-gates/admin-docker-release-live-readonly-20260628T003210Z.json
- Admin Docker version parity plan: .local-dev/admin-docker-github-runs/28306384634/mixlab-admin-docker-release-gates/admin-docker-version-parity-plan-20260628T003210Z.json
- Admin worker env proof: .local-dev/admin-docker-github-runs/28306384634/mixlab-admin-docker-release-gates/admin-worker-env-proof-20260628T003210Z.json
- Cutter compatibility proof: .local-dev/admin-docker-github-runs/28306384634/mixlab-admin-docker-release-gates/admin-cutter-compatibility-proof-20260628T003211Z.json
- Admin Docker staging runbook: .local-dev/admin-docker-github-runs/28306384634/mixlab-admin-docker-release-gates/admin-docker-staging-runbook-20260628T003310Z.json
- Admin Docker release readiness summary: .local-dev/admin-docker-github-runs/28306384634/mixlab-admin-docker-release-gates/admin-docker-release-readiness-summary-20260628T003310Z.json

## Observations

- Local smoke: accepted, passed=true
- Smoked image tag: 5c0e8dfe5d1e8621a8bdb1e14524349a283af28d
- Smoked build sha: 5c0e8dfe5d1e8621a8bdb1e14524349a283af28d
- Candidate: ready-for-candidate-review, ready=true
- Candidate source: local-smoke-report, local_smoke_passed=true
- Candidate observed image tag: 5c0e8dfe5d1e8621a8bdb1e14524349a283af28d
- Target image tag: 5c0e8dfe5d1e8621a8bdb1e14524349a283af28d
- Target tag matches smoke: yes
- Image push approval accepted: false
- Current image tag: <missing>
- Rollback image tag: <missing>
- Staging review ready: false
- Release review ready: false
- Staging blockers: current-image-tag-provided, rollback-image-tag-provided, target-differs-from-current, rollback-tag-matches-current, image-push-explicitly-approved, parity-report-blockers-clear, worker-env-proof-accepted, cutter-compatibility-proof-accepted
- Release blockers: live-readonly-blockers-clear, parity-plan-blockers-clear, worker-proof-accepted, cutter-proof-accepted, staging-runbook-ready

## Gates

| Gate | Category | Status | Blocks candidate | Blocks staging | Blocks deploy | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| github-artifact-readiness-no-side-effects | safety | pass | no | no | no | Reads archived release-gate reports only; does not contact Docker, NAS, Windows Runner, Cutter, or Admin services. |
| artifact-admin-docker-local-smoke-present | artifact | pass | yes | yes | yes | .local-dev/admin-docker-github-runs/28306384634/mixlab-admin-docker-release-gates/admin-docker-local-smoke-20260628T003106Z.json |
| artifact-admin-docker-candidate-contract-proof-present | artifact | pass | yes | yes | yes | .local-dev/admin-docker-github-runs/28306384634/mixlab-admin-docker-release-gates/admin-docker-candidate-contract-proof-20260628T003209Z.json |
| artifact-admin-docker-release-live-readonly-present | artifact | pass | yes | yes | yes | .local-dev/admin-docker-github-runs/28306384634/mixlab-admin-docker-release-gates/admin-docker-release-live-readonly-20260628T003210Z.json |
| artifact-admin-docker-version-parity-plan-present | artifact | pass | yes | yes | yes | .local-dev/admin-docker-github-runs/28306384634/mixlab-admin-docker-release-gates/admin-docker-version-parity-plan-20260628T003210Z.json |
| artifact-admin-worker-env-proof-present | artifact | pass | yes | yes | yes | .local-dev/admin-docker-github-runs/28306384634/mixlab-admin-docker-release-gates/admin-worker-env-proof-20260628T003210Z.json |
| artifact-admin-cutter-compatibility-proof-present | artifact | pass | yes | yes | yes | .local-dev/admin-docker-github-runs/28306384634/mixlab-admin-docker-release-gates/admin-cutter-compatibility-proof-20260628T003211Z.json |
| artifact-admin-docker-staging-runbook-present | artifact | pass | yes | yes | yes | .local-dev/admin-docker-github-runs/28306384634/mixlab-admin-docker-release-gates/admin-docker-staging-runbook-20260628T003310Z.json |
| artifact-admin-docker-release-readiness-summary-present | artifact | pass | yes | yes | yes | .local-dev/admin-docker-github-runs/28306384634/mixlab-admin-docker-release-gates/admin-docker-release-readiness-summary-20260628T003310Z.json |
| release-boundary-does-not-approve-deploy | release-boundary | pass | yes | yes | yes | staging.docker_deploy_allowed=false, release.docker_upload_allowed=false |
| local-docker-smoke-passed | candidate | pass | yes | yes | yes | local_smoke_passed=true, status=accepted |
| local-smoke-build-identity-current | candidate | pass | yes | yes | yes | image_tag=5c0e8dfe5d1e8621a8bdb1e14524349a283af28d, build_sha=5c0e8dfe5d1e8621a8bdb1e14524349a283af28d |
| candidate-derived-from-local-smoke | candidate | pass | yes | yes | yes | source.kind=local-smoke-report, source.local_smoke_passed=true |
| candidate-contract-ready | candidate | pass | yes | yes | yes | candidate_contract_ready=true, status=ready-for-candidate-review |
| candidate-build-matches-smoke | candidate | pass | yes | yes | yes | candidate.image_tag=5c0e8dfe5d1e8621a8bdb1e14524349a283af28d, smoke.image_tag=5c0e8dfe5d1e8621a8bdb1e14524349a283af28d, candidate.build_sha=5c0e8dfe5d1e8621a8bdb1e14524349a283af28d, smoke.build_sha=5c0e8dfe5d1e8621a8bdb1e14524349a283af28d |
| target-tag-matches-smoked-image | image | pass | yes | yes | yes | target=5c0e8dfe5d1e8621a8bdb1e14524349a283af28d, smoke.image_tag=5c0e8dfe5d1e8621a8bdb1e14524349a283af28d, runbook.target_tag_matches_local_smoke=true |
| image-push-explicitly-approved | staging | blocked | no | yes | yes | image_push_approval.accepted=false |
| current-and-rollback-tags-provided | staging | blocked | no | yes | yes | current=<missing>, rollback=<missing> |
| staging-runbook-ready | staging | blocked | no | yes | yes | staging_review_ready=false, blockers=current-image-tag-provided, rollback-image-tag-provided, target-differs-from-current, rollback-tag-matches-current, image-push-explicitly-approved, parity-report-blockers-clear, worker-env-proof-accepted, cutter-compatibility-proof-accepted |

## Blockers

- Candidate artifact blockers: none
- Staging handoff blockers: image-push-explicitly-approved, current-and-rollback-tags-provided, staging-runbook-ready
- Docker deploy blockers: image-push-explicitly-approved, current-and-rollback-tags-provided, staging-runbook-ready

## Next Actions

- For staging handoff, rerun workflow_dispatch with push_images=true and archive the explicit push approval in the staging runbook.
- Provide current_image_tag and rollback_image_tag, and require rollback to equal the current production image tag.
- Clear staging runbook blockers before treating the GitHub artifact as staging-handoff ready.
- Keep Docker deploy blocked until release readiness blockers are resolved in a separate release decision.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260628T003646Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260628T003646Z.md
