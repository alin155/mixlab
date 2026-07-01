import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_MAX_PATHS_PER_BUCKET = 120;

type ScopeBucket =
  | "mvp_candidate_code"
  | "acceptance_evidence"
  | "planning_docs"
  | "local_generated_artifact"
  | "cutter_impact_review"
  | "unknown_review";

type ScopeSeverity = "candidate" | "evidence" | "exclude" | "review";

interface GitStatusEntry {
  status: string;
  path: string;
  raw: string;
}

interface ScopeRule {
  bucket: ScopeBucket;
  severity: ScopeSeverity;
  reason: string;
  match: (filePath: string) => boolean;
}

interface ScopeItem {
  status: string;
  path: string;
  bucket: ScopeBucket;
  severity: ScopeSeverity;
  reason: string;
}

interface ScopeBucketSummary {
  bucket: ScopeBucket;
  severity: ScopeSeverity;
  count: number;
  paths: string[];
  omitted_count: number;
}

export interface AdminDockerCandidateScopeReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-candidate-scope";
  current_branch: string;
  current_head_sha: string;
  total_changed_paths: number;
  max_paths_per_bucket: number;
  buckets: ScopeBucketSummary[];
  decisions: {
    current_worktree_clean: boolean;
    candidate_scope_review_ready: boolean;
    candidate_selective_commit_ready: boolean;
    remote_workflow_proof_possible_from_current_worktree: boolean;
  };
  blockers: string[];
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

function startsWithAny(filePath: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => filePath === prefix || filePath.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
}

function isAdminDockerAcceptanceArtifact(filePath: string): boolean {
  if (!filePath.startsWith("docs/acceptance/artifacts/")) {
    return false;
  }

  return true;
}

function isAdminDockerNamedAcceptanceArtifact(filePath: string): boolean {
  if (!filePath.startsWith("docs/acceptance/artifacts/")) {
    return false;
  }

  const basename = path.basename(filePath);
  return basename.startsWith("admin-docker-")
    || basename.startsWith("admin-worker-env-proof-")
    || basename.startsWith("admin-cutter-compatibility-proof-")
    || basename.startsWith("admin-api-fixture-fallback-classification-")
    || basename.startsWith("admin-css-governance-classification-")
    || basename.startsWith("admin-web-")
    || basename.startsWith("admin-source-videos-")
    || basename.startsWith("admin-dashboard-")
    || basename.startsWith("admin-confirm-dialog-")
    || basename.startsWith("admin-cutter-users-")
    || basename.startsWith("usage-events-repair-")
    || basename.startsWith("local-admin-preprocess-audit-")
    || basename.startsWith("local-web-")
    || basename.startsWith("m19-runtime-foundation-");
}

const RULES: ScopeRule[] = [
  {
    bucket: "local_generated_artifact",
    severity: "exclude",
    reason: "Local/generated artifact should not be part of the Docker MVP candidate commit.",
    match: (filePath) => startsWithAny(filePath, [
      ".local-dev",
      ".playwright-cli",
      "captures",
      "output",
      "apps/cutter-desktop/src-tauri/gen",
      "apps/cutter-web/public/local-clips"
    ])
  },
  {
    bucket: "acceptance_evidence",
    severity: "evidence",
    reason: "Acceptance artifact documents prior or current verification evidence.",
    match: (filePath) => isAdminDockerAcceptanceArtifact(filePath) || isAdminDockerNamedAcceptanceArtifact(filePath)
  },
  {
    bucket: "planning_docs",
    severity: "evidence",
    reason: "Architecture, environment, or planning document that describes the MVP contract or observed environment.",
    match: (filePath) => filePath === "docs/operations/mixlab-environment-registry.md"
      || filePath.startsWith("docs/architecture/admin-docker")
      || filePath.startsWith("docs/architecture/admin-architecture")
  },
  {
    bucket: "acceptance_evidence",
    severity: "evidence",
    reason: "Cutter test-only change verifies Phase 5 compatibility without changing Cutter runtime code.",
    match: (filePath) => filePath.startsWith("packages/cutter-api/")
      && filePath.endsWith(".test.ts")
  },
  {
    bucket: "mvp_candidate_code",
    severity: "candidate",
    reason: "Code/config/test surface explicitly inside Admin Docker MVP v0.1 scope.",
    match: (filePath) => filePath === ".github/workflows/docker-admin.yml"
      || filePath === ".gitignore"
      || filePath === "package.json"
      || startsWithAny(filePath, [
        "apps/admin-web",
        "deploy/nas/mixlab",
        "docker",
        "packages/admin-api",
        "packages/library-fs",
        "packages/preprocess-core",
        "packages/runtime-config",
        "packages/ui-foundation",
        "scripts/acceptance",
        "scripts/dev",
        "scripts/docker",
        "scripts/visual",
        "scripts/servers/admin-api-server.ts",
        "scripts/workers/preprocess-library-worker.ts",
        "scripts/workers/publish-ready-worker.ts"
      ])
  },
  {
    bucket: "cutter_impact_review",
    severity: "review",
    reason: "Cutter runtime changes can affect Phase 5 and need explicit compatibility review before entering an Admin Docker candidate.",
    match: (filePath) => startsWithAny(filePath, [
      "apps/cutter-web",
      "apps/cutter-desktop",
      "packages/cutter-api",
      "packages/searchd"
    ])
  }
];

function parsePorcelain(input: string): GitStatusEntry[] {
  return input.split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const rawPath = line.slice(3);
      const renameMarker = " -> ";
      const filePath = rawPath.includes(renameMarker) ? rawPath.split(renameMarker).at(-1) ?? rawPath : rawPath;

      return {
        status: line.slice(0, 2),
        path: filePath,
        raw: line
      };
    });
}

function classifyPath(filePath: string): Omit<ScopeItem, "status" | "path"> {
  const rule = RULES.find((item) => item.match(filePath));

  if (rule) {
    return {
      bucket: rule.bucket,
      severity: rule.severity,
      reason: rule.reason
    };
  }

  return {
    bucket: "unknown_review",
    severity: "review",
    reason: "Path is outside the known Admin Docker MVP candidate/evidence scope and needs review before commit or push."
  };
}

export function buildAdminDockerCandidateScopeReport(input: {
  generated_at: string;
  command: string;
  current_branch: string;
  current_head_sha: string;
  porcelain: string;
  max_paths_per_bucket?: number;
}): AdminDockerCandidateScopeReport {
  const maxPaths = input.max_paths_per_bucket ?? DEFAULT_MAX_PATHS_PER_BUCKET;
  const entries = parsePorcelain(input.porcelain);
  const items = entries.map((entry): ScopeItem => ({
    status: entry.status,
    path: entry.path,
    ...classifyPath(entry.path)
  }));
  const bucketOrder: ScopeBucket[] = [
    "mvp_candidate_code",
    "planning_docs",
    "acceptance_evidence",
    "local_generated_artifact",
    "cutter_impact_review",
    "unknown_review"
  ];
  const buckets = bucketOrder.map((bucket): ScopeBucketSummary => {
    const bucketItems = items.filter((item) => item.bucket === bucket);
    const severity = bucketItems[0]?.severity ?? (
      bucket === "local_generated_artifact" ? "exclude" : bucket === "unknown_review" || bucket === "cutter_impact_review" ? "review" : "evidence"
    );

    return {
      bucket,
      severity,
      count: bucketItems.length,
      paths: bucketItems.slice(0, maxPaths).map((item) => `${item.status} ${item.path}`),
      omitted_count: Math.max(0, bucketItems.length - maxPaths)
    };
  });
  const count = (bucket: ScopeBucket) => buckets.find((item) => item.bucket === bucket)?.count ?? 0;
  const currentWorktreeClean = entries.length === 0;
  const hasUnknownReview = count("unknown_review") > 0;
  const hasCutterImpactReview = count("cutter_impact_review") > 0;
  const hasLocalGeneratedArtifacts = count("local_generated_artifact") > 0;
  const candidateScopeReviewReady = !hasUnknownReview && !hasCutterImpactReview;
  const candidateSelectiveCommitReady = candidateScopeReviewReady && count("mvp_candidate_code") > 0;
  const remoteWorkflowProofPossible = currentWorktreeClean && candidateScopeReviewReady;
  const blockers: string[] = [];

  if (!currentWorktreeClean) {
    blockers.push("current-worktree-dirty");
  }

  if (hasUnknownReview) {
    blockers.push("unknown-paths-require-review");
  }

  if (hasCutterImpactReview) {
    blockers.push("cutter-impact-paths-require-review");
  }

  if (hasLocalGeneratedArtifacts) {
    blockers.push("local-generated-artifacts-must-be-excluded-or-cleaned");
  }

  if (!currentWorktreeClean && count("mvp_candidate_code") === 0) {
    blockers.push("no-mvp-candidate-code-detected");
  }

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-candidate-scope",
    current_branch: input.current_branch,
    current_head_sha: input.current_head_sha,
    total_changed_paths: entries.length,
    max_paths_per_bucket: maxPaths,
    buckets,
    decisions: {
      current_worktree_clean: currentWorktreeClean,
      candidate_scope_review_ready: candidateScopeReviewReady,
      candidate_selective_commit_ready: candidateSelectiveCommitReady,
      remote_workflow_proof_possible_from_current_worktree: remoteWorkflowProofPossible
    },
    blockers,
    next_actions: nextActions({
      currentWorktreeClean,
      candidateScopeReviewReady,
      hasUnknownReview,
      hasCutterImpactReview,
      hasLocalGeneratedArtifacts,
      mvpCandidateCount: count("mvp_candidate_code")
    }),
    artifacts: null
  };
}

function nextActions(input: {
  currentWorktreeClean: boolean;
  candidateScopeReviewReady: boolean;
  hasUnknownReview: boolean;
  hasCutterImpactReview: boolean;
  hasLocalGeneratedArtifacts: boolean;
  mvpCandidateCount: number;
}): string[] {
  const actions: string[] = [];

  if (input.hasUnknownReview) {
    actions.push("Review unknown paths and either map them into the Admin Docker MVP scope or exclude them before forming the candidate commit.");
  }

  if (input.hasCutterImpactReview) {
    actions.push("Review Cutter-impact paths separately; include them only if they are required for Phase 5 Cutter compatibility evidence.");
  }

  if (input.hasLocalGeneratedArtifacts) {
    actions.push("Exclude local generated artifacts such as .local-dev, captures, output, local clips, and Tauri gen files from the candidate commit.");
  }

  if (!input.currentWorktreeClean && input.mvpCandidateCount === 0) {
    actions.push("No Admin Docker MVP candidate code was detected; inspect the working tree before attempting a Docker workflow run.");
  }

  if (!input.currentWorktreeClean && input.candidateScopeReviewReady) {
    actions.push("Create a selective candidate commit from mvp_candidate_code plus intentional planning/evidence docs, then run the GitHub Docker workflow on that commit.");
  }

  if (input.currentWorktreeClean && input.candidateScopeReviewReady) {
    actions.push("Current worktree is clean and scoped; run the GitHub Docker workflow for this HEAD, then collect release-gates artifacts.");
  }

  return actions;
}

export function toMarkdown(report: AdminDockerCandidateScopeReport): string {
  const lines = [
    "# Admin Docker Candidate Scope",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Branch: ${report.current_branch || "<missing>"}`,
    `HEAD: ${report.current_head_sha || "<missing>"}`,
    "",
    "## Decision",
    "",
    `- Total changed paths: ${report.total_changed_paths}`,
    `- Current worktree clean: ${report.decisions.current_worktree_clean ? "yes" : "no"}`,
    `- Candidate scope review ready: ${report.decisions.candidate_scope_review_ready ? "yes" : "no"}`,
    `- Selective candidate commit ready: ${report.decisions.candidate_selective_commit_ready ? "yes" : "no"}`,
    `- Remote workflow proof possible from current worktree: ${report.decisions.remote_workflow_proof_possible_from_current_worktree ? "yes" : "no"}`,
    `- Blockers: ${report.blockers.join(", ") || "none"}`,
    "",
    "## Buckets",
    "",
    "| Bucket | Severity | Count | Omitted |",
    "| --- | --- | ---: | ---: |",
    ...report.buckets.map((item) => `| ${item.bucket} | ${item.severity} | ${item.count} | ${item.omitted_count} |`),
    "",
    "## Path Samples",
    "",
    ...report.buckets.flatMap((bucket) => [
      `### ${bucket.bucket}`,
      "",
      bucket.paths.length > 0 ? bucket.paths.map((item) => `- ${item}`).join("\n") : "- none",
      bucket.omitted_count > 0 ? `- ... ${bucket.omitted_count} more omitted` : "",
      ""
    ]),
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

async function gitText(args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, {
    maxBuffer: 16 * 1024 * 1024
  });

  return String(result.stdout).trimEnd();
}

export async function runCandidateScopeAudit(input: {
  output_dir?: string;
  generated_at?: string;
  command?: string;
  max_paths_per_bucket?: number;
} = {}): Promise<AdminDockerCandidateScopeReport> {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const timestamp = timestampForFile(new Date(generatedAt));
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const [branch, head, porcelain] = await Promise.all([
    gitText(["branch", "--show-current"]),
    gitText(["rev-parse", "HEAD"]),
    gitText(["status", "--porcelain=v1"])
  ]);
  const report = buildAdminDockerCandidateScopeReport({
    generated_at: generatedAt,
    command: input.command ?? process.argv.join(" "),
    current_branch: branch,
    current_head_sha: head,
    porcelain,
    max_paths_per_bucket: input.max_paths_per_bucket
  });
  const jsonPath = path.join(outputDir, `admin-docker-candidate-scope-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-candidate-scope-${timestamp}.md`);
  const reportWithArtifacts: AdminDockerCandidateScopeReport = {
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
  const report = await runCandidateScopeAudit({
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    max_paths_per_bucket: process.env.MIXLAB_ADMIN_DOCKER_CANDIDATE_SCOPE_MAX_PATHS
      ? Number(process.env.MIXLAB_ADMIN_DOCKER_CANDIDATE_SCOPE_MAX_PATHS)
      : undefined
  });

  console.log(JSON.stringify({
    mode: report.mode,
    total_changed_paths: report.total_changed_paths,
    decisions: report.decisions,
    blockers: report.blockers,
    buckets: Object.fromEntries(report.buckets.map((bucket) => [bucket.bucket, bucket.count])),
    json_path: report.artifacts?.json_path,
    markdown_path: report.artifacts?.markdown_path
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
