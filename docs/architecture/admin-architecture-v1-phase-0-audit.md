# Admin Architecture v1 Phase 0 Audit

Date: 2026-06-25
Scope: Phase 0 baseline audit and implementation boundary for `Admin Architecture v1`.

## Goal Coverage Statement

This document does not redefine or shrink `Admin Architecture v1`.

The full goal remains:

- protect existing ready public-library assets;
- remove hidden page-load NAS full scans;
- introduce Admin query/read-model architecture;
- split command/protection/write paths from read paths;
- reframe Admin as a production control console;
- clean redundant code only after the architecture boundary is stable;
- keep Docker upload blocked until release gates pass.

Current state is not complete `Admin Architecture v1`. The current worktree already contains a substantial slice across Phase 1, Phase 2, and the first Protection Center UI slice, but full completion still requires the later phases listed in this report.

## Professional Role Review Gate

Date: 2026-06-25

This gate assigns goal-scope confirmation to professional delivery roles. It does not remove product-direction authority from the user; it assigns architecture-scope verification to the delivery roles before production code changes begin. Unless the next slice introduces a new product direction, credentials, destructive operation, or irreversible release decision, this professional role review is the confirmation gate.

Required wording: production code may start only after Project Architect review, Delivery Lead cross-check, and a recorded professional review conclusion that the goal has not been narrowed, the implementation boundary matches this Goal, and the current slice will not exceed its boundary. This confirmation is completed by the professional roles and must not assign goal-scope confirmation back to the user.

Project Architect review:

- Result: pass for starting the next implementation slice.
- Rationale: this Phase 0 audit preserves the full `Admin Architecture v1` target, explicitly marks current work as incomplete, and keeps the next implementation boundary as a slice rather than the full goal.
- Scope guard: the next slice may extract protection, release-gate, data-loading, query/read-model, and command-guard boundaries, but must not claim completion of SQLite/equivalent durable Admin read model, full page information architecture, redundant code governance, or Docker release.

Delivery Lead cross-check:

- Result: pass with release constraints.
- Rationale: the plan keeps NAS Docker upload blocked until path isolation, usage-events tolerance/repair, V001440 recovery, disk-space protection, and version/health parity gates pass.
- Execution guard: production code changes may start only inside the named slice and must preserve ready asset protection, Cutter release/index/search compatibility, and non-mutating default page-load behavior.

Review conclusion:

- The goal has not been narrowed.
- The next safe production-code boundary is `Phase 1/2 Stabilization And Service Boundary Extraction`.
- This conclusion authorizes starting that slice without requiring the user to manually confirm each scope item.
- This conclusion does not authorize NAS Docker deployment, broad cleanup, UI-only redesign, or marking `Admin Architecture v1` complete.

## Phase 0 Boundary

Phase 0 is allowed to:

- read current code, docs, tests, runtime state, and acceptance artifacts;
- record architecture facts, risk items, API/load boundaries, and test evidence;
- define the first implementation boundary and acceptance matrix.

Phase 0 is not allowed to:

- update NAS Docker;
- reprocess ready videos;
- migrate NAS media or transcript layout;
- change Cutter release/catalog/search contracts;
- start broad cleanup without replacement evidence;
- treat Protection Center UI as full architecture completion.

## Current Runtime And Data Anchors

Authoritative local anchors observed during this audit:

- Repo: `/Users/huaqihang/Documents/mixlab`.
- Branch: `codex/windows-first-run-autostart-20260615104835`.
- Local Admin Web: `http://127.0.0.1:5176`.
- Local Admin API: `http://127.0.0.1:3889`.
- Local Admin API auth mode: password; unauthenticated business endpoints return `401 login_required`.
- Public library root: `/Volumes/MixLab/PublicLibrary`.
- Current known public-library scale from real NAS reports: `11394` total, `10471` ready, `904` queued, `0` processing after V001440 recovery, `19` index-required.
- Docker/NAS update status: not updated in this phase.

## Current Worktree Snapshot

The worktree already contains Admin Architecture related changes.

Tracked modified areas:

- Admin backend: `packages/admin-api/src/index.ts`, `packages/admin-api/src/index.test.ts`.
- Library data layer: `packages/library-fs/src/scanner.ts`, `admin-settings.ts`, `admin-users.ts`, `cutter-users.ts`, `usage-events.ts`, related tests.
- New library safety modules: `packages/library-fs/src/admin-writer-lease.ts`, `packages/library-fs/src/preprocess-safety.ts`.
- Admin frontend: `apps/admin-web/src/api.ts`, `AdminApp.tsx`, `navigation.ts`, `styles.css`, tests, UI contract.
- New frontend slice: `apps/admin-web/src/features/protection/ProtectionCenterPage.tsx`.
- Docker/static gates: `deploy/nas/mixlab/docker-compose.yml`, `.env.example`, Dockerfiles, Docker acceptance scripts.
- Runtime workers: `scripts/workers/preprocess-library-worker.ts`, `publish-ready-worker.ts`, `scripts/docker/admin-worker-loop.ts`.
- Acceptance scripts: `scripts/acceptance/admin-real-nas-performance.ts`, `usage-events-repair.ts`, NAS Docker static validation.
- Architecture and evidence docs: `docs/architecture/admin-architecture-v1.md`, real NAS performance reports, usage-events repair reports, local preprocess audit.

Generated/local artifacts such as `.local-dev`, `.playwright-cli`, `captures`, `output`, local clips, and Tauri generated schemas are present and must be reviewed before any commit or release packaging.

## Architecture Map

```text
Admin Web route
  -> route-owned loader / action
  -> Admin API read endpoint or command endpoint

Admin API read endpoint
  -> library.json / current index / generated read model
  -> bounded route data
  -> no hidden full library scan

Admin API command endpoint
  -> protection check
  -> writer lease when mutating
  -> preview or single-id target
  -> manifest / job / index mutation
  -> cache/read-model invalidation
  -> audit or acceptance evidence

NAS files remain durable asset source.
Generated Admin read models remain optimization.
Cutter keeps reading release/index/search data.
Docker upload remains gated.
```

## Existing Coverage Matrix

| Goal area | Current evidence | Status |
| --- | --- | --- |
| Ready asset protection | Scan preview, ready-removal blocking, ready transition blocking, tests in Admin API and scanner | Mostly implemented |
| Writer lease | `withAdminWriterLease`, conflict behavior, tests | Mostly implemented |
| Scan preview / apply split | `previewSourceVideoScan`, `/api/admin/library/scan-preview`, scan blockers | Mostly implemented |
| Usage-events tolerance/repair | Read tolerance, dry-run/apply repair script, backup/quarantine evidence | Mostly implemented |
| V001440 recovery gate | Real NAS artifact reports recovery from processing to queued | Locally cleared, still release-gated |
| Disk-space protection | `preprocess-safety`, release gate shows disk pressure | Implemented as blocker, physical NAS remains pressured |
| Data loading plan | `/api/admin/data-loading/plan`, route ownership tests | Partially implemented |
| Slow list read model | `source-video-status-read-model-v1` JSON snapshot, real NAS probe evidence | Implemented as v1, not final SQLite read model |
| Admin SQLite read model | `.mixlab-library/admin-read-model/admin.sqlite` exists on the real NAS library, reports `fresh`, `video_count=11394`, and `safe_for_page_request:true` after gated rebuild evidence `admin-read-model-reconcile-20260625T230933Z.md` | Partial: populated for selected non-ready/status job query paths, not yet full Query API coverage |
| Query API / Command API separation | Patterns exist, but main Admin API file still mixes concerns | Partial |
| Page information architecture | Protection Center slice exists, existing pages still not fully reframed | Partial |
| Redundant code governance | Large hotspots identified; cleanup not yet safely started | Not started |
| Docker release gate | Static compose validation exists; NAS Docker not updated | Partial, no deployment |

## API And Loading Baseline

Known read/load endpoints:

- Shell or near-shell: `/health`, `/api/admin/auth/status`, `/api/admin/library/status`, `/api/admin/data-loading/plan`.
- Diagnostic: `/api/admin/read-model/status`.
- Route-owned: `/api/admin/operations/overview`, `/api/admin/protection/status`, `/api/admin/release-gates`, `/api/admin/source-videos`, `/api/admin/source-videos/:id`, `/api/admin/preprocess/jobs`, `/api/admin/preprocess/safety`, `/api/admin/index/versions`, `/api/admin/doctor/report`, `/api/admin/cutter-users`, `/api/admin/settings/runtime`.
- Background/heavy: `/api/admin/dashboard/metrics`.

Known command endpoints:

- Library setup/scan: `/api/admin/library/init`, `/api/admin/library/scan-preview`, `/api/admin/library/scan`.
- Preprocess commands: `/api/admin/preprocess/queue-unprocessed`, `/api/admin/preprocess/retry-failed`, `/api/admin/preprocess/recover-processing`, supervisor start/stop.
- Single-video commands: `/api/admin/source-videos/:id/queue`, `:id/retry`, `:id/recover-processing`, `:id/publish`, metadata, cover.
- Index/Doctor/settings/user commands: index repair, doctor run/export, settings mutation, cutter user approval/disable/password.

Loading rules that must remain true:

- Dashboard and shell must not load full source-video lists, preprocess jobs, index versions, Doctor report, runtime settings, or cutter users as blocking shell data.
- Source video status filters must use indexed/managed status data after warm-up instead of walking all source-video manifests.
- Full scan must only occur through explicit scan/reconcile commands, never hidden inside page entry.
- Dashboard metrics can be background-only and must tolerate malformed usage history.

## Real NAS Performance Evidence

Current evidence files:

- `docs/acceptance/artifacts/local-admin-preprocess-audit-20260625.md`.
- `docs/acceptance/artifacts/admin-real-nas-performance-20260625T184329Z.md`.
- `docs/acceptance/artifacts/admin-real-nas-performance-20260625T190816Z.md`.
- `docs/acceptance/artifacts/admin-real-nas-performance-20260625T225143Z.md`.
- `docs/acceptance/artifacts/admin-read-model-reconcile-20260625T230933Z.md`.
- `docs/acceptance/artifacts/admin-real-nas-performance-20260625T231116Z.md`.
- `docs/acceptance/artifacts/usage-events-repair-20260625T185616Z.md`.
- `docs/acceptance/artifacts/usage-events-repair-20260625T185622Z.md`.
- `docs/acceptance/artifacts/usage-events-repair-20260625T185635Z.md`.

Latest recorded stable performance from the read-only real NAS probe `admin-real-nas-performance-20260625T231116Z.md`:

- Probe context: temporary local Admin API `http://127.0.0.1:3891`, `MIXLAB_ADMIN_AUTH_MODE=disabled`, library root `/Volumes/MixLab/PublicLibrary`, GET requests only.
- Library counts: total `11394`, ready `10471`, queued `904`, processing `0`, failed `0`, index-required `19`.
- `health` p95 `7.9ms`.
- `auth_status` p95 `0.7ms`.
- `library_status` p95 `16.3ms`.
- `data_loading_plan` p95 `0.7ms`.
- `read_model_status` p95 `71.1ms`.
- `read_model_reconcile_status` p95 `0.5ms`.
- `protection_status` p95 `0.6ms`.
- `release_gates` p95 `40.5ms`.
- `operations_overview` p95 `91.0ms`.
- `operation_log` p95 `20.2ms`.
- `source_videos_first_page` p95 `0.7ms`.
- `source_videos_processing` p95 `77.8ms`.
- `source_videos_index_required` p95 `229.8ms`.
- `source_videos_queued` p95 `189.8ms`.
- `preprocess_jobs` p95 `465.0ms`.
- `index_versions` p95 `221.3ms`.
- `dashboard_metrics` p95 `302.9ms`.
- Slow endpoint list: none.

Read-model control-surface finding from the same report:

- `source-video-status-read-model-v1` is fresh and persisted for the real NAS library.
- The real NAS `admin.sqlite` store exists, is `fresh`, and has `video_count=11394`.
- Reconciliation reports action `none`, reason `fresh`, scan mode `no-scan`, `requires_background_reconcile:false`, and `safe_for_page_request:true`.
- The real NAS `admin.sqlite` was built through the gated generated-metadata reconcile report `admin-read-model-reconcile-20260625T230933Z.md`, which preserved library total `11394`, ready `10471`, and `library.updated_at`.

These numbers support the current generated JSON status model plus the populated SQLite Admin read-model slice for selected route queries. They do not prove the full future Query API migration, full page IA reframe, command audit/rollback system, or Docker deployment.

## NAS Scan Entry Inventory

Current scan-sensitive entry points:

- `packages/library-fs/src/scanner.ts`: `previewSourceVideoScan`, `scanSourceVideos`.
- `packages/admin-api/src/index.ts`: `/api/admin/library/scan-preview`, `/api/admin/library/scan`.
- `packages/admin-api/src/index.ts`: source-video list/detail/read-model paths.
- `packages/admin-api/src/index.ts`: `/api/admin/preprocess/jobs`, `/api/admin/preprocess/safety`, `/api/admin/release-gates`.
- `scripts/workers/preprocess-library-worker.ts`: worker-side queue/process loop.
- `scripts/workers/publish-ready-worker.ts`: ready/index publication path.
- Acceptance scripts that may inspect real NAS state: `admin-real-nas-performance.ts`, `local-web-sanity.ts`, `local-real-nas-*`.

Rules for these entries:

- Broad folder traversal must be explicit preview/apply or maintenance.
- Single-video commands must use single-id reads.
- Status filters must use read-model snapshots where possible.
- Release gates may inspect risk state, but must not mutate source manifests.
- Doctor/full reconcile can be slow, but must not be a shell/page-open dependency.

## Data Protection Risks

High-risk invariants:

- `ready` assets must not transition to queued, processing, failed, unprocessed, or invisible-to-cutters through normal Admin commands.
- Scan apply must not remove ready manifest directories.
- Usage-events repair must only touch usage analytics files, with backup and quarantine.
- Generated Admin read models must not become source of truth over source-video manifests.
- Cutter release/index/search contracts must remain compatible.
- Local Mac path `/Volumes/MixLab/PublicLibrary/source-videos` and Docker path `/data/PublicLibrary/source-videos` must stay isolated.
- Docker upload remains blocked while disk pressure, version/build health, or runtime path parity are unsafe.

## Code Hotspots And Refactor Targets

Current line-count hotspots:

- `packages/admin-api/src/index.ts`: 5957 lines.
- `apps/admin-web/src/api.ts`: 3444 lines.
- `apps/admin-web/src/app/AdminApp.tsx`: 1777 lines.
- `apps/admin-web/src/styles.css`: 5776 lines.

These are not cleanup permission by themselves. They identify where later architecture extraction should happen after the current safety contracts are preserved.

Recommended service boundaries for the next implementation slice:

- Admin API protection/release gates service.
- Admin API data-loading plan service.
- Admin API source-video query/read-model service.
- Admin API command/protection wrapper for mutating endpoints.
- Admin Web route loader layer.
- Admin Web operations/protection feature API boundary.

## Next Implementation Boundary

This is the next safe implementation boundary after Phase 0, assuming the Project Architect review and Delivery Lead cross-check conclude that the goal has not been narrowed.

Name: `Phase 1/2 Stabilization And Service Boundary Extraction`.

Purpose:

- preserve the already implemented protection and read-model behavior;
- reduce risk from the oversized Admin API and Admin Web client files;
- make Query API, Command API, Protection Gate, and read-model responsibilities explicit;
- prepare for the later SQLite Admin read model and full page information architecture.

Likely affected files/modules:

- `packages/admin-api/src/index.ts`
- `packages/admin-api/src/index.test.ts`
- new `packages/admin-api/src/*` service modules for protection, release gates, data-loading plan, source-video queries/read-models, and command guards
- `packages/library-fs/src/scanner.ts`
- `packages/library-fs/src/preprocess-safety.ts`
- `packages/library-fs/src/admin-writer-lease.ts`
- `packages/library-fs/src/usage-events.ts`
- `apps/admin-web/src/api.ts`
- `apps/admin-web/src/app/AdminApp.tsx`
- `apps/admin-web/src/features/protection/ProtectionCenterPage.tsx`
- `apps/admin-web/src/features/admin-ui-contract.ts`
- `scripts/acceptance/admin-real-nas-performance.ts`
- `scripts/acceptance/usage-events-repair.ts`

Non-scope for the next implementation boundary:

- no NAS Docker deployment;
- no source-video media layout migration;
- no Cutter release/index/search contract change;
- no full visual redesign;
- no broad style cleanup unrelated to extracted architecture boundaries;
- no SQLite migration until the extracted service boundary is stable and tested.

## Test And Acceptance Matrix

Before implementing:

- Project Architect must review and Delivery Lead must cross-check that this Phase 0 report preserves the full `Admin Architecture v1` goal and does not shrink it; this professional role review is the scope confirmation gate and is completed by those roles.

After the next implementation slice:

- `npm run typecheck`.
- Focused tests for Admin API, scanner, preprocess safety, writer lease, usage-events, Admin Web API, Admin App, UI contract.
- `npm run build:admin-web`.
- `npm run validate:nas-docker-compose-static`.
- Real NAS read-only performance probe when API can be run in isolated auth-disabled mode.
- Manual/browser verification for Protection Center route if UI files change.

Evidence must prove:

- ready assets remain protected;
- scan preview remains read-only;
- scan apply blockers remain enforced;
- source-video non-ready filters stay fast after read-model warm-up;
- shell route does not call heavy route-owned endpoints;
- Docker release remains blocked until all gates pass;
- Cutter current release/index/search behavior is unchanged.

## Phase 0 Decision

Phase 0 is complete as an audit artifact, but the full Goal is not complete.

Recommended next step:

Proceed after the Project Architect review and Delivery Lead cross-check confirm that this boundary does not shrink `Admin Architecture v1`; the scope gate is completed by those professional roles unless the next slice introduces a new product direction, credentials, destructive operation, or irreversible release decision.

Once confirmed, start with service-boundary extraction around the existing Protection/Data Loading/Read Model implementation. Do not jump to Docker upload, full UI redesign, or broad cleanup.
