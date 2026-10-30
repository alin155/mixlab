import { useState, type ChangeEvent, type FormEvent } from "react";
import { Button, SearchBox } from "@mixlab/ui-foundation";
import type { LocalClipCatalog, SourceFolderOption, SourceLibraryResponse } from "../../api.ts";
import type { CutQueueJob } from "../../state/cut-queue.ts";
import {
  MATERIAL_SCOPE_FOLDER_VALUE,
  type MaterialSearchMode
} from "../../state/material-locator.ts";
import {
  projectAutoTitleFromDate,
  projectDisplayTitle,
  type CutterProject
} from "../../state/cutter-projects.ts";
import type { CutterRoute } from "../../app/navigation.ts";

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

function queueJobStatusLabel(job: CutQueueJob): string {
  if (job.status === "pending") return "等待中";
  if (job.status === "running") return "剪切中";
  if (job.status === "done") return "已完成";
  if (job.status === "cancelled") return "已取消";
  return "失败";
}

function queueJobMeta(job: CutQueueJob, index: number): string {
  if (job.status === "pending") return `第 ${index + 1} 位`;
  if (job.status === "running") return `${job.progress}%`;
  if (job.status === "done") {
    const duration = job.verification?.actual_duration_ms ?? job.duration_ms;
    if (!duration || duration <= 0) return "已完成";
    const totalSeconds = Math.max(1, Math.round(duration / 1000));
    return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
  }
  return job.error_message ? "需处理" : "查看详情";
}

export function ProjectHomePage({
  library,
  localClips,
  projects,
  selectedProjectId,
  queue = [],
  sourceFolderFilter = "",
  sourceFolders = [],
  searchMode = "content",
  onSearch,
  onSetMaterialScope,
  onSelectProject,
  onOpenProject,
  onOpenProjectDirectory,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  engineReady = false,
  onNavigate
}: {
  library: SourceLibraryResponse;
  localClips: LocalClipCatalog;
  projects: readonly CutterProject[];
  selectedProjectId?: string;
  queue?: readonly CutQueueJob[];
  sourceFolderFilter?: string;
  sourceFolders?: readonly SourceFolderOption[];
  searchMode?: MaterialSearchMode;
  onSearch?: (query: string) => void;
  onSetMaterialScope?: (scope: string) => void;
  onSelectProject?: (projectId: string) => void;
  onOpenProject?: (projectId: string) => void;
  onOpenProjectDirectory?: (projectId: string) => void;
  onCreateProject?: (title: string) => void;
  onRenameProject?: (projectId: string) => void;
  onDeleteProject?: (projectId: string, mode: ProjectDeleteMode) => void;
  engineReady?: boolean;
  onNavigate?: (route: CutterRoute) => void;
}) {
  const [query, setQuery] = useState("");
  const [deleteTargetProjectId, setDeleteTargetProjectId] = useState<string | undefined>();
  const [deleteMode, setDeleteMode] = useState<ProjectDeleteMode>("remove");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const selectedProject = projects.find((project) => project.project_id === selectedProjectId) ?? projects[0];
  const deleteTargetProject = projects.find((project) => project.project_id === deleteTargetProjectId);
  const selectedProjectClipCount = selectedProject ? projectCompletedClipCount(selectedProject, queue) : 0;
  const selectedProjectTitle = selectedProject ? projectDisplayTitle(selectedProject) : "";
  const sourceFolderOptions = sourceFolders.filter((folder) => folder.name.trim().length > 0);
  const materialScopeValue = searchMode === "folder" ? MATERIAL_SCOPE_FOLDER_VALUE : sourceFolderFilter;
  const runningCount = queue.filter((job) => job.status === "running").length;
  const pendingCount = queue.filter((job) => job.status === "pending").length;
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayDoneCount = queue.filter(
    (job) => job.status === "done" && (job.finished_at || job.updated_at || "").slice(0, 10) === todayKey
  ).length;
  const recentJobs = queue.slice(0, 3);


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
      <div className="cutter-page-main ml-workbench-main ml-workbench-main--project-home cutter-home-main">
        <header className="cutter-home-header">
          <div className="cutter-home-header-copy">
            <p className="cutter-eyebrow ml-page-kicker ml-page-kicker--hero">工作台</p>
            <h1 className="ml-page-title ml-page-title--hero">素材与剪切工作台</h1>
            <p className="cutter-note ml-page-description ml-page-description--hero">
              不选项目也能直接搜索和剪切；项目只是归档范围，可随时切换。
            </p>
          </div>
          <div className="cutter-home-header-actions">
            <Button
              disabled={projects.length === 0}
              onClick={() => onOpenProject?.(projects[0]!.project_id)}
              type="button"
              variant="secondary"
            >
              继续最近项目
            </Button>
            <Button onClick={openCreateDialog} type="button" variant="primary">
              ＋ 新建项目
            </Button>
          </div>
        </header>

        <section className="cutter-project-hero ml-workbench-hero cutter-home-hero" aria-label="开始搜索">
          <div className="cutter-home-hero-side">
            <span className="cutter-home-chip">
              <span className="cutter-home-chip-dot" aria-hidden="true" />
              {engineReady ? "本机服务正常" : "本机服务未就绪"}
            </span>
            <span className="cutter-home-chip">本地素材 {localClips.local_clip_count}</span>
          </div>
          <h2 className="cutter-home-hero-title">从一句话，剪出一条视频</h2>
          <p className="cutter-home-hero-sub">
            在公共素材库中搜索文案，定位命中片段，加入待剪清单后统一剪切。
          </p>
          <form
            className="cutter-home-search cutter-project-search-form ml-workbench-hero-actions"
            onSubmit={(event) => {
              event.preventDefault();
              onSearch?.(query);
            }}
          >
            <select
              aria-label="素材范围"
              className="cutter-source-folder-select cutter-home-search-scope"
              onChange={(event) => onSetMaterialScope?.(event.currentTarget.value)}
              value={materialScopeValue}
            >
              <option value="">全部素材</option>
              {sourceFolderOptions.map((folder) => (
                <option key={folder.name} value={folder.name}>
                  {folder.name}（{folder.count}）
                </option>
              ))}
              <option value={MATERIAL_SCOPE_FOLDER_VALUE}>文件夹</option>
            </select>
            <input
              aria-label="搜索文案关键词或素材文件名"
              className="ml-field-input cutter-home-search-input"
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="输入文案关键词，例如：现金流"
              value={query}
            />
            <Button type="submit" variant="primary">搜索素材</Button>
            <Button onClick={() => onNavigate?.("public-library")} type="button" variant="secondary">
              浏览公共素材库
            </Button>
          </form>
          <div className="cutter-home-stats">
            <div className="cutter-home-stat"><span>最近项目</span><strong>{projects.length}</strong></div>
            <div className="cutter-home-stat"><span>本地素材</span><strong>{localClips.local_clip_count}</strong></div>
            <div className="cutter-home-stat"><span>剪切任务</span><strong>{runningCount + pendingCount} 处理中</strong></div>
            <div className="cutter-home-stat"><span>今日完成</span><strong>{todayDoneCount}</strong></div>
          </div>
        </section>

        <div className="cutter-home-grid">
          <section className="cutter-home-card cutter-home-projects" aria-label="最近项目">
            <div className="cutter-home-section-title">
              <strong>最近项目</strong>
              <span>{projects.length > 0 ? `共 ${projects.length} 个项目` : "项目归档"}</span>
            </div>
            {projects.length > 0 ? (
              <div className="cutter-home-project-grid">
                {projects.slice(0, 4).map((project) => {
                  const completedClipCount = projectCompletedClipCount(project, queue);
                  const isSelected = project.project_id === selectedProject?.project_id;
                  const projectTitle = projectDisplayTitle(project);
                  const projectSourceTitle = project.source_title?.trim();
                  const pendingCount = project.searches[0]?.hit_count ?? 0;
                  return (
                    <article
                      className={`cutter-home-project-card${isSelected ? " is-selected" : ""}`}
                      key={project.project_id}
                    >
                      <button
                        aria-label={`选择项目 ${projectDisplayTitle(project)}`}
                        className="cutter-home-project-select"
                        onClick={() => onSelectProject?.(project.project_id)}
                        type="button"
                      >
                        <span className="cutter-home-project-cover"><ProjectCover project={project} /></span>
                        <span className="cutter-home-project-body">
                          <strong>{projectSourceTitle || projectTitle}</strong>
                          <span>{projectSourceTitle ? projectTitle : `已剪 ${completedClipCount} · 待剪 ${pendingCount}`}</span>
                        </span>
                      </button>
                      {isSelected ? (
                        <div className="cutter-home-project-actions">
                          <Button onClick={() => onOpenProject?.(project.project_id)} size="sm" type="button" variant="primary">
                            进入项目
                          </Button>
                          {onOpenProjectDirectory ? (
                            <Button onClick={() => onOpenProjectDirectory(project.project_id)} size="sm" type="button" variant="secondary">
                              打开目录
                            </Button>
                          ) : null}
                          <Button onClick={() => onRenameProject?.(project.project_id)} size="sm" type="button" variant="secondary">
                            重命名
                          </Button>
                          <Button onClick={() => openDeleteDialog(project.project_id)} size="sm" type="button" variant="danger">
                            删除
                          </Button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="cutter-home-empty">
                <strong>还没有归档项目</strong>
                <span>项目只用于归档；不选项目也可以直接搜索，剪切时再选择归档到哪个项目。</span>
                <div className="cutter-home-empty-actions">
                  <Button onClick={openCreateDialog} type="button" variant="primary">＋ 新建项目</Button>
                  <Button onClick={() => onSearch?.("")} type="button" variant="secondary">直接搜索素材</Button>
                </div>
              </div>
            )}
          </section>

          <section className="cutter-home-card cutter-home-quick" aria-label="快速开始">
            <div className="cutter-home-section-title">
              <strong>快速开始</strong>
              <span>常用入口</span>
            </div>
            <div className="cutter-home-quick-list">
              <button className="cutter-home-quick-item" onClick={() => onSearch?.("")} type="button">
                <span className="cutter-home-quick-icon" aria-hidden="true">⌕</span>
                <span className="cutter-home-quick-copy"><strong>直接搜索素材</strong><span>不选项目，先找文案和片段</span></span>
                <span className="cutter-home-quick-note">推荐</span>
              </button>
              <button className="cutter-home-quick-item" onClick={openCreateDialog} type="button">
                <span className="cutter-home-quick-icon" aria-hidden="true">＋</span>
                <span className="cutter-home-quick-copy"><strong>新建项目</strong><span>为这次剪辑建立归档项目</span></span>
              </button>
              <button className="cutter-home-quick-item" onClick={() => onNavigate?.("cut-tasks")} type="button">
                <span className="cutter-home-quick-icon" aria-hidden="true">✂</span>
                <span className="cutter-home-quick-copy">
                  <strong>查看剪切任务</strong>
                  <span>{runningCount + pendingCount > 0 ? `${runningCount + pendingCount} 个处理中` : "查看队列与已完成任务"}</span>
                </span>
              </button>
              <button className="cutter-home-quick-item" onClick={() => onNavigate?.("local-library")} type="button">
                <span className="cutter-home-quick-icon" aria-hidden="true">▤</span>
                <span className="cutter-home-quick-copy"><strong>本地素材</strong><span>播放、打开目录或继续编辑</span></span>
              </button>
            </div>
            <div className="cutter-home-section-title cutter-home-recent-title">
              <strong>最近剪切 · 全部项目</strong>
              <Button onClick={() => onNavigate?.("cut-tasks")} size="sm" type="button" variant="ghost">全部任务</Button>
            </div>
            <div className="cutter-home-recent-list">
              {recentJobs.length > 0 ? recentJobs.map((job, index) => {
                const statusLabel = queueJobStatusLabel(job);
                return (
                  <button className="cutter-home-recent-item" key={job.queue_job_id} onClick={() => onNavigate?.("cut-tasks")} type="button">
                    <span className={`cutter-home-recent-badge is-${job.status}`}>{statusLabel}</span>
                    <span className="cutter-home-recent-title">{job.title || job.source_title}</span>
                    <span className="cutter-home-recent-meta">{queueJobMeta(job, index)}</span>
                  </button>
                );
              }) : (
                <p className="cutter-home-recent-empty">还没有剪切任务；先去搜索一段文案，加入待剪清单。</p>
              )}
            </div>
          </section>
        </div>
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
