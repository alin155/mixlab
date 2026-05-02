import { spawnSync } from "node:child_process";
import { mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildFfmpegAudioExtractionPlan,
  resolveFfmpegRuntime,
  type AudioExtractionFormat
} from "../../packages/ffmpeg-core/src/index.ts";

function run(executable: string, args: string[]): void {
  const result = spawnSync(executable, args, {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`${executable} failed:\n${result.stderr}`);
  }
}

const runtime = resolveFfmpegRuntime();
const workdir = await mkdtemp(path.join(os.tmpdir(), "mixlab-ffmpeg-audio-"));
const sourcePath = path.join(workdir, "source-with-audio.mp4");

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
  "6",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  sourcePath
]);

console.log(`Source video: ${sourcePath}`);

for (const format of ["mp3", "wav"] as AudioExtractionFormat[]) {
  const outputPath = path.join(workdir, `audio.${format}`);
  const plan = buildFfmpegAudioExtractionPlan({
    source_path: sourcePath,
    output_path: outputPath,
    output_format: format
  });

  run(runtime.ffmpeg_path, plan.args);

  const outputStat = await stat(outputPath);
  console.log(`${format} audio: ${outputPath} (${outputStat.size} bytes)`);
}

console.log(`Runtime: ${runtime.source}`);
console.log(`Workdir: ${workdir}`);
