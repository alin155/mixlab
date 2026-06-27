import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ARTIFACT_DIR = "docs/acceptance/artifacts";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";

type ArtifactKey =
  | "local_docker_smoke_report"
  | "candidate_contract_proof_report"
  | "live_readonly_report"
  | "version_parity_plan_report"
  | "worker_env_proof_report"
  | "cutter_compatibility_proof_report"
  | "staging_runbook_report"
  | "release_readiness_summary_report";

type GateStatus = "pass" | "blocked" | "fail";
type GateCategory = "safety" | "artifact" | "candidate" | "image" | "staging" | "release-boundary";

interface ArtifactSpec {
  key: ArtifactKey;
  prefix: string;
  title: string;
}

interface ArtifactInput {
  path: string;
  report: unknown;
  error?: string;
}

interface GithubArtifactGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_candidate_artifact: boolean;
  blocks_staging_handoff: boolean;
  blocks_docker_deploy: boolean;
  required_evidence?: string;
}

interface GithubArtifactSummary {
  total: number;
  passed: number;
  blocked: number;
  failed: number;
  candidate_artifact_blockers: string[];
  staging_handoff_blockers: string[];
  docker_deploy_blockers: string[];
}

interface GithubArtifactSources {
  local_docker_smoke_report: string;
  candidate_contract_proof_report: string;
  live_readonly_report: string;
  version_parity_plan_report: string;
  worker_env_proof_report: string;
  cutter_compatibility_proof_report: string;
  staging_runbook_report: string;
  release_readiness_summary_report: string;
}

export interface AdminDockerGithubArtifactReadinessReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-github-artifact-readiness";
  artifact_dir: string;
  sources: GithubArtifactSources;
  source_errors: Partial<Record<ArtifactKey, string>>;
  github_candidate_artifact_ready: boolean;
  staging_handoff_ready: boolean;
  docker_deploy_allowed: false;
  observations: {
    local_smoke_status: string;
    local_smoke_passed: boolean | null;
    local_smoke_image_tag: string;
    local_smoke_build_sha: string;
    candidate_contract_status: string;
    candidate_contract_ready: boolean | null;
    candidate_source_kind: string;
    candidate_source_local_smoke_passed: boolean | null;
    candidate_observed_image_tag: string;
    candidate_observed_build_sha: string;
    target_image_tag: string;
    target_tag_matches_smoke: boolean;
    image_push_approval_accepted: boolean | null;
    current_image_tag: string;
    rollback_image_tag: string;
    staging_review_ready: boolean | null;
    release_review_ready: boolean | null;
    release_review_blockers: string[];
    staging_blockers: string[];
  };
  gates: GithubArtifactGate[];
  summary: GithubArtifactSummary;
  result: {
    status: "candidate-ready" | "staging-handoff-ready" | "blocked" | "failed";
    summary: string;
  };
  next_actions: string[];
  artifacts: {
    json_path: string;
    markdown_path: string;
  } | null;
}

const ARTIFACT_SPECS: ArtifactSpec[] = [
  {
    key: "local_docker_smoke_report",
    prefix: "admin-docker-local-smoke-",
    title: "Admin Docker local smoke"
  },
  {
    key: "candidate_contract_proof_report",
    prefix: "admin-docker-candidate-contract-proof-",
    title: "Admin Docker candidate contract proof"
  },
  {
    key: "live_readonly_report",
    prefix: "admin-docker-release-live-readonly-",
    title: "Admin Docker live read-only probe"
  },
  {
    key: "version_parity_plan_report",
    prefix: "admin-docker-version-parity-plan-",
    title: "Admin Docker version parity plan"
  },
  {
    key: "worker_env_proof_report",
    prefix: "admin-worker-env-proof-",
    title: "Admin worker env proof"
  },
  {
    key: "cutter_compatibility_proof_report",
    prefix: "admin-cutter-compatibility-proof-",
    title: "Cutter compatibility proof"
  },
  {
    key: "staging_runbook_report",
    prefix: "admin-docker-staging-runbook-",
    title: "Admin Docker staging runbook"
  },
  {
    key: "release_readiness_summary_report",
    prefix: "admin-docker-release-readiness-summary-",
    title: "Admin Docker release readiness summary"
  }
];

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

function summaryBlockers(report: unknown, key: string): string[] {
  return stringArray(asRecord(asRecord(report).summary)[key]);
}

function resultStatus(report: unknown): string {
  return asString(asRecord(asRecord(report).result).status);
}

function gate(input: GithubArtifactGate): GithubArtifactGate {
  return input;
}

function artifactSources(artifacts: Record<ArtifactKey, ArtifactInput>): GithubArtifactSources {
  return {
    local_docker_smoke_report: artifacts.local_docker_smoke_report.path,
    candidate_contract_proof_report: artifacts.candidate_contract_proof_report.path,
    live_readonly_report: artifacts.live_readonly_report.path,
    version_parity_plan_report: artifacts.version_parity_plan_report.path,
    worker_env_proof_report: artifacts.worker_env_proof_report.path,
    cutter_compatibility_proof_report: artifacts.cutter_compatibility_proof_report.path,
    staging_runbook_report: artifacts.staging_runbook_report.path,
    release_readiness_summary_report: artifacts.release_readiness_summary_report.path
  };
}

function artifactSourceErrors(artifacts: Record<ArtifactKey, ArtifactInput>): Partial<Record<ArtifactKey, string>> {
  const errors: Partial<Record<ArtifactKey, string>> = {};

  for (const spec of ARTIFACT_SPECS) {
    const error = artifacts[spec.key].error;
    if (error) {
      errors[spec.key] = error;
    }
  }

  return errors;
}

function buildIdentity(report: unknown): { image_tag: string; build_sha: string } {
  const identity = asRecord(asRecord(report).build_identity);

  return {
    image_tag: asString(identity.image_tag),
    build_sha: asString(identity.build_sha)
  };
}

function candidateObserved(report: unknown): { image_tag: string; build_sha: string } {
  const observed = asRecord(asRecord(report).observed);

  return {
    image_tag: asString(observed.image_tag),
    build_sha: asString(observed.build_sha)
  };
}

function candidateSource(report: unknown): { kind: string; local_smoke_passed: boolean | null } {
  const source = asRecord(asRecord(report).source);

  return {
    kind: asString(source.kind),
    local_smoke_passed: asBoolean(source.local_smoke_passed)
  };
}

function stagingImageTags(report: unknown): { current: string; target: string; rollback: string } {
  const tags = asRecord(asRecord(report).image_tags);

  return {
    current: asString(tags.current),
    target: asString(tags.target),
    rollback: asString(tags.rollback)
  };
}

function isCurrentBuildIdentity(identity: { image_tag: string; build_sha: string }): boolean {
  return Boolean(identity.image_tag)
    && Boolean(identity.build_sha)
    && identity.image_tag !== "local-admin-docker-mvp-v0.1"
    && identity.build_sha !== "local-docker-smoke";
}

function summarize(gates: GithubArtifactGate[]): GithubArtifactSummary {
  const candidateArtifactBlockers = gates
    .filter((item) => item.blocks_candidate_artifact && item.status !== "pass")
    .map((item) => item.id);
  const stagingHandoffBlockers = gates
    .filter((item) => item.blocks_staging_handoff && item.status !== "pass")
    .map((item) => item.id);
  const dockerDeployBlockers = gates
    .filter((item) => item.blocks_docker_deploy && item.status !== "pass")
    .map((item) => item.id);

  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    failed: gates.filter((item) => item.status === "fail").length,
    candidate_artifact_blockers: candidateArtifactBlockers,
    staging_handoff_blockers: stagingHandoffBlockers,
    docker_deploy_blockers: dockerDeployBlockers
  };
}

function nextActions(summary: GithubArtifactSummary, observations: AdminDockerGithubArtifactReadinessReport["observations"]): string[] {
  const actions: string[] = [];

  if (summary.failed > 0) {
    actions.push("Fix failed safety gates before using this GitHub artifact for any release decision.");
  }

  if (summary.candidate_artifact_blockers.includes("local-docker-smoke-passed")) {
    actions.push("Run the Admin Docker workflow on a Docker-capable GitHub runner and require local_smoke_passed:true before candidate review.");
  }

  if (summary.candidate_artifact_blockers.includes("local-smoke-build-identity-current")) {
    actions.push("Use a workflow build identity derived from github.sha; do not treat local placeholder tags as a publishable candidate.");
  }

  if (summary.candidate_artifact_blockers.includes("candidate-derived-from-local-smoke")) {
    actions.push("Generate candidate contract proof from the accepted local smoke report with MIXLAB_ADMIN_DOCKER_CANDIDATE_FROM_LOCAL_SMOKE=1.");
  }

  if (summary.candidate_artifact_blockers.includes("candidate-build-matches-smoke")) {
    actions.push("Ensure candidate contract proof reports the same image_tag/build_sha observed by local Docker smoke.");
  }

  if (summary.staging_handoff_blockers.includes("image-push-explicitly-approved")) {
    actions.push("For staging handoff, rerun workflow_dispatch with push_images=true and archive the explicit push approval in the staging runbook.");
  }

  if (summary.staging_handoff_blockers.includes("current-and-rollback-tags-provided")) {
    actions.push("Provide current_image_tag and rollback_image_tag, and require rollback to equal the current production image tag.");
  }

  if (summary.staging_handoff_blockers.includes("staging-runbook-ready")) {
    actions.push("Clear staging runbook blockers before treating the GitHub artifact as staging-handoff ready.");
  }

  if (observations.release_review_blockers.length > 0) {
    actions.push("Keep Docker deploy blocked until release readiness blockers are resolved in a separate release decision.");
  }

  if (actions.length === 0) {
    actions.push("GitHub candidate artifact is coherent; continue with separate staging/live/Cutter validation before any Docker deploy decision.");
  }

  return actions;
}

export function buildAdminDockerGithubArtifactReadinessReport(input: {
  generated_at: string;
  command: string;
  artifact_dir: string;
  artifacts: Record<ArtifactKey, ArtifactInput>;
}): AdminDockerGithubArtifactReadinessReport {
  const localSmoke = input.artifacts.local_docker_smoke_report.report;
  const candidate = input.artifacts.candidate_contract_proof_report.report;
  const staging = input.artifacts.staging_runbook_report.report;
  const releaseSummary = input.artifacts.release_readiness_summary_report.report;
  const localBuild = buildIdentity(localSmoke);
  const observedBuild = candidateObserved(candidate);
  const source = candidateSource(candidate);
  const tags = stagingImageTags(staging);
  const stagingObservations = asRecord(asRecord(staging).observations);
  const pushApproval = asRecord(asRecord(staging).image_push_approval);
  const localSmokePassed = asBoolean(asRecord(localSmoke).local_smoke_passed);
  const candidateContractReady = asBoolean(asRecord(candidate).candidate_contract_ready);
  const targetTagMatchesSmoke = asBoolean(stagingObservations.target_tag_matches_local_smoke) === true
    || (Boolean(tags.target) && tags.target === localBuild.image_tag);
  const imagePushApproved = asBoolean(pushApproval.accepted);
  const stagingReviewReady = asBoolean(asRecord(staging).staging_review_ready);
  const releaseReviewReady = asBoolean(asRecord(releaseSummary).release_review_ready);
  const releaseReviewBlockers = summaryBlockers(releaseSummary, "release_review_blockers");
  const stagingBlockers = summaryBlockers(staging, "staging_blockers");
  const sourceErrors = artifactSourceErrors(input.artifacts);
  const stagingDeployAllowed = asBoolean(asRecord(staging).docker_deploy_allowed);
  const releaseUploadAllowed = asBoolean(asRecord(releaseSummary).docker_upload_allowed);

  const gates: GithubArtifactGate[] = [
    gate({
      id: "github-artifact-readiness-no-side-effects",
      title: "GitHub artifact readiness is read-only",
      category: "safety",
      status: "pass",
      evidence: "Reads archived release-gate reports only; does not contact Docker, NAS, Windows Runner, Cutter, or Admin services.",
      blocks_candidate_artifact: false,
      blocks_staging_handoff: false,
      blocks_docker_deploy: false
    }),
    ...ARTIFACT_SPECS.map((spec) => {
      const artifact = input.artifacts[spec.key];
      const hasReport = Boolean(artifact.path) && artifact.report !== null && artifact.report !== undefined && !artifact.error;

      return gate({
        id: `artifact-${spec.prefix.replace(/-$/, "")}-present`,
        title: `${spec.title} report is present and readable`,
        category: "artifact",
        status: hasReport ? "pass" : artifact.error ? "fail" : "blocked",
        evidence: hasReport ? artifact.path : artifact.error ?? `${spec.prefix}*.json is missing from ${input.artifact_dir}.`,
        blocks_candidate_artifact: true,
        blocks_staging_handoff: true,
        blocks_docker_deploy: true,
        required_evidence: `Download or provide ${spec.prefix}*.json from the mixlab-admin-docker-release-gates artifact.`
      });
    }),
    gate({
      id: "release-boundary-does-not-approve-deploy",
      title: "Archived reports do not approve Docker deploy/upload",
      category: "release-boundary",
      status: stagingDeployAllowed === true || releaseUploadAllowed === true
        ? "fail"
        : stagingDeployAllowed === false && releaseUploadAllowed === false
          ? "pass"
          : "blocked",
      evidence: `staging.docker_deploy_allowed=${String(stagingDeployAllowed)}, release.docker_upload_allowed=${String(releaseUploadAllowed)}`,
      blocks_candidate_artifact: true,
      blocks_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: "Staging runbook and release readiness summary must remain decision reports, not deploy approvals."
    }),
    gate({
      id: "local-docker-smoke-passed",
      title: "Local Docker smoke passed in GitHub runner",
      category: "candidate",
      status: localSmokePassed ? "pass" : "blocked",
      evidence: `local_smoke_passed=${String(localSmokePassed)}, status=${resultStatus(localSmoke) || "unknown"}`,
      blocks_candidate_artifact: true,
      blocks_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: "Run validate:admin-docker-local-smoke with MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN=1 and MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_REQUIRE_PASS=1."
    }),
    gate({
      id: "local-smoke-build-identity-current",
      title: "Local smoke build identity is a real workflow build",
      category: "candidate",
      status: isCurrentBuildIdentity(localBuild) ? "pass" : "blocked",
      evidence: `image_tag=${localBuild.image_tag || "<missing>"}, build_sha=${localBuild.build_sha || "<missing>"}`,
      blocks_candidate_artifact: true,
      blocks_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: "GitHub workflow must set MIXLAB_BUILD_SHA, MIXLAB_BUILD_VERSION, and MIXLAB_IMAGE_TAG from github.sha."
    }),
    gate({
      id: "candidate-derived-from-local-smoke",
      title: "Candidate proof is derived from the accepted local smoke report",
      category: "candidate",
      status: source.kind === "local-smoke-report" && source.local_smoke_passed === true ? "pass" : "blocked",
      evidence: `source.kind=${source.kind || "<missing>"}, source.local_smoke_passed=${String(source.local_smoke_passed)}`,
      blocks_candidate_artifact: true,
      blocks_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: "Run validate:admin-docker-candidate-contract-proof with MIXLAB_ADMIN_DOCKER_CANDIDATE_FROM_LOCAL_SMOKE=1 after local smoke passes."
    }),
    gate({
      id: "candidate-contract-ready",
      title: "Candidate contract proof is ready",
      category: "candidate",
      status: candidateContractReady ? "pass" : "blocked",
      evidence: `candidate_contract_ready=${String(candidateContractReady)}, status=${resultStatus(candidate) || "unknown"}`,
      blocks_candidate_artifact: true,
      blocks_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: "Candidate proof must report candidate_contract_ready:true."
    }),
    gate({
      id: "candidate-build-matches-smoke",
      title: "Candidate build identity matches local smoke",
      category: "candidate",
      status: Boolean(observedBuild.image_tag)
        && observedBuild.image_tag === localBuild.image_tag
        && (!observedBuild.build_sha || observedBuild.build_sha === localBuild.build_sha)
        ? "pass"
        : "blocked",
      evidence: `candidate.image_tag=${observedBuild.image_tag || "<missing>"}, smoke.image_tag=${localBuild.image_tag || "<missing>"}, candidate.build_sha=${observedBuild.build_sha || "<missing>"}, smoke.build_sha=${localBuild.build_sha || "<missing>"}`,
      blocks_candidate_artifact: true,
      blocks_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: "The candidate proof must observe the same image_tag/build_sha already smoked by local Docker."
    }),
    gate({
      id: "target-tag-matches-smoked-image",
      title: "Staging target tag matches smoked image",
      category: "image",
      status: targetTagMatchesSmoke ? "pass" : "blocked",
      evidence: `target=${tags.target || "<missing>"}, smoke.image_tag=${localBuild.image_tag || "<missing>"}, runbook.target_tag_matches_local_smoke=${String(asBoolean(stagingObservations.target_tag_matches_local_smoke))}`,
      blocks_candidate_artifact: true,
      blocks_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: "Set MIXLAB_DOCKER_TARGET_IMAGE_TAG to the exact local smoke build_identity.image_tag."
    }),
    gate({
      id: "image-push-explicitly-approved",
      title: "Image push is explicitly approved for staging handoff",
      category: "staging",
      status: imagePushApproved ? "pass" : "blocked",
      evidence: `image_push_approval.accepted=${String(imagePushApproved)}`,
      blocks_candidate_artifact: false,
      blocks_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: "Use workflow_dispatch push_images=true and record MIXLAB_DOCKER_PUSH_APPROVAL=workflow_dispatch:push_images=true."
    }),
    gate({
      id: "current-and-rollback-tags-provided",
      title: "Current and rollback tags are explicit and match",
      category: "staging",
      status: Boolean(tags.current) && Boolean(tags.rollback) && tags.rollback === tags.current ? "pass" : "blocked",
      evidence: `current=${tags.current || "<missing>"}, rollback=${tags.rollback || "<missing>"}`,
      blocks_candidate_artifact: false,
      blocks_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: "Provide current_image_tag and rollback_image_tag, and make rollback equal the currently deployed tag."
    }),
    gate({
      id: "staging-runbook-ready",
      title: "Staging runbook is ready for handoff",
      category: "staging",
      status: stagingReviewReady && stagingBlockers.length === 0 ? "pass" : "blocked",
      evidence: `staging_review_ready=${String(stagingReviewReady)}, blockers=${stagingBlockers.join(", ") || "none"}`,
      blocks_candidate_artifact: false,
      blocks_staging_handoff: true,
      blocks_docker_deploy: true,
      required_evidence: "Clear staging runbook blockers before staging handoff."
    })
  ];

  const summary = summarize(gates);
  const githubCandidateArtifactReady = summary.failed === 0 && summary.candidate_artifact_blockers.length === 0;
  const stagingHandoffReady = summary.failed === 0 && summary.staging_handoff_blockers.length === 0;
  const observations: AdminDockerGithubArtifactReadinessReport["observations"] = {
    local_smoke_status: resultStatus(localSmoke),
    local_smoke_passed: localSmokePassed,
    local_smoke_image_tag: localBuild.image_tag,
    local_smoke_build_sha: localBuild.build_sha,
    candidate_contract_status: resultStatus(candidate),
    candidate_contract_ready: candidateContractReady,
    candidate_source_kind: source.kind,
    candidate_source_local_smoke_passed: source.local_smoke_passed,
    candidate_observed_image_tag: observedBuild.image_tag,
    candidate_observed_build_sha: observedBuild.build_sha,
    target_image_tag: tags.target,
    target_tag_matches_smoke: targetTagMatchesSmoke,
    image_push_approval_accepted: imagePushApproved,
    current_image_tag: tags.current,
    rollback_image_tag: tags.rollback,
    staging_review_ready: stagingReviewReady,
    release_review_ready: releaseReviewReady,
    release_review_blockers: releaseReviewBlockers,
    staging_blockers: stagingBlockers
  };
  const resultStatusValue = summary.failed > 0
    ? "failed"
    : stagingHandoffReady
      ? "staging-handoff-ready"
      : githubCandidateArtifactReady
        ? "candidate-ready"
        : "blocked";

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-github-artifact-readiness",
    artifact_dir: input.artifact_dir,
    sources: artifactSources(input.artifacts),
    source_errors: sourceErrors,
    github_candidate_artifact_ready: githubCandidateArtifactReady,
    staging_handoff_ready: stagingHandoffReady,
    docker_deploy_allowed: false,
    observations,
    gates,
    summary,
    result: {
      status: resultStatusValue,
      summary: resultStatusValue === "failed"
        ? "GitHub Admin Docker artifact failed safety validation."
        : resultStatusValue === "staging-handoff-ready"
          ? "GitHub Admin Docker artifact is ready for staging handoff, but still does not approve deploy."
          : resultStatusValue === "candidate-ready"
            ? "GitHub Admin Docker artifact proves a coherent smoked candidate; staging handoff and deploy remain separately gated."
            : "GitHub Admin Docker artifact is blocked until required candidate evidence is present and coherent."
    },
    next_actions: nextActions(summary, observations),
    artifacts: null
  };
}

export function toMarkdown(report: AdminDockerGithubArtifactReadinessReport): string {
  const lines = [
    "# Admin Docker GitHub Artifact Readiness",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Artifact dir: ${report.artifact_dir}`,
    "",
    "## Decision",
    "",
    `- GitHub candidate artifact ready: ${report.github_candidate_artifact_ready ? "yes" : "no"}`,
    `- Staging handoff ready: ${report.staging_handoff_ready ? "yes" : "no"}`,
    "- Docker deploy allowed: no",
    `- Result: ${report.result.status}`,
    `- Summary: ${report.result.summary}`,
    "",
    "## Sources",
    "",
    ...ARTIFACT_SPECS.map((spec) => `- ${spec.title}: ${report.sources[spec.key] || "<missing>"}`),
    "",
    "## Observations",
    "",
    `- Local smoke: ${report.observations.local_smoke_status || "unknown"}, passed=${String(report.observations.local_smoke_passed)}`,
    `- Smoked image tag: ${report.observations.local_smoke_image_tag || "<missing>"}`,
    `- Smoked build sha: ${report.observations.local_smoke_build_sha || "<missing>"}`,
    `- Candidate: ${report.observations.candidate_contract_status || "unknown"}, ready=${String(report.observations.candidate_contract_ready)}`,
    `- Candidate source: ${report.observations.candidate_source_kind || "<missing>"}, local_smoke_passed=${String(report.observations.candidate_source_local_smoke_passed)}`,
    `- Candidate observed image tag: ${report.observations.candidate_observed_image_tag || "<missing>"}`,
    `- Target image tag: ${report.observations.target_image_tag || "<missing>"}`,
    `- Target tag matches smoke: ${report.observations.target_tag_matches_smoke ? "yes" : "no"}`,
    `- Image push approval accepted: ${String(report.observations.image_push_approval_accepted)}`,
    `- Current image tag: ${report.observations.current_image_tag || "<missing>"}`,
    `- Rollback image tag: ${report.observations.rollback_image_tag || "<missing>"}`,
    `- Staging review ready: ${String(report.observations.staging_review_ready)}`,
    `- Release review ready: ${String(report.observations.release_review_ready)}`,
    `- Staging blockers: ${report.observations.staging_blockers.join(", ") || "none"}`,
    `- Release blockers: ${report.observations.release_review_blockers.join(", ") || "none"}`,
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks candidate | Blocks staging | Blocks deploy | Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => `| ${item.id} | ${item.category} | ${item.status} | ${item.blocks_candidate_artifact ? "yes" : "no"} | ${item.blocks_staging_handoff ? "yes" : "no"} | ${item.blocks_docker_deploy ? "yes" : "no"} | ${item.evidence.replace(/\|/g, "/")} |`),
    "",
    "## Blockers",
    "",
    `- Candidate artifact blockers: ${report.summary.candidate_artifact_blockers.join(", ") || "none"}`,
    `- Staging handoff blockers: ${report.summary.staging_handoff_blockers.join(", ") || "none"}`,
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

async function latestArtifact(artifactDir: string, prefix: string): Promise<string | null> {
  let files: string[];

  try {
    files = await readdir(artifactDir);
  } catch {
    return null;
  }

  const candidates = files
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .sort();

  if (candidates.length === 0) {
    return null;
  }

  return path.join(artifactDir, candidates[candidates.length - 1]);
}

async function loadArtifact(artifactDir: string, spec: ArtifactSpec): Promise<ArtifactInput> {
  const artifactPath = await latestArtifact(artifactDir, spec.prefix);

  if (!artifactPath) {
    return {
      path: "",
      report: null,
      error: ""
    };
  }

  try {
    return {
      path: artifactPath,
      report: JSON.parse(await readFile(artifactPath, "utf8")) as unknown
    };
  } catch (error) {
    return {
      path: artifactPath,
      report: null,
      error: errorMessage(error)
    };
  }
}

async function loadArtifacts(artifactDir: string): Promise<Record<ArtifactKey, ArtifactInput>> {
  const pairs = await Promise.all(ARTIFACT_SPECS.map(async (spec) => {
    return [spec.key, await loadArtifact(artifactDir, spec)] as const;
  }));

  return Object.fromEntries(pairs) as Record<ArtifactKey, ArtifactInput>;
}

export async function runGithubArtifactReadiness(input: {
  artifact_dir: string;
  output_dir: string;
  generated_at?: string;
  command?: string;
}): Promise<AdminDockerGithubArtifactReadinessReport> {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const timestamp = timestampForFile(new Date(generatedAt));
  const artifacts = await loadArtifacts(input.artifact_dir);
  const report = buildAdminDockerGithubArtifactReadinessReport({
    generated_at: generatedAt,
    command: input.command ?? process.argv.join(" "),
    artifact_dir: input.artifact_dir,
    artifacts
  });
  const jsonPath = path.join(input.output_dir, `admin-docker-github-artifact-readiness-${timestamp}.json`);
  const markdownPath = path.join(input.output_dir, `admin-docker-github-artifact-readiness-${timestamp}.md`);
  const reportWithArtifacts: AdminDockerGithubArtifactReadinessReport = {
    ...report,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };

  await mkdir(input.output_dir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(reportWithArtifacts, null, 2)}\n`);
  await writeFile(markdownPath, toMarkdown(reportWithArtifacts));

  return reportWithArtifacts;
}

async function main(): Promise<void> {
  const artifactDir = process.env.MIXLAB_ADMIN_DOCKER_RELEASE_GATES_DIR
    ?? process.argv[2]
    ?? process.env.MIXLAB_ACCEPTANCE_ARTIFACT_DIR
    ?? DEFAULT_ARTIFACT_DIR;
  const outputDir = process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const report = await runGithubArtifactReadiness({
    artifact_dir: artifactDir,
    output_dir: outputDir
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    github_candidate_artifact_ready: report.github_candidate_artifact_ready,
    staging_handoff_ready: report.staging_handoff_ready,
    docker_deploy_allowed: report.docker_deploy_allowed,
    candidate_artifact_blockers: report.summary.candidate_artifact_blockers,
    staging_handoff_blockers: report.summary.staging_handoff_blockers,
    failed: report.summary.failed,
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
