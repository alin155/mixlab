import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { resolveUgosAuthFromEnv, type UgosAuthInputs } from "./admin-docker-nas-ugos-auth.ts";

const DEFAULT_NAS_UGOS_BASE_URL = "http://192.168.1.27:9999";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";

type ProbeStatus = "ok" | "error";
type GateStatus = "pass" | "blocked";
type GateCategory = "safety" | "desktop" | "api" | "auth" | "docker";

interface UgosApiProbeDefinition {
  name: string;
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  expected_json: boolean;
  notes: string;
}

interface UgosApiProbeResult extends UgosApiProbeDefinition {
  url: string;
  status: ProbeStatus;
  duration_ms: number;
  http_status: number | null;
  content_type: string;
  response_bytes: number;
  api_code: string;
  api_message: string;
  data_shape: string;
  error: string;
}

interface UgosApiGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_browserless_collection: boolean;
  blocks_staging_review: boolean;
  required_evidence?: string;
}

interface UgosApiSummary {
  total: number;
  passed: number;
  blocked: number;
  browserless_collection_blockers: string[];
  staging_review_blockers: string[];
}

export interface AdminDockerNasUgosApiPreflightReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-nas-ugos-api-preflight";
  target: {
    base_url: string;
    normalized_base_url: string;
  };
  no_side_effects: true;
  direct_ugos_collection_available: boolean;
  push_execution_allowed: false;
  docker_deploy_allowed: false;
  docker_runtime_touched: false;
  observations: {
    desktop_version: string;
    desktop_build: string;
    auth_header_inputs: UgosAuthInputs;
    probes: UgosApiProbeResult[];
  };
  gates: UgosApiGate[];
  summary: UgosApiSummary;
  next_actions: string[];
  result: {
    status: "browserless-collection-ready" | "blocked";
    summary: string;
  };
  artifacts: {
    json_path: string;
    markdown_path: string;
  } | null;
}

const PROBES: UgosApiProbeDefinition[] = [
  {
    name: "desktop_html",
    path: "/desktop/",
    expected_json: false,
    notes: "UGOS desktop HTML shell."
  },
  {
    name: "verify_is_login",
    path: "/ugreen/v1/verify/is_login",
    expected_json: true,
    notes: "Current UGOS session status."
  },
  {
    name: "current_user",
    path: "/ugreen/v1/user/current/user",
    expected_json: true,
    notes: "Current authenticated user, if a session is available."
  },
  {
    name: "docker_app_uid",
    path: "/ugreen/v1/docker/app/GetUid",
    expected_json: true,
    notes: "Docker app context uid used by the UGOS Docker panel."
  },
  {
    name: "docker_container_list",
    path: "/ugreen/v1/docker/container/ContainerList",
    expected_json: true,
    notes: "Legacy read-only Docker container list endpoint. Kept as a compatibility signal."
  },
  {
    name: "docker_container_list_v2",
    path: "/ugreen/v1/docker/container/ContainerListV2",
    method: "POST",
    body: {
      pageNum: 1,
      pageSize: 20
    },
    expected_json: true,
    notes: "Docker app read-only container list endpoint used by the UGOS Docker UI."
  },
  {
    name: "docker_overview",
    path: "/ugreen/v1/docker/view/ObtainOverviewInfo",
    expected_json: true,
    notes: "Docker app read-only overview endpoint."
  },
  {
    name: "filemgr_share_list",
    path: "/ugreen/v1/filemgr/getShareList",
    expected_json: true,
    notes: "Read-only shared-folder list endpoint."
  },
  {
    name: "machine_common",
    path: "/ugreen/v1/sysinfo/machine/common",
    expected_json: true,
    notes: "Read-only machine info endpoint."
  }
];

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function summarizeDataShape(value: unknown): string {
  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort().slice(0, 12);
    return `object(${keys.join(",") || "no-keys"})`;
  }
  if (value === null || value === undefined) {
    return "empty";
  }
  return typeof value;
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function gate(input: UgosApiGate): UgosApiGate {
  return input;
}

function summarize(gates: UgosApiGate[]): UgosApiSummary {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    browserless_collection_blockers: gates
      .filter((item) => item.blocks_browserless_collection && item.status !== "pass")
      .map((item) => item.id),
    staging_review_blockers: gates
      .filter((item) => item.blocks_staging_review && item.status !== "pass")
      .map((item) => item.id)
  };
}

function apiCode(probe: UgosApiProbeResult | undefined): string {
  return probe?.api_code ?? "";
}

function apiMessage(probe: UgosApiProbeResult | undefined): string {
  return probe?.api_message ?? "";
}

function apiPassed(probe: UgosApiProbeResult | undefined): boolean {
  return Boolean(probe && probe.status === "ok" && probe.http_status === 200 && probe.api_code === "200");
}

function desktopVersionFromHtml(html: string): { desktop_version: string; desktop_build: string } {
  const version = /<html[^>]*\bdata-version="([^"]+)"/i.exec(html)?.[1] ?? "";
  const build = /<html[^>]*\bdata-build="([^"]+)"/i.exec(html)?.[1] ?? "";
  return {
    desktop_version: version,
    desktop_build: build
  };
}

async function fetchDesktopDetails(input: {
  base_url: string;
  headers: Record<string, string>;
  timeout_ms: number;
}): Promise<{ desktop_version: string; desktop_build: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeout_ms);

  try {
    const response = await fetch(`${input.base_url}/desktop/`, {
      method: "GET",
      headers: input.headers,
      redirect: "manual",
      signal: controller.signal
    });
    return desktopVersionFromHtml(await response.text());
  } catch {
    return {
      desktop_version: "",
      desktop_build: ""
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeUgosApi(input: {
  base_url: string;
  definition: UgosApiProbeDefinition;
  headers: Record<string, string>;
  query_token: string;
  timeout_ms: number;
}): Promise<UgosApiProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeout_ms);
  const url = `${input.base_url}${input.definition.path}`;
  const fetchUrl = input.query_token
    ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(input.query_token)}`
    : url;
  const requestBody = input.definition.body ? JSON.stringify(input.definition.body) : undefined;
  const started = performance.now();

  try {
    const response = await fetch(fetchUrl, {
      method: input.definition.method ?? "GET",
      headers: requestBody
        ? {
            ...input.headers,
            "Content-Type": "application/json"
          }
        : input.headers,
      body: requestBody,
      redirect: "manual",
      signal: controller.signal
    });
    const text = await response.text();
    const durationMs = roundMs(performance.now() - started);
    let apiCodeValue = "";
    let apiMessageValue = "";
    let dataShape = "";

    if (input.definition.expected_json) {
      try {
        const parsed = JSON.parse(text) as unknown;
        if (isRecord(parsed)) {
          apiCodeValue = asString(parsed.code);
          apiMessageValue = asString(parsed.msg || parsed.message || parsed.debug);
          dataShape = summarizeDataShape(parsed.data);
        }
      } catch {
        apiMessageValue = "json_parse_failed";
      }
    } else {
      dataShape = "html";
    }

    return {
      ...input.definition,
      url,
      status: "ok",
      duration_ms: durationMs,
      http_status: response.status,
      content_type: response.headers.get("content-type") ?? "",
      response_bytes: Buffer.byteLength(text),
      api_code: apiCodeValue,
      api_message: apiMessageValue,
      data_shape: dataShape,
      error: ""
    };
  } catch (error) {
    return {
      ...input.definition,
      url,
      status: "error",
      duration_ms: roundMs(performance.now() - started),
      http_status: null,
      content_type: "",
      response_bytes: 0,
      api_code: "",
      api_message: "",
      data_shape: "",
      error: errorMessage(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildNextActions(report: AdminDockerNasUgosApiPreflightReport): string[] {
  if (report.direct_ugos_collection_available) {
    return [
      "Use the authenticated UGOS API path to implement a browserless NAS Docker evidence collector.",
      "Keep Docker deploy disabled until returned release inputs, disk proof, worker proof, and Cutter proof are accepted."
    ];
  }

  const actions = [
    "Keep using the portable NAS handoff kit as the primary evidence path until an authenticated UGOS API session is available.",
    "Do not put NAS passwords in scripts, reports, shell history, or committed files."
  ];

  if (report.summary.browserless_collection_blockers.includes("ugos-session-authenticated")) {
    actions.push("If using the UGOS API path, provide a temporary authenticated Cookie/X-Ugreen-Auth header through environment variables only, then rerun this preflight.");
  }
  if (report.summary.browserless_collection_blockers.includes("docker-app-context-ready")) {
    actions.push("Open the Docker app in the NAS desktop once, or provide the required UGOS Docker app context, then rerun this preflight.");
  }
  actions.push("If UGOS API stays blocked, run the already-transferred handoff kit from the NAS desktop or NAS shell and return admin-docker-release-inputs/.");
  return actions;
}

export function buildAdminDockerNasUgosApiPreflightReport(input: {
  generated_at: string;
  command: string;
  base_url: string;
  normalized_base_url: string;
  auth_header_inputs: AdminDockerNasUgosApiPreflightReport["observations"]["auth_header_inputs"];
  probes: UgosApiProbeResult[];
}): AdminDockerNasUgosApiPreflightReport {
  const byName = new Map(input.probes.map((item) => [item.name, item]));
  const desktopProbe = byName.get("desktop_html");
  const loginProbe = byName.get("verify_is_login");
  const dockerUidProbe = byName.get("docker_app_uid");
  const containerListProbe = byName.get("docker_container_list");
  const containerListV2Probe = byName.get("docker_container_list_v2");
  const dockerOverviewProbe = byName.get("docker_overview");
  const desktopReachable = Boolean(desktopProbe && desktopProbe.status === "ok" && desktopProbe.http_status === 200);
  const apiReachable = input.probes.some((item) => item.expected_json && item.status === "ok" && item.http_status === 200);
  const sessionAuthenticated = apiPassed(loginProbe) || input.auth_header_inputs.password_login_succeeded;
  const dockerAppContextReady = apiPassed(dockerUidProbe);
  const dockerContainerListReadable = apiPassed(containerListV2Probe);
  const dockerOverviewReadable = apiPassed(dockerOverviewProbe);
  const directCollectionAvailable = desktopReachable &&
    apiReachable &&
    sessionAuthenticated &&
    dockerAppContextReady &&
    dockerContainerListReadable;
  const desktopDetails = desktopProbe ? desktopVersionFromHtml("") : { desktop_version: "", desktop_build: "" };

  const gates = [
    gate({
      id: "ugos-api-preflight-no-side-effects",
      title: "UGOS API preflight is Docker/runtime read-only",
      category: "safety",
      status: "pass",
      evidence: `Only optional session login plus GET requests and Docker UI read-list POST requests are used; password_login_attempted=${input.auth_header_inputs.password_login_attempted}. No upload, Docker mutation, container exec, compose edit, or PublicLibrary write is attempted.`,
      blocks_browserless_collection: false,
      blocks_staging_review: false
    }),
    gate({
      id: "ugos-auth-inputs-not-recorded",
      title: "UGOS auth inputs are not recorded",
      category: "safety",
      status: "pass",
      evidence: `cookie_present=${input.auth_header_inputs.cookie_present}, query_token_present=${input.auth_header_inputs.query_token_present}, x_ugreen_auth_present=${input.auth_header_inputs.x_ugreen_auth_present}, authorization_present=${input.auth_header_inputs.authorization_present}, username_password_present=${input.auth_header_inputs.username_password_present}, password_login_succeeded=${input.auth_header_inputs.password_login_succeeded}, password_login_code=${input.auth_header_inputs.password_login_code || "n/a"}, password_login_token_present=${input.auth_header_inputs.password_login_token_present}, password_login_cookie_present=${input.auth_header_inputs.password_login_cookie_present}; values are not written to artifacts.`,
      blocks_browserless_collection: false,
      blocks_staging_review: false
    }),
    gate({
      id: "ugos-desktop-reachable",
      title: "UGOS desktop HTTP shell is reachable",
      category: "desktop",
      status: desktopReachable ? "pass" : "blocked",
      evidence: desktopProbe
        ? `http=${desktopProbe.http_status ?? "n/a"}, bytes=${desktopProbe.response_bytes}, error=${desktopProbe.error || "none"}`
        : "desktop probe missing",
      blocks_browserless_collection: true,
      blocks_staging_review: false,
      required_evidence: "NAS desktop /desktop/ must be reachable before trying UGOS API collection."
    }),
    gate({
      id: "ugos-api-json-reachable",
      title: "UGOS JSON API is reachable",
      category: "api",
      status: apiReachable ? "pass" : "blocked",
      evidence: input.probes
        .filter((item) => item.expected_json)
        .map((item) => `${item.name}:http=${item.http_status ?? "n/a"} code=${item.api_code || "n/a"}`)
        .join(", "),
      blocks_browserless_collection: true,
      blocks_staging_review: false,
      required_evidence: "At least one UGOS JSON API endpoint should return HTTP 200."
    }),
    gate({
      id: "ugos-session-authenticated",
      title: "UGOS session is authenticated",
      category: "auth",
      status: sessionAuthenticated ? "pass" : "blocked",
      evidence: `verify_is_login code=${apiCode(loginProbe) || "n/a"}, message=${apiMessage(loginProbe) || loginProbe?.error || "none"}, password_login_succeeded=${input.auth_header_inputs.password_login_succeeded}`,
      blocks_browserless_collection: true,
      blocks_staging_review: false,
      required_evidence: "Provide an authenticated UGOS session or successful in-memory username/password login; do not store NAS password in files or reports."
    }),
    gate({
      id: "docker-app-context-ready",
      title: "UGOS Docker app context is ready",
      category: "docker",
      status: dockerAppContextReady ? "pass" : "blocked",
      evidence: `docker_app_uid code=${apiCode(dockerUidProbe) || "n/a"}, message=${apiMessage(dockerUidProbe) || dockerUidProbe?.error || "none"}, shape=${dockerUidProbe?.data_shape || "n/a"}`,
      blocks_browserless_collection: true,
      blocks_staging_review: false,
      required_evidence: "UGOS Docker app uid/context must be readable before browserless Docker evidence collection can replace SSH/desktop handoff."
    }),
    gate({
      id: "docker-container-list-readable",
      title: "Docker container list is readable through UGOS API",
      category: "docker",
      status: dockerContainerListReadable ? "pass" : "blocked",
      evidence: `docker_container_list_v2 code=${apiCode(containerListV2Probe) || "n/a"}, message=${apiMessage(containerListV2Probe) || containerListV2Probe?.error || "none"}, shape=${containerListV2Probe?.data_shape || "n/a"}; legacy docker_container_list code=${apiCode(containerListProbe) || "n/a"}`,
      blocks_browserless_collection: true,
      blocks_staging_review: true,
      required_evidence: "Docker app ContainerListV2 must be readable before UGOS API can collect current-image and worker proof."
    }),
    gate({
      id: "docker-overview-readable",
      title: "Docker overview is readable through UGOS API",
      category: "docker",
      status: dockerOverviewReadable ? "pass" : "blocked",
      evidence: `docker_overview code=${apiCode(dockerOverviewProbe) || "n/a"}, message=${apiMessage(dockerOverviewProbe) || dockerOverviewProbe?.error || "none"}, shape=${dockerOverviewProbe?.data_shape || "n/a"}`,
      blocks_browserless_collection: false,
      blocks_staging_review: false,
      required_evidence: "Docker overview is useful for desktop parity observation, but returned evidence collection only requires Docker app uid and ContainerListV2/GetContainerById reads."
    }),
    gate({
      id: "ugos-api-does-not-approve-deploy",
      title: "UGOS API preflight does not approve deploy",
      category: "safety",
      status: "pass",
      evidence: "push_execution_allowed=false, docker_deploy_allowed=false, docker_runtime_touched=false",
      blocks_browserless_collection: false,
      blocks_staging_review: false
    })
  ];
  const summary = summarize(gates);
  const report: AdminDockerNasUgosApiPreflightReport = {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-nas-ugos-api-preflight",
    target: {
      base_url: input.base_url,
      normalized_base_url: input.normalized_base_url
    },
    no_side_effects: true,
    direct_ugos_collection_available: directCollectionAvailable,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    docker_runtime_touched: false,
    observations: {
      desktop_version: desktopDetails.desktop_version,
      desktop_build: desktopDetails.desktop_build,
      auth_header_inputs: input.auth_header_inputs,
      probes: input.probes
    },
    gates,
    summary,
    next_actions: [],
    result: {
      status: directCollectionAvailable ? "browserless-collection-ready" : "blocked",
      summary: directCollectionAvailable
        ? "UGOS API is authenticated and can be used as a browserless NAS Docker evidence path."
        : "UGOS API path is not ready for browserless Docker evidence collection."
    },
    artifacts: null
  };

  return {
    ...report,
    next_actions: buildNextActions(report)
  };
}

export function toMarkdown(report: AdminDockerNasUgosApiPreflightReport): string {
  return [
    "# Admin Docker NAS UGOS API Preflight",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Result: ${report.result.status}`,
    `Direct UGOS collection available: ${report.direct_ugos_collection_available ? "yes" : "no"}`,
    "Push execution allowed: no",
    "Docker deploy allowed: no",
    "Docker runtime touched: no",
    "",
    "This preflight is Docker/runtime read-only. It may create a temporary UGOS session when username/password environment variables are supplied, but auth values are not written to artifacts.",
    "",
    "## Target",
    "",
    `- Base URL: ${report.target.normalized_base_url}`,
    `- Desktop version: ${report.observations.desktop_version || "<not parsed>"}`,
    `- Desktop build: ${report.observations.desktop_build || "<not parsed>"}`,
    `- Cookie present: ${report.observations.auth_header_inputs.cookie_present ? "yes" : "no"}`,
    `- Query token present: ${report.observations.auth_header_inputs.query_token_present ? "yes" : "no"}`,
    `- X-Ugreen-Auth present: ${report.observations.auth_header_inputs.x_ugreen_auth_present ? "yes" : "no"}`,
    `- Authorization present: ${report.observations.auth_header_inputs.authorization_present ? "yes" : "no"}`,
    `- Username/password present: ${report.observations.auth_header_inputs.username_password_present ? "yes" : "no"}`,
    `- Password login attempted: ${report.observations.auth_header_inputs.password_login_attempted ? "yes" : "no"}`,
    `- Password login succeeded: ${report.observations.auth_header_inputs.password_login_succeeded ? "yes" : "no"}`,
    `- Password login code: ${report.observations.auth_header_inputs.password_login_code || "n/a"}`,
    `- Password login message: ${report.observations.auth_header_inputs.password_login_message || "n/a"}`,
    `- Password login token present: ${report.observations.auth_header_inputs.password_login_token_present ? "yes" : "no"}`,
    `- Password login cookie present: ${report.observations.auth_header_inputs.password_login_cookie_present ? "yes" : "no"}`,
    "",
    "## Probes",
    "",
    "| Probe | HTTP | API Code | Message | Shape | Duration | Error |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.observations.probes.map((item) => [
      item.name,
      item.http_status ?? "n/a",
      item.api_code || "n/a",
      (item.api_message || "none").replace(/\|/g, "/"),
      item.data_shape || "n/a",
      `${item.duration_ms}ms`,
      (item.error || "none").replace(/\|/g, "/")
    ].join(" | ")).map((line) => `| ${line} |`),
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Browserless Collection | Blocks Staging Review | Evidence | Required Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => [
      item.id,
      item.category,
      item.status,
      item.blocks_browserless_collection ? "yes" : "no",
      item.blocks_staging_review ? "yes" : "no",
      item.evidence.replace(/\|/g, "/"),
      (item.required_evidence ?? "n/a").replace(/\|/g, "/")
    ].join(" | ")).map((line) => `| ${line} |`),
    "",
    "## Summary",
    "",
    `- Browserless collection blockers: ${report.summary.browserless_collection_blockers.join(", ") || "none"}`,
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

export async function runAdminDockerNasUgosApiPreflight(input: {
  base_url?: string;
  output_dir?: string;
  generated_at?: string;
  command?: string;
  timeout_ms?: number;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
} = {}): Promise<AdminDockerNasUgosApiPreflightReport> {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const stamp = timestampForFile(new Date(generatedAt));
  const baseUrl = input.base_url ?? DEFAULT_NAS_UGOS_BASE_URL;
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const timeoutMs = input.timeout_ms ?? 8000;
  const auth = await resolveUgosAuthFromEnv({
    env: input.env ?? process.env,
    baseUrl,
    fetchImpl: input.fetchImpl ?? fetch,
    timeout_ms: timeoutMs
  });
  const probes = await Promise.all(PROBES.map((definition) => probeUgosApi({
    base_url: normalizedBaseUrl,
    definition,
    headers: auth.headers,
    query_token: auth.query_token,
    timeout_ms: timeoutMs
  })));
  const desktopProbe = probes.find((item) => item.name === "desktop_html");
  const desktopDetails = desktopProbe && desktopProbe.status === "ok"
    ? await fetchDesktopDetails({
        base_url: normalizedBaseUrl,
        headers: auth.headers,
        timeout_ms: timeoutMs
      })
    : { desktop_version: "", desktop_build: "" };
  const report = buildAdminDockerNasUgosApiPreflightReport({
    generated_at: generatedAt,
    command: input.command ?? "npx tsx scripts/acceptance/admin-docker-nas-ugos-api-preflight.ts",
    base_url: baseUrl,
    normalized_base_url: normalizedBaseUrl,
    auth_header_inputs: auth.inputs,
    probes
  });
  const reportWithDesktop: AdminDockerNasUgosApiPreflightReport = {
    ...report,
    observations: {
      ...report.observations,
      desktop_version: desktopDetails.desktop_version,
      desktop_build: desktopDetails.desktop_build
    }
  };
  const jsonPath = path.join(outputDir, `admin-docker-nas-ugos-api-preflight-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-nas-ugos-api-preflight-${stamp}.md`);
  const reportWithArtifacts: AdminDockerNasUgosApiPreflightReport = {
    ...reportWithDesktop,
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
  const report = await runAdminDockerNasUgosApiPreflight({
    base_url: process.env.MIXLAB_NAS_UGOS_BASE_URL,
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    direct_ugos_collection_available: report.direct_ugos_collection_available,
    push_execution_allowed: report.push_execution_allowed,
    docker_deploy_allowed: report.docker_deploy_allowed,
    docker_runtime_touched: report.docker_runtime_touched,
    browserless_collection_blockers: report.summary.browserless_collection_blockers,
    staging_review_blockers: report.summary.staging_review_blockers,
    desktop_version: report.observations.desktop_version,
    desktop_build: report.observations.desktop_build,
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
