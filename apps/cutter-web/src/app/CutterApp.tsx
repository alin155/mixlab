import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  InspectorPanel,
  MacWindow,
  Sidebar,
  UnifiedToolbar
} from "@mixlab/ui-foundation";
import {
  CutterApiError,
  createCutterApiClient,
  type CutterLoginApplication,
  type CutterLoginStatus,
  type CutterLoginStatusValue
} from "../api.ts";
import {
  createFixtureCutterApiClient,
  emptySearchResponse,
  loadCutterWorkbenchData,
  resolveLocalClipUrls,
  resolveSearchResponseUrls,
  type CutterFixtureData
} from "../fixture-client.ts";
import { CutQueuePage } from "../features/cut-queue/CutQueuePage.tsx";
import { LocalLibraryPage } from "../features/local-library/LocalLibraryPage.tsx";
import {
  MaterialLocatorPage,
  type MaterialSearchHistoryItem
} from "../features/material-locator/MaterialLocatorPage.tsx";
import { PublicLibraryPage } from "../features/public-library/PublicLibraryPage.tsx";
import { SettingsPage } from "../features/settings/SettingsPage.tsx";
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
  mapApiCutJobsToQueueJobs,
  updateQueueJobStatus,
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
import {
  continuousTranscriptSegments,
  nextTranscriptSelectionRange,
  transcriptSelectionRangeFromDrag,
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

function getRuntimeApiBaseUrl(): string {
  return import.meta.env?.VITE_MIXLAB_CUTTER_API_BASE_URL ?? "";
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

export function shouldShowLoginGate(apiMode: boolean, status: CutterLoginStatusValue): boolean {
  return apiMode && status !== "approved";
}

export function shouldRefreshCutQueueForRoute(input: {
  apiMode: boolean;
  hasData: boolean;
  loginGateVisible: boolean;
  route: CutterRoute;
}): boolean {
  return input.apiMode && input.hasData && !input.loginGateVisible && input.route === "cut-tasks";
}

export function shouldShowCutterToolbar(route: CutterRoute): boolean {
  return route !== "material-locator";
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

function CutterSidebarFooter({
  username,
  localCount,
  publicCount
}: {
  username: string;
  localCount: number;
  publicCount: number;
}) {
  return (
    <div className="cutter-sidebar-footer" aria-label="剪辑师与素材状态">
      <div className="cutter-sidebar-user">
        <span>{username}</span>
      </div>
      <div className="cutter-sidebar-metrics">
        <span>
          <strong>{localCount}</strong>
          <small>本地素材</small>
        </span>
        <span>
          <strong>{publicCount}</strong>
          <small>公共素材库</small>
        </span>
      </div>
    </div>
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

export function appendDirectCutFixtureQueue(
  current: readonly CutQueueJob[],
  item: CutListItem,
  createdAt: string
): CutQueueJob[] {
  return [
    ...createQueueJobsFromCutList([{ ...item, order: 1 }], {
      createdAt
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
        highlightedSegmentIds: segments.map((segment) => segment.segment_id)
      }))
    )
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
      title: "现金流短片开场"
    })
  ];
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
    recentSearches: readonly MaterialSearchHistoryItem[];
    selectedSegments: ReturnType<typeof continuousTranscriptSegments>;
    selectedDetail: CutterFixtureData["primaryDetail"];
    sourceFilter: MaterialSearchSourceFilter;
    orientationFilter: VideoOrientationFilter;
    cutNotice: string;
    autoRefreshCutJobs: boolean;
    lastQueueUpdatedLabel: string;
    cutPipelineState: CutPipelineState;
    apiBaseUrl: string;
    appearanceMode: CutterAppearanceMode;
  },
  handlers: {
    addSelectedSpan: () => void;
    search: (query: string) => void;
    selectMaterial: (result: MaterialLocatorResult) => void;
    selectTranscriptSegment: (segmentId: string) => void;
    selectTranscriptRange: (startSegmentId: string, endSegmentId: string) => void;
    navigateHit: (direction: "previous" | "next") => void;
    cancelTranscriptSelection: () => void;
    setSourceFilter: (filter: MaterialSearchSourceFilter) => void;
    setOrientationFilter: (filter: VideoOrientationFilter) => void;
    moveCut: (cutListItemId: string, direction: MoveDirection) => void;
    removeCut: (cutListItemId: string) => void;
    clearCuts: () => void;
    submitCuts: () => void;
    refreshQueue?: () => void;
    runNextJob?: () => void;
    retryFailedCutJob?: (cutJobId: string) => void;
    setAppearanceMode: (mode: CutterAppearanceMode) => void;
  }
) {
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
        highlightedSegmentIds={viewState.highlightedSegmentIds}
        currentHitIndex={viewState.currentHitIndex}
        currentHitSegmentId={viewState.currentHitSegmentId}
        globalHitCount={viewState.globalHitCount}
        selectedMaterialKey={viewState.selectedMaterialKey}
        recentSearches={viewState.recentSearches}
        cutNotice={viewState.cutNotice}
        queue={queue}
        onSearch={handlers.search}
        onSelectMaterial={handlers.selectMaterial}
        onSelectTranscriptSegment={handlers.selectTranscriptSegment}
        onSelectTranscriptRange={handlers.selectTranscriptRange}
        onNavigateHit={handlers.navigateHit}
        onCutSelection={handlers.addSelectedSpan}
        onCancelSelection={handlers.cancelTranscriptSelection}
        onSetSourceFilter={handlers.setSourceFilter}
        onSetOrientationFilter={handlers.setOrientationFilter}
      />
    );
  }

  if (route === "local-library") {
    return <LocalLibraryPage catalog={data.localClips} query="" />;
  }

  if (route === "cut-tasks") {
    return (
      <CutQueuePage
        jobs={queue}
        autoRefreshEnabled={viewState.autoRefreshCutJobs}
        lastUpdatedLabel={viewState.lastQueueUpdatedLabel}
        pipelineState={viewState.cutPipelineState}
        onRefresh={handlers.refreshQueue}
        onRunNext={handlers.runNextJob}
        onRetryFailed={handlers.retryFailedCutJob}
      />
    );
  }

  if (route === "settings") {
    return (
      <SettingsPage
        settings={data.settings}
        runtimeStatus={data.runtimeStatus}
        apiBaseUrl={viewState.apiBaseUrl}
        appearanceMode={viewState.appearanceMode}
        onSetAppearanceMode={handlers.setAppearanceMode}
      />
    );
  }

  return (
    <PublicLibraryPage
      library={data.library}
      selectedSourceVideoId={data.primaryDetail.source_video_id}
    />
  );
}

export function CutterApp() {
  const apiBaseUrl = useMemo(getRuntimeApiBaseUrl, []);
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
  const [sourceFilter, setSourceFilter] = useState<MaterialSearchSourceFilter>("all");
  const [orientationFilter, setOrientationFilter] = useState<VideoOrientationFilter>("all");
  const [transcriptSelection, setTranscriptSelection] = useState<TranscriptSelectionRange>({});
  const [locatorHighlightedSegmentIds, setLocatorHighlightedSegmentIds] = useState<string[]>([]);
  const [locatorCurrentHitIndex, setLocatorCurrentHitIndex] = useState(0);
  const [selectedMaterialFocusKey, setSelectedMaterialFocusKey] = useState<string | undefined>();
  const [recentMaterialSearches, setRecentMaterialSearches] = useState<MaterialSearchHistoryItem[]>([]);
  const [cutNotice, setCutNotice] = useState("");
  const [hasSubmittedCutJobs, setHasSubmittedCutJobs] = useState(false);
  const [lastQueueUpdatedLabel, setLastQueueUpdatedLabel] = useState("");
  const [appearanceMode, setAppearanceMode] = useState<CutterAppearanceMode>(() =>
    readCutterAppearanceMode()
  );
  const [cutPipelineState, setCutPipelineState] = useState<CutPipelineState>(idleCutPipelineState);
  const cutPipelineRunningRef = useRef(false);
  const [data, setData] = useState<CutterFixtureData | null>(null);
  const [cutList, setCutList] = useState<CutListItem[]>(() =>
    deserializeCutList(safeLocalStorageGetItem(CUT_LIST_STORAGE_KEY))
  );
  const [authSession, setAuthSession] = useState<CutterAuthSession | null>(() => readCutterAuthSession());
  const [pendingLogin, setPendingLogin] = useState<CutterPendingLogin | null>(() =>
    apiMode ? readCutterPendingLogin() : null
  );
  const [loginStatus, setLoginStatus] = useState<CutterLoginStatusValue>(() => apiMode ? "unknown" : "approved");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginPollTick, setLoginPollTick] = useState(0);
  const [queueJobs, setQueueJobs] = useState<CutQueueJob[]>([]);
  const [didSeedCutList, setDidSeedCutList] = useState(false);
  const [error, setError] = useState("");
  const client = useMemo(
    () => createRuntimeClient(apiBaseUrl, authSession),
    [apiBaseUrl, authSession]
  );
  const loginGateVisible = shouldShowLoginGate(apiMode, loginStatus);

  function clearMaterialLocatorFocus() {
    setSelectedLocalClipId(undefined);
    setSelectedMaterialFocusKey(undefined);
    setTranscriptSelection({});
    setLocatorHighlightedSegmentIds([]);
    setLocatorCurrentHitIndex(0);
  }

  function focusMaterialTarget(target: MaterialLocatorHitTarget, globalHitIndex: number) {
    setTranscriptSelection({});
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
  }

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

  const refreshQueueJobs = useCallback(async () => {
    if (!apiMode) {
      return;
    }

    try {
      const catalog = await client.listCutJobs();
      const nextJobs = mapApiCutJobsToQueueJobs(catalog);
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
  }, [apiMode, client, refreshLocalClips]);

  useEffect(() => {
    const listener = () => {
      const nextHash = window.location.hash;
      setRoute(routeFromHash(nextHash));
      setSelectedSourceVideoId(sourceVideoIdFromHash(nextHash));
      setSelectedLocalClipId(undefined);
      setSearchQuery((current) =>
        materialLocatorSearchQueryForHashChange({
          hash: nextHash,
          currentSearchQuery: current
        })
      );
      setSourceDetailContext(sourceDetailContextFromHash(nextHash));
      setTranscriptSelection({});
      setLocatorHighlightedSegmentIds([]);
      setLocatorCurrentHitIndex(0);
      setSelectedMaterialFocusKey(undefined);
      setCutNotice("");
    };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (loginGateVisible) {
      return;
    }

    loadCutterWorkbenchData(client, {
      preferredSourceVideoId: selectedSourceVideoId
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
  }, [client, loginGateVisible, selectedSourceVideoId]);

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
      clearMaterialLocatorFocus();
      return;
    }

    let cancelled = false;

    client
      .searchSourceLibrary(query, 20)
      .then((searchResult) => {
        if (!cancelled) {
          const resolvedSearch = resolveSearchResponseUrls(client, searchResult);
          setData((current) =>
            current
              ? {
                  ...current,
                  search: resolvedSearch
                }
              : current
          );
          const firstTarget = materialLocatorHitTargets({
            query,
            sourceFilter,
            orientationFilter,
            localClips: data.localClips,
            library: data.library,
            search: resolvedSearch
          })[0];

          if (firstTarget) {
            focusMaterialTarget(firstTarget, 0);
          } else {
            clearMaterialLocatorFocus();
          }
          setRecentMaterialSearches((current) =>
            nextMaterialSearchHistory(current, {
              query,
              hitCount: resolvedSearch.groups.reduce((sum, group) => sum + group.hit_count, 0)
            })
          );
          setError("");
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          setError(searchError instanceof Error ? searchError.message : "搜索结果加载失败");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, Boolean(data), loginGateVisible, orientationFilter, route, searchQuery, sourceFilter]);

  useEffect(() => {
    if (!shouldRefreshCutQueueForRoute({
      apiMode,
      hasData: Boolean(data),
      loginGateVisible,
      route
    })) {
      return;
    }

    void refreshQueueJobs();
  }, [apiMode, data, loginGateVisible, refreshQueueJobs, route]);

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
  const visibleQueue =
    apiMode
      ? queueJobs
      : queueJobs.length > 0
      ? queueJobs
      : buildQueueFixture(
          createQueueJobsFromCutList(visibleCutList, {
            createdAt: "2026-05-02T10:00:00.000Z"
          })
        );
  const highlightedSegmentIds =
    route === "source-detail" ? sourceDetailContext.segmentIds : locatorHighlightedSegmentIds;
  const currentLocatorHitTarget =
    route === "material-locator" ? locatorHitTargets[locatorCurrentHitIndex] : undefined;
  const currentHitSegmentId =
    currentLocatorHitTarget && currentLocatorHitTarget.materialKey === selectedMaterialKey
      ? currentLocatorHitTarget.segmentId
      : highlightedSegmentIds[0];
  const selectedTranscriptSegments = selectedDetail
    ? continuousTranscriptSegments(selectedDetail.transcript.segments, {
        ...transcriptSelection,
        fallbackSegmentIds: route === "source-detail" ? highlightedSegmentIds : []
      })
    : [];

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
        cutMode: data.settings.default_cut_mode,
        order: visibleCutList.length + 1,
        title: `${selectedDetail.title} 片段`
      });

      if (apiMode) {
        try {
          const clipList = await client.createClipList(
            toCreateClipListRequest({
              libraryId: data.library.library_id ?? "local-library",
              title: "快速剪切",
              items: [item]
            })
          );
          const submission = await client.submitCutJobs({
            clip_list_id: clipList.clip_list_id
          });
          const submittedJobs = mapApiCutJobsToQueueJobs({
            job_count: submission.submitted_count,
            jobs: submission.jobs
          });
          setQueueJobs((current) => [...submittedJobs, ...current]);
          setCutNotice(cutNoticeForSubmittedJobs(submission.submitted_count || submittedJobs.length));
          setHasSubmittedCutJobs(true);
          await refreshQueueJobs();
          void runRealCutPipeline();
        } catch (submitError) {
          setError(submitError instanceof Error ? submitError.message : "剪切任务创建失败");
          return;
        }
      } else {
        const fixtureJob = createQueueJobsFromCutList([{ ...item, order: 1 }], {
          createdAt: new Date().toISOString()
        })[0]!;
        const localClip = localClipFromCutListItem(
          item,
          `clip-${fixtureJob.queue_job_id.replace(/[^a-z0-9]/gi, "").slice(-12)}`
        );

        setQueueJobs((current) => [fixtureJob, ...current]);
        setCutNotice(cutNoticeForSubmittedJobs(1));
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

      setTranscriptSelection({});
    },
    search(query: string) {
      const nextQuery = query.trim();
      setSearchQuery(nextQuery);
      setSelectedSourceVideoId(undefined);
      setSelectedLocalClipId(undefined);
      setSelectedMaterialFocusKey(undefined);
      setTranscriptSelection({});
      setLocatorHighlightedSegmentIds([]);
      setLocatorCurrentHitIndex(0);
      setCutNotice("");
      window.location.hash = searchHash(nextQuery);
    },
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
          highlightedSegmentIds: materialFocusFromResult(result).highlightedSegmentIds
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
    cancelTranscriptSelection() {
      setTranscriptSelection({});
    },
    setSourceFilter,
    setOrientationFilter,
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
          const clipList = await client.createClipList(
            toCreateClipListRequest({
              libraryId: data.library.library_id ?? "local-library",
              title: "待剪清单",
              items: visibleCutList
            })
          );
          const submission = await client.submitCutJobs({
            clip_list_id: clipList.clip_list_id
          });
          setQueueJobs(mapApiCutJobsToQueueJobs({
            job_count: submission.submitted_count,
            jobs: submission.jobs
          }));
          setHasSubmittedCutJobs(true);
          await refreshQueueJobs();
          void runRealCutPipeline();
        } catch (submitError) {
          setError(submitError instanceof Error ? submitError.message : "剪切清单提交失败");
          return;
        }
      } else {
        setQueueJobs(
          buildQueueFixture(
            createQueueJobsFromCutList(visibleCutList, {
              createdAt: new Date().toISOString()
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
    setAppearanceMode: handleSetAppearanceMode
  };

  const workbench = (
    <main
      className="cutter-app"
      data-appearance-mode={appearanceMode}
      data-cutter-web-ready={data ? "true" : "false"}
    >
      <MacWindow title={`MixLab V3 - 剪辑师工作台 / ${routeTitle(route)}`}>
        <div className="cutter-shell">
          <Sidebar
            items={navItems}
            active={routeTitle(route)}
            footer={
              data ? (
                <CutterSidebarFooter
                  username={authSession?.username?.trim() || "本机剪辑师"}
                  localCount={data.localClips.local_clip_count}
                  publicCount={data.library.available_video_count}
                />
              ) : null
            }
          />
          <section className={`cutter-workspace ${shouldShowCutterToolbar(route) ? "" : "is-toolbar-hidden"}`}>
            {shouldShowCutterToolbar(route) ? (
              <UnifiedToolbar
                title="MixLab V3 - 剪辑师工作台"
                libraryLabel={data?.settings.public_library_mount ?? "/Volumes/PublicLibrary"}
                availableCountLabel={data ? `${data.library.available_video_count} 可用原素材` : undefined}
                healthLabel={data ? "健康" : "加载中"}
                actions={["进入素材库", "搜索", "Doctor"]}
              />
            ) : null}
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
                  visibleQueue,
                  {
                    searchQuery,
                    highlightedSegmentIds,
                    currentHitIndex: locatorCurrentHitIndex,
                    currentHitSegmentId,
                    globalHitCount,
                    selectedMaterialKey,
                    recentSearches: recentMaterialSearches,
                    selectedSegments: selectedTranscriptSegments,
                    selectedDetail: selectedDetail ?? data.primaryDetail,
                    sourceFilter,
                    orientationFilter,
                    cutNotice,
                    autoRefreshCutJobs,
                    lastQueueUpdatedLabel,
                    cutPipelineState,
                    apiBaseUrl,
                    appearanceMode
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
