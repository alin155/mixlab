import { useEffect, useMemo, useState } from "react";
import {
  InspectorPanel,
  MacWindow,
  Sidebar,
  UnifiedToolbar
} from "@mixlab/ui-foundation";
import {
  createAdminApiClient,
  createFixtureAdminApiClient,
  loadAdminDashboardData,
  type AdminActionResult,
  type AdminApiClient,
  type AdminDashboardData,
  type AdminSourceVideo,
  type AdminSourceVideoMetadataUpdate
} from "../api.ts";
import { DashboardPage } from "../features/dashboard/DashboardPage.tsx";
import { DoctorPage } from "../features/doctor/DoctorPage.tsx";
import { IndexPublishPage } from "../features/index-publish/IndexPublishPage.tsx";
import { LibrarySettingsPage } from "../features/library-settings/LibrarySettingsPage.tsx";
import { PreprocessJobsPage } from "../features/preprocess-jobs/PreprocessJobsPage.tsx";
import { SettingsPage } from "../features/settings/SettingsPage.tsx";
import { SourceVideosPage } from "../features/source-videos/SourceVideosPage.tsx";
import {
  ADMIN_NAV_ITEMS,
  routeFromHash,
  routeToHash,
  type AdminRoute
} from "./navigation.ts";

function createRuntimeClient() {
  const baseUrl = import.meta.env.VITE_MIXLAB_ADMIN_API_BASE_URL;

  return baseUrl
    ? createAdminApiClient({ base_url: baseUrl })
    : createFixtureAdminApiClient();
}

function routeTitle(route: AdminRoute): string {
  return ADMIN_NAV_ITEMS.find((item) => item.route === route)?.label ?? "仪表盘";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

interface AdminActionHandlers {
  onInitializeLibrary: () => Promise<void>;
  onScanSourceVideos: () => Promise<void>;
  onQueueUnprocessedVideos: () => Promise<void>;
  onRetryFailedVideos: () => Promise<void>;
  onRepairIndex: () => Promise<void>;
  onRunDoctor: () => Promise<void>;
  onTestAsrConfig: () => Promise<void>;
  onUpdateSourceVideoMetadata: (
    sourceVideoId: string,
    metadata: AdminSourceVideoMetadataUpdate
  ) => Promise<void>;
  onExportDoctor: () => void;
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
      typeof result.passed === "boolean" ? (result.passed ? "检测通过" : "检测未通过") : ""
    ].filter(Boolean);

    return `${label}完成${details.length ? `：${details.join("，")}` : ""}${result.message ? `。${result.message}` : ""}`;
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

function renderPage(route: AdminRoute, data: AdminDashboardData, actions: AdminActionHandlers) {
  if (route === "library-settings") {
    return (
      <LibrarySettingsPage
        data={data}
        onInitializeLibrary={actions.onInitializeLibrary}
        onScanSourceVideos={actions.onScanSourceVideos}
        onExportDoctor={actions.onExportDoctor}
      />
    );
  }

  if (route === "source-videos") {
    return (
      <SourceVideosPage
        data={data}
        onScanSourceVideos={actions.onScanSourceVideos}
        onQueueUnprocessedVideos={actions.onQueueUnprocessedVideos}
        onRetryFailedVideos={actions.onRetryFailedVideos}
        onUpdateSourceVideoMetadata={actions.onUpdateSourceVideoMetadata}
      />
    );
  }

  if (route === "preprocess-jobs") {
    return (
      <PreprocessJobsPage
        data={data}
        onQueueUnprocessedVideos={actions.onQueueUnprocessedVideos}
        onRetryFailedVideos={actions.onRetryFailedVideos}
      />
    );
  }

  if (route === "index-publish") {
    return (
      <IndexPublishPage
        data={data}
        onRepairIndex={actions.onRepairIndex}
        onRunDoctor={actions.onRunDoctor}
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
    return <SettingsPage data={data} onTestAsrConfig={actions.onTestAsrConfig} />;
  }

  return (
    <DashboardPage
      data={data}
      onScanSourceVideos={actions.onScanSourceVideos}
      onQueueUnprocessedVideos={actions.onQueueUnprocessedVideos}
      onRetryFailedVideos={actions.onRetryFailedVideos}
      onRunDoctor={actions.onRunDoctor}
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
          setError(loadError instanceof Error ? loadError.message : "管理端数据加载失败");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, reloadToken]);

  const runAction = async (label: string, action: (client: AdminApiClient) => Promise<unknown>) => {
    setActionError("");
    setActionNotice(`${label}中...`);

    try {
      const result = await action(client);
      setActionNotice(formatActionNotice(label, result));
      setReloadToken((current) => current + 1);
    } catch (actionFailure) {
      setActionNotice("");
      setActionError(actionFailure instanceof Error ? actionFailure.message : `${label}失败`);
    }
  };

  const actions: AdminActionHandlers = {
    onInitializeLibrary: () => runAction("初始化素材库", (api) => api.initializeLibrary()),
    onScanSourceVideos: () => runAction("扫描源视频", (api) => api.scanSourceVideos()),
    onQueueUnprocessedVideos: () => runAction("处理未处理视频", (api) => api.queueUnprocessedVideos()),
    onRetryFailedVideos: () => runAction("重试失败视频", (api) => api.retryFailedVideos()),
    onRepairIndex: () => runAction("修复索引", (api) => api.repairIndex()),
    onRunDoctor: () => runAction("运行 Doctor", (api) => api.runDoctor()),
    onTestAsrConfig: () => runAction("测试 ASR 配置", (api) => api.testAsrConfig()),
    onUpdateSourceVideoMetadata: (sourceVideoId, metadata) =>
      runAction("保存公开说明", (api) => api.updateSourceVideoMetadata(sourceVideoId, metadata)),
    onExportDoctor: () => {
      if (data) {
        exportJson(`mixlab-doctor-${data.doctor.generated_at.replaceAll(/[:\s]/g, "-")}.json`, data.doctor);
        setActionError("");
        setActionNotice("Doctor JSON 已生成下载文件");
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
      <MacWindow title={`MixLab V3 - 素材库管理端 / ${routeTitle(route)}`} meta={data?.status.index_status ?? "加载中"}>
        <div className="admin-shell">
          <Sidebar items={navItems} active={routeTitle(route)} />
          <section className="admin-workspace">
            <UnifiedToolbar
              title="MixLab V3 - 素材库管理端"
              libraryLabel={data?.status.root_path ?? "/Volumes/PublicLibrary"}
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
                renderPage(route, data, actions)
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
