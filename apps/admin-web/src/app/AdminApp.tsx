import { useEffect, useMemo, useState } from "react";
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
  type AdminDashboardData,
  type AdminSettingsConfigUpdate,
  type AdminSmartScanAction,
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

function createRuntimeClient() {
  const baseUrl = import.meta.env?.VITE_MIXLAB_ADMIN_API_BASE_URL;

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
    doctor: "健康诊断",
    "cutter-users": "剪辑师用户",
    settings: "设置"
  };

  return labels[route];
}

export const ADMIN_DATA_AUTO_REFRESH_INTERVAL_MS = 2_000;

const ALWAYS_AUTO_REFRESH_ROUTES = new Set<AdminRoute>([
  "dashboard",
  "preprocess-jobs"
]);

const PRODUCTION_AUTO_REFRESH_ROUTES = new Set<AdminRoute>([
  "source-detail"
]);

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

interface AdminActionHandlers {
  onInitializeLibrary: () => Promise<void>;
  onScanSourceVideos: () => Promise<void>;
  onQueueUnprocessedVideos: () => Promise<void>;
  onRetryFailedVideos: () => Promise<void>;
  onRunSmartScan: () => Promise<void>;
  onApplySmartScanPrimaryAction: (action: AdminSmartScanAction) => Promise<void>;
  onQueueSourceVideo: (sourceVideoId: string) => Promise<void>;
  onRetrySourceVideo: (sourceVideoId: string) => Promise<void>;
  onPublishSourceVideo: (sourceVideoId: string) => Promise<void>;
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
  onApproveCutterUser: (userId: string) => Promise<void>;
  onDisableCutterUser: (userId: string) => Promise<void>;
  onOpenSourceDetail: (sourceVideoId: string) => void;
  onExportDoctor: () => void;
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
    return `${label}完成：${result.source_video_id} 的公开说明已更新`;
  }

  if (isRecord(result) && "summary" in result) {
    const summary = (result as { summary?: { pass?: number; warn?: number; fail?: number } }).summary;
    return `${label}完成：通过 ${summary?.pass ?? 0}，警告 ${summary?.warn ?? 0}，失败 ${summary?.fail ?? 0}`;
  }

  return `${label}完成`;
}

function exportJson(fileName: string, data: unknown): void {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderPage(
  route: AdminRoute,
  data: AdminDashboardData,
  actions: AdminActionHandlers,
  sourceDetail: SourceDetailRenderState,
  cutterUsers: AdminCutterUsersResponse | null
) {
  if (route === "source-videos") {
    return (
      <SourceVideosPage
        data={data}
        onQueueSourceVideo={actions.onQueueSourceVideo}
        onRetrySourceVideo={actions.onRetrySourceVideo}
        onPublishSourceVideo={actions.onPublishSourceVideo}
        onUpdateSourceVideoMetadata={actions.onUpdateSourceVideoMetadata}
        onOpenSourceDetail={actions.onOpenSourceDetail}
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
        onRetryFailedVideos={actions.onRetryFailedVideos}
        onStartPreprocessSupervisor={actions.onStartPreprocessSupervisor}
        onStopPreprocessSupervisor={actions.onStopPreprocessSupervisor}
      />
    );
  }

  if (route === "index-publish") {
    return (
      <PreprocessJobsPage
        data={data}
        onRetryFailedVideos={actions.onRetryFailedVideos}
        onStartPreprocessSupervisor={actions.onStartPreprocessSupervisor}
        onStopPreprocessSupervisor={actions.onStopPreprocessSupervisor}
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
  const client = useMemo(createRuntimeClient, []);

  useEffect(() => {
    const listener = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);

  useEffect(() => {
    let cancelled = false;

    setError("");
    loadAdminDashboardData(client)
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(adminLoadErrorMessage(loadError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, reloadToken]);

  useEffect(() => {
    if (!data || !shouldAutoRefreshAdminData(route, data)) {
      return;
    }

    const timer = window.setInterval(() => {
      setReloadToken((current) => current + 1);
    }, ADMIN_DATA_AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [data, route]);

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

    let cancelled = false;
    client.listCutterUsers()
      .then((result) => {
        if (!cancelled) {
          setCutterUsers(result);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setActionError(adminActionErrorMessage("剪辑师用户加载", loadError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, cutterUsersReloadToken, route]);

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
    setActionNotice("智能扫描中：正在扫描素材来源、运行健康诊断并刷新生产状态...");

    try {
      await client.scanSourceVideos();
      await client.runDoctor();
      const refreshed = await loadAdminDashboardData(client);
      const report = createAdminSmartScanReport(refreshed);
      setData(refreshed);
      setActionNotice(`智能扫描完成：${report.title}`);
    } catch (failure) {
      setActionNotice("");
      setActionError(adminActionErrorMessage("智能扫描", failure));
    }
  };

  const applySmartScanPrimaryAction = async (action: AdminSmartScanAction) => {
    if (action === "queue-unprocessed") {
      await runAction("加入预处理队列", (api) => api.queueUnprocessedVideos());
      return;
    }

    if (action === "start-preprocess") {
      await runAction("启动预处理流水线", (api) => api.startPreprocessSupervisor());
      return;
    }

    if (action === "retry-failed") {
      await runAction("重试失败视频", (api) => api.retryFailedVideos());
      return;
    }

    if (action === "publish-index") {
      await runAction("发布待索引视频", (api) => api.repairIndex());
      return;
    }

    if (action === "run-doctor") {
      window.location.hash = routeToHash("doctor");
      await runAction("运行健康诊断", (api) => api.runDoctor());
    }
  };

  const actions: AdminActionHandlers = {
    onInitializeLibrary: () => runAction("初始化素材库", (api) => api.initializeLibrary()),
    onScanSourceVideos: () => runAction("扫描源视频", (api) => api.scanSourceVideos()),
    onQueueUnprocessedVideos: () => runAction("加入预处理队列", (api) => api.queueUnprocessedVideos()),
    onRetryFailedVideos: () => runAction("重试失败视频", (api) => api.retryFailedVideos()),
    onRunSmartScan: runSmartScan,
    onApplySmartScanPrimaryAction: applySmartScanPrimaryAction,
    onQueueSourceVideo: (sourceVideoId) =>
      runAction("处理此视频", (api) => api.queueSourceVideo(sourceVideoId)),
    onRetrySourceVideo: (sourceVideoId) =>
      runAction("重试此视频", (api) => api.retrySourceVideo(sourceVideoId)),
    onPublishSourceVideo: (sourceVideoId) =>
      runAction("发布此视频", (api) => api.publishSourceVideo(sourceVideoId)),
    onStartPreprocessSupervisor: () =>
      runAction("启动预处理流水线", (api) => api.startPreprocessSupervisor()),
    onStopPreprocessSupervisor: () =>
      runAction("暂停预处理流水线", (api) => api.stopPreprocessSupervisor()),
    onRepairIndex: () => runAction("修复索引", (api) => api.repairIndex()),
    onRunDoctor: () => runAction("运行健康诊断", (api) => api.runDoctor()),
    onTestAsrConfig: () => runAction("测试语音识别配置", (api) => api.testAsrConfig()),
    onSaveAdminSettings: (settings) =>
      runAction("保存设置", (api) => api.saveAdminSettings(settings)),
    onUpdateSourceVideoMetadata: (sourceVideoId, metadata) =>
      runAction("保存公开说明", (api) => api.updateSourceVideoMetadata(sourceVideoId, metadata)),
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
    onExportDoctor: () => {
      if (data) {
        exportJson(`mixlab-doctor-${data.doctor.generated_at.replaceAll(/[:\s]/g, "-")}.json`, data.doctor);
        setActionError("");
        setActionNotice("诊断报告已生成下载文件");
      }
    }
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
          <Sidebar items={navItems} active={routeTitle(route)} />
          <section className="admin-workspace">
            <UnifiedToolbar
              title="MixLab V3 - 素材库管理端"
              libraryLabel={data?.status.name ?? "主素材库"}
              healthLabel={data?.doctor.summary.fail ? "需处理" : "健康"}
              actions={[]}
            />
            {actionNotice || actionError ? (
              <div className={`admin-action-notice${actionError ? " is-error" : ""}`} role="status">
                {actionError || actionNotice}
              </div>
            ) : null}
            <section className="admin-content-split">
              {error ? (
                <InspectorPanel title="加载失败">
                  <p>{error}</p>
                </InspectorPanel>
              ) : data ? (
                renderPage(route, data, actions, {
                  detail: sourceDetailForRequest(
                    sourceDetail,
                    sourceDetailRequestForRoute(route, data, selectedSourceVideoId)
                  ),
                  loading: sourceDetailLoading,
                  error: sourceDetailError
                }, cutterUsers)
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
