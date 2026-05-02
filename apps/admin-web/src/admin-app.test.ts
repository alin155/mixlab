import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createFixtureAdminApiClient, loadAdminDashboardData } from "./api.ts";
import {
  chineseDiagnosticText,
  diagnosticLabel,
  languageHintsLabel
} from "./app/chinese.ts";
import { ADMIN_NAV_ITEMS, routeFromHash } from "./app/navigation.ts";
import {
  AdminApp,
  sourceDetailForRequest,
  sourceDetailLoadErrorMessage,
  sourceDetailRequestForRoute
} from "./app/AdminApp.tsx";
import { DashboardPage } from "./features/dashboard/DashboardPage.tsx";
import { DoctorPage } from "./features/doctor/DoctorPage.tsx";
import { IndexPublishPage } from "./features/index-publish/IndexPublishPage.tsx";
import { PreprocessJobsPage } from "./features/preprocess-jobs/PreprocessJobsPage.tsx";
import { SettingsPage } from "./features/settings/SettingsPage.tsx";
import { CutterUsersPage } from "./features/cutter-users/CutterUsersPage.tsx";
import { AdminControlButton, EmptyState, MetricBand, SourceVideoTable } from "./features/shared.tsx";
import { AdminSourceDetailPage } from "./features/source-detail/AdminSourceDetailPage.tsx";
import { SourceVideosPage } from "./features/source-videos/SourceVideosPage.tsx";

async function fixtureData() {
  return loadAdminDashboardData(createFixtureAdminApiClient());
}

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

test("admin navigation uses approved Chinese IA and legacy route aliases", () => {
  assert.deepEqual(
    ADMIN_NAV_ITEMS.map((item) => item.label),
    ["仪表盘", "原视频管理", "预处理队列", "索引与发布", "健康诊断", "剪辑师用户", "设置"]
  );
  assert.equal(ADMIN_NAV_ITEMS.at(-1)?.label, "设置");
  assert.equal(ADMIN_NAV_ITEMS.some((item) => item.label === "公共素材库设置"), false);
  assert.equal(routeFromHash("#/library-settings"), "settings");
  assert.equal(routeFromHash("#/index-health"), "index-publish");
});

test("rendered admin pages avoid obvious English user-facing labels", async () => {
  const data = await fixtureData();
  const renderedPages = [
    renderToStaticMarkup(h(DashboardPage, { data })),
    renderToStaticMarkup(h(SourceVideosPage, { data })),
    renderToStaticMarkup(h(PreprocessJobsPage, { data })),
    renderToStaticMarkup(h(IndexPublishPage, { data })),
    renderToStaticMarkup(h(DoctorPage, { data })),
    renderToStaticMarkup(h(CutterUsersPage, {
      users: await createFixtureAdminApiClient().listCutterUsers(),
      metrics: data.metrics.usage
    })),
    renderToStaticMarkup(h(SettingsPage, { data }))
  ];
  const text = visibleText(renderedPages.join(" "));

  for (const englishLabel of [
    "Ready",
    "Processing",
    "Queued",
    "Unprocessed",
    "Failed",
    "Index Required",
    "Doctor",
    "ASR",
    "API Key",
    "FFmpeg",
    "FFprobe",
    "DashScope"
  ]) {
    assert.equal(text.includes(englishLabel), false, `${englishLabel} should not be visible`);
  }
});

test("Chinese diagnostic helpers cover real doctor labels without mangling protocol keys", () => {
  assert.deepEqual(
    [
      "Public Library Root",
      "Source Videos",
      ".mixlab-library Writable",
      "Library Counts",
      "Source Video Manifests",
      "Current Index",
      "FFmpeg",
      "FFprobe",
      "ASR Config",
      "Local Clips"
    ].map(diagnosticLabel),
    [
      "公共素材库根目录",
      "原视频目录",
      "预处理产物库可写",
      "素材库计数",
      "原视频发布清单",
      "当前索引",
      "音视频工具",
      "媒体探测工具",
      "语音识别配置",
      "本地剪辑片段"
    ]
  );

  assert.equal(
    chineseDiagnosticText("Current Index ready_video_count matches current_version schema_version"),
    "当前索引 ready_video_count matches current_version schema_version"
  );
  assert.equal(
    chineseDiagnosticText("DashScope API Key is configured for ASR Config"),
    "阿里云百炼接口密钥已配置用于语音识别配置"
  );
});

test("AdminApp action notices localize API result messages before rendering", () => {
  const source = readFileSync(resolve("apps/admin-web/src/app/AdminApp.tsx"), "utf8");

  assert.match(source, /chineseDiagnosticText\(result\.message\)/);
  assert.equal(source.includes("result.message ? `。${result.message}`"), false);
});

test("dashboard renders restrained library status", async () => {
  const html = renderToStaticMarkup(h(DashboardPage, { data: await fixtureData() }));

  for (const text of [
    "全局风险和产能",
    "原视频总数",
    "已可用",
    "处理中",
    "队列中",
    "未处理",
    "处理失败",
    "待发布索引",
    "处理未处理",
    "磁盘空间",
    "当前任务",
    "v000027"
  ]) {
    assert.match(html, new RegExp(text));
  }
});

test("settings merges library paths, runtime policy, and path checks", async () => {
  const html = renderToStaticMarkup(h(SettingsPage, { data: await fixtureData() }));

  for (const text of [
    "素材来源",
    "预处理产物库",
    "运行策略",
    "路径与权限校验",
    "/Volumes/PublicLibrary",
    "source-videos",
    ".mixlab-library",
    "MLPUB-001",
    "1.0.0",
    "路径与权限校验",
    "初始化素材库",
    "扫描源视频",
    "音视频工具",
    "语音识别配置"
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

test("source video detail renders complete preprocessing data in Chinese", async () => {
  const detail = await createFixtureAdminApiClient().getSourceVideoDetail("V000042");
  const html = renderToStaticMarkup(h(AdminSourceDetailPage, { detail }));
  const text = visibleText(html);

  for (const expectedText of [
    "原视频详情",
    "基本信息",
    "技术信息",
    "预处理状态",
    "产物完整性",
    "文案数据",
    "视觉数据",
    "公开元数据",
    "剪辑师可见",
    "当前阶段",
    "任务编号",
    "索引版本",
    "便携路径",
    "文件系统路径",
    "现金流管理与风险控制",
    "现金流，是企业经营中的关键安全边界。",
    ".mixlab-library/videos/V000042/transcript.json",
    "/Volumes/PublicLibrary/.mixlab-library/videos/V000042/transcript.json"
  ]) {
    assert.match(text, new RegExp(expectedText));
  }
});

test("source video table keeps ID selection separate from detail navigation", async () => {
  const data = await fixtureData();
  const videos = data.source_videos.filter((video) => video.source_video_id === "V000042");
  const calls: string[] = [];
  const table = SourceVideoTable({
    videos,
    selectedSourceVideoId: "V000042",
    onSelect: (sourceVideoId) => calls.push(`选择:${sourceVideoId}`),
    onOpenSourceDetail: (sourceVideoId) => calls.push(`详情:${sourceVideoId}`)
  }) as { props: { columns: string[]; rows: Array<unknown[]> } };
  const idButton = table.props.rows[0][0] as { props: { children: string; onClick: () => void } };
  const detailButton = table.props.rows[0].at(-1) as { props: { children: string; onClick: () => void } };

  assert.deepEqual(table.props.columns, ["ID", "封面", "文件名", "状态", "对剪辑师可见", "标签", "更新时间", "操作"]);
  assert.equal(idButton.props.children, "V000042");
  assert.equal(detailButton.props.children, "查看详情");

  idButton.props.onClick();
  assert.deepEqual(calls, ["选择:V000042"]);

  detailButton.props.onClick();
  assert.deepEqual(calls, ["选择:V000042", "详情:V000042"]);
});

test("source video page renders a separate Chinese detail control only when supplied", async () => {
  const data = await fixtureData();
  const withoutDetail = renderToStaticMarkup(h(SourceVideosPage, { data }));
  const withDetail = renderToStaticMarkup(h(SourceVideosPage, {
    data,
    onOpenSourceDetail: () => {}
  }));

  assert.match(withDetail, />V000042<\/button>/);
  assert.match(withDetail, />查看详情<\/button>/);
  assert.doesNotMatch(withoutDetail, />查看详情<\/button>/);
});

test("AdminApp source detail hash renders Chinese detail loading route", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  globalThis.window = {
    location: { hash: "#/source-detail" },
    addEventListener: () => {},
    removeEventListener: () => {}
  } as unknown as Window & typeof globalThis;
  globalThis.document = {
    createElement: () => ({ click: () => {} })
  } as unknown as Document;

  try {
    const html = renderToStaticMarkup(h(AdminApp));
    assert.match(html, /原视频详情/);
    assert.match(html, /正在读取素材库管理端数据/);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});

test("source detail request helper resolves selected id, fallback id, and non-detail routes", async () => {
  const data = await fixtureData();

  assert.deepEqual(
    sourceDetailRequestForRoute("source-detail", data, "V000042"),
    { sourceVideoId: "V000042" }
  );
  assert.deepEqual(
    sourceDetailRequestForRoute("source-detail", data, ""),
    { sourceVideoId: "V000043" }
  );
  assert.equal(sourceDetailRequestForRoute("source-videos", data, "V000042"), null);
  assert.equal(sourceDetailRequestForRoute("source-detail", null, ""), null);
});

test("source detail display helper hides stale detail from another request", async () => {
  const detail = await createFixtureAdminApiClient().getSourceVideoDetail("V000042");

  assert.equal(
    sourceDetailForRequest(detail, { sourceVideoId: "V000041" }),
    null
  );
  assert.equal(
    sourceDetailForRequest(null, { sourceVideoId: "V000042" }),
    null
  );
  assert.equal(
    sourceDetailForRequest(detail, { sourceVideoId: "V000042" }),
    detail
  );
});

test("source detail load errors are mapped to Chinese-safe messages", () => {
  const cases = [
    {
      error: new Error("Failed to fetch"),
      expected: "无法连接管理端服务，请检查网络或服务状态。"
    },
    {
      error: new Error("Route not found"),
      expected: "原视频详情接口暂不可用，请稍后重试。"
    },
    {
      error: new Error("not_found: 原视频不存在"),
      expected: "原视频不存在或已被移除。"
    },
    {
      error: new Error("权限不足：无法读取原视频详情"),
      expected: "权限不足：无法读取原视频详情"
    },
    {
      error: new Error("validation_failed: 原视频协议文件无效"),
      expected: "原视频协议文件无效"
    }
  ];

  for (const item of cases) {
    const message = sourceDetailLoadErrorMessage(item.error);
    assert.equal(message, item.expected);
    assert.doesNotMatch(message, /Failed to fetch|Route not found|not_found|validation_failed/);
  }

  assert.equal(sourceDetailLoadErrorMessage("timeout"), "原视频详情加载失败，请稍后重试。");
});

test("preprocess jobs render failure retry and later success", async () => {
  const html = renderToStaticMarkup(h(PreprocessJobsPage, { data: await fixtureData() }));

  for (const text of [
    "预处理队列",
    "正在处理",
    "队列中",
    "最近完成",
    "失败可重试",
    "失败策略",
    "启动预处理服务",
    "data-control-state=\"native-boundary\"",
    "生成关键帧",
    ".mixlab-library/logs/V000037.log",
    "阿里云百炼语音识别网络超时",
    "J000041"
  ]) {
    assert.match(html, new RegExp(text.replaceAll(".", "\\.")));
  }
});

test("index health renders current pointer and repair controls", async () => {
  const html = renderToStaticMarkup(h(IndexPublishPage, { data: await fixtureData() }));

  for (const text of [
    "索引与发布",
    "发布待索引视频",
    "当前索引",
    "v000027",
    "已可用数量",
    "协议版本",
    "校验",
    "原子切换当前索引"
  ]) {
    assert.match(html, new RegExp(text.replaceAll(".", "\\.")));
  }
});

test("doctor page renders Chinese diagnosis checks and report export", async () => {
  const html = renderToStaticMarkup(h(DoctorPage, { data: await fixtureData() }));

  for (const text of ["诊断系统问题", "公共路径", "发布清单", "音视频工具", "语音识别", "重新运行健康诊断", "导出诊断报告"]) {
    assert.match(html, new RegExp(text));
  }
});

test("cutter users page renders login applications and user metrics", async () => {
  const client = createFixtureAdminApiClient();
  const users = await client.listCutterUsers();
  const metrics = (await client.getDashboardMetrics()).usage;
  const html = renderToStaticMarkup(h(CutterUsersPage, {
    users,
    metrics,
    onApprove: () => {},
    onDisable: () => {}
  }));

  for (const text of [
    "剪辑师用户",
    "登录申请与使用统计",
    "待审核",
    "已通过",
    "已拒绝",
    "已停用",
    "设备",
    "搜索次数",
    "剪切成功",
    "最近使用",
    "通过申请",
    "停用用户",
    "张三",
    "王五"
  ]) {
    assert.match(html, new RegExp(text));
  }
});

test("settings render runtime and redacted speech recognition key state", async () => {
  const data = await fixtureData();
  const html = renderToStaticMarkup(h(SettingsPage, { data }));

  for (const text of [
    "运行策略",
    "阿里云百炼",
    "通义语音识别模型",
    "压缩单声道",
    "无损单声道",
    "已配置，已隐藏",
    "编辑接口密钥",
    "V000037 语音识别网络超时"
  ]) {
    assert.match(html, new RegExp(text.replaceAll(".", "\\.")));
  }

  assert.equal(html.includes("sk-"), false);

  const withoutHints = {
    ...data,
    runtime: {
      ...data.runtime,
      asr: {
        ...data.runtime.asr,
        language_hints: []
      }
    }
  };
  assert.match(renderToStaticMarkup(h(SettingsPage, { data: withoutHints })), /未配置/);
  assert.equal(languageHintsLabel(["zh", "en"]), "中文、英文");
});

test("shared admin UI primitives expose control states and empty state language", () => {
  const html = renderToStaticMarkup(
    h("section", null,
      h(MetricBand, {
        items: [
          { label: "已可用", value: 120, caption: "对剪辑师可见" },
          { label: "处理失败", value: 2, caption: "失败可重试" }
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
  assert.equal(source.includes("root_path ??"), false);
  assert.equal(source.includes("library-settings"), false);
  assert.match(readFileSync(resolve("apps/admin-web/src/features/settings/SettingsPage.tsx"), "utf8"), /useEffect/);
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
