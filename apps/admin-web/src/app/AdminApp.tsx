import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppShell,
  InspectorPanel,
} from "@mixlab/ui-foundation";
import {
  adminDashboardDataWithDoctor,
  adminDashboardDataWithJobs,
  adminDashboardDataWithRuntime,
  adminDashboardDataWithSourceVideoUpdated,
  adminDashboardDataWithSupervisorStatus,
  adminDashboardFieldSource,
  adminDashboardSourceLabel,
  adminDoctorReportStatus,
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
import { isAdminAuthExpiredError, isAdminHttpError } from "../admin-http.ts";
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
import {
  AdminCommandProgressPanel,
  AdminConfirmDialog,
  AdminOperationResultDialog,
  EmptyState
} from "../features/shared.tsx";
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
import { adminErrorCodeInfo, adminErrorTechnicalDetail } from "./admin-error-codes.ts";
import {
  adminBatchPublishImpact,
  adminLongAsrImpact,
  adminPausePreprocessImpact,
  adminStartPreprocessImpact
} from "./destructive-action-impact.ts";
import { ADMIN_SEARCH_DEBOUNCE_MS, createAdminDebouncedCallback } from "./debounce.ts";
import {
  adminCapabilityGate,
  adminCapabilityUnavailableMessage,
  resolveAdminClientVersion,
  type AdminCapabilityState
} from "./capabilities.ts";
import {
  parseAdminServiceModes,
  type AdminServiceModes
} from "./service-modes.ts";
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

function pendingScanNewStatus(now = new Date().toISOString()): AdminLibraryScanNewStatus {
  return {
    state: "running",
    state_label: "扫描中",
    started_at: now,
    updated_at: now,
    completed_at: "",
    error_message: "",
    stage: "listing",
    current_source_folder_id: "",
    current_source_folder_name: "",
    scanned_folder_count: 0,
    total_source_folder_count: 0,
    discovered_video_count: 0,
    indexed_file_count: 0,
    new_video_count: 0,
    existing_video_count: 0,
    written_video_count: 0,
    total_video_count: 0,
    inactive_manifest_count: 0,
    inactive_ready_count: 0
  };
}

let installedAdminAuthExpiredHandler: (() => void) | null = null;

export function setInstalledAdminAuthExpiredHandler(handler: (() => void) | null): void {
  installedAdminAuthExpiredHandler = handler;
}

function notifyInstalledAdminAuthExpired(): void {
  installedAdminAuthExpiredHandler?.();
}

export function resolveAdminRuntimeApiBaseUrl(input: {
  viteApiBaseUrl?: string;
  useFixtureData?: boolean;
  isProduction?: boolean;
}): string {
  if (input.useFixtureData) {
    if (input.isProduction) {
      throw new Error(
        "fixture 数据模式（VITE_MIXLAB_USE_FIXTURE_DATA=true）禁止用于生产构建；请改为连接真实管理端 API。"
      );
    }

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
        ...(options.signal ? { signal: options.signal } : {}),
        onAuthExpired: notifyInstalledAdminAuthExpired
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

export function adminDoctorSummaryLabel(data: AdminDashboardData): string {
  const status = adminDoctorReportStatus(data);

  if (!status.loaded) {
    return adminDashboardFieldSource(data, "doctor").source === "fallback" ? "读取失败" : "未检查";
  }

  if (data.doctor.summary.fail > 0) {
    return `${data.doctor.summary.fail} 项需处理`;
  }

  if (data.doctor.summary.warn > 0) {
    return `${data.doctor.summary.warn} 项需关注`;
  }

  return "正常";
}

export function adminPreprocessRuntimeLabel(data: AdminDashboardData): string {
  const supervisorSource = adminDashboardFieldSource(data, "supervisor").source;

  if (supervisorSource !== "api") {
    return supervisorSource === "fallback" ? "读取失败" : "状态未确认";
  }

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
      listPreprocessJobsWithFailureDetails(client, ADMIN_PREPROCESS_JOB_ROUTE_LOAD_LIMIT),
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
  timeoutMs = ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS,
  options: { command?: boolean } = {}
): Promise<T> {
  let settled = false;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new Error(options.command
        ? "请求超时，命令可能仍在执行，请刷新操作记录确认。"
        : `${label}响应较慢，请稍后自动刷新或缩小范围。`));
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

export function mergeAdminPreprocessJobPages(
  primary: AdminPreprocessJobsResponse,
  supplement: AdminPreprocessJobsResponse
): AdminPreprocessJobsResponse {
  const jobById = new Map(primary.jobs.map((job) => [job.job_id, job]));

  for (const job of supplement.jobs) {
    if (!jobById.has(job.job_id)) {
      jobById.set(job.job_id, job);
    }
  }

  return {
    ...primary,
    jobs: Array.from(jobById.values())
  };
}

async function listPreprocessJobsWithFailureDetails(
  client: AdminApiClient,
  limit: number
): Promise<AdminPreprocessJobsResponse> {
  const primary = await client.listPreprocessJobs({ limit });
  const loadedFailureCount = primary.jobs.filter((job) => job.status === "failed").length;
  if (primary.failed_count <= loadedFailureCount) {
    return primary;
  }

  try {
    const supplement = await withAdminLoadTimeout(
      client.listPreprocessJobs({
        limit: Math.min(500, Math.max(primary.failed_count, ADMIN_PREPROCESS_JOB_INITIAL_LOAD_LIMIT)),
        status: "failed"
      }),
      "失败素材明细加载",
      3_000
    );
    return mergeAdminPreprocessJobPages(primary, supplement);
  } catch {
    return primary;
  }
}

function mergeAdminDashboardShellData(
  current: AdminDashboardData,
  next: AdminDashboardData
): AdminDashboardData {
  const mergedDataSource = {
    ...current.data_source,
    ...next.data_source
  };

  // shell 首屏不会真实读取 doctor/runtime；不要用占位来源覆盖已通过路由读取的真实来源。
  for (const key of ["doctor", "runtime"] as const) {
    const currentSource = current.data_source?.[key];
    const nextSource = next.data_source?.[key];

    if (currentSource?.source === "api" && nextSource?.source !== "api") {
      mergedDataSource[key] = currentSource;
    }
  }

  return {
    ...next,
    source_videos: next.source_videos.length > 0 ? next.source_videos : current.source_videos,
    jobs: {
      ...next.jobs,
      jobs: next.jobs.jobs.length > 0 ? next.jobs.jobs : current.jobs.jobs
    },
    data_source: mergedDataSource
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
  return adminDashboardDataWithJobs({
    ...current,
    status: next.status,
    metrics: next.metrics,
    indexes: {
      ...current.indexes,
      current_version: next.status.current_index_version || current.indexes.current_version
    }
  }, next.jobs);
}

async function loadAdminDashboardPanelData(client: AdminApiClient): Promise<{
  status: AdminLibraryStatus;
  jobs: AdminPreprocessJobsResponse;
  metrics: AdminDashboardMetrics;
}> {
  const [status, jobs, metrics] = await Promise.all([
    client.getLibraryStatus(),
    listPreprocessJobsWithFailureDetails(client, ADMIN_PREPROCESS_JOB_ROUTE_LOAD_LIMIT),
    client.getDashboardMetrics()
  ]);

  return { status, jobs, metrics };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

interface AdminConfirmationRequest {
  title: string;
  summary: string;
  items: string[];
  confirm_label?: string;
  danger?: boolean;
  run: () => Promise<void>;
}

interface AdminCommandProgressState {
  label: string;
  detail: string;
  percent: number;
  stop_requested: boolean;
}

interface AdminCommandResultState {
  title: string;
  items: string[];
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
  onReloadAdminData: () => void;
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

  if (isAdminHttpError(error)) {
    const info = adminErrorCodeInfo(error.code);

    if (info) {
      return `${label}失败：${info.title}。${info.action}`;
    }

    const serverMessage = error.serverMessage.trim();

    if (serverMessage && containsChinese(serverMessage)) {
      return `${label}失败：${serverMessage}（错误码：${error.code}）`;
    }

    return `${label}失败，请稍后重试。（错误码：${error.code}）`;
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

export function formatAdminRetryAfterSeconds(value: number): string {
  const seconds = Math.max(1, Math.ceil(value));

  if (seconds >= 60) {
    return `${Math.ceil(seconds / 60)} 分钟`;
  }

  return `${seconds} 秒`;
}

export function adminAuthFormErrorMessage(label: string, error: unknown): string {
  if (isAdminHttpError(error)) {
    const retryAfterSeconds = (() => {
      const details = error.details ?? {};
      const direct = details.retry_after_seconds ?? details.retry_after;

      if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) {
        return direct;
      }

      const milliseconds = details.retry_after_ms;

      if (typeof milliseconds === "number" && Number.isFinite(milliseconds) && milliseconds > 0) {
        return milliseconds / 1_000;
      }

      return null;
    })();

    const normalizedCode = error.code.toLowerCase();

    if (error.status === 429 || normalizedCode === "login_rate_limited" || normalizedCode.includes("rate_limited")) {
      return retryAfterSeconds
        ? `登录失败次数过多，请在 ${formatAdminRetryAfterSeconds(retryAfterSeconds)}后重试。`
        : "登录失败次数过多，请稍后重试。";
    }

    const serverMessage = error.serverMessage.trim();

    if (normalizedCode === "registration_forbidden" || normalizedCode.includes("registration_token")) {
      if (serverMessage && containsChinese(serverMessage)) {
        return `注册失败：${serverMessage}`;
      }

      return "注册令牌不正确或已失效：请向部署管理员获取有效的注册令牌后重试。";
    }

    if (error.status === 403) {
      if (serverMessage && containsChinese(serverMessage)) {
        return `操作被拒绝：${serverMessage}`;
      }

      return "当前操作被服务端拒绝：请确认注册令牌或联系部署管理员。";
    }
  }

  return adminActionErrorMessage(label, error);
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
  activeAdminCommandLabel: string,
  capabilityState: AdminCapabilityState,
  serviceModes: AdminServiceModes,
  clientVersion: string,
  onReloadCapabilities: () => void
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
        capabilities={capabilityState}
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
        capabilities={capabilityState}
        serviceModes={serviceModes}
        clientVersion={clientVersion}
        onReloadCapabilities={onReloadCapabilities}
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
        onReloadData={actions.onReloadAdminData}
        serviceModes={serviceModes}
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
    useFixtureData: import.meta.env?.VITE_MIXLAB_USE_FIXTURE_DATA === "true",
    isProduction: import.meta.env?.PROD === true
  }), []);
  const apiMode = Boolean(apiBaseUrl);
  const adminClientVersion = useMemo(
    () => resolveAdminClientVersion(import.meta.env?.VITE_MIXLAB_BUILD_VERSION),
    []
  );
  const [adminAuthSession, setAdminAuthSession] = useState<StoredAdminAuthSession | null>(() => readAdminAuthSession());
  const [adminAuthStatus, setAdminAuthStatus] = useState<AdminAuthStatus | null>(() =>
    apiMode && adminAuthSession ? authStatusFromStoredSession(adminAuthSession) : null
  );
  const [adminAuthLoading, setAdminAuthLoading] = useState(apiMode);
  const [adminAuthError, setAdminAuthError] = useState("");
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [error, setError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionErrorTechnical, setActionErrorTechnical] = useState("");
  const [scanNewStatus, setScanNewStatus] = useState<AdminLibraryScanNewStatus | null>(null);
  const [capabilityState, setCapabilityState] = useState<AdminCapabilityState>({ status: "loading" });
  const [capabilityReloadToken, setCapabilityReloadToken] = useState(0);
  const [serviceModes, setServiceModes] = useState<AdminServiceModes>(() => parseAdminServiceModes({}));
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
  const [sourceVideoQueryInput, setSourceVideoQueryInput] = useState("");
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
  const [adminConfirmation, setAdminConfirmation] = useState<AdminConfirmationRequest | null>(null);
  const [adminCommandProgress, setAdminCommandProgress] = useState<AdminCommandProgressState | null>(null);
  const [adminCommandResult, setAdminCommandResult] = useState<AdminCommandResultState | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const dashboardLoadingRef = useRef(false);
  const dashboardLoadedRef = useRef(false);
  const metricsLoadingRef = useRef(false);
  const dashboardPanelLoadingRef = useRef(false);
  const activeAdminCommandLabelRef = useRef("");
  const adminConfirmationResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const batchStopRequestedRef = useRef(false);
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
  const authExpiredHandledRef = useRef(false);
  const handleAdminAuthExpired = useCallback(() => {
    if (authExpiredHandledRef.current) {
      return;
    }

    authExpiredHandledRef.current = true;
    setInstalledAdminAuthExpiredHandler(null);
    clearAdminAuthSession();
    setAdminAuthSession(null);
    setAdminAuthStatus({
      authenticated: false,
      auth_mode: "password",
      user: null,
      bootstrap: {
        has_admin: true,
        registration_open: false
      }
    });
    setAdminAuthError("登录已过期，请重新登录。");
    setAdminAuthLoading(false);
    activeAdminCommandLabelRef.current = "";
    setActiveAdminCommandLabel("");
    setActionError("");
    setActionErrorTechnical("");
    setActionNotice("");
    setData(null);
    dashboardLoadedRef.current = false;
  }, []);
  useEffect(() => {
    setInstalledAdminAuthExpiredHandler(handleAdminAuthExpired);

    return () => {
      setInstalledAdminAuthExpiredHandler(null);
    };
  }, [handleAdminAuthExpired]);
  const handleAdminRequestError = useCallback((label: string, requestError: unknown): string => {
    if (isAdminAuthExpiredError(requestError)) {
      handleAdminAuthExpired();
      return "登录已过期，请重新登录。";
    }

    return adminActionErrorMessage(label, requestError);
  }, [handleAdminAuthExpired]);
  const clearActionError = useCallback(() => {
    setActionError("");
    setActionErrorTechnical("");
  }, []);
  const reportActionError = useCallback((label: string, actionFailure: unknown) => {
    if (isAdminAuthExpiredError(actionFailure)) {
      handleAdminAuthExpired();
      return;
    }

    setActionError(adminActionErrorMessage(label, actionFailure));
    setActionErrorTechnical(adminErrorTechnicalDetail(actionFailure));
  }, [handleAdminAuthExpired]);
  const requestAdminConfirmation = useCallback((request: AdminConfirmationRequest): Promise<boolean> => {
    const activeLabel = activeAdminCommandLabelRef.current;

    if (activeLabel) {
      setActionError(adminCommandActionStartDecision(activeLabel, request.title).message);
      setActionErrorTechnical("");
      return Promise.resolve(false);
    }

    if (adminConfirmationResolverRef.current) {
      return Promise.resolve(false);
    }

    return new Promise<boolean>((resolve) => {
      adminConfirmationResolverRef.current = resolve;
      setAdminConfirmation(request);
    });
  }, []);
  const settleAdminConfirmation = useCallback((confirmed: boolean) => {
    const resolve = adminConfirmationResolverRef.current;
    const request = adminConfirmation;
    adminConfirmationResolverRef.current = null;
    setAdminConfirmation(null);

    if (resolve) {
      resolve(confirmed);
    }

    if (confirmed && request) {
      void request.run();
    }
  }, [adminConfirmation]);
  const requestStopAdminCommand = useCallback(() => {
    batchStopRequestedRef.current = true;
    setAdminCommandProgress((current) => current ? { ...current, stop_requested: true } : current);
  }, []);
  const searchDebounce = useMemo(
    () => createAdminDebouncedCallback((value: string) => setSourceVideoQuery(value), ADMIN_SEARCH_DEBOUNCE_MS),
    []
  );
  useEffect(() => () => searchDebounce.cancel(), [searchDebounce]);
  const client = useMemo(
    () => createRuntimeClient(apiBaseUrl, adminAuthSession),
    [apiBaseUrl, adminAuthSession]
  );
  const canLoadAdminData = !apiMode || adminAuthStatus?.authenticated === true;
  const scanNewFastPollRequested =
    scanNewStatus?.state === "running" ||
    activeAdminCommandLabel === "扫描新增素材" ||
    activeAdminCommandLabel === "启动预处理";
  const clearRouteLocalReadError = (key: AdminRouteLocalReadKey) => {
    setRouteLocalReadErrors((current) => clearAdminRouteLocalReadError(current, key));
  };
  const setRouteLocalReadError = (key: AdminRouteLocalReadKey, error: unknown) => {
    setRouteLocalReadErrors((current) =>
      setAdminRouteLocalReadError(
        current,
        key,
        handleAdminRequestError(adminRouteLocalReadLabel(key), error)
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
    requestScope.client.getAuthStatus()
      .then((status) => {
        if (cancelled) {
          return;
        }

        setAdminAuthStatus(status);
        if (status.authenticated) {
          authExpiredHandledRef.current = false;
        }
        if (!status.authenticated && adminAuthSession) {
          clearAdminAuthSession();
          setAdminAuthSession(null);
          setAdminAuthError("登录已过期，请重新登录。");
        }
      })
      .catch((statusError) => {
        if (cancelled) {
          return;
        }

        if (isAdminAuthExpiredError(statusError)) {
          handleAdminAuthExpired();
          return;
        }

        if (adminAuthSession) {
          setAdminAuthStatus((current) =>
            current?.authenticated ? current : authStatusFromStoredSession(adminAuthSession)
          );
        } else {
          setAdminAuthStatus(null);
        }
        setAdminAuthError(adminLoadErrorMessage(statusError));
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
    const requestScope = createRuntimeRequestScope(apiBaseUrl, adminAuthSession);
    setCapabilityState((current) => current.status === "ready" ? current : { status: "loading" });
    void Promise.allSettled([
      withAdminLoadTimeout(requestScope.client.getCapabilities(), "版本信息加载"),
      requestScope.client.getHealth()
    ])
      .then(([capabilityResult, healthResult]) => {
        if (cancelled) {
          return;
        }

        let capabilityPayload: unknown = null;

        if (capabilityResult.status === "fulfilled") {
          capabilityPayload = capabilityResult.value;
          setCapabilityState({ status: "ready", table: capabilityResult.value });
        } else if (isAdminAuthExpiredError(capabilityResult.reason)) {
          handleAdminAuthExpired();
          return;
        } else {
          setCapabilityState({
            status: "unavailable",
            message: adminCapabilityUnavailableMessage(capabilityResult.reason)
          });
        }

        let healthPayload: unknown = null;

        if (healthResult.status === "fulfilled") {
          healthPayload = healthResult.value;
        } else if (isAdminAuthExpiredError(healthResult.reason)) {
          handleAdminAuthExpired();
          return;
        }

        setServiceModes(parseAdminServiceModes({
          capabilities: capabilityPayload,
          health: healthPayload
        }));
      })
      .finally(() => {
        requestScope.abort();
      });

    return () => {
      cancelled = true;
      requestScope.abort();
    };
  }, [adminAuthSession, apiBaseUrl, canLoadAdminData, capabilityReloadToken, handleAdminAuthExpired]);

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

        const pollFast =
          status.state === "running" ||
          activeAdminCommandLabelRef.current === "扫描新增素材" ||
          activeAdminCommandLabelRef.current === "启动预处理";
        timeoutId = window.setTimeout(loadScanStatus, pollFast ? 3_000 : 30_000);
      } catch {
        if (!cancelled) {
          timeoutId = window.setTimeout(loadScanStatus, scanNewFastPollRequested ? 3_000 : 30_000);
        }
      }
    };

    void loadScanStatus();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [canLoadAdminData, client, scanNewFastPollRequested]);

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
            let merged: AdminDashboardData = {
              ...next,
              ...(pendingIndexes ? { indexes: pendingIndexes } : {}),
              ...(pendingIndexRequiredVideos ? { source_videos: pendingIndexRequiredVideos } : {}),
              ...(pendingPathChecks ? { path_checks: pendingPathChecks } : {})
            };

            if (pendingJobs) {
              merged = adminDashboardDataWithJobs(merged, pendingJobs);
            }
            if (pendingDoctor) {
              merged = adminDashboardDataWithDoctor(merged, pendingDoctor);
            }
            if (pendingRuntime) {
              merged = adminDashboardDataWithRuntime(merged, pendingRuntime);
            }

            return merged;
          });
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          if (isAdminAuthExpiredError(loadError)) {
            handleAdminAuthExpired();
            return;
          }

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
  }, [adminAuthSession, apiBaseUrl, client, hasDashboardData, reloadToken, route, sourceVideoQuery, sourceVideoStatusFilter]);

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
            return adminDashboardDataWithJobs(current, jobs);
          });
        }
        preprocessJobsPrefetchTokenRef.current = reloadToken;
      },
      onError: (loadError) => {
        setRouteLocalReadError("preprocessJobs", loadError);
        setPreprocessProcessHistoryError(handleAdminRequestError("处理历史加载", loadError));
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
            pendingDoctorReportRef.current = { ...doctor, source: "api" };
            return current;
          }

          pendingDoctorReportRef.current = null;
          return adminDashboardDataWithDoctor(current, doctor);
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
          return adminDashboardDataWithRuntime(current, runtime);
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
            return adminDashboardDataWithJobs(current, jobs);
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
              setData((current) => current ? adminDashboardDataWithJobs(current, jobs) : current);
            }
          }
        },
        onError: (loadError, { requestScope }) => {
          if (activeBackgroundRefresh?.requestScope === requestScope) {
            setRouteLocalReadError("preprocessJobs", loadError);
            setPreprocessProcessHistoryError(handleAdminRequestError("处理历史刷新", loadError));
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
      setActionErrorTechnical("");
      return false;
    }

    activeAdminCommandLabelRef.current = label;
    setActiveAdminCommandLabel(label);
    setActionError("");
    setActionErrorTechnical("");
    setActionNotice(notice ?? `${label}中...`);
    return true;
  };

  const finishAdminCommandAction = (label: string) => {
    if (activeAdminCommandLabelRef.current === label) {
      activeAdminCommandLabelRef.current = "";
      setActiveAdminCommandLabel("");
    }
  };

  const runAction = async (
    label: string,
    action: (client: AdminApiClient) => Promise<unknown>,
    onSuccess?: (result: unknown) => void
  ) => {
    if (!beginAdminCommandAction(label)) {
      return;
    }

    try {
      const result = await action(client);
      onSuccess?.(result);
      setActionNotice(formatActionNotice(label, result));
      setReloadToken((current) => current + 1);
    } catch (actionFailure) {
      setActionNotice("");
      reportActionError(label, actionFailure);
    } finally {
      finishAdminCommandAction(label);
    }
  };

  const runDoctorAction = () => runAction(
    "运行系统检查",
    (api) => api.runDoctor(),
    (result) => {
      setData((current) => current
        ? adminDashboardDataWithDoctor(current, result as AdminDashboardData["doctor"])
        : current);
    }
  );

  const runScanNewSourceVideos = async (api: AdminApiClient): Promise<AdminLibraryScanNewStatus | null> => {
    setScanNewStatus((current) => current?.state === "running" ? current : pendingScanNewStatus());
    await api.scanNewSourceVideos();

    try {
      const status = await api.getScanNewSourceVideosStatus();
      setScanNewStatus(status);
      return status;
    } catch {
      return null;
    }
  };

  const executeBatchPublish = async () => {
    if (!beginAdminCommandAction("上线全部已处理素材")) {
      return;
    }

    const totalTarget = Math.max(1, data?.status.index_required_video_count ?? 0);
    batchStopRequestedRef.current = false;
    let publishedCount = 0;
    let skippedCount = 0;
    let remainingIndexRequiredCount = totalTarget;
    let batchCount = 0;
    setAdminCommandProgress({
      label: "批量上线",
      detail: `准备上线 ${totalTarget} 个已处理素材`,
      percent: 0,
      stop_requested: false
    });

    try {
      for (let batchIndex = 0; batchIndex < 100; batchIndex += 1) {
        if (batchStopRequestedRef.current) {
          break;
        }

        const result = await client.repairIndex({ limit: 10 });
        batchCount += 1;
        publishedCount += result.published_count ?? 0;
        skippedCount += result.skipped_count ?? 0;
        remainingIndexRequiredCount = result.remaining_index_required_count ?? 0;

        setAdminCommandProgress({
          label: "批量上线",
          detail: `第 ${batchCount} 批完成：已上线 ${publishedCount}/${totalTarget} 个，跳过 ${skippedCount} 个，剩余 ${remainingIndexRequiredCount} 个`,
          percent: Math.min(100, Math.round((publishedCount / totalTarget) * 100)),
          stop_requested: batchStopRequestedRef.current
        });

        if (remainingIndexRequiredCount <= 0 || (result.published_count ?? 0) <= 0) {
          break;
        }
      }

      const stopped = batchStopRequestedRef.current;
      const resultMessage = stopped
        ? `已停止后续批次：本次上线 ${publishedCount} 个，跳过 ${skippedCount} 个，剩余 ${remainingIndexRequiredCount} 个。`
        : remainingIndexRequiredCount > 0
          ? `已分批上线 ${publishedCount} 个素材，还有 ${remainingIndexRequiredCount} 个待上线。`
          : publishedCount > 0
            ? `已分批上线 ${publishedCount} 个素材，全部已处理素材都可以在剪辑端使用。`
            : "没有需要上线的已处理素材。";

      setActionNotice(resultMessage);
      setAdminCommandResult({
        title: stopped ? "批量上线已停止后续批次" : "批量上线完成",
        items: [
          `执行批次：${batchCount} 批`,
          `本次上线：${publishedCount} 个`,
          `跳过：${skippedCount} 个`,
          `剩余待上线：${remainingIndexRequiredCount} 个`,
          resultMessage
        ]
      });
      setReloadToken((current) => current + 1);
    } catch (error) {
      reportActionError("上线全部已处理素材", error);
      setAdminCommandResult({
        title: "批量上线未完成",
        items: [
          `已完成：${batchCount} 批，上线 ${publishedCount} 个`,
          `剩余待上线：${remainingIndexRequiredCount} 个`,
          "请先刷新确认实际状态，再决定是否重试"
        ]
      });
    } finally {
      setAdminCommandProgress(null);
      finishAdminCommandAction("上线全部已处理素材");
    }
  };

  const runRepairIndexInBatches = async () => {
    if (!data) {
      return;
    }

    const impact = adminBatchPublishImpact(data);

    await requestAdminConfirmation({
      title: impact.title,
      summary: impact.summary,
      items: impact.items,
      confirm_label: "确认批量上线",
      danger: true,
      run: executeBatchPublish
    });
  };

  const startPreprocessBatch = async (api: AdminApiClient): Promise<AdminActionResult> => {
    const scanStatus = await runScanNewSourceVideos(api);
    const supervisor = await api.startPreprocessSupervisor(undefined, {
      queue_unprocessed_limit: PREPROCESS_START_QUEUE_UNPROCESSED_LIMIT
    });
    setData((current) => current ? adminDashboardDataWithSupervisorStatus(current, supervisor) : current);

    return {
      affected_count: scanStatus?.written_video_count ?? 0,
      message: scanStatus
        ? `${scanNewStatusNotice(scanStatus)} 已启动预处理，系统会持续处理队列，直到全部处理完或手动暂停。`
        : "已启动预处理。系统会持续处理队列，直到全部处理完或手动暂停。"
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

  const confirmAndRunStartPreprocess = async () => {
    if (!data) {
      return;
    }

    const impact = adminStartPreprocessImpact(data);

    await requestAdminConfirmation({
      title: impact.title,
      summary: impact.summary,
      items: impact.items,
      confirm_label: "确认启动预处理",
      run: async () => {
        await runAction("启动预处理", startPreprocessBatch, (result) => {
          setAdminCommandResult({
            title: "启动预处理",
            items: [formatActionNotice("启动预处理", result)]
          });
        });
      }
    });
  };

  const confirmAndRunPausePreprocess = async () => {
    if (!data) {
      return;
    }

    const impact = adminPausePreprocessImpact(data);

    await requestAdminConfirmation({
      title: impact.title,
      summary: impact.summary,
      items: impact.items,
      confirm_label: "确认暂停预处理",
      run: async () => {
        await runAction("暂停预处理", (api) => api.stopPreprocessSupervisor(), (result) => {
          setAdminCommandResult({
            title: "暂停预处理",
            items: [formatActionNotice("暂停预处理", result)]
          });
        });
      }
    });
  };

  const confirmAndRunLongAsr = async () => {
    if (!data) {
      return;
    }

    const impact = adminLongAsrImpact(data);

    if (impact.target_count <= 0) {
      setActionNotice("当前没有需要长任务语音识别处理的素材。");
      return;
    }

    await requestAdminConfirmation({
      title: impact.title,
      summary: impact.summary,
      items: impact.items,
      confirm_label: "确认长任务识别",
      run: async () => {
        await runAction("长任务语音识别", startLongAsrBatch, (result) => {
          setAdminCommandResult({
            title: "长任务语音识别",
            items: [formatActionNotice("长任务语音识别", result)]
          });
        });
      }
    });
  };

  const runSmartScan = async () => {
    if (!beginAdminCommandAction("扫描新增素材", "正在扫描新增素材、检查系统状态并刷新生产状态...")) {
      return;
    }

    try {
      const scanStatus = await runScanNewSourceVideos(client);
      await client.runDoctor();
      const refreshed = await loadAdminDashboardData(client, { includeHeavy: false });
      const report = createAdminSmartScanReport(refreshed);
      setData((current) => current ? mergeAdminDashboardShellData(current, refreshed) : refreshed);
      setActionNotice(scanStatus
        ? `${scanNewStatusNotice(scanStatus)} ${report.title}`.trim()
        : `扫描完成：${report.title}`);
    } catch (failure) {
      setActionNotice("");
      reportActionError("扫描新增素材", failure);
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
      await confirmAndRunStartPreprocess();
      return;
    }

    if (action === "start-long-asr") {
      await confirmAndRunLongAsr();
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
      runDoctorAction();
    }
  };

  const handleAdminRegister = async (input: {
    username: string;
    password: string;
    display_name?: string;
    registration_token?: string;
  }) => {
    setAdminAuthError("");
    try {
      const result = await client.registerAdmin(input);
      const nextSession = adminAuthSessionFromResult(result);
      authExpiredHandledRef.current = false;
      setInstalledAdminAuthExpiredHandler(handleAdminAuthExpired);
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
      setAdminAuthError(adminAuthFormErrorMessage("创建管理员", registerError));
    }
  };

  const handleAdminLogin = async (input: { username: string; password: string }) => {
    setAdminAuthError("");
    try {
      const result = await client.loginAdmin(input);
      const nextSession = adminAuthSessionFromResult(result);
      authExpiredHandledRef.current = false;
      setInstalledAdminAuthExpiredHandler(handleAdminAuthExpired);
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
      setAdminAuthError(adminAuthFormErrorMessage("登录管理端", loginError));
    }
  };

  const handleAdminLogout = () => {
    void client.logoutAdmin().catch(() => undefined);
    authExpiredHandledRef.current = false;
    setInstalledAdminAuthExpiredHandler(handleAdminAuthExpired);
    clearAdminAuthSession();
    setAdminAuthError("");
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
        error: handleAdminRequestError("恢复预检加载", previewError)
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
        "命令快照恢复",
        ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS,
        { command: true }
      );
      setCommandSnapshotRestoreExecution({
        snapshotId,
        armed: false,
        loading: false,
        error: "",
        result
      });
      setActionNotice(`命令快照恢复完成：恢复 ${result.restored_file_count} 个文件，阻断 ${result.blocked_file_count} 个文件`);
      setAdminCommandResult({
        title: "命令快照恢复完成",
        items: [
          `恢复文件：${result.restored_file_count} 个`,
          `阻断文件：${result.blocked_file_count} 个`,
          ...(result.blockers ?? []).map((blocker) => `阻断原因：${blocker}`),
          "请刷新操作记录确认审计结果"
        ]
      });
      setReloadToken((current) => current + 1);
    } catch (restoreError) {
      setActionNotice("");
      setCommandSnapshotRestoreExecution({
        snapshotId,
        armed: true,
        loading: false,
        error: handleAdminRequestError("命令快照恢复", restoreError),
        result: null
      });

      if (isAdminAuthExpiredError(restoreError)) {
        return;
      }
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
        "启动后台对账",
        ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS,
        { command: true }
      );
      setReadModelReconcileStatus(result.status);
      setActionNotice(result.accepted ? "后台对账已启动" : "后台对账已在运行");
      setReloadToken((current) => current + 1);
    } catch (reconcileError) {
      setActionNotice("");
      setReadModelReconcileError(adminActionErrorMessage("启动后台对账", reconcileError));
      reportActionError("启动后台对账", reconcileError);
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
        "请求停止对账",
        ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS,
        { command: true }
      );
      setReadModelReconcileStatus(result.status);
      setActionNotice(result.accepted ? "已请求停止后台对账" : "后台对账当前未运行");
      setReloadToken((current) => current + 1);
    } catch (cancelError) {
      setActionNotice("");
      setReadModelReconcileError(adminActionErrorMessage("请求停止对账", cancelError));
      reportActionError("请求停止对账", cancelError);
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
        setPreprocessProcessHistoryError(handleAdminRequestError("处理历史筛选", filterError));
      })
      .finally(() => {
        setPreprocessProcessHistoryLoading(false);
      });
  };

  const actions: AdminActionHandlers = {
    sourceVideoQuery: sourceVideoQueryInput,
    sourceVideoStatusFilter,
    processHistoryFilters: preprocessProcessHistoryFilters,
    onInitializeLibrary: () => runAction("初始化素材库", (api) => api.initializeLibrary()),
    onScanSourceVideos: () =>
      runAction("扫描新增素材", async (api) => {
        const status = await runScanNewSourceVideos(api);
        return {
          affected_count: status?.written_video_count ?? 0,
          message: status ? scanNewStatusNotice(status) : "扫描新增素材完成。"
        } satisfies AdminActionResult;
      }),
    onQueueUnprocessedVideos: () => runAction("加入预处理队列", (api) => api.queueUnprocessedVideos()),
    onRetryFailedVideos: () => runAction("重试可继续处理的视频", (api) => api.retryFailedVideos()),
    onStartLongAsrVideos: confirmAndRunLongAsr,
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
        setPreprocessJobLogError(handleAdminRequestError("读取任务日志", logFailure));
      } finally {
        setPreprocessJobLogLoading(false);
      }
    },
    onStartPreprocessSupervisor: confirmAndRunStartPreprocess,
    onStopPreprocessSupervisor: confirmAndRunPausePreprocess,
    onRepairIndex: runRepairIndexInBatches,
    onRunDoctor: () => runAction("运行系统检查", (api) => api.runDoctor(), (result) => setData((current) => current ? adminDashboardDataWithDoctor(current, result as AdminDashboardData["doctor"]) : current)),
    onReloadAdminData: () => setReloadToken((current) => current + 1),
    onTestAsrConfig: () => runAction("检查语音识别", (api) => api.testAsrConfig()),
    onSaveAdminSettings: (settings) =>
      runAction("保存设置", (api) => api.saveAdminSettings(settings)),
    onUpdateSourceVideoMetadata: (sourceVideoId, metadata) =>
      runAction("保存素材信息", (api) => api.updateSourceVideoMetadata(sourceVideoId, metadata), (result) => {
        const updated = result as AdminSourceVideo;
        setData((current) => current ? adminDashboardDataWithSourceVideoUpdated(current, updated) : current);
        setSourceDetail((current) => current && current.source_video.source_video_id === updated.source_video_id
          ? { ...current, source_video: { ...current.source_video, ...updated } }
          : current);
      }),
    onUpdateSourceVideoCover: (sourceVideoId, coverFile) =>
      runAction("保存封面", async (api) =>
        api.updateSourceVideoCover(sourceVideoId, await adminCoverUpdateFromFile(coverFile))
      , (result) => {
        const updated = result as AdminSourceVideo;
        setData((current) => current ? adminDashboardDataWithSourceVideoUpdated(current, updated) : current);
        setSourceDetail((current) => current && current.source_video.source_video_id === updated.source_video_id
          ? { ...current, source_video: { ...current.source_video, ...updated } }
          : current);
      }),
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
      setSourceVideoQueryInput(filters.query);

      if (filters.status !== sourceVideoStatusFilter) {
        searchDebounce.cancel();
        setSourceVideoQuery(filters.query);
        setSourceVideoStatusFilter(filters.status);
      } else {
        searchDebounce.schedule(filters.query);
      }

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
        requiresRegistrationToken={adminAuthStatus?.bootstrap.registration_requires_token === true}
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
            <div
              className={`admin-action-notice${actionError ? " is-error" : ""}`}
              role={actionError ? "alert" : "status"}
            >
              <p>{actionError || actionNotice}</p>
              {actionError && actionErrorTechnical ? (
                <details className="admin-action-error-details">
                  <summary>查看技术信息</summary>
                  <pre>{actionErrorTechnical}</pre>
                </details>
              ) : null}
            </div>
          ) : null}
          <section className={`admin-content-split admin-route-${route}`}>
            {error ? (
              <InspectorPanel title="加载失败">
                <p>{error}</p>
                <button
                  className="admin-primary-button"
                  type="button"
                  onClick={() => {
                    setError("");
                    setReloadToken((current) => current + 1);
                  }}
                >
                  重试加载
                </button>
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
                activeAdminCommandLabel,
                capabilityState,
                serviceModes,
                adminClientVersion,
                () => setCapabilityReloadToken((current) => current + 1)
              )
            ) : (
              <InspectorPanel title={routeTitle(route)}>
                <p>正在读取素材库管理端数据</p>
              </InspectorPanel>
            )}
          </section>
        </section>
      </AppShell>
      {adminCommandProgress ? (
        <AdminCommandProgressPanel
          label={adminCommandProgress.label}
          detail={adminCommandProgress.detail}
          percent={adminCommandProgress.percent}
          stopRequested={adminCommandProgress.stop_requested}
          onStop={requestStopAdminCommand}
        />
      ) : null}
      {adminConfirmation ? (
        <AdminConfirmDialog
          view={{
            title: adminConfirmation.title,
            summary: adminConfirmation.summary,
            items: adminConfirmation.items,
            confirmLabel: adminConfirmation.confirm_label,
            danger: adminConfirmation.danger
          }}
          onConfirm={() => settleAdminConfirmation(true)}
          onCancel={() => settleAdminConfirmation(false)}
        />
      ) : null}
      {adminCommandResult ? (
        <AdminOperationResultDialog
          title={adminCommandResult.title}
          items={adminCommandResult.items}
          onClose={() => setAdminCommandResult(null)}
        />
      ) : null}
    </main>
  );
}
