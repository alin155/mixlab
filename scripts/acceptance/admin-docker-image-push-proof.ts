import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ARTIFACT_DIR = "docs/acceptance/artifacts";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";

type GateStatus = "pass" | "blocked" | "fail";
type GateCategory = "safety" | "github-run" | "artifact" | "release-inputs" | "release-decision" | "image";

interface ImagePushProofGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_image_push_proof: boolean;
  blocks_staging_execution: boolean;
  blocks_docker_deploy: boolean;
  required_evidence?: string;
}

interface ImagePushProofSummary {
  total: number;
  passed: number;
  blocked: number;
  failed: number;
  image_push_proof_blockers: string[];
  staging_execution_blockers: string[];
  docker_deploy_blockers: string[];
}

export interface AdminDockerImagePushProofReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-image-push-proof";
  sources: {
    github_run_artifact_report: string;
    github_artifact_readiness_report: string;
    release_inputs_report: string;
    push_decision_package_report: string;
  };
  proof_accepted: boolean;
  push_execution_allowed: false;
  docker_deploy_allowed: false;
  observations: {
    github_run_successful: boolean;
    github_run_event: string;
    github_run_head_sha: string;
    github_run_head_branch: string;
    github_run_url: string;
    github_run_candidate_ready: boolean | null;
    github_run_staging_handoff_ready: boolean | null;
    github_artifact_status: string;
    github_candidate_artifact_ready: boolean | null;
    github_artifact_staging_handoff_ready: boolean | null;
    image_push_approval_accepted: boolean | null;
    artifact_staging_handoff_blockers: string[];
    release_inputs_ready: boolean | null;
    push_decision_package_ready: boolean | null;
    workflow_dispatch_command: string;
    current_image_tag: string;
    target_image_tag: string;
    rollback_image_tag: string;
    workflow_command_ready: boolean;
    run_head_matches_target: boolean;
    source_reports_nondeploy: boolean;
  };
  gates: ImagePushProofGate[];
  summary: ImagePushProofSummary;
  result: {
    status: "accepted" | "blocked" | "failed";
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

function summaryBlockers(report: unknown, key: string): string[] {
  return stringArray(asRecord(asRecord(report).summary)[key]);
}

function gate(input: ImagePushProofGate): ImagePushProofGate {
  return input;
}

function summarize(gates: ImagePushProofGate[]): ImagePushProofSummary {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    failed: gates.filter((item) => item.status === "fail").length,
    image_push_proof_blockers: gates
      .filter((item) => item.blocks_image_push_proof && item.status !== "pass")
      .map((item) => item.id),
    staging_execution_blockers: gates
      .filter((item) => item.blocks_staging_execution && item.status !== "pass")
      .map((item) => item.id),
    docker_deploy_blockers: gates
      .filter((item) => item.blocks_docker_deploy && item.status !== "pass")
      .map((item) => item.id)
  };
}

function commandLooksRunnable(command: string, target: string, current: string, rollback: string): boolean {
  return Boolean(
    command &&
    target &&
    current &&
    rollback &&
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

export function buildAdminDockerImagePushProofReport(input: {
  generated_at: string;
  command: string;
  github_run_artifact_report_path: string;
  github_run_artifact_report: unknown;
  github_artifact_readiness_report_path: string;
  github_artifact_readiness_report: unknown;
  release_inputs_report_path: string;
  release_inputs_report: unknown;
  push_decision_package_report_path: string;
  push_decision_package_report: unknown;
}): AdminDockerImagePushProofReport {
  const githubRunReport = asRecord(input.github_run_artifact_report);
  const run = asRecord(githubRunReport.run);
  const readiness = asRecord(input.github_artifact_readiness_report);
  const readinessObservations = asRecord(readiness.observations);
  const releaseInputs = asRecord(input.release_inputs_report);
  const releaseInputValues = asRecord(releaseInputs.inputs);
  const pushDecision = asRecord(input.push_decision_package_report);
  const pushDecisionObservations = asRecord(pushDecision.observations);
  const currentTag = asString(releaseInputValues.current_image_tag);
  const targetTag = asString(releaseInputValues.target_image_tag);
  const rollbackTag = asString(releaseInputValues.rollback_image_tag);
  const workflowDispatchCommand = asString(releaseInputValues.workflow_dispatch_command);
  const runSuccessful = asString(run.status) === "completed" && asString(run.conclusion) === "success";
  const runEvent = asString(run.event);
  const runHeadSha = asString(run.headSha);
  const runHeadBranch = asString(run.headBranch);
  const runHeadMatchesTarget = Boolean(targetTag && runHeadSha === targetTag);
  const branchMatchesTarget = Boolean(targetTag && runHeadBranch === `admin-docker-candidate-${targetTag}`);
  const githubRunCandidateReady = asBoolean(githubRunReport.github_run_candidate_ready);
  const githubRunStagingHandoffReady = asBoolean(githubRunReport.github_run_staging_handoff_ready);
  const githubCandidateArtifactReady = asBoolean(readiness.github_candidate_artifact_ready);
  const githubArtifactStagingHandoffReady = asBoolean(readiness.staging_handoff_ready);
  const imagePushApprovalAccepted = asBoolean(readinessObservations.image_push_approval_accepted);
  const artifactStagingBlockers = summaryBlockers(readiness, "staging_handoff_blockers");
  const releaseInputsReady = asBoolean(releaseInputs.release_inputs_ready);
  const pushDecisionReady = asBoolean(pushDecision.push_decision_package_ready);
  const workflowCommandReady = commandLooksRunnable(workflowDispatchCommand, targetTag, currentTag, rollbackTag);
  const sourceReportsNondeploy = asBoolean(githubRunReport.docker_deploy_allowed) === false &&
    asBoolean(readiness.docker_deploy_allowed) === false &&
    asBoolean(releaseInputs.push_execution_allowed) === false &&
    asBoolean(releaseInputs.docker_deploy_allowed) === false &&
    asBoolean(pushDecision.push_execution_allowed) === false &&
    asBoolean(pushDecision.docker_deploy_allowed) === false;
  const pushDecisionCommandMatches = asString(pushDecisionObservations.workflow_dispatch_command) === workflowDispatchCommand;
  const imagePushBlockerCleared = !artifactStagingBlockers.includes("image-push-explicitly-approved");
  const candidateReady = githubRunCandidateReady === true && githubCandidateArtifactReady === true;

  const gates = [
    gate({
      id: "image-push-proof-no-side-effects",
      title: "Image push proof is local and read-only",
      category: "safety",
      status: "pass",
      evidence: "Reads archived GitHub run, artifact readiness, release inputs, and push decision reports only; it does not contact GitHub, GHCR, NAS, Docker, Admin API, Cutter API, or Windows Runner.",
      blocks_image_push_proof: false,
      blocks_staging_execution: false,
      blocks_docker_deploy: false
    }),
    gate({
      id: "source-reports-do-not-approve-push-or-deploy",
      title: "Source reports do not approve push or deploy by themselves",
      category: "safety",
      status: sourceReportsNondeploy ? "pass" : "fail",
      evidence: `run.deploy=${String(asBoolean(githubRunReport.docker_deploy_allowed))}, readiness.deploy=${String(asBoolean(readiness.docker_deploy_allowed))}, release_inputs.push=${String(asBoolean(releaseInputs.push_execution_allowed))}, release_inputs.deploy=${String(asBoolean(releaseInputs.docker_deploy_allowed))}, push_package.push=${String(asBoolean(pushDecision.push_execution_allowed))}, push_package.deploy=${String(asBoolean(pushDecision.docker_deploy_allowed))}`,
      blocks_image_push_proof: true,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "All source reports must remain evidence only: push_execution_allowed=false and docker_deploy_allowed=false."
    }),
    gate({
      id: "release-inputs-ready",
      title: "Release inputs are ready",
      category: "release-inputs",
      status: releaseInputsReady ? "pass" : "blocked",
      evidence: `release_inputs_ready=${String(releaseInputsReady)}`,
      blocks_image_push_proof: true,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Use an accepted admin-docker-release-inputs report before proving a pushed target image."
    }),
    gate({
      id: "push-decision-package-ready",
      title: "Push decision package was ready before push",
      category: "release-decision",
      status: pushDecisionReady ? "pass" : "blocked",
      evidence: `push_decision_package_ready=${String(pushDecisionReady)}`,
      blocks_image_push_proof: true,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Prepare the push decision package before running workflow_dispatch with push_images=true."
    }),
    gate({
      id: "workflow-command-ready",
      title: "Workflow dispatch command is exact and placeholder-free",
      category: "release-decision",
      status: workflowCommandReady && pushDecisionCommandMatches ? "pass" : "blocked",
      evidence: `release_inputs_command_ready=${String(workflowCommandReady)}, push_package_command_matches=${String(pushDecisionCommandMatches)}`,
      blocks_image_push_proof: true,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Release inputs and push decision package must agree on the exact docker-admin workflow_dispatch command."
    }),
    gate({
      id: "github-run-successful",
      title: "GitHub Admin Docker workflow completed successfully",
      category: "github-run",
      status: runSuccessful ? "pass" : "blocked",
      evidence: `status=${asString(run.status) || "missing"}, conclusion=${asString(run.conclusion) || "missing"}, url=${asString(run.url) || "missing"}`,
      blocks_image_push_proof: true,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Collect a successful workflow_dispatch run artifact after running push_images=true."
    }),
    gate({
      id: "github-run-is-workflow-dispatch",
      title: "GitHub run was manually dispatched",
      category: "github-run",
      status: runEvent === "workflow_dispatch" ? "pass" : "blocked",
      evidence: `event=${runEvent || "missing"}`,
      blocks_image_push_proof: true,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "The image push proof must come from workflow_dispatch, not an automatic push run."
    }),
    gate({
      id: "github-run-target-ref-matches-release-inputs",
      title: "GitHub run target matches release inputs target tag",
      category: "image",
      status: runHeadMatchesTarget && branchMatchesTarget ? "pass" : "blocked",
      evidence: `run.headSha=${runHeadSha || "missing"}, run.headBranch=${runHeadBranch || "missing"}, target=${targetTag || "missing"}`,
      blocks_image_push_proof: true,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Run the workflow on the admin-docker-candidate tag that points at the target image SHA."
    }),
    gate({
      id: "github-candidate-artifact-ready",
      title: "GitHub artifact still proves the Docker candidate",
      category: "artifact",
      status: candidateReady ? "pass" : "blocked",
      evidence: `github_run_candidate_ready=${String(githubRunCandidateReady)}, github_candidate_artifact_ready=${String(githubCandidateArtifactReady)}, readiness_status=${resultStatus(readiness) || "missing"}`,
      blocks_image_push_proof: true,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "The same run must still produce accepted Admin Docker candidate smoke evidence."
    }),
    gate({
      id: "image-push-approval-observed-in-artifact",
      title: "Artifact records workflow_dispatch push_images=true",
      category: "image",
      status: imagePushApprovalAccepted ? "pass" : "blocked",
      evidence: `image_push_approval_accepted=${String(imagePushApprovalAccepted)}`,
      blocks_image_push_proof: true,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "The GitHub artifact readiness report must observe image_push_approval_accepted=true, which the workflow sets only when push_images=true."
    }),
    gate({
      id: "image-push-blocker-cleared-from-artifact",
      title: "Artifact no longer carries image push blocker",
      category: "image",
      status: imagePushBlockerCleared ? "pass" : "blocked",
      evidence: `artifact_staging_handoff_blockers=${artifactStagingBlockers.join(", ") || "none"}`,
      blocks_image_push_proof: true,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "After push_images=true, artifact readiness staging blockers must not include image-push-explicitly-approved."
    })
  ];
  const summary = summarize(gates);
  const proofAccepted = summary.failed === 0 && summary.image_push_proof_blockers.length === 0;

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-image-push-proof",
    sources: {
      github_run_artifact_report: input.github_run_artifact_report_path,
      github_artifact_readiness_report: input.github_artifact_readiness_report_path,
      release_inputs_report: input.release_inputs_report_path,
      push_decision_package_report: input.push_decision_package_report_path
    },
    proof_accepted: proofAccepted,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    observations: {
      github_run_successful: runSuccessful,
      github_run_event: runEvent,
      github_run_head_sha: runHeadSha,
      github_run_head_branch: runHeadBranch,
      github_run_url: asString(run.url),
      github_run_candidate_ready: githubRunCandidateReady,
      github_run_staging_handoff_ready: githubRunStagingHandoffReady,
      github_artifact_status: resultStatus(readiness),
      github_candidate_artifact_ready: githubCandidateArtifactReady,
      github_artifact_staging_handoff_ready: githubArtifactStagingHandoffReady,
      image_push_approval_accepted: imagePushApprovalAccepted,
      artifact_staging_handoff_blockers: artifactStagingBlockers,
      release_inputs_ready: releaseInputsReady,
      push_decision_package_ready: pushDecisionReady,
      workflow_dispatch_command: workflowDispatchCommand,
      current_image_tag: currentTag,
      target_image_tag: targetTag,
      rollback_image_tag: rollbackTag,
      workflow_command_ready: workflowCommandReady && pushDecisionCommandMatches,
      run_head_matches_target: runHeadMatchesTarget && branchMatchesTarget,
      source_reports_nondeploy: sourceReportsNondeploy
    },
    gates,
    summary,
    result: {
      status: summary.failed > 0 ? "failed" : proofAccepted ? "accepted" : "blocked",
      summary: proofAccepted
        ? "Image push proof is accepted for staging execution evidence. It still does not approve Docker deploy."
        : "Image push proof is blocked until a successful workflow_dispatch push_images=true run is archived and matched to release inputs."
    },
    next_actions: proofAccepted
      ? [
          "Regenerate the staging runbook with MIXLAB_ADMIN_DOCKER_IMAGE_PUSH_PROOF_REPORT pointing to this report.",
          "Continue with staged live-readonly, worker proof, Cutter proof, parity, and release readiness checks before any deploy decision.",
          "Do not edit NAS .env, restart containers, enable workers, run preprocessing, or deploy from this proof alone."
        ]
      : [
          `Resolve image push proof blockers: ${summary.image_push_proof_blockers.join(", ") || "unknown"}.`,
          "Keep staging execution blocked until a successful push_images=true workflow run is archived and this proof is accepted."
        ],
    artifacts: null
  };
}

export function toMarkdown(report: AdminDockerImagePushProofReport): string {
  return [
    "# Admin Docker Image Push Proof",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Result: ${report.result.status}`,
    `Proof accepted: ${report.proof_accepted ? "yes" : "no"}`,
    "Push execution allowed: no",
    "Docker deploy allowed: no",
    "",
    "This report reads archived reports only. It does not contact GitHub, GHCR, Docker, NAS, Admin API, Cutter API, or Windows Runner.",
    "",
    "## Sources",
    "",
    `- GitHub run artifact: ${report.sources.github_run_artifact_report || "<missing>"}`,
    `- GitHub artifact readiness: ${report.sources.github_artifact_readiness_report || "<missing>"}`,
    `- Release inputs: ${report.sources.release_inputs_report || "<missing>"}`,
    `- Push decision package: ${report.sources.push_decision_package_report || "<missing>"}`,
    "",
    "## Observations",
    "",
    `- GitHub run successful: ${String(report.observations.github_run_successful)}`,
    `- GitHub run event: ${report.observations.github_run_event || "<missing>"}`,
    `- GitHub run head SHA: ${report.observations.github_run_head_sha || "<missing>"}`,
    `- GitHub run head branch: ${report.observations.github_run_head_branch || "<missing>"}`,
    `- GitHub run URL: ${report.observations.github_run_url || "<missing>"}`,
    `- GitHub run candidate ready: ${String(report.observations.github_run_candidate_ready)}`,
    `- GitHub run staging handoff ready: ${String(report.observations.github_run_staging_handoff_ready)}`,
    `- GitHub artifact status: ${report.observations.github_artifact_status || "<missing>"}`,
    `- GitHub candidate artifact ready: ${String(report.observations.github_candidate_artifact_ready)}`,
    `- GitHub artifact staging handoff ready: ${String(report.observations.github_artifact_staging_handoff_ready)}`,
    `- Image push approval accepted: ${String(report.observations.image_push_approval_accepted)}`,
    `- Artifact staging handoff blockers: ${report.observations.artifact_staging_handoff_blockers.join(", ") || "none"}`,
    `- Release inputs ready: ${String(report.observations.release_inputs_ready)}`,
    `- Push decision package ready: ${String(report.observations.push_decision_package_ready)}`,
    `- Current image tag: ${report.observations.current_image_tag || "<missing>"}`,
    `- Target image tag: ${report.observations.target_image_tag || "<missing>"}`,
    `- Rollback image tag: ${report.observations.rollback_image_tag || "<missing>"}`,
    `- Workflow command ready: ${String(report.observations.workflow_command_ready)}`,
    `- Run head matches target: ${String(report.observations.run_head_matches_target)}`,
    `- Source reports nondeploy: ${String(report.observations.source_reports_nondeploy)}`,
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Proof | Blocks Staging Execution | Blocks Deploy | Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => [
      item.id,
      item.category,
      item.status,
      item.blocks_image_push_proof ? "yes" : "no",
      item.blocks_staging_execution ? "yes" : "no",
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

export async function runAdminDockerImagePushProof(input: {
  github_run_artifact_report_path?: string;
  github_artifact_readiness_report_path?: string;
  release_inputs_report_path?: string;
  push_decision_package_report_path?: string;
  output_dir?: string;
  artifact_dir?: string;
  generated_at?: string;
  command?: string;
} = {}): Promise<AdminDockerImagePushProofReport> {
  const artifactDir = input.artifact_dir ?? DEFAULT_ARTIFACT_DIR;
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const githubRunPath = input.github_run_artifact_report_path ?? await latestArtifact(artifactDir, "admin-docker-github-run-artifact-");
  const githubReadinessPath = input.github_artifact_readiness_report_path ?? await latestArtifact(artifactDir, "admin-docker-github-artifact-readiness-");
  const releaseInputsPath = input.release_inputs_report_path ?? await latestArtifact(artifactDir, "admin-docker-release-inputs-");
  const pushDecisionPath = input.push_decision_package_report_path ?? await latestArtifact(artifactDir, "admin-docker-push-decision-package-");
  const report = buildAdminDockerImagePushProofReport({
    generated_at: generatedAt,
    command: input.command ?? "npx tsx scripts/acceptance/admin-docker-image-push-proof.ts",
    github_run_artifact_report_path: githubRunPath,
    github_run_artifact_report: await loadJson(githubRunPath),
    github_artifact_readiness_report_path: githubReadinessPath,
    github_artifact_readiness_report: await loadJson(githubReadinessPath),
    release_inputs_report_path: releaseInputsPath,
    release_inputs_report: await loadJson(releaseInputsPath),
    push_decision_package_report_path: pushDecisionPath,
    push_decision_package_report: await loadJson(pushDecisionPath)
  });
  const stamp = timestampForFile(new Date(generatedAt));
  const jsonPath = path.join(outputDir, `admin-docker-image-push-proof-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-image-push-proof-${stamp}.md`);
  const reportWithArtifacts: AdminDockerImagePushProofReport = {
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
  const report = await runAdminDockerImagePushProof({
    github_run_artifact_report_path: process.env.MIXLAB_ADMIN_DOCKER_GITHUB_RUN_ARTIFACT_REPORT ?? process.argv[2],
    github_artifact_readiness_report_path: process.env.MIXLAB_DOCKER_GITHUB_ARTIFACT_READINESS_REPORT ?? process.argv[3],
    release_inputs_report_path: process.env.MIXLAB_ADMIN_DOCKER_RELEASE_INPUTS_REPORT ?? process.argv[4],
    push_decision_package_report_path: process.env.MIXLAB_ADMIN_DOCKER_PUSH_DECISION_PACKAGE_REPORT ?? process.argv[5],
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    artifact_dir: process.env.MIXLAB_ACCEPTANCE_ARTIFACT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    proof_accepted: report.proof_accepted,
    push_execution_allowed: report.push_execution_allowed,
    docker_deploy_allowed: report.docker_deploy_allowed,
    blockers: report.summary.image_push_proof_blockers,
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
