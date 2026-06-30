import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { classifyLiveReadonlyTarget } from "./admin-docker-release-live-readonly.ts";
import {
  checkSingleVideoSmokePostFiles,
  type SingleVideoSmokePostFileCheck
} from "./admin-preprocess-single-video-smoke.ts";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_EXPECTED_LIBRARY_ROOT = "/data/PublicLibrary";
const DEFAULT_EXPECTED_READY_COUNT = 10471;
const DEFAULT_EXPECTED_INDEX_VERSION = "v010471";

type HttpMethod = "GET";
type ProofStatus = "passed" | "passed-with-follow-up" | "blocked" | "failed";
type GateStatus = "pass" | "fail" | "blocked" | "needs-follow-up" | "not-provided";
type GateCategory = "scope" | "target" | "api" | "smb" | "windows-cutter";
type PostBatchProofPhase = "pre-publish" | "post-publish";

interface ApiEnvelope {
  ok?: unknown;
  data?: unknown;
  error_code?: unknown;
  message?: unknown;
}

export interface PostBatchProofRequestResult {
  name: string;
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

export interface PostBatchSourceItem {
  source_video_id: string;
  api_request_ok: boolean;
  api_preprocess_status: string;
  api_visible_to_cutters: boolean | null;
  api_index_version: string;
  api_artifact_complete: boolean | null;
  api_passed: boolean;
  smb_status: "not-configured" | "clean" | "stale-follow-up" | "blocked" | "mismatch";
  smb_source_status: string;
  smb_source_visible: boolean | null;
  smb_job_status: string;
  smb_contains_nul: boolean | null;
  smb_error: string;
}

export interface PostBatchProofGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_next_small_batch: boolean;
  blocks_scale_up: boolean;
  required_evidence?: string;
}

interface WindowsAcceptanceObservation {
  report_path: string;
  provided: boolean;
  status: string;
  runner_version: string;
  available_video_count: number | null;
  release_version: string;
  search_index_version: string;
}

interface RealCutObservation {
  report_path: string;
  provided: boolean;
  status: string;
  runner_version: string;
  selected_source_video_id: string;
  query: string;
  run_next_status: string;
  output_file: string;
  resolve_source_done: boolean;
  cut_media_done: boolean;
}

interface PostBatchProofSummary {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  needs_follow_up: number;
  not_provided: number;
  next_small_batch_blockers: string[];
  scale_up_blockers: string[];
}

export interface AdminPreprocessPostBatchProofReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-preprocess-post-batch-proof";
  status: ProofStatus;
  mutates_nas_files: false;
  next_small_batch_allowed: boolean;
  scale_up_allowed: boolean;
  target: {
    base_url: string;
    normalized_base_url: string;
    safe_to_probe: boolean;
    classification: string;
    proof_phase: PostBatchProofPhase;
    session_token_present: boolean;
    source_video_ids: string[];
    expected_library_root: string;
    expected_ready_count: number;
    expected_index_version: string;
    expected_queued_count: number | null;
    expected_index_required_count: number | null;
    library_mount_root: string;
    windows_acceptance_report_path: string;
    real_cut_report_path: string;
  };
  observed: {
    library_root: string;
    ready_video_count: number | null;
    queued_video_count: number | null;
    processing_video_count: number | null;
    index_required_video_count: number | null;
    current_index_version: string;
    supervisor_state: string;
    processing_list_count: number | null;
    windows_acceptance: WindowsAcceptanceObservation;
    real_cut: RealCutObservation;
  };
  requests: PostBatchProofRequestResult[];
  source_items: PostBatchSourceItem[];
  smb_checks: SingleVideoSmokePostFileCheck[];
  gates: PostBatchProofGate[];
  summary: PostBatchProofSummary;
  result: {
    status: ProofStatus;
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

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalInteger(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseProofPhase(value: string | undefined): PostBatchProofPhase {
  return value === "post-publish" ? "post-publish" : "pre-publish";
}

function parseSourceVideoIds(value: string | undefined): string[] {
  return [...new Set((value ?? "")
    .split(/[,\s]+/u)
    .map((item) => item.trim())
    .filter(Boolean))];
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

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

function firstBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    const booleanValue = asBoolean(value);
    if (booleanValue !== null) {
      return booleanValue;
    }
  }
  return null;
}

function envelopeFromJson(value: unknown): ApiEnvelope {
  return isRecord(value) ? value : {};
}

function dataFromJson(value: unknown): {
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

function sanitizeAuthStatus(value: unknown): unknown {
  const data = asRecord(value);
  return {
    auth_mode: asString(data.auth_mode),
    authenticated: asBoolean(data.authenticated),
    user_present: isRecord(data.user)
  };
}

function sanitizeLibraryStatus(value: unknown): unknown {
  const data = asRecord(value);
  return {
    root_path: firstString(data.root_path, data.library_root),
    video_count: asNumber(data.video_count),
    ready_video_count: asNumber(data.ready_video_count),
    queued_video_count: asNumber(data.queued_video_count),
    processing_video_count: asNumber(data.processing_video_count),
    index_required_video_count: asNumber(data.index_required_video_count),
    current_index_version: asString(data.current_index_version),
    updated_at: asString(data.updated_at)
  };
}

function sanitizeSupervisor(value: unknown): unknown {
  const data = asRecord(value);
  const lastResult = asRecord(data.last_result);
  return {
    state: asString(data.state),
    running: asBoolean(data.running),
    worker_id: asString(data.worker_id),
    last_error_present: Boolean(asString(data.last_error)),
    last_result: Object.keys(lastResult).length === 0
      ? null
      : {
          total_claimed_count: asNumber(lastResult.total_claimed_count),
          succeeded_count: asNumber(lastResult.succeeded_count),
          failed_count: asNumber(lastResult.failed_count)
        }
  };
}

function sanitizeSourceDetail(value: unknown): unknown {
  const data = asRecord(value);
  const sourceVideo = asRecord(data.source_video);
  const preprocess = asRecord(data.preprocess);
  const artifacts = asRecord(data.artifacts);

  return {
    source_video: {
      source_video_id: firstString(sourceVideo.source_video_id, data.source_video_id),
      preprocess_status: firstString(sourceVideo.preprocess_status, data.preprocess_status),
      visible_to_cutters: firstBoolean(sourceVideo.visible_to_cutters, data.visible_to_cutters),
      relative_path: firstString(sourceVideo.relative_path, data.relative_path)
    },
    preprocess: {
      status: firstString(preprocess.status, data.status),
      job_id: asString(preprocess.job_id),
      current_stage: firstString(preprocess.current_stage, preprocess.stage)
    },
    artifacts: {
      index_version: asString(artifacts.index_version),
      artifact_complete: firstBoolean(artifacts.artifact_complete, data.artifact_complete)
    }
  };
}

function sanitizeSourceList(value: unknown): unknown {
  const rows = asArray(value);
  return {
    returned_count: rows.length,
    source_video_ids: rows
      .map((row) => asString(asRecord(row).source_video_id))
      .filter(Boolean)
      .slice(0, 20)
  };
}

function sanitizeData(name: string, value: unknown): unknown {
  if (name === "auth_status") {
    return sanitizeAuthStatus(value);
  }
  if (name === "library_status") {
    return sanitizeLibraryStatus(value);
  }
  if (name === "supervisor_status") {
    return sanitizeSupervisor(value);
  }
  if (name.startsWith("source_video:")) {
    return sanitizeSourceDetail(value);
  }
  if (name === "source_videos_processing") {
    return sanitizeSourceList(value);
  }
  return value;
}

async function requestJson(input: {
  base_url: string;
  name: string;
  method: HttpMethod;
  path: string;
  session_token?: string;
  timeout_ms?: number;
  fetch_impl?: typeof fetch;
}): Promise<PostBatchProofRequestResult> {
  const timeoutMs = input.timeout_ms ?? 8000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  const headers: Record<string, string> = {
    accept: "application/json"
  };

  if (input.session_token) {
    headers["X-MixLab-Admin-Session-Token"] = input.session_token;
  }

  try {
    const fetchImpl = input.fetch_impl ?? fetch;
    const response = await fetchImpl(`${input.base_url}${input.path}`, {
      method: input.method,
      headers,
      signal: controller.signal
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    const envelope = dataFromJson(parsed);

    return {
      name: input.name,
      method: input.method,
      path: input.path,
      duration_ms: roundMs(performance.now() - started),
      http_status: response.status,
      ok: response.ok && envelope.api_ok !== false && isRecord(parsed),
      api_ok: envelope.api_ok,
      response_bytes: Buffer.byteLength(text, "utf8"),
      content_type: response.headers.get("content-type") ?? "",
      data: sanitizeData(input.name, envelope.data),
      error_code: envelope.error_code,
      message: envelope.message
    };
  } catch (error) {
    return {
      name: input.name,
      method: input.method,
      path: input.path,
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

function requestData(requests: PostBatchProofRequestResult[], name: string): unknown {
  return [...requests].reverse().find((request) => request.name === name)?.data ?? null;
}

function requestOk(requests: PostBatchProofRequestResult[], name: string): boolean {
  return [...requests].reverse().find((request) => request.name === name)?.ok === true;
}

function libraryRoot(data: unknown): string {
  const record = asRecord(data);
  return firstString(record.root_path, record.library_root);
}

function readyCount(data: unknown): number | null {
  return asNumber(asRecord(data).ready_video_count);
}

function queuedCount(data: unknown): number | null {
  return asNumber(asRecord(data).queued_video_count);
}

function processingCount(data: unknown): number | null {
  return asNumber(asRecord(data).processing_video_count);
}

function indexRequiredCount(data: unknown): number | null {
  return asNumber(asRecord(data).index_required_video_count);
}

function currentIndexVersion(data: unknown): string {
  return asString(asRecord(data).current_index_version);
}

function sourceVideoStatus(detail: unknown): string {
  return firstString(
    getPath(detail, ["source_video", "preprocess_status"]),
    getPath(detail, ["preprocess", "status"]),
    getPath(detail, ["source_video", "status"]),
    asRecord(detail).preprocess_status
  );
}

function sourceVideoVisible(detail: unknown): boolean | null {
  return firstBoolean(
    getPath(detail, ["source_video", "visible_to_cutters"]),
    asRecord(detail).visible_to_cutters
  );
}

function sourceVideoIndexVersion(detail: unknown): string {
  return firstString(getPath(detail, ["artifacts", "index_version"]));
}

function sourceVideoArtifactComplete(detail: unknown): boolean | null {
  return firstBoolean(
    getPath(detail, ["artifacts", "artifact_complete"]),
    asRecord(detail).artifact_complete
  );
}

function supervisorState(data: unknown): string {
  const record = asRecord(data);
  return firstString(record.state, asBoolean(record.running) === true ? "running" : "");
}

function processingListCount(data: unknown): number | null {
  return firstNumber(asRecord(data).returned_count, asArray(data).length);
}

function readDirectBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function directFileContainsNul(check: SingleVideoSmokePostFileCheck): boolean | null {
  const values = [
    check.source_video_manifest.contains_nul,
    check.preprocess_job.contains_nul,
    check.library_manifest.contains_nul
  ].filter((value) => value !== null);

  if (values.length === 0) {
    return null;
  }
  return values.some((value) => value === true);
}

function directLibraryMatches(input: {
  check: SingleVideoSmokePostFileCheck;
  expected_ready_count: number;
  expected_index_version: string;
  expected_queued_count: number | null;
  expected_index_required_count: number | null;
}): boolean {
  const fields = input.check.library_manifest.fields;
  const directIndexVersion = asString(fields.current_index_version);
  return asNumber(fields.ready_video_count) === input.expected_ready_count &&
    asNumber(fields.processing_video_count) === 0 &&
    (!directIndexVersion || directIndexVersion === input.expected_index_version) &&
    (
      input.expected_queued_count === null ||
      asNumber(fields.queued_video_count) === input.expected_queued_count
    ) &&
    (
      input.expected_index_required_count === null ||
      asNumber(fields.index_required_video_count) === input.expected_index_required_count
    );
}

function sourceExpectation(input: {
  phase: PostBatchProofPhase;
}): {
  status: string;
  visible_to_cutters: boolean;
  gate_id: string;
  title: string;
  required_evidence: string;
} {
  return input.phase === "post-publish"
    ? {
        status: "ready",
        visible_to_cutters: true,
        gate_id: "api-selected-sources-ready-visible",
        title: "Selected post-publish sources are ready and visible to Cutter",
        required_evidence: "Every selected id must be ready and visible_to_cutters=true through Admin API."
      }
    : {
        status: "index-required",
        visible_to_cutters: false,
        gate_id: "api-selected-sources-index-required-hidden",
        title: "Selected post-batch sources are index-required and hidden from Cutter",
        required_evidence: "Every selected id must be index-required and visible_to_cutters=false through Admin API."
      };
}

function directSourceMatchesPhase(input: {
  check: SingleVideoSmokePostFileCheck;
  phase: PostBatchProofPhase;
}): boolean {
  const expectation = sourceExpectation({ phase: input.phase });
  const sourceFields = input.check.source_video_manifest.fields;
  const jobFields = input.check.preprocess_job.fields;
  return asString(sourceFields.preprocess_status) === expectation.status &&
    readDirectBoolean(sourceFields.visible_to_cutters) === expectation.visible_to_cutters &&
    asString(jobFields.status) === expectation.status;
}

function classifySmbCheck(input: {
  check: SingleVideoSmokePostFileCheck | undefined;
  api_passed: boolean;
  phase: PostBatchProofPhase;
  expected_ready_count: number;
  expected_index_version: string;
  expected_queued_count: number | null;
  expected_index_required_count: number | null;
}): PostBatchSourceItem["smb_status"] {
  if (!input.check) {
    return "not-configured";
  }
  if (input.check.status !== "checked") {
    return "blocked";
  }

  const sourceOk = directSourceMatchesPhase({
    check: input.check,
    phase: input.phase
  });
  const noNul = directFileContainsNul(input.check) === false;
  const libraryOk = directLibraryMatches({
    check: input.check,
    expected_ready_count: input.expected_ready_count,
    expected_index_version: input.expected_index_version,
    expected_queued_count: input.expected_queued_count,
    expected_index_required_count: input.expected_index_required_count
  });

  if (sourceOk && noNul && libraryOk) {
    return "clean";
  }
  if (input.api_passed) {
    return "stale-follow-up";
  }
  return "mismatch";
}

function extractWindowsAcceptance(report: unknown): Record<string, unknown> {
  const root = asRecord(report);
  const nested = asRecord(root.windows_acceptance);
  if (asString(nested.status) || asString(nested.runner_version)) {
    return nested;
  }
  const installLatestAndSmoke = asRecord(root.install_latest_and_smoke);
  return Object.keys(installLatestAndSmoke).length > 0
    ? asRecord(installLatestAndSmoke.windows_acceptance)
    : root;
}

function findCheckBody(report: Record<string, unknown>, checkId: string): unknown {
  const nested = asRecord(report.windows_acceptance);
  const directAppRuntime = asRecord(report.app_runtime_smoke);
  const appRuntime = Object.keys(directAppRuntime).length > 0
    ? directAppRuntime
    : asRecord(nested.app_runtime_smoke);
  for (const item of asArray(appRuntime.checks)) {
    const check = asRecord(item);
    if (check.id === checkId) {
      return getPath(check, ["body", "data"]);
    }
  }
  return undefined;
}

async function loadWindowsAcceptanceObservation(reportPath?: string): Promise<WindowsAcceptanceObservation> {
  const trimmedPath = optionalTrimmed(reportPath);
  if (!trimmedPath) {
    return {
      report_path: "",
      provided: false,
      status: "",
      runner_version: "",
      available_video_count: null,
      release_version: "",
      search_index_version: ""
    };
  }

  const report = JSON.parse(await readFile(trimmedPath, "utf8")) as unknown;
  const windowsAcceptance = extractWindowsAcceptance(report);
  const runtimeStatus = asRecord(findCheckBody(windowsAcceptance, "runtime_status"));
  const firstPage = asRecord(findCheckBody(windowsAcceptance, "source_library_first_page"));
  const releaseCache = asRecord(runtimeStatus.release_cache);
  const searchBackend = asRecord(runtimeStatus.search_backend);

  return {
    report_path: trimmedPath,
    provided: true,
    status: asString(windowsAcceptance.status),
    runner_version: asString(windowsAcceptance.runner_version),
    available_video_count: firstNumber(
      runtimeStatus.available_video_count,
      firstPage.available_video_count
    ),
    release_version: firstString(
      releaseCache.active_release_version,
      releaseCache.source_release_version,
      searchBackend.index_version
    ),
    search_index_version: firstString(
      releaseCache.search_index_version,
      searchBackend.index_version
    )
  };
}

function phaseDone(root: unknown, phaseId: string): boolean {
  return asArray(asRecord(root).phase_timings)
    .some((item) => {
      const phase = asRecord(item);
      return phase.phase_id === phaseId && phase.status === "done";
    });
}

async function loadRealCutObservation(reportPath?: string): Promise<RealCutObservation> {
  const trimmedPath = optionalTrimmed(reportPath);
  if (!trimmedPath) {
    return {
      report_path: "",
      provided: false,
      status: "",
      runner_version: "",
      selected_source_video_id: "",
      query: "",
      run_next_status: "",
      output_file: "",
      resolve_source_done: false,
      cut_media_done: false
    };
  }

  const report = JSON.parse(await readFile(trimmedPath, "utf8")) as unknown;
  const root = asRecord(report);
  const realCut = asRecord(root.real_cut_smoke);
  return {
    report_path: trimmedPath,
    provided: true,
    status: asString(root.status),
    runner_version: asString(root.runner_version),
    selected_source_video_id: asString(realCut.selected_source_video_id),
    query: asString(realCut.query),
    run_next_status: asString(realCut.run_next_status),
    output_file: asString(realCut.output_file),
    resolve_source_done: phaseDone(realCut, "resolve_source"),
    cut_media_done: phaseDone(realCut, "cut_media")
  };
}

function gate(input: PostBatchProofGate): PostBatchProofGate {
  return input;
}

function summarize(gates: PostBatchProofGate[]): PostBatchProofSummary {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    failed: gates.filter((item) => item.status === "fail").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    needs_follow_up: gates.filter((item) => item.status === "needs-follow-up").length,
    not_provided: gates.filter((item) => item.status === "not-provided").length,
    next_small_batch_blockers: gates
      .filter((item) => item.blocks_next_small_batch && item.status !== "pass")
      .map((item) => item.id),
    scale_up_blockers: gates
      .filter((item) => item.blocks_scale_up && item.status !== "pass")
      .map((item) => item.id)
  };
}

async function runReadonlyRequests(input: {
  base_url: string;
  source_video_ids: string[];
  session_token?: string;
  fetch_impl?: typeof fetch;
}): Promise<PostBatchProofRequestResult[]> {
  const baseUrl = trimTrailingSlash(input.base_url);
  const common = {
    base_url: baseUrl,
    session_token: input.session_token,
    fetch_impl: input.fetch_impl
  };
  const requests: PostBatchProofRequestResult[] = [
    await requestJson({
      ...common,
      name: "auth_status",
      method: "GET",
      path: "/api/admin/auth/status"
    }),
    await requestJson({
      ...common,
      name: "library_status",
      method: "GET",
      path: "/api/admin/library/status"
    }),
    await requestJson({
      ...common,
      name: "supervisor_status",
      method: "GET",
      path: "/api/admin/preprocess/supervisor/status"
    }),
    await requestJson({
      ...common,
      name: "source_videos_processing",
      method: "GET",
      path: "/api/admin/source-videos?status=processing&limit=20"
    })
  ];

  for (const sourceVideoId of input.source_video_ids) {
    requests.push(await requestJson({
      ...common,
      name: `source_video:${sourceVideoId}`,
      method: "GET",
      path: `/api/admin/source-videos/${sourceVideoId}`
    }));
  }

  return requests;
}

async function runSmbChecks(input: {
  library_mount_root?: string;
  source_video_ids: string[];
}): Promise<SingleVideoSmokePostFileCheck[]> {
  const mountRoot = optionalTrimmed(input.library_mount_root);
  if (!mountRoot) {
    return [];
  }

  const checks: SingleVideoSmokePostFileCheck[] = [];
  for (const sourceVideoId of input.source_video_ids) {
    checks.push(await checkSingleVideoSmokePostFiles({
      library_mount_root: mountRoot,
      source_video_id: sourceVideoId
    }));
  }
  return checks;
}

function buildSourceItems(input: {
  source_video_ids: string[];
  requests: PostBatchProofRequestResult[];
  smb_checks: SingleVideoSmokePostFileCheck[];
  proof_phase: PostBatchProofPhase;
  expected_ready_count: number;
  expected_index_version: string;
  expected_queued_count: number | null;
  expected_index_required_count: number | null;
}): PostBatchSourceItem[] {
  const expectation = sourceExpectation({ phase: input.proof_phase });
  return input.source_video_ids.map((sourceVideoId) => {
    const requestName = `source_video:${sourceVideoId}`;
    const detail = requestData(input.requests, requestName);
    const apiStatus = sourceVideoStatus(detail);
    const apiVisible = sourceVideoVisible(detail);
    const apiPassed = requestOk(input.requests, requestName) &&
      apiStatus === expectation.status &&
      apiVisible === expectation.visible_to_cutters;
    const check = input.smb_checks.find((item) => item.source_video_id === sourceVideoId);
    const smbStatus = classifySmbCheck({
      check,
      api_passed: apiPassed,
      phase: input.proof_phase,
      expected_ready_count: input.expected_ready_count,
      expected_index_version: input.expected_index_version,
      expected_queued_count: input.expected_queued_count,
      expected_index_required_count: input.expected_index_required_count
    });

    return {
      source_video_id: sourceVideoId,
      api_request_ok: requestOk(input.requests, requestName),
      api_preprocess_status: apiStatus,
      api_visible_to_cutters: apiVisible,
      api_index_version: sourceVideoIndexVersion(detail),
      api_artifact_complete: sourceVideoArtifactComplete(detail),
      api_passed: apiPassed,
      smb_status: smbStatus,
      smb_source_status: asString(check?.source_video_manifest.fields.preprocess_status),
      smb_source_visible: readDirectBoolean(check?.source_video_manifest.fields.visible_to_cutters),
      smb_job_status: asString(check?.preprocess_job.fields.status),
      smb_contains_nul: check ? directFileContainsNul(check) : null,
      smb_error: check?.error ?? ""
    };
  });
}

function buildGates(input: {
  source_video_ids: string[];
  classification_safe: boolean;
  classification_evidence: string;
  proof_phase: PostBatchProofPhase;
  library: unknown;
  supervisor: unknown;
  processing_list: unknown;
  requests: PostBatchProofRequestResult[];
  source_items: PostBatchSourceItem[];
  smb_checks: SingleVideoSmokePostFileCheck[];
  windows: WindowsAcceptanceObservation;
  real_cut: RealCutObservation;
  expected_library_root: string;
  expected_ready_count: number;
  expected_index_version: string;
  expected_queued_count: number | null;
  expected_index_required_count: number | null;
  library_mount_root: string;
}): PostBatchProofGate[] {
  const expectation = sourceExpectation({ phase: input.proof_phase });
  const libraryOk = requestOk(input.requests, "library_status");
  const root = libraryRoot(input.library);
  const ready = readyCount(input.library);
  const queued = queuedCount(input.library);
  const processing = processingCount(input.library);
  const indexRequired = indexRequiredCount(input.library);
  const indexVersion = currentIndexVersion(input.library);
  const libraryBaselineOk = libraryOk &&
    root === input.expected_library_root &&
    ready === input.expected_ready_count &&
    processing === 0 &&
    indexVersion === input.expected_index_version &&
    (
      input.expected_queued_count === null ||
      queued === input.expected_queued_count
    ) &&
    (
      input.expected_index_required_count === null ||
      indexRequired === input.expected_index_required_count
    );
  const sourceApiOk = input.source_items.length === input.source_video_ids.length &&
    input.source_items.every((item) => item.api_passed);
  const processingListOk = requestOk(input.requests, "source_videos_processing") &&
    processingListCount(input.processing_list) === 0;
  const supervisorIdle = ["idle", "stopped", "disabled"].includes(supervisorState(input.supervisor).toLowerCase()) ||
    asBoolean(asRecord(input.supervisor).running) === false;
  const smbConfigured = Boolean(input.library_mount_root);
  const smbClean = smbConfigured &&
    input.source_items.length > 0 &&
    input.source_items.every((item) => item.smb_status === "clean");
  const smbFollowUp = smbConfigured &&
    input.source_items.some((item) => item.smb_status === "stale-follow-up");
  const smbHardProblem = smbConfigured &&
    input.source_items.some((item) => item.smb_status === "blocked" || item.smb_status === "mismatch");
  const windowsProvided = input.windows.provided;
  const windowsOk = windowsProvided &&
    input.windows.status === "passed" &&
    input.windows.available_video_count === input.expected_ready_count &&
    input.windows.release_version === input.expected_index_version &&
    (
      !input.windows.search_index_version ||
      input.windows.search_index_version === input.expected_index_version
    );
  const realCutRequired = input.proof_phase === "post-publish";
  const realCutSelectedMatches = input.source_video_ids.includes(input.real_cut.selected_source_video_id);
  const realCutOk = input.real_cut.provided &&
    input.real_cut.status === "passed" &&
    input.real_cut.run_next_status === "done" &&
    Boolean(input.real_cut.output_file) &&
    realCutSelectedMatches &&
    input.real_cut.resolve_source_done &&
    input.real_cut.cut_media_done;

  const gates = [
    gate({
      id: "source-video-ids-provided",
      title: "Post-batch proof has explicit source video ids",
      category: "scope",
      status: input.source_video_ids.length > 0 ? "pass" : "blocked",
      evidence: `source_video_ids=${input.source_video_ids.join(", ") || "none"}.`,
      blocks_next_small_batch: true,
      blocks_scale_up: true,
      required_evidence: input.source_video_ids.length > 0 ? undefined : "Provide MIXLAB_ADMIN_PREPROCESS_POST_BATCH_SOURCE_VIDEO_IDS."
    }),
    gate({
      id: "nas-docker-admin-target",
      title: "Target URL is a NAS Docker Admin root",
      category: "target",
      status: input.classification_safe ? "pass" : "blocked",
      evidence: input.classification_evidence,
      blocks_next_small_batch: true,
      blocks_scale_up: true
    }),
    gate({
      id: "api-library-baseline-preserved",
      title: "Admin API library baseline preserves ready/index and no active processing",
      category: "api",
      status: libraryBaselineOk ? "pass" : libraryOk ? "fail" : "blocked",
      evidence: `root=${root || "unknown"}, ready=${String(ready)}, queued=${String(queued)}, processing=${String(processing)}, index_required=${String(indexRequired)}, index=${indexVersion || "unknown"}.`,
      blocks_next_small_batch: true,
      blocks_scale_up: true,
      required_evidence: libraryBaselineOk
        ? undefined
        : `Expected root=${input.expected_library_root}, ready=${input.expected_ready_count}, processing=0, index=${input.expected_index_version}.`
    }),
    gate({
      id: expectation.gate_id,
      title: expectation.title,
      category: "api",
      status: sourceApiOk ? "pass" : "fail",
      evidence: input.source_items
        .map((item) => `${item.source_video_id}:${item.api_preprocess_status || "unknown"}/visible=${String(item.api_visible_to_cutters)}`)
        .join(", ") || "none",
      blocks_next_small_batch: true,
      blocks_scale_up: true,
      required_evidence: sourceApiOk ? undefined : expectation.required_evidence
    }),
    gate({
      id: "api-processing-list-empty",
      title: "Processing list is empty after the batch",
      category: "api",
      status: processingListOk ? "pass" : requestOk(input.requests, "source_videos_processing") ? "fail" : "blocked",
      evidence: `processing_list_count=${String(processingListCount(input.processing_list))}.`,
      blocks_next_small_batch: true,
      blocks_scale_up: true,
      required_evidence: processingListOk ? undefined : "The bounded processing list must respond with zero active rows."
    }),
    gate({
      id: "api-supervisor-idle",
      title: "Preprocess supervisor is idle after the batch",
      category: "api",
      status: supervisorIdle && requestOk(input.requests, "supervisor_status") ? "pass" : requestOk(input.requests, "supervisor_status") ? "blocked" : "blocked",
      evidence: `state=${supervisorState(input.supervisor) || "unknown"}, running=${String(asBoolean(asRecord(input.supervisor).running))}.`,
      blocks_next_small_batch: true,
      blocks_scale_up: true,
      required_evidence: supervisorIdle ? undefined : "Supervisor must be idle before any next batch starts."
    }),
    gate({
      id: "smb-direct-post-files",
      title: "Mac SMB direct files match API post-batch state",
      category: "smb",
      status: !smbConfigured
        ? "not-provided"
        : smbClean
          ? "pass"
          : smbFollowUp
            ? "needs-follow-up"
            : smbHardProblem
              ? "blocked"
              : "blocked",
      evidence: !smbConfigured
        ? "No library mount root was provided."
        : input.source_items
            .map((item) => `${item.source_video_id}:${item.smb_status},source=${item.smb_source_status || "unknown"},job=${item.smb_job_status || "unknown"},nul=${String(item.smb_contains_nul)}`)
            .join(", "),
      blocks_next_small_batch: smbHardProblem,
      blocks_scale_up: smbHardProblem,
      required_evidence: smbClean
        ? undefined
        : smbFollowUp
          ? "Mac SMB direct view appears stale while Admin API is safe. Recheck through a fresh SMB/container-side view before increasing batch size."
          : "Direct source-video.json, preprocess-job.json and library.json should parse, contain no NUL, and match API state."
    }),
    gate({
      id: "windows-cutter-acceptance",
      title: "Windows Cutter sees the expected release",
      category: "windows-cutter",
      status: !windowsProvided
        ? "not-provided"
        : windowsOk
          ? "pass"
          : "fail",
      evidence: windowsProvided
        ? `status=${input.windows.status || "unknown"}, runner=${input.windows.runner_version || "unknown"}, available=${String(input.windows.available_video_count)}, release=${input.windows.release_version || "unknown"}, search_index=${input.windows.search_index_version || "unknown"}.`
        : "No Windows acceptance report path was provided.",
      blocks_next_small_batch: windowsProvided && !windowsOk,
      blocks_scale_up: !windowsOk,
      required_evidence: windowsOk
        ? undefined
        : `Provide a passing Windows acceptance report with available_video_count=${input.expected_ready_count} and release/index ${input.expected_index_version} before scale-up.`
    })
  ];

  if (realCutRequired || input.real_cut.provided) {
    gates.push(gate({
      id: "windows-real-cut-published-source",
      title: "Windows Cutter can cut one selected published source",
      category: "windows-cutter",
      status: realCutOk ? "pass" : input.real_cut.provided ? "fail" : "blocked",
      evidence: input.real_cut.provided
        ? `status=${input.real_cut.status || "unknown"}, runner=${input.real_cut.runner_version || "unknown"}, source=${input.real_cut.selected_source_video_id || "unknown"}, query=${input.real_cut.query || "unknown"}, run_next=${input.real_cut.run_next_status || "unknown"}, output=${input.real_cut.output_file || "missing"}, resolve_source_done=${String(input.real_cut.resolve_source_done)}, cut_media_done=${String(input.real_cut.cut_media_done)}.`
        : "No real_cut_smoke report path was provided.",
      blocks_next_small_batch: realCutRequired && !realCutOk,
      blocks_scale_up: realCutRequired && !realCutOk,
      required_evidence: realCutOk
        ? undefined
        : "For post-publish proof, provide a passing real_cut_smoke report whose selected_source_video_id is one of the selected published ids, run_next=done, output_file is present, and resolve_source/cut_media phases are done."
    }));
  }

  return gates;
}

function buildStatus(summary: PostBatchProofSummary): ProofStatus {
  if (summary.failed > 0) {
    return "failed";
  }
  if (summary.next_small_batch_blockers.length > 0) {
    return "blocked";
  }
  if (summary.needs_follow_up > 0 || summary.not_provided > 0 || summary.scale_up_blockers.length > 0) {
    return "passed-with-follow-up";
  }
  return "passed";
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function renderGateRows(gates: PostBatchProofGate[]): string {
  if (gates.length === 0) {
    return "none | n/a | n/a | n/a | n/a | n/a";
  }

  return gates.map((item) => [
    item.id,
    item.category,
    item.status,
    item.blocks_next_small_batch ? "yes" : "no",
    item.blocks_scale_up ? "yes" : "no",
    item.evidence,
    item.required_evidence ?? "n/a"
  ].map((cell) => escapeMarkdownCell(cell)).join(" | ")).join("\n");
}

function renderSourceRows(items: PostBatchSourceItem[]): string {
  if (items.length === 0) {
    return "none | n/a | n/a | n/a | n/a | n/a | n/a | n/a";
  }

  return items.map((item) => [
    item.source_video_id,
    item.api_request_ok ? "yes" : "no",
    item.api_preprocess_status || "unknown",
    String(item.api_visible_to_cutters),
    item.api_passed ? "yes" : "no",
    item.smb_status,
    item.smb_source_status || "unknown",
    item.smb_job_status || "unknown",
    String(item.smb_contains_nul)
  ].map((cell) => escapeMarkdownCell(cell)).join(" | ")).join("\n");
}

function renderRequestRows(requests: PostBatchProofRequestResult[]): string {
  if (requests.length === 0) {
    return "none | n/a | n/a | n/a | n/a";
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

export function renderMarkdown(report: AdminPreprocessPostBatchProofReport): string {
  return `# Admin Preprocess Post-Batch Proof

Generated: ${report.generated_at}

Status: ${report.status}

Mutates NAS files: no

Next small batch allowed: ${report.next_small_batch_allowed ? "yes" : "no"}

Scale-up allowed: ${report.scale_up_allowed ? "yes" : "no"}

This proof is read-only. It sends GET requests to Admin API, optionally reads direct SMB files, optionally reads a Windows acceptance report, and writes only local acceptance artifacts.

## Target

- Base URL: ${report.target.base_url || "not configured"}
- Normalized base URL: ${report.target.normalized_base_url || "n/a"}
- Safe to probe: ${report.target.safe_to_probe ? "yes" : "no"}
- Classification: ${report.target.classification}
- Proof phase: ${report.target.proof_phase}
- Session token present: ${report.target.session_token_present ? "yes" : "no"}
- Source videos: ${report.target.source_video_ids.join(", ") || "none"}
- Expected root: ${report.target.expected_library_root}
- Expected ready count: ${report.target.expected_ready_count}
- Expected index version: ${report.target.expected_index_version}
- Expected queued count: ${String(report.target.expected_queued_count)}
- Expected index-required count: ${String(report.target.expected_index_required_count)}
- Library mount root: ${report.target.library_mount_root || "not provided"}
- Windows acceptance report: ${report.target.windows_acceptance_report_path || "not provided"}
- Real cut report: ${report.target.real_cut_report_path || "not provided"}

## Observed

- Library: root=${report.observed.library_root || "unknown"}, ready=${String(report.observed.ready_video_count)}, queued=${String(report.observed.queued_video_count)}, processing=${String(report.observed.processing_video_count)}, index_required=${String(report.observed.index_required_video_count)}, index=${report.observed.current_index_version || "unknown"}
- Supervisor: ${report.observed.supervisor_state || "unknown"}
- Processing list count: ${String(report.observed.processing_list_count)}
- Windows: status=${report.observed.windows_acceptance.status || "not provided"}, runner=${report.observed.windows_acceptance.runner_version || "n/a"}, available=${String(report.observed.windows_acceptance.available_video_count)}, release=${report.observed.windows_acceptance.release_version || "n/a"}, search_index=${report.observed.windows_acceptance.search_index_version || "n/a"}
- Real cut: status=${report.observed.real_cut.status || "not provided"}, runner=${report.observed.real_cut.runner_version || "n/a"}, source=${report.observed.real_cut.selected_source_video_id || "n/a"}, run_next=${report.observed.real_cut.run_next_status || "n/a"}, output=${report.observed.real_cut.output_file || "missing"}

## Source Items

| Source Video | API OK | API Status | API Visible | API Passed | SMB Status | SMB Source | SMB Job | SMB NUL |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${renderSourceRows(report.source_items)}

## Gates

| Gate | Category | Status | Blocks Next Small Batch | Blocks Scale-Up | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
${renderGateRows(report.gates)}

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
${renderRequestRows(report.requests)}

## Summary

- Passed: ${report.summary.passed}
- Failed: ${report.summary.failed}
- Blocked: ${report.summary.blocked}
- Needs follow-up: ${report.summary.needs_follow_up}
- Not provided: ${report.summary.not_provided}
- Next small batch blockers: ${report.summary.next_small_batch_blockers.join(", ") || "none"}
- Scale-up blockers: ${report.summary.scale_up_blockers.join(", ") || "none"}

## Artifacts

- JSON: ${report.artifacts?.json_path ?? "not written"}
- Markdown: ${report.artifacts?.markdown_path ?? "not written"}
`;
}

async function writeArtifacts(input: {
  report: AdminPreprocessPostBatchProofReport;
  output_dir?: string;
  date: Date;
}): Promise<AdminPreprocessPostBatchProofReport> {
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  await mkdir(outputDir, { recursive: true });
  const stamp = timestampForFile(input.date);
  const jsonPath = path.join(outputDir, `admin-preprocess-post-batch-proof-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-preprocess-post-batch-proof-${stamp}.md`);
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

export async function runAdminPreprocessPostBatchProof(input: {
  base_url?: string;
  source_video_ids?: string[];
  proof_phase?: PostBatchProofPhase;
  expected_library_root?: string;
  expected_ready_count?: number;
  expected_index_version?: string;
  expected_queued_count?: number | null;
  expected_index_required_count?: number | null;
  session_token?: string;
  library_mount_root?: string;
  windows_acceptance_report_path?: string;
  real_cut_report_path?: string;
  output_dir?: string;
  command?: string;
  date?: Date;
  fetch_impl?: typeof fetch;
} = {}): Promise<AdminPreprocessPostBatchProofReport> {
  const date = input.date ?? new Date();
  const baseUrl = trimTrailingSlash(optionalTrimmed(input.base_url));
  const sourceVideoIds = input.source_video_ids ?? [];
  const proofPhase = input.proof_phase ?? "pre-publish";
  const sessionToken = optionalTrimmed(input.session_token);
  const expectedLibraryRoot = optionalTrimmed(input.expected_library_root) || DEFAULT_EXPECTED_LIBRARY_ROOT;
  const expectedReadyCount = input.expected_ready_count ?? DEFAULT_EXPECTED_READY_COUNT;
  const expectedIndexVersion = optionalTrimmed(input.expected_index_version) || DEFAULT_EXPECTED_INDEX_VERSION;
  const expectedQueuedCount = input.expected_queued_count ?? null;
  const expectedIndexRequiredCount = input.expected_index_required_count ?? null;
  const classification = classifyLiveReadonlyTarget(baseUrl);
  const windows = await loadWindowsAcceptanceObservation(input.windows_acceptance_report_path);
  const realCut = await loadRealCutObservation(input.real_cut_report_path);
  const requests = classification.safe_to_probe
    ? await runReadonlyRequests({
        base_url: classification.normalized_base_url,
        source_video_ids: sourceVideoIds,
        session_token: sessionToken || undefined,
        fetch_impl: input.fetch_impl
      })
    : [];
  const smbChecks = await runSmbChecks({
    library_mount_root: input.library_mount_root,
    source_video_ids: sourceVideoIds
  });
  const library = requestData(requests, "library_status");
  const supervisor = requestData(requests, "supervisor_status");
  const processingList = requestData(requests, "source_videos_processing");
  const sourceItems = buildSourceItems({
    source_video_ids: sourceVideoIds,
    requests,
    smb_checks: smbChecks,
    proof_phase: proofPhase,
    expected_ready_count: expectedReadyCount,
    expected_index_version: expectedIndexVersion,
    expected_queued_count: expectedQueuedCount,
    expected_index_required_count: expectedIndexRequiredCount
  });
  const gates = buildGates({
    source_video_ids: sourceVideoIds,
    classification_safe: classification.safe_to_probe,
    classification_evidence: classification.evidence,
    proof_phase: proofPhase,
    library,
    supervisor,
    processing_list: processingList,
    requests,
    source_items: sourceItems,
    smb_checks: smbChecks,
    windows,
    real_cut: realCut,
    expected_library_root: expectedLibraryRoot,
    expected_ready_count: expectedReadyCount,
    expected_index_version: expectedIndexVersion,
    expected_queued_count: expectedQueuedCount,
    expected_index_required_count: expectedIndexRequiredCount,
    library_mount_root: optionalTrimmed(input.library_mount_root)
  });
  const summary = summarize(gates);
  const status = buildStatus(summary);
  const report: AdminPreprocessPostBatchProofReport = {
    schema_version: "1.0",
    generated_at: date.toISOString(),
    command: input.command ?? "tsx scripts/acceptance/admin-preprocess-post-batch-proof.ts",
    mode: "admin-preprocess-post-batch-proof",
    status,
    mutates_nas_files: false,
    next_small_batch_allowed: summary.next_small_batch_blockers.length === 0 && summary.failed === 0,
    scale_up_allowed: summary.scale_up_blockers.length === 0 &&
      summary.failed === 0 &&
      summary.blocked === 0,
    target: {
      base_url: baseUrl,
      normalized_base_url: classification.normalized_base_url,
      safe_to_probe: classification.safe_to_probe,
      classification: classification.evidence,
      proof_phase: proofPhase,
      session_token_present: Boolean(sessionToken),
      source_video_ids: sourceVideoIds,
      expected_library_root: expectedLibraryRoot,
      expected_ready_count: expectedReadyCount,
      expected_index_version: expectedIndexVersion,
      expected_queued_count: expectedQueuedCount,
      expected_index_required_count: expectedIndexRequiredCount,
      library_mount_root: optionalTrimmed(input.library_mount_root),
      windows_acceptance_report_path: optionalTrimmed(input.windows_acceptance_report_path),
      real_cut_report_path: optionalTrimmed(input.real_cut_report_path)
    },
    observed: {
      library_root: libraryRoot(library),
      ready_video_count: readyCount(library),
      queued_video_count: queuedCount(library),
      processing_video_count: processingCount(library),
      index_required_video_count: indexRequiredCount(library),
      current_index_version: currentIndexVersion(library),
      supervisor_state: supervisorState(supervisor),
      processing_list_count: processingListCount(processingList),
      windows_acceptance: windows,
      real_cut: realCut
    },
    requests,
    source_items: sourceItems,
    smb_checks: smbChecks,
    gates,
    summary,
    result: {
      status,
      summary: status === "passed"
        ? "Post-batch proof passed. API, direct SMB files, and Windows Cutter release evidence match the expected protected baseline."
        : status === "passed-with-follow-up"
          ? "Post-batch API safety passed, but SMB or Windows scale-up evidence still needs follow-up before increasing batch size."
          : status === "failed"
            ? "Post-batch proof failed because a hard protected-baseline invariant did not match."
            : "Post-batch proof is blocked until the listed required evidence is available."
    },
    artifacts: null
  };

  return writeArtifacts({
    report,
    output_dir: input.output_dir,
    date
  });
}

async function main(): Promise<void> {
  const report = await runAdminPreprocessPostBatchProof({
    base_url: process.env.MIXLAB_ADMIN_PREPROCESS_POST_BATCH_BASE_URL,
    source_video_ids: parseSourceVideoIds(process.env.MIXLAB_ADMIN_PREPROCESS_POST_BATCH_SOURCE_VIDEO_IDS),
    proof_phase: parseProofPhase(process.env.MIXLAB_ADMIN_PREPROCESS_POST_BATCH_PROOF_PHASE),
    expected_library_root: process.env.MIXLAB_ADMIN_PREPROCESS_POST_BATCH_EXPECT_LIBRARY_ROOT,
    expected_ready_count: parsePositiveInteger(
      process.env.MIXLAB_ADMIN_PREPROCESS_POST_BATCH_EXPECT_READY_COUNT,
      DEFAULT_EXPECTED_READY_COUNT
    ),
    expected_index_version: process.env.MIXLAB_ADMIN_PREPROCESS_POST_BATCH_EXPECT_INDEX_VERSION,
    expected_queued_count: parseOptionalInteger(process.env.MIXLAB_ADMIN_PREPROCESS_POST_BATCH_EXPECT_QUEUED_COUNT),
    expected_index_required_count: parseOptionalInteger(process.env.MIXLAB_ADMIN_PREPROCESS_POST_BATCH_EXPECT_INDEX_REQUIRED_COUNT),
    session_token: process.env.MIXLAB_ADMIN_PREPROCESS_POST_BATCH_SESSION_TOKEN,
    library_mount_root: process.env.MIXLAB_ADMIN_PREPROCESS_POST_BATCH_LIBRARY_MOUNT,
    windows_acceptance_report_path: process.env.MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT,
    real_cut_report_path: process.env.MIXLAB_CUTTER_REAL_CUT_REPORT,
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.status,
    next_small_batch_allowed: report.next_small_batch_allowed,
    scale_up_allowed: report.scale_up_allowed,
    source_video_ids: report.target.source_video_ids,
    next_small_batch_blockers: report.summary.next_small_batch_blockers,
    scale_up_blockers: report.summary.scale_up_blockers,
    json_path: report.artifacts?.json_path,
    markdown_path: report.artifacts?.markdown_path
  }, null, 2));

  if (report.status === "failed" || report.status === "blocked") {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
