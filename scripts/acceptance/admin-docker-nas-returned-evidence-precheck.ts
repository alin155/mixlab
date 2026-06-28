import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_FILES = [
  "admin-docker-current.env",
  "admin-docker-current.inspect.json",
  "admin-worker.env",
  "admin-worker.inspect.json",
  "admin-docker-disk-proof.json",
  "MANIFEST.txt",
  "README.md"
] as const;

const EVIDENCE_FILES = [
  "admin-docker-current.env",
  "admin-docker-current.inspect.json",
  "admin-worker.env",
  "admin-worker.inspect.json",
  "admin-docker-disk-proof.json"
] as const;

const CURRENT_ENV_KEYS = ["MIXLAB_IMAGE_TAG"];
const WORKER_ENV_KEYS = [
  "MIXLAB_ADMIN_DOCKER_MVP_MODE",
  "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER",
  "MIXLAB_ENABLE_READY_PUBLISH_WORKER"
];
const WORKER_INSPECT_ENV_KEYS = [
  ...WORKER_ENV_KEYS,
  "MIXLAB_ADMIN_LIBRARY_ROOT",
  "MIXLAB_PREPROCESS_LIBRARY_ROOT"
];
const EXPECTED_SERVICES = ["admin-api", "admin-worker", "admin-web"];
const EXPECTED_LIBRARY_ROOT = "/data/PublicLibrary";
const SENSITIVE_PATTERN = /(password|passwd|token|secret|authorization|cookie|set-cookie|bearer|api[_-]?key|access[_-]?key|private[_-]?key|asr)/i;

interface PrecheckIssue {
  code: string;
  file?: string;
  message: string;
}

interface FileObservation {
  name: string;
  present: boolean;
  size_bytes: number | null;
}

export interface AdminDockerNasReturnedEvidencePrecheckReport {
  schema_version: "1.0";
  mode: "admin-docker-nas-returned-evidence-precheck";
  returned_dir: string;
  precheck_passed: boolean;
  files: FileObservation[];
  issues: PrecheckIssue[];
  result: {
    status: "pass" | "blocked";
    summary: string;
  };
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

function parseEnvLines(raw: string): Map<string, string> {
  const values = new Map<string, string>();

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      values.set(trimmed, "");
      continue;
    }

    values.set(trimmed.slice(0, equalsIndex), trimmed.slice(equalsIndex + 1));
  }

  return values;
}

function keyList(values: Map<string, string>): string[] {
  return [...values.keys()].sort();
}

function addIssue(issues: PrecheckIssue[], code: string, message: string, file?: string): void {
  issues.push({ code, file, message });
}

function unknownKeys(observed: string[], allowed: string[]): string[] {
  const allowedSet = new Set(allowed);
  return observed.filter((key) => !allowedSet.has(key));
}

function missingKeys(observed: string[], required: string[]): string[] {
  const observedSet = new Set(observed);
  return required.filter((key) => !observedSet.has(key));
}

function parseJsonFile(raw: string, file: string, issues: PrecheckIssue[]): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    addIssue(issues, "invalid-json", `${file} is not valid JSON: ${errorMessage(error)}`, file);
    return undefined;
  }
}

function serviceName(container: Record<string, unknown>): string {
  const labels = asRecord(asRecord(container.Config).Labels);
  const composeService = asString(labels["com.docker.compose.service"]);
  const name = asString(container.Name).replace(/^\/+/, "");
  return composeService || EXPECTED_SERVICES.find((service) => name.includes(service)) || "";
}

function validateManifest(raw: string, issues: PrecheckIssue[]): void {
  const values = parseEnvLines(raw);
  const requiredFlags: Record<string, string> = {
    schema_version: "1.0",
    mode: "admin-docker-nas-release-inputs-collector",
    push_execution_allowed: "false",
    docker_deploy_allowed: "false",
    nas_writes_allowed: "false",
    worker_start_allowed: "false",
    secret_sanitization: "sanitized-only",
    forbidden_full_env: "true",
    forbidden_full_docker_inspect: "true",
    forbidden_secrets: "true"
  };

  for (const [key, expected] of Object.entries(requiredFlags)) {
    const actual = values.get(key) ?? "";
    if (actual !== expected) {
      addIssue(issues, "manifest-safety-flag", `MANIFEST.txt must contain ${key}=${expected}; observed ${actual || "missing"}.`, "MANIFEST.txt");
    }
  }
}

function validateEnvFile(input: {
  file: string;
  raw: string;
  requiredKeys: string[];
  exactKeys: boolean;
  issues: PrecheckIssue[];
}): void {
  const values = parseEnvLines(input.raw);
  const observed = keyList(values);
  const missing = missingKeys(observed, input.requiredKeys);
  const extra = input.exactKeys ? unknownKeys(observed, input.requiredKeys) : [];

  if (missing.length > 0) {
    addIssue(input.issues, "env-required-keys", `${input.file} is missing required keys: ${missing.join(", ")}`, input.file);
  }
  if (extra.length > 0) {
    addIssue(input.issues, "env-extra-keys", `${input.file} contains unexpected keys: ${extra.join(", ")}`, input.file);
  }
}

function validateCurrentInspect(raw: string, issues: PrecheckIssue[]): void {
  const parsed = parseJsonFile(raw, "admin-docker-current.inspect.json", issues);
  const containers = Array.isArray(parsed) ? parsed.map((item) => asRecord(item)) : [];
  if (!Array.isArray(parsed)) {
    addIssue(issues, "inspect-array", "admin-docker-current.inspect.json must be a JSON array.", "admin-docker-current.inspect.json");
    return;
  }

  const services = containers.map(serviceName).filter(Boolean).sort();
  const missing = missingKeys(services, EXPECTED_SERVICES);
  const extra = unknownKeys(services, EXPECTED_SERVICES);
  if (missing.length > 0) {
    addIssue(issues, "inspect-services", `admin-docker-current.inspect.json is missing services: ${missing.join(", ")}`, "admin-docker-current.inspect.json");
  }
  if (extra.length > 0) {
    addIssue(issues, "inspect-services", `admin-docker-current.inspect.json contains unexpected services: ${extra.join(", ")}`, "admin-docker-current.inspect.json");
  }

  for (const container of containers) {
    const config = asRecord(container.Config);
    if (Array.isArray(config.Env)) {
      addIssue(issues, "inspect-env-present", "admin-docker-current.inspect.json must not include Config.Env.", "admin-docker-current.inspect.json");
    }
    if (!asString(config.Image) && !asString(container.Image)) {
      addIssue(issues, "inspect-image-missing", "admin-docker-current.inspect.json container is missing image reference.", "admin-docker-current.inspect.json");
    }
  }
}

function validateWorkerInspect(raw: string, issues: PrecheckIssue[]): void {
  const parsed = parseJsonFile(raw, "admin-worker.inspect.json", issues);
  const containers = Array.isArray(parsed) ? parsed.map((item) => asRecord(item)) : [];
  if (!Array.isArray(parsed) || containers.length !== 1) {
    addIssue(issues, "worker-inspect-singleton", "admin-worker.inspect.json must be a one-item JSON array.", "admin-worker.inspect.json");
    return;
  }

  const config = asRecord(containers[0]?.Config);
  const env = asArray(config.Env).filter((item): item is string => typeof item === "string");
  const values = parseEnvLines(env.join("\n"));
  const observed = keyList(values);
  const missing = missingKeys(observed, WORKER_INSPECT_ENV_KEYS);
  const extra = unknownKeys(observed, WORKER_INSPECT_ENV_KEYS);

  if (missing.length > 0) {
    addIssue(issues, "worker-inspect-env", `admin-worker.inspect.json is missing env keys: ${missing.join(", ")}`, "admin-worker.inspect.json");
  }
  if (extra.length > 0) {
    addIssue(issues, "worker-inspect-env", `admin-worker.inspect.json contains unexpected env keys: ${extra.join(", ")}`, "admin-worker.inspect.json");
  }
  if ((values.get("MIXLAB_ADMIN_LIBRARY_ROOT") ?? "") !== EXPECTED_LIBRARY_ROOT ||
      (values.get("MIXLAB_PREPROCESS_LIBRARY_ROOT") ?? "") !== EXPECTED_LIBRARY_ROOT) {
    addIssue(issues, "worker-inspect-roots", `admin-worker.inspect.json must use ${EXPECTED_LIBRARY_ROOT} library roots.`, "admin-worker.inspect.json");
  }
  if (!asString(config.Image) && !asString(containers[0]?.Image)) {
    addIssue(issues, "worker-inspect-image", "admin-worker.inspect.json is missing image reference.", "admin-worker.inspect.json");
  }
}

function validateDiskProof(raw: string, issues: PrecheckIssue[]): void {
  const parsed = asRecord(parseJsonFile(raw, "admin-docker-disk-proof.json", issues));
  if (asString(parsed.mode) !== "admin-docker-nas-release-inputs-collector") {
    addIssue(issues, "disk-proof-mode", "admin-docker-disk-proof.json has an unexpected mode.", "admin-docker-disk-proof.json");
  }
  if (asString(parsed.expected_library_root) !== EXPECTED_LIBRARY_ROOT) {
    addIssue(issues, "disk-proof-root", `admin-docker-disk-proof.json must target ${EXPECTED_LIBRARY_ROOT}.`, "admin-docker-disk-proof.json");
  }

  const checks = asArray(parsed.checks).map((item) => asRecord(item));
  const ids = checks.map((item) => asString(item.id)).filter(Boolean);
  for (const id of ["admin-api-library-root", "admin-worker-library-root"]) {
    const hasContainerCheck = checks.some((item) => asString(item.id) === id && asString(item.scope) === "container");
    if (!ids.includes(id) || !hasContainerCheck) {
      addIssue(issues, "disk-proof-checks", `admin-docker-disk-proof.json is missing container check ${id}.`, "admin-docker-disk-proof.json");
    }
  }
  for (const check of checks) {
    const id = asString(check.id);
    const scope = asString(check.scope);
    const checkPath = asString(check.path);
    if (scope !== "container" && scope !== "host") {
      addIssue(issues, "disk-proof-check-scope", `disk check ${id || "<unknown>"} must use scope container or host.`, "admin-docker-disk-proof.json");
    }
    if (scope === "container" && checkPath !== EXPECTED_LIBRARY_ROOT) {
      addIssue(issues, "disk-proof-check-path", `container disk check ${id || "<unknown>"} must use ${EXPECTED_LIBRARY_ROOT}.`, "admin-docker-disk-proof.json");
    }
    if (scope === "host" && !checkPath) {
      addIssue(issues, "disk-proof-check-path", `host disk check ${id || "<unknown>"} must include a non-empty host path.`, "admin-docker-disk-proof.json");
    }
    if (typeof check.usage_percent !== "number") {
      addIssue(issues, "disk-proof-usage", `disk check ${asString(check.id) || "<unknown>"} must include numeric usage_percent.`, "admin-docker-disk-proof.json");
    }
  }
}

export async function runAdminDockerNasReturnedEvidencePrecheck(input: {
  returned_dir?: string;
}): Promise<AdminDockerNasReturnedEvidencePrecheckReport> {
  const returnedDir = input.returned_dir ?? "";
  const issues: PrecheckIssue[] = [];
  const files: FileObservation[] = [];

  if (!returnedDir) {
    addIssue(issues, "returned-dir-provided", "Returned evidence directory is not provided.");
    return buildReport(returnedDir, files, issues);
  }

  let entries: string[] = [];
  try {
    const info = await stat(returnedDir);
    if (!info.isDirectory()) {
      addIssue(issues, "returned-dir-directory", `Returned evidence path is not a directory: ${returnedDir}`);
      return buildReport(returnedDir, files, issues);
    }
    entries = await readdir(returnedDir);
  } catch (error) {
    addIssue(issues, "returned-dir-readable", `Returned evidence directory is not readable: ${errorMessage(error)}`);
    return buildReport(returnedDir, files, issues);
  }

  const allowed = new Set<string>(REQUIRED_FILES);
  for (const entry of entries) {
    if (!allowed.has(entry)) {
      addIssue(issues, "returned-file-allowlist", `Unexpected file in returned evidence directory: ${entry}`, entry);
    }
  }

  const rawFiles = new Map<string, string>();
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(returnedDir, file);
    try {
      const info = await stat(filePath);
      const present = info.isFile();
      files.push({
        name: file,
        present,
        size_bytes: present ? info.size : null
      });
      if (!present) {
        addIssue(issues, "returned-file-present", `Required returned evidence path is not a file: ${file}`, file);
        continue;
      }
      if (info.size <= 0) {
        addIssue(issues, "returned-file-nonempty", `Required returned evidence file is empty: ${file}`, file);
        continue;
      }
      rawFiles.set(file, await readFile(filePath, "utf8"));
    } catch {
      files.push({
        name: file,
        present: false,
        size_bytes: null
      });
      addIssue(issues, "returned-file-present", `Required returned evidence file is missing: ${file}`, file);
    }
  }

  for (const file of EVIDENCE_FILES) {
    const raw = rawFiles.get(file) ?? "";
    if (SENSITIVE_PATTERN.test(raw)) {
      addIssue(issues, "returned-file-sensitive-field", `Returned evidence appears to contain sensitive fields: ${file}`, file);
    }
  }

  validateManifest(rawFiles.get("MANIFEST.txt") ?? "", issues);
  validateEnvFile({
    file: "admin-docker-current.env",
    raw: rawFiles.get("admin-docker-current.env") ?? "",
    requiredKeys: CURRENT_ENV_KEYS,
    exactKeys: true,
    issues
  });
  validateEnvFile({
    file: "admin-worker.env",
    raw: rawFiles.get("admin-worker.env") ?? "",
    requiredKeys: WORKER_ENV_KEYS,
    exactKeys: true,
    issues
  });
  validateCurrentInspect(rawFiles.get("admin-docker-current.inspect.json") ?? "", issues);
  validateWorkerInspect(rawFiles.get("admin-worker.inspect.json") ?? "", issues);
  validateDiskProof(rawFiles.get("admin-docker-disk-proof.json") ?? "", issues);

  return buildReport(returnedDir, files, issues);
}

function buildReport(
  returnedDir: string,
  files: FileObservation[],
  issues: PrecheckIssue[]
): AdminDockerNasReturnedEvidencePrecheckReport {
  const passed = issues.length === 0;
  return {
    schema_version: "1.0",
    mode: "admin-docker-nas-returned-evidence-precheck",
    returned_dir: returnedDir,
    precheck_passed: passed,
    files,
    issues,
    result: {
      status: passed ? "pass" : "blocked",
      summary: passed
        ? "Returned NAS release-input evidence passed local format and sanitization prechecks."
        : "Returned NAS release-input evidence failed local format or sanitization prechecks."
    }
  };
}

async function main(): Promise<void> {
  const report = await runAdminDockerNasReturnedEvidencePrecheck({
    returned_dir: process.env.MIXLAB_ADMIN_DOCKER_NAS_RETURNED_DIR ?? process.argv[2]
  });

  console.log(JSON.stringify(report, null, 2));
  if (!report.precheck_passed) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exit(1);
  });
}
