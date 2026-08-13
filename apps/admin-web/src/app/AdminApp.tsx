import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppShell,
  InspectorPanel,
} from "@mixlab/ui-foundation";
import {
  createAdminApiClient,
  createAdminSmartScanReport,
  createFixtureAdminApiClient,
  loadAdminDashboardData,
  type AdminActionResult,
  type AdminApiClient,
  type AdminAuthStatus,
  type AdminCommandRestorePlan,
  type AdminCutterUsersResponse,
  type AdminDashboardMetrics,
  type AdminDashboardData,
  type AdminIndexVersionsResponse,
  type AdminLibraryScanNewStatus,
  type AdminLibraryStatus,
  type AdminOperationLogResponse,
  type AdminPathCheck,
  type AdminPreprocessProcessHistoryEvent,
  type AdminPreprocessProcessHistoryFilters,
  type AdminPreprocessProcessHistoryOptions,
  type AdminPreprocessJobLog,
  type AdminPreprocessJobsResponse,
  type AdminPreprocessProcessHistoryResponse,
  type AdminPreprocessSupervisorStatus,
  type AdminPreprocessStatus,
  type AdminReadModelReconcilerStatus,
  type AdminRuntimeDiagnosticsHistoryResponse,
  type AdminRuntimeEndpointMeta,
  type AdminRuntimeSettings,
  type AdminSettingsConfigUpdate,
  type AdminSmartScanAction,
  type AdminSourceVideoCoverUpdate,
  type AdminSourceVideoDetail,
  type AdminSourceVideo,
  type AdminSourceVideoMetadataUpdate
} from "../api.ts";
import {
  adminAuthSessionFromResult,
  clearAdminAuthSession,
  readAdminAuthSession,
  writeAdminAuthSession,
  type StoredAdminAuthSession
} from "../auth.ts";
import { DashboardPage } from "../features/dashboard/DashboardPage.tsx";
import { CutterUsersPage } from "../features/cutter-users/CutterUsersPage.tsx";
import { DoctorPage } from "../features/doctor/DoctorPage.tsx";
import { IndexPublishPage } from "../features/index-publish/IndexPublishPage.tsx";
import { AdminLoginGate } from "../features/login/AdminLoginGate.tsx";
import {
  OperationLogPage,
  type CommandSnapshotRestoreExecutionState,
  type CommandSnapshotRestorePlanPreview
} from "../features/operation-log/OperationLogPage.tsx";
import { PreprocessJobsPage } from "../features/preprocess-jobs/PreprocessJobsPage.tsx";
import { ProtectionCenterPage } from "../features/protection/ProtectionCenterPage.tsx";
import {
  loadProtectionCenterData,
  type AdminOperationsOverview
} from "../features/protection/api.ts";
import { SettingsPage } from "../features/settings/SettingsPage.tsx";
import { AdminSourceDetailPage } from "../features/source-detail/AdminSourceDetailPage.tsx";
import { SourceVideosPage } from "../features/source-videos/SourceVideosPage.tsx";
import { EmptyState } from "../features/shared.tsx";
import {
  adminNavItemsForMode,
  adminRouteForMode,
  routeFromHash,
  routeToHash,
  resolveAdminSurfaceMode,
  type AdminSurfaceMode,
  type AdminRoute
} from "./navigation.ts";
import { chineseDiagnosticText } from "./chinese.ts";
import { adminCommandActionStartDecision } from "./command-cancellation-policy.ts";
import {
  EMPTY_ADMIN_ROUTE_LOCAL_READ_ERRORS,
  adminRouteRenderLoadingState,
  adminRouteLocalReadLabel,
  clearAdminRouteLocalReadError,
  setAdminRouteLocalReadError,
  adminSourceVideoManifestFallbackPolicy,
  shouldAutoRefreshAdminData,
  shouldLoadAdminSourceVideos,
  shouldPrefetchAdminRoute,
  startAdminBackgroundRefresh,
  startAdminRouteRequestLoad,
  startAdminRouteTokenLoad,
  type AdminBackgroundRefreshExecution,
  type AdminRouteRenderLoadingState,
  type AdminRouteLocalReadErrors,
  type AdminRouteLocalReadKey
} from "./route-loading-runtime.ts";

const DEFAULT_LOCAL_ADMIN_API_BASE_URL = "http://127.0.0.1:3889/";
const PREPROCESS_START_QUEUE_UNPROCESSED_LIMIT = 100_000;

function authStatusFromStoredSession(session: StoredAdminAuthSession): AdminAuthStatus {
  return {
    authenticated: true,
    auth_mode: "password",
    user: {
      admin_id: session.admin_id,
      username: session.username,
      display_name: session.display_name || session.username,
      role: session.role,
      status: "active",
      created_at: session.created_at,
      last_login_at: session.last_seen_at,
      disabled_at: ""
    },
    bootstrap: {
      has_admin: true,
      registration_open: false
    }
  };
}

function scanNewStatusNotice(status: AdminLibraryScanNewStatus): string {
  if (status.state === "running") {
    const folderProgress = status.total_source_folder_count > 0
      ? `${status.scanned_folder_count}/${status.total_source_folder_count} 个文件夹`
      : "正在读取素材文件夹";

    return `扫描新增素材中：${folderProgress}，已发现 ${status.discovered_video_count} 个视频，新素材 ${status.new_video_count} 个。`;
  }

  if (status.state === "failed") {
    return status.error_message
      ? `扫描新增素材失败：${status.error_message}`
      : "扫描新增素材失败，请稍后重试。";
  }

  if (status.state === "completed") {
    return `扫描完成：新素材 ${status.new_video_count} 个，已登记 ${status.written_video_count} 个。`;
  }

  return "";
}

export function resolveAdminRuntimeApiBaseUrl(input: {
  viteApiBaseUrl?: string;
  useFixtureData?: boolean;
}): string {
  if (input.useFixtureData) {
    return "";
  }

  const configured = input.viteApiBaseUrl?.trim();
  if (configured) {
    return configured;
  }

  return DEFAULT_LOCAL_ADMIN_API_BASE_URL;
}

function createRuntimeClient(
  baseUrl: string,
  authSession: StoredAdminAuthSession | null,
  options: { signal?: AbortSignal } = {}
) {
  return baseUrl
    ? createAdminApiClient({
        base_url: baseUrl,
        ...(authSession ? { auth: { session_token: authSession.session_token } } : {}),
        ...(options.signal ? { signal: options.signal } : {})
      })
    : createFixtureAdminApiClient();
}

interface AdminRuntimeRequestScope {
  client: AdminApiClient;
  abort: () => void;
}

function createRuntimeRequestScope(
  baseUrl: string,
  authSession: StoredAdminAuthSession | null
): AdminRuntimeRequestScope {
  const abortController = new AbortController();

  return {
    client: createRuntimeClient(baseUrl, authSession, { signal: abortController.signal }),
    abort: () => abortController.abort()
  };
}

function routeTitle(route: AdminRoute): string {
  const labels: Record<AdminRoute, string> = {
    dashboard: "首页",
    "source-videos": "素材库",
    "source-detail": "原视频详情",
    "preprocess-jobs": "素材处理",
    protection: "保护中心",
    "index-publish": "发布与索引",
    doctor: "系统状态",
    "cutter-users": "剪辑师",
    settings: "设置",
    "operation-log": "操作记录"
  };

  return labels[route];
}

function adminDoctorSummaryLabel(data: AdminDashboardData): string {
  if (data.doctor.summary.fail > 0) {
    return `${data.doctor.summary.fail} 项需处理`;
  }

  if (data.doctor.summary.warn > 0) {
    return `${data.doctor.summary.warn} 项需关注`;
  }

  return "正常";
}

function adminPreprocessRuntimeLabel(data: AdminDashboardData): string {
  if (data.jobs.supervisor.state === "running") {
    return "运行中";
  }

  if (data.jobs.supervisor.state === "stopping") {
    return "停止中";
  }

  if (data.jobs.active_count > 0 || data.status.processing_video_count > 0) {
    return "有任务待恢复";
  }

  return "空闲";
}

function AdminTopbar({
  data,
  authSession,
  onLogout
}: {
  data: AdminDashboardData | null;
  authSession: StoredAdminAuthSession | null;
  onLogout: () => void;
}) {
  return (
    <header className="admin-topbar">
      <a className="admin-topbar-brand" href={routeToHash("dashboard")}>
        <span className="admin-topbar-mark">ML</span>
        <span>
          <strong>MixLab Admin</strong>
          <small>素材生产驾驶舱</small>
        </span>
      </a>
      <div className="admin-topbar-status" aria-label="管理端状态">
        <span>
          <small>素材库</small>
          <strong>{data?.settings.library_name || data?.status.name || "公共素材库"}</strong>
        </span>
        <span>
          <small>当前索引</small>
          <strong>{data?.indexes.current_version || data?.status.current_index_version || "暂无索引"}</strong>
        </span>
        <span>
          <small>系统状态</small>
          <strong>{data ? adminDoctorSummaryLabel(data) : "加载中"}</strong>
        </span>
        <button className="admin-topbar-avatar" type="button" aria-label="退出管理端" onClick={onLogout}>
          {authSession?.display_name?.slice(0, 1) || "管"}
        </button>
      </div>
    </header>
  );
}

function AdminSidebarStatus({ data }: { data: AdminDashboardData }) {
  return (
    <div className="admin-sidebar-footer">
      <div className="admin-sidebar-runtime-line">
        <span>素材库</span>
        <strong>{data.status.root_path ? "已挂载" : "待配置"}</strong>
      </div>
      <div className="admin-sidebar-runtime-line">
        <span>当前索引</span>
        <strong>{data.indexes.current_version || "暂无索引"}</strong>
      </div>
      <div className="admin-sidebar-runtime-line">
        <span>预处理</span>
        <strong>{adminPreprocessRuntimeLabel(data)}</strong>
      </div>
      <div className="admin-sidebar-runtime-line">
        <span>系统状态</span>
        <strong>{adminDoctorSummaryLabel(data)}</strong>
      </div>
    </div>
  );
}

export const ADMIN_DATA_AUTO_REFRESH_INTERVAL_MS = 30_000;
export const ADMIN_PREPROCESS_RUNNING_REFRESH_INTERVAL_MS = 5_000;
const ADMIN_SOURCE_VIDEO_INITIAL_LOAD_LIMIT = 20;
const ADMIN_PREPROCESS_JOB_INITIAL_LOAD_LIMIT = 20;
const ADMIN_PREPROCESS_JOB_ROUTE_LOAD_LIMIT = 200;
const ADMIN_PREPROCESS_PROCESS_HISTORY_INITIAL_LOAD_LIMIT = 20;
const ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS = 8_000;
const ADMIN_CUTTER_USERS_LOAD_TIMEOUT_MS = 20_000;

export async function loadAdminPreprocessRouteData(
  client: AdminApiClient,
  processHistoryOptions: AdminPreprocessProcessHistoryOptions = {}
) {
  const [jobsResult, processHistoryResult] = await Promise.all([
    withAdminLoadTimeout(
      client.listPreprocessJobs({ limit: ADMIN_PREPROCESS_JOB_ROUTE_LOAD_LIMIT }),
      "预处理队列加载"
    )
      .then((jobs) => ({
        jobs,
        jobsError: ""
      }))
      .catch((error) => ({
        jobs: null,
        jobsError: adminActionErrorMessage("预处理队列加载", error)
      })),
    withAdminLoadTimeout(
      client.listPreprocessProcessHistory({
        limit: ADMIN_PREPROCESS_PROCESS_HISTORY_INITIAL_LOAD_LIMIT,
        window_days: 30,
        ...processHistoryOptions
      }),
      "处理历史加载"
    )
      .then((processHistory) => ({
        processHistory,
        processHistoryError: ""
      }))
      .catch((error) => ({
        processHistory: null,
        processHistoryError: adminActionErrorMessage("处理历史加载", error)
      }))
  ]);

  return {
    jobs: jobsResult.jobs,
    jobsError: jobsResult.jobsError,
    processHistory: processHistoryResult.processHistory,
    processHistoryError: processHistoryResult.processHistoryError
  };
}

function withAdminLoadTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS
): Promise<T> {
  let settled = false;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new Error(`${label}响应较慢，请稍后自动刷新或缩小范围。`));
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

export function mergeAdminSourceVideoPages(
  current: readonly AdminSourceVideo[],
  next: readonly AdminSourceVideo[]
): AdminSourceVideo[] {
  const byId = new Map<string, AdminSourceVideo>();

  for (const video of current) {
    byId.set(video.source_video_id, video);
  }

  for (const video of next) {
    byId.set(video.source_video_id, video);
  }

  return Array.from(byId.values());
}

function mergeAdminDashboardShellData(
  current: AdminDashboardData,
  next: AdminDashboardData
): AdminDashboardData {
  return {
    ...next,
    source_videos: next.source_videos.length > 0 ? next.source_videos : current.source_videos,
    jobs: {
      ...next.jobs,
      jobs: next.jobs.jobs.length > 0 ? next.jobs.jobs : current.jobs.jobs
    }
  };
}

export function mergeAdminDashboardPanelData(
  current: AdminDashboardData,
  next: {
    status: AdminLibraryStatus;
    jobs: AdminPreprocessJobsResponse;
    metrics: AdminDashboardMetrics;
  }
): AdminDashboardData {
  return {
    ...current,
    status: next.status,
    jobs: next.jobs,
    metrics: next.metrics,
    indexes: {
      ...current.indexes,
      current_version: next.status.current_index_version || current.indexes.current_version
    }
  };
}

async function loadAdminDashboardPanelData(client: AdminApiClient): Promise<{
  status: AdminLibraryStatus;
  jobs: AdminPreprocessJobsResponse;
  metrics: AdminDashboardMetrics;
}> {
  const [status, jobs, metrics] = await Promise.all([
    client.getLibraryStatus(),
    client.listPreprocessJobs({ limit: ADMIN_PREPROCESS_JOB_ROUTE_LOAD_LIMIT }),
    client.getDashboardMetrics()
  ]);

  return { status, jobs, metrics };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

interface AdminActionHandlers {
  sourceVideoQuery: string;
  sourceVideoStatusFilter: AdminPreprocessStatus | "all";
  processHistoryFilters: AdminPreprocessProcessHistoryFilters;
  onInitializeLibrary: () => Promise<void>;
  onScanSourceVideos: () => Promise<void>;
  onQueueUnprocessedVideos: () => Promise<void>;
  onRetryFailedVideos: () => Promise<void>;
  onStartLongAsrVideos: () => Promise<void>;
  onRecoverProcessingVideos: () => Promise<void>;
  onRunSmartScan: () => Promise<void>;
  onApplySmartScanPrimaryAction: (action: AdminSmartScanAction) => Promise<void>;
  onQueueSourceVideo: (sourceVideoId: string) => Promise<void>;
  onRetrySourceVideo: (sourceVideoId: string) => Promise<void>;
  onRecoverProcessingSourceVideo: (sourceVideoId: string) => Promise<void>;
  onPublishSourceVideo: (sourceVideoId: string) => Promise<void>;
  onOpenPreprocessJobLog: (jobId: string) => Promise<void>;
  onStartPreprocessSupervisor: () => Promise<void>;
  onStopPreprocessSupervisor: () => Promise<void>;
  onRepairIndex: () => Promise<void>;
  onRunDoctor: () => Promise<void>;
  onTestAsrConfig: () => Promise<void>;
  onSaveAdminSettings: (settings: AdminSettingsConfigUpdate) => Promise<void>;
  onUpdateSourceVideoMetadata: (
    sourceVideoId: string,
    metadata: AdminSourceVideoMetadataUpdate
  ) => Promise<void>;
  onUpdateSourceVideoCover: (
    sourceVideoId: string,
    coverFile: File
  ) => Promise<void>;
  onApproveCutterUser: (userId: string) => Promise<void>;
  onDisableCutterUser: (userId: string) => Promise<void>;
  onResetCutterUserPassword: (userId: string, input: { new_password: string }) => Promise<void>;
  onPreviewCommandSnapshotRestore: (snapshotId: string) => Promise<void>;
  onArmCommandSnapshotRestore: (snapshotId: string) => void;
  onCancelCommandSnapshotRestore: (snapshotId: string) => void;
  onExecuteCommandSnapshotRestore: (snapshotId: string) => Promise<void>;
  onStartReadModelReconcile: () => Promise<void>;
  onCancelReadModelReconcile: () => Promise<void>;
  onOpenSourceDetail: (sourceVideoId: string) => void;
  onSourceVideoFiltersChange: (filters: {
    query: string;
    status: AdminPreprocessStatus | "all";
  }) => void;
  onProcessHistoryFiltersChange: (filters: AdminPreprocessProcessHistoryFilters) => void;
  onLoadMoreSourceVideos: () => Promise<void>;
  onExportDoctor: () => Promise<void>;
}

interface SourceDetailRenderState {
  detail: AdminSourceVideoDetail | null;
  loading: boolean;
  error: string;
}

interface SourceDetailRequest {
  sourceVideoId: string;
}

export function sourceDetailRequestForRoute(
  route: AdminRoute,
  data: AdminDashboardData | null,
  selectedSourceVideoId: string
): SourceDetailRequest | null {
  if (route !== "source-detail") {
    return null;
  }

  const sourceVideoId = selectedSourceVideoId || data?.source_videos[0]?.source_video_id || "";
  return sourceVideoId ? { sourceVideoId } : null;
}

export function sourceDetailForRequest(
  detail: AdminSourceVideoDetail | null,
  request: SourceDetailRequest | null
): AdminSourceVideoDetail | null {
  if (!detail || !request) {
    return null;
  }

  return detail.source_video.source_video_id === request.sourceVideoId ? detail : null;
}

function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function stripKnownProtocolPrefix(text: string): string {
  return text.replace(/^(validation_failed|not_found):\s*/i, "").trim();
}

export function sourceDetailLoadErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "原视频详情加载失败，请稍后重试。";
  }

  const rawMessage = error.message.trim();
  const normalizedMessage = rawMessage.toLowerCase();

  if (normalizedMessage.includes("failed to fetch")) {
    return "无法连接管理端服务，请检查网络或服务状态。";
  }

  if (normalizedMessage.includes("route not found")) {
    return "原视频详情接口暂不可用，请稍后重试。";
  }

  if (normalizedMessage.includes("not_found")) {
    return "原视频不存在或已被移除。";
  }

  const withoutProtocolPrefix = stripKnownProtocolPrefix(rawMessage);
  if (containsChinese(withoutProtocolPrefix)) {
    return withoutProtocolPrefix;
  }

  return "原视频详情加载失败，请稍后重试。";
}

export function adminLoadErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "管理端数据加载失败，请稍后重试。";
  }

  const rawMessage = error.message.trim();
  const normalizedMessage = rawMessage.toLowerCase();

  if (normalizedMessage.includes("failed to fetch")) {
    return "无法连接管理端服务，请检查服务是否启动。";
  }

  if (normalizedMessage.includes("route not found") || normalizedMessage.includes("not_found")) {
    return "管理端接口暂不可用，请刷新后重试。";
  }

  const withoutProtocolPrefix = stripKnownProtocolPrefix(rawMessage);
  if (containsChinese(withoutProtocolPrefix)) {
    return withoutProtocolPrefix;
  }

  return "管理端数据加载失败，请稍后重试。";
}

export function adminActionErrorMessage(label: string, error: unknown): string {
  if (!(error instanceof Error)) {
    return `${label}失败，请稍后重试。`;
  }

  const rawMessage = error.message.trim();
  const normalizedMessage = rawMessage.toLowerCase();

  if (normalizedMessage.includes("failed to fetch")) {
    return "无法连接管理端服务，请检查服务是否启动。";
  }

  if (normalizedMessage.includes("route not found") || normalizedMessage.includes("not_found")) {
    return `${label}失败：管理端接口暂不可用，请刷新后重试。`;
  }

  const withoutProtocolPrefix = stripKnownProtocolPrefix(rawMessage);
  if (containsChinese(withoutProtocolPrefix)) {
    return `${label}失败：${withoutProtocolPrefix}`;
  }

  return `${label}失败，请稍后重试。`;
}

function isActionResult(value: unknown): value is AdminActionResult {
  return isRecord(value) && (
    "affected_count" in value ||
    "new_video_count" in value ||
    "passed" in value ||
    "message" in value
  );
}

function isSourceVideo(value: unknown): value is AdminSourceVideo {
  return isRecord(value) && "source_video_id" in value;
}

function formatActionNotice(label: string, result: unknown): string {
  if (isActionResult(result)) {
    const details = [
      typeof result.affected_count === "number" ? `影响 ${result.affected_count} 个视频` : "",
      typeof result.new_video_count === "number" ? `新增 ${result.new_video_count} 个` : "",
      typeof result.existing_video_count === "number" ? `已存在 ${result.existing_video_count} 个` : "",
      typeof result.published_count === "number" ? `发布 ${result.published_count} 个` : "",
      typeof result.skipped_count === "number" ? `跳过 ${result.skipped_count} 个` : "",
      typeof result.ready_video_count === "number" ? `当前可用 ${result.ready_video_count} 个` : "",
      typeof result.remaining_index_required_count === "number" ? `待上线 ${result.remaining_index_required_count} 个` : "",
      typeof result.passed === "boolean" ? (result.passed ? "检测通过" : "检测未通过") : ""
    ].filter(Boolean);

    return `${label}完成${details.length ? `：${details.join("，")}` : ""}${result.message ? `。${chineseDiagnosticText(result.message)}` : ""}`;
  }

  if (isSourceVideo(result)) {
    return label.includes("封面")
      ? `${label}完成：${result.source_video_id} 的封面已更新`
      : `${label}完成：${result.source_video_id} 的公开说明已更新`;
  }

  if (isRecord(result) && "summary" in result) {
    const summary = (result as { summary?: { pass?: number; warn?: number; fail?: number } }).summary;
    return `${label}完成：通过 ${summary?.pass ?? 0}，警告 ${summary?.warn ?? 0}，失败 ${summary?.fail ?? 0}`;
  }

  if (
    isRecord(result) &&
    typeof result.file_name === "string" &&
    typeof result.file_path === "string"
  ) {
    return `${label}完成：${result.file_name} 已写入 ${result.file_path}`;
  }

  return `${label}完成`;
}

function adminCoverContentTypeFromFile(file: File): AdminSourceVideoCoverUpdate["content_type"] | null {
  const declaredType = file.type.trim().toLowerCase();

  if (declaredType === "image/jpeg" || declaredType === "image/jpg") {
    return "image/jpeg";
  }

  if (declaredType === "image/png" || declaredType === "image/webp") {
    return declaredType;
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }

  if (extension === "png") {
    return "image/png";
  }

  if (extension === "webp") {
    return "image/webp";
  }

  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export async function adminCoverUpdateFromFile(file: File): Promise<AdminSourceVideoCoverUpdate> {
  const contentType = adminCoverContentTypeFromFile(file);

  if (!contentType) {
    throw new Error("封面图片仅支持 JPG、PNG 或 WebP");
  }

  return {
    image_base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
    content_type: contentType,
    file_name: file.name
  };
}

function renderPage(
  route: AdminRoute,
  data: AdminDashboardData,
  actions: AdminActionHandlers,
  surfaceMode: AdminSurfaceMode,
  sourceVideosRuntime: AdminRuntimeEndpointMeta | null,
  sourceDetail: SourceDetailRenderState,
  cutterUsers: AdminCutterUsersResponse | null,
  loadingState: AdminRouteRenderLoadingState,
  routeErrors: AdminRouteLocalReadErrors,
  preprocessJobLogState: {
    loading: boolean;
    error: string;
    log: AdminPreprocessJobLog | null;
  },
  processHistoryState: {
    loading: boolean;
    error: string;
    history: AdminPreprocessProcessHistoryResponse | null;
  },
  operationsOverviewState: {
    overview: AdminOperationsOverview | null;
    readModelReconcileStatus: AdminReadModelReconcilerStatus | null;
    readModelReconcileError: string;
    readModelReconcileCommandLoading: boolean;
    error: string;
  },
  runtimeDiagnosticsState: {
    history: AdminRuntimeDiagnosticsHistoryResponse | null;
    loading: boolean;
    error: string;
  },
  operationLogState: {
    operationLog: AdminOperationLogResponse | null;
    error: string;
    restorePlanPreview: CommandSnapshotRestorePlanPreview | null;
    restoreExecution: CommandSnapshotRestoreExecutionState | null;
  },
  scanNewStatus: AdminLibraryScanNewStatus | null,
  activeAdminCommandLabel: string
) {
  const dockerMvpMode = surfaceMode === "docker-mvp-v0.1";

  if (route === "source-videos") {
    return (
      <SourceVideosPage
        data={data}
        onQueueSourceVideo={actions.onQueueSourceVideo}
        onRetrySourceVideo={actions.onRetrySourceVideo}
        onRecoverProcessingSourceVideo={actions.onRecoverProcessingSourceVideo}
        onPublishSourceVideo={actions.onPublishSourceVideo}
        onUpdateSourceVideoMetadata={dockerMvpMode ? undefined : actions.onUpdateSourceVideoMetadata}
        onUpdateSourceVideoCover={dockerMvpMode ? undefined : actions.onUpdateSourceVideoCover}
        onOpenSourceDetail={actions.onOpenSourceDetail}
        sourceQuery={actions.sourceVideoQuery}
        sourceStatusFilter={actions.sourceVideoStatusFilter}
        onSourceVideoFiltersChange={actions.onSourceVideoFiltersChange}
        onLoadMoreSourceVideos={actions.onLoadMoreSourceVideos}
        isLoadingInitial={loadingState.sourceVideos && data.source_videos.length === 0}
        isLoadingMore={loadingState.sourceVideosMore}
        hasMoreSourceVideos={loadingState.sourceVideosHasMore}
        sourceVideoRuntime={sourceVideosRuntime}
        sourceVideoError={routeErrors.sourceVideos}
        readModelMaintenanceHref={dockerMvpMode ? undefined : routeToHash("protection")}
        onStartReadModelReconcile={dockerMvpMode ? undefined : actions.onStartReadModelReconcile}
        readModelMaintenanceBusy={operationsOverviewState.readModelReconcileCommandLoading}
        readModelReconcileStatus={operationsOverviewState.readModelReconcileStatus}
        readModelReconcileError={operationsOverviewState.readModelReconcileError}
      />
    );
  }

  if (route === "source-detail") {
    if (sourceDetail.detail) {
      return <AdminSourceDetailPage detail={sourceDetail.detail} />;
    }

    if (sourceDetail.error) {
      return (
        <>
          <div className="admin-main-column">
            <EmptyState title="原视频详情加载失败" detail={sourceDetail.error} />
          </div>
          <InspectorPanel title="原视频详情">
            <p>请返回素材库后重新打开详情。</p>
          </InspectorPanel>
        </>
      );
    }

    return (
      <>
        <div className="admin-main-column">
          <EmptyState
            title={sourceDetail.loading ? "正在读取原视频详情" : "没有可查看的原视频"}
            detail={sourceDetail.loading ? "请稍候，正在加载预处理数据。" : "请先在素材库中选择一条原视频。"}
          />
        </div>
        <InspectorPanel title="原视频详情">
          <p>{sourceDetail.loading ? "加载中" : "暂无详情数据"}</p>
        </InspectorPanel>
      </>
    );
  }

  if (route === "preprocess-jobs") {
    return (
      <PreprocessJobsPage
        data={data}
        isLoadingJobs={loadingState.preprocessJobs && data.jobs.jobs.length === 0}
        jobsError={routeErrors.preprocessJobs}
        onScanSourceVideos={actions.onRunSmartScan}
        onRetryFailedVideos={actions.onRetryFailedVideos}
        onStartLongAsrVideos={actions.onStartLongAsrVideos}
        onRecoverProcessingVideos={actions.onRecoverProcessingVideos}
        onStartPreprocessSupervisor={actions.onStartPreprocessSupervisor}
        onStopPreprocessSupervisor={actions.onStopPreprocessSupervisor}
        onRepairIndex={dockerMvpMode ? undefined : actions.onRepairIndex}
        onPublishSourceVideo={actions.onPublishSourceVideo}
        isLoadingIndexRequiredVideos={loadingState.sourceVideos}
        indexRequiredError={routeErrors.indexRequiredVideos}
        selectedJobLog={preprocessJobLogState}
        processHistory={processHistoryState.history}
        processHistoryFilters={actions.processHistoryFilters}
        isLoadingProcessHistory={processHistoryState.loading}
        processHistoryError={processHistoryState.error}
        onProcessHistoryFiltersChange={actions.onProcessHistoryFiltersChange}
        onOpenPreprocessJobLog={actions.onOpenPreprocessJobLog}
        scanNewStatus={scanNewStatus}
        activeAdminCommandLabel={activeAdminCommandLabel}
      />
    );
  }

  if (route === "index-publish") {
    return (
      <IndexPublishPage
        data={data}
        isLoadingIndexRequiredVideos={loadingState.sourceVideos && data.source_videos.length === 0}
        indexRequiredError={routeErrors.indexRequiredVideos}
        onRepairIndex={dockerMvpMode ? undefined : actions.onRepairIndex}
        onPublishSourceVideo={actions.onPublishSourceVideo}
        onRunDoctor={actions.onRunDoctor}
      />
    );
  }

  if (route === "protection") {
    return (
      <ProtectionCenterPage
        overview={operationsOverviewState.overview}
        readModelReconcileStatus={operationsOverviewState.readModelReconcileStatus}
        readModelReconcileError={operationsOverviewState.readModelReconcileError}
        readModelReconcileCommandLoading={operationsOverviewState.readModelReconcileCommandLoading}
        onStartReadModelReconcile={actions.onStartReadModelReconcile}
        onCancelReadModelReconcile={actions.onCancelReadModelReconcile}
        loading={loadingState.operationsOverview}
        error={operationsOverviewState.error}
      />
    );
  }

  if (route === "doctor") {
    return (
      <DoctorPage
        data={data}
        doctorReportError={routeErrors.doctorReport}
        runtimeDiagnostics={runtimeDiagnosticsState.history}
        runtimeDiagnosticsLoading={runtimeDiagnosticsState.loading}
        runtimeDiagnosticsError={runtimeDiagnosticsState.error}
        onRunDoctor={actions.onRunDoctor}
        onExportDoctor={actions.onExportDoctor}
      />
    );
  }

  if (route === "settings") {
    return (
      <SettingsPage
        data={data}
        pathChecksError={routeErrors.settingsPathChecks}
        runtimeSettingsError={routeErrors.settingsRuntime}
        onSaveAdminSettings={dockerMvpMode ? undefined : actions.onSaveAdminSettings}
        onInitializeLibrary={dockerMvpMode ? undefined : actions.onInitializeLibrary}
        onTestAsrConfig={dockerMvpMode ? undefined : actions.onTestAsrConfig}
        onRunDoctor={actions.onRunDoctor}
        onExportDoctor={actions.onExportDoctor}
      />
    );
  }

  if (route === "operation-log") {
    return (
      <OperationLogPage
        operationLog={operationLogState.operationLog}
        loading={loadingState.operationLog}
        error={operationLogState.error}
        restorePlanPreview={operationLogState.restorePlanPreview}
        restoreExecution={operationLogState.restoreExecution}
        onPreviewCommandSnapshotRestore={actions.onPreviewCommandSnapshotRestore}
        onArmCommandSnapshotRestore={dockerMvpMode ? undefined : actions.onArmCommandSnapshotRestore}
        onCancelCommandSnapshotRestore={actions.onCancelCommandSnapshotRestore}
        onExecuteCommandSnapshotRestore={dockerMvpMode ? undefined : actions.onExecuteCommandSnapshotRestore}
      />
    );
  }

  if (route === "cutter-users") {
    if (!cutterUsers) {
      return (
        <>
          <div className="admin-main-column">
            <EmptyState
              title={routeErrors.cutterUsers ? "剪辑师用户加载失败" : "正在读取剪辑师用户"}
              detail={routeErrors.cutterUsers || "请稍候，正在加载登录申请和使用统计。"}
            />
          </div>
          <InspectorPanel title="用户统计">
            <p>{routeErrors.cutterUsers ? "本页面局部处理" : "加载中"}</p>
          </InspectorPanel>
        </>
      );
    }

    return (
      <CutterUsersPage
        users={cutterUsers}
        metrics={data.metrics.usage}
        onApprove={actions.onApproveCutterUser}
        onDisable={actions.onDisableCutterUser}
        onResetPassword={actions.onResetCutterUserPassword}
      />
    );
  }

  return (
    <DashboardPage
      data={data}
      onRetryFailedVideos={actions.onRetryFailedVideos}
      onRunSmartScan={actions.onRunSmartScan}
      onApplySmartScanPrimaryAction={actions.onApplySmartScanPrimaryAction}
      smartScanReport={createAdminSmartScanReport(data)}
      scanNewStatus={scanNewStatus}
      activeAdminCommandLabel={activeAdminCommandLabel}
    />
  );
}

export function AdminApp() {
  const adminSurfaceMode = useMemo(
    () => resolveAdminSurfaceMode(import.meta.env?.VITE_MIXLAB_ADMIN_DOCKER_MVP_MODE),
    []
  );
  const [route, setRoute] = useState<AdminRoute>(() =>
    adminRouteForMode(routeFromHash(window.location.hash), adminSurfaceMode)
  );
  const apiBaseUrl = useMemo(() => resolveAdminRuntimeApiBaseUrl({
    viteApiBaseUrl: import.meta.env?.VITE_MIXLAB_ADMIN_API_BASE_URL,
    useFixtureData: import.meta.env?.VITE_MIXLAB_USE_FIXTURE_DATA === "true"
  }), []);
  const apiMode = Boolean(apiBaseUrl);
  const [adminAuthSession, setAdminAuthSession] = useState<StoredAdminAuthSession | null>(() => readAdminAuthSession());
  const [adminAuthStatus, setAdminAuthStatus] = useState<AdminAuthStatus | null>(null);
  const [adminAuthLoading, setAdminAuthLoading] = useState(apiMode);
  const [adminAuthError, setAdminAuthError] = useState("");
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [error, setError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [scanNewStatus, setScanNewStatus] = useState<AdminLibraryScanNewStatus | null>(null);
  const [activeAdminCommandLabel, setActiveAdminCommandLabel] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedSourceVideoId, setSelectedSourceVideoId] = useState("");
  const [sourceDetail, setSourceDetail] = useState<AdminSourceVideoDetail | null>(null);
  const [sourceDetailLoading, setSourceDetailLoading] = useState(false);
  const [sourceDetailError, setSourceDetailError] = useState("");
  const [cutterUsers, setCutterUsers] = useState<AdminCutterUsersResponse | null>(null);
  const [cutterUsersReloadToken, setCutterUsersReloadToken] = useState(0);
  const [sourceVideosLoading, setSourceVideosLoading] = useState(false);
  const [sourceVideosLoadingMore, setSourceVideosLoadingMore] = useState(false);
  const [sourceVideosHasMore, setSourceVideosHasMore] = useState(true);
  const [sourceVideosRuntime, setSourceVideosRuntime] = useState<AdminRuntimeEndpointMeta | null>(null);
  const [sourceVideoQuery, setSourceVideoQuery] = useState("");
  const [sourceVideoStatusFilter, setSourceVideoStatusFilter] = useState<AdminPreprocessStatus | "all">("all");
  const [preprocessJobsLoading, setPreprocessJobsLoading] = useState(false);
  const [preprocessProcessHistory, setPreprocessProcessHistory] =
    useState<AdminPreprocessProcessHistoryResponse | null>(null);
  const [preprocessProcessHistoryLoading, setPreprocessProcessHistoryLoading] = useState(false);
  const [preprocessProcessHistoryError, setPreprocessProcessHistoryError] = useState("");
  const [preprocessProcessHistoryFilters, setPreprocessProcessHistoryFilters] =
    useState<AdminPreprocessProcessHistoryFilters>({
      source_folder_name: "",
      preprocess_status: "",
      event_type: ""
    });
  const [selectedPreprocessJobLog, setSelectedPreprocessJobLog] = useState<AdminPreprocessJobLog | null>(null);
  const [preprocessJobLogLoading, setPreprocessJobLogLoading] = useState(false);
  const [preprocessJobLogError, setPreprocessJobLogError] = useState("");
  const [operationsOverview, setOperationsOverview] = useState<AdminOperationsOverview | null>(null);
  const [readModelReconcileStatus, setReadModelReconcileStatus] =
    useState<AdminReadModelReconcilerStatus | null>(null);
  const [readModelReconcileError, setReadModelReconcileError] = useState("");
  const [readModelReconcileCommandLoading, setReadModelReconcileCommandLoading] = useState(false);
  const [operationsOverviewLoading, setOperationsOverviewLoading] = useState(false);
  const [operationsOverviewError, setOperationsOverviewError] = useState("");
  const [operationLog, setOperationLog] = useState<AdminOperationLogResponse | null>(null);
  const [operationLogLoading, setOperationLogLoading] = useState(false);
  const [operationLogError, setOperationLogError] = useState("");
  const [runtimeDiagnosticsHistory, setRuntimeDiagnosticsHistory] =
    useState<AdminRuntimeDiagnosticsHistoryResponse | null>(null);
  const [runtimeDiagnosticsLoading, setRuntimeDiagnosticsLoading] = useState(false);
  const [runtimeDiagnosticsError, setRuntimeDiagnosticsError] = useState("");
  const [routeLocalReadErrors, setRouteLocalReadErrors] = useState<AdminRouteLocalReadErrors>({
    ...EMPTY_ADMIN_ROUTE_LOCAL_READ_ERRORS
  });
  const [commandSnapshotRestorePlanPreview, setCommandSnapshotRestorePlanPreview] =
    useState<CommandSnapshotRestorePlanPreview | null>(null);
  const [commandSnapshotRestoreExecution, setCommandSnapshotRestoreExecution] =
    useState<CommandSnapshotRestoreExecutionState | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const dashboardLoadingRef = useRef(false);
  const dashboardLoadedRef = useRef(false);
  const metricsLoadingRef = useRef(false);
  const dashboardPanelLoadingRef = useRef(false);
  const activeAdminCommandLabelRef = useRef("");
  const cutterUsersPrefetchLoadingRef = useRef(false);
  const cutterUsersRouteLoadingRef = useRef(false);
  const cutterUsersLoadedTokenRef = useRef(-1);
  const preprocessJobsPrefetchLoadingRef = useRef(false);
  const preprocessJobsPrefetchTokenRef = useRef(-1);
  const pendingPreprocessJobsRef = useRef<AdminPreprocessJobsResponse | null>(null);
  const pendingIndexVersionsRef = useRef<AdminIndexVersionsResponse | null>(null);
  const pendingIndexRequiredVideosRef = useRef<AdminSourceVideo[] | null>(null);
  const pendingDoctorReportRef = useRef<AdminDashboardData["doctor"] | null>(null);
  const pendingSettingsPathChecksRef = useRef<AdminPathCheck[] | null>(null);
  const pendingSettingsRuntimeRef = useRef<AdminRuntimeSettings | null>(null);
  const doctorRouteLoadingRef = useRef(false);
  const doctorRouteLoadedTokenRef = useRef(-1);
  const runtimeDiagnosticsLoadingRef = useRef(false);
  const runtimeDiagnosticsLoadedTokenRef = useRef(-1);
  const settingsPathChecksLoadingRef = useRef(false);
  const settingsPathChecksLoadedTokenRef = useRef(-1);
  const settingsRuntimeLoadingRef = useRef(false);
  const settingsRuntimeLoadedTokenRef = useRef(-1);
  const hasDashboardData = Boolean(data);
  const client = useMemo(
    () => createRuntimeClient(apiBaseUrl, adminAuthSession),
    [apiBaseUrl, adminAuthSession]
  );
  const canLoadAdminData = !apiMode || adminAuthStatus?.authenticated === true;
  const clearRouteLocalReadError = (key: AdminRouteLocalReadKey) => {
    setRouteLocalReadErrors((current) => clearAdminRouteLocalReadError(current, key));
  };
  const setRouteLocalReadError = (key: AdminRouteLocalReadKey, error: unknown) => {
    setRouteLocalReadErrors((current) =>
      setAdminRouteLocalReadError(
        current,
        key,
        adminActionErrorMessage(adminRouteLocalReadLabel(key), error)
      )
    );
  };
  const setRouteLocalReadErrorMessage = (key: AdminRouteLocalReadKey, message: string) => {
    setRouteLocalReadErrors((current) => setAdminRouteLocalReadError(current, key, message));
  };

  useEffect(() => {
    const listener = () => {
      const requestedRoute = routeFromHash(window.location.hash);
      const nextRoute = adminRouteForMode(requestedRoute, adminSurfaceMode);
      if (nextRoute !== requestedRoute) {
        window.location.hash = routeToHash(nextRoute);
        return;
      }
      setRoute(nextRoute);
    };
    window.addEventListener("hashchange", listener);
    listener();
    return () => window.removeEventListener("hashchange", listener);
  }, [adminSurfaceMode]);

  useEffect(() => {
    if (!apiMode) {
      setAdminAuthStatus({
        authenticated: true,
        auth_mode: "disabled",
        user: null,
        bootstrap: {
          has_admin: true,
          registration_open: false
        }
      });
      setAdminAuthLoading(false);
      return;
    }

    let cancelled = false;
    const requestScope = createRuntimeRequestScope(apiBaseUrl, adminAuthSession);
    if (adminAuthSession) {
      setAdminAuthStatus((current) => current?.authenticated ? current : authStatusFromStoredSession(adminAuthSession));
    }
    setAdminAuthLoading(true);
    setAdminAuthError("");
    requestScope.client.getAuthStatus()
      .then((status) => {
        if (cancelled) {
          return;
        }

        setAdminAuthStatus(status);
        if (!status.authenticated && adminAuthSession) {
          clearAdminAuthSession();
          setAdminAuthSession(null);
        }
      })
      .catch((statusError) => {
        if (!cancelled) {
          if (adminAuthSession) {
            setAdminAuthStatus((current) =>
              current?.authenticated ? current : authStatusFromStoredSession(adminAuthSession)
            );
          } else {
            setAdminAuthStatus(null);
          }
          setAdminAuthError(adminLoadErrorMessage(statusError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAdminAuthLoading(false);
        }
      });

    return () => {
      cancelled = true;
      requestScope.abort();
    };
  }, [adminAuthSession, apiBaseUrl, apiMode, client]);

  useEffect(() => {
    if (!canLoadAdminData) {
      return;
    }

    let cancelled = false;
    let timeoutId = 0;

    const loadScanStatus = async () => {
      try {
        const status = await client.getScanNewSourceVideosStatus();
        if (cancelled) {
          return;
        }

        setScanNewStatus(status);
        if (status.state === "running") {
          setActionError("");
          setActionNotice(scanNewStatusNotice(status));
        }

        timeoutId = window.setTimeout(loadScanStatus, status.state === "running" ? 3_000 : 30_000);
      } catch {
        if (!cancelled) {
          timeoutId = window.setTimeout(loadScanStatus, 30_000);
        }
      }
    };

    void loadScanStatus();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [canLoadAdminData, client]);

  useEffect(() => {
    if (!canLoadAdminData) {
      return;
    }

    if (dashboardLoadingRef.current) {
      return;
    }

    let cancelled = false;
    const requestScope = createRuntimeRequestScope(apiBaseUrl, adminAuthSession);
    const showLoading = !dashboardLoadedRef.current;
    dashboardLoadingRef.current = true;
    if (showLoading) {
      setDashboardLoading(true);
    }

    setError("");
    loadAdminDashboardData(requestScope.client, { includeHeavy: false })
      .then((result) => {
        if (!cancelled) {
          dashboardLoadedRef.current = true;
          setData((current) => {
            const pendingJobs = pendingPreprocessJobsRef.current;
            const pendingIndexes = pendingIndexVersionsRef.current;
            const pendingIndexRequiredVideos = pendingIndexRequiredVideosRef.current;
            const pendingDoctor = pendingDoctorReportRef.current;
            const pendingPathChecks = pendingSettingsPathChecksRef.current;
            const pendingRuntime = pendingSettingsRuntimeRef.current;
            pendingPreprocessJobsRef.current = null;
            pendingIndexVersionsRef.current = null;
            pendingIndexRequiredVideosRef.current = null;
            pendingDoctorReportRef.current = null;
            pendingSettingsPathChecksRef.current = null;
            pendingSettingsRuntimeRef.current = null;
            const next = current ? mergeAdminDashboardShellData(current, result) : result;
            return {
              ...next,
              ...(pendingJobs ? { jobs: pendingJobs } : {}),
              ...(pendingIndexes ? { indexes: pendingIndexes } : {}),
              ...(pendingIndexRequiredVideos ? { source_videos: pendingIndexRequiredVideos } : {}),
              ...(pendingDoctor ? { doctor: pendingDoctor } : {}),
              ...(pendingPathChecks ? { path_checks: pendingPathChecks } : {}),
              ...(pendingRuntime ? { runtime: pendingRuntime } : {})
            };
          });
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(adminLoadErrorMessage(loadError));
        }
      })
      .finally(() => {
        dashboardLoadingRef.current = false;
        if (showLoading) {
          setDashboardLoading(false);
        }
      });

    return () => {
      cancelled = true;
      requestScope.abort();
    };
  }, [adminAuthSession, apiBaseUrl, canLoadAdminData, client, reloadToken]);

  useEffect(() => {
    const routeLoad = startAdminRouteRequestLoad({
      key: "sourceVideosInitial",
      route,
      loading: false,
      canLoad: shouldLoadAdminSourceVideos({
        route,
        hasData: hasDashboardData
      }),
      createRequestScope: () => createRuntimeRequestScope(apiBaseUrl, adminAuthSession),
      onStart: () => {
        setSourceVideosLoading(true);
        setSourceVideosHasMore(true);
        setSourceVideosRuntime(null);
        clearRouteLocalReadError("sourceVideos");
        setData((current) => current ? { ...current, source_videos: [] } : current);
      },
      request: ({ requestScope }) => withAdminLoadTimeout(
        requestScope.client.listSourceVideosWithRuntime({
          limit: ADMIN_SOURCE_VIDEO_INITIAL_LOAD_LIMIT,
          query: sourceVideoQuery,
          status: sourceVideoStatusFilter,
          manifest_fallback: adminSourceVideoManifestFallbackPolicy(sourceVideoStatusFilter)
        }),
        "原视频列表加载"
      ),
      onSuccess: (result) => {
        const sourceVideos = result.source_videos;
        setSourceVideosRuntime(result.runtime ?? null);
        setSourceVideosHasMore(sourceVideos.length >= ADMIN_SOURCE_VIDEO_INITIAL_LOAD_LIMIT);
        setData((current) => current ? { ...current, source_videos: sourceVideos } : current);
      },
      onError: (loadError) => {
        setRouteLocalReadError("sourceVideos", loadError);
      },
      onSettled: () => {
        setSourceVideosLoading(false);
      }
    });

    if (!routeLoad) {
      return;
    }

    return () => {
      routeLoad.cancel();
    };
  }, [adminAuthSession, apiBaseUrl, client, hasDashboardData, route, sourceVideoQuery, sourceVideoStatusFilter]);

  useEffect(() => {
    const routeLoad = startAdminRouteRequestLoad({
      key: "preprocessJobsInitial",
      route,
      loading: false,
      createRequestScope: () => createRuntimeRequestScope(apiBaseUrl, adminAuthSession),
      onStart: () => {
        setPreprocessJobsLoading(true);
        setPreprocessProcessHistoryLoading(true);
        clearRouteLocalReadError("preprocessJobs");
      },
      request: ({ requestScope }) =>
        loadAdminPreprocessRouteData(requestScope.client, preprocessProcessHistoryFilters),
      onSuccess: ({ jobs, jobsError, processHistory, processHistoryError }) => {
        setRouteLocalReadErrorMessage("preprocessJobs", jobsError);
        setPreprocessProcessHistory(processHistory);
        setPreprocessProcessHistoryError(processHistoryError);
        if (jobs) {
          setData((current) => {
            if (!current) {
              pendingPreprocessJobsRef.current = jobs;
              return current;
            }

            pendingPreprocessJobsRef.current = null;
            return { ...current, jobs };
          });
        }
        preprocessJobsPrefetchTokenRef.current = reloadToken;
      },
      onError: (loadError) => {
        setRouteLocalReadError("preprocessJobs", loadError);
        setPreprocessProcessHistoryError(adminActionErrorMessage("处理历史加载", loadError));
      },
      onSettled: () => {
        setPreprocessJobsLoading(false);
        setPreprocessProcessHistoryLoading(false);
      }
    });

    if (!routeLoad) {
      return;
    }

    return () => {
      routeLoad.cancel();
    };
  }, [adminAuthSession, apiBaseUrl, client, reloadToken, route]);

  useEffect(() => {
    if (route !== "preprocess-jobs" && route !== "index-publish") {
      return;
    }

    let cancelled = false;
    const requestScope = createRuntimeRequestScope(apiBaseUrl, adminAuthSession);

    requestScope.client.listIndexVersions()
      .then((indexes) => {
        if (!cancelled) {
          setData((current) => {
            if (!current) {
              pendingIndexVersionsRef.current = indexes;
              return current;
            }

            pendingIndexVersionsRef.current = null;
            return { ...current, indexes };
          });
        }
      })
      .catch(() => {
        // Index version details are supplemental; the route remains usable with dashboard status.
      });

    return () => {
      cancelled = true;
      requestScope.abort();
    };
  }, [adminAuthSession, apiBaseUrl, client, reloadToken, route]);

  useEffect(() => {
    const routeLoad = startAdminRouteRequestLoad({
      key: "indexRequiredVideos",
      route,
      loading: false,
      createRequestScope: () => createRuntimeRequestScope(apiBaseUrl, adminAuthSession),
      onStart: () => {
        setSourceVideosLoading(true);
        clearRouteLocalReadError("indexRequiredVideos");
        setData((current) => current ? { ...current, source_videos: [] } : current);
      },
      request: ({ requestScope }) => withAdminLoadTimeout(
        requestScope.client.listSourceVideosReadOnly({
          limit: ADMIN_SOURCE_VIDEO_INITIAL_LOAD_LIMIT,
          status: "index-required"
        }),
        "待上线素材加载"
      ),
      onSuccess: (sourceVideos) => {
        setData((current) => {
          if (!current) {
            pendingIndexRequiredVideosRef.current = sourceVideos;
            return current;
          }

          pendingIndexRequiredVideosRef.current = null;
          return { ...current, source_videos: sourceVideos };
        });
      },
      onError: (loadError) => {
        setRouteLocalReadError("indexRequiredVideos", loadError);
      },
      onSettled: () => {
        setSourceVideosLoading(false);
      }
    });

    if (!routeLoad) {
      return;
    }

    return () => {
      routeLoad.cancel();
    };
  }, [adminAuthSession, apiBaseUrl, client, reloadToken, route]);

  useEffect(() => {
    const routeLoad = startAdminRouteRequestLoad({
      key: "operationsOverview",
      route,
      loading: false,
      createRequestScope: () => createRuntimeRequestScope(apiBaseUrl, adminAuthSession),
      onStart: () => {
        setOperationsOverviewLoading(true);
        setOperationsOverviewError("");
        setReadModelReconcileError("");
      },
      request: ({ requestScope }) => withAdminLoadTimeout(
        loadProtectionCenterData(requestScope.client),
        "保护中心加载"
      ),
      onSuccess: ({ overview, read_model_reconcile_status, read_model_reconcile_error }) => {
        setOperationsOverview(overview);
        setReadModelReconcileStatus(read_model_reconcile_status);
        setReadModelReconcileError(read_model_reconcile_error);
      },
      onError: (loadError) => {
        setOperationsOverviewError(adminActionErrorMessage("保护中心加载", loadError));
      },
      onSettled: () => {
        setOperationsOverviewLoading(false);
      }
    });

    if (!routeLoad) {
      return;
    }

    return () => {
      routeLoad.cancel();
    };
  }, [adminAuthSession, apiBaseUrl, client, reloadToken, route]);

  useEffect(() => {
    const routeLoad = startAdminRouteRequestLoad({
      key: "operationLog",
      route,
      loading: false,
      createRequestScope: () => createRuntimeRequestScope(apiBaseUrl, adminAuthSession),
      onStart: () => {
        setOperationLogLoading(true);
        setOperationLogError("");
      },
      request: ({ requestScope }) => withAdminLoadTimeout(
        requestScope.client.getOperationLog({ limit: 50 }),
        "操作记录加载"
      ),
      onSuccess: (nextOperationLog) => {
        setOperationLog(nextOperationLog);
      },
      onError: (loadError) => {
        setOperationLogError(adminActionErrorMessage("操作记录加载", loadError));
      },
      onSettled: () => {
        setOperationLogLoading(false);
      }
    });

    if (!routeLoad) {
      return;
    }

    return () => {
      routeLoad.cancel();
    };
  }, [adminAuthSession, apiBaseUrl, client, reloadToken, route]);

  useEffect(() => {
    const tokenLoad = startAdminRouteTokenLoad({
      key: "doctorReport",
      route,
      loading: doctorRouteLoadingRef.current,
      loadedToken: doctorRouteLoadedTokenRef.current,
      reloadToken,
      createRequestScope: () => createRuntimeRequestScope(apiBaseUrl, adminAuthSession),
      onStart: () => {
        doctorRouteLoadingRef.current = true;
        clearRouteLocalReadError("doctorReport");
      },
      request: ({ requestScope }) => requestScope.client.getDoctorReport(),
      onSuccess: (doctor) => {
        clearRouteLocalReadError("doctorReport");
        setData((current) => {
          doctorRouteLoadedTokenRef.current = reloadToken;
          if (!current) {
            pendingDoctorReportRef.current = doctor;
            return current;
          }

          pendingDoctorReportRef.current = null;
          return { ...current, doctor };
        });
      },
      onError: (loadError) => {
        setRouteLocalReadError("doctorReport", loadError);
      },
      onSettled: () => {
        doctorRouteLoadingRef.current = false;
      }
    });

    if (!tokenLoad) {
      return;
    }

    return () => {
      tokenLoad.cancel();
    };
  }, [adminAuthSession, apiBaseUrl, client, reloadToken, route]);

  useEffect(() => {
    const tokenLoad = startAdminRouteTokenLoad({
      key: "runtimeDiagnostics",
      route,
      loading: runtimeDiagnosticsLoadingRef.current,
      loadedToken: runtimeDiagnosticsLoadedTokenRef.current,
      reloadToken,
      canLoad: canLoadAdminData,
      createRequestScope: () => createRuntimeRequestScope(apiBaseUrl, adminAuthSession),
      onStart: () => {
        runtimeDiagnosticsLoadingRef.current = true;
        setRuntimeDiagnosticsLoading(true);
        setRuntimeDiagnosticsError("");
      },
      request: ({ requestScope }) => requestScope.client.getRuntimeDiagnosticsHistory({ limit: 20 }),
      onSuccess: (history) => {
        runtimeDiagnosticsLoadedTokenRef.current = reloadToken;
        setRuntimeDiagnosticsHistory(history);
      },
      onError: (loadError) => {
        setRuntimeDiagnosticsError(adminActionErrorMessage("慢接口历史加载", loadError));
      },
      onSettled: ({ cancelled }) => {
        if (!cancelled) {
          runtimeDiagnosticsLoadingRef.current = false;
          setRuntimeDiagnosticsLoading(false);
        }
      },
      onCancel: () => {
        runtimeDiagnosticsLoadingRef.current = false;
        setRuntimeDiagnosticsLoading(false);
      }
    });

    if (!tokenLoad) {
      return;
    }

    return () => {
      tokenLoad.cancel();
    };
  }, [adminAuthSession, apiBaseUrl, canLoadAdminData, reloadToken, route]);

  useEffect(() => {
    const tokenLoad = startAdminRouteTokenLoad({
      key: "settingsPathChecks",
      route,
      loading: settingsPathChecksLoadingRef.current,
      loadedToken: settingsPathChecksLoadedTokenRef.current,
      reloadToken,
      createRequestScope: () => createRuntimeRequestScope(apiBaseUrl, adminAuthSession),
      onStart: () => {
        settingsPathChecksLoadingRef.current = true;
        clearRouteLocalReadError("settingsPathChecks");
      },
      request: ({ requestScope }) => requestScope.client.getPathChecks(),
      onSuccess: (pathChecks) => {
        clearRouteLocalReadError("settingsPathChecks");
        setData((current) => {
          settingsPathChecksLoadedTokenRef.current = reloadToken;
          if (!current) {
            pendingSettingsPathChecksRef.current = pathChecks;
            return current;
          }

          pendingSettingsPathChecksRef.current = null;
          return { ...current, path_checks: pathChecks };
        });
      },
      onError: (loadError) => {
        setRouteLocalReadError("settingsPathChecks", loadError);
      },
      onSettled: () => {
        settingsPathChecksLoadingRef.current = false;
      }
    });

    if (!tokenLoad) {
      return;
    }

    return () => {
      tokenLoad.cancel();
    };
  }, [adminAuthSession, apiBaseUrl, client, reloadToken, route]);

  useEffect(() => {
    const tokenLoad = startAdminRouteTokenLoad({
      key: "settingsRuntime",
      route,
      loading: settingsRuntimeLoadingRef.current,
      loadedToken: settingsRuntimeLoadedTokenRef.current,
      reloadToken,
      createRequestScope: () => createRuntimeRequestScope(apiBaseUrl, adminAuthSession),
      onStart: () => {
        settingsRuntimeLoadingRef.current = true;
        clearRouteLocalReadError("settingsRuntime");
      },
      request: ({ requestScope }) => withAdminLoadTimeout(
        requestScope.client.getRuntimeSettings(),
        "运行时状态加载"
      ),
      onSuccess: (runtime) => {
        clearRouteLocalReadError("settingsRuntime");
        setData((current) => {
          settingsRuntimeLoadedTokenRef.current = reloadToken;
          if (!current) {
            pendingSettingsRuntimeRef.current = runtime;
            return current;
          }

          pendingSettingsRuntimeRef.current = null;
          return { ...current, runtime };
        });
      },
      onError: (loadError) => {
        setRouteLocalReadError("settingsRuntime", loadError);
      },
      onSettled: () => {
        settingsRuntimeLoadingRef.current = false;
      }
    });

    if (!tokenLoad) {
      return;
    }

    return () => {
      tokenLoad.cancel();
    };
  }, [adminAuthSession, apiBaseUrl, client, reloadToken, route]);

  useEffect(() => {
    if (!data || route === "dashboard") {
      return;
    }

    const backgroundRefresh = startAdminBackgroundRefresh({
      key: "nonDashboardMetrics",
      loading: metricsLoadingRef.current,
      createRequestScope: () => createRuntimeRequestScope(apiBaseUrl, adminAuthSession),
      onStart: () => {
        metricsLoadingRef.current = true;
      },
      request: ({ requestScope }) => requestScope.client.getDashboardMetrics(),
      onSuccess: (metrics) => {
        setData((current) => current ? { ...current, metrics } : current);
      },
      onError: () => {
        // Metrics are supplemental; keep the page usable if SMB-backed stats are slow.
      },
      onSettled: () => {
        metricsLoadingRef.current = false;
      }
    });

    if (!backgroundRefresh) {
      return;
    }

    return () => {
      metricsLoadingRef.current = false;
      backgroundRefresh.cancel();
    };
  }, [adminAuthSession, apiBaseUrl, data?.status.updated_at, reloadToken, route]);

  useEffect(() => {
    if (
      !shouldPrefetchAdminRoute({
        plan: data?.data_loading_plan,
        route: "cutter-users",
        hasData: hasDashboardData
      }) ||
      route === "cutter-users" ||
      cutterUsersPrefetchLoadingRef.current ||
      cutterUsersLoadedTokenRef.current === cutterUsersReloadToken
    ) {
      return;
    }

    const backgroundRefresh = startAdminBackgroundRefresh({
      key: "cutterUsersPrefetch",
      loading: cutterUsersPrefetchLoadingRef.current,
      enabled: true,
      createRequestScope: () => createRuntimeRequestScope(apiBaseUrl, adminAuthSession),
      onStart: () => {
        cutterUsersPrefetchLoadingRef.current = true;
      },
      request: ({ requestScope }) => withAdminLoadTimeout(
        requestScope.client.listCutterUsers(),
        "剪辑师用户预加载",
        ADMIN_CUTTER_USERS_LOAD_TIMEOUT_MS
      ),
      onSuccess: (result) => {
        setCutterUsers(result);
        cutterUsersLoadedTokenRef.current = cutterUsersReloadToken;
      },
      onError: () => {
        // User data is prefetched for route speed; route-level loading handles visible errors.
      },
      onSettled: () => {
        cutterUsersPrefetchLoadingRef.current = false;
      }
    });

    if (!backgroundRefresh) {
      return;
    }

    return () => {
      cutterUsersPrefetchLoadingRef.current = false;
      backgroundRefresh.cancel();
    };
  }, [adminAuthSession, apiBaseUrl, cutterUsersReloadToken, data?.data_loading_plan, hasDashboardData, route]);

  useEffect(() => {
    if (
      !shouldPrefetchAdminRoute({
        plan: data?.data_loading_plan,
        route: "preprocess-jobs",
        hasData: hasDashboardData
      }) ||
      preprocessJobsPrefetchLoadingRef.current ||
      preprocessJobsPrefetchTokenRef.current === reloadToken
    ) {
      return;
    }

    const backgroundRefresh = startAdminBackgroundRefresh({
      key: "preprocessJobsPrefetch",
      loading: preprocessJobsPrefetchLoadingRef.current,
      enabled: true,
      createRequestScope: () => createRuntimeRequestScope(apiBaseUrl, adminAuthSession),
      onStart: () => {
        preprocessJobsPrefetchLoadingRef.current = true;
      },
      request: ({ requestScope }) =>
        loadAdminPreprocessRouteData(requestScope.client, preprocessProcessHistoryFilters),
      onSuccess: ({ jobs, processHistory, processHistoryError }) => {
        setPreprocessProcessHistory(processHistory);
        setPreprocessProcessHistoryError(processHistoryError);
        if (jobs) {
          setData((current) => {
            if (!current) {
              pendingPreprocessJobsRef.current = jobs;
              return current;
            }

            pendingPreprocessJobsRef.current = null;
            return { ...current, jobs };
          });
        }
        preprocessJobsPrefetchTokenRef.current = reloadToken;
      },
      onError: () => {
        // Preprocess jobs are prefetched for route speed; route-level loading handles visible errors.
      },
      onSettled: () => {
        preprocessJobsPrefetchLoadingRef.current = false;
      }
    });

    if (!backgroundRefresh) {
      return;
    }

    return () => {
      preprocessJobsPrefetchLoadingRef.current = false;
      backgroundRefresh.cancel();
    };
  }, [
    adminAuthSession,
    apiBaseUrl,
    data?.data_loading_plan,
    hasDashboardData,
    preprocessProcessHistoryFilters,
    reloadToken
  ]);

  useEffect(() => {
    if (
      !data ||
      dashboardLoading ||
      route === "preprocess-jobs" ||
      sourceVideosLoading ||
      preprocessJobsLoading ||
      !shouldAutoRefreshAdminData(route, data)
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setReloadToken((current) => current + 1);
    }, ADMIN_DATA_AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [dashboardLoading, data, preprocessJobsLoading, route, sourceVideosLoading]);

  useEffect(() => {
    if (!hasDashboardData || route !== "dashboard") {
      return;
    }

    let activeBackgroundRefresh: AdminBackgroundRefreshExecution<AdminRuntimeRequestScope> | null = null;

    const refreshDashboardPanels = () => {
      const backgroundRefresh = startAdminBackgroundRefresh({
        key: "dashboardPanelData",
        loading: dashboardPanelLoadingRef.current,
        active: Boolean(activeBackgroundRefresh),
        createRequestScope: () => createRuntimeRequestScope(apiBaseUrl, adminAuthSession),
        onStart: () => {
          dashboardPanelLoadingRef.current = true;
        },
        request: ({ requestScope }) => loadAdminDashboardPanelData(requestScope.client),
        onSuccess: (result, { requestScope }) => {
          if (activeBackgroundRefresh?.requestScope === requestScope) {
            setData((current) => current ? mergeAdminDashboardPanelData(current, result) : current);
          }
        },
        onError: () => {
          // Dashboard panel refresh is background-only; keep the visible page stable.
        },
        onSettled: ({ requestScope }) => {
          if (activeBackgroundRefresh?.requestScope === requestScope) {
            activeBackgroundRefresh = null;
            dashboardPanelLoadingRef.current = false;
          }
        }
      });

      if (backgroundRefresh) {
        activeBackgroundRefresh = backgroundRefresh;
      }
    };

    refreshDashboardPanels();
    const timer = window.setInterval(refreshDashboardPanels, ADMIN_DATA_AUTO_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      activeBackgroundRefresh?.cancel();
      activeBackgroundRefresh = null;
      dashboardPanelLoadingRef.current = false;
    };
  }, [adminAuthSession, apiBaseUrl, hasDashboardData, route]);

  useEffect(() => {
    if (!data || route !== "preprocess-jobs") {
      return;
    }

    let activeBackgroundRefresh: AdminBackgroundRefreshExecution<AdminRuntimeRequestScope> | null = null;

    const refreshPreprocessJobs = () => {
      const backgroundRefresh = startAdminBackgroundRefresh({
        key: "preprocessJobsInterval",
        loading: preprocessJobsLoading,
        active: Boolean(activeBackgroundRefresh),
        createRequestScope: () => createRuntimeRequestScope(apiBaseUrl, adminAuthSession),
        request: ({ requestScope }) =>
          loadAdminPreprocessRouteData(requestScope.client, preprocessProcessHistoryFilters),
        onSuccess: ({ jobs, jobsError, processHistory, processHistoryError }, { requestScope }) => {
          if (activeBackgroundRefresh?.requestScope === requestScope) {
            setRouteLocalReadErrorMessage("preprocessJobs", jobsError);
            setPreprocessProcessHistory(processHistory);
            setPreprocessProcessHistoryError(processHistoryError);
            if (jobs) {
              setData((current) => current ? { ...current, jobs } : current);
            }
          }
        },
        onError: (loadError, { requestScope }) => {
          if (activeBackgroundRefresh?.requestScope === requestScope) {
            setRouteLocalReadError("preprocessJobs", loadError);
            setPreprocessProcessHistoryError(adminActionErrorMessage("处理历史刷新", loadError));
          }
        },
        onSettled: ({ requestScope }) => {
          if (activeBackgroundRefresh?.requestScope === requestScope) {
            activeBackgroundRefresh = null;
          }
        }
      });

      if (backgroundRefresh) {
        activeBackgroundRefresh = backgroundRefresh;
      }
    };

    const preprocessIsActive =
      data.jobs.supervisor.state === "running" ||
      data.jobs.supervisor.state === "stopping" ||
      data.jobs.active_count > 0 ||
      data.status.processing_video_count > 0;
    const timer = window.setInterval(
      refreshPreprocessJobs,
      preprocessIsActive ? ADMIN_PREPROCESS_RUNNING_REFRESH_INTERVAL_MS : ADMIN_DATA_AUTO_REFRESH_INTERVAL_MS
    );

    return () => {
      window.clearInterval(timer);
      activeBackgroundRefresh?.cancel();
      activeBackgroundRefresh = null;
    };
  }, [
    adminAuthSession,
    apiBaseUrl,
    data,
    preprocessJobsLoading,
    preprocessProcessHistoryFilters,
    route
  ]);

  useEffect(() => {
    const request = sourceDetailRequestForRoute(route, data, selectedSourceVideoId);

    if (route !== "source-detail") {
      return;
    }

    if (!request) {
      setSourceDetail(null);
      setSourceDetailLoading(false);
      setSourceDetailError("没有可查看的原视频");
      return;
    }

    const routeLoad = startAdminRouteRequestLoad({
      key: "sourceDetail",
      route,
      loading: false,
      createRequestScope: () => createRuntimeRequestScope(apiBaseUrl, adminAuthSession),
      onStart: () => {
        setSourceDetailLoading(true);
        setSourceDetailError("");
        setSourceDetail(null);
      },
      request: ({ requestScope }) =>
        requestScope.client.getSourceVideoDetail(request.sourceVideoId),
      onSuccess: (detail) => {
        setSourceDetail(detail);
      },
      onError: (loadError) => {
        setSourceDetail(null);
        setSourceDetailError(sourceDetailLoadErrorMessage(loadError));
      },
      onSettled: () => {
        setSourceDetailLoading(false);
      }
    });

    if (!routeLoad) {
      return;
    }

    return () => {
      routeLoad.cancel();
    };
  }, [adminAuthSession, apiBaseUrl, client, data?.source_videos, route, selectedSourceVideoId]);

  useEffect(() => {
    const routeLoad = startAdminRouteRequestLoad({
      key: "cutterUsers",
      route,
      loading: cutterUsersRouteLoadingRef.current,
      hasFreshData: Boolean(cutterUsers && cutterUsersLoadedTokenRef.current === cutterUsersReloadToken),
      createRequestScope: () => createRuntimeRequestScope(apiBaseUrl, adminAuthSession),
      onStart: () => {
        cutterUsersRouteLoadingRef.current = true;
        clearRouteLocalReadError("cutterUsers");
      },
      request: ({ requestScope }) => withAdminLoadTimeout(
        requestScope.client.listCutterUsers(),
        "剪辑师用户加载",
        ADMIN_CUTTER_USERS_LOAD_TIMEOUT_MS
      ),
      onSuccess: (result) => {
        setCutterUsers(result);
        cutterUsersLoadedTokenRef.current = cutterUsersReloadToken;
        clearRouteLocalReadError("cutterUsers");
      },
      onError: (loadError) => {
        setRouteLocalReadError("cutterUsers", loadError);
      },
      onSettled: () => {
        cutterUsersRouteLoadingRef.current = false;
      }
    });

    if (!routeLoad) {
      return;
    }

    return () => {
      routeLoad.cancel();
    };
  }, [adminAuthSession, apiBaseUrl, client, cutterUsers, cutterUsersReloadToken, route]);

  const beginAdminCommandAction = (label: string, notice?: string): boolean => {
    const decision = adminCommandActionStartDecision(activeAdminCommandLabelRef.current, label);
    if (!decision.allowed) {
      setActionNotice("");
      setActionError(decision.message);
      return false;
    }

    activeAdminCommandLabelRef.current = label;
    setActiveAdminCommandLabel(label);
    setActionError("");
    setActionNotice(notice ?? `${label}中...`);
    return true;
  };

  const finishAdminCommandAction = (label: string) => {
    if (activeAdminCommandLabelRef.current === label) {
      activeAdminCommandLabelRef.current = "";
      setActiveAdminCommandLabel("");
    }
  };

  const runAction = async (label: string, action: (client: AdminApiClient) => Promise<unknown>) => {
    if (!beginAdminCommandAction(label)) {
      return;
    }

    try {
      const result = await action(client);
      setActionNotice(formatActionNotice(label, result));
      setReloadToken((current) => current + 1);
    } catch (actionFailure) {
      setActionNotice("");
      setActionError(adminActionErrorMessage(label, actionFailure));
    } finally {
      finishAdminCommandAction(label);
    }
  };

  const runRepairIndexInBatches = async () => {
    const batchLimit = 10;
    const maxBatches = 100;

    return runAction("上线全部已处理素材", async (api) => {
      let publishedCount = 0;
      let skippedCount = 0;
      let readyVideoCount = 0;
      let remainingIndexRequiredCount = 0;
      const publishedSourceVideoIds: string[] = [];
      const skippedSourceVideoIds: string[] = [];

      for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
        const result = await api.repairIndex({ limit: batchLimit });
        publishedCount += result.published_count ?? 0;
        skippedCount += result.skipped_count ?? 0;
        readyVideoCount = result.ready_video_count ?? readyVideoCount;
        remainingIndexRequiredCount = result.remaining_index_required_count ?? 0;
        publishedSourceVideoIds.push(...(result.published_source_video_ids ?? []));
        skippedSourceVideoIds.push(...(result.skipped_source_video_ids ?? []));

        if (remainingIndexRequiredCount <= 0 || (result.published_count ?? 0) <= 0) {
          break;
        }
      }

      return {
        affected_count: publishedCount,
        published_count: publishedCount,
        skipped_count: skippedCount,
        ready_video_count: readyVideoCount,
        remaining_index_required_count: remainingIndexRequiredCount,
        published_source_video_ids: publishedSourceVideoIds,
        skipped_source_video_ids: skippedSourceVideoIds,
        message: remainingIndexRequiredCount > 0
          ? `已分批上线 ${publishedCount} 个素材，还有 ${remainingIndexRequiredCount} 个待上线。`
          : publishedCount > 0
            ? `已分批上线 ${publishedCount} 个素材，全部已处理素材都可以在剪辑端使用。`
            : "没有需要上线的已处理素材。"
      } satisfies AdminActionResult;
    });
  };

  const startPreprocessBatch = async (api: AdminApiClient): Promise<AdminActionResult> => {
    await api.scanNewSourceVideos();
    await api.startPreprocessSupervisor(undefined, {
      queue_unprocessed_limit: PREPROCESS_START_QUEUE_UNPROCESSED_LIMIT
    });

    return {
      affected_count: 0,
      message: "已扫描新增素材并启动预处理。系统会持续处理队列，直到全部处理完或手动暂停。"
    };
  };

  const startLongAsrBatch = async (api: AdminApiClient): Promise<AdminActionResult> => {
    const sourceVideoIds = [...new Set((data?.jobs.jobs ?? [])
      .filter((job) =>
        job.long_task_recommended &&
        (job.status === "failed" || job.status === "queued")
      )
      .map((job) => job.source_video_id))];

    if (sourceVideoIds.length === 0) {
      return {
        affected_count: 0,
        message: "当前没有需要长任务语音识别处理的素材。"
      };
    }

    const failedLongAsrIds = (data?.jobs.jobs ?? [])
      .filter((job) =>
        sourceVideoIds.includes(job.source_video_id) &&
        job.status === "failed"
      )
      .map((job) => job.source_video_id);

    for (const sourceVideoId of failedLongAsrIds) {
      await api.retrySourceVideo(sourceVideoId);
    }

    await api.startPreprocessSupervisor(undefined, {
      source_video_ids: sourceVideoIds,
      asr_mode: "long-task"
    });

    return {
      affected_count: sourceVideoIds.length,
      source_video_ids: sourceVideoIds,
      message: "已用长任务语音识别启动这些超长素材，系统会等待更久，不会按普通短任务超时。"
    };
  };

  const runSmartScan = async () => {
    if (!beginAdminCommandAction("扫描新增素材", "正在扫描新增素材、检查系统状态并刷新生产状态...")) {
      return;
    }

    try {
      await client.scanNewSourceVideos();
      let scanStatus: AdminLibraryScanNewStatus | null = null;
      try {
        scanStatus = await client.getScanNewSourceVideosStatus();
        setScanNewStatus(scanStatus);
      } catch {
        scanStatus = null;
      }
      await client.runDoctor();
      const refreshed = await loadAdminDashboardData(client, { includeHeavy: false });
      const report = createAdminSmartScanReport(refreshed);
      setData((current) => current ? mergeAdminDashboardShellData(current, refreshed) : refreshed);
      setActionNotice(scanStatus
        ? `${scanNewStatusNotice(scanStatus)} ${report.title}`.trim()
        : `扫描完成：${report.title}`);
    } catch (failure) {
      setActionNotice("");
      setActionError(adminActionErrorMessage("扫描新增素材", failure));
    } finally {
      finishAdminCommandAction("扫描新增素材");
    }
  };

  const applySmartScanPrimaryAction = async (action: AdminSmartScanAction) => {
    if (action === "queue-unprocessed") {
      await runAction("加入预处理队列", (api) => api.queueUnprocessedVideos());
      return;
    }

    if (action === "start-preprocess") {
      await runAction("启动预处理", startPreprocessBatch);
      return;
    }

    if (action === "start-long-asr") {
      await runAction("长任务语音识别", startLongAsrBatch);
      return;
    }

    if (action === "retry-failed") {
      await runAction("重试可继续处理的视频", (api) => api.retryFailedVideos());
      return;
    }

    if (action === "recover-processing") {
      await runAction("恢复卡住任务", (api) => api.recoverProcessingVideos());
      return;
    }

    if (action === "publish-index") {
      window.location.hash = routeToHash("preprocess-jobs");
      return;
    }

    if (action === "run-doctor") {
      window.location.hash = routeToHash("doctor");
      await runAction("运行系统检查", (api) => api.runDoctor());
    }
  };

  const handleAdminRegister = async (input: { username: string; password: string; display_name?: string }) => {
    setAdminAuthError("");
    try {
      const result = await client.registerAdmin(input);
      const nextSession = adminAuthSessionFromResult(result);
      writeAdminAuthSession(nextSession);
      setAdminAuthSession(nextSession);
      setAdminAuthStatus({
        authenticated: true,
        auth_mode: "password",
        user: result.user,
        bootstrap: {
          has_admin: true,
          registration_open: false
        }
      });
      setReloadToken((current) => current + 1);
    } catch (registerError) {
      setAdminAuthError(adminActionErrorMessage("创建管理员", registerError));
    }
  };

  const handleAdminLogin = async (input: { username: string; password: string }) => {
    setAdminAuthError("");
    try {
      const result = await client.loginAdmin(input);
      const nextSession = adminAuthSessionFromResult(result);
      writeAdminAuthSession(nextSession);
      setAdminAuthSession(nextSession);
      setAdminAuthStatus({
        authenticated: true,
        auth_mode: "password",
        user: result.user,
        bootstrap: {
          has_admin: true,
          registration_open: false
        }
      });
      setReloadToken((current) => current + 1);
    } catch (loginError) {
      setAdminAuthError(adminActionErrorMessage("登录管理端", loginError));
    }
  };

  const handleAdminLogout = () => {
    void client.logoutAdmin().catch(() => undefined);
    clearAdminAuthSession();
    setAdminAuthSession(null);
    setAdminAuthStatus((current) => current
      ? { ...current, authenticated: false, user: null }
      : null);
    setData(null);
    dashboardLoadedRef.current = false;
  };

  const previewCommandSnapshotRestore = async (snapshotId: string) => {
    setCommandSnapshotRestorePlanPreview({
      snapshotId,
      plan: null,
      loading: true,
      error: ""
    });
    setCommandSnapshotRestoreExecution({
      snapshotId,
      armed: false,
      loading: false,
      error: "",
      result: null
    });

    try {
      const plan: AdminCommandRestorePlan = await withAdminLoadTimeout(
        client.getCommandSnapshotRestorePlan(snapshotId),
        "恢复预检加载"
      );
      setCommandSnapshotRestorePlanPreview({
        snapshotId,
        plan,
        loading: false,
        error: ""
      });
    } catch (previewError) {
      setCommandSnapshotRestorePlanPreview({
        snapshotId,
        plan: null,
        loading: false,
        error: adminActionErrorMessage("恢复预检加载", previewError)
      });
    }
  };

  const armCommandSnapshotRestore = (snapshotId: string) => {
    setCommandSnapshotRestoreExecution({
      snapshotId,
      armed: true,
      loading: false,
      error: "",
      result: null
    });
  };

  const cancelCommandSnapshotRestore = (snapshotId: string) => {
    setCommandSnapshotRestoreExecution((current) => (
      current?.snapshotId === snapshotId
        ? {
            ...current,
            armed: false,
            loading: false,
            error: "",
            result: null
          }
        : current
    ));
  };

  const executeCommandSnapshotRestore = async (snapshotId: string) => {
    if (!beginAdminCommandAction("命令快照恢复", "命令快照恢复执行中...")) {
      return;
    }

    setCommandSnapshotRestoreExecution({
      snapshotId,
      armed: true,
      loading: true,
      error: "",
      result: null
    });

    try {
      const result = await withAdminLoadTimeout(
        client.restoreCommandSnapshot(snapshotId),
        "命令快照恢复"
      );
      setCommandSnapshotRestoreExecution({
        snapshotId,
        armed: false,
        loading: false,
        error: "",
        result
      });
      setActionNotice(`命令快照恢复完成：恢复 ${result.restored_file_count} 个文件，阻断 ${result.blocked_file_count} 个文件`);
      setReloadToken((current) => current + 1);
    } catch (restoreError) {
      setActionNotice("");
      setCommandSnapshotRestoreExecution({
        snapshotId,
        armed: true,
        loading: false,
        error: adminActionErrorMessage("命令快照恢复", restoreError),
        result: null
      });
    } finally {
      finishAdminCommandAction("命令快照恢复");
    }
  };

  const startReadModelReconcile = async () => {
    if (!beginAdminCommandAction("启动后台对账", "后台对账启动中...")) {
      return;
    }

    setReadModelReconcileCommandLoading(true);
    setReadModelReconcileError("");

    try {
      const result = await withAdminLoadTimeout(
        client.startReadModelReconcile(),
        "启动后台对账"
      );
      setReadModelReconcileStatus(result.status);
      setActionNotice(result.accepted ? "后台对账已启动" : "后台对账已在运行");
      setReloadToken((current) => current + 1);
    } catch (reconcileError) {
      setActionNotice("");
      setReadModelReconcileError(adminActionErrorMessage("启动后台对账", reconcileError));
      setActionError(adminActionErrorMessage("启动后台对账", reconcileError));
    } finally {
      setReadModelReconcileCommandLoading(false);
      finishAdminCommandAction("启动后台对账");
    }
  };

  const cancelReadModelReconcile = async () => {
    if (!beginAdminCommandAction("请求停止对账", "正在请求停止后台对账...")) {
      return;
    }

    setReadModelReconcileCommandLoading(true);
    setReadModelReconcileError("");

    try {
      const result = await withAdminLoadTimeout(
        client.cancelReadModelReconcile(),
        "请求停止对账"
      );
      setReadModelReconcileStatus(result.status);
      setActionNotice(result.accepted ? "已请求停止后台对账" : "后台对账当前未运行");
      setReloadToken((current) => current + 1);
    } catch (cancelError) {
      setActionNotice("");
      setReadModelReconcileError(adminActionErrorMessage("请求停止对账", cancelError));
      setActionError(adminActionErrorMessage("请求停止对账", cancelError));
    } finally {
      setReadModelReconcileCommandLoading(false);
      finishAdminCommandAction("请求停止对账");
    }
  };

  const handleProcessHistoryFiltersChange = (filters: AdminPreprocessProcessHistoryFilters) => {
    setPreprocessProcessHistoryFilters(filters);
    setPreprocessProcessHistoryLoading(true);
    setPreprocessProcessHistoryError("");

    void withAdminLoadTimeout(
      client.listPreprocessProcessHistory({
        limit: ADMIN_PREPROCESS_PROCESS_HISTORY_INITIAL_LOAD_LIMIT,
        window_days: 30,
        ...filters
      }),
      "处理历史筛选"
    )
      .then((history) => {
        setPreprocessProcessHistory(history);
      })
      .catch((filterError) => {
        setPreprocessProcessHistoryError(adminActionErrorMessage("处理历史筛选", filterError));
      })
      .finally(() => {
        setPreprocessProcessHistoryLoading(false);
      });
  };

  const actions: AdminActionHandlers = {
    sourceVideoQuery,
    sourceVideoStatusFilter,
    processHistoryFilters: preprocessProcessHistoryFilters,
    onInitializeLibrary: () => runAction("初始化素材库", (api) => api.initializeLibrary()),
    onScanSourceVideos: () => runAction("扫描新增素材", (api) => api.scanNewSourceVideos()),
    onQueueUnprocessedVideos: () => runAction("加入预处理队列", (api) => api.queueUnprocessedVideos()),
    onRetryFailedVideos: () => runAction("重试可继续处理的视频", (api) => api.retryFailedVideos()),
    onStartLongAsrVideos: () => runAction("长任务语音识别", startLongAsrBatch),
    onRecoverProcessingVideos: () =>
      runAction("恢复卡住任务", (api) => api.recoverProcessingVideos()),
    onRunSmartScan: runSmartScan,
    onApplySmartScanPrimaryAction: applySmartScanPrimaryAction,
    onQueueSourceVideo: (sourceVideoId) =>
      runAction("加入预处理", (api) => api.queueSourceVideo(sourceVideoId)),
    onRetrySourceVideo: (sourceVideoId) =>
      runAction("重新处理", (api) => api.retrySourceVideo(sourceVideoId)),
    onRecoverProcessingSourceVideo: (sourceVideoId) =>
      runAction("恢复到队列", (api) => api.recoverProcessingSourceVideo(sourceVideoId)),
    onPublishSourceVideo: (sourceVideoId) =>
      runAction("上线到剪辑端", (api) => api.publishSourceVideo(sourceVideoId)),
    onOpenPreprocessJobLog: async (jobId) => {
      setPreprocessJobLogLoading(true);
      setPreprocessJobLogError("");

      try {
        const log = await client.getPreprocessJobLog(jobId);
        setSelectedPreprocessJobLog(log);
      } catch (logFailure) {
        setSelectedPreprocessJobLog(null);
        setPreprocessJobLogError(adminActionErrorMessage("读取任务日志", logFailure));
      } finally {
        setPreprocessJobLogLoading(false);
      }
    },
    onStartPreprocessSupervisor: () =>
      runAction("启动预处理", startPreprocessBatch),
    onStopPreprocessSupervisor: () =>
      runAction("暂停预处理", (api) => api.stopPreprocessSupervisor()),
    onRepairIndex: runRepairIndexInBatches,
    onRunDoctor: () => runAction("运行系统检查", (api) => api.runDoctor()),
    onTestAsrConfig: () => runAction("检查语音识别", (api) => api.testAsrConfig()),
    onSaveAdminSettings: (settings) =>
      runAction("保存设置", (api) => api.saveAdminSettings(settings)),
    onUpdateSourceVideoMetadata: (sourceVideoId, metadata) =>
      runAction("保存素材信息", (api) => api.updateSourceVideoMetadata(sourceVideoId, metadata)),
    onUpdateSourceVideoCover: (sourceVideoId, coverFile) =>
      runAction("保存封面", async (api) =>
        api.updateSourceVideoCover(sourceVideoId, await adminCoverUpdateFromFile(coverFile))
      ),
    onApproveCutterUser: (userId) =>
      runAction("通过剪辑师申请", async (api) => {
        const result = await api.approveCutterUser(userId);
        setCutterUsersReloadToken((current) => current + 1);
        return result;
      }),
    onDisableCutterUser: (userId) =>
      runAction("停用剪辑师用户", async (api) => {
        const result = await api.disableCutterUser(userId);
        setCutterUsersReloadToken((current) => current + 1);
        return result;
      }),
    onResetCutterUserPassword: (userId, passwordInput) =>
      runAction("重置剪辑师密码", async (api) => {
        const result = await api.resetCutterUserPassword(userId, passwordInput);
        setCutterUsersReloadToken((current) => current + 1);
        return result;
      }),
    onPreviewCommandSnapshotRestore: previewCommandSnapshotRestore,
    onArmCommandSnapshotRestore: armCommandSnapshotRestore,
    onCancelCommandSnapshotRestore: cancelCommandSnapshotRestore,
    onExecuteCommandSnapshotRestore: executeCommandSnapshotRestore,
    onStartReadModelReconcile: startReadModelReconcile,
    onCancelReadModelReconcile: cancelReadModelReconcile,
    onOpenSourceDetail: (sourceVideoId) => {
      setSelectedSourceVideoId(sourceVideoId);
      setSourceDetail(null);
      setSourceDetailError("");
      if (window.location.hash === routeToHash("source-detail")) {
        setRoute("source-detail");
      } else {
        window.location.hash = routeToHash("source-detail");
      }
    },
    onSourceVideoFiltersChange: (filters) => {
      setSourceVideoQuery(filters.query);
      setSourceVideoStatusFilter(filters.status);
      setSourceVideosHasMore(true);
      clearRouteLocalReadError("sourceVideos");
    },
    onProcessHistoryFiltersChange: handleProcessHistoryFiltersChange,
    onLoadMoreSourceVideos: async () => {
      if (!data || sourceVideosLoading || sourceVideosLoadingMore || !sourceVideosHasMore) {
        return;
      }

      const offset = data.source_videos.length;
      if (offset >= data.status.video_count) {
        return;
      }

      clearRouteLocalReadError("sourceVideos");
      setSourceVideosLoadingMore(true);

      try {
        const nextSourceVideoPage = await withAdminLoadTimeout(
          client.listSourceVideosWithRuntime({
            offset,
            limit: ADMIN_SOURCE_VIDEO_INITIAL_LOAD_LIMIT,
            query: sourceVideoQuery,
            status: sourceVideoStatusFilter,
            manifest_fallback: adminSourceVideoManifestFallbackPolicy(sourceVideoStatusFilter)
          }),
          "继续加载原视频"
        );
        setSourceVideosRuntime(nextSourceVideoPage.runtime ?? null);
        setSourceVideosHasMore(nextSourceVideoPage.source_videos.length >= ADMIN_SOURCE_VIDEO_INITIAL_LOAD_LIMIT);
        setData((current) => current ? {
          ...current,
          source_videos: mergeAdminSourceVideoPages(current.source_videos, nextSourceVideoPage.source_videos)
        } : current);
      } catch (loadError) {
        setRouteLocalReadError("sourceVideos", loadError);
      } finally {
        setSourceVideosLoadingMore(false);
      }
    },
    onExportDoctor: () => runAction("导出检查报告", (api) => api.exportDoctorReport())
  };

  const navItems = adminNavItemsForMode(adminSurfaceMode).map((item) => ({
    key: item.route,
    label: item.label,
    icon: item.icon,
    href: routeToHash(item.route)
  }));

  if (apiMode && !adminAuthStatus?.authenticated) {
    return (
      <AdminLoginGate
        mode={adminAuthStatus?.bootstrap.registration_open ? "register" : "login"}
        loading={adminAuthLoading && !adminAuthStatus}
        error={adminAuthError || adminAuthStatus?.message || ""}
        onRegister={handleAdminRegister}
        onLogin={handleAdminLogin}
      />
    );
  }

  return (
    <main className="admin-app" data-admin-web-ready={data ? "true" : "false"}>
      <AppShell
        ariaLabel="MixLab 管理端导航"
        brand={{
          title: "MixLab",
          subtitle: "素材生产驾驶舱",
          mark: "ML",
          href: routeToHash("dashboard")
        }}
        items={navItems}
        activeKey={route}
        sidebarFooter={data ? <AdminSidebarStatus data={data} /> : null}
        className="admin-shell-v1"
        workbenchClassName="admin-workbench-v1"
      >
        <AdminTopbar data={data} authSession={adminAuthSession} onLogout={handleAdminLogout} />
        <section className="admin-workspace">
          {actionNotice || actionError ? (
            <div className={`admin-action-notice${actionError ? " is-error" : ""}`} role="status">
              {actionError || actionNotice}
            </div>
          ) : null}
          <section className={`admin-content-split admin-route-${route}`}>
            {error ? (
              <InspectorPanel title="加载失败">
                <p>{error}</p>
              </InspectorPanel>
            ) : data ? (
              renderPage(
                route,
                data,
                actions,
                adminSurfaceMode,
                sourceVideosRuntime,
                {
                  detail: sourceDetailForRequest(
                    sourceDetail,
                    sourceDetailRequestForRoute(route, data, selectedSourceVideoId)
                  ),
                  loading: sourceDetailLoading,
                  error: sourceDetailError
                },
                cutterUsers,
                adminRouteRenderLoadingState({
                  sourceVideosLoading,
                  sourceVideosLoadingMore,
                  sourceVideosHasMore,
                  preprocessJobsLoading,
                  operationsOverviewLoading,
                  operationLogLoading
                }),
                {
                  ...routeLocalReadErrors
                },
                {
                  loading: preprocessJobLogLoading,
                  error: preprocessJobLogError,
                  log: selectedPreprocessJobLog
                },
                {
                  loading: preprocessProcessHistoryLoading,
                  error: preprocessProcessHistoryError,
                  history: preprocessProcessHistory
                },
                {
                  overview: operationsOverview,
                  readModelReconcileStatus,
                  readModelReconcileError,
                  readModelReconcileCommandLoading,
                  error: operationsOverviewError
                },
                {
                  history: runtimeDiagnosticsHistory,
                  loading: runtimeDiagnosticsLoading,
                  error: runtimeDiagnosticsError
                },
                {
                  operationLog,
                  error: operationLogError,
                  restorePlanPreview: commandSnapshotRestorePlanPreview,
                  restoreExecution: commandSnapshotRestoreExecution
                },
                scanNewStatus,
                activeAdminCommandLabel
              )
            ) : (
              <InspectorPanel title={routeTitle(route)}>
                <p>正在读取素材库管理端数据</p>
              </InspectorPanel>
            )}
          </section>
        </section>
      </AppShell>
    </main>
  );
}
