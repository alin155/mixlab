import { GalleryGrid, InspectorPanel } from "@mixlab/ui-foundation";
import { formatDuration, formatFileSize, type LocalClipCatalog } from "../../api.ts";
import {
  projectDisplayTitle,
  type CutterProject
} from "../../state/cutter-projects.ts";
import {
  matchesOrientationFilter,
  videoOrientationLabel,
  type VideoDimensions,
  type VideoOrientationFilter
} from "../../state/video-orientation.ts";

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
    .filter(Boolean)
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
  onOpenLocalClipDirectory
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
}) {
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

  const galleryItems = (clips: readonly LocalClip[]) =>
    clips.map((clip) => ({
      id: clip.local_clip_id,
      title: clip.title,
      image: clip.cover_url ?? LOCAL_CLIP_FALLBACK_COVER,
      meta: galleryMeta(clip),
      tags: [
        videoOrientationLabel(clip as LocalClipVisualMetadata),
        projectTitleForClip(clip, projectById)
      ],
      description: clip.selected_text,
      selected: clip.local_clip_id === selected?.local_clip_id,
      ...(onSelectLocalClip
        ? {
            onSelect: () => onSelectLocalClip(clip.local_clip_id),
            select_label: `查看素材 ${clip.title}`
          }
        : {})
    }));

  return (
    <section className="cutter-page cutter-local-library" data-page="local-library">
      <div className="cutter-page-main">
        <header className="cutter-page-header">
          <div>
            <p className="cutter-eyebrow">本地素材库</p>
            <h1>本地可复剪素材</h1>
            <p>
              {viewMode === "current-project"
                ? `${currentProjectTitle} · ${visible.length} 个当前项目素材`
                : `${catalog.local_clip_count} 个本地可复剪素材，来自本机剪切输出。`}
            </p>
          </div>
          <div className="cutter-local-library-controls">
            <div className="cutter-local-view-toggle" role="group" aria-label="本地素材视图">
              {[
                ["current-project", "当前项目"],
                ["all", "全部素材"]
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={viewMode === mode ? "is-active" : ""}
                  aria-pressed={viewMode === mode}
                  onClick={() => onSetViewMode?.(mode as LocalLibraryViewMode)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="cutter-local-view-toggle" role="group" aria-label="本地素材视频类型">
              {orientationFilterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={orientationFilter === option.value ? "is-active" : ""}
                  aria-pressed={orientationFilter === option.value}
                  onClick={() => onSetOrientationFilter?.(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="cutter-local-library-scroll">
          {viewMode === "all" ? (
            <div className="cutter-local-project-groups">
              {grouped.map(([title, clips]) => (
                <section className="cutter-local-project-group" key={title}>
                  <header>
                    <strong>{title}</strong>
                    <span>{clips.length} 个素材</span>
                  </header>
                  <GalleryGrid items={galleryItems(clips)} />
                </section>
              ))}
            </div>
          ) : visible.length > 0 ? (
            <GalleryGrid items={galleryItems(visible)} />
          ) : (
            <div className="cutter-local-empty-state">
              <strong>当前项目暂无本地素材</strong>
              <span>切换到全部素材，可以查看本机已剪切的其他项目素材。</span>
            </div>
          )}
        </div>
      </div>

      <InspectorPanel title="素材详情">
        <div className="cutter-inspector-stack">
          {selected ? (
            <video
              key={selected.local_clip_id}
              className="cutter-local-detail-player"
              src={selected.media_url}
              {...(selected.cover_url ? { poster: selected.cover_url } : {})}
              controls
              preload="metadata"
            />
          ) : null}
          <strong>{selected?.title ?? "未选择本地素材"}</strong>
          <span>{visible.length} 条当前视图素材</span>
          <span>{selected ? `所属项目 ${projectTitleForClip(selected, projectById)}` : ""}</span>
          <span>{selected?.source_title ? `来源 ${selected.source_title}` : ""}</span>
          <span>{selected ? galleryMeta(selected) : ""}</span>
          <p>{selected?.selected_text}</p>
          {selected && onOpenLocalClipDirectory ? (
            <button
              type="button"
              className="cutter-inline-action"
              onClick={() => onOpenLocalClipDirectory(selected)}
            >
              打开文件目录
            </button>
          ) : null}
          {actionNotice ? <p className="cutter-note">{actionNotice}</p> : null}
        </div>
      </InspectorPanel>
    </section>
  );
}
