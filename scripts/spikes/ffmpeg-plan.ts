import { spawnSync } from "node:child_process";
import { buildFfmpegCutPlan, resolveFfmpegRuntime, type CutMode } from "../../packages/ffmpeg-core/src/index.ts";

function commandExists(command: string): boolean {
  const result = spawnSync(command, ["-version"], {
    encoding: "utf8"
  });

  return result.status === 0;
}

const modes: CutMode[] = ["copy", "smart", "precise"];

const runtime = resolveFfmpegRuntime();

console.log("FFmpeg availability:");
console.log(`  system ffmpeg: ${commandExists("ffmpeg") ? "available" : "missing"}`);
console.log(`  system ffprobe: ${commandExists("ffprobe") ? "available" : "missing"}`);
console.log(`  selected runtime: ${runtime.source}`);
console.log(`  selected ffmpeg: ${runtime.ffmpeg_path}`);
console.log(`  selected ffprobe: ${runtime.ffprobe_path}`);

for (const mode of modes) {
  const plan = buildFfmpegCutPlan({
    source_path: "/path/to/source-videos/课程/老板现金流课程.mp4",
    output_path: `/path/to/workspace/export-clips/001-${mode}.mp4`,
    begin_ms: 10_000,
    end_ms: 45_000,
    cut_mode: mode
  });

  console.log(`\n[${mode}]`);
  console.log([plan.executable, ...plan.args].join(" "));
}

console.log("\nNote: This spike prints command strategy only. Use spike:ffmpeg-real-cut for bundled FFmpeg validation.");
