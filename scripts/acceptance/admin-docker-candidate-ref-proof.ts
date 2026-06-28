import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";

type GateStatus = "pass" | "blocked" | "fail";
type GateCategory = "safety" | "candidate-ref" | "github-run" | "smoke" | "release-boundary";

interface CandidateRefGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_candidate_ref_proof: boolean;
  blocks_docker_deploy: boolean;
  required_evidence?: string;
}

interface CandidateRefSummary {
  total: number;
  passed: number;
  blocked: number;
  failed: number;
  candidate_ref_blockers: string[];
  docker_deploy_blockers: string[];
}

interface GitHubRunRecord {
  databaseId: number;
  headSha: string;
  headBranch: string;
  status: string;
  conclusion: string;
  url: string;
  workflowName: string;
  event: string;
}

export interface AdminDockerCandidateRefProofReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-candidate-ref-proof";
  sources: {
    artifact_dir: string;
    local_smoke_report: string;
    staging_runbook_report: string;
    github_run_id: string;
    remote_tag_ref: string;
  };
  candidate_ref_proof_accepted: boolean;
  docker_deploy_allowed: false;
  candidate: {
    expected_sha: string;
    expected_tag: string;
    remote_tag_sha: string;
    tag_points_to_expected_sha: boolean;
  };
  github_run: GitHubRunRecord;
  observations: {
    tag_name_matches_sha: boolean;
    run_head_matches_tag: boolean;
    run_head_matches_sha: boolean;
    local_smoke_passed: boolean | null;
    local_smoke_image_tag: string;
    local_smoke_build_sha: string;
    local_smoke_matches_candidate: boolean;
    staging_target_image_tag: string;
    staging_target_matches_candidate: boolean;
    staging_execution_ready: boolean | null;
    image_push_approval_accepted: boolean | null;
    staging_docker_deploy_allowed: boolean | null;
  };
  gates: CandidateRefGate[];
  summary: CandidateRefSummary;
  next_actions: string[];
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

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function gate(input: CandidateRefGate): CandidateRefGate {
  return input;
}

function summarize(gates: CandidateRefGate[]): CandidateRefSummary {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    failed: gates.filter((item) => item.status === "fail").length,
    candidate_ref_blockers: gates
      .filter((item) => item.blocks_candidate_ref_proof && item.status !== "pass")
      .map((item) => item.id),
    docker_deploy_blockers: gates
      .filter((item) => item.blocks_docker_deploy && item.status !== "pass")
      .map((item) => item.id)
  };
}

function expectedTagForSha(sha: string): string {
  return sha ? `admin-docker-candidate-${sha}` : "";
}

function remoteTagShaFromLsRemote(output: string): string {
  const line = output.split(/\r?\n/).find((item) => item.trim());
  const [sha = ""] = line?.trim().split(/\s+/) ?? [];

  return sha;
}

function githubRunRecord(value: unknown): GitHubRunRecord {
  const record = asRecord(value);

  return {
    databaseId: asNumber(record.databaseId),
    headSha: asString(record.headSha),
    headBranch: asString(record.headBranch),
    status: asString(record.status),
    conclusion: asString(record.conclusion),
    url: asString(record.url),
    workflowName: asString(record.workflowName),
    event: asString(record.event)
  };
}

function nextActions(input: {
  accepted: boolean;
  candidate_ref_blockers: string[];
  expected_tag: string;
  expected_sha: string;
}): string[] {
  if (!input.accepted) {
    return [
      `Keep push_images=false until candidate ref proof is accepted; blockers: ${input.candidate_ref_blockers.join(", ") || "unknown"}.`,
      `Create or verify ${input.expected_tag || "<candidate-tag>"} points at ${input.expected_sha || "<candidate-sha>"} before running release inputs.`,
      "Rerun the Admin Docker workflow with the candidate tag and push_images=false, then regenerate this proof."
    ];
  }

  return [
    `Candidate release ref ${input.expected_tag} is pinned to ${input.expected_sha} and has a successful push_images=false dry-run.`,
    "Do not run push_images=true until NAS image proof, current/rollback tags, disk proof, worker proof, Cutter proof, and explicit release approval are present.",
    "After any push_images=true run, regenerate GitHub run artifact, staging runbook, live-readonly, admin-worker env proof, and Cutter compatibility proof."
  ];
}

export function buildAdminDockerCandidateRefProofReport(input: {
  generated_at: string;
  command: string;
  candidate_sha: string;
  candidate_tag: string;
  artifact_dir?: string;
  local_smoke_report_path?: string;
  local_smoke_report?: unknown;
  staging_runbook_report_path?: string;
  staging_runbook_report?: unknown;
  github_run_id?: string;
  github_run?: unknown;
  remote_tag_output?: string;
}): AdminDockerCandidateRefProofReport {
  const expectedSha = input.candidate_sha;
  const expectedTag = expectedTagForSha(expectedSha);
  const candidateTag = input.candidate_tag;
  const remoteTagSha = remoteTagShaFromLsRemote(input.remote_tag_output ?? "");
  const localSmoke = asRecord(input.local_smoke_report);
  const localSmokeBuild = asRecord(localSmoke.build_identity);
  const staging = asRecord(input.staging_runbook_report);
  const imageTags = asRecord(staging.image_tags);
  const imagePushApproval = asRecord(staging.image_push_approval);
  const run = githubRunRecord(input.github_run);
  const localSmokePassed = asBoolean(localSmoke.local_smoke_passed);
  const localSmokeImageTag = asString(localSmokeBuild.image_tag);
  const localSmokeBuildSha = asString(localSmokeBuild.build_sha);
  const stagingTarget = asString(imageTags.target);
  const stagingExecutionReady = asBoolean(staging.staging_execution_ready);
  const stagingDeployAllowed = asBoolean(staging.docker_deploy_allowed);
  const imagePushApprovalAccepted = asBoolean(imagePushApproval.accepted);
  const tagNameMatchesSha = Boolean(expectedSha && candidateTag === expectedTag);
  const tagPointsToExpectedSha = Boolean(expectedSha && remoteTagSha === expectedSha);
  const runHeadMatchesTag = Boolean(candidateTag && run.headBranch === candidateTag);
  const runHeadMatchesSha = Boolean(expectedSha && run.headSha === expectedSha);
  const localSmokeMatchesCandidate = Boolean(
    expectedSha &&
    localSmokeImageTag === expectedSha &&
    localSmokeBuildSha === expectedSha
  );
  const stagingTargetMatchesCandidate = Boolean(expectedSha && stagingTarget === expectedSha);
  const gates = [
    gate({
      id: "candidate-ref-proof-no-side-effects",
      title: "Candidate ref proof is read-only",
      category: "safety",
      status: "pass",
      evidence: "Reads git tag, GitHub run metadata, and downloaded artifacts only; does not push images, contact NAS, restart containers, enable workers, or write NAS data.",
      blocks_candidate_ref_proof: false,
      blocks_docker_deploy: false
    }),
    gate({
      id: "candidate-sha-provided",
      title: "Candidate SHA is explicit",
      category: "candidate-ref",
      status: expectedSha ? "pass" : "blocked",
      evidence: expectedSha || "MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_SHA is missing.",
      blocks_candidate_ref_proof: !expectedSha,
      blocks_docker_deploy: true,
      required_evidence: "Provide the exact smoked candidate commit SHA."
    }),
    gate({
      id: "candidate-tag-pins-sha-name",
      title: "Candidate tag name pins the candidate SHA",
      category: "candidate-ref",
      status: tagNameMatchesSha ? "pass" : "blocked",
      evidence: `tag=${candidateTag || "missing"}, expected=${expectedTag || "missing"}`,
      blocks_candidate_ref_proof: !tagNameMatchesSha,
      blocks_docker_deploy: true,
      required_evidence: "Use tag name admin-docker-candidate-<40-char candidate SHA>."
    }),
    gate({
      id: "remote-tag-points-to-candidate-sha",
      title: "Remote tag points to the candidate SHA",
      category: "candidate-ref",
      status: tagPointsToExpectedSha ? "pass" : "blocked",
      evidence: `remote_tag_sha=${remoteTagSha || "missing"}, expected=${expectedSha || "missing"}`,
      blocks_candidate_ref_proof: !tagPointsToExpectedSha,
      blocks_docker_deploy: true,
      required_evidence: "Run git ls-remote --tags origin refs/tags/admin-docker-candidate-<sha> and require it to resolve to the candidate SHA."
    }),
    gate({
      id: "github-run-succeeded",
      title: "GitHub dry-run completed successfully",
      category: "github-run",
      status: run.status === "completed" && run.conclusion === "success" ? "pass" : "blocked",
      evidence: `status=${run.status || "missing"}, conclusion=${run.conclusion || "missing"}, run=${run.url || input.github_run_id || "missing"}`,
      blocks_candidate_ref_proof: !(run.status === "completed" && run.conclusion === "success"),
      blocks_docker_deploy: true,
      required_evidence: "Run the Admin Docker workflow from the candidate tag with push_images=false and require success."
    }),
    gate({
      id: "github-run-head-matches-candidate-tag",
      title: "GitHub run was dispatched from the candidate tag",
      category: "github-run",
      status: runHeadMatchesTag ? "pass" : "blocked",
      evidence: `run.headBranch=${run.headBranch || "missing"}, expected_tag=${candidateTag || "missing"}`,
      blocks_candidate_ref_proof: !runHeadMatchesTag,
      blocks_docker_deploy: true,
      required_evidence: "The GitHub run headBranch must be the candidate release tag, not a moving branch."
    }),
    gate({
      id: "github-run-head-matches-candidate-sha",
      title: "GitHub run head SHA matches candidate SHA",
      category: "github-run",
      status: runHeadMatchesSha ? "pass" : "blocked",
      evidence: `run.headSha=${run.headSha || "missing"}, expected_sha=${expectedSha || "missing"}`,
      blocks_candidate_ref_proof: !runHeadMatchesSha,
      blocks_docker_deploy: true,
      required_evidence: "The GitHub run headSha must equal the candidate SHA."
    }),
    gate({
      id: "local-docker-smoke-passed",
      title: "Candidate tag run passed local Docker smoke",
      category: "smoke",
      status: localSmokePassed === true ? "pass" : "blocked",
      evidence: `local_smoke_passed=${String(localSmokePassed)}`,
      blocks_candidate_ref_proof: localSmokePassed !== true,
      blocks_docker_deploy: true,
      required_evidence: "The downloaded admin-docker-local-smoke report must have local_smoke_passed:true."
    }),
    gate({
      id: "local-smoke-identity-matches-candidate",
      title: "Local smoke build identity matches candidate SHA",
      category: "smoke",
      status: localSmokeMatchesCandidate ? "pass" : "blocked",
      evidence: `image_tag=${localSmokeImageTag || "missing"}, build_sha=${localSmokeBuildSha || "missing"}, expected=${expectedSha || "missing"}`,
      blocks_candidate_ref_proof: !localSmokeMatchesCandidate,
      blocks_docker_deploy: true,
      required_evidence: "The local smoke build_identity.image_tag and build_identity.build_sha must equal the candidate SHA."
    }),
    gate({
      id: "staging-target-matches-candidate",
      title: "Staging target image tag matches candidate SHA",
      category: "release-boundary",
      status: stagingTargetMatchesCandidate ? "pass" : "blocked",
      evidence: `staging_target=${stagingTarget || "missing"}, expected=${expectedSha || "missing"}`,
      blocks_candidate_ref_proof: !stagingTargetMatchesCandidate,
      blocks_docker_deploy: true,
      required_evidence: "The staging runbook target image tag must match the candidate SHA."
    }),
    gate({
      id: "tag-dry-run-does-not-approve-push-or-deploy",
      title: "Tag dry-run does not approve push or deploy",
      category: "release-boundary",
      status: imagePushApprovalAccepted === false && stagingDeployAllowed === false ? "pass" : "fail",
      evidence: `image_push_approval.accepted=${String(imagePushApprovalAccepted)}, staging.docker_deploy_allowed=${String(stagingDeployAllowed)}`,
      blocks_candidate_ref_proof: true,
      blocks_docker_deploy: true,
      required_evidence: "The tag-ref dry-run must remain push_images=false evidence only, with Docker deploy still disallowed."
    })
  ];
  const summary = summarize(gates);
  const accepted = summary.failed === 0 && summary.candidate_ref_blockers.length === 0;

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-candidate-ref-proof",
    sources: {
      artifact_dir: input.artifact_dir ?? "",
      local_smoke_report: input.local_smoke_report_path ?? "",
      staging_runbook_report: input.staging_runbook_report_path ?? "",
      github_run_id: input.github_run_id ?? "",
      remote_tag_ref: candidateTag ? `refs/tags/${candidateTag}` : ""
    },
    candidate_ref_proof_accepted: accepted,
    docker_deploy_allowed: false,
    candidate: {
      expected_sha: expectedSha,
      expected_tag: expectedTag,
      remote_tag_sha: remoteTagSha,
      tag_points_to_expected_sha: tagPointsToExpectedSha
    },
    github_run: run,
    observations: {
      tag_name_matches_sha: tagNameMatchesSha,
      run_head_matches_tag: runHeadMatchesTag,
      run_head_matches_sha: runHeadMatchesSha,
      local_smoke_passed: localSmokePassed,
      local_smoke_image_tag: localSmokeImageTag,
      local_smoke_build_sha: localSmokeBuildSha,
      local_smoke_matches_candidate: localSmokeMatchesCandidate,
      staging_target_image_tag: stagingTarget,
      staging_target_matches_candidate: stagingTargetMatchesCandidate,
      staging_execution_ready: stagingExecutionReady,
      image_push_approval_accepted: imagePushApprovalAccepted,
      staging_docker_deploy_allowed: stagingDeployAllowed
    },
    gates,
    summary,
    next_actions: nextActions({
      accepted,
      candidate_ref_blockers: summary.candidate_ref_blockers,
      expected_tag: expectedTag,
      expected_sha: expectedSha
    }),
    result: {
      status: summary.failed > 0 ? "failed" : accepted ? "accepted" : "blocked",
      summary: accepted
        ? "Candidate release ref is pinned to the expected SHA and has a successful push_images=false GitHub dry-run."
        : "Candidate release ref proof is blocked until tag, GitHub run, smoke, and release-boundary evidence align."
    },
    artifacts: null
  };
}

export function toMarkdown(report: AdminDockerCandidateRefProofReport): string {
  const lines = [
    "# Admin Docker Candidate Ref Proof",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Result: ${report.result.status}`,
    `Candidate ref proof accepted: ${report.candidate_ref_proof_accepted ? "yes" : "no"}`,
    "Docker deploy allowed: no",
    "",
    "## Sources",
    "",
    `- Artifact dir: ${report.sources.artifact_dir || "<missing>"}`,
    `- Local smoke report: ${report.sources.local_smoke_report || "<missing>"}`,
    `- Staging runbook report: ${report.sources.staging_runbook_report || "<missing>"}`,
    `- GitHub run id: ${report.sources.github_run_id || "<missing>"}`,
    `- Remote tag ref: ${report.sources.remote_tag_ref || "<missing>"}`,
    "",
    "## Candidate",
    "",
    `- Expected SHA: ${report.candidate.expected_sha || "<missing>"}`,
    `- Expected tag: ${report.candidate.expected_tag || "<missing>"}`,
    `- Remote tag SHA: ${report.candidate.remote_tag_sha || "<missing>"}`,
    `- Tag points to expected SHA: ${report.candidate.tag_points_to_expected_sha ? "yes" : "no"}`,
    "",
    "## GitHub Run",
    "",
    `- Run URL: ${report.github_run.url || "<missing>"}`,
    `- Head branch: ${report.github_run.headBranch || "<missing>"}`,
    `- Head SHA: ${report.github_run.headSha || "<missing>"}`,
    `- Status: ${report.github_run.status || "<missing>"}`,
    `- Conclusion: ${report.github_run.conclusion || "<missing>"}`,
    "",
    "## Observations",
    "",
    `- Local smoke passed: ${String(report.observations.local_smoke_passed)}`,
    `- Local smoke image tag: ${report.observations.local_smoke_image_tag || "<missing>"}`,
    `- Local smoke build SHA: ${report.observations.local_smoke_build_sha || "<missing>"}`,
    `- Staging target image tag: ${report.observations.staging_target_image_tag || "<missing>"}`,
    `- Image push approval accepted: ${String(report.observations.image_push_approval_accepted)}`,
    `- Staging Docker deploy allowed: ${String(report.observations.staging_docker_deploy_allowed)}`,
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Ref Proof | Blocks Deploy | Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => [
      item.id,
      item.category,
      item.status,
      item.blocks_candidate_ref_proof ? "yes" : "no",
      item.blocks_docker_deploy ? "yes" : "no",
      item.evidence.replace(/\|/g, "/")
    ].join(" | ")),
    "",
    "## Summary",
    "",
    `- Candidate ref blockers: ${report.summary.candidate_ref_blockers.join(", ") || "none"}`,
    `- Docker deploy blockers: ${report.summary.docker_deploy_blockers.join(", ") || "none"}`,
    "",
    "## Next Actions",
    "",
    ...report.next_actions.map((item) => `- ${item}`),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "<not-written>"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "<not-written>"}`
  ];

  return `${lines.join("\n")}\n`;
}

async function readJsonFile(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function latestReportPath(dir: string, prefix: string): Promise<string> {
  const files = await readdir(dir);
  const matches = files
    .filter((file) => file.startsWith(`${prefix}-`) && file.endsWith(".json"))
    .sort();

  if (matches.length === 0) {
    throw new Error(`No ${prefix}-*.json report found in ${dir}`);
  }

  return path.join(dir, matches[matches.length - 1]);
}

async function commandOutput(command: string, args: string[]): Promise<string> {
  const result = await execFileAsync(command, args, {
    maxBuffer: 10 * 1024 * 1024
  });

  return result.stdout;
}

async function githubRunView(runId: string, repo: string): Promise<unknown> {
  const output = await commandOutput("gh", [
    "run",
    "view",
    runId,
    "--repo",
    repo,
    "--json",
    "databaseId,headSha,headBranch,status,conclusion,url,workflowName,event,createdAt,updatedAt"
  ]);

  return JSON.parse(output) as unknown;
}

export async function runAdminDockerCandidateRefProof(input: {
  candidate_sha: string;
  candidate_tag?: string;
  github_run_id: string;
  artifact_dir: string;
  output_dir?: string;
  repo?: string;
  generated_at?: string;
  command?: string;
}): Promise<AdminDockerCandidateRefProofReport> {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const stamp = timestampForFile(new Date(generatedAt));
  const candidateTag = input.candidate_tag || expectedTagForSha(input.candidate_sha);
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const repo = input.repo ?? "alin155/mixlab";
  const localSmokeReportPath = await latestReportPath(input.artifact_dir, "admin-docker-local-smoke");
  const stagingRunbookPath = await latestReportPath(input.artifact_dir, "admin-docker-staging-runbook");
  const [localSmokeReport, stagingRunbookReport, githubRun, remoteTagOutput] = await Promise.all([
    readJsonFile(localSmokeReportPath),
    readJsonFile(stagingRunbookPath),
    githubRunView(input.github_run_id, repo),
    commandOutput("git", ["ls-remote", "--tags", "origin", `refs/tags/${candidateTag}`])
  ]);
  const report = buildAdminDockerCandidateRefProofReport({
    generated_at: generatedAt,
    command: input.command ?? process.argv.join(" "),
    candidate_sha: input.candidate_sha,
    candidate_tag: candidateTag,
    artifact_dir: input.artifact_dir,
    local_smoke_report_path: localSmokeReportPath,
    local_smoke_report: localSmokeReport,
    staging_runbook_report_path: stagingRunbookPath,
    staging_runbook_report: stagingRunbookReport,
    github_run_id: input.github_run_id,
    github_run: githubRun,
    remote_tag_output: remoteTagOutput
  });
  const jsonPath = path.join(outputDir, `admin-docker-candidate-ref-proof-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-candidate-ref-proof-${stamp}.md`);
  const written = {
    ...report,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(written, null, 2)}\n`);
  await writeFile(markdownPath, toMarkdown(written));

  return written;
}

async function main(): Promise<void> {
  const candidateSha = process.env.MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_SHA ?? "";
  const runId = process.env.MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_RUN_ID ?? process.argv[2] ?? "";
  const artifactDir = process.env.MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_ARTIFACT_DIR ?? "";
  const outputDir = process.env.MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_OUTPUT_DIR;
  const candidateTag = process.env.MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_TAG;

  try {
    const report = await runAdminDockerCandidateRefProof({
      candidate_sha: candidateSha,
      candidate_tag: candidateTag,
      github_run_id: runId,
      artifact_dir: artifactDir,
      output_dir: outputDir,
      repo: process.env.MIXLAB_ADMIN_DOCKER_GITHUB_REPO
    });

    console.log(JSON.stringify({
      mode: report.mode,
      status: report.result.status,
      candidate_ref_proof_accepted: report.candidate_ref_proof_accepted,
      docker_deploy_allowed: report.docker_deploy_allowed,
      expected_sha: report.candidate.expected_sha,
      expected_tag: report.candidate.expected_tag,
      github_run_id: report.sources.github_run_id,
      github_run_url: report.github_run.url,
      candidate_ref_blockers: report.summary.candidate_ref_blockers,
      json_path: report.artifacts?.json_path,
      markdown_path: report.artifacts?.markdown_path
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      mode: "admin-docker-candidate-ref-proof",
      status: "error",
      error: errorMessage(error)
    }, null, 2));
    process.exitCode = 1;
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  void main();
}
