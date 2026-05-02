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
import { createCutListItemFromSegments } from "./state/cut-list.ts";
import { createQueueJobsFromCutList } from "./state/cut-queue.ts";

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
