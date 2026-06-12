import { fileURLToPath } from "node:url";
import { runSearchdConcurrencySmoke } from "./searchd-concurrency.ts";

const VIDEO_COUNT_ENV = "MIXLAB_SEARCHD_CONCURRENCY_VIDEOS";
const SEGMENTS_PER_VIDEO_ENV = "MIXLAB_SEARCHD_CONCURRENCY_SEGMENTS_PER_VIDEO";
const REPORT_PATH_ENV = "MIXLAB_SEARCHD_CONCURRENCY_REPORT_PATH";
const RUN_ROOT_ENV = "MIXLAB_SEARCHD_CONCURRENCY_RUN_ROOT";
const REHEARSAL_REPORT_PATH_ENV = "MIXLAB_SEARCHD_NAS_REHEARSAL_REPORT_PATH";
const REHEARSAL_RUN_ROOT_ENV = "MIXLAB_SEARCHD_NAS_REHEARSAL_RUN_ROOT";

const MIN_FINAL_VIDEO_COUNT = 2000;
const MIN_FINAL_TRANSCRIPT_SEGMENT_COUNT = 48000;
const DEFAULT_FINAL_SEGMENTS_PER_VIDEO = 24;
const DEFAULT_REPORT_PATH = "captures/50-editor-report.json";

function positiveIntegerFromEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function configureSearchdNasRehearsalEnv(env: NodeJS.ProcessEnv = process.env): void {
  const videoCount = positiveIntegerFromEnv(env, VIDEO_COUNT_ENV, MIN_FINAL_VIDEO_COUNT);
  const segmentsPerVideo = positiveIntegerFromEnv(env, SEGMENTS_PER_VIDEO_ENV, DEFAULT_FINAL_SEGMENTS_PER_VIDEO);
  const transcriptSegmentCount = videoCount * segmentsPerVideo;

  if (videoCount < MIN_FINAL_VIDEO_COUNT) {
    throw new Error(`${VIDEO_COUNT_ENV} must be at least ${MIN_FINAL_VIDEO_COUNT} for ACC-009 rehearsal`);
  }
  if (transcriptSegmentCount < MIN_FINAL_TRANSCRIPT_SEGMENT_COUNT) {
    throw new Error(
      `${VIDEO_COUNT_ENV} * ${SEGMENTS_PER_VIDEO_ENV} must be at least ${MIN_FINAL_TRANSCRIPT_SEGMENT_COUNT} for ACC-009 rehearsal`
    );
  }

  env[VIDEO_COUNT_ENV] = String(videoCount);
  env[SEGMENTS_PER_VIDEO_ENV] = String(segmentsPerVideo);
  env[REPORT_PATH_ENV] = env[REPORT_PATH_ENV]?.trim()
    || env[REHEARSAL_REPORT_PATH_ENV]?.trim()
    || DEFAULT_REPORT_PATH;

  const runRoot = env[RUN_ROOT_ENV]?.trim() || env[REHEARSAL_RUN_ROOT_ENV]?.trim();
  if (runRoot) {
    env[RUN_ROOT_ENV] = runRoot;
  }
}

export async function runSearchdNasRehearsal(): Promise<void> {
  configureSearchdNasRehearsalEnv();
  await runSearchdConcurrencySmoke();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void runSearchdNasRehearsal().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
