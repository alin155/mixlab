import assert from "node:assert/strict";
import test from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createFixtureCutterData } from "./fixture-client.ts";
import { PublicLibraryPage } from "./features/public-library/PublicLibraryPage.tsx";
import { SourceDetailPage } from "./features/source-detail/SourceDetailPage.tsx";
import { SearchPage } from "./features/search/SearchPage.tsx";
import { CutListPage } from "./features/cut-list/CutListPage.tsx";
import { LocalLibraryPage } from "./features/local-library/LocalLibraryPage.tsx";
import { CutQueuePage } from "./features/cut-queue/CutQueuePage.tsx";
import { SettingsPage } from "./features/settings/SettingsPage.tsx";
import { CutterLoginGate } from "./features/login/CutterLoginGate.tsx";
import {
  clearCutterAuthSession,
  createDeviceId,
  readCutterAuthSession,
  writeCutterAuthSession,
  CUTTER_AUTH_STORAGE_KEY
} from "./auth.ts";
import { shouldShowLoginGate } from "./app/CutterApp.tsx";
import { createCutListItemFromSegments } from "./state/cut-list.ts";
import { createQueueJobsFromCutList } from "./state/cut-queue.ts";

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

test("public library is a read-only gallery of available source videos", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(PublicLibraryPage, {
      library: data.library,
      selectedSourceVideoId: data.primaryDetail.source_video_id
    })
  );

  for (const text of ["可用原素材", "全部可用资源", "现金流管理与风险控制", "经营分析", "由管理端配置"]) {
    assert.match(html, new RegExp(text));
  }

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
      selectedSegments: data.primaryDetail.transcript.segments.slice(1, 4)
    })
  );

  for (const text of [
    "原视频与完整文案",
    "完整文案",
    "连续选择",
    "已选 3 句",
    "加入待剪清单",
    "现金流短片开场"
  ]) {
    assert.match(html, new RegExp(text));
  }

  assert.match(html, /<video/);
  assert.match(html, /data-selection-mode="continuous"/);
});

test("search page groups hits by source video and avoids sentence waterfall", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(SearchPage, {
      search: data.search,
      query: data.search.query
    })
  );

  for (const text of ["按原素材分组", "2 组命中", "现金流管理与风险控制", "上下文文案"]) {
    assert.match(html, new RegExp(text));
  }

  assert.equal(html.includes("sentence-waterfall"), false);
});

test("cut list renders order, range, text, mode, reorder, delete, clear, and submit", () => {
  const data = fixture();
  const html = renderToStaticMarkup(h(CutListPage, { items: data.cutList }));

  for (const text of ["待剪清单", "顺序", "时间段", "选中文案", "smart", "上移", "删除", "清空", "提交剪切队列"]) {
    assert.match(html, new RegExp(text));
  }
});

test("local library is independent and exposes reusable local clips", () => {
  const data = fixture();
  const html = renderToStaticMarkup(h(LocalLibraryPage, { catalog: data.localClips, query: "现金流" }));

  for (const text of ["本地素材库", "可复用片段", "搜索本地素材", "打开视频", "显示文件夹", "复用", "来源追踪"]) {
    assert.match(html, new RegExp(text));
  }

  assert.equal(html.includes("可用原素材"), false);
});

test("cut queue renders every task state and retry affordance", () => {
  const data = fixture();
  const html = renderToStaticMarkup(h(CutQueuePage, { jobs: data.queue }));

  for (const text of ["剪切队列", "pending", "running", "done", "failed", "重试", "不阻塞搜索"]) {
    assert.match(html, new RegExp(text));
  }
});

test("cut queue renders optional API refresh and run controls", () => {
  const data = fixture();
  const html = renderToStaticMarkup(
    h(CutQueuePage, {
      jobs: data.queue,
      onRefresh: () => undefined,
      onRunNext: () => undefined
    })
  );

  assert.match(html, /刷新队列/);
  assert.match(html, /执行下一个/);
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
    device_id: firstDeviceId,
    session_token: "session-001",
    username: "小王"
  });
  assert.deepEqual(readCutterAuthSession(), {
    device_id: firstDeviceId,
    session_token: "session-001",
    username: "小王"
  });

  clearCutterAuthSession();
  assert.equal(readCutterAuthSession(), null);
});

test("cutter auth storage tolerates corrupt JSON", () => {
  installTestWindow();
  window.localStorage.setItem(CUTTER_AUTH_STORAGE_KEY, "{not-json");

  assert.equal(readCutterAuthSession(), null);
  assert.equal(window.localStorage.getItem(CUTTER_AUTH_STORAGE_KEY), null);
});

test("login gate renders Chinese application states and only approved status renders children", async () => {
  const unknown = renderToStaticMarkup(
    h(CutterLoginGate, {
      status: "unknown",
      onApply: async () => undefined,
      children: h("p", null, "工作台内容")
    })
  );
  assert.match(unknown, /申请使用剪辑师工作台/);
  assert.match(unknown, /用户名/);
  assert.match(unknown, /提交申请/);
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

  const approved = renderToStaticMarkup(
    h(CutterLoginGate, {
      status: "approved",
      onApply: async () => undefined,
      children: h("p", null, "工作台内容")
    })
  );
  assert.equal(approved, "<p>工作台内容</p>");
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
