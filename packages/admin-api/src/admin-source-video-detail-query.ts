import type {
  PreprocessStatus,
  SourceVideoManifest,
  TranscriptSegment
} from "../../protocol/src/index.ts";
import {
  adminPreprocessJobStageFromManifest,
  type AdminPreprocessJobRecord
} from "./admin-preprocess-jobs-query.ts";
import { fileNameFromRelativePath } from "./admin-source-video-query.ts";

interface TranscriptArtifact {
  full_text?: string;
  segments?: TranscriptSegment[];
}

export interface AdminSourceVideoDetailTranscript {
  full_text: string;
  segment_count: number;
  character_count: number;
}

export interface AdminSourceVideoPublic {
  source_video_id: string;
  title: string;
  file_name: string;
  relative_path: string;
  cover_url: string;
  duration_ms: number;
  file_size: number;
  preprocess_status: PreprocessStatus;
  visible_to_cutters: boolean;
  tags: string[];
  description: string;
  lecturer: string;
  course: string;
  category: string;
  updated_at: string;
  error_stage?: string;
  error_message?: string;
}

export interface AdminSourceVideoDetail {
  source_video: AdminSourceVideoPublic;
  technical: {
    duration_ms: number;
    width: number;
    height: number;
    fps: number;
    codec: string;
    file_size: number;
    content_hash: string;
    relative_path: string;
  };
  visibility: {
    visible_to_cutters: boolean;
    label: string;
    reason: string;
  };
  preprocess: {
    status: PreprocessStatus;
    job_id: string;
    stage: string;
    attempt: number;
    started_at: string;
    completed_at: string;
    failed_at: string;
    error_stage: string;
    error_message: string;
  };
  artifacts: {
    transcript: AdminSourceVideoArtifactDetail;
    subtitles: AdminSourceVideoArtifactDetail;
    cover: AdminSourceVideoArtifactDetail;
    keyframes: AdminSourceVideoArtifactDetail;
    index_version: string;
  };
  transcript: AdminSourceVideoDetailTranscript;
}

export interface AdminSourceVideoArtifactDetail {
  path: string;
  file_path: string;
  exists: boolean;
}

export interface AdminSourceVideoDetailQueryReaders {
  read_source_video_manifest(libraryRoot: string, sourceVideoId: string): Promise<SourceVideoManifest>;
  read_preprocess_job(libraryRoot: string, sourceVideoId: string): Promise<AdminPreprocessJobRecord | null>;
  read_json_file<T>(filePath: string): Promise<T>;
  resolve_artifact_path(input: {
    library_root: string;
    source_video_id: string;
    artifact_path: string;
    fallback_file_name?: string;
  }): string | null;
  file_exists(filePath: string): Promise<boolean>;
  is_not_found_error(error: unknown): boolean;
}

export function defaultAdminSourceVideoCoverSvg(sourceVideoId: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="%23eef1f5"/><rect x="24" y="112" width="272" height="28" rx="5" fill="%23252b34"/><text x="36" y="132" font-family="Arial" font-size="17" fill="%23fff">${sourceVideoId}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

export function adminSourceVideoCoverUrl(manifest: SourceVideoManifest): string {
  return manifest.cover_path
    ? `/api/admin/source-videos/${manifest.source_video_id}/cover`
    : defaultAdminSourceVideoCoverSvg(manifest.source_video_id);
}

export function toAdminSourceVideo(manifest: SourceVideoManifest): AdminSourceVideoPublic {
  return {
    source_video_id: manifest.source_video_id,
    title: manifest.title,
    file_name: fileNameFromRelativePath(manifest.relative_path),
    relative_path: manifest.relative_path,
    cover_url: adminSourceVideoCoverUrl(manifest),
    duration_ms: manifest.duration_ms,
    file_size: manifest.file_size,
    preprocess_status: manifest.preprocess_status,
    visible_to_cutters: manifest.visible_to_cutters,
    tags: manifest.tags ?? [],
    description: manifest.description ?? "",
    lecturer: manifest.lecturer ?? "",
    course: manifest.course ?? "",
    category: manifest.category ?? "",
    updated_at: "",
    ...(manifest.preprocess_status === "failed" ? { error_stage: "", error_message: "" } : {})
  };
}

export function adminSourceVideoVisibilityDetail(manifest: SourceVideoManifest) {
  const visible = manifest.preprocess_status === "ready" && manifest.visible_to_cutters;

  return {
    visible_to_cutters: visible,
    label: visible ? "剪辑师可见" : "剪辑师暂不可见",
    reason: visible
      ? ""
      : manifest.preprocess_status !== "ready"
        ? "视频尚未完成预处理"
        : "管理员尚未开放给剪辑师"
  };
}

export async function readAdminSourceVideoTranscriptSummary(input: {
  library_root: string;
  manifest: SourceVideoManifest;
  resolve_artifact_path: AdminSourceVideoDetailQueryReaders["resolve_artifact_path"];
  read_json_file: AdminSourceVideoDetailQueryReaders["read_json_file"];
  is_not_found_error: AdminSourceVideoDetailQueryReaders["is_not_found_error"];
}): Promise<AdminSourceVideoDetailTranscript> {
  if (!input.manifest.transcript_path.trim()) {
    return { full_text: "", segment_count: 0, character_count: 0 };
  }

  const transcriptPath = input.resolve_artifact_path({
    library_root: input.library_root,
    source_video_id: input.manifest.source_video_id,
    artifact_path: input.manifest.transcript_path,
    fallback_file_name: "transcript.json"
  });

  if (!transcriptPath) {
    return { full_text: "", segment_count: 0, character_count: 0 };
  }

  let artifact: TranscriptArtifact;
  try {
    artifact = await input.read_json_file<TranscriptArtifact>(transcriptPath);
  } catch (error) {
    if (input.is_not_found_error(error)) {
      return { full_text: "", segment_count: 0, character_count: 0 };
    }

    throw error;
  }

  const segments = Array.isArray(artifact.segments) ? artifact.segments : [];
  const joinedSegmentText = segments
    .map((segment) => typeof segment.text === "string" ? segment.text : "")
    .join("");
  const fullText = typeof artifact.full_text === "string" ? artifact.full_text : joinedSegmentText;

  return {
    full_text: fullText,
    segment_count: segments.length,
    character_count: fullText.length
  };
}

async function artifactDetail(input: {
  library_root: string;
  source_video_id: string;
  artifact_path: string;
  fallback_file_name?: string;
  resolve_artifact_path: AdminSourceVideoDetailQueryReaders["resolve_artifact_path"];
  file_exists: AdminSourceVideoDetailQueryReaders["file_exists"];
}): Promise<AdminSourceVideoArtifactDetail> {
  const filePath = input.artifact_path.trim()
    ? input.resolve_artifact_path(input)
    : null;

  return {
    path: input.artifact_path,
    file_path: filePath ?? "",
    exists: filePath ? await input.file_exists(filePath) : false
  };
}

export async function getAdminSourceVideoDetail(input: {
  library_root: string;
  source_video_id: string;
  readers: AdminSourceVideoDetailQueryReaders;
}): Promise<AdminSourceVideoDetail | null> {
  let manifest: SourceVideoManifest;
  try {
    manifest = await input.readers.read_source_video_manifest(input.library_root, input.source_video_id);
  } catch {
    return null;
  }

  const [job, transcript] = await Promise.all([
    input.readers.read_preprocess_job(input.library_root, input.source_video_id),
    readAdminSourceVideoTranscriptSummary({
      library_root: input.library_root,
      manifest,
      resolve_artifact_path: input.readers.resolve_artifact_path,
      read_json_file: input.readers.read_json_file,
      is_not_found_error: input.readers.is_not_found_error
    })
  ]);

  const [transcriptArtifact, subtitlesArtifact, coverArtifact, keyframesArtifact] = await Promise.all([
    artifactDetail({
      library_root: input.library_root,
      source_video_id: input.source_video_id,
      artifact_path: manifest.transcript_path,
      fallback_file_name: "transcript.json",
      resolve_artifact_path: input.readers.resolve_artifact_path,
      file_exists: input.readers.file_exists
    }),
    artifactDetail({
      library_root: input.library_root,
      source_video_id: input.source_video_id,
      artifact_path: manifest.srt_path,
      fallback_file_name: "subtitles.srt",
      resolve_artifact_path: input.readers.resolve_artifact_path,
      file_exists: input.readers.file_exists
    }),
    artifactDetail({
      library_root: input.library_root,
      source_video_id: input.source_video_id,
      artifact_path: manifest.cover_path,
      fallback_file_name: "cover.jpg",
      resolve_artifact_path: input.readers.resolve_artifact_path,
      file_exists: input.readers.file_exists
    }),
    artifactDetail({
      library_root: input.library_root,
      source_video_id: input.source_video_id,
      artifact_path: manifest.keyframes_path,
      fallback_file_name: "keyframes.json",
      resolve_artifact_path: input.readers.resolve_artifact_path,
      file_exists: input.readers.file_exists
    })
  ]);

  return {
    source_video: toAdminSourceVideo(manifest),
    technical: {
      duration_ms: manifest.duration_ms,
      width: manifest.width,
      height: manifest.height,
      fps: manifest.fps,
      codec: manifest.codec,
      file_size: manifest.file_size,
      content_hash: manifest.content_hash,
      relative_path: manifest.relative_path
    },
    visibility: adminSourceVideoVisibilityDetail(manifest),
    preprocess: {
      status: manifest.preprocess_status,
      job_id: `J${manifest.source_video_id.slice(1)}`,
      stage: adminPreprocessJobStageFromManifest(manifest, job),
      attempt: job?.attempt ?? 0,
      started_at: job?.claimed_at ?? "",
      completed_at: job?.completed_at ?? job?.indexed_at ?? "",
      failed_at: job?.failed_at ?? "",
      error_stage: job?.error_stage ?? "",
      error_message: job?.error_message ?? ""
    },
    artifacts: {
      transcript: transcriptArtifact,
      subtitles: subtitlesArtifact,
      cover: coverArtifact,
      keyframes: keyframesArtifact,
      index_version: job?.index_version ?? ""
    },
    transcript
  };
}
