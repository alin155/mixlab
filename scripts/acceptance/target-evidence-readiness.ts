import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_NAS_EVIDENCE_PATH,
  DEFAULT_WINDOWS_EVIDENCE_PATH,
  validateFinalTargetEvidence,
  type FinalTargetEvidencePaths,
  type TargetEvidenceGateResult
} from "./final-target-evidence.ts";
import { artifactProvenanceCommitSha } from "./target-attachments.ts";

type TargetGateStatus = "missing" | "invalid-json" | "incomplete" | "accepted";
type TargetAcceptanceId = "ACC-008" | "ACC-009";

interface TargetEvidenceFileState {
  exists: boolean;
  valid_json: boolean;
  json_acceptance_id: string;
  json_schema_version: string;
  provenance_commit_sha: string;
  error: string;
}

export interface TargetEvidenceReadinessGate {
  acceptance_id: TargetAcceptanceId;
  path: string;
  status: TargetGateStatus;
  exists: boolean;
  valid_json: boolean;
  json_acceptance_id: string;
  json_schema_version: string;
  provenance_commit_sha: string;
  attachment_count: number;
  error_count: number;
  first_errors: string[];
}

export interface TargetEvidenceReadinessReport {
  ok: boolean;
  ready_for_final_validation: boolean;
  same_repository_commit: boolean;
  accepted_target_gates: TargetAcceptanceId[];
  remaining_target_gates: TargetAcceptanceId[];
  final_gate: {
    ok: boolean;
    error_count: number;
    first_errors: string[];
  };
  windows: TargetEvidenceReadinessGate;
  nas: TargetEvidenceReadinessGate;
  next_actions: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

async function readEvidenceFileState(filePath: string): Promise<TargetEvidenceFileState> {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return {
        exists: true,
        valid_json: false,
        json_acceptance_id: "",
        json_schema_version: "",
        provenance_commit_sha: "",
        error: "evidence path exists but is not a file"
      };
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    return {
      exists: false,
      valid_json: false,
      json_acceptance_id: "",
      json_schema_version: "",
      provenance_commit_sha: "",
      error: nodeError.code === "ENOENT" ? "evidence file is missing" : "evidence file could not be inspected"
    };
  }

  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    const record = isRecord(parsed) ? parsed : {};
    return {
      exists: true,
      valid_json: true,
      json_acceptance_id: stringField(record, "acceptance_id"),
      json_schema_version: stringField(record, "schema_version"),
      provenance_commit_sha: artifactProvenanceCommitSha(parsed),
      error: ""
    };
  } catch (error) {
    return {
      exists: true,
      valid_json: false,
      json_acceptance_id: "",
      json_schema_version: "",
      provenance_commit_sha: "",
      error: error instanceof SyntaxError ? "evidence file is not valid JSON" : "evidence file could not be read"
    };
  }
}

function gateStatus(state: TargetEvidenceFileState, gate: TargetEvidenceGateResult): TargetGateStatus {
  if (!state.exists) {
    return "missing";
  }
  if (!state.valid_json) {
    return "invalid-json";
  }
  return gate.ok ? "accepted" : "incomplete";
}

function buildGateReadiness(
  acceptanceId: TargetAcceptanceId,
  state: TargetEvidenceFileState,
  gate: TargetEvidenceGateResult
): TargetEvidenceReadinessGate {
  return {
    acceptance_id: acceptanceId,
    path: gate.path,
    status: gateStatus(state, gate),
    exists: state.exists,
    valid_json: state.valid_json,
    json_acceptance_id: state.json_acceptance_id,
    json_schema_version: state.json_schema_version,
    provenance_commit_sha: gate.provenance_commit_sha || state.provenance_commit_sha,
    attachment_count: gate.attachment_count,
    error_count: gate.errors.length,
    first_errors: gate.errors.slice(0, 5)
  };
}

function buildNextActions(input: {
  windows: TargetEvidenceReadinessGate;
  nas: TargetEvidenceReadinessGate;
  sameCommit: boolean;
  finalGateOk: boolean;
}): string[] {
  const actions: string[] = [];

  if (input.windows.status === "missing") {
    actions.push("Collect ACC-008 on clean Windows 10 and Windows 11 targets, then copy windows-acc-008.json plus screenshots/ back to docs/acceptance/evidence/.");
  } else if (input.windows.status === "invalid-json") {
    actions.push("Fix ACC-008 JSON syntax before running repository validators.");
  } else if (input.windows.status === "incomplete") {
    actions.push("Finish ACC-008 missing Windows checks, screenshots, diagnostics, installer provenance, or attachment files.");
  }

  if (input.nas.status === "missing") {
    actions.push("Collect ACC-009 on the NAS Docker/SMB target, then copy nas-acc-009.json plus evidence/ back to docs/acceptance/evidence/.");
  } else if (input.nas.status === "invalid-json") {
    actions.push("Fix ACC-009 JSON syntax before running repository validators.");
  } else if (input.nas.status === "incomplete") {
    actions.push("Finish ACC-009 deployment, SMB, admin source-videos, worker-log, and 50-editor evidence gaps.");
  }

  if (
    input.windows.status === "accepted" &&
    input.nas.status === "accepted" &&
    !input.sameCommit
  ) {
    actions.push("Regenerate or recollect ACC-008 and ACC-009 from the same repository commit before final delivery.");
  }

  if (input.finalGateOk) {
    actions.push("Run npm run audit:delivery-readiness and update traceability only after ACC-008 and ACC-009 are accepted together.");
  }

  return actions;
}

export async function auditTargetEvidenceReadiness(
  paths: FinalTargetEvidencePaths = {}
): Promise<TargetEvidenceReadinessReport> {
  const windowsPath = paths.windowsPath ?? DEFAULT_WINDOWS_EVIDENCE_PATH;
  const nasPath = paths.nasPath ?? DEFAULT_NAS_EVIDENCE_PATH;
  const [windowsState, nasState, finalGate] = await Promise.all([
    readEvidenceFileState(windowsPath),
    readEvidenceFileState(nasPath),
    validateFinalTargetEvidence({ windowsPath, nasPath })
  ]);
  const windows = buildGateReadiness("ACC-008", windowsState, finalGate.windows);
  const nas = buildGateReadiness("ACC-009", nasState, finalGate.nas);
  const sameRepositoryCommit = Boolean(
    windows.provenance_commit_sha &&
    nas.provenance_commit_sha &&
    windows.provenance_commit_sha === nas.provenance_commit_sha
  );
  const acceptedTargetGates = [
    windows.status === "accepted" ? windows.acceptance_id : "",
    nas.status === "accepted" ? nas.acceptance_id : ""
  ].filter(Boolean) as TargetAcceptanceId[];
  const remainingTargetGates = (["ACC-008", "ACC-009"] as const).filter((acceptanceId) =>
    !acceptedTargetGates.includes(acceptanceId)
  );
  const readyForFinalValidation = windows.exists && windows.valid_json && nas.exists && nas.valid_json;

  return {
    ok: finalGate.ok,
    ready_for_final_validation: readyForFinalValidation,
    same_repository_commit: sameRepositoryCommit,
    accepted_target_gates: acceptedTargetGates,
    remaining_target_gates: remainingTargetGates,
    final_gate: {
      ok: finalGate.ok,
      error_count: finalGate.errors.length,
      first_errors: finalGate.errors.slice(0, 8)
    },
    windows,
    nas,
    next_actions: buildNextActions({
      windows,
      nas,
      sameCommit: sameRepositoryCommit,
      finalGateOk: finalGate.ok
    })
  };
}

async function main(): Promise<void> {
  const [, , windowsPath = DEFAULT_WINDOWS_EVIDENCE_PATH, nasPath = DEFAULT_NAS_EVIDENCE_PATH] = process.argv;
  const report = await auditTargetEvidenceReadiness({ windowsPath, nasPath });
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
