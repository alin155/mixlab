import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createFixtureCutterData, emptySearchResponse } from "./fixture-client.ts";
import { PublicLibraryPage } from "./features/public-library/PublicLibraryPage.tsx";
import { SourceDetailPage } from "./features/source-detail/SourceDetailPage.tsx";
import { SearchPage } from "./features/search/SearchPage.tsx";
import {
  MaterialLocatorPage,
  materialLocatorDisplayDurationMs
} from "./features/material-locator/MaterialLocatorPage.tsx";
import { CutListPage } from "./features/cut-list/CutListPage.tsx";
import { LocalLibraryPage } from "./features/local-library/LocalLibraryPage.tsx";
import { CutQueuePage } from "./features/cut-queue/CutQueuePage.tsx";
import { SettingsPage } from "./features/settings/SettingsPage.tsx";
import {
  ProjectDeleteDialog,
  ProjectHomePage
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
  cutNoticeForCompletedLocalClips,
  cutNoticeForPipelineResult,
  cutNoticeForSubmittedJobs,
  cutterDeviceNameFromNavigator,
  loginGateStatusFromApplication,
  loginMessageForAuthError,
  loginStatusFromApplication,
  loginStatusFromBackendStatus,
  materialLocatorSearchQueryForHashChange,
  materialFocusFromResult,
  mergeMaterialLocatorReloadData,
  shouldClearSessionForLoginStatusError,
  shouldPollPendingLogin,
  shouldRefreshCutQueueForRoute,
  shouldRetryPendingLoginError,
  shouldShowCutterToolbar,
  CutterProjectSwitcher,
  CutterApp,
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
import { buildMaterialLocatorSections } from "./state/material-locator.ts";
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
      title: "现金流短片开场"
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
  assert.equal(sourceVideoIdFromHash("#source-detail/V000001"), "V000001");
  assert.equal(sourceVideoIdFromHash("#source-detail/V000001?query=现金流"), "V000001");
  assert.equal(sourceVideoIdFromHash("#source-detail/not-safe"), undefined);
  assert.equal(sourceVideoIdFromHash("#public-library"), undefined);
  assert.equal(sourceDetailHash("V000001"), "#source-detail/V000001");
  assert.equal(
    sourceDetailHash("V000001", {
      query: "现金流",
      segmentIds: ["V000001-S000001", "V000001-S000002"]
    }),
    "#source-detail/V000001?query=%E7%8E%B0%E9%87%91%E6%B5%81&segments=V000001-S000001%2CV000001-S000002"
  );
  assert.deepEqual(sourceDetailContextFromHash("#source-detail/V000001?query=%E7%8E%B0%E9%87%91%E6%B5%81&segments=V000001-S000001%2CV000001-S000002"), {
    sourceVideoId: "V000001",
    query: "现金流",
    segmentIds: ["V000001-S000001", "V000001-S000002"]
  });
});

test("M14.1 cutter navigation exposes only the five primary workbench areas", () => {
  assert.deepEqual(
    CUTTER_NAV_ITEMS.map((item) => item.label),
    ["素材定位", "剪切任务", "本地素材", "公共素材库", "设置"]
  );
  assert.equal(routeFromHash(""), "project-home");
  assert.equal(routeFromHash("#project-home"), "project-home");
  assert.equal(routeFromHash("#public-library"), "public-library");
  assert.equal(routeTitle("project-home"), "启动页");
  assert.equal(routeTitle("material-locator"), "素材定位");

  const labels = CUTTER_NAV_ITEMS.map((item) => item.label).join(" / ");
  for (const oldLabel of ["原视频详情", "搜索与文案", "待剪清单", "剪切队列"]) {
    assert.equal(labels.includes(oldLabel), false);
  }
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
      onOpenProject: () => undefined
    })
  );

  for (const text of [
    "开始搜索",
    "搜索文案关键词或粘贴爆款文案",
    "最近项目",
    "5月5日",
    "已剪 1",
    "搜索",
    "项目详情",
    "进入项目",
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
      onOpenProject: () => undefined
    })
  );

  assert.match(html, /aria-label="选择项目 5月5日"/);
  assert.match(html, /aria-label="选择项目 直播复盘"/);
  assert.match(html, /class="cutter-project-card is-selected"/);
  assert.match(html, /class="cutter-project-card-enter"/);
  assert.ok(html.indexOf("直播复盘") < html.indexOf("项目详情"));
  assert.match(html, /项目名<\/dt><dd><button[^>]+>直播复盘<\/button>/);
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
    "从启动页移除",
    "不删除剪切视频、本地素材、交付目录",
    "删除项目及产出",
    "公共素材库源视频不会被删除",
    "确认删除"
  ]) {
    assert.match(html, new RegExp(text));
  }
  assert.match(html, /checked="" value="remove"/);
  assert.match(html, /value="delete-with-outputs"/);
});

test("chrome project switcher exposes project and temporary search actions", () => {
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
      onStartTemporarySearch: () => undefined,
      onRenameProject: () => undefined
    })
  );
  const temporaryHtml = renderToStaticMarkup(
    h(CutterProjectSwitcher, {
      onStartTemporarySearch: () => undefined
    })
  );

  assert.match(activeHtml, /当前项目：5月5日/);
  assert.match(activeHtml, /回到启动页/);
  assert.match(activeHtml, /新建搜索/);
  assert.match(activeHtml, /查看项目剪切任务/);
  assert.match(activeHtml, /重命名当前项目/);
  assert.match(temporaryHtml, /临时搜索/);
  assert.equal(temporaryHtml.includes("重命名当前项目"), false);
});

test("legacy cutter hashes resolve into the M14.1 primary flow without breaking old links", () => {
  assert.equal(routeFromHash("#search?query=%E7%8E%B0%E9%87%91%E6%B5%81"), "material-locator");
  assert.equal(routeFromHash("#cut-list"), "cut-tasks");
  assert.equal(routeFromHash("#cut-queue"), "cut-tasks");
  assert.equal(routeFromHash("#source-detail/V000001"), "source-detail");
});

test("search hash preserves query while targeting the material locator route", () => {
  assert.equal(routeFromHash("#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81"), "material-locator");
  assert.equal(routeFromHash("#search?query=%E7%8E%B0%E9%87%91%E6%B5%81"), "material-locator");
  assert.equal(searchQueryFromHash("#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81"), "现金流");
  assert.equal(searchQueryFromHash("#search?query=%E7%8E%B0%E9%87%91%E6%B5%81"), "现金流");
  assert.equal(searchQueryFromHash("#public-library"), "");
  assert.equal(searchHash(" 现金流 "), "#material-locator?query=%E7%8E%B0%E9%87%91%E6%B5%81");
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
  const html = renderToStaticMarkup(
    h(PublicLibraryPage, {
      library: data.library,
      selectedSourceVideoId: data.primaryDetail.source_video_id
    })
  );

  for (const text of ["可用原素材", "全部", "横版", "竖版", "现金流管理与风险控制", "经营分析", "由管理端配置"]) {
    assert.match(html, new RegExp(text));
  }

  assert.match(html, /href="#source-detail\/src-001"/);
  assert.match(html, /查看详情/);
  assert.match(html, /ml-gallery-grid/);
  assert.equal(html.includes("processing"), false);
  assert.equal(html.includes("failed"), false);
  assert.equal(html.includes("编辑元数据"), false);
});

test("source detail renders player, complete transcript, continuous selection, and one-span add action", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(SourceDetailPage, {
      detail: data.primaryDetail,
      selectedSegments: data.primaryDetail.transcript.segments.slice(1, 4),
      highlightedSegmentIds: ["s-001", "s-003"],
      onSelectSegment: () => undefined
    })
  );

  for (const text of [
    "原视频与完整文案",
    "完整文案",
    "连续选择",
    "已选 3 句",
    "加入待剪清单",
    "现金流短片开场",
    "选择此句"
  ]) {
    assert.match(html, new RegExp(text));
  }

  assert.match(html, /<video/);
  assert.match(html, /data-selection-mode="continuous"/);
  assert.match(html, /is-highlighted/);
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

  for (const text of ["按原素材分组", "2 组命中", "现金流管理与风险控制", "上下文文案", "执行搜索", "查看完整文案"]) {
    assert.match(html, new RegExp(text));
  }

  assert.match(html, /name="query"/);
  assert.match(html, /href="#source-detail\/src-001\?query=%E7%8E%B0%E9%87%91%E6%B5%81&amp;segments=/);
  assert.equal(html.includes("sentence-waterfall"), false);
});

test("material locator is the main search-select-cut workbench with local results first", () => {
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
      highlightedSegmentIds: ["s-001"],
      currentHitIndex: 0,
      currentHitSegmentId: "s-001",
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
      onSelectTranscriptSegment: () => undefined,
      onNavigateHit: () => undefined,
      onCutSelection: () => undefined,
      onCancelSelection: () => undefined,
      onOpenCutOutputDirectory: () => undefined,
      onSetCutMode: () => undefined
    })
  );

  for (const text of [
    "素材定位",
    "开始搜索",
    "搜索文案关键词或粘贴爆款文案",
    "候选素材",
    "搜索记录 · 2次",
    "老师",
    "全部",
    "本地素材",
    "公共原素材",
    "横版",
    "视频文案",
    "命中 1 / 3",
    "上一个",
    "下一个",
    "极速剪切",
    "精准剪切",
    "剪切这段",
    "已加入剪切任务 · 等待中 1",
    "剪切队列",
    "查看全部任务",
    "打开文件目录"
  ]) {
    assert.ok(html.includes(text), text);
  }

  assert.ok(html.indexOf("查看全部任务") < html.indexOf("打开文件目录"));
  assert.equal(html.includes("片段篮"), false);
  assert.equal(html.includes("待剪清单"), false);
  assert.equal(html.includes("搜索定位"), false);
  assert.equal(html.includes("候选素材 <span>·"), false);
  const localCandidateSectionIndex = html.indexOf("<h2>本地素材</h2>");
  const publicCandidateSectionIndex = html.indexOf("<h2>公共原素材</h2>");
  assert.ok(localCandidateSectionIndex >= 0);
  assert.ok(publicCandidateSectionIndex >= 0);
  assert.ok(localCandidateSectionIndex < publicCandidateSectionIndex);
  assert.match(html, /cutter-locator-top-row/);
  assert.equal(html.includes("流程明细"), false);
  assert.equal(html.includes("cutter-locator-queue-phases"), false);
  assert.match(html, /cutter-locator-bottom-row/);
  assert.ok(html.indexOf("cutter-locator-command") < html.indexOf("cutter-locator-workbench"));
  assert.ok(html.indexOf("cutter-locator-status") < html.indexOf("cutter-locator-visual"));
  assert.ok(html.indexOf("cutter-locator-visual") < html.indexOf("cutter-locator-queue-panel"));
  assert.ok(html.indexOf("cutter-locator-queue-panel") < html.indexOf("cutter-locator-bottom-row"));
  assert.ok(html.indexOf("cutter-locator-queue-notice") > html.indexOf("cutter-locator-queue-panel"));
  assert.ok(html.indexOf("cutter-locator-candidates") < html.indexOf("cutter-natural-transcript"));
  assert.equal(html.includes("当前搜索"), false);
  assert.equal(html.includes("画面方向"), false);
  assert.equal(html.includes('value="现金流"'), false);
  assert.equal(html.includes("<span>候选素材</span>"), false);
  assert.equal(html.includes("<span>搜索次数</span>"), false);
  assert.equal(html.includes("搜、选、剪"), false);
  assert.equal(html.includes("<h1>素材定位</h1>"), false);
  assert.equal(html.includes("完整文案"), false);
  assert.equal(html.includes("自然文案"), false);
  assert.equal(html.includes("选项"), false);
  assert.equal(html.includes("素材来源"), false);
  assert.equal(html.includes("视频类型"), false);
  assert.equal(html.includes("<h2>画面验证</h2>"), false);
  assert.equal(html.includes("横版 · 29:50"), false);
  assert.equal(html.includes("<h2>剪切队列</h2>"), false);
  assert.equal(html.includes("剪切中 0 · 等待 1 · 完成 2 · 失败 0"), false);
  assert.equal(html.includes("cutter-locator-notice"), false);
  assert.ok(html.includes(`现金流管理与风险控制 · 公共原素材 · 横版 · 10:18 · 文案 ${publicTranscriptLength} 字 · 命中 3 处`));
  assert.ok(html.includes(`文案 ${publicTranscriptLength} 字`));
  assert.ok(html.includes("3 处命中"));
  assert.ok(html.includes("cutter-locator-result is-selected"));
  assert.equal(html.includes("<em>"), false);
  assert.equal(html.includes('name="sourceFilter"'), false);
  assert.equal(html.includes('name="orientationFilter"'), false);
  assert.ok(html.includes('data-layout="search-select-cut"'));
  assert.ok(html.includes('data-page="material-locator"'));
  assert.ok(html.includes("<video"));
  assert.ok(html.includes('data-testid="locator-video"'));
  assert.ok(html.includes('data-testid="preview-selection"'));
  assert.ok(html.includes("cutter-floating-selection-bar"));
  assert.ok(html.includes("cutter-compact-selection-bar"));
  assert.ok(html.includes("已选 13 秒"));
  assert.equal(html.includes("已选中一段文案"), false);
  assert.ok(html.indexOf("现金流不是利润表的影子") < html.indexOf("cutter-selection-bar"));
  assert.ok(html.indexOf("cutter-selection-bar") < html.indexOf("preview-selection"));
  assert.ok(html.includes("暂停预览"));
});

test("material locator prefers real media duration when browser metadata is available", () => {
  assert.equal(materialLocatorDisplayDurationMs(1_326_000), 1_326_000);
  assert.equal(materialLocatorDisplayDurationMs(1_326_000, 1_790_400), 1_790_400);
  assert.equal(materialLocatorDisplayDurationMs(1_326_000, 0), 1_326_000);
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
  assert.equal(targets[0].material.source, "local");
  assert.equal(targets[1].material.source, "public");
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

test("material locator hit controls stay available while displaying the global hit ordinal", () => {
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
      highlightedSegmentIds: ["s-001"],
      currentHitSegmentId: "s-001",
      currentHitIndex: 9,
      globalHitCount: 10,
      queue: data.queue,
      onNavigateHit: () => undefined
    })
  );

  assert.match(html, /命中 10 \/ 10/);
  assert.doesNotMatch(html, /<button type="button" disabled="">上一个<\/button>/);
  assert.doesNotMatch(html, /<button type="button" disabled="">下一个<\/button>/);
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
      highlightedSegmentIds: ["s-001"],
      queue: data.queue
    })
  );

  assert.match(html, /data-selection-mode="natural-text"/);
  assert.match(html, /data-segment-id="s-001"/);
  assert.match(html, /data-current-hit-segment-id="s-001"/);
  assert.match(html, /data-autoscroll-target="s-001"/);
  assert.match(html, /is-current-hit/);
  assert.match(html, /现金流不是利润表的影子。/);
  assert.equal(html.includes("选择此句"), false);
  assert.equal(html.includes("cutter-segment"), false);
  assert.equal(html.includes("内部映射"), false);
});

test("material locator candidate focus highlights hits without creating a cut selection", () => {
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
      highlightedSegmentIds: ["s-001", "s-003"],
      queue: data.queue
    })
  );

  assert.match(html, /is-highlighted/);
  assert.match(html, /is-current-hit/);
  assert.equal(html.includes("已选中一段文案"), false);
  assert.equal(html.includes("cutter-floating-selection-bar"), false);
});

test("material locator floating selection toolbar is compact instead of a blocking overlay", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const compactRule = css.match(/\.cutter-compact-selection-bar\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const anchoredRule = css.match(/\.cutter-floating-selection-bar\.is-anchored\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const responsiveRule = css.match(/\.cutter-floating-selection-bar\.is-anchored:not\(\.cutter-compact-selection-bar\)\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  assert.match(compactRule, /display:\s*inline-flex/);
  assert.match(compactRule, /max-height:\s*40px/);
  assert.match(compactRule, /overflow:\s*hidden/);
  assert.match(anchoredRule, /height:\s*auto/);
  assert.match(anchoredRule, /margin:\s*0/);
  assert.match(responsiveRule, /width:\s*calc\(100vw - 32px\)/);
});

test("material locator keeps search and review areas fixed while transcript scrolls independently", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const pageMainRule = css.match(/\.cutter-material-locator \.cutter-page-main\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const workbenchRule = css.match(/\.cutter-locator-workbench\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const topRowRule = css.match(/\.cutter-locator-top-row\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const bottomRowRule = css.match(/\.cutter-locator-bottom-row\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const statusRule = css.match(/\.cutter-locator-status\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const historyListRule = css.match(/\.cutter-locator-search-history > div\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const queuePanelMatches = Array.from(css.matchAll(/\.cutter-locator-queue-panel\s*{(?<body>[^}]+)}/g));
  const queuePanelRule = queuePanelMatches.at(-1)?.groups?.body ?? "";
  const queueListRule = css.match(/\.cutter-locator-queue-list\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const transcriptRule = css.match(/\.cutter-natural-transcript\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const transcriptBodyRule = css.match(/\.cutter-natural-transcript p\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  assert.match(pageMainRule, /height:\s*100%/);
  assert.match(pageMainRule, /grid-template-rows:\s*auto auto minmax\(0,\s*1fr\)/);
  assert.match(pageMainRule, /overflow:\s*hidden/);
  assert.match(workbenchRule, /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(topRowRule, /position:\s*sticky/);
  assert.match(topRowRule, /height:\s*430px/);
  assert.match(topRowRule, /overflow:\s*hidden/);
  assert.match(statusRule, /grid-template-rows:\s*minmax\(0,\s*1fr\)/);
  assert.match(statusRule, /overflow:\s*hidden/);
  assert.match(historyListRule, /overflow:\s*auto/);
  assert.match(topRowRule, /grid-template-columns:\s*196px minmax\(540px,\s*1fr\) minmax\(320px,\s*1fr\)/);
  assert.match(queuePanelRule, /grid-template-rows:\s*auto auto auto minmax\(0,\s*1fr\)/);
  assert.match(queuePanelRule, /overflow:\s*hidden/);
  assert.match(queueListRule, /overflow:\s*auto/);
  assert.match(bottomRowRule, /min-height:\s*0/);
  assert.match(bottomRowRule, /overflow:\s*hidden/);
  assert.match(transcriptRule, /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(transcriptRule, /min-height:\s*0/);
  assert.match(transcriptBodyRule, /min-height:\s*0/);
  assert.match(transcriptBodyRule, /overflow:\s*auto/);
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
  assert.equal(queue[0]?.source_title, "现金流管理与风险控制");
  assert.equal(routeToHash("material-locator"), "#material-locator");
  assert.equal(routeToHash("cut-tasks"), "#cut-tasks");
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

test("selecting a search result focuses the first natural hit without creating a cut range", () => {
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

  assert.ok(result);
  assert.deepEqual(materialFocusFromResult(result), {
    currentSegmentId: "s-001",
    highlightedSegmentIds: ["s-001"]
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
  const html = renderToStaticMarkup(
    h(LocalLibraryPage, {
      catalog: data.localClips,
      selectedLocalClipId: "clip-002",
      onSelectLocalClip: () => undefined
    })
  );

  for (const text of ["本地素材库", "本地可复剪素材", "全部", "横版", "竖版", "素材详情", "复盘方法三步"]) {
    assert.match(html, new RegExp(text));
  }

  assert.match(html, /ml-gallery-grid/);
  assert.match(html, /<video[^>]+src="\/local-clips\/clip-002\.mp4"/);
  assert.match(html, /aria-pressed="true"/);
  assert.equal(html.includes("搜索本地素材"), false);
  assert.equal(html.includes("打开视频"), false);
  assert.equal(html.includes("显示文件夹"), false);
  assert.equal(html.includes("再次选段"), false);
  assert.equal(html.includes("来源追踪"), false);
  assert.equal(html.includes("资源信息"), false);
  assert.equal(html.includes("Local Clip"), false);
  assert.equal(html.includes("可用原素材"), false);
});

test("cut tasks page renders every task state, summary, and auto-refresh status in Chinese", () => {
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
    "重试",
    "自动刷新",
    "刚刚更新",
    "本机剪切运行中",
    "已处理 1 个任务",
    "继续剪切",
    "失败原因",
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
  assert.equal(html.includes(data.queue[0]!.title), true);
  assert.equal(data.queue[0]!.title, "1-现金流项目-现金流管理与风险控制");
  assert.equal(data.queue[0]!.title.includes("00:"), false);
  assert.equal(data.queue[0]!.title.includes(" · "), false);
  assert.equal(data.queue[0]!.title.includes(data.queue[0]!.selected_text), false);
  assert.match(html, /data-page="cut-tasks"/);
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

  assert.match(html, /失败原因/);
  assert.match(html, /FFmpeg 输出目录不可写/);
  assert.equal(html.includes("<button type=\"button\">重试</button>"), false);
});

test("cut tasks renders optional API refresh and run controls", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(CutQueuePage, {
      jobs: data.queue,
      onRefresh: () => undefined,
      onRunNext: () => undefined
    })
  );

  assert.match(html, /刷新任务/);
  assert.match(html, /继续剪切/);
});

test("settings render mount, workspace, ffmpeg, default mode, concurrency, and Doctor", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(SettingsPage, {
      settings: data.settings,
      runtimeStatus: data.runtimeStatus,
      apiBaseUrl: "http://127.0.0.1:3789",
      appearanceMode: "system",
      defaultCutMode: "precise",
      defaultSourceFilter: "all",
      defaultOrientationFilter: "all",
      onSetAppearanceMode: () => undefined
    })
  );

  for (const text of [
    "设置",
    "真实模式联调状态",
    "http://127.0.0.1:3789",
    "界面演示模式",
    "演示剪辑师",
    "演示本地工作区",
    "本地素材数",
    "公共素材库挂载",
    "本地工作区",
    "FFmpeg",
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
    "跟随系统",
    "默认",
    "深夜",
    "护眼",
    "并发数",
    "Doctor",
    "mp3_16k_mono_64k"
  ]) {
    assert.match(html, new RegExp(text));
  }

  assert.match(html, /aria-pressed="true"[^>]*>精准剪切/);
});

test("cutter app root applies the persisted display mode", () => {
  installTestWindow();
  window.localStorage.setItem(CUTTER_APPEARANCE_STORAGE_KEY, "night");

  const html = renderToStaticMarkup(h(CutterApp));

  assert.match(html, /class="cutter-app"/);
  assert.match(html, /data-appearance-mode="night"/);
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

test("cutter appearance CSS scopes night and comfort modes without filtering media", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const appRule = css.match(/\.cutter-app\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const nightRule = css.match(/\.cutter-app\[data-appearance-mode="night"\]\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const comfortRule = css.match(/\.cutter-app\[data-appearance-mode="comfort"\]\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const systemDarkRule = css.match(/@media \(prefers-color-scheme: dark\)\s*{\s*\.cutter-app\[data-appearance-mode="system"\]\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const mediaRules = Array.from(css.matchAll(/\.cutter-app\[data-appearance-mode="(?:night|comfort|system)"\]\s+(?:video|img)[^{]*{(?<body>[^}]+)}/g));

  assert.match(appRule, /background:\s*var\(--ml-color-canvas\)/);
  assert.match(nightRule, /--ml-color-canvas:\s*#14161a/);
  assert.match(nightRule, /color-scheme:\s*dark/);
  assert.match(comfortRule, /--ml-color-canvas:\s*#f6f0e7/);
  assert.match(systemDarkRule, /--ml-color-canvas:\s*#14161a/);
  assert.equal(mediaRules.some((match) => match.groups?.body.includes("filter")), false);
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
  assert.match(unknown, /身份方式：用户名 \+ 本机设备令牌/);
  assert.match(unknown, /IP 只用于诊断/);
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
  assert.equal(shouldShowLoginGate(false, "unknown"), false);
  assert.equal(shouldShowLoginGate(false, "pending"), false);
  assert.equal(shouldShowLoginGate(true, "unknown"), true);
  assert.equal(shouldShowLoginGate(true, "pending"), true);
  assert.equal(shouldShowLoginGate(true, "rejected"), true);
  assert.equal(shouldShowLoginGate(true, "disabled"), true);
  assert.equal(shouldShowLoginGate(true, "approved"), false);
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
