import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  artifactProvenanceCommitSha,
  type AttachmentReference,
  collectNasAttachmentPaths,
  collectWindowsAttachmentPaths,
  validateReferencedAttachments
} from "./target-attachments.ts";
import {
  type EvidenceValidationResult,
  NAS_MULTI_USER_CHECKS,
  validateNasAcceptanceEvidence,
  validateWindowsAcceptanceEvidence
} from "./target-evidence.ts";

export const DEFAULT_WINDOWS_EVIDENCE_PATH = "docs/acceptance/evidence/windows-acc-008.json";
export const DEFAULT_NAS_EVIDENCE_PATH = "docs/acceptance/evidence/nas-acc-009.json";

export interface FinalTargetEvidencePaths {
  windowsPath?: string;
  nasPath?: string;
}

export interface TargetEvidenceGateResult extends EvidenceValidationResult {
  acceptance_id: "ACC-008" | "ACC-009";
  path: string;
  attachment_count: number;
  provenance_commit_sha: string;
}

export interface FinalTargetEvidenceReport {
  ok: boolean;
  errors: string[];
  accepted_target_gates: string[];
  windows: TargetEvidenceGateResult;
  nas: TargetEvidenceGateResult;
}

async function readJsonEvidence(filePath: string, acceptanceId: string): Promise<{
  ok: boolean;
  value?: unknown;
  errors: string[];
}> {
  try {
    return {
      ok: true,
      value: JSON.parse(await readFile(filePath, "utf8")) as unknown,
      errors: []
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function validateNasMultiUserSummaryMatchesReport(evidence: unknown, evidencePath: string): Promise<string[]> {
  if (!isRecord(evidence)) {
    return [];
  }

  const multiUser = isRecord(evidence.multi_user) ? evidence.multi_user : {};
  const evidenceFiles = isRecord(evidence.evidence_files) ? evidence.evidence_files : {};
  const reportAttachmentPath = typeof evidenceFiles.multi_user_search_cut_report === "string"
    ? evidenceFiles.multi_user_search_cut_report
    : "";
  if (!reportAttachmentPath) {
    return [];
  }

  let report: unknown;
  try {
    report = JSON.parse(
      await readFile(path.resolve(path.dirname(evidencePath), reportAttachmentPath), "utf8")
    ) as unknown;
  } catch {
    return [];
  }
  if (!isRecord(report) || !Array.isArray(report.editor_sessions)) {
    return [];
  }

  const errors: string[] = [];
  const editorSessionCount = Number(multiUser.editor_session_count);
  if (Number.isInteger(editorSessionCount) && editorSessionCount !== report.editor_sessions.length) {
    errors.push("multi_user.editor_session_count must equal concurrency_report.editor_sessions length");
  }

  for (const field of NAS_MULTI_USER_CHECKS) {
    if (
      typeof multiUser[field] === "boolean" &&
      typeof report[field] === "boolean" &&
      multiUser[field] !== report[field]
    ) {
      errors.push(`multi_user.${field} must match concurrency_report.${field}`);
    }
  }

  return errors;
}

async function validateEvidenceFile(
  acceptanceId: "ACC-008" | "ACC-009",
  filePath: string,
  validate: (evidence: unknown) => EvidenceValidationResult,
  collectAttachments: (evidence: unknown) => AttachmentReference[],
  extraValidation: (evidence: unknown, filePath: string) => Promise<string[]> = async () => []
): Promise<TargetEvidenceGateResult> {
  const loaded = await readJsonEvidence(filePath, acceptanceId);
  if (!loaded.ok) {
    return {
      acceptance_id: acceptanceId,
      path: filePath,
      ok: false,
      errors: loaded.errors,
      attachment_count: 0,
      provenance_commit_sha: ""
    };
  }

  const result = validate(loaded.value);
  const attachments = result.ok ? collectAttachments(loaded.value) : [];
  const attachmentErrors = result.ok
    ? await validateReferencedAttachments(filePath, attachments)
    : [];
  const extraErrors = result.ok
    ? await extraValidation(loaded.value, filePath)
    : [];

  return {
    acceptance_id: acceptanceId,
    path: filePath,
    ok: result.ok && attachmentErrors.length === 0 && extraErrors.length === 0,
    errors: [...result.errors, ...attachmentErrors, ...extraErrors],
    attachment_count: attachments.length,
    provenance_commit_sha: artifactProvenanceCommitSha(loaded.value)
  };
}

export async function validateFinalTargetEvidence(
  paths: FinalTargetEvidencePaths = {}
): Promise<FinalTargetEvidenceReport> {
  const windowsPath = paths.windowsPath ?? DEFAULT_WINDOWS_EVIDENCE_PATH;
  const nasPath = paths.nasPath ?? DEFAULT_NAS_EVIDENCE_PATH;
  const windows = await validateEvidenceFile(
    "ACC-008",
    windowsPath,
    validateWindowsAcceptanceEvidence,
    collectWindowsAttachmentPaths
  );
  const nas = await validateEvidenceFile(
    "ACC-009",
    nasPath,
    validateNasAcceptanceEvidence,
    collectNasAttachmentPaths,
    validateNasMultiUserSummaryMatchesReport
  );

  const combinedErrors = windows.ok && nas.ok && windows.provenance_commit_sha !== nas.provenance_commit_sha
    ? [
        "ACC-008 and ACC-009 artifact_provenance.repository_commit_sha must match for one final delivery"
      ]
    : [];
  const errors = [
    ...windows.errors.map((error) => `ACC-008 ${windowsPath}: ${error}`),
    ...nas.errors.map((error) => `ACC-009 ${nasPath}: ${error}`),
    ...combinedErrors
  ];
  const ok = windows.ok && nas.ok && combinedErrors.length === 0;
  const acceptedTargetGates = ok ? [
    windows.ok ? "ACC-008" : "",
    nas.ok ? "ACC-009" : ""
  ].filter(Boolean) : [];

  return {
    ok,
    errors,
    accepted_target_gates: acceptedTargetGates,
    windows,
    nas
  };
}

async function main(): Promise<void> {
  const [, , windowsPath = DEFAULT_WINDOWS_EVIDENCE_PATH, nasPath = DEFAULT_NAS_EVIDENCE_PATH] = process.argv;
  const report = await validateFinalTargetEvidence({ windowsPath, nasPath });
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
