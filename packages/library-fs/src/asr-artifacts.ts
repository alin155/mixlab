import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface WriteAsrTextArtifactsInput {
  library_root: string;
  source_video_id: string;
  transcript_artifact: unknown;
  srt: string;
}

export interface AsrTextArtifactPaths {
  transcript_path: string;
  srt_path: string;
}

function videoArtifactRelativePath(sourceVideoId: string, fileName: string): string {
  return `.mixlab-library/videos/${sourceVideoId}/${fileName}`;
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function writeAsrTextArtifacts(
  input: WriteAsrTextArtifactsInput
): Promise<AsrTextArtifactPaths> {
  const transcriptPath = videoArtifactRelativePath(input.source_video_id, "transcript.json");
  const srtPath = videoArtifactRelativePath(input.source_video_id, "subtitles.srt");

  await mkdir(path.join(input.library_root, ".mixlab-library", "videos", input.source_video_id), {
    recursive: true
  });
  await writeFile(path.join(input.library_root, transcriptPath), jsonBytes(input.transcript_artifact));
  await writeFile(path.join(input.library_root, srtPath), input.srt);

  return {
    transcript_path: transcriptPath,
    srt_path: srtPath
  };
}
