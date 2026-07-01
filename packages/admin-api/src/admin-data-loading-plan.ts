import {
  adminScanModeProfile,
  type AdminScanDataSource,
  type AdminScanMode,
  type AdminScanReason
} from "./admin-scan-modes.ts";

export const ADMIN_SOURCE_VIDEO_ROUTE_DEFAULT_LIMIT = 20;
export const ADMIN_PREPROCESS_JOB_ROUTE_DEFAULT_LIMIT = 20;
export const ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS = 8_000;
export const ADMIN_CUTTER_USERS_ROUTE_TIMEOUT_MS = 20_000;
export const ADMIN_INDEX_VERSION_DEFAULT_LIMIT = 8;
export const ADMIN_INDEX_VERSION_CACHE_TTL_MS = 30_000;

export type AdminDataLoadPhase = "shell" | "route" | "background" | "command";
export type AdminDataLoadCost = "cheap" | "bounded" | "expensive";
export type AdminDataLoadScanMode = AdminScanMode;

export interface AdminDataLoadingEndpointPlan {
  endpoint: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  phase: AdminDataLoadPhase;
  cost: AdminDataLoadCost;
  scan_mode: AdminDataLoadScanMode;
  data_source: AdminScanDataSource;
  scan_reason: AdminScanReason;
  critical: boolean;
  default_limit?: number;
  cache_ttl_ms?: number;
  read_model?: string;
  timeout_ms: number;
  refresh: "manual" | "interval" | "route-entry" | "command-only";
  notes: string;
}

export interface AdminRouteDataLoadingPlan {
  route: string;
  load_phase: "shell" | "route-entry" | "manual-command";
  prefetch: boolean;
  endpoints: string[];
  fallback: string;
}

export interface AdminDataLoadingPlan {
  schema_version: "1.0";
  generated_at: string;
  strategy: "shell-first-route-owned-v1";
  shell_interactive_target_ms: number;
  route_timeout_ms: number;
  background_prefetch_default: boolean;
  hidden_full_scan_allowed: boolean;
  endpoints: AdminDataLoadingEndpointPlan[];
  routes: AdminRouteDataLoadingPlan[];
}

function endpointPlan(
  input: Omit<AdminDataLoadingEndpointPlan, "data_source" | "scan_reason"> &
    Partial<Pick<AdminDataLoadingEndpointPlan, "data_source" | "scan_reason">>
): AdminDataLoadingEndpointPlan {
  const profile = adminScanModeProfile(input.scan_mode);
  return {
    ...input,
    data_source: input.data_source ?? profile.default_data_source,
    scan_reason: input.scan_reason ?? profile.default_reason
  };
}

export function buildAdminDataLoadingPlan(input: {
  generated_at: string;
  manifest_cache_ttl_ms: number;
}): AdminDataLoadingPlan {
  const endpointPlans: AdminDataLoadingEndpointPlan[] = [
    endpointPlan({
      endpoint: "/api/admin/library/status",
      method: "GET",
      phase: "shell",
      cost: "cheap",
      scan_mode: "no-scan",
      data_source: "library-manifest",
      scan_reason: "shell-summary",
      critical: true,
      timeout_ms: 1_000,
      refresh: "interval",
      notes: "Reads library.json summary and current index pointer; does not enumerate videos."
    }),
    endpointPlan({
      endpoint: "/api/admin/settings/config",
      method: "GET",
      phase: "shell",
      cost: "cheap",
      scan_mode: "no-scan",
      data_source: "admin-settings",
      scan_reason: "shell-summary",
      critical: true,
      timeout_ms: 1_000,
      refresh: "manual",
      notes: "Small Admin settings file used for shell and route controls."
    }),
    endpointPlan({
      endpoint: "/api/admin/preprocess/supervisor/status",
      method: "GET",
      phase: "shell",
      cost: "cheap",
      scan_mode: "no-scan",
      data_source: "supervisor-runtime",
      scan_reason: "shell-summary",
      critical: true,
      timeout_ms: 1_000,
      refresh: "interval",
      notes: "In-memory supervisor state; safe for shell status."
    }),
    endpointPlan({
      endpoint: "/api/admin/data-loading/plan",
      method: "GET",
      phase: "shell",
      cost: "cheap",
      scan_mode: "no-scan",
      data_source: "data-loading-contract",
      scan_reason: "shell-contract",
      critical: true,
      timeout_ms: 1_000,
      refresh: "manual",
      notes: "Machine-readable route loading contract for Admin web."
    }),
    endpointPlan({
      endpoint: "/api/admin/source-videos",
      method: "GET",
      phase: "route",
      cost: "bounded",
      scan_mode: "paged-list",
      data_source: "admin-read-model",
      scan_reason: "route-owned-page",
      critical: false,
      default_limit: ADMIN_SOURCE_VIDEO_ROUTE_DEFAULT_LIMIT,
      read_model: "source-video-status-read-model-v1",
      timeout_ms: ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS,
      refresh: "route-entry",
      notes: "Route-owned paged source-video list. Ready rows use the transcript index; non-ready status filters use source-video-status-read-model-v1."
    }),
    endpointPlan({
      endpoint: "/api/admin/source-videos/:id",
      method: "GET",
      phase: "route",
      cost: "bounded",
      scan_mode: "single-id",
      data_source: "source-video-manifest",
      scan_reason: "selected-record",
      critical: false,
      timeout_ms: ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS,
      refresh: "route-entry",
      notes: "Single selected source-video detail and transcript summary."
    }),
    endpointPlan({
      endpoint: "/api/admin/preprocess/jobs",
      method: "GET",
      phase: "route",
      cost: "bounded",
      scan_mode: "status-scan",
      data_source: "admin-read-model",
      scan_reason: "route-owned-page",
      critical: false,
      default_limit: ADMIN_PREPROCESS_JOB_ROUTE_DEFAULT_LIMIT,
      cache_ttl_ms: input.manifest_cache_ttl_ms,
      read_model: "source-video-status-read-model-v1",
      timeout_ms: ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS,
      refresh: "interval",
      notes: "Preprocess route list. The default limit is bounded by source-video-status-read-model-v1 instead of a hidden manifest sweep."
    }),
    endpointPlan({
      endpoint: "/api/admin/preprocess/process-history",
      method: "GET",
      phase: "route",
      cost: "bounded",
      scan_mode: "no-scan",
      data_source: "admin-read-model",
      scan_reason: "route-owned-page",
      critical: false,
      default_limit: 50,
      read_model: "admin-read-model-v1",
      timeout_ms: ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS,
      refresh: "route-entry",
      notes: "Bounded preprocess process-history report from complete admin.sqlite snapshots. It must not enumerate preprocess-job files from a page request."
    }),
    endpointPlan({
      endpoint: "/api/admin/preprocess/process-history/readiness",
      method: "GET",
      phase: "route",
      cost: "cheap",
      scan_mode: "no-scan",
      data_source: "admin-read-model",
      scan_reason: "read-model-health",
      critical: false,
      read_model: "admin-read-model-v1",
      timeout_ms: 1_000,
      refresh: "manual",
      notes: "No-scan readiness diagnostic explaining whether admin.sqlite has a complete preprocess-job snapshot for process-history rows."
    }),
    endpointPlan({
      endpoint: "/api/admin/read-model/status",
      method: "GET",
      phase: "route",
      cost: "cheap",
      scan_mode: "no-scan",
      data_source: "admin-read-model",
      scan_reason: "read-model-health",
      critical: false,
      read_model: "source-video-status-read-model-v1",
      timeout_ms: 1_000,
      refresh: "manual",
      notes: "Diagnostic read-model freshness endpoint. It reports state without forcing a rebuild."
    }),
    endpointPlan({
      endpoint: "/api/admin/read-model/reconcile/status",
      method: "GET",
      phase: "route",
      cost: "cheap",
      scan_mode: "no-scan",
      data_source: "read-model-reconcile",
      scan_reason: "read-model-health",
      critical: false,
      read_model: "admin-read-model-v1",
      timeout_ms: 1_000,
      refresh: "manual",
      notes: "Diagnostic status for the explicit background read-model reconciler. It never starts a scan."
    }),
    endpointPlan({
      endpoint: "/api/admin/operations/overview",
      method: "GET",
      phase: "route",
      cost: "bounded",
      scan_mode: "no-scan",
      data_source: "data-loading-contract",
      scan_reason: "route-owned-page",
      critical: false,
      read_model: "source-video-status-read-model-v1",
      timeout_ms: ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS,
      refresh: "route-entry",
      notes: "Protection Center aggregate for release gates, read-model freshness, data-loading strategy, and ready protection."
    }),
    endpointPlan({
      endpoint: "/api/admin/operation-log",
      method: "GET",
      phase: "route",
      cost: "bounded",
      scan_mode: "no-scan",
      data_source: "operation-log",
      scan_reason: "operation-log-tail",
      critical: false,
      timeout_ms: 1_000,
      refresh: "route-entry",
      notes: "Admin operation log tail from a bounded NDJSON file. It must not enumerate source-video manifests."
    }),
    endpointPlan({
      endpoint: "/api/admin/command-snapshots/:snapshot_id/restore-plan",
      method: "GET",
      phase: "command",
      cost: "bounded",
      scan_mode: "no-scan",
      data_source: "command-snapshot",
      scan_reason: "selected-record",
      critical: false,
      timeout_ms: ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS,
      refresh: "command-only",
      notes: "Read-only restore preflight for one command snapshot. It inspects only the selected snapshot manifest and captured files; it does not execute restore."
    }),
    endpointPlan({
      endpoint: "/api/admin/command-snapshots/:snapshot_id/restore",
      method: "POST",
      phase: "command",
      cost: "bounded",
      scan_mode: "no-scan",
      data_source: "command-snapshot",
      scan_reason: "selected-record",
      critical: false,
      timeout_ms: ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS,
      refresh: "command-only",
      notes: "Guarded command-snapshot restore execution for one selected snapshot. It recomputes the restore plan and must never run as part of route or shell loading."
    }),
    endpointPlan({
      endpoint: "/api/admin/runtime/diagnostics/history",
      method: "GET",
      phase: "route",
      cost: "bounded",
      scan_mode: "no-scan",
      data_source: "admin-read-model",
      scan_reason: "read-model-health",
      critical: false,
      read_model: "runtime-diagnostics-history-v1",
      timeout_ms: 1_000,
      refresh: "route-entry",
      notes: "Recent runtime endpoint diagnostics from a bounded derived history file; it must not enumerate source-video manifests."
    }),
    endpointPlan({
      endpoint: "/api/admin/index/versions",
      method: "GET",
      phase: "route",
      cost: "bounded",
      scan_mode: "paged-list",
      data_source: "index-version-packages",
      scan_reason: "index-version-page",
      critical: false,
      default_limit: ADMIN_INDEX_VERSION_DEFAULT_LIMIT,
      cache_ttl_ms: ADMIN_INDEX_VERSION_CACHE_TTL_MS,
      timeout_ms: ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS,
      refresh: "route-entry",
      notes: "Paged and cached index-version list; current version remains visible even when outside the first page."
    }),
    endpointPlan({
      endpoint: "/api/admin/dashboard/metrics",
      method: "GET",
      phase: "background",
      cost: "expensive",
      scan_mode: "status-scan",
      data_source: "usage-events",
      scan_reason: "background-metrics",
      critical: false,
      cache_ttl_ms: input.manifest_cache_ttl_ms,
      timeout_ms: ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS,
      refresh: "interval",
      notes: "Supplemental dashboard metrics. Shell must remain usable when this endpoint is slow. Response includes per-section sources for admin-read-model/current-index/usage-events provenance."
    }),
    endpointPlan({
      endpoint: "/api/admin/cutter-users",
      method: "GET",
      phase: "route",
      cost: "bounded",
      scan_mode: "no-scan",
      data_source: "user-store",
      scan_reason: "user-management-route",
      critical: false,
      timeout_ms: ADMIN_CUTTER_USERS_ROUTE_TIMEOUT_MS,
      refresh: "route-entry",
      notes: "Route-owned user-management table; do not prefetch from dashboard shell."
    }),
    endpointPlan({
      endpoint: "/api/admin/doctor/report",
      method: "GET",
      phase: "route",
      cost: "expensive",
      scan_mode: "status-scan",
      data_source: "doctor-probes",
      scan_reason: "doctor-route",
      critical: false,
      timeout_ms: ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS,
      refresh: "route-entry",
      notes: "Doctor route report only; full checks are not a shell dependency."
    }),
    endpointPlan({
      endpoint: "/api/admin/library/path-checks",
      method: "GET",
      phase: "route",
      cost: "bounded",
      scan_mode: "no-scan",
      data_source: "path-checks",
      scan_reason: "settings-route",
      critical: false,
      timeout_ms: ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS,
      refresh: "route-entry",
      notes: "Settings route path availability checks; reports configured paths without source-video enumeration."
    }),
    endpointPlan({
      endpoint: "/api/admin/settings/runtime",
      method: "GET",
      phase: "route",
      cost: "bounded",
      scan_mode: "no-scan",
      data_source: "runtime-secrets",
      scan_reason: "settings-route",
      critical: false,
      timeout_ms: ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS,
      refresh: "route-entry",
      notes: "Settings route runtime probe; not loaded during dashboard shell."
    }),
    endpointPlan({
      endpoint: "/api/admin/library/scan-preview",
      method: "POST",
      phase: "command",
      cost: "expensive",
      scan_mode: "folder-scan",
      data_source: "source-folders",
      scan_reason: "explicit-scan-preview",
      critical: false,
      timeout_ms: 30_000,
      refresh: "command-only",
      notes: "Explicit scan planning command. It is never a page-open side effect."
    }),
    endpointPlan({
      endpoint: "/api/admin/library/scan",
      method: "POST",
      phase: "command",
      cost: "expensive",
      scan_mode: "folder-scan",
      data_source: "source-folders",
      scan_reason: "explicit-scan-apply",
      critical: false,
      timeout_ms: 30_000,
      refresh: "command-only",
      notes: "Explicit scan apply command protected by scan-preview and ready blockers."
    }),
    endpointPlan({
      endpoint: "/api/admin/read-model/reconcile",
      method: "POST",
      phase: "command",
      cost: "expensive",
      scan_mode: "full-reconcile",
      data_source: "read-model-reconcile",
      scan_reason: "explicit-read-model-reconcile",
      critical: false,
      read_model: "admin-read-model-v1",
      timeout_ms: 30_000,
      refresh: "command-only",
      notes: "Explicit background maintenance command. It rebuilds admin.sqlite from a validated manifest snapshot and is never a page-open side effect."
    }),
    endpointPlan({
      endpoint: "/api/admin/read-model/reconcile/cancel",
      method: "POST",
      phase: "command",
      cost: "cheap",
      scan_mode: "no-scan",
      data_source: "read-model-reconcile",
      scan_reason: "explicit-reconcile-cancel",
      critical: false,
      read_model: "admin-read-model-v1",
      timeout_ms: 1_000,
      refresh: "command-only",
      notes: "Explicit cancel request for the background read-model reconciler. It does not scan the library and only stops at safe checkpoints."
    })
  ];

  const routePlans: AdminRouteDataLoadingPlan[] = [
    {
      route: "dashboard",
      load_phase: "shell",
      prefetch: false,
      endpoints: [
        "/api/admin/library/status",
        "/api/admin/settings/config",
        "/api/admin/preprocess/supervisor/status",
        "/api/admin/data-loading/plan"
      ],
      fallback: "Use shell placeholders for metrics, Doctor, source videos, jobs, and indexes until route panels ask for them."
    },
    {
      route: "source-videos",
      load_phase: "route-entry",
      prefetch: false,
      endpoints: ["/api/admin/source-videos"],
      fallback: "Show route-local loading and keep Admin shell interactive."
    },
    {
      route: "source-detail",
      load_phase: "route-entry",
      prefetch: false,
      endpoints: ["/api/admin/source-videos/:id"],
      fallback: "Show selected-source error without replacing shell data."
    },
    {
      route: "preprocess-jobs",
      load_phase: "route-entry",
      prefetch: false,
      endpoints: [
        "/api/admin/source-videos",
        "/api/admin/preprocess/jobs",
        "/api/admin/preprocess/process-history",
        "/api/admin/preprocess/process-history/readiness",
        "/api/admin/index/versions"
      ],
      fallback: "Use summary counts from library status until the route list resolves."
    },
    {
      route: "index-publish",
      load_phase: "route-entry",
      prefetch: false,
      endpoints: ["/api/admin/source-videos", "/api/admin/index/versions"],
      fallback: "Show route-local pending-publish and index-version loading without blocking the Admin shell."
    },
    {
      route: "protection",
      load_phase: "route-entry",
      prefetch: false,
      endpoints: [
        "/api/admin/operations/overview",
        "/api/admin/read-model/reconcile/status"
      ],
      fallback: "Use shell library counts until protection details resolve."
    },
    {
      route: "operation-log",
      load_phase: "route-entry",
      prefetch: false,
      endpoints: ["/api/admin/operation-log"],
      fallback: "Show route-local operation log loading without blocking the Admin shell."
    },
    {
      route: "runtime-diagnostics",
      load_phase: "route-entry",
      prefetch: false,
      endpoints: ["/api/admin/runtime/diagnostics/history"],
      fallback: "Show recent endpoint diagnostics without blocking the Admin shell."
    },
    {
      route: "cutter-users",
      load_phase: "route-entry",
      prefetch: false,
      endpoints: ["/api/admin/cutter-users"],
      fallback: "Keep route-local user loading/errors isolated from dashboard shell."
    },
    {
      route: "doctor",
      load_phase: "route-entry",
      prefetch: false,
      endpoints: [
        "/api/admin/doctor/report",
        "/api/admin/runtime/diagnostics/history"
      ],
      fallback: "Use placeholder Doctor summary from shell until explicit report and runtime diagnostics load."
    },
    {
      route: "settings",
      load_phase: "route-entry",
      prefetch: false,
      endpoints: ["/api/admin/library/path-checks", "/api/admin/settings/runtime"],
      fallback: "Settings form can render from shell settings before path/runtime probes finish."
    }
  ];

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    strategy: "shell-first-route-owned-v1",
    shell_interactive_target_ms: 1_000,
    route_timeout_ms: ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS,
    background_prefetch_default: false,
    hidden_full_scan_allowed: false,
    endpoints: endpointPlans,
    routes: routePlans
  };
}
