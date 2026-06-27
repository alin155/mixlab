import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGateChecks,
  renderMarkdown,
  type AdminSettingsBrowserQaReport
} from "./admin-settings-browser-qa.ts";

function reportFixture(overrides: Partial<AdminSettingsBrowserQaReport> = {}): AdminSettingsBrowserQaReport {
  const base: AdminSettingsBrowserQaReport = {
    schema_version: "1.0",
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "tsx scripts/acceptance/admin-settings-browser-qa.ts",
    web_url: "http://127.0.0.1:5188/#/settings",
    output_dir: "docs/acceptance/artifacts",
    viewports: [
      {
        name: "desktop",
        width: 1440,
        height: 960,
        url: "http://127.0.0.1:5188/#/settings",
        load_ms: 520,
        screenshot_path: "docs/acceptance/artifacts/desktop.png",
        body_horizontal_overflow_px: 0,
        visible_checks: {
          "设置": true,
          "设置表单": true,
          "设置概览": true,
          "素材来源": true,
          "运行策略": true,
          "路径检查": true,
          "admin-settings": true,
          "path-checks": true,
          "runtime-secrets": true,
          "settings-route": true,
          "不扫描": true,
          "本地编辑": true,
          "本页面局部处理": true,
          "保存设置": true,
          "检查语音识别": true
        },
        settings_form_text: "设置表单\n素材库名称\n素材来源\n启用素材来源",
        runtime_surface_text: "运行策略\n预处理设置\n语音识别\n密钥状态",
        inspector_text: "设置概览\n页面契约\nadmin-settings\npath-checks\nruntime-secrets\n本页面局部处理",
        console_errors: [],
        failed_api_requests: []
      },
      {
        name: "mobile",
        width: 390,
        height: 844,
        url: "http://127.0.0.1:5188/#/settings",
        load_ms: 540,
        screenshot_path: "docs/acceptance/artifacts/mobile.png",
        body_horizontal_overflow_px: 0,
        visible_checks: {
          "设置": true,
          "设置表单": true,
          "设置概览": true,
          "素材来源": true,
          "运行策略": true,
          "路径检查": true,
          "admin-settings": true,
          "path-checks": true,
          "runtime-secrets": true,
          "settings-route": true,
          "不扫描": true,
          "本地编辑": true,
          "本页面局部处理": true,
          "保存设置": true,
          "检查语音识别": true
        },
        settings_form_text: "设置表单\n素材库名称\n素材来源\n启用素材来源",
        runtime_surface_text: "运行策略\n预处理设置\n语音识别\n密钥状态",
        inspector_text: "设置概览\n页面契约\nadmin-settings\npath-checks\nruntime-secrets\n本页面局部处理",
        console_errors: [],
        failed_api_requests: []
      }
    ],
    gates: [],
    result: {
      passed: true,
      status: "passed",
      summary: "settings browser QA passed for desktop and mobile fixture routes"
    }
  };

  return { ...base, ...overrides };
}

test("settings browser QA gates accept complete fixture evidence", () => {
  const report = reportFixture();
  const gates = buildGateChecks(report);

  assert.equal(gates.every((gate) => gate.passed), true);
});

test("settings browser QA gates reject missing composition evidence", () => {
  const report = reportFixture({
    viewports: reportFixture().viewports.map((viewport) => ({
      ...viewport,
      visible_checks: { ...viewport.visible_checks, "runtime-secrets": false },
      inspector_text: "设置概览",
      runtime_surface_text: "运行策略"
    }))
  });
  const gates = buildGateChecks(report);

  assert.equal(gates.find((gate) => gate.name === "browser-renders-required-content")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "runtime-surface-visible")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "inspector-contract-visible")?.passed, false);
});

test("settings browser QA gates reject console, API, and overflow failures", () => {
  const report = reportFixture({
    viewports: reportFixture().viewports.map((viewport) => ({
      ...viewport,
      body_horizontal_overflow_px: viewport.name === "mobile" ? 12 : 0,
      console_errors: viewport.name === "desktop" ? ["boom"] : [],
      failed_api_requests: viewport.name === "mobile" ? ["HTTP 500 /api/admin/settings/runtime"] : []
    }))
  });
  const gates = buildGateChecks(report);

  assert.equal(gates.find((gate) => gate.name === "no-console-errors")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "no-failed-admin-api-requests")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "no-horizontal-overflow")?.passed, false);
});

test("settings browser QA markdown includes screenshots and gates", () => {
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

  assert.match(markdown, /Admin Settings Browser QA/);
  assert.match(markdown, /browser-renders-required-content/);
  assert.match(markdown, /docs\/acceptance\/artifacts\/desktop\.png/);
  assert.match(markdown, /docs\/acceptance\/artifacts\/mobile\.png/);
});
