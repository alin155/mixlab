import assert from "node:assert/strict";
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
import { SourceVideosPage } from "./features/source-videos/SourceVideosPage.tsx";

async function fixtureData() {
  return loadAdminDashboardData(createFixtureAdminApiClient());
}

test("dashboard renders restrained library status", async () => {
  const html = renderToStaticMarkup(h(DashboardPage, { data: await fixtureData() }));

  for (const text of [
    "原视频总数",
    "Ready",
    "Processing",
    "Queued",
    "Unprocessed",
    "Failed",
    "Index Required",
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
    "/Volumes/PublicLibrary",
    "source-videos",
    ".mixlab-library",
    "MLPUB-001",
    "1.0.0",
    "路径校验"
  ]) {
    assert.match(html, new RegExp(text.replaceAll(".", "\\.")));
  }
});

test("source video management renders public metadata controls", async () => {
  const html = renderToStaticMarkup(h(SourceVideosPage, { data: await fixtureData() }));

  for (const text of [
    "封面",
    "对剪辑师可见",
    "标签",
    "说明",
    "讲师",
    "课程",
    "分类",
    "现金流管理与风险控制"
  ]) {
    assert.match(html, new RegExp(text));
  }
});

test("preprocess jobs render failure retry and later success", async () => {
  const html = renderToStaticMarkup(h(PreprocessJobsPage, { data: await fixtureData() }));

  for (const text of [
    "正在处理",
    "队列中",
    "最近完成",
    "失败可重试",
    "build-keyframes",
    ".mixlab-library/logs/P000037.log",
    "DashScope ASR 网络超时",
    "J000041"
  ]) {
    assert.match(html, new RegExp(text.replaceAll(".", "\\.")));
  }
});

test("index publication renders current pointer and atomic switch", async () => {
  const html = renderToStaticMarkup(h(IndexPublishPage, { data: await fixtureData() }));

  for (const text of [
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

  for (const text of ["公共路径", "Manifest", "FFmpeg", "ASR", "导出诊断 JSON"]) {
    assert.match(html, new RegExp(text));
  }
});

test("settings render runtime and redacted ASR key state", async () => {
  const html = renderToStaticMarkup(h(SettingsPage, { data: await fixtureData() }));

  for (const text of [
    "阿里云百炼 / DashScope",
    "paraformer-v2",
    "mp3_16k_mono_64k",
    "已配置，已隐藏",
    "P000037 ASR 网络超时"
  ]) {
    assert.match(html, new RegExp(text.replaceAll(".", "\\.")));
  }

  assert.equal(html.includes("sk-"), false);
});
