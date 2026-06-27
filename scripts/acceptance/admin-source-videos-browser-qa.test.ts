import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGateChecks,
  renderMarkdown,
  type AdminSourceVideosBrowserQaReport
} from "./admin-source-videos-browser-qa.ts";

function reportFixture(overrides: Partial<AdminSourceVideosBrowserQaReport> = {}): AdminSourceVideosBrowserQaReport {
  const base: AdminSourceVideosBrowserQaReport = {
    schema_version: "1.0",
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "tsx scripts/acceptance/admin-source-videos-browser-qa.ts",
    web_url: "http://127.0.0.1:5188/#/source-videos",
    output_dir: "docs/acceptance/artifacts",
    viewports: [
      {
        name: "desktop",
        width: 1440,
        height: 960,
        url: "http://127.0.0.1:5188/#/source-videos",
        load_ms: 520,
        screenshot_path: "docs/acceptance/artifacts/desktop.png",
        body_horizontal_overflow_px: 0,
        visible_checks: {
          "素材库": true,
          "素材表格": true,
          "素材详情": true,
          "读模型": true,
          "分页读取": true,
          "不扫描": true,
          "状态与搜索": true,
          "页面控制": true,
          "路由刷新": true,
          "不写协议文件": true,
          "保存素材信息": true
        },
        asset_table_text: "素材表格\n封面\n标题\n预处理状态",
        inspector_text: "素材详情\n保存素材信息",
        console_errors: [],
        failed_api_requests: []
      },
      {
        name: "mobile",
        width: 390,
        height: 844,
        url: "http://127.0.0.1:5188/#/source-videos",
        load_ms: 540,
        screenshot_path: "docs/acceptance/artifacts/mobile.png",
        body_horizontal_overflow_px: 0,
        visible_checks: {
          "素材库": true,
          "素材表格": true,
          "素材详情": true,
          "读模型": true,
          "分页读取": true,
          "不扫描": true,
          "状态与搜索": true,
          "页面控制": true,
          "路由刷新": true,
          "不写协议文件": true,
          "保存素材信息": true
        },
        asset_table_text: "素材表格\n封面\n标题\n预处理状态",
        inspector_text: "素材详情\n保存素材信息",
        console_errors: [],
        failed_api_requests: []
      }
    ],
    gates: [],
    result: {
      passed: true,
      status: "passed",
      summary: "source-videos browser QA passed for desktop and mobile fixture routes"
    }
  };

  return { ...base, ...overrides };
}

test("source videos browser QA gates accept complete fixture evidence", () => {
  const report = reportFixture();
  const gates = buildGateChecks(report);

  assert.equal(gates.every((gate) => gate.passed), true);
});

test("source videos browser QA gates reject missing composition evidence", () => {
  const report = reportFixture({
    viewports: reportFixture().viewports.map((viewport) => ({
      ...viewport,
      visible_checks: { ...viewport.visible_checks, "读模型": false },
      asset_table_text: "素材表格"
    }))
  });
  const gates = buildGateChecks(report);

  assert.equal(gates.find((gate) => gate.name === "browser-renders-required-content")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "asset-table-visible")?.passed, false);
});

test("source videos browser QA gates reject console, API, and overflow failures", () => {
  const report = reportFixture({
    viewports: reportFixture().viewports.map((viewport) => ({
      ...viewport,
      body_horizontal_overflow_px: viewport.name === "mobile" ? 12 : 0,
      console_errors: viewport.name === "desktop" ? ["boom"] : [],
      failed_api_requests: viewport.name === "mobile" ? ["HTTP 500 /api/admin/source-videos"] : []
    }))
  });
  const gates = buildGateChecks(report);

  assert.equal(gates.find((gate) => gate.name === "no-console-errors")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "no-failed-admin-api-requests")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "no-horizontal-overflow")?.passed, false);
});

test("source videos browser QA markdown includes screenshots and gates", () => {
  const report = reportFixture();
  const gates = buildGateChecks(report);
  const markdown = renderMarkdown({
    ...report,
    gates,
    result: {
      passed: true,
      status: "passed",
      summary: "ok"
    }
  });

  assert.match(markdown, /Admin Source Videos Browser QA/);
  assert.match(markdown, /browser-renders-required-content/);
  assert.match(markdown, /docs\/acceptance\/artifacts\/desktop\.png/);
  assert.match(markdown, /docs\/acceptance\/artifacts\/mobile\.png/);
});
