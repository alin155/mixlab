import { statfs } from "node:fs/promises";
import type {
  LibraryCounts,
  PreprocessStatus,
  SourceVideoManifest
} from "../../protocol/src/index.ts";

export interface AdminLibraryStatusManifest extends LibraryCounts {
  library_id?: string;
  name?: string;
  version?: string;
  updated_at?: string;
}

export interface GetAdminLibraryStatusDeps {
  read_library_manifest(libraryRoot: string): Promise<AdminLibraryStatusManifest | null>;
  read_source_video_manifests(libraryRoot: string): Promise<SourceVideoManifest[]>;
  read_current_index_version(libraryRoot: string): Promise<string>;
  read_primary_source_videos_path(libraryRoot: string): Promise<string>;
  mixlab_library_path(libraryRoot: string): string;
  disk_usage?: (libraryRoot: string) => Promise<{ total: number; available: number }>;
  on_non_ready_counts_from_manifest?: (libraryRoot: string, counts: LibraryCounts) => void;
}

export interface GetAdminLibraryStatusInput {
  library_root: string;
  library_id?: string;
  library_name?: string;
  now?: () => string;
  deps: GetAdminLibraryStatusDeps;
}

export function countAdminLibraryStatusByPreprocessStatus(
  manifests: SourceVideoManifest[]
): LibraryCounts {
  const counts: Record<PreprocessStatus, number> = {
    unprocessed: 0,
    queued: 0,
    processing: 0,
    ready: 0,
    failed: 0,
    "index-required": 0
  };

  for (const manifest of manifests) {
    counts[manifest.preprocess_status] += 1;
  }

  return {
    video_count: manifests.length,
    ready_video_count: counts.ready,
    processing_video_count: counts.processing,
    queued_video_count: counts.queued,
    unprocessed_video_count: counts.unprocessed,
    failed_video_count: counts.failed,
    index_required_video_count: counts["index-required"]
  };
}

export function adminLibraryIndexStatus(input: {
  current_version: string;
  ready_video_count: number;
  index_required_video_count: number;
}) {
  if (input.index_required_video_count > 0) {
    return "needs-publish" as const;
  }

  if (input.ready_video_count > 0 && !input.current_version) {
    return "error" as const;
  }

  return "ready" as const;
}

async function diskUsage(libraryRoot: string): Promise<{ total: number; available: number }> {
  try {
    const stats = await statfs(libraryRoot);
    return {
      total: Number(stats.blocks) * Number(stats.bsize),
      available: Number(stats.bavail) * Number(stats.bsize)
    };
  } catch {
    return {
      total: 0,
      available: 0
    };
  }
}

function hasNonReadyCounts(counts: LibraryCounts): boolean {
  return counts.processing_video_count > 0 ||
    counts.queued_video_count > 0 ||
    counts.failed_video_count > 0 ||
    counts.index_required_video_count > 0;
}

export async function getAdminLibraryStatus(input: GetAdminLibraryStatusInput) {
  const now = input.now?.() ?? new Date().toISOString();
  const library = await input.deps.read_library_manifest(input.library_root);
  const manifests = library
    ? []
    : await input.deps.read_source_video_manifests(input.library_root);
  const counts = library ?? countAdminLibraryStatusByPreprocessStatus(manifests);
  const currentVersion = await input.deps.read_current_index_version(input.library_root);
  const disk = await (input.deps.disk_usage?.(input.library_root) ?? diskUsage(input.library_root));
  const activeManifest = manifests.find((manifest) => manifest.preprocess_status === "processing");

  if (library && hasNonReadyCounts(counts)) {
    input.deps.on_non_ready_counts_from_manifest?.(input.library_root, counts);
  }

  return {
    library_id: library?.library_id ?? input.library_id ?? "lib_main_001",
    name: library?.name ?? input.library_name ?? "MixLab 公共素材库",
    root_path: input.library_root,
    source_videos_path: await input.deps.read_primary_source_videos_path(input.library_root),
    mixlab_library_path: input.deps.mixlab_library_path(input.library_root),
    protocol_version: library?.version ?? "1.0",
    ...counts,
    disk_total_bytes: disk.total,
    disk_available_bytes: disk.available,
    index_status: adminLibraryIndexStatus({
      current_version: currentVersion,
      ready_video_count: counts.ready_video_count,
      index_required_video_count: counts.index_required_video_count
    }),
    current_index_version: currentVersion,
    active_task_label: activeManifest
      ? `${activeManifest.source_video_id} - processing`
      : counts.processing_video_count > 0
        ? `${counts.processing_video_count} 个任务正在处理`
        : "无正在处理任务",
    updated_at: library?.updated_at ?? now
  };
}
