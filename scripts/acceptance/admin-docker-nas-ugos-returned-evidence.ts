import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveUgosAuthFromEnv } from "./admin-docker-nas-ugos-auth.ts";

const DEFAULT_NAS_UGOS_BASE_URL = "http://192.168.1.27:9999";
const DEFAULT_ADMIN_LIVE_BASE_URL = "http://192.168.1.27:18080";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_LIBRARY_ROOT = "/data/PublicLibrary";
const ADMIN_SERVICES = ["admin-api", "admin-worker", "admin-web"] as const;
const WORKER_ENV_KEYS = [
  "MIXLAB_ADMIN_DOCKER_MVP_MODE",
  "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER",
  "MIXLAB_ENABLE_READY_PUBLISH_WORKER"
] as const;
const WORKER_INSPECT_ENV_KEYS = [
  ...WORKER_ENV_KEYS,
  "MIXLAB_ADMIN_LIBRARY_ROOT",
  "MIXLAB_PREPROCESS_LIBRARY_ROOT"
] as const;

type AdminService = typeof ADMIN_SERVICES[number];
type FetchLike = typeof fetch;
type GateStatus = "pass" | "blocked";

interface UgosEnvelope {
  code?: unknown;
  msg?: unknown;
  message?: unknown;
  data?: unknown;
}

interface AdminContainer {
  id: string;
  name: string;
  service: AdminService;
  image: string;
  environment: Record<string, string>;
}

interface EvidenceGate {
  id: string;
  title: string;
  status: GateStatus;
  evidence: string;
  blocks_collection: boolean;
}

interface DiskSnapshot {
  total_bytes: number | null;
  used_bytes: number | null;
  available_bytes: number | null;
  usage_percent: number | null;
}

export interface AdminDockerNasUgosReturnedEvidenceReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-nas-ugos-returned-evidence";
  sources: {
    ugos_base_url: string;
    admin_live_base_url: string;
  };
  output_dir: string;
  no_side_effects: true;
  push_execution_allowed: false;
  docker_deploy_allowed: false;
  docker_runtime_touched: false;
  observations: {
    admin_containers: Array<{
      service: AdminService;
      name: string;
      image: string;
      image_tag: string;
    }>;
    image_tag: string;
    worker_allowlisted_env: Record<string, string>;
    disk_usage_percent: number | null;
  };
  gates: EvidenceGate[];
  result: {
    status: "generated" | "blocked";
    summary: string;
  };
  artifacts: {
    json_path: string;
    markdown_path: string;
    returned_dir: string;
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
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
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

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  parsed.pathname = trimTrailingSlash(parsed.pathname);
  parsed.search = "";
  parsed.hash = "";
  return trimTrailingSlash(parsed.toString());
}

function splitImageReference(reference: string): { repository: string; tag: string } {
  const withoutDigest = reference.split("@")[0] ?? "";
  const lastSlash = withoutDigest.lastIndexOf("/");
  const lastColon = withoutDigest.lastIndexOf(":");

  if (lastColon === -1 || lastColon < lastSlash) {
    return {
      repository: withoutDigest,
      tag: ""
    };
  }

  return {
    repository: withoutDigest.slice(0, lastColon),
    tag: withoutDigest.slice(lastColon + 1)
  };
}

function serviceFromName(name: string): AdminService | null {
  for (const service of ADMIN_SERVICES) {
    if (name.includes(service)) {
      return service;
    }
  }
  return null;
}

function imageFromRecord(record: Record<string, unknown>): string {
  const direct = asString(record.tag) ||
    asString(record.image) ||
    asString(record.Image) ||
    asString(record.imageNameVersion);
  if (direct) {
    return direct;
  }

  const imageName = asString(record.imageName) || asString(record.repository);
  const imageVersion = asString(record.imageVersion) || asString(record.version);
  if (imageName && imageVersion) {
    return `${imageName}:${imageVersion}`;
  }
  return imageName;
}

function containerIdFromRecord(record: Record<string, unknown>): string {
  return asString(record.containerId) ||
    asString(record.containerID) ||
    asString(record.container_id) ||
    asString(record.id) ||
    asString(record.ID);
}

function containerNameFromRecord(record: Record<string, unknown>): string {
  const names = asArray(record.Names).map(asString).filter(Boolean);
  return asString(record.containerName) ||
    asString(record.name) ||
    asString(record.Name).replace(/^\/+/, "") ||
    names[0]?.replace(/^\/+/, "") ||
    "";
}

function recordsFromListData(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.map(asRecord).filter((item) => Object.keys(item).length > 0);
  }

  const record = asRecord(data);
  for (const key of ["result", "rows", "list", "containers", "data"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.map(asRecord).filter((item) => Object.keys(item).length > 0);
    }
  }
  return [];
}

function looksLikeEnvKey(value: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(value);
}

function allowedEnvKey(value: string): value is typeof WORKER_INSPECT_ENV_KEYS[number] {
  return (WORKER_INSPECT_ENV_KEYS as readonly string[]).includes(value);
}

function envFromRecord(record: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  const arrays = [
    record.environmentVariables,
    record.environmentVariable,
    record.env,
    record.Env
  ];

  for (const source of arrays) {
    if (!source) {
      continue;
    }

    if (Array.isArray(source)) {
      for (const item of source) {
        if (typeof item === "string") {
          const equalsIndex = item.indexOf("=");
          const key = equalsIndex === -1 ? item : item.slice(0, equalsIndex);
          const value = equalsIndex === -1 ? "" : item.slice(equalsIndex + 1);
          if (allowedEnvKey(key)) {
            result[key] = value;
          }
          continue;
        }

        const envRecord = asRecord(item);
        const variable = asString(envRecord.variable);
        const price = asString(envRecord.price);
        const key = allowedEnvKey(variable) || looksLikeEnvKey(variable)
          ? variable
          : allowedEnvKey(price) || looksLikeEnvKey(price)
            ? price
            : asString(envRecord.key) || asString(envRecord.name);
        const value = key === variable ? price : key === price ? variable : asString(envRecord.value);

        if (allowedEnvKey(key)) {
          result[key] = value;
        }
      }
      continue;
    }

    if (isRecord(source)) {
      for (const [key, value] of Object.entries(source)) {
        if (allowedEnvKey(key)) {
          result[key] = asString(value);
        }
      }
    }
  }

  return result;
}

function mergeContainer(summary: Record<string, unknown>, detail: Record<string, unknown>): AdminContainer | null {
  const merged = {
    ...summary,
    ...detail
  };
  const name = containerNameFromRecord(merged);
  const service = serviceFromName(name);
  if (!service) {
    return null;
  }

  return {
    id: containerIdFromRecord(merged),
    name,
    service,
    image: imageFromRecord(merged),
    environment: {
      ...envFromRecord(summary),
      ...envFromRecord(detail)
    }
  };
}

function uniqueImageTag(containers: AdminContainer[]): string {
  const tags = [...new Set(containers
    .map((container) => splitImageReference(container.image).tag)
    .filter(Boolean))];
  return tags.length === 1 ? tags[0] ?? "" : "";
}

function envValue(container: AdminContainer, key: typeof WORKER_INSPECT_ENV_KEYS[number]): string {
  return container.environment[key] ?? "";
}

function currentInspectJson(containers: AdminContainer[]): string {
  const rows = containers
    .map((container) => ({
      Name: container.name.startsWith("/") ? container.name : `/${container.name}`,
      Config: {
        Image: container.image,
        Labels: {
          "com.docker.compose.service": container.service
        }
      }
    }))
    .sort((a, b) => String(a.Config.Labels["com.docker.compose.service"]).localeCompare(String(b.Config.Labels["com.docker.compose.service"])));

  return `${JSON.stringify(rows, null, 2)}\n`;
}

function workerEnv(container: AdminContainer): string {
  return WORKER_ENV_KEYS
    .map((key) => `${key}=${envValue(container, key)}`)
    .join("\n") + "\n";
}

function workerInspectJson(container: AdminContainer): string {
  return `${JSON.stringify([
    {
      Name: container.name.startsWith("/") ? container.name : `/${container.name}`,
      Config: {
        Image: container.image,
        Env: WORKER_INSPECT_ENV_KEYS.map((key) => `${key}=${envValue(container, key)}`)
      }
    }
  ], null, 2)}\n`;
}

function diskSnapshotFromStatus(libraryStatus: Record<string, unknown>, dashboardMetrics: Record<string, unknown>): DiskSnapshot {
  const runtimeLoad = asRecord(dashboardMetrics.runtime_load);
  const dashboardDisk = asRecord(runtimeLoad.disk);
  const totalBytes = asNumber(libraryStatus.disk_total_bytes);
  const availableBytes = asNumber(libraryStatus.disk_available_bytes);
  const usedBytes = totalBytes !== null && availableBytes !== null ? totalBytes - availableBytes : null;
  const computedUsagePercent = totalBytes && usedBytes !== null ? Math.round((usedBytes / totalBytes) * 1000) / 10 : null;

  return {
    total_bytes: totalBytes,
    used_bytes: usedBytes,
    available_bytes: availableBytes,
    usage_percent: asNumber(dashboardDisk.usage_percent) ?? computedUsagePercent
  };
}

function diskProofJson(input: {
  generatedAt: string;
  disk: DiskSnapshot;
}): string {
  const check = (id: string, service: string) => ({
    id,
    scope: "container",
    service,
    path: DEFAULT_LIBRARY_ROOT,
    filesystem: "nas-ugos-browserless-live-readonly-library-status",
    total_bytes: input.disk.total_bytes,
    used_bytes: input.disk.used_bytes,
    available_bytes: input.disk.available_bytes,
    usage_percent: input.disk.usage_percent
  });

  return `${JSON.stringify({
    schema_version: "1.0",
    mode: "admin-docker-nas-release-inputs-collector",
    collected_at: input.generatedAt,
    expected_library_root: DEFAULT_LIBRARY_ROOT,
    thresholds: {
      attention_usage_percent: 87,
      block_usage_percent: 92
    },
    checks: [
      check("admin-api-library-root", "admin-api"),
      check("admin-worker-library-root", "admin-worker")
    ]
  }, null, 2)}\n`;
}

function manifest(input: { generatedAt: string }): string {
  return `${[
    "schema_version=1.0",
    "mode=admin-docker-nas-release-inputs-collector",
    `collected_at=${input.generatedAt}`,
    "push_execution_allowed=false",
    "docker_deploy_allowed=false",
    "nas_writes_allowed=false",
    "worker_start_allowed=false",
    "secret_sanitization=sanitized-only",
    "forbidden_full_env=true",
    "forbidden_full_docker_inspect=true",
    "forbidden_secrets=true",
    "file=admin-docker-current.env present=true size_bytes=deferred",
    "file=admin-docker-current.inspect.json present=true size_bytes=deferred",
    "file=admin-worker.env present=true size_bytes=deferred",
    "file=admin-worker.inspect.json present=true size_bytes=deferred",
    "file=admin-docker-disk-proof.json present=true size_bytes=deferred",
    "file=README.md present=true size_bytes=deferred",
    "manifest_file=MANIFEST.txt"
  ].join("\n")}\n`;
}

function readme(input: {
  ugosBaseUrl: string;
  adminLiveBaseUrl: string;
}): string {
  return `# Admin Docker NAS Release Inputs From UGOS Browserless Readonly

This directory is generated from authenticated UGOS Docker read-only endpoints
plus the existing Admin live-readonly disk status endpoint.

Source UGOS base URL:
${input.ugosBaseUrl}

Source Admin live-readonly base URL:
${input.adminLiveBaseUrl}

Safety rules:
- This evidence must not approve Docker upload or deploy by itself.
- Do not include NAS passwords, cookies, tokens, API keys, or full Docker inspect output.
- Only allowlisted worker environment keys are emitted.
- Positive release approval still requires the normal gates to pass.
`;
}

function tokenizedUrl(url: string, token: string): string {
  if (!token) {
    return url;
  }
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}

async function fetchJson(input: {
  fetchImpl: FetchLike;
  url: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  timeout_ms: number;
}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeout_ms);

  try {
    const response = await input.fetchImpl(input.url, {
      method: input.method ?? "GET",
      headers: input.body
        ? {
            ...(input.headers ?? {}),
            "Content-Type": "application/json"
          }
        : input.headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${input.url}`);
    }
    return text ? JSON.parse(text) as unknown : null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchUgosData(input: {
  fetchImpl: FetchLike;
  baseUrl: string;
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  headers: Record<string, string>;
  queryToken: string;
  timeout_ms: number;
}): Promise<unknown> {
  const parsed = await fetchJson({
    fetchImpl: input.fetchImpl,
    url: tokenizedUrl(`${input.baseUrl}${input.path}`, input.queryToken),
    method: input.method,
    body: input.body,
    headers: input.headers,
    timeout_ms: input.timeout_ms
  });
  const envelope = asRecord(parsed) as UgosEnvelope;
  const code = asString(envelope.code);
  if (code && code !== "200") {
    throw new Error(`UGOS ${input.path} returned code=${code} message=${asString(envelope.msg) || asString(envelope.message)}`);
  }
  return envelope.data ?? parsed;
}

async function fetchAdminData(input: {
  fetchImpl: FetchLike;
  baseUrl: string;
  path: string;
  sessionToken: string;
  timeout_ms: number;
}): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    accept: "application/json"
  };
  if (input.sessionToken) {
    headers["X-MixLab-Admin-Session-Token"] = input.sessionToken;
  }

  const parsed = await fetchJson({
    fetchImpl: input.fetchImpl,
    url: `${input.baseUrl}${input.path}`,
    headers,
    timeout_ms: input.timeout_ms
  });
  const envelope = asRecord(parsed);
  return asRecord(envelope.data ?? parsed);
}

async function collectContainers(input: {
  fetchImpl: FetchLike;
  ugosBaseUrl: string;
  headers: Record<string, string>;
  queryToken: string;
  timeout_ms: number;
}): Promise<AdminContainer[]> {
  const listData = await fetchUgosData({
    fetchImpl: input.fetchImpl,
    baseUrl: input.ugosBaseUrl,
    path: "/ugreen/v1/docker/container/ContainerListV2",
    method: "POST",
    body: {
      pageNum: 1,
      pageSize: 50
    },
    headers: input.headers,
    queryToken: input.queryToken,
    timeout_ms: input.timeout_ms
  });
  const summaries = recordsFromListData(listData)
    .filter((item) => serviceFromName(containerNameFromRecord(item)));
  const containers: AdminContainer[] = [];

  for (const summary of summaries) {
    const containerId = containerIdFromRecord(summary);
    let detail: Record<string, unknown> = {};
    if (containerId) {
      const detailData = await fetchUgosData({
        fetchImpl: input.fetchImpl,
        baseUrl: input.ugosBaseUrl,
        path: `/ugreen/v1/docker/container/GetContainerById?containerId=${encodeURIComponent(containerId)}`,
        headers: input.headers,
        queryToken: input.queryToken,
        timeout_ms: input.timeout_ms
      });
      detail = asRecord(detailData);
    }

    const container = mergeContainer(summary, detail);
    if (container) {
      containers.push(container);
    }
  }

  return containers.sort((a, b) => a.service.localeCompare(b.service));
}

function buildGates(input: {
  containers: AdminContainer[];
  worker: AdminContainer | undefined;
  disk: DiskSnapshot;
}): EvidenceGate[] {
  const services = new Set(input.containers.map((container) => container.service));
  const missingServices = ADMIN_SERVICES.filter((service) => !services.has(service));
  const diskUsable = input.disk.total_bytes !== null &&
    input.disk.used_bytes !== null &&
    input.disk.available_bytes !== null &&
    input.disk.usage_percent !== null;

  return [
    {
      id: "ugos-returned-evidence-no-side-effects",
      title: "UGOS returned evidence collection is read-only",
      status: "pass",
      evidence: "Uses UGOS Docker read endpoints and Admin live-readonly GET endpoints only; it does not start/stop containers, push/pull images, exec into containers, edit NAS files, or run preprocess.",
      blocks_collection: false
    },
    {
      id: "admin-containers-discovered",
      title: "Admin Docker containers are discovered",
      status: missingServices.length === 0 ? "pass" : "blocked",
      evidence: missingServices.length === 0 ? "admin-web, admin-api, admin-worker found" : `missing: ${missingServices.join(", ")}`,
      blocks_collection: missingServices.length > 0
    },
    {
      id: "admin-worker-detail-readable",
      title: "Admin worker detail is readable",
      status: input.worker ? "pass" : "blocked",
      evidence: input.worker ? input.worker.name : "admin-worker detail missing",
      blocks_collection: !input.worker
    },
    {
      id: "disk-readonly-status-readable",
      title: "NAS disk readonly status is numeric",
      status: diskUsable ? "pass" : "blocked",
      evidence: `usage_percent=${input.disk.usage_percent ?? "missing"}`,
      blocks_collection: !diskUsable
    },
    {
      id: "docker-deploy-not-approved",
      title: "Collector does not approve Docker deploy",
      status: "pass",
      evidence: "push_execution_allowed=false, docker_deploy_allowed=false, docker_runtime_touched=false",
      blocks_collection: false
    }
  ];
}

export function toMarkdown(report: AdminDockerNasUgosReturnedEvidenceReport): string {
  return [
    "# Admin Docker NAS UGOS Returned Evidence",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Result: ${report.result.status}`,
    `Returned dir: ${report.output_dir}`,
    "Push execution allowed: no",
    "Docker deploy allowed: no",
    "Docker runtime touched: no",
    "",
    "## Sources",
    "",
    `- UGOS base URL: ${report.sources.ugos_base_url}`,
    `- Admin live base URL: ${report.sources.admin_live_base_url}`,
    "",
    "## Observations",
    "",
    `- Image tag: ${report.observations.image_tag || "<missing>"}`,
    `- Disk usage: ${report.observations.disk_usage_percent ?? "<missing>"}`,
    `- Admin containers: ${report.observations.admin_containers.map((item) => `${item.service}:${item.image_tag || "no-tag"}`).join(", ") || "none"}`,
    `- Worker allowlisted env keys: ${Object.keys(report.observations.worker_allowlisted_env).join(", ") || "none"}`,
    "",
    "## Gates",
    "",
    "| Gate | Status | Blocks Collection | Evidence |",
    "| --- | --- | --- | --- |",
    ...report.gates.map((item) => `| ${item.id} | ${item.status} | ${item.blocks_collection ? "yes" : "no"} | ${item.evidence.replace(/\|/g, "/")} |`),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "<not written>"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "<not written>"}`,
    `- Returned evidence directory: ${report.artifacts?.returned_dir ?? "<not written>"}`,
    ""
  ].join("\n");
}

export async function runAdminDockerNasUgosReturnedEvidence(input: {
  ugos_base_url?: string;
  admin_live_base_url?: string;
  output_parent_dir?: string;
  output_dir?: string;
  generated_at?: string;
  command?: string;
  timeout_ms?: number;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
} = {}): Promise<AdminDockerNasUgosReturnedEvidenceReport> {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const stamp = timestampForFile(new Date(generatedAt));
  const ugosBaseUrl = normalizeBaseUrl(input.ugos_base_url ?? DEFAULT_NAS_UGOS_BASE_URL);
  const adminLiveBaseUrl = normalizeBaseUrl(input.admin_live_base_url ?? DEFAULT_ADMIN_LIVE_BASE_URL);
  const outputParentDir = input.output_parent_dir ?? DEFAULT_OUTPUT_DIR;
  const outputDir = input.output_dir ?? path.join(outputParentDir, `admin-docker-nas-ugos-returned-evidence-${stamp}`, "admin-docker-release-inputs");
  const timeoutMs = input.timeout_ms ?? 8000;
  const fetchImpl = input.fetchImpl ?? fetch;
  const env = input.env ?? process.env;
  const auth = await resolveUgosAuthFromEnv({
    env,
    baseUrl: ugosBaseUrl,
    fetchImpl,
    timeout_ms: timeoutMs
  });
  const containers = await collectContainers({
    fetchImpl,
    ugosBaseUrl,
    headers: auth.headers,
    queryToken: auth.query_token,
    timeout_ms: timeoutMs
  });
  const worker = containers.find((container) => container.service === "admin-worker");
  const libraryStatus = await fetchAdminData({
    fetchImpl,
    baseUrl: adminLiveBaseUrl,
    path: "/api/admin/library/status",
    sessionToken: env.MIXLAB_ADMIN_DOCKER_LIVE_SESSION_TOKEN?.trim() ?? "",
    timeout_ms: timeoutMs
  });
  const dashboardMetrics = await fetchAdminData({
    fetchImpl,
    baseUrl: adminLiveBaseUrl,
    path: "/api/admin/dashboard/metrics",
    sessionToken: env.MIXLAB_ADMIN_DOCKER_LIVE_SESSION_TOKEN?.trim() ?? "",
    timeout_ms: timeoutMs
  });
  const disk = diskSnapshotFromStatus(libraryStatus, dashboardMetrics);
  const gates = buildGates({ containers, worker, disk });
  const blocked = gates.some((item) => item.blocks_collection && item.status !== "pass");
  const imageTag = uniqueImageTag(containers);
  const summaryPath = path.join(outputParentDir, `admin-docker-nas-ugos-returned-evidence-${stamp}.json`);
  const markdownPath = path.join(outputParentDir, `admin-docker-nas-ugos-returned-evidence-${stamp}.md`);
  const workerAllowlistedEnv = worker
    ? Object.fromEntries(WORKER_INSPECT_ENV_KEYS.map((key) => [key, envValue(worker, key)]))
    : {};

  const report: AdminDockerNasUgosReturnedEvidenceReport = {
    schema_version: "1.0",
    generated_at: generatedAt,
    command: input.command ?? "npx tsx scripts/acceptance/admin-docker-nas-ugos-returned-evidence.ts",
    mode: "admin-docker-nas-ugos-returned-evidence",
    sources: {
      ugos_base_url: ugosBaseUrl,
      admin_live_base_url: adminLiveBaseUrl
    },
    output_dir: outputDir,
    no_side_effects: true,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    docker_runtime_touched: false,
    observations: {
      admin_containers: containers.map((container) => ({
        service: container.service,
        name: container.name,
        image: container.image,
        image_tag: splitImageReference(container.image).tag
      })),
      image_tag: imageTag,
      worker_allowlisted_env: workerAllowlistedEnv,
      disk_usage_percent: disk.usage_percent
    },
    gates,
    result: {
      status: blocked ? "blocked" : "generated",
      summary: blocked
        ? "UGOS browserless returned evidence collection could not generate a complete sanitized evidence directory."
        : "UGOS browserless returned evidence collection generated a sanitized local evidence directory."
    },
    artifacts: {
      json_path: summaryPath,
      markdown_path: markdownPath,
      returned_dir: outputDir
    }
  };

  if (blocked || !worker) {
    await mkdir(outputParentDir, { recursive: true });
    await writeFile(summaryPath, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(markdownPath, toMarkdown(report));
    return report;
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "admin-docker-current.env"), `MIXLAB_IMAGE_TAG=${imageTag}\n`);
  await writeFile(path.join(outputDir, "admin-docker-current.inspect.json"), currentInspectJson(containers));
  await writeFile(path.join(outputDir, "admin-worker.env"), workerEnv(worker));
  await writeFile(path.join(outputDir, "admin-worker.inspect.json"), workerInspectJson(worker));
  await writeFile(path.join(outputDir, "admin-docker-disk-proof.json"), diskProofJson({ generatedAt, disk }));
  await writeFile(path.join(outputDir, "README.md"), readme({ ugosBaseUrl, adminLiveBaseUrl }));
  await writeFile(path.join(outputDir, "MANIFEST.txt"), manifest({ generatedAt }));
  await writeFile(summaryPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, toMarkdown(report));

  return report;
}

async function main(): Promise<void> {
  const report = await runAdminDockerNasUgosReturnedEvidence({
    ugos_base_url: process.env.MIXLAB_NAS_UGOS_BASE_URL,
    admin_live_base_url: process.env.MIXLAB_ADMIN_DOCKER_LIVE_BASE_URL,
    output_parent_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    output_dir: process.env.MIXLAB_ADMIN_DOCKER_NAS_UGOS_RETURNED_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    output_dir: report.output_dir,
    push_execution_allowed: report.push_execution_allowed,
    docker_deploy_allowed: report.docker_deploy_allowed,
    docker_runtime_touched: report.docker_runtime_touched,
    image_tag: report.observations.image_tag,
    disk_usage_percent: report.observations.disk_usage_percent,
    blockers: report.gates
      .filter((item) => item.blocks_collection && item.status !== "pass")
      .map((item) => item.id),
    json_path: report.artifacts?.json_path,
    markdown_path: report.artifacts?.markdown_path
  }, null, 2));

  if (report.result.status !== "generated") {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exit(1);
  });
}
