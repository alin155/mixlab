import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runAdminDockerNasDiskProof, type AdminDockerNasDiskProofReport } from "./admin-docker-nas-disk-proof.ts";
import { runAdminDockerNasImageProof, type AdminDockerNasImageProofReport } from "./admin-docker-nas-image-proof.ts";
import { runAdminDockerReleaseInputs, type AdminDockerReleaseInputsReport } from "./admin-docker-release-inputs.ts";
import { runAdminDockerStagingRunbook, type AdminDockerStagingRunbookReport } from "./admin-docker-staging-runbook.ts";
import { runAdminWorkerEnvProof, type AdminWorkerEnvProofReport } from "./admin-worker-env-proof.ts";

const DEFAULT_ARTIFACT_DIR = "docs/acceptance/artifacts";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const RETURNED_FILES = {
  nas_env: "admin-docker-current.env",
  nas_inspect: "admin-docker-current.inspect.json",
  worker_env: "admin-worker.env",
  worker_inspect: "admin-worker.inspect.json",
  disk_proof: "admin-docker-disk-proof.json"
} as const;

type ReturnedFileKey = keyof typeof RETURNED_FILES;
type GateStatus = "pass" | "blocked" | "fail";
type GateCategory = "safety" | "returned-evidence" | "proof" | "release-inputs" | "runbook";

interface IntakeGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_intake: boolean;
  blocks_release_inputs: boolean;
  blocks_staging_execution: boolean;
  blocks_docker_deploy: boolean;
  required_evidence?: string;
}

interface IntakeSummary {
  total: number;
  passed: number;
  blocked: number;
  failed: number;
  intake_blockers: string[];
  release_input_blockers: string[];
  staging_execution_blockers: string[];
  docker_deploy_blockers: string[];
}

interface IntakeSources {
  returned_dir: string;
  prestaging_handoff_report: string;
  candidate_ref_proof_report: string;
  local_docker_smoke_report: string;
  parity_plan_report: string;
  candidate_contract_proof_report: string;
  cutter_compatibility_proof_report: string;
}

interface ReturnedFileObservation {
  key: ReturnedFileKey;
  expected_name: string;
  path: string;
  present: boolean;
  size_bytes: number | null;
}

interface GeneratedReports {
  nas_image_proof_report: string;
  worker_env_proof_report: string;
  nas_disk_proof_report: string;
  release_inputs_report: string;
  staging_runbook_report: string;
}

export interface AdminDockerNasReleaseInputsIntakeReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-nas-release-inputs-intake";
  sources: IntakeSources;
  returned_files: ReturnedFileObservation[];
  generated_reports: GeneratedReports;
  intake_complete: boolean;
  release_inputs_ready: boolean;
  staging_execution_ready: boolean;
  staging_review_ready: boolean;
  push_execution_allowed: false;
  docker_deploy_allowed: false;
  observations: {
    current_image_tag: string;
    target_image_tag: string;
    rollback_image_tag: string;
    nas_image_proof_status: string;
    nas_image_proof_accepted: boolean | null;
    worker_env_status: string;
    worker_proof_accepted: boolean | null;
    nas_disk_proof_status: string;
    nas_disk_proof_accepted: boolean | null;
    release_inputs_status: string;
    release_input_blockers: string[];
    staging_runbook_status: string;
    staging_execution_blockers: string[];
    staging_blockers: string[];
    run_errors: string[];
  };
  gates: IntakeGate[];
  summary: IntakeSummary;
  next_actions: string[];
  result: {
    status: "intake-complete" | "blocked" | "failed";
    summary: string;
  };
  artifacts: {
    json_path: string;
    markdown_path: string;
  } | null;
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

function resultStatus(report: unknown): string {
  return asString(asRecord(asRecord(report).result).status);
}

function gate(input: IntakeGate): IntakeGate {
  return input;
}

function summarize(gates: IntakeGate[]): IntakeSummary {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    failed: gates.filter((item) => item.status === "fail").length,
    intake_blockers: gates.filter((item) => item.blocks_intake && item.status !== "pass").map((item) => item.id),
    release_input_blockers: gates.filter((item) => item.blocks_release_inputs && item.status !== "pass").map((item) => item.id),
    staging_execution_blockers: gates.filter((item) => item.blocks_staging_execution && item.status !== "pass").map((item) => item.id),
    docker_deploy_blockers: gates.filter((item) => item.blocks_docker_deploy && item.status !== "pass").map((item) => item.id)
  };
}

async function latestArtifact(dir: string, prefix: string): Promise<string> {
  const files = await readdir(dir);
  const candidates = files
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .sort();

  if (candidates.length === 0) {
    return "";
  }

  return path.join(dir, candidates[candidates.length - 1] ?? "");
}

async function fileInfo(filePath: string): Promise<{ present: boolean; size_bytes: number | null }> {
  try {
    const info = await stat(filePath);

    return {
      present: info.isFile(),
      size_bytes: info.isFile() ? info.size : null
    };
  } catch {
    return {
      present: false,
      size_bytes: null
    };
  }
}

async function returnedFiles(returnedDir: string): Promise<ReturnedFileObservation[]> {
  const entries: ReturnedFileObservation[] = [];

  for (const [key, fileName] of Object.entries(RETURNED_FILES) as Array<[ReturnedFileKey, string]>) {
    const filePath = returnedDir ? path.join(returnedDir, fileName) : "";
    const info = filePath ? await fileInfo(filePath) : { present: false, size_bytes: null };
    entries.push({
      key,
      expected_name: fileName,
      path: filePath,
      present: info.present,
      size_bytes: info.size_bytes
    });
  }

  return entries;
}

function requiredFile(files: ReturnedFileObservation[], key: ReturnedFileKey): string {
  return files.find((item) => item.key === key && item.present)?.path ?? "";
}

function missingReturnedFiles(files: ReturnedFileObservation[]): string[] {
  return files.filter((item) => !item.present).map((item) => item.expected_name);
}

function nextActions(report: AdminDockerNasReleaseInputsIntakeReport): string[] {
  if (!report.intake_complete) {
    return [
      "Keep push_images=false and do not edit NAS .env.",
      `Resolve intake blockers: ${report.summary.intake_blockers.join(", ") || "unknown"}.`,
      "If returned evidence is missing, rerun the NAS collector from the Compose project folder and copy admin-docker-release-inputs/ back to the Mac repo."
    ];
  }

  return [
    report.release_inputs_ready
      ? "Release inputs are ready for a separate explicit push_images=true release decision, but this intake report does not approve that decision."
      : `Release inputs remain blocked: ${report.observations.release_input_blockers.join(", ") || "unknown"}.`,
    report.staging_execution_ready
      ? "Staging execution inputs are ready only after a separate explicit release approval and pushed-image workflow proof."
      : `Staging execution remains blocked: ${report.observations.staging_execution_blockers.join(", ") || "unknown"}.`,
    "Do not stage Docker until push_images=true has been explicitly approved, the GitHub pushed-image workflow succeeds, and staged live-readonly/Cutter proofs are collected."
  ];
}

function toMarkdown(report: AdminDockerNasReleaseInputsIntakeReport): string {
  const lines = [
    "# Admin Docker NAS Release Inputs Intake",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Result: ${report.result.status}`,
    `Intake complete: ${report.intake_complete ? "yes" : "no"}`,
    `Release inputs ready: ${report.release_inputs_ready ? "yes" : "no"}`,
    `Staging execution ready: ${report.staging_execution_ready ? "yes" : "no"}`,
    "Push execution allowed: no",
    "Docker deploy allowed: no",
    "",
    "## Sources",
    "",
    `- Returned dir: ${report.sources.returned_dir || "<missing>"}`,
    `- Pre-staging handoff: ${report.sources.prestaging_handoff_report || "<missing>"}`,
    `- Candidate ref proof: ${report.sources.candidate_ref_proof_report || "<missing>"}`,
    `- Local Docker smoke: ${report.sources.local_docker_smoke_report || "<missing>"}`,
    `- Parity plan: ${report.sources.parity_plan_report || "<missing>"}`,
    `- Candidate contract proof: ${report.sources.candidate_contract_proof_report || "<missing>"}`,
    `- Cutter compatibility proof: ${report.sources.cutter_compatibility_proof_report || "<missing>"}`,
    "",
    "## Returned Files",
    "",
    "| File | Present | Size | Path |",
    "| --- | --- | --- | --- |",
    ...report.returned_files.map((item) => `| ${item.expected_name} | ${item.present ? "yes" : "no"} | ${item.size_bytes ?? "n/a"} | ${item.path || "<missing>"} |`),
    "",
    "## Generated Reports",
    "",
    `- NAS image proof: ${report.generated_reports.nas_image_proof_report || "<not generated>"}`,
    `- Worker env proof: ${report.generated_reports.worker_env_proof_report || "<not generated>"}`,
    `- NAS disk proof: ${report.generated_reports.nas_disk_proof_report || "<not generated>"}`,
    `- Release inputs: ${report.generated_reports.release_inputs_report || "<not generated>"}`,
    `- Staging runbook: ${report.generated_reports.staging_runbook_report || "<not generated>"}`,
    "",
    "## Observations",
    "",
    `- current_image_tag: ${report.observations.current_image_tag || "<missing>"}`,
    `- target_image_tag: ${report.observations.target_image_tag || "<missing>"}`,
    `- rollback_image_tag: ${report.observations.rollback_image_tag || "<missing>"}`,
    `- NAS image proof: ${report.observations.nas_image_proof_status || "<not run>"} / accepted=${String(report.observations.nas_image_proof_accepted)}`,
    `- Worker proof: ${report.observations.worker_env_status || "<not run>"} / accepted=${String(report.observations.worker_proof_accepted)}`,
    `- Disk proof: ${report.observations.nas_disk_proof_status || "<not run>"} / accepted=${String(report.observations.nas_disk_proof_accepted)}`,
    `- Release inputs: ${report.observations.release_inputs_status || "<not run>"}`,
    `- Release input blockers: ${report.observations.release_input_blockers.join(", ") || "none"}`,
    `- Staging runbook: ${report.observations.staging_runbook_status || "<not run>"}`,
    `- Staging execution blockers: ${report.observations.staging_execution_blockers.join(", ") || "none"}`,
    `- Staging review blockers: ${report.observations.staging_blockers.join(", ") || "none"}`,
    `- Run errors: ${report.observations.run_errors.join(" / ") || "none"}`,
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Intake | Blocks Inputs | Blocks Staging | Blocks Deploy | Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => `| ${item.id} | ${item.category} | ${item.status} | ${item.blocks_intake ? "yes" : "no"} | ${item.blocks_release_inputs ? "yes" : "no"} | ${item.blocks_staging_execution ? "yes" : "no"} | ${item.blocks_docker_deploy ? "yes" : "no"} | ${item.evidence.replace(/\|/g, "/")} |`),
    "",
    "## Summary",
    "",
    `- Intake blockers: ${report.summary.intake_blockers.join(", ") || "none"}`,
    `- Release input blockers: ${report.summary.release_input_blockers.join(", ") || "none"}`,
    `- Staging execution blockers: ${report.summary.staging_execution_blockers.join(", ") || "none"}`,
    `- Docker deploy blockers: ${report.summary.docker_deploy_blockers.join(", ") || "none"}`,
    "",
    "## Next Actions",
    "",
    ...report.next_actions.map((item) => `- ${item}`),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "<not written>"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "<not written>"}`,
    ""
  ];

  return lines.join("\n");
}

export async function runAdminDockerNasReleaseInputsIntake(input: {
  returned_dir?: string;
  prestaging_handoff_report_path?: string;
  candidate_ref_proof_report_path?: string;
  local_docker_smoke_report_path?: string;
  parity_plan_report_path?: string;
  candidate_contract_proof_report_path?: string;
  cutter_compatibility_proof_report_path?: string;
  output_dir?: string;
  artifact_dir?: string;
  generated_at?: string;
  command?: string;
}): Promise<AdminDockerNasReleaseInputsIntakeReport> {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const timestamp = timestampForFile(new Date(generatedAt));
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const artifactDir = input.artifact_dir ?? DEFAULT_ARTIFACT_DIR;
  const returnedDir = input.returned_dir ?? process.env.MIXLAB_ADMIN_DOCKER_NAS_RETURNED_DIR ?? "";
  const prestagingPath = input.prestaging_handoff_report_path ?? await latestArtifact(artifactDir, "admin-docker-prestaging-handoff-");
  const candidateRefPath = input.candidate_ref_proof_report_path ?? await latestArtifact(artifactDir, "admin-docker-candidate-ref-proof-");
  const localSmokePath = input.local_docker_smoke_report_path ?? await latestArtifact(artifactDir, "admin-docker-local-smoke-");
  const parityPath = input.parity_plan_report_path ?? await latestArtifact(artifactDir, "admin-docker-version-parity-plan-");
  const candidateContractPath = input.candidate_contract_proof_report_path ?? await latestArtifact(artifactDir, "admin-docker-candidate-contract-proof-");
  const cutterPath = input.cutter_compatibility_proof_report_path ?? await latestArtifact(artifactDir, "admin-cutter-compatibility-proof-");
  const files = await returnedFiles(returnedDir);
  const missing = missingReturnedFiles(files);
  const runErrors: string[] = [];
  let nasImageProof: AdminDockerNasImageProofReport | undefined;
  let workerProof: AdminWorkerEnvProofReport | undefined;
  let diskProof: AdminDockerNasDiskProofReport | undefined;
  let releaseInputs: AdminDockerReleaseInputsReport | undefined;
  let stagingRunbook: AdminDockerStagingRunbookReport | undefined;

  if (missing.length === 0) {
    try {
      nasImageProof = await runAdminDockerNasImageProof({
        env_file_path: requiredFile(files, "nas_env"),
        inspect_json_path: requiredFile(files, "nas_inspect"),
        output_dir: outputDir,
        generated_at: generatedAt,
        command: input.command ?? process.argv.join(" ")
      });
      workerProof = await runAdminWorkerEnvProof({
        env_file_path: requiredFile(files, "worker_env"),
        inspect_json_path: requiredFile(files, "worker_inspect"),
        output_dir: outputDir,
        generated_at: generatedAt,
        command: input.command ?? process.argv.join(" ")
      });
      diskProof = await runAdminDockerNasDiskProof({
        disk_proof_json_path: requiredFile(files, "disk_proof"),
        output_dir: outputDir,
        generated_at: generatedAt,
        command: input.command ?? process.argv.join(" ")
      });
      releaseInputs = await runAdminDockerReleaseInputs({
        prestaging_handoff_report_path: prestagingPath,
        candidate_ref_proof_report_path: candidateRefPath,
        nas_image_proof_report_path: nasImageProof.artifacts?.json_path,
        output_dir: outputDir,
        generated_at: generatedAt,
        command: input.command ?? process.argv.join(" ")
      });
      const inputs = asRecord(releaseInputs.inputs);
      stagingRunbook = await runAdminDockerStagingRunbook({
        local_docker_smoke_report_path: localSmokePath,
        parity_plan_report_path: parityPath,
        candidate_contract_proof_report_path: candidateContractPath,
        worker_env_proof_report_path: workerProof.artifacts?.json_path,
        cutter_compatibility_proof_report_path: cutterPath,
        release_inputs_report_path: releaseInputs.artifacts?.json_path,
        nas_disk_proof_report_path: diskProof.artifacts?.json_path,
        current_image_tag: asString(inputs.current_image_tag),
        target_image_tag: asString(inputs.target_image_tag),
        rollback_image_tag: asString(inputs.rollback_image_tag),
        image_push_approval: process.env.MIXLAB_DOCKER_PUSH_APPROVAL,
        output_dir: outputDir,
        artifact_dir: artifactDir,
        generated_at: generatedAt,
        command: input.command ?? process.argv.join(" ")
      });
    } catch (error) {
      runErrors.push(errorMessage(error));
    }
  }

  const releaseInputsSummary = asRecord(releaseInputs?.summary);
  const stagingSummary = asRecord(stagingRunbook?.summary);
  const generatedReports: GeneratedReports = {
    nas_image_proof_report: nasImageProof?.artifacts?.json_path ?? "",
    worker_env_proof_report: workerProof?.artifacts?.json_path ?? "",
    nas_disk_proof_report: diskProof?.artifacts?.json_path ?? "",
    release_inputs_report: releaseInputs?.artifacts?.json_path ?? "",
    staging_runbook_report: stagingRunbook?.artifacts?.json_path ?? ""
  };
  const currentTag = asString(asRecord(releaseInputs?.inputs).current_image_tag);
  const targetTag = asString(asRecord(releaseInputs?.inputs).target_image_tag);
  const rollbackTag = asString(asRecord(releaseInputs?.inputs).rollback_image_tag);
  const gates = [
    gate({
      id: "intake-no-side-effects",
      title: "NAS release-input intake is local validation only",
      category: "safety",
      status: "pass",
      evidence: "This report reads returned sanitized files and local artifacts only; it does not contact NAS, Docker, GitHub, Admin API, or Cutter.",
      blocks_intake: false,
      blocks_release_inputs: false,
      blocks_staging_execution: false,
      blocks_docker_deploy: false
    }),
    gate({
      id: "returned-dir-provided",
      title: "Returned NAS evidence directory is provided",
      category: "returned-evidence",
      status: returnedDir ? "pass" : "blocked",
      evidence: returnedDir || "MIXLAB_ADMIN_DOCKER_NAS_RETURNED_DIR is not provided.",
      blocks_intake: !returnedDir,
      blocks_release_inputs: true,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Copy admin-docker-release-inputs/ from the NAS collector back to the Mac repository and provide its path."
    }),
    gate({
      id: "returned-files-complete",
      title: "Returned NAS evidence directory contains all required sanitized files",
      category: "returned-evidence",
      status: missing.length === 0 ? "pass" : "blocked",
      evidence: missing.length === 0 ? "all required files present" : `missing: ${missing.join(", ")}`,
      blocks_intake: missing.length > 0,
      blocks_release_inputs: true,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: `Returned directory must contain ${Object.values(RETURNED_FILES).join(", ")}.`
    }),
    gate({
      id: "nas-image-proof-accepted",
      title: "NAS current image proof is accepted",
      category: "proof",
      status: nasImageProof?.proof_accepted ? "pass" : "blocked",
      evidence: nasImageProof ? `status=${nasImageProof.result.status}, blockers=${nasImageProof.summary.release_input_blockers.join(", ") || "none"}` : "not generated",
      blocks_intake: true,
      blocks_release_inputs: !nasImageProof?.proof_accepted,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Run validate:admin-docker-nas-image-proof with returned admin-docker-current.env and inspect JSON."
    }),
    gate({
      id: "admin-worker-proof-accepted",
      title: "Admin worker disabled-env proof is accepted",
      category: "proof",
      status: workerProof?.proof_accepted ? "pass" : "blocked",
      evidence: workerProof ? `status=${workerProof.result.status}, blockers=${workerProof.summary.upload_blockers.join(", ") || "none"}` : "not generated",
      blocks_intake: true,
      blocks_release_inputs: false,
      blocks_staging_execution: false,
      blocks_docker_deploy: true,
      required_evidence: "Run validate:admin-worker-env-proof with returned admin-worker.env and inspect JSON."
    }),
    gate({
      id: "nas-disk-proof-accepted",
      title: "NAS disk proof is accepted",
      category: "proof",
      status: diskProof?.proof_accepted ? "pass" : "blocked",
      evidence: diskProof ? `status=${diskProof.result.status}, blockers=${diskProof.summary.staging_execution_blockers.join(", ") || "none"}` : "not generated",
      blocks_intake: true,
      blocks_release_inputs: false,
      blocks_staging_execution: !diskProof?.proof_accepted,
      blocks_docker_deploy: true,
      required_evidence: "Run validate:admin-docker-nas-disk-proof with returned admin-docker-disk-proof.json."
    }),
    gate({
      id: "release-inputs-generated",
      title: "Release inputs were regenerated with accepted NAS image proof",
      category: "release-inputs",
      status: releaseInputs ? "pass" : "blocked",
      evidence: generatedReports.release_inputs_report || "not generated",
      blocks_intake: !releaseInputs,
      blocks_release_inputs: !releaseInputs,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Regenerate validate:admin-docker-release-inputs with prestaging, candidate-ref, and accepted NAS image proof."
    }),
    gate({
      id: "release-inputs-ready",
      title: "Release inputs are ready for separate release decision",
      category: "release-inputs",
      status: releaseInputs?.release_inputs_ready ? "pass" : "blocked",
      evidence: releaseInputs ? `status=${releaseInputs.result.status}, blockers=${stringArray(releaseInputsSummary.release_input_blockers).join(", ") || "none"}` : "not generated",
      blocks_intake: false,
      blocks_release_inputs: !releaseInputs?.release_inputs_ready,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Release inputs must have release_inputs_ready=true before any explicit push_images=true decision."
    }),
    gate({
      id: "staging-runbook-generated",
      title: "Staging runbook was regenerated from returned NAS evidence",
      category: "runbook",
      status: stagingRunbook ? "pass" : "blocked",
      evidence: generatedReports.staging_runbook_report || "not generated",
      blocks_intake: !stagingRunbook,
      blocks_release_inputs: false,
      blocks_staging_execution: !stagingRunbook,
      blocks_docker_deploy: true,
      required_evidence: "Regenerate validate:admin-docker-staging-runbook after release inputs and disk proof are available."
    }),
    gate({
      id: "staging-runbook-remains-nondeploy",
      title: "Staging runbook does not approve deploy",
      category: "safety",
      status: stagingRunbook?.docker_deploy_allowed === true ? "fail" : "pass",
      evidence: `staging_runbook.docker_deploy_allowed=${String(stagingRunbook?.docker_deploy_allowed ?? false)}`,
      blocks_intake: true,
      blocks_release_inputs: false,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Runbook generation must remain a planning gate with docker_deploy_allowed=false."
    })
  ];
  const summary = summarize(gates);
  const failed = summary.failed > 0 || runErrors.length > 0;
  const intakeComplete = summary.intake_blockers.length === 0 && !failed;
  const report: AdminDockerNasReleaseInputsIntakeReport = {
    schema_version: "1.0",
    generated_at: generatedAt,
    command: input.command ?? process.argv.join(" "),
    mode: "admin-docker-nas-release-inputs-intake",
    sources: {
      returned_dir: returnedDir,
      prestaging_handoff_report: prestagingPath,
      candidate_ref_proof_report: candidateRefPath,
      local_docker_smoke_report: localSmokePath,
      parity_plan_report: parityPath,
      candidate_contract_proof_report: candidateContractPath,
      cutter_compatibility_proof_report: cutterPath
    },
    returned_files: files,
    generated_reports: generatedReports,
    intake_complete: intakeComplete,
    release_inputs_ready: Boolean(releaseInputs?.release_inputs_ready),
    staging_execution_ready: Boolean(stagingRunbook?.staging_execution_ready),
    staging_review_ready: Boolean(stagingRunbook?.staging_review_ready),
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    observations: {
      current_image_tag: currentTag,
      target_image_tag: targetTag,
      rollback_image_tag: rollbackTag,
      nas_image_proof_status: resultStatus(nasImageProof),
      nas_image_proof_accepted: asBoolean(nasImageProof?.proof_accepted),
      worker_env_status: resultStatus(workerProof),
      worker_proof_accepted: asBoolean(workerProof?.proof_accepted),
      nas_disk_proof_status: resultStatus(diskProof),
      nas_disk_proof_accepted: asBoolean(diskProof?.proof_accepted),
      release_inputs_status: resultStatus(releaseInputs),
      release_input_blockers: stringArray(releaseInputsSummary.release_input_blockers),
      staging_runbook_status: resultStatus(stagingRunbook),
      staging_execution_blockers: stringArray(stagingSummary.staging_execution_blockers),
      staging_blockers: stringArray(stagingSummary.staging_blockers),
      run_errors: runErrors
    },
    gates,
    summary,
    next_actions: [],
    result: {
      status: failed ? "failed" : intakeComplete ? "intake-complete" : "blocked",
      summary: failed
        ? "NAS release-input returned evidence intake failed while running local validators."
        : intakeComplete
          ? "NAS release-input returned evidence has been fully consumed into local proof reports; release and staging gates still require their own approval."
          : "NAS release-input returned evidence intake is blocked until the sanitized returned files are complete and accepted."
    },
    artifacts: null
  };
  const reportWithActions = {
    ...report,
    next_actions: nextActions(report)
  };
  const jsonPath = path.join(outputDir, `admin-docker-nas-release-inputs-intake-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-nas-release-inputs-intake-${timestamp}.md`);
  const reportWithArtifacts: AdminDockerNasReleaseInputsIntakeReport = {
    ...reportWithActions,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(reportWithArtifacts, null, 2)}\n`);
  await writeFile(markdownPath, toMarkdown(reportWithArtifacts));

  return reportWithArtifacts;
}

async function main(): Promise<void> {
  const report = await runAdminDockerNasReleaseInputsIntake({
    returned_dir: process.env.MIXLAB_ADMIN_DOCKER_NAS_RETURNED_DIR ?? process.argv[2],
    prestaging_handoff_report_path: process.env.MIXLAB_ADMIN_DOCKER_PRESTAGING_HANDOFF_REPORT,
    candidate_ref_proof_report_path: process.env.MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_PROOF_REPORT,
    local_docker_smoke_report_path: process.env.MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_REPORT,
    parity_plan_report_path: process.env.MIXLAB_DOCKER_PARITY_PLAN_REPORT,
    candidate_contract_proof_report_path: process.env.MIXLAB_ADMIN_DOCKER_CANDIDATE_CONTRACT_PROOF_REPORT,
    cutter_compatibility_proof_report_path: process.env.MIXLAB_CUTTER_COMPATIBILITY_PROOF_REPORT,
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    artifact_dir: process.env.MIXLAB_ACCEPTANCE_ARTIFACT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    intake_complete: report.intake_complete,
    release_inputs_ready: report.release_inputs_ready,
    staging_execution_ready: report.staging_execution_ready,
    push_execution_allowed: report.push_execution_allowed,
    docker_deploy_allowed: report.docker_deploy_allowed,
    current_image_tag: report.observations.current_image_tag,
    target_image_tag: report.observations.target_image_tag,
    rollback_image_tag: report.observations.rollback_image_tag,
    intake_blockers: report.summary.intake_blockers,
    release_input_blockers: report.summary.release_input_blockers,
    staging_execution_blockers: report.summary.staging_execution_blockers,
    docker_deploy_blockers: report.summary.docker_deploy_blockers,
    json_path: report.artifacts?.json_path,
    markdown_path: report.artifacts?.markdown_path
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exit(1);
  });
}
