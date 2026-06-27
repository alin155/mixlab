import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGateChecks,
  buildProbeDefinitions,
  buildReport,
  renderMarkdown,
  type ProbeResult
} from "./admin-process-history-live-readonly.ts";

function probeResult(input: {
  name: ProbeResult["name"];
  path: string;
  data: unknown;
}): ProbeResult {
  return {
    name: input.name,
    method: "GET",
    path: input.path,
    duration_ms: 12.3,
    http_status: 200,
    ok: true,
    api_ok: true,
    response_bytes: 128,
    data: input.data
  };
}

function sampleRequests(): ProbeResult[] {
  return [
    probeResult({
      name: "auth_status",
      path: "/api/admin/auth/status",
      data: {
        auth_mode: "disabled",
        authenticated: true
      }
    }),
    probeResult({
      name: "library_status",
      path: "/api/admin/library/status",
      data: {
        root_path: "/Volumes/MixLab/PublicLibrary",
        updated_at: "2026-06-26T10:00:00.000Z",
        current_index_version: "v010471",
        video_count: 11394,
        ready_video_count: 10471
      }
    }),
    probeResult({
      name: "read_model_status",
      path: "/api/admin/read-model/status",
      data: {
        admin_read_model: {
          storage: "sqlite",
          exists: true,
          freshness: "fresh",
          video_count: 11394,
          reconciliation: {
            action: "none",
            reason: "fresh",
            scan_mode: "no-scan",
            safe_for_page_request: true
          }
        }
      }
    }),
    probeResult({
      name: "data_loading_plan",
      path: "/api/admin/data-loading/plan",
      data: {
        endpoints: [{
          endpoint: "/api/admin/preprocess/process-history",
          owner: "preprocess-jobs",
          read_model: "admin-read-model-v1",
          scan_mode: "no-scan"
        }, {
          endpoint: "/api/admin/preprocess/process-history/readiness",
          owner: "preprocess-jobs",
          read_model: "admin-read-model-v1",
          scan_mode: "no-scan"
        }],
        routes: [{
          route: "preprocess-jobs",
          endpoints: [
            "/api/admin/preprocess/jobs",
            "/api/admin/preprocess/process-history",
            "/api/admin/preprocess/process-history/readiness"
          ]
        }]
      }
    }),
    probeResult({
      name: "process_history_readiness",
      path: "/api/admin/preprocess/process-history/readiness",
      data: {
        actual_data_source: "admin-read-model",
        scan_mode: "no-scan",
        ready_for_process_history: true,
        reason: "ready",
        expected_job_snapshot_rows: 11394,
        snapshot_complete: true,
        snapshot_metadata_row_count: 11394,
        snapshot_table_row_count: 11394,
        metadata_row_count_matches: true,
        table_row_count_matches: true
      }
    }),
    probeResult({
      name: "process_history",
      path: "/api/admin/preprocess/process-history?limit=20&window_days=30",
      data: {
        actual_data_source: "admin-read-model",
        cache_status: "hit",
        scan_mode: "no-scan",
        history_available: true,
        window_days: 30,
        limit: 20,
        summary: {
          returned_count: 1
        },
        items: [{
          source_video_id: "V010471",
          preprocess_status: "ready"
        }]
      }
    })
  ];
}

test("admin process-history live probe is GET-only and avoids mutating route names", () => {
  const probes = buildProbeDefinitions({ limit: 20, window_days: 30 });
  assert.equal(probes.every((probe) => probe.method === "GET"), true);
  assert.deepEqual(
    probes.map((probe) => probe.path),
    [
      "/api/admin/auth/status",
      "/api/admin/library/status",
      "/api/admin/read-model/status",
      "/api/admin/data-loading/plan",
      "/api/admin/preprocess/process-history/readiness",
      "/api/admin/preprocess/process-history?limit=20&window_days=30"
    ]
  );

  const paths = probes.map((probe) => probe.path).join("\n");
  assert.doesNotMatch(paths, /\/start|\/cancel|\/apply|\/repair|\/publish|\/reconcile\/start/);
});

test("admin process-history live report passes on read-model no-scan hit", () => {
  const report = buildReport({
    generated_at: "2026-06-26T10:00:00.000Z",
    api_base_url: "http://127.0.0.1:3889",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    requested_limit: 20,
    requested_window_days: 30,
    requests: sampleRequests()
  });

  assert.equal(report.result.passed, true);
  assert.equal(report.process_history.status, "hit");
  assert.equal(report.process_history.actual_data_source, "admin-read-model");
  assert.equal(report.process_history.scan_mode, "no-scan");
  assert.equal(report.data_loading_contract.endpoint_found, true);
  assert.equal(report.data_loading_contract.route_found, true);
  assert.equal(report.data_loading_contract.read_model, "admin-read-model-v1");
  assert.equal(report.data_loading_contract.readiness_endpoint_found, true);
  assert.equal(report.data_loading_contract.readiness_route_found, true);
  assert.equal(report.process_history_readiness.ready, true);
  assert.equal(report.process_history_readiness.reason, "ready");
});

test("admin process-history live gates accept safe no-scan miss but reject wrong root", () => {
  const requests = sampleRequests();
  const processHistory = requests.find((request) => request.name === "process_history");
  assert.ok(processHistory);
  processHistory.data = {
    actual_data_source: "admin-read-model",
    cache_status: "miss",
    scan_mode: "no-scan",
    history_available: false,
    window_days: 30,
    limit: 20,
    summary: {
      returned_count: 0
    },
    items: []
  };
  const readiness = requests.find((request) => request.name === "process_history_readiness");
  assert.ok(readiness);
  readiness.data = {
    actual_data_source: "admin-read-model",
    scan_mode: "no-scan",
    ready_for_process_history: false,
    reason: "snapshot_incomplete",
    expected_job_snapshot_rows: 11394,
    snapshot_complete: false,
    snapshot_metadata_row_count: 0,
    snapshot_table_row_count: 0,
    metadata_row_count_matches: false,
    table_row_count_matches: false
  };

  const safeMissReport = buildReport({
    generated_at: "2026-06-26T10:00:00.000Z",
    api_base_url: "http://127.0.0.1:3889",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    requested_limit: 20,
    requested_window_days: 30,
    requests
  });

  assert.equal(safeMissReport.result.passed, true);
  assert.equal(safeMissReport.process_history.status, "safe-miss");
  assert.equal(safeMissReport.process_history_readiness.reason, "snapshot_incomplete");

  const failedGates = buildGateChecks({
    expected_library_root: "/Volumes/MixLab/OtherLibrary",
    requested_limit: 20,
    requested_window_days: 30,
    requests,
    data_loading_contract: safeMissReport.data_loading_contract,
    process_history: safeMissReport.process_history,
    process_history_readiness: safeMissReport.process_history_readiness
  }).filter((gate) => !gate.passed);

  assert.deepEqual(failedGates.map((gate) => gate.name), ["library-root"]);
});

test("admin process-history live markdown reports read-model and command boundaries", () => {
  const report = buildReport({
    generated_at: "2026-06-26T10:00:00.000Z",
    api_base_url: "http://127.0.0.1:3889",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    requested_limit: 20,
    requested_window_days: 30,
    requests: sampleRequests()
  });
  const markdown = renderMarkdown(report);

  assert.match(markdown, /## Read Model/);
  assert.match(markdown, /scan mode `no-scan`/);
  assert.match(markdown, /## Process History/);
  assert.match(markdown, /## Process History Readiness/);
  assert.match(markdown, /Status: `hit`/);
  assert.match(markdown, /Reason: `ready`/);
  assert.match(markdown, /Actual data source: `admin-read-model`/);
  assert.match(markdown, /does not start reconcile, scan, apply, repair, publish, rebuild, Docker upload, or Cutter protocol work/);
});
