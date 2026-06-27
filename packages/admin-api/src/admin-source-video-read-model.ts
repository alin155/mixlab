import {
  validateSourceVideoManifest,
  type LibraryCounts,
  type PreprocessStatus,
  type SourceVideoManifest
} from "../../protocol/src/index.ts";
import { numericSourceVideoId } from "./admin-source-video-query.ts";

export type AdminSourceVideoStatusIdsByStatus = Record<PreprocessStatus, string[]>;
export type AdminSourceVideoStatusManifestsByStatus = Partial<Record<PreprocessStatus, SourceVideoManifest[]>>;

export type AdminSourceVideoStatusReadModelLibrary = LibraryCounts & {
  updated_at?: string;
};

export interface AdminSourceVideoStatusReadModel {
  schema_version: "1.0";
  generated_at: string;
  library_updated_at: string;
  video_count: number;
  ids_by_status: AdminSourceVideoStatusIdsByStatus;
  manifests_by_status?: AdminSourceVideoStatusManifestsByStatus;
  default_source_video_page?: {
    offset: number;
    limit: number;
    manifests: SourceVideoManifest[];
  };
}

export const adminSourceVideoStatusList: PreprocessStatus[] = [
  "unprocessed",
  "queued",
  "processing",
  "ready",
  "failed",
  "index-required"
];

export const adminNonReadySourceVideoStatusList = adminSourceVideoStatusList.filter((status) =>
  status !== "ready"
);

export const adminSourceVideoStatuses = new Set<PreprocessStatus>(adminSourceVideoStatusList);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function emptySourceVideoStatusIdsByStatus(): AdminSourceVideoStatusIdsByStatus {
  return {
    unprocessed: [],
    queued: [],
    processing: [],
    ready: [],
    failed: [],
    "index-required": []
  };
}

export function libraryCountFieldForPreprocessStatus(status: PreprocessStatus): keyof LibraryCounts {
  switch (status) {
    case "ready":
      return "ready_video_count";
    case "processing":
      return "processing_video_count";
    case "queued":
      return "queued_video_count";
    case "unprocessed":
      return "unprocessed_video_count";
    case "failed":
      return "failed_video_count";
    case "index-required":
      return "index_required_video_count";
  }
}

export function libraryCountForPreprocessStatus(
  library: LibraryCounts,
  status: PreprocessStatus
): number {
  return library[libraryCountFieldForPreprocessStatus(status)];
}

export function isAdminSourceVideoStatusReadModelFresh(
  model: AdminSourceVideoStatusReadModel | undefined,
  library: AdminSourceVideoStatusReadModelLibrary | null,
  options: { default_page_limit: number }
): model is AdminSourceVideoStatusReadModel {
  if (!model) {
    return false;
  }

  if (!library) {
    return true;
  }

  return model.library_updated_at === library.updated_at &&
    model.video_count === Math.max(0, Math.floor(library.video_count)) &&
    sourceVideoStatusReadModelHasRequiredManifestRows(model, library) &&
    sourceVideoStatusReadModelHasDefaultPage(model, library, options);
}

function sourceVideoStatusReadModelHasRequiredManifestRows(
  model: AdminSourceVideoStatusReadModel,
  library: LibraryCounts
): boolean {
  for (const status of adminNonReadySourceVideoStatusList) {
    const expectedCount = libraryCountForPreprocessStatus(library, status);
    if (expectedCount > 0 && (model.manifests_by_status?.[status]?.length ?? 0) !== expectedCount) {
      return false;
    }
  }

  return true;
}

function sourceVideoStatusReadModelHasDefaultPage(
  model: AdminSourceVideoStatusReadModel,
  library: LibraryCounts,
  options: { default_page_limit: number }
): boolean {
  if (library.video_count <= 0) {
    return true;
  }

  return model.default_source_video_page?.offset === 0 &&
    model.default_source_video_page.limit >= options.default_page_limit &&
    model.default_source_video_page.manifests.length >= Math.min(
      options.default_page_limit,
      library.video_count
    );
}

export function buildAdminSourceVideoStatusReadModel(input: {
  library: AdminSourceVideoStatusReadModelLibrary | null;
  manifests: SourceVideoManifest[];
  default_page_limit: number;
  generated_at?: string;
}): AdminSourceVideoStatusReadModel {
  const idsByStatus = emptySourceVideoStatusIdsByStatus();
  const manifestsByStatus: AdminSourceVideoStatusManifestsByStatus = {};

  for (const manifest of input.manifests) {
    idsByStatus[manifest.preprocess_status].push(manifest.source_video_id);
    if (manifest.preprocess_status !== "ready") {
      manifestsByStatus[manifest.preprocess_status] = [
        ...(manifestsByStatus[manifest.preprocess_status] ?? []),
        manifest
      ];
    }
  }

  for (const ids of Object.values(idsByStatus)) {
    ids.sort((left, right) => numericSourceVideoId(left) - numericSourceVideoId(right));
  }
  for (const status of adminNonReadySourceVideoStatusList) {
    manifestsByStatus[status] = (manifestsByStatus[status] ?? [])
      .sort((left, right) => numericSourceVideoId(left.source_video_id) - numericSourceVideoId(right.source_video_id));
  }

  return {
    schema_version: "1.0",
    generated_at: input.generated_at ?? new Date().toISOString(),
    library_updated_at: input.library?.updated_at ?? "",
    video_count: input.library?.video_count ?? input.manifests.length,
    ids_by_status: idsByStatus,
    manifests_by_status: manifestsByStatus,
    default_source_video_page: {
      offset: 0,
      limit: input.default_page_limit,
      manifests: [...input.manifests]
        .sort((left, right) => numericSourceVideoId(left.source_video_id) - numericSourceVideoId(right.source_video_id))
        .slice(0, input.default_page_limit)
    }
  };
}

function parseAdminSourceVideoStatusReadModelManifests(value: unknown): AdminSourceVideoStatusManifestsByStatus {
  const manifestsByStatus: AdminSourceVideoStatusManifestsByStatus = {};
  if (!isRecord(value)) {
    return manifestsByStatus;
  }

  for (const status of adminNonReadySourceVideoStatusList) {
    const rawManifests = value[status];
    if (!Array.isArray(rawManifests)) {
      continue;
    }

    const manifests: SourceVideoManifest[] = [];
    for (const rawManifest of rawManifests) {
      const validation = validateSourceVideoManifest(rawManifest);
      if (validation.ok && rawManifest.preprocess_status === status) {
        manifests.push(rawManifest);
      }
    }
    manifestsByStatus[status] = manifests.sort(
      (left, right) => numericSourceVideoId(left.source_video_id) - numericSourceVideoId(right.source_video_id)
    );
  }

  return manifestsByStatus;
}

function parseAdminSourceVideoStatusReadModelDefaultPage(
  value: unknown
): AdminSourceVideoStatusReadModel["default_source_video_page"] {
  if (!isRecord(value) || !Array.isArray(value.manifests)) {
    return undefined;
  }

  const offset = typeof value.offset === "number" ? Math.max(0, Math.floor(value.offset)) : 0;
  const limit = typeof value.limit === "number" ? Math.max(0, Math.floor(value.limit)) : 0;
  const manifests: SourceVideoManifest[] = [];

  for (const rawManifest of value.manifests) {
    if (
      isRecord(rawManifest) &&
      typeof rawManifest.source_video_id === "string" &&
      /^V\d{6}$/.test(rawManifest.source_video_id) &&
      typeof rawManifest.title === "string" &&
      typeof rawManifest.relative_path === "string" &&
      adminSourceVideoStatuses.has(rawManifest.preprocess_status as PreprocessStatus)
    ) {
      manifests.push(rawManifest as unknown as SourceVideoManifest);
    }
  }

  if (limit <= 0 || manifests.length === 0) {
    return undefined;
  }

  return {
    offset,
    limit,
    manifests
  };
}

export function parseAdminSourceVideoStatusReadModel(value: unknown): AdminSourceVideoStatusReadModel | null {
  if (!isRecord(value) || value.schema_version !== "1.0" || !isRecord(value.ids_by_status)) {
    return null;
  }

  const idsByStatus = emptySourceVideoStatusIdsByStatus();
  for (const status of adminSourceVideoStatusList) {
    const ids = value.ids_by_status[status];
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && /^V\d{6}$/.test(id))) {
      return null;
    }
    idsByStatus[status] = [...ids];
  }

  return {
    schema_version: "1.0",
    generated_at: typeof value.generated_at === "string" ? value.generated_at : "",
    library_updated_at: typeof value.library_updated_at === "string" ? value.library_updated_at : "",
    video_count: typeof value.video_count === "number" ? Math.max(0, Math.floor(value.video_count)) : 0,
    ids_by_status: idsByStatus,
    manifests_by_status: parseAdminSourceVideoStatusReadModelManifests(value.manifests_by_status),
    default_source_video_page: parseAdminSourceVideoStatusReadModelDefaultPage(value.default_source_video_page)
  };
}

export function sourceVideoStatusReadModelCounts(
  model: AdminSourceVideoStatusReadModel
): Record<PreprocessStatus, number> {
  return {
    unprocessed: model.ids_by_status.unprocessed.length,
    queued: model.ids_by_status.queued.length,
    processing: model.ids_by_status.processing.length,
    ready: model.ids_by_status.ready.length,
    failed: model.ids_by_status.failed.length,
    "index-required": model.ids_by_status["index-required"].length
  };
}

export function sourceVideoStatusReadModelCountsMatchLibrary(
  model: AdminSourceVideoStatusReadModel,
  library: LibraryCounts
): boolean {
  const counts = sourceVideoStatusReadModelCounts(model);
  return counts.ready === library.ready_video_count &&
    counts.processing === library.processing_video_count &&
    counts.queued === library.queued_video_count &&
    counts.unprocessed === library.unprocessed_video_count &&
    counts.failed === library.failed_video_count &&
    counts["index-required"] === library.index_required_video_count;
}

export function buildAdminSourceVideoStatusReadModelFromIndexedReadyIds(input: {
  library: AdminSourceVideoStatusReadModelLibrary;
  ready_source_video_ids: string[];
  non_ready_manifests: SourceVideoManifest[];
  generated_at?: string;
}): AdminSourceVideoStatusReadModel {
  const idsByStatus = emptySourceVideoStatusIdsByStatus();
  const manifestsByStatus: AdminSourceVideoStatusManifestsByStatus = {};
  idsByStatus.ready = [...new Set(input.ready_source_video_ids)]
    .filter((sourceVideoId) => /^V\d{6}$/.test(sourceVideoId))
    .sort((left, right) => numericSourceVideoId(left) - numericSourceVideoId(right));

  for (const manifest of input.non_ready_manifests) {
    idsByStatus[manifest.preprocess_status].push(manifest.source_video_id);
    manifestsByStatus[manifest.preprocess_status] = [
      ...(manifestsByStatus[manifest.preprocess_status] ?? []),
      manifest
    ];
  }

  for (const status of adminSourceVideoStatusList) {
    idsByStatus[status] = [...new Set(idsByStatus[status])]
      .sort((left, right) => numericSourceVideoId(left) - numericSourceVideoId(right));
  }
  for (const status of adminNonReadySourceVideoStatusList) {
    manifestsByStatus[status] = (manifestsByStatus[status] ?? [])
      .sort((left, right) => numericSourceVideoId(left.source_video_id) - numericSourceVideoId(right.source_video_id));
  }

  return {
    schema_version: "1.0",
    generated_at: input.generated_at ?? new Date().toISOString(),
    library_updated_at: input.library.updated_at ?? "",
    video_count: input.library.video_count,
    ids_by_status: idsByStatus,
    manifests_by_status: manifestsByStatus
  };
}

export function preprocessJobSourceVideoIdsFromStatusReadModel(
  model: AdminSourceVideoStatusReadModel
): string[] {
  return [
    ...model.ids_by_status.processing,
    ...model.ids_by_status.queued,
    ...[...model.ids_by_status.failed].reverse(),
    ...[...model.ids_by_status["index-required"]].reverse(),
    ...[...model.ids_by_status.ready].reverse()
  ];
}
