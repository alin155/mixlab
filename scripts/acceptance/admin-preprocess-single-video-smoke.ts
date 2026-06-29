import {
  access,
  copyFile,
  mkdir,
  readFile,
  stat,
  writeFile
} from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { classifyLiveReadonlyTarget } from "./admin-docker-release-live-readonly.ts";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_EXPECTED_LIBRARY_ROOT = "/data/PublicLibrary";
const DEFAULT_EXPECTED_READY_COUNT = 10471;
const DEFAULT_EXPECTED_INDEX_VERSION = "v010471";
const DEFAULT_POLL_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POST_FILE_WAIT_TIMEOUT_MS = 60 * 1000;
const DEFAULT_POST_FILE_WAIT_INTERVAL_MS = 2000;
const execFileAsync = promisify(execFile);

type HttpMethod = "GET" | "POST";
type GateStatus = "pass" | "blocked" | "fail" | "needs-follow-up";
type GateCategory =
  | "scope"
  | "target"
  | "auth"
  | "library"
  | "preprocess"
  | "snapshot"
  | "execution"
  | "postcheck";

interface ApiEnvelope {
  ok?: unknown;
  data?: unknown;
  error_code?: unknown;
  message?: unknown;
}

export interface SingleVideoSmokeRequestResult {
  name: string;
  method: HttpMethod;
  path: string;
  duration_ms: number;
  http_status: number | null;
  ok: boolean;
  api_ok: boolean | null;
  response_bytes: number;
  content_type: string;
  request_body?: unknown;
  data: unknown;
  error_code?: string;
  message?: string;
}

export interface SingleVideoSmokeSnapshotFile {
  label: string;
  relative_path: string;
  snapshot_relative_path: string;
  bytes: number;
  required: boolean;
}

export interface SingleVideoSmokeSnapshot {
  status: "captured" | "blocked" | "not-configured";
  library_mount_root: string;
  snapshot_dir: string;
  copied_files: SingleVideoSmokeSnapshotFile[];
  missing_required_files: string[];
  missing_optional_files: string[];
  error: string;
}

export interface SingleVideoSmokeDirectJsonFile {
  relative_path: string;
  exists: boolean;
  bytes: number | null;
  contains_nul: boolean | null;
  parsed: boolean;
  fields: Record<string, unknown>;
  error: string;
}

export interface SingleVideoSmokePostFileCheck {
  status: "not-run" | "checked" | "blocked";
  library_mount_root: string;
  source_video_id: string;
  source_video_manifest: SingleVideoSmokeDirectJsonFile;
  preprocess_job: SingleVideoSmokeDirectJsonFile;
  library_manifest: SingleVideoSmokeDirectJsonFile;
  attempt_count: number;
  wait_elapsed_ms: number;
  refresh_command_configured: boolean;
  refresh_attempted: boolean;
  refresh_exit_code: number | null;
  refresh_error: string;
  error: string;
}

export interface SingleVideoSmokeGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_dry_run_ready: boolean;
  blocks_execute: boolean;
  required_evidence?: string;
}

export interface AdminPreprocessSingleVideoSmokeReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-preprocess-single-video-smoke";
  execution_mode: "dry-run" | "execute";
  target: {
    base_url: string;
    normalized_base_url: string;
    safe_to_probe: boolean;
    classification: string;
    notes: string[];
    session_token_present: boolean;
    source_video_id: string;
    expected_library_root: string;
    expected_ready_count: number;
    expected_index_version: string;
  };
  allowed_write_boundary: {
    execute_requested: boolean;
    allowed_post_paths: string[];
    allowed_start_body: {
      limit: 1;
      source_video_id: string;
    } | null;
    publish_allowed: false;
    batch_preprocess_allowed: false;
  };
  dry_run_ready: boolean;
  single_video_smoke_passed: boolean;
  production_batch_allowed: false;
  publish_allowed: false;
  docker_deploy_allowed: false;
  mutates_nas_files: boolean;
  observed: {
    authenticated: boolean | null;
    library_root_before: string;
    ready_video_count_before: number | null;
    processing_video_count_before: number | null;
    current_index_version_before: string;
    source_status_before: string;
    source_visible_before: boolean | null;
    source_relative_path: string;
    source_file_size: number | null;
    safety_status: string;
    safe_to_start: boolean | null;
    supervisor_state_before: string;
    start_http_status: number | null;
    supervisor_state_after: string;
    last_result_total_claimed_count: number | null;
    last_result_succeeded_count: number | null;
    last_result_failed_count: number | null;
    source_status_after: string;
    source_visible_after: boolean | null;
    ready_video_count_after: number | null;
    processing_video_count_after: number | null;
    current_index_version_after: string;
  };
  readiness_report: {
    path: string;
    status: string;
    phase_0_1_readiness_ready: boolean | null;
    single_video_smoke_review_ready: boolean | null;
    ready_video_count: number | null;
    current_index_version: string;
  };
  snapshot: SingleVideoSmokeSnapshot;
  post_file_check: SingleVideoSmokePostFileCheck;
  requests: SingleVideoSmokeRequestResult[];
  gates: SingleVideoSmokeGate[];
  summary: {
    total: number;
    passed: number;
    blocked: number;
    failed: number;
    needs_follow_up: number;
    dry_run_blockers: string[];
    execute_blockers: string[];
  };
  result: {
    status: "dry-run-ready" | "passed" | "blocked" | "failed";
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

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

function parseExpectedReadyCount(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_EXPECTED_READY_COUNT;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

function sourceVideoStatus(detail: unknown): string {
  const data = asRecord(detail);
  return asString(getPath(data, ["source_video", "preprocess_status"])) ||
    asString(getPath(data, ["preprocess", "status"])) ||
    asString(data.preprocess_status);
}

function sourceVideoVisible(detail: unknown): boolean | null {
  const data = asRecord(detail);
  return asBoolean(getPath(data, ["source_video", "visible_to_cutters"])) ??
    asBoolean(getPath(data, ["visibility", "visible_to_cutters"])) ??
    asBoolean(data.visible_to_cutters);
}

function sourceVideoRelativePath(detail: unknown): string {
  const data = asRecord(detail);
  return asString(getPath(data, ["source_video", "relative_path"])) ||
    asString(getPath(data, ["technical", "relative_path"])) ||
    asString(data.relative_path);
}

function sourceVideoFileSize(detail: unknown): number | null {
  const data = asRecord(detail);
  return firstNumber(
    getPath(data, ["source_video", "file_size"]),
    getPath(data, ["technical", "file_size"]),
    data.file_size
  );
}

function libraryRoot(data: unknown): string {
  const record = asRecord(data);
  return asString(record.root_path) || asString(record.library_root);
}

function readyCount(data: unknown): number | null {
  return asNumber(asRecord(data).ready_video_count);
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

function supervisorState(data: unknown): string {
  return asString(asRecord(data).state);
}

function supervisorIdle(data: unknown): boolean | null {
  const record = asRecord(data);
  const running = asBoolean(record.running);
  if (typeof running === "boolean") {
    return !running;
  }
  const state = supervisorState(data).toLowerCase();
  if (!state) {
    return null;
  }
  return state === "idle" || state === "stopped" || state === "disabled";
}

function lastResult(data: unknown): Record<string, unknown> {
  return asRecord(asRecord(data).last_result);
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
    root_path: libraryRoot(data),
    video_count: asNumber(data.video_count),
    ready_video_count: asNumber(data.ready_video_count),
    queued_video_count: asNumber(data.queued_video_count),
    processing_video_count: asNumber(data.processing_video_count),
    index_required_video_count: asNumber(data.index_required_video_count),
    current_index_version: asString(data.current_index_version)
  };
}

function sanitizeSafety(value: unknown): unknown {
  const data = asRecord(value);
  const disk = asRecord(data.disk);
  const processing = asRecord(data.processing);
  return {
    status: asString(data.status),
    safe_to_start: asBoolean(data.safe_to_start),
    disk: {
      status: asString(disk.status),
      usage_percent: asNumber(disk.usage_percent),
      block_usage_percent: asNumber(disk.block_usage_percent)
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

function sanitizeSupervisor(value: unknown): unknown {
  const data = asRecord(value);
  const result = lastResult(value);
  return {
    state: asString(data.state),
    worker_id: asString(data.worker_id),
    started_at: asString(data.started_at),
    stopped_at: asString(data.stopped_at),
    last_error_present: Boolean(asString(data.last_error)),
    stop_requested: asBoolean(data.stop_requested),
    last_result: Object.keys(result).length === 0
      ? null
      : {
          total_claimed_count: asNumber(result.total_claimed_count),
          succeeded_count: asNumber(result.succeeded_count),
          failed_count: asNumber(result.failed_count)
        }
  };
}

function sanitizeSourceDetail(value: unknown): unknown {
  const data = asRecord(value);
  const sourceVideo = asRecord(data.source_video);
  const technical = asRecord(data.technical);
  const preprocess = asRecord(data.preprocess);
  const artifacts = asRecord(data.artifacts);
  const transcript = asRecord(data.transcript);

  return {
    source_video: {
      source_video_id: asString(sourceVideo.source_video_id),
      title: asString(sourceVideo.title),
      relative_path: asString(sourceVideo.relative_path),
      file_size: asNumber(sourceVideo.file_size),
      preprocess_status: asString(sourceVideo.preprocess_status),
      visible_to_cutters: asBoolean(sourceVideo.visible_to_cutters)
    },
    technical: {
      duration_ms: asNumber(technical.duration_ms),
      width: asNumber(technical.width),
      height: asNumber(technical.height),
      fps: asNumber(technical.fps),
      codec: asString(technical.codec),
      file_size: asNumber(technical.file_size),
      relative_path: asString(technical.relative_path)
    },
    preprocess: {
      status: asString(preprocess.status),
      job_id: asString(preprocess.job_id),
      stage: asString(preprocess.stage),
      attempt: asNumber(preprocess.attempt),
      started_at: asString(preprocess.started_at),
      completed_at: asString(preprocess.completed_at),
      failed_at: asString(preprocess.failed_at),
      error_stage: asString(preprocess.error_stage),
      error_message_present: Boolean(asString(preprocess.error_message))
    },
    artifacts: {
      transcript_exists: asBoolean(asRecord(artifacts.transcript).exists),
      subtitles_exists: asBoolean(asRecord(artifacts.subtitles).exists),
      cover_exists: asBoolean(asRecord(artifacts.cover).exists),
      keyframes_exists: asBoolean(asRecord(artifacts.keyframes).exists),
      index_version: asString(artifacts.index_version)
    },
    transcript: {
      segment_count: asNumber(transcript.segment_count),
      character_count: asNumber(transcript.character_count)
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
      .slice(0, 10)
  };
}

function sanitizeLog(value: unknown): unknown {
  const data = asRecord(value);
  const content = asString(data.content);
  return {
    source_video_id: asString(data.source_video_id),
    path: asString(data.path),
    exists: asBoolean(data.exists),
    content_bytes: Buffer.byteLength(content, "utf8"),
    tail: content.split(/\r?\n/).filter(Boolean).slice(-10)
  };
}

function sanitizeData(name: string, value: unknown): unknown {
  if (name === "auth_status") {
    return sanitizeAuthStatus(value);
  }
  if (name === "library_status_before" || name === "library_status_after") {
    return sanitizeLibraryStatus(value);
  }
  if (name === "preprocess_safety") {
    return sanitizeSafety(value);
  }
  if (name === "supervisor_status_before" || name === "supervisor_status_poll" || name === "supervisor_status_after") {
    return sanitizeSupervisor(value);
  }
  if (name === "source_video_before" || name === "source_video_after") {
    return sanitizeSourceDetail(value);
  }
  if (name === "source_videos_processing_before" || name === "source_videos_processing_after") {
    return sanitizeSourceList(value);
  }
  if (name === "preprocess_job_log_after") {
    return sanitizeLog(value);
  }
  return value;
}

function gate(input: SingleVideoSmokeGate): SingleVideoSmokeGate {
  return input;
}

async function requestJson(input: {
  base_url: string;
  name: string;
  method: HttpMethod;
  path: string;
  session_token?: string;
  body?: unknown;
  timeout_ms?: number;
  fetch_impl?: typeof fetch;
}): Promise<SingleVideoSmokeRequestResult> {
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
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  try {
    const fetchImpl = input.fetch_impl ?? fetch;
    const response = await fetchImpl(`${input.base_url}${input.path}`, {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
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
      ...(input.body === undefined ? {} : { request_body: input.body }),
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
      ...(input.body === undefined ? {} : { request_body: input.body }),
      data: null,
      error_code: error instanceof Error && error.name === "AbortError" ? "timeout" : "request_failed",
      message: errorMessage(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function requestData(requests: SingleVideoSmokeRequestResult[], name: string): unknown {
  const match = [...requests].reverse().find((request) => request.name === name);
  return match?.data ?? null;
}

function requestOk(requests: SingleVideoSmokeRequestResult[], name: string): boolean {
  return [...requests].reverse().find((request) => request.name === name)?.ok === true;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function emptyDirectJsonFile(relativePath: string, error = ""): SingleVideoSmokeDirectJsonFile {
  return {
    relative_path: relativePath,
    exists: false,
    bytes: null,
    contains_nul: null,
    parsed: false,
    fields: {},
    error
  };
}

function stripTrailingNulls(text: string): string {
  return text.replace(/\u0000+$/u, "");
}

function selectFields(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, record[key]]));
}

async function readDirectJsonFile(input: {
  library_mount_root: string;
  relative_path: string;
  fields: string[];
}): Promise<SingleVideoSmokeDirectJsonFile> {
  const filePath = path.join(input.library_mount_root, input.relative_path);

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(stripTrailingNulls(raw)) as unknown;

    return {
      relative_path: input.relative_path,
      exists: true,
      bytes: Buffer.byteLength(raw, "utf8"),
      contains_nul: raw.includes("\u0000"),
      parsed: true,
      fields: selectFields(asRecord(parsed), input.fields),
      error: ""
    };
  } catch (error) {
    return {
      ...emptyDirectJsonFile(input.relative_path, errorMessage(error)),
      exists: await fileExists(filePath)
    };
  }
}

function notRunPostFileCheck(input: {
  library_mount_root?: string;
  source_video_id: string;
}): SingleVideoSmokePostFileCheck {
  const sourcePath = `.mixlab-library/videos/${input.source_video_id}/source-video.json`;
  const jobPath = `.mixlab-library/videos/${input.source_video_id}/preprocess-job.json`;

  return {
    status: "not-run",
    library_mount_root: optionalTrimmed(input.library_mount_root),
    source_video_id: input.source_video_id,
    source_video_manifest: emptyDirectJsonFile(sourcePath),
    preprocess_job: emptyDirectJsonFile(jobPath),
    library_manifest: emptyDirectJsonFile(".mixlab-library/library.json"),
    attempt_count: 0,
    wait_elapsed_ms: 0,
    refresh_command_configured: false,
    refresh_attempted: false,
    refresh_exit_code: null,
    refresh_error: "",
    error: ""
  };
}

export async function checkSingleVideoSmokePostFiles(input: {
  library_mount_root?: string;
  source_video_id: string;
}): Promise<SingleVideoSmokePostFileCheck> {
  const mountRoot = optionalTrimmed(input.library_mount_root);
  const sourcePath = `.mixlab-library/videos/${input.source_video_id}/source-video.json`;
  const jobPath = `.mixlab-library/videos/${input.source_video_id}/preprocess-job.json`;

  if (!mountRoot) {
    return {
      status: "blocked",
      library_mount_root: "",
      source_video_id: input.source_video_id,
      source_video_manifest: emptyDirectJsonFile(sourcePath),
      preprocess_job: emptyDirectJsonFile(jobPath),
      library_manifest: emptyDirectJsonFile(".mixlab-library/library.json"),
      attempt_count: 1,
      wait_elapsed_ms: 0,
      refresh_command_configured: false,
      refresh_attempted: false,
      refresh_exit_code: null,
      refresh_error: "",
      error: "MIXLAB_ADMIN_PREPROCESS_SMOKE_LIBRARY_MOUNT is not set."
    };
  }

  const [sourceManifest, preprocessJob, libraryManifest] = await Promise.all([
    readDirectJsonFile({
      library_mount_root: mountRoot,
      relative_path: sourcePath,
      fields: [
        "source_video_id",
        "preprocess_status",
        "visible_to_cutters",
        "transcript_path",
        "srt_path",
        "cover_path",
        "keyframes_path"
      ]
    }),
    readDirectJsonFile({
      library_mount_root: mountRoot,
      relative_path: jobPath,
      fields: [
        "source_video_id",
        "status",
        "attempt",
        "worker_id",
        "claimed_at",
        "completed_at",
        "current_stage"
      ]
    }),
    readDirectJsonFile({
      library_mount_root: mountRoot,
      relative_path: ".mixlab-library/library.json",
      fields: [
        "video_count",
        "ready_video_count",
        "queued_video_count",
        "processing_video_count",
        "index_required_video_count",
        "current_index_version",
        "updated_at"
      ]
    })
  ]);
  const files = [sourceManifest, preprocessJob, libraryManifest];
  const blocked = files.some((file) => !file.exists || !file.parsed);

  return {
    status: blocked ? "blocked" : "checked",
    library_mount_root: mountRoot,
    source_video_id: input.source_video_id,
    source_video_manifest: sourceManifest,
    preprocess_job: preprocessJob,
    library_manifest: libraryManifest,
    attempt_count: 1,
    wait_elapsed_ms: 0,
    refresh_command_configured: false,
    refresh_attempted: false,
    refresh_exit_code: null,
    refresh_error: "",
    error: blocked
      ? files
          .filter((file) => !file.exists || !file.parsed)
          .map((file) => `${file.relative_path}: ${file.error || "missing or unreadable"}`)
          .join("; ")
      : ""
  };
}

export interface SingleVideoSmokePostFileRefreshResult {
  attempted: boolean;
  exit_code: number | null;
  error: string;
}

async function runPostFileRefreshCommand(command: string): Promise<SingleVideoSmokePostFileRefreshResult> {
  try {
    await execFileAsync("/bin/zsh", ["-lc", command], {
      timeout: 60_000,
      maxBuffer: 1024 * 1024
    });
    return {
      attempted: true,
      exit_code: 0,
      error: ""
    };
  } catch (error) {
    return {
      attempted: true,
      exit_code: typeof asRecord(error).code === "number" ? asRecord(error).code : null,
      error: errorMessage(error)
    };
  }
}

function singleVideoSmokePostFilesMatch(input: {
  check: SingleVideoSmokePostFileCheck;
  expected_ready_count: number;
  expected_index_required_count: number | null;
}): boolean {
  const directSource = input.check.source_video_manifest;
  const directJob = input.check.preprocess_job;
  const directLibrary = input.check.library_manifest;

  return input.check.status === "checked" &&
    directSource.contains_nul === false &&
    directJob.contains_nul === false &&
    directLibrary.contains_nul === false &&
    asString(directSource.fields.preprocess_status) === "index-required" &&
    asBoolean(directSource.fields.visible_to_cutters) === false &&
    asString(directJob.fields.status) === "index-required" &&
    asNumber(directLibrary.fields.ready_video_count) === input.expected_ready_count &&
    asNumber(directLibrary.fields.processing_video_count) === 0 &&
    (
      input.expected_index_required_count === null ||
      asNumber(directLibrary.fields.index_required_video_count) === input.expected_index_required_count
    );
}

export async function waitForSingleVideoSmokePostFiles(input: {
  library_mount_root?: string;
  source_video_id: string;
  expected_ready_count: number;
  expected_index_required_count: number | null;
  timeout_ms?: number;
  interval_ms?: number;
  post_file_refresh_command?: string;
  refresh_post_file_view?: () => Promise<SingleVideoSmokePostFileRefreshResult>;
  now_ms?: () => number;
  sleep_ms?: (ms: number) => Promise<void>;
}): Promise<SingleVideoSmokePostFileCheck> {
  const timeoutMs = input.timeout_ms ?? DEFAULT_POST_FILE_WAIT_TIMEOUT_MS;
  const intervalMs = input.interval_ms ?? DEFAULT_POST_FILE_WAIT_INTERVAL_MS;
  const nowMs = input.now_ms ?? (() => Date.now());
  const sleepMs = input.sleep_ms ?? sleep;
  const refreshCommand = optionalTrimmed(input.post_file_refresh_command);
  const refreshPostFileView = input.refresh_post_file_view
    ?? (refreshCommand ? () => runPostFileRefreshCommand(refreshCommand) : undefined);
  const startedAt = nowMs();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let refreshResult: SingleVideoSmokePostFileRefreshResult = {
    attempted: false,
    exit_code: null,
    error: ""
  };
  let lastCheck = notRunPostFileCheck({
    library_mount_root: input.library_mount_root,
    source_video_id: input.source_video_id
  });

  while (true) {
    attempts += 1;
    const checkedAt = nowMs();
    lastCheck = {
      ...await checkSingleVideoSmokePostFiles({
        library_mount_root: input.library_mount_root,
        source_video_id: input.source_video_id
      }),
      attempt_count: attempts,
      wait_elapsed_ms: Math.max(0, checkedAt - startedAt),
      refresh_command_configured: Boolean(refreshPostFileView),
      refresh_attempted: refreshResult.attempted,
      refresh_exit_code: refreshResult.exit_code,
      refresh_error: refreshResult.error
    };

    if (
      singleVideoSmokePostFilesMatch({
        check: lastCheck,
        expected_ready_count: input.expected_ready_count,
        expected_index_required_count: input.expected_index_required_count
      }) ||
      checkedAt >= deadline
    ) {
      return lastCheck;
    }

    if (refreshPostFileView && !refreshResult.attempted) {
      refreshResult = await refreshPostFileView();
      continue;
    }

    await sleepMs(Math.min(intervalMs, Math.max(0, deadline - checkedAt)));
  }
}

async function copySnapshotFile(input: {
  library_mount_root: string;
  snapshot_dir: string;
  relative_path: string;
  label: string;
  required: boolean;
}): Promise<{
  file?: SingleVideoSmokeSnapshotFile;
  missing?: string;
}> {
  const sourcePath = path.join(input.library_mount_root, input.relative_path);
  if (!await fileExists(sourcePath)) {
    return { missing: input.relative_path };
  }

  const snapshotPath = path.join(input.snapshot_dir, input.relative_path);
  await mkdir(path.dirname(snapshotPath), { recursive: true });
  await copyFile(sourcePath, snapshotPath);
  const copiedStat = await stat(snapshotPath);

  return {
    file: {
      label: input.label,
      relative_path: input.relative_path,
      snapshot_relative_path: path.relative(input.snapshot_dir, snapshotPath),
      bytes: copiedStat.size,
      required: input.required
    }
  };
}

export async function captureSingleVideoSmokeSnapshot(input: {
  library_mount_root?: string;
  source_video_id: string;
  snapshot_dir: string;
}): Promise<SingleVideoSmokeSnapshot> {
  const mountRoot = optionalTrimmed(input.library_mount_root);
  if (!mountRoot) {
    return {
      status: "not-configured",
      library_mount_root: "",
      snapshot_dir: input.snapshot_dir,
      copied_files: [],
      missing_required_files: [],
      missing_optional_files: [],
      error: "MIXLAB_ADMIN_PREPROCESS_SMOKE_LIBRARY_MOUNT is not set."
    };
  }

  try {
    const files = [
      {
        label: "library-ledger",
        relative_path: ".mixlab-library/library.json",
        required: true
      },
      {
        label: "source-video-manifest",
        relative_path: `.mixlab-library/videos/${input.source_video_id}/source-video.json`,
        required: true
      },
      {
        label: "preprocess-job",
        relative_path: `.mixlab-library/videos/${input.source_video_id}/preprocess-job.json`,
        required: false
      },
      {
        label: "preprocess-log",
        relative_path: `.mixlab-library/logs/${input.source_video_id}.log`,
        required: false
      },
      {
        label: "admin-read-model",
        relative_path: ".mixlab-library/admin-read-model/admin.sqlite",
        required: false
      },
      {
        label: "admin-read-model-wal",
        relative_path: ".mixlab-library/admin-read-model/admin.sqlite-wal",
        required: false
      },
      {
        label: "admin-read-model-shm",
        relative_path: ".mixlab-library/admin-read-model/admin.sqlite-shm",
        required: false
      }
    ];
    const copiedFiles: SingleVideoSmokeSnapshotFile[] = [];
    const missingRequired: string[] = [];
    const missingOptional: string[] = [];

    for (const file of files) {
      const copied = await copySnapshotFile({
        library_mount_root: mountRoot,
        snapshot_dir: input.snapshot_dir,
        relative_path: file.relative_path,
        label: file.label,
        required: file.required
      });
      if (copied.file) {
        copiedFiles.push(copied.file);
      } else if (copied.missing && file.required) {
        missingRequired.push(copied.missing);
      } else if (copied.missing) {
        missingOptional.push(copied.missing);
      }
    }

    return {
      status: missingRequired.length === 0 ? "captured" : "blocked",
      library_mount_root: mountRoot,
      snapshot_dir: input.snapshot_dir,
      copied_files: copiedFiles,
      missing_required_files: missingRequired,
      missing_optional_files: missingOptional,
      error: ""
    };
  } catch (error) {
    return {
      status: "blocked",
      library_mount_root: mountRoot,
      snapshot_dir: input.snapshot_dir,
      copied_files: [],
      missing_required_files: [],
      missing_optional_files: [],
      error: errorMessage(error)
    };
  }
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

function summarizeReadinessReport(filePath: string, report: unknown): AdminPreprocessSingleVideoSmokeReport["readiness_report"] {
  const root = asRecord(report);
  const result = asRecord(root.result);
  const observed = asRecord(root.observed);
  return {
    path: filePath,
    status: asString(result.status),
    phase_0_1_readiness_ready: asBoolean(root.phase_0_1_readiness_ready),
    single_video_smoke_review_ready: asBoolean(root.single_video_smoke_review_ready),
    ready_video_count: asNumber(observed.ready_video_count),
    current_index_version: asString(observed.current_index_version)
  };
}

function summarize(gates: SingleVideoSmokeGate[]): AdminPreprocessSingleVideoSmokeReport["summary"] {
  return {
    total: gates.length,
    passed: gates.filter((gateItem) => gateItem.status === "pass").length,
    blocked: gates.filter((gateItem) => gateItem.status === "blocked").length,
    failed: gates.filter((gateItem) => gateItem.status === "fail").length,
    needs_follow_up: gates.filter((gateItem) => gateItem.status === "needs-follow-up").length,
    dry_run_blockers: gates
      .filter((gateItem) => gateItem.blocks_dry_run_ready && gateItem.status !== "pass")
      .map((gateItem) => gateItem.id),
    execute_blockers: gates
      .filter((gateItem) => gateItem.blocks_execute && gateItem.status !== "pass")
      .map((gateItem) => gateItem.id)
  };
}

export function buildAdminPreprocessSingleVideoSmokeReport(input: {
  generated_at: string;
  command: string;
  base_url: string;
  source_video_id: string;
  expected_library_root: string;
  expected_ready_count: number;
  expected_index_version: string;
  session_token_present: boolean;
  execute_requested: boolean;
  requests: SingleVideoSmokeRequestResult[];
  snapshot: SingleVideoSmokeSnapshot;
  post_file_check?: SingleVideoSmokePostFileCheck;
  readiness_report_path?: string;
  readiness_report?: unknown;
}): AdminPreprocessSingleVideoSmokeReport {
  const classification = classifyLiveReadonlyTarget(input.base_url);
  const auth = asRecord(requestData(input.requests, "auth_status"));
  const libraryBefore = requestData(input.requests, "library_status_before");
  const libraryAfter = requestData(input.requests, "library_status_after");
  const safety = asRecord(requestData(input.requests, "preprocess_safety"));
  const safetyDisk = asRecord(safety.disk);
  const supervisorBefore = requestData(input.requests, "supervisor_status_before");
  const supervisorAfter = requestData(input.requests, "supervisor_status_after");
  const sourceBefore = requestData(input.requests, "source_video_before");
  const sourceAfter = requestData(input.requests, "source_video_after") || sourceBefore;
  const startRequest = [...input.requests].reverse().find((request) => request.name === "supervisor_start");
  const finalResult = lastResult(supervisorAfter);
  const readiness = summarizeReadinessReport(input.readiness_report_path ?? "", input.readiness_report);
  const sourceIdValid = /^V\d{6}$/.test(input.source_video_id);
  const targetStatus: GateStatus = classification.safe_to_probe
    ? "pass"
    : classification.kind === "not-configured"
      ? "blocked"
      : "fail";
  const authenticated = asBoolean(auth.authenticated);
  const readyBefore = readyCount(libraryBefore);
  const readyAfter = readyCount(libraryAfter);
  const indexRequiredAfter = indexRequiredCount(libraryAfter);
  const indexBefore = currentIndexVersion(libraryBefore);
  const indexAfter = currentIndexVersion(libraryAfter);
  const rootBefore = libraryRoot(libraryBefore);
  const sourceStatusBefore = sourceVideoStatus(sourceBefore);
  const sourceStatusAfter = sourceVideoStatus(sourceAfter);
  const sourceVisibleBefore = sourceVideoVisible(sourceBefore);
  const sourceVisibleAfter = sourceVideoVisible(sourceAfter);
  const postFileCheck = input.post_file_check ?? notRunPostFileCheck({
    library_mount_root: input.snapshot.library_mount_root,
    source_video_id: input.source_video_id
  });
  const directSource = postFileCheck.source_video_manifest;
  const directJob = postFileCheck.preprocess_job;
  const directLibrary = postFileCheck.library_manifest;
  const directSourceStatus = asString(directSource.fields.preprocess_status);
  const directSourceVisible = asBoolean(directSource.fields.visible_to_cutters);
  const directJobStatus = asString(directJob.fields.status);
  const directReadyCount = asNumber(directLibrary.fields.ready_video_count);
  const directProcessingCount = asNumber(directLibrary.fields.processing_video_count);
  const directIndexRequiredCount = asNumber(directLibrary.fields.index_required_video_count);
  const directQueuedCount = asNumber(directLibrary.fields.queued_video_count);
  const noProcessingBefore = processingCount(libraryBefore) === 0;
  const safetyHealthy = requestOk(input.requests, "preprocess_safety") &&
    asString(safety.status) === "healthy" &&
    asBoolean(safety.safe_to_start) === true &&
    asString(safetyDisk.status) !== "blocked";
  const idleBefore = supervisorIdle(supervisorBefore);
  const baselineBeforeOk = requestOk(input.requests, "library_status_before") &&
    rootBefore === input.expected_library_root &&
    readyBefore === input.expected_ready_count &&
    indexBefore === input.expected_index_version;
  const sourceBeforeOk = requestOk(input.requests, "source_video_before") &&
    sourceStatusBefore === "queued" &&
    sourceVisibleBefore === false;
  const snapshotOk = input.snapshot.status === "captured" &&
    input.snapshot.missing_required_files.length === 0;
  const readinessOk = input.readiness_report_path
    ? readiness.phase_0_1_readiness_ready === true &&
      readiness.single_video_smoke_review_ready === true &&
      readiness.ready_video_count === input.expected_ready_count &&
      readiness.current_index_version === input.expected_index_version
    : false;
  const executeShapeOk = !input.execute_requested || (
    startRequest?.method === "POST" &&
    startRequest.path === "/api/admin/preprocess/supervisor/start" &&
    JSON.stringify(startRequest.request_body) === JSON.stringify({
      limit: 1,
      source_video_id: input.source_video_id
    })
  );
  const executionResultOk = input.execute_requested &&
    startRequest?.ok === true &&
    supervisorIdle(supervisorAfter) === true &&
    asNumber(finalResult.total_claimed_count) === 1 &&
    asNumber(finalResult.succeeded_count) === 1 &&
    asNumber(finalResult.failed_count) === 0;
  const postcheckOk = input.execute_requested &&
    requestOk(input.requests, "library_status_after") &&
    requestOk(input.requests, "source_video_after") &&
    readyAfter === input.expected_ready_count &&
    indexAfter === input.expected_index_version &&
    processingCount(libraryAfter) === 0 &&
    sourceStatusAfter === "index-required" &&
    sourceVisibleAfter === false;
  const postFilesChecked = postFileCheck.status === "checked";
  const postFilesNoNul = directSource.contains_nul === false &&
    directJob.contains_nul === false &&
    directLibrary.contains_nul === false;
  const directPostcheckOk = input.execute_requested &&
    postFilesChecked &&
    postFilesNoNul &&
    directSourceStatus === "index-required" &&
    directSourceVisible === false &&
    directJobStatus === "index-required" &&
    directReadyCount === input.expected_ready_count &&
    directProcessingCount === 0 &&
    directIndexRequiredCount === indexRequiredAfter;
  const directPostcheckStatus: GateStatus = !input.execute_requested
    ? "needs-follow-up"
    : directPostcheckOk
      ? "pass"
      : postFilesChecked
        ? "fail"
        : "blocked";

  const gates = [
    gate({
      id: "single-video-scope-only",
      title: "Smoke scope is exactly one source video",
      category: "scope",
      status: sourceIdValid ? "pass" : "fail",
      evidence: `source_video_id=${input.source_video_id || "not configured"}.`,
      blocks_dry_run_ready: true,
      blocks_execute: true,
      required_evidence: sourceIdValid ? undefined : "Set MIXLAB_ADMIN_PREPROCESS_SMOKE_SOURCE_VIDEO_ID to V000001 format."
    }),
    gate({
      id: "nas-docker-admin-target",
      title: "Target URL is a NAS Docker Admin root",
      category: "target",
      status: targetStatus,
      evidence: classification.evidence,
      blocks_dry_run_ready: true,
      blocks_execute: true,
      required_evidence: targetStatus === "pass" ? undefined : "Use the NAS Docker Admin root URL, not localhost or NAS desktop."
    }),
    gate({
      id: "readiness-report-green",
      title: "Phase 0/1 readiness report is green",
      category: "target",
      status: readinessOk ? "pass" : "blocked",
      evidence: input.readiness_report_path
        ? `status=${readiness.status || "unknown"}, ready=${String(readiness.phase_0_1_readiness_ready)}, smoke_review=${String(readiness.single_video_smoke_review_ready)}, ready_count=${String(readiness.ready_video_count)}, index=${readiness.current_index_version || "unknown"}.`
        : "No MIXLAB_ADMIN_PREPROCESS_SMOKE_READINESS_REPORT was provided.",
      blocks_dry_run_ready: true,
      blocks_execute: true,
      required_evidence: readinessOk ? undefined : "Provide the latest admin-preprocess-production-readiness JSON with Phase 0/1 ready."
    }),
    gate({
      id: "admin-session-authenticated",
      title: "Admin session is authenticated",
      category: "auth",
      status: authenticated === true ? "pass" : "blocked",
      evidence: authenticated === true
        ? "auth/status returned authenticated=true."
        : input.session_token_present
          ? "A session token was provided, but auth/status did not prove authenticated=true."
          : "No session token was provided for protected Admin endpoints.",
      blocks_dry_run_ready: true,
      blocks_execute: true,
      required_evidence: authenticated === true ? undefined : "Provide a temporary Admin session token through the environment only."
    }),
    gate({
      id: "baseline-before-preserved",
      title: "Ready assets and current Cutter index baseline are preserved before smoke",
      category: "library",
      status: baselineBeforeOk ? "pass" : requestOk(input.requests, "library_status_before") ? "fail" : "blocked",
      evidence: `root=${rootBefore || "unknown"}, ready=${String(readyBefore)}, index=${indexBefore || "unknown"}.`,
      blocks_dry_run_ready: true,
      blocks_execute: true,
      required_evidence: baselineBeforeOk
        ? undefined
        : `Expected root=${input.expected_library_root}, ready=${input.expected_ready_count}, index=${input.expected_index_version}.`
    }),
    gate({
      id: "candidate-is-queued-and-hidden",
      title: "Selected candidate is queued and hidden from Cutter before smoke",
      category: "library",
      status: sourceBeforeOk ? "pass" : requestOk(input.requests, "source_video_before") ? "blocked" : "blocked",
      evidence: `status=${sourceStatusBefore || "unknown"}, visible_to_cutters=${String(sourceVisibleBefore)}, path=${sourceVideoRelativePath(sourceBefore) || "unknown"}, size=${String(sourceVideoFileSize(sourceBefore))}.`,
      blocks_dry_run_ready: true,
      blocks_execute: true,
      required_evidence: sourceBeforeOk ? undefined : "Pick a queued source video that is not visible to Cutter. Do not rerun ready material."
    }),
    gate({
      id: "no-processing-before-smoke",
      title: "No active processing exists before smoke",
      category: "preprocess",
      status: noProcessingBefore && requestOk(input.requests, "source_videos_processing_before") ? "pass" : "blocked",
      evidence: `library_processing=${String(processingCount(libraryBefore))}.`,
      blocks_dry_run_ready: true,
      blocks_execute: true,
      required_evidence: "processing_count must be 0 and the bounded processing list must respond before any smoke."
    }),
    gate({
      id: "preprocess-safety-healthy",
      title: "Preprocess safety gate is healthy",
      category: "preprocess",
      status: safetyHealthy ? "pass" : requestOk(input.requests, "preprocess_safety") ? "blocked" : "blocked",
      evidence: `status=${asString(safety.status) || "unknown"}, safe_to_start=${String(asBoolean(safety.safe_to_start))}, disk=${asString(safetyDisk.status) || "unknown"}.`,
      blocks_dry_run_ready: true,
      blocks_execute: true,
      required_evidence: "preprocess/safety must report healthy and safe_to_start=true."
    }),
    gate({
      id: "supervisor-idle-before-smoke",
      title: "Preprocess supervisor is idle before smoke",
      category: "preprocess",
      status: idleBefore === true ? "pass" : requestOk(input.requests, "supervisor_status_before") ? "blocked" : "blocked",
      evidence: `supervisor_idle=${String(idleBefore)}, state=${supervisorState(supervisorBefore) || "unknown"}.`,
      blocks_dry_run_ready: true,
      blocks_execute: true,
      required_evidence: "Supervisor must be idle before single-video smoke."
    }),
    gate({
      id: "pre-smoke-snapshot-captured",
      title: "Pre-smoke rollback snapshot is captured",
      category: "snapshot",
      status: snapshotOk ? "pass" : "blocked",
      evidence: snapshotOk
        ? `Copied ${input.snapshot.copied_files.length} files to ${input.snapshot.snapshot_dir}.`
        : input.snapshot.error || `missing_required=${input.snapshot.missing_required_files.join(", ") || "none"}.`,
      blocks_dry_run_ready: true,
      blocks_execute: true,
      required_evidence: snapshotOk ? undefined : "Mount the NAS library through SMB and capture library/source/job/log/read-model snapshot files first."
    }),
    gate({
      id: "dry-run-does-not-post",
      title: "Dry-run mode does not send command requests",
      category: "execution",
      status: input.execute_requested
        ? "needs-follow-up"
        : input.requests.some((request) => request.method === "POST") ? "fail" : "pass",
      evidence: input.execute_requested
        ? "Execution mode was explicitly requested."
        : "No POST request was sent.",
      blocks_dry_run_ready: !input.execute_requested,
      blocks_execute: false
    }),
    gate({
      id: "execute-body-is-single-target",
      title: "Execution start body is limited to one selected source video",
      category: "execution",
      status: input.execute_requested ? executeShapeOk ? "pass" : "fail" : "needs-follow-up",
      evidence: input.execute_requested
        ? `start_body=${JSON.stringify(startRequest?.request_body ?? null)}.`
        : "Dry-run only. Set MIXLAB_ADMIN_PREPROCESS_SMOKE_EXECUTE=1 after Docker target contains targeted start support.",
      blocks_dry_run_ready: false,
      blocks_execute: true,
      required_evidence: input.execute_requested ? undefined : "Run the same script with execute=1 only after the new Docker image is deployed."
    }),
    gate({
      id: "single-video-execution-succeeded",
      title: "Exactly one video was claimed and succeeded",
      category: "execution",
      status: input.execute_requested ? executionResultOk ? "pass" : "blocked" : "needs-follow-up",
      evidence: `start_http=${String(startRequest?.http_status ?? null)}, final_state=${supervisorState(supervisorAfter) || "n/a"}, claimed=${String(asNumber(finalResult.total_claimed_count))}, succeeded=${String(asNumber(finalResult.succeeded_count))}, failed=${String(asNumber(finalResult.failed_count))}.`,
      blocks_dry_run_ready: false,
      blocks_execute: true,
      required_evidence: "After execute, supervisor must return idle with last_result total=1 succeeded=1 failed=0."
    }),
    gate({
      id: "post-smoke-baseline-preserved",
      title: "Post-smoke ready/index baseline is preserved and target moved only to index-required",
      category: "postcheck",
      status: input.execute_requested ? postcheckOk ? "pass" : "fail" : "needs-follow-up",
      evidence: input.execute_requested
        ? `ready_after=${String(readyAfter)}, index_after=${indexAfter || "unknown"}, processing_after=${String(processingCount(libraryAfter))}, source_status_after=${sourceStatusAfter || "unknown"}, source_visible_after=${String(sourceVisibleAfter)}.`
        : "Dry-run only; no post-smoke mutation check was needed.",
      blocks_dry_run_ready: false,
      blocks_execute: true,
      required_evidence: "After execute, ready/index must remain at the expected baseline and the target should be index-required but hidden."
    }),
    gate({
      id: "post-smoke-nas-file-persistence",
      title: "Post-smoke NAS files persisted the same single-video state",
      category: "postcheck",
      status: directPostcheckStatus,
      evidence: input.execute_requested
        ? `status=${postFileCheck.status}, attempts=${postFileCheck.attempt_count}, wait_ms=${postFileCheck.wait_elapsed_ms}, refresh_configured=${String(postFileCheck.refresh_command_configured)}, refresh_attempted=${String(postFileCheck.refresh_attempted)}, refresh_exit=${String(postFileCheck.refresh_exit_code)}, source=${directSourceStatus || "unknown"}, source_visible=${String(directSourceVisible)}, job=${directJobStatus || "unknown"}, direct_ready=${String(directReadyCount)}, direct_processing=${String(directProcessingCount)}, direct_index_required=${String(directIndexRequiredCount)}, api_index_required=${String(indexRequiredAfter)}, direct_queued=${String(directQueuedCount)}, no_nul=${String(postFilesNoNul)}.`
        : "Dry-run only; direct NAS post-file persistence check runs after execute.",
      blocks_dry_run_ready: false,
      blocks_execute: true,
      required_evidence: directPostcheckOk
        ? undefined
        : "After execute, direct source-video.json, preprocess-job.json, and library.json on the NAS mount must match API postcheck and contain no NUL padding."
    })
  ];

  const summary = summarize(gates);
  const dryRunReady = summary.dry_run_blockers.length === 0;
  const smokePassed = input.execute_requested && summary.execute_blockers.length === 0;
  const failed = summary.failed > 0;
  const resultStatus: AdminPreprocessSingleVideoSmokeReport["result"]["status"] = failed
    ? "failed"
    : input.execute_requested
      ? smokePassed ? "passed" : "blocked"
      : dryRunReady ? "dry-run-ready" : "blocked";

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-preprocess-single-video-smoke",
    execution_mode: input.execute_requested ? "execute" : "dry-run",
    target: {
      base_url: input.base_url,
      normalized_base_url: classification.normalized_base_url,
      safe_to_probe: classification.safe_to_probe,
      classification: classification.evidence,
      notes: classification.notes,
      session_token_present: input.session_token_present,
      source_video_id: input.source_video_id,
      expected_library_root: input.expected_library_root,
      expected_ready_count: input.expected_ready_count,
      expected_index_version: input.expected_index_version
    },
    allowed_write_boundary: {
      execute_requested: input.execute_requested,
      allowed_post_paths: input.execute_requested ? ["/api/admin/preprocess/supervisor/start"] : [],
      allowed_start_body: input.execute_requested
        ? {
            limit: 1,
            source_video_id: input.source_video_id
          }
        : null,
      publish_allowed: false,
      batch_preprocess_allowed: false
    },
    dry_run_ready: dryRunReady,
    single_video_smoke_passed: smokePassed,
    production_batch_allowed: false,
    publish_allowed: false,
    docker_deploy_allowed: false,
    mutates_nas_files: input.execute_requested,
    observed: {
      authenticated,
      library_root_before: rootBefore,
      ready_video_count_before: readyBefore,
      processing_video_count_before: processingCount(libraryBefore),
      current_index_version_before: indexBefore,
      source_status_before: sourceStatusBefore,
      source_visible_before: sourceVisibleBefore,
      source_relative_path: sourceVideoRelativePath(sourceBefore),
      source_file_size: sourceVideoFileSize(sourceBefore),
      safety_status: asString(safety.status),
      safe_to_start: asBoolean(safety.safe_to_start),
      supervisor_state_before: supervisorState(supervisorBefore),
      start_http_status: startRequest?.http_status ?? null,
      supervisor_state_after: supervisorState(supervisorAfter),
      last_result_total_claimed_count: asNumber(finalResult.total_claimed_count),
      last_result_succeeded_count: asNumber(finalResult.succeeded_count),
      last_result_failed_count: asNumber(finalResult.failed_count),
      source_status_after: sourceStatusAfter,
      source_visible_after: sourceVisibleAfter,
      ready_video_count_after: readyAfter,
      processing_video_count_after: processingCount(libraryAfter),
      current_index_version_after: indexAfter
    },
    readiness_report: readiness,
    snapshot: input.snapshot,
    post_file_check: postFileCheck,
    requests: input.requests,
    gates,
    summary,
    result: {
      status: resultStatus,
      summary: resultStatus === "dry-run-ready"
        ? "Dry-run preflight and rollback snapshot are ready. This report did not mutate NAS files or start preprocessing."
        : resultStatus === "passed"
          ? "Controlled single-video preprocess smoke passed and preserved the ready/index Cutter baseline."
          : resultStatus === "failed"
            ? "Single-video smoke failed because a hard safety invariant was violated."
            : "Single-video smoke is blocked until the listed gates pass."
    },
    artifacts: null
  };
}

async function runPreflightRequests(input: {
  base_url: string;
  source_video_id: string;
  session_token?: string;
  fetch_impl?: typeof fetch;
}): Promise<SingleVideoSmokeRequestResult[]> {
  const baseUrl = trimTrailingSlash(input.base_url);
  const common = {
    base_url: baseUrl,
    session_token: input.session_token,
    fetch_impl: input.fetch_impl
  };

  return [
    await requestJson({
      ...common,
      name: "auth_status",
      method: "GET",
      path: "/api/admin/auth/status"
    }),
    await requestJson({
      ...common,
      name: "library_status_before",
      method: "GET",
      path: "/api/admin/library/status"
    }),
    await requestJson({
      ...common,
      name: "preprocess_safety",
      method: "GET",
      path: "/api/admin/preprocess/safety"
    }),
    await requestJson({
      ...common,
      name: "supervisor_status_before",
      method: "GET",
      path: "/api/admin/preprocess/supervisor/status"
    }),
    await requestJson({
      ...common,
      name: "source_videos_processing_before",
      method: "GET",
      path: "/api/admin/source-videos?status=processing&limit=20"
    }),
    await requestJson({
      ...common,
      name: "source_video_before",
      method: "GET",
      path: `/api/admin/source-videos/${input.source_video_id}`
    })
  ];
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runExecution(input: {
  base_url: string;
  source_video_id: string;
  session_token?: string;
  poll_timeout_ms: number;
  poll_interval_ms: number;
  fetch_impl?: typeof fetch;
}): Promise<SingleVideoSmokeRequestResult[]> {
  const baseUrl = trimTrailingSlash(input.base_url);
  const common = {
    base_url: baseUrl,
    session_token: input.session_token,
    fetch_impl: input.fetch_impl
  };
  const requests: SingleVideoSmokeRequestResult[] = [
    await requestJson({
      ...common,
      name: "supervisor_start",
      method: "POST",
      path: "/api/admin/preprocess/supervisor/start",
      body: {
        limit: 1,
        source_video_id: input.source_video_id
      },
      timeout_ms: 10_000
    })
  ];
  const deadline = Date.now() + input.poll_timeout_ms;

  while (Date.now() <= deadline) {
    const status = await requestJson({
      ...common,
      name: "supervisor_status_poll",
      method: "GET",
      path: "/api/admin/preprocess/supervisor/status",
      timeout_ms: 8000
    });
    requests.push(status);
    const state = supervisorState(status.data).toLowerCase();
    if (state && state !== "running" && state !== "stopping") {
      break;
    }
    await sleep(input.poll_interval_ms);
  }

  requests.push(
    await requestJson({
      ...common,
      name: "supervisor_status_after",
      method: "GET",
      path: "/api/admin/preprocess/supervisor/status"
    }),
    await requestJson({
      ...common,
      name: "library_status_after",
      method: "GET",
      path: "/api/admin/library/status"
    }),
    await requestJson({
      ...common,
      name: "source_videos_processing_after",
      method: "GET",
      path: "/api/admin/source-videos?status=processing&limit=20"
    }),
    await requestJson({
      ...common,
      name: "source_video_after",
      method: "GET",
      path: `/api/admin/source-videos/${input.source_video_id}`
    }),
    await requestJson({
      ...common,
      name: "preprocess_job_log_after",
      method: "GET",
      path: `/api/admin/preprocess/jobs/J${input.source_video_id.slice(1)}/log`
    })
  );

  return requests;
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function renderRequestRows(requests: SingleVideoSmokeRequestResult[]): string {
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

function renderGateRows(gates: SingleVideoSmokeGate[]): string {
  return gates.map((item) => [
    item.id,
    item.category,
    item.status,
    item.blocks_dry_run_ready ? "yes" : "no",
    item.blocks_execute ? "yes" : "no",
    item.evidence,
    item.required_evidence ?? "n/a"
  ].map((cell) => escapeMarkdownCell(cell)).join(" | ")).join("\n");
}

function renderSnapshotRows(snapshot: SingleVideoSmokeSnapshot): string {
  if (snapshot.copied_files.length === 0) {
    return "none | n/a | n/a | n/a";
  }

  return snapshot.copied_files.map((file) => [
    file.label,
    file.required ? "yes" : "no",
    file.relative_path,
    String(file.bytes)
  ].map((cell) => escapeMarkdownCell(cell)).join(" | ")).join("\n");
}

function renderDirectJsonFile(file: SingleVideoSmokeDirectJsonFile): string {
  return [
    file.relative_path,
    file.exists ? "yes" : "no",
    file.parsed ? "yes" : "no",
    file.contains_nul === null ? "n/a" : file.contains_nul ? "yes" : "no",
    String(file.bytes ?? "n/a"),
    JSON.stringify(file.fields),
    file.error || "none"
  ].map((cell) => escapeMarkdownCell(cell)).join(" | ");
}

function renderPostFileCheckRows(check: SingleVideoSmokePostFileCheck): string {
  return [
    renderDirectJsonFile(check.source_video_manifest),
    renderDirectJsonFile(check.preprocess_job),
    renderDirectJsonFile(check.library_manifest)
  ].join("\n");
}

export function renderMarkdown(report: AdminPreprocessSingleVideoSmokeReport): string {
  return `# Admin Preprocess Single Video Smoke

Generated: ${report.generated_at}

Mode: ${report.mode}

Execution mode: ${report.execution_mode}

Result: ${report.result.status}

Dry-run ready: ${report.dry_run_ready ? "yes" : "no"}

Single-video smoke passed: ${report.single_video_smoke_passed ? "yes" : "no"}

NAS file mutation: ${report.mutates_nas_files ? "yes" : "no"}

Production batch allowed: ${report.production_batch_allowed ? "yes" : "no"}

Publish allowed: ${report.publish_allowed ? "yes" : "no"}

Docker deploy allowed: ${report.docker_deploy_allowed ? "yes" : "no"}

This script is intentionally narrow. Dry-run mode sends only GET requests and writes local acceptance artifacts. Execute mode is allowed to POST only /api/admin/preprocess/supervisor/start with { limit: 1, source_video_id }. It never publishes a Cutter index, never runs a batch, and never records session tokens.

## Target

- Base URL: ${report.target.base_url || "not configured"}
- Normalized base URL: ${report.target.normalized_base_url || "n/a"}
- Safe to probe: ${report.target.safe_to_probe ? "yes" : "no"}
- Classification: ${report.target.classification}
- Session token present: ${report.target.session_token_present ? "yes" : "no"}
- Source video: ${report.target.source_video_id || "not configured"}
- Expected library root: ${report.target.expected_library_root}
- Expected ready count: ${report.target.expected_ready_count}
- Expected index version: ${report.target.expected_index_version}

## Observed

- Authenticated: ${String(report.observed.authenticated)}
- Before: root=${report.observed.library_root_before || "unknown"}, ready=${String(report.observed.ready_video_count_before)}, processing=${String(report.observed.processing_video_count_before)}, index=${report.observed.current_index_version_before || "unknown"}
- Candidate before: status=${report.observed.source_status_before || "unknown"}, visible=${String(report.observed.source_visible_before)}, size=${String(report.observed.source_file_size)}, path=${report.observed.source_relative_path || "unknown"}
- Safety: status=${report.observed.safety_status || "unknown"}, safe_to_start=${String(report.observed.safe_to_start)}
- Supervisor before: ${report.observed.supervisor_state_before || "unknown"}
- Start HTTP: ${String(report.observed.start_http_status)}
- Supervisor after: ${report.observed.supervisor_state_after || "n/a"}, claimed=${String(report.observed.last_result_total_claimed_count)}, succeeded=${String(report.observed.last_result_succeeded_count)}, failed=${String(report.observed.last_result_failed_count)}
- After: ready=${String(report.observed.ready_video_count_after)}, processing=${String(report.observed.processing_video_count_after)}, index=${report.observed.current_index_version_after || "n/a"}, candidate_status=${report.observed.source_status_after || "n/a"}, candidate_visible=${String(report.observed.source_visible_after)}

## Readiness Report

- Path: ${report.readiness_report.path || "not provided"}
- Status: ${report.readiness_report.status || "unknown"}
- Phase 0/1 ready: ${String(report.readiness_report.phase_0_1_readiness_ready)}
- Smoke review ready: ${String(report.readiness_report.single_video_smoke_review_ready)}
- Ready count: ${String(report.readiness_report.ready_video_count)}
- Index version: ${report.readiness_report.current_index_version || "unknown"}

## Snapshot

- Status: ${report.snapshot.status}
- Mount root: ${report.snapshot.library_mount_root || "not configured"}
- Snapshot dir: ${report.snapshot.snapshot_dir || "n/a"}
- Missing required: ${report.snapshot.missing_required_files.join(", ") || "none"}
- Missing optional: ${report.snapshot.missing_optional_files.join(", ") || "none"}
- Error: ${report.snapshot.error || "none"}

| Label | Required | Relative Path | Bytes |
| --- | --- | --- | --- |
${renderSnapshotRows(report.snapshot)}

## Post-Execute NAS Files

- Status: ${report.post_file_check.status}
- Mount root: ${report.post_file_check.library_mount_root || "not configured"}
- Attempts: ${report.post_file_check.attempt_count}
- Wait elapsed: ${report.post_file_check.wait_elapsed_ms}ms
- Refresh command configured: ${String(report.post_file_check.refresh_command_configured)}
- Refresh attempted: ${String(report.post_file_check.refresh_attempted)}
- Refresh exit code: ${String(report.post_file_check.refresh_exit_code)}
- Refresh error: ${report.post_file_check.refresh_error || "none"}
- Error: ${report.post_file_check.error || "none"}

| Relative Path | Exists | Parsed | Contains NUL | Bytes | Fields | Error |
| --- | --- | --- | --- | --- | --- | --- |
${renderPostFileCheckRows(report.post_file_check)}

## Summary

- Passed: ${report.summary.passed}
- Blocked: ${report.summary.blocked}
- Failed: ${report.summary.failed}
- Needs follow-up: ${report.summary.needs_follow_up}
- Dry-run blockers: ${report.summary.dry_run_blockers.join(", ") || "none"}
- Execute blockers: ${report.summary.execute_blockers.join(", ") || "none"}

## Requests

| Probe | Request | HTTP | OK | Duration | Error |
| --- | --- | --- | --- | --- | --- |
${renderRequestRows(report.requests)}

## Gates

| Gate | Category | Status | Blocks Dry-run | Blocks Execute | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- | --- |
${renderGateRows(report.gates)}

## Artifacts

- JSON: ${report.artifacts?.json_path ?? "not written"}
- Markdown: ${report.artifacts?.markdown_path ?? "not written"}
`;
}

export async function writeAdminPreprocessSingleVideoSmokeArtifacts(input: {
  report: AdminPreprocessSingleVideoSmokeReport;
  output_dir?: string;
  date?: Date;
}): Promise<AdminPreprocessSingleVideoSmokeReport> {
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  await mkdir(outputDir, { recursive: true });

  const stamp = timestampForFile(input.date);
  const jsonPath = path.join(outputDir, `admin-preprocess-single-video-smoke-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-preprocess-single-video-smoke-${stamp}.md`);
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

export async function runAdminPreprocessSingleVideoSmoke(input: {
  base_url?: string;
  source_video_id?: string;
  expected_library_root?: string;
  expected_ready_count?: number;
  expected_index_version?: string;
  session_token?: string;
  readiness_report_path?: string;
  library_mount_root?: string;
  execute?: boolean;
  poll_timeout_ms?: number;
  poll_interval_ms?: number;
  post_file_wait_timeout_ms?: number;
  post_file_wait_interval_ms?: number;
  post_file_refresh_command?: string;
  refresh_post_file_view?: () => Promise<SingleVideoSmokePostFileRefreshResult>;
  output_dir?: string;
  command?: string;
  date?: Date;
  fetch_impl?: typeof fetch;
} = {}): Promise<AdminPreprocessSingleVideoSmokeReport> {
  const baseUrl = trimTrailingSlash(optionalTrimmed(input.base_url));
  const sourceVideoId = optionalTrimmed(input.source_video_id);
  const sessionToken = optionalTrimmed(input.session_token);
  const date = input.date ?? new Date();
  const stamp = timestampForFile(date);
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const snapshotDir = path.join(outputDir, `admin-preprocess-single-video-smoke-${stamp}`, "pre-smoke-snapshot");
  const readinessReport = await loadOptionalJson(input.readiness_report_path);
  let postFileCheck = notRunPostFileCheck({
    library_mount_root: input.library_mount_root,
    source_video_id: sourceVideoId
  });
  const classification = classifyLiveReadonlyTarget(baseUrl);
  const requests = classification.safe_to_probe && sourceVideoId
    ? await runPreflightRequests({
        base_url: classification.normalized_base_url,
        source_video_id: sourceVideoId,
        session_token: sessionToken || undefined,
        fetch_impl: input.fetch_impl
      })
    : [];
  const snapshot = sourceVideoId
    ? await captureSingleVideoSmokeSnapshot({
        library_mount_root: input.library_mount_root,
        source_video_id: sourceVideoId,
        snapshot_dir: snapshotDir
      })
    : {
        status: "blocked" as const,
        library_mount_root: optionalTrimmed(input.library_mount_root),
        snapshot_dir: snapshotDir,
        copied_files: [],
        missing_required_files: [],
        missing_optional_files: [],
        error: "source_video_id is not configured."
      };

  if (input.execute && classification.safe_to_probe && sourceVideoId) {
    requests.push(...await runExecution({
      base_url: classification.normalized_base_url,
      source_video_id: sourceVideoId,
      session_token: sessionToken || undefined,
      poll_timeout_ms: input.poll_timeout_ms ?? DEFAULT_POLL_TIMEOUT_MS,
      poll_interval_ms: input.poll_interval_ms ?? DEFAULT_POLL_INTERVAL_MS,
      fetch_impl: input.fetch_impl
    }));
    postFileCheck = await waitForSingleVideoSmokePostFiles({
      library_mount_root: input.library_mount_root,
      source_video_id: sourceVideoId,
      expected_ready_count: input.expected_ready_count ?? DEFAULT_EXPECTED_READY_COUNT,
      expected_index_required_count: indexRequiredCount(requestData(requests, "library_status_after")),
      timeout_ms: input.post_file_wait_timeout_ms,
      interval_ms: input.post_file_wait_interval_ms,
      post_file_refresh_command: input.post_file_refresh_command,
      refresh_post_file_view: input.refresh_post_file_view
    });
  }

  const report = buildAdminPreprocessSingleVideoSmokeReport({
    generated_at: date.toISOString(),
    command: input.command ?? "npx tsx scripts/acceptance/admin-preprocess-single-video-smoke.ts",
    base_url: baseUrl,
    source_video_id: sourceVideoId,
    expected_library_root: optionalTrimmed(input.expected_library_root) || DEFAULT_EXPECTED_LIBRARY_ROOT,
    expected_ready_count: input.expected_ready_count ?? DEFAULT_EXPECTED_READY_COUNT,
    expected_index_version: optionalTrimmed(input.expected_index_version) || DEFAULT_EXPECTED_INDEX_VERSION,
    session_token_present: Boolean(sessionToken),
    execute_requested: input.execute === true,
    requests,
    snapshot,
    post_file_check: postFileCheck,
    readiness_report_path: input.readiness_report_path,
    readiness_report: readinessReport
  });

  return writeAdminPreprocessSingleVideoSmokeArtifacts({
    report,
    output_dir: input.output_dir,
    date
  });
}

async function main(): Promise<void> {
  const report = await runAdminPreprocessSingleVideoSmoke({
    base_url: process.env.MIXLAB_ADMIN_PREPROCESS_SMOKE_BASE_URL,
    source_video_id: process.env.MIXLAB_ADMIN_PREPROCESS_SMOKE_SOURCE_VIDEO_ID,
    expected_library_root: process.env.MIXLAB_ADMIN_PREPROCESS_SMOKE_EXPECT_LIBRARY_ROOT,
    expected_ready_count: parseExpectedReadyCount(process.env.MIXLAB_ADMIN_PREPROCESS_SMOKE_EXPECT_READY_COUNT),
    expected_index_version: process.env.MIXLAB_ADMIN_PREPROCESS_SMOKE_EXPECT_INDEX_VERSION,
    session_token: process.env.MIXLAB_ADMIN_PREPROCESS_SMOKE_SESSION_TOKEN,
    readiness_report_path: process.env.MIXLAB_ADMIN_PREPROCESS_SMOKE_READINESS_REPORT,
    library_mount_root: process.env.MIXLAB_ADMIN_PREPROCESS_SMOKE_LIBRARY_MOUNT,
    execute: process.env.MIXLAB_ADMIN_PREPROCESS_SMOKE_EXECUTE === "1",
    poll_timeout_ms: parsePositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_SMOKE_POLL_TIMEOUT_MS, DEFAULT_POLL_TIMEOUT_MS),
    poll_interval_ms: parsePositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_SMOKE_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS),
    post_file_wait_timeout_ms: parsePositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_SMOKE_POST_FILE_WAIT_TIMEOUT_MS, DEFAULT_POST_FILE_WAIT_TIMEOUT_MS),
    post_file_wait_interval_ms: parsePositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_SMOKE_POST_FILE_WAIT_INTERVAL_MS, DEFAULT_POST_FILE_WAIT_INTERVAL_MS),
    post_file_refresh_command: process.env.MIXLAB_ADMIN_PREPROCESS_SMOKE_POST_FILE_REFRESH_COMMAND,
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    execution_mode: report.execution_mode,
    status: report.result.status,
    dry_run_ready: report.dry_run_ready,
    single_video_smoke_passed: report.single_video_smoke_passed,
    mutates_nas_files: report.mutates_nas_files,
    source_video_id: report.target.source_video_id,
    dry_run_blockers: report.summary.dry_run_blockers,
    execute_blockers: report.summary.execute_blockers,
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
