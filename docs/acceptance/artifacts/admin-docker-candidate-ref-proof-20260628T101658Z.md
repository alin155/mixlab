# Admin Docker Candidate Ref Proof

Generated: 2026-06-28T10:16:58.832Z
Mode: admin-docker-candidate-ref-proof
Result: accepted
Candidate ref proof accepted: yes
Docker deploy allowed: no

## Sources

- Artifact dir: .local-dev/admin-docker-github-runs/28318925718/mixlab-admin-docker-release-gates
- Local smoke report: .local-dev/admin-docker-github-runs/28318925718/mixlab-admin-docker-release-gates/admin-docker-local-smoke-20260628T101411Z.json
- Staging runbook report: .local-dev/admin-docker-github-runs/28318925718/mixlab-admin-docker-release-gates/admin-docker-staging-runbook-20260628T101612Z.json
- GitHub run id: 28318925718
- Remote tag ref: refs/tags/admin-docker-candidate-b062bc387c1fdb2a391320c1c36233b782cb000a

## Candidate

- Expected SHA: b062bc387c1fdb2a391320c1c36233b782cb000a
- Expected tag: admin-docker-candidate-b062bc387c1fdb2a391320c1c36233b782cb000a
- Remote tag SHA: b062bc387c1fdb2a391320c1c36233b782cb000a
- Tag points to expected SHA: yes

## GitHub Run

- Run URL: https://github.com/alin155/mixlab/actions/runs/28318925718
- Head branch: admin-docker-candidate-b062bc387c1fdb2a391320c1c36233b782cb000a
- Head SHA: b062bc387c1fdb2a391320c1c36233b782cb000a
- Status: completed
- Conclusion: success

## Observations

- Local smoke passed: true
- Local smoke image tag: b062bc387c1fdb2a391320c1c36233b782cb000a
- Local smoke build SHA: b062bc387c1fdb2a391320c1c36233b782cb000a
- Staging target image tag: b062bc387c1fdb2a391320c1c36233b782cb000a
- Image push approval accepted: false
- Staging Docker deploy allowed: false

## Gates

| Gate | Category | Status | Blocks Ref Proof | Blocks Deploy | Evidence |
| --- | --- | --- | --- | --- | --- |
candidate-ref-proof-no-side-effects | safety | pass | no | no | Reads git tag, GitHub run metadata, and downloaded artifacts only; does not push images, contact NAS, restart containers, enable workers, or write NAS data.
candidate-sha-provided | candidate-ref | pass | no | yes | b062bc387c1fdb2a391320c1c36233b782cb000a
candidate-tag-pins-sha-name | candidate-ref | pass | no | yes | tag=admin-docker-candidate-b062bc387c1fdb2a391320c1c36233b782cb000a, expected=admin-docker-candidate-b062bc387c1fdb2a391320c1c36233b782cb000a
remote-tag-points-to-candidate-sha | candidate-ref | pass | no | yes | remote_tag_sha=b062bc387c1fdb2a391320c1c36233b782cb000a, expected=b062bc387c1fdb2a391320c1c36233b782cb000a
github-run-succeeded | github-run | pass | no | yes | status=completed, conclusion=success, run=https://github.com/alin155/mixlab/actions/runs/28318925718
github-run-head-matches-candidate-tag | github-run | pass | no | yes | run.headBranch=admin-docker-candidate-b062bc387c1fdb2a391320c1c36233b782cb000a, expected_tag=admin-docker-candidate-b062bc387c1fdb2a391320c1c36233b782cb000a
github-run-head-matches-candidate-sha | github-run | pass | no | yes | run.headSha=b062bc387c1fdb2a391320c1c36233b782cb000a, expected_sha=b062bc387c1fdb2a391320c1c36233b782cb000a
local-docker-smoke-passed | smoke | pass | no | yes | local_smoke_passed=true
local-smoke-identity-matches-candidate | smoke | pass | no | yes | image_tag=b062bc387c1fdb2a391320c1c36233b782cb000a, build_sha=b062bc387c1fdb2a391320c1c36233b782cb000a, expected=b062bc387c1fdb2a391320c1c36233b782cb000a
staging-target-matches-candidate | release-boundary | pass | no | yes | staging_target=b062bc387c1fdb2a391320c1c36233b782cb000a, expected=b062bc387c1fdb2a391320c1c36233b782cb000a
tag-dry-run-does-not-approve-push-or-deploy | release-boundary | pass | yes | yes | image_push_approval.accepted=false, staging.docker_deploy_allowed=false

## Summary

- Candidate ref blockers: none
- Docker deploy blockers: none

## Next Actions

- Candidate release ref admin-docker-candidate-b062bc387c1fdb2a391320c1c36233b782cb000a is pinned to b062bc387c1fdb2a391320c1c36233b782cb000a and has a successful push_images=false dry-run.
- Do not run push_images=true until NAS image proof, current/rollback tags, disk proof, worker proof, Cutter proof, and explicit release approval are present.
- After any push_images=true run, regenerate GitHub run artifact, staging runbook, live-readonly, admin-worker env proof, and Cutter compatibility proof.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T101658Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260628T101658Z.md
