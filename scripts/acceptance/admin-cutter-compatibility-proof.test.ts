import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminCutterCompatibilityProofReport, toMarkdown } from "./admin-cutter-compatibility-proof.ts";

function validWindowsAcceptance(): unknown {
  return {
    status: "passed",
    runner_version: "0.1.99",
    windows_acceptance: {
      app_runtime_smoke: {
        auth_mode: "reviewed",
        local_trusted: false,
        runtime_status: {
          available_video_count: 10471,
          release_cache: {
            active_release_version: "v010471",
            ready_video_count: 10471
          },
          search_backend: {
            index_version: "v010471"
          }
        },
        source_library: {
          available_video_count: 10471,
          returned_count: 20
        }
      },
      real_data_smoke: {
        source_library: {
          available_video_count: 10471,
          returned_count: 20
        },
        selected_search: {
          search_mode: "searchd",
          returned_group_count: 8
        },
        selected_detail: {
          transcript_character_count: 10940,
          transcript_segment_count: 367
        },
        cut_jobs: {
          job_count: 10,
          done_count: 9,
          failed_count: 1
        }
      },
      cache_smoke: {
        runtime_status: {
          available_video_count: 10471
        }
      }
    }
  };
}

function validRealCut(): unknown {
  return {
    status: "passed",
    suite: "real_cut_smoke",
    real_cut_smoke: {
      selected_source_video_id: "V010574",
      cut_job_id: "CJ20260622-0001",
      run_next_status: "done",
      output_file: "export-clips/E000013/001-Windows验收剪切.mp4",
      phase_timings: [
        { phase_id: "resolve_source", status: "done", duration_ms: 1 },
        { phase_id: "cut_media", status: "done", duration_ms: 984 }
      ]
    }
  };
}

function failedRealCutWithAsyncDrain(): unknown {
  return {
    status: "failed",
    suite: "real_cut_smoke",
    failure_category: "cut_failure",
    failure_message: "Real cut smoke finished with status unknown.",
    real_cut_smoke: {
      selected_source_video_id: "V010574",
      cut_job_id: "CJ20260629-0001",
      run_next_elapsed_ms: 474,
      phase_timings: []
    }
  };
}

function realCutSupplement(): unknown {
  return {
    status: "failed",
    suite: "desktop_incident_diagnostics",
    failure_category: "desktop_incident_diagnostics_failure",
    failure_message: "Screenshot unavailable.",
    desktop_incident_diagnostics: {
      auth_source: "credentials",
      probes: [
        {
          id: "cut_jobs",
          ok: true,
          status_code: 200,
          body: {
            data: {
              jobs: [
                {
                  cut_job_id: "CJ20260629-0001",
                  status: "done",
                  output_file: "export-clips/E000048/001-Windows验收剪切.mp4",
                  phase_timings: [
                    { phase_id: "resolve_source", status: "done", duration_ms: 12 },
                    { phase_id: "cut_media", status: "done", duration_ms: 691 }
                  ]
                }
              ]
            }
          }
        }
      ]
    }
  };
}

function desktopScreenshot(): unknown {
  return {
    status: "passed",
    suite: "desktop_ui_screenshot_smoke",
    desktop_ui_screenshot_smoke: {
      captured_count: 8
    }
  };
}

test("admin Cutter compatibility proof is blocked and instructive when required reports are missing", () => {
  const report = buildAdminCutterCompatibilityProofReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test"
  });

  assert.equal(report.proof_accepted, false);
  assert.equal(report.docker_upload_allowed, false);
  assert.equal(report.result.status, "blocked");
  assert.ok(report.summary.upload_blockers.includes("windows-acceptance-report-provided"));
  assert.ok(report.summary.upload_blockers.includes("real-cut-report-provided"));
  assert.ok(report.collection_instructions.some((line) => line.includes("windows_acceptance")));

  const markdown = toMarkdown(report);
  assert.match(markdown, /does not contact Windows Runner, Docker, NAS/);
  assert.match(markdown, /MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT/);
});

test("admin Cutter compatibility proof accepts reviewed Windows acceptance plus real cut evidence", () => {
  const report = buildAdminCutterCompatibilityProofReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    windows_acceptance_report_path: "windows.json",
    windows_acceptance_report: validWindowsAcceptance(),
    real_cut_report_path: "real-cut.json",
    real_cut_report: validRealCut(),
    desktop_screenshot_report_path: "screens.json",
    desktop_screenshot_report: desktopScreenshot(),
    expected_ready_count: 10471,
    expected_release_version: "v010471"
  });

  assert.equal(report.proof_accepted, true);
  assert.equal(report.docker_upload_allowed, false);
  assert.equal(report.result.status, "accepted");
  assert.deepEqual(report.summary.upload_blockers, []);
  assert.equal(report.observations.auth_mode, "reviewed");
  assert.equal(report.observations.local_trusted, false);
  assert.equal(report.observations.available_video_count, 10471);
  assert.equal(report.observations.real_cut_run_next_status, "done");
});

test("admin Cutter compatibility proof accepts same-job completion supplement for async queue drain", () => {
  const report = buildAdminCutterCompatibilityProofReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    windows_acceptance_report_path: "windows.json",
    windows_acceptance_report: validWindowsAcceptance(),
    real_cut_report_path: "real-cut.json",
    real_cut_report: failedRealCutWithAsyncDrain(),
    real_cut_supplement_report_path: "diagnostics.json",
    real_cut_supplement_report: realCutSupplement(),
    expected_ready_count: 10471,
    expected_release_version: "v010471"
  });

  assert.equal(report.proof_accepted, true);
  assert.deepEqual(report.summary.upload_blockers, []);
  assert.equal(report.observations.real_cut_status, "failed");
  assert.equal(report.observations.real_cut_completion_status, "done");
  assert.equal(report.observations.real_cut_output_file, "export-clips/E000048/001-Windows验收剪切.mp4");
  assert.equal(report.gates.find((item) => item.id === "real-cut-smoke-passed")?.status, "pass");
});

test("admin Cutter compatibility proof blocks local-trusted auth and stale ready counts", () => {
  const windows = validWindowsAcceptance() as {
    windows_acceptance: {
      app_runtime_smoke: {
        auth_mode: string;
        local_trusted: boolean;
        runtime_status: { available_video_count: number; release_cache: { ready_video_count: number } };
        source_library: { available_video_count: number };
      };
      real_data_smoke: { source_library: { available_video_count: number } };
    };
  };
  windows.windows_acceptance.app_runtime_smoke.auth_mode = "local_trusted";
  windows.windows_acceptance.app_runtime_smoke.local_trusted = true;
  windows.windows_acceptance.app_runtime_smoke.runtime_status.available_video_count = 7950;
  windows.windows_acceptance.app_runtime_smoke.runtime_status.release_cache.ready_video_count = 7950;
  windows.windows_acceptance.app_runtime_smoke.source_library.available_video_count = 7950;
  windows.windows_acceptance.real_data_smoke.source_library.available_video_count = 7950;

  const report = buildAdminCutterCompatibilityProofReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    windows_acceptance_report_path: "windows.json",
    windows_acceptance_report: windows,
    real_cut_report_path: "real-cut.json",
    real_cut_report: validRealCut(),
    expected_ready_count: 10471
  });

  assert.equal(report.proof_accepted, false);
  assert.ok(report.summary.upload_blockers.includes("reviewed-auth-mode"));
  assert.ok(report.summary.upload_blockers.includes("public-library-ready-count"));
});

test("admin Cutter compatibility proof treats desktop screenshot evidence as optional", () => {
  const report = buildAdminCutterCompatibilityProofReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    windows_acceptance_report_path: "windows.json",
    windows_acceptance_report: validWindowsAcceptance(),
    real_cut_report_path: "real-cut.json",
    real_cut_report: validRealCut(),
    expected_ready_count: 10471
  });

  assert.equal(report.proof_accepted, true);
  assert.equal(report.gates.find((item) => item.id === "desktop-screenshot-report-optional")?.status, "not-provided");
  assert.deepEqual(report.summary.upload_blockers, []);
});

test("admin Cutter compatibility proof accepts install_latest_and_smoke nested acceptance reports", () => {
  const report = buildAdminCutterCompatibilityProofReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    windows_acceptance_report_path: "install-smoke.json",
    windows_acceptance_report: {
      status: "passed",
      runner_version: "0.1.99",
      install_latest_and_smoke: {
        windows_acceptance: (validWindowsAcceptance() as { windows_acceptance: unknown }).windows_acceptance
      }
    },
    real_cut_report_path: "real-cut.json",
    real_cut_report: validRealCut(),
    expected_ready_count: 10471
  });

  assert.equal(report.proof_accepted, true);
  assert.deepEqual(report.summary.upload_blockers, []);
});

test("admin Cutter compatibility proof reads release version from runtime-status checks", () => {
  const windows = validWindowsAcceptance() as {
    windows_acceptance: {
      app_runtime_smoke: {
        runtime_status?: unknown;
        checks?: unknown[];
      };
    };
  };
  delete windows.windows_acceptance.app_runtime_smoke.runtime_status;
  windows.windows_acceptance.app_runtime_smoke.checks = [
    {
      id: "runtime_status",
      body: {
        data: {
          release_cache: {
            active_release_version: "v010471",
            ready_video_count: 10471
          },
          search_backend: {
            index_version: "v010471"
          }
        }
      }
    }
  ];

  const report = buildAdminCutterCompatibilityProofReport({
    generated_at: "2026-06-26T00:00:00.000Z",
    command: "test",
    windows_acceptance_report_path: "windows.json",
    windows_acceptance_report: windows,
    real_cut_report_path: "real-cut.json",
    real_cut_report: validRealCut(),
    expected_ready_count: 10471,
    expected_release_version: "v010471"
  });

  assert.equal(report.proof_accepted, true);
  assert.equal(report.observations.release_version, "v010471");
});
