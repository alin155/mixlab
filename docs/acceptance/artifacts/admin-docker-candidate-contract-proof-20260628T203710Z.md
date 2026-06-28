# Admin Docker Candidate Contract Proof

Generated: 2026-06-28T20:37:10.191Z

Mode: admin-docker-candidate-contract-proof

Result: ready-for-candidate-review

Candidate contract ready: yes

Docker upload allowed: no

Staging approved: no

This proof uses only GET request evidence from explicit candidate Web/API target roots. When source is local-smoke-report, the GET evidence is reused from the archived local Docker smoke report. It does not run Docker, build images, push images, restart containers, enable workers, write NAS files, repair usage-events, recover processing jobs, publish indexes, run Windows Runner, launch Cutter, or change Cutter protocols.

## Source

- Source kind: local-smoke-report
- Source report: .local-dev/admin-docker-release-gates/admin-docker-local-smoke-20260628T203603Z.json
- Local smoke passed: true
- Local smoke status: accepted
- Local smoke blockers: none

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

- Auth mode: disabled
- Authenticated: true
- Library root: /data/PublicLibrary
- Current index: unknown
- Build: sha 25fe2264de7b391a56e770a8acb6bf40ebec3863, version 25fe2264de7b391a56e770a8acb6bf40ebec3863, image tag 25fe2264de7b391a56e770a8acb6bf40ebec3863
- Release gates: overall attention, allowed false

## Summary

- Passed: 16
- Failed: 0
- Blocked: 0
- Candidate review blockers: none
- Docker upload blockers: candidate-not-nas-live-evidence, candidate-does-not-approve-upload

## Requests

| Probe | Target | Base URL | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- | --- | --- |
admin_web_root | web | http://127.0.0.1:18081 | GET / | 200 | yes | 7.3ms | none
auth_status | api | http://127.0.0.1:18081 | GET /api/admin/auth/status | 200 | yes | 7.5ms | none
library_status | api | http://127.0.0.1:18081 | GET /api/admin/library/status | 200 | yes | 5.3ms | none
release_gates | api | http://127.0.0.1:18081 | GET /api/admin/release-gates | 200 | yes | 30.1ms | none
data_loading_plan | api | http://127.0.0.1:18081 | GET /api/admin/data-loading/plan | 200 | yes | 4.3ms | none

## Gates

| Gate | Category | Status | Blocks Candidate Review | Blocks Docker Upload | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
candidate-proof-no-side-effects | safety | pass | no | no | The proof reuses GET-only endpoint observations from the archived local Docker smoke report and never starts Docker, enables workers, writes NAS files, repairs usage-events, recovers jobs, publishes indexes, or changes Cutter protocols. | n/a
candidate-proof-source-accepted | safety | pass | no | yes | Derived from local smoke report .local-dev/admin-docker-release-gates/admin-docker-local-smoke-20260628T203603Z.json; local_smoke_passed=true, status=accepted, blockers=none. | n/a
candidate-target-configured | target | pass | no | yes | Candidate target was supplied explicitly. | n/a
candidate-target-shape | target | pass | no | yes | local-loopback-candidate: Candidate target is local to the current machine and is allowed only as local candidate proof. | n/a
candidate-api-target-shape | target | pass | no | yes | inherited-web-target: Candidate target is local to the current machine and is allowed only as local candidate proof. | n/a
candidate-not-nas-live-evidence | release-boundary | pass | no | yes | This report always sets nas_live_evidence=false and cannot replace admin-docker-release-live-readonly. | Run the separate NAS live-readonly probe after a staged target exists.
candidate-probe-get-only | safety | pass | no | yes | methods=GET,GET,GET,GET,GET | n/a
candidate-admin-web-root | candidate-api | pass | no | yes | HTTP 200, ok, 7.3ms | GET / must return an Admin Web response from the candidate target.
candidate-current-admin-api-contract | candidate-api | pass | no | yes | auth/status, release-gates, and data-loading/plan responded. | Candidate must expose /api/admin/auth/status, /api/admin/release-gates, and /api/admin/data-loading/plan.
candidate-version-health-contract | candidate-contract | pass | no | yes | version_health_parity contract is complete. | release-gates must expose version_health_parity with expected services, GET preflight endpoints, external proof requirements, and no ready/Cutter mutations.
candidate-disk-protection-contract | candidate-contract | pass | no | yes | disk_space_protection contract is complete. | release-gates must expose disk_space_protection with GET preflight endpoints and no worker/ready/Cutter mutations.
candidate-usage-events-repair-contract | candidate-contract | pass | no | yes | usage_events_repair contract is complete. | release-gates must expose usage_events_repair dry-run/apply commands with usage-events-only scope and no ready/Cutter mutations.
candidate-processing-recovery-contract | candidate-contract | pass | no | yes | processing_recovery contract is complete. | release-gates must expose processing_recovery preflight scope, idle-supervisor requirement, and no ready/Cutter mutations.
candidate-admin-worker-env-proof-contract | candidate-contract | pass | no | yes | admin_worker_env_proof contract is complete. | release-gates must expose admin_worker_env_proof with disabled standalone worker flags, /data/PublicLibrary roots, proof command, no secrets, no worker start, and no ready/Cutter mutations.
candidate-cutter-compatibility-proof-contract | candidate-contract | pass | no | yes | cutter_compatibility_proof contract is complete. | release-gates must expose cutter_compatibility_proof with Windows acceptance and real-cut requirements, staged-candidate boundary, and no ready/Cutter mutations.
candidate-does-not-approve-upload | release-boundary | pass | no | yes | docker_upload_allowed=false and staging_approved=false are hard-coded in this report. | Docker upload requires separate NAS live-readonly, parity, worker, Cutter, staging-tag, rollback, disk, and release decision gates.

## Scope

This is candidate contract proof only. It cannot replace NAS live-readonly evidence, admin-worker external proof, Cutter compatibility proof, staging runbook tags, rollback evidence, or a separate release decision.

## Artifacts

- JSON: .local-dev/admin-docker-release-gates/admin-docker-candidate-contract-proof-20260628T203710Z.json
- Markdown: .local-dev/admin-docker-release-gates/admin-docker-candidate-contract-proof-20260628T203710Z.md
