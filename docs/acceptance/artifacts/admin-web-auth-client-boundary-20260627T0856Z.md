# Admin Web Auth Client Boundary Extraction

Generated: 2026-06-27T08:56:00.000Z

Result: pass

## Scope

- Phase: Phase 5 large-file governance and Admin Web API layering.
- Primary file: `apps/admin-web/src/api.ts`
- New client module: `apps/admin-web/src/admin-auth-client.ts`
- New test module: `apps/admin-web/src/admin-auth-client.test.ts`

## Boundary Decision

Moved to `admin-auth-client.ts`:

- `getAuthBootstrap`
- `getAuthStatus`
- `registerAdmin`
- `loginAdmin`
- `logoutAdmin`

Retained in `api.ts`:

- `AdminApiClient` public interface
- `CreateAdminApiClientInput`
- real client method composition
- fixture auth methods
- session signal binding

`createAdminApiClient(...)` composes `createAdminAuthClientMethods(...)` and spreads the returned methods into the public client object.

## Line Count Evidence

- R.230 `api.ts` audit line count: `2836`
- R.231 `api.ts` audit line count: `2814`
- Delta: `-22`
- `admin-auth-client.ts`: `58` lines
- `admin-auth-client.test.ts`: `107` lines

Current anchors:

- `createAdminAuthClientMethods`: `apps/admin-web/src/admin-auth-client.ts:22`
- `createAdminApiClient`: `apps/admin-web/src/api.ts:1574`
- auth methods composition: `apps/admin-web/src/api.ts:1580`
- auth methods spread: `apps/admin-web/src/api.ts:1598`
- `loadAdminDashboardData`: `apps/admin-web/src/api.ts:2751`

## Redundancy Audit

- Artifact: `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T085521Z.json`
- Markdown: `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T085521Z.md`
- Files scanned: `297`
- Large-file candidates: `19`
- Cleanup allowed: `false`
- Result: `blocked`

## Verification

- `node --test --import tsx apps/admin-web/src/admin-auth-client.test.ts apps/admin-web/src/admin-http.test.ts apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts`: `90` tests passed.
- `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts`: `3` tests passed.
- `npm run typecheck -- --pretty false`: passed.

## Non-Goals Preserved

- No login UI change.
- No backend auth change.
- No endpoint path change.
- No request method/header/body change.
- No session storage change.
- No fixture auth behavior change.
- No dashboard loading strategy change.
- No NAS mutation.
- No Docker upload.
- No Cutter protocol change.

## Conclusion

The real Admin Web auth client method group now has its own boundary while `createAdminApiClient(...)` preserves the public `AdminApiClient` contract.
