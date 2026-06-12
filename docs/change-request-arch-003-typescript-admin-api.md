# Change Request ARCH-003: TypeScript Admin API For V1

Date: 2026-06-03
Status: Accepted for the MixLab V3 V1 implementation baseline

## Requirement Being Changed

`ARCH-003` originally names Go as the formal admin backend stack and Tauri + React + TypeScript as the formal cutter desktop stack.

## Decision

For V1, keep the admin backend as the TypeScript/Node `@mixlab/admin-api` package and keep the cutter desktop as Tauri + React + TypeScript.

The Go admin backend is deferred until a later stage needs a separate compiled service, deployment model, or performance envelope that the current TypeScript service cannot satisfy.

## Rationale

- The Admin API already owns the public-library control plane, source scanning, preprocessing lifecycle, settings, Doctor export, index publication, metrics, cutter login approval, and ASR runtime state.
- Protocol, library, search, Doctor, cutter, and admin contracts share TypeScript types and automated tests in one monorepo, reducing schema drift during V1 delivery.
- The heavy search runtime is separated behind SQLite/searchd and the Cutter API boundary, so keeping the admin service in TypeScript does not couple the UI directly to index internals.
- Full automated tests and the real cutter API smoke cover the product-critical search, read, select, cut, reuse, and public/private write-boundary flows.

## Guardrails

- UI code must keep calling typed API clients rather than importing backend/index internals.
- Public-library writes stay on the Admin API side; cutter writes stay in the cutter workspace.
- Shared protocol validators remain the schema boundary for manifests.
- If production profiling or deployment packaging shows that the Admin API needs a separate compiled service, Go parity can be planned as a new milestone without changing the Cutter UI contract.

## Verification

- `npm run typecheck`: passed.
- `npm test`: passed, 554/554 tests.
- `npm run smoke:cutter-api-web`: passed.
- `npm run test:searchd`: passed, 17/17 tests.
