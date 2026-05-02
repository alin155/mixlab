import path from "node:path";
import type { SourceVideoTextPreprocessResult } from "./index.ts";

export interface BuildPreprocessBatchPlanInput {
  source_file_paths: string[];
  source_video_id_prefix: string;
  file_names?: string[];
  limit?: number;
}

export interface PreprocessBatchPlanItem {
  source_video_id: string;
  source_video_path: string;
  file_name: string;
}

export interface RunSourceVideoTextPreprocessBatchInput {
  plan: PreprocessBatchPlanItem[];
  now_ms?: () => number;
  process_item(item: PreprocessBatchPlanItem): Promise<SourceVideoTextPreprocessResult>;
}

export interface SourceVideoTextPreprocessBatchSuccess {
  status: "succeeded";
  source_video_id: string;
  source_video_path: string;
  file_name: string;
  elapsed_ms: number;
  result: SourceVideoTextPreprocessResult;
}

export interface SourceVideoTextPreprocessBatchFailure {
  status: "failed";
  source_video_id: string;
  source_video_path: string;
  file_name: string;
  elapsed_ms: number;
  error_message: string;
}

export type SourceVideoTextPreprocessBatchItemResult =
  | SourceVideoTextPreprocessBatchSuccess
  | SourceVideoTextPreprocessBatchFailure;

export interface SourceVideoTextPreprocessBatchResult {
  total_count: number;
  succeeded_count: number;
  failed_count: number;
  items: SourceVideoTextPreprocessBatchItemResult[];
}

const SOURCE_VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v"]);

export function isSupportedSourceVideoFileName(fileName: string): boolean {
  if (fileName.startsWith("._")) {
    return false;
  }

  return SOURCE_VIDEO_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function assertPositiveLimit(limit: number | undefined): void {
  if (limit === undefined) {
    return;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be greater than 0");
  }
}

export function buildPreprocessBatchPlan(
  input: BuildPreprocessBatchPlanInput
): PreprocessBatchPlanItem[] {
  assertPositiveLimit(input.limit);

  const selectedFileNames = new Set(input.file_names);
  const filtered = input.source_file_paths
    .map((sourceFilePath) => ({
      source_video_path: sourceFilePath,
      file_name: path.basename(sourceFilePath)
    }))
    .filter((item) => isSupportedSourceVideoFileName(item.file_name))
    .filter((item) => selectedFileNames.size === 0 || selectedFileNames.has(item.file_name))
    .sort((left, right) => left.file_name.localeCompare(right.file_name));
  const limited = input.limit ? filtered.slice(0, input.limit) : filtered;

  return limited.map((item, index) => ({
    source_video_id: `${input.source_video_id_prefix}_${String(index + 1).padStart(3, "0")}`,
    source_video_path: item.source_video_path,
    file_name: item.file_name
  }));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function runSourceVideoTextPreprocessBatch(
  input: RunSourceVideoTextPreprocessBatchInput
): Promise<SourceVideoTextPreprocessBatchResult> {
  const nowMs = input.now_ms ?? Date.now;
  const items: SourceVideoTextPreprocessBatchItemResult[] = [];

  for (const item of input.plan) {
    const startedAtMs = nowMs();

    try {
      const result = await input.process_item(item);
      items.push({
        status: "succeeded",
        source_video_id: item.source_video_id,
        source_video_path: item.source_video_path,
        file_name: item.file_name,
        elapsed_ms: nowMs() - startedAtMs,
        result
      });
    } catch (error) {
      items.push({
        status: "failed",
        source_video_id: item.source_video_id,
        source_video_path: item.source_video_path,
        file_name: item.file_name,
        elapsed_ms: nowMs() - startedAtMs,
        error_message: errorMessage(error)
      });
    }
  }

  const succeededCount = items.filter((item) => item.status === "succeeded").length;

  return {
    total_count: input.plan.length,
    succeeded_count: succeededCount,
    failed_count: items.length - succeededCount,
    items
  };
}
