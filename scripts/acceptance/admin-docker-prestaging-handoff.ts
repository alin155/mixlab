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
    current_api_contract_blocked: boolean;
  };
  ready_to_request_release_inputs: boolean;
  staging_execution_ready: boolean;
  docker_deploy_allowed: false;
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

function requestReleaseInputActions(candidateSha: string): string[] {
  const target = candidateSha || "<candidate-sha>";

  return [
    `Confirm the current deployed Admin Docker image tag on the NAS before staging; this becomes both current_image_tag and rollback_image_tag for the first update.`,
    `After explicit approval, rerun the Admin Docker workflow with push_images=true, current_image_tag=<current-tag>, rollback_image_tag=<current-tag>, and target image ${target}.`,
    "Do not change NAS .env or restart containers until the pushed-image run completes and produces release-gates artifacts.",
    "For initial staging, keep MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0, MIXLAB_ENABLE_READY_PUBLISH_WORKER=0, and leave DASHSCOPE_API_KEY blank unless a separate controlled-preprocess canary is approved.",
    "After staging, rerun live-readonly, admin-worker-env-proof, and Cutter compatibility proof before treating the MVP as complete."
  ];
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
  const currentApiContractBlocked = liveUploadBlockers.includes("current-admin-api-contract-live") ||
    liveUploadBlockers.includes("data-loading-contract-live");
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
      title: "Current worktree has a smoked Admin Docker candidate",
      category: "candidate",
      status: currentWorktreeCandidateReady ? "pass" : "blocked",
      evidence: `current_worktree_candidate_ready=${String(currentWorktreeCandidateReady)}, run=${asString(run.url) || asString(runReport.run_url) || "<missing>"}`,
      blocks_release_inputs: !currentWorktreeCandidateReady,
      blocks_staging_execution: !currentWorktreeCandidateReady,
      blocks_docker_deploy: true,
      required_evidence: "Collect a successful Admin Docker GitHub run artifact report with current_worktree_candidate_ready:true."
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
      required_evidence: "Provide current_image_tag and rollback_image_tag, with rollback matching current before staging."
    }),
    gate({
      id: "staged-live-readonly-required",
      title: "Staged live-readonly proof is still required",
      category: "external-proof",
      status: "blocked",
      evidence: "Current report only observes the existing NAS Admin target before staging.",
      blocks_release_inputs: false,
      blocks_staging_execution: true,
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
      blocks_staging_execution: true,
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
      blocks_staging_execution: true,
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
      head_sha: asString(run.headSha),
      current_worktree_candidate_ready: currentWorktreeCandidateReady,
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
      current_api_contract_blocked: currentApiContractBlocked
    },
    ready_to_request_release_inputs: readyToRequestReleaseInputs,
    staging_execution_ready: stagingExecutionReady,
    docker_deploy_allowed: false,
    gates,
    summary,
    next_actions: requestReleaseInputActions(asString(run.headSha)),
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
    `- Current API contract blocked: ${report.live_baseline.current_api_contract_blocked ? "yes" : "no"}`,
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
