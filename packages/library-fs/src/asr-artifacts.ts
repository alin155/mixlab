import { mkdir, rename, rm, writeFile } from "node:fs/promises";
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

function temporaryArtifactPath(finalPath: string): string {
  const parsed = path.parse(finalPath);
  const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return path.join(parsed.dir, `${parsed.name}.tmp-${nonce}${parsed.ext}`);
}

async function cleanupTemporaryArtifacts(paths: string[]): Promise<void> {
  await Promise.all(paths.map(async (temporaryPath) => {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }));
}

export async function writeAsrTextArtifacts(
  input: WriteAsrTextArtifactsInput
): Promise<AsrTextArtifactPaths> {
  const transcriptPath = videoArtifactRelativePath(input.source_video_id, "transcript.json");
  const srtPath = videoArtifactRelativePath(input.source_video_id, "subtitles.srt");
  const transcriptBytes = jsonBytes(input.transcript_artifact);
  const videoArtifactDir = path.join(input.library_root, ".mixlab-library", "videos", input.source_video_id);
  const absoluteTranscriptPath = path.join(input.library_root, transcriptPath);
  const absoluteSrtPath = path.join(input.library_root, srtPath);
  const temporaryTranscriptPath = temporaryArtifactPath(absoluteTranscriptPath);
  const temporarySrtPath = temporaryArtifactPath(absoluteSrtPath);
  const temporaryPaths = [temporaryTranscriptPath, temporarySrtPath];

  await mkdir(videoArtifactDir, { recursive: true });

  try {
    await writeFile(temporaryTranscriptPath, transcriptBytes);
    await writeFile(temporarySrtPath, input.srt);
    await rename(temporaryTranscriptPath, absoluteTranscriptPath);
    await rename(temporarySrtPath, absoluteSrtPath);
  } catch (error) {
    await cleanupTemporaryArtifacts(temporaryPaths);
    throw error;
  }

  return {
    transcript_path: transcriptPath,
    srt_path: srtPath
  };
}
