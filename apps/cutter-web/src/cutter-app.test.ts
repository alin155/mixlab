import assert from "node:assert/strict";
import test from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createFixtureCutterData } from "./fixture-client.ts";
import { PublicLibraryPage } from "./features/public-library/PublicLibraryPage.tsx";
import { SourceDetailPage } from "./features/source-detail/SourceDetailPage.tsx";
import { SearchPage } from "./features/search/SearchPage.tsx";
import { MaterialLocatorPage } from "./features/material-locator/MaterialLocatorPage.tsx";
import { CutListPage } from "./features/cut-list/CutListPage.tsx";
import { LocalLibraryPage } from "./features/local-library/LocalLibraryPage.tsx";
import { CutQueuePage } from "./features/cut-queue/CutQueuePage.tsx";
import { SettingsPage } from "./features/settings/SettingsPage.tsx";
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
  materialSelectionFromResult,
  shouldClearSessionForLoginStatusError,
  shouldRefreshCutQueueForRoute,
  shouldRetryPendingLoginError,
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
import { createQueueJobsFromCutList } from "./state/cut-queue.ts";
import { buildMaterialLocatorSections } from "./state/material-locator.ts";

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
      localStorage
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
    createdAt: "2026-05-02T10:00:00.000Z"
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
  assert.equal(routeFromHash(""), "material-locator");
  assert.equal(routeFromHash("#public-library"), "public-library");
  assert.equal(routeTitle("material-locator"), "素材定位");

  const labels = CUTTER_NAV_ITEMS.map((item) => item.label).join(" / ");
  for (const oldLabel of ["原视频详情", "搜索与文案", "待剪清单", "剪切队列"]) {
    assert.equal(labels.includes(oldLabel), false);
  }
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
  const html = renderToStaticMarkup(
    h(MaterialLocatorPage, {
      library: data.library,
      localClips: data.localClips,
      search: data.search,
      query: data.search.query,
      sourceFilter: "all",
      orientationFilter: "all",
      selectedDetail: data.primaryDetail,
      selectedSegments: data.primaryDetail.transcript.segments.slice(1, 3),
      highlightedSegmentIds: ["s-001"],
      cutNotice: "已加入剪切任务 · 等待中 1",
      queue: data.queue,
      onSearch: () => undefined,
      onSelectMaterial: () => undefined,
      onSelectTranscriptSegment: () => undefined,
      onCutSelection: () => undefined,
      onCancelSelection: () => undefined
    })
  );

  for (const text of [
    "素材定位",
    "搜索文案关键词或粘贴文案",
    "全部",
    "本地素材",
    "公共原素材",
    "横版",
    "竖版",
    "完整文案",
    "剪切这段",
    "已加入剪切任务 · 等待中 1",
    "剪切中",
    "查看全部任务"
  ]) {
    assert.match(html, new RegExp(text));
  }

  assert.equal(html.includes("片段篮"), false);
  assert.equal(html.includes("待剪清单"), false);
  assert.ok(html.indexOf("本地素材") < html.indexOf("公共原素材"));
  assert.match(html, /data-page="material-locator"/);
  assert.match(html, /<video/);
  assert.match(html, /data-testid="locator-video"/);
  assert.match(html, /data-testid="preview-selection"/);
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
      selectedSegments: data.primaryDetail.transcript.segments.slice(0, 2),
      highlightedSegmentIds: ["s-001"],
      queue: data.queue
    })
  );

  assert.match(html, /data-selection-mode="natural-text"/);
  assert.match(html, /data-segment-id="s-001"/);
  assert.match(html, /现金流不是利润表的影子。/);
  assert.equal(html.includes("选择此句"), false);
  assert.equal(html.includes("cutter-segment"), false);
  assert.equal(html.includes("内部映射"), false);
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

test("selecting a search result keeps its hit range highlighted and selected", () => {
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
  assert.deepEqual(materialSelectionFromResult(result), {
    range: {
      startSegmentId: "s-001",
      endSegmentId: "s-003"
    },
    highlightedSegmentIds: ["s-001", "s-002", "s-003"]
  });
});

test("cut list renders order, range, text, mode, reorder, delete, clear, and submit", () => {
  const data = fixture();
  const html = renderToStaticMarkup(h(CutListPage, { items: data.cutList }));

  for (const text of ["待剪清单", "顺序", "时间段", "选中文案", "smart", "上移", "删除", "清空", "提交剪切队列"]) {
    assert.match(html, new RegExp(text));
  }
});

test("local library is independent and exposes local recut materials with orientation filters", () => {
  const data = fixture();
  const html = renderToStaticMarkup(h(LocalLibraryPage, { catalog: data.localClips, query: "现金流" }));

  for (const text of ["本地素材库", "本地可复剪素材", "全部", "横版", "竖版", "未知", "搜索本地素材", "打开视频", "显示文件夹", "再次选段", "来源追踪"]) {
    assert.match(html, new RegExp(text));
  }

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
      onRunNext: () => undefined
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
    "继续剪切"
  ]) {
    assert.match(html, new RegExp(text));
  }

  assert.equal(html.includes("剪切队列"), false);
  assert.equal(html.includes("执行下一个"), false);
  for (const englishStatus of ["pending", "running", "done", "failed"]) {
    assert.equal(html.includes(`<strong>${englishStatus}</strong>`), false);
  }
  assert.match(html, /data-page="cut-tasks"/);
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
  const html = renderToStaticMarkup(h(SettingsPage, { settings: data.settings }));

  for (const text of [
    "设置",
    "公共素材库挂载",
    "本地工作区",
    "FFmpeg",
    "默认剪切模式",
    "并发数",
    "Doctor",
    "mp3_16k_mono_64k"
  ]) {
    assert.match(html, new RegExp(text));
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
