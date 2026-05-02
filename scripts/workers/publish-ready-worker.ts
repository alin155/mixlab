import { spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { loadProjectEnv } from "../shared/load-project-env.ts";
import {
  buildFfmpegCoverImagePlan,
  resolveFfmpegRuntime
} from "../../packages/ffmpeg-core/src/index.ts";
import {
  completeReadyVisualArtifacts,
  publishIndexRequiredSourceVideos,
  readAllSourceVideoManifests
} from "../../packages/library-fs/src/index.ts";
import { resolveReadyPublishSourceVideoPath } from "./publish-ready-source-path.ts";

const ENABLE_FLAG = "MIXLAB_ENABLE_READY_PUBLISH_WORKER";

await loadProjectEnv();

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isEnabled(key: string): boolean {
  return optionalTrimmed(process.env[key]) === "1";
}

function parsePositiveIntegerEnv(key: string, fallback: number): number {
  const raw = optionalTrimmed(process.env[key]);

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be greater than 0`);
  }

  return parsed;
}

function run(executable: string, args: string[]): void {
  const result = spawnSync(executable, args, {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`${executable} failed:\n${result.stderr}`);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function buildKeyframesMs(input: {
  duration_ms: number;
  interval_ms: number;
  max_count: number;
}): number[] {
  const durationMs = Math.max(0, Math.trunc(input.duration_ms));

  if (durationMs === 0) {
    return [0];
  }

  const dense: number[] = [];

  for (let cursor = 0; cursor < durationMs; cursor += input.interval_ms) {
    dense.push(cursor);
  }

  dense.push(durationMs);

  if (dense.length <= input.max_count) {
    return Array.from(new Set(dense));
  }

  const sampled = new Set<number>();

  for (let index = 0; index < input.max_count; index += 1) {
    sampled.add(Math.round((durationMs * index) / (input.max_count - 1)));
  }

  return Array.from(sampled).sort((left, right) => left - right);
}

const missingRuntimeEnvKeys = ["MIXLAB_PREPROCESS_LIBRARY_ROOT"].filter(
  (key) => !optionalTrimmed(process.env[key])
);

if (!isEnabled(ENABLE_FLAG)) {
  console.log("Ready publish worker skipped.");
  console.log(
    JSON.stringify(
      {
        reason: `${ENABLE_FLAG}=1 is required before publishing ready source videos`,
        required_enable_flags: [ENABLE_FLAG],
        missing_enable_flags: [ENABLE_FLAG].filter((key) => !isEnabled(key)),
        required_env_keys: ["MIXLAB_PREPROCESS_LIBRARY_ROOT"],
        missing_env_keys: missingRuntimeEnvKeys
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (missingRuntimeEnvKeys.length > 0) {
  console.error("Ready publish worker is enabled, but readiness checks failed.");
  console.error(
    JSON.stringify(
      {
        missing_env_keys: missingRuntimeEnvKeys
      },
      null,
      2
    )
  );
  process.exit(1);
}

const startedAt = new Date().toISOString();
const runtime = resolveFfmpegRuntime();
const libraryRoot = optionalTrimmed(process.env.MIXLAB_PREPROCESS_LIBRARY_ROOT) ?? "";
const libraryId = optionalTrimmed(process.env.MIXLAB_PREPROCESS_LIBRARY_ID) ?? "lib_main_001";
const coverAtMs = parsePositiveIntegerEnv("MIXLAB_READY_COVER_AT_MS", 1_000);
const coverWidth = parsePositiveIntegerEnv("MIXLAB_READY_COVER_WIDTH", 640);
const keyframeIntervalMs = parsePositiveIntegerEnv("MIXLAB_READY_KEYFRAME_INTERVAL_MS", 5_000);
const keyframeMaxCount = parsePositiveIntegerEnv("MIXLAB_READY_KEYFRAME_MAX_COUNT", 60);
const manifests = await readAllSourceVideoManifests(libraryRoot);
const indexRequired = manifests.filter((manifest) => manifest.preprocess_status === "index-required");

console.log("Ready publish worker started.");
console.log(
  JSON.stringify(
    {
      library_root: libraryRoot,
      library_id: libraryId,
      index_required_count: indexRequired.length,
      cover_at_ms: coverAtMs,
      cover_width: coverWidth,
      keyframe_interval_ms: keyframeIntervalMs,
      keyframe_max_count: keyframeMaxCount
    },
    null,
    2
  )
);

const preparedSourceVideoIds: string[] = [];

for (const manifest of indexRequired) {
  const sourceVideoPath = await resolveReadyPublishSourceVideoPath({
    library_root: libraryRoot,
    manifest
  });
  const coverPath = `.mixlab-library/videos/${manifest.source_video_id}/cover.jpg`;
  const absoluteCoverPath = path.join(libraryRoot, coverPath);

  if (!(await fileExists(absoluteCoverPath))) {
    const plan = buildFfmpegCoverImagePlan({
      source_path: sourceVideoPath,
      output_path: absoluteCoverPath,
      at_ms: Math.min(coverAtMs, Math.max(0, manifest.duration_ms - 1)),
      width: coverWidth
    });

    run(runtime.ffmpeg_path, plan.args);
  }

  await completeReadyVisualArtifacts({
    library_root: libraryRoot,
    source_video_id: manifest.source_video_id,
    cover_path: coverPath,
    keyframes_ms: buildKeyframesMs({
      duration_ms: manifest.duration_ms,
      interval_ms: keyframeIntervalMs,
      max_count: keyframeMaxCount
    }),
    now: new Date().toISOString()
  });
  preparedSourceVideoIds.push(manifest.source_video_id);
}

const publishResult = await publishIndexRequiredSourceVideos({
  library_root: libraryRoot,
  library_id: libraryId,
  now: new Date().toISOString()
});

console.log("Ready publish worker completed.");
console.log(
  JSON.stringify(
    {
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      prepared_source_video_ids: preparedSourceVideoIds,
      result: publishResult
    },
    null,
    2
  )
);
