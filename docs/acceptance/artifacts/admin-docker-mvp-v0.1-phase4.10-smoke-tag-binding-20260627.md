# Admin Docker MVP v0.1 Phase 4.10 - Smoke Tag Binding

Date: 2026-06-27

## Objective

Prevent the staging runbook from mixing evidence across different builds.

After Phase 4.9, staging required explicit image-push approval. This phase adds a second evidence link: the target image tag selected for staging must match the image tag recorded by the accepted local Docker smoke report.

## Scope

Implemented:

- `scripts/acceptance/admin-docker-local-smoke.ts`
  - Records `build_identity.image_tag`.
  - Records `build_identity.build_sha`.
  - Records `build_identity.build_version`.
  - Records `build_identity.mvp_mode`.
  - Prints build identity in the Markdown report.
- `scripts/acceptance/admin-docker-local-smoke.test.ts`
  - Verifies blocked and accepted reports preserve build identity.
- `scripts/acceptance/admin-docker-staging-runbook.ts`
  - Reads the local Docker smoke report.
  - Adds the staging source `local_docker_smoke_report`.
  - Adds gate `local-docker-smoke-passed`.
  - Adds gate `target-tag-matches-smoked-image`.
  - Blocks staging if `MIXLAB_DOCKER_TARGET_IMAGE_TAG` differs from `build_identity.image_tag`.
- `scripts/acceptance/admin-docker-staging-runbook.test.ts`
  - Verifies staging can only become ready when the target tag matches the smoked image tag.
  - Verifies a mismatched target tag remains blocked.
- `scripts/acceptance/admin-docker-release-readiness-summary.ts`
  - Adds next action for the smoke/tag mismatch.
- `scripts/acceptance/admin-docker-release-readiness-summary.test.ts`
  - Verifies the summary tells the operator to use `build_identity.image_tag`.

Not implemented:

- No Docker image was pushed.
- No Docker container was started on this Mac.
- No NAS container was restarted.
- No NAS data, Cutter release, Cutter index, or worker flag was changed.

## Generated Evidence

Latest local Docker smoke:

- JSON: `docs/acceptance/artifacts/admin-docker-local-smoke-20260627T193625Z.json`
- Markdown: `docs/acceptance/artifacts/admin-docker-local-smoke-20260627T193625Z.md`

Latest staging runbook:

- JSON: `docs/acceptance/artifacts/admin-docker-staging-runbook-20260627T193630Z.json`
- Markdown: `docs/acceptance/artifacts/admin-docker-staging-runbook-20260627T193630Z.md`

Latest release readiness summary:

- JSON: `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260627T193639Z.json`
- Markdown: `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260627T193639Z.md`

Key result:

- `local_smoke_passed=false` because this Mac does not have Docker CLI.
- `build_identity.image_tag=local-admin-docker-mvp-v0.1` is now recorded.
- `target_tag_matches_local_smoke=false` because no staging target tag was provided.
- Staging blockers now include `local-docker-smoke-passed` and `target-tag-matches-smoked-image`.
- Release readiness remains `blocked` and `docker_upload_allowed=false`.

## Verification

Passed:

```bash
npm run validate:admin-docker-local-smoke
npm run validate:admin-docker-staging-runbook
npm run validate:admin-docker-release-readiness-summary
node --test --import tsx scripts/acceptance/admin-docker-local-smoke.test.ts scripts/acceptance/admin-docker-staging-runbook.test.ts scripts/acceptance/admin-docker-release-readiness-summary.test.ts scripts/acceptance/target-evidence.test.ts
npm run audit:delivery-readiness
npm run typecheck
git diff --check
```

Verification notes:

- Focused tests: 85 passed.
- Delivery readiness audit: `ok=true`.
- Remaining target gates are still `ACC-008` and `ACC-009`.
- TypeScript typecheck passed.
- `git diff --check` passed.

## Release Position

This phase still does not make the candidate deployable. It makes the release path safer by requiring this chain:

```text
local smoke passed
-> smoke report records build_identity.image_tag
-> GitHub workflow manually pushed that exact tag
-> staging runbook target tag equals the smoked image tag
-> release readiness summary remains non-deploy until live/staging proofs pass
```

The next real blocker is environmental, not code-only: the local Docker smoke must run on a Docker-capable machine or CI runner, and then staging must use that exact smoked tag.
