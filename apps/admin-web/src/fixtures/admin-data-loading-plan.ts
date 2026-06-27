import type {
  AdminDataLoadCost,
  AdminDataLoadingEndpointPlan,
  AdminDataLoadingPlan,
  AdminDataLoadPhase,
  AdminDataLoadScanMode,
  AdminRouteDataLoadingPlan,
  AdminScanDataSource,
  AdminScanReason
} from "../api.ts";

const DEFAULT_PROCESS_HISTORY_LOAD_LIMIT = 20;

function endpoint(input: {
  endpoint: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  phase: AdminDataLoadPhase;
  cost: AdminDataLoadCost;
  scan_mode: AdminDataLoadScanMode;
  data_source: AdminScanDataSource;
  scan_reason: AdminScanReason;
  critical?: boolean;
  default_limit?: number;
  read_model?: string;
  timeout_ms: number;
  refresh: "manual" | "interval" | "route-entry" | "command-only";
  notes: string;
}): AdminDataLoadingEndpointPlan {
  return {
    critical: false,
    ...input
  };
}

function route(input: {
  route: string;
  load_phase: "shell" | "route-entry" | "manual-command";
  endpoints: string[];
  fallback: string;
  prefetch?: boolean;
}): AdminRouteDataLoadingPlan {
  return {
    prefetch: false,
    ...input
  };
}

export function createAdminFixtureDataLoadingPlan(input: {
  process_history_default_load_limit?: number;
} = {}): AdminDataLoadingPlan {
  const processHistoryDefaultLoadLimit =
    input.process_history_default_load_limit ?? DEFAULT_PROCESS_HISTORY_LOAD_LIMIT;

  return {
    schema_version: "1.0",
    generated_at: "2024-05-07 10:26:00",
    strategy: "shell-first-route-owned-v1",
    shell_interactive_target_ms: 1_000,
    route_timeout_ms: 8_000,
    background_prefetch_default: false,
    hidden_full_scan_allowed: false,
    endpoints: [
      endpoint({
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
        notes: "Fixture shell status"
      }),
      endpoint({
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
        notes: "Fixture shell settings"
      }),
      endpoint({
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
        notes: "Fixture supervisor status"
      }),
      endpoint({
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
        notes: "Fixture route loading contract"
      }),
      endpoint({
        endpoint: "/api/admin/source-videos",
        method: "GET",
        phase: "route",
        cost: "bounded",
        scan_mode: "paged-list",
        data_source: "admin-read-model",
        scan_reason: "route-owned-page",
        default_limit: 20,
        read_model: "source-video-status-read-model-v1",
        timeout_ms: 8_000,
        refresh: "route-entry",
        notes: "Fixture source-video route list; non-ready status filters use source-video-status-read-model-v1"
      }),
      endpoint({
        endpoint: "/api/admin/source-videos/:id",
        method: "GET",
        phase: "route",
        cost: "bounded",
        scan_mode: "single-id",
        data_source: "source-video-manifest",
        scan_reason: "selected-record",
        timeout_ms: 8_000,
        refresh: "route-entry",
        notes: "Fixture selected source-video detail"
      }),
      endpoint({
        endpoint: "/api/admin/preprocess/jobs",
        method: "GET",
        phase: "route",
        cost: "bounded",
        scan_mode: "status-scan",
        data_source: "admin-read-model",
        scan_reason: "route-owned-page",
        default_limit: 20,
        read_model: "source-video-status-read-model-v1",
        timeout_ms: 8_000,
        refresh: "interval",
        notes: "Fixture preprocess route list; candidates use source-video-status-read-model-v1"
      }),
      endpoint({
        endpoint: "/api/admin/preprocess/process-history",
        method: "GET",
        phase: "route",
        cost: "bounded",
        scan_mode: "no-scan",
        data_source: "admin-read-model",
        scan_reason: "route-owned-page",
        default_limit: processHistoryDefaultLoadLimit,
        read_model: "admin-read-model-v1",
        timeout_ms: 8_000,
        refresh: "route-entry",
        notes: "Fixture process-history route reads admin-read-model-v1 and must not enumerate job files."
      }),
      endpoint({
        endpoint: "/api/admin/preprocess/process-history/readiness",
        method: "GET",
        phase: "route",
        cost: "cheap",
        scan_mode: "no-scan",
        data_source: "admin-read-model",
        scan_reason: "read-model-health",
        read_model: "admin-read-model-v1",
        timeout_ms: 1_000,
        refresh: "manual",
        notes: "Fixture process-history readiness diagnostic"
      }),
      endpoint({
        endpoint: "/api/admin/read-model/status",
        method: "GET",
        phase: "route",
        cost: "cheap",
        scan_mode: "no-scan",
        data_source: "admin-read-model",
        scan_reason: "read-model-health",
        read_model: "source-video-status-read-model-v1",
        timeout_ms: 1_000,
        refresh: "manual",
        notes: "Fixture read-model freshness status"
      }),
      endpoint({
        endpoint: "/api/admin/read-model/reconcile/status",
        method: "GET",
        phase: "route",
        cost: "cheap",
        scan_mode: "no-scan",
        data_source: "read-model-reconcile",
        scan_reason: "read-model-health",
        read_model: "admin-read-model-v1",
        timeout_ms: 1_000,
        refresh: "manual",
        notes: "Fixture read-model reconciler status"
      }),
      endpoint({
        endpoint: "/api/admin/operations/overview",
        method: "GET",
        phase: "route",
        cost: "bounded",
        scan_mode: "no-scan",
        data_source: "data-loading-contract",
        scan_reason: "route-owned-page",
        read_model: "source-video-status-read-model-v1",
        timeout_ms: 8_000,
        refresh: "route-entry",
        notes: "Fixture protection center aggregate"
      }),
      endpoint({
        endpoint: "/api/admin/operation-log",
        method: "GET",
        phase: "route",
        cost: "bounded",
        scan_mode: "no-scan",
        data_source: "operation-log",
        scan_reason: "operation-log-tail",
        timeout_ms: 1_000,
        refresh: "route-entry",
        notes: "Fixture admin operation log tail"
      }),
      endpoint({
        endpoint: "/api/admin/command-snapshots/:snapshot_id/restore-plan",
        method: "GET",
        phase: "command",
        cost: "bounded",
        scan_mode: "no-scan",
        data_source: "command-snapshot",
        scan_reason: "selected-record",
        timeout_ms: 8_000,
        refresh: "command-only",
        notes: "Fixture command snapshot restore preflight"
      }),
      endpoint({
        endpoint: "/api/admin/command-snapshots/:snapshot_id/restore",
        method: "POST",
        phase: "command",
        cost: "bounded",
        scan_mode: "no-scan",
        data_source: "command-snapshot",
        scan_reason: "selected-record",
        timeout_ms: 8_000,
        refresh: "command-only",
        notes: "Fixture command snapshot restore execution"
      }),
      endpoint({
        endpoint: "/api/admin/index/versions",
        method: "GET",
        phase: "route",
        cost: "bounded",
        scan_mode: "paged-list",
        data_source: "index-version-packages",
        scan_reason: "index-version-page",
        default_limit: 8,
        timeout_ms: 8_000,
        refresh: "route-entry",
        notes: "Fixture index-version route list"
      }),
      endpoint({
        endpoint: "/api/admin/doctor/report",
        method: "GET",
        phase: "route",
        cost: "expensive",
        scan_mode: "status-scan",
        data_source: "doctor-probes",
        scan_reason: "doctor-route",
        timeout_ms: 8_000,
        refresh: "route-entry",
        notes: "Fixture Doctor route report"
      }),
      endpoint({
        endpoint: "/api/admin/runtime/diagnostics/history",
        method: "GET",
        phase: "route",
        cost: "bounded",
        scan_mode: "no-scan",
        data_source: "admin-read-model",
        scan_reason: "read-model-health",
        read_model: "runtime-diagnostics-history-v1",
        timeout_ms: 1_000,
        refresh: "route-entry",
        notes: "Fixture runtime diagnostics history"
      }),
      endpoint({
        endpoint: "/api/admin/cutter-users",
        method: "GET",
        phase: "route",
        cost: "bounded",
        scan_mode: "no-scan",
        data_source: "user-store",
        scan_reason: "user-management-route",
        timeout_ms: 20_000,
        refresh: "route-entry",
        notes: "Fixture cutter-user route table"
      }),
      endpoint({
        endpoint: "/api/admin/library/path-checks",
        method: "GET",
        phase: "route",
        cost: "bounded",
        scan_mode: "no-scan",
        data_source: "path-checks",
        scan_reason: "settings-route",
        timeout_ms: 8_000,
        refresh: "route-entry",
        notes: "Fixture path checks"
      }),
      endpoint({
        endpoint: "/api/admin/settings/runtime",
        method: "GET",
        phase: "route",
        cost: "bounded",
        scan_mode: "no-scan",
        data_source: "runtime-secrets",
        scan_reason: "settings-route",
        timeout_ms: 8_000,
        refresh: "route-entry",
        notes: "Fixture settings runtime probe"
      }),
      endpoint({
        endpoint: "/api/admin/library/scan",
        method: "POST",
        phase: "command",
        cost: "expensive",
        scan_mode: "folder-scan",
        data_source: "source-folders",
        scan_reason: "explicit-scan-apply",
        timeout_ms: 30_000,
        refresh: "command-only",
        notes: "Fixture explicit scan command"
      }),
      endpoint({
        endpoint: "/api/admin/read-model/reconcile",
        method: "POST",
        phase: "command",
        cost: "expensive",
        scan_mode: "full-reconcile",
        data_source: "read-model-reconcile",
        scan_reason: "explicit-read-model-reconcile",
        read_model: "admin-read-model-v1",
        timeout_ms: 30_000,
        refresh: "command-only",
        notes: "Fixture explicit background read-model reconcile command"
      }),
      endpoint({
        endpoint: "/api/admin/read-model/reconcile/cancel",
        method: "POST",
        phase: "command",
        cost: "cheap",
        scan_mode: "no-scan",
        data_source: "read-model-reconcile",
        scan_reason: "explicit-reconcile-cancel",
        read_model: "admin-read-model-v1",
        timeout_ms: 1_000,
        refresh: "command-only",
        notes: "Fixture explicit background read-model reconcile cancel command"
      })
    ],
    routes: [
      route({
        route: "dashboard",
        load_phase: "shell",
        endpoints: [
          "/api/admin/library/status",
          "/api/admin/settings/config",
          "/api/admin/preprocess/supervisor/status",
          "/api/admin/data-loading/plan"
        ],
        fallback: "Use shell placeholders until route panels ask for heavy data."
      }),
      route({
        route: "source-videos",
        load_phase: "route-entry",
        endpoints: ["/api/admin/source-videos"],
        fallback: "Show route-local loading."
      }),
      route({
        route: "source-detail",
        load_phase: "route-entry",
        endpoints: ["/api/admin/source-videos/:id"],
        fallback: "Show selected-source error without replacing shell data."
      }),
      route({
        route: "preprocess-jobs",
        load_phase: "route-entry",
        endpoints: [
          "/api/admin/preprocess/jobs",
          "/api/admin/preprocess/process-history",
          "/api/admin/preprocess/process-history/readiness",
          "/api/admin/index/versions"
        ],
        fallback: "Use summary counts until route data resolves."
      }),
      route({
        route: "index-publish",
        load_phase: "route-entry",
        endpoints: ["/api/admin/source-videos", "/api/admin/index/versions"],
        fallback: "Show route-local pending-publish and index-version loading."
      }),
      route({
        route: "protection",
        load_phase: "route-entry",
        endpoints: [
          "/api/admin/operations/overview",
          "/api/admin/read-model/reconcile/status"
        ],
        fallback: "Show shell library counts until protection details resolve."
      }),
      route({
        route: "operation-log",
        load_phase: "route-entry",
        endpoints: ["/api/admin/operation-log"],
        fallback: "Show route-local operation log loading."
      }),
      route({
        route: "cutter-users",
        load_phase: "route-entry",
        endpoints: ["/api/admin/cutter-users"],
        fallback: "Keep route-local user loading/errors isolated from dashboard shell."
      }),
      route({
        route: "doctor",
        load_phase: "route-entry",
        endpoints: [
          "/api/admin/doctor/report",
          "/api/admin/runtime/diagnostics/history"
        ],
        fallback: "Use placeholder Doctor summary from shell until explicit report and runtime diagnostics load."
      }),
      route({
        route: "settings",
        load_phase: "route-entry",
        endpoints: ["/api/admin/library/path-checks", "/api/admin/settings/runtime"],
        fallback: "Settings form can render from shell settings before path/runtime probes finish."
      })
    ]
  };
}
