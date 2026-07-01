import type {
  AdminDashboardData,
  AdminDataLoadingPlan,
  AdminPreprocessStatus,
  AdminSourceVideoManifestFallbackPolicy
} from "../api.ts";
import type { AdminRoute } from "./navigation.ts";

export type AdminRouteLocalReadKey =
  | "sourceVideos"
  | "indexRequiredVideos"
  | "preprocessJobs"
  | "cutterUsers"
  | "doctorReport"
  | "settingsPathChecks"
  | "settingsRuntime";

export interface AdminRouteLocalReadSpec {
  key: AdminRouteLocalReadKey;
  route: AdminRoute;
  label: string;
  surface: string;
  global_action_notice: false;
}

export type AdminRouteLoadingKey =
  | "sourceDetail"
  | "sourceVideosInitial"
  | "sourceVideosMore"
  | "indexRequiredVideos"
  | "preprocessJobsInitial"
  | "preprocessProcessHistory"
  | "operationsOverview"
  | "operationLog"
  | "doctorReport"
  | "runtimeDiagnostics"
  | "settingsPathChecks"
  | "settingsRuntime"
  | "cutterUsers";

export type AdminRouteLoadingPhase =
  | "route-entry"
  | "route-pagination"
  | "route-supplemental";

export interface AdminRouteLoadingSpec {
  key: AdminRouteLoadingKey;
  route: AdminRoute;
  label: string;
  surface: string;
  phase: AdminRouteLoadingPhase;
  shell_blocking: false;
  abortable: true;
  global_action_notice: false;
}

export type AdminBackgroundRefreshKey =
  | "shellDataReloadToken"
  | "dashboardPanelData"
  | "nonDashboardMetrics"
  | "cutterUsersPrefetch"
  | "preprocessJobsPrefetch"
  | "preprocessJobsInterval";

export type AdminBackgroundRefreshTrigger =
  | "interval"
  | "route-prefetch"
  | "supplemental-read";

export interface AdminBackgroundRefreshSpec {
  key: AdminBackgroundRefreshKey;
  owner: AdminRoute | "shell";
  label: string;
  surface: string;
  trigger: AdminBackgroundRefreshTrigger;
  shell_blocking: false;
  route_blocking: false;
  abortable: true;
  enabled_by_default: boolean;
  visible_error_surface: "none" | "route-local";
}

export interface AdminBackgroundRefreshInput {
  key: AdminBackgroundRefreshKey;
  loading: boolean;
  active?: boolean;
  enabled?: boolean;
  canLoad?: boolean;
}

export interface AdminBackgroundRefreshScopeInput<TRequestScope> extends AdminBackgroundRefreshInput {
  createRequestScope: (spec: AdminBackgroundRefreshSpec) => TRequestScope;
}

export interface AdminBackgroundRefreshScopeStart<TRequestScope> {
  spec: AdminBackgroundRefreshSpec;
  requestScope: TRequestScope;
}

export interface AdminBackgroundRefreshExecutionContext<TRequestScope> {
  spec: AdminBackgroundRefreshSpec;
  requestScope: TRequestScope;
}

export interface AdminBackgroundRefreshSettledContext<TRequestScope>
  extends AdminBackgroundRefreshExecutionContext<TRequestScope> {
  cancelled: boolean;
}

export interface AdminBackgroundRefreshExecutionInput<
  TRequestScope extends { abort: () => void },
  TResult
> extends AdminBackgroundRefreshScopeInput<TRequestScope> {
  onStart?: (context: AdminBackgroundRefreshExecutionContext<TRequestScope>) => void;
  request: (context: AdminBackgroundRefreshExecutionContext<TRequestScope>) => Promise<TResult>;
  onSuccess: (
    result: TResult,
    context: AdminBackgroundRefreshExecutionContext<TRequestScope>
  ) => void;
  onError: (
    error: unknown,
    context: AdminBackgroundRefreshExecutionContext<TRequestScope>
  ) => void;
  onSettled?: (context: AdminBackgroundRefreshSettledContext<TRequestScope>) => void;
  onCancel?: (context: AdminBackgroundRefreshExecutionContext<TRequestScope>) => void;
}

export interface AdminBackgroundRefreshExecution<TRequestScope>
  extends AdminBackgroundRefreshExecutionContext<TRequestScope> {
  cancel: () => void;
}

export interface AdminRouteRenderLoadingInput {
  sourceVideosLoading: boolean;
  sourceVideosLoadingMore: boolean;
  sourceVideosHasMore: boolean;
  preprocessJobsLoading: boolean;
  operationsOverviewLoading: boolean;
  operationLogLoading: boolean;
}

export interface AdminRouteRenderLoadingState {
  sourceVideos: boolean;
  sourceVideosMore: boolean;
  sourceVideosHasMore: boolean;
  preprocessJobs: boolean;
  operationsOverview: boolean;
  operationLog: boolean;
}

export type AdminRouteTokenLoadKey =
  | "doctorReport"
  | "runtimeDiagnostics"
  | "settingsPathChecks"
  | "settingsRuntime";

export type AdminRouteTokenLoadClientMethod =
  | "getDoctorReport"
  | "getRuntimeDiagnosticsHistory"
  | "getPathChecks"
  | "getRuntimeSettings";

export type AdminRouteTokenLoadSuccessTarget =
  | "dashboardData.doctor"
  | "runtimeDiagnosticsHistory"
  | "dashboardData.path_checks"
  | "dashboardData.runtime";

export type AdminRouteTokenLoadErrorSurface =
  | "route-local-read-error"
  | "route-local-state-error";

export interface AdminRouteTokenLoadSpec {
  key: AdminRouteTokenLoadKey;
  route: AdminRoute;
  loading_key: AdminRouteLoadingKey;
  local_read_key?: AdminRouteLocalReadKey;
  requires_shell_data: boolean;
  request_scope: "route-abortable";
  client_method: AdminRouteTokenLoadClientMethod;
  success_target: AdminRouteTokenLoadSuccessTarget;
  error_surface: AdminRouteTokenLoadErrorSurface;
  supports_pending_handoff: boolean;
}

export interface AdminRouteTokenLoadInput {
  key: AdminRouteTokenLoadKey;
  route: AdminRoute;
  loading: boolean;
  loadedToken: number;
  reloadToken: number;
  canLoad?: boolean;
}

export interface AdminRouteTokenRequestScopeInput<TRequestScope> extends AdminRouteTokenLoadInput {
  createRequestScope: (spec: AdminRouteTokenLoadSpec) => TRequestScope;
}

export interface AdminRouteTokenRequestScopeStart<TRequestScope> {
  spec: AdminRouteTokenLoadSpec;
  requestScope: TRequestScope;
}

export interface AdminRouteTokenLoadExecutionContext<TRequestScope> {
  spec: AdminRouteTokenLoadSpec;
  requestScope: TRequestScope;
}

export interface AdminRouteTokenLoadSettledContext<TRequestScope>
  extends AdminRouteTokenLoadExecutionContext<TRequestScope> {
  cancelled: boolean;
}

export interface AdminRouteTokenLoadExecutionInput<
  TRequestScope extends { abort: () => void },
  TResult
> extends AdminRouteTokenRequestScopeInput<TRequestScope> {
  onStart?: (context: AdminRouteTokenLoadExecutionContext<TRequestScope>) => void;
  request: (context: AdminRouteTokenLoadExecutionContext<TRequestScope>) => Promise<TResult>;
  onSuccess: (
    result: TResult,
    context: AdminRouteTokenLoadExecutionContext<TRequestScope>
  ) => void;
  onError: (
    error: unknown,
    context: AdminRouteTokenLoadExecutionContext<TRequestScope>
  ) => void;
  onSettled?: (context: AdminRouteTokenLoadSettledContext<TRequestScope>) => void;
  onCancel?: (context: AdminRouteTokenLoadExecutionContext<TRequestScope>) => void;
}

export interface AdminRouteTokenLoadExecution<TRequestScope>
  extends AdminRouteTokenLoadExecutionContext<TRequestScope> {
  cancel: () => void;
}

export type AdminRouteRequestLoadKey =
  | "cutterUsers"
  | "indexRequiredVideos"
  | "operationLog"
  | "operationsOverview"
  | "preprocessJobsInitial"
  | "sourceDetail"
  | "sourceVideosInitial";

export type AdminRouteRequestLoadClientMethod =
  | "listSourceVideos"
  | "listSourceVideosWithRuntime"
  | "listCutterUsers"
  | "getOperationLog"
  | "loadProtectionCenterData"
  | "loadAdminPreprocessRouteData"
  | "getSourceVideoDetail";

export type AdminRouteRequestLoadSuccessTarget =
  | "cutterUsers"
  | "indexRequiredVideos"
  | "operationLog"
  | "operationsOverview"
  | "preprocessJobsInitial"
  | "sourceDetail"
  | "sourceVideosInitial";

export type AdminRouteRequestLoadErrorSurface =
  | "route-local-read-error"
  | "route-local-state-error";

export interface AdminRouteRequestLoadSpec {
  key: AdminRouteRequestLoadKey;
  route: AdminRoute;
  loading_key: AdminRouteLoadingKey;
  local_read_key?: AdminRouteLocalReadKey;
  request_scope: "route-abortable";
  client_method: AdminRouteRequestLoadClientMethod;
  success_target: AdminRouteRequestLoadSuccessTarget;
  error_surface: AdminRouteRequestLoadErrorSurface;
  supports_loaded_token: boolean;
}

export interface AdminRouteRequestLoadInput {
  key: AdminRouteRequestLoadKey;
  route: AdminRoute;
  loading: boolean;
  hasFreshData?: boolean;
  canLoad?: boolean;
}

export interface AdminRouteRequestScopeInput<TRequestScope> extends AdminRouteRequestLoadInput {
  createRequestScope: (spec: AdminRouteRequestLoadSpec) => TRequestScope;
}

export interface AdminRouteRequestScopeStart<TRequestScope> {
  spec: AdminRouteRequestLoadSpec;
  requestScope: TRequestScope;
}

export interface AdminRouteRequestLoadExecutionContext<TRequestScope> {
  spec: AdminRouteRequestLoadSpec;
  requestScope: TRequestScope;
}

export interface AdminRouteRequestLoadSettledContext<TRequestScope>
  extends AdminRouteRequestLoadExecutionContext<TRequestScope> {
  cancelled: boolean;
}

export interface AdminRouteRequestLoadExecutionInput<
  TRequestScope extends { abort: () => void },
  TResult
> extends AdminRouteRequestScopeInput<TRequestScope> {
  onStart?: (context: AdminRouteRequestLoadExecutionContext<TRequestScope>) => void;
  request: (context: AdminRouteRequestLoadExecutionContext<TRequestScope>) => Promise<TResult>;
  onSuccess: (
    result: TResult,
    context: AdminRouteRequestLoadExecutionContext<TRequestScope>
  ) => void;
  onError: (
    error: unknown,
    context: AdminRouteRequestLoadExecutionContext<TRequestScope>
  ) => void;
  onSettled?: (context: AdminRouteRequestLoadSettledContext<TRequestScope>) => void;
  onCancel?: (context: AdminRouteRequestLoadExecutionContext<TRequestScope>) => void;
}

export interface AdminRouteRequestLoadExecution<TRequestScope>
  extends AdminRouteRequestLoadExecutionContext<TRequestScope> {
  cancel: () => void;
}

export const ADMIN_BACKGROUND_ROUTE_PREFETCH_ENABLED = false;

const ALWAYS_AUTO_REFRESH_ROUTES = new Set<AdminRoute>([
  "preprocess-jobs"
]);

const PRODUCTION_AUTO_REFRESH_ROUTES = new Set<AdminRoute>([
  "source-detail"
]);

export type AdminRouteLocalReadErrors = Record<AdminRouteLocalReadKey, string>;

export const ADMIN_ROUTE_LOCAL_READ_SPECS: Record<AdminRouteLocalReadKey, AdminRouteLocalReadSpec> = {
  sourceVideos: {
    key: "sourceVideos",
    route: "source-videos",
    label: "原视频列表加载",
    surface: "素材表格",
    global_action_notice: false
  },
  indexRequiredVideos: {
    key: "indexRequiredVideos",
    route: "index-publish",
    label: "待上线素材加载",
    surface: "上线队列",
    global_action_notice: false
  },
  preprocessJobs: {
    key: "preprocessJobs",
    route: "preprocess-jobs",
    label: "预处理队列加载",
    surface: "任务队列",
    global_action_notice: false
  },
  cutterUsers: {
    key: "cutterUsers",
    route: "cutter-users",
    label: "剪辑师用户加载",
    surface: "用户表格",
    global_action_notice: false
  },
  doctorReport: {
    key: "doctorReport",
    route: "doctor",
    label: "系统检查加载",
    surface: "诊断报告",
    global_action_notice: false
  },
  settingsPathChecks: {
    key: "settingsPathChecks",
    route: "settings",
    label: "路径校验加载",
    surface: "路径检查",
    global_action_notice: false
  },
  settingsRuntime: {
    key: "settingsRuntime",
    route: "settings",
    label: "运行时状态加载",
    surface: "运行策略",
    global_action_notice: false
  }
};

export const ADMIN_ROUTE_LOADING_SPECS: Record<AdminRouteLoadingKey, AdminRouteLoadingSpec> = {
  sourceDetail: {
    key: "sourceDetail",
    route: "source-detail",
    label: "原视频详情加载",
    surface: "详情 Inspector",
    phase: "route-entry",
    shell_blocking: false,
    abortable: true,
    global_action_notice: false
  },
  sourceVideosInitial: {
    key: "sourceVideosInitial",
    route: "source-videos",
    label: "原视频首屏加载",
    surface: "素材表格",
    phase: "route-entry",
    shell_blocking: false,
    abortable: true,
    global_action_notice: false
  },
  sourceVideosMore: {
    key: "sourceVideosMore",
    route: "source-videos",
    label: "原视频分页加载",
    surface: "素材表格",
    phase: "route-pagination",
    shell_blocking: false,
    abortable: true,
    global_action_notice: false
  },
  indexRequiredVideos: {
    key: "indexRequiredVideos",
    route: "index-publish",
    label: "待上线素材加载",
    surface: "上线队列",
    phase: "route-entry",
    shell_blocking: false,
    abortable: true,
    global_action_notice: false
  },
  preprocessJobsInitial: {
    key: "preprocessJobsInitial",
    route: "preprocess-jobs",
    label: "预处理队列首屏加载",
    surface: "任务队列",
    phase: "route-entry",
    shell_blocking: false,
    abortable: true,
    global_action_notice: false
  },
  preprocessProcessHistory: {
    key: "preprocessProcessHistory",
    route: "preprocess-jobs",
    label: "处理历史加载",
    surface: "处理历史",
    phase: "route-supplemental",
    shell_blocking: false,
    abortable: true,
    global_action_notice: false
  },
  operationsOverview: {
    key: "operationsOverview",
    route: "protection",
    label: "保护中心总览加载",
    surface: "保护中心",
    phase: "route-entry",
    shell_blocking: false,
    abortable: true,
    global_action_notice: false
  },
  operationLog: {
    key: "operationLog",
    route: "operation-log",
    label: "操作记录加载",
    surface: "审计日志",
    phase: "route-entry",
    shell_blocking: false,
    abortable: true,
    global_action_notice: false
  },
  doctorReport: {
    key: "doctorReport",
    route: "doctor",
    label: "系统检查报告加载",
    surface: "诊断报告",
    phase: "route-entry",
    shell_blocking: false,
    abortable: true,
    global_action_notice: false
  },
  runtimeDiagnostics: {
    key: "runtimeDiagnostics",
    route: "doctor",
    label: "运行时诊断历史加载",
    surface: "运行时历史",
    phase: "route-supplemental",
    shell_blocking: false,
    abortable: true,
    global_action_notice: false
  },
  settingsPathChecks: {
    key: "settingsPathChecks",
    route: "settings",
    label: "路径校验加载",
    surface: "路径检查",
    phase: "route-entry",
    shell_blocking: false,
    abortable: true,
    global_action_notice: false
  },
  settingsRuntime: {
    key: "settingsRuntime",
    route: "settings",
    label: "运行时状态加载",
    surface: "运行策略",
    phase: "route-supplemental",
    shell_blocking: false,
    abortable: true,
    global_action_notice: false
  },
  cutterUsers: {
    key: "cutterUsers",
    route: "cutter-users",
    label: "剪辑师用户加载",
    surface: "用户表格",
    phase: "route-entry",
    shell_blocking: false,
    abortable: true,
    global_action_notice: false
  }
};

export const ADMIN_ROUTE_TOKEN_LOAD_SPECS: Record<AdminRouteTokenLoadKey, AdminRouteTokenLoadSpec> = {
  doctorReport: {
    key: "doctorReport",
    route: "doctor",
    loading_key: "doctorReport",
    local_read_key: "doctorReport",
    requires_shell_data: false,
    request_scope: "route-abortable",
    client_method: "getDoctorReport",
    success_target: "dashboardData.doctor",
    error_surface: "route-local-read-error",
    supports_pending_handoff: true
  },
  runtimeDiagnostics: {
    key: "runtimeDiagnostics",
    route: "doctor",
    loading_key: "runtimeDiagnostics",
    requires_shell_data: true,
    request_scope: "route-abortable",
    client_method: "getRuntimeDiagnosticsHistory",
    success_target: "runtimeDiagnosticsHistory",
    error_surface: "route-local-state-error",
    supports_pending_handoff: false
  },
  settingsPathChecks: {
    key: "settingsPathChecks",
    route: "settings",
    loading_key: "settingsPathChecks",
    local_read_key: "settingsPathChecks",
    requires_shell_data: false,
    request_scope: "route-abortable",
    client_method: "getPathChecks",
    success_target: "dashboardData.path_checks",
    error_surface: "route-local-read-error",
    supports_pending_handoff: true
  },
  settingsRuntime: {
    key: "settingsRuntime",
    route: "settings",
    loading_key: "settingsRuntime",
    local_read_key: "settingsRuntime",
    requires_shell_data: false,
    request_scope: "route-abortable",
    client_method: "getRuntimeSettings",
    success_target: "dashboardData.runtime",
    error_surface: "route-local-read-error",
    supports_pending_handoff: true
  }
};

export const ADMIN_ROUTE_REQUEST_LOAD_SPECS: Record<AdminRouteRequestLoadKey, AdminRouteRequestLoadSpec> = {
  cutterUsers: {
    key: "cutterUsers",
    route: "cutter-users",
    loading_key: "cutterUsers",
    local_read_key: "cutterUsers",
    request_scope: "route-abortable",
    client_method: "listCutterUsers",
    success_target: "cutterUsers",
    error_surface: "route-local-read-error",
    supports_loaded_token: true
  },
  indexRequiredVideos: {
    key: "indexRequiredVideos",
    route: "index-publish",
    loading_key: "indexRequiredVideos",
    local_read_key: "indexRequiredVideos",
    request_scope: "route-abortable",
    client_method: "listSourceVideos",
    success_target: "indexRequiredVideos",
    error_surface: "route-local-read-error",
    supports_loaded_token: false
  },
  sourceVideosInitial: {
    key: "sourceVideosInitial",
    route: "source-videos",
    loading_key: "sourceVideosInitial",
    local_read_key: "sourceVideos",
    request_scope: "route-abortable",
    client_method: "listSourceVideosWithRuntime",
    success_target: "sourceVideosInitial",
    error_surface: "route-local-read-error",
    supports_loaded_token: false
  },
  preprocessJobsInitial: {
    key: "preprocessJobsInitial",
    route: "preprocess-jobs",
    loading_key: "preprocessJobsInitial",
    local_read_key: "preprocessJobs",
    request_scope: "route-abortable",
    client_method: "loadAdminPreprocessRouteData",
    success_target: "preprocessJobsInitial",
    error_surface: "route-local-read-error",
    supports_loaded_token: false
  },
  operationLog: {
    key: "operationLog",
    route: "operation-log",
    loading_key: "operationLog",
    request_scope: "route-abortable",
    client_method: "getOperationLog",
    success_target: "operationLog",
    error_surface: "route-local-state-error",
    supports_loaded_token: false
  },
  operationsOverview: {
    key: "operationsOverview",
    route: "protection",
    loading_key: "operationsOverview",
    request_scope: "route-abortable",
    client_method: "loadProtectionCenterData",
    success_target: "operationsOverview",
    error_surface: "route-local-state-error",
    supports_loaded_token: false
  },
  sourceDetail: {
    key: "sourceDetail",
    route: "source-detail",
    loading_key: "sourceDetail",
    request_scope: "route-abortable",
    client_method: "getSourceVideoDetail",
    success_target: "sourceDetail",
    error_surface: "route-local-state-error",
    supports_loaded_token: false
  }
};

export const ADMIN_BACKGROUND_REFRESH_SPECS: Record<AdminBackgroundRefreshKey, AdminBackgroundRefreshSpec> = {
  shellDataReloadToken: {
    key: "shellDataReloadToken",
    owner: "shell",
    label: "Shell 数据重载调度",
    surface: "Admin Shell",
    trigger: "interval",
    shell_blocking: false,
    route_blocking: false,
    abortable: true,
    enabled_by_default: true,
    visible_error_surface: "none"
  },
  dashboardPanelData: {
    key: "dashboardPanelData",
    owner: "dashboard",
    label: "总览面板后台刷新",
    surface: "Dashboard panels",
    trigger: "interval",
    shell_blocking: false,
    route_blocking: false,
    abortable: true,
    enabled_by_default: true,
    visible_error_surface: "none"
  },
  nonDashboardMetrics: {
    key: "nonDashboardMetrics",
    owner: "shell",
    label: "非总览页指标补充读取",
    surface: "顶部状态与补充指标",
    trigger: "supplemental-read",
    shell_blocking: false,
    route_blocking: false,
    abortable: true,
    enabled_by_default: true,
    visible_error_surface: "none"
  },
  cutterUsersPrefetch: {
    key: "cutterUsersPrefetch",
    owner: "cutter-users",
    label: "剪辑师用户预加载",
    surface: "用户表格",
    trigger: "route-prefetch",
    shell_blocking: false,
    route_blocking: false,
    abortable: true,
    enabled_by_default: false,
    visible_error_surface: "none"
  },
  preprocessJobsPrefetch: {
    key: "preprocessJobsPrefetch",
    owner: "preprocess-jobs",
    label: "预处理队列预加载",
    surface: "任务队列",
    trigger: "route-prefetch",
    shell_blocking: false,
    route_blocking: false,
    abortable: true,
    enabled_by_default: false,
    visible_error_surface: "none"
  },
  preprocessJobsInterval: {
    key: "preprocessJobsInterval",
    owner: "preprocess-jobs",
    label: "预处理队列后台刷新",
    surface: "任务队列与处理历史",
    trigger: "interval",
    shell_blocking: false,
    route_blocking: false,
    abortable: true,
    enabled_by_default: true,
    visible_error_surface: "route-local"
  }
};

export const EMPTY_ADMIN_ROUTE_LOCAL_READ_ERRORS: AdminRouteLocalReadErrors = Object.freeze({
  sourceVideos: "",
  indexRequiredVideos: "",
  preprocessJobs: "",
  cutterUsers: "",
  doctorReport: "",
  settingsPathChecks: "",
  settingsRuntime: ""
});

export function adminRouteLocalReadLabel(key: AdminRouteLocalReadKey): string {
  return ADMIN_ROUTE_LOCAL_READ_SPECS[key].label;
}

export function setAdminRouteLocalReadError(
  current: AdminRouteLocalReadErrors,
  key: AdminRouteLocalReadKey,
  message: string
): AdminRouteLocalReadErrors {
  return {
    ...current,
    [key]: message
  };
}

export function clearAdminRouteLocalReadError(
  current: AdminRouteLocalReadErrors,
  key: AdminRouteLocalReadKey
): AdminRouteLocalReadErrors {
  if (!current[key]) {
    return current;
  }

  return setAdminRouteLocalReadError(current, key, "");
}

export function adminRouteRenderLoadingState(
  input: AdminRouteRenderLoadingInput
): AdminRouteRenderLoadingState {
  return {
    sourceVideos: input.sourceVideosLoading,
    sourceVideosMore: input.sourceVideosLoadingMore,
    sourceVideosHasMore: input.sourceVideosHasMore,
    preprocessJobs: input.preprocessJobsLoading,
    operationsOverview: input.operationsOverviewLoading,
    operationLog: input.operationLogLoading
  };
}

export function shouldAutoRefreshAdminData(route: AdminRoute, data: AdminDashboardData): boolean {
  if (ALWAYS_AUTO_REFRESH_ROUTES.has(route)) {
    return true;
  }

  if (!PRODUCTION_AUTO_REFRESH_ROUTES.has(route)) {
    return false;
  }

  return (
    data.jobs.supervisor.state === "running" ||
    data.jobs.supervisor.state === "stopping" ||
    data.jobs.active_count > 0 ||
    data.jobs.queued_count > 0 ||
    data.status.processing_video_count > 0 ||
    data.status.queued_video_count > 0 ||
    data.status.unprocessed_video_count > 0 ||
    data.status.index_required_video_count > 0
  );
}

export function shouldLoadAdminSourceVideos(input: {
  route: AdminRoute;
  hasData: boolean;
}): boolean {
  return input.route === "source-videos" && input.hasData;
}

export function adminSourceVideoManifestFallbackPolicy(
  status: AdminPreprocessStatus | "all"
): AdminSourceVideoManifestFallbackPolicy | undefined {
  return status === "processing" || status === "index-required"
    ? "forbid"
    : undefined;
}

export function shouldPrefetchAdminRoute(input: {
  plan: AdminDataLoadingPlan | null | undefined;
  route: AdminRoute;
  hasData: boolean;
}): boolean {
  if (!ADMIN_BACKGROUND_ROUTE_PREFETCH_ENABLED || !input.hasData) {
    return false;
  }

  const routePlan = input.plan?.routes.find((item) => item.route === input.route);
  return routePlan?.prefetch === true;
}

export function shouldStartAdminBackgroundRefresh(input: AdminBackgroundRefreshInput): boolean {
  const spec = ADMIN_BACKGROUND_REFRESH_SPECS[input.key];

  if (!(input.enabled ?? spec.enabled_by_default)) {
    return false;
  }

  if (input.loading || input.active) {
    return false;
  }

  return input.canLoad !== false;
}

export function createAdminBackgroundRefreshScope<TRequestScope>(
  input: AdminBackgroundRefreshScopeInput<TRequestScope>
): AdminBackgroundRefreshScopeStart<TRequestScope> | null {
  const spec = ADMIN_BACKGROUND_REFRESH_SPECS[input.key];

  if (!shouldStartAdminBackgroundRefresh(input)) {
    return null;
  }

  return {
    spec,
    requestScope: input.createRequestScope(spec)
  };
}

export function startAdminBackgroundRefresh<
  TRequestScope extends { abort: () => void },
  TResult
>(
  input: AdminBackgroundRefreshExecutionInput<TRequestScope, TResult>
): AdminBackgroundRefreshExecution<TRequestScope> | null {
  const start = createAdminBackgroundRefreshScope(input);

  if (!start) {
    return null;
  }

  let cancelled = false;
  const context: AdminBackgroundRefreshExecutionContext<TRequestScope> = {
    spec: start.spec,
    requestScope: start.requestScope
  };

  input.onStart?.(context);
  input.request(context)
    .then((result) => {
      if (!cancelled) {
        input.onSuccess(result, context);
      }
    })
    .catch((error) => {
      if (!cancelled) {
        input.onError(error, context);
      }
    })
    .finally(() => {
      input.onSettled?.({ ...context, cancelled });
    });

  return {
    ...context,
    cancel: () => {
      cancelled = true;
      input.onCancel?.(context);
      context.requestScope.abort();
    }
  };
}

export function shouldStartAdminRouteTokenLoad(input: AdminRouteTokenLoadInput): boolean {
  const spec = ADMIN_ROUTE_TOKEN_LOAD_SPECS[input.key];

  if (input.route !== spec.route) {
    return false;
  }

  if (input.loading) {
    return false;
  }

  if (input.loadedToken === input.reloadToken) {
    return false;
  }

  if (spec.requires_shell_data) {
    return input.canLoad === true;
  }

  return input.canLoad !== false;
}

export function createAdminRouteTokenRequestScope<TRequestScope>(
  input: AdminRouteTokenRequestScopeInput<TRequestScope>
): AdminRouteTokenRequestScopeStart<TRequestScope> | null {
  const spec = ADMIN_ROUTE_TOKEN_LOAD_SPECS[input.key];

  if (!shouldStartAdminRouteTokenLoad(input)) {
    return null;
  }

  return {
    spec,
    requestScope: input.createRequestScope(spec)
  };
}

export function startAdminRouteTokenLoad<
  TRequestScope extends { abort: () => void },
  TResult
>(
  input: AdminRouteTokenLoadExecutionInput<TRequestScope, TResult>
): AdminRouteTokenLoadExecution<TRequestScope> | null {
  const start = createAdminRouteTokenRequestScope(input);

  if (!start) {
    return null;
  }

  let cancelled = false;
  const context: AdminRouteTokenLoadExecutionContext<TRequestScope> = {
    spec: start.spec,
    requestScope: start.requestScope
  };

  input.onStart?.(context);
  input.request(context)
    .then((result) => {
      if (!cancelled) {
        input.onSuccess(result, context);
      }
    })
    .catch((error) => {
      if (!cancelled) {
        input.onError(error, context);
      }
    })
    .finally(() => {
      input.onSettled?.({ ...context, cancelled });
    });

  return {
    ...context,
    cancel: () => {
      cancelled = true;
      input.onCancel?.(context);
      context.requestScope.abort();
    }
  };
}

export function shouldStartAdminRouteRequestLoad(input: AdminRouteRequestLoadInput): boolean {
  const spec = ADMIN_ROUTE_REQUEST_LOAD_SPECS[input.key];

  if (input.route !== spec.route) {
    return false;
  }

  if (input.loading) {
    return false;
  }

  if (input.hasFreshData) {
    return false;
  }

  return input.canLoad !== false;
}

export function createAdminRouteRequestScope<TRequestScope>(
  input: AdminRouteRequestScopeInput<TRequestScope>
): AdminRouteRequestScopeStart<TRequestScope> | null {
  const spec = ADMIN_ROUTE_REQUEST_LOAD_SPECS[input.key];

  if (!shouldStartAdminRouteRequestLoad(input)) {
    return null;
  }

  return {
    spec,
    requestScope: input.createRequestScope(spec)
  };
}

export function startAdminRouteRequestLoad<
  TRequestScope extends { abort: () => void },
  TResult
>(
  input: AdminRouteRequestLoadExecutionInput<TRequestScope, TResult>
): AdminRouteRequestLoadExecution<TRequestScope> | null {
  const start = createAdminRouteRequestScope(input);

  if (!start) {
    return null;
  }

  let cancelled = false;
  const context: AdminRouteRequestLoadExecutionContext<TRequestScope> = {
    spec: start.spec,
    requestScope: start.requestScope
  };

  input.onStart?.(context);
  input.request(context)
    .then((result) => {
      if (!cancelled) {
        input.onSuccess(result, context);
      }
    })
    .catch((error) => {
      if (!cancelled) {
        input.onError(error, context);
      }
    })
    .finally(() => {
      input.onSettled?.({ ...context, cancelled });
    });

  return {
    ...context,
    cancel: () => {
      cancelled = true;
      input.onCancel?.(context);
      context.requestScope.abort();
    }
  };
}
