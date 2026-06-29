import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  | "preprocess_safety"
  | "preprocess_supervisor_status"
  | "preprocess_jobs"
  | "source_videos_processing"
  | "source_videos_queued"
  | "source_videos_index_required"
  | "runtime_settings";
type GateStatus = "pass" | "blocked" | "fail" | "needs-follow-up";
type GateCategory =
  | "scope"
  | "target"
  | "auth"
  | "library"
  | "preprocess"
  | "runtime"
  | "worker"
  | "cutter"
  | "next-phase";

interface ApiEnvelope {
  ok?: unknown;
  data?: unknown;
  error_code?: unknown;
  message?: unknown;
}

export interface PreprocessReadinessProbeDefinition {
  name: ProbeName;
  method: HttpMethod;
  path: string;
  timeout_ms: number;
  json: boolean;
  protected: boolean;
  notes: string;
}

export interface PreprocessReadinessProbeResult {
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

export interface PreprocessReadinessGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_phase_0_1_readiness: boolean;
  blocks_single_video_smoke: boolean;
  required_evidence?: string;
}

export interface AdminPreprocessProductionReadinessReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-preprocess-production-readiness";
  phase: "phase-0-1-readiness";
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
  };
  phase_0_1_readiness_ready: boolean;
  single_video_smoke_review_ready: boolean;
  single_video_smoke_allowed: false;
  production_batch_allowed: false;
  preprocess_execution_allowed: false;
  worker_start_allowed: false;
  publish_allowed: false;
  docker_deploy_allowed: false;
  mutates_nas_files: false;
  observed: {
    authenticated: boolean | null;
    auth_mode: string;
    library_root: string;
    total_video_count: number | null;
    ready_video_count: number | null;
    queued_video_count: number | null;
    processing_video_count: number | null;
    index_required_video_count: number | null;
    current_index_version: string;
    release_overall_status: string;
    data_loading_strategy: string;
    hidden_full_scan_allowed: boolean | null;
    preprocess_safety_status: string;
    preprocess_safe_to_start: boolean | null;
    disk_usage_percent: number | null;
    disk_block_usage_percent: number | null;
    supervisor_state: string;
    preprocess_jobs_count: number | null;
    processing_probe_count: number | null;
    queued_probe_count: number | null;
    index_required_probe_count: number | null;
    ffmpeg_available: boolean | null;
    ffprobe_available: boolean | null;
    asr_key_configured: boolean | null;
    worker_env_proof_status: string;
    worker_image: string;
    windows_acceptance_status: string;
    cutter_visible_ready_count: number | null;
    cutter_release_version: string;
  };
  requests: PreprocessReadinessProbeResult[];
  external_reports: {
    worker_env_proof_report: string;
    cutter_windows_acceptance_report: string;
  };
  gates: PreprocessReadinessGate[];
  summary: {
    total: number;
    passed: number;
    blocked: number;
    failed: number;
    needs_follow_up: number;
    phase_0_1_blockers: string[];
    single_video_smoke_blockers: string[];
  };
  result: {
    status: "ready-for-single-video-review" | "blocked" | "failed";
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

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numberValue = asNumber(value);
    if (numberValue !== null) {
      return numberValue;
    }
  }
  return null;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const stringValue = asString(value);
    if (stringValue) {
      return stringValue;
    }
  }
  return "";
}

function getPath(root: unknown, parts: string[]): unknown {
  let current: unknown = root;
  for (const part of parts) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function parseExpectedReadyCount(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_EXPECTED_READY_COUNT;
}

function envelopeFromJson(value: unknown): ApiEnvelope {
  return isRecord(value) ? value : {};
}

function responseDataForJson(value: unknown): {
  data: unknown;
  api_ok: boolean | null;
  error_code?: string;
  message?: string;
} {
  const envelope = envelopeFromJson(value);
  if ("ok" in envelope || "data" in envelope || "error_code" in envelope) {
    return {
      data: envelope.data ?? null,
      api_ok: asBoolean(envelope.ok),
      error_code: typeof envelope.error_code === "string" ? envelope.error_code : undefined,
      message: typeof envelope.message === "string" ? envelope.message : undefined
    };
  }

  return {
    data: value,
    api_ok: null
  };
}

function countStatuses(items: unknown[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const row = asRecord(item);
    const status = asString(row.preprocess_status) || asString(row.status) || "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

function sanitizeSourceVideoPage(value: unknown): unknown {
  const rows = asArray(value);
  return {
    returned_count: rows.length,
    status_counts: countStatuses(rows),
    source_video_ids: rows
      .map((item) => asString(asRecord(item).source_video_id))
      .filter(Boolean)
      .slice(0, 10)
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
      disk_space_protection: data.disk_space_protection ?? null,
      processing_recovery: data.processing_recovery ?? null,
      admin_worker_env_proof: data.admin_worker_env_proof ?? null,
      cutter_compatibility_proof: data.cutter_compatibility_proof ?? null,
      gates: asArray(data.gates).map((item) => {
        const gate = asRecord(item);
        return {
          code: asString(gate.code),
          status: asString(gate.status),
          message: asString(gate.message)
        };
      })
    };
  }

  if (name === "data_loading_plan") {
    return {
      strategy: asString(data.strategy),
      hidden_full_scan_allowed: asBoolean(data.hidden_full_scan_allowed),
      endpoints: asArray(data.endpoints).map((item) => {
        const endpoint = asRecord(item);
        return {
          endpoint: asString(endpoint.endpoint),
          phase: asString(endpoint.phase),
          read_model: asString(endpoint.read_model),
          scan_reason: asString(endpoint.scan_reason)
        };
      })
    };
  }

  if (name === "preprocess_safety") {
    const disk = asRecord(data.disk);
    const processing = asRecord(data.processing);
    return {
      status: asString(data.status),
      safe_to_start: asBoolean(data.safe_to_start),
      disk: {
        status: asString(disk.status),
        usage_percent: asNumber(disk.usage_percent),
        block_usage_percent: asNumber(disk.block_usage_percent),
        available_bytes: asNumber(disk.available_bytes)
      },
      processing: {
        processing_count: asNumber(processing.processing_count),
        source_video_ids: asArray(processing.source_video_ids).slice(0, 10)
      },
      blockers: asArray(data.blockers).map((item) => {
        const blocker = asRecord(item);
        return {
          code: asString(blocker.code),
          message: asString(blocker.message)
        };
      })
    };
  }

  if (name === "preprocess_jobs") {
    const jobs = asArray(data.jobs);
    return {
      job_count: firstNumber(data.job_count, jobs.length),
      status_counts: countStatuses(jobs),
      supervisor: data.supervisor ?? null,
      runtime_load: data.runtime_load ?? null,
      meta: data.meta ?? null
    };
  }

  if (
    name === "source_videos_processing" ||
    name === "source_videos_queued" ||
    name === "source_videos_index_required"
  ) {
    return sanitizeSourceVideoPage(value);
  }

  if (name === "runtime_settings") {
    const ffmpeg = asRecord(data.ffmpeg);
    const ffprobe = asRecord(data.ffprobe);
    const asr = asRecord(data.asr);
    return {
      ffmpeg: {
        available: asBoolean(ffmpeg.available),
        source: asString(ffmpeg.source),
        version: asString(ffmpeg.version),
        last_error_present: Boolean(asString(ffmpeg.last_error))
      },
      ffprobe: {
        available: asBoolean(ffprobe.available),
        source: asString(ffprobe.source),
        version: asString(ffprobe.version),
        last_error_present: Boolean(asString(ffprobe.last_error))
      },
      asr: {
        provider: asString(asr.provider),
        audio_mode: asString(asr.audio_mode),
        dashscope_api_key_configured: asBoolean(asr.dashscope_api_key_configured),
        last_failure_reason_present: Boolean(asString(asr.last_failure_reason))
      }
    };
  }

  return value;
}

export function buildPreprocessReadinessProbeDefinitions(): PreprocessReadinessProbeDefinition[] {
  return [
    {
      name: "admin_web_root",
      method: "GET",
      path: "/",
      timeout_ms: 5_000,
      json: false,
      protected: false,
      notes: "Admin Web root reachable through the NAS Docker Admin URL."
    },
    {
      name: "health",
      method: "GET",
      path: "/health",
      timeout_ms: 5_000,
      json: true,
      protected: false,
      notes: "Admin API health and preprocess disk snapshot."
    },
    {
      name: "auth_status",
      method: "GET",
      path: "/api/admin/auth/status",
      timeout_ms: 5_000,
      json: true,
      protected: true,
      notes: "Authenticated Admin session visibility."
    },
    {
      name: "library_status",
      method: "GET",
      path: "/api/admin/library/status",
      timeout_ms: 8_000,
      json: true,
      protected: true,
      notes: "Public-library counts, current Cutter index, and queue counts."
    },
    {
      name: "release_gates",
      method: "GET",
      path: "/api/admin/release-gates",
      timeout_ms: 8_000,
      json: true,
      protected: true,
      notes: "Live release and safety gate contract."
    },
    {
      name: "data_loading_plan",
      method: "GET",
      path: "/api/admin/data-loading/plan",
      timeout_ms: 5_000,
      json: true,
      protected: true,
      notes: "Route-owned loading plan and hidden full-scan policy."
    },
    {
      name: "preprocess_safety",
      method: "GET",
      path: "/api/admin/preprocess/safety",
      timeout_ms: 8_000,
      json: true,
      protected: true,
      notes: "Preprocess disk and stuck-processing safety state."
    },
    {
      name: "preprocess_supervisor_status",
      method: "GET",
      path: "/api/admin/preprocess/supervisor/status",
      timeout_ms: 5_000,
      json: true,
      protected: true,
      notes: "Supervisor state without start/stop."
    },
    {
      name: "preprocess_jobs",
      method: "GET",
      path: "/api/admin/preprocess/jobs?limit=20",
      timeout_ms: 8_000,
      json: true,
      protected: true,
      notes: "Bounded preprocess jobs page."
    },
    {
      name: "source_videos_processing",
      method: "GET",
      path: "/api/admin/source-videos?status=processing&limit=20",
      timeout_ms: 8_000,
      json: true,
      protected: true,
      notes: "Processing list must be observable before any worker starts."
    },
    {
      name: "source_videos_queued",
      method: "GET",
      path: "/api/admin/source-videos?status=queued&limit=1",
      timeout_ms: 8_000,
      json: true,
      protected: true,
      notes: "Queued backlog must be observable for a later single-video smoke."
    },
    {
      name: "source_videos_index_required",
      method: "GET",
      path: "/api/admin/source-videos?status=index-required&limit=1",
      timeout_ms: 8_000,
      json: true,
      protected: true,
      notes: "Index-required backlog must be visible and not auto-published."
    },
    {
      name: "runtime_settings",
      method: "GET",
      path: "/api/admin/settings/runtime",
      timeout_ms: 8_000,
      json: true,
      protected: true,
      notes: "FFmpeg, FFprobe, and ASR runtime configuration visibility."
    }
  ];
}

function requestFor(
  requests: PreprocessReadinessProbeResult[],
  name: ProbeName
): PreprocessReadinessProbeResult | undefined {
  return requests.find((request) => request.name === name);
}

function dataFor(requests: PreprocessReadinessProbeResult[], name: ProbeName): unknown {
  return requestFor(requests, name)?.data ?? null;
}

function forbiddenPath(paths: string[]): string {
  return paths.find((item) => /\/(?:scan|apply|publish|repair|queue|retry|recover|start|stop|cancel)(?:\/|$|\?)/.test(item)) ?? "";
}

function gate(input: PreprocessReadinessGate): PreprocessReadinessGate {
  return input;
}

function summarize(gates: PreprocessReadinessGate[]): AdminPreprocessProductionReadinessReport["summary"] {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    failed: gates.filter((item) => item.status === "fail").length,
    needs_follow_up: gates.filter((item) => item.status === "needs-follow-up").length,
    phase_0_1_blockers: gates
      .filter((item) => item.blocks_phase_0_1_readiness && item.status !== "pass")
      .map((item) => item.id),
    single_video_smoke_blockers: gates
      .filter((item) => item.blocks_single_video_smoke && item.status !== "pass")
      .map((item) => item.id)
  };
}

function supervisorIdle(value: unknown): boolean | null {
  const record = asRecord(value);
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

function returnedCount(value: unknown): number | null {
  return firstNumber(asRecord(value).returned_count, asRecord(value).job_count);
}

function releaseGateStatus(releaseGates: unknown, code: string): string {
  return asString(
    asRecord(asArray(asRecord(releaseGates).gates).find((item) => asRecord(item).code === code)).status
  );
}

function extractWindowsAcceptanceBasics(report: unknown): {
  status: string;
  runner_version: string;
  available_video_count: number | null;
  release_version: string;
} {
  const root = asRecord(report);
  const appRuntime = asRecord(root.app_runtime_smoke);
  const cacheSmoke = asRecord(root.cache_smoke);
  const runtimeStatus = mergedRecord(
    findCheckBodyData(appRuntime, "runtime_status"),
    findCheckBodyData(cacheSmoke, "runtime_status"),
    appRuntime.runtime_status,
    cacheSmoke.runtime_status
  );

  return {
    status: asString(root.status),
    runner_version: asString(root.runner_version),
    available_video_count: firstNumber(
      runtimeStatus.available_video_count,
      getPath(runtimeStatus, ["release_cache", "ready_video_count"])
    ),
    release_version: firstString(
      getPath(runtimeStatus, ["release_cache", "active_release_version"]),
      getPath(runtimeStatus, ["release_cache", "source_release_version"]),
      getPath(runtimeStatus, ["search_backend", "index_version"])
    )
  };
}

function findCheckBodyData(report: Record<string, unknown>, checkId: string): unknown {
  for (const item of asArray(report.checks)) {
    const check = asRecord(item);
    if (check.id === checkId) {
      return getPath(check, ["body", "data"]);
    }
  }

  return undefined;
}

function mergedRecord(...values: unknown[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const value of values) {
    if (isRecord(value)) {
      Object.assign(merged, value);
    }
  }
  return merged;
}

function workerProofAccepted(report: unknown): boolean {
  return asBoolean(asRecord(report).proof_accepted) === true &&
    asString(asRecord(report).mode) === "admin-worker-env-proof";
}

export function buildAdminPreprocessProductionReadinessReport(input: {
  generated_at: string;
  command: string;
  base_url: string;
  expected_library_root: string;
  expected_ready_count: number;
  expected_index_version: string;
  session_token_present: boolean;
  requests: PreprocessReadinessProbeResult[];
  worker_env_proof_report_path?: string;
  worker_env_proof_report?: unknown;
  cutter_windows_acceptance_report_path?: string;
  cutter_windows_acceptance_report?: unknown;
}): AdminPreprocessProductionReadinessReport {
  const classification = classifyLiveReadonlyTarget(input.base_url);
  const definitions = buildPreprocessReadinessProbeDefinitions();
  const forbidden = forbiddenPath(definitions.map((definition) => definition.path));
  const requestOk = (name: ProbeName): boolean => requestFor(input.requests, name)?.ok === true;
  const targetStatus: GateStatus = classification.safe_to_probe
    ? "pass"
    : classification.kind === "not-configured"
      ? "blocked"
      : "fail";
  const missingRequestStatus = (passed: boolean): GateStatus => {
    if (passed) {
      return "pass";
    }
    return classification.safe_to_probe ? "blocked" : targetStatus;
  };

  const auth = asRecord(dataFor(input.requests, "auth_status"));
  const library = asRecord(dataFor(input.requests, "library_status"));
  const releaseGates = asRecord(dataFor(input.requests, "release_gates"));
  const dataLoading = asRecord(dataFor(input.requests, "data_loading_plan"));
  const safety = asRecord(dataFor(input.requests, "preprocess_safety"));
  const safetyDisk = asRecord(safety.disk);
  const supervisor = dataFor(input.requests, "preprocess_supervisor_status");
  const runtimeSettings = asRecord(dataFor(input.requests, "runtime_settings"));
  const ffmpeg = asRecord(runtimeSettings.ffmpeg);
  const ffprobe = asRecord(runtimeSettings.ffprobe);
  const asr = asRecord(runtimeSettings.asr);
  const processingPage = dataFor(input.requests, "source_videos_processing");
  const queuedPage = dataFor(input.requests, "source_videos_queued");
  const indexRequiredPage = dataFor(input.requests, "source_videos_index_required");
  const preprocessJobs = dataFor(input.requests, "preprocess_jobs");
  const workerReport = asRecord(input.worker_env_proof_report);
  const workerObservations = asRecord(workerReport.observations);
  const windowsBasics = extractWindowsAcceptanceBasics(input.cutter_windows_acceptance_report);

  const authenticated = asBoolean(auth.authenticated);
  const libraryRoot = asString(library.root_path) || asString(library.library_root);
  const readyCount = asNumber(library.ready_video_count);
  const totalCount = asNumber(library.video_count);
  const queuedCount = asNumber(library.queued_video_count);
  const processingCount = asNumber(library.processing_video_count);
  const indexRequiredCount = asNumber(library.index_required_video_count);
  const currentIndexVersion = asString(library.current_index_version);
  const hiddenFullScanAllowed = asBoolean(dataLoading.hidden_full_scan_allowed);
  const dataLoadingStrategy = asString(dataLoading.strategy);
  const safetyStatus = asString(safety.status);
  const safeToStart = asBoolean(safety.safe_to_start);
  const idle = supervisorIdle(supervisor);
  const workerAccepted = workerProofAccepted(input.worker_env_proof_report);
  const cutterBaselinePassed = windowsBasics.status === "passed" &&
    (windowsBasics.available_video_count ?? 0) >= input.expected_ready_count &&
    windowsBasics.release_version === input.expected_index_version;
  const runtimeReady = asBoolean(ffmpeg.available) === true &&
    asBoolean(ffprobe.available) === true &&
    asBoolean(asr.dashscope_api_key_configured) === true;
  const safetyHealthy = requestOk("preprocess_safety") &&
    safetyStatus === "healthy" &&
    safeToStart === true &&
    asString(safetyDisk.status) !== "blocked";
  const noProcessing = requestOk("source_videos_processing") &&
    (processingCount === 0 || processingCount === null) &&
    (returnedCount(processingPage) ?? 0) === 0;
  const libraryInvariantPass = requestOk("library_status") &&
    libraryRoot === input.expected_library_root &&
    readyCount === input.expected_ready_count &&
    currentIndexVersion === input.expected_index_version;
  const requiredRequestNames: ProbeName[] = [
    "admin_web_root",
    "health",
    "auth_status",
    "library_status",
    "release_gates",
    "data_loading_plan",
    "preprocess_safety",
    "preprocess_supervisor_status",
    "preprocess_jobs",
    "source_videos_processing",
    "source_videos_queued",
    "source_videos_index_required",
    "runtime_settings"
  ];
  const missingOrFailed = requiredRequestNames.filter((name) => !requestOk(name));

  const gates = [
    gate({
      id: "read-only-no-write-scope",
      title: "Readiness probe is read-only",
      category: "scope",
      status: definitions.every((item) => item.method === "GET") && !forbidden ? "pass" : "fail",
      evidence: forbidden
        ? `Forbidden command-like path is present: ${forbidden}`
        : "All probes are GET-only and exclude scan/apply/publish/repair/queue/retry/recover/start/stop/cancel paths.",
      blocks_phase_0_1_readiness: true,
      blocks_single_video_smoke: true
    }),
    gate({
      id: "nas-docker-admin-target",
      title: "Target URL is a NAS Docker Admin root",
      category: "target",
      status: targetStatus,
      evidence: classification.evidence,
      blocks_phase_0_1_readiness: true,
      blocks_single_video_smoke: true,
      required_evidence: targetStatus === "pass"
        ? undefined
        : "Set MIXLAB_ADMIN_PREPROCESS_READINESS_BASE_URL to the NAS Docker Admin root, not localhost or NAS desktop."
    }),
    gate({
      id: "required-read-endpoints",
      title: "All required read endpoints respond",
      category: "target",
      status: missingRequestStatus(missingOrFailed.length === 0),
      evidence: missingOrFailed.length === 0
        ? "All required Phase 0/1 read endpoints responded successfully."
        : `Missing or failed probes: ${missingOrFailed.join(", ")}.`,
      blocks_phase_0_1_readiness: true,
      blocks_single_video_smoke: true
    }),
    gate({
      id: "admin-session-authenticated",
      title: "Admin session is authenticated",
      category: "auth",
      status: authenticated === true ? "pass" : input.session_token_present ? "blocked" : "blocked",
      evidence: authenticated === true
        ? "auth/status returned authenticated=true."
        : input.session_token_present
          ? "A session token was provided, but auth/status did not prove authenticated=true."
          : "No session token was provided for protected Admin endpoints.",
      blocks_phase_0_1_readiness: true,
      blocks_single_video_smoke: true,
      required_evidence: authenticated === true ? undefined : "Provide a temporary Admin session token through the environment only."
    }),
    gate({
      id: "ready-index-baseline-preserved",
      title: "Ready assets and current Cutter index baseline are preserved",
      category: "library",
      status: libraryInvariantPass ? "pass" : requestOk("library_status") ? "fail" : missingRequestStatus(false),
      evidence: `root=${libraryRoot || "unknown"}, ready=${String(readyCount)}, index=${currentIndexVersion || "unknown"}.`,
      blocks_phase_0_1_readiness: true,
      blocks_single_video_smoke: true,
      required_evidence: libraryInvariantPass
        ? undefined
        : `Expected root=${input.expected_library_root}, ready=${input.expected_ready_count}, index=${input.expected_index_version}.`
    }),
    gate({
      id: "queue-and-index-required-visible",
      title: "Queued and index-required backlog are visible without writes",
      category: "library",
      status: requestOk("source_videos_queued") && requestOk("source_videos_index_required") &&
        (queuedCount ?? 0) > 0
        ? "pass"
        : missingRequestStatus(false),
      evidence: `library queued=${String(queuedCount)}, index_required=${String(indexRequiredCount)}, queued_probe=${String(returnedCount(queuedPage))}, index_required_probe=${String(returnedCount(indexRequiredPage))}.`,
      blocks_phase_0_1_readiness: true,
      blocks_single_video_smoke: true,
      required_evidence: "The Admin API must expose at least one queued item for the next single-video smoke and must expose index-required items without auto-publish."
    }),
    gate({
      id: "no-active-processing-before-smoke",
      title: "No active processing job is present before smoke",
      category: "preprocess",
      status: noProcessing ? "pass" : requestOk("source_videos_processing") ? "blocked" : missingRequestStatus(false),
      evidence: `library processing=${String(processingCount)}, processing_probe=${String(returnedCount(processingPage))}.`,
      blocks_phase_0_1_readiness: true,
      blocks_single_video_smoke: true,
      required_evidence: noProcessing ? undefined : "Recover or isolate active processing tasks before starting any new controlled smoke."
    }),
    gate({
      id: "preprocess-disk-safety-healthy",
      title: "Preprocess disk and safety gate are healthy",
      category: "preprocess",
      status: safetyHealthy ? "pass" : requestOk("preprocess_safety") ? "blocked" : missingRequestStatus(false),
      evidence: `status=${safetyStatus || "unknown"}, safe_to_start=${String(safeToStart)}, disk=${asString(safetyDisk.status) || "unknown"}, usage=${String(asNumber(safetyDisk.usage_percent))}%, block=${String(asNumber(safetyDisk.block_usage_percent))}%.`,
      blocks_phase_0_1_readiness: true,
      blocks_single_video_smoke: true,
      required_evidence: "preprocess/safety must report healthy, safe_to_start=true, and disk not blocked."
    }),
    gate({
      id: "preprocess-supervisor-idle",
      title: "Preprocess supervisor is idle",
      category: "preprocess",
      status: idle === true ? "pass" : requestOk("preprocess_supervisor_status") ? "blocked" : missingRequestStatus(false),
      evidence: `supervisor_idle=${String(idle)}, state=${asString(asRecord(supervisor).state) || "unknown"}.`,
      blocks_phase_0_1_readiness: true,
      blocks_single_video_smoke: true,
      required_evidence: "Supervisor must be idle before single-video smoke setup."
    }),
    gate({
      id: "bounded-preprocess-jobs-readable",
      title: "Bounded preprocess jobs page is readable",
      category: "preprocess",
      status: requestOk("preprocess_jobs") ? "pass" : missingRequestStatus(false),
      evidence: `jobs=${String(returnedCount(preprocessJobs))}.`,
      blocks_phase_0_1_readiness: true,
      blocks_single_video_smoke: true,
      required_evidence: "GET /api/admin/preprocess/jobs?limit=20 must succeed before monitoring any smoke."
    }),
    gate({
      id: "data-loading-no-hidden-full-scan",
      title: "Admin loading plan avoids hidden page-time full scans",
      category: "preprocess",
      status: requestOk("data_loading_plan") &&
        (hiddenFullScanAllowed === false || dataLoadingStrategy === "shell-first-route-owned-v1")
        ? "pass"
        : missingRequestStatus(false),
      evidence: `strategy=${dataLoadingStrategy || "unknown"}, hidden_full_scan_allowed=${String(hiddenFullScanAllowed)}.`,
      blocks_phase_0_1_readiness: true,
      blocks_single_video_smoke: true,
      required_evidence: "Data loading plan must keep scan-heavy reads route-owned/read-model backed before production preprocessing."
    }),
    gate({
      id: "ffmpeg-ffprobe-asr-visible",
      title: "FFmpeg, FFprobe, and ASR runtime readiness are visible",
      category: "runtime",
      status: runtimeReady ? "pass" : requestOk("runtime_settings") ? "blocked" : missingRequestStatus(false),
      evidence: `ffmpeg=${String(asBoolean(ffmpeg.available))}, ffprobe=${String(asBoolean(ffprobe.available))}, asr_key=${String(asBoolean(asr.dashscope_api_key_configured))}.`,
      blocks_phase_0_1_readiness: true,
      blocks_single_video_smoke: true,
      required_evidence: "settings/runtime must show ffmpeg=true, ffprobe=true, and DashScope ASR key configured before a real preprocess smoke."
    }),
    gate({
      id: "worker-env-proof-accepted",
      title: "admin-worker runtime proof is accepted",
      category: "worker",
      status: workerAccepted ? "pass" : "blocked",
      evidence: workerAccepted
        ? `proof_accepted=true, image=${asString(workerObservations.image) || "unknown"}`
        : input.worker_env_proof_report_path || "No admin-worker env proof report provided.",
      blocks_phase_0_1_readiness: true,
      blocks_single_video_smoke: true,
      required_evidence: "Provide MIXLAB_ADMIN_WORKER_ENV_PROOF_REPORT from validate:admin-worker-env-proof showing worker flags and /data/PublicLibrary roots."
    }),
    gate({
      id: "windows-cutter-baseline-preserved",
      title: "Windows Cutter baseline still sees the current ready release",
      category: "cutter",
      status: cutterBaselinePassed ? "pass" : "blocked",
      evidence: `status=${windowsBasics.status || "unknown"}, visible_ready=${String(windowsBasics.available_video_count)}, release=${windowsBasics.release_version || "unknown"}, runner=${windowsBasics.runner_version || "unknown"}.`,
      blocks_phase_0_1_readiness: true,
      blocks_single_video_smoke: true,
      required_evidence: "Provide MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT with status=passed, ready count >= baseline, and release/index v010471."
    }),
    gate({
      id: "pre-smoke-snapshot-required",
      title: "Create an explicit pre-smoke snapshot before any write",
      category: "next-phase",
      status: "needs-follow-up",
      evidence: "This Phase 0/1 readiness report is no-write and does not create NAS snapshots.",
      blocks_phase_0_1_readiness: false,
      blocks_single_video_smoke: true,
      required_evidence: "Before Phase 2, create a reviewed snapshot/rollback point for the selected queued source video and affected manifests/read-model entries."
    }),
    gate({
      id: "single-video-smoke-runbook-required",
      title: "Single-video smoke must be run by a separate explicit command",
      category: "next-phase",
      status: "needs-follow-up",
      evidence: "This report does not start workers, queue/retry/recover/publish videos, or run a real preprocess job.",
      blocks_phase_0_1_readiness: false,
      blocks_single_video_smoke: true,
      required_evidence: "Run the future controlled single-video smoke with explicit candidate id, timeout, concurrency=1, no publish, and post-smoke Cutter compatibility check."
    })
  ];
  const summary = summarize(gates);
  const ready = summary.phase_0_1_blockers.length === 0;
  const resultStatus = summary.failed > 0 ? "failed" : ready ? "ready-for-single-video-review" : "blocked";

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-preprocess-production-readiness",
    phase: "phase-0-1-readiness",
    target: {
      base_url: input.base_url,
      normalized_base_url: classification.normalized_base_url,
      safe_to_probe: classification.safe_to_probe,
      classification: classification.evidence,
      notes: classification.notes,
      session_token_present: input.session_token_present,
      expected_library_root: input.expected_library_root,
      expected_ready_count: input.expected_ready_count,
      expected_index_version: input.expected_index_version
    },
    phase_0_1_readiness_ready: ready,
    single_video_smoke_review_ready: ready,
    single_video_smoke_allowed: false,
    production_batch_allowed: false,
    preprocess_execution_allowed: false,
    worker_start_allowed: false,
    publish_allowed: false,
    docker_deploy_allowed: false,
    mutates_nas_files: false,
    observed: {
      authenticated,
      auth_mode: asString(auth.auth_mode),
      library_root: libraryRoot,
      total_video_count: totalCount,
      ready_video_count: readyCount,
      queued_video_count: queuedCount,
      processing_video_count: processingCount,
      index_required_video_count: indexRequiredCount,
      current_index_version: currentIndexVersion,
      release_overall_status: asString(releaseGates.overall_status),
      data_loading_strategy: dataLoadingStrategy,
      hidden_full_scan_allowed: hiddenFullScanAllowed,
      preprocess_safety_status: safetyStatus,
      preprocess_safe_to_start: safeToStart,
      disk_usage_percent: asNumber(safetyDisk.usage_percent),
      disk_block_usage_percent: asNumber(safetyDisk.block_usage_percent),
      supervisor_state: asString(asRecord(supervisor).state),
      preprocess_jobs_count: returnedCount(preprocessJobs),
      processing_probe_count: returnedCount(processingPage),
      queued_probe_count: returnedCount(queuedPage),
      index_required_probe_count: returnedCount(indexRequiredPage),
      ffmpeg_available: asBoolean(ffmpeg.available),
      ffprobe_available: asBoolean(ffprobe.available),
      asr_key_configured: asBoolean(asr.dashscope_api_key_configured),
      worker_env_proof_status: asString(workerReport.result && asRecord(workerReport.result).status),
      worker_image: asString(workerObservations.image),
      windows_acceptance_status: windowsBasics.status,
      cutter_visible_ready_count: windowsBasics.available_video_count,
      cutter_release_version: windowsBasics.release_version
    },
    requests: input.requests,
    external_reports: {
      worker_env_proof_report: input.worker_env_proof_report_path ?? "",
      cutter_windows_acceptance_report: input.cutter_windows_acceptance_report_path ?? ""
    },
    gates,
    summary,
    result: {
      status: resultStatus,
      summary: resultStatus === "ready-for-single-video-review"
        ? "Phase 0/1 readiness is green for planning a separate controlled single-video preprocess smoke. This report still does not allow writes."
        : resultStatus === "failed"
          ? "Phase 0/1 readiness failed because a safety invariant or target boundary was violated."
          : "Phase 0/1 readiness is blocked until the listed evidence and safety gates pass."
    },
    artifacts: null
  };
}

async function requestProbe(input: {
  base_url: string;
  definition: PreprocessReadinessProbeDefinition;
  session_token?: string;
  fetch_impl?: typeof fetch;
}): Promise<PreprocessReadinessProbeResult> {
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
}): Promise<PreprocessReadinessProbeResult[]> {
  if (!input.base_url) {
    return [];
  }

  const baseUrl = trimTrailingSlash(input.base_url);
  const results: PreprocessReadinessProbeResult[] = [];
  for (const definition of buildPreprocessReadinessProbeDefinitions()) {
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

function renderRequestRows(requests: PreprocessReadinessProbeResult[]): string {
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

function renderGateRows(gates: PreprocessReadinessGate[]): string {
  return gates.map((item) => [
    item.id,
    item.category,
    item.status,
    item.blocks_phase_0_1_readiness ? "yes" : "no",
    item.blocks_single_video_smoke ? "yes" : "no",
    item.evidence,
    item.required_evidence ?? "n/a"
  ].map((cell) => escapeMarkdownCell(cell)).join(" | ")).join("\n");
}

export function renderMarkdown(report: AdminPreprocessProductionReadinessReport): string {
  return `# Admin Preprocess Production Readiness

Generated: ${report.generated_at}

Mode: ${report.mode}

Phase: ${report.phase}

Result: ${report.result.status}

Phase 0/1 readiness ready: ${report.phase_0_1_readiness_ready ? "yes" : "no"}

Single-video smoke review ready: ${report.single_video_smoke_review_ready ? "yes" : "no"}

Single-video smoke allowed by this report: ${report.single_video_smoke_allowed ? "yes" : "no"}

Production batch allowed: ${report.production_batch_allowed ? "yes" : "no"}

Preprocess execution allowed: ${report.preprocess_execution_allowed ? "yes" : "no"}

Worker start allowed: ${report.worker_start_allowed ? "yes" : "no"}

Publish allowed: ${report.publish_allowed ? "yes" : "no"}

NAS file mutation: ${report.mutates_nas_files ? "yes" : "no"}

This readiness probe sends only GET requests to Admin endpoints and reads optional archived proof reports. It does not start workers, process videos, recover/queue/retry/publish items, change Docker, mutate NAS files, or change Cutter protocols. Session-token values are not written to this report.

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

## Observed

- Auth: mode=${report.observed.auth_mode || "unknown"}, authenticated=${String(report.observed.authenticated)}
- Library: root=${report.observed.library_root || "unknown"}, total=${String(report.observed.total_video_count)}, ready=${String(report.observed.ready_video_count)}, queued=${String(report.observed.queued_video_count)}, processing=${String(report.observed.processing_video_count)}, index_required=${String(report.observed.index_required_video_count)}, current_index=${report.observed.current_index_version || "unknown"}
- Release gates: ${report.observed.release_overall_status || "unknown"}
- Data loading: strategy=${report.observed.data_loading_strategy || "unknown"}, hidden_full_scan_allowed=${String(report.observed.hidden_full_scan_allowed)}
- Preprocess safety: status=${report.observed.preprocess_safety_status || "unknown"}, safe_to_start=${String(report.observed.preprocess_safe_to_start)}, disk=${String(report.observed.disk_usage_percent)}%/${String(report.observed.disk_block_usage_percent)}%
- Supervisor: ${report.observed.supervisor_state || "unknown"}
- Bounded probes: jobs=${String(report.observed.preprocess_jobs_count)}, processing=${String(report.observed.processing_probe_count)}, queued=${String(report.observed.queued_probe_count)}, index_required=${String(report.observed.index_required_probe_count)}
- Runtime: ffmpeg=${String(report.observed.ffmpeg_available)}, ffprobe=${String(report.observed.ffprobe_available)}, asr_key=${String(report.observed.asr_key_configured)}
- Worker proof: status=${report.observed.worker_env_proof_status || "unknown"}, image=${report.observed.worker_image || "unknown"}
- Cutter baseline: status=${report.observed.windows_acceptance_status || "unknown"}, visible_ready=${String(report.observed.cutter_visible_ready_count)}, release=${report.observed.cutter_release_version || "unknown"}

## External Reports

- Worker env proof: ${report.external_reports.worker_env_proof_report || "not provided"}
- Windows Cutter acceptance: ${report.external_reports.cutter_windows_acceptance_report || "not provided"}

## Summary

- Passed: ${report.summary.passed}
- Blocked: ${report.summary.blocked}
- Failed: ${report.summary.failed}
- Needs follow-up: ${report.summary.needs_follow_up}
- Phase 0/1 blockers: ${report.summary.phase_0_1_blockers.join(", ") || "none"}
- Single-video smoke blockers: ${report.summary.single_video_smoke_blockers.join(", ") || "none"}

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
${renderRequestRows(report.requests)}

## Gates

| Gate | Category | Status | Blocks Phase 0/1 | Blocks Single-video Smoke | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
${renderGateRows(report.gates)}

## Artifacts

- JSON: ${report.artifacts?.json_path ?? "not written"}
- Markdown: ${report.artifacts?.markdown_path ?? "not written"}
`;
}

async function loadOptionalJson(filePath?: string): Promise<unknown> {
  if (!filePath) {
    return undefined;
  }

  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Failed to read JSON report at ${filePath}: ${errorMessage(error)}`);
  }
}

export async function writePreprocessProductionReadinessArtifacts(input: {
  report: AdminPreprocessProductionReadinessReport;
  output_dir?: string;
  date?: Date;
}): Promise<AdminPreprocessProductionReadinessReport> {
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  await mkdir(outputDir, { recursive: true });

  const stamp = timestampForFile(input.date);
  const jsonPath = path.join(outputDir, `admin-preprocess-production-readiness-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-preprocess-production-readiness-${stamp}.md`);
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

export async function runAdminPreprocessProductionReadiness(input: {
  base_url?: string;
  expected_library_root?: string;
  expected_ready_count?: number;
  expected_index_version?: string;
  session_token?: string;
  worker_env_proof_report_path?: string;
  cutter_windows_acceptance_report_path?: string;
  output_dir?: string;
  command?: string;
  date?: Date;
  fetch_impl?: typeof fetch;
} = {}): Promise<AdminPreprocessProductionReadinessReport> {
  const baseUrl = trimTrailingSlash(optionalTrimmed(input.base_url));
  const sessionToken = optionalTrimmed(input.session_token);
  const classification = classifyLiveReadonlyTarget(baseUrl);
  const requests = await runProbes({
    base_url: classification.safe_to_probe ? classification.normalized_base_url : "",
    session_token: sessionToken || undefined,
    fetch_impl: input.fetch_impl
  });
  const report = buildAdminPreprocessProductionReadinessReport({
    generated_at: (input.date ?? new Date()).toISOString(),
    command: input.command ?? "npx tsx scripts/acceptance/admin-preprocess-production-readiness.ts",
    base_url: baseUrl,
    expected_library_root: optionalTrimmed(input.expected_library_root) || DEFAULT_EXPECTED_LIBRARY_ROOT,
    expected_ready_count: input.expected_ready_count ?? DEFAULT_EXPECTED_READY_COUNT,
    expected_index_version: optionalTrimmed(input.expected_index_version) || DEFAULT_EXPECTED_INDEX_VERSION,
    session_token_present: Boolean(sessionToken),
    requests,
    worker_env_proof_report_path: input.worker_env_proof_report_path,
    worker_env_proof_report: await loadOptionalJson(input.worker_env_proof_report_path),
    cutter_windows_acceptance_report_path: input.cutter_windows_acceptance_report_path,
    cutter_windows_acceptance_report: await loadOptionalJson(input.cutter_windows_acceptance_report_path)
  });

  return writePreprocessProductionReadinessArtifacts({
    report,
    output_dir: input.output_dir,
    date: input.date
  });
}

async function main(): Promise<void> {
  const report = await runAdminPreprocessProductionReadiness({
    base_url: process.env.MIXLAB_ADMIN_PREPROCESS_READINESS_BASE_URL,
    expected_library_root: process.env.MIXLAB_ADMIN_PREPROCESS_READINESS_EXPECT_LIBRARY_ROOT,
    expected_ready_count: parseExpectedReadyCount(process.env.MIXLAB_ADMIN_PREPROCESS_READINESS_EXPECT_READY_COUNT),
    expected_index_version: process.env.MIXLAB_ADMIN_PREPROCESS_READINESS_EXPECT_INDEX_VERSION,
    session_token: process.env.MIXLAB_ADMIN_PREPROCESS_READINESS_SESSION_TOKEN,
    worker_env_proof_report_path: process.env.MIXLAB_ADMIN_WORKER_ENV_PROOF_REPORT,
    cutter_windows_acceptance_report_path: process.env.MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT,
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    phase_0_1_readiness_ready: report.phase_0_1_readiness_ready,
    single_video_smoke_review_ready: report.single_video_smoke_review_ready,
    single_video_smoke_allowed: report.single_video_smoke_allowed,
    production_batch_allowed: report.production_batch_allowed,
    preprocess_execution_allowed: report.preprocess_execution_allowed,
    worker_start_allowed: report.worker_start_allowed,
    phase_0_1_blockers: report.summary.phase_0_1_blockers,
    single_video_smoke_blockers: report.summary.single_video_smoke_blockers,
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
