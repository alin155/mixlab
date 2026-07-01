import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createAdminSmartScanReport,
  createFixtureAdminApiClient,
  loadAdminDashboardData,
  type AdminPreprocessProcessHistoryOptions,
  type AdminRuntimeDiagnosticsHistoryResponse,
  type AdminRuntimeEndpointMeta
} from "./api.ts";
import {
  chineseDiagnosticText,
  diagnosticLabel,
  languageHintsLabel,
  strictChineseDiagnosticText
} from "./app/chinese.ts";
import { ADMIN_NAV_ITEMS, routeFromHash } from "./app/navigation.ts";
import {
  ADMIN_BACKGROUND_REFRESH_SPECS,
  ADMIN_ROUTE_LOADING_SPECS,
  ADMIN_ROUTE_LOCAL_READ_SPECS,
  ADMIN_ROUTE_REQUEST_LOAD_SPECS,
  ADMIN_ROUTE_TOKEN_LOAD_SPECS,
  EMPTY_ADMIN_ROUTE_LOCAL_READ_ERRORS,
  adminRouteLocalReadLabel,
  adminRouteRenderLoadingState,
  adminSourceVideoManifestFallbackPolicy,
  clearAdminRouteLocalReadError,
  createAdminBackgroundRefreshScope,
  createAdminRouteRequestScope,
  createAdminRouteTokenRequestScope,
  setAdminRouteLocalReadError,
  shouldStartAdminBackgroundRefresh,
  shouldAutoRefreshAdminData,
  shouldLoadAdminSourceVideos,
  shouldPrefetchAdminRoute,
  shouldStartAdminRouteRequestLoad,
  shouldStartAdminRouteTokenLoad,
  startAdminBackgroundRefresh,
  startAdminRouteRequestLoad,
  startAdminRouteTokenLoad
} from "./app/route-loading-runtime.ts";
import {
  ADMIN_DATA_AUTO_REFRESH_INTERVAL_MS,
  ADMIN_PREPROCESS_RUNNING_REFRESH_INTERVAL_MS,
  AdminApp,
  adminActionErrorMessage,
  adminLoadErrorMessage,
  loadAdminPreprocessRouteData,
  mergeAdminDashboardPanelData,
  mergeAdminSourceVideoPages,
  resolveAdminRuntimeApiBaseUrl,
  sourceDetailForRequest,
  sourceDetailLoadErrorMessage,
  sourceDetailRequestForRoute
} from "./app/AdminApp.tsx";
import { DashboardPage, adminCorePathHealth, adminUsageFunnelRows } from "./features/dashboard/DashboardPage.tsx";
import { DoctorPage } from "./features/doctor/DoctorPage.tsx";
import { IndexPublishPage } from "./features/index-publish/IndexPublishPage.tsx";
import { OperationLogPage } from "./features/operation-log/OperationLogPage.tsx";
import { PreprocessJobsPage } from "./features/preprocess-jobs/PreprocessJobsPage.tsx";
import { ProtectionCenterPage } from "./features/protection/ProtectionCenterPage.tsx";
import { SettingsPage, adminFirstRunInitializationChecks } from "./features/settings/SettingsPage.tsx";
import {
  CutterUserDisableDialog,
  CutterUserPasswordResetDialog,
  CutterUsersPage
} from "./features/cutter-users/CutterUsersPage.tsx";
import { AdminControlButton, EmptyState, MetricBand, SourceMetadataInspector, SourceVideoTable } from "./features/shared.tsx";
import { AdminSourceDetailPage } from "./features/source-detail/AdminSourceDetailPage.tsx";
import { SourceVideosPage } from "./features/source-videos/SourceVideosPage.tsx";

async function fixtureData() {
  return loadAdminDashboardData(createFixtureAdminApiClient());
}

function doctorRuntimeDiagnosticsFixture(): AdminRuntimeDiagnosticsHistoryResponse {
  return {
    schema_version: "1.0",
    generated_at: "2024-05-07T10:40:00.000Z",
    path: "/Volumes/PublicLibrary/.mixlab-library/admin-read-model/runtime-diagnostics.ndjson",
    entries: [
      {
        schema_version: "1.0",
        recorded_at: "2024-05-07T10:39:00.000Z",
        runtime: {
          schema_version: "1.0",
          endpoint: "/api/admin/source-videos",
          method: "GET",
          duration_ms: 1_200,
          scan_mode: "paged-list",
          data_source: "admin-read-model",
          scan_reason: "route-owned-page",
          actual_data_source: "admin-read-model",
          cache_status: "miss",
          result_count: 20,
          offset: 0,
          limit: 20,
          slow: true,
          slow_reason: "素材列表超过目标耗时",
          components: [
            {
              name: "status_page",
              duration_ms: 840,
              data_source: "admin-read-model",
              scan_mode: "paged-list",
              scan_reason: "route-owned-page",
              cache_status: "miss"
            }
          ]
        }
      }
    ],
    limit: 20,
    total_line_count: 2,
    malformed_line_count: 1,
    truncated: false
  };
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
    ["首页", "素材处理", "剪辑师", "系统状态"]
  );
  assert.equal(ADMIN_NAV_ITEMS.at(-1)?.label, "系统状态");
  assert.equal(ADMIN_NAV_ITEMS.some((item) => item.label === "素材库"), false);
  assert.equal(ADMIN_NAV_ITEMS.some((item) => item.label === "设置"), false);
  assert.equal(ADMIN_NAV_ITEMS.some((item) => item.label === "公共素材库设置"), false);
  assert.equal(ADMIN_NAV_ITEMS.some((item) => item.label === "发布与索引"), false);
  assert.equal(routeFromHash("#/library-settings"), "settings");
  assert.equal(routeFromHash("#/index-health"), "index-publish");
  assert.equal(routeFromHash("#/index-publish"), "index-publish");
  assert.equal(routeFromHash("#/release"), "protection");
  assert.equal(routeFromHash("#/release-gates"), "protection");
  assert.equal(routeFromHash("#/doctor"), "doctor");
  assert.equal(routeFromHash("#/operation-log"), "operation-log");
  assert.equal(routeFromHash("#/audit-log"), "operation-log");
});

test("admin web runtime defaults to the local real API instead of fixture data", () => {
  assert.equal(
    resolveAdminRuntimeApiBaseUrl({}),
    "http://127.0.0.1:3889/"
  );
  assert.equal(
    resolveAdminRuntimeApiBaseUrl({
      viteApiBaseUrl: "http://127.0.0.1:4889/"
    }),
    "http://127.0.0.1:4889/"
  );
  assert.equal(
    resolveAdminRuntimeApiBaseUrl({
      useFixtureData: true
    }),
    ""
  );
});

test("rendered admin pages avoid obvious English user-facing labels", async () => {
  const data = await fixtureData();
  const client = createFixtureAdminApiClient();
  const renderedPages = [
    renderToStaticMarkup(h(DashboardPage, { data })),
    renderToStaticMarkup(h(SourceVideosPage, { data })),
    renderToStaticMarkup(h(PreprocessJobsPage, { data })),
    renderToStaticMarkup(h(ProtectionCenterPage, {
      overview: await client.getOperationsOverview(),
      readModelReconcileStatus: await client.getReadModelReconcileStatus(),
      readModelReconcileError: "",
      loading: false,
      error: ""
    })),
    renderToStaticMarkup(h(IndexPublishPage, { data })),
    renderToStaticMarkup(h(DoctorPage, { data })),
    renderToStaticMarkup(h(CutterUsersPage, {
      users: await client.listCutterUsers(),
      metrics: data.metrics.usage
    })),
    renderToStaticMarkup(h(OperationLogPage, {
      operationLog: await client.getOperationLog(),
      loading: false,
      error: ""
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

test("index publish page follows the production-console composition contract", async () => {
  const data = await fixtureData();
  const indexRuntime: AdminRuntimeEndpointMeta = {
    schema_version: "1.0",
    endpoint: "/api/admin/index/versions",
    method: "GET",
    duration_ms: 684,
    scan_mode: "paged-list",
    data_source: "index-version-packages",
    scan_reason: "index-version-page",
    actual_data_source: "index-version-packages",
    cache_status: "hit",
    result_count: 2,
    offset: 0,
    limit: 20,
    slow: false,
    slow_reason: "",
    components: [
      {
        name: "current_pointer_fast_page",
        duration_ms: 301,
        data_source: "current-index",
        scan_mode: "no-scan",
        scan_reason: "index-version-page",
        cache_status: "hit"
      },
      {
        name: "index_package_validation",
        duration_ms: 241,
        data_source: "index-version-packages",
        scan_mode: "paged-list",
        scan_reason: "index-version-page",
        cache_status: "hit",
        detail: "validated=2"
      }
    ]
  };
  const dataWithRuntime = {
    ...data,
    indexes: {
      ...data.indexes,
      runtime: indexRuntime
    }
  };
  const html = renderToStaticMarkup(h(IndexPublishPage, {
    data: dataWithRuntime,
    onRepairIndex: () => undefined,
    onPublishSourceVideo: () => undefined,
    onRunDoctor: () => undefined
  }));
  const text = visibleText(html);

  for (const expected of [
    "发布与索引",
    "已处理待上线",
    "上线队列",
    "索引版本",
    "版本详情",
    "页面契约",
    "主工作区 上线队列",
    "辅助区 索引版本",
    "上线队列来源 读模型",
    "版本来源 索引版本包",
    "扫描模式 不扫描",
    "错误边界 本页面局部处理",
    "路由加载",
    "分页读取",
    "版本读取 分页列表",
    "索引版本页 · 684ms",
    "版本来源 索引版本包",
    "索引版本 · 分页列表 · 命中",
    "版本窗口 2",
    "偏移 0 · 上限 20",
    "版本慢请求 正常",
    "未超过目标耗时",
    "版本组件耗时 2 个组件",
    "当前指针快读 301ms / 当前索引 / 不扫描 / 命中",
    "索引包校验 241ms / 索引版本 / 分页列表 / 命中",
    "当前校验",
    "校验索引"
  ]) {
    assert.equal(text.includes(expected), true, `${expected} should be visible`);
  }
  assert.doesNotMatch(text, /current_pointer_fast_page|index_package_validation|validated=2/);

  assert.match(html, /aria-label="上线队列"/);
  assert.match(html, /aria-label="索引版本"/);
  assert.match(html, /aria-label="索引版本扫描证据"/);
  assert.doesNotMatch(text, /Dashboard|dashboard/);
  assert.equal(text.includes("请到素材库"), false);

  const summaryOnlyText = visibleText(renderToStaticMarkup(h(IndexPublishPage, {
    data: {
      ...data,
      source_videos: data.source_videos.filter((video) => video.preprocess_status !== "index-required"),
      status: {
        ...data.status,
        index_required_video_count: 5
      }
    }
  })));
  assert.equal(summaryOnlyText.includes("摘要 5 条"), true);
  assert.equal(summaryOnlyText.includes("请到素材库"), false);
});

test("protection center renders release gates and read-model status", async () => {
  const client = createFixtureAdminApiClient();
  const overview = await client.getOperationsOverview();
  const readModelReconcileStatus = await client.getReadModelReconcileStatus();
  const html = renderToStaticMarkup(h(ProtectionCenterPage, {
    overview,
    readModelReconcileStatus,
    readModelReconcileError: "",
    loading: false,
    error: ""
  }));

  for (const text of [
    "保护中心",
    "发布门禁",
    "读模型和加载策略",
    "路径环境",
    "版本信息",
    "当前索引",
    "admin.sqlite",
    "查询库状态",
    "对账计划",
    "无需对账",
    "扫描模式",
    "不扫描",
    "隐藏全库扫描",
    "禁止",
    "新鲜",
    "页面契约",
    "主工作区",
    "发布门禁",
    "辅助区",
    "读模型状态",
    "数据来源",
    "data-loading-contract / read-model-reconcile",
    "全量对账只作为显式维护命令",
    "加载边界",
    "路由加载，不阻塞 Admin Shell",
    "命令边界",
    "后台对账需显式启动或停止",
    "错误边界",
    "本页面局部处理",
	    "后台对账",
	    "运行中",
	    "读取快照",
	    "读取 preprocess job 快照",
	    "总进度",
	    "70%",
	    "步骤进度",
	    "10%",
	    "preprocess job 快照",
	    "64 / 623",
	    "启动后台对账",
	    "请求停止对账",
	    "full-reconcile",
	    "安全检查点"
	  ]) {
	    assert.match(html, new RegExp(text));
	  }
	});

test("protection center exposes explicit read-model reconcile command controls", async () => {
  const client = createFixtureAdminApiClient();
  const overview = await client.getOperationsOverview();
  const runningStatus = await client.getReadModelReconcileStatus();
  const idleStatus = {
    ...runningStatus,
    status: "idle" as const,
    phase: "idle" as const,
    cancel_requested: false,
    message: "Fixture idle"
  };
  const cancelRequestedStatus = {
    ...runningStatus,
    cancel_requested: true
  };
  const noop = () => undefined;
  const buttonTag = (html: string, label: string) =>
    html.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0] ?? "";
  const runningHtml = renderToStaticMarkup(h(ProtectionCenterPage, {
    overview,
    readModelReconcileStatus: runningStatus,
    readModelReconcileError: "",
    onStartReadModelReconcile: noop,
    onCancelReadModelReconcile: noop,
    loading: false,
    error: ""
  }));
  const idleHtml = renderToStaticMarkup(h(ProtectionCenterPage, {
    overview,
    readModelReconcileStatus: idleStatus,
    readModelReconcileError: "",
    onStartReadModelReconcile: noop,
    onCancelReadModelReconcile: noop,
    loading: false,
    error: ""
  }));
  const cancelRequestedHtml = renderToStaticMarkup(h(ProtectionCenterPage, {
    overview,
    readModelReconcileStatus: cancelRequestedStatus,
    readModelReconcileError: "",
    onStartReadModelReconcile: noop,
    onCancelReadModelReconcile: noop,
    loading: false,
    error: ""
  }));

  assert.match(buttonTag(runningHtml, "启动后台对账"), /disabled/);
  assert.doesNotMatch(buttonTag(runningHtml, "请求停止对账"), /disabled/);
  assert.doesNotMatch(buttonTag(idleHtml, "启动后台对账"), /disabled/);
  assert.match(buttonTag(idleHtml, "请求停止对账"), /disabled/);
  assert.match(buttonTag(cancelRequestedHtml, "请求停止对账"), /disabled/);
  assert.match(visibleText(runningHtml), /显式维护命令/);
});

test("operation log renders read-model audit events as a route-owned read-only page", async () => {
  const operationLog = await createFixtureAdminApiClient().getOperationLog({ limit: 50 });
  const client = createFixtureAdminApiClient();
  const restorePlanPreview = {
    snapshotId: "fixture-source-video-metadata-snapshot",
    plan: await client.getCommandSnapshotRestorePlan("fixture-source-video-metadata-snapshot"),
    loading: false,
    error: ""
  };
  const restoreResult = await client.restoreCommandSnapshot("fixture-source-video-metadata-snapshot");
  const html = renderToStaticMarkup(h(OperationLogPage, {
    operationLog,
    loading: false,
    error: "",
    restorePlanPreview,
    onPreviewCommandSnapshotRestore: () => undefined
  }));
  const text = visibleText(html);

  for (const expected of [
    "操作记录",
    "审计记录",
    "最近事件",
    "保存素材信息",
    "操作者 Owner",
    "锁持有者 admin-api:source-video-metadata",
    "剪辑师",
    "通过剪辑师",
    "命令 通过剪辑师",
    "文件快照",
    "已捕获 1 个文件",
    "查看恢复预检",
    "恢复预检通过",
    "fixture-source-video-metadata-snapshot",
    "1 可恢复 / 0 阻断 / 1 总数",
    "不扫描",
    "恢复执行",
    "准备恢复",
    "读模型对账",
    "读模型失效标记",
    "Admin read model 已标记为需要对账。",
    "命令 保存设置",
    "原因 素材来源范围变化",
    "审计状态",
    "fixture/.mixlab-library/admin/operation-log/events.ndjson",
    "页面契约",
    "主工作区 审计时间线",
    "辅助区 恢复预检",
    "数据来源 operation-log / command-snapshot",
    "扫描模式 不扫描",
    "加载边界 路由加载，只读取最近事件窗口",
    "命令边界 确认执行恢复前重新预检",
    "错误边界 本页面局部处理"
  ]) {
    assert.equal(text.includes(expected), true, `${expected} should be visible`);
  }

  assert.match(html, /<button/);
  assert.doesNotMatch(html, />确认执行恢复<\/button>/);
  assert.doesNotMatch(text, /read-model-invalidate/);
  assert.doesNotMatch(text, /settings-config/);
  assert.doesNotMatch(text, /source-folder-scope-change/);
  assert.doesNotMatch(text, /Admin command/);

  const armedText = visibleText(renderToStaticMarkup(h(OperationLogPage, {
    operationLog,
    loading: false,
    error: "",
    restorePlanPreview,
    restoreExecution: {
      snapshotId: "fixture-source-video-metadata-snapshot",
      armed: true,
      loading: false,
      error: "",
      result: null
    },
    onPreviewCommandSnapshotRestore: () => undefined,
    onArmCommandSnapshotRestore: () => undefined,
    onCancelCommandSnapshotRestore: () => undefined,
    onExecuteCommandSnapshotRestore: () => undefined
  })));
  assert.equal(armedText.includes("确认执行恢复"), true);
  assert.equal(armedText.includes("取消"), true);

  const restoredText = visibleText(renderToStaticMarkup(h(OperationLogPage, {
    operationLog,
    loading: false,
    error: "",
    restorePlanPreview,
    restoreExecution: {
      snapshotId: "fixture-source-video-metadata-snapshot",
      armed: false,
      loading: false,
      error: "",
      result: restoreResult
    },
    onPreviewCommandSnapshotRestore: () => undefined
  })));
  assert.equal(restoredText.includes("恢复已执行"), true);
  assert.equal(restoredText.includes("恢复 1 个文件，阻断 0 个文件"), true);
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
    "相关对象 V000037；原始检查信息已隐藏，可导出检查报告查看。"
  );
  assert.equal(chineseDiagnosticText("AI剪辑实战 V000037"), "AI剪辑实战 V000037");
});

test("AdminApp action notices localize API result messages before rendering", () => {
  const source = readFileSync(resolve("apps/admin-web/src/app/AdminApp.tsx"), "utf8");

  assert.match(source, /chineseDiagnosticText\(result\.message\)/);
  assert.equal(source.includes("result.message ? `。${result.message}`"), false);
});

test("dashboard renders a simple automated control console", async () => {
  const data = await fixtureData();
  const html = renderToStaticMarkup(h(DashboardPage, { data }));

  for (const text of [
    "素材生产驾驶舱",
    "首页",
    "只看当前能不能继续处理素材",
    "当前状态",
    "剪辑端可用素材",
    "等待自动处理",
    "正在处理",
    "已处理待上线",
    "失败可重试",
    "系统状态",
    "自动处理流程",
    "发现素材",
    "自动预处理",
    "自动上线",
    "剪辑端可用",
    "当前建议",
    "现在该做什么",
    "保护规则",
    "已上线素材",
    "不会重跑或下线",
    "剪辑端协议",
    "保持不变",
    "NAS 目录",
    "保持不迁移",
    "v000027",
    "重试失败视频"
  ]) {
    assert.match(html, new RegExp(text));
  }
  assert.match(html, /<button[^>]*data-control-state="m9b-api"[^>]*>重试失败视频<\/button>/);
  assert.doesNotMatch(html, /真实 NAS|未解锁|已解锁/);
  assert.doesNotMatch(html, /设备负荷|服务心跳/);
  assert.doesNotMatch(html, /页面契约|admin-read-model|library-manifest|runtime-telemetry|Shell 首屏|数据来源/);
  assert.doesNotMatch(html, /<span class="ml-form-label">(CPU|内存|网络)<\/span>/);
  assert.doesNotMatch(html, />处理未处理<\/button>/);
  assert.doesNotMatch(html, /素材规模|文案与索引|剪辑端转化|风险摘要|系统负荷|生产吞吐|核心链路健康/);

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
  assert.match(queuedIdleHtml, />启动预处理<\/button>/);
  assert.match(queuedIdleHtml, /<button[^>]*data-control-state="m9b-api"[^>]*>启动预处理<\/button>/);
  assert.match(queuedIdleHtml, /等待自动处理/);
  assert.doesNotMatch(queuedIdleHtml, /queued-by-admin|>0%<\/span>/);

  const processingIdleData = {
    ...queuedIdleData,
    status: {
      ...queuedIdleData.status,
      processing_video_count: 1
    },
    jobs: {
      ...queuedIdleData.jobs,
      active_count: 1,
      supervisor: {
        ...queuedIdleData.jobs.supervisor,
        state: "idle" as const,
        state_label: "未运行"
      },
      jobs: data.jobs.jobs
    }
  };
  const processingIdleHtml = renderToStaticMarkup(h(DashboardPage, {
    data: processingIdleData,
    smartScanReport: createAdminSmartScanReport(processingIdleData)
  }));
  assert.match(processingIdleHtml, /需要恢复/);
  assert.match(processingIdleHtml, /仍标记为处理中/);
  assert.doesNotMatch(processingIdleHtml, /1 正在处理 \/ 40 队列中/);

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
  assert.match(renderToStaticMarkup(h(DashboardPage, { data: withoutEstimate })), /当前建议/);

  const withEnglishTitle = {
    ...data,
    jobs: {
      ...data.jobs,
      jobs: data.jobs.jobs.map((job, index) => (
        index === 0 ? { ...job, title: "AI剪辑实战 V000037" } : job
      ))
    }
  };
  assert.doesNotMatch(renderToStaticMarkup(h(DashboardPage, { data: withEnglishTitle })), /AI剪辑实战 V000037/);

  assert.doesNotMatch(queuedIdleHtml, /data-control-state="read-only"/);
});

test("dashboard keeps rendering when runtime metrics omit source metadata", async () => {
  const data = await fixtureData();
  const dataWithoutMetricSources = {
    ...data,
    metrics: {
      ...data.metrics,
      sources: undefined as unknown as typeof data.metrics.sources
    }
  };
  const text = visibleText(renderToStaticMarkup(h(DashboardPage, { data: dataWithoutMetricSources })));

  assert.match(text, /首页/);
  assert.match(text, /素材生产驾驶舱/);
  assert.match(text, /当前建议/);
  assert.doesNotMatch(text, /素材库账本|使用事件|状态读取/);
});

test("dashboard labels unavailable large-library aggregates instead of fake zeroes", async () => {
  const data = await fixtureData();
  const largeLibraryData = {
    ...data,
    status: {
      ...data.status,
      root_path: "/Volumes/MixLab/PublicLibrary",
      video_count: 11394,
      ready_video_count: 8355
    },
    metrics: {
      ...data.metrics,
      material: {
        ...data.metrics.material,
        video_count: 11394,
        ready_video_count: 8355,
        total_duration_ms: 0,
        ready_duration_ms: 0,
        unprocessed_duration_ms: 0,
        total_size_bytes: 0
      },
      transcript: {
        ...data.metrics.transcript,
        transcript_video_count: 8355,
        character_count: 0,
        segment_count: 732022,
        current_index_version: "v008355"
      },
      production: {
        ...data.metrics.production,
        average_video_process_ms: 0,
        estimated_queue_done_at: ""
      }
    }
  };
  const text = visibleText(renderToStaticMarkup(h(DashboardPage, { data: largeLibraryData })));

  assert.match(text, /剪辑端可用素材 8355/);
  assert.match(text, /当前索引 v000027/);
  assert.match(text, /等待自动处理/);
  assert.match(text, /当前建议/);
  assert.doesNotMatch(text, /可搜索总时长 0h/);
  assert.doesNotMatch(text, /原视频总时长 00:00/);
  assert.doesNotMatch(text, /原视频容量 0 B/);
  assert.doesNotMatch(text, /文案总字数 0/);
});

test("dashboard core path health summarizes search, transcript, cut, and 50-seat readiness", async () => {
  const data = await fixtureData();
  const health = adminCorePathHealth(data);

  assert.equal(health.tone, "attention");
  assert.equal(health.status_label, "需要观察");
  assert.equal(health.title, "搜索到剪切可用，部分指标需要观察");
  assert.equal(health.detail, "本地搜索 100% · p95 47ms · 2/50 剪辑师");
  assert.deepEqual(
    health.rows.map((row) => [row.label, row.value, row.tone]),
    [
      ["关键词定位", "p95 47ms", "healthy"],
      ["完整文案", "24,800 段", "attention"],
      ["选段剪切", "88% 成功", "attention"],
      ["50 人容量", "2/50", "healthy"]
    ]
  );
  assert.match(health.rows[0]?.detail ?? "", /最近 20 次搜索 · 本地搜索 100% · 搜索服务正常覆盖/);
  assert.match(health.rows[1]?.detail ?? "", /120 个可用视频 · 当前索引 v000027 · 待上线 5/);
  assert.equal(health.rows.at(-1)?.detail, "还可承载 48 位剪辑师");

  const blocked = adminCorePathHealth({
    ...data,
    status: {
      ...data.status,
      ready_video_count: 0,
      index_status: "error",
      index_required_video_count: 0
    },
    indexes: {
      ...data.indexes,
      current_version: ""
    },
    metrics: {
      ...data.metrics,
      transcript: {
        ...data.metrics.transcript,
        segment_count: 0
      },
      usage: {
        ...data.metrics.usage,
        search_request_count: 12,
        searchd_search_count: 4,
        sqlite_index_search_count: 3,
        fallback_search_count: 4,
        search_backend_unknown_count: 1,
        search_failure_count: 2,
        search_latency_p95_ms: 620,
        core_search_request_count: 12,
        core_searchd_search_count: 4,
        core_sqlite_index_search_count: 3,
        core_fallback_search_count: 4,
        core_search_backend_unknown_count: 1,
        core_search_failure_count: 2,
        core_search_latency_p95_ms: 620,
        cut_submission_count: 4,
        cut_success_count: 1,
        cut_failure_count: 3,
        active_user_count: 0
      }
    }
  });

  assert.equal(blocked.tone, "blocked");
  assert.equal(blocked.status_label, "需要处理");
  assert.equal(blocked.rows[0]?.tone, "attention");
  assert.equal(blocked.rows[1]?.tone, "blocked");
  assert.equal(blocked.rows[2]?.tone, "blocked");
  assert.equal(blocked.rows[3]?.tone, "attention");
  assert.match(blocked.rows[0]?.detail ?? "", /失败 2/);
  assert.match(blocked.rows[0]?.detail ?? "", /未知 1/);
  assert.match(blocked.rows[0]?.detail ?? "", /备用索引 3/);
  assert.match(blocked.rows[0]?.detail ?? "", /补充读取 4/);

  const failedWithoutSamples = adminCorePathHealth({
    ...data,
    metrics: {
      ...data.metrics,
      usage: {
        ...data.metrics.usage,
        search_request_count: 0,
        search_hit_count: 0,
        search_latency_p95_ms: 0,
        search_failure_count: 1,
        core_search_request_count: 0,
        core_search_latency_p95_ms: 0,
        core_search_failure_count: 1
      }
    }
  });
  assert.equal(failedWithoutSamples.rows[0]?.tone, "blocked");
  assert.match(failedWithoutSamples.rows[0]?.detail ?? "", /失败 1/);
});

test("dashboard usage funnel derives search-to-cut conversion and 50 editor capacity", async () => {
  const data = await fixtureData();
  const rows = adminUsageFunnelRows(data.metrics.usage);

  assert.deepEqual(
    rows.map((row) => [row.label, row.value, row.percent]),
    [
      ["搜索命中率", "86%", 86],
      ["文案选区率", "53%", 53],
      ["加入待剪率", "58%", 58],
      ["剪切成功率", "88%", 88],
      ["50 人容量", "2/50", 4]
    ]
  );
  assert.equal(rows.at(-1)?.detail, "还可承载 48 位剪辑师");
});

test("dashboard usage funnel caps inconsistent historical conversion samples", async () => {
  const data = await fixtureData();
  const rows = adminUsageFunnelRows({
    ...data.metrics.usage,
    search_request_count: 10,
    search_hit_count: 12,
    transcript_selection_count: 1,
    add_to_cut_list_count: 55,
    cut_submission_count: 4,
    cut_success_count: 7,
    active_user_count: 55
  });

  assert.deepEqual(
    rows.map((row) => [row.label, row.value, row.percent]),
    [
      ["搜索命中率", "100%", 100],
      ["文案选区率", "8%", 8],
      ["加入待剪率", "100%", 100],
      ["剪切成功率", "100%", 100],
      ["50 人容量", "55/50", 100]
    ]
  );
  assert.match(rows[0]?.detail ?? "", /搜索样本 10 次 · 样本缺口 2/);
  assert.match(rows[2]?.detail ?? "", /选区样本 1 次 · 样本缺口 54/);
  assert.match(rows[3]?.detail ?? "", /任务样本 4 次 · 样本缺口 3/);
  assert.equal(rows[4]?.detail, "已达到团队基准，超出 5 位");
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
  assert.equal(queuedIdle.primary_label, "启动预处理");
  assert.match(queuedIdle.title, /40 个视频已排队，但预处理服务未运行/);
  assert.equal(queuedIdle.suggestions.some((item) => item.action === "start-preprocess"), true);

  const processingIdle = createAdminSmartScanReport({
    ...base,
    status: {
      ...base.status,
      processing_video_count: 1,
      unprocessed_video_count: 0,
      queued_video_count: 40,
      failed_video_count: 0,
      index_required_video_count: 0
    },
    jobs: {
      ...base.jobs,
      active_count: 1,
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
  assert.equal(processingIdle.primary_action, "recover-processing");
  assert.equal(processingIdle.primary_label, "恢复卡住任务");
  assert.match(processingIdle.title, /1 个处理中任务需要恢复/);

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
  assert.equal(unprocessed.primary_label, "启动预处理");
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
  assert.equal(indexRequired.primary_action, "publish-index");
  assert.equal(indexRequired.primary_label, "查看待上线素材");
  assert.equal(indexRequired.suggestions.some((item) => item.action === "publish-index"), true);

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
  assert.equal(blocked.primary_label, "查看系统检查");
});

test("settings merges library paths, runtime policy, and path checks", async () => {
  const html = renderToStaticMarkup(h(SettingsPage, { data: await fixtureData() }));

	  for (const text of [
	    "素材来源",
	    "预处理设置",
	    "系统状态",
	    "/Volumes/PublicLibrary",
	    "source-videos",
	    ".mixlab-library",
	    "音视频工具",
	    "语音识别"
	  ]) {
	    assert.match(html, new RegExp(text.replaceAll(".", "\\.")));
	  }
	  assert.doesNotMatch(html, /初始化素材库|扫描源视频|自动扫描素材来源|自动入队未处理视频|自动发布可用索引/);
  assert.doesNotMatch(html, /素材库编号|协议版本|预处理产物库|路径与权限校验|是否需要迁移|语言提示|对象存储|最近失败/);
});

test("settings exposes first-run initialization when protocol files are missing", async () => {
  const data = await fixtureData();
  const firstRunData = {
    ...data,
    path_checks: data.path_checks.map((check) => {
      if (check.label === ".mixlab-library") {
        return {
          ...check,
          status: "warn" as const,
          message: "尚未初始化协议目录"
        };
      }

      if (check.path.endsWith("/library.json")) {
        return {
          ...check,
          label: "library.json",
          status: "warn" as const,
          message: "library.json 尚未创建"
        };
      }

      return check;
    })
  };

  const firstRunChecks = adminFirstRunInitializationChecks(firstRunData);
  assert.deepEqual(firstRunChecks.map((check) => check.label), [".mixlab-library", "library.json"]);

  const html = renderToStaticMarkup(h(SettingsPage, {
    data: firstRunData,
    onInitializeLibrary: () => {}
  }));

  assert.match(html, /素材库目录待创建/);
  assert.match(html, />初始化素材库<\/button>/);
  assert.doesNotMatch(html.match(/<button[^>]*>初始化素材库<\/button>/)?.[0] ?? "", /disabled/);
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

test("settings page follows the production-console composition contract", async () => {
  const html = renderToStaticMarkup(h(SettingsPage, {
    data: await fixtureData(),
    onSaveAdminSettings: () => undefined,
    onTestAsrConfig: () => undefined
  }));
  const text = visibleText(html);

  for (const expectedText of [
    "设置",
    "设置表单",
    "设置概览",
    "素材来源",
    "运行策略",
    "路径检查",
    "本地编辑",
    "点击保存后才生效",
    "只检查路径",
    "不会枚举全部素材",
    "密钥隐藏",
    "保存说明",
    "影响后续处理，不会重跑已完成素材",
    "保存设置",
    "检查语音识别"
  ]) {
    assert.match(text, new RegExp(expectedText));
  }

  assert.match(html, /aria-label="设置保存说明"/);
  assert.match(html, /aria-label="设置表单"/);
  assert.match(html, /aria-label="运行策略"/);
  assert.match(html, /aria-label="路径检查"/);
  assert.doesNotMatch(text, /Dashboard|dashboard/);
  assert.doesNotMatch(text, /admin-settings|path-checks|runtime-secrets|settings-route|不扫描|本页面局部处理/);
  assert.doesNotMatch(text, /自动扫描素材来源|自动入队未处理视频|自动发布可用索引|隐藏全库扫描/);
});

test("source video management renders public metadata controls", async () => {
	  const html = renderToStaticMarkup(h(SourceVideosPage, { data: await fixtureData() }));

	  for (const text of [
	    "素材详情",
	    "搜索文件名 / 标签 / 相对路径",
	    "封面",
	    "对剪辑师可见",
    "标签",
    "说明",
    "讲师",
	    "课程",
	    "分类",
	    "现金流管理与风险控制",
	    "封面图片",
	    "保存素材信息"
	  ]) {
	    assert.match(html, new RegExp(text));
	  }
	  assert.doesNotMatch(html, /公共元数据|保存封面/);
	  assert.doesNotMatch(html, /真实 NAS|未解锁|已解锁|data-control-state="read-only"/);
	  assert.doesNotMatch(html, /处理此视频|重试此视频|发布此视频|保存公开说明/);
	});

test("source video page follows the production-console composition contract", async () => {
  const data = await fixtureData();
  const noop = () => {};
  const html = renderToStaticMarkup(h(SourceVideosPage, {
    data,
    onOpenSourceDetail: noop,
    onSourceVideoFiltersChange: noop,
    onLoadMoreSourceVideos: noop
  }));
  const text = visibleText(html);

  for (const expectedText of [
    "素材库",
    "素材表格",
    "素材详情",
    "查看公共素材状态",
    "打开页面不会修改素材文件",
    "按需加载素材",
    "搜索和状态筛选不会修改素材文件",
    "已载入",
    "全部原视频",
    "待处理",
    "保存素材信息"
  ]) {
    assert.match(text, new RegExp(expectedText));
  }

  assert.match(html, /aria-label="筛选预处理状态"/);
  assert.match(html, /aria-label="素材表格"/);
  assert.doesNotMatch(text, /Dashboard|dashboard/);
  assert.doesNotMatch(text, /分页读取|不扫描|状态与搜索|页面控制|Inspector|首屏和继续加载/);
  assert.doesNotMatch(text, /初始化素材库|扫描源视频|自动扫描素材来源/);
});

test("source video page exposes read-model fallback diagnostics in Chinese", async () => {
  const data = await fixtureData();
  const runtimeMeta: AdminRuntimeEndpointMeta = {
    schema_version: "1.0",
    endpoint: "/api/admin/source-videos?status=processing&limit=20",
    method: "GET",
    duration_ms: 412,
    scan_mode: "paged-list",
    data_source: "admin-read-model",
    scan_reason: "route-owned-page",
    actual_data_source: "source-video-manifest",
    cache_status: "miss",
    result_count: 1,
    offset: 0,
    limit: 20,
    slow: false,
    slow_reason: "",
    fallback_reason: "status-store:store-not-fresh",
    components: [
      {
        name: "status_page",
        duration_ms: 301,
        data_source: "admin-read-model",
        scan_mode: "paged-list",
        scan_reason: "route-owned-page",
        cache_status: "miss"
      },
      {
        name: "manifest_fallback",
        duration_ms: 90,
        data_source: "source-video-manifest",
        scan_mode: "paged-list",
        scan_reason: "route-owned-page",
        cache_status: "miss",
        detail: "manifest fallback was used"
      }
    ]
  };
  const html = renderToStaticMarkup(h(SourceVideosPage, {
    data,
    sourceVideoRuntime: runtimeMeta
  }));
  const text = visibleText(html);

  assert.match(text, /素材库/);
  assert.doesNotMatch(text, /读取方式|同步状态|本次返回|读取速度|读取步骤|备用清单读取|同步数据过期/);
  assert.doesNotMatch(text, /status-store:store-not-fresh/);
  assert.doesNotMatch(text, /status_page|manifest_fallback|manifest fallback was used/);
  assert.doesNotMatch(text, /打开保护中心|启动后台对账|读模型维护/);

  const reconcileStatus = await createFixtureAdminApiClient().getReadModelReconcileStatus();
  const blockedHtml = renderToStaticMarkup(h(SourceVideosPage, {
    data,
    readModelMaintenanceHref: "#/protection",
    onStartReadModelReconcile: async () => {},
    readModelReconcileStatus: reconcileStatus,
    sourceVideoRuntime: {
      ...runtimeMeta,
      duration_ms: 98,
      actual_data_source: "admin-read-model",
      fallback_reason: "manifest-fallback:forbidden"
    }
  }));
  const blockedText = visibleText(blockedHtml);
  assert.match(blockedText, /备用清单已阻断/);
  assert.match(blockedText, /数据同步/);
  assert.match(blockedText, /需要对账/);
  assert.match(blockedText, /打开保护中心/);
  assert.match(blockedText, /启动后台对账/);
  assert.match(blockedText, /对账状态/);
  assert.match(blockedText, /运行中/);
  assert.match(blockedText, /读取快照 · 读取任务快照 · 70%/);
  assert.match(blockedHtml, /href="#\/protection"/);
  assert.doesNotMatch(blockedText, /manifest-fallback:forbidden/);
});

test("source video management labels stuck processing videos as recoverable", async () => {
  const data = await fixtureData();
  const processingVideo = {
    ...data.source_videos[0]!,
    source_video_id: "V_STUCK",
    preprocess_status: "processing" as const,
    title: "停留任务",
    file_name: "stuck.mp4"
  };
  const html = renderToStaticMarkup(h(SourceVideosPage, {
    data: {
      ...data,
      status: {
        ...data.status,
        video_count: 1,
        ready_video_count: 0,
        processing_video_count: 1,
        queued_video_count: 0,
        unprocessed_video_count: 0,
        failed_video_count: 0
      },
      jobs: {
        ...data.jobs,
        supervisor: {
          ...data.jobs.supervisor,
          state: "idle" as const,
          state_label: "未运行"
        }
      },
      source_videos: [processingVideo]
    },
    onRecoverProcessingSourceVideo: () => {}
  }));

  assert.match(html, /待恢复/);
  assert.match(html, /恢复到队列/);
  assert.doesNotMatch(html, />处理中<\/span>/);
  assert.doesNotMatch(html, />生成中</);
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
    currentIndexVersion: data.indexes.current_version,
    onSelect: (sourceVideoId) => calls.push(`选择:${sourceVideoId}`),
    onOpenSourceDetail: (sourceVideoId) => calls.push(`详情:${sourceVideoId}`)
  }) as { props: { columns: Array<{ header: string; render?: (row: unknown) => unknown }>; rows: unknown[] } };
  const row = table.props.rows[0];
  const idButton = table.props.columns[1].render?.(row) as { props: { children: Array<{ props: { children: string } }>; onClick: () => void } };
  const detailButton = table.props.columns.at(-1)?.render?.(row) as { props: { children: string; onClick: () => void } };

  assert.deepEqual(
    table.props.columns.map((column) => column.header),
    ["封面", "标题", "时长", "相对路径", "字幕状态", "预处理状态", "搜索可见", "发布版本", "操作"]
  );
  const idLabel = idButton.props.children[1]?.props.children;
  assert.equal(Array.isArray(idLabel) ? idLabel.join("") : idLabel, "V000042 · 现金流管理与风险控制.mp4");
  assert.equal(detailButton.props.children, "详情");

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

  assert.match(withDetail, /V000042 · 现金流管理与风险控制\.mp4/);
  assert.match(withDetail, />详情<\/button>/);
  assert.doesNotMatch(withoutDetail, />详情<\/button>/);
});

test("source video page limits initial table rendering for large libraries", async () => {
  const data = await fixtureData();
  const template = data.source_videos[0]!;
  const largeData = {
    ...data,
    status: {
      ...data.status,
      video_count: 250
    },
    source_videos: Array.from({ length: 150 }, (_, index) => ({
      ...template,
      source_video_id: `V${String(index + 1).padStart(6, "0")}`,
      title: `视频 ${index + 1}`,
      file_name: `video-${index + 1}.mp4`
    }))
  };
  const html = renderToStaticMarkup(h(SourceVideosPage, {
    data: largeData,
    onOpenSourceDetail: () => {},
    onLoadMoreSourceVideos: () => {}
  }));
  const text = visibleText(html);

  assert.match(text, /已载入 150\/250/);
  assert.match(text, /显示 1-20 \/ 当前筛选 150 · 已载入 150 \/ 全部 250/);
  assert.match(text, /继续加载 20 条/);
  assert.equal((html.match(/class="admin-link-button" type="button">详情<\/button>/g) ?? []).length, 20);
  assert.match(html, /video-20\.mp4/);
  assert.doesNotMatch(html, /video-21\.mp4/);

  const loadingHtml = renderToStaticMarkup(h(SourceVideosPage, {
    data: { ...largeData, source_videos: [] },
    isLoadingInitial: true
  }));
  assert.match(loadingHtml, /正在读取首批原视频/);
  assert.match(loadingHtml, /页面已载入，首批 20 条素材正在分页加载/);
});

test("admin source video page merges loaded pages without duplicate rows", async () => {
  const data = await fixtureData();
  const first = data.source_videos[0]!;
  const second = { ...first, source_video_id: "V999999", file_name: "new-page-video.mp4" };

  const merged = mergeAdminSourceVideoPages([first], [{ ...first, title: "刷新后的标题" }, second]);

  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.source_video_id, first.source_video_id);
  assert.equal(merged[0]?.title, "刷新后的标题");
  assert.equal(merged[1]?.source_video_id, "V999999");
});

test("AdminApp source detail hash requires admin login in runtime API mode", () => {
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
    assert.match(html, /登录管理端/);
    assert.match(html, /请输入管理员账号和密码继续管理公共素材库/);
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
    adminActionErrorMessage("上线到剪辑端", new Error("not_found: Route not found")),
    "上线到剪辑端失败：管理端接口暂不可用，请刷新后重试。"
  );
  assert.equal(
    adminActionErrorMessage("保存设置", new Error("validation_failed: 素材来源路径不存在")),
    "保存设置失败：素材来源路径不存在"
  );

  for (const message of [
    adminLoadErrorMessage(new Error("Route not found")),
    adminActionErrorMessage("上线到剪辑端", new Error("not_found: Route not found"))
  ]) {
    assert.doesNotMatch(message, /Failed to fetch|Route not found|not_found|validation_failed/);
  }
});

test("preprocess jobs render failure retry and later success", async () => {
  const data = await fixtureData();
  const preprocessJobsRuntime: AdminRuntimeEndpointMeta = {
    schema_version: "1.0",
    endpoint: "/api/admin/preprocess/jobs?limit=20",
    method: "GET",
    duration_ms: 742,
    scan_mode: "status-scan",
    data_source: "admin-read-model",
    scan_reason: "route-owned-page",
    actual_data_source: "admin-read-model",
    cache_status: "hit",
    result_count: 4,
    offset: 0,
    limit: 20,
    slow: false,
    slow_reason: "",
    components: [
      {
        name: "preprocess_job_page",
        duration_ms: 621,
        data_source: "admin-read-model",
        scan_mode: "paged-list",
        scan_reason: "route-owned-page",
        cache_status: "hit"
      },
      {
        name: "runtime_load",
        duration_ms: 12,
        data_source: "runtime-telemetry",
        scan_mode: "no-scan",
        scan_reason: "route-owned-page",
        cache_status: "not-applicable",
        detail: "status=healthy"
      }
    ]
  };
  const dataWithRuntime = {
    ...data,
    jobs: {
      ...data.jobs,
      runtime: preprocessJobsRuntime
    }
  };
  const processHistory = await createFixtureAdminApiClient().listPreprocessProcessHistory();
  const html = renderToStaticMarkup(h(PreprocessJobsPage, { data: dataWithRuntime, processHistory }));

  for (const text of [
    "素材处理",
    "自动处理与上线",
    "启动后系统会自动发现素材",
	    "素材处理状态",
	    "剪辑端可用",
	    "处理服务",
	    "队列中",
	    "待上线",
	    "失败可重试",
	    "预处理进度",
	    "总体进度",
	    "本次运行",
	    "当前视频",
	    "预处理状态概览",
	    "剩余队列",
	    "已处理待上线",
    "上线到剪辑端",
    "当前索引",
    "系统检查",
    "处理控制",
	    "当前状态",
	    "运行中",
	    "暂停预处理",
	    "本次处理",
	    "自动上线",
    "安全保护",
    "已上线素材",
    "不会重跑或下线",
    "剪辑端",
    "读取协议保持不变"
  ]) {
    assert.match(html, new RegExp(text.replaceAll(".", "\\.")));
  }
  for (const text of [
    "全部素材来源",
    "全部状态",
    "全部事件",
    "分析范围",
    "状态分布",
    "事件分布",
    "来源分布",
    "最近趋势",
    "处理中 1 · 待上线 0 · 失败 1",
    "上线 2 · 完成 0 · 失败 1 · 领取 1",
    "默认素材来源",
    "4 条 · 活跃 1 · 失败 1",
    "2024-05-07",
    "4 条 · 完成 2 · 失败 1",
    "现金流课程片段",
    "已领取",
    "利润增长的估价优化",
    "已领取",
    "任务队列",
    "任务处理详情",
    "J000041",
    "阿里云百炼语音识别网络超时"
  ]) {
    assert.doesNotMatch(html, new RegExp(text.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(html, /preprocess_job_page|runtime_load|status=healthy/);
  assert.doesNotMatch(html, /current\.json/);
  assert.doesNotMatch(html, /运行负荷正常，可以继续处理/);
  assert.match(html, /上线到剪辑端/);
  assert.doesNotMatch(html, /data-control-state="native-boundary"/);
  assert.doesNotMatch(html, /真实 NAS|未解锁|已解锁|启动预处理流水线|暂停预处理流水线/);
  assert.doesNotMatch(html, /查看日志|服务心跳|失败策略/);
  assert.doesNotMatch(html, /<h2 class="ml-form-group-title">运行负荷<\/h2>/);
  assert.doesNotMatch(html, /<span class="ml-form-label">(CPU|内存|网络)<\/span>/);
  assert.doesNotMatch(html, />加入预处理队列<\/button>/);

  const logHtml = renderToStaticMarkup(h(PreprocessJobsPage, {
    data,
    selectedJobLog: {
      loading: false,
      error: "",
      log: {
        job_id: "J000037",
        source_video_id: "V000037",
        path: ".mixlab-library/logs/V000037.log",
        file_path: "/Volumes/PublicLibrary/.mixlab-library/logs/V000037.log",
        exists: true,
        content: "2026-05-02T11:58:00.000Z\tV000037\tasr\tfailed: 阿里云百炼语音识别网络超时"
      }
    },
    onOpenPreprocessJobLog: () => {}
  }));
  assert.doesNotMatch(logHtml, /任务处理详情/);
  assert.doesNotMatch(logHtml, /J000037 · V000037/);
  assert.doesNotMatch(logHtml, /failed: 阿里云百炼语音识别网络超时/);
  assert.doesNotMatch(logHtml, /\.mixlab-library\/logs\/V000037\.log/);

  const loadingJobsHtml = renderToStaticMarkup(h(PreprocessJobsPage, {
    data: {
      ...data,
      jobs: {
        ...data.jobs,
        jobs: []
      }
    },
    isLoadingJobs: true
  }));
  assert.match(loadingJobsHtml, /素材处理/);
  assert.match(loadingJobsHtml, /自动处理与上线/);
  assert.doesNotMatch(loadingJobsHtml, /任务明细后台同步中/);
  assert.doesNotMatch(loadingJobsHtml, /正在读取预处理队列/);

  const unavailableHistoryHtml = renderToStaticMarkup(h(PreprocessJobsPage, {
    data,
    processHistory: {
      ...processHistory,
      history_available: false,
      cache_status: "miss",
      summary: {
        returned_count: 0,
        completed_count: 0,
        failed_count: 0,
        active_count: 0,
        average_process_ms: 0,
        tracked_count: 0,
        tracked_completed_count: 0,
        tracked_failed_count: 0,
        tracked_active_count: 0,
        tracked_average_process_ms: 0,
        window_start_at: "",
        newest_event_at: "",
        oldest_event_at: "",
        status_counts: {
          unprocessed: 0,
          queued: 0,
          processing: 0,
          ready: 0,
          failed: 0,
          "index-required": 0
        },
        event_counts: {
          failed: 0,
          indexed: 0,
          completed: 0,
          claimed: 0,
          status: 0
        },
        source_folder_summaries: [],
        daily_trend: []
      },
      items: []
    }
  }));
  assert.match(unavailableHistoryHtml, /素材处理/);
  assert.doesNotMatch(unavailableHistoryHtml, /处理历史暂不可用/);

  const noisyFailureData = {
    ...data,
    jobs: {
      ...data.jobs,
      jobs: [{
        ...data.jobs.jobs.find((job) => job.status === "failed")!,
        stage: "asr",
        stage_label: "文案预处理 · 阿里云百炼语音识别 ASR_TASK_ID_PLACEHOLDER failed: SUCCESS_WITH_NO_VALID_FRAGMENT",
        error_message: "阿里云百炼语音识别 ASR_TASK_ID_PLACEHOLDER failed: SUCCESS_WITH_NO_VALID_FRAGMENT"
      }]
    }
  };
  const noisyFailureHtml = renderToStaticMarkup(h(PreprocessJobsPage, { data: noisyFailureData }));
  assert.match(noisyFailureHtml, /失败可重试/);
  assert.doesNotMatch(noisyFailureHtml, /语音识别 · 阿里云百炼语音识别失败：未识别到有效语音片段/);
  assert.doesNotMatch(noisyFailureHtml, /ASR_TASK_ID_PLACEHOLDER|SUCCESS_WITH_NO_VALID_FRAGMENT/);

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
  assert.match(queuedIdleHtml, /建议启动预处理/);
  assert.match(queuedIdleHtml, /等待自动处理/);
  assert.doesNotMatch(queuedIdleHtml, /排队第 1 位/);
  assert.doesNotMatch(queuedIdleHtml, /预计开始/);
  assert.doesNotMatch(queuedIdleHtml, /预计完成/);
  assert.match(queuedIdleHtml, /处理控制/);
  assert.doesNotMatch(queuedIdleHtml, /queued-by-admin|\.mixlab-library\/logs|>0%<\/span>/);

  const processingIdleData = {
    ...queuedIdleData,
    status: {
      ...queuedIdleData.status,
      queued_video_count: 1,
      processing_video_count: 1
    },
    jobs: {
      ...queuedIdleData.jobs,
      active_count: 1,
      queued_count: 1,
      jobs: [
        {
          ...data.jobs.jobs.find((job) => job.status === "running")!,
          source_video_id: "V_STUCK",
          title: "停留任务",
          status: "running" as const,
          stage: "asr",
          status_label: "正在处理",
          stage_label: "语音识别"
        },
        queuedIdleData.jobs.jobs[0]!
      ]
    }
  };
  const processingIdleHtml = renderToStaticMarkup(h(PreprocessJobsPage, {
    data: processingIdleData,
    onRecoverProcessingVideos: () => {}
  }));
  assert.match(processingIdleHtml, /1 个处理中任务需要恢复/);
  assert.match(processingIdleHtml, /待恢复/);
  assert.match(processingIdleHtml, /仍有视频停留在处理中/);
  assert.doesNotMatch(processingIdleHtml, /待恢复 · 语音识别/);
  assert.match(processingIdleHtml, /恢复卡住任务/);
  assert.doesNotMatch(processingIdleHtml, /预处理服务已领取/);
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
    onRecoverProcessingVideos: () => {},
    onStartPreprocessSupervisor: () => {},
    onStopPreprocessSupervisor: () => {}
  }));
  const buttonMarkup = (html: string, label: string) =>
    html.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0] ?? "";
  const idleHtml = render(idleData);
  const runningHtml = render(runningData);

  assert.doesNotMatch(idleHtml, /真实 NAS|未解锁|已解锁/);
  assert.match(buttonMarkup(idleHtml, "启动预处理"), /data-control-state="m9b-api"/);
  assert.equal(buttonMarkup(idleHtml, "暂停预处理"), "");
  assert.match(buttonMarkup(idleHtml, "恢复卡住任务"), /data-control-state="m9b-api"/);
  assert.equal(buttonMarkup(runningHtml, "启动预处理"), "");
  assert.match(buttonMarkup(runningHtml, "暂停预处理"), /data-control-state="m9b-api"/);
  assert.equal(buttonMarkup(runningHtml, "恢复卡住任务"), "");

  const runningBetweenJobsData = {
    ...data,
    status: {
      ...data.status,
      processing_video_count: 0,
      index_required_video_count: 0
    },
    jobs: {
      ...data.jobs,
      active_count: 0,
      queued_count: 4,
      supervisor: {
        ...data.jobs.supervisor,
        state: "running" as const,
        state_label: "运行中",
        last_result: {
          total_claimed_count: 2,
          succeeded_count: 2,
          failed_count: 0
        }
      },
      jobs: data.jobs.jobs.filter((job) => job.status !== "running")
    }
  };
  const runningBetweenJobsText = visibleText(render(runningBetweenJobsData));
  assert.match(runningBetweenJobsText, /运行中 处理服务 正在领取下一个视频/);
  assert.match(runningBetweenJobsText, /0 待上线 已自动上线/);
  assert.match(runningBetweenJobsText, /当前视频 正在领取下一个视频 .* 等待中/);
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

  assert.equal(ADMIN_DATA_AUTO_REFRESH_INTERVAL_MS >= 8_000, true);
  assert.equal(ADMIN_DATA_AUTO_REFRESH_INTERVAL_MS <= 60_000, true);
  assert.equal(ADMIN_PREPROCESS_RUNNING_REFRESH_INTERVAL_MS < ADMIN_DATA_AUTO_REFRESH_INTERVAL_MS, true);
  assert.equal(ADMIN_PREPROCESS_RUNNING_REFRESH_INTERVAL_MS >= 3_000, true);
  assert.equal(shouldAutoRefreshAdminData("preprocess-jobs", queuedData), true);
  assert.equal(shouldAutoRefreshAdminData("dashboard", queuedData), false);
  assert.equal(shouldAutoRefreshAdminData("source-videos", queuedData), false);
  assert.equal(shouldAutoRefreshAdminData("settings", queuedData), false);
  assert.equal(shouldAutoRefreshAdminData("preprocess-jobs", runningData), true);
  assert.equal(shouldAutoRefreshAdminData("preprocess-jobs", idleData), true);
  assert.equal(shouldAutoRefreshAdminData("dashboard", idleData), false);
  assert.equal(shouldAutoRefreshAdminData("source-videos", idleData), false);
});

test("preprocess route loader keeps process history route-owned and locally recoverable", async () => {
  const fixture = createFixtureAdminApiClient();
  const calls: Array<
    { kind: "jobs"; options?: { limit?: number; offset?: number } }
    | { kind: "history"; options?: AdminPreprocessProcessHistoryOptions }
  > = [];
  const client = {
    ...fixture,
    listPreprocessJobs: async (options?: { limit?: number; offset?: number }) => {
      calls.push({ kind: "jobs", options });
      return fixture.listPreprocessJobs(options);
    },
    listPreprocessProcessHistory: async (options?: AdminPreprocessProcessHistoryOptions) => {
      calls.push({ kind: "history", options });
      return fixture.listPreprocessProcessHistory(options);
    }
  };

  const result = await loadAdminPreprocessRouteData(client);

  assert.deepEqual(calls.map((call) => call.kind), ["jobs", "history"]);
  assert.deepEqual(calls[0]?.options, { limit: 20 });
  assert.deepEqual(calls[1]?.options, { limit: 20, window_days: 30 });
  assert.equal((result.jobs?.jobs.length ?? 0) > 0, true);
  assert.equal(result.processHistory?.scan_mode, "no-scan");
  assert.equal(result.processHistory?.actual_data_source, "admin-read-model");
  assert.equal(result.jobsError, "");
  assert.equal(result.processHistoryError, "");

  calls.length = 0;
  const filtered = await loadAdminPreprocessRouteData(client, {
    source_folder_name: "默认素材来源",
    preprocess_status: "failed",
    event_type: "failed"
  });

  assert.deepEqual(calls.map((call) => call.kind), ["jobs", "history"]);
  assert.deepEqual(calls[0]?.options, { limit: 20 });
  assert.deepEqual(calls[1]?.options, {
    limit: 20,
    window_days: 30,
    source_folder_name: "默认素材来源",
    preprocess_status: "failed",
    event_type: "failed"
  });
  assert.equal(filtered.processHistory?.items.length, 1);
  assert.equal(filtered.processHistory?.items[0]?.source_video_id, "V000037");
  assert.equal(filtered.processHistory?.scan_mode, "no-scan");
  assert.equal(filtered.processHistoryError, "");

  const partial = await loadAdminPreprocessRouteData({
    ...fixture,
    listPreprocessProcessHistory: async () => {
      throw new Error("Route not found");
    }
  });

  assert.equal((partial.jobs?.jobs.length ?? 0) > 0, true);
  assert.equal(partial.processHistory, null);
  assert.equal(partial.jobsError, "");
  assert.match(partial.processHistoryError, /处理历史加载失败/);
  assert.doesNotMatch(partial.processHistoryError, /Route not found/);

  const jobsPartial = await loadAdminPreprocessRouteData({
    ...fixture,
    listPreprocessJobs: async () => {
      throw new Error("SMB timed out");
    }
  });

  assert.equal(jobsPartial.jobs, null);
  assert.match(jobsPartial.jobsError, /预处理队列加载失败/);
  assert.doesNotMatch(jobsPartial.jobsError, /SMB timed out/);
  assert.equal(jobsPartial.processHistory?.scan_mode, "no-scan");
  assert.equal(jobsPartial.processHistory?.actual_data_source, "admin-read-model");
  assert.equal(jobsPartial.processHistoryError, "");
});

test("route-owned read failures render inside local production-console surfaces", async () => {
  const data = await fixtureData();
  const routeError = "读模型暂不可用，请稍后重试。";
  const withoutSourceVideos = {
    ...data,
    source_videos: []
  };
  const sourceVideosText = visibleText(renderToStaticMarkup(h(SourceVideosPage, {
    data: withoutSourceVideos,
    sourceVideoError: `原视频列表加载失败：${routeError}`
  })));
  const indexPublishText = visibleText(renderToStaticMarkup(h(IndexPublishPage, {
    data: {
      ...withoutSourceVideos,
      status: {
        ...withoutSourceVideos.status,
        index_required_video_count: 5
      }
    },
    indexRequiredError: `待上线素材加载失败：${routeError}`
  })));
  const preprocessText = visibleText(renderToStaticMarkup(h(PreprocessJobsPage, {
    data: {
      ...data,
      jobs: {
        ...data.jobs,
        jobs: []
      }
    },
    jobsError: `预处理队列加载失败：${routeError}`
  })));
  const doctorText = visibleText(renderToStaticMarkup(h(DoctorPage, {
    data,
    doctorReportError: `系统检查加载失败：${routeError}`
  })));
  const settingsText = visibleText(renderToStaticMarkup(h(SettingsPage, {
    data,
    pathChecksError: `路径校验加载失败：${routeError}`,
    runtimeSettingsError: `运行时状态加载失败：${routeError}`
  })));

  assert.match(sourceVideosText, /素材表格加载失败/);
  assert.match(sourceVideosText, /原视频列表加载失败/);
  assert.match(indexPublishText, /上线队列加载失败/);
  assert.match(indexPublishText, /待上线素材加载失败/);
  assert.match(preprocessText, /预处理队列加载失败/);
  assert.match(doctorText, /诊断报告加载失败/);
  assert.match(doctorText, /系统检查加载失败/);
  assert.match(settingsText, /路径检查加载失败/);
  assert.match(settingsText, /路径校验加载失败/);
  assert.match(settingsText, /运行时状态加载失败/);
});

test("route-local read registry owns visible page read-error boundaries", () => {
  assert.deepEqual(Object.keys(ADMIN_ROUTE_LOCAL_READ_SPECS), [
    "sourceVideos",
    "indexRequiredVideos",
    "preprocessJobs",
    "cutterUsers",
    "doctorReport",
    "settingsPathChecks",
    "settingsRuntime"
  ]);

  assert.deepEqual(
    Object.values(ADMIN_ROUTE_LOCAL_READ_SPECS).map((spec) => [
      spec.route,
      spec.label,
      spec.surface,
      spec.global_action_notice
    ]),
    [
      ["source-videos", "原视频列表加载", "素材表格", false],
      ["preprocess-jobs", "待上线素材加载", "上线队列", false],
      ["preprocess-jobs", "预处理队列加载", "任务队列", false],
      ["cutter-users", "剪辑师用户加载", "用户表格", false],
      ["doctor", "系统检查加载", "诊断报告", false],
      ["settings", "路径校验加载", "路径检查", false],
      ["settings", "运行时状态加载", "运行策略", false]
    ]
  );
  assert.equal(adminRouteLocalReadLabel("settingsRuntime"), "运行时状态加载");

  const withError = setAdminRouteLocalReadError(
    EMPTY_ADMIN_ROUTE_LOCAL_READ_ERRORS,
    "sourceVideos",
    "素材表格加载失败"
  );
  assert.equal(withError.sourceVideos, "素材表格加载失败");
  assert.equal(withError.preprocessJobs, "");
  assert.equal(clearAdminRouteLocalReadError(withError, "sourceVideos").sourceVideos, "");
});

test("route loading runtime registry owns visible loading and background refresh boundaries", () => {
  assert.deepEqual(Object.keys(ADMIN_ROUTE_LOADING_SPECS), [
    "sourceDetail",
    "sourceVideosInitial",
    "sourceVideosMore",
    "indexRequiredVideos",
    "preprocessJobsInitial",
    "preprocessProcessHistory",
    "operationsOverview",
    "operationLog",
    "doctorReport",
    "runtimeDiagnostics",
    "settingsPathChecks",
    "settingsRuntime",
    "cutterUsers"
  ]);

  assert.deepEqual(
    Object.values(ADMIN_ROUTE_LOADING_SPECS).map((spec) => [
      spec.route,
      spec.phase,
      spec.shell_blocking,
      spec.abortable,
      spec.global_action_notice
    ]),
    [
      ["source-detail", "route-entry", false, true, false],
      ["source-videos", "route-entry", false, true, false],
      ["source-videos", "route-pagination", false, true, false],
      ["preprocess-jobs", "route-entry", false, true, false],
      ["preprocess-jobs", "route-entry", false, true, false],
      ["preprocess-jobs", "route-supplemental", false, true, false],
      ["protection", "route-entry", false, true, false],
      ["operation-log", "route-entry", false, true, false],
      ["doctor", "route-entry", false, true, false],
      ["doctor", "route-supplemental", false, true, false],
      ["settings", "route-entry", false, true, false],
      ["settings", "route-supplemental", false, true, false],
      ["cutter-users", "route-entry", false, true, false]
    ]
  );

  assert.deepEqual(Object.keys(ADMIN_BACKGROUND_REFRESH_SPECS), [
    "shellDataReloadToken",
    "dashboardPanelData",
    "nonDashboardMetrics",
    "cutterUsersPrefetch",
    "preprocessJobsPrefetch",
    "preprocessJobsInterval"
  ]);
  for (const spec of Object.values(ADMIN_BACKGROUND_REFRESH_SPECS)) {
    assert.equal(spec.shell_blocking, false, `${spec.key} must not block the Admin Shell`);
    assert.equal(spec.route_blocking, false, `${spec.key} must not block the visible route`);
    assert.equal(spec.abortable, true, `${spec.key} must use request-scope cancellation`);
  }
  assert.equal(ADMIN_BACKGROUND_REFRESH_SPECS.cutterUsersPrefetch.enabled_by_default, false);
  assert.equal(ADMIN_BACKGROUND_REFRESH_SPECS.preprocessJobsInterval.visible_error_surface, "route-local");

  assert.deepEqual(
    adminRouteRenderLoadingState({
      sourceVideosLoading: true,
      sourceVideosLoadingMore: false,
      sourceVideosHasMore: true,
      preprocessJobsLoading: false,
      operationsOverviewLoading: true,
      operationLogLoading: false
    }),
    {
      sourceVideos: true,
      sourceVideosMore: false,
      sourceVideosHasMore: true,
      preprocessJobs: false,
      operationsOverview: true,
      operationLog: false
    }
  );
});

test("AdminApp renders visible route loading through the runtime helper", () => {
  const source = readFileSync(resolve("apps/admin-web/src/app/AdminApp.tsx"), "utf8");

  assert.equal(
    source.includes("loadingState: AdminRouteRenderLoadingState"),
    true,
    "renderPage should receive the route loading runtime state type"
  );
  assert.equal(
    source.includes("adminRouteRenderLoadingState({"),
    true,
    "AdminApp should derive render loading state through the route loading runtime helper"
  );
});

test("AdminApp keeps route-owned read failures out of global action notices", () => {
  const source = readFileSync(resolve("apps/admin-web/src/app/AdminApp.tsx"), "utf8");

  for (const expected of [
    "setRouteLocalReadError(\"sourceVideos\", loadError)",
    "setRouteLocalReadError(\"indexRequiredVideos\", loadError)",
    "setRouteLocalReadErrorMessage(\"preprocessJobs\", jobsError)",
    "setRouteLocalReadError(\"preprocessJobs\", loadError)",
    "setRouteLocalReadError(\"cutterUsers\", loadError)",
    "setRouteLocalReadError(\"doctorReport\", loadError)",
    "setRouteLocalReadError(\"settingsPathChecks\", loadError)",
    "setRouteLocalReadError(\"settingsRuntime\", loadError)"
  ]) {
    assert.equal(source.includes(expected), true, `${expected} should handle a route-local read error`);
  }

  for (const forbidden of [
    "setSourceVideosError(",
    "setIndexRequiredVideosError(",
    "setPreprocessJobsError(",
    "setCutterUsersError(",
    "setDoctorReportError(",
    "setSettingsPathChecksError(",
    "setSettingsRuntimeError(",
    "setActionError(adminActionErrorMessage(\"原视频列表加载\"",
    "setActionError(adminActionErrorMessage(\"继续加载原视频\"",
    "setActionError(adminActionErrorMessage(\"待上线素材加载\"",
    "setActionError(adminActionErrorMessage(\"预处理队列加载\"",
    "setActionError(adminActionErrorMessage(\"预处理队列刷新\"",
    "setActionError(adminActionErrorMessage(\"剪辑师用户加载\"",
    "setActionError(adminActionErrorMessage(\"系统检查加载\"",
    "setActionError(adminActionErrorMessage(\"路径校验加载\"",
    "setActionError(adminActionErrorMessage(\"运行时状态加载\""
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} should not poison the Admin shell notice`);
  }
});

test("dashboard background refresh updates only panel data", async () => {
  const data = await fixtureData();
  const next = mergeAdminDashboardPanelData(data, {
    status: {
      ...data.status,
      ready_video_count: data.status.ready_video_count + 1,
      current_index_version: "v009999"
    },
    jobs: {
      ...data.jobs,
      queued_count: data.jobs.queued_count + 2
    },
    metrics: {
      ...data.metrics,
      usage: {
        ...data.metrics.usage,
        search_request_count: data.metrics.usage.search_request_count + 10
      }
    }
  });

  assert.equal(next.status.ready_video_count, data.status.ready_video_count + 1);
  assert.equal(next.jobs.queued_count, data.jobs.queued_count + 2);
  assert.equal(next.metrics.usage.search_request_count, data.metrics.usage.search_request_count + 10);
  assert.equal(next.indexes.current_version, "v009999");
  assert.equal(next.settings, data.settings);
  assert.equal(next.source_videos, data.source_videos);
  assert.equal(next.doctor, data.doctor);
  assert.equal(next.runtime, data.runtime);
});

test("source video route waits for dashboard data before loading the first page", () => {
  assert.equal(shouldLoadAdminSourceVideos({
    route: "source-videos",
    hasData: false
  }), false);
  assert.equal(shouldLoadAdminSourceVideos({
    route: "source-videos",
    hasData: true
  }), true);
  assert.equal(shouldLoadAdminSourceVideos({
    route: "dashboard",
    hasData: true
  }), false);
  assert.equal(adminSourceVideoManifestFallbackPolicy("processing"), "forbid");
  assert.equal(adminSourceVideoManifestFallbackPolicy("index-required"), "forbid");
  assert.equal(adminSourceVideoManifestFallbackPolicy("queued"), undefined);
  assert.equal(adminSourceVideoManifestFallbackPolicy("ready"), undefined);
  assert.equal(adminSourceVideoManifestFallbackPolicy("all"), undefined);
});

test("route loading runtime owns pure route loader planner decisions", () => {
  const adminAppSource = readFileSync(resolve("apps/admin-web/src/app/AdminApp.tsx"), "utf8");
  const runtimeSource = readFileSync(resolve("apps/admin-web/src/app/route-loading-runtime.ts"), "utf8");

  for (const expected of [
    "export function shouldAutoRefreshAdminData",
    "export function shouldLoadAdminSourceVideos",
    "export function shouldPrefetchAdminRoute"
  ]) {
    assert.equal(runtimeSource.includes(expected), true, `${expected} should be owned by route-loading-runtime`);
    assert.equal(adminAppSource.includes(expected), false, `${expected} should not be defined by AdminApp`);
  }

  assert.equal(
    adminAppSource.includes("shouldAutoRefreshAdminData(route, data)"),
    true,
    "AdminApp should consume the runtime planner instead of duplicating it"
  );
  assert.equal(
    adminAppSource.includes("shouldLoadAdminSourceVideos({"),
    true,
    "AdminApp should consume the source-video route planner"
  );
  assert.equal(
    Array.from(adminAppSource.matchAll(/manifest_fallback: adminSourceVideoManifestFallbackPolicy\(sourceVideoStatusFilter\)/g)).length,
    2,
    "source-video initial and pagination requests should use the manifest fallback policy helper"
  );
  assert.equal(
    runtimeSource.includes("export function adminSourceVideoManifestFallbackPolicy"),
    true,
    "source-video manifest fallback policy should be owned by route-loading-runtime"
  );
  assert.equal(
    adminAppSource.includes("shouldPrefetchAdminRoute({"),
    true,
    "AdminApp should consume the prefetch planner"
  );
});

test("route loading runtime owns token-based route load start guards", () => {
  assert.deepEqual(
    Object.values(ADMIN_ROUTE_TOKEN_LOAD_SPECS).map((spec) => [
      spec.key,
      spec.route,
      spec.loading_key,
      spec.local_read_key ?? null,
      spec.requires_shell_data,
      spec.request_scope,
      spec.client_method,
      spec.success_target,
      spec.error_surface,
      spec.supports_pending_handoff
    ]),
    [
      [
        "doctorReport",
        "doctor",
        "doctorReport",
        "doctorReport",
        false,
        "route-abortable",
        "getDoctorReport",
        "dashboardData.doctor",
        "route-local-read-error",
        true
      ],
      [
        "runtimeDiagnostics",
        "doctor",
        "runtimeDiagnostics",
        null,
        true,
        "route-abortable",
        "getRuntimeDiagnosticsHistory",
        "runtimeDiagnosticsHistory",
        "route-local-state-error",
        false
      ],
      [
        "settingsPathChecks",
        "settings",
        "settingsPathChecks",
        "settingsPathChecks",
        false,
        "route-abortable",
        "getPathChecks",
        "dashboardData.path_checks",
        "route-local-read-error",
        true
      ],
      [
        "settingsRuntime",
        "settings",
        "settingsRuntime",
        "settingsRuntime",
        false,
        "route-abortable",
        "getRuntimeSettings",
        "dashboardData.runtime",
        "route-local-read-error",
        true
      ]
    ]
  );

  assert.equal(shouldStartAdminRouteTokenLoad({
    key: "doctorReport",
    route: "doctor",
    loading: false,
    loadedToken: 1,
    reloadToken: 2
  }), true);
  assert.equal(shouldStartAdminRouteTokenLoad({
    key: "doctorReport",
    route: "settings",
    loading: false,
    loadedToken: 1,
    reloadToken: 2
  }), false);
  assert.equal(shouldStartAdminRouteTokenLoad({
    key: "doctorReport",
    route: "doctor",
    loading: true,
    loadedToken: 1,
    reloadToken: 2
  }), false);
  assert.equal(shouldStartAdminRouteTokenLoad({
    key: "doctorReport",
    route: "doctor",
    loading: false,
    loadedToken: 2,
    reloadToken: 2
  }), false);
  assert.equal(shouldStartAdminRouteTokenLoad({
    key: "doctorReport",
    route: "doctor",
    loading: false,
    loadedToken: 1,
    reloadToken: 2,
    canLoad: false
  }), false);
  assert.equal(shouldStartAdminRouteTokenLoad({
    key: "runtimeDiagnostics",
    route: "doctor",
    loading: false,
    loadedToken: 1,
    reloadToken: 2
  }), false);
  assert.equal(shouldStartAdminRouteTokenLoad({
    key: "runtimeDiagnostics",
    route: "doctor",
    loading: false,
    loadedToken: 1,
    reloadToken: 2,
    canLoad: true
  }), true);

  const createdScopes: string[] = [];
  const started = createAdminRouteTokenRequestScope({
    key: "doctorReport",
    route: "doctor",
    loading: false,
    loadedToken: 1,
    reloadToken: 2,
    createRequestScope: (spec) => {
      createdScopes.push(spec.client_method);
      return { loader: spec.key };
    }
  });
  assert.deepEqual(started, {
    spec: ADMIN_ROUTE_TOKEN_LOAD_SPECS.doctorReport,
    requestScope: { loader: "doctorReport" }
  });
  assert.deepEqual(createdScopes, ["getDoctorReport"]);

  const blocked = createAdminRouteTokenRequestScope({
    key: "doctorReport",
    route: "settings",
    loading: false,
    loadedToken: 1,
    reloadToken: 2,
    createRequestScope: (spec) => {
      createdScopes.push(spec.client_method);
      return { loader: spec.key };
    }
  });
  assert.equal(blocked, null);
  assert.deepEqual(createdScopes, ["getDoctorReport"]);
});

test("route loading runtime runs token loader lifecycle through the execution runner", async () => {
  const events: string[] = [];
  const started = startAdminRouteTokenLoad({
    key: "doctorReport",
    route: "doctor",
    loading: false,
    loadedToken: 1,
    reloadToken: 2,
    createRequestScope: (spec) => {
      events.push(`scope:${spec.key}`);
      return {
        loader: spec.key,
        abort: () => events.push(`abort:${spec.key}`)
      };
    },
    onStart: ({ spec }) => events.push(`start:${spec.key}`),
    request: async ({ requestScope }) => {
      events.push(`request:${requestScope.loader}`);
      return "ok";
    },
    onSuccess: (result) => events.push(`success:${result}`),
    onError: (error) => events.push(`error:${String(error)}`),
    onSettled: ({ cancelled }) => events.push(`settled:${cancelled}`)
  });

  assert.equal(started?.spec.key, "doctorReport");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(events, [
    "scope:doctorReport",
    "start:doctorReport",
    "request:doctorReport",
    "success:ok",
    "settled:false"
  ]);

  const blockedEvents: string[] = [];
  const blocked = startAdminRouteTokenLoad({
    key: "doctorReport",
    route: "settings",
    loading: false,
    loadedToken: 1,
    reloadToken: 2,
    createRequestScope: (spec) => {
      blockedEvents.push(`scope:${spec.key}`);
      return {
        abort: () => blockedEvents.push(`abort:${spec.key}`)
      };
    },
    request: async () => "blocked",
    onSuccess: (result) => blockedEvents.push(`success:${result}`),
    onError: (error) => blockedEvents.push(`error:${String(error)}`)
  });

  assert.equal(blocked, null);
  assert.deepEqual(blockedEvents, []);

  const cancelledEvents: string[] = [];
  const cancelled = startAdminRouteTokenLoad({
    key: "doctorReport",
    route: "doctor",
    loading: false,
    loadedToken: 1,
    reloadToken: 2,
    createRequestScope: (spec) => ({
      abort: () => cancelledEvents.push(`abort:${spec.key}`)
    }),
    onStart: ({ spec }) => cancelledEvents.push(`start:${spec.key}`),
    request: async () => "late",
    onSuccess: (result) => cancelledEvents.push(`success:${result}`),
    onError: (error) => cancelledEvents.push(`error:${String(error)}`),
    onCancel: ({ spec }) => cancelledEvents.push(`cancel:${spec.key}`),
    onSettled: ({ cancelled: wasCancelled }) => cancelledEvents.push(`settled:${wasCancelled}`)
  });

  cancelled?.cancel();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(cancelledEvents, [
    "start:doctorReport",
    "cancel:doctorReport",
    "abort:doctorReport",
    "settled:true"
  ]);
});

test("route loading runtime runs request loader lifecycle through the execution runner", async () => {
  assert.deepEqual(
    Object.values(ADMIN_ROUTE_REQUEST_LOAD_SPECS).map((spec) => [
      spec.key,
      spec.route,
      spec.loading_key,
      spec.local_read_key,
      spec.request_scope,
      spec.client_method,
      spec.success_target,
      spec.error_surface,
      spec.supports_loaded_token
    ]),
    [
      [
        "cutterUsers",
        "cutter-users",
        "cutterUsers",
        "cutterUsers",
        "route-abortable",
        "listCutterUsers",
        "cutterUsers",
        "route-local-read-error",
        true
      ],
      [
        "indexRequiredVideos",
        "preprocess-jobs",
        "indexRequiredVideos",
        "indexRequiredVideos",
        "route-abortable",
        "listSourceVideos",
        "indexRequiredVideos",
        "route-local-read-error",
        false
      ],
      [
        "sourceVideosInitial",
        "source-videos",
        "sourceVideosInitial",
        "sourceVideos",
        "route-abortable",
        "listSourceVideosWithRuntime",
        "sourceVideosInitial",
        "route-local-read-error",
        false
      ],
      [
        "preprocessJobsInitial",
        "preprocess-jobs",
        "preprocessJobsInitial",
        "preprocessJobs",
        "route-abortable",
        "loadAdminPreprocessRouteData",
        "preprocessJobsInitial",
        "route-local-read-error",
        false
      ],
      [
        "operationLog",
        "operation-log",
        "operationLog",
        undefined,
        "route-abortable",
        "getOperationLog",
        "operationLog",
        "route-local-state-error",
        false
      ],
      [
        "operationsOverview",
        "protection",
        "operationsOverview",
        undefined,
        "route-abortable",
        "loadProtectionCenterData",
        "operationsOverview",
        "route-local-state-error",
        false
      ],
      [
        "sourceDetail",
        "source-detail",
        "sourceDetail",
        undefined,
        "route-abortable",
        "getSourceVideoDetail",
        "sourceDetail",
        "route-local-state-error",
        false
      ]
    ]
  );

  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "cutterUsers",
    route: "cutter-users",
    loading: false
  }), true);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "cutterUsers",
    route: "settings",
    loading: false
  }), false);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "cutterUsers",
    route: "cutter-users",
    loading: true
  }), false);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "cutterUsers",
    route: "cutter-users",
    loading: false,
    hasFreshData: true
  }), false);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "cutterUsers",
    route: "cutter-users",
    loading: false,
    canLoad: false
  }), false);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "indexRequiredVideos",
    route: "preprocess-jobs",
    loading: false
  }), true);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "indexRequiredVideos",
    route: "index-publish",
    loading: false
  }), false);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "indexRequiredVideos",
    route: "source-videos",
    loading: false
  }), false);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "sourceVideosInitial",
    route: "source-videos",
    loading: false,
    canLoad: true
  }), true);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "sourceVideosInitial",
    route: "source-videos",
    loading: false,
    canLoad: false
  }), false);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "sourceVideosInitial",
    route: "index-publish",
    loading: false,
    canLoad: true
  }), false);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "preprocessJobsInitial",
    route: "preprocess-jobs",
    loading: false
  }), true);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "preprocessJobsInitial",
    route: "source-videos",
    loading: false
  }), false);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "operationLog",
    route: "operation-log",
    loading: false
  }), true);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "operationLog",
    route: "cutter-users",
    loading: false
  }), false);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "operationsOverview",
    route: "protection",
    loading: false
  }), true);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "operationsOverview",
    route: "operation-log",
    loading: false
  }), false);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "sourceDetail",
    route: "source-detail",
    loading: false
  }), true);
  assert.equal(shouldStartAdminRouteRequestLoad({
    key: "sourceDetail",
    route: "source-videos",
    loading: false
  }), false);

  const createdScopes: string[] = [];
  const scoped = createAdminRouteRequestScope({
    key: "cutterUsers",
    route: "cutter-users",
    loading: false,
    createRequestScope: (spec) => {
      createdScopes.push(spec.client_method);
      return { loader: spec.key };
    }
  });
  assert.deepEqual(scoped, {
    spec: ADMIN_ROUTE_REQUEST_LOAD_SPECS.cutterUsers,
    requestScope: { loader: "cutterUsers" }
  });
  assert.deepEqual(createdScopes, ["listCutterUsers"]);

  const indexRequiredScope = createAdminRouteRequestScope({
    key: "indexRequiredVideos",
    route: "preprocess-jobs",
    loading: false,
    createRequestScope: (spec) => {
      createdScopes.push(spec.client_method);
      return { loader: spec.key };
    }
  });
  assert.deepEqual(indexRequiredScope, {
    spec: ADMIN_ROUTE_REQUEST_LOAD_SPECS.indexRequiredVideos,
    requestScope: { loader: "indexRequiredVideos" }
  });
  assert.deepEqual(createdScopes, ["listCutterUsers", "listSourceVideos"]);

  const sourceVideosInitialScope = createAdminRouteRequestScope({
    key: "sourceVideosInitial",
    route: "source-videos",
    loading: false,
    canLoad: true,
    createRequestScope: (spec) => {
      createdScopes.push(spec.client_method);
      return { loader: spec.key };
    }
  });
  assert.deepEqual(sourceVideosInitialScope, {
    spec: ADMIN_ROUTE_REQUEST_LOAD_SPECS.sourceVideosInitial,
    requestScope: { loader: "sourceVideosInitial" }
  });
  assert.deepEqual(createdScopes, [
    "listCutterUsers",
    "listSourceVideos",
    "listSourceVideosWithRuntime"
  ]);

  const preprocessJobsInitialScope = createAdminRouteRequestScope({
    key: "preprocessJobsInitial",
    route: "preprocess-jobs",
    loading: false,
    createRequestScope: (spec) => {
      createdScopes.push(spec.client_method);
      return { loader: spec.key };
    }
  });
  assert.deepEqual(preprocessJobsInitialScope, {
    spec: ADMIN_ROUTE_REQUEST_LOAD_SPECS.preprocessJobsInitial,
    requestScope: { loader: "preprocessJobsInitial" }
  });
  assert.deepEqual(createdScopes, [
    "listCutterUsers",
    "listSourceVideos",
    "listSourceVideosWithRuntime",
    "loadAdminPreprocessRouteData"
  ]);

  const operationLogScope = createAdminRouteRequestScope({
    key: "operationLog",
    route: "operation-log",
    loading: false,
    createRequestScope: (spec) => {
      createdScopes.push(spec.client_method);
      return { loader: spec.key };
    }
  });
  assert.deepEqual(operationLogScope, {
    spec: ADMIN_ROUTE_REQUEST_LOAD_SPECS.operationLog,
    requestScope: { loader: "operationLog" }
  });
  assert.deepEqual(createdScopes, [
    "listCutterUsers",
    "listSourceVideos",
    "listSourceVideosWithRuntime",
    "loadAdminPreprocessRouteData",
    "getOperationLog"
  ]);

  const operationsOverviewScope = createAdminRouteRequestScope({
    key: "operationsOverview",
    route: "protection",
    loading: false,
    createRequestScope: (spec) => {
      createdScopes.push(spec.client_method);
      return { loader: spec.key };
    }
  });
  assert.deepEqual(operationsOverviewScope, {
    spec: ADMIN_ROUTE_REQUEST_LOAD_SPECS.operationsOverview,
    requestScope: { loader: "operationsOverview" }
  });
  assert.deepEqual(createdScopes, [
    "listCutterUsers",
    "listSourceVideos",
    "listSourceVideosWithRuntime",
    "loadAdminPreprocessRouteData",
    "getOperationLog",
    "loadProtectionCenterData"
  ]);

  const sourceDetailScope = createAdminRouteRequestScope({
    key: "sourceDetail",
    route: "source-detail",
    loading: false,
    createRequestScope: (spec) => {
      createdScopes.push(spec.client_method);
      return { loader: spec.key };
    }
  });
  assert.deepEqual(sourceDetailScope, {
    spec: ADMIN_ROUTE_REQUEST_LOAD_SPECS.sourceDetail,
    requestScope: { loader: "sourceDetail" }
  });
  assert.deepEqual(createdScopes, [
    "listCutterUsers",
    "listSourceVideos",
    "listSourceVideosWithRuntime",
    "loadAdminPreprocessRouteData",
    "getOperationLog",
    "loadProtectionCenterData",
    "getSourceVideoDetail"
  ]);

  const events: string[] = [];
  const started = startAdminRouteRequestLoad({
    key: "cutterUsers",
    route: "cutter-users",
    loading: false,
    createRequestScope: (spec) => {
      events.push(`scope:${spec.key}`);
      return {
        loader: spec.key,
        abort: () => events.push(`abort:${spec.key}`)
      };
    },
    onStart: ({ spec }) => events.push(`start:${spec.key}`),
    request: async ({ requestScope }) => {
      events.push(`request:${requestScope.loader}`);
      return "ok";
    },
    onSuccess: (result) => events.push(`success:${result}`),
    onError: (error) => events.push(`error:${String(error)}`),
    onSettled: ({ cancelled }) => events.push(`settled:${cancelled}`)
  });

  assert.equal(started?.spec.key, "cutterUsers");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(events, [
    "scope:cutterUsers",
    "start:cutterUsers",
    "request:cutterUsers",
    "success:ok",
    "settled:false"
  ]);

  const blockedEvents: string[] = [];
  const blocked = startAdminRouteRequestLoad({
    key: "cutterUsers",
    route: "cutter-users",
    loading: false,
    hasFreshData: true,
    createRequestScope: (spec) => {
      blockedEvents.push(`scope:${spec.key}`);
      return {
        abort: () => blockedEvents.push(`abort:${spec.key}`)
      };
    },
    request: async () => "blocked",
    onSuccess: (result) => blockedEvents.push(`success:${result}`),
    onError: (error) => blockedEvents.push(`error:${String(error)}`)
  });
  assert.equal(blocked, null);
  assert.deepEqual(blockedEvents, []);

  const cancelledEvents: string[] = [];
  const cancelled = startAdminRouteRequestLoad({
    key: "cutterUsers",
    route: "cutter-users",
    loading: false,
    createRequestScope: (spec) => ({
      abort: () => cancelledEvents.push(`abort:${spec.key}`)
    }),
    onStart: ({ spec }) => cancelledEvents.push(`start:${spec.key}`),
    request: async () => "late",
    onSuccess: (result) => cancelledEvents.push(`success:${result}`),
    onError: (error) => cancelledEvents.push(`error:${String(error)}`),
    onCancel: ({ spec }) => cancelledEvents.push(`cancel:${spec.key}`),
    onSettled: ({ cancelled: wasCancelled }) => cancelledEvents.push(`settled:${wasCancelled}`)
  });

  cancelled?.cancel();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(cancelledEvents, [
    "start:cutterUsers",
    "cancel:cutterUsers",
    "abort:cutterUsers",
    "settled:true"
  ]);
});

test("background refresh runner owns abortable supplemental reads", async () => {
  assert.equal(shouldStartAdminBackgroundRefresh({
    key: "dashboardPanelData",
    loading: false
  }), true);
  assert.equal(shouldStartAdminBackgroundRefresh({
    key: "dashboardPanelData",
    loading: true
  }), false);
  assert.equal(shouldStartAdminBackgroundRefresh({
    key: "dashboardPanelData",
    loading: false,
    active: true
  }), false);
  assert.equal(shouldStartAdminBackgroundRefresh({
    key: "cutterUsersPrefetch",
    loading: false
  }), false);
  assert.equal(shouldStartAdminBackgroundRefresh({
    key: "cutterUsersPrefetch",
    loading: false,
    enabled: true
  }), true);

  const createdScopes: string[] = [];
  const dashboardScope = createAdminBackgroundRefreshScope({
    key: "dashboardPanelData",
    loading: false,
    createRequestScope: (spec) => {
      createdScopes.push(spec.key);
      return { loader: spec.key };
    }
  });
  assert.deepEqual(dashboardScope, {
    spec: ADMIN_BACKGROUND_REFRESH_SPECS.dashboardPanelData,
    requestScope: { loader: "dashboardPanelData" }
  });
  assert.deepEqual(createdScopes, ["dashboardPanelData"]);

  const events: string[] = [];
  const started = startAdminBackgroundRefresh({
    key: "dashboardPanelData",
    loading: false,
    createRequestScope: (spec) => {
      events.push(`scope:${spec.key}`);
      return {
        loader: spec.key,
        abort: () => events.push(`abort:${spec.key}`)
      };
    },
    onStart: ({ spec }) => events.push(`start:${spec.key}`),
    request: async ({ requestScope }) => {
      events.push(`request:${requestScope.loader}`);
      return "ok";
    },
    onSuccess: (result) => events.push(`success:${result}`),
    onError: (error) => events.push(`error:${String(error)}`),
    onSettled: ({ cancelled }) => events.push(`settled:${cancelled}`)
  });

  assert.equal(started?.spec.key, "dashboardPanelData");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(events, [
    "scope:dashboardPanelData",
    "start:dashboardPanelData",
    "request:dashboardPanelData",
    "success:ok",
    "settled:false"
  ]);

  const cancelledEvents: string[] = [];
  const cancelled = startAdminBackgroundRefresh({
    key: "dashboardPanelData",
    loading: false,
    createRequestScope: (spec) => ({
      abort: () => cancelledEvents.push(`abort:${spec.key}`)
    }),
    onStart: ({ spec }) => cancelledEvents.push(`start:${spec.key}`),
    request: async () => "late",
    onSuccess: (result) => cancelledEvents.push(`success:${result}`),
    onError: (error) => cancelledEvents.push(`error:${String(error)}`),
    onCancel: ({ spec }) => cancelledEvents.push(`cancel:${spec.key}`),
    onSettled: ({ cancelled: wasCancelled }) => cancelledEvents.push(`settled:${wasCancelled}`)
  });

  cancelled?.cancel();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(cancelledEvents, [
    "start:dashboardPanelData",
    "cancel:dashboardPanelData",
    "abort:dashboardPanelData",
    "settled:true"
  ]);
});

test("AdminApp consumes token route load guards from the runtime", () => {
  const source = readFileSync(resolve("apps/admin-web/src/app/AdminApp.tsx"), "utf8");

  assert.equal(source.includes("startAdminRouteTokenLoad({"), true);
  assert.equal(source.includes("createAdminRouteTokenRequestScope({"), false);
  assert.equal(source.includes("shouldStartAdminRouteTokenLoad({"), false);
  assert.equal(
    Array.from(source.matchAll(/startAdminRouteTokenLoad\(\{/g)).length,
    4,
    "Doctor and Settings token route loaders should use the token execution runner"
  );
  assert.equal(source.includes("expectedRoute:"), false);
  for (const expected of [
    "key: \"doctorReport\"",
    "key: \"runtimeDiagnostics\"",
    "key: \"settingsPathChecks\"",
    "key: \"settingsRuntime\""
  ]) {
    assert.equal(source.includes(expected), true, `${expected} should identify a registered token route loader`);
  }
  assert.equal(
    Array.from(source.matchAll(/createRequestScope: \(\) => createRuntimeRequestScope\(apiBaseUrl, adminAuthSession\)/g)).length,
    16,
    "token, request, and background runners should create abortable request scopes through runtime runners"
  );
  for (const expected of [
    "request: ({ requestScope }) => requestScope.client.getDoctorReport()",
    "request: ({ requestScope }) => requestScope.client.getRuntimeDiagnosticsHistory({ limit: 20 })",
    "request: ({ requestScope }) => requestScope.client.getPathChecks()",
    "request: ({ requestScope }) => withAdminLoadTimeout("
  ]) {
    assert.equal(source.includes(expected), true, `${expected} should stay in the migrated token runner contract`);
  }
  assert.equal(source.includes("route !== \"doctor\" ||"), false);
  assert.equal(source.includes("route !== \"settings\" ||"), false);
  assert.equal(source.includes("runtimeDiagnosticsLoadingRef.current ||"), false);
  assert.equal(source.includes("settingsPathChecksLoadingRef.current ||"), false);
  assert.equal(source.includes("settingsRuntimeLoadingRef.current ||"), false);
});

test("AdminApp consumes request route loaders from the runtime", () => {
  const source = readFileSync(resolve("apps/admin-web/src/app/AdminApp.tsx"), "utf8");

  assert.equal(source.includes("startAdminRouteRequestLoad({"), true);
  assert.equal(
    Array.from(source.matchAll(/startAdminRouteRequestLoad\(\{/g)).length,
    7,
    "Cutter Users, Index Publish, Source Videos, Preprocess Jobs, Operation Log, Protection Center, and Source Detail route loaders should use the request execution runner"
  );
  assert.equal(source.includes("key: \"cutterUsers\""), true);
  assert.equal(source.includes("key: \"indexRequiredVideos\""), true);
  assert.equal(source.includes("key: \"sourceVideosInitial\""), true);
  assert.equal(source.includes("key: \"preprocessJobsInitial\""), true);
  assert.equal(source.includes("key: \"operationLog\""), true);
  assert.equal(source.includes("key: \"operationsOverview\""), true);
  assert.equal(source.includes("key: \"sourceDetail\""), true);
  assert.equal(
    Array.from(source.matchAll(/createRequestScope: \(\) => createRuntimeRequestScope\(apiBaseUrl, adminAuthSession\)/g)).length,
    16,
    "token, request, and background runners should create abortable request scopes through runtime runners"
  );
  assert.equal(source.includes("hasFreshData: Boolean(cutterUsers && cutterUsersLoadedTokenRef.current === cutterUsersReloadToken)"), true);
  assert.equal(source.includes("request: ({ requestScope }) => withAdminLoadTimeout("), true);
  assert.equal(source.includes("requestScope.client.listCutterUsers()"), true);
  assert.equal(source.includes("requestScope.client.listSourceVideosReadOnly({"), true);
  assert.equal(source.includes("requestScope.client.listSourceVideosWithRuntime({"), true);
  assert.equal(source.includes("canLoad: shouldLoadAdminSourceVideos({"), true);
  assert.equal(source.includes("status: \"index-required\""), true);
  assert.equal(source.includes("loadAdminPreprocessRouteData(requestScope.client, preprocessProcessHistoryFilters)"), true);
  assert.equal(source.includes("requestScope.client.getOperationLog({ limit: 50 })"), true);
  assert.equal(source.includes("loadProtectionCenterData(requestScope.client)"), true);
  assert.equal(source.includes("requestScope.client.getSourceVideoDetail(request.sourceVideoId)"), true);
  assert.equal(source.includes("route !== \"cutter-users\""), false);
  assert.equal(source.includes("route !== \"operation-log\""), false);
  assert.equal(source.includes("route !== \"protection\""), false);
  assert.equal(source.includes("cutterUsersRouteLoadingRef.current)"), false);
});

test("route prefetch stays disabled by default and waits for dashboard data", async () => {
  const data = await fixtureData();
  const routePlanEnabled = {
    ...data.data_loading_plan,
    routes: data.data_loading_plan.routes.map((route) =>
      route.route === "preprocess-jobs"
        ? { ...route, prefetch: true }
        : route
    )
  };

  assert.equal(shouldPrefetchAdminRoute({
    plan: data.data_loading_plan,
    route: "preprocess-jobs",
    hasData: false
  }), false);
  assert.equal(shouldPrefetchAdminRoute({
    plan: data.data_loading_plan,
    route: "preprocess-jobs",
    hasData: true
  }), false);
  assert.equal(shouldPrefetchAdminRoute({
    plan: routePlanEnabled,
    route: "preprocess-jobs",
    hasData: true
  }), false);
});

test("doctor page renders Chinese diagnosis checks and report export", async () => {
  const data = await fixtureData();
  const html = renderToStaticMarkup(h(DoctorPage, {
    data,
    runtimeDiagnostics: doctorRuntimeDiagnosticsFixture()
  }));

  for (const text of [
    "检查系统状态",
    "系统状态",
    "加载速度记录",
    "素材列表",
    "1200ms",
    "同步数据",
    "分页读取",
    "未命中",
    "历史文件存在异常行",
    "发布清单",
    "音视频工具",
    "语音识别",
    "检查目的",
    "失败影响",
    "处理建议",
    "检查结果",
    "检查详情",
    "预处理日志目录可写性",
    "预处理任务日志",
    "本地剪辑片段属于剪辑端本地工作区",
    "公共素材库根目录",
    "重新检查",
    "导出检查报告"
  ]) {
    assert.match(html, new RegExp(text));
  }
  assert.doesNotMatch(html, /管理端读模型|admin-read-model|doctor-probes|read-model-health|页面契约|慢接口历史|技术详情/);

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
          check_id: "preprocess-logs",
          label: "Preprocess Logs",
          status: "warn" as const,
          message: "preprocess logs are missing for V000037"
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
  assert.match(realDoctorHtml, /预处理任务日志/);
  assert.match(realDoctorHtml, /预处理日志缺失： V000037/);
  assert.match(realDoctorHtml, /未知检查项/);
  assert.match(realDoctorHtml, /需关注/);
  assert.doesNotMatch(realDoctorHtml, /Unknown English Probe|raw probe detail|source-videos|source video manifests|library counts|ffmpeg|bundled|preprocess logs|EACCES/i);
});

test("doctor page follows the production-console composition contract", async () => {
  const data = await fixtureData();
  const html = renderToStaticMarkup(h(DoctorPage, {
    data,
    runtimeDiagnostics: doctorRuntimeDiagnosticsFixture(),
    onRunDoctor: () => undefined,
    onExportDoctor: () => undefined
  }));
  const text = visibleText(html);

  for (const expectedText of [
    "系统状态",
    "诊断报告",
    "加载速度记录",
    "检查结果",
    "检查报告",
    "加载较慢",
    "读取方式",
    "步骤耗时",
    "检查详情",
    "重新检查",
    "导出检查报告"
  ]) {
    assert.match(text, new RegExp(expectedText));
  }

  assert.match(html, /aria-label="加载速度记录"/);
  assert.match(html, /aria-label="诊断报告"/);
  assert.doesNotMatch(text, /Dashboard|dashboard/);
  assert.doesNotMatch(text, /admin-read-model|doctor-probes|read-model-health|页面契约|慢接口历史|技术详情/);
  assert.doesNotMatch(text, /初始化素材库|自动扫描素材来源|隐藏全库扫描/);
});

test("cutter users page renders login applications and user metrics", async () => {
  const client = createFixtureAdminApiClient();
  const users = await client.listCutterUsers();
  const metrics = (await client.getDashboardMetrics()).usage;
  const html = renderToStaticMarkup(h(CutterUsersPage, {
    users,
    metrics,
    onApprove: () => {},
    onDisable: () => {},
    onResetPassword: () => undefined
  }));

  for (const text of [
    "剪辑师",
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
    "重置密码",
    "停用用户",
    "张三",
    "王五"
  ]) {
    assert.match(html, new RegExp(text));
  }
});

test("cutter users page follows the production-console composition contract", async () => {
  const client = createFixtureAdminApiClient();
  const users = await client.listCutterUsers();
  const metrics = (await client.getDashboardMetrics()).usage;
  const html = renderToStaticMarkup(h(CutterUsersPage, {
    users,
    metrics,
    onApprove: () => {},
    onDisable: () => {},
    onResetPassword: () => undefined
  }));
  const text = visibleText(html);

  for (const expectedText of [
    "剪辑师",
    "用户表格",
    "用户概览",
    "使用概览",
    "用户仓库",
    "使用指标",
    "命令操作",
    "只显示剪辑师账号和审核状态",
    "管理提示",
    "账号操作",
    "使用记录",
    "异常处理",
    "通过 / 停用 / 重置密码",
    "待审核",
    "已通过",
    "重置密码",
    "停用用户"
  ]) {
    assert.match(text, new RegExp(expectedText));
  }

  assert.match(html, /aria-label="剪辑师管理提示"/);
  assert.match(html, /aria-label="用户表格"/);
  assert.doesNotMatch(text, /Dashboard|dashboard/);
  assert.doesNotMatch(text, /不扫描|本页面局部处理|页面契约/);
  assert.doesNotMatch(text, /扫描源视频|初始化素材库|自动扫描素材来源/);
});

test("cutter user destructive controls require real handlers and confirm disable", async () => {
  const client = createFixtureAdminApiClient();
  const users = await client.listCutterUsers();
  const metrics = (await client.getDashboardMetrics()).usage;
  const withoutHandlers = renderToStaticMarkup(h(CutterUsersPage, {
    users,
    metrics
  }));

  assert.match(withoutHandlers, /<button[^>]*disabled[^>]*>通过申请<\/button>/);
  assert.match(withoutHandlers, /<button[^>]*disabled[^>]*>停用用户<\/button>/);

  const approvedUser = users.users.find((user) => user.status === "approved")!;
  const dialogHtml = renderToStaticMarkup(h(CutterUserDisableDialog, {
    user: approvedUser,
    onCancel: () => undefined,
    onConfirm: () => undefined
  }));

  assert.match(dialogHtml, /role="dialog"/);
  assert.match(dialogHtml, /停用剪辑师用户/);
  assert.match(dialogHtml, new RegExp(approvedUser.display_name));
  assert.match(dialogHtml, /登录凭证会失效/);
  assert.match(dialogHtml, /确认停用/);

  const resetDialogHtml = renderToStaticMarkup(h(CutterUserPasswordResetDialog, {
    user: approvedUser,
    onCancel: () => undefined,
    onConfirm: () => undefined
  }));
  assert.match(resetDialogHtml, /重置剪辑师密码/);
  assert.match(resetDialogHtml, /新密码/);
  assert.match(resetDialogHtml, /确认重置/);
});

test("cutter users page keeps device audit details out of the default workflow", async () => {
  const client = createFixtureAdminApiClient();
  const baseMetrics = (await client.getDashboardMetrics()).usage;
  const metrics = {
    ...baseMetrics,
    search_failure_count: 2,
    users: [
      ...baseMetrics.users,
      {
        user_id: "CU000009",
        username: "xiaolin",
        search_request_count: 3,
        search_failure_count: 2,
        add_to_cut_list_count: 1,
        transcript_selection_count: 1,
        cut_submission_count: 1,
        cut_success_count: 1,
        local_clip_count: 1,
        reuse_local_clip_count: 0,
        last_used_at: "2026-05-03T08:20:00.000Z"
      }
    ]
  };
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
	    "用户概览",
	    "审批状态",
	    "待审核 1 人",
	    "最近使用",
	    "小林",
	    "搜索 3 次",
	    "剪切成功 1 次"
	  ]) {
	    assert.match(html, new RegExp(text.replaceAll("+", "\\+")));
	  }
	  assert.doesNotMatch(html, /身份方式|设备令牌|会话令牌|设备编号|最近 IP|浏览器标识/);
	  assert.doesNotMatch(html, /192\.168\.31\.10|cutter-1234567890abcdef|cutter…cdef/);
	  assert.doesNotMatch(html, /Mozilla\/5\.0/);
	  assert.doesNotMatch(html, /AppleWebKit\/605\.1\.15/);
	});

test("settings render runtime and redacted speech recognition key state", async () => {
  const data = await fixtureData();
  const html = renderToStaticMarkup(h(SettingsPage, { data }));

	  for (const text of [
	    "预处理设置",
	    "语音识别",
	    "阿里云百炼",
	    "通义语音识别模型",
	    "压缩单声道",
	    "无损单声道",
	    "已配置，已隐藏",
	    "新密钥保存后生效，留空不会覆盖当前密钥；页面只显示密钥配置状态。",
	    "检查语音识别"
	  ]) {
	    assert.match(html, new RegExp(text.replaceAll(".", "\\.")));
	  }
	  assert.doesNotMatch(html, /密钥只保存在运行配置中|诊断报告|V000037 语音识别网络超时|语言提示|对象存储|最近失败/);

  assert.match(html, /aria-label="阿里云百炼接口密钥"/);
  assert.match(html, /type="password"/);
  assert.equal(html.includes("sk-"), false);

	  const withoutKey = {
	    ...data,
	    runtime: {
	      ...data.runtime,
	      asr: {
	        ...data.runtime.asr,
	        dashscope_api_key_configured: false
	      }
	    }
	  };
	  assert.match(renderToStaticMarkup(h(SettingsPage, { data: withoutKey })), /未配置/);
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
	        label: "启动预处理",
	        state: "m9b-api",
	        reason: "持续处理队列，直到全部完成或手动暂停。",
	        variant: "primary"
	      }),
      h(EmptyState, {
        title: "没有匹配的原视频",
        detail: "请调整搜索词或状态筛选。"
      })
    )
  );

	  assert.match(html, /data-control-state="m9b-api"/);
	  assert.match(html, /启动预处理/);
	  assert.match(html, /持续处理队列，直到全部完成或手动暂停/);
  assert.match(html, /没有匹配的原视频/);
  assert.match(html, /对剪辑师可见/);
});

test("M9B UI shell orchestrates Admin API mutations without duplicating shell actions", () => {
  const source = readFileSync(resolve("apps/admin-web/src/app/AdminApp.tsx"), "utf8");

  assert.equal(source.includes("runAction("), true);
  assert.equal(source.includes("onInitializeLibrary"), true);
  assert.equal(source.includes("updateSourceVideoMetadata"), true);
  assert.equal(source.includes("updateSourceVideoCover"), true);
  assert.equal(source.includes("getPreprocessJobLog"), true);
  assert.equal(source.includes("listIndexVersions"), true);
  assert.equal(source.includes("loadAdminPreprocessRouteData"), true);
  assert.equal(source.includes("onOpenPreprocessJobLog"), true);
  assert.equal(source.includes('actions={["扫描源视频", "处理", "Doctor"]}'), false);
  assert.equal(source.includes("UnifiedToolbar"), false);
  assert.equal(source.includes("AppShell"), true);
  assert.equal(source.includes("admin-shell-v1"), true);
  assert.equal(source.includes("admin-workbench-v1"), true);
  assert.equal(source.includes("admin-frame"), false);
  assert.equal(source.includes("admin-shell\""), false);
  assert.equal(source.includes("AdminTopbar"), true);
  assert.equal(source.includes("admin-topbar-status"), true);
  assert.equal(source.includes("admin-sidebar-runtime-line"), true);
  assert.equal(source.includes("<span>素材库</span>"), true);
  assert.equal(source.includes("<span>系统状态</span>"), true);
  assert.equal(source.includes("<small>{data.metrics.usage.active_user_count}/50 活跃剪辑师</small>"), false);
  assert.equal(source.includes("library-settings"), false);
  assert.match(readFileSync(resolve("apps/admin-web/src/features/settings/SettingsPage.tsx"), "utf8"), /useEffect/);
});

test("route-owned loaders use reusable request scopes instead of raw AbortControllers", () => {
  const source = readFileSync(resolve("apps/admin-web/src/app/AdminApp.tsx"), "utf8");

  const requestScopeCount = Array.from(
    source.matchAll(/createRuntimeRequestScope\(apiBaseUrl, adminAuthSession\)/g)
  ).length;
  const rawAbortControllerCount = Array.from(source.matchAll(/new AbortController\(\)/g)).length;
  const rawSignalBindingCount = Array.from(
    source.matchAll(/createRuntimeClient\(baseUrl, authSession, \{ signal: abortController\.signal \}\)/g)
  ).length;
  const requestScopeAbortCount = Array.from(source.matchAll(/requestScope\.abort\(\)/g)).length;
  const tokenLoadCancelCount = Array.from(source.matchAll(/tokenLoad\.cancel\(\)/g)).length;
  const requestLoadCancelCount = Array.from(source.matchAll(/routeLoad\.cancel\(\)/g)).length;

  assert.ok(requestScopeCount >= 16, `expected route and background request scopes, got ${requestScopeCount}`);
  assert.equal(rawAbortControllerCount, 1, "raw AbortController construction should stay inside the helper");
  assert.equal(rawSignalBindingCount, 1, "AbortSignal binding should stay inside the helper");
  assert.ok(requestScopeAbortCount >= 3, `expected remaining non-runner cleanup aborts, got ${requestScopeAbortCount}`);
  assert.equal(tokenLoadCancelCount, 4, "token route loaders should clean up through the execution runner");
  assert.equal(requestLoadCancelCount, 7, "request route loaders should clean up through the execution runner");

  for (const expected of [
    "function createRuntimeRequestScope(",
    "requestScope.client.getAuthStatus()",
    "loadAdminDashboardData(requestScope.client, { includeHeavy: false })",
    "requestScope.client.listSourceVideosReadOnly({",
    "loadAdminPreprocessRouteData(requestScope.client",
    "requestScope.client.listIndexVersions()",
    "loadProtectionCenterData(requestScope.client)",
    "requestScope.client.getOperationLog({ limit: 50 })",
    "requestScope.client.getDoctorReport()",
    "requestScope.client.getPathChecks()",
    "requestScope.client.getRuntimeSettings()",
    "requestScope.client.getSourceVideoDetail(request.sourceVideoId)",
    "requestScope.client.listCutterUsers()"
  ]) {
    assert.equal(source.includes(expected), true, `${expected} should use the request scope`);
  }

  for (const forbidden of [
    "createRuntimeClient(apiBaseUrl, adminAuthSession, { signal:",
    "const scopedClient =",
    "abortController.abort();"
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} should not appear outside the helper path`);
  }
});

test("background refresh and prefetch loaders use reusable request scopes", () => {
  const source = readFileSync(resolve("apps/admin-web/src/app/AdminApp.tsx"), "utf8");
  const requestScopeCount = Array.from(
    source.matchAll(/createRuntimeRequestScope\(apiBaseUrl, adminAuthSession\)/g)
  ).length;
  const activeBackgroundRefreshCount = Array.from(
    source.matchAll(/let activeBackgroundRefresh: AdminBackgroundRefreshExecution<AdminRuntimeRequestScope> \| null = null/g)
  ).length;
  const backgroundPreprocessRefreshCount = Array.from(
    source.matchAll(/loadAdminPreprocessRouteData\(requestScope\.client, preprocessProcessHistoryFilters\)/g)
  ).length;
  const backgroundRefreshCancelCount = Array.from(
    source.matchAll(/activeBackgroundRefresh\?\.cancel\(\)/g)
  ).length;
  const scopedBackgroundRefreshCancelCount = Array.from(
    source.matchAll(/backgroundRefresh\.cancel\(\)/g)
  ).length;
  const backgroundRefreshStartCount = Array.from(
    source.matchAll(/startAdminBackgroundRefresh\(\{/g)
  ).length;

  assert.ok(requestScopeCount >= 16, `expected background scopes in addition to route scopes, got ${requestScopeCount}`);
  assert.equal(activeBackgroundRefreshCount, 2, "dashboard and preprocess interval refreshes should track runner executions");
  assert.ok(backgroundPreprocessRefreshCount >= 3, "route load, prefetch, and interval refresh should use request scopes");
  assert.equal(backgroundRefreshCancelCount, 2, "dashboard and preprocess interval refreshes should cancel through runner handles");
  assert.equal(scopedBackgroundRefreshCancelCount, 3, "supplemental and prefetch refreshes should cancel through runner handles");
  assert.equal(backgroundRefreshStartCount, 5, "all background refresh specs should use the shared runner");

  for (const expected of [
    "startAdminBackgroundRefresh({",
    "key: \"nonDashboardMetrics\"",
    "key: \"dashboardPanelData\"",
    "key: \"cutterUsersPrefetch\"",
    "key: \"preprocessJobsPrefetch\"",
    "key: \"preprocessJobsInterval\"",
    "let activeBackgroundRefresh: AdminBackgroundRefreshExecution<AdminRuntimeRequestScope> | null = null",
    "requestScope.client.getDashboardMetrics()",
    "requestScope.client.listCutterUsers()",
    "loadAdminDashboardPanelData(requestScope.client)",
    "active: Boolean(activeBackgroundRefresh)",
    "activeBackgroundRefresh?.cancel()",
    "cutterUsersPrefetchLoadingRef.current = false;",
    "preprocessJobsPrefetchLoadingRef.current = false;"
  ]) {
    assert.equal(source.includes(expected), true, `${expected} should be part of background cancellation`);
  }

  for (const forbidden of [
    "loadAdminDashboardPanelData(client)",
    "loadAdminPreprocessRouteData(client, preprocessProcessHistoryFilters)",
    "let activeRequestScope: AdminRuntimeRequestScope | null = null",
    "activeRequestScope?.abort()",
    "cutterUsersPrefetchLoadingRef.current = true;\n\n    withAdminLoadTimeout(",
    "preprocessJobsPrefetchLoadingRef.current = true;\n\n    loadAdminPreprocessRouteData(",
    "let activeAbortController",
    "withAdminLoadTimeout(\n      client.listCutterUsers()"
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} should not use the shared client`);
  }
});

test("command actions use stable command policy instead of abortable request scopes", () => {
  const source = readFileSync(resolve("apps/admin-web/src/app/AdminApp.tsx"), "utf8");

  for (const expected of [
    "from \"./command-cancellation-policy.ts\"",
    "const activeAdminCommandLabelRef = useRef(\"\");",
    "const beginAdminCommandAction = (label: string, notice?: string): boolean => {",
    "adminCommandActionStartDecision(activeAdminCommandLabelRef.current, label)",
    "const finishAdminCommandAction = (label: string) => {",
    "if (!beginAdminCommandAction(label)) {",
    "const result = await action(client);",
    "finishAdminCommandAction(label);",
    "if (!beginAdminCommandAction(\"扫描新增素材\",",
    "await client.scanSourceVideos();",
    "await client.runDoctor();",
    "loadAdminDashboardData(client, { includeHeavy: false })",
    "finishAdminCommandAction(\"扫描新增素材\");",
    "if (!beginAdminCommandAction(\"命令快照恢复\",",
    "client.restoreCommandSnapshot(snapshotId)",
    "finishAdminCommandAction(\"命令快照恢复\");",
    "if (!beginAdminCommandAction(\"启动后台对账\",",
    "client.startReadModelReconcile()",
    "finishAdminCommandAction(\"启动后台对账\");",
    "if (!beginAdminCommandAction(\"请求停止对账\",",
    "client.cancelReadModelReconcile()",
    "finishAdminCommandAction(\"请求停止对账\");"
  ]) {
    assert.equal(source.includes(expected), true, `${expected} should enforce command policy`);
  }

  for (const expected of [
    "onInitializeLibrary: () => runAction(\"初始化素材库\"",
    "onScanSourceVideos: () => runAction(\"扫描源视频\"",
    "onQueueUnprocessedVideos: () => runAction(\"加入预处理队列\"",
    "onRepairIndex: runRepairIndexInBatches",
    "onRunDoctor: () => runAction(\"运行系统检查\"",
    "onSaveAdminSettings: (settings) =>",
    "onApproveCutterUser: (userId) =>",
    "onExecuteCommandSnapshotRestore: executeCommandSnapshotRestore",
    "onStartReadModelReconcile: startReadModelReconcile",
    "onCancelReadModelReconcile: cancelReadModelReconcile",
    "onRunSmartScan: runSmartScan"
  ]) {
    assert.equal(source.includes(expected), true, `${expected} should remain command guarded`);
  }

  for (const forbidden of [
    "action(requestScope.client)",
    "requestScope.client.scanSourceVideos()",
    "requestScope.client.runDoctor()",
    "requestScope.client.restoreCommandSnapshot",
    "requestScope.client.startReadModelReconcile",
    "requestScope.client.cancelReadModelReconcile",
    "requestScope.client.queueUnprocessedVideos",
    "requestScope.client.saveAdminSettings"
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} should not be used for mutating commands`);
  }
});

test("admin production shell has explicit UI Foundation scroll ownership", () => {
  const css = readFileSync(resolve("apps/admin-web/src/styles.css"), "utf8");

  assert.match(css, /\.admin-app \.admin-shell-v1\s*{[^}]*height:\s*100vh/s);
  assert.match(css, /\.admin-app \.admin-workbench-v1\s*{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.admin-app \.admin-content-split\s*{[^}]*overflow:\s*auto/s);
});

test("source video management keeps write actions contextual", async () => {
  const data = await fixtureData();
  const noop = () => {};
  const html = renderToStaticMarkup(
    h(SourceVideosPage, {
      data,
      onQueueSourceVideo: noop,
      onRetrySourceVideo: noop,
      onPublishSourceVideo: noop,
      onOpenSourceDetail: noop,
      onUpdateSourceVideoMetadata: noop,
      onUpdateSourceVideoCover: noop
    })
  );

	  assert.match(html, /素材库/);
	  assert.match(html, /搜索文件名 \/ 标签 \/ 相对路径/);
	  assert.match(html, /详情/);
	  assert.match(html, /素材详情/);
	  assert.match(html, /保存素材信息/);
	  assert.doesNotMatch(html, /公共元数据|保存封面/);
	  assert.doesNotMatch(html, /真实 NAS|未解锁|已解锁|处理此视频|重试此视频|发布此视频|保存公开说明/);
	  assert.doesNotMatch(html, /data-control-state="read-only"/);
	});

test("source metadata inspector shows only the current video's primary action", async () => {
  const data = await fixtureData();
  const noop = () => {};
  const baseVideo = data.source_videos[0]!;
  const html = renderToStaticMarkup(
    h("section", null,
      h(SourceMetadataInspector, {
        video: { ...baseVideo, preprocess_status: "unprocessed" },
        onQueueSourceVideo: noop,
        onSave: noop,
        onCoverSave: noop
      }),
      h(SourceMetadataInspector, {
        video: { ...baseVideo, source_video_id: "V_FAILED", preprocess_status: "failed" },
        onRetrySourceVideo: noop,
        onSave: noop,
        onCoverSave: noop
      }),
      h(SourceMetadataInspector, {
        video: { ...baseVideo, source_video_id: "V_INDEX", preprocess_status: "index-required" },
        onPublishSourceVideo: noop,
        onSave: noop,
        onCoverSave: noop
      })
    )
  );

  assert.match(html, /加入预处理/);
  assert.match(html, /重新处理/);
  assert.match(html, /上线到剪辑端/);
  assert.match(html, /保存素材信息/);
  assert.doesNotMatch(html, /处理此视频|重试此视频|发布此视频|保存公开说明|未解锁|已解锁/);
});

test("core admin pages no longer expose NAS write unlock controls", async () => {
  const data = await fixtureData();
  const noop = () => {};
  const dashboardHtml = renderToStaticMarkup(h(DashboardPage, {
    data,
    onRunSmartScan: noop
  }));
  const sourceVideosHtml = renderToStaticMarkup(h(SourceVideosPage, {
    data,
    onQueueSourceVideo: noop,
    onRetrySourceVideo: noop,
    onPublishSourceVideo: noop,
    onUpdateSourceVideoMetadata: noop,
    onUpdateSourceVideoCover: noop
  }));
  const preprocessHtml = renderToStaticMarkup(h(PreprocessJobsPage, {
    data,
    onRepairIndex: noop,
    onRetryFailedVideos: noop
  }));

  for (const html of [dashboardHtml, sourceVideosHtml, preprocessHtml]) {
    assert.doesNotMatch(html, /真实 NAS 写入动作|真实 NAS 安全边界|未解锁|已解锁|只读观察|人工确认/);
    assert.doesNotMatch(html, /data-control-state="read-only"/);
  }

  assert.match(dashboardHtml, /素材生产驾驶舱/);
  assert.match(sourceVideosHtml, /保存素材信息/);
  assert.match(preprocessHtml, /上线到剪辑端|上线全部已处理素材/);
});
