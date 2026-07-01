import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  completeReadyVisualArtifacts,
  publishIndexRequiredSourceVideos,
  readAllSourceVideoManifests,
  readSourceVideoManifest,
  resolveSourceVideoFilePath
} from "../../library-fs/src/index.ts";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import { adminCommandContract } from "./admin-command-guard.ts";
import { runAdminCommand } from "./admin-command-runtime.ts";
import type { AdminCommandActor } from "./admin-command-audit.ts";
import type { AdminCommandSnapshotFileInput } from "./admin-command-snapshot.ts";
import { readAdminLibraryManifest } from "./admin-library-commands.ts";
import {
  adminLibraryManifestPath as libraryManifestPath,
  adminPreprocessJobPath as preprocessJobPath,
  adminSourceTranscriptCurrentPath as currentIndexPointerPath,
  adminSourceVideoManifestPath as sourceVideoManifestPath
} from "./admin-library-paths.ts";
import { writeAdminSourceVideoManifestsToReadModelStore } from "./admin-read-model-store.ts";
import { numericSourceVideoId } from "./admin-source-video-query.ts";

export interface ReadyPublishMedia {
  create_cover(input: {
    source_path: string;
    output_path: string;
    at_ms: number;
    width: number;
  }): Promise<void>;
}

export interface AdminPublishReadyResult {
  index_version: string;
  published_source_video_ids: string[];
  ready_video_count: number;
  skipped_source_video_ids: string[];
  remaining_index_required_count?: number;
  prepared_source_video_ids: string[];
  published_count: number;
  skipped_count: number;
  affected_count: number;
  message: string;
}

interface AdminPublishCommandContext {
  library_root: string;
  library_id: string;
  command_now: string;
  media: ReadyPublishMedia;
  limit?: number;
  now?: () => string;
  invalidate_index_version_cache?: () => void;
  actor?: AdminCommandActor;
}

function defaultCoverPath(sourceVideoId: string): string {
  return `.mixlab-library/videos/${sourceVideoId}/cover.jpg`;
}

function defaultKeyframesPath(sourceVideoId: string): string {
  return `.mixlab-library/videos/${sourceVideoId}/keyframes.json`;
}

function uniqueSourceVideoIds(sourceVideoIds: string[]): string[] {
  return [...new Set(sourceVideoIds)].sort(
    (left, right) => numericSourceVideoId(left) - numericSourceVideoId(right)
  );
}

function publishCandidateSnapshotFiles(
  libraryRoot: string,
  manifest: SourceVideoManifest
): AdminCommandSnapshotFileInput[] {
  const sourceVideoId = manifest.source_video_id;
  return [
    {
      label: `source-video-${sourceVideoId}-manifest`,
      file_path: sourceVideoManifestPath(libraryRoot, sourceVideoId)
    },
    {
      label: `source-video-${sourceVideoId}-preprocess-job`,
      file_path: preprocessJobPath(libraryRoot, sourceVideoId)
    },
    {
      label: `source-video-${sourceVideoId}-cover`,
      file_path: path.join(libraryRoot, manifest.cover_path.trim() || defaultCoverPath(sourceVideoId))
    },
    {
      label: `source-video-${sourceVideoId}-keyframes`,
      file_path: path.join(libraryRoot, manifest.keyframes_path.trim() || defaultKeyframesPath(sourceVideoId))
    }
  ];
}

async function publishSnapshotFiles(input: {
  library_root: string;
  source_video_ids?: string[];
  limit?: number;
}): Promise<AdminCommandSnapshotFileInput[]> {
  const manifests = await readAllSourceVideoManifests(input.library_root);
  const manifestsById = new Map(manifests.map((manifest) => [manifest.source_video_id, manifest]));
  const candidateIds = input.source_video_ids
    ? uniqueSourceVideoIds(input.source_video_ids)
    : uniqueSourceVideoIds(
        manifests
          .filter((manifest) => manifest.preprocess_status === "index-required")
          .map((manifest) => manifest.source_video_id)
      ).slice(0, input.limit);

  return [
    {
      label: "library-manifest",
      file_path: libraryManifestPath(input.library_root)
    },
    {
      label: "source-transcript-index-current",
      file_path: currentIndexPointerPath(input.library_root)
    },
    ...candidateIds.flatMap((sourceVideoId) => {
      const manifest = manifestsById.get(sourceVideoId);
      return manifest
        ? publishCandidateSnapshotFiles(input.library_root, manifest)
        : [
            {
              label: `source-video-${sourceVideoId}-manifest`,
              file_path: sourceVideoManifestPath(input.library_root, sourceVideoId)
            },
            {
              label: `source-video-${sourceVideoId}-preprocess-job`,
              file_path: preprocessJobPath(input.library_root, sourceVideoId)
            }
          ];
    })
  ];
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function currentTime(input: Pick<AdminPublishCommandContext, "command_now" | "now">): string {
  return input.now ? input.now() : input.command_now;
}

function buildReadyPublishKeyframesMs(input: {
  duration_ms: number;
  interval_ms?: number;
  max_count?: number;
}): number[] {
  const intervalMs = input.interval_ms ?? 5_000;
  const maxCount = input.max_count ?? 60;
  const durationMs = Math.max(0, Math.trunc(input.duration_ms));

  if (durationMs === 0) {
    return [0];
  }

  const dense: number[] = [];

  for (let cursor = 0; cursor < durationMs; cursor += intervalMs) {
    dense.push(cursor);
  }

  dense.push(durationMs);

  if (dense.length <= maxCount) {
    return Array.from(new Set(dense));
  }

  const sampled = new Set<number>();

  for (let index = 0; index < maxCount; index += 1) {
    sampled.add(Math.round((durationMs * index) / (maxCount - 1)));
  }

  return Array.from(sampled).sort((left, right) => left - right);
}

function buildReadyPublishCoverAtMs(durationMs: number): number {
  const normalizedDurationMs = Math.max(0, Math.trunc(durationMs));

  if (normalizedDurationMs <= 1) {
    return 0;
  }

  return Math.min(1_000, Math.floor(normalizedDurationMs / 2));
}

async function prepareReadyPublishArtifacts(input: {
  library_root: string;
  source_video_ids?: string[];
  now: string;
  media: ReadyPublishMedia;
}): Promise<string[]> {
  const requestedIds = input.source_video_ids ? new Set(input.source_video_ids) : null;
  const manifests = await readAllSourceVideoManifests(input.library_root);
  const indexRequired = manifests.filter(
    (manifest) =>
      manifest.preprocess_status === "index-required" &&
      (!requestedIds || requestedIds.has(manifest.source_video_id))
  );
  const preparedSourceVideoIds: string[] = [];

  for (const manifest of indexRequired) {
    const coverPath = manifest.cover_path.trim()
      ? manifest.cover_path
      : `.mixlab-library/videos/${manifest.source_video_id}/cover.jpg`;
    const absoluteCoverPath = path.join(input.library_root, coverPath);

    if (!(await fileExists(absoluteCoverPath))) {
      await mkdir(path.dirname(absoluteCoverPath), { recursive: true });
      const sourcePath = await resolveSourceVideoFilePath(input.library_root, manifest);
      await input.media.create_cover({
        source_path: sourcePath,
        output_path: absoluteCoverPath,
        at_ms: buildReadyPublishCoverAtMs(manifest.duration_ms),
        width: 640
      });
    }

    if (!(await fileExists(absoluteCoverPath))) {
      continue;
    }

    await completeReadyVisualArtifacts({
      library_root: input.library_root,
      source_video_id: manifest.source_video_id,
      cover_path: coverPath,
      keyframes_ms: buildReadyPublishKeyframesMs({
        duration_ms: manifest.duration_ms
      }),
      now: input.now
    });
    preparedSourceVideoIds.push(manifest.source_video_id);
  }

  return preparedSourceVideoIds;
}

async function selectIndexRequiredSourceVideoIds(input: {
  library_root: string;
  limit?: number;
}): Promise<string[] | undefined> {
  if (!input.limit || input.limit <= 0) {
    return undefined;
  }

  const manifests = await readAllSourceVideoManifests(input.library_root);
  return uniqueSourceVideoIds(
    manifests
      .filter((manifest) => manifest.preprocess_status === "index-required")
      .map((manifest) => manifest.source_video_id)
  ).slice(0, input.limit);
}

async function writeThroughPublishedSourceVideos(input: {
  library_root: string;
  source_video_ids: string[];
  generated_at: string;
}): Promise<void> {
  if (input.source_video_ids.length === 0) {
    return;
  }

  try {
    const manifests: SourceVideoManifest[] = [];
    for (const sourceVideoId of input.source_video_ids) {
      manifests.push(await readSourceVideoManifest(input.library_root, sourceVideoId));
    }
    await writeAdminSourceVideoManifestsToReadModelStore({
      library_root: input.library_root,
      library: await readAdminLibraryManifest(input.library_root),
      manifests,
      generated_at: input.generated_at
    });
  } catch {
    // Store write-through is an optimization; stale/missing stores fall back to rebuild paths.
  }
}

export async function publishReadyPreparedVideos(input: {
  library_root: string;
  library_id: string;
  now: string;
  media: ReadyPublishMedia;
  source_video_ids?: string[];
  limit?: number;
  invalidate_index_version_cache?: () => void;
}): Promise<AdminPublishReadyResult> {
  const sourceVideoIds = input.source_video_ids ?? await selectIndexRequiredSourceVideoIds({
    library_root: input.library_root,
    limit: input.limit
  });
  const preparedSourceVideoIds = await prepareReadyPublishArtifacts({
    library_root: input.library_root,
    source_video_ids: sourceVideoIds,
    now: input.now,
    media: input.media
  });
  const result = await publishIndexRequiredSourceVideos({
    library_root: input.library_root,
    library_id: input.library_id,
    now: input.now,
    ...(sourceVideoIds ? { source_video_ids: sourceVideoIds } : {})
  });
  const publishedCount = result.published_source_video_ids.length;
  const skippedCount = result.skipped_source_video_ids.length;
  input.invalidate_index_version_cache?.();
  if (publishedCount > 0) {
    await writeThroughPublishedSourceVideos({
      library_root: input.library_root,
      source_video_ids: result.published_source_video_ids,
      generated_at: input.now
    });
  }
  const latestLibrary = await readAdminLibraryManifest(input.library_root);
  const remainingIndexRequiredCount = latestLibrary?.index_required_video_count ?? 0;
  const message = publishedCount > 0
    ? remainingIndexRequiredCount > 0
      ? `已上线 ${publishedCount} 个素材，当前可用 ${result.ready_video_count} 个，还有 ${remainingIndexRequiredCount} 个待上线。`
      : `已上线 ${publishedCount} 个素材，当前可用 ${result.ready_video_count} 个。`
    : skippedCount > 0
      ? `没有发布新视频，${skippedCount} 个待发布视频缺少文案、字幕、封面或关键帧产物。`
      : "没有需要发布的待索引视频。";

  return {
    ...result,
    remaining_index_required_count: remainingIndexRequiredCount,
    prepared_source_video_ids: preparedSourceVideoIds,
    published_count: publishedCount,
    skipped_count: skippedCount,
    affected_count: publishedCount,
    message
  };
}

export async function runAdminSourceVideoPublishCommand(input: AdminPublishCommandContext & {
  source_video_id: string;
}): Promise<AdminPublishReadyResult> {
  const command = adminCommandContract("source-video-publish");
  return runAdminCommand({
    library_root: input.library_root,
    command: command.command,
    now: input.command_now,
    actor: input.actor,
    snapshot_files_provider: () => publishSnapshotFiles({
      library_root: input.library_root,
      source_video_ids: [input.source_video_id]
    })
  }, () =>
    publishReadyPreparedVideos({
      library_root: input.library_root,
      library_id: input.library_id,
      now: currentTime(input),
      media: input.media,
      source_video_ids: [input.source_video_id],
      invalidate_index_version_cache: input.invalidate_index_version_cache
    })
  );
}

export async function runAdminIndexRepairCommand(
  input: AdminPublishCommandContext
): Promise<AdminPublishReadyResult> {
  const command = adminCommandContract("index-repair");
  return runAdminCommand({
    library_root: input.library_root,
    command: command.command,
    now: input.command_now,
    actor: input.actor,
    snapshot_files_provider: () => publishSnapshotFiles({
      library_root: input.library_root,
      limit: input.limit
    })
  }, () =>
    publishReadyPreparedVideos({
      library_root: input.library_root,
      library_id: input.library_id,
      now: currentTime(input),
      media: input.media,
      limit: input.limit,
      invalidate_index_version_cache: input.invalidate_index_version_cache
    })
  );
}

export async function runAdminSupervisorPublishCommand(
  input: AdminPublishCommandContext
): Promise<AdminPublishReadyResult> {
  const command = adminCommandContract("preprocess-supervisor-publish-ready");
  return runAdminCommand({
    library_root: input.library_root,
    command: command.command,
    now: input.command_now,
    actor: input.actor,
    snapshot_files_provider: () => publishSnapshotFiles({
      library_root: input.library_root
    })
  }, () =>
    publishReadyPreparedVideos({
      library_root: input.library_root,
      library_id: input.library_id,
      now: currentTime(input),
      media: input.media,
      invalidate_index_version_cache: input.invalidate_index_version_cache
    })
  );
}
