# Admin Docker MVP v0.1 Phase 4.8 Explicit Image Push Gate

Date: 2026-06-27

## Objective

Make Docker image upload an explicit release decision instead of an automatic side effect of every `main` branch push.

This phase changes GitHub Actions release behavior only. It does not contact NAS Docker, write NAS files, start NAS containers, publish indexes, or change Cutter protocols.

## Implemented

- Updated `.github/workflows/docker-admin.yml`.
- Updated `scripts/acceptance/target-evidence.test.ts`.
- Updated `scripts/acceptance/delivery-readiness.ts`.

The Admin Docker workflow now has a manual dispatch input:

```yaml
push_images:
  description: "Push Admin Docker images to GHCR after smoke passes"
  required: true
  default: false
  type: boolean
```

GHCR login is now gated:

```yaml
if: ${{ github.event_name == 'workflow_dispatch' && inputs.push_images == true }}
```

Both Docker build steps now use conditional push:

```yaml
push: ${{ github.event_name == 'workflow_dispatch' && inputs.push_images == true }}
```

## Behavior

- `push` to `main`:
  - runs source checks;
  - runs evidence tooling;
  - runs local Docker MVP smoke;
  - builds Docker images;
  - uploads evidence artifacts;
  - does not log in to GHCR;
  - does not push images.
- `workflow_dispatch` with `push_images=false`:
  - behaves like a candidate build/smoke run;
  - does not push images.
- `workflow_dispatch` with `push_images=true`:
  - may push GHCR images, but only after the local Docker MVP smoke passes.

## Why This Matters

The MVP plan says Docker upload is not automatically approved by local evidence alone. This change makes the workflow match that rule:

- candidate validation can happen automatically;
- image upload requires a deliberate release action;
- `latest` cannot be updated just because code reached `main`;
- the smoke report remains available as release evidence.

## Verification

Passed:

- `node --test --import tsx scripts/acceptance/target-evidence.test.ts`
- `npm run audit:delivery-readiness`
- `node --test --import tsx scripts/acceptance/admin-docker-local-smoke.test.ts`
- `npm run typecheck`
- `git diff --check`

Notes:

- Node printed the existing `DEP0205 module.register()` warning from the `tsx` test loader; it did not fail tests.

## Remaining Required Evidence

The full MVP still requires:

- GitHub workflow or another Docker-capable environment runs the local smoke with `MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_REQUIRE_PASS=1`.
- If image upload is desired, a human release action runs `workflow_dispatch` with `push_images=true`.
- NAS staged/live candidate exposes the current Admin API contract.
- NAS admin-worker env proof is collected from the running NAS host.
- Cutter compatibility proof passes against a staged candidate.
- Current, target, and rollback Docker image tags are provided.
- NAS disk pressure is resolved or explicitly protected before production staging.
