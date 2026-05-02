import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildFfprobeSourceMetadataPlan,
  parseFfprobeSourceMetadata,
  resolveFfmpegRuntime
} from "../../packages/ffmpeg-core/src/index.ts";
import {
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  hashFileSha256,
  scanSourceVideos
} from "../../packages/library-fs/src/index.ts";
import { runSourceVideoTextPreprocess } from "../../packages/preprocess-core/src/index.ts";

function run(executable: string, args: string[]): void {
  const result = spawnSync(executable, args, {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`${executable} failed:\n${result.stderr}`);
  }
}

function runForStdout(executable: string, args: string[]): string {
  const result = spawnSync(executable, args, {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`${executable} failed:\n${result.stderr}`);
  }

  return result.stdout;
}

const runtime = resolveFfmpegRuntime();
const libraryRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-preprocess-text-"));
const sourceVideoPath = path.join(libraryRoot, "source-videos", "课程", "老板现金流.mp4");

await mkdir(path.dirname(sourceVideoPath), { recursive: true });

run(runtime.ffmpeg_path, [
  "-hide_banner",
  "-y",
  "-f",
  "lavfi",
  "-i",
  "testsrc=size=1280x720:rate=25",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=1000:sample_rate=48000",
  "-t",
  "4",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  sourceVideoPath
]);

await scanSourceVideos({
  library_root: libraryRoot,
  library_id: "lib_main_001",
  library_name: "主素材库",
  now: "2026-05-02T00:00:00Z"
});

const job = await claimNextPreprocessJob({
  library_root: libraryRoot,
  worker_id: "worker-local-1",
  now: "2026-05-02T00:01:00Z"
});

if (!job) {
  throw new Error("expected one unprocessed source video to claim");
}

const metadataPlan = buildFfprobeSourceMetadataPlan({
  source_path: sourceVideoPath
});
const mediaMetadata = parseFfprobeSourceMetadata(
  runForStdout(runtime.ffprobe_path, metadataPlan.args)
);
const contentHash = await hashFileSha256(sourceVideoPath);

const textPreprocess = await runSourceVideoTextPreprocess({
  library_root: libraryRoot,
  library_id: "lib_main_001",
  source_video_id: job.source_video_id,
  source_video_path: sourceVideoPath,
  ffmpeg_path: runtime.ffmpeg_path,
  audio_mode: "mp3_16k_mono_64k",
  oss_object_key_prefix: "mixlab",
  now: "2026-05-02T00:02:00Z",
  command_runner: {
    async run(executable, args) {
      run(executable, args);
    }
  },
  uploader: {
    async uploadAsrAudio(input) {
      return {
        object_key: input.object_key,
        file_url: `https://oss.example.com/${input.object_key}`,
        url_mode: "signed-url"
      };
    }
  },
  asr_http: {
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
          original_duration_in_milliseconds: 4_000
        },
        transcripts: [
          {
            text: "现金流，是企业的血液。",
            sentences: [
              {
                begin_time: 0,
                end_time: 4_000,
                text: "现金流，是企业的血液。"
              }
            ]
          }
        ]
      };
    }
  },
  asr: {
    api_key: "sk-local-placeholder",
    model: "paraformer-v2"
  }
});

await completePreprocessArtifacts({
  library_root: libraryRoot,
  source_video_id: job.source_video_id,
  now: "2026-05-02T00:05:00Z",
  media: {
    duration_ms: mediaMetadata.duration_ms,
    width: mediaMetadata.width,
    height: mediaMetadata.height,
    fps: mediaMetadata.fps,
    codec: mediaMetadata.codec,
    content_hash: contentHash
  },
  artifacts: {
    transcript_path: textPreprocess.transcript_path,
    srt_path: textPreprocess.srt_path,
    keyframes_path: "",
    cover_path: ""
  }
});

const manifestPath = path.join(
  libraryRoot,
  ".mixlab-library",
  "videos",
  job.source_video_id,
  "source-video.json"
);

console.log(`Library root: ${libraryRoot}`);
console.log("\nText preprocess result:");
console.log(JSON.stringify(textPreprocess, null, 2));
console.log("\nReal source media metadata:");
console.log(JSON.stringify({ ...mediaMetadata, content_hash: contentHash }, null, 2));
console.log("\nsource-video.json after completion:");
console.log((await readFile(manifestPath, "utf8")).trim());
console.log("\nNote: FFmpeg and ffprobe were real; OSS and DashScope were fake adapters.");
