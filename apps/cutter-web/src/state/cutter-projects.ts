import type { CutListItem } from "./cut-list.ts";

export const CUTTER_PROJECTS_STORAGE_KEY = "mixlab.cutter.projects";
export const CUTTER_CURRENT_PROJECT_STORAGE_KEY = "mixlab.cutter.currentProjectId";

export type CutterProjectStatus = "active" | "delivered" | "archived";

export interface CutterProjectSearch {
  query: string;
  hit_count: number;
  searched_at: string;
}

export interface CutterProject {
  project_id: string;
  title: string;
  title_source?: "auto" | "manual";
  status: CutterProjectStatus;
  created_at: string;
  updated_at: string;
  clip_count: number;
  running_count: number;
  failed_count: number;
  searches: CutterProjectSearch[];
  cover_url?: string;
  source_title?: string;
}

export interface CutterProjectsState {
  projects: CutterProject[];
  currentProjectId?: string;
}

export interface ProjectSearchInput {
  query: string;
  hitCount: number;
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function sortProjects(projects: readonly CutterProject[]): CutterProject[] {
  return [...projects].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

function compactTitle(value: string): string {
  const compacted = value
    .replace(/[\s,，.。:：;；!！?？、"'“”‘’()[\]{}<>《》|/\\]+/g, "")
    .trim();

  return compacted.slice(0, 24);
}

function projectIdFromDate(now: string): string {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const suffix = `${date.getHours()}${date.getMinutes()}${date.getSeconds()}${date.getMilliseconds()}`
    .padStart(9, "0")
    .slice(0, 9);

  return `P${year}${month}${day}-${suffix}`;
}

function projectDateLabel(now: string): string {
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) {
    return "未命名剪切项目";
  }

  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function projectDisplayTitle(project: CutterProject): string {
  if (project.title_source === "manual") {
    return project.title;
  }

  if (project.title_source === "auto") {
    return project.title;
  }

  return projectDateLabel(project.created_at);
}

export function projectAutoTitleFromDate(
  now: string,
  existingProjects: readonly CutterProject[] = []
): string {
  const baseTitle = projectDateLabel(now);
  if (baseTitle === "未命名剪切项目") {
    return baseTitle;
  }

  const basePattern = new RegExp(`^${escapeRegExp(baseTitle)}(?:-(\\d+))?$`);
  const usedSuffixes = new Set<number>();
  for (const project of existingProjects) {
    const match = projectDisplayTitle(project).match(basePattern);
    if (!match) {
      continue;
    }

    usedSuffixes.add(match[1] ? Number(match[1]) : 0);
  }

  if (!usedSuffixes.has(0)) {
    return baseTitle;
  }

  let suffix = 1;
  while (usedSuffixes.has(suffix)) {
    suffix += 1;
  }

  return `${baseTitle}-${suffix}`;
}

export function projectTitleFromFirstCut(input: {
  query: string;
  selectedText: string;
  sourceTitle?: string;
}): string {
  const queryTitle = compactTitle(input.query);
  if (queryTitle) {
    return queryTitle;
  }

  const textTitle = compactTitle(input.selectedText);
  if (textTitle) {
    return textTitle;
  }

  return compactTitle(input.sourceTitle ?? "") || "未命名剪切项目";
}

export function recordProjectSearch(
  searches: readonly CutterProjectSearch[],
  next: ProjectSearchInput,
  now: string
): CutterProjectSearch[] {
  const query = next.query.trim();
  if (!query) {
    return [...searches];
  }

  return [
    {
      query,
      hit_count: next.hitCount,
      searched_at: now
    },
    ...searches.filter((item) => item.query !== query)
  ].slice(0, 12);
}

export function createProjectFromFirstCut(input: {
  cut: CutListItem;
  query: string;
  recentSearches: readonly ProjectSearchInput[];
  existingProjects?: readonly CutterProject[];
  coverUrl?: string;
  now?: string;
}): CutterProject {
  const now = input.now ?? new Date().toISOString();
  const title = projectAutoTitleFromDate(now, input.existingProjects);
  const searches = [
    ...(input.query.trim()
      ? [
          {
            query: input.query.trim(),
            hitCount: 1
          }
        ]
      : []),
    ...input.recentSearches
  ]
    .reverse()
    .reduce<CutterProjectSearch[]>((current, search) => recordProjectSearch(current, search, now), []);

  return {
    project_id: projectIdFromDate(now),
    title,
    title_source: "auto",
    status: "active",
    created_at: now,
    updated_at: now,
    clip_count: 1,
    running_count: 0,
    failed_count: 0,
    searches,
    ...(input.coverUrl ? { cover_url: input.coverUrl } : {}),
    source_title: input.cut.source_title
  };
}

export function recordProjectCut(
  project: CutterProject,
  input: {
    status?: "pending" | "running" | "done" | "failed";
    coverUrl?: string;
    now?: string;
  } = {}
): CutterProject {
  const now = input.now ?? new Date().toISOString();
  const status = input.status ?? "pending";

  return {
    ...project,
    updated_at: now,
    clip_count: project.clip_count + 1,
    running_count: status === "pending" || status === "running"
      ? project.running_count + 1
      : project.running_count,
    failed_count: status === "failed" ? project.failed_count + 1 : project.failed_count,
    cover_url: project.cover_url ?? input.coverUrl
  };
}

export function readCutterProjects(): CutterProjectsState {
  const storage = safeStorage();
  if (!storage) {
    return { projects: [] };
  }

  try {
    const projects = JSON.parse(storage.getItem(CUTTER_PROJECTS_STORAGE_KEY) ?? "[]") as CutterProject[];
    const currentProjectId = storage.getItem(CUTTER_CURRENT_PROJECT_STORAGE_KEY) ?? undefined;

    return {
      projects: sortProjects(projects),
      ...(currentProjectId ? { currentProjectId } : {})
    };
  } catch {
    return { projects: [] };
  }
}

export function writeCutterProjects(projects: readonly CutterProject[], currentProjectId?: string): void {
  const storage = safeStorage();
  if (!storage) {
    return;
  }

  const sortedProjects = sortProjects(projects);
  storage.setItem(CUTTER_PROJECTS_STORAGE_KEY, JSON.stringify(sortedProjects));
  if (currentProjectId) {
    storage.setItem(CUTTER_CURRENT_PROJECT_STORAGE_KEY, currentProjectId);
  } else {
    storage.removeItem(CUTTER_CURRENT_PROJECT_STORAGE_KEY);
  }
}

export function upsertCutterProject(
  projects: readonly CutterProject[],
  nextProject: CutterProject
): CutterProject[] {
  return sortProjects([
    nextProject,
    ...projects.filter((project) => project.project_id !== nextProject.project_id)
  ]);
}

export function projectSwitcherLabel(project: CutterProject | null | undefined): string {
  return project ? `当前项目：${projectDisplayTitle(project)}` : "临时搜索";
}
