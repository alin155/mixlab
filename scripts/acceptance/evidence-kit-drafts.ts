import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVIDENCE_KIT_DIR } from "./package-evidence-kit.ts";
import { TARGET_EVIDENCE_KIT_ARTIFACT_NAME } from "./target-evidence.ts";

interface EvidenceKitDraftMetadataOptions {
  kitDir?: string;
  env?: NodeJS.ProcessEnv;
}

export interface EvidenceKitDraftMetadataReport {
  ok: boolean;
  errors: string[];
  kit_dir: string;
  workflow_name: string;
  checked_windows_installer_prefill: boolean;
  checked_nas_image_prefill: boolean;
}

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const WINDOWS_INSTALLER_WORKFLOW = "Cutter Desktop Windows Package";
const NAS_DOCKER_WORKFLOW = "Build Admin Docker Images";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  return typeof value === "string" ? value.trim() : "";
}

function numberField(record: Record<string, unknown>, field: string): number {
  const value = Number(record[field]);
  return Number.isFinite(value) ? value : 0;
}

async function readJson(filePath: string, errors: string[], label: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    if (!isRecord(parsed)) {
      errors.push(`${label} must contain a JSON object: ${filePath}`);
      return {};
    }
    return parsed;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      errors.push(`${label} is missing: ${filePath}`);
    } else if (error instanceof SyntaxError) {
      errors.push(`${label} is not valid JSON: ${filePath}`);
    } else {
      errors.push(`${label} could not be read: ${filePath}`);
    }
    return {};
  }
}

function requireDraftIdentity(
  draft: Record<string, unknown>,
  acceptanceId: "ACC-008" | "ACC-009",
  errors: string[],
  prefix: string
): void {
  if (draft.schema_version !== "1.0") {
    errors.push(`${prefix}.schema_version must be 1.0`);
  }
  if (draft.acceptance_id !== acceptanceId) {
    errors.push(`${prefix}.acceptance_id must be ${acceptanceId}`);
  }

  const provenance = isRecord(draft.artifact_provenance) ? draft.artifact_provenance : {};
  if (provenance.evidence_kit_artifact_name !== TARGET_EVIDENCE_KIT_ARTIFACT_NAME) {
    errors.push(`${prefix}.artifact_provenance.evidence_kit_artifact_name must be ${TARGET_EVIDENCE_KIT_ARTIFACT_NAME}`);
  }
}

function requireManifestProvenance(
  manifest: Record<string, unknown>,
  draft: Record<string, unknown>,
  errors: string[],
  prefix: string
): void {
  const provenance = isRecord(draft.artifact_provenance) ? draft.artifact_provenance : {};
  const manifestCommit = stringField(manifest, "source_commit_sha");
  const manifestRunUrl = stringField(manifest, "github_actions_run_url");
  const draftCommit = stringField(provenance, "repository_commit_sha");
  const draftRunUrl = stringField(provenance, "evidence_kit_workflow_run_url");

  if (manifestCommit && draftCommit !== manifestCommit) {
    errors.push(`${prefix}.artifact_provenance.repository_commit_sha must match MANIFEST.json source_commit_sha`);
  }
  if (manifestRunUrl && draftRunUrl !== manifestRunUrl) {
    errors.push(`${prefix}.artifact_provenance.evidence_kit_workflow_run_url must match MANIFEST.json github_actions_run_url`);
  }
}

function validateWindowsInstallerPrefill(
  windowsDraft: Record<string, unknown>,
  manifest: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
  errors: string[]
): void {
  const installer = isRecord(windowsDraft.installer) ? windowsDraft.installer : {};
  const fileName = stringField(installer, "file_name");
  const fileSha256 = stringField(installer, "file_sha256");
  const version = stringField(installer, "version");
  const workflowRunUrl = stringField(installer, "workflow_run_url");
  const expectedFileName = env.MIXLAB_WINDOWS_INSTALLER_FILE_NAME?.trim() ?? "";
  const expectedSha256 = env.MIXLAB_WINDOWS_INSTALLER_SHA256?.trim() ?? "";
  const expectedRunUrl = env.MIXLAB_WINDOWS_INSTALLER_WORKFLOW_RUN_URL?.trim()
    || stringField(manifest, "github_actions_run_url");

  if (!fileName) {
    errors.push("windows.installer.file_name must be prefilled for the Windows package workflow");
  }
  if (expectedFileName && fileName !== expectedFileName) {
    errors.push("windows.installer.file_name must match MIXLAB_WINDOWS_INSTALLER_FILE_NAME");
  }
  if (!fileName.toLowerCase().endsWith(".exe")) {
    errors.push("windows.installer.file_name must end with .exe");
  }
  if (!fileSha256 || !SHA256_HEX_PATTERN.test(fileSha256)) {
    errors.push("windows.installer.file_sha256 must be a 64-character sha256 hex digest");
  }
  if (expectedSha256 && fileSha256 !== expectedSha256.toLowerCase()) {
    errors.push("windows.installer.file_sha256 must match MIXLAB_WINDOWS_INSTALLER_SHA256");
  }
  if (!version) {
    errors.push("windows.installer.version must be prefilled for the Windows package workflow");
  }
  if (fileName && version && !fileName.includes(version)) {
    errors.push("windows.installer.file_name must include windows.installer.version");
  }
  if (workflowRunUrl !== expectedRunUrl) {
    errors.push("windows.installer.workflow_run_url must match the Windows package workflow run URL");
  }
}

function validateNasImagePrefill(
  nasDraft: Record<string, unknown>,
  manifest: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
  errors: string[]
): void {
  const deployment = isRecord(nasDraft.deployment) ? nasDraft.deployment : {};
  const imageTag = stringField(deployment, "image_tag");
  const expectedImageTag = env.MIXLAB_NAS_IMAGE_TAG?.trim() || stringField(manifest, "source_commit_sha");
  const countRefreshInterval = numberField(deployment, "preprocess_count_refresh_interval");
  const expectedCountRefreshInterval = Number(env.MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL ?? 25);

  if (!imageTag) {
    errors.push("nas.deployment.image_tag must be prefilled for the Admin Docker workflow");
  }
  if (expectedImageTag && imageTag !== expectedImageTag) {
    errors.push("nas.deployment.image_tag must match the Admin Docker image tag");
  }
  if (!Number.isInteger(countRefreshInterval) || countRefreshInterval < 1) {
    errors.push("nas.deployment.preprocess_count_refresh_interval must be a positive integer");
  }
  if (Number.isInteger(expectedCountRefreshInterval) && expectedCountRefreshInterval > 0 && countRefreshInterval !== expectedCountRefreshInterval) {
    errors.push("nas.deployment.preprocess_count_refresh_interval must match MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL");
  }
}

export async function validateEvidenceKitDraftMetadata(
  options: EvidenceKitDraftMetadataOptions = {}
): Promise<EvidenceKitDraftMetadataReport> {
  const kitDir = options.kitDir ?? EVIDENCE_KIT_DIR;
  const env = options.env ?? process.env;
  const workflowName = env.GITHUB_WORKFLOW?.trim() ?? "";
  const errors: string[] = [];
  const manifest = await readJson(path.join(kitDir, "MANIFEST.json"), errors, "MANIFEST.json");
  const windowsDraft = await readJson(path.join(kitDir, "windows", "windows-acc-008.json"), errors, "windows draft");
  const nasDraft = await readJson(path.join(kitDir, "nas", "nas-acc-009.json"), errors, "nas draft");

  requireDraftIdentity(windowsDraft, "ACC-008", errors, "windows");
  requireDraftIdentity(nasDraft, "ACC-009", errors, "nas");
  requireManifestProvenance(manifest, windowsDraft, errors, "windows");
  requireManifestProvenance(manifest, nasDraft, errors, "nas");

  const shouldCheckWindowsInstallerPrefill = workflowName === WINDOWS_INSTALLER_WORKFLOW
    || Boolean(env.MIXLAB_WINDOWS_INSTALLER_FILE_NAME || env.MIXLAB_WINDOWS_INSTALLER_SHA256);
  const shouldCheckNasImagePrefill = workflowName === NAS_DOCKER_WORKFLOW
    || Boolean(env.MIXLAB_NAS_IMAGE_TAG || env.MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL);

  if (shouldCheckWindowsInstallerPrefill) {
    validateWindowsInstallerPrefill(windowsDraft, manifest, env, errors);
  }
  if (shouldCheckNasImagePrefill) {
    validateNasImagePrefill(nasDraft, manifest, env, errors);
  }

  return {
    ok: errors.length === 0,
    errors,
    kit_dir: kitDir,
    workflow_name: workflowName,
    checked_windows_installer_prefill: shouldCheckWindowsInstallerPrefill,
    checked_nas_image_prefill: shouldCheckNasImagePrefill
  };
}

async function main(): Promise<void> {
  const [, , kitDir = EVIDENCE_KIT_DIR] = process.argv;
  const report = await validateEvidenceKitDraftMetadata({ kitDir });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
