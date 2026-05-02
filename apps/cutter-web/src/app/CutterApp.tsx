import { useCallback, useEffect, useMemo, useState } from "react";
import {
  InspectorPanel,
  MacWindow,
  Sidebar,
  UnifiedToolbar
} from "@mixlab/ui-foundation";
import { createCutterApiClient } from "../api.ts";
import {
  createFixtureCutterApiClient,
  loadCutterWorkbenchData,
  type CutterFixtureData
} from "../fixture-client.ts";
import { CutListPage } from "../features/cut-list/CutListPage.tsx";
import { CutQueuePage } from "../features/cut-queue/CutQueuePage.tsx";
import { LocalLibraryPage } from "../features/local-library/LocalLibraryPage.tsx";
import { PublicLibraryPage } from "../features/public-library/PublicLibraryPage.tsx";
import { SearchPage } from "../features/search/SearchPage.tsx";
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
  createQueueJobsFromCutList,
  mapApiCutJobsToQueueJobs,
  type CutQueueJob
} from "../state/cut-queue.ts";
import {
  CUTTER_NAV_ITEMS,
  routeFromHash,
  routeTitle,
  routeToHash,
  type CutterRoute
} from "./navigation.ts";

function createRuntimeClient() {
  const baseUrl = import.meta.env.VITE_MIXLAB_CUTTER_API_BASE_URL;

  return baseUrl
    ? createCutterApiClient({ base_url: baseUrl })
    : createFixtureCutterApiClient();
}

function isRuntimeApiMode(): boolean {
  return Boolean(import.meta.env.VITE_MIXLAB_CUTTER_API_BASE_URL);
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

function selectedSegmentsForData(data: CutterFixtureData) {
  return data.primaryDetail.transcript.segments.slice(1, 4);
}

function renderPage(
  route: CutterRoute,
  data: CutterFixtureData,
  cutList: readonly CutListItem[],
  queue: readonly CutQueueJob[],
  handlers: {
    addSelectedSpan: () => void;
    moveCut: (cutListItemId: string, direction: MoveDirection) => void;
    removeCut: (cutListItemId: string) => void;
    clearCuts: () => void;
    submitCuts: () => void;
    refreshQueue?: () => void;
    runNextJob?: () => void;
  }
) {
  const selectedSegments = selectedSegmentsForData(data);

  if (route === "source-detail") {
    return (
      <SourceDetailPage
        detail={data.primaryDetail}
        selectedSegments={selectedSegments}
        onAddToCutList={handlers.addSelectedSpan}
      />
    );
  }

  if (route === "search") {
    return <SearchPage search={data.search} query={data.search.query} />;
  }

  if (route === "cut-list") {
    return (
      <CutListPage
        items={cutList}
        onMove={handlers.moveCut}
        onRemove={handlers.removeCut}
        onClear={handlers.clearCuts}
        onSubmit={handlers.submitCuts}
      />
    );
  }

  if (route === "local-library") {
    return <LocalLibraryPage catalog={data.localClips} query="" />;
  }

  if (route === "cut-queue") {
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
  const [route, setRoute] = useState<CutterRoute>(() => routeFromHash(window.location.hash));
  const [data, setData] = useState<CutterFixtureData | null>(null);
  const [cutList, setCutList] = useState<CutListItem[]>(() =>
    deserializeCutList(window.localStorage.getItem(CUT_LIST_STORAGE_KEY))
  );
  const [queueJobs, setQueueJobs] = useState<CutQueueJob[]>([]);
  const [didSeedCutList, setDidSeedCutList] = useState(false);
  const [error, setError] = useState("");
  const client = useMemo(createRuntimeClient, []);
  const apiMode = useMemo(isRuntimeApiMode, []);

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
    const listener = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadCutterWorkbenchData(client)
      .then((result) => {
        if (!cancelled) {
          setData(result);
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
  }, [client]);

  useEffect(() => {
    if (!data || !apiMode) {
      return;
    }

    void refreshQueueJobs();
  }, [apiMode, data, refreshQueueJobs]);

  useEffect(() => {
    if (!data || didSeedCutList) {
      return;
    }

    if (!apiMode && !window.localStorage.getItem(CUT_LIST_STORAGE_KEY) && cutList.length === 0) {
      setCutList(defaultCutListForData(data));
    }

    setDidSeedCutList(true);
  }, [apiMode, cutList.length, data, didSeedCutList]);

  useEffect(() => {
    if (didSeedCutList) {
      window.localStorage.setItem(CUT_LIST_STORAGE_KEY, serializeCutList(cutList));
    }
  }, [cutList, didSeedCutList]);

  const navItems = CUTTER_NAV_ITEMS.map((item) => ({
    label: item.label,
    icon: item.icon,
    href: routeToHash(item.route)
  }));

  const visibleCutList = data && cutList.length === 0 && !didSeedCutList ? defaultCutListForData(data) : cutList;
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
  const handlers = {
    addSelectedSpan() {
      if (!data) {
        return;
      }

      const item = createCutListItemFromSegments({
        sourceVideo: data.primaryDetail,
        segments: selectedSegmentsForData(data),
        cutMode: data.settings.default_cut_mode,
        order: visibleCutList.length + 1,
        title: "现金流短片开场"
      });

      setCutList((current) => {
        const exists = current.some((cut) => cut.cut_list_item_id === item.cut_list_item_id);
        return exists ? current : [...current, { ...item, order: current.length + 1 }];
      });
      window.location.hash = routeToHash("cut-list");
    },
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

      window.location.hash = routeToHash("cut-queue");
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

  return (
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
                renderPage(route, data, visibleCutList, visibleQueue, handlers)
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
}
