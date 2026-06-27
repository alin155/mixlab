# R.242 Dashboard Material Summary Single-Connection Read

## Scope

This is a Phase 3 Admin Read Model and Query API performance slice. It reduces
Dashboard material-summary read-model overhead.

It is not the full Admin Architecture v1 goal. It does not complete
material-summary projection rebuilds, Protection Gate coverage, route-loader
restructuring, page information architecture, redundancy cleanup, Docker release
gates, or Docker upload readiness.

## Role Review

- Project Architect: approved. The slice stays on the read-model/query mainline
  and does not convert the issue into a Dashboard UI patch.
- Delivery Lead: approved. The change is GET/read-path only, preserves response
  shape and freshness behavior, and does not write or rebuild NAS data.

## Implementation

- `readAdminDashboardMaterialSummaryFromStore(...)` now opens `admin.sqlite`
  once and reuses metadata/counts for freshness.
- The function no longer calls `readAdminReadModelStoreStatus(...)` and then
  reopens the same store for material metadata.
- The read path still refuses missing stores, stale stores, missing
  material-summary metadata, and summary count mismatches.

## Performance Evidence

Before R.242:

- `admin-real-nas-performance-20260627T101631Z.md`
- `dashboard_metrics` p95: `471.5ms`
- `material_summary`: `144.0ms`
- Direct function probe range: `126.0-138.2ms`

After R.242:

- `admin-real-nas-performance-20260627T102045Z.md`
- `dashboard_metrics` p95: `451.2ms`
- `material_summary`: `73.0ms`
- Direct function warm range: `64.9-72.3ms`
- Dashboard warm cache samples: `2.0ms`, `1.4ms`

Data finding:

- The live NAS `admin.sqlite` currently has no `dashboard_material_*` metadata
  rows.
- This slice makes the missing-summary path cheaper; it does not create or
  rebuild the projection.

## Verification

Passed:

- `node --test --import tsx packages/admin-api/src/admin-read-model-store.test.ts`
- `node --test --import tsx packages/admin-api/src/admin-dashboard-metrics-query.test.ts packages/admin-api/src/admin-dashboard-read-facade.test.ts packages/admin-api/src/admin-source-video-status-page-query.test.ts packages/admin-api/src/admin-source-video-routes.test.ts`
- `npm run typecheck`
- `npm run validate:admin-real-nas-performance-isolated`
- `npm run audit:admin-redundancy-governance`

Artifacts:

- `docs/acceptance/artifacts/admin-real-nas-performance-isolated-20260627T102044Z.md`
- `docs/acceptance/artifacts/admin-real-nas-performance-20260627T102045Z.md`
- `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T102044Z.md`

The redundancy audit command exited successfully and preserved the governance
state: cleanup remains blocked until candidates are reviewed. This is expected
because R.242 is not a redundancy-cleanup slice.

## Safety

- No NAS mutation.
- No Docker mutation.
- No Cutter protocol change.
- No ready asset change.
- No page-time full scan.
- No read-model rebuild was started.

## Remaining Gaps

- Dashboard material-summary projection availability is still unresolved because
  the observed `admin.sqlite` has no `dashboard_material_*` metadata rows.
- Dashboard `production_summary` remains variable and measured `190ms` in the
  latest cold sample.
- `usage_metrics` still costs about `112ms` on the observed NAS run.
- Source-video `status_store_page` remains the dominant source-video
  status-list cost.
- Route-loader restructuring, UI information architecture, Protection Gate
  completion, redundancy cleanup, Docker release gates, and full Admin
  Architecture v1 remain incomplete.
