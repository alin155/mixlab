# Admin Web Source Video Client Boundary Extraction

Generated: 2026-06-27T09:04:00.000Z

Result: pass

## Scope

- Phase: Phase 5 large-file governance and Admin Web API layering.
- Primary file: `apps/admin-web/src/api.ts`
- New client module: `apps/admin-web/src/admin-source-video-client.ts`
- New media module: `apps/admin-web/src/admin-source-video-media.ts`
- New test module: `apps/admin-web/src/admin-source-video-client.test.ts`

## Boundary Decision

Moved to `admin-source-video-client.ts`:

- `listSourceVideos`
- `listSourceVideosWithRuntime`
- `getSourceVideoDetail`
- `queueSourceVideo`
- `retrySourceVideo`
- `recoverProcessingSourceVideo`
- `publishSourceVideo`
- `updateSourceVideoMetadata`
- `updateSourceVideoCover`

Moved to `admin-source-video-media.ts`:

- `resolveMediaUrl`
- `resolveSourceVideoMedia`
- `resolveSourceVideoDetailMedia`

Retained in `api.ts`:

- `AdminApiClient` public interface
- `CreateAdminApiClientInput`
- real client method composition
- fixture source-video methods
- dashboard aggregation
- session signal binding

`api.ts` still re-exports `resolveMediaUrl`, so existing imports remain compatible.

## Line Count Evidence

- R.231 `api.ts` audit line count: `2814`
- R.232 `api.ts` audit line count: `2685`
- Delta: `-129`
- `admin-source-video-client.ts`: `120` lines
- `admin-source-video-media.ts`: `65` lines
- `admin-source-video-client.test.ts`: `221` lines

Current anchors:

- `resolveMediaUrl`: `apps/admin-web/src/admin-source-video-media.ts:3`
- `createAdminSourceVideoClientMethods`: `apps/admin-web/src/admin-source-video-client.ts:40`
- `createAdminApiClient`: `apps/admin-web/src/api.ts:1511`
- source-video methods composition: `apps/admin-web/src/api.ts:1522`
- source-video methods spread: `apps/admin-web/src/api.ts:1630`
- `loadAdminDashboardData`: `apps/admin-web/src/api.ts:2622`

## Redundancy Audit

- Artifact: `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T090312Z.json`
- Markdown: `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T090312Z.md`
- Files scanned: `300`
- Large-file candidates: `19`
- Term hotspot candidates: `28`
- Cleanup allowed: `false`
- Result: `blocked`

## Verification

- `node --test --import tsx apps/admin-web/src/admin-source-video-client.test.ts apps/admin-web/src/admin-auth-client.test.ts apps/admin-web/src/admin-http.test.ts apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts`: `93` tests passed.
- `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts`: `3` tests passed.
- `npm run typecheck -- --pretty false`: passed.

## Non-Goals Preserved

- No backend source-video API change.
- No endpoint path change.
- No request method/header/body change.
- No response envelope change.
- No fixture source-video behavior change.
- No source-video page UI change.
- No read-model schema change.
- No NAS mutation.
- No Docker upload.
- No Cutter protocol change.

## Conclusion

The real Admin Web source-video client method group and media URL resolution now have route/domain-owned boundaries while `createAdminApiClient(...)` preserves the public `AdminApiClient` contract.
