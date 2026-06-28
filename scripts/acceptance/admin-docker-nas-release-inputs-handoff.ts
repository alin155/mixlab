import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ARTIFACT_DIR = "docs/acceptance/artifacts";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const COLLECTOR_SOURCE = path.join(path.dirname(fileURLToPath(import.meta.url)), "admin-docker-nas-release-inputs-collector.sh");

type GateStatus = "pass" | "blocked" | "fail";
type GateCategory = "safety" | "source" | "candidate" | "nas-collection" | "release-boundary";

interface HandoffGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_handoff: boolean;
  blocks_release_inputs: boolean;
  blocks_push_execution: boolean;
  blocks_docker_deploy: boolean;
  required_evidence?: string;
}

interface HandoffSummary {
  total: number;
  passed: number;
  blocked: number;
  failed: number;
  handoff_blockers: string[];
  release_input_blockers: string[];
  push_execution_blockers: string[];
  docker_deploy_blockers: string[];
}

interface HandoffSources {
  prestaging_handoff_report: string;
  candidate_ref_proof_report: string;
  release_inputs_report: string;
  collector_source: string;
}

interface HandoffFile {
  path: string;
  sha256: string;
  size_bytes: number;
  executable: boolean;
}

export interface AdminDockerNasReleaseInputsHandoffReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-nas-release-inputs-handoff";
  sources: HandoffSources;
  handoff_package_ready: boolean;
  push_execution_allowed: false;
  docker_deploy_allowed: false;
  observations: {
    candidate_sha: string;
    candidate_release_ref: string;
    candidate_ref_proof_accepted: boolean | null;
    candidate_ref_docker_deploy_allowed: boolean | null;
    release_inputs_status: string;
    release_inputs_ready: boolean | null;
    release_inputs_push_execution_allowed: boolean | null;
    release_inputs_docker_deploy_allowed: boolean | null;
    release_input_blockers: string[];
    expected_remaining_release_input_blockers: string[];
    unexpected_release_input_blockers: string[];
    missing_expected_release_input_blockers: string[];
  };
  operator_handoff: {
    bundle_dir: string;
    nas_side_command: string;
    copy_back_expectation: string;
    local_validation_commands: string[];
    forbidden_actions: string[];
  };
  gates: HandoffGate[];
  summary: HandoffSummary;
  next_actions: string[];
  artifacts: {
    json_path: string;
    markdown_path: string;
    bundle_dir: string;
    manifest_path: string;
    readme_path: string;
    collector_path: string;
    nas_runner_path: string;
    local_validator_path: string;
    local_installer_path: string;
    latest_json_path?: string;
    latest_markdown_path?: string;
    latest_bundle_dir?: string;
    latest_manifest_path?: string;
    latest_readme_path?: string;
  } | null;
  result: {
    status: "ready-for-nas-collection" | "blocked" | "failed";
    summary: string;
  };
}

interface BundleManifest {
  schema_version: "1.0";
  mode: "admin-docker-nas-release-inputs-handoff";
  generated_at: string;
  candidate_sha: string;
  candidate_release_ref: string;
  source_reports: HandoffSources;
  files: HandoffFile[];
  safety: {
    push_execution_allowed: false;
    docker_deploy_allowed: false;
    nas_writes_allowed: false;
    worker_start_allowed: false;
  };
}

const EXPECTED_REMAINING_RELEASE_INPUT_BLOCKERS = [
  "nas-image-proof-provided",
  "nas-image-proof-accepted",
  "nas-proof-does-not-approve-deploy",
  "current-and-rollback-tags-present",
  "rollback-tag-matches-current",
  "target-tag-differs-from-current",
  "workflow-command-has-no-placeholders"
];

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

function gate(input: HandoffGate): HandoffGate {
  return input;
}

function summarize(gates: HandoffGate[]): HandoffSummary {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    failed: gates.filter((item) => item.status === "fail").length,
    handoff_blockers: gates
      .filter((item) => item.blocks_handoff && item.status !== "pass")
      .map((item) => item.id),
    release_input_blockers: gates
      .filter((item) => item.blocks_release_inputs && item.status !== "pass")
      .map((item) => item.id),
    push_execution_blockers: gates
      .filter((item) => item.blocks_push_execution && item.status !== "pass")
      .map((item) => item.id),
    docker_deploy_blockers: gates
      .filter((item) => item.blocks_docker_deploy && item.status !== "pass")
      .map((item) => item.id)
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function diff(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);

  return uniqueSorted(left.filter((item) => !rightSet.has(item)));
}

function localValidationCommands(input: {
  copiedDir: string;
  artifactDir: string;
  prestagingPath: string;
  candidateRefPath: string;
  targetSha: string;
}): string[] {
  return [
    [
      `MIXLAB_ADMIN_DOCKER_NAS_ENV_FILE=${input.copiedDir}/admin-docker-current.env`,
      `MIXLAB_ADMIN_DOCKER_NAS_INSPECT_JSON=${input.copiedDir}/admin-docker-current.inspect.json`,
      `MIXLAB_ACCEPTANCE_OUTPUT_DIR=${input.artifactDir}`,
      "npm run validate:admin-docker-nas-image-proof"
    ].join(" \\\n  "),
    [
      `MIXLAB_ADMIN_WORKER_ENV_FILE=${input.copiedDir}/admin-worker.env`,
      `MIXLAB_ADMIN_WORKER_INSPECT_JSON=${input.copiedDir}/admin-worker.inspect.json`,
      `MIXLAB_ACCEPTANCE_OUTPUT_DIR=${input.artifactDir}`,
      "npm run validate:admin-worker-env-proof"
    ].join(" \\\n  "),
    [
      `MIXLAB_ADMIN_DOCKER_NAS_DISK_PROOF_JSON=${input.copiedDir}/admin-docker-disk-proof.json`,
      `MIXLAB_ACCEPTANCE_OUTPUT_DIR=${input.artifactDir}`,
      "npm run validate:admin-docker-nas-disk-proof"
    ].join(" \\\n  "),
    [
      `MIXLAB_ADMIN_DOCKER_PRESTAGING_HANDOFF_REPORT=${input.prestagingPath}`,
      `MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_PROOF_REPORT=${input.candidateRefPath}`,
      `${"MIXLAB_ADMIN_DOCKER_NAS_IMAGE_PROOF_REPORT"}=${input.artifactDir}/admin-docker-nas-image-proof-*.json`,
      `MIXLAB_ACCEPTANCE_OUTPUT_DIR=${input.artifactDir}`,
      "npm run validate:admin-docker-release-inputs"
    ].join(" \\\n  "),
    [
      `${"MIXLAB_ADMIN_DOCKER_RELEASE_INPUTS_REPORT"}=${input.artifactDir}/admin-docker-release-inputs-*.json`,
      `${"MIXLAB_ADMIN_DOCKER_NAS_DISK_PROOF_REPORT"}=${input.artifactDir}/admin-docker-nas-disk-proof-*.json`,
      "MIXLAB_DOCKER_CURRENT_IMAGE_TAG=<accepted-current-image-tag>",
      `MIXLAB_DOCKER_TARGET_IMAGE_TAG=${input.targetSha || "<candidate-sha>"}`,
      "MIXLAB_DOCKER_ROLLBACK_IMAGE_TAG=<same-as-current-image-tag>",
      `MIXLAB_ACCEPTANCE_OUTPUT_DIR=${input.artifactDir}`,
      "npm run validate:admin-docker-staging-runbook"
    ].join(" \\\n  ")
  ];
}

function forbiddenActions(): string[] {
  return [
    "Do not run push_images=true from this handoff package.",
    "Do not edit NAS .env during evidence collection.",
    "Do not restart NAS containers during evidence collection.",
    "Do not enable admin-worker or ready-publish workers.",
    "Do not run scan apply, index repair, snapshot restore, or production preprocessing from these instructions.",
    "Do not copy full .env, full docker inspect output, ASR keys, bearer tokens, or private transcript text into the returned evidence."
  ];
}

function nextActions(report: AdminDockerNasReleaseInputsHandoffReport): string[] {
  if (!report.handoff_package_ready) {
    return [
      "Do not use this handoff package yet.",
      `Resolve handoff blockers: ${report.summary.handoff_blockers.join(", ") || "unknown"}.`
    ];
  }

  return [
    "If the NAS Compose project folder is mounted on this Mac, run: sh ./local/install-nas-runner.sh <nas-compose-project-dir>.",
    "Otherwise copy the handoff bundle's nas/ folder to the NAS Compose project folder that contains docker-compose.yml and .env.",
    "On the NAS shell host, run the quickstart script: sh ./nas/RUN_ON_NAS.sh",
    "Copy the generated admin-docker-release-inputs/ folder back to the Mac repository.",
    "Run the local validator: sh ./local/validate-returned-evidence.sh <copied-admin-docker-release-inputs-dir>.",
    "Stop if any returned proof is blocked, if release_inputs_ready=false, or if the staging runbook carries nas-disk-risk-carried-forward."
  ];
}

export function buildAdminDockerNasReleaseInputsHandoffReport(input: {
  generated_at: string;
  command: string;
  prestaging_handoff_report_path?: string;
  prestaging_handoff_report?: unknown;
  candidate_ref_proof_report_path?: string;
  candidate_ref_proof_report?: unknown;
  release_inputs_report_path?: string;
  release_inputs_report?: unknown;
  collector_source_path?: string;
  bundle_dir?: string;
  artifact_dir?: string;
}): AdminDockerNasReleaseInputsHandoffReport {
  const prestaging = asRecord(input.prestaging_handoff_report);
  const candidateRef = asRecord(input.candidate_ref_proof_report);
  const releaseInputs = asRecord(input.release_inputs_report);
  const candidate = asRecord(candidateRef.candidate);
  const releaseInputObservations = asRecord(releaseInputs.observations);
  const releaseInputSummary = asRecord(releaseInputs.summary);
  const targetSha = asString(candidate.expected_sha) || asString(releaseInputObservations.candidate_ref_expected_sha);
  const releaseRef = asString(candidate.expected_tag) || asString(releaseInputObservations.candidate_ref_expected_tag);
  const candidateRefAccepted = asBoolean(candidateRef.candidate_ref_proof_accepted);
  const candidateRefDeployAllowed = asBoolean(candidateRef.docker_deploy_allowed);
  const releaseInputsReady = asBoolean(releaseInputs.release_inputs_ready);
  const releaseInputsPushAllowed = asBoolean(releaseInputs.push_execution_allowed);
  const releaseInputsDeployAllowed = asBoolean(releaseInputs.docker_deploy_allowed);
  const releaseInputBlockers = stringArray(releaseInputSummary.release_input_blockers);
  const unexpectedReleaseInputBlockers = diff(releaseInputBlockers, EXPECTED_REMAINING_RELEASE_INPUT_BLOCKERS);
  const missingExpectedReleaseInputBlockers = diff(EXPECTED_REMAINING_RELEASE_INPUT_BLOCKERS, releaseInputBlockers);
  const prestagingProvided = Boolean(input.prestaging_handoff_report_path && input.prestaging_handoff_report);
  const candidateProvided = Boolean(input.candidate_ref_proof_report_path && input.candidate_ref_proof_report);
  const releaseInputsProvided = Boolean(input.release_inputs_report_path && input.release_inputs_report);
  const collectorProvided = Boolean(input.collector_source_path);
  const releaseInputsStatus = resultStatus(releaseInputs);
  const releaseInputsOnlyBlockedByNasCollection = releaseInputBlockers.length > 0 &&
    unexpectedReleaseInputBlockers.length === 0 &&
    missingExpectedReleaseInputBlockers.length === 0;
  const gates = [
    gate({
      id: "handoff-no-side-effects",
      title: "NAS release-input handoff generation is local and read-only",
      category: "safety",
      status: "pass",
      evidence: "This report reads existing local JSON reports and copies the sanitized NAS collector; it does not contact NAS, Docker, GitHub, Admin API, or Cutter.",
      blocks_handoff: false,
      blocks_release_inputs: false,
      blocks_push_execution: false,
      blocks_docker_deploy: false
    }),
    gate({
      id: "prestaging-handoff-provided",
      title: "Pre-staging handoff report is provided",
      category: "source",
      status: prestagingProvided ? "pass" : "blocked",
      evidence: input.prestaging_handoff_report_path || "missing",
      blocks_handoff: !prestagingProvided,
      blocks_release_inputs: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Run validate:admin-docker-prestaging-handoff and provide the JSON report."
    }),
    gate({
      id: "candidate-ref-proof-provided",
      title: "Candidate ref proof report is provided",
      category: "source",
      status: candidateProvided ? "pass" : "blocked",
      evidence: input.candidate_ref_proof_report_path || "missing",
      blocks_handoff: !candidateProvided,
      blocks_release_inputs: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Run validate:admin-docker-candidate-ref-proof against the candidate tag push_images=false workflow artifact."
    }),
    gate({
      id: "release-inputs-report-provided",
      title: "Current release-inputs report is provided",
      category: "source",
      status: releaseInputsProvided ? "pass" : "blocked",
      evidence: input.release_inputs_report_path || "missing",
      blocks_handoff: !releaseInputsProvided,
      blocks_release_inputs: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Run validate:admin-docker-release-inputs with prestaging and candidate-ref proof before preparing the NAS handoff."
    }),
    gate({
      id: "collector-source-provided",
      title: "Sanitized NAS collector source is available",
      category: "nas-collection",
      status: collectorProvided ? "pass" : "blocked",
      evidence: input.collector_source_path || "missing",
      blocks_handoff: !collectorProvided,
      blocks_release_inputs: false,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "scripts/acceptance/admin-docker-nas-release-inputs-collector.sh must exist."
    }),
    gate({
      id: "candidate-ref-proof-accepted",
      title: "Candidate ref proof is accepted",
      category: "candidate",
      status: candidateRefAccepted ? "pass" : "blocked",
      evidence: `candidate_ref_proof_accepted=${String(candidateRefAccepted)}`,
      blocks_handoff: !candidateRefAccepted,
      blocks_release_inputs: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Candidate ref proof must show the tag points to the smoked candidate SHA and push_images=false dry-run passed."
    }),
    gate({
      id: "candidate-ref-proof-does-not-approve-deploy",
      title: "Candidate ref proof does not approve deploy",
      category: "safety",
      status: candidateRefDeployAllowed === true ? "fail" : candidateRefDeployAllowed === false ? "pass" : "blocked",
      evidence: `candidate_ref_proof.docker_deploy_allowed=${String(candidateRefDeployAllowed)}`,
      blocks_handoff: true,
      blocks_release_inputs: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Candidate ref proof must remain evidence-only with docker_deploy_allowed=false."
    }),
    gate({
      id: "release-inputs-still-blocked-for-nas-collection",
      title: "Release inputs are blocked only by NAS current-image collection",
      category: "release-boundary",
      status: releaseInputsOnlyBlockedByNasCollection ? "pass" : "blocked",
      evidence: `status=${releaseInputsStatus || "missing"}, release_input_blockers=${releaseInputBlockers.join(", ") || "none"}`,
      blocks_handoff: !releaseInputsOnlyBlockedByNasCollection,
      blocks_release_inputs: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "The current release-inputs report should be blocked only by nas-image/current/rollback placeholder gates before NAS collection."
    }),
    gate({
      id: "release-inputs-do-not-approve-push-or-deploy",
      title: "Release-inputs report does not approve push or deploy",
      category: "safety",
      status: releaseInputsPushAllowed === true || releaseInputsDeployAllowed === true ? "fail" : "pass",
      evidence: `push_execution_allowed=${String(releaseInputsPushAllowed)}, docker_deploy_allowed=${String(releaseInputsDeployAllowed)}`,
      blocks_handoff: true,
      blocks_release_inputs: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "This handoff package must not be based on a report that approves push or deploy."
    })
  ];
  const summary = summarize(gates);
  const failed = summary.failed > 0;
  const handoffReady = summary.handoff_blockers.length === 0;
  const copiedDir = "<copied-admin-docker-release-inputs-dir>";
  const artifactDir = input.artifact_dir ?? DEFAULT_ARTIFACT_DIR;
  const localCommands = localValidationCommands({
    copiedDir,
    artifactDir,
    prestagingPath: input.prestaging_handoff_report_path ?? "<admin-docker-prestaging-handoff.json>",
    candidateRefPath: input.candidate_ref_proof_report_path ?? "<admin-docker-candidate-ref-proof.json>",
    targetSha
  });
  const report: AdminDockerNasReleaseInputsHandoffReport = {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-nas-release-inputs-handoff",
    sources: {
      prestaging_handoff_report: input.prestaging_handoff_report_path ?? "",
      candidate_ref_proof_report: input.candidate_ref_proof_report_path ?? "",
      release_inputs_report: input.release_inputs_report_path ?? "",
      collector_source: input.collector_source_path ?? ""
    },
    handoff_package_ready: handoffReady,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    observations: {
      candidate_sha: targetSha,
      candidate_release_ref: releaseRef,
      candidate_ref_proof_accepted: candidateRefAccepted,
      candidate_ref_docker_deploy_allowed: candidateRefDeployAllowed,
      release_inputs_status: releaseInputsStatus,
      release_inputs_ready: releaseInputsReady,
      release_inputs_push_execution_allowed: releaseInputsPushAllowed,
      release_inputs_docker_deploy_allowed: releaseInputsDeployAllowed,
      release_input_blockers: releaseInputBlockers,
      expected_remaining_release_input_blockers: EXPECTED_REMAINING_RELEASE_INPUT_BLOCKERS,
      unexpected_release_input_blockers: unexpectedReleaseInputBlockers,
      missing_expected_release_input_blockers: missingExpectedReleaseInputBlockers
    },
    operator_handoff: {
      bundle_dir: input.bundle_dir ?? "",
      nas_side_command: "sh ./nas/RUN_ON_NAS.sh",
      copy_back_expectation: "Copy the generated admin-docker-release-inputs/ folder back to the Mac repo without adding full .env, secrets, or full docker inspect output.",
      local_validation_commands: localCommands,
      forbidden_actions: forbiddenActions()
    },
    gates,
    summary,
    next_actions: [],
    artifacts: null,
    result: {
      status: failed ? "failed" : handoffReady ? "ready-for-nas-collection" : "blocked",
      summary: handoffReady
        ? "NAS release-input evidence handoff is ready for read-only collection on the NAS Compose host."
        : "NAS release-input evidence handoff is blocked until the source reports and release-input boundary are clean."
    }
  };

  return {
    ...report,
    next_actions: nextActions(report)
  };
}

export function toMarkdown(report: AdminDockerNasReleaseInputsHandoffReport): string {
  const artifacts = report.artifacts;
  const artifactLines = [
    `- JSON: ${artifacts?.json_path ?? "<not written>"}`,
    `- Markdown: ${artifacts?.markdown_path ?? "<not written>"}`,
    `- Bundle dir: ${artifacts?.bundle_dir ?? "<not written>"}`,
    `- Manifest: ${artifacts?.manifest_path ?? "<not written>"}`,
    `- README: ${artifacts?.readme_path ?? "<not written>"}`,
    `- Collector: ${artifacts?.collector_path ?? "<not written>"}`,
    `- NAS runner: ${artifacts?.nas_runner_path ?? "<not written>"}`,
    `- Local installer: ${artifacts?.local_installer_path ?? "<not written>"}`,
    `- Local validator: ${artifacts?.local_validator_path ?? "<not written>"}`
  ];
  if (artifacts?.latest_json_path || artifacts?.latest_markdown_path || artifacts?.latest_bundle_dir || artifacts?.latest_readme_path) {
    artifactLines.push(
      `- Latest JSON: ${artifacts.latest_json_path ?? "<not written>"}`,
      `- Latest Markdown: ${artifacts.latest_markdown_path ?? "<not written>"}`,
      `- Latest bundle dir: ${artifacts.latest_bundle_dir ?? "<not written>"}`,
      `- Latest README: ${artifacts.latest_readme_path ?? "<not written>"}`
    );
  }
  const lines = [
    "# Admin Docker NAS Release Inputs Handoff",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Result: ${report.result.status}`,
    `Handoff package ready: ${report.handoff_package_ready ? "yes" : "no"}`,
    "Push execution allowed: no",
    "Docker deploy allowed: no",
    "",
    "## Sources",
    "",
    `- Pre-staging handoff: ${report.sources.prestaging_handoff_report || "<missing>"}`,
    `- Candidate ref proof: ${report.sources.candidate_ref_proof_report || "<missing>"}`,
    `- Release inputs: ${report.sources.release_inputs_report || "<missing>"}`,
    `- Collector source: ${report.sources.collector_source || "<missing>"}`,
    "",
    "## Candidate",
    "",
    `- candidate_sha: ${report.observations.candidate_sha || "<missing>"}`,
    `- candidate_release_ref: ${report.observations.candidate_release_ref || "<missing>"}`,
    `- candidate_ref_proof_accepted: ${String(report.observations.candidate_ref_proof_accepted)}`,
    "",
    "## NAS Side",
    "",
    `- Bundle dir: ${report.operator_handoff.bundle_dir || "<not written>"}`,
    `- Run from the NAS Compose project folder: ${report.operator_handoff.nas_side_command}`,
    `- Copy back: ${report.operator_handoff.copy_back_expectation}`,
    "",
    "### Quickstart Scripts",
    "",
    `- NAS runner: ${report.artifacts?.nas_runner_path ?? "<not written>"}`,
    `- Local installer: ${report.artifacts?.local_installer_path ?? "<not written>"}`,
    `- Local validator: ${report.artifacts?.local_validator_path ?? "<not written>"}`,
    "",
    "```sh",
    "sh ./local/install-nas-runner.sh <nas-compose-project-dir>",
    "```",
    "",
    "```sh",
    "sh ./nas/RUN_ON_NAS.sh",
    "```",
    "",
    "```sh",
    "sh ./local/validate-returned-evidence.sh <copied-admin-docker-release-inputs-dir>",
    "```",
    "",
    "## Local Validation Commands",
    "",
    ...report.operator_handoff.local_validation_commands.flatMap((command) => [
      "```sh",
      command,
      "```",
      ""
    ]),
    "## Forbidden Actions",
    "",
    ...report.operator_handoff.forbidden_actions.map((item) => `- ${item}`),
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Handoff | Blocks Inputs | Blocks Push | Blocks Deploy | Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => `| ${item.id} | ${item.category} | ${item.status} | ${item.blocks_handoff ? "yes" : "no"} | ${item.blocks_release_inputs ? "yes" : "no"} | ${item.blocks_push_execution ? "yes" : "no"} | ${item.blocks_docker_deploy ? "yes" : "no"} | ${item.evidence.replace(/\|/g, "/")} |`),
    "",
    "## Summary",
    "",
    `- Handoff gate blockers: ${report.summary.handoff_blockers.join(", ") || "none"}`,
    `- Release-input gate blockers: ${report.summary.release_input_blockers.join(", ") || "none"}`,
    `- Push-execution gate blockers: ${report.summary.push_execution_blockers.join(", ") || "none"}`,
    `- Docker-deploy gate blockers: ${report.summary.docker_deploy_blockers.join(", ") || "none"}`,
    `- Source release-input blockers to resolve by NAS collection: ${report.observations.release_input_blockers.join(", ") || "none"}`,
    `- Unexpected release-input blockers: ${report.observations.unexpected_release_input_blockers.join(", ") || "none"}`,
    `- Missing expected release-input blockers: ${report.observations.missing_expected_release_input_blockers.join(", ") || "none"}`,
    "",
    "## Next Actions",
    "",
    ...report.next_actions.map((item) => `- ${item}`),
    "",
    "## Artifacts",
    "",
    ...artifactLines,
    ""
  ];

  return lines.join("\n");
}

async function optionalLoadJson(filePath: string | undefined): Promise<unknown> {
  if (!filePath) {
    return undefined;
  }

  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function latestArtifact(dir: string, prefix: string): Promise<string | undefined> {
  try {
    const entries = await readdir(dir);
    const matches = entries
      .filter((entry) => entry.startsWith(prefix) && entry.endsWith(".json"))
      .sort();

    return matches.length > 0 ? path.join(dir, matches[matches.length - 1] ?? "") : undefined;
  } catch {
    return undefined;
  }
}

async function fileInfo(filePath: string, executable: boolean): Promise<HandoffFile> {
  const data = await readFile(filePath);

  return {
    path: filePath,
    sha256: createHash("sha256").update(data).digest("hex"),
    size_bytes: data.length,
    executable
  };
}

async function writeBundle(input: {
  report: AdminDockerNasReleaseInputsHandoffReport;
  bundle_dir: string;
  collector_source_path: string;
}): Promise<{
  manifest_path: string;
  readme_path: string;
  collector_path: string;
  nas_runner_path: string;
  local_validator_path: string;
  local_installer_path: string;
}> {
  const nasDir = path.join(input.bundle_dir, "nas");
  const localDir = path.join(input.bundle_dir, "local");
  const collectorPath = path.join(nasDir, "admin-docker-nas-release-inputs-collector.sh");
  const nasRunnerPath = path.join(nasDir, "RUN_ON_NAS.sh");
  const localValidatorPath = path.join(localDir, "validate-returned-evidence.sh");
  const localInstallerPath = path.join(localDir, "install-nas-runner.sh");
  const readmePath = path.join(input.bundle_dir, "README.md");
  const manifestPath = path.join(input.bundle_dir, "MANIFEST.json");
  const reportBase = path.join(path.dirname(input.bundle_dir), path.basename(input.bundle_dir));
  const reportJsonPath = `${reportBase}.json`;
  const reportMarkdownPath = `${reportBase}.md`;
  const bundleReport: AdminDockerNasReleaseInputsHandoffReport = {
    ...input.report,
    operator_handoff: {
      ...input.report.operator_handoff,
      bundle_dir: input.bundle_dir
    },
    artifacts: {
      json_path: reportJsonPath,
      markdown_path: reportMarkdownPath,
      bundle_dir: input.bundle_dir,
      manifest_path: manifestPath,
      readme_path: readmePath,
      collector_path: collectorPath,
      nas_runner_path: nasRunnerPath,
      local_validator_path: localValidatorPath,
      local_installer_path: localInstallerPath
    }
  };

  await mkdir(nasDir, { recursive: true });
  await mkdir(localDir, { recursive: true });
  await copyFile(input.collector_source_path, collectorPath);
  await chmod(collectorPath, 0o755);
  await writeFile(nasRunnerPath, nasRunnerContents());
  await chmod(nasRunnerPath, 0o755);
  await writeFile(localInstallerPath, localInstallerContents());
  await chmod(localInstallerPath, 0o755);
  await writeFile(localValidatorPath, localValidatorContents(bundleReport));
  await chmod(localValidatorPath, 0o755);
  await writeFile(readmePath, toMarkdown(bundleReport));
  const manifest: BundleManifest = {
    schema_version: "1.0",
    mode: "admin-docker-nas-release-inputs-handoff",
    generated_at: input.report.generated_at,
    candidate_sha: input.report.observations.candidate_sha,
    candidate_release_ref: input.report.observations.candidate_release_ref,
    source_reports: input.report.sources,
    files: [
      await fileInfo(readmePath, false),
      await fileInfo(collectorPath, true),
      await fileInfo(nasRunnerPath, true),
      await fileInfo(localInstallerPath, true),
      await fileInfo(localValidatorPath, true)
    ],
    safety: {
      push_execution_allowed: false,
      docker_deploy_allowed: false,
      nas_writes_allowed: false,
      worker_start_allowed: false
    }
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    manifest_path: manifestPath,
    readme_path: readmePath,
    collector_path: collectorPath,
    nas_runner_path: nasRunnerPath,
    local_validator_path: localValidatorPath,
    local_installer_path: localInstallerPath
  };
}

function nasRunnerContents(): string {
  return `#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/docker-compose.yml" ]; then
  COMPOSE_DIR="$SCRIPT_DIR"
elif [ -f "$SCRIPT_DIR/../docker-compose.yml" ]; then
  COMPOSE_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
else
  echo "error: run this from, or copy this folder into, the NAS Compose project folder containing docker-compose.yml and .env" >&2
  exit 1
fi

OUT_DIR="\${1:-admin-docker-release-inputs}"
cd "$COMPOSE_DIR"
sh "$SCRIPT_DIR/admin-docker-nas-release-inputs-collector.sh" "$OUT_DIR"
`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function localInstallerContents(): string {
  return `#!/usr/bin/env sh
set -eu

TARGET_DIR="\${1:-}"
if [ -z "$TARGET_DIR" ]; then
  echo "usage: sh ./install-nas-runner.sh <nas-compose-project-dir>" >&2
  exit 1
fi
if [ ! -d "$TARGET_DIR" ]; then
  echo "error: target directory does not exist: $TARGET_DIR" >&2
  exit 1
fi
if [ ! -f "$TARGET_DIR/docker-compose.yml" ] || [ ! -f "$TARGET_DIR/.env" ]; then
  echo "error: target must contain docker-compose.yml and .env: $TARGET_DIR" >&2
  exit 1
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
BUNDLE_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
SRC_NAS_DIR="$BUNDLE_DIR/nas"
if [ ! -f "$SRC_NAS_DIR/RUN_ON_NAS.sh" ] || [ ! -f "$SRC_NAS_DIR/admin-docker-nas-release-inputs-collector.sh" ]; then
  echo "error: missing nas runner files under $SRC_NAS_DIR" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR/nas"
cp "$SRC_NAS_DIR/RUN_ON_NAS.sh" "$TARGET_DIR/nas/RUN_ON_NAS.sh"
cp "$SRC_NAS_DIR/admin-docker-nas-release-inputs-collector.sh" "$TARGET_DIR/nas/admin-docker-nas-release-inputs-collector.sh"
chmod 755 "$TARGET_DIR/nas/RUN_ON_NAS.sh" "$TARGET_DIR/nas/admin-docker-nas-release-inputs-collector.sh"

cat <<EOF
Installed read-only NAS release-input collector into:
  $TARGET_DIR/nas

On the NAS host, run from the Compose project folder:
  sh ./nas/RUN_ON_NAS.sh

This installer copied scripts only. It did not edit .env, restart containers,
enable workers, run push_images=true, or collect evidence.
EOF
`;
}

function localValidatorContents(report: AdminDockerNasReleaseInputsHandoffReport): string {
  const prestaging = shellQuote(report.sources.prestaging_handoff_report);
  const candidateRef = shellQuote(report.sources.candidate_ref_proof_report);

  return `#!/usr/bin/env sh
set -eu

RETURNED_DIR="\${1:-\${MIXLAB_ADMIN_DOCKER_NAS_RETURNED_DIR:-}}"
if [ -z "$RETURNED_DIR" ]; then
  echo "usage: sh ./validate-returned-evidence.sh <copied-admin-docker-release-inputs-dir>" >&2
  exit 1
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../../../../.." && pwd)"
cd "$REPO_ROOT"

MIXLAB_ADMIN_DOCKER_NAS_RETURNED_DIR="$RETURNED_DIR" \\
MIXLAB_ADMIN_DOCKER_PRESTAGING_HANDOFF_REPORT=${prestaging} \\
MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_PROOF_REPORT=${candidateRef} \\
MIXLAB_ACCEPTANCE_OUTPUT_DIR=docs/acceptance/artifacts \\
MIXLAB_ACCEPTANCE_ARTIFACT_DIR=docs/acceptance/artifacts \\
npm run intake:admin-docker-nas-release-inputs -- "$RETURNED_DIR"
`;
}

export async function runAdminDockerNasReleaseInputsHandoff(input: {
  prestaging_handoff_report_path?: string;
  candidate_ref_proof_report_path?: string;
  release_inputs_report_path?: string;
  output_dir?: string;
  artifact_dir?: string;
  generated_at?: string;
  command?: string;
}): Promise<AdminDockerNasReleaseInputsHandoffReport> {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const artifactDir = input.artifact_dir ?? DEFAULT_ARTIFACT_DIR;
  const timestamp = timestampForFile(new Date(generatedAt));
  const bundleDir = path.join(outputDir, `admin-docker-nas-release-inputs-handoff-${timestamp}`);
  const prestagingPath = input.prestaging_handoff_report_path ?? await latestArtifact(artifactDir, "admin-docker-prestaging-handoff-");
  const candidateRefPath = input.candidate_ref_proof_report_path ?? await latestArtifact(artifactDir, "admin-docker-candidate-ref-proof-");
  const releaseInputsPath = input.release_inputs_report_path ?? await latestArtifact(artifactDir, "admin-docker-release-inputs-");
  const collectorPath = COLLECTOR_SOURCE;
  const report = buildAdminDockerNasReleaseInputsHandoffReport({
    generated_at: generatedAt,
    command: input.command ?? process.argv.join(" "),
    prestaging_handoff_report_path: prestagingPath,
    prestaging_handoff_report: await optionalLoadJson(prestagingPath),
    candidate_ref_proof_report_path: candidateRefPath,
    candidate_ref_proof_report: await optionalLoadJson(candidateRefPath),
    release_inputs_report_path: releaseInputsPath,
    release_inputs_report: await optionalLoadJson(releaseInputsPath),
    collector_source_path: collectorPath,
    bundle_dir: bundleDir,
    artifact_dir: artifactDir
  });
  const bundleArtifacts = await writeBundle({
    report,
    bundle_dir: bundleDir,
    collector_source_path: collectorPath
  });
  const jsonPath = path.join(outputDir, `admin-docker-nas-release-inputs-handoff-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-nas-release-inputs-handoff-${timestamp}.md`);
  const latestBundleDir = path.join(outputDir, "admin-docker-nas-release-inputs-handoff-latest");
  const latestJsonPath = path.join(outputDir, "admin-docker-nas-release-inputs-handoff-latest.json");
  const latestMarkdownPath = path.join(outputDir, "admin-docker-nas-release-inputs-handoff-latest.md");
  const latestManifestPath = path.join(latestBundleDir, "MANIFEST.json");
  const latestReadmePath = path.join(latestBundleDir, "README.md");
  const reportWithArtifacts: AdminDockerNasReleaseInputsHandoffReport = {
    ...report,
    operator_handoff: {
      ...report.operator_handoff,
      bundle_dir: bundleDir
    },
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath,
      bundle_dir: bundleDir,
      manifest_path: bundleArtifacts.manifest_path,
      readme_path: bundleArtifacts.readme_path,
      collector_path: bundleArtifacts.collector_path,
      nas_runner_path: bundleArtifacts.nas_runner_path,
      local_validator_path: bundleArtifacts.local_validator_path,
      local_installer_path: bundleArtifacts.local_installer_path,
      latest_json_path: latestJsonPath,
      latest_markdown_path: latestMarkdownPath,
      latest_bundle_dir: latestBundleDir,
      latest_manifest_path: latestManifestPath,
      latest_readme_path: latestReadmePath
    }
  };

  await writeFile(jsonPath, `${JSON.stringify(reportWithArtifacts, null, 2)}\n`);
  await writeFile(markdownPath, toMarkdown(reportWithArtifacts));
  await rm(latestBundleDir, { recursive: true, force: true });
  await rm(latestJsonPath, { force: true });
  await rm(latestMarkdownPath, { force: true });
  const latestBundleArtifacts = await writeBundle({
    report: reportWithArtifacts,
    bundle_dir: latestBundleDir,
    collector_source_path: collectorPath
  });
  const latestReportWithArtifacts: AdminDockerNasReleaseInputsHandoffReport = {
    ...reportWithArtifacts,
    operator_handoff: {
      ...reportWithArtifacts.operator_handoff,
      bundle_dir: latestBundleDir
    },
    artifacts: {
      json_path: latestJsonPath,
      markdown_path: latestMarkdownPath,
      bundle_dir: latestBundleDir,
      manifest_path: latestBundleArtifacts.manifest_path,
      readme_path: latestBundleArtifacts.readme_path,
      collector_path: latestBundleArtifacts.collector_path,
      nas_runner_path: latestBundleArtifacts.nas_runner_path,
      local_validator_path: latestBundleArtifacts.local_validator_path,
      local_installer_path: latestBundleArtifacts.local_installer_path,
      latest_json_path: latestJsonPath,
      latest_markdown_path: latestMarkdownPath,
      latest_bundle_dir: latestBundleDir,
      latest_manifest_path: latestBundleArtifacts.manifest_path,
      latest_readme_path: latestBundleArtifacts.readme_path
    }
  };

  await writeFile(latestJsonPath, `${JSON.stringify(latestReportWithArtifacts, null, 2)}\n`);
  await writeFile(latestMarkdownPath, toMarkdown(latestReportWithArtifacts));

  return reportWithArtifacts;
}

async function main(): Promise<void> {
  const report = await runAdminDockerNasReleaseInputsHandoff({
    prestaging_handoff_report_path: process.env.MIXLAB_ADMIN_DOCKER_PRESTAGING_HANDOFF_REPORT ?? process.argv[2],
    candidate_ref_proof_report_path: process.env.MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_PROOF_REPORT ?? process.argv[3],
    release_inputs_report_path: process.env.MIXLAB_ADMIN_DOCKER_RELEASE_INPUTS_REPORT ?? process.argv[4],
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    artifact_dir: process.env.MIXLAB_ACCEPTANCE_ARTIFACT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    handoff_package_ready: report.handoff_package_ready,
    push_execution_allowed: report.push_execution_allowed,
    docker_deploy_allowed: report.docker_deploy_allowed,
    candidate_sha: report.observations.candidate_sha,
    candidate_release_ref: report.observations.candidate_release_ref,
    handoff_blockers: report.summary.handoff_blockers,
    json_path: report.artifacts?.json_path,
    markdown_path: report.artifacts?.markdown_path,
    bundle_dir: report.artifacts?.bundle_dir
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exit(1);
  });
}
