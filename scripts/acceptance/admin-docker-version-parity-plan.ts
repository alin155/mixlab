import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_ARTIFACT_DIR = "docs/acceptance/artifacts";
const LIVE_REPORT_PREFIX = "admin-docker-release-live-readonly-";
const LIVE_REPORT_SUFFIX = ".json";

type ParityGateStatus = "pass" | "blocked" | "needs-external-proof";
type ParityGateCategory =
  | "safety"
  | "live-evidence"
  | "api-contract"
  | "docker-runtime"
  | "nas-risk"
  | "cutter-compatibility";

interface LiveRequest {
  name?: unknown;
  http_status?: unknown;
  ok?: unknown;
  error_code?: unknown;
  message?: unknown;
  duration_ms?: unknown;
}

interface AdminDockerVersionParityGate {
  id: string;
  title: string;
  category: ParityGateCategory;
  status: ParityGateStatus;
  evidence: string;
  blocks_docker_upload: boolean;
  required_evidence?: string;
}

interface AdminDockerVersionParitySummary {
  total: number;
  passed: number;
  blocked: number;
  needs_external_proof: number;
  upload_blockers: string[];
}

export interface AdminDockerVersionParityPlanReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "docker-version-api-parity-plan";
  source_artifact: string;
  target: {
    base_url: string;
    normalized_base_url: string;
    configured: boolean;
    kind: string;
    safe_to_probe: boolean;
    expected_library_root: string;
  };
  observations: {
    admin_web_reachable: boolean;
    admin_api_proxy_reachable: boolean;
    live_target_kind: string;
    live_target_safe_to_probe: boolean;
    current_api_contract_ready: boolean;
    missing_current_endpoints: string[];
    version_health_parity_contract_ready: boolean;
    version_health_parity_status: string;
    admin_worker_env_proof_contract_ready: boolean;
    admin_worker_env_proof_status: string;
    cutter_compatibility_proof_contract_ready: boolean;
    cutter_compatibility_proof_status: string;
    library_root: string;
    current_index_version: string;
    video_count: number | null;
    ready_video_count: number | null;
    disk_usage_percent: number | null;
    disk_status: string;
    build_sha: string;
    build_version: string;
    image_tag: string;
  };
  decision: {
    docker_image_update_required: boolean;
    docker_deploy_allowed_now: false;
    user_assistance_required: string[];
    summary: string;
  };
  gates: AdminDockerVersionParityGate[];
  summary: AdminDockerVersionParitySummary;
  result: {
    status: "blocked";
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

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function liveRequests(liveReport: unknown): LiveRequest[] {
  return asArray(asRecord(liveReport).requests).map((request) => asRecord(request));
}

function liveRequest(liveReport: unknown, name: string): LiveRequest {
  return liveRequests(liveReport).find((request) => request.name === name) ?? {};
}

function liveRequestOk(liveReport: unknown, name: string): boolean {
  return asBoolean(liveRequest(liveReport, name).ok) === true;
}

function liveRequestDetail(liveReport: unknown, name: string): string {
  const request = liveRequest(liveReport, name);
  const status = asNumber(request.http_status);
  const ok = asBoolean(request.ok);
  const errorCode = asString(request.error_code);
  const message = asString(request.message);
  const duration = asNumber(request.duration_ms);

  if (!request.name) {
    return "request not present";
  }

  const durationText = duration === null ? "" : `, ${duration}ms`;
  if (ok) {
    return `HTTP ${status ?? "n/a"}, ok${durationText}`;
  }

  return `HTTP ${status ?? "n/a"}, ${errorCode || "failed"} ${message}${durationText}`.trim();
}

function dataFor(liveReport: unknown, name: string): Record<string, unknown> {
  return asRecord(liveRequest(liveReport, name).data);
}

function currentEndpointPath(name: string): string {
  if (name === "auth_status") {
    return "/api/admin/auth/status";
  }

  if (name === "release_gates") {
    return "/api/admin/release-gates";
  }

  return "/api/admin/data-loading/plan";
}

function currentApiMissingEndpoints(liveReport: unknown): string[] {
  return ["auth_status", "release_gates", "data_loading_plan"]
    .filter((name) => !liveRequestOk(liveReport, name))
    .map(currentEndpointPath);
}

function versionHealthParityReadiness(liveReport: unknown): Record<string, unknown> {
  return asRecord(dataFor(liveReport, "release_gates").version_health_parity);
}

function versionHealthParityContractReady(liveReport: unknown): boolean {
  const readiness = versionHealthParityReadiness(liveReport);
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
    asString(readiness.live_probe_command).includes("admin-docker-release-live-readonly") &&
    asBoolean(readiness.starts_workers) === false &&
    asBoolean(readiness.mutates_ready_assets) === false &&
    asBoolean(readiness.mutates_cutter_protocol) === false;
}

function adminWorkerEnvProofReadiness(liveReport: unknown): Record<string, unknown> {
  return asRecord(dataFor(liveReport, "release_gates").admin_worker_env_proof);
}

function adminWorkerEnvProofContractReady(liveReport: unknown): boolean {
  const readiness = adminWorkerEnvProofReadiness(liveReport);
  const requiredFlags = asRecord(readiness.required_env_flags);
  const requiredRoots = asRecord(readiness.required_library_roots);
  const collectionCommands = asArray(readiness.collection_commands);

  return asString(readiness.status) === "external-proof-required" &&
    asString(readiness.expected_service) === "admin-worker" &&
    asString(readiness.safe_scope) === "admin-worker-env-only" &&
    asString(requiredFlags.MIXLAB_ADMIN_DOCKER_MVP_MODE) === "v0.1" &&
    asString(requiredFlags.MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER) === "0" &&
    asString(requiredFlags.MIXLAB_ENABLE_READY_PUBLISH_WORKER) === "0" &&
    asString(requiredRoots.MIXLAB_ADMIN_LIBRARY_ROOT) === "/data/PublicLibrary" &&
    asString(requiredRoots.MIXLAB_PREPROCESS_LIBRARY_ROOT) === "/data/PublicLibrary" &&
    collectionCommands.length > 0 &&
    asString(readiness.proof_command).includes("admin-worker-env-proof") &&
    asBoolean(readiness.starts_workers) === false &&
    asBoolean(readiness.records_secrets) === false &&
    asBoolean(readiness.mutates_ready_assets) === false &&
    asBoolean(readiness.mutates_cutter_protocol) === false;
}

function cutterCompatibilityProofReadiness(liveReport: unknown): Record<string, unknown> {
  return asRecord(dataFor(liveReport, "release_gates").cutter_compatibility_proof);
}

function cutterCompatibilityProofContractReady(liveReport: unknown): boolean {
  const readiness = cutterCompatibilityProofReadiness(liveReport);
  const requiredReports = asRecord(readiness.required_reports);
  const requiredEvidence = asArray(readiness.required_evidence);

  return asString(readiness.status) === "external-proof-required" &&
    asString(readiness.expected_auth_mode) === "reviewed" &&
    asNumber(readiness.expected_ready_count) !== null &&
    asString(readiness.safe_scope) === "cutter-compatibility-only" &&
    asString(requiredReports.windows_acceptance_env_var) === "MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT" &&
    asString(requiredReports.real_cut_env_var) === "MIXLAB_CUTTER_REAL_CUT_REPORT" &&
    requiredEvidence.length > 0 &&
    asString(readiness.proof_command).includes("admin-cutter-compatibility-proof") &&
    asBoolean(readiness.requires_staged_candidate) === true &&
    asBoolean(readiness.contacts_windows_runner) === false &&
    asBoolean(readiness.contacts_docker) === false &&
    asBoolean(readiness.starts_workers) === false &&
    asBoolean(readiness.mutates_ready_assets) === false &&
    asBoolean(readiness.mutates_cutter_protocol) === false;
}

function gate(input: AdminDockerVersionParityGate): AdminDockerVersionParityGate {
  return input;
}

function summarize(gates: AdminDockerVersionParityGate[]): AdminDockerVersionParitySummary {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    needs_external_proof: gates.filter((item) => item.status === "needs-external-proof").length,
    upload_blockers: gates
      .filter((item) => item.blocks_docker_upload && item.status !== "pass")
      .map((item) => item.id)
  };
}

function userAssistanceFor(input: {
  dockerImageUpdateRequired: boolean;
  missingCurrentEndpoints: string[];
}): string[] {
  const items: string[] = [];

  if (input.dockerImageUpdateRequired) {
    items.push("Provide or approve NAS Docker image/version parity evidence before any deploy: current image tag, target image tag, and rollback tag.");
  }

  items.push("Provide external admin-worker environment proof from the NAS host or exported Docker inspect/.env output.");
  items.push("Run or allow the Windows Cutter compatibility smoke only after a staged Docker release candidate exists.");

  if (input.missingCurrentEndpoints.length > 0) {
    items.push("Do not provide credentials as a workaround for missing API routes; first point NAS Docker at an image exposing the current Admin API contract.");
  }

  return items;
}

export function buildAdminDockerVersionParityPlanReport(input: {
  generated_at: string;
  command: string;
  source_artifact: string;
  live_report: unknown;
}): AdminDockerVersionParityPlanReport {
  const liveReport = asRecord(input.live_report);
  const target = asRecord(liveReport.target);
  const targetConfigured = asBoolean(target.configured) === true;
  const targetSafeToProbe = asBoolean(target.safe_to_probe) === true ||
    (target.configured === undefined && targetConfigured);
  const targetKind = asString(target.kind) || (targetConfigured ? "legacy-unclassified" : "not-configured");
  const observed = asRecord(liveReport.observed);
  const libraryStatus = dataFor(liveReport, "library_status");
  const dashboardMetrics = dataFor(liveReport, "dashboard_metrics");
  const runtimeLoad = asRecord(dashboardMetrics.runtime_load);
  const runtimeDisk = asRecord(runtimeLoad.disk);
  const missingCurrentEndpoints = currentApiMissingEndpoints(liveReport);
  const currentApiContractReady = missingCurrentEndpoints.length === 0;
  const versionParity = versionHealthParityReadiness(liveReport);
  const versionParityContractReady = versionHealthParityContractReady(liveReport);
  const workerEnvProof = adminWorkerEnvProofReadiness(liveReport);
  const workerEnvProofContractReady = adminWorkerEnvProofContractReady(liveReport);
  const cutterCompatibilityProof = cutterCompatibilityProofReadiness(liveReport);
  const cutterCompatibilityContractReady = cutterCompatibilityProofContractReady(liveReport);
  const adminApiProxyReachable =
    liveRequestOk(liveReport, "library_status") ||
    liveRequestOk(liveReport, "preprocess_supervisor_status") ||
    liveRequestOk(liveReport, "auth_status");
  const libraryRoot = asString(observed.library_root) || asString(libraryStatus.root_path);
  const expectedLibraryRoot = asString(target.expected_library_root) || "/data/PublicLibrary";
  const diskUsagePercent = asNumber(runtimeDisk.usage_percent);
  const diskStatus = asString(runtimeDisk.status);
  const dockerImageUpdateRequired = currentApiContractReady === false ||
    versionParityContractReady === false ||
    workerEnvProofContractReady === false ||
    cutterCompatibilityContractReady === false;
  const gates = [
    gate({
      id: "parity-plan-no-deploy",
      title: "Parity plan has no deploy side effects",
      category: "safety",
      status: "pass",
      evidence: "This report reads an archived live-readonly artifact only; it does not contact NAS Docker, build images, push images, restart containers, or write NAS files.",
      blocks_docker_upload: false
    }),
    gate({
      id: "live-artifact-targeted",
      title: "Live artifact was collected from an explicit target",
      category: "live-evidence",
      status: targetConfigured && targetSafeToProbe ? "pass" : "blocked",
      evidence: targetConfigured && targetSafeToProbe
        ? `Target artifact is explicit and probe-safe: ${asString(target.base_url) || "unknown target"} (${targetKind}).`
        : targetConfigured
          ? `The source live-readonly artifact used a target that is not safe admin-web evidence: ${asString(target.base_url) || "unknown target"} (${targetKind}).`
          : "The source live-readonly artifact did not use an explicit NAS Docker target.",
      blocks_docker_upload: !(targetConfigured && targetSafeToProbe),
      required_evidence: "Run MIXLAB_ADMIN_DOCKER_LIVE_BASE_URL=<target> npm run validate:admin-docker-release-live-readonly before parity planning."
    }),
    gate({
      id: "admin-web-root-observed",
      title: "Admin Web root observed",
      category: "live-evidence",
      status: liveRequestOk(liveReport, "admin_web_root") ? "pass" : "blocked",
      evidence: liveRequestDetail(liveReport, "admin_web_root"),
      blocks_docker_upload: !liveRequestOk(liveReport, "admin_web_root"),
      required_evidence: "Admin Web root must be reachable before comparing API/image parity."
    }),
    gate({
      id: "admin-api-proxy-observed",
      title: "Admin API proxy observed",
      category: "live-evidence",
      status: adminApiProxyReachable ? "pass" : "blocked",
      evidence: `auth=${liveRequestDetail(liveReport, "auth_status")}; library=${liveRequestDetail(liveReport, "library_status")}; supervisor=${liveRequestDetail(liveReport, "preprocess_supervisor_status")}`,
      blocks_docker_upload: !adminApiProxyReachable,
      required_evidence: "At least one Admin API JSON endpoint must respond through Admin Web before diagnosing image/API parity."
    }),
    gate({
      id: "current-admin-api-contract-parity",
      title: "Current Admin API contract parity",
      category: "api-contract",
      status: currentApiContractReady ? "pass" : "blocked",
      evidence: currentApiContractReady
        ? "Current Admin Architecture v1 endpoints responded in the source artifact."
        : `Missing current endpoints: ${missingCurrentEndpoints.join(", ")}.`,
      blocks_docker_upload: !currentApiContractReady,
      required_evidence: "Deploy or stage an Admin image exposing /api/admin/auth/status, /api/admin/release-gates, and /api/admin/data-loading/plan, then rerun the GET-only live-readonly probe."
    }),
    gate({
      id: "version-health-parity-contract",
      title: "Version/health parity contract",
      category: "api-contract",
      status: versionParityContractReady ? "pass" : "blocked",
      evidence: versionParityContractReady
        ? `version_health_parity status=${asString(versionParity.status)}, image_tag=${asString(versionParity.image_tag) || "unknown"}.`
        : "The archived live-readonly artifact does not include a complete version_health_parity contract.",
      blocks_docker_upload: !versionParityContractReady,
      required_evidence: "Deploy or stage an Admin image exposing version_health_parity from /api/admin/release-gates, then rerun the GET-only live-readonly probe."
    }),
    gate({
      id: "admin-worker-env-proof-contract",
      title: "admin-worker env proof contract",
      category: "docker-runtime",
      status: workerEnvProofContractReady ? "pass" : "blocked",
      evidence: workerEnvProofContractReady
        ? `admin_worker_env_proof status=${asString(workerEnvProof.status)}, scope=${asString(workerEnvProof.safe_scope)}.`
        : "The archived live-readonly artifact does not include a complete admin_worker_env_proof contract.",
      blocks_docker_upload: !workerEnvProofContractReady,
      required_evidence: "Deploy or stage an Admin image exposing admin_worker_env_proof from /api/admin/release-gates, then rerun the GET-only live-readonly probe."
    }),
    gate({
      id: "cutter-compatibility-proof-contract",
      title: "Cutter compatibility proof contract",
      category: "cutter-compatibility",
      status: cutterCompatibilityContractReady ? "pass" : "blocked",
      evidence: cutterCompatibilityContractReady
        ? `cutter_compatibility_proof status=${asString(cutterCompatibilityProof.status)}, expected_ready_count=${String(asNumber(cutterCompatibilityProof.expected_ready_count) ?? "unknown")}.`
        : "The archived live-readonly artifact does not include a complete cutter_compatibility_proof contract.",
      blocks_docker_upload: !cutterCompatibilityContractReady,
      required_evidence: "Deploy or stage an Admin image exposing cutter_compatibility_proof from /api/admin/release-gates, then rerun the GET-only live-readonly probe."
    }),
    gate({
      id: "docker-library-root-parity",
      title: "Docker library root parity",
      category: "docker-runtime",
      status: libraryRoot === expectedLibraryRoot ? "pass" : "blocked",
      evidence: `library_root=${libraryRoot || "unknown"}, expected=${expectedLibraryRoot}`,
      blocks_docker_upload: libraryRoot !== expectedLibraryRoot,
      required_evidence: "NAS Docker Admin must report /data/PublicLibrary before any release update is allowed."
    }),
    gate({
      id: "nas-disk-risk",
      title: "NAS disk risk remains gated",
      category: "nas-risk",
      status: diskStatus === "blocked" || (diskUsagePercent !== null && diskUsagePercent >= 92)
        ? "blocked"
        : "pass",
      evidence: diskUsagePercent === null
        ? `disk_status=${diskStatus || "unknown"}`
        : `disk_status=${diskStatus || "unknown"}, usage_percent=${diskUsagePercent}`,
      blocks_docker_upload: diskStatus === "blocked" || (diskUsagePercent !== null && diskUsagePercent >= 92),
      required_evidence: "Free space or prove write-block behavior with live release gates before enabling preprocessing in Docker."
    }),
    gate({
      id: "admin-worker-env-external-proof",
      title: "Running admin-worker environment proof",
      category: "docker-runtime",
      status: "needs-external-proof",
      evidence: "The live-readonly Admin API artifact cannot inspect the running admin-worker container environment.",
      blocks_docker_upload: true,
      required_evidence: "Capture target Docker .env and running admin-worker environment showing standalone workers remain disabled unless explicitly opted in."
    }),
    gate({
      id: "cutter-compatibility-external-proof",
      title: "Cutter compatibility proof after staged candidate",
      category: "cutter-compatibility",
      status: "needs-external-proof",
      evidence: "A Docker Admin parity plan cannot prove Windows Cutter still reads the release/index/search protocol.",
      blocks_docker_upload: true,
      required_evidence: "Run and archive Cutter compatibility smoke after a separately gated Docker release candidate is staged."
    })
  ];
  const summary = summarize(gates);
  const userAssistanceRequired = userAssistanceFor({
    dockerImageUpdateRequired,
    missingCurrentEndpoints
  });

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "docker-version-api-parity-plan",
    source_artifact: input.source_artifact,
    target: {
      base_url: asString(target.base_url),
      normalized_base_url: asString(target.normalized_base_url),
      configured: targetConfigured,
      kind: targetKind,
      safe_to_probe: targetSafeToProbe,
      expected_library_root: expectedLibraryRoot
    },
    observations: {
      admin_web_reachable: liveRequestOk(liveReport, "admin_web_root"),
      admin_api_proxy_reachable: adminApiProxyReachable,
      live_target_kind: targetKind,
      live_target_safe_to_probe: targetSafeToProbe,
      current_api_contract_ready: currentApiContractReady,
      missing_current_endpoints: missingCurrentEndpoints,
      version_health_parity_contract_ready: versionParityContractReady,
      version_health_parity_status: asString(versionParity.status),
      admin_worker_env_proof_contract_ready: workerEnvProofContractReady,
      admin_worker_env_proof_status: asString(workerEnvProof.status),
      cutter_compatibility_proof_contract_ready: cutterCompatibilityContractReady,
      cutter_compatibility_proof_status: asString(cutterCompatibilityProof.status),
      library_root: libraryRoot,
      current_index_version: asString(observed.current_index_version),
      video_count: asNumber(observed.video_count),
      ready_video_count: asNumber(observed.ready_video_count),
      disk_usage_percent: diskUsagePercent,
      disk_status: diskStatus,
      build_sha: asString(observed.build_sha),
      build_version: asString(observed.build_version),
      image_tag: asString(observed.image_tag)
    },
    decision: {
      docker_image_update_required: dockerImageUpdateRequired,
      docker_deploy_allowed_now: false,
      user_assistance_required: userAssistanceRequired,
      summary: !targetConfigured
        ? "The source artifact was not collected from an explicit NAS Docker target, so live Docker version/API parity is unproven. Deployment remains blocked until targeted live-readonly evidence and external proofs pass."
        : !targetSafeToProbe
          ? "The source artifact target is not classified as a probe-safe NAS Docker admin-web root, so live Docker version/API parity is unproven. Deployment remains blocked until a correctly targeted live-readonly artifact and external proofs pass."
        : dockerImageUpdateRequired
          ? "The targeted live-readonly artifact does not expose the full current Admin Architecture v1 API, version_health_parity contract, admin_worker_env_proof contract, and cutter_compatibility_proof contract, so an image/API parity update is required later. Deployment remains blocked until release gates and external proofs pass."
          : "The source artifact does not prove a required API-contract update, but deployment still remains blocked until all release and external proof gates pass."
    },
    gates,
    summary,
    result: {
      status: "blocked",
      summary: "This parity plan never approves Docker upload; it only identifies whether an image/API parity update is needed and what proof is missing."
    },
    artifacts: null
  };
}

function toMarkdown(report: AdminDockerVersionParityPlanReport): string {
  const lines = [
    "# Admin Docker Version/API Parity Plan",
    "",
    `Generated: ${report.generated_at}`,
    "",
    `Mode: ${report.mode}`,
    "",
    `Result: ${report.result.status}`,
    "",
    `Docker image/API update required: ${report.decision.docker_image_update_required ? "yes" : "no"}`,
    "",
    `Docker deploy allowed now: ${report.decision.docker_deploy_allowed_now ? "yes" : "no"}`,
    "",
    "This report reads an archived live-readonly artifact only. It does not deploy Docker, build images, push images, restart containers, enable workers, write NAS files, repair usage-events, recover jobs, publish indexes, or change Cutter protocols.",
    "",
    "## Source",
    "",
    `- Artifact: ${report.source_artifact}`,
    `- Target: ${report.target.configured ? report.target.base_url : "not configured"}`,
    `- Normalized target: ${report.target.normalized_base_url || "n/a"}`,
    `- Target kind: ${report.target.kind || "unknown"}`,
    `- Target safe to probe: ${report.target.safe_to_probe ? "yes" : "no"}`,
    `- Expected library root: ${report.target.expected_library_root}`,
    "",
    "## Observations",
    "",
    `- Admin Web reachable: ${report.observations.admin_web_reachable ? "yes" : "no"}`,
    `- Admin API proxy reachable: ${report.observations.admin_api_proxy_reachable ? "yes" : "no"}`,
    `- Live target: ${report.observations.live_target_kind || "unknown"}, safe=${report.observations.live_target_safe_to_probe ? "yes" : "no"}`,
    `- Current API contract ready: ${report.observations.current_api_contract_ready ? "yes" : "no"}`,
    `- Missing current endpoints: ${report.observations.missing_current_endpoints.length > 0 ? report.observations.missing_current_endpoints.join(", ") : "none"}`,
    `- Version/health parity contract: ${report.observations.version_health_parity_contract_ready ? "ready" : "missing"} (${report.observations.version_health_parity_status || "unknown"})`,
    `- admin-worker env proof contract: ${report.observations.admin_worker_env_proof_contract_ready ? "ready" : "missing"} (${report.observations.admin_worker_env_proof_status || "unknown"})`,
    `- Cutter compatibility proof contract: ${report.observations.cutter_compatibility_proof_contract_ready ? "ready" : "missing"} (${report.observations.cutter_compatibility_proof_status || "unknown"})`,
    `- Library root: ${report.observations.library_root || "unknown"}`,
    `- Current index: ${report.observations.current_index_version || "unknown"}`,
    `- Counts: total ${report.observations.video_count ?? "unknown"}, ready ${report.observations.ready_video_count ?? "unknown"}`,
    `- Disk: status ${report.observations.disk_status || "unknown"}, usage ${report.observations.disk_usage_percent ?? "unknown"}%`,
    `- Build: sha ${report.observations.build_sha || "unknown"}, version ${report.observations.build_version || "unknown"}, image tag ${report.observations.image_tag || "unknown"}`,
    "",
    "## Decision",
    "",
    report.decision.summary,
    "",
    "## User Assistance Required Later",
    "",
    ...report.decision.user_assistance_required.map((item) => `- ${item}`),
    "",
    "## Summary",
    "",
    `- Passed: ${report.summary.passed}`,
    `- Blocked: ${report.summary.blocked}`,
    `- Needs external proof: ${report.summary.needs_external_proof}`,
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

async function latestLiveReadonlyArtifact(artifactDir: string): Promise<string> {
  const files = await readdir(artifactDir);
  const candidates = files
    .filter((file) => file.startsWith(LIVE_REPORT_PREFIX) && file.endsWith(LIVE_REPORT_SUFFIX))
    .filter((file) => !file.includes("194617Z"))
    .sort();

  if (candidates.length === 0) {
    throw new Error(`No configured ${LIVE_REPORT_PREFIX}*.json artifact found in ${artifactDir}`);
  }

  return path.join(artifactDir, candidates[candidates.length - 1]);
}

async function loadJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function main(): Promise<void> {
  const outputDir = process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const artifactDir = process.env.MIXLAB_ACCEPTANCE_ARTIFACT_DIR ?? DEFAULT_ARTIFACT_DIR;
  const sourceArtifact = process.env.MIXLAB_ADMIN_DOCKER_PARITY_LIVE_REPORT
    ?? await latestLiveReadonlyArtifact(artifactDir);
  const timestamp = timestampForFile();
  const jsonPath = path.join(outputDir, `admin-docker-version-parity-plan-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-version-parity-plan-${timestamp}.md`);
  const report = buildAdminDockerVersionParityPlanReport({
    generated_at: new Date().toISOString(),
    command: process.argv.join(" "),
    source_artifact: sourceArtifact,
    live_report: await loadJson(sourceArtifact)
  });
  const reportWithArtifacts: AdminDockerVersionParityPlanReport = {
    ...report,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(reportWithArtifacts, null, 2)}\n`);
  await writeFile(markdownPath, toMarkdown(reportWithArtifacts));
  console.log(JSON.stringify(reportWithArtifacts, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
