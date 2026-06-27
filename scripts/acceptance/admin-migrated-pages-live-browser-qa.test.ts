import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGateChecks,
  renderMarkdown,
  type AdminMigratedPagesLiveBrowserQaReport
} from "./admin-migrated-pages-live-browser-qa.ts";

type RouteName = AdminMigratedPagesLiveBrowserQaReport["route_evidence"][number]["route"];

const routes: RouteName[] = ["index-publish", "source-videos", "cutter-users", "doctor", "settings"];

function browserReportFixture(route: RouteName, passed = true): AdminMigratedPagesLiveBrowserQaReport["route_evidence"][number]["browser_report"] {
  return {
    schema_version: "1.0",
    generated_at: "2026-06-26T00:00:00.000Z",
    command: `tsx scripts/acceptance/admin-${route}-browser-qa.ts`,
    web_url: `http://127.0.0.1:5187/#/${route}`,
    output_dir: "docs/acceptance/artifacts",
    viewports: [
      {
        name: "desktop",
        width: 1440,
        height: 960,
        url: `http://127.0.0.1:5187/#/${route}`,
        load_ms: 620,
        screenshot_path: `docs/acceptance/artifacts/${route}-desktop.png`,
        body_horizontal_overflow_px: 0,
        visible_checks: { route: true },
        publication_queue_text: "发布队列\n待发布索引",
        index_version_text: "索引版本\n当前索引指向",
        asset_table_text: "素材表格\n封面\n预处理状态",
        user_table_text: "用户表格\n状态\n搜索次数",
        diagnostic_report_text: "诊断报告\n状态\n技术详情\n公共素材库根目录",
        settings_form_text: "设置表单\n素材库名称\n素材来源\n启用素材来源",
        runtime_surface_text: "运行策略\n预处理设置\n语音识别\n密钥状态",
        inspector_text: "页面契约\n不扫描\n本页面局部处理",
        console_errors: [],
        failed_api_requests: []
      },
      {
        name: "mobile",
        width: 390,
        height: 844,
        url: `http://127.0.0.1:5187/#/${route}`,
        load_ms: 640,
        screenshot_path: `docs/acceptance/artifacts/${route}-mobile.png`,
        body_horizontal_overflow_px: 0,
        visible_checks: { route: true },
        publication_queue_text: "发布队列\n待发布索引",
        index_version_text: "索引版本\n当前索引指向",
        asset_table_text: "素材表格\n封面\n预处理状态",
        user_table_text: "用户表格\n状态\n搜索次数",
        diagnostic_report_text: "诊断报告\n状态\n技术详情\n公共素材库根目录",
        settings_form_text: "设置表单\n素材库名称\n素材来源\n启用素材来源",
        runtime_surface_text: "运行策略\n预处理设置\n语音识别\n密钥状态",
        inspector_text: "页面契约\n不扫描\n本页面局部处理",
        console_errors: [],
        failed_api_requests: []
      }
    ],
    gates: [],
    result: {
      passed,
      status: passed ? "passed" : "failed",
      summary: passed ? "ok" : "failed"
    }
  };
}

function reportFixture(overrides: Partial<AdminMigratedPagesLiveBrowserQaReport> = {}): AdminMigratedPagesLiveBrowserQaReport {
  const routeEndpoints: Record<RouteName, string[]> = {
    "index-publish": ["/api/admin/source-videos", "/api/admin/index/versions"],
    "source-videos": ["/api/admin/source-videos"],
    "cutter-users": ["/api/admin/cutter-users"],
    doctor: ["/api/admin/doctor/report"],
    settings: ["/api/admin/settings/runtime", "/api/admin/library/path-checks"]
  };
  const base: AdminMigratedPagesLiveBrowserQaReport = {
    schema_version: "1.0",
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "tsx scripts/acceptance/admin-migrated-pages-live-browser-qa.ts",
    api_base_url: "http://127.0.0.1:3893",
    web_base_url: "http://127.0.0.1:5187",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    output_dir: "docs/acceptance/artifacts",
    environment: {
      auth_mode: "disabled",
      authenticated: true,
      library_root: "/Volumes/MixLab/PublicLibrary",
      current_index_version: "v010471",
      video_count: 11394,
      ready_video_count: 10471,
      admin_read_model: {
        freshness: "fresh",
        safe_for_page_request: true,
        reconciliation_action: "no-op",
        reconciliation_scan_mode: "no-scan"
      }
    },
    api_probes: [
      { name: "health", path: "/health", duration_ms: 5, http_status: 200, ok: true, api_ok: true, response_bytes: 12, data: {} },
      { name: "auth_status", path: "/api/admin/auth/status", duration_ms: 5, http_status: 200, ok: true, api_ok: true, response_bytes: 100, data: { auth_mode: "disabled", authenticated: true } },
      { name: "library_status", path: "/api/admin/library/status", duration_ms: 8, http_status: 200, ok: true, api_ok: true, response_bytes: 400, data: { root_path: "/Volumes/MixLab/PublicLibrary" } },
      { name: "data_loading_plan", path: "/api/admin/data-loading/plan", duration_ms: 5, http_status: 200, ok: true, api_ok: true, response_bytes: 500, data: { hidden_full_scan_allowed: false } },
      { name: "read_model_status", path: "/api/admin/read-model/status", duration_ms: 5, http_status: 200, ok: true, api_ok: true, response_bytes: 300, data: {} },
      { name: "source_videos_first_page", path: "/api/admin/source-videos?limit=20", duration_ms: 20, http_status: 200, ok: true, api_ok: true, response_bytes: 2000, data: [] },
      { name: "source_videos_index_required", path: "/api/admin/source-videos?status=index-required&limit=20", duration_ms: 20, http_status: 200, ok: true, api_ok: true, response_bytes: 500, data: [] },
      { name: "index_versions", path: "/api/admin/index/versions?limit=8", duration_ms: 20, http_status: 200, ok: true, api_ok: true, response_bytes: 500, data: {} },
      { name: "cutter_users", path: "/api/admin/cutter-users", duration_ms: 20, http_status: 200, ok: true, api_ok: true, response_bytes: 500, data: {} },
      { name: "doctor_report", path: "/api/admin/doctor/report", duration_ms: 20, http_status: 200, ok: true, api_ok: true, response_bytes: 500, data: {} },
      { name: "settings_config", path: "/api/admin/settings/config", duration_ms: 20, http_status: 200, ok: true, api_ok: true, response_bytes: 500, data: {} },
      { name: "settings_runtime", path: "/api/admin/settings/runtime", duration_ms: 20, http_status: 200, ok: true, api_ok: true, response_bytes: 500, data: {} },
      { name: "path_checks", path: "/api/admin/library/path-checks", duration_ms: 20, http_status: 200, ok: true, api_ok: true, response_bytes: 500, data: [] }
    ],
    route_evidence: routes.map((route) => ({
      route,
      label: route,
      web_url: `http://127.0.0.1:5187/#/${route}`,
      expected_route_endpoints: routeEndpoints[route],
      route_plan_found: true,
      route_plan_endpoints: routeEndpoints[route],
      route_plan_load_phase: "route-entry",
      route_plan_prefetch: false,
      endpoint_contracts: routeEndpoints[route].map((endpoint) => ({
        endpoint,
        found: true,
        method: "GET",
        scan_mode: "no-scan",
        data_source: endpoint === "/api/admin/index/versions" ? "index-version-packages" : "admin-read-model",
        phase: "route",
        refresh: "route-entry",
        full_reconcile: false
      })),
      browser_report: browserReportFixture(route)
    })),
    gates: [],
    result: {
      passed: true,
      status: "passed",
      summary: "ok"
    }
  };

  return { ...base, ...overrides };
}

test("migrated pages live browser QA gates accept complete evidence", () => {
  const gates = buildGateChecks(reportFixture());

  assert.equal(gates.every((item) => item.passed), true);
});

test("migrated pages live browser QA gates reject non-live or unsafe environment evidence", () => {
  const report = reportFixture({
    environment: {
      ...reportFixture().environment,
      auth_mode: "password",
      authenticated: false,
      library_root: "/tmp/PublicLibrary",
      video_count: 623,
      admin_read_model: {
        freshness: "stale",
        safe_for_page_request: false,
        reconciliation_action: "force-rebuild-derived-admin-read-model",
        reconciliation_scan_mode: "full-reconcile"
      }
    }
  });
  const gates = buildGateChecks(report);

  assert.equal(gates.find((gate) => gate.name === "isolated-auth-disabled")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "live-library-root")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "live-library-counts")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "admin-read-model-page-safe")?.passed, false);
});

test("migrated pages live browser QA gates reject route and browser failures", () => {
  const base = reportFixture();
  const report = reportFixture({
    api_probes: base.api_probes.map((probe) =>
      probe.name === "doctor_report" ? { ...probe, ok: false, http_status: 500 } : probe
    ),
    route_evidence: base.route_evidence.map((route) =>
      route.route === "doctor"
        ? {
            ...route,
            route_plan_found: false,
            endpoint_contracts: route.endpoint_contracts.map((endpoint) => ({
              ...endpoint,
              found: false,
              full_reconcile: true,
              scan_mode: "full-reconcile"
            })),
            browser_report: browserReportFixture(route.route, false)
          }
        : route
    )
  });
  const gates = buildGateChecks(report);

  assert.equal(gates.find((gate) => gate.name === "direct-api-probes-pass")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "migrated-route-contracts")?.passed, false);
  assert.equal(gates.find((gate) => gate.name === "migrated-browser-reports-pass")?.passed, false);
});

test("migrated pages live browser QA markdown includes routes, probes, and screenshots", () => {
  const report = reportFixture();
  const markdown = renderMarkdown({
    ...report,
    gates: buildGateChecks(report),
    result: {
      passed: true,
      status: "passed",
      summary: "ok"
    }
  });

  assert.match(markdown, /Admin Migrated Pages Live Browser QA/);
  assert.match(markdown, /发布与索引|index-publish/);
  assert.match(markdown, /source_videos_first_page/);
  assert.match(markdown, /docs\/acceptance\/artifacts\/settings-desktop\.png/);
});
