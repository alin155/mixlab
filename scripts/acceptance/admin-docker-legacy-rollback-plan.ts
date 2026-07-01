import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_ARTIFACT_DIR = "docs/acceptance/artifacts";
const DEFAULT_WORKFLOW_PATH = ".github/workflows/docker-admin.yml";
const DEFAULT_COMPOSE_PATH = "deploy/nas/mixlab/docker-compose.yml";

type GateStatus = "pass" | "blocked";
type GateCategory = "safety" | "current-image" | "candidate" | "workflow" | "compose" | "release-decision";

interface LegacyRollbackGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_exception_plan: boolean;
  blocks_release_decision: boolean;
  required_evidence?: string;
}

interface LegacyRollbackSummary {
  total: number;
  passed: number;
  blocked: number;
  exception_plan_blockers: string[];
  release_decision_blockers: string[];
}

interface LegacyRollbackSources {
  nas_image_proof_report: string;
  github_artifact_readiness_report: string;
  workflow_file: string;
  compose_file: string;
}

export interface AdminDockerLegacyRollbackPlanReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-legacy-rollback-plan";
  sources: LegacyRollbackSources;
  exception_plan_ready: boolean;
  release_execution_allowed: false;
  docker_deploy_allowed: false;
  observations: {
    current_image_tag: string;
    current_image_proof_status: string;
    current_image_proof_blockers: string[];
    current_services: Array<{
      service: string;
      image_reference: string;
      image_tag: string;
    }>;
    target_image_tag: string;
    github_candidate_ready: boolean | null;
    workflow_pushes_latest: boolean;
    workflow_pushes_sha_tag: boolean;
    compose_requires_explicit_image_tag: boolean;
    compose_defaults_latest: boolean;
    legacy_exception_reason: string;
  };
  plan: {
    pre_push_proof: string[];
    push_candidate: string[];
    stage_candidate: string[];
    rollback: string[];
    post_stage_acceptance: string[];
  };
  gates: LegacyRollbackGate[];
  summary: LegacyRollbackSummary;
  result: {
    status: "ready-for-release-decision" | "blocked";
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

function gate(input: LegacyRollbackGate): LegacyRollbackGate {
  return input;
}

function summarize(gates: LegacyRollbackGate[]): LegacyRollbackSummary {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    exception_plan_blockers: gates
      .filter((item) => item.blocks_exception_plan && item.status !== "pass")
      .map((item) => item.id),
    release_decision_blockers: gates
      .filter((item) => item.blocks_release_decision && item.status !== "pass")
      .map((item) => item.id)
  };
}

function latestArtifact(artifactDir: string, prefix: string): Promise<string> {
  return readdir(artifactDir).then((files) => {
    const candidates = files
      .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
      .sort();

    if (candidates.length === 0) {
      throw new Error(`No ${prefix}*.json artifact found in ${artifactDir}`);
    }

    return path.join(artifactDir, candidates[candidates.length - 1]);
  });
}

async function loadJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Failed to read JSON report at ${filePath}: ${errorMessage(error)}`);
  }
}

function workflowPushesLatest(raw: string): boolean {
  return /mixlab-admin-(?:runtime|web):(?:latest|\$\{\{\s*github\.sha\s*\}\}\s*\n\s*ghcr\.io\/alin155\/mixlab-admin-(?:runtime|web):latest)/.test(raw) ||
    /:\s*latest\b/.test(raw);
}

function workflowPushesShaTag(raw: string): boolean {
  return raw.includes("ghcr.io/alin155/mixlab-admin-runtime:${{ github.sha }}") &&
    raw.includes("ghcr.io/alin155/mixlab-admin-web:${{ github.sha }}");
}

function composeRequiresExplicitImageTag(raw: string): boolean {
  return raw.includes("${MIXLAB_IMAGE_TAG:?Set MIXLAB_IMAGE_TAG to an immutable candidate SHA}");
}

function composeDefaultsLatest(raw: string): boolean {
  return raw.includes("MIXLAB_IMAGE_TAG:-latest") || /MIXLAB_IMAGE_TAG\s*=\s*latest/.test(raw);
}

function immutableCandidateTag(value: string): boolean {
  return /^[a-f0-9]{40}$/.test(value);
}

function commandList(items: string[]): string[] {
  return items.map((item) => `- ${item}`);
}

export function buildAdminDockerLegacyRollbackPlanReport(input: {
  generated_at: string;
  command: string;
  nas_image_proof_report_path: string;
  nas_image_proof_report: unknown;
  github_artifact_readiness_report_path: string;
  github_artifact_readiness_report: unknown;
  workflow_file_path: string;
  workflow_file_raw: string;
  compose_file_path: string;
  compose_file_raw: string;
}): AdminDockerLegacyRollbackPlanReport {
  const proof = asRecord(input.nas_image_proof_report);
  const proofObservations = asRecord(proof.observations);
  const proofSummary = asRecord(proof.summary);
  const github = asRecord(input.github_artifact_readiness_report);
  const githubObservations = asRecord(github.observations);
  const currentTag = asString(proofObservations.env_image_tag);
  const proofBlockers = stringArray(proofSummary.release_input_blockers);
  const services = asArray(proofObservations.services)
    .map((item) => asRecord(item))
    .map((item) => ({
      service: asString(item.service),
      image_reference: asString(item.image_reference),
      image_tag: asString(item.image_tag)
    }))
    .filter((item) => item.service);
  const serviceTags = [...new Set(services.map((item) => item.image_tag).filter(Boolean))].sort();
  const onlyLegacyLatestBlocker = proofBlockers.length === 1 && proofBlockers[0] === "current-tag-stable-for-rollback";
  const allServicesLatest = services.length >= 3 && serviceTags.length === 1 && serviceTags[0] === "latest";
  const githubReady = asBoolean(github.github_candidate_artifact_ready);
  const targetTag = asString(githubObservations.local_smoke_image_tag) ||
    asString(githubObservations.candidate_observed_image_tag);
  const pushesLatest = workflowPushesLatest(input.workflow_file_raw);
  const pushesShaTag = workflowPushesShaTag(input.workflow_file_raw);
  const composeExplicit = composeRequiresExplicitImageTag(input.compose_file_raw);
  const composeLatest = composeDefaultsLatest(input.compose_file_raw);

  const gates = [
    gate({
      id: "legacy-rollback-plan-no-side-effects",
      title: "Legacy rollback plan is read-only",
      category: "safety",
      status: "pass",
      evidence: "This report reads archived evidence and local deployment templates only; it does not contact NAS, Docker, GHCR, GitHub, Admin API, or Cutter.",
      blocks_exception_plan: false,
      blocks_release_decision: false
    }),
    gate({
      id: "nas-image-proof-provided",
      title: "NAS image proof report is provided",
      category: "current-image",
      status: input.nas_image_proof_report_path ? "pass" : "blocked",
      evidence: input.nas_image_proof_report_path || "missing",
      blocks_exception_plan: !input.nas_image_proof_report_path,
      blocks_release_decision: true,
      required_evidence: "Provide the latest admin-docker-nas-image-proof report."
    }),
    gate({
      id: "current-state-is-legacy-latest",
      title: "Current NAS Admin stack is the legacy latest-tag state",
      category: "current-image",
      status: currentTag === "latest" && allServicesLatest ? "pass" : "blocked",
      evidence: `env=${currentTag || "missing"}, service_tags=${serviceTags.join(", ") || "missing"}`,
      blocks_exception_plan: !(currentTag === "latest" && allServicesLatest),
      blocks_release_decision: true,
      required_evidence: "The exception plan only applies when current NAS evidence consistently shows admin-web/admin-api/admin-worker on latest."
    }),
    gate({
      id: "only-stable-rollback-tag-blocker",
      title: "NAS image proof is blocked only by mutable rollback tag",
      category: "current-image",
      status: onlyLegacyLatestBlocker ? "pass" : "blocked",
      evidence: `image proof status=${resultStatus(proof) || "unknown"}, blockers=${proofBlockers.join(", ") || "none"}`,
      blocks_exception_plan: !onlyLegacyLatestBlocker,
      blocks_release_decision: true,
      required_evidence: "Other image proof blockers must be cleared before considering a one-time legacy rollback exception."
    }),
    gate({
      id: "github-candidate-ready",
      title: "GitHub candidate artifact is ready",
      category: "candidate",
      status: githubReady ? "pass" : "blocked",
      evidence: `github_candidate_artifact_ready=${String(githubReady)}, target=${targetTag || "missing"}`,
      blocks_exception_plan: !githubReady,
      blocks_release_decision: true,
      required_evidence: "Use a GitHub candidate artifact readiness report with github_candidate_artifact_ready=true."
    }),
    gate({
      id: "target-tag-immutable",
      title: "Target image tag is immutable",
      category: "candidate",
      status: immutableCandidateTag(targetTag) ? "pass" : "blocked",
      evidence: `target=${targetTag || "missing"}`,
      blocks_exception_plan: !immutableCandidateTag(targetTag),
      blocks_release_decision: true,
      required_evidence: "Target image tag must be the accepted 40-character Git SHA."
    }),
    gate({
      id: "workflow-does-not-push-latest",
      title: "Candidate push workflow does not mutate latest",
      category: "workflow",
      status: !pushesLatest && pushesShaTag ? "pass" : "blocked",
      evidence: `pushes_sha_tag=${String(pushesShaTag)}, pushes_latest=${String(pushesLatest)}`,
      blocks_exception_plan: pushesLatest || !pushesShaTag,
      blocks_release_decision: true,
      required_evidence: "The Admin Docker workflow must push only immutable SHA tags before latest can be treated as a legacy rollback reference."
    }),
    gate({
      id: "compose-requires-explicit-target-tag",
      title: "NAS compose template requires explicit target tag",
      category: "compose",
      status: composeExplicit && !composeLatest ? "pass" : "blocked",
      evidence: `explicit_tag=${String(composeExplicit)}, defaults_latest=${String(composeLatest)}`,
      blocks_exception_plan: !composeExplicit || composeLatest,
      blocks_release_decision: true,
      required_evidence: "NAS compose must not default to latest for the new staged target."
    }),
    gate({
      id: "explicit-legacy-rollback-exception-approval",
      title: "Explicit approval is required for the one-time legacy latest rollback exception",
      category: "release-decision",
      status: "blocked",
      evidence: "This plan intentionally does not approve using latest as rollback; it only makes the exception reviewable.",
      blocks_exception_plan: false,
      blocks_release_decision: true,
      required_evidence: "A release owner must explicitly accept or reject the legacy latest rollback exception before push_images=true or NAS staging."
    })
  ];
  const summary = summarize(gates);
  const exceptionPlanReady = summary.exception_plan_blockers.length === 0;
  const legacyReason = exceptionPlanReady
    ? "Current NAS is a legacy latest-tag deployment; workflow and compose hardening mean the new target can be immutable while latest remains a review-only rollback reference."
    : "Current evidence is not sufficient to consider a legacy latest rollback exception.";
  const plan = {
    pre_push_proof: [
      "Archive the current NAS image proof, worker env proof, disk proof, live-readonly report, and this legacy rollback plan.",
      "Record that the current production Admin stack is legacy latest and that no immutable rollback tag exists.",
      "Do not edit NAS .env, pull images, restart containers, enable workers, or run preprocess during this proof step."
    ],
    push_candidate: [
      `After explicit approval only, run the Admin Docker workflow with push_images=true for immutable candidate ${targetTag || "<target-sha>"}.`,
      "Do not pass latest as the target image tag; the candidate images must be published with the Git SHA tag only.",
      "Recollect GitHub run artifact/readiness after the push workflow completes."
    ],
    stage_candidate: [
      `Set MIXLAB_IMAGE_TAG=${targetTag || "<target-sha>"} only in the NAS staging .env copy.`,
      "Keep MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0 and MIXLAB_ENABLE_READY_PUBLISH_WORKER=0 for initial staging.",
      "Run the normal staging runbook only after release inputs, disk proof, and explicit approval gates are satisfied."
    ],
    rollback: [
      "Rollback exception candidate: restore the prior staging .env value MIXLAB_IMAGE_TAG=latest only if the release owner accepted this one-time legacy rollback path.",
      "After rollback, rerun live-readonly and Cutter compatibility proof before declaring service restored.",
      "Do not use latest as a continuing steady-state tag after Docker staging; replace it with immutable current/rollback tags in the next release cycle."
    ],
    post_stage_acceptance: [
      "Rerun GET-only live-readonly and version/API parity against the staged Admin target.",
      "Collect accepted admin-worker env proof with standalone workers disabled and /data/PublicLibrary roots.",
      "Run Windows Cutter staged-candidate compatibility proof, including windows_acceptance and real_cut_smoke.",
      "Verify ready count remains 10471 and current index remains v010471 before any final acceptance."
    ]
  };

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-legacy-rollback-plan",
    sources: {
      nas_image_proof_report: input.nas_image_proof_report_path,
      github_artifact_readiness_report: input.github_artifact_readiness_report_path,
      workflow_file: input.workflow_file_path,
      compose_file: input.compose_file_path
    },
    exception_plan_ready: exceptionPlanReady,
    release_execution_allowed: false,
    docker_deploy_allowed: false,
    observations: {
      current_image_tag: currentTag,
      current_image_proof_status: resultStatus(proof),
      current_image_proof_blockers: proofBlockers,
      current_services: services,
      target_image_tag: targetTag,
      github_candidate_ready: githubReady,
      workflow_pushes_latest: pushesLatest,
      workflow_pushes_sha_tag: pushesShaTag,
      compose_requires_explicit_image_tag: composeExplicit,
      compose_defaults_latest: composeLatest,
      legacy_exception_reason: legacyReason
    },
    plan,
    gates,
    summary,
    result: {
      status: exceptionPlanReady ? "ready-for-release-decision" : "blocked",
      summary: exceptionPlanReady
        ? "A one-time legacy latest rollback exception is reviewable, but push/deploy still require explicit release approval and the normal staging gates."
        : "Legacy latest rollback exception planning is blocked by missing or unsafe evidence."
    },
    artifacts: null
  };
}

export function toMarkdown(report: AdminDockerLegacyRollbackPlanReport): string {
  return [
    "# Admin Docker Legacy Rollback Plan",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Result: ${report.result.status}`,
    `Exception plan ready: ${report.exception_plan_ready ? "yes" : "no"}`,
    "Release execution allowed: no",
    "Docker deploy allowed: no",
    "",
    "## Observations",
    "",
    `- Current image tag: ${report.observations.current_image_tag || "<missing>"}`,
    `- Target image tag: ${report.observations.target_image_tag || "<missing>"}`,
    `- Current proof blockers: ${report.observations.current_image_proof_blockers.join(", ") || "none"}`,
    `- Workflow pushes latest: ${report.observations.workflow_pushes_latest ? "yes" : "no"}`,
    `- Compose defaults latest: ${report.observations.compose_defaults_latest ? "yes" : "no"}`,
    `- Reason: ${report.observations.legacy_exception_reason}`,
    "",
    "## Gates",
    "",
    "| Gate | Status | Blocks Exception Plan | Blocks Release Decision | Evidence |",
    "| --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => `| ${item.id} | ${item.status} | ${item.blocks_exception_plan ? "yes" : "no"} | ${item.blocks_release_decision ? "yes" : "no"} | ${item.evidence.replace(/\|/g, "/")} |`),
    "",
    "## Plan",
    "",
    "### Pre-Push Proof",
    ...commandList(report.plan.pre_push_proof),
    "",
    "### Push Candidate",
    ...commandList(report.plan.push_candidate),
    "",
    "### Stage Candidate",
    ...commandList(report.plan.stage_candidate),
    "",
    "### Rollback",
    ...commandList(report.plan.rollback),
    "",
    "### Post-Stage Acceptance",
    ...commandList(report.plan.post_stage_acceptance),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "<not written>"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "<not written>"}`,
    ""
  ].join("\n");
}

export async function runAdminDockerLegacyRollbackPlan(input: {
  nas_image_proof_report_path?: string;
  github_artifact_readiness_report_path?: string;
  workflow_file_path?: string;
  compose_file_path?: string;
  output_dir?: string;
  artifact_dir?: string;
  generated_at?: string;
  command?: string;
} = {}): Promise<AdminDockerLegacyRollbackPlanReport> {
  const artifactDir = input.artifact_dir ?? DEFAULT_ARTIFACT_DIR;
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const stamp = timestampForFile(new Date(generatedAt));
  const imageProofPath = input.nas_image_proof_report_path ??
    await latestArtifact(artifactDir, "admin-docker-nas-image-proof-");
  const githubPath = input.github_artifact_readiness_report_path ??
    await latestArtifact(artifactDir, "admin-docker-github-artifact-readiness-");
  const workflowPath = input.workflow_file_path ?? DEFAULT_WORKFLOW_PATH;
  const composePath = input.compose_file_path ?? DEFAULT_COMPOSE_PATH;

  const report = buildAdminDockerLegacyRollbackPlanReport({
    generated_at: generatedAt,
    command: input.command ?? "npx tsx scripts/acceptance/admin-docker-legacy-rollback-plan.ts",
    nas_image_proof_report_path: imageProofPath,
    nas_image_proof_report: await loadJson(imageProofPath),
    github_artifact_readiness_report_path: githubPath,
    github_artifact_readiness_report: await loadJson(githubPath),
    workflow_file_path: workflowPath,
    workflow_file_raw: await readFile(workflowPath, "utf8"),
    compose_file_path: composePath,
    compose_file_raw: await readFile(composePath, "utf8")
  });
  const jsonPath = path.join(outputDir, `admin-docker-legacy-rollback-plan-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-legacy-rollback-plan-${stamp}.md`);
  report.artifacts = {
    json_path: jsonPath,
    markdown_path: markdownPath
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, toMarkdown(report));

  return report;
}

async function main(): Promise<void> {
  const report = await runAdminDockerLegacyRollbackPlan({
    nas_image_proof_report_path: process.env.MIXLAB_ADMIN_DOCKER_NAS_IMAGE_PROOF_REPORT,
    github_artifact_readiness_report_path: process.env.MIXLAB_DOCKER_GITHUB_ARTIFACT_READINESS_REPORT,
    workflow_file_path: process.env.MIXLAB_ADMIN_DOCKER_WORKFLOW_FILE,
    compose_file_path: process.env.MIXLAB_ADMIN_DOCKER_COMPOSE_FILE,
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    artifact_dir: process.env.MIXLAB_ACCEPTANCE_ARTIFACT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    exception_plan_ready: report.exception_plan_ready,
    release_execution_allowed: report.release_execution_allowed,
    docker_deploy_allowed: report.docker_deploy_allowed,
    current_image_tag: report.observations.current_image_tag,
    target_image_tag: report.observations.target_image_tag,
    blockers: report.summary.exception_plan_blockers,
    release_decision_blockers: report.summary.release_decision_blockers,
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
