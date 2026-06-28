import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_ARTIFACT_DIR = "docs/acceptance/artifacts";

type ReadinessStatus = "pass" | "blocked";
type ReadinessCategory =
  | "safety"
  | "local-smoke"
  | "release-inputs"
  | "nas-access"
  | "handoff"
  | "live-nas"
  | "parity"
  | "worker"
  | "cutter"
  | "runbook";

interface ReadinessGate {
  id: string;
  title: string;
  category: ReadinessCategory;
  status: ReadinessStatus;
  evidence: string;
  blocks_release_review: boolean;
  required_evidence?: string;
}

interface ReadinessSummary {
  total: number;
  passed: number;
  blocked: number;
  release_review_blockers: string[];
}

interface AutomationBoundary {
  safe_local_progress_allowed: boolean;
  nas_runtime_changes_allowed: false;
  image_push_allowed: false;
  docker_deploy_allowed: false;
  release_approval_required: boolean;
  nas_operator_or_runtime_action_required: boolean;
  windows_staged_candidate_required: boolean;
  reasons_requiring_external_action: string[];
  safe_local_next_actions: string[];
  blocked_actions: string[];
}

interface ReadinessSources {
  local_docker_smoke_report: string;
  live_readonly_report: string;
  parity_plan_report: string;
  github_artifact_readiness_report: string;
  worker_env_proof_report: string;
  cutter_compatibility_proof_report: string;
  release_inputs_intake_report: string;
  nas_access_preflight_report: string;
  nas_handoff_kit_report: string;
  staging_runbook_report: string;
}

export interface AdminDockerReleaseReadinessSummaryReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-release-readiness-summary";
  sources: ReadinessSources;
  release_review_ready: boolean;
  docker_upload_allowed: false;
  observations: {
    local_smoke_status: string;
    local_smoke_passed: boolean | null;
    local_smoke_blockers: string[];
    github_artifact_status: string;
    github_candidate_artifact_ready: boolean | null;
    github_candidate_image_tag: string;
    github_candidate_build_sha: string;
    github_staging_handoff_ready: boolean | null;
    live_status: string;
    live_upload_blockers: string[];
    parity_status: string;
    parity_upload_blockers: string[];
    worker_status: string;
    worker_proof_accepted: boolean | null;
    worker_upload_blockers: string[];
    cutter_status: string;
    cutter_proof_accepted: boolean | null;
    cutter_upload_blockers: string[];
    release_inputs_intake_status: string;
    release_inputs_intake_complete: boolean | null;
    release_inputs_returned_precheck_passed: boolean | null;
    release_inputs_ready: boolean | null;
    release_inputs_intake_blockers: string[];
    release_input_blockers: string[];
    nas_access_status: string;
    nas_collection_directly_available: boolean | null;
    nas_collection_blockers: string[];
    nas_access_staging_review_blockers: string[];
    nas_handoff_kit_status: string;
    nas_handoff_kit_ready: boolean | null;
    nas_handoff_kit_blockers: string[];
    nas_handoff_kit_archive_path: string;
    nas_handoff_kit_archive_sha256: string;
    staging_status: string;
    staging_review_ready: boolean | null;
    staging_blockers: string[];
    unresolved_parity_blockers: string[];
    resolved_external_parity_blockers: string[];
  };
  gates: ReadinessGate[];
  summary: ReadinessSummary;
  automation_boundary: AutomationBoundary;
  result: {
    status: "ready-for-release-decision" | "blocked";
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

function summaryBlockers(report: unknown, key = "upload_blockers"): string[] {
  return asArray(asRecord(asRecord(report).summary)[key])
    .filter((item): item is string => typeof item === "string");
}

function resultStatus(report: unknown): string {
  return asString(asRecord(asRecord(report).result).status);
}

function gate(input: ReadinessGate): ReadinessGate {
  return input;
}

function summarize(gates: ReadinessGate[]): ReadinessSummary {
  const releaseReviewBlockers = gates
    .filter((item) => item.blocks_release_review && item.status !== "pass")
    .map((item) => item.id);

  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    release_review_blockers: releaseReviewBlockers
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

    return candidates.length === 0 ? "" : path.join(artifactDir, candidates[candidates.length - 1]);
  });
}

async function optionalFile(filePath: string): Promise<string> {
  try {
    await access(filePath);
    return filePath;
  } catch {
    return "";
  }
}

async function loadJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Failed to read JSON report at ${filePath}: ${errorMessage(error)}`);
  }
}

function nextActions(input: {
  localSmokePassed: boolean | null;
  localSmokeBlockers: string[];
  githubCandidateArtifactReady: boolean | null;
  githubCandidateImageTag: string;
  liveBlockers: string[];
  parityBlockers: string[];
  workerAccepted: boolean | null;
  cutterAccepted: boolean | null;
  stagingBlockers: string[];
  releaseInputsIntakeComplete: boolean | null;
  releaseInputsReady: boolean | null;
  releaseInputsIntakeBlockers: string[];
  releaseInputBlockers: string[];
  nasCollectionDirectlyAvailable: boolean | null;
  nasCollectionBlockers: string[];
  handoffKitReady: boolean | null;
  handoffKitArchivePath: string;
  handoffKitArchiveSha256: string;
  handoffKitBlockers: string[];
}): string[] {
  const actions: string[] = [];

  const candidateSmokeAccepted = input.localSmokePassed === true || input.githubCandidateArtifactReady === true;

  if (!candidateSmokeAccepted) {
    actions.push("Run the Admin Docker local smoke on a Docker-capable machine with MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN=1, then rerun validate:admin-docker-release-readiness-summary.");
  }

  if (!candidateSmokeAccepted && (input.localSmokeBlockers.includes("docker-cli-available") || input.localSmokeBlockers.includes("docker-compose-available"))) {
    actions.push("Provide Docker CLI and Docker Compose on the local/staging validation machine before treating the candidate as Docker-smoked.");
  }

  if (input.parityBlockers.includes("current-admin-api-contract-parity")) {
    actions.push("Update or stage a NAS Docker image exposing the current Admin API contract endpoints, then rerun the GET-only live-readonly probe and parity plan.");
  }

  if (input.parityBlockers.includes("admin-worker-env-proof-contract")) {
    actions.push("Update or stage a NAS Docker image exposing admin_worker_env_proof from /api/admin/release-gates, then rerun the GET-only live-readonly probe and parity plan.");
  }

  if (input.parityBlockers.includes("cutter-compatibility-proof-contract")) {
    actions.push("Update or stage a NAS Docker image exposing cutter_compatibility_proof from /api/admin/release-gates, then rerun the GET-only live-readonly probe and parity plan.");
  }

  if (input.parityBlockers.includes("nas-disk-risk") || input.liveBlockers.includes("preprocess-disk")) {
    actions.push("Resolve NAS disk pressure before staging; do not treat low free space as a cosmetic warning.");
  }

  if (!input.workerAccepted) {
    actions.push("Collect NAS-exported admin-worker env and inspect evidence, then rerun validate:admin-worker-env-proof.");
  }

  if (!input.cutterAccepted) {
    actions.push("After a separately gated staged candidate exists, run Windows Cutter windows_acceptance and real_cut_smoke, then rerun validate:admin-cutter-compatibility-proof.");
  }

  if (candidateSmokeAccepted && input.stagingBlockers.includes("local-docker-smoke-passed")) {
    actions.push("Regenerate the staging runbook from current evidence so the stale local-docker-smoke-passed blocker is replaced by the accepted GitHub candidate artifact.");
  }

  if (!input.releaseInputsIntakeComplete) {
    if (input.handoffKitReady && input.handoffKitArchivePath) {
      actions.push(`Transfer ${input.handoffKitArchivePath} to the NAS desktop or NAS shell host, verify sha256=${input.handoffKitArchiveSha256 || "unknown"}, run the kit self-check, then collect returned release inputs.`);
    } else {
      actions.push(`Regenerate package:admin-docker-nas-handoff-kit before asking the NAS operator to collect returned evidence. Current kit blockers: ${input.handoffKitBlockers.join(", ") || "unknown"}.`);
    }
    if (input.nasCollectionDirectlyAvailable !== true && input.nasCollectionBlockers.length > 0) {
      actions.push(`Direct Mac-to-NAS collection remains unavailable; current NAS collection blockers: ${input.nasCollectionBlockers.join(", ")}.`);
    }
    actions.push(`Run the NAS release-inputs collector, copy admin-docker-release-inputs/ back to the Mac repo, then rerun intake:admin-docker-nas-release-inputs. Current intake blockers: ${input.releaseInputsIntakeBlockers.join(", ") || "unknown"}.`);
  }

  if (!input.releaseInputsReady) {
    actions.push(`Regenerate release inputs from accepted pre-staging, candidate-ref, and NAS current-image proof before release review. Current release-input blockers: ${input.releaseInputBlockers.join(", ") || "unknown"}.`);
  }

  if (input.stagingBlockers.includes("candidate-contract-proof-accepted")) {
    actions.push("Run validate:admin-docker-candidate-contract-proof against the local or staged Admin candidate and require candidate_contract_ready:true before staging review.");
  }

  if (input.stagingBlockers.includes("image-push-explicitly-approved")) {
    actions.push("Run the Admin Docker GitHub workflow manually with push_images=true after candidate smoke evidence is green, then set MIXLAB_DOCKER_PUSH_APPROVAL=workflow_dispatch:push_images=true for the staging runbook.");
  }

  if (input.stagingBlockers.includes("target-tag-matches-smoked-image")) {
    actions.push(`Set MIXLAB_DOCKER_TARGET_IMAGE_TAG to the exact accepted candidate image tag${input.githubCandidateImageTag ? ` (${input.githubCandidateImageTag})` : ""} before staging review.`);
  }

  if (input.stagingBlockers.some((item) => item.includes("image-tag") || item.includes("tag-"))) {
    actions.push("Provide explicit current, target, and rollback Docker image tags before release review.");
  }

  if (actions.length === 0) {
    actions.push("All evidence gates are ready for a separate release decision; this summary still does not upload Docker.");
  }

  return actions;
}

function buildAutomationBoundary(input: {
  releaseReviewReady: boolean;
  liveBlockers: string[];
  parityBlockers: string[];
  workerAccepted: boolean | null;
  cutterAccepted: boolean | null;
  releaseInputsIntakeComplete: boolean | null;
  releaseInputsReady: boolean | null;
  nasCollectionDirectlyAvailable: boolean | null;
  nasCollectionBlockers: string[];
  handoffKitReady: boolean | null;
  stagingBlockers: string[];
  candidateSmokeAccepted: boolean;
}): AutomationBoundary {
  const reasons = new Set<string>();
  const safeActions = new Set<string>();
  const blockedActions = new Set<string>();

  if (input.releaseReviewReady) {
    reasons.add("Separate release decision is required before Docker image push or NAS staging.");
  } else if (input.stagingBlockers.includes("image-push-explicitly-approved") || !input.releaseReviewReady) {
    reasons.add("Explicit release approval is still required before push_images=true or staging execution.");
    blockedActions.add("Do not run the Admin Docker workflow with push_images=true.");
  }

  if (input.liveBlockers.length > 0 || input.parityBlockers.length > 0) {
    reasons.add("Live NAS evidence still reports old or unsafe Admin Docker runtime gates.");
    blockedActions.add("Do not edit NAS Docker .env, pull images, restart containers, or replace the 18080 runtime from this summary alone.");
  }

  if (
    input.liveBlockers.includes("preprocess-disk") ||
    input.parityBlockers.includes("nas-disk-risk") ||
    input.stagingBlockers.includes("nas-disk-proof-accepted")
  ) {
    reasons.add("NAS disk pressure must be cleared or reproved before staging.");
  }

  if (!input.workerAccepted) {
    reasons.add("admin-worker proof is not accepted; current or staged worker flags/roots still need safe evidence.");
    blockedActions.add("Do not enable standalone preprocess or ready-publish workers.");
  }

  if (!input.cutterAccepted) {
    reasons.add("Cutter compatibility proof must be collected against a staged candidate before final MVP acceptance.");
  }

  if (!input.releaseInputsIntakeComplete || !input.releaseInputsReady) {
    reasons.add("NAS returned evidence and release inputs are not ready for a release decision.");
  }

  if (!input.releaseInputsIntakeComplete && input.nasCollectionDirectlyAvailable !== true && input.nasCollectionBlockers.length > 0) {
    reasons.add(`Direct Mac-to-NAS collection is unavailable: ${input.nasCollectionBlockers.join(", ")}.`);
  }

  if (input.candidateSmokeAccepted) {
    safeActions.add("Refresh read-only evidence summaries, release-readiness summaries, and documentation from archived artifacts.");
  } else {
    safeActions.add("Refresh Docker candidate smoke evidence on a Docker-capable runner before any staging decision.");
  }

  if (input.handoffKitReady && !input.releaseInputsIntakeComplete) {
    safeActions.add("Keep the NAS handoff kit current and validate any returned evidence package locally when it appears.");
  }

  if (!input.workerAccepted) {
    safeActions.add("Improve worker proof validators and rerun them against sanitized returned evidence without touching NAS runtime.");
  }

  if (!input.cutterAccepted) {
    safeActions.add("Prepare Cutter proof collection commands for the staged candidate; do not count current production Cutter smoke as staged proof.");
  }

  blockedActions.add("Do not mark Admin Docker MVP v0.1 complete.");

  return {
    safe_local_progress_allowed: true,
    nas_runtime_changes_allowed: false,
    image_push_allowed: false,
    docker_deploy_allowed: false,
    release_approval_required: true,
    nas_operator_or_runtime_action_required: input.liveBlockers.length > 0 ||
      input.parityBlockers.length > 0 ||
      (!input.releaseInputsIntakeComplete && input.nasCollectionDirectlyAvailable !== true) ||
      !input.releaseInputsIntakeComplete ||
      !input.releaseInputsReady,
    windows_staged_candidate_required: !input.cutterAccepted,
    reasons_requiring_external_action: [...reasons],
    safe_local_next_actions: [...safeActions],
    blocked_actions: [...blockedActions]
  };
}

export function buildAdminDockerReleaseReadinessSummaryReport(input: {
  generated_at: string;
  command: string;
  live_readonly_report_path: string;
  live_readonly_report: unknown;
  local_docker_smoke_report_path: string;
  local_docker_smoke_report: unknown;
  github_artifact_readiness_report_path: string;
  github_artifact_readiness_report: unknown;
  parity_plan_report_path: string;
  parity_plan_report: unknown;
  worker_env_proof_report_path: string;
  worker_env_proof_report: unknown;
  cutter_compatibility_proof_report_path: string;
  cutter_compatibility_proof_report: unknown;
  release_inputs_intake_report_path: string;
  release_inputs_intake_report: unknown;
  nas_access_preflight_report_path: string;
  nas_access_preflight_report: unknown;
  nas_handoff_kit_report_path: string;
  nas_handoff_kit_report: unknown;
  staging_runbook_report_path: string;
  staging_runbook_report: unknown;
}): AdminDockerReleaseReadinessSummaryReport {
  const localSmokeBlockers = summaryBlockers(input.local_docker_smoke_report, "local_smoke_blockers");
  const liveBlockers = summaryBlockers(input.live_readonly_report);
  const parityBlockers = summaryBlockers(input.parity_plan_report);
  const workerBlockers = summaryBlockers(input.worker_env_proof_report);
  const cutterBlockers = summaryBlockers(input.cutter_compatibility_proof_report);
  const releaseInputsIntakeBlockers = summaryBlockers(input.release_inputs_intake_report, "intake_blockers");
  const releaseInputBlockers = summaryBlockers(input.release_inputs_intake_report, "release_input_blockers");
  const nasCollectionBlockers = summaryBlockers(input.nas_access_preflight_report, "nas_collection_blockers");
  const nasAccessStagingReviewBlockers = summaryBlockers(input.nas_access_preflight_report, "staging_review_blockers");
  const handoffKitBlockers = summaryBlockers(input.nas_handoff_kit_report, "kit_blockers");
  const stagingBlockers = summaryBlockers(input.staging_runbook_report, "staging_blockers");
  const workerAccepted = asBoolean(asRecord(input.worker_env_proof_report).proof_accepted);
  const cutterAccepted = asBoolean(asRecord(input.cutter_compatibility_proof_report).proof_accepted);
  const releaseInputsIntakeComplete = asBoolean(asRecord(input.release_inputs_intake_report).intake_complete);
  const releaseInputsReturnedPrecheckPassed = asBoolean(
    asRecord(asRecord(input.release_inputs_intake_report).observations).returned_precheck_passed
  );
  const releaseInputsReady = asBoolean(asRecord(input.release_inputs_intake_report).release_inputs_ready);
  const releaseInputsPushAllowed = asBoolean(asRecord(input.release_inputs_intake_report).push_execution_allowed);
  const releaseInputsDeployAllowed = asBoolean(asRecord(input.release_inputs_intake_report).docker_deploy_allowed);
  const githubCandidateArtifactReady = asBoolean(asRecord(input.github_artifact_readiness_report).github_candidate_artifact_ready);
  const githubStagingHandoffReady = asBoolean(asRecord(input.github_artifact_readiness_report).staging_handoff_ready);
  const githubArtifactDeployAllowed = asBoolean(asRecord(input.github_artifact_readiness_report).docker_deploy_allowed);
  const githubObservations = asRecord(asRecord(input.github_artifact_readiness_report).observations);
  const githubCandidateImageTag = asString(githubObservations.local_smoke_image_tag);
  const githubCandidateBuildSha = asString(githubObservations.local_smoke_build_sha);
  const nasCollectionDirectlyAvailable = asBoolean(asRecord(input.nas_access_preflight_report).nas_collection_directly_available);
  const nasAccessPushAllowed = asBoolean(asRecord(input.nas_access_preflight_report).push_execution_allowed);
  const nasAccessDeployAllowed = asBoolean(asRecord(input.nas_access_preflight_report).docker_deploy_allowed);
  const handoffKitReady = asBoolean(asRecord(input.nas_handoff_kit_report).kit_ready);
  const handoffKitPushAllowed = asBoolean(asRecord(input.nas_handoff_kit_report).push_execution_allowed);
  const handoffKitDeployAllowed = asBoolean(asRecord(input.nas_handoff_kit_report).docker_deploy_allowed);
  const handoffKitArtifacts = asRecord(asRecord(input.nas_handoff_kit_report).artifacts);
  const handoffKitArchiveFile = asRecord(asRecord(input.nas_handoff_kit_report).observations).archive_file;
  const handoffKitArchiveRecord = asRecord(handoffKitArchiveFile);
  const handoffKitArchivePath = asString(handoffKitArtifacts.kit_archive_path) || asString(handoffKitArchiveRecord.path);
  const handoffKitArchiveSha256 = asString(handoffKitArtifacts.kit_archive_sha256) || asString(handoffKitArchiveRecord.sha256);
  const localSmokePassed = asBoolean(asRecord(input.local_docker_smoke_report).local_smoke_passed);
  const stagingReviewReady = asBoolean(asRecord(input.staging_runbook_report).staging_review_ready);
  const stagingObservations = asRecord(asRecord(input.staging_runbook_report).observations);
  const dockerDeployAllowed = asBoolean(asRecord(input.staging_runbook_report).docker_deploy_allowed);
  const candidateSmokeAccepted = localSmokePassed === true || githubCandidateArtifactReady === true;
  const gates = [
    gate({
      id: "summary-no-side-effects",
      title: "Readiness summary has no runtime side effects",
      category: "safety",
      status: "pass",
      evidence: "This summary reads archived artifacts only; it does not contact Docker, NAS, Windows Runner, Admin API, or Cutter API.",
      blocks_release_review: false
    }),
    gate({
      id: "local-docker-smoke-passed",
      title: "Docker candidate smoke has passed locally or in GitHub",
      category: "local-smoke",
      status: candidateSmokeAccepted ? "pass" : "blocked",
      evidence: candidateSmokeAccepted
        ? `local_smoke_passed=${String(localSmokePassed)}, github_candidate_artifact_ready=${String(githubCandidateArtifactReady)}, image_tag=${githubCandidateImageTag || "local-report"}`
        : `Local Docker smoke blockers: ${localSmokeBlockers.join(", ") || "unknown"}; github_candidate_artifact_ready=${String(githubCandidateArtifactReady)}`,
      blocks_release_review: !candidateSmokeAccepted,
      required_evidence: "Run validate:admin-docker-local-smoke on a Docker-capable machine, or archive an Admin Docker GitHub artifact readiness report with github_candidate_artifact_ready=true."
    }),
    gate({
      id: "live-readonly-blockers-clear",
      title: "Live NAS Docker read-only blockers are clear",
      category: "live-nas",
      status: liveBlockers.length === 0 ? "pass" : "blocked",
      evidence: liveBlockers.length === 0 ? "No live-readonly upload blockers reported." : `Live blockers: ${liveBlockers.join(", ")}`,
      blocks_release_review: liveBlockers.length > 0,
      required_evidence: "Rerun the GET-only live-readonly probe after the staged target exposes current endpoints and live gates pass."
    }),
    gate({
      id: "parity-plan-blockers-clear",
      title: "Docker version/API parity blockers are clear",
      category: "parity",
      status: parityBlockers.length === 0 ? "pass" : "blocked",
      evidence: parityBlockers.length === 0 ? "No parity upload blockers reported." : `Parity blockers: ${parityBlockers.join(", ")}`,
      blocks_release_review: parityBlockers.length > 0,
      required_evidence: "Current Admin API contract, disk risk, worker proof, and Cutter proof blockers must be cleared."
    }),
    gate({
      id: "worker-proof-accepted",
      title: "admin-worker env proof is accepted",
      category: "worker",
      status: workerAccepted ? "pass" : "blocked",
      evidence: `worker status=${resultStatus(input.worker_env_proof_report) || "unknown"}, blockers=${workerBlockers.join(", ") || "none"}`,
      blocks_release_review: !workerAccepted,
      required_evidence: "Provide accepted NAS admin-worker env and inspect proof."
    }),
    gate({
      id: "cutter-proof-accepted",
      title: "Cutter compatibility proof is accepted",
      category: "cutter",
      status: cutterAccepted ? "pass" : "blocked",
      evidence: `cutter status=${resultStatus(input.cutter_compatibility_proof_report) || "unknown"}, blockers=${cutterBlockers.join(", ") || "none"}`,
      blocks_release_review: !cutterAccepted,
      required_evidence: "Provide accepted staged-candidate Windows Cutter compatibility proof."
    }),
    gate({
      id: "nas-release-inputs-intake-complete",
      title: "NAS release-input returned evidence has been consumed",
      category: "release-inputs",
      status: releaseInputsIntakeComplete ? "pass" : "blocked",
      evidence: releaseInputsIntakeComplete
        ? "intake_complete=true"
        : `intake blockers: ${releaseInputsIntakeBlockers.join(", ") || "unknown"}`,
      blocks_release_review: !releaseInputsIntakeComplete,
      required_evidence: "Run the NAS collector, copy admin-docker-release-inputs/ back locally, then run intake:admin-docker-nas-release-inputs until intake_complete=true."
    }),
    gate({
      id: "nas-collection-path-prepared",
      title: "NAS release-input collection path is prepared",
      category: "nas-access",
      status: releaseInputsIntakeComplete || nasCollectionDirectlyAvailable || handoffKitReady ? "pass" : "blocked",
      evidence: releaseInputsIntakeComplete
        ? "returned evidence has already been consumed by intake"
        : `direct_collection=${String(nasCollectionDirectlyAvailable)}, handoff_kit_ready=${String(handoffKitReady)}, nas_collection_blockers=${nasCollectionBlockers.join(", ") || "none"}`,
      blocks_release_review: !releaseInputsIntakeComplete && !nasCollectionDirectlyAvailable && !handoffKitReady,
      required_evidence: "Provide a direct NAS collection path or a ready portable handoff kit before waiting on returned NAS evidence."
    }),
    gate({
      id: "nas-handoff-kit-ready",
      title: "NAS handoff kit is ready for manual transfer",
      category: "handoff",
      status: releaseInputsIntakeComplete || handoffKitReady ? "pass" : "blocked",
      evidence: releaseInputsIntakeComplete
        ? "returned evidence has already been consumed by intake"
        : `kit_ready=${String(handoffKitReady)}, archive=${handoffKitArchivePath || "missing"}, kit_blockers=${handoffKitBlockers.join(", ") || "none"}`,
      blocks_release_review: !releaseInputsIntakeComplete && !handoffKitReady,
      required_evidence: "Run package:admin-docker-nas-handoff-kit and require kit_ready=true plus a sha256-pinned .tar.gz archive."
    }),
    gate({
      id: "returned-evidence-precheck-passed",
      title: "Returned NAS evidence precheck passed inside intake",
      category: "release-inputs",
      status: releaseInputsReturnedPrecheckPassed === true ? "pass" : "blocked",
      evidence: `returned_precheck_passed=${String(releaseInputsReturnedPrecheckPassed)}`,
      blocks_release_review: releaseInputsReturnedPrecheckPassed !== true,
      required_evidence: "Regenerate intake with a current script that records observations.returned_precheck_passed=true before release review."
    }),
    gate({
      id: "release-inputs-ready",
      title: "Release inputs are ready for a separate release decision",
      category: "release-inputs",
      status: releaseInputsReady ? "pass" : "blocked",
      evidence: releaseInputsReady
        ? "release_inputs_ready=true"
        : `release input blockers: ${releaseInputBlockers.join(", ") || "unknown"}`,
      blocks_release_review: !releaseInputsReady,
      required_evidence: "Release inputs must be regenerated from accepted pre-staging, candidate-ref, and NAS current-image proof."
    }),
    gate({
      id: "staging-runbook-ready",
      title: "Docker staging runbook is ready for release review",
      category: "runbook",
      status: stagingReviewReady ? "pass" : "blocked",
      evidence: stagingBlockers.length === 0 ? `staging_review_ready=${stagingReviewReady}` : `staging blockers: ${stagingBlockers.join(", ")}`,
      blocks_release_review: !stagingReviewReady,
      required_evidence: "Regenerate the staging runbook after explicit tags and evidence gates are satisfied."
    }),
    gate({
      id: "summary-does-not-approve-upload",
      title: "Summary does not approve Docker upload by itself",
      category: "safety",
      status: dockerDeployAllowed === false
        && releaseInputsPushAllowed === false
        && releaseInputsDeployAllowed === false
        && githubArtifactDeployAllowed === false
        && nasAccessPushAllowed === false
        && nasAccessDeployAllowed === false
        && handoffKitPushAllowed === false
        && handoffKitDeployAllowed === false
        ? "pass"
        : "blocked",
      evidence: `staging_runbook.docker_deploy_allowed=${dockerDeployAllowed ?? "unknown"}, release_inputs_intake.push_execution_allowed=${releaseInputsPushAllowed ?? "unknown"}, release_inputs_intake.docker_deploy_allowed=${releaseInputsDeployAllowed ?? "unknown"}, github_artifact.docker_deploy_allowed=${githubArtifactDeployAllowed ?? "unknown"}, nas_access.push_execution_allowed=${nasAccessPushAllowed ?? "unknown"}, nas_access.docker_deploy_allowed=${nasAccessDeployAllowed ?? "unknown"}, handoff_kit.push_execution_allowed=${handoffKitPushAllowed ?? "unknown"}, handoff_kit.docker_deploy_allowed=${handoffKitDeployAllowed ?? "unknown"}`,
      blocks_release_review: dockerDeployAllowed !== false
        || releaseInputsPushAllowed !== false
        || releaseInputsDeployAllowed !== false
        || githubArtifactDeployAllowed !== false
        || nasAccessPushAllowed !== false
        || nasAccessDeployAllowed !== false
        || handoffKitPushAllowed !== false
        || handoffKitDeployAllowed !== false,
      required_evidence: "Docker upload must remain a separate release decision even when evidence gates are ready."
    })
  ];
  const summary = summarize(gates);
  const releaseReviewReady = summary.release_review_blockers.length === 0;
  const automationBoundary = buildAutomationBoundary({
    releaseReviewReady,
    liveBlockers,
    parityBlockers,
    workerAccepted,
    cutterAccepted,
    releaseInputsIntakeComplete,
    releaseInputsReady,
    nasCollectionDirectlyAvailable,
    nasCollectionBlockers,
    handoffKitReady,
    stagingBlockers,
    candidateSmokeAccepted
  });

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-release-readiness-summary",
    sources: {
      local_docker_smoke_report: input.local_docker_smoke_report_path,
      github_artifact_readiness_report: input.github_artifact_readiness_report_path,
      live_readonly_report: input.live_readonly_report_path,
      parity_plan_report: input.parity_plan_report_path,
      worker_env_proof_report: input.worker_env_proof_report_path,
      cutter_compatibility_proof_report: input.cutter_compatibility_proof_report_path,
      release_inputs_intake_report: input.release_inputs_intake_report_path,
      nas_access_preflight_report: input.nas_access_preflight_report_path,
      nas_handoff_kit_report: input.nas_handoff_kit_report_path,
      staging_runbook_report: input.staging_runbook_report_path
    },
    release_review_ready: releaseReviewReady,
    docker_upload_allowed: false,
    observations: {
      local_smoke_status: resultStatus(input.local_docker_smoke_report),
      local_smoke_passed: localSmokePassed,
      local_smoke_blockers: localSmokeBlockers,
      github_artifact_status: resultStatus(input.github_artifact_readiness_report),
      github_candidate_artifact_ready: githubCandidateArtifactReady,
      github_candidate_image_tag: githubCandidateImageTag,
      github_candidate_build_sha: githubCandidateBuildSha,
      github_staging_handoff_ready: githubStagingHandoffReady,
      live_status: resultStatus(input.live_readonly_report),
      live_upload_blockers: liveBlockers,
      parity_status: resultStatus(input.parity_plan_report),
      parity_upload_blockers: parityBlockers,
      worker_status: resultStatus(input.worker_env_proof_report),
      worker_proof_accepted: workerAccepted,
      worker_upload_blockers: workerBlockers,
      cutter_status: resultStatus(input.cutter_compatibility_proof_report),
      cutter_proof_accepted: cutterAccepted,
      cutter_upload_blockers: cutterBlockers,
      release_inputs_intake_status: resultStatus(input.release_inputs_intake_report),
      release_inputs_intake_complete: releaseInputsIntakeComplete,
      release_inputs_returned_precheck_passed: releaseInputsReturnedPrecheckPassed,
      release_inputs_ready: releaseInputsReady,
      release_inputs_intake_blockers: releaseInputsIntakeBlockers,
      release_input_blockers: releaseInputBlockers,
      nas_access_status: resultStatus(input.nas_access_preflight_report),
      nas_collection_directly_available: nasCollectionDirectlyAvailable,
      nas_collection_blockers: nasCollectionBlockers,
      nas_access_staging_review_blockers: nasAccessStagingReviewBlockers,
      nas_handoff_kit_status: resultStatus(input.nas_handoff_kit_report),
      nas_handoff_kit_ready: handoffKitReady,
      nas_handoff_kit_blockers: handoffKitBlockers,
      nas_handoff_kit_archive_path: handoffKitArchivePath,
      nas_handoff_kit_archive_sha256: handoffKitArchiveSha256,
      staging_status: resultStatus(input.staging_runbook_report),
      staging_review_ready: stagingReviewReady,
      staging_blockers: stagingBlockers,
      unresolved_parity_blockers: asArray(stagingObservations.unresolved_parity_upload_blockers)
        .filter((item): item is string => typeof item === "string"),
      resolved_external_parity_blockers: asArray(stagingObservations.resolved_external_parity_blockers)
        .filter((item): item is string => typeof item === "string")
    },
    gates,
    summary,
    automation_boundary: automationBoundary,
    result: {
      status: releaseReviewReady ? "ready-for-release-decision" : "blocked",
      summary: releaseReviewReady
        ? "All archived evidence gates are ready for a separate release decision; this summary still does not upload Docker."
        : "Docker release review remains blocked by archived evidence gates."
    },
    next_actions: nextActions({
      localSmokePassed,
      localSmokeBlockers,
      githubCandidateArtifactReady,
      githubCandidateImageTag,
      liveBlockers,
      parityBlockers,
      workerAccepted,
      cutterAccepted,
      stagingBlockers,
      releaseInputsIntakeComplete,
      releaseInputsReady,
      releaseInputsIntakeBlockers,
      releaseInputBlockers,
      nasCollectionDirectlyAvailable,
      nasCollectionBlockers,
      handoffKitReady,
      handoffKitArchivePath,
      handoffKitArchiveSha256,
      handoffKitBlockers
    }),
    artifacts: null
  };
}

export function toMarkdown(report: AdminDockerReleaseReadinessSummaryReport): string {
  const lines = [
    "# Admin Docker Release Readiness Summary",
    "",
    `Generated: ${report.generated_at}`,
    "",
    `Mode: ${report.mode}`,
    "",
    `Result: ${report.result.status}`,
    "",
    `Release review ready: ${report.release_review_ready ? "yes" : "no"}`,
    "",
    `Docker upload allowed: ${report.docker_upload_allowed ? "yes" : "no"}`,
    "",
    "This summary reads archived artifacts only. It does not contact Docker, NAS, Windows Runner, Admin API, or Cutter API, and it does not approve Docker upload.",
    "",
    "## Sources",
    "",
    `- Local Docker smoke: ${report.sources.local_docker_smoke_report}`,
    `- GitHub artifact readiness: ${report.sources.github_artifact_readiness_report}`,
    `- Live readonly: ${report.sources.live_readonly_report}`,
    `- Parity plan: ${report.sources.parity_plan_report}`,
    `- Worker proof: ${report.sources.worker_env_proof_report}`,
    `- Cutter proof: ${report.sources.cutter_compatibility_proof_report}`,
    `- Release inputs intake: ${report.sources.release_inputs_intake_report}`,
    `- NAS access preflight: ${report.sources.nas_access_preflight_report}`,
    `- NAS handoff kit: ${report.sources.nas_handoff_kit_report}`,
    `- Staging runbook: ${report.sources.staging_runbook_report}`,
    "",
    "## Observations",
    "",
    `- Local Docker smoke passed: ${report.observations.local_smoke_passed ?? "unknown"}; blockers: ${report.observations.local_smoke_blockers.join(", ") || "none"}`,
    `- GitHub candidate artifact ready: ${report.observations.github_candidate_artifact_ready ?? "unknown"}; image_tag=${report.observations.github_candidate_image_tag || "none"}; build_sha=${report.observations.github_candidate_build_sha || "none"}; staging_handoff_ready=${report.observations.github_staging_handoff_ready ?? "unknown"}`,
    `- Live blockers: ${report.observations.live_upload_blockers.join(", ") || "none"}`,
    `- Parity blockers: ${report.observations.parity_upload_blockers.join(", ") || "none"}`,
    `- Worker accepted: ${report.observations.worker_proof_accepted ?? "unknown"}; blockers: ${report.observations.worker_upload_blockers.join(", ") || "none"}`,
    `- Cutter accepted: ${report.observations.cutter_proof_accepted ?? "unknown"}; blockers: ${report.observations.cutter_upload_blockers.join(", ") || "none"}`,
    `- Release-inputs intake complete: ${report.observations.release_inputs_intake_complete ?? "unknown"}; returned_precheck_passed=${report.observations.release_inputs_returned_precheck_passed ?? "unknown"}; blockers: ${report.observations.release_inputs_intake_blockers.join(", ") || "none"}`,
    `- Release inputs ready: ${report.observations.release_inputs_ready ?? "unknown"}; blockers: ${report.observations.release_input_blockers.join(", ") || "none"}`,
    `- NAS collection directly available: ${report.observations.nas_collection_directly_available ?? "unknown"}; blockers: ${report.observations.nas_collection_blockers.join(", ") || "none"}`,
    `- NAS access staging blockers: ${report.observations.nas_access_staging_review_blockers.join(", ") || "none"}`,
    `- NAS handoff kit ready: ${report.observations.nas_handoff_kit_ready ?? "unknown"}; archive: ${report.observations.nas_handoff_kit_archive_path || "none"}; sha256=${report.observations.nas_handoff_kit_archive_sha256 || "none"}; blockers: ${report.observations.nas_handoff_kit_blockers.join(", ") || "none"}`,
    `- Staging ready: ${report.observations.staging_review_ready ?? "unknown"}; blockers: ${report.observations.staging_blockers.join(", ") || "none"}`,
    `- Unresolved parity blockers: ${report.observations.unresolved_parity_blockers.join(", ") || "none"}`,
    `- Resolved external parity blockers: ${report.observations.resolved_external_parity_blockers.join(", ") || "none"}`,
    "",
    "## Automation Boundary",
    "",
    `- Safe local progress allowed: ${report.automation_boundary.safe_local_progress_allowed ? "yes" : "no"}`,
    `- NAS runtime changes allowed: ${report.automation_boundary.nas_runtime_changes_allowed ? "yes" : "no"}`,
    `- Image push allowed: ${report.automation_boundary.image_push_allowed ? "yes" : "no"}`,
    `- Docker deploy allowed: ${report.automation_boundary.docker_deploy_allowed ? "yes" : "no"}`,
    `- Release approval required: ${report.automation_boundary.release_approval_required ? "yes" : "no"}`,
    `- NAS operator/runtime action required: ${report.automation_boundary.nas_operator_or_runtime_action_required ? "yes" : "no"}`,
    `- Windows staged candidate required: ${report.automation_boundary.windows_staged_candidate_required ? "yes" : "no"}`,
    "",
    "External-action reasons:",
    ...report.automation_boundary.reasons_requiring_external_action.map((item) => `- ${item}`),
    report.automation_boundary.reasons_requiring_external_action.length === 0 ? "- none" : "",
    "Safe local next actions:",
    ...report.automation_boundary.safe_local_next_actions.map((item) => `- ${item}`),
    report.automation_boundary.safe_local_next_actions.length === 0 ? "- none" : "",
    "Blocked actions:",
    ...report.automation_boundary.blocked_actions.map((item) => `- ${item}`),
    report.automation_boundary.blocked_actions.length === 0 ? "- none" : "",
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Release Review | Evidence | Required Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => [
      item.id,
      item.category,
      item.status,
      item.blocks_release_review ? "yes" : "no",
      item.evidence,
      item.required_evidence ?? "n/a"
    ].join(" | ")),
    "",
    "## Next Actions",
    "",
    ...report.next_actions.map((item) => `- ${item}`),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "not written"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "not written"}`,
    ""
  ];

  return `${lines.join("\n").trimEnd()}\n`;
}

async function main(): Promise<void> {
  const outputDir = process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const artifactDir = process.env.MIXLAB_ACCEPTANCE_ARTIFACT_DIR ?? DEFAULT_ARTIFACT_DIR;
  const localSmokePath = process.env.MIXLAB_DOCKER_LOCAL_SMOKE_REPORT
    ?? await latestArtifact(artifactDir, "admin-docker-local-smoke-");
  const githubArtifactReadinessPath = process.env.MIXLAB_DOCKER_GITHUB_ARTIFACT_READINESS_REPORT
    ?? await optionalLatestArtifact(artifactDir, "admin-docker-github-artifact-readiness-");
  const livePath = process.env.MIXLAB_DOCKER_LIVE_READONLY_REPORT
    ?? await latestArtifact(artifactDir, "admin-docker-release-live-readonly-");
  const parityPath = process.env.MIXLAB_DOCKER_PARITY_PLAN_REPORT
    ?? await latestArtifact(artifactDir, "admin-docker-version-parity-plan-");
  const workerPath = process.env.MIXLAB_ADMIN_WORKER_ENV_PROOF_REPORT
    ?? await latestArtifact(artifactDir, "admin-worker-env-proof-");
  const cutterPath = process.env.MIXLAB_CUTTER_COMPATIBILITY_PROOF_REPORT
    ?? await latestArtifact(artifactDir, "admin-cutter-compatibility-proof-");
  const releaseInputsIntakePath = process.env.MIXLAB_ADMIN_DOCKER_NAS_RELEASE_INPUTS_INTAKE_REPORT
    ?? await latestArtifact(artifactDir, "admin-docker-nas-release-inputs-intake-");
  const nasAccessPreflightPath = process.env.MIXLAB_ADMIN_DOCKER_NAS_ACCESS_PREFLIGHT_REPORT
    ?? await optionalLatestArtifact(artifactDir, "admin-docker-nas-access-preflight-");
  const nasHandoffKitPath = process.env.MIXLAB_ADMIN_DOCKER_NAS_HANDOFF_KIT_REPORT
    ?? await optionalFile(path.join(artifactDir, "admin-docker-nas-handoff-kit-latest.json"));
  const runbookPath = process.env.MIXLAB_DOCKER_STAGING_RUNBOOK_REPORT
    ?? await latestArtifact(artifactDir, "admin-docker-staging-runbook-");
  const timestamp = timestampForFile();
  const jsonPath = path.join(outputDir, `admin-docker-release-readiness-summary-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-release-readiness-summary-${timestamp}.md`);
  const report = buildAdminDockerReleaseReadinessSummaryReport({
    generated_at: new Date().toISOString(),
    command: process.argv.join(" "),
    local_docker_smoke_report_path: localSmokePath,
    local_docker_smoke_report: await loadJson(localSmokePath),
    github_artifact_readiness_report_path: githubArtifactReadinessPath,
    github_artifact_readiness_report: githubArtifactReadinessPath ? await loadJson(githubArtifactReadinessPath) : {},
    live_readonly_report_path: livePath,
    live_readonly_report: await loadJson(livePath),
    parity_plan_report_path: parityPath,
    parity_plan_report: await loadJson(parityPath),
    worker_env_proof_report_path: workerPath,
    worker_env_proof_report: await loadJson(workerPath),
    cutter_compatibility_proof_report_path: cutterPath,
    cutter_compatibility_proof_report: await loadJson(cutterPath),
    release_inputs_intake_report_path: releaseInputsIntakePath,
    release_inputs_intake_report: await loadJson(releaseInputsIntakePath),
    nas_access_preflight_report_path: nasAccessPreflightPath,
    nas_access_preflight_report: nasAccessPreflightPath ? await loadJson(nasAccessPreflightPath) : {},
    nas_handoff_kit_report_path: nasHandoffKitPath,
    nas_handoff_kit_report: nasHandoffKitPath ? await loadJson(nasHandoffKitPath) : {},
    staging_runbook_report_path: runbookPath,
    staging_runbook_report: await loadJson(runbookPath)
  });
  const reportWithArtifacts: AdminDockerReleaseReadinessSummaryReport = {
    ...report,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(reportWithArtifacts, null, 2)}\n`);
  await writeFile(markdownPath, toMarkdown(reportWithArtifacts));
  console.log(JSON.stringify(reportWithArtifacts, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
