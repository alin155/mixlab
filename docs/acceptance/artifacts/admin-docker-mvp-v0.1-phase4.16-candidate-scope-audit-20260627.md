# Admin Docker MVP v0.1 Phase 4.16 - Candidate Scope Audit

Date: 2026-06-27

## Goal

Prepare the current Admin Docker MVP worktree for a safe remote Docker workflow run by separating candidate code, acceptance evidence, local generated artifacts, and risky paths.

This phase does not commit, push, deploy Docker, contact NAS, start workers, mutate PublicLibrary, or validate Windows Cutter directly.

## Changes

- Added `scripts/acceptance/admin-docker-candidate-scope.ts`.
  - Reads `git status --porcelain=v1`.
  - Buckets dirty paths into:
    - `mvp_candidate_code`
    - `planning_docs`
    - `acceptance_evidence`
    - `local_generated_artifact`
    - `cutter_impact_review`
    - `unknown_review`
  - Produces machine decisions:
    - `candidate_scope_review_ready`
    - `candidate_selective_commit_ready`
    - `remote_workflow_proof_possible_from_current_worktree`
  - Keeps local/generated directories out of the candidate commit.
- Added `scripts/acceptance/admin-docker-candidate-scope.test.ts`.
- Added `audit:admin-docker-candidate-scope` to `package.json`.
- Updated `scripts/acceptance/delivery-readiness.ts` so the scope audit remains part of the delivery toolchain.

## Current Result

Generated current worktree report:

- JSON: `docs/acceptance/artifacts/admin-docker-candidate-scope-20260627T202831Z.json`
- Markdown: `docs/acceptance/artifacts/admin-docker-candidate-scope-20260627T202831Z.md`

Summary:

```json
{
  "total_changed_paths": 1111,
  "candidate_scope_review_ready": true,
  "candidate_selective_commit_ready": true,
  "remote_workflow_proof_possible_from_current_worktree": false,
  "buckets": {
    "mvp_candidate_code": 351,
    "planning_docs": 7,
    "acceptance_evidence": 747,
    "local_generated_artifact": 6,
    "cutter_impact_review": 0,
    "unknown_review": 0
  },
  "blockers": [
    "current-worktree-dirty",
    "local-generated-artifacts-must-be-excluded-or-cleaned"
  ]
}
```

Interpretation:

- The candidate scope is now reviewable.
- A selective candidate commit is feasible.
- No unknown paths remain.
- No Cutter runtime/code path currently requires separate review.
- The remaining non-candidate paths are local/generated directories:
  - `.local-dev/`
  - `.playwright-cli/`
  - `apps/cutter-desktop/src-tauri/gen/`
  - `apps/cutter-web/public/local-clips/`
  - `captures/`
  - `output/`

## Verification

- `node --test --import tsx scripts/acceptance/admin-docker-candidate-scope.test.ts`
- `npm run audit:admin-docker-candidate-scope`
- `npm run audit:delivery-readiness`

## Remaining Gate

The next step is no longer broad exploration. The next step is to create a selective candidate commit from:

- `mvp_candidate_code`
- intentional `planning_docs`
- intentional `acceptance_evidence`

while excluding `local_generated_artifact`.

After that candidate commit is pushed, run the `Build Admin Docker Images` GitHub workflow and collect the release-gates artifact with:

```bash
MIXLAB_ADMIN_DOCKER_GITHUB_RUN_ID=<run-id> npm run collect:admin-docker-github-run-artifact
```

The Admin Docker MVP goal remains incomplete until the remote Docker workflow, NAS staging/read-only checks, worker env proof, and Cutter compatibility gates pass for the current candidate.
