import { Badge, Button, Card, InspectorPanel, type BadgeTone } from "@mixlab/ui-foundation";
import { useEffect, useMemo, useState } from "react";
import {
  CutterApiError,
  type CutterApiClient,
  type CutterCacheInventory,
  type CutterCacheInventoryTarget,
  type CutterCacheCleanResult,
  type CutterGovernanceAudit,
  type CutterGovernanceAuditEntry,
  type CutterReleaseCacheEvictResult,
  type CutterReleaseCachePins,
  type CutterRuntimeStatus,
  type CutterWorkspaceResidue,
  type CutterWorkspaceResidueCleanResult
} from "../../api.ts";

function describeCacheError(error: unknown): string {
  if (error instanceof CutterApiError) {
    return [error.code, error.message, error.remediation].filter(Boolean).join(" · ");
  }

  return error instanceof Error ? error.message : "缓存操作失败";
}
import {
  clearCutterLocalCache,
  cutterCachePercent,
  cutterLocalCacheSnapshot,
  cutterRuntimeCacheBytes,
  cutterUserDataStorageSnapshot,
  formatCutterCacheSize,
  type CutterLocalCacheSnapshot
} from "../../state/cutter-cache.ts";

function cacheStatusTone(tone: "ready" | "syncing" | "warning" | "failed"): BadgeTone {
  if (tone === "ready") {
    return "success";
  }

  if (tone === "syncing") {
    return "info";
  }

  return tone === "failed" ? "danger" : "warning";
}

function releaseStatus(runtimeStatus?: CutterRuntimeStatus): {
  tone: "ready" | "syncing" | "warning" | "failed";
  label: string;
} {
  const cache = runtimeStatus?.release_cache;
  if (!cache) {
    return { tone: "warning", label: "未启用" };
  }

  if (cache.sync_status === "failed") {
    return { tone: "failed", label: "同步失败" };
  }

  if (cache.sync_status === "syncing") {
    return { tone: "syncing", label: "同步中" };
  }

  if (cache.ready) {
    return { tone: "ready", label: "本机可用" };
  }

  return { tone: "warning", label: "待同步" };
}

function searchStatus(runtimeStatus?: CutterRuntimeStatus): {
  tone: "ready" | "syncing" | "warning" | "failed";
  label: string;
} {
  const backend = runtimeStatus?.search_backend;
  if (!backend) {
    return { tone: "warning", label: "待连接" };
  }

  if (!backend.healthy) {
    return { tone: "failed", label: backend.degraded ? "降级可用" : "不可用" };
  }

  return { tone: "ready", label: backend.degraded ? "降级可用" : "可用" };
}

function preflightStatus(runtimeStatus?: CutterRuntimeStatus): {
  tone: "ready" | "syncing" | "warning" | "failed";
  label: string;
} {
  const preflight = runtimeStatus?.source_video_preflight;
  if (!preflight) {
    return { tone: "warning", label: "待检查" };
  }

  if (preflight.status === "checking") {
    return { tone: "syncing", label: "检查中" };
  }

  if (preflight.status === "blocked") {
    return { tone: "failed", label: "有不可读源视频" };
  }

  if (preflight.status === "ready") {
    return { tone: "ready", label: "源视频可读" };
  }

  return { tone: "warning", label: "不可用" };
}

function cacheDetailRows(
  runtimeStatus: CutterRuntimeStatus | undefined,
  localStorageCache: CutterLocalCacheSnapshot,
  userDataCache: CutterLocalCacheSnapshot,
  releaseV2Enabled: boolean
): Array<{ label: string; value: string; hint?: string }> {
  const release = runtimeStatus?.release_cache;
  const local = runtimeStatus?.local_cache;
  const sourceVideoCache = local?.source_video_cache;
  const search = runtimeStatus?.search_backend;
  const preflight = runtimeStatus?.source_video_preflight;

  return [
    {
      label: "Release 缓存目录",
      value: release?.cache_root_path || "未启用",
      hint: release
        ? `${release.cached_release_count ?? release.cached_release_versions?.length ?? 0}/${release.max_cached_releases ?? "-"} 个版本`
        : undefined
    },
    {
      label: "当前 Release",
      value: release?.active_release_version || "同步中",
      hint: release?.message
    },
    {
      label: "搜索索引",
      value: search?.index_version || release?.search_index_version || "待生成",
      hint: search
        ? `${search.source_video_count} 条视频 · ${search.segment_count.toLocaleString("zh-CN")} 段 · ${search.response_ms ?? "-"}ms${search.last_error ? ` · ${search.last_error}` : ""}`
        : undefined
    },
    {
      label: "搜索索引缓存",
      value: formatCutterCacheSize(local?.searchd_cache_size_bytes ?? 0),
      hint: local?.searchd_cache_root_path
    },
    {
      label: "缩略图缓存",
      value: formatCutterCacheSize(local?.thumbnail_cache_size_bytes ?? 0),
      hint: local
        ? `${local.thumbnail_cache_checksum_entry_count ?? 0}/${local.thumbnail_cache_manifest_entry_count ?? 0} 个校验项`
        : undefined
    },
    {
      label: "原视频缓存",
      value: formatCutterCacheSize(sourceVideoCache?.size_bytes ?? 0),
      hint: sourceVideoCache
        ? `${sourceVideoCache.cached_video_count} 条视频 · ${sourceVideoCache.active_prefetch_count} 个预取中`
        : undefined
    },
    {
      label: "剪切临时区",
      value: formatCutterCacheSize(local?.cut_temp_cache.size_bytes ?? 0),
      hint: local
        ? `${local.cut_temp_cache.file_count} 个文件 · 上限 ${formatCutterCacheSize(local.cut_temp_cache.max_bytes)}`
        : undefined
    },
    {
      label: "源视频预检",
      value: preflight ? `${preflight.readable_count}/${preflight.checked_count} 可读` : "待检查",
      hint: preflight?.message
    },
    {
      label: "界面缓存",
      value: formatCutterCacheSize(localStorageCache.bytes),
      hint: `${localStorageCache.keys.length} 个界面偏好键（可清理）`
    },
    {
      label: "项目与待剪清单",
      value: "受保护",
      hint: `${userDataCache.keys.length} 个用户数据键；清除界面缓存不会删除`
    },
    ...(releaseV2Enabled
      ? [{
          label: "Release v2 能力",
          value: "已启用",
          hint: "本机引擎已声明 release_v2：可使用内容寻址发布缓存"
        }]
      : [])
  ];
}

const GOVERNANCE_AUDIT_OPERATION_LABELS: Record<string, string> = {
  cache_clean: "磁盘缓存清理",
  local_clip_clean: "本地素材清理",
  local_clip_force_delete: "强制删除本地素材",
  workspace_residue_clean: "工作区残留清理",
  release_cache_evict: "Release 缓存淘汰"
};

export function governanceAuditOperationLabel(operation: string): string {
  return GOVERNANCE_AUDIT_OPERATION_LABELS[operation] ?? operation;
}

export function governanceAuditSummary(entry: CutterGovernanceAuditEntry): string {
  const parts = [
    governanceAuditOperationLabel(entry.operation),
    entry.removed_count + " 项",
    formatCutterCacheSize(entry.freed_bytes)
  ];
  if (entry.skipped_count > 0) {
    parts.push("跳过 " + entry.skipped_count + " 项");
  }
  if (entry.errors.length > 0) {
    parts.push("错误 " + entry.errors.map((error) => error.code).join("、"));
  }
  return parts.join(" · ");
}

export function workspaceResidueSummary(residue: CutterWorkspaceResidue): string {
  const safe = residue.items.filter((item) => item.safe_to_delete).length;
  return "残留 " + residue.items.length + " 项（" + formatCutterCacheSize(residue.total_bytes) + "），其中 " + safe + " 项可安全清理";
}

export function releaseCachePinsSummary(pins: CutterReleaseCachePins): string {
  return "已缓存 " + (pins.pinned.length + pins.unpinned.length) + " 个版本，其中被引用 " + pins.pinned.length + " 个（上限 " + pins.max_cached_releases + "）";
}

export function cacheCleanupPreviewText(
  inventory: CutterCacheInventory,
  selectedTargetIds: readonly string[]
): string {
  const selected = inventory.targets.filter((target) => selectedTargetIds.includes(target.id));
  const expectedBytes = selected.reduce((sum, target) => sum + target.deletable_bytes, 0);
  return [
    `将清理 ${selected.length} 个磁盘缓存目标（${formatCutterCacheSize(expectedBytes)}）：${selected.map((target) => target.label).join("、")}。`,
    "项目、待剪清单、被引用的本地素材和未完成导出不会删除；被引用/被固定的缓存会被跳过。",
    "清理为一次性操作，需要服务端确认令牌；不会静默删除。"
  ].join("\n");
}

export function diskCleanResultSummary(result: CutterCacheCleanResult): string {
  const parts = ["已清理 " + result.cleaned.length + " 个目标，释放 " + formatCutterCacheSize(result.freed_bytes)];
  if (result.skipped.length > 0) {
    parts.push("跳过 " + result.skipped.length + " 个（" + result.skipped.map((item) => item.reason).join("、") + "）");
  }
  if (result.errors.length > 0) {
    parts.push("失败 " + result.errors.length + " 个（" + result.errors.map((item) => item.code).join("、") + "）");
  }
  return parts.join("；");
}

export function cacheClearPreviewText(input: {
  ui_key_count: number;
  ui_bytes: number;
  protected_key_count: number;
}): string {
  return [
    `将清除 ${input.ui_key_count} 个界面偏好键（${formatCutterCacheSize(input.ui_bytes)}）：显示、筛选、排序等本机偏好。`,
    `不会删除项目、待剪清单、任务归属、登录状态与 ${input.protected_key_count} 个用户数据键。`,
    "磁盘缓存（Release/搜索索引/缩略图/原视频/临时区）由本机服务管理，清理前需服务端预览接口。"
  ].join("\n");
}

function CacheStatCard({
  title,
  value,
  detail,
  percent,
  tone = "ready"
}: {
  title: string;
  value: string;
  detail: string;
  percent?: number;
  tone?: "ready" | "syncing" | "warning" | "failed";
}) {
  return (
    <Card className={`cutter-cache-stat is-${tone}`} bodyClassName="cutter-cache-stat-body ml-metric-card-body">
      <div className="cutter-cache-stat-summary ml-metric-summary">
        <span>{title}</span>
        <strong className="ml-metric-value">{value}</strong>
      </div>
      <p className="ml-metric-description">{detail}</p>
      {typeof percent === "number" ? (
        <div className="cutter-cache-meter ml-meter" aria-label={`${title} 使用率`}>
          <span className={`ml-meter-fill is-${tone}`} style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </Card>
  );
}

export function CacheManagementPage({
  runtimeStatus,
  releaseV2Enabled = false,
  client
}: {
  runtimeStatus?: CutterRuntimeStatus;
  /** Only true when the engine capability table explicitly advertises release_v2. */
  releaseV2Enabled?: boolean;
  /** Optional API client; when present the page enables disk-cache inventory/clean. */
  client?: Pick<
    CutterApiClient,
    | "getCacheInventory"
    | "cleanCache"
    | "getWorkspaceResidue"
    | "cleanWorkspaceResidue"
    | "getReleaseCachePins"
    | "evictReleaseCache"
    | "getGovernanceAudit"
  >;
}) {
  const [localStorageCache, setLocalStorageCache] = useState(() => cutterLocalCacheSnapshot());
  const [userDataCache] = useState(() => cutterUserDataStorageSnapshot());
  const [pendingClear, setPendingClear] = useState(false);
  const [clearNotice, setClearNotice] = useState("");
  const [clearError, setClearError] = useState("");
  const [inventory, setInventory] = useState<CutterCacheInventory | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState("");
  const [selectedCacheTargets, setSelectedCacheTargets] = useState<string[]>([]);
  const [pendingDiskClear, setPendingDiskClear] = useState(false);
  const [diskCleanResult, setDiskCleanResult] = useState<CutterCacheCleanResult | null>(null);
  const [diskCleanError, setDiskCleanError] = useState("");
  const [diskCleaning, setDiskCleaning] = useState(false);
  const [residue, setResidue] = useState<CutterWorkspaceResidue | null>(null);
  const [residueLoading, setResidueLoading] = useState(false);
  const [residueError, setResidueError] = useState("");
  const [selectedResidueIds, setSelectedResidueIds] = useState<string[]>([]);
  const [pendingResidueClean, setPendingResidueClean] = useState(false);
  const [residueCleanResult, setResidueCleanResult] = useState<CutterWorkspaceResidueCleanResult | null>(null);
  const [residueCleanError, setResidueCleanError] = useState("");
  const [residueCleaning, setResidueCleaning] = useState(false);
  const [releasePins, setReleasePins] = useState<CutterReleaseCachePins | null>(null);
  const [releasePinsLoading, setReleasePinsLoading] = useState(false);
  const [releasePinsError, setReleasePinsError] = useState("");
  const [selectedReleaseVersions, setSelectedReleaseVersions] = useState<string[]>([]);
  const [pendingEvict, setPendingEvict] = useState(false);
  const [evictResult, setEvictResult] = useState<CutterReleaseCacheEvictResult | null>(null);
  const [evictError, setEvictError] = useState("");
  const [evicting, setEvicting] = useState(false);
  const [audit, setAudit] = useState<CutterGovernanceAudit | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [cacheSnapshotReady, setCacheSnapshotReady] = useState(() => Boolean(runtimeStatus) && cutterRuntimeCacheBytes(runtimeStatus) > 0);
  useEffect(() => {
    if (!runtimeStatus) {
      setCacheSnapshotReady(false);
      return;
    }
    if (cutterRuntimeCacheBytes(runtimeStatus) > 0) {
      setCacheSnapshotReady(true);
      return;
    }
    const timer = window.setTimeout(() => setCacheSnapshotReady(true), 5000);
    return () => window.clearTimeout(timer);
  }, [runtimeStatus]);

  const release = runtimeStatus?.release_cache;
  const local = runtimeStatus?.local_cache;
  const releaseState = releaseStatus(runtimeStatus);
  const searchState = searchStatus(runtimeStatus);
  const preflightState = preflightStatus(runtimeStatus);
  const sourceVideoCache = local?.source_video_cache;
  const totalRuntimeCacheBytes = cutterRuntimeCacheBytes(runtimeStatus);
  const detailRows = useMemo(
    () => cacheDetailRows(runtimeStatus, localStorageCache, userDataCache, releaseV2Enabled),
    [runtimeStatus, localStorageCache, userDataCache, releaseV2Enabled]
  );

  const clearPreview = cacheClearPreviewText({
    ui_key_count: localStorageCache.keys.length,
    ui_bytes: localStorageCache.bytes,
    protected_key_count: userDataCache.keys.length
  });

  const inventorySize = (prefixes: string[]) => {
    const target = inventory?.targets.find((candidate) =>
      prefixes.some((prefix) => candidate.label.includes(prefix))
    );
    return target ? target.size_bytes || target.deletable_bytes : 0;
  };
  const effectiveRelease = release?.cache_size_bytes || inventorySize(["Release"]);
  const effectiveSearch = (local?.searchd_cache_size_bytes ?? 0) || inventorySize(["搜索索引"]);
  const effectiveThumbnails = (local?.thumbnail_cache_size_bytes ?? 0) || inventorySize(["缩略图"]);
  const effectiveSourceVideos = (sourceVideoCache?.size_bytes ?? 0) || inventorySize(["源视频", "原视频"]);
  const effectiveCutTemp = (local?.cut_temp_cache.size_bytes ?? 0) || inventorySize(["剪切临时"]);
  const effectiveTotal = Math.max(
    totalRuntimeCacheBytes,
    inventory?.targets.reduce((sum, target) => sum + target.size_bytes, 0) ?? 0
  );

  function handleClearLocalStorageCache() {
    try {
      clearCutterLocalCache();
      const next = cutterLocalCacheSnapshot();
      setLocalStorageCache(next);
      setClearError("");
      setClearNotice(
        `已清除界面缓存，释放 ${formatCutterCacheSize(localStorageCache.bytes)}；剩余 ${next.keys.length} 个界面偏好键，项目/待剪清单/登录状态未受影响。`
      );
    } catch (error) {
      setClearNotice("");
      setClearError(error instanceof Error ? error.message : "清除界面缓存失败，请重试");
    } finally {
      setPendingClear(false);
    }
  }

  function handleRefreshLocalStorageCache() {
    setLocalStorageCache(cutterLocalCacheSnapshot());
    setClearError("");
    setClearNotice("已刷新界面缓存明细；磁盘缓存数据由本机服务上报，建议在服务重连后再核对。");
  }

  async function loadCacheInventory() {
    if (!client) {
      return;
    }
    setInventoryLoading(true);
    setInventoryError("");
    try {
      const next = await client.getCacheInventory({
        include: ["searchd", "thumbnail", "source_video", "cut_temp", "release"]
      });
      setInventory(next);
      setSelectedCacheTargets(
        next.targets.filter((target) => target.deletable && target.writable).map((target) => target.id)
      );
      setPendingDiskClear(false);
    } catch (error) {
      setInventoryError(describeCacheError(error));
    } finally {
      setInventoryLoading(false);
    }
  }

  async function loadWorkspaceResidue() {
    if (!client) {
      return;
    }
    setResidueLoading(true);
    setResidueError("");
    try {
      const next = await client.getWorkspaceResidue();
      setResidue(next);
      setSelectedResidueIds(next.items.filter((item) => item.safe_to_delete).map((item) => item.id));
      setPendingResidueClean(false);
    } catch (error) {
      setResidueError(describeCacheError(error));
    } finally {
      setResidueLoading(false);
    }
  }

  async function handleConfirmResidueClean() {
    if (!client || !residue) {
      return;
    }
    setResidueCleaning(true);
    setResidueCleanError("");
    setResidueCleanResult(null);
    try {
      const selected = residue.items.filter((item) => selectedResidueIds.includes(item.id));
      const result = await client.cleanWorkspaceResidue({
        ids: selected.map((item) => item.id),
        confirm_token: residue.confirm_token,
        expected_bytes: selected.reduce((sum, item) => sum + item.size_bytes, 0)
      });
      setResidueCleanResult(result);
      setPendingResidueClean(false);
      await loadWorkspaceResidue();
    } catch (error) {
      setResidueCleanError(describeCacheError(error));
    } finally {
      setResidueCleaning(false);
    }
  }

  async function loadGovernanceAudit() {
    if (!client) {
      return;
    }
    setAuditLoading(true);
    setAuditError("");
    try {
      setAudit(await client.getGovernanceAudit(50));
    } catch (error) {
      setAuditError(describeCacheError(error));
    } finally {
      setAuditLoading(false);
    }
  }

  async function loadReleaseCachePins() {
    if (!client) {
      return;
    }
    setReleasePinsLoading(true);
    setReleasePinsError("");
    try {
      const next = await client.getReleaseCachePins();
      setReleasePins(next);
      setSelectedReleaseVersions(
        next.unpinned
          .filter((version) => version.version !== next.active_release_version && (version.referenced_by?.length ?? 0) === 0)
          .map((version) => version.version)
      );
      setPendingEvict(false);
    } catch (error) {
      setReleasePinsError(describeCacheError(error));
    } finally {
      setReleasePinsLoading(false);
    }
  }

  async function handleConfirmEvict() {
    if (!client || !releasePins) {
      return;
    }
    setEvicting(true);
    setEvictError("");
    setEvictResult(null);
    try {
      const selected = releasePins.unpinned.filter((version) => selectedReleaseVersions.includes(version.version));
      const result = await client.evictReleaseCache({
        versions: selected.map((version) => version.version),
        confirm_token: releasePins.confirm_token,
        expected_bytes: selected.reduce((sum, version) => sum + version.size_bytes, 0)
      });
      setEvictResult(result);
      setPendingEvict(false);
      await loadReleaseCachePins();
    } catch (error) {
      setEvictError(describeCacheError(error));
    } finally {
      setEvicting(false);
    }
  }

  async function handleConfirmDiskClean() {
    if (!client || !inventory) {
      return;
    }
    setDiskCleaning(true);
    setDiskCleanError("");
    setDiskCleanResult(null);
    try {
      const selected = inventory.targets.filter((target) => selectedCacheTargets.includes(target.id));
      const expectedBytes = selected.reduce((sum, target) => sum + target.deletable_bytes, 0);
      const result = await client.cleanCache({
        targets: selectedCacheTargets,
        confirm_token: inventory.confirm_token,
        expected_bytes: expectedBytes
      });
      setDiskCleanResult(result);
      setPendingDiskClear(false);
      await loadCacheInventory();
    } catch (error) {
      setDiskCleanError(describeCacheError(error));
    } finally {
      setDiskCleaning(false);
    }
  }

  function toggleCacheTarget(target: CutterCacheInventoryTarget) {
    if (!target.deletable || !target.writable) {
      return;
    }
    setSelectedCacheTargets((current) =>
      current.includes(target.id)
        ? current.filter((id) => id !== target.id)
        : [...current, target.id]
    );
  }

  useEffect(() => {
    if (client) {
      void loadCacheInventory();
      void loadWorkspaceResidue();
      void loadReleaseCachePins();
      void loadGovernanceAudit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  if (!cacheSnapshotReady || !runtimeStatus) {
    return (
      <section className="cutter-page cutter-cache-management cutter-operational-page ml-workbench-page ml-workbench-page--fluid" data-page="cache-management">
        <div className="cutter-page-main ml-workbench-main">
          <header className="cutter-page-header ml-workbench-header">
            <div>
              <h1 className="ml-page-title">缓存管理</h1>
              <p className="ml-page-description">正在读取缓存，请稍候…</p>
            </div>
          </header>
          <Card className="cutter-cache-panel ml-panel-card" title="缓存分类" subtitle="正在读取缓存…">
            <div className="cutter-cache-skeleton" aria-label="正在读取缓存">
              {Array.from({ length: 6 }).map((_, index) => (
                <div className="cutter-cache-skeleton-row" key={index}>
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section className="cutter-page cutter-cache-management cutter-operational-page ml-workbench-page ml-workbench-page--fluid" data-page="cache-management">
      <div className="cutter-page-main ml-workbench-main ml-workbench-main--rows-dashboard" style={{ gridTemplateRows: "auto auto auto minmax(0, 1fr)" }}>
        <header className="cutter-page-header cutter-cache-header ml-workbench-header">
          <div>
            <h1 className="ml-page-title">缓存管理</h1>
            <p className="ml-page-description">
              查看本机缓存、搜索索引、源视频预检和剪切临时区状态。清除界面缓存只清理显示与筛选偏好，不会删除项目、待剪清单、任务归属或登录状态。
            </p>
          </div>
          <Badge tone={cacheStatusTone(releaseState.tone)}>{releaseState.label}</Badge>
        </header>

        <section className="cutter-cache-summary ml-data-strip" aria-label="缓存摘要">
          <span>运行缓存 <strong>{formatCutterCacheSize(effectiveTotal)}</strong></span>
          <span>界面缓存 <strong>{formatCutterCacheSize(localStorageCache.bytes)}</strong></span>
          <span>临时残留 <strong>{residue?.items.length ?? 0}</strong></span>
          <Badge tone={cacheStatusTone(releaseState.tone)}>{releaseState.label}</Badge>
        </section>

        <Card
          className="cutter-cache-panel ml-panel-card"
          bodyFlush
          bodyClassName="cutter-cache-category-body"
          title="缓存分类"
          subtitle="清理前会再次确认；项目、被引用素材与未完成导出不会删除。"
          actions={
            <Button type="button" variant="secondary" size="sm" onClick={() => document.getElementById("cache-cleanup")?.scrollIntoView({ block: "start" })}>
              预览清理
            </Button>
          }
        >
          <div className="cutter-cache-categories" role="table" aria-label="缓存分类">
            <div className="cutter-cache-category-row is-head" role="row">
              <span role="columnheader">类型</span>
              <span role="columnheader">占用</span>
              <span role="columnheader">说明</span>
              <span role="columnheader">操作</span>
            </div>
            {[
              {
                label: "运行缓存",
                size: effectiveTotal,
                detail: "Release、搜索索引、缩略图、原视频与剪切临时区合计"
              },
              {
                label: "Release 缓存",
                size: effectiveRelease,
                detail: release?.active_release_version || "等待同步"
              },
              {
                label: "搜索索引",
                size: effectiveSearch,
                detail: runtimeStatus?.search_backend?.label || "本地 searchd 索引，可重建"
              },
              {
                label: "缩略图缓存",
                size: effectiveThumbnails,
                detail: "可重新生成；清理会保留 manifest"
              },
              {
                label: "原视频缓存",
                size: effectiveSourceVideos,
                detail: "公共素材本地副本"
              },
              {
                label: "剪切临时区",
                size: effectiveCutTemp,
                detail: "中断残留，可安全清理"
              },
              {
                label: "界面缓存",
                size: localStorageCache.bytes,
                detail: "仅清理界面偏好，不影响项目与登录"
              }
            ].map((row) => (
              <div className="cutter-cache-category-row" role="row" key={row.label}>
                <strong role="cell">{row.label}</strong>
                <span role="cell">{formatCutterCacheSize(row.size)}</span>
                <span role="cell">{row.detail}</span>
                <span role="cell">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => document.getElementById("cache-cleanup")?.scrollIntoView({ block: "start" })}
                  >
                    查看
                  </Button>
                </span>
              </div>
            ))}
          </div>
        </Card>

        <section className="cutter-cache-panels ml-panel-grid ml-scroll-region">
          <div id="cache-cleanup" style={{ gridColumn: "1 / -1" }}>
          {client ? (
            <Card
              className="cutter-cache-panel ml-panel-card"
              bodyFlush
              bodyClassName="cutter-cache-panel-body"
              title="清理操作"
              subtitle="先预览再确认；需要本机服务生成一次性确认令牌。项目、被引用素材与未完成导出不会被删除。"
              actions={
                <div className="ml-control-cluster">
                  <Button type="button" variant="ghost" size="sm" onClick={() => void loadCacheInventory()} disabled={inventoryLoading}>
                    刷新清单
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={inventoryLoading || selectedCacheTargets.length === 0}
                    onClick={() => {
                      void loadCacheInventory().then(() => setPendingDiskClear(true));
                    }}
                  >
                    预览清理（{selectedCacheTargets.length}）
                  </Button>
                </div>
              }
            >
              {inventoryLoading ? <p className="ml-metric-description">正在读取磁盘缓存清单…</p> : null}
              {inventoryError ? (
                <div className="ml-empty-panel ml-empty-panel--plain" role="alert">
                  <strong>磁盘缓存清单读取失败</strong>
                  <span>{inventoryError}</span>
                  <Button type="button" variant="secondary" size="sm" onClick={() => void loadCacheInventory()}>
                    重试
                  </Button>
                </div>
              ) : null}
              {inventory ? (
                <div className="cutter-cache-disk-body">
                  <ul className="cutter-cache-disk-targets">
                    {inventory.targets.map((target) => (
                      <li key={target.id}>
                        <label className="cutter-cache-disk-target">
                          <input
                            type="checkbox"
                            checked={selectedCacheTargets.includes(target.id)}
                            disabled={!target.deletable || !target.writable || diskCleaning}
                            onChange={() => toggleCacheTarget(target)}
                          />
                          <span className="cutter-cache-disk-target-main" title={target.path}>
                            <span className="cutter-cache-disk-target-title">
                              <strong>{target.label}</strong>
                              <span>{formatCutterCacheSize(target.deletable_bytes)}</span>
                              {!target.writable ? <Badge tone="warning">不可写</Badge> : null}
                              {!target.deletable ? <Badge tone="info">受保护</Badge> : null}
                            </span>
                            {target.reason ? <span className="cutter-cache-disk-target-reason">{target.reason}</span> : null}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {inventory.protected.length > 0 ? (
                    <p className="ml-metric-description">
                      保护项：{inventory.protected.map((item) => item.title + "（" + item.reason + "）").join("；")}
                    </p>
                  ) : null}
                  {inventory.warnings.length > 0 ? (
                    <p className="ml-metric-description" role="status">
                      {inventory.warnings.map((warning) => warning.code + "：" + warning.message).join("；")}
                    </p>
                  ) : null}
                  {pendingDiskClear ? (
                    <div className="ml-empty-panel ml-empty-panel--plain" role="alertdialog" aria-label="确认清理磁盘缓存">
                      <strong>确认清理磁盘缓存？</strong>
                      <span style={{ whiteSpace: "pre-line" }}>
                        {cacheCleanupPreviewText(inventory, selectedCacheTargets)}
                      </span>
                      <div className="ml-control-cluster">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setPendingDiskClear(false)}>
                          取消
                        </Button>
                        <Button type="button" variant="danger" size="sm" onClick={() => void handleConfirmDiskClean()} disabled={diskCleaning}>
                          {diskCleaning ? "清理中…" : "确认清理"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {diskCleanResult ? (
                    <p className="cutter-cache-clear-notice" role="status">
                      {diskCleanResultSummary(diskCleanResult)}
                    </p>
                  ) : null}
                  {diskCleanError ? (
                    <div className="ml-empty-panel ml-empty-panel--plain" role="alert">
                      <strong>磁盘缓存清理失败</strong>
                      <span>{diskCleanError}</span>
                      <Button type="button" variant="secondary" size="sm" onClick={() => void loadCacheInventory()}>
                        刷新后重试
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          ) : null}
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            {client ? (
              <Card
                className="cutter-cache-panel ml-panel-card"
                bodyFlush
                bodyClassName="cutter-cache-panel-body"
                title="治理操作记录"
                subtitle="仅记录最近 50 次清理/淘汰操作，不支持文件恢复；写入失败不影响清理本身。"
                actions={
                  <Button type="button" variant="ghost" size="sm" onClick={() => void loadGovernanceAudit()} disabled={auditLoading}>
                    刷新记录
                  </Button>
                }
              >
                {auditLoading ? <p className="ml-metric-description">正在读取治理操作记录…</p> : null}
                {auditError ? (
                  <div className="ml-empty-panel ml-empty-panel--plain" role="alert">
                    <strong>治理操作记录读取失败</strong>
                    <span>{auditError}</span>
                    <Button type="button" variant="secondary" size="sm" onClick={() => void loadGovernanceAudit()}>重启读取</Button>
                  </div>
                ) : null}
                {audit ? (
                  audit.entries.length === 0 ? (
                    <p className="ml-metric-description">暂无治理操作记录；执行清理/淘汰后会在这里留下审计记录。</p>
                  ) : (
                    <ul className="cutter-governance-audit-list">
                      {audit.entries.map((entry, index) => (
                        <li key={entry.at + "-" + index}>
                          <strong>{governanceAuditOperationLabel(entry.operation)}</strong>
                          <span>{governanceAuditSummary(entry)}</span>
                          <span className="ml-metric-description">
                            {new Date(entry.at).toLocaleString("zh-CN")} · 耗时 {entry.duration_ms}ms · 结果 {entry.result}
                          </span>
                          {entry.errors.map((error) => (
                            <span key={error.code} className="ml-metric-description">错误 {error.code}：{error.message}</span>
                          ))}
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
                {audit?.audit_error ? (
                  <p className="ml-metric-description" role="status">审计写入警告：{audit.audit_error}</p>
                ) : null}
              </Card>
            ) : null}
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            {client ? (
              <Card
                className="cutter-cache-panel ml-panel-card"
                bodyFlush
                bodyClassName="cutter-cache-panel-body"
                title="工作区残留与 Release 缓存"
                subtitle="残留仅删除失败/中断临时文件与未完成导出；Release 缓存淘汰会保护被作品引用的版本。"
              >
                {residueLoading ? <p className="ml-metric-description">正在扫描工作区残留…</p> : null}
                {residueError ? (
                  <div className="ml-empty-panel ml-empty-panel--plain" role="alert">
                    <strong>工作区残留扫描失败</strong>
                    <span>{residueError}</span>
                    <Button type="button" variant="secondary" size="sm" onClick={() => void loadWorkspaceResidue()}>重试</Button>
                  </div>
                ) : null}
                {residue ? (
                  <section aria-label="工作区残留">
                    <strong>工作区残留</strong>
                    <span className="ml-metric-description">{workspaceResidueSummary(residue)}</span>
                    <ul>
                      {residue.items.map((item) => (
                        <li key={item.id}>
                          <label>
                            <input
                              type="checkbox"
                              checked={selectedResidueIds.includes(item.id)}
                              disabled={!item.safe_to_delete || residueCleaning}
                              onChange={() => setSelectedResidueIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}
                            />
                            <span>{item.kind} · {formatCutterCacheSize(item.size_bytes)} · {item.path}{item.reason ? "（" + item.reason + "）" : ""}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <div className="ml-control-cluster">
                      <Button type="button" variant="ghost" size="sm" onClick={() => void loadWorkspaceResidue()}>刷新扫描</Button>
                      <Button type="button" variant="secondary" size="sm" disabled={residueCleaning || selectedResidueIds.length === 0} onClick={() => setPendingResidueClean(true)}>
                        预览清理（{selectedResidueIds.length}）
                      </Button>
                    </div>
                    {pendingResidueClean ? (
                      <div className="ml-empty-panel ml-empty-panel--plain" role="alertdialog" aria-label="确认清理工作区残留">
                        <strong>确认清理选中的工作区残留？</strong>
                        <span>只删除选中的临时/未完成文件；项目成片与引用文件不会被删除。</span>
                        <div className="ml-control-cluster">
                          <Button type="button" variant="ghost" size="sm" onClick={() => setPendingResidueClean(false)}>取消</Button>
                          <Button type="button" variant="danger" size="sm" onClick={() => void handleConfirmResidueClean()} disabled={residueCleaning}>
                            {residueCleaning ? "清理中…" : "确认清理"}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {residueCleanResult ? <p role="status">{"已清理 " + residueCleanResult.removed.length + " 项残留，释放 " + formatCutterCacheSize(residueCleanResult.freed_bytes)}</p> : null}
                    {residueCleanError ? <p role="alert">{residueCleanError}</p> : null}
                  </section>
                ) : null}
                {releasePinsLoading ? <p className="ml-metric-description">正在读取 Release 缓存 pin 状态…</p> : null}
                {releasePinsError ? (
                  <div className="ml-empty-panel ml-empty-panel--plain" role="alert">
                    <strong>Release 缓存读取失败</strong>
                    <span>{releasePinsError}</span>
                    <Button type="button" variant="secondary" size="sm" onClick={() => void loadReleaseCachePins()}>重试</Button>
                  </div>
                ) : null}
                {releasePins ? (
                  <section aria-label="Release 缓存管理">
                    <strong>Release 缓存</strong>
                    <span className="ml-metric-description">{releaseCachePinsSummary(releasePins)}</span>
                    <ul>
                      {releasePins.unpinned.map((version) => {
                        const active = version.version === releasePins.active_release_version;
                        const referenced = (version.referenced_by?.length ?? 0) > 0;
                        return (
                          <li key={version.version}>
                            <label>
                              <input
                                type="checkbox"
                                checked={selectedReleaseVersions.includes(version.version)}
                                disabled={active || referenced || evicting}
                                onChange={() => setSelectedReleaseVersions((current) => current.includes(version.version) ? current.filter((item) => item !== version.version) : [...current, version.version])}
                              />
                              <span>{version.version} · {formatCutterCacheSize(version.size_bytes)}{active ? "（当前 active，不可淘汰）" : ""}{referenced ? "（被作品引用，不可淘汰）" : ""}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="ml-control-cluster">
                      <Button type="button" variant="ghost" size="sm" onClick={() => void loadReleaseCachePins()}>刷新 pin 状态</Button>
                      <Button type="button" variant="secondary" size="sm" disabled={evicting || selectedReleaseVersions.length === 0} onClick={() => setPendingEvict(true)}>
                        预览淘汰（{selectedReleaseVersions.length}）
                      </Button>
                    </div>
                    {pendingEvict ? (
                      <div className="ml-empty-panel ml-empty-panel--plain" role="alertdialog" aria-label="确认淘汰 Release 缓存">
                        <strong>确认淘汰选中的 Release 缓存版本？</strong>
                        <span>被作品引用或当前 active 的版本会被阻止，不会静默删除；仅删除选中的缓存版本目录。</span>
                        <div className="ml-control-cluster">
                          <Button type="button" variant="ghost" size="sm" onClick={() => setPendingEvict(false)}>取消</Button>
                          <Button type="button" variant="danger" size="sm" onClick={() => void handleConfirmEvict()} disabled={evicting}>
                            {evicting ? "淘汰中…" : "确认淘汰"}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {evictResult ? <p role="status">{"已淘汰 " + evictResult.evicted.length + " 个版本，释放 " + formatCutterCacheSize(evictResult.freed_bytes) + (evictResult.blocked.length > 0 ? "；阻止 " + evictResult.blocked.length + " 个（" + evictResult.blocked.map((item) => item.reason).join("、") + "）" : "")}</p> : null}
                    {evictError ? <p role="alert">{evictError}</p> : null}
                  </section>
                ) : null}
              </Card>
            ) : null}
          </div>

          <Card
            className="cutter-cache-panel ml-panel-card"
            bodyFlush
            bodyClassName="cutter-cache-panel-body"
            title="测试结果"
            subtitle="用于定位启动慢、搜索慢、剪切失败分别卡在哪一层。"
          >
            <div className="ml-data-list ml-data-list--grid cutter-cache-check-list">
              <div className="ml-data-row ml-data-row--check cutter-cache-check-row">
                <Badge tone={cacheStatusTone(runtimeStatus?.api_ready ? "ready" : "failed")}>
                  {runtimeStatus?.api_ready ? "正常" : "异常"}
                </Badge>
                <strong>本机服务</strong>
                <p>{runtimeStatus?.mode_label || "待连接本机服务"}</p>
              </div>
              <div className="ml-data-row ml-data-row--check cutter-cache-check-row">
                <Badge tone={cacheStatusTone(releaseState.tone)}>{releaseState.label}</Badge>
                <strong>Release 缓存</strong>
                <p>{release?.message || "等待 release 同步状态"}</p>
              </div>
              <div className="ml-data-row ml-data-row--check cutter-cache-check-row">
                <Badge tone={cacheStatusTone(searchState.tone)}>{searchState.label}</Badge>
                <strong>搜索索引</strong>
                <p>{runtimeStatus?.search_backend?.message || "等待搜索服务状态"}</p>
              </div>
              <div className="ml-data-row ml-data-row--check cutter-cache-check-row">
                <Badge tone={cacheStatusTone(preflightState.tone)}>{preflightState.label}</Badge>
                <strong>源视频预检</strong>
                <p>{runtimeStatus?.source_video_preflight?.message || "等待源视频可读性检查"}</p>
              </div>
              <div className="ml-data-row ml-data-row--check cutter-cache-check-row">
                <Badge tone={cacheStatusTone(sourceVideoCache?.last_error ? "warning" : "ready")}>
                  {sourceVideoCache?.active_prefetch_count ? "预取中" : "可用"}
                </Badge>
                <strong>原视频缓存</strong>
                <p>
                  {sourceVideoCache
                    ? `${sourceVideoCache.cached_video_count} 条视频已缓存，本机剪切会优先读取缓存。`
                    : "等待源视频缓存状态"}
                </p>
              </div>
            </div>
          </Card>

          <Card
            className="cutter-cache-panel cutter-cache-detail-panel ml-panel-card"
            bodyFlush
            bodyClassName="cutter-cache-panel-body"
            title="缓存明细"
            actions={
              <div className="ml-control-cluster">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRefreshLocalStorageCache}
                >
                  刷新明细
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setClearNotice("");
                    setClearError("");
                    setPendingClear(true);
                  }}
                >
                  清除界面缓存
                </Button>
              </div>
            }
          >
            {pendingClear ? (
              <div className="cutter-cache-clear-confirm ml-empty-panel ml-empty-panel--plain" role="alertdialog" aria-label="确认清除界面缓存">
                <strong>确认清除界面缓存？</strong>
                <span className="cutter-cache-clear-preview" style={{ whiteSpace: "pre-line" }}>{clearPreview}</span>
                <div className="ml-control-cluster">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPendingClear(false)}>
                    取消
                  </Button>
                  <Button type="button" variant="danger" size="sm" onClick={handleClearLocalStorageCache}>
                    确认清除
                  </Button>
                </div>
              </div>
            ) : null}
            {clearNotice ? (
              <p className="cutter-cache-clear-notice" role="status">
                {clearNotice}
              </p>
            ) : null}
            {clearError ? (
              <div className="cutter-cache-clear-error ml-empty-panel ml-empty-panel--plain" role="alert">
                <strong>清除失败</strong>
                <span>{clearError}</span>
                <Button type="button" variant="secondary" size="sm" onClick={handleClearLocalStorageCache}>
                  重试
                </Button>
              </div>
            ) : null}
            <dl className="ml-data-list ml-data-list--grid ml-data-list--stacked-detail cutter-cache-detail-list">
              {detailRows.map((row) => (
                <div className="ml-data-row ml-data-row--wide-detail cutter-cache-detail-row" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>
                    <strong title={row.value}>{row.value}</strong>
                    {row.hint ? <span title={row.hint}>{row.hint}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>
      </div>

      <InspectorPanel
        title="缓存位置"
        subtitle="Cache Root"
        className="ml-inspector--workbench ml-inspector--operational ml-inspector--stacked-body ml-workbench-inspector cutter-operational-inspector cutter-cache-inspector"
      >
        <section className="cutter-cache-location-section ml-detail-section">
          <h3 className="ml-detail-section-title">Release</h3>
          <p className="ml-detail-section-copy">{release?.cache_root_path || "未启用"}</p>
        </section>
        <section className="cutter-cache-location-section ml-detail-section">
          <h3 className="ml-detail-section-title">搜索索引</h3>
          <p className="ml-detail-section-copy">{local?.searchd_cache_root_path || "未启用"}</p>
        </section>
        <section className="cutter-cache-location-section ml-detail-section">
          <h3 className="ml-detail-section-title">缩略图</h3>
          <p className="ml-detail-section-copy">{local?.thumbnail_cache_root_path || "未启用"}</p>
        </section>
        <section className="cutter-cache-location-section ml-detail-section">
          <h3 className="ml-detail-section-title">原视频</h3>
          <p className="ml-detail-section-copy">{sourceVideoCache?.cache_root_path || "未启用"}</p>
        </section>
        <section className="cutter-cache-location-section ml-detail-section">
          <h3 className="ml-detail-section-title">剪切临时区</h3>
          <p className="ml-detail-section-copy">{local?.cut_temp_cache.cache_root_path || "未启用"}</p>
        </section>
        <section className="cutter-cache-location-section ml-detail-section">
          <h3 className="ml-detail-section-title">界面缓存</h3>
          <p className="ml-detail-section-copy">
            {localStorageCache.keys.length ? localStorageCache.keys.join(" / ") : "暂无界面缓存"}
          </p>
        </section>
      </InspectorPanel>
    </section>
  );
}
