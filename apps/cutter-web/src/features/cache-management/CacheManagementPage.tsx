import { Badge, Button, Card, InspectorPanel, type BadgeTone } from "@mixlab/ui-foundation";
import { useMemo, useState } from "react";
import type { CutterRuntimeStatus } from "../../api.ts";
import {
  clearCutterLocalCache,
  cutterCachePercent,
  cutterLocalCacheSnapshot,
  cutterRuntimeCacheBytes,
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
  localStorageCache: CutterLocalCacheSnapshot
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
      hint: `${localStorageCache.keys.length} 个浏览器状态键`
    }
  ];
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
  runtimeStatus
}: {
  runtimeStatus?: CutterRuntimeStatus;
}) {
  const [localStorageCache, setLocalStorageCache] = useState(() => cutterLocalCacheSnapshot());
  const release = runtimeStatus?.release_cache;
  const local = runtimeStatus?.local_cache;
  const releaseState = releaseStatus(runtimeStatus);
  const searchState = searchStatus(runtimeStatus);
  const preflightState = preflightStatus(runtimeStatus);
  const sourceVideoCache = local?.source_video_cache;
  const totalRuntimeCacheBytes = cutterRuntimeCacheBytes(runtimeStatus);
  const detailRows = useMemo(
    () => cacheDetailRows(runtimeStatus, localStorageCache),
    [runtimeStatus, localStorageCache]
  );

  function handleClearLocalStorageCache() {
    clearCutterLocalCache();
    setLocalStorageCache(cutterLocalCacheSnapshot());
  }

  return (
    <section className="cutter-page cutter-cache-management cutter-operational-page ml-workbench-page ml-workbench-page--fluid" data-page="cache-management">
      <div className="cutter-page-main ml-workbench-main ml-workbench-main--rows-dashboard">
        <header className="cutter-page-header cutter-cache-header ml-workbench-header">
          <div>
            <p className="cutter-eyebrow ml-page-kicker">Local Runtime</p>
            <h1 className="ml-page-title">缓存管理</h1>
            <p className="ml-page-description">查看本机缓存、搜索索引、源视频预检和剪切临时区状态。</p>
          </div>
          <Badge tone={cacheStatusTone(releaseState.tone)}>{releaseState.label}</Badge>
        </header>

        <section className="cutter-cache-stats ml-metric-grid" aria-label="缓存概览">
          <CacheStatCard
            title="运行缓存"
            value={formatCutterCacheSize(totalRuntimeCacheBytes)}
            detail="Release、搜索索引、缩略图、原视频和剪切临时区合计"
          />
          <CacheStatCard
            title="Release"
            value={formatCutterCacheSize(release?.cache_size_bytes ?? 0)}
            detail={release?.active_release_version || "等待同步"}
            percent={cutterCachePercent(
              release?.cached_release_count,
              release?.max_cached_releases
            )}
            tone={releaseState.tone}
          />
          <CacheStatCard
            title="搜索索引"
            value={formatCutterCacheSize(local?.searchd_cache_size_bytes ?? 0)}
            detail={runtimeStatus?.search_backend?.label || "等待搜索服务"}
            tone={runtimeStatus?.search_backend?.last_error ? "warning" : searchState.tone}
          />
          <CacheStatCard
            title="缩略图"
            value={formatCutterCacheSize(local?.thumbnail_cache_size_bytes ?? 0)}
            detail={`${local?.thumbnail_cache_manifest_entry_count ?? 0} 条记录`}
            percent={cutterCachePercent(
              local?.thumbnail_cache_size_bytes,
              local?.thumbnail_cache_max_bytes
            )}
          />
          <CacheStatCard
            title="原视频"
            value={formatCutterCacheSize(sourceVideoCache?.size_bytes ?? 0)}
            detail={`${sourceVideoCache?.cached_video_count ?? 0} 条视频 · ${sourceVideoCache?.active_prefetch_count ?? 0} 个预取中`}
            percent={cutterCachePercent(
              sourceVideoCache?.size_bytes,
              sourceVideoCache?.max_bytes
            )}
            tone={sourceVideoCache?.last_error ? "warning" : "ready"}
          />
          <CacheStatCard
            title="剪切临时区"
            value={formatCutterCacheSize(local?.cut_temp_cache.size_bytes ?? 0)}
            detail={`${local?.cut_temp_cache.file_count ?? 0} 个文件`}
            percent={cutterCachePercent(
              local?.cut_temp_cache.size_bytes,
              local?.cut_temp_cache.max_bytes
            )}
          />
        </section>

        <section className="cutter-cache-panels ml-panel-grid ml-scroll-region">
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
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleClearLocalStorageCache}
              >
                清除界面缓存
              </Button>
            }
          >
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
