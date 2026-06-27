# Admin Architecture v1

Date: 2026-06-25

## Objective

Admin Architecture v1 upgrades MixLab Admin from a dashboard-shaped tool into a production control plane for the NAS-backed public library.

The primary objective is to protect already published source-video assets while eliminating the root causes of slow Admin loading. The current public-library state includes more than ten thousand source-video records, most already published to Cutter. Those ready records must be treated as production assets, not disposable cache.

## Total Delivery Goal

Admin Architecture v1 is delivered as one coherent backend-first program:

1. Protect published data before changing scan, preprocess, or UI behavior.
2. Make every broad mutation previewable, blockable, and observable.
3. Keep Admin page loading separate from expensive NAS traversal.
4. Turn Docker upload readiness into explicit release gates instead of a manual checklist.
5. Defer visual reframe and read-model migration until the protection and release gates are machine-verifiable.

This means the first complete implementation target is not "redesign all pages". It is the safety substrate that makes page redesign and performance work safe:

- scan-preview plus scan-apply protection
- ready asset transition guards
- writer lease for Admin mutations
- preprocess safety gates
- usage-events tolerance with release blocking when malformed history remains
- build/runtime/path/index release gates
- API contracts that the future Protection Center and Docker gate UI can read

## Implementation Contract

This v1 track uses a single acceptance rule: no Admin optimization is allowed to reduce Cutter-visible ready data, erase existing ready manifests, or trigger hidden full-library scans from ordinary page loading.

The backend must expose enough state for the UI to answer:

- Can I scan now?
- Would this scan remove ready assets?
- Can I start preprocessing now?
- Is Docker upload currently allowed?
- Which exact gate is blocking release?
- Is another writer already mutating library state?

## Product Goals

- Protect ready source videos from accidental deletion, requeue, reprocessing, or Cutter invisibility.
- Keep Cutter reading stable published releases while Admin preprocessing evolves independently.
- Replace page-triggered NAS-wide scans with explicit scan planning, read models, and background reconciliation.
- Split Admin read paths from Admin write commands so slow business I/O does not freeze the UI shell.
- Reframe Admin pages around operational workflows: protection, library scan, preprocessing, publish, users, system health, settings, and audit.
- Prepare the local Admin stack for NAS Docker upload only after path, data, disk, version, and health gates pass.

## Non-goals

- Do not reprocess the existing ready catalog.
- Do not change the Cutter release/catalog read contract in v1.
- Do not migrate large NAS media files or transcript artifacts in v1.
- Do not combine Docker release, page redesign, performance indexing, and data-layout migration into a single unreviewable batch.
- Do not clean old code unless the cleanup is directly tied to the new architecture boundary and covered by tests.

## Architecture Principles

### Source of Truth

- File artifacts under `.mixlab-library` remain the durable asset source.
- A future Admin read model should serve day-to-day page queries.
- Audit logs should record Admin commands and protection decisions.
- Cutter should continue reading published release/index data.

### Scan Modes

Admin must distinguish when scanning is required.

- `no-scan`: dashboard, list pages, status filters, login shell, and Cutter queries.
- `single-id`: known source-video command, metadata update, publish, recover, or artifact check.
- `folder-scan`: explicit source folder preview or changed source-folder scope.
- `status-scan`: bounded maintenance over a small status set when the read model cannot answer.
- `full-reconcile`: first import, read-model rebuild, Doctor repair, Docker release audit, or explicit maintenance window.

Full scans must never be a hidden page-load side effect.

### Command Gates

Every mutating Admin command should pass through a command gate:

1. Resolve runtime environment and library root.
2. Check protection status.
3. Acquire writer lease when the command mutates manifests, jobs, indexes, settings, or scan state.
4. Produce or reuse a preview for broad commands.
5. Apply only if blockers are empty.
6. Write audit evidence.
7. Invalidate or update read models.

## Protection v1

Protection v1 is the first implementation batch.

### Ready Asset Rules

Allowed transitions:

- `unprocessed -> queued`
- `queued -> processing`
- `processing -> index-required`
- `processing -> failed`
- `failed -> queued`
- `processing -> queued` only when recovering a stopped or stale task
- `index-required -> ready`
- `ready -> ready` for safe metadata-only updates

Blocked transitions:

- `ready -> queued`
- `ready -> processing`
- `ready -> failed`
- `ready -> unprocessed`
- `ready -> visible_to_cutters=false`
- Scan apply that removes a ready manifest directory
- Any broad action that would lower the ready baseline without an explicit rollback workflow

### Scan Preview

Broad library scanning must be split into:

- `scan-preview`: read source folders, compare against existing manifests, and report the diff.
- `scan-apply`: apply the diff only after protection blockers pass.

Preview must report:

- New video count.
- Existing video count.
- Inactive manifest count.
- Inactive ready count.
- Skipped source folder IDs.
- Source-video IDs that would be removed.
- Blockers.

### Current v1 Implementation Start

This document starts the v1 track with:

- `previewSourceVideoScan` in `packages/library-fs`.
- `/api/admin/library/scan-preview` in Admin API.
- `/api/admin/library/scan` returning `409 scan_blocked` when a scan would remove ready assets.
- `withAdminWriterLease` in `packages/library-fs`.
- `/api/admin/protection/status` for machine-readable protection state.
- `/api/admin/release-gates` for Docker/upload readiness checks.
- `/api/admin/operations/overview` for the route-owned Protection Center aggregate.
- Admin write routes returning `409 admin_writer_busy` while another writer owns the lease.
- Ready source-video transition attempts returning `409 preprocess_transition_blocked`.
- Tests covering preview behavior and ready-removal blocking.

## Admin Data Loading Strategy

### Immediate Rules

- Admin shell should load health, auth, library status, protection status, and current release first.
- Route pages should own their own data loaders.
- Heavy routes must use pagination, bounded queries, cancellation, and local error states.
- Dashboard should not trigger source-video, preprocess-job, doctor, and index scans at the same time.
- Slow endpoints should report timing, data source, scan mode, and cache/read-model status.

### Future Read Model

Introduce an Admin read model after Protection v1:

```text
.mixlab-library/admin-read-model/admin.sqlite
```

Candidate tables:

- `admin_source_videos`
- `admin_preprocess_jobs`
- `admin_index_versions`
- `admin_source_folders`
- `admin_artifact_status`
- `admin_operation_audit`

Daily page queries should read this model instead of traversing thousands of JSON files on NAS.

## Admin UI Target

Admin pages should become a production management console:

- Global topbar: environment, library, release, protection, health.
- Sidebar: stable operations modules.
- Main workspace: table, queue, timeline, or task list.
- Inspector: selected source video, job, user, check, or command preview.
- Dangerous command area: explicit scope, preview, blockers, and audit trail.

Target navigation:

- Overview
- Protection Center
- Source Library
- Preprocess
- Publish and Index
- Cutter Users
- System Checks
- Settings
- Operation Log

## Phased Implementation Plan

### Phase 0: Baseline

- Record current API timings for Admin routes.
- Record current CSS/component/code duplication hotspots.
- Record current NAS/public-library counts and release version.
- Phase 0 professional review gate: 在开始生产代码修改前，必须安排 Project Architect 主审、Delivery Lead 复核，并形成阶段审评结论，明确确认“目标没有被缩小、实施边界符合本 Goal、计划改动不会越界”。审评结论必须写入阶段报告后，才允许开始生产代码修改。该确认由专业角色完成，不要求用户确认，也不能把“目标是否缩小”的判断责任交回给用户；只有涉及新的产品方向、凭据、破坏性操作或不可逆发布决策时，才单独请求用户确认。
- Keep Docker upload blocked until gates pass.

### Phase 1: Protection v1

- Add scan preview.
- Block ready manifest removal during scan apply.
- Add ready immutable transition guards.
- Add writer lease for manifest/job/index mutations.
- Add lightweight protection baseline snapshots.
- Surface protection status in Admin API.

### Phase 2: Data Loading Architecture

- Split dashboard loader into shell loader and route loaders.
- Add route-local failures and cancellation.
- Add endpoint timing metadata.
- Stop page-open flows from broad NAS traversal.

### Phase 2A: Data Loading Architecture v1

This is the second major delivery phase after Protection v1.

Goal:

- Make Admin shell interactive before heavy NAS-backed business data finishes.
- Prevent hidden broad reads when opening dashboard, login shell, settings, users, or source-video pages.
- Make route data ownership explicit, so each page loads only the data needed for that route.
- Expose a backend loading plan that the frontend can follow and tests can enforce.
- Keep all mutating or broad reconciliation work explicit through command buttons and preview endpoints.

Non-goals:

- Do not create the SQLite Admin read model in this phase.
- Do not redesign all pages in this phase.
- Do not change Cutter release/catalog read contracts.
- Do not run Docker upload as part of this phase.

Backend implementation plan:

- Add `/api/admin/data-loading/plan`.
- Classify every Admin endpoint by `scan_mode`, `cost`, `load_phase`, default limit, refresh policy, and cache policy.
- Mark dashboard shell dependencies as `critical`.
- Mark route-only endpoints such as `source-videos`, `preprocess/jobs`, `index/versions`, `doctor`, `runtime settings`, and `cutter-users` as non-shell route loaders.
- Keep scan and doctor mutations explicit; never treat them as page-load dependencies.

Frontend implementation plan:

- Load shell state first: library status, settings, supervisor status, and data-loading plan.
- Keep source videos empty until the source-video route asks for a paged first page.
- Keep preprocess jobs summary-only until the preprocess route asks for the bounded list.
- Keep index versions, Doctor, runtime settings, and cutter users route-owned.
- Disable background route prefetch unless the backend plan explicitly allows it.
- Use route-local error handling so one slow route does not make the whole Admin app look broken.

Acceptance gates:

- Initial shell load does not call `/api/admin/source-videos`, `/api/admin/preprocess/jobs`, `/api/admin/index/versions`, `/api/admin/doctor/report`, `/api/admin/settings/runtime`, or `/api/admin/cutter-users`.
- Route loader tests prove source-videos and preprocess-jobs load only after entering their routes.
- The backend loading plan reports `no-scan` for shell endpoints and marks full scan as explicit command-only.
- Dashboard panel refresh can update summary metrics without replacing route-owned lists.
- Existing Protection v1 tests continue passing.

### Phase 2B: Slow List Read Model v1

Goal:

- Make `processing`, `queued`, `failed`, and `index-required` lists use a status ID read model instead of repeatedly walking all source-video manifests.
- Keep `ready` first-page and query paths on the existing SQLite transcript index when possible.
- Make `/api/admin/preprocess/jobs` a true task/status list rather than deriving tasks from the first generic source-video page.
- Warm the status read model after cheap shell status loads without making the shell wait for it.
- Keep the read model invalidated by library metadata and Admin write commands.

Non-goals:

- Do not introduce a persistent SQLite Admin database yet.
- Do not change Cutter release/catalog contracts.
- Do not make broad NAS reconciliation automatic.
- Do not treat stale or missing read model data as authoritative over manifests.

Backend implementation plan:

- Add an in-memory `source-video-status-read-model-v1` keyed by library root, library `updated_at`, and total video count.
- Build status ID buckets from source-video manifests only when the model is missing or invalid.
- Use status ID buckets to serve non-ready status filters and preprocess job candidate pages.
- Continue using current index fast paths for ready rows and index version pages.
- Clear source-video list/read-model caches after Admin mutations that can change source-video rows or status.

Acceptance gates:

- `/api/admin/preprocess/jobs?limit=...` returns far `processing` jobs from the first response instead of waiting for a background manifest sweep.
- `source-videos?status=index-required` reads from bounded status IDs after the model is available.
- Existing source-video query and ready-index tests remain green.
- Typecheck, Admin API tests, Admin Web API tests, and Admin Web build remain green.

### Phase 2C: Persistent Admin Read Model v1

Goal:

- Let Admin reuse the status read model across API restarts.
- Make read-model freshness observable without opening source-video or preprocess pages.
- Keep the model self-invalidating through `library.updated_at` and `video_count`.
- Avoid making generated read-model files authoritative over source manifests.
- Prepare the boundary for a later SQLite Admin read model without requiring it in this phase.

Non-goals:

- Do not move Admin to a persistent SQLite database in this phase.
- Do not change Cutter release/catalog data structures.
- Do not write read-model files into `source-videos`.
- Do not block page loads if a generated read-model file cannot be written.

Backend implementation plan:

- Persist `source-video-status-read-model-v1` as generated Admin metadata under `.mixlab-library/admin/read-models`.
- Read the persisted model first when it matches the current library metadata.
- Rebuild from manifests only when memory and persisted models are missing or stale.
- Add `/api/admin/read-model/status` to report memory/persisted freshness, storage path, and status counts without forcing a rebuild.
- Keep Admin write commands clearing in-memory route caches and generated read-model files.

Acceptance gates:

- A status list request creates a persistent status read model.
- `/api/admin/read-model/status` reports `fresh` when the persisted model matches current `library.json`.
- Stale persisted models are ignored and rebuilt from manifests.
- Existing 2A/2B loading and read-model tests remain green.

### Phase 2D: Real NAS Performance Read Model v1

Goal:

- Validate Admin API loading behavior against the real NAS public library instead of fixtures.
- Prevent missing or stale Admin read models from forcing interactive pages to walk the NAS manifest tree.
- Make release gates and preprocessing safety use status read-model snapshots instead of full source-video scans.
- Make default source-video first page and non-ready status pages reuse persisted read-model snapshots.
- Keep all generated read-model data under `.mixlab-library/admin/read-models`, separate from source manifests and Cutter release data.

Non-goals:

- Do not change Cutter release/catalog contracts.
- Do not make the generated Admin read model authoritative over source manifests.
- Do not hide Docker release blockers; disk, usage-events, processing recovery, and build metadata gates remain visible.
- Do not optimize deep arbitrary source-video search in this phase.

Backend implementation plan:

- Build `source-video-status-read-model-v1` from the current SQLite transcript index plus only non-ready source-video manifests when the current index matches `library.ready_video_count`.
- Persist non-ready manifest snapshots for `queued`, `processing`, `failed`, `index-required`, and `unprocessed` rows in the read model.
- Persist a default source-video first-page snapshot so the first route load does not cold-open the NAS SQLite index or read ready manifests.
- Use the read-model processing IDs for `/api/admin/preprocess/safety` and `/api/admin/release-gates`.
- Avoid reading `preprocess-job.json` for queued/index-required list rows that do not need job timing or error metadata.
- Add `scripts/acceptance/admin-real-nas-performance.ts` to archive real NAS endpoint timings.

Observed real NAS validation:

- Public library root: `/Volumes/MixLab/PublicLibrary`.
- Counts after release-gate cleanup: `11394` total, `10471` ready, `904` queued, `0` processing, `19` index-required.
- One-time read-model upgrade cost: about `8.8s` to snapshot non-ready manifests and the default first page.
- Stable performance report: `docs/acceptance/artifacts/admin-real-nas-performance-20260625T184329Z.md`.
- Stable probe result: no slow endpoints; source-video first page p95 `0.4ms`, processing p95 `6.1ms`, index-required p95 `0.5ms`, queued p95 `0.4ms`, preprocess jobs p95 `274ms`, release gates p95 `32.8ms`.
- Post-cleanup stable performance report: `docs/acceptance/artifacts/admin-real-nas-performance-20260625T190816Z.md`.
- Post-cleanup probe result: no slow endpoints; source-video first page p95 `18.8ms`, processing p95 `16.2ms`, index-required p95 `13.9ms`, queued p95 `17.8ms`, preprocess jobs p95 `310.6ms`, release gates p95 `110.8ms`.
- V001440 / C0018 was recovered from stale `processing` to `queued`; it remains `visible_to_cutters=false`, so ready Cutter data is unaffected.
- usage-events active store was repaired to `9084` valid lines and `0` malformed lines; the original `9086`-line file and the 2 malformed lines were backed up/quarantined under `.mixlab-library/usage-events`.

Acceptance gates:

- `/api/admin/release-gates` and `/api/admin/preprocess/safety` do not call full source-video manifest scans for processing recovery checks.
- `/api/admin/source-videos?limit=20` can return the first page from the read-model snapshot.
- `/api/admin/source-videos?status=index-required|queued|processing` can return rows from non-ready manifest snapshots.
- `/api/admin/preprocess/jobs?limit=20` does not read job files for queued/index-required rows.
- Real NAS performance probe archives JSON and Markdown evidence with zero slow endpoints after read-model warm-up.

### Phase 2E: Release Gate Cleanup

Goal:

- Clear local data-quality release gates without touching ready source-video artifacts.
- Make usage-events repair explicit, auditable, and reversible.
- Make single-row queue/retry/recover commands avoid hidden full-library scans.
- Keep Docker upload blocked when physical disk pressure or build metadata is still unsafe.

Implementation:

- Added `scripts/acceptance/usage-events-repair.ts` and `npm run repair:usage-events`.
- The usage-events repair tool defaults to dry-run; apply mode creates a full backup, quarantines malformed lines, rewrites only `events.ndjson`, and writes JSON/Markdown evidence.
- Optimized targeted Admin transition commands so `source-videos/:id/queue`, `:id/retry`, and `:id/recover-processing` read only the target manifest.
- Added incremental `library.json` count updates for targeted transition commands when a current library manifest exists.
- Preserved ready protection: targeted commands still reject attempts to move a ready video into a non-ready state.

Validation:

- `node --test --import tsx packages/admin-api/src/index.test.ts scripts/acceptance/usage-events-repair.test.ts packages/library-fs/src/usage-events.test.ts`
- `npm run typecheck`
- Real NAS recovery probe: V001440 status `queued`, attempt `3`, processing list count `0`.
- Real NAS release gate probe: `usage-events-tolerance: pass`, `processing-recovery: pass`, `preprocess-disk: blocked`, `build-version-health: attention`.

### Phase 2+3A: Control Plane Shell and Protection Center

Goal:

- Combine the data-loading architecture work with the Admin UI reframe so backend state, navigation, and page layout move together.
- Introduce a route-owned Protection Center as the first production-console page, not as a decorative dashboard panel.
- Give admins one place to answer whether it is safe to continue preprocessing or prepare Docker release.
- Prove the page does not trigger hidden full-library scans on entry.
- Keep this first UI slice read-only so it cannot mutate ready assets, jobs, indexes, or usage history.

Implementation:

- Added `getAdminOperationsOverview` and `/api/admin/operations/overview` in Admin API.
- The overview aggregates protection status, release gates, read-model freshness, data-loading plan, current index, status counts, disk safety, and next actions.
- Added the endpoint to `/api/admin/data-loading/plan` as a `route` phase endpoint with `no-scan` behavior.
- Added the `protection` Admin route and legacy aliases `release` / `release-gates`.
- Added `ProtectionCenterPage` with metric band, release-gate table, read-model/loading-policy panel, and an operations inspector.
- Added UI Foundation `shield` icon support for the new navigation item.
- Added typed Admin Web API client and fixture support for the operations overview.

Acceptance gates:

- `/api/admin/operations/overview` returns release, protection, read-model, and data-loading sections from one bounded read path.
- The `protection` route is visible in Admin navigation and uses the approved Chinese label `保护中心`.
- Opening Protection Center loads only `/api/admin/operations/overview` and does not call source-video, preprocess-job, doctor, index, runtime-settings, or cutter-user route data.
- Protection Center contains no mutating controls in this slice; its controls are classified as `read-only`.
- Fixture, Admin API, Admin Web, UI contract, typecheck, and Admin Web production build remain green.

### Phase 3: Admin Read Model

- Create admin read model schema.
- Build a background reconciler.
- Update write commands to synchronously update affected read-model rows.
- Move slow status filters to read-model queries.

### Phase 4: Admin UI Reframe

- Expand from the Protection Center into the remaining production-console pages.
- Reorganize navigation.
- Standardize tables, buttons, badges, forms, inspector panels, and route headers through UI Foundation.
- Reduce dashboard to operational overview.

### Phase 5: Cleanup

- Remove route-local duplicate styles and obsolete fallback data.
- Split large Admin API modules into services.
- Remove page-specific data prefetch code replaced by route loaders.

### Phase 6: Docker Release Gate

- Validate local and Docker path parity.
- Verify health/version endpoints.
- Verify usage-events tolerance or repair.
- Verify stale processing recovery.
- Verify disk protection.
- Verify Cutter still reads the current release after Admin changes.

## Acceptance Gates

- Ready count never decreases during scan preview or scan apply unless an explicit rollback workflow is invoked.
- Scan preview is read-only.
- Scan apply that would remove ready assets returns a blocker.
- Cutter can still read the current published release.
- Admin shell loads independently from heavy route data.
- `processing`, `index-required`, `preprocess/jobs`, and `index/versions` are no longer served by hidden full scans.
- Each mutating command has tests for allowed and blocked states.
- Docker upload remains blocked until all release gates pass.
