import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const EXPECTED_LIBRARY_ROOT = "/data/PublicLibrary";
const REQUIRED_CHECK_IDS = [
  "admin-api-library-root",
  "admin-worker-library-root"
] as const;

type GateStatus = "pass" | "blocked";
type GateCategory = "safety" | "evidence" | "threshold" | "disk";

interface DiskProofGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_staging_execution: boolean;
  required_evidence?: string;
}

interface DiskProofSummary {
  total: number;
  passed: number;
  blocked: number;
  staging_execution_blockers: string[];
}

interface DiskProofCheck {
  id: string;
  scope: string;
  service: string;
  path: string;
  filesystem: string;
  total_bytes: number | null;
  used_bytes: number | null;
  available_bytes: number | null;
  usage_percent: number | null;
}

export interface AdminDockerNasDiskProofReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-nas-disk-proof";
  sources: {
    disk_proof_json: string;
  };
  proof_accepted: boolean;
  docker_deploy_allowed: false;
  observations: {
    proof_json_present: boolean;
    proof_json_parse_error: string;
    expected_library_root: string;
    attention_usage_percent: number;
    block_usage_percent: number;
    checks: DiskProofCheck[];
    missing_required_checks: string[];
    invalid_check_ids: string[];
    max_usage_percent: number | null;
    min_available_bytes: number | null;
  };
  collection_instructions: string[];
  gates: DiskProofGate[];
  summary: DiskProofSummary;
  result: {
    status: "accepted" | "blocked";
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function bytesFromProof(record: Record<string, unknown>, byteKey: string, blockKey: string): number | null {
  const bytes = asNumber(record[byteKey]);
  if (bytes !== null) {
    return bytes;
  }

  const blocks = asNumber(record[blockKey]);
  return blocks === null ? null : blocks * 1024;
}

function parseProof(raw: string): { proof: Record<string, unknown>; parse_error: string } {
  if (!raw.trim()) {
    return {
      proof: {},
      parse_error: ""
    };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return {
      proof: asRecord(parsed),
      parse_error: isRecord(parsed) ? "" : "disk proof JSON must be an object"
    };
  } catch (error) {
    return {
      proof: {},
      parse_error: errorMessage(error)
    };
  }
}

function parseCheck(value: unknown): DiskProofCheck {
  const record = asRecord(value);

  return {
    id: asString(record.id),
    scope: asString(record.scope),
    service: asString(record.service),
    path: asString(record.path),
    filesystem: asString(record.filesystem),
    total_bytes: bytesFromProof(record, "total_bytes", "total_1k_blocks"),
    used_bytes: bytesFromProof(record, "used_bytes", "used_1k_blocks"),
    available_bytes: bytesFromProof(record, "available_bytes", "available_1k_blocks"),
    usage_percent: asNumber(record.usage_percent ?? record.capacity_percent)
  };
}

function gate(input: DiskProofGate): DiskProofGate {
  return input;
}

function summarize(gates: DiskProofGate[]): DiskProofSummary {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    staging_execution_blockers: gates
      .filter((item) => item.blocks_staging_execution && item.status !== "pass")
      .map((item) => item.id)
  };
}

function collectionInstructions(): string[] {
  return [
    "Prefer the sanitized collector on the NAS host: copy scripts/acceptance/admin-docker-nas-release-inputs-collector.sh into the Compose project folder, then run sh admin-docker-nas-release-inputs-collector.sh <output-dir>.",
    "The collector writes admin-docker-disk-proof.json with df -Pk evidence for /data/PublicLibrary inside admin-api and admin-worker containers, plus PUBLIC_LIBRARY_HOST_PATH when present.",
    "Copy admin-docker-disk-proof.json back to the Mac repo and run: MIXLAB_ADMIN_DOCKER_NAS_DISK_PROOF_JSON=<path>/admin-docker-disk-proof.json npm run validate:admin-docker-nas-disk-proof.",
    "Disk proof is read-only evidence. It does not edit NAS .env, restart containers, enable workers, push images, repair usage-events, recover jobs, or publish indexes."
  ];
}

export function buildAdminDockerNasDiskProofReport(input: {
  generated_at: string;
  command: string;
  disk_proof_json_path?: string;
  disk_proof_json_raw?: string;
}): AdminDockerNasDiskProofReport {
  const raw = input.disk_proof_json_raw ?? "";
  const parsed = parseProof(raw);
  const thresholds = asRecord(parsed.proof.thresholds);
  const attentionUsagePercent = asNumber(thresholds.attention_usage_percent) ?? 87;
  const blockUsagePercent = asNumber(thresholds.block_usage_percent) ?? 92;
  const expectedLibraryRoot = asString(parsed.proof.expected_library_root);
  const checks = asArray(parsed.proof.checks).map(parseCheck);
  const checkIds = new Set(checks.map((item) => item.id));
  const missingRequiredChecks = REQUIRED_CHECK_IDS.filter((id) => !checkIds.has(id));
  const invalidCheckIds = checks
    .filter((item) => (
      !item.id ||
      !item.scope ||
      !item.path ||
      item.total_bytes === null ||
      item.total_bytes <= 0 ||
      item.used_bytes === null ||
      item.used_bytes < 0 ||
      item.available_bytes === null ||
      item.available_bytes < 0 ||
      item.usage_percent === null ||
      item.usage_percent < 0 ||
      item.usage_percent > 100
    ))
    .map((item) => item.id || "<missing-id>");
  const usageValues = checks
    .map((item) => item.usage_percent)
    .filter((item): item is number => item !== null);
  const availableValues = checks
    .map((item) => item.available_bytes)
    .filter((item): item is number => item !== null);
  const maxUsagePercent = usageValues.length > 0 ? Math.max(...usageValues) : null;
  const minAvailableBytes = availableValues.length > 0 ? Math.min(...availableValues) : null;
  const thresholdsValid = attentionUsagePercent > 0 &&
    blockUsagePercent > attentionUsagePercent &&
    blockUsagePercent <= 100;
  const requiredChecksValid = missingRequiredChecks.length === 0;
  const checkValuesValid = checks.length > 0 && invalidCheckIds.length === 0;
  const belowAttention = maxUsagePercent !== null && maxUsagePercent < attentionUsagePercent;
  const belowBlock = maxUsagePercent !== null && maxUsagePercent < blockUsagePercent;
  const gates = [
    gate({
      id: "nas-disk-proof-no-side-effects",
      title: "NAS disk proof validation is read-only",
      category: "safety",
      status: "pass",
      evidence: "This report reads a sanitized disk proof JSON file only; it does not contact NAS, Docker, Admin API, Cutter, or GitHub.",
      blocks_staging_execution: false
    }),
    gate({
      id: "nas-disk-proof-json-provided",
      title: "NAS disk proof JSON is provided",
      category: "evidence",
      status: input.disk_proof_json_path && raw ? "pass" : "blocked",
      evidence: input.disk_proof_json_path || "No MIXLAB_ADMIN_DOCKER_NAS_DISK_PROOF_JSON path provided.",
      blocks_staging_execution: !(input.disk_proof_json_path && raw),
      required_evidence: "Copy admin-docker-disk-proof.json from the NAS release-input collector output."
    }),
    gate({
      id: "nas-disk-proof-json-parseable",
      title: "NAS disk proof JSON is parseable",
      category: "evidence",
      status: parsed.parse_error ? "blocked" : "pass",
      evidence: parsed.parse_error || "disk proof JSON parsed as an object",
      blocks_staging_execution: Boolean(parsed.parse_error),
      required_evidence: "Provide unmodified JSON generated by admin-docker-nas-release-inputs-collector.sh."
    }),
    gate({
      id: "nas-disk-thresholds-valid",
      title: "NAS disk thresholds are conservative and valid",
      category: "threshold",
      status: thresholdsValid ? "pass" : "blocked",
      evidence: `attention=${attentionUsagePercent}, block=${blockUsagePercent}`,
      blocks_staging_execution: !thresholdsValid,
      required_evidence: "Disk proof must set 0 < attention_usage_percent < block_usage_percent <= 100."
    }),
    gate({
      id: "nas-disk-library-root-is-docker-root",
      title: "NAS disk proof is for the Docker public-library root",
      category: "disk",
      status: expectedLibraryRoot === EXPECTED_LIBRARY_ROOT ? "pass" : "blocked",
      evidence: `expected_library_root=${expectedLibraryRoot || "missing"}`,
      blocks_staging_execution: expectedLibraryRoot !== EXPECTED_LIBRARY_ROOT,
      required_evidence: `Disk proof must target ${EXPECTED_LIBRARY_ROOT}, not a Mac or Windows path.`
    }),
    gate({
      id: "nas-disk-required-container-checks-present",
      title: "NAS disk proof includes required container checks",
      category: "disk",
      status: requiredChecksValid ? "pass" : "blocked",
      evidence: requiredChecksValid
        ? `required checks present: ${REQUIRED_CHECK_IDS.join(", ")}`
        : `missing checks: ${missingRequiredChecks.join(", ")}`,
      blocks_staging_execution: !requiredChecksValid,
      required_evidence: "Proof must include admin-api-library-root and admin-worker-library-root df evidence."
    }),
    gate({
      id: "nas-disk-check-values-valid",
      title: "NAS disk proof contains valid df values",
      category: "disk",
      status: checkValuesValid ? "pass" : "blocked",
      evidence: checkValuesValid
        ? `${checks.length} disk check(s) have valid total/used/available/usage fields`
        : `invalid checks: ${invalidCheckIds.join(", ") || "none"}`,
      blocks_staging_execution: !checkValuesValid,
      required_evidence: "Every disk check must include nonnegative df values and usage_percent between 0 and 100."
    }),
    gate({
      id: "nas-disk-below-attention-threshold",
      title: "NAS disk usage is below attention threshold",
      category: "disk",
      status: belowAttention ? "pass" : "blocked",
      evidence: `max_usage_percent=${maxUsagePercent ?? "missing"}, attention_usage_percent=${attentionUsagePercent}`,
      blocks_staging_execution: !belowAttention,
      required_evidence: "Free enough NAS space so every required check is below the attention threshold before staging."
    }),
    gate({
      id: "nas-disk-below-block-threshold",
      title: "NAS disk usage is below block threshold",
      category: "disk",
      status: belowBlock ? "pass" : "blocked",
      evidence: `max_usage_percent=${maxUsagePercent ?? "missing"}, block_usage_percent=${blockUsagePercent}`,
      blocks_staging_execution: !belowBlock,
      required_evidence: "Disk usage must be below the preprocess block threshold before staging."
    }),
    gate({
      id: "nas-disk-proof-does-not-approve-deploy",
      title: "NAS disk proof does not approve Docker deploy",
      category: "safety",
      status: "pass",
      evidence: "docker_deploy_allowed=false",
      blocks_staging_execution: false
    })
  ];
  const summary = summarize(gates);
  const proofAccepted = summary.staging_execution_blockers.length === 0;

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-nas-disk-proof",
    sources: {
      disk_proof_json: input.disk_proof_json_path ?? ""
    },
    proof_accepted: proofAccepted,
    docker_deploy_allowed: false,
    observations: {
      proof_json_present: Boolean(input.disk_proof_json_path && raw),
      proof_json_parse_error: parsed.parse_error,
      expected_library_root: expectedLibraryRoot,
      attention_usage_percent: attentionUsagePercent,
      block_usage_percent: blockUsagePercent,
      checks,
      missing_required_checks: missingRequiredChecks,
      invalid_check_ids: invalidCheckIds,
      max_usage_percent: maxUsagePercent,
      min_available_bytes: minAvailableBytes
    },
    collection_instructions: collectionInstructions(),
    gates,
    summary,
    result: {
      status: proofAccepted ? "accepted" : "blocked",
      summary: proofAccepted
        ? "NAS disk proof is accepted for clearing the pre-staging disk-risk carry-forward gate; Docker deploy is still not approved."
        : "NAS disk proof is blocked until sanitized df evidence shows /data/PublicLibrary is below the attention threshold."
    },
    artifacts: null
  };
}

export function toMarkdown(report: AdminDockerNasDiskProofReport): string {
  const lines = [
    "# Admin Docker NAS Disk Proof",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    "",
    "## Decision",
    "",
    `- Proof accepted: ${report.proof_accepted ? "yes" : "no"}`,
    "- Docker deploy allowed: no",
    `- Result: ${report.result.status}`,
    `- Summary: ${report.result.summary}`,
    "",
    "## Observations",
    "",
    `- Source JSON: ${report.sources.disk_proof_json || "<missing>"}`,
    `- Expected library root: ${report.observations.expected_library_root || "<missing>"}`,
    `- Attention threshold: ${report.observations.attention_usage_percent}`,
    `- Block threshold: ${report.observations.block_usage_percent}`,
    `- Max usage percent: ${report.observations.max_usage_percent ?? "<missing>"}`,
    `- Min available bytes: ${report.observations.min_available_bytes ?? "<missing>"}`,
    `- Missing required checks: ${report.observations.missing_required_checks.join(", ") || "none"}`,
    `- Invalid checks: ${report.observations.invalid_check_ids.join(", ") || "none"}`,
    "",
    "## Checks",
    "",
    "| ID | Scope | Service | Path | Usage % | Available Bytes | Total Bytes |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.observations.checks.map((item) => [
      item.id || "<missing>",
      item.scope || "<missing>",
      item.service || "n/a",
      item.path || "<missing>",
      item.usage_percent ?? "<missing>",
      item.available_bytes ?? "<missing>",
      item.total_bytes ?? "<missing>"
    ].join(" | ")),
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Staging Execution | Evidence | Required Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => [
      item.id,
      item.category,
      item.status,
      item.blocks_staging_execution ? "yes" : "no",
      item.evidence,
      item.required_evidence ?? "n/a"
    ].join(" | ")),
    "",
    "## Collection Instructions",
    "",
    ...report.collection_instructions.map((item) => `- ${item}`),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "not written"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "not written"}`,
    ""
  ];

  return `${lines.join("\n")}\n`;
}

async function optionalRead(filePath: string | undefined): Promise<string> {
  return filePath ? await readFile(filePath, "utf8") : "";
}

export async function runAdminDockerNasDiskProof(input: {
  disk_proof_json_path?: string;
  output_dir?: string;
  generated_at?: string;
  command?: string;
}): Promise<AdminDockerNasDiskProofReport> {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const report = buildAdminDockerNasDiskProofReport({
    generated_at: generatedAt,
    command: input.command ?? process.argv.join(" "),
    disk_proof_json_path: input.disk_proof_json_path,
    disk_proof_json_raw: await optionalRead(input.disk_proof_json_path)
  });
  const timestamp = timestampForFile(new Date(generatedAt));
  const jsonPath = path.join(outputDir, `admin-docker-nas-disk-proof-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-nas-disk-proof-${timestamp}.md`);
  const reportWithArtifacts: AdminDockerNasDiskProofReport = {
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
  const report = await runAdminDockerNasDiskProof({
    disk_proof_json_path: process.env.MIXLAB_ADMIN_DOCKER_NAS_DISK_PROOF_JSON ?? process.argv[2],
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    proof_accepted: report.proof_accepted,
    docker_deploy_allowed: report.docker_deploy_allowed,
    max_usage_percent: report.observations.max_usage_percent,
    min_available_bytes: report.observations.min_available_bytes,
    staging_execution_blockers: report.summary.staging_execution_blockers,
    json_path: report.artifacts?.json_path,
    markdown_path: report.artifacts?.markdown_path
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
