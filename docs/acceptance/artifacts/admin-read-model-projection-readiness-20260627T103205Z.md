# R.243 Admin Read Model Projection Readiness

## Scope

This is a Phase 3 Admin Read Model and Query API observability slice. It makes
read-model projection availability explicit instead of treating a fresh count
model as proof that every Dashboard projection is available.

It is not the full Admin Architecture v1 goal. It does not rebuild the
material-summary projection, complete Protection Gate coverage, route-loader
restructuring, page information architecture, redundancy cleanup, Docker release
gates, or Docker upload readiness.

## Role Review

- Project Architect: approved. The slice distinguishes store freshness from
  projection readiness without downgrading usable route read-model paths.
- Delivery Lead: approved. The change is read-only/status/reporting behavior
  plus tests; it does not write NAS data, start reconcile, or alter Cutter
  protocols.

## Implementation

- Admin read-model status now exposes optional `projections.material_summary`
  and `projections.production_summary` readiness.
- Each projection records `status`, `reason`, `scan_mode`,
  `requires_background_reconcile`, `safe_for_page_request`, `video_count`, and
  `current_video_count`.
- The main store freshness and reconciliation plan remain page-safe when counts
  are fresh; projection gaps are visible without marking the whole store stale.
- The real NAS performance report now includes a `Read Model Projection
  Readiness` table.

## Live Finding

Against `/Volumes/MixLab/PublicLibrary`:

- `admin.sqlite` freshness: `fresh`
- `source_video_status` rows: `11394`
- rows with full `manifest_json`: `939`
- rows with positive `duration_ms`: `35`
- `dashboard_material_*` metadata rows: `0`

Projection readiness from the live GET-only probe:

| projection | status | reason | scan mode | requires background reconcile | safe for page request | video count | current video count |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| material_summary | missing | missing_metadata | full-reconcile | true | true | 0 | 11394 |
| production_summary | ready | ready | no-scan | false | true | 11394 | 11394 |

This means the read model is usable for current status pages, but the material
summary projection still needs a controlled maintenance rebuild.

## Verification

Passed:

- `node --test --import tsx packages/admin-api/src/admin-read-model-store.test.ts scripts/acceptance/admin-real-nas-performance.test.ts`
- `node --test --import tsx packages/admin-api/src/admin-read-model-routes.test.ts packages/admin-api/src/admin-read-model-reconciler-runtime.test.ts packages/admin-api/src/admin-dashboard-metrics-query.test.ts packages/admin-api/src/admin-dashboard-read-facade.test.ts`
- `npm run typecheck`
- `npm run validate:admin-real-nas-performance-isolated`
- `npm run audit:admin-redundancy-governance`

Artifacts:

- `docs/acceptance/artifacts/admin-real-nas-performance-isolated-20260627T103205Z.md`
- `docs/acceptance/artifacts/admin-real-nas-performance-20260627T103205Z.md`
- `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T103205Z.md`

The redundancy audit command exited successfully and preserved the governance
state: cleanup remains blocked until candidates are reviewed.

## Safety

- No NAS mutation.
- No Docker mutation.
- No Cutter protocol change.
- No ready asset change.
- No page-time full scan.
- No read-model rebuild was started.

## Remaining Gaps

- The material-summary projection still needs a controlled maintenance rebuild
  to populate `dashboard_material_*` metadata.
- The observed `source_video_status` table is fresh for counts but only has
  `939` full manifest rows, so it cannot support full material duration/size
  aggregation yet.
- Route-loader restructuring, UI information architecture, Protection Gate
  completion, redundancy cleanup, Docker release gates, and full Admin
  Architecture v1 remain incomplete.
