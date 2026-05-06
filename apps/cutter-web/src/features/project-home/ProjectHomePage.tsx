import type { FormEvent } from "react";
import type { LocalClipCatalog, SourceLibraryResponse } from "../../api.ts";
import type { CutQueueJob } from "../../state/cut-queue.ts";
import { projectDisplayTitle, type CutterProject } from "../../state/cutter-projects.ts";
import type { MaterialSearchSourceFilter } from "../../state/material-locator.ts";
import type { VideoOrientationFilter } from "../../state/video-orientation.ts";

function formatProjectTime(value: string): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function ProjectCover({ project }: { project: CutterProject }) {
  return project.cover_url ? (
    <img src={project.cover_url} alt="" />
  ) : (
    <span>{project.source_title ?? projectDisplayTitle(project)}</span>
  );
}

export function projectCompletedClipCount(project: CutterProject, queue: readonly CutQueueJob[] = []): number {
  const projectJobs = queue.filter((job) => job.project_id === project.project_id);
  if (projectJobs.length === 0) {
    return project.clip_count;
  }

  return projectJobs.filter((job) => job.status === "done").length;
}

const sourceFilterOptions: Array<{ value: MaterialSearchSourceFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "local", label: "本地素材" },
  { value: "public", label: "公共原素材" }
];

const orientationFilterOptions: Array<{ value: VideoOrientationFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "landscape", label: "横版" },
  { value: "portrait", label: "竖版" }
];

export function ProjectHomePage({
  library,
  localClips,
  projects,
  selectedProjectId,
  queue = [],
  sourceFilter = "all",
  orientationFilter = "all",
  onSearch,
  onSetSourceFilter,
  onSetOrientationFilter,
  onOpenProject,
  onRenameProject
}: {
  library: SourceLibraryResponse;
  localClips: LocalClipCatalog;
  projects: readonly CutterProject[];
  selectedProjectId?: string;
  queue?: readonly CutQueueJob[];
  sourceFilter?: MaterialSearchSourceFilter;
  orientationFilter?: VideoOrientationFilter;
  onSearch?: (query: string) => void;
  onSetSourceFilter?: (filter: MaterialSearchSourceFilter) => void;
  onSetOrientationFilter?: (filter: VideoOrientationFilter) => void;
  onOpenProject?: (projectId: string) => void;
  onRenameProject?: (projectId: string) => void;
}) {
  const selectedProject = projects.find((project) => project.project_id === selectedProjectId) ?? projects[0];
  const selectedProjectClipCount = selectedProject ? projectCompletedClipCount(selectedProject, queue) : 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSearch?.(String(formData.get("query") ?? ""));
  }

  return (
    <section className="cutter-page cutter-project-home" data-page="project-home">
      <div className="cutter-page-main">
        <section className="cutter-project-hero" aria-label="开始搜索">
          <div>
            <h1>开始搜索</h1>
          </div>
          <form className="cutter-search-form cutter-project-search-form" onSubmit={handleSubmit}>
            <label className="cutter-search-box">
              <span>⌕</span>
              <input
                name="query"
                aria-label="搜索文案关键词或粘贴爆款文案"
                placeholder="搜索文案关键词或粘贴爆款文案"
              />
            </label>
            <button className="cutter-primary-button" type="submit">
              搜索
            </button>
            <details className="cutter-search-options">
              <summary>选项</summary>
              <div>
                <label className="cutter-filter-select">
                  <span>素材来源</span>
                  <select
                    name="sourceFilter"
                    value={sourceFilter}
                    onChange={(event) => onSetSourceFilter?.(event.currentTarget.value as MaterialSearchSourceFilter)}
                  >
                    {sourceFilterOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="cutter-filter-select">
                  <span>视频类型</span>
                  <select
                    name="orientationFilter"
                    value={orientationFilter}
                    onChange={(event) => onSetOrientationFilter?.(event.currentTarget.value as VideoOrientationFilter)}
                  >
                    {orientationFilterOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </details>
          </form>
        </section>

        <section className="cutter-project-board" aria-label="项目入口">
          <div>
            <header className="cutter-section-heading">
              <h2>最近项目</h2>
            </header>
            <div className="cutter-project-grid">
              {projects.length > 0 ? (
                projects.map((project) => {
                  const completedClipCount = projectCompletedClipCount(project, queue);
                  return (
                    <button
                      type="button"
                      className={`cutter-project-card${project.project_id === selectedProject?.project_id ? " is-selected" : ""}`}
                      key={project.project_id}
                      onClick={() => onOpenProject?.(project.project_id)}
                      aria-label={`打开项目 ${projectDisplayTitle(project)}`}
                    >
                      <div className="cutter-project-cover">
                        <ProjectCover project={project} />
                      </div>
                      <div className="cutter-project-card-summary">
                        <strong>{projectDisplayTitle(project)}</strong>
                        <span>已剪 {completedClipCount}</span>
                        <span>搜索 {project.searches.length}</span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="cutter-empty-state">
                  <strong>还没有剪切项目</strong>
                  <span>先搜索文案。第一次点击“剪切这段”后，这里会出现项目卡片。</span>
                </div>
              )}
            </div>
          </div>

          <aside className="cutter-project-detail" aria-label="项目详情">
            <h2>项目详情</h2>
            {selectedProject ? (
              <>
                <div className="cutter-project-detail-cover">
                  <ProjectCover project={selectedProject} />
                </div>
                <dl>
                  <div>
                    <dt>项目名</dt>
                    <dd>
                      <button
                        className="cutter-project-name-edit"
                        type="button"
                        onDoubleClick={() => onRenameProject?.(selectedProject.project_id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            onRenameProject?.(selectedProject.project_id);
                          }
                        }}
                        title="双击修改项目名称"
                      >
                        {projectDisplayTitle(selectedProject)}
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt>创建时间</dt>
                    <dd>{formatProjectTime(selectedProject.created_at)}</dd>
                  </div>
                  <div>
                    <dt>已剪片段</dt>
                    <dd>{selectedProjectClipCount} 个</dd>
                  </div>
                  <div>
                    <dt>素材规模</dt>
                    <dd>
                      本地 {localClips.local_clip_count} · 公共 {library.available_video_count}
                    </dd>
                  </div>
                </dl>
                <button className="cutter-primary-button" type="button" onClick={() => onOpenProject?.(selectedProject.project_id)}>
                  进入项目
                </button>
              </>
            ) : (
              <div className="cutter-empty-state">
                <strong>临时搜索</strong>
                <span>当前还没有项目。第一次剪切会自动创建。</span>
              </div>
            )}
          </aside>
        </section>
      </div>
    </section>
  );
}
