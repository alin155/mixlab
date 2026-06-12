import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  DIAGNOSTIC_REQUIRED_TERMS,
  NAS_ADMIN_SOURCE_VIDEOS_UI_CHECKS,
  NAS_DEPLOYMENT_CHECKS,
  NAS_EVIDENCE_FILES,
  NAS_MULTI_USER_CHECKS,
  TARGET_EVIDENCE_KIT_ARTIFACT_NAME,
  WINDOWS_CLEAN_MACHINE_CHECKS,
  WINDOWS_FAILURE_CASES,
  WINDOWS_FIRST_RUN_CHECKS,
  WINDOWS_PUBLIC_LIBRARY_PATHS,
  WINDOWS_PUBLIC_PATH_CHECKS
} from "./target-evidence.ts";

function booleanRecord(fields: readonly string[], value = false): Record<string, boolean> {
  return Object.fromEntries(fields.map((field) => [field, value]));
}

function stringRecord(fields: readonly string[], value = ""): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field, value]));
}

export interface TargetEvidenceDraftOptions {
  repository_commit_sha?: string;
  evidence_kit_workflow_run_url?: string;
  windows_installer_file_name?: string;
  windows_installer_sha256?: string;
  windows_installer_version?: string;
  windows_installer_workflow_run_url?: string;
  nas_image_tag?: string;
  nas_preprocess_count_refresh_interval?: number;
}

function artifactProvenanceDraft(options: TargetEvidenceDraftOptions = {}): Record<string, string> {
  return {
    repository_commit_sha: options.repository_commit_sha ?? "",
    evidence_kit_artifact_name: TARGET_EVIDENCE_KIT_ARTIFACT_NAME,
    evidence_kit_workflow_run_url: options.evidence_kit_workflow_run_url ?? ""
  };
}

function windowsEnvironmentDraft(os: "windows-10" | "windows-11"): Record<string, unknown> {
  return {
    os,
    clean_machine: booleanRecord(WINDOWS_CLEAN_MACHINE_CHECKS),
    first_run: booleanRecord(WINDOWS_FIRST_RUN_CHECKS),
    screenshots: {
      first_run_doctor_pass: `screenshots/${os}/doctor-pass.png`,
      engine_status: `screenshots/${os}/engine-status.png`,
      material_locator_playback: `screenshots/${os}/material-locator.png`,
      completed_cut_job: `screenshots/${os}/cut-job.png`,
      local_library_new_clip: `screenshots/${os}/local-library.png`
    },
    public_library_paths: WINDOWS_PUBLIC_LIBRARY_PATHS.map((path) => ({
      path,
      ...booleanRecord(WINDOWS_PUBLIC_PATH_CHECKS)
    })),
    failure_cases: WINDOWS_FAILURE_CASES.map((failureCase) => ({
      case: failureCase,
      diagnostics_shown: false,
      did_not_enter_broken_workbench: false
    })),
    diagnostics_samples: [
      {
        kind: "success",
        text: "",
        required_terms: [...DIAGNOSTIC_REQUIRED_TERMS]
      },
      {
        kind: "failure",
        text: "",
        required_terms: [...DIAGNOSTIC_REQUIRED_TERMS]
      }
    ]
  };
}

export function createWindowsAcceptanceEvidenceDraft(options: TargetEvidenceDraftOptions = {}): Record<string, unknown> {
  return {
    schema_version: "1.0",
    acceptance_id: "ACC-008",
    collector_note: "Draft only. Replace every empty string and false value with real Windows 10/11 acceptance evidence before validation.",
    artifact_provenance: artifactProvenanceDraft(options),
    installer: {
      file_name: options.windows_installer_file_name ?? "",
      artifact_name: "mixlab-cutter-windows-exe",
      file_sha256: options.windows_installer_sha256 ?? "",
      version: options.windows_installer_version ?? "",
      workflow_run_url: options.windows_installer_workflow_run_url ?? ""
    },
    environments: [
      windowsEnvironmentDraft("windows-10"),
      windowsEnvironmentDraft("windows-11")
    ]
  };
}

export function createNasAcceptanceEvidenceDraft(options: TargetEvidenceDraftOptions = {}): Record<string, unknown> {
  return {
    schema_version: "1.0",
    acceptance_id: "ACC-009",
    collector_note: "Draft only. Replace every empty string, false value, and zero count with real NAS/SMB acceptance evidence before validation.",
    artifact_provenance: artifactProvenanceDraft(options),
    deployment: {
      ...stringRecord(["admin_web_url", "compose_project"]),
      image_tag: options.nas_image_tag ?? "",
      preprocess_count_refresh_interval: options.nas_preprocess_count_refresh_interval ?? 0,
      ...booleanRecord(NAS_DEPLOYMENT_CHECKS)
    },
    smb_public_library: {
      windows_unc_path: "",
      nas_shared_folder: "",
      readonly_from_cutter: false,
      public_library_not_written_by_cutters: false
    },
    multi_user: {
      editor_session_count: 0,
      ...booleanRecord(NAS_MULTI_USER_CHECKS)
    },
    admin_source_videos_ui: {
      ...booleanRecord(NAS_ADMIN_SOURCE_VIDEOS_UI_CHECKS),
      first_source_video_id: "",
      loaded_count_before: 0,
      loaded_count_after: 0,
      query: "",
      query_result_id: "",
      ready_filter_visible_status_count: 0
    },
    evidence_files: stringRecord(NAS_EVIDENCE_FILES)
  };
}

export function createNasConcurrencyReportDraft(): Record<string, unknown> {
  return {
    status: "draft",
    editor_count: 0,
    active_user_count: 0,
    distinct_source_video_count: 0,
    indexed_source_video_count: 0,
    indexed_transcript_segment_count: 0,
    search_index_version: "",
    searchd_health_index_version: "",
    searchd_health_source_video_count: 0,
    searchd_health_segment_count: 0,
    all_searches_passed: false,
    all_cuts_written_to_local_workspaces: false,
    public_library_not_written_by_cutters: false,
    no_cross_workspace_outputs: false,
    search_sla_ms: 1500,
    detail_sla_ms: 1500,
    cut_sla_ms: 1500,
    metrics: {
      search: {
        count: 0,
        min_ms: 0,
        p50_ms: 0,
        p95_ms: 0,
        max_ms: 0
      },
      detail: {
        count: 0,
        min_ms: 0,
        p50_ms: 0,
        p95_ms: 0,
        max_ms: 0
      },
      cut: {
        count: 0,
        min_ms: 0,
        p50_ms: 0,
        p95_ms: 0,
        max_ms: 0
      },
      usage: {
        search_request_count: 0,
        searchd_search_count: 0,
        search_failure_count: 0,
        source_detail_view_count: 0,
        transcript_selection_count: 0,
        cut_submission_count: 0,
        cut_success_count: 0,
        local_clip_count: 0
      }
    },
    editor_sessions: Array.from({ length: 50 }, (_, index) => {
      const ordinal = String(index + 1).padStart(2, "0");
      return {
        user_id: "",
        username: `editor-${ordinal}`,
        workspace_id: "",
        source_video_id: "",
        selected_segment_id: "",
        search_query: "",
        search_result_source_video_id: "",
        search_result_rank: 0,
        search_result_group_count: 0,
        search_result_limit: 0,
        search_result_segment_id: "",
        search_result_begin_char: 0,
        search_result_end_char: 0,
        search_result_text_sha256: "",
        full_transcript_source_video_id: "",
        full_transcript_segment_id: "",
        full_transcript_segment_count: 0,
        full_transcript_begin_char: 0,
        full_transcript_end_char: 0,
        full_transcript_char_count: 0,
        full_transcript_text_sha256: "",
        selected_text_begin_char: 0,
        selected_text_end_char: 0,
        selected_text_char_count: 0,
        selected_text_sha256: "",
        selected_begin_ms: 0,
        selected_end_ms: 0,
        local_clip_id: "",
        local_clip_source_video_id: "",
        local_clip_selected_text_sha256: "",
        local_clip_relative_path: "",
        local_clip_file_size_bytes: 0,
        local_clip_content_sha256: "",
        local_clip_begin_ms: 0,
        local_clip_end_ms: 0,
        search_backend: "",
        search_index_version: "",
        location_verified: false,
        completed_closed_loop: false,
        workspace_output_written: false,
        public_library_written: true,
        search_ms: 0,
        detail_ms: 0,
        cut_ms: 0
      };
    })
  };
}

function createDraft(kind: string): Record<string, unknown> | null {
  if (kind === "windows") {
    return createWindowsAcceptanceEvidenceDraft();
  }
  if (kind === "nas") {
    return createNasAcceptanceEvidenceDraft();
  }

  return null;
}

async function main(): Promise<void> {
  const [, , kind, outputPath] = process.argv;
  const draft = createDraft(kind);

  if (!draft) {
    console.error("Usage: tsx scripts/acceptance/target-evidence-template.ts <windows|nas> [output.json]");
    process.exitCode = 2;
    return;
  }

  const json = `${JSON.stringify(draft, null, 2)}\n`;
  if (outputPath) {
    await writeFile(outputPath, json, "utf8");
    return;
  }

  process.stdout.write(json);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
