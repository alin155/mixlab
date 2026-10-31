import { Button, InspectorPanel } from "@mixlab/ui-foundation";
import { useEffect, useState } from "react";
import {
  CutterApiError,
  formatDuration,
  formatFileSize,
  type CutterApiClient,
  type CutterLocalClipCleanResult,
  type CutterLocalClipIntegrity,
  type LocalClipCatalog
} from "../../api.ts";
import {
  projectDisplayTitle,
  type CutterProject
} from "../../state/cutter-projects.ts";
import { formatCutterCacheSize } from "../../state/cutter-cache.ts";

function describeIntegrityError(error: unknown): string {
  if (error instanceof CutterApiError) {
    return [error.code, error.message, error.remediation].filter(Boolean).join(" · ");
  }

  return error instanceof Error ? error.message : "本地素材治理操作失败";
}
import {
  matchesOrientationFilter,
  videoOrientationLabel,
  type VideoDimensions,
  type VideoOrientationFilter
} from "../../state/video-orientation.ts";
import { LibraryGallery } from "../library-gallery.tsx";
import { ProjectCreateDialog } from "../project-home/ProjectHomePage.tsx";

type LocalClipVisualMetadata = LocalClipCatalog["clips"][number] & VideoDimensions;
export type LocalClip = LocalClipCatalog["clips"][number];
export type LocalLibraryViewMode = "current-project" | "all";
const orientationFilterOptions: Array<{ value: VideoOrientationFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "landscape", label: "横版" },
  { value: "portrait", label: "竖版" }
];

const LOCAL_CLIP_FALLBACK_COVER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'%3E%3Crect width='320' height='180' fill='%232a2f36'/%3E%3Cpath d='M124 55l78 35-78 35z' fill='%23ffffff' opacity='.9'/%3E%3C/svg%3E";

function galleryMeta(clip: LocalClip): string {
  const resolution = clip.width && clip.height ? `${clip.width}x${clip.height}` : "";
  return [
    formatDuration(clip.duration_ms ?? 0),
    resolution,
    clip.codec?.toUpperCase(),
    formatFileSize(clip.file_size)
  ]
    .filter((value) => Boolean(value) && value !== "-")
    .join(" · ");
}

function localClipOrder(clip: LocalClip): number {
  const match = clip.title.match(/^(\d+)-/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function sortLocalClips(clips: readonly LocalClip[]): LocalClip[] {
  return [...clips].sort((left, right) => {
    const orderDiff = localClipOrder(left) - localClipOrder(right);
    if (orderDiff !== 0) {
      return orderDiff;
    }

    return left.title.localeCompare(right.title, "zh-Hans-CN");
  });
}

function projectTitleForClip(
  clip: LocalClip,
  projectById: ReadonlyMap<string, CutterProject>
): string {
  if (!clip.project_id) {
    return "未归属素材";
  }

  const project = projectById.get(clip.project_id);
  return project ? projectDisplayTitle(project) : "未归属素材";
}

function projectRecencyForClip(
  clip: LocalClip,
  projectById: ReadonlyMap<string, CutterProject>
): string {
  if (!clip.project_id) {
    return "";
  }

  const project = projectById.get(clip.project_id);
  return project?.updated_at || project?.created_at || "";
}

function sortLocalProjectGroups(
  groups: readonly [string, LocalClip[]][],
  projectById: ReadonlyMap<string, CutterProject>
): [string, LocalClip[]][] {
  return [...groups].sort((left, right) => {
    const leftProjectId = left[1][0]?.project_id;
    const rightProjectId = right[1][0]?.project_id;
    if (!leftProjectId && rightProjectId) {
      return 1;
    }
    if (leftProjectId && !rightProjectId) {
      return -1;
    }

    const recencyDiff = projectRecencyForClip(right[1][0]!, projectById).localeCompare(
      projectRecencyForClip(left[1][0]!, projectById)
    );
    if (recencyDiff !== 0) {
      return recencyDiff;
    }

    return left[0].localeCompare(right[0], "zh-Hans-CN");
  });
}

export function localClipGovernanceSummary(integrity: CutterLocalClipIntegrity): string {
  return "孤儿素材 " + integrity.orphans.length + " 个（" + formatCutterCacheSize(integrity.total_bytes) + "） · 被引用素材 " + integrity.referenced.length + " 个";
}

export function localClipDegradedNotice(integrity: CutterLocalClipIntegrity): string {
  if (!integrity.degraded) {
    return "";
  }

  return integrity.warnings.find((warning) => warning.code === "local_clip_reference_index_unreadable")?.message ??
    "本地素材引用索引读取失败或损坏，已暂停孤儿识别与清理；请修复/重建工作区索引后重试。";
}

export function localClipCleanPreviewText(integrity: CutterLocalClipIntegrity): string {
  return [
    "将清理 " + integrity.orphans.length + " 个孤儿本地素材（" + formatCutterCacheSize(integrity.total_bytes) + "）。",
    "仅删除未被项目、待剪清单或未完成任务引用的本地素材文件与索引；项目成片、被引用素材不会被删除。",
    "清理需要服务端一次性确认令牌，失败不会静默删除。"
  ].join("\n");
}

export function localClipCleanResultSummary(result: CutterLocalClipCleanResult): string {
  const parts = ["已清理 " + result.removed.length + " 个孤儿素材，释放 " + formatCutterCacheSize(result.freed_bytes)];
  if (result.skipped.length > 0) {
    parts.push("跳过 " + result.skipped.length + " 个（" + result.skipped.map((item) => item.reason).join("、") + "）");
  }
  return parts.join("；");
}

export function LocalLibraryPage({
  catalog,
  query = "",
  orientationFilter = "all",
  selectedLocalClipId,
  actionNotice = "",
  projects = [],
  currentProjectId,
  viewMode = "current-project",
  onSetViewMode,
  onSetOrientationFilter,
  onSelectLocalClip,
  onOpenLocalClipDirectory,
  onDeleteLocalClip,
  onCreateProject,
  onLoadMore,
  isLoadingMore = false,
  client,
  diskLow = false,
  diskFreeBytes,
  diskTotalBytes
}: {
  catalog: LocalClipCatalog;
  query?: string;
  orientationFilter?: VideoOrientationFilter;
  selectedLocalClipId?: string;
  actionNotice?: string;
  projects?: readonly CutterProject[];
  currentProjectId?: string;
  viewMode?: LocalLibraryViewMode;
  onSetViewMode?: (mode: LocalLibraryViewMode) => void;
  onSetOrientationFilter?: (filter: VideoOrientationFilter) => void;
  onSelectLocalClip?: (localClipId: string) => void;
  onOpenLocalClipDirectory?: (localClip: LocalClip) => void;
  onDeleteLocalClip?: (localClip: LocalClip) => void;
  onCreateProject?: (title: string) => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  client?: Pick<CutterApiClient, "getLocalClipIntegrity" | "cleanLocalClips">;
  diskLow?: boolean;
  diskFreeBytes?: number;
  diskTotalBytes?: number;
}) {
  const [integrity, setIntegrity] = useState<CutterLocalClipIntegrity | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [integrityError, setIntegrityError] = useState("");
  const [pendingOrphanClean, setPendingOrphanClean] = useState(false);
  const [orphanCleanResult, setOrphanCleanResult] = useState<CutterLocalClipCleanResult | null>(null);
  const [orphanCleanError, setOrphanCleanError] = useState("");
  const [orphanCleaning, setOrphanCleaning] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<"video" | "info">("video");

  async function loadLocalClipIntegrity() {
    if (!client) {
      return;
    }
    setIntegrityLoading(true);
    setIntegrityError("");
    try {
      setIntegrity(await client.getLocalClipIntegrity());
    } catch (error) {
      setIntegrityError(describeIntegrityError(error));
    } finally {
      setIntegrityLoading(false);
    }
  }

  async function handleCleanOrphans() {
    if (!client || !integrity) {
      return;
    }
    setOrphanCleaning(true);
    setOrphanCleanError("");
    setOrphanCleanResult(null);
    try {
      const result = await client.cleanLocalClips({
        local_clip_ids: integrity.orphans.map((orphan) => orphan.local_clip_id),
        confirm_token: integrity.confirm_token,
        expected_bytes: integrity.expected_bytes
      });
      setOrphanCleanResult(result);
      setPendingOrphanClean(false);
      await loadLocalClipIntegrity();
    } catch (error) {
      setOrphanCleanError(describeIntegrityError(error));
    } finally {
      setOrphanCleaning(false);
    }
  }

  useEffect(() => {
    if (client) {
      void loadLocalClipIntegrity();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);
  const projectById = new Map(projects.map((project) => [project.project_id, project]));
  const filtered = query
    ? catalog.clips.filter((clip) => `${clip.title} ${clip.source_title} ${clip.selected_text}`.includes(query))
    : catalog.clips;
  const scoped =
    viewMode === "current-project"
      ? currentProjectId
        ? filtered.filter((clip) => clip.project_id === currentProjectId)
        : []
      : filtered;
  const visible = sortLocalClips(scoped.filter((clip) =>
    matchesOrientationFilter(clip as LocalClipVisualMetadata, orientationFilter)
  ));
  const selected =
    visible.find((clip) => clip.local_clip_id === selectedLocalClipId) ??
    visible[0];
  const grouped =
    viewMode === "all"
      ? sortLocalProjectGroups(
          [...visible.reduce<Map<string, LocalClip[]>>((groups, clip) => {
            const title = projectTitleForClip(clip, projectById);
            groups.set(title, [...(groups.get(title) ?? []), clip]);
            return groups;
          }, new Map()).entries()],
          projectById
        )
      : [];
  const currentProjectTitle =
    currentProjectId && projectById.has(currentProjectId)
      ? projectDisplayTitle(projectById.get(currentProjectId)!)
      : "当前项目";
  const canLoadMore = catalog.clips.length < catalog.local_clip_count && Boolean(onLoadMore);

  const galleryItems = (clips: readonly LocalClip[]) =>
    clips.map((clip) => ({
      id: clip.local_clip_id,
      title: clip.title,
      image: clip.cover_url ?? LOCAL_CLIP_FALLBACK_COVER,
      meta: galleryMeta(clip),
      tags: [videoOrientationLabel(clip as LocalClipVisualMetadata)],
      selected: clip.local_clip_id === selected?.local_clip_id,
      ...(onSelectLocalClip
        ? {
            onSelect: () => onSelectLocalClip(clip.local_clip_id),
            selectLabel: `查看素材 ${clip.title}`
          }
        : {})
    }));

  return (
    <section className="cutter-page cutter-local-library ml-workbench-page ml-workbench-page--library" data-page="local-library">
      <div className="cutter-page-main ml-workbench-main ml-workbench-main--library" style={{ gridTemplateRows: "auto auto minmax(0, 1fr)" }}>
        <header className="cutter-page-header ml-workbench-header">
          <div>
            <h1 className="ml-page-title">本地素材</h1>
            <p className="ml-page-description">查看本机剪切结果，播放、打开目录或继续编辑。</p>
          </div>
          <div className="cutter-local-library-controls ml-control-cluster">
            {onCreateProject ? (
              <Button type="button" variant="primary" size="sm" onClick={() => setCreateProjectOpen(true)}>
                ＋ 新建项目
              </Button>
            ) : null}
            {onOpenLocalClipDirectory && (selected ?? visible[0]) ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onOpenLocalClipDirectory?.((selected ?? visible[0])!)}
              >
                打开素材目录
              </Button>
            ) : null}
          </div>
        </header>

        <div className="cutter-local-library-toolbar ml-control-cluster">
          <div className="cutter-local-view-toggle ml-segmented-control" role="group" aria-label="本地素材视图">
            {[
              ["current-project", "当前项目"],
              ["all", "全部素材"]
            ].map(([mode, label]) => (
              <Button
                key={mode}
                type="button"
                variant={viewMode === mode ? "primary" : "ghost"}
                size="sm"
                aria-pressed={viewMode === mode}
                onClick={() => onSetViewMode?.(mode as LocalLibraryViewMode)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="cutter-local-view-toggle ml-segmented-control" role="group" aria-label="本地素材视频类型">
            {orientationFilterOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={orientationFilter === option.value ? "primary" : "ghost"}
                size="sm"
                aria-pressed={orientationFilter === option.value}
                onClick={() => onSetOrientationFilter?.(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <span className="ml-section-meta">共 {visible.length} 个素材</span>
        </div>


        {diskLow ? (
          <div className="ml-empty-panel ml-empty-panel--plain" role="alert">
            <strong>磁盘空间不足</strong>
            <span>
              当前可用 {formatCutterCacheSize(diskFreeBytes ?? 0)}
              {typeof diskTotalBytes === "number" ? " / 总计 " + formatCutterCacheSize(diskTotalBytes) : ""}
              ，建议清理孤儿素材或缓存后再继续剪辑。
            </span>
          </div>
        ) : null}
        {client && integrity && integrity.orphans.length > 0 ? (
          <section className="cutter-local-governance" aria-label="本地素材治理">
            {integrityLoading ? <p className="ml-metric-description">正在检查本地素材引用…</p> : null}
            {integrityError ? (
              <div className="ml-empty-panel ml-empty-panel--plain" role="alert">
                <strong>本地素材检查失败</strong>
                <span>{integrityError}</span>
                <Button type="button" variant="secondary" size="sm" onClick={() => void loadLocalClipIntegrity()}>
                  重试
                </Button>
              </div>
            ) : null}
            {integrity ? (
              <div className="ml-empty-panel ml-empty-panel--plain">
                <strong>本地素材治理</strong>
                <span>{localClipGovernanceSummary(integrity)}</span>
                {integrity.degraded ? (
                  <p className="ml-metric-description" role="alert">
                    {localClipDegradedNotice(integrity)}
                  </p>
                ) : null}
                <div className="ml-control-cluster">
                  <Button type="button" variant="ghost" size="sm" onClick={() => void loadLocalClipIntegrity()}>
                    刷新检查
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={integrity.orphans.length === 0 || integrity.degraded || integrityLoading}
                    onClick={() => {
                      setOrphanCleanResult(null);
                      setOrphanCleanError("");
                      setPendingOrphanClean(true);
                    }}
                  >
                    清理孤儿素材（{integrity.orphans.length}）
                  </Button>
                </div>
                {pendingOrphanClean ? (
                  <div className="ml-empty-panel ml-empty-panel--plain" role="alertdialog" aria-label="确认清理孤儿素材">
                    <strong>确认清理孤儿素材？</strong>
                    <span style={{ whiteSpace: "pre-line" }}>{localClipCleanPreviewText(integrity)}</span>
                    <div className="ml-control-cluster">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setPendingOrphanClean(false)}>
                        取消
                      </Button>
                      <Button type="button" variant="danger" size="sm" onClick={() => void handleCleanOrphans()} disabled={orphanCleaning}>
                        {orphanCleaning ? "清理中…" : "确认清理"}
                      </Button>
                    </div>
                  </div>
                ) : null}
                {orphanCleanResult ? <p role="status">{localClipCleanResultSummary(orphanCleanResult)}</p> : null}
                {orphanCleanError ? (
                  <div className="ml-empty-panel ml-empty-panel--plain" role="alert">
                    <strong>孤儿素材清理失败</strong>
                    <span>{orphanCleanError}</span>
                    <Button type="button" variant="secondary" size="sm" onClick={() => void loadLocalClipIntegrity()}>
                      刷新后重试
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="cutter-local-library-scroll ml-scroll-region">
          {viewMode === "all" ? (
            <div className="cutter-library-group-list ml-library-group-list">
              {grouped.map(([title, clips]) => (
                <section className="cutter-library-group ml-library-group" key={title}>
                  <header className="cutter-library-group-header ml-library-group-header">
                    <strong>{title}</strong>
                    <span>{clips.length} 个素材</span>
                  </header>
                  <LibraryGallery items={galleryItems(clips)} />
                </section>
              ))}
            </div>
          ) : visible.length > 0 ? (
            <LibraryGallery items={galleryItems(visible)} />
          ) : (
            <div className="cutter-library-empty-state ml-empty-panel">
              <strong>当前项目暂无本地素材</strong>
              <span>切换到全部素材，可以查看本机已剪切的其他项目素材。</span>
            </div>
          )}
          {canLoadMore ? (
            <Button
              type="button"
              className="cutter-local-load-more"
              variant="secondary"
              size="sm"
              disabled={isLoadingMore}
              onClick={onLoadMore}
            >
              {isLoadingMore ? "加载中" : `加载更多（已显示 ${catalog.clips.length} / ${catalog.local_clip_count}）`}
            </Button>
          ) : null}
        </div>
      </div>

      <InspectorPanel title="素材详情" className="ml-inspector--workbench ml-inspector--compact ml-workbench-inspector cutter-library-inspector">
        <div className="cutter-inspector-tabs" role="tablist" aria-label="本地素材详情">
          <button type="button" role="tab" aria-selected={inspectorTab === "video"} className={"cutter-inspector-tab" + (inspectorTab === "video" ? " is-active" : "")} onClick={() => setInspectorTab("video")}>视频</button>
          <button type="button" role="tab" aria-selected={inspectorTab === "info"} className={"cutter-inspector-tab" + (inspectorTab === "info" ? " is-active" : "")} onClick={() => setInspectorTab("info")}>信息</button>
        </div>
        <div className={"ml-detail-stack cutter-inspector-panel" + (inspectorTab === "video" ? " is-active" : "")}>
          {selected ? (
            <video
              key={selected.local_clip_id}
              className="ml-media-frame ml-media-frame--16x9 ml-media-frame--dark ml-media-fill"
              src={selected.media_url}
              {...(selected.cover_url ? { poster: selected.cover_url } : {})}
              controls
              preload="metadata"
            />
          ) : null}
        </div>
        <div className={"ml-detail-stack cutter-inspector-panel" + (inspectorTab === "info" ? " is-active" : "")}>
          <strong>{selected?.title ?? "未选择本地素材"}</strong>
          <span>{visible.length} 条当前视图素材</span>
          <span>{selected ? `所属项目 ${projectTitleForClip(selected, projectById)}` : ""}</span>
          <span>{selected?.source_title ? `来源 ${selected.source_title}` : ""}</span>
          <span>{selected ? galleryMeta(selected) : ""}</span>
          <p>{selected?.selected_text}</p>
          {selected && onOpenLocalClipDirectory ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onOpenLocalClipDirectory(selected)}
            >
              打开文件目录
            </Button>
          ) : null}
          {selected && onDeleteLocalClip ? (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => {
                if (window.confirm(`删除本地素材「${selected.title}」及对应本地文件？`)) {
                  onDeleteLocalClip(selected);
                }
              }}
            >
              删除本地素材
            </Button>
          ) : null}
          {actionNotice ? <p className="cutter-note ml-page-description">{actionNotice}</p> : null}
        </div>
      </InspectorPanel>
      {createProjectOpen ? (
        <ProjectCreateDialog
          initialTitle=""
          onCancel={() => setCreateProjectOpen(false)}
          onConfirm={(title) => {
            setCreateProjectOpen(false);
            onCreateProject?.(title);
          }}
        />
      ) : null}
    </section>
  );
}
