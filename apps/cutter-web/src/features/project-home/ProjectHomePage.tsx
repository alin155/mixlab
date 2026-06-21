import { useState, type ChangeEvent, type FormEvent } from "react";
import { Button, SearchBox } from "@mixlab/ui-foundation";
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
    <img className="ml-media-fill" src={coverUrl} alt="" />
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
    <div className="cutter-modal-backdrop ml-modal-backdrop" role="presentation">
      <section className="cutter-project-delete-dialog ml-dialog" role="dialog" aria-modal="true" aria-label="删除项目">
        <header className="ml-dialog-header">
          <h2 className="ml-dialog-title">删除项目「{projectDisplayTitle(project)}」</h2>
          <p className="ml-dialog-description">请选择删除方式。公共素材库源视频不会被删除。</p>
        </header>
        <div className="cutter-project-delete-options ml-choice-list">
          <label className="ml-choice-option">
            <input
              type="radio"
              name="projectDeleteMode"
              value="remove"
              checked={mode === "remove"}
              onChange={handleModeChange}
            />
            <span className="ml-choice-option-body">
              <strong>从首页移除</strong>
              <small>只移除项目入口和任务归属，不删除剪切视频、本地素材、交付目录。</small>
            </span>
          </label>
          <label className="is-danger ml-choice-option ml-choice-option--danger">
            <input
              type="radio"
              name="projectDeleteMode"
              value="delete-with-outputs"
              checked={mode === "delete-with-outputs"}
              onChange={handleModeChange}
            />
            <span className="ml-choice-option-body">
              <strong>删除项目及产出</strong>
              <small>删除这个项目生成的剪切视频、本地素材条目、导出记录和交付目录。</small>
            </span>
          </label>
        </div>
        <footer className="ml-dialog-footer">
          <Button type="button" onClick={onCancel} variant="secondary">
            取消
          </Button>
          <Button
            variant={mode === "delete-with-outputs" ? "danger" : "primary"}
            type="button"
            onClick={onConfirm}
          >
            确认删除
          </Button>
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
    <div className="cutter-modal-backdrop ml-modal-backdrop" role="presentation">
      <form
        className="cutter-project-dialog ml-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="重命名项目"
        onSubmit={handleSubmit}
      >
        <header className="ml-dialog-header">
          <h2 className="ml-dialog-title">重命名项目</h2>
          <p className="ml-dialog-description">项目名只保存在本机剪辑工作台，用于整理剪切任务和本地素材。</p>
        </header>
        <label className="cutter-project-rename-field ml-form-field">
          <span>项目名</span>
          <input
            className="ml-field-input"
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
        </label>
        <footer className="ml-dialog-footer">
          <Button type="button" onClick={onCancel} variant="secondary">
            取消
          </Button>
          <Button type="submit" disabled={!trimmedTitle} variant="primary">
            保存
          </Button>
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
    <div className="cutter-modal-backdrop ml-modal-backdrop" role="presentation">
      <form
        className="cutter-project-dialog ml-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="新建项目"
        onSubmit={handleSubmit}
      >
        <header className="ml-dialog-header">
          <h2 className="ml-dialog-title">新建项目</h2>
          <p className="ml-dialog-description">项目会保存在本机剪辑工作台，用于归档搜索、剪切任务和本地素材。</p>
        </header>
        <label className="cutter-project-rename-field ml-form-field">
          <span>项目名</span>
          <input
            className="ml-field-input"
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
        </label>
        <footer className="ml-dialog-footer">
          <Button type="button" onClick={onCancel} variant="secondary">
            取消
          </Button>
          <Button type="submit" disabled={!trimmedTitle} variant="primary">
            创建
          </Button>
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
    <section className="cutter-page cutter-project-home ml-workbench-page ml-workbench-page--project-home" data-page="project-home">
      <div className="cutter-page-main ml-workbench-main ml-workbench-main--project-home">
        <section className="cutter-project-hero ml-workbench-hero" aria-label="开始搜索">
          <div className="ml-workbench-hero-copy">
            <p className="cutter-eyebrow ml-page-kicker ml-page-kicker--hero">Cutter / Project Home</p>
            <h1 className="ml-page-title ml-page-title--hero">选择项目，然后开始搜索素材</h1>
            <p className="cutter-note ml-page-description ml-page-description--hero">
              根据会议选择一个项目后，搜索结果、剪切任务和本地素材都会按项目归档。
            </p>
          </div>
          <div className="cutter-search-form cutter-project-search-form ml-control-row--hero ml-workbench-hero-actions">
            <SearchBox
              aria-label="搜索文案关键词或粘贴爆款文案"
              buttonLabel="搜索"
              className="cutter-project-search-box"
              name="query"
              onSubmit={(value) => onSearch?.(value)}
              placeholder={selectedProjectTitle ? `如「${selectedProjectTitle}」或搜索关键词` : "搜索文案关键词"}
            />
            <Button type="button" onClick={openCreateDialog} variant="secondary">
              新建项目
            </Button>
          </div>
        </section>

        <section className="cutter-project-board ml-workbench-board" aria-label="项目入口">
          <div className="cutter-project-list-panel ml-workbench-panel ml-workbench-panel--list">
            <header className="ml-section-heading">
              <h2 className="ml-section-title">最近项目</h2>
            </header>
            <div className="cutter-project-grid ml-scroll-region ml-fixed-media-grid">
              {projects.length > 0 ? (
                projects.map((project) => {
                  const completedClipCount = projectCompletedClipCount(project, queue);
                  const isSelected = project.project_id === selectedProject?.project_id;
                  const projectTitle = projectDisplayTitle(project);
                  const projectSourceTitle = project.source_title?.trim();
                  const pendingCount = project.searches[0]?.hit_count ?? 0;
                  return (
                    <article
                      className={`cutter-project-card ml-media-card ml-media-card--fixed${isSelected ? " is-selected" : ""}`}
                      key={project.project_id}
                    >
                      <button
                        type="button"
                        className="cutter-project-card-main ml-media-card-fill-action ml-focus-inset"
                        onClick={() => onSelectProject?.(project.project_id)}
                        aria-label={`选择项目 ${projectDisplayTitle(project)}`}
                      >
                        <div className="cutter-project-cover ml-media-card-cover-fill">
                          <ProjectCover project={project} />
                        </div>
                        <div className="cutter-project-card-summary ml-media-card-caption ml-media-card-caption--top">
                          <strong className="ml-media-card-title">{projectSourceTitle || projectTitle}</strong>
                          {projectSourceTitle ? <span className="ml-media-card-meta">{projectTitle}</span> : null}
                          {!projectSourceTitle ? (
                            <span className="cutter-project-card-stats ml-media-card-meta-stack">
                              <span className="ml-media-card-meta">已剪 {completedClipCount}</span>
                              <span className="ml-media-card-meta">待剪 {pendingCount}</span>
                            </span>
                          ) : null}
                        </div>
                      </button>
                      {isSelected ? (
                        <div className="cutter-project-card-actions ml-overlay-action-row ml-media-card-action-row">
                          <Button
                            className="cutter-project-card-enter"
                            type="button"
                            onClick={() => onOpenProject?.(project.project_id)}
                            size="sm"
                            variant="primary"
                          >
                            进入项目
                          </Button>
                          {onOpenProjectDirectory ? (
                            <Button
                              className="cutter-project-card-directory"
                              type="button"
                              onClick={() => onOpenProjectDirectory(project.project_id)}
                              size="sm"
                              variant="secondary"
                            >
                              打开文件目录
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <div className="cutter-project-empty-state ml-empty-panel">
                  <strong>还没有剪切项目</strong>
                  <span>点击“新建项目”后，这里会出现项目卡片。</span>
                </div>
              )}
            </div>
          </div>

          <aside className="cutter-project-detail ml-scroll-region ml-workbench-panel ml-detail-panel" aria-label="项目详情">
            <header className="cutter-project-detail-header ml-section-heading">
              <h2 className="ml-section-title">项目详情</h2>
            </header>
            {selectedProject ? (
              <>
                <div className="cutter-project-detail-cover ml-media-frame ml-detail-cover">
                  <ProjectCover project={selectedProject} variant="detail" />
                </div>
                <dl className="ml-data-list ml-data-list--detail cutter-project-detail-list">
                  <div className="ml-data-row ml-data-row--detail cutter-project-detail-row">
                    <dt>项目名</dt>
                    <dd>{projectDisplayTitle(selectedProject)}</dd>
                  </div>
                  <div className="ml-data-row ml-data-row--detail cutter-project-detail-row">
                    <dt>创建时间</dt>
                    <dd>{formatProjectTime(selectedProject.created_at)}</dd>
                  </div>
                  <div className="ml-data-row ml-data-row--detail cutter-project-detail-row">
                    <dt>已剪片段</dt>
                    <dd>{selectedProjectClipCount} 个</dd>
                  </div>
                  <div className="ml-data-row ml-data-row--detail cutter-project-detail-row">
                    <dt>素材规模</dt>
                    <dd>
                      本地 {localClips.local_clip_count} · 公共 {library.available_video_count}
                    </dd>
                  </div>
                </dl>
                <div className="ml-action-stack ml-sticky-action-stack ml-action-stack--detail cutter-project-detail-controls">
                  <Button
                    type="button"
                    onClick={() => onOpenProject?.(selectedProject.project_id)}
                    variant="primary"
                  >
                    进入项目
                  </Button>
                  {onOpenProjectDirectory ? (
                    <Button
                      type="button"
                      onClick={() => onOpenProjectDirectory(selectedProject.project_id)}
                      variant="secondary"
                    >
                      打开文件目录
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    onClick={() => onRenameProject?.(selectedProject.project_id)}
                    variant="secondary"
                  >
                    重命名
                  </Button>
                  <Button
                    type="button"
                    aria-label={`删除项目 ${projectDisplayTitle(selectedProject)}`}
                    onClick={() => openDeleteDialog(selectedProject.project_id)}
                    variant="danger"
                  >
                    删除项目
                  </Button>
                </div>
              </>
            ) : (
              <div className="cutter-project-empty-state ml-empty-panel">
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
