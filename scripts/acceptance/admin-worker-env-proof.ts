import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const EXPECTED_LIBRARY_ROOT = "/data/PublicLibrary";
const EXPECTED_MVP_MODE = "v0.1";
const EXPECTED_DISABLED = "0";

type WorkerEnvProofStatus = "pass" | "blocked";
type WorkerEnvGateCategory = "safety" | "evidence" | "worker-flags" | "runtime-paths" | "image";

interface WorkerEnvGate {
  id: string;
  title: string;
  category: WorkerEnvGateCategory;
  status: WorkerEnvProofStatus;
  evidence: string;
  blocks_docker_upload: boolean;
  required_evidence?: string;
}

interface WorkerEnvSummary {
  total: number;
  passed: number;
  blocked: number;
  upload_blockers: string[];
}

interface WorkerEnvSources {
  env_file: string;
  inspect_json: string;
}

interface WorkerEnvObservations {
  env_file_present: boolean;
  inspect_json_present: boolean;
  env_file_flags: Record<string, string>;
  inspect_flags: Record<string, string>;
  library_roots: Record<string, string>;
  image: string;
  container_name: string;
}

interface WorkerEnvRequiredChange {
  key: string;
  required_value: string;
  env_file_value: string;
  running_value: string;
  reason: string;
}

interface WorkerEnvRemediationPlan {
  status: "not-needed" | "required";
  no_side_effects: true;
  target_env: Record<string, string>;
  required_changes: WorkerEnvRequiredChange[];
  forbidden_actions: string[];
  validation_commands: string[];
}

export interface AdminWorkerEnvProofReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-worker-env-proof";
  sources: WorkerEnvSources;
  proof_accepted: boolean;
  docker_upload_allowed: false;
  observations: WorkerEnvObservations;
  remediation_plan: WorkerEnvRemediationPlan;
  collection_instructions: string[];
  gates: WorkerEnvGate[];
  summary: WorkerEnvSummary;
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

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseEnvLines(raw: string): Map<string, string> {
  const values = new Map<string, string>();

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    values.set(trimmed.slice(0, equalsIndex), trimmed.slice(equalsIndex + 1));
  }

  return values;
}

function envFromInspectJson(rawJson: string): Map<string, string> {
  if (!rawJson.trim()) {
    return new Map();
  }

  const parsed = JSON.parse(rawJson) as unknown;
  const container = Array.isArray(parsed) ? asRecord(parsed[0]) : asRecord(parsed);
  const config = asRecord(container.Config);
  const values = new Map<string, string>();

  for (const item of asArray(config.Env)) {
    if (typeof item !== "string") {
      continue;
    }

    const equalsIndex = item.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    values.set(item.slice(0, equalsIndex), item.slice(equalsIndex + 1));
  }

  return values;
}

function imageFromInspectJson(rawJson: string): string {
  if (!rawJson.trim()) {
    return "";
  }

  const parsed = JSON.parse(rawJson) as unknown;
  const container = Array.isArray(parsed) ? asRecord(parsed[0]) : asRecord(parsed);
  const config = asRecord(container.Config);

  return asString(config.Image) || asString(container.Image);
}

function nameFromInspectJson(rawJson: string): string {
  if (!rawJson.trim()) {
    return "";
  }

  const parsed = JSON.parse(rawJson) as unknown;
  const container = Array.isArray(parsed) ? asRecord(parsed[0]) : asRecord(parsed);

  return asString(container.Name).replace(/^\/+/, "");
}

function pick(values: Map<string, string>, keys: string[]): Record<string, string> {
  const output: Record<string, string> = {};
  for (const key of keys) {
    output[key] = values.get(key) ?? "";
  }

  return output;
}

function gate(input: WorkerEnvGate): WorkerEnvGate {
  return input;
}

function summarize(gates: WorkerEnvGate[]): WorkerEnvSummary {
  const uploadBlockers = gates
    .filter((item) => item.blocks_docker_upload && item.status !== "pass")
    .map((item) => item.id);

  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    upload_blockers: uploadBlockers
  };
}

function requiredCollectionInstructions(): string[] {
  return [
    "Prefer the sanitized collector on the NAS host: copy scripts/acceptance/admin-docker-nas-release-inputs-collector.sh into the Compose project folder, then run sh admin-docker-nas-release-inputs-collector.sh <output-dir>.",
    "Manual fallback on the NAS host: docker compose --env-file .env -f docker-compose.yml exec -T admin-worker sh -lc 'printf \"%s\\n\" \"MIXLAB_ADMIN_DOCKER_MVP_MODE=${MIXLAB_ADMIN_DOCKER_MVP_MODE:-}\" \"MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=${MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER:-}\" \"MIXLAB_ENABLE_READY_PUBLISH_WORKER=${MIXLAB_ENABLE_READY_PUBLISH_WORKER:-}\"' > admin-worker.env",
    "On the NAS host, export sanitized admin-worker inspect metadata containing only image, name, required worker flags, and library roots; do not store full Config.Env with secrets.",
    "Copy those files into a local evidence folder and run: MIXLAB_ADMIN_WORKER_ENV_FILE=<path>/admin-worker.env MIXLAB_ADMIN_WORKER_INSPECT_JSON=<path>/admin-worker.inspect.json npm run validate:admin-worker-env-proof",
    "Do not paste secrets into chat. Evidence files and reports must record only required flags, library roots, image, and container name."
  ];
}

function flagGate(input: {
  id: string;
  title: string;
  sourceName: string;
  values: Record<string, string>;
}): WorkerEnvGate {
  const mvpMode = input.values.MIXLAB_ADMIN_DOCKER_MVP_MODE;
  const preprocess = input.values.MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER;
  const publish = input.values.MIXLAB_ENABLE_READY_PUBLISH_WORKER;
  const pass = mvpMode === EXPECTED_MVP_MODE &&
    preprocess === EXPECTED_DISABLED &&
    publish === EXPECTED_DISABLED;

  return gate({
    id: input.id,
    title: input.title,
    category: "worker-flags",
    status: pass ? "pass" : "blocked",
    evidence: `${input.sourceName}: MIXLAB_ADMIN_DOCKER_MVP_MODE=${mvpMode || "missing"}, MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=${preprocess || "missing"}, MIXLAB_ENABLE_READY_PUBLISH_WORKER=${publish || "missing"}`,
    blocks_docker_upload: !pass,
    required_evidence: "Admin worker must run in Docker MVP v0.1 mode and both standalone admin-worker flags must be 0 before Docker release gates allow upload or staging."
  });
}

function libraryRootGate(libraryRoots: Record<string, string>): WorkerEnvGate {
  const adminRoot = libraryRoots.MIXLAB_ADMIN_LIBRARY_ROOT;
  const preprocessRoot = libraryRoots.MIXLAB_PREPROCESS_LIBRARY_ROOT;
  const pass = adminRoot === EXPECTED_LIBRARY_ROOT && preprocessRoot === EXPECTED_LIBRARY_ROOT;

  return gate({
    id: "admin-worker-library-roots",
    title: "admin-worker uses Docker library roots",
    category: "runtime-paths",
    status: pass ? "pass" : "blocked",
    evidence: `MIXLAB_ADMIN_LIBRARY_ROOT=${adminRoot || "missing"}, MIXLAB_PREPROCESS_LIBRARY_ROOT=${preprocessRoot || "missing"}, expected=${EXPECTED_LIBRARY_ROOT}`,
    blocks_docker_upload: !pass,
    required_evidence: "Running admin-worker must use /data/PublicLibrary for both Admin and preprocess library roots."
  });
}

function buildRemediationPlan(input: {
  env_file_flags: Record<string, string>;
  inspect_flags: Record<string, string>;
  library_roots: Record<string, string>;
}): WorkerEnvRemediationPlan {
  const targetEnv = {
    MIXLAB_ADMIN_DOCKER_MVP_MODE: EXPECTED_MVP_MODE,
    MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: EXPECTED_DISABLED,
    MIXLAB_ENABLE_READY_PUBLISH_WORKER: EXPECTED_DISABLED,
    MIXLAB_ADMIN_LIBRARY_ROOT: EXPECTED_LIBRARY_ROOT,
    MIXLAB_PREPROCESS_LIBRARY_ROOT: EXPECTED_LIBRARY_ROOT
  };
  const requiredChanges: WorkerEnvRequiredChange[] = [];
  const addChange = (key: keyof typeof targetEnv, reason: string, options?: { require_env_file?: boolean }): void => {
    const requireEnvFile = options?.require_env_file ?? true;
    const envFileValue = input.env_file_flags[key] ?? "";
    const runningValue = input.inspect_flags[key] ?? input.library_roots[key] ?? "";
    if ((!requireEnvFile || envFileValue === targetEnv[key]) && runningValue === targetEnv[key]) {
      return;
    }

    requiredChanges.push({
      key,
      required_value: targetEnv[key],
      env_file_value: envFileValue || "missing",
      running_value: runningValue || "missing",
      reason
    });
  };

  addChange("MIXLAB_ADMIN_DOCKER_MVP_MODE", "Admin Docker staging must run in MVP v0.1 mode before worker proof can be accepted.");
  addChange("MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER", "Standalone preprocess worker must remain disabled during initial Docker MVP staging.");
  addChange("MIXLAB_ENABLE_READY_PUBLISH_WORKER", "Ready publish worker must remain disabled so the current Cutter release/index is not changed.");
  addChange("MIXLAB_ADMIN_LIBRARY_ROOT", "Admin worker must resolve the Docker public library root explicitly.", { require_env_file: false });
  addChange("MIXLAB_PREPROCESS_LIBRARY_ROOT", "Preprocess safety checks must use the Docker public library root explicitly.", { require_env_file: false });

  return {
    status: requiredChanges.length === 0 ? "not-needed" : "required",
    no_side_effects: true,
    target_env: targetEnv,
    required_changes: requiredChanges,
    forbidden_actions: [
      "Do not enable MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER during initial staging.",
      "Do not enable MIXLAB_ENABLE_READY_PUBLISH_WORKER during initial staging.",
      "Do not start preprocessing from this remediation plan.",
      "Do not treat this plan as image push, Docker deploy, NAS .env edit, or container restart approval."
    ],
    validation_commands: [
      "MIXLAB_ADMIN_WORKER_ENV_FILE=<returned-dir>/admin-worker.env MIXLAB_ADMIN_WORKER_INSPECT_JSON=<returned-dir>/admin-worker.inspect.json npm run validate:admin-worker-env-proof",
      "MIXLAB_ADMIN_DOCKER_NAS_RETURNED_DIR=<returned-dir> npm run intake:admin-docker-nas-release-inputs",
      "MIXLAB_DOCKER_PARITY_PLAN_REPORT=<parity-report> MIXLAB_DOCKER_STAGING_RUNBOOK_REPORT=<runbook-report> npm run validate:admin-docker-release-readiness-summary"
    ]
  };
}

export function buildAdminWorkerEnvProofReport(input: {
  generated_at: string;
  command: string;
  env_file_path?: string;
  env_file_raw?: string;
  inspect_json_path?: string;
  inspect_json_raw?: string;
}): AdminWorkerEnvProofReport {
  const envValues = parseEnvLines(input.env_file_raw ?? "");
  const inspectValues = envFromInspectJson(input.inspect_json_raw ?? "");
  const envFilePresent = Boolean(input.env_file_path && input.env_file_raw);
  const inspectJsonPresent = Boolean(input.inspect_json_path && input.inspect_json_raw);
  const flagKeys = [
    "MIXLAB_ADMIN_DOCKER_MVP_MODE",
    "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER",
    "MIXLAB_ENABLE_READY_PUBLISH_WORKER"
  ];
  const rootKeys = [
    "MIXLAB_ADMIN_LIBRARY_ROOT",
    "MIXLAB_PREPROCESS_LIBRARY_ROOT"
  ];
  const envFileFlags = pick(envValues, flagKeys);
  const inspectFlags = pick(inspectValues, flagKeys);
  const libraryRoots = pick(inspectValues, rootKeys);
  const image = imageFromInspectJson(input.inspect_json_raw ?? "");
  const containerName = nameFromInspectJson(input.inspect_json_raw ?? "");
  const remediationPlan = buildRemediationPlan({
    env_file_flags: envFileFlags,
    inspect_flags: inspectFlags,
    library_roots: libraryRoots
  });
  const gates = [
    gate({
      id: "worker-env-proof-no-side-effects",
      title: "Worker env proof has no Docker or NAS side effects",
      category: "safety",
      status: "pass",
      evidence: "This report reads sanitized evidence files only; it does not contact Docker, restart containers, enable workers, or write NAS files.",
      blocks_docker_upload: false
    }),
    gate({
      id: "env-file-provided",
      title: "Exported admin-worker env file provided",
      category: "evidence",
      status: envFilePresent ? "pass" : "blocked",
      evidence: envFilePresent ? `Read ${input.env_file_path}.` : "No MIXLAB_ADMIN_WORKER_ENV_FILE was provided.",
      blocks_docker_upload: !envFilePresent,
      required_evidence: "Provide a sanitized admin-worker.env file from the NAS host containing only the required MVP worker flags."
    }),
    gate({
      id: "inspect-json-provided",
      title: "Exported admin-worker inspect JSON provided",
      category: "evidence",
      status: inspectJsonPresent ? "pass" : "blocked",
      evidence: inspectJsonPresent ? `Read ${input.inspect_json_path}.` : "No MIXLAB_ADMIN_WORKER_INSPECT_JSON was provided.",
      blocks_docker_upload: !inspectJsonPresent,
      required_evidence: "Provide sanitized docker inspect JSON for the running admin-worker container without full Config.Env secrets."
    }),
    flagGate({
      id: "env-file-worker-flags-disabled",
      title: "Exported env file keeps standalone workers disabled",
      sourceName: "env file",
      values: envFileFlags
    }),
    flagGate({
      id: "inspect-worker-flags-disabled",
      title: "Running container keeps standalone workers disabled",
      sourceName: "docker inspect",
      values: inspectFlags
    }),
    libraryRootGate(libraryRoots),
    gate({
      id: "admin-worker-image-observed",
      title: "Running admin-worker image is observed",
      category: "image",
      status: image ? "pass" : "blocked",
      evidence: image ? `image=${image}, container=${containerName || "unknown"}` : "No running image was observed in docker inspect evidence.",
      blocks_docker_upload: !image,
      required_evidence: "docker inspect evidence must include the running admin-worker image."
    })
  ];
  const summary = summarize(gates);
  const proofAccepted = summary.upload_blockers.length === 0;

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-worker-env-proof",
    sources: {
      env_file: input.env_file_path ?? "",
      inspect_json: input.inspect_json_path ?? ""
    },
    proof_accepted: proofAccepted,
    docker_upload_allowed: false,
    observations: {
      env_file_present: envFilePresent,
      inspect_json_present: inspectJsonPresent,
      env_file_flags: envFileFlags,
      inspect_flags: inspectFlags,
      library_roots: libraryRoots,
      image,
      container_name: containerName
    },
    remediation_plan: remediationPlan,
    collection_instructions: requiredCollectionInstructions(),
    gates,
    summary,
    result: {
      status: proofAccepted ? "accepted" : "blocked",
      summary: proofAccepted
        ? "admin-worker environment proof is accepted for this gate only; Docker upload still requires the remaining release gates."
        : "admin-worker environment proof is missing or unsafe; Docker upload remains blocked."
    },
    artifacts: null
  };
}

export function toMarkdown(report: AdminWorkerEnvProofReport): string {
  const lines = [
    "# Admin Worker Environment Proof",
    "",
    `Generated: ${report.generated_at}`,
    "",
    `Mode: ${report.mode}`,
    "",
    `Result: ${report.result.status}`,
    "",
    `Proof accepted: ${report.proof_accepted ? "yes" : "no"}`,
    "",
    `Docker upload allowed: ${report.docker_upload_allowed ? "yes" : "no"}`,
    "",
    "This report reads exported evidence files only. It does not contact Docker, restart containers, enable workers, write NAS files, repair usage-events, recover jobs, publish indexes, or change Cutter protocols.",
    "",
    "## Sources",
    "",
    `- Env file: ${report.sources.env_file || "not provided"}`,
    `- Inspect JSON: ${report.sources.inspect_json || "not provided"}`,
    "",
    "## Observations",
    "",
    `- Env file present: ${report.observations.env_file_present ? "yes" : "no"}`,
    `- Inspect JSON present: ${report.observations.inspect_json_present ? "yes" : "no"}`,
    `- Env file flags: mvp=${report.observations.env_file_flags.MIXLAB_ADMIN_DOCKER_MVP_MODE || "missing"}, preprocess=${report.observations.env_file_flags.MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER || "missing"}, publish=${report.observations.env_file_flags.MIXLAB_ENABLE_READY_PUBLISH_WORKER || "missing"}`,
    `- Running flags: mvp=${report.observations.inspect_flags.MIXLAB_ADMIN_DOCKER_MVP_MODE || "missing"}, preprocess=${report.observations.inspect_flags.MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER || "missing"}, publish=${report.observations.inspect_flags.MIXLAB_ENABLE_READY_PUBLISH_WORKER || "missing"}`,
    `- Library roots: admin=${report.observations.library_roots.MIXLAB_ADMIN_LIBRARY_ROOT || "missing"}, preprocess=${report.observations.library_roots.MIXLAB_PREPROCESS_LIBRARY_ROOT || "missing"}`,
    `- Image: ${report.observations.image || "unknown"}`,
    `- Container: ${report.observations.container_name || "unknown"}`,
    "",
    "## Remediation Plan",
    "",
    `- Status: ${report.remediation_plan.status}`,
    `- No side effects: ${report.remediation_plan.no_side_effects ? "yes" : "no"}`,
    "",
    "### Target Env",
    "",
    ...Object.entries(report.remediation_plan.target_env).map(([key, value]) => `- ${key}=${value}`),
    "",
    "### Required Changes",
    "",
    ...(report.remediation_plan.required_changes.length > 0
      ? report.remediation_plan.required_changes.map((item) => `- ${item.key}: env_file=${item.env_file_value}, running=${item.running_value}, required=${item.required_value}; ${item.reason}`)
      : ["- none"]),
    "",
    "### Forbidden Actions",
    "",
    ...report.remediation_plan.forbidden_actions.map((item) => `- ${item}`),
    "",
    "### Validation Commands",
    "",
    ...report.remediation_plan.validation_commands.map((item) => `- ${item}`),
    "",
    "## Collection Instructions",
    "",
    ...report.collection_instructions.map((item) => `- ${item}`),
    "",
    "## Summary",
    "",
    `- Passed: ${report.summary.passed}`,
    `- Blocked: ${report.summary.blocked}`,
    `- Upload blockers: ${report.summary.upload_blockers.join(", ") || "none"}`,
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Docker Upload | Evidence | Required Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => [
      item.id,
      item.category,
      item.status,
      item.blocks_docker_upload ? "yes" : "no",
      item.evidence,
      item.required_evidence ?? "n/a"
    ].join(" | ")),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "not written"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "not written"}`,
    ""
  ];

  return `${lines.join("\n")}\n`;
}

async function optionalReadFile(filePath: string | undefined): Promise<string> {
  if (!filePath) {
    return "";
  }

  return readFile(filePath, "utf8");
}

export async function runAdminWorkerEnvProof(input: {
  env_file_path?: string;
  inspect_json_path?: string;
  output_dir?: string;
  generated_at?: string;
  command?: string;
}): Promise<AdminWorkerEnvProofReport> {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const timestamp = timestampForFile(new Date(generatedAt));
  const jsonPath = path.join(outputDir, `admin-worker-env-proof-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-worker-env-proof-${timestamp}.md`);
  const report = buildAdminWorkerEnvProofReport({
    generated_at: generatedAt,
    command: input.command ?? process.argv.join(" "),
    env_file_path: input.env_file_path,
    env_file_raw: await optionalReadFile(input.env_file_path),
    inspect_json_path: input.inspect_json_path,
    inspect_json_raw: await optionalReadFile(input.inspect_json_path)
  });
  const reportWithArtifacts: AdminWorkerEnvProofReport = {
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
  const outputDir = process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const envFilePath = process.env.MIXLAB_ADMIN_WORKER_ENV_FILE ?? "";
  const inspectJsonPath = process.env.MIXLAB_ADMIN_WORKER_INSPECT_JSON ?? "";
  const report = await runAdminWorkerEnvProof({
    env_file_path: envFilePath,
    inspect_json_path: inspectJsonPath,
    output_dir: outputDir,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
