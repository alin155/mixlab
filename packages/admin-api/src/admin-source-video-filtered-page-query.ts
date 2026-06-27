import type {
  LibraryCounts,
  PreprocessStatus,
  SourceVideoManifest
} from "../../protocol/src/index.ts";
import { adminSourceVideoMatchesListFilter } from "./admin-source-video-query.ts";
import { libraryCountForPreprocessStatus } from "./admin-source-video-read-model.ts";

export interface AdminSourceVideoFilteredPageQueryInput {
  library_root: string;
  offset: number;
  limit: number;
  query?: string;
  status?: PreprocessStatus;
  exclude_indexed_ready?: boolean;
  max_scan_batches?: number;
  filtered_scan_batch_size: number;
  read_all_manifests(libraryRoot: string): Promise<SourceVideoManifest[]>;
  read_library_manifest(libraryRoot: string): Promise<LibraryCounts | null>;
  read_sorted_source_video_ids(libraryRoot: string): Promise<string[]>;
  read_indexed_ready_id_set(libraryRoot: string): Promise<Set<string> | null>;
  read_manifests_by_ids(input: {
    library_root: string;
    source_video_ids: string[];
  }): Promise<SourceVideoManifest[]>;
}

export async function listAdminSourceVideoFilteredPage(
  input: AdminSourceVideoFilteredPageQueryInput
): Promise<SourceVideoManifest[]> {
  if (input.limit <= 0) {
    const fallbackManifests = await input.read_all_manifests(input.library_root);
    return fallbackManifests.filter((manifest) =>
      adminSourceVideoMatchesListFilter(manifest, {
        query: input.query,
        status: input.status
      })
    );
  }

  const normalizedQuery = input.query?.trim() ?? "";
  const library = input.status ? await input.read_library_manifest(input.library_root) : null;
  if (library && input.status && libraryCountForPreprocessStatus(library, input.status) <= input.offset) {
    return [];
  }

  let sourceVideoIds = await input.read_sorted_source_video_ids(input.library_root);
  if (input.exclude_indexed_ready) {
    const indexedReadyIds = await input.read_indexed_ready_id_set(input.library_root);
    if (indexedReadyIds) {
      sourceVideoIds = sourceVideoIds.filter((sourceVideoId) => !indexedReadyIds.has(sourceVideoId));
    }
  }

  const requestedEnd = input.offset + input.limit;
  const targetMatchCount = library && input.status && !normalizedQuery
    ? Math.min(requestedEnd, libraryCountForPreprocessStatus(library, input.status))
    : requestedEnd;
  const matched: SourceVideoManifest[] = [];
  const batchSize = Math.max(1, input.filtered_scan_batch_size);

  for (
    let start = 0, scannedBatchCount = 0;
    start < sourceVideoIds.length &&
      matched.length < targetMatchCount &&
      (!input.max_scan_batches || scannedBatchCount < input.max_scan_batches);
    start += batchSize, scannedBatchCount += 1
  ) {
    const manifests = await input.read_manifests_by_ids({
      library_root: input.library_root,
      source_video_ids: sourceVideoIds.slice(start, start + batchSize)
    });

    for (const manifest of manifests) {
      if (adminSourceVideoMatchesListFilter(manifest, {
        query: input.query,
        status: input.status
      })) {
        matched.push(manifest);
      }
    }

    if (normalizedQuery && matched.length > input.offset) {
      break;
    }
  }

  return matched.slice(input.offset, requestedEnd);
}
