import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  collectNasAttachmentPaths,
  collectWindowsAttachmentPaths,
  validateReferencedAttachments
} from "./target-attachments.ts";

export interface EvidenceValidationResult {
  ok: boolean;
  errors: string[];
}

export interface EvidenceFileValidationResult extends EvidenceValidationResult {
  attachment_count: number;
}

export type TargetEvidenceKind = "windows" | "nas";

export const WINDOWS_PUBLIC_LIBRARY_PATHS = [
  String.raw`D:\MixLabPublicLibrary`,
  String.raw`D:\MixLab Public Library`,
  String.raw`D:\素材库\MixLab公共素材库`,
  String.raw`E:\MixLabPublicLibrary`,
  String.raw`\\NAS\MixLab\PublicLibrary`,
  String.raw`\\NAS\MixLab Public Library`,
  String.raw`\\NAS\素材库\MixLab公共素材库`
] as const;

export const WINDOWS_FAILURE_CASES = [
  "public-library-missing",
  "source-videos-missing",
  "mixlab-library-missing",
  "current-index-missing",
  "no-ready-materials",
  "local-workspace-not-writable",
  "local-workspace-inside-public-library",
  "port-3789-occupied",
  "ffmpeg-missing",
  "ffprobe-missing",
  "nas-path-offline",
  "nas-path-unreadable"
] as const;

export const WINDOWS_PUBLIC_PATH_CHECKS = [
  "first_run_selected",
  "doctor_passed",
  "public_library_not_written",
  "ready_materials_visible",
  "search_works",
  "playback_works",
  "one_cut_completed",
  "project_output_folder_opens",
  "local_library_refreshed"
] as const;

export const WINDOWS_FIRST_RUN_CHECKS = [
  "installed_from_exe",
  "launched_from_start_menu",
  "no_command_line_required",
  "doctor_passed",
  "default_workspace_path_ok",
  "engine_status_normal",
  "entered_workbench"
] as const;

export const WINDOWS_CLEAN_MACHINE_CHECKS = [
  "node_absent",
  "npm_absent",
  "git_absent",
  "ffmpeg_absent",
  "ffprobe_absent",
  "source_repo_absent"
] as const;

export const DIAGNOSTIC_REQUIRED_TERMS = [
  "stage",
  "api",
  "log",
  "public",
  "workspace",
  "ffmpeg",
  "ffprobe",
  "doctor",
  "retry"
] as const;

export const TARGET_EVIDENCE_KIT_ARTIFACT_NAME = "mixlab-target-evidence-kit";
export const TARGET_GITHUB_REPOSITORY = "alin155/mixlab";

const GIT_COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;
const GITHUB_ACTIONS_RUN_URL_PATTERN = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/actions\/runs\/[0-9]+(?:[/?#].*)?$/i;

const DIAGNOSTIC_FORBIDDEN_PATTERNS = [
  /DASHSCOPE_API_KEY/i,
  /Authorization:\s*Bearer\s+(?!\*\*\*)/i,
  /sk-[A-Za-z0-9_-]{8,}/,
  /signature=/i,
  /x-oss-signature/i,
  /full_text/i,
  /pasted_search_text/i
] as const;

export const NAS_DEPLOYMENT_CHECKS = [
  "admin_web_reachable",
  "admin_api_listening",
  "admin_worker_loop_started",
  "worker_output_created",
  "current_json_created"
] as const;

export const NAS_MULTI_USER_CHECKS = [
  "all_searches_passed",
  "all_cuts_written_to_local_workspaces",
  "public_library_not_written_by_cutters",
  "no_cross_workspace_outputs"
] as const;

export const NAS_ADMIN_SOURCE_VIDEOS_UI_CHECKS = [
  "source_path_visible",
  "first_source_video_id_visible",
  "load_more_increased",
  "query_api_response_observed",
  "query_result_visible",
  "ready_filter_selected",
  "ready_filter_api_response_observed",
  "ready_filter_all_visible_rows_ready"
] as const;

export const NAS_EVIDENCE_FILES = [
  "admin_web_screenshot",
  "worker_log_excerpt",
  "current_json_screenshot",
  "smb_permission_screenshot",
  "multi_user_search_cut_report"
] as const;

const WINDOWS_SCREENSHOT_FILE_STEMS: Record<string, string> = {
  first_run_doctor_pass: "doctor-pass",
  engine_status: "engine-status",
  material_locator_playback: "material-locator",
  completed_cut_job: "cut-job",
  local_library_new_clip: "local-library"
};

const NAS_EVIDENCE_FILE_STEMS: Record<string, string> = {
  admin_web_screenshot: "admin-web",
  worker_log_excerpt: "worker",
  current_json_screenshot: "current-json",
  smb_permission_screenshot: "smb-permissions",
  multi_user_search_cut_report: "50-editor-report"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function requireString(
  record: Record<string, unknown>,
  field: string,
  errors: string[],
  prefix: string
): string {
  const value = record[field];
  if (!isNonEmptyString(value)) {
    errors.push(`${prefix}.${field} must be a non-empty string`);
    return "";
  }

  return value.trim();
}

function requirePositiveInteger(
  record: Record<string, unknown>,
  field: string,
  errors: string[],
  prefix: string
): number {
  const value = Number(record[field]);
  if (!Number.isInteger(value) || value < 1) {
    errors.push(`${prefix}.${field} must be a positive integer`);
    return 0;
  }

  return value;
}

function requireTrue(
  record: Record<string, unknown>,
  field: string,
  errors: string[],
  prefix: string
): void {
  if (record[field] !== true) {
    errors.push(`${prefix}.${field} must be true`);
  }
}

function isRelativeAttachmentPath(value: string): boolean {
  return value.trim() !== ""
    && !value.startsWith("/")
    && !/^[A-Za-z]:[\\/]/.test(value)
    && !/^\\\\/.test(value)
    && !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

function attachmentFileStem(attachmentPath: string): string {
  const fileName = attachmentPath.split("/").pop() ?? "";
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
}

function validateAttachmentReference(
  attachmentPath: string,
  errors: string[],
  prefix: string,
  expectedFileStem: string,
  requiredPathSegment?: string
): void {
  if (!isRelativeAttachmentPath(attachmentPath)) {
    errors.push(`${prefix} must be relative to the evidence file`);
  }
  if (attachmentPath.includes("\\")) {
    errors.push(`${prefix} must use forward slashes`);
  }
  if (attachmentPath.split("/").includes("..")) {
    errors.push(`${prefix} must not leave the evidence directory`);
  }
  if (requiredPathSegment && !attachmentPath.split("/").includes(requiredPathSegment)) {
    errors.push(`${prefix} must include ${requiredPathSegment}`);
  }
  if (attachmentFileStem(attachmentPath).toLowerCase() !== expectedFileStem.toLowerCase()) {
    errors.push(`${prefix} filename must be ${expectedFileStem}`);
  }
}

function validateGithubActionsRunUrl(value: string, errors: string[], prefix: string): void {
  const match = GITHUB_ACTIONS_RUN_URL_PATTERN.exec(value);
  if (!match) {
    errors.push(`${prefix} must be a GitHub Actions run URL for ${TARGET_GITHUB_REPOSITORY}`);
    return;
  }

  const repository = `${match[1]}/${match[2]}`.toLowerCase();
  if (repository !== TARGET_GITHUB_REPOSITORY.toLowerCase()) {
    errors.push(`${prefix} must be a GitHub Actions run URL for ${TARGET_GITHUB_REPOSITORY}`);
  }
}

function validateArtifactProvenance(evidence: Record<string, unknown>, errors: string[]): string {
  const provenance = isRecord(evidence.artifact_provenance) ? evidence.artifact_provenance : {};
  const commitSha = requireString(provenance, "repository_commit_sha", errors, "artifact_provenance");
  if (commitSha && !GIT_COMMIT_SHA_PATTERN.test(commitSha)) {
    errors.push("artifact_provenance.repository_commit_sha must be a 40-character git commit SHA");
  }

  if (provenance.evidence_kit_artifact_name !== TARGET_EVIDENCE_KIT_ARTIFACT_NAME) {
    errors.push(`artifact_provenance.evidence_kit_artifact_name must be ${TARGET_EVIDENCE_KIT_ARTIFACT_NAME}`);
  }

  const workflowRunUrl = requireString(
    provenance,
    "evidence_kit_workflow_run_url",
    errors,
    "artifact_provenance"
  );
  if (workflowRunUrl) {
    validateGithubActionsRunUrl(workflowRunUrl, errors, "artifact_provenance.evidence_kit_workflow_run_url");
  }

  return commitSha;
}

function recordByStringKey(items: unknown[], key: string): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();

  for (const item of items) {
    if (!isRecord(item)) {
      continue;
    }

    const value = item[key];
    if (isNonEmptyString(value)) {
      map.set(value, item);
    }
  }

  return map;
}

function validateDiagnosticsSamples(samples: unknown, errors: string[], prefix: string): void {
  const records = asArray(samples).filter(isRecord);
  const kinds = new Set(records.map((record) => record.kind));

  for (const kind of ["success", "failure"]) {
    if (!kinds.has(kind)) {
      errors.push(`${prefix}.diagnostics_samples must include a ${kind} sample`);
    }
  }

  for (const [index, record] of records.entries()) {
    const text = requireString(record, "text", errors, `${prefix}.diagnostics_samples[${index}]`);
    const normalized = text.toLowerCase();

    for (const term of DIAGNOSTIC_REQUIRED_TERMS) {
      if (!normalized.includes(term)) {
        errors.push(`${prefix}.diagnostics_samples[${index}].text must include ${term}`);
      }
    }

    for (const pattern of DIAGNOSTIC_FORBIDDEN_PATTERNS) {
      if (pattern.test(text)) {
        errors.push(`${prefix}.diagnostics_samples[${index}].text contains forbidden secret/private data`);
      }
    }
  }
}

function validateWindowsEnvironment(
  environment: Record<string, unknown>,
  errors: string[],
  prefix: string
): void {
  const cleanMachine = isRecord(environment.clean_machine) ? environment.clean_machine : {};
  for (const field of WINDOWS_CLEAN_MACHINE_CHECKS) {
    requireTrue(cleanMachine, field, errors, `${prefix}.clean_machine`);
  }

  const firstRun = isRecord(environment.first_run) ? environment.first_run : {};
  for (const field of WINDOWS_FIRST_RUN_CHECKS) {
    requireTrue(firstRun, field, errors, `${prefix}.first_run`);
  }

  const screenshots = isRecord(environment.screenshots) ? environment.screenshots : {};
  const os = typeof environment.os === "string" ? environment.os : "";
  for (const [field, expectedFileStem] of Object.entries(WINDOWS_SCREENSHOT_FILE_STEMS)) {
    const attachmentPath = requireString(screenshots, field, errors, `${prefix}.screenshots`);
    if (attachmentPath) {
      validateAttachmentReference(
        attachmentPath,
        errors,
        `${prefix}.screenshots.${field}`,
        expectedFileStem,
        os
      );
    }
  }

  const pathRecords = recordByStringKey(asArray(environment.public_library_paths), "path");
  for (const requiredPath of WINDOWS_PUBLIC_LIBRARY_PATHS) {
    const record = pathRecords.get(requiredPath);
    if (!record) {
      errors.push(`${prefix}.public_library_paths missing ${requiredPath}`);
      continue;
    }

    for (const field of WINDOWS_PUBLIC_PATH_CHECKS) {
      requireTrue(record, field, errors, `${prefix}.public_library_paths[${requiredPath}]`);
    }
  }

  const failureRecords = recordByStringKey(asArray(environment.failure_cases), "case");
  for (const failureCase of WINDOWS_FAILURE_CASES) {
    const record = failureRecords.get(failureCase);
    if (!record) {
      errors.push(`${prefix}.failure_cases missing ${failureCase}`);
      continue;
    }

    requireTrue(record, "diagnostics_shown", errors, `${prefix}.failure_cases[${failureCase}]`);
    requireTrue(record, "did_not_enter_broken_workbench", errors, `${prefix}.failure_cases[${failureCase}]`);
  }

  validateDiagnosticsSamples(environment.diagnostics_samples, errors, prefix);
}

export function validateWindowsAcceptanceEvidence(evidence: unknown): EvidenceValidationResult {
  const errors: string[] = [];

  if (!isRecord(evidence)) {
    return { ok: false, errors: ["evidence must be a JSON object"] };
  }

  if (evidence.schema_version !== "1.0") {
    errors.push("schema_version must be 1.0");
  }
  if (evidence.acceptance_id !== "ACC-008") {
    errors.push("acceptance_id must be ACC-008");
  }

  validateArtifactProvenance(evidence, errors);

  const installer = isRecord(evidence.installer) ? evidence.installer : {};
  const installerFileName = requireString(installer, "file_name", errors, "installer");
  if (installerFileName && !installerFileName.toLowerCase().endsWith(".exe")) {
    errors.push("installer.file_name must end with .exe");
  }
  if (installer.artifact_name !== "mixlab-cutter-windows-exe") {
    errors.push("installer.artifact_name must be mixlab-cutter-windows-exe");
  }
  const installerFileSha256 = requireString(installer, "file_sha256", errors, "installer");
  if (installerFileSha256 && !SHA256_HEX_PATTERN.test(installerFileSha256)) {
    errors.push("installer.file_sha256 must be a 64-character sha256 hex digest");
  }
  const installerVersion = requireString(installer, "version", errors, "installer");
  if (installerFileName && installerVersion && !installerFileName.includes(installerVersion)) {
    errors.push("installer.file_name must include installer.version");
  }
  const installerWorkflowRunUrl = requireString(installer, "workflow_run_url", errors, "installer");
  if (installerWorkflowRunUrl) {
    validateGithubActionsRunUrl(installerWorkflowRunUrl, errors, "installer.workflow_run_url");
  }

  const environmentRecords = recordByStringKey(asArray(evidence.environments), "os");
  for (const os of ["windows-10", "windows-11"]) {
    const environment = environmentRecords.get(os);
    if (!environment) {
      errors.push(`environments missing ${os}`);
      continue;
    }

    validateWindowsEnvironment(environment, errors, `environments[${os}]`);
  }

  return { ok: errors.length === 0, errors };
}

export function validateNasAcceptanceEvidence(evidence: unknown): EvidenceValidationResult {
  const errors: string[] = [];

  if (!isRecord(evidence)) {
    return { ok: false, errors: ["evidence must be a JSON object"] };
  }

  if (evidence.schema_version !== "1.0") {
    errors.push("schema_version must be 1.0");
  }
  if (evidence.acceptance_id !== "ACC-009") {
    errors.push("acceptance_id must be ACC-009");
  }

  const provenanceCommitSha = validateArtifactProvenance(evidence, errors);

  const deployment = isRecord(evidence.deployment) ? evidence.deployment : {};
  for (const field of NAS_DEPLOYMENT_CHECKS) {
    requireTrue(deployment, field, errors, "deployment");
  }
  for (const field of ["admin_web_url", "compose_project"]) {
    requireString(deployment, field, errors, "deployment");
  }
  const imageTag = requireString(deployment, "image_tag", errors, "deployment");
  if (imageTag && provenanceCommitSha && imageTag !== provenanceCommitSha) {
    errors.push("deployment.image_tag must match artifact_provenance.repository_commit_sha");
  }
  requirePositiveInteger(deployment, "preprocess_count_refresh_interval", errors, "deployment");

  const smb = isRecord(evidence.smb_public_library) ? evidence.smb_public_library : {};
  requireString(smb, "windows_unc_path", errors, "smb_public_library");
  requireString(smb, "nas_shared_folder", errors, "smb_public_library");
  requireTrue(smb, "readonly_from_cutter", errors, "smb_public_library");
  requireTrue(smb, "public_library_not_written_by_cutters", errors, "smb_public_library");

  const multiUser = isRecord(evidence.multi_user) ? evidence.multi_user : {};
  const editorSessionCount = Number(multiUser.editor_session_count);
  if (!Number.isInteger(editorSessionCount) || editorSessionCount < 50) {
    errors.push("multi_user.editor_session_count must be at least 50");
  }
  for (const field of NAS_MULTI_USER_CHECKS) {
    requireTrue(multiUser, field, errors, "multi_user");
  }

  const adminSourceVideosUi = isRecord(evidence.admin_source_videos_ui) ? evidence.admin_source_videos_ui : {};
  for (const field of NAS_ADMIN_SOURCE_VIDEOS_UI_CHECKS) {
    requireTrue(adminSourceVideosUi, field, errors, "admin_source_videos_ui");
  }
  const firstSourceVideoId = requireString(
    adminSourceVideosUi,
    "first_source_video_id",
    errors,
    "admin_source_videos_ui"
  );
  if (firstSourceVideoId && !/^V\d{6}$/.test(firstSourceVideoId)) {
    errors.push("admin_source_videos_ui.first_source_video_id must be a source video id like V000001");
  }
  const loadedCountBefore = requirePositiveInteger(
    adminSourceVideosUi,
    "loaded_count_before",
    errors,
    "admin_source_videos_ui"
  );
  const loadedCountAfter = requirePositiveInteger(
    adminSourceVideosUi,
    "loaded_count_after",
    errors,
    "admin_source_videos_ui"
  );
  if (loadedCountAfter <= loadedCountBefore) {
    errors.push("admin_source_videos_ui.loaded_count_after must be greater than loaded_count_before");
  }
  requireString(adminSourceVideosUi, "query", errors, "admin_source_videos_ui");
  const queryResultId = requireString(
    adminSourceVideosUi,
    "query_result_id",
    errors,
    "admin_source_videos_ui"
  );
  if (queryResultId && !/^V\d{6}$/.test(queryResultId)) {
    errors.push("admin_source_videos_ui.query_result_id must be a source video id like V000001");
  }
  requirePositiveInteger(
    adminSourceVideosUi,
    "ready_filter_visible_status_count",
    errors,
    "admin_source_videos_ui"
  );

  const evidenceFiles = isRecord(evidence.evidence_files) ? evidence.evidence_files : {};
  for (const field of NAS_EVIDENCE_FILES) {
    const attachmentPath = requireString(evidenceFiles, field, errors, "evidence_files");
    if (attachmentPath) {
      validateAttachmentReference(
        attachmentPath,
        errors,
        `evidence_files.${field}`,
        NAS_EVIDENCE_FILE_STEMS[field]
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateAcceptanceEvidenceByKind(kind: TargetEvidenceKind, evidence: unknown): EvidenceValidationResult {
  return kind === "windows"
    ? validateWindowsAcceptanceEvidence(evidence)
    : validateNasAcceptanceEvidence(evidence);
}

function acceptanceIdForKind(kind: TargetEvidenceKind): "ACC-008" | "ACC-009" {
  return kind === "windows" ? "ACC-008" : "ACC-009";
}

async function readTargetEvidenceJson(
  kind: TargetEvidenceKind,
  filePath: string
): Promise<{ ok: true; value: unknown } | { ok: false; errors: string[] }> {
  const acceptanceId = acceptanceIdForKind(kind);

  try {
    return {
      ok: true,
      value: JSON.parse(await readFile(filePath, "utf8")) as unknown
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return {
        ok: false,
        errors: [`${acceptanceId} evidence file is missing: ${filePath}`]
      };
    }
    if (error instanceof SyntaxError) {
      return {
        ok: false,
        errors: [`${acceptanceId} evidence file is not valid JSON: ${filePath}`]
      };
    }

    return {
      ok: false,
      errors: [`${acceptanceId} evidence file could not be read: ${filePath}`]
    };
  }
}

export async function validateAcceptanceEvidenceFile(
  kind: TargetEvidenceKind,
  filePath: string
): Promise<EvidenceFileValidationResult> {
  const loaded = await readTargetEvidenceJson(kind, filePath);
  if (!loaded.ok) {
    return {
      ok: false,
      errors: loaded.errors,
      attachment_count: 0
    };
  }

  const evidence = loaded.value;
  const result = validateAcceptanceEvidenceByKind(kind, evidence);
  const attachments = result.ok
    ? kind === "windows"
      ? collectWindowsAttachmentPaths(evidence)
      : collectNasAttachmentPaths(evidence)
    : [];
  const attachmentErrors = result.ok
    ? await validateReferencedAttachments(filePath, attachments)
    : [];

  return {
    ok: result.ok && attachmentErrors.length === 0,
    errors: [...result.errors, ...attachmentErrors],
    attachment_count: attachments.length
  };
}

async function main(): Promise<void> {
  const [, , kind, filePath] = process.argv;

  if ((kind !== "windows" && kind !== "nas") || !filePath) {
    console.error("Usage: tsx scripts/acceptance/target-evidence.ts <windows|nas> <evidence.json>");
    process.exitCode = 2;
    return;
  }

  const result = await validateAcceptanceEvidenceFile(kind, filePath);

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
