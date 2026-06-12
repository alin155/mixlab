import { useState, type ChangeEvent, type FormEvent } from "react";
import type { LocalClipCatalog, SourceLibraryResponse } from "../../api.ts";
import type { CutQueueJob } from "../../state/cut-queue.ts";
import {
  projectAutoTitleFromDate,
  projectDisplayTitle,
  type CutterProject
} from "../../state/cutter-projects.ts";

export type ProjectDeleteMode = "remove" | "delete-with-outputs";

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

function ProjectCover({ project, variant = "card" }: { project: CutterProject; variant?: "card" | "detail" }) {
  const coverUrl = variant === "detail" ? project.detail_cover_url ?? project.cover_url : project.cover_url;

  return coverUrl ? (
    <img src={coverUrl} alt="" />
  ) : (
    <span>{project.source_title ?? projectDisplayTitle(project)}</span>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="m20 20-4.2-4.2m2.2-5.3a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function projectCompletedClipCount(project: CutterProject, queue: readonly CutQueueJob[] = []): number {
  const projectJobs = queue.filter((job) => job.project_id === project.project_id);
  if (projectJobs.length === 0) {
    return project.clip_count;
  }

  return projectJobs.filter((job) => job.status === "done").length;
}

export function ProjectDeleteDialog({
  project,
  mode,
  onModeChange,
  onCancel,
  onConfirm
}: {
  project: CutterProject;
  mode: ProjectDeleteMode;
  onModeChange: (mode: ProjectDeleteMode) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  function handleModeChange(event: ChangeEvent<HTMLInputElement>) {
    onModeChange(event.currentTarget.value as ProjectDeleteMode);
  }

  return (
    <div className="cutter-modal-backdrop" role="presentation">
      <section className="cutter-project-delete-dialog" role="dialog" aria-modal="true" aria-label="删除项目">
        <header>
          <h2>删除项目「{projectDisplayTitle(project)}」</h2>
          <p>请选择删除方式。公共素材库源视频不会被删除。</p>
        </header>
        <div className="cutter-project-delete-options">
          <label>
            <input
              type="radio"
              name="projectDeleteMode"
              value="remove"
              checked={mode === "remove"}
              onChange={handleModeChange}
            />
            <span>
              <strong>从首页移除</strong>
              <small>只移除项目入口和任务归属，不删除剪切视频、本地素材、交付目录。</small>
            </span>
          </label>
          <label className="is-danger">
            <input
              type="radio"
              name="projectDeleteMode"
              value="delete-with-outputs"
              checked={mode === "delete-with-outputs"}
              onChange={handleModeChange}
            />
            <span>
              <strong>删除项目及产出</strong>
              <small>删除这个项目生成的剪切视频、本地素材条目、导出记录和交付目录。</small>
            </span>
          </label>
        </div>
        <footer>
          <button className="cutter-secondary-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button
            className={mode === "delete-with-outputs" ? "cutter-danger-button" : "cutter-primary-button"}
            type="button"
            onClick={onConfirm}
          >
            确认删除
          </button>
        </footer>
      </section>
    </div>
  );
}

export function ProjectRenameDialog({
  project,
  initialTitle,
  onCancel,
  onConfirm
}: {
  project: CutterProject;
  initialTitle: string;
  onCancel: () => void;
  onConfirm: (projectId: string, title: string) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const trimmedTitle = title.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedTitle) {
      return;
    }

    onConfirm(project.project_id, trimmedTitle);
  }

  return (
    <div className="cutter-modal-backdrop" role="presentation">
      <form
        className="cutter-project-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="重命名项目"
        onSubmit={handleSubmit}
      >
        <header>
          <h2>重命名项目</h2>
          <p>项目名只保存在本机剪辑工作台，用于整理剪切任务和本地素材。</p>
        </header>
        <label className="cutter-project-rename-field">
          <span>项目名</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
        </label>
        <footer>
          <button className="cutter-secondary-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="cutter-primary-button" type="submit" disabled={!trimmedTitle}>
            保存
          </button>
        </footer>
      </form>
    </div>
  );
}

export function ProjectCreateDialog({
  initialTitle,
  onCancel,
  onConfirm
}: {
  initialTitle: string;
  onCancel: () => void;
  onConfirm: (title: string) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const trimmedTitle = title.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedTitle) {
      return;
    }

    onConfirm(trimmedTitle);
  }

  return (
    <div className="cutter-modal-backdrop" role="presentation">
      <form
        className="cutter-project-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="新建项目"
        onSubmit={handleSubmit}
      >
        <header>
          <h2>新建项目</h2>
          <p>项目会保存在本机剪辑工作台，用于归档搜索、剪切任务和本地素材。</p>
        </header>
        <label className="cutter-project-rename-field">
          <span>项目名</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
        </label>
        <footer>
          <button className="cutter-secondary-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="cutter-primary-button" type="submit" disabled={!trimmedTitle}>
            创建
          </button>
        </footer>
      </form>
    </div>
  );
}

export function ProjectHomePage({
  library,
  localClips,
  projects,
  selectedProjectId,
  queue = [],
  onSearch,
  onSelectProject,
  onOpenProject,
  onOpenProjectDirectory,
  onCreateProject,
  onRenameProject,
  onDeleteProject
}: {
  library: SourceLibraryResponse;
  localClips: LocalClipCatalog;
  projects: readonly CutterProject[];
  selectedProjectId?: string;
  queue?: readonly CutQueueJob[];
  onSearch?: (query: string) => void;
  onSelectProject?: (projectId: string) => void;
  onOpenProject?: (projectId: string) => void;
  onOpenProjectDirectory?: (projectId: string) => void;
  onCreateProject?: (title: string) => void;
  onRenameProject?: (projectId: string) => void;
  onDeleteProject?: (projectId: string, mode: ProjectDeleteMode) => void;
}) {
  const [deleteTargetProjectId, setDeleteTargetProjectId] = useState<string | undefined>();
  const [deleteMode, setDeleteMode] = useState<ProjectDeleteMode>("remove");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const selectedProject = projects.find((project) => project.project_id === selectedProjectId) ?? projects[0];
  const deleteTargetProject = projects.find((project) => project.project_id === deleteTargetProjectId);
  const selectedProjectClipCount = selectedProject ? projectCompletedClipCount(selectedProject, queue) : 0;
  const selectedProjectTitle = selectedProject ? projectDisplayTitle(selectedProject) : "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSearch?.(String(formData.get("query") ?? ""));
  }

  function openDeleteDialog(projectId: string) {
    setDeleteTargetProjectId(projectId);
    setDeleteMode("remove");
  }

  function closeDeleteDialog() {
    setDeleteTargetProjectId(undefined);
    setDeleteMode("remove");
  }

  function confirmDeleteDialog() {
    if (!deleteTargetProject) {
      return;
    }

    onDeleteProject?.(deleteTargetProject.project_id, deleteMode);
    closeDeleteDialog();
  }

  function openCreateDialog() {
    setCreateDialogOpen(true);
  }

  function closeCreateDialog() {
    setCreateDialogOpen(false);
  }

  function confirmCreateDialog(title: string) {
    onCreateProject?.(title);
    closeCreateDialog();
  }

  return (
    <section className="cutter-page cutter-project-home" data-page="project-home">
      <div className="cutter-page-main">
        <section className="cutter-project-hero" aria-label="开始搜索">
          <div>
            <p className="cutter-eyebrow">Cutter / Project Home</p>
            <h1>选择项目，然后开始搜索素材</h1>
            <p className="cutter-note">根据会议选择一个项目后，搜索结果、剪切任务和本地素材都会按项目归档。</p>
          </div>
          <form className="cutter-search-form cutter-project-search-form" onSubmit={handleSubmit}>
            <label className="cutter-search-box">
              <span className="cutter-search-icon">
                <SearchIcon />
              </span>
              <input
                name="query"
                aria-label="搜索文案关键词或粘贴爆款文案"
                placeholder={selectedProjectTitle ? `如「${selectedProjectTitle}」或搜索关键词` : "搜索文案关键词"}
              />
            </label>
            <button className="cutter-primary-button" type="submit">
              搜索
            </button>
            <button className="cutter-secondary-button" type="button" onClick={openCreateDialog}>
              新建项目
            </button>
          </form>
        </section>

        <section className="cutter-project-board" aria-label="项目入口">
          <div className="cutter-project-list-panel">
            <header className="cutter-section-heading">
              <h2>最近项目</h2>
            </header>
            <div className="cutter-project-grid">
              {projects.length > 0 ? (
                projects.map((project) => {
                  const completedClipCount = projectCompletedClipCount(project, queue);
                  const isSelected = project.project_id === selectedProject?.project_id;
                  const projectTitle = projectDisplayTitle(project);
                  const projectSourceTitle = project.source_title?.trim();
                  const pendingCount = project.searches[0]?.hit_count ?? 0;
                  return (
                    <article
                      className={`cutter-project-card${isSelected ? " is-selected" : ""}`}
                      key={project.project_id}
                    >
                      <button
                        type="button"
                        className="cutter-project-card-main"
                        onClick={() => onSelectProject?.(project.project_id)}
                        aria-label={`选择项目 ${projectDisplayTitle(project)}`}
                      >
                        <div className="cutter-project-cover">
                          <ProjectCover project={project} />
                        </div>
                        <div className="cutter-project-card-summary">
                          <strong>{projectSourceTitle || projectTitle}</strong>
                          {projectSourceTitle ? <span>{projectTitle}</span> : null}
                          {!projectSourceTitle ? (
                            <span className="cutter-project-card-stats">
                              <span>已剪 {completedClipCount}</span>
                              <span>待剪 {pendingCount}</span>
                            </span>
                          ) : null}
                        </div>
                      </button>
                      <span className="cutter-project-card-more" aria-hidden="true">
                        ...
                      </span>
                      {isSelected ? (
                        <div className="cutter-project-card-actions">
                          <button
                            className="cutter-project-card-enter"
                            type="button"
                            onClick={() => onOpenProject?.(project.project_id)}
                          >
                            进入项目
                          </button>
                          {onOpenProjectDirectory ? (
                            <button
                              className="cutter-project-card-directory"
                              type="button"
                              onClick={() => onOpenProjectDirectory(project.project_id)}
                            >
                              打开文件目录
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <div className="cutter-empty-state">
                  <strong>还没有剪切项目</strong>
                  <span>点击“新建项目”后，这里会出现项目卡片。</span>
                </div>
              )}
            </div>
          </div>

          <aside className="cutter-project-detail" aria-label="项目详情">
            <header className="cutter-project-detail-header">
              <h2>项目详情</h2>
              <span className="cutter-project-detail-tools" aria-hidden="true">
                <span className="cutter-project-detail-tool is-star" />
                <span className="cutter-project-detail-tool is-more" />
              </span>
            </header>
            {selectedProject ? (
              <>
                <div className="cutter-project-detail-cover">
                  <ProjectCover project={selectedProject} variant="detail" />
                </div>
                <dl>
                  <div>
                    <dt>项目名</dt>
                    <dd>{projectDisplayTitle(selectedProject)}</dd>
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
                <div className="cutter-project-detail-controls">
                  <button
                    className="cutter-primary-button"
                    type="button"
                    onClick={() => onOpenProject?.(selectedProject.project_id)}
                  >
                    进入项目
                  </button>
                  {onOpenProjectDirectory ? (
                    <button
                      className="cutter-secondary-button"
                      type="button"
                      onClick={() => onOpenProjectDirectory(selectedProject.project_id)}
                    >
                      打开文件目录
                    </button>
                  ) : null}
                  <button
                    className="cutter-secondary-button"
                    type="button"
                    onClick={() => onRenameProject?.(selectedProject.project_id)}
                  >
                    重命名
                  </button>
                  <button
                    className="cutter-danger-button"
                    type="button"
                    aria-label={`删除项目 ${projectDisplayTitle(selectedProject)}`}
                    onClick={() => openDeleteDialog(selectedProject.project_id)}
                  >
                    删除项目
                  </button>
                </div>
              </>
            ) : (
              <div className="cutter-empty-state">
                <strong>未选择项目</strong>
                <span>选择一个项目后再搜索，剪切任务和本地素材会按项目归档。</span>
              </div>
            )}
          </aside>
        </section>
      </div>
      {deleteTargetProject ? (
        <ProjectDeleteDialog
          project={deleteTargetProject}
          mode={deleteMode}
          onModeChange={setDeleteMode}
          onCancel={closeDeleteDialog}
          onConfirm={confirmDeleteDialog}
        />
      ) : null}
      {createDialogOpen ? (
        <ProjectCreateDialog
          initialTitle={projectAutoTitleFromDate(new Date().toISOString(), projects)}
          onCancel={closeCreateDialog}
          onConfirm={confirmCreateDialog}
        />
      ) : null}
    </section>
  );
}
