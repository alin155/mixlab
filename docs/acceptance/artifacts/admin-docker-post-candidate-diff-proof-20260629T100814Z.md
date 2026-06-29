# Admin Docker Post-Candidate Diff Proof

Generated: 2026-06-29T10:08:14Z

## Decision

- Base candidate: `5a50922bc82f1b6728f247ed33e5885ab8cf6bef`
- Observed HEAD: `573065481eee8fe6843915e9d0cd471ed75a8b2a`
- Changed paths from candidate to observed HEAD: `24`
- Non-doc paths: none
- Runtime/web build input paths: none
- Result: accepted

Post-candidate changes through `5730654` are docs/evidence only. They do not refresh the Admin Docker runtime/web candidate image tag.

## Dockerfile Boundary

`docker/admin-runtime.Dockerfile` copies `package.json`, `package-lock.json`, `tsconfig.json`, `apps/`, `packages/`, and `scripts/`.

`docker/admin-web.Dockerfile` copies `package.json`, `package-lock.json`, `tsconfig.json`, `apps/`, `packages/`, and `docker/nginx/admin-web.conf`.

Neither Dockerfile copies `docs/`, so these evidence commits do not change the image content already dry-run smoked for candidate `5a50922bc82f1b6728f247ed33e5885ab8cf6bef`.

## Safety Boundary

This proof does not approve image push, NAS deploy, worker enablement, preprocessing, or runtime changes.

Keep the target image tag pinned to `5a50922bc82f1b6728f247ed33e5885ab8cf6bef` until a later commit touching runtime/web build inputs gets a new candidate tag and a fresh `push_images=false` dry-run.

## Supporting Artifacts

- Candidate scope audit: `docs/acceptance/artifacts/admin-docker-candidate-scope-20260629T095303Z.json`
- GitHub artifact readiness: `docs/acceptance/artifacts/admin-docker-github-artifact-readiness-20260629T095804Z.json`
- Candidate ref proof: `docs/acceptance/artifacts/admin-docker-candidate-ref-proof-20260629T095825Z.json`
- Latest readiness summary: `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260629T100114Z.json`
- Release-owner runbook: `docs/acceptance/artifacts/admin-docker-release-owner-runbook-20260629T100121Z.json`
