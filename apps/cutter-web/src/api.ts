export interface CutterApiEnvelope<T> {
  schema_version: string;
  data: T;
}

export interface CutterApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

export interface SourceVideoCard {
  source_video_id: string;
  title: string;
  duration_ms: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  file_size?: number;
  relative_path?: string;
  description?: string;
  tags?: string[];
  category?: string;
  course?: string;
  lecturer?: string;
  publish_status?: "ready";
  media_url: string;
  cover_url: string;
  detail_url: string;
  subtitles_url: string;
}

export interface SourceLibraryResponse {
  available_video_count: number;
  videos: SourceVideoCard[];
}

export interface TranscriptSegment {
  segment_id: string;
  begin_ms: number;
  end_ms: number;
  text: string;
}

export interface SourceVideoDetail extends SourceVideoCard {
  transcript: {
    full_text: string;
    segments: TranscriptSegment[];
  };
  keyframes: {
    keyframes_ms: number[];
  };
}

export interface SearchHitSegment extends TranscriptSegment {
  match_ranges?: Array<[number, number]>;
}

export interface SearchGroup {
  source_video_id: string;
  title: string;
  duration_ms?: number;
  hit_count: number;
  best_excerpt: string;
  hit_segments: SearchHitSegment[];
  media_url?: string;
  cover_url?: string;
  detail_url?: string;
  subtitles_url?: string;
}

export interface SearchResponse {
  query: string;
  normalized_query: string;
  groups: SearchGroup[];
}

export interface LocalClip {
  local_clip_id: string;
  title: string;
  source_video_id?: string;
  source_title?: string;
  begin_ms?: number;
  end_ms?: number;
  duration_ms?: number;
  selected_text?: string;
  media_url: string;
  detail_url: string;
}

export interface LocalClipCatalog {
  local_clip_count: number;
  clips: LocalClip[];
}

export interface CreateLocalClipRequest {
  source_video_id: string;
  start_segment_id: string;
  end_segment_id: string;
  pre_roll_ms?: number;
  post_roll_ms?: number;
  cut_mode?: "copy" | "smart" | "precise";
  title?: string;
}

export interface CutterApiClientInput {
  base_url: string;
  fetch?: typeof fetch;
}

export class CutterApiError extends Error {
  readonly name = "CutterApiError";
  readonly status: number;
  readonly code: string;

  constructor(input: { status: number; code: string; message: string }) {
    super(input.message);
    this.status = input.status;
    this.code = input.code;
  }
}

export interface CutterApiClient {
  listSourceLibrary(): Promise<SourceLibraryResponse>;
  getSourceVideoDetail(sourceVideoId: string): Promise<SourceVideoDetail>;
  searchSourceLibrary(query: string, limit?: number): Promise<SearchResponse>;
  listLocalClips(): Promise<LocalClipCatalog>;
  getLocalClipDetail(localClipId: string): Promise<LocalClip>;
  createLocalClip(request: CreateLocalClipRequest): Promise<LocalClip>;
  resolveApiUrl(pathOrUrl: string): string;
}

export function normalizeApiBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function appendPath(baseUrl: string, path: string): string {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  return normalizedBaseUrl ? `${normalizedBaseUrl}${path}` : path;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function requestEnvelope<T>(
  fetchImpl: typeof fetch,
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetchImpl(url, init);
  const body = await readJson<CutterApiEnvelope<T> | CutterApiErrorBody>(response);

  if (!response.ok) {
    const errorBody = body as CutterApiErrorBody;
    throw new CutterApiError({
      status: response.status,
      code: errorBody.error?.code ?? "api_error",
      message: errorBody.error?.message ?? `Request failed with status ${response.status}`
    });
  }

  return (body as CutterApiEnvelope<T>).data;
}

export function createCutterApiClient(input: CutterApiClientInput): CutterApiClient {
  const fetchImpl = input.fetch ?? fetch;

  return {
    listSourceLibrary() {
      return requestEnvelope<SourceLibraryResponse>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/source-library")
      );
    },

    getSourceVideoDetail(sourceVideoId: string) {
      return requestEnvelope<SourceVideoDetail>(
        fetchImpl,
        appendPath(input.base_url, `/cutter/source-videos/${encodeURIComponent(sourceVideoId)}`)
      );
    },

    searchSourceLibrary(query: string, limit = 20) {
      const params = new URLSearchParams({
        query,
        limit: String(limit)
      });
      return requestEnvelope<SearchResponse>(
        fetchImpl,
        appendPath(input.base_url, `/cutter/source-search?${params.toString()}`)
      );
    },

    listLocalClips() {
      return requestEnvelope<LocalClipCatalog>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/local-clips")
      );
    },

    getLocalClipDetail(localClipId: string) {
      return requestEnvelope<LocalClip>(
        fetchImpl,
        appendPath(input.base_url, `/cutter/local-clips/${encodeURIComponent(localClipId)}`)
      );
    },

    createLocalClip(request: CreateLocalClipRequest) {
      return requestEnvelope<LocalClip>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/local-clips"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            source_video_id: request.source_video_id,
            start_segment_id: request.start_segment_id,
            end_segment_id: request.end_segment_id,
            pre_roll_ms: request.pre_roll_ms ?? 0,
            post_roll_ms: request.post_roll_ms ?? 0,
            cut_mode: request.cut_mode ?? "smart",
            ...(request.title ? { title: request.title } : {})
          })
        }
      );
    },

    resolveApiUrl(pathOrUrl: string) {
      if (/^https?:\/\//.test(pathOrUrl)) {
        return pathOrUrl;
      }

      return appendPath(input.base_url, pathOrUrl);
    }
  };
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
