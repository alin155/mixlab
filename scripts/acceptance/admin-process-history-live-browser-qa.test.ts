import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGateChecks,
  renderMarkdown,
  type AdminProcessHistoryLiveBrowserQaReport
} from "./admin-process-history-live-browser-qa.ts";

function baseReport(): Omit<AdminProcessHistoryLiveBrowserQaReport, "gates" | "result"> {
  return {
    schema_version: "1.0",
    generated_at: "2026-06-26T12:00:00.000Z",
    command: "tsx scripts/acceptance/admin-process-history-live-browser-qa.ts",
    web_url: "http://127.0.0.1:5186/#/preprocess-jobs",
    api_base_url: "http://127.0.0.1:3892",
    expected_library_root: "/Volumes/MixLab/PublicLibrary",
    output_dir: "docs/acceptance/artifacts",
    environment: {
      library_root: "/Volumes/MixLab/PublicLibrary",
      current_index_version: "v010471",
      video_count: 11394,
      ready_video_count: 10471
    },
    process_history: {
      history_available: true,
      actual_data_source: "admin-read-model",
      cache_status: "hit",
      scan_mode: "no-scan",
      returned_count: 20,
      item_count: 20,
      readiness_ready: true,
      readiness_reason: "ready"
    },
    process_history_filter: {
      selected_filters: {
        source_folder_name: "默认素材来源",
        preprocess_status: "ready",
        event_type: "indexed"
      },
      api_path: "/api/admin/preprocess/process-history?limit=20&window_days=30&source_folder_name=%E9%BB%98%E8%AE%A4%E7%B4%A0%E6%9D%90%E6%9D%A5%E6%BA%90&preprocess_status=ready&event_type=indexed",
      history_available: true,
      actual_data_source: "admin-read-model",
      cache_status: "hit",
      scan_mode: "no-scan",
      returned_count: 2,
      item_count: 2,
      echoed_filters: {
        source_folder_name: "默认素材来源",
        preprocess_status: "ready",
        event_type: "indexed"
      },
      rows_match_filters: true,
      row_match_failures: [],
      filter_options_include_selected: true
    },
    api_requests: [
      {
        path: "/api/admin/library/status",
        duration_ms: 10,
        http_status: 200,
        ok: true,
        data: {},
        response_bytes: 100
      },
      {
        path: "/api/admin/preprocess/process-history/readiness",
        duration_ms: 20,
        http_status: 200,
        ok: true,
        data: {},
        response_bytes: 100
      },
      {
        path: "/api/admin/preprocess/process-history?limit=20&window_days=30",
        duration_ms: 30,
        http_status: 200,
        ok: true,
        data: {},
        response_bytes: 100
      },
      {
        path: "/api/admin/preprocess/process-history?limit=20&window_days=30&source_folder_name=%E9%BB%98%E8%AE%A4%E7%B4%A0%E6%9D%90%E6%9D%A5%E6%BA%90&preprocess_status=ready&event_type=indexed",
        duration_ms: 30,
        http_status: 200,
        ok: true,
        data: {},
        response_bytes: 100
      }
    ],
    viewports: [
      {
        name: "desktop",
        width: 1440,
        height: 960,
        url: "http://127.0.0.1:5186/#/preprocess-jobs",
        load_ms: 900,
        screenshot_path: "docs/acceptance/artifacts/desktop.png",
        body_horizontal_overflow_px: 0,
        process_history_row_count: 20,
        process_history_panel_text: "处理历史 读模型命中 admin-read-model no-scan hit",
        visible_checks: {
          "处理历史": true,
          "读模型命中": true,
          "admin-read-model": true,
          "no-scan": true,
          hit: true
        },
        observed_process_history_requests: [
          "http://127.0.0.1:3892/api/admin/preprocess/process-history?limit=20&window_days=30",
          "http://127.0.0.1:3892/api/admin/preprocess/process-history?limit=20&window_days=30&source_folder_name=%E9%BB%98%E8%AE%A4%E7%B4%A0%E6%9D%90%E6%9D%A5%E6%BA%90&preprocess_status=ready&event_type=indexed"
        ],
        filter_interaction: {
          selected_filters: {
            source_folder_name: "默认素材来源",
            preprocess_status: "ready",
            event_type: "indexed"
          },
          filter_controls_visible: {
            source_folder: true,
            status: true,
            event: true
          },
          filtered_request_observed: true,
          filtered_row_count: 2,
          selected_values: {
            source_folder_name: "默认素材来源",
            preprocess_status: "ready",
            event_type: "indexed"
          },
          error: ""
        },
        console_errors: [],
        failed_api_requests: []
      },
      {
        name: "mobile",
        width: 390,
        height: 844,
        url: "http://127.0.0.1:5186/#/preprocess-jobs",
        load_ms: 1000,
        screenshot_path: "docs/acceptance/artifacts/mobile.png",
        body_horizontal_overflow_px: 0,
        process_history_row_count: 20,
        process_history_panel_text: "处理历史 读模型命中 admin-read-model no-scan hit",
        visible_checks: {
          "处理历史": true,
          "读模型命中": true,
          "admin-read-model": true,
          "no-scan": true,
          hit: true
        },
        observed_process_history_requests: [
          "http://127.0.0.1:3892/api/admin/preprocess/process-history?limit=20&window_days=30",
          "http://127.0.0.1:3892/api/admin/preprocess/process-history?limit=20&window_days=30&source_folder_name=%E9%BB%98%E8%AE%A4%E7%B4%A0%E6%9D%90%E6%9D%A5%E6%BA%90&preprocess_status=ready&event_type=indexed"
        ],
        filter_interaction: {
          selected_filters: {
            source_folder_name: "默认素材来源",
            preprocess_status: "ready",
            event_type: "indexed"
          },
          filter_controls_visible: {
            source_folder: true,
            status: true,
            event: true
          },
          filtered_request_observed: true,
          filtered_row_count: 2,
          selected_values: {
            source_folder_name: "默认素材来源",
            preprocess_status: "ready",
            event_type: "indexed"
          },
          error: ""
        },
        console_errors: [],
        failed_api_requests: []
      }
    ],
    notes: ["R.84 browser QA."]
  };
}

test("browser QA gates require a live admin-read-model no-scan hit with visible rows", () => {
  const gates = buildGateChecks(baseReport());
  assert.deepEqual(gates.filter((gate) => !gate.passed).map((gate) => gate.name), []);
});

test("browser QA rejects safe misses and empty process-history tables", () => {
  const report = baseReport();
  report.process_history.history_available = false;
  report.process_history.cache_status = "miss";
  report.process_history.returned_count = 0;
  report.process_history.item_count = 0;
  report.viewports[0]!.process_history_row_count = 0;
  report.viewports[1]!.process_history_row_count = 0;

  const gates = buildGateChecks(report);
  assert.deepEqual(
    gates.filter((gate) => !gate.passed).map((gate) => gate.name),
    ["process-history-api-hit", "browser-renders-history-rows"]
  );
});

test("browser QA rejects unfiltered-only evidence", () => {
  const report = baseReport();
  report.process_history_filter.item_count = 0;
  report.process_history_filter.rows_match_filters = false;
  report.process_history_filter.echoed_filters.preprocess_status = "";
  report.process_history_filter.row_match_failures = ["row 0 preprocess_status=processing"];
  report.viewports[0]!.filter_interaction.filtered_request_observed = false;
  report.viewports[0]!.observed_process_history_requests = [
    "http://127.0.0.1:3892/api/admin/preprocess/process-history?limit=20&window_days=30"
  ];

  const gates = buildGateChecks(report);
  assert.deepEqual(
    gates.filter((gate) => !gate.passed).map((gate) => gate.name),
    [
      "process-history-filtered-api-hit",
      "browser-filter-interaction",
      "browser-observed-filtered-request"
    ]
  );
});

test("browser QA report renders screenshot and gate evidence", () => {
  const reportWithoutGates = baseReport();
  const gates = buildGateChecks(reportWithoutGates);
  const report: AdminProcessHistoryLiveBrowserQaReport = {
    ...reportWithoutGates,
    gates,
    result: {
      passed: true,
      status: "passed",
      summary: "ok"
    }
  };

  const markdown = renderMarkdown(report);
  assert.match(markdown, /Admin Process History Live Browser QA/);
  assert.match(markdown, /process-history read-model/);
  assert.match(markdown, /Filtered Process History/);
  assert.match(markdown, /Selected status: `ready`/);
  assert.match(markdown, /desktop\.png/);
  assert.match(markdown, /process-history-api-hit \| pass/);
  assert.match(markdown, /process-history-filtered-api-hit \| pass/);
});
