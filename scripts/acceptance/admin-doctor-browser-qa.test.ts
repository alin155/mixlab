import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGateChecks,
  renderMarkdown,
  type AdminDoctorBrowserQaReport
} from "./admin-doctor-browser-qa.ts";

function reportFixture(overrides: Partial<AdminDoctorBrowserQaReport> = {}): AdminDoctorBrowserQaReport {
  const base: AdminDoctorBrowserQaReport = {
    schema_version: "1.0",
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "tsx scripts/acceptance/admin-doctor-browser-qa.ts",
    web_url: "http://127.0.0.1:5188/#/doctor",
    output_dir: "docs/acceptance/artifacts",
    viewports: [
      {
        name: "desktop",
        width: 1440,
        height: 960,
        url: "http://127.0.0.1:5188/#/doctor",
        load_ms: 520,
        screenshot_path: "docs/acceptance/artifacts/desktop.png",
        body_horizontal_overflow_px: 0,
        visible_checks: {
          "系统检查": true,
          "诊断报告": true,
          "检查结果": true,
          "检查报告": true,
          "doctor-probes": true,
          "doctor-route": true,
          "状态扫描": true,
          "本页面局部处理": true,
          "导出操作": true,
          "慢接口历史": true,
          "admin-read-model": true,
          "不扫描": true,
          "重新检查": true,
          "导出检查报告": true,
          "公共素材库根目录": true
        },
        diagnostic_report_text: "诊断报告\n状态\n技术详情\n公共素材库根目录",
        runtime_diagnostics_text: "慢接口历史\n最近样本\n接口\n来源与扫描\n管理端读模型",
        inspector_text: "检查报告\n页面契约\ndoctor-probes\ndoctor-route\nadmin-read-model\nread-model-health\n不扫描\n本页面局部处理",
        console_errors: [],
        failed_api_requests: []
      },
      {
        name: "mobile",
        width: 390,
        height: 844,
        url: "http://127.0.0.1:5188/#/doctor",
        load_ms: 540,
        screenshot_path: "docs/acceptance/artifacts/mobile.png",
        body_horizontal_overflow_px: 0,
        visible_checks: {
          "系统检查": true,
          "诊断报告": true,
          "检查结果": true,
          "检查报告": true,
          "doctor-probes": true,
          "doctor-route": true,
          "状态扫描": true,
          "本页面局部处理": true,
          "导出操作": true,
          "慢接口历史": true,
          "admin-read-model": true,
          "不扫描": true,
          "重新检查": true,
          "导出检查报告": true,
          "公共素材库根目录": true
        },
        diagnostic_report_text: "诊断报告\n状态\n技术详情\n公共素材库根目录",
        runtime_diagnostics_text: "慢接口历史\n最近样本\n接口\n来源与扫描\n管理端读模型",
        inspector_text: "检查报告\n页面契约\ndoctor-probes\ndoctor-route\nadmin-read-model\nread-model-health\n不扫描\n本页面局部处理",
        console_errors: [],
        failed_api_requests: []
      }
    ],
    gates: [],
    result: {
      passed: true,
      status: "passed",
      summary: "doctor browser QA passed for desktop and mobile fixture routes"
    }
  };

  return { ...base, ...overrides };
}

test("doctor browser QA gates accept complete fixture evidence", () => {
  const report = reportFixture();
  const gates = buildGateChecks(report);

  assert.equal(gates.every((gate) => gate.passed), true);
});

test("doctor browser QA gates reject missing composition evidence", () => {
  const report = reportFixture({
    viewports: reportFixture().viewports.map((viewport) => ({
      ...viewport,
      visible_checks: { ...viewport.visible_checks, "doctor-probes": false },
      inspector_text: "检查报告"
    }))
  });
  const gates = buildGateChecks(report);

  assert.equal(gates.find((gate) => gate.name === "browser-renders-required-content")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "inspector-contract-visible")?.passed, false);
});

test("doctor browser QA gates reject console, API, and overflow failures", () => {
  const report = reportFixture({
    viewports: reportFixture().viewports.map((viewport) => ({
      ...viewport,
      body_horizontal_overflow_px: viewport.name === "mobile" ? 12 : 0,
      console_errors: viewport.name === "desktop" ? ["boom"] : [],
      failed_api_requests: viewport.name === "mobile" ? ["HTTP 500 /api/admin/doctor/report"] : []
    }))
  });
  const gates = buildGateChecks(report);

  assert.equal(gates.find((gate) => gate.name === "no-console-errors")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "no-failed-admin-api-requests")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "no-horizontal-overflow")?.passed, false);
});

test("doctor browser QA markdown includes screenshots and gates", () => {
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

  assert.match(markdown, /Admin Doctor Browser QA/);
  assert.match(markdown, /browser-renders-required-content/);
  assert.match(markdown, /docs\/acceptance\/artifacts\/desktop\.png/);
  assert.match(markdown, /docs\/acceptance\/artifacts\/mobile\.png/);
});
