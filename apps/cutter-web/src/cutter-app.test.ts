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
import { LibraryGallery } from "./features/library-gallery.tsx";
import { SourceDetailPage } from "./features/source-detail/SourceDetailPage.tsx";
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
import { CacheManagementPage } from "./features/cache-management/CacheManagementPage.tsx";
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
  cutterRuntimeCacheBytes,
  cutterLocalCacheSnapshot,
  cutterDeviceNameFromNavigator,
  formatCutterCacheSize,
  hasCompleteDesktopConfig,
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
  shouldRenderGlobalCutterError,
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
    ["首页", "素材搜索", "剪切任务", "本地素材", "公共素材库", "缓存管理", "设置"]
  );
  assert.equal(routeFromHash(""), "project-home");
  assert.equal(routeFromHash("#project-home"), "project-home");
  assert.equal(routeFromHash("#/project-home"), "project-home");
  assert.equal(routeFromHash("#public-library"), "public-library");
  assert.equal(routeFromHash("#/public-library"), "public-library");
  assert.equal(routeFromHash("#/cache-management"), "cache-management");
  assert.equal(routeTitle("project-home"), "首页");
  assert.equal(routeTitle("material-locator"), "素材搜索");
  assert.equal(routeTitle("cache-management"), "缓存管理");

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
  assert.match(html, /class="cutter-page cutter-project-home ml-workbench-page ml-workbench-page--project-home"/);
  assert.match(html, /class="cutter-page-main ml-workbench-main ml-workbench-main--project-home"/);
  assert.match(html, /class="cutter-eyebrow ml-page-kicker ml-page-kicker--hero"/);
  assert.match(html, /class="ml-page-title ml-page-title--hero"/);
  assert.match(html, /class="cutter-note ml-page-description ml-page-description--hero"/);
  assert.match(html, /class="cutter-project-hero ml-workbench-hero"/);
  assert.match(html, /class="ml-workbench-hero-copy"/);
  assert.match(html, /class="cutter-search-form cutter-project-search-form ml-control-row--hero ml-workbench-hero-actions"/);
  assert.match(html, /class="ml-section-heading"/);
  assert.match(html, /class="ml-section-title">最近项目<\/h2>/);
  assert.match(html, /class="cutter-project-board ml-workbench-board"/);
  assert.match(html, /class="cutter-project-list-panel ml-workbench-panel ml-workbench-panel--list"/);
  assert.match(html, /class="cutter-project-grid ml-scroll-region ml-fixed-media-grid"/);
  assert.ok((html.match(/class="ml-media-fill"/g) ?? []).length >= 2);
  assert.match(html, /class="cutter-project-detail ml-scroll-region ml-workbench-panel ml-detail-panel"/);
  assert.match(html, /class="cutter-project-detail-header ml-section-heading"/);
  assert.match(html, /class="ml-section-title">项目详情<\/h2>/);
  assert.match(html, /class="cutter-project-detail-cover ml-media-frame ml-detail-cover"/);
  assert.match(html, /class="ml-data-list ml-data-list--detail cutter-project-detail-list"/);
  assert.equal((html.match(/class="ml-data-row ml-data-row--detail cutter-project-detail-row"/g) ?? []).length, 4);
  assert.equal(html.includes("cutter-project-detail-tools"), false);
  assert.equal(html.includes("cutter-project-detail-tool"), false);
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
  assert.match(html, /class="cutter-project-card-main ml-media-card-fill-action ml-focus-inset"/);
  assert.match(html, /class="cutter-project-card ml-media-card ml-media-card--fixed is-selected"/);
  assert.match(html, /class="cutter-project-cover ml-media-card-cover-fill"/);
  assert.match(html, /class="cutter-project-card-summary ml-media-card-caption ml-media-card-caption--top"/);
  assert.match(html, /class="ml-media-card-title">直播复盘<\/strong>/);
  assert.match(html, /class="cutter-project-card-stats ml-media-card-meta-stack"/);
  assert.match(html, /cutter-project-card-enter/);
  assert.match(html, /cutter-project-card-directory/);
  assert.match(html, /class="cutter-project-card-actions ml-overlay-action-row ml-media-card-action-row"/);
  assert.equal(html.includes("cutter-project-card-more"), false);
  assert.match(html, /已剪 3/);
  assert.match(html, /待剪 0/);
  assert.match(html, /ml-button--primary/);
  assert.match(html, /ml-button--secondary/);
  assert.match(html, /class="ml-action-stack ml-sticky-action-stack ml-action-stack--detail cutter-project-detail-controls"/);
  assert.ok(html.indexOf("直播复盘") < html.indexOf("项目详情"));
  assert.match(html, /项目名<\/dt><dd>直播复盘<\/dd>/);
  assert.match(html, /<span class="ml-button-label">重命名<\/span>/);
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
  assert.match(html, /class="cutter-modal-backdrop ml-modal-backdrop"/);
  assert.match(html, /class="cutter-project-dialog ml-dialog"/);
  assert.match(html, /class="ml-dialog-header"/);
  assert.match(html, /class="ml-dialog-title">重命名项目<\/h2>/);
  assert.match(html, /class="ml-dialog-description">项目名只保存在本机剪辑工作台/);
  assert.match(html, /class="cutter-project-rename-field ml-form-field"/);
  assert.match(html, /class="ml-field-input"/);
  assert.match(html, /class="ml-dialog-footer"/);
  assert.match(html, /项目名只保存在本机剪辑工作台/);
  assert.match(html, /value="5月6日"/);
  assert.match(html, /<span class="ml-button-label">保存<\/span>/);
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
  assert.match(html, /class="cutter-project-dialog ml-dialog"/);
  assert.match(html, /class="ml-dialog-title">新建项目<\/h2>/);
  assert.match(html, /class="cutter-project-rename-field ml-form-field"/);
  assert.match(html, /class="ml-field-input"/);
  assert.match(html, /项目会保存在本机剪辑工作台/);
  assert.match(html, /value="直播切条"/);
  assert.match(html, /<span class="ml-button-label">创建<\/span>/);
  assert.match(html, /<span class="ml-button-label">取消<\/span>/);
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
  assert.match(html, /class="cutter-project-delete-dialog ml-dialog"/);
  assert.match(html, /class="ml-dialog-title">删除项目「5月6日」<\/h2>/);
  assert.match(html, /class="cutter-project-delete-options ml-choice-list"/);
  assert.match(html, /class="ml-choice-option"/);
  assert.match(html, /class="is-danger ml-choice-option ml-choice-option--danger"/);
  assert.match(html, /class="ml-choice-option-body"/);
  assert.match(html, /class="ml-dialog-footer"/);
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
  assert.match(destructiveHtml, /ml-button--danger/);
  assert.match(destructiveHtml, /<span class="ml-button-label">确认删除<\/span>/);
});

test("project delete dialog keeps the destructive confirm button readable", async () => {
  const css = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );
  const lastRule = (pattern: RegExp) =>
    Array.from(css.matchAll(pattern)).map((match) => match.groups?.body ?? "").at(-1) ?? "";
  const foundationDangerRule = lastRule(
    /\.ml-button--danger\s*{(?<body>[^}]+)}/g
  );

  assert.match(foundationDangerRule, /color:\s*var\(--ml-color-failed\)/);
  assert.match(foundationDangerRule, /background:\s*var\(--ml-color-failed-soft\)/);
  assert.match(foundationDangerRule, /border-color:\s*color-mix\(in srgb, var\(--ml-color-failed\) 30%, transparent\)/);
});

test("project detail controls style foundation buttons instead of raw button elements", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );

  assert.equal(css.includes(".cutter-app .ml-button"), false);
  assert.equal(
    css.includes(
      '.cutter-app[data-cutter-web-ready][data-cutter-route="project-home"] .cutter-project-detail-controls button'
    ),
    false
  );
  assert.equal(
    css.includes(
      '.cutter-app[data-cutter-web-ready][data-cutter-route="project-home"] .cutter-project-detail-controls .ml-button'
    ),
    false
  );
  assert.match(
    foundationCss,
    /\.ml-action-stack > \.ml-button\s*{[^}]*min-height:\s*36px/s
  );
  assert.match(
    foundationCss,
    /\.ml-sticky-action-stack\s*{[^}]*background:\s*var\(--ml-color-sticky-surface-fade\),\s*var\(--ml-color-sticky-surface\)/s
  );
});

test("project home css does not keep removed legacy action surfaces", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );
  const foundationTokens = await readFile(
    new URL("../../../packages/ui-foundation/src/tokens.css", import.meta.url),
    "utf8"
  );
  const lastRule = (pattern: RegExp) =>
    Array.from(css.matchAll(pattern)).map((match) => match.groups?.body ?? "").at(-1) ?? "";
  const lastFoundationRule = (pattern: RegExp) =>
    Array.from(foundationCss.matchAll(pattern)).map((match) => match.groups?.body ?? "").at(-1) ?? "";
  const firstFoundationRule = (pattern: RegExp) =>
    Array.from(foundationCss.matchAll(pattern)).map((match) => match.groups?.body ?? "")[0] ?? "";
  const foundationPanelRule = lastFoundationRule(
    /\.ml-workbench-panel\s*{(?<body>[^}]+)}/g
  );
  const foundationFixedMediaCardRule = firstFoundationRule(/\.ml-media-card--fixed\s*{(?<body>[^}]+)}/g);
  const foundationMediaCardFillActionRule = firstFoundationRule(
    /\.ml-media-card-fill-action\s*{(?<body>[^}]+)}/g
  );
  const foundationMediaCardCoverFillRule = firstFoundationRule(
    /\.ml-media-card-cover-fill\s*{(?<body>[^}]+)}/g
  );
  const foundationMediaCardRule = lastFoundationRule(
    /\.ml-media-card\s*{(?<body>[^}]+)}/g
  );
  const foundationMediaCardStateRule = lastFoundationRule(
    /\.ml-media-card:hover,\s*\.ml-media-card\.is-selected\s*{(?<body>[^}]+)}/g
  );
  const foundationMediaCardOverlayRule = lastFoundationRule(
    /\.ml-media-card::after\s*{(?<body>[^}]+)}/g
  );
  const foundationMediaCardCaptionRule = lastFoundationRule(
    /\.ml-media-card-caption\s*{(?<body>[^}]+)}/g
  );
  const foundationMediaCardCaptionTopRule = lastFoundationRule(
    /\.ml-media-card-caption--top\s*{(?<body>[^}]+)}/g
  );
  const foundationMediaCardTitleRule = lastFoundationRule(
    /\.ml-media-card-title\s*{(?<body>[^}]+)}/g
  );
  const foundationMediaCardMetaRule = lastFoundationRule(
    /\.ml-media-card-meta\s*{(?<body>[^}]+)}/g
  );
  const foundationMediaCardMetaStackRule = lastFoundationRule(
    /\.ml-media-card-meta-stack\s*{(?<body>[^}]+)}/g
  );
  const foundationMediaCardActionRowRule = firstFoundationRule(/\.ml-media-card-action-row\s*{(?<body>[^}]+)}/g);
  const foundationDetailPanelRule = firstFoundationRule(/\.ml-detail-panel\s*{(?<body>[^}]+)}/g);
  const foundationDetailCoverRule = firstFoundationRule(/\.ml-detail-cover\s*{(?<body>[^}]+)}/g);
  const foundationActionStackRule = lastFoundationRule(
    /\.ml-action-stack\s*{(?<body>[^}]+)}/g
  );
  const foundationActionStackButtonRule = lastFoundationRule(
    /\.ml-action-stack > \.ml-button\s*{(?<body>[^}]+)}/g
  );
  const foundationStickyActionStackRule = lastFoundationRule(
    /\.ml-sticky-action-stack\s*{(?<body>[^}]+)}/g
  );
  const foundationDetailDataListRule = firstFoundationRule(/\.ml-data-list--detail\s*{(?<body>[^}]+)}/g);
  const foundationDetailDataRowRule = firstFoundationRule(/\.ml-data-row--detail\s*{(?<body>[^}]+)}/g);
  const foundationDetailActionStackRule = firstFoundationRule(/\.ml-action-stack--detail\s*{(?<body>[^}]+)}/g);

  assert.doesNotMatch(css, /\.cutter-project-actions/);
  assert.doesNotMatch(css, /\.cutter-project-detail-actions/);
  assert.doesNotMatch(css, /\.cutter-recent-searches/);
  assert.equal(css.includes("Project Home reference implementation"), false);
  assert.equal(css.includes("/Users/huaqihang/Desktop/Mixlab/1.png"), false);
  assert.equal(css.includes('font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display"'), false);
  assert.equal(css.includes(".cutter-project-cover img"), false);
  assert.equal(css.includes(".cutter-project-detail-cover img"), false);
  assert.equal(css.includes(".cutter-project-detail-tools"), false);
  assert.equal(css.includes(".cutter-project-detail-tool"), false);
  assert.equal(css.includes(".cutter-project-card-more"), false);
  assert.equal(css.includes(".cutter-project-card::before"), false);
  assert.equal(css.includes(".cutter-project-card::after"), false);
  assert.equal(css.includes(".cutter-project-card:hover"), false);
  assert.equal(css.includes(".cutter-project-card.is-selected"), false);
  assert.equal(css.includes(".cutter-project-card-main:focus-visible"), false);
  assert.equal(css.includes(".cutter-project-card-summary strong"), false);
  assert.equal(css.includes(".cutter-project-card-summary span"), false);
  assert.match(foundationCss, /\.ml-focus-inset\.ml-focus-inset:focus-visible\s*{[^}]*outline-offset:\s*-3px/s);
  assert.equal(
    css.includes('.cutter-app[data-cutter-web-ready][data-cutter-route="project-home"] .cutter-eyebrow'),
    false
  );
  assert.equal(
    css.includes('.cutter-app[data-cutter-web-ready][data-cutter-route="project-home"] .cutter-project-hero h1'),
    false
  );
  assert.equal(
    css.includes('.cutter-app[data-cutter-web-ready][data-cutter-route="project-home"] .cutter-note'),
    false
  );
  assert.match(foundationCss, /\.ml-page-kicker--hero\s*{[^}]*font-size:\s*14px/s);
  assert.match(foundationCss, /\.ml-page-title--hero\s*{[^}]*font-size:\s*34px/s);
  assert.match(foundationCss, /\.ml-page-description--hero\s*{[^}]*line-height:\s*24px/s);
  assert.equal(css.includes('.cutter-app[data-cutter-web-ready][data-cutter-route="project-home"] .cutter-project-detail dt'), false);
  assert.equal(css.includes('.cutter-app[data-cutter-web-ready][data-cutter-route="project-home"] .cutter-project-detail dd'), false);
  assert.equal(
    css.includes(
      '.cutter-app[data-cutter-web-ready][data-cutter-route="project-home"] .cutter-project-list-panel,\n.cutter-app[data-cutter-web-ready][data-cutter-route="project-home"] .cutter-project-detail'
    ),
    false
  );
  assert.match(foundationPanelRule, /height:\s*100%/);
  assert.match(foundationPanelRule, /border:\s*0/);
  assert.match(foundationPanelRule, /border-radius:\s*0/);
  assert.match(foundationPanelRule, /background:\s*transparent/);
  assert.match(foundationPanelRule, /box-shadow:\s*none/);
  assert.doesNotMatch(foundationPanelRule, /655px/);
  assert.equal(
    Array.from(
      css.matchAll(
        /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="project-home"\] \.cutter-project-(?:card|card-main|cover|card-actions|detail|detail-cover|detail-list|detail-row|detail-controls)\s*{/g
      )
    ).length,
    0
  );
  assert.match(foundationTokens, /--ml-color-media-placeholder:/);
  assert.match(foundationTokens, /--ml-color-on-media:/);
  assert.match(foundationTokens, /--ml-color-on-media-secondary:/);
  assert.match(foundationTokens, /--ml-color-media-overlay:/);
  assert.match(foundationTokens, /--ml-color-sticky-surface:/);
  assert.match(foundationTokens, /--ml-color-sticky-surface-fade:/);
  assert.match(foundationTokens, /--ml-shadow-media:/);
  assert.match(foundationTokens, /--ml-shadow-media-strong:/);
  assert.match(foundationTokens, /--ml-radius-media:/);
  assert.match(foundationFixedMediaCardRule, /width:\s*var\(--ml-media-card-fixed-width,\s*262px\)/);
  assert.match(foundationFixedMediaCardRule, /aspect-ratio:\s*var\(--ml-media-card-fixed-ratio,\s*262\s*\/\s*220\)/);
  assert.match(foundationMediaCardFillActionRule, /position:\s*absolute/);
  assert.match(foundationMediaCardFillActionRule, /inset:\s*0/);
  assert.match(foundationMediaCardFillActionRule, /background:\s*transparent/);
  assert.match(foundationMediaCardRule, /color:\s*var\(--ml-color-on-media\)/);
  assert.match(foundationMediaCardRule, /border-radius:\s*var\(--ml-radius-media\)/);
  assert.match(foundationMediaCardRule, /background:\s*var\(--ml-color-media-placeholder\)/);
  assert.match(foundationMediaCardRule, /box-shadow:\s*var\(--ml-shadow-media\)/);
  assert.match(foundationMediaCardStateRule, /background:\s*var\(--ml-color-media-placeholder\)/);
  assert.match(foundationMediaCardStateRule, /box-shadow:\s*var\(--ml-shadow-media-strong\)/);
  assert.match(foundationMediaCardOverlayRule, /background:\s*var\(--ml-color-media-overlay\)/);
  assert.match(foundationMediaCardCoverFillRule, /position:\s*absolute/);
  assert.match(foundationMediaCardCoverFillRule, /inset:\s*0/);
  assert.doesNotMatch(foundationMediaCardCoverFillRule, /object-fit/);
  assert.match(foundationMediaCardCaptionRule, /color:\s*var\(--ml-color-on-media\)/);
  assert.match(foundationMediaCardCaptionTopRule, /right:\s*22px/);
  assert.match(foundationMediaCardTitleRule, /color:\s*var\(--ml-color-on-media\)/);
  assert.match(foundationMediaCardMetaRule, /color:\s*var\(--ml-color-on-media-secondary\)/);
  assert.match(foundationMediaCardMetaStackRule, /display:\s*grid/);
  assert.equal(css.includes(".cutter-project-card-stats span::before"), false);
  assert.equal(css.includes(".cutter-project-card-stats span:nth-child"), false);
  assert.equal(
    Array.from(
      css.matchAll(
        /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="project-home"\] \.cutter-project-card-summary \.cutter-project-card-stats span\s*{/g
      )
    ).length,
    0
  );
  assert.match(foundationMediaCardActionRowRule, /bottom:\s*var\(--ml-media-card-action-row-bottom,\s*20px\)/);
  assert.match(foundationMediaCardActionRowRule, /left:\s*var\(--ml-media-card-action-row-left,\s*22px\)/);
  assert.match(foundationDetailPanelRule, /grid-template-rows:\s*var\(--ml-detail-panel-rows,\s*auto minmax\(132px,\s*auto\) minmax\(0,\s*auto\) auto\)/);
  assert.match(foundationDetailPanelRule, /margin-left:\s*0/);
  assert.match(foundationDetailCoverRule, /max-height:\s*var\(--ml-detail-cover-max-height,\s*clamp\(132px,\s*21vh,\s*220px\)\)/);
  assert.doesNotMatch(foundationDetailCoverRule, /background:/);
  assert.doesNotMatch(foundationDetailCoverRule, /border-radius:/);
  assert.doesNotMatch(foundationDetailCoverRule, /overflow:/);
  assert.match(foundationDetailDataListRule, /height:\s*var\(--ml-data-list-detail-height,\s*168px\)/);
  assert.doesNotMatch(foundationDetailDataListRule, /margin:/);
  assert.match(foundationDetailDataRowRule, /grid-template-columns:\s*var\(--ml-data-row-detail-label,\s*112px\) minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(foundationDetailDataRowRule, /border-bottom:/);
  assert.doesNotMatch(foundationDetailDataRowRule, /font-size:/);
  assert.match(foundationDetailActionStackRule, /width:\s*var\(--ml-action-stack-detail-width,\s*362px\)/);
  assert.match(foundationDetailActionStackRule, /margin-top:\s*var\(--ml-action-stack-detail-margin-top,\s*12px\)/);
  assert.doesNotMatch(foundationDetailActionStackRule, /position:\s*sticky/);
  assert.doesNotMatch(foundationDetailActionStackRule, /background:/);
  assert.doesNotMatch(foundationDetailActionStackRule, /backdrop-filter:/);
  assert.doesNotMatch(foundationDetailActionStackRule, /padding:/);
  assert.match(foundationActionStackRule, /display:\s*grid/);
  assert.match(foundationActionStackRule, /gap:\s*8px/);
  assert.match(foundationActionStackButtonRule, /width:\s*100%/);
  assert.match(foundationActionStackButtonRule, /min-height:\s*36px/);
  assert.doesNotMatch(foundationActionStackButtonRule, /border-radius:/);
  assert.match(foundationStickyActionStackRule, /position:\s*sticky/);
  assert.match(foundationStickyActionStackRule, /background:\s*var\(--ml-color-sticky-surface-fade\),\s*var\(--ml-color-sticky-surface\)/);
  assert.match(foundationStickyActionStackRule, /backdrop-filter:\s*blur\(8px\)/);
  assert.doesNotMatch(
    [
      foundationFixedMediaCardRule,
      foundationMediaCardFillActionRule,
      foundationMediaCardCoverFillRule,
      foundationMediaCardRule,
      foundationMediaCardStateRule,
      foundationMediaCardOverlayRule,
      foundationMediaCardCaptionRule,
      foundationMediaCardCaptionTopRule,
      foundationMediaCardTitleRule,
      foundationMediaCardMetaRule,
      foundationMediaCardMetaStackRule,
      foundationMediaCardActionRowRule,
      foundationDetailPanelRule,
      foundationDetailCoverRule,
      foundationDetailDataListRule,
      foundationDetailDataRowRule,
      foundationDetailActionStackRule
    ].join("\n"),
    /#ffffff|#d8e3f3|rgba\(255,\s*255,\s*255|rgba\(42,\s*58,\s*88|rgba\(10,\s*18,\s*32|border-radius:\s*(?:9|10|12)px/
  );
});

test("generic cutter empty state visual owner moved to foundation", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );

  assert.equal(css.includes(".cutter-empty-state"), false);
  assert.match(foundationCss, /\.ml-empty-panel\s*{[^}]*min-height:\s*180px/s);
  assert.match(foundationCss, /\.ml-empty-panel\s*{[^}]*border:\s*1px solid var\(--ml-border-subtle\)/s);
  assert.match(foundationCss, /\.ml-empty-panel > span\s*{[^}]*color:\s*var\(--ml-color-text-secondary\)/s);
  assert.doesNotMatch(
    foundationCss.match(/\.ml-empty-panel\s*{(?<body>[^}]+)}/)?.groups?.body ?? "",
    /md-sys/
  );
});

test("project home empty state uses foundation panels", () => {
  const data = fixture();
  const projectHomeHtml = renderToStaticMarkup(
    h(ProjectHomePage, {
      library: data.library,
      localClips: data.localClips,
      queue: [],
      projects: [],
      onSearch: () => undefined,
      onOpenProject: () => undefined
    })
  );

  assert.match(projectHomeHtml, /class="cutter-project-empty-state ml-empty-panel"/);
  assert.equal(projectHomeHtml.includes("cutter-empty-state"), false);
});

test("chrome project switcher exposes project actions and home return", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
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
  assert.match(activeHtml, /cutter-project-switcher ml-menu-popover/);
  assert.match(activeHtml, /class="ml-menu-popover-trigger">当前项目：5月5日<\/summary>/);
  assert.match(activeHtml, /class="ml-menu-popover-content"/);
  assert.match(activeHtml, /ml-button ml-button--ghost ml-button--sm cutter-project-switcher-action ml-menu-popover-action/);
  assert.match(activeHtml, /回到首页/);
  assert.match(activeHtml, /查看项目剪切任务/);
  assert.match(activeHtml, /重命名当前项目/);
  assert.equal(activeHtml.includes("新建搜索"), false);
  assert.match(temporaryHtml, /未选择项目/);
  assert.equal(temporaryHtml.includes("重命名当前项目"), false);
  assert.doesNotMatch(css, /\.cutter-project-switcher a,/);
  assert.doesNotMatch(css, /\.cutter-project-switcher button/);
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
  assert.match(html, /cutter-library-card ml-media-tile-card/);
  assert.match(html, /cutter-library-card-button ml-media-tile-action/);
  assert.match(html, /cutter-library-card-body ml-media-tile-body/);
  assert.match(html, /cutter-library-card-copy ml-media-tile-copy/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /cutter-public-library-scroll ml-scroll-region/);
  assert.match(html, /cutter-library-grid/);
  assert.equal(html.includes("processing"), false);
  assert.equal(html.includes("failed"), false);
  assert.equal(html.includes("编辑元数据"), false);
  assert.match(html, /cutter-local-view-toggle ml-segmented-control/);

  const portraitHtml = renderToStaticMarkup(
    h(PublicLibraryPage, {
      library,
      orientationFilter: "portrait",
      onSetOrientationFilter: () => undefined
    })
  );
  assert.match(portraitHtml, /aria-label="公共素材视频类型"/);
  assert.match(portraitHtml, /aria-pressed="true"[\s\S]*?<span class="ml-button-label">竖版<\/span>/);
  assert.match(portraitHtml, /竖版爆款开场/);
  assert.equal(portraitHtml.includes("直播复盘：从流量到现金流健康度"), false);
  assert.match(portraitHtml, /cutter-local-view-toggle ml-segmented-control/);

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
  assert.match(emptyPortraitHtml, /cutter-library-empty-state/);
  assert.match(emptyPortraitHtml, /cutter-library-empty-state ml-empty-panel/);
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
  assert.match(pagedHtml, /cutter-library-pagination cutter-public-library-pagination ml-pagination-bar/);

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

test("library cards use foundation media tile primitives instead of page-owned visuals", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url), "utf8");
  const html = renderToStaticMarkup(
    h(LibraryGallery, {
      items: [
        {
          id: "c0510",
          title: "C0510",
          image: "/covers/c0510.jpg",
          meta: "11,081 字",
          tags: ["横版"]
        }
      ]
    })
  );

  assert.equal(css.includes(".cutter-library-card > .ml-card-body"), false);
  assert.match(html, /cutter-library-grid ml-library-grid ml-library-grid--three/);
  assert.match(html, /cutter-library-card ml-media-tile-card/);
  assert.match(html, /ml-card-body is-flush cutter-library-card-body ml-media-tile-body/);
  assert.match(html, /cutter-library-card-copy ml-media-tile-copy/);
  assert.match(html, /class="ml-media-tile-title">C0510<\/strong>/);
  assert.match(html, /class="ml-media-tile-meta">11,081 字<\/span>/);
  assert.match(html, /cutter-library-card-tags ml-media-tile-tags/);
  assert.doesNotMatch(css, /^\.cutter-library-card\s*{/m);
  assert.doesNotMatch(css, /^\.cutter-library-card-body\s*{/m);
  assert.doesNotMatch(css, /^\.cutter-library-card-button\s*{/m);
  assert.doesNotMatch(css, /\.cutter-library-card-button:focus-visible/);
  assert.doesNotMatch(css, /^\.cutter-library-card-copy\s*{/m);
  assert.doesNotMatch(css, /\.cutter-library-card-copy (?:strong|span|p)/);
  assert.doesNotMatch(css, /^\.cutter-library-card-tags\s*{/m);
  assert.equal(css.includes(".cutter-library-card img"), false);
  assert.doesNotMatch(css, /^\.cutter-library-grid\s*{/m);
  assert.match(foundationCss, /\.ml-media-tile-card\s*{[^}]*overflow:\s*hidden/s);
  assert.match(foundationCss, /\.ml-library-grid\s*{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(216px,\s*1fr\)\)/s);
  assert.match(foundationCss, /\.ml-library-grid--three\s*{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(foundationCss, /\.ml-media-tile-body,\s*\.ml-media-tile-action\s*{[^}]*display:\s*grid/s);
  assert.match(foundationCss, /\.ml-media-tile-copy\s*{[^}]*padding:\s*12px/s);
  assert.match(foundationCss, /\.ml-media-tile-title\s*{[^}]*color:\s*var\(--ml-color-text\)/s);
  assert.match(foundationCss, /\.ml-media-tile-meta\s*{[^}]*color:\s*var\(--ml-color-text-secondary\)/s);
  assert.match(foundationCss, /\.ml-media-tile-tags\s*{[^}]*gap:\s*6px/s);
  assert.match(foundationCss, /\.ml-media-frame--16x9\s*{[^}]*aspect-ratio:\s*16 \/ 9/s);
  assert.match(html, /class="ml-media-frame ml-media-frame--16x9 ml-media-fill"/);
});

test("library empty and pagination states use shared library visual owners", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url), "utf8");

  assert.match(foundationCss, /\.ml-empty-panel\s*{[^}]*min-height:\s*180px/s);
  assert.match(foundationCss, /\.ml-empty-panel\s*{[^}]*border:\s*1px solid var\(--ml-border-subtle\)/s);
  assert.match(foundationCss, /\.ml-empty-panel\s*{[^}]*border-radius:\s*var\(--ml-radius-panel\)/s);
  assert.match(
    foundationCss,
    /\.ml-empty-panel\s*{[^}]*background:\s*color-mix\(in srgb, var\(--ml-color-surface\) 62%, transparent\)/s
  );
  assert.match(foundationCss, /\.ml-pagination-bar\s*{[^}]*display:\s*flex/s);
  assert.match(foundationCss, /\.ml-pagination-bar\s*{[^}]*justify-content:\s*center/s);
  assert.match(foundationCss, /\.ml-pagination-bar\s*{[^}]*border:\s*1px solid var\(--ml-border-subtle\)/s);
  assert.match(foundationCss, /\.ml-pagination-bar\s*{[^}]*border-radius:\s*var\(--ml-radius-panel\)/s);
  assert.match(
    foundationCss,
    /\.ml-pagination-bar\s*{[^}]*background:\s*color-mix\(in srgb, var\(--ml-color-surface\) 62%, transparent\)/s
  );
  assert.doesNotMatch(css, /\.cutter-library-empty-state\s*{/);
  assert.doesNotMatch(css, /\.cutter-library-empty-state\s+(strong|span)/);
  assert.doesNotMatch(css, /\.cutter-library-pagination\s*{/);
  assert.doesNotMatch(css, /\.cutter-library-pagination\s+span/);
  assert.equal(css.includes(".cutter-local-empty-state"), false);
  assert.equal(css.includes(".cutter-public-library-pagination {"), false);
});

test("library view toggles use foundation shell tokens instead of route overrides", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url), "utf8");
  const routeOverrideRule =
    css.match(
      /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-cut-mode-toggle,[\s\S]*?\.cutter-settings-doctor\s*{(?<body>[^}]+)}/
    )?.[0] ?? "";

  assert.match(foundationCss, /\.ml-segmented-control\s*{[^}]*border:\s*1px solid var\(--ml-border-subtle\)/s);
  assert.match(foundationCss, /\.ml-segmented-control\s*{[^}]*display:\s*inline-flex/s);
  assert.match(foundationCss, /\.ml-segmented-control\s*{[^}]*align-items:\s*center/s);
  assert.match(foundationCss, /\.ml-segmented-control\s*{[^}]*border-radius:\s*var\(--ml-radius-panel\)/s);
  assert.match(
    foundationCss,
    /\.ml-segmented-control\s*{[^}]*background:\s*color-mix\(in srgb, var\(--ml-color-surface\) 70%, transparent\)/s
  );
  assert.doesNotMatch(css, /\.cutter-local-view-toggle\s*{/);
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="local-library"\] \.cutter-local-view-toggle/
  );
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="public-library"\] \.cutter-local-view-toggle/
  );
  assert.doesNotMatch(routeOverrideRule, /cutter-local-view-toggle/);
  assert.doesNotMatch(css, /^\.cutter-local-view-toggle\s*{/m);
  assert.doesNotMatch(css, /\.cutter-local-view-toggle,\s*\.cutter-cut-mode-toggle/);
});

test("dead form surface styles are removed from cutter production css", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.equal(css.includes("ml-form"), false);
  assert.equal(css.includes("ml-grouped-form"), false);
});

test("dead cutter layout utility styles are removed from production css", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  for (const selector of [
    ".cutter-filter-select",
    ".cutter-video-empty",
    ".cutter-video-frame",
    ".cutter-video-scrim",
    ".cutter-video-time",
    ".cutter-video-progress",
    ".cutter-gallery",
    ".cutter-search-options",
    ".cutter-queue-top-action",
    ".cutter-local-toolbar"
  ]) {
    assert.equal(css.includes(selector), false, `${selector} should not remain without DOM usage`);
  }
});

test("legacy Material form and focus overrides are removed from cutter production css", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationTokens = await readFile(new URL("../../../packages/ui-foundation/src/tokens.css", import.meta.url), "utf8");

  assert.equal(
    css.includes(".cutter-project-switcher summary,\n.cutter-login-panel input,"),
    false
  );
  assert.equal(css.includes("var(--md-sys-shape-corner-extra-small)"), false);
  assert.equal(
    css.includes(
      "outline: 3px solid color-mix(in srgb, var(--md-sys-color-primary) 40%, transparent)"
    ),
    false
  );
  assert.doesNotMatch(css, /\.cutter-app input:not\(\.ml-field-input\):not\(\.ml-search-box-input\),/);
  assert.doesNotMatch(css, /\.cutter-app button:focus-visible,/);
  assert.doesNotMatch(css, /\.cutter-app input,\s*\.cutter-app select,\s*\.cutter-app textarea\s*{/);
  assert.match(
    foundationTokens,
    /\[data-appearance-mode\] input:not\(\.ml-field-input\):not\(\.ml-search-box-input\),\s*\[data-appearance-mode\] select:not\(\.ml-field-input\):not\(\.ml-field-select\),\s*\[data-appearance-mode\] textarea:not\(\.ml-field-input\)\s*{[^}]*background:\s*var\(--ml-color-control\)/s
  );
  assert.match(
    foundationTokens,
    /\[data-appearance-mode\] :where\(button,\s*a,\s*input,\s*select,\s*textarea\):focus-visible\s*{[^}]*outline:\s*2px solid color-mix\(in srgb, var\(--ml-color-accent\) 48%, transparent\)/s
  );
  assert.equal(css.includes(".cutter-project-rename-field input"), false);
  assert.doesNotMatch(css, /\.cutter-app input,[\s\S]*?\.cutter-appearance-select,[\s\S]*?\.cutter-project-rename-field input/);
});

test("legacy Material panel overrides are removed from cutter production css", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.equal(
    css.includes("border: 1px solid var(--md-sys-color-outline-variant)"),
    false
  );
  assert.equal(
    css.includes("background: var(--md-sys-color-surface-container-lowest)"),
    false
  );
  assert.equal(
    css.includes("border-radius: var(--md-sys-shape-corner-medium)"),
    false
  );
  assert.equal(css.includes(".cutter-source-detail .cutter-transcript"), false);
  assert.doesNotMatch(css, /\.cutter-login-panel,\s*\.cutter-app \.ml-media-panel/);
  assert.doesNotMatch(css, /\.cutter-app \.ml-media-panel\s*{/);
  assert.doesNotMatch(css, /\.cutter-login-panel,\s*\.cutter-desktop-setup-card/);
  assert.doesNotMatch(css, /\.cutter-desktop-diagnostics,\s*\.cutter-app \.ml-media-panel/);
});

test("desktop first-run surfaces use foundation cards instead of private panel chrome", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );
  const html = renderToStaticMarkup(
    h(DesktopFirstRunPage, {
      config: {
        api_host: "127.0.0.1",
        api_port: 3789,
        public_library_root: "",
        local_workspace_root: ""
      },
      stage: "choose-public-library",
      diagnostics: {
        app_version: "0.18.10",
        stage: "choose-public-library",
        api_address: "http://127.0.0.1:3789"
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

  assert.match(html, /cutter-desktop-first-run ml-entry-surface/);
  assert.match(html, /cutter-desktop-first-run-shell ml-entry-shell/);
  assert.match(html, /cutter-desktop-first-run-header ml-card ml-entry-header/);
  assert.match(html, /cutter-desktop-setup-grid ml-entry-step-grid/);
  assert.match(html, /cutter-desktop-setup-card ml-card ml-entry-step-card/);
  assert.match(html, /cutter-desktop-check-list ml-card ml-check-list is-empty/);
  assert.match(html, /cutter-desktop-diagnostics ml-card ml-diagnostics-panel/);
  assert.match(html, /cutter-desktop-diagnostic-actions ml-entry-actions/);
  assert.match(foundationCss, /\.ml-entry-surface\s*{[^}]*padding:\s*32px/s);
  assert.match(foundationCss, /\.ml-entry-step-grid\s*{[^}]*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(foundationCss, /\.ml-check-list\s*{[^}]*overflow:\s*hidden/s);
  assert.match(foundationCss, /\.ml-diagnostics-panel\s*{[^}]*display:\s*grid/s);
  assert.doesNotMatch(
    css,
    /\.cutter-desktop-first-run-header,\s*\.cutter-desktop-setup-card,\s*\.cutter-desktop-check-list,\s*\.cutter-desktop-diagnostics\s*{/
  );
  assert.doesNotMatch(css, /\.cutter-desktop-(?:first-run|setup|check|diagnostics|diagnostic)[^{]*\s*{/);
  assert.doesNotMatch(css, /\.cutter-desktop-setup-card,\s*\.cutter-desktop-diagnostics/);
  assert.doesNotMatch(css, /\.cutter-desktop-diagnostics,\s*\.cutter-app \.ml-media-panel/);
});

test("legacy compact text and source detail panel owners are removed from cutter production css", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );
  const documentPanelRule =
    foundationCss.match(/\.ml-document-panel\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const documentMediaRule =
    foundationCss.match(/\.ml-document-media-panel\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const documentTextRule =
    foundationCss.match(/\.ml-document-full-text\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  assert.equal(
    css.includes(
      ".cutter-page-header p,\n.cutter-note,\n.cutter-inspector-stack,\n.cutter-source-detail .cutter-full-text"
    ),
    false
  );
  assert.equal(css.includes(".cutter-page-header p,\n.cutter-page-header span,\n.cutter-note"), false);
  assert.equal(css.includes(".cutter-page-header h1 {\n  margin: 0;"), false);
  assert.equal(css.includes(".cutter-inspector-stack"), false);
  assert.doesNotMatch(css, /\.(cutter-note|cutter-section-heading|cutter-search-form)\b/);
  assert.equal(
    css.includes(
      ".cutter-eyebrow {\n  color: var(--ml-color-text-tertiary);\n  font-size: 11px;"
    ),
    false
  );
  assert.equal(
    css.includes(
      ".cutter-source-detail .cutter-video-panel {\n  overflow: hidden;\n  border: 1px solid var(--ml-color-separator);"
    ),
    false
  );
  assert.equal(
    css.includes(
      ".cutter-source-detail .cutter-transcript {\n  overflow: hidden;\n  border: 1px solid var(--ml-color-separator);"
    ),
    false
  );
  assert.equal(css.includes(".cutter-source-detail .cutter-full-text"), false);
  assert.equal(css.includes(".cutter-source-detail .cutter-video-panel"), false);
  assert.equal(css.includes(".cutter-source-detail .cutter-transcript"), false);
  assert.match(documentMediaRule, /border:\s*1px solid var\(--ml-color-border\)/);
  assert.match(documentMediaRule, /background:\s*#0e1218/);
  assert.match(documentPanelRule, /border:\s*1px solid var\(--ml-color-border\)/);
  assert.match(documentPanelRule, /background:\s*var\(--ml-color-surface\)/);
  assert.match(documentTextRule, /color:\s*var\(--ml-color-text-secondary\)/);
  assert.match(documentTextRule, /font-size:\s*14px/);
  assert.match(foundationCss, /\.ml-page-description\.ml-page-description\s*{[^}]*color:\s*var\(--ml-color-text-secondary\)[^}]*line-height:\s*23px/s);
});

test("low-risk page families share the same page header typography owner", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );
  const sharedHeaderRule =
    css.match(
      /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="local-library"\] \.cutter-page-header,\s*\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="public-library"\] \.cutter-page-header,\s*\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-operational-page \.cutter-page-header,\s*\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="cut-tasks"\] \.cutter-page-header\s*{(?<body>[^}]+)}/
    )?.groups?.body ?? "";
  const foundationHeaderRule =
    foundationCss.match(/\.ml-workbench-header\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  assert.equal(sharedHeaderRule, "");
  assert.match(foundationHeaderRule, /min-height:\s*76px/);
  assert.match(foundationHeaderRule, /display:\s*flex/);
  assert.match(foundationHeaderRule, /justify-content:\s*space-between/);
  assert.match(foundationHeaderRule, /gap:\s*20px/);
  assert.match(foundationHeaderRule, /background:\s*transparent/);
  assert.doesNotMatch(css, /(?:^|\n)\.cutter-page-header\s*{/);
  assert.doesNotMatch(css, /(?:^|\n)\.cutter-page-header > div:first-child\s*{/);
  assert.equal(css.includes(".cutter-page-header h1 {\n  margin: 0;"), false);
  assert.equal(css.includes(".cutter-page-header p,\n.cutter-page-header span"), false);
  assert.equal(
    css.includes('[data-cutter-route="local-library"] .cutter-page-header h1'),
    false
  );
  assert.equal(
    css.includes('[data-cutter-route="local-library"] .cutter-page-header p'),
    false
  );
  assert.match(foundationCss, /\.ml-page-title\.ml-page-title\s*{[^}]*font-size:\s*30px[^}]*line-height:\s*40px/s);
  assert.match(foundationCss, /\.ml-page-description\.ml-page-description\s*{[^}]*margin:\s*10px 0 0[^}]*line-height:\s*23px/s);
  assert.equal(
    css.includes('[data-cutter-route="cut-tasks"] .cutter-page-header h1 {\n  font-size: 28px;'),
    false
  );
  assert.equal(
    css.includes('[data-cutter-route="cut-tasks"] .cutter-page-header p {\n  margin-top: 6px;'),
    false
  );
});

test("runtime gate action buttons use UI Foundation instead of page-local button styles", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );
  const loginHtml = renderToStaticMarkup(
    h(CutterLoginGate, {
      status: "unknown",
      onLogin: async () => undefined,
      onRegister: async () => undefined,
      children: h("p", null, "工作台内容")
    })
  );
  const desktopHtml = renderToStaticMarkup(
    h(DesktopFirstRunPage, {
      config: {
        api_host: "127.0.0.1",
        api_port: 3789,
        public_library_root: "",
        local_workspace_root: ""
      },
      stage: "choose-public-library",
      onChoosePublicLibrary: () => undefined,
      onChooseLocalWorkspace: () => undefined,
      onRunDoctor: () => undefined,
      onStartEngine: () => undefined,
      onRetry: () => undefined,
      onCopyDiagnostics: () => undefined,
      onOpenLogDirectory: () => undefined
    })
  );

  for (const selector of [
    ".cutter-login-panel button",
    ".cutter-login-tabs button",
    ".cutter-desktop-setup-card button",
    ".cutter-desktop-diagnostic-actions button"
  ]) {
    assert.equal(css.includes(selector), false, `${selector} should not own button visuals`);
  }
  assert.match(loginHtml, /ml-button ml-button--primary/);
  assert.match(loginHtml, /ml-button ml-button--ghost/);
  assert.match(loginHtml, /cutter-login-gate ml-auth-gate/);
  assert.match(loginHtml, /cutter-login-panel ml-card ml-auth-panel/);
  assert.match(loginHtml, /cutter-login-tabs ml-segmented-control ml-segmented-control--equal/);
  assert.match(loginHtml, /cutter-login-field ml-form-field/);
  assert.match(loginHtml, /<input class="ml-field-input"[^>]*name="username"/);
  assert.match(loginHtml, /<input class="ml-field-input"[^>]*name="password"/);
  assert.match(foundationCss, /\.ml-auth-gate\s*{[^}]*place-items:\s*center/s);
  assert.match(foundationCss, /\.ml-auth-panel\s*{[^}]*width:\s*min\(420px,\s*calc\(100vw - 48px\)\)/s);
  assert.equal(css.includes(".cutter-login-tabs .ml-button"), false);
  assert.equal(css.includes(".cutter-login-panel input"), false);
  assert.doesNotMatch(css, /\.cutter-login-(?:gate|panel|tabs|field)[^{]*\s*{/);
  assert.doesNotMatch(css, /\.cutter-login-panel\s*{[^}]*border:/);
  assert.doesNotMatch(css, /\.cutter-login-panel\s*{[^}]*background:/);
  assert.doesNotMatch(css, /\.cutter-login-panel\s*{[^}]*box-shadow:/);
  assert.match(desktopHtml, /ml-button ml-button--secondary/);
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
  assert.match(html, /cutter-source-detail ml-workbench-page/);
  assert.match(html, /cutter-page-main ml-workbench-main ml-workbench-main--stack ml-scroll-region/);
  assert.match(html, /cutter-page-header ml-workbench-header/);
  assert.match(html, /ml-inspector--workbench ml-workbench-inspector/);
  assert.match(html, /cutter-video-panel ml-document-media-panel/);
  assert.match(html, /class="ml-document-media-video"/);
  assert.match(html, /class="ml-document-media-meta"/);
  assert.match(html, /cutter-transcript ml-document-panel/);
  assert.match(html, /class="ml-document-panel-header"/);
  assert.match(html, /class="ml-document-panel-meta"/);
  assert.match(html, /cutter-full-text ml-document-full-text/);
  assert.match(html, /cutter-segment-list ml-segment-list/);
  assert.match(html, /cutter-segment ml-segment-row/);
  assert.match(html, /class="ml-segment-time"/);
  assert.match(html, /class="ml-segment-text"/);
  assert.match(html, /class="ml-segment-action"/);
  assert.match(html, /data-selection-mode="continuous"/);
  assert.match(html, /is-highlighted/);
  assert.match(html, new RegExp(`${data.primaryDetail.title} 片段`));
  assert.equal(html.includes("关键帧"), false);
  assert.equal(html.includes("现金流短片开场"), false);
});

test("source detail transcript segment rows use foundation visual owners", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );
  const segmentStateRule =
    foundationCss.match(/\.ml-segment-row:hover,\s*\.ml-segment-row\.is-highlighted,\s*\.ml-segment-row\.is-selected\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  assert.equal(Array.from(css.matchAll(/\.cutter-segment-list\s*{/g)).length, 0);
  assert.equal(Array.from(css.matchAll(/\.cutter-segment\s*{/g)).length, 0);
  assert.match(foundationCss, /\.ml-segment-list\s*{[^}]*display:\s*grid[^}]*padding:\s*12px/s);
  assert.match(foundationCss, /\.ml-segment-row\s*{[^}]*grid-template-columns:\s*64px minmax\(0,\s*1fr\) auto/s);
  assert.match(segmentStateRule, /border-color:\s*color-mix\(in srgb, var\(--ml-color-accent\) 40%, transparent\)/);
  assert.match(segmentStateRule, /background:\s*var\(--ml-color-selected\)/);
  assert.equal(css.includes("box-shadow: inset 3px 0 0 #f5a524"), false);
  assert.equal(css.includes("grid-template-columns: 58px minmax(0, 1fr) 72px"), false);
});

test("source detail media and transcript panels use foundation visual owners", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );

  assert.equal(Array.from(css.matchAll(/(?:^|,|\n)\s*\.cutter-video-panel\s*{/g)).length, 0);
  assert.equal(Array.from(css.matchAll(/(?:^|,|\n)\s*\.cutter-video-panel video\s*{/g)).length, 0);
  assert.equal(Array.from(css.matchAll(/(?:^|,|\n)\s*\.cutter-transcript\s*{/g)).length, 0);
  assert.equal(Array.from(css.matchAll(/(?:^|,|\n)\s*\.cutter-full-text\s*{/g)).length, 0);
  assert.doesNotMatch(css, /\.cutter-source-detail \.cutter-video-panel\s*{/);
  assert.doesNotMatch(css, /\.cutter-source-detail \.cutter-video-panel video\s*{/);
  assert.doesNotMatch(css, /\.cutter-source-detail \.cutter-transcript\s*{/);
  assert.doesNotMatch(css, /\.cutter-source-detail \.cutter-full-text\s*{/);
  assert.match(foundationCss, /\.ml-document-media-panel\s*{/);
  assert.match(foundationCss, /\.ml-document-media-video\s*{/);
  assert.match(foundationCss, /\.ml-document-panel\s*{/);
  assert.match(foundationCss, /\.ml-document-full-text\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-video-panel\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-video-panel video\s*{/);
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
  assert.ok(html.includes("cutter-locator-queue-notice ml-pane-notice ml-pane-notice--success"));
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
  assert.match(html, new RegExp(`<small class="ml-media-row-subtle">${publicTranscriptLength.toLocaleString()} 字</small>`));
  assert.ok(html.includes(`<small class="ml-media-row-subtle">32:15 · 命中 8</small>`));
  assert.equal(html.includes(`<small>文案 ${publicTranscriptLength.toLocaleString()} 字</small>`), false);
  assert.ok(html.includes("命中 3"));
  assert.match(html, /class="cutter-locator-result ml-media-row is-selected"/);
  assert.ok(html.includes("ml-media-row-thumb"));
  assert.equal(html.includes("cutter-cover-placeholder"), false);
  assert.ok(html.includes("ml-media-row-title"));
  assert.ok(html.includes("ml-media-row-meta"));
  assert.ok(html.includes("ml-media-row-subtle"));
  assert.ok(html.includes("cutter-locator-results ml-pane-scroll"));
  assert.ok(html.includes("cutter-locator-result-list ml-media-row-list ml-list-body--compact-inset"));
  assert.ok(html.includes("cutter-locator-load-more-status ml-list-footer-note"));
  assert.ok(html.includes("cutter-locator-candidates ml-list-panel"));
  assert.ok(html.includes("class=\"ml-list-panel-header\""));
  assert.ok(html.includes("class=\"ml-list-panel-heading\""));
  assert.ok(html.includes("cutter-locator-command ml-command-row"));
  assert.ok(html.includes("cutter-locator-command-header ml-command-row-header"));
  assert.ok(html.includes("cutter-locator-search-form ml-command-row-form"));
  assert.equal(html.includes("<em>"), false);
  assert.equal(html.includes('name="sourceFilter"'), false);
  assert.equal(html.includes('name="orientationFilter"'), false);
  assert.ok(html.includes('data-layout="search-select-cut"'));
  assert.ok(html.includes('data-page="material-locator"'));
  assert.ok(html.includes('data-product-page="material-search"'));
  assert.ok((html.match(/class="ml-section-title ml-section-title--dense"/g) ?? []).length >= 4);
  assert.ok((html.match(/class="ml-section-meta"/g) ?? []).length >= 2);
  assert.ok((html.match(/class="cutter-locator-section ml-section-group"/g) ?? []).length >= 1);
  assert.ok((html.match(/class="ml-section-group-title"/g) ?? []).length >= 1);
  assert.match(html, /class="ml-search-box cutter-locator-search-form ml-command-row-form"/);
  assert.equal(html.includes("cutter-search-box"), false);
  assert.equal(html.includes("cutter-empty-state"), false);
  assert.match(html, /class="ml-button ml-button--ghost ml-button--sm cutter-hit-nav-button"/);
  assert.equal(html.includes("<video"), false);
  assert.ok(html.includes('data-testid="locator-video-poster"'));
  assert.equal(html.includes('data-testid="select-current-hit"'), false);
  assert.equal(html.includes('data-testid="selection-proof-strip"'), false);
  assert.equal(html.includes("ml-video-poster ml-video-poster--reference"), true);
  assert.equal(html.includes("cutter-video-poster-frame"), false);
  assert.equal(html.includes("cutter-video-poster-controls"), false);
  assert.equal(html.includes("cutter-video-empty"), false);
  assert.ok(html.includes("cutter-locator-visual ml-pane-shell ml-pane-section ml-pane-section--media"));
  assert.ok(html.includes("ml-pane-header is-hidden"));
  assert.ok(html.includes("cutter-video-panel ml-media-frame ml-media-frame--fill"));
  assert.ok(html.includes("class=\"ml-media-frame-inner\""));
  assert.equal(html.includes("cutter-video-frame"), false);
  assert.ok(html.includes("cutter-locator-cut-panel ml-pane-shell ml-pane-section ml-pane-section--detail"));
  assert.ok(html.includes("class=\"ml-pane-header\""));
  assert.ok(html.includes("cutter-locator-cut-selection ml-pane-body"));
  assert.ok(html.includes("cutter-locator-selected-copy ml-selected-copy"));
  assert.ok(html.includes("cutter-locator-queue-panel ml-pane-shell"));
  assert.ok(html.includes("ml-pane-header ml-pane-header--compact ml-pane-header--split"));
  assert.equal(html.includes("<small>来源</small><strong>公共原素材</strong>"), false);
  assert.equal(html.includes("<small>命中</small><strong>1/3</strong>"), false);
  assert.doesNotMatch(html, /<small>字数<\/small><strong>\d+ 字<\/strong>/);
  assert.equal(html.includes("cutter-floating-selection-bar"), false);
  assert.equal(html.includes("cutter-compact-selection-bar"), false);
  assert.ok(html.includes("cutter-natural-transcript ml-transcript-panel"));
  assert.ok(html.includes("ml-transcript-panel-header"));
  assert.ok(html.includes("cutter-transcript-heading ml-transcript-heading"));
  assert.ok(html.includes("cutter-hit-navigation ml-transcript-actions"));
  assert.ok(html.includes("cutter-transcript-body ml-transcript-body"));
  assert.ok(html.includes("cutter-transcript-row"));
  assert.ok(html.includes("ml-transcript-row"));
  assert.ok(html.includes("cutter-transcript-time"));
  assert.ok(html.includes("ml-transcript-time"));
  assert.ok(html.includes("ml-transcript-text"));
  assert.ok(html.includes("cutter-locator-queue-table"));
  assert.ok(html.includes("cutter-locator-queue-table ml-compact-table"));
  assert.ok(html.includes("cutter-locator-queue-head ml-compact-table-head"));
  assert.ok(html.includes("cutter-locator-queue-row ml-compact-table-row"));
  assert.match(html, /class="ml-badge is-warning">等待中<\/span>/);
  assert.match(html, /class="ml-badge is-info">剪切中<\/span>/);
  assert.match(html, /class="ml-badge is-success">已完成<\/span>/);
  assert.match(html, /class="ml-badge is-danger">失败<\/span>/);
  assert.match(html, /class="ml-button ml-button--ghost ml-button--sm cutter-queue-all-action"/);
  assert.ok(html.includes('/fixture-media/design-material-video-frame.png'));
  assert.ok(html.includes("已选 19 秒"));
  assert.doesNotMatch(html, /<button[^>]*>复制<\/button>/);
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
  assert.match(html, /<button[^>]+class="[^"]*\bcutter-transcript-time\b[^"]*\bml-transcript-time\b[^"]*"[^>]+data-transcript-time-selector="true"/);
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

test("workbench reload keeps cached public library cards when the route does not request them", () => {
  const data = createFixtureCutterData();
  const routeReload = {
    ...data,
    library: {
      ...data.library,
      videos: []
    },
    search: emptySearchResponse()
  };

  const merged = mergeMaterialLocatorReloadData(data, routeReload, "");

  assert.equal(merged.library.videos.length, data.library.videos.length);
  assert.equal(merged.library.available_video_count, routeReload.library.available_video_count);
});

test("recoverable cutter refresh errors do not replace an already rendered workbench", () => {
  assert.equal(
    shouldRenderGlobalCutterError({
      error: "Internal server error",
      hasData: false
    }),
    true
  );
  assert.equal(
    shouldRenderGlobalCutterError({
      error: "Internal server error",
      hasData: true
    }),
    false
  );
  assert.equal(
    shouldRenderGlobalCutterError({
      error: "",
      hasData: false
    }),
    false
  );
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
  assert.equal(html.includes("cutter-locator-result ml-media-row is-selected"), false);
  assert.ok(html.includes("cutter-locator-empty-state"));
  assert.ok(html.includes("cutter-locator-video-empty"));
  assert.ok((html.match(/ml-empty-panel ml-empty-panel--plain/g) ?? []).length >= 1);
  assert.ok(html.includes("ml-empty-panel--plain ml-empty-panel--fill"));
  assert.ok(html.includes("cutter-transcript-empty ml-empty-panel ml-empty-panel--subtle ml-empty-panel--fill"));
  assert.equal(html.includes("cutter-empty-state"), false);
  assert.equal(html.includes("cutter-video-empty"), false);
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
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );
  const materialRule = css.match(/\.cutter-material-locator \.cutter-selection-bar\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const floatingAnchorRule =
    foundationCss.match(/\.ml-floating-selection-anchor\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const floatingActionBarRule = foundationCss.match(/\.ml-floating-action-bar\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const labelRule = foundationCss.match(/\.ml-floating-action-label\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  assert.equal(materialRule, "");
  assert.match(floatingAnchorRule, /position:\s*fixed/);
  assert.match(floatingAnchorRule, /z-index:\s*50/);
  assert.match(floatingAnchorRule, /transform:\s*translate\(-50%,\s*calc\(-100% - 10px\)\)/);
  assert.match(floatingActionBarRule, /display:\s*inline-flex/);
  assert.match(floatingActionBarRule, /max-width:\s*min\(360px,\s*calc\(100vw - 32px\)\)/);
  assert.match(floatingActionBarRule, /min-height:\s*34px/);
  assert.match(floatingActionBarRule, /padding:\s*4px 5px 4px 10px/);
  assert.match(labelRule, /font-size:\s*12px/);
  assert.match(labelRule, /line-height:\s*16px/);
  assert.match(labelRule, /text-overflow:\s*ellipsis/);
  assert.equal(css.includes(".cutter-selection-bar button"), false);
  assert.equal(css.includes(".cutter-selection-bar .ml-button"), false);
  assert.equal(css.includes(".cutter-selection-bar strong"), false);
  assert.equal(css.includes(".cutter-compact-selection-bar"), false);
});

test("material locator floating selection bar uses theme colors in dark mode", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );
  const materialRule = css.match(/\.cutter-material-locator \.cutter-selection-bar\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const floatingActionBarRule = foundationCss.match(/\.ml-floating-action-bar\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  assert.equal(materialRule, "");
  assert.match(floatingActionBarRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-surface\) 94%,\s*#000000\)/);
  assert.match(floatingActionBarRule, /box-shadow:\s*0 14px 34px rgba\(0,\s*0,\s*0,\s*0\.28\)/);
});

test("material locator keeps search and review areas fixed while transcript scrolls independently", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );
  const lastRule = (pattern: RegExp) =>
    Array.from(css.matchAll(pattern)).map((match) => match.groups?.body ?? "").at(-1) ?? "";
  const lastFoundationRule = (pattern: RegExp) =>
    Array.from(foundationCss.matchAll(pattern)).map((match) => match.groups?.body ?? "").at(-1) ?? "";

  const pageMainRule = Array.from(css.matchAll(/\.cutter-material-locator \.cutter-page-main\s*{(?<body>[^}]+)}/g))
    .map((match) => match.groups?.body ?? "")
    .find((body) => body.includes("grid-template-columns: 256px")) ?? "";
  const materialPageRule = lastRule(/\.cutter-material-locator\s*{(?<body>[^}]+)}/g);
  const commandPanelRule = Array.from(css.matchAll(/\.cutter-material-locator \.cutter-locator-command\s*{(?<body>[^}]+)}/g))
    .map((match) => match.groups?.body ?? "")
    .find((body) => body.includes("grid-column: 1 / 3")) ?? "";
  const locatorCommandRule = lastRule(/\.cutter-material-locator \.cutter-locator-command-header\s*{(?<body>[^}]+)}/g);
  const searchFormRule = lastRule(/\.cutter-material-locator \.cutter-locator-search-form\s*{(?<body>[^}]+)}/g);
  const candidatePanelRule = lastRule(/\.cutter-material-locator \.cutter-locator-candidates\s*{(?<body>[^}]+)}/g);
  const candidateHeaderRule = lastRule(/\.cutter-material-locator \.cutter-locator-candidates > header\s*{(?<body>[^}]+)}/g);
  const locatorResultsRule = lastRule(/\.cutter-material-locator \.cutter-locator-results\s*{(?<body>[^}]+)}/g);
  const resultListRule = lastRule(/\.cutter-material-locator \.cutter-locator-result-list\s*{(?<body>[^}]+)}/g);
  const loadMoreRule = lastRule(/\.cutter-material-locator \.cutter-locator-load-more\.ml-button\s*{(?<body>[^}]+)}/g);
  const loadMoreStatusRule = lastRule(/\.cutter-material-locator \.cutter-locator-load-more-status\s*{(?<body>[^}]+)}/g);
  const workbenchRule = Array.from(css.matchAll(/\.cutter-material-locator \.cutter-locator-workbench\s*{(?<body>[^}]+)}/g))
    .map((match) => match.groups?.body ?? "")
    .find((body) => body.includes("display: contents")) ?? "";
  const sidePanelRule = Array.from(css.matchAll(/\.cutter-material-locator \.cutter-locator-side-panel\s*{(?<body>[^}]+)}/g))
    .map((match) => match.groups?.body ?? "")
    .find((body) => body.includes("grid-template-rows: 202px")) ?? "";
  const rightColumnPanelRule = lastRule(
    /\.cutter-material-locator \.cutter-locator-visual,\s*\.cutter-material-locator \.cutter-locator-cut-panel,\s*\.cutter-material-locator \.cutter-locator-queue-panel\s*{(?<body>[^}]+)}/g
  );
  const videoFrameRule = lastRule(/\.cutter-material-locator \.cutter-video-frame\s*{(?<body>[^}]+)}/g);
  const videoPanelRule = lastRule(/\.cutter-material-locator \.cutter-video-panel\s*{(?<body>[^}]+)}/g);
  const videoRule = lastRule(/\.cutter-material-locator \.cutter-video-panel video\s*{(?<body>[^}]+)}/g);
  const queuePanelRule = lastRule(/\.cutter-material-locator \.cutter-locator-queue-panel\s*{(?<body>[^}]+)}/g);
  const queueHeaderRule = lastRule(/\.cutter-material-locator \.cutter-locator-queue-panel > header\s*{(?<body>[^}]+)}/g);
  const queueNoticeRule = lastRule(/\.cutter-material-locator \.cutter-locator-queue-notice\s*{(?<body>[^}]+)}/g);
  const queueTableRule = lastRule(/\.cutter-material-locator \.cutter-locator-queue-table\s*{(?<body>[^}]+)}/g);
  const locatorTranscriptPanelRule = lastRule(/\.cutter-material-locator \.cutter-natural-transcript\s*{(?<body>[^}]+)}/g);
  const transcriptHeaderRule = lastRule(/\.cutter-material-locator \.cutter-natural-transcript > header\s*{(?<body>[^}]+)}/g);
  const transcriptHeadingRule = lastRule(/\.cutter-material-locator \.cutter-transcript-heading\s*{(?<body>[^}]+)}/g);
  const transcriptBodyRule = lastRule(/\.cutter-material-locator \.cutter-transcript-body\s*{(?<body>[^}]+)}/g);
  const foundationDenseSectionTitleRule = lastFoundationRule(
    /\.ml-section-title\.ml-section-title--dense\s*{(?<body>[^}]+)}/g
  );
  const foundationSectionMetaRule = lastFoundationRule(
    /\.ml-section-meta\s*{(?<body>[^}]+)}/g
  );
  const foundationSectionGroupRule = lastFoundationRule(/\.ml-section-group\s*{(?<body>[^}]+)}/g);
  const foundationSectionGroupHeaderRule = lastFoundationRule(/\.ml-section-group > header\s*{(?<body>[^}]+)}/g);
  const foundationSectionGroupTitleRule = lastFoundationRule(/\.ml-section-group-title\s*{(?<body>[^}]+)}/g);
  const foundationMediaRowListRule = lastFoundationRule(/\.ml-media-row-list\s*{(?<body>[^}]+)}/g);
  const foundationMediaRowRule = lastFoundationRule(/\.ml-media-row\s*{(?<body>[^}]+)}/g);
  const foundationMediaRowSelectedRule = lastFoundationRule(/\.ml-media-row\.is-selected\s*{(?<body>[^}]+)}/g);
  const foundationMediaRowMetaRule = lastFoundationRule(/\.ml-media-row-meta\s*{(?<body>[^}]+)}/g);
  const foundationMediaFrameFillRule = lastFoundationRule(/\.ml-media-frame--fill\s*{(?<body>[^}]+)}/g);
  const foundationMediaFrameInnerRule = lastFoundationRule(/\.ml-media-frame-inner\s*{(?<body>[^}]+)}/g);
  const foundationVideoPosterRule = lastFoundationRule(/\.ml-video-poster\s*{(?<body>[^}]+)}/g);
  const foundationVideoPosterReferenceRule = lastFoundationRule(/\.ml-video-poster--reference\s*{(?<body>[^}]+)}/g);
  const foundationVideoPosterOverlayRule = lastFoundationRule(/\.ml-video-poster::after\s*{(?<body>[^}]+)}/g);
  const foundationVideoPosterControlsRule = lastFoundationRule(/\.ml-video-poster-controls\s*{(?<body>[^}]+)}/g);
  const foundationVideoPosterProgressRule = lastFoundationRule(/\.ml-video-poster-progress-track\s*{(?<body>[^}]+)}/g);
  const foundationPaneShellRule = lastFoundationRule(/\.ml-pane-shell\s*{(?<body>[^}]+)}/g);
  const foundationPaneMediaRule = lastFoundationRule(/\.ml-pane-section--media\s*{(?<body>[^}]+)}/g);
  const foundationPaneDetailRule = lastFoundationRule(/\.ml-pane-section--detail\s*{(?<body>[^}]+)}/g);
  const foundationPaneHeaderRule = lastFoundationRule(/\.ml-pane-header\s*{(?<body>[^}]+)}/g);
  const foundationPaneCompactHeaderRule = lastFoundationRule(/\.ml-pane-header--compact\s*{(?<body>[^}]+)}/g);
  const foundationPaneSplitHeaderRule = lastFoundationRule(/\.ml-pane-header--split\s*{(?<body>[^}]+)}/g);
  const foundationPaneBodyRule = lastFoundationRule(/\.ml-pane-body\s*{(?<body>[^}]+)}/g);
  const foundationSelectedCopyRule = lastFoundationRule(/\.ml-selected-copy\s*{(?<body>[^}]+)}/g);
  const foundationSelectedCopyTextRule = lastFoundationRule(/\.ml-selected-copy > p\s*{(?<body>[^}]+)}/g);
  const foundationPaneScrollRule = lastFoundationRule(/\.ml-pane-scroll\s*{(?<body>[^}]+)}/g);
  const foundationListBodyInsetRule = lastFoundationRule(/\.ml-list-body--compact-inset\s*{(?<body>[^}]+)}/g);
  const foundationListFooterNoteRule = lastFoundationRule(/\.ml-list-footer-note\s*{(?<body>[^}]+)}/g);
  const foundationListFooterActionRule = lastFoundationRule(/\.ml-list-footer-action\.ml-button\s*{(?<body>[^}]+)}/g);
  const foundationListPanelRule = lastFoundationRule(/\.ml-list-panel\s*{(?<body>[^}]+)}/g);
  const foundationListPanelHeaderRule = lastFoundationRule(/\.ml-list-panel-header\s*{(?<body>[^}]+)}/g);
  const foundationListPanelHeadingRule = lastFoundationRule(/\.ml-list-panel-heading\s*{(?<body>[^}]+)}/g);
  const foundationCommandRowRule = lastFoundationRule(/\.ml-command-row\s*{(?<body>[^}]+)}/g);
  const foundationCommandRowHeaderRule = lastFoundationRule(/\.ml-command-row-header\s*{(?<body>[^}]+)}/g);
  const foundationCommandRowFormRule = lastFoundationRule(/\.ml-command-row-form\s*{(?<body>[^}]+)}/g);
  const foundationSplitPageRule = lastFoundationRule(/\.ml-split-workbench-page\s*{(?<body>[^}]+)}/g);
  const foundationSplitWorkbenchRule =
    Array.from(foundationCss.matchAll(/\.ml-split-workbench\s*{(?<body>[^}]+)}/g))
      .map((match) => match.groups?.body ?? "")
      .find((body) => body.includes("--ml-split-workbench-left")) ?? "";
  const foundationSplitCommandRule = lastFoundationRule(/\.ml-split-workbench-command\s*{(?<body>[^}]+)}/g);
  const foundationSplitFlowRule = lastFoundationRule(/\.ml-split-workbench-flow\s*{(?<body>[^}]+)}/g);
  const foundationSplitLeftRule = lastFoundationRule(/\.ml-split-workbench-left\s*{(?<body>[^}]+)}/g);
  const foundationSplitCenterRule = lastFoundationRule(/\.ml-split-workbench-center\s*{(?<body>[^}]+)}/g);
  const foundationSplitSideRule =
    Array.from(foundationCss.matchAll(/\.ml-split-workbench-side\s*{(?<body>[^}]+)}/g))
      .map((match) => match.groups?.body ?? "")
      .find((body) => body.includes("202px")) ?? "";
  const foundationFloatingSelectionAnchorRule = lastFoundationRule(/\.ml-floating-selection-anchor\s*{(?<body>[^}]+)}/g);
  const foundationQueuePanelStackRule = lastFoundationRule(/\.ml-queue-panel-stack\s*{(?<body>[^}]+)}/g);
  const foundationQueueTableFitRule = lastFoundationRule(/\.ml-queue-table-fit\s*{(?<body>[^}]+)}/g);
  const foundationPaneNoticeRule = lastFoundationRule(/\.ml-pane-notice\s*{(?<body>[^}]+)}/g);
  const foundationPaneNoticeSuccessRule = lastFoundationRule(/\.ml-pane-notice--success\s*{(?<body>[^}]+)}/g);
  const foundationEmptyPlainRule = lastFoundationRule(/\.ml-empty-panel--plain\s*{(?<body>[^}]+)}/g);
  const foundationEmptyPlainStrongRule = lastFoundationRule(/\.ml-empty-panel--plain > strong\s*{(?<body>[^}]+)}/g);
  const foundationEmptyFillRule = lastFoundationRule(/\.ml-empty-panel--fill\s*{(?<body>[^}]+)}/g);
  const foundationEmptySubtleRule = lastFoundationRule(/\.ml-empty-panel--subtle\s*{(?<body>[^}]+)}/g);
  const foundationTranscriptRowRule = lastFoundationRule(/\.ml-transcript-row\s*{(?<body>[^}]+)}/g);
  const foundationTranscriptPanelRule = lastFoundationRule(/\.ml-transcript-panel\s*{(?<body>[^}]+)}/g);
  const foundationTranscriptHeaderRule = lastFoundationRule(/\.ml-transcript-panel-header\s*{(?<body>[^}]+)}/g);
  const foundationTranscriptHeadingRule = lastFoundationRule(/\.ml-transcript-heading\s*{(?<body>[^}]+)}/g);
  const foundationTranscriptActionsRule = lastFoundationRule(/\.ml-transcript-actions\s*{(?<body>[^}]+)}/g);
  const foundationTranscriptBodyRule = lastFoundationRule(/\.ml-transcript-body\s*{(?<body>[^}]+)}/g);
  const foundationTranscriptTimeRule = lastFoundationRule(/(?:^|\n)\.ml-transcript-time\s*{(?<body>[^}]+)}/g);
  const foundationTranscriptTextRule = lastFoundationRule(/\.ml-transcript-text\s*{(?<body>[^}]+)}/g);
  const foundationTranscriptMarkRule = lastFoundationRule(/\.ml-transcript-text mark\s*{(?<body>[^}]+)}/g);
  const foundationTranscriptHoverRule = lastFoundationRule(/\.ml-transcript-row:hover\s*{(?<body>[^}]+)}/g);
  const foundationCurrentHitTranscriptRowRule = lastFoundationRule(/\.ml-transcript-row\.is-current-hit\s*{(?<body>[^}]+)}/g);
  const foundationSelectedTranscriptRowRule = lastFoundationRule(
    /\.ml-transcript-row\.is-selected,\s*\.ml-transcript-row\.is-drag-preview\s*{(?<body>[^}]+)}/g
  );
  const foundationTimeStartTranscriptRowRule = lastFoundationRule(/\.ml-transcript-row\.is-time-selection-start\s*{(?<body>[^}]+)}/g);
  const foundationTimeStartTranscriptButtonRule = lastFoundationRule(
    /\.ml-transcript-row\.is-time-selection-start \.ml-transcript-time\s*{(?<body>[^}]+)}/g
  );
  const foundationCompactTableRule = lastFoundationRule(/\.ml-compact-table\s*{(?<body>[^}]+)}/g);
  const foundationCompactTableRowRule = lastFoundationRule(
    /\.ml-compact-table-head,\s*\.ml-compact-table-row\s*{(?<body>[^}]+)}/g
  );
  const foundationCompactTableTextRule = lastFoundationRule(
    /\.ml-compact-table-row > strong,\s*\.ml-compact-table-row > small\s*{(?<body>[^}]+)}/g
  );

  assert.doesNotMatch(
    css,
    /\.(?:cutter-material-locator|cutter-locator|cutter-natural-transcript|cutter-transcript|cutter-video-panel|cutter-selection-bar)[\w-]*(?:\s|\.|>|:|,|\{)/
  );
  assert.equal(pageMainRule, "");
  assert.equal(materialPageRule, "");
  assert.match(foundationSplitPageRule, /height:\s*100%/);
  assert.match(foundationSplitPageRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(foundationSplitPageRule, /overflow:\s*hidden/);
  assert.match(foundationSplitWorkbenchRule, /height:\s*100%/);
  assert.match(foundationSplitWorkbenchRule, /grid-template-columns:\s*var\(--ml-split-workbench-left,\s*256px\)/);
  assert.match(foundationSplitWorkbenchRule, /minmax\(var\(--ml-split-workbench-center-min,\s*480px\),\s*1fr\)/);
  assert.match(foundationSplitWorkbenchRule, /var\(--ml-split-workbench-right,\s*360px\)/);
  assert.match(foundationSplitWorkbenchRule, /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(foundationSplitWorkbenchRule, /padding:\s*var\(--ml-split-workbench-padding,\s*10px 0 0\)/);
  assert.match(foundationSplitWorkbenchRule, /overflow:\s*hidden/);
  assert.equal(
    css.includes(".cutter-app[data-cutter-web-ready] .cutter-page:not(.cutter-material-locator):not(.ml-workbench-page)"),
    false
  );
  assert.equal(css.includes(".cutter-app[data-cutter-web-ready] .cutter-page,\n.cutter-app[data-cutter-web-ready] .cutter-project-board"), false);
  assert.equal(css.includes('[data-cutter-route="material-locator"] .cutter-material-locator.cutter-page'), false);
  assert.equal(css.includes('[data-cutter-route="material-locator"] .cutter-material-locator .cutter-page-main'), false);
  assert.equal(commandPanelRule, "");
  assert.match(foundationSplitCommandRule, /grid-column:\s*1 \/ 3/);
  assert.match(foundationSplitCommandRule, /grid-row:\s*1/);
  assert.equal(locatorCommandRule, "");
  assert.equal(searchFormRule, "");
  assert.match(foundationCommandRowRule, /min-height:\s*36px/);
  assert.match(foundationCommandRowRule, /padding:\s*0 20px/);
  assert.match(foundationCommandRowRule, /background:\s*transparent/);
  assert.match(foundationCommandRowHeaderRule, /display:\s*grid/);
  assert.match(foundationCommandRowHeaderRule, /gap:\s*0/);
  assert.match(foundationCommandRowFormRule, /width:\s*100%/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-command-header\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-search-form\s*{/);
  assert.equal(css.includes(".cutter-search-box"), false);
  assert.equal(css.includes(".cutter-material-locator .cutter-search-box"), false);
  assert.equal(css.includes(".cutter-material-locator .cutter-locator-search-form .ml-button"), false);
  assert.equal(candidatePanelRule, "");
  assert.match(foundationSplitLeftRule, /grid-column:\s*1/);
  assert.match(foundationSplitLeftRule, /grid-row:\s*2/);
  assert.equal(css.includes(".cutter-app:has(.cutter-material-locator) .cutter-locator-candidates"), false);
  assert.equal(candidateHeaderRule, "");
  assert.match(foundationListPanelRule, /display:\s*grid/);
  assert.match(foundationListPanelRule, /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(foundationListPanelRule, /background:\s*transparent/);
  assert.match(foundationListPanelRule, /overflow:\s*hidden/);
  assert.match(foundationListPanelHeaderRule, /display:\s*flex/);
  assert.match(foundationListPanelHeaderRule, /align-items:\s*center/);
  assert.match(foundationListPanelHeaderRule, /border-bottom:\s*0/);
  assert.match(foundationListPanelHeadingRule, /align-items:\s*baseline/);
  assert.match(foundationListPanelHeadingRule, /gap:\s*6px/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-candidates > header\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-candidates > header > div\s*{/);
  assert.match(foundationDenseSectionTitleRule, /font-size:\s*15px/);
  assert.match(foundationDenseSectionTitleRule, /line-height:\s*22px/);
  assert.match(foundationSectionMetaRule, /font-size:\s*12px/);
  assert.match(foundationSectionMetaRule, /text-overflow:\s*ellipsis/);
  assert.match(foundationSectionGroupRule, /align-content:\s*start/);
  assert.match(foundationSectionGroupHeaderRule, /min-height:\s*28px/);
  assert.match(foundationSectionGroupHeaderRule, /padding:\s*0 20px/);
  assert.match(foundationSectionGroupTitleRule, /color:\s*var\(--ml-color-accent\)/);
  assert.match(foundationSectionGroupTitleRule, /font-size:\s*12px/);
  assert.match(foundationSectionGroupTitleRule, /line-height:\s*20px/);
  assert.doesNotMatch(
    css,
    /\.cutter-material-locator \.cutter-locator-candidates h2,\s*\.cutter-material-locator \.cutter-natural-transcript h2,\s*\.cutter-material-locator \.cutter-locator-visual h2,\s*\.cutter-material-locator \.cutter-locator-cut-panel h2,\s*\.cutter-material-locator \.cutter-locator-queue-panel h2\s*{/
  );
  assert.doesNotMatch(
    css,
    /\.cutter-material-locator \.cutter-locator-candidates > header span,\s*\.cutter-material-locator \.cutter-locator-cut-panel > header span,\s*\.cutter-material-locator \.cutter-locator-queue-panel > header span\s*{/
  );
  assert.equal(locatorResultsRule, "");
  assert.match(foundationPaneScrollRule, /background:\s*transparent/);
  assert.match(foundationPaneScrollRule, /align-content:\s*start/);
  assert.match(foundationPaneScrollRule, /overflow:\s*auto/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-results,\s*\.cutter-material-locator \.cutter-locator-section\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-section > header\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-section > header h2\s*{/);
  assert.match(foundationEmptyPlainRule, /border:\s*0/);
  assert.match(foundationEmptyPlainRule, /background:\s*transparent/);
  assert.match(foundationEmptyPlainRule, /box-shadow:\s*none/);
  assert.match(foundationEmptyPlainStrongRule, /font-size:\s*14px/);
  assert.match(foundationEmptyPlainStrongRule, /line-height:\s*20px/);
  assert.match(foundationEmptyFillRule, /min-height:\s*100%/);
  assert.doesNotMatch(
    css,
    /\.cutter-material-locator \.cutter-locator-empty-state,\s*\.cutter-material-locator \.cutter-locator-video-empty\s*{/
  );
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-video-empty\s*{/);
  assert.equal(css.includes(".cutter-material-locator .cutter-empty-state"), false);
  assert.equal(css.includes(".cutter-material-locator .cutter-video-empty"), false);
  assert.match(foundationEmptySubtleRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-surface-subtle\) 28%,\s*transparent\)/);
  assert.match(foundationEmptySubtleRule, /border-radius:\s*0/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-transcript-empty\s*{/);
  assert.equal(resultListRule, "");
  assert.equal(loadMoreRule, "");
  assert.equal(loadMoreStatusRule, "");
  assert.match(foundationListBodyInsetRule, /padding:\s*0 4px 10px 14px/);
  assert.match(foundationListFooterActionRule, /width:\s*calc\(100% - 40px\)/);
  assert.match(foundationListFooterActionRule, /justify-content:\s*flex-start/);
  assert.match(foundationListFooterNoteRule, /display:\s*block/);
  assert.match(foundationListFooterNoteRule, /color:\s*var\(--ml-color-text-tertiary\)/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-result-list\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-load-more-status\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-load-more\.ml-button\s*{/);
  assert.equal(css.includes("cutter-locator-expand-button"), false);
  assert.match(foundationMediaRowListRule, /align-content:\s*start/);
  assert.match(foundationMediaRowRule, /grid-template-columns:\s*64px minmax\(0,\s*1fr\)/);
  assert.match(foundationMediaRowRule, /border-radius:\s*8px/);
  assert.match(foundationMediaRowRule, /min-height:\s*58px/);
  assert.match(foundationMediaRowRule, /box-shadow:\s*none/);
  assert.match(foundationMediaRowSelectedRule, /background:\s*var\(--ml-color-selected\)/);
  assert.match(foundationMediaRowSelectedRule, /box-shadow:\s*none/);
  assert.match(foundationMediaRowMetaRule, /justify-content:\s*flex-start/);
  assert.match(foundationMediaRowMetaRule, /gap:\s*4px/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-result\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-result\.is-selected\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-result-body\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-result-meta\s*{/);
  assert.equal(workbenchRule, "");
  assert.match(foundationSplitFlowRule, /display:\s*contents/);
  assert.equal(sidePanelRule, "");
  assert.match(foundationSplitSideRule, /grid-column:\s*3/);
  assert.match(foundationSplitSideRule, /grid-row:\s*1 \/ span 2/);
  assert.match(foundationSplitSideRule, /grid-template-rows:\s*var\(/);
  assert.match(foundationSplitSideRule, /202px minmax\(264px,\s*auto\) minmax\(0,\s*1fr\)/);
  assert.match(foundationSplitSideRule, /gap:\s*0/);
  assert.match(foundationSplitSideRule, /overflow:\s*hidden/);
  assert.match(foundationSplitSideRule, /padding:\s*0/);
  assert.match(foundationSplitSideRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-surface-subtle\) 48%,\s*transparent\)/);
  assert.equal(css.includes(".cutter-app:has(.cutter-material-locator) .cutter-locator-side-panel"), false);
  assert.equal(css.includes(".cutter-app:has(.cutter-material-locator) .cutter-locator-visual"), false);
  assert.equal(rightColumnPanelRule, "");
  assert.equal(videoFrameRule, "");
  assert.equal(videoPanelRule, "");
  assert.equal(videoRule, "");
  assert.match(foundationPaneShellRule, /border:\s*0/);
  assert.match(foundationPaneShellRule, /background:\s*transparent/);
  assert.match(foundationPaneShellRule, /overflow:\s*hidden/);
  assert.match(foundationPaneMediaRule, /grid-template-rows:\s*minmax\(0,\s*1fr\)/);
  assert.match(foundationPaneMediaRule, /padding:\s*10px 12px 8px/);
  assert.match(foundationPaneDetailRule, /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(foundationPaneHeaderRule, /min-height:\s*42px/);
  assert.match(foundationPaneHeaderRule, /padding:\s*0 12px/);
  assert.match(foundationMediaFrameFillRule, /height:\s*100%/);
  assert.match(foundationMediaFrameFillRule, /aspect-ratio:\s*auto/);
  assert.match(foundationMediaFrameInnerRule, /display:\s*block/);
  assert.match(foundationMediaFrameInnerRule, /width:\s*100%/);
  assert.match(foundationMediaFrameInnerRule, /height:\s*100%/);
  assert.match(foundationMediaFrameInnerRule, /padding:\s*0/);
  assert.match(foundationVideoPosterRule, /width:\s*100%/);
  assert.match(foundationVideoPosterRule, /height:\s*100%/);
  assert.match(foundationVideoPosterRule, /background-image:\s*var\(--ml-video-poster\)/);
  assert.match(foundationVideoPosterRule, /background-position:\s*center/);
  assert.match(foundationVideoPosterRule, /background-size:\s*cover/);
  assert.match(foundationVideoPosterReferenceRule, /background-size:\s*100% 100%/);
  assert.match(foundationVideoPosterOverlayRule, /height:\s*78px/);
  assert.match(foundationVideoPosterControlsRule, /grid-template-columns:\s*16px minmax\(0,\s*1fr\) 18px 18px 14px/);
  assert.match(foundationVideoPosterProgressRule, /height:\s*4px/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-video-poster-frame\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-video-poster-controls\s*{/);
  assert.equal(css.includes("--cutter-video-poster"), false);
  assert.equal(css.includes(".cutter-app:has(.cutter-material-locator) .cutter-shell"), false);
  assert.match(
    foundationCss,
    /@media \(max-width:\s*1180px\)[\s\S]*\.ml-split-workbench\s*{[\s\S]*height:\s*auto[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*grid-template-rows:\s*auto auto auto[\s\S]*overflow:\s*visible[\s\S]*}/
  );
  assert.match(
    foundationCss,
    /@media \(max-width:\s*1180px\)[\s\S]*\.ml-split-workbench-side\s*{[\s\S]*grid-template-rows:\s*var\(--ml-split-workbench-side-rows-mobile,\s*minmax\(220px,\s*auto\) auto auto\)[\s\S]*overflow:\s*visible[\s\S]*}/
  );
  assert.equal(queuePanelRule, "");
  assert.match(foundationQueuePanelStackRule, /grid-template-rows:\s*auto auto auto/);
  assert.match(foundationQueuePanelStackRule, /align-content:\s*start/);
  assert.equal(queueHeaderRule, "");
  assert.equal(queueNoticeRule, "");
  assert.match(foundationPaneCompactHeaderRule, /min-height:\s*38px/);
  assert.match(foundationPaneSplitHeaderRule, /justify-content:\s*space-between/);
  assert.match(foundationPaneNoticeRule, /margin:\s*0 12px 6px/);
  assert.match(foundationPaneNoticeRule, /font-size:\s*12px/);
  assert.match(foundationPaneNoticeSuccessRule, /color:\s*var\(--ml-color-ready\)/);
  assert.match(foundationPaneNoticeSuccessRule, /background:\s*var\(--ml-color-ready-soft\)/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-queue-notice\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-queue-head,\s*\.cutter-material-locator \.cutter-locator-queue-row\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-queue-row strong,/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-queue-row small/);
  assert.equal(css.includes(".cutter-queue-all-action"), false);
  assert.equal(queueTableRule, "");
  assert.match(foundationQueueTableFitRule, /width:\s*100%/);
  assert.match(foundationCompactTableRule, /align-content:\s*start/);
  assert.match(foundationCompactTableRule, /align-self:\s*start/);
  assert.match(foundationCompactTableRule, /overflow:\s*visible/);
  assert.match(foundationCompactTableRowRule, /grid-template-columns:\s*58px minmax\(0,\s*1fr\) 46px/);
  assert.match(foundationCompactTableRowRule, /border-bottom:\s*1px solid color-mix\(in srgb,\s*var\(--ml-color-border\) 28%,\s*transparent\)/);
  assert.match(foundationCompactTableTextRule, /text-overflow:\s*ellipsis/);
  assert.match(foundationCompactTableTextRule, /white-space:\s*nowrap/);
  assert.equal(locatorTranscriptPanelRule, "");
  assert.match(foundationSplitCenterRule, /grid-column:\s*2/);
  assert.match(foundationSplitCenterRule, /grid-row:\s*2/);
  assert.equal(transcriptHeaderRule, "");
  assert.equal(transcriptHeadingRule, "");
  assert.doesNotMatch(css, /\.cutter-transcript-actions\s*{/);
  assert.equal(css.includes(".cutter-hit-navigation button"), false);
  assert.equal(css.includes(".cutter-hit-nav-button.ml-button"), false);
  assert.equal(transcriptBodyRule, "");
  assert.match(foundationTranscriptPanelRule, /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(foundationTranscriptPanelRule, /min-height:\s*0/);
  assert.match(foundationTranscriptPanelRule, /overflow:\s*hidden/);
  assert.match(foundationTranscriptHeaderRule, /display:\s*block/);
  assert.match(foundationTranscriptHeaderRule, /padding:\s*0 16px/);
  assert.match(foundationTranscriptHeadingRule, /display:\s*flex/);
  assert.match(foundationTranscriptHeadingRule, /justify-content:\s*space-between/);
  assert.match(foundationTranscriptActionsRule, /display:\s*flex/);
  assert.match(foundationTranscriptActionsRule, /gap:\s*12px/);
  assert.match(foundationTranscriptBodyRule, /contain:\s*content/);
  assert.match(foundationTranscriptBodyRule, /min-height:\s*0/);
  assert.match(foundationTranscriptBodyRule, /overflow:\s*auto/);
  assert.match(foundationTranscriptRowRule, /grid-template-columns:\s*58px minmax\(0,\s*1fr\)/);
  assert.match(foundationTranscriptRowRule, /min-height:\s*0/);
  assert.match(foundationTranscriptRowRule, /padding:\s*3px 8px/);
  assert.match(foundationTranscriptTimeRule, /text-align:\s*left/);
  assert.match(foundationTranscriptTimeRule, /appearance:\s*none/);
  assert.match(foundationTranscriptTimeRule, /cursor:\s*pointer/);
  assert.match(foundationTranscriptTextRule, /font-size:\s*13px/);
  assert.match(foundationTranscriptTextRule, /line-height:\s*22px/);
  assert.match(foundationTranscriptMarkRule, /background:\s*color-mix\(in srgb,\s*#facc15 42%,\s*transparent\)/);
  assert.match(foundationTranscriptHoverRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-surface-subtle\) 48%,\s*transparent\)/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-transcript-row\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-transcript-index\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-transcript-time\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-transcript-text\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-transcript-text mark\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-transcript-row:hover\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-transcript-row\.is-current-hit\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-transcript-row\.is-selected,\s*\.cutter-material-locator \.cutter-transcript-row\.is-drag-preview\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-transcript-row\.is-time-selection-start\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-transcript-row\.is-time-selection-start \.cutter-transcript-time\s*{/);
  assert.match(foundationCurrentHitTranscriptRowRule, /background:\s*transparent/);
  assert.match(foundationSelectedTranscriptRowRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-accent\) 10%,\s*transparent\)/);
  assert.match(foundationTimeStartTranscriptRowRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-accent\) 8%,\s*transparent\)/);
  assert.match(foundationTimeStartTranscriptButtonRule, /border:\s*1px solid color-mix\(in srgb,\s*var\(--ml-color-accent\) 34%,\s*transparent\)/);
  assert.match(foundationTimeStartTranscriptButtonRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-accent\) 14%,\s*transparent\)/);
  assert.match(foundationTimeStartTranscriptButtonRule, /color:\s*var\(--ml-color-accent\)/);
});

test("material locator selected copy panel stays minimal", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );
  const selectedCopyRule = Array.from(foundationCss.matchAll(/\.ml-selected-copy\s*{(?<body>[^}]+)}/g))
    .map((match) => match.groups?.body ?? "")
    .at(-1) ?? "";
  const selectedCopyTextRule = Array.from(foundationCss.matchAll(/\.ml-selected-copy > p\s*{(?<body>[^}]+)}/g))
    .map((match) => match.groups?.body ?? "")
    .at(-1) ?? "";

  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-selected-copy\s*{/);
  assert.doesNotMatch(css, /\.cutter-material-locator \.cutter-locator-selected-copy p\s*{/);
  assert.match(selectedCopyRule, /font-size:\s*12px/);
  assert.match(selectedCopyRule, /line-height:\s*18px/);
  assert.match(selectedCopyTextRule, /min-height:\s*164px/);
  assert.match(selectedCopyTextRule, /max-height:\s*360px/);
  assert.match(selectedCopyTextRule, /overflow:\s*auto/);
  assert.match(selectedCopyTextRule, /white-space:\s*pre-wrap/);
  assert.match(selectedCopyTextRule, /overflow-wrap:\s*anywhere/);
});

test("material locator queue statuses use foundation badge tones", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.equal(css.includes('[data-cutter-route="material-locator"] .cutter-locator-queue-row.is-pending .ml-badge'), false);
  assert.equal(css.includes('[data-cutter-route="material-locator"] .cutter-locator-queue-row.is-running .ml-badge'), false);
  assert.equal(css.includes('[data-cutter-route="material-locator"] .cutter-locator-queue-row.is-done .ml-badge'), false);
  assert.equal(css.includes('[data-cutter-route="material-locator"] .cutter-locator-queue-row.is-failed .ml-badge'), false);
  assert.equal(css.includes('[data-cutter-route="material-locator"] .cutter-locator-queue-row.is-cancelled .ml-badge'), false);
});

test("cutter shell keeps the workbench fixed while page content panes scroll", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );
  const tokenCss = await readFile(new URL("../../../packages/ui-foundation/src/tokens.css", import.meta.url), "utf8");
  const lastRule = (pattern: RegExp) =>
    Array.from(css.matchAll(pattern)).map((match) => match.groups?.body ?? "").at(-1) ?? "";
  const lastFoundationRule = (pattern: RegExp) =>
    Array.from(foundationCss.matchAll(pattern)).map((match) => match.groups?.body ?? "").at(-1) ?? "";
  const lastTokenRule = (pattern: RegExp) =>
    Array.from(tokenCss.matchAll(pattern)).map((match) => match.groups?.body ?? "").at(-1) ?? "";
  const firstFoundationRule = (pattern: RegExp) =>
    Array.from(foundationCss.matchAll(pattern)).map((match) => match.groups?.body ?? "")[0] ?? "";
  const ordinaryContentRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\]:not\(\[data-cutter-route="material-locator"\]\) \.ml-workbench-content\s*{(?<body>[^}]+)}/g
  );
  const lockedContentRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\] \.cutter-workspace\.is-content-locked \.ml-workbench-content\s*{(?<body>[^}]+)}/g
  );
  const cutterThemeRule = lastTokenRule(/\.ml-theme-cutter\s*{(?<body>[^}]+)}/g);
  const readyPageRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-page\s*{(?<body>[^}]+)}/g
  );
  const readyPageFallbackRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\] \.cutter-page:not\(\.cutter-material-locator\):not\(\.ml-workbench-page\)\s*{(?<body>[^}]+)}/g
  );
  const readyPageMainFallbackRule = lastRule(
    /\.cutter-app\[data-cutter-web-ready\] \.cutter-page-main:not\(\.ml-workbench-main\)\s*{(?<body>[^}]+)}/g
  );
  const taskTableRule = lastFoundationRule(
    /\.ml-table-wrap\.is-workbench\s*{(?<body>[^}]+)}/g
  );
  const galleryGridRules = Array.from(css.matchAll(/(?:^|\n)\.cutter-library-grid\s*{/g));
  const libraryScrollPaneRules = Array.from(
    css.matchAll(/cutter-(?:local|public)-library-scroll\s*{/g)
  );
  const shellScrollRegionRule = lastFoundationRule(/\.ml-scroll-region\s*{(?<body>[^}]+)}/g);
  const foundationWorkbenchRule =
    foundationCss.match(/\.ml-workbench\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const foundationWorkbenchContentRule =
    foundationCss.match(/\.ml-workbench-content\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const settingsPageMainRule = lastFoundationRule(/\.ml-workbench-main--stack\s*{(?<body>[^}]+)}/g);
  const foundationWorkbenchPageRule =
    foundationCss.match(/\.ml-workbench-page\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const foundationWorkbenchLibraryPageRule = lastFoundationRule(/\.ml-workbench-page--library\s*{(?<body>[^}]+)}/g);
  const foundationWorkbenchFluidPageRule = lastFoundationRule(/\.ml-workbench-page--fluid\s*{(?<body>[^}]+)}/g);
  const foundationWorkbenchMainRule = lastFoundationRule(/\.ml-workbench-main\s*{(?<body>[^}]+)}/g);
  const foundationWorkbenchMainLibraryRule = lastFoundationRule(/\.ml-workbench-main--library\s*{(?<body>[^}]+)}/g);
  const foundationWorkbenchRowsListRule = lastFoundationRule(/\.ml-workbench-main--rows-list\s*{(?<body>[^}]+)}/g);
  const foundationWorkbenchRowsListFooterRule = lastFoundationRule(/\.ml-workbench-main--rows-list-footer\s*{(?<body>[^}]+)}/g);
  const foundationWorkbenchRowsDashboardRule = lastFoundationRule(/\.ml-workbench-main--rows-dashboard\s*{(?<body>[^}]+)}/g);
  const foundationWorkbenchHeaderRule =
    foundationCss.match(/\.ml-workbench-header\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const foundationWorkbenchInspectorRule = lastFoundationRule(/\.ml-workbench-inspector\s*{(?<body>[^}]+)}/g);
  const foundationWorkbenchOffsetInspectorRule = lastFoundationRule(/\.ml-workbench-inspector--offset-header\s*{(?<body>[^}]+)}/g);
  const foundationLibraryGridRule = lastFoundationRule(/\.ml-library-grid\s*{(?<body>[^}]+)}/g);
  const foundationLibraryThreeGridRule = lastFoundationRule(/\.ml-library-grid--three\s*{(?<body>[^}]+)}/g);
  const projectHomeHeroRules = Array.from(
    css.matchAll(/\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="project-home"\] \.cutter-project-hero\s*{/g)
  );
  const projectHomeSearchFormRules = Array.from(
    css.matchAll(/\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="project-home"\] \.cutter-project-search-form\s*{/g)
  );
  const projectHomeBoardRules = Array.from(
    css.matchAll(/\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="project-home"\] \.cutter-project-board\s*{/g)
  );
  const projectHomeSearchBoxRules = Array.from(
    css.matchAll(/\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="project-home"\] \.cutter-project-search-box\s*{/g)
  );
  const foundationActionStackButtonRule = lastFoundationRule(
    /\.ml-action-stack > \.ml-button\s*{(?<body>[^}]+)}/g
  );
  const foundationStickyActionStackRule = lastFoundationRule(
    /\.ml-sticky-action-stack\s*{(?<body>[^}]+)}/g
  );
  const foundationHeroControlRowRule = lastFoundationRule(
    /\.ml-control-row--hero \.ml-search-box-input,\s*\.ml-control-row--hero \.ml-search-box \.ml-button,\s*\.ml-control-row--hero > \.ml-button\s*{(?<body>[^}]+)}/g
  );
  const foundationOverlayActionRowRule = lastFoundationRule(
    /\.ml-overlay-action-row > \.ml-button\s*{(?<body>[^}]+)}/g
  );
  const foundationWorkbenchHeroRule = firstFoundationRule(/\.ml-workbench-hero\s*{(?<body>[^}]+)}/g);
  const foundationWorkbenchHeroCopyRule = firstFoundationRule(/\.ml-workbench-hero-copy\s*{(?<body>[^}]+)}/g);
  const foundationWorkbenchHeroActionsRule = firstFoundationRule(/\.ml-workbench-hero-actions\s*{(?<body>[^}]+)}/g);
  const foundationWorkbenchBoardRule = firstFoundationRule(/\.ml-workbench-board\s*{(?<body>[^}]+)}/g);
  const foundationWorkbenchPanelRule = lastFoundationRule(/\.ml-workbench-panel\s*{(?<body>[^}]+)}/g);
  const foundationWorkbenchPanelListRule = lastFoundationRule(/\.ml-workbench-panel--list\s*{(?<body>[^}]+)}/g);
  const foundationFixedMediaGridRule = lastFoundationRule(/\.ml-fixed-media-grid\s*{(?<body>[^}]+)}/g);
  const foundationFixedMediaCardRule = firstFoundationRule(/\.ml-media-card--fixed\s*{(?<body>[^}]+)}/g);
  const foundationDetailPanelRule = firstFoundationRule(/\.ml-detail-panel\s*{(?<body>[^}]+)}/g);
  const foundationDetailCoverRule = firstFoundationRule(/\.ml-detail-cover\s*{(?<body>[^}]+)}/g);
  const foundationDetailDataListRule = firstFoundationRule(/\.ml-data-list--detail\s*{(?<body>[^}]+)}/g);
  const foundationDetailDataRowRule = firstFoundationRule(/\.ml-data-row--detail\s*{(?<body>[^}]+)}/g);
  const foundationDetailActionStackRule = firstFoundationRule(/\.ml-action-stack--detail\s*{(?<body>[^}]+)}/g);

  assert.equal(Array.from(css.matchAll(/(?:^|\n)\.cutter-content\s*{/g)).length, 0);
  assert.match(foundationWorkbenchContentRule, /width:\s*100%/);
  assert.match(foundationWorkbenchContentRule, /max-width:\s*100%/);
  assert.match(foundationWorkbenchContentRule, /min-width:\s*0/);
  assert.match(foundationWorkbenchContentRule, /min-height:\s*0/);
  assert.match(foundationWorkbenchContentRule, /padding:\s*0/);
  assert.match(foundationWorkbenchContentRule, /overflow:\s*auto/);
  assert.equal(lastRule(/\.cutter-app\[data-cutter-web-ready\]\s*{(?<body>[^}]+)}/g), "");
  assert.match(cutterThemeRule, /--cutter-page-inset-block-start:\s*17px/);
  assert.match(cutterThemeRule, /--cutter-page-inset-inline:\s*22px/);
  assert.match(cutterThemeRule, /--cutter-page-inset-block-end:\s*31px/);
  assert.match(cutterThemeRule, /--ml-workbench-background:\s*var\(--ml-color-window\)/);
  assert.match(readyPageRule, /padding:\s*var\(--cutter-page-inset-block-start\)\s*var\(--cutter-page-inset-inline\)\s*var\(--cutter-page-inset-block-end\)/);
  assert.match(readyPageRule, /overflow:\s*hidden/);
  assert.doesNotMatch(readyPageRule, /padding:\s*17px 22px 31px/);
  assert.equal(
    css.includes('.cutter-app[data-cutter-web-ready][data-cutter-route]:not([data-cutter-route="material-locator"]) .cutter-page'),
    false
  );
  assert.equal(readyPageFallbackRule, "");
  assert.equal(readyPageMainFallbackRule, "");
  assert.doesNotMatch(css, /padding:\s*22px 24px 32px/);
  assert.doesNotMatch(css, /padding:\s*28px 32px 44px/);
  assert.doesNotMatch(css, /height:\s*100vh;\s*overflow:\s*auto;\s*padding:/);
  assert.doesNotMatch(css, /\.cutter-page\s*{[^}]*max-width:\s*1360px/s);
  assert.equal(css.includes(".cutter-app .ml-workbench.cutter-workspace"), false);
  assert.equal(css.includes(".cutter-app .cutter-content"), false);
  assert.equal(css.includes(".cutter-app .cutter-workspace.is-content-locked .cutter-content"), false);
  assert.equal(css.includes(".cutter-app[data-cutter-web-ready] .ml-workbench.cutter-workspace"), false);
  assert.equal(css.includes(".cutter-app[data-cutter-web-ready][data-cutter-route] .cutter-workspace"), false);
  assert.doesNotMatch(css, /(?:^|\n)\.cutter-workspace\s*{[^}]*display:\s*grid/s);
  assert.doesNotMatch(css, /(?:^|\n)\.cutter-workspace\s*{[^}]*grid-template-rows/s);
  assert.doesNotMatch(css, /(?:^|\n)\.cutter-workspace\s*{[^}]*background:/s);
  assert.equal(css.includes("Open Design convergence layer"), false);
  assert.equal(css.includes("Open Design shell fidelity"), false);
  assert.doesNotMatch(css, /\.cutter-workspace\.is-content-locked \.cutter-content\s*{[^}]*padding:/s);
  assert.doesNotMatch(css, /\.cutter-content\s*{[^}]*padding:/s);
  assert.doesNotMatch(css, /\.cutter-content\s*{[^}]*overflow:/s);
  assert.match(cutterThemeRule, /--ml-sidebar-width:\s*292px/);
  assert.doesNotMatch(css, /--ml-sidebar-width:\s*292px/);
  assert.doesNotMatch(css, /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="material-locator"\]\s*{[^}]*--ml-sidebar-width/s);
  assert.match(foundationWorkbenchRule, /display:\s*grid/);
  assert.match(foundationWorkbenchRule, /grid-template-rows:\s*minmax\(0,\s*1fr\)/);
  assert.match(foundationWorkbenchRule, /overflow:\s*hidden/);
  assert.match(foundationWorkbenchRule, /background:\s*var\(--ml-workbench-background,\s*var\(--ml-color-surface\)\)/);
  assert.match(ordinaryContentRule, /overflow-x:\s*hidden/);
  assert.match(ordinaryContentRule, /overflow-y:\s*auto/);
  assert.match(ordinaryContentRule, /overscroll-behavior:\s*contain/);
  assert.match(lockedContentRule, /overflow:\s*hidden/);
  assert.equal(css.includes('.cutter-app[data-cutter-web-ready][data-cutter-route="material-locator"] .ml-workbench-content'), false);
  assert.equal(css.includes('.cutter-app[data-cutter-web-ready][data-cutter-route="project-home"] .ml-workbench-content'), false);
  assert.equal(css.includes('.cutter-app[data-cutter-web-ready][data-cutter-route="project-home"] .cutter-workspace'), false);
  assert.equal(css.includes('.cutter-app[data-cutter-route="project-home"]'), false);
  assert.equal(css.includes(".cutter-project-card-body"), false);
  assert.equal(css.includes(".cutter-project-metrics"), false);
  assert.equal(css.includes("design-home-card-"), false);
  assert.equal(css.includes(".cutter-project-card:nth-of-type(3)"), false);
  assert.doesNotMatch(
    css,
    /(?:^|\n)\s*\.cutter-project-(?:home|hero|board|grid|card|cover|detail|search-form)(?:[\s,{.:>#-]|$)/
  );
  assert.equal(css.includes(".cutter-app[data-cutter-web-ready] .cutter-project-list-panel"), false);
  assert.equal(css.includes(".cutter-app[data-cutter-web-ready] .cutter-project-detail"), false);
  assert.equal(css.includes("Desktop shell containment"), false);
  assert.equal(css.includes('.cutter-app[data-cutter-web-ready][data-cutter-route] .cutter-project-detail dl div'), false);
  assert.equal(css.includes(".cutter-app[data-cutter-web-ready]:has(.cutter-material-locator) .cutter-content"), false);
  assert.equal(css.includes(".cutter-app[data-cutter-web-ready]:has(.cutter-material-locator) .ml-workbench-content"), false);
  assert.equal(css.includes(".cutter-app[data-cutter-web-ready]:has(.cutter-material-locator) .cutter-workspace"), false);
  assert.match(taskTableRule, /overflow-x:\s*hidden/);
  assert.match(taskTableRule, /overflow-y:\s*auto/);
  assert.match(taskTableRule, /overscroll-behavior:\s*contain/);
  assert.doesNotMatch(css, /\.cutter-queue-table\.ml-table-wrap\s*{/);
  assert.equal(galleryGridRules.length, 0);
  assert.equal(libraryScrollPaneRules.length, 0);
  assert.match(foundationWorkbenchPageRule, /grid-template-columns:\s*minmax\(0,\s*var\(--ml-workbench-page-main,\s*900px\)\)/);
  assert.match(foundationWorkbenchPageRule, /var\(--ml-workbench-page-side,\s*330px\)/);
  assert.match(foundationWorkbenchPageRule, /overflow:\s*hidden/);
  assert.match(foundationWorkbenchLibraryPageRule, /--ml-workbench-page-side:\s*350px/);
  assert.match(foundationWorkbenchLibraryPageRule, /--ml-workbench-page-width:\s*1274px/);
  assert.match(foundationWorkbenchFluidPageRule, /--ml-workbench-page-width:\s*100%/);
  assert.match(foundationWorkbenchMainRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(foundationWorkbenchMainRule, /overflow:\s*hidden/);
  assert.match(foundationWorkbenchMainLibraryRule, /--ml-workbench-main-gap:\s*20px/);
  assert.match(foundationWorkbenchRowsListRule, /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(foundationWorkbenchRowsListFooterRule, /grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/);
  assert.match(foundationWorkbenchRowsDashboardRule, /grid-template-rows:\s*auto auto minmax\(0,\s*1fr\)/);
  assert.match(settingsPageMainRule, /grid-auto-rows:\s*max-content/);
  assert.match(settingsPageMainRule, /align-content:\s*start/);
  assert.match(foundationWorkbenchHeaderRule, /min-height:\s*76px/);
  assert.match(foundationWorkbenchHeaderRule, /display:\s*flex/);
  assert.match(foundationWorkbenchHeaderRule, /justify-content:\s*space-between/);
  assert.match(foundationWorkbenchHeaderRule, /background:\s*transparent/);
  assert.match(
    foundationCss,
    /@media \(max-width:\s*1180px\)[\s\S]*\.ml-workbench-header\s*{[\s\S]*flex-direction:\s*column[\s\S]*}/
  );
  assert.match(foundationWorkbenchInspectorRule, /width:\s*100%/);
  assert.match(foundationWorkbenchOffsetInspectorRule, /margin-top:\s*122px/);
  assert.match(shellScrollRegionRule, /overflow-x:\s*hidden/);
  assert.match(shellScrollRegionRule, /overflow-y:\s*auto/);
  assert.match(shellScrollRegionRule, /overscroll-behavior:\s*contain/);
  assert.match(shellScrollRegionRule, /scrollbar-gutter:\s*stable/);
  assert.doesNotMatch(settingsPageMainRule, /overflow:\s*auto/);
  assert.doesNotMatch(settingsPageMainRule, /scrollbar-gutter:\s*stable/);
  assert.equal(css.includes('.cutter-app[data-cutter-web-ready][data-cutter-route="local-library"] .cutter-local-library .cutter-page-main'), false);
  assert.equal(css.includes('.cutter-app[data-cutter-web-ready][data-cutter-route="public-library"] .cutter-public-library .cutter-page-main'), false);
  assert.equal(css.includes('.cutter-app[data-cutter-web-ready][data-cutter-route="settings"] .cutter-settings .cutter-page-main'), false);
  assert.equal(css.includes('.cutter-app[data-cutter-web-ready][data-cutter-route] .ml-scroll-region'), false);
  assert.match(foundationLibraryGridRule, /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(216px,\s*1fr\)\)/);
  assert.match(foundationLibraryGridRule, /align-content:\s*start/);
  assert.match(foundationLibraryThreeGridRule, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(foundationLibraryThreeGridRule, /align-content:\s*start/);
  assert.equal(projectHomeHeroRules.length, 0);
  assert.equal(projectHomeSearchFormRules.length, 0);
  assert.equal(projectHomeBoardRules.length, 0);
  assert.equal(projectHomeSearchBoxRules.length, 0);
  assert.doesNotMatch(css, /(?:^|\n)\.cutter-page-main\s*{/);
  assert.doesNotMatch(
    css,
    /(?:^|\n)\.(?:cutter-cut-queue|cutter-local-library|cutter-public-library|cutter-cache-management|cutter-settings)\s*{/
  );
  assert.equal(
    css.includes('.cutter-app[data-cutter-web-ready][data-cutter-route="project-home"] .cutter-project-home,\n.cutter-app[data-cutter-web-ready][data-cutter-route="project-home"] .cutter-project-home .cutter-page-main'),
    false
  );
  assert.equal(
    css.includes('.cutter-app[data-cutter-web-ready][data-cutter-route="project-home"] .cutter-project-home .cutter-page-main'),
    false
  );
  assert.match(foundationHeroControlRowRule, /min-height:\s*45px/);
  assert.equal(
    Array.from(
      css.matchAll(
        /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="project-home"\] \.cutter-project-search-box \.(?:ml-search-box-input|ml-button)/g
      )
    ).length,
    0
  );
  assert.equal(
    Array.from(
      css.matchAll(
        /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="project-home"\] \.cutter-project-search-form > \.ml-button/g
      )
    ).length,
    0
  );
  assert.match(foundationOverlayActionRowRule, /min-height:\s*42px/);
  assert.equal(
    Array.from(
      css.matchAll(
        /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="project-home"\] \.cutter-project-card-actions \.ml-button/g
      )
    ).length,
    0
  );
  assert.match(foundationWorkbenchHeroRule, /grid-template-columns:[^}]*var\(--ml-workbench-hero-copy,\s*0\.9fr\)/s);
  assert.match(foundationWorkbenchHeroRule, /minmax\(var\(--ml-workbench-hero-action-min,\s*360px\),\s*1fr\)/);
  assert.match(foundationWorkbenchHeroRule, /min-height:\s*var\(--ml-workbench-hero-min-height,\s*124px\)/);
  assert.match(foundationWorkbenchHeroRule, /background:\s*transparent/);
  assert.match(foundationWorkbenchHeroCopyRule, /min-width:\s*0/);
  assert.match(foundationWorkbenchHeroActionsRule, /grid-template-columns:\s*minmax\(0,\s*1fr\) auto/);
  assert.match(foundationWorkbenchHeroActionsRule, /margin-top:\s*var\(--ml-workbench-hero-actions-offset,\s*53px\)/);
  assert.match(foundationWorkbenchBoardRule, /grid-template-columns:[^}]*var\(--ml-workbench-board-side-min,\s*300px\)/s);
  assert.match(foundationWorkbenchBoardRule, /overflow:\s*hidden/);
  assert.match(foundationWorkbenchPanelRule, /height:\s*100%/);
  assert.match(foundationWorkbenchPanelRule, /border:\s*0/);
  assert.match(foundationWorkbenchPanelRule, /border-radius:\s*0/);
  assert.match(foundationWorkbenchPanelRule, /background:\s*transparent/);
  assert.match(foundationWorkbenchPanelRule, /box-shadow:\s*none/);
  assert.doesNotMatch(foundationWorkbenchPanelRule, /655px|border-radius:\s*14px|box-shadow:\s*0 |var\(--ml-shadow-panel\)/);
  assert.match(foundationWorkbenchPanelListRule, /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(foundationWorkbenchPanelListRule, /padding:\s*var\(--ml-workbench-panel-list-padding,\s*28px 17px 30px\)/);
  assert.match(foundationFixedMediaGridRule, /grid-template-columns:\s*repeat\(auto-fill,\s*var\(--ml-fixed-media-grid-item,\s*262px\)\)/);
  assert.match(foundationFixedMediaGridRule, /justify-content:\s*start/);
  assert.doesNotMatch(foundationFixedMediaGridRule, /overflow:/);
  assert.doesNotMatch(foundationFixedMediaGridRule, /overscroll-behavior:/);
  assert.doesNotMatch(foundationFixedMediaGridRule, /scrollbar-gutter:/);
  assert.match(foundationFixedMediaCardRule, /width:\s*var\(--ml-media-card-fixed-width,\s*262px\)/);
  assert.match(foundationFixedMediaCardRule, /aspect-ratio:\s*var\(--ml-media-card-fixed-ratio,\s*262\s*\/\s*220\)/);
  assert.match(foundationDetailPanelRule, /grid-template-rows:\s*var\(--ml-detail-panel-rows,\s*auto minmax\(132px,\s*auto\) minmax\(0,\s*auto\) auto\)/);
  assert.doesNotMatch(foundationDetailPanelRule, /overflow-x:/);
  assert.doesNotMatch(foundationDetailPanelRule, /overflow-y:/);
  assert.doesNotMatch(foundationDetailPanelRule, /overscroll-behavior:/);
  assert.doesNotMatch(foundationDetailPanelRule, /scrollbar-gutter:/);
  assert.match(shellScrollRegionRule, /overflow-x:\s*hidden/);
  assert.match(shellScrollRegionRule, /overflow-y:\s*auto/);
  assert.match(shellScrollRegionRule, /scrollbar-gutter:\s*stable/);
  assert.match(foundationDetailPanelRule, /margin-left:\s*0/);
  assert.match(foundationDetailCoverRule, /max-height:\s*var\(--ml-detail-cover-max-height,\s*clamp\(132px,\s*21vh,\s*220px\)\)/);
  assert.doesNotMatch(foundationDetailCoverRule, /background:/);
  assert.doesNotMatch(foundationDetailCoverRule, /border-radius:/);
  assert.doesNotMatch(foundationDetailCoverRule, /overflow:/);
  assert.match(foundationDetailDataListRule, /min-height:\s*0/);
  assert.match(foundationDetailDataRowRule, /grid-template-columns:\s*var\(--ml-data-row-detail-label,\s*112px\) minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(foundationDetailDataRowRule, /border-bottom:/);
  assert.doesNotMatch(foundationDetailDataRowRule, /font-size:/);
  assert.match(foundationDetailActionStackRule, /width:\s*var\(--ml-action-stack-detail-width,\s*362px\)/);
  assert.match(foundationDetailActionStackRule, /margin-top:\s*var\(--ml-action-stack-detail-margin-top,\s*12px\)/);
  assert.doesNotMatch(foundationDetailActionStackRule, /position:\s*sticky/);
  assert.doesNotMatch(foundationDetailActionStackRule, /background:/);
  assert.doesNotMatch(foundationDetailActionStackRule, /backdrop-filter:/);
  assert.match(foundationStickyActionStackRule, /position:\s*sticky/);
  assert.match(foundationStickyActionStackRule, /backdrop-filter:\s*blur\(8px\)/);
  assert.match(foundationActionStackButtonRule, /width:\s*100%/);
  assert.equal(
    Array.from(css.matchAll(/\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="project-home"\] \.cutter-project-detail-cover\s*{/g)).length,
    0
  );
  assert.equal(
    Array.from(css.matchAll(/\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="project-home"\] \.cutter-project-detail-list\s*{/g)).length,
    0
  );
  assert.equal(
    Array.from(css.matchAll(/\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="project-home"\] \.cutter-project-detail-row\s*{/g)).length,
    0
  );
  assert.equal(
    Array.from(css.matchAll(/\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="project-home"\] \.cutter-project-detail-controls\s*{/g)).length,
    0
  );
  assert.equal(
    Array.from(css.matchAll(/\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="project-home"\] \.cutter-project-detail-controls \.ml-button\s*{/g)).length,
    0
  );
});

test("cutter page main wrappers are semantic hooks paired with foundation composition", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const pageFiles = [
    "./features/project-home/ProjectHomePage.tsx",
    "./features/material-locator/MaterialLocatorPage.tsx",
    "./features/cut-queue/CutQueuePage.tsx",
    "./features/cut-list/CutListPage.tsx",
    "./features/local-library/LocalLibraryPage.tsx",
    "./features/public-library/PublicLibraryPage.tsx",
    "./features/cache-management/CacheManagementPage.tsx",
    "./features/settings/SettingsPage.tsx",
    "./features/source-detail/SourceDetailPage.tsx"
  ];

  for (const pageFile of pageFiles) {
    const source = await readFile(new URL(pageFile, import.meta.url), "utf8");
    const pageMainClasses = Array.from(source.matchAll(/className="([^"]*cutter-page-main[^"]*)"/g))
      .map((match) => match[1] ?? "");

    assert.ok(pageMainClasses.length > 0, `${pageFile} should expose a cutter-page-main hook`);
    for (const className of pageMainClasses) {
      assert.match(
        className,
        /\b(?:ml-workbench-main|ml-split-workbench)\b/,
        `${pageFile} page main must use a Foundation composition class`
      );
    }
  }

  assert.doesNotMatch(css, /(?:^|\n)\.cutter-page-main\s*{/);
  assert.equal(css.includes(".cutter-page-main,"), false);
  assert.doesNotMatch(css, /\[data-cutter-route[^\]]*\][^{]*\.cutter-page-main\s*{/);
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
  assert.match(html, /cutter-cut-list ml-workbench-page ml-workbench-page--fluid/);
  assert.match(html, /cutter-page-main ml-workbench-main ml-workbench-main--rows-list/);
  assert.match(html, /cutter-page-header ml-workbench-header/);
  assert.match(html, /class="cutter-button-group ml-control-cluster"/);
  assert.match(html, /class="cutter-row-actions ml-toolbar-list"/);
  assert.match(html, /style="width:72px"/);
  assert.match(html, /style="width:112px"/);
  assert.match(html, /style="width:180px"/);
  assert.match(html, /<td class="ml-truncate-line">/);
  assert.match(html, /ml-inspector--workbench ml-workbench-inspector/);
});

test("cut list table sizing uses table props and foundation utilities", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(css, /\.cutter-cut-list \.ml-source-table\s*{/);
  assert.doesNotMatch(css, /\.cutter-cut-list \.ml-source-table th:nth-child/);
  assert.doesNotMatch(css, /\.cutter-cut-list \.ml-table td:nth-child\(4\)/);
  assert.doesNotMatch(css, /\.cutter-cut-list \.ml-table-wrap\s*{/);
  assert.match(foundationCss, /\.ml-truncate-line\s*{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s);
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

  assert.match(html, /cutter-local-library-scroll ml-scroll-region/);
  assert.match(html, /cutter-library-grid/);
  assert.match(html, /<video[^>]+src="\/local-clips\/clip-001\.mp4"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-label="本地素材视频类型"/);
  assert.match(html, /cutter-local-library-controls ml-control-cluster/);
  assert.match(html, /cutter-local-view-toggle ml-segmented-control/);
  assert.match(html, /class="cutter-note ml-page-description"/);
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
	  assert.match(portraitHtml, /aria-pressed="true"[\s\S]*?<span class="ml-button-label">竖版<\/span>/);
	  assert.match(portraitHtml, /4-当前项目-竖版开场/);
  assert.match(portraitHtml, /cutter-local-view-toggle ml-segmented-control/);
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
  assert.match(html, /cutter-library-group-list ml-library-group-list/);
  assert.match(html, /cutter-library-group ml-library-group/);
  assert.match(html, /cutter-library-group-header ml-library-group-header/);
  assert.equal(html.includes("cutter-local-project-groups"), false);
  assert.equal(html.includes("cutter-local-project-group"), false);
});

test("local library project grouping uses shared library grouping owners", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url), "utf8");

  assert.doesNotMatch(css, /^\.cutter-library-group-list\s*{/m);
  assert.doesNotMatch(css, /^\.cutter-library-group\s*{/m);
  assert.doesNotMatch(css, /^\.cutter-library-group-header\s*{/m);
  assert.match(foundationCss, /\.ml-library-group-list\s*{[^}]*gap:\s*18px/s);
  assert.match(foundationCss, /\.ml-library-group\s*{[^}]*gap:\s*10px/s);
  assert.match(foundationCss, /\.ml-library-group-header\s*{[^}]*color:\s*var\(--ml-color-text\)/s);
  assert.equal(css.includes("cutter-local-project-groups"), false);
  assert.equal(css.includes("cutter-local-project-group"), false);
});

test("local library control cluster visuals are owned by foundation", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url), "utf8");

  assert.doesNotMatch(css, /^\.cutter-local-library-controls\s*{/m);
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="local-library"\] \.cutter-local-library-controls\s*{/
  );
  assert.match(foundationCss, /\.ml-control-cluster\s*{[^}]*display:\s*flex/s);
  assert.match(foundationCss, /\.ml-control-cluster\s*{[^}]*gap:\s*8px/s);
  assert.match(foundationCss, /\.ml-control-cluster\s*{[^}]*justify-content:\s*flex-end/s);
  assert.match(foundationCss, /\.ml-control-cluster\s*{[^}]*align-self:\s*start/s);
});

test("generic action and search helper visuals are owned by foundation", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url), "utf8");

  assert.doesNotMatch(css, /^\.cutter-button-group\s*{/m);
  assert.doesNotMatch(css, /^\.cutter-row-actions\s*{/m);
  assert.doesNotMatch(css, /^\.cutter-search-form\s*{/m);
  assert.doesNotMatch(css, /^\.cutter-section-heading\b/m);
  assert.doesNotMatch(css, /^\.cutter-note\s*{/m);
  assert.match(foundationCss, /\.ml-toolbar-list\s*{[^}]*display:\s*flex[^}]*gap:\s*6px/s);
  assert.match(foundationCss, /\.ml-control-cluster\s*{[^}]*display:\s*flex[^}]*gap:\s*8px/s);
  assert.match(foundationCss, /\.ml-workbench-hero-actions\s*{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto/s);
  assert.match(foundationCss, /\.ml-control-row--hero \.ml-search-box-input,\s*\.ml-control-row--hero \.ml-search-box \.ml-button,\s*\.ml-control-row--hero > \.ml-button\s*{[^}]*min-height:\s*45px/s);
  assert.match(foundationCss, /\.ml-page-description\.ml-page-description\s*{[^}]*font-size:\s*15px[^}]*line-height:\s*23px/s);
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
  assert.match(html, /cutter-cut-queue ml-workbench-page ml-workbench-page--fluid/);
  assert.match(html, /cutter-page-main ml-workbench-main ml-workbench-main--task-flow/);
  assert.match(html, /cutter-page-header ml-workbench-header/);
  assert.match(html, /cutter-queue-pipeline-card-body ml-summary-card-body/);
  assert.match(html, /class="ml-inline-summary"/);
  assert.match(html, /class="ml-supporting-text"/);
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
  assert.match(html, /class="ml-table-wrap has-sticky-header is-compact cutter-queue-table is-workbench"/);
  assert.match(html, /<table class="ml-table"/);
  assert.match(html, /class="ml-card cutter-queue-filter-card is-workbench"/);
  assert.match(html, /class="ml-card cutter-queue-pipeline-card is-[^"]+ is-workbench"/);
  assert.match(html, /class="ml-button ml-button--ghost ml-button--sm cutter-queue-filter-button"/);
  assert.match(html, /class="ml-badge is-success"/);
  assert.match(html, /class="ml-badge is-danger"/);
  assert.match(html, /class="cutter-queue-source-button ml-table-text-button"/);
  assert.match(html, /class="ml-status-icon ml-status-icon--ready" role="img" aria-label="剪切成功"/);
  assert.match(html, /class="cutter-queue-problem ml-status-text ml-status-text--failed ml-truncate-line"/);
  assert.match(html, /class="cutter-queue-problem ml-status-text ml-status-text--done ml-truncate-line"/);
  assert.match(html, /class="ml-status-text ml-status-text--pending">等待剪切/);
  assert.match(html, /class="ml-status-text ml-status-text--running">剪切中/);
  assert.match(html, /class="ml-button-count">/);
  assert.match(html, /class="ml-inspector ml-inspector--workbench cutter-queue-inspector"/);
  assert.match(html, /class="ml-inspector-body cutter-queue-inspector-body"/);
  assert.match(html, /class="ml-data-list ml-data-list--grid cutter-queue-detail-list"/);
  assert.match(html, /class="ml-data-row ml-data-row--detail-pair cutter-queue-detail-row"/);
});

test("cut tasks pipeline card uses a page body class instead of styling Card internals", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );

  assert.equal(css.includes(".cutter-queue-pipeline-card .ml-card-body"), false);
  assert.match(
    foundationCss,
    /\.ml-summary-card-body\s*{[^}]*min-height:\s*58px/s
  );
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
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );
  const cutTaskRouteCss = Array.from(
    css.matchAll(
      /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="cut-tasks"\][^{]+{(?<body>[^}]+)}/g
    )
  )
    .map((match) => match.groups?.body ?? "")
    .join("\n");
  const workbenchPageRule =
    foundationCss.match(/\.ml-workbench-page\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const workbenchFluidPageRule =
    foundationCss.match(/\.ml-workbench-page--fluid\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const taskFlowRule =
    foundationCss.match(/\.ml-workbench-main--task-flow\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const inspectorRule = css.match(
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="cut-tasks"\] \.ml-inspector\s*{(?<body>[^}]+)}/
  )?.groups?.body ?? "";
  const foundationInspectorRule =
    foundationCss.match(/\.ml-inspector\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const foundationInspectorBodyRule =
    foundationCss.match(/\.ml-inspector-body\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const foundationCardWorkbenchRule =
    foundationCss.match(/\.ml-card\.is-workbench\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const textRule =
    foundationCss.match(/\.ml-truncate-line\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const tablePrimaryTextRule =
    foundationCss.match(/\.ml-table-primary-text\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const tableMutedTextRule =
    foundationCss.match(/\.ml-table-muted-text\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const emptyInlineRule =
    foundationCss.match(/\.ml-empty-inline\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const actionsRule =
    foundationCss.match(/\.ml-table-action-cell\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const workbenchTableWrapRule =
    foundationCss.match(/\.ml-table-wrap\.is-workbench\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const workbenchTableRule =
    foundationCss.match(/\.ml-table-wrap\.is-workbench \.ml-table\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const workbenchTableCellRule =
    foundationCss.match(/\.ml-table-wrap\.is-workbench \.ml-table th,\s*\.ml-table-wrap\.is-workbench \.ml-table td\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const workbenchTableHeaderRule =
    foundationCss.match(/\.ml-table-wrap\.is-workbench \.ml-table th\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const statusTextRule =
    foundationCss.match(/\.ml-status-text\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const pendingStatusRule =
    foundationCss.match(/\.ml-status-text--pending\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const runningStatusRule =
    foundationCss.match(/\.ml-status-text--running\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const doneStatusRule =
    foundationCss.match(/\.ml-status-text--done\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const failedStatusRule =
    foundationCss.match(/\.ml-status-text--failed\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const cancelledStatusRule =
    foundationCss.match(/\.ml-status-text--cancelled\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const detailListRule =
    foundationCss.match(/\.ml-data-list--grid\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const detailRowRule =
    foundationCss.match(/\.ml-data-row--detail-pair\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const detailStackRule =
    foundationCss.match(/\.ml-detail-panel-stack\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const detailStatusRule =
    foundationCss.match(/\.ml-detail-status\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const dataRowValueRule =
    foundationCss.match(/\.ml-data-row dd\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const buttonCountRule =
    foundationCss.match(/\.ml-button-count\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const activeButtonCountRule =
    foundationCss.match(/\.ml-button\.is-active \.ml-button-count,\s*\.ml-button\[aria-pressed="true"\] \.ml-button-count\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const buttonIconSvgRule =
    foundationCss.match(/\.ml-button-icon svg\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const statusIconRule =
    foundationCss.match(/\.ml-status-icon\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const readyStatusIconRule =
    foundationCss.match(/\.ml-status-icon--ready\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const tableTextButtonRule =
    foundationCss.match(/\.ml-table-text-button\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const inlineSummaryRule =
    foundationCss.match(/\.ml-inline-summary\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const inlineSummaryLabelRule =
    foundationCss.match(/\.ml-inline-summary > span\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const inlineSummaryValueRule =
    foundationCss.match(/\.ml-inline-summary > strong\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const supportingTextRule =
    foundationCss.match(/\.ml-supporting-text\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  assert.equal(css.includes('[data-cutter-route="cut-tasks"] .cutter-page-header h1'), false);
  assert.equal(css.includes('[data-cutter-route="cut-tasks"] .cutter-page-header p'), false);
  assert.match(foundationCss, /\.ml-page-title\.ml-page-title\s*{[^}]*font-size:\s*30px[^}]*line-height:\s*40px/s);
  assert.match(foundationCss, /\.ml-page-description\.ml-page-description\s*{[^}]*font-size:\s*15px[^}]*line-height:\s*23px/s);
  assert.equal(css.includes('[data-cutter-route="cut-tasks"] .cutter-page-header h1 {\n  font-size: 28px;'), false);
  assert.equal(css.includes('[data-cutter-route="cut-tasks"] .cutter-page-header {\n  min-height: 68px;'), false);
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\] \.ml-card,\s*\.cutter-app\[data-cutter-web-ready\] \.ml-inspector,\s*\.cutter-app\[data-cutter-web-ready\] \.ml-table-wrap,[\s\S]*?\.cutter-queue-table/
  );
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="cut-tasks"\] \.cutter-cut-queue,\s*\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="local-library"\]/
  );
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="cut-tasks"\] \.cutter-cut-queue \.cutter-page-main,\s*\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="local-library"\]/
  );
  assert.match(workbenchPageRule, /height:\s*100%/);
  assert.match(workbenchPageRule, /overflow:\s*hidden/);
  assert.match(workbenchFluidPageRule, /--ml-workbench-page-side:\s*minmax\(300px,\s*330px\)/);
  assert.match(workbenchFluidPageRule, /--ml-workbench-page-width:\s*100%/);
  assert.match(taskFlowRule, /grid-template-rows:\s*auto auto auto minmax\(0,\s*1fr\)/);
  assert.match(taskFlowRule, /gap:\s*16px/);
  assert.equal(inspectorRule, "");
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="cut-tasks"\] \.cutter-queue-inspector,\s*\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-library-inspector/
  );
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="cut-tasks"\] \.cutter-queue-inspector-body,\s*\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-library-inspector \.ml-inspector-body/
  );
  assert.match(foundationInspectorRule, /max-height:\s*100%/);
  assert.match(foundationInspectorRule, /overflow:\s*hidden/);
  assert.match(foundationInspectorBodyRule, /overflow:\s*auto/);
  assert.match(foundationInspectorBodyRule, /overscroll-behavior:\s*contain/);
  assert.match(foundationCardWorkbenchRule, /border-color:\s*var\(--ml-border-subtle\)/);
  assert.match(foundationCardWorkbenchRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-surface\) 86%,\s*transparent\)/);
  assert.match(foundationCardWorkbenchRule, /box-shadow:\s*var\(--ml-shadow-panel\)/);
  assert.match(textRule, /overflow:\s*hidden/);
  assert.match(textRule, /text-overflow:\s*ellipsis/);
  assert.match(textRule, /white-space:\s*nowrap/);
  assert.match(tablePrimaryTextRule, /color:\s*var\(--ml-color-text\)/);
  assert.match(tablePrimaryTextRule, /text-align:\s*left/);
  assert.match(tableMutedTextRule, /color:\s*var\(--ml-color-text-secondary\)/);
  assert.match(emptyInlineRule, /color:\s*var\(--ml-color-text-tertiary\)/);
  assert.match(actionsRule, /display:\s*inline-flex/);
  assert.match(actionsRule, /min-width:\s*64px/);
  assert.doesNotMatch(actionsRule, /color:/);
  assert.doesNotMatch(actionsRule, /font-weight:/);
  assert.match(workbenchTableWrapRule, /overflow-y:\s*auto/);
  assert.match(workbenchTableWrapRule, /border-color:\s*var\(--ml-border-subtle\)/);
  assert.match(workbenchTableWrapRule, /background:\s*color-mix\(in srgb,\s*var\(--ml-color-surface\) 86%,\s*transparent\)/);
  assert.match(workbenchTableWrapRule, /box-shadow:\s*var\(--ml-shadow-panel\)/);
  assert.match(workbenchTableWrapRule, /scrollbar-gutter:\s*stable/);
  assert.match(workbenchTableRule, /table-layout:\s*fixed/);
  assert.match(workbenchTableCellRule, /min-width:\s*0/);
  assert.match(workbenchTableCellRule, /padding-right:\s*clamp\(7px,\s*0\.85vw,\s*13px\)/);
  assert.match(workbenchTableHeaderRule, /text-align:\s*center/);
  assert.match(workbenchTableHeaderRule, /z-index:\s*5/);
  assert.match(workbenchTableHeaderRule, /background:\s*var\(--ml-color-surface\)/);
  assert.match(statusTextRule, /font-weight:\s*680/);
  assert.match(pendingStatusRule, /color:\s*var\(--ml-color-warning\)/);
  assert.match(runningStatusRule, /color:\s*var\(--ml-color-processing\)/);
  assert.match(doneStatusRule, /color:\s*var\(--ml-color-ready\)/);
  assert.match(failedStatusRule, /color:\s*var\(--ml-color-failed\)/);
  assert.match(cancelledStatusRule, /color:\s*var\(--ml-color-queued\)/);
  assert.match(detailListRule, /display:\s*grid/);
  assert.match(detailListRule, /padding:\s*0/);
  assert.match(detailRowRule, /grid-template-columns:\s*82px minmax\(0,\s*1fr\)/);
  assert.match(detailRowRule, /min-height:\s*58px/);
  assert.match(detailStackRule, /gap:\s*16px/);
  assert.match(detailStatusRule, /width:\s*100%/);
  assert.match(detailStatusRule, /min-height:\s*34px/);
  assert.match(dataRowValueRule, /line-height:\s*20px/);
  assert.match(buttonCountRule, /min-width:\s*24px/);
  assert.match(activeButtonCountRule, /color:\s*var\(--ml-color-accent\)/);
  assert.match(buttonIconSvgRule, /width:\s*18px/);
  assert.match(buttonIconSvgRule, /height:\s*18px/);
  assert.match(statusIconRule, /width:\s*26px/);
  assert.match(readyStatusIconRule, /background:\s*var\(--ml-color-ready-soft\)/);
  assert.match(tableTextButtonRule, /font-weight:\s*720/);
  assert.match(tableTextButtonRule, /text-overflow:\s*ellipsis/);
  assert.match(tableTextButtonRule, /white-space:\s*nowrap/);
  assert.match(inlineSummaryRule, /display:\s*flex/);
  assert.match(inlineSummaryRule, /align-items:\s*baseline/);
  assert.match(inlineSummaryLabelRule, /color:\s*var\(--ml-color-text-secondary\)/);
  assert.match(inlineSummaryLabelRule, /font-size:\s*13px/);
  assert.match(inlineSummaryValueRule, /color:\s*var\(--ml-color-text\)/);
  assert.match(inlineSummaryValueRule, /font-size:\s*15px/);
  assert.match(supportingTextRule, /color:\s*var\(--ml-color-text-secondary\)/);
  assert.match(supportingTextRule, /line-height:\s*20px/);
  assert.doesNotMatch(css, /\.cutter-queue-detail dl div\s*{/);
  assert.doesNotMatch(css, /\.cutter-queue-detail dt,/);
  assert.doesNotMatch(css, /\.cutter-queue-filter-button \.ml-button-label/);
  assert.doesNotMatch(css, /\.cutter-queue-filter-button\.ml-button/);
  assert.doesNotMatch(css, /\.cutter-queue-filter-button strong/);
  assert.doesNotMatch(css, /\.cutter-queue-filter-button\.is-active strong/);
  assert.doesNotMatch(css, /\.cutter-queue-action-check/);
  assert.doesNotMatch(css, /\.cutter-queue-problem\.is-(?:pending|running|done|failed|cancelled)/);
  assert.doesNotMatch(css, /\.cutter-queue-problem\s*{[^}]*font-weight/s);
  assert.doesNotMatch(css, /\.cutter-queue-actions\.is-(?:pending|running|done|failed|cancelled)/);
  assert.doesNotMatch(css, /\.cutter-queue-actions \.ml-button--sm/);
  assert.doesNotMatch(css, /\.cutter-queue-directory-action svg/);
  assert.doesNotMatch(css, /\.cutter-queue-detail-directory svg/);
  assert.doesNotMatch(css, /\.cutter-queue-source-button\s*{/);
  assert.doesNotMatch(css, /\.cutter-queue-pipeline-card-body > div\s*{/);
  assert.doesNotMatch(css, /\.cutter-queue-pipeline-card (?:span|p)/);
  assert.doesNotMatch(css, /\.cutter-queue-pipeline-card strong\s*{/);
  assert.doesNotMatch(css, /\.cutter-queue-table\.ml-table-wrap\s*{/);
  assert.doesNotMatch(css, /\.cutter-queue-table \.ml-table\s*{/);
  assert.doesNotMatch(css, /\.cutter-queue-table \.ml-table th,/);
  assert.doesNotMatch(css, /\.cutter-queue-table \.ml-table th\s*{/);
  assert.doesNotMatch(cutTaskRouteCss, /#101828|#111827|#667085|rgba\(118,\s*134,\s*159|rgba\(83,\s*103,\s*132/);
  assert.equal(css.includes("Cut Tasks reference implementation"), false);
  assert.equal(css.includes("/Users/huaqihang/Desktop/Mixlab/3.png"), false);
  assert.equal(
    css.includes('[data-cutter-route="cut-tasks"] .ml-inspector-title'),
    false
  );
  assert.equal(
    css.includes('[data-cutter-route="cut-tasks"] .ml-inspector-header'),
    false
  );
  assert.equal(
    css.includes('[data-cutter-route="cut-tasks"] .ml-inspector-body'),
    false
  );
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

test("cutter css does not keep legacy global inspector compatibility overrides", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.doesNotMatch(css, /(^|\n)\.ml-inspector\s*{/);
  assert.doesNotMatch(css, /(^|\n)\.cutter-app\s+\.ml-inspector\b/);
  assert.doesNotMatch(css, /(^|\n)\.cutter-app\s+\.ml-inspector\s*{[^}]*position:\s*sticky/s);
  assert.doesNotMatch(css, /(^|\n)\.cutter-app\s+\.ml-inspector\s*{[^}]*overflow:\s*auto/s);
});

test("cutter css does not override foundation quiet surface defaults", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\] \.ml-card,\s*\.cutter-app\[data-cutter-web-ready\] \.ml-inspector,\s*\.cutter-app\[data-cutter-web-ready\] \.ml-table-wrap\s*{/
  );
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\] \.ml-card\s*{[^}]*box-shadow:\s*none/s
  );
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\] \.ml-table-wrap\s*{[^}]*box-shadow:\s*none/s
  );
});

test("cut tasks page exposes a project output directory action near filters", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(CutQueuePage, {
      jobs: data.queue,
      onOpenCutOutputDirectory: () => undefined
    })
  );

  assert.match(html, /打开文件目录/);
  assert.match(
    html,
    /class="[^"]*\bml-button\b[^"]*\bml-button--secondary\b[^"]*\bml-button--md\b[^"]*\bcutter-queue-directory-action\b[^"]*\bml-toolbar-action\b[^"]*"/
  );
  assert.match(html, /class="ml-button ml-button--secondary ml-button--md cutter-queue-detail-directory"/);
  assert.doesNotMatch(html, /class="ml-button ml-button--primary ml-button--md cutter-queue-detail-directory"/);
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
    "本地 18 / 公共 41",
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

  assert.match(html, /class="cutter-sidebar-footer ml-sidebar-status"/);
  assert.match(html, /class="cutter-sidebar-engine-card ml-sidebar-status-card"/);
  assert.equal((html.match(/class="ml-sidebar-status-row"/g) ?? []).length, 4);
  assert.match(html, /class="ml-sidebar-status-label">当前项目/);
  assert.match(html, /class="ml-sidebar-status-value" title="6月4日-2"/);
  assert.match(html, /class="ml-sidebar-status-value ml-sidebar-status-health is-ready"/);
  assert.match(html, /class="cutter-sidebar-user-entry ml-sidebar-user-entry"/);
  assert.match(html, /class="cutter-sidebar-user-icon ml-sidebar-user-icon"/);
  assert.match(html, /class="ml-sidebar-user-name" title="Allen"/);
  assert.match(html, /class="ml-button ml-button--ghost ml-button--sm cutter-sidebar-cache-button ml-sidebar-cache-button"/);
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

test("sidebar footer does not swap local and public library counts", () => {
  const html = renderToStaticMarkup(
    h(CutterSidebarFooter, {
      username: "Allen",
      localCount: 146,
      publicCount: 7950,
      activeTaskCount: 0,
      engineReady: true,
      currentProjectLabel: "6月19日"
    })
  );

  assert.match(html, /本地 146 \/ 公共 7950/);
  assert.equal(html.includes("本地 7950 / 公共 146"), false);
});

test("sidebar footer keeps cutter status visually quiet", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url), "utf8");
  const source = await readFile(new URL("./app/CutterApp.tsx", import.meta.url), "utf8");

  assert.match(source, /className="cutter-sidebar-footer ml-sidebar-status"/);
  assert.match(source, /className="cutter-sidebar-engine-card ml-sidebar-status-card"/);
  assert.match(source, /className="cutter-sidebar-cache-menu-action ml-sidebar-menu-action"[\s\S]*?variant="danger"/);
  assert.doesNotMatch(css, /\.cutter-app \.ml-sidebar-footer\s*{/);
  assert.doesNotMatch(css, /\.cutter-sidebar-(?:footer|engine-card|user-entry|user-icon|cache-button|cache-menu|cache-menu-action)/);
  assert.doesNotMatch(css, /\.cutter-sidebar-theme-switch/);
  assert.match(foundationCss, /\.ml-sidebar-footer\s*{[^}]*margin-top:\s*auto[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s);
  assert.match(foundationCss, /\.ml-sidebar-status\s*{[^}]*display:\s*grid[^}]*gap:\s*8px/s);
  assert.match(foundationCss, /\.ml-sidebar-status-card\s*{[^}]*padding:\s*12px 18px/s);
  assert.match(foundationCss, /\.ml-sidebar-status-row\s*{[^}]*min-height:\s*34px[^}]*justify-content:\s*space-between/s);
  assert.match(foundationCss, /\.ml-sidebar-status-label\s*{[^}]*text-overflow:\s*ellipsis/s);
  assert.match(foundationCss, /\.ml-sidebar-status-value\s*{[^}]*font-size:\s*12px[^}]*font-weight:\s*750/s);
  assert.match(foundationCss, /\.ml-sidebar-status-health::before\s*{[^}]*background:\s*var\(--ml-color-ready\)/s);
  assert.match(foundationCss, /\.ml-sidebar-status-health\.is-failed::before\s*{[^}]*background:\s*var\(--ml-color-failed\)/s);
  assert.match(foundationCss, /\.ml-sidebar-user-entry\s*{[^}]*grid-template-columns:\s*34px minmax\(0,\s*1fr\) auto/s);
  assert.match(foundationCss, /\.ml-sidebar-user-icon\s*{[^}]*background:\s*var\(--ml-color-control-active\)/s);
  assert.match(foundationCss, /\.ml-sidebar-user-name\s*{[^}]*font-size:\s*13px[^}]*font-weight:\s*720/s);
  assert.match(foundationCss, /\.ml-sidebar-cache-button\s*{[^}]*min-height:\s*30px[^}]*padding:\s*0 10px/s);
  assert.match(foundationCss, /\.ml-sidebar-menu\s*{[^}]*bottom:\s*calc\(100% \+ 8px\)[^}]*box-shadow:\s*var\(--ml-shadow-panel\)/s);
  assert.match(foundationCss, /\.ml-sidebar-menu-action\s*{[^}]*justify-content:\s*flex-start/s);
});

test("cutter app does not keep the removed user summary drawer", async () => {
  const source = await readFile(new URL("./app/CutterApp.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /CutterUserSummaryDrawer/);
  assert.doesNotMatch(source, /userSummaryPanelOpen/);
  assert.doesNotMatch(source, /setUserSummaryPanelOpen\(true\)/);
});

test("cutter production shell uses UI Foundation AppShell instead of MacWindow", async () => {
  const source = await readFile(new URL("./app/CutterApp.tsx", import.meta.url), "utf8");

  assert.match(source, /AppShell/);
  assert.doesNotMatch(source, /MacWindow/);
  assert.doesNotMatch(source, /className="cutter-shell"/);
  assert.match(source, /className="cutter-shell-v1"/);
  assert.match(source, /workbenchClassName=\{`cutter-workspace/);
});

test("cutter production app observes the service cut queue instead of running run-next", async () => {
  const source = await readFile(new URL("./app/CutterApp.tsx", import.meta.url), "utf8");

  assert.match(source, /observeServiceCutQueue/);
  assert.doesNotMatch(source, /client\.runNextCutJob\(/);
  assert.doesNotMatch(source, /runNextCutJob:\s*\(\)\s*=>\s*client\.runNextCutJob\(\)/);
});

test("cutter viewport containment is defined once at the shell layer", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const rootRules = css.match(/^html,\nbody,\n#root\s*{/gm) ?? [];
  const workspaceRules = css.match(/^\.cutter-app,\n\.cutter-workspace\s*{/gm) ?? [];
  const appRules = css.match(/^\.cutter-app\s*{/gm) ?? [];
  const rootRule = css.match(/^html,\nbody,\n#root\s*{(?<body>[^}]+)}/m)?.groups?.body ?? "";
  const workspaceRule = css.match(/^\.cutter-app,\n\.cutter-workspace\s*{(?<body>[^}]+)}/m)?.groups?.body ?? "";
  const appRule = css.match(/^\.cutter-app\s*{(?<body>[^}]+)}/m)?.groups?.body ?? "";

  assert.equal(rootRules.length, 1);
  assert.equal(workspaceRules.length, 1);
  assert.equal(appRules.length, 1);
  assert.match(rootRule, /width:\s*100%/);
  assert.match(rootRule, /height:\s*100%/);
  assert.match(rootRule, /min-width:\s*0/);
  assert.match(rootRule, /min-height:\s*0/);
  assert.match(rootRule, /margin:\s*0/);
  assert.match(rootRule, /overflow:\s*hidden/);
  assert.match(workspaceRule, /width:\s*100%/);
  assert.match(workspaceRule, /max-width:\s*100%/);
  assert.match(workspaceRule, /min-width:\s*0/);
  assert.match(workspaceRule, /min-height:\s*0/);
  assert.match(workspaceRule, /overflow:\s*hidden/);
  assert.match(appRule, /height:\s*100vh/);
  assert.match(appRule, /padding:\s*0/);
});

test("cache management page exposes runtime cache and test results", () => {
  installTestWindow();
  window.localStorage.setItem("mixlab:cutter:default_source_filter", "public");
  const data = fixture();
  const html = renderToStaticMarkup(
    h(CacheManagementPage, {
      runtimeStatus: data.runtimeStatus
    })
  );

  assert.equal(cutterRuntimeCacheBytes(data.runtimeStatus), 918 * 1024 * 1024);
  for (const text of [
    "缓存管理",
    "运行缓存",
    "918 MB",
    "Release 缓存",
    "搜索索引",
    "缩略图缓存",
    "原视频缓存",
    "剪切临时区",
    "源视频预检",
    "测试结果",
    "缓存明细",
    "清除界面缓存",
    "Fixture release 缓存已就绪"
  ]) {
    assert.match(html, new RegExp(text));
  }
  assert.match(html, /cutter-cache-stat-body ml-metric-card-body/);
  assert.match(html, /cutter-cache-stat-summary ml-metric-summary/);
  assert.match(html, /class="ml-metric-value"/);
  assert.match(html, /class="ml-metric-description"/);
  assert.match(html, /cutter-cache-meter ml-meter/);
  assert.match(html, /ml-meter-fill is-ready/);
  assert.match(html, /cutter-cache-stats ml-metric-grid/);
  assert.match(html, /cutter-cache-panels ml-panel-grid ml-scroll-region/);
  assert.match(html, /cutter-cache-panel ml-panel-card/);
  assert.match(html, /ml-card-body is-flush cutter-cache-panel-body/);
  assert.doesNotMatch(html, /cutter-card-body-flush/);
  assert.match(html, /ml-data-list ml-data-list--grid cutter-cache-check-list/);
  assert.match(html, /ml-data-row ml-data-row--check cutter-cache-check-row/);
  assert.match(html, /ml-data-list ml-data-list--grid ml-data-list--stacked-detail cutter-cache-detail-list/);
  assert.match(html, /ml-data-row ml-data-row--wide-detail cutter-cache-detail-row/);
  assert.match(html, /ml-inspector--stacked-body/);
  assert.match(html, /cutter-cache-location-section ml-detail-section/);
  assert.match(html, /class="ml-detail-section-title"/);
  assert.match(html, /class="ml-detail-section-copy"/);
});

test("cache management uses foundation metric and detail primitives instead of styling Card internals", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );
  const cachePanelRules = Array.from(css.matchAll(/(?:^|\n)\.cutter-cache-panels\s*{(?<body>[^}]+)}/g));
  const foundationPanelGridRule =
    foundationCss.match(/\.ml-panel-grid\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const shellScrollRegionRule =
    foundationCss.match(/\.ml-scroll-region\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  assert.equal(css.includes(".cutter-cache-stat .ml-card-body"), false);
  assert.equal(css.includes(".cutter-cache-panel .ml-card-body"), false);
  assert.doesNotMatch(css, /^\.cutter-cache-stat-body\s*{/m);
  assert.doesNotMatch(css, /^\.cutter-cache-stats\s*{/m);
  assert.doesNotMatch(css, /^\.cutter-cache-panel\s*{/m);
  assert.doesNotMatch(css, /^\.cutter-cache-check-list\s*{/m);
  assert.doesNotMatch(css, /^\.cutter-cache-check-row\s*{/m);
  assert.doesNotMatch(css, /^\.cutter-cache-detail-row\s*{/m);
  assert.match(foundationCss, /\.ml-metric-card-body\s*{[^}]*min-height:\s*128px/s);
  assert.match(foundationCss, /\.ml-metric-grid\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(150px,\s*1fr\)\)/s);
  assert.match(foundationCss, /\.ml-panel-card\s*{[^}]*align-self:\s*start/s);
  assert.match(foundationCss, /\.ml-detail-section\s*{[^}]*border-bottom:\s*1px solid var\(--ml-border-subtle\)/s);
  assert.equal(css.includes(".cutter-card-body-flush"), false);
  assert.doesNotMatch(css, /\.cutter-cache-panel-body\s*{[^}]*padding:\s*0/s);
  assert.equal(cachePanelRules.length, 0);
  assert.match(foundationPanelGridRule, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*320px\),\s*1fr\)\)/);
  assert.doesNotMatch(foundationPanelGridRule, /overflow-x:\s*hidden/);
  assert.doesNotMatch(foundationPanelGridRule, /overflow-y:\s*auto/);
  assert.doesNotMatch(foundationPanelGridRule, /scrollbar-gutter:\s*stable/);
  assert.match(shellScrollRegionRule, /overflow-x:\s*hidden/);
  assert.match(shellScrollRegionRule, /overflow-y:\s*auto/);
  assert.match(shellScrollRegionRule, /scrollbar-gutter:\s*stable/);
  assert.doesNotMatch(foundationPanelGridRule, /minmax\(0,\s*0\.9fr\)/);
});

test("cache management colors come from foundation tokens", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url), "utf8");
  const cacheCss = css.slice(
    css.indexOf(".cutter-cache-stats"),
    css.indexOf("/* Desktop viewport containment.")
  );

  assert.doesNotMatch(cacheCss, /#101828|#667085|#1f6fff|#12b76a|#f59e0b|#ef4444/);
  assert.doesNotMatch(css, /\.cutter-cache-stat strong\s*{/);
  assert.doesNotMatch(css, /\.cutter-cache-stat p\s*{/);
  assert.doesNotMatch(css, /\.cutter-cache-meter\s*{/);
  assert.doesNotMatch(css, /\.cutter-cache-meter span/);
  assert.match(foundationCss, /\.ml-metric-value\s*{[^}]*color:\s*var\(--ml-color-text\)/s);
  assert.match(foundationCss, /\.ml-metric-description\s*{[^}]*color:\s*var\(--ml-color-text-secondary\)/s);
  assert.match(foundationCss, /\.ml-meter-fill\s*{[^}]*background:\s*var\(--ml-color-accent\)/s);
  assert.match(foundationCss, /\.ml-meter-fill\.is-ready\s*{[^}]*background:\s*var\(--ml-color-ready\)/s);
  assert.match(foundationCss, /\.ml-meter-fill\.is-warning\s*{[^}]*background:\s*var\(--ml-color-warning\)/s);
  assert.match(foundationCss, /\.ml-meter-fill\.is-failed\s*{[^}]*background:\s*var\(--ml-color-failed\)/s);
});

test("cache management separators come from foundation border tokens", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );
  const cacheCss = css.slice(
    css.indexOf(".cutter-cache-stats"),
    css.indexOf("/* Desktop viewport containment.")
  );

  assert.doesNotMatch(cacheCss, /rgba\(118,\s*134,\s*159,\s*0\.08\)/);
  assert.match(foundationCss, /\.ml-data-row\s*{[^}]*border-bottom:\s*1px solid var\(--ml-border-subtle\)/s);
  assert.doesNotMatch(css, /\.ml-data-row\s*{/);
  assert.doesNotMatch(cacheCss, /\.cutter-cache-detail-list dt,\s*\.cutter-cache-detail-list span,\s*\.cutter-cache-check-list p\s*{/);
  assert.doesNotMatch(cacheCss, /\.cutter-cache-check-list > div\s*{[^}]*border-bottom:/s);
  assert.doesNotMatch(cacheCss, /\.cutter-cache-detail-list div\s*{[^}]*border-bottom:/s);
  assert.doesNotMatch(cacheCss, /\.cutter-cache-detail-list dt\s*{[^}]*font-weight:/s);
  assert.doesNotMatch(cacheCss, /\.cutter-cache-detail-list dt\s*{/);
  assert.doesNotMatch(cacheCss, /\.cutter-cache-detail-list dd\s*{/);
  assert.doesNotMatch(cacheCss, /\.cutter-cache-inspector \.ml-inspector-body\s*{/);
  assert.doesNotMatch(cacheCss, /\.cutter-cache-inspector section\s*{/);
  assert.doesNotMatch(cacheCss, /\.cutter-cache-inspector h3\s*{/);
  assert.doesNotMatch(cacheCss, /\.cutter-cache-inspector p\s*{/);
  assert.match(foundationCss, /\.ml-detail-section\s*{[^}]*border-bottom:\s*1px solid var\(--ml-border-subtle\)/s);
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
  assert.match(html, /cutter-page-main ml-workbench-main ml-workbench-main--stack ml-scroll-region/);
  assert.match(html, /aria-pressed="true"[\s\S]*?<span class="ml-button-label">精准剪切<\/span>/);
  assert.match(html, /class="ml-button ml-button--primary ml-button--sm cutter-cut-mode-option"/);
  assert.match(html, /cutter-cut-mode-toggle cutter-settings-cut-mode-toggle ml-segmented-control/);
  assert.match(html, /cutter-appearance-select ml-field-select/);
  assert.match(html, /cutter-settings-doctor ml-data-surface/);
  assert.match(html, /cutter-password-form ml-form-stack/);
  assert.match(html, /cutter-password-current-user ml-form-summary-row/);
  assert.match(html, /cutter-password-field ml-form-field/);
  assert.match(html, /cutter-password-input ml-field-input/);
  assert.match(html, /cutter-settings-security ml-card-section-offset/);
  assert.match(html, /ml-card-body is-flush cutter-info-group-body/);
  assert.doesNotMatch(html, /cutter-card-body-flush/);
  assert.match(html, /ml-data-list cutter-info-list/);
  assert.match(html, /ml-data-row cutter-info-row ml-info-row/);
  assert.match(html, /ml-data-row cutter-settings-doctor-row ml-data-row--compact-check/);
});

test("settings info groups use page body classes instead of styling Card internals", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );

  assert.equal(css.includes(".cutter-info-group .ml-card-body"), false);
  assert.equal(css.includes(".cutter-card-body-flush"), false);
  assert.match(foundationCss, /\.ml-data-row\s*{[^}]*border-bottom:\s*1px solid var\(--ml-border-subtle\)/s);
  assert.doesNotMatch(css, /\.ml-data-row\s*{/);
  assert.equal(css.includes(".cutter-page-header p,\n.cutter-page-header span"), false);
  assert.match(foundationCss, /\.ml-page-description\.ml-page-description\s*{[^}]*line-height:\s*23px/s);
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="settings"\] \.cutter-settings \.cutter-page-main\s*{[^}]*overflow:\s*auto/s
  );
  assert.match(
    foundationCss,
    /\.ml-scroll-region\s*{[^}]*overflow-y:\s*auto/s
  );
  assert.match(
    foundationCss,
    /\.ml-workbench-main--stack\s*{[^}]*grid-auto-rows:\s*max-content/s
  );
  assert.match(
    foundationCss,
    /\.ml-workbench-main--stack\s*{[^}]*align-content:\s*start/s
  );
  assert.doesNotMatch(css, /\.cutter-info-group-body\s*{[^}]*padding:\s*0/s);
  assert.doesNotMatch(css, /^\.cutter-info-groups\s*{/m);
  assert.doesNotMatch(css, /^\.cutter-info-row\s*{/m);
  assert.doesNotMatch(css, /^\.cutter-settings-security\s*{/m);
  assert.match(foundationCss, /\.ml-card-section-offset\s*{[^}]*margin-top:\s*14px/s);
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="settings"\] \.cutter-info-groups\s*{[^}]*overflow:\s*auto/s
  );
  assert.doesNotMatch(css, /\.cutter-settings-doctor-row > span:last-child/);
  assert.doesNotMatch(css, /^\.cutter-settings-doctor-row\s*{/m);
  assert.match(foundationCss, /\.ml-data-row--compact-check\s*{[^}]*grid-template-columns:\s*minmax\(96px,\s*auto\) minmax\(0,\s*1fr\)/s);
  assert.match(foundationCss, /\.ml-data-row--compact-check\s*{[^}]*min-height:\s*38px/s);
});

test("settings controls use foundation field, segmented, and data surface primitives", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url), "utf8");
  const routeControlRule =
    css.match(
      /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-cut-mode-toggle,\s*\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-appearance-select,\s*\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-settings-doctor\s*{(?<body>[^}]+)}/
    )?.groups?.body;

  assert.equal(css.includes(".cutter-cut-mode-toggle button"), false);
  assert.doesNotMatch(css, /^\.cutter-cut-mode-toggle\s*{/m);
  assert.doesNotMatch(css, /^\.cutter-appearance-select\s*{/m);
  assert.doesNotMatch(css, /^\.cutter-settings-doctor\s*{/m);
  assert.equal(css.includes('.cutter-app[data-cutter-web-ready][data-cutter-route="settings"] .cutter-cut-mode-toggle button'), false);
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="settings"\] \.cutter-cut-mode-toggle\s*{/
  );
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="settings"\] \.cutter-appearance-select\s*{/
  );
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route="settings"\] \.cutter-settings-doctor\s*{/
  );
  assert.match(foundationCss, /\.ml-segmented-control\s*{[^}]*display:\s*inline-flex/s);
  assert.match(foundationCss, /\.ml-segmented-control\s*{[^}]*border:\s*1px solid var\(--ml-border-subtle\)/s);
  assert.match(foundationCss, /\.ml-segmented-control\s*{[^}]*border-radius:\s*var\(--ml-radius-panel\)/s);
  assert.match(foundationCss, /\.ml-field-select\s*{[^}]*border:\s*1px solid var\(--ml-border-subtle\)/s);
  assert.match(foundationCss, /\.ml-field-select\s*{[^}]*border-radius:\s*var\(--ml-radius-field\)/s);
  assert.match(foundationCss, /\.ml-field-select\s*{[^}]*color:\s*var\(--ml-color-text\)/s);
  assert.match(
    foundationCss,
    /\.ml-field-select\s*{[^}]*background-color:\s*color-mix\(in srgb,\s*var\(--ml-color-surface\) 88%,\s*transparent\)/s
  );
  assert.match(foundationCss, /\.ml-data-surface\s*{[^}]*border:\s*1px solid var\(--ml-border-subtle\)/s);
  assert.match(foundationCss, /\.ml-data-surface\s*{[^}]*border-radius:\s*var\(--ml-radius-panel\)/s);
  assert.match(foundationCss, /\.ml-form-stack\s*{[^}]*display:\s*grid/s);
  assert.match(foundationCss, /\.ml-form-summary-row\s*{[^}]*min-height:\s*34px/s);
  assert.match(foundationCss, /\.ml-form-field\s*{[^}]*font-size:\s*12px/s);
  assert.match(foundationCss, /\.ml-field-input\s*{[^}]*height:\s*38px/s);
  assert.match(foundationCss, /\.ml-form-message--danger\s*{[^}]*color:\s*var\(--ml-color-danger\)/s);
  assert.match(foundationCss, /\.ml-form-message--success\s*{[^}]*color:\s*var\(--ml-color-success\)/s);
  assert.equal(routeControlRule, undefined);
  assert.doesNotMatch(css, /\.cutter-appearance-select\s*{[^}]*rgba\(118,\s*134,\s*159/s);
  assert.doesNotMatch(css, /\.cutter-settings-doctor\s*{[^}]*#101828/s);
  assert.doesNotMatch(css, /\.cutter-(?:appearance-select|settings-doctor)\s*{[^}]*border-radius:\s*(?:8|9|10)px/s);
  assert.doesNotMatch(css, /^\.cutter-password-form\s*{/m);
  assert.doesNotMatch(css, /^\.cutter-password-current-user\s*{/m);
  assert.doesNotMatch(css, /\.cutter-password-current-user strong/);
  assert.doesNotMatch(css, /\.cutter-password-form label/);
  assert.doesNotMatch(css, /\.cutter-password-form input/);
  assert.doesNotMatch(css, /^\.cutter-password-message\s*{/m);
  assert.doesNotMatch(css, /\.cutter-password-message\.is-error/);
  assert.doesNotMatch(css, /\.cutter-password-message\.is-success/);
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

  assert.match(html, /class="cutter-app ml-theme-cutter"/);
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

test("desktop setup treats a saved public library and workspace as complete", () => {
  assert.equal(
    hasCompleteDesktopConfig({
      api_host: "127.0.0.1",
      api_port: 3789,
      public_library_root: String.raw`\\NAS\MixLab\PublicLibrary`,
      local_workspace_root: String.raw`C:\Users\Allen\Videos\MixLabLocal`
    }),
    true
  );

  assert.equal(
    hasCompleteDesktopConfig({
      api_host: "127.0.0.1",
      api_port: 3789,
      public_library_root: "",
      local_workspace_root: String.raw`C:\Users\Allen\Videos\MixLabLocal`
    }),
    false
  );

  assert.equal(
    hasCompleteDesktopConfig({
      api_host: "127.0.0.1",
      api_port: 3789,
      public_library_root: String.raw`\\NAS\MixLab\PublicLibrary`,
      local_workspace_root: ""
    }),
    false
  );
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
  const tokenCss = await readFile(new URL("../../../packages/ui-foundation/src/tokens.css", import.meta.url), "utf8");
  const darkRule =
    tokenCss.match(
      /\[data-appearance-mode="dark"\],\s*\[data-appearance-mode="system"\]\s*{(?<body>[^}]+)}/
    )?.groups?.body ?? "";
  const lightRule = tokenCss.match(/\[data-appearance-mode="light"\]\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const appearanceBaseRule = tokenCss.match(/\[data-appearance-mode\]\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const mediaRules = Array.from(
    (css + tokenCss).matchAll(/\[data-appearance-mode="(?:dark|light|system)"\]\s+(?:video|img)[^{]*{(?<body>[^}]+)}/g)
  );

  assert.match(darkRule, /color-scheme:\s*dark/);
  assert.match(darkRule, /--ml-color-canvas:\s*#101318/);
  assert.match(darkRule, /--ml-color-text:\s*#f3f6fa/);
  assert.match(darkRule, /--ml-color-text-secondary:\s*#a9b4c3/);
  assert.match(darkRule, /--ml-color-text-tertiary:\s*#748194/);
  assert.match(appearanceBaseRule, /color:\s*var\(--ml-color-text\)/);
  assert.match(appearanceBaseRule, /background:\s*var\(--ml-color-canvas\)/);
  assert.match(lightRule, /color-scheme:\s*light/);
  assert.match(lightRule, /--ml-color-canvas:\s*#f7f8fa/);
  assert.match(lightRule, /--ml-color-text:\s*#151a21/);
  assert.equal(darkRule.includes("#f2f4f7"), false);
  assert.equal((css + tokenCss).includes('data-appearance-mode="night"'), false);
  assert.equal((css + tokenCss).includes('data-appearance-mode="comfort"'), false);
  assert.doesNotMatch(css, /\.cutter-app\[data-appearance-mode="(?:dark|light|system)"\]\s*{/);
  assert.doesNotMatch(css, /\.cutter-app,\s*\.cutter-app\[data-appearance-mode="dark"\]/);
  assert.equal(css.includes("Google Material Design 3 cutter contract"), false);
  assert.equal(css.includes("Material compact variant for the search-select-cut workbench"), false);
  assert.doesNotMatch(css, /^h1,\s*h2,\s*p\s*{/m);
  assert.doesNotMatch(css, /^h1\s*{/m);
  assert.doesNotMatch(css, /^h2\s*{/m);
  assert.doesNotMatch(css, /\.cutter-app \.ml-segmented(?:\s|\.|:|\{)/);
  assert.equal(css.includes("#14161a"), false);
  assert.equal(css.includes("#b8c0cc"), false);
  assert.equal(css.includes("#f6f8fb"), false);
  assert.equal(mediaRules.some((match) => match.groups?.body.includes("filter")), false);
});

test("cutter dark theme overrides foundation light surfaces with theme tokens", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );
  const tokenCss = await readFile(new URL("../../../packages/ui-foundation/src/tokens.css", import.meta.url), "utf8");
  const cutterThemeRule = tokenCss.match(/\.ml-theme-cutter\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const data = fixture();
  const publicHtml = renderToStaticMarkup(
    h(PublicLibraryPage, {
      library: data.library,
      selectedSourceVideoId: data.library.videos[0]?.source_video_id,
      runtimeStatus: data.runtimeStatus,
      onSelectSourceVideo: () => undefined
    })
  );

  assert.doesNotMatch(css, /\.cutter-shell(?!-v1)(?:\s|,|\{|$)/);
  assert.doesNotMatch(css, /\.cutter-app(?:\[data-cutter-web-ready\])? \.cutter-shell-v1(?:\s|>|\{)/);
  assert.match(foundationCss, /\.ml-app-shell\s*{[^}]*grid-template-columns:\s*var\(--ml-sidebar-width\) minmax\(0,\s*1fr\)/s);
  assert.match(foundationCss, /\.ml-app-shell\s*{[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/s);
  assert.doesNotMatch(css, /\.cutter-app \.ml-sidebar\s*{/);
  assert.doesNotMatch(css, /\.cutter-app \.ml-sidebar-brand(?:\s|:|\.)/);
  assert.doesNotMatch(css, /\.cutter-app \.ml-sidebar-item(?:\s|:|\.)/);
  assert.doesNotMatch(css, /\.cutter-app \.ml-sidebar-icon(?:\s|:|\.)/);
  assert.doesNotMatch(css, /\.cutter-app\[data-cutter-web-ready\] \.ml-sidebar\s*{/);
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\] \.ml-sidebar-(?:brand|brand-mark|nav|item|icon)(?:\s|:|\.|>|\{)/
  );
  assert.doesNotMatch(css, /\.cutter-app\[data-cutter-web-ready\] \.ml-sidebar-item\.is-active \.ml-sidebar-icon\s*{/);
  assert.doesNotMatch(css, /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.ml-sidebar-item\s*{/);
  assert.match(cutterThemeRule, /--ml-sidebar-brand-margin:\s*0 0 14px/);
  assert.match(cutterThemeRule, /--ml-sidebar-brand-mark-background:\s*#0f2b5f/);
  assert.match(cutterThemeRule, /--ml-sidebar-nav-margin-top:\s*12px/);
  assert.match(cutterThemeRule, /--ml-workbench-background:\s*var\(--ml-color-window\)/);
  assert.doesNotMatch(css, /--ml-sidebar-brand-margin:\s*0 0 14px/);
  assert.doesNotMatch(css, /--ml-workbench-background:\s*var\(--ml-color-window\)/);
  assert.match(foundationCss, /\.ml-workbench\s*{[^}]*display:\s*grid[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)[^}]*overflow:\s*hidden/s);
  assert.match(foundationCss, /\.ml-workbench\s*{[^}]*background:\s*var\(--ml-workbench-background,\s*var\(--ml-color-surface\)\)/s);
  assert.match(foundationCss, /\.ml-workbench-content\s*{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*min-height:\s*0/s);
  assert.match(foundationCss, /\.ml-workbench-content\s*{[^}]*border:\s*0[^}]*border-radius:\s*0[^}]*padding:\s*0/s);
  assert.match(foundationCss, /\.ml-workbench-content\s*{[^}]*overflow:\s*auto/s);
  assert.doesNotMatch(css, /\.cutter-app\[data-cutter-web-ready\] \.ml-workbench\.cutter-workspace\s*{/);
  assert.doesNotMatch(css, /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-workspace\s*{/);
  assert.doesNotMatch(css, /\.cutter-app\[data-cutter-web-ready\] \.ml-workbench-content\s*{/);
  assert.match(css, /\.cutter-app\[data-cutter-web-ready\] \.cutter-workspace\.is-content-locked \.ml-workbench-content\s*{[^}]*overflow:\s*hidden/s);
  assert.doesNotMatch(css, /\.cutter-desktop-diagnostics,\s*\.cutter-app \.ml-inspector,\s*\.cutter-app \.ml-media-panel/);
  assert.doesNotMatch(css, /\.cutter-app \.ml-inspector,\s*\.cutter-app \.ml-media-panel,\s*\.cutter-empty-state/);
  assert.doesNotMatch(css, /\.cutter-app \.ml-inspector-header\s*{/);
  assert.doesNotMatch(css, /\.cutter-app \.ml-inspector-title\s*{/);
  assert.doesNotMatch(css, /\.cutter-app \.ml-inspector-body\s*{/);
  assert.doesNotMatch(css, /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.ml-inspector\s*{/);
  assert.doesNotMatch(css, /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.ml-inspector-header\s*{/);
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-library-inspector \.ml-inspector-title\s*{/
  );
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-operational-inspector \.ml-inspector-title\s*{/
  );
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-library-inspector \.ml-inspector-(?:header|body)\s*{/
  );
  assert.doesNotMatch(
    css,
    /\.cutter-app\[data-cutter-web-ready\]\[data-cutter-route\] \.cutter-operational-inspector \.ml-inspector-(?:header|body)\s*{/
  );
  assert.equal(css.includes(".cutter-library-detail-stack"), false);
  assert.equal(css.includes(".cutter-library-detail-player"), false);
  assert.equal(css.includes(".cutter-local-detail-player"), false);
  assert.match(publicHtml, /class="ml-detail-stack"/);
  assert.match(publicHtml, /class="ml-media-frame ml-media-frame--16x9 ml-media-frame--dark ml-media-fill"/);
  const libraryInspectorRule =
    foundationCss.match(/\.ml-workbench-inspector\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  assert.match(libraryInspectorRule, /width:\s*100%/);
  assert.equal(
    css.includes(".cutter-app[data-cutter-web-ready][data-cutter-route] .cutter-library-inspector"),
    false
  );
  assert.doesNotMatch(libraryInspectorRule, /border(?:-radius|-color)?:/);
  assert.doesNotMatch(libraryInspectorRule, /background(?:-color)?:/);
  assert.doesNotMatch(libraryInspectorRule, /box-shadow:/);
  assert.doesNotMatch(libraryInspectorRule, /display:\s*grid/);
  assert.doesNotMatch(libraryInspectorRule, /grid-template-rows/);
  assert.match(
    foundationCss,
    /\.ml-inspector\.ml-inspector--workbench\s*{[^}]*border-color:\s*var\(--ml-border-subtle\)[^}]*background-color:\s*color-mix\(in srgb,\s*var\(--ml-color-surface\) 72%,\s*transparent\)[^}]*box-shadow:\s*var\(--ml-shadow-panel\)/s
  );
  assert.match(
    foundationCss,
    /\.ml-inspector\.ml-inspector--workbench \.ml-inspector-header\s*{[^}]*border-color:\s*var\(--ml-border-subtle\)/s
  );
  assert.match(foundationCss, /\.ml-sidebar-item\.is-active\s*{[^}]*background:\s*var\(--ml-color-control-active\)/s);
  assert.match(foundationCss, /\.ml-media-row\.is-selected\s*{[^}]*background:\s*var\(--ml-color-selected\)/s);
  assert.match(foundationCss, /\.ml-transcript-row\.is-current-hit\s*{[^}]*background:\s*transparent/s);
  assert.match(
    foundationCss,
    /\.ml-transcript-row\.is-selected,\s*\.ml-transcript-row\.is-drag-preview\s*{[^}]*background:\s*color-mix\(in srgb,\s*var\(--ml-color-accent\) 10%,\s*transparent\)/s
  );
  assert.match(foundationCss, /\.ml-floating-selection-anchor\s*{[^}]*position:\s*fixed/s);
  assert.match(tokenCss, /\[data-appearance-mode="dark"\],[\s\S]*?--ml-color-canvas:\s*#101318/s);
  assert.match(tokenCss, /\[data-appearance-mode="dark"\],[\s\S]*?--ml-color-surface:\s*#18212b/s);
  assert.doesNotMatch(css, /\.cutter-app,\s*\.cutter-app\[data-appearance-mode="dark"\]/);
  assert.equal((css + tokenCss).includes('data-appearance-mode="night"'), false);
  assert.equal((css + tokenCss).includes('data-appearance-mode="comfort"'), false);
});

test("material locator candidate covers fill their thumbnail slot", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const foundationCss = await readFile(
    new URL("../../../packages/ui-foundation/src/layout.css", import.meta.url),
    "utf8"
  );
  const coverRule = foundationCss.match(/\.ml-media-row-thumb\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";
  const placeholderRule =
    foundationCss.match(/\.ml-media-row-thumb\.is-placeholder\s*{(?<body>[^}]+)}/)?.groups?.body ?? "";

  assert.match(coverRule, /width:\s*64px/);
  assert.match(coverRule, /height:\s*38px/);
  assert.match(coverRule, /object-fit:\s*cover/);
  assert.equal(coverRule.includes("aspect-ratio"), false);
  assert.match(placeholderRule, /--ml-color-media-placeholder/);
  assert.doesNotMatch(css, /\.cutter-cover-placeholder\s*{/);
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
  const noopSubmit = async () => undefined;
  const unknown = renderToStaticMarkup(
    h(CutterLoginGate, {
      status: "unknown",
      deviceName: "Mac 剪辑端 · Safari",
      onLogin: noopSubmit,
      onRegister: noopSubmit,
      children: h("p", null, "工作台内容")
    })
  );
  assert.match(unknown, /登录剪辑师工作台/);
  assert.match(unknown, /用户名/);
  assert.match(unknown, /密码/);
  assert.match(unknown, /登录/);
  assert.match(unknown, /注册/);
  assert.match(unknown, /当前设备：Mac 剪辑端 · Safari/);
  assert.match(unknown, /管理员审核后即可进入/);
  assert.equal(unknown.includes("IP 只用于诊断"), false);
  assert.equal(unknown.includes("工作台内容"), false);

  const pending = renderToStaticMarkup(
    h(CutterLoginGate, {
      status: "pending",
      onLogin: noopSubmit,
      onRegister: noopSubmit,
      children: h("p", null, "工作台内容")
    })
  );
  assert.match(pending, /申请已提交，请等待管理员审核。/);
  assert.match(pending, /账号已提交审核/);

  const rejected = renderToStaticMarkup(
    h(CutterLoginGate, {
      status: "rejected",
      onLogin: noopSubmit,
      onRegister: noopSubmit,
      children: h("p", null, "工作台内容")
    })
  );
  assert.match(rejected, /申请未通过，请联系管理员。/);
  assert.match(rejected, /登录/);

  const disabled = renderToStaticMarkup(
    h(CutterLoginGate, {
      status: "disabled",
      onLogin: noopSubmit,
      onRegister: noopSubmit,
      children: h("p", null, "工作台内容")
    })
  );
  assert.match(disabled, /账号已停用，请联系管理员。/);
  assert.match(disabled, /登录/);

  const expired = renderToStaticMarkup(
    h(CutterLoginGate, {
      status: "unknown",
      message: "登录已失效，请重新登录或联系管理员。",
      onLogin: noopSubmit,
      onRegister: noopSubmit,
      children: h("p", null, "工作台内容")
    })
  );
  assert.match(expired, /登录已失效，请重新登录或联系管理员。/);

  const approved = renderToStaticMarkup(
    h(CutterLoginGate, {
      status: "approved",
      onLogin: noopSubmit,
      onRegister: noopSubmit,
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
