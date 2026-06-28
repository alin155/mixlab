import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_HANDOFF_REPORT = "docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-latest.json";
const DEFAULT_HANDOFF_BUNDLE = "docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-latest";
const DEFAULT_OUTPUT_DIR = "dist/acceptance/admin-docker-nas-handoff-kit";
const DEFAULT_ARTIFACT_DIR = "docs/acceptance/artifacts";
const REQUIRED_HANDOFF_FILES = [
  "README.md",
  "OPERATOR-CHECKLIST.md",
  "MANIFEST.json",
  "nas/RUN_ON_NAS.sh",
  "nas/admin-docker-nas-release-inputs-collector.sh",
  "local/install-nas-runner.sh",
  "local/validate-returned-evidence.sh"
] as const;
const STRICT_SECRET_PATTERN = /(password\s*=|passwd\s*=|token\s*=|secret\s*=|authorization:|bearer [A-Za-z0-9._-]{10,}|api[_-]?key\s*=|access[_-]?key\s*=|private[_-]?key)/i;

type GateStatus = "pass" | "blocked" | "fail";
type GateCategory = "safety" | "source" | "package";

interface KitGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_kit: boolean;
  required_evidence?: string;
}

interface KitFile {
  path: string;
  sha256: string;
  size_bytes: number;
  executable: boolean;
}

export interface AdminDockerNasHandoffKitReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-nas-handoff-kit";
  sources: {
    handoff_report_path: string;
    handoff_bundle_dir: string;
  };
  no_side_effects: true;
  kit_ready: boolean;
  push_execution_allowed: false;
  docker_deploy_allowed: false;
  observations: {
    candidate_sha: string;
    candidate_release_ref: string;
    handoff_package_ready: boolean | null;
    handoff_status: string;
    missing_required_files: string[];
    strict_sensitive_scan_hits: string[];
    packaged_files: KitFile[];
  };
  gates: KitGate[];
  summary: {
    total: number;
    passed: number;
    blocked: number;
    failed: number;
    kit_blockers: string[];
  };
  next_actions: string[];
  artifacts: {
    json_path: string;
    markdown_path: string;
    kit_dir: string;
    kit_readme_path: string;
    kit_manifest_path: string;
    latest_json_path?: string;
    latest_markdown_path?: string;
  } | null;
  result: {
    status: "ready-for-transfer" | "blocked" | "failed";
    summary: string;
  };
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function gate(input: KitGate): KitGate {
  return input;
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

function summarize(gates: KitGate[]): AdminDockerNasHandoffKitReport["summary"] {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    failed: gates.filter((item) => item.status === "fail").length,
    kit_blockers: gates
      .filter((item) => item.blocks_kit && item.status !== "pass")
      .map((item) => item.id)
  };
}

function portablePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

async function pathIsFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function missingRequiredFiles(bundleDir: string): Promise<string[]> {
  const missing: string[] = [];

  for (const relativePath of REQUIRED_HANDOFF_FILES) {
    if (!(await pathIsFile(path.join(bundleDir, relativePath)))) {
      missing.push(relativePath);
    }
  }

  return missing;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function collectFiles(rootDir: string, currentDir = rootDir): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(rootDir, entryPath));
      continue;
    }
    if (entry.isFile()) {
      files.push(portablePath(path.relative(rootDir, entryPath)));
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

async function copyTree(sourceDir: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyTree(sourcePath, targetPath);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    await copyFile(sourcePath, targetPath);
    const executable = ((await stat(sourcePath)).mode & 0o111) !== 0;
    if (executable) {
      await chmod(targetPath, 0o755);
    }
  }
}

async function fileInfo(rootDir: string, relativePath: string): Promise<KitFile> {
  const filePath = path.join(rootDir, ...relativePath.split("/"));
  const info = await stat(filePath);

  return {
    path: relativePath,
    sha256: await sha256File(filePath),
    size_bytes: info.size,
    executable: (info.mode & 0o111) !== 0
  };
}

async function strictSensitiveScan(rootDir: string, files: string[]): Promise<string[]> {
  const hits: string[] = [];

  for (const relativePath of files) {
    const body = await readFile(path.join(rootDir, ...relativePath.split("/")), "utf8");
    if (STRICT_SECRET_PATTERN.test(body)) {
      hits.push(relativePath);
    }
  }

  return hits;
}

function kitReadme(report: {
  generated_at: string;
  candidate_sha: string;
  candidate_release_ref: string;
}): string {
  return [
    "# Admin Docker NAS Handoff Kit",
    "",
    `Generated: ${report.generated_at}`,
    `Candidate SHA: ${report.candidate_sha || "<missing>"}`,
    `Candidate ref: ${report.candidate_release_ref || "<missing>"}`,
    "Push execution allowed: no",
    "Docker deploy allowed: no",
    "",
    "## What This Is",
    "",
    "This portable folder is generated from the latest Admin Docker NAS release-input handoff bundle.",
    "It is for read-only evidence collection on the NAS Compose host before any separate Docker push or deploy decision.",
    "",
    "## On The NAS Host",
    "",
    "1. Copy this folder, or only its `nas/` subfolder, to the Admin Docker Compose project folder containing `docker-compose.yml` and `.env`.",
    "2. From that Compose project folder, run:",
    "",
    "```sh",
    "sh ./nas/RUN_ON_NAS.sh",
    "```",
    "",
    "3. Copy the generated `admin-docker-release-inputs/` folder back to the Mac repository.",
    "",
    "## On The Mac Repository",
    "",
    "```sh",
    "sh ./local/validate-returned-evidence.sh <copied-admin-docker-release-inputs-dir>",
    "```",
    "",
    "## Stop Conditions",
    "",
    "- Stop if the validator reports missing, unexpected, or sensitive files.",
    "- Stop if release inputs remain blocked after intake.",
    "- Stop if disk proof remains blocked.",
    "- Stop if any step asks for `push_images=true`, container restart, worker enablement, preprocessing execution, scan apply, or Cutter release/index publication.",
    ""
  ].join("\n");
}

function nextActions(report: AdminDockerNasHandoffKitReport): string[] {
  if (!report.kit_ready) {
    return [
      "Do not transfer this kit yet.",
      `Resolve kit blockers: ${report.summary.kit_blockers.join(", ") || "unknown"}.`
    ];
  }

  return [
    `Transfer ${report.artifacts?.kit_dir ?? DEFAULT_OUTPUT_DIR} to the NAS desktop or NAS shell host.`,
    "Copy its nas/ folder into the Admin Docker Compose project folder.",
    "Run sh ./nas/RUN_ON_NAS.sh from the Compose project folder.",
    "Copy admin-docker-release-inputs/ back to the Mac repository.",
    "Run sh ./local/validate-returned-evidence.sh <copied-admin-docker-release-inputs-dir> from this kit or the latest handoff bundle."
  ];
}

export function buildAdminDockerNasHandoffKitReport(input: {
  generated_at: string;
  command: string;
  handoff_report_path: string;
  handoff_bundle_dir: string;
  handoff_report: unknown;
  missing_required_files: string[];
  strict_sensitive_scan_hits: string[];
  packaged_files: KitFile[];
}): AdminDockerNasHandoffKitReport {
  const handoff = asRecord(input.handoff_report);
  const handoffObservations = asRecord(handoff.observations);
  const handoffResult = asRecord(handoff.result);
  const handoffArtifacts = asRecord(handoff.artifacts);
  const candidateSha = asString(handoffObservations.candidate_sha);
  const candidateReleaseRef = asString(handoffObservations.candidate_release_ref);
  const handoffReady = asBoolean(handoff.handoff_package_ready);
  const pushAllowed = asBoolean(handoff.push_execution_allowed);
  const deployAllowed = asBoolean(handoff.docker_deploy_allowed);
  const handoffStatus = asString(handoffResult.status);
  const artifactBundleDir = asString(handoffArtifacts.bundle_dir);
  const gates = [
    gate({
      id: "kit-no-side-effects",
      title: "Handoff kit packaging is local-only",
      category: "safety",
      status: "pass",
      evidence: "Reads and copies the latest local handoff bundle only; does not contact NAS, Docker, GitHub, Admin API, or Cutter.",
      blocks_kit: false
    }),
    gate({
      id: "handoff-report-ready",
      title: "Latest handoff report is ready",
      category: "source",
      status: handoffReady === true && handoffStatus === "ready-for-nas-collection" ? "pass" : "blocked",
      evidence: `handoff_package_ready=${String(handoffReady)}, status=${handoffStatus || "missing"}`,
      blocks_kit: true,
      required_evidence: "Run prepare:admin-docker-nas-release-inputs-handoff until the latest report is ready-for-nas-collection."
    }),
    gate({
      id: "handoff-safety-flags",
      title: "Handoff does not approve push or deploy",
      category: "safety",
      status: pushAllowed === true || deployAllowed === true ? "fail" : "pass",
      evidence: `push_execution_allowed=${String(pushAllowed)}, docker_deploy_allowed=${String(deployAllowed)}`,
      blocks_kit: true,
      required_evidence: "The handoff report must keep push_execution_allowed=false and docker_deploy_allowed=false."
    }),
    gate({
      id: "candidate-metadata-present",
      title: "Candidate SHA and release ref are present",
      category: "source",
      status: candidateSha && candidateReleaseRef ? "pass" : "blocked",
      evidence: `candidate=${candidateSha || "missing"}, ref=${candidateReleaseRef || "missing"}`,
      blocks_kit: true,
      required_evidence: "The source handoff must be built from accepted candidate-ref proof."
    }),
    gate({
      id: "bundle-path-matches-report",
      title: "Source bundle matches the handoff report",
      category: "source",
      status: !artifactBundleDir || artifactBundleDir === input.handoff_bundle_dir ? "pass" : "blocked",
      evidence: `report_bundle=${artifactBundleDir || "missing"}, input_bundle=${input.handoff_bundle_dir}`,
      blocks_kit: true,
      required_evidence: "Use the latest bundle path from the handoff report or regenerate the handoff."
    }),
    gate({
      id: "bundle-required-files-present",
      title: "Source handoff bundle has every required file",
      category: "source",
      status: input.missing_required_files.length === 0 ? "pass" : "blocked",
      evidence: input.missing_required_files.join(", ") || "none missing",
      blocks_kit: true,
      required_evidence: "The bundle must include README, operator checklist, manifest, NAS runner, collector, installer, and local validator."
    }),
    gate({
      id: "kit-files-packaged",
      title: "Portable kit files are packaged",
      category: "package",
      status: input.packaged_files.length >= REQUIRED_HANDOFF_FILES.length + 2 ? "pass" : "blocked",
      evidence: `file_count=${input.packaged_files.length}`,
      blocks_kit: true,
      required_evidence: "Package the handoff bundle plus KIT-README.md and KIT-MANIFEST.json."
    }),
    gate({
      id: "kit-strict-sensitive-scan",
      title: "Portable kit has no strict sensitive-field hits",
      category: "safety",
      status: input.strict_sensitive_scan_hits.length === 0 ? "pass" : "blocked",
      evidence: input.strict_sensitive_scan_hits.join(", ") || "no strict hits",
      blocks_kit: true,
      required_evidence: "Remove any actual assignment-style secret, token, authorization, or key values before transfer."
    })
  ];
  const summary = summarize(gates);
  const failed = summary.failed > 0;
  const kitReady = summary.kit_blockers.length === 0;
  const report: AdminDockerNasHandoffKitReport = {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-nas-handoff-kit",
    sources: {
      handoff_report_path: input.handoff_report_path,
      handoff_bundle_dir: input.handoff_bundle_dir
    },
    no_side_effects: true,
    kit_ready: kitReady,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    observations: {
      candidate_sha: candidateSha,
      candidate_release_ref: candidateReleaseRef,
      handoff_package_ready: handoffReady,
      handoff_status: handoffStatus,
      missing_required_files: input.missing_required_files,
      strict_sensitive_scan_hits: input.strict_sensitive_scan_hits,
      packaged_files: input.packaged_files
    },
    gates,
    summary,
    next_actions: [],
    artifacts: null,
    result: {
      status: failed ? "failed" : kitReady ? "ready-for-transfer" : "blocked",
      summary: kitReady
        ? "Portable Admin Docker NAS handoff kit is ready to transfer for read-only NAS evidence collection."
        : "Portable Admin Docker NAS handoff kit is blocked until the source handoff and package checks pass."
    }
  };

  return {
    ...report,
    next_actions: nextActions(report)
  };
}

export function toMarkdown(report: AdminDockerNasHandoffKitReport): string {
  return [
    "# Admin Docker NAS Handoff Kit",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Result: ${report.result.status}`,
    `Kit ready: ${report.kit_ready ? "yes" : "no"}`,
    "Push execution allowed: no",
    "Docker deploy allowed: no",
    "",
    "## Sources",
    "",
    `- Handoff report: ${report.sources.handoff_report_path}`,
    `- Handoff bundle: ${report.sources.handoff_bundle_dir}`,
    "",
    "## Candidate",
    "",
    `- candidate_sha: ${report.observations.candidate_sha || "<missing>"}`,
    `- candidate_release_ref: ${report.observations.candidate_release_ref || "<missing>"}`,
    `- handoff_status: ${report.observations.handoff_status || "<missing>"}`,
    "",
    "## Packaged Files",
    "",
    ...report.observations.packaged_files.map((item) => `- ${item.path} (${item.size_bytes} bytes, executable=${String(item.executable)})`),
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Kit | Evidence |",
    "| --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => `| ${item.id} | ${item.category} | ${item.status} | ${item.blocks_kit ? "yes" : "no"} | ${item.evidence.replace(/\|/g, "/")} |`),
    "",
    "## Summary",
    "",
    `- Kit blockers: ${report.summary.kit_blockers.join(", ") || "none"}`,
    `- Missing required files: ${report.observations.missing_required_files.join(", ") || "none"}`,
    `- Strict sensitive scan hits: ${report.observations.strict_sensitive_scan_hits.join(", ") || "none"}`,
    "",
    "## Next Actions",
    "",
    ...report.next_actions.map((item) => `- ${item}`),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "<not written>"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "<not written>"}`,
    `- Kit dir: ${report.artifacts?.kit_dir ?? "<not written>"}`,
    `- Kit README: ${report.artifacts?.kit_readme_path ?? "<not written>"}`,
    `- Kit manifest: ${report.artifacts?.kit_manifest_path ?? "<not written>"}`,
    `- Latest JSON: ${report.artifacts?.latest_json_path ?? "<not written>"}`,
    `- Latest Markdown: ${report.artifacts?.latest_markdown_path ?? "<not written>"}`,
    ""
  ].join("\n");
}

export async function runAdminDockerNasHandoffKit(input: {
  handoff_report_path?: string;
  handoff_bundle_dir?: string;
  output_dir?: string;
  artifact_dir?: string;
  generated_at?: string;
  command?: string;
} = {}): Promise<AdminDockerNasHandoffKitReport> {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const stamp = timestampForFile(new Date(generatedAt));
  const handoffReportPath = input.handoff_report_path ?? DEFAULT_HANDOFF_REPORT;
  const handoffBundleDir = input.handoff_bundle_dir ?? DEFAULT_HANDOFF_BUNDLE;
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const artifactDir = input.artifact_dir ?? DEFAULT_ARTIFACT_DIR;
  const handoffReport = await readJson(handoffReportPath);
  const missing = await missingRequiredFiles(handoffBundleDir);

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  if (missing.length === 0) {
    await copyTree(handoffBundleDir, outputDir);
  }

  const handoff = asRecord(handoffReport);
  const handoffObservations = asRecord(handoff.observations);
  const kitReadmePath = path.join(outputDir, "KIT-README.md");
  const kitManifestPath = path.join(outputDir, "KIT-MANIFEST.json");
  await writeFile(kitReadmePath, kitReadme({
    generated_at: generatedAt,
    candidate_sha: asString(handoffObservations.candidate_sha),
    candidate_release_ref: asString(handoffObservations.candidate_release_ref)
  }));

  const initialFiles = await collectFiles(outputDir);
  const sensitiveHits = await strictSensitiveScan(outputDir, initialFiles);
  const filesWithoutManifest = initialFiles.filter((item) => item !== "KIT-MANIFEST.json");
  const packagedFiles = await Promise.all(filesWithoutManifest.map((item) => fileInfo(outputDir, item)));
  await writeFile(kitManifestPath, `${JSON.stringify({
    schema_version: "1.0",
    mode: "admin-docker-nas-handoff-kit",
    generated_at: generatedAt,
    source_handoff_report: handoffReportPath,
    source_handoff_bundle: handoffBundleDir,
    candidate_sha: asString(handoffObservations.candidate_sha),
    candidate_release_ref: asString(handoffObservations.candidate_release_ref),
    safety: {
      push_execution_allowed: false,
      docker_deploy_allowed: false,
      nas_writes_allowed: false,
      worker_start_allowed: false
    },
    files: packagedFiles
  }, null, 2)}\n`);

  const packagedFilesWithManifest = [
    ...packagedFiles,
    await fileInfo(outputDir, "KIT-MANIFEST.json")
  ].sort((a, b) => a.path.localeCompare(b.path));
  const manifestScanHits = STRICT_SECRET_PATTERN.test(await readFile(kitManifestPath, "utf8"))
    ? ["KIT-MANIFEST.json"]
    : [];
  const report = buildAdminDockerNasHandoffKitReport({
    generated_at: generatedAt,
    command: input.command ?? process.argv.join(" "),
    handoff_report_path: handoffReportPath,
    handoff_bundle_dir: handoffBundleDir,
    handoff_report: handoffReport,
    missing_required_files: missing,
    strict_sensitive_scan_hits: [...sensitiveHits, ...manifestScanHits].sort(),
    packaged_files: packagedFilesWithManifest
  });
  const jsonPath = path.join(artifactDir, `admin-docker-nas-handoff-kit-${stamp}.json`);
  const markdownPath = path.join(artifactDir, `admin-docker-nas-handoff-kit-${stamp}.md`);
  const latestJsonPath = path.join(artifactDir, "admin-docker-nas-handoff-kit-latest.json");
  const latestMarkdownPath = path.join(artifactDir, "admin-docker-nas-handoff-kit-latest.md");
  const reportWithArtifacts: AdminDockerNasHandoffKitReport = {
    ...report,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath,
      kit_dir: outputDir,
      kit_readme_path: kitReadmePath,
      kit_manifest_path: kitManifestPath,
      latest_json_path: latestJsonPath,
      latest_markdown_path: latestMarkdownPath
    }
  };

  await mkdir(artifactDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(reportWithArtifacts, null, 2)}\n`);
  await writeFile(markdownPath, toMarkdown(reportWithArtifacts));
  await writeFile(latestJsonPath, `${JSON.stringify(reportWithArtifacts, null, 2)}\n`);
  await writeFile(latestMarkdownPath, toMarkdown(reportWithArtifacts));

  return reportWithArtifacts;
}

async function main(): Promise<void> {
  const report = await runAdminDockerNasHandoffKit({
    handoff_report_path: process.env.MIXLAB_ADMIN_DOCKER_NAS_HANDOFF_REPORT,
    handoff_bundle_dir: process.env.MIXLAB_ADMIN_DOCKER_NAS_HANDOFF_BUNDLE_DIR,
    output_dir: process.env.MIXLAB_ADMIN_DOCKER_NAS_HANDOFF_KIT_DIR,
    artifact_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    kit_ready: report.kit_ready,
    push_execution_allowed: report.push_execution_allowed,
    docker_deploy_allowed: report.docker_deploy_allowed,
    candidate_sha: report.observations.candidate_sha,
    candidate_release_ref: report.observations.candidate_release_ref,
    kit_blockers: report.summary.kit_blockers,
    kit_dir: report.artifacts?.kit_dir,
    json_path: report.artifacts?.json_path,
    markdown_path: report.artifacts?.markdown_path
  }, null, 2));

  if (!report.kit_ready) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exit(1);
  });
}
