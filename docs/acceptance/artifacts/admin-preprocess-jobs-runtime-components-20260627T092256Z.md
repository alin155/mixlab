# Admin Preprocess Jobs Runtime Components

Generated: 2026-06-27T09:22:56.000Z

Result: pass

## Scope

- Phase: Phase 3 Admin Read Model and Query API observability.
- Primary endpoint: `/api/admin/preprocess/jobs`
- Primary query facade: `packages/admin-api/src/admin-preprocess-jobs-read-facade.ts`
- Primary route: `packages/admin-api/src/admin-slow-read-routes.ts`

R.234 adds component-level runtime evidence for the `preprocess/jobs` slow endpoint. It does not change query semantics, response data shape, read-model schema, NAS data, Docker state, Worker behavior, or Cutter protocols.

## Runtime Components

The endpoint now passes component timings into `meta.runtime.components`:

- `concurrency_policy`: concurrent-job policy lookup from `admin-settings`, `no-scan`.
- `library_counts`: bounded library summary read for paged preprocess/jobs counts, `library-manifest`, `no-scan`.
- `preprocess_job_page`: read-model or fallback manifest page that feeds the list, normally `admin-read-model`, `paged-list`.
- `manifest_fallback`: unpaged manifest fallback when no limit is supplied, `source-video-manifest`, `status-scan`.
- `job_record_supplement`: required per-source-video job-record supplement reads for observable processing/failed/ready rows, `single-id`.
- `runtime_load`: runtime load telemetry used for operator advice, `runtime-telemetry`, `no-scan`.

## Line Count Evidence

- `admin-preprocess-jobs-read-facade.ts`: `231` lines.
- `admin-preprocess-jobs-read-facade.test.ts`: `197` lines.
- `admin-slow-read-routes.ts`: `203` lines.
- `admin-slow-read-routes.test.ts`: `363` lines.

Current anchors:

- component timings result: `packages/admin-api/src/admin-preprocess-jobs-read-facade.ts:72`
- `concurrency_policy`: `packages/admin-api/src/admin-preprocess-jobs-read-facade.ts:82`
- `preprocess_job_page`: `packages/admin-api/src/admin-preprocess-jobs-read-facade.ts:122`
- `runtime_load`: `packages/admin-api/src/admin-preprocess-jobs-read-facade.ts:197`
- `job_record_supplement`: `packages/admin-api/src/admin-preprocess-jobs-read-facade.ts:211`
- route passthrough: `packages/admin-api/src/admin-slow-read-routes.ts:160`

## Verification

- `node --test --import tsx packages/admin-api/src/admin-preprocess-jobs-read-facade.test.ts packages/admin-api/src/admin-slow-read-routes.test.ts`: `8` tests passed.
- `node --test --import tsx packages/admin-api/src/admin-preprocess-jobs-read-facade.test.ts packages/admin-api/src/admin-preprocess-jobs-read-services.test.ts packages/admin-api/src/admin-preprocess-jobs-query.test.ts packages/admin-api/src/admin-slow-read-routes.test.ts packages/admin-api/src/admin-slow-read-route-deps.test.ts packages/admin-api/src/admin-runtime-observability.test.ts packages/admin-api/src/index.test.ts`: `88` tests passed.
- `npm run typecheck -- --pretty false`: passed.
- `node --test --import tsx scripts/acceptance/admin-real-nas-performance.test.ts scripts/acceptance/admin-real-nas-performance-isolated.test.ts`: `6` tests passed.
- Redundancy governance artifact: `admin-redundancy-governance-audit-20260627T092234Z`; cleanup remains blocked with `cleanup_allowed:false`.

## Non-Goals Preserved

- No query semantics change.
- No API data shape change.
- No read-model schema change.
- No NAS mutation.
- No Docker upload.
- No Worker behavior change.
- No Cutter release/index/search protocol change.

## Conclusion

The `preprocess/jobs` slow endpoint now exposes component-level runtime timings so future performance work can identify read-model page, supplement, and runtime-load costs instead of guessing.
