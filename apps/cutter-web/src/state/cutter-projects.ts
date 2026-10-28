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
  detail_cover_url?: string;
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

export function createProjectFromSearch(input: {
  query: string;
  existingProjects?: readonly CutterProject[];
  now?: string;
}): CutterProject {
  const now = input.now ?? new Date().toISOString();
  const query = input.query.trim();

  return {
    project_id: projectIdFromDate(now),
    title: projectAutoTitleFromDate(now, input.existingProjects),
    title_source: "auto",
    status: "active",
    created_at: now,
    updated_at: now,
    clip_count: 0,
    running_count: 0,
    failed_count: 0,
    searches: query
      ? [
          {
            query,
            hit_count: 0,
            searched_at: now
          }
        ]
      : []
  };
}

export function createEmptyProject(input: {
  title?: string;
  existingProjects?: readonly CutterProject[];
  now?: string;
} = {}): CutterProject {
  const now = input.now ?? new Date().toISOString();
  const manualTitle = input.title?.trim() ?? "";

  return {
    project_id: projectIdFromDate(now),
    title: manualTitle || projectAutoTitleFromDate(now, input.existingProjects),
    title_source: manualTitle ? "manual" : "auto",
    status: "active",
    created_at: now,
    updated_at: now,
    clip_count: 0,
    running_count: 0,
    failed_count: 0,
    searches: []
  };
}

export function projectHomeSearchDraft(input: {
  query: string;
  projects: readonly CutterProject[];
  selectedProjectId?: string;
  now?: string;
}): { project: CutterProject; projects: CutterProject[]; created: boolean } | undefined {
  const query = input.query.trim();
  if (!query) {
    return undefined;
  }

  const selectedProject = input.selectedProjectId
    ? input.projects.find((project) => project.project_id === input.selectedProjectId)
    : undefined;

  if (!selectedProject) {
    const project = createProjectFromSearch({
      query,
      existingProjects: input.projects,
      now: input.now
    });

    return {
      project,
      projects: upsertCutterProject(input.projects, project),
      created: true
    };
  }

  const now = input.now ?? new Date().toISOString();
  const project = {
    ...selectedProject,
    updated_at: now,
    searches: recordProjectSearch(selectedProject.searches, { query, hitCount: 0 }, now)
  };

  return {
    project,
    projects: upsertCutterProject(input.projects, project),
    created: false
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

export const CUTTER_PROJECTS_CORRUPT_STORAGE_KEY = "mixlab.cutter.projects.corrupt";

const PROJECT_STATUSES: readonly CutterProjectStatus[] = ["active", "delivered", "archived"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizedProjectSearch(value: unknown): CutterProjectSearch | null {
  if (!isRecord(value)) {
    return null;
  }

  const query = stringValue(value.query).trim();
  if (!query) {
    return null;
  }

  return {
    query,
    hit_count: Math.max(0, Math.round(finiteNumber(value.hit_count, 0))),
    searched_at: stringValue(value.searched_at)
  };
}

function normalizedProject(value: unknown): CutterProject | null {
  if (!isRecord(value)) {
    return null;
  }

  const projectId = stringValue(value.project_id).trim();
  const title = stringValue(value.title);
  if (!projectId) {
    return null;
  }

  const createdAt = stringValue(value.created_at) || new Date(0).toISOString();
  const status = typeof value.status === "string" &&
    (PROJECT_STATUSES as readonly string[]).includes(value.status)
    ? (value.status as CutterProjectStatus)
    : "active";
  const titleSource = value.title_source === "manual" || value.title_source === "auto"
    ? value.title_source
    : undefined;
  const searches = Array.isArray(value.searches)
    ? value.searches
        .map((entry) => normalizedProjectSearch(entry))
        .filter((entry): entry is CutterProjectSearch => entry !== null)
        .slice(0, 12)
    : [];

  return {
    project_id: projectId,
    title,
    ...(titleSource ? { title_source: titleSource } : {}),
    status,
    created_at: createdAt,
    updated_at: stringValue(value.updated_at) || createdAt,
    clip_count: Math.max(0, Math.round(finiteNumber(value.clip_count, 0))),
    running_count: Math.max(0, Math.round(finiteNumber(value.running_count, 0))),
    failed_count: Math.max(0, Math.round(finiteNumber(value.failed_count, 0))),
    searches,
    ...(typeof value.cover_url === "string" && value.cover_url ? { cover_url: value.cover_url } : {}),
    ...(typeof value.detail_cover_url === "string" && value.detail_cover_url
      ? { detail_cover_url: value.detail_cover_url }
      : {}),
    ...(typeof value.source_title === "string" && value.source_title
      ? { source_title: value.source_title }
      : {})
  };
}

export interface CutterProjectsParseResult {
  projects: CutterProject[];
  corrupted: boolean;
}

export function parseCutterProjects(serialized: string | null | undefined): CutterProjectsParseResult {
  if (!serialized) {
    return { projects: [], corrupted: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return { projects: [], corrupted: true };
  }

  if (!Array.isArray(parsed)) {
    return { projects: [], corrupted: true };
  }

  let corrupted = false;
  const projects: CutterProject[] = [];
  for (const entry of parsed) {
    const project = normalizedProject(entry);
    if (!project) {
      corrupted = true;
      continue;
    }

    projects.push(project);
  }

  return { projects, corrupted };
}

function storeCorruptProjects(storage: Storage, raw: string): void {
  try {
    storage.setItem(CUTTER_PROJECTS_CORRUPT_STORAGE_KEY, raw);
  } catch {
    // Best-effort backup only; recovery must not depend on writable storage.
  }
}

export function readCutterProjects(
  storage: Storage | null | undefined = safeStorage()
): CutterProjectsState {
  if (!storage) {
    return { projects: [] };
  }

  let raw: string | null = null;
  try {
    raw = storage.getItem(CUTTER_PROJECTS_STORAGE_KEY);
  } catch {
    return { projects: [] };
  }

  if (!raw) {
    return { projects: [] };
  }

  const parsed = parseCutterProjects(raw);
  if (parsed.corrupted) {
    storeCorruptProjects(storage, raw);
  }

  const projects = sortProjects(parsed.projects);
  let currentProjectId: string | undefined;
  try {
    currentProjectId = storage.getItem(CUTTER_CURRENT_PROJECT_STORAGE_KEY) ?? undefined;
  } catch {
    currentProjectId = undefined;
  }

  const validCurrentProjectId =
    currentProjectId && projects.some((project) => project.project_id === currentProjectId)
      ? currentProjectId
      : undefined;

  return {
    projects,
    ...(validCurrentProjectId ? { currentProjectId: validCurrentProjectId } : {})
  };
}

export function writeCutterProjects(
  projects: readonly CutterProject[],
  currentProjectId?: string,
  storage: Storage | null | undefined = safeStorage()
): void {
  if (!storage) {
    return;
  }

  const sortedProjects = sortProjects(projects);
  try {
    storage.setItem(CUTTER_PROJECTS_STORAGE_KEY, JSON.stringify(sortedProjects));
    if (currentProjectId) {
      storage.setItem(CUTTER_CURRENT_PROJECT_STORAGE_KEY, currentProjectId);
    } else {
      storage.removeItem(CUTTER_CURRENT_PROJECT_STORAGE_KEY);
    }
  } catch {
    // Quota/private-mode failures must not break project interactions; the
    // in-memory state stays authoritative until storage is writable again.
  }
}

export function clearCutterCurrentProject(): void {
  const storage = safeStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(CUTTER_CURRENT_PROJECT_STORAGE_KEY);
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

export function removeCutterProject(
  state: CutterProjectsState,
  projectId: string
): CutterProjectsState {
  const projects = sortProjects(state.projects.filter((project) => project.project_id !== projectId));
  const currentProjectId =
    state.currentProjectId && projects.some((project) => project.project_id === state.currentProjectId)
      ? state.currentProjectId
      : undefined;

  return {
    projects,
    ...(currentProjectId ? { currentProjectId } : {})
  };
}

export function projectSwitcherLabel(project: CutterProject | null | undefined): string {
  return project ? `当前项目：${projectDisplayTitle(project)}` : "未选择项目";
}
