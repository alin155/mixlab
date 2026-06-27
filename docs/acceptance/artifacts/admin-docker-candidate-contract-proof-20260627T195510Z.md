# Admin Docker Candidate Contract Proof

Generated: 2026-06-27T19:55:10.100Z

Mode: admin-docker-candidate-contract-proof

Result: blocked

Candidate contract ready: no

Docker upload allowed: no

Staging approved: no

This proof uses only GET request evidence from explicit candidate Web/API target roots. When source is local-smoke-report, the GET evidence is reused from the archived local Docker smoke report. It does not run Docker, build images, push images, restart containers, enable workers, write NAS files, repair usage-events, recover processing jobs, publish indexes, run Windows Runner, launch Cutter, or change Cutter protocols.

## Source

- Source kind: local-smoke-report
- Source report: docs/acceptance/artifacts/admin-docker-local-smoke-20260627T194719Z.json
- Local smoke passed: false
- Local smoke status: blocked
- Local smoke blockers: explicit-run-requested, docker-cli-available, docker-compose-available

## Target

- Base URL configured: yes
- Web base URL: http://127.0.0.1:18081
- Web normalized base URL: http://127.0.0.1:18081
- Web target kind: local-loopback-candidate
- Web safe to probe: yes
- Web target classification: Candidate target is local to the current machine and is allowed only as local candidate proof.
- Web target notes: This may prove local candidate API shape.; It is not NAS Docker live evidence and cannot replace admin-docker-release-live-readonly.
- API base URL configured: no
- API base URL: inherits Web base URL
- API normalized base URL: http://127.0.0.1:18081
- API target kind: local-loopback-candidate
- API safe to probe: yes
- API target classification: Candidate target is local to the current machine and is allowed only as local candidate proof.
- API target notes: This may prove local candidate API shape.; It is not NAS Docker live evidence and cannot replace admin-docker-release-live-readonly.
- Split API target: no
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
- Blocked: 9
- Candidate review blockers: candidate-proof-source-accepted, candidate-admin-web-root, candidate-current-admin-api-contract, candidate-version-health-contract, candidate-disk-protection-contract, candidate-usage-events-repair-contract, candidate-processing-recovery-contract, candidate-admin-worker-env-proof-contract, candidate-cutter-compatibility-proof-contract
- Docker upload blockers: candidate-proof-source-accepted, candidate-not-nas-live-evidence, candidate-admin-web-root, candidate-current-admin-api-contract, candidate-version-health-contract, candidate-disk-protection-contract, candidate-usage-events-repair-contract, candidate-processing-recovery-contract, candidate-admin-worker-env-proof-contract, candidate-cutter-compatibility-proof-contract, candidate-does-not-approve-upload

## Requests

| Probe | Target | Base URL | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- | --- | --- |
none | n/a | n/a | n/a | n/a | n/a | n/a | n/a

## Gates

| Gate | Category | Status | Blocks Candidate Review | Blocks Docker Upload | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
candidate-proof-no-side-effects | safety | pass | no | no | The proof reuses GET-only endpoint observations from the archived local Docker smoke report and never starts Docker, enables workers, writes NAS files, repairs usage-events, recovers jobs, publishes indexes, or changes Cutter protocols. | n/a
candidate-proof-source-accepted | safety | blocked | yes | yes | Derived from local smoke report docs/acceptance/artifacts/admin-docker-local-smoke-20260627T194719Z.json; local_smoke_passed=false, status=blocked, blockers=explicit-run-requested, docker-cli-available, docker-compose-available. | The local Docker smoke report must have local_smoke_passed=true before it can supply candidate contract evidence.
candidate-target-configured | target | pass | no | yes | Candidate target was supplied explicitly. | n/a
candidate-target-shape | target | pass | no | yes | local-loopback-candidate: Candidate target is local to the current machine and is allowed only as local candidate proof. | n/a
candidate-api-target-shape | target | pass | no | yes | inherited-web-target: Candidate target is local to the current machine and is allowed only as local candidate proof. | n/a
candidate-not-nas-live-evidence | release-boundary | pass | no | yes | This report always sets nas_live_evidence=false and cannot replace admin-docker-release-live-readonly. | Run the separate NAS live-readonly probe after a staged target exists.
candidate-probe-get-only | safety | pass | no | yes | methods=none | n/a
candidate-admin-web-root | candidate-api | blocked | yes | yes | request not run | GET / must return an Admin Web response from the candidate target.
candidate-current-admin-api-contract | candidate-api | blocked | yes | yes | auth=request not run; release_gates=request not run; data_loading=request not run | Candidate must expose /api/admin/auth/status, /api/admin/release-gates, and /api/admin/data-loading/plan.
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

- JSON: docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T195510Z.json
- Markdown: docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T195510Z.md
