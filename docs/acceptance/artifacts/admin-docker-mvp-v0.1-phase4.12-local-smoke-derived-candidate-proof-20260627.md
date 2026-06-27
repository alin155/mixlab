# Admin Docker MVP v0.1 Phase 4.12 - Local Smoke Derived Candidate Proof

Date: 2026-06-27

## Objective

Close the CI evidence gap between local Docker smoke and candidate contract proof.

Before this phase, the GitHub workflow could run local Docker smoke, then later run `validate:admin-docker-candidate-contract-proof` with empty candidate URLs. In a real CI run, the local smoke stack is torn down after the smoke script finishes, so candidate proof needed a durable way to reuse the exact GET endpoint observations already collected by local smoke.

## Scope

Implemented:

- `scripts/acceptance/admin-docker-candidate-contract-proof.ts`
  - Added explicit `MIXLAB_ADMIN_DOCKER_CANDIDATE_FROM_LOCAL_SMOKE=1` mode.
  - Reads `MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_REPORT` or the latest `admin-docker-local-smoke-*.json`.
  - Converts local smoke endpoint probes into candidate contract requests.
  - Adds a `source` section recording whether proof came from direct probing or a local smoke report.
  - Adds `candidate-proof-source-accepted`, which blocks candidate review unless `local_smoke_passed=true`.
  - Keeps `nas_live_evidence=false`, `docker_upload_allowed=false`, and `staging_approved=false`.
- `.github/workflows/docker-admin.yml`
  - Pre-staging candidate proof now sets `MIXLAB_ADMIN_DOCKER_CANDIDATE_FROM_LOCAL_SMOKE=1`.
- `scripts/acceptance/admin-docker-candidate-contract-proof.test.ts`
  - Covers accepted local smoke report -> candidate contract ready.
  - Covers blocked local smoke report -> candidate contract blocked.
- `scripts/acceptance/target-evidence.test.ts`
  - Locks the workflow env switch so CI does not regress to empty candidate target probing.

Not implemented:

- No Docker image was pushed.
- No Docker container was started on this Mac.
- No NAS Docker container was restarted or modified.
- No NAS file, Cutter release/index, worker flag, or ready asset was changed.

## Generated Evidence

Latest generated local CLI artifact:

- Candidate contract proof from latest local smoke: `docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T195510Z.json`
- Staging runbook consuming that candidate proof: `docs/acceptance/artifacts/admin-docker-staging-runbook-20260627T195805Z.json`
- Release readiness summary consuming that staging runbook: `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260627T195805Z.json`

Current result:

- `source.kind=local-smoke-report`
- `source.local_smoke_passed=false`
- `candidate_contract_ready=false`
- `docker_upload_allowed=false`
- `nas_live_evidence=false`

This is expected on this Mac because the latest local smoke remains blocked by missing Docker CLI/Compose:

- `explicit-run-requested`
- `docker-cli-available`
- `docker-compose-available`

## CI Effect

On a Docker-capable GitHub runner, the intended evidence chain is now:

```text
validate:admin-docker-local-smoke
  -> writes admin-docker-local-smoke-*.json with GET probes
validate:admin-docker-candidate-contract-proof
  -> reads that smoke report when MIXLAB_ADMIN_DOCKER_CANDIDATE_FROM_LOCAL_SMOKE=1
  -> becomes candidate_contract_ready only if local_smoke_passed=true and API contracts are complete
```

This avoids requiring the temporary local smoke compose stack to still be running after the smoke script has already performed cleanup.

## Verification

Passed:

```bash
node --test --import tsx scripts/acceptance/admin-docker-candidate-contract-proof.test.ts
node --test --import tsx scripts/acceptance/admin-docker-candidate-contract-proof.test.ts scripts/acceptance/admin-docker-local-smoke.test.ts scripts/acceptance/admin-docker-staging-runbook.test.ts scripts/acceptance/admin-docker-release-readiness-summary.test.ts scripts/acceptance/target-evidence.test.ts
npm run typecheck
MIXLAB_ADMIN_DOCKER_CANDIDATE_FROM_LOCAL_SMOKE=1 npm run validate:admin-docker-candidate-contract-proof
npm run validate:admin-docker-staging-runbook && npm run validate:admin-docker-release-readiness-summary
npm run audit:delivery-readiness
git diff --check
```

Key observed CLI behavior:

- The local-smoke-derived candidate proof used `docs/acceptance/artifacts/admin-docker-local-smoke-20260627T194719Z.json`.
- It exited successfully as a report generator.
- It remained blocked because the source smoke was blocked.
- The regenerated staging runbook and readiness summary consumed the new candidate proof and also remained blocked.
- It did not contact NAS, start Docker, write files outside acceptance artifacts, enable workers, publish indexes, or change Cutter protocols.

## Release Position

This phase improves the Docker MVP release evidence chain, but it does not make the MVP deployable by itself.

Remaining release blockers are still external/runtime gates:

- A Docker-capable CI or staging run must produce `local_smoke_passed=true`.
- A staged or live NAS target must expose the current Admin API contract.
- NAS worker env proof must be collected from the target environment.
- Cutter compatibility must be proven after a staged candidate exists.
- Current, target, rollback image tags and explicit push approval must be supplied.

The next meaningful step is to run the Admin Docker workflow on GitHub and inspect whether the local-smoke-derived candidate contract proof becomes `candidate_contract_ready=true` in the uploaded `mixlab-admin-docker-release-gates` artifact.
