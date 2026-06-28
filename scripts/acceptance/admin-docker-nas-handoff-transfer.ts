import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ARCHIVE_PATH = "dist/acceptance/admin-docker-nas-handoff-kit.tar.gz";
const DEFAULT_DEST_DIR = "/Volumes/MixLab/安装包/mixlab-admin-docker-handoff";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const FORBIDDEN_DEST_SEGMENTS = new Set(["PublicLibrary", "#recycle"]);

type TransferStatus = "pass" | "blocked";

interface TransferGate {
  id: string;
  title: string;
  status: TransferStatus;
  evidence: string;
  blocks_transfer: boolean;
  required_evidence?: string;
}

interface TransferFile {
  path: string;
  sha256: string;
  size_bytes: number;
}

export interface AdminDockerNasHandoffTransferReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-nas-handoff-transfer";
  source_archive_path: string;
  destination_dir: string;
  destination_archive_path: string;
  transfer_completed: boolean;
  push_execution_allowed: false;
  docker_deploy_allowed: false;
  nas_public_library_writes_allowed: false;
  docker_runtime_touched: false;
  observations: {
    source_archive: TransferFile | null;
    destination_archive: TransferFile | null;
    destination_is_public_library: boolean;
    destination_is_recycle: boolean;
    dry_run: boolean;
  };
  gates: TransferGate[];
  summary: {
    total: number;
    passed: number;
    blocked: number;
    transfer_blockers: string[];
  };
  result: {
    status: "transferred" | "blocked";
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

async function fileInfo(filePath: string): Promise<TransferFile | null> {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return null;
    }

    return {
      path: filePath,
      sha256: createHash("sha256").update(await readFile(filePath)).digest("hex"),
      size_bytes: info.size
    };
  } catch {
    return null;
  }
}

function pathSegments(filePath: string): string[] {
  return path.resolve(filePath).split(path.sep).filter(Boolean);
}

function destinationHasForbiddenSegment(destinationDir: string, segment: string): boolean {
  return pathSegments(destinationDir).includes(segment);
}

function gate(input: TransferGate): TransferGate {
  return input;
}

function summarize(gates: TransferGate[]): AdminDockerNasHandoffTransferReport["summary"] {
  const transferBlockers = gates
    .filter((item) => item.blocks_transfer && item.status !== "pass")
    .map((item) => item.id);

  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    transfer_blockers: transferBlockers
  };
}

function buildNextActions(report: AdminDockerNasHandoffTransferReport): string[] {
  if (!report.transfer_completed) {
    return [
      `Resolve transfer blockers: ${report.summary.transfer_blockers.join(", ") || "unknown"}.`,
      "Do not use this NAS handoff archive until the transfer report is pass."
    ];
  }

  return [
    `NAS share now has ${report.destination_archive_path}.`,
    "From the NAS desktop or NAS shell, extract admin-docker-nas-handoff-kit.tar.gz, run sh ./KIT-SELF-CHECK.sh, then copy its nas/ folder into the Admin Docker Compose project folder.",
    "Run sh ./nas/RUN_ON_NAS.sh from the Compose project folder, then copy admin-docker-release-inputs/ back to this Mac repo.",
    "Keep push_images=false, do not edit NAS .env, do not restart containers, and do not enable workers during evidence collection."
  ];
}

export function buildAdminDockerNasHandoffTransferReport(input: {
  generated_at: string;
  command: string;
  source_archive_path: string;
  destination_dir: string;
  destination_archive_path: string;
  source_archive: TransferFile | null;
  destination_archive: TransferFile | null;
  dry_run: boolean;
}): AdminDockerNasHandoffTransferReport {
  const destinationIsPublicLibrary = destinationHasForbiddenSegment(input.destination_dir, "PublicLibrary");
  const destinationIsRecycle = destinationHasForbiddenSegment(input.destination_dir, "#recycle");
  const destinationUnsafe = destinationIsPublicLibrary || destinationIsRecycle;
  const archiveMatches = Boolean(
    input.source_archive &&
    input.destination_archive &&
    input.source_archive.sha256 === input.destination_archive.sha256 &&
    input.source_archive.size_bytes === input.destination_archive.size_bytes
  );
  const gates = [
    gate({
      id: "transfer-is-handoff-only",
      title: "Transfer touches only the NAS handoff share",
      status: "pass",
      evidence: "This report copies a prepared handoff archive only; it does not contact Docker, edit compose/.env, start containers, enable workers, preprocess media, publish indexes, or write PublicLibrary.",
      blocks_transfer: false
    }),
    gate({
      id: "destination-not-public-library",
      title: "Destination is not PublicLibrary or recycle",
      status: destinationUnsafe ? "blocked" : "pass",
      evidence: `destination=${input.destination_dir}, public_library=${String(destinationIsPublicLibrary)}, recycle=${String(destinationIsRecycle)}`,
      blocks_transfer: destinationUnsafe,
      required_evidence: "Use a handoff destination outside PublicLibrary and #recycle, such as /Volumes/MixLab/安装包/mixlab-admin-docker-handoff."
    }),
    gate({
      id: "source-archive-present",
      title: "Source handoff archive exists",
      status: input.source_archive ? "pass" : "blocked",
      evidence: input.source_archive
        ? `${input.source_archive.path} sha256=${input.source_archive.sha256} size=${input.source_archive.size_bytes}`
        : `${input.source_archive_path} missing or not a file`,
      blocks_transfer: !input.source_archive,
      required_evidence: "Run package:admin-docker-nas-handoff-kit before transferring."
    }),
    gate({
      id: "destination-archive-written",
      title: "Destination archive is written",
      status: input.destination_archive ? "pass" : "blocked",
      evidence: input.destination_archive
        ? `${input.destination_archive.path} sha256=${input.destination_archive.sha256} size=${input.destination_archive.size_bytes}`
        : input.dry_run ? "dry-run did not write destination archive" : `${input.destination_archive_path} missing after transfer`,
      blocks_transfer: !input.destination_archive,
      required_evidence: "Copy the handoff archive into the NAS handoff share and verify it is readable."
    }),
    gate({
      id: "destination-sha-matches-source",
      title: "Destination archive matches source",
      status: archiveMatches ? "pass" : "blocked",
      evidence: `source_sha=${input.source_archive?.sha256 || "missing"}, destination_sha=${input.destination_archive?.sha256 || "missing"}`,
      blocks_transfer: !archiveMatches,
      required_evidence: "Destination archive sha256 and size must match the local source archive."
    }),
    gate({
      id: "transfer-does-not-approve-deploy",
      title: "Transfer does not approve Docker push or deploy",
      status: "pass",
      evidence: "push_execution_allowed=false, docker_deploy_allowed=false, nas_public_library_writes_allowed=false, docker_runtime_touched=false",
      blocks_transfer: false
    })
  ];
  const summary = summarize(gates);
  const transferCompleted = summary.transfer_blockers.length === 0 && !input.dry_run;
  const report: AdminDockerNasHandoffTransferReport = {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-nas-handoff-transfer",
    source_archive_path: input.source_archive_path,
    destination_dir: input.destination_dir,
    destination_archive_path: input.destination_archive_path,
    transfer_completed: transferCompleted,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    nas_public_library_writes_allowed: false,
    docker_runtime_touched: false,
    observations: {
      source_archive: input.source_archive,
      destination_archive: input.destination_archive,
      destination_is_public_library: destinationIsPublicLibrary,
      destination_is_recycle: destinationIsRecycle,
      dry_run: input.dry_run
    },
    gates,
    summary,
    result: {
      status: transferCompleted ? "transferred" : "blocked",
      summary: transferCompleted
        ? "Admin Docker NAS handoff kit archive was copied to the NAS handoff share and verified by sha256."
        : "Admin Docker NAS handoff kit transfer is blocked until the archive is safely copied and verified."
    },
    next_actions: [],
    artifacts: null
  };

  return {
    ...report,
    next_actions: buildNextActions(report)
  };
}

export function toMarkdown(report: AdminDockerNasHandoffTransferReport): string {
  return [
    "# Admin Docker NAS Handoff Transfer",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Result: ${report.result.status}`,
    `Transfer completed: ${report.transfer_completed ? "yes" : "no"}`,
    "Push execution allowed: no",
    "Docker deploy allowed: no",
    "NAS PublicLibrary writes allowed: no",
    "Docker runtime touched: no",
    "",
    "## Paths",
    "",
    `- Source archive: ${report.source_archive_path}`,
    `- Destination dir: ${report.destination_dir}`,
    `- Destination archive: ${report.destination_archive_path}`,
    "",
    "## Observations",
    "",
    `- Source sha256: ${report.observations.source_archive?.sha256 ?? "<missing>"}`,
    `- Destination sha256: ${report.observations.destination_archive?.sha256 ?? "<missing>"}`,
    `- Source size: ${report.observations.source_archive?.size_bytes ?? "<missing>"}`,
    `- Destination size: ${report.observations.destination_archive?.size_bytes ?? "<missing>"}`,
    `- Dry run: ${report.observations.dry_run ? "yes" : "no"}`,
    "",
    "## Gates",
    "",
    "| Gate | Status | Blocks Transfer | Evidence |",
    "| --- | --- | --- | --- |",
    ...report.gates.map((item) => `| ${item.id} | ${item.status} | ${item.blocks_transfer ? "yes" : "no"} | ${item.evidence.replace(/\|/g, "/")} |`),
    "",
    "## Summary",
    "",
    `- Transfer blockers: ${report.summary.transfer_blockers.join(", ") || "none"}`,
    "",
    "## Next Actions",
    "",
    ...report.next_actions.map((item) => `- ${item}`),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "<not written>"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "<not written>"}`,
    ""
  ].join("\n");
}

export async function runAdminDockerNasHandoffTransfer(input: {
  source_archive_path?: string;
  destination_dir?: string;
  output_dir?: string;
  generated_at?: string;
  command?: string;
  dry_run?: boolean;
}): Promise<AdminDockerNasHandoffTransferReport> {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const stamp = timestampForFile(new Date(generatedAt));
  const sourceArchivePath = input.source_archive_path ?? DEFAULT_ARCHIVE_PATH;
  const destinationDir = input.destination_dir ?? DEFAULT_DEST_DIR;
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const dryRun = input.dry_run ?? false;
  const destinationArchivePath = path.join(destinationDir, path.basename(sourceArchivePath));
  const sourceArchive = await fileInfo(sourceArchivePath);
  let destinationArchive: TransferFile | null = null;

  if (sourceArchive && !dryRun && !destinationHasForbiddenSegment(destinationDir, "PublicLibrary") && !destinationHasForbiddenSegment(destinationDir, "#recycle")) {
    await mkdir(destinationDir, { recursive: true });
    await copyFile(sourceArchivePath, destinationArchivePath);
    destinationArchive = await fileInfo(destinationArchivePath);
  } else {
    destinationArchive = await fileInfo(destinationArchivePath);
  }

  const report = buildAdminDockerNasHandoffTransferReport({
    generated_at: generatedAt,
    command: input.command ?? process.argv.join(" "),
    source_archive_path: sourceArchivePath,
    destination_dir: destinationDir,
    destination_archive_path: destinationArchivePath,
    source_archive: sourceArchive,
    destination_archive: destinationArchive,
    dry_run: dryRun
  });
  const jsonPath = path.join(outputDir, `admin-docker-nas-handoff-transfer-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-nas-handoff-transfer-${stamp}.md`);
  const reportWithArtifacts: AdminDockerNasHandoffTransferReport = {
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
  const report = await runAdminDockerNasHandoffTransfer({
    source_archive_path: process.env.MIXLAB_ADMIN_DOCKER_NAS_HANDOFF_ARCHIVE,
    destination_dir: process.env.MIXLAB_ADMIN_DOCKER_NAS_HANDOFF_DEST_DIR,
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    dry_run: process.env.MIXLAB_ADMIN_DOCKER_NAS_HANDOFF_TRANSFER_DRY_RUN === "1",
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    transfer_completed: report.transfer_completed,
    source_archive_path: report.source_archive_path,
    destination_archive_path: report.destination_archive_path,
    source_sha256: report.observations.source_archive?.sha256 ?? "",
    destination_sha256: report.observations.destination_archive?.sha256 ?? "",
    transfer_blockers: report.summary.transfer_blockers,
    json_path: report.artifacts?.json_path,
    markdown_path: report.artifacts?.markdown_path
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exit(1);
  });
}
