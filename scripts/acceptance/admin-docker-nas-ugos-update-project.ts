import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { resolveUgosAuthFromEnv, type UgosAuthInputs } from "./admin-docker-nas-ugos-auth.ts";

const DEFAULT_NAS_UGOS_BASE_URL = "http://192.168.1.27:9999";
const DEFAULT_ADMIN_LIVE_BASE_URL = "http://192.168.1.27:18080";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const PROJECT_NAME = "mixlab-server";

type FetchLike = typeof fetch;
type ResultStatus = "dry-run-ready" | "updated" | "submitted" | "blocked";

interface UgosProbe {
  name: string;
  status: "ok" | "error";
  duration_ms: number;
  http_status: number | null;
  api_code: string;
  api_message: string;
  error: string;
}

interface HealthProbe {
  ok: boolean;
  http_status: number | null;
  image_tag: string;
  status: string;
  error: string;
}

interface Gate {
  id: string;
  status: "pass" | "blocked";
  evidence: string;
  blocks_update: boolean;
}

export interface AdminDockerNasUgosUpdateProjectReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-nas-ugos-update-project";
  target: {
    ugos_base_url: string;
    admin_live_base_url: string;
    project_name: string;
    target_image_tag: string;
    docker_mvp_allow_commands: string;
  };
  execution: {
    execute_requested: boolean;
    update_submitted: boolean;
    latest_images: false;
    run_project: true;
    public_library_touched: false;
    preprocess_started: false;
  };
  observations: {
    auth_header_inputs: UgosAuthInputs;
    project_info: UgosProbe | null;
    update_project: UgosProbe | null;
    before_content_sha256: string;
    after_content_sha256: string;
    before_images: string[];
    after_images: string[];
    worker_lines_after: string[];
    health: HealthProbe[];
  };
  gates: Gate[];
  summary: {
    total: number;
    passed: number;
    blocked: number;
    update_blockers: string[];
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
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : fallback;
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function adminImages(content: string): string[] {
  return content.match(/ghcr\.io\/alin155\/mixlab-admin-(?:runtime|web):[^\s"']+/g) ?? [];
}

function workerLines(content: string): string[] {
  return content
    .split("\n")
    .filter((line) => line.includes("MIXLAB_ENABLE_") ||
      line.includes("MIXLAB_ADMIN_DOCKER_MVP_MODE") ||
      line.includes("MIXLAB_ADMIN_DOCKER_MVP_ALLOW_COMMANDS") ||
      line.includes("MIXLAB_PREPROCESS_LIBRARY_ROOT") ||
      line.includes("MIXLAB_IMAGE_TAG"))
    .map((line) => line.trim());
}

function yamlQuoted(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function upsertEnvironmentValue(content: string, key: string, value: string, anchorKey: string): string {
  const lines = content.split("\n");
  const keyPattern = new RegExp(`^(\\s*)${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`);
  const anchorPattern = new RegExp(`^(\\s*)${anchorKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`);
  let replaced = false;
  const nextLines: string[] = [];

  for (const line of lines) {
    const keyMatch = line.match(keyPattern);
    if (keyMatch) {
      nextLines.push(`${keyMatch[1]}${key}: ${yamlQuoted(value)}`);
      replaced = true;
      continue;
    }
    nextLines.push(line);
  }

  if (replaced) {
    return nextLines.join("\n");
  }

  const insertedLines: string[] = [];
  for (const line of nextLines) {
    insertedLines.push(line);
    const anchorMatch = line.match(anchorPattern);
    if (anchorMatch) {
      insertedLines.push(`${anchorMatch[1]}${key}: ${yamlQuoted(value)}`);
    }
  }

  return insertedLines.join("\n");
}

function retagProjectContent(content: string, targetTag: string, dockerMvpAllowCommands: string): string {
  const retagged = content
    .replace(/ghcr\.io\/alin155\/mixlab-admin-runtime:[^\s"']+/g, `ghcr.io/alin155/mixlab-admin-runtime:${targetTag}`)
    .replace(/ghcr\.io\/alin155\/mixlab-admin-web:[^\s"']+/g, `ghcr.io/alin155/mixlab-admin-web:${targetTag}`)
    .replace(/(MIXLAB_IMAGE_TAG:\s*["']?)[a-f0-9]{7,40}(["']?)/g, `$1${targetTag}$2`);

  return dockerMvpAllowCommands
    ? upsertEnvironmentValue(
      retagged,
      "MIXLAB_ADMIN_DOCKER_MVP_ALLOW_COMMANDS",
      dockerMvpAllowCommands,
      "MIXLAB_ADMIN_DOCKER_MVP_MODE"
    )
    : retagged;
}

function hasLineValue(content: string, key: string, expected: string): boolean {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}:\\s*["']?${expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?`);
  return pattern.test(content);
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchUgos(input: {
  fetchImpl: FetchLike;
  baseUrl: string;
  path: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  headers: Record<string, string>;
  queryToken: string;
  timeout_ms: number;
}): Promise<{ probe: UgosProbe; data: unknown }> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeout_ms);
  const url = `${input.baseUrl}${input.path}${input.queryToken ? `${input.path.includes("?") ? "&" : "?"}token=${encodeURIComponent(input.queryToken)}` : ""}`;
  try {
    const response = await input.fetchImpl(url, {
      method: input.method,
      headers: {
        ...input.headers,
        accept: "application/json",
        ...(input.body ? { "Content-Type": "application/json" } : {})
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      redirect: "manual",
      signal: controller.signal
    });
    const parsed = asRecord(await response.json().catch(() => null));
    return {
      probe: {
        name: input.path.split("?")[0].split("/").at(-1) ?? input.path,
        status: "ok",
        duration_ms: roundMs(performance.now() - started),
        http_status: response.status,
        api_code: asString(parsed.code),
        api_message: asString(parsed.msg || parsed.message || parsed.debug),
        error: ""
      },
      data: parsed.data ?? parsed
    };
  } catch (error) {
    return {
      probe: {
        name: input.path.split("?")[0].split("/").at(-1) ?? input.path,
        status: "error",
        duration_ms: roundMs(performance.now() - started),
        http_status: null,
        api_code: "",
        api_message: "",
        error: errorMessage(error)
      },
      data: null
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHealth(input: {
  fetchImpl: FetchLike;
  baseUrl: string;
  timeout_ms: number;
}): Promise<HealthProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeout_ms);
  try {
    const response = await input.fetchImpl(`${input.baseUrl}/health`, {
      method: "GET",
      signal: controller.signal
    });
    const parsed = asRecord(await response.json().catch(() => null));
    const data = asRecord(parsed.data);
    const build = asRecord(data.build);
    return {
      ok: response.ok && Boolean(parsed.ok),
      http_status: response.status,
      image_tag: asString(build.image_tag || build.sha || build.version),
      status: asString(data.status),
      error: ""
    };
  } catch (error) {
    return {
      ok: false,
      http_status: null,
      image_tag: "",
      status: "",
      error: errorMessage(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildGates(input: {
  execute: boolean;
  targetTag: string;
  projectProbe: UgosProbe | null;
  updateProbe: UgosProbe | null;
  beforeContent: string;
  afterContent: string;
  health: HealthProbe[];
  dockerMvpAllowCommands: string;
}): Gate[] {
  const projectOk = input.projectProbe?.status === "ok" && input.projectProbe.http_status === 200 && input.projectProbe.api_code === "200";
  const afterImages = adminImages(input.afterContent);
  const targetTagDeclared = input.targetTag.trim().length > 0;
  const runtimeRetagged = afterImages.some((image) => image === `ghcr.io/alin155/mixlab-admin-runtime:${input.targetTag}`);
  const webRetagged = afterImages.some((image) => image === `ghcr.io/alin155/mixlab-admin-web:${input.targetTag}`);
  const updateOk = !input.execute ||
    (input.updateProbe?.status === "ok" && input.updateProbe.http_status === 200 && input.updateProbe.api_code === "200");
  const finalHealth = input.health.at(-1);
  return [
    {
      id: "target-image-tag-declared",
      status: targetTagDeclared ? "pass" : "blocked",
      evidence: targetTagDeclared ? input.targetTag : "missing MIXLAB_DOCKER_TARGET_IMAGE_TAG",
      blocks_update: true
    },
    {
      id: "project-info-readable",
      status: projectOk ? "pass" : "blocked",
      evidence: input.projectProbe ? `http=${input.projectProbe.http_status ?? "n/a"}, code=${input.projectProbe.api_code || "n/a"}, message=${input.projectProbe.api_message || input.projectProbe.error || "none"}` : "missing",
      blocks_update: true
    },
    {
      id: "target-tag-present-after-retag",
      status: targetTagDeclared && runtimeRetagged && webRetagged && afterImages.every((image) => image.endsWith(`:${input.targetTag}`)) ? "pass" : "blocked",
      evidence: afterImages.join(", ") || "no admin runtime/web images found",
      blocks_update: true
    },
    {
      id: "project-content-changed",
      status: input.beforeContent !== input.afterContent ? "pass" : "blocked",
      evidence: input.beforeContent === input.afterContent ? "content did not change" : "content retagged",
      blocks_update: true
    },
    {
      id: "worker-flags-disabled",
      status: hasLineValue(input.afterContent, "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER", "0") &&
        hasLineValue(input.afterContent, "MIXLAB_ENABLE_READY_PUBLISH_WORKER", "0") ? "pass" : "blocked",
      evidence: workerLines(input.afterContent).join("; "),
      blocks_update: true
    },
    {
      id: "mvp-mode-and-preprocess-root",
      status: hasLineValue(input.afterContent, "MIXLAB_ADMIN_DOCKER_MVP_MODE", "v0.1") &&
        hasLineValue(input.afterContent, "MIXLAB_PREPROCESS_LIBRARY_ROOT", "/data/PublicLibrary") ? "pass" : "blocked",
      evidence: workerLines(input.afterContent).join("; "),
      blocks_update: true
    },
    {
      id: "mvp-command-allowlist-applied",
      status: !input.dockerMvpAllowCommands ||
        hasLineValue(input.afterContent, "MIXLAB_ADMIN_DOCKER_MVP_ALLOW_COMMANDS", input.dockerMvpAllowCommands) ? "pass" : "blocked",
      evidence: input.dockerMvpAllowCommands
        ? workerLines(input.afterContent).join("; ")
        : "no explicit command allowlist requested",
      blocks_update: true
    },
    {
      id: "public-library-mount-preserved",
      status: input.afterContent.includes("/volume1/MixLab/PublicLibrary:/data/PublicLibrary") ? "pass" : "blocked",
      evidence: input.afterContent.includes("/volume1/MixLab/PublicLibrary:/data/PublicLibrary") ? "mount present" : "mount missing",
      blocks_update: true
    },
    {
      id: "update-project-api-accepted",
      status: updateOk ? "pass" : "blocked",
      evidence: input.updateProbe ? `http=${input.updateProbe.http_status ?? "n/a"}, code=${input.updateProbe.api_code || "n/a"}, message=${input.updateProbe.api_message || input.updateProbe.error || "none"}` : "dry-run",
      blocks_update: input.execute
    },
    {
      id: "health-target-image-visible",
      status: !input.execute || finalHealth?.image_tag === input.targetTag ? "pass" : "blocked",
      evidence: finalHealth ? `ok=${finalHealth.ok}, status=${finalHealth.status || "n/a"}, image_tag=${finalHealth.image_tag || "n/a"}, error=${finalHealth.error || "none"}` : "not checked",
      blocks_update: input.execute
    }
  ];
}

function summarize(gates: Gate[]) {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    update_blockers: gates.filter((item) => item.blocks_update && item.status !== "pass").map((item) => item.id)
  };
}

function toMarkdown(report: AdminDockerNasUgosUpdateProjectReport): string {
  return [
    "# Admin Docker NAS UGOS Update Project",
    "",
    `Generated: ${report.generated_at}`,
    `Result: ${report.result.status}`,
    `Project: ${report.target.project_name}`,
    `Target image tag: ${report.target.target_image_tag}`,
    `Execute requested: ${report.execution.execute_requested ? "yes" : "no"}`,
    `Update submitted: ${report.execution.update_submitted ? "yes" : "no"}`,
    "Latest images pull: no",
    "PublicLibrary touched: no",
    "Preprocess started: no",
    "",
    "## Images",
    "",
    `- Before: ${report.observations.before_images.join(", ") || "none"}`,
    `- After: ${report.observations.after_images.join(", ") || "none"}`,
    "",
    "## Worker Lines",
    "",
    ...report.observations.worker_lines_after.map((line) => `- ${line}`),
    "",
    "## Gates",
    "",
    "| Gate | Status | Blocks Update | Evidence |",
    "| --- | --- | --- | --- |",
    ...report.gates.map((item) => `| ${item.id} | ${item.status} | ${item.blocks_update ? "yes" : "no"} | ${item.evidence.replace(/\|/g, "/")} |`),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "<not written>"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "<not written>"}`,
    ""
  ].join("\n");
}

export async function runAdminDockerNasUgosUpdateProject(input: {
  ugos_base_url?: string;
  admin_live_base_url?: string;
  target_image_tag?: string;
  execute?: boolean;
  output_dir?: string;
  generated_at?: string;
  command?: string;
  timeout_ms?: number;
  health_poll_attempts?: number;
  health_poll_interval_ms?: number;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
} = {}): Promise<AdminDockerNasUgosUpdateProjectReport> {
  const env = input.env ?? process.env;
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const stamp = timestampForFile(new Date(generatedAt));
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const ugosBaseUrl = normalizeBaseUrl(input.ugos_base_url ?? env.MIXLAB_NAS_UGOS_BASE_URL ?? DEFAULT_NAS_UGOS_BASE_URL);
  const adminLiveBaseUrl = normalizeBaseUrl(input.admin_live_base_url ?? env.MIXLAB_ADMIN_DOCKER_LIVE_BASE_URL ?? DEFAULT_ADMIN_LIVE_BASE_URL);
  const targetTag = input.target_image_tag ?? env.MIXLAB_DOCKER_TARGET_IMAGE_TAG?.trim() ?? "";
  const dockerMvpAllowCommands = env.MIXLAB_ADMIN_DOCKER_MVP_ALLOW_COMMANDS?.trim() ?? "";
  const execute = input.execute ?? env.MIXLAB_ADMIN_DOCKER_UPDATE_PROJECT_EXECUTE === "1";
  const timeoutMs = input.timeout_ms ?? asNumber(env.MIXLAB_ADMIN_DOCKER_UPDATE_PROJECT_TIMEOUT_MS, 600000);
  const healthPollAttempts = input.health_poll_attempts ?? asNumber(env.MIXLAB_ADMIN_DOCKER_UPDATE_HEALTH_POLL_ATTEMPTS, 60);
  const healthPollIntervalMs = input.health_poll_interval_ms ?? asNumber(env.MIXLAB_ADMIN_DOCKER_UPDATE_HEALTH_POLL_INTERVAL_MS, 5000);
  const fetchImpl = input.fetchImpl ?? fetch;
  const auth = await resolveUgosAuthFromEnv({
    env,
    baseUrl: ugosBaseUrl,
    fetchImpl,
    timeout_ms: Math.min(timeoutMs, 30000)
  });

  const project = await fetchUgos({
    fetchImpl,
    baseUrl: ugosBaseUrl,
    path: `/ugreen/v1/docker/compose/GetProjectInfoV2?projectName=${encodeURIComponent(PROJECT_NAME)}`,
    method: "GET",
    headers: auth.headers,
    queryToken: auth.query_token,
    timeout_ms: Math.min(timeoutMs, 30000)
  });
  const projectData = asRecord(project.data);
  const beforeContent = asString(projectData.content);
  const afterContent = targetTag ? retagProjectContent(beforeContent, targetTag, dockerMvpAllowCommands) : beforeContent;
  let updateProbe: UgosProbe | null = null;
  let updateSubmitted = false;

  const preflightGates = buildGates({
    execute: false,
    targetTag,
    projectProbe: project.probe,
    updateProbe: null,
    beforeContent,
    afterContent,
    health: [],
    dockerMvpAllowCommands
  });
  const preflightSummary = summarize(preflightGates);

  if (execute && preflightSummary.update_blockers.length === 0) {
    const update = await fetchUgos({
      fetchImpl,
      baseUrl: ugosBaseUrl,
      path: "/ugreen/v1/docker/compose/UpdateProject",
      method: "POST",
      body: {
        cols: 80,
        projectContent: afterContent,
        projectName: PROJECT_NAME,
        runProject: true,
        latestImages: false
      },
      headers: auth.headers,
      queryToken: auth.query_token,
      timeout_ms: timeoutMs
    });
    updateProbe = update.probe;
    updateSubmitted = update.probe.status === "ok" && update.probe.http_status === 200 && update.probe.api_code === "200";
  }

  const health: HealthProbe[] = [];
  if (execute && updateSubmitted) {
    for (let attempt = 0; attempt < Math.max(1, healthPollAttempts); attempt += 1) {
      if (attempt > 0) {
        await delay(healthPollIntervalMs);
      }
      const probe = await fetchHealth({
        fetchImpl,
        baseUrl: adminLiveBaseUrl,
        timeout_ms: Math.min(timeoutMs, 30000)
      });
      health.push(probe);
      if (probe.image_tag === targetTag) {
        break;
      }
    }
  }

  const gates = buildGates({
    execute,
    targetTag,
    projectProbe: project.probe,
    updateProbe,
    beforeContent,
    afterContent,
    health,
    dockerMvpAllowCommands
  });
  const summary = summarize(gates);
  const resultStatus: ResultStatus = summary.update_blockers.length > 0
    ? "blocked"
    : execute
      ? health.at(-1)?.image_tag === targetTag
        ? "updated"
        : "submitted"
      : "dry-run-ready";
  const report: AdminDockerNasUgosUpdateProjectReport = {
    schema_version: "1.0",
    generated_at: generatedAt,
    command: input.command ?? "npx tsx scripts/acceptance/admin-docker-nas-ugos-update-project.ts",
    mode: "admin-docker-nas-ugos-update-project",
    target: {
      ugos_base_url: ugosBaseUrl,
      admin_live_base_url: adminLiveBaseUrl,
      project_name: PROJECT_NAME,
      target_image_tag: targetTag,
      docker_mvp_allow_commands: dockerMvpAllowCommands
    },
    execution: {
      execute_requested: execute,
      update_submitted: updateSubmitted,
      latest_images: false,
      run_project: true,
      public_library_touched: false,
      preprocess_started: false
    },
    observations: {
      auth_header_inputs: auth.inputs,
      project_info: project.probe,
      update_project: updateProbe,
      before_content_sha256: sha256(beforeContent),
      after_content_sha256: sha256(afterContent),
      before_images: adminImages(beforeContent),
      after_images: adminImages(afterContent),
      worker_lines_after: workerLines(afterContent),
      health
    },
    gates,
    summary,
    result: {
      status: resultStatus,
      summary: resultStatus === "updated"
        ? "UGOS project update was accepted and Admin health reports the target image tag."
        : resultStatus === "dry-run-ready"
          ? "UGOS project update dry-run is ready; no project update was submitted."
          : resultStatus === "submitted"
            ? "UGOS project update was accepted, but target health was not observed in the polling window."
            : `UGOS project update is blocked: ${summary.update_blockers.join(", ")}`
    },
    artifacts: null
  };

  await mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `admin-docker-nas-ugos-update-project-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-nas-ugos-update-project-${stamp}.md`);
  report.artifacts = {
    json_path: jsonPath,
    markdown_path: markdownPath
  };
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, toMarkdown(report));
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAdminDockerNasUgosUpdateProject().then((report) => {
    console.log(JSON.stringify({
      status: report.result.status,
      target_image_tag: report.target.target_image_tag,
      execute_requested: report.execution.execute_requested,
      update_submitted: report.execution.update_submitted,
      latest_images: report.execution.latest_images,
      health: report.observations.health.at(-1) ?? null,
      update_blockers: report.summary.update_blockers,
      json_path: report.artifacts?.json_path,
      markdown_path: report.artifacts?.markdown_path
    }, null, 2));
    process.exitCode = report.result.status === "blocked" ? 1 : 0;
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
