import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  InspectorPanel,
  MacWindow,
  Sidebar
} from "@mixlab/ui-foundation";
import {
  CutterApiError,
  createCutterApiClient,
  type CutterAuthModeStatus,
  type CutterLoginApplication,
  type CutterLoginStatus,
  type CutterLoginStatusValue,
  type CutterRuntimeStatus,
  type SearchGroup,
  type SearchResponse,
  type SourceVideoCard
} from "../api.ts";
import {
  createFixtureCutterApiClient,
  emptySearchResponse,
  loadCutterWorkbenchData,
  resolveLocalClipUrls,
  resolveSourceVideoCardUrls,
  resolveSourceVideoDetailUrls,
  resolveSearchResponseUrls,
  type CutterFixtureData
} from "../fixture-client.ts";
import { CutQueuePage } from "../features/cut-queue/CutQueuePage.tsx";
import {
  LocalLibraryPage,
  type LocalClip,
  type LocalLibraryViewMode
} from "../features/local-library/LocalLibraryPage.tsx";
import {
  MaterialLocatorPage,
  type MaterialLocatorSearchStatus,
  type MaterialSearchHistoryItem
} from "../features/material-locator/MaterialLocatorPage.tsx";
import { PublicLibraryPage } from "../features/public-library/PublicLibraryPage.tsx";
import {
  ProjectHomePage,
  ProjectRenameDialog,
  type ProjectDeleteMode
} from "../features/project-home/ProjectHomePage.tsx";
import { SettingsPage } from "../features/settings/SettingsPage.tsx";
import {
  DesktopFirstRunPage,
  type DesktopSetupDiagnostics,
  type DesktopSetupStage
} from "../features/desktop/DesktopFirstRunPage.tsx";
import { SourceDetailPage } from "../features/source-detail/SourceDetailPage.tsx";
import {
  CUT_LIST_STORAGE_KEY,
  clearCutList,
  createCutListItemFromSegments,
  deserializeCutList,
  moveCutListItem,
  removeCutListItem,
  serializeCutList,
  toCreateClipListRequest,
  type CutListItem,
  type CutMode,
  type MoveDirection
} from "../state/cut-list.ts";
import {
  buildMaterialLocatorSections,
  localClipToSourceVideoDetail,
  normalizedMaterialSearchQuery,
  type BuildMaterialLocatorSectionsInput,
  type MaterialLocatorResult,
  type MaterialSearchSourceFilter
} from "../state/material-locator.ts";
import {
  clearCutterAuthSession,
  clearCutterPendingLogin,
  createDeviceId,
  readCutterPendingLogin,
  readCutterAuthSession,
  writeCutterPendingLogin,
  writeCutterAuthSession,
  type CutterAuthSession,
  type CutterPendingLogin
} from "../auth.ts";
import { CutterLoginGate } from "../features/login/CutterLoginGate.tsx";
import {
  createQueueJobsFromCutList,
  filterCutQueueJobsByProject,
  mapApiCutJobsToQueueJobs,
  readCutJobProjectIndex,
  rememberCutJobsForProject,
  removeCutJobsForProject,
  replaceQueueJobWithSubmittedJobs,
  updateQueueJobStatus,
  writeCutJobProjectIndex,
  type CutJobProjectIndex,
  type CutQueueJob
} from "../state/cut-queue.ts";
import {
  hasActiveCutJobs,
  shouldAutoRefreshCutJobs,
  shouldRefreshLocalClipsAfterQueueUpdate
} from "../state/cut-task-refresh.ts";
import {
  idleCutPipelineState,
  runCutPipeline,
  type CutPipelineState
} from "../state/cut-pipeline.ts";
import {
  CUTTER_NAV_ITEMS,
  routeFromHash,
  routeTitle,
  routeToHash,
  searchHash,
  searchQueryFromHash,
  sourceDetailContextFromHash,
  sourceVideoIdFromHash,
  type CutterRoute
} from "./navigation.ts";

const CUTTER_PUBLIC_LIBRARY_INITIAL_LOAD_LIMIT = 20;
const MATERIAL_SEARCH_FIRST_BATCH_LIMIT = 10;
const MATERIAL_SEARCH_BACKGROUND_BATCH_LIMIT = 40;
const DEFAULT_LOCAL_CUTTER_API_BASE_URL = "http://127.0.0.1:3789/";

function mergeSourceVideoCards(
  current: readonly SourceVideoCard[],
  next: readonly SourceVideoCard[]
): SourceVideoCard[] {
  const byId = new Map<string, SourceVideoCard>();

  for (const video of current) {
    byId.set(video.source_video_id, video);
  }

  for (const video of next) {
    byId.set(video.source_video_id, video);
  }

  return Array.from(byId.values());
}
import {
  chooseDesktopDirectory,
  desktopAppVersion,
  defaultDesktopWorkspaceRoot,
  desktopConfigPath,
  desktopLogDirectory,
  openDesktopDirectory,
  readDesktopConfig,
  resolveDesktopBridgeEnvironment,
  resolveRuntimeApiBaseUrl,
  runDesktopDoctor,
  startDesktopEngine,
  writeDesktopConfig,
  type DesktopConfig,
  type DesktopDoctorResult
} from "../desktop-bridge.ts";
import {
  continuousTranscriptSelection,
  continuousTranscriptSegments,
  nextTranscriptSelectionRange,
  transcriptSelectionRangeFromHitSegments,
  transcriptSelectionRangeFromDrag,
  transcriptSelectionRangeFromText,
  type TranscriptSelectionRange
} from "../state/transcript-selection.ts";
import {
  appendCompletedLocalClip,
  localClipFromCutListItem
} from "../state/local-clip-reuse.ts";
import type { VideoOrientationFilter } from "../state/video-orientation.ts";
import {
  readCutterAppearanceMode,
  writeCutterAppearanceMode,
  type CutterAppearanceMode
} from "../state/appearance.ts";
import {
  clearCutterCurrentProject,
  createEmptyProject,
  createProjectFromFirstCut,
  projectDisplayTitle,
  projectHomeSearchDraft,
  projectSwitcherLabel,
  readCutterProjects,
  recordProjectCut,
  recordProjectSearch,
  removeCutterProject,
  upsertCutterProject,
  writeCutterProjects,
  type CutterProject
} from "../state/cutter-projects.ts";

export function resolveCutterRuntimeApiBaseUrl(input: {
  viteApiBaseUrl?: string;
  useFixtureData?: boolean;
  globalLike?: Parameters<typeof resolveRuntimeApiBaseUrl>[0]["global_like"];
  locationOrigin?: string;
}): string {
  if (input.useFixtureData) {
    return "";
  }

  const configured = input.viteApiBaseUrl?.trim();
  return resolveRuntimeApiBaseUrl({
    vite_api_base_url: configured || DEFAULT_LOCAL_CUTTER_API_BASE_URL,
    global_like: input.globalLike,
    location_origin: input.locationOrigin
  });
}

function getRuntimeApiBaseUrl(): string {
  return resolveCutterRuntimeApiBaseUrl({
    viteApiBaseUrl: import.meta.env?.VITE_MIXLAB_CUTTER_API_BASE_URL,
    useFixtureData: import.meta.env?.VITE_MIXLAB_USE_FIXTURE_DATA === "true"
  });
}

function createRuntimeClient(baseUrl: string, authSession: CutterAuthSession | null) {
  return baseUrl
    ? createCutterApiClient({
        base_url: baseUrl,
        ...(authSession
          ? {
              auth: {
                device_id: authSession.device_id,
                session_token: authSession.session_token
              }
            }
          : {})
      })
    : createFixtureCutterApiClient();
}

export function shouldShowLoginGate(
  apiMode: boolean,
  status: CutterLoginStatusValue,
  _options: { desktopTrusted?: boolean } = {}
): boolean {
  return apiMode && status !== "approved";
}

export function initialCutterLoginStatus(input: {
  apiMode: boolean;
  authSession: CutterAuthSession | null;
}): CutterLoginStatusValue {
  if (!input.apiMode) {
    return "approved";
  }

  return input.authSession ? "approved" : "unknown";
}

export function shouldLoadWorkbenchData(input: {
  desktopSetupReady: boolean;
  loginGateVisible: boolean;
}): boolean {
  return input.desktopSetupReady && !input.loginGateVisible;
}

export function shouldClearFixtureDataForRuntime(input: {
  apiMode: boolean;
  runtimeMode?: CutterRuntimeStatus["mode"];
}): boolean {
  return input.apiMode && input.runtimeMode === "fixture";
}

export function shouldRefreshCutQueueForRoute(input: {
  apiMode: boolean;
  hasData: boolean;
  loginGateVisible: boolean;
  currentProjectId?: string;
  route: CutterRoute;
}): boolean {
  return (
    input.apiMode &&
    input.hasData &&
    !input.loginGateVisible &&
    (input.route === "cut-tasks" ||
      (input.route === "material-locator" && Boolean(input.currentProjectId)))
  );
}

export function projectIdForWorkbenchRoute(input: {
  route: CutterRoute;
  currentProjectId?: string;
  homeSelectedProjectId?: string;
  projectIds: readonly string[];
}): string | undefined {
  if (input.route === "project-home" || input.currentProjectId) {
    return input.currentProjectId;
  }

  return input.homeSelectedProjectId && input.projectIds.includes(input.homeSelectedProjectId)
    ? input.homeSelectedProjectId
    : undefined;
}

export function shouldShowCutterToolbar(route: CutterRoute): boolean {
  return false;
}

export function materialLocatorSearchQueryForHashChange(input: {
  hash: string;
  currentSearchQuery: string;
}): string {
  const nextRoute = routeFromHash(input.hash);
  if (nextRoute !== "material-locator") {
    return input.currentSearchQuery;
  }

  const queryFromHash = searchQueryFromHash(input.hash).trim();
  return queryFromHash || input.currentSearchQuery;
}

export function shouldStartMaterialSearchForHashChange(input: {
  hash: string;
  currentSearchQuery: string;
  nextSearchQuery: string;
}): boolean {
  return (
    routeFromHash(input.hash) === "material-locator" &&
    input.nextSearchQuery.trim().length > 0 &&
    normalizeLocatorQuery(input.nextSearchQuery) !== normalizeLocatorQuery(input.currentSearchQuery)
  );
}

export function loginStatusFromApplication(application: CutterLoginApplication): CutterLoginStatusValue {
  return application.user.status;
}

export function loginStatusFromBackendStatus(status: CutterLoginStatus): CutterLoginStatusValue {
  if (!status.ok) {
    const userStatus = status.user?.status;
    return userStatus && userStatus !== "approved" ? userStatus : "unknown";
  }

  return status.user.status === "approved" ? "approved" : status.user.status;
}

export function loginMessageFromBackendStatus(status: CutterLoginStatus): string {
  return status.ok ? "" : status.message ?? status.reason ?? "";
}

export function authSessionFromApprovedApplication(
  application: CutterLoginApplication
): CutterAuthSession | null {
  if (application.user.status !== "approved" || !application.session) {
    return null;
  }

  return {
    user_id: application.user.user_id,
    username: application.user.username,
    device_id: application.session.device_id,
    session_token: application.session.session_token
  };
}

export function loginGateStatusFromApplication(application: CutterLoginApplication): CutterLoginStatusValue {
  const status = loginStatusFromApplication(application);
  return status === "approved" && !authSessionFromApprovedApplication(application) ? "unknown" : status;
}

export function shouldClearSessionForLoginStatusError(error: unknown): boolean {
  return error instanceof CutterApiError && error.status === 401 && error.code === "login_required";
}

export function loginMessageForAuthError(error: unknown): string {
  if (shouldClearSessionForLoginStatusError(error)) {
    return "登录已失效，请重新申请或联系管理员。";
  }

  return error instanceof Error ? error.message : "登录状态校验失败，请重新申请或联系管理员。";
}

export function shouldRetryPendingLoginError(error: unknown): boolean {
  return !(error instanceof CutterApiError) || error.status >= 500;
}

export function shouldPollPendingLogin(input: {
  apiMode: boolean;
  authSession: CutterAuthSession | null;
  pendingLogin: CutterPendingLogin | null;
}): boolean {
  return input.apiMode && !input.authSession && Boolean(input.pendingLogin);
}

export function shouldAutoApplyLocalTrustedLogin(input: {
  apiMode: boolean;
  authModeStatus: CutterAuthModeStatus | null;
  authSession: CutterAuthSession | null;
  pendingLogin: CutterPendingLogin | null;
  loginStatus: CutterLoginStatusValue;
  alreadyAttempted: boolean;
}): boolean {
  return (
    input.apiMode &&
    input.authModeStatus?.local_trusted === true &&
    !input.authSession &&
    !input.pendingLogin &&
    input.loginStatus === "unknown" &&
    !input.alreadyAttempted
  );
}

export function CutterSidebarFooter({
  username,
  localCount,
  publicCount,
  activeTaskCount,
  engineReady,
  currentProjectLabel = "未选择",
  libraryCountOrder = "local-first",
  cacheBytes
}: {
  username: string;
  localCount: number;
  publicCount: number;
  activeTaskCount: number;
  engineReady: boolean;
  currentProjectLabel?: string;
  libraryCountOrder?: "local-first" | "public-first";
  cacheBytes?: number;
}) {
  const [cacheMenuOpen, setCacheMenuOpen] = useState(false);
  const [localCacheBytes, setLocalCacheBytes] = useState(() => cacheBytes ?? cutterLocalCacheSnapshot().bytes);
  const libraryCountLabel =
    libraryCountOrder === "public-first"
      ? `公共 ${publicCount} / 本地 ${localCount}`
      : `本地 ${publicCount} / 公共 ${localCount}`;
  const displayCacheBytes = cacheBytes ?? localCacheBytes;
  const cacheLabel = formatCutterCacheSize(displayCacheBytes);

  useEffect(() => {
    if (typeof cacheBytes === "number") {
      setLocalCacheBytes(cacheBytes);
    }
  }, [cacheBytes]);

  function handleClearCache() {
    clearCutterLocalCache();
    setLocalCacheBytes(0);
    setCacheMenuOpen(false);
  }

  return (
    <div className="cutter-sidebar-footer" aria-label="剪辑端状态">
      <section className="cutter-sidebar-engine-card">
        <div>
          <span>当前项目</span>
          <strong title={currentProjectLabel}>{currentProjectLabel}</strong>
        </div>
        <div>
          <span>素材库</span>
          <strong>{libraryCountLabel}</strong>
        </div>
        <div>
          <span>剪切任务</span>
          <strong>{activeTaskCount > 0 ? `${activeTaskCount} 个处理中` : "空闲"}</strong>
        </div>
        <div>
          <span>本机服务</span>
          <strong className={engineReady ? "is-ready" : "is-failed"}>
            {engineReady ? "正常" : "需检查"}
          </strong>
        </div>
      </section>
      <div className="cutter-sidebar-user-entry" aria-label="当前用户">
        <span className="cutter-sidebar-user-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" role="img">
            <circle cx="12" cy="8.5" r="3.2" />
            <path d="M5.8 19.5a6.8 6.8 0 0 1 12.4 0" />
          </svg>
        </span>
        <strong title={username}>{username}</strong>
        <button
          type="button"
          className="cutter-sidebar-cache-button"
          aria-haspopup="menu"
          aria-expanded={cacheMenuOpen}
          onClick={() => setCacheMenuOpen((open) => !open)}
        >
          <span>缓存</span>
          <strong>{cacheLabel}</strong>
        </button>
        {cacheMenuOpen ? (
          <div className="cutter-sidebar-cache-menu" role="menu" aria-label="缓存操作">
            <button type="button" role="menuitem" onClick={handleClearCache}>
              清除本地缓存
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CutterProjectSwitcher({
  project,
  onReturnHome,
  onRenameProject
}: {
  project?: CutterProject;
  onReturnHome?: () => void;
  onRenameProject?: () => void;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const closeMenu = () => {
    menuRef.current?.removeAttribute("open");
  };

  return (
    <details className="cutter-project-switcher" ref={menuRef}>
      <summary>{projectSwitcherLabel(project)}</summary>
      <div>
        <button
          type="button"
          onClick={() => {
            closeMenu();
            onReturnHome?.();
          }}
        >
          回到首页
        </button>
        <a href="#/cut-tasks" onClick={closeMenu}>查看项目剪切任务</a>
        {project ? (
          <>
            <button
              type="button"
              onClick={() => {
                closeMenu();
                onRenameProject?.();
              }}
            >
              重命名当前项目
            </button>
          </>
        ) : null}
      </div>
    </details>
  );
}

function buildQueueFixture(jobs: CutQueueJob[]): CutQueueJob[] {
  const base = jobs[0];

  if (!base) {
    return [];
  }

  return [
    base,
    { ...base, queue_job_id: "job-running", status: "running", progress: 67 },
    { ...base, queue_job_id: "job-done", status: "done", progress: 100 },
    {
      ...base,
      queue_job_id: "job-failed",
      status: "failed",
      progress: 18,
      error_message: "FFmpeg 输出目录不可写"
    }
  ];
}

function cutterProjectTitlesById(projects: readonly CutterProject[]): Record<string, string> {
  return Object.fromEntries(
    projects.map((project) => [project.project_id, projectDisplayTitle(project)])
  );
}

export function appendDirectCutFixtureQueue(
  current: readonly CutQueueJob[],
  item: CutListItem,
  createdAt: string,
  projectTitle?: string
): CutQueueJob[] {
  return [
    ...createQueueJobsFromCutList([{ ...item, order: 1 }], {
      createdAt,
      projectTitle
    }),
    ...current
  ];
}

export function materialFocusFromResult(result: MaterialLocatorResult): {
  currentSegmentId: string | undefined;
  highlightedSegmentIds: string[];
} {
  const highlightedSegmentIds =
    materialHitSegmentGroups(result)[0]?.map((segment) => segment.segment_id) ?? [];

  return {
    currentSegmentId: highlightedSegmentIds[0],
    highlightedSegmentIds
  };
}

export interface MaterialLocatorHitTarget {
  materialKey: string;
  material: MaterialLocatorResult;
  segmentId: string;
  highlightedSegmentIds: string[];
  hitSegments: MaterialLocatorResult["segments"];
}

export function materialKeyFromResult(result: MaterialLocatorResult): string {
  return `${result.source}:${result.id}`;
}

function materialHitSegmentGroups(result: MaterialLocatorResult): MaterialLocatorResult["segments"][] {
  const groups = new Map<string, MaterialLocatorResult["segments"]>();

  for (const segment of result.segments) {
    const key = segment.match_id || segment.segment_id;
    const current = groups.get(key) ?? [];
    current.push(segment);
    groups.set(key, current);
  }

  return [...groups.values()];
}

export function materialLocatorHitTargets(input: BuildMaterialLocatorSectionsInput): MaterialLocatorHitTarget[] {
  return buildMaterialLocatorSections(input).flatMap((section) =>
    section.items.flatMap((material) =>
      materialHitSegmentGroups(material).map((segments) => ({
        materialKey: materialKeyFromResult(material),
        material,
        segmentId: segments[0]?.segment_id ?? "",
        highlightedSegmentIds: segments.map((segment) => segment.segment_id),
        hitSegments: segments
      }))
    )
  );
}

export function initialMaterialLocatorHitTargetIndex(
  targets: readonly MaterialLocatorHitTarget[],
  sourceFilter: MaterialSearchSourceFilter
): number {
  if (targets.length === 0) {
    return -1;
  }

  if (sourceFilter !== "local") {
    const publicIndex = targets.findIndex((target) => target.material.source === "public");
    if (publicIndex >= 0) {
      return publicIndex;
    }
  }

  return 0;
}

export function shouldAutofocusMaterialLocatorResult(input: {
  route: CutterRoute;
  query: string;
  selectedMaterialKey?: string;
  hitTargetCount: number;
}): boolean {
  return (
    input.route === "material-locator" &&
    input.query.trim().length > 0 &&
    !input.selectedMaterialKey &&
    input.hitTargetCount > 0
  );
}

export function nextMaterialLocatorHitIndex(
  currentIndex: number,
  direction: "previous" | "next",
  total: number
): number {
  if (total <= 0) {
    return 0;
  }

  return direction === "previous"
    ? (currentIndex - 1 + total) % total
    : (currentIndex + 1) % total;
}

export function nextMaterialSearchHistory(
  current: readonly MaterialSearchHistoryItem[],
  next: MaterialSearchHistoryItem
): MaterialSearchHistoryItem[] {
  const query = next.query.trim();
  if (!query) {
    return [...current];
  }

  return [
    { query, hitCount: next.hitCount },
    ...current.filter((item) => item.query !== query)
  ].slice(0, 6);
}

function searchGroupIdentity(group: SearchGroup): string {
  return group.source_video_id;
}

function searchSegmentIdentity(segment: SearchGroup["hit_segments"][number]): string {
  return [
    segment.match_id ?? "",
    segment.segment_id,
    segment.begin_ms,
    segment.end_ms,
    segment.text
  ].join("|");
}

function mergeSearchGroup(current: SearchGroup, next: SearchGroup): SearchGroup {
  const segments = [...current.hit_segments];
  const seen = new Set(segments.map(searchSegmentIdentity));

  for (const segment of next.hit_segments) {
    const key = searchSegmentIdentity(segment);
    if (!seen.has(key)) {
      seen.add(key);
      segments.push(segment);
    }
  }

  return {
    ...current,
    ...next,
    best_excerpt: current.best_excerpt || next.best_excerpt,
    hit_segments: segments,
    hit_count: Math.max(current.hit_count, next.hit_count, segments.length),
    transcript_character_count:
      next.transcript_character_count ?? current.transcript_character_count
  };
}

export function mergeMaterialSearchResponses(
  current: SearchResponse,
  next: SearchResponse
): SearchResponse {
  const currentQuery = normalizeLocatorQuery(current.normalized_query || current.query);
  const nextQuery = normalizeLocatorQuery(next.normalized_query || next.query);

  if (!currentQuery || currentQuery !== nextQuery) {
    return next;
  }

  const groupsById = new Map<string, SearchGroup>();
  const order: string[] = [];

  for (const group of current.groups) {
    const key = searchGroupIdentity(group);
    if (!groupsById.has(key)) {
      order.push(key);
      groupsById.set(key, group);
    }
  }

  for (const group of next.groups) {
    const key = searchGroupIdentity(group);
    const existing = groupsById.get(key);
    if (existing) {
      groupsById.set(key, mergeSearchGroup(existing, group));
    } else {
      order.push(key);
      groupsById.set(key, group);
    }
  }

  const groups = order
    .map((key) => groupsById.get(key))
    .filter((group): group is SearchGroup => Boolean(group));

  return {
    ...current,
    ...next,
    query: current.query || next.query,
    normalized_query: current.normalized_query || next.normalized_query,
    groups,
    returned_count: groups.length,
    search_ms:
      typeof current.search_ms === "number" || typeof next.search_ms === "number"
        ? Math.max(0, (current.search_ms ?? 0) + (next.search_ms ?? 0))
        : undefined,
    index_version: next.index_version || current.index_version,
    search_mode: next.search_mode || current.search_mode
  };
}

export function materialSearchHitCount(search: SearchResponse): number {
  return search.groups.reduce((sum, group) => sum + group.hit_count, 0);
}

export function materialSearchFailureFeedback(input: {
  hasFirstPage: boolean;
  error: unknown;
}): { notice: string; error: string } {
  if (input.hasFirstPage) {
    return {
      notice: "后续搜索结果加载失败，可继续使用首批结果",
      error: ""
    };
  }

  return {
    notice: "",
    error: input.error instanceof Error ? input.error.message : "搜索结果加载失败"
  };
}

export function materialSearchStatusLabels(input: {
  pending: boolean;
  search?: SearchResponse;
  runtimeSearchBackend?: CutterRuntimeStatus["search_backend"];
  availableVideoCount?: number;
  fallbackLabel: string;
  elapsedMs?: number;
}): MaterialLocatorSearchStatus {
  const search = input.search;
  const backend = input.runtimeSearchBackend;
  const backendSourceCount =
    typeof backend?.source_video_count === "number" && Number.isFinite(backend.source_video_count)
      ? Math.max(0, Math.round(backend.source_video_count))
      : undefined;
  const availableVideoCount =
    typeof input.availableVideoCount === "number" && Number.isFinite(input.availableVideoCount)
      ? Math.max(0, Math.round(input.availableVideoCount))
      : undefined;
  const searchIndexSyncing =
    Boolean(backend?.healthy) &&
    !backend?.degraded &&
    backendSourceCount !== undefined &&
    availableVideoCount !== undefined &&
    backendSourceCount > 0 &&
    availableVideoCount > 0 &&
    backendSourceCount !== availableVideoCount;
  const degraded =
    search?.search_mode === "transcript-artifact-fallback" ||
    backend?.mode === "transcript-artifact-fallback" ||
    Boolean(backend?.degraded);
  const visibleSourceCount = backendSourceCount ?? availableVideoCount;
  const indexLabel = degraded
    ? "部分素材可用"
    : typeof visibleSourceCount === "number"
      ? `已发布 ${visibleSourceCount} 条`
      : "可用";
  const syncLabel = searchIndexSyncing
    ? "素材更新中"
    : input.pending
    ? search && search.groups.length > 0
      ? "继续匹配"
      : "正在匹配"
    : degraded
      ? "部分结果可用"
      : "可搜索";
  const searchLatency =
    search && search.groups.length > 0 && typeof search.search_ms === "number"
      ? search.search_ms
      : typeof input.elapsedMs === "number"
        ? input.elapsedMs
        : search?.search_ms ?? backend?.response_ms;

  return {
    indexLabel,
    syncLabel,
    searchLatencyLabel: input.pending && !search?.groups.length
      ? "匹配中"
      : search && search.groups.length > 0
        ? "已返回"
        : typeof searchLatency === "number"
          ? "就绪"
          : input.fallbackLabel === "Fixture"
            ? "演示数据"
            : input.fallbackLabel,
    nasLabel: degraded ? "部分结果可用" : "已连接"
  };
}

function normalizeLocatorQuery(query: string): string {
  return normalizedMaterialSearchQuery(query);
}

export function mergeMaterialLocatorReloadData(
  current: CutterFixtureData | null,
  next: CutterFixtureData,
  activeSearchQuery: string
): CutterFixtureData {
  const normalizedActiveQuery = normalizeLocatorQuery(activeSearchQuery);
  const normalizedCurrentSearchQuery = current
    ? normalizeLocatorQuery(current.search.normalized_query || current.search.query)
    : "";

  if (current && normalizedActiveQuery && normalizedCurrentSearchQuery === normalizedActiveQuery) {
    return {
      ...next,
      search: current.search
    };
  }

  return next;
}

export function cutNoticeForSubmittedJobs(count: number): string {
  return count > 0 ? `已加入剪切任务 · 等待中 ${count}` : "";
}

export function cutNoticeForCompletedLocalClips(count: number): string {
  return count > 0 ? `剪切完成 · 本地素材已更新 ${count}` : "";
}

export function cutNoticeForPipelineResult(result: CutPipelineState): string {
  if (result.done_count > 0 && result.failed_count > 0) {
    return `剪切完成 ${result.done_count} 个 · 失败 ${result.failed_count} 个`;
  }

  if (result.failed_count > 0) {
    return `剪切失败 ${result.failed_count} 个`;
  }

  return cutNoticeForCompletedLocalClips(result.done_count);
}

function defaultCutListForData(data: CutterFixtureData): CutListItem[] {
  const selectedSegments = data.primaryDetail.transcript.segments.slice(1, 4);

  return [
    createCutListItemFromSegments({
      sourceVideo: data.primaryDetail,
      segments: selectedSegments,
      cutMode: data.settings.default_cut_mode,
      order: 1,
      title: `${data.primaryDetail.title} 片段`
    })
  ];
}

function defaultDesktopConfig(localWorkspaceRoot = "", logRoot = ""): DesktopConfig {
  return {
    api_host: "127.0.0.1",
    api_port: 3789,
    public_library_root: "",
    local_workspace_root: localWorkspaceRoot,
    ...(logRoot ? { log_root: logRoot } : {})
  };
}

function desktopSetupStageForConfig(config: DesktopConfig): DesktopSetupStage {
  if (!config.public_library_root) {
    return "choose-public-library";
  }

  if (!config.local_workspace_root) {
    return "choose-workspace";
  }

  return "doctor-ready";
}

function desktopDiagnosticsForState(input: {
  appVersion?: string;
  stage: DesktopSetupStage;
  config: DesktopConfig;
  latestError?: string;
  logPath?: string;
}): DesktopSetupDiagnostics {
  return {
    app_version: input.appVersion,
    stage: input.stage,
    api_address: `http://${input.config.api_host}:${input.config.api_port}`,
    log_path: input.logPath || input.config.log_root || (input.config.local_workspace_root ? `${input.config.local_workspace_root}\\logs` : ""),
    public_library_root: input.config.public_library_root,
    local_workspace_root: input.config.local_workspace_root,
    ffmpeg_status: input.config.ffmpeg_path && input.config.ffprobe_path ? "已配置" : "随安装包内置",
    latest_error_summary: input.latestError
  };
}

function safeLocalStorageGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSetItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures so the login gate and workbench can still render.
  }
}

const CUTTER_CUT_MODE_STORAGE_KEY = "mixlab:cutter:default_cut_mode";
const CUTTER_SOURCE_FILTER_STORAGE_KEY = "mixlab:cutter:default_source_filter";
const CUTTER_ORIENTATION_FILTER_STORAGE_KEY = "mixlab:cutter:default_orientation_filter";
const CUTTER_CACHE_STORAGE_PREFIXES = ["mixlab:cutter:", "mixlab.cutter."] as const;
const CUTTER_PRESERVED_STORAGE_KEYS = new Set([
  "mixlab:cutter:auth_session",
  "mixlab:cutter:device_id",
  "mixlab:cutter:pending_login"
]);

export interface CutterLocalCacheSnapshot {
  bytes: number;
  keys: string[];
}

function localStorageSafe(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isCutterCacheStorageKey(key: string): boolean {
  return CUTTER_CACHE_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
    !CUTTER_PRESERVED_STORAGE_KEYS.has(key);
}

export function formatCutterCacheSize(bytes: number): string {
  if (bytes <= 0) {
    return "0 KB";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function cutterLocalCacheSnapshot(storage: Storage | null = localStorageSafe()): CutterLocalCacheSnapshot {
  if (!storage) {
    return { bytes: 0, keys: [] };
  }

  const keys: string[] = [];
  let bytes = 0;

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !isCutterCacheStorageKey(key)) {
        continue;
      }

      const value = storage.getItem(key) ?? "";
      keys.push(key);
      bytes += (key.length + value.length) * 2;
    }
  } catch {
    return { bytes: 0, keys: [] };
  }

  return { bytes, keys };
}

export function clearCutterLocalCache(storage: Storage | null = localStorageSafe()): CutterLocalCacheSnapshot {
  const snapshot = cutterLocalCacheSnapshot(storage);

  if (!storage) {
    return snapshot;
  }

  for (const key of snapshot.keys) {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore storage cleanup failures; cache clearing is best-effort.
    }
  }

  return snapshot;
}

function readCutterDefaultCutMode(): CutMode {
  const stored = safeLocalStorageGetItem(CUTTER_CUT_MODE_STORAGE_KEY);
  return stored === "precise" ? "precise" : "copy";
}

function writeCutterDefaultCutMode(mode: CutMode): void {
  safeLocalStorageSetItem(CUTTER_CUT_MODE_STORAGE_KEY, mode === "precise" ? "precise" : "copy");
}

function normalizeMaterialSearchSourceFilter(filter: string | null): MaterialSearchSourceFilter {
  return filter === "local" || filter === "public" ? filter : "all";
}

function normalizeVideoOrientationFilter(filter: string | null): VideoOrientationFilter {
  return filter === "landscape" || filter === "portrait" ? filter : "all";
}

function readCutterDefaultSourceFilter(): MaterialSearchSourceFilter {
  const stored = safeLocalStorageGetItem(CUTTER_SOURCE_FILTER_STORAGE_KEY);
  return stored ? normalizeMaterialSearchSourceFilter(stored) : "public";
}

function writeCutterDefaultSourceFilter(filter: MaterialSearchSourceFilter): void {
  safeLocalStorageSetItem(
    CUTTER_SOURCE_FILTER_STORAGE_KEY,
    normalizeMaterialSearchSourceFilter(filter)
  );
}

function readCutterDefaultOrientationFilter(): VideoOrientationFilter {
  return normalizeVideoOrientationFilter(safeLocalStorageGetItem(CUTTER_ORIENTATION_FILTER_STORAGE_KEY));
}

function writeCutterDefaultOrientationFilter(filter: VideoOrientationFilter): void {
  safeLocalStorageSetItem(
    CUTTER_ORIENTATION_FILTER_STORAGE_KEY,
    normalizeVideoOrientationFilter(filter)
  );
}

export function cutterDeviceNameFromNavigator(
  input: { platform?: string; userAgent?: string } | undefined
): string {
  if (!input) {
    return "剪辑工作站";
  }

  const platform = `${input.platform ?? ""} ${input.userAgent ?? ""}`.toLowerCase();
  const browser = input.userAgent?.includes("Edg/")
    ? "Edge"
    : input.userAgent?.includes("Chrome/")
      ? "Chrome"
      : input.userAgent?.includes("Safari/")
        ? "Safari"
        : "浏览器";

  if (platform.includes("mac")) {
    return `Mac 剪辑端 · ${browser}`;
  }
  if (platform.includes("win")) {
    return `Windows 剪辑端 · ${browser}`;
  }
  if (platform.includes("linux")) {
    return `Linux 剪辑端 · ${browser}`;
  }

  return `剪辑工作站 · ${browser}`;
}

function cutterDeviceName(): string {
  return typeof navigator === "undefined"
    ? "剪辑工作站"
    : cutterDeviceNameFromNavigator({
        platform: navigator.platform,
        userAgent: navigator.userAgent
  });
}

function renderPage(
  route: CutterRoute,
  data: CutterFixtureData,
  cutList: readonly CutListItem[],
  queue: readonly CutQueueJob[],
  viewState: {
    searchQuery: string;
    highlightedSegmentIds: readonly string[];
    currentHitIndex: number;
    currentHitSegmentId?: string;
    globalHitCount: number;
    selectedMaterialKey?: string;
    materialSearchPending: boolean;
    localLibrarySelectedClipId?: string;
    localLibraryViewMode: LocalLibraryViewMode;
    recentSearches: readonly MaterialSearchHistoryItem[];
    selectedSegments: ReturnType<typeof continuousTranscriptSegments>;
    selectedStartCharOffset?: number;
    selectedEndCharOffset?: number;
    highlightedHitSegments: MaterialLocatorResult["segments"];
    selectedDetail: CutterFixtureData["primaryDetail"];
    searchStatus: MaterialLocatorSearchStatus;
    projects: readonly CutterProject[];
    currentProject?: CutterProject;
    currentProjectId?: string;
    homeSelectedProjectId?: string;
    sourceFilter: MaterialSearchSourceFilter;
    orientationFilter: VideoOrientationFilter;
    publicLibraryOrientationFilter: VideoOrientationFilter;
    publicLibrarySelectedSourceVideoId?: string;
    sourceLibraryLoadingMore: boolean;
    cutNotice: string;
    autoRefreshCutJobs: boolean;
    lastQueueUpdatedLabel: string;
    cutPipelineState: CutPipelineState;
    apiBaseUrl: string;
    appearanceMode: CutterAppearanceMode;
    selectedCutMode: CutMode;
  },
  handlers: {
    addSelectedSpan: () => void;
    search: (query: string) => void;
    searchFromProjectHome: (query: string) => void;
    selectMaterial: (result: MaterialLocatorResult) => void;
    selectTranscriptSegment: (segmentId: string) => void;
    selectTranscriptRange: (startSegmentId: string, endSegmentId: string) => void;
    selectTranscriptTextRange: (
      startSegmentId: string,
      startCharOffset: number,
      endSegmentId: string,
      endCharOffset: number
    ) => void;
    navigateHit: (direction: "previous" | "next") => void;
    cancelTranscriptSelection: () => void;
    setSourceFilter: (filter: MaterialSearchSourceFilter) => void;
    setOrientationFilter: (filter: VideoOrientationFilter) => void;
    setPublicLibraryOrientationFilter: (filter: VideoOrientationFilter) => void;
    selectPublicSourceVideo: (sourceVideoId: string) => void;
    loadMoreSourceLibrary: () => void;
    selectProject: (projectId: string) => void;
    openProject: (projectId: string) => void;
    openProjectDirectory: (projectId: string) => void;
    createProject: (title: string) => void;
    renameProject: (projectId?: string) => void;
    deleteProject: (projectId: string, mode: ProjectDeleteMode) => void;
    moveCut: (cutListItemId: string, direction: MoveDirection) => void;
    removeCut: (cutListItemId: string) => void;
    clearCuts: () => void;
    submitCuts: () => void;
    refreshQueue?: () => void;
    runNextJob?: () => void;
    retryFailedCutJob?: (cutJobId: string) => void;
    openCutOutputDirectory: () => void;
    openLocalClipDirectory: (localClip: LocalClip) => void;
    selectLocalClip: (localClipId: string) => void;
    setLocalLibraryViewMode: (mode: LocalLibraryViewMode) => void;
    setAppearanceMode: (mode: CutterAppearanceMode) => void;
    setCutMode: (mode: CutMode) => void;
  }
) {
  if (route === "project-home") {
    return (
      <ProjectHomePage
        library={data.library}
        localClips={data.localClips}
        projects={viewState.projects}
        selectedProjectId={viewState.homeSelectedProjectId}
        queue={queue}
        onSearch={handlers.searchFromProjectHome}
        onSelectProject={handlers.selectProject}
        onOpenProject={handlers.openProject}
        onOpenProjectDirectory={handlers.openProjectDirectory}
        onCreateProject={handlers.createProject}
        onRenameProject={handlers.renameProject}
        onDeleteProject={handlers.deleteProject}
      />
    );
  }

  if (route === "source-detail") {
    return (
      <SourceDetailPage
        detail={data.primaryDetail}
        selectedSegments={viewState.selectedSegments}
        highlightedSegmentIds={viewState.highlightedSegmentIds}
        onSelectSegment={handlers.selectTranscriptSegment}
        onAddToCutList={handlers.addSelectedSpan}
      />
    );
  }

  if (route === "material-locator") {
    return (
      <MaterialLocatorPage
        library={data.library}
        localClips={data.localClips}
        search={data.search}
        query={viewState.searchQuery}
        sourceFilter={viewState.sourceFilter}
        orientationFilter={viewState.orientationFilter}
        selectedDetail={viewState.selectedDetail}
        selectedSegments={viewState.selectedSegments}
        selectedStartCharOffset={viewState.selectedStartCharOffset}
        selectedEndCharOffset={viewState.selectedEndCharOffset}
        highlightedSegmentIds={viewState.highlightedSegmentIds}
        highlightedHitSegments={viewState.highlightedHitSegments}
        currentHitIndex={viewState.currentHitIndex}
        currentHitSegmentId={viewState.currentHitSegmentId}
        globalHitCount={viewState.globalHitCount}
        selectedMaterialKey={viewState.selectedMaterialKey}
        isSearching={viewState.materialSearchPending}
        recentSearches={viewState.recentSearches}
        cutNotice={viewState.cutNotice}
        searchStatus={viewState.searchStatus}
        queue={queue}
        cutMode={viewState.selectedCutMode}
        onSearch={handlers.search}
        onSelectMaterial={handlers.selectMaterial}
        onSelectTranscriptRange={handlers.selectTranscriptRange}
        onSelectTranscriptTextRange={handlers.selectTranscriptTextRange}
        onNavigateHit={handlers.navigateHit}
        onCutSelection={handlers.addSelectedSpan}
        onCancelSelection={handlers.cancelTranscriptSelection}
        onOpenCutOutputDirectory={handlers.openCutOutputDirectory}
        onSetCutMode={handlers.setCutMode}
      />
    );
  }

  if (route === "local-library") {
    return (
      <LocalLibraryPage
        catalog={data.localClips}
        query=""
        projects={viewState.projects}
        currentProjectId={viewState.currentProjectId}
        viewMode={viewState.localLibraryViewMode}
        orientationFilter={viewState.orientationFilter}
        selectedLocalClipId={viewState.localLibrarySelectedClipId}
        actionNotice={viewState.cutNotice}
        onSetViewMode={handlers.setLocalLibraryViewMode}
        onSetOrientationFilter={handlers.setOrientationFilter}
        onSelectLocalClip={handlers.selectLocalClip}
        onOpenLocalClipDirectory={handlers.openLocalClipDirectory}
      />
    );
  }

  if (route === "cut-tasks") {
    return (
      <CutQueuePage
        jobs={queue}
        project={viewState.currentProject}
        autoRefreshEnabled={viewState.autoRefreshCutJobs}
        lastUpdatedLabel={viewState.lastQueueUpdatedLabel}
        pipelineState={viewState.cutPipelineState}
        onRefresh={handlers.refreshQueue}
        onRunNext={handlers.runNextJob}
        onRetryFailed={handlers.retryFailedCutJob}
        onOpenCutOutputDirectory={handlers.openCutOutputDirectory}
      />
    );
  }

  if (route === "settings") {
    return (
      <SettingsPage
        settings={data.settings}
        runtimeStatus={data.runtimeStatus}
        appearanceMode={viewState.appearanceMode}
        defaultCutMode={viewState.selectedCutMode}
        defaultSourceFilter={viewState.sourceFilter}
        defaultOrientationFilter={viewState.orientationFilter}
        onSetAppearanceMode={handlers.setAppearanceMode}
        onSetDefaultCutMode={handlers.setCutMode}
        onSetDefaultSourceFilter={handlers.setSourceFilter}
        onSetDefaultOrientationFilter={handlers.setOrientationFilter}
      />
    );
  }

  return (
    <PublicLibraryPage
      library={data.library}
      selectedSourceVideoId={viewState.publicLibrarySelectedSourceVideoId}
      orientationFilter={viewState.publicLibraryOrientationFilter}
      runtimeStatus={data.runtimeStatus}
      isLoadingMore={viewState.sourceLibraryLoadingMore}
      hasMore={data.library.videos.length < data.library.available_video_count}
      onSetOrientationFilter={handlers.setPublicLibraryOrientationFilter}
      onSelectSourceVideo={handlers.selectPublicSourceVideo}
      onLoadMore={handlers.loadMoreSourceLibrary}
    />
  );
}

export function CutterApp() {
  const desktopEnvironment = useMemo(() => resolveDesktopBridgeEnvironment(), []);
  const isDesktopMode = desktopEnvironment.desktop_available;
  const detectedApiBaseUrl = useMemo(getRuntimeApiBaseUrl, []);
  const [desktopStage, setDesktopStage] = useState<DesktopSetupStage>(() =>
    isDesktopMode ? "loading" : "ready"
  );
  const [desktopConfig, setDesktopConfig] = useState<DesktopConfig>(() => defaultDesktopConfig());
  const [desktopDoctorResult, setDesktopDoctorResult] = useState<DesktopDoctorResult | undefined>();
  const [desktopDiagnostics, setDesktopDiagnostics] = useState<DesktopSetupDiagnostics | undefined>();
  const [desktopLogPath, setDesktopLogPath] = useState("");
  const [desktopAppVersionText, setDesktopAppVersionText] = useState("");
  const desktopSetupReady = !isDesktopMode || desktopStage === "ready";
  const apiBaseUrl = desktopSetupReady ? detectedApiBaseUrl : "";
  const apiMode = Boolean(apiBaseUrl);
  const [route, setRoute] = useState<CutterRoute>(() => routeFromHash(window.location.hash));
  const [selectedSourceVideoId, setSelectedSourceVideoId] = useState<string | undefined>(() =>
    sourceVideoIdFromHash(window.location.hash)
  );
  const [searchQuery, setSearchQuery] = useState(() => searchQueryFromHash(window.location.hash));
  const [sourceDetailContext, setSourceDetailContext] = useState(() =>
    sourceDetailContextFromHash(window.location.hash)
  );
  const [selectedLocalClipId, setSelectedLocalClipId] = useState<string | undefined>();
  const [localLibrarySelectedClipId, setLocalLibrarySelectedClipId] = useState<string | undefined>();
  const [localLibraryViewMode, setLocalLibraryViewMode] = useState<LocalLibraryViewMode>("current-project");
  const [sourceFilter, setSourceFilter] = useState<MaterialSearchSourceFilter>(() =>
    readCutterDefaultSourceFilter()
  );
  const [orientationFilter, setOrientationFilter] = useState<VideoOrientationFilter>(() =>
    readCutterDefaultOrientationFilter()
  );
  const [publicLibraryOrientationFilter, setPublicLibraryOrientationFilter] =
    useState<VideoOrientationFilter>("all");
  const [publicLibrarySelectedSourceVideoId, setPublicLibrarySelectedSourceVideoId] =
    useState<string | undefined>();
  const [selectedCutMode, setSelectedCutMode] = useState<CutMode>(() => readCutterDefaultCutMode());
  const [transcriptSelection, setTranscriptSelection] = useState<TranscriptSelectionRange>({});
  const [locatorHighlightedSegmentIds, setLocatorHighlightedSegmentIds] = useState<string[]>([]);
  const [locatorCurrentHitIndex, setLocatorCurrentHitIndex] = useState(0);
  const [selectedMaterialFocusKey, setSelectedMaterialFocusKey] = useState<string | undefined>();
  const [materialSearchPending, setMaterialSearchPending] = useState(
    () =>
      routeFromHash(window.location.hash) === "material-locator" &&
      searchQueryFromHash(window.location.hash).trim().length > 0
  );
  const [materialSearchRevision, setMaterialSearchRevision] = useState(0);
  const [lastMaterialSearchDurationMs, setLastMaterialSearchDurationMs] = useState<number | undefined>();
  const [recentMaterialSearches, setRecentMaterialSearches] = useState<MaterialSearchHistoryItem[]>([]);
  const materialSearchRequestIdRef = useRef(0);
  const focusedSourceDetailRequestIdRef = useRef(0);
  const didAutoApplyLocalTrustedLoginRef = useRef(false);
  const [cutNotice, setCutNotice] = useState("");
  const [hasSubmittedCutJobs, setHasSubmittedCutJobs] = useState(false);
  const [lastQueueUpdatedLabel, setLastQueueUpdatedLabel] = useState("");
  const [appearanceMode, setAppearanceMode] = useState<CutterAppearanceMode>(() =>
    readCutterAppearanceMode()
  );
  const [initialProjectsState] = useState(() => readCutterProjects());
  const [projects, setProjects] = useState<CutterProject[]>(() => initialProjectsState.projects);
  const [currentProjectId, setCurrentProjectId] = useState<string | undefined>(() =>
    routeFromHash(window.location.hash) === "project-home" ? undefined : initialProjectsState.currentProjectId
  );
  const projectsRef = useRef<CutterProject[]>(projects);
  const currentProjectIdRef = useRef<string | undefined>(currentProjectId);
  const [homeSelectedProjectId, setHomeSelectedProjectId] = useState<string | undefined>(
    () => initialProjectsState.currentProjectId
  );
  const [renameTargetProjectId, setRenameTargetProjectId] = useState<string | undefined>();
  const [cutPipelineState, setCutPipelineState] = useState<CutPipelineState>(idleCutPipelineState);
  const cutPipelineRunningRef = useRef(false);
  const [data, setData] = useState<CutterFixtureData | null>(null);
  const dataRef = useRef<CutterFixtureData | null>(data);
  const [cutList, setCutList] = useState<CutListItem[]>(() =>
    deserializeCutList(safeLocalStorageGetItem(CUT_LIST_STORAGE_KEY))
  );
  const [authSession, setAuthSession] = useState<CutterAuthSession | null>(() => readCutterAuthSession());
  const [pendingLogin, setPendingLogin] = useState<CutterPendingLogin | null>(() =>
    apiMode ? readCutterPendingLogin() : null
  );
  const [loginStatus, setLoginStatus] = useState<CutterLoginStatusValue>(() =>
    initialCutterLoginStatus({ apiMode, authSession })
  );
  const [loginMessage, setLoginMessage] = useState("");
  const [authModeStatus, setAuthModeStatus] = useState<CutterAuthModeStatus | null>(null);
  const [loginPollTick, setLoginPollTick] = useState(0);
  const [queueJobs, setQueueJobs] = useState<CutQueueJob[]>([]);
  const [sourceLibraryLoadingMore, setSourceLibraryLoadingMore] = useState(false);
  const [cutJobProjectIndex, setCutJobProjectIndex] = useState<CutJobProjectIndex>(() =>
    readCutJobProjectIndex()
  );
  const [didSeedCutList, setDidSeedCutList] = useState(false);
  const [error, setError] = useState("");
  const client = useMemo(
    () => createRuntimeClient(apiBaseUrl, authSession),
    [apiBaseUrl, authSession]
  );
  const loginGateVisible = shouldShowLoginGate(apiMode, loginStatus, {
    desktopTrusted: isDesktopMode
  });
  const currentProject = projects.find((project) => project.project_id === currentProjectId);
  const sidebarProject =
    currentProject ?? projects.find((project) => project.project_id === homeSelectedProjectId);
  const renameTargetProject = projects.find((project) => project.project_id === renameTargetProjectId);
  projectsRef.current = projects;
  currentProjectIdRef.current = currentProjectId;
  dataRef.current = data;

  function commitProjects(nextProjects: readonly CutterProject[], nextProjectId?: string) {
    const sortedProjects = [...nextProjects].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    projectsRef.current = sortedProjects;
    currentProjectIdRef.current = nextProjectId;
    setProjects(sortedProjects);
    setCurrentProjectId(nextProjectId);
    setHomeSelectedProjectId((current) =>
      nextProjectId ??
      (current && sortedProjects.some((project) => project.project_id === current)
        ? current
        : sortedProjects[0]?.project_id)
    );
    writeCutterProjects(sortedProjects, nextProjectId);
  }

  function projectDraftForCut(item: CutListItem): {
    project: CutterProject;
    created: boolean;
  } {
    if (currentProject) {
      return {
        project: recordProjectCut(currentProject, {
          status: "pending",
          coverUrl: selectedDetail?.cover_url
        }),
        created: false
      };
    }

    return {
      project: createProjectFromFirstCut({
        cut: item,
        query: searchQuery,
        recentSearches: recentMaterialSearches,
        existingProjects: projects,
        coverUrl: selectedDetail?.cover_url
      }),
      created: true
    };
  }

  function commitProjectAfterCut(project: CutterProject) {
    commitProjects(upsertCutterProject(projects, project), project.project_id);
  }

  function clearCurrentProjectSelection() {
    currentProjectIdRef.current = undefined;
    setCurrentProjectId(undefined);
    setHomeSelectedProjectId((current) =>
      current && projects.some((project) => project.project_id === current)
        ? current
        : projects[0]?.project_id
    );
    clearCutterCurrentProject();
  }

  function rememberQueueJobsForProject(
    jobs: readonly CutQueueJob[],
    projectId: string
  ): {
    jobs: CutQueueJob[];
    index: CutJobProjectIndex;
  } {
    const taggedJobs = jobs.map((job) => ({
      ...job,
      project_id: projectId
    }));
    const nextIndex = rememberCutJobsForProject(cutJobProjectIndex, taggedJobs, projectId);
    setCutJobProjectIndex(nextIndex);
    writeCutJobProjectIndex(nextIndex);

    return {
      jobs: taggedJobs,
      index: nextIndex
    };
  }

  function returnToProjectHome() {
    clearCurrentProjectSelection();
    setSearchQuery("");
    setData((current) =>
      current
        ? {
            ...current,
            search: emptySearchResponse()
          }
        : current
    );
    clearMaterialLocatorFocus();
    setCutNotice("");
    window.location.hash = routeToHash("project-home");
    setRoute("project-home");
  }

  function clearMaterialLocatorFocus() {
    setSelectedLocalClipId(undefined);
    setSelectedMaterialFocusKey(undefined);
    setTranscriptSelection({});
    setLocatorHighlightedSegmentIds([]);
    setLocatorCurrentHitIndex(0);
  }

  function loadFocusedSourceVideoDetail(sourceVideoId: string) {
    const requestId = focusedSourceDetailRequestIdRef.current + 1;
    focusedSourceDetailRequestIdRef.current = requestId;

    void client.getSourceVideoDetail(sourceVideoId)
      .then((detail) => {
        if (focusedSourceDetailRequestIdRef.current !== requestId) {
          return;
        }

        const resolvedDetail = resolveSourceVideoDetailUrls(client, detail);
        setData((current) =>
          current
            ? {
                ...current,
                primaryDetail: resolvedDetail
              }
            : current
        );
        setError("");
      })
      .catch((detailError) => {
        if (focusedSourceDetailRequestIdRef.current !== requestId) {
          return;
        }

        setError(detailError instanceof Error ? detailError.message : "原视频完整文案加载失败");
      });
  }

  function focusMaterialTarget(target: MaterialLocatorHitTarget, globalHitIndex: number) {
    setTranscriptSelection(transcriptSelectionRangeFromHitSegments(target.hitSegments));
    setLocatorHighlightedSegmentIds(target.highlightedSegmentIds);
    setLocatorCurrentHitIndex(globalHitIndex);
    setSelectedMaterialFocusKey(target.materialKey);
    setCutNotice("");

    if (target.material.source === "local") {
      setSelectedLocalClipId(target.material.id);
      setSelectedSourceVideoId(undefined);
      return;
    }

    setSelectedLocalClipId(undefined);
    setSelectedSourceVideoId(target.material.id);
    if (dataRef.current?.primaryDetail.source_video_id !== target.material.id) {
      loadFocusedSourceVideoDetail(target.material.id);
    }
  }

  useEffect(() => {
    if (!isDesktopMode) {
      return;
    }

    let cancelled = false;
    Promise.all([
      desktopAppVersion().catch(() => ""),
      readDesktopConfig().catch(() => null),
      defaultDesktopWorkspaceRoot().catch(() => ""),
      desktopLogDirectory().catch(() => "")
    ]).then(([appVersion, storedConfig, defaultWorkspaceRoot, logRoot]) => {
      if (cancelled) {
        return;
      }

      setDesktopAppVersionText(appVersion);
      const nextConfig = {
        ...(storedConfig ?? defaultDesktopConfig(defaultWorkspaceRoot, logRoot)),
        ...(storedConfig?.log_root || !logRoot ? {} : { log_root: logRoot })
      };
      const nextStage = desktopSetupStageForConfig(nextConfig);
      setDesktopConfig(nextConfig);
      setDesktopStage(nextStage);
      setDesktopLogPath(nextConfig.log_root ?? "");
      setDesktopDiagnostics(desktopDiagnosticsForState({
        appVersion,
        stage: nextStage,
        config: nextConfig,
        logPath: nextConfig.log_root ?? ""
      }));
    }).catch((desktopError) => {
      if (cancelled) {
        return;
      }

      const nextConfig = defaultDesktopConfig();
      const message = desktopError instanceof Error ? desktopError.message : "桌面配置读取失败";
      setDesktopConfig(nextConfig);
      setDesktopStage("choose-public-library");
      setDesktopDiagnostics(desktopDiagnosticsForState({
        appVersion: desktopAppVersionText,
        stage: "choose-public-library",
        config: nextConfig,
        latestError: message
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [isDesktopMode]);

  const handleApplyLogin = useCallback(
    async (username: string) => {
      const deviceId = createDeviceId();
      const nextPendingLogin = {
        username,
        device_id: deviceId,
        device_name: cutterDeviceName()
      };
      writeCutterPendingLogin(nextPendingLogin);
      setPendingLogin(nextPendingLogin);
      const application = await createCutterApiClient({ base_url: apiBaseUrl }).requestLogin({
        username,
        device_id: nextPendingLogin.device_id,
        device_name: nextPendingLogin.device_name
      });
      const nextStatus = loginStatusFromApplication(application);
      const nextSession = authSessionFromApprovedApplication(application);

      if (nextSession) {
        writeCutterAuthSession(nextSession);
        clearCutterPendingLogin();
        setPendingLogin(null);
        setAuthSession(nextSession);
        setLoginStatus("approved");
        setLoginMessage("");
        return;
      }

      if (nextStatus === "rejected" || nextStatus === "disabled") {
        clearCutterAuthSession();
        clearCutterPendingLogin();
        setPendingLogin(null);
        setAuthSession(null);
        setLoginStatus(nextStatus);
        setLoginMessage("");
        return;
      }

      setLoginStatus(loginGateStatusFromApplication(application));
      setLoginMessage(nextStatus === "approved" ? "登录凭证尚未生成，请稍后刷新或重新提交申请。" : "");
    },
    [apiBaseUrl]
  );

  useEffect(() => {
    if (!apiMode) {
      setAuthModeStatus(null);
      return;
    }

    let cancelled = false;
    createCutterApiClient({ base_url: apiBaseUrl })
      .getAuthMode()
      .then((status) => {
        if (!cancelled) {
          setAuthModeStatus(status);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthModeStatus({
            auth_mode: "reviewed",
            local_trusted: false,
            trusted_username: ""
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, apiMode]);

  useEffect(() => {
    if (
      !shouldAutoApplyLocalTrustedLogin({
        apiMode,
        authModeStatus,
        authSession,
        pendingLogin,
        loginStatus,
        alreadyAttempted: didAutoApplyLocalTrustedLoginRef.current
      })
    ) {
      return;
    }

    didAutoApplyLocalTrustedLoginRef.current = true;
    setLoginMessage("正在进入本机剪辑师工作台。");
    void handleApplyLogin(authModeStatus?.trusted_username?.trim() || "本机剪辑师").catch((loginError) => {
      setLoginMessage(loginMessageForAuthError(loginError));
      didAutoApplyLocalTrustedLoginRef.current = false;
    });
  }, [apiMode, authModeStatus, authSession, handleApplyLogin, loginStatus, pendingLogin]);

  useEffect(() => {
    if (!apiMode) {
      setLoginStatus("approved");
      return;
    }

    if (!authSession) {
      const loginToPoll = pendingLogin;
      if (!shouldPollPendingLogin({ apiMode, authSession, pendingLogin: loginToPoll }) || !loginToPoll) {
        setLoginStatus((current) => current === "pending" ? current : "unknown");
        return;
      }

      let cancelled = false;
      let retryTimer: number | null = null;
      setLoginStatus("pending");
      createCutterApiClient({ base_url: apiBaseUrl })
        .requestLogin(loginToPoll)
        .then((application) => {
          if (cancelled) {
            return;
          }

          const nextStatus = loginStatusFromApplication(application);
          const nextSession = authSessionFromApprovedApplication(application);
          if (nextSession) {
            writeCutterAuthSession(nextSession);
            clearCutterPendingLogin();
            setPendingLogin(null);
            setAuthSession(nextSession);
            setLoginStatus("approved");
            setLoginMessage("");
            return;
          }

          if (nextStatus === "rejected" || nextStatus === "disabled") {
            clearCutterAuthSession();
            clearCutterPendingLogin();
            setPendingLogin(null);
            setAuthSession(null);
          }
          setLoginStatus(loginGateStatusFromApplication(application));
          setLoginMessage(
            nextStatus === "approved" ? "登录凭证尚未生成，请稍后刷新或重新提交申请。" : ""
          );
          if (nextStatus === "pending") {
            retryTimer = window.setTimeout(() => setLoginPollTick((tick) => tick + 1), 5000);
          }
        })
        .catch((loginError) => {
          if (!cancelled) {
            setLoginStatus("unknown");
            setLoginMessage(loginMessageForAuthError(loginError));
            if (shouldRetryPendingLoginError(loginError)) {
              retryTimer = window.setTimeout(() => setLoginPollTick((tick) => tick + 1), 10000);
            } else {
              clearCutterPendingLogin();
              setPendingLogin(null);
            }
          }
        });

      return () => {
        cancelled = true;
        if (retryTimer) {
          window.clearTimeout(retryTimer);
        }
      };
    }

    let cancelled = false;

    client
      .getLoginStatus()
      .then((status) => {
        if (cancelled) {
          return;
        }

        const nextStatus = loginStatusFromBackendStatus(status);
        const nextMessage = loginMessageFromBackendStatus(status);
        if (nextStatus === "approved") {
          const nextSession = {
            ...authSession,
            user_id: status.ok ? status.user.user_id : authSession.user_id,
            username: status.ok ? status.user.username : authSession.username
          };
          writeCutterAuthSession(nextSession);
          clearCutterPendingLogin();
          setPendingLogin(null);
          if (
            nextSession.user_id !== authSession.user_id ||
            nextSession.username !== authSession.username
          ) {
            setAuthSession(nextSession);
          }
          setLoginStatus("approved");
          setLoginMessage("");
          return;
        }

        if (nextStatus === "rejected" || nextStatus === "disabled") {
          clearCutterAuthSession();
          setAuthSession(null);
        }

        setLoginStatus(nextStatus);
        setLoginMessage(nextMessage);
      })
      .catch((loginError) => {
        if (!cancelled) {
          if (shouldClearSessionForLoginStatusError(loginError)) {
            clearCutterAuthSession();
            setAuthSession(null);
          }
          setLoginStatus("unknown");
          setLoginMessage(loginMessageForAuthError(loginError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, apiMode, authSession, client, loginPollTick, pendingLogin]);

  const refreshLocalClips = useCallback(async () => {
    const localClips = await client.listLocalClips();
    setData((current) =>
      current
        ? {
            ...current,
            localClips: {
              ...localClips,
              clips: localClips.clips.map((clip) => resolveLocalClipUrls(client, clip))
            }
          }
        : current
    );
  }, [client]);

  const refreshQueueJobs = useCallback(async (projectIndexOverride?: CutJobProjectIndex) => {
    if (!apiMode) {
      return;
    }

    try {
      const catalog = await client.listCutJobs();
      const nextJobs = mapApiCutJobsToQueueJobs(catalog, {
        projectIndex: projectIndexOverride ?? cutJobProjectIndex,
        projectTitlesById: cutterProjectTitlesById(projects)
      });
      setQueueJobs((current) => {
        const shouldRefreshLocalClips = shouldRefreshLocalClipsAfterQueueUpdate(current, nextJobs);
        if (shouldRefreshLocalClips) {
          void refreshLocalClips()
            .then(() => {
              setCutNotice(cutNoticeForCompletedLocalClips(1));
            })
            .catch((localClipError) => {
              setError(localClipError instanceof Error ? localClipError.message : "本地素材刷新失败");
            });
        }
        return nextJobs;
      });
      setLastQueueUpdatedLabel("刚刚更新");
      if (!hasActiveCutJobs(nextJobs)) {
        setHasSubmittedCutJobs(false);
      }
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "剪切队列加载失败");
    }
  }, [apiMode, client, cutJobProjectIndex, projects, refreshLocalClips]);

  useEffect(() => {
    const listener = () => {
      const nextHash = window.location.hash;
      const nextRoute = routeFromHash(nextHash);
      const nextSearchQuery = materialLocatorSearchQueryForHashChange({
        hash: nextHash,
        currentSearchQuery: searchQuery
      });
      const nextProjectId = projectIdForWorkbenchRoute({
        route: nextRoute,
        currentProjectId: currentProjectIdRef.current,
        homeSelectedProjectId,
        projectIds: projectsRef.current.map((project) => project.project_id)
      });
      if (nextProjectId && nextProjectId !== currentProjectIdRef.current) {
        currentProjectIdRef.current = nextProjectId;
        setCurrentProjectId(nextProjectId);
        writeCutterProjects(projectsRef.current, nextProjectId);
      }
      setRoute(nextRoute);
      setSelectedSourceVideoId(sourceVideoIdFromHash(nextHash));
      setSelectedLocalClipId(undefined);
      setSearchQuery(nextSearchQuery);
      setSourceDetailContext(sourceDetailContextFromHash(nextHash));
      setTranscriptSelection({});
      setLocatorHighlightedSegmentIds([]);
      setLocatorCurrentHitIndex(0);
      setSelectedMaterialFocusKey(undefined);
      setMaterialSearchPending(shouldStartMaterialSearchForHashChange({
        hash: nextHash,
        currentSearchQuery: searchQuery,
        nextSearchQuery
      }));
      setCutNotice("");
    };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, [homeSelectedProjectId, searchQuery]);

  useEffect(() => {
    let cancelled = false;

    if (
      !shouldLoadWorkbenchData({
        desktopSetupReady,
        loginGateVisible
      })
    ) {
      return;
    }

    loadCutterWorkbenchData(client, {
      preferredSourceVideoId: selectedSourceVideoId,
      includeSourceLibrary: route === "public-library",
      sourceLibraryLimit: CUTTER_PUBLIC_LIBRARY_INITIAL_LOAD_LIMIT
    })
      .then((result) => {
        if (!cancelled) {
          setData((current) => mergeMaterialLocatorReloadData(current, result, searchQuery));
          setError("");
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "剪辑端数据加载失败");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, desktopSetupReady, loginGateVisible, route, selectedSourceVideoId]);

  useEffect(() => {
    setData((current) =>
      current &&
      shouldClearFixtureDataForRuntime({
        apiMode,
        runtimeMode: current.runtimeStatus.mode
      })
        ? null
        : current
    );
  }, [apiMode]);

  const locatorHitTargets = useMemo(
    () =>
      data
        ? materialLocatorHitTargets({
            query: searchQuery,
            sourceFilter,
            orientationFilter,
            localClips: data.localClips,
            library: data.library,
            search: data.search
          })
        : [],
    [data, orientationFilter, searchQuery, sourceFilter]
  );
  const globalHitCount = locatorHitTargets.length;

  useEffect(() => {
    if (!shouldAutofocusMaterialLocatorResult({
      route,
      query: searchQuery,
      selectedMaterialKey: selectedMaterialFocusKey,
      hitTargetCount: locatorHitTargets.length
    })) {
      return;
    }

    const targetIndex = initialMaterialLocatorHitTargetIndex(locatorHitTargets, sourceFilter);
    const target = targetIndex >= 0 ? locatorHitTargets[targetIndex] : undefined;
    if (target) {
      focusMaterialTarget(target, targetIndex);
    }
  }, [locatorHitTargets, route, searchQuery, selectedMaterialFocusKey, sourceFilter]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!data || loginGateVisible || route !== "material-locator") {
      return;
    }

    if (!query) {
      setData((current) =>
        current
          ? {
              ...current,
              search: emptySearchResponse()
            }
          : current
      );
      setMaterialSearchPending(false);
      setLastMaterialSearchDurationMs(undefined);
      clearMaterialLocatorFocus();
      return;
    }

    let cancelled = false;
    const requestId = materialSearchRequestIdRef.current + 1;
    const startedAtMs = Date.now();
    materialSearchRequestIdRef.current = requestId;
    setMaterialSearchPending(true);
    const timeout = window.setTimeout(() => {
      if (!cancelled && materialSearchRequestIdRef.current === requestId) {
        setMaterialSearchPending(false);
        setError("搜索响应较慢，请缩短关键词或稍后重试。");
      }
    }, 12_000);
    const requestProjectId = currentProjectIdRef.current;

    const rememberSearch = (searchResult: SearchResponse) => {
      const hitCount = materialSearchHitCount(searchResult);
      setRecentMaterialSearches((current) =>
        nextMaterialSearchHistory(current, {
          query,
          hitCount
        })
      );
      const project = requestProjectId
        ? projectsRef.current.find((candidate) => candidate.project_id === requestProjectId)
        : undefined;
      if (project) {
        const timestamp = new Date().toISOString();
        const updatedProject = {
          ...project,
          updated_at: timestamp,
          searches: recordProjectSearch(
            project.searches,
            {
              query,
              hitCount
            },
            timestamp
          )
        };
        commitProjects(upsertCutterProject(projectsRef.current, updatedProject), updatedProject.project_id);
      }
    };

    const runPagedSearch = async () => {
      let hasFirstPage = false;
      let mergedSearch: SearchResponse | undefined;

      try {
        const firstPage = resolveSearchResponseUrls(
          client,
          await client.searchSourceLibrary(query, MATERIAL_SEARCH_FIRST_BATCH_LIMIT)
        );
        if (cancelled || materialSearchRequestIdRef.current !== requestId) {
          return;
        }

        window.clearTimeout(timeout);
        hasFirstPage = true;
        mergedSearch = firstPage;
        setLastMaterialSearchDurationMs(firstPage.search_ms ?? Math.max(0, Date.now() - startedAtMs));
        setData((current) =>
          current
            ? {
                ...current,
                search: firstPage
              }
            : current
        );
        const latestData = dataRef.current;
        const hitTargets = latestData
          ? materialLocatorHitTargets({
              query,
              sourceFilter,
              orientationFilter,
              localClips: latestData.localClips,
              library: latestData.library,
              search: firstPage
            })
          : [];
        const targetIndex = initialMaterialLocatorHitTargetIndex(hitTargets, sourceFilter);
        const target = targetIndex >= 0 ? hitTargets[targetIndex] : undefined;

        if (target) {
          focusMaterialTarget(target, targetIndex);
        } else {
          clearMaterialLocatorFocus();
        }
        rememberSearch(firstPage);
        setError("");

        let nextCursor = firstPage.next_cursor;
        while (
          nextCursor &&
          mergedSearch.has_more &&
          !cancelled &&
          materialSearchRequestIdRef.current === requestId
        ) {
          const page = resolveSearchResponseUrls(
            client,
            await client.searchSourceLibrary(query, MATERIAL_SEARCH_BACKGROUND_BATCH_LIMIT, {
              cursor: nextCursor
            })
          );
          if (cancelled || materialSearchRequestIdRef.current !== requestId) {
            return;
          }

          const nextMergedSearch = mergeMaterialSearchResponses(mergedSearch, page);
          mergedSearch = nextMergedSearch;
          nextCursor = nextMergedSearch.next_cursor;
          setLastMaterialSearchDurationMs(Math.max(0, Date.now() - startedAtMs));
          setData((current) =>
            current
              ? {
                  ...current,
                  search: nextMergedSearch
                }
              : current
          );
          rememberSearch(nextMergedSearch);
        }
      } catch (searchError) {
        if (!cancelled && materialSearchRequestIdRef.current === requestId) {
          window.clearTimeout(timeout);
          setLastMaterialSearchDurationMs(Math.max(0, Date.now() - startedAtMs));
          const feedback = materialSearchFailureFeedback({
            hasFirstPage,
            error: searchError
          });
          if (feedback.notice) {
            setCutNotice(feedback.notice);
          }
          if (feedback.error) {
            setError(feedback.error);
          }
        }
      } finally {
        if (!cancelled && materialSearchRequestIdRef.current === requestId) {
          window.clearTimeout(timeout);
          setMaterialSearchPending(false);
        }
      }
    };

    void runPagedSearch();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    client,
    Boolean(data),
    loginGateVisible,
    materialSearchRevision,
    orientationFilter,
    route,
    searchQuery,
    sourceFilter
  ]);

  useEffect(() => {
    if (!shouldRefreshCutQueueForRoute({
      apiMode,
      hasData: Boolean(data),
      loginGateVisible,
      currentProjectId,
      route
    })) {
      return;
    }

    void refreshQueueJobs();
  }, [apiMode, currentProjectId, data, loginGateVisible, refreshQueueJobs, route]);

  const autoRefreshCutJobs = shouldAutoRefreshCutJobs({
    apiMode,
    hasData: Boolean(data),
    loginGateVisible,
    route,
    hasSubmittedCutJobs,
    jobs: queueJobs
  });

  useEffect(() => {
    if (!autoRefreshCutJobs) {
      return;
    }

    void refreshQueueJobs();
    const timer = window.setInterval(() => {
      void refreshQueueJobs();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [autoRefreshCutJobs, refreshQueueJobs]);

  useEffect(() => {
    if (!data || didSeedCutList) {
      return;
    }

    if (!apiMode && !safeLocalStorageGetItem(CUT_LIST_STORAGE_KEY) && cutList.length === 0) {
      setCutList(defaultCutListForData(data));
    }

    setDidSeedCutList(true);
  }, [apiMode, cutList.length, data, didSeedCutList]);

  useEffect(() => {
    if (didSeedCutList) {
      safeLocalStorageSetItem(CUT_LIST_STORAGE_KEY, serializeCutList(cutList));
    }
  }, [cutList, didSeedCutList]);

  useEffect(() => {
    setLocatorCurrentHitIndex((current) =>
      globalHitCount === 0
        ? 0
        : Math.min(current, globalHitCount - 1)
    );
  }, [globalHitCount]);

  const navItems = CUTTER_NAV_ITEMS.map((item) => ({
    label: item.label,
    icon: item.icon,
    href: routeToHash(item.route)
  }));

  const visibleCutList = data && cutList.length === 0 && !didSeedCutList ? defaultCutListForData(data) : cutList;
  const selectedLocalClip = data?.localClips.clips.find((clip) => clip.local_clip_id === selectedLocalClipId);
  const selectedDetail = selectedLocalClip ? localClipToSourceVideoDetail(selectedLocalClip) : data?.primaryDetail;
  const selectedMaterialKey =
    route === "material-locator" && searchQuery.trim() ? selectedMaterialFocusKey : undefined;
  const allVisibleQueue =
    apiMode
      ? queueJobs
      : queueJobs.length > 0
      ? queueJobs
      : buildQueueFixture(
          createQueueJobsFromCutList(visibleCutList, {
            createdAt: "2026-05-02T10:00:00.000Z",
            projectId: currentProjectId,
            projectTitle: currentProject ? projectDisplayTitle(currentProject) : undefined
          })
        );
  const visibleQueue = currentProjectId
    ? filterCutQueueJobsByProject(allVisibleQueue, currentProjectId)
    : allVisibleQueue;
  const pageQueue = route === "project-home" ? allVisibleQueue : visibleQueue;
  const projectRecentMaterialSearches =
    currentProject?.searches.map((search) => ({
      query: search.query,
      hitCount: search.hit_count
    })) ?? recentMaterialSearches;
  const highlightedSegmentIds =
    route === "source-detail" ? sourceDetailContext.segmentIds : locatorHighlightedSegmentIds;
  const currentLocatorHitTarget =
    route === "material-locator" ? locatorHitTargets[locatorCurrentHitIndex] : undefined;
  const currentHitSegmentId =
    currentLocatorHitTarget && currentLocatorHitTarget.materialKey === selectedMaterialKey
      ? currentLocatorHitTarget.segmentId
      : highlightedSegmentIds[0];
  const highlightedHitSegments =
    currentLocatorHitTarget && currentLocatorHitTarget.materialKey === selectedMaterialKey
      ? currentLocatorHitTarget.hitSegments
      : [];
  const selectedTranscriptSelection = selectedDetail
    ? continuousTranscriptSelection(selectedDetail.transcript.segments, {
        ...transcriptSelection,
        fallbackSegmentIds: route === "source-detail" ? highlightedSegmentIds : []
      })
    : { segments: [] };
  const selectedTranscriptSegments = selectedTranscriptSelection.segments;
  const materialSearchStatus = materialSearchStatusLabels({
    pending: materialSearchPending,
    search: data?.search,
    runtimeSearchBackend: data?.runtimeStatus.search_backend,
    availableVideoCount: data?.library.available_video_count ?? data?.runtimeStatus.available_video_count,
    elapsedMs: lastMaterialSearchDurationMs,
    fallbackLabel: data?.runtimeStatus.api_ready ? "就绪" : "Fixture"
  });

  const runRealCutPipeline = useCallback(async () => {
    if (!apiMode || loginGateVisible || cutPipelineRunningRef.current) {
      return;
    }

    cutPipelineRunningRef.current = true;
    try {
      const result = await runCutPipeline({
        runNextCutJob: () => client.runNextCutJob(),
        refreshQueueJobs,
        refreshLocalClips,
        onState: setCutPipelineState
      });
      const notice = cutNoticeForPipelineResult(result);
      if (notice) {
        setCutNotice(notice);
      }
      setHasSubmittedCutJobs(false);
      await refreshQueueJobs();
      if (result.done_count > 0) {
        await refreshLocalClips();
      }
    } catch (pipelineError) {
      setError(pipelineError instanceof Error ? pipelineError.message : "本机剪切执行失败");
    } finally {
      cutPipelineRunningRef.current = false;
    }
  }, [apiMode, client, loginGateVisible, refreshLocalClips, refreshQueueJobs]);

  const handleSetAppearanceMode = (mode: CutterAppearanceMode) => {
    setAppearanceMode(mode);
    writeCutterAppearanceMode(mode);
  };

  const handleSetCutMode = (mode: CutMode) => {
    const supportedMode = mode === "precise" ? "precise" : "copy";
    setSelectedCutMode(supportedMode);
    writeCutterDefaultCutMode(supportedMode);
  };

  const handleSetSourceFilter = (filter: MaterialSearchSourceFilter) => {
    const supportedFilter = normalizeMaterialSearchSourceFilter(filter);
    setSourceFilter(supportedFilter);
    writeCutterDefaultSourceFilter(supportedFilter);
  };

  const handleSetOrientationFilter = (filter: VideoOrientationFilter) => {
    const supportedFilter = normalizeVideoOrientationFilter(filter);
    setOrientationFilter(supportedFilter);
    writeCutterDefaultOrientationFilter(supportedFilter);
  };

  const handleSetPublicLibraryOrientationFilter = (filter: VideoOrientationFilter) => {
    setPublicLibraryOrientationFilter(normalizeVideoOrientationFilter(filter));
  };

  const handleLoadMoreSourceLibrary = useCallback(async () => {
    const currentData = dataRef.current;
    if (!currentData || sourceLibraryLoadingMore) {
      return;
    }

    const offset = currentData.library.videos.length;
    if (offset >= currentData.library.available_video_count) {
      return;
    }

    setSourceLibraryLoadingMore(true);
    try {
      const nextPage = await client.listSourceLibrary({
        limit: CUTTER_PUBLIC_LIBRARY_INITIAL_LOAD_LIMIT,
        offset
      });
      const nextVideos = nextPage.videos.map((video) => resolveSourceVideoCardUrls(client, video));

      setData((current) =>
        current
          ? {
              ...current,
              library: {
                ...current.library,
                ...nextPage,
                videos: mergeSourceVideoCards(current.library.videos, nextVideos)
              }
            }
          : current
      );
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "公共素材继续加载失败");
    } finally {
      setSourceLibraryLoadingMore(false);
    }
  }, [client, sourceLibraryLoadingMore]);

  const commitDesktopConfigDraft = (config: DesktopConfig, stage = desktopSetupStageForConfig(config)) => {
    setDesktopConfig(config);
    setDesktopStage(stage);
    setDesktopDiagnostics(desktopDiagnosticsForState({
      appVersion: desktopAppVersionText,
      stage,
      config,
      logPath: desktopLogPath
    }));
  };

  async function handleChooseDesktopPublicLibrary() {
    try {
      const selected = await chooseDesktopDirectory("选择 MixLab 公共素材库");
      if (!selected) {
        return;
      }

      commitDesktopConfigDraft({
        ...desktopConfig,
        public_library_root: selected
      });
      setDesktopDoctorResult(undefined);
    } catch (chooseError) {
      const message = chooseError instanceof Error ? chooseError.message : "选择公共素材库失败";
      setDesktopDiagnostics(desktopDiagnosticsForState({
        appVersion: desktopAppVersionText,
        stage: desktopStage,
        config: desktopConfig,
        latestError: message,
        logPath: desktopLogPath
      }));
    }
  }

  async function handleChooseDesktopWorkspace() {
    try {
      const selected = await chooseDesktopDirectory("选择本地工作区");
      if (!selected) {
        return;
      }

      commitDesktopConfigDraft({
        ...desktopConfig,
        local_workspace_root: selected
      });
      setDesktopDoctorResult(undefined);
    } catch (chooseError) {
      const message = chooseError instanceof Error ? chooseError.message : "选择本地工作区失败";
      setDesktopDiagnostics(desktopDiagnosticsForState({
        appVersion: desktopAppVersionText,
        stage: desktopStage,
        config: desktopConfig,
        latestError: message,
        logPath: desktopLogPath
      }));
    }
  }

  async function handleRunDesktopDoctor() {
    try {
      setDesktopStage("doctor-running");
      setDesktopDiagnostics(desktopDiagnosticsForState({
        appVersion: desktopAppVersionText,
        stage: "doctor-running",
        config: desktopConfig,
        logPath: desktopLogPath
      }));
      const result = await runDesktopDoctor(desktopConfig);
      const nextStage: DesktopSetupStage = result.status === "pass" ? "doctor-ready" : "doctor-failed";
      setDesktopDoctorResult(result);
      setDesktopStage(nextStage);
      setDesktopDiagnostics(desktopDiagnosticsForState({
        appVersion: desktopAppVersionText,
        stage: nextStage,
        config: desktopConfig,
        latestError: result.checks.find((check) => check.status === "fail")?.message,
        logPath: desktopLogPath
      }));
    } catch (doctorError) {
      const message = doctorError instanceof Error ? doctorError.message : "Doctor 检查失败";
      setDesktopStage("doctor-failed");
      setDesktopDiagnostics(desktopDiagnosticsForState({
        appVersion: desktopAppVersionText,
        stage: "doctor-failed",
        config: desktopConfig,
        latestError: message,
        logPath: desktopLogPath
      }));
    }
  }

  async function handleStartDesktopEngine() {
    try {
      setDesktopStage("engine-starting");
      const savedConfig = await writeDesktopConfig(desktopConfig);
      const configPath = await desktopConfigPath();
      await startDesktopEngine(configPath);
      setDesktopConfig(savedConfig);
      setDesktopStage("ready");
      setDesktopDiagnostics(desktopDiagnosticsForState({
        appVersion: desktopAppVersionText,
        stage: "ready",
        config: savedConfig,
        logPath: savedConfig.log_root || desktopLogPath
      }));
    } catch (startError) {
      const message = startError instanceof Error ? startError.message : "本机引擎启动失败";
      setDesktopStage("doctor-failed");
      setDesktopDiagnostics(desktopDiagnosticsForState({
        appVersion: desktopAppVersionText,
        stage: "doctor-failed",
        config: desktopConfig,
        latestError: message,
        logPath: desktopLogPath
      }));
    }
  }

  function handleCopyDesktopDiagnostics() {
    const serialized = JSON.stringify(desktopDiagnostics ?? desktopDiagnosticsForState({
      appVersion: desktopAppVersionText,
      stage: desktopStage,
      config: desktopConfig,
      logPath: desktopLogPath
    }), null, 2);
    void navigator.clipboard?.writeText(serialized).catch(() => undefined);
  }

  function handleOpenDesktopLogDirectory() {
    const target = desktopLogPath || desktopConfig.log_root || desktopConfig.local_workspace_root;
    void openDesktopDirectory(target).catch((openError) => {
      const message = openError instanceof Error ? openError.message : "打开日志目录失败";
      setDesktopDiagnostics(desktopDiagnosticsForState({
        appVersion: desktopAppVersionText,
        stage: desktopStage,
        config: desktopConfig,
        latestError: message,
        logPath: desktopLogPath
      }));
    });
  }

  function performMaterialSearch(query: string) {
    const nextQuery = query.trim();
    setSearchQuery(nextQuery);
    setMaterialSearchRevision((current) => current + 1);
    setSelectedSourceVideoId(undefined);
    setSelectedLocalClipId(undefined);
    setSelectedMaterialFocusKey(undefined);
    setTranscriptSelection({});
    setLocatorHighlightedSegmentIds([]);
    setLocatorCurrentHitIndex(0);
    setMaterialSearchPending(Boolean(nextQuery));
    setLastMaterialSearchDurationMs(undefined);
    setCutNotice("");
    window.location.hash = searchHash(nextQuery);
  }

  function startProjectHomeSearch(query: string) {
    const nextQuery = query.trim();
    if (nextQuery) {
      const draft = projectHomeSearchDraft({
        query: nextQuery,
        projects,
        selectedProjectId: homeSelectedProjectId
      });
      if (draft) {
        commitProjects(draft.projects, draft.project.project_id);
      }
    } else {
      clearCurrentProjectSelection();
    }

    performMaterialSearch(nextQuery);
  }

  const handlers = {
    async addSelectedSpan() {
      if (!data) {
        return;
      }
      if (selectedTranscriptSegments.length === 0) {
        return;
      }

      if (!selectedDetail) {
        return;
      }

      const item = createCutListItemFromSegments({
        sourceVideo: selectedDetail,
        segments: selectedTranscriptSegments,
        cutMode: selectedCutMode,
        order: visibleCutList.length + 1,
        title: `${selectedDetail.title} 片段`,
        startCharOffset: selectedTranscriptSelection.startCharOffset,
        endCharOffset: selectedTranscriptSelection.endCharOffset
      });
      const projectDraft = projectDraftForCut(item);
      const clipListTitle = projectDraft.project.title;
      setTranscriptSelection({});

      if (apiMode) {
        const optimisticJob = createQueueJobsFromCutList([{ ...item, order: 1 }], {
          createdAt: new Date().toISOString(),
          projectId: projectDraft.project.project_id,
          projectTitle: projectDisplayTitle(projectDraft.project)
        })[0]!;

        setQueueJobs((current) => [optimisticJob, ...current]);
        commitProjectAfterCut(projectDraft.project);
        setCutNotice(
          projectDraft.created
            ? `已创建剪切项目：${projectDraft.project.title} · 等待中 1`
            : cutNoticeForSubmittedJobs(1)
        );
        setHasSubmittedCutJobs(true);

        try {
          const clipList = await client.createClipList(
            toCreateClipListRequest({
              libraryId: data.library.library_id ?? "local-library",
              projectId: projectDraft.project.project_id,
              title: clipListTitle,
              items: [item]
            })
          );
          const submission = await client.submitCutJobs({
            clip_list_id: clipList.clip_list_id
          });
          const submittedJobs = mapApiCutJobsToQueueJobs({
            job_count: submission.submitted_count,
            jobs: submission.jobs
          }, {
            projectId: projectDraft.project.project_id,
            projectTitle: projectDisplayTitle(projectDraft.project)
          });
          const taggedSubmission = rememberQueueJobsForProject(
            submittedJobs,
            projectDraft.project.project_id
          );
          setQueueJobs((current) =>
            replaceQueueJobWithSubmittedJobs(
              current,
              optimisticJob.queue_job_id,
              taggedSubmission.jobs
            )
          );
          setCutNotice(
            projectDraft.created
              ? `已创建剪切项目：${projectDraft.project.title} · 等待中 ${submission.submitted_count || submittedJobs.length}`
              : cutNoticeForSubmittedJobs(submission.submitted_count || submittedJobs.length)
          );
          setHasSubmittedCutJobs(true);
          await refreshQueueJobs(taggedSubmission.index);
          void runRealCutPipeline();
        } catch (submitError) {
          const message = submitError instanceof Error ? submitError.message : "剪切任务创建失败";
          setQueueJobs((current) =>
            updateQueueJobStatus(current, optimisticJob.queue_job_id, {
              status: "failed",
              progress: 0,
              error_message: message
            })
          );
          setError(message);
          return;
        }
      } else {
        const fixtureJob = createQueueJobsFromCutList([{ ...item, order: 1 }], {
          createdAt: new Date().toISOString(),
          projectId: projectDraft.project.project_id,
          projectTitle: projectDisplayTitle(projectDraft.project)
        })[0]!;
        const localClip = localClipFromCutListItem(
          item,
          `clip-${fixtureJob.queue_job_id.replace(/[^a-z0-9]/gi, "").slice(-12)}`
        );

        setQueueJobs((current) => [fixtureJob, ...current]);
        commitProjectAfterCut(projectDraft.project);
        setCutNotice(
          projectDraft.created
            ? `已创建剪切项目：${projectDraft.project.title} · 等待中 1`
            : cutNoticeForSubmittedJobs(1)
        );
        window.setTimeout(() => {
          setQueueJobs((current) =>
            updateQueueJobStatus(current, fixtureJob.queue_job_id, {
              status: "running",
              progress: 50
            })
          );
        }, 400);
        window.setTimeout(() => {
          setQueueJobs((current) =>
            updateQueueJobStatus(current, fixtureJob.queue_job_id, {
              status: "done",
              progress: 100
            })
          );
          setData((current) =>
            current
              ? {
                  ...current,
                  localClips: appendCompletedLocalClip(current.localClips, localClip)
                }
              : current
          );
          setCutNotice(cutNoticeForCompletedLocalClips(1));
        }, 900);
      }
    },
    search: performMaterialSearch,
    searchFromProjectHome: startProjectHomeSearch,
    selectProject(projectId: string) {
      setHomeSelectedProjectId(projectId);
    },
    openProject(projectId: string) {
      const project = projects.find((item) => item.project_id === projectId);
      commitProjects(projects, projectId);
      const latestQuery = project?.searches[0]?.query.trim() ?? "";
      if (latestQuery) {
        setSearchQuery(latestQuery);
        window.location.hash = searchHash(latestQuery);
        return;
      }

      window.location.hash = routeToHash("material-locator");
    },
    openProjectDirectory: async (projectId: string) => {
      if (!apiMode) {
        setCutNotice("请先连接本机剪辑服务，再打开项目文件目录");
        return;
      }

      const project = projects.find((item) => item.project_id === projectId);

      try {
        await client.openCutOutputDirectory({
          project_id: projectId,
          ...(project ? { project_title: projectDisplayTitle(project) } : {})
        });
        setCutNotice("已打开项目文件目录");
      } catch (openError) {
        setError(openError instanceof Error ? openError.message : "打开项目文件目录失败");
      }
    },
    createProject(title: string) {
      const project = createEmptyProject({
        title,
        existingProjects: projects
      });
      commitProjects(upsertCutterProject(projects, project), project.project_id);
      setCutNotice(`已新建项目：${projectDisplayTitle(project)}`);
      window.location.hash = routeToHash("material-locator");
    },
    deleteProject: handleDeleteProject,
    selectMaterial(result: MaterialLocatorResult) {
      const materialKey = materialKeyFromResult(result);
      const targetIndex = locatorHitTargets.findIndex((target) => target.materialKey === materialKey);
      const target = targetIndex >= 0 ? locatorHitTargets[targetIndex] : undefined;

      if (target) {
        focusMaterialTarget(target, targetIndex);
        return;
      }

      focusMaterialTarget(
        {
          materialKey,
          material: result,
          segmentId: materialFocusFromResult(result).currentSegmentId ?? "",
          highlightedSegmentIds: materialFocusFromResult(result).highlightedSegmentIds,
          hitSegments: materialHitSegmentGroups(result)[0] ?? []
        },
        0
      );
    },
    navigateHit(direction: "previous" | "next") {
      const nextIndex = nextMaterialLocatorHitIndex(locatorCurrentHitIndex, direction, globalHitCount);
      const target = locatorHitTargets[nextIndex];
      if (!target) {
        return;
      }

      focusMaterialTarget(target, nextIndex);
    },
    selectTranscriptSegment(segmentId: string) {
      setTranscriptSelection((current) => nextTranscriptSelectionRange(current, segmentId));
    },
    selectTranscriptRange(startSegmentId: string, endSegmentId: string) {
      setTranscriptSelection(transcriptSelectionRangeFromDrag(startSegmentId, endSegmentId));
    },
    selectTranscriptTextRange(
      startSegmentId: string,
      startCharOffset: number,
      endSegmentId: string,
      endCharOffset: number
    ) {
      setTranscriptSelection(transcriptSelectionRangeFromText(
        startSegmentId,
        startCharOffset,
        endSegmentId,
        endCharOffset
      ));
    },
    cancelTranscriptSelection() {
      setTranscriptSelection({});
    },
    setSourceFilter: handleSetSourceFilter,
    setOrientationFilter: handleSetOrientationFilter,
    setPublicLibraryOrientationFilter: handleSetPublicLibraryOrientationFilter,
    selectPublicSourceVideo: setPublicLibrarySelectedSourceVideoId,
    loadMoreSourceLibrary: handleLoadMoreSourceLibrary,
    setCutMode: handleSetCutMode,
    selectLocalClip: setLocalLibrarySelectedClipId,
    setLocalLibraryViewMode,
    renameProject: handleRenameProject,
    moveCut(cutListItemId: string, direction: MoveDirection) {
      setCutList((current) => moveCutListItem(current, cutListItemId, direction));
    },
    removeCut(cutListItemId: string) {
      setCutList((current) => removeCutListItem(current, cutListItemId));
    },
    clearCuts() {
      setCutList((current) => clearCutList(current));
    },
    async submitCuts() {
      if (visibleCutList.length === 0) {
        return;
      }

      if (apiMode) {
        if (!data) {
          return;
        }

        try {
          const firstItem = visibleCutList[0]!;
          const projectDraft = currentProject
            ? {
                project: recordProjectCut(currentProject, {
                  status: "pending",
                  coverUrl: selectedDetail?.cover_url
                }),
                created: false
              }
            : {
                project: createProjectFromFirstCut({
                  cut: firstItem,
                  query: searchQuery,
                  recentSearches: recentMaterialSearches,
                  existingProjects: projects,
                  coverUrl: selectedDetail?.cover_url
                }),
                created: true
              };
          const clipList = await client.createClipList(
            toCreateClipListRequest({
              libraryId: data.library.library_id ?? "local-library",
              projectId: projectDraft.project.project_id,
              title: projectDraft.project.title,
              items: visibleCutList
            })
          );
          const submission = await client.submitCutJobs({
            clip_list_id: clipList.clip_list_id
          });
          const submittedJobs = mapApiCutJobsToQueueJobs({
            job_count: submission.submitted_count,
            jobs: submission.jobs
          }, {
            projectId: projectDraft.project.project_id,
            projectTitle: projectDisplayTitle(projectDraft.project)
          });
          const taggedSubmission = rememberQueueJobsForProject(
            submittedJobs,
            projectDraft.project.project_id
          );
          setQueueJobs(taggedSubmission.jobs);
          commitProjectAfterCut(projectDraft.project);
          setHasSubmittedCutJobs(true);
          await refreshQueueJobs(taggedSubmission.index);
          void runRealCutPipeline();
        } catch (submitError) {
          setError(submitError instanceof Error ? submitError.message : "剪切清单提交失败");
          return;
        }
      } else {
        const firstItem = visibleCutList[0]!;
        const projectDraft = currentProject
          ? {
              project: recordProjectCut(currentProject, {
                status: "pending",
                coverUrl: selectedDetail?.cover_url
              }),
              created: false
            }
          : {
              project: createProjectFromFirstCut({
                cut: firstItem,
                query: searchQuery,
                recentSearches: recentMaterialSearches,
                existingProjects: projects,
                coverUrl: selectedDetail?.cover_url
              }),
              created: true
            };
        commitProjectAfterCut(projectDraft.project);
        setQueueJobs(
          buildQueueFixture(
            createQueueJobsFromCutList(visibleCutList, {
              createdAt: new Date().toISOString(),
              projectId: projectDraft.project.project_id,
              projectTitle: projectDisplayTitle(projectDraft.project)
            })
          )
        );
      }

      window.location.hash = routeToHash("cut-tasks");
    },
    refreshQueue: apiMode
      ? () => {
          void refreshQueueJobs();
        }
      : undefined,
    runNextJob: apiMode
      ? () => {
          void runRealCutPipeline();
        }
      : undefined,
    retryFailedCutJob: async (cutJobId: string) => {
      if (!apiMode) {
        setQueueJobs((current) =>
          current.map((job) =>
            job.queue_job_id === cutJobId && job.status === "failed"
              ? {
                  ...job,
                  status: "pending",
                  progress: 0,
                  error_message: undefined
                }
              : job
          )
        );
        setCutNotice("已重试失败任务 · 等待本机剪切");
        return;
      }

      try {
        const retried = await client.retryCutJob(cutJobId);
        const retriedQueueJob = mapApiCutJobsToQueueJobs({
          job_count: 1,
          jobs: [retried]
        }, {
          projectIndex: cutJobProjectIndex,
          projectTitlesById: cutterProjectTitlesById(projects)
        })[0];

        if (retriedQueueJob) {
          setQueueJobs((current) => [
            retriedQueueJob,
            ...current.filter((job) => job.queue_job_id !== cutJobId)
          ]);
        }

        setCutNotice("已重试失败任务 · 等待本机剪切");
        setHasSubmittedCutJobs(true);
        await refreshQueueJobs();
        void runRealCutPipeline();
      } catch (retryError) {
        setError(retryError instanceof Error ? retryError.message : "重试剪切任务失败");
      }
    },
    openCutOutputDirectory: async () => {
      if (!apiMode) {
        setCutNotice("请先连接本机剪辑服务，再打开文件目录");
        return;
      }

      try {
        await client.openCutOutputDirectory({
          ...(currentProjectId ? { project_id: currentProjectId } : {}),
          ...(currentProject ? { project_title: projectDisplayTitle(currentProject) } : {})
        });
        setCutNotice("已打开项目视频目录");
      } catch (openError) {
        setError(openError instanceof Error ? openError.message : "打开文件目录失败");
      }
    },
    openLocalClipDirectory: async (localClip: LocalClip) => {
      if (!apiMode) {
        setCutNotice("请先连接本机剪辑服务，再打开本地素材目录");
        return;
      }

      const project = localClip.project_id
        ? projects.find((item) => item.project_id === localClip.project_id)
        : undefined;

      try {
        await client.openCutOutputDirectory({
          ...(localClip.project_id ? { project_id: localClip.project_id } : {}),
          ...(project ? { project_title: projectDisplayTitle(project) } : {})
        });
        setCutNotice(localClip.project_id ? "已打开本地素材所属项目目录" : "已打开本地素材目录");
      } catch (openError) {
        setError(openError instanceof Error ? openError.message : "打开本地素材目录失败");
      }
    },
    setAppearanceMode: handleSetAppearanceMode
  };

  function handleRenameProject(projectId?: string) {
    const targetProjectId = projectId ?? currentProject?.project_id;
    if (!targetProjectId) {
      return;
    }

    setRenameTargetProjectId(targetProjectId);
  }

  function handleCloseRenameProject() {
    setRenameTargetProjectId(undefined);
  }

  function handleConfirmRenameProject(projectId: string, title: string) {
    const targetProject = projects.find((project) => project.project_id === projectId);
    const nextTitle = title.trim();
    if (!targetProject || !nextTitle) {
      return;
    }

    const previousTitle = projectDisplayTitle(targetProject);
    if (nextTitle === previousTitle) {
      setRenameTargetProjectId(undefined);
      return;
    }

    const updatedProject = {
      ...targetProject,
      title: nextTitle,
      title_source: "manual" as const,
      updated_at: new Date().toISOString()
    };
    commitProjects(upsertCutterProject(projects, updatedProject), currentProjectId);
    setCutNotice(`已重命名项目：${nextTitle}`);
    setRenameTargetProjectId(undefined);
  }

  function removeProjectFromFrontend(projectId: string, title: string) {
    const nextState = removeCutterProject({ projects, currentProjectId }, projectId);
    const nextProjectIndex = removeCutJobsForProject(cutJobProjectIndex, projectId);
    setQueueJobs((current) => current.filter((job) => job.project_id !== projectId));
    setCutJobProjectIndex(nextProjectIndex);
    writeCutJobProjectIndex(nextProjectIndex);
    commitProjects(nextState.projects, nextState.currentProjectId);
    setCutNotice(`已删除项目：${title}`);

    if (currentProjectId === projectId && route !== "project-home") {
      window.location.hash = routeToHash("project-home");
      setRoute("project-home");
    }
  }

  async function handleDeleteProject(projectId: string, mode: ProjectDeleteMode) {
    const targetProject = projects.find((project) => project.project_id === projectId);
    if (!targetProject) {
      return;
    }

    const title = projectDisplayTitle(targetProject);

    if (mode === "delete-with-outputs" && apiMode) {
      try {
        const result = await client.deleteProjectOutputs(projectId);
        removeProjectFromFrontend(projectId, title);
        setCutNotice(
          `已删除项目及产出：${title} · 视频 ${result.removed_export_clips} · 本地素材 ${result.removed_local_clips}`
        );
        await refreshLocalClips();
        await refreshQueueJobs(removeCutJobsForProject(cutJobProjectIndex, projectId));
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "删除项目产出失败");
      }
      return;
    }

    removeProjectFromFrontend(projectId, title);
  }

  const cutterUsername =
    authSession?.username?.trim() ||
    data?.runtimeStatus.current_user.display_name.trim() ||
    data?.runtimeStatus.current_user.username.trim() ||
    "本机剪辑师";
  const engineReady = Boolean(data?.runtimeStatus.api_ready && data.runtimeStatus.ffmpeg_status === "可用");

  if (isDesktopMode && desktopStage !== "ready") {
    return (
      <DesktopFirstRunPage
        config={desktopConfig}
        stage={desktopStage}
        doctorResult={desktopDoctorResult}
        diagnostics={desktopDiagnostics}
        onChoosePublicLibrary={handleChooseDesktopPublicLibrary}
        onChooseLocalWorkspace={handleChooseDesktopWorkspace}
        onRunDoctor={handleRunDesktopDoctor}
        onStartEngine={handleStartDesktopEngine}
        onRetry={handleRunDesktopDoctor}
        onCopyDiagnostics={handleCopyDesktopDiagnostics}
        onOpenLogDirectory={handleOpenDesktopLogDirectory}
      />
    );
  }

  const workbench = (
    <main
      className="cutter-app"
      data-appearance-mode={appearanceMode}
      data-cutter-route={route}
      data-cutter-web-ready={data ? "true" : "false"}
    >
      <MacWindow
        title={`MixLab V3 - 剪辑师工作台 / ${routeTitle(route)}`}
        meta={
          <CutterProjectSwitcher
            project={route === "project-home" ? undefined : currentProject}
            onReturnHome={returnToProjectHome}
            onRenameProject={handleRenameProject}
          />
        }
      >
        <div className="cutter-shell">
          <Sidebar
            brand={{
              title: "MixLab Cutter",
              subtitle: "项目化素材剪切",
              mark: "ML",
              href: routeToHash("project-home")
            }}
            items={navItems}
            active={routeTitle(route)}
            footer={
              data ? (
                <CutterSidebarFooter
                  username={cutterUsername}
                  localCount={data.localClips.local_clip_count}
                  publicCount={data.library.available_video_count}
                  activeTaskCount={allVisibleQueue.filter((job) => job.status === "running").length}
                  engineReady={engineReady}
                  currentProjectLabel={sidebarProject ? projectDisplayTitle(sidebarProject) : "未选择"}
                  libraryCountOrder={
                    route === "project-home" || route === "material-locator"
                      ? "local-first"
                      : "public-first"
                  }
                />
              ) : null
            }
          />
          <section
            className={`cutter-workspace ${route === "material-locator" ? "is-content-locked" : ""}`}
          >
            <section className="cutter-content">
              {error ? (
                <InspectorPanel title="加载失败">
                  <p>{error}</p>
                </InspectorPanel>
              ) : data ? (
                renderPage(
                  route,
                  data,
                  visibleCutList,
                  pageQueue,
                  {
                    searchQuery,
                    highlightedSegmentIds,
                    highlightedHitSegments,
                    currentHitIndex: locatorCurrentHitIndex,
                    currentHitSegmentId,
                    globalHitCount,
                    selectedMaterialKey,
                    materialSearchPending,
                    localLibrarySelectedClipId,
                    localLibraryViewMode,
                    recentSearches:
                      route === "project-home" ? recentMaterialSearches : projectRecentMaterialSearches,
                    selectedSegments: selectedTranscriptSegments,
                    selectedStartCharOffset: selectedTranscriptSelection.startCharOffset,
                    selectedEndCharOffset: selectedTranscriptSelection.endCharOffset,
                    selectedDetail: selectedDetail ?? data.primaryDetail,
                    searchStatus: materialSearchStatus,
                    projects,
                    currentProject,
                    currentProjectId,
                    homeSelectedProjectId,
                    sourceFilter,
                    orientationFilter,
                    publicLibraryOrientationFilter,
                    publicLibrarySelectedSourceVideoId,
                    sourceLibraryLoadingMore,
                    cutNotice,
                    autoRefreshCutJobs,
                    lastQueueUpdatedLabel,
                    cutPipelineState,
                    apiBaseUrl,
                    appearanceMode,
                    selectedCutMode
                  },
                  handlers
                )
              ) : (
                <InspectorPanel title="加载中">
                  <p>正在读取剪辑师工作台数据</p>
                </InspectorPanel>
              )}
            </section>
          </section>
        </div>
      </MacWindow>
      {renameTargetProject ? (
        <ProjectRenameDialog
          key={renameTargetProject.project_id}
          project={renameTargetProject}
          initialTitle={projectDisplayTitle(renameTargetProject)}
          onCancel={handleCloseRenameProject}
          onConfirm={handleConfirmRenameProject}
        />
      ) : null}
    </main>
  );

  return (
    <CutterLoginGate
      status={loginStatus}
      message={loginMessage || undefined}
      deviceName={cutterDeviceName()}
      onApply={handleApplyLogin}
    >
      {workbench}
    </CutterLoginGate>
  );
}
