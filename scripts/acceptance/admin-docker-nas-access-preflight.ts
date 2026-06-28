import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_NAS_HOST = "192.168.1.27";
const DEFAULT_SMB_ROOT = "/Volumes/MixLab";
const DEFAULT_HANDOFF_BUNDLE = "docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-latest";
const PROBE_PORTS = [22, 5000, 5001, 2375, 2376, 8080, 18080, 9999] as const;
const REQUIRED_HANDOFF_FILES = [
  "README.md",
  "OPERATOR-CHECKLIST.md",
  "MANIFEST.json",
  "nas/RUN_ON_NAS.sh",
  "nas/admin-docker-nas-release-inputs-collector.sh",
  "local/install-nas-runner.sh",
  "local/validate-returned-evidence.sh"
] as const;
const COMPOSE_FILE_NAMES = new Set(["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]);
const RETURNED_EVIDENCE_NAMES = new Set([
  "admin-docker-release-inputs",
  "admin-docker-current.env",
  "admin-docker-current.inspect.json",
  "admin-worker.env",
  "admin-worker.inspect.json",
  "admin-docker-disk-proof.json"
]);
const HANDOFF_ARCHIVE_NAMES = new Set(["admin-docker-nas-handoff-kit.tar.gz"]);
const PRUNED_DIR_NAMES = new Set(["PublicLibrary", "#recycle"]);

type GateStatus = "pass" | "blocked";
type GateCategory = "safety" | "network" | "smb" | "handoff" | "returned-evidence" | "staging-target";

interface NasAccessGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_nas_collection: boolean;
  blocks_staging_review: boolean;
  required_evidence?: string;
}

interface NasAccessSummary {
  total: number;
  passed: number;
  blocked: number;
  nas_collection_blockers: string[];
  staging_review_blockers: string[];
}

interface PortProbe {
  port: number;
  status: "open" | "closed";
  error: string;
}

interface HttpProbe {
  url: string;
  status: "ok" | "error";
  http_status: number | null;
  content_type: string;
  error: string;
}

interface MountedPathObservation {
  path: string;
  present: boolean;
  is_directory: boolean;
  top_level_dirs: string[];
}

interface HandoffBundleObservation {
  path: string;
  present: boolean;
  is_directory: boolean;
  required_files: string[];
  missing_files: string[];
  candidate_sha: string;
  candidate_release_ref: string;
}

export interface AdminDockerNasAccessPreflightReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-nas-access-preflight";
  target: {
    nas_host: string;
    smb_root: string;
    handoff_bundle_dir: string;
  };
  no_side_effects: true;
  nas_collection_directly_available: boolean;
  staging_review_ready: false;
  push_execution_allowed: false;
  docker_deploy_allowed: false;
  observations: {
    ports: PortProbe[];
    http: HttpProbe[];
    smb_root: MountedPathObservation;
    handoff_bundle: HandoffBundleObservation;
    compose_candidates: string[];
    handoff_transfer_candidates: string[];
    returned_evidence_candidates: string[];
    scan_limits: {
      max_depth: number;
      max_entries: number;
      pruned_dirs: string[];
    };
  };
  gates: NasAccessGate[];
  summary: NasAccessSummary;
  next_actions: string[];
  result: {
    status: "ready-for-nas-collection" | "blocked";
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

function gate(input: NasAccessGate): NasAccessGate {
  return input;
}

function summarize(gates: NasAccessGate[]): NasAccessSummary {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    nas_collection_blockers: gates
      .filter((item) => item.blocks_nas_collection && item.status !== "pass")
      .map((item) => item.id),
    staging_review_blockers: gates
      .filter((item) => item.blocks_staging_review && item.status !== "pass")
      .map((item) => item.id)
  };
}

async function probePort(host: string, port: number, timeoutMs: number): Promise<PortProbe> {
  return await new Promise<PortProbe>((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve({ port, status: "closed", error: `timeout after ${timeoutMs}ms` });
    }, timeoutMs);

    socket.once("connect", () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.end();
      resolve({ port, status: "open", error: "" });
    });

    socket.once("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ port, status: "closed", error: errorMessage(error) });
    });
  });
}

async function probeHttp(url: string, timeoutMs: number): Promise<HttpProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal
    });

    return {
      url,
      status: "ok",
      http_status: response.status,
      content_type: response.headers.get("content-type") ?? "",
      error: ""
    };
  } catch (error) {
    return {
      url,
      status: "error",
      http_status: null,
      content_type: "",
      error: errorMessage(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function mountedPathObservation(smbRoot: string): Promise<MountedPathObservation> {
  try {
    const info = await stat(smbRoot);
    const topLevelDirs = info.isDirectory()
      ? (await readdir(smbRoot, { withFileTypes: true }))
          .filter((item) => item.isDirectory())
          .map((item) => item.name)
          .sort()
      : [];

    return {
      path: smbRoot,
      present: true,
      is_directory: info.isDirectory(),
      top_level_dirs: topLevelDirs
    };
  } catch {
    return {
      path: smbRoot,
      present: false,
      is_directory: false,
      top_level_dirs: []
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function handoffBundleObservation(bundleDir: string): Promise<HandoffBundleObservation> {
  let present = false;
  let isDirectory = false;

  try {
    const info = await stat(bundleDir);
    present = true;
    isDirectory = info.isDirectory();
  } catch {
    present = false;
  }

  const missingFiles: string[] = [];
  if (!present || !isDirectory) {
    missingFiles.push(...REQUIRED_HANDOFF_FILES);
  } else {
    for (const relativePath of REQUIRED_HANDOFF_FILES) {
      try {
        const info = await stat(path.join(bundleDir, relativePath));
        if (!info.isFile()) {
          missingFiles.push(relativePath);
        }
      } catch {
        missingFiles.push(relativePath);
      }
    }
  }

  let candidateSha = "";
  let candidateReleaseRef = "";
  if (present && isDirectory) {
    try {
      const manifest = JSON.parse(await readFile(path.join(bundleDir, "MANIFEST.json"), "utf8")) as unknown;
      if (isRecord(manifest)) {
        candidateSha = asString(manifest.candidate_sha);
        candidateReleaseRef = asString(manifest.candidate_release_ref);
      }
    } catch {
      candidateSha = "";
      candidateReleaseRef = "";
    }
  }

  return {
    path: bundleDir,
    present,
    is_directory: isDirectory,
    required_files: [...REQUIRED_HANDOFF_FILES],
    missing_files: missingFiles,
    candidate_sha: candidateSha,
    candidate_release_ref: candidateReleaseRef
  };
}

async function findCandidatePaths(input: {
  root: string;
  maxDepth: number;
  maxEntries: number;
}): Promise<{ compose_candidates: string[]; handoff_transfer_candidates: string[]; returned_evidence_candidates: string[] }> {
  const composeCandidates: string[] = [];
  const handoffTransferCandidates: string[] = [];
  const returnedEvidenceCandidates: string[] = [];
  let visitedEntries = 0;

  async function visit(current: string, depth: number): Promise<void> {
    if (depth > input.maxDepth || visitedEntries >= input.maxEntries) {
      return;
    }

    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (visitedEntries >= input.maxEntries) {
        return;
      }
      visitedEntries += 1;

      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (RETURNED_EVIDENCE_NAMES.has(entry.name)) {
          returnedEvidenceCandidates.push(entryPath);
        }
        if (!PRUNED_DIR_NAMES.has(entry.name)) {
          await visit(entryPath, depth + 1);
        }
        continue;
      }

      if (entry.isFile() && COMPOSE_FILE_NAMES.has(entry.name)) {
        composeCandidates.push(entryPath);
      }
      if (entry.isFile() && HANDOFF_ARCHIVE_NAMES.has(entry.name)) {
        handoffTransferCandidates.push(entryPath);
      }
      if (entry.isFile() && RETURNED_EVIDENCE_NAMES.has(entry.name)) {
        returnedEvidenceCandidates.push(entryPath);
      }
    }
  }

  await visit(input.root, 0);

  return {
    compose_candidates: composeCandidates.sort(),
    handoff_transfer_candidates: handoffTransferCandidates.sort(),
    returned_evidence_candidates: returnedEvidenceCandidates.sort()
  };
}

function portStatus(ports: PortProbe[], port: number): "open" | "closed" {
  return ports.find((item) => item.port === port)?.status ?? "closed";
}

function nextActions(report: AdminDockerNasAccessPreflightReport): string[] {
  if (report.nas_collection_directly_available) {
    return [
      "Use the discovered NAS collection path, then run or copy the handoff NAS runner from docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-latest.",
      "Copy the generated admin-docker-release-inputs/ folder back to the Mac repo.",
      "Run sh docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-latest/local/validate-returned-evidence.sh <copied-admin-docker-release-inputs-dir>."
    ];
  }

  return [
    "Keep push_images=false; do not edit NAS .env, restart containers, or enable workers.",
    "Use the NAS desktop or physical NAS shell to locate the Compose project folder that contains docker-compose.yml and .env.",
    "Copy docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-latest/nas/ into that Compose project folder.",
    "On the NAS host, run sh ./nas/RUN_ON_NAS.sh and copy the generated admin-docker-release-inputs/ folder back to this Mac.",
    "Alternatively enable a temporary SSH or mounted Compose-project read-only workflow, then rerun this preflight."
  ];
}

export function buildAdminDockerNasAccessPreflightReport(input: {
  generated_at: string;
  command: string;
  nas_host: string;
  smb_root: string;
  handoff_bundle_dir: string;
  ports: PortProbe[];
  http: HttpProbe[];
  smb_root_observation: MountedPathObservation;
  handoff_bundle_observation: HandoffBundleObservation;
  compose_candidates: string[];
  handoff_transfer_candidates: string[];
  returned_evidence_candidates: string[];
  max_depth: number;
  max_entries: number;
}): AdminDockerNasAccessPreflightReport {
  const sshOpen = portStatus(input.ports, 22) === "open";
  const composeVisible = input.compose_candidates.length > 0;
  const handoffTransferVisible = input.handoff_transfer_candidates.length > 0;
  const returnedEvidenceVisible = input.returned_evidence_candidates.length > 0;
  const handoffBundleReady = input.handoff_bundle_observation.present &&
    input.handoff_bundle_observation.is_directory &&
    input.handoff_bundle_observation.missing_files.length === 0 &&
    Boolean(input.handoff_bundle_observation.candidate_sha) &&
    Boolean(input.handoff_bundle_observation.candidate_release_ref);
  const stagingPortOpen = portStatus(input.ports, 8080) === "open";
  const legacyAdminOpen = portStatus(input.ports, 18080) === "open";
  const nasDesktopOpen = portStatus(input.ports, 9999) === "open";
  const nasCollectionDirectlyAvailable = returnedEvidenceVisible || (handoffBundleReady && (sshOpen || composeVisible));

  const gates = [
    gate({
      id: "preflight-no-side-effects",
      title: "NAS access preflight is read-only",
      category: "safety",
      status: "pass",
      evidence: "Only TCP connect, HTTP HEAD, and bounded SMB directory metadata reads are used.",
      blocks_nas_collection: false,
      blocks_staging_review: false
    }),
    gate({
      id: "nas-desktop-or-legacy-admin-reachable",
      title: "NAS host is reachable from Mac",
      category: "network",
      status: nasDesktopOpen || legacyAdminOpen ? "pass" : "blocked",
      evidence: `9999=${nasDesktopOpen ? "open" : "closed"}, 18080=${legacyAdminOpen ? "open" : "closed"}`,
      blocks_nas_collection: false,
      blocks_staging_review: true,
      required_evidence: "At least one NAS management or existing Admin endpoint should be reachable before staging review."
    }),
    gate({
      id: "ssh-access-available",
      title: "SSH path is available for NAS collector",
      category: "network",
      status: sshOpen ? "pass" : "blocked",
      evidence: `port 22 is ${sshOpen ? "open" : "closed"}`,
      blocks_nas_collection: true,
      blocks_staging_review: false,
      required_evidence: "Open a temporary SSH path or use the NAS desktop/local shell to run the collector."
    }),
    gate({
      id: "smb-root-mounted",
      title: "NAS SMB share is mounted on Mac",
      category: "smb",
      status: input.smb_root_observation.present && input.smb_root_observation.is_directory ? "pass" : "blocked",
      evidence: input.smb_root_observation.present
        ? `${input.smb_root} mounted with top-level dirs: ${input.smb_root_observation.top_level_dirs.join(", ") || "none"}`
        : `${input.smb_root} is not mounted`,
      blocks_nas_collection: false,
      blocks_staging_review: false,
      required_evidence: "Mount the NAS share if using SMB to transfer handoff or returned evidence."
    }),
    gate({
      id: "handoff-bundle-ready",
      title: "Local NAS handoff bundle is complete",
      category: "handoff",
      status: handoffBundleReady ? "pass" : "blocked",
      evidence: handoffBundleReady
        ? `candidate=${input.handoff_bundle_observation.candidate_sha}, ref=${input.handoff_bundle_observation.candidate_release_ref}`
        : `missing=${input.handoff_bundle_observation.missing_files.join(", ") || "candidate metadata"}`,
      blocks_nas_collection: !handoffBundleReady && !returnedEvidenceVisible,
      blocks_staging_review: false,
      required_evidence: "Regenerate prepare:admin-docker-nas-release-inputs-handoff and require README, operator checklist, MANIFEST, NAS runner, collector, installer, and local validator."
    }),
    gate({
      id: "handoff-transfer-visible-on-smb",
      title: "NAS SMB handoff archive is visible",
      category: "handoff",
      status: handoffTransferVisible ? "pass" : "blocked",
      evidence: handoffTransferVisible
        ? input.handoff_transfer_candidates.join(", ")
        : "No admin-docker-nas-handoff-kit.tar.gz was found outside PublicLibrary/#recycle.",
      blocks_nas_collection: false,
      blocks_staging_review: false,
      required_evidence: "Run transfer:admin-docker-nas-handoff-kit to place the portable archive in the NAS handoff share."
    }),
    gate({
      id: "compose-project-visible-on-smb",
      title: "NAS Compose project is visible on mounted share",
      category: "smb",
      status: composeVisible ? "pass" : "blocked",
      evidence: composeVisible ? input.compose_candidates.join(", ") : "No compose file found outside PublicLibrary/#recycle within bounded scan.",
      blocks_nas_collection: true,
      blocks_staging_review: false,
      required_evidence: "Mount or locate the NAS Compose project folder containing docker-compose.yml and .env."
    }),
    gate({
      id: "returned-evidence-visible",
      title: "Returned admin-docker-release-inputs evidence is visible",
      category: "returned-evidence",
      status: returnedEvidenceVisible ? "pass" : "blocked",
      evidence: returnedEvidenceVisible ? input.returned_evidence_candidates.join(", ") : "No returned evidence files or admin-docker-release-inputs directory found outside PublicLibrary/#recycle.",
      blocks_nas_collection: true,
      blocks_staging_review: true,
      required_evidence: "Run the NAS collector and copy admin-docker-release-inputs/ back to the Mac repo."
    }),
    gate({
      id: "staging-admin-port-reachable",
      title: "Candidate Admin Web staging port is reachable",
      category: "staging-target",
      status: stagingPortOpen ? "pass" : "blocked",
      evidence: `port 8080 is ${stagingPortOpen ? "open" : "closed"}`,
      blocks_nas_collection: false,
      blocks_staging_review: true,
      required_evidence: "After staging, the configured Admin Web port must be reachable and expose current Admin API endpoints."
    })
  ];
  const summary = summarize(gates);
  const report: AdminDockerNasAccessPreflightReport = {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-nas-access-preflight",
    target: {
      nas_host: input.nas_host,
      smb_root: input.smb_root,
      handoff_bundle_dir: input.handoff_bundle_dir
    },
    no_side_effects: true,
    nas_collection_directly_available: nasCollectionDirectlyAvailable,
    staging_review_ready: false,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    observations: {
      ports: input.ports,
      http: input.http,
      smb_root: input.smb_root_observation,
      handoff_bundle: input.handoff_bundle_observation,
      compose_candidates: input.compose_candidates,
      handoff_transfer_candidates: input.handoff_transfer_candidates,
      returned_evidence_candidates: input.returned_evidence_candidates,
      scan_limits: {
        max_depth: input.max_depth,
        max_entries: input.max_entries,
        pruned_dirs: [...PRUNED_DIR_NAMES]
      }
    },
    gates,
    summary,
    next_actions: [],
    result: {
      status: nasCollectionDirectlyAvailable ? "ready-for-nas-collection" : "blocked",
      summary: nasCollectionDirectlyAvailable
        ? "A NAS evidence collection path is visible; run the handoff collector and validate returned evidence."
        : "NAS evidence collection is blocked until a Compose project, SSH path, or returned evidence folder is available."
    },
    artifacts: null
  };

  return {
    ...report,
    next_actions: nextActions(report)
  };
}

export function toMarkdown(report: AdminDockerNasAccessPreflightReport): string {
  return [
    "# Admin Docker NAS Access Preflight",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Result: ${report.result.status}`,
    `NAS collection directly available: ${report.nas_collection_directly_available ? "yes" : "no"}`,
    "Push execution allowed: no",
    "Docker deploy allowed: no",
    "",
    "This preflight is read-only: TCP connect probes, HTTP HEAD probes, and bounded SMB directory metadata reads only.",
    "",
    "## Target",
    "",
    `- NAS host: ${report.target.nas_host}`,
    `- SMB root: ${report.target.smb_root}`,
    `- Handoff bundle: ${report.target.handoff_bundle_dir}`,
    "",
    "## Handoff Bundle",
    "",
    `- Present: ${report.observations.handoff_bundle.present && report.observations.handoff_bundle.is_directory ? "yes" : "no"}`,
    `- Candidate SHA: ${report.observations.handoff_bundle.candidate_sha || "<missing>"}`,
    `- Candidate ref: ${report.observations.handoff_bundle.candidate_release_ref || "<missing>"}`,
    `- Missing files: ${report.observations.handoff_bundle.missing_files.join(", ") || "none"}`,
    "",
    "## NAS Handoff Archive",
    "",
    `- Visible archives: ${report.observations.handoff_transfer_candidates.join(", ") || "none"}`,
    "",
    "## Ports",
    "",
    "| Port | Status | Error |",
    "| --- | --- | --- |",
    ...report.observations.ports.map((item) => `| ${item.port} | ${item.status} | ${item.error || "none"} |`),
    "",
    "## HTTP",
    "",
    "| URL | Status | HTTP | Content-Type | Error |",
    "| --- | --- | --- | --- | --- |",
    ...report.observations.http.map((item) => `| ${item.url} | ${item.status} | ${item.http_status ?? "n/a"} | ${item.content_type || "n/a"} | ${item.error || "none"} |`),
    "",
    "## SMB",
    "",
    `- Mounted: ${report.observations.smb_root.present && report.observations.smb_root.is_directory ? "yes" : "no"}`,
    `- Top-level dirs: ${report.observations.smb_root.top_level_dirs.join(", ") || "none"}`,
    `- Compose candidates: ${report.observations.compose_candidates.join(", ") || "none"}`,
    `- Returned evidence candidates: ${report.observations.returned_evidence_candidates.join(", ") || "none"}`,
    `- Scan limits: depth ${report.observations.scan_limits.max_depth}, entries ${report.observations.scan_limits.max_entries}; pruned ${report.observations.scan_limits.pruned_dirs.join(", ")}`,
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks NAS Collection | Blocks Staging Review | Evidence | Required Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => [
      item.id,
      item.category,
      item.status,
      item.blocks_nas_collection ? "yes" : "no",
      item.blocks_staging_review ? "yes" : "no",
      item.evidence,
      item.required_evidence ?? "n/a"
    ].join(" | ")).map((line) => `| ${line} |`),
    "",
    "## Summary",
    "",
    `- NAS collection blockers: ${report.summary.nas_collection_blockers.join(", ") || "none"}`,
    `- Staging review blockers: ${report.summary.staging_review_blockers.join(", ") || "none"}`,
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

export async function runAdminDockerNasAccessPreflight(input: {
  nas_host?: string;
  smb_root?: string;
  handoff_bundle_dir?: string;
  output_dir?: string;
  generated_at?: string;
  command?: string;
  port_timeout_ms?: number;
  http_timeout_ms?: number;
  max_depth?: number;
  max_entries?: number;
} = {}): Promise<AdminDockerNasAccessPreflightReport> {
  const nasHost = input.nas_host ?? DEFAULT_NAS_HOST;
  const smbRoot = input.smb_root ?? DEFAULT_SMB_ROOT;
  const handoffBundleDir = input.handoff_bundle_dir ?? DEFAULT_HANDOFF_BUNDLE;
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const portTimeoutMs = input.port_timeout_ms ?? 2500;
  const httpTimeoutMs = input.http_timeout_ms ?? 5000;
  const maxDepth = input.max_depth ?? 5;
  const maxEntries = input.max_entries ?? 2000;
  const ports = await Promise.all(PROBE_PORTS.map((port) => probePort(nasHost, port, portTimeoutMs)));
  const http = await Promise.all([
    probeHttp(`http://${nasHost}:18080/`, httpTimeoutMs),
    probeHttp(`http://${nasHost}:8080/`, httpTimeoutMs),
    probeHttp(`http://${nasHost}:9999/desktop/`, httpTimeoutMs)
  ]);
  const smbRootObservation = await mountedPathObservation(smbRoot);
  const handoffObservation = await handoffBundleObservation(handoffBundleDir);
  const found = smbRootObservation.present && smbRootObservation.is_directory
    ? await findCandidatePaths({ root: smbRoot, maxDepth, maxEntries })
    : { compose_candidates: [], handoff_transfer_candidates: [], returned_evidence_candidates: [] };
  const report = buildAdminDockerNasAccessPreflightReport({
    generated_at: generatedAt,
    command: input.command ?? "npx tsx scripts/acceptance/admin-docker-nas-access-preflight.ts",
    nas_host: nasHost,
    smb_root: smbRoot,
    handoff_bundle_dir: handoffBundleDir,
    ports,
    http,
    smb_root_observation: smbRootObservation,
    handoff_bundle_observation: handoffObservation,
    compose_candidates: found.compose_candidates,
    handoff_transfer_candidates: found.handoff_transfer_candidates,
    returned_evidence_candidates: found.returned_evidence_candidates,
    max_depth: maxDepth,
    max_entries: maxEntries
  });
  const stamp = timestampForFile(new Date(generatedAt));
  const jsonPath = path.join(outputDir, `admin-docker-nas-access-preflight-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-nas-access-preflight-${stamp}.md`);
  const reportWithArtifacts: AdminDockerNasAccessPreflightReport = {
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
  const report = await runAdminDockerNasAccessPreflight({
    nas_host: process.env.MIXLAB_NAS_HOST,
    smb_root: process.env.MIXLAB_NAS_SMB_ROOT,
    handoff_bundle_dir: process.env.MIXLAB_ADMIN_DOCKER_NAS_HANDOFF_BUNDLE_DIR,
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    nas_collection_directly_available: report.nas_collection_directly_available,
    push_execution_allowed: report.push_execution_allowed,
    docker_deploy_allowed: report.docker_deploy_allowed,
    nas_collection_blockers: report.summary.nas_collection_blockers,
    staging_review_blockers: report.summary.staging_review_blockers,
    compose_candidates: report.observations.compose_candidates,
    handoff_transfer_candidates: report.observations.handoff_transfer_candidates,
    returned_evidence_candidates: report.observations.returned_evidence_candidates,
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
