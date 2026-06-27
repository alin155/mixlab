import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGateChecks,
  renderMarkdown,
  type AdminIndexPublishBrowserQaReport
} from "./admin-index-publish-browser-qa.ts";

function baseReport(): Omit<AdminIndexPublishBrowserQaReport, "gates" | "result"> {
  const visibleChecks = {
    "发布与索引": true,
    "发布队列": true,
    "待发布索引": true,
    "索引版本": true,
    "版本详情": true,
    "页面契约": true,
    "发布队列来源": true,
    "读模型": true,
    "版本来源": true,
    "索引版本包": true,
    "扫描模式": true,
    "不扫描": true,
    "本页面局部处理": true
  };

  return {
    schema_version: "1.0",
    generated_at: "2026-06-26T18:00:00.000Z",
    command: "tsx scripts/acceptance/admin-index-publish-browser-qa.ts",
    web_url: "http://127.0.0.1:5188/#/index-publish",
    output_dir: "docs/acceptance/artifacts",
    viewports: [
      {
        name: "desktop",
        width: 1440,
        height: 960,
        url: "http://127.0.0.1:5188/#/index-publish",
        load_ms: 500,
        screenshot_path: "docs/acceptance/artifacts/desktop.png",
        body_horizontal_overflow_px: 0,
        visible_checks: visibleChecks,
        publication_queue_text: "发布队列 待发布索引 5 条待发布",
        index_version_text: "索引版本 当前索引指向 v000027",
        inspector_text: "版本详情 页面契约 发布队列来源 读模型 版本来源 索引版本包 扫描模式 不扫描",
        console_errors: [],
        failed_api_requests: []
      },
      {
        name: "mobile",
        width: 390,
        height: 844,
        url: "http://127.0.0.1:5188/#/index-publish",
        load_ms: 650,
        screenshot_path: "docs/acceptance/artifacts/mobile.png",
        body_horizontal_overflow_px: 0,
        visible_checks: visibleChecks,
        publication_queue_text: "发布队列 待发布索引 5 条待发布",
        index_version_text: "索引版本 当前索引指向 v000027",
        inspector_text: "版本详情 页面契约 发布队列来源 读模型 版本来源 索引版本包 扫描模式 不扫描",
        console_errors: [],
        failed_api_requests: []
      }
    ]
  };
}

test("index publish browser QA gates accept complete fixture evidence", () => {
  const gates = buildGateChecks(baseReport());

  assert.deepEqual(gates.filter((gate) => !gate.passed).map((gate) => gate.name), []);
});

test("index publish browser QA gates reject missing composition evidence", () => {
  const report = baseReport();
  report.viewports[0]!.visible_checks["页面契约"] = false;
  report.viewports[0]!.publication_queue_text = "待发布索引";
  report.viewports[1]!.index_version_text = "索引版本";
  report.viewports[1]!.inspector_text = "版本详情";

  const gates = buildGateChecks(report);

  assert.deepEqual(
    gates.filter((gate) => !gate.passed).map((gate) => gate.name),
    [
      "browser-renders-required-content",
      "publication-queue-visible",
      "index-version-surface-visible",
      "inspector-contract-visible"
    ]
  );
});

test("index publish browser QA gates reject console, API, and overflow failures", () => {
  const report = baseReport();
  report.viewports[0]!.console_errors.push("render failed");
  report.viewports[0]!.failed_api_requests.push("HTTP 500 /api/admin/source-videos");
  report.viewports[1]!.body_horizontal_overflow_px = 12;

  const gates = buildGateChecks(report);

  assert.deepEqual(
    gates.filter((gate) => !gate.passed).map((gate) => gate.name),
    [
      "no-console-errors",
      "no-failed-admin-api-requests",
      "no-horizontal-overflow"
    ]
  );
});

test("index publish browser QA markdown includes screenshots and gates", () => {
  const reportBase = baseReport();
  const gates = buildGateChecks(reportBase);
  const report: AdminIndexPublishBrowserQaReport = {
    ...reportBase,
    gates,
    result: {
      passed: true,
      status: "passed",
      summary: "ok"
    }
  };
  const markdown = renderMarkdown(report);

  assert.match(markdown, /Admin Index Publish Browser QA/);
  assert.match(markdown, /browser-renders-required-content/);
  assert.match(markdown, /docs\/acceptance\/artifacts\/desktop\.png/);
});
