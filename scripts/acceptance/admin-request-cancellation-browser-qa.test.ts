import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGateChecks,
  renderMarkdown,
  type AdminRequestCancellationBrowserQaReport
} from "./admin-request-cancellation-browser-qa.ts";

function requestRecord(overrides: Partial<AdminRequestCancellationBrowserQaReport["mock_api"]["records"][number]> = {}) {
  return {
    id: 1,
    method: "GET",
    path: "/api/admin/source-videos",
    search: "?limit=20",
    started_at: "2026-06-26T00:00:00.000Z",
    closed_at: "2026-06-26T00:00:00.120Z",
    response_sent_at: "",
    status_code: null,
    duration_ms: 120,
    aborted_before_response: true,
    ...overrides
  };
}

function reportFixture(
  overrides: Partial<AdminRequestCancellationBrowserQaReport> = {}
): AdminRequestCancellationBrowserQaReport {
  const delayedRequest = requestRecord();
  const base: AdminRequestCancellationBrowserQaReport = {
    schema_version: "1.0",
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "tsx scripts/acceptance/admin-request-cancellation-browser-qa.ts",
    api_base_url: "http://127.0.0.1:41001",
    web_base_url: "http://127.0.0.1:41002",
    output_dir: "docs/acceptance/artifacts",
    scenario: {
      route_under_test: "source-videos",
      delayed_endpoint: "/api/admin/source-videos",
      delayed_response_ms: 5_000,
      navigate_away_route: "dashboard"
    },
    browser: {
      final_hash: "#/dashboard",
      body_text_excerpt: "总览\n素材库\n预处理",
      console_errors: [],
      unexpected_request_failures: []
    },
    mock_api: {
      request_count: 1,
      records: [delayedRequest],
      delayed_request: delayedRequest
    },
    timings: {
      source_route_request_start_wait_ms: 30,
      cancellation_observed_wait_ms: 120,
      total_ms: 900
    },
    artifacts: {
      json_path: "docs/acceptance/artifacts/admin-request-cancellation-browser-qa.json",
      markdown_path: "docs/acceptance/artifacts/admin-request-cancellation-browser-qa.md"
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

test("request cancellation browser QA gates accept observed abort before response", () => {
  const report = reportFixture();
  const gates = buildGateChecks(report);

  assert.equal(gates.every((item) => item.passed), true);
});

test("request cancellation browser QA gates reject response completion without abort", () => {
  const completedRequest = requestRecord({
    response_sent_at: "2026-06-26T00:00:05.000Z",
    status_code: 200,
    aborted_before_response: false
  });
  const report = reportFixture({
    mock_api: {
      request_count: 1,
      records: [completedRequest],
      delayed_request: completedRequest
    }
  });
  const gates = buildGateChecks(report);

  assert.equal(gates.find((item) => item.name === "delayed-request-aborted-before-response")?.passed, false);
});

test("request cancellation browser QA gates reject non-isolated or broken browser evidence", () => {
  const report = reportFixture({
    api_base_url: "http://192.168.1.27:18080",
    browser: {
      final_hash: "#/source-videos",
      body_text_excerpt: "素材库",
      console_errors: ["boom"],
      unexpected_request_failures: ["GET /api/admin/library/status net::ERR_FAILED"]
    }
  });
  const gates = buildGateChecks(report);

  assert.equal(gates.find((item) => item.name === "isolated-local-mock-api")?.passed, false);
  assert.equal(gates.find((item) => item.name === "route-change-returned-to-dashboard")?.passed, false);
  assert.equal(gates.find((item) => item.name === "no-console-errors")?.passed, false);
  assert.equal(gates.find((item) => item.name === "no-unexpected-request-failures")?.passed, false);
});

test("request cancellation browser QA markdown includes scope, gates, and delayed request details", () => {
  const report = reportFixture();
  const gates = buildGateChecks(report);
  const markdown = renderMarkdown({
    ...report,
    gates,
    result: { passed: true, status: "passed", summary: "ok" }
  });

  assert.match(markdown, /Admin Request Cancellation Browser QA/);
  assert.match(markdown, /does not touch NAS data/);
  assert.match(markdown, /delayed-request-aborted-before-response/);
  assert.match(markdown, /\/api\/admin\/source-videos/);
});
