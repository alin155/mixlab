# Admin Architecture v1 Requirements Traceability

Date: 2026-06-25
Scope: Requirement-to-evidence matrix for the active `Admin Architecture v1` goal.

## Purpose

This matrix prevents two common failure modes:

- treating a phase slice as the full `Admin Architecture v1` goal;
- using narrow tests as proof of broad architecture completion.

Status labels:

- `Done`: current evidence proves the requirement at its stated scope.
- `Partial`: useful implementation or evidence exists, but the full requirement is not proven.
- `Missing`: no current implementation/evidence proves the requirement.
- `Blocked`: implementation should not proceed until an external or release gate is resolved.

## Goal-Level Traceability

| Requirement | Status | Current evidence | Missing proof / next move |
| --- | --- | --- | --- |
| Protect existing `10471+` ready assets from accidental requeue, reprocess, removal, or Cutter invisibility | Partial | `packages/admin-api/src/admin-protection.ts`; `packages/admin-api/src/admin-command-guard.ts`; `packages/admin-api/src/admin-command-audit.ts`; `packages/admin-api/src/admin-command-snapshot.ts`; `packages/admin-api/src/admin-command-restore-plan.ts`; `packages/admin-api/src/admin-command-restore.ts`; `packages/admin-api/src/admin-command-restore-routes.ts`; `packages/admin-api/src/admin-command-guard.test.ts`; `packages/admin-api/src/admin-command-audit.test.ts`; `packages/admin-api/src/admin-command-snapshot.test.ts`; `packages/admin-api/src/admin-command-restore-plan.test.ts`; `packages/admin-api/src/admin-command-restore.test.ts`; `packages/admin-api/src/admin-command-restore-routes.test.ts`; `packages/admin-api/src/admin-library-commands.test.ts`; `packages/admin-api/src/index.test.ts` covers ready requeue blocking and backend command-snapshot restore API integration on a temporary library root; `packages/library-fs/src/scanner.test.ts` covers ready-removal scan blocking; `preprocess_transition_blocked` and `scan_blocked` exist; command contracts now cover scan/publish/metadata/cover/settings/source-folder writes; all `runAdminCommand` writer-lease commands create snapshots inside the writer lease before mutation and append started/succeeded/failed operation-log audit events with contract and snapshot metadata; settings/source-folder, library init/scan, single source-video metadata/cover, bulk/source-video transitions, single source-video publish, and index repair capture selected previous files; scan snapshot tests prove active, inactive/pruned, new missing, and blocked ready-removal pre-scan evidence; restore-plan verification now blocks unsafe, missing, malformed, metadata-only, or size-mismatched snapshot restore candidates without writing files; restore execution now runs as a command-gated writer-lease service primitive that restores only fully restorable file-capture snapshots and marks the read model stale after successful restores; R.64 exposes read-only restore-plan and guarded restore API routes without weakening blockers; R.102 exposes controlled Operation Log restore execution UX through a typed POST client, command-only/no-scan data-loading contract, and two-step prepare/confirm UI while preserving backend blockers; R.103 adds a GET-only real NAS restore drill plan gate that requires a named snapshot id and records library root, total/ready counts, current index, operation-log snapshot metadata, restore-plan blockers, and future post-restore invariants before any destructive restore is allowed | Need durable read-model write-through across broader paths, remaining bounded file-content capture for any still-uncovered command paths, fully read-only scan-preview design, automatic rollback workflow, actual real NAS restore execution proof, restore drill evidence against real NAS ready count after execution, and broader restore retention/filtering design |
| Split broad scan into preview/apply with blockers | Partial | `previewSourceVideoScan`, `/api/admin/library/scan-preview`, scan apply blocker tests; `packages/admin-api/src/admin-library-commands.ts` owns the successful scan apply command service boundary; `packages/admin-api/src/admin-scan-planner.ts` owns scan-preview execution, scan-apply blocked-preview handoff, typed `scan_blocked` evidence, and no-hidden-initialization preview behavior; `packages/library-fs/src/scanner.ts` separates read-only scan plan construction from scan-apply write preparation; `packages/admin-api/src/admin-scan-modes.ts` centralizes `no-scan`, `single-id`, `paged-list`, `folder-scan`, `status-scan`, and `full-reconcile` taxonomy; `packages/admin-api/src/admin-data-loading-plan.ts` distinguishes source-folder scan commands (`folder-scan`) from read-model rebuild commands (`full-reconcile`); successful `/api/admin/library/scan` returns a read-model reconcile handoff plus `post-scan-reconcile-v1` scheduling result while blocked scan apply proves it does not mark `admin.sqlite` stale; R.45 tests prove scan preview can inspect an uninitialized library root without creating `.mixlab-library` metadata; R.46 tests prove data-loading routes reference registered endpoints and page-open routes do not advertise `full-reconcile`; R.47 tests prove scan apply schedules the existing background read-model reconciler when an existing store is invalidated instead of requiring manual inference; R.48 adds live `meta.runtime` timing/source/cache/slow metadata for the four selected slow routes | Need broader route adapter extraction, broader maintenance scheduling beyond scan apply, and runtime metadata coverage beyond the selected slow routes |
| Prevent page-load flows from hidden full NAS scans | Partial | `packages/admin-api/src/admin-data-loading-plan.ts`; `/api/admin/data-loading/plan`; Admin Web tests for shell-safe endpoints; real NAS performance artifacts; R.113 live migrated-pages browser QA proves `发布与索引`, `素材库`, `剪辑师`, `系统检查`, and `设置` render through route-owned GET endpoints against `/Volumes/MixLab/PublicLibrary` with `admin.sqlite` page-safe and `hidden_full_scan_allowed:false` | Need final scan planner module, broader runtime verification for remaining/unmigrated routes, and continued guardrails as route contracts evolve |
| Admin Query API / Command API separation | Partial | Endpoint families exist; command protections exist; `packages/admin-api/src/admin-protection.ts`, `packages/admin-api/src/admin-release-gates.ts`, `packages/admin-api/src/admin-data-loading-plan.ts`, `packages/admin-api/src/admin-route-adapter.ts`, `packages/admin-api/src/admin-auth-routes.ts`, `packages/admin-api/src/admin-read-model-routes.ts`, `packages/admin-api/src/admin-source-video-routes.ts`, `packages/admin-api/src/admin-slow-read-routes.ts`, `packages/admin-api/src/admin-system-read-routes.ts`, `packages/admin-api/src/admin-system-read-route-deps.ts`, `packages/admin-api/src/admin-preprocess-read-routes.ts`, `packages/admin-api/src/admin-preprocess-command-routes.ts`, `packages/admin-api/src/admin-settings-command-routes.ts`, `packages/admin-api/src/admin-settings-command-route-deps.ts`, `packages/admin-api/src/admin-library-command-routes.ts`, `packages/admin-api/src/admin-library-command-route-deps.ts`, `packages/admin-api/src/admin-index-command-routes.ts`, `packages/admin-api/src/admin-index-command-route-deps.ts`, `packages/admin-api/src/admin-cutter-user-command-routes.ts`, `packages/admin-api/src/admin-cutter-user-command-route-deps.ts`, `packages/admin-api/src/admin-command-restore-routes.ts`, `packages/admin-api/src/admin-command-restore-route-deps.ts`, `packages/admin-api/src/admin-runtime-diagnostic-routes.ts`, `packages/admin-api/src/admin-runtime-diagnostic-route-deps.ts`, `packages/admin-api/src/admin-runtime-observability-routes.ts`, `packages/admin-api/src/admin-runtime-observability-route-deps.ts`, `packages/admin-api/src/admin-protection-read-routes.ts`, `packages/admin-api/src/admin-protection-read-route-deps.ts`, `packages/admin-api/src/admin-preprocess-pipeline.ts`, `packages/admin-api/src/admin-source-video-media-routes.ts`, `packages/admin-api/src/admin-source-video-command-routes.ts`, `packages/admin-api/src/admin-source-video-query.ts`, `packages/admin-api/src/admin-source-video-read-model.ts`, `packages/admin-api/src/admin-source-video-status-read-model-runtime.ts`, `packages/admin-api/src/admin-source-video-list-query.ts`, `packages/admin-api/src/admin-source-video-status-page-query.ts`, `packages/admin-api/src/admin-source-video-index-query.ts`, `packages/admin-api/src/admin-source-video-default-page-query.ts`, `packages/admin-api/src/admin-source-video-filtered-page-query.ts`, `packages/admin-api/src/admin-source-video-manifest-cache.ts`, `packages/admin-api/src/admin-source-video-detail-query.ts`, `packages/admin-api/src/admin-index-versions-query.ts`, `packages/admin-api/src/admin-dashboard-metrics-query.ts`, `packages/admin-api/src/admin-dashboard-metrics-cache.ts`, `packages/admin-api/src/admin-transcript-metrics-query.ts`, `packages/admin-api/src/admin-usage-metrics-query.ts`, `packages/admin-api/src/admin-command-guard.ts`, `packages/admin-api/src/admin-command-audit.ts`, `packages/admin-api/src/admin-command-runtime.ts`, `packages/admin-api/src/admin-read-model-invalidation.ts`, `packages/admin-api/src/admin-settings-commands.ts`, `packages/admin-api/src/admin-library-commands.ts`, `packages/admin-api/src/admin-transition-commands.ts`, `packages/admin-api/src/admin-publish-commands.ts`, `packages/admin-api/src/admin-source-video-commands.ts`, and `packages/admin-api/src/admin-scan-planner.ts` extract the first service boundaries; all current writer-lease commands are contract-named, audited, and `packages/admin-api/src/index.ts` no longer calls `withAdminWriterLease` directly; R.49 removes API envelope construction and selected route pagination parsing from local `index.ts` helpers; R.50 extracts the read-model/operations/data-loading route group behind explicit dependencies; R.51 extracts the source-videos list/detail read-only route group behind explicit dependencies; R.52 extracts dashboard metrics, preprocess jobs list, and index versions runtime-observed read routes behind explicit dependencies; R.53 extracts selected library/status, settings/runtime, doctor, and cutter-users read-only routes behind explicit dependencies; R.54 extracts selected preprocess job-log, supervisor status, and safety read-only routes behind explicit dependencies; R.55 extracts the source-video cover GET media route behind an injected streaming writer; R.56 extracts source-video cover/metadata PATCH command route adapters behind injected command services; R.57 extends that adapter to source-video queue/retry/recover-processing/publish POST command routes behind injected transition/publish command services; R.58 extracts preprocess supervisor start/stop route adapters behind injected settings, runtime-secret, safety, and supervisor dependencies; R.59 extracts settings config and source-folder add/update/remove command route adapters behind injected settings/source-folder command services; R.60 extracts library init/scan/scan-preview route adapters behind injected library command, scan planner, cache, and read-model reconcile scheduler dependencies; R.61 extends preprocess command route adapters to bulk queue/retry/recover-processing behind injected transition command, supervisor-block, and cache dependencies; R.62 extracts index repair command routing behind injected publish command and cache dependencies; R.63 extracts cutter-user approve/disable/password command routing behind injected account mutation dependencies; R.64 extracts backend command snapshot restore-plan/restore routing behind injected resolver, restore planner, restore primitive, and supervisor-block dependencies; R.65 extracts runtime diagnostic POST routing behind injected runtime-secret refresh, Doctor run/export, and test-ASR dependencies; R.66 extracts protection status, release gates, and path-check read routing behind injected protection/release/path-check dependencies; R.67 extracts health/auth route handling behind injected health/bootstrap/session/account dependencies; R.69 adds a Query-layer dashboard metrics reader/cache boundary with tested hit/miss/pending runtime status; R.70 adds a durable usage metrics Query/read-model projection under `.mixlab-library/admin-read-model/usage-metrics.sqlite`; R.72 wires dashboard material counters through an optional Admin read-model store summary reader; R.73 wires dashboard production counters through an optional Admin read-model preprocess-job snapshot reader; R.74 extends the store-backed preprocess/jobs page path to ready-history rows when complete manifest/job snapshots exist; R.75 moves the usage metrics projection schema/state to `library-fs` and lets Admin usage metrics reuse exact append-time write-through state; R.76 adds a bounded runtime diagnostics history Query route and best-effort write-through hooks for the existing runtime-observed read routes; R.77 adds a dependency-injected `/api/admin/preprocess/process-history` Query route backed only by complete `admin.sqlite` manifest/job snapshots; R.155 extracts library command route dependency assembly behind a tested factory while preserving scan/init context and read-model reconcile handoff; R.156 extracts index command route dependency assembly behind a tested factory while preserving ready-publish media and cache invalidation context; R.157 extracts settings command route dependency assembly behind a tested factory while preserving runtime-secret refresh and read-model invalidation context; R.158 extracts cutter-user command route dependency assembly behind a tested factory while preserving actor/time context and public response projection; R.159 extracts command restore route dependency assembly behind a tested factory while preserving restore preflight, supervisor block, and audit/read-model invalidation context; R.160 extracts runtime diagnostic route dependency assembly behind a tested factory while preserving runtime-secret refresh, Doctor run/export, and ASR config-check context; R.161 extracts system read route dependency assembly behind a tested factory while preserving library status, settings config/runtime, Doctor report, and cutter-user public projection context; R.162 extracts protection read route dependency assembly behind a tested factory while preserving protection status, release gates, and path-check root projection context; R.163 extracts runtime observability route dependency assembly behind a tested factory while preserving diagnostics history input and bounded route behavior; R.164 extracts preprocess pipeline orchestration and default real runner assembly while preserving scan/queue/publish decisions, lifecycle command injection, cache invalidation, and real-start gating; R.174 extracts Dashboard transcript metrics aggregation behind a dedicated Query module while preserving current-index metadata shortcut behavior and artifact summary reads | `packages/admin-api/src/index.ts` still mixes reconciler snapshot wiring, runtime diagnostics wiring, process-history response projection, and other server assembly concerns |
| Admin read model for daily management queries | Partial | `source-video-status-read-model-v1` JSON under `.mixlab-library/admin/read-models`; `packages/admin-api/src/admin-source-video-read-model.ts` owns JSON model schema/parse/freshness/count rules; `packages/admin-api/src/admin-source-video-status-read-model-runtime.ts` owns the JSON read-model path, in-memory freshness cache, pending-build coalescing, persisted read/write, indexed fast build, full-manifest fallback build, manifest-cache seeding, background warming, clear behavior, and status payload; `packages/admin-api/src/admin-read-model-store.ts` owns `.mixlab-library/admin-read-model/admin.sqlite` schema/path/status, selected fresh non-ready status query pages, bounded `preprocess/jobs` active first-page and ready-history page manifests, metadata-backed counts, complete-snapshot dashboard material summary metadata, complete-snapshot preprocess-job status rows for Dashboard production summary and ready-history job pages, per-status paged queries, single and selected batch source-video write-through, metadata-only stale marking, and the reconciliation planner/snapshot rebuild contract; `packages/admin-api/src/admin-usage-metrics-query.ts` owns the Admin runtime wrapper for the rebuildable `.mixlab-library/admin-read-model/usage-metrics.sqlite` summary projection; `packages/library-fs/src/usage-events.ts` owns the shared usage projection schema, file signature helpers, projection state, exact append-time write-through, and safe invalidation fallback after successful usage-event writes; `packages/admin-api/src/admin-runtime-observability.ts` owns the bounded `.mixlab-library/admin-read-model/runtime-diagnostics.ndjson` diagnostics history helpers; `packages/admin-api/src/admin-read-model-reconciler.ts` adds a controlled background reconcile runner with phase/progress/cancel/recent-event status and can pass preprocess-job snapshots into the store rebuild; `packages/admin-api/src/admin-operation-log.ts` persists read-model reconcile lifecycle and invalidation events; `packages/admin-api/src/admin-command-guard.ts` now classifies settings/source-folder/library-scan read-model invalidation and reconcile requirements; `packages/admin-api/src/admin-read-model-invalidation.ts` owns the command-to-store-invalidation handoff boundary and operation-log event contract; tests for freshness/stale rebuild, JSON runtime cache/coalescing/indexed/fallback/clear/status behavior, SQLite store freshness, dashboard material summary complete-snapshot/placeholder/write-through behavior, dashboard production summary complete-job-snapshot/incomplete-snapshot/write-through invalidation behavior, usage summary first-read persistence/fingerprint invalidation/missing-event-file summary/no-stale-persist-on-race, exact append-time usage summary write-through, safe invalidation for legacy state-less usage projections, bounded runtime diagnostics history and malformed-line tolerance, `/api/admin/source-videos?status=index-required` from `admin.sqlite`, `/api/admin/preprocess/jobs?limit=2` from `admin.sqlite`, ready-history `/api/admin/preprocess/jobs` from `admin.sqlite` without physical ready job files, process-history source-folder and daily trend summaries plus source-folder/status/event filters from complete `admin.sqlite` job snapshots, runtime diagnostics history after selected route calls, single queue write-through, bulk queue/retry/recover write-through, metadata write-through, publish/index repair write-through, cover replacement write-through, source-folder/settings invalidation policy, source-folder/settings runtime stale marking, read-model invalidation operation-log events, scan apply read-model reconcile handoff, no-scan fresh-store reconciliation planning, inconsistent snapshot rejection, explicit background rebuild of missing `admin.sqlite`, cancel-before-write behavior, operation-log append/read tolerance, gated reconcile script behavior, and read-only performance probe coverage; real NAS `admin-read-model-reconcile-20260625T230933Z.md` proves gated rebuild succeeded for 11394 manifests without changing library/ready counts; real NAS `admin-real-nas-performance-20260625T231116Z.md` proves `admin.sqlite` is fresh and `safe_for_page_request:true`; R.106 live browser QA proves R.105 filters hit real NAS-backed `admin.sqlite` without scans | Real NAS `admin.sqlite` is now populated and serves selected non-ready/status job paths, R.70/R.71 add a local-test-proven usage summary projection plus append-time invalidation, R.72 adds locally verified dashboard material duration/size summary metadata only from complete snapshots while refusing placeholder-only stores, R.73 adds locally verified Dashboard production counters only from complete preprocess-job snapshots, R.74 adds locally verified ready-history `preprocess/jobs` pages from complete manifest/job snapshots, R.75 adds locally verified exact usage summary append-time write-through when a stateful projection exists, R.76 adds locally verified bounded runtime diagnostics history for selected runtime-observed routes, R.104 adds locally verified process-history source-folder and daily trend summaries from complete `admin.sqlite` snapshots, R.105 adds locally verified process-history source-folder/status/event filtering from complete `admin.sqlite` snapshots, and R.106 proves those filters against real NAS-backed `admin.sqlite` through GET-only API/browser QA. Existing real NAS stores may need a future gated rebuild, one Dashboard miss/rebuild, or route traffic before exposing all newer metadata/tables/state/history. Ready/default source-video pages, deeper process-history charting/drill-through beyond R.106 filter proof, broader dashboard store coverage, full command audit/rollback, automatic maintenance scheduling, scanner apply write-through/rebuild automation, broader runtime endpoint coverage, and broader operation-log filtering are not complete |
| Route loader / local error / request cancellation frontend architecture | Partial | Route-owned loaders and prefetch controls exist; `admin-data-loading-plan.ts` defines shell/route/background/command contract; `apps/admin-web/src/features/protection/api.ts` owns the Protection Center route-owned read-only loader contract; tests cover shell safe loading and Protection Center endpoint isolation; R.111 fixes the Doctor route loader to read `/api/admin/doctor/report` through `getDoctorReport()` instead of running probes on route entry, and adds a pending-report handoff so a report resolving before shell data is no longer dropped; R.112 hardens the Settings route loaders for `/api/admin/library/path-checks` and `/api/admin/settings/runtime` with duplicate-load guards, reload-token tracking, shell-data merge, and pending handoff for responses that arrive before shell data; R.113 adds live local NAS browser evidence for the five migrated routes with direct data-loading plan checks and route endpoint contracts; R.114 adds an abortable Admin API client scope and connects the first route-entry loader group to real `AbortSignal` cleanup; R.115 extends abortable scoped clients into Dashboard supplemental metrics, route prefetch, Dashboard panel refresh, and preprocess interval refresh, with cleanup aborts and non-overlap guards for interval reads; R.116 extracts a reusable `createRuntimeRequestScope(...)` helper so route/background loaders bind `AbortSignal` and cleanup aborts through one audited path; R.117 adds an isolated runtime/browser QA gate that proves delayed `GET /api/admin/source-videos` closes before response when the browser leaves `#/source-videos`; R.118 defines the matching command-action policy so protected mutating commands continue through the stable runtime client, block duplicate starts, and do not inherit route cleanup abort behavior; R.119 exposes explicit read-model reconcile start/cancel maintenance controls while keeping status loading as an abortable no-scan route read; R.120 adds isolated browser QA proving those Protection Center controls issue only the expected read-model reconcile start/cancel POSTs against a mock API and do not call forbidden command endpoints; R.250 centralizes route-local read-error ownership in `route-loading-runtime.ts`; R.251 centralizes visible route loading specs, background refresh/prefetch specs, and render-time loading state derivation in the same runtime contract; R.252 moves pure route loader planner decisions (`shouldAutoRefreshAdminData`, `shouldLoadAdminSourceVideos`, `shouldPrefetchAdminRoute`) into `route-loading-runtime.ts` and tests that `AdminApp.tsx` consumes rather than owns them; R.253 moves token-based route-loader start guards (`shouldStartAdminRouteTokenLoad`) into `route-loading-runtime.ts` for Doctor report, Doctor runtime diagnostics, Settings path checks, and Settings runtime loaders; R.254 promotes those token loaders into `ADMIN_ROUTE_TOKEN_LOAD_SPECS` with route/loading/local-error/shell-data metadata and updates `AdminApp.tsx` to use loader keys instead of repeated `expectedRoute` metadata; R.255 extends the same registry with abortable request-scope, client-method, success-target, error-surface, and pending-handoff metadata for the migrated Doctor/Settings token loaders; R.256 adds `createAdminRouteTokenRequestScope(...)` so the migrated token effects obtain request scopes through the registry-backed start boundary instead of directly calling the start guard plus scope factory; R.257 adds `startAdminRouteTokenLoad(...)` so the migrated token effects share one start/request/success/error/settled/cancel execution runner while preserving request methods, local error surfaces, pending handoff, and cleanup abort behavior | Need broader page-level route loader effect extraction, future runtime coverage for newly added risk-bearing loaders, separately gated live validation for maintenance commands if needed, and the same pending-data audit for remaining route-owned loaders |
| Slow endpoint targets for `processing`, `index-required`, `preprocess/jobs`, `index/versions`, dashboard metrics | Partial | `admin-real-nas-performance-20260625T231116Z.md` shows all sampled endpoint gates passing after real NAS `admin.sqlite` rebuild and store query optimization: `source_videos_processing` p95 `77.8ms`, `source_videos_index_required` p95 `229.8ms`, `source_videos_queued` p95 `189.8ms`, `preprocess_jobs` p95 `465.0ms`, `index_versions` p95 `221.3ms`, `dashboard_metrics` p95 `302.9ms`; `admin-source-video-query.ts`, `admin-source-video-read-model.ts`, and `admin-read-model-store.ts` centralize pure query/model/store rules; R.69 adds a per-library dashboard metrics Query-layer TTL reader so repeated dashboard refreshes can avoid re-reading `usage-events/events.ndjson` and runtime-load probes within the cache window; R.70 adds a durable usage metrics summary projection so a dashboard metrics miss can reuse validated usage aggregation from `.mixlab-library/admin-read-model/usage-metrics.sqlite` when the event-file fingerprint is unchanged; R.71 removes that derived projection best-effort after successful usage-event appends; R.72 lets large-library dashboard material duration/size counters read from fresh complete-snapshot `admin.sqlite` metadata without manifest reads; R.73 lets large-library dashboard production counters read from complete preprocess-job snapshot rows in `admin.sqlite` without manifest or job-file reads; R.74 lets ready-history `preprocess/jobs` pages read from complete preprocess-job snapshot rows in `admin.sqlite` without per-ready-row job-file reads; R.75 lets fresh stateful usage projections survive appends through exact write-through so the next dashboard usage read can still hit `admin-read-model`; R.76 persists selected endpoint runtime metadata history so endpoint duration/source/scan/cache/slow evidence survives after individual page responses; R.104 adds locally verified process-history source-folder and daily trend summaries from complete `admin.sqlite` snapshots without page-time job-file reads; R.105 adds locally verified source-folder/status/event process-history filters without page-time job-file reads; R.106 proves the filtered path live against real NAS-backed `admin.sqlite` with baseline and filtered process-history GET probes | These targets are met for sampled first-page/status paths and locally verified ready-history preprocess job pages plus exact usage projection append-time write-through, bounded diagnostics history, R.104 source/trend process-history summaries, R.105 no-scan process-history filters, and R.106 real NAS filter proof. Deeper `index/versions`, process-history charting/drill-through beyond R.106 filter proof, broader dashboard store coverage, command-driven dashboard cache invalidation, and broader query paths still need store/query-layer work |
| Admin page information architecture: Overview, Protection Center, Source Library, Preprocess, Publish and Index, Cutter Users, System Checks, Settings, Operation Log | Partial | Navigation now exposes the full production-console route set as `总览`, `保护中心`, `素材库`, `预处理`, `发布与索引`, `剪辑师`, `系统检查`, `设置`, `操作记录`; `apps/admin-web/src/app/navigation.ts` keeps legacy aliases while making `index-publish` and `doctor` first-class routes; `apps/admin-web/src/app/AdminApp.tsx` renders the existing `IndexPublishPage` as a route-owned page; `apps/admin-web/src/features/admin-ui-contract.ts` and `packages/ui-foundation/src/design-contract.ts` enforce the nine-page IA; `packages/admin-api/src/admin-operations-overview.ts` owns the read-only operations overview aggregate; `apps/admin-web/src/features/operation-log/OperationLogPage.tsx` exposes the no-scan operation-log route as an audit and controlled restore surface; R.84 proves the live `#/preprocess-jobs` route can render real NAS process-history rows from `admin-read-model` / `no-scan` / `hit` state at desktop and 390px mobile widths; R.102 adds two-step command-snapshot restore execution controls to Operation Log without moving restore POST into shell or dashboard loading; R.104 adds source-folder and daily-trend process-history cards to the route-owned Preprocess page from the same no-scan Query API; R.105 adds route-owned source/status/event filter controls for that process-history surface without Dashboard coupling; R.106 proves those controls work in live desktop/mobile browser QA against real NAS-backed `admin.sqlite`; R.107 adds a tested production-console page composition/data-loading contract that cross-checks every Admin page against backend route plans, adds the missing `index-publish` route plan, prohibits hidden full scans and non-Dashboard dashboard coupling, and requires route-local page surfaces; R.108 migrates `发布与索引` into the production-console composition with explicit publication queue, index-version support surface, version inspector, read-model/index-package provenance, no-scan labels, route-local browser QA, and summary-only fallback handling; R.109 migrates `素材库` into the production-console composition with explicit asset table, metadata inspector, read-model provenance, paged/no-scan route language, page-control filter semantics, loaded-count visibility, and desktop/mobile fixture browser QA; R.110 migrates `剪辑师` into the production-console composition with explicit user table, usage overview, user-store provenance, command-only account operations, no-scan labels, route-local browser QA, and inspector page-contract rows; R.111 migrates `系统检查` into the production-console composition with explicit diagnostic report, Doctor report data source, `doctor-route` scan reason, route-local report loading, export boundary, route-local browser QA, and inspector page-contract rows; R.112 migrates `设置` into the production-console composition with explicit settings form, source-folder configuration, runtime policy, path/runtime probe provenance, local edit boundary, command-only save/test/init boundary, no-scan settings-route labels, fixture browser QA, and inspector page-contract rows; R.113 adds live local NAS browser QA for the five migrated R.108-R.112 pages; R.114 adds the first route-entry request cancellation foundation under those route loaders; R.115 adds cancellation coverage for background refresh/prefetch reads; R.116 extracts a reusable request-scope helper to reduce future loader drift; R.117 adds runtime browser proof that the route-owned `素材库` GET can be cancelled on navigation before a delayed response completes; R.118 adds command-action lifecycle policy coverage for the current Admin Web command surfaces; R.119 adds explicit read-model reconcile start/cancel controls to Protection Center; R.120 adds isolated browser evidence that those controls can be operated from the real Protection Center page while only hitting mock read-model reconcile command endpoints | Full page-composition migration across all routes, broader command audit filtering/search, real NAS restore drill UI proof, separately gated live maintenance validation if needed, and consistent inspector/table/header implementation across every page not complete |
| Redundant code governance | Missing | Hotspots identified: Admin API main file, Admin Web API file, AdminApp, styles | No systematic cleanup has started; cleanup must follow stable boundaries and tests |
| Docker release gate with path isolation, usage-events, V001440, disk, version/health parity | Partial / Blocked | Static Docker compose validation; release gates; usage-events repair evidence; V001440 recovered locally | No NAS Docker update; physical disk pressure remains a release blocker; version/health parity must be proven on NAS before upload |
| Cutter release/index/search compatibility | Partial | Goal and tests preserve current Cutter contract; previous Windows evidence shows `10471` ready release consumption | Need explicit post-Admin-slice regression check that Cutter reads current release/index/search unchanged |

## Phase Traceability

R.175 traceability addendum: `packages/admin-api/src/admin-source-video-read-facade.ts` now owns source-video default/status/filter/preprocess manifest-page read orchestration and runtime source/cache metadata assembly outside `packages/admin-api/src/index.ts`. It preserves route paths, response envelopes, current-index ready reads, `admin.sqlite` status pages, manifest-cache fallback, NAS data, Docker state, Worker behavior, and Cutter protocols. This strengthens Admin Query API separation and Phase 5 large-file governance, but it does not complete the full Goal.

R.176 traceability addendum: `packages/admin-api/src/admin-dashboard-read-facade.ts` now owns Dashboard metrics dependency assembly, Dashboard cache loader wiring, transcript metrics handoff, usage runtime wrapping, and runtime-load reader handoff outside `packages/admin-api/src/index.ts`. It preserves route paths, response envelopes, Dashboard source metadata, large-library read-model summary mode, current-index transcript metadata, usage-events projection behavior, NAS data, Docker state, Worker behavior, and Cutter protocols. This strengthens Admin Query API separation and Phase 5 large-file governance, but it does not complete the full Goal.

R.177 traceability addendum: `packages/admin-api/src/admin-read-model-server-facade.ts` now owns read-model reconciler runtime construction, read-model route dependency assembly, and post-scan reconcile scheduling handoff outside `packages/admin-api/src/index.ts`. It preserves route paths, response envelopes, reconciler behavior, post-scan scheduling policy, source-video page-cache clearing, operation-log append behavior, NAS data, Docker state, Worker behavior, and Cutter protocols. This strengthens Admin read-model/API separation and Phase 5 large-file governance, but it does not complete the full Goal.

R.178 traceability addendum: `packages/admin-api/src/admin-auth-route-deps.ts` now owns Admin auth route dependency assembly outside `packages/admin-api/src/index.ts`, including bootstrap reads, session validation, register/login/logout command wiring, public-user projection, and request JSON handoff. It preserves route paths, response envelopes, session-token parsing, disabled-auth behavior, password-auth commands, NAS data, Docker state, Worker behavior, and Cutter protocols. This strengthens Admin API dependency separation and Phase 5 large-file governance, but it does not complete the full Goal.

R.179 traceability addendum: `packages/admin-api/src/admin-health-query.ts` now owns Admin health and preprocess safety read assembly outside `packages/admin-api/src/index.ts`, including build metadata, runtime path profile, primary source-videos path projection, disk safety threshold, shallow/deep processing guard selection, and read-model processing-id handoff. It preserves `/health`, release-gate safety checks, preprocess safety/start blocking behavior, NAS data, Docker state, Worker behavior, and Cutter protocols. This strengthens Admin Query API separation and Phase 5 large-file governance, but it does not complete the full Goal.

R.180 traceability addendum: `packages/admin-api/src/admin-protection-query.ts` now owns Admin protection status, release-gate status, and path-check read assembly outside `packages/admin-api/src/index.ts`, including library/current-index inputs, runtime build/path projection, deep preprocess safety handoff, usage-events release evidence, and configured source-folder path checks. It preserves protection/read route paths, response envelopes, read-model route dependencies, release gate semantics, NAS data, Docker state, Worker behavior, and Cutter protocols. This strengthens protection/read Query API separation and Phase 5 large-file governance, but it does not complete the full Goal.

R.181 traceability addendum: `packages/admin-api/src/admin-preprocess-jobs-read-facade.ts` now owns `preprocess/jobs` runtime-meta read assembly outside `packages/admin-api/src/index.ts`, including read-model page fast path, manifest fallback, ready-history snapshot projection, physical job-record fallback, runtime-load enrichment, source/cache metadata, and route response shape preservation. It preserves preprocess job route behavior, NAS data, Docker state, Worker behavior, and Cutter protocols. This strengthens the named slow-endpoint Query/API boundary and Phase 5 large-file governance, but it does not complete the full Goal.

R.182 traceability addendum: `packages/admin-api/src/admin-http-session.ts` now owns Admin HTTP request/response helpers and session actor guard assembly outside `packages/admin-api/src/index.ts`, including JSON request parsing, CORS JSON/no-content response writing, public media route classification, disabled-auth actor creation, password-auth session validation handoff, login-required error envelopes, and admin-user-to-command-actor projection. It preserves auth/session route behavior, command actor semantics, NAS data, Docker state, Worker behavior, and Cutter protocols. This strengthens Admin API/server-shell separation and Phase 5 large-file governance, but it does not complete the full Goal.

R.183 traceability addendum: `packages/admin-api/src/admin-file-fact-readers.ts` now owns Admin file-fact JSON readers outside `packages/admin-api/src/index.ts`, including generic JSON parsing, `library.json` reads, `preprocess-job.json` reads, malformed/missing manifest/job tolerance, and ENOENT classification used by detail/transcript helpers. It preserves route behavior, file-system fact-source semantics, read-model fallback behavior, NAS data, Docker state, Worker behavior, and Cutter protocols. This strengthens file-system fact-source boundary clarity and Phase 5 large-file governance, but it does not complete the full Goal.

R.184 traceability addendum: `packages/admin-api/src/admin-source-video-cover-response.ts` now owns Admin source-video cover GET response assembly outside `packages/admin-api/src/index.ts`, including manifest-read fallback-to-404 behavior, artifact path resolution, file-existence checks, image content-type projection, CORS headers, and injected stream writing. It preserves cover GET route semantics, public media bypass scope, cover upload command behavior, NAS data, Docker state, Worker behavior, and Cutter protocols. This strengthens read-only media response API separation and Phase 5 large-file governance, but it does not complete the full Goal.

R.185 traceability addendum: `packages/admin-api/src/admin-preprocess-supervisor-status.ts` now owns Admin preprocess supervisor public status projection outside `packages/admin-api/src/index.ts`, including state/timestamp/error/stop-request fields and redacted `last_result` count projection. It preserves supervisor lifecycle behavior, start/stop command behavior, worker result redaction, NAS data, Docker state, Worker behavior, and Cutter protocols. This strengthens runtime-status projection separation and Phase 5 large-file governance, but it does not complete the full Goal.

### Phase 0: Baseline Audit

| Requirement | Status | Evidence |
| --- | --- | --- |
| Current Admin architecture and API state report | Done | `docs/architecture/admin-architecture-v1.md`; `docs/architecture/admin-architecture-v1-phase-0-audit.md` |
| Page loading and slow endpoint baseline | Done for current baseline | `docs/acceptance/artifacts/admin-real-nas-performance-20260625T184329Z.md`; `docs/acceptance/artifacts/admin-real-nas-performance-20260625T190816Z.md`; `docs/acceptance/artifacts/admin-real-nas-performance-20260625T225143Z.md`; `docs/acceptance/artifacts/admin-real-nas-performance-20260625T231116Z.md` |
| NAS scan entry inventory | Done for current scan-sensitive entry points | `admin-architecture-v1-phase-0-audit.md` |
| Data protection risk list | Done for current phase | `admin-architecture-v1-phase-0-audit.md` |
| First implementation file/module list | Done | `admin-architecture-v1-next-implementation-plan.md` |
| Testing and acceptance matrix | Done | `admin-architecture-v1-phase-0-audit.md`; `admin-architecture-v1-next-implementation-plan.md` |
| Explicit full-goal vs slice statement | Done | Both docs state current slice is not full `Admin Architecture v1` |

### Phase 1: Preprocess Protection v1

| Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- |
| Ready immutable status policy | Partial | `packages/admin-api/src/admin-protection.ts`; `packages/admin-api/src/admin-command-guard.ts`; ready requeue and guard tests; command contracts classify cover/metadata as single-id source-video mutations | Need all command I/O centralized through command services and audit trail |
| scan-preview read-only | Partial | `previewSourceVideoScan`; `packages/library-fs/src/scanner.test.ts` proves preview over an uninitialized library root reports new videos without creating `.mixlab-library`; `packages/admin-api/src/admin-scan-planner.test.ts` proves Admin scan preview service no longer initializes library metadata before previewing; scan preview ready-removal blocker tests remain green | Need scan planner type/contract across all scan-sensitive endpoints and browser/admin UI exposure |
| scan-apply blocker for ready removal | Partial | `scan_blocked`; scanner/Admin API tests | Need extracted protection service and real NAS non-mutating proof |
| Writer lock | Partial | `withAdminWriterLease`; `admin-command-runtime.ts`; `admin-command-runtime.test.ts`; `admin_writer_busy` tests; transition specs, command contracts, lock-held command snapshots, dynamic snapshot planning, and writer-lease runtime execution are now separate from route implementation; no current `withAdminWrite(input, "...")` route-local command strings remain; `packages/admin-api/src/index.ts` no longer imports `withAdminWriterLease` | Need all mutating endpoint I/O moved through command services with rollback execution hooks |
| Snapshot / audit / rollback | Partial | `packages/admin-api/src/admin-operation-log.ts` persists read-model reconcile lifecycle, read-model invalidation events, and command audit events to `.mixlab-library/admin/operation-log/events.ndjson`; `packages/admin-api/src/admin-command-audit.ts` maps writer-lease command contracts to best-effort operation-log events with scan mode, mutation targets, read-model invalidation policy, holder, sanitized failure details, and `command_snapshot` metadata; `packages/admin-api/src/admin-command-runtime.ts` creates snapshots inside the writer lease and supports dynamic snapshot planners; `packages/admin-api/src/admin-command-snapshot.ts` writes command `snapshot.json` files under `.mixlab-library/admin/command-snapshots`, supports metadata-only and targeted file-capture snapshots, skips unsafe outside-library files, and marks `rollback_status: "not-implemented"`; `packages/admin-api/src/admin-command-restore-plan.ts` reads file-capture snapshots and returns a no-write restore safety plan with per-file blockers; `packages/admin-api/src/admin-command-restore.ts` runs a dedicated command-gated restore primitive that recomputes the plan inside the writer lease, snapshots current targets before overwrite, refuses blocked/metadata-only/out-of-root plans without copying, restores only captured files, creates missing target directories, emits command audit, and marks the read model stale after successful restores; `packages/admin-api/src/admin-command-restore-routes.ts` exposes read-only restore-plan and guarded restore API routes without trusting URL paths or weakening blockers; `/api/admin/operation-log` reads a bounded no-scan tail; R.102 adds Operation Log restore execution UX with read-only preflight, local prepare state, command-only confirm execution, result/blocker rendering, and typed POST client coverage; R.103 adds `scripts/acceptance/admin-command-restore-drill-plan.ts`, a GET-only candidate restore drill gate that rejects metadata-only, missing, blocked, or oversized snapshots before any future restore POST; tests prove append/read, invalidation detail preservation, malformed-line tolerance, command audit metadata, metadata-only and file-capture snapshot schema, lock-held pre-mutation file copy, dynamic planner timing, success/failure/writer-busy command audit, snapshot unavailable audit details, settings/source-folder file capture, library init/scan file capture, source-video manifest/cover capture, bulk/source-video transition capture, publish/index repair capture, restore-plan safety blockers, restore-plan compatibility for fully captured scan snapshots, blocked restore no-copy behavior, successful restore execution, restore route blocking, Admin API restore integration, best-effort audit/snapshot behavior, typed restore POST, two-step UI rendering, and plan-only restore drill gating | This is an operation-log, command-audit, targeted file-capture, restore-plan, backend restore primitive, guarded backend restore API, controlled restore UI, and plan-only restore drill foundation only; no automatic rollback workflow, source media backup, retention policy, actual real NAS restore execution, broader audit filtering/search, or full restore governance is proven |
| Protection Center as UI entry, not backend substitute | Partial | `ProtectionCenterPage` is read-only; UI contract classifies controls; `packages/admin-api/src/admin-protection-read-routes.ts` and `packages/admin-api/src/admin-protection-read-routes.test.ts` keep protection, release-gate, and path-check read response routing outside `index.ts` without replacing backend gates; R.102 keeps restore execution in Operation Log as a command action instead of treating Protection Center as a backend substitute | Need future Protection Center mutating controls, real NAS restore drill proof, and browser proof across the full production-console flow |

### Phase 2: Data Loading Architecture

| Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- |
| Shell/route split | Partial | `packages/admin-api/src/admin-data-loading-plan.ts`; `/api/admin/data-loading/plan`; shell loader tests | Need browser runtime evidence after broader route refactor |
| Route-local failure | Partial | Admin Web tests cover localized errors | Need page matrix runtime proof |
| Request cancellation | Partial | R.114 adds optional `AbortSignal` binding to the typed Admin API client and wires abortable scoped clients into the first route-entry loader group; tests prove fetch receives the signal and route-loader code does not rely only on stale setState guards. R.115 adds abortable scoped clients and cleanup aborts for Dashboard supplemental metrics, route prefetch, Dashboard panel refresh, and preprocess interval refresh; tests prove interval refreshes track an active request scope and skip overlapping background reads. R.116 extracts `createRuntimeRequestScope(...)` so signal binding, scoped client creation, and cleanup aborts flow through one helper; tests reject direct per-effect signal binding, `scopedClient` reintroduction, raw controller construction outside the helper, and raw interval-controller tracking. R.117 adds `scripts/acceptance/admin-request-cancellation-browser-qa.ts` and runtime evidence `admin-request-cancellation-browser-qa-20260626T184659Z.json/.md`, proving delayed `GET /api/admin/source-videos?limit=20` is closed before response when navigating from `#/source-videos` back to `#/dashboard`. R.118 adds an explicit Admin Web command-action cancellation policy: protected mutating commands forbid transport abort, continue across route navigation through the stable runtime client, block duplicate frontend submissions while in flight, and reserve safe-checkpoint cancellation for explicit maintenance cancel commands. R.119 makes that safe-checkpoint boundary concrete for read-model reconcile start/cancel controls without moving maintenance commands into route cleanup aborts. R.120 adds isolated browser evidence that clicking those controls posts only the explicit maintenance command endpoints and never relies on route cleanup aborts | Need future coverage as new route/background loaders and maintenance controls are added |
| Background refresh not blocking shell | Partial | Dashboard refresh tests | Need broader route matrix coverage |
| Slow endpoints observable with source/scan-mode/reason | Partial | `admin-data-loading-plan.ts` centralizes endpoint phase/cost/scan-mode/read-model notes; `packages/admin-api/src/admin-scan-modes.ts` owns stable scan-mode, data-source, and scan-reason vocabularies; every data-loading endpoint now exposes `scan_mode`, `data_source`, and `scan_reason`; `packages/admin-api/src/admin-runtime-observability.ts` adds the live endpoint metadata schema plus bounded runtime diagnostics history under `.mixlab-library/admin-read-model/runtime-diagnostics.ndjson`; `/api/admin/source-videos`, `/api/admin/preprocess/jobs`, `/api/admin/index/versions`, and `/api/admin/dashboard/metrics` now return top-level `meta.runtime` with duration, planned scan mode/source/reason, actual data source, cache status, result count, pagination, slow flag, and slow reason without changing `data`; `/api/admin/runtime/diagnostics/history` returns a bounded newest-first no-scan history of those runtime samples; `admin-index-versions-query.ts` reports directory-page/cache-hit/current-pointer-fast-page runtime sources; R.69 makes dashboard metrics report real `miss`, `hit`, or `pending` cache status instead of fixed `not-applicable`; R.70 lets dashboard metrics preserve the injected query loader's actual source, including `admin-read-model` when the usage summary projection is fresh; R.71 adds append-time invalidation of that derived projection after usage-event writes; R.72 lets dashboard material counters use store-backed summary metadata when the store is fresh and complete; R.73 lets dashboard production counters use store-backed preprocess-job snapshot rows when the store is fresh and complete; R.74 lets ready-history preprocess job pages use store-backed job snapshots when the store is fresh and complete; R.75 lets usage appends preserve a fresh `admin-read-model` cache source when exact write-through succeeds; R.76 makes selected runtime samples persistent and proves best-effort recording cannot break page responses; R.225 surfaces the bounded runtime diagnostics history in Admin Web System Check with source, scan, cache, timing, malformed-line, and component-cost labels; tests prove explicit scan commands use `folder-scan`, read-model reconcile uses `full-reconcile`, route-open endpoints avoid `full-reconcile`, selected slow endpoints expose runtime metadata, dashboard cache preserves loader actual data source, append usage can invalidate or exactly update the projection, runtime diagnostics history is bounded/tolerant, Admin Web ignores optional `meta` when unwrapping data, and browser QA proves the diagnostics history surface is visible on desktop/mobile | Need runtime metadata coverage beyond the four selected endpoints, deeper process-history reporting, broader dashboard store coverage, and broader query-layer work for remaining slow paths |

### Phase 3: Admin Read Model And Query API

| Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- |
| Generated status read-model v1 | Done for JSON v1 scope | `packages/admin-api/src/admin-source-video-read-model.ts`; `packages/admin-api/src/admin-source-video-status-read-model-runtime.ts`; `source-video-status-read-model-v1` and runtime tests; real NAS performance artifacts | Not the final SQLite/Admin read model |
| Persistent admin read model under `.mixlab-library/admin-read-model/admin.sqlite` or equivalent | Partial | `packages/admin-api/src/admin-read-model-store.ts`; `packages/admin-api/src/admin-read-model-store.test.ts`; `/api/admin/read-model/status` includes `admin_read_model` plus `admin_read_model.reconciliation`; Protection Center displays `admin.sqlite` freshness; selected fresh non-ready `source-videos` status pages and bounded active plus ready-history `preprocess/jobs` pages can read from `admin.sqlite` when complete snapshots exist; `readAdminDashboardMaterialSummaryFromStore(...)` exposes dashboard material duration/size summary only when the store is fresh, library counts match, and the metadata came from a complete source-video manifest snapshot; `readAdminDashboardProductionSummaryFromStore(...)` exposes dashboard production summary only when the store is fresh and the preprocess-job snapshot table has one row per source video; `.mixlab-library/admin-read-model/usage-metrics.sqlite` now has shared schema/state helpers and exact best-effort append-time write-through for fresh stateful projections; single source-video status/metadata commands, bulk queue/retry/recover commands, publish/index repair commands, and cover replacement commands can write through to the store when safe; settings/source-folder scope mutations and library scan/init now mark existing stores stale and expose invalidation reason instead of silently using stale rows; successful scan apply returns an explicit read-model reconcile handoff and a `post-scan-reconcile-v1` scheduling result; blocked scan apply does not mark the store stale; `admin-command-guard.ts` marks settings/source-folder scope mutations and library scan/init as requiring read-model invalidation/reconcile; `admin-read-model-invalidation.ts` centralizes command policy, stale-store marking, operation-log event details, and reconcile-plan handoff metadata; `admin-read-model-reconcile-scheduler.ts` owns post-scan scheduling; the store now has a no-scan/full-reconcile reconciliation plan, snapshot-based rebuild contract, explicit background reconcile trigger/status endpoints, checkpoint-based cancel/progress/recent-event visibility, persisted read-model reconcile operation-log events, and persisted read-model invalidation events | Store schema/path/status, selected query use, single-row and selected batch write-through, usage projection exact append-time write-through, dashboard material summary metadata, dashboard production summary job snapshot table, ready-history preprocess/jobs page helper, stale marking, reconciliation contract, controlled reconcile trigger, in-memory progress/cancel visibility, read-model operation-log persistence, command invalidation policy, scan apply handoff/scheduling, and selected file-capture snapshots exist; migrations, broader query coverage, broader maintenance scheduling, bulk file snapshots, and rollback still needed |
| Background reconciler | Partial | `planAdminReadModelStoreReconciliation(...)` classifies fresh stores as `no-scan`, missing/stale stores as background `full-reconcile`, and unsafe states as manual review; `reconcileAdminReadModelStoreFromManifestSnapshot(...)` rebuilds `admin.sqlite` only from a validated full manifest snapshot and can include a complete preprocess-job timestamp snapshot; `createAdminReadModelReconciler(...)` runs a controlled one-at-a-time background task behind `POST /api/admin/read-model/reconcile`; `scheduleAdminReadModelReconcileAfterScan(...)` requests that same one-at-a-time reconciler after successful scan apply when the handoff requires a non-page-safe `full-reconcile`; `GET /api/admin/read-model/reconcile/status` reports state, phase, progress, cancel request, and recent events without scanning; `POST /api/admin/read-model/reconcile/cancel` requests checkpoint-based cancellation without scanning; `/api/admin/operation-log` exposes persisted read-model reconcile lifecycle events without scanning; tests prove explicit rebuild of missing `admin.sqlite`, command-only/full-reconcile classification, no-scan cancel/log classification, cancel before write leaves no `admin.sqlite`, operation-log persistence, and post-scan scheduling; `admin-read-model-reconcile-20260625T230933Z.md` proves a gated real NAS rebuild completed and preserved library/ready counts | Needs mid-traversal cancellation/progress if low-level manifest/job enumeration remains long-running, broader scheduled maintenance policy beyond scan apply, and eventual full command audit integration |
| Write commands update read model synchronously | Partial | Current generated status model writes also replace `admin.sqlite` when persisted; `packages/admin-api/src/admin-read-model-store.ts` has safe single and batch source-video write-through plus metadata-only stale marking; `packages/library-fs/src/usage-events.ts` now attempts exact best-effort write-through to the usage metrics projection after successful `appendUsageEvent(...)`, and safely invalidates missing/stale/malformed/legacy projections instead of serving stale dashboard usage data; `packages/admin-api/src/admin-read-model-invalidation.ts` owns the full-reconcile invalidation handoff used by settings/source-folder/library scan/init commands; `packages/admin-api/src/admin-read-model-reconcile-scheduler.ts` owns scan-apply post-invalidation reconcile scheduling; `packages/admin-api/src/admin-settings-commands.ts` owns settings/source-folder command I/O, selected settings snapshot files, and read-model invalidation handoff; `packages/admin-api/src/admin-library-commands.ts` owns library init/scan command I/O and delegates read-model invalidation handoff; `packages/admin-api/src/admin-transition-commands.ts` owns bulk preprocess and single source-video queue/retry/recover command I/O plus safe `admin.sqlite` write-through; `packages/admin-api/src/admin-publish-commands.ts` owns single source-video publish and bulk index repair command I/O plus safe `admin.sqlite` write-through; `packages/admin-api/src/admin-source-video-commands.ts` owns cover replacement and metadata update command I/O, selected source-video manifest/cover snapshot files, and safe `admin.sqlite` write-through; `packages/admin-api/src/index.test.ts` proves single queue, metadata, bulk queue/retry/recover, index repair, single source-video publish, and cover replacement keep `admin.sqlite` fresh without rebuilding the JSON read model, proves source-folder/settings `source_folders` mutations mark `admin.sqlite` stale without rebuilding the JSON read model, proves library scan returns a reconcile handoff, schedules reconcile, and blocked scan does not invalidate the store, and proves backend command snapshot restore marks/recovers through the command restore API path on a temporary library root; command/service tests prove settings/source-folder file capture, source-video metadata/cover file capture, command guard rules, invalidation handoff, usage projection exact write-through/fallback invalidation, and direct command service write-through behavior | Needs broader maintenance scheduling beyond scan apply, restore UI, bulk file snapshots, automatic rollback workflow, and real NAS rollback proof |
| Query API separated from route implementation | Partial | Pure source-video query and read-model rules are extracted to `admin-source-video-query.ts` and `admin-source-video-read-model.ts`; `admin-source-video-status-read-model-runtime.ts` owns JSON read-model persistence/cache/build/status runtime orchestration; `admin-source-video-list-query.ts` owns page-facing source-video list data-source selection; `admin-source-video-status-page-query.ts` owns non-ready status/statuses lower-reader order; `admin-source-video-index-query.ts` owns current-index ready page, indexed ID-set, and by-ID manifest-map reads; `admin-source-video-default-page-query.ts` owns default-page cache/composition, read-model shortcut, current-index/manifest mixed pages, and final manifest-page fallback; `admin-source-video-filtered-page-query.ts` owns generic filtered fallback scan rules, indexed-ready exclusion, max-scan-batch limits, status-count early exits, and unlimited filtered all-manifest reads; `admin-source-video-manifest-cache.ts` owns sorted source-video ID cache, per-ID manifest cache, all-manifest cache reuse, batched manifest reads, and sorted-ID page reads; `admin-source-video-detail-query.ts` owns single-ID source-video detail aggregation, projection, visibility, transcript summary, preprocess/job detail, and artifact existence metadata; `admin-source-video-routes.ts` owns dependency-injected list/detail route handling and preserves list `meta.runtime`; `admin-source-video-media-routes.ts` owns dependency-injected source-video cover GET media routing while preserving the existing streaming writer; `admin-slow-read-routes.ts` owns dependency-injected dashboard metrics, preprocess jobs list, and index versions route handling while preserving runtime metadata; `admin-system-read-routes.ts` owns dependency-injected library/status, settings config/runtime, doctor report, and cutter-user read-only route handling while preserving runtime-secret refresh order and public user projection; `admin-runtime-diagnostic-routes.ts` owns dependency-injected Doctor run/export and settings test-ASR POST route handling while preserving runtime-secret refresh order and response envelopes; `admin-runtime-observability-routes.ts` owns the dependency-injected runtime diagnostics history read route; `admin-protection-read-routes.ts` owns dependency-injected protection status, release-gates, and path-check read route handling while preserving response envelopes and existing protection/release/path-check services; `admin-auth-routes.ts` owns dependency-injected health/auth route handling, public auth-route classification, session token parsing, auth status branching, account body validation, and auth response envelopes while preserving existing health/bootstrap/session/account services; `admin-preprocess-read-routes.ts` owns dependency-injected preprocess job-log, supervisor status, and safety read-only route handling while preserving job/source lookup and public supervisor/safety projections; `admin-index-versions-query.ts`, `admin-dashboard-metrics-query.ts`, `admin-dashboard-metrics-cache.ts`, `admin-usage-metrics-query.ts`, and `admin-preprocess-jobs-query.ts` own named slow endpoint query/cache/read-model boundaries; `admin-dashboard-metrics-query.ts` accepts optional `read_material_summary(...)` and `read_production_summary(...)` dependencies for store-backed Dashboard counters; `admin-usage-metrics-query.ts` now delegates projection schema/signature/state to the shared usage-events boundary while preserving Admin runtime source/cache reporting; `admin-runtime-observability.ts` owns runtime metadata construction plus bounded diagnostics-history persistence; `admin-read-model-store.ts` owns the durable store boundary, selected store-backed non-ready status page helpers, bounded active/ready-history preprocess-job page helper, dashboard material summary helper, dashboard production summary helper, and single-row write-through helper; `admin-route-adapter.ts` owns response envelope construction and selected bounded route pagination parsing; `admin-read-model-routes.ts` owns dependency-injected read-model/operations/data-loading route handling | Broader query/runtime metadata coverage, deeper process-history reporting, and broader dashboard store coverage still need extraction |
| Command API guard separated from route implementation | Partial | `packages/admin-api/src/admin-command-guard.ts` owns command contracts for all current writer-lease library mutations plus queue/retry/recover transition specs, active-supervisor block rules, ready transition assertions, Admin auth store/session commands, and the dedicated `command-snapshot-restore` contract; `packages/admin-api/src/admin-command-snapshot.ts` owns metadata-only and targeted file-capture snapshot creation; `packages/admin-api/src/admin-command-restore-plan.ts` owns read-only restore-plan verification; `packages/admin-api/src/admin-command-restore.ts` owns the service-level restore execution primitive behind the command contract and writer lease; `packages/admin-api/src/admin-command-restore-routes.ts` owns dependency-injected restore-plan/restore route adapters while preserving supervisor blocking, snapshot-id resolution, blocked-plan preflight, and restore service delegation; `packages/admin-api/src/admin-command-audit.ts` owns command-to-operation-log audit metadata; `packages/admin-api/src/admin-command-runtime.ts` owns writer-lease execution plus lock-held best-effort snapshot creation, dynamic snapshot planning, and started/succeeded/failed command audit events for those contracts; `packages/admin-api/src/admin-read-model-invalidation.ts` owns the command read-model invalidation handoff for settings/source-folder/library scan/init/full-restore reconcile paths; `packages/admin-api/src/admin-read-model-reconcile-scheduler.ts` owns the post-scan reconcile scheduling policy; `packages/admin-api/src/admin-settings-commands.ts` owns settings config and source-folder add/update/remove command business I/O plus settings file snapshot selection; `packages/admin-api/src/admin-library-commands.ts` owns library init and successful scan apply command business I/O plus bounded init/scan snapshot planning; `packages/admin-api/src/admin-scan-planner.ts` owns scan-preview and scan-apply blocker orchestration; `packages/admin-api/src/admin-transition-commands.ts` owns bulk preprocess and single source-video queue/retry/recover command business I/O plus transition snapshot planning; `packages/admin-api/src/admin-publish-commands.ts` owns single source-video publish and bulk index repair command business I/O plus publish snapshot planning; `packages/admin-api/src/admin-source-video-commands.ts` owns cover replacement and metadata update command business I/O plus source-video manifest/cover file snapshot selection; `packages/admin-api/src/admin-preprocess-pipeline.ts` owns preprocess pipeline orchestration while delegating scan, queue, worker lifecycle, and publish mutations to the existing command-covered services; `packages/admin-api/src/admin-auth-commands.ts` owns Admin register/login/logout command wrapping with metadata-only snapshots so password hashes and session tokens are not copied into command snapshots; `packages/admin-api/src/admin-source-video-command-routes.ts` owns dependency-injected source-video cover/metadata PATCH plus queue/retry/recover-processing/publish POST route adapters while delegating all writes to the command services; `packages/admin-api/src/admin-preprocess-command-routes.ts` owns dependency-injected preprocess supervisor start/stop plus bulk queue/retry/recover-processing POST route adapters while preserving runtime-secret refresh, real-start readiness checks, safety blocking, supervisor projection/blocking, cache invalidation timing, and transition command delegation; `packages/admin-api/src/admin-settings-command-routes.ts` owns dependency-injected settings config and source-folder add/update/remove route adapters while delegating writes to settings command services; `packages/admin-api/src/admin-library-command-routes.ts` owns dependency-injected library init/scan/scan-preview route adapters while delegating writes/scans to library command and scan planner services; `packages/admin-api/src/admin-library-command-route-deps.ts` owns the library command dependency factory for library context, scan preview/apply, post-scan reconcile handoff, and source-video cache invalidation; `packages/admin-api/src/admin-index-command-routes.ts` owns dependency-injected index repair route adapters while delegating publish/index writes to publish command services; `packages/admin-api/src/admin-index-command-route-deps.ts` owns the index command dependency factory for repair context, ready-publish media, index-version cache invalidation, and source-video cache invalidation; `packages/admin-api/src/admin-cutter-user-command-routes.ts` owns dependency-injected cutter-user approve/disable/password route adapters while preserving account mutation services, password validation, session invalidation behavior, and public projection boundaries; `admin-command-guard.test.ts`, `admin-command-snapshot.test.ts`, `admin-command-restore-plan.test.ts`, `admin-command-restore.test.ts`, `admin-command-restore-routes.test.ts`, `admin-command-audit.test.ts`, `admin-command-runtime.test.ts`, `admin-read-model-invalidation.test.ts`, `admin-read-model-reconcile-scheduler.test.ts`, `admin-settings-commands.test.ts`, `admin-library-commands.test.ts`, `admin-library-command-routes.test.ts`, `admin-library-command-route-deps.test.ts`, `admin-index-command-routes.test.ts`, `admin-index-command-route-deps.test.ts`, `admin-cutter-user-command-routes.test.ts`, `admin-scan-planner.test.ts`, `admin-transition-commands.test.ts`, `admin-publish-commands.test.ts`, `admin-source-video-commands.test.ts`, `admin-auth-commands.test.ts`, `admin-source-video-command-routes.test.ts`, `admin-preprocess-command-routes.test.ts`, `admin-preprocess-pipeline.test.ts`, and `admin-settings-command-routes.test.ts` cover these rules | Restore UI exposure, broader maintenance scheduling, redacted auth-store restore design, and remaining runtime/reconciler/projection orchestration still need extraction |
| Route-level Admin non-GET write/control surface audit | Done for R.92/R.98 route-level scope | `packages/admin-api/src/admin-write-route-audit.ts` enumerates every current Admin `POST`/`PATCH`/`DELETE` route and classifies it as `command-runtime`, `readonly-preview`, `supervisor-runtime`, `maintenance-control`, or `runtime-diagnostic`; R.98 moves Admin auth register/login/logout from the former `auth-store` exception into command-runtime coverage through `admin-auth-register`, `admin-auth-login`, and `admin-auth-logout`; `admin-write-route-audit.test.ts` proves the current route list is complete for this scope, command-runtime entries match `admin-command-guard` method/scan-mode/writer-lease/mutation-target contracts, public command names are routed or explicitly system-only, non-command exceptions do not claim command audit/writer lease, and non-GET data-loading plan entries are represented | Route-level audit coverage is current; standalone worker entrypoints, long-running media/ASR artifact writes, restore UX, and Docker release gates remain outside this row's scope |
| Worker-internal preprocess/publish write-path audit and runtime policy enforcement | Done for R.93/R.94/R.95/R.96/R.97 scope plus R.121 Docker default boundary | `packages/admin-api/src/admin-worker-write-path-audit.ts` enumerates current background write surfaces after supervisor/worker execution: Docker worker loop spawning, Admin supervisor scan/init/auto-queue, Admin supervisor worker lifecycle cycle, Admin supervisor publish cycle, standalone preprocess worker, standalone ready-publish worker, and low-level `library-fs` lifecycle primitives. R.93 tests prove the current list is complete for the audit scope, records partial command coverage for pipeline scan/queue, records single-id lifecycle writes without route-command coverage at that audit point, records `index-required -> ready` publish visibility/index/release mutations, requires standalone worker enable flags, and prevents low-level lifecycle primitives from being mistaken for complete command protection. R.94 makes `runAdminPreprocessPipeline(...)` enforce `auto_scan_enabled`, `auto_queue_enabled`, and `auto_publish_index_enabled`; tests prove disabled scan/queue skips hidden init/scan/auto-queue while still processing already queued work, disabled queue leaves discovered videos unprocessed, disabled publish leaves completed videos at `index-required`, and the audit contract no longer records those flags as unenforced. R.95 adds the system-only `preprocess-supervisor-publish-ready` command and routes the Admin supervisor auto-publish cycle through `runAdminCommand(...)`, so background `index-required -> ready` publication now has writer-lease, file-capture snapshot, release-area command audit, system actor attribution, and route-audit classification as a system-only command. R.96 adds system-only worker lifecycle commands for claim, stage update, artifact completion, failure marking, and count refresh; injects an Admin lifecycle wrapper into `createRealPreprocessRunner(...)`; and proves command audit/snapshots cover those short writes while long-running media/ASR work remains outside the writer lease. R.97 routes Admin supervisor auto-scan/init through the existing `library-scan` command wrapper, proves `library-scan` system actor audit in pipeline tests, and updates the worker audit so scan/init plus auto-queue writes are command-covered. R.121 makes NAS Docker standalone worker flags default-disabled (`0`) in compose and `.env.example`, updates static validation to reject default-enabled drift, and proves the worker loop enables commands only with explicit `1` opt-in | Generated media/ASR artifact writes are intentionally outside long-held writer lease coverage; scan and queue remain separate command transactions rather than one atomic pipeline transaction; standalone worker write protection remains a separate explicit-enable worker boundary and is not migrated into command runtime by R.121 |

### Phase 4: Page Information Architecture

| Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- |
| Protection Center | Partial | Route, navigation, UI page, tests; `admin-operations-overview.ts` and `admin-operations-overview.test.ts` cover the read-only aggregate contract; `apps/admin-web/src/features/protection/api.ts` and `api.test.ts` cover the frontend feature loader contract | Read-only first slice only; future restore/rollback UI and mutating controls not complete |
| Overview/dashboard as operational overview | Partial | Existing dashboard has production signals; R.68 renames the visible route/page to `总览` and keeps dashboard as an overview surface rather than the sole management container | Still needs deeper composition reduction, screenshot QA, and dashboard/usage read-model counters |
| Source Library / Preprocess / Publish / Users / System / Settings | Partial | R.68 exposes `素材库`, `预处理`, `发布与索引`, `剪辑师`, `系统检查`, and `设置` as first-class navigation entries; `#/index-publish` and `#/doctor` now resolve to their own routes; `IndexPublishPage` is route-owned and loads a bounded `index-required` first page instead of reusing the preprocess page; R.108 gives `发布与索引` an explicit production-console layout with `发布队列`, `索引版本`, `版本详情`, page-contract rows, no-scan provenance, and desktop/mobile fixture browser QA; R.109 gives `素材库` an explicit production-console layout with `素材表格`, `素材详情`, `读模型`, `分页读取`, `不扫描`, page-control filter semantics, and desktop/mobile fixture browser QA; R.110 gives `剪辑师` an explicit production-console layout with `用户表格`, `用户概览`, `用户仓库`, `使用指标`, `命令操作`, `不扫描`, and desktop/mobile fixture browser QA; R.111 gives `系统检查` an explicit production-console layout with `诊断报告`, `检查结果`, `检查报告`, `doctor-probes`, `doctor-route`, `状态扫描`, and desktop/mobile fixture browser QA; R.112 gives `设置` an explicit production-console layout with `设置表单`, `素材来源`, `运行策略`, `路径检查`, `设置概览`, `admin-settings`, `path-checks`, `runtime-secrets`, `settings-route`, and desktop/mobile fixture browser QA; R.113 proves the R.108-R.112 migrated pages against live local NAS data through GET-only aggregate browser QA and direct route endpoint contract probes; R.226 gives `预处理` a shared Inspector page-contract section covering `预处理队列`, `处理历史与任务日志`, `admin-read-model / supervisor-runtime`, `不扫描 / 分页读取`, route-local loading, command-gate, and local error boundaries | Need deeper interaction contracts, future live proof for newly changed remaining routes, and table-density polish; broad redesign remains incomplete |
| Operation Log | Partial | Backend operation-log storage and `/api/admin/operation-log` exist for read-model reconcile, read-model invalidation, and command audit events; command audit events now include snapshot created/unavailable details plus file-count summaries for file-capture snapshots; Admin Web API/fixture contract is typed and route-owned/no-scan; `apps/admin-web/src/features/operation-log/OperationLogPage.tsx`, navigation, AdminApp route loader, and UI contract tests add a dedicated read-only page; R.226 adds a shared Inspector page-contract section covering `审计时间线`, `恢复预检`, `operation-log / command-snapshot`, no-scan reads, recent-event-window loading, restore precheck command boundary, and local error handling | Needs rollback, actor attribution, filtering/search, retention, command-result drilldown UX, and live screenshot proof after any future interaction expansion |
| Unified shell/table/badge/inspector design | Partial | UI Foundation use exists; R.68 updates `packages/ui-foundation/src/design-contract.ts` so the required Admin pages match the production-console IA; R.108 applies the badge/inspector/table pattern to `发布与索引` and proves desktop/mobile fixture screenshots; R.109 applies metric/table/badge/inspector production-console structure to `素材库` and proves desktop/mobile fixture screenshots; R.110 applies metric/table/badge/inspector production-console structure to `剪辑师` and proves desktop/mobile fixture screenshots; R.111 applies metric/table/badge/inspector production-console structure to `系统检查` and proves desktop/mobile fixture screenshots; R.112 applies metric/badge/form/inspector production-console structure to `设置` and proves desktop/mobile fixture screenshots; R.113 adds live desktop/mobile screenshot evidence for all five migrated pages against the real local NAS-backed Admin API; R.226 adds shared `页面契约` Inspector rows to `总览`, `预处理`, `保护中心`, and `操作记录`, with fixture desktop/mobile browser QA and no-overflow checks | Full page migration, future live-data screenshot QA for newly changed routes, table-density polish, and broader shared-component cleanup not complete |

### Phase 5: Redundant Code Governance

| Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- |
| Identify redundancy hotspots | Done | Phase 0 line counts and module list; R.131 `admin-redundancy-governance-audit-20260626T204053Z` scans 189 Admin/library files and records duplicate selector, large-file, and fixture/fallback/legacy hotspot blockers | Convert audit blockers into targeted cleanup slices before editing production code |
| Remove duplicate CSS/components/fallbacks safely | Blocked | R.131 audit records `cleanup_ready:false`, `cleanup_allowed:false`, 40 duplicate CSS selector candidates, 19 large files, and 18 fixture/fallback/legacy hotspot files; R.132 classifies CSS duplicates into 201 reference-layer overlaps, 133 `styles.css` same-file legacy duplicates, and 1 reference-internal duplicate while keeping `cleanup_allowed:false`; R.133 completes the first tiny `.admin-app .admin-link-button` `styles.css` cleanup slice with Admin Web tests/build, source-videos desktop/mobile browser QA, and regenerated governance artifacts showing same-file duplicates drop to 132; R.229 removes one exact `.admin-confirm-dialog footer` duplicate and regenerates governance evidence showing duplicate selectors drop to 333 and same-file duplicates drop to 131 while browser QA proves the confirmation dialog footer on desktop/mobile | Continue targeted cleanup one selector group at a time; broad cleanup, reference-layer deletion, and fixture/fallback removal remain blocked |
| Split large Admin API modules | Partial | `admin-protection.ts`, `admin-release-gates.ts`, `admin-data-loading-plan.ts`, `admin-route-adapter.ts`, `admin-auth-routes.ts`, `admin-read-model-routes.ts`, `admin-source-video-routes.ts`, `admin-source-video-route-deps.ts`, `admin-source-video-media-routes.ts`, `admin-source-video-media-route-deps.ts`, `admin-source-video-command-routes.ts`, `admin-source-video-command-route-deps.ts`, `admin-preprocess-read-routes.ts`, `admin-preprocess-read-route-deps.ts`, `admin-preprocess-command-routes.ts`, `admin-preprocess-command-route-deps.ts`, `admin-preprocess-pipeline.ts`, `admin-settings-command-routes.ts`, `admin-settings-command-route-deps.ts`, `admin-library-command-routes.ts`, `admin-library-command-route-deps.ts`, `admin-index-command-routes.ts`, `admin-index-command-route-deps.ts`, `admin-cutter-user-command-routes.ts`, `admin-cutter-user-command-route-deps.ts`, `admin-command-restore-routes.ts`, `admin-command-restore-route-deps.ts`, `admin-runtime-diagnostic-routes.ts`, `admin-runtime-diagnostic-route-deps.ts`, `admin-runtime-observability-routes.ts`, `admin-runtime-observability-route-deps.ts`, `admin-protection-read-routes.ts`, `admin-protection-read-route-deps.ts`, `admin-slow-read-routes.ts`, `admin-slow-read-route-deps.ts`, `admin-system-read-routes.ts`, `admin-system-read-route-deps.ts`, `admin-source-video-query.ts`, `admin-source-video-read-model.ts`, `admin-source-video-status-read-model-runtime.ts`, `admin-source-video-list-query.ts`, `admin-source-video-status-page-query.ts`, `admin-source-video-index-query.ts`, `admin-source-video-default-page-query.ts`, `admin-source-video-filtered-page-query.ts`, `admin-source-video-manifest-cache.ts`, `admin-source-video-detail-query.ts`, `admin-source-video-artifact-path.ts`, `admin-library-paths.ts`, `admin-current-index-query.ts`, `admin-transcript-metrics-query.ts`, `admin-index-versions-query.ts`, `admin-dashboard-metrics-query.ts`, `admin-preprocess-process-history-query.ts`, `admin-runtime-diagnostics-recorder.ts`, `admin-read-model-reconcile-snapshot-reader.ts`, `admin-read-model-reconciler-runtime.ts`, `admin-command-guard.ts`, `admin-command-audit.ts`, `admin-command-runtime.ts`, `admin-read-model-invalidation.ts`, `admin-settings-commands.ts`, `admin-library-commands.ts`, `admin-scan-planner.ts`, `admin-transition-commands.ts`, `admin-publish-commands.ts`, `admin-source-video-commands.ts`, and `admin-operations-overview.ts` extracted from `packages/admin-api/src/index.ts`; R.145 isolates process-history response projection in a 202-line Query module with 226 focused test lines, R.146 isolates runtime diagnostics append wiring in a 30-line recorder module with 57 focused test lines, R.147 isolates read-model reconcile job snapshot reading in a 97-line module with 123 focused test lines, R.148 isolates read-model reconciler runtime assembly in a 144-line module with 175 focused test lines, R.149 isolates read-only source-video route dependency assembly in a 31-line factory module with 110 focused test lines, R.150 isolates source-video media route dependency assembly in a 24-line factory module with 52 focused test lines, R.151 isolates source-video command route dependency assembly in a 107-line factory module with 215 focused test lines, R.152 isolates slow-read route dependency assembly in a 65-line factory module with 168 focused test lines, R.153 isolates preprocess read route dependency assembly in a 78-line factory module with 200 focused test lines, R.154 isolates preprocess command route dependency assembly in a 127-line factory module with 244 focused test lines, R.155 isolates library command route dependency assembly in an 89-line factory module with 240 focused test lines, R.156 isolates index command route dependency assembly in a 56-line factory module with 130 focused test lines, and R.157 isolates settings command route dependency assembly in a 92-line factory module with 260 focused test lines, and R.158 isolates cutter-user command route dependency assembly in an 86-line factory module with 212 focused test lines, and R.159 isolates command restore route dependency assembly in a 108-line factory module with 245 focused test lines, and R.160 isolates runtime diagnostic route dependency assembly in a 70-line factory module with 122 focused test lines, and R.161 isolates system read route dependency assembly in an 87-line factory module with 232 focused test lines, and R.162 isolates protection read route dependency assembly in a 37-line factory module with 78 focused test lines, and R.163 isolates runtime observability route dependency assembly in a 23-line factory module with 39 focused test lines, and R.164 isolates preprocess pipeline orchestration and default real runner assembly in a 317-line module with 101 focused test lines, R.171 isolates source-video artifact path resolution in an 86-line module with 98 focused test lines, R.172 isolates shared Admin library path contract in a 50-line module with 44 focused test lines, R.173 isolates current-index pointer/metadata reads in a 67-line Query module with 97 focused test lines, and R.174 isolates Dashboard transcript metrics aggregation in a 64-line Query module with 133 focused test lines; `packages/admin-api/src/index.ts` remains a large-file governance candidate at 1910 physical lines | Frontend feature API boundaries and remaining backend orchestration clusters still need extraction |
| Remove obsolete fixture/fallback data | Partial | R.131 identifies fallback/fixture/legacy hotspots; R.227 adds `scripts/acceptance/admin-fallback-governance-classification.ts`; R.228 completes the line-level ownership review for the two source-video fallback candidates and regenerates `admin-fallback-governance-classification-20260627T082053Z`, classifying `28` hotspots into `14` test fixtures, `6` fixture runtime boundaries, `7` safe fallbacks, `1` legacy compatibility path, and `0` removable candidates while keeping `cleanup_allowed:false` | No fallback deletion is currently authorized. Fixture/runtime/safe-fallback/legacy entries remain non-removable without explicit replacement evidence; future cleanup should move to CSS same-file duplicates or large-file extraction with focused proof |

R.187 large-file addendum: R.175-R.187 supersede older line-count snapshots in the table above for current-state purposes. Latest R.187 evidence leaves `packages/admin-api/src/index.ts` at `1333` physical lines by `wc -l`, with the governance audit still reporting it as a large-file candidate at `1334` lines. The full large-file cleanup requirement remains `Partial`, because frontend feature API boundaries and remaining backend orchestration clusters still need extraction.

R.230 large-file addendum: `apps/admin-web/src/admin-http.ts` now owns Admin Web HTTP/envelope helpers outside `apps/admin-web/src/api.ts`, including envelope unwrapping, response meta preservation, URL joining, list query construction, GET/POST/PATCH/DELETE JSON transport, and Admin session headers. `apps/admin-web/src/api.ts` continues to re-export `unwrapAdminResponse` and preserves real client endpoint paths, request methods, response envelopes, fixture behavior, dashboard aggregation, NAS data, Docker state, and Cutter protocols. The accepted evidence is `docs/acceptance/artifacts/admin-web-http-foundation-extraction-20260627T0834Z.json` and `.md`, with `89` focused Admin Web HTTP/API/App tests, `3` redundancy audit tests, regenerated redundancy governance evidence `admin-redundancy-governance-audit-20260627T083347Z`, and `npm run typecheck -- --pretty false`. The full large-file cleanup requirement remains `Partial`, because real client method groups and fixture client state still need route/domain extraction.

R.231 large-file addendum: `apps/admin-web/src/admin-auth-client.ts` now owns the real Admin Web auth client method group outside `apps/admin-web/src/api.ts`, including auth bootstrap, auth status, register, login, and logout methods. `createAdminApiClient(...)` composes these methods back into the public `AdminApiClient` object, preserving endpoint paths, request methods, session-header behavior, request bodies, fixture auth behavior, NAS data, Docker state, and Cutter protocols. The accepted evidence is `docs/acceptance/artifacts/admin-web-auth-client-boundary-20260627T0856Z.json` and `.md`, with `90` focused Admin Web auth/http/API/App tests, `3` redundancy audit tests, regenerated redundancy governance evidence `admin-redundancy-governance-audit-20260627T085521Z`, and `npm run typecheck -- --pretty false`. The full large-file cleanup requirement remains `Partial`, because non-auth real client method groups and fixture client state still need route/domain extraction.

R.232 large-file addendum: `apps/admin-web/src/admin-source-video-client.ts` now owns the real Admin Web source-video client method group outside `apps/admin-web/src/api.ts`, and `apps/admin-web/src/admin-source-video-media.ts` owns media URL resolution. `createAdminApiClient(...)` composes these methods back into the public `AdminApiClient` object and `api.ts` continues to re-export `resolveMediaUrl`, preserving endpoint paths, query params, methods, session-header behavior, request bodies, runtime meta preservation, fixture source-video behavior, NAS data, Docker state, and Cutter protocols. The accepted evidence is `docs/acceptance/artifacts/admin-web-source-video-client-boundary-20260627T0904Z.json` and `.md`, with `93` focused Admin Web source-video/auth/http/API/App tests, `3` redundancy audit tests, regenerated redundancy governance evidence `admin-redundancy-governance-audit-20260627T090312Z`, and `npm run typecheck -- --pretty false`. The full large-file cleanup requirement remains `Partial`, because remaining real client method groups and fixture client state still need route/domain extraction, and backend read-model/slow-query acceptance remains separate.

R.233 large-file addendum: `apps/admin-web/src/admin-operations-client.ts` now owns the real Admin Web slow-page operations method group outside `apps/admin-web/src/api.ts`, covering read-model reconcile, data-loading/operations overview, settings/source-folders, dashboard metrics, preprocess jobs/history/supervisor, index versions/repair, runtime diagnostics/settings, doctor, library scan/init, and ASR config test. `createAdminApiClient(...)` composes these methods back into the public `AdminApiClient` object, preserving endpoint paths, default preprocess limits, query params, methods, session-header behavior, request bodies, AbortSignal binding, fixture state, NAS data, Docker state, and Cutter protocols. The accepted evidence is `docs/acceptance/artifacts/admin-web-operations-client-boundary-20260627T091231Z.json` and `.md`, with `95` focused Admin Web operations/source-video/auth/http/API/App tests, `3` redundancy audit tests, regenerated redundancy governance evidence `admin-redundancy-governance-audit-20260627T091206Z`, and `npm run typecheck -- --pretty false`. The full large-file cleanup requirement remains `Partial`, because fixture client state and remaining cutter-user client methods still need ownership decisions, and backend read-model/route-loader performance acceptance remains separate.

R.234 slow-endpoint observability addendum: `/api/admin/preprocess/jobs` now exposes component-level runtime timings in `meta.runtime.components` through `packages/admin-api/src/admin-preprocess-jobs-read-facade.ts`, `packages/admin-api/src/admin-slow-read-route-deps.ts`, and `packages/admin-api/src/admin-slow-read-routes.ts`. The components identify concurrent-job policy lookup, library counts, read-model page load, unpaged manifest fallback, job-record supplements, and runtime-load advice with data-source, scan-mode, cache-status, duration, and detail fields. The accepted evidence is `docs/acceptance/artifacts/admin-preprocess-jobs-runtime-components-20260627T092256Z.json` and `.md`, with `8` focused facade/route tests, `88` broader backend tests, `6` performance-probe contract tests, regenerated redundancy governance evidence `admin-redundancy-governance-audit-20260627T092234Z`, and `npm run typecheck -- --pretty false`. R.236 later closed the live GET-only component-proof gap for the default page path. This advances the slow-endpoint observability requirement but does not complete route-loader refactoring or all read-model query coverage.

R.235 slow-endpoint observability addendum: `/api/admin/index/versions` now exposes component-level runtime timings in `meta.runtime.components` through `packages/admin-api/src/admin-index-versions-query.ts` and `packages/admin-api/src/admin-slow-read-routes.ts`. The components identify current-pointer fast path, directory listing, current pointer validation, package validation, cache lookup, and pending wait with data-source, scan-mode, cache-status, duration, and detail fields. The accepted evidence is `docs/acceptance/artifacts/admin-index-versions-runtime-components-20260627T092909Z.json` and `.md`, with `12` focused query/route tests, `89` broader backend tests, `6` performance-probe contract tests, regenerated redundancy governance evidence `admin-redundancy-governance-audit-20260627T092843Z`, and `npm run typecheck -- --pretty false`. R.236 later closed the live GET-only component-proof gap for the default page path. This advances the slow-endpoint observability requirement but does not complete route-loader refactoring or all read-model query coverage.

R.236 live GET-only component evidence addendum: the real NAS performance probe now treats runtime components as explicit contract gates. `scripts/acceptance/admin-real-nas-performance.ts` preserves component `scan_mode` and `scan_reason`, summarizes component timing fields in Markdown/JSON, and fails if required `preprocess_jobs` or `index_versions` components are missing. `scripts/acceptance/admin-real-nas-performance-isolated.ts` now carries those contract failures into isolated acceptance gates. `packages/admin-api/src/admin-slow-read-route-deps.ts` was fixed to pass `preprocess_jobs` `component_timings` from the read facade into the route runtime metadata. The accepted live-style local evidence is `docs/acceptance/artifacts/admin-real-nas-performance-isolated-20260627T093828Z.md` and `docs/acceptance/artifacts/admin-real-nas-performance-20260627T093828Z.md`: `20` GET endpoints, `0` failed samples, `0` slow gates, `0` runtime repair endpoints, `0` component contract failures, `preprocess_jobs` p95 `490.8ms`, and `index_versions` p95 `229.0ms` against `/Volumes/MixLab/PublicLibrary`. This closes the R.234/R.235 live component-proof gap but does not complete source-video component timings, route-loader refactoring, Docker release gates, or all read-model query optimization.

R.237 runtime-load telemetry cache addendum: R.236 showed the `preprocess_jobs` `runtime_load` component repeatedly paying the synchronous runtime telemetry sampling cost. `packages/admin-api/src/admin-dashboard-read-facade.ts` now owns a short `2000ms` per-library runtime-load telemetry cache with pending read coalescing and invalidation through `clear_dashboard_metrics_cache(...)`. The underlying `getAdminRuntimeLoadMetrics(...)` still performs real system probing on cache miss, so this does not cache asset facts, read-model rows, commands, release/index state, NAS layout, or Cutter protocol data. The accepted evidence is `docs/acceptance/artifacts/admin-runtime-load-telemetry-cache-20260627T0945Z.md` plus `admin-real-nas-performance-isolated-20260627T094519Z.md`: `preprocess_jobs` warm route time dropped to `225.4ms`, warm `runtime_load` was `0ms`, all `20` sampled GET endpoints passed, and runtime repair/component-contract failures remained `0`. This advances the loading/performance lane but leaves `preprocess_job_page` around `217ms` per sampled request, so Query/store plan inspection remains a next step.

R.175 large-file addendum: R.175 isolates source-video read facade orchestration in a 438-line module with 239 focused test lines and reduces `packages/admin-api/src/index.ts` to `1661` physical lines. `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T013716Z.json` keeps cleanup blocked with `40` duplicate selector candidates, `19` large-file candidates, and `22` term hotspots, so broad cleanup remains disallowed.

R.176 large-file addendum: R.176 isolates Dashboard read facade orchestration in a 163-line module with 247 focused test lines and reduces `packages/admin-api/src/index.ts` to `1605` physical lines by `wc -l`; `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T014814Z.json` keeps cleanup blocked with `40` duplicate selector candidates, `19` large-file candidates, and `22` term hotspots, so broad cleanup remains disallowed.

R.177 large-file addendum: R.177 isolates read-model server facade orchestration in a 101-line module with 303 focused test lines and reduces `packages/admin-api/src/index.ts` to `1598` physical lines by `wc -l`; `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T015544Z.json` reports the large-file candidate at `1599` lines. Cleanup remains blocked with `40` duplicate selector candidates, `19` large-file candidates, and `22` term hotspots, so broad cleanup remains disallowed.

R.178 large-file addendum: R.178 isolates Admin auth route dependency assembly in a 76-line module with 183 focused test lines and reduces `packages/admin-api/src/index.ts` to `1564` physical lines by `wc -l`; `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T020156Z.json` reports the large-file candidate at `1565` lines. Cleanup remains blocked with `40` duplicate selector candidates, `19` large-file candidates, and `22` term hotspots, so broad cleanup remains disallowed.

R.179 large-file addendum: R.179 isolates Admin health and preprocess safety read assembly in a 66-line Query module with 81 focused test lines and reduces `packages/admin-api/src/index.ts` to `1551` physical lines by `wc -l`; `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T020917Z.json` reports the large-file candidate at `1552` lines. Cleanup remains blocked with `40` duplicate selector candidates, `19` large-file candidates, and `22` term hotspots, so broad cleanup remains disallowed.

R.180 large-file addendum: R.180 isolates Admin protection/release/path-check read assembly in a 104-line Query module with 206 focused test lines and reduces `packages/admin-api/src/index.ts` to `1532` physical lines by `wc -l`; `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T021656Z.json` reports the large-file candidate at `1533` lines. Cleanup remains blocked with `40` duplicate selector candidates, `19` large-file candidates, and `22` term hotspots, so broad cleanup remains disallowed.

R.181 large-file addendum: R.181 isolates Admin preprocess/jobs runtime-meta read assembly in a 109-line facade module with 175 focused test lines and reduces `packages/admin-api/src/index.ts` to `1482` physical lines by `wc -l`; `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T022809Z.json` reports the large-file candidate at `1483` lines. Cleanup remains blocked with `40` duplicate selector candidates, `19` large-file candidates, and `23` term hotspots, so broad cleanup remains disallowed.

R.182 large-file addendum: R.182 isolates Admin HTTP/session helper assembly in a 110-line server helper module with 210 focused test lines and reduces `packages/admin-api/src/index.ts` to `1415` physical lines by `wc -l`; `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T023612Z.json` reports the large-file candidate at `1416` lines. Cleanup remains blocked with `40` duplicate selector candidates, `19` large-file candidates, and `23` term hotspots, so broad cleanup remains disallowed.

R.183 large-file addendum: R.183 isolates Admin file-fact reader assembly in a 44-line helper module with 107 focused test lines and reduces `packages/admin-api/src/index.ts` to `1378` physical lines by `wc -l`; `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T024421Z.json` reports the large-file candidate at `1379` lines. Cleanup remains blocked with `40` duplicate selector candidates, `19` large-file candidates, and `23` term hotspots, so broad cleanup remains disallowed.

R.184 large-file addendum: R.184 isolates Admin source-video cover response assembly in a 73-line helper module with 189 focused test lines and reduces `packages/admin-api/src/index.ts` to `1369` physical lines by `wc -l`; `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T024939Z.json` reports the large-file candidate at `1370` lines. Cleanup remains blocked with `40` duplicate selector candidates, `19` large-file candidates, and `23` term hotspots, so broad cleanup remains disallowed.

R.185 large-file addendum: R.185 isolates Admin preprocess supervisor public status projection in a 37-line helper module with 67 focused test lines and reduces `packages/admin-api/src/index.ts` to `1337` physical lines by `wc -l`; `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T025339Z.json` reports the large-file candidate at `1338` lines. Cleanup remains blocked with `40` duplicate selector candidates, `19` large-file candidates, and `23` term hotspots, so broad cleanup remains disallowed.

### Phase 6: Docker Release Gate

| Requirement | Status | Evidence | Gap |
| --- | --- | --- | --- |
| Path isolation: Mac `/Volumes/MixLab/PublicLibrary`, Docker `/data/PublicLibrary` | Partial | Environment docs and Docker static checks | Need deployed container/runtime verification |
| usage-events tolerant/repairable | Partial | usage-events tests and repair artifacts | Need release-time active file proof on NAS Docker target |
| V001440 recovery path | Partial | Real NAS reports show local recovery to queued | Need release gate proof at deploy time |
| Disk protection | Partial / Blocked | preprocess safety gate and disk blocker | NAS disk pressure remains physical risk |
| admin-web/admin-api/admin-worker version/health parity | Partial | Docker static validation; R.121 static validation now also requires standalone admin-worker preprocess/publish flags to default disabled until explicitly enabled after release gates | Need live Docker health/version proof |
| Docker upload | Blocked | Goal and docs explicitly block upload before gates pass | No deployment until full gate passes |

## Acceptance Evidence Index

Current local evidence files:

- `docs/architecture/admin-architecture-v1.md`
- `docs/architecture/admin-architecture-v1-phase-0-audit.md`
- `docs/architecture/admin-architecture-v1-next-implementation-plan.md`
- `docs/acceptance/artifacts/local-admin-preprocess-audit-20260625.md`
- `docs/acceptance/artifacts/admin-real-nas-performance-20260625T184329Z.md`
- `docs/acceptance/artifacts/admin-real-nas-performance-20260625T190816Z.md`
- `docs/acceptance/artifacts/admin-real-nas-performance-20260625T225143Z.md`
- `docs/acceptance/artifacts/admin-read-model-reconcile-20260625T230933Z.md`
- `docs/acceptance/artifacts/admin-real-nas-performance-20260625T231116Z.md`
- `docs/acceptance/artifacts/usage-events-repair-20260625T185616Z.md`
- `docs/acceptance/artifacts/usage-events-repair-20260625T185622Z.md`
- `docs/acceptance/artifacts/usage-events-repair-20260625T185635Z.md`
- `docs/acceptance/artifacts/admin-settings-browser-qa-20260626T174742Z.md`
- `docs/acceptance/artifacts/admin-settings-browser-qa-20260626T174742Z.json`
- `docs/acceptance/artifacts/admin-migrated-pages-live-browser-qa-20260626T180453Z.md`
- `docs/acceptance/artifacts/admin-migrated-pages-live-browser-qa-20260626T180453Z.json`
- `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T204053Z.md`
- `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T204053Z.json`
- `docs/acceptance/artifacts/admin-css-governance-classification-20260626T204735Z.md`
- `docs/acceptance/artifacts/admin-css-governance-classification-20260626T204735Z.json`
- `docs/acceptance/artifacts/admin-css-governance-classification-20260626T205258Z.md`
- `docs/acceptance/artifacts/admin-css-governance-classification-20260626T205258Z.json`
- `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T205504Z.md`
- `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T205504Z.json`
- `docs/acceptance/artifacts/admin-source-videos-browser-qa-20260626T205445Z.md`
- `docs/acceptance/artifacts/admin-source-videos-browser-qa-20260626T205445Z.json`

Current code/test anchors:

- `packages/admin-api/src/index.test.ts`
- `packages/admin-api/src/admin-read-model-store.test.ts`
- `packages/admin-api/src/admin-read-model-reconciler.test.ts`
- `packages/admin-api/src/admin-read-model-invalidation.test.ts`
- `packages/admin-api/src/admin-read-model-reconcile-scheduler.test.ts`
- `packages/admin-api/src/admin-runtime-observability.test.ts`
- `packages/admin-api/src/admin-route-adapter.test.ts`
- `packages/admin-api/src/admin-auth-routes.test.ts`
- `packages/admin-api/src/admin-read-model-routes.test.ts`
- `packages/admin-api/src/admin-library-command-routes.test.ts`
- `packages/admin-api/src/admin-index-command-routes.test.ts`
- `packages/admin-api/src/admin-cutter-user-command-routes.test.ts`
- `packages/admin-api/src/admin-source-video-routes.test.ts`
- `packages/admin-api/src/admin-source-video-media-routes.test.ts`
- `packages/admin-api/src/admin-source-video-command-routes.test.ts`
- `packages/admin-api/src/admin-settings-command-routes.test.ts`
- `packages/admin-api/src/admin-slow-read-routes.test.ts`
- `packages/admin-api/src/admin-system-read-routes.test.ts`
- `packages/admin-api/src/admin-runtime-diagnostic-routes.test.ts`
- `packages/admin-api/src/admin-runtime-observability-routes.test.ts`
- `packages/admin-api/src/admin-protection-read-routes.test.ts`
- `packages/admin-api/src/admin-preprocess-read-routes.test.ts`
- `packages/admin-api/src/admin-preprocess-command-routes.test.ts`
- `packages/admin-api/src/admin-operation-log.test.ts`
- `packages/admin-api/src/admin-command-audit.test.ts`
- `packages/admin-api/src/admin-command-guard.test.ts`
- `packages/admin-api/src/admin-write-route-audit.test.ts`
- `packages/admin-api/src/admin-worker-write-path-audit.test.ts`
- `packages/admin-api/src/admin-command-restore-plan.test.ts`
- `packages/admin-api/src/admin-command-restore.test.ts`
- `packages/admin-api/src/admin-command-restore-routes.test.ts`
- `packages/admin-api/src/admin-command-runtime.test.ts`
- `packages/admin-api/src/admin-settings-commands.test.ts`
- `packages/admin-api/src/admin-library-commands.test.ts`
- `packages/admin-api/src/admin-scan-planner.test.ts`
- `packages/admin-api/src/admin-transition-commands.test.ts`
- `packages/admin-api/src/admin-publish-commands.test.ts`
- `packages/admin-api/src/admin-source-video-commands.test.ts`
- `packages/admin-api/src/admin-operations-overview.test.ts`
- `packages/admin-api/src/admin-source-video-index-query.test.ts`
- `packages/admin-api/src/admin-source-video-default-page-query.test.ts`
- `packages/admin-api/src/admin-source-video-filtered-page-query.test.ts`
- `packages/admin-api/src/admin-source-video-manifest-cache.test.ts`
- `packages/admin-api/src/admin-source-video-detail-query.test.ts`
- `packages/admin-api/src/admin-source-video-status-read-model-runtime.test.ts`
- `packages/admin-api/src/admin-index-versions-query.test.ts`
- `packages/library-fs/src/scanner.test.ts`
- `packages/library-fs/src/preprocess-safety.test.ts`
- `packages/library-fs/src/admin-writer-lease.test.ts`
- `packages/library-fs/src/usage-events.test.ts`
- `scripts/acceptance/usage-events-repair.test.ts`
- `scripts/acceptance/admin-real-nas-performance.test.ts`
- `scripts/acceptance/admin-read-model-reconcile.test.ts`
- `scripts/acceptance/nas-docker-compose-static.test.ts`
- `scripts/acceptance/admin-index-publish-browser-qa.test.ts`
- `scripts/acceptance/admin-source-videos-browser-qa.test.ts`
- `scripts/acceptance/admin-cutter-users-browser-qa.test.ts`
- `scripts/acceptance/admin-doctor-browser-qa.test.ts`
- `scripts/acceptance/admin-settings-browser-qa.test.ts`
- `scripts/acceptance/admin-migrated-pages-live-browser-qa.test.ts`
- `apps/admin-web/src/api.test.ts`
- `apps/admin-web/src/features/protection/api.test.ts`
- `apps/admin-web/src/admin-app.test.ts`
- `apps/admin-web/src/features/admin-ui-contract.test.ts`

## Current Verification Commands

Minimum non-mutating verification for the current slice:

```bash
npm run typecheck
node --test --import tsx packages/admin-api/src/admin-read-model-store.test.ts
node --test --import tsx packages/admin-api/src/admin-read-model-reconciler.test.ts
node --test --import tsx packages/admin-api/src/admin-read-model-invalidation.test.ts
node --test --import tsx packages/admin-api/src/admin-operation-log.test.ts
node --test --import tsx packages/admin-api/src/admin-command-snapshot.test.ts
node --test --import tsx packages/admin-api/src/admin-command-restore-plan.test.ts
node --test --import tsx packages/admin-api/src/admin-command-restore.test.ts
node --test --import tsx packages/admin-api/src/admin-command-restore-routes.test.ts
node --test --import tsx packages/admin-api/src/admin-command-audit.test.ts
node --test --import tsx packages/admin-api/src/admin-command-runtime.test.ts packages/admin-api/src/admin-command-guard.test.ts
node --test --import tsx packages/admin-api/src/admin-write-route-audit.test.ts
node --test --import tsx packages/admin-api/src/admin-worker-write-path-audit.test.ts
node --test --import tsx packages/admin-api/src/admin-settings-commands.test.ts
node --test --import tsx packages/admin-api/src/admin-library-commands.test.ts
node --test --import tsx packages/admin-api/src/admin-scan-planner.test.ts
node --test --import tsx packages/admin-api/src/admin-transition-commands.test.ts
node --test --import tsx packages/admin-api/src/admin-publish-commands.test.ts
node --test --import tsx packages/admin-api/src/admin-source-video-commands.test.ts
node --test --import tsx packages/admin-api/src/admin-preprocess-jobs-query.test.ts
node --test --import tsx packages/admin-api/src/admin-source-video-list-query.test.ts
node --test --import tsx packages/admin-api/src/admin-source-video-status-page-query.test.ts
node --test --import tsx packages/admin-api/src/admin-source-video-index-query.test.ts
node --test --import tsx packages/admin-api/src/admin-source-video-default-page-query.test.ts
node --test --import tsx packages/admin-api/src/admin-source-video-filtered-page-query.test.ts
node --test --import tsx packages/admin-api/src/admin-source-video-manifest-cache.test.ts
node --test --import tsx packages/admin-api/src/admin-source-video-detail-query.test.ts
node --test --import tsx packages/admin-api/src/admin-source-video-status-read-model-runtime.test.ts
node --test --import tsx packages/admin-api/src/admin-runtime-observability.test.ts
node --test --import tsx packages/admin-api/src/admin-runtime-observability-routes.test.ts
node --test --import tsx packages/admin-api/src/admin-route-adapter.test.ts
node --test --import tsx packages/admin-api/src/admin-auth-routes.test.ts
node --test --import tsx packages/admin-api/src/admin-read-model-routes.test.ts
node --test --import tsx packages/admin-api/src/admin-runtime-diagnostic-routes.test.ts
node --test --import tsx packages/admin-api/src/admin-protection-read-routes.test.ts
node --test --import tsx packages/admin-api/src/admin-library-command-routes.test.ts
node --test --import tsx packages/admin-api/src/admin-index-command-routes.test.ts
node --test --import tsx packages/admin-api/src/admin-cutter-user-command-routes.test.ts
node --test --import tsx packages/admin-api/src/admin-source-video-routes.test.ts
node --test --import tsx packages/admin-api/src/admin-source-video-media-routes.test.ts
node --test --import tsx packages/admin-api/src/admin-source-video-command-routes.test.ts
node --test --import tsx packages/admin-api/src/admin-settings-command-routes.test.ts
node --test --import tsx packages/admin-api/src/admin-slow-read-routes.test.ts
node --test --import tsx packages/admin-api/src/admin-system-read-routes.test.ts
node --test --import tsx packages/admin-api/src/admin-preprocess-read-routes.test.ts
node --test --import tsx packages/admin-api/src/admin-preprocess-command-routes.test.ts
node --test --import tsx packages/admin-api/src/admin-index-versions-query.test.ts
node --test --import tsx packages/admin-api/src/admin-dashboard-metrics-query.test.ts
node --test --import tsx packages/admin-api/src/admin-operations-overview.test.ts
node --test --import tsx packages/admin-api/src/index.test.ts
node --test --import tsx packages/library-fs/src/scanner.test.ts packages/library-fs/src/preprocess-safety.test.ts packages/library-fs/src/admin-writer-lease.test.ts packages/library-fs/src/usage-events.test.ts
node --test --import tsx scripts/acceptance/admin-real-nas-performance.test.ts
node --test --import tsx scripts/acceptance/admin-read-model-reconcile.test.ts
node --test --import tsx scripts/acceptance/admin-settings-browser-qa.test.ts
node --test --import tsx scripts/acceptance/admin-migrated-pages-live-browser-qa.test.ts scripts/acceptance/admin-index-publish-browser-qa.test.ts scripts/acceptance/admin-source-videos-browser-qa.test.ts scripts/acceptance/admin-cutter-users-browser-qa.test.ts scripts/acceptance/admin-doctor-browser-qa.test.ts scripts/acceptance/admin-settings-browser-qa.test.ts
node --test --import tsx apps/admin-web/src/features/protection/api.test.ts
node --test --import tsx apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts
npm run build:admin-web
npm run validate:nas-docker-compose-static
node --test --import tsx scripts/acceptance/nas-docker-compose-static.test.ts
```

Real NAS read-only performance proof should be refreshed after service extraction using `scripts/acceptance/admin-real-nas-performance.ts`. The latest refresh is `admin-real-nas-performance-20260625T231116Z`; it ran after the gated `admin.sqlite` rebuild recorded by `admin-read-model-reconcile-20260625T230933Z`.

Live migrated-page browser proof should be refreshed with isolated local services before using the migrated page set as release evidence:

```bash
MIXLAB_ADMIN_API_BASE_URL=http://127.0.0.1:<probe-api-port> MIXLAB_ADMIN_WEB_BASE_URL=http://127.0.0.1:<probe-web-port> MIXLAB_ADMIN_EXPECTED_LIBRARY_ROOT=/Volumes/MixLab/PublicLibrary node --import tsx scripts/acceptance/admin-migrated-pages-live-browser-qa.ts
```

The latest accepted refresh is `admin-migrated-pages-live-browser-qa-20260626T180453Z`; it ran GET-only against `/Volumes/MixLab/PublicLibrary` and did not run scan, reconcile, restore, publish, settings save, ASR test, user mutation, workers, Docker, or Cutter validation.

## Current Decision

Do not mark the active Goal complete.

Current state proves Phase 0 documentation and a partial implementation across Phase 1/2/3A plus command guard/runtime sub-slices D.1-D.3, operations overview / Protection Center sub-slices E.1/E.2, Admin read-model store sub-slices R.1-R.16, Operation Log UI sub-slice R.17, scan/read-model/query/command/service-boundary sub-slices R.18-R.67, Admin production-console IA and query/runtime/read-model sub-slices R.68-R.107, migrated production-console page sub-slices R.108-R.112, migrated-pages live NAS browser QA sub-slice R.113, route-loader request cancellation foundation sub-slice R.114, background refresh/prefetch cancellation sub-slice R.115, reusable request-scope helper sub-slice R.116, runtime/browser read-request cancellation proof sub-slice R.117, Admin Web command-action cancellation policy sub-slice R.118, explicit read-model reconcile maintenance controls sub-slice R.119, isolated maintenance-control browser proof sub-slice R.120, standalone worker Docker default-disabled safety contract sub-slice R.121, Docker dry-run release-gate bundle sub-slice R.122, Docker live-readonly probe sub-slice R.123, configured NAS live-readonly classification refinement sub-slice R.124, Docker version/API parity planning sub-slice R.125, admin-worker env proof entry sub-slice R.126, Docker staging/update runbook sub-slice R.127, Cutter compatibility proof entry sub-slice R.128, Docker runbook external proof ingestion sub-slice R.129, Docker release readiness summary sub-slice R.130, redundancy governance audit baseline sub-slice R.131, CSS governance classification sub-slice R.132, first targeted CSS cleanup sub-slice R.133, frontend fixture/API governance and extraction sub-slices R.134-R.144, backend process-history Query boundary extraction sub-slice R.145, runtime diagnostics recorder boundary extraction sub-slice R.146, read-model reconcile job snapshot reader extraction sub-slice R.147, read-model reconciler runtime assembly extraction sub-slice R.148, source-video read route dependency factory extraction sub-slice R.149, source-video media route dependency factory extraction sub-slice R.150, source-video command route dependency factory extraction sub-slice R.151, slow-read route dependency factory extraction sub-slice R.152, preprocess read route dependency factory extraction sub-slice R.153, preprocess command route dependency factory extraction sub-slice R.154, library command route dependency factory extraction sub-slice R.155, index command route dependency factory extraction sub-slice R.156, settings command route dependency factory extraction sub-slice R.157, cutter-user command route dependency factory extraction sub-slice R.158, command restore route dependency factory extraction sub-slice R.159, runtime diagnostic route dependency factory extraction sub-slice R.160, system read route dependency factory extraction sub-slice R.161, protection read route dependency factory extraction sub-slice R.162, runtime observability route dependency factory extraction sub-slice R.163, preprocess pipeline assembly extraction sub-slice R.164, runtime settings Query extraction sub-slice R.165, ready publish media extraction sub-slice R.166, runtime load Query extraction sub-slice R.167, library status Query extraction sub-slice R.168, path-checks Query extraction sub-slice R.169, integration baseline recheck sub-slice R.170, source-video artifact path extraction sub-slice R.171, Admin library path contract extraction sub-slice R.172, current-index Query extraction sub-slice R.173, and transcript metrics Query extraction sub-slice R.174, but the full Goal still has missing requirements:

R.175 current-state addendum: source-video read facade extraction is complete local evidence and belongs to the backend Query/API boundary and large-file governance sequence. It does not prove full Admin Architecture v1 completion.

R.176 current-state addendum: Dashboard read facade extraction is complete local evidence and belongs to the backend Query/API boundary and large-file governance sequence. It does not prove full Admin Architecture v1 completion.

R.177 current-state addendum: read-model server facade extraction is complete local evidence and belongs to the backend read-model/API boundary and large-file governance sequence. It does not prove full Admin Architecture v1 completion.

R.178 current-state addendum: Admin auth route dependency factory extraction is complete local evidence and belongs to the backend API dependency boundary and large-file governance sequence. It does not prove full Admin Architecture v1 completion.

R.179 current-state addendum: Admin health and preprocess safety Query extraction is complete local evidence and belongs to the backend Query/API boundary and large-file governance sequence. It does not prove full Admin Architecture v1 completion.

R.180 current-state addendum: Admin protection and release gate Query extraction is complete local evidence and belongs to the backend protection/read Query API boundary and large-file governance sequence. It does not prove full Admin Architecture v1 completion.

R.181 current-state addendum: Admin preprocess/jobs runtime facade extraction is complete local evidence and belongs to the backend slow-endpoint Query/API boundary and large-file governance sequence. It does not prove full Admin Architecture v1 completion.

R.182 current-state addendum: Admin HTTP/session helper extraction is complete local evidence and belongs to the backend server-shell/API boundary and large-file governance sequence. It does not prove full Admin Architecture v1 completion.

R.183 current-state addendum: Admin file-fact reader extraction is complete local evidence and belongs to the backend file-system fact-source boundary and large-file governance sequence. It does not prove full Admin Architecture v1 completion.

R.184 current-state addendum: Admin source-video cover response helper extraction is complete local evidence and belongs to the backend read-only media response boundary and large-file governance sequence. It does not prove full Admin Architecture v1 completion.

R.185 current-state addendum: Admin preprocess supervisor status projection extraction is complete local evidence and belongs to the backend runtime-status projection boundary and large-file governance sequence. It does not prove full Admin Architecture v1 completion.

- complete broad command snapshot/rollback protection story;
- broader store-backed Admin query paths, remaining bounded or redacted backup snapshots for any still-uncovered command paths, automatic rollback workflow, actual real NAS restore execution proof beyond the R.103 plan-only gate, deeper atomic/rollback protection for generated media/ASR artifacts beyond R.100 per-file temp-to-final write robustness and R.101 committed text-artifact snapshot planning, runtime metadata coverage beyond the four selected slow endpoints, deeper process-history charting/drill-through beyond R.106 filter proof, deeper Dashboard trend/drill-down store coverage beyond provenance, and broader maintenance scheduling beyond scan apply;
- explicit Query API / Command API service boundaries;
- deeper production-console page composition across remaining routes, future live-data browser coverage for newly migrated routes, future runtime cancellation coverage for newly added risk-bearing loaders, separately gated live validation for maintenance commands if needed, and continued refinement of the consistent table/inspector/header model across every page;
- redundant code governance after boundaries stabilize;
- live NAS Docker release gates and deployment validation beyond the R.122 dry-run report and R.123 no-target probe entrypoint.

Latest real NAS evidence additionally shows:

- `source-video-status-read-model-v1` is fresh for `/Volumes/MixLab/PublicLibrary`.
- `admin.sqlite` exists on the real NAS path, is fresh, and reports `safe_for_page_request:true`.
- The gated background rebuild wrote generated read-model metadata only; library total stayed `11394`, ready stayed `10471`, and `library.updated_at` stayed unchanged.
- R.113 live migrated-page browser QA proves `发布与索引`, `素材库`, `剪辑师`, `系统检查`, and `设置` render against the real local NAS-backed Admin API on isolated ports with direct route endpoint probes, `hidden_full_scan_allowed:false`, total `11394`, ready `10471`, current index `v010471`, and no scan/reconcile/restore/publish/settings-save/user-mutation/Docker commands.
- R.114 local tests prove the Admin Web typed client forwards a bound `AbortSignal` into fetch and the first route-entry loader group uses abortable scoped clients instead of relying only on stale setState guards.
- R.115 local tests prove Dashboard supplemental metrics, route prefetch, Dashboard panel refresh, and preprocess interval refresh use abortable scoped clients; interval reads track active request scopes and skip overlap.
- R.116 local tests prove route/background loaders now use `createRuntimeRequestScope(...)`; raw `AbortController` construction and direct signal binding are confined to the helper.
- R.117 runtime browser QA proves a delayed route-owned `GET /api/admin/source-videos?limit=20` closes before response when navigating away from `#/source-videos`; the accepted isolated-local artifact is `docs/acceptance/artifacts/admin-request-cancellation-browser-qa-20260626T184659Z.json/.md`.
- R.118 local tests prove protected Admin Web command actions use the stable runtime client instead of abortable request scopes, block duplicate in-flight command submissions, and keep route-read cancellation separate from command lifecycle policy.
- R.119 local tests prove Protection Center exposes explicit read-model reconcile start/cancel maintenance controls, the typed client uses POST command endpoints, route status loading remains read-only, and AdminApp uses the stable command client rather than abortable request scopes for these controls.
- R.120 isolated browser QA proves the real Protection Center page can click `启动后台对账` and `请求停止对账` against a temporary mock API, observing exactly one `POST /api/admin/read-model/reconcile`, exactly one `POST /api/admin/read-model/reconcile/cancel`, zero forbidden command posts, zero console errors, and zero failed Admin API requests. The accepted artifacts are `docs/acceptance/artifacts/admin-protection-maintenance-browser-qa-20260626T191903Z.json`, `.md`, and `-desktop.png`.
- R.121 static Docker safety validation proves NAS compose and `.env.example` default standalone preprocess/publish workers to disabled (`0`), rejects drift back to default enabled, and proves runtime worker commands only enable with explicit `1`.
- R.122 static Docker dry-run release-gate validation proves compose-local gates can pass while Docker upload remains blocked: static gates passed `8`, failed `0`, live-proof blockers `6`, `release_ready:false`, and `docker_upload_allowed:false`.
- R.123 live-readonly Docker probe validation adds a GET-only target-driven evidence collector and proves default no-target behavior is blocked rather than guessed: requests `0`, target configured `false`, `docker_upload_allowed:false`, and all unproven live/external Docker gates remain blockers.
- R.124 configured NAS live-readonly proof against `http://192.168.1.27:18080` shows the target is reachable and mapped to `/data/PublicLibrary`, but it is not current Admin Architecture v1 parity: `auth/status`, `release-gates`, and `data-loading/plan` return 404, while `library/status`, `dashboard/metrics`, and `preprocess/supervisor/status` respond. Docker upload remains blocked.
- R.125 Docker version/API parity planning reads the accepted R.124 live artifact without contacting NAS Docker and concludes that Docker image/API parity work is required later, but deploy is not allowed now. The accepted evidence is `docs/acceptance/artifacts/admin-docker-version-parity-plan-20260626T195950Z.json` and `.md`; blockers remain current API contract parity, NAS disk risk (`98%`/blocked), admin-worker environment proof, and Cutter compatibility proof.
- R.126 admin-worker env proof entry adds a local validator and template artifact for the external worker proof gate. The accepted template evidence is `docs/acceptance/artifacts/admin-worker-env-proof-20260626T200512Z.json` and `.md`; it remains blocked until NAS-exported `admin-worker.env` and `admin-worker.inspect.json` prove both standalone worker flags are `0`, Docker library roots are `/data/PublicLibrary`, and a running admin-worker image is observed.
- R.127 Docker staging/update runbook adds a no-side-effect release planning report that consumes R.125/R.126 evidence. The accepted evidence is `docs/acceptance/artifacts/admin-docker-staging-runbook-20260626T201028Z.json` and `.md`; it remains blocked because explicit current/target/rollback image tags are missing and R.125/R.126 blockers still stand. The report keeps `docker_deploy_allowed:false`.
- R.128 Cutter compatibility proof entry adds a local validator and template artifact for the external Windows Cutter proof gate. The accepted template evidence is `docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260626T202518Z.json` and `.md`; it remains blocked until staged-candidate `windows_acceptance` and `real_cut_smoke` reports prove reviewed auth, `10471+` ready videos visible, source-library/search/transcript compatibility, and a completed real cut.
- R.129 Docker runbook external proof ingestion updates the staging runbook to consume the R.128 Cutter proof alongside the R.126 worker proof. The accepted evidence is `docs/acceptance/artifacts/admin-docker-staging-runbook-20260626T202921Z.json` and `.md`; it remains blocked and now shows raw parity blockers, unresolved parity blockers, resolved external blockers, worker proof blockers, and Cutter proof blockers separately.
- R.130 Docker release readiness summary aggregates live-readonly, parity, worker, Cutter, and staging-runbook evidence into one no-side-effect final readiness report. The accepted evidence is `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260626T203427Z.json` and `.md`; it remains blocked and lists the condensed next actions for API parity, NAS disk pressure, worker proof, Cutter proof, and image tags.
- R.131 redundancy governance audit baseline adds a no-side-effect source audit for duplicate CSS selectors, large Admin files, and fixture/fallback/legacy hotspots. The accepted evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T204053Z.json` and `.md`; it remains blocked with `cleanup_ready:false`, `cleanup_allowed:false`, 40 duplicate selector candidates, 19 large-file candidates, and 18 term hotspot candidates.
- R.132 CSS governance classification adds a no-side-effect classifier for `styles.css` and `admin-reference.css`. The accepted evidence is `docs/acceptance/artifacts/admin-css-governance-classification-20260626T204735Z.json` and `.md`; it remains blocked with `cleanup_allowed:false`, 335 duplicate selector groups, 201 reference-layer overlaps, 133 `styles.css` same-file legacy duplicates, and 1 reference-internal duplicate.
- R.133 link-button CSS cleanup removes only old `.admin-app .admin-link-button` references from early `styles.css` layers, keeps the reference layer and canonical end-of-file state rules, and proves the workflow with `admin-css-governance-classification-20260626T205258Z`, `admin-redundancy-governance-audit-20260626T205504Z`, and `admin-source-videos-browser-qa-20260626T205445Z`.
- The latest performance probe after rebuild has no slow sampled endpoints.

R.77-R.133 current update:

- Local code now adds `/api/admin/preprocess/process-history`, a route-owned no-scan Query API backed only by complete `admin.sqlite` manifest/job snapshots.
- Focused tests prove the endpoint returns bounded newest-first process-history rows from `admin.sqlite`, refuses incomplete snapshots instead of hidden job-file scans, exposes `history_available`, `actual_data_source`, `cache_status`, and `scan_mode`, and is registered in the data-loading contract as `no-scan`.
- Admin Web now consumes that Query API through typed `listPreprocessProcessHistory(...)`, the preprocess route loader updates jobs/history together without Dashboard reloads, and `PreprocessJobsPage` renders history rows, read-model hit/miss state, local loading, local failure, and safe no-scan miss states.
- Focused Admin Web tests prove the typed client path, bounded query parameters, fixture data-loading contract, route-owned loader behavior, local miss rendering, `npm run typecheck`, and `npm run build:admin-web`.
- Local fixture-mode browser QA now covers `#/preprocess-jobs` at desktop and 390px mobile widths, including process-history screenshots, no browser console errors/warnings, no body-level horizontal overflow on mobile, and visible `admin-read-model · no-scan · hit` evidence.
- R.79 also fixes the fixture Admin Web favicon 404 and adds a narrow-screen Admin Shell v1 override so the mobile navigation, route content, Inspector, and process-history summary remain usable.
- R.80 adds `scripts/acceptance/admin-process-history-live-readonly.ts` and a focused test so live process-history availability can be checked through GET-only Admin API requests without starting reconcile, scan, apply, repair, publish, rebuild, Docker upload, or Cutter protocol work.
- The R.80 live run against a temporary local Admin API on `http://127.0.0.1:3892` and `/Volumes/MixLab/PublicLibrary` passed all gates: library root matched, current index was `v010471`, counts were total `11394` and ready `10471`, `admin.sqlite` was fresh/page-safe, data-loading declared `/api/admin/preprocess/process-history` as `no-scan`, and the process-history response was bounded and no-scan.
- The R.80 live result is a `safe-miss`, not a live history-row hit: `actual_data_source=admin-read-model`, `cache_status=miss`, `scan_mode=no-scan`, `history_available=false`, `returned_count=0`. This proves the page path remains safe but shows the real NAS read model still needs a separate gated job-snapshot/rebuild readiness step before real process-history rows appear.
- The R.80 live probe observed `read-model/status` at `2172.6ms` and process-history at `149.5ms`; this should inform future diagnostics/status performance work but does not change the no-scan process-history contract.
- R.81 adds `/api/admin/preprocess/process-history/readiness`, a no-scan readiness diagnostic that explains whether process-history is blocked by a missing/stale/unreadable store, incomplete job snapshot metadata, row-count mismatch, or is ready.
- The updated live-readonly probe now captures readiness. Against the real NAS path it reports `reason=store_unreadable` with `last_error="no such table: preprocess_job_status"`, proving the live `admin.sqlite` was generated before the preprocess-job snapshot table existed. This narrows the next step from vague rebuild talk to a gated read-model migration/rebuild for derived `admin.sqlite` only.
- R.82 adds `scripts/acceptance/admin-read-model-rebuild-plan.ts` and `scripts/acceptance/admin-read-model-rebuild-plan.test.ts`, a plan-only GET-only gate for the next live read-model rebuild/migration step.
- The R.82 live plan run against a temporary local Admin API on `http://127.0.0.1:3892` and `/Volumes/MixLab/PublicLibrary` passed all gates. It kept the current step read-only, reported `reason=store_unreadable`, selected `force-rebuild-derived-admin-read-model` as the later controlled action, and wrote artifacts `admin-read-model-rebuild-plan-20260626T105630Z.json/.md`.
- The R.82 report restricts later writes to `.mixlab-library/admin-read-model/admin.sqlite`, `.mixlab-library/admin-read-model/admin.sqlite-*`, and `.mixlab-library/admin-read-model`; it forbids source-video manifest writes, `library.json` count or `updated_at` changes, release/index writes, ready-video requeue/rerun/delete/hide/downline effects, and Docker/container changes.
- R.83 tightens the plan/reconcile gates: the allowed live write scope is now derived `admin.sqlite*` plus operation-log audit appends, and apply-mode reconcile must prove current index unchanged, process-history readiness `ready`, and process-history `admin-read-model` / `no-scan` hit.
- The first R.83 live reconcile attempt reached terminal `succeeded` for the rebuild but failed the new process-history gates. Root cause: a later source-video status runtime refresh wrote the same `admin.sqlite` without job snapshots and erased the freshly created `preprocess_job_status` projection.
- R.83 fixes that writer interaction in `packages/admin-api/src/admin-read-model-store.ts`: when no new job snapshot is supplied, a complete existing `preprocess_job_status` snapshot is preserved if its metadata and table row count still match the current model.
- The corrected R.83 live reconcile run passed all gates in `admin-read-model-reconcile-20260626T111856Z.json/.md`: terminal `succeeded`, total `11394`, ready `10471`, current index `v010471`, library `updated_at` unchanged, `admin.sqlite` fresh/page-safe/no-scan, operation log readable, process-history readiness `ready`, and process-history hit from `admin-read-model`.
- The post-run plan-only probe `admin-read-model-rebuild-plan-20260626T112254Z.json/.md` reports `rebuild_plan.needed=false`, `reason=ready`, and no failed gates.
- R.84 adds `scripts/acceptance/admin-process-history-live-browser-qa.ts` and a focused test so the live `#/preprocess-jobs` page can be checked through desktop/mobile browser rendering, direct GET-only API probes, screenshots, console/API failure collection, visible read-model hit labels, row counts, and body-overflow gates.
- R.84 browser QA exposed and fixed a route-loader isolation bug: a slow `preprocess/jobs` request could discard a successful process-history hit and show a history-panel error. `loadAdminPreprocessRouteData(...)` now returns independent `jobsError` and `processHistoryError` results so jobs slowness does not hide read-model history rows.
- The accepted R.84 live run in `admin-process-history-live-browser-qa-20260626T114058Z.json/.md` proves Admin Web rendered the real NAS process-history hit state through the isolated `5186` Web and `3892` API stack: library root `/Volumes/MixLab/PublicLibrary`, current index `v010471`, total `11394`, ready `10471`, process-history readiness `ready`, `history_available=true`, `actual_data_source=admin-read-model`, `cache_status=hit`, `scan_mode=no-scan`, `returned_count=20`, desktop rows `20`, mobile rows `20`, console errors `0`, failed Admin API requests `0`, and document horizontal overflow `0px`.
- This reduces the previous "deeper process-history reporting" gap to analytics depth and broader production-console composition beyond the first route-owned live panel; it does not complete the full Goal.
- R.85 extends the read-model reconciler status/event payload with backward-compatible step progress fields for `library-manifest`, `source-video-manifests`, `preprocess-job-snapshots`, `writing`, and terminal states while preserving legacy scan counts and percent.
- R.85 updates the real Admin API read-model snapshot reader to collect preprocess-job snapshots in bounded batches and emit incremental `preprocess_job_snapshot_count`, `total_preprocess_job_snapshot_count`, `step_completed_count`, `step_total_count`, and `step_percent` progress. This makes background `full-reconcile` maintenance explainable without moving NAS job-file reads into page requests.
- R.85 verification passed `admin-read-model-reconciler.test.ts`, the new batch-progress contract test in `index.test.ts`, the service-level read-model reconcile test in `index.test.ts`, `admin-read-model-reconcile-scheduler.test.ts`, full `packages/admin-api/src/index.test.ts` with 66 tests, and `npm run typecheck`.
- R.86 exposes the R.85 reconcile progress payload in Admin Web Protection Center through a route-owned, read-only `/api/admin/read-model/reconcile/status` request. The page now shows `后台对账`, run status, phase, current step, total progress, step progress, preprocess-job snapshot progress, cancel state, and recent message.
- R.86 keeps the protection overview usable when reconcile status is unavailable, updates the Admin Web and backend data-loading contracts so the extra protection route endpoint is declared as `no-scan`, and proves the fixture UI can render a running `preprocess-job-snapshots` state without starting a reconcile.
- R.86 verification passed `apps/admin-web/src/features/protection/api.test.ts`, `apps/admin-web/src/api.test.ts`, `apps/admin-web/src/admin-app.test.ts`, `packages/admin-api/src/admin-data-loading-plan.test.ts`, `npm run typecheck`, `npm run build:admin-web`, and fixture browser QA at `http://127.0.0.1:5198/#/protection` with screenshot `output/playwright/admin-protection-read-model-reconcile-status-r86.png`.
- R.87 extends the process-history Query API summary with tracked analytics computed from `admin.sqlite`: tracked row count, completed/failed/active counts, average duration, window start, oldest/newest event timestamps, preprocess-status distribution, and event-type distribution. The visible row `limit` remains bounded and independent from the broader tracked summary.
- R.87 updates the Admin Web preprocess page to render `分析范围`, `状态分布`, and `事件分布` cards from the same route-owned no-scan process-history response. It does not add a new page-time scan, live reconcile, NAS mutation, Docker change, or Cutter protocol change.
- R.87 verification passed `packages/admin-api/src/admin-read-model-store.test.ts`, process-history-focused `packages/admin-api/src/index.test.ts`, `apps/admin-web/src/api.test.ts`, `apps/admin-web/src/admin-app.test.ts`, `npm run typecheck`, `packages/admin-api/src/admin-preprocess-read-routes.test.ts`, `packages/admin-api/src/admin-data-loading-plan.test.ts`, and full `packages/admin-api/src/index.test.ts`.
- R.88 adds per-section Dashboard metrics provenance for material, transcript, production, usage, risk, and runtime-load groups. Large-library Dashboard summaries can now identify `admin-read-model` for material/production/risk, `current-index` for transcript, and `admin-read-model` or `usage-events` for usage depending on projection freshness.
- R.88 updates `/api/admin/dashboard/metrics` runtime data-source derivation so endpoint-level runtime diagnostics can report `actual_data_source=admin-read-model` when major Dashboard groups come from `admin.sqlite`, instead of always flattening the endpoint to `usage-events`.
- R.88 updates Admin Web to render a compact `数据来源` line on Dashboard, with Chinese labels such as `素材 读模型 · 不扫描`, `产能 读模型 · 不扫描`, and `使用 读模型 · 不扫描`.
- R.88 verification passed `admin-dashboard-metrics-query.test.ts`, `admin-dashboard-metrics-cache.test.ts`, `admin-slow-read-routes.test.ts`, `admin-data-loading-plan.test.ts`, `apps/admin-web/src/api.test.ts`, `apps/admin-web/src/admin-app.test.ts`, full `packages/admin-api/src/index.test.ts`, `npm run typecheck`, `npm run build:admin-web`, target-file `git diff --check`, and a Dashboard integration proving a 101-video fresh `admin.sqlite` response with `runtime.actual_data_source=admin-read-model`.
- R.89 adds a command-snapshot restore-plan visibility path in Admin Web Operation Log. File-capture command snapshots now show a `查看恢复预检` action that only calls GET `/api/admin/command-snapshots/:snapshot_id/restore-plan`, renders restore eligibility, file counts, blockers, target/snapshot statuses, and the `不扫描` contract, and deliberately does not expose POST restore execution.
- R.89 extends the shared scan/data-loading vocabulary with `data_source=command-snapshot` and declares restore-plan as `phase=command`, `refresh=command-only`, and `scan_mode=no-scan`.
- R.89 verification passed `packages/admin-api/src/admin-data-loading-plan.test.ts`, `apps/admin-web/src/api.test.ts`, `apps/admin-web/src/admin-app.test.ts`, full `packages/admin-api/src/index.test.ts`, `npm run typecheck`, `npm run build:admin-web`, target-file `git diff --check`, and target-file trailing-whitespace scan.
- R.90 adds command audit actor attribution v1. Protected commands that already go through `runAdminCommand` now can write a structured `actor` alongside the existing `holder`, distinguishing authenticated admin-session operators, auth-disabled local mode, system/background tasks, and runtime-holder fallback.
- R.90 wires Admin API request authentication into protected command calls without logging session tokens. Background read-model reconcile and pipeline auto-queue commands are explicitly tagged as `system-task`.
- R.90 updates Admin Web Operation Log to render `操作者` from the actor field and keep `锁持有者` visible for writer-lease/process debugging.
- R.90 narrows the previous actor-attribution gap for command-runtime paths, but it does not complete the broader migration of legacy write paths such as cutter-user mutations into the Command API audit model.
- R.91 migrates Admin Cutter user approve, disable, and password reset writes into `runAdminCommand`. These commands now acquire the admin writer lease, capture `.mixlab-library/cutter-users/users.json`, append `users` area operation-log events with actor/holder details, and remain `no-scan` / non-source-video-read-model-invalidating.
- R.91 keeps the Cutter user store schema, Cutter login/session protocol, password policy, and public API redaction unchanged. Tests prove password values and cutter session tokens are not logged.
- R.91 updates Admin Web Operation Log labels so users-area command records render as `剪辑师`, `通过剪辑师`, `停用剪辑师`, and `重置剪辑师密码`.
- R.92 adds `packages/admin-api/src/admin-write-route-audit.ts`, a tested route-level audit contract for every current Admin `POST`/`PATCH`/`DELETE` route.
- R.92 proves command-runtime routes match `admin-command-guard`, public commands are routed or explicitly system-only, and non-command exceptions do not falsely claim command-audit or writer-lease coverage.
- R.92 left Admin auth register/login/logout as a documented auth-store/session exception at that checkpoint and identified worker-internal writes after `preprocess/supervisor/start` as a separate pipeline write-path audit, instead of pretending those were covered by the route-level Command API. R.98 later moves the auth POST routes into command-runtime coverage.
- R.93 adds `packages/admin-api/src/admin-worker-write-path-audit.ts`, a tested background write-path audit contract for Docker worker loop spawning, Admin supervisor scan/init/auto-queue, Admin supervisor worker claim/stage/complete/fail, Admin supervisor publish, standalone preprocess worker, standalone ready-publish worker, and low-level library-fs lifecycle primitives.
- R.93 proves the Admin supervisor scan/queue path is only partially command-covered, because `runAdminPipelineQueueCommand(...)` is command-gated but the preceding `initializeAdminLibrary(...)` and `scanSourceVideos(...)` are direct pipeline writes.
- R.93 proved the Admin supervisor pipeline did not enforce `auto_scan_enabled`, `auto_queue_enabled`, or `auto_publish_index_enabled` at that audit point; R.94 is the follow-up enforcement slice for those flags.
- R.93 proved worker lifecycle and publish writes were not page-request safe and were not full command-runtime protections at that audit point, even though lifecycle status assertions and preprocess job logs existed.
- R.94 makes `runAdminPreprocessPipeline(...)` enforce `auto_scan_enabled`, `auto_queue_enabled`, and `auto_publish_index_enabled`: disabled scan skips hidden init/scan and returns an existing-manifest no-scan summary, disabled queue does not auto-transition unprocessed videos, and disabled publish leaves completed work at `index-required` without release/index publication.
- R.94 updates the worker write-path audit so those three runtime policy flags are recorded as enforced while preserving the remaining worker command/lease/snapshot gaps for scan/init, lifecycle, and publish writes.
- R.95 adds `preprocess-supervisor-publish-ready` as a system-only release command and routes the Admin supervisor auto-publish cycle through `runAdminCommand(...)`. Background `index-required -> ready` publication now has writer lease, file-capture snapshot, command audit, system actor attribution, and route-audit classification as a system-only command.
- At the R.95 checkpoint, scan/init and worker claim/stage/complete/fail lifecycle writes remained the supervisor-side command/lease/snapshot gap, and standalone workers remained explicit-enable worker entrypoints outside Admin command audit.
- R.96 adds `preprocess-worker-claim`, `preprocess-worker-stage`, `preprocess-worker-complete`, `preprocess-worker-fail`, and `preprocess-worker-refresh-counts` as system-only worker lifecycle commands.
- R.96 adds `packages/admin-api/src/admin-worker-lifecycle-commands.ts` and injects `createAdminWorkerLifecycleCommands(...)` into the Admin supervisor `createRealPreprocessRunner(...)` path, so default supervisor claim/stage/complete/fail/count-refresh short writes now use writer lease, command snapshots, command audit, and system actor attribution.
- R.96 keeps long-running FFmpeg/ASR/upload/polling and generated media/transcript artifacts outside the writer lease by design, so `admin-supervisor-worker-cycle` remains `partial` coverage in the write-path audit rather than being overstated as fully locked end-to-end.
- R.97 routes Admin supervisor automatic scan/init through `runAdminLibraryScanCommand(...)`, so `auto_scan_enabled` now uses the existing `library-scan` command runtime with writer lease, file-capture snapshot, command audit, system actor attribution, and read-model invalidation handoff.
- R.97 keeps `auto_scan_enabled:false` as a no-scan existing-manifest path and proves it does not emit `library-scan` command audit events or discover new files.
- R.97 updates the worker write-path audit so Admin supervisor scan/init plus auto-queue writes are command-covered, while preserving the fact that scan and queue are separate command transactions rather than one atomic pipeline transaction.
- R.98 adds `admin-auth-register`, `admin-auth-login`, and `admin-auth-logout` command contracts for Admin user/session store writes. These commands are `no-scan`, acquire the Admin writer lease, do not invalidate source-video read models, and keep mutation targets limited to `admin-user-store` and/or `admin-session-store`.
- R.98 adds `packages/admin-api/src/admin-auth-commands.ts` and routes the real Admin API register/login/logout dependencies through it. The existing auth route adapter response shape, password policy, admin-user/session schema, and `validateAdminSession(...)` behavior are unchanged.
- R.98 deliberately uses metadata-only command snapshots for auth commands. Focused tests prove operation-log command details and snapshot manifests do not contain plaintext passwords, password hashes, or session tokens.
- R.98 updates `admin-write-route-audit.ts` so Admin auth POST routes are command-runtime entries rather than `auth-store` exceptions, and Operation Log now has Chinese labels for the three Admin auth commands.
- R.99 adds `packages/admin-api/src/admin-worker-artifact-guard.ts`, a tested Admin supervisor text artifact commit guard for transcript and SRT artifacts.
- R.99 runs the artifact guard inside `runAdminWorkerCompleteCommand(...)` before `completePreprocessArtifacts(...)`, so missing files, absolute paths, traversal paths, or paths scoped to the wrong source-video directory block `processing -> index-required` and produce a failed command audit event with `artifact_commit_blocked`.
- R.99 updates `preprocess-worker-complete` command metadata to include `source-video-artifact` mutation responsibility and updates the worker write-path audit to state that required text artifacts are verified at commit time while long-running FFmpeg/ASR work remains outside the writer lease by design.
- R.99 verification passed the artifact guard tests, worker lifecycle command tests, command contract/audit tests, worker write-path audit tests, process-pipeline-focused Admin API tests, full `packages/admin-api/src/index.test.ts`, and `npm run typecheck`.
- R.100 updates `packages/library-fs/src/asr-artifacts.ts` so generated transcript JSON and SRT artifacts are written through same-directory temp files and renamed to their existing final paths, with temp cleanup on blocked rename.
- R.100 updates `packages/preprocess-core/src/index.ts` so FFmpeg extraction writes local ASR audio to a same-directory temporary path that preserves the selected extension, then renames to the final audio path before upload; uploader inputs and returned `audio_path` remain compatible.
- R.100 verification passed focused ASR artifact tests, preprocess core tests, preprocess worker tests, Admin worker artifact/lifecycle tests, process-pipeline-focused Admin API tests, full `packages/admin-api/src/index.test.ts`, and `npm run typecheck`.
- R.101 updates `packages/admin-api/src/admin-worker-lifecycle-commands.ts` so `preprocess-worker-complete` command snapshots include captured transcript/SRT artifact files alongside lifecycle files before committing `processing -> index-required`.
- R.101 proves the existing command snapshot restore planner can mark those transcript/SRT artifact entries as restorable, while ASR audio remains outside the restore model because it is not committed into source-video manifests.
- R.101 verification passed worker lifecycle snapshot/restore-plan tests, worker write-path audit tests, command snapshot/restore-plan tests, R.99/R.101 combined artifact/lifecycle tests, process-pipeline-focused Admin API tests, command guard/audit tests, full `packages/admin-api/src/index.test.ts`, and `npm run typecheck`.
- R.102 adds typed Admin Web restore execution support with `restoreCommandSnapshot(...)`, mirroring the guarded backend POST `/api/admin/command-snapshots/:snapshot_id/restore` result shape: restored/blocked status, restored and blocked counts, blockers, plan, and file results.
- R.102 extends the backend and fixture data-loading contracts so restore execution is explicitly `phase=command`, `refresh=command-only`, `scan_mode=no-scan`, and `data_source=command-snapshot`. This keeps restore POST out of login, shell, Dashboard, and route-open loading.
- R.102 updates Operation Log so file-capture snapshots first show read-only restore preflight; restorable plans then expose a local `准备恢复` state and only show `确认执行恢复` after that local arm step. Blocked plans do not expose confirm execution, and result/blocker/file details render after execution.
- R.102 updates the Admin UI contract so `查看恢复预检` is read-only, `准备恢复` is local-only, and `确认执行恢复` is the only m9b-api restore write control.
- R.102 verification passed `packages/admin-api/src/admin-data-loading-plan.test.ts`, `apps/admin-web/src/api.test.ts`, `apps/admin-web/src/admin-app.test.ts`, `apps/admin-web/src/features/admin-ui-contract.test.ts`, `npm run typecheck`, `npm run build:admin-web`, target-file `git diff --check`, and target-file trailing-whitespace scan.
- R.103 adds `scripts/acceptance/admin-command-restore-drill-plan.ts`, a GET-only plan gate for one explicit `MIXLAB_ADMIN_RESTORE_SNAPSHOT_ID`. It probes auth status, library status, data-loading plan, bounded operation-log tail, and restore-plan only; it never calls POST restore.
- R.103 records the future restore drill invariants before any destructive action: expected and actual library root, library `updated_at`, total/ready counts, current index, operation-log snapshot metadata, restore-plan blockers, file counts, and required future environment variables.
- R.103 rejects missing operation-log evidence, metadata-only snapshots, snapshots with missing/skipped/failed captured files, blocked restore plans, and restore candidates above the configured max file count.
- R.103 verification passed `scripts/acceptance/admin-command-restore-drill-plan.test.ts`, neighboring plan/read-only script tests, and `npm run typecheck`.
- R.104 extends the process-history Query API summary with bounded source-folder summaries and newest-first daily trend buckets computed from complete `admin.sqlite` snapshots only.
- R.104 updates Admin Web typed API, fixture data, and the Preprocess page so route-owned process-history renders `来源分布` and `最近趋势` without Dashboard coupling, page-time NAS scans, live reconcile, NAS mutation, Docker changes, or Cutter protocol changes.
- R.104 verification passed `packages/admin-api/src/admin-read-model-store.test.ts`, `apps/admin-web/src/api.test.ts`, `apps/admin-web/src/admin-app.test.ts`, and `npm run typecheck`.
- R.105 adds no-scan process-history filters for source folder, preprocess status, and event type. Backend query parameters are bounded/allowlisted, and filtered rows plus summaries are computed from complete `admin.sqlite` snapshots only.
- R.105 updates Admin Web typed API, fixture data, route-owned `AdminApp` state, and `PreprocessJobsPage` controls so filter changes refresh only `/api/admin/preprocess/process-history` with `limit=20` and `window_days=30`, without Dashboard or shell reload coupling.
- R.105 verification passed the combined focused test group `node --test --import tsx packages/admin-api/src/admin-read-model-store.test.ts packages/admin-api/src/admin-preprocess-read-routes.test.ts apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts` with 104 tests, plus `npm run typecheck` and `npm run build:admin-web`.
- R.106 extends `scripts/acceptance/admin-process-history-live-browser-qa.ts` so live browser QA now proves R.105 filters through GET-only API probes and visible desktop/mobile filter-control interaction.
- R.106 live QA passed against `/Volumes/MixLab/PublicLibrary` through isolated local services `http://127.0.0.1:3892` and `http://127.0.0.1:5186/#/preprocess-jobs`: current index `v010471`, total `11394`, ready `10471`, baseline process-history `admin-read-model/no-scan/hit` with 20 rows, selected filters `source_folder_name=陈永亮`, `preprocess_status=queued`, `event_type=claimed`, filtered process-history `admin-read-model/no-scan/hit` with 11 matching rows, desktop/mobile controls visible, filtered requests observed, console errors `0`, failed Admin API requests `0`, and overflow `0px`.
- R.106 evidence artifacts are `docs/acceptance/artifacts/admin-process-history-live-browser-qa-20260626T162358Z.json`, `.md`, `-desktop.png`, and `-mobile.png`. Script tests passed 4 tests and `npm run typecheck` passed.
- R.107 adds a production-console page composition/data-loading contract to `apps/admin-web/src/features/admin-ui-contract.ts`. Every Admin page now declares its role, primary/support surface, inspector requirement, error boundary, route plan, load phase, expected endpoints, allowed data sources, hidden-scan prohibition, and Dashboard coupling policy.
- R.107 adds the missing backend `index-publish` route plan to `packages/admin-api/src/admin-data-loading-plan.ts`, binding the publish page to route-owned `/api/admin/source-videos` and `/api/admin/index/versions` loading instead of an implicit Dashboard/Preprocess responsibility.
- R.107 updates Admin Web fixture data-loading plan coverage for source detail, process-history readiness, index publish, cutter users, Doctor, and Settings runtime/path probes so local tests cannot hide drift from the real backend contract.
- R.107 verification passed `node --test --import tsx packages/admin-api/src/admin-data-loading-plan.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts apps/admin-web/src/api.test.ts` with 38 tests, `node --test --import tsx apps/admin-web/src/admin-app.test.ts` with 46 tests, and `npm run typecheck`.
- R.108 migrates `apps/admin-web/src/features/index-publish/IndexPublishPage.tsx` into the production-console composition pattern: `发布队列` is the primary surface, `索引版本` is the support surface, `版本详情` remains the inspector, and the page-contract rows state read-model/index-package provenance, route loading, no-scan behavior, and local error ownership.
- R.108 fixes the summary-only pending-publication case so a non-zero `index_required_video_count` renders as `摘要 N 条` instead of an apparently empty queue, avoiding a misleading operator state when the first page has no returned rows.
- R.108 adds `scripts/acceptance/admin-index-publish-browser-qa.ts` plus focused tests and fixture desktop/mobile evidence. The accepted fixture QA artifacts are `admin-index-publish-browser-qa-20260626T165342Z.json`, `.md`, `-desktop.png`, and `-mobile.png`; gates passed with no console errors, no failed Admin API requests, and `0px` horizontal overflow.
- R.108 verification passed `node --test --import tsx scripts/acceptance/admin-index-publish-browser-qa.test.ts apps/admin-web/src/admin-app.test.ts` with 51 tests, `npm run typecheck`, and `npm run build:admin-web`.
- R.109 migrates `apps/admin-web/src/features/source-videos/SourceVideosPage.tsx` into the production-console composition pattern: `素材表格` is the primary surface, `素材详情` remains the inspector, and the page contract states `读模型`, `分页读取`, `不扫描`, page-control filter semantics, loaded-count visibility, and route-local ownership.
- R.109 adds `scripts/acceptance/admin-source-videos-browser-qa.ts` plus focused tests and fixture desktop/mobile evidence. The accepted fixture QA artifacts are `admin-source-videos-browser-qa-20260626T170700Z.json`, `.md`, `-desktop.png`, and `-mobile.png`; gates passed with no console errors, no failed Admin API requests, and `0px` horizontal overflow.
- R.109 verification passed `node --test --import tsx scripts/acceptance/admin-source-videos-browser-qa.test.ts apps/admin-web/src/admin-app.test.ts` with 52 tests, `npm run typecheck`, and `npm run build:admin-web`.
- R.110 migrates `apps/admin-web/src/features/cutter-users/CutterUsersPage.tsx` into the production-console composition pattern: `用户表格` is the primary surface, `用户概览` remains the inspector, and the page contract states `用户仓库`, `使用指标`, `命令操作`, `不扫描`, and route-local ownership.
- R.110 adds `scripts/acceptance/admin-cutter-users-browser-qa.ts` plus focused tests and fixture desktop/mobile evidence. The accepted fixture QA artifacts are `admin-cutter-users-browser-qa-20260626T171853Z.json`, `.md`, `-desktop.png`, and `-mobile.png`; gates passed with no console errors, no failed Admin API requests, and `0px` horizontal overflow.
- R.110 verification passed `node --test --import tsx scripts/acceptance/admin-cutter-users-browser-qa.test.ts apps/admin-web/src/admin-app.test.ts` with 53 tests, `npm run typecheck`, and `npm run build:admin-web`.
- R.111 migrates `apps/admin-web/src/features/doctor/DoctorPage.tsx` into the production-console composition pattern: `诊断报告` is the primary surface, `检查结果` remains the explanation surface, `检查报告` remains the inspector, and the page contract states `doctor-probes`, `doctor-route`, `状态扫描`, `本页面局部处理`, and `导出操作`.
- R.111 fixes the Admin Web Doctor route loader to call `getDoctorReport()` on route entry and preserve `runDoctor()` for the explicit `重新检查` command. A pending-report handoff prevents complete Doctor reports from being dropped when they resolve before shell data.
- R.111 adds `scripts/acceptance/admin-doctor-browser-qa.ts` plus focused tests and fixture desktop/mobile evidence. The accepted fixture QA artifacts are `admin-doctor-browser-qa-20260626T173308Z.json`, `.md`, `-desktop.png`, and `-mobile.png`; gates passed with visible `公共素材库根目录` diagnostic rows, no console errors, no failed Admin API requests, and `0px` horizontal overflow.
- R.111 verification passed `node --test --import tsx scripts/acceptance/admin-doctor-browser-qa.test.ts apps/admin-web/src/admin-app.test.ts` with 54 tests, `npm run typecheck`, and `npm run build:admin-web`.
- R.112 migrates `apps/admin-web/src/features/settings/SettingsPage.tsx` into the production-console composition pattern: `设置表单` is the primary surface, `运行策略` is the runtime policy surface, `设置概览` remains the inspector, and the page contract states `admin-settings`, `path-checks`, `runtime-secrets`, `settings-route`, `不扫描`, `本地编辑`, `命令操作`, and `本页面局部处理`.
- R.112 hardens the Admin Web Settings route loader for path checks and runtime settings. It skips duplicate route loads for the same reload token and preserves path/runtime responses that arrive before shell data through pending handoff refs.
- R.112 adds `scripts/acceptance/admin-settings-browser-qa.ts` plus focused tests and fixture desktop/mobile evidence. The accepted fixture QA artifacts are `admin-settings-browser-qa-20260626T174742Z.json`, `.md`, `-desktop.png`, and `-mobile.png`; gates passed with visible `设置表单`, `运行策略`, `设置概览`, no console errors, no failed Admin API requests, and `0px` horizontal overflow.
- R.112 verification passed `node --test --import tsx scripts/acceptance/admin-settings-browser-qa.test.ts apps/admin-web/src/admin-app.test.ts` with 55 tests, `npm run typecheck`, and `npm run build:admin-web`.
- R.113 adds `scripts/acceptance/admin-migrated-pages-live-browser-qa.ts`, an aggregate GET-only live browser/API gate for the migrated R.108-R.112 pages. It reuses the route-specific browser QA runners sequentially and verifies auth mode, library root/counts, current index, read-model page-safety, data-loading route plans, route endpoint scan modes, console/API failures, and overflow.
- R.113 adjusts `scripts/acceptance/admin-cutter-users-browser-qa.ts` so the live gate does not require a `通过申请` button when the real account store has `待审核 0 人`; fixture tests still cover the approval-control path.
- R.113 live QA passed against isolated services `http://127.0.0.1:3893` and `http://127.0.0.1:5187` pointed at `/Volumes/MixLab/PublicLibrary`: total `11394`, ready `10471`, current index `v010471`, `admin.sqlite` fresh/page-safe, all route contracts non-`full-reconcile`, and browser reports passed for `发布与索引`, `素材库`, `剪辑师`, `系统检查`, and `设置`.
- R.113 accepted artifacts are `docs/acceptance/artifacts/admin-migrated-pages-live-browser-qa-20260626T180453Z.json`, `.md`, and the corresponding route desktop/mobile screenshots for timestamp `20260626T180453Z`. Verification passed the 24-test browser QA script group and `npm run typecheck`.
- R.114 adds optional `AbortSignal` binding to `createAdminApiClient(...)`, so a scoped runtime client can abort all typed Admin API fetches without changing every method signature.
- R.114 wires abortable scoped clients into the first route-entry loader group in `AdminApp`: auth status, shell summary, `source-videos`, `preprocess-jobs`, `index-publish`, `protection`, `operation-log`, `doctor`, `settings` path/runtime probes, `source-detail`, and `cutter-users`.
- R.114 verification passed `node --test --import tsx apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts` with 79 tests and `npm run typecheck`.
- R.115 extends the same abortable scoped-client pattern to Admin Web background reads: supplemental dashboard metrics, disabled-by-default route prefetch paths, Dashboard panel refresh, and preprocess interval refresh.
- R.115 adds active request tracking to Dashboard panel and preprocess interval refresh loops so a slow background request prevents overlapping refreshes and is aborted on cleanup or dependency changes.
- R.115 verification passed `node --test --import tsx apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts` with 80 tests, `npm run typecheck`, and `npm run build:admin-web`.
- R.116 extracts `createRuntimeRequestScope(...)` in `AdminApp` as the shared helper that creates the abort controller, binds its signal to the runtime client, and exposes cleanup through `requestScope.abort()`.
- R.116 migrates route-entry loaders, disabled-by-default prefetch paths, Dashboard supplemental metrics, Dashboard panel refresh, preprocess interval refresh, source detail, and cutter-user route loading to `requestScope.client` / `requestScope.abort()`.
- R.116 verification passed `node --test --import tsx apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts` with 80 tests, `npm run typecheck`, and `npm run build:admin-web`.
- R.117 adds `scripts/acceptance/admin-request-cancellation-browser-qa.ts`, which starts an isolated mock Admin API and temporary Admin Web Vite server, opens the real app through Playwright, triggers a delayed `source-videos` route GET, navigates back to Dashboard, and fails unless the mock server observes the delayed request closing before any response is written.
- R.117 accepted runtime evidence is `admin-request-cancellation-browser-qa-20260626T184659Z.json/.md`: the delayed `GET /api/admin/source-videos?limit=20` started, closed after `38.4ms`, had `aborted_before_response:true`, and had no `response_sent_at`.
- R.117 verification passed `node --test --import tsx apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts scripts/acceptance/admin-request-cancellation-browser-qa.test.ts` with 84 tests, `npx tsx scripts/acceptance/admin-request-cancellation-browser-qa.ts`, `npm run typecheck`, and `npm run build:admin-web`.
- R.118 adds `apps/admin-web/src/app/command-cancellation-policy.ts` and tests, explicitly separating abortable route reads, protected non-abortable commands, local-only restore arming, and explicit safe-checkpoint maintenance cancel semantics.
- R.118 wires `runAction(...)`, smart scan, and command-snapshot restore execution through a duplicate-submission guard while preserving the stable runtime `client` for mutating command traffic.
- R.118 verification passed `node --test --import tsx apps/admin-web/src/app/command-cancellation-policy.test.ts apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts` with 85 tests, `npm run typecheck`, and `npm run build:admin-web`.
- R.119 adds typed Admin Web read-model reconcile start/cancel client methods, Protection Center command endpoint constants, explicit `启动后台对账` / `请求停止对账` controls, and AdminApp command-gated handlers that update local reconcile status after command settlement.
- R.119 verification passed `node --test --import tsx apps/admin-web/src/api.test.ts apps/admin-web/src/features/protection/api.test.ts apps/admin-web/src/admin-app.test.ts` with 86 tests, `npm run typecheck`, and `npm run build:admin-web`.
- R.120 adds `scripts/acceptance/admin-protection-maintenance-browser-qa.ts`, which starts an isolated mock Admin API and temporary Admin Web Vite server, opens the real Protection Center page through Playwright, clicks `启动后台对账`, clicks `请求停止对账`, and fails unless the mock API observes only the intended read-model reconcile command POSTs.
- R.120 accepted isolated runtime evidence is `admin-protection-maintenance-browser-qa-20260626T191903Z.json/.md/-desktop.png`: start POST count `1`, cancel POST count `1`, forbidden command POST count `0`, status GET count `3`, operations overview GET count `3`, console errors `0`, and failed Admin API requests `0`.
- R.120 verification passed `node --test --import tsx scripts/acceptance/admin-protection-maintenance-browser-qa.test.ts` with 5 tests, combined R.118/R.119/R.120 tests with 95 tests, `npx tsx scripts/acceptance/admin-protection-maintenance-browser-qa.ts`, `npm run typecheck`, and `npm run build:admin-web`.
- R.121 changes NAS Docker admin-worker standalone worker defaults from enabled to disabled: `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER` and `MIXLAB_ENABLE_READY_PUBLISH_WORKER` now default to `0` in `deploy/nas/mixlab/docker-compose.yml` and `.env.example`.
- R.121 updates `scripts/acceptance/nas-docker-compose-static.ts` so the Docker static gate rejects drift back to default-enabled standalone workers, updates runtime-config tests so worker commands enable only with explicit `1`, and updates the worker write-path audit to state that standalone workers remain command-audit gaps when explicitly opted in.
- R.121 verification passed `node --test --import tsx scripts/acceptance/nas-docker-compose-static.test.ts packages/runtime-config/src/docker-worker.test.ts packages/admin-api/src/admin-worker-write-path-audit.test.ts` with 18 tests, `npx tsx scripts/acceptance/nas-docker-compose-static.ts`, and `npm run typecheck`.
- R.122 adds `scripts/acceptance/admin-docker-release-gate-dry-run.ts`, a dry-run Phase 6 release-gate bundle that reuses `validateNasDockerComposeStatic(...)`, writes JSON/Markdown artifacts, and marks static gates as passed while live/NAS/Docker/Cutter gates remain `needs-live-proof`.
- R.122 adds `validate:admin-docker-release-gate-dry-run` and focused tests proving static compose success is not enough for release readiness, compose-static failure blocks upload, and live-proof blockers remain explicit for usage-events, V001440 recovery, disk space, Docker health/version parity, admin-worker live flags, and Cutter compatibility.
- R.122 accepted evidence is `docs/acceptance/artifacts/admin-docker-release-gate-dry-run-20260626T193919Z.json` and `.md`: result `blocked`, `release_ready:false`, `docker_upload_allowed:false`, static gates passed `8`, live-proof blockers `6`.
- R.122 verification passed `node --test --import tsx scripts/acceptance/admin-docker-release-gate-dry-run.test.ts scripts/acceptance/nas-docker-compose-static.test.ts` with 7 tests, `npm run validate:admin-docker-release-gate-dry-run`, and `npm run typecheck`.
- R.123 adds `scripts/acceptance/admin-docker-release-live-readonly.ts`, a GET-only live-readiness probe for an explicitly configured NAS Docker Admin Web/API target. It never guesses the NAS URL, supports optional `MIXLAB_ADMIN_DOCKER_LIVE_SESSION_TOKEN` without recording token values, and probes only admin-web root plus Admin API GET endpoints.
- R.123 classifies target reachability, API proxy reachability, auth context, Docker path profile, build/version/image tag, disk gate, usage-events gate, processing recovery gate, current index gate, dashboard metrics, data-loading contract, and supervisor status from live read-only responses when available. It leaves running admin-worker environment proof and Cutter compatibility as external blockers.
- R.123 accepted default evidence is `docs/acceptance/artifacts/admin-docker-release-live-readonly-20260626T194617Z.json` and `.md`: target configured `false`, requests `0`, result `blocked`, `docker_upload_allowed:false`, and no NAS address was guessed.
- R.123 verification passed `node --test --import tsx scripts/acceptance/admin-docker-release-live-readonly.test.ts scripts/acceptance/admin-docker-release-gate-dry-run.test.ts` with 9 tests, `npm run validate:admin-docker-release-live-readonly`, and `npm run typecheck`.
- R.124 refines `scripts/acceptance/admin-docker-release-live-readonly.ts` so it no longer conflates "Admin API proxy reachable" with "current Admin Architecture v1 API contract present." The probe now passes `admin-api-proxy-live` when older JSON endpoints respond, while a separate `current-admin-api-contract-live` gate blocks release if `auth/status`, `release-gates`, or `data-loading/plan` are absent.
- R.124 treats live `/api/admin/library/status` showing `/data/PublicLibrary` as Docker path-isolation proof even if the newer release-gates endpoint is missing.
- R.124 accepted configured NAS evidence is `docs/acceptance/artifacts/admin-docker-release-live-readonly-20260626T195525Z.json` and `.md`: `admin-web /` `HTTP 200`, `library/status` `HTTP 200`, `preprocess/supervisor/status` `HTTP 200`, `dashboard/metrics` `HTTP 200`, library root `/data/PublicLibrary`, total `11394`, ready `10471`, current index `v010471`, disk usage `98%`/blocked in dashboard metrics, but `auth/status`, `release-gates`, and `data-loading/plan` return `404 路由不存在`.
- R.124 verification passed `node --test --import tsx scripts/acceptance/admin-docker-release-live-readonly.test.ts scripts/acceptance/admin-docker-release-gate-dry-run.test.ts` with 10 tests, the configured GET-only live run against `http://192.168.1.27:18080`, and `npm run typecheck`.
- R.125 adds `scripts/acceptance/admin-docker-version-parity-plan.ts` and `validate:admin-docker-version-parity-plan`, reading the latest configured live-readonly artifact to produce a no-deploy parity plan.
- R.125 accepted evidence is `docs/acceptance/artifacts/admin-docker-version-parity-plan-20260626T195950Z.json` and `.md`: `docker_image_update_required:true`, `docker_deploy_allowed_now:false`, missing current endpoints `/api/admin/auth/status`, `/api/admin/release-gates`, and `/api/admin/data-loading/plan`, library root `/data/PublicLibrary`, total `11394`, ready `10471`, disk usage `98%`/blocked, and upload blockers `current-admin-api-contract-parity`, `nas-disk-risk`, `admin-worker-env-external-proof`, and `cutter-compatibility-external-proof`.
- R.125 verification passed `node --test --import tsx scripts/acceptance/admin-docker-version-parity-plan.test.ts` with 2 tests, `npm run validate:admin-docker-version-parity-plan`, and `npm run typecheck`.
- R.126 adds `scripts/acceptance/admin-worker-env-proof.ts` and `validate:admin-worker-env-proof`, validating exported `admin-worker.env` plus `admin-worker.inspect.json` without contacting Docker or NAS directly.
- R.126 accepted template evidence is `docs/acceptance/artifacts/admin-worker-env-proof-20260626T200512Z.json` and `.md`: no external evidence supplied, `proof_accepted:false`, `docker_upload_allowed:false`, and blockers `env-file-provided`, `inspect-json-provided`, `env-file-worker-flags-disabled`, `inspect-worker-flags-disabled`, `admin-worker-library-roots`, and `admin-worker-image-observed`.
- R.126 verification passed `node --test --import tsx scripts/acceptance/admin-worker-env-proof.test.ts` with 3 tests, `npm run validate:admin-worker-env-proof`, and `npm run typecheck`.
- R.127 adds `scripts/acceptance/admin-docker-staging-runbook.ts` and `validate:admin-docker-staging-runbook`, generating a non-deploy staging/update/rollback runbook from the accepted parity and worker-proof artifacts plus explicit image tag inputs.
- R.127 accepted evidence is `docs/acceptance/artifacts/admin-docker-staging-runbook-20260626T201028Z.json` and `.md`: `staging_review_ready:false`, `docker_deploy_allowed:false`, missing `MIXLAB_DOCKER_CURRENT_IMAGE_TAG`, `MIXLAB_DOCKER_TARGET_IMAGE_TAG`, and `MIXLAB_DOCKER_ROLLBACK_IMAGE_TAG`, plus blockers `parity-report-blockers-clear` and `worker-env-proof-accepted`.
- R.127 verification passed `node --test --import tsx scripts/acceptance/admin-docker-staging-runbook.test.ts` with 3 tests, `npm run validate:admin-docker-staging-runbook`, and `npm run typecheck`.
- R.128 adds `scripts/acceptance/admin-cutter-compatibility-proof.ts` and `validate:admin-cutter-compatibility-proof`, validating archived Windows Runner `windows_acceptance` / nested `install_latest_and_smoke.windows_acceptance` evidence plus `real_cut_smoke` evidence without contacting Docker, NAS, Windows Runner, Admin API, or Cutter API.
- R.128 accepted template evidence is `docs/acceptance/artifacts/admin-cutter-compatibility-proof-20260626T202518Z.json` and `.md`: no Windows reports supplied, `proof_accepted:false`, `docker_upload_allowed:false`, and blockers for missing/passing Windows acceptance, reviewed auth, public-library ready count, source-library first page, search, transcript detail, missing/passing real-cut report, output clip, and core cut phases.
- R.128 verification passed `node --test --import tsx scripts/acceptance/admin-cutter-compatibility-proof.test.ts` with 6 tests, a historical report-shape check against archived Windows reports with `MIXLAB_CUTTER_EXPECTED_RELEASE_VERSION=v010471`, `npm run validate:admin-cutter-compatibility-proof`, and `npm run typecheck`.
- R.129 updates `scripts/acceptance/admin-docker-staging-runbook.ts` so it reads `MIXLAB_CUTTER_COMPATIBILITY_PROOF_REPORT` or the latest `admin-cutter-compatibility-proof-*.json`, records Cutter proof status, and normalizes parity blockers only when matching external proofs are accepted.
- R.129 accepted blocked runbook evidence is `docs/acceptance/artifacts/admin-docker-staging-runbook-20260626T202921Z.json` and `.md`: current/target/rollback tags are missing, unresolved parity blockers remain `current-admin-api-contract-parity`, `nas-disk-risk`, `admin-worker-env-external-proof`, and `cutter-compatibility-external-proof`, and `docker_deploy_allowed:false`.
- R.129 verification passed `node --test --import tsx scripts/acceptance/admin-docker-staging-runbook.test.ts` with 5 tests, `npm run validate:admin-docker-staging-runbook`, and `npm run typecheck`.
- R.130 adds `scripts/acceptance/admin-docker-release-readiness-summary.ts` and `validate:admin-docker-release-readiness-summary`, aggregating the latest live-readonly, parity plan, worker proof, Cutter proof, and staging runbook artifacts into one release-review report.
- R.130 accepted blocked evidence is `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260626T203427Z.json` and `.md`: `release_review_ready:false`, `docker_upload_allowed:false`, live-readonly blockers still present, parity blockers still present, worker proof not accepted, Cutter proof not accepted, and staging runbook not ready.
- R.130 verification passed `node --test --import tsx scripts/acceptance/admin-docker-release-readiness-summary.test.ts` with 4 tests, `npm run validate:admin-docker-release-readiness-summary`, and `npm run typecheck`.
- R.131 adds `scripts/acceptance/admin-redundancy-governance-audit.ts` and `audit:admin-redundancy-governance`, scanning Admin Web/Admin API/library-fs source files for duplicate CSS selectors, large files, and fixture/fallback/legacy hotspot terms without deleting, moving, rewriting, or refactoring production code.
- R.131 accepted blocked evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T204053Z.json` and `.md`: scanned files `189`, duplicate selector candidates `40`, large file candidates `19`, term hotspot candidates `18`, `cleanup_ready:false`, and `cleanup_allowed:false`.
- R.131 verification passed `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, `npm run audit:admin-redundancy-governance`, and `npm run typecheck`.
- R.132 adds `scripts/acceptance/admin-css-governance-classification.ts` and `audit:admin-css-governance`, classifying `styles.css` and `admin-reference.css` duplicate selectors without deleting, moving, rewriting, or refactoring CSS.
- R.132 accepted blocked evidence is `docs/acceptance/artifacts/admin-css-governance-classification-20260626T204735Z.json` and `.md`: duplicate selector groups `335`, reference-layer overlaps `201`, same-file `styles.css` legacy duplicates `133`, reference-internal duplicates `1`, `cleanup_allowed:false`, and result `blocked`.
- R.132 verification passed `node --test --import tsx scripts/acceptance/admin-css-governance-classification.test.ts` with 3 tests, `npm run audit:admin-css-governance`, and `npm run typecheck`.
- R.133 removes `.admin-app .admin-link-button` from early `styles.css` legacy button groups while preserving the later canonical base/state/hover rules and untouched `admin-reference.css` runtime layer.
- R.133 regenerated CSS governance evidence is `docs/acceptance/artifacts/admin-css-governance-classification-20260626T205258Z.json` and `.md`: duplicate selector groups dropped from `335` to `334`, and same-file `styles.css` legacy duplicates dropped from `133` to `132`; broad cleanup remains blocked.
- R.133 regenerated redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T205504Z.json` and `.md`: `apps/admin-web/src/styles.css` is now `6166` lines, down from `6175` in R.131, while cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.133 browser QA evidence is `docs/acceptance/artifacts/admin-source-videos-browser-qa-20260626T205445Z.json` and `.md` plus desktop/mobile screenshots; source-videos fixture route rendered required content, `查看详情` link buttons remained visible, console errors `0`, failed Admin API requests `0`, and horizontal overflow `0px`.
- R.133 verification passed `node --test --import tsx apps/admin-web/src/admin-app.test.ts apps/admin-web/src/api.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts scripts/acceptance/admin-css-governance-classification.test.ts scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 94 tests, `npm run build:admin-web`, `npm run typecheck`, `npm run audit:admin-css-governance`, `npm run audit:admin-redundancy-governance`, and isolated fixture `admin-source-videos-browser-qa`.
- R.134 adds `scripts/acceptance/admin-api-fixture-fallback-classification.ts` and `audit:admin-api-fixture-fallback`, classifying the `apps/admin-web/src/api.ts` fixture/fallback hotspot before any extraction or deletion.
- R.134 accepted blocked evidence is `docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T210556Z.json` and `.md`: scanned `4937` lines, found `293` hotspot occurrences, including `273` fixture-client boundary occurrences, `11` route-loading fallback contracts, `3` runtime fallback contracts, and `6` usage-metrics compatibility fields; `cleanup_allowed:false` and result `blocked`.
- R.134 verification passed `node --test --import tsx scripts/acceptance/admin-api-fixture-fallback-classification.test.ts` with 3 tests and `npm run audit:admin-api-fixture-fallback`.
- R.135 extracts the fixture data-loading plan from `apps/admin-web/src/api.ts` into `apps/admin-web/src/fixtures/admin-data-loading-plan.ts`, keeping runtime client behavior, route-loader behavior, and `settleWithin(...)` fallback behavior unchanged.
- R.135 accepted blocked API-governance evidence is `docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T211026Z.json` and `.md`: target `api.ts` scanned `4532` lines, found `262` hotspot occurrences, including `252` fixture-client boundary occurrences, `1` route-loading fallback contract, `3` runtime fallback contracts, and `6` usage-metrics compatibility fields; `cleanup_allowed:false` and result `blocked`.
- R.135 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T211057Z.json` and `.md`: scanned `190` files, large-file candidates `19`, term hotspot candidates `19`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.135 verification passed `node --test --import tsx apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts scripts/acceptance/admin-api-fixture-fallback-classification.test.ts` with 86 tests, `npm run audit:admin-api-fixture-fallback`, `npm run audit:admin-redundancy-governance`, `npm run typecheck`, and `npm run build:admin-web`.
- R.136 extracts static fixture seed data from `apps/admin-web/src/api.ts` into `apps/admin-web/src/fixtures/admin-fixture-data.ts`, keeping fixture client mutation behavior, runtime client behavior, route-loader behavior, and fallback behavior unchanged.
- R.136 accepted blocked API-governance evidence is `docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T211614Z.json` and `.md`: target `api.ts` scanned `3746` lines, found `261` hotspot occurrences, including `253` fixture-client boundary occurrences, `1` route-loading fallback contract, `3` runtime fallback contracts, and `4` usage-metrics compatibility fields; `cleanup_allowed:false` and result `blocked`.
- R.136 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T211614Z.json` and `.md`: scanned `191` files, large-file candidates `20`, term hotspot candidates `19`, and cleanup remains blocked. The new `apps/admin-web/src/fixtures/admin-fixture-data.ts` is intentionally visible as a large-file candidate, not hidden debt.
- R.136 verification passed `node --test --import tsx apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts scripts/acceptance/admin-api-fixture-fallback-classification.test.ts` with 86 tests, `npm run audit:admin-api-fixture-fallback`, `npm run audit:admin-redundancy-governance`, `npm run typecheck`, and `npm run build:admin-web`.
- R.137 splits `apps/admin-web/src/fixtures/admin-fixture-data.ts` into smaller domain fixture modules while keeping the `api.ts` fixture import boundary stable through a barrel export.
- R.137 adds `apps/admin-web/src/fixtures/admin-fixture-source-data.ts`, `apps/admin-web/src/fixtures/admin-fixture-system-data.ts`, and `apps/admin-web/src/fixtures/admin-fixture-usage-data.ts`, covering source/job/process-history data, system/settings/index/Doctor data, and usage/dashboard/cutter-user data respectively.
- R.137 accepted blocked API-governance evidence is `docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T212209Z.json` and `.md`: target `api.ts` remains `3746` scanned lines with `261` hotspot occurrences, proving this slice did not move runtime fallback contracts or fixture-client behavior unexpectedly.
- R.137 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T212209Z.json` and `.md`: scanned `194` files, large-file candidates dropped from R.136 `20` back to `19`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.137 verification passed `node --test --import tsx apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts scripts/acceptance/admin-api-fixture-fallback-classification.test.ts` with 86 tests, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, `npm run typecheck`, `npm run build:admin-web`, `npm run audit:admin-api-fixture-fallback`, `npm run audit:admin-redundancy-governance`, target-file `git diff --check`, and touched fixture/artifact trailing-whitespace scan.
- R.138 extracts fixture-only process-history clone/filter/summary helper logic from `apps/admin-web/src/api.ts` into `apps/admin-web/src/fixtures/admin-fixture-process-history.ts`, keeping the `api.ts` fixture import boundary stable through `apps/admin-web/src/fixtures/admin-fixture-data.ts`.
- R.138 keeps route-owned fixture process-history behavior unchanged while reducing `api.ts` physical lines from R.137 `3745` to `3519`; the new helper module is `239` lines and remains below the large-file threshold.
- R.138 accepted blocked API-governance evidence is `docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T212738Z.json` and `.md`: target `api.ts` scanned `3520` lines, found `261` hotspot occurrences, including `253` fixture-client boundary occurrences, `1` route-loading fallback contract, `3` runtime fallback contracts, and `4` usage-metrics compatibility fields; cleanup remains blocked.
- R.138 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T212738Z.json` and `.md`: scanned `195` files, large-file candidates remain `19`, term hotspot candidates remain `21`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.138 verification passed `node --test --import tsx apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts scripts/acceptance/admin-api-fixture-fallback-classification.test.ts` with 86 tests, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, `npm run typecheck`, `npm run build:admin-web`, `npm run audit:admin-api-fixture-fallback`, and `npm run audit:admin-redundancy-governance`.
- R.139 extracts fixture-only source-video detail generation and list-filter helper logic from `apps/admin-web/src/api.ts` into `apps/admin-web/src/fixtures/admin-fixture-source-video-detail.ts`, keeping the `api.ts` fixture import boundary stable through `apps/admin-web/src/fixtures/admin-fixture-data.ts`.
- R.139 keeps source-video fixture list/detail behavior unchanged while reducing `api.ts` physical lines from R.138 `3519` to `3422`; the new helper module is `107` lines and remains below the large-file threshold.
- R.139 accepted blocked API-governance evidence is `docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T213300Z.json` and `.md`: target `api.ts` scanned `3423` lines, found `261` hotspot occurrences, including `253` fixture-client boundary occurrences, `1` route-loading fallback contract, `3` runtime fallback contracts, and `4` usage-metrics compatibility fields; cleanup remains blocked.
- R.139 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T213300Z.json` and `.md`: scanned `196` files, large-file candidates remain `19`, term hotspot candidates remain `21`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.139 verification passed `node --test --import tsx apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts scripts/acceptance/admin-api-fixture-fallback-classification.test.ts` with 86 tests, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, `npm run typecheck`, `npm run build:admin-web`, `npm run audit:admin-api-fixture-fallback`, and `npm run audit:admin-redundancy-governance`.
- R.140 extracts fixture-only clone/settings/source-folder helper logic from `apps/admin-web/src/api.ts` into `apps/admin-web/src/fixtures/admin-fixture-clone.ts`, keeping the `api.ts` fixture import boundary stable through `apps/admin-web/src/fixtures/admin-fixture-data.ts`.
- R.140 keeps settings, runtime, dashboard metrics, data-loading, and cutter-user fixture clone behavior unchanged while reducing `api.ts` physical lines from R.139 `3422` to `3324`; the new helper module is `115` lines and remains below the large-file threshold.
- R.140 accepted blocked API-governance evidence is `docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T213657Z.json` and `.md`: target `api.ts` scanned `3325` lines, found `261` hotspot occurrences, including `253` fixture-client boundary occurrences, `1` route-loading fallback contract, `3` runtime fallback contracts, and `4` usage-metrics compatibility fields; cleanup remains blocked.
- R.140 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T213657Z.json` and `.md`: scanned `197` files, large-file candidates remain `19`, term hotspot candidates remain `21`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.140 verification passed `node --test --import tsx apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts scripts/acceptance/admin-api-fixture-fallback-classification.test.ts` with 86 tests, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, `npm run typecheck`, `npm run build:admin-web`, `npm run audit:admin-api-fixture-fallback`, and `npm run audit:admin-redundancy-governance`.
- R.141 extracts fixture-only operation-log and command-snapshot restore-plan builders from `apps/admin-web/src/api.ts` into `apps/admin-web/src/fixtures/admin-fixture-operation-log.ts`, keeping the `api.ts` fixture import boundary stable through `apps/admin-web/src/fixtures/admin-fixture-data.ts`.
- R.141 keeps operation-log and command-snapshot fixture response shapes unchanged while reducing `api.ts` physical lines from R.140 `3324` to `3138`; the new helper module is `195` lines and remains below the large-file threshold.
- R.141 accepted blocked API-governance evidence is `docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T214120Z.json` and `.md`: target `api.ts` scanned `3139` lines, found `243` hotspot occurrences, including `235` fixture-client boundary occurrences, `1` route-loading fallback contract, `3` runtime fallback contracts, and `4` usage-metrics compatibility fields; cleanup remains blocked.
- R.141 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T214120Z.json` and `.md`: scanned `198` files, large-file candidates remain `19`, term hotspot candidates are `22`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates. `api.ts` term hotspot count dropped from R.140 `39` to `22`, while the new fixture operation-log module is explicitly visible as fixture-layer ownership.
- R.141 verification passed `node --test --import tsx apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts scripts/acceptance/admin-api-fixture-fallback-classification.test.ts` with 86 tests, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, `npm run typecheck`, `npm run build:admin-web`, `npm run audit:admin-api-fixture-fallback`, and `npm run audit:admin-redundancy-governance`.
- R.142 extracts the fixture-only read-model reconcile status builder from `apps/admin-web/src/api.ts` into `apps/admin-web/src/fixtures/admin-fixture-read-model-status.ts`, keeping the `api.ts` fixture import boundary stable through `apps/admin-web/src/fixtures/admin-fixture-data.ts`.
- R.142 keeps fixture read-model reconcile status/start/cancel response shapes unchanged while reducing `api.ts` physical lines from R.141 `3138` to `3079`; the new helper module is `65` lines and remains below the large-file threshold.
- R.142 accepted blocked API-governance evidence is `docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T214807Z.json` and `.md`: target `api.ts` scanned `3080` lines, found `231` hotspot occurrences, including `223` fixture-client boundary occurrences, `1` route-loading fallback contract, `3` runtime fallback contracts, and `4` usage-metrics compatibility fields; cleanup remains blocked.
- R.142 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T214812Z.json` and `.md`: scanned `199` files, large-file candidates remain `19`, term hotspot candidates remain `22`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.142 verification passed `node --test --import tsx apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts scripts/acceptance/admin-api-fixture-fallback-classification.test.ts` with 86 tests, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, `npm run typecheck`, `npm run build:admin-web`, `npm run audit:admin-api-fixture-fallback`, and `npm run audit:admin-redundancy-governance`.
- R.143 extracts the fixture-only Operations Overview builder from `apps/admin-web/src/api.ts` into `apps/admin-web/src/fixtures/admin-fixture-operations-overview.ts`, keeping the `api.ts` fixture import boundary stable through `apps/admin-web/src/fixtures/admin-fixture-data.ts`.
- R.143 keeps fixture Operations Overview response shapes unchanged while reducing `api.ts` physical lines from R.142 `3079` to `2873`; the new helper module is `233` lines and remains below the large-file threshold.
- R.143 accepted blocked API-governance evidence is `docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T215351Z.json` and `.md`: target `api.ts` scanned `2874` lines, found `178` hotspot occurrences, including `170` fixture-client boundary occurrences, `1` route-loading fallback contract, `3` runtime fallback contracts, and `4` usage-metrics compatibility fields; cleanup remains blocked.
- R.143 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T215357Z.json` and `.md`: scanned `200` files, large-file candidates remain `19`, term hotspot candidates are `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates. The new Operations Overview helper is explicitly visible as fixture-layer ownership.
- R.143 verification passed `node --test --import tsx apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts scripts/acceptance/admin-api-fixture-fallback-classification.test.ts` with 86 tests, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, `npm run typecheck`, `npm run build:admin-web`, `npm run audit:admin-api-fixture-fallback`, and `npm run audit:admin-redundancy-governance`.
- R.144 extracts fixture-only source-video mutation helpers from `apps/admin-web/src/api.ts` into `apps/admin-web/src/fixtures/admin-fixture-source-video-mutations.ts`, keeping the `api.ts` fixture import boundary stable through `apps/admin-web/src/fixtures/admin-fixture-data.ts`.
- R.144 keeps fixture queue, publish, repair-index publishing, metadata update, and cover update response shapes unchanged while reducing `api.ts` physical lines from R.143 `2873` to `2713`; the new helper module is `283` lines and remains below the large-file threshold.
- R.144 accepted blocked API-governance evidence is `docs/acceptance/artifacts/admin-api-fixture-fallback-classification-20260626T220123Z.json` and `.md`: target `api.ts` scanned `2714` lines, found `173` hotspot occurrences, including `165` fixture-client boundary occurrences, `1` route-loading fallback contract, `3` runtime fallback contracts, and `4` usage-metrics compatibility fields; cleanup remains blocked.
- R.144 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T220123Z.json` and `.md`: scanned `201` files, large-file candidates remain `19`, term hotspot candidates are `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates. The new source-video mutation helper is explicitly visible as fixture-layer ownership.
- R.144 verification passed `node --test --import tsx apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts scripts/acceptance/admin-api-fixture-fallback-classification.test.ts` with 86 tests, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, `npm run typecheck`, `npm run build:admin-web`, `npm run audit:admin-api-fixture-fallback`, and `npm run audit:admin-redundancy-governance`.
- R.145 extracts the backend process-history response projection from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-preprocess-process-history-query.ts`, keeping route adapters and store readers dependency-injected.
- R.145 preserves the route-owned process-history Query contract: read-model hits, empty/incomplete store responses, and readiness responses remain `actual_data_source: "admin-read-model"` with `scan_mode: "no-scan"` and explicit route/readiness scan reasons.
- R.145 reduces `packages/admin-api/src/index.ts` from `3006` to `2894` physical lines; the new Query module is `202` lines and has a dedicated `226` line test file.
- R.145 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T220834Z.json` and `.md`: scanned `203` files, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.145 verification passed `node --test --import tsx packages/admin-api/src/admin-preprocess-process-history-query.test.ts packages/admin-api/src/admin-preprocess-read-routes.test.ts packages/admin-api/src/index.test.ts` with 81 tests, `npm run typecheck`, and `npm run audit:admin-redundancy-governance`.
- R.146 extracts the duplicated runtime diagnostics append wiring from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-runtime-diagnostics-recorder.ts`, keeping slow-read and source-video route adapters dependency-injected through a `Promise<void>` recorder contract.
- R.146 preserves route paths, response envelopes, runtime metadata shapes, runtime diagnostics history schema, read-model behavior, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.146 reduces `packages/admin-api/src/index.ts` to `2891` physical lines by `wc -l`; the new recorder module is `30` lines and has a dedicated `57` line test file.
- R.146 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T221517Z.json` and `.md`: scanned `205` files, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.146 verification passed `node --test --import tsx packages/admin-api/src/admin-runtime-diagnostics-recorder.test.ts packages/admin-api/src/admin-slow-read-routes.test.ts packages/admin-api/src/admin-source-video-routes.test.ts packages/admin-api/src/index.test.ts` with 83 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.147 extracts the background read-model reconcile preprocess-job snapshot reader from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-read-model-reconcile-snapshot-reader.ts`, keeping batch progress, cancellation checks, snapshot fields, and percent calculation dependency-injected.
- R.147 preserves route paths, read-model store schema, manifest scan behavior, full-reconcile scheduling, operation-log event shape, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.147 reduces `packages/admin-api/src/index.ts` to `2813` physical lines and `packages/admin-api/src/index.test.ts` to `4377` physical lines by `wc -l`; the new reader module is `97` lines and has a dedicated `123` line test file.
- R.147 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T222206Z.json` and `.md`: scanned `207` files, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.147 verification passed `node --test --import tsx packages/admin-api/src/admin-read-model-reconcile-snapshot-reader.test.ts packages/admin-api/src/index.test.ts` with 72 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.148 extracts the read-model reconciler runtime assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-read-model-reconciler-runtime.ts`, keeping cache invalidation, library/source-video snapshot reads, preprocess-job snapshot reads, `read-model-reconcile` command guard, system actor, and operation-log event shape dependency-injected.
- R.148 preserves route paths, read-model store schema, full-reconcile scheduling policy, command writes, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.148 reduces `packages/admin-api/src/index.ts` to `2742` physical lines by `wc -l`; the new runtime assembly module is `144` lines and has a dedicated `175` line test file.
- R.148 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T222827Z.json` and `.md`: scanned `209` files, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.148 verification passed `node --test --import tsx packages/admin-api/src/admin-read-model-reconciler-runtime.test.ts packages/admin-api/src/admin-read-model-reconciler.test.ts packages/admin-api/src/index.test.ts` with 74 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.149 extracts read-only source-video route dependency assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-source-video-route-deps.ts`, keeping status validation, source-video list/detail readers, public projection, and runtime diagnostics recorder dependency-injected.
- R.149 preserves route paths, response envelopes, runtime metadata, query semantics, read-model behavior, NAS data, source-video command/media routes, Docker state, Worker behavior, and Cutter protocols.
- R.149 reduces `packages/admin-api/src/index.ts` to `2741` physical lines by `wc -l`; the new factory module is `31` lines and has a dedicated `110` line test file.
- R.149 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T223924Z.json` and `.md`: scanned `211` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.149 verification passed `node --test --import tsx packages/admin-api/src/admin-source-video-route-deps.test.ts packages/admin-api/src/admin-source-video-routes.test.ts packages/admin-api/src/index.test.ts` with 76 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.150 extracts source-video cover media route dependency assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-source-video-media-route-deps.ts`, keeping the existing `writeCover(...)` streaming writer dependency-injected.
- R.150 preserves route paths, cover route matching, response streaming behavior, generated media behavior, source-video command routes, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.150 reduces `packages/admin-api/src/index.ts` to `2740` physical lines by `wc -l`; the new factory module is `24` lines and has a dedicated `52` line test file.
- R.150 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T224352Z.json` and `.md`: scanned `213` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.150 verification passed `node --test --import tsx packages/admin-api/src/admin-source-video-media-route-deps.test.ts packages/admin-api/src/admin-source-video-media-routes.test.ts packages/admin-api/src/index.test.ts` with 74 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.151 extracts source-video command route dependency assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-source-video-command-route-deps.ts`, keeping cover, metadata, queue, retry, recover-processing, publish, supervisor-block, projection, source-video page cache invalidation, and index-version cache invalidation dependency-injected.
- R.151 preserves route paths, response envelopes, command service implementations, writer-lease/snapshot/audit behavior, ready protection semantics, manifest writes, generated media writes, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.151 reduces `packages/admin-api/src/index.ts` to `2701` physical lines by `wc -l`; the new factory module is `107` lines and has a dedicated `215` line test file.
- R.151 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T225024Z.json` and `.md`: scanned `215` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.151 verification passed `node --test --import tsx packages/admin-api/src/admin-source-video-command-route-deps.test.ts packages/admin-api/src/admin-source-video-command-routes.test.ts packages/admin-api/src/index.test.ts` with 79 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.152 extracts slow-read route dependency assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-slow-read-route-deps.ts`, keeping dashboard metrics, preprocess jobs, supervisor projection, index-version query, and runtime diagnostics recorder dependency-injected.
- R.152 preserves route paths, response envelopes, pagination, runtime metadata, slow-route query implementations, read-model/cache strategy, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.152 reduces `packages/admin-api/src/index.ts` to `2699` physical lines by `wc -l`; the new factory module is `65` lines and has a dedicated `168` line test file.
- R.152 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T225720Z.json` and `.md`: scanned `217` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.152 verification passed `node --test --import tsx packages/admin-api/src/admin-slow-read-route-deps.test.ts packages/admin-api/src/admin-slow-read-routes.test.ts packages/admin-api/src/index.test.ts` with 77 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.153 extracts preprocess read route dependency assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-preprocess-read-route-deps.ts`, keeping source-video detail checks, preprocess job-log reads, supervisor projection, safety reads, process-history Query API composition, and process-history readiness Query API composition dependency-injected.
- R.153 preserves route paths, response envelopes, URL filter parsing, process-history query semantics, read-model/cache strategy, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.153 reduces `packages/admin-api/src/index.ts` to `2677` physical lines by `wc -l`; the new factory module is `78` lines and has a dedicated `200` line test file.
- R.153 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T230419Z.json` and `.md`: scanned `219` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.153 verification passed `node --test --import tsx packages/admin-api/src/admin-preprocess-read-route-deps.test.ts packages/admin-api/src/admin-preprocess-read-routes.test.ts packages/admin-api/src/index.test.ts` with 78 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.154 extracts preprocess command route dependency assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-preprocess-command-route-deps.ts`, keeping request JSON, settings, runtime secrets, real-preprocess start gate, safety reads/assertions, supervisor projection, bulk transition command context, recover-processing supervisor block, and source-video page cache invalidation dependency-injected.
- R.154 preserves route paths, response envelopes, command service implementations, writer-lease/snapshot/audit behavior, supervisor behavior, read-model write-through behavior, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.154 keeps `packages/admin-api/src/index.ts` at `2678` physical lines by `wc -l`; the new factory module is `127` lines and has a dedicated `244` line test file.
- R.154 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T231127Z.json` and `.md`: scanned `221` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.154 verification passed `node --test --import tsx packages/admin-api/src/admin-preprocess-command-route-deps.test.ts packages/admin-api/src/admin-preprocess-command-routes.test.ts packages/admin-api/src/index.test.ts` with 79 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.155 extracts library command route dependency assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-library-command-route-deps.ts`, keeping library init, scan-preview, scan-apply, command context, read-model reconcile handoff scheduling, and source-video page cache invalidation dependency-injected.
- R.155 preserves route paths, response envelopes, library command services, scan planner behavior, scan-apply protection behavior, read-model reconcile scheduling policy, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.155 leaves `packages/admin-api/src/index.ts` at `2686` physical lines by `wc -l`; the new factory module is `89` lines and has a dedicated `240` line test file.
- R.155 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T231745Z.json` and `.md`: scanned `223` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.155 verification passed `node --test --import tsx packages/admin-api/src/admin-library-command-route-deps.test.ts packages/admin-api/src/admin-library-command-routes.test.ts packages/admin-api/src/index.test.ts` with 80 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.156 extracts index command route dependency assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-index-command-route-deps.ts`, keeping index repair command context, ready-publish media, index-version cache invalidation, and source-video page cache invalidation dependency-injected.
- R.156 preserves route paths, response envelopes, index repair command service behavior, publish/index write semantics, release/index artifacts, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.156 leaves `packages/admin-api/src/index.ts` at `2703` physical lines by `wc -l`; the new factory module is `56` lines and has a dedicated `130` line test file.
- R.156 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T232343Z.json` and `.md`: scanned `225` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.156 verification passed `node --test --import tsx packages/admin-api/src/admin-index-command-route-deps.test.ts packages/admin-api/src/admin-index-command-routes.test.ts packages/admin-api/src/index.test.ts` with 75 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.157 extracts settings command route dependency assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-settings-command-route-deps.ts`, keeping settings config/source-folder command context, runtime-secret refresh, library manifest reads, and read-model invalidation handoff dependency-injected.
- R.157 preserves route paths, response envelopes, settings/source-folder command service behavior, runtime-secret refresh semantics, source-folder mutation semantics, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.157 leaves `packages/admin-api/src/index.ts` at `2743` physical lines by `wc -l`; the new factory module is `92` lines and has a dedicated `260` line test file.
- R.157 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T233416Z.json` and `.md`: scanned `227` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.157 verification passed `node --test --import tsx packages/admin-api/src/admin-settings-command-route-deps.test.ts packages/admin-api/src/admin-settings-command-routes.test.ts packages/admin-api/src/index.test.ts` with 76 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.158 extracts cutter-user command route dependency assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-cutter-user-command-route-deps.ts`, keeping approve/disable/password command context, request-body delegation, actor/time context, and public response projection dependency-injected.
- R.158 preserves route paths, response envelopes, cutter-user command service behavior, password validation/error mapping, account-store mutation semantics, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.158 leaves `packages/admin-api/src/index.ts` at `2753` physical lines by `wc -l`; the new factory module is `86` lines and has a dedicated `212` line test file.
- R.158 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T233827Z.json` and `.md`: scanned `229` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.158 verification passed `node --test --import tsx packages/admin-api/src/admin-cutter-user-command-route-deps.test.ts packages/admin-api/src/admin-cutter-user-command-routes.test.ts packages/admin-api/src/index.test.ts` with 77 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.159 extracts command restore route dependency assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-command-restore-route-deps.ts`, keeping snapshot manifest resolution, restore planning, supervisor blocking, restore command primitive, actor/time/holder context, read-model invalidation, and operation-log appender wiring dependency-injected.
- R.159 preserves route paths, response envelopes, restore-plan semantics, restore command service behavior, supervisor blockers, command snapshot files, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.159 leaves `packages/admin-api/src/index.ts` at `2783` physical lines by `wc -l`; the new factory module is `108` lines and has a dedicated `245` line test file.
- R.159 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T234444Z.json` and `.md`: scanned `231` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.159 verification passed `node --test --import tsx packages/admin-api/src/admin-command-restore-route-deps.test.ts packages/admin-api/src/admin-command-restore-routes.test.ts packages/admin-api/src/index.test.ts` with 78 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.160 extracts runtime diagnostic route dependency assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-runtime-diagnostic-route-deps.ts`, keeping runtime-secret refresh, Doctor run/export, diagnostic timestamping, environment injection, and ASR configuration-check behavior dependency-injected.
- R.160 preserves route paths, response envelopes, runtime-secret refresh semantics, Doctor report/export behavior, ASR test-config behavior, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.160 leaves `packages/admin-api/src/index.ts` at `2788` physical lines by `wc -l`; the new factory module is `70` lines and has a dedicated `122` line test file.
- R.160 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T234858Z.json` and `.md`: scanned `233` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.160 verification passed `node --test --import tsx packages/admin-api/src/admin-runtime-diagnostic-route-deps.test.ts packages/admin-api/src/admin-runtime-diagnostic-routes.test.ts packages/admin-api/src/index.test.ts` with 77 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.161 extracts system read route dependency assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-system-read-route-deps.ts`, keeping library status, settings config/runtime, runtime-secret refresh, Doctor report timestamping, environment injection, cutter-user reads, and public user projection dependency-injected.
- R.161 preserves route paths, response envelopes, runtime-secret refresh semantics, Doctor report behavior, settings runtime behavior, cutter-user public response projection, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.161 leaves `packages/admin-api/src/index.ts` at `2793` physical lines by `wc -l`; the new factory module is `87` lines and has a dedicated `232` line test file.
- R.161 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T235452Z.json` and `.md`: scanned `235` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.161 verification passed `node --test --import tsx packages/admin-api/src/admin-system-read-route-deps.test.ts packages/admin-api/src/admin-system-read-routes.test.ts packages/admin-api/src/index.test.ts` with 77 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.162 extracts protection read route dependency assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-protection-read-route-deps.ts`, keeping protection status, release-gates, and library path-check root projection dependency-injected.
- R.162 preserves route paths, response envelopes, protection status behavior, release-gate behavior, path-check root projection, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.162 leaves `packages/admin-api/src/index.ts` at `2794` physical lines by `wc -l`; the new factory module is `37` lines and has a dedicated `78` line test file.
- R.162 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260626T235913Z.json` and `.md`: scanned `237` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.162 verification passed `node --test --import tsx packages/admin-api/src/admin-protection-read-route-deps.test.ts packages/admin-api/src/admin-protection-read-routes.test.ts packages/admin-api/src/index.test.ts` with 76 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.163 extracts runtime observability route dependency assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-runtime-observability-route-deps.ts`, keeping diagnostics history reads dependency-injected.
- R.163 preserves route paths, response envelopes, diagnostics history read behavior, generated-at propagation, route-level limit parsing, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.163 leaves `packages/admin-api/src/index.ts` at `2797` physical lines by `wc -l`; the new factory module is `23` lines and has a dedicated `39` line test file.
- R.163 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T000259Z.json` and `.md`: scanned `239` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates remain `23`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.163 verification passed `node --test --import tsx packages/admin-api/src/admin-runtime-observability-route-deps.test.ts packages/admin-api/src/admin-runtime-observability-routes.test.ts packages/admin-api/src/index.test.ts` with 73 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, and `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests.
- R.164 extracts Admin preprocess pipeline orchestration and default real runner assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-preprocess-pipeline.ts`, keeping scan/queue/publish decisions, lifecycle command injection, real-start blocking, ASR/ffmpeg assembly, and cache invalidation behavior unchanged.
- R.164 preserves route paths, response envelopes, command/audit/snapshot behavior, supervisor behavior, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.164 leaves `packages/admin-api/src/index.ts` at `2526` physical lines by `wc -l`; the new pipeline module is `317` lines and has a dedicated `101` line test file.
- R.164 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T001343Z.json` and `.md`: scanned `241` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `22`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.164 verification passed `node --test --import tsx packages/admin-api/src/admin-preprocess-pipeline.test.ts packages/admin-api/src/index.test.ts packages/admin-api/src/admin-worker-write-path-audit.test.ts` with 80 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.
- R.165 extracts Admin runtime settings Query implementation from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-runtime-settings-query.ts`, keeping `/api/admin/settings/runtime` response shape, runtime-secret refresh ordering, ffmpeg/ffprobe availability/version projection, ASR model/audio-mode/key-configured projection, latest ASR failure lookup, and the large-library ASR failure scan guard unchanged.
- R.165 preserves route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.165 leaves `packages/admin-api/src/index.ts` at `2427` physical lines by `wc -l`; the new runtime settings Query module is `239` lines and has a dedicated `147` line test file.
- R.165 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T002431Z.json` and `.md`: scanned `243` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `22`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.165 verification passed `node --test --import tsx packages/admin-api/src/admin-runtime-settings-query.test.ts packages/admin-api/src/admin-system-read-routes.test.ts packages/admin-api/src/index.test.ts` with 78 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.
- R.166 extracts the default ready publish media implementation from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-ready-publish-media.ts`, keeping `ReadyPublishMedia`, ffmpeg runtime resolution, cover plan source/output/time/width inputs, synchronous process execution, and publish/index command behavior unchanged.
- R.166 preserves route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.166 leaves `packages/admin-api/src/index.ts` at `2398` physical lines by `wc -l`; the new ready publish media module is `44` lines and has a dedicated `61` line test file.
- R.166 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T003120Z.json` and `.md`: scanned `245` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `22`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.166 verification passed `node --test --import tsx packages/admin-api/src/admin-ready-publish-media.test.ts packages/admin-api/src/index.test.ts` with 72 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.
- R.167 extracts runtime load/system health metric projection from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-runtime-load-query.ts`, keeping CPU busy-sample math, macOS memory pressure behavior, disk threshold logic, network/service status projection, and runtime-load consumers unchanged.
- R.167 preserves route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.167 leaves `packages/admin-api/src/index.ts` at `2217` physical lines by `wc -l`; the new runtime load Query module is `241` lines and has a dedicated `80` line test file.
- R.167 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T003726Z.json` and `.md`: scanned `247` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `22`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.167 verification passed `node --test --import tsx packages/admin-api/src/admin-runtime-load-query.test.ts packages/admin-api/src/index.test.ts` with 71 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.
- R.168 extracts library status projection from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-library-status-query.ts`, keeping manifest-count fallback behavior, library manifest count behavior, source folder path projection, disk byte projection, current index status projection, active processing label behavior, and read-model refresh handoff unchanged.
- R.168 preserves route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.168 leaves `packages/admin-api/src/index.ts` at `2140` physical lines by `wc -l`; the new library status Query module is `136` lines and has a dedicated `144` line test file.
- R.168 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T004228Z.json` and `.md`: scanned `249` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `22`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.168 verification passed `node --test --import tsx packages/admin-api/src/admin-library-status-query.test.ts packages/admin-api/src/index.test.ts` with 71 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.
- R.169 extracts library path-check projection from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-path-checks-query.ts`, keeping configured source-folder checks, enabled/disabled source-folder messages, library root read/write checks, `.mixlab-library` readiness checks, `library.json` readiness checks, and path-check route behavior unchanged.
- R.169 preserves route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.169 leaves `packages/admin-api/src/index.ts` at `2067` physical lines by `wc -l`; the new path-checks Query module is `161` lines and has a dedicated `159` line test file.
- R.169 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T005109Z.json` and `.md`: scanned `251` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `22`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.169 verification passed `node --test --import tsx packages/admin-api/src/admin-path-checks-query.test.ts packages/admin-api/src/admin-protection-read-routes.test.ts` with 8 tests, targeted `node --test --import tsx --test-name-pattern "library status and path checks follow configured source folders" packages/admin-api/src/index.test.ts` with 1 test, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.
- R.170 rechecked the Admin API integration baseline after an initial R.169 broad-suite failure signal. `node --test --import tsx --test-concurrency=1 packages/admin-api/src/index.test.ts` passed with 68 tests, `node --test --import tsx packages/admin-api/src/index.test.ts` passed with 68 tests, and the combined R.169 command passed with 76 tests. No production-code change was required.
- R.171 extracts source-video artifact path resolution, safe relative artifact path validation, image content-type projection, and file-exists checks from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-source-video-artifact-path.ts`, keeping source-video detail behavior, cover endpoint behavior, relative artifact paths, `library://video/...` URI behavior, and fallback artifact filenames unchanged.
- R.171 preserves route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.171 leaves `packages/admin-api/src/index.ts` at `1986` physical lines by `wc -l`; the new artifact path module is `86` lines and has a dedicated `98` line test file.
- R.171 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T010112Z.json` and `.md`: scanned `253` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `22`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.171 verification passed `node --test --import tsx packages/admin-api/src/admin-source-video-artifact-path.test.ts packages/admin-api/src/admin-source-video-detail-query.test.ts` with 9 tests, targeted `node --test --import tsx --test-name-pattern "admin cover endpoint resolves relative and library cover paths|admin can replace a source video cover and serve its real image type|returns source video detail for an unprocessed scan result" packages/admin-api/src/index.test.ts` with 3 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.
- R.172 extracts the shared Admin public-library path contract into `packages/admin-api/src/admin-library-paths.ts`, keeping `.mixlab-library`, `source-videos`, `videos`, `library.json`, `admin-settings.json`, `preprocess-job.json`, source transcript index, snapshot, operation-log, runtime diagnostics, and read-model store path semantics unchanged across read/query, command, worker-lifecycle, audit, snapshot, runtime, and `index.ts` wiring modules.
- R.172 preserves route paths, response envelopes, command snapshots, operation-log paths, runtime diagnostics paths, read-model store paths, source-video manifest/job paths, source transcript index paths, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.172 leaves `packages/admin-api/src/index.ts` at `1965` physical lines by `wc -l`; the new path-contract module is `50` lines and has a dedicated `44` line test file.
- R.172 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T011137Z.json` and `.md`: scanned `255` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `22`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.172 verification passed `node --test --import tsx packages/admin-api/src/admin-library-paths.test.ts packages/admin-api/src/admin-library-commands.test.ts packages/admin-api/src/admin-transition-commands.test.ts packages/admin-api/src/admin-publish-commands.test.ts` with 13 tests, `node --test --import tsx packages/admin-api/src/admin-worker-lifecycle-commands.test.ts packages/admin-api/src/admin-source-video-commands.test.ts packages/admin-api/src/admin-index-versions-query.test.ts packages/admin-api/src/admin-read-model-store.test.ts packages/admin-api/src/admin-runtime-observability.test.ts packages/admin-api/src/admin-command-snapshot.test.ts packages/admin-api/src/admin-operation-log.test.ts packages/admin-api/src/admin-runtime-settings-query.test.ts` with 55 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.
- R.173 extracts current source-transcript index pointer and current index SQLite metadata reads from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-current-index-query.ts`, keeping current pointer path semantics, missing/malformed pointer tolerance, SQLite metadata fallback-to-null behavior, protection status current-index display, library status index state, Dashboard transcript metrics, and source-video index reader wiring unchanged.
- R.173 preserves route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.173 leaves `packages/admin-api/src/index.ts` at `1931` physical lines by `wc -l`; the new current-index Query module is `67` lines and has a dedicated `97` line test file.
- R.173 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T011716Z.json` and `.md`: scanned `257` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `22`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.173 verification passed `node --test --import tsx packages/admin-api/src/admin-current-index-query.test.ts packages/admin-api/src/admin-dashboard-metrics-query.test.ts packages/admin-api/src/admin-library-status-query.test.ts packages/admin-api/src/admin-protection-read-routes.test.ts` with 15 tests, targeted `node --test --import tsx --test-name-pattern "protection status and release gates expose Admin Architecture v1 blockers|dashboard metrics exposes read-model provenance for large libraries|dashboard metrics skips malformed usage history and reports event-store health|library status and path checks follow configured source folders|admin index versions expose current pointer and package validation details" packages/admin-api/src/index.test.ts` with 5 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.
- R.174 extracts Dashboard transcript metrics aggregation from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-transcript-metrics-query.ts`, keeping the large-library current-index metadata shortcut, missing-metadata artifact-read continuation, threshold behavior, transcript counting rule, Dashboard response shape, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.
- R.174 preserves route paths, response envelopes, current-index metadata semantics, transcript artifact summary reads, NAS data, Docker state, Worker behavior, and Cutter protocols.
- R.174 leaves `packages/admin-api/src/index.ts` at `1910` physical lines by `wc -l`; the new transcript metrics Query module is `64` lines and has a dedicated `133` line test file.
- R.174 accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T012539Z.json` and `.md`: scanned `259` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates remain `22`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.
- R.174 verification passed `node --test --import tsx packages/admin-api/src/admin-transcript-metrics-query.test.ts packages/admin-api/src/admin-dashboard-metrics-query.test.ts` with 7 tests, targeted `node --test --import tsx --test-name-pattern "dashboard metrics exposes read-model provenance for large libraries|returns expanded dashboard transcript production and usage metrics|dashboard metrics skips malformed usage history and reports event-store health" packages/admin-api/src/index.test.ts` with 3 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.176 verification passed `node --test --import tsx packages/admin-api/src/admin-dashboard-read-facade.test.ts packages/admin-api/src/admin-dashboard-metrics-query.test.ts packages/admin-api/src/admin-dashboard-metrics-cache.test.ts packages/admin-api/src/admin-transcript-metrics-query.test.ts packages/admin-api/src/admin-usage-metrics-query.test.ts packages/admin-api/src/admin-runtime-load-query.test.ts` with 23 tests, targeted `node --test --import tsx --test-name-pattern "dashboard metrics exposes read-model provenance for large libraries|returns expanded dashboard transcript production and usage metrics|dashboard metrics skips malformed usage history and reports event-store health" packages/admin-api/src/index.test.ts` with 3 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.177 verification passed `node --test --import tsx packages/admin-api/src/admin-read-model-server-facade.test.ts packages/admin-api/src/admin-read-model-reconciler-runtime.test.ts packages/admin-api/src/admin-read-model-routes.test.ts packages/admin-api/src/admin-read-model-reconcile-scheduler.test.ts` with 14 tests, targeted `node --test --import tsx --test-name-pattern "read-model reconcile command rebuilds admin sqlite in the background|library scan returns read-model reconcile handoff after marking admin sqlite stale|data loading plan keeps shell endpoints cheap and route-owned" packages/admin-api/src/index.test.ts` with 3 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.178 verification passed `node --test --import tsx packages/admin-api/src/admin-auth-route-deps.test.ts packages/admin-api/src/admin-auth-routes.test.ts packages/admin-api/src/admin-auth-commands.test.ts` with 11 tests, targeted `node --test --import tsx --test-name-pattern "admin password auth protects business routes and redacts password hashes|authenticated admin command audit records actor identity without session token" packages/admin-api/src/index.test.ts` with 2 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check` before doc updates.

R.179 verification passed `node --test --import tsx packages/admin-api/src/admin-health-query.test.ts` with 2 tests, targeted `node --test --import tsx --test-name-pattern "health reports build, runtime path profile, and shallow preprocess safety|protection status and release gates expose Admin Architecture v1 blockers" packages/admin-api/src/index.test.ts` with 2 tests, targeted `node --test --import tsx --test-name-pattern "blocks preprocessing supervisor start while processing tasks need recovery" packages/admin-api/src/index.test.ts` with 1 test, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.180 verification passed `node --test --import tsx packages/admin-api/src/admin-protection-query.test.ts packages/admin-api/src/admin-protection-read-routes.test.ts packages/admin-api/src/admin-protection-read-route-deps.test.ts` with 9 tests, targeted `node --test --import tsx --test-name-pattern "protection status and release gates expose Admin Architecture v1 blockers|library status and path checks follow configured source folders" packages/admin-api/src/index.test.ts` with 2 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.181 verification passed `node --test --import tsx packages/admin-api/src/admin-preprocess-jobs-read-facade.test.ts packages/admin-api/src/admin-preprocess-jobs-query.test.ts` with 5 tests, targeted `node --test --import tsx --test-name-pattern "preprocess jobs expose observable production estimates in Chinese|preprocess jobs can read the active first page from fresh admin sqlite without JSON read model|preprocess jobs can read ready history from fresh admin sqlite without job files|preprocess jobs include processing videos outside the generic manifest page immediately|preprocess jobs include far processing rows from the status read model on the first page" packages/admin-api/src/index.test.ts` with 5 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.182 verification passed `node --test --import tsx packages/admin-api/src/admin-http-session.test.ts packages/admin-api/src/admin-auth-routes.test.ts` with 14 tests, targeted `node --test --import tsx --test-name-pattern "admin password auth protects business routes and redacts password hashes|authenticated admin command audit records actor identity without session token" packages/admin-api/src/index.test.ts` with 2 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.183 verification passed `node --test --import tsx packages/admin-api/src/admin-file-fact-readers.test.ts packages/admin-api/src/admin-source-video-detail-query.test.ts packages/admin-api/src/admin-preprocess-jobs-read-facade.test.ts` with 11 tests, targeted `node --test --import tsx --test-name-pattern "health reports build, runtime path profile, and shallow preprocess safety|protection status and release gates expose Admin Architecture v1 blockers|preprocess jobs can read the active first page from fresh admin sqlite without JSON read model|preprocess job log endpoint falls back to a real task record snapshot|returns source video detail for an unprocessed scan result" packages/admin-api/src/index.test.ts` with 5 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.184 verification passed `node --test --import tsx packages/admin-api/src/admin-source-video-cover-response.test.ts packages/admin-api/src/admin-source-video-media-routes.test.ts packages/admin-api/src/admin-source-video-media-route-deps.test.ts` with 7 tests, targeted `node --test --import tsx --test-name-pattern "admin cover endpoint resolves relative and library cover paths|admin can replace a source video cover and serve its real image type|admin rejects cover uploads with mismatched image content" packages/admin-api/src/index.test.ts` with 3 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.185 verification passed `node --test --import tsx packages/admin-api/src/admin-preprocess-supervisor-status.test.ts packages/admin-api/src/admin-preprocess-read-routes.test.ts packages/admin-api/src/admin-preprocess-command-route-deps.test.ts` with 10 tests, targeted `node --test --import tsx --test-name-pattern "admin preprocess supervisor responses redact temporary ASR result details|starts, reports, and stops the preprocessing supervisor through Chinese admin API|blocks preprocessing supervisor start while processing tasks need recovery" packages/admin-api/src/index.test.ts` with 3 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.186 extracts Admin primary source-videos path selection from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-primary-source-videos-path.ts`, keeping enabled source-folder precedence, first-folder fallback, final library-layout `source-videos` fallback, health runtime path projection, release-gate path checks, library-status source-folder behavior, route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.186 preserves the path-isolation boundary by keeping file-system path selection as a read helper fed by Admin settings and the shared library layout contract. It does not change settings writes, source-folder commands, scan behavior, read-model rebuild policy, source-video/preprocess/release/index mutation, Docker publication, live NAS data, or UI layout.

R.186 leaves `packages/admin-api/src/index.ts` at `1337` physical lines by `wc -l`; the new primary source-videos path helper module is `49` lines and has a dedicated `78` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T030048Z.json` and `.md`: scanned `283` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.

R.186 verification passed `node --test --import tsx packages/admin-api/src/admin-primary-source-videos-path.test.ts packages/admin-api/src/admin-health-query.test.ts packages/admin-api/src/admin-library-status-query.test.ts` with 9 tests, targeted `node --test --import tsx --test-name-pattern "health reports build, runtime path profile, and shallow preprocess safety|protection status and release gates expose Admin Architecture v1 blockers|library status and path checks follow configured source folders" packages/admin-api/src/index.test.ts` with 3 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.187 extracts default Admin runtime diagnostics recorder wiring from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-runtime-diagnostics-recorder.ts`, keeping request timestamp projection, runtime metadata payloads, bounded diagnostics history append/read semantics, selected slow/source-video route observability, route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.187 preserves runtime observability boundaries by keeping `admin-runtime-observability.ts` as the diagnostics history file owner and `admin-runtime-diagnostics-recorder.ts` as the recorder wiring owner. It does not change runtime metadata schema, diagnostics history file layout, read-model behavior, source-video/preprocess/release/index mutation, scan behavior, Docker publication, live NAS data, or UI layout.

R.187 leaves `packages/admin-api/src/index.ts` at `1333` physical lines by `wc -l`; the runtime diagnostics recorder module is `44` lines and has a dedicated `83` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T030517Z.json` and `.md`: scanned `283` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.

R.187 verification passed `node --test --import tsx packages/admin-api/src/admin-runtime-diagnostics-recorder.test.ts packages/admin-api/src/admin-runtime-observability.test.ts` with 6 tests, targeted `node --test --import tsx --test-name-pattern "selected slow admin endpoints expose runtime metadata without changing data shapes|source video list filters query and status before paginating" packages/admin-api/src/index.test.ts` with 2 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.187 supersedes the prior "next backend Query/Command API boundary extraction after R.186" pointer. The next backend extraction should use the R.107-R.187 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

Next safe movement remains:

Post-R.187 note: the next implementation slice should treat R.187 Admin runtime diagnostics recorder wiring extraction as complete local evidence, then continue from remaining process-history/helper wiring, Docker evidence ingestion, or separately gated restore/rollback work.

Continue `Admin Architecture v1` by choosing between a separately gated actual NAS restore execution drill / automatic rollback design, broader maintenance scheduling beyond scan apply, extending runtime metadata beyond the current covered endpoints, deeper Dashboard trend/drill-down store coverage beyond provenance, process-history charting/drill-through beyond R.106 filter proof, remaining bounded or redacted snapshot planners for any still-uncovered command paths, separately gated live maintenance-control validation if needed, table-density polish, another targeted R.132/R.133-style `styles.css` same-file cleanup slice with replacement path/tests/visual QA, another small fixture/API extraction after R.134-R.144 replacement-path and parity-test evidence, another backend Query/Command API boundary extraction after R.187, broader production-console page migration for remaining routes, real NAS admin-worker env proof ingestion, staged-candidate Cutter compatibility proof ingestion, Docker staging/update runbook regeneration with explicit image tags, Docker release readiness summary regeneration after evidence changes, or the next implementation slice using the R.107-R.187 contracts as guardrails. The professional role review gate remains in force before each production-code sub-slice so the work does not shrink the full goal.

R.188 extracts Admin preprocess read route server dependency wiring from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-preprocess-read-route-deps.ts`, keeping preprocess job-log reads, public/redacted supervisor status projection, `/api/admin/preprocess/safety` processing-guard behavior, process-history/readiness Query deps, route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.188 preserves the process-history boundary by keeping route parsing in `admin-preprocess-read-routes.ts`, generic Query composition in `createAdminPreprocessReadRouteDeps(...)`, and server-only runtime projection/guard wiring in `createAdminPreprocessReadRouteServerDeps(...)`. It does not change process-history schema, supervisor lifecycle, preprocess commands, source-video/preprocess/release/index mutation, scan behavior, read-model rebuild policy, Docker publication, live NAS data, or UI layout.

R.188 leaves `packages/admin-api/src/index.ts` at `1327` physical lines by `wc -l`; the preprocess read route deps module is `139` lines and has a dedicated `313` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T031438Z.json` and `.md`: scanned `283` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.

R.188 verification passed `node --test --import tsx packages/admin-api/src/admin-preprocess-read-route-deps.test.ts packages/admin-api/src/admin-preprocess-read-routes.test.ts packages/admin-api/src/admin-preprocess-process-history-query.test.ts` with 12 tests, targeted `node --test --import tsx --test-name-pattern "preprocess job log endpoint falls back to a real task record snapshot|admin preprocess supervisor responses redact temporary ASR result details|blocks preprocessing supervisor start while processing tasks need recovery|process history" packages/admin-api/src/index.test.ts` with 3 tests, targeted `node --test --import tsx --test-name-pattern "preprocess jobs can read ready history from fresh admin sqlite without job files" packages/admin-api/src/index.test.ts` with 1 test, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.188 supersedes the prior "next backend Query/Command API boundary extraction after R.187" pointer. The next backend extraction should use the R.107-R.188 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.189 extracts Admin source-video command route server dependency wiring from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-source-video-command-route-deps.ts`, keeping cover/metadata command routing, queue/retry/recover-processing transitions, single source-video publish routing, page cache clearing, index cache invalidation, route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.189 preserves the command boundary by keeping route matching and command response behavior in `admin-source-video-command-routes.ts`, source-video mutation implementations in `admin-source-video-commands.ts` / transition / publish modules, and server-only preprocess supervisor projection in `createAdminSourceVideoCommandRouteServerDeps(...)`. It does not change ready/protection rules, writer leases, command audit, supervisor lifecycle, preprocess commands, source-video/preprocess/release/index data semantics, scan behavior, read-model rebuild policy, Docker publication, live NAS data, or UI layout.

R.189 leaves `packages/admin-api/src/index.ts` at `1328` physical lines by `wc -l`; the source-video command route deps module is `156` lines and has a dedicated `338` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T032206Z.json` and `.md`: scanned `283` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.

R.189 verification passed `node --test --import tsx packages/admin-api/src/admin-source-video-command-route-deps.test.ts packages/admin-api/src/admin-source-video-command-routes.test.ts packages/admin-api/src/admin-source-video-commands.test.ts` with 13 tests, targeted `node --test --import tsx --test-name-pattern "ready source videos cannot be requeued by Admin transition commands|queues and retries a single source video without mutating unrelated rows|single source-video publish writes through to fresh admin sqlite|admin can replace a source video cover and serve its real image type|admin rejects cover uploads with mismatched image content" packages/admin-api/src/index.test.ts` with 5 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.189 supersedes the prior "next backend Query/Command API boundary extraction after R.188" pointer. The next backend extraction should use the R.107-R.189 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.190 extracts Admin slow read route server dependency wiring from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-slow-read-route-deps.ts`, keeping dashboard metrics, preprocess/jobs pagination and supervisor projection, index/versions pagination, runtime metadata, diagnostics recording, route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.190 preserves route-owned slow data loading boundaries by keeping runtime metadata and route handling in `admin-slow-read-routes.ts`, dashboard/preprocess/index Query behavior in their read facade/query modules, and server-only preprocess supervisor projection in `createAdminSlowReadRouteServerDeps(...)`. It does not change dashboard metrics strategy, preprocess/jobs strategy, index/versions strategy, diagnostics history behavior, source-video/preprocess/release/index mutation, scan behavior, read-model rebuild policy, Docker publication, live NAS data, or UI layout.

R.190 leaves `packages/admin-api/src/index.ts` at `1327` physical lines by `wc -l`; the slow read route deps module is `113` lines and has a dedicated `283` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T032620Z.json` and `.md`: scanned `283` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.

R.190 verification passed `node --test --import tsx packages/admin-api/src/admin-slow-read-route-deps.test.ts packages/admin-api/src/admin-slow-read-routes.test.ts packages/admin-api/src/admin-dashboard-read-facade.test.ts packages/admin-api/src/admin-preprocess-jobs-read-facade.test.ts packages/admin-api/src/admin-index-versions-query.test.ts` with 18 tests, targeted `node --test --import tsx --test-name-pattern "selected slow admin endpoints expose runtime metadata without changing data shapes|preprocess jobs expose observable production estimates in Chinese|preprocess jobs can read the active first page from fresh admin sqlite without JSON read model|admin index versions expose current pointer and package validation details|dashboard metrics exposes read-model provenance for large libraries" packages/admin-api/src/index.test.ts` with 5 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.190 supersedes the prior "next backend Query/Command API boundary extraction after R.189" pointer. The next backend extraction should use the R.107-R.190 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.191 extracts Admin command snapshot restore route server dependency wiring from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-command-restore-route-deps.ts`, keeping snapshot id resolution, restore-plan generation, restore execution primitive, library manifest read, operation-log append, actor/time/holder/invalidation context, supervisor-block decision, route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.191 preserves the restore/rollback command boundary by keeping route matching and restore response behavior in `admin-command-restore-routes.ts`, restore preflight in `admin-command-restore-plan.ts`, restore execution in `admin-command-restore.ts`, and server-only preprocess supervisor projection in `createAdminCommandRestoreRouteServerDeps(...)`. It does not change restore-plan semantics, snapshot manifest path/format, command snapshot capture, writer leases, command audit, supervisor lifecycle, Protection Gate rules, actual NAS restore execution, live NAS data, or UI layout.

R.191 leaves `packages/admin-api/src/index.ts` at `1330` physical lines by `wc -l`; the command restore route deps module is `167` lines and has a dedicated `360` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T033301Z.json` and `.md`: scanned `283` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.

R.191 verification passed `node --test --import tsx packages/admin-api/src/admin-command-restore-route-deps.test.ts packages/admin-api/src/admin-command-restore-routes.test.ts packages/admin-api/src/admin-command-restore-plan.test.ts packages/admin-api/src/admin-command-restore.test.ts` with 23 tests, targeted `node --test --import tsx --test-name-pattern "command snapshot restore plan and execute are exposed through guarded admin API routes|authenticated admin command audit records actor identity without session token" packages/admin-api/src/index.test.ts` with 2 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.191 supersedes the prior "next backend Query/Command API boundary extraction after R.190" pointer. The next backend extraction should use the R.107-R.191 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.192 extracts Admin preprocess command route server dependency wiring from the generic route-deps factory into `createAdminPreprocessCommandRouteServerDeps(...)`, keeping supervisor start/stop, runtime-secret refresh, real-start readiness checks, preprocess safety blocking, bulk queue/retry/recover-processing command delegation, supervisor recovery blocking, source-video page cache clearing, route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.192 preserves the preprocess command boundary by keeping route matching and command response behavior in `admin-preprocess-command-routes.ts`, bulk transition implementations in `admin-transition-commands.ts`, public supervisor projection in `admin-preprocess-supervisor-status.ts`, generic route-safe dependency composition in `createAdminPreprocessCommandRouteDeps(...)`, and server-only internal supervisor projection in `createAdminPreprocessCommandRouteServerDeps(...)`. It does not change supervisor lifecycle behavior, real preprocess runner behavior, runtime policy, preprocess safety rules, ready/protection rules, source-video/preprocess/release/index data semantics, scan behavior, read-model rebuild policy, live NAS data, or UI layout.

R.192 leaves `packages/admin-api/src/index.ts` at `1330` physical lines by `wc -l`; the preprocess command route deps module is `189` lines and has a dedicated `365` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T033831Z.json` and `.md`: scanned `283` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.

R.192 verification passed `node --test --import tsx packages/admin-api/src/admin-preprocess-command-route-deps.test.ts packages/admin-api/src/admin-preprocess-command-routes.test.ts packages/admin-api/src/admin-preprocess-supervisor-status.test.ts` with 12 tests, targeted `node --test --import tsx --test-name-pattern "starts, reports, and stops the preprocessing supervisor through Chinese admin API|blocks preprocessing supervisor start while processing tasks need recovery|admin preprocess supervisor responses redact temporary ASR result details|bulk preprocess transition commands write through to fresh admin sqlite" packages/admin-api/src/index.test.ts` with 4 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.192 supersedes the prior "next backend Query/Command API boundary extraction after R.191" pointer. The next backend extraction should use the R.107-R.192 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.193 extracts Admin runtime diagnostic route server dependency wiring from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-runtime-diagnostic-route-deps.ts`, keeping Doctor run/export, runtime-secret refresh, `settings/test-asr` safe config-only behavior, route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.193 preserves the runtime diagnostics boundary by keeping route matching and response behavior in `admin-runtime-diagnostic-routes.ts`, generic diagnostic context composition in `createAdminRuntimeDiagnosticRouteDeps(...)`, and server-only Doctor/default ASR config projection in `createAdminRuntimeDiagnosticRouteServerDeps(...)`. It does not change Doctor report schema, exported Doctor file layout, real ASR audio submission, runtime secret persistence, settings commands, preprocess supervisor lifecycle, source-video/preprocess/release/index data semantics, scan behavior, read-model rebuild policy, live NAS data, or UI layout.

R.193 leaves `packages/admin-api/src/index.ts` at `1313` physical lines by `wc -l`; the runtime diagnostic route deps module is `136` lines and has a dedicated `257` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T034420Z.json` and `.md`: scanned `283` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.

R.193 verification passed `node --test --import tsx packages/admin-api/src/admin-runtime-diagnostic-route-deps.test.ts packages/admin-api/src/admin-runtime-diagnostic-routes.test.ts` with 9 tests, targeted `node --test --import tsx --test-name-pattern "exports doctor report JSON through the admin API|persists speech recognition key through settings API without echoing the secret|runtime settings reflect saved ASR audio mode and latest ASR failure" packages/admin-api/src/index.test.ts` with 3 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.193 supersedes the prior "next backend Query/Command API boundary extraction after R.192" pointer. The next backend extraction should use the R.107-R.193 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.194 extracts Admin settings command route server dependency wiring from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-settings-command-route-deps.ts`, keeping request JSON parsing, runtime-secret refresh injection, library manifest reads, command timestamp/invalidation/actor context, settings config command behavior, source-folder add/update/remove behavior, read-model stale invalidation behavior, route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.194 preserves the settings/source-folder command boundary by keeping route matching and response behavior in `admin-settings-command-routes.ts`, command implementations in `admin-settings-commands.ts`, generic route-safe command context composition in `createAdminSettingsCommandRouteDeps(...)`, and server-only service wiring in `createAdminSettingsCommandRouteServerDeps(...)`. It does not change settings schema, runtime secret persistence, source-folder command semantics, read-model rebuild policy, command audit/snapshot behavior, scan behavior, source-video/preprocess/release/index mutation, live NAS data, or UI layout.

R.194 leaves `packages/admin-api/src/index.ts` at `1243` physical lines by `wc -l`; the settings command route deps module is `175` lines and has a dedicated `465` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T035231Z.json` and `.md`: scanned `283` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.

R.194 verification passed `node --test --import tsx packages/admin-api/src/admin-settings-command-route-deps.test.ts packages/admin-api/src/admin-settings-command-routes.test.ts packages/admin-api/src/admin-settings-commands.test.ts` with 9 tests, targeted `node --test --import tsx --test-name-pattern "persists admin settings config through API|persists speech recognition key through settings API without echoing the secret|mutates source folders through API|source folder mutations mark fresh admin sqlite stale without rebuilding JSON read model|settings source_folders patch marks fresh admin sqlite stale without hidden rebuild" packages/admin-api/src/index.test.ts` with 5 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.194 supersedes the prior "next backend Query/Command API boundary extraction after R.193" pointer. The next backend extraction should use the R.107-R.194 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.195 extracts Admin library command route server dependency wiring from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-library-command-route-deps.ts`, keeping library init, scan-preview, scan-apply, scan-apply protection blocking, read-model reconcile handoff scheduling, source-video page cache clearing, route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.195 preserves the scan command boundary by keeping route matching and scan response composition in `admin-library-command-routes.ts`, scan-preview/scan-apply behavior in `admin-scan-planner.ts`, library init/scan command execution in `admin-library-commands.ts`, generic route-safe command context composition in `createAdminLibraryCommandRouteDeps(...)`, and server-only service wiring in `createAdminLibraryCommandRouteServerDeps(...)`. It does not change Protection Gate rules, read-model reconcile policy, source-video page query behavior, scan planner behavior, source-video/preprocess/release/index mutation semantics, live NAS data, or UI layout.

R.195 leaves `packages/admin-api/src/index.ts` at `1215` physical lines by `wc -l`; the library command route deps module is `228` lines and has a dedicated `383` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T035843Z.json` and `.md`: scanned `283` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.

R.195 verification passed `node --test --import tsx packages/admin-api/src/admin-library-command-route-deps.test.ts packages/admin-api/src/admin-library-command-routes.test.ts packages/admin-api/src/admin-library-commands.test.ts packages/admin-api/src/admin-scan-planner.test.ts` with 21 tests, targeted `node --test --import tsx --test-name-pattern "initializes, scans, and reports a public library dashboard|scan preview blocks applying source-folder changes that would remove ready videos|library scan returns read-model reconcile handoff after marking admin sqlite stale" packages/admin-api/src/index.test.ts` with 3 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.195 supersedes the prior "next backend Query/Command API boundary extraction after R.194" pointer. The next backend extraction should use the R.107-R.195 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.196 extracts Admin index command route server dependency wiring from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-index-command-route-deps.ts`, keeping index repair command dispatch, ready publish media injection, command-owned index-version cache invalidation, source-video page cache clearing, route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.196 preserves the index command boundary by keeping route matching and response behavior in `admin-index-command-routes.ts`, index repair execution in `admin-publish-commands.ts`, generic route-safe command context composition in `createAdminIndexCommandRouteDeps(...)`, and server-only service wiring in `createAdminIndexCommandRouteServerDeps(...)`. It does not change index repair behavior, publish command behavior, ready media preparation, index-version query behavior, source-video page query behavior, Protection Gate rules, read-model rebuild policy, live NAS data, or UI layout.

R.196 leaves `packages/admin-api/src/index.ts` at `1197` physical lines by `wc -l`; the index command route deps module is `104` lines and has a dedicated `205` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T040251Z.json` and `.md`: scanned `283` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates.

R.196 verification passed `node --test --import tsx packages/admin-api/src/admin-index-command-route-deps.test.ts packages/admin-api/src/admin-index-command-routes.test.ts packages/admin-api/src/admin-publish-commands.test.ts` with 9 tests, targeted `node --test --import tsx --test-name-pattern "admin index publish prepares missing cover and keyframes before publishing" packages/admin-api/src/index.test.ts` with 1 test, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.196 supersedes the prior "next backend Query/Command API boundary extraction after R.195" pointer. The next backend extraction should use the R.107-R.196 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.197 extracts Admin cutter-user command route server dependency wiring from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-cutter-user-command-route-deps.ts`, keeping application approval, user disable, admin password reset, password-reset session invalidation, request JSON reading, actor/time context, approval response projection, public user projection, route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.197 preserves the cutter-user command boundary by keeping route matching and response/error behavior in `admin-cutter-user-command-routes.ts`, command implementations in `admin-cutter-user-commands.ts`, generic route-safe command context composition in `createAdminCutterUserCommandRouteDeps(...)`, and server-only service wiring in `createAdminCutterUserCommandRouteServerDeps(...)`. It does not change cutter-user account schema, password policy, approval/session behavior, public projection shape, command audit behavior, read-model policy, live NAS data, or UI layout.

R.197 leaves `packages/admin-api/src/index.ts` at `1169` physical lines by `wc -l`; the cutter-user command route deps module is `205` lines and has a dedicated `387` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T040910Z.json` and `.md`: scanned `283` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates. The audit reports `index.ts` as `1170` lines because its scanner counts the trailing split differently than `wc -l`.

R.197 verification passed `node --test --import tsx packages/admin-api/src/admin-cutter-user-command-route-deps.test.ts packages/admin-api/src/admin-cutter-user-command-routes.test.ts packages/admin-api/src/admin-cutter-user-commands.test.ts` with 10 tests, targeted `node --test --import tsx --test-name-pattern "approves cutter applications and disables cutter users|admin can reset cutter user password and invalidate sessions|admin cutter user routes accept CU ids longer than six digits" packages/admin-api/src/index.test.ts` with 3 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.197 supersedes the prior "next backend Query/Command API boundary extraction after R.196" pointer. The next backend extraction should use the R.107-R.197 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.198 extracts Admin source-video read route server dependency wiring from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-source-video-route-deps.ts`, keeping source-video list reads, public projection, source-video detail reads, runtime diagnostics recording, status validation, route paths, response envelopes, runtime metadata, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.198 preserves the source-video read boundary by keeping route matching, runtime metadata, and response behavior in `admin-source-video-routes.ts`, source-video data-loading behavior in the read facade/query modules, generic route-safe dependency composition in `createAdminSourceVideoRouteDeps(...)`, and server-only service wiring in `createAdminSourceVideoRouteServerDeps(...)`. It does not change source-video query algorithms, pagination/default-limit policy, detail schema, runtime metadata schema, read-model rebuild policy, scan behavior, live NAS data, or UI layout.

R.198 leaves `packages/admin-api/src/index.ts` at `1169` physical lines by `wc -l`; the source-video route deps module is `67` lines and has a dedicated `194` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T041248Z.json` and `.md`: scanned `283` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates. The audit reports `index.ts` as `1170` lines because its scanner counts the trailing split differently than `wc -l`.

R.198 verification passed `node --test --import tsx packages/admin-api/src/admin-source-video-route-deps.test.ts packages/admin-api/src/admin-source-video-routes.test.ts packages/admin-api/src/admin-source-video-read-facade.test.ts` with 11 tests, targeted `node --test --import tsx --test-name-pattern "source video list filters query and status before paginating|source video query can return ready rows from the current transcript index without manifests|source video ready status can page from the current transcript index without manifests|returns source video detail for an unprocessed scan result" packages/admin-api/src/index.test.ts` with 4 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.198 supersedes the prior "next backend Query/Command API boundary extraction after R.197" pointer. The next backend extraction should use the R.107-R.198 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.199 extracts Admin system read route server dependency wiring from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-system-read-route-deps.ts`, keeping library status, settings config, runtime settings, Doctor report, cutter-user listing, public cutter-user projection, runtime-secret refresh behavior, Doctor timestamp/env context, route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.199 preserves the system read boundary by keeping route matching and response behavior in `admin-system-read-routes.ts`, behavior in the existing library/settings/runtime/doctor/cutter-user readers, generic route-safe dependency composition in `createAdminSystemReadRouteDeps(...)`, and server-only service wiring in `createAdminSystemReadRouteServerDeps(...)`. It does not change settings schema, runtime settings schema, Doctor report schema, cutter-user account/projection policy, authentication behavior, library status query behavior, scan behavior, live NAS data, or UI layout.

R.199 leaves `packages/admin-api/src/index.ts` at `1169` physical lines by `wc -l`; the system read route deps module is `176` lines and has a dedicated `381` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T041715Z.json` and `.md`: scanned `283` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates. The audit reports `index.ts` as `1170` lines because its scanner counts the trailing split differently than `wc -l`.

R.199 verification passed `node --test --import tsx packages/admin-api/src/admin-system-read-route-deps.test.ts packages/admin-api/src/admin-system-read-routes.test.ts packages/admin-api/src/admin-library-status-query.test.ts packages/admin-api/src/admin-runtime-settings-query.test.ts` with 14 tests, targeted `node --test --import tsx --test-name-pattern "returns admin settings config with the default source folder|runtime settings reflect saved ASR audio mode and latest ASR failure|library status and path checks follow configured source folders|returns an empty cutter user list initially" packages/admin-api/src/index.test.ts` with 4 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.199 supersedes the prior "next backend Query/Command API boundary extraction after R.198" pointer. The next backend extraction should use the R.107-R.199 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.200 separates Admin auth route generic and server dependency wiring in `packages/admin-api/src/admin-auth-route-deps.ts`, keeping health, bootstrap, status, first-admin registration, login, logout, password-hash redaction, session-token handling, auth-disabled behavior, route paths, response envelopes, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.200 preserves the auth boundary by keeping route matching and response behavior in `admin-auth-routes.ts`, concrete auth behavior in `admin-auth-commands.ts` plus library-fs auth helpers, generic dependency composition in `createAdminAuthRouteDeps(...)`, and server-only storage/command service wiring in `createAdminAuthRouteServerDeps(...)`. It does not change admin account schema, password policy, session token format, first-admin bootstrap policy, auth-disabled behavior, health query behavior, live NAS user-store data, or UI layout.

R.200 leaves `packages/admin-api/src/index.ts` at `1169` physical lines by `wc -l`; the auth route deps module is `143` lines and has a dedicated `318` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T042152Z.json` and `.md`: scanned `283` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates. The audit reports `index.ts` as `1170` lines because its scanner counts the trailing split differently than `wc -l`.

R.200 verification passed `node --test --import tsx packages/admin-api/src/admin-auth-route-deps.test.ts packages/admin-api/src/admin-auth-routes.test.ts packages/admin-api/src/admin-auth-commands.test.ts` with 12 tests, targeted `node --test --import tsx --test-name-pattern "admin password auth protects business routes and redacts password hashes|authenticated admin command audit records actor identity without session token" packages/admin-api/src/index.test.ts` with 2 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.200 supersedes the prior "next backend Query/Command API boundary extraction after R.199" pointer. The next backend extraction should use the R.107-R.200 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.201 separates Admin runtime observability route generic and server dependency wiring in `packages/admin-api/src/admin-runtime-observability-route-deps.ts`, keeping `/api/admin/runtime/diagnostics/history`, generated-at timestamp forwarding, bounded limit parsing, response envelopes, diagnostics history shape, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.201 preserves the runtime observability boundary by keeping route matching and response behavior in `admin-runtime-observability-routes.ts`, diagnostics history Query/history behavior in `admin-runtime-observability.ts`, generic dependency composition in `createAdminRuntimeObservabilityRouteDeps(...)`, and server-only diagnostics history service wiring in `createAdminRuntimeObservabilityRouteServerDeps(...)`. It does not change diagnostics recorder behavior, slow-read runtime metadata, source-video/preprocess/release/index mutation semantics, scan behavior, read-model rebuild policy, live NAS data, or UI layout.

R.201 leaves `packages/admin-api/src/index.ts` at `1169` physical lines by `wc -l`; the runtime observability route deps module is `43` lines and has a dedicated `88` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T042811Z.json` and `.md`: scanned `283` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates. The audit reports `index.ts` as `1170` lines because its scanner counts the trailing split differently than `wc -l`.

R.201 verification passed `node --test --import tsx packages/admin-api/src/admin-runtime-observability-route-deps.test.ts packages/admin-api/src/admin-runtime-observability-routes.test.ts packages/admin-api/src/admin-runtime-observability.test.ts` with 8 tests, targeted `node --test --import tsx --test-name-pattern "runtime diagnostics history" packages/admin-api/src/index.test.ts` with 1 test, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.201 supersedes the prior "next backend Query/Command API boundary extraction after R.200" pointer. The next backend extraction should use the R.107-R.201 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.202 separates Admin protection read route generic and server dependency wiring in `packages/admin-api/src/admin-protection-read-route-deps.ts`, keeping `/api/admin/protection/status`, `/api/admin/release-gates`, `/api/admin/library/path-checks`, response envelopes, path-check root projection, protection/release gate behavior, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.202 preserves the protection read boundary by keeping route matching and response behavior in `admin-protection-read-routes.ts`, protection/release/path-check behavior in `admin-protection-query.ts` plus the release/path-check query modules, generic dependency composition in `createAdminProtectionReadRouteDeps(...)`, and server-only protection/release/path-check service wiring in `createAdminProtectionReadRouteServerDeps(...)`. It does not change Protection Gate write rules, release gate policy, path-check schema, scan behavior, source-video/preprocess/release/index mutation semantics, read-model rebuild policy, live NAS data, or UI layout.

R.202 leaves `packages/admin-api/src/index.ts` at `1169` physical lines by `wc -l`; the protection read route deps module is `68` lines and has a dedicated `151` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T043216Z.json` and `.md`: scanned `283` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates. The audit reports `index.ts` as `1170` lines because its scanner counts the trailing split differently than `wc -l`.

R.202 verification passed `node --test --import tsx packages/admin-api/src/admin-protection-read-route-deps.test.ts packages/admin-api/src/admin-protection-read-routes.test.ts packages/admin-api/src/admin-protection-query.test.ts` with 10 tests, targeted `node --test --import tsx --test-name-pattern "protection status and release gates expose Admin Architecture v1 blockers|library status and path checks follow configured source folders" packages/admin-api/src/index.test.ts` with 2 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.202 supersedes the prior "next backend Query/Command API boundary extraction after R.201" pointer. The next backend extraction should use the R.107-R.202 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.203 extracts Admin protection read service assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-protection-read-services.ts`, keeping `/api/admin/protection/status`, `/api/admin/release-gates`, `/api/admin/library/path-checks`, operations overview protection/release reads, response envelopes, path-check root projection, protection/release gate semantics, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.203 preserves the protection read boundary by keeping behavior in `admin-protection-query.ts`, route matching and response behavior in `admin-protection-read-routes.ts`, route dependency composition in `admin-protection-read-route-deps.ts`, and server-only Query service assembly in `createAdminProtectionReadServices(...)`. It does not change Protection Gate write rules, release gate policy, path-check schema, scan behavior, source-video/preprocess/release/index mutation semantics, read-model rebuild policy, live NAS data, or UI layout.

R.203 leaves `packages/admin-api/src/index.ts` at `1149` physical lines by `wc -l`; the protection read services module is `86` lines and has a dedicated `177` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T043723Z.json` and `.md`: scanned `285` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates. The audit reports `index.ts` as `1150` lines because its scanner counts the trailing split differently than `wc -l`.

R.203 verification passed focused `node --test --import tsx packages/admin-api/src/admin-protection-read-services.test.ts packages/admin-api/src/admin-protection-query.test.ts packages/admin-api/src/admin-protection-read-routes.test.ts packages/admin-api/src/admin-protection-read-route-deps.test.ts` with 11 tests after correcting an overly broad temp-path release-allowed assertion, targeted `node --test --import tsx --test-name-pattern "protection status and release gates expose Admin Architecture v1 blockers|library status and path checks follow configured source folders" packages/admin-api/src/index.test.ts` with 2 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.203 supersedes the prior "next backend Query/Command API boundary extraction after R.202" pointer. The next backend extraction should use the R.107-R.203 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.204 extracts Admin health and preprocess-safety read service assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-health-read-services.ts`, keeping `/health`, auth health reads, preprocess read/command safety checks, protection release-gate safety checks, response semantics, build/runtime/path-profile projection, disk policy, read-model processing guard behavior, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.204 preserves the health/safety Query boundary by keeping behavior in `admin-health-query.ts`, route matching and response behavior in the auth/preprocess/protection route modules, and server-only Query service assembly in `createAdminHealthReadServices(...)`. It does not change health response schema, preprocess safety policy, processing recovery rules, disk-space policy, auth/session behavior, source-video/preprocess/release/index mutation semantics, read-model rebuild policy, live NAS data, or UI layout.

R.204 leaves `packages/admin-api/src/index.ts` at `1123` physical lines by `wc -l`; the health read services module is `64` lines and has a dedicated `119` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T044429Z.json` and `.md`: scanned `287` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates. The audit reports `index.ts` as `1124` lines because its scanner counts the trailing split differently than `wc -l`.

R.204 verification passed focused `node --test --import tsx packages/admin-api/src/admin-health-read-services.test.ts packages/admin-api/src/admin-health-query.test.ts packages/admin-api/src/admin-auth-routes.test.ts packages/admin-api/src/admin-preprocess-read-route-deps.test.ts packages/admin-api/src/admin-preprocess-command-route-deps.test.ts` with 17 tests, targeted `node --test --import tsx --test-name-pattern "health reports build, runtime path profile, and shallow preprocess safety|refuses to start real preprocessing when DashScope key is missing|protection status and release gates expose Admin Architecture v1 blockers" packages/admin-api/src/index.test.ts` with 3 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.204 supersedes the prior "next backend Query/Command API boundary extraction after R.203" pointer. The next backend extraction should use the R.107-R.204 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.205 extracts Admin dashboard metrics, runtime-load metrics, and library-status read service assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-dashboard-read-services.ts`, keeping `/api/admin/dashboard/metrics`, `/api/admin/library/status`, protection release-gate library status reads, preprocess jobs runtime-load enrichment, response envelopes, runtime metadata, read-model status summary behavior, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.205 preserves the dashboard/library/runtime Query boundary by keeping dashboard facade/cache behavior in `admin-dashboard-read-facade.ts`, library status behavior in `admin-library-status-query.ts`, runtime-load behavior in `admin-runtime-load-query.ts`, and server-only Query service assembly in `createAdminDashboardReadServices(...)`. It does not change dashboard metrics schema, runtime-load schema, library-status schema, query/cache policy, source-video/preprocess/release/index mutation semantics, read-model rebuild policy, live NAS data, or UI layout.

R.205 leaves `packages/admin-api/src/index.ts` at `1072` physical lines by `wc -l`; the dashboard read services module is `164` lines and has a dedicated `245` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T045217Z.json` and `.md`: scanned `289` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `24`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates. The audit reports `index.ts` as `1073` lines because its scanner counts the trailing split differently than `wc -l`.

R.205 verification passed focused `node --test --import tsx packages/admin-api/src/admin-dashboard-read-services.test.ts packages/admin-api/src/admin-dashboard-read-facade.test.ts packages/admin-api/src/admin-library-status-query.test.ts packages/admin-api/src/admin-runtime-load-query.test.ts packages/admin-api/src/admin-slow-read-route-deps.test.ts` with 13 tests. The first targeted Admin API regression caught a service-boundary adapter issue in `dashboard metrics exposes read-model provenance for large libraries`; wrapping the object-shaped read-model store summary readers at the `index.ts` service boundary restored existing dashboard material and production summaries. Targeted `node --test --import tsx --test-name-pattern "returns dashboard material metrics after scan|dashboard metrics exposes read-model provenance for large libraries|returns expanded dashboard transcript production and usage metrics|library status and path checks follow configured source folders|preprocess jobs expose observable production estimates in Chinese" packages/admin-api/src/index.test.ts` then passed with 5 tests. Full `node --test --import tsx packages/admin-api/src/index.test.ts` passed with 68 tests, followed by `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.205 supersedes the prior "next backend Query/Command API boundary extraction after R.204" pointer. The next backend extraction should use the R.107-R.205 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.206 extracts Admin preprocess jobs read service assembly from `packages/admin-api/src/index.ts` into `packages/admin-api/src/admin-preprocess-jobs-read-services.ts`, keeping `/api/admin/preprocess/jobs`, response envelopes, Chinese status/progress projections, runtime-load enrichment, concurrency policy reads, paged `admin.sqlite` read-model provenance, ready-history job snapshots, active processing inclusion, manifest fallback behavior, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.206 preserves the preprocess jobs Query boundary by keeping queue/progress behavior in `admin-preprocess-jobs-query.ts`, read-model/fallback behavior in `admin-preprocess-jobs-read-facade.ts`, route matching and response behavior in the slow-read route modules, and server-only Query service assembly in `createAdminPreprocessJobsReadServices(...)`. It does not change preprocess jobs schema, job status/progress calculation, read-model page/fallback policy, route paths, source-video/preprocess/release/index mutation semantics, read-model rebuild policy, live NAS data, or UI layout.

R.206 leaves `packages/admin-api/src/index.ts` at `1058` physical lines by `wc -l`; the preprocess jobs read services module is `66` lines and has a dedicated `196` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T050124Z.json` and `.md`: scanned `291` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `25`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates. The audit reports `index.ts` as `1059` lines because its scanner counts the trailing split differently than `wc -l`.

R.206 verification passed focused `node --test --import tsx packages/admin-api/src/admin-preprocess-jobs-read-services.test.ts packages/admin-api/src/admin-preprocess-jobs-read-facade.test.ts packages/admin-api/src/admin-preprocess-jobs-query.test.ts packages/admin-api/src/admin-slow-read-route-deps.test.ts` with 9 tests, targeted `node --test --import tsx --test-name-pattern "preprocess jobs expose observable production estimates in Chinese|preprocess jobs can read the active first page from fresh admin sqlite without JSON read model|preprocess jobs can read ready history from fresh admin sqlite without job files|preprocess jobs include processing videos outside the generic manifest page immediately|preprocess jobs include far processing rows from the status read model on the first page" packages/admin-api/src/index.test.ts` with 5 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false` after correcting type-only imports in the new service/test, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.206 supersedes the prior "next backend Query/Command API boundary extraction after R.205" pointer. The next backend extraction should use the R.107-R.206 contracts as guardrails, while the full `Admin Architecture v1` Goal remains incomplete.

R.207 introduces a batchized JSON route dispatcher in `packages/admin-api/src/admin-json-route-dispatcher.ts` and uses it from `packages/admin-api/src/index.ts` to dispatch the read-route group: system reads, runtime observability, protection reads, read-model reads, slow reads, source-video reads, and preprocess reads. It keeps source-video media streaming and all command routes outside the dispatcher batch.

R.207 preserves the read-route boundary by keeping path matching, response envelopes, runtime metadata, read-model provenance, source-video list/detail behavior, preprocess read behavior, system settings/runtime reads, protection/release/path checks, and data-loading/operations overview behavior in the existing route/query/facade modules. It does not change command routes, write gates, media streaming, source-video/preprocess/release/index mutation semantics, read-model rebuild policy, live NAS data, or UI layout.

R.207 leaves `packages/admin-api/src/index.ts` at `1033` physical lines by `wc -l`; the JSON route dispatcher module is `26` lines and has a dedicated `46` line test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T051628Z.json` and `.md`: scanned `293` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `25`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates. The audit reports `index.ts` as `1034` lines because its scanner counts the trailing split differently than `wc -l`.

R.207 verification passed focused `node --test --import tsx packages/admin-api/src/admin-json-route-dispatcher.test.ts packages/admin-api/src/admin-system-read-routes.test.ts packages/admin-api/src/admin-runtime-observability-routes.test.ts packages/admin-api/src/admin-protection-read-routes.test.ts packages/admin-api/src/admin-read-model-routes.test.ts packages/admin-api/src/admin-slow-read-routes.test.ts packages/admin-api/src/admin-source-video-routes.test.ts packages/admin-api/src/admin-preprocess-read-routes.test.ts` with 36 tests, `npm run typecheck -- --pretty false`, targeted `node --test --import tsx --test-name-pattern "health reports build, runtime path profile, and shallow preprocess safety|protection status and release gates expose Admin Architecture v1 blockers|data loading plan keeps shell endpoints cheap and route-owned|selected slow admin endpoints expose runtime metadata without changing data shapes|source video list filters query and status before paginating|preprocess job log endpoint falls back to a real task record snapshot|returns an empty cutter user list initially" packages/admin-api/src/index.test.ts` with 7 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.207 supersedes the prior "next backend Query/Command API boundary extraction after R.206" pointer. The next backend movement should use the R.107-R.207 contracts as guardrails and continue batchizing same-class work where safe, while the full `Admin Architecture v1` Goal remains incomplete.

R.208 adds source-video status-page runtime provenance to `packages/admin-api/src/admin-source-video-status-page-query.ts` and carries it through `packages/admin-api/src/admin-source-video-read-facade.ts`, keeping source-video route paths, response envelopes, filtering, pagination, read-model rebuild policy, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.208 preserves the Query API boundary by keeping manifest-only compatibility wrappers for existing callers while adding `listAdminSourceVideoStatusPageWithRuntimeMeta(...)` and `listAdminSourceVideoStatusesPageWithRuntimeMeta(...)` for runtime-aware callers. Store-backed `admin.sqlite` pages and embedded JSON read-model manifest rows report `admin-read-model/hit`; generated read-model ID fallbacks that still materialize rows from source-video manifests report `source-video-manifest/miss`.

R.208 leaves `packages/admin-api/src/index.ts` at `1033` physical lines by `wc -l`; the status-page Query module is `240` lines with a `379` line focused test file, and the source-video read facade is `463` lines with a `264` line focused test file. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T052450Z.json` and `.md`: scanned `293` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `26`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates. The audit reports `index.ts` as `1034` lines because its scanner counts the trailing split differently than `wc -l`.

R.208 verification passed focused `node --test --import tsx packages/admin-api/src/admin-source-video-status-page-query.test.ts packages/admin-api/src/admin-source-video-read-facade.test.ts packages/admin-api/src/admin-source-video-list-query.test.ts packages/admin-api/src/admin-source-video-routes.test.ts` with 24 tests, targeted `node --test --import tsx --test-name-pattern "source video list filters query and status before paginating|source video non-ready status list can read from fresh admin sqlite without JSON read model|source video query fills ready index results with matching non-ready manifests|selected slow admin endpoints expose runtime metadata without changing data shapes|preprocess jobs can read the active first page from fresh admin sqlite without JSON read model" packages/admin-api/src/index.test.ts` with 5 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.208 supersedes the prior "next backend movement should use the R.107-R.207 contracts" pointer. The next backend movement should use the new status-list provenance to target remaining `source-video-manifest/miss` slow paths through store completeness, reconcile/write-through coverage, or explicit maintenance surfacing, while the full `Admin Architecture v1` Goal remains incomplete.

R.209 pushes query candidate narrowing for fresh `admin.sqlite` non-ready status pages into `packages/admin-api/src/admin-read-model-store.ts`, keeping source-video route paths, response envelopes, exact JS search filtering, status ordering, read-model freshness policy, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.209 preserves the read-model store safety boundary by keeping unfiltered status pages strict: placeholder-only rows still make the store return `null` so higher layers can fall back instead of serving incomplete data. For query-filtered pages, SQLite now narrows candidates by escaped LIKE over `source_video_id`, `title`, `relative_path`, `source_folder_name`, and `manifest_json`, then the existing `adminSourceVideoMatchesListFilter(...)` remains the final search contract. This lets the store serve queries that match complete candidate rows even when unrelated rows in the same status are placeholder-only.

R.209 leaves `packages/admin-api/src/index.ts` at `1033` physical lines by `wc -l`; `packages/admin-api/src/admin-read-model-store.ts` is `2476` lines and its focused test file is `1807` lines. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T052930Z.json` and `.md`: scanned `293` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `26`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates. The audit reports `index.ts` as `1034` lines because its scanner counts the trailing split differently than `wc -l`.

R.209 verification passed focused `node --test --import tsx packages/admin-api/src/admin-read-model-store.test.ts` with 26 tests, focused source-video regressions `node --test --import tsx packages/admin-api/src/admin-source-video-status-page-query.test.ts packages/admin-api/src/admin-source-video-read-facade.test.ts packages/admin-api/src/admin-source-video-list-query.test.ts packages/admin-api/src/admin-source-video-routes.test.ts` with 24 tests, targeted `node --test --import tsx --test-name-pattern "source video list filters query and status before paginating|source video non-ready status list can read from fresh admin sqlite without JSON read model|source video query fills ready index results with matching non-ready manifests|selected slow admin endpoints expose runtime metadata without changing data shapes|preprocess jobs can read the active first page from fresh admin sqlite without JSON read model" packages/admin-api/src/index.test.ts` with 5 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.209 supersedes the prior "use the new status-list provenance to target remaining source-video-manifest/miss slow paths" pointer. The next backend movement should quantify real status-list runtime or expose explicit store miss/readiness reasons so the Admin UI and diagnostics can tell stale store, unsupported ready status, placeholder-only rows, and manifest fallback apart, while the full `Admin Architecture v1` Goal remains incomplete.

R.210 carries source-video status store miss/readiness reasons from `packages/admin-api/src/admin-read-model-store.ts` through `packages/admin-api/src/admin-source-video-status-page-query.ts`, `packages/admin-api/src/admin-source-video-read-facade.ts`, `packages/admin-api/src/admin-source-video-routes.ts`, and `packages/admin-api/src/admin-runtime-observability.ts`, keeping route paths, source-video list data, filtering, pagination, read-model rebuild policy, NAS data, Docker state, Worker behavior, and Cutter protocols unchanged.

R.210 preserves compatibility by adding `readAdminSourceVideoStatusPageFromStoreWithReadiness(...)` and `readAdminSourceVideoStatusesPageFromStoreWithReadiness(...)` while keeping the existing store `page|null` wrapper functions. The runtime-aware source-video path now reports optional `fallback_reason` values such as `status-store:store-not-fresh` and `status-store:incomplete-manifest-rows`; old runtime diagnostics history records without that field remain valid. The Admin Web API type accepts the optional field but no UI layout or data contract behavior changes.

R.210 leaves `packages/admin-api/src/index.ts` at `1033` physical lines by `wc -l`; `packages/admin-api/src/admin-read-model-store.ts` is `2542` lines, `packages/admin-api/src/admin-source-video-status-page-query.ts` is `283` lines, `packages/admin-api/src/admin-source-video-read-facade.ts` is `473` lines, `packages/admin-api/src/admin-source-video-routes.ts` is `143` lines, `packages/admin-api/src/admin-runtime-observability.ts` is `275` lines, and `apps/admin-web/src/api.ts` is `2714` lines. Accepted redundancy evidence is `docs/acceptance/artifacts/admin-redundancy-governance-audit-20260627T053606Z.json` and `.md`: scanned `293` files, duplicate selector candidates remain `40`, large-file candidates remain `19`, term hotspot candidates are `27`, and cleanup remains blocked by CSS, large-file, and fixture/fallback/legacy gates. The audit reports `index.ts` as `1034` lines because its scanner counts the trailing split differently than `wc -l`.

R.210 verification passed focused `node --test --import tsx packages/admin-api/src/admin-read-model-store.test.ts packages/admin-api/src/admin-source-video-status-page-query.test.ts packages/admin-api/src/admin-source-video-read-facade.test.ts packages/admin-api/src/admin-source-video-routes.test.ts packages/admin-api/src/admin-runtime-observability.test.ts` with 51 tests, targeted `node --test --import tsx --test-name-pattern "source video list filters query and status before paginating|source video non-ready status list can read from fresh admin sqlite without JSON read model|source video query fills ready index results with matching non-ready manifests|selected slow admin endpoints expose runtime metadata without changing data shapes|preprocess jobs can read the active first page from fresh admin sqlite without JSON read model" packages/admin-api/src/index.test.ts` with 5 tests, full `node --test --import tsx packages/admin-api/src/index.test.ts` with 68 tests, `npm run typecheck -- --pretty false`, `npm run audit:admin-redundancy-governance`, `node --test --import tsx scripts/acceptance/admin-redundancy-governance-audit.test.ts` with 3 tests, and `git diff --check`.

R.210 supersedes the prior "expose explicit store miss/readiness reasons" pointer. The next movement should either sample current local/NAS read-only runtime to quantify actual fallback reasons, or expose `fallback_reason` in the Admin UI source-video diagnostics/inspector path, while the full `Admin Architecture v1` Goal remains incomplete.

R.211 planned traceability:

- Requirement coverage: slow source-video list observability, route-owned Admin Web loading, read-model Query API diagnostics, and production-console information architecture.
- Planned implementation boundary: expose source-video list runtime meta in the Admin Web client as an additive compatibility method, preserve the latest route runtime in `AdminApp`, and show Chinese read-model/fallback diagnostics in the素材库 page data-source contract.
- Non-goal and safety boundary: no source-video row contract change, no backend route change, no read-model rebuild policy change, no NAS data mutation, no Docker deployment, and no Cutter release/index/search protocol change.
- Professional review: Project Architect confirms the batch does not shrink Admin Architecture v1 into UI polish because it connects R.210 Query diagnostics to operator-visible control-console evidence. Delivery Lead confirms the batch is safe as a local Admin Web metadata plumbing slice with focused tests and governance checks.

R.211 implemented traceability:

- `apps/admin-web/src/api.ts` preserves `/api/admin/source-videos` runtime metadata through `listSourceVideosWithRuntime(...)` while `listSourceVideos(...)` remains source-row compatible for existing callers.
- `apps/admin-web/src/app/AdminApp.tsx` records the latest source-video route runtime meta for both first-page and load-more requests, so the素材库 route owns its diagnostics instead of depending on dashboard shell data.
- `apps/admin-web/src/features/source-videos/SourceVideosPage.tsx` translates runtime `actual_data_source` and `fallback_reason` into Chinese operator diagnostics. It can now distinguish read-model hits from source-video manifest fallback and stale/incomplete/unreadable store reasons at the page surface.
- Verification passed Admin Web focused tests, typecheck, governance audit, governance audit tests, and `git diff --check`. R.211 does not complete Admin Architecture v1; it closes the UI visibility loop for R.210 diagnostics.

R.212 planned traceability:

- Requirement coverage: slow `source-videos?status=processing/index-required` query path, Admin read-model Query API, and no page-request full NAS scans.
- Planned implementation boundary: optimize `admin.sqlite` query-filtered non-ready status pages so SQLite candidates are read in bounded batches and manifest parsing stops when the requested exact page is filled.
- Non-goal and safety boundary: no schema migration, no backend route change, no source-video response shape change, no NAS data mutation, no Docker deployment, no Worker behavior change, and no Cutter release/index/search protocol change.
- Professional review: Project Architect confirms the batch advances the materialized query layer rather than shrinking the Goal into UI loading behavior. Delivery Lead confirms it is safe as local Admin API query code with focused tests and governance checks.

R.212 implemented traceability:

- `packages/admin-api/src/admin-read-model-store.ts` now bounds query-filtered status candidate reads and stops once the requested exact page has enough matches, reducing unnecessary `manifest_json` parsing on large non-ready status lists.
- `packages/admin-api/src/admin-read-model-store.test.ts` proves that a corrupt later candidate no longer forces the first query page to fall back, while the page that actually needs the corrupt candidate remains blocked with `incomplete-manifest-rows`.
- Focused store tests, source-video status/facade/route tests, and targeted Admin API regression passed. R.212 does not complete Admin Architecture v1; it improves the source-video status Query API path that supports the broader read-model performance target.

R.213 planned traceability:

- Requirement coverage: Admin read-model Query API, slow `source-videos?status=processing/index-required` fallback reduction, no page-request full NAS scans, route-owned runtime diagnostics, and derived-store safety.
- Planned implementation boundary: expose exact current-page missing source-video IDs from fresh `admin.sqlite` status-page reads, let the source-video read facade read only those manifests by ID, write those manifests back to the derived store, and retry the store page. This keeps repair bounded to the current page or current query candidate batch.
- Non-goal and safety boundary: no source manifest mutation, no ready asset mutation, no release/index mutation, no Cutter protocol change, no full rebuild, no page-time full scan, no Docker deployment, and no UI layout change.
- Professional review: Project Architect confirms the batch keeps file facts, read model, and Cutter release/index roles separate while reducing a recoverable store fallback. Delivery Lead confirms it is safe as local Admin API read-model/facade wiring with focused tests and governance checks.

R.213 implemented traceability:

- `packages/admin-api/src/admin-read-model-store.ts` now includes `missing_source_video_ids` on fresh status-store miss results when the current page or query candidate batch contains missing/invalid derived manifest rows.
- `packages/admin-api/src/admin-source-video-read-facade.ts` uses those IDs for a bounded repair attempt: read exact manifests by ID from the fact source, write only derived rows into `admin.sqlite`, then retry the same store query.
- `packages/admin-api/src/index.ts` wires the existing read-model write-through function into the facade. Source manifests, ready assets, release/index data, Cutter protocols, route paths, and response list shapes are unchanged.
- Focused store/facade/query/route tests, targeted Admin API regression, typecheck, governance audit, governance audit tests, and `git diff --check` passed. R.213 does not complete Admin Architecture v1; it reduces one recoverable source-video status fallback class and sets up the next background reconcile/runtime sampling slice.

R.214 planned traceability:

- Requirement coverage: runtime diagnostics for slow source-video status pages, Admin read-model Query observability, and evidence-led performance validation after repair paths.
- Planned implementation boundary: add optional `repair_reason` metadata to source-video runtime results and diagnostics when R.213 repairs a missing derived manifest row and the retried store page serves from `admin.sqlite`.
- Non-goal and safety boundary: no list row shape change, no source manifest mutation, no read-model rebuild, no background full reconcile behavior change, no UI redesign, no Docker deployment, and no Cutter contract change.
- Professional review: Project Architect confirms this keeps repair evidence visible without conflating it with a fallback. Delivery Lead confirms the metadata is additive and safe with focused tests and governance checks.

R.214 implemented traceability:

- Source-video status Query/facade/route runtime metadata now carries optional `repair_reason` for repaired read-model hits, while keeping `fallback_reason` for true fallback only.
- `AdminRuntimeEndpointMeta` and the Admin Web API client type preserve the optional field for diagnostics/history and later runtime sampling.
- Focused backend runtime/query/facade/route tests, Admin Web API client tests, typecheck, governance audit, governance audit tests, and `git diff --check` passed. R.214 does not complete Admin Architecture v1; it makes R.213 repair impact measurable without changing source-video rows or UI layout.

R.215 planned traceability:

- Requirement coverage: real/local/NAS performance evidence, runtime data-source observability, slow endpoint diagnostics, and no page-request full scan verification.
- Planned implementation boundary: extend the read-only Admin performance probe to preserve and summarize endpoint runtime metadata for actual data source, cache status, fallback reason, and repair reason.
- Non-goal and safety boundary: no mutating requests, no source manifest writes, no read-model rebuild/repair command, no background reconcile start/cancel, no Docker deployment, and no UI layout change.
- Professional review: Project Architect confirms this measures the read-model architecture directly without mixing local Mac, NAS Docker, or Windows runtime. Delivery Lead confirms it is safe as an acceptance-script/reporting slice with focused tests and optional GET-only live sampling.

R.215 implemented traceability:

- `scripts/acceptance/admin-real-nas-performance.ts` now records per-sample runtime metadata and summarizes actual data source, cache status, fallback reason, repair reason, and runtime slow reasons for each endpoint.
- The generated Markdown report includes `Runtime Source Summary`, `Runtime fallbacks`, and `Runtime repairs`, making read-model hit/fallback/repair behavior auditable without extra scans.
- Focused performance-probe tests, typecheck, governance audit, governance audit tests, and `git diff --check` passed.
- Best-effort local GET-only run generated `docs/acceptance/artifacts/admin-real-nas-performance-20260627T061456Z.json` and `.md`; it proves probe reachability/reporting/auth-boundary behavior, but protected endpoints returned `401` because local Admin auth was `password` and unauthenticated, so it does not prove protected endpoint performance.

R.216 planned traceability:

- Requirement coverage: read-only performance evidence quality, no hidden derived-store writes during acceptance sampling, runtime data-source observability, and preservation of normal Admin UI self-healing.
- Planned implementation boundary: add an explicit no-repair probe flag from the Admin HTTP route into the source-video read facade, and make `scripts/acceptance/admin-real-nas-performance.ts` send that marker on GET samples.
- Non-goal and safety boundary: no source manifest mutation, no ready asset mutation, no release/index/Cutter protocol change, no `admin.sqlite` schema change, no full reconcile, no Docker deployment, no UI layout change, and no disabling R.213 repair for normal Admin UI requests.
- Professional review: Project Architect confirms this keeps file facts, derived read-model repair, and measurement separate. Delivery Lead confirms it is safe as an additive request-scoped acceptance boundary with focused tests and no source-data writes.

R.216 implemented traceability:

- Source-video list routes now accept a request-scoped `disable_store_repair` flag, and the Admin HTTP server maps `X-MixLab-Admin-Read-Only-Probe: true` or `1` to that flag.
- The source-video read facade bypasses the bounded R.213 `admin.sqlite` repair wrapper only for no-repair probe requests. Normal Admin UI/page requests still repair missing derived status-store manifest rows and expose `repair_reason`.
- `scripts/acceptance/admin-real-nas-performance.ts` sends the no-repair probe header on all GET samples and records `sample_policy.read_only_probe: true` plus `sample_policy.disable_page_time_store_repair: true`.
- Focused route/facade/deps/server integration tests, performance-probe tests, typecheck, governance audit, governance audit tests, and `git diff --check` passed.
- Best-effort local probe generated `docs/acceptance/artifacts/admin-real-nas-performance-20260627T062803Z.json` and `.md`; it proves no-repair sample-policy reporting and auth-boundary behavior, but protected endpoints returned `401`, so it does not prove protected endpoint performance.

R.217 planned traceability:

- Requirement coverage: protected-endpoint performance evidence, local-vs-Docker boundary discipline, repeatable no-repair real-library sampling, and slow endpoint acceptance gates.
- Planned implementation boundary: add a runner that starts a temporary local Admin API on an isolated port with `MIXLAB_ADMIN_AUTH_MODE=disabled`, runs `admin-real-nas-performance.ts` with the R.216 no-repair header, archives wrapper evidence, and shuts the server down.
- Non-goal and safety boundary: no source manifest mutation, no ready asset mutation, no release/index/Cutter protocol change, no full reconcile, no scan/apply/publish/repair command, no worker start, no Docker deployment, and no replacement or killing of the user's existing `3889`/`5176` processes.
- Professional review: Project Architect confirms this keeps measurement separate from asset facts and Docker release. Delivery Lead confirms it improves repeatability of acceptance evidence with a temporary local service and focused tests.

R.217 implemented traceability:

- `scripts/acceptance/admin-real-nas-performance-isolated.ts` starts a temporary local Admin API on an isolated free port, forces `MIXLAB_ADMIN_AUTH_MODE=disabled`, points the server at the requested public-library root, runs the R.216 no-repair performance probe, archives wrapper evidence, and shuts the server down in `finally`.
- `scripts/acceptance/admin-real-nas-performance-isolated.test.ts` covers auth-disabled env construction, child JSON parsing, wrapper pass gates, and wrapper fail gates.
- `package.json` exposes `validate:admin-real-nas-performance-isolated`.
- The Admin HTTP server now suppresses runtime diagnostics history recording for read-only probe requests on source-video and slow-read route groups, while normal route requests still record diagnostics.
- Verification passed: isolated runner tests, performance probe tests, source-video facade/route/deps tests, `packages/admin-api/src/index.test.ts`, typecheck, redundancy governance audit, governance audit tests, and `git diff --check`.
- First real NAS isolated run `admin-real-nas-performance-isolated-20260627T064002Z` proved the safety boundary but failed performance because `operation_log` p95 was `3932.2ms`; this became the evidence-backed R.218 target.

R.218 planned traceability:

- Requirement coverage: route-local partial loading, slow endpoint protection, operation-log query performance, and no page request waiting indefinitely on NAS file I/O.
- Planned implementation boundary: keep `events.ndjson` as the operation-log audit fact source, but add an optional route read budget and short TTL cache so the Admin page route can return `warming` or cached data while background refresh completes.
- Non-goal and safety boundary: no audit-log migration, no historical log deletion/truncation, no source manifest mutation, no ready asset mutation, no release/index/Cutter protocol change, no Docker deployment, and no UI layout rewrite.
- Professional review: Project Architect confirms this is a Query API/read-path change rather than a Command/audit fact change. Delivery Lead confirms direct command/test reads remain exact by default and the bounded route behavior is covered by tests plus live NAS evidence.

R.218 implemented traceability:

- `packages/admin-api/src/admin-operation-log.ts` keeps exact full-file reads unless `max_wait_ms` is explicitly provided. When a route read exceeds the budget, it returns `read_mode: "warming"` and `complete: false`, while an in-flight refresh fills a short TTL cache for subsequent reads.
- `packages/admin-api/src/admin-read-model-routes.ts` applies `max_wait_ms: 750` and `cache_ttl_ms: 2000` only to `/api/admin/operation-log`.
- `packages/admin-api/src/admin-read-model-server-facade.ts` carries the optional route budget fields through the route dependency type.
- `packages/admin-api/src/admin-operation-log.test.ts` proves the slow-loader route behavior returns `warming` first and then serves the refreshed cached event.
- Verification passed: `admin-operation-log.test.ts`, `admin-read-model-routes.test.ts`, `admin-read-model-server-facade.test.ts`, `packages/admin-api/src/index.test.ts`, isolated performance tests, performance-probe tests, typecheck, redundancy governance audit, governance audit tests, and `git diff --check`.
- Real NAS isolated run `admin-real-nas-performance-isolated-20260627T064534Z` passed all wrapper gates. The child performance report `admin-real-nas-performance-20260627T064535Z` showed all `20` sampled endpoints succeeded, slow endpoint gates `0`, runtime repair endpoint count `0`, and `operation_log` p95 improved to `33.4ms`.
- Residual traceability risk: `preprocess_jobs` is still close to the `1000ms` route target at `914.6ms` p95, and `dashboard_metrics` remains a background-only cold sample around `2254ms`; both are passing but should guide the next performance architecture slice.

R.219 planned traceability:

- Requirement coverage: `/api/admin/preprocess/jobs` route performance, read-model bounded page reads, no wasted NAS/SQLite work on default queued pages, and continued separation between page queries and preprocessing commands.
- Planned implementation boundary: tighten `readAdminPreprocessJobManifestPageFromStore` so it only reads complete preprocess-job snapshots for ready rows that actually need ready completion timestamps. Queued, processing, failed, and index-required default list pages should not pay for full snapshot validation/query work that the list builder does not use.
- Non-goal and safety boundary: no preprocessing rerun, no worker lifecycle change, no source-video manifest mutation, no ready asset mutation, no release/index/Cutter protocol change, no NAS directory migration, no Docker deployment, and no UI rewrite.
- Professional review: Project Architect confirms this is a read-model query narrowing, not a cache-only workaround. Delivery Lead confirms it is safe if ready history pages still receive snapshots and the real NAS isolated performance gate stays green with runtime repair count `0`.

R.219 implemented traceability:

- `packages/admin-api/src/admin-read-model-store.ts` now filters preprocess-job snapshot lookups to ready rows only when serving bounded preprocess job pages from `admin.sqlite`.
- `packages/admin-api/src/admin-read-model-store.test.ts` proves non-ready default pages no longer return unused snapshots and ready history pages still receive ready snapshots.
- Verification passed: read-model store tests, preprocess job facade/service/query tests, `packages/admin-api/src/index.test.ts`, isolated performance tests, performance probe tests, typecheck, redundancy governance audit, governance audit tests, and `git diff --check`.
- Real NAS isolated run `admin-real-nas-performance-isolated-20260627T065244Z` passed all wrapper gates. The child performance report `admin-real-nas-performance-20260627T065244Z` showed all `20` sampled endpoints succeeded, slow endpoint gates `0`, runtime repair endpoint count `0`, and `preprocess_jobs` p95 improved from R.218 `914.6ms` to `508.6ms`.
- Residual traceability risk: `dashboard_metrics` remains a background-only cold path around `2320.7ms`, and the preprocess job route still needs finer subcomponent runtime metadata in a later observability slice.

R.220 planned traceability:

- Requirement coverage: Dashboard background loading, slow endpoint observability, Admin Query/read-model provenance, and evidence-led performance optimization.
- Planned implementation boundary: add component-level timing/provenance for the Dashboard metrics cold miss path, covering material summary, transcript metrics, production/job summary, usage projection, runtime load, current index/library status, and cache behavior where those components are available in the existing query pipeline.
- Non-goal and safety boundary: no Dashboard data contract removal, no UI redesign, no source-video/preprocess/release/index mutation, no usage-events format change, no read-model rebuild policy change, no worker behavior change, no NAS Docker deployment, no live NAS data mutation, and no Cutter release/index/search protocol change.
- Professional review: Project Architect confirms the next step must explain which Dashboard subcomponent is cold before changing query strategy. Delivery Lead confirms R.220 is safe as a read-only metadata/evidence slice if response `data` remains compatible and the isolated no-repair real NAS probe still passes.

R.220 implemented traceability:

- `AdminRuntimeEndpointMeta` now supports optional `components` timing metadata, and Dashboard metrics cache/query/facade/slow-read routes pass component timings without changing response `data`.
- The real NAS performance probe now summarizes runtime component timings in Markdown and JSON.
- Verification passed: focused runtime/dashboard/slow-route/report tests, dashboard service/deps tests, `packages/admin-api/src/index.test.ts`, performance probe tests, and typecheck.
- Real NAS isolated run `admin-real-nas-performance-isolated-20260627T070458Z` passed all wrapper gates. The child report `admin-real-nas-performance-20260627T070459Z` shows `dashboard_metrics` cold p95 `2329.1ms` and identifies `production_summary` as the dominant component at about `1732ms`.
- Residual traceability risk: R.220 is explanatory only. It proves the next optimization target should be production-summary aggregation, not generic Dashboard caching or frontend loading changes.

R.221 planned traceability:

- Requirement coverage: Dashboard read-model query performance, background Dashboard loading, and evidence-led slow component remediation.
- Planned implementation boundary: replace `readDashboardProductionSummaryFromTable` row materialization with a single SQLite aggregate over `preprocess_job_status`, preserving complete-snapshot guards and the existing public summary shape.
- Non-goal and safety boundary: no schema migration, no source-video/preprocess/release/index mutation, no worker behavior change, no read-model rebuild policy change, no Docker deployment, no live NAS writes, and no Cutter protocol change.
- Professional review: Project Architect confirms R.221 addresses the measured dominant cold component. Delivery Lead confirms the change remains read-only for dashboard queries and must be verified by store tests plus an isolated no-repair real NAS run.

R.221 implemented traceability:

- `readDashboardProductionSummaryFromTable` now computes completed-today, failed-today, and average process duration through SQLite aggregation instead of loading all `preprocess_job_status` rows into JavaScript.
- Verification passed: read-model store tests, dashboard metrics/read facade/service tests, `packages/admin-api/src/index.test.ts`, performance probe tests, and typecheck.
- Real NAS isolated run `admin-real-nas-performance-isolated-20260627T070736Z` passed all wrapper gates. The child report `admin-real-nas-performance-20260627T070736Z` improved `dashboard_metrics` cold p95 from R.220 `2329.1ms` to `1945.7ms` and reduced `production_summary` from about `1732ms` to about `1358ms`.
- Residual traceability risk: the dominant remaining cold cost is still production summary over the complete job snapshot table, so future store metadata work is justified.

R.222 planned traceability:

- Requirement coverage: Dashboard read-model bounded reads, future cold-start reduction after read-model rebuild, and compatibility for older stores.
- Planned implementation boundary: materialize date-independent `dashboard_production_average_video_process_ms` metadata during complete preprocess-job snapshot writes; keep today's completed/failed counts date-sensitive and keep R.221 aggregate as fallback for stores without the new metadata.
- Non-goal and safety boundary: no forced real NAS rebuild, no source data writes, no release/index mutation, no worker behavior change, no Docker deployment, and no Cutter protocol change.
- Professional review: Project Architect confirms only the average is safe to materialize because today's counts are date-dependent. Delivery Lead confirms the read-only live probe can prove compatibility but not final speed until a gated read-model rebuild produces the new metadata.

R.222 implemented traceability:

- Complete preprocess-job snapshot writes now store Dashboard production average metadata; incomplete snapshot state deletes it.
- `readAdminDashboardProductionSummaryFromStore` uses the metadata average when present and falls back to the R.221 aggregate for older stores.
- `packages/admin-api/src/admin-read-model-store.test.ts` proves Dashboard production average can be served from metadata after complete snapshot rebuild.
- Verification passed: read-model store tests, dashboard metrics/read facade/service tests, `packages/admin-api/src/index.test.ts`, typecheck, and a compatibility real NAS isolated performance run.
- Real NAS isolated run `admin-real-nas-performance-isolated-20260627T071153Z` passed all wrapper gates with runtime repair endpoint count `0`. Because the existing NAS `admin.sqlite` was not rebuilt, the child report still uses compatibility fallback and shows `production_summary` around `1357ms`; final metadata-speed evidence requires a future gated read-model rebuild.

R.223 planned traceability:

- Requirement coverage: real NAS derived read-model rebuild evidence, Dashboard production metadata materialization, post-rebuild invariants, and no-hidden-page-rebuild discipline.
- Planned implementation boundary: use the existing GET-only rebuild plan gate, then the explicit reconcile runner with allow/force flags, then the isolated no-repair performance probe. Only `.mixlab-library/admin-read-model/` and operation-log evidence are allowed to change.
- Non-goal and safety boundary: no source-video manifests, library counts, release/index artifacts, Cutter protocol data, Docker containers, workers, NAS layout, or page-open hidden rebuilds.
- Professional review: Project Architect confirms this validates the read-model projection layer instead of changing business facts. Delivery Lead confirms execution must be gated by before/after invariants and post-run performance evidence.

R.223 implemented traceability:

- Data-safety proof: `admin-read-model-reconcile-20260627T072140Z` rebuilt the derived `admin.sqlite` projection from `11394` source-video manifests and `11394` preprocess job snapshots. Protected invariants passed: total `11394`, ready `10471`, `library.updated_at=2026-06-25T19:07:13.162Z`, current index `v010471`, read model `fresh`, safe for page request `true`, scan mode `no-scan`.
- Metadata proof: a direct read-only SQLite check after reconcile confirmed `dashboard_production_average_video_process_ms=24170`, proving R.222 metadata is now present in the real NAS store.
- Acceptance caveat: the explicit reconcile artifact is not fully green because post probes for `source_videos_queued` and `preprocess_jobs` timed out after the action had already succeeded. This is tracked as a script/probe hardening gap, not as a failed data-safety invariant.
- Stable follow-up proof: `admin-read-model-rebuild-plan-20260627T073149Z` passed after the rebuild and reported `ready` / `no-op`; `admin-real-nas-performance-isolated-20260627T072941Z` passed with child performance report `admin-real-nas-performance-20260627T072942Z`.
- Performance proof: post-rebuild route gates passed (`source_videos_queued` cold `187.9ms`, `preprocess_jobs` cold `493.9ms`, `index_versions` cold `282.7ms`), but Dashboard `production_summary` remained high at `1315ms`; therefore R.224 must continue optimizing Dashboard production summary rather than declaring the Dashboard cold path complete.

R.224 planned traceability:

- Requirement coverage: Admin read-model performance lane, Dashboard cold cache-miss path, no page-time NAS full scans, and accurate runtime component observability.
- Planned implementation boundary: optimize or materialize the remaining production-summary counters behind `readDashboardProductionSummaryFromTable`; preserve old-store compatibility fallback; avoid frontend-only workarounds.
- Non-goal and safety boundary: no source manifests, no release/index data, no Cutter protocol changes, no worker execution, no Docker upload.
- Professional review: Project Architect confirms the evidence points to the Dashboard production summary query layer, not UI loading. Delivery Lead confirms acceptance must include focused tests plus a new isolated real NAS performance artifact comparing against R.223 `production_summary=1315ms`.

R.224 implemented traceability:

- Implementation proof: `readDashboardProductionSummaryFromTable` now uses indexed ISO date-range counts for `completed_today_count` and `failed_today_count`; completed rows are counted through a `UNION` over `completed_at` and `indexed_at` so rows with both timestamps on the same day are not double-counted.
- Compatibility proof: `dashboard_production_average_video_process_ms` metadata remains the fast path for average duration, while old stores still fall back to the aggregate average query. The change does not require a NAS rebuild and does not mutate source manifests, release/index data, Cutter protocol data, worker state, or Docker.
- Test proof: `packages/admin-api/src/admin-read-model-store.test.ts` covers metadata-average behavior and date-range counting semantics. Focused dashboard/index tests and full TypeScript typecheck passed.
- Real NAS proof: `admin-real-nas-performance-isolated-20260627T073703Z` passed; child report `admin-real-nas-performance-20260627T073704Z` showed Dashboard cold `1891.6ms -> 925.0ms` and `production_summary 1315ms -> 345ms` compared with R.223. Route gates stayed under target: `source_videos_queued 184.5ms`, `preprocess_jobs 476.1ms`, `index_versions 216.3ms`.
- Remaining gap: Dashboard cold path is now under the background budget and below the original 1.5s target, but `production_summary` still costs `345ms` and `runtime_load` costs `261ms`. Further optimization should be evidence-led and should not displace the planned R.225 operator diagnostics/slow-route visibility slice unless a stricter Dashboard cold target is adopted.

R.225 planned traceability:

- Requirement coverage: slow endpoint observability, route-owned Doctor loading, Admin Web production-console information architecture, and no-scan read-model-backed diagnostics history.
- Planned implementation boundary: connect the existing `GET /api/admin/runtime/diagnostics/history` Query API to the System Check page through typed Admin Web client methods, route-local loading/error state, UI contract updates, and browser QA.
- Non-goal and safety boundary: no source manifests, no release/index data, no read-model reconcile, no worker execution, no Docker upload, no Cutter protocol changes, and no Dashboard micro-optimization in this slice.
- Professional review: Project Architect confirms this surfaces architecture evidence before additional optimization decisions. Delivery Lead confirms it is safe as read-only Web/API wiring and any diagnostics-history failure must remain local to the System Check route.

R.225 implemented traceability:

- API/UI proof: `apps/admin-web/src/api.ts` now exposes `getRuntimeDiagnosticsHistory({ limit })`, fixture data includes bounded runtime diagnostics samples, and `AdminApp` loads the history only on the `doctor` route with local loading/error state.
- Console proof: `DoctorPage` now shows a `慢接口历史` surface with recent sample count, slow count, fallback/repair count, malformed-line tolerance, endpoint, duration, source/scan, cache state, reason, and component timing. The Inspector also summarizes the newest sample and page contract.
- Contract proof: `packages/admin-api/src/admin-data-loading-plan.ts`, fixture data-loading plan, and `apps/admin-web/src/features/admin-ui-contract.ts` now list `/api/admin/runtime/diagnostics/history` as a Doctor route-owned, `admin-read-model`, `no-scan`, `runtime-diagnostics-history-v1` read.
- Browser proof: `admin-doctor-browser-qa-20260627T075719Z` passed desktop and mobile fixture routes, including `runtime-diagnostics-visible`, no console errors, no failed Admin API requests, and no horizontal overflow.
- Verification passed: focused Admin Web/API/contract/data-loading/Doctor QA tests, `npm run typecheck -- --pretty false`, and the fixture browser QA against `http://127.0.0.1:5191/#/doctor`.
- Remaining gap: R.225 surfaces existing diagnostics history but does not broaden runtime metadata coverage beyond currently instrumented endpoint families, does not optimize remaining Dashboard components, and does not advance Docker release promotion.

R.226 planned traceability:

- Requirement coverage: Phase 4 production-console page information architecture, shared Inspector semantics, route-local loading/error clarity, and Phase 5 cleanup readiness.
- Planned implementation boundary: add shared page-contract Inspector groups to `总览`, `预处理`, `保护中心`, and `操作记录` without changing route loading behavior, Admin API shapes, command behavior, or page workflows.
- Non-goal and safety boundary: no NAS source manifest writes, no release/index mutation, no read-model reconcile, no worker execution, no Docker upload, no Cutter protocol change, no visual redesign beyond Inspector content consistency, and no broad CSS cleanup.
- Professional review: Project Architect confirms R.226 is an IA/contract stabilization slice, not a substitute for performance/read-model work. Delivery Lead confirms it is safe only if tests and fixture browser QA prove the added UI contract text without API, NAS, Docker, or Cutter changes.

R.226 implemented traceability:

- `DashboardPage`, `PreprocessJobsPage`, `ProtectionCenterPage`, and `OperationLogPage` now render shared `页面契约` Inspector groups describing main work area, support area, data source, scan mode, loading/command boundary, and error boundary.
- `apps/admin-web/src/admin-app.test.ts` proves the four routes expose the expected page-contract rows while preserving existing production-console and route-owned loader tests.
- Browser proof: `admin-production-console-inspector-consistency-20260627T080955Z` passed isolated fixture browser QA for `dashboard`, `preprocess-jobs`, `protection`, and `operation-log` on desktop and mobile, with no horizontal overflow, no console errors, and no failed API requests.
- Verification passed: focused Admin Web render/contract tests, protection/process-history QA gate tests, `npm run typecheck -- --pretty false`, and fixture browser QA against `http://127.0.0.1:5192`.
- Remaining gap: R.226 improves visible IA contracts but does not add live NAS proof for these four routes, does not implement deeper interaction contracts, does not perform redundancy cleanup, and does not advance Docker release promotion.

R.227 planned traceability:

- Requirement coverage: Phase 5 redundant-code governance, fixture/fallback/legacy hotspot ownership, and anti-blind-deletion safety.
- Planned implementation boundary: add a classification script and test that scan current Admin/library sources, categorize term hotspots, emit JSON/Markdown acceptance artifacts, and keep broad cleanup blocked until removable candidates receive line-level proof.
- Non-goal and safety boundary: no fallback deletion, no runtime behavior change, no CSS cleanup, no large-file split, no NAS mutation, no read-model reconcile, no worker execution, no Docker upload, and no Cutter protocol change.
- Professional review: Project Architect confirms classification is required before any cleanup because fixture/fallback terms include required compatibility paths. Delivery Lead confirms the slice is safe only as evidence-only tooling, tests, and docs.

R.227 implemented traceability:

- `scripts/acceptance/admin-fallback-governance-classification.ts` now classifies `fixture/fallback/legacy/mock/deprecated/TODO` hotspots as `test-fixture`, `fixture-runtime-boundary`, `safe-fallback`, `legacy-compatibility`, or `removable-candidate`, and records required evidence for any future cleanup.
- `scripts/acceptance/admin-fallback-governance-classification.test.ts` proves conservative category assignment, `cleanup_allowed:false`, broad cleanup blocking, and Markdown evidence wording.
- Artifact proof: `admin-fallback-governance-classification-20260627T081546Z` scanned `293` files and classified `28` hotspots: `14` test fixtures, `6` fixture runtime boundaries, `5` safe fallbacks, `1` legacy compatibility path, and `2` removable candidates.
- Verification passed: fallback-governance tests, existing redundancy-governance tests, existing CSS-governance tests, and `npm run typecheck -- --pretty false`.
- Remaining gap: R.227 does not delete the two removable candidates and does not reduce CSS duplicate counts. R.228 must choose one candidate at a time, write owner/replacement proof, then run focused tests plus browser/API QA when user-facing.

R.228 planned traceability:

- Requirement coverage: Phase 5 fallback governance, source-video read-model observability, and anti-blind-deletion safety for the two R.227 removable candidates.
- Planned implementation boundary: inspect the backend/frontend source-video fallback reason paths, use existing source-video Query/API/Admin Web tests as ownership evidence, then reclassify the files if they are observability contracts rather than dead code.
- Non-goal and safety boundary: no fallback field removal, no UI diagnostic removal, no source-video query behavior change, no NAS mutation, no read-model reconcile, no worker execution, no Docker upload, no Cutter protocol change, no CSS cleanup, and no large-file split.
- Professional review: Project Architect confirms `fallback_reason` belongs to the Query/read-model observability lane. Delivery Lead confirms the slice is safe only as classification tooling, tests, docs, and artifact refresh.

R.228 implemented traceability:

- `scripts/acceptance/admin-fallback-governance-classification.ts` now classifies `packages/admin-api/src/admin-source-video-status-page-query.ts` and `apps/admin-web/src/features/source-videos/SourceVideosPage.tsx` as `safe-fallback`, because backend `fallback_reason` emission and frontend Chinese fallback diagnostics are tested operator observability contracts.
- Existing source-video tests prove the ownership: backend Query/API paths emit and forward `fallback_reason`; Admin Web renders `读模型回退` and `原因：读模型过期` instead of leaking raw `status-store:*` strings.
- Artifact proof: `admin-fallback-governance-classification-20260627T082053Z` scanned `293` files and classified `28` hotspots as `14` test fixtures, `6` fixture runtime boundaries, `7` safe fallbacks, `1` legacy compatibility path, and `0` removable candidates.
- Verification passed: fallback-governance tests, source-video Query/API/Admin Web tests (`81` tests), existing redundancy/CSS governance tests (`6` tests), and `npm run typecheck -- --pretty false`.
- Remaining gap: R.228 closes the fallback-deletion candidate list but does not reduce CSS duplicate selectors or large-file candidates. Future cleanup should not delete fixture/runtime/safe-fallback/legacy paths without new replacement evidence.

R.229 planned traceability:

- Requirement coverage: Phase 5 CSS redundancy governance, using the R.132/R.133 rule that same-file `styles.css` cleanup must be one selector group at a time with line-level ownership, tests, regenerated governance evidence, and browser QA.
- Planned implementation boundary: remove only the earlier exact duplicate `.admin-confirm-dialog footer` rule in `apps/admin-web/src/styles.css`, retain the later canonical rule, and verify Cutter Users confirmation-dialog behavior because that route owns destructive confirmation dialogs.
- Non-goal and safety boundary: no reference-layer deletion, no broad CSS cleanup, no shell/sidebar/table/inspector redesign, no Admin API change, no NAS mutation, no read-model reconcile, no worker execution, no Docker upload, and no Cutter protocol change.
- Professional review: Project Architect confirms this is a narrowly scoped redundancy-governance slice, not UI polish or a substitute for the full Admin Architecture v1 goal. Delivery Lead confirms acceptance requires focused tests, regenerated CSS governance artifacts, desktop/mobile browser proof, typecheck, and targeted whitespace/diff checks.

R.229 implemented traceability:

- `apps/admin-web/src/styles.css` now keeps only the later canonical `.admin-confirm-dialog footer` rule at `apps/admin-web/src/styles.css:5252`; the removed earlier block had the same declarations and no unique ownership.
- Artifact proof: `admin-css-governance-classification-20260627T082531Z` reports `333` duplicate selector groups, `201` reference-layer overlaps, `131` same-file `styles.css` legacy duplicates, and `1` reference-internal duplicate; broad cleanup remains blocked with `cleanup_allowed:false`.
- Browser proof: `admin-confirm-dialog-css-cleanup-20260627T0828Z` validates the Cutter Users destructive confirmation dialog on desktop and mobile. The computed footer contract remains `display:flex`, `justify-content:flex-end`, and `gap:8px`; `取消` and `确认停用` remain visible; no horizontal overflow is present.
- Verification passed: Admin Web focused tests and UI contract/CSS governance tests (`64` tests), CSS governance artifact regeneration, and `npm run typecheck -- --pretty false`.
- Remaining gap: R.229 reduces same-file CSS duplicate debt by one selector but does not authorize broad CSS deletion, reference-layer cleanup, fixture/fallback removal, large-file extraction, Docker promotion, or any NAS/Cutter protocol changes.

R.230 planned traceability:

- Requirement coverage: Phase 5 large-file governance and Admin Web API layering. This slice separates transport/envelope plumbing from the domain/page client methods that still live in `apps/admin-web/src/api.ts`.
- Planned implementation boundary: add `apps/admin-web/src/admin-http.ts`, add focused helper tests, update `apps/admin-web/src/api.ts` to import/re-export the helper contract, and regenerate redundancy governance evidence.
- Non-goal and safety boundary: no endpoint path change, no request method change, no response envelope change, no fixture data/model change, no dashboard loading strategy change, no UI render change, no backend Admin API change, no NAS mutation, no Docker upload, and no Cutter protocol change.
- Professional review: Project Architect confirms this is a prerequisite for route-owned Admin Web API client slices. Delivery Lead confirms the slice is accepted only with public import compatibility, direct HTTP helper tests, existing API/App tests, redundancy audit evidence, typecheck, and targeted hygiene checks.

R.230 implemented traceability:

- `apps/admin-web/src/admin-http.ts` owns Admin Web HTTP/envelope helpers: `unwrapAdminResponse`, `unwrapAdminResponseWithMeta`, `joinUrl`, `listQuery`, `getJson`, `getJsonWithMeta`, `sendJson`, `deleteJson`, and `adminAuthHeaders`.
- `apps/admin-web/src/admin-http.test.ts` directly covers envelope unwrap errors, response meta preservation, URL/query/header generation, and GET/POST/PATCH/DELETE JSON transport behavior.
- `apps/admin-web/src/api.ts` imports the helpers and continues to re-export `unwrapAdminResponse`, preserving existing imports and client behavior. Line-anchor evidence in `admin-web-http-foundation-extraction-20260627T0834Z` records `createAdminApiClient` moving from line `1679` to `1573` and `loadAdminDashboardData` from line `2879` to `2773`; older audit artifact line counts are not used as a direct baseline because the worktree contains earlier uncommitted slices.
- Artifact proof: `admin-redundancy-governance-audit-20260627T083347Z` scans `295` files, reports current `api.ts` audit line count `2836`, `19` large-file candidates, and keeps `cleanup_allowed:false`.
- Verification passed: Admin Web HTTP/API/App tests (`89` tests), redundancy governance tests (`3` tests), redundancy governance artifact generation, and `npm run typecheck -- --pretty false`.
- Remaining gap: R.230 does not yet split real Admin Web client method groups by route/domain or split fixture client state by feature. It does not change route-loader architecture, read-model querying, protection writes, CSS cleanup, Docker promotion, NAS data, or Cutter protocols.

R.231 planned traceability:

- Requirement coverage: Phase 5 large-file governance and Admin Web API layering. This slice proves the R.230 HTTP foundation can support a real route/domain client method group without changing the public `AdminApiClient` contract.
- Planned implementation boundary: add `apps/admin-web/src/admin-auth-client.ts`, add focused auth-client tests, update `apps/admin-web/src/api.ts` to compose auth methods from the new module, and regenerate redundancy governance evidence.
- Non-goal and safety boundary: no login UI change, no backend auth change, no endpoint path change, no request method/header/body change, no session storage change, no fixture auth behavior change, no dashboard loading strategy change, no NAS mutation, no Docker upload, and no Cutter protocol change.
- Professional review: Project Architect confirms auth is a clear first domain boundary for real-client extraction. Delivery Lead confirms the slice is accepted only with endpoint/method/header/body parity tests, existing API/App tests, redundancy audit evidence, typecheck, and targeted hygiene checks.

R.231 implemented traceability:

- `apps/admin-web/src/admin-auth-client.ts` owns the real Admin Web auth client methods: `getAuthBootstrap`, `getAuthStatus`, `registerAdmin`, `loginAdmin`, and `logoutAdmin`.
- `apps/admin-web/src/admin-auth-client.test.ts` proves auth endpoint paths, methods, session-header behavior, and request bodies remain unchanged.
- `apps/admin-web/src/api.ts` composes `createAdminAuthClientMethods(...)` into `createAdminApiClient(...)`, preserving the public `AdminApiClient` interface, fixture auth behavior, and session signal binding.
- Artifact proof: `admin-web-auth-client-boundary-20260627T0856Z` records `api.ts` audit line count moving from R.230's `2836` to `2814`; `admin-redundancy-governance-audit-20260627T085521Z` scans `297` files, reports `19` large-file candidates, and keeps `cleanup_allowed:false`.
- Verification passed: Admin Web auth/http/API/App tests (`90` tests), redundancy governance tests (`3` tests), redundancy governance artifact generation, and `npm run typecheck -- --pretty false`.
- Remaining gap: R.231 only extracts auth. Non-auth real client method groups and fixture client state still need route/domain extraction before the Admin Web API layer is properly modular.

R.232 planned traceability:

- Requirement coverage: Phase 5 large-file governance and Admin Web API layering for the source-video domain, which is central to slow lists and later read-model/query acceptance.
- Planned implementation boundary: add `apps/admin-web/src/admin-source-video-client.ts`, add `apps/admin-web/src/admin-source-video-media.ts`, add focused source-video client/media tests, update `apps/admin-web/src/api.ts` to compose source-video methods from the new module, and regenerate redundancy governance evidence.
- Non-goal and safety boundary: no backend source-video API change, no endpoint path change, no request method/header/body change, no response envelope change, no fixture source-video behavior change, no source-video page UI change, no read-model schema change, no NAS mutation, no Docker upload, and no Cutter protocol change.
- Professional review: Project Architect confirms source-video is the right next real-client domain because it supports slow-list/read-model evolution. Delivery Lead confirms the slice is accepted only with endpoint/query/method/header/body/media-resolution parity tests, existing API/App tests, redundancy audit evidence, typecheck, and targeted hygiene checks.

R.232 implemented traceability:

- `apps/admin-web/src/admin-source-video-client.ts` owns the real Admin Web source-video client methods: `listSourceVideos`, `listSourceVideosWithRuntime`, `getSourceVideoDetail`, `queueSourceVideo`, `retrySourceVideo`, `recoverProcessingSourceVideo`, `publishSourceVideo`, `updateSourceVideoMetadata`, and `updateSourceVideoCover`.
- `apps/admin-web/src/admin-source-video-media.ts` owns `resolveMediaUrl`, `resolveSourceVideoMedia`, and `resolveSourceVideoDetailMedia`; `api.ts` continues to re-export `resolveMediaUrl`.
- `apps/admin-web/src/admin-source-video-client.test.ts` proves source-video list query params, runtime meta, media URL safety, detail cover URL resolution, command endpoints, metadata/cover bodies, and session-header behavior remain unchanged.
- Artifact proof: `admin-web-source-video-client-boundary-20260627T0904Z` records `api.ts` audit line count moving from R.231's `2814` to `2685`; `admin-redundancy-governance-audit-20260627T090312Z` scans `300` files, reports `19` large-file candidates and `28` term hotspots, and keeps `cleanup_allowed:false`.
- Verification passed: Admin Web source-video/auth/http/API/App tests (`93` tests), redundancy governance tests (`3` tests), redundancy governance artifact generation, and `npm run typecheck -- --pretty false`.
- Remaining gap: R.232 does not implement new backend read-model queries or change route-loader behavior. It creates the front-end API boundary needed before larger source-video performance/read-model acceptance work.

R.233 planned traceability:

- Requirement coverage: Phase 5 large-file governance and Admin Web API layering for slow-page operations entrypoints, preparing route-loader/read-model acceptance without changing backend query behavior.
- Planned implementation boundary: add `apps/admin-web/src/admin-operations-client.ts`, add `apps/admin-web/src/admin-operations-client.test.ts`, update `apps/admin-web/src/api.ts` to compose operations methods from the new module, and regenerate redundancy governance evidence.
- Non-goal and safety boundary: no backend Admin API route change, no endpoint path change, no request method/header/body change, no response envelope change, no fixture client state split, no page UI change, no read-model schema change, no NAS mutation, no Docker upload, and no Cutter protocol change.
- Professional review: Project Architect confirms slow-page operations are the correct next client boundary before route-loader/read-model acceptance. Delivery Lead confirms the slice is accepted only with endpoint/method/header/body/query parity tests, existing API/App tests, redundancy audit evidence, and typecheck.

R.233 implemented traceability:

- `apps/admin-web/src/admin-operations-client.ts` owns the real Admin Web operations/preprocess/settings/read-model/system client methods for slow-page entrypoints outside the large `api.ts` assembly.
- `apps/admin-web/src/api.ts` composes `createAdminOperationsClientMethods(...)` inside `createAdminApiClient(...)`, preserving the public `AdminApiClient` interface, AbortSignal binding, fixture state, source-video methods, and cutter-user methods.
- `apps/admin-web/src/admin-operations-client.test.ts` proves operations endpoint paths, methods, session headers, default preprocess limits, process-history query filtering, runtime diagnostics query params, settings/source-folder bodies, and supervisor command body behavior.
- Artifact proof: `admin-web-operations-client-boundary-20260627T091231Z` records `api.ts` audit line count moving from R.232's `2685` to `2480`; `admin-redundancy-governance-audit-20260627T091206Z` scans `302` files, reports `19` large-file candidates and `28` term hotspots, and keeps `cleanup_allowed:false`.
- Verification passed: Admin Web operations/source-video/auth/http/API/App tests (`95` tests), redundancy governance tests (`3` tests), redundancy governance artifact generation, and `npm run typecheck -- --pretty false`.
- Remaining gap: R.233 does not implement backend read-model query changes or route-loader behavior. It creates the front-end slow-page API boundary needed before larger route-loader/read-model acceptance work.

R.234 planned traceability:

- Requirement coverage: Phase 3 Query API/read-model observability for the named `preprocess/jobs` slow endpoint.
- Planned implementation boundary: update `packages/admin-api/src/admin-preprocess-jobs-read-facade.ts` to collect component timings, update `packages/admin-api/src/admin-slow-read-routes.ts` to pass them to `meta.runtime.components`, add focused tests, regenerate governance evidence, and record acceptance artifacts.
- Non-goal and safety boundary: no query semantics change, no API `data` shape change, no read-model schema change, no NAS mutation, no Docker upload, no Worker behavior change, no Cutter release/index/search protocol change, and no UI layout change.
- Professional review: Project Architect confirms this is the right evidence-led follow-up to R.219. Delivery Lead confirms it is safe because it only adds optional response meta and is covered by route/facade/runtime/performance-contract tests.

R.234 implemented traceability:

- `packages/admin-api/src/admin-preprocess-jobs-read-facade.ts` returns `component_timings` for `concurrency_policy`, `library_counts`, `preprocess_job_page`, `manifest_fallback`, `job_record_supplement`, and `runtime_load`.
- `packages/admin-api/src/admin-slow-read-routes.ts` includes those timings in `/api/admin/preprocess/jobs` `meta.runtime.components`.
- `packages/admin-api/src/admin-preprocess-jobs-read-facade.test.ts` proves paged read-model and unpaged manifest fallback component contracts.
- `packages/admin-api/src/admin-slow-read-routes.test.ts` proves route-level `meta.runtime.components` passthrough without changing response data.
- Artifact proof: `admin-preprocess-jobs-runtime-components-20260627T092256Z` records component contracts and anchors; `admin-redundancy-governance-audit-20260627T092234Z` keeps `cleanup_allowed:false`.
- Verification passed: focused facade/route tests (`8` tests), broader backend tests (`88` tests), performance-probe contract tests (`6` tests), redundancy governance tests (`3` tests), redundancy governance artifact generation, and `npm run typecheck -- --pretty false`.
- Remaining gap: R.234 does not capture live NAS runtime component samples and does not optimize any component. It provides the evidence surface needed for the next live performance or query optimization slice.

R.235 planned traceability:

- Requirement coverage: Phase 3 Query API/read-model observability for the named `index/versions` slow endpoint.
- Planned implementation boundary: update `packages/admin-api/src/admin-index-versions-query.ts` to collect component timings, update `packages/admin-api/src/admin-slow-read-routes.ts` to pass them to `meta.runtime.components`, add focused tests, regenerate governance evidence, and record acceptance artifacts.
- Non-goal and safety boundary: no query semantics change, no cache TTL change, no API `data` shape change, no index repair/publish behavior change, no NAS mutation, no Docker upload, no Worker behavior change, no Cutter release/index/search protocol change, and no UI layout change.
- Professional review: Project Architect confirms this is the right evidence-led follow-up for a historical index-version directory traversal bottleneck. Delivery Lead confirms it is safe because it only adds optional response meta and is covered by query/route/index/API/performance-contract tests.

R.235 implemented traceability:

- `packages/admin-api/src/admin-index-versions-query.ts` returns `component_timings` for `current_pointer_fast_page`, `directory_listing`, `current_pointer_validation`, `index_package_validation`, `cache_lookup`, and `pending_wait`.
- `packages/admin-api/src/admin-slow-read-routes.ts` includes those timings in `/api/admin/index/versions` `meta.runtime.components`.
- `packages/admin-api/src/admin-index-versions-query.test.ts` proves directory-page, current-pointer fast path, and cache-hit component contracts.
- `packages/admin-api/src/admin-slow-read-routes.test.ts` proves route-level `meta.runtime.components` passthrough without changing response data.
- Artifact proof: `admin-index-versions-runtime-components-20260627T092909Z` records component contracts and anchors; `admin-redundancy-governance-audit-20260627T092843Z` keeps `cleanup_allowed:false`.
- Verification passed: focused query/route tests (`12` tests), broader backend tests (`89` tests), performance-probe contract tests (`6` tests), redundancy governance tests (`3` tests), redundancy governance artifact generation, and `npm run typecheck -- --pretty false`.
- Remaining gap after R.236: the live GET-only default-page component proof is now captured, but source-video component timings, route-loader refactoring, Docker gates, and deeper read-model optimization remain open.

R.236 planned traceability:

- Requirement coverage: close the R.234/R.235 live-style GET-only component evidence gap without mutating NAS data or changing query semantics.
- Planned implementation boundary: strengthen the real NAS performance probe to preserve component scan-mode details and fail on missing required components, strengthen the isolated runner to gate those contracts, and fix only any response-meta passthrough gap discovered by the new evidence.
- Non-goal and safety boundary: no source-video manifest writes, no scan apply, no read-model reconcile start/cancel, no worker execution, no Docker deployment, no UI layout change, no Cutter protocol change, and no optimization based on incomplete evidence.
- Professional review: Project Architect confirms the slice keeps optimization evidence-led; Delivery Lead confirms the temporary auth-disabled local API plus read-only probe headers are safe for GET-only sampling.

R.236 implemented traceability:

- `scripts/acceptance/admin-real-nas-performance.ts` now extracts component `scan_mode` and `scan_reason`, summarizes them in Runtime Component Timing Summary, and writes `runtime_component_contracts` for required slow-endpoint component gates.
- `scripts/acceptance/admin-real-nas-performance-isolated.ts` now fails the isolated no-repair probe when required component contracts are missing.
- `packages/admin-api/src/admin-slow-read-route-deps.ts` now preserves `preprocess_jobs` `component_timings` between the facade wrapper and `handleAdminSlowReadRoutes`.
- Tests prove route-deps passthrough, route-level runtime components, performance Markdown fields, required component gates, and isolated-runner blocking behavior.
- Artifact proof: `admin-real-nas-performance-isolated-20260627T093828Z` passed with `20` endpoints, `0` failed samples, `0` slow endpoint gates, `0` runtime repair endpoints, and `0` runtime component contract failures. The child performance artifact `admin-real-nas-performance-20260627T093828Z` shows `preprocess_jobs` p95 `490.8ms` with `concurrency_policy`, `library_counts`, `preprocess_job_page`, and `runtime_load`, plus `index_versions` p95 `229.0ms` with `current_pointer_fast_page`, `index_package_validation`, and `cache_lookup`.
- Remaining gap: R.236 proves these default-page component contracts but does not complete all query paths, source-video component timing, route-loader restructuring, UI IA, Docker release, or full Admin Architecture v1.

R.237 planned traceability:

- Requirement coverage: use R.236 component evidence to improve the shared runtime telemetry Query boundary for `preprocess/jobs` and Dashboard without changing asset truth or response semantics.
- Planned implementation boundary: add short TTL, per-library runtime-load caching and pending coalescing at `createAdminDashboardReadFacade`, plus focused tests and isolated GET-only performance proof.
- Non-goal and safety boundary: no source-video manifest writes, no library/read-model row caching beyond runtime telemetry, no command result caching, no scan/reconcile/worker execution, no Docker deployment, no UI layout change, and no Cutter protocol change.
- Professional review: Project Architect confirms the slice uses component evidence instead of page-level patching; Delivery Lead confirms it is safe because cache TTL is short and scoped to runtime telemetry while the first read remains a real system probe.

R.237 implemented traceability:

- `packages/admin-api/src/admin-dashboard-read-facade.ts` now exports `ADMIN_RUNTIME_LOAD_CACHE_TTL_MS = 2000` and wraps `read_runtime_load_metrics` with per-library TTL caching and pending read coalescing.
- `clear_dashboard_metrics_cache(...)` now clears both dashboard metrics cache and runtime-load telemetry cache so test/reload boundaries remain explicit.
- `packages/admin-api/src/admin-dashboard-read-facade.test.ts` proves pending coalescing, TTL hit, TTL expiry, per-library isolation, and clear behavior.
- Artifact proof: `admin-runtime-load-telemetry-cache-20260627T0945Z` records the before/after evidence. Before R.237, `preprocess_jobs` runtime-load total was `528ms` across two samples; after R.237, the warm `runtime_load` component was `0ms`, `preprocess_jobs` warm route time was `225.4ms`, and `dashboard_metrics` p95 was `690.4ms`.
- Live-style isolated proof: `admin-real-nas-performance-isolated-20260627T094519Z` passed with `20` endpoints, `0` failed samples, `0` slow gates, `0` runtime repair endpoints, and `0` runtime component contract failures.
- Remaining gap: `preprocess_job_page` still costs about `217ms` per sampled request and should be the next Query/store inspection target. Source-video component timings, route-loader restructuring, UI IA, Docker release, and full Admin Architecture v1 remain incomplete.

R.238 planned traceability:

- Requirement coverage: Phase 3 Query API/read-model performance for the
  `preprocess/jobs` slow endpoint, specifically the `preprocess_job_page`
  component isolated by R.237 evidence.
- Planned implementation boundary: inspect real SQLite query plans for
  `source_video_status` and `preprocess_job_status`, optimize only the
  read-model page hot path, preserve global integrity checks in
  readiness/diagnostic paths, add focused tests, and record before/after
  isolated NAS performance evidence.
- Non-goal and safety boundary: no source-video manifest writes, no scan apply,
  no read-model rebuild/reconcile start, no worker execution, no Docker
  deployment, no UI layout change, no response data-shape change, no broad
  fixture/fallback replacement, and no Cutter protocol change.
- Professional review: Project Architect confirms the slice stays aligned with
  the "read model as query source" architecture. Delivery Lead confirms the
  slice is safe because it is GET/read-path only, keeps global mismatch
  detection in readiness, and is accepted only with focused tests, typecheck,
  governance audit, and isolated no-repair performance proof.

R.238 implemented traceability:

- Query-plan inspection showed `source_video_status` status pages already use
  `idx_admin_source_video_status_status_position`, and ready snapshot lookups
  already use the `preprocess_job_status` primary-key index.
- `packages/admin-api/src/admin-read-model-store.ts` now uses one SQLite
  connection inside `readAdminPreprocessJobManifestPageFromStore(...)` for both
  status metadata/freshness and page rows.
- Shared `statusFromMetadata(...)` keeps the public status reader and the page
  reader on the same freshness/count semantics.
- The preprocess job page hot path no longer runs global
  `COUNT(*) FROM preprocess_job_status`; current-page snapshot completeness is
  still checked, while process-history readiness continues to report
  `table_row_count_mismatch` for global table mismatch.
- `packages/admin-api/src/admin-read-model-store.test.ts` adds focused
  coverage for that hot-path/readiness split.
- Artifact proof:
  `admin-preprocess-job-page-query-plan-20260627T095744Z` records query plan,
  implementation, before/after timings, and remaining gaps.
- Performance proof: before R.238,
  `admin-real-nas-performance-20260627T095420Z` showed `preprocess_job_page`
  average `213.0ms`; after R.238,
  `admin-real-nas-performance-20260627T095744Z` shows `147.0ms` average and
  `148.0ms` max. The `preprocess/jobs` warm route improved from `214.1ms` to
  `149.1ms`.
- Verification passed: read-model store tests (`32`), preprocess facade/route
  tests (`8`), `npm run typecheck`, redundancy governance audit, and
  `admin-real-nas-performance-isolated-20260627T095743Z`.
- Remaining gap: this is not a cache/page-loader/UI solution and does not
  complete Admin Architecture v1. Next Query candidates are source-video
  component timings and Dashboard production-summary inspection; later phases
  still need Protection Gate coverage, route-loader restructuring, UI IA,
  redundancy cleanup, and Docker release gates.

R.239 planned traceability:

- Requirement coverage: Phase 3 Query API/read-model observability for the
  named source-video slow lists, especially `processing`, `index-required`, and
  `queued`.
- Planned implementation boundary: add runtime component timings to
  source-video status-page query paths, propagate them through the facade and
  route, and make the real NAS performance probe require the source-video
  component contract.
- Non-goal and safety boundary: no source-video list sorting/result change, no
  API `data` shape change, no NAS writes, no scan/apply/reconcile command, no
  Docker deployment, no Admin UI layout change, no Cutter protocol change, and
  no claim that source-video status-page performance has been optimized.
- Professional review: Project Architect confirms this prevents another
  guess-driven slow-list optimization. Delivery Lead confirms optional runtime
  metadata plus GET-only probe contracts are safe and testable.

R.239 implemented traceability:

- `packages/admin-api/src/admin-source-video-status-page-query.ts` now emits
  `library_counts`, `status_store_page`, `status_read_model`, and
  `manifest_id_page` component timings where applicable.
- `packages/admin-api/src/admin-source-video-read-facade.ts` carries
  `component_timings` from status-page query results into
  `read_source_video_list_with_runtime_meta(...)`.
- `packages/admin-api/src/admin-source-video-routes.ts` now passes source-video
  components into `/api/admin/source-videos` `meta.runtime.components`.
- `scripts/acceptance/admin-real-nas-performance.ts` now requires
  `library_counts` and `status_store_page` for
  `source_videos_processing`, `source_videos_index_required`, and
  `source_videos_queued`.
- Tests prove status-page component emission, route passthrough, and required
  performance-probe component gates.
- Artifact proof:
  `admin-source-videos-runtime-components-20260627T100455Z` records the
  implementation, contracts, live timings, verification, and remaining gaps.
- Live-style isolated proof:
  `admin-real-nas-performance-isolated-20260627T100454Z` passed with `20`
  endpoints, `0` failed samples, `0` slow gates, `0` runtime repair endpoints,
  and `0` runtime component contract failures.
- Performance observation: `source_videos_index_required` p95 `222.6ms` and
  `source_videos_queued` p95 `177.8ms` are dominated by `status_store_page`
  averages of `219.5ms` and `172.0ms`; `library_counts` is effectively `0ms`.
- Remaining gap: source-video status-list optimization is now ready for a
  targeted R.240, but R.239 itself is observability only. Dashboard
  `production_summary`, default source-video page components, route-loader
  restructuring, Protection Gate coverage, UI IA, redundancy cleanup, Docker
  gates, and full Admin Architecture v1 remain incomplete.

R.240 planned traceability:

- Requirement coverage: Phase 3 Query API/read-model performance for the
  source-video status-list `status_store_page` bottleneck identified in R.239.
- Planned implementation boundary: optimize the source-video status-store page
  read path by reusing one SQLite connection for freshness and page rows,
  preserving existing miss reasons and response semantics.
- Non-goal and safety boundary: no source-video result ordering change, no API
  `data` shape change, no NAS writes, no scan/apply/reconcile command, no page
  cache, no Docker deployment, no UI layout change, and no Cutter protocol
  change.
- Professional review: Project Architect confirms this is the correct direct
  follow-up to R.239. Delivery Lead confirms the slice is safe because it is a
  GET read-path refactor and retains freshness/miss behavior.

R.240 implemented traceability:

- `packages/admin-api/src/admin-read-model-store.ts` now lets
  `readAdminSourceVideoStatusesPageFromStoreWithReadiness(...)` open
  `admin.sqlite` once and reuse that connection for metadata/freshness and page
  rows.
- The source-video status-store page path now shares `statusFromMetadata(...)`
  with the public status reader and preprocess page reader.
- Existing behavior remains intact for `unsupported-status`, `store-not-fresh`,
  `incomplete-manifest-rows`, `unreadable-store`, and freshness reporting.
- Artifact proof:
  `admin-source-video-status-store-single-connection-20260627T100802Z` records
  implementation, before/after performance, verification, and remaining gaps.
- Performance proof: `source_videos_index_required` p95 improved from
  `222.6ms` to `189.5ms`; `source_videos_queued` p95 improved from `177.8ms`
  to `145.8ms`. Empty status lists stayed roughly flat, as expected for fixed
  SMB/SQLite read overhead.
- Verification passed: read-model/source-video focused tests (`58`),
  `npm run typecheck`, governance audit, and
  `admin-real-nas-performance-isolated-20260627T100801Z` with `0` failed
  samples, `0` slow gates, `0` runtime repairs, and `0` component contract
  failures.
- Remaining gap: `status_store_page` remains the main source-video status-list
  cost. Further reduction should be a deliberate short-TTL read-model page
  cache or deeper store-layout work, not a page-level loading patch. Dashboard
  `production_summary`, route-loader restructuring, Protection Gate coverage,
  UI IA, redundancy cleanup, Docker gates, and full Admin Architecture v1 remain
  incomplete.

R.241 planned traceability:

- Requirement coverage: Phase 3 Query API/read-model performance for the
  Dashboard background `production_summary` component identified by R.240
  performance evidence.
- Planned implementation boundary: inspect real NAS query plans, optimize only
  the Dashboard production-summary store hot path, preserve metadata snapshot
  gates, add focused tests, and record before/after isolated NAS performance
  evidence.
- Non-goal and safety boundary: no Dashboard UI change, no NAS writes, no
  source-video manifest writes, no scan/apply/reconcile command, no read-model
  rebuild, no Docker deployment, no Cutter protocol change, no response
  data-shape change, and no broad cache.
- Professional review: Project Architect confirms the slice stays aligned with
  read-model/query architecture. Delivery Lead confirms the slice is safe
  because it is GET/read-path only and is accepted only with focused tests,
  typecheck, governance audit, and isolated no-repair performance proof.

R.241 implemented traceability:

- Query-plan inspection showed the `completed_at`, `indexed_at`, and
  `failed_at` day-range queries already use existing indexes. Direct statement
  timing showed the dominant avoidable cost was the page-time
  `COUNT(*) FROM preprocess_job_status` completeness check on the NAS SQLite
  store.
- `packages/admin-api/src/admin-read-model-store.ts` now lets
  `readAdminDashboardProductionSummaryFromStore(...)` open `admin.sqlite` once
  and reuse metadata/counts for freshness.
- The Dashboard production-summary hot path no longer runs
  `COUNT(*) FROM preprocess_job_status` on every background metrics miss.
  Snapshot completeness is still guarded by
  `preprocess_job_snapshot_complete` and
  `preprocess_job_snapshot_row_count` metadata.
- `packages/admin-api/src/admin-read-model-store.test.ts` adds focused
  coverage proving snapshot metadata row-count mismatch still returns `null`.
- Artifact proof:
  `admin-dashboard-production-summary-query-plan-20260627T101631Z` records the
  implementation, before/after performance, verification, and remaining gaps.
- Performance proof: compared with R.240,
  `dashboard_metrics` p95 improved from `654.4ms` to `471.5ms`, and
  `production_summary` improved from `342.0ms` to `156.0ms`. Direct function
  probes improved from a stable `344.2-371.5ms` range to a warm
  `140.6-157.6ms` range.
- Verification passed: read-model store tests (`33`), focused Dashboard and
  source-video tests (`25`), `npm run typecheck`, redundancy governance audit,
  and `admin-real-nas-performance-isolated-20260627T101630Z` with `20`
  endpoints, `0` failed samples, `0` slow gates, `0` runtime repairs, and `0`
  component contract failures.
- Remaining gap: Dashboard `material_summary` and `usage_metrics` still have
  measurable cold costs, source-video `status_store_page` remains the main
  status-list cost, and route-loader restructuring, Protection Gate coverage,
  UI IA, redundancy cleanup, Docker gates, and full Admin Architecture v1
  remain incomplete.

R.242 planned traceability:

- Requirement coverage: Phase 3 Query API/read-model performance for the
  Dashboard background `material_summary` component after R.241 moved
  `production_summary` off avoidable table counting.
- Planned implementation boundary: optimize only the material-summary store
  read path by reusing one SQLite connection for freshness and metadata, then
  record whether the live projection is available without starting a rebuild.
- Non-goal and safety boundary: no material-summary projection rebuild, no
  Dashboard UI change, no NAS writes, no scan/apply/reconcile command, no
  Docker deployment, no Cutter protocol change, no response data-shape change,
  and no broad cache.
- Professional review: Project Architect confirms this is a read-model query
  boundary improvement, not a UI patch. Delivery Lead confirms the slice is
  safe because it is GET/read-path only and does not write or rebuild data.

R.242 implemented traceability:

- `packages/admin-api/src/admin-read-model-store.ts` now lets
  `readAdminDashboardMaterialSummaryFromStore(...)` open `admin.sqlite` once
  and reuse metadata/counts for freshness.
- The material-summary read path still refuses missing stores, stale stores,
  missing material-summary metadata, and summary count mismatches.
- Direct NAS inspection showed the observed `admin.sqlite` currently has no
  `dashboard_material_*` metadata rows. R.242 makes that missing-summary path
  cheaper; it does not create or rebuild the projection from a page request.
- Artifact proof:
  `admin-dashboard-material-summary-single-connection-20260627T102045Z`
  records implementation, before/after performance, verification, and remaining
  gaps.
- Performance proof: compared with R.241, `dashboard_metrics` p95 improved
  from `471.5ms` to `451.2ms`, and `material_summary` improved from `144.0ms`
  to `73.0ms`. Direct function probes improved from `126.0-138.2ms` to a warm
  `64.9-72.3ms` range.
- Verification passed: read-model store tests (`33`), focused Dashboard and
  source-video tests (`25`), `npm run typecheck`, redundancy governance audit,
  and `admin-real-nas-performance-isolated-20260627T102044Z` with `20`
  endpoints, `0` failed samples, `0` slow gates, `0` runtime repairs, and `0`
  component contract failures.
- Remaining gap: material-summary projection availability remains unresolved,
  `usage_metrics` still has a measurable cold cost, source-video
  `status_store_page` remains the main status-list cost, and route-loader
  restructuring, Protection Gate coverage, UI IA, redundancy cleanup, Docker
  gates, and full Admin Architecture v1 remain incomplete.

R.243 planned traceability:

- Requirement coverage: Phase 3 read-model/query observability for projection
  completeness. This closes the gap where `admin.sqlite` could be count-fresh
  while Dashboard material projection metadata was absent.
- Planned implementation boundary: add projection readiness to read-model
  status, keep main page-safety reconciliation unchanged, update real NAS
  performance evidence, and prove that no GET-only probe starts a rebuild.
- Non-goal and safety boundary: no material-summary rebuild, no page-time full
  scan, no NAS source-video manifest mutation, no read-model reconcile start,
  no Docker deployment, no Cutter protocol change, and no existing page payload
  shape change.
- Professional review: Project Architect confirms the slice separates
  freshness from projection completeness. Delivery Lead confirms it is
  read-only/status/reporting behavior plus tests.

R.243 implemented traceability:

- `packages/admin-api/src/admin-read-model-store.ts` now exposes optional
  `projections.material_summary` and `projections.production_summary`
  readiness from `readAdminReadModelStoreStatus(...)`.
- Projection readiness reports `status`, `reason`, `scan_mode`,
  `requires_background_reconcile`, `safe_for_page_request`, `video_count`, and
  `current_video_count`.
- The main store `freshness` and reconciliation plan still represent the
  count/status read-model page-safety contract, so source-video/status pages are
  not downgraded when a Dashboard projection is missing.
- `scripts/acceptance/admin-real-nas-performance.ts` now includes a
  `Read Model Projection Readiness` table in real NAS performance reports.
- Artifact proof:
  `admin-read-model-projection-readiness-20260627T103205Z` records the live
  finding, implementation, verification, and remaining gaps.
- Live finding: the observed NAS `admin.sqlite` is fresh and has `11394`
  `source_video_status` rows, but only `939` rows include full `manifest_json`,
  only `35` rows have positive `duration_ms`, and `dashboard_material_*`
  metadata is missing. The status response now reports
  `material_summary=missing/missing_metadata/full-reconcile/safe_for_page_request=true`
  and `production_summary=ready/no-scan`.
- Verification passed: projection/performance tests (`36`), read-model
  route/runtime/Dashboard tests (`12`), `npm run typecheck`, redundancy
  governance audit, and
  `admin-real-nas-performance-isolated-20260627T103205Z` with `20` endpoints,
  `0` failed samples, `0` slow gates, `0` runtime repairs, and `0` component
  contract failures.
- Remaining gap: a controlled maintenance reconcile still needs to populate
  `dashboard_material_*` metadata. Route-loader restructuring, Protection Gate
  coverage, UI IA, redundancy cleanup, Docker gates, and full Admin
  Architecture v1 remain incomplete.

R.244 planned traceability:

- Requirement coverage: Phase 3 read-model maintenance planning for projection
  completeness. This connects R.243 projection readiness to an explicit
  controlled rebuild plan instead of leaving missing Dashboard material
  metadata as an implicit follow-up.
- Planned implementation boundary: update only the plan-only rebuild gate to
  summarize projection readiness, mark missing/incomplete/stale projections as
  rebuild-needed, render the projection state, and keep execution as a separate
  reconcile runner.
- Non-goal and safety boundary: no reconcile execution, no page-time full scan,
  no NAS source-video manifest mutation, no release/index mutation, no Docker
  deployment, no Cutter protocol change, and no broad performance refactor.
- Professional review: Project Architect confirms the slice preserves the
  no-scan page-query model and moves projection repair into background
  maintenance planning. Delivery Lead confirms it remains GET-only and
  bounded to derived read-model/operation-log paths for any later execution.

R.244 implemented traceability:

- `scripts/acceptance/admin-read-model-rebuild-plan.ts` now includes
  `material_summary` and `production_summary` projection readiness under the
  current read-model environment summary.
- The rebuild plan now becomes `needed=true` when a projection is `missing`,
  `incomplete`, `stale`, or reports
  `requires_background_reconcile=true`, even if process-history readiness is
  already `ready`.
- The plan reason now combines process-history and projection causes, with the
  live NAS run producing
  `projection_incomplete:material_summary:missing_metadata`.
- The Markdown report now renders `Read Model Projection Readiness`, and the
  gate `projection-plan-covers-background-reconcile` proves that projection
  maintenance reasons are covered by the later forced derived-read-model
  rebuild plan.
- Artifact proof:
  `admin-read-model-rebuild-plan-20260627T104540Z` records the live GET-only
  plan run against an isolated auth-disabled local Admin API on `3892`.
- Live finding: `/Volumes/MixLab/PublicLibrary` reported `11394` total videos,
  `10471` ready, `904` queued, `19` index-required, store `fresh`, main
  reconciliation `none/no-scan/safe`, `production_summary=ready`, and
  `material_summary=missing/missing_metadata/full-reconcile`.
- Verification passed: rebuild-plan focused tests (`5`), `npm run typecheck`,
  and the isolated GET-only rebuild plan with no failed gates. The temporary
  API was shut down after the probe.
- Remaining gap: the controlled derived read-model reconcile has not been
  executed yet, and the live process-history read-model hit still showed a
  `2879.7ms` sample in the plan run. Both remain future Phase 3 work; route
  loaders, Protection Gate coverage, UI IA, redundancy cleanup, Docker gates,
  and full Admin Architecture v1 remain incomplete.

R.245 planned traceability:

- Requirement coverage: Phase 3 read-model maintenance execution for Dashboard
  material projection completeness. This turns the R.244 plan-only
  `projection_incomplete:material_summary:missing_metadata` finding into a
  controlled derived read-model repair.
- Planned implementation boundary: strengthen reconcile post-run invariants,
  preserve complete material projection metadata across later source-video
  status-model refreshes, run the controlled reconcile through an isolated
  local auth-disabled Admin API, then close with GET-only no-op and real NAS
  performance proof.
- Non-goal and safety boundary: no source-video manifest writes, no
  `library.json` count or `updated_at` mutation, no release/index mutation, no
  Docker deployment, no Cutter protocol change, no UI refactor, and no
  page-time full scan.
- Professional review: Project Architect confirms the repair keeps
  `admin.sqlite` derived and rebuildable. Delivery Lead confirms the slice is
  acceptable only with protected invariants and a final read-only no-op proof.

R.245 implemented traceability:

- `scripts/acceptance/admin-read-model-reconcile.ts` now adds
  `dashboard-material-projection-ready` and
  `dashboard-production-projection-ready` to apply-mode post-run invariants.
- The reconcile runner stable status timeout default is now `180s` instead of
  `60s`, matching the observed NAS post-write stabilization window.
- `packages/admin-api/src/admin-read-model-store.ts` now preserves a complete
  existing `manifest_json` snapshot when a source-video status refresh writes
  the store without full manifests, provided the existing store's
  `video_count` and `library_updated_at` match the new status model and all
  preserved manifests validate.
- Regression test proof:
  `admin read model store preserves complete material projection during status
  refresh` prevents the R.245 failure mode where status refreshes erase
  `dashboard_material_*` metadata.
- Failed-but-useful proof:
  `admin-read-model-reconcile-20260627T105027Z` reached terminal `succeeded`
  but failed `dashboard-material-projection-ready`, proving the previous
  status refresh path could downgrade material projection readiness.
- Failed-but-useful proof:
  `admin-read-model-reconcile-20260627T105928Z` reached terminal `succeeded`
  but failed post-run invariants because the old `60s` stable wait sampled
  `after_read_model=null`; a later live status call showed `fresh` with both
  projections ready.
- Closing proof:
  `admin-read-model-rebuild-plan-20260627T110719Z` passed with
  `needed=false`, `planned_action=no-op`, and `reason=ready`.
- Performance proof:
  `admin-real-nas-performance-isolated-20260627T110744Z` and
  `admin-real-nas-performance-20260627T110745Z` passed. Projection readiness is
  `material_summary=ready/no-scan` and `production_summary=ready/no-scan`;
  Dashboard `material_summary` is `66ms`; `dashboard_metrics` p95 is
  `433.7ms`.
- Protected invariants after the repair: public library counts remained
  `11394` total, `10471` ready, `904` queued, `19` index-required, current
  index stayed `v010471`, and library `updated_at` stayed
  `2026-06-25T19:07:13.162Z`.
- Verification passed: focused read-model/reconcile/rebuild tests (`43` and
  `50` across the repair loop), `npm run typecheck`, GET-only rebuild plan,
  and isolated real NAS performance proof. The temporary `3892` API was shut
  down after the run.
- Remaining gap: process-history is now confirmed as a separate Query/store
  performance issue. It returns `admin-read-model/no-scan/hit`, but a manual
  GET sample took about `14.17s`, and the rebuild-plan probe recorded
  `14021.1ms`. This should be optimized next without reintroducing page-time
  NAS scanning.

R.246 planned traceability:

- Requirement coverage: Phase 3 read-model/query optimization for
  `preprocess/process-history`. This directly addresses the R.245 finding that
  process-history was no-scan/read-model based but still too slow for page
  use.
- Planned implementation boundary: add a derived process-history projection
  inside `admin.sqlite`, include projection readiness in read-model status and
  rebuild planning, precompute the default 30-day no-filter summary, and keep
  all page requests out of NAS full-scan paths.
- Non-goal and safety boundary: no source-video manifest writes, no
  `library.json` count or `updated_at` mutation, no release/index mutation, no
  Cutter protocol change, no Docker deployment, no UI refactor, and no
  page-time full scan.
- Professional review: Project Architect confirms the slice preserves the
  four-role architecture (`filesystem fact source`, `admin-read-model query
  source`, `audit log operation source`, `release/index Cutter source`).
  Delivery Lead confirms live derived-store writes require protected
  invariants, no-op rebuild proof, and GET-only performance proof.

R.246 implemented traceability:

- `packages/admin-api/src/admin-read-model-store.ts` now creates and maintains
  `preprocess_process_history` as a derived projection table in `admin.sqlite`.
- The projection contains per-video event timestamps, `last_event_at`,
  `last_event_type`, elapsed time, active/completed/failed flags, and indexes
  for the process-history route.
- `readAdminReadModelStoreStatus(...)` now reports
  `projections.process_history`, and
  `scripts/acceptance/admin-read-model-rebuild-plan.ts` treats missing,
  incomplete, stale, or background-reconcile-required process-history
  projection state as rebuild-needed.
- `readAdminPreprocessProcessHistoryReadinessFromStore(...)` now checks both
  preprocess job snapshot completeness and process-history projection row
  completeness.
- The default no-filter 30-day process-history route now uses
  `process_history_default_*` metadata for summary/filter options, avoiding
  per-request JavaScript aggregation of `10080` tracked rows.
- `scripts/acceptance/admin-read-model-reconcile.ts` now includes
  `process-history-projection-ready` as an apply-mode invariant.
- `scripts/acceptance/admin-real-nas-performance.ts` now renders
  `process_history` in the projection readiness table.
- Failed-but-useful proof:
  `admin-read-model-rebuild-plan-20260627T112552Z` detected the old live store
  as `projection_incomplete:process_history:missing_metadata`.
- Failed-but-useful proof:
  `admin-read-model-reconcile-20260627T112602Z` reached terminal `succeeded`
  and made all projections ready, but failed immediately-following post-probes
  during the NAS post-write stabilization window.
- Closing reconcile proof:
  `admin-read-model-reconcile-20260627T114102Z` passed with no failed gates and
  preserved public-library invariants: `11394` total videos, `10471` ready,
  `904` queued, `19` index-required, current index `v010471`, and
  `library.updated_at=2026-06-25T19:07:13.162Z`.
- Closing no-op proof:
  `admin-read-model-rebuild-plan-20260627T114754Z` passed with
  `needed=false`, `planned_action=no-op`, and `reason=ready`.
- Process-history live proof:
  `admin-process-history-live-readonly-20260627T114859Z` passed with
  `actual_data_source=admin-read-model`, `scan_mode=no-scan`,
  `cache_status=hit`, `history_available=true`, `returned_count=20`, and
  readiness `ready`.
- Manual repeated live GET timing after the default-summary metadata was
  written: `0.66s`, `0.65s`, `0.65s`, `0.66s`, and `0.63s`.
- Real NAS performance proof:
  `admin-real-nas-performance-isolated-20260627T114808Z` and
  `admin-real-nas-performance-20260627T114809Z` passed with no slow gates,
  no timeout samples, and no component contract failures.
- Verification passed: focused store/reconcile/rebuild/performance/query tests
  (`52`), store tests (`35`), `npm run typecheck`, GET-only rebuild plan,
  GET-only process-history live proof, and isolated real NAS performance proof.
- Remaining gap: `source_videos_index_required` recorded one
  `status-store:unreadable-store` fallback sample in the real NAS performance
  report. It did not trip slow gates, but should be handled in a later
  status-store robustness slice. Route loaders, Protection Gate coverage, UI
  IA, redundancy cleanup, Docker gates, and full Admin Architecture v1 remain
  incomplete.

R.247 planned traceability:

- Requirement coverage: Phase 3 read-model/query robustness for non-ready
  source-video lists, specifically the `index-required` list that should stay
  on the status-store fast path.
- Planned implementation boundary: add bounded retry behavior for transient
  read-only SQLite busy/locked errors in the status-store page reader, keep
  non-transient failures visible, and prove the route no longer falls back
  during real NAS performance probes.
- Non-goal and safety boundary: no source-video manifest writes, no derived
  read-model rebuild, no `library.json` mutation, no release/index mutation, no
  Cutter protocol change, no Docker deployment, no UI refactor, and no
  page-time full scan.
- Professional review: Project Architect confirms the slice strengthens the
  read-model access layer instead of bypassing it. Delivery Lead confirms the
  slice needs a lock-contention regression test and a real NAS performance
  artifact showing fallback elimination.

R.247 implemented traceability:

- `packages/admin-api/src/admin-read-model-store.ts` now opens read-only
  status-store SQLite connections with a small busy timeout and retries only
  transient `SQLITE_BUSY` / `SQLITE_LOCKED` / locked-database read errors.
- The retry is bounded and local to
  `readAdminSourceVideoStatusesPageFromStoreWithReadiness(...)`; bad schema,
  corrupt store state, missing tables, and other non-transient errors still
  return `unreadable-store`.
- Regression test proof:
  `admin read model store retries transient locked status page reads` briefly
  holds an exclusive SQLite lock and proves the status-store page still hits
  after retry.
- Real NAS performance proof:
  `admin-real-nas-performance-isolated-20260627T115546Z` and
  `admin-real-nas-performance-20260627T115546Z` passed. The report shows
  `source_videos_index_required` p95 `238.7ms`, `status_store_page` hit `2/2`,
  `manifests=19` for both samples, no `status_read_model` fallback component,
  `Runtime fallbacks: none`, `Error/timeout samples: none`, and
  `Slow gates: none`.
- Verification passed: focused store/source-video/performance tests (`57`),
  store tests (`36`), `npm run typecheck`, and isolated real NAS performance
  proof.
- Remaining gap: R.247 closes the R.246 status-store fallback observation but
  does not complete route-loader restructuring, Protection Gate coverage, UI
  IA, redundancy cleanup, Docker gates, or full Admin Architecture v1.

R.248 planned traceability:

- Requirement coverage: Phase 2 route-loader/error-isolation behavior and
  Phase 4 production-console page information architecture. This directly
  addresses the requirement that a slow or failed route must not drag down the
  Admin Shell or masquerade as a global command failure.
- Planned implementation boundary: split route-owned read errors from global
  action/command errors for source videos, index-required publication queue,
  preprocess jobs, and cutter users; render those failures in the owning page
  surface; keep command/write failures on the existing protected command path.
- Non-goal and safety boundary: no backend API changes, no NAS writes, no
  read-model rebuild, no source-video manifest mutation, no `library.json`
  mutation, no release/index mutation, no Docker deployment, and no Cutter
  protocol change.
- Professional review: Project Architect confirms the work strengthens the
  route-local page contract rather than shrinking Admin Architecture v1 into UI
  wording. Delivery Lead confirms the slice must pass render tests and a
  static guard that route-read errors no longer use `setActionError(...)`.

R.248 implemented traceability:

- `apps/admin-web/src/app/AdminApp.tsx` now tracks separate route-local errors
  for source-video list reads, index-required publication queue reads,
  preprocess job reads, and cutter-user reads.
- `SourceVideosPage` accepts `sourceVideoError` and renders it inside the
  素材表格 surface. With existing rows it becomes a local route note; without
  rows it becomes a local empty/error state.
- `IndexPublishPage` accepts `indexRequiredError` and renders publication queue
  read failures inside the 发布队列 surface.
- `PreprocessJobsPage` accepts `jobsError` and renders task-list failures
  inside the 任务队列 surface. Process-history remains separately isolated by
  its existing `processHistoryError`.
- The cutter-user route fallback now differentiates loading from
  `剪辑师用户加载失败`, with the Inspector explicitly showing
  `本页面局部处理`.
- Route-owned read failures for `原视频列表加载`, `继续加载原视频`,
  `待发布视频加载`, `预处理队列加载`, `预处理队列刷新`, and
  `剪辑师用户加载` no longer call global `setActionError(...)`.
- Command/write failures remain unchanged and continue through the protected
  command action policy.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts` (`58`
  tests), `node --test --import tsx
  apps/admin-web/src/features/admin-ui-contract.test.ts` (`5` tests), and
  `npm run typecheck`.
- Accidental broad-run note: `npm test -- <file>` runs the repo-wide test set
  before the requested file in this repository. That broad run failed in
  unrelated Cutter/local-clips tests, while the Admin focused tests for R.248
  passed.
- Remaining gap: Doctor and Settings supplemental route reads still need a
  similar runtime-registry/local-error review. Protection Gate coverage,
  redundancy cleanup, Docker gates, and full Admin Architecture v1 remain
  incomplete.

R.249 planned traceability:

- Requirement coverage: Phase 2 route-local error isolation and Phase 4
  production-console IA completion for the remaining visible Doctor and
  Settings supplemental reads.
- Planned implementation boundary: add page-local error state for Doctor report
  refresh, Settings path checks, and Settings runtime settings; render the
  errors in the owning page surfaces; keep protected command/write failures on
  the global command action path.
- Non-goal and safety boundary: no backend API changes, no read-model rebuild,
  no NAS writes, no source-video manifest mutation, no `library.json`
  mutation, no release/index mutation, no Docker deployment, and no Cutter
  protocol change.
- Professional review: Project Architect confirms the slice completes the
  route-local error-boundary principle for visible non-dashboard pages. Delivery
  Lead confirms the slice is acceptable with focused render tests, static
  no-global-error guards, and typecheck.

R.249 implemented traceability:

- `DoctorPage` now accepts `doctorReportError` and renders
  `诊断报告加载失败` inside the 诊断报告 surface.
- `SettingsPage` now accepts `pathChecksError` and `runtimeSettingsError`.
  `路径检查加载失败` renders in the 路径检查 surface, and
  `运行时状态加载失败` renders in the 运行策略 surface.
- `AdminApp.tsx` now tracks `doctorReportError`,
  `settingsPathChecksError`, and `settingsRuntimeError` separately from the
  global command/action notice.
- Route-owned read failures for `系统检查加载`, `路径校验加载`, and
  `运行时状态加载` no longer call global `setActionError(...)`.
- Existing command/write paths remain unchanged and continue through the
  protected command action policy.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts` (`58`
  tests), `node --test --import tsx
  apps/admin-web/src/features/admin-ui-contract.test.ts` (`5` tests), and
  `npm run typecheck`.
- Remaining gap: Phase 2/4 route-local visible-page behavior is now stronger,
  but a first-class route loading runtime registry is still not extracted.
  Protection Gate coverage, redundancy cleanup, Docker gates, and full Admin
  Architecture v1 remain incomplete.

R.250 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture and Phase 4 page IA
  support. This directly follows R.248/R.249 by turning route-local read-error
  ownership into a central runtime contract instead of scattered component
  state.
- Planned implementation boundary: add an Admin Web route loading runtime
  registry for visible route-read failures, migrate `AdminApp` to registry
  helpers, and prove that route-read failures do not use the global
  command/action notice.
- Non-goal and safety boundary: no backend API changes, no read-model rebuild,
  no NAS writes, no source-video manifest mutation, no `library.json`
  mutation, no release/index mutation, no Docker deployment, no Cutter protocol
  change, and no route prefetch behavior change.
- Professional review: Project Architect confirms the registry is aligned with
  the desired route-loader architecture. Delivery Lead confirms the slice must
  close with registry contract tests and focused Admin Web tests.

R.250 implemented traceability:

- Added `apps/admin-web/src/app/route-loading-runtime.ts`.
- The registry defines `sourceVideos`, `indexRequiredVideos`,
  `preprocessJobs`, `cutterUsers`, `doctorReport`, `settingsPathChecks`, and
  `settingsRuntime`, each with its owning route, Chinese label, surface, and
  `global_action_notice=false`.
- `AdminApp.tsx` now stores route-local read errors in a single
  `routeLocalReadErrors` state object.
- `AdminApp.tsx` now uses `setRouteLocalReadError(...)`,
  `setRouteLocalReadErrorMessage(...)`, and
  `clearRouteLocalReadError(...)` instead of one-off setters such as
  `setSourceVideosError(...)` or `setSettingsRuntimeError(...)`.
- Route-owned reads no longer clear or write global `actionError`; command
  paths remain unchanged.
- `apps/admin-web/src/admin-app.test.ts` now verifies the registry contract,
  error set/clear helpers, local page rendering, and absence of global action
  notice writes for the covered route-read failures.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts` (`59`
  tests), `node --test --import tsx
  apps/admin-web/src/features/admin-ui-contract.test.ts` (`5` tests), and
  `npm run typecheck`.
- Remaining gap: loading booleans, background refresh ownership, Protection
  Gate coverage, redundancy cleanup, Docker gates, and full Admin Architecture
  v1 remain incomplete.

R.251 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture and Phase 4 page IA
  support. This extends R.250 from route-local read-error ownership into a
  broader route loading runtime contract for visible loading flags and
  background refresh / prefetch ownership.
- Planned implementation boundary: extend
  `apps/admin-web/src/app/route-loading-runtime.ts` with route loading specs,
  background refresh specs, and a render loading helper; update `AdminApp` to
  consume the helper at the visible render boundary; add focused tests proving
  non-blocking, abortable, route-local behavior.
- Non-goal and safety boundary: no backend API changes, no read-model rebuild,
  no NAS writes, no source-video manifest mutation, no `library.json`
  mutation, no release/index mutation, no Docker deployment, no Cutter protocol
  change, no broad React state rewrite, and no route prefetch enablement
  change.
- Professional review: Project Architect confirms the slice preserves the
  full Admin Architecture v1 goal by turning loading behavior into an explicit
  shell/route/background contract. Delivery Lead confirms it is safe as a
  frontend-only contract slice with focused tests and typecheck.

R.251 implemented traceability:

- `apps/admin-web/src/app/route-loading-runtime.ts` now defines
  `ADMIN_ROUTE_LOADING_SPECS` for visible route-entry, route-pagination, and
  route-supplemental loading surfaces across source detail, source videos,
  index publish, preprocess jobs, protection, operation log, doctor, settings,
  and cutter users.
- The visible loading specs declare route, Chinese label, owning surface,
  phase, `shell_blocking=false`, `abortable=true`, and
  `global_action_notice=false`.
- `route-loading-runtime.ts` now defines `ADMIN_BACKGROUND_REFRESH_SPECS` for
  shell data reload scheduling, Dashboard panel refresh, non-Dashboard metrics,
  cutter-user prefetch, preprocess-job prefetch, and preprocess-job interval
  refresh. Each spec declares owner, trigger, non-blocking behavior,
  cancellation, default enablement, and visible error surface.
- `AdminApp.tsx` now derives render-time page loading through
  `adminRouteRenderLoadingState(...)` and types the `renderPage` loading input
  with `AdminRouteRenderLoadingState`.
- `apps/admin-web/src/admin-app.test.ts` now verifies the route loading
  registry, background refresh registry, render loading helper, and `AdminApp`
  render-boundary consumption.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts` (`61`
  tests), `node --test --import tsx
  apps/admin-web/src/features/admin-ui-contract.test.ts` (`5` tests), and
  `npm run typecheck`.
- Remaining gap: the route loading runtime contract is now explicit, but
  individual route loader extraction, Protection Gate coverage, backend
  read-model/query completion, redundancy cleanup, Docker gates, and full Admin
  Architecture v1 remain incomplete.

R.252 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture and Phase 4 page IA
  support. This moves pure route loader planner decisions into the same runtime
  contract that already owns route-local errors, visible loading specs, and
  background refresh specs.
- Planned implementation boundary: export `shouldAutoRefreshAdminData(...)`,
  `shouldLoadAdminSourceVideos(...)`, and `shouldPrefetchAdminRoute(...)` from
  `apps/admin-web/src/app/route-loading-runtime.ts`; update `AdminApp.tsx` to
  consume those helpers; add tests proving the helpers are no longer defined in
  the shell component.
- Non-goal and safety boundary: no Admin API changes, no read-model rebuild,
  no NAS writes, no source-video manifest mutation, no `library.json`
  mutation, no release/index mutation, no Docker deployment, no Cutter protocol
  change, no route effect rewrite, no route prefetch enablement change, and no
  auto-refresh behavior change.
- Professional review: Project Architect confirms this preserves the full
  Admin Architecture v1 goal by separating route loading policy from shell
  component execution. Delivery Lead confirms it is safe as a frontend-only
  planner ownership slice with focused tests.

R.252 implemented traceability:

- `route-loading-runtime.ts` now exports `shouldAutoRefreshAdminData(...)`,
  `shouldLoadAdminSourceVideos(...)`, and `shouldPrefetchAdminRoute(...)`.
- `AdminApp.tsx` imports those planner helpers from the runtime module and no
  longer defines the prefetch flag, auto-refresh route sets, or planner helper
  implementations.
- Existing behavior is preserved: `preprocess-jobs` remains the always-refresh
  route, `source-detail` remains the production-state conditional refresh
  route, source-video route loading still waits for shell data, and background
  route prefetch remains disabled by default.
- `apps/admin-web/src/admin-app.test.ts` now imports planner helpers from
  `route-loading-runtime.ts` and verifies ownership with a static source check.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts` (`62`
  tests).
- Remaining gap: route loader effect execution is still inside `AdminApp.tsx`;
  Protection Gate coverage, backend read-model/query completion, redundancy
  cleanup, Docker gates, and full Admin Architecture v1 remain incomplete.

R.253 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture and Phase 4 page IA
  support. This moves repeated token-based route-loader start guards into the
  route loading runtime contract.
- Planned implementation boundary: add
  `shouldStartAdminRouteTokenLoad(...)` to
  `apps/admin-web/src/app/route-loading-runtime.ts`; use it for Doctor report,
  Doctor runtime diagnostics, Settings path checks, and Settings runtime
  loader effects; add tests for the guard decision matrix and AdminApp
  ownership.
- Non-goal and safety boundary: no Admin API changes, no read-model rebuild,
  no NAS writes, no source-video manifest mutation, no `library.json`
  mutation, no release/index mutation, no Docker deployment, no Cutter protocol
  change, no request execution rewrite, no pending-data merge rewrite, and no
  route behavior change.
- Professional review: Project Architect confirms this preserves the full
  Admin Architecture v1 goal by moving loader start policy into the runtime
  contract. Delivery Lead confirms it is safe as a frontend-only guard
  extraction with focused tests.

R.253 implemented traceability:

- `route-loading-runtime.ts` now exports
  `shouldStartAdminRouteTokenLoad(...)`.
- `AdminApp.tsx` uses that helper for Doctor report, Doctor runtime
  diagnostics, Settings path checks, and Settings runtime loaders.
- The migrated loaders keep their existing request scopes, error handling,
  pending-data handoff, reload token writes, and local error surfaces.
- `apps/admin-web/src/admin-app.test.ts` now verifies route mismatch,
  duplicate-token, loading-in-progress, disabled-load, and allowed-start cases,
  plus a static source check that the migrated `AdminApp` loaders consume the
  runtime helper.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts` (`64`
  tests).
- Remaining gap: broader route loader effect execution is still inside
  `AdminApp.tsx`; Protection Gate coverage, backend read-model/query
  completion, redundancy cleanup, Docker gates, and full Admin Architecture v1
  remain incomplete.

R.254 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture and Phase 4 page IA
  support. This promotes token-based route-loader start guards into a registry
  contract that declares loader key, route, visible loading key, optional
  route-local error key, and shell-data dependency.
- Planned implementation boundary: export `ADMIN_ROUTE_TOKEN_LOAD_SPECS` from
  `apps/admin-web/src/app/route-loading-runtime.ts`; update
  `shouldStartAdminRouteTokenLoad(...)` to derive expected route and shell-data
  rules from the registry; update Doctor and Settings token-loader call sites
  in `AdminApp.tsx` to pass loader keys instead of repeated route metadata.
- Non-goal and safety boundary: no Admin API changes, no read-model rebuild,
  no NAS writes, no source-video manifest mutation, no `library.json`
  mutation, no release/index mutation, no Docker deployment, no Cutter protocol
  change, no request execution rewrite, no pending-data merge rewrite, and no
  route behavior change.
- Professional review: Project Architect confirms this preserves the full
  Admin Architecture v1 goal by centralizing token-loader ownership metadata
  in the route runtime contract. Delivery Lead confirms it is safe as a
  frontend-only registry slice with focused tests.

R.254 implemented traceability:

- `route-loading-runtime.ts` now exports `ADMIN_ROUTE_TOKEN_LOAD_SPECS` for
  `doctorReport`, `runtimeDiagnostics`, `settingsPathChecks`, and
  `settingsRuntime`.
- The registry records each loader's route, visible loading key, optional local
  read-error key, and `requires_shell_data` behavior.
- `shouldStartAdminRouteTokenLoad(...)` now takes a loader key and derives
  route mismatch and shell-data gating from the registry.
- `AdminApp.tsx` uses loader keys for the four migrated Doctor/Settings token
  loaders and no longer carries `expectedRoute` metadata at those call sites.
- `apps/admin-web/src/admin-app.test.ts` now verifies the registry contract,
  route/token/loading/disabled/shell-data behavior, and static AdminApp
  ownership.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts` (`64`
  tests), `node --test --import tsx
  apps/admin-web/src/features/admin-ui-contract.test.ts` (`5` tests),
  `npm run typecheck`, and `git diff --check -- ...` for the touched R.254
  files.
- Remaining gap: broader route loader effect execution is still inside
  `AdminApp.tsx`; Protection Gate coverage, backend read-model/query
  completion, redundancy cleanup, Docker gates, and full Admin Architecture v1
  remain incomplete.

R.255 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture and Phase 4 page IA
  support. This hardens the token loader registry with execution metadata so a
  later effect-extraction pass has a typed migration map.
- Planned implementation boundary: add request-scope, client-method,
  success-target, error-surface, and pending-handoff metadata to
  `AdminRouteTokenLoadSpec`; update `ADMIN_ROUTE_TOKEN_LOAD_SPECS` and focused
  tests without changing the loader request bodies or response handling.
- Non-goal and safety boundary: no Admin API changes, no read-model rebuild,
  no NAS writes, no source-video manifest mutation, no `library.json`
  mutation, no release/index mutation, no Docker deployment, no Cutter protocol
  change, no request execution rewrite, no pending-data merge rewrite, and no
  route behavior change.
- Professional review: Project Architect confirms this keeps route-loader
  migration explicit instead of shrinking the work into a component-local
  patch. Delivery Lead confirms it is safe as a frontend-only contract slice
  with focused tests.

R.255 implemented traceability:

- `AdminRouteTokenLoadSpec` now records `request_scope`, `client_method`,
  `success_target`, `error_surface`, and `supports_pending_handoff`.
- `ADMIN_ROUTE_TOKEN_LOAD_SPECS` now declares the current execution contract for
  Doctor report, runtime diagnostics history, Settings path checks, and
  Settings runtime reads.
- Runtime diagnostics is explicitly modeled as shell-data-dependent local state;
  Doctor and Settings reads are modeled as pending-handoff dashboard-data reads
  with route-local read-error surfaces.
- `apps/admin-web/src/admin-app.test.ts` verifies the new execution metadata as
  part of the token-loader registry contract.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts` (`64`
  tests), `node --test --import tsx
  apps/admin-web/src/features/admin-ui-contract.test.ts` (`5` tests),
  `npm run typecheck`, and `git diff --check -- ...` for the touched R.255
  files.
- Remaining gap: broader route loader effect execution is still inside
  `AdminApp.tsx`; Protection Gate coverage, backend read-model/query
  completion, redundancy cleanup, Docker gates, and full Admin Architecture v1
  remain incomplete.

R.256 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture and Phase 4 page IA
  support. This moves the token-loader start-and-request-scope boundary into
  the route loading runtime contract.
- Planned implementation boundary: add
  `createAdminRouteTokenRequestScope(...)` to
  `apps/admin-web/src/app/route-loading-runtime.ts`; update the four
  Doctor/Settings token effects in `AdminApp.tsx` to consume it; prove blocked
  loaders do not create request scopes and allowed loaders do.
- Non-goal and safety boundary: no Admin API changes, no read-model rebuild,
  no NAS writes, no source-video manifest mutation, no `library.json`
  mutation, no release/index mutation, no Docker deployment, no Cutter protocol
  change, no request body/method change, no pending-data merge rewrite, and no
  route behavior change.
- Professional review: Project Architect confirms this keeps the route-loader
  migration on the architecture path by centralizing the start/scope boundary.
  Delivery Lead confirms it is safe as a frontend-only behavior-preserving
  contract slice with focused tests.

R.256 implemented traceability:

- `route-loading-runtime.ts` now exports
  `createAdminRouteTokenRequestScope(...)`.
- The helper returns `null` for blocked loaders without invoking the supplied
  request-scope factory, and returns `{ spec, requestScope }` for allowed
  loaders.
- `AdminApp.tsx` now uses the helper for Doctor report, runtime diagnostics,
  Settings path checks, and Settings runtime token loaders.
- Existing request methods, local error handling, pending handoff, timeout
  wrapping, loaded-token writes, and cleanup abort behavior are preserved.
- `apps/admin-web/src/admin-app.test.ts` verifies helper behavior and static
  AdminApp ownership.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts` (`64`
  tests), `node --test --import tsx
  apps/admin-web/src/features/admin-ui-contract.test.ts` (`5` tests),
  `npm run typecheck`, and `git diff --check -- ...` for the touched R.256
  files.
- Remaining gap: broader route loader effect execution is still inside
  `AdminApp.tsx`; Protection Gate coverage, backend read-model/query
  completion, redundancy cleanup, Docker gates, and full Admin Architecture v1
  remain incomplete.

R.257 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture and Phase 4 page IA
  support. This moves the token-loader promise lifecycle into a reusable
  runtime execution runner for the migrated Doctor and Settings route loaders.
- Planned implementation boundary: add `startAdminRouteTokenLoad(...)` plus
  typed lifecycle contexts to
  `apps/admin-web/src/app/route-loading-runtime.ts`; update the four
  Doctor/Settings token effects in `AdminApp.tsx` to use the runner; prove
  allowed, blocked, and cancelled lifecycles in focused tests.
- Non-goal and safety boundary: no Admin API changes, no read-model rebuild,
  no NAS writes, no source-video manifest mutation, no `library.json`
  mutation, no release/index mutation, no Docker deployment, no Cutter protocol
  change, no request method/body change, no pending-data merge rewrite, and no
  route behavior change.
- Professional review: Project Architect confirms this keeps the data-loading
  migration as a runtime contract rather than a page-local patch. Delivery
  Lead confirms it is safe as a frontend-only behavior-preserving slice with
  lifecycle tests and no production-data or Docker surface.

R.257 implemented traceability:

- `route-loading-runtime.ts` now exports `startAdminRouteTokenLoad(...)` and
  lifecycle context types for token route-loader execution.
- The runner calls `createAdminRouteTokenRequestScope(...)`, starts only when
  the registry-backed guard allows, and returns `null` for blocked loaders
  without creating scopes or issuing requests.
- The runner invokes start, request, success, error, settled, and optional
  cancel callbacks; cancellation aborts the request scope and suppresses
  success/error callbacks from late promise resolution.
- `AdminApp.tsx` now uses the runner for Doctor report, runtime diagnostics,
  Settings path checks, and Settings runtime token loaders.
- Existing request methods, local error handling, pending handoff, timeout
  wrapping, loaded-token writes, and cleanup abort behavior are preserved.
- `apps/admin-web/src/admin-app.test.ts` verifies runner lifecycle behavior,
  blocked-load behavior, cancellation behavior, and static AdminApp ownership.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts` (`65`
  tests),
  `node --test --import tsx
  apps/admin-web/src/features/admin-ui-contract.test.ts` (`5` tests),
  `npm run typecheck`, and `git diff --check -- ...` for the touched R.257
  files.
- Remaining gap: broader route loader effect execution is still only partially
  extracted; Protection Gate coverage, backend read-model/query completion,
  redundancy cleanup, Docker gates, and full Admin Architecture v1 remain
  incomplete.

R.258 planned traceability:

- Requirement coverage: Phase 3 Admin read model / Query API and Phase 2
  runtime observability. This makes source-video status-page manifest fallback
  an explicit query policy so page reads can choose a no-scan result instead of
  silently falling back to source-video manifest reads.
- Planned implementation boundary: add
  `manifest_fallback_policy: "allow" | "forbid"` to the status-page query and
  read facade, forward `manifest_fallback=forbid` through the source-video
  route, and localize the new runtime reason in the Admin source-video page.
- Non-goal and safety boundary: no NAS writes, no read-model rebuild, no
  source-video manifest mutation, no `library.json` mutation, no release/index
  mutation, no Docker deployment, no Cutter protocol change, no default page
  behavior change, and no removal of the existing fallback path.
- Professional review: Project Architect confirms this is aligned with the
  root Admin Architecture v1 data strategy because it turns a hidden fallback
  into an auditable Query policy. Delivery Lead confirms it is safe because the
  policy is opt-in, default behavior is compatible, and production data is not
  touched.

R.258 implemented traceability:

- `packages/admin-api/src/admin-source-video-status-page-query.ts` now accepts
  `manifest_fallback_policy` and returns a no-scan
  `manifest-fallback:forbidden` runtime result before manifest ID reads when
  the policy is `forbid`.
- The blocked result keeps `actual_data_source: "admin-read-model"`,
  `cache_status: "miss"`, and a `manifest_fallback_policy` runtime component
  with the original status-store miss reason for observability.
- `packages/admin-api/src/admin-source-video-read-facade.ts` passes the policy
  through `read_source_video_list_with_runtime_meta(...)`.
- `packages/admin-api/src/admin-source-video-routes.ts` forwards the
  read-only probe parameter `manifest_fallback=forbid` without changing
  default route behavior.
- `apps/admin-web/src/features/source-videos/SourceVideosPage.tsx` renders the
  new runtime reason as `清单回退已阻断`.
- Verification passed:
  `node --test --import tsx
  packages/admin-api/src/admin-source-video-status-page-query.test.ts` (`13`
  tests),
  `node --test --import tsx
  packages/admin-api/src/admin-source-video-read-facade.test.ts` (`9` tests),
  `node --test --import tsx
  packages/admin-api/src/admin-source-video-routes.test.ts` (`8` tests),
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts` (`65`
  tests),
  `node --test --import tsx
  apps/admin-web/src/features/admin-ui-contract.test.ts` (`5` tests),
  `npm run typecheck`, and `git diff --check -- ...` for the touched R.258
  files.
- Remaining gap: forbid mode is not yet enabled by default for production
  slow pages; background reconcile/repair UX must be paired before making
  high-risk routes refuse fallback by default. Protection Gate coverage,
  broader read-model/query completion, redundancy cleanup, Docker gates, and
  full Admin Architecture v1 remain incomplete.

R.259 planned traceability:

- Requirement coverage: Phase 3 Admin read model / Query API and Phase 2
  route-loading strategy. This turns the R.258 source-video manifest fallback
  policy into real page-request behavior for the two highest-risk slow filters:
  `processing` and `index-required`.
- Planned implementation boundary: add a typed Admin Web list option for
  `manifest_fallback`, serialize `manifest_fallback=forbid`, centralize the
  high-risk status policy in `route-loading-runtime.ts`, and pass it from the
  Admin source-video route loader and pagination call sites.
- Non-goal and safety boundary: no backend write behavior change, no NAS
  writes, no read-model rebuild, no source-video manifest mutation, no
  `library.json` mutation, no release/index mutation, no Docker deployment, no
  Cutter protocol change, no default/ready list behavior change, and no
  removal of existing compatibility fallback paths.
- Professional review: Project Architect confirms this is a direct movement
  toward the final architecture because high-risk page filters now prefer a
  visible no-scan miss over hidden manifest fallback. Delivery Lead confirms
  it is safe because the change is request-policy only and covered by
  serialization plus AdminApp static tests.

R.259 implemented traceability:

- `apps/admin-web/src/api.ts` now allows
  `AdminSourceVideoListOptions.manifest_fallback`.
- `apps/admin-web/src/admin-http.ts` serializes
  `manifest_fallback=forbid` only when explicitly requested.
- `apps/admin-web/src/app/route-loading-runtime.ts` now exports
  `adminSourceVideoManifestFallbackPolicy(...)`, returning `forbid` only for
  `processing` and `index-required`.
- `apps/admin-web/src/app/AdminApp.tsx` passes that policy into both initial
  source-video page loading and load-more pagination.
- `apps/admin-web/src/admin-source-video-client.test.ts` covers query
  serialization, and `apps/admin-web/src/admin-app.test.ts` covers policy
  selection plus both AdminApp call sites.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-source-video-client.test.ts`
  passed `4` tests; `node --test --import tsx
  apps/admin-web/src/admin-http.test.ts` passed `3` tests; `node --test
  --import tsx apps/admin-web/src/api.test.ts` passed `30` tests; `node
  --test --import tsx apps/admin-web/src/admin-app.test.ts` passed `65`
  tests; `node --test --import tsx
  apps/admin-web/src/features/admin-ui-contract.test.ts` passed `5` tests;
  `npm run typecheck` passed; `git diff --check -- ...` passed for the
  touched R.259 files.
- Remaining gap: high-risk filters now request no-scan behavior, but the page
  still needs a first-class maintenance handoff to inspect/start read-model
  reconcile when the store is incomplete. Broader read-model/query completion,
  Protection Gate coverage, redundancy cleanup, Docker gates, and full Admin
  Architecture v1 remain incomplete.

R.260 planned traceability:

- Requirement coverage: Phase 2 route-local loading UX and Phase 3 Admin read
  model / Query API. This closes the operator handoff after R.259 no-scan
  refusal by making `manifest-fallback:forbidden` recoverable from the
  source-video page.
- Planned implementation boundary: detect the blocked fallback reason in
  `SourceVideosPage`, render a Chinese maintenance section, pass the Protection
  Center route and existing read-model reconcile command from `AdminApp`, and
  cover the behavior in AdminApp rendering tests.
- Non-goal and safety boundary: no backend API change, no new write command, no
  NAS writes, no read-model rebuild during page load, no source-video manifest
  mutation, no `library.json` mutation, no release/index mutation, no Docker
  deployment, no Cutter protocol change, and no broad query/read-model
  completion claim.
- Professional review: Project Architect confirms this preserves the desired
  no-scan target state while giving operators a visible maintenance path.
  Operations Lead confirms it is safe because it reuses the existing background
  reconcile command and Protection Center instead of triggering hidden repair.

R.260 implemented traceability:

- `apps/admin-web/src/features/source-videos/SourceVideosPage.tsx` now renders a
  read-model maintenance section only when the runtime fallback reason is
  `manifest-fallback:forbidden`.
- The maintenance section exposes `打开保护中心` and `启动后台对账`, with a busy
  label when reconcile command execution is already in flight.
- `apps/admin-web/src/app/AdminApp.tsx` passes the existing Protection Center
  hash, read-model reconcile action, and command loading state into the
  source-video page.
- `apps/admin-web/src/admin-app.test.ts` verifies ordinary read-model fallback
  does not show maintenance actions and blocked fallback does.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts` passed `65`
  tests; `node --test --import tsx
  apps/admin-web/src/features/admin-ui-contract.test.ts` passed `5` tests;
  `npm run typecheck` passed; `git diff --check -- ...` passed for the touched
  R.260 files.
- Remaining gap: source-video page maintenance can now start or route to
  reconcile, but contextual reconcile progress and broader read-model/query
  completion, scan planner coverage, Protection Gate coverage, redundancy
  cleanup, Docker gates, and full Admin Architecture v1 remain incomplete.

R.261 planned traceability:

- Requirement coverage: Phase 2 route-local loading UX and Phase 3 Admin read
  model / Query API. This adds contextual reconcile visibility to the R.260
  blocked source-video filter handoff.
- Planned implementation boundary: pass existing read-model reconcile
  status/error/loading state from `AdminApp` into `SourceVideosPage`, render a
  compact Chinese status/progress summary only for blocked no-scan fallback, and
  cover the behavior in AdminApp rendering tests.
- Non-goal and safety boundary: no backend API change, no new command, no
  automatic reconcile trigger, no NAS writes, no page-load read-model rebuild,
  no source-video manifest mutation, no `library.json` mutation, no release/index
  mutation, no Docker deployment, no Cutter protocol change, and no full
  observability completion claim.
- Professional review: Project Architect confirms the page stays no-scan while
  avoiding blind repeated retries. Operations Lead confirms the Protection Center
  remains the durable detailed maintenance surface.

R.261 implemented traceability:

- `apps/admin-web/src/features/source-videos/SourceVideosPage.tsx` now accepts
  and renders read-model reconcile status/error context for blocked fallback.
- The maintenance section localizes reconcile run status, phase, current step,
  percent, and cancel-request context.
- `apps/admin-web/src/app/AdminApp.tsx` passes the existing reconcile status and
  error from the operations overview state into the source-video page.
- `apps/admin-web/src/admin-app.test.ts` verifies blocked fallback shows the
  running reconcile status and progress summary from fixture data.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts` passed `65`
  tests; `node --test --import tsx
  apps/admin-web/src/features/admin-ui-contract.test.ts` passed `5` tests;
  `npm run typecheck` passed; `git diff --check -- ...` passed for the touched
  R.261 files.
- Remaining gap: contextual visibility is present for source-video blocked
  filters, but broader read-model observability, scan-planner evidence,
  Protection Gate coverage, redundancy cleanup, Docker gates, and full Admin
  Architecture v1 remain incomplete.

R.262 planned traceability:

- Requirement coverage: Phase 2 route-local loading UX and Phase 3 Admin read
  model / Query API. This exposes source-video runtime scan evidence required by
  the Goal's slow-interface observability target.
- Planned implementation boundary: render existing `sourceVideoRuntime`
  metadata in `SourceVideosPage`, localize scan/data/cache/fallback/component
  labels, and cover the behavior in AdminApp rendering tests.
- Non-goal and safety boundary: no backend API change, no new scan planner, no
  new command, no page-load scan, no NAS writes, no read-model rebuild, no
  source-video manifest mutation, no `library.json` mutation, no release/index
  mutation, no Docker deployment, no Cutter protocol change, and no global
  scan-planner completion claim.
- Professional review: Project Architect confirms the slice makes
  no-scan/read-model/fallback behavior inspectable. Delivery Lead confirms it is
  safe because it is read-only UI over existing runtime metadata.

R.262 implemented traceability:

- `apps/admin-web/src/features/source-videos/SourceVideosPage.tsx` now renders
  a `素材库扫描证据` section when source-video runtime metadata is available.
- The evidence includes localized scan mode, scan reason, planned and actual
  data source, cache status, result window, slow-request status, fallback
  reason, and component timing summaries.
- Raw endpoint names, fallback identifiers, and internal component names are not
  exposed as user-facing text.
- `apps/admin-web/src/admin-app.test.ts` verifies the localized evidence and
  guards against raw internal identifiers leaking into visible text.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts` passed `65`
  tests; `node --test --import tsx
  apps/admin-web/src/features/admin-ui-contract.test.ts` passed `5` tests;
  `npm run typecheck` passed; `git diff --check -- ...` passed for the touched
  R.262 files.
- Remaining gap: source-video scan evidence is visible, but the same pattern
  must still be extended across other high-risk route families such as
  `preprocess/jobs`, `index/versions`, dashboard stats, and usage-events.
  Protection Gate coverage, redundancy cleanup, Docker gates, and full Admin
  Architecture v1 remain incomplete.

R.263 planned traceability:

- Requirement coverage: Phase 2 route-local loading UX and Phase 3 Admin read
  model / Query API. This extends scan evidence from source videos to
  `/api/admin/preprocess/jobs`, another Goal-named high-risk route.
- Planned implementation boundary: preserve preprocess jobs `meta.runtime` in
  the Admin Web operations client, reuse centralized runtime label helpers, and
  render localized task queue plus process-history evidence on the Preprocess
  page.
- Non-goal and safety boundary: no backend route change, no new scan planner,
  no worker lifecycle change, no queue/retry/recover command change, no NAS
  writes, no read-model rebuild, no source-video manifest mutation, no
  `library.json` mutation, no release/index mutation, no Docker deployment, no
  Cutter protocol change, and no global scan-evidence completion claim.
- Professional review: Project Architect confirms the slice surfaces actual
  Query API runtime metadata rather than page-only explanation. Delivery Lead
  confirms it is read-only client/UI plumbing that leaves worker commands and
  production data untouched.

R.263 implemented traceability:

- `apps/admin-web/src/api.ts` adds optional runtime metadata to
  `AdminPreprocessJobsResponse`.
- `apps/admin-web/src/admin-operations-client.ts` preserves
  `/api/admin/preprocess/jobs` `meta.runtime` by using `getJsonWithMeta(...)`.
- `apps/admin-web/src/app/runtime-observability-labels.ts` centralizes
  localized runtime evidence labels used by source-video and preprocess pages.
- `apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx` renders
  `预处理扫描证据` with task queue runtime evidence and process-history no-scan
  evidence.
- `apps/admin-web/src/admin-operations-client.test.ts` verifies the runtime
  metadata path, and `apps/admin-web/src/admin-app.test.ts` verifies the
  localized Preprocess evidence and raw-name leakage guard.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-operations-client.test.ts`
  passed `3` tests; `node --test --import tsx apps/admin-web/src/admin-app.test.ts`
  passed `65` tests; `node --test --import tsx
  apps/admin-web/src/features/admin-ui-contract.test.ts` passed `5` tests;
  `npm run typecheck` passed; `git diff --check -- ...` passed for the touched
  R.263 files.
- Remaining gap: source-video and preprocess jobs scan evidence are visible, but
  `index/versions`, dashboard stats, usage-events aggregation, Protection Gate
  coverage, redundancy cleanup, Docker gates, and full Admin Architecture v1
  remain incomplete.

R.264 planned traceability:

- Requirement coverage: Phase 2 route-local loading UX and Phase 3 Admin read
  model / Query API. This extends scan evidence to `/api/admin/index/versions`,
  completing the first pass over the three named slow route-list families:
  source-videos, preprocess jobs, and index versions.
- Planned implementation boundary: preserve index-version `meta.runtime` in the
  Admin Web operations client, extend shared runtime label helpers for
  index-version component names, and render localized evidence on the Publish &
  Index page.
- Non-goal and safety boundary: no backend route change, no publish/repair
  command change, no current-index pointer mutation, no index package mutation,
  no NAS writes, no read-model rebuild, no Docker deployment, no Cutter protocol
  change, and no dashboard/usage-events completion claim.
- Professional review: Project Architect confirms this keeps Query API evidence
  visible without mixing it with release/index mutation semantics. Delivery Lead
  confirms it is read-only client/UI plumbing.

R.264 implemented traceability:

- `apps/admin-web/src/api.ts` adds optional runtime metadata to
  `AdminIndexVersionsResponse`.
- `apps/admin-web/src/admin-operations-client.ts` preserves
  `/api/admin/index/versions` `meta.runtime` by using `getJsonWithMeta(...)`.
- `apps/admin-web/src/app/runtime-observability-labels.ts` localizes
  index-version runtime component names.
- `apps/admin-web/src/features/index-publish/IndexPublishPage.tsx` renders
  `索引版本扫描证据` with version read scan mode, reason, source, window,
  slow status, and component timings.
- `apps/admin-web/src/admin-operations-client.test.ts` verifies the runtime
  metadata path, and `apps/admin-web/src/admin-app.test.ts` verifies the
  localized Publish & Index evidence and raw-name leakage guard.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-operations-client.test.ts`
  passed `4` tests; `node --test --import tsx apps/admin-web/src/admin-app.test.ts`
  passed `65` tests; `node --test --import tsx
  apps/admin-web/src/features/admin-ui-contract.test.ts` passed `5` tests;
  `npm run typecheck` passed; `git diff --check -- ...` passed for the touched
  R.264 files.
- Remaining gap: first-pass route evidence is now visible for source-videos,
  preprocess jobs, and index versions, but real local runtime comparison,
  dashboard stats, usage-events aggregation, Protection Gate coverage,
  redundancy cleanup, Docker gates, and full Admin Architecture v1 remain
  incomplete.

R.265 planned traceability:

- Requirement coverage: Phase 0 baseline/evidence quality, Phase 2 route-local
  loading, and Phase 3 Admin read model / Query API governance. This converts
  the high-risk route evidence from page surfaces into a repeatable acceptance
  report and gate.
- Planned implementation boundary: preserve route-level scan-mode counters in
  `admin-real-nas-performance.ts`, derive a high-risk route evidence matrix in
  `admin-real-nas-performance-isolated.ts`, and fail isolated acceptance when
  the required route families do not expose runtime/source/scan/component
  evidence.
- Non-goal and safety boundary: no backend route optimization, no command
  execution, no reconcile/rebuild, no NAS writes, no source-video manifest or
  `library.json` mutation, no release/index mutation, no Docker deployment, no
  Cutter protocol change, and no full-goal completion claim.
- Professional review: Project Architect confirms the slice keeps runtime
  evidence attached to Query/read-model behavior instead of UI-only claims.
  Delivery Lead confirms it is read-only acceptance infrastructure over GET
  probes.

R.265 implemented traceability:

- `scripts/acceptance/admin-real-nas-performance.ts` now summarizes route-level
  `scan_modes` from response `meta.runtime` and renders scan mode in the Runtime
  Source Summary.
- `scripts/acceptance/admin-real-nas-performance-isolated.ts` now includes
  `high_risk_route_runtime_evidence` for `source_videos_processing`,
  `source_videos_index_required`, `preprocess_jobs`, and `index_versions`.
- The isolated report now includes high-risk route evidence counts and a
  `high-risk-route-runtime-evidence-complete` gate. The gate blocks when any
  required route lacks endpoint samples, runtime samples, actual data source,
  scan mode, or component timing evidence.
- `scripts/acceptance/admin-real-nas-performance-isolated.test.ts` verifies the
  passing and failing gate paths, evidence matrix contents, scan-mode counters,
  and Markdown rendering. `scripts/acceptance/admin-real-nas-performance.test.ts`
  continues to verify read-only probes and required runtime component contracts.
- Verification passed:
  `node --test --import tsx scripts/acceptance/admin-real-nas-performance-isolated.test.ts`
  passed `4` tests; `node --test --import tsx
  scripts/acceptance/admin-real-nas-performance.test.ts` passed `3` tests;
  `npm run typecheck` passed.
- Live local real-library evidence passed in
  `docs/acceptance/artifacts/admin-real-nas-performance-isolated-20260627T140122Z.md`
  and `docs/acceptance/artifacts/admin-real-nas-performance-20260627T140123Z.md`:
  `20` GET endpoints, `0` failed samples, `0` slow gates, `0` runtime repairs,
  `0` runtime component contract failures, and `0 / 4` high-risk route evidence
  failures. High-risk route p95 values were processing `81.5ms`,
  index-required `230.5ms`, preprocess jobs `447.0ms`, and index versions
  `286.2ms`.
- Remaining gap: R.265 improves runtime acceptance discipline, but it does not
  complete dashboard stats, usage-events aggregation, deeper read-model/Query
  optimization, Protection Gate coverage, redundancy cleanup, Docker gates, or
  full Admin Architecture v1.

R.266 planned traceability:

- Requirement coverage: Phase 2 route-local loading and Phase 3 Admin read
  model / Query API governance for Dashboard background aggregation and
  usage-metrics provenance.
- Planned implementation boundary: make `/api/admin/dashboard/metrics` top-level
  runtime metadata derive `data_source` and `scan_mode` from the actual
  dashboard metrics result, then add a background aggregation evidence gate to
  the isolated performance report.
- Non-goal and safety boundary: no Dashboard UI rewrite, no metrics algorithm
  replacement, no usage-events rebuild, no read-model reconcile, no command
  execution, no NAS writes, no source-video manifest or `library.json`
  mutation, no release/index mutation, no Docker deployment, no Cutter protocol
  change, and no full-goal completion claim.
- Professional review: Project Architect confirms this fixes a telemetry
  correctness gap before deeper performance decisions. Delivery Lead confirms
  it is read-only runtime metadata and acceptance reporting.

R.266 implemented traceability:

- `packages/admin-api/src/admin-slow-read-routes.ts` now derives Dashboard
  runtime `scan_mode` from `result.actual_data_source` and sets top-level
  `data_source` to the actual dashboard metrics source. Read-model results
  report `no-scan/admin-read-model`; raw usage/source/transcript scan sources
  still report `status-scan`.
- `packages/admin-api/src/admin-slow-read-routes.test.ts` verifies both
  usage-events and read-model Dashboard runtime metadata paths, including
  preserved `usage_metrics` component evidence.
- `scripts/acceptance/admin-real-nas-performance-isolated.ts` now includes
  `background_aggregation_runtime_evidence`, background evidence counts,
  Markdown output, and the
  `background-aggregation-runtime-evidence-complete` gate. The gate requires
  `dashboard_metrics` to be a background endpoint and expose the `usage_metrics`
  component.
- `scripts/acceptance/admin-real-nas-performance-isolated.test.ts` verifies
  passing and failing background aggregation evidence.
- Verification passed:
  `node --test --import tsx packages/admin-api/src/admin-slow-read-routes.test.ts`
  passed `7` tests; `node --test --import tsx
  scripts/acceptance/admin-real-nas-performance-isolated.test.ts` passed `4`
  tests; `node --test --import tsx scripts/acceptance/admin-real-nas-performance.test.ts`
  passed `3` tests; `npm run typecheck` passed.
- Live local real-library evidence passed in
  `docs/acceptance/artifacts/admin-real-nas-performance-isolated-20260627T140958Z.md`
  and `docs/acceptance/artifacts/admin-real-nas-performance-20260627T140959Z.md`:
  `20` GET endpoints, `0` failed samples, `0` slow gates, `0` runtime repairs,
  `0` runtime component contract failures, `0 / 4` high-risk route evidence
  failures, and `0 / 1` background aggregation evidence failures.
  `dashboard_metrics` was `background`, `admin-read-model=3`, `no-scan=3`,
  and exposed `usage_metrics max 112.0ms`.
- Remaining gap: R.266 corrects Dashboard runtime evidence and gates background
  aggregation, but it does not complete deeper usage-events resilience,
  dashboard redesign, Protection Gate coverage, redundancy cleanup, Docker
  gates, or full Admin Architecture v1.

R.267 planned traceability:

- Requirement coverage: Phase 3 Admin read model / Query API governance and the
  Phase 6 usage-events release-gate line item. This makes usage metrics
  projection lifecycle states visible in runtime evidence.
- Planned implementation boundary: extend `readAdminUsageMetricsWithRuntime(...)`
  to return projection status/path, preserve that metadata through Dashboard
  metrics, and expose it on the `usage_metrics` runtime component.
- Non-goal and safety boundary: no usage-events file format change, no Cutter
  usage writer change, no repair command, no read-model rebuild, no NAS writes,
  no `library.json` or source-video manifest mutation, no release/index
  mutation, no Docker deployment, and no full usage-events release-gate
  completion claim.
- Professional review: Project Architect confirms this improves read-model
  provenance and avoids treating projection persistence as a hidden black box.
  Delivery Lead confirms it is non-destructive read-path metadata and tests.

R.267 implemented traceability:

- `packages/admin-api/src/admin-usage-metrics-query.ts` now returns
  `projection_status` and `projection_path` with runtime results. Statuses
  distinguish `summary-hit`, `summary-stored`, `summary-write-failed`, and
  `usage-events-changed-during-read`.
- `packages/admin-api/src/admin-usage-metrics-query.test.ts` verifies summary
  storage, summary hits, invalidation after file changes, missing file reuse,
  no-store behavior when usage-events changes during a raw read, and observable
  summary write failures that do not fail dashboard reads.
- `packages/admin-api/src/admin-dashboard-metrics-query.ts` records
  `usage_metrics` component `cache_status` and
  `detail=usage_projection=...`.
- `packages/admin-api/src/admin-dashboard-read-facade.ts` preserves projection
  metadata from the usage runtime wrapper into Dashboard metrics.
- Verification passed:
  `node --test --import tsx packages/admin-api/src/admin-usage-metrics-query.test.ts`
  passed `6` tests; `node --test --import tsx
  packages/admin-api/src/admin-dashboard-metrics-query.test.ts` passed `4`
  tests; `node --test --import tsx
  packages/admin-api/src/admin-dashboard-read-facade.test.ts` passed `3` tests;
  `node --test --import tsx packages/admin-api/src/admin-dashboard-read-services.test.ts`
  passed `3` tests; `node --test --import tsx
  scripts/acceptance/admin-real-nas-performance-isolated.test.ts` passed `4`
  tests; `node --test --import tsx scripts/acceptance/admin-real-nas-performance.test.ts`
  passed `3` tests; `npm run typecheck` passed.
- Live local real-library evidence passed in
  `docs/acceptance/artifacts/admin-real-nas-performance-isolated-20260627T141640Z.md`
  and `docs/acceptance/artifacts/admin-real-nas-performance-20260627T141641Z.md`:
  `20` GET endpoints, `0` failed samples, `0` slow gates, `0` runtime repairs,
  `0` runtime component contract failures, `0 / 4` high-risk route evidence
  failures, and `0 / 1` background aggregation evidence failures. Dashboard
  `usage_metrics` reported `admin-read-model=1`, `no-scan=1`, `hit=1`, and
  `usage_projection=summary-hit=1`.
- Remaining gap: R.267 makes projection states visible but does not complete
  usage-events repair tooling, Docker publication gates, System Check/Protection
  Center surfacing, redundancy cleanup, or full Admin Architecture v1.

R.268 planned traceability:

- Requirement coverage: Phase 6 Docker release gate with usage-events
  tolerance/repair evidence, plus Protection Center surfacing for the same
  contract.
- Planned implementation boundary: expose `usage_events_repair` from
  `/api/admin/release-gates`, carry it through operations overview and the
  Protection Center fixture/UI, and require the contract in Docker static/live
  readiness scripts.
- Non-goal and safety boundary: no usage-events apply execution, no NAS writes,
  no source-video manifest mutation, no ready artifact mutation, no release/index
  mutation, no Cutter writer/protocol change, no Docker deployment, and no full
  release-gate completion claim.
- Professional review: Project Architect confirms this advances the Protection
  Gate/release-gate architecture rather than hiding malformed events behind a
  tolerant reader. Delivery Lead confirms this is evidence/contract surfacing
  only; actual repair remains a separate reviewed maintenance action.

R.268 implemented traceability:

- `packages/admin-api/src/admin-release-gates.ts` adds
  `usage_events_repair` and `repair_readiness` gate details with event file,
  projection file, dry-run/apply commands, backup/quarantine paths, artifact
  pattern, safe scope, and no-ready/no-Cutter mutation flags.
- `packages/admin-api/src/admin-protection-query.test.ts`,
  `packages/admin-api/src/admin-operations-overview.test.ts`,
  `packages/admin-api/src/admin-read-model-routes.test.ts`, and
  `packages/admin-api/src/index.test.ts` verify clean and malformed usage-events
  release-gate behavior plus operations/read-model route propagation.
- `apps/admin-web/src/api.ts`,
  `apps/admin-web/src/fixtures/admin-fixture-operations-overview.ts`,
  `apps/admin-web/src/features/protection/ProtectionCenterPage.tsx`, and
  `apps/admin-web/src/api.test.ts` carry and surface the same repair-readiness
  contract in the Protection Center without changing Admin commands.
- `scripts/acceptance/admin-docker-release-gate-dry-run.ts` now requires
  archived usage-events repair dry-run evidence before Docker upload review;
  `scripts/acceptance/admin-docker-release-live-readonly.ts` adds
  `usage-events-repair-contract-live` so old deployed Admin APIs without the
  repair contract remain blocked.
- Verification passed: focused backend/API/web/Docker tests (`9 + 40 + 3`),
  Admin App render tests (`65`), Admin API integration tests (`69`),
  `npm run typecheck`, and targeted whitespace scan.
- Read-only artifacts: `admin-docker-release-gate-dry-run-20260627T143231Z.md`,
  `admin-docker-release-live-readonly-20260627T143231Z.md`, and
  `usage-events-repair-20260627T143250Z.md`. The real Mac SMB usage-events
  dry-run saw `10155` valid rows, `0` malformed rows, and `changed=false`.
- Remaining gap: R.268 completes the usage-events repair-readiness contract but
  not V001440 live recovery proof, NAS disk-space live proof, Docker
  health/version parity, admin-worker live flags, Cutter compatibility proof,
  or full Admin Architecture v1.

R.269 planned traceability:

- Requirement coverage: Phase 6 V001440/processing recovery Docker release gate,
  with Phase 1 protection semantics for safe recovery boundaries.
- Planned implementation boundary: expose `processing_recovery` from
  `/api/admin/release-gates`, carry it through operations overview and
  Protection Center fixture/UI, and require the contract in Docker static/live
  readiness scripts.
- Non-goal and safety boundary: no recovery POST execution, no NAS writes, no
  source-video manifest mutation, no ready artifact mutation, no release/index
  mutation, no worker start/stop, no Cutter writer/protocol change, no Docker
  deployment, and no live recovery completion claim.
- Professional review: Project Architect confirms this advances the recovery
  gate architecture and avoids converting a release blocker into a blind POST
  action. Delivery Lead confirms it only exposes preflight/command boundaries
  and keeps actual recovery as a separate reviewed maintenance action.

R.269 implemented traceability:

- `packages/admin-api/src/admin-release-gates.ts` adds `processing_recovery`
  and nested `recovery_readiness` gate details with processing counts, sampled
  IDs, preflight GET endpoints, recovery POST endpoint descriptions, idle
  supervisor requirement, safe scope, and no-ready/no-Cutter mutation flags.
- `packages/admin-api/src/admin-protection-query.test.ts`,
  `packages/admin-api/src/admin-operations-overview.test.ts`, and
  `packages/admin-api/src/admin-read-model-routes.test.ts` verify clear and
  preflight-required processing recovery gate behavior plus operations/read-model
  propagation.
- `apps/admin-web/src/api.ts`,
  `apps/admin-web/src/fixtures/admin-fixture-operations-overview.ts`,
  `apps/admin-web/src/features/protection/ProtectionCenterPage.tsx`, and
  `apps/admin-web/src/api.test.ts` carry and surface the same recovery-readiness
  contract in Protection Center without adding a recovery command to the page.
- `scripts/acceptance/admin-docker-release-gate-dry-run.ts` now requires live
  `processing_recovery` proof and archived GET preflight evidence;
  `scripts/acceptance/admin-docker-release-live-readonly.ts` adds
  `processing-recovery-contract-live` so old deployed Admin APIs without the
  recovery contract remain blocked.
- Verification passed: focused backend/API/web/Docker tests (`10 + 40`), Admin
  API integration tests (`69`), Admin App render tests (`65`),
  `npm run typecheck`, and targeted whitespace scan.
- Read-only artifacts:
  `admin-docker-release-gate-dry-run-20260627T144209Z.md` and
  `admin-docker-release-live-readonly-20260627T144209Z.md`. No recovery command
  was executed.
- Remaining gap: R.269 completes the processing recovery readiness contract but
  not an actual reviewed V001440 recovery, NAS disk-space live proof, Docker
  health/version parity, admin-worker live flags, Cutter compatibility proof, or
  full Admin Architecture v1.

R.270 planned traceability:

- Requirement coverage: Phase 6 NAS disk-space protection Docker release gate,
  with Phase 1 preprocessing safety semantics for write blocking.
- Planned implementation boundary: expose `disk_space_protection` from
  `/api/admin/release-gates`, carry it through operations overview and
  Protection Center fixture/UI, and require the contract in Docker static/live
  readiness scripts.
- Non-goal and safety boundary: no Docker upload, no container start, no worker
  start, no NAS write, no source-video manifest mutation, no ready artifact
  mutation, no release/index mutation, no V001440 recovery, no usage-events
  apply, no Cutter writer/protocol change, and no physical storage remediation
  claim.
- Professional review: Project Architect confirms this advances the release-gate
  architecture by making NAS disk pressure an explicit contract instead of a
  raw status row. Delivery Lead confirms it only exposes GET preflight evidence
  and keeps any storage cleanup or deploy as a separate reviewed action.

R.270 implemented traceability:

- `packages/admin-api/src/admin-release-gates.ts` adds
  `disk_space_protection` and nested `disk_space_protection` gate details with
  disk byte counts, configured threshold, attention threshold, GET preflight
  endpoints, write-block scope, no-worker-start flag, and no-ready/no-Cutter
  mutation flags.
- `packages/admin-api/src/admin-protection-query.test.ts`,
  `packages/admin-api/src/admin-operations-overview.test.ts`, and
  `packages/admin-api/src/admin-read-model-routes.test.ts` verify healthy and
  blocked disk-space gate behavior plus operations/read-model propagation.
- `apps/admin-web/src/api.ts`,
  `apps/admin-web/src/fixtures/admin-fixture-operations-overview.ts`,
  `apps/admin-web/src/features/protection/ProtectionCenterPage.tsx`, and
  `apps/admin-web/src/api.test.ts` carry and surface the same disk-space
  protection contract in Protection Center without adding any storage or worker
  command.
- `scripts/acceptance/admin-docker-release-gate-dry-run.ts` now requires live
  `disk_space_protection` proof and archived GET release-gates/safety/library
  status evidence; `scripts/acceptance/admin-docker-release-live-readonly.ts`
  adds `disk-space-protection-contract-live` so old deployed Admin APIs without
  the disk-space contract remain blocked.
- Verification passed: focused backend/API/web/Docker tests (`11 + 40`), Admin
  API integration tests (`69`), Admin App render tests (`65`),
  `npm run typecheck`, and targeted whitespace scan.
- Read-only artifacts:
  `admin-docker-release-gate-dry-run-20260627T145208Z.md` and
  `admin-docker-release-live-readonly-20260627T145209Z.md`. The dry-run passed
  static compose checks but kept Docker upload blocked on `6` live proof gates;
  live-readonly stayed blocked because no NAS Docker target URL was configured
  and now includes `disk-space-protection-contract-live`.
- Remaining gap: R.270 completes the disk-space protection readiness contract
  but not physical NAS storage remediation, live Docker health/version parity,
  admin-worker live flags, Cutter compatibility proof, or full Admin
  Architecture v1.

R.271 planned traceability:

- Requirement coverage: Phase 6 Docker version/health parity gate, with
  explicit separation between API-reported build identity and external Docker
  runtime proof.
- Planned implementation boundary: expose `version_health_parity` from
  `/api/admin/release-gates`, carry it through operations overview and
  Protection Center fixture/UI, require the contract in Docker static/live
  readiness scripts, and make the archived Docker version-parity plan read the
  same contract when available.
- Non-goal and safety boundary: no Docker image build, no Docker push, no Docker
  upload, no container restart, no worker start, no NAS write, no source-video
  manifest mutation, no ready artifact mutation, no release/index mutation, no
  usage-events apply, no V001440 recovery, no Cutter writer/protocol change, and
  no claim that live NAS Docker parity is proven.
- Professional review: Project Architect confirms this advances release-gate
  architecture by preventing local build metadata from being confused with live
  NAS Docker parity. Delivery Lead confirms the slice only exposes read-only
  contracts and required external proof; any deploy or runtime inspection remains
  a separate reviewed release action.

R.271 implemented traceability:

- `packages/admin-api/src/admin-release-gates.ts` adds
  `version_health_parity` and nested `version_health_parity` gate details with
  build sha, build version, image tag, expected Admin services, GET health
  preflight endpoints, live probe command, external Docker proof requirements,
  safe scope, no-worker-start flag, and no-ready/no-Cutter mutation flags.
- `packages/admin-api/src/admin-protection-query.test.ts`,
  `packages/admin-api/src/admin-operations-overview.test.ts`, and
  `packages/admin-api/src/admin-read-model-routes.test.ts` verify ready and
  incomplete version-health parity behavior plus operations/read-model
  propagation.
- `apps/admin-web/src/api.ts`,
  `apps/admin-web/src/fixtures/admin-fixture-operations-overview.ts`,
  `apps/admin-web/src/features/protection/ProtectionCenterPage.tsx`, and
  `apps/admin-web/src/api.test.ts` carry and surface the same parity contract in
  Protection Center without adding deploy or worker controls.
- `scripts/acceptance/admin-docker-release-gate-dry-run.ts` now requires live
  `version_health_parity` proof; `scripts/acceptance/admin-docker-release-live-readonly.ts`
  adds `version-health-parity-contract-live`; and
  `scripts/acceptance/admin-docker-version-parity-plan.ts` reads the archived
  contract from live-readonly evidence.
- Verification passed: focused backend/API/web/Docker/version tests (`12 + 42`),
  Admin API integration tests (`69`), Admin App render tests (`65`), Docker
  readiness summary tests (`4`), focused version-parity rerun (`2`),
  and `npm run typecheck`.
- Read-only artifacts:
  `admin-docker-release-gate-dry-run-20260627T150126Z.md`,
  `admin-docker-release-live-readonly-20260627T150126Z.md`, and
  `admin-docker-version-parity-plan-20260627T150212Z.md`. The live-readonly and
  parity artifacts remained blocked because no explicit NAS Docker target URL
  was configured, and now include the version-health parity contract blocker.
- Remaining gap: R.271 completes the version/health parity readiness contract
  but not targeted NAS Docker live proof, admin-worker env proof, Cutter
  compatibility proof, a deploy rehearsal, or full Admin Architecture v1.

R.272 planned traceability:

- Requirement coverage: Phase 6 admin-worker environment proof gate, with
  path/environment isolation and standalone worker default-disabled safety
  semantics.
- Planned implementation boundary: expose `admin_worker_env_proof` from
  `/api/admin/release-gates`, carry it through operations overview and
  Protection Center fixture/UI, require the contract in Docker static/live
  readiness scripts, and make the archived Docker version-parity plan classify a
  missing worker-proof contract as API/image parity drift.
- Non-goal and safety boundary: no Docker image build, no Docker push, no Docker
  upload, no container restart, no worker start, no NAS write, no source-video
  manifest mutation, no ready artifact mutation, no release/index mutation, no
  usage-events apply, no processing recovery, no Cutter writer/protocol change,
  no secret capture into reports, and no claim that live admin-worker env proof
  has already been accepted.
- Professional review: Project Architect confirms this advances release-gate
  architecture by separating a worker-proof contract from actual Docker env
  evidence. Delivery Lead confirms the slice is read-only/contract-only and
  keeps real env/inspect evidence as a later release action.

R.272 implemented traceability:

- `packages/admin-api/src/admin-release-gates.ts` adds
  `admin_worker_env_proof` and an `admin-worker-env-proof` attention gate with
  nested `env_proof_readiness` details: required disabled standalone worker
  flags, required `/data/PublicLibrary` roots, proof command, collection
  commands, artifact pattern, no-worker-start flag, no-secret-recording flag,
  and no-ready/no-Cutter mutation flags.
- `packages/admin-api/src/admin-protection-query.test.ts`,
  `packages/admin-api/src/admin-operations-overview.test.ts`, and
  `packages/admin-api/src/admin-read-model-routes.test.ts` verify the new
  contract and keep it propagated through operations/read-model dependencies.
- `apps/admin-web/src/api.ts`,
  `apps/admin-web/src/fixtures/admin-fixture-operations-overview.ts`,
  `apps/admin-web/src/features/protection/ProtectionCenterPage.tsx`, and
  `apps/admin-web/src/api.test.ts` carry and surface the worker env proof
  contract in Protection Center without adding worker-start, deploy, or NAS
  mutation controls.
- `scripts/acceptance/admin-docker-release-gate-dry-run.ts` now requires live
  `admin_worker_env_proof` contract and `admin-worker-env-proof` evidence;
  `scripts/acceptance/admin-docker-release-live-readonly.ts` adds
  `admin-worker-env-proof-contract-live`; and
  `scripts/acceptance/admin-docker-version-parity-plan.ts` blocks on
  `admin-worker-env-proof-contract` when the archived live-readonly evidence
  lacks the contract.
- `scripts/acceptance/admin-docker-release-readiness-summary.ts` now lists a
  missing `admin_worker_env_proof` contract as an image/API update action
  separately from collecting real env/inspect proof.
- Verification passed: focused backend tests (`12`), focused web/Docker/worker
  tests (`49`), Admin API integration tests (`69`), Admin App render tests
  (`65`), `npm run typecheck`, targeted `git diff --check`, and targeted
  trailing-whitespace scan.
- Read-only artifacts:
  `admin-docker-release-gate-dry-run-20260627T151503Z`,
  `admin-docker-release-live-readonly-20260627T151509Z`,
  `admin-docker-version-parity-plan-20260627T151516Z`,
  `admin-worker-env-proof-20260627T151522Z`, and
  `admin-docker-release-readiness-summary-20260627T151533Z`.
- Remaining gap: R.272 completes the admin-worker env proof release-gate
  contract but does not collect or accept real NAS admin-worker env/inspect
  evidence, target live NAS Docker, resolve disk/API parity blockers, run Cutter
  compatibility proof, stage Docker, deploy Docker, or complete full Admin
  Architecture v1.

R.273 planned traceability:

- Requirement coverage: Phase 6 Cutter compatibility proof gate, with explicit
  protection of current Cutter release/index/search protocol compatibility before
  any Docker update.
- Planned implementation boundary: expose `cutter_compatibility_proof` from
  `/api/admin/release-gates`, carry it through operations overview and
  Protection Center fixture/UI, require the contract in Docker static/live
  readiness scripts, and make the archived Docker version-parity plan classify a
  missing Cutter-proof contract as API/image parity drift.
- Non-goal and safety boundary: no Windows Runner execution, no Cutter app
  launch, no Docker image build, no Docker push, no Docker upload, no container
  restart, no worker start, no NAS write, no source-video manifest mutation, no
  ready artifact mutation, no release/index mutation, no usage-events apply, no
  processing recovery, no Cutter writer/protocol change, and no claim that live
  Cutter compatibility proof has already been accepted.
- Professional review: Project Architect confirms this advances release-gate
  architecture by separating a Cutter-proof contract from actual Windows Runner
  evidence. Delivery Lead confirms the slice is read-only/contract-only and
  keeps real Windows acceptance/real-cut evidence as a later release action.

R.273 implemented traceability:

- `packages/admin-api/src/admin-release-gates.ts` adds
  `cutter_compatibility_proof` and a `cutter-compatibility-proof` attention gate
  with expected ready count, reviewed auth requirement, Windows acceptance and
  real-cut report env var names, optional screenshot report env var name, proof
  command, artifact pattern, staged-candidate requirement, no-Windows-runner and
  no-Docker-contact flags, and no-ready/no-Cutter mutation flags.
- `packages/admin-api/src/admin-protection-query.test.ts`,
  `packages/admin-api/src/admin-operations-overview.test.ts`, and
  `packages/admin-api/src/admin-read-model-routes.test.ts` verify the new
  contract and keep it propagated through operations/read-model dependencies.
- `apps/admin-web/src/api.ts`,
  `apps/admin-web/src/fixtures/admin-fixture-operations-overview.ts`,
  `apps/admin-web/src/features/protection/ProtectionCenterPage.tsx`, and
  `apps/admin-web/src/api.test.ts` carry and surface the Cutter proof contract
  in Protection Center without adding Windows Runner, deploy, or protocol
  mutation controls.
- `scripts/acceptance/admin-docker-release-gate-dry-run.ts` now requires live
  `cutter_compatibility_proof` contract and `admin-cutter-compatibility-proof`
  evidence; `scripts/acceptance/admin-docker-release-live-readonly.ts` adds
  `cutter-compatibility-proof-contract-live`; and
  `scripts/acceptance/admin-docker-version-parity-plan.ts` blocks on
  `cutter-compatibility-proof-contract` when archived live-readonly evidence
  lacks the contract.
- `scripts/acceptance/admin-docker-release-readiness-summary.ts` now lists a
  missing `cutter_compatibility_proof` contract as an image/API update action
  separately from collecting real Windows acceptance and real-cut proof.
- Verification passed: focused backend tests (`12`), focused web/Docker/Cutter
  tests (`52`), Admin API integration tests (`69`), Admin App render tests
  (`65`), and `npm run typecheck`.
- Read-only artifacts:
  `admin-docker-release-gate-dry-run-20260627T152607Z`,
  `admin-docker-release-live-readonly-20260627T152620Z`,
  `admin-docker-version-parity-plan-20260627T152927Z`,
  `admin-cutter-compatibility-proof-20260627T152927Z`, and
  `admin-docker-release-readiness-summary-20260627T152933Z`.
- Remaining gap: R.273 completes the Cutter compatibility proof release-gate
  contract but does not run Windows Runner, accept real staged-candidate Cutter
  proof, target live NAS Docker, resolve worker/disk/API parity blockers, stage
  Docker, deploy Docker, or complete full Admin Architecture v1.

R.274 planned traceability:

- Requirement coverage: Phase 6 targeted NAS Docker live-readonly evidence
  quality, with explicit separation between NAS desktop access, Mac localhost,
  and real NAS Docker admin-web evidence.
- Planned implementation boundary: classify
  `MIXLAB_ADMIN_DOCKER_LIVE_BASE_URL` before probing, expose the classification
  in live-readonly JSON/Markdown/gates, refuse to probe unsafe targets, and make
  the Docker version/API parity plan reject unsafe live-readonly artifacts.
- Non-goal and safety boundary: no NAS port guessing, no credential discovery,
  no Docker image build, no Docker push, no Docker upload, no container restart,
  no worker start, no NAS write, no source-video manifest mutation, no ready
  artifact mutation, no release/index mutation, no usage-events apply, no
  processing recovery, no Windows Runner execution, no Cutter launch, and no
  claim that live NAS Docker parity is proven.
- Professional review: Project Architect confirms this advances release-gate
  architecture by preventing environment-routing mistakes from being treated as
  API/version parity facts. Delivery Lead confirms the slice is read-only and
  only improves evidence classification.

R.274 implemented traceability:

- `scripts/acceptance/admin-docker-release-live-readonly.ts` adds
  `classifyLiveReadonlyTarget(...)`, target fields `normalized_base_url`,
  `kind`, `safe_to_probe`, `classification_evidence`, and
  `classification_notes`, plus a `target-url-admin-web-shape` gate.
- Unsafe live-readonly targets are classified as `not-configured`,
  `invalid-url`, `local-loopback`, `nas-desktop-url`, or `non-root-path` and do
  not run network probes. Only root `http://` or `https://` non-loopback
  admin-web-shaped URLs are `safe_to_probe=true`.
- `scripts/acceptance/admin-docker-version-parity-plan.ts` carries
  `target.kind`, `target.safe_to_probe`, `observations.live_target_kind`, and
  `observations.live_target_safe_to_probe`, and keeps `live-artifact-targeted`
  blocked when a configured target is not safe admin-web evidence.
- `scripts/acceptance/admin-docker-release-live-readonly.test.ts` and
  `scripts/acceptance/admin-docker-version-parity-plan.test.ts` verify
  GET-only probes, missing target behavior, NAS desktop URL blocking, localhost
  blocking, non-root path blocking, valid admin-web root behavior, markdown
  target notes, legacy API drift, release-gate failures, token redaction, and
  parity-plan rejection of unsafe NAS desktop artifacts.
- Verification passed: focused live-readonly and version-parity tests (`11`).
- Read-only artifacts:
  `admin-docker-release-live-readonly-20260627T153752Z`,
  `admin-docker-release-live-readonly-20260627T153801Z`,
  `admin-docker-version-parity-plan-20260627T153808Z`, and
  `admin-docker-release-readiness-summary-20260627T153817Z`.
- Remaining gap: R.274 prevents wrong-target evidence from being accepted but
  does not provide the real NAS Docker admin-web URL, prove live Admin API
  parity, collect worker env proof, run Cutter compatibility proof, stage
  Docker, deploy Docker, or complete full Admin Architecture v1.

R.275 planned traceability:

- Requirement coverage: Phase 6 targeted NAS Docker live-readonly evidence and
  Docker version/API parity classification.
- Planned implementation boundary: observe documented/default admin-web
  candidates `8080` and `18080`, run the GET-only live-readonly probe against
  the reachable NAS admin-web root, feed that artifact into version/API parity
  and release-readiness summaries, and record the result without changing Docker
  or NAS state.
- Non-goal and safety boundary: no NAS port scanning beyond the documented
  candidates, no credentials, no Docker image build, no Docker push, no Docker
  upload, no container restart, no worker start, no NAS write, no source-video
  manifest mutation, no ready artifact mutation, no release/index mutation, no
  usage-events apply, no processing recovery, no Windows Runner execution, no
  Cutter launch, and no claim that live NAS Docker is ready.
- Professional review: Project Architect confirms the slice treats NAS Docker as
  operational evidence separate from local architecture correctness. Delivery
  Lead confirms the slice is GET-only and preserves all release blockers.

R.275 implemented traceability:

- `curl --noproxy '*' -I http://192.168.1.27:8080/` failed to connect; the
  compose-default port is not currently the reachable admin-web target.
- `curl --noproxy '*' -I http://192.168.1.27:18080/` returned `HTTP 200` from
  nginx; `admin-docker-release-live-readonly-20260627T154159Z` used that root.
- The live-readonly artifact shows target classification `admin-web-url`,
  `safe_to_probe=true`, GET-only probes, admin-web root `HTTP 200`, Admin API
  proxy partially reachable, library root `/data/PublicLibrary`, current index
  `v010471`, `11394` total videos, `10471` ready videos, `904` queued videos,
  `19` index-required videos, and dashboard disk `status=blocked` with
  `usage_percent=98`.
- The same artifact proves NAS Docker still serves an older Admin API contract:
  `/api/admin/auth/status`, `/api/admin/release-gates`, and
  `/api/admin/data-loading/plan` returned `404`.
- `admin-docker-version-parity-plan-20260627T154221Z` marks the live target,
  admin-web root, API proxy, and Docker library root parity as pass, but blocks
  upload on current Admin API contract parity, missing version-health contract,
  missing admin-worker env proof contract, missing Cutter compatibility proof
  contract, NAS disk risk, and external worker/Cutter proofs.
- `admin-docker-release-readiness-summary-20260627T154222Z` keeps release review
  blocked and `docker_upload_allowed=false`.
- Remaining gap: R.275 proves the current NAS admin-web state but does not
  update/stage the Docker image, resolve disk pressure, collect worker env
  proof, run Cutter compatibility proof, regenerate staging tags, deploy Docker,
  or complete full Admin Architecture v1.

R.276 planned traceability:

- Requirement coverage: Admin Docker candidate readiness planning after the
  R.275 live mismatch showed the reachable NAS target is operational but still
  serves the old Admin API contract.
- Planned implementation boundary: convert the live mismatch into an executable
  non-mutating release-candidate plan that separates local candidate proof from
  NAS live proof, names the required current Admin API, health/version,
  admin-worker, disk, Cutter, staging-tag, and rollback gates, and identifies
  the next code-bearing contract only if an actual machine-checkable gap remains.
- Non-goal and safety boundary: no NAS Docker upload, no image push, no compose
  restart, no worker start, no NAS write, no source-video manifest mutation, no
  ready artifact mutation, no release/index mutation, no usage-events apply, no
  processing recovery, no Windows Runner execution, no Cutter launch, and no
  deployment approval.
- Professional review: Project Architect must confirm the plan does not shrink
  `Admin Architecture v1` into Docker publication or endpoint patching.
  Delivery Lead must confirm all release-candidate gates keep
  `docker_upload_allowed=false` until API parity, disk, worker proof, Cutter
  proof, staging tags, and rollback evidence pass.

R.276 implemented traceability:

- `npx tsx scripts/acceptance/admin-docker-staging-runbook.ts` generated
  `docs/acceptance/artifacts/admin-docker-staging-runbook-20260627T154821Z.json`
  and `.md` without Docker, NAS, worker, Windows, Cutter, ready-asset, release,
  or index side effects.
- The runbook consumed the latest R.275 parity evidence plus existing worker
  and Cutter proof artifacts:
  `admin-docker-version-parity-plan-20260627T154221Z.json`,
  `admin-worker-env-proof-20260627T151522Z.json`, and
  `admin-cutter-compatibility-proof-20260627T152927Z.json`.
- Result: `staging_review_ready=false`, `docker_deploy_allowed=false`, passed
  gates `4`, blocked gates `8`.
- Staging blockers: missing current/target/rollback image tags, target tag not
  proven different from current, rollback tag not proven to match current,
  parity blockers not clear, admin-worker env proof not accepted, and Cutter
  compatibility proof not accepted.
- Verification passed:
  `node --test --import tsx scripts/acceptance/admin-docker-staging-runbook.test.ts`
  with `5` passing tests.
- `npx tsx scripts/acceptance/admin-docker-release-readiness-summary.ts`
  regenerated
  `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260627T155042Z.json`
  and `.md` from the R.276 staging runbook. It keeps
  `release_review_ready=false`, `docker_upload_allowed=false`, passed gates `2`,
  blocked gates `5`, and release-review blockers
  `live-readonly-blockers-clear`, `parity-plan-blockers-clear`,
  `worker-proof-accepted`, `cutter-proof-accepted`, and
  `staging-runbook-ready`.
- Verification passed:
  `node --test --import tsx scripts/acceptance/admin-docker-release-readiness-summary.test.ts`
  with `4` passing tests.
- Remaining gap: before any NAS deployment, the next release-candidate slice
  needs a local/staged candidate API/version proof that the target image exposes
  the current Admin Architecture v1 endpoints and release-gate contracts.

R.277 planned traceability:

- Requirement coverage: local or staged Admin Docker candidate API/version
  contract proof.
- Planned implementation boundary: add a GET-only candidate proof script and
  tests that validate current Admin Architecture v1 endpoints and release-gate
  contracts on an explicit candidate URL, while marking loopback/local proof as
  candidate-only and not NAS live release evidence.
- Non-goal and safety boundary: no NAS Docker upload, no image build, no image
  push, no compose restart, no worker start, no NAS write, no source-video
  manifest mutation, no ready artifact mutation, no release/index mutation, no
  usage-events apply, no processing recovery, no Windows Runner execution, no
  Cutter launch, no deployment approval, and no use of candidate proof as a
  substitute for NAS live-readonly evidence.
- Professional review: Project Architect confirms the slice advances the
  release-candidate lane without shrinking the full Admin Architecture v1 goal.
  Delivery Lead confirms it is GET-only and keeps `docker_upload_allowed=false`
  and `staging_approved=false`.

R.277 implemented traceability:

- Added `scripts/acceptance/admin-docker-candidate-contract-proof.ts` and
  `scripts/acceptance/admin-docker-candidate-contract-proof.test.ts`.
- Added `npm run validate:admin-docker-candidate-contract-proof`.
- The validator writes blocked no-request evidence when
  `MIXLAB_ADMIN_DOCKER_CANDIDATE_BASE_URL` is missing, classifies localhost as
  local-candidate-only proof, blocks NAS desktop and non-root target shapes
  before probing, requires GET-only probes, validates the current Admin endpoint
  surface, validates release-gate subcontracts, and hard-codes
  `docker_upload_allowed=false`, `staging_approved=false`, and
  `target.nas_live_evidence=false`.
- Generated default blocked evidence:
  `docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T155900Z.json`
  and `.md`; result `blocked`, requests `0`, passed gates `4`, blocked gates
  `10`.
- Verification passed:
  `node --test --import tsx scripts/acceptance/admin-docker-candidate-contract-proof.test.ts`
  with `6` passing tests.
- Related release-gate regression verification passed:
  `node --test --import tsx scripts/acceptance/admin-docker-candidate-contract-proof.test.ts scripts/acceptance/admin-docker-release-live-readonly.test.ts scripts/acceptance/admin-docker-version-parity-plan.test.ts scripts/acceptance/admin-docker-staging-runbook.test.ts scripts/acceptance/admin-docker-release-readiness-summary.test.ts`
  with `26` passing tests.
- `npm run typecheck` passed.
- Remaining gap: staging/readiness summaries still need to consume candidate
  proof explicitly so release review cannot proceed without accepted candidate
  contract evidence.

R.278 planned traceability:

- Requirement coverage: Docker staging runbook and release-readiness gate chain
  must consume R.277 candidate proof before allowing staging review.
- Planned implementation boundary: wire the latest or explicitly supplied
  `admin-docker-candidate-contract-proof` artifact into the staging runbook,
  expose candidate proof status/blockers in runbook observations, and keep the
  release-readiness summary blocked through the staging runbook when candidate
  proof is missing or blocked.
- Non-goal and safety boundary: no NAS Docker upload, no image build, no image
  push, no compose restart, no worker start, no NAS write, no source-video
  manifest mutation, no ready artifact mutation, no release/index mutation, no
  usage-events apply, no processing recovery, no Windows Runner execution, no
  Cutter launch, and no staging/deployment approval.
- Professional review: Project Architect confirms the proof is being connected
  to the release gate path rather than treated as a standalone artifact.
  Delivery Lead confirms the integration reads archived artifacts only and adds
  a blocker without weakening existing Docker gates.

R.278 implemented traceability:

- `scripts/acceptance/admin-docker-staging-runbook.ts` now consumes a
  candidate contract proof artifact through
  `candidate_contract_proof_report`, records candidate proof readiness and
  blockers, and adds staging blocker `candidate-contract-proof-accepted`.
- The staging runbook preflight and post-update validation steps now require
  candidate API/version contract proof before staging review.
- `scripts/acceptance/admin-docker-release-readiness-summary.ts` now adds a
  next action for `validate:admin-docker-candidate-contract-proof` when the
  staging runbook is blocked by candidate proof.
- Generated
  `docs/acceptance/artifacts/admin-docker-staging-runbook-20260627T160217Z.json`
  and `.md`; it consumes
  `admin-docker-candidate-contract-proof-20260627T155900Z.json`, reports
  `candidate_contract_status=blocked`, `candidate_contract_ready=false`, and
  includes `candidate-contract-proof-accepted` in staging blockers.
- Generated
  `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260627T160315Z.json`
  and `.md`; it keeps release review blocked and lists the candidate-proof
  command in `next_actions`.
- Verification passed:
  `node --test --import tsx scripts/acceptance/admin-docker-candidate-contract-proof.test.ts scripts/acceptance/admin-docker-staging-runbook.test.ts scripts/acceptance/admin-docker-release-readiness-summary.test.ts scripts/acceptance/admin-docker-release-live-readonly.test.ts scripts/acceptance/admin-docker-version-parity-plan.test.ts`
  with `27` passing tests.
- `npm run typecheck` passed, and target-file `git diff --check` plus trailing
  whitespace checks passed.
- Remaining gap: an actual local/staged Admin candidate URL must be provided and
  pass candidate proof before staging review can proceed; NAS live parity,
  worker proof, Cutter proof, disk risk, explicit image tags, and rollback proof
  remain unresolved.

R.279 planned traceability:

- Requirement coverage: Docker candidate proof must accurately model split
  local Admin topology (`5176` Web and `3889` API) without confusing a missing
  Vite proxy with a missing Admin API contract.
- Planned implementation boundary: add an optional API base URL to
  `scripts/acceptance/admin-docker-candidate-contract-proof.ts`, classify Web
  and API roots independently, route `GET /` to Web and `/api/admin/*` to API,
  and preserve existing single-base staged-candidate behavior.
- Non-goal and safety boundary: no NAS Docker upload, no image build, no image
  push, no compose restart, no worker start, no NAS write, no source-video
  manifest mutation, no ready mutation, no release/index mutation, no
  usage-events apply, no processing recovery, no Windows Runner execution, no
  Cutter launch, and no staging/release approval.
- Professional review: Project Architect confirms this prevents an environment
  modeling error from shrinking the full Admin Architecture v1 target. Delivery
  Lead confirms the proof stays GET-only, local/staged target-only, and
  deployment-blocking.

R.279 implemented traceability:

- `scripts/acceptance/admin-docker-candidate-contract-proof.ts` now accepts
  optional `MIXLAB_ADMIN_DOCKER_CANDIDATE_API_BASE_URL`.
- The report target model now records Web base, API base, API configured flag,
  API normalized base, API target kind, API safe-to-probe status, split target
  status, and API classification notes.
- Each probe result can now record `target_role` and `base_url`; `admin_web_root`
  probes Web, while `auth_status`, `library_status`, `release_gates`, and
  `data_loading_plan` probe API.
- Added gate `candidate-api-target-shape`; explicit API targets must be root
  URLs and are blocked when they point to NAS desktop routes, subpaths, query
  URLs, or hashes.
- Existing no-target, single-base, NAS desktop, non-root, complete-contract,
  missing-subcontract, and candidate-only behavior remains tested.
- Added tests proving split local candidate routing and explicit API target
  shape blocking.
- Generated password-mode local split evidence:
  `docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T161306Z.json`
  and `.md`; Web root on `127.0.0.1:5176` passed, API root on
  `127.0.0.1:3889` returned `401 login_required` for protected endpoints, so
  candidate proof stayed blocked for a truthful session reason.
- Generated accepted local auth-disabled candidate evidence:
  `docs/acceptance/artifacts/admin-docker-candidate-contract-proof-20260627T161407Z.json`
  and `.md`; `candidate_contract_ready=true`,
  `docker_upload_allowed=false`, `staging_approved=false`, and
  `target.nas_live_evidence=false`.
- Regenerated staging and readiness artifacts:
  `docs/acceptance/artifacts/admin-docker-staging-runbook-20260627T161447Z.json`
  / `.md` and
  `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260627T161447Z.json`
  / `.md`. Candidate proof is accepted, but Docker staging/release remains
  blocked by image tags, NAS live/parity blockers, worker env proof, Cutter
  proof, disk risk, and staging-runbook gates.
- Verification passed:
  `node --test --import tsx scripts/acceptance/admin-docker-candidate-contract-proof.test.ts scripts/acceptance/admin-docker-staging-runbook.test.ts scripts/acceptance/admin-docker-release-readiness-summary.test.ts scripts/acceptance/admin-docker-release-live-readonly.test.ts scripts/acceptance/admin-docker-version-parity-plan.test.ts`
  with `29` passing tests.
- `npm run typecheck -- --pretty false` passed, and target-file
  `git diff --check` plus trailing-whitespace checks passed.
- Remaining gap: this proves local candidate contract shape only. NAS Docker is
  still on the old API contract until a staged image exposes current endpoints
  and live-readonly/parity, worker, Cutter, disk, image-tag, rollback, and
  release-decision gates pass.

R.280 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture and Phase 4 page IA
  support. This continues the route-loader execution migration by moving one
  ordinary route request-loader lifecycle into `route-loading-runtime.ts`.
- Planned implementation boundary: define a request-loader registry and runner
  for the Cutter Users route, then update `AdminApp.tsx` to consume it while
  preserving the existing route, fresh-data token, loading, timeout, error, and
  cancellation semantics.
- Non-goal and safety boundary: no Admin API change, no backend read-model
  rebuild, no NAS write, no source-video manifest mutation, no `library.json`
  mutation, no release/index mutation, no Docker deployment, no Cutter protocol
  change, no broad React state rewrite, and no behavior change for Cutter Users
  data.
- Professional review: Project Architect confirms this keeps data-loading
  execution policy moving out of the shell component without shrinking the full
  architecture goal. Delivery Lead confirms the slice is frontend-only,
  behavior-preserving, and safe to verify with focused tests.

R.280 implemented traceability:

- `apps/admin-web/src/app/route-loading-runtime.ts` now defines
  `ADMIN_ROUTE_REQUEST_LOAD_SPECS` for `cutterUsers`.
- The runtime now exposes `shouldStartAdminRouteRequestLoad(...)`,
  `createAdminRouteRequestScope(...)`, and
  `startAdminRouteRequestLoad(...)`.
- The request-loader runner handles registry-backed start guards, scoped
  request creation, start/request/success/error/settled callbacks, cancellation,
  and suppression of late success/error callbacks after cancellation.
- `apps/admin-web/src/app/AdminApp.tsx` now uses
  `startAdminRouteRequestLoad(...)` for the Cutter Users route loader.
- Existing Cutter Users route behavior is preserved: route mismatch blocks
  loading, fresh loaded token blocks duplicate loading, in-flight loading blocks
  duplicate requests, route-local read errors remain local, the existing
  timeout wrapper remains in place, and cleanup cancels the request scope.
- `apps/admin-web/src/admin-app.test.ts` now verifies the request-loader
  registry shape, start guard, scope creation, allowed lifecycle, blocked
  lifecycle, cancelled lifecycle, and AdminApp source ownership.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts`
  with `72` passing tests.
- `npm run typecheck -- --pretty false` passed.
- Remaining gap: only the Cutter Users ordinary route request-loader has moved
  to the new runner. Broader route loader effect execution remains inside
  `AdminApp.tsx` for source-video list/detail, preprocess jobs, index versions,
  protection center, operation log, dashboard metrics, background refresh, and
  other routes. Protection Gate coverage, backend read-model/query completion,
  redundancy cleanup, Docker gates, and full Admin Architecture v1 remain
  incomplete.

R.281 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture and Phase 4 page IA
  support. This extends the ordinary route request-loader runtime to the
  Operation Log page.
- Planned implementation boundary: add an `operationLog` request-loader spec,
  support the Operation Log page's standalone local error state, and update
  `AdminApp.tsx` to use `startAdminRouteRequestLoad(...)` without changing the
  API request or response handling.
- Non-goal and safety boundary: no Admin API change, no backend read-model
  rebuild, no NAS write, no operation-log write, no source-video manifest
  mutation, no `library.json` mutation, no release/index mutation, no Docker
  deployment, no Cutter protocol change, no broad React state rewrite, and no
  operation-log response shape change.
- Professional review: Project Architect confirms this expands the route-loader
  runtime contract while preserving the full architecture target. Delivery Lead
  confirms it is frontend-only and behavior-preserving for data/API surfaces.

R.281 implemented traceability:

- `apps/admin-web/src/app/route-loading-runtime.ts` now includes `operationLog`
  in `ADMIN_ROUTE_REQUEST_LOAD_SPECS`.
- `AdminRouteRequestLoadSpec.local_read_key` is now optional so route loaders
  with standalone page-state errors can use the shared lifecycle runner.
- `AdminRouteRequestLoadErrorSurface` now includes
  `route-local-state-error`.
- `apps/admin-web/src/app/AdminApp.tsx` now uses
  `startAdminRouteRequestLoad(...)` for the Operation Log route loader.
- Existing Operation Log behavior is preserved at the data boundary:
  `getOperationLog({ limit: 50 })`, Chinese timeout label `操作记录加载`,
  page-local error state, route loading state, and request-scope cancellation.
- `apps/admin-web/src/admin-app.test.ts` verifies the expanded request-loader
  registry, `operationLog` start guard, scope creation, AdminApp runner
  consumption, and unchanged operation-log client call.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts`
  with `72` passing tests.
- `npm run typecheck -- --pretty false` passed, and target-file
  `git diff --check` plus trailing-whitespace checks passed.
- Remaining gap: two ordinary route loaders now use the runner, but broader
  route loader effect execution remains inside `AdminApp.tsx` for protection
  center, source detail, index publish, source-video initial page, preprocess
  jobs, dashboard metrics, background refresh, and other routes. Protection
  Gate coverage, backend read-model/query completion, redundancy cleanup,
  Docker gates, and full Admin Architecture v1 remain incomplete.

R.282 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture and Phase 4 page IA
  support, with direct visibility into Phase 1 protection and Phase 3
  read-model maintenance state. This extends the ordinary route request-loader
  runtime to the Protection Center page.
- Planned implementation boundary: add an `operationsOverview`
  request-loader spec, keep the existing Protection Center read helper, and
  update `AdminApp.tsx` to use `startAdminRouteRequestLoad(...)` without
  changing the API request or response handling.
- Non-goal and safety boundary: no Admin API change, no backend read-model
  rebuild, no NAS write, no source-video manifest mutation, no `library.json`
  mutation, no release/index mutation, no operation-log write, no Docker
  deployment, no Cutter protocol change, no broad React state rewrite, and no
  Protection Center response shape change.
- Professional review: Project Architect confirms this moves the
  protection/read-model maintenance route toward route-owned loading without
  shrinking the full architecture target. Delivery Lead confirms it is
  frontend-only, behavior-preserving for data/API surfaces, and safe to verify
  with focused tests.

R.282 implemented traceability:

- `apps/admin-web/src/app/route-loading-runtime.ts` now includes
  `operationsOverview` in `ADMIN_ROUTE_REQUEST_LOAD_SPECS`.
- The new spec maps `protection` to the `operationsOverview` loading key,
  `loadProtectionCenterData` client method label, `operationsOverview` success
  target, and `route-local-state-error`.
- `apps/admin-web/src/app/AdminApp.tsx` now uses
  `startAdminRouteRequestLoad(...)` for the Protection Center route loader.
- Existing Protection Center behavior is preserved at the data boundary:
  `loadProtectionCenterData(requestScope.client)`, Chinese timeout label
  `保护中心加载`, page-local error state, read-model reconcile status/error
  updates, route loading state, and request-scope cancellation.
- `apps/admin-web/src/admin-app.test.ts` verifies the expanded request-loader
  registry, `operationsOverview` start guard, scope creation, AdminApp runner
  consumption, unchanged Protection Center client call, and removal of the
  hand-coded `route !== "protection"` guard from `AdminApp.tsx`.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts`
  with `72` passing tests.
- `npm run typecheck -- --pretty false` passed.
- Remaining gap: three ordinary route loaders now use the runner, but broader
  route loader effect execution remains inside `AdminApp.tsx` for source
  detail, index publish, source-video initial page, preprocess jobs, dashboard
  metrics, background refresh, and other routes. Protection Gate backend
  coverage, backend read-model/query completion, redundancy cleanup, Docker
  gates, and full Admin Architecture v1 remain incomplete.

R.283 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture and Phase 4 page IA
  support. This extends the ordinary route request-loader runtime to the Source
  Detail Inspector route.
- Planned implementation boundary: add a `sourceDetail` request-loader spec,
  keep the existing source-detail request helper and error mapping, and update
  `AdminApp.tsx` to use `startAdminRouteRequestLoad(...)` only when a detail
  request exists.
- Non-goal and safety boundary: no Admin API change, no backend read-model
  rebuild, no NAS write, no source-video manifest mutation, no `library.json`
  mutation, no release/index mutation, no Docker deployment, no Cutter protocol
  change, no broad React state rewrite, no detail response shape change, and no
  change to the no-selected-video fallback.
- Professional review: Project Architect confirms this moves a source-video
  evidence route toward route-owned loading without changing asset facts or
  Cutter protocols. Delivery Lead confirms it is frontend-only,
  behavior-preserving for data/API surfaces, and safe to verify with focused
  tests.

R.283 implemented traceability:

- `apps/admin-web/src/app/route-loading-runtime.ts` now includes `sourceDetail`
  in `ADMIN_ROUTE_REQUEST_LOAD_SPECS`.
- The new spec maps `source-detail` to the `sourceDetail` loading key,
  `getSourceVideoDetail` client method label, `sourceDetail` success target,
  and `route-local-state-error`.
- `apps/admin-web/src/app/AdminApp.tsx` now uses
  `startAdminRouteRequestLoad(...)` for the Source Detail route loader when a
  detail request exists.
- Existing Source Detail behavior is preserved at the data boundary:
  `sourceDetailRequestForRoute(...)`, `没有可查看的原视频` for missing requests,
  `requestScope.client.getSourceVideoDetail(request.sourceVideoId)`,
  `sourceDetailLoadErrorMessage(...)`, stale-detail clearing, route loading
  state, and request-scope cancellation.
- `apps/admin-web/src/admin-app.test.ts` verifies the expanded request-loader
  registry, `sourceDetail` start guard, scope creation, AdminApp runner
  consumption, unchanged detail client call, request-loader cleanup count, and
  reduced hand-coded request-scope abort count.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts`
  with `72` passing tests.
- `npm run typecheck -- --pretty false` passed.
- Remaining gap: four ordinary route loaders now use the runner, but broader
  route loader effect execution remains inside `AdminApp.tsx` for index
  publish, source-video initial page, preprocess jobs, dashboard metrics,
  background refresh, and other routes. Source-video Query API/read-model
  coverage, Protection Gate backend coverage, redundancy cleanup, Docker gates,
  and full Admin Architecture v1 remain incomplete.

R.284 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture and Phase 3 high-risk
  slow-list preparation. This extends the ordinary route request-loader runtime
  to the Index Publish route's `index-required` source-video read.
- Planned implementation boundary: add an `indexRequiredVideos`
  request-loader spec, keep the existing `listSourceVideos(...)` response
  shape, and update `AdminApp.tsx` to use `startAdminRouteRequestLoad(...)`
  without changing publish commands or backend query behavior.
- Non-goal and safety boundary: no Admin API change, no backend read-model
  rebuild, no NAS write, no source-video manifest mutation, no `library.json`
  mutation, no release/index mutation, no publish command change, no Docker
  deployment, no Cutter protocol change, no broad React state rewrite, and no
  response-shape change from `listSourceVideos(...)`.
- Professional review: Project Architect confirms this moves a named
  high-risk slow list into route-owned loading without claiming backend Query
  API completion. Delivery Lead confirms it is frontend-only,
  behavior-preserving for data/API surfaces, and safe to verify with focused
  tests.

R.284 implemented traceability:

- `apps/admin-web/src/app/route-loading-runtime.ts` now includes
  `indexRequiredVideos` in `ADMIN_ROUTE_REQUEST_LOAD_SPECS`.
- The new spec maps `index-publish` to the `indexRequiredVideos` loading key,
  local read-error key, `listSourceVideos` client method label,
  `indexRequiredVideos` success target, and `route-local-read-error`.
- `apps/admin-web/src/app/AdminApp.tsx` now uses
  `startAdminRouteRequestLoad(...)` for the Index Publish pending-publication
  list read.
- Existing Index Publish behavior is preserved at the data boundary:
  `requestScope.client.listSourceVideos({ limit:
  ADMIN_SOURCE_VIDEO_INITIAL_LOAD_LIMIT, status: "index-required" })`, Chinese
  timeout label `待发布视频加载`, route-local error state, list reset before
  loading, success projection into `data.source_videos`, route loading state,
  and request-scope cancellation.
- `apps/admin-web/src/admin-app.test.ts` verifies the expanded request-loader
  registry, `indexRequiredVideos` start guard, scope creation, AdminApp runner
  consumption, unchanged `index-required` client call, request-loader cleanup
  count, and reduced hand-coded request-scope abort count.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts`
  with `72` passing tests.
- `npm run typecheck -- --pretty false` passed.
- Remaining gap: five ordinary route loaders now use the runner, but broader
  route loader effect execution remains inside `AdminApp.tsx` for source-video
  initial page, preprocess jobs, dashboard metrics, background refresh, and
  other routes. The Index Publish backend read still needs future Query
  API/read-model/no-scan evidence enforcement, and full Admin Architecture v1
  remains incomplete.

R.285 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture and Phase 3 high-risk
  slow-list evidence path. This extends the ordinary route request-loader
  runtime to the main Source Videos initial route read.
- Planned implementation boundary: add a `sourceVideosInitial`
  request-loader spec, preserve `listSourceVideosWithRuntime(...)` and
  runtime metadata projection, keep the existing dashboard-data gate, and update
  `AdminApp.tsx` to use `startAdminRouteRequestLoad(...)`.
- Non-goal and safety boundary: no Admin API change, no backend read-model
  rebuild, no NAS write, no source-video manifest mutation, no `library.json`
  mutation, no release/index mutation, no Docker deployment, no Cutter protocol
  change, no broad React state rewrite, no response-shape change from
  `listSourceVideosWithRuntime(...)`, and no change to
  `shouldLoadAdminSourceVideos(...)`.
- Professional review: Project Architect confirms this moves the main material
  slow-list route into route-owned loading while preserving runtime evidence for
  later no-scan/read-model enforcement. Delivery Lead confirms it is
  frontend-only, behavior-preserving for data/API surfaces, and safe to verify
  with focused tests.

R.285 implemented traceability:

- `apps/admin-web/src/app/route-loading-runtime.ts` now includes
  `sourceVideosInitial` in `ADMIN_ROUTE_REQUEST_LOAD_SPECS`.
- The new spec maps `source-videos` to the `sourceVideosInitial` loading key,
  `sourceVideos` local read-error key, `listSourceVideosWithRuntime` client
  method label, `sourceVideosInitial` success target, and
  `route-local-read-error`.
- `apps/admin-web/src/app/AdminApp.tsx` now uses
  `startAdminRouteRequestLoad(...)` for the Source Videos initial route loader.
- Existing Source Videos behavior is preserved at the data boundary:
  `shouldLoadAdminSourceVideos(...)`, `requestScope.client.listSourceVideosWithRuntime(...)`,
  query/status parameters, `adminSourceVideoManifestFallbackPolicy(sourceVideoStatusFilter)`,
  Chinese timeout label `原视频列表加载`, runtime metadata projection, `hasMore`
  calculation, route-local error state, list reset before loading, and
  request-scope cancellation.
- `apps/admin-web/src/admin-app.test.ts` verifies the expanded request-loader
  registry, `sourceVideosInitial` start guard and `canLoad` behavior, scope
  creation, AdminApp runner consumption, unchanged
  `listSourceVideosWithRuntime(...)` client call, request-loader cleanup count,
  and reduced hand-coded request-scope abort count.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts`
  with `72` passing tests.
- `npm run typecheck -- --pretty false` passed.
- Remaining gap: six ordinary route loaders now use the runner, but broader
  route loader effect execution remains inside `AdminApp.tsx` for preprocess
  jobs, dashboard metrics, background refresh, and other routes. Backend
  Query/read-model/no-scan evidence enforcement for source-video status filters
  is still not complete, and full Admin Architecture v1 remains incomplete.

R.286 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture and Phase 3 high-risk
  slow-list preparation. This extends the ordinary route request-loader runtime
  to the Preprocess Jobs initial route read.
- Planned implementation boundary: add a `preprocessJobsInitial`
  request-loader spec, preserve `loadAdminPreprocessRouteData(...)` and
  process-history companion handling, and update `AdminApp.tsx` to use
  `startAdminRouteRequestLoad(...)` without changing backend query behavior or
  worker commands.
- Non-goal and safety boundary: no Admin API change, no backend read-model
  rebuild, no NAS write, no source-video manifest mutation, no preprocess job
  mutation, no `library.json` mutation, no release/index mutation, no worker
  lifecycle change, no Docker deployment, no Cutter protocol change, no broad
  React state rewrite, and no response-shape change from
  `loadAdminPreprocessRouteData(...)`.
- Professional review: Project Architect confirms this moves a Goal-named slow
  route into route-owned loading without claiming backend Query/read-model
  completion. Delivery Lead confirms it is frontend-only, behavior-preserving
  for data/API surfaces, and safe to verify with focused tests.

R.286 implemented traceability:

- `apps/admin-web/src/app/route-loading-runtime.ts` now includes
  `preprocessJobsInitial` in `ADMIN_ROUTE_REQUEST_LOAD_SPECS`.
- The new spec maps `preprocess-jobs` to the `preprocessJobsInitial` loading
  key, `preprocessJobs` local read-error key,
  `loadAdminPreprocessRouteData` client method label,
  `preprocessJobsInitial` success target, and `route-local-read-error`.
- `apps/admin-web/src/app/AdminApp.tsx` now uses
  `startAdminRouteRequestLoad(...)` for the Preprocess Jobs initial route
  loader.
- Existing Preprocess Jobs behavior is preserved at the data boundary:
  `loadAdminPreprocessRouteData(requestScope.client, preprocessProcessHistoryFilters)`,
  jobs/process-history partial error handling, `pendingPreprocessJobsRef`,
  `preprocessJobsPrefetchTokenRef`, route-local errors, process-history local
  errors, loading state, and request-scope cancellation.
- `apps/admin-web/src/admin-app.test.ts` verifies the expanded request-loader
  registry, `preprocessJobsInitial` start guard, scope creation, AdminApp runner
  consumption, unchanged preprocess route data call, request-loader cleanup
  count, and reduced hand-coded request-scope abort count.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts`
  with `72` passing tests.
- `npm run typecheck -- --pretty false` passed.
- Remaining gap: seven ordinary route loaders now use the runner, but broader
  route loader effect execution remains inside `AdminApp.tsx` for dashboard
  metrics, background refresh, index version supplemental reads, pagination, and
  other paths. Backend Query/read-model/no-scan evidence enforcement for
  preprocess/jobs is still not complete, and full Admin Architecture v1 remains
  incomplete.

R.287 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture, specifically
  background refresh ownership, cancellation, duplicate-start prevention, and
  non-blocking error-surface discipline. This also prepares Phase 3 slow
  supplemental reads for later Query/read-model/no-scan evidence.
- Planned implementation boundary: add a shared background refresh execution
  runner to `route-loading-runtime.ts`, migrate Dashboard panel interval refresh
  to the runner, and keep the existing `loadAdminDashboardPanelData(...)`
  request/merge behavior unchanged.
- Non-goal and safety boundary: no Admin API change, no backend read-model
  rebuild, no scan planner change, no NAS write, no source-video manifest
  mutation, no preprocess job mutation, no release/index mutation, no Docker
  deployment, no Cutter protocol change, no Dashboard response-shape change, and
  no attempt to migrate all remaining background paths in one batch.
- Professional review: Project Architect confirms this is a request-lifecycle
  runtime slice rather than Dashboard UI polish. Delivery Lead confirms it is
  frontend-only, behavior-preserving for data/API surfaces, and safe to verify
  with focused tests and typecheck.

R.287 implemented traceability:

- `apps/admin-web/src/app/route-loading-runtime.ts` now includes background
  refresh input/scope/execution types plus
  `shouldStartAdminBackgroundRefresh(...)`,
  `createAdminBackgroundRefreshScope(...)`, and
  `startAdminBackgroundRefresh(...)`.
- The new runner owns duplicate-start blocking, optional enabled override,
  request-scope creation through `ADMIN_BACKGROUND_REFRESH_SPECS`, success/error
  suppression after cancellation, settled callbacks, and abort-on-cancel.
- `apps/admin-web/src/app/AdminApp.tsx` now migrates Dashboard panel refresh to
  `startAdminBackgroundRefresh(...)` and cleans up through
  `activeBackgroundRefresh?.cancel()`.
- Dashboard behavior remains equivalent: the panel refresh still starts on
  Dashboard route entry, repeats on `ADMIN_DATA_AUTO_REFRESH_INTERVAL_MS`, calls
  `loadAdminDashboardPanelData(requestScope.client)`, merges through
  `mergeAdminDashboardPanelData(...)`, and keeps failures silent/background-only.
- `apps/admin-web/src/admin-app.test.ts` verifies background runner
  start/block/cancel semantics, disabled-prefetch explicit override behavior,
  AdminApp consumption of the background runner, and updated request-scope
  ownership counts.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts`
  with `73` passing tests.
- `npm run typecheck -- --pretty false` passed.
- `git diff --check` on the touched files passed.
- Remaining gap: the remaining background/prefetch paths
  (`nonDashboardMetrics`, `cutterUsersPrefetch`, `preprocessJobsPrefetch`,
  `preprocessJobsInterval`) are not yet migrated to the runner. Backend
  Query/read-model/no-scan evidence enforcement for processing/index-required,
  preprocess/jobs, index/versions, dashboard stats, and usage-events aggregation
  remains incomplete, and full Admin Architecture v1 remains incomplete.

R.288 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture for the
  `preprocessJobsInterval` background refresh path, which is part of the named
  slow Preprocess Jobs surface.
- Planned implementation boundary: migrate the Preprocess Jobs interval refresh
  in `AdminApp.tsx` from a hand-coded active request scope to
  `startAdminBackgroundRefresh(...)`, keeping
  `loadAdminPreprocessRouteData(...)` behavior and all local error surfaces
  unchanged.
- Non-goal and safety boundary: no Admin API change, no preprocess worker
  command change, no backend read-model rebuild, no scan planner change, no NAS
  write, no source-video manifest mutation, no preprocess job mutation, no
  release/index mutation, no Docker deployment, no Cutter protocol change, and
  no response-shape change from `loadAdminPreprocessRouteData(...)`.
- Professional review: Project Architect confirms this is a loader ownership
  slice for a slow route, not backend query optimization. Delivery Lead confirms
  it is frontend-only, behavior-preserving for data/API surfaces, and safe to
  verify with focused tests and typecheck.

R.288 implemented traceability:

- `apps/admin-web/src/app/AdminApp.tsx` now runs the Preprocess Jobs interval
  refresh through `startAdminBackgroundRefresh(...)` with key
  `preprocessJobsInterval`.
- The old hand-coded `activeRequestScope` interval owner has been removed from
  background refresh code; Dashboard and Preprocess Jobs interval refreshes now
  both track `AdminBackgroundRefreshExecution<AdminRuntimeRequestScope>`.
- Existing Preprocess Jobs interval behavior remains unchanged:
  `loadAdminPreprocessRouteData(requestScope.client, preprocessProcessHistoryFilters)`,
  jobs partial error handling, process-history data/error handling,
  route-local `preprocessJobs` errors, data merge, and cleanup cancellation.
- `apps/admin-web/src/admin-app.test.ts` verifies two background runner
  consumers, two runner-handle cancellations, the `preprocessJobsInterval` key,
  and forbids the old `activeRequestScope` interval ownership pattern.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts`
  with `73` passing tests.
- `npm run typecheck -- --pretty false` passed.
- `git diff --check` on the touched files passed.
- Remaining gap: `nonDashboardMetrics`, `cutterUsersPrefetch`, and
  `preprocessJobsPrefetch` still use their current background/prefetch code
  paths. Backend Query/read-model/no-scan evidence enforcement for
  processing/index-required, preprocess/jobs, index/versions, dashboard stats,
  and usage-events aggregation remains incomplete, and full Admin Architecture
  v1 remains incomplete.

R.289 planned traceability:

- Requirement coverage: Phase 2 data-loading architecture, completing the
  current frontend background request ownership contract for supplemental reads,
  route prefetches, and interval refreshes.
- Planned implementation boundary: migrate `nonDashboardMetrics`,
  `cutterUsersPrefetch`, and `preprocessJobsPrefetch` in `AdminApp.tsx` to
  `startAdminBackgroundRefresh(...)`, preserving existing prefetch gating,
  silent background errors, route-local visible errors, and pending jobs
  handoff.
- Non-goal and safety boundary: no Admin API change, no backend read-model
  rebuild, no scan planner change, no NAS write, no source-video manifest
  mutation, no preprocess job mutation, no release/index mutation, no Docker
  deployment, no Cutter protocol change, no prefetch policy change, and no API
  response-shape change.
- Professional review: Project Architect confirms this completes the frontend
  background lifecycle slice without claiming backend query-model completion.
  Delivery Lead confirms it is frontend-only, behavior-preserving for data/API
  surfaces and prefetch policy, and safe to verify with focused tests and
  typecheck.

R.289 implemented traceability:

- `apps/admin-web/src/app/AdminApp.tsx` now runs all registered background
  request specs through `startAdminBackgroundRefresh(...)`:
  `nonDashboardMetrics`, `dashboardPanelData`, `cutterUsersPrefetch`,
  `preprocessJobsPrefetch`, and `preprocessJobsInterval`.
- Disabled prefetch specs remain disabled by default. `cutterUsersPrefetch` and
  `preprocessJobsPrefetch` pass `enabled: true` only after
  `shouldPrefetchAdminRoute(...)` and their existing freshness/loading gates
  have allowed the prefetch.
- Existing behavior remains unchanged: non-Dashboard metrics fail silently and
  update only `data.metrics`; Cutter Users prefetch keeps its timeout and loaded
  token update; Preprocess Jobs prefetch keeps process-history updates,
  `pendingPreprocessJobsRef` handoff, jobs merge, and prefetch token update.
- `apps/admin-web/src/admin-app.test.ts` verifies five background runner
  consumers, runner-handle cancellation for supplemental/prefetch/interval
  paths, explicit background spec keys, and forbids old hand-coded
  active-scope/prefetch-start patterns from returning.
- Verification passed:
  `node --test --import tsx apps/admin-web/src/admin-app.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts`
  with `73` passing tests.
- `npm run typecheck -- --pretty false` passed.
- `git diff --check` on the touched files passed.
- Remaining gap: backend Query/read-model/no-scan evidence enforcement for
  processing/index-required, preprocess/jobs, index/versions, dashboard stats,
  and usage-events aggregation remains incomplete, and full Admin Architecture
  v1 remains incomplete.
