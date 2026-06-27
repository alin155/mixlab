# Admin Docker MVP v0.1 Phase 4 Docker Candidate Evidence

Generated at: 2026-06-27T19:02:24Z

## Scope

Phase 4 completed the local Docker staging candidate contract slice:

- Current Admin Web root is reachable locally.
- Current Admin API contract is probeable through an auth-disabled local candidate API.
- `/api/admin/auth/status`, `/api/admin/release-gates`, and `/api/admin/data-loading/plan` are available in the candidate API contract.
- Release gates now require `MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1` in the admin-worker env proof contract.
- Worker env proof now checks MVP mode in both exported env and docker inspect evidence.
- Candidate, live-readonly, and version-parity scripts all require the MVP env contract.

This is a local candidate contract proof only. It is not NAS live evidence and does not approve Docker upload.

## What Changed

Release gate contract:

- Added `MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1` to `admin_worker_env_proof.required_env_flags`.
- Updated Admin Web API types, fixture data, and Protection Center display to surface the required MVP mode.

Acceptance scripts:

- `admin-worker-env-proof` now requires:
  - `MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1`
  - `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0`
  - `MIXLAB_ENABLE_READY_PUBLISH_WORKER=0`
  - `/data/PublicLibrary` roots in running container evidence.
- `admin-docker-candidate-contract-proof`, `admin-docker-release-live-readonly`, and `admin-docker-version-parity-plan` now treat missing MVP mode as an incomplete admin-worker env proof contract.

Local candidate run:

- Started a temporary local Admin API on `http://127.0.0.1:3892`.
- Used `MIXLAB_ADMIN_AUTH_MODE=disabled`.
- Used `MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1`.
- Used a local non-NAS library root under `.local-dev/admin-mvp-phase4-library`.
- Stopped the temporary API after the proof completed.

## Explicit Non-Actions

- Did not write NAS data.
- Did not upload Docker images.
- Did not start NAS Docker containers or workers.
- Did not edit live NAS `.env`.
- Did not run real ASR/FFmpeg preprocessing.
- Did not change Cutter release/catalog/search read protocols.
- Did not change current NAS `v010471` release/index.

## Verification

Passed:

```text
node --test --import tsx scripts/acceptance/admin-worker-env-proof.test.ts scripts/acceptance/admin-docker-candidate-contract-proof.test.ts scripts/acceptance/admin-docker-version-parity-plan.test.ts scripts/acceptance/admin-docker-release-live-readonly.test.ts
tests 23, pass 23
```

```text
node --test --import tsx packages/admin-api/src/admin-protection-query.test.ts apps/admin-web/src/api.test.ts
tests 37, pass 37
```

```text
node --test --import tsx scripts/acceptance/nas-docker-compose-static.test.ts packages/runtime-config/src/docker-worker.test.ts
tests 12, pass 12
```

```text
MIXLAB_ADMIN_DOCKER_CANDIDATE_BASE_URL=http://127.0.0.1:5176 MIXLAB_ADMIN_DOCKER_CANDIDATE_API_BASE_URL=http://127.0.0.1:3892 npm run validate:admin-docker-candidate-contract-proof
candidate_contract_ready=true
candidate_review_blockers=[]
docker_upload_allowed=false
```

Artifacts:

- `docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T190148Z.json`
- `docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T190148Z.md`

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
git diff --check
passed
```

## Known Boundary

This completes the local Phase 4 candidate contract. Docker upload remains blocked.

Before any NAS staging or replacement, the next phase still needs:

- NAS live-readonly proof against the staged new endpoint, not the old `18080` deployment.
- NAS admin-worker exported env and docker inspect evidence accepted by `admin-worker-env-proof`.
- Real Docker image tag/build SHA/health parity from NAS containers.
- Cutter compatibility proof after staging: Windows acceptance plus real cut smoke.
- Before/after NAS ready count and current index proof: ready baseline `10471`, current index `v010471`.
