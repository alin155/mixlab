import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { resolveUgosAuthFromEnv, type UgosAuthInputs } from "./admin-docker-nas-ugos-auth.ts";

const DEFAULT_NAS_UGOS_BASE_URL = "http://192.168.1.27:9999";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const RUNTIME_IMAGE = "ghcr.io/alin155/mixlab-admin-runtime";
const WEB_IMAGE = "ghcr.io/alin155/mixlab-admin-web";

type FetchLike = typeof fetch;
type ProbeStatus = "ok" | "error";
type ResultStatus = "dry-run-ready" | "loaded" | "load-submitted" | "blocked";
type LoadStrategy = "paths" | "path-sequential";

interface UgosMutationProbe {
  name: string;
  path: string;
  method: "POST";
  body_shape: string;
  status: ProbeStatus;
  duration_ms: number;
  http_status: number | null;
  api_code: string;
  api_message: string;
  data_shape: string;
  error: string;
}

interface ImagePresence {
  runtime: boolean;
  web: boolean;
  matched_text: string[];
}

interface EvidenceGate {
  id: string;
  status: "pass" | "blocked";
  evidence: string;
  blocks_load: boolean;
}

export interface AdminDockerNasUgosLoadImageArchivesReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-nas-ugos-load-image-archives";
  target: {
    ugos_base_url: string;
    image_tag: string;
    archive_paths: string[];
  };
  execution: {
    execute_requested: boolean;
    load_strategy: LoadStrategy;
    load_submitted: boolean;
    docker_images_touched: boolean;
    container_runtime_touched: false;
    docker_compose_touched: false;
    public_library_touched: false;
    preprocess_started: false;
    docker_deploy_allowed: false;
    preprocess_execution_allowed: false;
  };
  observations: {
    auth_header_inputs: UgosAuthInputs;
    before_presence: ImagePresence;
    after_presence: ImagePresence;
    path_checks: UgosMutationProbe[];
    load_calls: UgosMutationProbe[];
    show_local_image_polls: UgosMutationProbe[];
  };
  gates: EvidenceGate[];
  summary: {
    total: number;
    passed: number;
    blocked: number;
    load_blockers: string[];
  };
  result: {
    status: ResultStatus;
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

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

function asString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function loadStrategy(value: string | undefined): LoadStrategy {
  return value === "path-sequential" ? "path-sequential" : "paths";
}

function shapeOf(value: unknown): string {
  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }
  if (typeof value === "object" && value !== null) {
    return `object(${Object.keys(value).sort().slice(0, 8).join(",") || "no-keys"})`;
  }
  if (value === null || value === undefined) {
    return "empty";
  }
  return typeof value;
}

function bodyShape(value: unknown): string {
  const record = asRecord(value);
  return `object(${Object.keys(record).sort().join(",") || "no-keys"})`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function parsePaths(input: {
  tag: string;
  archive_dir: string;
  explicit_paths: string;
}): string[] {
  if (input.explicit_paths.trim()) {
    const trimmed = input.explicit_paths.trim();
    if (trimmed.startsWith("[")) {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item)).filter(Boolean);
      }
    }
    return trimmed.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  }

  const dir = input.archive_dir.replace(/\/+$/, "");
  return [
    `${dir}/mixlab-admin-runtime-${input.tag}.tar.gz`,
    `${dir}/mixlab-admin-web-${input.tag}.tar.gz`
  ];
}

function extractEnvelope(value: unknown): { code: string; message: string; data: unknown } {
  const record = asRecord(value);
  return {
    code: asString(record.code),
    message: asString(record.msg || record.message || record.debug),
    data: record.data ?? value
  };
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchUgosJson(input: {
  fetchImpl: FetchLike;
  baseUrl: string;
  path: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  queryToken: string;
  timeout_ms: number;
}): Promise<{ probe: UgosMutationProbe; data: unknown }> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeout_ms);
  const url = `${input.baseUrl}${input.path}`;
  const fetchUrl = input.queryToken
    ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(input.queryToken)}`
    : url;

  try {
    const response = await input.fetchImpl(fetchUrl, {
      method: "POST",
      headers: {
        ...input.headers,
        "Content-Type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(input.body),
      redirect: "manual",
      signal: controller.signal
    });
    const text = await response.text();
    let parsed: unknown = null;
    let apiCode = "";
    let apiMessage = "";
    let data: unknown = null;
    try {
      parsed = JSON.parse(text) as unknown;
      const envelope = extractEnvelope(parsed);
      apiCode = envelope.code;
      apiMessage = envelope.message;
      data = envelope.data;
    } catch {
      apiMessage = "json_parse_failed";
    }
    return {
      probe: {
        name: input.path.split("/").at(-1) ?? input.path,
        path: input.path,
        method: "POST",
        body_shape: bodyShape(input.body),
        status: "ok",
        duration_ms: roundMs(performance.now() - started),
        http_status: response.status,
        api_code: apiCode,
        api_message: apiMessage,
        data_shape: shapeOf(data),
        error: ""
      },
      data
    };
  } catch (error) {
    return {
      probe: {
        name: input.path.split("/").at(-1) ?? input.path,
        path: input.path,
        method: "POST",
        body_shape: bodyShape(input.body),
        status: "error",
        duration_ms: roundMs(performance.now() - started),
        http_status: null,
        api_code: "",
        api_message: "",
        data_shape: "",
        error: errorMessage(error)
      },
      data: null
    };
  } finally {
    clearTimeout(timer);
  }
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    output.push(String(value));
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, output);
    }
    return output;
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) {
      collectStrings(item, output);
    }
  }
  return output;
}

function imagePresence(data: unknown, tag: string): ImagePresence {
  const strings = collectStrings(data);
  const runtimeNeedles = [`${RUNTIME_IMAGE}:${tag}`, RUNTIME_IMAGE, tag];
  const webNeedles = [`${WEB_IMAGE}:${tag}`, WEB_IMAGE, tag];
  const joined = strings.join("\n");
  const runtime = runtimeNeedles.every((needle) => joined.includes(needle));
  const web = webNeedles.every((needle) => joined.includes(needle));
  const matchedText = strings
    .filter((item) => item.includes("mixlab-admin") || item === tag)
    .slice(0, 20);
  return {
    runtime,
    web,
    matched_text: matchedText
  };
}

async function showLocalImages(input: {
  fetchImpl: FetchLike;
  baseUrl: string;
  headers: Record<string, string>;
  queryToken: string;
  timeout_ms: number;
}): Promise<{ probe: UgosMutationProbe; data: unknown }> {
  return fetchUgosJson({
    fetchImpl: input.fetchImpl,
    baseUrl: input.baseUrl,
    path: "/ugreen/v1/docker/image/ShowLocalImageV2",
    body: {
      name: "mixlab-admin",
      pageNum: 1,
      pageSize: 200,
      imageFilter: {
        imageFilterStatus: []
      },
      imageSort: {
        imageSortEnum: 1,
        imageSortOrder: 1
      }
    },
    headers: input.headers,
    queryToken: input.queryToken,
    timeout_ms: input.timeout_ms
  });
}

function buildGates(input: {
  execute: boolean;
  paths: string[];
  auth: UgosAuthInputs;
  loadProbes: UgosMutationProbe[];
  after: ImagePresence;
}): EvidenceGate[] {
  const authReady = input.auth.cookie_present ||
    input.auth.query_token_present ||
    input.auth.x_ugreen_auth_present ||
    input.auth.authorization_present ||
    input.auth.password_login_succeeded;
  const loadAccepted = !input.execute ||
    (input.loadProbes.length > 0 && input.loadProbes.every((probe) => probe.status === "ok" && probe.http_status === 200 && probe.api_code === "200"));
  return [
    {
      id: "ugos-auth-available",
      status: authReady ? "pass" : "blocked",
      evidence: `cookie=${input.auth.cookie_present}, token=${input.auth.query_token_present}, password_login_succeeded=${input.auth.password_login_succeeded}`,
      blocks_load: true
    },
    {
      id: "archive-paths-declared",
      status: input.paths.length >= 2 && input.paths.every((item) => item.endsWith(".tar.gz")) ? "pass" : "blocked",
      evidence: input.paths.join(", "),
      blocks_load: true
    },
    {
      id: "loadpaths-not-run-without-execute",
      status: input.execute || input.loadProbes.length === 0 ? "pass" : "blocked",
      evidence: input.execute ? "execute requested" : "dry-run did not call LoadPaths",
      blocks_load: false
    },
    {
      id: "loadpaths-api-accepted",
      status: loadAccepted ? "pass" : "blocked",
      evidence: input.loadProbes.length > 0
        ? input.loadProbes.map((probe) => `${probe.name}:http=${probe.http_status ?? "n/a"}, code=${probe.api_code || "n/a"}, message=${probe.api_message || probe.error || "none"}`).join("; ")
        : "dry-run",
      blocks_load: input.execute
    },
    {
      id: "target-images-present-after-load",
      status: !input.execute || (input.after.runtime && input.after.web) ? "pass" : "blocked",
      evidence: `runtime=${input.after.runtime}, web=${input.after.web}`,
      blocks_load: input.execute
    },
    {
      id: "no-container-compose-public-library-change",
      status: "pass",
      evidence: "This script only calls Docker image CheckPath/LoadPaths/ShowLocalImageV2; it does not update compose, start/stop containers, edit PublicLibrary, or run preprocess.",
      blocks_load: false
    }
  ];
}

function summarize(gates: EvidenceGate[]) {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    load_blockers: gates.filter((item) => item.blocks_load && item.status !== "pass").map((item) => item.id)
  };
}

function toMarkdown(report: AdminDockerNasUgosLoadImageArchivesReport): string {
  return [
    "# Admin Docker NAS UGOS Load Image Archives",
    "",
    `Generated: ${report.generated_at}`,
    `Result: ${report.result.status}`,
    `UGOS base URL: ${report.target.ugos_base_url}`,
    `Image tag: ${report.target.image_tag}`,
    `Execute requested: ${report.execution.execute_requested ? "yes" : "no"}`,
    `Load strategy: ${report.execution.load_strategy}`,
    `Load submitted: ${report.execution.load_submitted ? "yes" : "no"}`,
    "Container runtime touched: no",
    "Docker compose touched: no",
    "PublicLibrary touched: no",
    "Preprocess started: no",
    "",
    "## Archive Paths",
    "",
    ...report.target.archive_paths.map((item) => `- ${item}`),
    "",
    "## Image Presence",
    "",
    `- Before: runtime=${report.observations.before_presence.runtime}, web=${report.observations.before_presence.web}`,
    `- After: runtime=${report.observations.after_presence.runtime}, web=${report.observations.after_presence.web}`,
    "",
    "## Gates",
    "",
    "| Gate | Status | Blocks Load | Evidence |",
    "| --- | --- | --- | --- |",
    ...report.gates.map((item) => `| ${item.id} | ${item.status} | ${item.blocks_load ? "yes" : "no"} | ${item.evidence.replace(/\|/g, "/")} |`),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "<not written>"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "<not written>"}`,
    ""
  ].join("\n");
}

export async function runAdminDockerNasUgosLoadImageArchives(input: {
  ugos_base_url?: string;
  image_tag?: string;
  archive_dir?: string;
  archive_paths?: string[];
  execute?: boolean;
  load_strategy?: LoadStrategy;
  output_dir?: string;
  generated_at?: string;
  command?: string;
  timeout_ms?: number;
  poll_attempts?: number;
  poll_interval_ms?: number;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
} = {}): Promise<AdminDockerNasUgosLoadImageArchivesReport> {
  const env = input.env ?? process.env;
  const imageTag = input.image_tag ?? env.MIXLAB_DOCKER_TARGET_IMAGE_TAG?.trim() ?? "";
  const archiveDir = input.archive_dir ?? env.MIXLAB_ADMIN_DOCKER_IMAGE_ARCHIVE_NAS_DIR?.trim() ?? `/volume1/MixLab/docker-image-transfer/${imageTag}`;
  const archivePaths = input.archive_paths ?? parsePaths({
    tag: imageTag,
    archive_dir: archiveDir,
    explicit_paths: env.MIXLAB_ADMIN_DOCKER_IMAGE_ARCHIVE_PATHS ?? ""
  });
  const execute = input.execute ?? env.MIXLAB_ADMIN_DOCKER_LOAD_IMAGES_EXECUTE === "1";
  const strategy = input.load_strategy ?? loadStrategy(env.MIXLAB_ADMIN_DOCKER_LOAD_STRATEGY);
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const stamp = timestampForFile(new Date(generatedAt));
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const ugosBaseUrl = normalizeBaseUrl(input.ugos_base_url ?? env.MIXLAB_NAS_UGOS_BASE_URL ?? DEFAULT_NAS_UGOS_BASE_URL);
  const timeoutMs = input.timeout_ms ?? asNumber(env.MIXLAB_ADMIN_DOCKER_LOAD_TIMEOUT_MS, 600000);
  const pollAttempts = input.poll_attempts ?? asNumber(env.MIXLAB_ADMIN_DOCKER_LOAD_POLL_ATTEMPTS, 60);
  const pollIntervalMs = input.poll_interval_ms ?? asNumber(env.MIXLAB_ADMIN_DOCKER_LOAD_POLL_INTERVAL_MS, 10000);
  const fetchImpl = input.fetchImpl ?? fetch;
  const auth = await resolveUgosAuthFromEnv({
    env,
    baseUrl: ugosBaseUrl,
    fetchImpl,
    timeout_ms: Math.min(timeoutMs, 30000)
  });

  const beforeProbe = await showLocalImages({
    fetchImpl,
    baseUrl: ugosBaseUrl,
    headers: auth.headers,
    queryToken: auth.query_token,
    timeout_ms: Math.min(timeoutMs, 30000)
  });
  const beforePresence = imagePresence(beforeProbe.data, imageTag);
  const pathChecks: UgosMutationProbe[] = [];

  for (const archivePath of archivePaths) {
    const check = await fetchUgosJson({
      fetchImpl,
      baseUrl: ugosBaseUrl,
      path: "/ugreen/v1/docker/image/CheckPath",
      body: { path: archivePath },
      headers: auth.headers,
      queryToken: auth.query_token,
      timeout_ms: Math.min(timeoutMs, 30000)
    });
    pathChecks.push({
      ...check.probe,
      name: `CheckPath:${path.basename(archivePath)}`
    });
  }

  const loadProbes: UgosMutationProbe[] = [];
  let loadSubmitted = false;
  if (execute) {
    if (strategy === "path-sequential") {
      for (const archivePath of archivePaths) {
        const load = await fetchUgosJson({
          fetchImpl,
          baseUrl: ugosBaseUrl,
          path: "/ugreen/v1/docker/image/LoadPath",
          body: { path: archivePath },
          headers: auth.headers,
          queryToken: auth.query_token,
          timeout_ms: timeoutMs
        });
        loadProbes.push({
          ...load.probe,
          name: `LoadPath:${path.basename(archivePath)}`
        });
        if (!(load.probe.status === "ok" && load.probe.http_status === 200 && load.probe.api_code === "200")) {
          break;
        }
      }
    } else {
      const load = await fetchUgosJson({
        fetchImpl,
        baseUrl: ugosBaseUrl,
        path: "/ugreen/v1/docker/image/LoadPaths",
        body: { paths: archivePaths },
        headers: auth.headers,
        queryToken: auth.query_token,
        timeout_ms: timeoutMs
      });
      loadProbes.push(load.probe);
    }
    loadSubmitted = loadProbes.length > 0 && loadProbes.every((probe) => probe.status === "ok" && probe.http_status === 200 && probe.api_code === "200");
  }

  const imagePolls: UgosMutationProbe[] = [beforeProbe.probe];
  let afterPresence = beforePresence;
  const shouldPollForLoadedImages = execute && loadSubmitted;
  const maxPolls = shouldPollForLoadedImages ? Math.max(1, pollAttempts) : 1;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (attempt > 0) {
      await delay(pollIntervalMs);
    }
    const poll = await showLocalImages({
      fetchImpl,
      baseUrl: ugosBaseUrl,
      headers: auth.headers,
      queryToken: auth.query_token,
      timeout_ms: Math.min(timeoutMs, 30000)
    });
    imagePolls.push({
      ...poll.probe,
      name: `ShowLocalImageV2:${attempt + 1}`
    });
    afterPresence = imagePresence(poll.data, imageTag);
    if (!execute || (afterPresence.runtime && afterPresence.web)) {
      break;
    }
  }

  const gates = buildGates({
    execute,
    paths: archivePaths,
    auth: auth.inputs,
    loadProbes,
    after: afterPresence
  });
  const summary = summarize(gates);
  const status: ResultStatus = summary.load_blockers.length > 0
    ? "blocked"
    : execute
      ? afterPresence.runtime && afterPresence.web
        ? "loaded"
        : "load-submitted"
      : "dry-run-ready";
  const report: AdminDockerNasUgosLoadImageArchivesReport = {
    schema_version: "1.0",
    generated_at: generatedAt,
    command: input.command ?? "npx tsx scripts/acceptance/admin-docker-nas-ugos-load-image-archives.ts",
    mode: "admin-docker-nas-ugos-load-image-archives",
    target: {
      ugos_base_url: ugosBaseUrl,
      image_tag: imageTag,
      archive_paths: archivePaths
    },
    execution: {
      execute_requested: execute,
      load_strategy: strategy,
      load_submitted: loadSubmitted,
      docker_images_touched: execute && loadSubmitted,
      container_runtime_touched: false,
      docker_compose_touched: false,
      public_library_touched: false,
      preprocess_started: false,
      docker_deploy_allowed: false,
      preprocess_execution_allowed: false
    },
    observations: {
      auth_header_inputs: auth.inputs,
      before_presence: beforePresence,
      after_presence: afterPresence,
      path_checks: pathChecks,
      load_calls: loadProbes,
      show_local_image_polls: imagePolls
    },
    gates,
    summary,
    result: {
      status,
      summary: status === "loaded"
        ? "Target Admin Docker images are present in NAS local Docker image store."
        : status === "dry-run-ready"
          ? "UGOS image archive load dry-run completed without calling LoadPaths."
          : status === "load-submitted"
            ? "UGOS LoadPaths accepted the archive load request, but target images were not verified in the polling window."
            : `Image archive load is blocked: ${summary.load_blockers.join(", ")}`
    },
    artifacts: null
  };

  await mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `admin-docker-nas-ugos-load-image-archives-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-nas-ugos-load-image-archives-${stamp}.md`);
  report.artifacts = {
    json_path: jsonPath,
    markdown_path: markdownPath
  };
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, toMarkdown(report));
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAdminDockerNasUgosLoadImageArchives().then((report) => {
    console.log(JSON.stringify({
      status: report.result.status,
      image_tag: report.target.image_tag,
      execute_requested: report.execution.execute_requested,
      load_strategy: report.execution.load_strategy,
      load_submitted: report.execution.load_submitted,
      after_presence: report.observations.after_presence,
      load_blockers: report.summary.load_blockers,
      json_path: report.artifacts?.json_path,
      markdown_path: report.artifacts?.markdown_path
    }, null, 2));
    process.exitCode = report.result.status === "blocked" ? 1 : 0;
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
