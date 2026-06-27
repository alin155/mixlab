import { statfs } from "node:fs/promises";
import { readAllSourceVideoManifests } from "./preprocess-lifecycle.ts";

export const DEFAULT_PREPROCESS_DISK_BLOCK_USAGE_PERCENT = 92;

export type PreprocessSafetyLevel = "healthy" | "attention" | "blocked";
export type PreprocessSafetyBlockerCode =
  | "library-root-unavailable"
  | "disk-space-blocked"
  | "processing-needs-recovery";

export interface PreprocessSafetyBlocker {
  code: PreprocessSafetyBlockerCode;
  message: string;
  source_video_ids: string[];
}

export interface PreprocessSafetyDisk {
  total_bytes: number;
  available_bytes: number;
  used_bytes: number;
  usage_percent: number;
  block_usage_percent: number;
  status: PreprocessSafetyLevel;
  last_error: string;
}

export interface PreprocessSafetyProcessing {
  checked: boolean;
  processing_count: number;
  source_video_ids: string[];
}

export interface PreprocessSafetyStatus {
  checked_at: string;
  safe_to_start: boolean;
  status: PreprocessSafetyLevel;
  disk: PreprocessSafetyDisk;
  processing: PreprocessSafetyProcessing;
  blockers: PreprocessSafetyBlocker[];
}

export interface InspectPreprocessSafetyInput {
  library_root: string;
  now?: string;
  disk_block_usage_percent?: number;
  include_processing_guard?: boolean;
  processing_sample_limit?: number;
  processing_source_video_ids?: string[];
}

function normalizePercent(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PREPROCESS_DISK_BLOCK_USAGE_PERCENT;
  }

  return Math.min(100, Math.max(1, Math.round(value)));
}

function diskStatus(input: {
  usage_percent: number;
  block_usage_percent: number;
  last_error: string;
}): PreprocessSafetyLevel {
  if (input.last_error || input.usage_percent >= input.block_usage_percent) {
    return "blocked";
  }

  if (input.usage_percent >= Math.max(1, input.block_usage_percent - 5)) {
    return "attention";
  }

  return "healthy";
}

async function inspectDisk(input: {
  library_root: string;
  block_usage_percent: number;
}): Promise<PreprocessSafetyDisk> {
  try {
    const stats = await statfs(input.library_root);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const availableBytes = Number(stats.bavail) * Number(stats.bsize);
    const usedBytes = Math.max(0, totalBytes - availableBytes);
    const usagePercent = totalBytes > 0
      ? Math.round((usedBytes / totalBytes) * 100)
      : 100;

    return {
      total_bytes: totalBytes,
      available_bytes: availableBytes,
      used_bytes: usedBytes,
      usage_percent: usagePercent,
      block_usage_percent: input.block_usage_percent,
      status: diskStatus({
        usage_percent: usagePercent,
        block_usage_percent: input.block_usage_percent,
        last_error: ""
      }),
      last_error: ""
    };
  } catch (error) {
    return {
      total_bytes: 0,
      available_bytes: 0,
      used_bytes: 0,
      usage_percent: 100,
      block_usage_percent: input.block_usage_percent,
      status: "blocked",
      last_error: error instanceof Error ? error.message : "unknown error"
    };
  }
}

async function inspectProcessing(input: {
  library_root: string;
  checked: boolean;
  sample_limit: number;
  source_video_ids?: string[];
}): Promise<PreprocessSafetyProcessing> {
  if (!input.checked) {
    return {
      checked: false,
      processing_count: 0,
      source_video_ids: []
    };
  }

  if (input.source_video_ids) {
    const sourceVideoIds = [...new Set(input.source_video_ids)]
      .filter((sourceVideoId) => /^V\d{6}$/.test(sourceVideoId))
      .sort((left, right) => left.localeCompare(right));

    return {
      checked: true,
      processing_count: sourceVideoIds.length,
      source_video_ids: sourceVideoIds.slice(0, input.sample_limit)
    };
  }

  const manifests = await readAllSourceVideoManifests(input.library_root);
  const sourceVideoIds = manifests
    .filter((manifest) => manifest.preprocess_status === "processing")
    .map((manifest) => manifest.source_video_id)
    .sort((left, right) => left.localeCompare(right));

  return {
    checked: true,
    processing_count: sourceVideoIds.length,
    source_video_ids: sourceVideoIds.slice(0, input.sample_limit)
  };
}

function worstSafetyStatus(levels: PreprocessSafetyLevel[]): PreprocessSafetyLevel {
  if (levels.includes("blocked")) {
    return "blocked";
  }

  if (levels.includes("attention")) {
    return "attention";
  }

  return "healthy";
}

export async function inspectPreprocessSafety(
  input: InspectPreprocessSafetyInput
): Promise<PreprocessSafetyStatus> {
  const blockUsagePercent = normalizePercent(input.disk_block_usage_percent);
  const disk = await inspectDisk({
    library_root: input.library_root,
    block_usage_percent: blockUsagePercent
  });
  const processing = await inspectProcessing({
    library_root: input.library_root,
    checked: input.include_processing_guard ?? true,
    sample_limit: input.processing_sample_limit ?? 10,
    source_video_ids: input.processing_source_video_ids
  });
  const blockers: PreprocessSafetyBlocker[] = [];

  if (disk.last_error) {
    blockers.push({
      code: "library-root-unavailable",
      message: "公共素材库路径不可用，无法确认磁盘空间。",
      source_video_ids: []
    });
  } else if (disk.status === "blocked") {
    blockers.push({
      code: "disk-space-blocked",
      message: `公共素材库磁盘空间不足：已使用 ${disk.usage_percent}%（门禁 ${disk.block_usage_percent}%），请先释放空间。`,
      source_video_ids: []
    });
  }

  if (processing.checked && processing.processing_count > 0) {
    blockers.push({
      code: "processing-needs-recovery",
      message: `存在 ${processing.processing_count} 个处理中任务需要先恢复：${processing.source_video_ids.join(", ")}`,
      source_video_ids: processing.source_video_ids
    });
  }

  return {
    checked_at: input.now ?? new Date().toISOString(),
    safe_to_start: blockers.length === 0,
    status: blockers.length > 0 ? "blocked" : worstSafetyStatus([disk.status]),
    disk,
    processing,
    blockers
  };
}

export function assertPreprocessSafeToStart(status: PreprocessSafetyStatus): void {
  if (status.safe_to_start) {
    return;
  }

  throw new Error(status.blockers.map((blocker) => blocker.message).join(" "));
}
