import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";

type GateStatus = "pass" | "blocked" | "fail";
type GateCategory = "safety" | "handoff" | "image-proof" | "release-input" | "release-decision";

interface ReleaseInputGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_release_inputs: boolean;
  blocks_push_execution: boolean;
  blocks_docker_deploy: boolean;
  required_evidence?: string;
}

interface ReleaseInputSummary {
  total: number;
  passed: number;
  blocked: number;
  failed: number;
  release_input_blockers: string[];
  push_execution_blockers: string[];
  docker_deploy_blockers: string[];
}

interface ReleaseInputSources {
  prestaging_handoff_report: string;
  nas_image_proof_report: string;
}

export interface AdminDockerReleaseInputsReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-release-inputs";
  sources: ReleaseInputSources;
  release_inputs_ready: boolean;
  push_execution_allowed: false;
  docker_deploy_allowed: false;
  release_decision_required: true;
  inputs: {
    target_image_tag: string;
    current_image_tag: string;
    rollback_image_tag: string;
    branch: string;
    workflow_dispatch_command: string;
  };
  observations: {
    handoff_ready_to_request_release_inputs: boolean | null;
    handoff_staging_execution_ready: boolean | null;
    handoff_docker_deploy_allowed: boolean | null;
    handoff_staging_execution_blockers: string[];
    handoff_docker_deploy_blockers: string[];
    nas_image_proof_accepted: boolean | null;
    nas_image_proof_docker_deploy_allowed: boolean | null;
    nas_image_proof_blockers: string[];
    target_differs_from_current: boolean;
    rollback_matches_current: boolean;
  };
  gates: ReleaseInputGate[];
  summary: ReleaseInputSummary;
  next_actions: string[];
  result: {
    status: "ready-for-release-decision" | "blocked" | "failed";
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

function gate(input: ReleaseInputGate): ReleaseInputGate {
  return input;
}

function summarize(gates: ReleaseInputGate[]): ReleaseInputSummary {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    failed: gates.filter((item) => item.status === "fail").length,
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

function workflowCommand(input: {
  branch: string;
  current: string;
  rollback: string;
}): string {
  const branch = input.branch || "<candidate-branch>";
  const current = input.current || "<current-admin-docker-image-tag>";
  const rollback = input.rollback || "<rollback-admin-docker-image-tag>";

  return [
    "gh workflow run docker-admin.yml",
    "--repo alin155/mixlab",
    `--ref ${branch}`,
    "-f push_images=true",
    `-f current_image_tag=${current}`,
    `-f rollback_image_tag=${rollback}`
  ].join(" ");
}

function branchFromWorkflowCommand(command: string): string {
  const match = command.match(/(?:^|\s)--ref\s+([^\s]+)/);

  return match?.[1] ?? "";
}

function nextActions(input: {
  release_inputs_ready: boolean;
  workflow_dispatch_command: string;
  release_input_blockers: string[];
  staging_execution_blockers: string[];
}): string[] {
  if (!input.release_inputs_ready) {
    return [
      "Keep push_images=false until release inputs are ready.",
      "Run validate:admin-docker-nas-image-proof with a sanitized NAS MIXLAB_IMAGE_TAG evidence file and docker inspect evidence.",
      `Resolve release input blockers: ${input.release_input_blockers.join(", ") || "unknown"}.`
    ];
  }

  return [
    "Review this report and the NAS image proof report before any release decision.",
    `Before staging execution, clear handoff staging blockers: ${input.staging_execution_blockers.join(", ") || "none"}.`,
    `After explicit release approval only, run: ${input.workflow_dispatch_command}`,
    "Do not edit NAS .env, restart NAS containers, or enable workers until the pushed-image workflow succeeds and staging proof is collected.",
    "After the push workflow succeeds, regenerate GitHub run artifact, staging runbook, live-readonly, admin-worker env proof, and Cutter compatibility proof."
  ];
}

export function buildAdminDockerReleaseInputsReport(input: {
  generated_at: string;
  command: string;
  prestaging_handoff_report_path?: string;
  prestaging_handoff_report?: unknown;
  nas_image_proof_report_path?: string;
  nas_image_proof_report?: unknown;
}): AdminDockerReleaseInputsReport {
  const handoff = asRecord(input.prestaging_handoff_report);
  const proof = asRecord(input.nas_image_proof_report);
  const releaseInputRequest = asRecord(handoff.release_input_request);
  const candidate = asRecord(handoff.candidate);
  const proofInputs = asRecord(proof.release_inputs);
  const handoffSummary = asRecord(handoff.summary);
  const proofSummary = asRecord(proof.summary);
  const target = asString(releaseInputRequest.target_image_tag);
  const branch = asString(candidate.head_branch)
    || branchFromWorkflowCommand(asString(releaseInputRequest.workflow_dispatch_command))
    || "codex/windows-first-run-autostart-20260615104835";
  const current = asString(proofInputs.current_image_tag);
  const rollback = asString(proofInputs.rollback_image_tag);
  const command = workflowCommand({ branch, current, rollback });
  const handoffProvided = Boolean(input.prestaging_handoff_report_path && input.prestaging_handoff_report);
  const proofProvided = Boolean(input.nas_image_proof_report_path && input.nas_image_proof_report);
  const handoffReady = asBoolean(handoff.ready_to_request_release_inputs);
  const handoffStagingReady = asBoolean(handoff.staging_execution_ready);
  const handoffDeployAllowed = asBoolean(handoff.docker_deploy_allowed);
  const proofAccepted = asBoolean(proof.proof_accepted);
  const proofDeployAllowed = asBoolean(proof.docker_deploy_allowed);
  const handoffStagingExecutionBlockers = stringArray(handoffSummary.staging_execution_blockers);
  const handoffDockerDeployBlockers = stringArray(handoffSummary.docker_deploy_blockers);
  const proofBlockers = stringArray(proofSummary.release_input_blockers);
  const targetDiffers = Boolean(target && current && target !== current);
  const rollbackMatchesCurrent = Boolean(current && rollback && current === rollback);
  const commandHasNoPlaceholders = Boolean(command && !command.includes("<") && !command.includes(">"));
  const gates = [
    gate({
      id: "release-inputs-no-side-effects",
      title: "Release input packaging is read-only",
      category: "safety",
      status: "pass",
      evidence: "This report reads prestaging handoff and NAS image proof JSON only; it does not contact NAS, Docker, GitHub, Admin API, or Cutter.",
      blocks_release_inputs: false,
      blocks_push_execution: false,
      blocks_docker_deploy: false
    }),
    gate({
      id: "prestaging-handoff-provided",
      title: "Pre-staging handoff report is provided",
      category: "handoff",
      status: handoffProvided ? "pass" : "blocked",
      evidence: input.prestaging_handoff_report_path || "No MIXLAB_ADMIN_DOCKER_PRESTAGING_HANDOFF_REPORT path provided.",
      blocks_release_inputs: !handoffProvided,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Run validate:admin-docker-prestaging-handoff and provide the JSON report path."
    }),
    gate({
      id: "nas-image-proof-provided",
      title: "NAS image proof report is provided",
      category: "image-proof",
      status: proofProvided ? "pass" : "blocked",
      evidence: input.nas_image_proof_report_path || "No MIXLAB_ADMIN_DOCKER_NAS_IMAGE_PROOF_REPORT path provided.",
      blocks_release_inputs: !proofProvided,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Run validate:admin-docker-nas-image-proof with exported NAS .env and docker inspect evidence."
    }),
    gate({
      id: "handoff-ready-to-request-release-inputs",
      title: "Handoff is ready to request release inputs",
      category: "handoff",
      status: handoffReady ? "pass" : "blocked",
      evidence: `ready_to_request_release_inputs=${String(handoffReady)}`,
      blocks_release_inputs: !handoffReady,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Pre-staging handoff must have ready_to_request_release_inputs=true."
    }),
    gate({
      id: "handoff-does-not-approve-staging-or-deploy",
      title: "Handoff still does not approve staging or deploy",
      category: "safety",
      status: handoffStagingReady === true || handoffDeployAllowed === true ? "fail" : "pass",
      evidence: `staging_execution_ready=${String(handoffStagingReady)}, docker_deploy_allowed=${String(handoffDeployAllowed)}`,
      blocks_release_inputs: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Release input packaging must be based on a non-deploy pre-staging handoff."
    }),
    gate({
      id: "handoff-staging-blockers-carried-forward",
      title: "Pre-staging execution blockers are carried forward",
      category: "handoff",
      status: handoffStagingExecutionBlockers.length > 0 ? "blocked" : "pass",
      evidence: handoffStagingExecutionBlockers.length > 0
        ? `staging blockers=${handoffStagingExecutionBlockers.join(", ")}`
        : "No pre-staging execution blockers were reported.",
      blocks_release_inputs: false,
      blocks_push_execution: handoffStagingExecutionBlockers.length > 0,
      blocks_docker_deploy: true,
      required_evidence: "The release-input package must preserve pre-staging blockers so a generated push_images=true command is not mistaken for staging approval."
    }),
    gate({
      id: "nas-image-proof-accepted",
      title: "NAS current image proof is accepted",
      category: "image-proof",
      status: proofAccepted ? "pass" : "blocked",
      evidence: proofAccepted ? "proof_accepted=true" : `proof blockers=${proofBlockers.join(", ") || "unknown"}`,
      blocks_release_inputs: !proofAccepted,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "NAS image proof must accept a stable current image tag for current and rollback inputs."
    }),
    gate({
      id: "nas-proof-does-not-approve-deploy",
      title: "NAS image proof does not approve deploy",
      category: "safety",
      status: proofDeployAllowed === true ? "fail" : proofDeployAllowed === false ? "pass" : "blocked",
      evidence: `nas_image_proof.docker_deploy_allowed=${String(proofDeployAllowed)}`,
      blocks_release_inputs: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "NAS image proof must remain evidence-only with docker_deploy_allowed=false."
    }),
    gate({
      id: "target-image-tag-present",
      title: "Target image tag is present",
      category: "release-input",
      status: target ? "pass" : "blocked",
      evidence: `target_image_tag=${target || "missing"}`,
      blocks_release_inputs: !target,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Pre-staging handoff must include release_input_request.target_image_tag."
    }),
    gate({
      id: "current-and-rollback-tags-present",
      title: "Current and rollback tags are present",
      category: "release-input",
      status: current && rollback ? "pass" : "blocked",
      evidence: `current=${current || "missing"}, rollback=${rollback || "missing"}`,
      blocks_release_inputs: !(current && rollback),
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "NAS image proof must provide current_image_tag and rollback_image_tag."
    }),
    gate({
      id: "rollback-tag-matches-current",
      title: "Rollback tag matches current deployed tag",
      category: "release-input",
      status: rollbackMatchesCurrent ? "pass" : "blocked",
      evidence: `current=${current || "missing"}, rollback=${rollback || "missing"}`,
      blocks_release_inputs: !rollbackMatchesCurrent,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Rollback tag must match current image tag for the first Admin Docker update."
    }),
    gate({
      id: "target-tag-differs-from-current",
      title: "Target tag differs from current deployed tag",
      category: "release-input",
      status: targetDiffers ? "pass" : "blocked",
      evidence: `target=${target || "missing"}, current=${current || "missing"}`,
      blocks_release_inputs: !targetDiffers,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Target image tag must differ from the currently deployed Admin Docker tag."
    }),
    gate({
      id: "workflow-command-has-no-placeholders",
      title: "Workflow command has concrete image tags",
      category: "release-input",
      status: commandHasNoPlaceholders ? "pass" : "blocked",
      evidence: commandHasNoPlaceholders ? command : "Workflow command still contains placeholders.",
      blocks_release_inputs: !commandHasNoPlaceholders,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Provide accepted NAS image proof before generating the workflow command."
    }),
    gate({
      id: "explicit-release-approval-required",
      title: "Explicit release approval is still required",
      category: "release-decision",
      status: "blocked",
      evidence: "This report prepares release inputs only; it is not approval to run push_images=true.",
      blocks_release_inputs: false,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "A separate human release decision must explicitly authorize running the generated push_images=true command."
    })
  ];
  const summary = summarize(gates);
  const releaseInputsReady = summary.failed === 0 && summary.release_input_blockers.length === 0;

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-release-inputs",
    sources: {
      prestaging_handoff_report: input.prestaging_handoff_report_path ?? "",
      nas_image_proof_report: input.nas_image_proof_report_path ?? ""
    },
    release_inputs_ready: releaseInputsReady,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    release_decision_required: true,
    inputs: {
      target_image_tag: releaseInputsReady ? target : "",
      current_image_tag: releaseInputsReady ? current : "",
      rollback_image_tag: releaseInputsReady ? rollback : "",
      branch,
      workflow_dispatch_command: releaseInputsReady ? command : ""
    },
    observations: {
      handoff_ready_to_request_release_inputs: handoffReady,
      handoff_staging_execution_ready: handoffStagingReady,
      handoff_docker_deploy_allowed: handoffDeployAllowed,
      handoff_staging_execution_blockers: handoffStagingExecutionBlockers,
      handoff_docker_deploy_blockers: handoffDockerDeployBlockers,
      nas_image_proof_accepted: proofAccepted,
      nas_image_proof_docker_deploy_allowed: proofDeployAllowed,
      nas_image_proof_blockers: proofBlockers,
      target_differs_from_current: targetDiffers,
      rollback_matches_current: rollbackMatchesCurrent
    },
    gates,
    summary,
    next_actions: nextActions({
      release_inputs_ready: releaseInputsReady,
      workflow_dispatch_command: command,
      release_input_blockers: summary.release_input_blockers,
      staging_execution_blockers: handoffStagingExecutionBlockers
    }),
    result: {
      status: summary.failed > 0
        ? "failed"
        : releaseInputsReady
          ? "ready-for-release-decision"
          : "blocked",
      summary: releaseInputsReady
        ? "Release inputs are complete and ready for a separate explicit push_images=true release decision."
        : "Release inputs are blocked until pre-staging handoff and NAS image proof are accepted."
    },
    artifacts: null
  };
}

export function toMarkdown(report: AdminDockerReleaseInputsReport): string {
  const lines = [
    "# Admin Docker Release Inputs",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Result: ${report.result.status}`,
    `Release inputs ready: ${report.release_inputs_ready ? "yes" : "no"}`,
    "Push execution allowed: no",
    "Docker deploy allowed: no",
    "Release decision required: yes",
    "",
    "## Sources",
    "",
    `- Pre-staging handoff: ${report.sources.prestaging_handoff_report || "<missing>"}`,
    `- NAS image proof: ${report.sources.nas_image_proof_report || "<missing>"}`,
    "",
    "## Workflow Inputs",
    "",
    `- target_image_tag: ${report.inputs.target_image_tag || "<blocked>"}`,
    `- current_image_tag: ${report.inputs.current_image_tag || "<blocked>"}`,
    `- rollback_image_tag: ${report.inputs.rollback_image_tag || "<blocked>"}`,
    `- branch: ${report.inputs.branch || "<blocked>"}`,
    `- command: ${report.inputs.workflow_dispatch_command || "<blocked>"}`,
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Inputs | Blocks Push | Blocks Deploy | Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => [
      item.id,
      item.category,
      item.status,
      item.blocks_release_inputs ? "yes" : "no",
      item.blocks_push_execution ? "yes" : "no",
      item.blocks_docker_deploy ? "yes" : "no",
      item.evidence.replace(/\|/g, "/")
    ].join(" | ")),
    "",
    "## Summary",
    "",
    `- Release input blockers: ${report.summary.release_input_blockers.join(", ") || "none"}`,
    `- Push execution blockers: ${report.summary.push_execution_blockers.join(", ") || "none"}`,
    `- Docker deploy blockers: ${report.summary.docker_deploy_blockers.join(", ") || "none"}`,
    `- Handoff staging execution blockers: ${report.observations.handoff_staging_execution_blockers.join(", ") || "none"}`,
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

async function optionalLoadJson(filePath: string | undefined): Promise<unknown> {
  if (!filePath) {
    return undefined;
  }

  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

export async function runAdminDockerReleaseInputs(input: {
  prestaging_handoff_report_path?: string;
  nas_image_proof_report_path?: string;
  output_dir?: string;
  generated_at?: string;
  command?: string;
}): Promise<AdminDockerReleaseInputsReport> {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const report = buildAdminDockerReleaseInputsReport({
    generated_at: generatedAt,
    command: input.command ?? process.argv.join(" "),
    prestaging_handoff_report_path: input.prestaging_handoff_report_path,
    prestaging_handoff_report: await optionalLoadJson(input.prestaging_handoff_report_path),
    nas_image_proof_report_path: input.nas_image_proof_report_path,
    nas_image_proof_report: await optionalLoadJson(input.nas_image_proof_report_path)
  });
  const timestamp = timestampForFile(new Date(generatedAt));
  const jsonPath = path.join(outputDir, `admin-docker-release-inputs-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-release-inputs-${timestamp}.md`);
  const reportWithArtifacts: AdminDockerReleaseInputsReport = {
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
  const report = await runAdminDockerReleaseInputs({
    prestaging_handoff_report_path: process.env.MIXLAB_ADMIN_DOCKER_PRESTAGING_HANDOFF_REPORT ?? process.argv[2],
    nas_image_proof_report_path: process.env.MIXLAB_ADMIN_DOCKER_NAS_IMAGE_PROOF_REPORT ?? process.argv[3],
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    release_inputs_ready: report.release_inputs_ready,
    push_execution_allowed: report.push_execution_allowed,
    docker_deploy_allowed: report.docker_deploy_allowed,
    target_image_tag: report.inputs.target_image_tag,
    current_image_tag: report.inputs.current_image_tag,
    rollback_image_tag: report.inputs.rollback_image_tag,
    workflow_dispatch_command: report.inputs.workflow_dispatch_command,
    release_input_blockers: report.summary.release_input_blockers,
    push_execution_blockers: report.summary.push_execution_blockers,
    json_path: report.artifacts?.json_path,
    markdown_path: report.artifacts?.markdown_path
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
