import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { classifyLiveReadonlyTarget } from "./admin-docker-release-live-readonly.ts";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_EXPECTED_LIBRARY_ROOT = "/data/PublicLibrary";
const DEFAULT_EXPECTED_READY_COUNT = 10471;
const DEFAULT_EXPECTED_INDEX_VERSION = "v010471";

type HttpMethod = "GET";
type ProbeName =
  | "admin_web_root"
  | "health"
  | "auth_status"
  | "library_status"
  | "release_gates"
  | "data_loading_plan"
  | "cutter_users"
  | "preprocess_safety"
  | "preprocess_supervisor_status"
  | "preprocess_jobs";
type GateStatus = "pass" | "blocked" | "fail";
type GateCategory = "target" | "safety" | "auth" | "docker" | "library" | "admin-mvp" | "preprocess";

interface ApiEnvelope {
  ok?: unknown;
  data?: unknown;
  error_code?: unknown;
  message?: unknown;
}

export interface PostReleaseSmokeProbeDefinition {
  name: ProbeName;
  method: HttpMethod;
  path: string;
  timeout_ms: number;
  json: boolean;
  protected: boolean;
  notes: string;
}

export interface PostReleaseSmokeProbeResult {
  name: ProbeName;
  method: HttpMethod;
  path: string;
  duration_ms: number;
  http_status: number | null;
  ok: boolean;
  api_ok: boolean | null;
  response_bytes: number;
  content_type: string;
  data: unknown;
  error_code?: string;
  message?: string;
}

export interface PostReleaseSmokeGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_mvp_completion: boolean;
  required_evidence?: string;
}

export interface AdminDockerPostReleaseSmokeReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-post-release-smoke";
  target: {
    base_url: string;
    normalized_base_url: string;
    safe_to_probe: boolean;
    classification: string;
    notes: string[];
    session_token_present: boolean;
    expected_library_root: string;
    expected_ready_count: number;
    expected_index_version: string;
    expected_target_image_tag: string;
  };
  post_release_smoke_ready: boolean;
  image_push_allowed: false;
  docker_deploy_allowed: false;
  preprocess_execution_allowed: false;
  mutates_nas_files: false;
  observed: {
    auth_mode: string;
    authenticated: boolean | null;
    library_root: string;
    current_index_version: string;
    ready_video_count: number | null;
    total_video_count: number | null;
    build_sha: string;
    build_version: string;
    image_tag: string;
    release_overall_status: string;
    release_allowed: boolean | null;
    data_loading_strategy: string;
    cutter_user_count: number | null;
    preprocess_safety_status: string;
    preprocess_supervisor_state: string;
    preprocess_jobs_count: number | null;
  };
  requests: PostReleaseSmokeProbeResult[];
  gates: PostReleaseSmokeGate[];
  summary: {
    total: number;
    passed: number;
    blocked: number;
    failed: number;
    mvp_completion_blockers: string[];
  };
  result: {
    status: "ready" | "blocked" | "failed";
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

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function optionalTrimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
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
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseExpectedReadyCount(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_EXPECTED_READY_COUNT;
}

function envelopeFromJson(value: unknown): ApiEnvelope {
  return isRecord(value) ? value : {};
}

function responseDataForJson(parsed: unknown): {
  data: unknown;
  api_ok: boolean | null;
  error_code?: string;
  message?: string;
} {
  const envelope = envelopeFromJson(parsed);
  if ("ok" in envelope || "data" in envelope || "error_code" in envelope) {
    return {
      data: envelope.data ?? null,
      api_ok: asBoolean(envelope.ok),
      error_code: typeof envelope.error_code === "string" ? envelope.error_code : undefined,
      message: typeof envelope.message === "string" ? envelope.message : undefined
    };
  }

  return {
    data: parsed,
    api_ok: null
  };
}

function sanitizeData(name: ProbeName, value: unknown): unknown {
  const data = asRecord(value);
  if (name === "auth_status") {
    return {
      auth_mode: asString(data.auth_mode),
      authenticated: asBoolean(data.authenticated),
      user_present: isRecord(data.user)
    };
  }

  if (name === "release_gates") {
    return {
      overall_status: asString(data.overall_status),
      release_allowed: asBoolean(data.release_allowed),
      runtime: data.runtime ?? null,
      build: data.build ?? null,
      version_health_parity: data.version_health_parity ?? null,
      disk_space_protection: data.disk_space_protection ?? null,
      admin_worker_env_proof: data.admin_worker_env_proof ?? null,
      cutter_compatibility_proof: data.cutter_compatibility_proof ?? null,
      docker_upload_allowed: asBoolean(data.docker_upload_allowed),
      gates: asArray(data.gates).map((item) => {
        const gate = asRecord(item);
        return {
          code: asString(gate.code),
          status: asString(gate.status)
        };
      })
    };
  }

  if (name === "cutter_users") {
    const users = asArray(data.users);
    const statusCounts = users.reduce<Record<string, number>>((counts, item) => {
      const status = asString(asRecord(item).status) || "unknown";
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {});
    return {
      user_count: users.length,
      status_counts: statusCounts
    };
  }

  if (name === "preprocess_jobs") {
    const jobs = asArray(data.jobs);
    const statusCounts = jobs.reduce<Record<string, number>>((counts, item) => {
      const status = asString(asRecord(item).status) || asString(asRecord(item).preprocess_status) || "unknown";
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {});
    return {
      job_count: jobs.length,
      status_counts: statusCounts,
      runtime_load: data.runtime_load ?? null,
      meta: data.meta ?? null
    };
  }

  return value;
}

export function buildPostReleaseSmokeProbeDefinitions(): PostReleaseSmokeProbeDefinition[] {
  return [
    {
      name: "admin_web_root",
      method: "GET",
      path: "/",
      timeout_ms: 5_000,
      json: false,
      protected: false,
      notes: "Admin web root is reachable through the final public URL."
    },
    {
      name: "health",
      method: "GET",
      path: "/health",
      timeout_ms: 5_000,
      json: true,
      protected: false,
      notes: "Admin API health, build/version, and runtime path profile."
    },
    {
      name: "auth_status",
      method: "GET",
      path: "/api/admin/auth/status",
      timeout_ms: 5_000,
      json: true,
      protected: true,
      notes: "Authenticated session status. Provide a temporary session token for final smoke."
    },
    {
      name: "library_status",
      method: "GET",
      path: "/api/admin/library/status",
      timeout_ms: 8_000,
      json: true,
      protected: true,
      notes: "Public library counts and current index invariant."
    },
    {
      name: "release_gates",
      method: "GET",
      path: "/api/admin/release-gates",
      timeout_ms: 8_000,
      json: true,
      protected: true,
      notes: "Release safety gates exposed by the deployed Admin API."
    },
    {
      name: "data_loading_plan",
      method: "GET",
      path: "/api/admin/data-loading/plan",
      timeout_ms: 5_000,
      json: true,
      protected: true,
      notes: "Route-owned loading strategy and scan planning contract."
    },
    {
      name: "cutter_users",
      method: "GET",
      path: "/api/admin/cutter-users",
      timeout_ms: 8_000,
      json: true,
      protected: true,
      notes: "Cutter user management list load without approve/disable/password writes."
    },
    {
      name: "preprocess_safety",
      method: "GET",
      path: "/api/admin/preprocess/safety",
      timeout_ms: 8_000,
      json: true,
      protected: true,
      notes: "Preprocess protection and disk safety state."
    },
    {
      name: "preprocess_supervisor_status",
      method: "GET",
      path: "/api/admin/preprocess/supervisor/status",
      timeout_ms: 5_000,
      json: true,
      protected: true,
      notes: "Supervisor status visibility without start/stop."
    },
    {
      name: "preprocess_jobs",
      method: "GET",
      path: "/api/admin/preprocess/jobs?limit=20",
      timeout_ms: 8_000,
      json: true,
      protected: true,
      notes: "Bounded preprocess queue read without retry/recover/queue writes."
    }
  ];
}

function requestFor(requests: PostReleaseSmokeProbeResult[], name: ProbeName): PostReleaseSmokeProbeResult | undefined {
  return requests.find((request) => request.name === name);
}

function dataFor(requests: PostReleaseSmokeProbeResult[], name: ProbeName): unknown {
  return requestFor(requests, name)?.data ?? null;
}

function forbiddenPath(paths: string[]): string {
  return paths.find((item) => /\/(?:scan|apply|publish|repair|queue|retry|recover|start|stop|cancel)(?:\/|$|\?)/.test(item)) ?? "";
}

function gate(input: PostReleaseSmokeGate): PostReleaseSmokeGate {
  return input;
}

function countUsers(data: unknown): number | null {
  const count = asNumber(asRecord(data).user_count);
  return count ?? (Array.isArray(asRecord(data).users) ? asRecord(data).users.length : null);
}

function countJobs(data: unknown): number | null {
  const count = asNumber(asRecord(data).job_count);
  return count ?? (Array.isArray(asRecord(data).jobs) ? asRecord(data).jobs.length : null);
}

function extractHealthBuild(health: unknown, releaseGates: unknown): {
  build_sha: string;
  build_version: string;
  image_tag: string;
} {
  const healthBuild = asRecord(asRecord(health).build);
  const gateBuild = asRecord(asRecord(releaseGates).build);
  return {
    build_sha: asString(healthBuild.sha) || asString(gateBuild.sha),
    build_version: asString(healthBuild.version) || asString(gateBuild.version),
    image_tag: asString(healthBuild.image_tag) || asString(gateBuild.image_tag)
  };
}

function imageMatchesExpected(input: {
  expected: string;
  build_sha: string;
  image_tag: string;
}): boolean {
  if (!input.expected) {
    return false;
  }

  return input.build_sha === input.expected ||
    input.image_tag === input.expected ||
    input.image_tag.endsWith(`:${input.expected}`) ||
    input.image_tag.includes(input.expected);
}

function supervisorIdle(data: unknown): boolean | null {
  const record = asRecord(data);
  const running = asBoolean(record.running);
  if (typeof running === "boolean") {
    return !running;
  }

  const state = asString(record.state).toLowerCase();
  if (!state) {
    return null;
  }

  return state === "idle" || state === "stopped" || state === "disabled";
}

function summarize(gates: PostReleaseSmokeGate[]): AdminDockerPostReleaseSmokeReport["summary"] {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    failed: gates.filter((item) => item.status === "fail").length,
    mvp_completion_blockers: gates
      .filter((item) => item.blocks_mvp_completion && item.status !== "pass")
      .map((item) => item.id)
  };
}

export function buildAdminDockerPostReleaseSmokeReport(input: {
  generated_at: string;
  command: string;
  base_url: string;
  expected_library_root: string;
  expected_ready_count: number;
  expected_index_version: string;
  expected_target_image_tag: string;
  session_token_present: boolean;
  requests: PostReleaseSmokeProbeResult[];
}): AdminDockerPostReleaseSmokeReport {
  const classification = classifyLiveReadonlyTarget(input.base_url);
  const definitions = buildPostReleaseSmokeProbeDefinitions();
  const definitionPaths = definitions.map((definition) => definition.path);
  const forbidden = forbiddenPath(definitionPaths);

  const auth = asRecord(dataFor(input.requests, "auth_status"));
  const library = asRecord(dataFor(input.requests, "library_status"));
  const releaseGates = asRecord(dataFor(input.requests, "release_gates"));
  const dataLoadingPlan = asRecord(dataFor(input.requests, "data_loading_plan"));
  const safety = asRecord(dataFor(input.requests, "preprocess_safety"));
  const supervisor = dataFor(input.requests, "preprocess_supervisor_status");
  const health = dataFor(input.requests, "health");
  const build = extractHealthBuild(health, releaseGates);
  const readyVideoCount = asNumber(library.ready_video_count);
  const currentIndexVersion = asString(library.current_index_version);
  const libraryRoot = asString(library.root_path) || asString(library.library_root);
  const releaseAllowed = asBoolean(releaseGates.release_allowed);
  const dockerUploadAllowed = asBoolean(releaseGates.docker_upload_allowed);
  const safetyStatus = asString(safety.status);
  const idle = supervisorIdle(supervisor);

  const requiredRequestNames: ProbeName[] = [
    "admin_web_root",
    "health",
    "auth_status",
    "library_status",
    "release_gates",
    "data_loading_plan",
    "cutter_users",
    "preprocess_safety",
    "preprocess_supervisor_status",
    "preprocess_jobs"
  ];
  const missingOrFailed = requiredRequestNames.filter((name) => requestFor(input.requests, name)?.ok !== true);
  const targetStatus: GateStatus = classification.safe_to_probe
    ? "pass"
    : classification.kind === "not-configured"
      ? "blocked"
      : "fail";
  const targetReady = targetStatus === "pass";
  const requestOk = (name: ProbeName): boolean => requestFor(input.requests, name)?.ok === true;
  const missingRequestStatus = (passed: boolean): GateStatus => {
    if (passed) {
      return "pass";
    }

    return targetReady ? "fail" : "blocked";
  };
  const authenticated = asBoolean(auth.authenticated);
  const expectedImageConfigured = Boolean(input.expected_target_image_tag);
  const expectedImageMatches = imageMatchesExpected({
    expected: input.expected_target_image_tag,
    build_sha: build.build_sha,
    image_tag: build.image_tag
  });
  const libraryRequestOk = requestOk("library_status");
  const libraryInvariantPass = libraryRoot === input.expected_library_root &&
    readyVideoCount === input.expected_ready_count &&
    currentIndexVersion === input.expected_index_version;
  const releaseGatesOk = requestOk("release_gates") && dockerUploadAllowed !== true;
  const preprocessRequestsOk = requestOk("preprocess_safety") &&
    requestOk("preprocess_supervisor_status") &&
    requestOk("preprocess_jobs");
  const preprocessReadonlyOk = preprocessRequestsOk &&
    safetyStatus !== "blocked" &&
    idle !== false;

  const gates = [
    gate({
      id: "final-admin-target",
      title: "Final Admin URL is a safe Docker admin-web root",
      category: "target",
      status: targetStatus,
      evidence: classification.evidence,
      blocks_mvp_completion: true,
      required_evidence: targetStatus === "pass" ? undefined : "Set MIXLAB_ADMIN_DOCKER_POST_RELEASE_BASE_URL to the deployed NAS Docker admin-web root."
    }),
    gate({
      id: "read-only-probe-boundary",
      title: "Post-release smoke remains read-only",
      category: "safety",
      status: definitions.every((item) => item.method === "GET") && !forbidden ? "pass" : "fail",
      evidence: forbidden
        ? `Forbidden command-like path is present in probe definitions: ${forbidden}`
        : "All post-release smoke probes are GET-only and exclude scan/apply/publish/repair/queue/retry/recover/start/stop/cancel paths.",
      blocks_mvp_completion: true
    }),
    gate({
      id: "final-url-required-requests",
      title: "Final URL exposes all required MVP read endpoints",
      category: "admin-mvp",
      status: missingRequestStatus(missingOrFailed.length === 0),
      evidence: missingOrFailed.length === 0
        ? "All required final smoke endpoints responded successfully."
        : `Missing or failed probes: ${missingOrFailed.join(", ")}.`,
      blocks_mvp_completion: true
    }),
    gate({
      id: "admin-session-proven",
      title: "Admin authenticated session is proven",
      category: "auth",
      status: authenticated === true ? "pass" : input.session_token_present ? "fail" : "blocked",
      evidence: authenticated === true
        ? "GET /api/admin/auth/status returned authenticated=true."
        : input.session_token_present
          ? "A session token was provided, but auth/status did not prove authenticated=true."
          : "No session token was provided; credentialed browser/login smoke remains unproven.",
      blocks_mvp_completion: true,
      required_evidence: authenticated === true ? undefined : "Provide a temporary session token or run a credentialed browser smoke without recording credentials."
    }),
    gate({
      id: "docker-health-version-target",
      title: "Docker health/build matches the release decision target",
      category: "docker",
      status: !expectedImageConfigured
        ? "blocked"
        : requestOk("health") && expectedImageMatches
          ? "pass"
          : targetReady ? "fail" : "blocked",
      evidence: !expectedImageConfigured
        ? "Expected target image tag is not configured."
        : `Observed build_sha=${build.build_sha || "unknown"}, image_tag=${build.image_tag || "unknown"}.`,
      blocks_mvp_completion: true,
      required_evidence: expectedImageMatches ? undefined : "Set MIXLAB_ADMIN_DOCKER_POST_RELEASE_EXPECT_TARGET_IMAGE_TAG to the release decision target and deploy that image."
    }),
    gate({
      id: "public-library-invariants",
      title: "Public library ready/index invariants are unchanged",
      category: "library",
      status: libraryRequestOk ? libraryInvariantPass ? "pass" : "fail" : targetReady ? "fail" : "blocked",
      evidence: `root=${libraryRoot || "unknown"}, ready=${String(readyVideoCount)}, index=${currentIndexVersion || "unknown"}.`,
      blocks_mvp_completion: true,
      required_evidence: libraryInvariantPass
        ? undefined
        : `Expected root=${input.expected_library_root}, ready=${input.expected_ready_count}, index=${input.expected_index_version}.`
    }),
    gate({
      id: "release-gates-safe",
      title: "Release gates remain safe after deployment",
      category: "docker",
      status: requestOk("release_gates") ? releaseGatesOk ? "pass" : "fail" : targetReady ? "fail" : "blocked",
      evidence: `release_overall_status=${asString(releaseGates.overall_status) || "unknown"}, release_allowed=${String(releaseAllowed)}, docker_upload_allowed=${String(dockerUploadAllowed)}.`,
      blocks_mvp_completion: true,
      required_evidence: releaseGatesOk ? undefined : "GET /api/admin/release-gates must succeed and must not expose docker_upload_allowed=true."
    }),
    gate({
      id: "data-loading-plan-readable",
      title: "Data loading plan is readable from the deployed Admin",
      category: "admin-mvp",
      status: missingRequestStatus(requestOk("data_loading_plan")),
      evidence: `strategy=${asString(dataLoadingPlan.strategy) || "unknown"}.`,
      blocks_mvp_completion: true
    }),
    gate({
      id: "cutter-users-readable",
      title: "Cutter user management list is readable",
      category: "admin-mvp",
      status: missingRequestStatus(requestOk("cutter_users")),
      evidence: `cutter_user_count=${String(countUsers(dataFor(input.requests, "cutter_users")))}.`,
      blocks_mvp_completion: true
    }),
    gate({
      id: "preprocess-readonly-ready",
      title: "Preprocess safety, supervisor, and bounded jobs are readable",
      category: "preprocess",
      status: preprocessRequestsOk ? preprocessReadonlyOk ? "pass" : "fail" : targetReady ? "fail" : "blocked",
      evidence: `safety=${safetyStatus || "unknown"}, supervisor_idle=${String(idle)}, jobs=${String(countJobs(dataFor(input.requests, "preprocess_jobs")))}.`,
      blocks_mvp_completion: true,
      required_evidence: preprocessReadonlyOk ? undefined : "Safety, supervisor status, and jobs?limit=20 must read successfully; supervisor must not be actively running by default."
    })
  ];
  const summary = summarize(gates);
  const postReleaseSmokeReady = summary.mvp_completion_blockers.length === 0;
  const status = summary.failed > 0 ? "failed" : postReleaseSmokeReady ? "ready" : "blocked";

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-post-release-smoke",
    target: {
      base_url: input.base_url,
      normalized_base_url: classification.normalized_base_url,
      safe_to_probe: classification.safe_to_probe,
      classification: classification.evidence,
      notes: classification.notes,
      session_token_present: input.session_token_present,
      expected_library_root: input.expected_library_root,
      expected_ready_count: input.expected_ready_count,
      expected_index_version: input.expected_index_version,
      expected_target_image_tag: input.expected_target_image_tag
    },
    post_release_smoke_ready: postReleaseSmokeReady,
    image_push_allowed: false,
    docker_deploy_allowed: false,
    preprocess_execution_allowed: false,
    mutates_nas_files: false,
    observed: {
      auth_mode: asString(auth.auth_mode),
      authenticated,
      library_root: libraryRoot,
      current_index_version: currentIndexVersion,
      ready_video_count: readyVideoCount,
      total_video_count: asNumber(library.video_count),
      build_sha: build.build_sha,
      build_version: build.build_version,
      image_tag: build.image_tag,
      release_overall_status: asString(releaseGates.overall_status),
      release_allowed: releaseAllowed,
      data_loading_strategy: asString(dataLoadingPlan.strategy),
      cutter_user_count: countUsers(dataFor(input.requests, "cutter_users")),
      preprocess_safety_status: safetyStatus,
      preprocess_supervisor_state: asString(asRecord(supervisor).state),
      preprocess_jobs_count: countJobs(dataFor(input.requests, "preprocess_jobs"))
    },
    requests: input.requests,
    gates,
    summary,
    result: {
      status,
      summary: status === "ready"
        ? "Final Admin Docker URL read-only MVP smoke passed. This does not allow preprocessing writes."
        : status === "failed"
          ? "Final Admin Docker URL smoke found failed gates."
          : "Final Admin Docker URL smoke still needs release/session/target evidence."
    },
    artifacts: null
  };
}

async function requestProbe(input: {
  base_url: string;
  definition: PostReleaseSmokeProbeDefinition;
  session_token?: string;
  fetch_impl?: typeof fetch;
}): Promise<PostReleaseSmokeProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.definition.timeout_ms);
  const started = performance.now();
  const headers: Record<string, string> = {
    accept: input.definition.json ? "application/json" : "text/html,application/xhtml+xml"
  };

  if (input.session_token && input.definition.protected) {
    headers["X-MixLab-Admin-Session-Token"] = input.session_token;
  }

  try {
    const fetchImpl = input.fetch_impl ?? fetch;
    const response = await fetchImpl(`${input.base_url}${input.definition.path}`, {
      method: input.definition.method,
      headers,
      signal: controller.signal
    });
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    let parsed: unknown = null;
    if (input.definition.json) {
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
    }
    const envelope = responseDataForJson(parsed);

    return {
      name: input.definition.name,
      method: input.definition.method,
      path: input.definition.path,
      duration_ms: roundMs(performance.now() - started),
      http_status: response.status,
      ok: response.ok && envelope.api_ok !== false && (!input.definition.json || isRecord(parsed)),
      api_ok: envelope.api_ok,
      response_bytes: Buffer.byteLength(text, "utf8"),
      content_type: contentType,
      data: input.definition.json ? sanitizeData(input.definition.name, envelope.data) : null,
      error_code: envelope.error_code,
      message: envelope.message
    };
  } catch (error) {
    return {
      name: input.definition.name,
      method: input.definition.method,
      path: input.definition.path,
      duration_ms: roundMs(performance.now() - started),
      http_status: null,
      ok: false,
      api_ok: null,
      response_bytes: 0,
      content_type: "",
      data: null,
      error_code: error instanceof Error && error.name === "AbortError" ? "timeout" : "request_failed",
      message: errorMessage(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runProbes(input: {
  base_url: string;
  session_token?: string;
  fetch_impl?: typeof fetch;
}): Promise<PostReleaseSmokeProbeResult[]> {
  if (!input.base_url) {
    return [];
  }

  const baseUrl = trimTrailingSlash(input.base_url);
  const results: PostReleaseSmokeProbeResult[] = [];
  for (const definition of buildPostReleaseSmokeProbeDefinitions()) {
    results.push(await requestProbe({
      base_url: baseUrl,
      definition,
      session_token: input.session_token,
      fetch_impl: input.fetch_impl
    }));
  }

  return results;
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function renderRequestRows(requests: PostReleaseSmokeProbeResult[]): string {
  if (requests.length === 0) {
    return "none | n/a | n/a | n/a | n/a | n/a";
  }

  return requests.map((request) => [
    request.name,
    `${request.method} ${request.path}`,
    String(request.http_status ?? "n/a"),
    request.ok ? "yes" : "no",
    `${request.duration_ms.toFixed(1)}ms`,
    request.error_code ?? "none"
  ].map((cell) => escapeMarkdownCell(cell)).join(" | ")).join("\n");
}

function renderGateRows(gates: PostReleaseSmokeGate[]): string {
  return gates.map((item) => [
    item.id,
    item.category,
    item.status,
    item.blocks_mvp_completion ? "yes" : "no",
    item.evidence,
    item.required_evidence ?? "n/a"
  ].map((cell) => escapeMarkdownCell(cell)).join(" | ")).join("\n");
}

export function renderMarkdown(report: AdminDockerPostReleaseSmokeReport): string {
  return `# Admin Docker Post-release Smoke

Generated: ${report.generated_at}

Mode: ${report.mode}

Result: ${report.result.status}

Post-release smoke ready: ${report.post_release_smoke_ready ? "yes" : "no"}

Image push allowed: ${report.image_push_allowed ? "yes" : "no"}

Docker deploy allowed: ${report.docker_deploy_allowed ? "yes" : "no"}

Preprocess execution allowed: ${report.preprocess_execution_allowed ? "yes" : "no"}

NAS file mutation: ${report.mutates_nas_files ? "yes" : "no"}

This smoke sends only GET requests. It does not approve image push, restart Docker containers, start/stop workers, queue/retry/recover/publish videos, repair indexes, mutate NAS files, or change Cutter protocols. Session-token values are not written to this report.

## Target

- Base URL: ${report.target.base_url || "not configured"}
- Normalized base URL: ${report.target.normalized_base_url || "n/a"}
- Safe to probe: ${report.target.safe_to_probe ? "yes" : "no"}
- Classification: ${report.target.classification}
- Notes: ${report.target.notes.join("; ") || "none"}
- Session token present: ${report.target.session_token_present ? "yes" : "no"}
- Expected library root: ${report.target.expected_library_root}
- Expected ready count: ${report.target.expected_ready_count}
- Expected index version: ${report.target.expected_index_version}
- Expected target image tag: ${report.target.expected_target_image_tag || "not configured"}

## Observed

- Auth mode: ${report.observed.auth_mode || "unknown"}
- Authenticated: ${String(report.observed.authenticated)}
- Library root: ${report.observed.library_root || "unknown"}
- Ready count: ${String(report.observed.ready_video_count)}
- Current index: ${report.observed.current_index_version || "unknown"}
- Build sha: ${report.observed.build_sha || "unknown"}
- Build version: ${report.observed.build_version || "unknown"}
- Image tag: ${report.observed.image_tag || "unknown"}
- Release gates: ${report.observed.release_overall_status || "unknown"}, release_allowed=${String(report.observed.release_allowed)}
- Data loading strategy: ${report.observed.data_loading_strategy || "unknown"}
- Cutter users: ${String(report.observed.cutter_user_count)}
- Preprocess safety: ${report.observed.preprocess_safety_status || "unknown"}
- Preprocess supervisor state: ${report.observed.preprocess_supervisor_state || "unknown"}
- Preprocess jobs: ${String(report.observed.preprocess_jobs_count)}

## Summary

- Passed: ${report.summary.passed}
- Blocked: ${report.summary.blocked}
- Failed: ${report.summary.failed}
- MVP blockers: ${report.summary.mvp_completion_blockers.join(", ") || "none"}

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
${renderRequestRows(report.requests)}

## Gates

| Gate | Category | Status | Blocks MVP Completion | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- |
${renderGateRows(report.gates)}

## Artifacts

- JSON: ${report.artifacts?.json_path ?? "not written"}
- Markdown: ${report.artifacts?.markdown_path ?? "not written"}
`;
}

export async function writePostReleaseSmokeArtifacts(input: {
  report: AdminDockerPostReleaseSmokeReport;
  output_dir?: string;
  date?: Date;
}): Promise<AdminDockerPostReleaseSmokeReport> {
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  await mkdir(outputDir, { recursive: true });

  const stamp = timestampForFile(input.date);
  const jsonPath = path.join(outputDir, `admin-docker-post-release-smoke-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-post-release-smoke-${stamp}.md`);
  const report = {
    ...input.report,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown(report), "utf8");

  return report;
}

export async function runAdminDockerPostReleaseSmoke(input: {
  base_url?: string;
  expected_library_root?: string;
  expected_ready_count?: number;
  expected_index_version?: string;
  expected_target_image_tag?: string;
  session_token?: string;
  output_dir?: string;
  command?: string;
  date?: Date;
  fetch_impl?: typeof fetch;
} = {}): Promise<AdminDockerPostReleaseSmokeReport> {
  const baseUrl = trimTrailingSlash(optionalTrimmed(input.base_url));
  const sessionToken = optionalTrimmed(input.session_token);
  const classification = classifyLiveReadonlyTarget(baseUrl);
  const requests = await runProbes({
    base_url: classification.safe_to_probe ? classification.normalized_base_url : "",
    session_token: sessionToken || undefined,
    fetch_impl: input.fetch_impl
  });
  const report = buildAdminDockerPostReleaseSmokeReport({
    generated_at: (input.date ?? new Date()).toISOString(),
    command: input.command ?? "npx tsx scripts/acceptance/admin-docker-post-release-smoke.ts",
    base_url: baseUrl,
    expected_library_root: optionalTrimmed(input.expected_library_root) || DEFAULT_EXPECTED_LIBRARY_ROOT,
    expected_ready_count: input.expected_ready_count ?? DEFAULT_EXPECTED_READY_COUNT,
    expected_index_version: optionalTrimmed(input.expected_index_version) || DEFAULT_EXPECTED_INDEX_VERSION,
    expected_target_image_tag: optionalTrimmed(input.expected_target_image_tag),
    session_token_present: Boolean(sessionToken),
    requests
  });

  return writePostReleaseSmokeArtifacts({
    report,
    output_dir: input.output_dir,
    date: input.date
  });
}

async function main(): Promise<void> {
  const report = await runAdminDockerPostReleaseSmoke({
    base_url: process.env.MIXLAB_ADMIN_DOCKER_POST_RELEASE_BASE_URL,
    expected_library_root: process.env.MIXLAB_ADMIN_DOCKER_POST_RELEASE_EXPECT_LIBRARY_ROOT,
    expected_ready_count: parseExpectedReadyCount(process.env.MIXLAB_ADMIN_DOCKER_POST_RELEASE_EXPECT_READY_COUNT),
    expected_index_version: process.env.MIXLAB_ADMIN_DOCKER_POST_RELEASE_EXPECT_INDEX_VERSION,
    expected_target_image_tag: process.env.MIXLAB_ADMIN_DOCKER_POST_RELEASE_EXPECT_TARGET_IMAGE_TAG,
    session_token: process.env.MIXLAB_ADMIN_DOCKER_POST_RELEASE_SESSION_TOKEN,
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    post_release_smoke_ready: report.post_release_smoke_ready,
    image_push_allowed: report.image_push_allowed,
    docker_deploy_allowed: report.docker_deploy_allowed,
    preprocess_execution_allowed: report.preprocess_execution_allowed,
    blockers: report.summary.mvp_completion_blockers,
    json_path: report.artifacts?.json_path,
    markdown_path: report.artifacts?.markdown_path
  }, null, 2));

  if (report.result.status === "failed") {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
