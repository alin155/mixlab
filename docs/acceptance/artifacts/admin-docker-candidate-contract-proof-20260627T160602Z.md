# Admin Docker Candidate Contract Proof

Generated: 2026-06-27T16:06:02.731Z

Mode: admin-docker-candidate-contract-proof

Result: blocked

Candidate contract ready: no

Docker upload allowed: no

Staging approved: no

This proof sends only GET requests to an explicit candidate target. It does not run Docker, build images, push images, restart containers, enable workers, write NAS files, repair usage-events, recover processing jobs, publish indexes, run Windows Runner, launch Cutter, or change Cutter protocols.

## Target

- Base URL configured: yes
- Base URL: http://127.0.0.1:5176
- Normalized base URL: http://127.0.0.1:5176
- Target kind: local-loopback-candidate
- Safe to probe: yes
- Target classification: Candidate target is local to the current machine and is allowed only as local candidate proof.
- Target notes: This may prove local candidate API shape.; It is not NAS Docker live evidence and cannot replace admin-docker-release-live-readonly.
- Session token present: no
- NAS live evidence: no

## Observed

- Auth mode: unknown
- Authenticated: null
- Library root: unknown
- Current index: unknown
- Build: sha unknown, version unknown, image tag unknown
- Release gates: overall unknown, allowed null

## Summary

- Passed: 7
- Failed: 0
- Blocked: 7
- Candidate review blockers: candidate-current-admin-api-contract, candidate-version-health-contract, candidate-disk-protection-contract, candidate-usage-events-repair-contract, candidate-processing-recovery-contract, candidate-admin-worker-env-proof-contract, candidate-cutter-compatibility-proof-contract
- Docker upload blockers: candidate-not-nas-live-evidence, candidate-current-admin-api-contract, candidate-version-health-contract, candidate-disk-protection-contract, candidate-usage-events-repair-contract, candidate-processing-recovery-contract, candidate-admin-worker-env-proof-contract, candidate-cutter-compatibility-proof-contract, candidate-does-not-approve-upload

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
admin_web_root | GET / | 200 | yes | 27.0ms | none
auth_status | GET /api/admin/auth/status | 404 | no | 9.6ms | none
library_status | GET /api/admin/library/status | 404 | no | 8.4ms | none
release_gates | GET /api/admin/release-gates | 404 | no | 2.4ms | none
data_loading_plan | GET /api/admin/data-loading/plan | 404 | no | 3.5ms | none

## Gates

| Gate | Category | Status | Blocks Candidate Review | Blocks Docker Upload | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
candidate-proof-no-side-effects | safety | pass | no | no | The proof uses GET requests only and never starts Docker, enables workers, writes NAS files, repairs usage-events, recovers jobs, publishes indexes, or changes Cutter protocols. | n/a
candidate-target-configured | target | pass | no | yes | Candidate target was supplied explicitly. | n/a
candidate-target-shape | target | pass | no | yes | local-loopback-candidate: Candidate target is local to the current machine and is allowed only as local candidate proof. | n/a
candidate-not-nas-live-evidence | release-boundary | pass | no | yes | This report always sets nas_live_evidence=false and cannot replace admin-docker-release-live-readonly. | Run the separate NAS live-readonly probe after a staged target exists.
candidate-probe-get-only | safety | pass | no | yes | methods=GET,GET,GET,GET,GET | n/a
candidate-admin-web-root | candidate-api | pass | no | yes | HTTP 200, ok, 27ms | GET / must return an Admin Web response from the candidate target.
candidate-current-admin-api-contract | candidate-api | blocked | yes | yes | auth=HTTP 404, failed , 9.6ms; release_gates=HTTP 404, failed , 2.4ms; data_loading=HTTP 404, failed , 3.5ms | Candidate must expose /api/admin/auth/status, /api/admin/release-gates, and /api/admin/data-loading/plan.
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

- JSON: docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T160602Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T160602Z.md
