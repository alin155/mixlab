import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGateChecks,
  renderMarkdown,
  type AdminProtectionMaintenanceBrowserQaReport
} from "./admin-protection-maintenance-browser-qa.ts";

function requestRecord(
  overrides: Partial<AdminProtectionMaintenanceBrowserQaReport["mock_api"]["records"][number]> = {}
) {
  return {
    id: 1,
    method: "GET",
    path: "/api/admin/read-model/reconcile/status",
    search: "",
    started_at: "2026-06-26T00:00:00.000Z",
    response_sent_at: "2026-06-26T00:00:00.010Z",
    status_code: 200,
    duration_ms: 10,
    request_body_excerpt: "",
    ...overrides
  };
}

function reportFixture(
  overrides: Partial<AdminProtectionMaintenanceBrowserQaReport> = {}
): AdminProtectionMaintenanceBrowserQaReport {
  const records = [
    requestRecord({ id: 1, path: "/api/admin/operations/overview" }),
    requestRecord({ id: 2, path: "/api/admin/read-model/reconcile/status" }),
    requestRecord({ id: 3, method: "POST", path: "/api/admin/read-model/reconcile" }),
    requestRecord({ id: 4, path: "/api/admin/read-model/reconcile/status" }),
    requestRecord({ id: 5, method: "POST", path: "/api/admin/read-model/reconcile/cancel" }),
    requestRecord({ id: 6, path: "/api/admin/read-model/reconcile/status" })
  ];

  const base: AdminProtectionMaintenanceBrowserQaReport = {
    schema_version: "1.0",
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "tsx scripts/acceptance/admin-protection-maintenance-browser-qa.ts",
    api_base_url: "http://127.0.0.1:41001",
    web_base_url: "http://127.0.0.1:41002",
    output_dir: "docs/acceptance/artifacts",
    scenario: {
      route_under_test: "protection",
      expected_command_posts: [
        "/api/admin/read-model/reconcile",
        "/api/admin/read-model/reconcile/cancel"
      ],
      isolated_from_real_admin_api: true,
      nas_mutation_allowed: false
    },
    browser: {
      final_hash: "#/protection",
      body_text_excerpt: "保护中心\n后台对账\n启动后台对账\n请求停止对账\n取消请求\n已请求",
      screenshot_path: "docs/acceptance/artifacts/admin-protection-maintenance-browser-qa.png",
      initial_start_disabled: false,
      initial_cancel_disabled: true,
      cancel_enabled_after_start: true,
      cancel_disabled_after_cancel: true,
      body_contains_cancel_requested: true,
      console_errors: [],
      failed_api_requests: []
    },
    mock_api: {
      request_count: records.length,
      records,
      command_post_count: 2,
      start_post_count: 1,
      cancel_post_count: 1,
      status_get_count: 3,
      operations_overview_get_count: 1,
      forbidden_command_posts: []
    },
    timings: {
      controls_visible_wait_ms: 50,
      start_command_observed_wait_ms: 30,
      cancel_command_observed_wait_ms: 30,
      total_ms: 900
    },
    artifacts: {
      json_path: "docs/acceptance/artifacts/admin-protection-maintenance-browser-qa.json",
      markdown_path: "docs/acceptance/artifacts/admin-protection-maintenance-browser-qa.md",
      screenshot_path: "docs/acceptance/artifacts/admin-protection-maintenance-browser-qa.png"
    },
    gates: [],
    result: {
      passed: true,
      status: "passed",
      summary: "ok"
    }
  };

  return { ...base, ...overrides };
}

test("protection maintenance browser QA gates accept isolated start and cancel commands", () => {
  const report = reportFixture();
  const gates = buildGateChecks(report);

  assert.equal(gates.every((item) => item.passed), true);
});

test("protection maintenance browser QA gates reject missing cancel command", () => {
  const report = reportFixture({
    mock_api: {
      ...reportFixture().mock_api,
      command_post_count: 1,
      cancel_post_count: 0
    }
  });
  const gates = buildGateChecks(report);

  assert.equal(gates.find((item) => item.name === "cancel-command-posted-once")?.passed, false);
});

test("protection maintenance browser QA gates reject forbidden command posts", () => {
  const forbidden = requestRecord({
    id: 7,
    method: "POST",
    path: "/api/admin/library/scan"
  });
  const report = reportFixture({
    mock_api: {
      ...reportFixture().mock_api,
      command_post_count: 3,
      forbidden_command_posts: [forbidden],
      records: [...reportFixture().mock_api.records, forbidden]
    }
  });
  const gates = buildGateChecks(report);

  assert.equal(gates.find((item) => item.name === "no-forbidden-command-posts")?.passed, false);
});

test("protection maintenance browser QA gates reject non-isolated or broken browser evidence", () => {
  const report = reportFixture({
    api_base_url: "http://127.0.0.1:3889",
    web_base_url: "http://192.168.1.27:5176",
    scenario: {
      ...reportFixture().scenario,
      nas_mutation_allowed: true
    },
    browser: {
      ...reportFixture().browser,
      final_hash: "#/dashboard",
      body_text_excerpt: "总览",
      initial_start_disabled: true,
      initial_cancel_disabled: false,
      console_errors: ["boom"],
      failed_api_requests: ["HTTP 500 http://127.0.0.1/api/admin/operations/overview"]
    }
  });
  const gates = buildGateChecks(report);

  assert.equal(gates.find((item) => item.name === "isolated-local-mock-api")?.passed, false);
  assert.equal(gates.find((item) => item.name === "protection-controls-visible")?.passed, false);
  assert.equal(gates.find((item) => item.name === "button-state-contract")?.passed, false);
  assert.equal(gates.find((item) => item.name === "no-console-errors")?.passed, false);
  assert.equal(gates.find((item) => item.name === "no-failed-admin-api-requests")?.passed, false);
});

test("protection maintenance browser QA markdown includes scope, gates, and command endpoints", () => {
  const report = reportFixture();
  const gates = buildGateChecks(report);
  const markdown = renderMarkdown({
    ...report,
    gates,
    result: { passed: true, status: "passed", summary: "ok" }
  });

  assert.match(markdown, /Admin Protection Maintenance Browser QA/);
  assert.match(markdown, /does not touch NAS data/);
  assert.match(markdown, /start-command-posted-once/);
  assert.match(markdown, /\/api\/admin\/read-model\/reconcile/);
  assert.match(markdown, /\/api\/admin\/read-model\/reconcile\/cancel/);
});
