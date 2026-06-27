# Admin Web Operations Client Boundary Extraction

Generated: 2026-06-27T09:12:31.000Z

Result: pass

## Scope

- Phase: Phase 5 large-file governance and Admin Web API layering.
- Primary file: `apps/admin-web/src/api.ts`
- New client module: `apps/admin-web/src/admin-operations-client.ts`
- New test module: `apps/admin-web/src/admin-operations-client.test.ts`

This is a route/domain client boundary slice for slow-page entrypoints. It advances Admin Web API layering before route-loader/read-model acceptance work, but it does not change backend query semantics, NAS data, Docker images, Cutter protocols, or fixture state ownership.

## Boundary Decision

Moved to `admin-operations-client.ts`:

- library/data-loading/operations overview reads
- read-model reconcile status/start/cancel
- operation log and command snapshot restore reads/commands
- path checks and settings/source-folder commands
- dashboard metrics
- preprocess jobs, process history, job logs, queue/retry/recover commands, and supervisor commands
- index versions and index repair
- doctor report/run/export and runtime diagnostics/settings
- ASR config test command

Moved query helpers/defaults:

- `processHistoryQuery`
- `runtimeDiagnosticsHistoryQuery`
- `ADMIN_PREPROCESS_JOB_DEFAULT_LOAD_LIMIT`
- `ADMIN_PREPROCESS_PROCESS_HISTORY_DEFAULT_LOAD_LIMIT`

Retained in `api.ts`:

- `AdminApiClient` public interface
- `CreateAdminApiClientInput`
- client composition and AbortSignal binding
- cutter-user real client methods
- fixture client state and mutations
- dashboard aggregation

`createAdminApiClient(...)` still returns the same `AdminApiClient` methods; operations methods are composed back into the public client object.

## Line Count Evidence

- R.232 `api.ts` audit line count: `2685`
- R.233 `api.ts` audit line count: `2480`
- Delta: `-205`
- `wc -l apps/admin-web/src/api.ts`: `2479`
- `admin-operations-client.ts`: `318` lines
- `admin-operations-client.test.ts`: `235` lines

Current anchors:

- `ADMIN_PREPROCESS_JOB_DEFAULT_LOAD_LIMIT`: `apps/admin-web/src/admin-operations-client.ts:34`
- `createAdminOperationsClientMethods`: `apps/admin-web/src/admin-operations-client.ts:123`
- preprocess jobs default query: `apps/admin-web/src/admin-operations-client.ts:233`
- `createAdminApiClient`: `apps/admin-web/src/api.ts:1474`
- operations methods composition: `apps/admin-web/src/api.ts:1485`
- operations methods spread: `apps/admin-web/src/api.ts:1498`
- `loadAdminDashboardData`: `apps/admin-web/src/api.ts:2417`

## Redundancy Audit

- Artifact: `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T091206Z.json`
- Markdown: `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T091206Z.md`
- Files scanned: `302`
- Duplicate selector candidates: `40`
- Large-file candidates: `19`
- Term hotspot candidates: `28`
- Cleanup allowed: `false`
- Result: `blocked`

## Verification

- `node --test --import tsx apps/admin-web/src/admin-operations-client.test.ts apps/admin-web/src/admin-source-video-client.test.ts apps/admin-web/src/admin-auth-client.test.ts apps/admin-web/src/admin-http.test.ts apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts`: `95` tests passed.
- `npm run typecheck -- --pretty false`: passed.
- `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts && npx tsx scripts/acceptance/admin-redundancy-governance-audit.ts`: `3` tests passed; new governance artifact generated.

## Non-Goals Preserved

- No backend Admin API route change.
- No endpoint path change.
- No request method/header/body change.
- No response envelope change.
- No fixture client state split.
- No page UI change.
- No read-model schema change.
- No NAS mutation.
- No Docker upload.
- No Cutter protocol change.

## Conclusion

Admin Web slow-page operations methods now have a dedicated client boundary while the public `AdminApiClient` contract remains unchanged.
