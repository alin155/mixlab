import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_EXPECTED_LIBRARY_ROOT = "/data/PublicLibrary";

type HttpMethod = "GET";
type ProbeName =
  | "admin_web_root"
  | "auth_status"
  | "library_status"
  | "release_gates"
  | "dashboard_metrics"
  | "data_loading_plan"
  | "preprocess_supervisor_status";

type LiveGateStatus = "pass" | "fail" | "blocked" | "needs-external-proof";
type LiveGateCategory = "target" | "safety" | "live-admin" | "live-nas" | "live-docker" | "cutter-compatibility";
type LiveTargetKind =
  | "not-configured"
  | "invalid-url"
  | "local-loopback"
  | "nas-desktop-url"
  | "non-root-path"
  | "admin-web-url";

interface ApiEnvelope {
  ok?: unknown;
  data?: unknown;
  error_code?: unknown;
  message?: unknown;
}

export interface LiveProbeDefinition {
  name: ProbeName;
  method: HttpMethod;
  path: string;
  timeout_ms: number;
  json: boolean;
  protected: boolean;
  notes: string;
}

export interface LiveProbeResult {
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

export interface LiveReleaseGate {
  id: string;
  title: string;
  category: LiveGateCategory;
  status: LiveGateStatus;
  evidence: string;
  blocks_docker_upload: boolean;
  required_evidence?: string;
}

export interface LiveReleaseGateSummary {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  needs_external_proof: number;
  upload_blockers: string[];
}

export interface LiveTargetClassification {
  kind: LiveTargetKind;
  normalized_base_url: string;
  safe_to_probe: boolean;
  evidence: string;
  notes: string[];
}

export interface AdminDockerLiveReadonlyReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "live-readonly-get";
  target: {
    base_url: string;
    normalized_base_url: string;
    configured: boolean;
    kind: LiveTargetKind;
    safe_to_probe: boolean;
    classification_evidence: string;
    classification_notes: string[];
    expected_library_root: string;
    session_token_present: boolean;
  };
  live_readiness_ready: boolean;
  docker_upload_allowed: false;
  requests: LiveProbeResult[];
  observed: {
    auth_mode: string;
    authenticated: boolean | null;
    library_root: string;
    current_index_version: string;
    video_count: number | null;
    ready_video_count: number | null;
    release_overall_status: string;
    release_allowed: boolean | null;
    runtime_path_profile: string;
    build_sha: string;
    build_version: string;
    image_tag: string;
  };
  gates: LiveReleaseGate[];
  summary: LiveReleaseGateSummary;
  result: {
    status: "ready" | "blocked" | "failed";
    summary: string;
  };
  artifacts: {
    json_path: string;
    markdown_path: string;
  } | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]";
}

export function classifyLiveReadonlyTarget(baseUrl: string): LiveTargetClassification {
  const trimmed = optionalTrimmed(baseUrl);
  if (!trimmed) {
    return {
      kind: "not-configured",
      normalized_base_url: "",
      safe_to_probe: false,
      evidence: "MIXLAB_ADMIN_DOCKER_LIVE_BASE_URL is not set.",
      notes: [
        "Set the variable to the NAS Docker admin-web URL, for example http://<nas-ip>:8080.",
        "Do not use the NAS desktop URL as Docker release evidence."
      ]
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      kind: "invalid-url",
      normalized_base_url: "",
      safe_to_probe: false,
      evidence: `Target URL is not parseable: ${trimmed}`,
      notes: [
        "Use an absolute http:// or https:// URL for the NAS Docker admin-web root."
      ]
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      kind: "invalid-url",
      normalized_base_url: "",
      safe_to_probe: false,
      evidence: `Unsupported target protocol: ${parsed.protocol}`,
      notes: [
        "Only http:// or https:// admin-web targets are valid for the live-readonly probe."
      ]
    };
  }

  const normalizedRoot = parsed.origin;
  const pathname = parsed.pathname || "/";
  const lowerPath = pathname.toLowerCase();

  if (isLoopbackHost(parsed.hostname)) {
    return {
      kind: "local-loopback",
      normalized_base_url: normalizedRoot,
      safe_to_probe: false,
      evidence: `Target host ${parsed.hostname} is local to the current machine, not NAS Docker.`,
      notes: [
        "Mac 127.0.0.1 is the local Admin Web/API perspective, not NAS Docker.",
        "Use the NAS LAN IP or DNS name for release evidence."
      ]
    };
  }

  if (lowerPath === "/desktop" || lowerPath.startsWith("/desktop/")) {
    return {
      kind: "nas-desktop-url",
      normalized_base_url: trimTrailingSlash(trimmed),
      safe_to_probe: false,
      evidence: "Target path looks like the NAS desktop UI, not the Docker admin-web root.",
      notes: [
        "A URL such as http://192.168.1.27:9999/desktop/ opens NAS desktop, not MixLab admin-web.",
        "Use the configured Docker admin-web port from deploy/nas/mixlab/.env, commonly http://<nas-ip>:8080."
      ]
    };
  }

  if (pathname !== "/" || parsed.search || parsed.hash) {
    return {
      kind: "non-root-path",
      normalized_base_url: trimTrailingSlash(trimmed),
      safe_to_probe: false,
      evidence: `Target has a non-root path/query/hash: ${pathname}${parsed.search}${parsed.hash}`,
      notes: [
        "The NAS Docker admin-web compose service is expected at the URL root.",
        "Point MIXLAB_ADMIN_DOCKER_LIVE_BASE_URL at the admin-web root, then let the script append /api/admin/* paths."
      ]
    };
  }

  return {
    kind: "admin-web-url",
    normalized_base_url: normalizedRoot,
    safe_to_probe: true,
    evidence: "Target URL shape is compatible with the NAS Docker admin-web root.",
    notes: [
      "This only validates target shape; API/version/disk/worker/Cutter proof gates still decide readiness."
    ]
  };
}

function envelopeFromJson(value: unknown): ApiEnvelope {
  return isRecord(value) ? value : {};
}

function gate(input: LiveReleaseGate): LiveReleaseGate {
  return input;
}

function sanitizeDashboardMetricsData(value: unknown): unknown {
  const data = asRecord(value);
  const usage = asRecord(data.usage);
  const runtimeLoad = asRecord(data.runtime_load);
  const disk = asRecord(runtimeLoad.disk);

  return {
    material: data.material ?? null,
    transcript: data.transcript ?? null,
    production: data.production ?? null,
    risk: data.risk ?? null,
    runtime_load: {
      overall_status: asString(runtimeLoad.overall_status),
      disk: {
        usage_percent: asNumber(disk.usage_percent),
        status: asString(disk.status)
      }
    },
    usage_summary: {
      search_request_count: asNumber(usage.search_request_count),
      search_hit_count: asNumber(usage.search_hit_count),
      search_empty_count: asNumber(usage.search_empty_count),
      source_detail_view_count: asNumber(usage.source_detail_view_count),
      cut_submission_count: asNumber(usage.cut_submission_count),
      cut_success_count: asNumber(usage.cut_success_count),
      cut_failure_count: asNumber(usage.cut_failure_count),
      active_user_count: asNumber(usage.active_user_count),
      recent_keyword_count: Array.isArray(usage.recent_keywords) ? usage.recent_keywords.length : null,
      user_count: Array.isArray(usage.users) ? usage.users.length : null
    }
  };
}

export function sanitizeLiveProbeData(name: ProbeName, value: unknown): unknown {
  if (name === "dashboard_metrics") {
    return sanitizeDashboardMetricsData(value);
  }

  return value;
}

export function buildLiveProbeDefinitions(): LiveProbeDefinition[] {
  return [
    {
      name: "admin_web_root",
      method: "GET",
      path: "/",
      timeout_ms: 5_000,
      json: false,
      protected: false,
      notes: "Externally reachable admin-web root."
    },
    {
      name: "auth_status",
      method: "GET",
      path: "/api/admin/auth/status",
      timeout_ms: 5_000,
      json: true,
      protected: true,
      notes: "Auth/session visibility through admin-web proxy; sends the optional session token when provided."
    },
    {
      name: "library_status",
      method: "GET",
      path: "/api/admin/library/status",
      timeout_ms: 8_000,
      json: true,
      protected: true,
      notes: "Live library root, counts, disk and index state."
    },
    {
      name: "release_gates",
      method: "GET",
      path: "/api/admin/release-gates",
      timeout_ms: 8_000,
      json: true,
      protected: true,
      notes: "Live Admin release-gate status."
    },
    {
      name: "dashboard_metrics",
      method: "GET",
      path: "/api/admin/dashboard/metrics",
      timeout_ms: 10_000,
      json: true,
      protected: true,
      notes: "Live dashboard metrics, including usage-events tolerance path."
    },
    {
      name: "data_loading_plan",
      method: "GET",
      path: "/api/admin/data-loading/plan",
      timeout_ms: 5_000,
      json: true,
      protected: true,
      notes: "Live data-loading contract."
    },
    {
      name: "preprocess_supervisor_status",
      method: "GET",
      path: "/api/admin/preprocess/supervisor/status",
      timeout_ms: 5_000,
      json: true,
      protected: true,
      notes: "Live supervisor status visibility without start/stop."
    }
  ];
}

function dataFor(requests: LiveProbeResult[], name: ProbeName): unknown {
  return requests.find((request) => request.name === name)?.data ?? null;
}

function requestFor(requests: LiveProbeResult[], name: ProbeName): LiveProbeResult | undefined {
  return requests.find((request) => request.name === name);
}

function releaseGateByCode(releaseGates: unknown, code: string): Record<string, unknown> {
  const gates = asRecord(releaseGates).gates;
  if (!Array.isArray(gates)) {
    return {};
  }

  return asRecord(gates.find((item) => asRecord(item).code === code));
}

function gateStatusFromReleaseGate(releaseGates: unknown, code: string): string {
  return asString(releaseGateByCode(releaseGates, code).status);
}

function gateMessageFromReleaseGate(releaseGates: unknown, code: string): string {
  return asString(releaseGateByCode(releaseGates, code).message);
}

function usageEventsRepairReadiness(releaseGates: unknown): Record<string, unknown> {
  return asRecord(asRecord(releaseGates).usage_events_repair);
}

function usageEventsRepairContractReady(releaseGates: unknown): boolean {
  const readiness = usageEventsRepairReadiness(releaseGates);
  return asString(readiness.safe_scope) === "usage-events-only" &&
    asString(readiness.dry_run_command).includes("usage-events-repair") &&
    asString(readiness.apply_command).includes("--apply") &&
    asBoolean(readiness.mutates_ready_assets) === false &&
    asBoolean(readiness.mutates_cutter_protocol) === false;
}

function processingRecoveryReadiness(releaseGates: unknown): Record<string, unknown> {
  return asRecord(asRecord(releaseGates).processing_recovery);
}

function processingRecoveryContractReady(releaseGates: unknown): boolean {
  const readiness = processingRecoveryReadiness(releaseGates);
  return asString(readiness.safe_scope) === "processing-to-queued-only" &&
    asString(readiness.bulk_recovery_endpoint) === "POST /api/admin/preprocess/recover-processing" &&
    Array.isArray(readiness.preflight_endpoints) &&
    asBoolean(readiness.supervisor_must_be_idle) === true &&
    asBoolean(readiness.mutates_ready_assets) === false &&
    asBoolean(readiness.mutates_cutter_protocol) === false;
}

function diskSpaceProtectionReadiness(releaseGates: unknown): Record<string, unknown> {
  return asRecord(asRecord(releaseGates).disk_space_protection);
}

function diskSpaceProtectionContractReady(releaseGates: unknown): boolean {
  const readiness = diskSpaceProtectionReadiness(releaseGates);
  const preflightEndpoints = readiness.preflight_endpoints;
  return asString(readiness.threshold_env_var) === "MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT" &&
    asString(readiness.write_block_scope) === "preprocess-and-docker-upload" &&
    Array.isArray(preflightEndpoints) &&
    preflightEndpoints.includes("GET /api/admin/release-gates") &&
    preflightEndpoints.includes("GET /api/admin/preprocess/safety") &&
    preflightEndpoints.includes("GET /api/admin/library/status") &&
    asBoolean(readiness.starts_workers) === false &&
    asBoolean(readiness.mutates_ready_assets) === false &&
    asBoolean(readiness.mutates_cutter_protocol) === false;
}

function versionHealthParityReadiness(releaseGates: unknown): Record<string, unknown> {
  return asRecord(asRecord(releaseGates).version_health_parity);
}

function versionHealthParityContractReady(releaseGates: unknown): boolean {
  const readiness = versionHealthParityReadiness(releaseGates);
  const expectedServices = readiness.expected_services;
  const healthPreflightEndpoints = readiness.health_preflight_endpoints;
  const externalProof = readiness.external_proof_required;
  return asString(readiness.safe_scope) === "version-health-only" &&
    asString(readiness.static_compose_gate) === "image-tag-static-parity" &&
    Array.isArray(expectedServices) &&
    expectedServices.includes("admin-web") &&
    expectedServices.includes("admin-api") &&
    expectedServices.includes("admin-worker") &&
    Array.isArray(healthPreflightEndpoints) &&
    healthPreflightEndpoints.includes("GET /") &&
    healthPreflightEndpoints.includes("GET /health") &&
    healthPreflightEndpoints.includes("GET /api/admin/release-gates") &&
    Array.isArray(externalProof) &&
    externalProof.length > 0 &&
    asString(readiness.live_probe_command).includes("admin-docker-release-live-readonly") &&
    asBoolean(readiness.starts_workers) === false &&
    asBoolean(readiness.mutates_ready_assets) === false &&
    asBoolean(readiness.mutates_cutter_protocol) === false;
}

function adminWorkerEnvProofReadiness(releaseGates: unknown): Record<string, unknown> {
  return asRecord(asRecord(releaseGates).admin_worker_env_proof);
}

function adminWorkerEnvProofContractReady(releaseGates: unknown): boolean {
  const readiness = adminWorkerEnvProofReadiness(releaseGates);
  const requiredFlags = asRecord(readiness.required_env_flags);
  const requiredRoots = asRecord(readiness.required_library_roots);
  const collectionCommands = readiness.collection_commands;
  return asString(readiness.status) === "external-proof-required" &&
    asString(readiness.expected_service) === "admin-worker" &&
    asString(readiness.safe_scope) === "admin-worker-env-only" &&
    asString(requiredFlags.MIXLAB_ADMIN_DOCKER_MVP_MODE) === "off" &&
    asString(requiredFlags.MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER) === "0" &&
    asString(requiredFlags.MIXLAB_ENABLE_READY_PUBLISH_WORKER) === "0" &&
    asString(requiredRoots.MIXLAB_ADMIN_LIBRARY_ROOT) === "/data/PublicLibrary" &&
    asString(requiredRoots.MIXLAB_PREPROCESS_LIBRARY_ROOT) === "/data/PublicLibrary" &&
    asString(readiness.proof_command).includes("admin-worker-env-proof") &&
    Array.isArray(collectionCommands) &&
    collectionCommands.length > 0 &&
    asBoolean(readiness.starts_workers) === false &&
    asBoolean(readiness.records_secrets) === false &&
    asBoolean(readiness.mutates_ready_assets) === false &&
    asBoolean(readiness.mutates_cutter_protocol) === false;
}

function cutterCompatibilityProofReadiness(releaseGates: unknown): Record<string, unknown> {
  return asRecord(asRecord(releaseGates).cutter_compatibility_proof);
}

function cutterCompatibilityProofContractReady(releaseGates: unknown): boolean {
  const readiness = cutterCompatibilityProofReadiness(releaseGates);
  const requiredReports = asRecord(readiness.required_reports);
  const requiredEvidence = readiness.required_evidence;
  return asString(readiness.status) === "external-proof-required" &&
    asString(readiness.expected_auth_mode) === "reviewed" &&
    asNumber(readiness.expected_ready_count) !== null &&
    asString(readiness.safe_scope) === "cutter-compatibility-only" &&
    asString(requiredReports.windows_acceptance_env_var) === "MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT" &&
    asString(requiredReports.real_cut_env_var) === "MIXLAB_CUTTER_REAL_CUT_REPORT" &&
    asString(readiness.proof_command).includes("admin-cutter-compatibility-proof") &&
    Array.isArray(requiredEvidence) &&
    requiredEvidence.length > 0 &&
    asBoolean(readiness.requires_staged_candidate) === true &&
    asBoolean(readiness.contacts_windows_runner) === false &&
    asBoolean(readiness.contacts_docker) === false &&
    asBoolean(readiness.starts_workers) === false &&
    asBoolean(readiness.mutates_ready_assets) === false &&
    asBoolean(readiness.mutates_cutter_protocol) === false;
}

function protectedRequestDetail(requests: LiveProbeResult[], name: ProbeName): string {
  const request = requestFor(requests, name);
  if (!request) {
    return "request not run";
  }

  if (request.ok) {
    return `HTTP ${request.http_status}, ok`;
  }

  return `HTTP ${request.http_status ?? "n/a"}, ${request.error_code ?? "failed"} ${request.message ?? ""}`.trim();
}

function releaseGateStatus(input: {
  release_gates: unknown;
  code: string;
  title: string;
  category: LiveGateCategory;
  missing_detail: string;
  blocked_detail: string;
}): LiveReleaseGate {
  const status = gateStatusFromReleaseGate(input.release_gates, input.code);
  const message = gateMessageFromReleaseGate(input.release_gates, input.code);

  if (!status) {
    return gate({
      id: input.code,
      title: input.title,
      category: input.category,
      status: "blocked",
      evidence: input.missing_detail,
      blocks_docker_upload: true,
      required_evidence: "Run the live-readonly probe against an authenticated NAS Docker Admin target that exposes /api/admin/release-gates."
    });
  }

  if (status === "pass") {
    return gate({
      id: input.code,
      title: input.title,
      category: input.category,
      status: "pass",
      evidence: message || `${input.code} passed in live release gates.`,
      blocks_docker_upload: false
    });
  }

  return gate({
    id: input.code,
    title: input.title,
    category: input.category,
    status: "blocked",
    evidence: `${status}: ${message || input.blocked_detail}`,
    blocks_docker_upload: true,
    required_evidence: input.blocked_detail
  });
}

function summarizeObserved(requests: LiveProbeResult[]): AdminDockerLiveReadonlyReport["observed"] {
  const auth = asRecord(dataFor(requests, "auth_status"));
  const library = asRecord(dataFor(requests, "library_status"));
  const release = asRecord(dataFor(requests, "release_gates"));
  const releaseRuntime = asRecord(release.runtime);
  const build = asRecord(release.build);

  return {
    auth_mode: asString(auth.auth_mode),
    authenticated: asBoolean(auth.authenticated),
    library_root: asString(library.root_path),
    current_index_version: asString(library.current_index_version),
    video_count: asNumber(library.video_count),
    ready_video_count: asNumber(library.ready_video_count),
    release_overall_status: asString(release.overall_status),
    release_allowed: asBoolean(release.release_allowed),
    runtime_path_profile: asString(releaseRuntime.path_profile),
    build_sha: asString(build.sha),
    build_version: asString(build.version),
    image_tag: asString(build.image_tag)
  };
}

export function buildLiveReleaseGates(input: {
  target_configured: boolean;
  target_classification: LiveTargetClassification;
  expected_library_root: string;
  requests: LiveProbeResult[];
  observed: AdminDockerLiveReadonlyReport["observed"];
}): LiveReleaseGate[] {
  const releaseGates = dataFor(input.requests, "release_gates");
  const webRoot = requestFor(input.requests, "admin_web_root");
  const authStatus = requestFor(input.requests, "auth_status");
  const libraryStatus = requestFor(input.requests, "library_status");
  const dashboardMetrics = requestFor(input.requests, "dashboard_metrics");
  const dataLoadingPlan = requestFor(input.requests, "data_loading_plan");
  const supervisorStatus = requestFor(input.requests, "preprocess_supervisor_status");
  const usageRepair = usageEventsRepairReadiness(releaseGates);
  const usageRepairReady = usageEventsRepairContractReady(releaseGates);
  const processingRecovery = processingRecoveryReadiness(releaseGates);
  const processingRecoveryReady = processingRecoveryContractReady(releaseGates);
  const diskProtection = diskSpaceProtectionReadiness(releaseGates);
  const diskProtectionReady = diskSpaceProtectionContractReady(releaseGates);
  const versionParity = versionHealthParityReadiness(releaseGates);
  const versionParityReady = versionHealthParityContractReady(releaseGates);
  const workerEnvProof = adminWorkerEnvProofReadiness(releaseGates);
  const workerEnvProofReady = adminWorkerEnvProofContractReady(releaseGates);
  const cutterCompatibilityProof = cutterCompatibilityProofReadiness(releaseGates);
  const cutterCompatibilityProofReady = cutterCompatibilityProofContractReady(releaseGates);
  const allRequestsAreGet = input.requests.every((request) => request.method === "GET");
  const authenticated = input.observed.auth_mode === "disabled" ||
    input.observed.authenticated === true;
  const adminApiProxyReachable = [authStatus, libraryStatus, supervisorStatus]
    .some((request) => request?.ok && request.content_type.includes("application/json"));
  const currentApiContractReady = Boolean(authStatus?.ok && requestFor(input.requests, "release_gates")?.ok &&
    dataLoadingPlan?.ok);
  const dockerLibraryRootReady = input.observed.library_root === input.expected_library_root &&
    input.observed.library_root.startsWith("/data/");

  return [
    gate({
      id: "target-url-configured",
      title: "Explicit NAS Docker Admin target URL configured",
      category: "target",
      status: input.target_configured ? "pass" : "blocked",
      evidence: input.target_configured
        ? "Probe target was supplied explicitly."
        : "MIXLAB_ADMIN_DOCKER_LIVE_BASE_URL is not set; the probe will not guess a NAS address.",
      blocks_docker_upload: !input.target_configured,
      required_evidence: input.target_configured ? undefined : "Set MIXLAB_ADMIN_DOCKER_LIVE_BASE_URL to the NAS Docker admin-web URL."
    }),
    gate({
      id: "target-url-admin-web-shape",
      title: "Target URL is the NAS Docker admin-web root",
      category: "target",
      status: input.target_classification.safe_to_probe ? "pass" : "blocked",
      evidence: `${input.target_classification.kind}: ${input.target_classification.evidence}`,
      blocks_docker_upload: !input.target_classification.safe_to_probe,
      required_evidence: input.target_classification.safe_to_probe
        ? undefined
        : "Set MIXLAB_ADMIN_DOCKER_LIVE_BASE_URL to the NAS Docker admin-web root, not Mac localhost, NAS desktop, or a subpath."
    }),
    gate({
      id: "get-only-live-probe",
      title: "Live probe uses GET only",
      category: "safety",
      status: allRequestsAreGet ? "pass" : "fail",
      evidence: `methods=${input.requests.map((request) => request.method).join(",") || "none"}`,
      blocks_docker_upload: !allRequestsAreGet
    }),
    gate({
      id: "admin-web-root-live",
      title: "Admin Web root reachable",
      category: "live-admin",
      status: webRoot?.ok ? "pass" : "blocked",
      evidence: webRoot?.ok
        ? `HTTP ${webRoot.http_status}, ${webRoot.response_bytes} bytes`
        : `Admin Web root not proven: ${protectedRequestDetail(input.requests, "admin_web_root")}`,
      blocks_docker_upload: !webRoot?.ok,
      required_evidence: webRoot?.ok ? undefined : "Probe the NAS admin-web root URL and archive a successful HTTP response."
    }),
    gate({
      id: "admin-api-proxy-live",
      title: "Admin API proxy reachable through Admin Web",
      category: "live-admin",
      status: adminApiProxyReachable ? "pass" : "blocked",
      evidence: adminApiProxyReachable
        ? `At least one Admin API JSON endpoint responded; auth=${protectedRequestDetail(input.requests, "auth_status")}, library=${protectedRequestDetail(input.requests, "library_status")}, supervisor=${protectedRequestDetail(input.requests, "preprocess_supervisor_status")}`
        : `No Admin API JSON endpoint was proven; auth=${protectedRequestDetail(input.requests, "auth_status")}, library=${protectedRequestDetail(input.requests, "library_status")}, supervisor=${protectedRequestDetail(input.requests, "preprocess_supervisor_status")}`,
      blocks_docker_upload: !adminApiProxyReachable,
      required_evidence: adminApiProxyReachable ? undefined : "Probe at least one /api/admin/* JSON endpoint through the NAS admin-web proxy."
    }),
    gate({
      id: "current-admin-api-contract-live",
      title: "Current Admin Architecture v1 API contract is live",
      category: "live-admin",
      status: currentApiContractReady ? "pass" : "blocked",
      evidence: currentApiContractReady
        ? "auth/status, release-gates, and data-loading/plan all responded."
        : `Required current endpoints are missing or blocked: auth=${protectedRequestDetail(input.requests, "auth_status")}, release_gates=${protectedRequestDetail(input.requests, "release_gates")}, data_loading_plan=${protectedRequestDetail(input.requests, "data_loading_plan")}`,
      blocks_docker_upload: !currentApiContractReady,
      required_evidence: currentApiContractReady ? undefined : "Deploy or point to an Admin API image exposing /api/admin/auth/status, /api/admin/release-gates, and /api/admin/data-loading/plan."
    }),
    gate({
      id: "auth-context-live",
      title: "Protected live gate endpoints are readable",
      category: "live-admin",
      status: authenticated ? "pass" : "blocked",
      evidence: authenticated
        ? `auth_mode=${input.observed.auth_mode || "unknown"}, authenticated=${String(input.observed.authenticated)}`
        : `auth_mode=${input.observed.auth_mode || "unknown"}, authenticated=${String(input.observed.authenticated)}; protected endpoints may require MIXLAB_ADMIN_DOCKER_LIVE_SESSION_TOKEN.`,
      blocks_docker_upload: !authenticated,
      required_evidence: authenticated ? undefined : "Provide a reviewed Admin session token only through MIXLAB_ADMIN_DOCKER_LIVE_SESSION_TOKEN; do not write it into docs."
    }),
    gate({
      id: "runtime-path-profile-live",
      title: "Docker runtime path profile and library root",
      category: "live-docker",
      status: dockerLibraryRootReady || (input.observed.runtime_path_profile === "docker" &&
        input.observed.library_root === input.expected_library_root)
        ? "pass"
        : "blocked",
      evidence: `runtime_path_profile=${input.observed.runtime_path_profile || "unknown"}, library_root=${input.observed.library_root || "unknown"}, expected=${input.expected_library_root}`,
      blocks_docker_upload: !(dockerLibraryRootReady || (input.observed.runtime_path_profile === "docker" &&
        input.observed.library_root === input.expected_library_root)),
      required_evidence: "Live release gates and library status must show Docker profile with /data/PublicLibrary."
    }),
    releaseGateStatus({
      release_gates: releaseGates,
      code: "build-version-health",
      title: "Build version and image tag are live",
      category: "live-docker",
      missing_detail: "build-version-health was not available from live release gates.",
      blocked_detail: "Live release gates must expose non-local build sha, build version, and image tag."
    }),
    gate({
      id: "version-health-parity-contract-live",
      title: "Version and health parity contract is exposed live",
      category: "live-docker",
      status: versionParityReady ? "pass" : "blocked",
      evidence: versionParityReady
        ? `status=${asString(versionParity.status)}, image_tag=${asString(versionParity.image_tag) || "unknown"}, services=${asArray(versionParity.expected_services).join(",")}`
        : "Live release gates did not expose a complete version_health_parity contract with expected services, GET health preflight endpoints, external Docker proof requirements, and no ready/Cutter mutations.",
      blocks_docker_upload: !versionParityReady,
      required_evidence: versionParityReady ? undefined : "Deploy an Admin API that returns version_health_parity from /api/admin/release-gates before Docker upload review."
    }),
    releaseGateStatus({
      release_gates: releaseGates,
      code: "preprocess-disk",
      title: "NAS disk protection passes live gate",
      category: "live-nas",
      missing_detail: "preprocess-disk was not available from live release gates.",
      blocked_detail: "NAS disk gate must pass before Docker upload."
    }),
    gate({
      id: "disk-space-protection-contract-live",
      title: "Disk-space protection preflight contract is exposed live",
      category: "live-nas",
      status: diskProtectionReady ? "pass" : "blocked",
      evidence: diskProtectionReady
        ? `status=${asString(diskProtection.status)}, usage=${String(asNumber(diskProtection.usage_percent) ?? "n/a")}%, threshold=${String(asNumber(diskProtection.block_usage_percent) ?? "n/a")}%, scope=${asString(diskProtection.write_block_scope)}`
        : "Live release gates did not expose a complete disk_space_protection contract with GET preflight endpoints, threshold env var, no worker start, and no ready/Cutter mutations.",
      blocks_docker_upload: !diskProtectionReady,
      required_evidence: diskProtectionReady ? undefined : "Deploy an Admin API that returns disk_space_protection from /api/admin/release-gates before Docker upload review."
    }),
    releaseGateStatus({
      release_gates: releaseGates,
      code: "usage-events-tolerance",
      title: "usage-events tolerance passes live gate",
      category: "live-nas",
      missing_detail: "usage-events-tolerance was not available from live release gates.",
      blocked_detail: "usage-events malformed rows must be repaired by a reviewed dry-run/apply workflow or otherwise accepted by the release gate."
    }),
    gate({
      id: "usage-events-repair-contract-live",
      title: "usage-events repair dry-run contract is exposed live",
      category: "live-nas",
      status: usageRepairReady ? "pass" : "blocked",
      evidence: usageRepairReady
        ? `scope=${asString(usageRepair.safe_scope)}, dry_run_command=${asString(usageRepair.dry_run_command)}, projection=${asString(usageRepair.projection_path)}`
        : "Live release gates did not expose a complete usage_events_repair contract with dry-run/apply commands and no ready/Cutter mutations.",
      blocks_docker_upload: !usageRepairReady,
      required_evidence: usageRepairReady ? undefined : "Deploy an Admin API that returns usage_events_repair from /api/admin/release-gates before Docker upload review."
    }),
    releaseGateStatus({
      release_gates: releaseGates,
      code: "processing-recovery",
      title: "V001440 / processing recovery gate passes",
      category: "live-nas",
      missing_detail: "processing-recovery was not available from live release gates.",
      blocked_detail: "Stuck processing jobs must have a safe recovery outcome before Docker upload."
    }),
    gate({
      id: "processing-recovery-contract-live",
      title: "Processing recovery preflight contract is exposed live",
      category: "live-nas",
      status: processingRecoveryReady ? "pass" : "blocked",
      evidence: processingRecoveryReady
        ? `scope=${asString(processingRecovery.safe_scope)}, bulk=${asString(processingRecovery.bulk_recovery_endpoint)}, count=${String(asNumber(processingRecovery.processing_count) ?? "n/a")}`
        : "Live release gates did not expose a complete processing_recovery contract with GET preflight endpoints, idle-supervisor requirement, and no ready/Cutter mutations.",
      blocks_docker_upload: !processingRecoveryReady,
      required_evidence: processingRecoveryReady ? undefined : "Deploy an Admin API that returns processing_recovery from /api/admin/release-gates before Docker upload review."
    }),
    releaseGateStatus({
      release_gates: releaseGates,
      code: "current-index",
      title: "Current Cutter index gate passes",
      category: "live-nas",
      missing_detail: "current-index was not available from live release gates.",
      blocked_detail: "Ready assets need a valid current index before Docker upload."
    }),
    gate({
      id: "dashboard-metrics-live",
      title: "Dashboard metrics read does not fail live",
      category: "live-admin",
      status: dashboardMetrics?.ok ? "pass" : "blocked",
      evidence: dashboardMetrics?.ok
        ? `HTTP ${dashboardMetrics.http_status}, ${dashboardMetrics.response_bytes} bytes`
        : `Dashboard metrics not proven: ${protectedRequestDetail(input.requests, "dashboard_metrics")}`,
      blocks_docker_upload: !dashboardMetrics?.ok,
      required_evidence: dashboardMetrics?.ok ? undefined : "Run GET /api/admin/dashboard/metrics successfully against the NAS Docker target."
    }),
    gate({
      id: "data-loading-contract-live",
      title: "Data-loading contract is readable live",
      category: "live-admin",
      status: dataLoadingPlan?.ok ? "pass" : "blocked",
      evidence: dataLoadingPlan?.ok
        ? `HTTP ${dataLoadingPlan.http_status}, ${dataLoadingPlan.response_bytes} bytes`
        : `Data-loading plan not proven: ${protectedRequestDetail(input.requests, "data_loading_plan")}`,
      blocks_docker_upload: !dataLoadingPlan?.ok,
      required_evidence: dataLoadingPlan?.ok ? undefined : "Run GET /api/admin/data-loading/plan successfully against the NAS Docker target."
    }),
    gate({
      id: "supervisor-status-live",
      title: "Supervisor status is readable without starting workers",
      category: "live-admin",
      status: supervisorStatus?.ok ? "pass" : "blocked",
      evidence: supervisorStatus?.ok
        ? `HTTP ${supervisorStatus.http_status}, ${supervisorStatus.response_bytes} bytes`
        : `Supervisor status not proven: ${protectedRequestDetail(input.requests, "preprocess_supervisor_status")}`,
      blocks_docker_upload: !supervisorStatus?.ok,
      required_evidence: supervisorStatus?.ok ? undefined : "Run GET /api/admin/preprocess/supervisor/status successfully; do not call start/stop."
    }),
    gate({
      id: "admin-worker-env-proof-contract-live",
      title: "admin-worker env proof contract is exposed live",
      category: "live-docker",
      status: workerEnvProofReady ? "pass" : "blocked",
      evidence: workerEnvProofReady
        ? `status=${asString(workerEnvProof.status)}, scope=${asString(workerEnvProof.safe_scope)}, service=${asString(workerEnvProof.expected_service)}`
        : "Live release gates did not expose a complete admin_worker_env_proof contract with disabled worker flags, /data/PublicLibrary roots, proof command, no secrets, no worker start, and no ready/Cutter mutations.",
      blocks_docker_upload: !workerEnvProofReady,
      required_evidence: workerEnvProofReady ? undefined : "Deploy an Admin API that returns admin_worker_env_proof from /api/admin/release-gates before Docker upload review."
    }),
    gate({
      id: "admin-worker-live-flags",
      title: "Running admin-worker opt-in flags are externally verified",
      category: "live-docker",
      status: "needs-external-proof",
      evidence: "Admin API GET endpoints cannot prove the running admin-worker container environment.",
      blocks_docker_upload: true,
      required_evidence: "Capture NAS admin-worker.env and admin-worker.inspect.json, then run admin-worker-env-proof to show standalone workers are disabled, /data/PublicLibrary roots are used, and no secrets are written to reports."
    }),
    gate({
      id: "cutter-compatibility-proof-contract-live",
      title: "Cutter compatibility proof contract is exposed live",
      category: "cutter-compatibility",
      status: cutterCompatibilityProofReady ? "pass" : "blocked",
      evidence: cutterCompatibilityProofReady
        ? `status=${asString(cutterCompatibilityProof.status)}, scope=${asString(cutterCompatibilityProof.safe_scope)}, expected_ready_count=${String(asNumber(cutterCompatibilityProof.expected_ready_count) ?? "n/a")}`
        : "Live release gates did not expose a complete cutter_compatibility_proof contract with Windows acceptance and real-cut report requirements, proof command, staged-candidate boundary, and no ready/Cutter mutations.",
      blocks_docker_upload: !cutterCompatibilityProofReady,
      required_evidence: cutterCompatibilityProofReady ? undefined : "Deploy an Admin API that returns cutter_compatibility_proof from /api/admin/release-gates before Docker upload review."
    }),
    gate({
      id: "cutter-release-compatibility-live",
      title: "Cutter release/index/search compatibility is externally verified",
      category: "cutter-compatibility",
      status: "needs-external-proof",
      evidence: "Admin API GET endpoints cannot prove Windows Cutter compatibility after a Docker release candidate.",
      blocks_docker_upload: true,
      required_evidence: "Run admin-cutter-compatibility-proof with staged-candidate windows_acceptance and real_cut_smoke reports, then archive the accepted proof."
    })
  ];
}

export function summarizeLiveReleaseGates(gates: LiveReleaseGate[]): LiveReleaseGateSummary {
  const uploadBlockers = gates
    .filter((item) => item.blocks_docker_upload && item.status !== "pass")
    .map((item) => item.id);

  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    failed: gates.filter((item) => item.status === "fail").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    needs_external_proof: gates.filter((item) => item.status === "needs-external-proof").length,
    upload_blockers: uploadBlockers
  };
}

export function buildAdminDockerLiveReadonlyReport(input: {
  generated_at: string;
  command: string;
  base_url: string;
  expected_library_root: string;
  session_token_present: boolean;
  requests: LiveProbeResult[];
}): AdminDockerLiveReadonlyReport {
  const configured = Boolean(input.base_url);
  const targetClassification = classifyLiveReadonlyTarget(input.base_url);
  const observed = summarizeObserved(input.requests);
  const gates = buildLiveReleaseGates({
    target_configured: configured,
    target_classification: targetClassification,
    expected_library_root: input.expected_library_root,
    requests: input.requests,
    observed
  });
  const summary = summarizeLiveReleaseGates(gates);
  const liveReadinessReady = summary.upload_blockers.length === 0;
  const resultStatus = summary.failed > 0 ? "failed" : liveReadinessReady ? "ready" : "blocked";

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "live-readonly-get",
    target: {
      base_url: input.base_url,
      normalized_base_url: targetClassification.normalized_base_url,
      configured,
      kind: targetClassification.kind,
      safe_to_probe: targetClassification.safe_to_probe,
      classification_evidence: targetClassification.evidence,
      classification_notes: targetClassification.notes,
      expected_library_root: input.expected_library_root,
      session_token_present: input.session_token_present
    },
    live_readiness_ready: liveReadinessReady,
    docker_upload_allowed: false,
    requests: input.requests,
    observed,
    gates,
    summary,
    result: {
      status: resultStatus,
      summary: resultStatus === "ready"
        ? "Live readonly gates passed, but Docker upload remains a separate irreversible release decision."
        : resultStatus === "failed"
          ? "Live readonly probe failed due a safety or request-method violation."
          : "Docker upload remains blocked until all live and external proof gates pass."
    },
    artifacts: null
  };
}

async function requestProbe(input: {
  base_url: string;
  definition: LiveProbeDefinition;
  session_token?: string;
}): Promise<LiveProbeResult> {
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
    const response = await fetch(`${input.base_url}${input.definition.path}`, {
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
    const envelope = envelopeFromJson(parsed);
    const apiOk = input.definition.json && typeof envelope.ok === "boolean" ? envelope.ok : null;
    return {
      name: input.definition.name,
      method: input.definition.method,
      path: input.definition.path,
      duration_ms: roundMs(performance.now() - started),
      http_status: response.status,
      ok: response.ok && apiOk !== false && (!input.definition.json || isRecord(parsed)),
      api_ok: apiOk,
      response_bytes: Buffer.byteLength(text, "utf8"),
      content_type: contentType,
      data: input.definition.json ? sanitizeLiveProbeData(input.definition.name, envelope.data) : null,
      error_code: typeof envelope.error_code === "string" ? envelope.error_code : undefined,
      message: typeof envelope.message === "string" ? envelope.message : undefined
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
}): Promise<LiveProbeResult[]> {
  if (!input.base_url) {
    return [];
  }

  const baseUrl = trimTrailingSlash(input.base_url);
  const results: LiveProbeResult[] = [];
  for (const definition of buildLiveProbeDefinitions()) {
    results.push(await requestProbe({
      base_url: baseUrl,
      definition,
      session_token: input.session_token
    }));
  }

  return results;
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function renderGateRows(gates: LiveReleaseGate[]): string {
  return gates.map((item) => [
    item.id,
    item.title,
    item.category,
    item.status,
    item.blocks_docker_upload ? "yes" : "no",
    item.evidence,
    item.required_evidence ?? "n/a"
  ].map((cell) => escapeMarkdownCell(cell)).join(" | ")).join("\n");
}

function renderRequestRows(requests: LiveProbeResult[]): string {
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

export function renderMarkdown(report: AdminDockerLiveReadonlyReport): string {
  return `# Admin Docker Live Readonly Probe

Generated: ${report.generated_at}

Mode: ${report.mode}

Result: ${report.result.status}

Live readiness ready: ${report.live_readiness_ready ? "yes" : "no"}

Docker upload allowed: ${report.docker_upload_allowed ? "yes" : "no"}

This probe sends only GET requests. It does not start Docker, enable workers, repair usage-events, recover processing jobs, publish indexes, mutate NAS files, or change Cutter protocols. Optional session-token values are not written to the report; only \`session_token_present\` is recorded.

## Target

- Base URL configured: ${report.target.configured ? "yes" : "no"}
- Base URL: ${report.target.base_url || "not configured"}
- Normalized base URL: ${report.target.normalized_base_url || "n/a"}
- Target kind: ${report.target.kind}
- Safe to probe: ${report.target.safe_to_probe ? "yes" : "no"}
- Target classification: ${report.target.classification_evidence}
- Target notes: ${report.target.classification_notes.join("; ") || "none"}
- Expected library root: ${report.target.expected_library_root}
- Session token present: ${report.target.session_token_present ? "yes" : "no"}

## Observed

- Auth mode: ${report.observed.auth_mode || "unknown"}
- Authenticated: ${String(report.observed.authenticated)}
- Library root: ${report.observed.library_root || "unknown"}
- Runtime path profile: ${report.observed.runtime_path_profile || "unknown"}
- Current index: ${report.observed.current_index_version || "unknown"}
- Counts: total ${report.observed.video_count ?? "n/a"}, ready ${report.observed.ready_video_count ?? "n/a"}
- Build: sha ${report.observed.build_sha || "unknown"}, version ${report.observed.build_version || "unknown"}, image tag ${report.observed.image_tag || "unknown"}
- Release gates: overall ${report.observed.release_overall_status || "unknown"}, allowed ${String(report.observed.release_allowed)}

## Summary

- Passed: ${report.summary.passed}
- Failed: ${report.summary.failed}
- Blocked: ${report.summary.blocked}
- Needs external proof: ${report.summary.needs_external_proof}
- Upload blockers: ${report.summary.upload_blockers.join(", ") || "none"}

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
${renderRequestRows(report.requests)}

## Gates

| Gate | Title | Category | Status | Blocks Docker Upload | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
${renderGateRows(report.gates)}

## Scope

This is not a Docker deployment and not a Docker upload approval. It only narrows the live proof gap using existing GET endpoints on an explicitly configured target.

Worker runtime environment proof and Cutter compatibility proof remain external unless separate accepted artifacts are attached in a later release gate.

## Artifacts

- JSON: ${report.artifacts?.json_path ?? "not written"}
- Markdown: ${report.artifacts?.markdown_path ?? "not written"}
`;
}

export async function writeLiveReadonlyArtifacts(input: {
  report: AdminDockerLiveReadonlyReport;
  output_dir?: string;
  date?: Date;
}): Promise<AdminDockerLiveReadonlyReport> {
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  await mkdir(outputDir, { recursive: true });

  const stamp = timestampForFile(input.date);
  const jsonPath = path.join(outputDir, `admin-docker-release-live-readonly-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-release-live-readonly-${stamp}.md`);
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

export async function runLiveReadonlyProbe(input: {
  base_url?: string;
  expected_library_root?: string;
  session_token?: string;
  output_dir?: string;
  command?: string;
  date?: Date;
} = {}): Promise<AdminDockerLiveReadonlyReport> {
  const baseUrl = trimTrailingSlash(optionalTrimmed(input.base_url));
  const expectedLibraryRoot = optionalTrimmed(input.expected_library_root) || DEFAULT_EXPECTED_LIBRARY_ROOT;
  const sessionToken = optionalTrimmed(input.session_token);
  const targetClassification = classifyLiveReadonlyTarget(baseUrl);
  const requests = await runProbes({
    base_url: targetClassification.safe_to_probe ? targetClassification.normalized_base_url : "",
    session_token: sessionToken || undefined
  });
  const report = buildAdminDockerLiveReadonlyReport({
    generated_at: (input.date ?? new Date()).toISOString(),
    command: input.command ?? "npx tsx scripts/acceptance/admin-docker-release-live-readonly.ts",
    base_url: baseUrl,
    expected_library_root: expectedLibraryRoot,
    session_token_present: Boolean(sessionToken),
    requests
  });

  return writeLiveReadonlyArtifacts({
    report,
    output_dir: input.output_dir,
    date: input.date
  });
}

async function main(): Promise<void> {
  const outputDir = process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const report = await runLiveReadonlyProbe({
    base_url: process.env.MIXLAB_ADMIN_DOCKER_LIVE_BASE_URL,
    expected_library_root: process.env.MIXLAB_ADMIN_DOCKER_LIVE_EXPECT_LIBRARY_ROOT,
    session_token: process.env.MIXLAB_ADMIN_DOCKER_LIVE_SESSION_TOKEN,
    output_dir: outputDir,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify(report, null, 2));

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
