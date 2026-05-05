import type { FormEvent } from "react";
import type { LocalClipCatalog, SourceLibraryResponse } from "../../api.ts";
import { searchHash } from "../../app/navigation.ts";
import type { CutterProject } from "../../state/cutter-projects.ts";
import type { MaterialSearchHistoryItem } from "../material-locator/MaterialLocatorPage.tsx";

function projectStatusLabel(status: CutterProject["status"]): string {
  switch (status) {
    case "active":
      return "未完成";
    case "delivered":
      return "已交付";
    case "archived":
      return "已归档";
  }
}

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
    <span>{project.source_title ?? project.title}</span>
  );
}

export function ProjectHomePage({
  library,
  localClips,
  projects,
  selectedProjectId,
  recentSearches,
  onSearch,
  onOpenProject
}: {
  library: SourceLibraryResponse;
  localClips: LocalClipCatalog;
  projects: readonly CutterProject[];
  selectedProjectId?: string;
  recentSearches?: readonly MaterialSearchHistoryItem[];
  onSearch?: (query: string) => void;
  onOpenProject?: (projectId: string) => void;
}) {
  const selectedProject = projects.find((project) => project.project_id === selectedProjectId) ?? projects[0];
  const deliveredCount = projects.filter((project) => project.status === "delivered").length;
  const activeCount = projects.filter((project) => project.status === "active").length;
  const searches = recentSearches?.length
    ? recentSearches
    : selectedProject?.searches.map((search) => ({
        query: search.query,
        hitCount: search.hit_count
      })) ?? [];

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
            <label className="cutter-filter-select">
              <span>素材来源</span>
              <select name="sourceFilter" defaultValue="all">
                <option value="all">全部</option>
                <option value="local">本地素材</option>
                <option value="public">公共原素材</option>
              </select>
            </label>
            <label className="cutter-filter-select">
              <span>视频类型</span>
              <select name="orientationFilter" defaultValue="all">
                <option value="all">全部</option>
                <option value="landscape">横版</option>
                <option value="portrait">竖版</option>
              </select>
            </label>
            <button className="cutter-primary-button" type="submit">
              搜索
            </button>
          </form>
        </section>

        <section className="cutter-project-board" aria-label="项目入口">
          <div>
            <header className="cutter-section-heading">
              <h2>最近项目</h2>
              <span>未完成 {activeCount} · 已交付 {deliveredCount}</span>
            </header>
            <div className="cutter-project-grid">
              {projects.length > 0 ? (
                projects.map((project) => (
                  <article
                    className={`cutter-project-card${project.project_id === selectedProject?.project_id ? " is-selected" : ""}`}
                    key={project.project_id}
                  >
                    <div className="cutter-project-cover">
                      <ProjectCover project={project} />
                    </div>
                    <div className="cutter-project-card-body">
                      <header>
                        <strong>{project.title}</strong>
                        <span>{projectStatusLabel(project.status)}</span>
                      </header>
                      <div className="cutter-project-metrics">
                        <span>
                          已剪<strong>{project.clip_count}</strong>
                        </span>
                        <span>
                          搜索<strong>{project.searches.length}</strong>
                        </span>
                        <span>
                          失败<strong>{project.failed_count}</strong>
                        </span>
                      </div>
                      <small>更新：{formatProjectTime(project.updated_at)}</small>
                      <div className="cutter-project-actions">
                        <button type="button" onClick={() => onOpenProject?.(project.project_id)}>
                          打开项目
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="cutter-empty-state">
                  <strong>还没有剪切项目</strong>
                  <span>先搜索文案。第一次点击“剪切这段”后，这里会出现项目卡片。</span>
                </div>
              )}
            </div>

            <section className="cutter-recent-searches" aria-label="最近搜索">
              <header className="cutter-section-heading">
                <h2>最近搜索</h2>
                <span>点击继续搜索</span>
              </header>
              <div>
                {searches.length > 0 ? (
                  searches.map((search) => (
                    <a href={searchHash(search.query)} key={search.query}>
                      <strong>{search.query}</strong>
                      <span>{search.hitCount} 处命中</span>
                    </a>
                  ))
                ) : (
                  <span>暂无搜索记录</span>
                )}
              </div>
            </section>
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
                    <dd>{selectedProject.title}</dd>
                  </div>
                  <div>
                    <dt>创建时间</dt>
                    <dd>{formatProjectTime(selectedProject.created_at)}</dd>
                  </div>
                  <div>
                    <dt>已剪片段</dt>
                    <dd>{selectedProject.clip_count} 个</dd>
                  </div>
                  <div>
                    <dt>最近搜索</dt>
                    <dd>{selectedProject.searches[0]?.query ?? "-"}</dd>
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
