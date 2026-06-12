import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createFixtureCutterData, emptySearchResponse } from "./fixture-client.ts";
import {
  PublicLibraryPage,
  publicLibraryIndexSummary
} from "./features/public-library/PublicLibraryPage.tsx";
import { SourceDetailPage } from "./features/source-detail/SourceDetailPage.tsx";
import { SearchPage } from "./features/search/SearchPage.tsx";
import {
  MaterialLocatorPage,
  materialLocatorCandidateSummary,
  materialLocatorDisplayDurationMs,
  materialLocatorSectionFooterLabel,
  materialLocatorSelectionShortcutAction,
  materialLocatorTimeSelectionRange
} from "./features/material-locator/MaterialLocatorPage.tsx";
import { CutListPage } from "./features/cut-list/CutListPage.tsx";
import { LocalLibraryPage } from "./features/local-library/LocalLibraryPage.tsx";
import { CutQueuePage } from "./features/cut-queue/CutQueuePage.tsx";
import { SettingsPage } from "./features/settings/SettingsPage.tsx";
import { DesktopFirstRunPage } from "./features/desktop/DesktopFirstRunPage.tsx";
import {
  ProjectCreateDialog,
  ProjectDeleteDialog,
  ProjectHomePage,
  ProjectRenameDialog
} from "./features/project-home/ProjectHomePage.tsx";
import { CutterLoginGate } from "./features/login/CutterLoginGate.tsx";
import {
  CutterApiError,
  type CutterLoginStatus,
  type CutterUserRecord,
  type CutterUserStatus,
  type CutterDeviceRecord,
  type CutterLoginStatusValue,
  type CutterLoginApplication
} from "./api.ts";
import {
  clearCutterAuthSession,
  clearCutterPendingLogin,
  createDeviceId,
  readCutterPendingLogin,
  readCutterAuthSession,
  writeCutterPendingLogin,
  writeCutterAuthSession,
  CUTTER_AUTH_STORAGE_KEY
} from "./auth.ts";
import {
  authSessionFromApprovedApplication,
  appendDirectCutFixtureQueue,
  clearCutterLocalCache,
  cutNoticeForCompletedLocalClips,
  cutNoticeForPipelineResult,
  cutNoticeForSubmittedJobs,
  cutterLocalCacheSnapshot,
  cutterDeviceNameFromNavigator,
  formatCutterCacheSize,
  loginGateStatusFromApplication,
  loginMessageForAuthError,
  loginStatusFromApplication,
  loginStatusFromBackendStatus,
  initialCutterLoginStatus,
  initialMaterialLocatorHitTargetIndex,
  materialLocatorSearchQueryForHashChange,
  materialFocusFromResult,
  materialLocatorHitTargets,
  materialSearchHitCount,
  materialSearchFailureFeedback,
  materialSearchStatusLabels,
  mergeMaterialLocatorReloadData,
  mergeMaterialSearchResponses,
  projectIdForWorkbenchRoute,
  resolveCutterRuntimeApiBaseUrl,
  shouldAutoApplyLocalTrustedLogin,
  shouldAutofocusMaterialLocatorResult,
  shouldClearSessionForLoginStatusError,
  shouldPollPendingLogin,
  shouldRefreshCutQueueForRoute,
  shouldRetryPendingLoginError,
  shouldClearFixtureDataForRuntime,
  shouldStartMaterialSearchForHashChange,
  shouldShowCutterToolbar,
  CutterProjectSwitcher,
  CutterSidebarFooter,
  CutterApp,
  shouldLoadWorkbenchData,
  shouldShowLoginGate
} from "./app/CutterApp.tsx";
import {
  CUTTER_NAV_ITEMS,
  routeFromHash,
  routeToHash,
  routeTitle,
  searchHash,
  searchQueryFromHash,
  sourceDetailHash,
  sourceDetailContextFromHash,
  sourceVideoIdFromHash
} from "./app/navigation.ts";
import { createCutListItemFromSegments } from "./state/cut-list.ts";
import { createQueueJobsFromCutList, type CutQueueJob } from "./state/cut-queue.ts";
import {
  buildMaterialLocatorSections,
  localClipToSourceVideoDetail
} from "./state/material-locator.ts";
import {
  continuousTranscriptSelection,
  transcriptSelectionRangeFromHitSegments
} from "./state/transcript-selection.ts";
import { CUTTER_APPEARANCE_STORAGE_KEY } from "./state/appearance.ts";
import type { CutterProject } from "./state/cutter-projects.ts";

function installTestWindow() {
  const store = new Map<string, string>();
  const localStorage = {
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    get length() {
      return store.size;
    }
  } satisfies Storage;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      location: {
        hash: ""
      }
    }
  });
}

function backendDevice(overrides: Partial<CutterDeviceRecord> = {}): CutterDeviceRecord {
  return {
    device_id: "device-001",
    device_name: "MacBook Pro",
    status: "active",
    first_seen_at: "2026-05-03T08:00:00Z",
    last_login_at: "2026-05-03T08:05:00Z",
    ...overrides
  };
}

function backendUser(status: CutterUserStatus): CutterUserRecord {
  return {
    user_id: "CU000001",
    username: "xiaowang",
    display_name: "小王",
    status,
    applied_at: "2026-05-03T08:00:00Z",
    approved_at: status === "approved" ? "2026-05-03T08:05:00Z" : "",
    rejected_at: status === "rejected" ? "2026-05-03T08:05:00Z" : "",
    disabled_at: status === "disabled" ? "2026-05-03T08:05:00Z" : "",
    last_login_at: status === "approved" ? "2026-05-03T08:05:00Z" : "",
    last_used_at: "",
    note: "",
    devices: [backendDevice()]
  };
}

function backendStatus(status: CutterUserStatus): CutterLoginStatus {
  return {
    ok: true,
    user: backendUser(status)
  };
}

function fixture() {
  const data = createFixtureCutterData();
  const cutList = [
    createCutListItemFromSegments({
      sourceVideo: data.library.videos[0]!,
      segments: data.primaryDetail.transcript.segments.slice(1, 4),
      cutMode: "smart",
      order: 1,
      title: "现金流选区"
    })
  ];
  const queue = createQueueJobsFromCutList(cutList, {
    createdAt: "2026-05-02T10:00:00.000Z",
    projectTitle: "现金流项目"
  });

  return {
    ...data,
    cutList,
    queue: [
      queue[0]!,
      { ...queue[0]!, queue_job_id: "job-running", status: "running" as const, progress: 67 },
      { ...queue[0]!, queue_job_id: "job-done", status: "done" as const, progress: 100 },
      {
        ...queue[0]!,
        queue_job_id: "job-failed",
        status: "failed" as const,
        progress: 18,
        error_message: "FFmpeg 输出目录不可写"
      }
    ]
  };
}

test("source detail hash keeps route and selected source video id separate", () => {
  assert.equal(routeFromHash("#source-detail/V000001"), "source-detail");
  assert.equal(routeFromHash("#/source-detail/V000001"), "source-detail");
  assert.equal(sourceVideoIdFromHash("#source-detail/V000001"), "V000001");
  assert.equal(sourceVideoIdFromHash("#/source-detail/V000001"), "V000001");
  assert.equal(sourceVideoIdFromHash("#source-detail/V000001?query=现金流"), "V000001");
  assert.equal(sourceVideoIdFromHash("#source-detail/not-safe"), undefined);
  assert.equal(sourceVideoIdFromHash("#public-library"), undefined);
  assert.equal(sourceVideoIdFromHash("#/public-library"), undefined);
  assert.equal(sourceDetailHash("V000001"), "#/source-detail/V000001");
  assert.equal(
    sourceDetailHash("V000001", {
      query: "现金流",
      segmentIds: ["V000001-S000001", "V000001-S000002"]
    }),
    "#/source-detail/V000001?query=%E7%8E%B0%E9%87%91%E6%B5%81&segments=V000001-S000001%2CV000001-S000002"
  );
  assert.deepEqual(sourceDetailContextFromHash("#source-detail/V000001?query=%E7%8E%B0%E9%87%91%E6%B5%81&segments=V000001-S000001%2CV000001-S000002"), {
    sourceVideoId: "V000001",
    query: "现金流",
    segmentIds: ["V000001-S000001", "V000001-S000002"]
  });
  assert.deepEqual(sourceDetailContextFromHash("#/source-detail/V000001?query=%E7%8E%B0%E9%87%91%E6%B5%81&segments=V000001-S000001%2CV000001-S000002"), {
    sourceVideoId: "V000001",
    query: "现金流",
    segmentIds: ["V000001-S000001", "V000001-S000002"]
  });
});

test("cutter navigation puts project home above material search", () => {
  assert.deepEqual(
    CUTTER_NAV_ITEMS.map((item) => item.label),
    ["首页", "素材搜索", "剪切任务", "本地素材", "公共素材库", "设置"]
  );
  assert.equal(routeFromHash(""), "project-home");
  assert.equal(routeFromHash("#project-home"), "project-home");
  assert.equal(routeFromHash("#/project-home"), "project-home");
  assert.equal(routeFromHash("#public-library"), "public-library");
  assert.equal(routeFromHash("#/public-library"), "public-library");
  assert.equal(routeTitle("project-home"), "首页");
  assert.equal(routeTitle("material-locator"), "素材搜索");

  const labels = CUTTER_NAV_ITEMS.map((item) => item.label).join(" / ");
  for (const oldLabel of ["原视频详情", "搜索与文案", "待剪清单", "剪切队列"]) {
    assert.equal(labels.includes(oldLabel), false);
  }
});

test("workbench navigation adopts the project selected on the home page", () => {
  assert.equal(projectIdForWorkbenchRoute({
    route: "material-locator",
    currentProjectId: undefined,
    homeSelectedProjectId: "P-selected",
    projectIds: ["P-selected", "P-other"]
  }), "P-selected");

  assert.equal(projectIdForWorkbenchRoute({
    route: "cut-tasks",
    currentProjectId: "P-current",
    homeSelectedProjectId: "P-selected",
    projectIds: ["P-selected", "P-current"]
  }), "P-current");

  assert.equal(projectIdForWorkbenchRoute({
    route: "project-home",
    currentProjectId: undefined,
    homeSelectedProjectId: "P-selected",
    projectIds: ["P-selected"]
  }), undefined);

  assert.equal(projectIdForWorkbenchRoute({
    route: "material-locator",
    currentProjectId: undefined,
    homeSelectedProjectId: "missing-project",
    projectIds: ["P-selected"]
  }), undefined);
});

test("project home renders search-first startup, recent projects, and project detail", () => {
  const data = fixture();
  const queue: CutQueueJob[] = [
    {
      queue_job_id: "done-1",
      cut_list_item_id: "cut-1",
      project_id: "P20260505-001",
      source_video_id: "V000001",
      source_title: "C0015",
      title: "C0015 · E000001",
      begin_ms: 0,
      end_ms: 1000,
      duration_ms: 1000,
      selected_text: "完成片段",
      cut_mode: "smart",
      status: "done",
      progress: 100,
      created_at: "2026-05-05T10:01:00.000Z"
    },
    {
      queue_job_id: "running-1",
      cut_list_item_id: "cut-2",
      project_id: "P20260505-001",
      source_video_id: "V000001",
      source_title: "C0015",
      title: "C0015 · CJ000001",
      begin_ms: 1000,
      end_ms: 2000,
      duration_ms: 1000,
      selected_text: "剪切中片段",
      cut_mode: "smart",
      status: "running",
      progress: 50,
      created_at: "2026-05-05T10:02:00.000Z"
    }
  ];
  const html = renderToStaticMarkup(
    h(ProjectHomePage, {
      library: data.library,
      localClips: data.localClips,
      queue,
      projects: [
        {
          project_id: "P20260505-001",
          title: "5月5日",
          title_source: "auto",
          status: "active",
          created_at: "2026-05-05T10:00:00.000Z",
          updated_at: "2026-05-05T10:05:00.000Z",
          clip_count: 3,
          running_count: 1,
          failed_count: 0,
          cover_url: data.primaryDetail.cover_url,
          source_title: data.primaryDetail.title,
          searches: [
            {
              query: "今天想学管理",
              hit_count: 1,
              searched_at: "2026-05-05T10:00:00.000Z"
            }
          ]
        }
      ],
      selectedProjectId: "P20260505-001",
      onSearch: () => undefined,
      onOpenProject: () => undefined,
      onOpenProjectDirectory: () => undefined
    })
  );

  for (const text of [
    "开始搜索",
    "如「5月5日」或搜索关键词",
    "最近项目",
    "5月5日",
    "搜索",
    "新建项目",
	    "项目详情",
	    "进入项目",
	    "打开文件目录",
	    "重命名",
	    "删除项目"
	  ]) {
    assert.ok(html.includes(text), text);
  }

  assert.match(html, /data-page="project-home"/);
  assert.equal(html.includes("启动入口"), false);
  assert.equal(html.includes("首次剪切时自动创建剪切项目"), false);
  assert.equal(html.includes("最近搜索"), false);
  assert.equal(html.includes("最近搜索："), false);
  assert.equal(html.includes("未完成 1 · 已交付 0"), false);
  assert.equal(html.includes("已剪 1 · 搜索"), false);
  assert.equal(html.includes("选项"), false);
  assert.equal(html.includes("素材来源"), false);
  assert.equal(html.includes("视频类型"), false);
  assert.match(html, /已剪片段<\/dt><dd>1 个/);
});

test("project home separates selecting a recent project from entering it", () => {
  const data = fixture();
  const projects: CutterProject[] = [
    {
      project_id: "P20260505-001",
      title: "5月5日",
      title_source: "auto",
      status: "active",
      created_at: "2026-05-05T10:00:00.000Z",
      updated_at: "2026-05-05T10:05:00.000Z",
      clip_count: 3,
      running_count: 1,
      failed_count: 0,
      searches: []
    },
    {
      project_id: "P20260506-001",
      title: "直播复盘",
      title_source: "manual",
      status: "active",
      created_at: "2026-05-06T10:00:00.000Z",
      updated_at: "2026-05-06T10:05:00.000Z",
      clip_count: 1,
      running_count: 0,
      failed_count: 0,
      searches: []
    }
  ];

  const html = renderToStaticMarkup(
    h(ProjectHomePage, {
      library: data.library,
      localClips: data.localClips,
      projects,
      selectedProjectId: "P20260506-001",
      onSelectProject: () => undefined,
      onOpenProject: () => undefined,
      onOpenProjectDirectory: () => undefined
    })
  );

  assert.match(html, /aria-label="选择项目 5月5日"/);
  assert.match(html, /aria-label="选择项目 直播复盘"/);
	  assert.match(html, /class="cutter-project-card is-selected"/);
	  assert.match(html, /class="cutter-project-card-enter"/);
	  assert.match(html, /class="cutter-project-card-directory"/);
	  assert.ok(html.indexOf("直播复盘") < html.indexOf("项目详情"));
	  assert.match(html, /项目名<\/dt><dd>直播复盘<\/dd>/);
	  assert.match(html, />重命名<\/button>/);
	});

test("project rename dialog uses an in-app form instead of a browser prompt", () => {
  const project: CutterProject = {
    project_id: "P20260506-001",
    title: "5月6日",
    title_source: "auto",
    status: "active",
    created_at: "2026-05-06T10:00:00.000Z",
    updated_at: "2026-05-06T10:05:00.000Z",
    clip_count: 3,
    running_count: 0,
    failed_count: 0,
    searches: []
  };

  const html = renderToStaticMarkup(
    h(ProjectRenameDialog, {
      project,
      initialTitle: "5月6日",
      onCancel: () => undefined,
      onConfirm: () => undefined
    })
  );

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-label="重命名项目"/);
  assert.match(html, /项目名只保存在本机剪辑工作台/);
  assert.match(html, /value="5月6日"/);
  assert.match(html, />保存<\/button>/);
});

test("project create dialog lets users name a project before searching", () => {
  const html = renderToStaticMarkup(
    h(ProjectCreateDialog, {
      initialTitle: "直播切条",
      onCancel: () => undefined,
      onConfirm: () => undefined
    })
  );

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-label="新建项目"/);
  assert.match(html, /项目会保存在本机剪辑工作台/);
  assert.match(html, /value="直播切条"/);
  assert.match(html, />创建<\/button>/);
  assert.match(html, />取消<\/button>/);
});

test("project delete dialog offers removal and output deletion choices", () => {
  const project: CutterProject = {
    project_id: "P20260506-001",
    title: "5月6日",
    title_source: "auto",
    status: "active",
    created_at: "2026-05-06T10:00:00.000Z",
    updated_at: "2026-05-06T10:05:00.000Z",
    clip_count: 3,
    running_count: 0,
    failed_count: 0,
    searches: []
  };

  const html = renderToStaticMarkup(
    h(ProjectDeleteDialog, {
      project,
      mode: "remove",
      onModeChange: () => undefined,
      onCancel: () => undefined,
      onConfirm: () => undefined
    })
  );

  for (const text of [
    "删除项目「5月6日」",
    "从首页移除",
    "不删除剪切视频、本地素材、交付目录",
    "删除项目及产出",
    "公共素材库源视频不会被删除",
    "确认删除"
  ]) {
    assert.match(html, new RegExp(text));
  }
  assert.match(html, /checked="" value="remove"/);
  assert.match(html, /value="delete-with-outputs"/);

  const destructiveHtml = renderToStaticMarkup(
    h(ProjectDeleteDialog, {
      project,
      mode: "delete-with-outputs",
      onModeChange: () => undefined,
      onCancel: () => undefined,
      onConfirm: () => undefined
    })
  );
  assert.match(destructiveHtml, /class="cutter-danger-button"[^>]*>\s*确认删除\s*<\/button>/);
});

test("project delete dialog keeps the destructive confirm button readable", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const lastRule = (pattern: RegExp) =>
    Array.from(css.matchAll(pattern)).map((match) => match.groups?.body ?? "").at(-1) ?? "";
  const dialogDangerRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="project-home"\] \.cutter-project-delete-dialog \.cutter-danger-button\s*{(?<body>[^}]+)}/g
  );

  assert.match(dialogDangerRule, /color:\s*#dc2626/);
  assert.match(dialogDangerRule, /background:\s*#fff7f7/);
  assert.match(dialogDangerRule, /border-color:\s*rgba\(220,\s*38,\s*38,\s*0\.24\)/);
});

test("chrome project switcher exposes project actions and home return", () => {
  const data = fixture();
  const project = {
    project_id: "P20260505-001",
    title: "5月5日",
    title_source: "auto" as const,
    status: "active" as const,
    created_at: "2026-05-05T10:00:00.000Z",
    updated_at: "2026-05-05T10:05:00.000Z",
    clip_count: 3,
    running_count: 1,
    failed_count: 0,
    cover_url: data.primaryDetail.cover_url,
    source_title: data.primaryDetail.title,
    searches: []
  };

  const activeHtml = renderToStaticMarkup(
    h(CutterProjectSwitcher, {
      project,
      onRenameProject: () => undefined
    })
  );
  const temporaryHtml = renderToStaticMarkup(h(CutterProjectSwitcher, {}));

  assert.match(activeHtml, /当前项目：5月5日/);
  assert.match(activeHtml, /回到首页/);
  assert.match(activeHtml, /查看项目剪切任务/);
  assert.match(activeHtml, /重命名当前项目/);
  assert.equal(activeHtml.includes("新建搜索"), false);
  assert.match(temporaryHtml, /未选择项目/);
  assert.equal(temporaryHtml.includes("重命名当前项目"), false);
});

test("legacy cutter hashes resolve into the M14.1 primary flow without breaking old links", () => {
  assert.equal(routeFromHash("#search?query=%E7%8E%B0%E9%87%91%E6%B5%81"), "material-locator");
  assert.equal(routeFromHash("#cut-list"), "cut-tasks");
  assert.equal(routeFromHash("#cut-queue"), "cut-tasks");
  assert.equal(routeFromHash("#source-detail/V000001"), "source-detail");
  assert.equal(routeFromHash("#/search?query=%E7%8E%B0%E9%87%91%E6%B5%81"), "material-locator");
  assert.equal(routeFromHash("#/cut-list"), "cut-tasks");
  assert.equal(routeFromHash("#/cut-queue"), "cut-tasks");
  assert.equal(routeFromHash("#/source-detail/V000001"), "source-detail");
});

test("search hash preserves query while targeting the material locator route", () => {
  assert.equal(routeFromHash("#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81"), "material-locator");
  assert.equal(routeFromHash("#/material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81"), "material-locator");
  assert.equal(routeFromHash("#search?query=%E7%8E%B0%E9%87%91%E6%B5%81"), "material-locator");
  assert.equal(searchQueryFromHash("#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81"), "现金流");
  assert.equal(searchQueryFromHash("#/material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81"), "现金流");
  assert.equal(searchQueryFromHash("#search?query=%E7%8E%B0%E9%87%91%E6%B5%81"), "现金流");
  assert.equal(searchQueryFromHash("#public-library"), "");
  assert.equal(searchQueryFromHash("#/public-library"), "");
  assert.equal(searchHash(" 现金流 "), "#/material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81");
});

test("material locator search query survives navigating to task pages and back", () => {
  assert.equal(
    materialLocatorSearchQueryForHashChange({
      hash: "#cut-tasks",
      currentSearchQuery: "老师"
    }),
    "老师"
  );
  assert.equal(
    materialLocatorSearchQueryForHashChange({
      hash: "#material-locator",
      currentSearchQuery: "老师"
    }),
    "老师"
  );
  assert.equal(
    materialLocatorSearchQueryForHashChange({
      hash: "#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81",
      currentSearchQuery: "老师"
    }),
    "现金流"
  );
  assert.equal(
    materialLocatorSearchQueryForHashChange({
      hash: "#material-locator",
      currentSearchQuery: ""
    }),
    ""
  );
});

test("material locator hash changes only start pending search when query changes", () => {
  assert.equal(
    shouldStartMaterialSearchForHashChange({
      hash: "#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81",
      currentSearchQuery: "现金流",
      nextSearchQuery: "现金流"
    }),
    false
  );
  assert.equal(
    shouldStartMaterialSearchForHashChange({
      hash: "#material-locator?query=%E6%8A%95%E6%94%BE",
      currentSearchQuery: "现金流",
      nextSearchQuery: "投放"
    }),
    true
  );
  assert.equal(
    shouldStartMaterialSearchForHashChange({
      hash: "#cut-tasks",
      currentSearchQuery: "现金流",
      nextSearchQuery: "现金流"
    }),
    false
  );
});

test("all cutter pages hide the general toolbar so the page body owns the workspace", () => {
  for (const route of [
    "material-locator",
    "cut-tasks",
    "local-library",
    "public-library",
    "settings"
  ] as const) {
    assert.equal(shouldShowCutterToolbar(route), false);
  }
});

test("public library is a read-only gallery of available source videos", () => {
  const data = fixture();
  const library = {
    ...data.library,
    videos: [
      data.library.videos[0]!,
      {
        ...data.library.videos[1]!,
        source_video_id: "src-portrait",
        title: "竖版爆款开场",
        width: 1080,
        height: 1920
      }
    ],
    available_video_count: 2
  };
  const runtimeStatus = {
    ...data.runtimeStatus,
    available_video_count: library.available_video_count,
    search_backend: data.runtimeStatus.search_backend
      ? {
          ...data.runtimeStatus.search_backend,
          source_video_count: library.available_video_count
        }
      : data.runtimeStatus.search_backend
  };
  const html = renderToStaticMarkup(
    h(PublicLibraryPage, {
      library,
      selectedSourceVideoId: data.primaryDetail.source_video_id,
      runtimeStatus,
      onSelectSourceVideo: () => undefined
    })
  );

  for (const text of [
    "可用原素材",
    "原素材详情",
    "全部",
    "横版",
    "竖版",
    "直播复盘：从流量到现金流健康度",
    "经营分析",
    "由管理端配置",
    "可搜索素材 2 条",
    "全部可搜索",
    "查看完整文案"
  ]) {
    assert.match(html, new RegExp(text));
  }

  assert.equal(html.includes("搜索索引"), false);
  assert.equal(html.includes("索引已同步"), false);
  assert.match(html, /href="#\/source-detail\/src-001"/);
  assert.match(html, /ml-gallery-select/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /cutter-public-library-scroll/);
  assert.match(html, /ml-gallery-grid/);
  assert.equal(html.includes("processing"), false);
  assert.equal(html.includes("failed"), false);
  assert.equal(html.includes("编辑元数据"), false);

  const portraitHtml = renderToStaticMarkup(
    h(PublicLibraryPage, {
      library,
      orientationFilter: "portrait",
      onSetOrientationFilter: () => undefined
    })
  );
  assert.match(portraitHtml, /aria-label="公共素材视频类型"/);
  assert.match(portraitHtml, /aria-pressed="true"[^>]*>竖版/);
  assert.match(portraitHtml, /竖版爆款开场/);
  assert.equal(portraitHtml.includes("直播复盘：从流量到现金流健康度"), false);

  const emptyPortraitHtml = renderToStaticMarkup(
    h(PublicLibraryPage, {
      library: {
        ...data.library,
        videos: [data.library.videos[0]!],
        available_video_count: 1
      },
      orientationFilter: "portrait"
    })
  );
  assert.match(emptyPortraitHtml, /当前筛选没有可用原素材/);
  assert.match(emptyPortraitHtml, /未选择原素材/);
  assert.equal(emptyPortraitHtml.includes("直播复盘：从流量到现金流健康度"), false);

  const pagedHtml = renderToStaticMarkup(
    h(PublicLibraryPage, {
      library: {
        ...library,
        available_video_count: 4
      },
      hasMore: true,
      onLoadMore: () => undefined
    })
  );
  assert.match(pagedHtml, /继续加载 2 条/);
  assert.match(pagedHtml, /已显示 2 \/ 4/);

  const loadingMoreHtml = renderToStaticMarkup(
    h(PublicLibraryPage, {
      library: {
        ...library,
        available_video_count: 4
      },
      hasMore: true,
      isLoadingMore: true,
      onLoadMore: () => undefined
    })
  );
  assert.match(loadingMoreHtml, /正在读取/);
  assert.match(loadingMoreHtml, /disabled=""/);
});

test("public library explains searchable material refresh drift", () => {
  const data = fixture();

  assert.equal(
    publicLibraryIndexSummary({
      libraryCount: data.runtimeStatus.available_video_count,
      runtimeStatus: data.runtimeStatus
    }),
    `可搜索素材 ${data.runtimeStatus.available_video_count} 条 · 全部可搜索`
  );

  assert.equal(
    publicLibraryIndexSummary({
      libraryCount: data.runtimeStatus.available_video_count + 1,
      runtimeStatus: {
        ...data.runtimeStatus,
        search_backend: {
          ...data.runtimeStatus.search_backend!,
          mode: "searchd",
          preferred_mode: "searchd",
          label: "本地 searchd"
        }
      }
    }),
    `可搜索素材 ${data.runtimeStatus.available_video_count} 条 · 正在更新可搜索素材`
  );
});

test("source detail renders player, complete transcript, continuous selection, and one-span add action", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(SourceDetailPage, {
      detail: data.primaryDetail,
      selectedSegments: data.primaryDetail.transcript.segments.slice(1, 4),
      highlightedSegmentIds: ["s-062", "s-064"],
      onSelectSegment: () => undefined,
      onAddToCutList: () => undefined
    })
  );

  for (const text of [
    "原视频与完整文案",
    "完整文案",
    "连续选择",
    "已选 3 句",
    "加入待剪清单",
    "现金流的本质",
    "选择此句"
  ]) {
    assert.match(html, new RegExp(text));
  }

  assert.match(html, /<video/);
  assert.match(html, /data-selection-mode="continuous"/);
  assert.match(html, /is-highlighted/);
  assert.match(html, new RegExp(`${data.primaryDetail.title} 片段`));
  assert.equal(html.includes("关键帧"), false);
  assert.equal(html.includes("现金流短片开场"), false);
});

test("search page groups hits by source video and avoids sentence waterfall", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(SearchPage, {
      search: data.search,
      query: data.search.query,
      onSearch: () => undefined
    })
  );

  for (const text of ["按原素材分组", "5 组命中", "直播复盘：从流量到现金流健康度", "上下文文案", "执行搜索", "查看完整文案"]) {
    assert.match(html, new RegExp(text));
  }

  assert.match(html, /当前范围：原素材文案/);
  assert.equal(html.includes("标签"), false);
  assert.equal(html.includes("课程"), false);
  assert.match(html, /name="query"/);
  assert.match(html, /href="#\/source-detail\/src-001\?query=%E7%8E%B0%E9%87%91%E6%B5%81&amp;segments=/);
  assert.equal(html.includes("sentence-waterfall"), false);
});

test("material locator is the main search-select-cut workbench with public source results first", () => {
  const data = fixture();
  const publicTranscriptLength = data.primaryDetail.transcript.full_text.replace(/\s+/g, "").length;
  const html = renderToStaticMarkup(
    h(MaterialLocatorPage as any, {
      library: data.library,
      localClips: data.localClips,
      search: data.search,
      query: data.search.query,
      sourceFilter: "all",
      orientationFilter: "all",
      selectedDetail: data.primaryDetail,
      selectedSegments: data.primaryDetail.transcript.segments.slice(1, 3),
      highlightedSegmentIds: ["s-062"],
      currentHitIndex: 0,
      currentHitSegmentId: "s-062",
      globalHitCount: 3,
      selectedMaterialKey: `public:${data.primaryDetail.source_video_id}`,
      recentSearches: [
        { query: "老师", hitCount: 20 },
        { query: "现金流", hitCount: 3 }
      ],
      cutNotice: "已加入剪切任务 · 等待中 1",
      queue: data.queue,
      cutMode: "copy",
      onSearch: () => undefined,
      onSelectMaterial: () => undefined,
      onNavigateHit: () => undefined,
      onCutSelection: () => undefined,
      onCancelSelection: () => undefined,
      onOpenCutOutputDirectory: () => undefined,
      onSetCutMode: () => undefined
    })
  );

  for (const text of [
    "素材搜索",
	    "搜索文案关键词或粘贴爆款文案",
	    "候选素材",
	    "本地素材",
	    "公共原素材",
	    "横版",
	    "视频文案",
	    "上一个",
	    "下一个",
	    "选区信息",
	    "命中",
	    "已加入剪切任务 · 等待中 1",
    "最近剪切任务",
    "状态",
    "来源视频",
    "查看全部任务"
  ]) {
    assert.ok(html.includes(text), text);
  }
  assert.equal(html.includes("导出片段"), false);
  for (const removedText of [
	    "清空搜索",
	    "按相关度排序",
	    "用鼠标拖选文案后，剪切按钮会出现在鼠标位置。",
	    "来自当前连续文案选区",
	    "剪切会按这个范围提交",
	    "选区校验",
	    "选中当前命中",
	    "极速剪切",
	    "精准剪切",
	    "当前 11:58 · 定位",
	    "选中文案"
	  ]) {
	    assert.equal(html.includes(removedText), false, removedText);
	  }
  for (const removedClass of [
    "cutter-locator-status-strip",
    "cutter-locator-clear-button",
    "cutter-locator-sort-label",
    "cutter-locator-time-editor",
    "cutter-locator-selection-proof",
    "cutter-locator-context-hint",
    "cutter-video-scrim",
    "cutter-video-time",
    "cutter-video-progress"
  ]) {
    assert.equal(html.includes(removedClass), false, removedClass);
  }

  assert.equal(html.includes("片段篮"), false);
  assert.equal(html.includes("待剪清单"), false);
  assert.equal(html.includes("搜索定位"), false);
  assert.equal(html.includes("候选素材 <span>·"), false);
  const localCandidateSectionIndex = html.indexOf("本地素材");
  const publicCandidateSectionIndex = html.indexOf("公共原素材");
  assert.ok(localCandidateSectionIndex >= 0);
  assert.ok(publicCandidateSectionIndex >= 0);
  assert.ok(publicCandidateSectionIndex < localCandidateSectionIndex);
  assert.equal(html.includes("cutter-locator-top-row"), false);
  assert.equal(html.includes("流程明细"), false);
  assert.equal(html.includes("cutter-locator-queue-phases"), false);
  assert.equal(html.includes("cutter-locator-bottom-row"), false);
  assert.ok(html.indexOf("cutter-locator-command") < html.indexOf("cutter-locator-workbench"));
  assert.ok(html.indexOf("cutter-locator-candidates") < html.indexOf("cutter-natural-transcript"));
  assert.ok(html.indexOf("cutter-natural-transcript") < html.indexOf("cutter-locator-side-panel"));
  assert.ok(html.indexOf("cutter-locator-visual") < html.indexOf("cutter-locator-cut-panel"));
  assert.ok(html.indexOf("cutter-locator-cut-panel") < html.indexOf("cutter-locator-queue-panel"));
  assert.ok(html.indexOf("cutter-locator-queue-notice") > html.indexOf("cutter-locator-queue-panel"));
  assert.equal(html.includes("当前搜索"), false);
  assert.equal(html.includes("画面方向"), false);
  assert.ok(html.includes('value="现金流"'));
  assert.equal(html.includes("<span>候选素材</span>"), false);
  assert.equal(html.includes("<span>搜索次数</span>"), false);
  assert.equal(html.includes("搜、选、剪"), false);
  assert.equal(html.includes("<h1>素材定位</h1>"), false);
  assert.equal(html.includes("完整文案工作台"), false);
  assert.equal(html.includes("自然文案"), false);
  assert.equal(html.includes("选项"), false);
  assert.equal(html.includes("素材来源"), false);
  assert.equal(html.includes("视频类型"), false);
  assert.equal(html.includes("<h2>画面验证</h2>"), false);
  assert.equal(html.includes("横版 · 29:50"), false);
  assert.equal(html.includes("<h2>剪切队列</h2>"), false);
  assert.equal(html.includes("剪切中 0 · 等待 1 · 完成 2 · 失败 0"), false);
  assert.equal(html.includes("cutter-locator-notice"), false);
  assert.ok(html.includes(`直播复盘：从流量到现金流健康度 · 公共原素材 · 横版 · 32:15 · 文案 ${publicTranscriptLength} 字 · 命中 8 处`));
  assert.ok(html.includes(`<small>${publicTranscriptLength.toLocaleString()} 字</small>`));
  assert.ok(html.includes(`<small>32:15 · 命中 8</small>`));
  assert.equal(html.includes(`<small>文案 ${publicTranscriptLength.toLocaleString()} 字</small>`), false);
  assert.ok(html.includes("命中 3"));
  assert.ok(html.includes("cutter-locator-result is-selected"));
  assert.equal(html.includes("<em>"), false);
  assert.equal(html.includes('name="sourceFilter"'), false);
  assert.equal(html.includes('name="orientationFilter"'), false);
  assert.ok(html.includes('data-layout="search-select-cut"'));
  assert.ok(html.includes('data-page="material-locator"'));
  assert.ok(html.includes('data-product-page="material-search"'));
  assert.equal(html.includes("<video"), false);
  assert.ok(html.includes('data-testid="locator-video-poster"'));
  assert.equal(html.includes('data-testid="select-current-hit"'), false);
  assert.equal(html.includes('data-testid="selection-proof-strip"'), false);
  assert.equal(html.includes("cutter-video-poster-frame is-reference-poster"), true);
  assert.equal(html.includes("cutter-video-poster-controls"), false);
  assert.equal(html.includes("<small>来源</small><strong>公共原素材</strong>"), false);
  assert.equal(html.includes("<small>命中</small><strong>1/3</strong>"), false);
  assert.doesNotMatch(html, /<small>字数<\/small><strong>\d+ 字<\/strong>/);
  assert.equal(html.includes("cutter-floating-selection-bar"), false);
  assert.equal(html.includes("cutter-compact-selection-bar"), false);
  assert.ok(html.includes("cutter-transcript-row"));
  assert.ok(html.includes("cutter-transcript-time"));
  assert.ok(html.includes("cutter-locator-queue-table"));
  assert.ok(html.includes("cutter-video-frame"));
  assert.ok(html.includes('/fixture-media/design-material-video-frame.png'));
  assert.ok(html.includes("已选 19 秒"));
  assert.doesNotMatch(html, /<button class="cutter-secondary-button" type="button">复制<\/button>/);
  assert.equal(html.includes("cutter-locator-filter-button"), false);
  assert.equal(html.includes("仅看命中"), false);
  assert.doesNotMatch(html, /<button[^>]*>按相关度/);
  assert.equal(html.includes("已选中一段文案"), false);
  assert.equal(html.includes("逐帧预览"), false);
  assert.equal(html.includes("aria-label=\"播放\""), false);
  assert.equal(html.includes("aria-label=\"音量\""), false);
  assert.equal(html.includes("aria-label=\"全屏\""), false);
  assert.equal(html.includes("-0.1s"), false);
  assert.equal(html.includes("+0.1s"), false);
  assert.equal(html.includes("cutter-selection-bar"), false);
  assert.equal(html.includes("剪切这段"), false);
  assert.equal(html.includes("预览选区"), false);
  assert.equal(html.includes("暂停预览"), false);
  assert.match(html, /<button[^>]+class="cutter-transcript-time"[^>]+data-transcript-time-selector="true"/);
});

test("material locator prefers real media duration when browser metadata is available", () => {
  assert.equal(materialLocatorDisplayDurationMs(1_326_000), 1_326_000);
  assert.equal(materialLocatorDisplayDurationMs(1_326_000, 1_790_400), 1_790_400);
  assert.equal(materialLocatorDisplayDurationMs(1_326_000, 0), 1_326_000);
});

test("material locator selection shortcuts cut or preview only outside focused controls", () => {
  assert.equal(materialLocatorSelectionShortcutAction({
    key: "Enter",
    hasSelectedText: true
  }), "cut");
  assert.equal(materialLocatorSelectionShortcutAction({
    key: " ",
    code: "Space",
    hasSelectedText: true
  }), "preview");
  assert.equal(materialLocatorSelectionShortcutAction({
    key: "Enter",
    hasSelectedText: false
  }), undefined);
  assert.equal(materialLocatorSelectionShortcutAction({
    key: "Enter",
    hasSelectedText: true,
    ignoreTarget: true
  }), undefined);
  assert.equal(materialLocatorSelectionShortcutAction({
    key: "Enter",
    hasSelectedText: true,
    metaKey: true
  }), undefined);
});

test("material locator uses global hit navigation and wraps across candidate materials", async () => {
  const data = fixture();
  const appModule = (await import("./app/CutterApp.tsx")) as any;

  assert.equal(typeof appModule.materialLocatorHitTargets, "function");
  assert.equal(typeof appModule.nextMaterialLocatorHitIndex, "function");

  const targets = appModule.materialLocatorHitTargets({
    query: data.search.query,
    sourceFilter: "all",
    orientationFilter: "all",
    localClips: data.localClips,
    library: data.library,
    search: data.search
  });

  assert.ok(targets.length > 3);
  assert.equal(targets[0].material.source, "public");
  assert.ok(targets.some((target: { material: { source: string } }) => target.material.source === "public"));
  assert.ok(targets.some((target: { material: { source: string } }) => target.material.source === "local"));
  assert.equal(appModule.nextMaterialLocatorHitIndex(0, "previous", targets.length), targets.length - 1);
  assert.equal(appModule.nextMaterialLocatorHitIndex(targets.length - 1, "next", targets.length), 0);
});

test("material locator counts one natural text hit across multiple transcript segments", async () => {
  const data = fixture();
  const appModule = (await import("./app/CutterApp.tsx")) as any;

  const targets = appModule.materialLocatorHitTargets({
    query: "现金流决定企业能不能安全穿过周期",
    sourceFilter: "public",
    orientationFilter: "all",
    localClips: { local_clip_count: 0, clips: [] },
    library: data.library,
    search: {
      query: "现金流决定企业能不能安全穿过周期",
      normalized_query: "现金流决定企业能不能安全穿过周期",
      groups: [
        {
          source_video_id: data.primaryDetail.source_video_id,
          title: data.primaryDetail.title,
          duration_ms: data.primaryDetail.duration_ms,
          hit_count: 2,
          best_excerpt: "现金流决定企业能不能安全穿过周期",
          hit_segments: [
            {
              ...data.primaryDetail.transcript.segments[0],
              match_id: "M000001"
            },
            {
              ...data.primaryDetail.transcript.segments[1],
              match_id: "M000001"
            },
            {
              ...data.primaryDetail.transcript.segments[2],
              match_id: "M000002"
            }
          ]
        }
      ]
    }
  });

  assert.equal(targets.length, 2);
  assert.deepEqual(targets[0].highlightedSegmentIds, [
    data.primaryDetail.transcript.segments[0]?.segment_id,
    data.primaryDetail.transcript.segments[1]?.segment_id
  ]);
  assert.deepEqual(targets[1].highlightedSegmentIds, [
    data.primaryDetail.transcript.segments[2]?.segment_id
  ]);
});

test("material locator hit controls stay available while separating global and current-video hit counts", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(MaterialLocatorPage as any, {
      library: data.library,
      localClips: data.localClips,
      search: data.search,
      query: data.search.query,
      sourceFilter: "all",
      orientationFilter: "all",
      selectedDetail: data.primaryDetail,
      selectedMaterialKey: `public:${data.primaryDetail.source_video_id}`,
      highlightedSegmentIds: ["s-062"],
      currentHitSegmentId: "s-062",
      currentHitIndex: 9,
      globalHitCount: 10,
      queue: data.queue,
      onNavigateHit: () => undefined
    })
  );

  assert.doesNotMatch(html, /当前 11:58 · 定位 10 \/ 10 · 本片命中 8 处/);
  assert.match(html, /data-current-hit-time-ms="718000"/);
  assert.doesNotMatch(html, /<button type="button" disabled="">上一个<\/button>/);
  assert.doesNotMatch(html, /<button type="button" disabled="">下一个<\/button>/);
  assert.doesNotMatch(html, /select-current-hit/);
  assert.doesNotMatch(html, /选中当前命中/);
});

test("material locator renders backend match ranges when query text differs from transcript text", () => {
  const data = fixture();
  const segment = data.primaryDetail.transcript.segments.find((item) => item.segment_id === "s-062")!;
  const start = segment.text.indexOf("现金流");
  const hitSegment = {
    ...segment,
    match_ranges: [[start, start + "现金流".length] as [number, number]],
    match_type: "tolerant" as const
  };
  const html = renderToStaticMarkup(
    h(MaterialLocatorPage as any, {
      library: data.library,
      localClips: { local_clip_count: 0, clips: [] },
      search: {
        query: "现今流",
        normalized_query: "现今流",
        groups: [
          {
            source_video_id: data.primaryDetail.source_video_id,
            title: data.primaryDetail.title,
            duration_ms: data.primaryDetail.duration_ms,
            hit_count: 1,
            best_excerpt: segment.text,
            hit_segments: [hitSegment]
          }
        ]
      },
      query: "现今流",
      sourceFilter: "public",
      orientationFilter: "all",
      selectedDetail: data.primaryDetail,
      selectedMaterialKey: `public:${data.primaryDetail.source_video_id}`,
      highlightedSegmentIds: [segment.segment_id],
      highlightedHitSegments: [hitSegment],
      currentHitSegmentId: segment.segment_id,
      currentHitIndex: 0,
      globalHitCount: 1,
      queue: data.queue
    })
  );

  assert.ok(start > 0);
  assert.ok(html.includes('<mark data-testid="transcript-hit">现金流</mark>'));
  assert.equal(html.includes('<mark data-testid="transcript-hit">现今流</mark>'), false);
});

test("material locator data reload preserves the active search while focusing a public result", async () => {
  const data = createFixtureCutterData();
  const reloadedData = {
    ...data,
    search: emptySearchResponse(),
    primaryDetail: {
      ...data.primaryDetail,
      source_video_id: "src-002",
      title: "私域直播复盘方法"
    }
  };

  assert.equal(typeof mergeMaterialLocatorReloadData, "function");

  const merged = mergeMaterialLocatorReloadData(data, reloadedData, data.search.query);
  assert.equal(merged.primaryDetail.source_video_id, "src-002");
  assert.equal(merged.search.groups.length, data.search.groups.length);
  assert.equal(merged.search.query, data.search.query);

  const blankSearchMerged = mergeMaterialLocatorReloadData(data, reloadedData, "");
  assert.equal(blankSearchMerged.search.groups.length, 0);
});

test("material search pages merge cursor batches without delaying first results", () => {
  const data = createFixtureCutterData();
  const firstPage = {
    ...data.search,
    groups: [data.search.groups[0]!],
    cursor: "",
    next_cursor: "sqlite:1",
    has_more: true,
    returned_count: 1,
    limit: 1,
    index_version: "v000001",
    search_ms: 6,
    search_mode: "sqlite-index" as const
  };
  const secondPage = {
    ...data.search,
    groups: [data.search.groups[1]!],
    cursor: "sqlite:1",
    next_cursor: "",
    has_more: false,
    returned_count: 1,
    limit: 1,
    index_version: "v000001",
    search_ms: 8,
    search_mode: "sqlite-index" as const
  };

  const merged = mergeMaterialSearchResponses(firstPage, secondPage);

  assert.equal(merged.groups.length, 2);
  assert.deepEqual(
    merged.groups.map((group) => group.source_video_id),
    ["src-001", "src-004"]
  );
  assert.equal(merged.next_cursor, "");
  assert.equal(merged.has_more, false);
  assert.equal(merged.returned_count, 2);
  assert.equal(merged.search_ms, 14);
  assert.equal(materialSearchHitCount(merged), 12);
});

test("material search page merge deduplicates a repeated source video and preserves hit text", () => {
  const data = createFixtureCutterData();
  const firstSegment = data.search.groups[0]!.hit_segments[0]!;
  const secondSegment = data.search.groups[0]!.hit_segments[1]!;
  const firstPage = {
    ...data.search,
    groups: [
      {
        ...data.search.groups[0]!,
        hit_count: 1,
        hit_segments: [firstSegment]
      }
    ],
    next_cursor: "sqlite:1",
    has_more: true,
    search_ms: 2
  };
  const repeatedPage = {
    ...data.search,
    groups: [
      {
        ...data.search.groups[0]!,
        hit_count: 2,
        hit_segments: [firstSegment, secondSegment]
      }
    ],
    cursor: "sqlite:1",
    next_cursor: "",
    has_more: false,
    search_ms: 3
  };

  const merged = mergeMaterialSearchResponses(firstPage, repeatedPage);

  assert.equal(merged.groups.length, 1);
  assert.equal(merged.groups[0]?.hit_count, 2);
  assert.deepEqual(
    merged.groups[0]?.hit_segments.map((segment) => segment.segment_id),
    [firstSegment.segment_id, secondSegment.segment_id]
  );
});

test("material search status uses user-facing searchable material states", () => {
  const data = createFixtureCutterData();
  const firstBatchPending = materialSearchStatusLabels({
    pending: true,
    search: emptySearchResponse("现金流"),
    fallbackLabel: "就绪"
  });
  assert.equal(firstBatchPending.syncLabel, "正在匹配");
  assert.equal(firstBatchPending.searchLatencyLabel, "匹配中");

  const backgroundPending = materialSearchStatusLabels({
    pending: true,
    search: {
      ...data.search,
      search_mode: "sqlite-index",
      index_version: "v000001",
      search_ms: 12
    },
    elapsedMs: 1211,
    fallbackLabel: "就绪"
  });
  assert.equal(backgroundPending.indexLabel, "可用");
  assert.equal(backgroundPending.syncLabel, "继续匹配");
  assert.equal(backgroundPending.searchLatencyLabel, "已返回");

  const fallbackComplete = materialSearchStatusLabels({
    pending: false,
    search: {
      ...data.search,
      search_mode: "transcript-artifact-fallback",
      search_ms: 31
    },
    fallbackLabel: "Fixture"
  });
  assert.equal(fallbackComplete.indexLabel, "部分素材可用");
  assert.equal(fallbackComplete.syncLabel, "部分结果可用");
  assert.equal(fallbackComplete.nasLabel, "部分结果可用");

  const runtimeSearchdReady = materialSearchStatusLabels({
    pending: false,
    runtimeSearchBackend: {
      mode: "searchd",
      preferred_mode: "searchd",
      label: "本地 searchd",
      healthy: true,
      degraded: false,
      index_version: "tantivy-v000001",
      source_video_count: 50,
      segment_count: 12_000,
      response_ms: 5,
      message: "本地 Tantivy 搜索索引可用"
    },
    fallbackLabel: "就绪"
  });
  assert.equal(runtimeSearchdReady.indexLabel, "已发布 50 条");
  assert.equal(runtimeSearchdReady.syncLabel, "可搜索");
  assert.equal(runtimeSearchdReady.searchLatencyLabel, "就绪");
  assert.equal(runtimeSearchdReady.nasLabel, "已连接");

  const runtimeSearchdSyncing = materialSearchStatusLabels({
    pending: false,
    runtimeSearchBackend: {
      mode: "searchd",
      preferred_mode: "searchd",
      label: "本地 searchd",
      healthy: true,
      degraded: false,
      index_version: "tantivy-v000002",
      source_video_count: 50,
      segment_count: 12_000,
      response_ms: 5,
      message: "本地 Tantivy 搜索索引可用"
    },
    availableVideoCount: 51,
    fallbackLabel: "就绪"
  });
  assert.equal(runtimeSearchdSyncing.indexLabel, "已发布 50 条");
  assert.equal(runtimeSearchdSyncing.syncLabel, "素材更新中");
});

test("material search background failure keeps first batch usable", () => {
  assert.deepEqual(
    materialSearchFailureFeedback({
      hasFirstPage: true,
      error: new Error("searchd_unavailable")
    }),
    {
      notice: "后续搜索结果加载失败，可继续使用首批结果",
      error: ""
    }
  );

  assert.deepEqual(
    materialSearchFailureFeedback({
      hasFirstPage: false,
      error: new Error("本地搜索服务暂不可用，请重试搜索。")
    }),
    {
      notice: "",
      error: "本地搜索服务暂不可用，请重试搜索。"
    }
  );
});

test("material locator candidate summary reports background search loading and completion", () => {
  assert.equal(
    materialLocatorCandidateSummary({
      hasActiveQuery: false,
      candidateCount: 0,
      hitCount: 0,
      isSearching: false,
      hasMoreSearchResults: false
    }),
    "等待搜索"
  );
  assert.equal(
    materialLocatorCandidateSummary({
      hasActiveQuery: true,
      candidateCount: 0,
      hitCount: 0,
      isSearching: true,
      hasMoreSearchResults: false
    }),
    "首批匹配中"
  );
  assert.equal(
    materialLocatorCandidateSummary({
      hasActiveQuery: true,
      candidateCount: 20,
      hitCount: 137,
      isSearching: true,
      hasMoreSearchResults: true
    }),
    "已载入20条 · 命中137处 · 加载中"
  );
  assert.equal(
    materialLocatorCandidateSummary({
      hasActiveQuery: true,
      candidateCount: 47,
      hitCount: 312,
      isSearching: false,
      hasMoreSearchResults: false
    }),
    "已载入47条 · 命中312处 · 完成"
  );
  assert.equal(
    materialLocatorSectionFooterLabel({
      sectionKey: "public",
      itemCount: 20,
      isSearching: true,
      hasMoreSearchResults: true
    }),
    "继续加载中（已显示 20）"
  );
  assert.equal(
    materialLocatorSectionFooterLabel({
      sectionKey: "local",
      itemCount: 3,
      isSearching: true,
      hasMoreSearchResults: true
    }),
    "已显示全部（3）"
  );
});

test("material locator renders high-hit search loading as passive status instead of a dead expand button", () => {
  const data = createFixtureCutterData();
  const firstGroup = data.search.groups[0]!;
  const pagedSearch = {
    ...data.search,
    groups: [firstGroup],
    returned_count: 1,
    next_cursor: "searchd:10",
    has_more: true,
    search_mode: "searchd" as const,
    index_version: "tantivy-v000001"
  };
  const html = renderToStaticMarkup(
    h(MaterialLocatorPage, {
      library: data.library,
      localClips: {
        ...data.localClips,
        clips: []
      },
      search: pagedSearch,
      query: data.search.query,
      sourceFilter: "public",
      orientationFilter: "all",
      selectedDetail: data.primaryDetail,
      selectedMaterialKey: `public:${firstGroup.source_video_id}`,
      highlightedSegmentIds: firstGroup.hit_segments.map((segment) => segment.segment_id),
      selectedSegments: [],
      isSearching: true,
      queue: []
    })
  );

  assert.match(html, /已载入1条 · 命中\d+处 · 加载中/);
  assert.match(html, /继续加载中（已显示 1）/);
  assert.equal(html.includes("展开全部"), false);
});

test("material locator requests deferred autofocus after async search targets arrive", () => {
  assert.equal(
    shouldAutofocusMaterialLocatorResult({
      route: "material-locator",
      query: "长文案命中",
      selectedMaterialKey: undefined,
      hitTargetCount: 1
    }),
    true
  );
  assert.equal(
    shouldAutofocusMaterialLocatorResult({
      route: "material-locator",
      query: "长文案命中",
      selectedMaterialKey: "public:V000033",
      hitTargetCount: 1
    }),
    false
  );
  assert.equal(
    shouldAutofocusMaterialLocatorResult({
      route: "project-home",
      query: "长文案命中",
      selectedMaterialKey: undefined,
      hitTargetCount: 1
    }),
    false
  );
  assert.equal(
    shouldAutofocusMaterialLocatorResult({
      route: "material-locator",
      query: "   ",
      selectedMaterialKey: undefined,
      hitTargetCount: 1
    }),
    false
  );
  assert.equal(
    shouldAutofocusMaterialLocatorResult({
      route: "material-locator",
      query: "长文案命中",
      selectedMaterialKey: undefined,
      hitTargetCount: 0
    }),
    false
  );
});

test("material locator autofocus prefers public source transcript while keeping local results available", () => {
  const data = fixture();
  const allTargets = materialLocatorHitTargets({
    query: data.search.query,
    sourceFilter: "all",
    orientationFilter: "all",
    localClips: data.localClips,
    library: data.library,
    search: data.search
  });
  const allInitialIndex = initialMaterialLocatorHitTargetIndex(allTargets, "all");
  const localTargets = materialLocatorHitTargets({
    query: data.search.query,
    sourceFilter: "local",
    orientationFilter: "all",
    localClips: data.localClips,
    library: data.library,
    search: data.search
  });
  const publicTargets = materialLocatorHitTargets({
    query: data.search.query,
    sourceFilter: "public",
    orientationFilter: "all",
    localClips: data.localClips,
    library: data.library,
    search: data.search
  });

  assert.equal(allTargets[0]?.material.source, "public");
  assert.equal(allTargets[allInitialIndex]?.material.source, "public");
  assert.equal(initialMaterialLocatorHitTargetIndex(localTargets, "local"), 0);
  assert.equal(localTargets[0]?.material.source, "local");
  assert.equal(initialMaterialLocatorHitTargetIndex(publicTargets, "public"), 0);
  assert.equal(publicTargets[0]?.material.source, "public");
});

test("material locator clears candidate, video, and transcript focus when no search is active", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(MaterialLocatorPage, {
      library: data.library,
      localClips: data.localClips,
      search: emptySearchResponse(),
      query: "",
      sourceFilter: "all",
      orientationFilter: "all",
      selectedDetail: data.primaryDetail,
      selectedMaterialKey: undefined,
      highlightedSegmentIds: [],
      selectedSegments: [],
      queue: []
    })
  );

  assert.match(html, /先搜索文案/);
  assert.equal(html.includes("没有找到可选素材"), false);
  assert.equal(html.includes("<video"), false);
  assert.equal(html.includes("data-testid=\"locator-video\""), false);
  assert.equal(html.includes("现金流不是利润表的影子。"), false);
  assert.equal(html.includes("现金流管理与风险控制"), false);
  assert.equal(html.includes("cutter-locator-result is-selected"), false);
});

test("material locator shows searching state before long text results return", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(MaterialLocatorPage, {
      library: data.library,
      localClips: data.localClips,
      search: emptySearchResponse("长文案还在匹配"),
      query: "长文案还在匹配",
      sourceFilter: "all",
      orientationFilter: "all",
      selectedDetail: data.primaryDetail,
      selectedMaterialKey: undefined,
      highlightedSegmentIds: [],
      selectedSegments: [],
      queue: [],
      isSearching: true
    })
  );

  assert.match(html, /正在匹配文案/);
  assert.equal(html.includes("没有找到可选素材"), false);
  assert.equal(html.includes("选择候选素材后，这里用于验证画面。"), false);
  assert.equal(html.includes("点击候选素材后，这里会定位到命中文案并高亮显示。"), false);
  assert.equal(html.includes("<video"), false);
});

test("material locator shows preview loading state after candidates return before focus settles", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(MaterialLocatorPage, {
      library: data.library,
      localClips: data.localClips,
      search: data.search,
      query: data.search.query,
      sourceFilter: "public",
      orientationFilter: "all",
      selectedDetail: data.primaryDetail,
      selectedMaterialKey: undefined,
      highlightedSegmentIds: [],
      selectedSegments: [],
      queue: []
    })
  );

  assert.match(html, /正在加载预览/);
  assert.equal(html.includes("没有找到可选素材"), false);
  assert.equal(html.includes("选择候选素材后，这里用于验证画面。"), false);
  assert.equal(html.includes("<video"), false);
});

test("material locator transcript renders as natural text with invisible segment mapping", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(MaterialLocatorPage, {
      library: data.library,
      localClips: data.localClips,
      search: data.search,
      query: data.search.query,
      sourceFilter: "all",
      orientationFilter: "all",
      selectedDetail: data.primaryDetail,
      selectedMaterialKey: `public:${data.primaryDetail.source_video_id}`,
      selectedSegments: data.primaryDetail.transcript.segments.slice(0, 2),
      highlightedSegmentIds: ["s-062"],
      queue: data.queue
    })
  );

  assert.match(html, /data-selection-mode="natural-text"/);
  assert.match(html, /data-virtualized="false"/);
  assert.match(html, /data-segment-id="s-062"/);
  assert.match(html, /data-current-hit-segment-id="s-062"/);
  assert.match(html, /data-current-hit-time-ms="718000"/);
  assert.match(html, /data-autoscroll-target="s-062"/);
  assert.match(html, /is-current-hit/);
  assert.match(html, /原因其实很简单/);
  assert.equal(html.includes("选择此句"), false);
  assert.equal(html.includes("cutter-segment"), false);
  assert.equal(html.includes("内部映射"), false);
});

test("material locator window-renders long transcripts around the active hit", () => {
  const data = fixture();
  const longSegments = Array.from({ length: 400 }, (_, index) => {
    const segmentNumber = index + 1;
    return {
      segment_id: `long-${String(segmentNumber).padStart(3, "0")}`,
      begin_ms: index * 6000,
      end_ms: index * 6000 + 5000,
      text: segmentNumber === 260
        ? "这里是现金流命中句，长文案也必须快速定位。"
        : `这是第 ${segmentNumber} 句完整文案，用来验证长视频不会一次性渲染全部句子。`
    };
  });
  const longDetail = {
    ...data.primaryDetail,
    source_video_id: "src-long",
    title: "长文案压力测试视频",
    transcript: {
      full_text: longSegments.map((segment) => segment.text).join(""),
      segments: longSegments
    }
  };
  const html = renderToStaticMarkup(
    h(MaterialLocatorPage, {
      library: data.library,
      localClips: data.localClips,
      search: data.search,
      query: "现金流",
      sourceFilter: "all",
      orientationFilter: "all",
      selectedDetail: longDetail,
      selectedMaterialKey: "public:src-long",
      highlightedSegmentIds: ["long-260"],
      currentHitSegmentId: "long-260",
      queue: data.queue
    })
  );

  assert.match(html, /data-virtualized="true"/);
  assert.match(html, /data-total-segments="400"/);
  assert.match(html, /data-rendered-segments="84"/);
  assert.match(html, /data-segment-id="long-260"/);
  assert.match(html, /长文案也必须快速定位/);
  assert.equal(html.includes('data-segment-id="long-001"'), false);
  assert.equal(html.includes('data-segment-id="long-400"'), false);
});

test("material locator candidate focus highlights hits and creates a ready-to-cut selection", () => {
  const data = fixture();
  const hitSegments = data.search.groups[0]!.hit_segments.slice(0, 1);
  const selection = continuousTranscriptSelection(
    data.primaryDetail.transcript.segments,
    transcriptSelectionRangeFromHitSegments(hitSegments)
  );
  assert.equal(selection.startCharOffset, undefined);
  assert.equal(selection.endCharOffset, undefined);

  const html = renderToStaticMarkup(
    h(MaterialLocatorPage, {
      library: data.library,
      localClips: data.localClips,
      search: data.search,
      query: data.search.query,
      sourceFilter: "all",
      orientationFilter: "all",
      selectedDetail: data.primaryDetail,
      selectedMaterialKey: `public:${data.primaryDetail.source_video_id}`,
      highlightedSegmentIds: ["s-062", "s-064"],
      highlightedHitSegments: hitSegments,
      selectedSegments: selection.segments,
      selectedStartCharOffset: selection.startCharOffset,
      selectedEndCharOffset: selection.endCharOffset,
      queue: data.queue
    })
  );

  assert.match(html, /is-highlighted/);
  assert.match(html, /is-current-hit/);
  assert.doesNotMatch(html, /已选 1 句/);
  assert.doesNotMatch(html, /cutter-floating-selection-bar/);
  assert.doesNotMatch(html, /剪切这段/);
  assert.doesNotMatch(html, /用鼠标拖选文案后，剪切按钮会出现在鼠标位置/);
});

test("material locator auto seek key is stable for recreated local clip details", async () => {
  const data = fixture();
  const localClip = data.localClips.clips[0]!;
  const firstDetail = localClipToSourceVideoDetail(localClip);
  const recreatedDetail = localClipToSourceVideoDetail(localClip);
  const firstSegmentId = firstDetail.transcript.segments[0]!.segment_id;
  const otherSegmentId = `${firstSegmentId}-other`;
  const materialLocatorModule = (await import("./features/material-locator/MaterialLocatorPage.tsx")) as any;

  assert.notEqual(firstDetail, recreatedDetail);
  assert.equal(typeof materialLocatorModule.materialLocatorAutoSeekKey, "function");
  assert.equal(
    materialLocatorModule.materialLocatorAutoSeekKey(firstDetail, firstSegmentId),
    materialLocatorModule.materialLocatorAutoSeekKey(recreatedDetail, firstSegmentId)
  );
  assert.notEqual(
    materialLocatorModule.materialLocatorAutoSeekKey(firstDetail, firstSegmentId),
    materialLocatorModule.materialLocatorAutoSeekKey(firstDetail, otherSegmentId)
  );
});

test("material locator time clicks build a complete ordered text range", () => {
  const segments = [
    { segment_id: "s1", begin_ms: 0, end_ms: 1_000, text: "第一句" },
    { segment_id: "s2", begin_ms: 1_000, end_ms: 2_000, text: "第二句" },
    { segment_id: "s3", begin_ms: 2_000, end_ms: 3_000, text: "第三句" }
  ];

  assert.deepEqual(
    materialLocatorTimeSelectionRange({ segments, clickedSegmentId: "s2" }),
    { type: "pending", pendingStartSegmentId: "s2" }
  );
  assert.deepEqual(
    materialLocatorTimeSelectionRange({
      segments,
      pendingStartSegmentId: "s1",
      clickedSegmentId: "s3"
    }),
    {
      type: "range",
      startSegmentId: "s1",
      startCharOffset: 0,
      endSegmentId: "s3",
      endCharOffset: 3
    }
  );
  assert.deepEqual(
    materialLocatorTimeSelectionRange({
      segments,
      pendingStartSegmentId: "s3",
      clickedSegmentId: "s1"
    }),
    {
      type: "range",
      startSegmentId: "s1",
      startCharOffset: 0,
      endSegmentId: "s3",
      endCharOffset: 3
    }
  );
});

test("material locator floating selection toolbar is compact instead of a blocking overlay", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const materialRule = css.match(/\.cutter-material-locator \.cutter-selection-bar\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const labelRule = css.match(/\.cutter-material-locator \.cutter-selection-bar strong\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const buttonRule = css.match(/\.cutter-material-locator \.cutter-selection-bar button\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  assert.match(materialRule, /position:\s*fixed/);
  assert.match(materialRule, /display:\s*inline-flex/);
  assert.match(materialRule, /max-width:\s*min\(360px,\s*calc\(100vw - 32px\)\)/);
  assert.match(materialRule, /min-height:\s*34px/);
  assert.match(materialRule, /padding:\s*4px 5px 4px 10px/);
  assert.match(materialRule, /transform:\s*translate\(-50%,\s*calc\(-100% - 10px\)\)/);
  assert.match(labelRule, /font-size:\s*12px/);
  assert.match(labelRule, /line-height:\s*16px/);
  assert.match(buttonRule, /min-height:\s*26px/);
  assert.match(buttonRule, /font-size:\s*12px/);
});

test("material locator floating selection bar uses theme colors in dark mode", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const materialRule = css.match(/\.cutter-material-locator \.cutter-selection-bar\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  assert.match(materialRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-surface\) 94%,\s*#000000\)/);
  assert.match(materialRule, /box-shadow:\s*0 14px 34px rgba\(0,\s*0,\s*0,\s*0\.28\)/);
  assert.equal(materialRule.includes("rgba(255, 255, 255"), false);
});

test("material locator keeps search and review areas fixed while transcript scrolls independently", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const lastRule = (pattern: RegExp) =>
    Array.from(css.matchAll(pattern)).map((match) => match.groups?.body ?? "").at(-1) ?? "";

  const pageMainRule = Array.from(css.matchAll(/\.cutter-material-locator \.cutter-page-main\s*{(?<body>[^}]+)}/g))
    .map((match) => match.groups?.body ?? "")
    .find((body) => body.includes("grid-template-columns: 256px")) ?? "";
  const commandPanelRule = Array.from(css.matchAll(/\.cutter-material-locator \.cutter-locator-command\s*{(?<body>[^}]+)}/g))
    .map((match) => match.groups?.body ?? "")
    .find((body) => body.includes("background: transparent")) ?? "";
  const locatorCommandRule = lastRule(/\.cutter-material-locator \.cutter-locator-command-header\s*{(?<body>[^}]+)}/g);
  const searchFormRule = lastRule(/\.cutter-material-locator \.cutter-locator-search-form\s*{(?<body>[^}]+)}/g);
  const searchBoxRule = lastRule(/\.cutter-material-locator \.cutter-search-box\s*{(?<body>[^}]+)}/g);
  const searchBoxFocusRule = lastRule(/\.cutter-material-locator \.cutter-search-box:focus-within\s*{(?<body>[^}]+)}/g);
  const searchInputRule = lastRule(/\.cutter-material-locator \.cutter-search-box input\s*{(?<body>[^}]+)}/g);
  const searchSubmitRule = lastRule(/\.cutter-material-locator \.cutter-locator-search-submit\s*{(?<body>[^}]+)}/g);
  const candidatePanelRule = lastRule(/\.cutter-material-locator \.cutter-locator-candidates\s*{(?<body>[^}]+)}/g);
  const appCandidatePanelRule = lastRule(/\.cutter-app:has\(\.cutter-material-locator\) \.cutter-locator-candidates\s*{(?<body>[^}]+)}/g);
  const candidateHeaderRule = lastRule(/\.cutter-material-locator \.cutter-locator-candidates > header\s*{(?<body>[^}]+)}/g);
  const locatorResultsRule = lastRule(/\.cutter-material-locator \.cutter-locator-results\s*{(?<body>[^}]+)}/g);
  const candidateResultsRule = lastRule(/\.cutter-material-locator \.cutter-locator-results,\s*\.cutter-material-locator \.cutter-locator-section,\s*\.cutter-material-locator \.cutter-locator-result-list\s*{(?<body>[^}]+)}/g);
  const emptyStateRule = lastRule(/\.cutter-material-locator \.cutter-empty-state\s*{(?<body>[^}]+)}/g);
  const videoEmptyRule = lastRule(/\.cutter-material-locator \.cutter-video-empty\s*{(?<body>[^}]+)}/g);
  const transcriptEmptyRule = lastRule(/\.cutter-material-locator \.cutter-transcript-empty\s*{(?<body>[^}]+)}/g);
  const resultListRule = lastRule(/\.cutter-material-locator \.cutter-locator-result-list\s*{(?<body>[^}]+)}/g);
  const resultRule = lastRule(/\.cutter-material-locator \.cutter-locator-result\s*{(?<body>[^}]+)}/g);
  const resultMetaRule = lastRule(/\.cutter-material-locator \.cutter-locator-result-meta\s*{(?<body>[^}]+)}/g);
  const selectedResultRule = lastRule(/\.cutter-material-locator \.cutter-locator-result\.is-selected\s*{(?<body>[^}]+)}/g);
  const workbenchRule = Array.from(css.matchAll(/\.cutter-material-locator \.cutter-locator-workbench\s*{(?<body>[^}]+)}/g))
    .map((match) => match.groups?.body ?? "")
    .find((body) => body.includes("display: contents")) ?? "";
  const sidePanelRule = Array.from(css.matchAll(/\.cutter-material-locator \.cutter-locator-side-panel\s*{(?<body>[^}]+)}/g))
    .map((match) => match.groups?.body ?? "")
    .find((body) => body.includes("grid-template-rows: 202px")) ?? "";
  const appSidePanelRule = lastRule(/\.cutter-app:has\(\.cutter-material-locator\) \.cutter-locator-side-panel\s*{(?<body>[^}]+)}/g);
  const appRightColumnPanelRule = lastRule(
    /\.cutter-app:has\(\.cutter-material-locator\) \.cutter-locator-visual,\s*\.cutter-app:has\(\.cutter-material-locator\) \.cutter-locator-cut-panel,\s*\.cutter-app:has\(\.cutter-material-locator\) \.cutter-locator-queue-panel\s*{(?<body>[^}]+)}/g
  );
  const appVideoFrameRule = lastRule(
    /\.cutter-app:has\(\.cutter-material-locator\) \.cutter-locator-visual \.cutter-video-frame\s*{(?<body>[^}]+)}/g
  );
  const appVideoRule = lastRule(
    /\.cutter-app:has\(\.cutter-material-locator\) \.cutter-locator-visual \.cutter-video-panel video\s*{(?<body>[^}]+)}/g
  );
  const videoPanelRule = lastRule(/\.cutter-material-locator \.cutter-video-panel\s*{(?<body>[^}]+)}/g);
  const videoRule = lastRule(/\.cutter-material-locator \.cutter-video-panel video\s*{(?<body>[^}]+)}/g);
  const queuePanelRule = lastRule(/\.cutter-material-locator \.cutter-locator-queue-panel\s*{(?<body>[^}]+)}/g);
  const queueHeaderRule = lastRule(/\.cutter-material-locator \.cutter-locator-queue-panel > header\s*{(?<body>[^}]+)}/g);
  const queueRowRule = lastRule(/\.cutter-material-locator \.cutter-locator-queue-head,\s*\.cutter-material-locator \.cutter-locator-queue-row\s*{(?<body>[^}]+)}/g);
  const queueAllActionRule = lastRule(/\.cutter-material-locator \.cutter-queue-all-action\s*{(?<body>[^}]+)}/g);
  const queueTableRule = lastRule(/\.cutter-material-locator \.cutter-locator-queue-table\s*{(?<body>[^}]+)}/g);
  const transcriptRule = css.match(/\.cutter-natural-transcript\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const locatorTranscriptPanelRule = lastRule(/\.cutter-material-locator \.cutter-natural-transcript\s*{(?<body>[^}]+)}/g);
  const transcriptHeaderRule = lastRule(/\.cutter-material-locator \.cutter-natural-transcript > header\s*{(?<body>[^}]+)}/g);
  const transcriptHeadingRule = lastRule(/\.cutter-material-locator \.cutter-transcript-heading\s*{(?<body>[^}]+)}/g);
  const hitNavigationButtonRule = lastRule(/\.cutter-material-locator \.cutter-hit-navigation button\s*{(?<body>[^}]+)}/g);
  const transcriptBodyRule = css.match(/\.cutter-transcript-body\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const transcriptRowRule = lastRule(/\.cutter-material-locator \.cutter-transcript-row\s*{(?<body>[^}]+)}/g);
  const transcriptTimeRule = lastRule(/\.cutter-material-locator \.cutter-transcript-time\s*{(?<body>[^}]+)}/g);
  const currentHitTranscriptRowRule = lastRule(/\.cutter-material-locator \.cutter-transcript-row\.is-current-hit\s*{(?<body>[^}]+)}/g);
  const selectedTranscriptRowRule = lastRule(
    /\.cutter-material-locator \.cutter-transcript-row\.is-selected,\s*\.cutter-material-locator \.cutter-transcript-row\.is-drag-preview\s*{(?<body>[^}]+)}/g
  );
  const timeStartTranscriptRowRule = lastRule(/\.cutter-material-locator \.cutter-transcript-row\.is-time-selection-start\s*{(?<body>[^}]+)}/g);
  const timeStartTranscriptButtonRule = lastRule(
    /\.cutter-material-locator \.cutter-transcript-row\.is-time-selection-start \.cutter-transcript-time\s*{(?<body>[^}]+)}/g
  );

  assert.match(pageMainRule, /height:\s*100%/);
  assert.match(pageMainRule, /grid-template-columns:\s*256px minmax\(480px,\s*1fr\) 360px/);
  assert.match(pageMainRule, /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(pageMainRule, /gap:\s*0/);
  assert.match(pageMainRule, /padding:\s*10px 0 0/);
  assert.match(pageMainRule, /overflow:\s*hidden/);
  assert.match(commandPanelRule, /border:\s*0/);
  assert.match(commandPanelRule, /grid-column:\s*1 \/ 3/);
  assert.match(commandPanelRule, /padding:\s*0 20px/);
  assert.match(commandPanelRule, /background:\s*transparent/);
  assert.match(locatorCommandRule, /display:\s*grid/);
  assert.match(locatorCommandRule, /gap:\s*0/);
  assert.match(searchFormRule, /display:\s*block/);
  assert.match(searchFormRule, /width:\s*100%/);
  assert.equal(searchFormRule.includes("grid-template-columns"), false);
  assert.match(searchBoxRule, /grid-template-columns:\s*minmax\(0,\s*1fr\) auto/);
  assert.match(searchBoxRule, /gap:\s*0/);
  assert.match(searchBoxRule, /border:\s*0/);
  assert.match(searchBoxRule, /border-radius:\s*999px/);
  assert.match(searchBoxRule, /padding:\s*0 8px 0 20px/);
  assert.match(searchBoxRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-surface-subtle\) 84%,\s*var\(--ml-color-surface\)\)/);
  assert.match(searchBoxFocusRule, /border:\s*0/);
  assert.match(searchBoxFocusRule, /outline:\s*0/);
  assert.match(searchBoxFocusRule, /box-shadow:\s*none/);
  assert.match(searchInputRule, /border:\s*0/);
  assert.match(searchInputRule, /background:\s*transparent/);
  assert.match(searchInputRule, /outline:\s*0/);
  assert.match(searchSubmitRule, /border:\s*0/);
  assert.match(searchSubmitRule, /background:\s*transparent/);
  assert.match(candidatePanelRule, /border:\s*0/);
  assert.match(candidatePanelRule, /grid-row:\s*2/);
  assert.match(candidatePanelRule, /background:\s*transparent/);
  assert.match(appCandidatePanelRule, /border:\s*0/);
  assert.match(appCandidatePanelRule, /background:\s*transparent/);
  assert.match(candidateHeaderRule, /display:\s*flex/);
  assert.match(candidateHeaderRule, /align-items:\s*center/);
  assert.match(candidateHeaderRule, /border-bottom:\s*0/);
  assert.match(locatorResultsRule, /background:\s*transparent/);
  assert.match(candidateResultsRule, /align-content:\s*start/);
  assert.match(emptyStateRule, /border:\s*0/);
  assert.match(emptyStateRule, /background:\s*transparent/);
  assert.match(videoEmptyRule, /border:\s*0/);
  assert.match(videoEmptyRule, /background:\s*transparent/);
  assert.match(transcriptEmptyRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-surface-subtle\) 28%,\s*transparent\)/);
  assert.match(resultListRule, /gap:\s*0/);
  assert.match(resultRule, /border:\s*0/);
  assert.match(resultRule, /border-radius:\s*8px/);
  assert.match(resultMetaRule, /justify-content:\s*flex-start/);
  assert.match(resultMetaRule, /gap:\s*4px/);
  assert.equal(resultRule.includes("border-bottom"), false);
  assert.match(selectedResultRule, /box-shadow:\s*none/);
  assert.match(workbenchRule, /display:\s*contents/);
  assert.match(sidePanelRule, /grid-template-rows:\s*202px minmax\(264px,\s*auto\) minmax\(0,\s*1fr\)/);
  assert.match(sidePanelRule, /grid-row:\s*1 \/ span 2/);
  assert.match(sidePanelRule, /gap:\s*0/);
  assert.match(sidePanelRule, /overflow:\s*hidden/);
  assert.match(sidePanelRule, /padding:\s*0/);
  assert.match(sidePanelRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-surface-subtle\) 48%,\s*transparent\)/);
  assert.match(appSidePanelRule, /border:\s*0/);
  assert.match(appSidePanelRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-surface-subtle\) 48%,\s*transparent\)/);
  assert.match(appRightColumnPanelRule, /background:\s*transparent/);
  assert.match(appVideoFrameRule, /display:\s*block/);
  assert.match(appVideoFrameRule, /padding:\s*0/);
  assert.match(appVideoRule, /aspect-ratio:\s*auto/);
  assert.match(appVideoRule, /object-fit:\s*cover/);
  assert.match(videoPanelRule, /background:\s*transparent/);
  assert.match(videoRule, /object-fit:\s*cover/);
  assert.match(
    css,
    /@media \(max-width:\s*1180px\)[\s\S]*\.cutter-app:has\(\.cutter-material-locator\) \.cutter-shell\s*{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*}/
  );
  assert.match(
    css,
    /@media \(max-width:\s*1180px\)[\s\S]*\.cutter-material-locator \.cutter-locator-workbench\s*{[\s\S]*grid-template-rows:\s*auto auto auto[\s\S]*height:\s*auto[\s\S]*overflow:\s*visible[\s\S]*}/
  );
  assert.match(
    css,
    /@media \(max-width:\s*1180px\)[\s\S]*\.cutter-material-locator \.cutter-locator-side-panel\s*{[\s\S]*grid-template-rows:\s*minmax\(220px,\s*auto\) auto auto[\s\S]*overflow:\s*visible[\s\S]*}/
  );
  assert.match(queuePanelRule, /grid-template-rows:\s*auto auto auto/);
  assert.match(queuePanelRule, /align-content:\s*start/);
  assert.match(queueHeaderRule, /display:\s*flex/);
  assert.match(queueHeaderRule, /justify-content:\s*space-between/);
  assert.match(queueRowRule, /grid-template-columns:\s*58px minmax\(0,\s*1fr\) 46px/);
  assert.match(queueRowRule, /border-bottom:\s*1px solid color-mix\(in srgb,\s*var\(--ml-color-border\) 28%,\s*transparent\)/);
  assert.match(queueAllActionRule, /min-height:\s*26px/);
  assert.match(queueAllActionRule, /border:\s*0/);
  assert.match(queueAllActionRule, /background:\s*transparent/);
  assert.match(queueTableRule, /align-content:\s*start/);
  assert.match(queueTableRule, /align-self:\s*start/);
  assert.match(queueTableRule, /overflow:\s*visible/);
  assert.match(transcriptRule, /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(locatorTranscriptPanelRule, /grid-row:\s*2/);
  assert.match(transcriptRule, /min-height:\s*0/);
  assert.match(transcriptHeaderRule, /display:\s*block/);
  assert.match(transcriptHeadingRule, /display:\s*flex/);
  assert.match(transcriptHeadingRule, /justify-content:\s*space-between/);
  assert.match(hitNavigationButtonRule, /border:\s*0/);
  assert.match(hitNavigationButtonRule, /background:\s*transparent/);
  assert.match(transcriptBodyRule, /contain:\s*content/);
  assert.match(transcriptBodyRule, /min-height:\s*0/);
  assert.match(transcriptBodyRule, /overflow:\s*auto/);
  assert.match(transcriptRowRule, /grid-template-columns:\s*58px minmax\(0,\s*1fr\)/);
  assert.match(transcriptRowRule, /min-height:\s*0/);
  assert.match(transcriptRowRule, /padding:\s*3px 8px/);
  assert.match(transcriptTimeRule, /text-align:\s*left/);
  assert.match(transcriptTimeRule, /appearance:\s*none/);
  assert.match(transcriptTimeRule, /cursor:\s*pointer/);
  assert.match(currentHitTranscriptRowRule, /background:\s*transparent/);
  assert.match(selectedTranscriptRowRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-accent\) 10%,\s*transparent\)/);
  assert.match(timeStartTranscriptRowRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-accent\) 8%,\s*transparent\)/);
  assert.match(timeStartTranscriptButtonRule, /border:\s*1px solid color-mix\(in srgb,\s*var\(--ml-color-accent\) 34%,\s*transparent\)/);
  assert.match(timeStartTranscriptButtonRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-accent\) 14%,\s*transparent\)/);
  assert.match(timeStartTranscriptButtonRule, /color:\s*var\(--ml-color-accent\)/);
});

test("material locator selected copy panel stays minimal", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const selectedCopyRule = Array.from(css.matchAll(/\.cutter-material-locator \.cutter-locator-selected-copy\s*{(?<body>[^}]+)}/g))
    .map((match) => match.groups?.body ?? "")
    .at(-1) ?? "";
  const selectedCopyTextRule = Array.from(css.matchAll(/\.cutter-material-locator \.cutter-locator-selected-copy p\s*{(?<body>[^}]+)}/g))
    .map((match) => match.groups?.body ?? "")
    .at(-1) ?? "";

  assert.match(selectedCopyRule, /font-size:\s*12px/);
  assert.match(selectedCopyRule, /line-height:\s*18px/);
  assert.match(selectedCopyTextRule, /min-height:\s*164px/);
  assert.match(selectedCopyTextRule, /max-height:\s*360px/);
  assert.match(selectedCopyTextRule, /overflow:\s*auto/);
  assert.match(selectedCopyTextRule, /white-space:\s*pre-wrap/);
  assert.match(selectedCopyTextRule, /overflow-wrap:\s*anywhere/);
});

test("material locator queue statuses use distinct semantic colors", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const lastRule = (pattern: RegExp) =>
    Array.from(css.matchAll(pattern)).map((match) => match.groups?.body ?? "").at(-1) ?? "";
  const pendingRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="material-locator"\] \.cutter-locator-queue-row\.is-pending span:not\(\.cutter-locator-queue-hint\)\s*{(?<body>[^}]+)}/g
  );
  const runningRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="material-locator"\] \.cutter-locator-queue-row\.is-running span:not\(\.cutter-locator-queue-hint\)\s*{(?<body>[^}]+)}/g
  );
  const doneRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="material-locator"\] \.cutter-locator-queue-row\.is-done span:not\(\.cutter-locator-queue-hint\)\s*{(?<body>[^}]+)}/g
  );
  const failedRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="material-locator"\] \.cutter-locator-queue-row\.is-failed span:not\(\.cutter-locator-queue-hint\)\s*{(?<body>[^}]+)}/g
  );

  assert.match(pendingRule, /color:\s*#b45309/);
  assert.match(pendingRule, /background:\s*#fff7ed/);
  assert.match(runningRule, /color:\s*#1d4ed8/);
  assert.match(runningRule, /background:\s*#eff6ff/);
  assert.match(doneRule, /color:\s*#12805c/);
  assert.match(doneRule, /background:\s*#e8f7ef/);
  assert.match(failedRule, /color:\s*#dc2626/);
  assert.notEqual(runningRule, doneRule);
});

test("cutter shell keeps the workbench fixed while page content panes scroll", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const lastRule = (pattern: RegExp) =>
    Array.from(css.matchAll(pattern)).map((match) => match.groups?.body ?? "").at(-1) ?? "";
  const ordinaryContentRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\]:not\(\[data-cutter-route="material-locator"\]\) \.cutter-content\s*{(?<body>[^}]+)}/g
  );
  const materialContentRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="material-locator"\] \.cutter-content\s*{(?<body>[^}]+)}/g
  );
  const taskTableRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="cut-tasks"\] \.cutter-task-table-wrap\s*{(?<body>[^}]+)}/g
  );
  const galleryAlignRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="local-library"\] \.cutter-local-library-scroll \.ml-gallery-grid,\s*\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="public-library"\] \.cutter-public-library-scroll > \.ml-gallery-grid\s*{(?<body>[^}]+)}/g
  );
  const scrollPaneRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="local-library"\] \.cutter-local-library-scroll,\s*\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="public-library"\] \.cutter-public-library-scroll,\s*\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="settings"\] \.ml-grouped-form\s*{(?<body>[^}]+)}/g
  );
  const localGridRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="local-library"\] \.cutter-local-library \.ml-gallery-grid\s*{(?<body>[^}]+)}/g
  );
  const publicGridRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="public-library"\] \.ml-gallery-grid\s*{(?<body>[^}]+)}/g
  );

  assert.match(ordinaryContentRule, /overflow:\s*hidden/);
  assert.match(materialContentRule, /overflow:\s*hidden/);
  assert.match(taskTableRule, /overflow:\s*auto/);
  assert.match(taskTableRule, /overscroll-behavior:\s*contain/);
  assert.match(galleryAlignRule, /align-content:\s*start/);
  assert.match(scrollPaneRule, /overflow:\s*auto/);
  assert.match(scrollPaneRule, /scrollbar-gutter:\s*stable/);
  assert.match(localGridRule, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(publicGridRule, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
});

test("material locator selected copy shows the complete selected text", () => {
  const data = fixture();
  const longSelectedText = `${"完整选区".repeat(24)}最后一句必须完整显示`;
  const html = renderToStaticMarkup(
    h(MaterialLocatorPage as any, {
      library: data.library,
      localClips: data.localClips,
      search: data.search,
      query: data.search.query,
      sourceFilter: "all",
      orientationFilter: "all",
      selectedDetail: data.primaryDetail,
      selectedSegments: [
        {
          segment_id: "custom-complete-selection",
          begin_ms: 0,
          end_ms: 30_000,
          text: longSelectedText
        }
      ],
      selectedStartCharOffset: 0,
      selectedEndCharOffset: longSelectedText.length,
      queue: data.queue
    })
  );

  assert.ok(html.includes(longSelectedText));
  assert.equal(html.includes(`${longSelectedText.slice(0, 96)}...`), false);
});

test("direct cut creates a background fixture task and stays compatible with material locator route", () => {
  const data = fixture();
  const item = createCutListItemFromSegments({
    sourceVideo: data.primaryDetail,
    segments: data.primaryDetail.transcript.segments.slice(0, 2),
    cutMode: "smart",
    order: 1,
    title: "直接剪切片段"
  });
  const queue = appendDirectCutFixtureQueue([], item, "2026-05-04T09:00:00.000Z");

  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.status, "pending");
  assert.equal(queue[0]?.progress, 0);
  assert.equal(queue[0]?.source_title, "直播复盘：从流量到现金流健康度");
  assert.equal(routeToHash("material-locator"), "#/material-locator");
  assert.equal(routeToHash("cut-tasks"), "#/cut-tasks");
});

test("direct cut notice is concise and keeps the cutter on the locator page", () => {
  assert.equal(cutNoticeForSubmittedJobs(1), "已加入剪切任务 · 等待中 1");
  assert.equal(cutNoticeForSubmittedJobs(3), "已加入剪切任务 · 等待中 3");
  assert.equal(cutNoticeForSubmittedJobs(0), "");
  assert.equal(cutNoticeForCompletedLocalClips(1), "剪切完成 · 本地素材已更新 1");
  assert.equal(cutNoticeForCompletedLocalClips(0), "");
  assert.equal(
    cutNoticeForPipelineResult({
      status: "completed",
      processed_count: 2,
      done_count: 2,
      failed_count: 0,
      message: "本机剪切已完成",
      last_updated_label: "刚刚更新"
    }),
    "剪切完成 · 本地素材已更新 2"
  );
  assert.equal(
    cutNoticeForPipelineResult({
      status: "completed",
      processed_count: 2,
      done_count: 1,
      failed_count: 1,
      message: "本机剪切已完成",
      last_updated_label: "刚刚更新"
    }),
    "剪切完成 1 个 · 失败 1 个"
  );
  assert.equal(
    cutNoticeForPipelineResult({
      status: "completed",
      processed_count: 1,
      done_count: 0,
      failed_count: 1,
      message: "本机剪切已完成",
      last_updated_label: "刚刚更新"
    }),
    "剪切失败 1 个"
  );
});

test("selecting a search result focuses the first natural hit target and derives the default cut range", () => {
  const data = fixture();
  const result = buildMaterialLocatorSections({
    query: data.search.query,
    sourceFilter: "all",
    orientationFilter: "all",
    localClips: data.localClips,
    library: data.library,
    search: data.search
  })
    .find((section) => section.key === "public")
    ?.items.find((item) => item.id === data.primaryDetail.source_video_id);
  const firstTarget = materialLocatorHitTargets({
    query: data.search.query,
    sourceFilter: "all",
    orientationFilter: "all",
    localClips: data.localClips,
    library: data.library,
    search: data.search
  })
    .find((target) => target.materialKey === `public:${data.primaryDetail.source_video_id}`);

  assert.ok(result);
  assert.ok(firstTarget);
  assert.deepEqual(materialFocusFromResult(result), {
    currentSegmentId: "s-062",
    highlightedSegmentIds: ["s-062"]
  });
  assert.deepEqual(transcriptSelectionRangeFromHitSegments(firstTarget.hitSegments), {
    startSegmentId: "s-062",
    endSegmentId: "s-062"
  });
});

test("cut list renders order, range, text, mode, reorder, delete, clear, and submit", () => {
  const data = fixture();
  const html = renderToStaticMarkup(h(CutListPage, { items: data.cutList }));

  for (const text of ["待剪清单", "顺序", "时间段", "选中文案", "智能剪切", "上移", "删除", "清空", "提交剪切队列"]) {
    assert.match(html, new RegExp(text));
  }
});

test("local library is independent and exposes local recut materials with orientation filters", () => {
  const data = fixture();
  const projects: CutterProject[] = [
    {
      project_id: "P-current",
      title: "当前项目",
      title_source: "manual",
      status: "active",
      created_at: "2026-05-06T10:00:00.000Z",
      updated_at: "2026-05-06T10:10:00.000Z",
      clip_count: 2,
      running_count: 0,
      failed_count: 0,
      searches: []
    },
    {
      project_id: "P-other",
      title: "历史项目",
      title_source: "manual",
      status: "active",
      created_at: "2026-05-05T10:00:00.000Z",
      updated_at: "2026-05-05T10:10:00.000Z",
      clip_count: 1,
      running_count: 0,
      failed_count: 0,
      searches: []
    }
  ];
	  const catalog = {
	    local_clip_count: 4,
	    clips: [
	      {
	        ...data.localClips.clips[0]!,
	        local_clip_id: "clip-current-2",
	        title: "2-当前项目-C0017",
	        project_id: "P-current",
	        width: 1920,
	        height: 1080
	      },
	      {
	        ...data.localClips.clips[1]!,
	        local_clip_id: "clip-current-portrait",
	        title: "4-当前项目-竖版开场",
	        project_id: "P-current",
	        width: 1080,
	        height: 1920
	      },
	      { ...data.localClips.clips[1]!, local_clip_id: "clip-other", title: "1-历史项目-C0020", project_id: "P-other" },
	      { ...data.localClips.clips[2]!, local_clip_id: "clip-unassigned", title: "3-未归属-C0030" }
	    ]
  };
  const html = renderToStaticMarkup(
    h(LocalLibraryPage, {
      catalog,
      projects,
      currentProjectId: "P-current",
      selectedLocalClipId: "clip-current-2",
      actionNotice: "已打开本地素材所属项目目录",
      onSelectLocalClip: () => undefined,
      onOpenLocalClipDirectory: () => undefined
    })
  );

  for (const text of ["本地素材库", "本地可复剪素材", "当前项目", "全部素材", "横版", "竖版", "素材详情", "2-当前项目-C0017", "打开文件目录", "已打开本地素材所属项目目录"]) {
    assert.match(html, new RegExp(text));
  }

		  assert.match(html, /cutter-local-library-scroll/);
		  assert.match(html, /ml-gallery-grid/);
	  assert.match(html, /<video[^>]+src="\/local-clips\/clip-001\.mp4"/);
	  assert.match(html, /aria-pressed="true"/);
	  assert.match(html, /aria-label="本地素材视频类型"/);
	  assert.equal(html.includes("1-历史项目-C0020"), false);
	  assert.equal(html.includes("3-未归属-C0030"), false);
  assert.equal(html.includes("搜索本地素材"), false);
  assert.equal(html.includes("打开视频"), false);
  assert.equal(html.includes("显示文件夹"), false);
  assert.equal(html.includes("再次选段"), false);
  assert.equal(html.includes("来源追踪"), false);
  assert.equal(html.includes("资源信息"), false);
  assert.equal(html.includes("Local Clip"), false);
  assert.equal(html.includes("可用原素材"), false);
  assert.equal(html.includes('<span class="ml-tag">本地可复剪素材</span>'), false);

  const allHtml = renderToStaticMarkup(
    h(LocalLibraryPage, {
      catalog,
      projects,
      currentProjectId: "P-current",
      viewMode: "all",
      selectedLocalClipId: "clip-other",
      onSelectLocalClip: () => undefined
    })
  );

	  for (const text of ["当前项目", "历史项目", "未归属素材", "1-历史项目-C0020", "3-未归属-C0030"]) {
	    assert.match(allHtml, new RegExp(text));
	  }

	  const portraitHtml = renderToStaticMarkup(
	    h(LocalLibraryPage, {
	      catalog,
	      projects,
	      currentProjectId: "P-current",
	      orientationFilter: "portrait",
	      onSetOrientationFilter: () => undefined
	    })
	  );
	  assert.match(portraitHtml, /aria-pressed="true"[^>]*>竖版/);
	  assert.match(portraitHtml, /4-当前项目-竖版开场/);
	  assert.equal(portraitHtml.includes("2-当前项目-C0017"), false);
	});

test("local library groups all materials by newest project first", () => {
  const data = fixture();
  const projects: CutterProject[] = [
    {
      project_id: "P-old",
      title: "旧项目",
      title_source: "manual",
      status: "active",
      created_at: "2026-05-01T10:00:00.000Z",
      updated_at: "2026-05-01T10:10:00.000Z",
      clip_count: 1,
      running_count: 0,
      failed_count: 0,
      searches: []
    },
    {
      project_id: "P-new",
      title: "新项目",
      title_source: "manual",
      status: "active",
      created_at: "2026-05-07T10:00:00.000Z",
      updated_at: "2026-05-07T10:10:00.000Z",
      clip_count: 1,
      running_count: 0,
      failed_count: 0,
      searches: []
    }
  ];
  const catalog = {
    local_clip_count: 2,
    clips: [
      { ...data.localClips.clips[0]!, local_clip_id: "clip-old", title: "1-旧项目-C0017", project_id: "P-old" },
      { ...data.localClips.clips[1]!, local_clip_id: "clip-new", title: "9-新项目-C0020", project_id: "P-new" }
    ]
  };
  const html = renderToStaticMarkup(
    h(LocalLibraryPage, {
      catalog,
      projects,
      currentProjectId: "P-new",
      viewMode: "all"
    })
  );

  assert.ok(html.indexOf("新项目") < html.indexOf("旧项目"));
});

test("cut tasks page renders every task state and summary in Chinese", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(CutQueuePage, {
      jobs: data.queue,
      autoRefreshEnabled: true,
      lastUpdatedLabel: "刚刚更新",
      pipelineState: {
        status: "running",
        processed_count: 1,
        done_count: 1,
        failed_count: 0,
        message: "本机剪切运行中",
        last_updated_label: "刚刚更新"
      },
      onRunNext: () => undefined,
      onRetryFailed: () => undefined
    })
  );

  for (const text of [
    "剪切任务",
    "等待中",
    "剪切中",
    "已完成",
    "失败",
    "重新剪切",
    "剪切成功",
    "本机剪切运行中",
    "已处理 1 个任务",
    "FFmpeg 输出目录不可写",
    "选中文案"
  ]) {
    assert.match(html, new RegExp(text));
  }

  assert.equal(html.includes("剪切队列"), false);
  assert.equal(html.includes("执行下一个"), false);
  for (const englishStatus of ["pending", "running", "done", "failed"]) {
    assert.equal(html.includes(`<strong>${englishStatus}</strong>`), false);
  }
  assert.equal(html.includes(data.queue[0]!.title), false);
  assert.equal(data.queue[0]!.title, "1-现金流项目-直播复盘：从流量到现金流健康度");
  assert.equal(data.queue[0]!.title.includes("00:"), false);
  assert.equal(data.queue[0]!.title.includes(" · "), false);
  assert.equal(data.queue[0]!.title.includes(data.queue[0]!.selected_text), false);
  assert.match(html, /data-page="cut-tasks"/);
});

test("cut tasks page uses a production table and task detail without internal task names", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(CutQueuePage, {
      jobs: data.queue,
      autoRefreshEnabled: true,
      lastUpdatedLabel: "刚刚更新",
      onRefresh: () => undefined,
      onRunNext: () => undefined,
      onRetryFailed: () => undefined
    })
  );

  for (const text of [
    "全部",
    "来源",
    "时间段",
    "选中文案",
    "问题",
    "操作",
    "任务详情",
    "来源素材",
    "时间范围",
    "剪切模式",
    "错误摘要",
    "重新剪切"
  ]) {
    assert.match(html, new RegExp(text));
  }

  assert.equal(html.includes("<th>任务</th>"), false);
  assert.equal(html.includes("输出 / 问题"), false);
  assert.equal(html.includes("来源/时间段"), false);
  assert.equal(html.includes("任务名称"), false);
  assert.equal(html.includes("任务说明"), false);
  assert.match(html, /<table[^>]+class="cutter-task-table"/);
  assert.match(html, /class="cutter-task-action-check" role="img" aria-label="剪切成功"/);
});

test("cut tasks page names the current cutter project context", () => {
  const data = fixture();
  const project: CutterProject = {
    project_id: "P20260505-0001",
    title: "现金流",
    title_source: "manual",
    status: "active",
    created_at: "2026-05-05T10:00:00.000Z",
    updated_at: "2026-05-05T10:00:00.000Z",
    clip_count: 1,
    running_count: 0,
    failed_count: 0,
    searches: [
      {
        query: "现金流",
        hit_count: 7,
        searched_at: "2026-05-05T10:00:00.000Z"
      }
    ]
  };
  const html = renderToStaticMarkup(
    h(CutQueuePage, {
      jobs: data.queue.map((job) => ({ ...job, project_id: project.project_id })),
      project
    })
  );

  assert.equal(html.includes("当前项目："), false);
  assert.match(html, /剪切任务/);
});

test("cut tasks does not render dead retry controls without a retry handler", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(CutQueuePage, {
      jobs: data.queue
    })
  );

  assert.match(html, /FFmpeg 输出目录不可写/);
  assert.equal(html.includes("<button type=\"button\">重试</button>"), false);
  assert.equal(html.includes("<button type=\"button\">重新剪切</button>"), false);
});

test("cut tasks table keeps selected text and problem cells to one line with semantic status colors", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const lastRule = (pattern: RegExp) =>
    Array.from(css.matchAll(pattern)).map((match) => match.groups?.body ?? "").at(-1) ?? "";
  const textRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="cut-tasks"\] \.cutter-task-selected-text,\s*\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="cut-tasks"\] \.cutter-task-problem\s*{(?<body>[^}]+)}/g
  );
  const headerRule = Array.from(
    css.matchAll(/\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="cut-tasks"\] \.cutter-task-table th\s*{(?<body>[^}]+)}/g)
  )
    .map((match) => match.groups?.body ?? "")
    .join("\n");
  const sourceColumnRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="cut-tasks"\] \.cutter-task-table th:nth-child\(2\),\s*\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="cut-tasks"\] \.cutter-task-table td:nth-child\(2\)\s*{(?<body>[^}]+)}/g
  );
  const selectedTextColumnRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="cut-tasks"\] \.cutter-task-table th:nth-child\(4\),\s*\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="cut-tasks"\] \.cutter-task-table td:nth-child\(4\)\s*{(?<body>[^}]+)}/g
  );
  const problemColumnRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="cut-tasks"\] \.cutter-task-table th:nth-child\(5\),\s*\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="cut-tasks"\] \.cutter-task-table td:nth-child\(5\)\s*{(?<body>[^}]+)}/g
  );
  const pendingStatusRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-task-status-chip\.is-pending\s*{(?<body>[^}]+)}/g
  );
  const runningStatusRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-task-status-chip\.is-running\s*{(?<body>[^}]+)}/g
  );
  const doneStatusRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-task-status-chip\.is-done\s*{(?<body>[^}]+)}/g
  );
  const failedStatusRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-task-status-chip\.is-failed\s*{(?<body>[^}]+)}/g
  );

  assert.match(textRule, /overflow:\s*hidden/);
  assert.match(textRule, /text-overflow:\s*ellipsis/);
  assert.match(textRule, /white-space:\s*nowrap/);
  assert.match(headerRule, /text-align:\s*center/);
  assert.match(headerRule, /position:\s*sticky/);
  assert.match(headerRule, /z-index:\s*5/);
  assert.match(headerRule, /background:\s*#f8fafc/);
  assert.match(sourceColumnRule, /width:\s*132px/);
  assert.match(selectedTextColumnRule, /width:\s*270px/);
  assert.match(problemColumnRule, /width:\s*150px/);
  assert.match(pendingStatusRule, /color:\s*#b45309/);
  assert.match(runningStatusRule, /color:\s*#1d4ed8/);
  assert.match(doneStatusRule, /color:\s*#12805c/);
  assert.match(failedStatusRule, /color:\s*#dc2626/);
});

test("cut tasks omits manual refresh and continue controls", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(CutQueuePage, {
      jobs: data.queue,
      onRefresh: () => undefined,
      onRunNext: () => undefined
    })
  );

  assert.equal(html.includes("刷新"), false);
  assert.equal(html.includes("继续剪切"), false);
});

test("cut tasks page exposes a project output directory action near filters", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(CutQueuePage, {
      jobs: data.queue,
      onOpenCutOutputDirectory: () => undefined
    })
  );

  assert.match(html, /aria-label="剪切任务筛选"/);
  assert.match(html, /打开文件目录/);
  assert.match(html, /class="cutter-secondary-button cutter-task-detail-directory"/);
  assert.doesNotMatch(html, /class="cutter-primary-button cutter-task-detail-directory"/);
});

test("sidebar footer renders a simple cutter status summary", () => {
  const html = renderToStaticMarkup(
    h(CutterSidebarFooter, {
      username: "Allen",
      localCount: 18,
      publicCount: 41,
      activeTaskCount: 1,
      engineReady: true,
      currentProjectLabel: "6月4日-2",
      cacheBytes: 1536
    })
  );

  for (const text of [
    "当前项目",
    "6月4日-2",
    "素材库",
    "本地 41 / 公共 18",
    "剪切任务",
    "1 个处理中",
    "本机服务",
    "正常",
    "Allen",
    "缓存",
    "2 KB"
  ]) {
    assert.match(html, new RegExp(text));
  }

  assert.match(html, /class="cutter-sidebar-user-icon"/);
  assert.match(html, /class="cutter-sidebar-cache-button"/);
  assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /aria-expanded="false"/);
  assert.equal(html.includes("CPU 使用率"), false);
  assert.equal(html.includes("磁盘 I/O"), false);
  assert.equal(html.includes("aria-pressed"), false);
  assert.equal(html.includes("系统日志"), false);
  assert.equal(html.includes("打开用户数据面板"), false);
  assert.equal(html.includes("›"), false);
});

test("sidebar cache helpers count clearable local cutter cache and preserve login state", () => {
  installTestWindow();
  window.localStorage.setItem("mixlab:cutter:auth_session", "keep-auth");
  window.localStorage.setItem("mixlab:cutter:device_id", "keep-device");
  window.localStorage.setItem("mixlab:cutter:pending_login", "keep-pending");
  window.localStorage.setItem("mixlab:cutter:default_cut_mode", "precise");
  window.localStorage.setItem("mixlab.cutter.projects", "[]");
  window.localStorage.setItem("other:key", "ignore");

  const snapshot = cutterLocalCacheSnapshot(window.localStorage);
  assert.deepEqual(snapshot.keys.sort(), ["mixlab.cutter.projects", "mixlab:cutter:default_cut_mode"]);
  assert.equal(formatCutterCacheSize(snapshot.bytes), "1 KB");

  const cleared = clearCutterLocalCache(window.localStorage);
  assert.deepEqual(cleared.keys.sort(), ["mixlab.cutter.projects", "mixlab:cutter:default_cut_mode"]);
  assert.equal(window.localStorage.getItem("mixlab:cutter:auth_session"), "keep-auth");
  assert.equal(window.localStorage.getItem("mixlab:cutter:device_id"), "keep-device");
  assert.equal(window.localStorage.getItem("mixlab:cutter:pending_login"), "keep-pending");
  assert.equal(window.localStorage.getItem("mixlab:cutter:default_cut_mode"), null);
  assert.equal(window.localStorage.getItem("mixlab.cutter.projects"), null);
  assert.equal(window.localStorage.getItem("other:key"), "ignore");
});

test("sidebar footer can match public-first design pages", () => {
  const html = renderToStaticMarkup(
    h(CutterSidebarFooter, {
      username: "Allen",
      localCount: 18,
      publicCount: 41,
      activeTaskCount: 0,
      engineReady: true,
      currentProjectLabel: "6月4日-2",
      libraryCountOrder: "public-first"
    })
  );

  assert.match(html, /公共 41 \/ 本地 18/);
  assert.equal(html.includes("本地 41 / 公共 18"), false);
});

test("sidebar footer keeps cutter status visually quiet", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const lastRule = (pattern: RegExp) =>
    Array.from(css.matchAll(pattern)).map((match) => match.groups?.body ?? "").at(-1) ?? "";
  const quietShellRule = lastRule(
    /\.cutter-app \.ml-sidebar-footer,\s*\.cutter-app \.cutter-sidebar-footer,\s*\.cutter-app \.cutter-sidebar-engine-card,\s*\.cutter-app \.cutter-sidebar-user-entry\s*{(?<body>[^}]+)}/g
  );
  const footerRule = lastRule(/\.cutter-app \.ml-sidebar-footer,\s*\.cutter-app \.cutter-sidebar-footer\s*{(?<body>[^}]+)}/g);
  const sidebarFooterRule = lastRule(/\.cutter-app \.ml-sidebar-footer\s*{(?<body>[^}]+)}/g);
  const engineRule = lastRule(/\.cutter-app \.cutter-sidebar-engine-card\s*{(?<body>[^}]+)}/g);
  const materialEngineRule = lastRule(
    /\.cutter-app:has\(\.cutter-material-locator\) \.cutter-sidebar-engine-card\s*{(?<body>[^}]+)}/g
  );
  const engineRowRule = lastRule(/\.cutter-app \.cutter-sidebar-engine-card div\s*{(?<body>[^}]+)}/g);
  const engineValueRule = lastRule(/\.cutter-app \.cutter-sidebar-engine-card strong\s*{(?<body>[^}]+)}/g);
  const userRule = lastRule(/\.cutter-app \.cutter-sidebar-user-entry\s*{(?<body>[^}]+)}/g);
  const materialUserRule = lastRule(/\.cutter-app:has\(\.cutter-material-locator\) \.cutter-sidebar-user-entry\s*{(?<body>[^}]+)}/g);
  const readyUserRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-sidebar-user-entry\s*{(?<body>[^}]+)}/g
  );
  const cacheButtonRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-sidebar-cache-button\s*{(?<body>[^}]+)}/g
  );
  const cacheMenuRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-sidebar-cache-menu\s*{(?<body>[^}]+)}/g
  );

  assert.match(quietShellRule, /border:\s*0/);
  assert.match(quietShellRule, /box-shadow:\s*none/);
  assert.match(footerRule, /padding:\s*0/);
  assert.match(footerRule, /background:\s*transparent/);
  assert.match(sidebarFooterRule, /position:\s*sticky/);
  assert.match(sidebarFooterRule, /bottom:\s*12px/);
  assert.match(sidebarFooterRule, /margin-top:\s*auto/);
  assert.match(engineRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-surface-subtle\) 70%,\s*transparent\)/);
  assert.match(materialEngineRule, /display:\s*grid/);
  assert.match(engineRowRule, /min-width:\s*0/);
  assert.match(engineValueRule, /text-overflow:\s*ellipsis/);
  assert.match(userRule, /background:\s*transparent/);
  assert.match(materialUserRule, /border-color:\s*transparent/);
  assert.match(materialUserRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-surface-subtle\) 64%,\s*transparent\)/);
  assert.match(readyUserRule, /position:\s*relative/);
  assert.match(readyUserRule, /grid-template-columns:\s*34px minmax\(0,\s*1fr\) auto/);
  assert.match(cacheButtonRule, /border:\s*0/);
  assert.match(cacheButtonRule, /background:\s*rgba\(247,\s*250,\s*253,\s*0\.92\)/);
  assert.match(cacheMenuRule, /bottom:\s*calc\(100% \+ 8px\)/);
  assert.match(cacheMenuRule, /box-shadow:\s*0 18px 42px rgba\(83,\s*103,\s*132,\s*0\.18\)/);
});

test("cutter app does not keep the removed user summary drawer", async () => {
  const source = await readFile(new URL("./app/CutterApp.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /CutterUserSummaryDrawer/);
  assert.doesNotMatch(source, /userSummaryPanelOpen/);
  assert.doesNotMatch(source, /setUserSummaryPanelOpen\(true\)/);
});

test("settings render mount, workspace, ffmpeg, default mode, concurrency, and system check", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(SettingsPage, {
      settings: data.settings,
      runtimeStatus: data.runtimeStatus,
      appearanceMode: "dark",
      defaultCutMode: "precise",
      defaultSourceFilter: "all",
      defaultOrientationFilter: "all",
      onSetAppearanceMode: () => undefined
    })
  );

  for (const text of [
    "设置",
    "服务状态",
    "连接",
    "可用",
    "演示剪辑师",
    "演示本地工作区",
    "本地素材数",
    "公共素材库",
    "本地工作区",
    "剪切工具",
    "剪切工具路径",
    "默认剪切模式",
    "极速剪切",
    "精准剪切",
    "默认素材来源",
    "默认视频类型",
    "全部",
    "本地素材",
    "公共原素材",
    "横版",
    "竖版",
    "显示模式",
    "深色",
    "浅色",
    "系统",
    "同时剪切数",
    "环境检查",
    "mp3_16k_mono_64k"
  ]) {
    assert.match(html, new RegExp(text));
  }

  for (const text of [
    "http://127.0.0.1:3789",
    "界面演示模式",
    "API 地址",
    "运行模式",
    "未连接真实 API",
    "系统检查",
    "公共素材库挂载",
    "current.json",
    "cut-list",
    "local-clips"
  ]) {
    assert.equal(html.includes(text), false);
  }

  assert.equal(html.includes("跟随系统"), false);
  assert.equal(html.includes("深夜"), false);
  assert.equal(html.includes("护眼"), false);
  assert.match(html, /aria-pressed="true"[^>]*>精准剪切/);
});

test("cutter app root applies the persisted display mode", () => {
  installTestWindow();
  window.localStorage.setItem(CUTTER_APPEARANCE_STORAGE_KEY, "light");
  writeCutterAuthSession({
    user_id: "CU000001",
    username: "小王",
    device_id: "device-001",
    session_token: "session-001"
  });

  const html = renderToStaticMarkup(h(CutterApp));

  assert.match(html, /class="cutter-app"/);
  assert.match(html, /data-appearance-mode="light"/);
  assert.equal(html.includes("申请剪辑端访问"), false);
});

test("desktop first-run page exposes Windows setup, Doctor, engine, and diagnostics actions", () => {
  const html = renderToStaticMarkup(
    h(DesktopFirstRunPage, {
      config: {
        api_host: "127.0.0.1",
        api_port: 3789,
        public_library_root: String.raw`\\NAS\MixLab\PublicLibrary`,
        local_workspace_root: String.raw`C:\Users\Allen\Videos\MixLabLocal`
      },
      stage: "doctor-failed",
      doctorResult: {
        status: "fail",
        checks: [
          { id: "source_videos", label: "source-videos", status: "pass" },
          { id: "ready_materials", label: "ready 素材", status: "fail", message: "没有 ready 素材" }
        ]
      },
      diagnostics: {
        app_version: "0.18.4",
        stage: "doctor-failed",
        api_address: "http://127.0.0.1:3789",
        public_library_root: String.raw`\\NAS\MixLab\PublicLibrary`,
        local_workspace_root: String.raw`C:\Users\Allen\Videos\MixLabLocal`,
        ffmpeg_status: "待检测",
        latest_error_summary: "没有 ready 素材"
      },
      onChoosePublicLibrary: () => undefined,
      onChooseLocalWorkspace: () => undefined,
      onRunDoctor: () => undefined,
      onStartEngine: () => undefined,
      onRetry: () => undefined,
      onCopyDiagnostics: () => undefined,
      onOpenLogDirectory: () => undefined
    })
  );

  for (const text of [
    "Windows 桌面版首启",
    "选择公共素材库",
    "确认本地工作区",
    "运行 Doctor",
    "启动本机引擎",
    "复制诊断",
    "打开日志目录",
    "0.18.4",
    "source-videos",
    "ready 素材",
    "没有 ready 素材",
    "127.0.0.1:3789"
  ]) {
    assert.match(html, new RegExp(text));
  }
});

test("cutter app keeps browser mode out of the desktop first-run gate", () => {
  installTestWindow();
  window.localStorage.clear();

  const html = renderToStaticMarkup(h(CutterApp));

  assert.equal(html.includes("Windows 桌面版首启"), false);
});

test("cutter app renders the desktop first-run gate only inside Tauri", () => {
  installTestWindow();
  window.localStorage.clear();
  Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {}
  });

  try {
    const html = renderToStaticMarkup(h(CutterApp));
    assert.match(html, /Windows 桌面版首启/);
    assert.equal(html.includes("剪辑师工作台数据"), false);
  } finally {
    Reflect.deleteProperty(globalThis, "__TAURI_INTERNALS__");
  }
});

test("cutter auth storage creates a stable device id and handles session lifecycle", () => {
  installTestWindow();
  window.localStorage.clear();

  const firstDeviceId = createDeviceId();
  const secondDeviceId = createDeviceId();
  assert.equal(firstDeviceId, secondDeviceId);
  assert.match(firstDeviceId, /^cutter-/);

  assert.equal(readCutterAuthSession(), null);

  writeCutterAuthSession({
    user_id: "CU000001",
    device_id: firstDeviceId,
    session_token: "session-001",
    username: "小王"
  });
  assert.deepEqual(readCutterAuthSession(), {
    user_id: "CU000001",
    device_id: firstDeviceId,
    session_token: "session-001",
    username: "小王"
  });

  clearCutterAuthSession();
  assert.equal(readCutterAuthSession(), null);
});

test("cutter appearance CSS scopes dark light and system modes without filtering media", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const appRule = css.match(/\.cutter-app\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const darkRule = css.match(/\.cutter-app\[data-appearance-mode="dark"\]\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const lightRule = css.match(/\.cutter-app\[data-appearance-mode="light"\]\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const systemDarkRule = css.match(/@media \(prefers-color-scheme: dark\)\s*{\s*\.cutter-app\[data-appearance-mode="system"\]\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const mediaRules = Array.from(css.matchAll(/\.cutter-app\[data-appearance-mode="(?:dark|light|system)"\]\s+(?:video|img)[^{]*{(?<body>[^}]+)}/g));

  assert.match(appRule, /color:\s*var\(--ml-color-text\)/);
  assert.match(appRule, /background:\s*var\(--ml-color-canvas\)/);
  assert.match(darkRule, /--ml-color-canvas:\s*#14161a/);
  assert.match(darkRule, /--ml-color-text:\s*#b8c0cc/);
  assert.match(darkRule, /--ml-color-text-secondary:\s*#8f9aaa/);
  assert.match(darkRule, /--ml-color-text-tertiary:\s*#697382/);
  assert.match(darkRule, /color-scheme:\s*dark/);
  assert.match(lightRule, /--ml-color-canvas:\s*#f6f8fb/);
  assert.match(systemDarkRule, /--ml-color-canvas:\s*#14161a/);
  assert.match(systemDarkRule, /--ml-color-text:\s*#b8c0cc/);
  assert.match(systemDarkRule, /--ml-color-text-secondary:\s*#8f9aaa/);
  assert.match(systemDarkRule, /--ml-color-text-tertiary:\s*#697382/);
  assert.equal(darkRule.includes("#f2f4f7"), false);
  assert.equal(css.includes('data-appearance-mode="night"'), false);
  assert.equal(css.includes('data-appearance-mode="comfort"'), false);
  assert.equal(mediaRules.some((match) => match.groups?.body.includes("filter")), false);
});

test("cutter dark theme overrides foundation light surfaces with theme tokens", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.match(css, /\.cutter-app \.ml-window-chrome\s*{[^}]*display:\s*none/s);
  assert.match(css, /\.cutter-app \.ml-inspector\s*{[^}]*background:\s*var\(--ml-color-surface\)/s);
  assert.match(css, /\.cutter-app \.ml-sidebar-item\.is-active,[\s\S]*?background:\s*var\(--ml-color-control-active\)/s);
  assert.match(css, /\.cutter-material-locator \.cutter-locator-result\.is-selected\s*{[^}]*background:\s*var\(--ml-color-selected\)/s);
  const currentHitTranscriptRules = Array.from(css.matchAll(/\.cutter-material-locator \.cutter-transcript-row\.is-current-hit\s*{(?<body>[^}]+)}/g))
    .map((match) => match.groups?.body ?? "");
  const selectedTranscriptRules = Array.from(
    css.matchAll(/\.cutter-material-locator \.cutter-transcript-row\.is-selected,\s*\.cutter-material-locator \.cutter-transcript-row\.is-drag-preview\s*{(?<body>[^}]+)}/g)
  ).map((match) => match.groups?.body ?? "");
  assert.match(currentHitTranscriptRules.at(-1) ?? "", /background:\s*transparent/);
  assert.match(selectedTranscriptRules.at(-1) ?? "", /background:\s*color-mix\(in srgb,\s*var\(--ml-color-accent\) 10%,\s*transparent\)/);
  assert.match(css, /\.cutter-material-locator \.cutter-selection-bar\s*{[^}]*position:\s*fixed/s);
  assert.match(css, /\.cutter-app,\s*\.cutter-app\[data-appearance-mode="dark"\],[\s\S]*?--ml-color-canvas:\s*#101318/s);
  assert.match(css, /\.cutter-app,\s*\.cutter-app\[data-appearance-mode="dark"\],[\s\S]*?--ml-color-surface:\s*#18212b/s);
  assert.equal(css.includes('data-appearance-mode="night"'), false);
  assert.equal(css.includes('data-appearance-mode="comfort"'), false);
});

test("material locator candidate covers fill their thumbnail slot", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const coverRule = css.match(/\.cutter-locator-result img,\s*\.cutter-cover-placeholder\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  assert.match(coverRule, /width:\s*54px/);
  assert.match(coverRule, /height:\s*54px/);
  assert.match(coverRule, /object-fit:\s*cover/);
  assert.equal(coverRule.includes("aspect-ratio"), false);
});

test("cutter auth storage migrates legacy sessions without user id", () => {
  installTestWindow();
  window.localStorage.setItem(
    CUTTER_AUTH_STORAGE_KEY,
    JSON.stringify({
      device_id: "legacy-device",
      session_token: "legacy-session",
      username: "小王"
    })
  );

  assert.deepEqual(readCutterAuthSession(), {
    user_id: "",
    device_id: "legacy-device",
    session_token: "legacy-session",
    username: "小王"
  });
});

test("cutter auth storage tolerates corrupt JSON", () => {
  installTestWindow();
  window.localStorage.setItem(CUTTER_AUTH_STORAGE_KEY, "{not-json");

  assert.equal(readCutterAuthSession(), null);
  assert.equal(window.localStorage.getItem(CUTTER_AUTH_STORAGE_KEY), null);
});

test("cutter auth storage tolerates storage methods throwing", () => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        clear() {
          throw new Error("blocked");
        },
        getItem() {
          throw new Error("blocked");
        },
        key() {
          throw new Error("blocked");
        },
        removeItem() {
          throw new Error("blocked");
        },
        setItem() {
          throw new Error("blocked");
        },
        length: 0
      } satisfies Storage
    }
  });

  assert.match(createDeviceId(), /^cutter-/);
  assert.equal(readCutterAuthSession(), null);
  assert.doesNotThrow(() =>
    writeCutterAuthSession({
      user_id: "CU000001",
      device_id: "device-001",
      session_token: "session-001"
    })
  );
  assert.doesNotThrow(() => clearCutterAuthSession());
});

test("cutter pending login storage preserves username and device for approval polling", () => {
  installTestWindow();
  window.localStorage.clear();

  assert.equal(readCutterPendingLogin(), null);
  writeCutterPendingLogin({
    username: "小王",
    device_id: "device-001",
    device_name: "MacBook Pro"
  });
  assert.deepEqual(readCutterPendingLogin(), {
    username: "小王",
    device_id: "device-001",
    device_name: "MacBook Pro"
  });

  clearCutterPendingLogin();
  assert.equal(readCutterPendingLogin(), null);
});

test("pending login approval polling runs only while API mode is waiting for a stored request", () => {
  const pendingLogin = {
    username: "小王",
    device_id: "device-001",
    device_name: "MacBook Pro"
  };

  assert.equal(
    shouldPollPendingLogin({
      apiMode: true,
      authSession: null,
      pendingLogin
    }),
    true
  );
  assert.equal(
    shouldPollPendingLogin({
      apiMode: false,
      authSession: null,
      pendingLogin
    }),
    false
  );
  assert.equal(
    shouldPollPendingLogin({
      apiMode: true,
      authSession: {
        user_id: "CU000001",
        device_id: "device-001",
        session_token: "session-001"
      },
      pendingLogin
    }),
    false
  );
  assert.equal(
    shouldPollPendingLogin({
      apiMode: true,
      authSession: null,
      pendingLogin: null
    }),
    false
  );
});

test("desktop workbench data waits for setup and login before loading", () => {
  assert.equal(
    shouldLoadWorkbenchData({
      desktopSetupReady: false,
      loginGateVisible: false
    }),
    false
  );
  assert.equal(
    shouldLoadWorkbenchData({
      desktopSetupReady: true,
      loginGateVisible: true
    }),
    false
  );
  assert.equal(
    shouldLoadWorkbenchData({
      desktopSetupReady: true,
      loginGateVisible: false
    }),
    true
  );
});

test("cutter web runtime defaults to the local real API instead of fixture data", () => {
  assert.equal(
    resolveCutterRuntimeApiBaseUrl({
      globalLike: {},
      locationOrigin: "http://127.0.0.1:5177"
    }),
    "http://127.0.0.1:3789/"
  );
  assert.equal(
    resolveCutterRuntimeApiBaseUrl({
      viteApiBaseUrl: "http://127.0.0.1:4789/",
      globalLike: {},
      locationOrigin: "http://127.0.0.1:5177"
    }),
    "http://127.0.0.1:4789/"
  );
  assert.equal(
    resolveCutterRuntimeApiBaseUrl({
      useFixtureData: true,
      globalLike: {},
      locationOrigin: "http://127.0.0.1:5177"
    }),
    ""
  );
});

test("desktop runtime clears fixture data when the real API becomes available", () => {
  assert.equal(
    shouldClearFixtureDataForRuntime({
      apiMode: true,
      runtimeMode: "fixture"
    }),
    true
  );
  assert.equal(
    shouldClearFixtureDataForRuntime({
      apiMode: true,
      runtimeMode: "api"
    }),
    false
  );
  assert.equal(
    shouldClearFixtureDataForRuntime({
      apiMode: false,
      runtimeMode: "fixture"
    }),
    false
  );
});

test("login gate renders Chinese application states and only approved status renders children", async () => {
  const unknown = renderToStaticMarkup(
    h(CutterLoginGate, {
      status: "unknown",
      deviceName: "Mac 剪辑端 · Safari",
      onApply: async () => undefined,
      children: h("p", null, "工作台内容")
    })
  );
  assert.match(unknown, /申请使用剪辑师工作台/);
  assert.match(unknown, /用户名/);
  assert.match(unknown, /提交申请/);
  assert.match(unknown, /当前设备：Mac 剪辑端 · Safari/);
  assert.match(unknown, /身份方式：用户名 \+ 本机设备/);
  assert.match(unknown, /管理员审核后即可进入/);
  assert.equal(unknown.includes("IP 只用于诊断"), false);
  assert.equal(unknown.includes("工作台内容"), false);

  const pending = renderToStaticMarkup(
    h(CutterLoginGate, {
      status: "pending",
      onApply: async () => undefined,
      children: h("p", null, "工作台内容")
    })
  );
  assert.match(pending, /申请已提交，请等待管理员审核。/);
  assert.match(pending, /disabled=""/);

  const rejected = renderToStaticMarkup(
    h(CutterLoginGate, {
      status: "rejected",
      onApply: async () => undefined,
      children: h("p", null, "工作台内容")
    })
  );
  assert.match(rejected, /申请未通过，请联系管理员。/);
  assert.match(rejected, /提交申请/);

  const disabled = renderToStaticMarkup(
    h(CutterLoginGate, {
      status: "disabled",
      onApply: async () => undefined,
      children: h("p", null, "工作台内容")
    })
  );
  assert.match(disabled, /账号已停用，请联系管理员。/);
  assert.match(disabled, /提交申请/);

  const expired = renderToStaticMarkup(
    h(CutterLoginGate, {
      status: "unknown",
      message: "登录已失效，请重新申请或联系管理员。",
      onApply: async () => undefined,
      children: h("p", null, "工作台内容")
    })
  );
  assert.match(expired, /登录已失效，请重新申请或联系管理员。/);

  const approved = renderToStaticMarkup(
    h(CutterLoginGate, {
      status: "approved",
      onApply: async () => undefined,
      children: h("p", null, "工作台内容")
    })
  );
  assert.equal(approved, "<p>工作台内容</p>");
});

test("cutter device name is friendly and does not expose the full browser user agent", () => {
  assert.equal(
    cutterDeviceNameFromNavigator({
      platform: "MacIntel",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
    }),
    "Mac 剪辑端 · Safari"
  );
  assert.equal(
    cutterDeviceNameFromNavigator({
      platform: "Win32",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }),
    "Windows 剪辑端 · Chrome"
  );
  assert.equal(cutterDeviceNameFromNavigator(undefined), "剪辑工作站");
});

test("fixture mode bypasses login and runtime mode requires approved auth", () => {
  const authSession = {
    user_id: "CU000001",
    username: "小王",
    device_id: "device-001",
    session_token: "session-001"
  };

  assert.equal(initialCutterLoginStatus({ apiMode: false, authSession: null }), "approved");
  assert.equal(initialCutterLoginStatus({ apiMode: true, authSession: null }), "unknown");
  assert.equal(initialCutterLoginStatus({ apiMode: true, authSession }), "approved");
  assert.equal(shouldShowLoginGate(false, "unknown"), false);
  assert.equal(shouldShowLoginGate(false, "pending"), false);
  assert.equal(shouldShowLoginGate(true, "unknown"), true);
  assert.equal(shouldShowLoginGate(true, "pending"), true);
  assert.equal(shouldShowLoginGate(true, "rejected"), true);
  assert.equal(shouldShowLoginGate(true, "disabled"), true);
  assert.equal(shouldShowLoginGate(true, "approved"), false);
  assert.equal(shouldShowLoginGate(true, "unknown", { desktopTrusted: true }), true);
});

test("local trusted auth auto-applies only before a manual or pending login exists", () => {
  const localTrusted = {
    auth_mode: "local_trusted" as const,
    local_trusted: true,
    trusted_username: "本机剪辑师"
  };
  assert.equal(
    shouldAutoApplyLocalTrustedLogin({
      apiMode: true,
      authModeStatus: localTrusted,
      authSession: null,
      pendingLogin: null,
      loginStatus: "unknown",
      alreadyAttempted: false
    }),
    true
  );
  assert.equal(
    shouldAutoApplyLocalTrustedLogin({
      apiMode: true,
      authModeStatus: { auth_mode: "reviewed", local_trusted: false, trusted_username: "" },
      authSession: null,
      pendingLogin: null,
      loginStatus: "unknown",
      alreadyAttempted: false
    }),
    false
  );
  assert.equal(
    shouldAutoApplyLocalTrustedLogin({
      apiMode: true,
      authModeStatus: localTrusted,
      authSession: {
        user_id: "CU000001",
        device_id: "device-001",
        session_token: "session-001"
      },
      pendingLogin: null,
      loginStatus: "unknown",
      alreadyAttempted: false
    }),
    false
  );
  assert.equal(
    shouldAutoApplyLocalTrustedLogin({
      apiMode: true,
      authModeStatus: localTrusted,
      authSession: null,
      pendingLogin: {
        username: "小王",
        device_id: "device-001",
        device_name: "Mac 剪辑端"
      },
      loginStatus: "pending",
      alreadyAttempted: false
    }),
    false
  );
  assert.equal(
    shouldAutoApplyLocalTrustedLogin({
      apiMode: true,
      authModeStatus: localTrusted,
      authSession: null,
      pendingLogin: null,
      loginStatus: "unknown",
      alreadyAttempted: true
    }),
    false
  );
});

test("cut task refresh is limited to the cut tasks route", () => {
  assert.equal(
    shouldRefreshCutQueueForRoute({
      apiMode: true,
      hasData: true,
      loginGateVisible: false,
      route: "cut-tasks"
    }),
    true
  );
  assert.equal(
    shouldRefreshCutQueueForRoute({
      apiMode: true,
      hasData: true,
      loginGateVisible: false,
      currentProjectId: "P20260505-001",
      route: "material-locator"
    }),
    true
  );
  assert.equal(
    shouldRefreshCutQueueForRoute({
      apiMode: true,
      hasData: true,
      loginGateVisible: false,
      route: "public-library"
    }),
    false
  );
  assert.equal(
    shouldRefreshCutQueueForRoute({
      apiMode: false,
      hasData: true,
      loginGateVisible: false,
      route: "cut-tasks"
    }),
    false
  );
});

test("backend approved login status allows runtime workbench without returned session token", () => {
  const status = loginStatusFromBackendStatus(backendStatus("approved"));

  assert.equal(status, "approved");
  assert.equal(shouldShowLoginGate(true, status), false);
});

test("approved login application yields a stored cutter auth session", () => {
  const application: CutterLoginApplication = {
    user: backendUser("approved"),
    session: {
      user_id: "CU000001",
      device_id: "device-001",
      session_token: "session-001",
      created_at: "2026-05-03T08:05:00Z",
      last_seen_at: "2026-05-03T08:06:00Z"
    }
  };

  assert.equal(loginStatusFromApplication(application), "approved");
  assert.deepEqual(authSessionFromApprovedApplication(application), {
    user_id: "CU000001",
    username: "xiaowang",
    device_id: "device-001",
    session_token: "session-001"
  });
  assert.equal(
    authSessionFromApprovedApplication({
      user: backendUser("pending")
    }),
    null
  );
  assert.equal(
    loginGateStatusFromApplication({
      user: backendUser("approved")
    }),
    "unknown"
  );
  assert.equal(
    shouldShowLoginGate(
      true,
      loginGateStatusFromApplication({
        user: backendUser("approved")
      })
    ),
    true
  );
});

test("backend login status maps non-approved user states to login gate states", () => {
  const cases: Array<[CutterUserStatus, CutterLoginStatusValue]> = [
    ["pending", "pending"],
    ["rejected", "rejected"],
    ["disabled", "disabled"]
  ];

  for (const [backend, expected] of cases) {
    assert.equal(loginStatusFromBackendStatus(backendStatus(backend)), expected);
    assert.equal(loginStatusFromApplication({ user: backendUser(backend) }), expected);
  }

  assert.equal(loginStatusFromBackendStatus({ ok: false, reason: "登录凭证无效" }), "unknown");
  assert.equal(
    loginStatusFromBackendStatus({
      ok: false,
      reason: "登录凭证无效",
      user: backendUser("approved")
    }),
    "unknown"
  );
});

test("401 login_required status errors clear stored session and show an honest Chinese message", () => {
  const error = new CutterApiError({
    status: 401,
    code: "login_required",
    message: "登录凭证无效"
  });

  assert.equal(shouldClearSessionForLoginStatusError(error), true);
  assert.equal(loginMessageForAuthError(error), "登录已失效，请重新申请或联系管理员。");
});

test("pending login polling retries transient errors only", () => {
  assert.equal(
    shouldRetryPendingLoginError(
      new CutterApiError({
        status: 400,
        code: "invalid_login_request",
        message: "设备已停用"
      })
    ),
    false
  );
  assert.equal(
    shouldRetryPendingLoginError(
      new CutterApiError({
        status: 500,
        code: "internal_error",
        message: "服务暂不可用"
      })
    ),
    true
  );
  assert.equal(shouldRetryPendingLoginError(new TypeError("网络中断")), true);
});
