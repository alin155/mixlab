# Admin Docker Candidate Contract Proof

Generated: 2026-06-27T19:01:02.527Z

Mode: admin-docker-candidate-contract-proof

Result: blocked

Candidate contract ready: no

Docker upload allowed: no

Staging approved: no

This proof sends only GET requests to explicit candidate Web/API target roots. It does not run Docker, build images, push images, restart containers, enable workers, write NAS files, repair usage-events, recover processing jobs, publish indexes, run Windows Runner, launch Cutter, or change Cutter protocols.

## Target

- Base URL configured: yes
- Web base URL: http://127.0.0.1:5176
- Web normalized base URL: http://127.0.0.1:5176
- Web target kind: local-loopback-candidate
- Web safe to probe: yes
- Web target classification: Candidate target is local to the current machine and is allowed only as local candidate proof.
- Web target notes: This may prove local candidate API shape.; It is not NAS Docker live evidence and cannot replace admin-docker-release-live-readonly.
- API base URL configured: yes
- API base URL: http://127.0.0.1:3889
- API normalized base URL: http://127.0.0.1:3889
- API target kind: local-loopback-candidate
- API safe to probe: yes
- API target classification: Candidate target is local to the current machine and is allowed only as local candidate proof.
- API target notes: This may prove local candidate API shape.; It is not NAS Docker live evidence and cannot replace admin-docker-release-live-readonly.
- Split API target: yes
- Session token present: no
- NAS live evidence: no

## Observed

- Auth mode: password
- Authenticated: false
- Library root: unknown
- Current index: unknown
- Build: sha unknown, version unknown, image tag unknown
- Release gates: overall unknown, allowed null

## Summary

- Passed: 8
- Failed: 0
- Blocked: 7
- Candidate review blockers: candidate-current-admin-api-contract, candidate-version-health-contract, candidate-disk-protection-contract, candidate-usage-events-repair-contract, candidate-processing-recovery-contract, candidate-admin-worker-env-proof-contract, candidate-cutter-compatibility-proof-contract
- Docker upload blockers: candidate-not-nas-live-evidence, candidate-current-admin-api-contract, candidate-version-health-contract, candidate-disk-protection-contract, candidate-usage-events-repair-contract, candidate-processing-recovery-contract, candidate-admin-worker-env-proof-contract, candidate-cutter-compatibility-proof-contract, candidate-does-not-approve-upload

## Requests

| Probe | Target | Base URL | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- | --- | --- |
admin_web_root | web | http://127.0.0.1:5176 | GET / | 200 | yes | 26.1ms | none
auth_status | api | http://127.0.0.1:3889 | GET /api/admin/auth/status | 200 | yes | 9.8ms | none
library_status | api | http://127.0.0.1:3889 | GET /api/admin/library/status | 401 | no | 0.8ms | login_required
release_gates | api | http://127.0.0.1:3889 | GET /api/admin/release-gates | 401 | no | 0.5ms | login_required
data_loading_plan | api | http://127.0.0.1:3889 | GET /api/admin/data-loading/plan | 401 | no | 0.5ms | login_required

## Gates

| Gate | Category | Status | Blocks Candidate Review | Blocks Docker Upload | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
candidate-proof-no-side-effects | safety | pass | no | no | The proof uses GET requests only and never starts Docker, enables workers, writes NAS files, repairs usage-events, recovers jobs, publishes indexes, or changes Cutter protocols. | n/a
candidate-target-configured | target | pass | no | yes | Candidate target was supplied explicitly. | n/a
candidate-target-shape | target | pass | no | yes | local-loopback-candidate: Candidate target is local to the current machine and is allowed only as local candidate proof. | n/a
candidate-api-target-shape | target | pass | no | yes | local-loopback-candidate: Candidate target is local to the current machine and is allowed only as local candidate proof. | n/a
candidate-not-nas-live-evidence | release-boundary | pass | no | yes | This report always sets nas_live_evidence=false and cannot replace admin-docker-release-live-readonly. | Run the separate NAS live-readonly probe after a staged target exists.
candidate-probe-get-only | safety | pass | no | yes | methods=GET,GET,GET,GET,GET | n/a
candidate-admin-web-root | candidate-api | pass | no | yes | HTTP 200, ok, 26.1ms | GET / must return an Admin Web response from the candidate target.
candidate-current-admin-api-contract | candidate-api | blocked | yes | yes | auth=HTTP 200, ok, 9.8ms; release_gates=HTTP 401, login_required 请先登录管理端, 0.5ms; data_loading=HTTP 401, login_required 请先登录管理端, 0.5ms | Candidate must expose /api/admin/auth/status, /api/admin/release-gates, and /api/admin/data-loading/plan.
candidate-version-health-contract | candidate-contract | blocked | yes | yes | version_health_parity contract is missing or incomplete. | release-gates must expose version_health_parity with expected services, GET preflight endpoints, external proof requirements, and no ready/Cutter mutations.
candidate-disk-protection-contract | candidate-contract | blocked | yes | yes | disk_space_protection contract is missing or incomplete. | release-gates must expose disk_space_protection with GET preflight endpoints and no worker/ready/Cutter mutations.
candidate-usage-events-repair-contract | candidate-contract | blocked | yes | yes | usage_events_repair contract is missing or incomplete. | release-gates must expose usage_events_repair dry-run/apply commands with usage-events-only scope and no ready/Cutter mutations.
candidate-processing-recovery-contract | candidate-contract | blocked | yes | yes | processing_recovery contract is missing or incomplete. | release-gates must expose processing_recovery preflight scope, idle-supervisor requirement, and no ready/Cutter mutations.
candidate-admin-worker-env-proof-contract | candidate-contract | blocked | yes | yes | admin_worker_env_proof contract is missing or incomplete. | release-gates must expose admin_worker_env_proof with disabled standalone worker flags, /data/PublicLibrary roots, proof command, no secrets, no worker start, and no ready/Cutter mutations.
candidate-cutter-compatibility-proof-contract | candidate-contract | blocked | yes | yes | cutter_compatibility_proof contract is missing or incomplete. | release-gates must expose cutter_compatibility_proof with Windows acceptance and real-cut requirements, staged-candidate boundary, and no ready/Cutter mutations.
candidate-does-not-approve-upload | release-boundary | pass | no | yes | docker_upload_allowed=false and staging_approved=false are hard-coded in this report. | Docker upload requires separate NAS live-readonly, parity, worker, Cutter, staging-tag, rollback, disk, and release decision gates.

## Scope

This is candidate contract proof only. It cannot replace NAS live-readonly evidence, admin-worker external proof, Cutter compatibility proof, staging runbook tags, rollback evidence, or a separate release decision.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T190102Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T190102Z.md
