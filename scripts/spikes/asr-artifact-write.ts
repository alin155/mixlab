import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runDashScopeRecordedAudioAsr } from "../../packages/asr-core/src/index.ts";
import {
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  scanSourceVideos,
  writeAsrTextArtifacts
} from "../../packages/library-fs/src/index.ts";

async function writeDummyVideo(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "mixlab-spike-video-bytes");
}

async function main(): Promise<void> {
  const libraryRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-asr-artifact-write-"));

  await writeDummyVideo(path.join(libraryRoot, "source-videos", "课程", "老板现金流.mp4"));
  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-01T00:00:00Z"
  });

  const job = await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-local-1",
    now: "2026-05-01T00:01:00Z"
  });

  if (!job) {
    throw new Error("expected one unprocessed source video to claim");
  }

  const asr = await runDashScopeRecordedAudioAsr({
    api_key: "sk-local-spike-placeholder",
    model: "paraformer-v2",
    source_video_id: job.source_video_id,
    file_url: "https://example.com/audio.mp3",
    generated_at: "2026-05-01T00:08:00Z",
    http: {
      async requestJson(request) {
        if (request.url.endsWith("/transcription")) {
          return {
            output: {
              task_id: "task-local-spike"
            }
          };
        }

        return {
          output: {
            task_status: "SUCCEEDED",
            results: [
              {
                transcription_url: "https://example.com/transcription.json"
              }
            ]
          }
        };
      },
      async getJson() {
        return {
          properties: {
            original_duration_in_milliseconds: 3_000
          },
          transcripts: [
            {
              text: "现金流，是企业的血液。",
              sentences: [
                {
                  begin_time: 0,
                  end_time: 3_000,
                  text: "现金流，是企业的血液。"
                }
              ]
            }
          ]
        };
      }
    }
  });

  const asrPaths = await writeAsrTextArtifacts({
    library_root: libraryRoot,
    source_video_id: job.source_video_id,
    transcript_artifact: asr.transcript,
    srt: asr.srt
  });

  await completePreprocessArtifacts({
    library_root: libraryRoot,
    source_video_id: job.source_video_id,
    now: "2026-05-01T00:10:00Z",
    media: {
      duration_ms: asr.transcript.duration_ms,
      width: 1920,
      height: 1080,
      fps: 25,
      codec: "h264",
      content_hash: "sha256:spike"
    },
    artifacts: {
      ...asrPaths,
      keyframes_path: `.mixlab-library/videos/${job.source_video_id}/keyframes`,
      cover_path: `.mixlab-library/videos/${job.source_video_id}/cover.jpg`
    }
  });

  const manifestPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "videos",
    job.source_video_id,
    "source-video.json"
  );
  const transcriptPath = path.join(libraryRoot, asrPaths.transcript_path);
  const srtPath = path.join(libraryRoot, asrPaths.srt_path);

  console.log(`Library root: ${libraryRoot}`);
  console.log("\nASR result summary:");
  console.log(
    JSON.stringify(
      {
        task_id: asr.task_id,
        transcription_url: asr.transcription_url,
        transcript_path: asrPaths.transcript_path,
        srt_path: asrPaths.srt_path,
        segment_count: asr.transcript.segments.length
      },
      null,
      2
    )
  );
  console.log("\nsource-video.json after ASR artifacts:");
  console.log((await readFile(manifestPath, "utf8")).trim());
  console.log("\ntranscript.json:");
  console.log((await readFile(transcriptPath, "utf8")).trim());
  console.log("\nsubtitles.srt:");
  console.log((await readFile(srtPath, "utf8")).trim());
}

await main();
