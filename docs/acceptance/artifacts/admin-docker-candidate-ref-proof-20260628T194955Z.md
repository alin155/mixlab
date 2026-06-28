# Admin Docker Candidate Ref Proof

Generated: 2026-06-28T19:49:55.078Z
Mode: admin-docker-candidate-ref-proof
Result: accepted
Candidate ref proof accepted: yes
Docker deploy allowed: no

## Sources

- Artifact dir: .local-dev/admin-docker-github-runs/28333837849/mixlab-admin-docker-release-gates
- Local smoke report: .local-dev/admin-docker-github-runs/28333837849/mixlab-admin-docker-release-gates/admin-docker-local-smoke-20260628T194615Z.json
- Staging runbook report: .local-dev/admin-docker-github-runs/28333837849/mixlab-admin-docker-release-gates/admin-docker-staging-runbook-20260628T194812Z.json
- GitHub run id: 28333837849
- Remote tag ref: refs/tags/admin-docker-candidate-f9aa9bc7dea187dc3029c90389d5c3c08938dd58

## Candidate

- Expected SHA: f9aa9bc7dea187dc3029c90389d5c3c08938dd58
- Expected tag: admin-docker-candidate-f9aa9bc7dea187dc3029c90389d5c3c08938dd58
- Remote tag SHA: f9aa9bc7dea187dc3029c90389d5c3c08938dd58
- Tag points to expected SHA: yes

## GitHub Run

- Run URL: https://github.com/alin155/mixlab/actions/runs/28333837849
- Head branch: admin-docker-candidate-f9aa9bc7dea187dc3029c90389d5c3c08938dd58
- Head SHA: f9aa9bc7dea187dc3029c90389d5c3c08938dd58
- Status: completed
- Conclusion: success

## Observations

- Local smoke passed: true
- Local smoke image tag: f9aa9bc7dea187dc3029c90389d5c3c08938dd58
- Local smoke build SHA: f9aa9bc7dea187dc3029c90389d5c3c08938dd58
- Staging target image tag: f9aa9bc7dea187dc3029c90389d5c3c08938dd58
- Image push approval accepted: false
- Staging Docker deploy allowed: false

## Gates

| Gate | Category | Status | Blocks Ref Proof | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- |
candidate-ref-proof-no-side-effects | safety | pass | no | no | Reads git tag, GitHub run metadata, and downloaded artifacts only; does not push images, contact NAS, restart containers, enable workers, or write NAS data.
candidate-sha-provided | candidate-ref | pass | no | yes | f9aa9bc7dea187dc3029c90389d5c3c08938dd58
candidate-tag-pins-sha-name | candidate-ref | pass | no | yes | tag=admin-docker-candidate-f9aa9bc7dea187dc3029c90389d5c3c08938dd58, expected=admin-docker-candidate-f9aa9bc7dea187dc3029c90389d5c3c08938dd58
remote-tag-points-to-candidate-sha | candidate-ref | pass | no | yes | remote_tag_sha=f9aa9bc7dea187dc3029c90389d5c3c08938dd58, expected=f9aa9bc7dea187dc3029c90389d5c3c08938dd58
github-run-succeeded | github-run | pass | no | yes | status=completed, conclusion=success, run=https://github.com/alin155/mixlab/actions/runs/28333837849
github-run-head-matches-candidate-tag | github-run | pass | no | yes | run.headBranch=admin-docker-candidate-f9aa9bc7dea187dc3029c90389d5c3c08938dd58, expected_tag=admin-docker-candidate-f9aa9bc7dea187dc3029c90389d5c3c08938dd58
github-run-head-matches-candidate-sha | github-run | pass | no | yes | run.headSha=f9aa9bc7dea187dc3029c90389d5c3c08938dd58, expected_sha=f9aa9bc7dea187dc3029c90389d5c3c08938dd58
local-docker-smoke-passed | smoke | pass | no | yes | local_smoke_passed=true
local-smoke-identity-matches-candidate | smoke | pass | no | yes | image_tag=f9aa9bc7dea187dc3029c90389d5c3c08938dd58, build_sha=f9aa9bc7dea187dc3029c90389d5c3c08938dd58, expected=f9aa9bc7dea187dc3029c90389d5c3c08938dd58
staging-target-matches-candidate | release-boundary | pass | no | yes | staging_target=f9aa9bc7dea187dc3029c90389d5c3c08938dd58, expected=f9aa9bc7dea187dc3029c90389d5c3c08938dd58
tag-dry-run-does-not-approve-push-or-deploy | release-boundary | pass | yes | yes | image_push_approval.accepted=false, staging.docker_deploy_allowed=false

## Summary

- Candidate ref blockers: none
- Docker deploy blockers: none

## Next Actions

- Candidate release ref admin-docker-candidate-f9aa9bc7dea187dc3029c90389d5c3c08938dd58 is pinned to f9aa9bc7dea187dc3029c90389d5c3c08938dd58 and has a successful push_images=false dry-run.
- Do not run push_images=true until NAS image proof, current/rollback tags, disk proof, worker proof, Cutter proof, and explicit release approval are present.
- After any push_images=true run, regenerate GitHub run artifact, staging runbook, live-readonly, admin-worker env proof, and Cutter compatibility proof.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T194955Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T194955Z.md
