# Admin Docker MVP v0.1 Phase 2 Auth And Cutter Users Evidence

Generated at: 2026-06-27T18:43:26Z

## Scope

Phase 2 completed the local candidate slice for:

- Admin login storage stability.
- Cutter user management storage stability.
- Docker MVP mode wiring across compose, runtime image, web image build, and workflow build args.
- Static validation that the NAS compose contract keeps the MVP mode and safe worker defaults.

This is a local code and test evidence record only.

## What Changed

Admin user store:

- Added read retry for transient malformed JSON or validation errors.
- Added tolerance for trailing whitespace or null padding after a complete JSON object.
- Kept malformed persistent stores as blocking errors and preserved the original file contents.
- Kept read-only session validation from rewriting user storage unless `touch: true` is explicitly requested.

Docker MVP wiring:

- Added `MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1` to `deploy/nas/mixlab/.env.example`.
- Added `MIXLAB_ADMIN_DOCKER_MVP_MODE` to `admin-api` and `admin-worker` compose environments.
- Added `MIXLAB_ADMIN_DOCKER_MVP_MODE` build/runtime args to the admin runtime image.
- Added `VITE_MIXLAB_ADMIN_DOCKER_MVP_MODE` build-time env to the admin web image.
- Added workflow build args so pushed admin runtime and admin web images are built as MVP candidates.
- Extended NAS compose static validation to reject MVP-mode drift.

## Explicit Non-Actions

- Did not write NAS data.
- Did not upload Docker images.
- Did not start NAS Docker containers or workers.
- Did not alter Cutter release/catalog/search read protocols.
- Did not change live NAS `.env`.

## Verification

Passed:

```text
node --test --import tsx scripts/acceptance/nas-docker-compose-static.test.ts
tests 3, pass 3
```

```text
node --test --import tsx packages/library-fs/src/admin-users.test.ts packages/library-fs/src/cutter-users.test.ts packages/admin-api/src/admin-auth-routes.test.ts packages/admin-api/src/admin-auth-commands.test.ts packages/admin-api/src/admin-cutter-user-command-routes.test.ts packages/admin-api/src/admin-cutter-user-commands.test.ts
tests 43, pass 43
```

```text
node --test --import tsx apps/admin-web/src/features/admin-ui-contract.test.ts packages/admin-api/src/admin-command-guard.test.ts packages/admin-api/src/admin-command-runtime.test.ts packages/admin-api/src/admin-source-video-command-routes.test.ts
tests 33, pass 33
```

```text
npm run typecheck
tsc -p tsconfig.json --noEmit passed
```

```text
npm run build:admin-web
Vite production build passed
```

```text
npm run validate:nas-docker-compose-static
ok true
```

```text
git diff --check -- <phase-2-files>
passed
```

## Known Boundary

This completes Phase 2 only. Docker upload remains blocked until Phase 3 proves controlled preprocessing does not affect already ready Cutter-visible assets, and until the NAS live release gates from Phase 0 are cleared.
