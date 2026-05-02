export const PREPROCESS_STATUSES = [
  "unprocessed",
  "queued",
  "processing",
  "ready",
  "failed",
  "index-required"
] as const;

export type PreprocessStatus = (typeof PREPROCESS_STATUSES)[number];

export interface LibraryCounts {
  video_count: number;
  ready_video_count: number;
  processing_video_count: number;
  queued_video_count: number;
  unprocessed_video_count: number;
  failed_video_count: number;
  index_required_video_count: number;
}

export interface SourceVideoManifest {
  source_video_id: string;
  title: string;
  relative_path: string;
  logical_uri: string;
  duration_ms: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  file_size: number;
  content_hash: string;
  preprocess_status: PreprocessStatus;
  visible_to_cutters: boolean;
  transcript_path: string;
  srt_path: string;
  keyframes_path: string;
  cover_path: string;
  description?: string;
  tags?: string[];
  lecturer?: string;
  course?: string;
  category?: string;
}

export type CutMode = "copy" | "smart" | "precise";

export interface SourceVideoPublicMetadata {
  description?: string;
  tags?: string[];
  lecturer?: string;
  course?: string;
  category?: string;
}

export interface LocalClipManifest {
  schema_version: "1.0";
  local_clip_id: string;
  title: string;
  source_video_id: string;
  source_title: string;
  source_relative_path: string;
  begin_ms: number;
  end_ms: number;
  duration_ms: number;
  selected_text: string;
  cut_mode: CutMode;
  media_path: string;
  created_at: string;
}

export interface ExportClipManifest {
  export_clip_id: string;
  library_id: string;
  source_video_id: string;
  source_title: string;
  begin_ms: number;
  end_ms: number;
  selected_text: string;
  output_file: string;
  created_at: string;
  cut_mode: CutMode;
}

export interface TranscriptSegment {
  segment_id: string;
  index: number;
  begin_ms: number;
  end_ms: number;
  begin_char: number;
  end_char: number;
  normalized_begin_char: number;
  normalized_end_char: number;
  text: string;
  normalized_text: string;
  confidence: number;
}

export interface SegmentSpanSelection {
  source_video_id: string;
  start_segment_id: string;
  end_segment_id: string;
  begin_ms: number;
  end_ms: number;
  pre_roll_ms: number;
  post_roll_ms: number;
  selected_text: string;
}

export interface IndexPackageManifest {
  index_version: string;
  library_id: string;
  created_at: string;
  ready_video_count: number;
  source_video_ids: string[];
  schema_version: string;
}

export interface IndexCurrentPointer {
  library_id: string;
  current_version: string;
  updated_at: string;
}

export interface ReadyPublicationCandidate {
  manifest: SourceVideoManifest;
  artifacts: {
    transcript: boolean;
    srt: boolean;
    keyframes: boolean;
    cover: boolean;
    source_video_manifest: boolean;
  };
  index_version: string;
  index_searchable: boolean;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface LibraryCountValidationResult {
  ok: boolean;
  expected_total: number;
  actual_total: number;
  message: string;
}
