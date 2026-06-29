import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ARTIFACT_DIR = "docs/acceptance/artifacts";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";

type GateStatus = "pass" | "blocked" | "fail";
type GateCategory = "safety" | "evidence" | "release-manager" | "release-boundary";

interface ExceptionReviewGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_exception_review: boolean;
  blocks_release_execution: boolean;
  blocks_docker_deploy: boolean;
  required_evidence?: string;
}

interface ExceptionReviewSummary {
  total: number;
  passed: number;
  blocked: number;
  failed: number;
  exception_review_blockers: string[];
  release_execution_blockers: string[];
  docker_deploy_blockers: string[];
}

export interface AdminDockerLegacyRollbackExceptionReviewReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-legacy-rollback-exception-review";
  sources: {
    legacy_rollback_plan_report: string;
  };
  reviewer: {
    role: "release-manager";
    scope: "legacy-latest-rollback-exception";
  };
  exception_review_accepted: boolean;
  release_execution_allowed: false;
  docker_deploy_allowed: false;
  observations: {
    plan_status: string;
    exception_plan_ready: boolean | null;
    plan_release_execution_allowed: boolean | null;
    plan_docker_deploy_allowed: boolean | null;
    current_image_tag: string;
    target_image_tag: string;
    current_image_proof_blockers: string[];
    workflow_pushes_latest: boolean | null;
    workflow_pushes_sha_tag: boolean | null;
    compose_requires_explicit_image_tag: boolean | null;
    compose_defaults_latest: boolean | null;
    plan_exception_blockers: string[];
    plan_release_decision_blockers: string[];
  };
  gates: ExceptionReviewGate[];
  summary: ExceptionReviewSummary;
  result: {
    status: "accepted" | "blocked" | "failed";
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

function immutableCandidateTag(value: string): boolean {
  return /^[a-f0-9]{40}$/.test(value);
}

function gate(input: ExceptionReviewGate): ExceptionReviewGate {
  return input;
}

function summarize(gates: ExceptionReviewGate[]): ExceptionReviewSummary {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    failed: gates.filter((item) => item.status === "fail").length,
    exception_review_blockers: gates
      .filter((item) => item.blocks_exception_review && item.status !== "pass")
      .map((item) => item.id),
    release_execution_blockers: gates
      .filter((item) => item.blocks_release_execution && item.status !== "pass")
      .map((item) => item.id),
    docker_deploy_blockers: gates
      .filter((item) => item.blocks_docker_deploy && item.status !== "pass")
      .map((item) => item.id)
  };
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

export function buildAdminDockerLegacyRollbackExceptionReviewReport(input: {
  generated_at: string;
  command: string;
  legacy_rollback_plan_report_path: string;
  legacy_rollback_plan_report: unknown;
}): AdminDockerLegacyRollbackExceptionReviewReport {
  const plan = asRecord(input.legacy_rollback_plan_report);
  const planObservations = asRecord(plan.observations);
  const planSummary = asRecord(plan.summary);
  const planProvided = Boolean(input.legacy_rollback_plan_report_path && input.legacy_rollback_plan_report);
  const exceptionPlanReady = asBoolean(plan.exception_plan_ready);
  const planReleaseAllowed = asBoolean(plan.release_execution_allowed);
  const planDeployAllowed = asBoolean(plan.docker_deploy_allowed);
  const currentTag = asString(planObservations.current_image_tag);
  const targetTag = asString(planObservations.target_image_tag);
  const currentProofBlockers = stringArray(planObservations.current_image_proof_blockers);
  const workflowPushesLatest = asBoolean(planObservations.workflow_pushes_latest);
  const workflowPushesShaTag = asBoolean(planObservations.workflow_pushes_sha_tag);
  const composeExplicit = asBoolean(planObservations.compose_requires_explicit_image_tag);
  const composeDefaultsLatest = asBoolean(planObservations.compose_defaults_latest);
  const planExceptionBlockers = stringArray(planSummary.exception_plan_blockers);
  const planReleaseDecisionBlockers = stringArray(planSummary.release_decision_blockers);
  const onlyApprovalBlocker = planReleaseDecisionBlockers.length === 1 &&
    planReleaseDecisionBlockers[0] === "explicit-legacy-rollback-exception-approval";
  const planIsNondeploy = planReleaseAllowed === false && planDeployAllowed === false;
  const currentStateIsLegacyLatest = currentTag === "latest" &&
    currentProofBlockers.length === 1 &&
    currentProofBlockers[0] === "current-tag-stable-for-rollback";
  const workflowAndComposeHardened = workflowPushesLatest === false &&
    workflowPushesShaTag === true &&
    composeExplicit === true &&
    composeDefaultsLatest === false;

  const gates = [
    gate({
      id: "exception-review-no-side-effects",
      title: "Exception review is local and read-only",
      category: "safety",
      status: "pass",
      evidence: "This release-manager review reads archived evidence only; it does not contact NAS, Docker, GHCR, GitHub, Admin API, Cutter API, or Windows Runner.",
      blocks_exception_review: false,
      blocks_release_execution: false,
      blocks_docker_deploy: false
    }),
    gate({
      id: "release-manager-role-assigned",
      title: "A release-manager role performs this exception review",
      category: "release-manager",
      status: "pass",
      evidence: "reviewer.role=release-manager, scope=legacy-latest-rollback-exception",
      blocks_exception_review: false,
      blocks_release_execution: false,
      blocks_docker_deploy: false
    }),
    gate({
      id: "legacy-rollback-plan-provided",
      title: "Legacy rollback plan report is provided",
      category: "evidence",
      status: planProvided ? "pass" : "blocked",
      evidence: input.legacy_rollback_plan_report_path || "missing",
      blocks_exception_review: !planProvided,
      blocks_release_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Provide the current admin-docker-legacy-rollback-plan JSON report."
    }),
    gate({
      id: "legacy-rollback-plan-ready",
      title: "Legacy rollback exception plan is ready",
      category: "evidence",
      status: exceptionPlanReady ? "pass" : "blocked",
      evidence: `exception_plan_ready=${String(exceptionPlanReady)}, blockers=${planExceptionBlockers.join(", ") || "none"}`,
      blocks_exception_review: !exceptionPlanReady,
      blocks_release_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "The legacy rollback plan must have exception_plan_ready=true and no exception_plan_blockers."
    }),
    gate({
      id: "review-plan-does-not-approve-release-or-deploy",
      title: "Source plan remains review-only",
      category: "release-boundary",
      status: planProvided && !planIsNondeploy ? "fail" : "pass",
      evidence: `release_execution_allowed=${String(planReleaseAllowed)}, docker_deploy_allowed=${String(planDeployAllowed)}`,
      blocks_exception_review: true,
      blocks_release_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "The source plan must keep release_execution_allowed=false and docker_deploy_allowed=false."
    }),
    gate({
      id: "current-state-is-legacy-latest",
      title: "Current NAS state is the legacy latest state",
      category: "evidence",
      status: currentStateIsLegacyLatest ? "pass" : "blocked",
      evidence: `current=${currentTag || "missing"}, proof_blockers=${currentProofBlockers.join(", ") || "none"}`,
      blocks_exception_review: !currentStateIsLegacyLatest,
      blocks_release_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "The one-time exception only applies when the current NAS tag is latest and the only image-proof blocker is current-tag-stable-for-rollback."
    }),
    gate({
      id: "target-tag-is-immutable",
      title: "Target image tag is immutable",
      category: "evidence",
      status: immutableCandidateTag(targetTag) ? "pass" : "blocked",
      evidence: `target=${targetTag || "missing"}`,
      blocks_exception_review: !immutableCandidateTag(targetTag),
      blocks_release_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "The staged target must be a 40-character immutable candidate SHA, not latest or a branch name."
    }),
    gate({
      id: "workflow-and-compose-are-hardened",
      title: "Workflow and compose no longer mutate latest",
      category: "evidence",
      status: workflowAndComposeHardened ? "pass" : "blocked",
      evidence: `workflow_pushes_latest=${String(workflowPushesLatest)}, workflow_pushes_sha=${String(workflowPushesShaTag)}, compose_explicit_tag=${String(composeExplicit)}, compose_defaults_latest=${String(composeDefaultsLatest)}`,
      blocks_exception_review: !workflowAndComposeHardened,
      blocks_release_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Workflow must push immutable SHA tags only, and compose must require an explicit target tag without latest fallback."
    }),
    gate({
      id: "only-explicit-exception-approval-remains",
      title: "Only the explicit exception approval blocker remains in the source plan",
      category: "release-manager",
      status: onlyApprovalBlocker ? "pass" : "blocked",
      evidence: `release_decision_blockers=${planReleaseDecisionBlockers.join(", ") || "none"}`,
      blocks_exception_review: !onlyApprovalBlocker,
      blocks_release_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Before release-manager acceptance, the plan may only be blocked by explicit-legacy-rollback-exception-approval."
    })
  ];
  const summary = summarize(gates);
  const exceptionReviewAccepted = summary.failed === 0 && summary.exception_review_blockers.length === 0;

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-legacy-rollback-exception-review",
    sources: {
      legacy_rollback_plan_report: input.legacy_rollback_plan_report_path
    },
    reviewer: {
      role: "release-manager",
      scope: "legacy-latest-rollback-exception"
    },
    exception_review_accepted: exceptionReviewAccepted,
    release_execution_allowed: false,
    docker_deploy_allowed: false,
    observations: {
      plan_status: resultStatus(plan),
      exception_plan_ready: exceptionPlanReady,
      plan_release_execution_allowed: planReleaseAllowed,
      plan_docker_deploy_allowed: planDeployAllowed,
      current_image_tag: currentTag,
      target_image_tag: targetTag,
      current_image_proof_blockers: currentProofBlockers,
      workflow_pushes_latest: workflowPushesLatest,
      workflow_pushes_sha_tag: workflowPushesShaTag,
      compose_requires_explicit_image_tag: composeExplicit,
      compose_defaults_latest: composeDefaultsLatest,
      plan_exception_blockers: planExceptionBlockers,
      plan_release_decision_blockers: planReleaseDecisionBlockers
    },
    gates,
    summary,
    result: {
      status: summary.failed > 0
        ? "failed"
        : exceptionReviewAccepted
          ? "accepted"
          : "blocked",
      summary: exceptionReviewAccepted
        ? "Release-manager review accepts the one-time legacy latest rollback exception for release-input generation only; push/deploy remain separately blocked."
        : "Release-manager review blocks the legacy latest rollback exception until the source plan is safe and complete."
    },
    artifacts: null
  };
}

export function toMarkdown(report: AdminDockerLegacyRollbackExceptionReviewReport): string {
  return [
    "# Admin Docker Legacy Rollback Exception Review",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Result: ${report.result.status}`,
    `Exception review accepted: ${report.exception_review_accepted ? "yes" : "no"}`,
    "Release execution allowed: no",
    "Docker deploy allowed: no",
    "",
    "## Reviewer",
    "",
    `- Role: ${report.reviewer.role}`,
    `- Scope: ${report.reviewer.scope}`,
    "",
    "## Sources",
    "",
    `- Legacy rollback plan: ${report.sources.legacy_rollback_plan_report || "<missing>"}`,
    "",
    "## Observations",
    "",
    `- Current image tag: ${report.observations.current_image_tag || "<missing>"}`,
    `- Target image tag: ${report.observations.target_image_tag || "<missing>"}`,
    `- Plan blockers: ${report.observations.plan_exception_blockers.join(", ") || "none"}`,
    `- Release decision blockers: ${report.observations.plan_release_decision_blockers.join(", ") || "none"}`,
    `- Workflow pushes latest: ${report.observations.workflow_pushes_latest ? "yes" : "no"}`,
    `- Compose defaults latest: ${report.observations.compose_defaults_latest ? "yes" : "no"}`,
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Review | Blocks Release | Blocks Deploy | Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => [
      item.id,
      item.category,
      item.status,
      item.blocks_exception_review ? "yes" : "no",
      item.blocks_release_execution ? "yes" : "no",
      item.blocks_docker_deploy ? "yes" : "no",
      item.evidence.replace(/\|/g, "/")
    ].join(" | ")),
    "",
    "## Summary",
    "",
    `- Exception review blockers: ${report.summary.exception_review_blockers.join(", ") || "none"}`,
    `- Release execution blockers: ${report.summary.release_execution_blockers.join(", ") || "none"}`,
    `- Docker deploy blockers: ${report.summary.docker_deploy_blockers.join(", ") || "none"}`,
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "<not written>"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "<not written>"}`,
    ""
  ].join("\n");
}

export async function runAdminDockerLegacyRollbackExceptionReview(input: {
  legacy_rollback_plan_report_path?: string;
  output_dir?: string;
  artifact_dir?: string;
  generated_at?: string;
  command?: string;
} = {}): Promise<AdminDockerLegacyRollbackExceptionReviewReport> {
  const artifactDir = input.artifact_dir ?? DEFAULT_ARTIFACT_DIR;
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const planPath = input.legacy_rollback_plan_report_path ??
    await latestArtifact(artifactDir, "admin-docker-legacy-rollback-plan-");
  const report = buildAdminDockerLegacyRollbackExceptionReviewReport({
    generated_at: generatedAt,
    command: input.command ?? "npx tsx scripts/acceptance/admin-docker-legacy-rollback-exception-review.ts",
    legacy_rollback_plan_report_path: planPath,
    legacy_rollback_plan_report: await loadJson(planPath)
  });
  const stamp = timestampForFile(new Date(generatedAt));
  const jsonPath = path.join(outputDir, `admin-docker-legacy-rollback-exception-review-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-legacy-rollback-exception-review-${stamp}.md`);
  const reportWithArtifacts: AdminDockerLegacyRollbackExceptionReviewReport = {
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
  const report = await runAdminDockerLegacyRollbackExceptionReview({
    legacy_rollback_plan_report_path: process.env.MIXLAB_ADMIN_DOCKER_LEGACY_ROLLBACK_PLAN_REPORT ?? process.argv[2],
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    artifact_dir: process.env.MIXLAB_ACCEPTANCE_ARTIFACT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    exception_review_accepted: report.exception_review_accepted,
    release_execution_allowed: report.release_execution_allowed,
    docker_deploy_allowed: report.docker_deploy_allowed,
    current_image_tag: report.observations.current_image_tag,
    target_image_tag: report.observations.target_image_tag,
    blockers: report.summary.exception_review_blockers,
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
