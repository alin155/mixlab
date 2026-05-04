import { useCallback, useEffect, useMemo, useState } from "react";
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
  loadCutterWorkbenchData,
  resolveSearchResponseUrls,
  type CutterFixtureData
} from "../fixture-client.ts";
import { CutQueuePage } from "../features/cut-queue/CutQueuePage.tsx";
import { LocalLibraryPage } from "../features/local-library/LocalLibraryPage.tsx";
import { MaterialLocatorPage } from "../features/material-locator/MaterialLocatorPage.tsx";
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
  localClipToSourceVideoDetail,
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
  type CutterAuthSession
} from "../auth.ts";
import { CutterLoginGate } from "../features/login/CutterLoginGate.tsx";
import {
  createQueueJobsFromCutList,
  mapApiCutJobsToQueueJobs,
  type CutQueueJob
} from "../state/cut-queue.ts";
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
import type { VideoOrientationFilter } from "../state/video-orientation.ts";

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

export function materialSelectionFromResult(result: MaterialLocatorResult): {
  range: TranscriptSelectionRange;
  highlightedSegmentIds: string[];
} {
  const highlightedSegmentIds = result.segments.map((segment) => segment.segment_id);

  return {
    range: {
      startSegmentId: highlightedSegmentIds[0],
      endSegmentId: highlightedSegmentIds[highlightedSegmentIds.length - 1]
    },
    highlightedSegmentIds
  };
}

export function cutNoticeForSubmittedJobs(count: number): string {
  return count > 0 ? `已加入剪切任务 · 等待中 ${count}` : "";
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
    selectedSegments: ReturnType<typeof continuousTranscriptSegments>;
    selectedDetail: CutterFixtureData["primaryDetail"];
    sourceFilter: MaterialSearchSourceFilter;
    orientationFilter: VideoOrientationFilter;
    cutNotice: string;
  },
  handlers: {
    addSelectedSpan: () => void;
    search: (query: string) => void;
    selectMaterial: (result: MaterialLocatorResult) => void;
    selectTranscriptSegment: (segmentId: string) => void;
    selectTranscriptRange: (startSegmentId: string, endSegmentId: string) => void;
    cancelTranscriptSelection: () => void;
    setSourceFilter: (filter: MaterialSearchSourceFilter) => void;
    setOrientationFilter: (filter: VideoOrientationFilter) => void;
    moveCut: (cutListItemId: string, direction: MoveDirection) => void;
    removeCut: (cutListItemId: string) => void;
    clearCuts: () => void;
    submitCuts: () => void;
    refreshQueue?: () => void;
    runNextJob?: () => void;
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
        query={viewState.searchQuery || data.search.query}
        sourceFilter={viewState.sourceFilter}
        orientationFilter={viewState.orientationFilter}
        selectedDetail={viewState.selectedDetail}
        selectedSegments={viewState.selectedSegments}
        highlightedSegmentIds={viewState.highlightedSegmentIds}
        cutNotice={viewState.cutNotice}
        queue={queue}
        onSearch={handlers.search}
        onSelectMaterial={handlers.selectMaterial}
        onSelectTranscriptSegment={handlers.selectTranscriptSegment}
        onSelectTranscriptRange={handlers.selectTranscriptRange}
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
        onRefresh={handlers.refreshQueue}
        onRunNext={handlers.runNextJob}
      />
    );
  }

  if (route === "settings") {
    return <SettingsPage settings={data.settings} />;
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
  const [cutNotice, setCutNotice] = useState("");
  const [data, setData] = useState<CutterFixtureData | null>(null);
  const [cutList, setCutList] = useState<CutListItem[]>(() =>
    deserializeCutList(safeLocalStorageGetItem(CUT_LIST_STORAGE_KEY))
  );
  const [authSession, setAuthSession] = useState<CutterAuthSession | null>(() => readCutterAuthSession());
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

  const handleApplyLogin = useCallback(
    async (username: string) => {
      const deviceId = createDeviceId();
      const pendingLogin = {
        username,
        device_id: deviceId,
        device_name: cutterDeviceName()
      };
      writeCutterPendingLogin(pendingLogin);
      const application = await createCutterApiClient({ base_url: apiBaseUrl }).requestLogin({
        username,
        device_id: pendingLogin.device_id,
        device_name: pendingLogin.device_name
      });
      const nextStatus = loginStatusFromApplication(application);
      const nextSession = authSessionFromApprovedApplication(application);

      if (nextSession) {
        writeCutterAuthSession(nextSession);
        clearCutterPendingLogin();
        setAuthSession(nextSession);
        setLoginStatus("approved");
        setLoginMessage("");
        return;
      }

      if (nextStatus === "rejected" || nextStatus === "disabled") {
        clearCutterAuthSession();
        clearCutterPendingLogin();
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
      const pendingLogin = readCutterPendingLogin();

      if (!pendingLogin) {
        setLoginStatus((current) => current === "pending" ? current : "unknown");
        return;
      }

      let cancelled = false;
      let retryTimer: number | null = null;
      setLoginStatus("pending");
      createCutterApiClient({ base_url: apiBaseUrl })
        .requestLogin(pendingLogin)
        .then((application) => {
          if (cancelled) {
            return;
          }

          const nextStatus = loginStatusFromApplication(application);
          const nextSession = authSessionFromApprovedApplication(application);
          if (nextSession) {
            writeCutterAuthSession(nextSession);
            clearCutterPendingLogin();
            setAuthSession(nextSession);
            setLoginStatus("approved");
            setLoginMessage("");
            return;
          }

          if (nextStatus === "rejected" || nextStatus === "disabled") {
            clearCutterAuthSession();
            clearCutterPendingLogin();
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
  }, [apiBaseUrl, apiMode, authSession, client, loginPollTick]);

  const refreshLocalClips = useCallback(async () => {
    const localClips = await client.listLocalClips();
    setData((current) => current ? { ...current, localClips } : current);
  }, [client]);

  const refreshQueueJobs = useCallback(async () => {
    if (!apiMode) {
      return;
    }

    try {
      const catalog = await client.listCutJobs();
      setQueueJobs(mapApiCutJobsToQueueJobs(catalog));
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "剪切队列加载失败");
    }
  }, [apiMode, client]);

  useEffect(() => {
    const listener = () => {
      setRoute(routeFromHash(window.location.hash));
      setSelectedSourceVideoId(sourceVideoIdFromHash(window.location.hash));
      setSelectedLocalClipId(undefined);
      setSearchQuery(searchQueryFromHash(window.location.hash));
      setSourceDetailContext(sourceDetailContextFromHash(window.location.hash));
      setTranscriptSelection({});
      setLocatorHighlightedSegmentIds([]);
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
          setData(result);
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

  useEffect(() => {
    const query = searchQuery.trim();
    if (!data || loginGateVisible || route !== "material-locator" || !query) {
      return;
    }

    let cancelled = false;

    client
      .searchSourceLibrary(query, 20)
      .then((searchResult) => {
        if (!cancelled) {
          setData((current) =>
            current
              ? {
                  ...current,
                  search: resolveSearchResponseUrls(client, searchResult)
                }
              : current
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
  }, [client, Boolean(data), loginGateVisible, route, searchQuery]);

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

  const navItems = CUTTER_NAV_ITEMS.map((item) => ({
    label: item.label,
    icon: item.icon,
    href: routeToHash(item.route)
  }));

  const visibleCutList = data && cutList.length === 0 && !didSeedCutList ? defaultCutListForData(data) : cutList;
  const selectedLocalClip = data?.localClips.clips.find((clip) => clip.local_clip_id === selectedLocalClipId);
  const selectedDetail = selectedLocalClip ? localClipToSourceVideoDetail(selectedLocalClip) : data?.primaryDetail;
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
  const selectedTranscriptSegments = selectedDetail
    ? continuousTranscriptSegments(selectedDetail.transcript.segments, {
        ...transcriptSelection,
        fallbackSegmentIds: highlightedSegmentIds
      })
    : [];
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
          await refreshQueueJobs();
        } catch (submitError) {
          setError(submitError instanceof Error ? submitError.message : "剪切任务创建失败");
          return;
        }
      } else {
        setQueueJobs((current) =>
          appendDirectCutFixtureQueue(current, item, new Date().toISOString())
        );
        setCutNotice(cutNoticeForSubmittedJobs(1));
      }

      setTranscriptSelection({});
    },
    search(query: string) {
      const nextQuery = query.trim();
      setSearchQuery(nextQuery);
      setLocatorHighlightedSegmentIds([]);
      setCutNotice("");
      window.location.hash = searchHash(nextQuery);
    },
    selectMaterial(result: MaterialLocatorResult) {
      const selection = materialSelectionFromResult(result);
      setTranscriptSelection(selection.range);
      setLocatorHighlightedSegmentIds(selection.highlightedSegmentIds);
      setCutNotice("");

      if (result.source === "local") {
        setSelectedLocalClipId(result.id);
        setSelectedSourceVideoId(undefined);
        return;
      }

      setSelectedLocalClipId(undefined);
      setSelectedSourceVideoId(result.id);
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
          await refreshQueueJobs();
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
      ? async () => {
          try {
            await client.runNextCutJob();
            await refreshQueueJobs();
            await refreshLocalClips();
          } catch (runError) {
            setError(runError instanceof Error ? runError.message : "剪切任务执行失败");
          }
        }
      : undefined
  };

  const workbench = (
    <main className="cutter-app" data-cutter-web-ready={data ? "true" : "false"}>
      <MacWindow
        title={`MixLab V3 - 剪辑师工作台 / ${routeTitle(route)}`}
        meta={data ? `${data.library.available_video_count} 可用原素材` : "加载中"}
      >
        <div className="cutter-shell">
          <Sidebar items={navItems} active={routeTitle(route)} />
          <section className="cutter-workspace">
            <UnifiedToolbar
              title="MixLab V3 - 剪辑师工作台"
              libraryLabel={data?.settings.public_library_mount ?? "/Volumes/PublicLibrary"}
              availableCountLabel={data ? `${data.library.available_video_count} 可用原素材` : undefined}
              healthLabel={data ? "健康" : "加载中"}
              actions={["进入素材库", "搜索", "Doctor"]}
            />
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
                    selectedSegments: selectedTranscriptSegments,
                    selectedDetail: selectedDetail ?? data.primaryDetail,
                    sourceFilter,
                    orientationFilter,
                    cutNotice
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
