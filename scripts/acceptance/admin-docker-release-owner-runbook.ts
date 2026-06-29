import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ARTIFACT_DIR = "docs/acceptance/artifacts";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_EXPECTED_READY_COUNT = 10471;
const DEFAULT_EXPECTED_INDEX_VERSION = "v010471";

type GateStatus = "pass" | "blocked" | "fail";
type GateCategory = "safety" | "evidence" | "release-decision" | "staging" | "post-release" | "rollback";

interface ReleaseOwnerRunbookGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_runbook: boolean;
  blocks_push_execution: boolean;
  blocks_docker_deploy: boolean;
  blocks_mvp_completion: boolean;
  required_evidence?: string;
}

interface ReleaseOwnerRunbookSummary {
  total: number;
  passed: number;
  blocked: number;
  failed: number;
  runbook_blockers: string[];
  push_execution_blockers: string[];
  docker_deploy_blockers: string[];
  mvp_completion_blockers: string[];
}

export interface AdminDockerReleaseOwnerRunbookReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-release-owner-runbook";
  sources: {
    push_decision_package_report: string;
    staging_runbook_report: string;
    release_inputs_report: string;
    readiness_summary_report: string;
  };
  release_owner_runbook_ready: boolean;
  release_decision_required: true;
  push_execution_allowed: false;
  docker_deploy_allowed: false;
  preprocess_execution_allowed: false;
  mvp_completion_allowed: false;
  observations: {
    push_decision_package_ready: boolean | null;
    push_decision_status: string;
    readiness_ready: boolean | null;
    readiness_status: string;
    staging_execution_ready: boolean | null;
    staging_review_ready: boolean | null;
    staging_status: string;
    release_inputs_ready: boolean | null;
    release_inputs_status: string;
    current_image_tag: string;
    target_image_tag: string;
    rollback_image_tag: string;
    workflow_dispatch_command: string;
    post_release_smoke_command: string;
    controlled_preprocess_smoke_requires_approval: true;
    source_push_or_deploy_allowed: boolean;
  };
  runbook: {
    pre_release_review: string[];
    image_push_after_explicit_approval: string[];
    after_image_push_refresh: string[];
    nas_deploy_after_separate_runtime_approval: string[];
    post_deploy_readonly_smoke: string[];
    controlled_preprocess_smoke_after_approval: string[];
    rollback: string[];
  };
  gates: ReleaseOwnerRunbookGate[];
  summary: ReleaseOwnerRunbookSummary;
  result: {
    status: "ready-for-release-owner-review" | "blocked" | "failed";
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

function sourceAllowsPushOrDeploy(...reports: unknown[]): boolean {
  return reports.some((report) => (
    asBoolean(asRecord(report).push_execution_allowed) === true ||
    asBoolean(asRecord(report).docker_deploy_allowed) === true ||
    asBoolean(asRecord(report).docker_upload_allowed) === true
  ));
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

function gate(input: ReleaseOwnerRunbookGate): ReleaseOwnerRunbookGate {
  return input;
}

function summarize(gates: ReleaseOwnerRunbookGate[]): ReleaseOwnerRunbookSummary {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    failed: gates.filter((item) => item.status === "fail").length,
    runbook_blockers: gates
      .filter((item) => item.blocks_runbook && item.status !== "pass")
      .map((item) => item.id),
    push_execution_blockers: gates
      .filter((item) => item.blocks_push_execution && item.status !== "pass")
      .map((item) => item.id),
    docker_deploy_blockers: gates
      .filter((item) => item.blocks_docker_deploy && item.status !== "pass")
      .map((item) => item.id),
    mvp_completion_blockers: gates
      .filter((item) => item.blocks_mvp_completion && item.status !== "pass")
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

function postReleaseSmokeCommand(input: {
  target_image_tag: string;
  expected_ready_count: number;
  expected_index_version: string;
}): string {
  return [
    `MIXLAB_ADMIN_DOCKER_POST_RELEASE_BASE_URL="http://<nas-ip>:<admin-web-port>" \\`,
    `MIXLAB_ADMIN_DOCKER_POST_RELEASE_EXPECT_TARGET_IMAGE_TAG="${input.target_image_tag || "<target-image-tag>"}" \\`,
    `MIXLAB_ADMIN_DOCKER_POST_RELEASE_EXPECT_READY_COUNT="${input.expected_ready_count}" \\`,
    `MIXLAB_ADMIN_DOCKER_POST_RELEASE_EXPECT_INDEX_VERSION="${input.expected_index_version}" \\`,
    `MIXLAB_ADMIN_DOCKER_POST_RELEASE_SESSION_TOKEN="<temporary-admin-session-token>" \\`,
    "npm run validate:admin-docker-post-release-smoke"
  ].join("\n");
}

function buildRunbook(input: {
  workflow_command: string;
  post_release_smoke_command: string;
  current_image_tag: string;
  target_image_tag: string;
  rollback_image_tag: string;
}): AdminDockerReleaseOwnerRunbookReport["runbook"] {
  return {
    pre_release_review: [
      "Confirm the latest release-readiness summary is ready-for-release-decision with zero release review blockers.",
      "Confirm the push decision package is ready-for-external-release-decision and still reports push_execution_allowed=false.",
      `Confirm current=${input.current_image_tag || "<missing>"}, target=${input.target_image_tag || "<missing>"}, rollback=${input.rollback_image_tag || "<missing>"}.`,
      "Confirm the current worktree has not introduced runtime/web build inputs that should replace the immutable target candidate.",
      "Confirm the release owner explicitly accepts this one release decision before any push_images=true workflow dispatch."
    ],
    image_push_after_explicit_approval: [
      "Run the workflow command exactly as prepared by the push decision package, only after release-owner approval:",
      input.workflow_command || "# missing workflow command",
      "Do not edit NAS .env, pull/restart containers, enable workers, or run preprocessing as part of image push."
    ],
    after_image_push_refresh: [
      "Archive the completed GitHub run artifact for the push_images=true workflow.",
      "Regenerate admin-docker-image-push-proof and require proof_accepted=true.",
      "Regenerate staging runbook with MIXLAB_DOCKER_PUSH_APPROVAL=workflow_dispatch:push_images=true and the accepted image-push proof.",
      "Regenerate release-readiness summary before any NAS runtime action."
    ],
    nas_deploy_after_separate_runtime_approval: [
      "Only after a separate NAS runtime/deploy approval, set the NAS Docker staging .env image tag to the target candidate.",
      "Pull admin-web, admin-api, and admin-worker images.",
      "Restart only admin-web, admin-api, and admin-worker with MVP worker flags still controlled.",
      "Do not enable library preprocess worker or ready publish worker during the initial deploy smoke."
    ],
    post_deploy_readonly_smoke: [
      "Run the final URL read-only smoke command:",
      input.post_release_smoke_command,
      "Run or refresh live-readonly, version parity, worker proof, Cutter compatibility proof, and readiness summary from post-deploy evidence.",
      "Do not mark MVP complete unless the final URL smoke, Cutter invariants, ready count, and current index are proven."
    ],
    controlled_preprocess_smoke_after_approval: [
      "Only after explicit production small-batch preprocess approval, record before ready count, current index, queue counts, disk safety, and worker env.",
      "Use a tiny non-ready-only batch; do not run scan apply, index repair, ready publish, or broad recovery.",
      "Verify ready materials cannot be queued/retried/recovered and remain immutable.",
      "Record after ready count, current index, Cutter smoke, and audit log."
    ],
    rollback: [
      `Set the NAS Docker image tag back to rollback=${input.rollback_image_tag || "<rollback-image-tag>"}.`,
      "Restart admin-api, admin-web, and admin-worker using the rollback image tag.",
      "Re-run final URL read-only smoke and Cutter compatibility smoke after rollback.",
      "Do not run scan/apply, index repair, recovery, publish, worker-enable, or preprocessing during rollback unless separately approved."
    ]
  };
}

export function buildAdminDockerReleaseOwnerRunbookReport(input: {
  generated_at: string;
  command: string;
  push_decision_package_report_path: string;
  push_decision_package_report: unknown;
  staging_runbook_report_path: string;
  staging_runbook_report: unknown;
  release_inputs_report_path: string;
  release_inputs_report: unknown;
  readiness_summary_report_path: string;
  readiness_summary_report: unknown;
  expected_ready_count?: number;
  expected_index_version?: string;
}): AdminDockerReleaseOwnerRunbookReport {
  const pushPackage = asRecord(input.push_decision_package_report);
  const pushObservations = asRecord(pushPackage.observations);
  const pushSummary = asRecord(pushPackage.summary);
  const staging = asRecord(input.staging_runbook_report);
  const stagingSummary = asRecord(staging.summary);
  const releaseInputs = asRecord(input.release_inputs_report);
  const releaseInputsValues = asRecord(releaseInputs.inputs);
  const releaseInputsSummary = asRecord(releaseInputs.summary);
  const readiness = asRecord(input.readiness_summary_report);
  const readinessSummary = asRecord(readiness.summary);
  const currentTag = asString(releaseInputsValues.current_image_tag) || asString(pushObservations.current_image_tag);
  const targetTag = asString(releaseInputsValues.target_image_tag) || asString(pushObservations.target_image_tag);
  const rollbackTag = asString(releaseInputsValues.rollback_image_tag) || asString(pushObservations.rollback_image_tag);
  const workflowCommand = asString(releaseInputsValues.workflow_dispatch_command) || asString(pushObservations.workflow_dispatch_command);
  const expectedReadyCount = input.expected_ready_count ?? DEFAULT_EXPECTED_READY_COUNT;
  const expectedIndexVersion = input.expected_index_version ?? DEFAULT_EXPECTED_INDEX_VERSION;
  const finalSmokeCommand = postReleaseSmokeCommand({
    target_image_tag: targetTag,
    expected_ready_count: expectedReadyCount,
    expected_index_version: expectedIndexVersion
  });
  const pushPackageReady = asBoolean(pushPackage.push_decision_package_ready);
  const readinessReady = asBoolean(readiness.release_review_ready);
  const stagingExecutionReady = asBoolean(staging.staging_execution_ready);
  const stagingReviewReady = asBoolean(staging.staging_review_ready);
  const releaseInputsReady = asBoolean(releaseInputs.release_inputs_ready);
  const sourcePushOrDeployAllowed = sourceAllowsPushOrDeploy(pushPackage, staging, releaseInputs, readiness);
  const readinessBlockers = stringArray(readinessSummary.release_review_blockers);
  const packageBlockers = stringArray(pushSummary.package_blockers);
  const stagingBlockers = stringArray(stagingSummary.staging_blockers);
  const stagingExecutionBlockers = stringArray(stagingSummary.staging_execution_blockers);
  const releaseInputBlockers = stringArray(releaseInputsSummary.release_input_blockers);
  const workflowCommandReady = commandLooksRunnable(workflowCommand, targetTag, currentTag, rollbackTag);
  const tagsPresent = Boolean(currentTag && targetTag && rollbackTag);
  const gates = [
    gate({
      id: "release-owner-runbook-no-side-effects",
      title: "Release owner runbook generation is read-only",
      category: "safety",
      status: "pass",
      evidence: "This report reads archived JSON reports only; it does not call GitHub, GHCR, NAS, Docker, Admin API, Cutter API, or Windows Runner.",
      blocks_runbook: false,
      blocks_push_execution: false,
      blocks_docker_deploy: false,
      blocks_mvp_completion: false
    }),
    gate({
      id: "source-reports-remain-nondeploy",
      title: "Source reports do not grant push or deploy",
      category: "safety",
      status: sourcePushOrDeployAllowed ? "fail" : "pass",
      evidence: `source_push_or_deploy_allowed=${String(sourcePushOrDeployAllowed)}`,
      blocks_runbook: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      blocks_mvp_completion: true,
      required_evidence: "All source reports must keep push_execution_allowed/docker_upload_allowed/docker_deploy_allowed false."
    }),
    gate({
      id: "readiness-ready-for-release-decision",
      title: "Release readiness summary is ready",
      category: "evidence",
      status: readinessReady && readinessBlockers.length === 0 ? "pass" : "blocked",
      evidence: `release_review_ready=${String(readinessReady)}, blockers=${readinessBlockers.join(", ") || "none"}`,
      blocks_runbook: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      blocks_mvp_completion: true,
      required_evidence: "Provide a release-readiness summary with release_review_ready=true and no release_review_blockers."
    }),
    gate({
      id: "push-decision-package-ready",
      title: "Push decision package is ready",
      category: "release-decision",
      status: pushPackageReady && packageBlockers.length === 0 ? "pass" : "blocked",
      evidence: `push_decision_package_ready=${String(pushPackageReady)}, blockers=${packageBlockers.join(", ") || "none"}`,
      blocks_runbook: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      blocks_mvp_completion: true,
      required_evidence: "Provide a ready admin-docker-push-decision-package artifact."
    }),
    gate({
      id: "staging-runbook-ready",
      title: "Staging runbook is ready for review",
      category: "staging",
      status: stagingExecutionReady && stagingReviewReady && stagingBlockers.length === 0 && stagingExecutionBlockers.length === 0 ? "pass" : "blocked",
      evidence: `staging_execution_ready=${String(stagingExecutionReady)}, staging_review_ready=${String(stagingReviewReady)}, blockers=${[...stagingExecutionBlockers, ...stagingBlockers].join(", ") || "none"}`,
      blocks_runbook: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      blocks_mvp_completion: true,
      required_evidence: "Provide a staging runbook with staging_execution_ready=true, staging_review_ready=true, and no blockers."
    }),
    gate({
      id: "release-inputs-ready",
      title: "Release inputs are ready",
      category: "evidence",
      status: releaseInputsReady && releaseInputBlockers.length === 0 ? "pass" : "blocked",
      evidence: `release_inputs_ready=${String(releaseInputsReady)}, blockers=${releaseInputBlockers.join(", ") || "none"}`,
      blocks_runbook: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      blocks_mvp_completion: true,
      required_evidence: "Provide a release-inputs artifact with current, target, rollback, and workflow command."
    }),
    gate({
      id: "image-tags-ready",
      title: "Current, target, and rollback tags are fixed",
      category: "rollback",
      status: tagsPresent ? "pass" : "blocked",
      evidence: `current=${currentTag || "missing"}, target=${targetTag || "missing"}, rollback=${rollbackTag || "missing"}`,
      blocks_runbook: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      blocks_mvp_completion: true,
      required_evidence: "Current, target, and rollback image tags must be present."
    }),
    gate({
      id: "workflow-command-ready",
      title: "Workflow command is exact",
      category: "release-decision",
      status: workflowCommandReady ? "pass" : "blocked",
      evidence: workflowCommand || "missing",
      blocks_runbook: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      blocks_mvp_completion: true,
      required_evidence: "Workflow command must be placeholder-free and match the accepted image tags."
    }),
    gate({
      id: "external-release-decision-required",
      title: "External release owner decision is required",
      category: "release-decision",
      status: "blocked",
      evidence: "This runbook prepares release-owner review; it does not approve or execute push_images=true.",
      blocks_runbook: false,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      blocks_mvp_completion: true,
      required_evidence: "Release owner must explicitly approve the workflow dispatch before push execution."
    }),
    gate({
      id: "separate-nas-runtime-approval-required",
      title: "NAS runtime deploy approval is separate",
      category: "staging",
      status: "blocked",
      evidence: "Image push approval does not by itself approve NAS .env edits, image pull, or container restart.",
      blocks_runbook: false,
      blocks_push_execution: false,
      blocks_docker_deploy: true,
      blocks_mvp_completion: true,
      required_evidence: "After image push proof is accepted, separately approve NAS runtime deployment."
    }),
    gate({
      id: "post-release-smoke-required",
      title: "Final URL read-only smoke remains required",
      category: "post-release",
      status: "blocked",
      evidence: "Final deployed Admin URL has not been proven by admin-docker-post-release-smoke in this runbook.",
      blocks_runbook: false,
      blocks_push_execution: false,
      blocks_docker_deploy: false,
      blocks_mvp_completion: true,
      required_evidence: "Run validate:admin-docker-post-release-smoke against the final Admin URL after deploy."
    }),
    gate({
      id: "controlled-preprocess-smoke-requires-approval",
      title: "Controlled preprocess smoke requires separate approval",
      category: "post-release",
      status: "blocked",
      evidence: "Production small-batch preprocessing is not part of this release-owner runbook execution.",
      blocks_runbook: false,
      blocks_push_execution: false,
      blocks_docker_deploy: false,
      blocks_mvp_completion: true,
      required_evidence: "Explicitly approve production small-batch preprocessing, then record before/after ready count, index, Cutter smoke, and audit log."
    })
  ];
  const summary = summarize(gates);
  const runbookReady = summary.failed === 0 && summary.runbook_blockers.length === 0;
  const runbook = buildRunbook({
    workflow_command: workflowCommand,
    post_release_smoke_command: finalSmokeCommand,
    current_image_tag: currentTag,
    target_image_tag: targetTag,
    rollback_image_tag: rollbackTag
  });

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-release-owner-runbook",
    sources: {
      push_decision_package_report: input.push_decision_package_report_path,
      staging_runbook_report: input.staging_runbook_report_path,
      release_inputs_report: input.release_inputs_report_path,
      readiness_summary_report: input.readiness_summary_report_path
    },
    release_owner_runbook_ready: runbookReady,
    release_decision_required: true,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    preprocess_execution_allowed: false,
    mvp_completion_allowed: false,
    observations: {
      push_decision_package_ready: pushPackageReady,
      push_decision_status: resultStatus(pushPackage),
      readiness_ready: readinessReady,
      readiness_status: resultStatus(readiness),
      staging_execution_ready: stagingExecutionReady,
      staging_review_ready: stagingReviewReady,
      staging_status: resultStatus(staging),
      release_inputs_ready: releaseInputsReady,
      release_inputs_status: resultStatus(releaseInputs),
      current_image_tag: currentTag,
      target_image_tag: targetTag,
      rollback_image_tag: rollbackTag,
      workflow_dispatch_command: workflowCommand,
      post_release_smoke_command: finalSmokeCommand,
      controlled_preprocess_smoke_requires_approval: true,
      source_push_or_deploy_allowed: sourcePushOrDeployAllowed
    },
    runbook,
    gates,
    summary,
    result: {
      status: summary.failed > 0
        ? "failed"
        : runbookReady
          ? "ready-for-release-owner-review"
          : "blocked",
      summary: runbookReady
        ? "Release owner runbook is ready for review. It still does not approve push, deploy, preprocessing, or MVP completion."
        : "Release owner runbook is blocked until archived release evidence is ready."
    },
    artifacts: null
  };
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function gateRows(gates: ReleaseOwnerRunbookGate[]): string {
  return gates.map((item) => [
    item.id,
    item.category,
    item.status,
    item.blocks_runbook ? "yes" : "no",
    item.blocks_push_execution ? "yes" : "no",
    item.blocks_docker_deploy ? "yes" : "no",
    item.blocks_mvp_completion ? "yes" : "no",
    item.evidence,
    item.required_evidence ?? "n/a"
  ].map((cell) => escapeMarkdownCell(cell)).join(" | ")).join("\n");
}

function listRows(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

export function toMarkdown(report: AdminDockerReleaseOwnerRunbookReport): string {
  return `# Admin Docker Release Owner Runbook

Generated: ${report.generated_at}

Mode: ${report.mode}

Result: ${report.result.status}

Runbook ready: ${report.release_owner_runbook_ready ? "yes" : "no"}

Release decision required: yes

Push execution allowed: no

Docker deploy allowed: no

Preprocess execution allowed: no

MVP completion allowed: no

This runbook reads archived evidence only. It does not call GitHub, push images, edit NAS runtime, pull/restart containers, enable workers, run preprocessing, or write PublicLibrary.

## Sources

- Push decision package: ${report.sources.push_decision_package_report || "missing"}
- Staging runbook: ${report.sources.staging_runbook_report || "missing"}
- Release inputs: ${report.sources.release_inputs_report || "missing"}
- Readiness summary: ${report.sources.readiness_summary_report || "missing"}

## Key Commands

### Image Push After Explicit Approval

\`\`\`sh
${report.observations.workflow_dispatch_command || "# missing workflow command"}
\`\`\`

### Final URL Read-only Smoke After Deploy

\`\`\`sh
${report.observations.post_release_smoke_command}
\`\`\`

## Observations

- Current image tag: ${report.observations.current_image_tag || "missing"}
- Target image tag: ${report.observations.target_image_tag || "missing"}
- Rollback image tag: ${report.observations.rollback_image_tag || "missing"}
- Push decision package ready: ${String(report.observations.push_decision_package_ready)}
- Readiness ready: ${String(report.observations.readiness_ready)}
- Staging execution ready: ${String(report.observations.staging_execution_ready)}
- Staging review ready: ${String(report.observations.staging_review_ready)}
- Release inputs ready: ${String(report.observations.release_inputs_ready)}
- Source push/deploy allowed: ${String(report.observations.source_push_or_deploy_allowed)}

## Runbook

### Pre-release Review
${listRows(report.runbook.pre_release_review)}

### Image Push
${listRows(report.runbook.image_push_after_explicit_approval)}

### After Image Push Refresh
${listRows(report.runbook.after_image_push_refresh)}

### NAS Deploy
${listRows(report.runbook.nas_deploy_after_separate_runtime_approval)}

### Post-deploy Read-only Smoke
${listRows(report.runbook.post_deploy_readonly_smoke)}

### Controlled Preprocess Smoke
${listRows(report.runbook.controlled_preprocess_smoke_after_approval)}

### Rollback
${listRows(report.runbook.rollback)}

## Summary

- Passed: ${report.summary.passed}
- Blocked: ${report.summary.blocked}
- Failed: ${report.summary.failed}
- Runbook blockers: ${report.summary.runbook_blockers.join(", ") || "none"}
- Push execution blockers: ${report.summary.push_execution_blockers.join(", ") || "none"}
- Docker deploy blockers: ${report.summary.docker_deploy_blockers.join(", ") || "none"}
- MVP completion blockers: ${report.summary.mvp_completion_blockers.join(", ") || "none"}

## Gates

| Gate | Category | Status | Blocks Runbook | Blocks Push | Blocks Deploy | Blocks MVP | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${gateRows(report.gates)}

## Artifacts

- JSON: ${report.artifacts?.json_path ?? "not written"}
- Markdown: ${report.artifacts?.markdown_path ?? "not written"}
`;
}

export async function runAdminDockerReleaseOwnerRunbook(input: {
  push_decision_package_report_path?: string;
  staging_runbook_report_path?: string;
  release_inputs_report_path?: string;
  readiness_summary_report_path?: string;
  output_dir?: string;
  artifact_dir?: string;
  generated_at?: string;
  command?: string;
} = {}): Promise<AdminDockerReleaseOwnerRunbookReport> {
  const artifactDir = input.artifact_dir ?? DEFAULT_ARTIFACT_DIR;
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const pushDecisionPackagePath = input.push_decision_package_report_path ?? await latestArtifact(artifactDir, "admin-docker-push-decision-package-");
  const pushDecisionPackageReport = await loadJson(pushDecisionPackagePath);
  const pushDecisionSources = asRecord(asRecord(pushDecisionPackageReport).sources);
  const stagingRunbookPath = input.staging_runbook_report_path ||
    asString(pushDecisionSources.staging_runbook_report) ||
    await latestArtifact(artifactDir, "admin-docker-staging-runbook-");
  const releaseInputsPath = input.release_inputs_report_path ||
    asString(pushDecisionSources.release_inputs_report) ||
    await latestArtifact(artifactDir, "admin-docker-release-inputs-");
  const readinessPath = input.readiness_summary_report_path ||
    asString(pushDecisionSources.readiness_summary_report) ||
    await latestArtifact(artifactDir, "admin-docker-release-readiness-summary-");
  const report = buildAdminDockerReleaseOwnerRunbookReport({
    generated_at: generatedAt,
    command: input.command ?? "npx tsx scripts/acceptance/admin-docker-release-owner-runbook.ts",
    push_decision_package_report_path: pushDecisionPackagePath,
    push_decision_package_report: pushDecisionPackageReport,
    staging_runbook_report_path: stagingRunbookPath,
    staging_runbook_report: await loadJson(stagingRunbookPath),
    release_inputs_report_path: releaseInputsPath,
    release_inputs_report: await loadJson(releaseInputsPath),
    readiness_summary_report_path: readinessPath,
    readiness_summary_report: await loadJson(readinessPath)
  });
  const stamp = timestampForFile(new Date(generatedAt));
  const jsonPath = path.join(outputDir, `admin-docker-release-owner-runbook-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-release-owner-runbook-${stamp}.md`);
  const reportWithArtifacts: AdminDockerReleaseOwnerRunbookReport = {
    ...report,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(reportWithArtifacts, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, toMarkdown(reportWithArtifacts), "utf8");

  return reportWithArtifacts;
}

async function main(): Promise<void> {
  const report = await runAdminDockerReleaseOwnerRunbook({
    push_decision_package_report_path: process.env.MIXLAB_ADMIN_DOCKER_PUSH_DECISION_PACKAGE_REPORT ?? process.argv[2],
    staging_runbook_report_path: process.env.MIXLAB_ADMIN_DOCKER_STAGING_RUNBOOK_REPORT ?? process.argv[3],
    release_inputs_report_path: process.env.MIXLAB_ADMIN_DOCKER_RELEASE_INPUTS_REPORT ?? process.argv[4],
    readiness_summary_report_path: process.env.MIXLAB_ADMIN_DOCKER_RELEASE_READINESS_SUMMARY_REPORT ?? process.argv[5],
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    artifact_dir: process.env.MIXLAB_ACCEPTANCE_ARTIFACT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    release_owner_runbook_ready: report.release_owner_runbook_ready,
    push_execution_allowed: report.push_execution_allowed,
    docker_deploy_allowed: report.docker_deploy_allowed,
    preprocess_execution_allowed: report.preprocess_execution_allowed,
    mvp_completion_allowed: report.mvp_completion_allowed,
    workflow_dispatch_command: report.observations.workflow_dispatch_command,
    post_release_smoke_command: report.observations.post_release_smoke_command,
    runbook_blockers: report.summary.runbook_blockers,
    push_execution_blockers: report.summary.push_execution_blockers,
    docker_deploy_blockers: report.summary.docker_deploy_blockers,
    mvp_completion_blockers: report.summary.mvp_completion_blockers,
    json_path: report.artifacts?.json_path,
    markdown_path: report.artifacts?.markdown_path
  }, null, 2));

  if (report.result.status === "failed") {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
