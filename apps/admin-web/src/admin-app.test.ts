import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createAdminSmartScanReport, createFixtureAdminApiClient, loadAdminDashboardData } from "./api.ts";
import {
  chineseDiagnosticText,
  diagnosticLabel,
  languageHintsLabel,
  strictChineseDiagnosticText
} from "./app/chinese.ts";
import { ADMIN_NAV_ITEMS, routeFromHash } from "./app/navigation.ts";
import {
  ADMIN_DATA_AUTO_REFRESH_INTERVAL_MS,
  AdminApp,
  adminActionErrorMessage,
  adminLoadErrorMessage,
  shouldAutoRefreshAdminData,
  sourceDetailForRequest,
  sourceDetailLoadErrorMessage,
  sourceDetailRequestForRoute
} from "./app/AdminApp.tsx";
import { DashboardPage } from "./features/dashboard/DashboardPage.tsx";
import { DoctorPage } from "./features/doctor/DoctorPage.tsx";
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
    ["仪表盘", "原视频管理", "预处理", "健康诊断", "剪辑师用户", "设置"]
  );
  assert.equal(ADMIN_NAV_ITEMS.at(-1)?.label, "设置");
  assert.equal(ADMIN_NAV_ITEMS.some((item) => item.label === "公共素材库设置"), false);
  assert.equal(ADMIN_NAV_ITEMS.some((item) => item.label === "索引与发布"), false);
  assert.equal(routeFromHash("#/library-settings"), "settings");
  assert.equal(routeFromHash("#/index-health"), "preprocess-jobs");
  assert.equal(routeFromHash("#/index-publish"), "preprocess-jobs");
});

test("rendered admin pages avoid obvious English user-facing labels", async () => {
  const data = await fixtureData();
  const renderedPages = [
    renderToStaticMarkup(h(DashboardPage, { data })),
    renderToStaticMarkup(h(SourceVideosPage, { data })),
    renderToStaticMarkup(h(PreprocessJobsPage, { data })),
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

test("Chinese diagnostic helpers cover real doctor labels and hide unhandled English details", () => {
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
  assert.equal(chineseDiagnosticText("ffmpeg is available from bundled"), "内置音视频工具可用");
  assert.equal(chineseDiagnosticText("2 source video manifests are valid"), "2 个原视频发布清单有效");
  assert.equal(chineseDiagnosticText("source-videos is not readable: EACCES"), "原视频目录不可读: 权限不足");
  assert.equal(chineseDiagnosticText("library counts are consistent"), "素材库计数一致");
  assert.equal(
    strictChineseDiagnosticText("V000037: source video file is missing"),
    "相关对象 V000037；原始诊断信息已隐藏，可导出诊断报告查看。"
  );
  assert.equal(chineseDiagnosticText("AI剪辑实战 V000037"), "AI剪辑实战 V000037");
});

test("AdminApp action notices localize API result messages before rendering", () => {
  const source = readFileSync(resolve("apps/admin-web/src/app/AdminApp.tsx"), "utf8");

  assert.match(source, /chineseDiagnosticText\(result\.message\)/);
  assert.equal(source.includes("result.message ? `。${result.message}`"), false);
});

test("dashboard renders restrained library status", async () => {
  const data = await fixtureData();
  const html = renderToStaticMarkup(h(DashboardPage, { data }));

  for (const text of [
    "全局风险和产能",
    "智能扫描",
    "智能扫描建议",
    "原视频总数",
    "已可用",
    "处理中",
    "队列中",
    "未处理",
    "处理失败",
    "待发布索引",
    "磁盘空间",
    "当前任务",
    "v000027",
    "素材规模",
    "文案与索引",
    "预处理产能",
    "剪辑端使用",
    "风险摘要",
    "设备负荷",
    "CPU",
    "内存",
    "网络",
    "服务心跳",
    "原视频总时长",
    "文案总字数",
    "搜索请求",
    "活跃剪辑师"
  ]) {
    assert.match(html, new RegExp(text));
  }
  assert.doesNotMatch(html, />处理未处理<\/button>/);

  const queuedIdleData = {
    ...data,
    status: {
      ...data.status,
      unprocessed_video_count: 0,
      queued_video_count: 40,
      failed_video_count: 0,
      index_required_video_count: 0
    },
    jobs: {
      ...data.jobs,
      active_count: 0,
      queued_count: 40,
      failed_count: 0,
      supervisor: {
        ...data.jobs.supervisor,
        state: "idle" as const,
        state_label: "未运行"
      }
    },
    doctor: {
      ...data.doctor,
      summary: { pass: 10, warn: 0, fail: 0 }
    }
  };
  const queuedIdleHtml = renderToStaticMarkup(h(DashboardPage, {
    data: queuedIdleData,
    smartScanReport: createAdminSmartScanReport(queuedIdleData),
    onRunSmartScan: () => {},
    onApplySmartScanPrimaryAction: () => {}
  }));
  assert.match(queuedIdleHtml, /40 个视频已排队，但预处理服务未运行/);
  assert.match(queuedIdleHtml, />启动预处理流水线<\/button>/);
  assert.match(queuedIdleHtml, /排队第 1 位/);
  assert.match(queuedIdleHtml, /等待处理/);
  assert.doesNotMatch(queuedIdleHtml, /queued-by-admin|>0%<\/span>/);

  const withoutEstimate = {
    ...data,
    metrics: {
      ...data.metrics,
      production: {
        ...data.metrics.production,
        estimated_queue_done_at: ""
      }
    }
  };
  assert.match(renderToStaticMarkup(h(DashboardPage, { data: withoutEstimate })), /暂无估算/);

  const withEnglishTitle = {
    ...data,
    jobs: {
      ...data.jobs,
      jobs: data.jobs.jobs.map((job, index) => (
        index === 0 ? { ...job, title: "AI剪辑实战 V000037" } : job
      ))
    }
  };
  assert.match(renderToStaticMarkup(h(DashboardPage, { data: withEnglishTitle })), /AI剪辑实战 V000037/);
});

test("smart scan report recommends the next production action", async () => {
  const base = await fixtureData();
  const queuedIdle = createAdminSmartScanReport({
    ...base,
    status: {
      ...base.status,
      unprocessed_video_count: 0,
      queued_video_count: 40,
      failed_video_count: 0,
      index_required_video_count: 0
    },
    jobs: {
      ...base.jobs,
      active_count: 0,
      queued_count: 40,
      failed_count: 0,
      supervisor: {
        ...base.jobs.supervisor,
        state: "idle",
        state_label: "未运行"
      }
    },
    doctor: {
      ...base.doctor,
      summary: { pass: 10, warn: 0, fail: 0 }
    }
  });

  assert.equal(queuedIdle.severity, "attention");
  assert.equal(queuedIdle.primary_action, "start-preprocess");
  assert.equal(queuedIdle.primary_label, "启动预处理流水线");
  assert.match(queuedIdle.title, /40 个视频已排队，但预处理服务未运行/);
  assert.equal(queuedIdle.suggestions.some((item) => item.action === "start-preprocess"), true);

  const unprocessed = createAdminSmartScanReport({
    ...base,
    status: {
      ...base.status,
      unprocessed_video_count: 6,
      queued_video_count: 0,
      failed_video_count: 0,
      index_required_video_count: 0
    },
    jobs: {
      ...base.jobs,
      queued_count: 0,
      failed_count: 0
    },
    doctor: {
      ...base.doctor,
      summary: { pass: 10, warn: 0, fail: 0 }
    }
  });
  assert.equal(unprocessed.primary_action, "start-preprocess");
  assert.equal(unprocessed.primary_label, "启动预处理流水线");
  assert.equal(unprocessed.suggestions.some((item) => item.action === "queue-unprocessed"), false);

  const indexRequired = createAdminSmartScanReport({
    ...base,
    status: {
      ...base.status,
      unprocessed_video_count: 0,
      queued_video_count: 0,
      failed_video_count: 0,
      index_required_video_count: 7
    },
    jobs: {
      ...base.jobs,
      active_count: 0,
      queued_count: 0,
      failed_count: 0,
      supervisor: {
        ...base.jobs.supervisor,
        state: "idle",
        state_label: "未运行"
      }
    },
    doctor: {
      ...base.doctor,
      summary: { pass: 10, warn: 0, fail: 0 }
    }
  });
  assert.equal(indexRequired.primary_action, "start-preprocess");
  assert.equal(indexRequired.primary_label, "启动预处理流水线");
  assert.equal(indexRequired.suggestions.some((item) => item.action === "publish-index"), false);

  const failed = createAdminSmartScanReport({
    ...base,
    status: {
      ...base.status,
      unprocessed_video_count: 0,
      queued_video_count: 0,
      failed_video_count: 2,
      index_required_video_count: 0
    },
    jobs: {
      ...base.jobs,
      queued_count: 0,
      failed_count: 2
    },
    doctor: {
      ...base.doctor,
      summary: { pass: 10, warn: 0, fail: 0 }
    }
  });
  assert.equal(failed.primary_action, "retry-failed");
  assert.equal(failed.primary_label, "重试失败视频");

  const blockedLoad = createAdminSmartScanReport({
    ...base,
    doctor: {
      ...base.doctor,
      summary: { pass: 10, warn: 0, fail: 0 }
    },
    metrics: {
      ...base.metrics,
      runtime_load: {
        ...base.metrics.runtime_load,
        overall_status: "blocked",
        cpu: {
          ...base.metrics.runtime_load.cpu,
          status: "blocked",
          label: "负荷过高"
        }
      }
    }
  });
  assert.equal(blockedLoad.severity, "blocked");
  assert.equal(blockedLoad.primary_action, "run-doctor");
  assert.match(blockedLoad.title, /运行负荷存在阻塞风险/);
  assert.equal(blockedLoad.suggestions.some((item) => item.label.includes("降低并发")), true);

  const blocked = createAdminSmartScanReport({
    ...base,
    doctor: {
      ...base.doctor,
      summary: { pass: 8, warn: 0, fail: 2 }
    }
  });
  assert.equal(blocked.severity, "blocked");
  assert.equal(blocked.primary_action, "run-doctor");
  assert.equal(blocked.primary_label, "查看健康诊断");
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
    "音视频工具",
    "语音识别配置"
  ]) {
    assert.match(html, new RegExp(text.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(html, /初始化素材库|扫描源视频|自动扫描素材来源|自动入队未处理视频|自动发布可用索引/);
});

test("settings renders editable source folder and runtime controls", async () => {
  const html = renderToStaticMarkup(h(SettingsPage, {
    data: await fixtureData(),
    onSaveAdminSettings: () => {}
  }));

  for (const text of [
    "素材库名称",
    "新增素材来源",
    "来源名称",
    "文件夹路径",
    "启用素材来源",
    "移除",
    "并发任务数",
    "保存设置"
  ]) {
    assert.match(html, new RegExp(text));
  }
  assert.doesNotMatch(html, /自动扫描素材来源|自动入队未处理视频|自动发布可用索引/);

  assert.match(html, /aria-label="素材库名称"/);
  assert.match(html, /aria-label="选择音频模式"/);
  const saveButton = html.match(/<button[^>]*>保存设置<\/button>/)?.[0] ?? "";
  assert.notEqual(saveButton, "");
  assert.doesNotMatch(saveButton, /disabled/);
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

test("source video page limits initial table rendering for large libraries", async () => {
  const data = await fixtureData();
  const template = data.source_videos[0]!;
  const largeData = {
    ...data,
    source_videos: Array.from({ length: 150 }, (_, index) => ({
      ...template,
      source_video_id: `V${String(index + 1).padStart(6, "0")}`,
      title: `视频 ${index + 1}`,
      file_name: `video-${index + 1}.mp4`
    }))
  };
  const html = renderToStaticMarkup(h(SourceVideosPage, {
    data: largeData,
    onOpenSourceDetail: () => {}
  }));
  const text = visibleText(html);

  assert.match(text, /显示 1-100 \/ 150/);
  assert.equal((html.match(/查看详情/g) ?? []).length, 100);
  assert.match(html, /video-100\.mp4/);
  assert.doesNotMatch(html, /video-101\.mp4/);
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

test("admin load and action errors are mapped to Chinese-safe messages", () => {
  assert.equal(
    adminLoadErrorMessage(new Error("Failed to fetch")),
    "无法连接管理端服务，请检查服务是否启动。"
  );
  assert.equal(
    adminLoadErrorMessage(new Error("Route not found")),
    "管理端接口暂不可用，请刷新后重试。"
  );
  assert.equal(
    adminActionErrorMessage("发布此视频", new Error("not_found: Route not found")),
    "发布此视频失败：管理端接口暂不可用，请刷新后重试。"
  );
  assert.equal(
    adminActionErrorMessage("保存设置", new Error("validation_failed: 素材来源路径不存在")),
    "保存设置失败：素材来源路径不存在"
  );

  for (const message of [
    adminLoadErrorMessage(new Error("Route not found")),
    adminActionErrorMessage("发布此视频", new Error("not_found: Route not found"))
  ]) {
    assert.doesNotMatch(message, /Failed to fetch|Route not found|not_found|validation_failed/);
  }
});

test("preprocess jobs render failure retry and later success", async () => {
  const data = await fixtureData();
  const html = renderToStaticMarkup(h(PreprocessJobsPage, { data }));

  for (const text of [
    "预处理",
    "生产状态",
    "流水线总览",
    "当前处理视频",
    "阶段进度",
    "预计剩余",
    "预计完成",
    "负荷建议",
    "未处理原视频",
    "将加入",
    "预计总时长",
    "素材来源",
    "正在处理",
    "队列中",
    "最近完成",
    "失败可重试",
    "失败策略",
    "预处理服务",
    "运行负荷",
    "CPU",
    "内存",
    "网络",
    "服务心跳",
    "运行中",
    "启动预处理流水线",
    "暂停预处理流水线",
    "上次处理",
    "索引状态",
    "自动增量发布",
    "生成关键帧",
    "阿里云百炼语音识别网络超时",
    "J000041"
  ]) {
    assert.match(html, new RegExp(text.replaceAll(".", "\\.")));
  }
  assert.match(html, /运行负荷正常，可以继续处理/);
  assert.doesNotMatch(html, /data-control-state="native-boundary"/);
  assert.doesNotMatch(html, />加入预处理队列<\/button>/);

  const queuedIdleData = {
    ...data,
    status: {
      ...data.status,
      unprocessed_video_count: 0,
      queued_video_count: 2,
      processing_video_count: 0,
      failed_video_count: 0
    },
    jobs: {
      ...data.jobs,
      active_count: 0,
      queued_count: 2,
      completed_count: 0,
      failed_count: 0,
      supervisor: {
        ...data.jobs.supervisor,
        state: "idle" as const,
        state_label: "未运行",
        started_at: "",
        stopped_at: "",
        last_result: null
      },
      jobs: [
        {
          job_id: "J000042",
          source_video_id: "V000042",
          title: "C2102",
          status: "queued" as const,
          stage: "queued-by-admin",
          progress: 0,
          elapsed_ms: 0,
          log_path: ".mixlab-library/logs/V000042.log",
          retryable: false,
          status_label: "等待处理",
          stage_label: "等待处理",
          queue_position: 1,
          estimated_start_at: "2026-05-02T12:10:00.000Z",
          estimated_done_at: "2026-05-02T12:20:00.000Z",
          estimated_remaining_ms: 1_200_000
        },
        {
          job_id: "J000041",
          source_video_id: "V000041",
          title: "C2101",
          status: "queued" as const,
          stage: "queued-by-admin",
          progress: 0,
          elapsed_ms: 0,
          log_path: ".mixlab-library/logs/V000041.log",
          retryable: false,
          status_label: "等待处理",
          stage_label: "等待处理",
          queue_position: 2,
          estimated_start_at: "2026-05-02T12:20:00.000Z",
          estimated_done_at: "2026-05-02T12:30:00.000Z",
          estimated_remaining_ms: 1_800_000
        }
      ],
      observability: {
        running_job_id: "",
        running_source_video_id: "",
        pipeline_progress_percent: 0,
        estimated_all_done_at: "2026-05-02T12:30:00.000Z",
        estimated_queue_duration_ms: 1_800_000,
        throughput_label: "预计 30:00 完成当前队列",
        load_advice: "运行负荷正常，可以继续处理"
      }
    }
  };
  const queuedIdleHtml = renderToStaticMarkup(h(PreprocessJobsPage, {
    data: queuedIdleData,
    onStartPreprocessSupervisor: () => {}
  }));
  assert.match(queuedIdleHtml, /2 个视频已排队，但预处理服务未运行/);
  assert.match(queuedIdleHtml, /建议启动预处理流水线/);
  assert.match(queuedIdleHtml, /等待处理/);
  assert.match(queuedIdleHtml, /排队第 1 位/);
  assert.match(queuedIdleHtml, /预计开始/);
  assert.match(queuedIdleHtml, /预计耗时/);
  assert.doesNotMatch(queuedIdleHtml, /queued-by-admin|\.mixlab-library\/logs|>0%<\/span>/);
});

test("preprocess start and pause controls follow supervisor state", async () => {
  const data = await fixtureData();
  const idleData = {
    ...data,
    jobs: {
      ...data.jobs,
      supervisor: {
        ...data.jobs.supervisor,
        state: "idle" as const,
        state_label: "未运行"
      }
    }
  };
  const runningData = {
    ...data,
    jobs: {
      ...data.jobs,
      supervisor: {
        ...data.jobs.supervisor,
        state: "running" as const,
        state_label: "运行中"
      }
    }
  };
  const render = (input: typeof data) => renderToStaticMarkup(h(PreprocessJobsPage, {
    data: input,
    onStartPreprocessSupervisor: () => {},
    onStopPreprocessSupervisor: () => {}
  }));
  const buttonMarkup = (html: string, label: string) =>
    html.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0] ?? "";
  const idleHtml = render(idleData);
  const runningHtml = render(runningData);

  assert.doesNotMatch(buttonMarkup(idleHtml, "启动预处理流水线"), /disabled/);
  assert.match(buttonMarkup(idleHtml, "暂停预处理流水线"), /disabled/);
  assert.match(buttonMarkup(runningHtml, "启动预处理流水线"), /disabled/);
  assert.doesNotMatch(buttonMarkup(runningHtml, "暂停预处理流水线"), /disabled/);
});

test("admin data auto refresh stays active while preprocessing can change page state", async () => {
  const data = await fixtureData();
  const queuedData = {
    ...data,
    status: {
      ...data.status,
      queued_video_count: 2,
      processing_video_count: 0,
      unprocessed_video_count: 0,
      failed_video_count: 0,
      index_required_video_count: 0
    },
    jobs: {
      ...data.jobs,
      active_count: 0,
      queued_count: 2,
      failed_count: 0,
      supervisor: {
        ...data.jobs.supervisor,
        state: "idle" as const,
        state_label: "未运行"
      }
    }
  };
  const idleData = {
    ...queuedData,
    status: {
      ...queuedData.status,
      queued_video_count: 0
    },
    jobs: {
      ...queuedData.jobs,
      queued_count: 0
    }
  };
  const runningData = {
    ...idleData,
    status: {
      ...idleData.status,
      processing_video_count: 1
    },
    jobs: {
      ...idleData.jobs,
      active_count: 1,
      supervisor: {
        ...idleData.jobs.supervisor,
        state: "running" as const,
        state_label: "运行中"
      }
    }
  };

  assert.equal(ADMIN_DATA_AUTO_REFRESH_INTERVAL_MS <= 3_000, true);
  assert.equal(shouldAutoRefreshAdminData("preprocess-jobs", queuedData), true);
  assert.equal(shouldAutoRefreshAdminData("dashboard", queuedData), true);
  assert.equal(shouldAutoRefreshAdminData("source-videos", queuedData), false);
  assert.equal(shouldAutoRefreshAdminData("settings", queuedData), false);
  assert.equal(shouldAutoRefreshAdminData("preprocess-jobs", runningData), true);
  assert.equal(shouldAutoRefreshAdminData("preprocess-jobs", idleData), true);
  assert.equal(shouldAutoRefreshAdminData("dashboard", idleData), true);
  assert.equal(shouldAutoRefreshAdminData("source-videos", idleData), false);
});

test("doctor page renders Chinese diagnosis checks and report export", async () => {
  const data = await fixtureData();
  const html = renderToStaticMarkup(h(DoctorPage, { data }));

  for (const text of [
    "诊断系统问题",
    "发布清单",
    "音视频工具",
    "语音识别",
    "检查目的",
    "失败影响",
    "处理建议",
    "诊断详情",
    "本地剪辑片段属于剪辑端本地工作区",
    "公共素材库根目录",
    "重新运行健康诊断",
    "导出诊断报告"
  ]) {
    assert.match(html, new RegExp(text));
  }

  const realDoctorIds = {
    ...data,
    doctor: {
      ...data.doctor,
      summary: { pass: 1, warn: 2, fail: 0 },
      checks: [
        {
          check_id: "source-videos-readable",
          label: "Source Videos",
          status: "warn" as const,
          message: "source-videos is not readable: EACCES"
        },
        {
          check_id: "source-video-manifests",
          label: "Source Video Manifests",
          status: "pass" as const,
          message: "2 source video manifests are valid"
        },
        {
          check_id: "library-counts",
          label: "Library Counts",
          status: "pass" as const,
          message: "library counts are consistent"
        },
        {
          check_id: "ffmpeg",
          label: "FFmpeg",
          status: "pass" as const,
          message: "ffmpeg is available from bundled"
        },
        {
          check_id: "unknown-probe",
          label: "Unknown English Probe",
          status: "warn" as const,
          message: "raw probe detail"
        }
      ]
    }
  };
  const realDoctorHtml = renderToStaticMarkup(h(DoctorPage, { data: realDoctorIds }));
  assert.match(realDoctorHtml, /素材来源可读性/);
  assert.match(realDoctorHtml, /原视频发布清单/);
  assert.match(realDoctorHtml, /素材库计数一致/);
  assert.match(realDoctorHtml, /内置音视频工具可用/);
  assert.match(realDoctorHtml, /技术检查项/);
  assert.match(realDoctorHtml, /需关注/);
  assert.doesNotMatch(realDoctorHtml, /Unknown English Probe|raw probe detail|source-videos|source video manifests|library counts|ffmpeg|bundled|EACCES/i);
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

test("cutter users page explains identity model and renders device audit details readably", async () => {
  const client = createFixtureAdminApiClient();
  const metrics = (await client.getDashboardMetrics()).usage;
  const html = renderToStaticMarkup(h(CutterUsersPage, {
    users: {
      users: [
        {
          user_id: "CU000009",
          username: "xiaolin",
          display_name: "小林",
          status: "pending",
          applied_at: "2026-05-03T08:00:00.000Z",
          approved_at: "",
          rejected_at: "",
          disabled_at: "",
          last_login_at: "",
          last_used_at: "",
          note: "",
          devices: [
            {
              device_id: "cutter-1234567890abcdef",
              device_name: "Mac 剪辑端 · Safari",
              status: "active",
              first_seen_at: "2026-05-03T08:00:00.000Z",
              last_login_at: "",
              last_ip_address: "192.168.31.10",
              user_agent:
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15"
            } as any
          ]
        }
      ]
    },
    metrics,
    onApprove: () => {},
    onDisable: () => {}
  }));

  for (const text of [
    "身份方式",
    "用户名 + 本机设备令牌",
    "会话令牌",
    "IP 仅用于诊断",
    "设备编号",
    "cutter…cdef",
    "最近 IP",
    "192.168.31.10",
    "浏览器标识",
    "Safari"
  ]) {
    assert.match(html, new RegExp(text.replaceAll("+", "\\+")));
  }
  assert.doesNotMatch(html, /Mozilla\/5\.0/);
  assert.doesNotMatch(html, /AppleWebKit\/605\.1\.15/);
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
    "NAS Docker 部署时，在 admin-api 和 admin-worker 两个容器环境变量中填写 DASHSCOPE_API_KEY，保存后重启项目。",
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
        label: "启动预处理流水线",
        state: "m9b-api",
        reason: "扫描、入队、预处理并自动发布索引。",
        variant: "primary"
      }),
      h(EmptyState, {
        title: "没有匹配的原视频",
        detail: "请调整搜索词或状态筛选。"
      })
    )
  );

  assert.match(html, /data-control-state="m9b-api"/);
  assert.match(html, /启动预处理流水线/);
  assert.match(html, /扫描、入队、预处理并自动发布索引/);
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
      onQueueSourceVideo: noop,
      onRetrySourceVideo: noop,
      onPublishSourceVideo: noop,
      onUpdateSourceVideoMetadata: noop
    })
  );

  assert.match(html, /data-control-state="m9b-api"/);
  assert.match(html, /处理此视频/);
  assert.match(html, /重试此视频/);
  assert.match(html, /发布此视频/);
  assert.match(html, /保存公开说明/);
  assert.doesNotMatch(html, /保存公开说明[^<]*<\/button>.*disabled/s);
  assert.doesNotMatch(html, /data-control-state="read-only"/);
  assert.doesNotMatch(html, /data-control-state="native-boundary"/);
});
