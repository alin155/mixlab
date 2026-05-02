import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createFixtureAdminApiClient, loadAdminDashboardData } from "./api.ts";
import { DashboardPage } from "./features/dashboard/DashboardPage.tsx";
import { DoctorPage } from "./features/doctor/DoctorPage.tsx";
import { IndexPublishPage } from "./features/index-publish/IndexPublishPage.tsx";
import { LibrarySettingsPage } from "./features/library-settings/LibrarySettingsPage.tsx";
import { PreprocessJobsPage } from "./features/preprocess-jobs/PreprocessJobsPage.tsx";
import { SettingsPage } from "./features/settings/SettingsPage.tsx";
import { AdminControlButton, EmptyState, MetricBand } from "./features/shared.tsx";
import { SourceVideosPage } from "./features/source-videos/SourceVideosPage.tsx";

async function fixtureData() {
  return loadAdminDashboardData(createFixtureAdminApiClient());
}

test("dashboard renders restrained library status", async () => {
  const html = renderToStaticMarkup(h(DashboardPage, { data: await fixtureData() }));

  for (const text of [
    "全局风险和产能",
    "原视频总数",
    "Ready",
    "Processing",
    "Queued",
    "Unprocessed",
    "Failed",
    "Index Required",
    "处理未处理",
    "磁盘空间",
    "当前任务",
    "v000027"
  ]) {
    assert.match(html, new RegExp(text));
  }
});

test("library settings renders root paths and checks", async () => {
  const html = renderToStaticMarkup(h(LibrarySettingsPage, { data: await fixtureData() }));

  for (const text of [
    "路径与权限",
    "/Volumes/PublicLibrary",
    "source-videos",
    ".mixlab-library",
    "MLPUB-001",
    "1.0.0",
    "路径校验",
    "初始化素材库",
    "打开文件夹",
    "data-control-state=\"native-boundary\""
  ]) {
    assert.match(html, new RegExp(text.replaceAll(".", "\\.")));
  }
});

test("source video management renders public metadata controls", async () => {
  const html = renderToStaticMarkup(h(SourceVideosPage, { data: await fixtureData() }));

  for (const text of [
    "公共元数据",
    "搜索文件名 / 标签 / 相对路径",
    "封面",
    "对剪辑师可见",
    "标签",
    "说明",
    "讲师",
    "课程",
    "分类",
    "现金流管理与风险控制",
    "保存公开说明",
    "data-control-state=\"m9b-api\""
  ]) {
    assert.match(html, new RegExp(text));
  }
});

test("preprocess jobs render failure retry and later success", async () => {
  const html = renderToStaticMarkup(h(PreprocessJobsPage, { data: await fixtureData() }));

  for (const text of [
    "生产队列",
    "正在处理",
    "队列中",
    "最近完成",
    "失败可重试",
    "失败策略",
    "启动 Worker",
    "data-control-state=\"native-boundary\"",
    "build-keyframes",
    ".mixlab-library/logs/P000037.log",
    "DashScope ASR 网络超时",
    "J000041"
  ]) {
    assert.match(html, new RegExp(text.replaceAll(".", "\\.")));
  }
});

test("index health renders current pointer and repair controls", async () => {
  const html = renderToStaticMarkup(h(IndexPublishPage, { data: await fixtureData() }));

  for (const text of [
    "索引健康与修复",
    "修复 index-required",
    "current.json",
    "v000027",
    "Ready 数量",
    "schema",
    "校验",
    "原子切换 current"
  ]) {
    assert.match(html, new RegExp(text.replaceAll(".", "\\.")));
  }
});

test("doctor page renders checks and JSON export", async () => {
  const html = renderToStaticMarkup(h(DoctorPage, { data: await fixtureData() }));

  for (const text of ["诊断系统问题", "公共路径", "Manifest", "FFmpeg", "ASR", "重新运行 Doctor", "导出诊断 JSON"]) {
    assert.match(html, new RegExp(text));
  }
});

test("settings render runtime and redacted ASR key state", async () => {
  const html = renderToStaticMarkup(h(SettingsPage, { data: await fixtureData() }));

  for (const text of [
    "运行策略",
    "阿里云百炼 / DashScope",
    "paraformer-v2",
    "mp3_16k_mono_64k",
    "wav_16k_mono_pcm_s16le",
    "已配置，已隐藏",
    "编辑 API Key",
    "P000037 ASR 网络超时"
  ]) {
    assert.match(html, new RegExp(text.replaceAll(".", "\\.")));
  }

  assert.equal(html.includes("sk-"), false);
});

test("shared admin UI primitives expose control states and empty state language", () => {
  const html = renderToStaticMarkup(
    h("section", null,
      h(MetricBand, {
        items: [
          { label: "Ready", value: 120, caption: "对剪辑师可见" },
          { label: "Failed", value: 2, caption: "失败可重试" }
        ]
      }),
      h(AdminControlButton, {
        label: "处理未处理",
        state: "m9b-api",
        reason: "M9B 接加入队接口。",
        variant: "primary"
      }),
      h(EmptyState, {
        title: "没有匹配的原视频",
        detail: "请调整搜索词或状态筛选。"
      })
    )
  );

  assert.match(html, /data-control-state="m9b-api"/);
  assert.match(html, /处理未处理/);
  assert.match(html, /M9B 接加入队接口/);
  assert.match(html, /没有匹配的原视频/);
  assert.match(html, /对剪辑师可见/);
});

test("M9B UI shell orchestrates Admin API mutations without duplicating toolbar actions", () => {
  const source = readFileSync(resolve("apps/admin-web/src/app/AdminApp.tsx"), "utf8");

  assert.equal(source.includes("runAction("), true);
  assert.equal(source.includes("onInitializeLibrary"), true);
  assert.equal(source.includes("updateSourceVideoMetadata"), true);
  assert.equal(source.includes('actions={["扫描源视频", "处理", "Doctor"]}'), false);
  assert.equal(source.includes("actions={[]}"), true);
});

test("api-backed page controls become enabled when handlers are supplied", async () => {
  const data = await fixtureData();
  const noop = () => {};
  const html = renderToStaticMarkup(
    h(SourceVideosPage, {
      data,
      onScanSourceVideos: noop,
      onQueueUnprocessedVideos: noop,
      onRetryFailedVideos: noop,
      onUpdateSourceVideoMetadata: noop
    })
  );

  assert.match(html, /data-control-state="m9b-api"/);
  assert.match(html, /保存公开说明/);
  assert.doesNotMatch(html, /保存公开说明[^<]*<\/button>.*disabled/s);
  assert.match(html, /data-control-state="read-only" disabled=""/);
});
