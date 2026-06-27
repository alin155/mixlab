import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  runGithubArtifactReadiness,
  type AdminDockerGithubArtifactReadinessReport
} from "./admin-docker-github-artifact-readiness.ts";

const execFileAsync = promisify(execFile);
const DEFAULT_REPO = "alin155/mixlab";
const DEFAULT_WORKFLOW = "docker-admin.yml";
const DEFAULT_ARTIFACT_NAME = "mixlab-admin-docker-release-gates";
const DEFAULT_OUTPUT_ROOT = ".local-dev/admin-docker-github-runs";
const DEFAULT_ACCEPTANCE_OUTPUT_DIR = "docs/acceptance/artifacts";

type GateStatus = "pass" | "blocked" | "fail";
type GateCategory = "safety" | "github-run" | "artifact" | "readiness" | "source-control" | "release-boundary";

interface CommandResult {
  stdout: string;
  stderr: string;
}

type CommandRunner = (command: string, args: string[], options?: { cwd?: string }) => Promise<CommandResult>;

interface GithubRun {
  databaseId: number;
  headSha: string;
  headBranch: string;
  status: string;
  conclusion: string;
  url: string;
  workflowName: string;
  event: string;
  createdAt: string;
  updatedAt: string;
}

interface SourceControlState {
  current_head_sha: string;
  current_branch: string;
  worktree_dirty: boolean;
  porcelain: string[];
}

interface RunArtifactGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_github_run_candidate: boolean;
  blocks_current_worktree_candidate: boolean;
  blocks_github_run_staging_handoff: boolean;
  blocks_current_worktree_staging_handoff: boolean;
  blocks_docker_deploy: boolean;
  required_evidence?: string;
}

interface RunArtifactSummary {
  total: number;
  passed: number;
  blocked: number;
  failed: number;
  github_run_candidate_blockers: string[];
  current_worktree_candidate_blockers: string[];
  github_run_staging_handoff_blockers: string[];
  current_worktree_staging_handoff_blockers: string[];
  docker_deploy_blockers: string[];
}

export interface AdminDockerGithubRunArtifactReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-github-run-artifact";
  repo: string;
  workflow: string;
  artifact_name: string;
  run: GithubRun;
  source_control: SourceControlState;
  artifact_dir: string;
  readiness_report: {
    json_path: string;
    markdown_path: string;
    result_status: string;
    github_candidate_artifact_ready: boolean;
    staging_handoff_ready: boolean;
    docker_deploy_allowed: false;
    failed: number;
  };
  github_run_candidate_ready: boolean;
  current_worktree_candidate_ready: boolean;
  github_run_staging_handoff_ready: boolean;
  current_worktree_staging_handoff_ready: boolean;
  docker_deploy_allowed: false;
  observations: {
    run_successful: boolean;
    run_head_matches_current_head: boolean;
    worktree_clean: boolean;
    readiness_failed: boolean;
    readiness_candidate_blockers: string[];
    readiness_staging_blockers: string[];
  };
  gates: RunArtifactGate[];
  summary: RunArtifactSummary;
  result: {
    status: "current-worktree-staging-handoff-ready" | "current-worktree-candidate-ready" | "github-run-candidate-ready" | "blocked" | "failed";
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

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

function defaultRunner(command: string, args: string[], options: { cwd?: string } = {}): Promise<CommandResult> {
  return execFileAsync(command, args, {
    cwd: options.cwd,
    maxBuffer: 16 * 1024 * 1024
  }).then(({ stdout, stderr }) => ({
    stdout: String(stdout),
    stderr: String(stderr)
  }));
}

function parseGithubRun(value: unknown): GithubRun {
  const record = asRecord(value);

  return {
    databaseId: asNumber(record.databaseId),
    headSha: asString(record.headSha),
    headBranch: asString(record.headBranch),
    status: asString(record.status),
    conclusion: asString(record.conclusion),
    url: asString(record.url),
    workflowName: asString(record.workflowName),
    event: asString(record.event),
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt)
  };
}

function parseLatestRun(stdout: string): GithubRun | null {
  const runs = JSON.parse(stdout) as unknown;
  const first = asArray(runs)[0];

  return first ? parseGithubRun(first) : null;
}

function gate(input: RunArtifactGate): RunArtifactGate {
  return input;
}

function summarize(gates: RunArtifactGate[]): RunArtifactSummary {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    failed: gates.filter((item) => item.status === "fail").length,
    github_run_candidate_blockers: gates
      .filter((item) => item.blocks_github_run_candidate && item.status !== "pass")
      .map((item) => item.id),
    current_worktree_candidate_blockers: gates
      .filter((item) => item.blocks_current_worktree_candidate && item.status !== "pass")
      .map((item) => item.id),
    github_run_staging_handoff_blockers: gates
      .filter((item) => item.blocks_github_run_staging_handoff && item.status !== "pass")
      .map((item) => item.id),
    current_worktree_staging_handoff_blockers: gates
      .filter((item) => item.blocks_current_worktree_staging_handoff && item.status !== "pass")
      .map((item) => item.id),
    docker_deploy_blockers: gates
      .filter((item) => item.blocks_docker_deploy && item.status !== "pass")
      .map((item) => item.id)
  };
}

function nextActions(input: {
  summary: RunArtifactSummary;
  run: GithubRun;
  source: SourceControlState;
  readiness: AdminDockerGithubArtifactReadinessReport;
}): string[] {
  const actions: string[] = [];

  if (input.summary.failed > 0) {
    actions.push("Fix failed safety gates before using this GitHub run as Docker MVP evidence.");
  }

  if (input.summary.github_run_candidate_blockers.includes("github-run-successful")) {
    actions.push("Open the GitHub Actions run logs and fix the failed Admin Docker workflow step before reviewing release-gate artifacts.");
  }

  if (input.summary.github_run_candidate_blockers.includes("github-artifact-candidate-ready")) {
    actions.push("Use the generated admin-docker-github-artifact-readiness report to clear candidate artifact blockers.");
  }

  if (input.summary.current_worktree_candidate_blockers.includes("run-head-matches-current-head")) {
    actions.push(`Push the current candidate commit or rerun the workflow for the current HEAD; run head is ${input.run.headSha || "<missing>"} and local HEAD is ${input.source.current_head_sha || "<missing>"}.`);
  }

  if (input.summary.current_worktree_candidate_blockers.includes("current-worktree-clean")) {
    actions.push("Archive or commit the current candidate changes before treating a remote run as proof for this exact worktree.");
  }

  if (input.summary.github_run_staging_handoff_blockers.includes("github-artifact-staging-handoff-ready")) {
    actions.push("For staging handoff, rerun workflow_dispatch with push_images=true plus current/rollback tags after candidate artifact readiness is green.");
  }

  if (input.readiness.summary.staging_handoff_blockers.length > 0) {
    actions.push(`Staging blockers from readiness: ${input.readiness.summary.staging_handoff_blockers.join(", ")}.`);
  }

  if (actions.length === 0) {
    actions.push("GitHub run artifact is ready for the next separate staging/live/Cutter validation step; Docker deploy remains blocked by design.");
  }

  return actions;
}

export function buildAdminDockerGithubRunArtifactReport(input: {
  generated_at: string;
  command: string;
  repo: string;
  workflow: string;
  artifact_name: string;
  run: GithubRun;
  source_control: SourceControlState;
  artifact_dir: string;
  readiness_report: AdminDockerGithubArtifactReadinessReport;
}): AdminDockerGithubRunArtifactReport {
  const runSuccessful = input.run.status === "completed" && input.run.conclusion === "success";
  const runHeadMatchesCurrentHead = Boolean(input.run.headSha)
    && Boolean(input.source_control.current_head_sha)
    && input.run.headSha === input.source_control.current_head_sha;
  const worktreeClean = !input.source_control.worktree_dirty;
  const readinessFailed = input.readiness_report.summary.failed > 0;
  const readinessArtifacts = input.readiness_report.artifacts;
  const gates: RunArtifactGate[] = [
    gate({
      id: "github-run-artifact-no-side-effects",
      title: "GitHub run artifact collection is read-only",
      category: "safety",
      status: "pass",
      evidence: "Uses gh run view/download and local JSON validation only; does not contact NAS, Docker daemon, Windows Runner, Cutter, or Admin runtime services.",
      blocks_github_run_candidate: false,
      blocks_current_worktree_candidate: false,
      blocks_github_run_staging_handoff: false,
      blocks_current_worktree_staging_handoff: false,
      blocks_docker_deploy: false
    }),
    gate({
      id: "github-run-successful",
      title: "GitHub Admin Docker workflow completed successfully",
      category: "github-run",
      status: runSuccessful ? "pass" : "blocked",
      evidence: `status=${input.run.status || "<missing>"}, conclusion=${input.run.conclusion || "<missing>"}, url=${input.run.url || "<missing>"}`,
      blocks_github_run_candidate: true,
      blocks_current_worktree_candidate: true,
      blocks_github_run_staging_handoff: true,
      blocks_current_worktree_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: "Run the Build Admin Docker Images workflow to completion with release-gate artifacts uploaded."
    }),
    gate({
      id: "release-gates-artifact-downloaded",
      title: "Release-gates artifact was downloaded",
      category: "artifact",
      status: input.artifact_dir ? "pass" : "blocked",
      evidence: input.artifact_dir || "artifact directory is missing",
      blocks_github_run_candidate: true,
      blocks_current_worktree_candidate: true,
      blocks_github_run_staging_handoff: true,
      blocks_current_worktree_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: `Download ${input.artifact_name} from the Admin Docker GitHub Actions run.`
    }),
    gate({
      id: "github-artifact-readiness-generated",
      title: "GitHub artifact readiness report was generated",
      category: "readiness",
      status: readinessFailed ? "fail" : readinessArtifacts?.json_path ? "pass" : "blocked",
      evidence: readinessArtifacts?.json_path ?? "readiness report was not written",
      blocks_github_run_candidate: true,
      blocks_current_worktree_candidate: true,
      blocks_github_run_staging_handoff: true,
      blocks_current_worktree_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: "Run validate:admin-docker-github-artifact-readiness against the downloaded release-gates artifact."
    }),
    gate({
      id: "github-artifact-candidate-ready",
      title: "Downloaded artifact proves a smoked Docker candidate",
      category: "readiness",
      status: input.readiness_report.github_candidate_artifact_ready ? "pass" : "blocked",
      evidence: `github_candidate_artifact_ready=${String(input.readiness_report.github_candidate_artifact_ready)}, result=${input.readiness_report.result.status}`,
      blocks_github_run_candidate: true,
      blocks_current_worktree_candidate: true,
      blocks_github_run_staging_handoff: true,
      blocks_current_worktree_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: "The artifact readiness report must have github_candidate_artifact_ready:true."
    }),
    gate({
      id: "github-artifact-staging-handoff-ready",
      title: "Downloaded artifact proves staging handoff readiness",
      category: "readiness",
      status: input.readiness_report.staging_handoff_ready ? "pass" : "blocked",
      evidence: `staging_handoff_ready=${String(input.readiness_report.staging_handoff_ready)}, blockers=${input.readiness_report.summary.staging_handoff_blockers.join(", ") || "none"}`,
      blocks_github_run_candidate: false,
      blocks_current_worktree_candidate: false,
      blocks_github_run_staging_handoff: true,
      blocks_current_worktree_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: "The artifact readiness report must have staging_handoff_ready:true before staging handoff."
    }),
    gate({
      id: "run-head-matches-current-head",
      title: "GitHub run head matches current local HEAD",
      category: "source-control",
      status: runHeadMatchesCurrentHead ? "pass" : "blocked",
      evidence: `run.headSha=${input.run.headSha || "<missing>"}, local.head=${input.source_control.current_head_sha || "<missing>"}`,
      blocks_github_run_candidate: false,
      blocks_current_worktree_candidate: true,
      blocks_github_run_staging_handoff: false,
      blocks_current_worktree_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: "Run the workflow against the same commit being reviewed locally."
    }),
    gate({
      id: "current-worktree-clean",
      title: "Current local worktree has no uncommitted candidate drift",
      category: "source-control",
      status: worktreeClean ? "pass" : "blocked",
      evidence: worktreeClean ? "git status --porcelain is empty" : `${input.source_control.porcelain.length} changed path(s) are present`,
      blocks_github_run_candidate: false,
      blocks_current_worktree_candidate: true,
      blocks_github_run_staging_handoff: false,
      blocks_current_worktree_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: "Commit/archive the candidate changes before treating a remote run as proof for the current worktree."
    }),
    gate({
      id: "run-artifact-does-not-approve-deploy",
      title: "Run artifact report does not approve Docker deploy",
      category: "release-boundary",
      status: input.readiness_report.docker_deploy_allowed === false ? "pass" : "fail",
      evidence: `readiness.docker_deploy_allowed=${String(input.readiness_report.docker_deploy_allowed)}`,
      blocks_github_run_candidate: true,
      blocks_current_worktree_candidate: true,
      blocks_github_run_staging_handoff: true,
      blocks_current_worktree_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: "Artifact/run reports must remain evidence reports, not deploy approvals."
    })
  ];
  const summary = summarize(gates);
  const githubRunCandidateReady = summary.failed === 0 && summary.github_run_candidate_blockers.length === 0;
  const currentWorktreeCandidateReady = summary.failed === 0 && summary.current_worktree_candidate_blockers.length === 0;
  const githubRunStagingHandoffReady = summary.failed === 0 && summary.github_run_staging_handoff_blockers.length === 0;
  const currentWorktreeStagingHandoffReady = summary.failed === 0 && summary.current_worktree_staging_handoff_blockers.length === 0;
  const resultStatus = summary.failed > 0
    ? "failed"
    : currentWorktreeStagingHandoffReady
      ? "current-worktree-staging-handoff-ready"
      : currentWorktreeCandidateReady
        ? "current-worktree-candidate-ready"
        : githubRunCandidateReady
          ? "github-run-candidate-ready"
          : "blocked";
  const report: AdminDockerGithubRunArtifactReport = {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-github-run-artifact",
    repo: input.repo,
    workflow: input.workflow,
    artifact_name: input.artifact_name,
    run: input.run,
    source_control: input.source_control,
    artifact_dir: input.artifact_dir,
    readiness_report: {
      json_path: readinessArtifacts?.json_path ?? "",
      markdown_path: readinessArtifacts?.markdown_path ?? "",
      result_status: input.readiness_report.result.status,
      github_candidate_artifact_ready: input.readiness_report.github_candidate_artifact_ready,
      staging_handoff_ready: input.readiness_report.staging_handoff_ready,
      docker_deploy_allowed: false,
      failed: input.readiness_report.summary.failed
    },
    github_run_candidate_ready: githubRunCandidateReady,
    current_worktree_candidate_ready: currentWorktreeCandidateReady,
    github_run_staging_handoff_ready: githubRunStagingHandoffReady,
    current_worktree_staging_handoff_ready: currentWorktreeStagingHandoffReady,
    docker_deploy_allowed: false,
    observations: {
      run_successful: runSuccessful,
      run_head_matches_current_head: runHeadMatchesCurrentHead,
      worktree_clean: worktreeClean,
      readiness_failed: readinessFailed,
      readiness_candidate_blockers: input.readiness_report.summary.candidate_artifact_blockers,
      readiness_staging_blockers: input.readiness_report.summary.staging_handoff_blockers
    },
    gates,
    summary,
    result: {
      status: resultStatus,
      summary: resultStatus === "failed"
        ? "GitHub run artifact evidence failed a safety gate."
        : resultStatus === "current-worktree-staging-handoff-ready"
          ? "GitHub run artifact matches the current clean worktree and is ready for staging handoff; Docker deploy is still not approved."
          : resultStatus === "current-worktree-candidate-ready"
            ? "GitHub run artifact proves the current clean worktree has a smoked Docker candidate; staging and deploy remain separately gated."
            : resultStatus === "github-run-candidate-ready"
              ? "GitHub run artifact proves its remote commit has a smoked Docker candidate, but it does not yet prove the current local worktree."
              : "GitHub run artifact evidence is blocked until workflow, artifact, readiness, or source-control gates are satisfied."
    },
    next_actions: [],
    artifacts: null
  };

  return {
    ...report,
    next_actions: nextActions({
      summary,
      run: input.run,
      source: input.source_control,
      readiness: input.readiness_report
    })
  };
}

export function toMarkdown(report: AdminDockerGithubRunArtifactReport): string {
  const lines = [
    "# Admin Docker GitHub Run Artifact Evidence",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Repo: ${report.repo}`,
    `Workflow: ${report.workflow}`,
    `Run: ${report.run.databaseId || "<missing>"}`,
    `Run URL: ${report.run.url || "<missing>"}`,
    "",
    "## Decision",
    "",
    `- GitHub run candidate ready: ${report.github_run_candidate_ready ? "yes" : "no"}`,
    `- Current worktree candidate ready: ${report.current_worktree_candidate_ready ? "yes" : "no"}`,
    `- GitHub run staging handoff ready: ${report.github_run_staging_handoff_ready ? "yes" : "no"}`,
    `- Current worktree staging handoff ready: ${report.current_worktree_staging_handoff_ready ? "yes" : "no"}`,
    "- Docker deploy allowed: no",
    `- Result: ${report.result.status}`,
    `- Summary: ${report.result.summary}`,
    "",
    "## Run",
    "",
    `- Status: ${report.run.status || "<missing>"}`,
    `- Conclusion: ${report.run.conclusion || "<missing>"}`,
    `- Head branch: ${report.run.headBranch || "<missing>"}`,
    `- Head SHA: ${report.run.headSha || "<missing>"}`,
    `- Event: ${report.run.event || "<missing>"}`,
    "",
    "## Source Control",
    "",
    `- Local branch: ${report.source_control.current_branch || "<missing>"}`,
    `- Local HEAD: ${report.source_control.current_head_sha || "<missing>"}`,
    `- Worktree dirty: ${report.source_control.worktree_dirty ? "yes" : "no"}`,
    `- Changed paths: ${report.source_control.porcelain.length}`,
    "",
    "## Artifact Readiness",
    "",
    `- Artifact dir: ${report.artifact_dir}`,
    `- Readiness JSON: ${report.readiness_report.json_path || "<missing>"}`,
    `- Readiness Markdown: ${report.readiness_report.markdown_path || "<missing>"}`,
    `- Readiness result: ${report.readiness_report.result_status}`,
    `- Readiness failed gates: ${report.readiness_report.failed}`,
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks run candidate | Blocks current candidate | Blocks run staging | Blocks current staging | Blocks deploy | Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => `| ${item.id} | ${item.category} | ${item.status} | ${item.blocks_github_run_candidate ? "yes" : "no"} | ${item.blocks_current_worktree_candidate ? "yes" : "no"} | ${item.blocks_github_run_staging_handoff ? "yes" : "no"} | ${item.blocks_current_worktree_staging_handoff ? "yes" : "no"} | ${item.blocks_docker_deploy ? "yes" : "no"} | ${item.evidence.replace(/\|/g, "/")} |`),
    "",
    "## Blockers",
    "",
    `- GitHub run candidate blockers: ${report.summary.github_run_candidate_blockers.join(", ") || "none"}`,
    `- Current worktree candidate blockers: ${report.summary.current_worktree_candidate_blockers.join(", ") || "none"}`,
    `- GitHub run staging blockers: ${report.summary.github_run_staging_handoff_blockers.join(", ") || "none"}`,
    `- Current worktree staging blockers: ${report.summary.current_worktree_staging_handoff_blockers.join(", ") || "none"}`,
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

async function currentBranch(runner: CommandRunner): Promise<string> {
  const result = await runner("git", ["branch", "--show-current"]);
  return result.stdout.trim();
}

async function currentSourceState(runner: CommandRunner): Promise<SourceControlState> {
  const [head, branch, porcelain] = await Promise.all([
    runner("git", ["rev-parse", "HEAD"]),
    runner("git", ["branch", "--show-current"]),
    runner("git", ["status", "--porcelain"])
  ]);
  const lines = porcelain.stdout.split(/\r?\n/).filter(Boolean);

  return {
    current_head_sha: head.stdout.trim(),
    current_branch: branch.stdout.trim(),
    worktree_dirty: lines.length > 0,
    porcelain: lines
  };
}

async function resolveRun(input: {
  run_id?: string;
  repo: string;
  workflow: string;
  branch: string;
  runner: CommandRunner;
}): Promise<GithubRun> {
  if (input.run_id) {
    const view = await input.runner("gh", [
      "run",
      "view",
      input.run_id,
      "--repo",
      input.repo,
      "--json",
      "databaseId,headSha,headBranch,status,conclusion,url,workflowName,event,createdAt,updatedAt"
    ]);

    return parseGithubRun(JSON.parse(view.stdout) as unknown);
  }

  const list = await input.runner("gh", [
    "run",
    "list",
    "--repo",
    input.repo,
    "--workflow",
    input.workflow,
    "--branch",
    input.branch,
    "--limit",
    "1",
    "--json",
    "databaseId,headSha,headBranch,status,conclusion,url,workflowName,event,createdAt,updatedAt"
  ]);
  const latest = parseLatestRun(list.stdout);

  if (!latest) {
    throw new Error(`No GitHub Actions run found for ${input.workflow} on ${input.branch}.`);
  }

  return latest;
}

export async function runGithubRunArtifactEvidence(input: {
  run_id?: string;
  repo?: string;
  workflow?: string;
  artifact_name?: string;
  output_root?: string;
  acceptance_output_dir?: string;
  generated_at?: string;
  command?: string;
  runner?: CommandRunner;
} = {}): Promise<AdminDockerGithubRunArtifactReport> {
  const runner = input.runner ?? defaultRunner;
  const repo = input.repo ?? DEFAULT_REPO;
  const workflow = input.workflow ?? DEFAULT_WORKFLOW;
  const artifactName = input.artifact_name ?? DEFAULT_ARTIFACT_NAME;
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const branch = process.env.MIXLAB_ADMIN_DOCKER_GITHUB_REF ?? await currentBranch(runner);
  const run = await resolveRun({
    run_id: input.run_id,
    repo,
    workflow,
    branch,
    runner
  });
  const runId = String(run.databaseId || input.run_id || "unknown-run");
  const outputRoot = input.output_root ?? DEFAULT_OUTPUT_ROOT;
  const runRoot = path.join(outputRoot, runId);
  const artifactDir = path.join(runRoot, artifactName);
  const acceptanceOutputDir = input.acceptance_output_dir ?? DEFAULT_ACCEPTANCE_OUTPUT_DIR;
  const sourceControl = await currentSourceState(runner);

  await rm(artifactDir, { recursive: true, force: true });
  await mkdir(artifactDir, { recursive: true });
  await runner("gh", [
    "run",
    "download",
    runId,
    "--repo",
    repo,
    "--name",
    artifactName,
    "--dir",
    artifactDir
  ]);

  const readiness = await runGithubArtifactReadiness({
    artifact_dir: artifactDir,
    output_dir: acceptanceOutputDir,
    generated_at: generatedAt,
    command: `downloaded from ${repo} run ${runId}`
  });
  const report = buildAdminDockerGithubRunArtifactReport({
    generated_at: generatedAt,
    command: input.command ?? process.argv.join(" "),
    repo,
    workflow,
    artifact_name: artifactName,
    run,
    source_control: sourceControl,
    artifact_dir: artifactDir,
    readiness_report: readiness
  });
  const timestamp = timestampForFile(new Date(generatedAt));
  const jsonPath = path.join(acceptanceOutputDir, `admin-docker-github-run-artifact-${timestamp}.json`);
  const markdownPath = path.join(acceptanceOutputDir, `admin-docker-github-run-artifact-${timestamp}.md`);
  const reportWithArtifacts: AdminDockerGithubRunArtifactReport = {
    ...report,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };

  await mkdir(acceptanceOutputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(reportWithArtifacts, null, 2)}\n`);
  await writeFile(markdownPath, toMarkdown(reportWithArtifacts));

  return reportWithArtifacts;
}

async function main(): Promise<void> {
  const report = await runGithubRunArtifactEvidence({
    run_id: process.env.MIXLAB_ADMIN_DOCKER_GITHUB_RUN_ID ?? process.argv[2],
    repo: process.env.MIXLAB_ADMIN_DOCKER_GITHUB_REPO,
    workflow: process.env.MIXLAB_ADMIN_DOCKER_GITHUB_WORKFLOW,
    artifact_name: process.env.MIXLAB_ADMIN_DOCKER_GITHUB_ARTIFACT,
    output_root: process.env.MIXLAB_ADMIN_DOCKER_GITHUB_OUTPUT_ROOT,
    acceptance_output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    run_id: report.run.databaseId,
    run_url: report.run.url,
    github_run_candidate_ready: report.github_run_candidate_ready,
    current_worktree_candidate_ready: report.current_worktree_candidate_ready,
    github_run_staging_handoff_ready: report.github_run_staging_handoff_ready,
    current_worktree_staging_handoff_ready: report.current_worktree_staging_handoff_ready,
    docker_deploy_allowed: report.docker_deploy_allowed,
    current_worktree_candidate_blockers: report.summary.current_worktree_candidate_blockers,
    json_path: report.artifacts?.json_path,
    markdown_path: report.artifacts?.markdown_path
  }, null, 2));

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
