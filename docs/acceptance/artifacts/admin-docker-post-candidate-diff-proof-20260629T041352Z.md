# Admin Docker Post-Candidate Diff Proof

Generated: 2026-06-29T04:13:52Z

## Decision

- Base candidate: `9c015b9105e97954240020781f79daae3f954bde`
- Observed HEAD: `ae14db3abad0861d3d6df48f7ece137566a1a419`
- Changed paths from candidate to observed HEAD: `81`
- Non-doc paths: none
- Runtime/web build input paths: none
- Result: accepted

Post-candidate changes through `ae14db3` are docs/evidence only. They do not refresh the Admin Docker runtime/web candidate image tag.

## Dockerfile Boundary

`docker/admin-runtime.Dockerfile` copies `package.json`, `package-lock.json`, `tsconfig.json`, `apps/`, `packages/`, and `scripts/`.

`docker/admin-web.Dockerfile` copies `package.json`, `package-lock.json`, `tsconfig.json`, `apps/`, `packages/`, and `docker/nginx/admin-web.conf`.

Neither Dockerfile copies `docs/`, so these evidence commits do not change the image content already dry-run smoked for candidate `9c015b9105e97954240020781f79daae3f954bde`.

## Safety Boundary

This proof does not approve image push, NAS deploy, worker enablement, preprocessing, or runtime changes.

Keep the target image tag pinned to `9c015b9105e97954240020781f79daae3f954bde` until a later commit touching runtime/web build inputs gets a new candidate tag and a fresh `push_images=false` dry-run.

## Supporting Artifacts

- Candidate scope audit: `docs/acceptance/artifacts/admin-docker-candidate-scope-20260629T041315Z.json`
- GitHub artifact readiness: `docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260629T034526Z.json`
- Candidate ref proof: `docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T034610Z.json`
- Latest readiness summary: `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T040950Z.json`
