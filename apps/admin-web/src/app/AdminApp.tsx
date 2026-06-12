import { useEffect, useMemo, useRef, useState } from "react";
import {
  InspectorPanel,
  MacWindow,
  Sidebar,
  UnifiedToolbar
} from "@mixlab/ui-foundation";
import {
  createAdminApiClient,
  createAdminSmartScanReport,
  createFixtureAdminApiClient,
  loadAdminDashboardData,
  type AdminActionResult,
  type AdminApiClient,
  type AdminCutterUsersResponse,
  type AdminDashboardMetrics,
  type AdminDashboardData,
  type AdminIndexVersionsResponse,
  type AdminLibraryStatus,
  type AdminPreprocessJobLog,
  type AdminPreprocessJobsResponse,
  type AdminPreprocessSupervisorStatus,
  type AdminPreprocessStatus,
  type AdminSettingsConfigUpdate,
  type AdminSmartScanAction,
  type AdminSourceVideoCoverUpdate,
  type AdminSourceVideoDetail,
  type AdminSourceVideo,
  type AdminSourceVideoMetadataUpdate
} from "../api.ts";
import { DashboardPage } from "../features/dashboard/DashboardPage.tsx";
import { CutterUsersPage } from "../features/cutter-users/CutterUsersPage.tsx";
import { DoctorPage } from "../features/doctor/DoctorPage.tsx";
import { PreprocessJobsPage } from "../features/preprocess-jobs/PreprocessJobsPage.tsx";
import { SettingsPage } from "../features/settings/SettingsPage.tsx";
import { AdminSourceDetailPage } from "../features/source-detail/AdminSourceDetailPage.tsx";
import { SourceVideosPage } from "../features/source-videos/SourceVideosPage.tsx";
import { EmptyState } from "../features/shared.tsx";
import {
  ADMIN_NAV_ITEMS,
  routeFromHash,
  routeToHash,
  type AdminRoute
} from "./navigation.ts";
import { chineseDiagnosticText, indexStatusLabel } from "./chinese.ts";

const DEFAULT_LOCAL_ADMIN_API_BASE_URL = "http://127.0.0.1:3889/";

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

function createRuntimeClient() {
  const baseUrl = resolveAdminRuntimeApiBaseUrl({
    viteApiBaseUrl: import.meta.env?.VITE_MIXLAB_ADMIN_API_BASE_URL,
    useFixtureData: import.meta.env?.VITE_MIXLAB_USE_FIXTURE_DATA === "true"
  });

  return baseUrl
    ? createAdminApiClient({ base_url: baseUrl })
    : createFixtureAdminApiClient();
}

function routeTitle(route: AdminRoute): string {
  const labels: Record<AdminRoute, string> = {
    dashboard: "仪表盘",
    "source-videos": "原视频管理",
    "source-detail": "原视频详情",
    "preprocess-jobs": "预处理",
    "index-publish": "预处理",
    doctor: "系统检查",
    "cutter-users": "剪辑师用户",
    settings: "设置"
  };

  return labels[route];
}

export const ADMIN_DATA_AUTO_REFRESH_INTERVAL_MS = 10_000;
const ADMIN_SOURCE_VIDEO_INITIAL_LOAD_LIMIT = 20;
const ADMIN_PREPROCESS_JOB_INITIAL_LOAD_LIMIT = 20;
const ADMIN_ROUTE_DATA_LOAD_TIMEOUT_MS = 8_000;

async function loadAdminPreprocessRouteData(client: AdminApiClient) {
  const jobs = await client.listPreprocessJobs({ limit: ADMIN_PREPROCESS_JOB_INITIAL_LOAD_LIMIT });

  return { jobs };
}

const ALWAYS_AUTO_REFRESH_ROUTES = new Set<AdminRoute>([
  "preprocess-jobs"
]);

const PRODUCTION_AUTO_REFRESH_ROUTES = new Set<AdminRoute>([
  "source-detail"
]);

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
    client.listPreprocessJobs({ limit: ADMIN_PREPROCESS_JOB_INITIAL_LOAD_LIMIT }),
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
  onInitializeLibrary: () => Promise<void>;
  onScanSourceVideos: () => Promise<void>;
  onQueueUnprocessedVideos: () => Promise<void>;
  onRetryFailedVideos: () => Promise<void>;
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
  onOpenSourceDetail: (sourceVideoId: string) => void;
  onSourceVideoFiltersChange: (filters: {
    query: string;
    status: AdminPreprocessStatus | "all";
  }) => void;
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
  sourceDetail: SourceDetailRenderState,
  cutterUsers: AdminCutterUsersResponse | null,
  loadingState: {
    sourceVideos: boolean;
    sourceVideosMore: boolean;
    sourceVideosHasMore: boolean;
    preprocessJobs: boolean;
  },
  preprocessJobLogState: {
    loading: boolean;
    error: string;
    log: AdminPreprocessJobLog | null;
  }
) {
  if (route === "source-videos") {
    return (
      <SourceVideosPage
        data={data}
        onQueueSourceVideo={actions.onQueueSourceVideo}
        onRetrySourceVideo={actions.onRetrySourceVideo}
        onRecoverProcessingSourceVideo={actions.onRecoverProcessingSourceVideo}
        onPublishSourceVideo={actions.onPublishSourceVideo}
        onUpdateSourceVideoMetadata={actions.onUpdateSourceVideoMetadata}
        onUpdateSourceVideoCover={actions.onUpdateSourceVideoCover}
        onOpenSourceDetail={actions.onOpenSourceDetail}
        sourceQuery={actions.sourceVideoQuery}
        sourceStatusFilter={actions.sourceVideoStatusFilter}
        onSourceVideoFiltersChange={actions.onSourceVideoFiltersChange}
        onLoadMoreSourceVideos={actions.onLoadMoreSourceVideos}
        isLoadingInitial={loadingState.sourceVideos && data.source_videos.length === 0}
        isLoadingMore={loadingState.sourceVideosMore}
        hasMoreSourceVideos={loadingState.sourceVideosHasMore}
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
            <p>请返回原视频管理后重新打开详情。</p>
          </InspectorPanel>
        </>
      );
    }

    return (
      <>
        <div className="admin-main-column">
          <EmptyState
            title={sourceDetail.loading ? "正在读取原视频详情" : "没有可查看的原视频"}
            detail={sourceDetail.loading ? "请稍候，正在加载预处理数据。" : "请先在原视频管理中选择一条原视频。"}
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
        onRetryFailedVideos={actions.onRetryFailedVideos}
        onRecoverProcessingVideos={actions.onRecoverProcessingVideos}
        onStartPreprocessSupervisor={actions.onStartPreprocessSupervisor}
        onStopPreprocessSupervisor={actions.onStopPreprocessSupervisor}
        onRepairIndex={actions.onRepairIndex}
        selectedJobLog={preprocessJobLogState}
        onOpenPreprocessJobLog={actions.onOpenPreprocessJobLog}
      />
    );
  }

  if (route === "index-publish") {
    return (
      <PreprocessJobsPage
        data={data}
        isLoadingJobs={loadingState.preprocessJobs && data.jobs.jobs.length === 0}
        onRetryFailedVideos={actions.onRetryFailedVideos}
        onRecoverProcessingVideos={actions.onRecoverProcessingVideos}
        onStartPreprocessSupervisor={actions.onStartPreprocessSupervisor}
        onStopPreprocessSupervisor={actions.onStopPreprocessSupervisor}
        onRepairIndex={actions.onRepairIndex}
        selectedJobLog={preprocessJobLogState}
        onOpenPreprocessJobLog={actions.onOpenPreprocessJobLog}
      />
    );
  }

  if (route === "doctor") {
    return (
      <DoctorPage
        data={data}
        onRunDoctor={actions.onRunDoctor}
        onExportDoctor={actions.onExportDoctor}
      />
    );
  }

  if (route === "settings") {
    return (
      <SettingsPage
        data={data}
        onSaveAdminSettings={actions.onSaveAdminSettings}
        onInitializeLibrary={actions.onInitializeLibrary}
        onTestAsrConfig={actions.onTestAsrConfig}
      />
    );
  }

  if (route === "cutter-users") {
    if (!cutterUsers) {
      return (
        <>
          <div className="admin-main-column">
            <EmptyState title="正在读取剪辑师用户" detail="请稍候，正在加载登录申请和使用统计。" />
          </div>
          <InspectorPanel title="用户统计">
            <p>加载中</p>
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
    />
  );
}

export function AdminApp() {
  const [route, setRoute] = useState<AdminRoute>(() => routeFromHash(window.location.hash));
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [error, setError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [actionError, setActionError] = useState("");
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
  const [sourceVideoQuery, setSourceVideoQuery] = useState("");
  const [sourceVideoStatusFilter, setSourceVideoStatusFilter] = useState<AdminPreprocessStatus | "all">("all");
  const [preprocessJobsLoading, setPreprocessJobsLoading] = useState(false);
  const [selectedPreprocessJobLog, setSelectedPreprocessJobLog] = useState<AdminPreprocessJobLog | null>(null);
  const [preprocessJobLogLoading, setPreprocessJobLogLoading] = useState(false);
  const [preprocessJobLogError, setPreprocessJobLogError] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const dashboardLoadingRef = useRef(false);
  const dashboardLoadedRef = useRef(false);
  const metricsLoadingRef = useRef(false);
  const dashboardPanelLoadingRef = useRef(false);
  const cutterUsersLoadingRef = useRef(false);
  const cutterUsersLoadedTokenRef = useRef(-1);
  const preprocessJobsPrefetchLoadingRef = useRef(false);
  const preprocessJobsPrefetchTokenRef = useRef(-1);
  const pendingPreprocessJobsRef = useRef<AdminPreprocessJobsResponse | null>(null);
  const pendingIndexVersionsRef = useRef<AdminIndexVersionsResponse | null>(null);
  const hasDashboardData = Boolean(data);
  const client = useMemo(createRuntimeClient, []);

  useEffect(() => {
    const listener = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);

  useEffect(() => {
    if (dashboardLoadingRef.current) {
      return;
    }

    let cancelled = false;
    const showLoading = !dashboardLoadedRef.current;
    dashboardLoadingRef.current = true;
    if (showLoading) {
      setDashboardLoading(true);
    }

    setError("");
    loadAdminDashboardData(client, { includeHeavy: false })
      .then((result) => {
        if (!cancelled) {
          dashboardLoadedRef.current = true;
          setData((current) => {
            const pendingJobs = pendingPreprocessJobsRef.current;
            const pendingIndexes = pendingIndexVersionsRef.current;
            pendingPreprocessJobsRef.current = null;
            pendingIndexVersionsRef.current = null;
            const next = current ? mergeAdminDashboardShellData(current, result) : result;
            return {
              ...next,
              ...(pendingJobs ? { jobs: pendingJobs } : {}),
              ...(pendingIndexes ? { indexes: pendingIndexes } : {})
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
    };
  }, [client, reloadToken]);

  useEffect(() => {
    if (!shouldLoadAdminSourceVideos({
      route,
      hasData: hasDashboardData
    })) {
      return;
    }

    let cancelled = false;
    setSourceVideosLoading(true);
    setSourceVideosHasMore(true);
    setData((current) => current ? { ...current, source_videos: [] } : current);

    withAdminLoadTimeout(
      client.listSourceVideos({
        limit: ADMIN_SOURCE_VIDEO_INITIAL_LOAD_LIMIT,
        query: sourceVideoQuery,
        status: sourceVideoStatusFilter
      }),
      "原视频列表加载"
    )
      .then((sourceVideos) => {
        if (!cancelled) {
          setSourceVideosHasMore(sourceVideos.length >= ADMIN_SOURCE_VIDEO_INITIAL_LOAD_LIMIT);
          setData((current) => current ? { ...current, source_videos: sourceVideos } : current);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setActionError(adminActionErrorMessage("原视频列表加载", loadError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSourceVideosLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, hasDashboardData, route, sourceVideoQuery, sourceVideoStatusFilter]);

  useEffect(() => {
    if (route !== "preprocess-jobs" && route !== "index-publish") {
      return;
    }

    let cancelled = false;
    setPreprocessJobsLoading(true);

    withAdminLoadTimeout(
      loadAdminPreprocessRouteData(client),
      "预处理队列加载"
    )
      .then(({ jobs }) => {
        if (!cancelled) {
          setActionError("");
          setData((current) => {
            if (!current) {
              pendingPreprocessJobsRef.current = jobs;
              return current;
            }

            pendingPreprocessJobsRef.current = null;
            return { ...current, jobs };
          });
          preprocessJobsPrefetchTokenRef.current = reloadToken;
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setActionError(adminActionErrorMessage("预处理队列加载", loadError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPreprocessJobsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, reloadToken, route]);

  useEffect(() => {
    if (route !== "preprocess-jobs" && route !== "index-publish") {
      return;
    }

    let cancelled = false;

    client.listIndexVersions()
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
    };
  }, [client, reloadToken, route]);

  useEffect(() => {
    if (route !== "doctor") {
      return;
    }

    let cancelled = false;

    client.runDoctor()
      .then((doctor) => {
        if (!cancelled) {
          setData((current) => current ? { ...current, doctor } : current);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setActionError(adminActionErrorMessage("系统检查加载", loadError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, reloadToken, route]);

  useEffect(() => {
    if (route !== "settings") {
      return;
    }

    let cancelled = false;

    client.getPathChecks()
      .then((pathChecks) => {
        if (!cancelled) {
          setData((current) => current ? { ...current, path_checks: pathChecks } : current);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setActionError(adminActionErrorMessage("路径校验加载", loadError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, reloadToken, route]);

  useEffect(() => {
    if (route !== "settings") {
      return;
    }

    let cancelled = false;

    withAdminLoadTimeout(
      client.getRuntimeSettings(),
      "运行时状态加载"
    )
      .then((runtime) => {
        if (!cancelled) {
          setData((current) => current ? { ...current, runtime } : current);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setActionError(adminActionErrorMessage("运行时状态加载", loadError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, reloadToken, route]);

  useEffect(() => {
    if (!data || route === "dashboard") {
      return;
    }

    if (metricsLoadingRef.current) {
      return;
    }

    let cancelled = false;
    metricsLoadingRef.current = true;

    client.getDashboardMetrics()
      .then((metrics) => {
        if (!cancelled) {
          setData((current) => current ? { ...current, metrics } : current);
        }
      })
      .catch(() => {
        // Metrics are supplemental; keep the page usable if SMB-backed stats are slow.
      })
      .finally(() => {
        metricsLoadingRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [client, data?.status.updated_at, reloadToken, route]);

  useEffect(() => {
    if (
      !hasDashboardData ||
      cutterUsersLoadingRef.current ||
      cutterUsersLoadedTokenRef.current === cutterUsersReloadToken
    ) {
      return;
    }

    let cancelled = false;
    cutterUsersLoadingRef.current = true;

    client.listCutterUsers()
      .then((result) => {
        if (!cancelled) {
          setCutterUsers(result);
          cutterUsersLoadedTokenRef.current = cutterUsersReloadToken;
        }
      })
      .catch(() => {
        // User data is prefetched for route speed; route-level loading handles visible errors.
      })
      .finally(() => {
        cutterUsersLoadingRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [client, cutterUsersReloadToken, hasDashboardData]);

  useEffect(() => {
    if (
      !hasDashboardData ||
      preprocessJobsPrefetchLoadingRef.current ||
      preprocessJobsPrefetchTokenRef.current === reloadToken
    ) {
      return;
    }

    let cancelled = false;
    preprocessJobsPrefetchLoadingRef.current = true;

    loadAdminPreprocessRouteData(client)
      .then(({ jobs }) => {
        if (!cancelled) {
          setData((current) => {
            if (!current) {
              pendingPreprocessJobsRef.current = jobs;
              return current;
            }

            pendingPreprocessJobsRef.current = null;
            return { ...current, jobs };
          });
          preprocessJobsPrefetchTokenRef.current = reloadToken;
        }
      })
      .catch(() => {
        // Preprocess jobs are prefetched for route speed; route-level loading handles visible errors.
      })
      .finally(() => {
        preprocessJobsPrefetchLoadingRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [client, hasDashboardData, reloadToken]);

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

    const refreshDashboardPanels = () => {
      if (dashboardPanelLoadingRef.current) {
        return;
      }

      dashboardPanelLoadingRef.current = true;
      loadAdminDashboardPanelData(client)
        .then((result) => {
          setData((current) => current ? mergeAdminDashboardPanelData(current, result) : current);
        })
        .catch(() => {
          // Dashboard panel refresh is background-only; keep the visible page stable.
        })
        .finally(() => {
          dashboardPanelLoadingRef.current = false;
        });
    };

    refreshDashboardPanels();
    const timer = window.setInterval(refreshDashboardPanels, ADMIN_DATA_AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [client, hasDashboardData, route]);

  useEffect(() => {
    if (!data || route !== "preprocess-jobs") {
      return;
    }

    const timer = window.setInterval(() => {
      if (preprocessJobsLoading) {
        return;
      }

      withAdminLoadTimeout(
        loadAdminPreprocessRouteData(client),
        "预处理队列刷新"
      )
        .then(({ jobs }) => {
          setActionError("");
          setData((current) => current ? { ...current, jobs } : current);
        })
        .catch((loadError) => {
          setActionError(adminActionErrorMessage("预处理队列刷新", loadError));
        });
    }, ADMIN_DATA_AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [client, data, preprocessJobsLoading, route]);

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

    let cancelled = false;
    setSourceDetailLoading(true);
    setSourceDetailError("");
    setSourceDetail(null);

    client.getSourceVideoDetail(request.sourceVideoId)
      .then((detail) => {
        if (!cancelled) {
          setSourceDetail(detail);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setSourceDetail(null);
          setSourceDetailError(sourceDetailLoadErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSourceDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, data?.source_videos, route, selectedSourceVideoId]);

  useEffect(() => {
    if (route !== "cutter-users") {
      return;
    }

    if (cutterUsers && cutterUsersLoadedTokenRef.current === cutterUsersReloadToken) {
      return;
    }

    if (cutterUsersLoadingRef.current) {
      return;
    }

    let cancelled = false;
    cutterUsersLoadingRef.current = true;
    client.listCutterUsers()
      .then((result) => {
        if (!cancelled) {
          setCutterUsers(result);
          cutterUsersLoadedTokenRef.current = cutterUsersReloadToken;
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setActionError(adminActionErrorMessage("剪辑师用户加载", loadError));
        }
      })
      .finally(() => {
        cutterUsersLoadingRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [client, cutterUsers, cutterUsersReloadToken, route]);

  const runAction = async (label: string, action: (client: AdminApiClient) => Promise<unknown>) => {
    setActionError("");
    setActionNotice(`${label}中...`);

    try {
      const result = await action(client);
      setActionNotice(formatActionNotice(label, result));
      setReloadToken((current) => current + 1);
    } catch (actionFailure) {
      setActionNotice("");
      setActionError(adminActionErrorMessage(label, actionFailure));
    }
  };

  const runSmartScan = async () => {
    setActionError("");
    setActionNotice("正在扫描新增素材、检查系统状态并刷新生产状态...");

    try {
      await client.scanSourceVideos();
      await client.runDoctor();
      const refreshed = await loadAdminDashboardData(client, { includeHeavy: false });
      const report = createAdminSmartScanReport(refreshed);
      setData((current) => current ? mergeAdminDashboardShellData(current, refreshed) : refreshed);
      setActionNotice(`扫描完成：${report.title}`);
    } catch (failure) {
      setActionNotice("");
      setActionError(adminActionErrorMessage("扫描新增素材", failure));
    }
  };

  const applySmartScanPrimaryAction = async (action: AdminSmartScanAction) => {
    if (action === "queue-unprocessed") {
      await runAction("加入预处理队列", (api) => api.queueUnprocessedVideos());
      return;
    }

    if (action === "start-preprocess") {
      await runAction("启动预处理", (api) => api.startPreprocessSupervisor());
      return;
    }

    if (action === "retry-failed") {
      await runAction("重试失败视频", (api) => api.retryFailedVideos());
      return;
    }

    if (action === "recover-processing") {
      await runAction("恢复卡住任务", (api) => api.recoverProcessingVideos());
      return;
    }

    if (action === "publish-index") {
      await runAction("发布到剪辑端", (api) => api.repairIndex());
      return;
    }

    if (action === "run-doctor") {
      window.location.hash = routeToHash("doctor");
      await runAction("运行系统检查", (api) => api.runDoctor());
    }
  };

  const actions: AdminActionHandlers = {
    sourceVideoQuery,
    sourceVideoStatusFilter,
    onInitializeLibrary: () => runAction("初始化素材库", (api) => api.initializeLibrary()),
    onScanSourceVideos: () => runAction("扫描源视频", (api) => api.scanSourceVideos()),
    onQueueUnprocessedVideos: () => runAction("加入预处理队列", (api) => api.queueUnprocessedVideos()),
    onRetryFailedVideos: () => runAction("重试失败视频", (api) => api.retryFailedVideos()),
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
      runAction("发布到剪辑端", (api) => api.publishSourceVideo(sourceVideoId)),
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
      runAction("启动预处理", (api) => api.startPreprocessSupervisor()),
    onStopPreprocessSupervisor: () =>
      runAction("暂停预处理", (api) => api.stopPreprocessSupervisor()),
    onRepairIndex: () => runAction("发布到剪辑端", (api) => api.repairIndex()),
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
    },
    onLoadMoreSourceVideos: async () => {
      if (!data || sourceVideosLoading || sourceVideosLoadingMore || !sourceVideosHasMore) {
        return;
      }

      const offset = data.source_videos.length;
      if (offset >= data.status.video_count) {
        return;
      }

      setActionError("");
      setSourceVideosLoadingMore(true);

      try {
        const nextSourceVideos = await withAdminLoadTimeout(
          client.listSourceVideos({
            offset,
            limit: ADMIN_SOURCE_VIDEO_INITIAL_LOAD_LIMIT,
            query: sourceVideoQuery,
            status: sourceVideoStatusFilter
          }),
          "继续加载原视频"
        );
        setSourceVideosHasMore(nextSourceVideos.length >= ADMIN_SOURCE_VIDEO_INITIAL_LOAD_LIMIT);
        setData((current) => current ? {
          ...current,
          source_videos: mergeAdminSourceVideoPages(current.source_videos, nextSourceVideos)
        } : current);
      } catch (loadError) {
        setActionError(adminActionErrorMessage("继续加载原视频", loadError));
      } finally {
        setSourceVideosLoadingMore(false);
      }
    },
    onExportDoctor: () => runAction("导出检查报告", (api) => api.exportDoctorReport())
  };

  const navItems = ADMIN_NAV_ITEMS.map((item) => ({
    label: item.label,
    icon: item.icon,
    href: routeToHash(item.route)
  }));

  return (
    <main className="admin-app" data-admin-web-ready={data ? "true" : "false"}>
      <MacWindow
        title={`MixLab V3 - 素材库管理端 / ${routeTitle(route)}`}
        meta={data ? indexStatusLabel(data.status.index_status) : "加载中"}
      >
        <div className="admin-shell">
          <Sidebar
            brand={{
              title: "MixLab Admin",
              subtitle: "公共素材库生产",
              mark: "ML",
              href: routeToHash("dashboard")
            }}
            items={navItems}
            active={routeTitle(route)}
            footer={
              data ? (
                <div className="admin-sidebar-footer">
                  <div className="admin-sidebar-runtime-line">
                    <span>公共库</span>
                    <strong>{data.status.root_path ? "已挂载" : "待配置"}</strong>
                  </div>
                  <div className="admin-sidebar-runtime-line">
                    <span>索引</span>
                    <strong>{data.indexes.current_version || "暂无索引"}</strong>
                  </div>
                  <div className="admin-sidebar-runtime-line">
                    <span>Doctor</span>
                    <strong>
                      {data.doctor.summary.fail > 0
                        ? `${data.doctor.summary.fail} 失败`
                        : data.doctor.summary.warn > 0
                          ? `${data.doctor.summary.warn} 警告`
                          : "通过"}
                    </strong>
                  </div>
                </div>
              ) : null
            }
          />
          <section className="admin-workspace">
            <UnifiedToolbar
              title="MixLab V3 - 公共素材库控制台"
              libraryLabel={data?.status.root_path ?? "公共素材库"}
              availableCountLabel={data ? `可搜索 ${data.status.ready_video_count} 个视频` : undefined}
              healthLabel={data?.doctor.summary.fail ? "需处理" : "健康"}
              actions={[]}
            />
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
                  {
                    detail: sourceDetailForRequest(
                      sourceDetail,
                      sourceDetailRequestForRoute(route, data, selectedSourceVideoId)
                    ),
                    loading: sourceDetailLoading,
                    error: sourceDetailError
                  },
                  cutterUsers,
                  {
                    sourceVideos: sourceVideosLoading,
                    sourceVideosMore: sourceVideosLoadingMore,
                    sourceVideosHasMore,
                    preprocessJobs: preprocessJobsLoading
                  },
                  {
                    loading: preprocessJobLogLoading,
                    error: preprocessJobLogError,
                    log: selectedPreprocessJobLog
                  }
                )
              ) : (
                <InspectorPanel title="加载中">
                  <p>正在读取素材库管理端数据</p>
                </InspectorPanel>
              )}
            </section>
          </section>
        </div>
      </MacWindow>
    </main>
  );
}
