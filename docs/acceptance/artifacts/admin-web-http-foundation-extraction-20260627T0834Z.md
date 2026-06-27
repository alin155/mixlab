# Admin Web HTTP Foundation Extraction

Generated: 2026-06-27T08:34:00.000Z

Result: pass

## Scope

- Phase: Phase 5 large-file governance and Admin Web API layering.
- Primary file: `apps/admin-web/src/api.ts`
- New foundation module: `apps/admin-web/src/admin-http.ts`
- New test module: `apps/admin-web/src/admin-http.test.ts`

## Boundary Decision

Moved to `admin-http.ts`:

- `unwrapAdminResponse`
- `unwrapAdminResponseWithMeta`
- `joinUrl`
- `listQuery`
- `getJson`
- `getJsonWithMeta`
- `sendJson`
- `deleteJson`
- `adminAuthHeaders`

Retained in `api.ts`:

- Admin API type contracts
- real `AdminApiClient` method assembly
- fixture `AdminApiClient`
- dashboard data aggregation
- media URL resolution

`api.ts` still re-exports `unwrapAdminResponse`, so existing imports remain compatible.

## Line Anchor Evidence

The repo worktree already contains earlier uncommitted slices, so older audit artifact line counts are not used as a direct baseline. The local probe before the edit showed `createAdminApiClient` at line `1679` and `loadAdminDashboardData` at line `2879`; after the extraction they are at lines `1573` and `2773`. The new `admin-http.ts` module is `128` lines, with a `130` line focused test module.

## Redundancy Audit

- Artifact: `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T083347Z.json`
- Markdown: `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T083347Z.md`
- Current `api.ts` audit line count: `2836`
- Files scanned: `295`
- Large-file candidates: `19`
- Cleanup allowed: `false`
- Result: `blocked`

## Verification

- `node --test --import tsx apps/admin-web/src/admin-http.test.ts apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts`: `89` tests passed.
- `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts`: `3` tests passed.
- `npm run typecheck -- --pretty false`: passed.

## Non-Goals Preserved

- No endpoint path change.
- No request method change.
- No response envelope change.
- No fixture data/model change.
- No UI render change.
- No backend Admin API change.
- No NAS mutation.
- No Docker upload.
- No Cutter protocol change.

## Conclusion

Admin Web HTTP/envelope helpers now live in a foundation module with focused tests. `api.ts` preserves the public client contract and existing imports while becoming better prepared for later route-owned API client slices.
