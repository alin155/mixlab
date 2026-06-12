import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  auditDeliveryReadiness,
  collectAcceptanceArtifactReferences,
  parseTraceRows
} from "./delivery-readiness.ts";
import { validateEvidenceKitDraftMetadata } from "./evidence-kit-drafts.ts";
import { validateEvidenceKitManifest } from "./evidence-kit-manifest.ts";
import { validateFinalTargetEvidence } from "./final-target-evidence.ts";
import { OPTIONAL_LOCAL_SOURCE_REPORTS, packageAcceptanceEvidenceKit } from "./package-evidence-kit.ts";
import { auditTargetEvidenceReadiness, type TargetEvidenceReadinessReport } from "./target-evidence-readiness.ts";
import {
  createSearchdConcurrencyRunDirectory,
  writeSearchdConcurrencyReport
} from "../smoke/searchd-concurrency.ts";
import { configureSearchdNasRehearsalEnv } from "../smoke/searchd-nas-rehearsal.ts";
import {
  createNasConcurrencyReportDraft,
  createNasAcceptanceEvidenceDraft,
  createWindowsAcceptanceEvidenceDraft
} from "./target-evidence-template.ts";
import {
  DIAGNOSTIC_REQUIRED_TERMS,
  type EvidenceFileValidationResult,
  NAS_ADMIN_SOURCE_VIDEOS_UI_CHECKS,
  NAS_EVIDENCE_FILES,
  TARGET_EVIDENCE_KIT_ARTIFACT_NAME,
  TARGET_GITHUB_REPOSITORY,
  validateAcceptanceEvidenceFile,
  validateNasAcceptanceEvidence,
  validateWindowsAcceptanceEvidence,
  WINDOWS_FAILURE_CASES,
  WINDOWS_PUBLIC_LIBRARY_PATHS
} from "./target-evidence.ts";

const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

function normalizeLf(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
const MINIMAL_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const TEST_COMMIT_SHA = "0123456789abcdef0123456789abcdef01234567";
const OTHER_TEST_COMMIT_SHA = "fedcba9876543210fedcba9876543210fedcba98";
const TEST_WORKFLOW_RUN_URL = "https://github.com/alin155/mixlab/actions/runs/1234567890";
const OTHER_REPOSITORY_WORKFLOW_RUN_URL = "https://github.com/example/fork/actions/runs/1234567890";
const TEST_INSTALLER_SHA256 = "a".repeat(64);
const WORKER_LOG_WITH_COUNT_REFRESH_INTERVAL =
  "stage api log public workspace ffmpeg ffprobe doctor retry all clear\n"
  + "Library preprocessing worker started.\n"
  + '{\n  "count_refresh_interval": 25\n}\n';

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pngWithDimensions(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 2;
  return bytes;
}

const TARGET_SCREENSHOT_PNG = pngWithDimensions(1280, 720);

function artifactProvenance() {
  return {
    repository_commit_sha: TEST_COMMIT_SHA,
    evidence_kit_artifact_name: TARGET_EVIDENCE_KIT_ARTIFACT_NAME,
    evidence_kit_workflow_run_url: TEST_WORKFLOW_RUN_URL
  };
}

function windowsPathEvidence(pathValue: string) {
  return {
    path: pathValue,
    first_run_selected: true,
    doctor_passed: true,
    public_library_not_written: true,
    ready_materials_visible: true,
    search_works: true,
    playback_works: true,
    one_cut_completed: true,
    project_output_folder_opens: true,
    local_library_refreshed: true
  };
}

function windowsFailureEvidence(caseValue: string) {
  return {
    case: caseValue,
    diagnostics_shown: true,
    did_not_enter_broken_workbench: true
  };
}

function windowsEnvironment(os: "windows-10" | "windows-11") {
  return {
    os,
    clean_machine: {
      node_absent: true,
      npm_absent: true,
      git_absent: true,
      ffmpeg_absent: true,
      ffprobe_absent: true,
      source_repo_absent: true
    },
    first_run: {
      installed_from_exe: true,
      launched_from_start_menu: true,
      no_command_line_required: true,
      doctor_passed: true,
      default_workspace_path_ok: true,
      engine_status_normal: true,
      entered_workbench: true
    },
    screenshots: {
      first_run_doctor_pass: `screenshots/${os}/doctor-pass.png`,
      engine_status: `screenshots/${os}/engine-status.png`,
      material_locator_playback: `screenshots/${os}/material-locator.png`,
      completed_cut_job: `screenshots/${os}/cut-job.png`,
      local_library_new_clip: `screenshots/${os}/local-library.png`
    },
    public_library_paths: WINDOWS_PUBLIC_LIBRARY_PATHS.map(windowsPathEvidence),
    failure_cases: WINDOWS_FAILURE_CASES.map(windowsFailureEvidence),
    diagnostics_samples: [
      {
        kind: "success",
        text: "stage api log public workspace ffmpeg ffprobe doctor retry all clear"
      },
      {
        kind: "failure",
        text: "stage api log public workspace ffmpeg ffprobe doctor retry path missing"
      }
    ]
  };
}

function completeWindowsAcceptanceEvidence() {
  return {
    schema_version: "1.0",
    acceptance_id: "ACC-008",
    artifact_provenance: artifactProvenance(),
    installer: {
      file_name: "MixLab Cutter_0.1.0_x64-setup.exe",
      artifact_name: "mixlab-cutter-windows-exe",
      file_sha256: TEST_INSTALLER_SHA256,
      version: "0.1.0",
      workflow_run_url: TEST_WORKFLOW_RUN_URL
    },
    environments: [
      windowsEnvironment("windows-10"),
      windowsEnvironment("windows-11")
    ]
  };
}

function completeNasAcceptanceEvidence() {
  return {
    schema_version: "1.0",
    acceptance_id: "ACC-009",
    artifact_provenance: artifactProvenance(),
    deployment: {
      admin_web_url: "http://NAS_IP:8080",
      compose_project: "mixlab",
      image_tag: TEST_COMMIT_SHA,
      preprocess_count_refresh_interval: 25,
      admin_web_reachable: true,
      admin_api_listening: true,
      admin_worker_loop_started: true,
      worker_output_created: true,
      current_json_created: true
    },
    smb_public_library: {
      windows_unc_path: String.raw`\\NAS\MixLab\PublicLibrary`,
      nas_shared_folder: "共享文件夹/MixLab/PublicLibrary",
      readonly_from_cutter: true,
      public_library_not_written_by_cutters: true
    },
    multi_user: {
      editor_session_count: 50,
      all_searches_passed: true,
      all_cuts_written_to_local_workspaces: true,
      public_library_not_written_by_cutters: true,
      no_cross_workspace_outputs: true
    },
    admin_source_videos_ui: {
      source_path_visible: true,
      first_source_video_id: "V000001",
      first_source_video_id_visible: true,
      loaded_count_before: 100,
      loaded_count_after: 200,
      load_more_increased: true,
      query: "房产",
      query_result_id: "V000001",
      query_api_response_observed: true,
      query_result_visible: true,
      ready_filter_selected: true,
      ready_filter_api_response_observed: true,
      ready_filter_visible_status_count: 100,
      ready_filter_all_visible_rows_ready: true
    },
    evidence_files: {
      admin_web_screenshot: "evidence/admin-web.png",
      worker_log_excerpt: "evidence/worker.log",
      current_json_screenshot: "evidence/current-json.png",
      smb_permission_screenshot: "evidence/smb-permissions.png",
      multi_user_search_cut_report: "evidence/50-editor-report.json"
    }
  };
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function writeAttachment(
  baseDir: string,
  relativePath: string,
  content: string | Buffer = "target evidence attachment\n"
): void {
  const filePath = path.join(baseDir, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function completeNasConcurrencyReport(): Record<string, unknown> {
  const searchQueries = ["现金流", "利润", "客户", "增长", "品牌"];
  const editorSessions = Array.from({ length: 50 }, (_, index) => {
    const suffix = String(index + 1).padStart(2, "0");
    const sourceVideoId = `V${String(index + 1).padStart(6, "0")}`;
    const searchQuery = searchQueries[index % searchQueries.length]!;

    return {
      user_id: `U${suffix}`,
      username: `target-editor-${suffix}`,
      workspace_id: `workspace-${suffix}`,
      source_video_id: sourceVideoId,
      selected_segment_id: `${sourceVideoId}-S000001`,
      search_query: searchQuery,
      search_result_source_video_id: sourceVideoId,
      search_result_rank: index + 1,
      search_result_group_count: 50,
      search_result_limit: 50,
      search_result_segment_id: `${sourceVideoId}-S000001`,
      search_result_begin_char: 0,
      search_result_end_char: searchQuery.length,
      search_result_text_sha256: sha256Hex(searchQuery),
      full_transcript_source_video_id: sourceVideoId,
      full_transcript_segment_id: `${sourceVideoId}-S000001`,
      full_transcript_segment_count: 4,
      full_transcript_begin_char: 0,
      full_transcript_end_char: 96,
      full_transcript_char_count: 96,
      full_transcript_text_sha256: sha256Hex(`full transcript ${sourceVideoId}`),
      selected_text_begin_char: 0,
      selected_text_end_char: 24,
      selected_text_char_count: 24,
      selected_text_sha256: String(index + 1).padStart(64, "0"),
      selected_begin_ms: 0,
      selected_end_ms: 1500,
      local_clip_id: `E${String(index + 1).padStart(6, "0")}`,
      local_clip_source_video_id: sourceVideoId,
      local_clip_selected_text_sha256: String(index + 1).padStart(64, "0"),
      local_clip_relative_path: `.mixlab-library/videos/E${String(index + 1).padStart(6, "0")}/source.mp4`,
      local_clip_file_size_bytes: 18_000 + index,
      local_clip_content_sha256: sha256Hex(`local clip ${sourceVideoId}`),
      local_clip_begin_ms: 0,
      local_clip_end_ms: 1500,
      search_backend: "searchd",
      search_index_version: "v000001",
      location_verified: true,
      completed_closed_loop: true,
      workspace_output_written: true,
      public_library_written: false,
      search_ms: 20 + index,
      detail_ms: 15 + index,
      cut_ms: 100 + index
    };
  });

  return {
    status: "passed",
    editor_count: 50,
    active_user_count: 50,
    distinct_source_video_count: 50,
    search_query_count: searchQueries.length,
    search_queries: searchQueries,
    search_query_distribution: Object.fromEntries(
      searchQueries.map((query) => [query, editorSessions.filter((session) => session.search_query === query).length])
    ),
    indexed_source_video_count: 2000,
    indexed_transcript_segment_count: 48000,
    search_index_version: "v000001",
    searchd_health_index_version: "v000001",
    searchd_health_source_video_count: 2000,
    searchd_health_segment_count: 48000,
    all_searches_passed: true,
    all_cuts_written_to_local_workspaces: true,
    public_library_not_written_by_cutters: true,
    no_cross_workspace_outputs: true,
    search_sla_ms: 1500,
    detail_sla_ms: 1500,
    cut_sla_ms: 1500,
    metrics: {
      search: {
        count: 50,
        min_ms: 10,
        p50_ms: 35,
        p95_ms: 77.5,
        max_ms: 90
      },
      detail: {
        count: 50,
        min_ms: 8,
        p50_ms: 30,
        p95_ms: 65.2,
        max_ms: 80
      },
      cut: {
        count: 50,
        min_ms: 100,
        p50_ms: 240,
        p95_ms: 370,
        max_ms: 420
      },
      usage: {
        search_request_count: 50,
        searchd_search_count: 50,
        search_failure_count: 0,
        source_detail_view_count: 50,
        transcript_selection_count: 50,
        cut_submission_count: 50,
        cut_success_count: 50,
        local_clip_count: 50
      }
    },
    editor_sessions: editorSessions
  };
}

function writeCompleteTargetAttachments(baseDir: string): void {
  const screenshotPaths = [
    "screenshots/windows-10/doctor-pass.png",
    "screenshots/windows-10/engine-status.png",
    "screenshots/windows-10/material-locator.png",
    "screenshots/windows-10/cut-job.png",
    "screenshots/windows-10/local-library.png",
    "screenshots/windows-11/doctor-pass.png",
    "screenshots/windows-11/engine-status.png",
    "screenshots/windows-11/material-locator.png",
    "screenshots/windows-11/cut-job.png",
    "screenshots/windows-11/local-library.png",
    "evidence/current-json.png",
    "evidence/admin-web.png",
    "evidence/smb-permissions.png"
  ];

  for (const relativePath of screenshotPaths) {
    writeAttachment(baseDir, relativePath, TARGET_SCREENSHOT_PNG);
  }

  writeAttachment(baseDir, "evidence/worker.log", WORKER_LOG_WITH_COUNT_REFRESH_INTERVAL);
  writeAttachment(baseDir, "evidence/50-editor-report.json", `${JSON.stringify(completeNasConcurrencyReport(), null, 2)}\n`);
}

test("validates complete Windows ACC-008 acceptance evidence", () => {
  const result = validateWindowsAcceptanceEvidence(completeWindowsAcceptanceEvidence());

  assert.deepEqual(result, {
    ok: true,
    errors: []
  });
});

test("Windows evidence rejects missing path matrix and leaked diagnostics", () => {
  const environment = windowsEnvironment("windows-10");
  environment.public_library_paths = environment.public_library_paths.slice(1);
  environment.diagnostics_samples[0]!.text = "stage api log public workspace ffmpeg ffprobe doctor retry sk-live-secret";

  const result = validateWindowsAcceptanceEvidence({
    schema_version: "1.0",
    acceptance_id: "ACC-008",
    artifact_provenance: {
      repository_commit_sha: "shortsha",
      evidence_kit_artifact_name: "wrong-kit",
      evidence_kit_workflow_run_url: "not-a-run-url"
    },
    installer: {
      file_name: "MixLab Cutter.zip",
      artifact_name: "wrong",
      file_sha256: "not-a-sha",
      version: "",
      workflow_run_url: "not-a-run-url"
    },
    environments: [environment]
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /artifact_provenance.repository_commit_sha must be a 40-character git commit SHA/);
  assert.match(result.errors.join("\n"), /artifact_provenance.evidence_kit_workflow_run_url must be a GitHub Actions run URL/);
  assert.match(result.errors.join("\n"), /installer.file_name must end with .exe/);
  assert.match(result.errors.join("\n"), /installer.file_sha256 must be a 64-character sha256 hex digest/);
  assert.match(result.errors.join("\n"), /installer.workflow_run_url must be a GitHub Actions run URL/);
  assert.match(result.errors.join("\n"), /environments missing windows-11/);
  assert.match(result.errors.join("\n"), /public_library_paths missing D:\\MixLabPublicLibrary/);
  assert.match(result.errors.join("\n"), /forbidden secret/);
});

test("Windows evidence requires installer file name, version, and SHA-256 to describe one artifact", () => {
  const evidence = completeWindowsAcceptanceEvidence();
  evidence.installer.file_name = "MixLab Cutter_0.1.0_x64-setup.exe";
  evidence.installer.version = "0.2.0";
  evidence.installer.file_sha256 = "not-a-sha";

  const result = validateWindowsAcceptanceEvidence(evidence);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /installer.file_name must include installer.version/);
  assert.match(result.errors.join("\n"), /installer.file_sha256 must be a 64-character sha256 hex digest/);
});

test("Windows evidence preflight rejects non-portable or mismatched screenshot references", () => {
  const evidence = completeWindowsAcceptanceEvidence();
  evidence.environments[0]!.screenshots.first_run_doctor_pass = "screenshots/windows-11/doctor-pass.png";
  evidence.environments[0]!.screenshots.engine_status = "screenshots/windows-10/engine-proof.png";
  evidence.environments[1]!.screenshots.material_locator_playback = String.raw`screenshots\windows-11\material-locator.png`;
  evidence.environments[1]!.screenshots.local_library_new_clip = "C:/captures/local-library.png";

  const result = validateWindowsAcceptanceEvidence(evidence);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /environments\[windows-10\]\.screenshots\.first_run_doctor_pass must include windows-10/);
  assert.match(result.errors.join("\n"), /environments\[windows-10\]\.screenshots\.engine_status filename must be engine-status/);
  assert.match(result.errors.join("\n"), /environments\[windows-11\]\.screenshots\.material_locator_playback must use forward slashes/);
  assert.match(result.errors.join("\n"), /environments\[windows-11\]\.screenshots\.local_library_new_clip must be relative to the evidence file/);
});

test("Windows evidence file preflight rejects missing or undersized screenshot attachments", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-windows-file-preflight-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");

  try {
    writeJson(windowsPath, completeWindowsAcceptanceEvidence());

    const missingReport = await validateAcceptanceEvidenceFile("windows", windowsPath);
    assert.equal(missingReport.ok, false);
    assert.equal(missingReport.attachment_count, 10);
    assert.match(missingReport.errors.join("\n"), /attachment file is missing: screenshots\/windows-10\/doctor-pass\.png/);

    writeCompleteTargetAttachments(tempRoot);
    writeAttachment(tempRoot, "screenshots/windows-10/doctor-pass.png", MINIMAL_PNG);

    const undersizedReport = await validateAcceptanceEvidenceFile("windows", windowsPath);
    assert.equal(undersizedReport.ok, false);
    assert.equal(undersizedReport.attachment_count, 10);
    assert.match(
      undersizedReport.errors.join("\n"),
      /screenshot attachment must be at least 640x360: screenshots\/windows-10\/doctor-pass\.png \(1x1\)/
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("target evidence file preflight reports missing or invalid JSON as structured output", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-file-preflight-json-"));
  const missingPath = path.join(tempRoot, "missing-windows.json");
  const invalidPath = path.join(tempRoot, "bad-nas.json");

  try {
    const missingReport = await validateAcceptanceEvidenceFile("windows", missingPath);
    assert.equal(missingReport.ok, false);
    assert.equal(missingReport.attachment_count, 0);
    assert.deepEqual(missingReport.errors, [`ACC-008 evidence file is missing: ${missingPath}`]);

    writeFileSync(invalidPath, "{not valid json}\n");
    const invalidReport = await validateAcceptanceEvidenceFile("nas", invalidPath);
    assert.equal(invalidReport.ok, false);
    assert.equal(invalidReport.attachment_count, 0);
    assert.deepEqual(invalidReport.errors, [`ACC-009 evidence file is not valid JSON: ${invalidPath}`]);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("target evidence CLI prints structured JSON for missing evidence files", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-evidence-cli-missing-"));
  const missingPath = path.join(tempRoot, "windows-acc-008.json");

  try {
    let stdout = "";
    assert.throws(
      () => {
        try {
          execFileSync(
            process.execPath,
            ["--import", "tsx", "scripts/acceptance/target-evidence.ts", "windows", missingPath],
            {
              cwd: process.cwd(),
              encoding: "utf8",
              stdio: "pipe"
            }
          );
        } catch (error) {
          stdout = String((error as { stdout?: string }).stdout ?? "");
          throw error;
        }
      },
      /Command failed/
    );

    const report = JSON.parse(stdout) as EvidenceFileValidationResult;
    assert.deepEqual(report, {
      ok: false,
      errors: [`ACC-008 evidence file is missing: ${missingPath}`],
      attachment_count: 0
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("target evidence readiness summarizes missing target gates without pretending final delivery is ready", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-target-readiness-missing-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    const report = await auditTargetEvidenceReadiness({ windowsPath, nasPath });

    assert.equal(report.ok, false);
    assert.equal(report.ready_for_final_validation, false);
    assert.equal(report.same_repository_commit, false);
    assert.deepEqual(report.accepted_target_gates, []);
    assert.deepEqual(report.remaining_target_gates, ["ACC-008", "ACC-009"]);
    assert.equal(report.windows.status, "missing");
    assert.equal(report.nas.status, "missing");
    assert.match(report.next_actions.join("\n"), /Collect ACC-008/);
    assert.match(report.next_actions.join("\n"), /Collect ACC-009/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("target evidence readiness reports accepted gates and matching provenance when final target evidence is complete", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-target-readiness-complete-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    writeJson(windowsPath, completeWindowsAcceptanceEvidence());
    writeJson(nasPath, completeNasAcceptanceEvidence());
    writeCompleteTargetAttachments(tempRoot);

    const report = await auditTargetEvidenceReadiness({ windowsPath, nasPath });

    assert.equal(report.ok, true);
    assert.equal(report.ready_for_final_validation, true);
    assert.equal(report.same_repository_commit, true);
    assert.deepEqual(report.accepted_target_gates, ["ACC-008", "ACC-009"]);
    assert.deepEqual(report.remaining_target_gates, []);
    assert.equal(report.windows.status, "accepted");
    assert.equal(report.windows.attachment_count, 10);
    assert.equal(report.nas.status, "accepted");
    assert.equal(report.nas.attachment_count, 5);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("target evidence readiness CLI exits nonzero while returning a concise report for incomplete evidence", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-target-readiness-cli-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    let stdout = "";
    assert.throws(
      () => {
        try {
          execFileSync(
            process.execPath,
            ["--import", "tsx", "scripts/acceptance/target-evidence-readiness.ts", windowsPath, nasPath],
            {
              cwd: process.cwd(),
              encoding: "utf8",
              stdio: "pipe"
            }
          );
        } catch (error) {
          stdout = String((error as { stdout?: string }).stdout ?? "");
          throw error;
        }
      },
      /Command failed/
    );

    const report = JSON.parse(stdout) as TargetEvidenceReadinessReport;
    assert.equal(report.ok, false);
    assert.equal(report.windows.status, "missing");
    assert.equal(report.nas.status, "missing");
    assert.equal(report.final_gate.error_count, 2);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("validates complete NAS ACC-009 acceptance evidence", () => {
  const result = validateNasAcceptanceEvidence(completeNasAcceptanceEvidence());

  assert.deepEqual(result, {
    ok: true,
    errors: []
  });
});

test("target evidence rejects GitHub Actions run URLs outside the delivery repository", () => {
  const windowsEvidence = completeWindowsAcceptanceEvidence();
  windowsEvidence.artifact_provenance.evidence_kit_workflow_run_url = OTHER_REPOSITORY_WORKFLOW_RUN_URL;
  windowsEvidence.installer.workflow_run_url = OTHER_REPOSITORY_WORKFLOW_RUN_URL;
  const windowsResult = validateWindowsAcceptanceEvidence(windowsEvidence);

  assert.equal(windowsResult.ok, false);
  assert.match(
    windowsResult.errors.join("\n"),
    new RegExp(`artifact_provenance\\.evidence_kit_workflow_run_url must be a GitHub Actions run URL for ${TARGET_GITHUB_REPOSITORY}`)
  );
  assert.match(
    windowsResult.errors.join("\n"),
    new RegExp(`installer\\.workflow_run_url must be a GitHub Actions run URL for ${TARGET_GITHUB_REPOSITORY}`)
  );

  const nasEvidence = completeNasAcceptanceEvidence();
  nasEvidence.artifact_provenance.evidence_kit_workflow_run_url = OTHER_REPOSITORY_WORKFLOW_RUN_URL;
  const nasResult = validateNasAcceptanceEvidence(nasEvidence);

  assert.equal(nasResult.ok, false);
  assert.match(
    nasResult.errors.join("\n"),
    new RegExp(`artifact_provenance\\.evidence_kit_workflow_run_url must be a GitHub Actions run URL for ${TARGET_GITHUB_REPOSITORY}`)
  );
});

test("NAS evidence preflight rejects non-portable or mismatched attachment references", () => {
  const evidence = completeNasAcceptanceEvidence();
  evidence.evidence_files.admin_web_screenshot = "/tmp/admin-web.png";
  evidence.evidence_files.worker_log_excerpt = String.raw`evidence\worker.log`;
  evidence.evidence_files.current_json_screenshot = "../evidence/current-json.png";
  evidence.evidence_files.multi_user_search_cut_report = "evidence/editor-run.json";

  const result = validateNasAcceptanceEvidence(evidence);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /evidence_files\.admin_web_screenshot must be relative to the evidence file/);
  assert.match(result.errors.join("\n"), /evidence_files\.worker_log_excerpt must use forward slashes/);
  assert.match(result.errors.join("\n"), /evidence_files\.current_json_screenshot must not leave the evidence directory/);
  assert.match(result.errors.join("\n"), /evidence_files\.multi_user_search_cut_report filename must be 50-editor-report/);
});

test("NAS evidence file preflight rejects invalid attachments and weak 50-editor reports", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-file-preflight-"));
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    writeJson(nasPath, completeNasAcceptanceEvidence());
    writeCompleteTargetAttachments(tempRoot);
    writeAttachment(tempRoot, "evidence/admin-web.png", "not actually a png\n");
    writeAttachment(
      tempRoot,
      "evidence/50-editor-report.json",
      `${JSON.stringify({
        ...completeNasConcurrencyReport(),
        indexed_source_video_count: 1999,
        indexed_transcript_segment_count: 47999
      }, null, 2)}\n`
    );

    const report = await validateAcceptanceEvidenceFile("nas", nasPath);

    assert.equal(report.ok, false);
    assert.equal(report.attachment_count, 5);
    assert.match(report.errors.join("\n"), /screenshot attachment has invalid file signature: evidence\/admin-web\.png/);
    assert.match(report.errors.join("\n"), /concurrency_report\.indexed_source_video_count must be at least 2000/);
    assert.match(report.errors.join("\n"), /concurrency_report\.indexed_transcript_segment_count must be at least 48000/);
    assert.match(
      report.errors.join("\n"),
      /concurrency_report\.searchd_health_source_video_count must equal concurrency_report\.indexed_source_video_count/
    );
    assert.match(
      report.errors.join("\n"),
      /concurrency_report\.searchd_health_segment_count must equal concurrency_report\.indexed_transcript_segment_count/
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("NAS evidence rejects weak multi-user and missing deployment proof", () => {
  const result = validateNasAcceptanceEvidence({
    schema_version: "1.0",
    acceptance_id: "ACC-009",
    artifact_provenance: artifactProvenance(),
    deployment: {
      admin_web_url: "http://NAS_IP:8080",
      compose_project: "mixlab",
      image_tag: "abcdef123",
      admin_web_reachable: true,
      admin_api_listening: false
    },
    smb_public_library: {
      windows_unc_path: "",
      nas_shared_folder: "共享文件夹/MixLab/PublicLibrary",
      readonly_from_cutter: true,
      public_library_not_written_by_cutters: false
    },
    multi_user: {
      editor_session_count: 12,
      all_searches_passed: true,
      all_cuts_written_to_local_workspaces: false
    },
    admin_source_videos_ui: {
      source_path_visible: true,
      first_source_video_id: "not-a-source-id",
      first_source_video_id_visible: false,
      loaded_count_before: 100,
      loaded_count_after: 100,
      load_more_increased: false,
      query: "",
      query_result_id: "bad",
      query_api_response_observed: false,
      query_result_visible: false,
      ready_filter_selected: false,
      ready_filter_api_response_observed: false,
      ready_filter_visible_status_count: 0,
      ready_filter_all_visible_rows_ready: false
    },
    evidence_files: {}
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /deployment.image_tag must match artifact_provenance.repository_commit_sha/);
  assert.match(result.errors.join("\n"), /deployment.preprocess_count_refresh_interval must be a positive integer/);
  assert.match(result.errors.join("\n"), /deployment.admin_api_listening must be true/);
  assert.match(result.errors.join("\n"), /multi_user.editor_session_count must be at least 50/);
  assert.match(result.errors.join("\n"), /admin_source_videos_ui.first_source_video_id_visible must be true/);
  assert.match(result.errors.join("\n"), /admin_source_videos_ui.loaded_count_after must be greater than loaded_count_before/);
  assert.match(result.errors.join("\n"), /admin_source_videos_ui.query must be a non-empty string/);
  assert.match(result.errors.join("\n"), /admin_source_videos_ui.query_result_id must be a source video id like V000001/);
  assert.match(result.errors.join("\n"), /evidence_files.admin_web_screenshot/);
});

test("Windows evidence draft includes every required path and failure case but does not pass as real evidence", () => {
  const draft = createWindowsAcceptanceEvidenceDraft();
  const environments = draft.environments as Array<Record<string, unknown>>;

  assert.deepEqual(environments.map((environment) => environment.os), ["windows-10", "windows-11"]);

  for (const environment of environments) {
    const os = environment.os as string;
    assert.deepEqual(
      Object.values(environment.screenshots as Record<string, unknown>).every((value) =>
        typeof value === "string" && value.includes(`/${os}/`)
      ),
      true
    );
    assert.deepEqual(
      (environment.public_library_paths as Array<Record<string, unknown>>).map((path) => path.path),
      [...WINDOWS_PUBLIC_LIBRARY_PATHS]
    );
    assert.deepEqual(
      (environment.failure_cases as Array<Record<string, unknown>>).map((failureCase) => failureCase.case),
      [...WINDOWS_FAILURE_CASES]
    );
  }

  const result = validateWindowsAcceptanceEvidence(draft);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /artifact_provenance.repository_commit_sha must be a non-empty string/);
  assert.match(result.errors.join("\n"), /installer.file_name must be a non-empty string/);
  assert.match(result.errors.join("\n"), /installer.file_sha256 must be a non-empty string/);
  assert.match(result.errors.join("\n"), /clean_machine.node_absent must be true/);
});

test("NAS evidence draft includes every required proof slot but does not pass as real evidence", () => {
  const draft = createNasAcceptanceEvidenceDraft();
  const deployment = draft.deployment as Record<string, unknown>;
  const evidenceFiles = draft.evidence_files as Record<string, unknown>;

  assert.equal(deployment.preprocess_count_refresh_interval, 0);
  assert.deepEqual(Object.keys(evidenceFiles), [...NAS_EVIDENCE_FILES]);
  assert.deepEqual(
    Object.keys(draft.admin_source_videos_ui as Record<string, unknown>).filter((field) =>
      NAS_ADMIN_SOURCE_VIDEOS_UI_CHECKS.includes(field as typeof NAS_ADMIN_SOURCE_VIDEOS_UI_CHECKS[number])
    ),
    [...NAS_ADMIN_SOURCE_VIDEOS_UI_CHECKS]
  );

  const result = validateNasAcceptanceEvidence(draft);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /artifact_provenance.repository_commit_sha must be a non-empty string/);
  assert.match(result.errors.join("\n"), /deployment.preprocess_count_refresh_interval must be a positive integer/);
  assert.match(result.errors.join("\n"), /deployment.admin_web_reachable must be true/);
  assert.match(result.errors.join("\n"), /multi_user.editor_session_count must be at least 50/);
  assert.match(result.errors.join("\n"), /admin_source_videos_ui.source_path_visible must be true/);
  assert.match(result.errors.join("\n"), /admin_source_videos_ui.first_source_video_id must be a non-empty string/);
});

test("NAS 50-editor report draft has the final per-editor shape but cannot pass", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-report-draft-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    const reportDraft = createNasConcurrencyReportDraft();
    assert.equal((reportDraft.editor_sessions as unknown[]).length, 50);
    assert.equal(reportDraft.status, "draft");

    writeJson(windowsPath, completeWindowsAcceptanceEvidence());
    writeJson(nasPath, completeNasAcceptanceEvidence());
    writeCompleteTargetAttachments(tempRoot);
    writeAttachment(tempRoot, "evidence/50-editor-report.json", `${JSON.stringify(reportDraft, null, 2)}\n`);

    const report = await validateFinalTargetEvidence({ windowsPath, nasPath });
    assert.equal(report.ok, false);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency report status must be passed/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_count must be at least 50/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[0\]\.user_id must be a non-empty string/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[0\]\.completed_closed_loop must be true/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("Windows target collector keeps the ACC-008 path and failure matrices in sync", () => {
  const collector = readFileSync("scripts/acceptance/windows-acc-008-collector.ps1", "utf8");

  for (const path of WINDOWS_PUBLIC_LIBRARY_PATHS) {
    assert.match(collector, new RegExp(path.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")));
  }
  for (const failureCase of WINDOWS_FAILURE_CASES) {
    assert.match(collector, new RegExp(failureCase));
  }

  assert.match(collector, /PassedPublicLibraryPath/);
  assert.match(collector, /PassedFailureCase/);
  assert.match(collector, /AllPublicLibraryPathsPassed/);
  assert.match(collector, /AllFailureCasesPassed/);
  assert.match(collector, /RequireCurrentEnvironmentComplete/);
  assert.match(collector, /Assert-CurrentWindowsEnvironmentComplete/);
  assert.match(collector, /clean_machine/);
  assert.match(collector, /first_run/);
  assert.match(collector, /public_library_paths/);
  assert.match(collector, /failure_cases/);
  assert.match(collector, /diagnostics_samples/);
  assert.match(collector, /RepositoryCommitSha/);
  assert.match(collector, /EvidenceKitWorkflowRunUrl/);
  assert.match(collector, /InstallerFilePath/);
  assert.match(collector, /InstallerFileSha256/);
  assert.match(collector, /Get-FileHash/);
  assert.match(collector, /file_sha256/);
  assert.match(collector, /InstallerWorkflowRunUrl/);
  assert.match(collector, /\$EvidenceDir/);
  assert.match(collector, /Resolve-EvidenceInput/);
  assert.match(collector, /ForbiddenDiagnosticPatterns/);
  assert.match(collector, /Assert-TextEvidenceSafe/);
  assert.match(collector, /Diagnostic evidence file must not be empty/);
  assert.match(collector, /RequiredDiagnosticTerms/);
  assert.match(collector, /Assert-DiagnosticEvidenceUseful/);
  for (const term of DIAGNOSTIC_REQUIRED_TERMS) {
    assert.match(collector, new RegExp(`"${term}"`));
  }
  assert.match(collector, /Read-FilePrefixBytes/);
  assert.match(collector, /Assert-ScreenshotSignature/);
  assert.match(collector, /doctor-pass\.png/);
  assert.match(collector, /success-diagnostics\.txt/);
  assert.match(collector, /Copy-ScreenshotAttachment/);
  assert.match(collector, /screenshots\/\$EnvironmentOs\/\$FileStem\$extension/);
  assert.match(collector, /Copy-Item -LiteralPath \$SourcePath -Destination \$destination -Force/);
  assert.match(collector, /ConvertTo-Json -Depth 20/);
});

test("NAS target collector keeps the ACC-009 deployment and evidence slots in sync", () => {
  const collector = readFileSync("scripts/acceptance/nas-acc-009-collector.sh", "utf8");

  for (const field of NAS_EVIDENCE_FILES) {
    assert.match(collector, new RegExp(field));
  }

  assert.match(collector, /ADMIN_WEB_URL/);
  assert.match(collector, /MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL/);
  assert.match(collector, /preprocess_count_refresh_interval/);
  assert.match(collector, /REPOSITORY_COMMIT_SHA/);
  assert.match(collector, /EVIDENCE_KIT_WORKFLOW_RUN_URL/);
  assert.match(collector, /json_string_field_from_existing/);
  assert.match(collector, /json_positive_integer_field_from_existing/);
  assert.match(collector, /first_non_empty/);
  assert.match(collector, /first_positive_integer/);
  assert.match(collector, /assert_worker_log_count_refresh_interval/);
  assert.match(collector, /0\.0\.0\.0:3889/);
  assert.match(collector, /admin-worker-loop-started/);
  assert.match(collector, /current\.json/);
  assert.match(collector, /EDITOR_SESSION_COUNT/);
  assert.match(collector, /copy_attachment/);
  assert.match(collector, /assert_text_attachment_safe/);
  assert.match(collector, /assert_json_attachment_parseable/);
  assert.match(collector, /assert_screenshot_signature/);
  assert.match(collector, /evidence_screenshot_value/);
  assert.match(collector, /evidence\/%s/);
  assert.match(collector, /slaFieldsByMetric/);
	  assert.match(collector, /latencySummaryPasses/);
	  assert.match(collector, /latencyMetricMatchesEditorSessions/);
	  assert.match(collector, /count === sessions\.length/);
	  assert.match(collector, /uniqueSourceVideoCount/);
	  assert.match(collector, /distinctSourceVideoCount/);
  assert.match(collector, /min_ms/);
  assert.match(collector, /p50_ms/);
  assert.match(collector, /max_ms/);
  assert.match(collector, /all_searches_passed/);
  assert.match(collector, /all_cuts_written_to_local_workspaces/);
  assert.match(collector, /public_library_not_written_by_cutters/);
  assert.match(collector, /no_cross_workspace_outputs/);
  assert.match(collector, /admin_source_videos_ui/);
  assert.match(collector, /ADMIN_SOURCE_VIDEOS_SOURCE_PATH_VISIBLE/);
  assert.match(collector, /ADMIN_SOURCE_VIDEOS_FIRST_ID/);
  assert.match(collector, /ADMIN_SOURCE_VIDEOS_LOADED_COUNT_AFTER/);
  assert.match(collector, /ADMIN_SOURCE_VIDEOS_QUERY_API_RESPONSE_OBSERVED/);
  assert.match(collector, /ADMIN_SOURCE_VIDEOS_READY_FILTER_ALL_VISIBLE_ROWS_READY/);
  assert.match(collector, /first_bool/);
    assert.match(collector, /search_result_begin_char/);
    assert.match(collector, /search_result_end_char/);
    assert.match(collector, /search_result_rank/);
    assert.match(collector, /search_result_group_count/);
    assert.match(collector, /search_result_limit/);
    assert.match(collector, /search_result_text_sha256/);
    assert.match(collector, /searchIndexVersionProofPasses/);
    assert.match(collector, /search_index_version/);
    assert.match(collector, /searchdHealthProofPasses/);
    assert.match(collector, /searchd_health_source_video_count/);
    assert.match(collector, /searchd_health_segment_count/);
    assert.match(collector, /sha256Hex\(searchQuery\)/);
    assert.match(collector, /fullTranscriptProofPasses/);
    assert.match(collector, /full_transcript_source_video_id/);
    assert.match(collector, /full_transcript_segment_count/);
    assert.match(collector, /full_transcript_char_count/);
    assert.match(collector, /full_transcript_text_sha256/);
    assert.match(collector, /session\.search_result_begin_char >= session\.full_transcript_begin_char/);
  assert.match(collector, /selected_text_begin_char/);
  assert.match(collector, /selected_text_end_char/);
  assert.match(collector, /selectedTextRangeProofPasses/);
  assert.match(collector, /selected_text_char_count/);
  assert.match(collector, /localClipProofPasses/);
  assert.match(collector, /local_clip_source_video_id/);
  assert.match(collector, /local_clip_selected_text_sha256/);
  assert.match(collector, /local_clip_relative_path/);
  assert.match(collector, /local_clip_file_size_bytes/);
  assert.match(collector, /local_clip_content_sha256/);
  assert.match(collector, /portableRelativePath/);
  assert.match(collector, /local_clip_begin_ms/);
  assert.match(collector, /local_clip_end_ms/);
  assert.match(collector, /session\.selected_text_begin_char <= session\.search_result_begin_char/);
});

test("NAS target collector copies attachments into a portable evidence folder", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-collector-"));
  const sourceDir = path.join(tempRoot, "source-attachments");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(path.join(sourceDir, "admin-web-source.JPG"), MINIMAL_JPEG);
    writeFileSync(path.join(sourceDir, "worker.log"), WORKER_LOG_WITH_COUNT_REFRESH_INTERVAL);
    writeFileSync(path.join(sourceDir, "current-json.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "smb-permissions.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "50-editor-report.json"), `${JSON.stringify(completeNasConcurrencyReport(), null, 2)}\n`);

    execFileSync("sh", ["scripts/acceptance/nas-acc-009-collector.sh"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        REPOSITORY_COMMIT_SHA: TEST_COMMIT_SHA,
        EVIDENCE_KIT_WORKFLOW_RUN_URL: TEST_WORKFLOW_RUN_URL,
        IMAGE_TAG: TEST_COMMIT_SHA,
        MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL: "25",
        EVIDENCE_PATH: nasPath,
        EVIDENCE_DIR: sourceDir,
        ADMIN_WEB_SCREENSHOT: path.join(sourceDir, "admin-web-source.JPG"),
        ADMIN_SOURCE_VIDEOS_SOURCE_PATH_VISIBLE: "true",
        ADMIN_SOURCE_VIDEOS_FIRST_ID: "V000001",
        ADMIN_SOURCE_VIDEOS_FIRST_ID_VISIBLE: "true",
        ADMIN_SOURCE_VIDEOS_LOADED_COUNT_BEFORE: "100",
        ADMIN_SOURCE_VIDEOS_LOADED_COUNT_AFTER: "200",
        ADMIN_SOURCE_VIDEOS_LOAD_MORE_INCREASED: "true",
        ADMIN_SOURCE_VIDEOS_QUERY: "房产",
        ADMIN_SOURCE_VIDEOS_QUERY_RESULT_ID: "V000001",
        ADMIN_SOURCE_VIDEOS_QUERY_API_RESPONSE_OBSERVED: "true",
        ADMIN_SOURCE_VIDEOS_QUERY_RESULT_VISIBLE: "true",
        ADMIN_SOURCE_VIDEOS_READY_FILTER_SELECTED: "true",
        ADMIN_SOURCE_VIDEOS_READY_FILTER_API_RESPONSE_OBSERVED: "true",
        ADMIN_SOURCE_VIDEOS_READY_FILTER_VISIBLE_STATUS_COUNT: "100",
        ADMIN_SOURCE_VIDEOS_READY_FILTER_ALL_VISIBLE_ROWS_READY: "true"
      }
    });

    const evidence = JSON.parse(readFileSync(nasPath, "utf8"));
    assert.deepEqual(evidence.artifact_provenance, artifactProvenance());
    assert.equal(evidence.deployment.image_tag, TEST_COMMIT_SHA);
    assert.equal(evidence.deployment.preprocess_count_refresh_interval, 25);
    assert.deepEqual(evidence.admin_source_videos_ui, completeNasAcceptanceEvidence().admin_source_videos_ui);
    assert.deepEqual(evidence.evidence_files, {
      admin_web_screenshot: "evidence/admin-web.jpg",
      worker_log_excerpt: "evidence/worker.log",
      current_json_screenshot: "evidence/current-json.png",
      smb_permission_screenshot: "evidence/smb-permissions.png",
      multi_user_search_cut_report: "evidence/50-editor-report.json"
    });
    for (const attachmentPath of Object.values(evidence.evidence_files)) {
      assert.equal(existsSync(path.join(tempRoot, String(attachmentPath))), true);
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("NAS target collector rejects worker logs without the deployed count-refresh interval", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-collector-worker-log-"));
  const sourceDir = path.join(tempRoot, "source-attachments");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(path.join(sourceDir, "admin-web.png"), MINIMAL_PNG);
    writeFileSync(
      path.join(sourceDir, "worker.log"),
      'stage api log public workspace ffmpeg ffprobe doctor retry all clear\n{ "count_refresh_interval": 10 }\n'
    );
    writeFileSync(path.join(sourceDir, "current-json.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "smb-permissions.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "50-editor-report.json"), `${JSON.stringify(completeNasConcurrencyReport(), null, 2)}\n`);

    let stderr = "";
    assert.throws(
      () => {
        try {
          execFileSync("sh", ["scripts/acceptance/nas-acc-009-collector.sh"], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL: "25",
              EVIDENCE_PATH: nasPath,
              EVIDENCE_DIR: sourceDir
            },
            stdio: "pipe"
          });
        } catch (error) {
          stderr = String((error as { stderr?: Buffer }).stderr ?? "");
          throw error;
        }
      },
      /Command failed/
    );
    assert.match(stderr, /Worker log evidence must include count_refresh_interval matching deployment\.preprocess_count_refresh_interval \(25\)/);
    assert.equal(existsSync(path.join(tempRoot, "evidence", "worker.log")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("NAS target collector preserves CI-prefilled provenance from an existing draft", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-collector-prefilled-"));
  const sourceDir = path.join(tempRoot, "source-attachments");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    mkdirSync(sourceDir, { recursive: true });
    writeJson(
      nasPath,
      createNasAcceptanceEvidenceDraft({
        repository_commit_sha: TEST_COMMIT_SHA,
        evidence_kit_workflow_run_url: TEST_WORKFLOW_RUN_URL,
        nas_image_tag: TEST_COMMIT_SHA,
        nas_preprocess_count_refresh_interval: 25
      })
    );
    const draft = JSON.parse(readFileSync(nasPath, "utf8"));
    draft.admin_source_videos_ui = completeNasAcceptanceEvidence().admin_source_videos_ui;
    writeJson(nasPath, draft);
    writeFileSync(path.join(sourceDir, "admin-web.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "worker.log"), WORKER_LOG_WITH_COUNT_REFRESH_INTERVAL);
    writeFileSync(path.join(sourceDir, "current-json.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "smb-permissions.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "50-editor-report.json"), `${JSON.stringify(completeNasConcurrencyReport(), null, 2)}\n`);

    execFileSync("sh", ["scripts/acceptance/nas-acc-009-collector.sh"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        REPOSITORY_COMMIT_SHA: "",
        GITHUB_SHA: "",
        EVIDENCE_KIT_WORKFLOW_RUN_URL: "",
        IMAGE_TAG: "",
        MIXLAB_IMAGE_TAG: "",
        MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL: "",
        EVIDENCE_PATH: nasPath,
        EVIDENCE_DIR: sourceDir
      }
    });

    const evidence = JSON.parse(readFileSync(nasPath, "utf8"));
    assert.deepEqual(evidence.artifact_provenance, artifactProvenance());
    assert.equal(evidence.deployment.image_tag, TEST_COMMIT_SHA);
    assert.equal(evidence.deployment.preprocess_count_refresh_interval, 25);
    assert.deepEqual(evidence.admin_source_videos_ui, completeNasAcceptanceEvidence().admin_source_videos_ui);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("NAS target collector rejects fake screenshots before copying evidence", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-collector-fake-shot-"));
  const sourceDir = path.join(tempRoot, "source-attachments");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(path.join(sourceDir, "admin-web.png"), "not actually a png\n");
    writeFileSync(path.join(sourceDir, "worker.log"), WORKER_LOG_WITH_COUNT_REFRESH_INTERVAL);
    writeFileSync(path.join(sourceDir, "current-json.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "smb-permissions.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "50-editor-report.json"), "{}\n");

    let stderr = "";
    assert.throws(
      () => {
        try {
          execFileSync("sh", ["scripts/acceptance/nas-acc-009-collector.sh"], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              EVIDENCE_PATH: nasPath,
              EVIDENCE_DIR: sourceDir
            },
            stdio: "pipe"
          });
        } catch (error) {
          stderr = String((error as { stderr?: Buffer }).stderr ?? "");
          throw error;
        }
      },
      /Command failed/
    );
    assert.match(stderr, /Screenshot evidence has invalid file signature/);
    assert.equal(existsSync(path.join(tempRoot, "evidence", "admin-web.png")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("NAS target collector rejects empty attachments before copying evidence", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-collector-empty-"));
  const sourceDir = path.join(tempRoot, "source-attachments");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(path.join(sourceDir, "admin-web.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "worker.log"), "");
    writeFileSync(path.join(sourceDir, "current-json.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "smb-permissions.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "50-editor-report.json"), "{}\n");

    let stderr = "";
    assert.throws(
      () => {
        try {
          execFileSync("sh", ["scripts/acceptance/nas-acc-009-collector.sh"], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              EVIDENCE_PATH: nasPath,
              EVIDENCE_DIR: sourceDir
            },
            stdio: "pipe"
          });
        } catch (error) {
          stderr = String((error as { stderr?: Buffer }).stderr ?? "");
          throw error;
        }
      },
      /Command failed/
    );
    assert.match(stderr, /Evidence attachment file must not be empty/);
    assert.equal(existsSync(path.join(tempRoot, "evidence", "worker.log")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("NAS target collector rejects malformed JSON reports before copying evidence", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-collector-bad-json-"));
  const sourceDir = path.join(tempRoot, "source-attachments");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(path.join(sourceDir, "admin-web.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "worker.log"), WORKER_LOG_WITH_COUNT_REFRESH_INTERVAL);
    writeFileSync(path.join(sourceDir, "current-json.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "smb-permissions.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "50-editor-report.json"), "{not valid json}\n");

    let stderr = "";
    assert.throws(
      () => {
        try {
          execFileSync("sh", ["scripts/acceptance/nas-acc-009-collector.sh"], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              EVIDENCE_PATH: nasPath,
              EVIDENCE_DIR: sourceDir
            },
            stdio: "pipe"
          });
        } catch (error) {
          stderr = String((error as { stderr?: Buffer }).stderr ?? "");
          throw error;
        }
      },
      /Command failed/
    );
    assert.match(stderr, /JSON evidence must parse as valid JSON before copying/);
    assert.equal(existsSync(path.join(tempRoot, "evidence", "50-editor-report.json")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("NAS target collector rejects weak 50-editor reports before copying evidence", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-collector-weak-report-"));
  const sourceDir = path.join(tempRoot, "source-attachments");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(path.join(sourceDir, "admin-web.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "worker.log"), WORKER_LOG_WITH_COUNT_REFRESH_INTERVAL);
    writeFileSync(path.join(sourceDir, "current-json.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "smb-permissions.png"), MINIMAL_PNG);
    const weakReport = completeNasConcurrencyReport();
    weakReport.all_searches_passed = false;
    ((weakReport.metrics as Record<string, unknown>).search as Record<string, unknown>).p95_ms = 1601;
    writeFileSync(path.join(sourceDir, "50-editor-report.json"), `${JSON.stringify(weakReport, null, 2)}\n`);

    let stderr = "";
    assert.throws(
      () => {
        try {
          execFileSync("sh", ["scripts/acceptance/nas-acc-009-collector.sh"], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              EVIDENCE_PATH: nasPath,
              EVIDENCE_DIR: sourceDir
            },
            stdio: "pipe"
          });
        } catch (error) {
          stderr = String((error as { stderr?: Buffer }).stderr ?? "");
          throw error;
        }
      },
      /Command failed/
    );
    assert.match(stderr, /50-editor report must prove passed 50-editor search\/detail\/cut closed-loop evidence/);
    assert.equal(existsSync(path.join(tempRoot, "evidence", "50-editor-report.json")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("NAS target collector rejects 50-editor reports with mismatched aggregate counts", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-collector-aggregate-counts-"));
  const sourceDir = path.join(tempRoot, "source-attachments");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(path.join(sourceDir, "admin-web.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "worker.log"), WORKER_LOG_WITH_COUNT_REFRESH_INTERVAL);
    writeFileSync(path.join(sourceDir, "current-json.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "smb-permissions.png"), MINIMAL_PNG);
    writeFileSync(
      path.join(sourceDir, "50-editor-report.json"),
      `${JSON.stringify({
        ...completeNasConcurrencyReport(),
        editor_count: 51
      }, null, 2)}\n`
    );

    let stderr = "";
    assert.throws(
      () => {
        try {
          execFileSync("sh", ["scripts/acceptance/nas-acc-009-collector.sh"], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              EVIDENCE_PATH: nasPath,
              EVIDENCE_DIR: sourceDir
            },
            stdio: "pipe"
          });
        } catch (error) {
          stderr = String((error as { stderr?: Buffer }).stderr ?? "");
          throw error;
        }
      },
      /Command failed/
    );
    assert.match(stderr, /50-editor report must prove passed 50-editor search\/detail\/cut closed-loop evidence/);
    assert.equal(existsSync(path.join(tempRoot, "evidence", "50-editor-report.json")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("NAS target collector rejects 50-editor reports whose selected text range misses the search hit", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-collector-selected-range-"));
  const sourceDir = path.join(tempRoot, "source-attachments");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(path.join(sourceDir, "admin-web.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "worker.log"), WORKER_LOG_WITH_COUNT_REFRESH_INTERVAL);
    writeFileSync(path.join(sourceDir, "current-json.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "smb-permissions.png"), MINIMAL_PNG);
    const report = completeNasConcurrencyReport();
    const sessions = (report.editor_sessions as Record<string, unknown>[]).map((session) => ({ ...session }));
    sessions[0] = {
      ...sessions[0]!,
      selected_text_begin_char: 4,
      selected_text_end_char: 24
    };
    writeFileSync(
      path.join(sourceDir, "50-editor-report.json"),
      `${JSON.stringify({ ...report, editor_sessions: sessions }, null, 2)}\n`
    );

    let stderr = "";
    assert.throws(
      () => {
        try {
          execFileSync("sh", ["scripts/acceptance/nas-acc-009-collector.sh"], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              EVIDENCE_PATH: nasPath,
              EVIDENCE_DIR: sourceDir
            },
            stdio: "pipe"
          });
        } catch (error) {
          stderr = String((error as { stderr?: Buffer }).stderr ?? "");
          throw error;
        }
      },
      /Command failed/
    );
    assert.match(stderr, /50-editor report must prove passed 50-editor search\/detail\/cut closed-loop evidence/);
    assert.equal(existsSync(path.join(tempRoot, "evidence", "50-editor-report.json")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("NAS target collector rejects 50-editor reports whose search hit hash misses the query", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-collector-hit-hash-"));
  const sourceDir = path.join(tempRoot, "source-attachments");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(path.join(sourceDir, "admin-web.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "worker.log"), WORKER_LOG_WITH_COUNT_REFRESH_INTERVAL);
    writeFileSync(path.join(sourceDir, "current-json.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "smb-permissions.png"), MINIMAL_PNG);
    const report = completeNasConcurrencyReport();
    const sessions = (report.editor_sessions as Record<string, unknown>[]).map((session) => ({ ...session }));
    sessions[0] = {
      ...sessions[0]!,
      search_result_text_sha256: "d".repeat(64)
    };
    writeFileSync(
      path.join(sourceDir, "50-editor-report.json"),
      `${JSON.stringify({ ...report, editor_sessions: sessions }, null, 2)}\n`
    );

    let stderr = "";
    assert.throws(
      () => {
        try {
          execFileSync("sh", ["scripts/acceptance/nas-acc-009-collector.sh"], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              EVIDENCE_PATH: nasPath,
              EVIDENCE_DIR: sourceDir
            },
            stdio: "pipe"
          });
        } catch (error) {
          stderr = String((error as { stderr?: Buffer }).stderr ?? "");
          throw error;
        }
      },
      /Command failed/
    );
    assert.match(stderr, /50-editor report must prove passed 50-editor search\/detail\/cut closed-loop evidence/);
    assert.equal(existsSync(path.join(tempRoot, "evidence", "50-editor-report.json")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("NAS target collector rejects 50-editor reports with target run roots", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-collector-run-root-report-"));
  const sourceDir = path.join(tempRoot, "source-attachments");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(path.join(sourceDir, "admin-web.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "worker.log"), WORKER_LOG_WITH_COUNT_REFRESH_INTERVAL);
    writeFileSync(path.join(sourceDir, "current-json.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "smb-permissions.png"), MINIMAL_PNG);
    writeFileSync(
      path.join(sourceDir, "50-editor-report.json"),
      `${JSON.stringify({
        ...completeNasConcurrencyReport(),
        library_root: "/volume1/MixLab/AcceptanceRuns/library",
        workspace_root: "/volume1/MixLab/AcceptanceRuns/workspace",
        searchd_cache_root: "/volume1/MixLab/AcceptanceRuns/searchd-cache"
      }, null, 2)}\n`
    );

    let stderr = "";
    assert.throws(
      () => {
        try {
          execFileSync("sh", ["scripts/acceptance/nas-acc-009-collector.sh"], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              EVIDENCE_PATH: nasPath,
              EVIDENCE_DIR: sourceDir
            },
            stdio: "pipe"
          });
        } catch (error) {
          stderr = String((error as { stderr?: Buffer }).stderr ?? "");
          throw error;
        }
      },
      /Command failed/
    );
    assert.match(stderr, /50-editor report must prove passed 50-editor search\/detail\/cut closed-loop evidence/);
    assert.equal(existsSync(path.join(tempRoot, "evidence", "50-editor-report.json")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("NAS target collector rejects 50-editor reports without unique workspaces", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-collector-duplicate-workspace-"));
  const sourceDir = path.join(tempRoot, "source-attachments");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(path.join(sourceDir, "admin-web.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "worker.log"), WORKER_LOG_WITH_COUNT_REFRESH_INTERVAL);
    writeFileSync(path.join(sourceDir, "current-json.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "smb-permissions.png"), MINIMAL_PNG);
    const report = completeNasConcurrencyReport();
    const sessions = (report.editor_sessions as Record<string, unknown>[]).map((session) => ({ ...session }));
	    sessions[1] = {
	      ...sessions[1],
	      workspace_id: sessions[0]!.workspace_id,
	      source_video_id: sessions[0]!.source_video_id,
	      search_result_source_video_id: sessions[0]!.source_video_id
	    };
    writeFileSync(
      path.join(sourceDir, "50-editor-report.json"),
      `${JSON.stringify({ ...report, editor_sessions: sessions }, null, 2)}\n`
    );

    let stderr = "";
    assert.throws(
      () => {
        try {
          execFileSync("sh", ["scripts/acceptance/nas-acc-009-collector.sh"], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              EVIDENCE_PATH: nasPath,
              EVIDENCE_DIR: sourceDir
            },
            stdio: "pipe"
          });
        } catch (error) {
          stderr = String((error as { stderr?: Buffer }).stderr ?? "");
          throw error;
        }
      },
      /Command failed/
    );
    assert.match(stderr, /50-editor report must prove passed 50-editor search\/detail\/cut closed-loop evidence/);
    assert.equal(existsSync(path.join(tempRoot, "evidence", "50-editor-report.json")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("NAS target collector derives multi-user fields from a complete 50-editor report", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-collector-report-"));
  const sourceDir = path.join(tempRoot, "source-attachments");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(path.join(sourceDir, "admin-web.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "worker.log"), WORKER_LOG_WITH_COUNT_REFRESH_INTERVAL);
    writeFileSync(path.join(sourceDir, "current-json.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "smb-permissions.png"), MINIMAL_PNG);
    writeFileSync(
      path.join(sourceDir, "50-editor-report.json"),
      `${JSON.stringify(completeNasConcurrencyReport(), null, 2)}\n`
    );

    execFileSync("sh", ["scripts/acceptance/nas-acc-009-collector.sh"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        EVIDENCE_PATH: nasPath,
        EVIDENCE_DIR: sourceDir
      }
    });

    const evidence = JSON.parse(readFileSync(nasPath, "utf8"));
    assert.deepEqual(evidence.multi_user, {
      editor_session_count: 50,
      all_searches_passed: true,
      all_cuts_written_to_local_workspaces: true,
      public_library_not_written_by_cutters: true,
      no_cross_workspace_outputs: true
    });
    assert.equal(evidence.evidence_files.multi_user_search_cut_report, "evidence/50-editor-report.json");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("NAS target collector auto-captures worker logs from docker compose", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-collector-logs-"));
  const sourceDir = path.join(tempRoot, "source-attachments");
  const binDir = path.join(tempRoot, "bin");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(path.join(sourceDir, "admin-web.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "current-json.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "smb-permissions.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "50-editor-report.json"), `${JSON.stringify(completeNasConcurrencyReport(), null, 2)}\n`);
    const dockerPath = path.join(binDir, "docker");
    writeFileSync(
      dockerPath,
      "#!/bin/sh\nprintf '%s\\n' 'admin-worker-loop-started' 'stage api log public workspace ffmpeg ffprobe doctor retry all clear' '  \"count_refresh_interval\": 25'\n"
    );

    execFileSync("chmod", ["755", dockerPath]);
    execFileSync("sh", ["scripts/acceptance/nas-acc-009-collector.sh"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL: "25",
        EVIDENCE_PATH: nasPath,
        EVIDENCE_DIR: sourceDir
      }
    });

    const evidence = JSON.parse(readFileSync(nasPath, "utf8"));
    assert.equal(evidence.evidence_files.worker_log_excerpt, "evidence/worker.log");
    const workerLog = readFileSync(path.join(tempRoot, "evidence", "worker.log"), "utf8");
    assert.match(workerLog, /admin-worker-loop-started/);
    assert.match(workerLog, /stage api log public workspace ffmpeg ffprobe doctor retry all clear/);
    assert.match(workerLog, /"count_refresh_interval": 25/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("NAS target collector rejects forbidden private data before copying text evidence", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-collector-private-"));
  const sourceDir = path.join(tempRoot, "source-attachments");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(path.join(sourceDir, "admin-web.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "worker.log"), "stage api log Authorization: Bearer sk-live-secret-token\n");
    writeFileSync(path.join(sourceDir, "current-json.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "smb-permissions.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "50-editor-report.json"), "{}\n");

    let stderr = "";
    assert.throws(
      () => {
        try {
          execFileSync("sh", ["scripts/acceptance/nas-acc-009-collector.sh"], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              EVIDENCE_PATH: nasPath,
              EVIDENCE_DIR: sourceDir
            },
            stdio: "pipe"
          });
        } catch (error) {
          stderr = String((error as { stderr?: Buffer }).stderr ?? "");
          throw error;
        }
      },
      /Command failed/
    );
    assert.match(stderr, /Text evidence contains forbidden secret\/private data/);
    assert.equal(existsSync(path.join(tempRoot, "evidence", "worker.log")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("NAS target collector rejects forbidden private data in auto-captured worker logs", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-nas-collector-auto-private-"));
  const sourceDir = path.join(tempRoot, "source-attachments");
  const binDir = path.join(tempRoot, "bin");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(path.join(sourceDir, "admin-web.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "current-json.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "smb-permissions.png"), MINIMAL_PNG);
    writeFileSync(path.join(sourceDir, "50-editor-report.json"), "{}\n");
    const dockerPath = path.join(binDir, "docker");
    writeFileSync(
      dockerPath,
      "#!/bin/sh\nprintf '%s\\n' 'admin-worker-loop-started' 'stage api log pasted_search_text should not be copied'\n"
    );
    execFileSync("chmod", ["755", dockerPath]);

    let stderr = "";
    assert.throws(
      () => {
        try {
          execFileSync("sh", ["scripts/acceptance/nas-acc-009-collector.sh"], {
            cwd: process.cwd(),
            env: {
              ...process.env,
              PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
              EVIDENCE_PATH: nasPath,
              EVIDENCE_DIR: sourceDir
            },
            stdio: "pipe"
          });
        } catch (error) {
          stderr = String((error as { stderr?: Buffer }).stderr ?? "");
          throw error;
        }
      },
      /Command failed/
    );
    assert.match(stderr, /Text evidence contains forbidden secret\/private data/);
    assert.equal(existsSync(path.join(tempRoot, "evidence", "worker.log")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("searchd concurrency smoke writes a final-gate compatible NAS report file", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-searchd-report-output-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");
  const smokeReportPath = path.join(tempRoot, "captures", "50-editor-report.json");

  try {
    writeFileSync(windowsPath, `${JSON.stringify(completeWindowsAcceptanceEvidence(), null, 2)}\n`);
    writeFileSync(nasPath, `${JSON.stringify(completeNasAcceptanceEvidence(), null, 2)}\n`);
    writeCompleteTargetAttachments(tempRoot);

    const resolvedReportPath = await writeSearchdConcurrencyReport(
      completeNasConcurrencyReport(),
      smokeReportPath
    );
    assert.equal(resolvedReportPath, smokeReportPath);
    writeFileSync(
      path.join(tempRoot, "evidence", "50-editor-report.json"),
      readFileSync(smokeReportPath)
    );

    const report = await validateFinalTargetEvidence({ windowsPath, nasPath });
    assert.equal(report.ok, true);
    assert.deepEqual(report.accepted_target_gates, ["ACC-008", "ACC-009"]);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("searchd concurrency report omits target-machine run roots and uses per-editor workspaces", () => {
  const smokeScript = readFileSync("scripts/smoke/searchd-concurrency.ts", "utf8");

  assert.doesNotMatch(
    smokeScript,
    /editor_sessions: editorRuns[\s\S]*library_root: libraryRoot[\s\S]*workspace_root: workspaceRoot[\s\S]*searchd_cache_root: searchdCacheRoot/
  );
  assert.doesNotMatch(
    smokeScript,
    /const workspaceRoot = await createSearchdConcurrencyRunDirectory\("mixlab-searchd-concurrency-workspace-"\)/
  );
  assert.match(smokeScript, /async function startEditorApiRuntime/);
  assert.match(smokeScript, /mixlab-searchd-concurrency-workspace-\$\{input\.editor\.user_id\}-/);
  assert.match(smokeScript, /workspace_root: workspaceRoot/);
  assert.match(smokeScript, /workspace_id: path\.basename\(workspaceRoot\)/);
  assert.match(smokeScript, /const DEFAULT_VIDEO_COUNT = EDITOR_COUNT/);
	  assert.match(smokeScript, /editorApiRuntimes\.push\(\.\.\.await Promise\.all\(editors\.map\(\(editor\) =>/);
	  assert.match(smokeScript, /url: `\$\{editorRuntime\.api_base_url\}\/cutter\/local-clips`/);
	  assert.match(smokeScript, /limit=\$\{EDITOR_COUNT\}/);
	  assert.match(smokeScript, /distinctSourceVideoCount !== EDITOR_COUNT/);
	  assert.match(smokeScript, /match_range: \[number, number\]/);
  assert.match(smokeScript, /search_result_rank: groupIndex \+ 1/);
  assert.match(smokeScript, /search_result_group_count: groups\.length/);
  assert.match(smokeScript, /search_result_limit: EDITOR_COUNT/);
  assert.match(smokeScript, /search_index_version: searchIndexVersion/);
  assert.match(smokeScript, /search_index_version: runtimeSearchIndexVersion/);
  assert.match(smokeScript, /searchd_health_index_version: searchdHealth\.index_version/);
  assert.match(smokeScript, /searchd_health_source_video_count: searchdHealth\.source_video_count/);
  assert.match(smokeScript, /searchd_health_segment_count: searchdHealth\.segment_count/);
  assert.match(smokeScript, /searchResultText !== searchQuery/);
  assert.match(smokeScript, /SEARCH_QUERIES = \["现金流", "利润", "客户", "增长", "品牌"\]/);
  assert.match(smokeScript, /search_query_count: searchQueries\.length/);
  assert.match(smokeScript, /search_query_distribution: searchQueryDistribution\(editorRuns\)/);
  assert.match(smokeScript, /search_result_begin_char: searchResultBeginChar/);
  assert.match(smokeScript, /search_result_end_char: searchResultEndChar/);
  assert.match(smokeScript, /search_result_text_sha256: sha256Hex\(searchResultText\)/);
  assert.match(smokeScript, /full_transcript_source_video_id: fullTranscriptProof\.source_video_id/);
  assert.match(smokeScript, /full_transcript_segment_count: fullTranscriptProof\.segment_count/);
  assert.match(smokeScript, /full_transcript_char_count: fullTranscriptProof\.char_count/);
  assert.match(smokeScript, /full_transcript_text_sha256: fullTranscriptProof\.text_sha256/);
  assert.match(smokeScript, /selected_text_begin_char: selectedSegment\.begin_char/);
  assert.match(smokeScript, /selected_text_end_char: selectedSegment\.end_char/);
  assert.match(smokeScript, /selected_text_char_count: selectedText\.length/);
  assert.match(smokeScript, /local_clip_source_video_id: String\(cut\.value\.data\.source_video_id\)/);
  assert.match(smokeScript, /local_clip_selected_text_sha256: sha256Hex\(String\(cut\.value\.data\.selected_text\)\)/);
  assert.match(smokeScript, /local_clip_relative_path: String\(cut\.value\.data\.relative_path\)/);
  assert.match(smokeScript, /local_clip_file_size_bytes: Number\(cut\.value\.data\.file_size\)/);
  assert.match(smokeScript, /local_clip_content_sha256: String\(cut\.value\.data\.content_hash\)/);
  assert.match(smokeScript, /selected_begin_ms: selectedSegment\.begin_ms/);
  assert.match(smokeScript, /selected_end_ms: selectedSegment\.end_ms/);
  assert.match(smokeScript, /local_clip_begin_ms: Number\(cut\.value\.data\.begin_ms\)/);
  assert.match(smokeScript, /local_clip_end_ms: Number\(cut\.value\.data\.end_ms\)/);
});

test("searchd concurrency smoke can place run artifacts under a target root", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-searchd-run-root-"));
  const previousRunRoot = process.env.MIXLAB_SEARCHD_CONCURRENCY_RUN_ROOT;

  try {
    process.env.MIXLAB_SEARCHD_CONCURRENCY_RUN_ROOT = path.join(tempRoot, "nas-mounted-acceptance");
    const runDir = await createSearchdConcurrencyRunDirectory("mixlab-searchd-concurrency-library-");

    assert.equal(path.dirname(runDir), path.join(tempRoot, "nas-mounted-acceptance"));
    assert.match(path.basename(runDir), /^mixlab-searchd-concurrency-library-/);
    assert.equal(statSync(runDir).isDirectory(), true);
  } finally {
    if (previousRunRoot === undefined) {
      delete process.env.MIXLAB_SEARCHD_CONCURRENCY_RUN_ROOT;
    } else {
      process.env.MIXLAB_SEARCHD_CONCURRENCY_RUN_ROOT = previousRunRoot;
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("packages a standalone target evidence kit with drafts and collectors", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-evidence-kit-"));
  const outputDir = path.join(tempRoot, "kit");

  try {
    await packageAcceptanceEvidenceKit(outputDir);

    const windowsCollector = path.join(outputDir, "windows", "windows-acc-008-collector.ps1");
    const rootManifestPowerShellSelfCheck = path.join(outputDir, "evidence-kit-manifest-self-check.ps1");
    const rootManifestShellSelfCheck = path.join(outputDir, "evidence-kit-manifest-self-check.sh");
    const windowsSelfCheck = path.join(outputDir, "windows", "windows-evidence-self-check.ps1");
    const nasCollector = path.join(outputDir, "nas", "nas-acc-009-collector.sh");
    const nasSelfCheck = path.join(outputDir, "nas", "nas-evidence-self-check.sh");
    const nasReportSelfCheck = path.join(outputDir, "nas", "nas-50-editor-report-self-check.sh");
    const windowsDraft = JSON.parse(readFileSync(path.join(outputDir, "windows", "windows-acc-008.json"), "utf8"));
    const nasDraft = JSON.parse(readFileSync(path.join(outputDir, "nas", "nas-acc-009.json"), "utf8"));
    const testerChecklist = readFileSync(path.join(outputDir, "TESTER-CHECKLIST.md"), "utf8");
    const windowsCapturesReadme = readFileSync(path.join(outputDir, "windows", "captures", "README.md"), "utf8");
    const nasReadme = readFileSync(path.join(outputDir, "nas", "README.md"), "utf8");
    const nasReportDraft = JSON.parse(readFileSync(path.join(outputDir, "nas", "captures", "50-editor-report.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(path.join(outputDir, "MANIFEST.json"), "utf8")) as {
      schema_version: number;
      artifact_name: string;
      generated_by: string;
      source_commit_sha: string;
      github_actions_run_url: string;
      files: Array<{
        path: string;
        sha256: string;
        size_bytes: number;
        executable: boolean;
      }>;
    };
    const manifestFiles = new Map(manifest.files.map((file) => [file.path, file]));
    const optionalLocalReports = OPTIONAL_LOCAL_SOURCE_REPORTS.filter((report) => existsSync(report.source_path));
    const optionalManifestPaths = optionalLocalReports.length > 0
      ? ["local/README.md", ...optionalLocalReports.map((report) => report.kit_path)]
      : [];

    assert.equal(existsSync(path.join(outputDir, "README.md")), true);
    const rootReadme = readFileSync(path.join(outputDir, "README.md"), "utf8");
    const cleanManifestReport = await validateEvidenceKitManifest(outputDir);
    assert.equal(cleanManifestReport.ok, true, cleanManifestReport.errors.join("\n"));
    assert.equal(cleanManifestReport.file_count, 15 + optionalManifestPaths.length);
    assert.equal(existsSync(path.join(outputDir, "MANIFEST.json")), true);
    assert.equal(manifest.schema_version, 1);
    assert.equal(manifest.artifact_name, TARGET_EVIDENCE_KIT_ARTIFACT_NAME);
    assert.equal(manifest.generated_by, "npm run package:evidence-kit");
    assert.equal(typeof manifest.source_commit_sha, "string");
    assert.equal(typeof manifest.github_actions_run_url, "string");
    assert.equal(manifestFiles.has("MANIFEST.json"), false);
    assert.deepEqual(
      manifest.files.map((file) => file.path),
      [...manifest.files.map((file) => file.path)].sort((a, b) => a.localeCompare(b))
    );
    for (const requiredManifestPath of [
      "README.md",
      "TESTER-CHECKLIST.md",
      "evidence-kit-manifest-self-check.ps1",
      "evidence-kit-manifest-self-check.sh",
      "windows/README.md",
      "windows/captures/README.md",
      "windows/windows-acc-008-collector.ps1",
      "windows/windows-evidence-self-check.ps1",
      "windows/windows-acc-008.json",
      "nas/README.md",
      "nas/nas-acc-009-collector.sh",
      "nas/nas-evidence-self-check.sh",
      "nas/nas-50-editor-report-self-check.sh",
      "nas/nas-acc-009.json",
      "nas/captures/50-editor-report.json",
      ...optionalManifestPaths
    ]) {
      const file = manifestFiles.get(requiredManifestPath);
      assert.ok(file, `${requiredManifestPath} must be listed in MANIFEST.json`);
      assert.match(file.sha256, /^[a-f0-9]{64}$/);
      assert.equal(file.size_bytes, statSync(path.join(outputDir, ...requiredManifestPath.split("/"))).size);
      assert.equal(file.sha256, sha256File(path.join(outputDir, ...requiredManifestPath.split("/"))));
    }
    assert.equal(manifestFiles.get("nas/nas-acc-009-collector.sh")?.executable, true);
    assert.equal(manifestFiles.get("nas/nas-evidence-self-check.sh")?.executable, true);
    assert.equal(manifestFiles.get("nas/nas-50-editor-report-self-check.sh")?.executable, true);
    assert.equal(manifestFiles.get("evidence-kit-manifest-self-check.sh")?.executable, true);
    assert.equal(manifestFiles.get("evidence-kit-manifest-self-check.ps1")?.executable, false);
    assert.equal(manifestFiles.get("nas/captures/50-editor-report.json")?.executable, false);
    for (const shellScriptPath of [
      rootManifestShellSelfCheck,
      nasCollector,
      nasSelfCheck,
      nasReportSelfCheck
    ]) {
      assert.equal(readFileSync(shellScriptPath, "utf8").includes("\r\n"), false);
    }
    for (const report of optionalLocalReports) {
      assert.equal(
        readFileSync(path.join(outputDir, ...report.kit_path.split("/")), "utf8"),
        readFileSync(report.source_path, "utf8")
      );
    }
    if (optionalLocalReports.length > 0) {
      const localReadme = readFileSync(path.join(outputDir, "local", "README.md"), "utf8");
      assert.match(localReadme, /source-machine reports/);
      assert.match(localReadme, /local-web-real-nas\.md/);
      assert.match(localReadme, /local-web-sanity\.json/);
      assert.match(localReadme, /real-nas-50-editor-report\.json/);
      assert.match(localReadme, /sync:local-real-nas-record/);
      assert.match(localReadme, /source-videos Web UI proof/);
      assert.match(localReadme, /source_video_web_first_id/);
      assert.match(localReadme, /source_video_web_loaded_after/);
      assert.match(localReadme, /source_video_web_query_response_observed/);
      assert.match(localReadme, /source_video_web_ready_filter_all_visible_rows_ready/);
      assert.match(localReadme, /dashboard_write_action_lock_labels/);
      assert.match(localReadme, /智能扫描/);
      assert.match(localReadme, /source_video_write_action_lock_labels/);
      assert.match(localReadme, /重试此视频/);
      assert.match(localReadme, /保存封面/);
      assert.match(localReadme, /保存公开说明/);
      assert.match(localReadme, /preprocess_safety_labels/);
      assert.match(localReadme, /preprocess_write_action_lock_labels/);
      assert.match(localReadme, /真实 NAS 安全边界/);
      assert.match(localReadme, /真实 NAS 写入动作|启动预处理流水线/);
      assert.match(localReadme, /selection_proof_text/);
      assert.match(localReadme, /selected_text_is_broader_than_query=true/);
      assert.match(localReadme, /local_clip_id/);
      assert.match(localReadme, /cut_job_id/);
      assert.match(localReadme, /public_library_write_detected=false/);
      assert.match(localReadme, /ACC-008\/ACC-009 combined gate/);
    } else {
      assert.equal(existsSync(path.join(outputDir, "local")), false);
    }
    assert.equal(
      readFileSync(rootManifestPowerShellSelfCheck, "utf8"),
      readFileSync("scripts/acceptance/evidence-kit-manifest-self-check.ps1", "utf8")
    );
    assert.equal(
      readFileSync(rootManifestShellSelfCheck, "utf8"),
      normalizeLf(readFileSync("scripts/acceptance/evidence-kit-manifest-self-check.sh", "utf8"))
    );
    assert.match(readFileSync(rootManifestPowerShellSelfCheck, "utf8"), /Get-FileHash/);
    assert.match(readFileSync(rootManifestShellSelfCheck, "utf8"), /sha256 does not match the packaged file/);
    assert.match(
      execFileSync("sh", [rootManifestShellSelfCheck, outputDir], { encoding: "utf8" }),
      /MixLab evidence kit manifest self-check passed/
    );
    writeFileSync(path.join(outputDir, "nas", "README.md"), `${nasReadme}\nchanged after manifest\n`);
    writeFileSync(path.join(outputDir, "unexpected.txt"), "not listed in manifest\n");
    const tamperedManifestReport = await validateEvidenceKitManifest(outputDir);
    assert.equal(tamperedManifestReport.ok, false);
    assert.match(tamperedManifestReport.errors.join("\n"), /nas\/README\.md sha256 does not match/);
    assert.match(tamperedManifestReport.errors.join("\n"), /unexpected\.txt exists in the evidence kit but is not listed in MANIFEST\.json/);
    try {
      execFileSync("sh", [rootManifestShellSelfCheck, outputDir], { encoding: "utf8" });
      assert.fail("tampered evidence kit manifest self-check must not pass");
    } catch (error) {
      const selfCheckOutput = String((error as { stdout?: unknown }).stdout ?? "");
      assert.match(selfCheckOutput, /MixLab evidence kit manifest self-check found/);
      assert.match(selfCheckOutput, /nas\/README\.md sha256 does not match/);
      assert.match(selfCheckOutput, /unexpected\.txt exists in the evidence kit but is not listed in MANIFEST\.json/);
    }
    assert.match(rootReadme, /MANIFEST\.json/);
    assert.match(rootReadme, /validate:evidence-kit-manifest/);
    assert.match(rootReadme, /validate:evidence-kit-drafts/);
    assert.match(rootReadme, /CI-prefilled installer\/image metadata/);
    assert.match(rootReadme, /evidence-kit-manifest-self-check\.ps1/);
    assert.match(rootReadme, /evidence-kit-manifest-self-check\.sh/);
    assert.match(testerChecklist, /MANIFEST\.json/);
    assert.match(testerChecklist, /validate:evidence-kit-manifest/);
    assert.match(testerChecklist, /validate:evidence-kit-drafts/);
    assert.match(testerChecklist, /evidence-kit-manifest-self-check\.ps1/);
    assert.match(testerChecklist, /evidence-kit-manifest-self-check\.sh/);
    assert.match(rootReadme, /target machines do not need the MixLab source repository/);
    assert.match(rootReadme, /artifact_provenance\.repository_commit_sha/);
    assert.match(rootReadme, /prefilled from GITHUB_SHA/);
    assert.match(rootReadme, /preserves the prefilled provenance/);
    assert.match(rootReadme, /Attachment filenames must match their evidence fields/);
    assert.match(rootReadme, /deployment\.image_tag/);
    assert.match(rootReadme, /installer workflow run URL, version, file name, and SHA-256 digest/);
    assert.match(rootReadme, /deployment\.preprocess_count_refresh_interval/);
    assert.match(rootReadme, /admin_source_videos_ui/);
    assert.match(rootReadme, /deployed NAS admin source-videos page/);
    assert.match(rootReadme, /worker_log_excerpt must include count_refresh_interval/);
    assert.match(rootReadme, /same repository commit/);
    assert.match(rootReadme, /github\.com\/alin155\/mixlab/);
    assert.match(rootReadme, /2,000 indexed source videos/);
    assert.match(rootReadme, /48,000 indexed transcript segments/);
    assert.match(rootReadme, /50 distinct source_video_id values/);
    assert.match(rootReadme, /top-level pass flags/);
    assert.match(rootReadme, /positive search_sla_ms, detail_sla_ms, and cut_sla_ms/);
    assert.match(rootReadme, /min_ms <= p50_ms <= p95_ms <= max_ms/);
	    assert.match(rootReadme, /editor_count and active_user_count equal to editor_sessions\.length/);
	    assert.match(rootReadme, /50 distinct source_video_id values/);
	    assert.match(rootReadme, /distinct_source_video_count equal to the unique source_video_id values/);
    assert.match(rootReadme, /latency count equal to editor_sessions\.length/);
    assert.match(rootReadme, /latency max_ms at least the maximum matching per-editor timing/);
    assert.match(rootReadme, /usage counts[\s\S]*at least editor_sessions\.length/);
    assert.match(rootReadme, /metrics\.usage\.search_failure_count equal to 0/);
    assert.match(rootReadme, /search hit to full transcript location/);
    assert.match(rootReadme, /search_result_begin_char\/search_result_end_char/);
    assert.match(rootReadme, /search_result_rank/);
    assert.match(rootReadme, /search_result_group_count at least search_result_limit/);
    assert.match(rootReadme, /search_result_limit at least 50/);
    assert.match(rootReadme, /search_index_version/);
    assert.match(rootReadme, /search_result_text_sha256 equal to sha256\(search_query\)/);
    assert.match(rootReadme, /full_transcript_source_video_id matching source_video_id/);
    assert.match(rootReadme, /full_transcript_segment_count at least 4/);
    assert.match(rootReadme, /full_transcript_char_count greater than selected_text_char_count/);
    assert.match(rootReadme, /full_transcript_text_sha256/);
    assert.match(rootReadme, /selected_text_begin_char\/selected_text_end_char/);
    assert.match(rootReadme, /selected_text_char_count equal to selected range length/);
    assert.match(rootReadme, /local_clip_source_video_id matching source_video_id/);
    assert.match(rootReadme, /local_clip_selected_text_sha256 equal to selected_text_sha256/);
    assert.match(rootReadme, /local_clip_relative_path as a workspace-relative portable path/);
    assert.match(rootReadme, /local_clip_file_size_bytes as positive output file size/);
    assert.match(rootReadme, /local_clip_content_sha256 as output file sha256/);
    assert.match(rootReadme, /local_clip_begin_ms\/local_clip_end_ms matching selected_begin_ms\/selected_end_ms/);
    assert.match(rootReadme, /640x360/);
    assert.match(rootReadme, /npm run smoke:searchd-nas-rehearsal/);
    assert.match(rootReadme, /MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL=25/);
    assert.match(rootReadme, /unique user_id[\s\S]*unique workspace_id/);
    assert.match(rootReadme, /target-machine run root fields/);
    assert.match(rootReadme, /library_root[\s\S]*workspace_root[\s\S]*searchd_cache_root/);
    assert.match(rootReadme, /copy the completed evidence package back/);
    assert.match(rootReadme, /windows-evidence-self-check\.ps1/);
    assert.match(rootReadme, /nas-evidence-self-check\.sh/);
    assert.match(rootReadme, /nas-50-editor-report-self-check\.sh/);
    assert.match(rootReadme, /TESTER-CHECKLIST\.md/);
    assert.match(rootReadme, /local web sanity checks/);
    assert.match(rootReadme, /npm run audit:local-web-sanity/);
    assert.match(rootReadme, /admin dashboard core-path/);
    assert.match(rootReadme, /50-editor capacity signals/);
    assert.match(rootReadme, /admin_dashboard\.active_cutter_count/);
    assert.match(rootReadme, /admin_dashboard\.cutter_capacity/);
    assert.match(rootReadme, /capacity at least 50/);
    assert.match(rootReadme, /admin_dashboard\.disabled_write_action_labels/);
    assert.match(rootReadme, /智能扫描/);
    assert.match(rootReadme, /admin_dashboard\.search_p95_ms/);
    assert.match(rootReadme, /1000ms/);
    assert.match(rootReadme, /admin_dashboard\.local_search_coverage_percent/);
    assert.match(rootReadme, /80%/);
    assert.match(rootReadme, /admin_dashboard\.search_failure_count/);
    assert.match(rootReadme, /material_locator\.current_hit_time_ms_value/);
    assert.match(rootReadme, /material_locator\.global_hit_position/);
    assert.match(rootReadme, /material_locator\.global_hit_count/);
    assert.match(rootReadme, /material_locator\.current_video_hit_count/);
    assert.match(rootReadme, /material_locator\.selected_sentence_count/);
    assert.match(rootReadme, /material_locator\.full_transcript_char_count/);
    assert.match(rootReadme, /current-video hit count not to exceed the global hit count/);
    assert.match(rootReadme, /full transcript character count to exceed the selected transcript text length/);
    assert.match(rootReadme, /material_locator_closed_loop\.selection_proof_text/);
    assert.match(rootReadme, /material_locator_closed_loop\.selection_method/);
    assert.match(rootReadme, /transcript-drag/);
    assert.match(rootReadme, /material_locator_closed_loop\.selected_sentence_count/);
    assert.match(rootReadme, /material_locator_closed_loop\.selected_text_segment_count/);
    assert.match(rootReadme, /at least 2/);
    assert.match(rootReadme, /material_locator_closed_loop\.selected_text_char_count/);
    assert.match(rootReadme, /material_locator_closed_loop\.selected_text_is_broader_than_query/);
    assert.match(rootReadme, /broader sentence context than the query keyword alone/);
    assert.match(rootReadme, /MIXLAB_LOCAL_WEB_SANITY_REPORT/);
    assert.match(rootReadme, /local audit artifact/);
    assert.match(rootReadme, /validate:local-web-sanity-report/);
    assert.match(rootReadme, /sync:local-real-nas-record/);
    assert.match(rootReadme, /npm run audit:local-real-nas-phase/);
    assert.match(rootReadme, /all-or-none/);
    assert.match(rootReadme, /must be committed together/);
    assert.match(rootReadme, /refresh `docs\/acceptance\/local-web-real-nas\.md` from the saved JSON/);
    assert.match(rootReadme, /local Web report[\s\S]*50-editor report[\s\S]*docs\/acceptance\/local-web-real-nas\.md/);
    assert.match(rootReadme, /admin_real_nas_matrix\.source_video_web/);
    assert.match(rootReadme, /source_video_web_first_id/);
    assert.match(rootReadme, /source_video_web_loaded_after/);
    assert.match(rootReadme, /source_video_web_query_response_observed/);
    assert.match(rootReadme, /source_video_web_ready_filter_all_visible_rows_ready/);
    assert.match(rootReadme, /local_web\.dashboard_write_action_lock_labels/);
    assert.match(rootReadme, /clean git diff check/);
    assert.match(rootReadme, /requires committed local source-machine evidence to be all-or-none/);
    assert.match(rootReadme, /local\//);
    assert.match(rootReadme, /local-web-real-nas\.md/);
    assert.match(rootReadme, /real-nas-50-editor-report\.json/);
    assert.match(rootReadme, /preflight\/rehearsal evidence only/);
    assert.match(rootReadme, /do not replace the repository validators/);
    assert.match(rootReadme, /windows-acc-008\.json[\s\S]*screenshots\//);
    assert.match(rootReadme, /nas-acc-009\.json[\s\S]*evidence\//);
    assert.match(rootReadme, /audit:target-evidence-readiness/);
    assert.match(rootReadme, /next_actions/);
    assert.match(rootReadme, /npm run validate:target-evidence/);
    assert.match(testerChecklist, /Local Web Sanity/);
    assert.match(testerChecklist, /http:\/\/127\.0\.0\.1:5176\//);
    assert.match(testerChecklist, /http:\/\/127\.0\.0\.1:5177\//);
    assert.match(testerChecklist, /material-locator\?query=%E7%8E%B0%E9%87%91%E6%B5%81/);
    assert.match(testerChecklist, /npm run audit:local-web-sanity/);
    assert.match(testerChecklist, /Admin dashboard shows core path health/);
    assert.match(testerChecklist, /50-editor capacity/);
    assert.match(testerChecklist, /admin_dashboard\.active_cutter_count/);
    assert.match(testerChecklist, /admin_dashboard\.cutter_capacity/);
    assert.match(testerChecklist, /capacity at least 50/);
    assert.match(testerChecklist, /admin_dashboard\.disabled_write_action_labels/);
    assert.match(testerChecklist, /智能扫描/);
    assert.match(testerChecklist, /search p95/);
    assert.match(testerChecklist, /admin_dashboard\.search_p95_ms/);
    assert.match(testerChecklist, /1000ms/);
    assert.match(testerChecklist, /admin_dashboard\.local_search_coverage_percent/);
    assert.match(testerChecklist, /80%/);
    assert.match(testerChecklist, /admin_dashboard\.search_failure_count/);
    assert.match(testerChecklist, /material_locator\.current_hit_time_ms_value/);
    assert.match(testerChecklist, /material_locator\.global_hit_position/);
    assert.match(testerChecklist, /material_locator\.global_hit_count/);
    assert.match(testerChecklist, /material_locator\.current_video_hit_count/);
    assert.match(testerChecklist, /material_locator\.selected_sentence_count/);
    assert.match(testerChecklist, /material_locator\.full_transcript_char_count/);
    assert.match(testerChecklist, /current-video hit count no higher than global hit count/);
    assert.match(testerChecklist, /full transcript character count greater than selected transcript text length/);
    assert.match(testerChecklist, /selected_text_char_count/);
    assert.match(testerChecklist, /material_locator_closed_loop\.selection_method = transcript-drag/);
    assert.match(testerChecklist, /material_locator_closed_loop\.selected_sentence_count at least 2/);
    assert.match(testerChecklist, /material_locator_closed_loop\.selected_text_segment_count at least 2/);
    assert.match(testerChecklist, /selected_text_is_broader_than_query/);
    assert.match(testerChecklist, /selected sentence context broader than the query keyword alone/);
    assert.match(testerChecklist, /selected transcript text broader than the query keyword alone/);
    assert.match(testerChecklist, /local search coverage/);
    assert.match(testerChecklist, /MIXLAB_ADMIN_WEB_URL/);
    assert.match(testerChecklist, /MIXLAB_CUTTER_WEB_URL/);
    assert.match(testerChecklist, /MIXLAB_LOCAL_WEB_SANITY_QUERY/);
    assert.match(testerChecklist, /MIXLAB_LOCAL_WEB_SANITY_REPORT/);
    assert.match(testerChecklist, /validate:local-web-sanity-report/);
    assert.match(testerChecklist, /sync:local-real-nas-record/);
    assert.match(testerChecklist, /audit:local-real-nas-phase/);
    assert.match(testerChecklist, /local-web-sanity\.json/);
    assert.match(testerChecklist, /selects a transcript hit/);
    assert.match(testerChecklist, /exports the selected sentence context/);
    assert.match(testerChecklist, /local library contains the selected text/);
    assert.match(testerChecklist, /local reusable materials appear before public materials/);
    assert.match(testerChecklist, /Material Locator/);
    assert.match(testerChecklist, /exact current hit time/);
    assert.match(testerChecklist, /global hit position/);
    assert.match(testerChecklist, /current-video hit count/);
    assert.match(testerChecklist, /selected sentence count/);
    assert.match(testerChecklist, /full transcript character count/);
    assert.match(testerChecklist, /continuous transcript text[\s\S]*broader than the keyword alone/);
    assert.match(testerChecklist, /Windows ACC-008/);
    assert.match(testerChecklist, /Windows 10[\s\S]*Windows 11/);
    assert.match(testerChecklist, /windows-acc-008-collector\.ps1/);
    assert.match(testerChecklist, /windows-evidence-self-check\.ps1/);
    assert.match(testerChecklist, /NAS ACC-009/);
    assert.match(testerChecklist, /admin_source_videos_ui/);
    assert.match(testerChecklist, /ready filter observes the API response with only ready rows/);
    assert.match(testerChecklist, /2,000 indexed source videos/);
    assert.match(testerChecklist, /48,000 indexed transcript segments/);
    assert.match(testerChecklist, /50\+ editor searchd flow/);
    assert.match(testerChecklist, /nas-50-editor-report-self-check\.sh/);
    assert.match(testerChecklist, /nas-acc-009-collector\.sh/);
    assert.match(testerChecklist, /nas-evidence-self-check\.sh/);
    assert.match(testerChecklist, /validate:windows-evidence/);
    assert.match(testerChecklist, /validate:nas-evidence/);
    assert.match(testerChecklist, /audit:target-evidence-readiness/);
    assert.match(testerChecklist, /attachment counts/);
    assert.match(testerChecklist, /validate:target-evidence/);
    assert.match(testerChecklist, /audit:delivery-readiness/);
    assert.match(testerChecklist, /ASR keys[\s\S]*signed URLs[\s\S]*private transcripts[\s\S]*bearer tokens/);
    assert.match(readFileSync(windowsCollector, "utf8"), /#requires -Version 5\.1/);
    const windowsSelfCheckScript = readFileSync(windowsSelfCheck, "utf8");
    assert.equal(windowsSelfCheckScript, readFileSync("scripts/acceptance/windows-evidence-self-check.ps1", "utf8"));
    assert.match(windowsSelfCheckScript, /Test-DraftMarkers/);
    assert.match(windowsSelfCheckScript, /MinScreenshotWidth/);
    assert.match(windowsSelfCheckScript, /Test-ScreenshotAttachment/);
    assert.match(windowsSelfCheckScript, /missing\/fake\/undersized referenced screenshots/);
    assert.match(windowsSelfCheckScript, /RequiredDiagnosticTerms/);
    assert.match(windowsSelfCheckScript, /forbidden secret\/private data/);
    assert.match(windowsSelfCheckScript, /target-side self-check/);
    const windowsReadme = readFileSync(path.join(outputDir, "windows", "README.md"), "utf8");
    assert.match(windowsReadme, /windows-evidence-self-check\.ps1/);
    assert.match(windowsReadme, /only a fast local sanity check/);
    assert.match(windowsReadme, /missing\/fake\/undersized screenshot attachments/);
    assert.match(windowsReadme, /diagnostics samples missing the required/);
    assert.match(windowsReadme, /RequireCurrentEnvironmentComplete/);
    assert.match(windowsReadme, /InstallerFilePath/);
    assert.match(windowsReadme, /installer\.file_sha256/);
    assert.match(windowsReadme, /installer file name must include the recorded InstallerVersion/);
    assert.match(windowsReadme, /AllPublicLibraryPathsPassed/);
    assert.match(windowsReadme, /AllFailureCasesPassed/);
    assert.match(windowsReadme, /fails before writing incomplete current-environment evidence/);
    assert.match(windowsReadme, /windows-acc-008\.json[\s\S]*screenshots\/[\s\S]*only the JSON/);
    assert.match(windowsCapturesReadme, /doctor-pass/);
    assert.match(windowsCapturesReadme, /success-diagnostics\.txt/);
    assert.match(readFileSync(nasCollector, "utf8"), /admin-worker-loop-started/);
    const nasSelfCheckScript = readFileSync(nasSelfCheck, "utf8");
    assert.equal(nasSelfCheckScript, normalizeLf(readFileSync("scripts/acceptance/nas-evidence-self-check.sh", "utf8")));
    assert.match(nasSelfCheckScript, /ACC-009 target-side self-check/);
    assert.match(nasSelfCheckScript, /MIN_SCREENSHOT_WIDTH/);
    assert.match(nasSelfCheckScript, /SCREENSHOT_EVIDENCE_FIELDS/);
    assert.match(nasSelfCheckScript, /fake\/undersized screenshots/);
    assert.match(nasSelfCheckScript, /50-editor report status must be passed/);
    assert.match(nasSelfCheckScript, /searchd_health_source_video_count must equal indexed_source_video_count/);
    const nasReportSelfCheckScript = readFileSync(nasReportSelfCheck, "utf8");
    assert.equal(nasReportSelfCheckScript, normalizeLf(readFileSync("scripts/acceptance/nas-50-editor-report-self-check.sh", "utf8")));
    assert.match(nasReportSelfCheckScript, /ACC-009 50-editor report self-check/);
    assert.match(nasReportSelfCheckScript, /search_result_text_sha256 must equal sha256\(search_query\)/);
    assert.match(nasReportSelfCheckScript, /local_clip_relative_path must be a workspace-relative portable path/);
    assert.match(nasReportSelfCheckScript, /workspace_id must be unique per editor/);
    assert.match(nasReportSelfCheckScript, /forbiddenPrivateFieldNames/);
    assert.match(nasReportSelfCheckScript, /full_text/);
    assert.match(nasReportSelfCheckScript, /pasted_search_text/);
    assert.match(nasReportSelfCheckScript, /Authorization:\\s\*Bearer/);
    assert.match(nasReportSelfCheckScript, /signed URL field/);
    assert.match(nasReadme, /npm run smoke:searchd-nas-rehearsal/);
    assert.match(nasReadme, /nas-evidence-self-check\.sh/);
    assert.match(nasReadme, /nas-50-editor-report-self-check\.sh/);
    assert.match(nasReadme, /only a fast local sanity check/);
    assert.match(nasReadme, /fake or undersized screenshot attachments/);
    assert.match(nasReadme, /MIXLAB_SEARCHD_CONCURRENCY_VIDEOS=2000/);
    assert.match(nasReadme, /MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL=25/);
    assert.match(nasReadme, /deployment\.preprocess_count_refresh_interval/);
    assert.match(nasReadme, /ADMIN_SOURCE_VIDEOS_SOURCE_PATH_VISIBLE/);
    assert.match(nasReadme, /ADMIN_SOURCE_VIDEOS_READY_FILTER_ALL_VISIBLE_ROWS_READY/);
    assert.match(nasReadme, /admin_source_videos_ui/);
    assert.match(nasReadme, /query API response plus rendered result/);
    assert.match(nasReadme, /count_refresh_interval does not match deployment\.preprocess_count_refresh_interval/);
    assert.match(nasReadme, /captures\/50-editor-report\.json/);
    assert.match(nasReadme, /local_clip_source_video_id matching source_video_id/);
    assert.match(nasReadme, /local_clip_selected_text_sha256 equal to selected_text_sha256/);
    assert.match(nasReadme, /local_clip_file_size_bytes as positive output file size/);
    assert.match(nasReadme, /local_clip_content_sha256 as output file sha256/);
    assert.match(nasReadme, /metrics\.usage\.search_failure_count equal to 0/);
    assert.match(nasReadme, /library_root[\s\S]*workspace_root[\s\S]*searchd_cache_root/);
    assert.match(nasReadme, /nas-acc-009\.json[\s\S]*evidence\/[\s\S]*only the JSON/);
    assert.equal(nasDraft.deployment.preprocess_count_refresh_interval, 0);
    assert.equal((statSync(nasCollector).mode & 0o111) !== 0, true);
    assert.equal((statSync(nasSelfCheck).mode & 0o111) !== 0, true);
    assert.equal((statSync(nasReportSelfCheck).mode & 0o111) !== 0, true);
    try {
      execFileSync("sh", [nasSelfCheck, path.join(outputDir, "nas", "nas-acc-009.json")], {
        encoding: "utf8"
      });
      assert.fail("draft NAS evidence must not pass the target-side self-check");
    } catch (error) {
      const selfCheckOutput = String((error as { stdout?: unknown }).stdout ?? "");
      assert.match(selfCheckOutput, /ACC-009 target-side self-check found/);
      assert.match(selfCheckOutput, /artifact_provenance\.repository_commit_sha is empty/);
      assert.match(selfCheckOutput, /evidence_files\.multi_user_search_cut_report attachment path is empty/);
      assert.equal(
        selfCheckOutput.match(/evidence_files\.multi_user_search_cut_report attachment path is empty/g)?.length,
        1
      );
    }
    const fakeScreenshotSelfCheckRoot = path.join(tempRoot, "nas-self-check-fake-screenshot");
    mkdirSync(fakeScreenshotSelfCheckRoot, { recursive: true });
    writeJson(path.join(fakeScreenshotSelfCheckRoot, "nas-acc-009.json"), completeNasAcceptanceEvidence());
    writeAttachment(fakeScreenshotSelfCheckRoot, "evidence/admin-web.png", "not actually a png\n");
    writeAttachment(fakeScreenshotSelfCheckRoot, "evidence/current-json.png", MINIMAL_PNG);
    writeAttachment(fakeScreenshotSelfCheckRoot, "evidence/smb-permissions.png", TARGET_SCREENSHOT_PNG);
    writeAttachment(fakeScreenshotSelfCheckRoot, "evidence/worker.log", WORKER_LOG_WITH_COUNT_REFRESH_INTERVAL);
    writeAttachment(
      fakeScreenshotSelfCheckRoot,
      "evidence/50-editor-report.json",
      `${JSON.stringify(completeNasConcurrencyReport(), null, 2)}\n`
    );
    try {
      execFileSync("sh", [nasSelfCheck, path.join(fakeScreenshotSelfCheckRoot, "nas-acc-009.json")], {
        encoding: "utf8"
      });
      assert.fail("NAS target-side self-check must reject fake and undersized screenshots");
    } catch (error) {
      const fakeScreenshotOutput = String((error as { stdout?: unknown }).stdout ?? "");
      assert.match(fakeScreenshotOutput, /admin_web_screenshot screenshot must be a real PNG\/JPEG\/WebP image/);
      assert.match(fakeScreenshotOutput, /current_json_screenshot screenshot must be at least 640x360 but was 1x1/);
    }
    try {
      execFileSync("sh", [nasReportSelfCheck, path.join(outputDir, "nas", "captures", "50-editor-report.json")], {
        encoding: "utf8"
      });
      assert.fail("draft NAS 50-editor report must not pass the target-side report self-check");
    } catch (error) {
      const reportSelfCheckOutput = String((error as { stdout?: unknown }).stdout ?? "");
      assert.match(reportSelfCheckOutput, /ACC-009 50-editor report self-check found/);
      assert.match(reportSelfCheckOutput, /status must be "passed"/);
      assert.match(reportSelfCheckOutput, /indexed_source_video_count must be at least 2000/);
    }
    const completeReportPath = path.join(tempRoot, "complete-50-editor-report.json");
    writeJson(completeReportPath, completeNasConcurrencyReport());
    const reportSelfCheckPassOutput = execFileSync("sh", [nasReportSelfCheck, completeReportPath], {
      encoding: "utf8"
    });
    assert.match(reportSelfCheckPassOutput, /ACC-009 50-editor report self-check passed/);

    const uppercaseHashReport = completeNasConcurrencyReport();
    const uppercaseHashSessions = uppercaseHashReport.editor_sessions as Record<string, unknown>[];
    uppercaseHashSessions[0] = {
      ...uppercaseHashSessions[0],
      search_result_text_sha256: String(uppercaseHashSessions[0]!.search_result_text_sha256).toUpperCase(),
      full_transcript_text_sha256: String(uppercaseHashSessions[0]!.full_transcript_text_sha256).toUpperCase(),
      selected_text_sha256: String(uppercaseHashSessions[0]!.selected_text_sha256).toUpperCase(),
      local_clip_selected_text_sha256: String(uppercaseHashSessions[0]!.local_clip_selected_text_sha256).toUpperCase(),
      local_clip_content_sha256: String(uppercaseHashSessions[0]!.local_clip_content_sha256).toUpperCase()
    };
    const uppercaseHashReportPath = path.join(tempRoot, "uppercase-hash-50-editor-report.json");
    writeJson(uppercaseHashReportPath, uppercaseHashReport);
    assert.match(
      execFileSync("sh", [nasReportSelfCheck, uppercaseHashReportPath], { encoding: "utf8" }),
      /ACC-009 50-editor report self-check passed/
    );

    const duplicateReport = completeNasConcurrencyReport();
    const duplicateSessions = duplicateReport.editor_sessions as Record<string, unknown>[];
    duplicateReport.editor_count = 51;
    duplicateReport.active_user_count = 51;
    duplicateReport.editor_sessions = [
      ...duplicateSessions,
      {
        ...duplicateSessions[0],
        workspace_id: duplicateSessions[1]!.workspace_id
      }
    ];
    const duplicateMetrics = duplicateReport.metrics as Record<string, Record<string, unknown>>;
    duplicateMetrics.search.count = 51;
    duplicateMetrics.detail.count = 51;
    duplicateMetrics.cut.count = 51;
    const duplicateUsage = duplicateMetrics.usage;
    for (const field of [
      "search_request_count",
      "searchd_search_count",
      "source_detail_view_count",
      "transcript_selection_count",
      "cut_submission_count",
      "cut_success_count",
      "local_clip_count"
    ]) {
      duplicateUsage[field] = 51;
    }
    const duplicateReportPath = path.join(tempRoot, "duplicate-50-editor-report.json");
    writeJson(duplicateReportPath, duplicateReport);
    try {
      execFileSync("sh", [nasReportSelfCheck, duplicateReportPath], { encoding: "utf8" });
      assert.fail("duplicate NAS 50-editor report must not pass the target-side report self-check");
    } catch (error) {
      const duplicateOutput = String((error as { stdout?: unknown }).stdout ?? "");
      assert.match(duplicateOutput, /editor_sessions\[50\]\.user_id must be unique/);
      assert.match(duplicateOutput, /editor_sessions\[50\]\.workspace_id must be unique per editor/);
      assert.match(duplicateOutput, /distinct_source_video_count must be at least editor_sessions\.length/);
    }
    assert.equal(nasReportDraft.status, "draft");
    assert.equal(nasReportDraft.search_index_version, "");
    assert.equal(nasReportDraft.searchd_health_index_version, "");
    assert.equal(nasReportDraft.searchd_health_source_video_count, 0);
    assert.equal(nasReportDraft.searchd_health_segment_count, 0);
    assert.equal(nasReportDraft.indexed_source_video_count, 0);
    assert.equal(nasReportDraft.indexed_transcript_segment_count, 0);
    assert.equal(nasReportDraft.all_searches_passed, false);
    assert.equal(nasReportDraft.all_cuts_written_to_local_workspaces, false);
    assert.equal(nasReportDraft.public_library_not_written_by_cutters, false);
    assert.equal(nasReportDraft.no_cross_workspace_outputs, false);
    assert.equal(nasReportDraft.editor_sessions.length, 50);
    assert.equal(nasReportDraft.distinct_source_video_count, 0);
    assert.equal(nasReportDraft.editor_sessions[0].search_query, "");
    assert.equal(nasReportDraft.editor_sessions[0].search_result_rank, 0);
    assert.equal(nasReportDraft.editor_sessions[0].search_result_group_count, 0);
    assert.equal(nasReportDraft.editor_sessions[0].search_result_limit, 0);
    assert.equal(nasReportDraft.editor_sessions[0].search_result_segment_id, "");
    assert.equal(nasReportDraft.editor_sessions[0].search_result_begin_char, 0);
    assert.equal(nasReportDraft.editor_sessions[0].search_result_end_char, 0);
    assert.equal(nasReportDraft.editor_sessions[0].search_result_text_sha256, "");
    assert.equal(nasReportDraft.editor_sessions[0].full_transcript_source_video_id, "");
    assert.equal(nasReportDraft.editor_sessions[0].full_transcript_segment_id, "");
    assert.equal(nasReportDraft.editor_sessions[0].full_transcript_segment_count, 0);
    assert.equal(nasReportDraft.editor_sessions[0].full_transcript_char_count, 0);
    assert.equal(nasReportDraft.editor_sessions[0].full_transcript_text_sha256, "");
    assert.equal(nasReportDraft.editor_sessions[0].selected_text_begin_char, 0);
    assert.equal(nasReportDraft.editor_sessions[0].selected_text_end_char, 0);
    assert.equal(nasReportDraft.editor_sessions[0].selected_text_char_count, 0);
    assert.equal(nasReportDraft.editor_sessions[0].selected_begin_ms, 0);
    assert.equal(nasReportDraft.editor_sessions[0].selected_end_ms, 0);
    assert.equal(nasReportDraft.editor_sessions[0].local_clip_source_video_id, "");
    assert.equal(nasReportDraft.editor_sessions[0].local_clip_selected_text_sha256, "");
    assert.equal(nasReportDraft.editor_sessions[0].local_clip_relative_path, "");
    assert.equal(nasReportDraft.editor_sessions[0].local_clip_file_size_bytes, 0);
    assert.equal(nasReportDraft.editor_sessions[0].local_clip_content_sha256, "");
    assert.equal(nasReportDraft.editor_sessions[0].local_clip_begin_ms, 0);
    assert.equal(nasReportDraft.editor_sessions[0].local_clip_end_ms, 0);
    assert.equal(nasReportDraft.editor_sessions[0].search_index_version, "");
    assert.equal(nasReportDraft.editor_sessions[0].location_verified, false);
    assert.equal(validateWindowsAcceptanceEvidence(windowsDraft).ok, false);
    assert.equal(validateNasAcceptanceEvidence(nasDraft).ok, false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("NAS rehearsal smoke locks the 50-editor report to final target scale", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  const script = readFileSync("scripts/smoke/searchd-nas-rehearsal.ts", "utf8");
  const env: NodeJS.ProcessEnv = {};

  configureSearchdNasRehearsalEnv(env);

  assert.equal(packageJson.scripts["server:searchd"], "cargo run --manifest-path packages/searchd/Cargo.toml --");
  assert.equal(packageJson.scripts["build:searchd"], "cargo build --manifest-path packages/searchd/Cargo.toml --release");
  assert.equal(packageJson.scripts["test:searchd"], "cargo test --manifest-path packages/searchd/Cargo.toml");
  assert.equal(packageJson.scripts["smoke:cutter-api-web"], "tsx scripts/smoke/cutter-api-web.ts");
  assert.equal(packageJson.scripts["smoke:searchd-concurrency"], "tsx scripts/smoke/searchd-concurrency.ts");
  assert.equal(packageJson.scripts["smoke:searchd-nas-rehearsal"], "tsx scripts/smoke/searchd-nas-rehearsal.ts");
  assert.equal(packageJson.scripts["smoke:searchd-scale"], "tsx scripts/smoke/searchd-scale.ts");
  assert.equal(packageJson.scripts["validate:evidence-kit-manifest"], "tsx scripts/acceptance/evidence-kit-manifest.ts");
  assert.equal(env.MIXLAB_SEARCHD_CONCURRENCY_VIDEOS, "2000");
  assert.equal(env.MIXLAB_SEARCHD_CONCURRENCY_SEGMENTS_PER_VIDEO, "24");
  assert.equal(env.MIXLAB_SEARCHD_CONCURRENCY_REPORT_PATH, "captures/50-editor-report.json");
  assert.match(script, /MIN_FINAL_VIDEO_COUNT = 2000/);
  assert.match(script, /MIN_FINAL_TRANSCRIPT_SEGMENT_COUNT = 48000/);
  assert.match(script, /runSearchdConcurrencySmoke/);

  assert.throws(
    () => configureSearchdNasRehearsalEnv({
      MIXLAB_SEARCHD_CONCURRENCY_VIDEOS: "12",
      MIXLAB_SEARCHD_CONCURRENCY_SEGMENTS_PER_VIDEO: "4000"
    }),
    /MIXLAB_SEARCHD_CONCURRENCY_VIDEOS must be at least 2000/
  );
  assert.throws(
    () => configureSearchdNasRehearsalEnv({
      MIXLAB_SEARCHD_CONCURRENCY_VIDEOS: "2000",
      MIXLAB_SEARCHD_CONCURRENCY_SEGMENTS_PER_VIDEO: "4"
    }),
    /must be at least 48000/
  );
});

test("packages GitHub Actions provenance into target evidence drafts when available", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-evidence-kit-ci-"));
  const envKeys = [
    "GITHUB_SERVER_URL",
    "GITHUB_REPOSITORY",
    "GITHUB_RUN_ID",
    "GITHUB_SHA",
    "GITHUB_WORKFLOW",
    "MIXLAB_WINDOWS_INSTALLER_FILE_NAME",
    "MIXLAB_WINDOWS_INSTALLER_SHA256",
    "MIXLAB_WINDOWS_INSTALLER_WORKFLOW_RUN_URL",
    "MIXLAB_WINDOWS_INSTALLER_VERSION",
    "MIXLAB_NAS_IMAGE_TAG",
    "MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL"
  ] as const;
  const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

  try {
    process.env.GITHUB_SERVER_URL = "https://github.com";
    process.env.GITHUB_REPOSITORY = "alin155/mixlab";
    process.env.GITHUB_RUN_ID = "1234567890";
    process.env.GITHUB_SHA = TEST_COMMIT_SHA;
    process.env.MIXLAB_WINDOWS_INSTALLER_FILE_NAME = "MixLab Cutter_0.18.10_x64-setup.exe";
    process.env.MIXLAB_WINDOWS_INSTALLER_SHA256 = TEST_INSTALLER_SHA256;
    delete process.env.MIXLAB_WINDOWS_INSTALLER_WORKFLOW_RUN_URL;
    delete process.env.MIXLAB_WINDOWS_INSTALLER_VERSION;
    delete process.env.MIXLAB_NAS_IMAGE_TAG;
    delete process.env.MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL;

    process.env.GITHUB_WORKFLOW = "Cutter Desktop Windows Package";
    const windowsKitDir = path.join(tempRoot, "windows-workflow-kit");
    await packageAcceptanceEvidenceKit(windowsKitDir);
    const windowsDraft = JSON.parse(readFileSync(path.join(windowsKitDir, "windows", "windows-acc-008.json"), "utf8"));
    const windowsNasDraft = JSON.parse(readFileSync(path.join(windowsKitDir, "nas", "nas-acc-009.json"), "utf8"));
    assert.deepEqual(windowsDraft.artifact_provenance, artifactProvenance());
    assert.equal(windowsDraft.installer.file_name, "MixLab Cutter_0.18.10_x64-setup.exe");
    assert.equal(windowsDraft.installer.file_sha256, TEST_INSTALLER_SHA256);
    assert.equal(windowsDraft.installer.workflow_run_url, TEST_WORKFLOW_RUN_URL);
    assert.equal(windowsDraft.installer.version, "0.18.10");
    assert.equal(windowsNasDraft.deployment.image_tag, "");
    assert.equal(windowsNasDraft.deployment.preprocess_count_refresh_interval, 0);
    const windowsDraftMetadataReport = await validateEvidenceKitDraftMetadata({ kitDir: windowsKitDir });
    assert.equal(windowsDraftMetadataReport.ok, true, windowsDraftMetadataReport.errors.join("\n"));
    assert.equal(windowsDraftMetadataReport.checked_windows_installer_prefill, true);
    assert.equal(windowsDraftMetadataReport.checked_nas_image_prefill, false);

    process.env.GITHUB_WORKFLOW = "Build Admin Docker Images";
    delete process.env.MIXLAB_WINDOWS_INSTALLER_FILE_NAME;
    delete process.env.MIXLAB_WINDOWS_INSTALLER_SHA256;
    const nasKitDir = path.join(tempRoot, "nas-workflow-kit");
    await packageAcceptanceEvidenceKit(nasKitDir);
    const nasDraft = JSON.parse(readFileSync(path.join(nasKitDir, "nas", "nas-acc-009.json"), "utf8"));
    const nasWindowsDraft = JSON.parse(readFileSync(path.join(nasKitDir, "windows", "windows-acc-008.json"), "utf8"));
    assert.deepEqual(nasDraft.artifact_provenance, artifactProvenance());
    assert.equal(nasDraft.deployment.image_tag, TEST_COMMIT_SHA);
    assert.equal(nasDraft.deployment.preprocess_count_refresh_interval, 25);
    assert.equal(nasWindowsDraft.installer.workflow_run_url, "");
    const nasDraftMetadataReport = await validateEvidenceKitDraftMetadata({ kitDir: nasKitDir });
    assert.equal(nasDraftMetadataReport.ok, true, nasDraftMetadataReport.errors.join("\n"));
    assert.equal(nasDraftMetadataReport.checked_windows_installer_prefill, false);
    assert.equal(nasDraftMetadataReport.checked_nas_image_prefill, true);

    process.env.MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL = "37";
    const customNasKitDir = path.join(tempRoot, "custom-nas-workflow-kit");
    await packageAcceptanceEvidenceKit(customNasKitDir);
    const customNasDraft = JSON.parse(readFileSync(path.join(customNasKitDir, "nas", "nas-acc-009.json"), "utf8"));
    assert.equal(customNasDraft.deployment.preprocess_count_refresh_interval, 37);
  } finally {
    for (const key of envKeys) {
      const previous = previousEnv.get(key);
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("evidence kit draft metadata validation rejects missing CI prefilled target fields", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-evidence-kit-prefill-rejects-"));
  const envKeys = [
    "GITHUB_SERVER_URL",
    "GITHUB_REPOSITORY",
    "GITHUB_RUN_ID",
    "GITHUB_SHA",
    "GITHUB_WORKFLOW",
    "MIXLAB_WINDOWS_INSTALLER_FILE_NAME",
    "MIXLAB_WINDOWS_INSTALLER_SHA256",
    "MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL"
  ] as const;
  const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

  try {
    process.env.GITHUB_SERVER_URL = "https://github.com";
    process.env.GITHUB_REPOSITORY = "alin155/mixlab";
    process.env.GITHUB_RUN_ID = "1234567890";
    process.env.GITHUB_SHA = TEST_COMMIT_SHA;
    process.env.GITHUB_WORKFLOW = "Cutter Desktop Windows Package";
    process.env.MIXLAB_WINDOWS_INSTALLER_FILE_NAME = "MixLab Cutter_0.18.10_x64-setup.exe";
    process.env.MIXLAB_WINDOWS_INSTALLER_SHA256 = TEST_INSTALLER_SHA256;

    const windowsKitDir = path.join(tempRoot, "tampered-windows-kit");
    await packageAcceptanceEvidenceKit(windowsKitDir);
    const windowsDraftPath = path.join(windowsKitDir, "windows", "windows-acc-008.json");
    const windowsDraft = JSON.parse(readFileSync(windowsDraftPath, "utf8"));
    windowsDraft.installer.file_sha256 = "";
    writeJson(windowsDraftPath, windowsDraft);

    const windowsReport = await validateEvidenceKitDraftMetadata({ kitDir: windowsKitDir });
    assert.equal(windowsReport.ok, false);
    assert.match(windowsReport.errors.join("\n"), /windows\.installer\.file_sha256 must be a 64-character sha256 hex digest/);

    process.env.GITHUB_WORKFLOW = "Build Admin Docker Images";
    delete process.env.MIXLAB_WINDOWS_INSTALLER_FILE_NAME;
    delete process.env.MIXLAB_WINDOWS_INSTALLER_SHA256;
    process.env.MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL = "25";
    const nasKitDir = path.join(tempRoot, "tampered-nas-kit");
    await packageAcceptanceEvidenceKit(nasKitDir);
    const nasDraftPath = path.join(nasKitDir, "nas", "nas-acc-009.json");
    const nasDraft = JSON.parse(readFileSync(nasDraftPath, "utf8"));
    nasDraft.deployment.image_tag = "";
    nasDraft.deployment.preprocess_count_refresh_interval = 0;
    writeJson(nasDraftPath, nasDraft);

    const nasReport = await validateEvidenceKitDraftMetadata({ kitDir: nasKitDir });
    assert.equal(nasReport.ok, false);
    assert.match(nasReport.errors.join("\n"), /nas\.deployment\.image_tag must be prefilled/);
    assert.match(nasReport.errors.join("\n"), /nas\.deployment\.preprocess_count_refresh_interval must be a positive integer/);
  } finally {
    for (const key of envKeys) {
      const previous = previousEnv.get(key);
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("final target evidence gate validates ACC-008 and ACC-009 together", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-final-evidence-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    writeJson(windowsPath, completeWindowsAcceptanceEvidence());
    writeJson(nasPath, completeNasAcceptanceEvidence());
    writeCompleteTargetAttachments(tempRoot);

    const report = await validateFinalTargetEvidence({ windowsPath, nasPath });

    assert.equal(report.ok, true, report.errors.join("\n"));
    assert.deepEqual(report.accepted_target_gates, ["ACC-008", "ACC-009"]);
    assert.equal(report.windows.ok, true);
    assert.equal(report.nas.ok, true);
    assert.equal(report.windows.attachment_count, 10);
    assert.equal(report.nas.attachment_count, 5);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("final target evidence gate requires NAS multi-user summary to match the report attachment", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-final-evidence-summary-match-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    const nasEvidence = completeNasAcceptanceEvidence();
    nasEvidence.multi_user.editor_session_count = 51;

    writeJson(windowsPath, completeWindowsAcceptanceEvidence());
    writeJson(nasPath, nasEvidence);
    writeCompleteTargetAttachments(tempRoot);

    const report = await validateFinalTargetEvidence({ windowsPath, nasPath });

    assert.equal(report.ok, false);
    assert.match(
      report.errors.join("\n"),
      /ACC-009 .*multi_user\.editor_session_count must equal concurrency_report\.editor_sessions length/
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("final target evidence gate requires Windows and NAS evidence from the same commit", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-final-evidence-same-commit-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    const nasEvidence = completeNasAcceptanceEvidence();
    nasEvidence.artifact_provenance.repository_commit_sha = OTHER_TEST_COMMIT_SHA;
    nasEvidence.deployment.image_tag = OTHER_TEST_COMMIT_SHA;

    writeJson(windowsPath, completeWindowsAcceptanceEvidence());
    writeJson(nasPath, nasEvidence);
    writeCompleteTargetAttachments(tempRoot);

    const report = await validateFinalTargetEvidence({ windowsPath, nasPath });

    assert.equal(report.windows.ok, true, report.windows.errors.join("\n"));
    assert.equal(report.nas.ok, true, report.nas.errors.join("\n"));
    assert.equal(report.ok, false);
    assert.deepEqual(report.accepted_target_gates, []);
    assert.match(report.errors.join("\n"), /ACC-008 and ACC-009 artifact_provenance\.repository_commit_sha must match/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("final target evidence gate rejects missing provenance and mismatched NAS image tag", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-final-evidence-provenance-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    const windowsEvidence = completeWindowsAcceptanceEvidence();
    windowsEvidence.artifact_provenance.repository_commit_sha = "shortsha";
    windowsEvidence.installer.workflow_run_url = "not-a-run-url";

    const nasEvidence = completeNasAcceptanceEvidence();
    nasEvidence.deployment.image_tag = "latest";

    writeJson(windowsPath, windowsEvidence);
    writeJson(nasPath, nasEvidence);
    writeCompleteTargetAttachments(tempRoot);

    const report = await validateFinalTargetEvidence({ windowsPath, nasPath });

    assert.equal(report.ok, false);
    assert.match(report.errors.join("\n"), /ACC-008 .*artifact_provenance\.repository_commit_sha must be a 40-character git commit SHA/);
    assert.match(report.errors.join("\n"), /ACC-008 .*installer\.workflow_run_url must be a GitHub Actions run URL/);
    assert.match(report.errors.join("\n"), /ACC-009 .*deployment\.image_tag must match artifact_provenance\.repository_commit_sha/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("final target evidence gate requires referenced attachments beside evidence JSON", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-final-evidence-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    writeJson(windowsPath, completeWindowsAcceptanceEvidence());
    writeJson(nasPath, completeNasAcceptanceEvidence());

    const missingReport = await validateFinalTargetEvidence({ windowsPath, nasPath });
    assert.equal(missingReport.ok, false);
    assert.match(missingReport.errors.join("\n"), /ACC-008 .*attachment file is missing: screenshots\/windows-10\/doctor-pass\.png/);
    assert.match(missingReport.errors.join("\n"), /ACC-009 .*attachment file is missing: evidence\/admin-web\.png/);

    const unsafeWindowsEvidence = completeWindowsAcceptanceEvidence();
    const firstEnvironment = unsafeWindowsEvidence.environments[0]!;
    firstEnvironment.screenshots.first_run_doctor_pass = "../outside.png";
    writeJson(windowsPath, unsafeWindowsEvidence);
    writeCompleteTargetAttachments(tempRoot);

    const unsafeReport = await validateFinalTargetEvidence({ windowsPath, nasPath });
    assert.equal(unsafeReport.ok, false);
    assert.match(
      unsafeReport.errors.join("\n"),
      /ACC-008 .*environments\[windows-10\]\.screenshots\.first_run_doctor_pass must not leave the evidence directory/
    );

    const backslashWindowsEvidence = completeWindowsAcceptanceEvidence();
    backslashWindowsEvidence.environments[0]!.screenshots.first_run_doctor_pass = String.raw`screenshots\windows-10\doctor-pass.png`;
    writeJson(windowsPath, backslashWindowsEvidence);

    const backslashReport = await validateFinalTargetEvidence({ windowsPath, nasPath });
    assert.equal(backslashReport.ok, false);
    assert.match(
      backslashReport.errors.join("\n"),
      /ACC-008 .*environments\[windows-10\]\.screenshots\.first_run_doctor_pass must use forward slashes/
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("final target evidence gate requires attachment filenames to match evidence fields", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-final-evidence-filenames-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    const windowsEvidence = completeWindowsAcceptanceEvidence();
    windowsEvidence.environments[0]!.screenshots.engine_status = "screenshots/windows-10/engine-proof.png";
    const nasEvidence = completeNasAcceptanceEvidence();
    nasEvidence.evidence_files.admin_web_screenshot = "evidence/management-ui.png";

    writeJson(windowsPath, windowsEvidence);
    writeJson(nasPath, nasEvidence);
    writeCompleteTargetAttachments(tempRoot);
    writeAttachment(tempRoot, "screenshots/windows-10/engine-proof.png", TARGET_SCREENSHOT_PNG);
    writeAttachment(tempRoot, "evidence/management-ui.png", TARGET_SCREENSHOT_PNG);

    const report = await validateFinalTargetEvidence({ windowsPath, nasPath });

    assert.equal(report.ok, false);
    assert.match(
      report.errors.join("\n"),
      /ACC-008 .*environments\[windows-10\]\.screenshots\.engine_status filename must be engine-status/
    );
    assert.match(
      report.errors.join("\n"),
      /ACC-009 .*evidence_files\.admin_web_screenshot filename must be admin-web/
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("final target evidence gate requires distinct Windows screenshot attachments per OS", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-final-evidence-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    const windowsEvidence = completeWindowsAcceptanceEvidence();
    const windows11 = windowsEvidence.environments[1]!;
    windows11.screenshots.first_run_doctor_pass = "screenshots/windows-10/doctor-pass.png";

    writeJson(windowsPath, windowsEvidence);
    writeJson(nasPath, completeNasAcceptanceEvidence());
    writeCompleteTargetAttachments(tempRoot);

    const report = await validateFinalTargetEvidence({ windowsPath, nasPath });

    assert.equal(report.ok, false);
    assert.match(
      report.errors.join("\n"),
      /ACC-008 .*environments\[windows-11\]\.screenshots\.first_run_doctor_pass must include windows-11/
    );

    windows11.screenshots.first_run_doctor_pass = "screenshots/shared-doctor-pass.png";
    writeAttachment(tempRoot, "screenshots/shared-doctor-pass.png", TARGET_SCREENSHOT_PNG);
    writeJson(windowsPath, windowsEvidence);

    const sharedReport = await validateFinalTargetEvidence({ windowsPath, nasPath });
    assert.equal(sharedReport.ok, false);
    assert.match(
      sharedReport.errors.join("\n"),
      /ACC-008 .*environments\[windows-11\]\.screenshots\.first_run_doctor_pass must include windows-11/
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("final target evidence gate rejects undersized screenshot attachments", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-final-evidence-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    writeJson(windowsPath, completeWindowsAcceptanceEvidence());
    writeJson(nasPath, completeNasAcceptanceEvidence());
    writeCompleteTargetAttachments(tempRoot);
    writeAttachment(tempRoot, "screenshots/windows-10/doctor-pass.png", MINIMAL_PNG);

    const report = await validateFinalTargetEvidence({ windowsPath, nasPath });

    assert.equal(report.ok, false);
    assert.match(report.errors.join("\n"), /ACC-008 .*screenshot attachment must be at least 640x360: screenshots\/windows-10\/doctor-pass\.png \(1x1\)/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("final target evidence gate rejects fake screenshot and malformed JSON attachments", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-final-evidence-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    writeJson(windowsPath, completeWindowsAcceptanceEvidence());
    writeJson(nasPath, completeNasAcceptanceEvidence());
    writeCompleteTargetAttachments(tempRoot);
    writeAttachment(tempRoot, "screenshots/windows-10/doctor-pass.png", "not actually a png\n");
    writeAttachment(tempRoot, "evidence/50-editor-report.json", "{not valid json}\n");

    const report = await validateFinalTargetEvidence({ windowsPath, nasPath });

    assert.equal(report.ok, false);
    assert.match(report.errors.join("\n"), /ACC-008 .*screenshot attachment has invalid file signature: screenshots\/windows-10\/doctor-pass\.png/);
    assert.match(report.errors.join("\n"), /ACC-009 .*JSON attachment must parse as valid JSON: evidence\/50-editor-report\.json/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("final target evidence gate rejects weak NAS concurrency reports", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-final-evidence-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    writeJson(windowsPath, completeWindowsAcceptanceEvidence());
    writeJson(nasPath, completeNasAcceptanceEvidence());
    writeCompleteTargetAttachments(tempRoot);
    const validReport = completeNasConcurrencyReport();
    const validMetrics = validReport.metrics as Record<string, unknown>;
    writeAttachment(
      tempRoot,
      "evidence/50-editor-report.json",
      `${JSON.stringify({
        ...validReport,
        status: "failed",
        all_searches_passed: false,
        all_cuts_written_to_local_workspaces: false,
        public_library_not_written_by_cutters: false,
        no_cross_workspace_outputs: false,
        search_sla_ms: 2000,
        detail_sla_ms: 50,
        cut_sla_ms: 1500,
        editor_count: 12,
        active_user_count: 51,
        metrics: {
          ...validMetrics,
          search: {
            count: 12,
            p95_ms: 2001
          },
          detail: {
            ...(validMetrics.detail as Record<string, unknown>),
            p50_ms: 90
          },
          cut: {
            ...(validMetrics.cut as Record<string, unknown>),
            max_ms: 99
          }
        }
      }, null, 2)}\n`
    );

    const report = await validateFinalTargetEvidence({ windowsPath, nasPath });

    assert.equal(report.ok, false);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency report status must be passed/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.all_searches_passed must be true/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.all_cuts_written_to_local_workspaces must be true/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.public_library_not_written_by_cutters must be true/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.no_cross_workspace_outputs must be true/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.search_sla_ms must be <= 1500ms/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_count must be at least 50/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.active_user_count must equal concurrency_report\.editor_sessions length/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.metrics\.search\.count must equal concurrency_report\.editor_sessions length/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.metrics\.search\.min_ms must be a finite number/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.metrics\.search\.p95_ms must be <= 2000ms/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.metrics\.detail\.p95_ms must be <= 50ms/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.metrics\.detail latency summary must satisfy min_ms <= p50_ms <= p95_ms <= max_ms/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.metrics\.cut\.max_ms must be at least the maximum cut_ms in editor_sessions/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("final target evidence gate requires NAS usage counts to cover every editor session", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-final-evidence-usage-counts-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    writeJson(windowsPath, completeWindowsAcceptanceEvidence());
    writeJson(nasPath, completeNasAcceptanceEvidence());
    writeCompleteTargetAttachments(tempRoot);
    const validReport = completeNasConcurrencyReport();
    const sessions = validReport.editor_sessions as Record<string, unknown>[];
    const extraSession = {
      ...sessions[0]!,
      user_id: "U51",
      username: "target-editor-51",
      workspace_id: "workspace-51",
      source_video_id: "V000051",
      selected_segment_id: "V000051-S000001",
      search_result_source_video_id: "V000051",
      search_result_rank: 51,
      search_result_group_count: 51,
      search_result_limit: 50,
      search_result_segment_id: "V000051-S000001",
      search_result_text_sha256: sha256Hex("现金流"),
      full_transcript_source_video_id: "V000051",
      full_transcript_segment_id: "V000051-S000001",
      full_transcript_segment_count: 4,
      full_transcript_begin_char: 0,
      full_transcript_end_char: 96,
      full_transcript_char_count: 96,
      full_transcript_text_sha256: sha256Hex("full transcript V000051"),
      selected_text_begin_char: 0,
      selected_text_end_char: 24,
      selected_text_char_count: 24,
      selected_text_sha256: "51".padStart(64, "0"),
      selected_begin_ms: 0,
      selected_end_ms: 1500,
      local_clip_id: "E000051",
      local_clip_source_video_id: "V000051",
      local_clip_selected_text_sha256: "51".padStart(64, "0"),
      local_clip_relative_path: ".mixlab-library/videos/E000051/source.mp4",
      local_clip_file_size_bytes: 18_051,
      local_clip_content_sha256: sha256Hex("local clip V000051"),
      local_clip_begin_ms: 0,
      local_clip_end_ms: 1500,
      search_index_version: "v000001",
      search_ms: 70,
      detail_ms: 65,
      cut_ms: 150
    };
    const validMetrics = validReport.metrics as Record<string, unknown>;
    const usage = validMetrics.usage as Record<string, unknown>;
    writeAttachment(
      tempRoot,
      "evidence/50-editor-report.json",
      `${JSON.stringify({
	        ...validReport,
	        editor_count: 51,
	        active_user_count: 51,
	        distinct_source_video_count: 51,
	        metrics: {
          ...validMetrics,
          search: {
            ...(validMetrics.search as Record<string, unknown>),
            count: 51
          },
          detail: {
            ...(validMetrics.detail as Record<string, unknown>),
            count: 51
          },
          cut: {
            ...(validMetrics.cut as Record<string, unknown>),
            count: 51
          },
          usage: {
            ...usage,
            search_request_count: 50,
            searchd_search_count: 51,
            search_failure_count: 1,
            source_detail_view_count: 51,
            transcript_selection_count: 51,
            cut_submission_count: 51,
            cut_success_count: 51,
            local_clip_count: 51
          }
        },
        editor_sessions: [...sessions, extraSession]
      }, null, 2)}\n`
    );

    const report = await validateFinalTargetEvidence({ windowsPath, nasPath });

    assert.equal(report.ok, false);
    assert.match(
      report.errors.join("\n"),
      /ACC-009 .*concurrency_report\.metrics\.usage\.search_request_count must be at least concurrency_report\.editor_sessions length/
    );
    assert.match(
      report.errors.join("\n"),
      /ACC-009 .*concurrency_report\.metrics\.usage\.search_failure_count must be 0/
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("final target evidence gate requires large public-library scale in the NAS report", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-final-evidence-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    writeJson(windowsPath, completeWindowsAcceptanceEvidence());
    writeJson(nasPath, completeNasAcceptanceEvidence());
    writeCompleteTargetAttachments(tempRoot);
    writeAttachment(
      tempRoot,
      "evidence/50-editor-report.json",
      `${JSON.stringify({
        ...completeNasConcurrencyReport(),
        indexed_source_video_count: 1999,
        indexed_transcript_segment_count: 47999
      }, null, 2)}\n`
    );

    const report = await validateFinalTargetEvidence({ windowsPath, nasPath });

    assert.equal(report.ok, false);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.indexed_source_video_count must be at least 2000/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.indexed_transcript_segment_count must be at least 48000/);
    assert.match(
      report.errors.join("\n"),
      /ACC-009 .*concurrency_report\.searchd_health_source_video_count must equal concurrency_report\.indexed_source_video_count/
    );
    assert.match(
      report.errors.join("\n"),
      /ACC-009 .*concurrency_report\.searchd_health_segment_count must equal concurrency_report\.indexed_transcript_segment_count/
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("final target evidence gate rejects target-machine run roots in NAS reports", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-final-evidence-run-roots-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    writeJson(windowsPath, completeWindowsAcceptanceEvidence());
    writeJson(nasPath, completeNasAcceptanceEvidence());
    writeCompleteTargetAttachments(tempRoot);
    writeAttachment(
      tempRoot,
      "evidence/50-editor-report.json",
      `${JSON.stringify({
        ...completeNasConcurrencyReport(),
        library_root: "/volume1/MixLab/AcceptanceRuns/library",
        workspace_root: "/volume1/MixLab/AcceptanceRuns/workspace",
        searchd_cache_root: "/volume1/MixLab/AcceptanceRuns/searchd-cache"
      }, null, 2)}\n`
    );

    const report = await validateFinalTargetEvidence({ windowsPath, nasPath });

    assert.equal(report.ok, false);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.library_root must not be included in portable target evidence/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.workspace_root must not be included in portable target evidence/);
    assert.match(report.errors.join("\n"), /ACC-009 .*concurrency_report\.searchd_cache_root must not be included in portable target evidence/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("final target evidence gate requires per-editor NAS closed-loop proof", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-final-evidence-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    writeJson(windowsPath, completeWindowsAcceptanceEvidence());
    writeJson(nasPath, completeNasAcceptanceEvidence());
    writeCompleteTargetAttachments(tempRoot);

    const validReport = completeNasConcurrencyReport();
    writeAttachment(
      tempRoot,
      "evidence/50-editor-report.json",
      `${JSON.stringify({
        ...validReport,
        editor_sessions: (validReport.editor_sessions as Record<string, unknown>[]).slice(0, 49)
      }, null, 2)}\n`
    );

    const shortReport = await validateFinalTargetEvidence({ windowsPath, nasPath });
    assert.equal(shortReport.ok, false);
    assert.match(shortReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions must include at least 50 sessions/);
    assert.match(shortReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions must include at least 50 unique user_id values/);

    const editorSessions = (validReport.editor_sessions as Record<string, unknown>[]).map((session) => ({ ...session }));
    editorSessions[1] = {
	      ...editorSessions[1],
	      user_id: editorSessions[0]!.user_id,
	      workspace_id: editorSessions[0]!.workspace_id,
	      source_video_id: editorSessions[0]!.source_video_id,
	      selected_text_sha256: "not-a-sha256",
      local_clip_id: "clip-2",
      local_clip_source_video_id: "V999998",
      local_clip_selected_text_sha256: "e".repeat(64),
      local_clip_relative_path: "../escaped.mp4",
      local_clip_file_size_bytes: 0,
      local_clip_content_sha256: "not-a-sha256",
      search_backend: "fixture",
      search_index_version: "v-mismatched",
      search_result_source_video_id: "V999999",
      search_result_rank: 52,
      search_result_group_count: 49,
      search_result_limit: 50,
      search_result_segment_id: "V999999-S000099",
      search_result_begin_char: 29.5,
      search_result_end_char: 31,
      search_result_text_sha256: "not-a-sha256",
      full_transcript_source_video_id: "V999998",
      full_transcript_segment_id: "V999999-S000099",
      full_transcript_segment_count: 1,
      full_transcript_begin_char: 30.5,
      full_transcript_end_char: 30,
      full_transcript_char_count: 1,
      full_transcript_text_sha256: "not-a-sha256",
      selected_text_begin_char: 32,
      selected_text_end_char: 31,
      selected_text_char_count: 99,
      selected_begin_ms: 900,
      selected_end_ms: 800,
      local_clip_begin_ms: 901,
      local_clip_end_ms: 700,
      location_verified: false,
      completed_closed_loop: false,
      public_library_written: true,
      cut_ms: -1
    };
    writeAttachment(
      tempRoot,
      "evidence/50-editor-report.json",
      `${JSON.stringify({
        ...validReport,
        editor_sessions: editorSessions
      }, null, 2)}\n`
    );

    const invalidReport = await validateFinalTargetEvidence({ windowsPath, nasPath });
    assert.equal(invalidReport.ok, false);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.user_id must be unique/);
	    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.workspace_id must be unique per editor/);
	    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions must include at least 50 unique workspace_id values/);
	    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions must include at least 50 unique source_video_id values/);
	    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.distinct_source_video_count must equal unique source_video_id values in editor_sessions/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.selected_text_sha256 must be a 64-character sha256 hex digest/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.local_clip_id must be a local clip id starting with E/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.local_clip_source_video_id must match source_video_id/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.local_clip_selected_text_sha256 must equal selected_text_sha256/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.local_clip_relative_path must be a workspace-relative portable path/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.local_clip_file_size_bytes must be at least 1/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.local_clip_content_sha256 must be a 64-character sha256 hex digest/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.selected_end_ms must be greater than selected_begin_ms/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.local_clip_end_ms must be greater than local_clip_begin_ms/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.local_clip_begin_ms must equal selected_begin_ms/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.local_clip_end_ms must equal selected_end_ms/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.search_backend must be searchd/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.search_index_version must equal concurrency_report\.search_index_version/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.search_result_source_video_id must match source_video_id/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.search_result_group_count must be at least 50/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.search_result_group_count must be at least search_result_limit/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.search_result_rank must be no greater than search_result_group_count/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.search_result_segment_id must match selected_segment_id/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.search_result_begin_char must be an integer/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.search_result_text_sha256 must be a 64-character sha256 hex digest/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.search_result character range must fall within full_transcript character offsets/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.full_transcript_source_video_id must match source_video_id/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.full_transcript_segment_id must match selected_segment_id/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.full_transcript_segment_count must be at least 4/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.full_transcript_begin_char must be an integer/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.full_transcript_end_char must be greater than full_transcript_begin_char/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.full_transcript_char_count must equal full_transcript_end_char - full_transcript_begin_char/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.full_transcript_text_sha256 must be a 64-character sha256 hex digest/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.selected_text_end_char must be greater than selected_text_begin_char/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.selected_text character range must include the search_result character range/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.selected_text_char_count must equal selected_text_end_char - selected_text_begin_char/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.location_verified must be true/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.completed_closed_loop must be true/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.public_library_written must be false/);
    assert.match(invalidReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[1\]\.cut_ms must be >= 0/);

    const queryProofSessions = (validReport.editor_sessions as Record<string, unknown>[]).map((session) => ({ ...session }));
    queryProofSessions[2] = {
      ...queryProofSessions[2]!,
      search_result_end_char: 4,
      search_result_text_sha256: "d".repeat(64)
    };
    writeAttachment(
      tempRoot,
      "evidence/50-editor-report.json",
      `${JSON.stringify({
        ...validReport,
        editor_sessions: queryProofSessions
      }, null, 2)}\n`
    );
    const queryProofReport = await validateFinalTargetEvidence({ windowsPath, nasPath });
    assert.equal(queryProofReport.ok, false);
    assert.match(queryProofReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[2\]\.search_result_text_sha256 must equal sha256\(search_query\)/);
    assert.match(queryProofReport.errors.join("\n"), /ACC-009 .*concurrency_report\.editor_sessions\[2\]\.search_result character range length must equal search_query length/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("final target evidence gate requires NAS worker log count-refresh proof", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-final-evidence-worker-log-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    writeJson(windowsPath, completeWindowsAcceptanceEvidence());
    writeJson(nasPath, completeNasAcceptanceEvidence());
    writeCompleteTargetAttachments(tempRoot);
    writeAttachment(tempRoot, "evidence/worker.log", "stage api log public workspace ffmpeg ffprobe doctor retry all clear\n");

    const missingProofReport = await validateFinalTargetEvidence({ windowsPath, nasPath });
    assert.equal(missingProofReport.ok, false);
    assert.match(
      missingProofReport.errors.join("\n"),
      /ACC-009 .*worker log must include count_refresh_interval matching deployment\.preprocess_count_refresh_interval \(25\): evidence\/worker\.log/
    );

    writeAttachment(
      tempRoot,
      "evidence/worker.log",
      'stage api log public workspace ffmpeg ffprobe doctor retry all clear\n{ "count_refresh_interval": 10 }\n'
    );

    const mismatchReport = await validateFinalTargetEvidence({ windowsPath, nasPath });
    assert.equal(mismatchReport.ok, false);
    assert.match(
      mismatchReport.errors.join("\n"),
      /ACC-009 .*worker log must include count_refresh_interval matching deployment\.preprocess_count_refresh_interval \(25\): evidence\/worker\.log/
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("final target evidence gate rejects forbidden private data in text attachments", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-final-evidence-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    writeJson(windowsPath, completeWindowsAcceptanceEvidence());
    writeJson(nasPath, completeNasAcceptanceEvidence());
    writeCompleteTargetAttachments(tempRoot);
    writeAttachment(tempRoot, "evidence/worker.log", "stage api log Authorization: Bearer sk-live-secret-token\n");

    const report = await validateFinalTargetEvidence({ windowsPath, nasPath });

    assert.equal(report.ok, false);
    assert.match(report.errors.join("\n"), /ACC-009 .*text attachment contains forbidden secret\/private data: evidence\/worker\.log/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("final target evidence gate rejects missing or draft target evidence", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-final-evidence-"));
  const windowsPath = path.join(tempRoot, "windows-acc-008.json");
  const nasPath = path.join(tempRoot, "nas-acc-009.json");

  try {
    writeJson(windowsPath, createWindowsAcceptanceEvidenceDraft());
    writeJson(nasPath, createNasAcceptanceEvidenceDraft());

    const draftReport = await validateFinalTargetEvidence({ windowsPath, nasPath });
    assert.equal(draftReport.ok, false);
    assert.deepEqual(draftReport.accepted_target_gates, []);
    assert.match(draftReport.errors.join("\n"), /ACC-008 .*installer.file_name must be a non-empty string/);
    assert.match(draftReport.errors.join("\n"), /ACC-009 .*deployment.admin_web_reachable must be true/);

    const missingReport = await validateFinalTargetEvidence({
      windowsPath: path.join(tempRoot, "missing-windows.json"),
      nasPath: path.join(tempRoot, "missing-nas.json")
    });
    assert.equal(missingReport.ok, false);
    assert.match(missingReport.errors.join("\n"), /ACC-008 .*evidence file is missing/);
    assert.match(missingReport.errors.join("\n"), /ACC-009 .*evidence file is missing/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("GitHub workflow publishes the standalone target evidence kit artifact", () => {
  const workflow = readFileSync(".github/workflows/acceptance-evidence-kit.yml", "utf8");

  assert.match(workflow, /docs\/acceptance\/artifacts\/local-web-sanity\.json/);
  assert.match(workflow, /docs\/acceptance\/artifacts\/real-nas-50-editor-report\.json/);
  assert.match(workflow, /docs\/acceptance\/local-web-real-nas\.md/);
  assert.match(workflow, /scripts\/smoke\/cutter-api-web\.ts/);
  assert.match(workflow, /scripts\/smoke\/searchd-concurrency\.ts/);
  assert.match(workflow, /scripts\/smoke\/searchd-nas-rehearsal\.ts/);
  assert.match(workflow, /scripts\/smoke\/searchd-scale\.ts/);
  assert.match(workflow, /packages\/searchd\/\*\*/);
  assert.match(workflow, /docs\/acceptance\/m3-ui-foundation\.md/);
  assert.match(workflow, /docs\/acceptance\/m4-cutter-workbench\.md/);
  assert.match(workflow, /docs\/acceptance\/m5-admin-console\.md/);
  assert.match(workflow, /docs\/acceptance\/m6-search-sqlite-index\.md/);
  assert.match(workflow, /docs\/acceptance\/m8-cutter-workspace-ui-binding\.md/);
  assert.match(workflow, /Set up Rust/);
  assert.match(workflow, /rustup toolchain install stable --profile minimal/);
  assert.match(workflow, /npm run test:searchd/);
  assert.match(workflow, /npm run test:acceptance-evidence/);
  assert.match(
    workflow,
    /npm ci[\s\S]*npm run test:searchd[\s\S]*npm run test:acceptance-evidence[\s\S]*npm run audit:delivery-readiness[\s\S]*local_evidence_count[\s\S]*must include local-web-real-nas\.md, local-web-sanity\.json, and real-nas-50-editor-report\.json together[\s\S]*npm run validate:local-web-sanity-report -- docs\/acceptance\/artifacts\/local-web-sanity\.json[\s\S]*npm run sync:local-real-nas-record[\s\S]*git diff --exit-code -- docs\/acceptance\/local-web-real-nas\.md[\s\S]*npm run audit:local-real-nas-phase[\s\S]*npm run package:evidence-kit[\s\S]*npm run validate:evidence-kit-manifest[\s\S]*evidence-kit-manifest-self-check\.sh/
  );
  assert.match(workflow, /No committed local web sanity report found/);
  assert.match(workflow, /No complete committed local source-machine evidence found; skipping local phase audit/);
  assert.match(workflow, /No complete committed local source-machine evidence found; skipping local record sync check/);
  assert.match(workflow, /must include local-web-real-nas\.md, local-web-sanity\.json, and real-nas-50-editor-report\.json together/);
  assert.match(workflow, /npm run sync:local-real-nas-record/);
  assert.match(workflow, /npm run audit:local-real-nas-phase/);
  assert.match(workflow, /npm run package:evidence-kit/);
  assert.match(workflow, /npm run validate:evidence-kit-manifest/);
  assert.match(workflow, /sh dist\/acceptance\/mixlab-evidence-kit\/evidence-kit-manifest-self-check\.sh dist\/acceptance\/mixlab-evidence-kit/);
  assert.match(workflow, /docs\/acceptance\/m18-1-windows-cutter-desktop\.md/);
  assert.match(workflow, /docs\/deployment\/m19-nas-docker\.md/);
  assert.match(workflow, /docs\/spec-traceability\.md/);
  assert.match(workflow, /docs\/acceptance\/evidence\/windows-acc-008\.json/);
  assert.match(workflow, /docs\/acceptance\/evidence\/nas-acc-009\.json/);
  assert.match(workflow, /npm run validate:target-evidence/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /name: mixlab-target-evidence-kit/);
  assert.match(workflow, /dist\/acceptance\/mixlab-evidence-kit/);
});

test("Windows installer workflow publishes the installer and matching target evidence kit", () => {
  const workflow = readFileSync(".github/workflows/cutter-desktop-windows.yml", "utf8");

  assert.match(workflow, /scripts\/acceptance\/\*\*/);
  assert.match(workflow, /docs\/acceptance\/evidence\/\*\*/);
  assert.match(workflow, /docs\/acceptance\/m18-1-windows-cutter-desktop\.md/);
  assert.match(workflow, /npm run package:cutter-desktop:windows/);
  assert.match(workflow, /Capture installer evidence metadata/);
  assert.match(workflow, /Get-FileHash/);
  assert.match(workflow, /MIXLAB_WINDOWS_INSTALLER_FILE_NAME/);
  assert.match(workflow, /MIXLAB_WINDOWS_INSTALLER_SHA256/);
  assert.match(workflow, /npm run package:evidence-kit/);
  assert.match(workflow, /npm run validate:evidence-kit-manifest/);
  assert.match(workflow, /npm run package:evidence-kit[\s\S]*npm run validate:evidence-kit-manifest[\s\S]*evidence-kit-manifest-self-check\.ps1[\s\S]*name: mixlab-cutter-windows-exe/);
  assert.match(workflow, /powershell -ExecutionPolicy Bypass -File \.\\dist\\acceptance\\mixlab-evidence-kit\\evidence-kit-manifest-self-check\.ps1 -KitDir \.\\dist\\acceptance\\mixlab-evidence-kit/);
  assert.match(workflow, /name: mixlab-cutter-windows-exe/);
  assert.match(workflow, /name: mixlab-target-evidence-kit/);
  assert.match(workflow, /dist\/acceptance\/mixlab-evidence-kit/);
});

test("Admin Docker workflow publishes the target evidence kit beside NAS images", () => {
  const workflow = readFileSync(".github/workflows/docker-admin.yml", "utf8");

  assert.match(workflow, /docs\/acceptance\/evidence\/\*\*/);
  assert.match(workflow, /deploy\/nas\/mixlab\/\*\*/);
  assert.match(workflow, /docs\/deployment\/m19-nas-docker\.md/);
  assert.match(workflow, /docs\/spec-traceability\.md/);
  assert.match(workflow, /Set up Rust/);
  assert.match(workflow, /rustup toolchain install stable --profile minimal/);
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /npm run test:searchd/);
  assert.match(workflow, /npm run test:acceptance-evidence/);
  assert.match(workflow, /npm run audit:delivery-readiness/);
  assert.match(
    workflow,
    /npm run typecheck[\s\S]*npm run test:searchd[\s\S]*npm run test:acceptance-evidence[\s\S]*npm run audit:delivery-readiness[\s\S]*npm run package:evidence-kit[\s\S]*npm run validate:evidence-kit-manifest[\s\S]*evidence-kit-manifest-self-check\.sh[\s\S]*docker\/build-push-action@v6/
  );
  assert.match(workflow, /npm run package:evidence-kit/);
  assert.match(workflow, /npm run validate:evidence-kit-manifest/);
  assert.match(workflow, /sh dist\/acceptance\/mixlab-evidence-kit\/evidence-kit-manifest-self-check\.sh dist\/acceptance\/mixlab-evidence-kit/);
  assert.match(workflow, /docker\/build-push-action@v6/);
  assert.match(workflow, /ghcr\.io\/alin155\/mixlab-admin-runtime:\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /ghcr\.io\/alin155\/mixlab-admin-web:\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /name: mixlab-target-evidence-kit/);
  assert.match(workflow, /dist\/acceptance\/mixlab-evidence-kit/);
});

test("target acceptance docs document collector-side evidence rejection rules", () => {
  const evidenceReadme = readFileSync("docs/acceptance/evidence/README.md", "utf8");
  const windowsDoc = readFileSync("docs/acceptance/m18-1-windows-cutter-desktop.md", "utf8");
  const nasDoc = readFileSync("docs/deployment/m19-nas-docker.md", "utf8");
  const finalGateCommand =
    "npm run validate:target-evidence -- docs/acceptance/evidence/windows-acc-008.json docs/acceptance/evidence/nas-acc-009.json";

  assert.match(evidenceReadme, /windows-acc-008\.json[\s\S]*screenshots\/[\s\S]*nas-acc-009\.json[\s\S]*evidence\//);
  assert.match(evidenceReadme, /fail if only the JSON files are copied back/);
  assert.match(evidenceReadme, /MANIFEST\.json[\s\S]*validate:evidence-kit-manifest[\s\S]*collectors[\s\S]*self-checks[\s\S]*draft JSONs/);
  assert.match(evidenceReadme, /windows-evidence-self-check\.ps1/);
  assert.match(evidenceReadme, /nas-evidence-self-check\.sh/);
  assert.match(evidenceReadme, /nas-50-editor-report-self-check\.sh/);
  assert.match(evidenceReadme, /all-or-none/);
  assert.match(evidenceReadme, /must be committed together/);
  assert.match(evidenceReadme, /sync:local-real-nas-record/);
  assert.match(evidenceReadme, /npm run audit:local-real-nas-phase/);
  assert.match(evidenceReadme, /admin_real_nas_matrix\.source_video_web/);
  assert.match(evidenceReadme, /local_web\.source_video_web_first_id/);
  assert.match(evidenceReadme, /local_web\.source_video_web_loaded_after/);
  assert.match(evidenceReadme, /local_web\.source_video_web_query_response_observed/);
  assert.match(evidenceReadme, /local_web\.source_video_web_ready_filter_all_visible_rows_ready/);
  assert.match(evidenceReadme, /local_web\.dashboard_write_action_lock_labels/);
  assert.match(evidenceReadme, /智能扫描/);
  assert.match(evidenceReadme, /ADMIN_SOURCE_VIDEOS_SOURCE_PATH_VISIBLE/);
  assert.match(evidenceReadme, /ADMIN_SOURCE_VIDEOS_READY_FILTER_ALL_VISIBLE_ROWS_READY/);
  assert.match(evidenceReadme, /admin_source_videos_ui/);
  assert.match(evidenceReadme, /ready-filter API response with only ready rows/);
  assert.match(evidenceReadme, /clean git diff check/);
  assert.match(evidenceReadme, /do not replace the repository validators/);
  assert.match(evidenceReadme, /unique `user_id`[\s\S]*unique `workspace_id`/);
  assert.match(evidenceReadme, /all_searches_passed[\s\S]*all_cuts_written_to_local_workspaces[\s\S]*public_library_not_written_by_cutters[\s\S]*no_cross_workspace_outputs/);
  assert.match(evidenceReadme, /search_sla_ms[\s\S]*detail_sla_ms[\s\S]*cut_sla_ms[\s\S]*matching SLA field/);
  assert.match(evidenceReadme, /admin_dashboard\.local_search_coverage_percent[\s\S]*at least 80%/);
  assert.match(evidenceReadme, /metrics\.usage\.search_failure_count` equal to `0`/);
	  assert.match(evidenceReadme, /min_ms <= p50_ms <= p95_ms <= max_ms/);
	  assert.match(evidenceReadme, /`editor_count` and `active_user_count` equal to `editor_sessions\.length`/);
	  assert.match(evidenceReadme, /50 distinct `source_video_id` values/);
	  assert.match(evidenceReadme, /`distinct_source_video_count` equal to the unique `source_video_id` values/);
	  assert.match(evidenceReadme, /latency `count` equal to `editor_sessions\.length`/);
  assert.match(evidenceReadme, /latency `max_ms` at least the maximum matching per-editor timing/);
  assert.match(evidenceReadme, /usage counts[\s\S]*at least `editor_sessions\.length`[\s\S]*`search_failure_count` equal to `0`/);
  assert.match(evidenceReadme, /search_result_begin_char[\s\S]*search_result_end_char[\s\S]*full-transcript character offsets/);
  assert.match(evidenceReadme, /search_result_rank[\s\S]*search_result_group_count[\s\S]*search_result_limit/);
  assert.match(evidenceReadme, /search_index_version[\s\S]*top-level/);
  assert.match(evidenceReadme, /searchd_health_source_video_count[\s\S]*indexed_source_video_count/);
  assert.match(evidenceReadme, /searchd_health_segment_count[\s\S]*indexed_transcript_segment_count/);
  assert.match(evidenceReadme, /search_result_text_sha256` equal to `sha256\(search_query\)`/);
  assert.match(evidenceReadme, /full_transcript_source_video_id[\s\S]*source_video_id/);
  assert.match(evidenceReadme, /full_transcript_segment_count[\s\S]*4/);
  assert.match(evidenceReadme, /full_transcript_char_count[\s\S]*selected_text_char_count/);
  assert.match(evidenceReadme, /full_transcript_text_sha256/);
  assert.match(evidenceReadme, /selected_text_begin_char[\s\S]*selected_text_end_char[\s\S]*include the search hit range/);
  assert.match(evidenceReadme, /selected_text_char_count[\s\S]*selected range length/);
  assert.match(evidenceReadme, /local_clip_source_video_id[\s\S]*source_video_id/);
  assert.match(evidenceReadme, /local_clip_selected_text_sha256[\s\S]*selected_text_sha256/);
  assert.match(evidenceReadme, /local_clip_relative_path[\s\S]*workspace-relative/);
  assert.match(evidenceReadme, /local_clip_file_size_bytes[\s\S]*positive/);
  assert.match(evidenceReadme, /local_clip_content_sha256[\s\S]*sha256/);
  assert.match(evidenceReadme, /local_clip_begin_ms[\s\S]*local_clip_end_ms[\s\S]*selected_begin_ms[\s\S]*selected_end_ms/);
  assert.match(evidenceReadme, /library_root[\s\S]*workspace_root[\s\S]*searchd_cache_root/);

  assert.match(windowsDoc, /file signature/);
  assert.match(windowsDoc, /640x360/);
  assert.match(windowsDoc, /screenshot filenames that do not match their fields/);
  assert.match(windowsDoc, /RepositoryCommitSha/);
  assert.match(windowsDoc, /EvidenceKitWorkflowRunUrl/);
  assert.match(windowsDoc, /InstallerWorkflowRunUrl/);
  assert.match(windowsDoc, /InstallerFilePath/);
  assert.match(windowsDoc, /InstallerFileSha256/);
  assert.match(windowsDoc, /installer\.file_sha256/);
  assert.match(windowsDoc, /installer file name must include the recorded `-InstallerVersion`/i);
  assert.match(windowsDoc, /windows-evidence-self-check\.ps1/);
  assert.match(windowsDoc, /does not replace the repository validators/);
  assert.match(windowsDoc, /RequireCurrentEnvironmentComplete/);
  assert.match(windowsDoc, /AllPublicLibraryPathsPassed/);
  assert.match(windowsDoc, /AllFailureCasesPassed/);
  assert.match(windowsDoc, /PassedPublicLibraryPath/);
  assert.match(windowsDoc, /PassedFailureCase/);
  assert.match(windowsDoc, /clean-machine proof/);
  assert.match(windowsDoc, /already prefilled/);
  assert.match(windowsDoc, /windows-acc-008\.json[\s\S]*screenshots\/[\s\S]*only the JSON is copied back/);
  assert.match(windowsDoc, /same repository commit/);
  assert.match(windowsDoc, /github\.com\/alin155\/mixlab/);
  assert.match(windowsDoc, /Supplied diagnostics files must be non-empty/);
  for (const term of DIAGNOSTIC_REQUIRED_TERMS) {
    assert.match(windowsDoc, new RegExp(term));
  }
  assert.match(windowsDoc, /non-redacted bearer tokens/);
  assert.match(windowsDoc, new RegExp(finalGateCommand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  assert.match(nasDoc, /collector rejects weak reports before copying/);
  assert.match(nasDoc, /REPOSITORY_COMMIT_SHA/);
  assert.match(nasDoc, /deployment\.image_tag/);
  assert.match(nasDoc, /MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL=25/);
  assert.match(nasDoc, /deployment\.preprocess_count_refresh_interval/);
  assert.match(nasDoc, /ADMIN_SOURCE_VIDEOS_SOURCE_PATH_VISIBLE/);
  assert.match(nasDoc, /ADMIN_SOURCE_VIDEOS_READY_FILTER_ALL_VISIBLE_ROWS_READY/);
  assert.match(nasDoc, /admin_source_videos_ui/);
  assert.match(nasDoc, /load-more increases the loaded count/);
  assert.match(nasDoc, /attachment filenames that do not match their fields/);
  assert.match(nasDoc, /worker log `count_refresh_interval` matching `deployment\.preprocess_count_refresh_interval`/);
  assert.match(nasDoc, /nas-evidence-self-check\.sh/);
  assert.match(nasDoc, /nas-50-editor-report-self-check\.sh/);
  assert.match(nasDoc, /does not replace the repository validators/);
  assert.match(nasDoc, /already prefilled/);
  assert.match(nasDoc, /preserves those prefilled values/);
  assert.match(nasDoc, /nas-acc-009\.json[\s\S]*evidence\/[\s\S]*only the JSON is copied back/);
  assert.match(nasDoc, /same repository commit/);
  assert.match(nasDoc, /github\.com\/alin155\/mixlab/);
  assert.match(nasDoc, /npm run smoke:searchd-nas-rehearsal/);
  assert.match(nasDoc, /MIXLAB_SEARCHD_CONCURRENCY_VIDEOS=2000/);
	  assert.match(nasDoc, /indexed_transcript_segment_count >= 48000/);
	  assert.match(nasDoc, /unique `user_id`[\s\S]*unique `workspace_id`/);
	  assert.match(nasDoc, /50 distinct `source_video_id` values/);
  assert.match(nasDoc, /search_result_begin_char[\s\S]*search_result_end_char[\s\S]*full-transcript character offsets/);
  assert.match(nasDoc, /search_result_rank[\s\S]*search_result_group_count[\s\S]*search_result_limit/);
  assert.match(nasDoc, /search_index_version[\s\S]*searchd/);
  assert.match(nasDoc, /searchd_health_source_video_count[\s\S]*indexed_source_video_count/);
  assert.match(nasDoc, /searchd_health_segment_count[\s\S]*indexed_transcript_segment_count/);
  assert.match(nasDoc, /search_result_text_sha256` equal to `sha256\(search_query\)`/);
  assert.match(nasDoc, /full_transcript_source_video_id[\s\S]*source_video_id/);
  assert.match(nasDoc, /full_transcript_segment_count[\s\S]*4/);
  assert.match(nasDoc, /full_transcript_char_count[\s\S]*selected_text_char_count/);
  assert.match(nasDoc, /full_transcript_text_sha256/);
  assert.match(nasDoc, /selected_text_begin_char[\s\S]*selected_text_end_char[\s\S]*include the search hit range/);
  assert.match(nasDoc, /selected_text_char_count[\s\S]*selected range length/);
  assert.match(nasDoc, /local_clip_source_video_id[\s\S]*source_video_id/);
  assert.match(nasDoc, /local_clip_selected_text_sha256[\s\S]*selected_text_sha256/);
  assert.match(nasDoc, /local_clip_relative_path[\s\S]*workspace-relative/);
  assert.match(nasDoc, /local_clip_file_size_bytes[\s\S]*positive/);
  assert.match(nasDoc, /local_clip_content_sha256[\s\S]*sha256/);
  assert.match(nasDoc, /local_clip_begin_ms[\s\S]*local_clip_end_ms[\s\S]*selected_begin_ms[\s\S]*selected_end_ms/);
  assert.match(nasDoc, /library_root[\s\S]*workspace_root[\s\S]*searchd_cache_root/);
  assert.match(nasDoc, /search-result source\/segment ids matching the full-transcript selected segment/);
  assert.match(nasDoc, /location_verified: true/);
  assert.match(nasDoc, /Supplied NAS attachments must be non-empty/);
  assert.match(nasDoc, /file signature/);
  assert.match(nasDoc, /640x360/);
  assert.match(nasDoc, /\.json` attachments are parsed before copying/);
  assert.match(nasDoc, /non-redacted bearer tokens/);
  assert.match(nasDoc, new RegExp(finalGateCommand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("traceability keeps real target gates tied to the final combined validator", () => {
  const traceability = readFileSync("docs/spec-traceability.md", "utf8");
  const finalGateCommand =
    "npm run validate:target-evidence -- docs/acceptance/evidence/windows-acc-008.json docs/acceptance/evidence/nas-acc-009.json";
  const escapedCommand = finalGateCommand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  assert.match(traceability, new RegExp(`^\\| ACC-008 \\|[^\\n]*${escapedCommand}[^\\n]*$`, "m"));
  assert.match(traceability, new RegExp(`^\\| ACC-009 \\|[^\\n]*${escapedCommand}[^\\n]*$`, "m"));
  assert.match(traceability, /^\| ACC-008 \|[^\n]*artifact provenance[^\n]*$/m);
  assert.match(traceability, /^\| ACC-009 \|[^\n]*deployment\.image_tag[^\n]*$/m);
  assert.match(traceability, /^\| ACC-009 \|[^\n]*full-transcript-location[^\n]*$/m);
  assert.match(traceability, /^\| DELIV-001 \|[^\n]*same-commit artifact provenance[^\n]*$/m);
  assert.match(traceability, /^\| DELIV-001 \|[^\n]*2,000-video \/ 48,000-segment scale proof[^\n]*$/m);
  assert.match(traceability, /^\| DELIV-001 \|[^\n]*search-hit-to-full-transcript-location proof[^\n]*$/m);
});

test("delivery readiness audit proves only real target gates remain open", () => {
  const report = auditDeliveryReadiness();

  assert.equal(report.ok, true, report.errors.join("\n"));
  assert.equal(report.accepted_count > 0, true);
  assert.deepEqual(report.remaining_target_gates, ["ACC-008", "ACC-009"]);
  assert.equal(report.partial_delivery_gate, "DELIV-001");
});

test("delivery readiness audit reports missing automation files without throwing", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "mixlab-readiness-missing-"));
  const originalCwd = process.cwd();

  try {
    mkdirSync(path.join(tempRoot, "docs"), { recursive: true });
    writeFileSync(
      path.join(tempRoot, "docs", "spec-traceability.md"),
      [
        "| ID | Source | Requirement | Current Status | Acceptance |",
        "|---|---|---|---|---|",
        "| ACC-008 | `14` | Windows target. | not-started | final gate |",
        "| ACC-009 | `14` | NAS target. | not-started | final gate |",
        "| DELIV-001 | `14` | Delivery. | partial | target evidence |"
      ].join("\n"),
      "utf8"
    );
    writeJson(path.join(tempRoot, "package.json"), { scripts: {} });

    process.chdir(tempRoot);
    const report = auditDeliveryReadiness();

    assert.equal(report.ok, false);
    assert.match(
      report.errors.join("\n"),
      /Missing required file: scripts\/acceptance\/target-attachments\.ts/
    );
  } finally {
    process.chdir(originalCwd);
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("trace parser extracts requirement ids and current statuses", () => {
  const rows = parseTraceRows(`
| ID | Source | Requirement | Current Status | Acceptance |
|---|---|---|---|---|
| PROD-001 | \`00\` | Scope. | accepted | ok |
| ACC-008 | \`14\` | Windows test. | not-started | needs target |
`);

  assert.deepEqual(rows, [
    { id: "PROD-001", status: "accepted" },
    { id: "ACC-008", status: "not-started" }
  ]);
});

test("acceptance artifact parser extracts unique screenshot evidence paths", () => {
  const references = collectAcceptanceArtifactReferences(`
- \`docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png\`
- ![source](docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png)
- duplicate: docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png
- target capture: screenshots/windows-10/doctor-pass.png
`);

  assert.deepEqual(references, [
    "docs/acceptance/artifacts/m4-cutter-workbench/material-locator.png",
    "docs/acceptance/artifacts/m4-cutter-workbench/source-detail.png"
  ]);
});
