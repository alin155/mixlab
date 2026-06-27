import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateNasDockerComposeStatic,
  type NasDockerComposeStaticReport
} from "./nas-docker-compose-static.ts";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_COMPOSE_PATH = "deploy/nas/mixlab/docker-compose.yml";
const DEFAULT_ENV_EXAMPLE_PATH = "deploy/nas/mixlab/.env.example";

export type DockerReleaseGateStatus = "pass" | "fail" | "blocked" | "needs-live-proof";

type DockerReleaseGateCategory =
  | "static"
  | "safety"
  | "live-nas"
  | "live-docker"
  | "cutter-compatibility";

export interface DockerReleaseGate {
  id: string;
  title: string;
  category: DockerReleaseGateCategory;
  status: DockerReleaseGateStatus;
  evidence: string;
  blocks_docker_upload: boolean;
  required_live_evidence?: string;
  errors?: string[];
}

export interface DockerReleaseGateSummary {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  needs_live_proof: number;
  upload_blockers: string[];
}

export interface AdminDockerReleaseGateDryRunReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "dry-run-static";
  release_ready: boolean;
  docker_upload_allowed: false;
  compose_static: NasDockerComposeStaticReport;
  gates: DockerReleaseGate[];
  summary: DockerReleaseGateSummary;
  result: {
    status: "ready" | "blocked" | "failed";
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

function gate(input: DockerReleaseGate): DockerReleaseGate {
  return input;
}

function composePrerequisiteGate(input: {
  id: string;
  title: string;
  evidence_when_ok: string;
  compose_static: NasDockerComposeStaticReport;
}): DockerReleaseGate {
  if (!input.compose_static.ok) {
    return gate({
      id: input.id,
      title: input.title,
      category: "static",
      status: "blocked",
      evidence: "Not evaluated because the compose static contract failed.",
      blocks_docker_upload: true,
      errors: input.compose_static.errors
    });
  }

  return gate({
    id: input.id,
    title: input.title,
    category: "static",
    status: "pass",
    evidence: input.evidence_when_ok,
    blocks_docker_upload: false
  });
}

export function buildDockerReleaseGates(
  composeStatic: NasDockerComposeStaticReport
): DockerReleaseGate[] {
  return [
    gate({
      id: "dry-run-no-side-effects",
      title: "Dry-run has no Docker or NAS side effects",
      category: "safety",
      status: "pass",
      evidence: "This report reads local static deployment files only; it does not start Docker, workers, or NAS writes.",
      blocks_docker_upload: false
    }),
    gate({
      id: "compose-static-contract",
      title: "NAS Docker compose static contract",
      category: "static",
      status: composeStatic.ok ? "pass" : "fail",
      evidence: composeStatic.ok
        ? `Static validator passed for ${composeStatic.compose_path} and ${composeStatic.env_example_path}.`
        : `Static validator failed for ${composeStatic.compose_path} and ${composeStatic.env_example_path}.`,
      blocks_docker_upload: !composeStatic.ok,
      errors: composeStatic.ok ? undefined : composeStatic.errors
    }),
    composePrerequisiteGate({
      id: "path-isolation-static",
      title: "Path isolation is explicit in compose",
      evidence_when_ok: "Compose maps PUBLIC_LIBRARY_HOST_PATH into /data/PublicLibrary for runtime services; Mac /Volumes paths are not baked into Docker defaults.",
      compose_static: composeStatic
    }),
    composePrerequisiteGate({
      id: "image-tag-static-parity",
      title: "Admin image tag parity is statically declared",
      evidence_when_ok: "admin-api, admin-worker, and admin-web use the same MIXLAB_IMAGE_TAG default contract.",
      compose_static: composeStatic
    }),
    composePrerequisiteGate({
      id: "healthcheck-static-defined",
      title: "Admin container healthchecks are declared",
      evidence_when_ok: "admin-api checks /health on 127.0.0.1:3889 and admin-web checks its internal HTTP root.",
      compose_static: composeStatic
    }),
    composePrerequisiteGate({
      id: "worker-flags-default-disabled",
      title: "Standalone worker flags default disabled",
      evidence_when_ok: "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER and MIXLAB_ENABLE_READY_PUBLISH_WORKER default to 0 in compose and .env.example.",
      compose_static: composeStatic
    }),
    composePrerequisiteGate({
      id: "api-worker-not-public",
      title: "admin-api and admin-worker are not host-published",
      evidence_when_ok: "Static validation confirms only admin-web publishes a host port.",
      compose_static: composeStatic
    }),
    composePrerequisiteGate({
      id: "disk-threshold-static",
      title: "Disk protection threshold is statically configured",
      evidence_when_ok: "MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT defaults to 92 for admin-api and admin-worker.",
      compose_static: composeStatic
    }),
    gate({
      id: "usage-events-live-tolerance",
      title: "usage-events live tolerance and repair proof",
      category: "live-nas",
      status: "needs-live-proof",
      evidence: "Static files cannot prove the target NAS events file is readable, tolerant of malformed rows, and repairable through the reviewed usage-events repair workflow.",
      required_live_evidence: "Run `npx tsx scripts/acceptance/usage-events-repair.ts --library-root <target>` as dry-run, archive the JSON/Markdown report, and only run `--apply` after separate reviewed maintenance approval.",
      blocks_docker_upload: true
    }),
    gate({
      id: "v001440-recovery-live",
      title: "V001440 / stuck processing recovery proof",
      category: "live-nas",
      status: "needs-live-proof",
      evidence: "Static files cannot prove the target stuck-job recovery path is safe for the current NAS state or that the deployed Admin API exposes the processing_recovery preflight contract.",
      required_live_evidence: "Run GET /api/admin/release-gates and verify processing_recovery, then archive GET /api/admin/preprocess/safety plus processing source-videos/jobs evidence before any separately reviewed recovery command.",
      blocks_docker_upload: true
    }),
    gate({
      id: "disk-space-live",
      title: "NAS disk space live protection proof",
      category: "live-nas",
      status: "needs-live-proof",
      evidence: "The static disk threshold exists, but current NAS free space, write-block behavior, and the deployed disk_space_protection contract must be checked on the target host.",
      required_live_evidence: "Run GET /api/admin/release-gates and verify disk_space_protection, then archive GET /api/admin/preprocess/safety plus GET /api/admin/library/status evidence proving the configured threshold, no worker start, and no ready/Cutter mutation scope.",
      blocks_docker_upload: true
    }),
    gate({
      id: "docker-health-version-live",
      title: "Live Docker health and version parity proof",
      category: "live-docker",
      status: "needs-live-proof",
      evidence: "Static compose can declare images and healthchecks, but cannot prove the deployed containers run the intended tag, expose version_health_parity, and are healthy.",
      required_live_evidence: "Run GET /api/admin/release-gates and verify version_health_parity, then archive admin-web root, admin-api /health, release-gates build metadata, admin-web/admin-api/admin-worker image tags, health state, and rollback tag before any separately approved deploy rehearsal.",
      blocks_docker_upload: true
    }),
    gate({
      id: "admin-worker-live-flags",
      title: "Live admin-worker opt-in state proof",
      category: "live-docker",
      status: "needs-live-proof",
      evidence: "Static defaults are disabled, but the target API must expose admin_worker_env_proof and the running container environment still needs live env/inspect verification before upload/enablement.",
      required_live_evidence: "Run GET /api/admin/release-gates and verify admin_worker_env_proof, then run `npx tsx scripts/acceptance/admin-worker-env-proof.ts` with NAS-exported admin-worker.env plus admin-worker.inspect.json showing standalone workers are disabled and /data/PublicLibrary roots are used.",
      blocks_docker_upload: true
    }),
    gate({
      id: "cutter-release-compatibility-live",
      title: "Cutter release/index/search compatibility proof",
      category: "cutter-compatibility",
      status: "needs-live-proof",
      evidence: "Static Admin Docker checks cannot prove the target API exposes cutter_compatibility_proof or that Windows Cutter continues reading the current release/index/search protocol.",
      required_live_evidence: "Run GET /api/admin/release-gates and verify cutter_compatibility_proof, then run `npx tsx scripts/acceptance/admin-cutter-compatibility-proof.ts` with staged-candidate windows_acceptance and real_cut_smoke reports.",
      blocks_docker_upload: true
    })
  ];
}

export function summarizeDockerReleaseGates(
  gates: DockerReleaseGate[]
): DockerReleaseGateSummary {
  const uploadBlockers = gates
    .filter((item) => item.blocks_docker_upload && item.status !== "pass")
    .map((item) => item.id);

  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    failed: gates.filter((item) => item.status === "fail").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    needs_live_proof: gates.filter((item) => item.status === "needs-live-proof").length,
    upload_blockers: uploadBlockers
  };
}

export function buildAdminDockerReleaseGateDryRunReport(input: {
  generated_at: string;
  command: string;
  compose_static: NasDockerComposeStaticReport;
}): AdminDockerReleaseGateDryRunReport {
  const gates = buildDockerReleaseGates(input.compose_static);
  const summary = summarizeDockerReleaseGates(gates);
  const releaseReady = summary.upload_blockers.length === 0;
  const resultStatus = summary.failed > 0 ? "failed" : releaseReady ? "ready" : "blocked";

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "dry-run-static",
    release_ready: releaseReady,
    docker_upload_allowed: false,
    compose_static: input.compose_static,
    gates,
    summary,
    result: {
      status: resultStatus,
      summary: resultStatus === "ready"
        ? "All gates passed, but this dry-run still does not perform Docker upload."
        : resultStatus === "failed"
          ? "Static release-gate failures block Docker upload."
          : "Docker upload remains blocked until required live NAS/Docker/Cutter proof is archived."
    },
    artifacts: null
  };
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function renderGateRows(gates: DockerReleaseGate[]): string {
  return gates
    .map((item) => [
      item.id,
      item.title,
      item.category,
      item.status,
      item.blocks_docker_upload ? "yes" : "no",
      item.evidence,
      item.required_live_evidence ?? "n/a",
      item.errors?.join("; ") ?? "none"
    ].map((cell) => escapeMarkdownCell(cell)).join(" | "))
    .join("\n");
}

export function renderMarkdown(report: AdminDockerReleaseGateDryRunReport): string {
  return `# Admin Docker Release Gate Dry Run

Generated: ${report.generated_at}

Mode: ${report.mode}

Result: ${report.result.status}

Release ready: ${report.release_ready ? "yes" : "no"}

Docker upload allowed: ${report.docker_upload_allowed ? "yes" : "no"}

This dry-run does not start Docker, workers, or NAS writes. It reads local static deployment files, reuses the NAS Docker compose validator, and records which live gates still need separate evidence.

## Summary

- Passed: ${report.summary.passed}
- Failed: ${report.summary.failed}
- Blocked: ${report.summary.blocked}
- Needs live proof: ${report.summary.needs_live_proof}
- Upload blockers: ${report.summary.upload_blockers.join(", ") || "none"}

## Static Compose

- Compose path: \`${report.compose_static.compose_path}\`
- Env example path: \`${report.compose_static.env_example_path}\`
- Static validator: ${report.compose_static.ok ? "passed" : "failed"}
- Errors: ${report.compose_static.errors.length === 0 ? "none" : report.compose_static.errors.join("; ")}

## Gates

| Gate | Title | Category | Status | Blocks Docker Upload | Evidence | Required Live Evidence | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
${renderGateRows(report.gates)}

## Scope

This report is a release-gate dry-run. It intentionally keeps \`release_ready=false\` and \`docker_upload_allowed=false\` until live NAS/Docker/Cutter evidence is produced for usage-events tolerance, V001440 recovery, disk space, health/version parity, admin-worker live flags, and Cutter compatibility.

Static evidence includes the standalone worker flags default disabled contract from R.121. It does not prove the target NAS Docker deployment is safe to upload or enable.

## Artifacts

- JSON: ${report.artifacts?.json_path ?? "not written"}
- Markdown: ${report.artifacts?.markdown_path ?? "not written"}
`;
}

export async function writeDryRunArtifacts(input: {
  report: AdminDockerReleaseGateDryRunReport;
  output_dir?: string;
  date?: Date;
}): Promise<AdminDockerReleaseGateDryRunReport> {
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  await mkdir(outputDir, { recursive: true });

  const stamp = timestampForFile(input.date);
  const jsonPath = path.join(outputDir, `admin-docker-release-gate-dry-run-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-release-gate-dry-run-${stamp}.md`);
  const report = {
    ...input.report,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown(report), "utf8");

  return report;
}

export async function runDryRun(input: {
  compose_path?: string;
  env_example_path?: string;
  output_dir?: string;
  command?: string;
  date?: Date;
} = {}): Promise<AdminDockerReleaseGateDryRunReport> {
  const composeStatic = await validateNasDockerComposeStatic({
    composePath: input.compose_path ?? DEFAULT_COMPOSE_PATH,
    envExamplePath: input.env_example_path ?? DEFAULT_ENV_EXAMPLE_PATH
  });
  const report = buildAdminDockerReleaseGateDryRunReport({
    generated_at: (input.date ?? new Date()).toISOString(),
    command: input.command ?? "npx tsx scripts/acceptance/admin-docker-release-gate-dry-run.ts",
    compose_static: composeStatic
  });

  return writeDryRunArtifacts({
    report,
    output_dir: input.output_dir,
    date: input.date
  });
}

async function main(): Promise<void> {
  const report = await runDryRun({
    compose_path: process.argv[2] ?? DEFAULT_COMPOSE_PATH,
    env_example_path: process.argv[3] ?? DEFAULT_ENV_EXAMPLE_PATH,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify(report, null, 2));

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
