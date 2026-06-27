# Admin Docker MVP v0.1 Phase 4.15 - GitHub Run Artifact Collection

Date: 2026-06-27

## Goal

Close the next evidence gap after GitHub artifact readiness: make a downloaded GitHub Actions run artifact reviewable as local release evidence, while preventing an old remote run from being mistaken for the current local candidate.

This phase does not trigger Docker deploy, push images, contact NAS, start workers, mutate PublicLibrary, or validate Windows Cutter directly.

## Changes

- Added `scripts/acceptance/admin-docker-github-run-artifact.ts`.
  - Uses GitHub CLI to locate or read a `Build Admin Docker Images` run.
  - Downloads `mixlab-admin-docker-release-gates`.
  - Runs `admin-docker-github-artifact-readiness` against the downloaded artifact.
  - Writes a second-level evidence report that distinguishes:
    - `github_run_candidate_ready`
    - `current_worktree_candidate_ready`
    - `github_run_staging_handoff_ready`
    - `current_worktree_staging_handoff_ready`
  - Always writes `docker_deploy_allowed:false`.
  - Blocks current-worktree proof when the GitHub run `headSha` does not match local `HEAD` or when the local worktree is dirty.
- Added `scripts/acceptance/admin-docker-github-run-artifact.test.ts`.
- Added `collect:admin-docker-github-run-artifact` to `package.json`.
- Updated `scripts/acceptance/delivery-readiness.ts` so the collector remains part of the delivery toolchain.

## Current External State

Read-only checks performed from the Mac repo:

- Local repo: `/Users/huaqihang/Documents/mixlab`
- Current branch: `codex/windows-first-run-autostart-20260615104835`
- Local HEAD: `8060f31b9a4e582f23db4962f371550e5bf267ab`
- Remote branch exists at the same HEAD.
- GitHub CLI is installed and authenticated.
- Local Docker CLI is not installed: `docker: command not found`.
- Current branch has no `docker-admin.yml` GitHub run:

```text
gh run list --repo alin155/mixlab --workflow docker-admin.yml --branch codex/windows-first-run-autostart-20260615104835 --limit 5
[]
```

- `main` only has old failed Admin Docker runs from 2026-06-12 to 2026-06-15. These are not valid evidence for the current Docker MVP candidate.
- The local worktree is dirty with many candidate changes and generated artifacts, so a remote workflow run would not prove the current local worktree unless those changes are committed/pushed first.

## Verification

- `node --test --import tsx scripts/acceptance/admin-docker-github-run-artifact.test.ts scripts/acceptance/admin-docker-github-artifact-readiness.test.ts`
- `npm run audit:delivery-readiness`
- `npm run typecheck`

## Remaining Gate

The next required external evidence is still a real Docker-capable GitHub Actions run for the current candidate commit.

To use the new collector after such a run exists:

```bash
MIXLAB_ADMIN_DOCKER_GITHUB_RUN_ID=<run-id> npm run collect:admin-docker-github-run-artifact
```

That command should produce:

- `admin-docker-github-artifact-readiness-*.json`
- `admin-docker-github-run-artifact-*.json`

The Docker MVP goal remains incomplete until the GitHub run artifact proves the current candidate and the later NAS/Cutter gates pass.
