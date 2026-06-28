import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";

type GateStatus = "pass" | "blocked" | "fail";
type GateCategory = "safety" | "candidate" | "live-baseline" | "release-input" | "external-proof";

interface HandoffGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_release_inputs: boolean;
  blocks_staging_execution: boolean;
  blocks_docker_deploy: boolean;
  required_evidence?: string;
}

interface HandoffSummary {
  total: number;
  passed: number;
  blocked: number;
  failed: number;
  release_input_blockers: string[];
  staging_execution_blockers: string[];
  docker_deploy_blockers: string[];
}

interface HandoffSources {
  github_run_artifact_report: string;
  live_readonly_report: string;
}

interface ReleaseInputRequest {
  target_image_tag: string;
  candidate_branch: string;
  workflow_ref: string;
  release_ref_setup_command: string;
  workflow_dispatch_command: string;
  candidate_ref_proof_command: string;
  nas_image_proof_command: string;
  release_inputs_command: string;
  required_operator_inputs: Array<{
    id: string;
    label: string;
    value: string;
    status: "provided" | "required";
    source: string;
  }>;
  initial_staging_defaults: {
    library_preprocess_worker: "0";
    ready_publish_worker: "0";
    dashscope_api_key: "blank-unless-canary-approved";
    library_root: "/data/PublicLibrary";
  };
  forbidden_before_staged_proof: string[];
  post_staging_required_proofs: string[];
}

export interface AdminDockerPrestagingHandoffReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-prestaging-handoff";
  sources: HandoffSources;
  candidate: {
    github_run_id: number;
    github_run_url: string;
    head_sha: string;
    current_worktree_candidate_ready: boolean;
    github_run_candidate_ready: boolean;
    immutable_candidate_ref_ready: boolean;
    github_run_staging_handoff_ready: boolean;
    docker_deploy_allowed: false;
  };
  live_baseline: {
    target_url: string;
    library_root: string;
    ready_video_count: number | null;
    video_count: number | null;
    current_index_version: string;
    disk_usage_percent: number | null;
    disk_status: string;
    live_upload_blockers: string[];
    current_api_contract_blocked: boolean;
  };
  ready_to_request_release_inputs: boolean;
  staging_execution_ready: boolean;
  docker_deploy_allowed: false;
  release_input_request: ReleaseInputRequest;
  gates: HandoffGate[];
  summary: HandoffSummary;
  next_actions: string[];
  result: {
    status: "ready-for-release-inputs" | "blocked" | "failed";
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

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

function getPath(root: unknown, parts: string[]): unknown {
  let current: unknown = root;
  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numberValue = asNumber(value);
    if (numberValue !== null) {
      return numberValue;
    }
  }

  return null;
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
    release_input_blockers: gates
      .filter((item) => item.blocks_release_inputs && item.status !== "pass")
      .map((item) => item.id),
    staging_execution_blockers: gates
      .filter((item) => item.blocks_staging_execution && item.status !== "pass")
      .map((item) => item.id),
    docker_deploy_blockers: gates
      .filter((item) => item.blocks_docker_deploy && item.status !== "pass")
      .map((item) => item.id)
  };
}

function requestReleaseInputActions(input: {
  candidateSha: string;
  workflowRef: string;
  liveDiskRiskBlocked: boolean;
}): string[] {
  const candidateSha = input.candidateSha;
  const target = candidateSha || "<candidate-sha>";
  const workflowRef = input.workflowRef || "<candidate-release-tag>";
  const diskAction = input.liveDiskRiskBlocked
    ? [
        "Resolve the current NAS disk blocked state before staging execution; do not treat a generated push_images=true command as approval while disk risk is carried forward."
      ]
    : [];

  return [
    "Export a sanitized current NAS Admin Docker MIXLAB_IMAGE_TAG evidence file and docker inspect evidence, then run validate:admin-docker-nas-image-proof before choosing release inputs.",
    "Run validate:admin-docker-release-inputs with the accepted pre-staging handoff and NAS image proof reports to generate the exact push_images=true command.",
    "Use the accepted NAS image proof current_image_tag and rollback_image_tag values before staging; both should match for the first update.",
    ...diskAction,
    `Before explicit push approval, create or verify the immutable release ref ${workflowRef} points at candidate SHA ${target}.`,
    "Run the candidate release ref with push_images=false and generate validate:admin-docker-candidate-ref-proof before treating the ref as pinned release evidence.",
    `After explicit approval, rerun the Admin Docker workflow with --ref ${workflowRef}, push_images=true, current_image_tag=<current-tag>, rollback_image_tag=<current-tag>, and target image ${target}.`,
    "Do not change NAS .env or restart containers until the pushed-image run completes and produces release-gates artifacts.",
    "For initial staging, keep MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0, MIXLAB_ENABLE_READY_PUBLISH_WORKER=0, and leave DASHSCOPE_API_KEY blank unless a separate controlled-preprocess canary is approved.",
    "After staging, rerun live-readonly, admin-worker-env-proof, and Cutter compatibility proof before treating the MVP as complete."
  ];
}

function candidateReleaseRef(candidateSha: string): string {
  return candidateSha ? `admin-docker-candidate-${candidateSha}` : "<candidate-release-tag>";
}

function buildReleaseInputRequest(input: {
  candidate_sha: string;
  candidate_branch: string;
}): ReleaseInputRequest {
  const target = input.candidate_sha || "<candidate-sha>";
  const branch = input.candidate_branch || "<candidate-branch>";
  const ref = candidateReleaseRef(input.candidate_sha);

  return {
    target_image_tag: target,
    candidate_branch: branch,
    workflow_ref: ref,
    release_ref_setup_command: [
      `git tag ${ref} ${target}`,
      `git push origin refs/tags/${ref}:refs/tags/${ref}`
    ].join(" && "),
    workflow_dispatch_command: [
      "gh workflow run docker-admin.yml",
      "--repo alin155/mixlab",
      `--ref ${ref}`,
      "-f push_images=true",
      "-f current_image_tag=<current-admin-docker-image-tag>",
      "-f rollback_image_tag=<current-admin-docker-image-tag>"
    ].join(" "),
    candidate_ref_proof_command: [
      `MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_SHA=${target}`,
      `MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_TAG=${ref}`,
      "MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_RUN_ID=<tag-ref-push-images-false-run-id>",
      "MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_ARTIFACT_DIR=<downloaded-tag-ref-release-gates-artifact-dir>",
      "npm run validate:admin-docker-candidate-ref-proof"
    ].join(" "),
    nas_image_proof_command: [
      "MIXLAB_ADMIN_DOCKER_NAS_ENV_FILE=<path>/admin-docker-current.env",
      "MIXLAB_ADMIN_DOCKER_NAS_INSPECT_JSON=<path>/admin-docker-current.inspect.json",
      "npm run validate:admin-docker-nas-image-proof"
    ].join(" "),
    release_inputs_command: [
      "MIXLAB_ADMIN_DOCKER_PRESTAGING_HANDOFF_REPORT=<path>/admin-docker-prestaging-handoff.json",
      "MIXLAB_ADMIN_DOCKER_NAS_IMAGE_PROOF_REPORT=<path>/admin-docker-nas-image-proof.json",
      "npm run validate:admin-docker-release-inputs"
    ].join(" "),
    required_operator_inputs: [
      {
        id: "explicit_push_images_approval",
        label: "Run workflow_dispatch with push_images=true only after release approval",
        value: "workflow_dispatch:push_images=true",
        status: "required",
        source: "human release decision"
      },
      {
        id: "current_image_tag",
        label: "Current NAS Admin Docker image tag",
        value: "",
        status: "required",
        source: "accepted admin-docker-nas-image-proof report before staging"
      },
      {
        id: "rollback_image_tag",
        label: "Rollback image tag, normally matching current_image_tag",
        value: "",
        status: "required",
        source: "same accepted admin-docker-nas-image-proof value as current_image_tag for the first update"
      }
    ],
    initial_staging_defaults: {
      library_preprocess_worker: "0",
      ready_publish_worker: "0",
      dashscope_api_key: "blank-unless-canary-approved",
      library_root: "/data/PublicLibrary"
    },
    forbidden_before_staged_proof: [
      "Do not edit NAS .env or restart NAS containers before the pushed-image workflow succeeds.",
      "Do not enable library preprocess worker, ready publish worker, scan apply, index repair, or release publish for initial staging.",
      "Do not treat the existing 18080 legacy Admin target as staged candidate proof.",
      "Do not mutate Cutter release/index before staged live-readonly and Cutter compatibility proof pass."
    ],
    post_staging_required_proofs: [
      "Run GET-only live-readonly against the staged Admin Web root and require current Admin API contract endpoints to pass.",
      "Export staged admin-worker env/inspect evidence and require admin-worker-env-proof accepted.",
      "Run Windows Cutter compatibility proof with staged-candidate windows_acceptance and real_cut_smoke reports.",
      "Verify ready count stays at 10471 and current index stays v010471 unless a later separately approved publish phase changes them."
    ]
  };
}

export function buildAdminDockerPrestagingHandoffReport(input: {
  generated_at: string;
  command: string;
  github_run_artifact_report_path: string;
  github_run_artifact_report: unknown;
  live_readonly_report_path: string;
  live_readonly_report: unknown;
}): AdminDockerPrestagingHandoffReport {
  const runReport = asRecord(input.github_run_artifact_report);
  const liveReport = asRecord(input.live_readonly_report);
  const run = asRecord(runReport.run);
  const observed = asRecord(liveReport.observed);
  const liveSummary = asRecord(liveReport.summary);
  const liveUploadBlockers = stringArray(liveSummary.upload_blockers);
  const currentWorktreeCandidateReady = asBoolean(runReport.current_worktree_candidate_ready) === true;
  const githubRunCandidateReady = asBoolean(runReport.github_run_candidate_ready) === true;
  const githubRunStagingReady = asBoolean(runReport.github_run_staging_handoff_ready) === true;
  const runDeployAllowed = asBoolean(runReport.docker_deploy_allowed) === true;
  const liveDeployAllowed = asBoolean(liveReport.docker_upload_allowed) === true;
  const readyCount = firstNumber(
    observed.ready_video_count,
    getPath(liveReport, ["requests", "2", "data", "ready_video_count"])
  );
  const videoCount = firstNumber(observed.video_count);
  const diskUsage = firstNumber(getPath(liveReport, ["requests", "4", "data", "runtime_load", "disk", "usage_percent"]));
  const diskStatus = asString(getPath(liveReport, ["requests", "4", "data", "runtime_load", "disk", "status"]));
  const target = asRecord(liveReport.target);
  const targetUrl = asString(target.normalized_base_url) || asString(target.base_url);
  const libraryRoot = asString(observed.library_root);
  const currentIndexVersion = asString(observed.current_index_version);
  const candidateSha = asString(run.headSha);
  const candidateBranch = asString(run.headBranch);
  const immutableCandidateRefReady = githubRunCandidateReady &&
    Boolean(candidateSha) &&
    candidateBranch === candidateReleaseRef(candidateSha);
  const smokedCandidateReady = currentWorktreeCandidateReady || immutableCandidateRefReady;
  const currentApiContractBlocked = liveUploadBlockers.includes("current-admin-api-contract-live") ||
    liveUploadBlockers.includes("data-loading-contract-live");
  const liveDiskRiskBlocked = diskStatus === "blocked" ||
    liveUploadBlockers.includes("preprocess-disk") ||
    liveUploadBlockers.includes("disk-space-protection-contract-live");
  const liveBaselineObserved = Boolean(targetUrl && libraryRoot && readyCount !== null && currentIndexVersion);
  const gates: HandoffGate[] = [
    gate({
      id: "prestaging-handoff-no-side-effects",
      title: "Pre-staging handoff reads reports only",
      category: "safety",
      status: "pass",
      evidence: "Reads archived GitHub run and live-readonly reports only; does not contact NAS, Docker, GHCR, GitHub, Windows Runner, Admin API, or Cutter API.",
      blocks_release_inputs: false,
      blocks_staging_execution: false,
      blocks_docker_deploy: false
    }),
    gate({
      id: "current-worktree-candidate-ready",
      title: "Current worktree or immutable candidate ref has a smoked Admin Docker candidate",
      category: "candidate",
      status: smokedCandidateReady ? "pass" : "blocked",
      evidence: [
        `current_worktree_candidate_ready=${String(currentWorktreeCandidateReady)}`,
        `github_run_candidate_ready=${String(githubRunCandidateReady)}`,
        `immutable_candidate_ref_ready=${String(immutableCandidateRefReady)}`,
        `run=${asString(run.url) || asString(runReport.run_url) || "<missing>"}`
      ].join(", "),
      blocks_release_inputs: !smokedCandidateReady,
      blocks_staging_execution: !smokedCandidateReady,
      blocks_docker_deploy: true,
      required_evidence: "Collect a successful Admin Docker GitHub run artifact report with current_worktree_candidate_ready:true, or with github_run_candidate_ready:true from admin-docker-candidate-<sha>."
    }),
    gate({
      id: "handoff-does-not-approve-deploy",
      title: "Input handoff does not approve Docker deploy",
      category: "safety",
      status: !runDeployAllowed && !liveDeployAllowed ? "pass" : "fail",
      evidence: `run.docker_deploy_allowed=${String(runDeployAllowed)}, live.docker_upload_allowed=${String(liveDeployAllowed)}`,
      blocks_release_inputs: true,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Pre-staging handoff must remain a planning/input gate and cannot approve deploy."
    }),
    gate({
      id: "live-baseline-observed",
      title: "Current NAS live baseline is observed read-only",
      category: "live-baseline",
      status: liveBaselineObserved ? "pass" : "blocked",
      evidence: `target=${targetUrl || "<missing>"}, library_root=${libraryRoot || "<missing>"}, ready=${readyCount ?? "missing"}, index=${currentIndexVersion || "<missing>"}`,
      blocks_release_inputs: !liveBaselineObserved,
      blocks_staging_execution: !liveBaselineObserved,
      blocks_docker_deploy: true,
      required_evidence: "Run validate:admin-docker-release-live-readonly against the current NAS Admin target before requesting staging inputs."
    }),
    gate({
      id: "legacy-live-target-not-mistaken-for-staged-candidate",
      title: "Live 18080 target is not treated as the staged candidate",
      category: "live-baseline",
      status: currentApiContractBlocked ? "pass" : "blocked",
      evidence: currentApiContractBlocked
        ? `Current live upload blockers include current API/data-loading contract gaps: ${liveUploadBlockers.filter((item) => item.includes("contract") || item.includes("data-loading")).join(", ")}`
        : "Current live target did not prove the expected legacy/staging distinction; inspect the live-readonly report before proceeding.",
      blocks_release_inputs: false,
      blocks_staging_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "If this is already a staged candidate, rerun full staging/live-readonly proof instead of using the pre-staging handoff."
    }),
    gate({
      id: "nas-disk-risk-carried-forward",
      title: "Current NAS disk risk is carried forward",
      category: "live-baseline",
      status: liveDiskRiskBlocked ? "blocked" : "pass",
      evidence: liveDiskRiskBlocked
        ? `disk_usage=${diskUsage ?? "unknown"}%, disk_status=${diskStatus || "unknown"}, live_upload_blockers=${liveUploadBlockers.join(", ") || "none"}`
        : `disk_usage=${diskUsage ?? "unknown"}%, disk_status=${diskStatus || "unknown"}`,
      blocks_release_inputs: false,
      blocks_staging_execution: liveDiskRiskBlocked,
      blocks_docker_deploy: liveDiskRiskBlocked,
      required_evidence: "NAS disk risk must be cleared or explicitly re-proven safe before staging execution; image push input packaging alone is not approval."
    }),
    gate({
      id: "explicit-push-approval-required",
      title: "Explicit image-push approval is still required",
      category: "release-input",
      status: githubRunStagingReady ? "pass" : "blocked",
      evidence: `github_run_staging_handoff_ready=${String(githubRunStagingReady)}`,
      blocks_release_inputs: false,
      blocks_staging_execution: !githubRunStagingReady,
      blocks_docker_deploy: true,
      required_evidence: "User/release decision must explicitly run workflow_dispatch with push_images=true after candidate readiness is green."
    }),
    gate({
      id: "current-and-rollback-tags-required",
      title: "Current and rollback image tags are still required",
      category: "release-input",
      status: githubRunStagingReady ? "pass" : "blocked",
      evidence: "Pre-staging report cannot infer NAS current image tag or rollback tag from HTTP probes.",
      blocks_release_inputs: false,
      blocks_staging_execution: !githubRunStagingReady,
      blocks_docker_deploy: true,
      required_evidence: "Provide an accepted admin-docker-nas-image-proof report, then use its current_image_tag and rollback_image_tag values with rollback matching current before staging."
    }),
    gate({
      id: "staged-live-readonly-required",
      title: "Staged live-readonly proof is still required",
      category: "external-proof",
      status: "blocked",
      evidence: "Current report only observes the existing NAS Admin target before staging.",
      blocks_release_inputs: false,
      blocks_staging_execution: false,
      blocks_docker_deploy: true,
      required_evidence: "After staging the candidate, rerun GET-only live-readonly and require current Admin API contract endpoints to pass."
    }),
    gate({
      id: "admin-worker-env-proof-required",
      title: "NAS admin-worker env proof is still required",
      category: "external-proof",
      status: "blocked",
      evidence: "HTTP probes cannot prove running admin-worker container env flags or image tag.",
      blocks_release_inputs: false,
      blocks_staging_execution: false,
      blocks_docker_deploy: true,
      required_evidence: "Export admin-worker.env and admin-worker.inspect.json on the NAS and require proof_accepted:true."
    }),
    gate({
      id: "cutter-compatibility-proof-required",
      title: "Staged Cutter compatibility proof is still required",
      category: "external-proof",
      status: "blocked",
      evidence: "Pre-staging proof cannot prove Windows Cutter behavior after the Docker candidate is staged.",
      blocks_release_inputs: false,
      blocks_staging_execution: false,
      blocks_docker_deploy: true,
      required_evidence: "After staging, run Windows windows_acceptance and real_cut_smoke, then require admin-cutter-compatibility-proof accepted."
    })
  ];
  const summary = summarize(gates);
  const readyToRequestReleaseInputs = summary.failed === 0 && summary.release_input_blockers.length === 0;
  const stagingExecutionReady = summary.failed === 0 && summary.staging_execution_blockers.length === 0;
  const resultStatus = summary.failed > 0
    ? "failed"
    : readyToRequestReleaseInputs
      ? "ready-for-release-inputs"
      : "blocked";
  const releaseInputRequest = buildReleaseInputRequest({
    candidate_sha: candidateSha,
    candidate_branch: candidateBranch
  });

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-prestaging-handoff",
    sources: {
      github_run_artifact_report: input.github_run_artifact_report_path,
      live_readonly_report: input.live_readonly_report_path
    },
    candidate: {
      github_run_id: asNumber(run.databaseId) ?? 0,
      github_run_url: asString(run.url),
      head_sha: candidateSha,
      current_worktree_candidate_ready: currentWorktreeCandidateReady,
      github_run_candidate_ready: githubRunCandidateReady,
      immutable_candidate_ref_ready: immutableCandidateRefReady,
      github_run_staging_handoff_ready: githubRunStagingReady,
      docker_deploy_allowed: false
    },
    live_baseline: {
      target_url: targetUrl,
      library_root: libraryRoot,
      ready_video_count: readyCount,
      video_count: videoCount,
      current_index_version: currentIndexVersion,
      disk_usage_percent: diskUsage,
      disk_status: diskStatus,
      live_upload_blockers: liveUploadBlockers,
      current_api_contract_blocked: currentApiContractBlocked
    },
    ready_to_request_release_inputs: readyToRequestReleaseInputs,
    staging_execution_ready: stagingExecutionReady,
    docker_deploy_allowed: false,
    release_input_request: releaseInputRequest,
    gates,
    summary,
    next_actions: requestReleaseInputActions({
      candidateSha,
      workflowRef: releaseInputRequest.workflow_ref,
      liveDiskRiskBlocked
    }),
    result: {
      status: resultStatus,
      summary: resultStatus === "failed"
        ? "Pre-staging handoff failed a safety gate."
        : resultStatus === "ready-for-release-inputs"
          ? "A smoked Admin Docker candidate and current NAS baseline are available; release inputs can be requested, but staging and deploy remain blocked."
          : "Pre-staging handoff is blocked until candidate and live-baseline evidence are present."
    },
    artifacts: null
  };
}

export function toMarkdown(report: AdminDockerPrestagingHandoffReport): string {
  const lines = [
    "# Admin Docker Pre-Staging Handoff",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    "",
    "## Decision",
    "",
    `- Ready to request release inputs: ${report.ready_to_request_release_inputs ? "yes" : "no"}`,
    `- Staging execution ready: ${report.staging_execution_ready ? "yes" : "no"}`,
    "- Docker deploy allowed: no",
    `- Result: ${report.result.status}`,
    `- Summary: ${report.result.summary}`,
    "",
    "## Candidate",
    "",
    `- GitHub run: ${report.candidate.github_run_id || "<missing>"}`,
    `- GitHub run URL: ${report.candidate.github_run_url || "<missing>"}`,
    `- Head SHA: ${report.candidate.head_sha || "<missing>"}`,
    `- Current worktree candidate ready: ${report.candidate.current_worktree_candidate_ready ? "yes" : "no"}`,
    `- GitHub run candidate ready: ${report.candidate.github_run_candidate_ready ? "yes" : "no"}`,
    `- Immutable candidate ref ready: ${report.candidate.immutable_candidate_ref_ready ? "yes" : "no"}`,
    "",
    "## Live Baseline",
    "",
    `- Target URL: ${report.live_baseline.target_url || "<missing>"}`,
    `- Library root: ${report.live_baseline.library_root || "<missing>"}`,
    `- Ready video count: ${report.live_baseline.ready_video_count ?? "<missing>"}`,
    `- Total video count: ${report.live_baseline.video_count ?? "<missing>"}`,
    `- Current index: ${report.live_baseline.current_index_version || "<missing>"}`,
    `- Disk usage percent: ${report.live_baseline.disk_usage_percent ?? "<missing>"}`,
    `- Disk status: ${report.live_baseline.disk_status || "<missing>"}`,
    `- Live upload blockers: ${report.live_baseline.live_upload_blockers.join(", ") || "none"}`,
    `- Current API contract blocked: ${report.live_baseline.current_api_contract_blocked ? "yes" : "no"}`,
    "",
    "## Release Input Request",
    "",
    `- Target image tag: ${report.release_input_request.target_image_tag}`,
    `- Candidate branch: ${report.release_input_request.candidate_branch}`,
    `- Workflow ref: ${report.release_input_request.workflow_ref}`,
    `- Release ref setup: ${report.release_input_request.release_ref_setup_command}`,
    `- Workflow command: ${report.release_input_request.workflow_dispatch_command}`,
    `- Candidate ref proof command: ${report.release_input_request.candidate_ref_proof_command}`,
    `- NAS image proof command: ${report.release_input_request.nas_image_proof_command}`,
    `- Release inputs command: ${report.release_input_request.release_inputs_command}`,
    `- Initial library preprocess worker: ${report.release_input_request.initial_staging_defaults.library_preprocess_worker}`,
    `- Initial ready publish worker: ${report.release_input_request.initial_staging_defaults.ready_publish_worker}`,
    `- Initial DASHSCOPE_API_KEY: ${report.release_input_request.initial_staging_defaults.dashscope_api_key}`,
    `- Library root: ${report.release_input_request.initial_staging_defaults.library_root}`,
    "",
    "| Input | Status | Source | Value |",
    "| --- | --- | --- | --- |",
    ...report.release_input_request.required_operator_inputs.map((item) => `| ${item.id} | ${item.status} | ${item.source.replace(/\|/g, "/")} | ${item.value || "<required>"} |`),
    "",
    "### Forbidden Before Staged Proof",
    "",
    ...report.release_input_request.forbidden_before_staged_proof.map((item) => `- ${item}`),
    "",
    "### Post-Staging Required Proofs",
    "",
    ...report.release_input_request.post_staging_required_proofs.map((item) => `- ${item}`),
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks release inputs | Blocks staging | Blocks deploy | Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => `| ${item.id} | ${item.category} | ${item.status} | ${item.blocks_release_inputs ? "yes" : "no"} | ${item.blocks_staging_execution ? "yes" : "no"} | ${item.blocks_docker_deploy ? "yes" : "no"} | ${item.evidence.replace(/\|/g, "/")} |`),
    "",
    "## Blockers",
    "",
    `- Release input blockers: ${report.summary.release_input_blockers.join(", ") || "none"}`,
    `- Staging execution blockers: ${report.summary.staging_execution_blockers.join(", ") || "none"}`,
    `- Docker deploy blockers: ${report.summary.docker_deploy_blockers.join(", ") || "none"}`,
    "",
    "## Next Actions",
    "",
    ...report.next_actions.map((action) => `- ${action}`),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "<not written>"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "<not written>"}`,
    ""
  ];

  return lines.join("\n");
}

async function loadJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

export async function runAdminDockerPrestagingHandoff(input: {
  github_run_artifact_report_path: string;
  live_readonly_report_path: string;
  output_dir?: string;
  generated_at?: string;
  command?: string;
}): Promise<AdminDockerPrestagingHandoffReport> {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const report = buildAdminDockerPrestagingHandoffReport({
    generated_at: generatedAt,
    command: input.command ?? process.argv.join(" "),
    github_run_artifact_report_path: input.github_run_artifact_report_path,
    github_run_artifact_report: await loadJson(input.github_run_artifact_report_path),
    live_readonly_report_path: input.live_readonly_report_path,
    live_readonly_report: await loadJson(input.live_readonly_report_path)
  });
  const timestamp = timestampForFile(new Date(generatedAt));
  const jsonPath = path.join(outputDir, `admin-docker-prestaging-handoff-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-prestaging-handoff-${timestamp}.md`);
  const reportWithArtifacts: AdminDockerPrestagingHandoffReport = {
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
  const reportPath = process.env.MIXLAB_ADMIN_DOCKER_RUN_ARTIFACT_REPORT ?? process.argv[2];
  const livePath = process.env.MIXLAB_ADMIN_DOCKER_LIVE_READONLY_REPORT ?? process.argv[3];

  if (!reportPath || !livePath) {
    throw new Error("Usage: MIXLAB_ADMIN_DOCKER_RUN_ARTIFACT_REPORT=<run-artifact.json> MIXLAB_ADMIN_DOCKER_LIVE_READONLY_REPORT=<live-readonly.json> npm run validate:admin-docker-prestaging-handoff");
  }

  const report = await runAdminDockerPrestagingHandoff({
    github_run_artifact_report_path: reportPath,
    live_readonly_report_path: livePath,
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    ready_to_request_release_inputs: report.ready_to_request_release_inputs,
    staging_execution_ready: report.staging_execution_ready,
    docker_deploy_allowed: report.docker_deploy_allowed,
    target_image_tag: report.release_input_request.target_image_tag,
    workflow_dispatch_command: report.release_input_request.workflow_dispatch_command,
    release_input_blockers: report.summary.release_input_blockers,
    staging_execution_blockers: report.summary.staging_execution_blockers,
    json_path: report.artifacts?.json_path,
    markdown_path: report.artifacts?.markdown_path
  }, null, 2));

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
