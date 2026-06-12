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
  mergeAdminDashboardPanelData,
  mergeAdminSourceVideoPages,
  resolveAdminRuntimeApiBaseUrl,
  shouldLoadAdminSourceVideos,
  shouldAutoRefreshAdminData,
  sourceDetailForRequest,
  sourceDetailLoadErrorMessage,
  sourceDetailRequestForRoute
} from "./app/AdminApp.tsx";
import { DashboardPage, adminCorePathHealth, adminUsageFunnelRows } from "./features/dashboard/DashboardPage.tsx";
import { DoctorPage } from "./features/doctor/DoctorPage.tsx";
import { PreprocessJobsPage } from "./features/preprocess-jobs/PreprocessJobsPage.tsx";
import { SettingsPage, adminFirstRunInitializationChecks } from "./features/settings/SettingsPage.tsx";
import { CutterUserDisableDialog, CutterUsersPage } from "./features/cutter-users/CutterUsersPage.tsx";
import { AdminControlButton, EmptyState, MetricBand, SourceMetadataInspector, SourceVideoTable } from "./features/shared.tsx";
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
    ["仪表盘", "原视频管理", "预处理", "剪辑师用户", "设置"]
  );
  assert.equal(ADMIN_NAV_ITEMS.at(-1)?.label, "设置");
  assert.equal(ADMIN_NAV_ITEMS.some((item) => item.label === "公共素材库设置"), false);
  assert.equal(ADMIN_NAV_ITEMS.some((item) => item.label === "索引与发布"), false);
  assert.equal(routeFromHash("#/library-settings"), "settings");
  assert.equal(routeFromHash("#/index-health"), "preprocess-jobs");
  assert.equal(routeFromHash("#/index-publish"), "preprocess-jobs");
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
    "相关对象 V000037；原始检查信息已隐藏，可导出检查报告查看。"
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
    "Admin / Dashboard",
    "公共素材库仪表盘",
    "公共库摘要",
    "根目录",
    "可搜索总时长",
    "可用视频",
    "句子片段",
    "失败任务",
    "活跃剪辑师",
    "生产吞吐",
    "生产健康",
    "索引发布",
    "最近预警",
    "局部刷新",
    "下一步建议",
    "核心链路健康",
    "搜索到剪切可用，部分指标需要观察",
    "需要观察",
    "关键词定位",
    "完整文案",
    "选段剪切",
    "本地搜索 100%",
    "搜索服务正常覆盖",
    "磁盘空间",
    "刷新方式",
    "空状态",
    "错误状态",
    "v000027",
    "素材规模",
    "文案与索引",
    "预处理产能",
    "剪辑端使用",
    "剪辑端转化",
    "搜索命中率",
    "文案选区率",
    "加入待剪率",
    "剪切成功率",
    "50 人容量",
    "风险摘要",
    "系统负荷",
    "当前状态",
    "处理建议",
    "原视频总时长",
    "文案总字数",
    "搜索请求",
    "搜索 p95",
    "47ms",
    "本地搜索覆盖",
    "100%",
    "补充读取",
    "活跃剪辑师"
  ]) {
    assert.match(html, new RegExp(text));
  }
  assert.match(html, /<button[^>]*data-control-state="m9b-api"[^>]*>局部刷新<\/button>/);
  assert.doesNotMatch(html, /真实 NAS|未解锁|已解锁/);
  assert.doesNotMatch(html, /设备负荷|服务心跳/);
  assert.doesNotMatch(html, /<span class="ml-form-label">(CPU|内存|网络)<\/span>/);
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
  assert.match(queuedIdleHtml, />启动预处理<\/button>/);
  assert.match(queuedIdleHtml, /<button[^>]*data-control-state="m9b-api"[^>]*>启动预处理<\/button>/);
  assert.match(queuedIdleHtml, /排队第 1 位/);
  assert.match(queuedIdleHtml, /等待处理/);
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
  assert.match(processingIdleHtml, /待恢复/);
  assert.match(processingIdleHtml, /1 个待恢复 \/ 40 队列中/);
  assert.match(processingIdleHtml, /存在停滞中的处理任务/);
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

  assert.doesNotMatch(queuedIdleHtml, /data-control-state="read-only"/);
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
  assert.match(health.rows[1]?.detail ?? "", /120 个可用视频 · 当前索引 v000027 · 待发布 5/);
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
  assert.equal(indexRequired.primary_action, "start-preprocess");
  assert.equal(indexRequired.primary_label, "启动预处理");
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
	  assert.doesNotMatch(html, /素材库编号|协议版本|预处理产物库|运行策略|路径与权限校验|是否需要迁移|语言提示|对象存储|最近失败/);
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
  }) as { props: { columns: string[]; rows: Array<unknown[]> } };
  const idButton = table.props.rows[0][1] as { props: { children: Array<{ props: { children: string } }>; onClick: () => void } };
  const detailButton = table.props.rows[0].at(-1) as { props: { children: string; onClick: () => void } };

  assert.deepEqual(table.props.columns, ["封面", "标题", "时长", "相对路径", "字幕状态", "预处理状态", "搜索可见", "发布版本", "操作"]);
  const idLabel = idButton.props.children[1]?.props.children;
  assert.equal(Array.isArray(idLabel) ? idLabel.join("") : idLabel, "V000042 · 现金流管理与风险控制.mp4");
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

  assert.match(withDetail, /V000042 · 现金流管理与风险控制\.mp4/);
  assert.match(withDetail, />查看详情<\/button>/);
  assert.doesNotMatch(withoutDetail, />查看详情<\/button>/);
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

  assert.match(text, /已载入 150 \/ 250/);
  assert.match(text, /显示 1-20 \/ 当前筛选 150 · 已载入 150 \/ 全部 250/);
  assert.match(text, /继续加载 20 条/);
  assert.equal((html.match(/class="admin-link-button" type="button">查看详情<\/button>/g) ?? []).length, 20);
  assert.match(html, /video-20\.mp4/);
  assert.doesNotMatch(html, /video-21\.mp4/);

  const loadingHtml = renderToStaticMarkup(h(SourceVideosPage, {
    data: { ...largeData, source_videos: [] },
    isLoadingInitial: true
  }));
  assert.match(loadingHtml, /正在读取首批原视频/);
  assert.match(loadingHtml, /页面已载入，首批 20 条素材正在加载/);
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
    adminActionErrorMessage("发布到剪辑端", new Error("not_found: Route not found")),
    "发布到剪辑端失败：管理端接口暂不可用，请刷新后重试。"
  );
  assert.equal(
    adminActionErrorMessage("保存设置", new Error("validation_failed: 素材来源路径不存在")),
    "保存设置失败：素材来源路径不存在"
  );

  for (const message of [
    adminLoadErrorMessage(new Error("Route not found")),
    adminActionErrorMessage("发布到剪辑端", new Error("not_found: Route not found"))
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
	    "处理控制",
	    "状态摘要",
	    "处理结果",
	    "运行中",
	    "详情",
	    "暂停预处理",
    "上次处理",
    "索引状态",
    "自动增量发布",
    "当前索引状态",
    "当前索引已发布 v000027",
    "校验说明",
    "索引包校验通过",
    "生成关键帧",
    "阿里云百炼语音识别网络超时",
    "J000041"
  ]) {
    assert.match(html, new RegExp(text.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(html, /current\.json/);
	  assert.match(html, /运行负荷正常，可以继续处理/);
	  assert.match(html, /发布到剪辑端/);
	  assert.doesNotMatch(html, /data-control-state="native-boundary"/);
	  assert.doesNotMatch(html, /真实 NAS|未解锁|已解锁|启动预处理流水线|暂停预处理流水线/);
	  assert.doesNotMatch(html, /任务日志|查看日志|服务心跳|失败策略/);
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
	  assert.match(logHtml, /任务处理详情/);
	  assert.match(logHtml, /J000037 · V000037/);
  assert.match(logHtml, /failed: 阿里云百炼语音识别网络超时/);
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
  assert.match(loadingJobsHtml, /预处理流水线与索引发布/);
  assert.match(loadingJobsHtml, /任务明细后台同步中/);
  assert.doesNotMatch(loadingJobsHtml, /正在读取预处理队列/);

  const noisyFailureData = {
    ...data,
    jobs: {
      ...data.jobs,
      jobs: [{
        ...data.jobs.jobs.find((job) => job.status === "failed")!,
        stage: "asr",
        stage_label: "文案预处理 · 阿里云百炼语音识别 task 3b279eb3-6549-42ac-bfdd-b0d174886eb5 failed: SUCCESS_WITH_NO_VALID_FRAGMENT",
        error_message: "阿里云百炼语音识别 task 3b279eb3-6549-42ac-bfdd-b0d174886eb5 failed: SUCCESS_WITH_NO_VALID_FRAGMENT"
      }]
    }
  };
  const noisyFailureHtml = renderToStaticMarkup(h(PreprocessJobsPage, { data: noisyFailureData }));
  assert.match(noisyFailureHtml, /语音识别 · 阿里云百炼语音识别失败：未识别到有效语音片段/);
  assert.doesNotMatch(noisyFailureHtml, /3b279eb3|SUCCESS_WITH_NO_VALID_FRAGMENT|task /);

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
  assert.match(queuedIdleHtml, /等待处理/);
  assert.match(queuedIdleHtml, /排队第 1 位/);
  assert.match(queuedIdleHtml, /预计开始/);
  assert.match(queuedIdleHtml, /预计 30:00 完成当前队列/);
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
  assert.match(processingIdleHtml, /服务未运行，停留在处理中/);
  assert.match(processingIdleHtml, /待恢复 · 语音识别/);
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
  assert.equal(ADMIN_DATA_AUTO_REFRESH_INTERVAL_MS <= 15_000, true);
  assert.equal(shouldAutoRefreshAdminData("preprocess-jobs", queuedData), true);
  assert.equal(shouldAutoRefreshAdminData("dashboard", queuedData), false);
  assert.equal(shouldAutoRefreshAdminData("source-videos", queuedData), false);
  assert.equal(shouldAutoRefreshAdminData("settings", queuedData), false);
  assert.equal(shouldAutoRefreshAdminData("preprocess-jobs", runningData), true);
  assert.equal(shouldAutoRefreshAdminData("preprocess-jobs", idleData), true);
  assert.equal(shouldAutoRefreshAdminData("dashboard", idleData), false);
  assert.equal(shouldAutoRefreshAdminData("source-videos", idleData), false);
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
});

test("doctor page renders Chinese diagnosis checks and report export", async () => {
  const data = await fixtureData();
  const html = renderToStaticMarkup(h(DoctorPage, { data }));

  for (const text of [
    "检查系统状态",
    "发布清单",
    "音视频工具",
    "语音识别",
    "检查目的",
    "失败影响",
    "处理建议",
    "检查结果",
    "预处理日志目录可写性",
    "预处理任务日志",
    "本地剪辑片段属于剪辑端本地工作区",
    "公共素材库根目录",
    "重新检查",
    "导出检查报告"
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
  assert.match(realDoctorHtml, /技术检查项/);
  assert.match(realDoctorHtml, /需关注/);
  assert.doesNotMatch(realDoctorHtml, /Unknown English Probe|raw probe detail|source-videos|source video manifests|library counts|ffmpeg|bundled|preprocess logs|EACCES/i);
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
  assert.match(html, /启动预处理/);
  assert.match(html, /扫描、入队、预处理并自动发布索引/);
  assert.match(html, /没有匹配的原视频/);
  assert.match(html, /对剪辑师可见/);
});

test("M9B UI shell orchestrates Admin API mutations without duplicating toolbar actions", () => {
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
  assert.equal(source.includes("actions={[]}"), true);
  assert.equal(source.includes("root_path ??"), true);
  assert.equal(source.includes("admin-sidebar-runtime-line"), true);
  assert.equal(source.includes("<span>公共库</span>"), true);
  assert.equal(source.includes("<span>Doctor</span>"), true);
  assert.equal(source.includes("<small>{data.metrics.usage.active_user_count}/50 活跃剪辑师</small>"), false);
  assert.equal(source.includes("library-settings"), false);
  assert.match(readFileSync(resolve("apps/admin-web/src/features/settings/SettingsPage.tsx"), "utf8"), /useEffect/);
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

	  assert.match(html, /原视频管理/);
	  assert.match(html, /搜索文件名 \/ 标签 \/ 相对路径/);
	  assert.match(html, /查看详情/);
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
  assert.match(html, /发布到剪辑端/);
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

  assert.match(dashboardHtml, /局部刷新/);
  assert.match(sourceVideosHtml, /保存素材信息/);
  assert.match(preprocessHtml, /发布到剪辑端/);
});
