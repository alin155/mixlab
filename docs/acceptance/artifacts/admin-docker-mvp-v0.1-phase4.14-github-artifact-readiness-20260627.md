# Admin Docker MVP v0.1 Phase 4.14 - GitHub Artifact Readiness Gate

Date: 2026-06-27

## Goal

Add a machine-readable gate for the downloaded `mixlab-admin-docker-release-gates` GitHub Actions artifact so the Admin Docker MVP candidate can be reviewed without manually opening every release-gate report.

This phase does not deploy Docker, contact NAS, mutate PublicLibrary, start workers, or validate Windows Cutter directly. It only reads archived JSON reports.

## Changes

- Added `scripts/acceptance/admin-docker-github-artifact-readiness.ts`.
  - Reads the latest release-gate JSON reports from an artifact directory.
  - Separates `github_candidate_artifact_ready` from `staging_handoff_ready`.
  - Always writes `docker_deploy_allowed:false`.
  - Fails if any upstream report tries to approve Docker deploy/upload.
  - Blocks candidate readiness when local smoke did not pass, build identity is a local placeholder, candidate proof was not derived from local smoke, candidate proof is not ready, candidate build identity does not match smoke, or staging target tag does not match the smoked image.
  - Blocks staging handoff until image push approval and current/rollback tags are explicit and the staging runbook is ready.
- Added `scripts/acceptance/admin-docker-github-artifact-readiness.test.ts`.
- Added `validate:admin-docker-github-artifact-readiness` to `package.json`.
- Updated `.github/workflows/docker-admin.yml`.
  - Runs the new validator after staging runbook and release readiness summary generation.
  - Uploads `admin-docker-github-artifact-readiness-*.json` and `.md` into `mixlab-admin-docker-release-gates`.
- Updated `scripts/acceptance/delivery-readiness.ts` and `scripts/acceptance/target-evidence.test.ts` so CI and delivery audits require the new gate to stay wired.

## Local Artifact Result

The current Mac-local artifact set remains intentionally blocked:

- Generated JSON: `docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260627T201432Z.json`
- Generated Markdown: `docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260627T201432Z.md`
- `github_candidate_artifact_ready:false`
- `staging_handoff_ready:false`
- `docker_deploy_allowed:false`
- `failed:0`

Main blockers are expected in this environment:

- local Docker smoke has not passed on a Docker-capable runner
- local smoke build identity is still the placeholder local identity
- candidate proof is not ready because it was derived from a blocked local smoke report
- staging image push approval and current/rollback tags are not provided

## Verification

- `node --test --import tsx scripts/acceptance/admin-docker-github-artifact-readiness.test.ts`
- `node --test --import tsx scripts/acceptance/target-evidence.test.ts`
- `npm run audit:delivery-readiness`
- `npm run validate:admin-docker-github-artifact-readiness`
- `node --test --import tsx scripts/acceptance/admin-docker-github-artifact-readiness.test.ts scripts/acceptance/admin-docker-candidate-contract-proof.test.ts scripts/acceptance/admin-docker-local-smoke.test.ts scripts/acceptance/admin-docker-staging-runbook.test.ts scripts/acceptance/admin-docker-release-readiness-summary.test.ts scripts/acceptance/target-evidence.test.ts`
- `npm run typecheck`
- `git diff --check`

## Remaining Gate

This phase makes GitHub artifact review deterministic, but it still does not complete the Admin Docker MVP release goal. The next required evidence is a real Docker-capable GitHub Actions run that produces `mixlab-admin-docker-release-gates`, followed by reading the generated `admin-docker-github-artifact-readiness-*.json` result.
