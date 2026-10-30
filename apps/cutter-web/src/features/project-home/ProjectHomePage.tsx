import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@mixlab/ui-foundation";
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

function formatRelativeTime(value: string, now: number = Date.now()): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const diffMs = Math.max(0, now - date.getTime());
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatTaskDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return "-";
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function taskStatusLabel(status: CutQueueJob["status"]): string {
  if (status === "pending") return "等待中";
  if (status === "running") return "剪切中";
  if (status === "done") return "已完成";
  if (status === "cancelled") return "已取消";
  return "失败";
}

function taskStatusTimestamp(job: CutQueueJob): number {
  const value = job.finished_at || job.updated_at || job.created_at;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function ProjectCover({
  project,
  variant = "card",
  apiBaseUrl = "",
  onLocalized
}: {
  project: CutterProject;
  variant?: "card" | "detail";
  apiBaseUrl?: string;
  onLocalized?: (projectId: string, coverLocalUrl: string) => void;
}) {
  const fallbackCoverUrl = variant === "detail" ? project.detail_cover_url ?? project.cover_url : project.cover_url;
  const localCoverPath =
    project.cover_local_url ??
    `/cutter/projects/${encodeURIComponent(project.project_id)}/cover`;
  const localCoverUrl =
    apiBaseUrl && localCoverPath.startsWith("/") ? `${apiBaseUrl}${localCoverPath}` : localCoverPath;
  const sources = [localCoverUrl, fallbackCoverUrl].filter(
    (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index
  );
  const [sourceIndex, setSourceIndex] = useState(0);
  const [coverState, setCoverState] = useState<"loading" | "ready" | "error">("loading");
  const source = sources[sourceIndex];

  useEffect(() => {
    setSourceIndex(0);
  }, [project.project_id, project.cover_local_url, fallbackCoverUrl, variant]);

  useEffect(() => {
    setCoverState("loading");
  }, [source]);

  if (!source) {
    return <span className="cutter-cover-fallback">{project.source_title ?? projectDisplayTitle(project)}</span>;
  }

  return (
    <span className="cutter-cover-frame" data-cover-state={coverState}>
      {coverState !== "ready" ? <span className="cutter-cover-skeleton" aria-hidden="true" /> : null}
      <img
        alt=""
        className={`ml-media-fill cutter-cover-image${coverState === "ready" ? " is-loaded" : ""}`}
        loading="eager"
        onError={() => setSourceIndex((current) => current + 1)}
        onLoad={() => {
          setCoverState("ready");
          if (sourceIndex === 0 && source !== fallbackCoverUrl) {
            onLocalized?.(project.project_id, localCoverUrl);
          }
        }}
        src={source}
      />
    </span>
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
  currentProjectId,
  queue = [],
  sourceFolders = [],
  teacherFilter = "",
  onSetTeacherFilter,
  searchMode = "content",
  apiBaseUrl = "",
  onSearch,
  onSetMaterialScope,
  onOpenProject,
  onOpenProjectDirectory,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  engineReady = false,
  onNavigate,
  onProjectCoverLocalized
}: {
  library: SourceLibraryResponse;
  localClips: LocalClipCatalog;
  projects: readonly CutterProject[];
  selectedProjectId?: string;
  currentProjectId?: string;
  queue?: readonly CutQueueJob[];
  sourceFolders?: readonly SourceFolderOption[];
  teacherFilter?: string;
  onSetTeacherFilter?: (teacher: string) => void;
  searchMode?: MaterialSearchMode;
  apiBaseUrl?: string;
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
  onProjectCoverLocalized?: (projectId: string, coverLocalUrl: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [deleteTargetProjectId, setDeleteTargetProjectId] = useState<string | undefined>();
  const [deleteMode, setDeleteMode] = useState<ProjectDeleteMode>("remove");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const activeProjectId = currentProjectId ?? selectedProjectId;
  const deleteTargetProject = projects.find((project) => project.project_id === deleteTargetProjectId);
  const sourceFolderOptions = sourceFolders.filter((folder) => folder.name.trim().length > 0);
  const teacherAliases: Record<string, string> = { "陶矜2": "陶矜" };
  const teacherForFolderName = (folderName?: string): string => {
    const first = (folderName ?? "").replace(/\\/g, "/").split("/").filter(Boolean)[0]?.trim() ?? "";
    return first ? (teacherAliases[first] ?? first) : "未标注老师";
  };
  const teacherOptions: Array<{ name: string; count: number }> = [];
  for (const folder of sourceFolderOptions) {
    const teacher = teacherForFolderName(folder.name);
    const existing = teacherOptions.find((item) => item.name === teacher);
    if (existing) existing.count += folder.count;
    else teacherOptions.push({ name: teacher, count: folder.count });
  }
  const recentJobs = [...queue].sort((a, b) => taskStatusTimestamp(b) - taskStatusTimestamp(a)).slice(0, 5);
  const doneJobCount = queue.filter((job) => job.status === "done").length;
  const failedJobCount = queue.filter((job) => job.status === "failed").length;


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
            <p className="cutter-eyebrow ml-page-kicker">工作台</p>
            <h1 className="ml-page-title cutter-home-title">工作台</h1>
            <p className="cutter-note ml-page-description">搜索素材、继续项目，或查看最近的剪切结果。</p>
          </div>
          <div className="cutter-home-header-actions">
            <Button onClick={() => onNavigate?.("cut-tasks")} type="button" variant="secondary">
              打开待剪清单
            </Button>
            <Button onClick={openCreateDialog} type="button" variant="primary">
              ＋ 新建项目
            </Button>
          </div>
        </header>

        <form
          className="cutter-home-command"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch?.(query);
          }}
        >
          <input
            aria-label="搜索素材"
            className="ml-field-input cutter-home-command-input"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="搜索文案，例如：现金流"
            value={query}
          />
          <select
            aria-label="老师筛选"
            className="cutter-home-command-scope cutter-teacher-select"
            onChange={(event) => onSetTeacherFilter?.(event.currentTarget.value)}
            value={teacherFilter}
          >
            <option value="">全部老师</option>
            {teacherOptions.map((teacher) => (
              <option key={teacher.name} value={teacher.name}>
                {teacher.name} {teacher.count}
              </option>
            ))}
          </select>
          <Button type="submit" variant="primary">搜索素材</Button>
          <div className="cutter-home-command-meta">
            <span>本地素材 <strong>{localClips.local_clip_count}</strong></span>
            <span>公共素材 <strong>{library.available_video_count}</strong></span>
          </div>
        </form>

        <section className="cutter-home-section" aria-label="最近项目">
          <div className="cutter-home-section-head">
            <div>
              <h2>最近项目</h2>
              <span>共 {projects.length} 个</span>
            </div>
          </div>
          {projects.length > 0 ? (
            <div className="cutter-home-project-grid">
              {projects.slice(0, 4).map((project) => {
                const completedClipCount = projectCompletedClipCount(project, queue);
                const pendingCount = project.searches[0]?.hit_count ?? 0;
                const projectTitle = projectDisplayTitle(project);
                const isCurrent = project.project_id === activeProjectId;
                return (
                  <article className={`cutter-home-project-card${isCurrent ? " is-current" : ""}`} key={project.project_id}>
                    <button
                      aria-label={`进入项目 ${projectTitle}`}
                      className="cutter-home-project-open"
                      onClick={() => onOpenProject?.(project.project_id)}
                      type="button"
                    >
                      <span className="cutter-home-project-cover">
                        <ProjectCover apiBaseUrl={apiBaseUrl} onLocalized={onProjectCoverLocalized} project={project} />
                        <span className="cutter-home-project-badge">{isCurrent ? "当前项目" : projectTitle}</span>
                        <span className="cutter-home-project-count">{project.clip_count} 片段</span>
                      </span>
                      <span className="cutter-home-project-body">
                        <strong>{projectTitle}</strong>
                        <span className="cutter-home-project-meta">
                          <span className="is-done">已剪 {completedClipCount}</span>
                          <span>待剪 {pendingCount}</span>
                          <span>{formatRelativeTime(project.updated_at || project.created_at)}</span>
                        </span>
                      </span>
                    </button>
                    <details className="cutter-home-project-menu" onClick={(event) => event.stopPropagation()}>
                      <summary aria-label={`项目操作 ${projectTitle}`}>⋯</summary>
                      <div className="cutter-home-project-menu-popover" role="menu">
                        {onOpenProjectDirectory ? (
                          <button
                            onClick={(event) => {
                              event.currentTarget.closest("details")?.removeAttribute("open");
                              onOpenProjectDirectory(project.project_id);
                            }}
                            role="menuitem"
                            type="button"
                          >
                            打开目录
                          </button>
                        ) : null}
                        {onRenameProject ? (
                          <button
                            onClick={(event) => {
                              event.currentTarget.closest("details")?.removeAttribute("open");
                              onRenameProject(project.project_id);
                            }}
                            role="menuitem"
                            type="button"
                          >
                            重命名
                          </button>
                        ) : null}
                        {onDeleteProject ? (
                          <button
                            className="is-danger"
                            onClick={(event) => {
                              event.currentTarget.closest("details")?.removeAttribute("open");
                              openDeleteDialog(project.project_id);
                            }}
                            role="menuitem"
                            type="button"
                          >
                            删除
                          </button>
                        ) : null}
                      </div>
                    </details>
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

        <section className="cutter-home-section" aria-label="最近剪切">
          <div className="cutter-home-section-head">
            <div>
              <h2>最近剪切</h2>
              <span>全部项目</span>
            </div>
            <Button onClick={() => onNavigate?.("cut-tasks")} size="sm" type="button" variant="ghost">
              全部任务
            </Button>
          </div>
          <div className="cutter-home-task-table">
            <div className="cutter-home-task-table-head">
              <strong>已完成 {doneJobCount} · 失败 {failedJobCount}</strong>
              <span>最近 {recentJobs.length} 条</span>
            </div>
            {recentJobs.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>状态</th>
                    <th>来源视频</th>
                    <th>时长</th>
                    <th>完成时间</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map((job) => (
                    <tr key={job.queue_job_id}>
                      <td>
                        <span className={`cutter-home-task-status is-${job.status}`}>{taskStatusLabel(job.status)}</span>
                      </td>
                      <td className="cutter-home-task-source">{job.source_title || job.title}</td>
                      <td className="cutter-home-task-time">{formatTaskDuration(job.duration_ms)}</td>
                      <td className="cutter-home-task-time">{formatRelativeTime(job.finished_at || job.updated_at || job.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="cutter-home-task-empty">还没有剪切任务；先去搜索一段文案，加入待剪清单。</p>
            )}
          </div>
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
