import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_ARTIFACT_DIR = "docs/acceptance/artifacts";

type CandidateTargetKind =
  | "not-configured"
  | "invalid-url"
  | "nas-desktop-url"
  | "non-root-path"
  | "local-loopback-candidate"
  | "staged-admin-web-candidate";
type CandidateProbeName =
  | "admin_web_root"
  | "auth_status"
  | "library_status"
  | "release_gates"
  | "data_loading_plan";
type CandidateProbeTargetRole = "web" | "api";
type CandidateGateStatus = "pass" | "blocked" | "fail";
type CandidateGateCategory = "target" | "safety" | "candidate-api" | "candidate-contract" | "release-boundary";
type CandidateProofSourceKind = "direct-probe" | "local-smoke-report";

interface ApiEnvelope {
  ok?: unknown;
  data?: unknown;
  error_code?: unknown;
  message?: unknown;
}

export interface CandidateTargetClassification {
  kind: CandidateTargetKind;
  normalized_base_url: string;
  safe_to_probe: boolean;
  evidence: string;
  notes: string[];
}

export interface CandidateProbeDefinition {
  name: CandidateProbeName;
  method: "GET";
  path: string;
  timeout_ms: number;
  json: boolean;
  protected: boolean;
  notes: string;
}

export interface CandidateProbeResult {
  name: CandidateProbeName;
  method: "GET";
  path: string;
  target_role?: CandidateProbeTargetRole;
  base_url?: string;
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

export interface CandidateContractGate {
  id: string;
  title: string;
  category: CandidateGateCategory;
  status: CandidateGateStatus;
  evidence: string;
  blocks_candidate_review: boolean;
  blocks_docker_upload: boolean;
  required_evidence?: string;
}

export interface CandidateContractSummary {
  total: number;
  passed: number;
  blocked: number;
  failed: number;
  candidate_review_blockers: string[];
  docker_upload_blockers: string[];
}

export interface CandidateProofSource {
  kind: CandidateProofSourceKind;
  report_path: string;
  local_smoke_passed: boolean | null;
  local_smoke_status: string;
  local_smoke_blockers: string[];
}

export interface AdminDockerCandidateContractProofReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-candidate-contract-proof";
  target: {
    base_url: string;
    normalized_base_url: string;
    configured: boolean;
    kind: CandidateTargetKind;
    safe_to_probe: boolean;
    classification_evidence: string;
    classification_notes: string[];
    api_base_url: string;
    api_normalized_base_url: string;
    api_configured: boolean;
    api_kind: CandidateTargetKind;
    api_safe_to_probe: boolean;
    api_classification_evidence: string;
    api_classification_notes: string[];
    split_api_target: boolean;
    session_token_present: boolean;
    nas_live_evidence: false;
  };
  source: CandidateProofSource;
  candidate_contract_ready: boolean;
  docker_upload_allowed: false;
  staging_approved: false;
  requests: CandidateProbeResult[];
  observed: {
    auth_mode: string;
    authenticated: boolean | null;
    library_root: string;
    current_index_version: string;
    release_overall_status: string;
    release_allowed: boolean | null;
    build_sha: string;
    build_version: string;
    image_tag: string;
  };
  gates: CandidateContractGate[];
  summary: CandidateContractSummary;
  result: {
    status: "ready-for-candidate-review" | "blocked" | "failed";
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

function optionalTrimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
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

function summaryBlockers(report: unknown, key = "local_smoke_blockers"): string[] {
  return asArray(asRecord(asRecord(report).summary)[key])
    .filter((item): item is string => typeof item === "string");
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]";
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

export function classifyCandidateTarget(baseUrl: string): CandidateTargetClassification {
  const trimmed = optionalTrimmed(baseUrl);
  if (!trimmed) {
    return {
      kind: "not-configured",
      normalized_base_url: "",
      safe_to_probe: false,
      evidence: "MIXLAB_ADMIN_DOCKER_CANDIDATE_BASE_URL is not set.",
      notes: [
        "This proof will not guess localhost, NAS, or Docker ports.",
        "Set a candidate admin-web root URL when a local or staged candidate exists."
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
      evidence: `Candidate URL is not parseable: ${trimmed}`,
      notes: ["Use an absolute http:// or https:// URL for the candidate admin-web root."]
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      kind: "invalid-url",
      normalized_base_url: "",
      safe_to_probe: false,
      evidence: `Unsupported candidate protocol: ${parsed.protocol}`,
      notes: ["Only http:// or https:// candidate targets are valid."]
    };
  }

  const pathname = parsed.pathname || "/";
  const lowerPath = pathname.toLowerCase();

  if (lowerPath === "/desktop" || lowerPath.startsWith("/desktop/")) {
    return {
      kind: "nas-desktop-url",
      normalized_base_url: trimTrailingSlash(trimmed),
      safe_to_probe: false,
      evidence: "Candidate path looks like the NAS desktop UI, not MixLab admin-web.",
      notes: ["Use the MixLab admin-web root, not a NAS desktop route."]
    };
  }

  if (pathname !== "/" || parsed.search || parsed.hash) {
    return {
      kind: "non-root-path",
      normalized_base_url: trimTrailingSlash(trimmed),
      safe_to_probe: false,
      evidence: `Candidate target has a non-root path/query/hash: ${pathname}${parsed.search}${parsed.hash}`,
      notes: ["Point the candidate proof at the admin-web root and let the script append /api/admin/* paths."]
    };
  }

  if (isLoopbackHost(parsed.hostname)) {
    return {
      kind: "local-loopback-candidate",
      normalized_base_url: parsed.origin,
      safe_to_probe: true,
      evidence: "Candidate target is local to the current machine and is allowed only as local candidate proof.",
      notes: [
        "This may prove local candidate API shape.",
        "It is not NAS Docker live evidence and cannot replace admin-docker-release-live-readonly."
      ]
    };
  }

  return {
    kind: "staged-admin-web-candidate",
    normalized_base_url: parsed.origin,
    safe_to_probe: true,
    evidence: "Candidate target shape is compatible with an admin-web root.",
    notes: [
      "This proves candidate contract shape only.",
      "NAS release still requires separate live-readonly, parity, worker, Cutter, disk, and rollback gates."
    ]
  };
}

export function buildCandidateProbeDefinitions(): CandidateProbeDefinition[] {
  return [
    {
      name: "admin_web_root",
      method: "GET",
      path: "/",
      timeout_ms: 5_000,
      json: false,
      protected: false,
      notes: "Candidate admin-web root."
    },
    {
      name: "auth_status",
      method: "GET",
      path: "/api/admin/auth/status",
      timeout_ms: 5_000,
      json: true,
      protected: false,
      notes: "Current Admin auth/session visibility endpoint."
    },
    {
      name: "library_status",
      method: "GET",
      path: "/api/admin/library/status",
      timeout_ms: 8_000,
      json: true,
      protected: true,
      notes: "Library root/index/count visibility, if candidate auth permits it."
    },
    {
      name: "release_gates",
      method: "GET",
      path: "/api/admin/release-gates",
      timeout_ms: 8_000,
      json: true,
      protected: true,
      notes: "Current release-gate contract endpoint."
    },
    {
      name: "data_loading_plan",
      method: "GET",
      path: "/api/admin/data-loading/plan",
      timeout_ms: 5_000,
      json: true,
      protected: true,
      notes: "Current data-loading contract endpoint."
    }
  ];
}

function envelopeFromJson(value: unknown): ApiEnvelope {
  return isRecord(value) ? value : {};
}

function requestFor(requests: CandidateProbeResult[], name: CandidateProbeName): CandidateProbeResult | undefined {
  return requests.find((request) => request.name === name);
}

function dataFor(requests: CandidateProbeResult[], name: CandidateProbeName): unknown {
  return requestFor(requests, name)?.data ?? null;
}

function requestOk(requests: CandidateProbeResult[], name: CandidateProbeName): boolean {
  return requestFor(requests, name)?.ok === true;
}

function requestDetail(requests: CandidateProbeResult[], name: CandidateProbeName): string {
  const request = requestFor(requests, name);
  if (!request) {
    return "request not run";
  }

  if (request.ok) {
    return `HTTP ${request.http_status}, ok, ${request.duration_ms}ms`;
  }

  return `HTTP ${request.http_status ?? "n/a"}, ${request.error_code ?? "failed"} ${request.message ?? ""}, ${request.duration_ms}ms`.trim();
}

function versionHealthParityContractReady(releaseGates: unknown): boolean {
  const readiness = asRecord(asRecord(releaseGates).version_health_parity);
  const expectedServices = asArray(readiness.expected_services);
  const healthPreflightEndpoints = asArray(readiness.health_preflight_endpoints);
  const externalProof = asArray(readiness.external_proof_required);

  return asString(readiness.safe_scope) === "version-health-only" &&
    asString(readiness.static_compose_gate) === "image-tag-static-parity" &&
    expectedServices.includes("admin-web") &&
    expectedServices.includes("admin-api") &&
    expectedServices.includes("admin-worker") &&
    healthPreflightEndpoints.includes("GET /") &&
    healthPreflightEndpoints.includes("GET /health") &&
    healthPreflightEndpoints.includes("GET /api/admin/release-gates") &&
    externalProof.length > 0 &&
    asBoolean(readiness.starts_workers) === false &&
    asBoolean(readiness.mutates_ready_assets) === false &&
    asBoolean(readiness.mutates_cutter_protocol) === false;
}

function diskSpaceProtectionContractReady(releaseGates: unknown): boolean {
  const readiness = asRecord(asRecord(releaseGates).disk_space_protection);
  const preflightEndpoints = asArray(readiness.preflight_endpoints);

  return asString(readiness.threshold_env_var) === "MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT" &&
    asString(readiness.write_block_scope) === "preprocess-and-docker-upload" &&
    preflightEndpoints.includes("GET /api/admin/release-gates") &&
    preflightEndpoints.includes("GET /api/admin/preprocess/safety") &&
    preflightEndpoints.includes("GET /api/admin/library/status") &&
    asBoolean(readiness.starts_workers) === false &&
    asBoolean(readiness.mutates_ready_assets) === false &&
    asBoolean(readiness.mutates_cutter_protocol) === false;
}

function usageEventsRepairContractReady(releaseGates: unknown): boolean {
  const readiness = asRecord(asRecord(releaseGates).usage_events_repair);

  return asString(readiness.safe_scope) === "usage-events-only" &&
    asString(readiness.dry_run_command).includes("usage-events-repair") &&
    asString(readiness.apply_command).includes("--apply") &&
    asBoolean(readiness.mutates_ready_assets) === false &&
    asBoolean(readiness.mutates_cutter_protocol) === false;
}

function processingRecoveryContractReady(releaseGates: unknown): boolean {
  const readiness = asRecord(asRecord(releaseGates).processing_recovery);

  return asString(readiness.safe_scope) === "processing-to-queued-only" &&
    asString(readiness.bulk_recovery_endpoint) === "POST /api/admin/preprocess/recover-processing" &&
    asArray(readiness.preflight_endpoints).length > 0 &&
    asBoolean(readiness.supervisor_must_be_idle) === true &&
    asBoolean(readiness.mutates_ready_assets) === false &&
    asBoolean(readiness.mutates_cutter_protocol) === false;
}

function adminWorkerEnvProofContractReady(releaseGates: unknown): boolean {
  const readiness = asRecord(asRecord(releaseGates).admin_worker_env_proof);
  const flags = asRecord(readiness.required_env_flags);
  const roots = asRecord(readiness.required_library_roots);

  return asString(readiness.status) === "external-proof-required" &&
    asString(readiness.expected_service) === "admin-worker" &&
    asString(readiness.safe_scope) === "admin-worker-env-only" &&
    asString(flags.MIXLAB_ADMIN_DOCKER_MVP_MODE) === "off" &&
    asString(flags.MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER) === "0" &&
    asString(flags.MIXLAB_ENABLE_READY_PUBLISH_WORKER) === "0" &&
    asString(roots.MIXLAB_ADMIN_LIBRARY_ROOT) === "/data/PublicLibrary" &&
    asString(roots.MIXLAB_PREPROCESS_LIBRARY_ROOT) === "/data/PublicLibrary" &&
    asString(readiness.proof_command).includes("admin-worker-env-proof") &&
    asArray(readiness.collection_commands).length > 0 &&
    asBoolean(readiness.starts_workers) === false &&
    asBoolean(readiness.records_secrets) === false &&
    asBoolean(readiness.mutates_ready_assets) === false &&
    asBoolean(readiness.mutates_cutter_protocol) === false;
}

function cutterCompatibilityProofContractReady(releaseGates: unknown): boolean {
  const readiness = asRecord(asRecord(releaseGates).cutter_compatibility_proof);
  const reports = asRecord(readiness.required_reports);

  return asString(readiness.status) === "external-proof-required" &&
    asString(readiness.expected_auth_mode) === "reviewed" &&
    asNumber(readiness.expected_ready_count) !== null &&
    asString(readiness.safe_scope) === "cutter-compatibility-only" &&
    asString(reports.windows_acceptance_env_var) === "MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT" &&
    asString(reports.real_cut_env_var) === "MIXLAB_CUTTER_REAL_CUT_REPORT" &&
    asString(readiness.proof_command).includes("admin-cutter-compatibility-proof") &&
    asArray(readiness.required_evidence).length > 0 &&
    asBoolean(readiness.requires_staged_candidate) === true &&
    asBoolean(readiness.contacts_windows_runner) === false &&
    asBoolean(readiness.contacts_docker) === false &&
    asBoolean(readiness.starts_workers) === false &&
    asBoolean(readiness.mutates_ready_assets) === false &&
    asBoolean(readiness.mutates_cutter_protocol) === false;
}

function gate(input: CandidateContractGate): CandidateContractGate {
  return input;
}

function summarize(gates: CandidateContractGate[]): CandidateContractSummary {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    failed: gates.filter((item) => item.status === "fail").length,
    candidate_review_blockers: gates
      .filter((item) => item.blocks_candidate_review && item.status !== "pass")
      .map((item) => item.id),
    docker_upload_blockers: gates
      .filter((item) => item.blocks_docker_upload &&
        (item.status !== "pass" || item.category === "release-boundary"))
      .map((item) => item.id)
  };
}

function summarizeObserved(requests: CandidateProbeResult[]): AdminDockerCandidateContractProofReport["observed"] {
  const auth = asRecord(dataFor(requests, "auth_status"));
  const library = asRecord(dataFor(requests, "library_status"));
  const release = asRecord(dataFor(requests, "release_gates"));
  const build = asRecord(release.build);

  return {
    auth_mode: asString(auth.auth_mode),
    authenticated: asBoolean(auth.authenticated),
    library_root: asString(library.root_path),
    current_index_version: asString(library.current_index_version),
    release_overall_status: asString(release.overall_status),
    release_allowed: asBoolean(release.release_allowed),
    build_sha: asString(build.sha),
    build_version: asString(build.version),
    image_tag: asString(build.image_tag)
  };
}

export function buildAdminDockerCandidateContractProofReport(input: {
  generated_at: string;
  command: string;
  base_url: string;
  api_base_url?: string;
  session_token_present: boolean;
  requests: CandidateProbeResult[];
  source?: CandidateProofSource;
}): AdminDockerCandidateContractProofReport {
  const configured = Boolean(input.base_url.trim());
  const explicitApiBaseUrl = optionalTrimmed(input.api_base_url);
  const apiBaseUrl = explicitApiBaseUrl ? trimTrailingSlash(explicitApiBaseUrl) : input.base_url;
  const classification = classifyCandidateTarget(input.base_url);
  const apiClassification = classifyCandidateTarget(apiBaseUrl);
  const splitApiTarget = Boolean(explicitApiBaseUrl) &&
    classification.normalized_base_url !== apiClassification.normalized_base_url;
  const releaseGates = dataFor(input.requests, "release_gates");
  const observed = summarizeObserved(input.requests);
  const currentEndpointsReady = requestOk(input.requests, "auth_status") &&
    requestOk(input.requests, "release_gates") &&
    requestOk(input.requests, "data_loading_plan");
  const allRequestsAreGet = input.requests.every((request) => request.method === "GET");
  const source = input.source ?? {
    kind: "direct-probe" as const,
    report_path: "",
    local_smoke_passed: null,
    local_smoke_status: "",
    local_smoke_blockers: []
  };
  const localSmokeSourceAccepted = source.kind !== "local-smoke-report" || source.local_smoke_passed === true;
  const gates = [
    gate({
      id: "candidate-proof-no-side-effects",
      title: "Candidate proof has no runtime side effects",
      category: "safety",
      status: "pass",
      evidence: source.kind === "local-smoke-report"
        ? "The proof reuses GET-only endpoint observations from the archived local Docker smoke report and never starts Docker, enables workers, writes NAS files, repairs usage-events, recovers jobs, publishes indexes, or changes Cutter protocols."
        : "The proof uses GET requests only and never starts Docker, enables workers, writes NAS files, repairs usage-events, recovers jobs, publishes indexes, or changes Cutter protocols.",
      blocks_candidate_review: false,
      blocks_docker_upload: false
    }),
    gate({
      id: "candidate-proof-source-accepted",
      title: "Candidate proof source is accepted",
      category: "safety",
      status: localSmokeSourceAccepted ? "pass" : "blocked",
      evidence: source.kind === "local-smoke-report"
        ? `Derived from local smoke report ${source.report_path || "missing"}; local_smoke_passed=${String(source.local_smoke_passed)}, status=${source.local_smoke_status || "unknown"}, blockers=${source.local_smoke_blockers.join(", ") || "none"}.`
        : "Direct candidate probe source.",
      blocks_candidate_review: !localSmokeSourceAccepted,
      blocks_docker_upload: true,
      required_evidence: localSmokeSourceAccepted
        ? undefined
        : "The local Docker smoke report must have local_smoke_passed=true before it can supply candidate contract evidence."
    }),
    gate({
      id: "candidate-target-configured",
      title: "Candidate target URL is explicit",
      category: "target",
      status: configured ? "pass" : "blocked",
      evidence: configured ? "Candidate target was supplied explicitly." : "MIXLAB_ADMIN_DOCKER_CANDIDATE_BASE_URL is not set.",
      blocks_candidate_review: !configured,
      blocks_docker_upload: true,
      required_evidence: configured ? undefined : "Set MIXLAB_ADMIN_DOCKER_CANDIDATE_BASE_URL to a local or staged admin-web root."
    }),
    gate({
      id: "candidate-target-shape",
      title: "Candidate target is an admin-web root",
      category: "target",
      status: classification.safe_to_probe ? "pass" : "blocked",
      evidence: `${classification.kind}: ${classification.evidence}`,
      blocks_candidate_review: !classification.safe_to_probe,
      blocks_docker_upload: true,
      required_evidence: classification.safe_to_probe ? undefined : "Use an admin-web root URL, not NAS desktop, a subpath, query, or hash."
    }),
    gate({
      id: "candidate-api-target-shape",
      title: "Candidate API target is an admin API root",
      category: "target",
      status: apiClassification.safe_to_probe ? "pass" : "blocked",
      evidence: explicitApiBaseUrl
        ? `${apiClassification.kind}: ${apiClassification.evidence}`
        : `inherited-web-target: ${classification.evidence}`,
      blocks_candidate_review: !apiClassification.safe_to_probe,
      blocks_docker_upload: true,
      required_evidence: apiClassification.safe_to_probe
        ? undefined
        : "Use an admin API root URL, not NAS desktop, a subpath, query, or hash."
    }),
    gate({
      id: "candidate-not-nas-live-evidence",
      title: "Candidate proof is not NAS live release evidence",
      category: "release-boundary",
      status: "pass",
      evidence: "This report always sets nas_live_evidence=false and cannot replace admin-docker-release-live-readonly.",
      blocks_candidate_review: false,
      blocks_docker_upload: true,
      required_evidence: "Run the separate NAS live-readonly probe after a staged target exists."
    }),
    gate({
      id: "candidate-probe-get-only",
      title: "Candidate probe uses GET only",
      category: "safety",
      status: allRequestsAreGet ? "pass" : "fail",
      evidence: `methods=${input.requests.map((request) => request.method).join(",") || "none"}`,
      blocks_candidate_review: !allRequestsAreGet,
      blocks_docker_upload: true
    }),
    gate({
      id: "candidate-admin-web-root",
      title: "Candidate Admin Web root is reachable",
      category: "candidate-api",
      status: requestOk(input.requests, "admin_web_root") ? "pass" : "blocked",
      evidence: requestDetail(input.requests, "admin_web_root"),
      blocks_candidate_review: !requestOk(input.requests, "admin_web_root"),
      blocks_docker_upload: true,
      required_evidence: "GET / must return an Admin Web response from the candidate target."
    }),
    gate({
      id: "candidate-current-admin-api-contract",
      title: "Candidate exposes current Admin API endpoints",
      category: "candidate-api",
      status: currentEndpointsReady ? "pass" : "blocked",
      evidence: currentEndpointsReady
        ? "auth/status, release-gates, and data-loading/plan responded."
        : `auth=${requestDetail(input.requests, "auth_status")}; release_gates=${requestDetail(input.requests, "release_gates")}; data_loading=${requestDetail(input.requests, "data_loading_plan")}`,
      blocks_candidate_review: !currentEndpointsReady,
      blocks_docker_upload: true,
      required_evidence: "Candidate must expose /api/admin/auth/status, /api/admin/release-gates, and /api/admin/data-loading/plan."
    }),
    gate({
      id: "candidate-version-health-contract",
      title: "Candidate exposes version/health parity contract",
      category: "candidate-contract",
      status: versionHealthParityContractReady(releaseGates) ? "pass" : "blocked",
      evidence: versionHealthParityContractReady(releaseGates)
        ? "version_health_parity contract is complete."
        : "version_health_parity contract is missing or incomplete.",
      blocks_candidate_review: !versionHealthParityContractReady(releaseGates),
      blocks_docker_upload: true,
      required_evidence: "release-gates must expose version_health_parity with expected services, GET preflight endpoints, external proof requirements, and no ready/Cutter mutations."
    }),
    gate({
      id: "candidate-disk-protection-contract",
      title: "Candidate exposes disk-space protection contract",
      category: "candidate-contract",
      status: diskSpaceProtectionContractReady(releaseGates) ? "pass" : "blocked",
      evidence: diskSpaceProtectionContractReady(releaseGates)
        ? "disk_space_protection contract is complete."
        : "disk_space_protection contract is missing or incomplete.",
      blocks_candidate_review: !diskSpaceProtectionContractReady(releaseGates),
      blocks_docker_upload: true,
      required_evidence: "release-gates must expose disk_space_protection with GET preflight endpoints and no worker/ready/Cutter mutations."
    }),
    gate({
      id: "candidate-usage-events-repair-contract",
      title: "Candidate exposes usage-events repair contract",
      category: "candidate-contract",
      status: usageEventsRepairContractReady(releaseGates) ? "pass" : "blocked",
      evidence: usageEventsRepairContractReady(releaseGates)
        ? "usage_events_repair contract is complete."
        : "usage_events_repair contract is missing or incomplete.",
      blocks_candidate_review: !usageEventsRepairContractReady(releaseGates),
      blocks_docker_upload: true,
      required_evidence: "release-gates must expose usage_events_repair dry-run/apply commands with usage-events-only scope and no ready/Cutter mutations."
    }),
    gate({
      id: "candidate-processing-recovery-contract",
      title: "Candidate exposes processing recovery contract",
      category: "candidate-contract",
      status: processingRecoveryContractReady(releaseGates) ? "pass" : "blocked",
      evidence: processingRecoveryContractReady(releaseGates)
        ? "processing_recovery contract is complete."
        : "processing_recovery contract is missing or incomplete.",
      blocks_candidate_review: !processingRecoveryContractReady(releaseGates),
      blocks_docker_upload: true,
      required_evidence: "release-gates must expose processing_recovery preflight scope, idle-supervisor requirement, and no ready/Cutter mutations."
    }),
    gate({
      id: "candidate-admin-worker-env-proof-contract",
      title: "Candidate exposes admin-worker env proof contract",
      category: "candidate-contract",
      status: adminWorkerEnvProofContractReady(releaseGates) ? "pass" : "blocked",
      evidence: adminWorkerEnvProofContractReady(releaseGates)
        ? "admin_worker_env_proof contract is complete."
        : "admin_worker_env_proof contract is missing or incomplete.",
      blocks_candidate_review: !adminWorkerEnvProofContractReady(releaseGates),
      blocks_docker_upload: true,
      required_evidence: "release-gates must expose admin_worker_env_proof with disabled standalone worker flags, /data/PublicLibrary roots, proof command, no secrets, no worker start, and no ready/Cutter mutations."
    }),
    gate({
      id: "candidate-cutter-compatibility-proof-contract",
      title: "Candidate exposes Cutter compatibility proof contract",
      category: "candidate-contract",
      status: cutterCompatibilityProofContractReady(releaseGates) ? "pass" : "blocked",
      evidence: cutterCompatibilityProofContractReady(releaseGates)
        ? "cutter_compatibility_proof contract is complete."
        : "cutter_compatibility_proof contract is missing or incomplete.",
      blocks_candidate_review: !cutterCompatibilityProofContractReady(releaseGates),
      blocks_docker_upload: true,
      required_evidence: "release-gates must expose cutter_compatibility_proof with Windows acceptance and real-cut requirements, staged-candidate boundary, and no ready/Cutter mutations."
    }),
    gate({
      id: "candidate-does-not-approve-upload",
      title: "Candidate proof does not approve Docker upload",
      category: "release-boundary",
      status: "pass",
      evidence: "docker_upload_allowed=false and staging_approved=false are hard-coded in this report.",
      blocks_candidate_review: false,
      blocks_docker_upload: true,
      required_evidence: "Docker upload requires separate NAS live-readonly, parity, worker, Cutter, staging-tag, rollback, disk, and release decision gates."
    })
  ];
  const summary = summarize(gates);
  const candidateReady = summary.candidate_review_blockers.length === 0;
  const resultStatus = summary.failed > 0 ? "failed" : candidateReady ? "ready-for-candidate-review" : "blocked";

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-candidate-contract-proof",
    target: {
      base_url: input.base_url,
      normalized_base_url: classification.normalized_base_url,
      configured,
      kind: classification.kind,
      safe_to_probe: classification.safe_to_probe,
      classification_evidence: classification.evidence,
      classification_notes: classification.notes,
      api_base_url: explicitApiBaseUrl,
      api_normalized_base_url: apiClassification.normalized_base_url,
      api_configured: Boolean(explicitApiBaseUrl),
      api_kind: apiClassification.kind,
      api_safe_to_probe: apiClassification.safe_to_probe,
      api_classification_evidence: apiClassification.evidence,
      api_classification_notes: apiClassification.notes,
      split_api_target: splitApiTarget,
      session_token_present: input.session_token_present,
      nas_live_evidence: false
    },
    source,
    candidate_contract_ready: candidateReady,
    docker_upload_allowed: false,
    staging_approved: false,
    requests: input.requests,
    observed,
    gates,
    summary,
    result: {
      status: resultStatus,
      summary: resultStatus === "ready-for-candidate-review"
        ? "Candidate API/version contract is ready for review, but Docker upload and staging remain separate blocked decisions."
        : resultStatus === "failed"
          ? "Candidate contract proof failed because a safety invariant was violated."
          : "Candidate contract proof remains blocked until the candidate exposes the required current API and release-gate contracts."
    },
    artifacts: null
  };
}

function localSmokeProbeToCandidateProbe(input: {
  probe: unknown;
  base_url: string;
}): CandidateProbeResult | null {
  const probe = asRecord(input.probe);
  const name = asString(probe.name) as CandidateProbeName;
  const definitions = new Map(buildCandidateProbeDefinitions().map((item) => [item.name, item]));
  const definition = definitions.get(name);
  if (!definition) {
    return null;
  }

  const targetRole: CandidateProbeTargetRole = name === "admin_web_root" ? "web" : "api";

  return {
    name,
    method: "GET",
    path: asString(probe.path) || definition.path,
    target_role: targetRole,
    base_url: input.base_url,
    duration_ms: asNumber(probe.duration_ms) ?? 0,
    http_status: asNumber(probe.http_status),
    ok: asBoolean(probe.ok) === true,
    api_ok: asBoolean(probe.api_ok),
    response_bytes: asNumber(probe.response_bytes) ?? 0,
    content_type: asString(probe.content_type),
    data: probe.data ?? null,
    error_code: asString(probe.error_code) || undefined,
    message: asString(probe.message) || undefined
  };
}

function requestsFromLocalSmokeReport(input: {
  report: unknown;
  base_url: string;
}): CandidateProbeResult[] {
  return asArray(asRecord(input.report).probes)
    .map((probe) => localSmokeProbeToCandidateProbe({ probe, base_url: input.base_url }))
    .filter((probe): probe is CandidateProbeResult => probe !== null);
}

function sourceFromLocalSmokeReport(input: {
  report: unknown;
  report_path: string;
}): CandidateProofSource {
  return {
    kind: "local-smoke-report",
    report_path: input.report_path,
    local_smoke_passed: asBoolean(asRecord(input.report).local_smoke_passed),
    local_smoke_status: asString(asRecord(asRecord(input.report).result).status),
    local_smoke_blockers: summaryBlockers(input.report)
  };
}

function latestArtifact(artifactDir: string, prefix: string): Promise<string> {
  return readdir(artifactDir).then((files) => {
    const candidates = files
      .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
      .sort();

    if (candidates.length === 0) {
      throw new Error(`No ${prefix}*.json artifact found in ${artifactDir}`);
    }

    return path.join(artifactDir, candidates[candidates.length - 1]);
  });
}

async function loadJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Failed to read JSON report at ${filePath}: ${errorMessage(error)}`);
  }
}

async function requestProbe(input: {
  base_url: string;
  target_role: CandidateProbeTargetRole;
  definition: CandidateProbeDefinition;
  session_token?: string;
}): Promise<CandidateProbeResult> {
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
      target_role: input.target_role,
      base_url: input.base_url,
      duration_ms: roundMs(performance.now() - started),
      http_status: response.status,
      ok: response.ok && apiOk !== false && (!input.definition.json || isRecord(parsed)),
      api_ok: apiOk,
      response_bytes: Buffer.byteLength(text, "utf8"),
      content_type: contentType,
      data: input.definition.json ? envelope.data : null,
      error_code: typeof envelope.error_code === "string" ? envelope.error_code : undefined,
      message: typeof envelope.message === "string" ? envelope.message : undefined
    };
  } catch (error) {
    return {
      name: input.definition.name,
      method: input.definition.method,
      path: input.definition.path,
      target_role: input.target_role,
      base_url: input.base_url,
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
  web_base_url: string;
  api_base_url: string;
  session_token?: string;
}): Promise<CandidateProbeResult[]> {
  if (!input.web_base_url || !input.api_base_url) {
    return [];
  }

  const results: CandidateProbeResult[] = [];
  for (const definition of buildCandidateProbeDefinitions()) {
    const targetRole: CandidateProbeTargetRole = definition.name === "admin_web_root" ? "web" : "api";
    const baseUrl = targetRole === "web" ? input.web_base_url : input.api_base_url;
    results.push(await requestProbe({
      base_url: baseUrl,
      target_role: targetRole,
      definition,
      session_token: input.session_token
    }));
  }

  return results;
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function renderRequestRows(requests: CandidateProbeResult[]): string {
  if (requests.length === 0) {
    return "none | n/a | n/a | n/a | n/a | n/a | n/a | n/a";
  }

  return requests.map((request) => [
    request.name,
    request.target_role ?? "unknown",
    request.base_url ?? "unknown",
    `${request.method} ${request.path}`,
    String(request.http_status ?? "n/a"),
    request.ok ? "yes" : "no",
    `${request.duration_ms.toFixed(1)}ms`,
    request.error_code ?? "none"
  ].map((cell) => escapeMarkdownCell(cell)).join(" | ")).join("\n");
}

function renderGateRows(gates: CandidateContractGate[]): string {
  return gates.map((item) => [
    item.id,
    item.category,
    item.status,
    item.blocks_candidate_review ? "yes" : "no",
    item.blocks_docker_upload ? "yes" : "no",
    item.evidence,
    item.required_evidence ?? "n/a"
  ].map((cell) => escapeMarkdownCell(cell)).join(" | ")).join("\n");
}

export function renderCandidateMarkdown(report: AdminDockerCandidateContractProofReport): string {
  return `# Admin Docker Candidate Contract Proof

Generated: ${report.generated_at}

Mode: ${report.mode}

Result: ${report.result.status}

Candidate contract ready: ${report.candidate_contract_ready ? "yes" : "no"}

Docker upload allowed: ${report.docker_upload_allowed ? "yes" : "no"}

Staging approved: ${report.staging_approved ? "yes" : "no"}

This proof uses only GET request evidence from explicit candidate Web/API target roots. When source is local-smoke-report, the GET evidence is reused from the archived local Docker smoke report. It does not run Docker, build images, push images, restart containers, enable workers, write NAS files, repair usage-events, recover processing jobs, publish indexes, run Windows Runner, launch Cutter, or change Cutter protocols.

## Source

- Source kind: ${report.source.kind}
- Source report: ${report.source.report_path || "n/a"}
- Local smoke passed: ${String(report.source.local_smoke_passed)}
- Local smoke status: ${report.source.local_smoke_status || "n/a"}
- Local smoke blockers: ${report.source.local_smoke_blockers.join(", ") || "none"}

## Target

- Base URL configured: ${report.target.configured ? "yes" : "no"}
- Web base URL: ${report.target.base_url || "not configured"}
- Web normalized base URL: ${report.target.normalized_base_url || "n/a"}
- Web target kind: ${report.target.kind}
- Web safe to probe: ${report.target.safe_to_probe ? "yes" : "no"}
- Web target classification: ${report.target.classification_evidence}
- Web target notes: ${report.target.classification_notes.join("; ") || "none"}
- API base URL configured: ${report.target.api_configured ? "yes" : "no"}
- API base URL: ${report.target.api_base_url || "inherits Web base URL"}
- API normalized base URL: ${report.target.api_normalized_base_url || "n/a"}
- API target kind: ${report.target.api_kind}
- API safe to probe: ${report.target.api_safe_to_probe ? "yes" : "no"}
- API target classification: ${report.target.api_classification_evidence}
- API target notes: ${report.target.api_classification_notes.join("; ") || "none"}
- Split API target: ${report.target.split_api_target ? "yes" : "no"}
- Session token present: ${report.target.session_token_present ? "yes" : "no"}
- NAS live evidence: ${report.target.nas_live_evidence ? "yes" : "no"}

## Observed

- Auth mode: ${report.observed.auth_mode || "unknown"}
- Authenticated: ${String(report.observed.authenticated)}
- Library root: ${report.observed.library_root || "unknown"}
- Current index: ${report.observed.current_index_version || "unknown"}
- Build: sha ${report.observed.build_sha || "unknown"}, version ${report.observed.build_version || "unknown"}, image tag ${report.observed.image_tag || "unknown"}
- Release gates: overall ${report.observed.release_overall_status || "unknown"}, allowed ${String(report.observed.release_allowed)}

## Summary

- Passed: ${report.summary.passed}
- Failed: ${report.summary.failed}
- Blocked: ${report.summary.blocked}
- Candidate review blockers: ${report.summary.candidate_review_blockers.join(", ") || "none"}
- Docker upload blockers: ${report.summary.docker_upload_blockers.join(", ") || "none"}

## Requests

| Probe | Target | Base URL | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- | --- | --- |
${renderRequestRows(report.requests)}

## Gates

| Gate | Category | Status | Blocks Candidate Review | Blocks Docker Upload | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
${renderGateRows(report.gates)}

## Scope

This is candidate contract proof only. It cannot replace NAS live-readonly evidence, admin-worker external proof, Cutter compatibility proof, staging runbook tags, rollback evidence, or a separate release decision.

## Artifacts

- JSON: ${report.artifacts?.json_path ?? "not written"}
- Markdown: ${report.artifacts?.markdown_path ?? "not written"}
`;
}

export async function writeCandidateContractArtifacts(input: {
  report: AdminDockerCandidateContractProofReport;
  output_dir?: string;
  date?: Date;
}): Promise<AdminDockerCandidateContractProofReport> {
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  await mkdir(outputDir, { recursive: true });

  const stamp = timestampForFile(input.date);
  const jsonPath = path.join(outputDir, `admin-docker-candidate-contract-proof-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-candidate-contract-proof-${stamp}.md`);
  const report = {
    ...input.report,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderCandidateMarkdown(report), "utf8");
  return report;
}

export async function runCandidateContractProof(input: {
  base_url?: string;
  api_base_url?: string;
  session_token?: string;
  output_dir?: string;
  command?: string;
  date?: Date;
  source?: CandidateProofSource;
  requests?: CandidateProbeResult[];
} = {}): Promise<AdminDockerCandidateContractProofReport> {
  const baseUrl = trimTrailingSlash(optionalTrimmed(input.base_url));
  const explicitApiBaseUrl = trimTrailingSlash(optionalTrimmed(input.api_base_url));
  const apiBaseUrl = explicitApiBaseUrl || baseUrl;
  const sessionToken = optionalTrimmed(input.session_token);
  const classification = classifyCandidateTarget(baseUrl);
  const apiClassification = classifyCandidateTarget(apiBaseUrl);
  const safeToProbe = classification.safe_to_probe && apiClassification.safe_to_probe;
  const requests = input.requests ?? await runProbes({
    web_base_url: safeToProbe ? classification.normalized_base_url : "",
    api_base_url: safeToProbe ? apiClassification.normalized_base_url : "",
    session_token: sessionToken || undefined
  });
  const report = buildAdminDockerCandidateContractProofReport({
    generated_at: (input.date ?? new Date()).toISOString(),
    command: input.command ?? "npx tsx scripts/acceptance/admin-docker-candidate-contract-proof.ts",
    base_url: baseUrl,
    api_base_url: explicitApiBaseUrl,
    session_token_present: Boolean(sessionToken),
    requests,
    source: input.source
  });

  return writeCandidateContractArtifacts({
    report,
    output_dir: input.output_dir,
    date: input.date
  });
}

export async function runCandidateContractProofFromLocalSmoke(input: {
  local_smoke_report_path: string;
  output_dir?: string;
  command?: string;
  date?: Date;
}): Promise<AdminDockerCandidateContractProofReport> {
  const localSmokeReport = await loadJson(input.local_smoke_report_path);
  const observations = asRecord(asRecord(localSmokeReport).observations);
  const webUrl = trimTrailingSlash(asString(observations.web_url));
  const source = sourceFromLocalSmokeReport({
    report: localSmokeReport,
    report_path: input.local_smoke_report_path
  });
  const requests = requestsFromLocalSmokeReport({
    report: localSmokeReport,
    base_url: webUrl
  });

  return runCandidateContractProof({
    base_url: webUrl,
    requests,
    source,
    output_dir: input.output_dir,
    command: input.command ?? "npx tsx scripts/acceptance/admin-docker-candidate-contract-proof.ts",
    date: input.date
  });
}

async function main(): Promise<void> {
  const outputDir = process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR;
  const artifactDir = process.env.MIXLAB_ACCEPTANCE_ARTIFACT_DIR ?? outputDir ?? DEFAULT_ARTIFACT_DIR;
  const useLocalSmoke = process.env.MIXLAB_ADMIN_DOCKER_CANDIDATE_FROM_LOCAL_SMOKE === "1";
  const report = useLocalSmoke
    ? await runCandidateContractProofFromLocalSmoke({
      local_smoke_report_path: process.env.MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_REPORT
        ?? await latestArtifact(artifactDir, "admin-docker-local-smoke-"),
      output_dir: outputDir,
      command: process.argv.join(" ")
    })
    : await runCandidateContractProof({
      base_url: process.env.MIXLAB_ADMIN_DOCKER_CANDIDATE_BASE_URL,
      api_base_url: process.env.MIXLAB_ADMIN_DOCKER_CANDIDATE_API_BASE_URL,
      session_token: process.env.MIXLAB_ADMIN_DOCKER_CANDIDATE_SESSION_TOKEN,
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
