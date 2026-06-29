import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_ARTIFACT_DIR = "docs/acceptance/artifacts";

type RunbookGateStatus = "pass" | "blocked";
type RunbookGateCategory = "safety" | "input" | "evidence" | "runtime-risk" | "rollback";

interface RunbookGate {
  id: string;
  title: string;
  category: RunbookGateCategory;
  status: RunbookGateStatus;
  evidence: string;
  blocks_staging_execution: boolean;
  blocks_staging: boolean;
  required_evidence?: string;
}

interface RunbookSummary {
  total: number;
  passed: number;
  blocked: number;
  staging_execution_blockers: string[];
  staging_blockers: string[];
}

interface ImageTags {
  current: string;
  target: string;
  rollback: string;
}

interface PushApproval {
  value: string;
  accepted: boolean;
}

interface BuildIdentity {
  image_tag: string;
  build_sha: string;
  build_version: string;
  mvp_mode: string;
}

interface RunbookSources {
  local_docker_smoke_report: string;
  github_artifact_readiness_report: string;
  parity_plan_report: string;
  candidate_contract_proof_report: string;
  worker_env_proof_report: string;
  cutter_compatibility_proof_report: string;
  release_inputs_report: string;
  nas_disk_proof_report: string;
}

export interface AdminDockerStagingRunbookReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-staging-runbook";
  sources: RunbookSources;
  image_tags: ImageTags;
  image_push_approval: PushApproval;
  staging_execution_ready: boolean;
  staging_review_ready: boolean;
  docker_deploy_allowed: false;
  observations: {
    local_smoke_status: string;
    local_smoke_passed: boolean | null;
    local_smoke_blockers: string[];
    local_smoke_build_identity: BuildIdentity;
    github_artifact_status: string;
    github_candidate_artifact_ready: boolean | null;
    github_candidate_contract_ready: boolean | null;
    github_staging_handoff_ready: boolean | null;
    github_candidate_image_tag: string;
    github_candidate_build_sha: string;
    target_tag_matches_local_smoke: boolean;
    target_tag_matches_github_candidate: boolean;
    target_tag_matches_smoked_image: boolean;
    parity_status: string;
    docker_image_update_required: boolean | null;
    parity_upload_blockers: string[];
    staging_execution_parity_blockers: string[];
    unresolved_parity_upload_blockers: string[];
    resolved_external_parity_blockers: string[];
    candidate_contract_status: string;
    candidate_contract_ready: boolean | null;
    candidate_contract_blockers: string[];
    worker_env_status: string;
    worker_proof_accepted: boolean | null;
    worker_upload_blockers: string[];
    cutter_compatibility_status: string;
    cutter_proof_accepted: boolean | null;
    cutter_upload_blockers: string[];
    release_inputs_status: string;
    release_inputs_ready: boolean | null;
    release_inputs_current_image_tag: string;
    release_inputs_target_image_tag: string;
    release_inputs_rollback_image_tag: string;
    current_tag_matches_release_inputs: boolean;
    target_tag_matches_release_inputs: boolean;
    rollback_tag_matches_release_inputs: boolean;
    release_input_blockers: string[];
    release_input_handoff_staging_blockers: string[];
    nas_disk_proof_status: string;
    nas_disk_proof_accepted: boolean | null;
    nas_disk_proof_blockers: string[];
    cleared_pre_staging_execution_blockers: string[];
    carried_pre_staging_execution_blockers: string[];
  };
  runbook: {
    preflight: string[];
    stage_update: string[];
    post_update_validation: string[];
    rollback: string[];
  };
  gates: RunbookGate[];
  summary: RunbookSummary;
  result: {
    status: "ready-for-staging-review" | "blocked";
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

function summaryBlockers(report: unknown, key = "upload_blockers"): string[] {
  return asArray(asRecord(asRecord(report).summary)[key])
    .filter((item): item is string => typeof item === "string");
}

function resultStatus(report: unknown): string {
  return asString(asRecord(asRecord(report).result).status);
}

function buildIdentity(report: unknown): BuildIdentity {
  const identity = asRecord(asRecord(report).build_identity);

  return {
    image_tag: asString(identity.image_tag),
    build_sha: asString(identity.build_sha),
    build_version: asString(identity.build_version),
    mvp_mode: asString(identity.mvp_mode)
  };
}

function normalizeParityBlockers(input: {
  parity_blockers: string[];
  worker_accepted: boolean | null;
  cutter_accepted: boolean | null;
  nas_disk_proof_accepted: boolean | null;
}): { unresolved: string[]; resolved_external: string[] } {
  const resolvedExternal = new Set<string>();

  if (input.worker_accepted) {
    resolvedExternal.add("admin-worker-env-external-proof");
  }

  if (input.cutter_accepted) {
    resolvedExternal.add("cutter-compatibility-external-proof");
  }

  if (input.nas_disk_proof_accepted) {
    resolvedExternal.add("nas-disk-risk");
  }

  return {
    unresolved: input.parity_blockers.filter((item) => !resolvedExternal.has(item)),
    resolved_external: input.parity_blockers.filter((item) => resolvedExternal.has(item))
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

function optionalLatestArtifact(artifactDir: string, prefix: string): Promise<string> {
  return readdir(artifactDir).then((files) => {
    const candidates = files
      .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
      .sort();

    return candidates.length > 0 ? path.join(artifactDir, candidates[candidates.length - 1]) : "";
  }).catch(() => "");
}

async function loadJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function optionalLoadJson(filePath: string): Promise<unknown> {
  return filePath ? loadJson(filePath) : undefined;
}

function gate(input: RunbookGate): RunbookGate {
  return input;
}

function summarize(gates: RunbookGate[]): RunbookSummary {
  const stagingExecutionBlockers = gates
    .filter((item) => item.blocks_staging_execution && item.status !== "pass")
    .map((item) => item.id);
  const stagingBlockers = gates
    .filter((item) => item.blocks_staging && item.status !== "pass")
    .map((item) => item.id);

  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    staging_execution_blockers: stagingExecutionBlockers,
    staging_blockers: stagingBlockers
  };
}

function tagProvidedGate(id: string, title: string, value: string, envName: string): RunbookGate {
  return gate({
    id,
    title,
    category: "input",
    status: value ? "pass" : "blocked",
    evidence: value ? `${envName}=${value}` : `${envName} is not provided.`,
    blocks_staging_execution: !value,
    blocks_staging: !value,
    required_evidence: `Set ${envName} before producing a staging runbook.`
  });
}

function stagingExecutionParityBlockers(input: {
  parity_blockers: string[];
  docker_image_update_required: boolean | null;
}): string[] {
  const postUpdateProofBlockers = new Set([
    "current-admin-api-contract-parity",
    "version-health-parity-contract",
    "admin-worker-env-proof-contract",
    "cutter-compatibility-proof-contract",
    "admin-worker-env-external-proof",
    "cutter-compatibility-external-proof"
  ]);

  return input.parity_blockers.filter((item) => {
    if (input.docker_image_update_required === true && postUpdateProofBlockers.has(item)) {
      return false;
    }

    return true;
  });
}

function buildRunbook(tags: ImageTags): AdminDockerStagingRunbookReport["runbook"] {
  const targetTag = tags.target || "<target-tag>";
  const rollbackTag = tags.rollback || "<rollback-tag>";

  return {
    preflight: [
      "Confirm a current backup exists for admin-users, cutter-users, usage-events, current index, and .mixlab-library admin state.",
      "Confirm candidate API/version contract proof is accepted for the target image before staging.",
      "Confirm NAS disk gate is not blocked and RAID/storage warnings are resolved or explicitly accepted by the release gate.",
      "Confirm admin-worker env proof is accepted with standalone workers disabled.",
      "Confirm Windows Cutter compatibility smoke is ready to run after staging."
    ],
    stage_update: [
      `Set MIXLAB_IMAGE_TAG=${targetTag} in the NAS Docker .env staging copy.`,
      "Run docker compose pull for admin-web, admin-api, and admin-worker images.",
      "Run docker compose up -d admin-api admin-web admin-worker with standalone worker flags still disabled.",
      "Do not enable MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER or MIXLAB_ENABLE_READY_PUBLISH_WORKER during initial staging."
    ],
    post_update_validation: [
      "Run GET-only live-readonly probe against the staged Admin Web target.",
      "Run candidate contract proof against the staged Admin Web target and require candidate_contract_ready=true.",
      "Run Docker version/API parity plan and require current Admin API contract endpoints to pass.",
      "Run admin-worker env proof against exported staged container evidence.",
      "Run Cutter release/index/search compatibility smoke and archive the report.",
      "Keep Docker upload/release blocked if any gate reports blocked or needs external proof."
    ],
    rollback: [
      `Set MIXLAB_IMAGE_TAG=${rollbackTag} in the NAS Docker .env rollback copy.`,
      "Run docker compose up -d admin-api admin-web admin-worker using the rollback tag.",
      "Re-run GET-only live-readonly probe and Cutter compatibility smoke after rollback.",
      "Do not run scan/apply, recovery, publish, or worker-enable commands as part of rollback unless separately approved."
    ]
  };
}

export function buildAdminDockerStagingRunbookReport(input: {
  generated_at: string;
  command: string;
  local_docker_smoke_report_path: string;
  local_docker_smoke_report: unknown;
  github_artifact_readiness_report_path?: string;
  github_artifact_readiness_report?: unknown;
  parity_plan_report_path: string;
  parity_plan_report: unknown;
  candidate_contract_proof_report_path: string;
  candidate_contract_proof_report: unknown;
  worker_env_proof_report_path: string;
  worker_env_proof_report: unknown;
  cutter_compatibility_proof_report_path: string;
  cutter_compatibility_proof_report: unknown;
  release_inputs_report_path?: string;
  release_inputs_report?: unknown;
  nas_disk_proof_report_path?: string;
  nas_disk_proof_report?: unknown;
  current_image_tag?: string;
  target_image_tag?: string;
  rollback_image_tag?: string;
  image_push_approval?: string;
}): AdminDockerStagingRunbookReport {
  const current = input.current_image_tag?.trim() ?? "";
  const target = input.target_image_tag?.trim() ?? "";
  const rollback = input.rollback_image_tag?.trim() ?? "";
  const imagePushApproval = input.image_push_approval?.trim() ?? "";
  const imagePushApproved = imagePushApproval === "workflow_dispatch:push_images=true";
  const localSmokePassed = asBoolean(asRecord(input.local_docker_smoke_report).local_smoke_passed);
  const localSmokeBlockers = summaryBlockers(input.local_docker_smoke_report, "local_smoke_blockers");
  const localSmokeBuildIdentity = buildIdentity(input.local_docker_smoke_report);
  const githubArtifact = asRecord(input.github_artifact_readiness_report);
  const githubObservations = asRecord(githubArtifact.observations);
  const githubCandidateArtifactReady = asBoolean(githubArtifact.github_candidate_artifact_ready);
  const githubStagingHandoffReady = asBoolean(githubArtifact.staging_handoff_ready);
  const githubCandidateContractReady = asBoolean(githubObservations.candidate_contract_ready);
  const githubCandidateImageTag = asString(githubObservations.local_smoke_image_tag);
  const githubCandidateBuildSha = asString(githubObservations.local_smoke_build_sha);
  const candidateSmokeAccepted = localSmokePassed === true || githubCandidateArtifactReady === true;
  const acceptedSmokeTags = [
    localSmokePassed === true ? localSmokeBuildIdentity.image_tag : "",
    githubCandidateArtifactReady === true ? githubCandidateImageTag : ""
  ].filter(Boolean);
  const targetMatchesLocalSmoke = Boolean(
    target &&
    localSmokePassed === true &&
    localSmokeBuildIdentity.image_tag &&
    target === localSmokeBuildIdentity.image_tag
  );
  const targetMatchesGithubCandidate = Boolean(
    target &&
    githubCandidateArtifactReady === true &&
    githubCandidateImageTag &&
    target === githubCandidateImageTag
  );
  const targetMatchesSmokedImage = targetMatchesLocalSmoke || targetMatchesGithubCandidate;
  const parityDecision = asRecord(asRecord(input.parity_plan_report).decision);
  const parityResult = asRecord(input.parity_plan_report).result;
  const candidateResult = asRecord(input.candidate_contract_proof_report).result;
  const workerResult = asRecord(input.worker_env_proof_report).result;
  const cutterResult = asRecord(input.cutter_compatibility_proof_report).result;
  const releaseInputs = asRecord(input.release_inputs_report);
  const releaseInputsResult = asRecord(releaseInputs.result);
  const releaseInputsObservations = asRecord(releaseInputs.observations);
  const releaseInputsTags = asRecord(releaseInputs.inputs);
  const nasDiskProof = asRecord(input.nas_disk_proof_report);
  const nasDiskProofResult = asRecord(nasDiskProof.result);
  const parityBlockers = summaryBlockers(input.parity_plan_report);
  const candidateBlockers = summaryBlockers(input.candidate_contract_proof_report, "candidate_review_blockers");
  const workerBlockers = summaryBlockers(input.worker_env_proof_report);
  const cutterBlockers = summaryBlockers(input.cutter_compatibility_proof_report);
  const releaseInputBlockers = summaryBlockers(input.release_inputs_report, "release_input_blockers");
  const nasDiskProofBlockers = summaryBlockers(input.nas_disk_proof_report, "staging_execution_blockers");
  const candidateReady = asBoolean(asRecord(input.candidate_contract_proof_report).candidate_contract_ready);
  const candidateEvidenceAccepted = candidateReady === true || githubCandidateArtifactReady === true;
  const workerAccepted = asBoolean(asRecord(input.worker_env_proof_report).proof_accepted);
  const cutterAccepted = asBoolean(asRecord(input.cutter_compatibility_proof_report).proof_accepted);
  const releaseInputsReady = asBoolean(releaseInputs.release_inputs_ready);
  const releaseInputsCurrentTag = asString(releaseInputsTags.current_image_tag);
  const releaseInputsTargetTag = asString(releaseInputsTags.target_image_tag);
  const releaseInputsRollbackTag = asString(releaseInputsTags.rollback_image_tag);
  const currentTagMatchesReleaseInputs = Boolean(current && releaseInputsCurrentTag && current === releaseInputsCurrentTag);
  const targetTagMatchesReleaseInputs = Boolean(target && releaseInputsTargetTag && target === releaseInputsTargetTag);
  const rollbackTagMatchesReleaseInputs = Boolean(rollback && releaseInputsRollbackTag && rollback === releaseInputsRollbackTag);
  const nasDiskProofAccepted = asBoolean(nasDiskProof.proof_accepted);
  const releaseInputHandoffStagingBlockers = asArray(releaseInputsObservations.handoff_staging_execution_blockers)
    .filter((item): item is string => typeof item === "string");
  const clearedPreStagingExecutionBlockers = releaseInputHandoffStagingBlockers.filter((item) => (
    item === "nas-disk-risk-carried-forward" && nasDiskProofAccepted === true
  ));
  const carriedPreStagingExecutionBlockers = releaseInputHandoffStagingBlockers.filter((item) => (
    item === "nas-disk-risk-carried-forward" && nasDiskProofAccepted !== true
  ));
  const updateRequired = asBoolean(parityDecision.docker_image_update_required);
  const normalizedParity = normalizeParityBlockers({
    parity_blockers: parityBlockers,
    worker_accepted: workerAccepted,
    cutter_accepted: cutterAccepted,
    nas_disk_proof_accepted: nasDiskProofAccepted
  });
  const executionParityBlockers = stagingExecutionParityBlockers({
    parity_blockers: normalizedParity.unresolved,
    docker_image_update_required: updateRequired
  });
  const tags = { current, target, rollback };
  const targetDiffers = Boolean(current && target && current !== target);
  const rollbackMatchesCurrent = Boolean(current && rollback && current === rollback);
  const gates = [
    gate({
      id: "runbook-no-side-effects",
      title: "Runbook generation has no Docker or NAS side effects",
      category: "safety",
      status: "pass",
      evidence: "This report reads archived artifacts and env inputs only; it does not run Docker, push images, restart containers, or write NAS files.",
      blocks_staging_execution: false,
      blocks_staging: false
    }),
    tagProvidedGate("current-image-tag-provided", "Current image tag is explicit", current, "MIXLAB_DOCKER_CURRENT_IMAGE_TAG"),
    tagProvidedGate("target-image-tag-provided", "Target image tag is explicit", target, "MIXLAB_DOCKER_TARGET_IMAGE_TAG"),
    tagProvidedGate("rollback-image-tag-provided", "Rollback image tag is explicit", rollback, "MIXLAB_DOCKER_ROLLBACK_IMAGE_TAG"),
    gate({
      id: "target-differs-from-current",
      title: "Target tag differs from current tag",
      category: "input",
      status: targetDiffers ? "pass" : "blocked",
      evidence: `current=${current || "missing"}, target=${target || "missing"}`,
      blocks_staging_execution: !targetDiffers,
      blocks_staging: !targetDiffers,
      required_evidence: "Target tag must differ from current tag so the staging action is explicit."
    }),
    gate({
      id: "rollback-tag-matches-current",
      title: "Rollback tag matches current deployed tag",
      category: "rollback",
      status: rollbackMatchesCurrent ? "pass" : "blocked",
      evidence: `current=${current || "missing"}, rollback=${rollback || "missing"}`,
      blocks_staging_execution: !rollbackMatchesCurrent,
      blocks_staging: !rollbackMatchesCurrent,
      required_evidence: "Rollback tag must match the current deployed tag before staging."
    }),
    gate({
      id: "image-push-explicitly-approved",
      title: "Target images were pushed by explicit release approval",
      category: "input",
      status: imagePushApproved ? "pass" : "blocked",
      evidence: imagePushApproval
        ? `MIXLAB_DOCKER_PUSH_APPROVAL=${imagePushApproval}`
        : "MIXLAB_DOCKER_PUSH_APPROVAL is not provided.",
      blocks_staging_execution: !imagePushApproved,
      blocks_staging: !imagePushApproved,
      required_evidence: "Set MIXLAB_DOCKER_PUSH_APPROVAL=workflow_dispatch:push_images=true only after the GitHub Admin Docker workflow was manually dispatched with push_images=true and its smoke gate passed."
    }),
    gate({
      id: "local-docker-smoke-passed",
      title: "Target build passed Docker smoke locally or in GitHub",
      category: "evidence",
      status: candidateSmokeAccepted ? "pass" : "blocked",
      evidence: candidateSmokeAccepted
        ? `local_smoke_passed=${String(localSmokePassed)}, github_candidate_artifact_ready=${String(githubCandidateArtifactReady)}, image_tags=${acceptedSmokeTags.join(", ") || "missing"}`
        : `local smoke blockers: ${localSmokeBlockers.join(", ") || "unknown"}; github_candidate_artifact_ready=${String(githubCandidateArtifactReady)}`,
      blocks_staging_execution: !candidateSmokeAccepted,
      blocks_staging: !candidateSmokeAccepted,
      required_evidence: "Run validate:admin-docker-local-smoke on a Docker-capable machine, or archive an Admin Docker GitHub artifact readiness report with github_candidate_artifact_ready=true before staging."
    }),
    gate({
      id: "target-tag-matches-smoked-image",
      title: "Target image tag matches the smoked build",
      category: "input",
      status: targetMatchesSmokedImage ? "pass" : "blocked",
      evidence: `target=${target || "missing"}, smoked_image_tags=${acceptedSmokeTags.join(", ") || "missing"}`,
      blocks_staging_execution: !targetMatchesSmokedImage,
      blocks_staging: !targetMatchesSmokedImage,
      required_evidence: "Set MIXLAB_DOCKER_TARGET_IMAGE_TAG to the exact image tag from the accepted local smoke or GitHub candidate artifact."
    }),
    gate({
      id: "parity-report-present",
      title: "Docker parity report is present",
      category: "evidence",
      status: input.parity_plan_report_path ? "pass" : "blocked",
      evidence: input.parity_plan_report_path || "No parity report path provided.",
      blocks_staging_execution: !input.parity_plan_report_path,
      blocks_staging: !input.parity_plan_report_path,
      required_evidence: "Provide the Docker version/API parity plan artifact."
    }),
    ...(input.release_inputs_report_path ? [
      gate({
        id: "release-inputs-ready-for-decision",
        title: "Release inputs package is ready for a separate release decision",
        category: "evidence",
        status: releaseInputsReady ? "pass" : "blocked",
        evidence: releaseInputsReady
          ? "release_inputs_ready=true"
          : `release input blockers: ${releaseInputBlockers.join(", ") || "unknown"}`,
        blocks_staging_execution: !releaseInputsReady,
        blocks_staging: !releaseInputsReady,
        required_evidence: "Provide an accepted admin-docker-release-inputs report before using it to constrain staging."
      }),
      gate({
        id: "current-tag-matches-release-inputs",
        title: "Current image tag matches release inputs",
        category: "input",
        status: currentTagMatchesReleaseInputs ? "pass" : "blocked",
        evidence: `runbook current=${current || "missing"}, release_inputs current=${releaseInputsCurrentTag || "missing"}`,
        blocks_staging_execution: !currentTagMatchesReleaseInputs,
        blocks_staging: !currentTagMatchesReleaseInputs,
        required_evidence: "Set MIXLAB_DOCKER_CURRENT_IMAGE_TAG from the accepted admin-docker-release-inputs report."
      }),
      gate({
        id: "target-tag-matches-release-inputs",
        title: "Target image tag matches release inputs",
        category: "input",
        status: targetTagMatchesReleaseInputs ? "pass" : "blocked",
        evidence: `runbook target=${target || "missing"}, release_inputs target=${releaseInputsTargetTag || "missing"}`,
        blocks_staging_execution: !targetTagMatchesReleaseInputs,
        blocks_staging: !targetTagMatchesReleaseInputs,
        required_evidence: "Set MIXLAB_DOCKER_TARGET_IMAGE_TAG from the accepted admin-docker-release-inputs report."
      }),
      gate({
        id: "rollback-tag-matches-release-inputs",
        title: "Rollback image tag matches release inputs",
        category: "rollback",
        status: rollbackTagMatchesReleaseInputs ? "pass" : "blocked",
        evidence: `runbook rollback=${rollback || "missing"}, release_inputs rollback=${releaseInputsRollbackTag || "missing"}`,
        blocks_staging_execution: !rollbackTagMatchesReleaseInputs,
        blocks_staging: !rollbackTagMatchesReleaseInputs,
        required_evidence: "Set MIXLAB_DOCKER_ROLLBACK_IMAGE_TAG from the accepted admin-docker-release-inputs report."
      }),
      gate({
        id: "nas-disk-proof-accepted",
        title: "NAS disk risk is cleared by explicit disk proof",
        category: "runtime-risk",
        status: releaseInputHandoffStagingBlockers.includes("nas-disk-risk-carried-forward")
          ? nasDiskProofAccepted ? "pass" : "blocked"
          : "pass",
        evidence: releaseInputHandoffStagingBlockers.includes("nas-disk-risk-carried-forward")
          ? nasDiskProofAccepted
            ? `disk proof accepted: ${input.nas_disk_proof_report_path || "inline"}`
            : `disk proof status=${asString(nasDiskProofResult.status) || "missing"}, blockers=${nasDiskProofBlockers.join(", ") || "none"}`
          : "release inputs did not carry nas-disk-risk-carried-forward",
        blocks_staging_execution: releaseInputHandoffStagingBlockers.includes("nas-disk-risk-carried-forward") && !nasDiskProofAccepted,
        blocks_staging: releaseInputHandoffStagingBlockers.includes("nas-disk-risk-carried-forward") && !nasDiskProofAccepted,
        required_evidence: "Run validate:admin-docker-nas-disk-proof with sanitized NAS df evidence and require proof_accepted:true."
      }),
      gate({
        id: "pre-staging-execution-blockers-carried-forward",
        title: "Pre-staging execution blockers carried by release inputs are clear",
        category: "runtime-risk",
        status: carriedPreStagingExecutionBlockers.length === 0 ? "pass" : "blocked",
        evidence: carriedPreStagingExecutionBlockers.length === 0
          ? `handoff_staging_blockers=${releaseInputHandoffStagingBlockers.join(", ") || "none"}`
          : `carried pre-staging execution blockers=${carriedPreStagingExecutionBlockers.join(", ")}`,
        blocks_staging_execution: carriedPreStagingExecutionBlockers.length > 0,
        blocks_staging: carriedPreStagingExecutionBlockers.length > 0,
        required_evidence: "Clear or explicitly re-prove NAS disk safety before staging execution."
      })
    ] : []),
    gate({
      id: "parity-report-staging-execution-safe",
      title: "Docker parity blockers do not prevent staging execution",
      category: "runtime-risk",
      status: executionParityBlockers.length === 0 ? "pass" : "blocked",
      evidence: executionParityBlockers.length === 0
        ? `Only post-update parity proof remains before final review: ${normalizedParity.unresolved.join(", ") || "none"}.`
        : `Pre-update parity blockers still prevent staging execution: ${executionParityBlockers.join(", ")}.`,
      blocks_staging_execution: executionParityBlockers.length > 0,
      blocks_staging: false,
      required_evidence: "Before staging execution, live target/proxy/root/disk blockers must be clear. Current API and proof-contract blockers may remain only when docker_image_update_required=true because staging is the update that should resolve them."
    }),
    gate({
      id: "parity-report-blockers-clear",
      title: "Docker parity blockers are clear",
      category: "evidence",
      status: normalizedParity.unresolved.length === 0 ? "pass" : "blocked",
      evidence: normalizedParity.unresolved.length === 0
        ? `No unresolved parity upload blockers after external proof normalization. Resolved external blockers: ${normalizedParity.resolved_external.join(", ") || "none"}`
        : `Unresolved parity blockers: ${normalizedParity.unresolved.join(", ")}; resolved external blockers: ${normalizedParity.resolved_external.join(", ") || "none"}`,
      blocks_staging_execution: false,
      blocks_staging: normalizedParity.unresolved.length > 0,
      required_evidence: "Resolve current API contract parity and disk blockers, and provide accepted worker/Cutter external proof for their external-proof blockers."
    }),
    gate({
      id: "candidate-contract-proof-accepted",
      title: "Candidate API/version contract proof is accepted",
      category: "evidence",
      status: candidateEvidenceAccepted ? "pass" : "blocked",
      evidence: candidateEvidenceAccepted
        ? `candidate_contract_ready=${String(candidateReady)}, github_candidate_artifact_ready=${String(githubCandidateArtifactReady)}, github_candidate_contract_ready=${String(githubCandidateContractReady)}`
        : `candidate proof status=${asString(candidateResult.status) || "unknown"}, blockers=${candidateBlockers.join(", ") || "none"}; github_candidate_artifact_ready=${String(githubCandidateArtifactReady)}`,
      blocks_staging_execution: !candidateEvidenceAccepted,
      blocks_staging: !candidateEvidenceAccepted,
      required_evidence: "Run validate:admin-docker-candidate-contract-proof against the local or staged candidate, or archive an Admin Docker GitHub artifact readiness report with github_candidate_artifact_ready=true."
    }),
    gate({
      id: "worker-env-proof-accepted",
      title: "admin-worker env proof is accepted",
      category: "evidence",
      status: workerAccepted ? "pass" : "blocked",
      evidence: `worker proof status=${asString(workerResult.status) || "unknown"}, blockers=${workerBlockers.join(", ") || "none"}`,
      blocks_staging_execution: false,
      blocks_staging: !workerAccepted,
      required_evidence: "Run validate:admin-worker-env-proof with exported NAS evidence after staging and require proof_accepted:true before final MVP acceptance."
    }),
    gate({
      id: "cutter-compatibility-proof-accepted",
      title: "Cutter compatibility proof is accepted",
      category: "evidence",
      status: cutterAccepted ? "pass" : "blocked",
      evidence: `cutter proof status=${asString(cutterResult.status) || "unknown"}, blockers=${cutterBlockers.join(", ") || "none"}`,
      blocks_staging_execution: false,
      blocks_staging: !cutterAccepted,
      required_evidence: "Run validate:admin-cutter-compatibility-proof with staged-candidate Windows reports and require proof_accepted:true before final MVP acceptance."
    }),
    gate({
      id: "current-api-update-needed-is-known",
      title: "API/image update need is explicit",
      category: "runtime-risk",
      status: updateRequired === true || updateRequired === false ? "pass" : "blocked",
      evidence: updateRequired === null ? "docker_image_update_required is unknown." : `docker_image_update_required=${updateRequired}`,
      blocks_staging_execution: updateRequired === null,
      blocks_staging: updateRequired === null,
      required_evidence: "Run Docker version/API parity plan before staging."
    }),
    gate({
      id: "parity-result-remains-nondeploy",
      title: "Parity result does not approve deploy by itself",
      category: "safety",
      status: asString(parityResult.status) === "blocked" ? "pass" : "blocked",
      evidence: `parity_result=${asString(parityResult.status) || "unknown"}`,
      blocks_staging_execution: asString(parityResult.status) !== "blocked",
      blocks_staging: asString(parityResult.status) !== "blocked",
      required_evidence: "The parity plan should remain a non-deploy gate; actual staging needs a separate release decision."
    })
  ];
  const summary = summarize(gates);
  const stagingExecutionReady = summary.staging_execution_blockers.length === 0;
  const stagingReviewReady = summary.staging_blockers.length === 0;

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-staging-runbook",
    sources: {
      local_docker_smoke_report: input.local_docker_smoke_report_path,
      github_artifact_readiness_report: input.github_artifact_readiness_report_path ?? "",
      parity_plan_report: input.parity_plan_report_path,
      candidate_contract_proof_report: input.candidate_contract_proof_report_path,
      worker_env_proof_report: input.worker_env_proof_report_path,
      cutter_compatibility_proof_report: input.cutter_compatibility_proof_report_path,
      release_inputs_report: input.release_inputs_report_path ?? "",
      nas_disk_proof_report: input.nas_disk_proof_report_path ?? ""
    },
    image_tags: tags,
    image_push_approval: {
      value: imagePushApproval,
      accepted: imagePushApproved
    },
    staging_execution_ready: stagingExecutionReady,
    staging_review_ready: stagingReviewReady,
    docker_deploy_allowed: false,
    observations: {
      local_smoke_status: resultStatus(input.local_docker_smoke_report),
      local_smoke_passed: localSmokePassed,
      local_smoke_blockers: localSmokeBlockers,
      local_smoke_build_identity: localSmokeBuildIdentity,
      github_artifact_status: resultStatus(input.github_artifact_readiness_report),
      github_candidate_artifact_ready: githubCandidateArtifactReady,
      github_candidate_contract_ready: githubCandidateContractReady,
      github_staging_handoff_ready: githubStagingHandoffReady,
      github_candidate_image_tag: githubCandidateImageTag,
      github_candidate_build_sha: githubCandidateBuildSha,
      target_tag_matches_local_smoke: targetMatchesLocalSmoke,
      target_tag_matches_github_candidate: targetMatchesGithubCandidate,
      target_tag_matches_smoked_image: targetMatchesSmokedImage,
      parity_status: asString(parityResult.status),
      docker_image_update_required: updateRequired,
      parity_upload_blockers: parityBlockers,
      staging_execution_parity_blockers: executionParityBlockers,
      unresolved_parity_upload_blockers: normalizedParity.unresolved,
      resolved_external_parity_blockers: normalizedParity.resolved_external,
      candidate_contract_status: asString(candidateResult.status),
      candidate_contract_ready: candidateReady,
      candidate_contract_blockers: candidateBlockers,
      worker_env_status: asString(workerResult.status),
      worker_proof_accepted: workerAccepted,
      worker_upload_blockers: workerBlockers,
      cutter_compatibility_status: asString(cutterResult.status),
      cutter_proof_accepted: cutterAccepted,
      cutter_upload_blockers: cutterBlockers,
      release_inputs_status: asString(releaseInputsResult.status),
      release_inputs_ready: releaseInputsReady,
      release_inputs_current_image_tag: releaseInputsCurrentTag,
      release_inputs_target_image_tag: releaseInputsTargetTag,
      release_inputs_rollback_image_tag: releaseInputsRollbackTag,
      current_tag_matches_release_inputs: currentTagMatchesReleaseInputs,
      target_tag_matches_release_inputs: targetTagMatchesReleaseInputs,
      rollback_tag_matches_release_inputs: rollbackTagMatchesReleaseInputs,
      release_input_blockers: releaseInputBlockers,
      release_input_handoff_staging_blockers: releaseInputHandoffStagingBlockers,
      nas_disk_proof_status: asString(nasDiskProofResult.status),
      nas_disk_proof_accepted: nasDiskProofAccepted,
      nas_disk_proof_blockers: nasDiskProofBlockers,
      cleared_pre_staging_execution_blockers: clearedPreStagingExecutionBlockers,
      carried_pre_staging_execution_blockers: carriedPreStagingExecutionBlockers
    },
    runbook: buildRunbook(tags),
    gates,
    summary,
    result: {
      status: stagingReviewReady ? "ready-for-staging-review" : "blocked",
      summary: stagingReviewReady
        ? "Runbook is ready for a separate human release decision; this report still does not deploy Docker."
        : stagingExecutionReady
          ? "Staging execution inputs are ready, but final MVP acceptance remains blocked until post-staging worker, live, parity, and Cutter proofs pass."
          : "Runbook is blocked until explicit tags and staging execution gates are satisfied."
    },
    artifacts: null
  };
}

export function toMarkdown(report: AdminDockerStagingRunbookReport): string {
  const commandList = (items: string[]) => items.map((item) => `- ${item}`);
  const lines = [
    "# Admin Docker Staging/Update Runbook",
    "",
    `Generated: ${report.generated_at}`,
    "",
    `Mode: ${report.mode}`,
    "",
    `Result: ${report.result.status}`,
    "",
    `Staging execution ready: ${report.staging_execution_ready ? "yes" : "no"}`,
    "",
    `Staging review ready: ${report.staging_review_ready ? "yes" : "no"}`,
    "",
    `Docker deploy allowed: ${report.docker_deploy_allowed ? "yes" : "no"}`,
    "",
    "This report does not run Docker, push images, restart containers, write NAS files, enable workers, repair usage-events, recover jobs, publish indexes, or change Cutter protocols.",
    "",
    "## Sources",
    "",
    `- Local Docker smoke: ${report.sources.local_docker_smoke_report || "not provided"}`,
    `- GitHub artifact readiness: ${report.sources.github_artifact_readiness_report || "not provided"}`,
    `- Parity plan: ${report.sources.parity_plan_report || "not provided"}`,
    `- Candidate contract proof: ${report.sources.candidate_contract_proof_report || "not provided"}`,
    `- Worker env proof: ${report.sources.worker_env_proof_report || "not provided"}`,
    `- Cutter compatibility proof: ${report.sources.cutter_compatibility_proof_report || "not provided"}`,
    `- Release inputs: ${report.sources.release_inputs_report || "not provided"}`,
    `- NAS disk proof: ${report.sources.nas_disk_proof_report || "not provided"}`,
    "",
    "## Image Tags",
    "",
    `- Current: ${report.image_tags.current || "missing"}`,
    `- Target: ${report.image_tags.target || "missing"}`,
    `- Rollback: ${report.image_tags.rollback || "missing"}`,
    `- Image push approval: ${report.image_push_approval.accepted ? "accepted" : "missing/blocked"} (${report.image_push_approval.value || "missing"})`,
    "",
    "## Observations",
    "",
    `- Local smoke status: ${report.observations.local_smoke_status || "unknown"}`,
    `- Local smoke passed: ${report.observations.local_smoke_passed ?? "unknown"}`,
    `- Local smoke blockers: ${report.observations.local_smoke_blockers.join(", ") || "none"}`,
    `- Smoked image tag: ${report.observations.local_smoke_build_identity.image_tag || "missing"}`,
    `- GitHub candidate artifact ready: ${report.observations.github_candidate_artifact_ready ?? "unknown"}`,
    `- GitHub candidate contract ready: ${report.observations.github_candidate_contract_ready ?? "unknown"}`,
    `- GitHub staging handoff ready: ${report.observations.github_staging_handoff_ready ?? "unknown"}`,
    `- GitHub candidate image tag: ${report.observations.github_candidate_image_tag || "missing"}`,
    `- GitHub candidate build sha: ${report.observations.github_candidate_build_sha || "missing"}`,
    `- Target tag matches smoked image: ${report.observations.target_tag_matches_smoked_image ? "yes" : "no"}`,
    `- Parity status: ${report.observations.parity_status || "unknown"}`,
    `- Docker image update required: ${report.observations.docker_image_update_required ?? "unknown"}`,
    `- Parity blockers: ${report.observations.parity_upload_blockers.join(", ") || "none"}`,
    `- Staging execution parity blockers: ${report.observations.staging_execution_parity_blockers.join(", ") || "none"}`,
    `- Unresolved parity blockers: ${report.observations.unresolved_parity_upload_blockers.join(", ") || "none"}`,
    `- Resolved external parity blockers: ${report.observations.resolved_external_parity_blockers.join(", ") || "none"}`,
    `- Candidate contract status: ${report.observations.candidate_contract_status || "unknown"}`,
    `- Candidate contract ready: ${report.observations.candidate_contract_ready ?? "unknown"}`,
    `- Candidate contract blockers: ${report.observations.candidate_contract_blockers.join(", ") || "none"}`,
    `- Worker env status: ${report.observations.worker_env_status || "unknown"}`,
    `- Worker proof accepted: ${report.observations.worker_proof_accepted ?? "unknown"}`,
    `- Worker blockers: ${report.observations.worker_upload_blockers.join(", ") || "none"}`,
    `- Cutter compatibility status: ${report.observations.cutter_compatibility_status || "unknown"}`,
    `- Cutter proof accepted: ${report.observations.cutter_proof_accepted ?? "unknown"}`,
    `- Cutter blockers: ${report.observations.cutter_upload_blockers.join(", ") || "none"}`,
    `- Release inputs status: ${report.observations.release_inputs_status || "not provided"}`,
    `- Release inputs ready: ${report.observations.release_inputs_ready ?? "unknown"}`,
    `- Release inputs current tag: ${report.observations.release_inputs_current_image_tag || "missing"}`,
    `- Release inputs target tag: ${report.observations.release_inputs_target_image_tag || "missing"}`,
    `- Release inputs rollback tag: ${report.observations.release_inputs_rollback_image_tag || "missing"}`,
    `- Current tag matches release inputs: ${report.observations.current_tag_matches_release_inputs ? "yes" : "no"}`,
    `- Target tag matches release inputs: ${report.observations.target_tag_matches_release_inputs ? "yes" : "no"}`,
    `- Rollback tag matches release inputs: ${report.observations.rollback_tag_matches_release_inputs ? "yes" : "no"}`,
    `- Release input blockers: ${report.observations.release_input_blockers.join(", ") || "none"}`,
    `- Release input handoff staging blockers: ${report.observations.release_input_handoff_staging_blockers.join(", ") || "none"}`,
    `- NAS disk proof status: ${report.observations.nas_disk_proof_status || "not provided"}`,
    `- NAS disk proof accepted: ${report.observations.nas_disk_proof_accepted ?? "unknown"}`,
    `- NAS disk proof blockers: ${report.observations.nas_disk_proof_blockers.join(", ") || "none"}`,
    `- Cleared pre-staging execution blockers: ${report.observations.cleared_pre_staging_execution_blockers.join(", ") || "none"}`,
    `- Carried pre-staging execution blockers: ${report.observations.carried_pre_staging_execution_blockers.join(", ") || "none"}`,
    "",
    "## Preflight",
    "",
    ...commandList(report.runbook.preflight),
    "",
    "## Stage Update",
    "",
    ...commandList(report.runbook.stage_update),
    "",
    "## Post Update Validation",
    "",
    ...commandList(report.runbook.post_update_validation),
    "",
    "## Rollback",
    "",
    ...commandList(report.runbook.rollback),
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Staging Execution | Blocks Final Review | Evidence | Required Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => [
      item.id,
      item.category,
      item.status,
      item.blocks_staging_execution ? "yes" : "no",
      item.blocks_staging ? "yes" : "no",
      item.evidence,
      item.required_evidence ?? "n/a"
    ].join(" | ")),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "not written"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "not written"}`,
    ""
  ];

  return `${lines.join("\n")}\n`;
}

export async function runAdminDockerStagingRunbook(input: {
  local_docker_smoke_report_path?: string;
  github_artifact_readiness_report_path?: string;
  parity_plan_report_path?: string;
  candidate_contract_proof_report_path?: string;
  worker_env_proof_report_path?: string;
  cutter_compatibility_proof_report_path?: string;
  release_inputs_report_path?: string;
  nas_disk_proof_report_path?: string;
  current_image_tag?: string;
  target_image_tag?: string;
  rollback_image_tag?: string;
  image_push_approval?: string;
  output_dir?: string;
  artifact_dir?: string;
  generated_at?: string;
  command?: string;
}): Promise<AdminDockerStagingRunbookReport> {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const artifactDir = input.artifact_dir ?? DEFAULT_ARTIFACT_DIR;
  const localSmokePath = input.local_docker_smoke_report_path
    ?? await latestArtifact(artifactDir, "admin-docker-local-smoke-");
  const githubArtifactReadinessPath = input.github_artifact_readiness_report_path
    ?? await optionalLatestArtifact(artifactDir, "admin-docker-github-artifact-readiness-");
  const parityPath = input.parity_plan_report_path
    ?? await latestArtifact(artifactDir, "admin-docker-version-parity-plan-");
  const candidatePath = input.candidate_contract_proof_report_path
    ?? await latestArtifact(artifactDir, "admin-docker-candidate-contract-proof-");
  const workerPath = input.worker_env_proof_report_path
    ?? await latestArtifact(artifactDir, "admin-worker-env-proof-");
  const cutterPath = input.cutter_compatibility_proof_report_path
    ?? await latestArtifact(artifactDir, "admin-cutter-compatibility-proof-");
  const releaseInputsPath = input.release_inputs_report_path
    ?? await optionalLatestArtifact(artifactDir, "admin-docker-release-inputs-");
  const nasDiskProofPath = input.nas_disk_proof_report_path
    ?? await optionalLatestArtifact(artifactDir, "admin-docker-nas-disk-proof-");
  const timestamp = timestampForFile(new Date(generatedAt));
  const jsonPath = path.join(outputDir, `admin-docker-staging-runbook-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-staging-runbook-${timestamp}.md`);
  const report = buildAdminDockerStagingRunbookReport({
    generated_at: generatedAt,
    command: input.command ?? process.argv.join(" "),
    local_docker_smoke_report_path: localSmokePath,
    local_docker_smoke_report: await loadJson(localSmokePath),
    github_artifact_readiness_report_path: githubArtifactReadinessPath,
    github_artifact_readiness_report: await optionalLoadJson(githubArtifactReadinessPath),
    parity_plan_report_path: parityPath,
    parity_plan_report: await loadJson(parityPath),
    candidate_contract_proof_report_path: candidatePath,
    candidate_contract_proof_report: await loadJson(candidatePath),
    worker_env_proof_report_path: workerPath,
    worker_env_proof_report: await loadJson(workerPath),
    cutter_compatibility_proof_report_path: cutterPath,
    cutter_compatibility_proof_report: await loadJson(cutterPath),
    release_inputs_report_path: releaseInputsPath,
    release_inputs_report: await optionalLoadJson(releaseInputsPath),
    nas_disk_proof_report_path: nasDiskProofPath,
    nas_disk_proof_report: await optionalLoadJson(nasDiskProofPath),
    current_image_tag: input.current_image_tag,
    target_image_tag: input.target_image_tag,
    rollback_image_tag: input.rollback_image_tag,
    image_push_approval: input.image_push_approval
  });
  const reportWithArtifacts: AdminDockerStagingRunbookReport = {
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
  const report = await runAdminDockerStagingRunbook({
    local_docker_smoke_report_path: process.env.MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_REPORT,
    github_artifact_readiness_report_path: process.env.MIXLAB_DOCKER_GITHUB_ARTIFACT_READINESS_REPORT,
    parity_plan_report_path: process.env.MIXLAB_DOCKER_PARITY_PLAN_REPORT,
    candidate_contract_proof_report_path: process.env.MIXLAB_ADMIN_DOCKER_CANDIDATE_CONTRACT_PROOF_REPORT,
    worker_env_proof_report_path: process.env.MIXLAB_ADMIN_WORKER_ENV_PROOF_REPORT,
    cutter_compatibility_proof_report_path: process.env.MIXLAB_CUTTER_COMPATIBILITY_PROOF_REPORT,
    release_inputs_report_path: process.env.MIXLAB_ADMIN_DOCKER_RELEASE_INPUTS_REPORT,
    nas_disk_proof_report_path: process.env.MIXLAB_ADMIN_DOCKER_NAS_DISK_PROOF_REPORT,
    current_image_tag: process.env.MIXLAB_DOCKER_CURRENT_IMAGE_TAG,
    target_image_tag: process.env.MIXLAB_DOCKER_TARGET_IMAGE_TAG,
    rollback_image_tag: process.env.MIXLAB_DOCKER_ROLLBACK_IMAGE_TAG,
    image_push_approval: process.env.MIXLAB_DOCKER_PUSH_APPROVAL,
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    artifact_dir: process.env.MIXLAB_ACCEPTANCE_ARTIFACT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
