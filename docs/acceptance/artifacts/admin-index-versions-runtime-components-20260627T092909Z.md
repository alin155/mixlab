# Admin Index Versions Runtime Components

Generated: 2026-06-27T09:29:09.000Z

Result: pass

## Scope

- Phase: Phase 3 Admin Read Model and Query API observability.
- Primary endpoint: `/api/admin/index/versions`
- Primary query: `packages/admin-api/src/admin-index-versions-query.ts`
- Primary route: `packages/admin-api/src/admin-slow-read-routes.ts`

R.235 adds component-level runtime evidence for the `index/versions` slow endpoint. It does not change query semantics, cache TTL, response data shape, index repair/publish behavior, NAS data, Docker state, Worker behavior, or Cutter protocols.

## Runtime Components

The endpoint now passes component timings into `meta.runtime.components`:

- `current_pointer_fast_page`: large-history `current.json` fast page path, `current-index`, `paged-list`.
- `directory_listing`: index-version directory enumeration when fast path cannot serve the page, `index-version-packages`, `paged-list`.
- `current_pointer_validation`: `current.json` validation against discovered packages, `current-index`, `single-id`.
- `index_package_validation`: per-page `index-manifest.json` / `index.sqlite` validation, `index-version-packages`, `paged-list`.
- `cache_lookup`: short-TTL cache hits without rescanning version directories, `no-scan`.
- `pending_wait`: coalesced in-flight reads when another request is already building the same page, `paged-list`.

## Line Count Evidence

- `admin-index-versions-query.ts`: `521` lines.
- `admin-index-versions-query.test.ts`: `247` lines.
- `admin-slow-read-routes.ts`: `205` lines.
- `admin-slow-read-routes.test.ts`: `377` lines.

Current anchors:

- runtime component field: `packages/admin-api/src/admin-index-versions-query.ts:53`
- `current_pointer_fast_page`: `packages/admin-api/src/admin-index-versions-query.ts:333`
- `directory_listing`: `packages/admin-api/src/admin-index-versions-query.ts:350`
- `current_pointer_validation`: `packages/admin-api/src/admin-index-versions-query.ts:369`
- `index_package_validation`: `packages/admin-api/src/admin-index-versions-query.ts:403`
- `pending_wait`: `packages/admin-api/src/admin-index-versions-query.ts:457`
- `cache_lookup`: `packages/admin-api/src/admin-index-versions-query.ts:477`
- route passthrough: `packages/admin-api/src/admin-slow-read-routes.ts:193`

## Verification

- `node --test --import tsx packages/admin-api/src/admin-index-versions-query.test.ts packages/admin-api/src/admin-slow-read-routes.test.ts`: `12` tests passed.
- `node --test --import tsx packages/admin-api/src/admin-index-versions-query.test.ts packages/admin-api/src/admin-slow-read-routes.test.ts packages/admin-api/src/admin-slow-read-route-deps.test.ts packages/admin-api/src/admin-index-command-routes.test.ts packages/admin-api/src/admin-index-command-route-deps.test.ts packages/admin-api/src/index.test.ts`: `89` tests passed.
- `npm run typecheck -- --pretty false`: passed.
- `node --test --import tsx scripts/acceptance/admin-real-nas-performance.test.ts scripts/acceptance/admin-real-nas-performance-isolated.test.ts`: `6` tests passed.
- Redundancy governance artifact: `admin-redundancy-governance-audit-20260627T092843Z`; cleanup remains blocked with `cleanup_allowed:false`.

## Non-Goals Preserved

- No query semantics change.
- No cache TTL change.
- No API data shape change.
- No index repair or publish behavior change.
- No NAS mutation.
- No Docker upload.
- No Worker behavior change.
- No Cutter release/index/search protocol change.

## Conclusion

The `index/versions` slow endpoint now exposes component-level runtime timings so future optimization can distinguish current pointer fast path, directory listing, package validation, cache hits, and pending waits.
