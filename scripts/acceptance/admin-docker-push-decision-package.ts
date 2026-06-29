import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ARTIFACT_DIR = "docs/acceptance/artifacts";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";

type GateStatus = "pass" | "blocked" | "fail";
type GateCategory = "safety" | "evidence" | "release-decision" | "staging";

interface PushDecisionGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_push_decision_package: boolean;
  blocks_push_execution: boolean;
  blocks_docker_deploy: boolean;
  required_evidence?: string;
}

interface PushDecisionSummary {
  total: number;
  passed: number;
  blocked: number;
  failed: number;
  package_blockers: string[];
  push_execution_blockers: string[];
  docker_deploy_blockers: string[];
}

export interface AdminDockerPushDecisionPackageReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-push-decision-package";
  sources: {
    staging_runbook_report: string;
    release_inputs_report: string;
    readiness_summary_report: string;
  };
  push_decision_package_ready: boolean;
  push_execution_allowed: false;
  docker_deploy_allowed: false;
  release_decision_required: true;
  observations: {
    staging_runbook_status: string;
    staging_execution_ready: boolean | null;
    staging_review_ready: boolean | null;
    runbook_docker_deploy_allowed: boolean | null;
    staging_execution_blockers: string[];
    staging_blockers: string[];
    release_inputs_status: string;
    release_inputs_ready: boolean | null;
    release_inputs_push_execution_allowed: boolean | null;
    release_inputs_docker_deploy_allowed: boolean | null;
    current_image_tag: string;
    target_image_tag: string;
    rollback_image_tag: string;
    workflow_dispatch_command: string;
    target_tag_matches_smoked_image: boolean | null;
    nas_disk_proof_accepted: boolean | null;
    worker_proof_accepted: boolean | null;
    cutter_proof_accepted: boolean | null;
    readiness_status: string;
    release_review_ready: boolean | null;
    readiness_release_review_blockers: string[];
  };
  gates: PushDecisionGate[];
  summary: PushDecisionSummary;
  result: {
    status: "ready-for-external-release-decision" | "blocked" | "failed";
    summary: string;
  };
  next_actions: string[];
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

function resultStatus(report: unknown): string {
  return asString(asRecord(asRecord(report).result).status);
}

function gate(input: PushDecisionGate): PushDecisionGate {
  return input;
}

function summarize(gates: PushDecisionGate[]): PushDecisionSummary {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    failed: gates.filter((item) => item.status === "fail").length,
    package_blockers: gates
      .filter((item) => item.blocks_push_decision_package && item.status !== "pass")
      .map((item) => item.id),
    push_execution_blockers: gates
      .filter((item) => item.blocks_push_execution && item.status !== "pass")
      .map((item) => item.id),
    docker_deploy_blockers: gates
      .filter((item) => item.blocks_docker_deploy && item.status !== "pass")
      .map((item) => item.id)
  };
}

function commandLooksRunnable(command: string, target: string, current: string, rollback: string): boolean {
  return Boolean(
    command &&
    !command.includes("<") &&
    !command.includes(">") &&
    command.includes("gh workflow run docker-admin.yml") &&
    command.includes("--ref admin-docker-candidate-") &&
    command.includes("-f push_images=true") &&
    command.includes(`current_image_tag=${current}`) &&
    command.includes(`rollback_image_tag=${rollback}`) &&
    command.includes(target)
  );
}

async function latestArtifact(artifactDir: string, prefix: string): Promise<string> {
  const files = await readdir(artifactDir);
  const candidates = files
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .sort();

  if (candidates.length === 0) {
    throw new Error(`No ${prefix}*.json artifact found in ${artifactDir}`);
  }

  return path.join(artifactDir, candidates[candidates.length - 1]);
}

async function loadJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Failed to read JSON report at ${filePath}: ${errorMessage(error)}`);
  }
}

export function buildAdminDockerPushDecisionPackageReport(input: {
  generated_at: string;
  command: string;
  staging_runbook_report_path: string;
  staging_runbook_report: unknown;
  release_inputs_report_path: string;
  release_inputs_report: unknown;
  readiness_summary_report_path?: string;
  readiness_summary_report?: unknown;
}): AdminDockerPushDecisionPackageReport {
  const runbook = asRecord(input.staging_runbook_report);
  const runbookSummary = asRecord(runbook.summary);
  const runbookObservations = asRecord(runbook.observations);
  const releaseInputs = asRecord(input.release_inputs_report);
  const releaseInputsSummary = asRecord(releaseInputs.summary);
  const releaseInputsValues = asRecord(releaseInputs.inputs);
  const readiness = asRecord(input.readiness_summary_report);
  const readinessSummary = asRecord(readiness.summary);
  const stagingExecutionBlockers = stringArray(runbookSummary.staging_execution_blockers);
  const stagingBlockers = stringArray(runbookSummary.staging_blockers);
  const releaseInputBlockers = stringArray(releaseInputsSummary.release_input_blockers);
  const readinessBlockers = stringArray(readinessSummary.release_review_blockers);
  const currentTag = asString(releaseInputsValues.current_image_tag);
  const targetTag = asString(releaseInputsValues.target_image_tag);
  const rollbackTag = asString(releaseInputsValues.rollback_image_tag);
  const workflowDispatchCommand = asString(releaseInputsValues.workflow_dispatch_command);
  const releaseInputsReady = asBoolean(releaseInputs.release_inputs_ready);
  const releaseInputsPushAllowed = asBoolean(releaseInputs.push_execution_allowed);
  const releaseInputsDeployAllowed = asBoolean(releaseInputs.docker_deploy_allowed);
  const runbookDeployAllowed = asBoolean(runbook.docker_deploy_allowed);
  const stagingExecutionReady = asBoolean(runbook.staging_execution_ready);
  const stagingReviewReady = asBoolean(runbook.staging_review_ready);
  const onlyExplicitPushApprovalRemains = stagingExecutionBlockers.length === 1 &&
    stagingExecutionBlockers[0] === "image-push-explicitly-approved";
  const stagingReadyForReleaseDecision = (stagingExecutionReady && stagingReviewReady && stagingExecutionBlockers.length === 0) ||
    onlyExplicitPushApprovalRemains;
  const tagsPresent = Boolean(currentTag && targetTag && rollbackTag);
  const workflowCommandReady = commandLooksRunnable(workflowDispatchCommand, targetTag, currentTag, rollbackTag);
  const safetyReportsNondeploy = runbookDeployAllowed === false &&
    releaseInputsPushAllowed === false &&
    releaseInputsDeployAllowed === false;
  const targetSmoked = asBoolean(runbookObservations.target_tag_matches_smoked_image);
  const nasDiskProofAccepted = asBoolean(runbookObservations.nas_disk_proof_accepted);
  const workerProofAccepted = asBoolean(runbookObservations.worker_proof_accepted);
  const cutterProofAccepted = asBoolean(runbookObservations.cutter_proof_accepted);
  const gates = [
    gate({
      id: "push-decision-package-no-side-effects",
      title: "Push decision package is local and read-only",
      category: "safety",
      status: "pass",
      evidence: "This package reads archived reports only; it does not contact NAS, Docker, GitHub, Admin API, Cutter API, or Windows Runner.",
      blocks_push_decision_package: false,
      blocks_push_execution: false,
      blocks_docker_deploy: false
    }),
    gate({
      id: "release-inputs-ready",
      title: "Release inputs are ready",
      category: "evidence",
      status: releaseInputsReady && releaseInputBlockers.length === 0 ? "pass" : "blocked",
      evidence: `release_inputs_ready=${String(releaseInputsReady)}, blockers=${releaseInputBlockers.join(", ") || "none"}`,
      blocks_push_decision_package: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Provide an accepted admin-docker-release-inputs report."
    }),
    gate({
      id: "image-tags-present",
      title: "Current, target, and rollback image tags are present",
      category: "evidence",
      status: tagsPresent ? "pass" : "blocked",
      evidence: `current=${currentTag || "missing"}, target=${targetTag || "missing"}, rollback=${rollbackTag || "missing"}`,
      blocks_push_decision_package: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Release inputs must include current, target, and rollback image tags."
    }),
    gate({
      id: "workflow-command-ready",
      title: "Workflow dispatch command is exact and placeholder-free",
      category: "release-decision",
      status: workflowCommandReady ? "pass" : "blocked",
      evidence: workflowDispatchCommand || "missing",
      blocks_push_decision_package: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Release inputs must include an exact docker-admin workflow_dispatch command with push_images=true and current/rollback tags."
    }),
    gate({
      id: "target-image-smoked",
      title: "Target image tag matches accepted smoke evidence",
      category: "evidence",
      status: targetSmoked ? "pass" : "blocked",
      evidence: `target_tag_matches_smoked_image=${String(targetSmoked)}`,
      blocks_push_decision_package: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Staging runbook must prove the target tag matches accepted local or GitHub candidate smoke evidence."
    }),
    gate({
      id: "no-worker-staging-disk-ready",
      title: "No-worker staging disk proof is accepted",
      category: "staging",
      status: nasDiskProofAccepted ? "pass" : "blocked",
      evidence: `nas_disk_proof_accepted=${String(nasDiskProofAccepted)}`,
      blocks_push_decision_package: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Staging runbook must include accepted no-worker staging disk proof."
    }),
    gate({
      id: "staging-ready-for-release-decision",
      title: "Staging is ready for release decision",
      category: "staging",
      status: stagingReadyForReleaseDecision ? "pass" : "blocked",
      evidence: `staging_execution_ready=${String(stagingExecutionReady)}, staging_review_ready=${String(stagingReviewReady)}, staging_execution_blockers=${stagingExecutionBlockers.join(", ") || "none"}`,
      blocks_push_decision_package: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Staging runbook must either be ready with no execution blockers, or be blocked only by image-push-explicitly-approved before preparing the external release decision package."
    }),
    gate({
      id: "source-reports-do-not-approve-push-or-deploy",
      title: "Source reports do not approve push or deploy",
      category: "safety",
      status: safetyReportsNondeploy ? "pass" : "fail",
      evidence: `runbook_deploy=${String(runbookDeployAllowed)}, release_inputs_push=${String(releaseInputsPushAllowed)}, release_inputs_deploy=${String(releaseInputsDeployAllowed)}`,
      blocks_push_decision_package: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "This package must remain decision prep only: push_execution_allowed=false and docker_deploy_allowed=false in all source reports."
    }),
    gate({
      id: "external-release-decision-required",
      title: "External release owner decision is still required",
      category: "release-decision",
      status: "blocked",
      evidence: "release_decision_required=true; this package prepares the exact command but does not approve or execute it.",
      blocks_push_decision_package: false,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "A separate release owner decision is required before running push_images=true or changing NAS runtime."
    }),
    gate({
      id: "post-staging-proofs-remain-required",
      title: "Post-staging worker and Cutter proofs remain required",
      category: "staging",
      status: "pass",
      evidence: `worker_proof_accepted=${String(workerProofAccepted)}, cutter_proof_accepted=${String(cutterProofAccepted)}, staging_review_ready=${String(stagingReviewReady)}`,
      blocks_push_decision_package: false,
      blocks_push_execution: false,
      blocks_docker_deploy: false
    })
  ];
  const summary = summarize(gates);
  const packageReady = summary.failed === 0 && summary.package_blockers.length === 0;

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-push-decision-package",
    sources: {
      staging_runbook_report: input.staging_runbook_report_path,
      release_inputs_report: input.release_inputs_report_path,
      readiness_summary_report: input.readiness_summary_report_path ?? ""
    },
    push_decision_package_ready: packageReady,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    release_decision_required: true,
    observations: {
      staging_runbook_status: resultStatus(runbook),
      staging_execution_ready: stagingExecutionReady,
      staging_review_ready: stagingReviewReady,
      runbook_docker_deploy_allowed: runbookDeployAllowed,
      staging_execution_blockers: stagingExecutionBlockers,
      staging_blockers: stagingBlockers,
      release_inputs_status: resultStatus(releaseInputs),
      release_inputs_ready: releaseInputsReady,
      release_inputs_push_execution_allowed: releaseInputsPushAllowed,
      release_inputs_docker_deploy_allowed: releaseInputsDeployAllowed,
      current_image_tag: currentTag,
      target_image_tag: targetTag,
      rollback_image_tag: rollbackTag,
      workflow_dispatch_command: workflowDispatchCommand,
      target_tag_matches_smoked_image: targetSmoked,
      nas_disk_proof_accepted: nasDiskProofAccepted,
      worker_proof_accepted: workerProofAccepted,
      cutter_proof_accepted: cutterProofAccepted,
      readiness_status: resultStatus(readiness),
      release_review_ready: asBoolean(readiness.release_review_ready),
      readiness_release_review_blockers: readinessBlockers
    },
    gates,
    summary,
    result: {
      status: summary.failed > 0
        ? "failed"
        : packageReady
          ? "ready-for-external-release-decision"
          : "blocked",
      summary: packageReady
        ? "Push decision package is ready for an external release owner decision. It does not approve or execute push_images=true."
        : "Push decision package is blocked until staging is ready for a release decision."
    },
    next_actions: packageReady
      ? [
          "Have the release owner review this package, the staging runbook, and release inputs before any workflow dispatch.",
          `If explicitly approved, run exactly: ${workflowDispatchCommand}`,
          "After the workflow succeeds, regenerate GitHub run artifact, staging runbook, live-readonly, worker proof, Cutter compatibility proof, and readiness summary.",
          "Do not edit NAS .env, pull/restart containers, enable workers, run preprocessing, or deploy from this package alone."
        ]
      : [
          `Resolve push decision package blockers: ${summary.package_blockers.join(", ") || "unknown"}.`,
          "Keep push_images=false until this package is ready and a separate release owner decision exists."
        ],
    artifacts: null
  };
}

export function toMarkdown(report: AdminDockerPushDecisionPackageReport): string {
  return [
    "# Admin Docker Push Decision Package",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Result: ${report.result.status}`,
    `Package ready: ${report.push_decision_package_ready ? "yes" : "no"}`,
    "Push execution allowed: no",
    "Docker deploy allowed: no",
    "Release decision required: yes",
    "",
    "## Sources",
    "",
    `- Staging runbook: ${report.sources.staging_runbook_report || "<missing>"}`,
    `- Release inputs: ${report.sources.release_inputs_report || "<missing>"}`,
    `- Readiness summary: ${report.sources.readiness_summary_report || "<not provided>"}`,
    "",
    "## Decision Command",
    "",
    "```sh",
    report.observations.workflow_dispatch_command || "# missing",
    "```",
    "",
    "## Observations",
    "",
    `- Staging execution blockers: ${report.observations.staging_execution_blockers.join(", ") || "none"}`,
    `- Staging blockers: ${report.observations.staging_blockers.join(", ") || "none"}`,
    `- Current image tag: ${report.observations.current_image_tag || "<missing>"}`,
    `- Target image tag: ${report.observations.target_image_tag || "<missing>"}`,
    `- Rollback image tag: ${report.observations.rollback_image_tag || "<missing>"}`,
    `- Target tag matches smoked image: ${String(report.observations.target_tag_matches_smoked_image)}`,
    `- No-worker staging disk proof accepted: ${String(report.observations.nas_disk_proof_accepted)}`,
    `- Worker proof accepted: ${String(report.observations.worker_proof_accepted)}`,
    `- Cutter proof accepted: ${String(report.observations.cutter_proof_accepted)}`,
    `- Readiness release-review blockers: ${report.observations.readiness_release_review_blockers.join(", ") || "none"}`,
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Package | Blocks Push | Blocks Deploy | Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => [
      item.id,
      item.category,
      item.status,
      item.blocks_push_decision_package ? "yes" : "no",
      item.blocks_push_execution ? "yes" : "no",
      item.blocks_docker_deploy ? "yes" : "no",
      item.evidence.replace(/\|/g, "/")
    ].join(" | ")),
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
  ].join("\n");
}

export async function runAdminDockerPushDecisionPackage(input: {
  staging_runbook_report_path?: string;
  release_inputs_report_path?: string;
  readiness_summary_report_path?: string;
  output_dir?: string;
  artifact_dir?: string;
  generated_at?: string;
  command?: string;
} = {}): Promise<AdminDockerPushDecisionPackageReport> {
  const artifactDir = input.artifact_dir ?? DEFAULT_ARTIFACT_DIR;
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const stagingRunbookPath = input.staging_runbook_report_path ?? await latestArtifact(artifactDir, "admin-docker-staging-runbook-");
  const releaseInputsPath = input.release_inputs_report_path ?? await latestArtifact(artifactDir, "admin-docker-release-inputs-");
  const readinessPath = input.readiness_summary_report_path ?? await latestArtifact(artifactDir, "admin-docker-release-readiness-summary-");
  const report = buildAdminDockerPushDecisionPackageReport({
    generated_at: generatedAt,
    command: input.command ?? "npx tsx scripts/acceptance/admin-docker-push-decision-package.ts",
    staging_runbook_report_path: stagingRunbookPath,
    staging_runbook_report: await loadJson(stagingRunbookPath),
    release_inputs_report_path: releaseInputsPath,
    release_inputs_report: await loadJson(releaseInputsPath),
    readiness_summary_report_path: readinessPath,
    readiness_summary_report: await loadJson(readinessPath)
  });
  const stamp = timestampForFile(new Date(generatedAt));
  const jsonPath = path.join(outputDir, `admin-docker-push-decision-package-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-push-decision-package-${stamp}.md`);
  const reportWithArtifacts: AdminDockerPushDecisionPackageReport = {
    ...report,
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
  const report = await runAdminDockerPushDecisionPackage({
    staging_runbook_report_path: process.env.MIXLAB_ADMIN_DOCKER_STAGING_RUNBOOK_REPORT ?? process.argv[2],
    release_inputs_report_path: process.env.MIXLAB_ADMIN_DOCKER_RELEASE_INPUTS_REPORT ?? process.argv[3],
    readiness_summary_report_path: process.env.MIXLAB_ADMIN_DOCKER_RELEASE_READINESS_SUMMARY_REPORT ?? process.argv[4],
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    artifact_dir: process.env.MIXLAB_ACCEPTANCE_ARTIFACT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    push_decision_package_ready: report.push_decision_package_ready,
    push_execution_allowed: report.push_execution_allowed,
    docker_deploy_allowed: report.docker_deploy_allowed,
    staging_execution_blockers: report.observations.staging_execution_blockers,
    workflow_dispatch_command: report.observations.workflow_dispatch_command,
    blockers: report.summary.package_blockers,
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
