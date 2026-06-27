import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGateChecks,
  renderMarkdown,
  type AdminCutterUsersBrowserQaReport
} from "./admin-cutter-users-browser-qa.ts";

function reportFixture(overrides: Partial<AdminCutterUsersBrowserQaReport> = {}): AdminCutterUsersBrowserQaReport {
  const base: AdminCutterUsersBrowserQaReport = {
    schema_version: "1.0",
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "tsx scripts/acceptance/admin-cutter-users-browser-qa.ts",
    web_url: "http://127.0.0.1:5188/#/cutter-users",
    output_dir: "docs/acceptance/artifacts",
    viewports: [
      {
        name: "desktop",
        width: 1440,
        height: 960,
        url: "http://127.0.0.1:5188/#/cutter-users",
        load_ms: 520,
        screenshot_path: "docs/acceptance/artifacts/desktop.png",
        body_horizontal_overflow_px: 0,
        visible_checks: {
          "剪辑师": true,
          "用户表格": true,
          "用户概览": true,
          "用户仓库": true,
          "使用指标": true,
          "命令操作": true,
          "不扫描": true,
          "本页面局部处理": true,
          "通过申请": true,
          "重置密码": true
        },
        user_table_text: "用户表格\n状态\n搜索次数\n张三",
        inspector_text: "用户概览\n页面契约\n用户仓库\n命令操作\n本页面局部处理",
        console_errors: [],
        failed_api_requests: []
      },
      {
        name: "mobile",
        width: 390,
        height: 844,
        url: "http://127.0.0.1:5188/#/cutter-users",
        load_ms: 540,
        screenshot_path: "docs/acceptance/artifacts/mobile.png",
        body_horizontal_overflow_px: 0,
        visible_checks: {
          "剪辑师": true,
          "用户表格": true,
          "用户概览": true,
          "用户仓库": true,
          "使用指标": true,
          "命令操作": true,
          "不扫描": true,
          "本页面局部处理": true,
          "通过申请": true,
          "重置密码": true
        },
        user_table_text: "用户表格\n状态\n搜索次数\n张三",
        inspector_text: "用户概览\n页面契约\n用户仓库\n命令操作\n本页面局部处理",
        console_errors: [],
        failed_api_requests: []
      }
    ],
    gates: [],
    result: {
      passed: true,
      status: "passed",
      summary: "cutter-users browser QA passed for desktop and mobile fixture routes"
    }
  };

  return { ...base, ...overrides };
}

test("cutter users browser QA gates accept complete fixture evidence", () => {
  const report = reportFixture();
  const gates = buildGateChecks(report);

  assert.equal(gates.every((gate) => gate.passed), true);
});

test("cutter users browser QA gates reject missing composition evidence", () => {
  const report = reportFixture({
    viewports: reportFixture().viewports.map((viewport) => ({
      ...viewport,
      visible_checks: { ...viewport.visible_checks, "用户仓库": false },
      inspector_text: "用户概览"
    }))
  });
  const gates = buildGateChecks(report);

  assert.equal(gates.find((gate) => gate.name === "browser-renders-required-content")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "inspector-contract-visible")?.passed, false);
});

test("cutter users browser QA gates reject console, API, and overflow failures", () => {
  const report = reportFixture({
    viewports: reportFixture().viewports.map((viewport) => ({
      ...viewport,
      body_horizontal_overflow_px: viewport.name === "mobile" ? 12 : 0,
      console_errors: viewport.name === "desktop" ? ["boom"] : [],
      failed_api_requests: viewport.name === "mobile" ? ["HTTP 500 /api/admin/cutter-users"] : []
    }))
  });
  const gates = buildGateChecks(report);

  assert.equal(gates.find((gate) => gate.name === "no-console-errors")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "no-failed-admin-api-requests")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "no-horizontal-overflow")?.passed, false);
});

test("cutter users browser QA markdown includes screenshots and gates", () => {
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

  assert.match(markdown, /Admin Cutter Users Browser QA/);
  assert.match(markdown, /browser-renders-required-content/);
  assert.match(markdown, /docs\/acceptance\/artifacts\/desktop\.png/);
  assert.match(markdown, /docs\/acceptance\/artifacts\/mobile\.png/);
});
