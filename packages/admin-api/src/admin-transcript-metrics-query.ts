import type { SourceVideoManifest } from "../../protocol/src/index.ts";

export interface AdminTranscriptMetrics {
  transcript_video_count: number;
  character_count: number;
  segment_count: number;
}

export interface AdminTranscriptIndexMetadata {
  source_video_count: number;
  segment_count: number;
}

export interface AdminTranscriptSummary {
  full_text: string;
  character_count: number;
  segment_count: number;
}

export interface AdminTranscriptMetricsQueryInput {
  library_root: string;
  manifests: SourceVideoManifest[];
  full_transcript_metrics_max_manifests: number;
  read_current_index_metadata(libraryRoot: string): Promise<AdminTranscriptIndexMetadata | null>;
  read_transcript_summary(
    libraryRoot: string,
    manifest: SourceVideoManifest
  ): Promise<AdminTranscriptSummary>;
}

export async function getAdminTranscriptMetrics(
  input: AdminTranscriptMetricsQueryInput
): Promise<AdminTranscriptMetrics> {
  if (input.manifests.length > input.full_transcript_metrics_max_manifests) {
    const indexMetadata = await input.read_current_index_metadata(input.library_root);

    if (indexMetadata) {
      return {
        transcript_video_count: indexMetadata.source_video_count,
        character_count: 0,
        segment_count: indexMetadata.segment_count
      };
    }
  }

  let characterCount = 0;
  let segmentCount = 0;
  let transcriptVideoCount = 0;

  for (const manifest of input.manifests) {
    const transcript = await input.read_transcript_summary(input.library_root, manifest);
    if (transcript.segment_count > 0 || transcript.full_text.length > 0) {
      transcriptVideoCount += 1;
      characterCount += transcript.character_count;
      segmentCount += transcript.segment_count;
    }
  }

  return {
    transcript_video_count: transcriptVideoCount,
    character_count: characterCount,
    segment_count: segmentCount
  };
}
