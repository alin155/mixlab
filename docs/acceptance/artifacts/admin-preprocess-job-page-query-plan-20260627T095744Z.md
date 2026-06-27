# Admin Preprocess Job Page Query Plan 2026-06-27T09:57Z

## Scope

R.238 optimizes the `preprocess_job_page` component behind `/api/admin/preprocess/jobs?limit=20`.

This is a Phase 3 Admin Read Model / Query API slice. It is not a Docker deployment, not a NAS write, not a Cutter protocol change, and not a frontend loading patch.

## Findings

- The status-page SQL already uses `idx_admin_source_video_status_status_position`.
- The job snapshot lookup by `source_video_id` already uses the primary-key index.
- The page reader still paid extra NAS/SMB SQLite cost by opening `admin.sqlite` once for freshness/status and again for the actual page.
- The ready-history supplement also kept a global `COUNT(*) FROM preprocess_job_status` guard in the page hot path. That global guard belongs in readiness/Doctor, not every page query.

## Implementation

- `packages/admin-api/src/admin-read-model-store.ts`
  - Extracted shared `statusFromMetadata(...)` freshness logic.
  - Reused a single SQLite connection inside `readAdminPreprocessJobManifestPageFromStore(...)`.
  - Removed global snapshot row-count checking from the page hot path.
  - Kept current-page snapshot completeness checking for visible ready rows.
- `packages/admin-api/src/admin-read-model-store.test.ts`
  - Added coverage proving the page hot path can return current-page ready snapshots while process-history readiness still reports `table_row_count_mismatch`.

## Performance Evidence

Before R.238 (`admin-real-nas-performance-20260627T095420Z`):

- `preprocess_jobs` warm route: `214.1ms`
- `preprocess_job_page` average: `213.0ms`
- `preprocess_job_page` max: `213.0ms`

After R.238 (`admin-real-nas-performance-20260627T095744Z`):

- `preprocess_jobs` warm route: `149.1ms`
- `preprocess_job_page` average: `147.0ms`
- `preprocess_job_page` max: `148.0ms`

Improvement:

- Warm route: `65.0ms` faster, about `30.4%`.
- `preprocess_job_page`: `66.0ms` faster, about `31.0%`.

The isolated no-repair probe still passed with `20` endpoints, `0` failed samples, `0` slow gates, `0` runtime repair endpoints, and `0` runtime component contract failures.

## Verification

```text
node --test --import tsx packages/admin-api/src/admin-read-model-store.test.ts
```

Result: `32` tests passed.

```text
node --test --import tsx packages/admin-api/src/admin-preprocess-jobs-read-facade.test.ts packages/admin-api/src/admin-slow-read-routes.test.ts
```

Result: `8` tests passed.

```text
npm run typecheck
```

Result: passed.

```text
npm run validate:admin-real-nas-performance-isolated
```

Result: passed. Artifact: `admin-real-nas-performance-isolated-20260627T095743Z`.

```text
npm run audit:admin-redundancy-governance
```

Result: governance audit generated `admin-redundancy-governance-audit-20260627T095420Z`; broad cleanup remains blocked as expected.

## Remaining Gaps

- `preprocess_job_page` still costs about `147ms` on the observed NAS SMB read model. A short TTL read-model page cache is a candidate only if route refresh behavior needs further reduction.
- Source-video status routes still need component-level timing before deeper query changes.
- Dashboard `production_summary` still costs about `367ms` and should be inspected separately.
- R.238 does not complete Protection Gate coverage, frontend loading architecture, redundancy cleanup, or Docker release gates.
