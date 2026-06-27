import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  validateIndexCurrentPointer,
  validateIndexPackageManifest,
  type IndexCurrentPointer,
  type IndexPackageManifest
} from "../../protocol/src/index.ts";
import { readSourceTranscriptSqliteIndexMetadata } from "../../search-sqlite/src/index.ts";
import {
  ADMIN_INDEX_VERSION_CACHE_TTL_MS,
  ADMIN_INDEX_VERSION_DEFAULT_LIMIT
} from "./admin-data-loading-plan.ts";
import {
  adminSourceTranscriptIndexRoot
} from "./admin-library-paths.ts";
import type {
  AdminRuntimeCacheStatus,
  AdminRuntimeComponentTiming
} from "./admin-runtime-observability.ts";
import {
  adminRuntimeNowMs
} from "./admin-runtime-observability.ts";
import type { AdminScanDataSource } from "./admin-scan-modes.ts";

export type AdminIndexValidationStatus = "pass" | "warn" | "fail";

export interface AdminIndexVersionsResponse {
  current_version: string;
  current_validation_status: AdminIndexValidationStatus;
  current_validation_message: string;
  total_count: number;
  returned_count: number;
  offset: number;
  limit: number;
  has_more: boolean;
  versions: Array<{
    index_version: string;
    created_at: string;
    ready_video_count: number;
    schema_version: string;
    validation_status: AdminIndexValidationStatus;
    validation_message: string;
    is_current: boolean;
    published_by: "admin";
  }>;
}

export interface AdminIndexVersionsRuntimeMeta {
  actual_data_source: AdminScanDataSource;
  cache_status: AdminRuntimeCacheStatus;
  query_strategy: "current-pointer-fast-page" | "directory-page" | "cache-hit" | "pending-hit";
  component_timings?: AdminRuntimeComponentTiming[];
}

export interface AdminIndexVersionsWithRuntimeMeta {
  response: AdminIndexVersionsResponse;
  runtime: AdminIndexVersionsRuntimeMeta;
}

const ADMIN_INDEX_VERSION_FAST_PATH_MIN_ORDINAL = 1_000;

const indexVersionCache = new Map<string, {
  expires_at: number;
  response?: AdminIndexVersionsResponse;
  actual_data_source?: AdminScanDataSource;
  pending?: Promise<AdminIndexVersionsWithRuntimeMeta>;
}>();

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function directoryExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

function indexVersionCacheKey(input: {
  library_root: string;
  offset: number;
  limit: number;
}): string {
  return `${input.library_root}\0${input.offset}\0${input.limit}`;
}

export function clearAdminIndexVersionCache(libraryRoot: string): void {
  for (const key of indexVersionCache.keys()) {
    if (key.startsWith(`${libraryRoot}\0`)) {
      indexVersionCache.delete(key);
    }
  }
}

function indexValidationStatus(messages: string[]): AdminIndexValidationStatus {
  return messages.length > 0 ? "fail" : "pass";
}

function chineseIndexPackageValidationMessage(error: string): string {
  if (error.includes("index_version must use")) {
    return "index-manifest.json 版本号格式错误";
  }

  if (error.includes("ready_video_count")) {
    return "ready_video_count 与 source_video_ids 数量不一致";
  }

  if (error.includes("schema_version")) {
    return "schema_version 缺失";
  }

  return error;
}

function chineseCurrentPointerValidationMessage(error: string): string {
  if (error.includes("current_version must use")) {
    return "current.json 当前版本格式错误";
  }

  if (error.includes("does not reference")) {
    return "current.json 指向不存在的索引版本";
  }

  return error;
}

async function readIndexVersionValidation(root: string, indexVersion: string): Promise<{
  created_at: string;
  ready_video_count: number;
  schema_version: string;
  validation_status: AdminIndexValidationStatus;
  validation_message: string;
}> {
  const versionRoot = path.join(root, indexVersion);
  const messages: string[] = [];
  let manifest: Partial<IndexPackageManifest> = {};

  try {
    manifest = await readJsonFile<IndexPackageManifest>(path.join(versionRoot, "index-manifest.json"));
    const manifestValidation = validateIndexPackageManifest(manifest as IndexPackageManifest);

    if (!manifestValidation.ok) {
      messages.push(...manifestValidation.errors.map(chineseIndexPackageValidationMessage));
    }

    if (manifest.index_version && manifest.index_version !== indexVersion) {
      messages.push("index-manifest.json 版本号与目录不一致");
    }
  } catch {
    messages.push("index-manifest.json 无法解析");
  }

  const sqlitePath = path.join(versionRoot, "index.sqlite");
  if (!(await fileExists(sqlitePath))) {
    messages.push("index.sqlite 不存在");
  } else {
    try {
      const metadata = readSourceTranscriptSqliteIndexMetadata(sqlitePath);

      if (metadata.index_version !== indexVersion) {
        messages.push("index.sqlite 元数据版本与目录不一致");
      }

      if (
        typeof manifest.ready_video_count === "number" &&
        metadata.source_video_count !== manifest.ready_video_count
      ) {
        messages.push("index.sqlite 视频数量与 index-manifest.json 不一致");
      }
    } catch {
      messages.push("index.sqlite 无法读取");
    }
  }

  return {
    created_at: manifest.created_at ?? "",
    ready_video_count: manifest.ready_video_count ?? 0,
    schema_version: manifest.schema_version ?? "",
    validation_status: indexValidationStatus(messages),
    validation_message: messages.length > 0 ? messages.join("；") : "索引包校验通过"
  };
}

async function readCurrentIndexValidation(root: string, publishedVersions: string[]): Promise<{
  current_version: string;
  current_validation_status: AdminIndexValidationStatus;
  current_validation_message: string;
}> {
  let pointer: IndexCurrentPointer;

  try {
    pointer = await readJsonFile<IndexCurrentPointer>(path.join(root, "current.json"));
  } catch {
    return {
      current_version: "",
      current_validation_status: publishedVersions.length > 0 ? "fail" : "warn",
      current_validation_message: publishedVersions.length > 0 ? "current.json 不存在或无法解析" : "暂无当前索引指针"
    };
  }

  const validation = validateIndexCurrentPointer(pointer, publishedVersions);

  return {
    current_version: pointer.current_version,
    current_validation_status: validation.ok ? "pass" : "fail",
    current_validation_message: validation.ok
      ? `current.json 指向 ${pointer.current_version}`
      : validation.errors.map(chineseCurrentPointerValidationMessage).join("；")
  };
}

function parseIndexVersionOrdinal(indexVersion: string): number | null {
  const match = /^v(\d{6})$/.exec(indexVersion);
  if (!match) {
    return null;
  }

  const ordinal = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(ordinal) && ordinal > 0 ? ordinal : null;
}

function indexVersionFromOrdinal(ordinal: number): string {
  return `v${String(ordinal).padStart(6, "0")}`;
}

async function readIndexVersionNamesFromDirectory(root: string): Promise<string[]> {
  const versionNames: string[] = [];

  try {
    const entries = await readdir(root, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || !/^v\d{6}$/.test(entry.name)) {
        continue;
      }

      versionNames.push(entry.name);
    }
  } catch {
    // No index yet.
  }

  return versionNames;
}

async function readLargeIndexVersionPageFromCurrent(root: string, options: {
  offset: number;
  limit: number;
}): Promise<{
  current: Awaited<ReturnType<typeof readCurrentIndexValidation>>;
  page_version_names: string[];
  total_count: number;
  has_more: boolean;
} | null> {
  let pointer: IndexCurrentPointer;

  try {
    pointer = await readJsonFile<IndexCurrentPointer>(path.join(root, "current.json"));
  } catch {
    return null;
  }

  const currentOrdinal = parseIndexVersionOrdinal(pointer.current_version);
  if (!currentOrdinal || currentOrdinal < ADMIN_INDEX_VERSION_FAST_PATH_MIN_ORDINAL) {
    return null;
  }

  const startOrdinal = Math.max(1, currentOrdinal - options.offset);
  const pageVersionNames: string[] = [];

  for (let ordinal = startOrdinal; ordinal >= 1 && pageVersionNames.length < options.limit; ordinal -= 1) {
    const indexVersion = indexVersionFromOrdinal(ordinal);
    if (await directoryExists(path.join(root, indexVersion))) {
      pageVersionNames.push(indexVersion);
    }
  }

  const currentExists = await directoryExists(path.join(root, pointer.current_version));
  if (
    currentExists &&
    !pageVersionNames.includes(pointer.current_version)
  ) {
    pageVersionNames.push(pointer.current_version);
  }

  const validation = validateIndexCurrentPointer(
    pointer,
    currentExists ? [pointer.current_version] : []
  );

  return {
    current: {
      current_version: pointer.current_version,
      current_validation_status: validation.ok ? "pass" : "fail",
      current_validation_message: validation.ok
        ? `current.json 指向 ${pointer.current_version}`
        : validation.errors.map(chineseCurrentPointerValidationMessage).join("；")
    },
    page_version_names: pageVersionNames,
    total_count: currentOrdinal,
    has_more: options.offset + options.limit < currentOrdinal
  };
}

async function readIndexVersionsUncached(
  libraryRoot: string,
  options: { limit: number; offset: number }
): Promise<{
  response: AdminIndexVersionsResponse;
  runtime: AdminIndexVersionsRuntimeMeta;
}> {
  const root = adminSourceTranscriptIndexRoot(libraryRoot);
  const offset = options.offset;
  const limit = options.limit;
  const componentTimings: AdminRuntimeComponentTiming[] = [];
  const fastPageStartedAtMs = adminRuntimeNowMs();
  const fastPage = await readLargeIndexVersionPageFromCurrent(root, {
    offset,
    limit
  });
  componentTimings.push({
    name: "current_pointer_fast_page",
    duration_ms: Math.max(0, adminRuntimeNowMs() - fastPageStartedAtMs),
    data_source: "current-index",
    scan_mode: "paged-list",
    scan_reason: "index-version-page",
    cache_status: fastPage ? "hit" : "miss",
    detail: `offset=${offset};limit=${limit};result=${fastPage ? "hit" : "miss"};versions=${fastPage?.page_version_names.length ?? 0}`
  });

  let directoryListingMs = 0;
  const versionNames = fastPage
    ? fastPage.page_version_names
    : await (async () => {
        const startedAtMs = adminRuntimeNowMs();
        const names = await readIndexVersionNamesFromDirectory(root);
        directoryListingMs = Math.max(0, adminRuntimeNowMs() - startedAtMs);
        componentTimings.push({
          name: "directory_listing",
          duration_ms: directoryListingMs,
          data_source: "index-version-packages",
          scan_mode: "paged-list",
          scan_reason: "index-version-page",
          cache_status: "miss",
          detail: `versions=${names.length}`
        });
        return names;
      })();

  let currentValidationMs = 0;
  const current = fastPage
    ? fastPage.current
    : await (async () => {
        const startedAtMs = adminRuntimeNowMs();
        const validation = await readCurrentIndexValidation(root, versionNames);
        currentValidationMs = Math.max(0, adminRuntimeNowMs() - startedAtMs);
        componentTimings.push({
          name: "current_pointer_validation",
          duration_ms: currentValidationMs,
          data_source: "current-index",
          scan_mode: "single-id",
          scan_reason: "selected-record",
          cache_status: "not-applicable",
          detail: `current=${validation.current_version || "none"};status=${validation.current_validation_status}`
        });
        return validation;
      })();
  const sortedVersionNames = versionNames.sort((left, right) => right.localeCompare(left));
  const pageVersionNames = fastPage
    ? sortedVersionNames
    : sortedVersionNames.slice(offset, offset + limit);

  if (
    !fastPage &&
    current.current_version &&
    sortedVersionNames.includes(current.current_version) &&
    !pageVersionNames.includes(current.current_version)
  ) {
      pageVersionNames.push(current.current_version);
  }

  const packageValidationStartedAtMs = adminRuntimeNowMs();
  const versions = await Promise.all(
    pageVersionNames.map(async (indexVersion) => ({
      index_version: indexVersion,
      ...await readIndexVersionValidation(root, indexVersion),
      is_current: indexVersion === current.current_version,
      published_by: "admin" as const
    }))
  );
  componentTimings.push({
    name: "index_package_validation",
    duration_ms: Math.max(0, adminRuntimeNowMs() - packageValidationStartedAtMs),
    data_source: "index-version-packages",
    scan_mode: "paged-list",
    scan_reason: "index-version-page",
    cache_status: "not-applicable",
    detail: `versions=${pageVersionNames.length};directory_ms=${Math.round(directoryListingMs)};current_ms=${Math.round(currentValidationMs)}`
  });

  return {
    response: {
      current_version: current.current_version,
      current_validation_status: current.current_validation_status,
      current_validation_message: current.current_validation_message,
      total_count: fastPage ? fastPage.total_count : sortedVersionNames.length,
      returned_count: versions.length,
      offset,
      limit,
      has_more: fastPage ? fastPage.has_more : offset + limit < sortedVersionNames.length,
      versions: versions.sort((left, right) => right.index_version.localeCompare(left.index_version))
    },
    runtime: {
      actual_data_source: fastPage ? "current-index" : "index-version-packages",
      cache_status: "miss",
      query_strategy: fastPage ? "current-pointer-fast-page" : "directory-page",
      component_timings: componentTimings
    }
  };
}

export async function listAdminIndexVersionsWithRuntimeMeta(
  libraryRoot: string,
  options: { limit?: number; offset?: number } = {}
): Promise<AdminIndexVersionsWithRuntimeMeta> {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(1, Math.min(options.limit ?? ADMIN_INDEX_VERSION_DEFAULT_LIMIT, 200));
  const key = indexVersionCacheKey({
    library_root: libraryRoot,
    offset,
    limit
  });
  const cached = indexVersionCache.get(key);
  const nowMs = Date.now();

  if (cached?.pending) {
    const startedAtMs = adminRuntimeNowMs();
    const pendingResult = await cached.pending;
    return {
      response: pendingResult.response,
      runtime: {
        actual_data_source: pendingResult.runtime.actual_data_source,
        cache_status: "pending",
        query_strategy: "pending-hit",
        component_timings: [{
          name: "pending_wait",
          duration_ms: Math.max(0, adminRuntimeNowMs() - startedAtMs),
          data_source: pendingResult.runtime.actual_data_source,
          scan_mode: "paged-list",
          scan_reason: "index-version-page",
          cache_status: "pending",
          detail: `offset=${offset};limit=${limit}`
        }]
      }
    };
  }

  if (cached?.response && cached.expires_at > nowMs) {
    return {
      response: cached.response,
      runtime: {
        actual_data_source: cached.actual_data_source ?? "index-version-packages",
        cache_status: "hit",
        query_strategy: "cache-hit",
        component_timings: [{
          name: "cache_lookup",
          duration_ms: 0,
          data_source: cached.actual_data_source ?? "index-version-packages",
          scan_mode: "no-scan",
          scan_reason: "index-version-page",
          cache_status: "hit",
          detail: `offset=${offset};limit=${limit}`
        }]
      }
    };
  }

  const pending = readIndexVersionsUncached(libraryRoot, {
    offset,
    limit
  })
    .then((result) => {
      indexVersionCache.set(key, {
        expires_at: Date.now() + ADMIN_INDEX_VERSION_CACHE_TTL_MS,
        response: result.response,
        actual_data_source: result.runtime.actual_data_source
      });
      return result;
    })
    .catch((error) => {
      indexVersionCache.delete(key);
      throw error;
    });

  indexVersionCache.set(key, {
    expires_at: 0,
    response: cached?.response,
    actual_data_source: cached?.actual_data_source,
    pending
  });

  return pending;
}

export async function listAdminIndexVersions(
  libraryRoot: string,
  options: { limit?: number; offset?: number } = {}
): Promise<AdminIndexVersionsResponse> {
  return (await listAdminIndexVersionsWithRuntimeMeta(libraryRoot, options)).response;
}
