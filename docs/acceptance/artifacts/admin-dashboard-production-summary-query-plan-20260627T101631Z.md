# R.241 Dashboard Production Summary Query Path Optimization

## Scope

This is a Phase 3 Admin Read Model and Query API performance slice. It advances
`Admin Architecture v1` by reducing a Dashboard background query cost at the
read-model boundary.

It is not the full Admin Architecture v1 goal. It does not complete Protection
Gate coverage, route-loader restructuring, page information architecture,
redundancy cleanup, Docker release gates, or Docker upload readiness.

## Role Review

- Project Architect: approved. The slice stays on the read-model/query mainline
  and removes page-time SQLite table counting instead of adding UI loading
  polish.
- Delivery Lead: approved. The change is GET/read-path only, preserves response
  shape and metadata snapshot gates, and is accepted with focused tests,
  typecheck, read-only NAS performance evidence, and governance audit.

## Implementation

- `readAdminDashboardProductionSummaryFromStore(...)` now opens `admin.sqlite`
  once and reuses metadata/counts for freshness.
- The Dashboard production-summary hot path no longer runs `COUNT(*)` over
  `preprocess_job_status` on every background metrics miss.
- The hot path still refuses missing stores, stale stores, incomplete preprocess
  job snapshots, and snapshot metadata row-count mismatches.
- `packages/admin-api/src/admin-read-model-store.test.ts` adds a regression test
  for snapshot metadata row-count mismatch returning `null`.

## Performance Evidence

Before R.241:

- `admin-real-nas-performance-20260627T100802Z.md`
- `dashboard_metrics` p95: `654.4ms`
- `production_summary`: `342.0ms`
- Direct function probe stable range: `344.2-371.5ms`

After R.241:

- `admin-real-nas-performance-20260627T101631Z.md`
- `dashboard_metrics` p95: `471.5ms`
- `production_summary`: `156.0ms`
- Direct function warm range: `140.6-157.6ms`
- Dashboard warm cache samples: `2.0ms`, `1.2ms`

Query-plan inspection showed the day-range queries already used indexes on
`completed_at`, `indexed_at`, and `failed_at`. The avoidable cost was the
per-request `COUNT(*)` over `preprocess_job_status` on the NAS SQLite store.

## Verification

Passed:

- `node --test --import tsx packages/admin-api/src/admin-read-model-store.test.ts`
- `node --test --import tsx packages/admin-api/src/admin-dashboard-metrics-query.test.ts packages/admin-api/src/admin-dashboard-read-facade.test.ts packages/admin-api/src/admin-source-video-status-page-query.test.ts packages/admin-api/src/admin-source-video-routes.test.ts`
- `npm run typecheck`
- `npm run validate:admin-real-nas-performance-isolated`
- `npm run audit:admin-redundancy-governance`

Artifacts:

- `docs/acceptance/artifacts/admin-real-nas-performance-isolated-20260627T101630Z.md`
- `docs/acceptance/artifacts/admin-real-nas-performance-20260627T101631Z.md`
- `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T101630Z.md`

The redundancy audit command exited successfully and preserved the governance
state: cleanup remains blocked until candidates are reviewed. This is expected
because R.241 is not a redundancy-cleanup slice.

## Safety

- No NAS mutation.
- No Docker mutation.
- No Cutter protocol change.
- No ready asset change.
- No page-time full scan.

## Remaining Gaps

- Dashboard `material_summary` still costs about `144ms` on the observed NAS
  run.
- `usage_metrics` still costs about `100ms` on the observed NAS run.
- Source-video `status_store_page` remains the dominant source-video
  status-list cost.
- Route-loader restructuring, UI information architecture, Protection Gate
  completion, redundancy cleanup, Docker release gates, and full Admin
  Architecture v1 remain incomplete.
