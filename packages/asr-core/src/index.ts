import { openAsBlob } from "node:fs";
import path from "node:path";
import {
  normalizeTranscriptText,
  type TranscriptSegment
} from "../../protocol/src/index.ts";

export const DASHSCOPE_TRANSCRIPTION_URL =
  "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription";

export const DASHSCOPE_TASK_URL_PREFIX =
  "https://dashscope.aliyuncs.com/api/v1/tasks";

export const DASHSCOPE_UPLOADS_URL =
  "https://dashscope.aliyuncs.com/api/v1/uploads";

export type DashScopeAsrModel = "paraformer-v2" | string;

export interface DashScopeSubmitParameters {
  channel_id?: number[];
  language_hints?: string[];
  diarization_enabled?: boolean;
}

export interface DashScopeSubmitInput {
  api_key: string;
  file_urls: string[];
  model: DashScopeAsrModel;
  parameters?: DashScopeSubmitParameters;
}

export interface DashScopeGetTemporaryUploadPolicyInput {
  api_key: string;
  model: DashScopeAsrModel;
}

export interface DashScopeQueryTaskInput {
  api_key: string;
  task_id: string;
}

export interface DashScopeRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: unknown;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface LiveDashScopeAsrReadinessReport {
  enabled: boolean;
  enable_flag: typeof LIVE_DASHSCOPE_ASR_ENABLE_FLAG;
  required_env_keys: readonly string[];
  missing_env_keys: string[];
  audio_url_errors: string[];
}

export interface DashScopeTranscriptionSentence {
  begin_time?: number;
  end_time?: number;
  begin_time_ms?: number;
  end_time_ms?: number;
  text?: string;
  confidence?: number;
}

export interface DashScopeTranscriptionTranscript {
  text?: string;
  content_duration_in_milliseconds?: number;
  sentences?: DashScopeTranscriptionSentence[];
}

export interface DashScopeTranscriptionResult {
  properties?: {
    original_duration_in_milliseconds?: number;
  };
  transcripts?: DashScopeTranscriptionTranscript[];
}

export interface MixlabTranscriptArtifact {
  schema_version: "1.0";
  source_video_id: string;
  provider: "dashscope";
  model: string;
  generated_at: string;
  duration_ms: number;
  full_text: string;
  segments: TranscriptSegment[];
}

export interface ConvertDashScopeTranscriptionInput {
  source_video_id: string;
  model: string;
  generated_at: string;
  result: DashScopeTranscriptionResult;
}

export interface DashScopeJsonHttpClient {
  requestJson(request: DashScopeRequest): Promise<unknown>;
  getJson(url: string): Promise<unknown>;
}

export interface DashScopeTemporaryFileUploadRequest {
  url: string;
  fields: Record<string, string>;
  file_path: string;
  file_name: string;
}

export interface DashScopeTemporaryFileHttpClient extends DashScopeJsonHttpClient {
  uploadFile(request: DashScopeTemporaryFileUploadRequest): Promise<void>;
}

export interface DashScopeTemporaryUploadPolicy {
  upload_dir: string;
  upload_host: string;
  oss_access_key_id: string;
  policy: string;
  signature: string;
  x_oss_object_acl?: string;
  x_oss_forbid_overwrite?: string;
}

export interface UploadDashScopeTemporaryFileInput {
  api_key: string;
  model: DashScopeAsrModel;
  local_file_path: string;
  file_name?: string;
  http: DashScopeTemporaryFileHttpClient;
}

export interface DashScopeTemporaryUploadedFile {
  object_key: string;
  file_url: string;
  url_mode: "dashscope-temporary-oss";
}

export interface CreateDashScopeTemporaryFileAudioUploaderInput {
  api_key: string;
  model: DashScopeAsrModel;
  http: DashScopeTemporaryFileHttpClient;
}

export interface DashScopeTemporaryFileAudioUploader {
  uploadAsrAudio(input: { local_file_path: string }): Promise<DashScopeTemporaryUploadedFile>;
}

export type DashScopeSleep = (milliseconds: number) => Promise<void>;

export interface RunDashScopeRecordedAudioAsrInput {
  api_key: string;
  model: DashScopeAsrModel;
  source_video_id: string;
  file_url: string;
  generated_at: string;
  parameters?: DashScopeSubmitParameters;
  max_poll_attempts?: number;
  poll_interval_ms?: number;
  sleep?: DashScopeSleep;
  http: DashScopeJsonHttpClient;
}

export interface DashScopeRecordedAudioAsrResult {
  task_id: string;
  transcription_url: string;
  transcript: MixlabTranscriptArtifact;
  srt: string;
}

export type DashScopeFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export const LIVE_DASHSCOPE_ASR_ENABLE_FLAG = "MIXLAB_ENABLE_LIVE_ASR";

const DASHSCOPE_LIVE_ASR_REQUIRED_ENV_KEYS = [
  "DASHSCOPE_API_KEY",
  "MIXLAB_ASR_AUDIO_URL"
] as const;

interface DashScopeTaskResponse {
  output?: {
    task_id?: string;
    task_status?: string;
    message?: string;
    results?: Array<{
      transcription_url?: string;
    }>;
  };
  message?: string;
}

interface DashScopeTemporaryUploadPolicyResponse {
  data?: Partial<DashScopeTemporaryUploadPolicy>;
}

export function validateDashScopeFileUrls(fileUrls: string[]): ValidationResult {
  const errors: string[] = [];

  if (fileUrls.length > 100) {
    errors.push("file_urls supports at most 100 URLs per request");
  }

  for (const [index, fileUrl] of fileUrls.entries()) {
    if (!/^https?:\/\//.test(fileUrl) && !fileUrl.startsWith("oss://")) {
      errors.push(
        `file_urls[${index}] must be http(s) or oss:// URL; local files must be uploaded first`
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function hasDashScopeOssFileUrl(fileUrls: string[]): boolean {
  return fileUrls.some((fileUrl) => fileUrl.startsWith("oss://"));
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function missingRequiredLiveDashScopeAsrEnvKeys(env: NodeJS.ProcessEnv): string[] {
  return DASHSCOPE_LIVE_ASR_REQUIRED_ENV_KEYS.filter((key) => !optionalTrimmed(env[key]));
}

export function isLiveDashScopeAsrEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return optionalTrimmed(env[LIVE_DASHSCOPE_ASR_ENABLE_FLAG]) === "1";
}

export function buildLiveDashScopeAsrReadinessReport(
  env: NodeJS.ProcessEnv = process.env
): LiveDashScopeAsrReadinessReport {
  const fileUrl = optionalTrimmed(env.MIXLAB_ASR_AUDIO_URL);
  const audioUrlValidation = fileUrl ? validateDashScopeFileUrls([fileUrl]) : undefined;

  return {
    enabled: isLiveDashScopeAsrEnabled(env),
    enable_flag: LIVE_DASHSCOPE_ASR_ENABLE_FLAG,
    required_env_keys: DASHSCOPE_LIVE_ASR_REQUIRED_ENV_KEYS,
    missing_env_keys: missingRequiredLiveDashScopeAsrEnvKeys(env),
    audio_url_errors: audioUrlValidation?.errors ?? []
  };
}

export function buildDashScopeSubmitTranscriptionRequest(
  input: DashScopeSubmitInput
): DashScopeRequest {
  const validation = validateDashScopeFileUrls(input.file_urls);

  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  return {
    url: DASHSCOPE_TRANSCRIPTION_URL,
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.api_key}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
      ...(hasDashScopeOssFileUrl(input.file_urls)
        ? { "X-DashScope-OssResourceResolve": "enable" }
        : {})
    },
    body: {
      model: input.model,
      input: {
        file_urls: input.file_urls
      },
      ...(input.parameters ? { parameters: input.parameters } : {})
    }
  };
}

export function buildDashScopeGetTemporaryUploadPolicyRequest(
  input: DashScopeGetTemporaryUploadPolicyInput
): DashScopeRequest {
  const url = new URL(DASHSCOPE_UPLOADS_URL);
  url.searchParams.set("action", "getPolicy");
  url.searchParams.set("model", input.model);

  return {
    url: url.toString(),
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.api_key}`,
      "Content-Type": "application/json"
    }
  };
}

export function buildDashScopeQueryTaskRequest(
  input: DashScopeQueryTaskInput
): DashScopeRequest {
  return {
    url: `${DASHSCOPE_TASK_URL_PREFIX}/${encodeURIComponent(input.task_id)}`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.api_key}`
    }
  };
}

export function redactDashScopeRequest(request: DashScopeRequest): DashScopeRequest {
  return {
    ...request,
    headers: {
      ...request.headers,
      ...(request.headers.Authorization ? { Authorization: "Bearer ***" } : {})
    }
  };
}

function charLength(text: string): number {
  return Array.from(text).length;
}

function segmentId(sourceVideoId: string, index: number): string {
  return `${sourceVideoId}-S${(index + 1).toString().padStart(6, "0")}`;
}

function sentenceBeginMs(sentence: DashScopeTranscriptionSentence): number {
  return Math.max(0, Math.trunc(sentence.begin_time ?? sentence.begin_time_ms ?? 0));
}

function sentenceEndMs(
  sentence: DashScopeTranscriptionSentence,
  fallbackEndMs: number
): number {
  return Math.max(
    sentenceBeginMs(sentence),
    Math.trunc(sentence.end_time ?? sentence.end_time_ms ?? fallbackEndMs)
  );
}

function transcriptFallbackDurationMs(
  transcript: DashScopeTranscriptionTranscript,
  result: DashScopeTranscriptionResult
): number {
  return Math.max(
    0,
    Math.trunc(
      transcript.content_duration_in_milliseconds ??
        result.properties?.original_duration_in_milliseconds ??
        0
    )
  );
}

function toTranscriptSegment(input: {
  source_video_id: string;
  index: number;
  begin_ms: number;
  end_ms: number;
  begin_char: number;
  normalized_begin_char: number;
  text: string;
  confidence?: number;
}): TranscriptSegment {
  const normalizedText = normalizeTranscriptText(input.text);

  return {
    segment_id: segmentId(input.source_video_id, input.index),
    index: input.index,
    begin_ms: input.begin_ms,
    end_ms: input.end_ms,
    begin_char: input.begin_char,
    end_char: input.begin_char + charLength(input.text),
    normalized_begin_char: input.normalized_begin_char,
    normalized_end_char: input.normalized_begin_char + charLength(normalizedText),
    text: input.text,
    normalized_text: normalizedText,
    confidence: input.confidence ?? 1
  };
}

export function convertDashScopeTranscriptionToMixlabTranscript(
  input: ConvertDashScopeTranscriptionInput
): MixlabTranscriptArtifact {
  const segments: TranscriptSegment[] = [];
  let beginChar = 0;
  let normalizedBeginChar = 0;
  let maxEndMs = 0;

  for (const transcript of input.result.transcripts ?? []) {
    const fallbackEndMs = transcriptFallbackDurationMs(transcript, input.result);

    if (transcript.sentences && transcript.sentences.length > 0) {
      for (const sentence of transcript.sentences) {
        const text = sentence.text ?? "";

        if (text.trim() === "") {
          continue;
        }

        const segment = toTranscriptSegment({
          source_video_id: input.source_video_id,
          index: segments.length,
          begin_ms: sentenceBeginMs(sentence),
          end_ms: sentenceEndMs(sentence, fallbackEndMs),
          begin_char: beginChar,
          normalized_begin_char: normalizedBeginChar,
          text,
          confidence: sentence.confidence
        });

        segments.push(segment);
        beginChar = segment.end_char;
        normalizedBeginChar = segment.normalized_end_char;
        maxEndMs = Math.max(maxEndMs, segment.end_ms);
      }

      continue;
    }

    const text = transcript.text ?? "";

    if (text.trim() === "") {
      continue;
    }

    const segment = toTranscriptSegment({
      source_video_id: input.source_video_id,
      index: segments.length,
      begin_ms: 0,
      end_ms: fallbackEndMs,
      begin_char: beginChar,
      normalized_begin_char: normalizedBeginChar,
      text
    });

    segments.push(segment);
    beginChar = segment.end_char;
    normalizedBeginChar = segment.normalized_end_char;
    maxEndMs = Math.max(maxEndMs, segment.end_ms);
  }

  const resultDurationMs = Math.trunc(
    input.result.properties?.original_duration_in_milliseconds ?? 0
  );

  return {
    schema_version: "1.0",
    source_video_id: input.source_video_id,
    provider: "dashscope",
    model: input.model,
    generated_at: input.generated_at,
    duration_ms: Math.max(resultDurationMs, maxEndMs),
    full_text: segments.map((segment) => segment.text).join(""),
    segments
  };
}

export function formatSrtTimestamp(milliseconds: number): string {
  const safeMilliseconds = Math.max(0, Math.trunc(milliseconds));
  const hours = Math.floor(safeMilliseconds / 3_600_000);
  const minutes = Math.floor((safeMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((safeMilliseconds % 60_000) / 1_000);
  const millis = safeMilliseconds % 1_000;

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")},${millis
    .toString()
    .padStart(3, "0")}`;
}

export function buildSrtFromTranscriptArtifact(transcript: MixlabTranscriptArtifact): string {
  return transcript.segments
    .map((segment, index) =>
      [
        (index + 1).toString(),
        `${formatSrtTimestamp(segment.begin_ms)} --> ${formatSrtTimestamp(segment.end_ms)}`,
        segment.text,
        ""
      ].join("\n")
    )
    .join("\n");
}

async function parseFetchResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${body}`);
  }

  return response.json();
}

export function createFetchDashScopeHttpClient(
  fetchFn: DashScopeFetch = fetch
): DashScopeTemporaryFileHttpClient {
  return {
    async requestJson(request) {
      const response = await fetchFn(request.url, {
        method: request.method,
        headers: request.headers,
        ...(request.method === "GET" || request.body === undefined
          ? {}
          : { body: JSON.stringify(request.body) })
      });

      return parseFetchResponse(response);
    },
    async getJson(url) {
      const response = await fetchFn(url, {
        method: "GET"
      });

      return parseFetchResponse(response);
    },
    async uploadFile(request) {
      const form = new FormData();

      for (const [key, value] of Object.entries(request.fields)) {
        form.append(key, value);
      }

      form.append("file", await openAsBlob(request.file_path), request.file_name);

      const response = await fetchFn(request.url, {
        method: "POST",
        body: form
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${body}`);
      }
    }
  };
}

function asTaskResponse(value: unknown): DashScopeTaskResponse {
  return value && typeof value === "object" ? (value as DashScopeTaskResponse) : {};
}

function asTemporaryUploadPolicyResponse(value: unknown): DashScopeTemporaryUploadPolicyResponse {
  return value && typeof value === "object" ? (value as DashScopeTemporaryUploadPolicyResponse) : {};
}

function extractTemporaryUploadPolicy(
  response: DashScopeTemporaryUploadPolicyResponse
): DashScopeTemporaryUploadPolicy {
  const data = response.data ?? {};
  const missingFields = [
    "upload_dir",
    "upload_host",
    "oss_access_key_id",
    "policy",
    "signature"
  ].filter((field) => !String(data[field as keyof DashScopeTemporaryUploadPolicy] ?? "").trim());

  if (missingFields.length > 0) {
    throw new Error(`DashScope temporary upload policy missing fields: ${missingFields.join(", ")}`);
  }

  return {
    upload_dir: data.upload_dir ?? "",
    upload_host: data.upload_host ?? "",
    oss_access_key_id: data.oss_access_key_id ?? "",
    policy: data.policy ?? "",
    signature: data.signature ?? "",
    ...(data.x_oss_object_acl ? { x_oss_object_acl: data.x_oss_object_acl } : {}),
    ...(data.x_oss_forbid_overwrite
      ? { x_oss_forbid_overwrite: data.x_oss_forbid_overwrite }
      : {})
  };
}

function safeTemporaryUploadFileName(filePath: string, fileName?: string): string {
  const name = path.basename(fileName?.trim() || filePath);

  if (!name || name === "." || name === "..") {
    throw new Error("temporary upload file_name is required");
  }

  return name;
}

function joinTemporaryObjectKey(uploadDir: string, fileName: string): string {
  return `${uploadDir.replace(/\/+$/g, "")}/${fileName}`;
}

function temporaryOssUrl(objectKey: string): string {
  return `oss://${objectKey}`;
}

export async function uploadDashScopeTemporaryFile(
  input: UploadDashScopeTemporaryFileInput
): Promise<DashScopeTemporaryUploadedFile> {
  const policyResponse = asTemporaryUploadPolicyResponse(
    await input.http.requestJson(
      buildDashScopeGetTemporaryUploadPolicyRequest({
        api_key: input.api_key,
        model: input.model
      })
    )
  );
  const policy = extractTemporaryUploadPolicy(policyResponse);
  const fileName = safeTemporaryUploadFileName(input.local_file_path, input.file_name);
  const objectKey = joinTemporaryObjectKey(policy.upload_dir, fileName);
  const fields: Record<string, string> = {
    key: objectKey,
    OSSAccessKeyId: policy.oss_access_key_id,
    policy: policy.policy,
    Signature: policy.signature,
    success_action_status: "200"
  };

  if (policy.x_oss_object_acl) {
    fields["x-oss-object-acl"] = policy.x_oss_object_acl;
  }

  if (policy.x_oss_forbid_overwrite) {
    fields["x-oss-forbid-overwrite"] = policy.x_oss_forbid_overwrite;
  }

  await input.http.uploadFile({
    url: policy.upload_host,
    fields,
    file_path: input.local_file_path,
    file_name: fileName
  });

  return {
    object_key: objectKey,
    file_url: temporaryOssUrl(objectKey),
    url_mode: "dashscope-temporary-oss"
  };
}

export function createDashScopeTemporaryFileAudioUploader(
  input: CreateDashScopeTemporaryFileAudioUploaderInput
): DashScopeTemporaryFileAudioUploader {
  return {
    async uploadAsrAudio(uploadInput) {
      return uploadDashScopeTemporaryFile({
        api_key: input.api_key,
        model: input.model,
        local_file_path: uploadInput.local_file_path,
        http: input.http
      });
    }
  };
}

function extractTaskId(response: DashScopeTaskResponse): string {
  const taskId = response.output?.task_id;

  if (!taskId || taskId.trim() === "") {
    throw new Error("DashScope ASR submit response did not include output.task_id");
  }

  return taskId;
}

function extractTaskStatus(response: DashScopeTaskResponse): string {
  return response.output?.task_status ?? "";
}

function extractTaskMessage(response: DashScopeTaskResponse): string {
  return response.output?.message ?? response.message ?? "unknown error";
}

function extractTranscriptionUrl(response: DashScopeTaskResponse): string | undefined {
  return response.output?.results?.find((result) => result.transcription_url)?.transcription_url;
}

export async function runDashScopeRecordedAudioAsr(
  input: RunDashScopeRecordedAudioAsrInput
): Promise<DashScopeRecordedAudioAsrResult> {
  const maxPollAttempts = input.max_poll_attempts ?? 60;
  const pollIntervalMs = input.poll_interval_ms ?? 0;
  const sleep = input.sleep ?? ((milliseconds) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  }));

  if (!Number.isFinite(maxPollAttempts) || maxPollAttempts <= 0) {
    throw new Error("max_poll_attempts must be greater than 0");
  }

  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 0) {
    throw new Error("poll_interval_ms must be greater than or equal to 0");
  }

  const submitResponse = asTaskResponse(
    await input.http.requestJson(
      buildDashScopeSubmitTranscriptionRequest({
        api_key: input.api_key,
        file_urls: [input.file_url],
        model: input.model,
        parameters: input.parameters
      })
    )
  );
  const taskId = extractTaskId(submitResponse);
  let completedResponse: DashScopeTaskResponse | undefined;

  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    const queryResponse = asTaskResponse(
      await input.http.requestJson(
        buildDashScopeQueryTaskRequest({
          api_key: input.api_key,
          task_id: taskId
        })
      )
    );
    const status = extractTaskStatus(queryResponse);

    if (status === "SUCCEEDED") {
      completedResponse = queryResponse;
      break;
    }

    if (status === "FAILED") {
      throw new Error(`DashScope ASR task ${taskId} failed: ${extractTaskMessage(queryResponse)}`);
    }

    if (pollIntervalMs > 0 && attempt < maxPollAttempts - 1) {
      await sleep(pollIntervalMs);
    }
  }

  if (!completedResponse) {
    throw new Error(
      `DashScope ASR task ${taskId} did not complete within ${maxPollAttempts} poll attempts`
    );
  }

  const transcriptionUrl = extractTranscriptionUrl(completedResponse);

  if (!transcriptionUrl) {
    throw new Error(`DashScope ASR task ${taskId} completed without transcription_url`);
  }

  const transcriptionResult = (await input.http.getJson(
    transcriptionUrl
  )) as DashScopeTranscriptionResult;
  const transcript = convertDashScopeTranscriptionToMixlabTranscript({
    source_video_id: input.source_video_id,
    model: input.model,
    generated_at: input.generated_at,
    result: transcriptionResult
  });

  return {
    task_id: taskId,
    transcription_url: transcriptionUrl,
    transcript,
    srt: buildSrtFromTranscriptArtifact(transcript)
  };
}
