import { DatabaseSync } from "node:sqlite";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  validateSourceVideoManifest,
  type LibraryCounts,
  type PreprocessStatus,
  type SourceVideoManifest
} from "../../protocol/src/index.ts";
import {
  adminNonReadySourceVideoStatusList,
  adminSourceVideoStatusList,
  buildAdminSourceVideoStatusReadModel,
  type AdminSourceVideoStatusReadModel
} from "./admin-source-video-read-model.ts";
import {
  adminSourceVideoMatchesListFilter,
  escapeSqliteLike,
  numericSourceVideoId
} from "./admin-source-video-query.ts";
import type { AdminScanMode } from "./admin-scan-modes.ts";
import {
  adminMixlabRoot
} from "./admin-library-paths.ts";

export const ADMIN_READ_MODEL_STORE_SCHEMA_VERSION = "1.0";
export const ADMIN_READ_MODEL_STORE_FILE_NAME = "admin.sqlite";
const ADMIN_READ_MODEL_STORE_RO_BUSY_TIMEOUT_MS = 75;
const ADMIN_STATUS_STORE_PAGE_READ_RETRY_DELAYS_MS = [0, 80, 160, 320];

export type AdminReadModelStoreFreshness = "fresh" | "stale" | "missing" | "unreadable";

export interface AdminReadModelStoreStatus {
  schema_version: typeof ADMIN_READ_MODEL_STORE_SCHEMA_VERSION;
  storage: "sqlite";
  path: string;
  freshness: AdminReadModelStoreFreshness;
  exists: boolean;
  generated_at: string;
  library_updated_at: string;
  current_library_updated_at: string;
  video_count: number;
  current_video_count: number;
  counts_by_status: Record<PreprocessStatus, number>;
  projections?: AdminReadModelStoreProjectionStatusSet;
  invalidated_at: string;
  invalidation_reason: string;
  last_error: string;
}

export type AdminReadModelStoreProjectionStatus =
  | "ready"
  | "missing"
  | "incomplete"
  | "stale"
  | "unavailable";

export type AdminReadModelStoreProjectionReason =
  | "ready"
  | "missing_metadata"
  | "snapshot_incomplete"
  | "row_count_mismatch"
  | "store_unavailable";

export interface AdminReadModelStoreProjectionReadiness {
  status: AdminReadModelStoreProjectionStatus;
  reason: AdminReadModelStoreProjectionReason;
  scan_mode: Extract<AdminScanMode, "no-scan" | "full-reconcile">;
  requires_background_reconcile: boolean;
  safe_for_page_request: boolean;
  video_count: number;
  current_video_count: number;
}

export interface AdminReadModelStoreProjectionStatusSet {
  material_summary: AdminReadModelStoreProjectionReadiness;
  production_summary: AdminReadModelStoreProjectionReadiness;
  process_history: AdminReadModelStoreProjectionReadiness;
}

export interface AdminReadModelStoreSourceVideoPage {
  source: "admin-read-model-store";
  manifests: SourceVideoManifest[];
}

export type AdminReadModelStoreSourceVideoPageMissReason =
  | ""
  | "unsupported-status"
  | "store-not-fresh"
  | "incomplete-manifest-rows"
  | "unreadable-store";

export interface AdminReadModelStoreSourceVideoPageReadResult {
  page: AdminReadModelStoreSourceVideoPage | null;
  miss_reason: AdminReadModelStoreSourceVideoPageMissReason;
  freshness: AdminReadModelStoreFreshness | "not-applicable";
  missing_source_video_ids?: string[];
}

export interface AdminReadModelStorePreprocessJobPage extends AdminReadModelStoreSourceVideoPage {
  preprocess_jobs: AdminReadModelStorePreprocessJobSnapshot[];
}

export interface AdminReadModelStoreDashboardMaterialSummary {
  video_count: number;
  ready_video_count: number;
  total_duration_ms: number;
  ready_duration_ms: number;
  unprocessed_duration_ms: number;
  total_size_bytes: number;
}

export interface AdminReadModelStorePreprocessJobSnapshot {
  source_video_id: string;
  claimed_at?: string;
  completed_at?: string;
  indexed_at?: string;
  failed_at?: string;
}

export interface AdminReadModelStoreDashboardProductionSummary {
  completed_today_count: number;
  failed_today_count: number;
  average_video_process_ms: number;
}

export type AdminReadModelStorePreprocessProcessHistoryEvent =
  | "failed"
  | "indexed"
  | "completed"
  | "claimed"
  | "status";

export interface AdminReadModelStorePreprocessProcessHistoryFilters {
  source_folder_name: string;
  preprocess_status: PreprocessStatus | "";
  event_type: AdminReadModelStorePreprocessProcessHistoryEvent | "";
}

export interface AdminReadModelStorePreprocessProcessHistoryFilterOptions {
  source_folder_names: string[];
  preprocess_statuses: PreprocessStatus[];
  event_types: AdminReadModelStorePreprocessProcessHistoryEvent[];
}

export interface AdminReadModelStorePreprocessProcessHistoryItem {
  source_video_id: string;
  title: string;
  preprocess_status: PreprocessStatus;
  source_folder_name: string;
  visible_to_cutters: boolean;
  claimed_at: string;
  completed_at: string;
  indexed_at: string;
  failed_at: string;
  last_event_at: string;
  last_event_type: AdminReadModelStorePreprocessProcessHistoryEvent;
  elapsed_ms: number;
}

export interface AdminReadModelStorePreprocessProcessHistorySummary {
  returned_count: number;
  completed_count: number;
  failed_count: number;
  active_count: number;
  average_process_ms: number;
  tracked_count: number;
  tracked_completed_count: number;
  tracked_failed_count: number;
  tracked_active_count: number;
  tracked_average_process_ms: number;
  window_start_at: string;
  newest_event_at: string;
  oldest_event_at: string;
  status_counts: Record<PreprocessStatus, number>;
  event_counts: Record<AdminReadModelStorePreprocessProcessHistoryEvent, number>;
  source_folder_summaries: AdminReadModelStorePreprocessProcessHistorySourceFolderSummary[];
  daily_trend: AdminReadModelStorePreprocessProcessHistoryTrendBucket[];
}

export interface AdminReadModelStorePreprocessProcessHistorySourceFolderSummary {
  source_folder_name: string;
  tracked_count: number;
  completed_count: number;
  failed_count: number;
  active_count: number;
  average_process_ms: number;
  newest_event_at: string;
}

export interface AdminReadModelStorePreprocessProcessHistoryTrendBucket {
  date: string;
  tracked_count: number;
  completed_count: number;
  failed_count: number;
  active_count: number;
  average_process_ms: number;
}

export interface AdminReadModelStorePreprocessProcessHistory {
  source: "admin-read-model-store";
  generated_at: string;
  library_updated_at: string;
  window_days: number;
  limit: number;
  filters: AdminReadModelStorePreprocessProcessHistoryFilters;
  filter_options: AdminReadModelStorePreprocessProcessHistoryFilterOptions;
  summary: AdminReadModelStorePreprocessProcessHistorySummary;
  items: AdminReadModelStorePreprocessProcessHistoryItem[];
}

export type AdminReadModelStorePreprocessProcessHistoryReadinessReason =
  | "ready"
  | "missing_library"
  | "store_missing"
  | "store_unreadable"
  | "store_stale"
  | "snapshot_incomplete"
  | "snapshot_row_count_mismatch"
  | "table_row_count_mismatch"
  | "projection_incomplete"
  | "projection_row_count_mismatch";

export interface AdminReadModelStorePreprocessProcessHistoryReadiness {
  source: "admin-read-model-store";
  store_path: string;
  store_exists: boolean;
  store_freshness: AdminReadModelStoreFreshness;
  generated_at: string;
  library_updated_at: string;
  current_library_updated_at: string;
  scan_mode: Extract<AdminScanMode, "no-scan">;
  ready_for_process_history: boolean;
  reason: AdminReadModelStorePreprocessProcessHistoryReadinessReason;
  expected_job_snapshot_rows: number;
  snapshot_complete: boolean;
  snapshot_metadata_row_count: number | null;
  snapshot_table_row_count: number | null;
  projection_complete: boolean;
  projection_metadata_row_count: number | null;
  projection_table_row_count: number | null;
  metadata_row_count_matches: boolean;
  table_row_count_matches: boolean;
  projection_row_count_matches: boolean;
  last_error: string;
}

export type AdminReadModelStoreWriteThroughSkipReason =
  | "missing"
  | "invalid_manifest"
  | "row_count_mismatch"
  | "counts_mismatch"
  | "unreadable";

export interface AdminReadModelStoreWriteThroughResult {
  applied: boolean;
  reason: "updated" | AdminReadModelStoreWriteThroughSkipReason;
}

export type AdminReadModelStoreInvalidationReason =
  | "source-folder-scope-change"
  | "library-scan-or-init"
  | "manual";

export interface AdminReadModelStoreInvalidationResult {
  applied: boolean;
  reason: "invalidated" | "missing" | "unreadable";
  invalidated_at: string;
  invalidation_reason: AdminReadModelStoreInvalidationReason;
}

export type AdminReadModelStoreReconciliationAction =
  | "none"
  | "build"
  | "rebuild"
  | "manual-review";

export type AdminReadModelStoreReconciliationReason =
  | "fresh"
  | "missing_library"
  | "missing_store"
  | "stale_store"
  | "unreadable_store";

export interface AdminReadModelStoreReconciliationPlan {
  store_path: string;
  action: AdminReadModelStoreReconciliationAction;
  reason: AdminReadModelStoreReconciliationReason;
  scan_mode: Extract<AdminScanMode, "no-scan" | "full-reconcile">;
  requires_background_reconcile: boolean;
  safe_for_page_request: boolean;
}

export type AdminReadModelStoreReconciliationSkipReason =
  | "missing_library"
  | "invalid_manifest"
  | "duplicate_source_video_id"
  | "video_count_mismatch"
  | "counts_mismatch"
  | "unreadable";

export interface AdminReadModelStoreReconciliationResult {
  applied: boolean;
  reason: "rebuilt" | AdminReadModelStoreReconciliationSkipReason;
  snapshot_video_count: number;
  counts_by_status: Record<PreprocessStatus, number>;
  source_video_id: string;
}

interface StoreSourceVideoRow {
  source_video_id: string;
  preprocess_status: PreprocessStatus;
  title: string;
  relative_path: string;
  visible_to_cutters: number;
  duration_ms: number;
  cover_path: string;
  source_folder_name: string;
  manifest_json: string;
  position: number;
}

interface StorePreprocessProcessHistoryRow {
  source_video_id: string;
  title: string;
  preprocess_status: PreprocessStatus;
  source_folder_name: string;
  visible_to_cutters: number;
  claimed_at: string;
  completed_at: string;
  indexed_at: string;
  failed_at: string;
  last_event_at: string;
  last_event_type: AdminReadModelStorePreprocessProcessHistoryEvent;
  elapsed_ms: number;
  active_flag: number;
  completed_flag: number;
  failed_flag: number;
}

export function adminReadModelStoreRoot(libraryRoot: string): string {
  return path.join(adminMixlabRoot(libraryRoot), "admin-read-model");
}

export function adminReadModelStorePath(libraryRoot: string): string {
  return path.join(adminReadModelStoreRoot(libraryRoot), ADMIN_READ_MODEL_STORE_FILE_NAME);
}

function emptyCounts(): Record<PreprocessStatus, number> {
  return {
    unprocessed: 0,
    queued: 0,
    processing: 0,
    ready: 0,
    failed: 0,
    "index-required": 0
  };
}

function emptyProcessHistoryEventCounts(): Record<AdminReadModelStorePreprocessProcessHistoryEvent, number> {
  return {
    failed: 0,
    indexed: 0,
    completed: 0,
    claimed: 0,
    status: 0
  };
}

function countsMatchLibrary(
  counts: Record<PreprocessStatus, number>,
  library: LibraryCounts
): boolean {
  return counts.ready === library.ready_video_count &&
    counts.processing === library.processing_video_count &&
    counts.queued === library.queued_video_count &&
    counts.unprocessed === library.unprocessed_video_count &&
    counts.failed === library.failed_video_count &&
    counts["index-required"] === library.index_required_video_count;
}

function countSourceVideoManifestsByStatus(manifests: SourceVideoManifest[]): Record<PreprocessStatus, number> {
  const counts = emptyCounts();
  for (const manifest of manifests) {
    if (adminSourceVideoStatusList.includes(manifest.preprocess_status)) {
      counts[manifest.preprocess_status] += 1;
    }
  }
  return counts;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function isTransientSqliteReadError(error: unknown): boolean {
  const record = typeof error === "object" && error !== null
    ? error as { code?: unknown; message?: unknown }
    : {};
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : String(error);
  return code === "SQLITE_BUSY" ||
    code === "SQLITE_LOCKED" ||
    /SQLITE_BUSY|SQLITE_LOCKED|database is locked|database is busy/i.test(message);
}

function openReadOnlyAdminReadModelStore(storePath: string): DatabaseSync {
  const db = new DatabaseSync(`file:${storePath}?mode=ro`);
  db.exec(`PRAGMA busy_timeout = ${ADMIN_READ_MODEL_STORE_RO_BUSY_TIMEOUT_MS}`);
  return db;
}

function createSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS source_video_status (
      source_video_id TEXT PRIMARY KEY,
      preprocess_status TEXT NOT NULL,
      title TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      visible_to_cutters INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      cover_path TEXT NOT NULL,
      source_folder_name TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      position INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_admin_source_video_status_status_position
      ON source_video_status(preprocess_status, position);
    CREATE INDEX IF NOT EXISTS idx_admin_source_video_status_visible_position
      ON source_video_status(visible_to_cutters, position);
    CREATE INDEX IF NOT EXISTS idx_admin_source_video_status_history_cover
      ON source_video_status(source_video_id, preprocess_status, source_folder_name, visible_to_cutters, title);

    CREATE TABLE IF NOT EXISTS preprocess_job_status (
      source_video_id TEXT PRIMARY KEY,
      claimed_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      failed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_admin_preprocess_job_completed
      ON preprocess_job_status(completed_at);
    CREATE INDEX IF NOT EXISTS idx_admin_preprocess_job_indexed
      ON preprocess_job_status(indexed_at);
    CREATE INDEX IF NOT EXISTS idx_admin_preprocess_job_failed
      ON preprocess_job_status(failed_at);

    CREATE TABLE IF NOT EXISTS preprocess_process_history (
      source_video_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      preprocess_status TEXT NOT NULL,
      source_folder_name TEXT NOT NULL,
      visible_to_cutters INTEGER NOT NULL,
      claimed_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      failed_at TEXT NOT NULL,
      last_event_at TEXT NOT NULL,
      last_event_type TEXT NOT NULL,
      elapsed_ms INTEGER NOT NULL,
      active_flag INTEGER NOT NULL,
      completed_flag INTEGER NOT NULL,
      failed_flag INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_admin_process_history_sort
      ON preprocess_process_history(last_event_at DESC, source_video_id DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_process_history_status_sort
      ON preprocess_process_history(preprocess_status, last_event_at DESC, source_video_id DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_process_history_folder_sort
      ON preprocess_process_history(source_folder_name, last_event_at DESC, source_video_id DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_process_history_event_sort
      ON preprocess_process_history(last_event_type, last_event_at DESC, source_video_id DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_process_history_active_sort
      ON preprocess_process_history(active_flag, last_event_at DESC, source_video_id DESC);
  `);
}

function metadataRows(model: AdminSourceVideoStatusReadModel): Array<[string, string]> {
  return storeMetadataRows({
    generated_at: model.generated_at,
    library_updated_at: model.library_updated_at,
    video_count: model.video_count,
    counts_by_status: countSourceVideoStatusReadModelIdsByStatus(model)
  });
}

function storeMetadataRows(input: {
  generated_at: string;
  library_updated_at: string;
  video_count: number;
  counts_by_status?: Record<PreprocessStatus, number>;
}): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["schema_version", ADMIN_READ_MODEL_STORE_SCHEMA_VERSION],
    ["model_name", "admin-read-model-v1"],
    ["source_model", "source-video-status-read-model-v1"],
    ["generated_at", input.generated_at],
    ["library_updated_at", input.library_updated_at],
    ["video_count", String(input.video_count)]
  ];

  if (input.counts_by_status) {
    for (const status of adminSourceVideoStatusList) {
      rows.push([statusCountMetadataKey(status), String(input.counts_by_status[status])]);
    }
  }

  return rows;
}

function statusCountMetadataKey(status: PreprocessStatus): string {
  return `count_${status.replace("-", "_")}`;
}

function dashboardMaterialSummaryMetadataKey(
  field: keyof AdminReadModelStoreDashboardMaterialSummary
): string {
  return `dashboard_material_${field}`;
}

function dashboardProductionSummaryMetadataKey(field: "average_video_process_ms"): string {
  return `dashboard_production_${field}`;
}

function preprocessJobSnapshotMetadataKey(field: "complete" | "row_count"): string {
  return `preprocess_job_snapshot_${field}`;
}

function processHistoryProjectionMetadataKey(field: "complete" | "row_count"): string {
  return `process_history_projection_${field}`;
}

function processHistoryDefaultMetadataKey(
  field: "window_days" | "generated_at" | "summary_json" | "filter_options_json"
): string {
  return `process_history_default_${field}`;
}

function countSourceVideoStatusReadModelIdsByStatus(
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

function sourceFolderNameFromRelativePath(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 1 ? parts[0] ?? "" : "";
}

function sourceVideoManifestRowsFromModel(
  model: AdminSourceVideoStatusReadModel,
  fullManifests?: SourceVideoManifest[]
): StoreSourceVideoRow[] {
  const manifestsById = new Map<string, SourceVideoManifest>();
  for (const manifest of fullManifests ?? []) {
    manifestsById.set(manifest.source_video_id, manifest);
  }
  for (const manifests of Object.values(model.manifests_by_status ?? {})) {
    for (const manifest of manifests ?? []) {
      manifestsById.set(manifest.source_video_id, manifest);
    }
  }
  for (const manifest of model.default_source_video_page?.manifests ?? []) {
    manifestsById.set(manifest.source_video_id, manifest);
  }

  const rows: StoreSourceVideoRow[] = [];
  for (const status of adminSourceVideoStatusList) {
    for (const sourceVideoId of model.ids_by_status[status]) {
      const manifest = manifestsById.get(sourceVideoId);
      rows.push(manifest ? storeSourceVideoRowFromManifest(manifest) : emptyStoreSourceVideoRow({
        source_video_id: sourceVideoId,
        preprocess_status: status
      }));
    }
  }

  return rows.sort((left, right) => left.position - right.position);
}

function dashboardMaterialSummaryFromManifests(input: {
  model: AdminSourceVideoStatusReadModel;
  manifests?: SourceVideoManifest[];
}): AdminReadModelStoreDashboardMaterialSummary | null {
  const manifests = input.manifests ?? [];
  if (manifests.length !== input.model.video_count) {
    return null;
  }

  const expectedCounts = countSourceVideoStatusReadModelIdsByStatus(input.model);
  const actualCounts = countSourceVideoManifestsByStatus(manifests);
  for (const status of adminSourceVideoStatusList) {
    if (actualCounts[status] !== expectedCounts[status]) {
      return null;
    }
  }

  const seen = new Set<string>();
  let totalDurationMs = 0;
  let readyDurationMs = 0;
  let unprocessedDurationMs = 0;
  let totalSizeBytes = 0;

  for (const manifest of manifests) {
    const validation = validateSourceVideoManifest(manifest);
    if (!validation.ok || seen.has(manifest.source_video_id)) {
      return null;
    }
    seen.add(manifest.source_video_id);
    const durationMs = Math.max(0, Math.floor(manifest.duration_ms));
    const fileSize = Math.max(0, Math.floor(manifest.file_size));
    totalDurationMs += durationMs;
    totalSizeBytes += fileSize;
    if (manifest.preprocess_status === "ready") {
      readyDurationMs += durationMs;
    }
    if (manifest.preprocess_status === "unprocessed") {
      unprocessedDurationMs += durationMs;
    }
  }

  return {
    video_count: manifests.length,
    ready_video_count: actualCounts.ready,
    total_duration_ms: totalDurationMs,
    ready_duration_ms: readyDurationMs,
    unprocessed_duration_ms: unprocessedDurationMs,
    total_size_bytes: totalSizeBytes
  };
}

function preprocessJobSnapshotRowsFromInput(input: {
  model: AdminSourceVideoStatusReadModel;
  preprocess_jobs?: AdminReadModelStorePreprocessJobSnapshot[];
}): AdminReadModelStorePreprocessJobSnapshot[] | null {
  const jobs = input.preprocess_jobs ?? [];
  if (jobs.length !== input.model.video_count) {
    return null;
  }

  const expectedIds = new Set<string>();
  for (const status of adminSourceVideoStatusList) {
    for (const sourceVideoId of input.model.ids_by_status[status]) {
      expectedIds.add(sourceVideoId);
    }
  }

  const seen = new Set<string>();
  const rows: AdminReadModelStorePreprocessJobSnapshot[] = [];
  for (const job of jobs) {
    if (!expectedIds.has(job.source_video_id) || seen.has(job.source_video_id)) {
      return null;
    }
    seen.add(job.source_video_id);
    rows.push({
      source_video_id: job.source_video_id,
      claimed_at: job.claimed_at ?? "",
      completed_at: job.completed_at ?? "",
      indexed_at: job.indexed_at ?? "",
      failed_at: job.failed_at ?? ""
    });
  }

  return rows.sort((left, right) =>
    numericSourceVideoId(left.source_video_id) - numericSourceVideoId(right.source_video_id)
  );
}

function preprocessProcessHistoryRowFromSourceAndJob(input: {
  source: StoreSourceVideoRow;
  job: AdminReadModelStorePreprocessJobSnapshot;
}): StorePreprocessProcessHistoryRow {
  const event = preprocessProcessHistoryEvent({
    claimed_at: input.job.claimed_at ?? "",
    completed_at: input.job.completed_at ?? "",
    indexed_at: input.job.indexed_at ?? "",
    failed_at: input.job.failed_at ?? ""
  });
  const active =
    input.source.preprocess_status === "queued" ||
    input.source.preprocess_status === "processing" ||
    input.source.preprocess_status === "failed" ||
    input.source.preprocess_status === "index-required";

  return {
    source_video_id: input.source.source_video_id,
    title: input.source.title,
    preprocess_status: input.source.preprocess_status,
    source_folder_name: input.source.source_folder_name,
    visible_to_cutters: input.source.visible_to_cutters,
    claimed_at: input.job.claimed_at ?? "",
    completed_at: input.job.completed_at ?? "",
    indexed_at: input.job.indexed_at ?? "",
    failed_at: input.job.failed_at ?? "",
    last_event_at: event.last_event_at,
    last_event_type: event.last_event_type,
    elapsed_ms: preprocessProcessElapsedMs({
      claimed_at: input.job.claimed_at ?? "",
      completed_at: input.job.completed_at ?? "",
      indexed_at: input.job.indexed_at ?? "",
      failed_at: input.job.failed_at ?? ""
    }),
    active_flag: active ? 1 : 0,
    completed_flag: input.job.completed_at || input.job.indexed_at ? 1 : 0,
    failed_flag: input.job.failed_at ? 1 : 0
  };
}

function processHistoryProjectionRowsFromInput(input: {
  source_rows: StoreSourceVideoRow[];
  preprocess_jobs: AdminReadModelStorePreprocessJobSnapshot[] | null;
}): StorePreprocessProcessHistoryRow[] | null {
  if (!input.preprocess_jobs || input.preprocess_jobs.length !== input.source_rows.length) {
    return null;
  }

  const jobsById = new Map(input.preprocess_jobs.map((job) => [job.source_video_id, job]));
  const rows: StorePreprocessProcessHistoryRow[] = [];
  for (const source of input.source_rows) {
    const job = jobsById.get(source.source_video_id);
    if (!job) {
      return null;
    }
    rows.push(preprocessProcessHistoryRowFromSourceAndJob({
      source,
      job
    }));
  }

  return rows.sort((left, right) =>
    numericSourceVideoId(left.source_video_id) - numericSourceVideoId(right.source_video_id)
  );
}

function processHistoryItemFromProjectionRow(input: {
  source_video_id: string;
  title: string;
  preprocess_status: PreprocessStatus;
  source_folder_name: string;
  visible_to_cutters: number;
  claimed_at: string;
  completed_at: string;
  indexed_at: string;
  failed_at: string;
  last_event_at: string;
  last_event_type: AdminReadModelStorePreprocessProcessHistoryEvent;
  elapsed_ms: number;
}): AdminReadModelStorePreprocessProcessHistoryItem {
  return {
    source_video_id: input.source_video_id,
    title: input.title,
    preprocess_status: input.preprocess_status,
    source_folder_name: input.source_folder_name,
    visible_to_cutters: input.visible_to_cutters === 1,
    claimed_at: input.claimed_at,
    completed_at: input.completed_at,
    indexed_at: input.indexed_at,
    failed_at: input.failed_at,
    last_event_at: input.last_event_at,
    last_event_type: input.last_event_type,
    elapsed_ms: input.elapsed_ms
  };
}

function processHistoryItemTrackedInWindow(input: {
  item: AdminReadModelStorePreprocessProcessHistoryItem;
  window_start_at: string;
}): boolean {
  return input.item.last_event_at >= input.window_start_at ||
    input.item.preprocess_status === "queued" ||
    input.item.preprocess_status === "processing" ||
    input.item.preprocess_status === "failed" ||
    input.item.preprocess_status === "index-required";
}

function sortProcessHistoryItems(
  items: AdminReadModelStorePreprocessProcessHistoryItem[]
): AdminReadModelStorePreprocessProcessHistoryItem[] {
  return [...items].sort((left, right) =>
    right.last_event_at.localeCompare(left.last_event_at) ||
    right.source_video_id.localeCompare(left.source_video_id)
  );
}

function emptyStoreSourceVideoRow(input: {
  source_video_id: string;
  preprocess_status: PreprocessStatus;
}): StoreSourceVideoRow {
  return {
    source_video_id: input.source_video_id,
    preprocess_status: input.preprocess_status,
    title: "",
    relative_path: "",
    visible_to_cutters: 0,
    duration_ms: 0,
    cover_path: "",
    source_folder_name: "",
    manifest_json: "",
    position: numericSourceVideoId(input.source_video_id)
  };
}

function storeSourceVideoRowFromManifest(manifest: SourceVideoManifest): StoreSourceVideoRow {
  return {
    source_video_id: manifest.source_video_id,
    preprocess_status: manifest.preprocess_status,
    title: manifest.title,
    relative_path: manifest.relative_path,
    visible_to_cutters: manifest.visible_to_cutters ? 1 : 0,
    duration_ms: Math.max(0, Math.floor(manifest.duration_ms)),
    cover_path: manifest.cover_path ?? "",
    source_folder_name: sourceFolderNameFromRelativePath(manifest.relative_path),
    manifest_json: JSON.stringify(manifest),
    position: numericSourceVideoId(manifest.source_video_id)
  };
}

export async function writeAdminSourceVideoStatusReadModelStore(input: {
  library_root: string;
  model: AdminSourceVideoStatusReadModel;
  manifests?: SourceVideoManifest[];
  preprocess_jobs?: AdminReadModelStorePreprocessJobSnapshot[];
}): Promise<void> {
  await mkdir(adminReadModelStoreRoot(input.library_root), { recursive: true });

  const db = new DatabaseSync(adminReadModelStorePath(input.library_root));

  try {
    createSchema(db);
    db.exec("BEGIN");
    const preservedManifests = input.manifests === undefined
      ? readCompleteSourceVideoManifestRows(db, {
          expected_row_count: input.model.video_count,
          library_updated_at: input.model.library_updated_at
        })
      : null;
    const preservedPreprocessJobs = input.preprocess_jobs === undefined
      ? readCompletePreprocessJobSnapshotRows(db, input.model.video_count)
      : null;
    const manifestsForWrite = input.manifests ?? preservedManifests ?? undefined;
    const sourceVideoRows = sourceVideoManifestRowsFromModel(input.model, manifestsForWrite);
    const preprocessJobRows = preprocessJobSnapshotRowsFromInput({
      model: input.model,
      preprocess_jobs: input.preprocess_jobs ?? preservedPreprocessJobs ?? undefined
    });
    db.exec("DELETE FROM metadata");
    db.exec("DELETE FROM source_video_status");
    db.exec("DELETE FROM preprocess_job_status");

    replaceMetadata(db, metadataRows(input.model));
    replaceDashboardMaterialSummaryMetadata(db, dashboardMaterialSummaryFromManifests({
      model: input.model,
      manifests: manifestsForWrite
    }));
    replacePreprocessJobSnapshotMetadataAndRows(db, preprocessJobRows);

    for (const row of sourceVideoRows) {
      upsertSourceVideoStatusRow(db, row);
    }
    replacePreprocessProcessHistoryProjectionRows(
      db,
      processHistoryProjectionRowsFromInput({
        source_rows: sourceVideoRows,
        preprocess_jobs: preprocessJobRows
      }),
      input.model.generated_at
    );

    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Transaction may not have started.
    }
    throw error;
  } finally {
    db.close();
  }
}

export async function markAdminReadModelStoreStale(input: {
  library_root: string;
  reason: AdminReadModelStoreInvalidationReason;
  invalidated_at: string;
}): Promise<AdminReadModelStoreInvalidationResult> {
  if (!(await fileExists(adminReadModelStorePath(input.library_root)))) {
    return {
      applied: false,
      reason: "missing",
      invalidated_at: input.invalidated_at,
      invalidation_reason: input.reason
    };
  }

  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(adminReadModelStorePath(input.library_root));
    createSchema(db);
    db.exec("BEGIN");
    replaceMetadata(db, [
      ["invalidated_at", input.invalidated_at],
      ["invalidation_reason", input.reason]
    ]);
    db.exec("COMMIT");
    return {
      applied: true,
      reason: "invalidated",
      invalidated_at: input.invalidated_at,
      invalidation_reason: input.reason
    };
  } catch {
    try {
      db?.exec("ROLLBACK");
    } catch {
      // Transaction may not have started.
    }
    return {
      applied: false,
      reason: "unreadable",
      invalidated_at: input.invalidated_at,
      invalidation_reason: input.reason
    };
  } finally {
    db?.close();
  }
}

export function planAdminReadModelStoreReconciliation(input: {
  status: AdminReadModelStoreStatus;
  library_available: boolean;
}): AdminReadModelStoreReconciliationPlan {
  if (!input.library_available) {
    return {
      store_path: input.status.path,
      action: "manual-review",
      reason: "missing_library",
      scan_mode: "no-scan",
      requires_background_reconcile: false,
      safe_for_page_request: false
    };
  }

  if (input.status.freshness === "fresh") {
    return {
      store_path: input.status.path,
      action: "none",
      reason: "fresh",
      scan_mode: "no-scan",
      requires_background_reconcile: false,
      safe_for_page_request: true
    };
  }

  if (input.status.freshness === "missing") {
    return {
      store_path: input.status.path,
      action: "build",
      reason: "missing_store",
      scan_mode: "full-reconcile",
      requires_background_reconcile: true,
      safe_for_page_request: false
    };
  }

  if (input.status.freshness === "stale") {
    return {
      store_path: input.status.path,
      action: "rebuild",
      reason: "stale_store",
      scan_mode: "full-reconcile",
      requires_background_reconcile: true,
      safe_for_page_request: false
    };
  }

  return {
    store_path: input.status.path,
    action: "manual-review",
    reason: "unreadable_store",
    scan_mode: "no-scan",
    requires_background_reconcile: false,
    safe_for_page_request: false
  };
}

export async function reconcileAdminReadModelStoreFromManifestSnapshot(input: {
  library_root: string;
  library: LibraryCounts & { updated_at?: string } | null;
  manifests: SourceVideoManifest[];
  preprocess_jobs?: AdminReadModelStorePreprocessJobSnapshot[];
  default_page_limit: number;
  generated_at?: string;
}): Promise<AdminReadModelStoreReconciliationResult> {
  const emptyResultCounts = emptyCounts();
  if (!input.library) {
    return {
      applied: false,
      reason: "missing_library",
      snapshot_video_count: input.manifests.length,
      counts_by_status: emptyResultCounts,
      source_video_id: ""
    };
  }

  if (input.manifests.length !== input.library.video_count) {
    return {
      applied: false,
      reason: "video_count_mismatch",
      snapshot_video_count: input.manifests.length,
      counts_by_status: countSourceVideoManifestsByStatus(input.manifests),
      source_video_id: ""
    };
  }

  const seen = new Set<string>();
  for (const manifest of input.manifests) {
    const validation = validateSourceVideoManifest(manifest);
    if (!validation.ok) {
      return {
        applied: false,
        reason: "invalid_manifest",
        snapshot_video_count: input.manifests.length,
        counts_by_status: countSourceVideoManifestsByStatus(input.manifests),
        source_video_id: manifest.source_video_id
      };
    }
    if (seen.has(manifest.source_video_id)) {
      return {
        applied: false,
        reason: "duplicate_source_video_id",
        snapshot_video_count: input.manifests.length,
        counts_by_status: countSourceVideoManifestsByStatus(input.manifests),
        source_video_id: manifest.source_video_id
      };
    }
    seen.add(manifest.source_video_id);
  }

  const counts = countSourceVideoManifestsByStatus(input.manifests);
  if (!countsMatchLibrary(counts, input.library)) {
    return {
      applied: false,
      reason: "counts_mismatch",
      snapshot_video_count: input.manifests.length,
      counts_by_status: counts,
      source_video_id: ""
    };
  }

  try {
    await writeAdminSourceVideoStatusReadModelStore({
      library_root: input.library_root,
      model: buildAdminSourceVideoStatusReadModel({
        library: input.library,
        manifests: input.manifests,
        default_page_limit: input.default_page_limit,
        generated_at: input.generated_at
      }),
      manifests: input.manifests,
      preprocess_jobs: input.preprocess_jobs
    });
    const status = await readAdminReadModelStoreStatus({
      library_root: input.library_root,
      library: input.library
    });
    if (status.freshness !== "fresh") {
      return {
        applied: false,
        reason: "counts_mismatch",
        snapshot_video_count: input.manifests.length,
        counts_by_status: status.counts_by_status,
        source_video_id: ""
      };
    }
    return {
      applied: true,
      reason: "rebuilt",
      snapshot_video_count: input.manifests.length,
      counts_by_status: counts,
      source_video_id: ""
    };
  } catch {
    return {
      applied: false,
      reason: "unreadable",
      snapshot_video_count: input.manifests.length,
      counts_by_status: counts,
      source_video_id: ""
    };
  }
}

function replaceMetadata(db: DatabaseSync, rows: Array<[string, string]>): void {
  const insertMetadata = db.prepare(`
    INSERT INTO metadata (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  for (const [key, value] of rows) {
    insertMetadata.run(key, value);
  }
}

function replaceDashboardMaterialSummaryMetadata(
  db: DatabaseSync,
  summary: AdminReadModelStoreDashboardMaterialSummary | null
): void {
  const fields: Array<keyof AdminReadModelStoreDashboardMaterialSummary> = [
    "video_count",
    "ready_video_count",
    "total_duration_ms",
    "ready_duration_ms",
    "unprocessed_duration_ms",
    "total_size_bytes"
  ];
  const deleteMetadata = db.prepare("DELETE FROM metadata WHERE key = ?");
  for (const field of fields) {
    deleteMetadata.run(dashboardMaterialSummaryMetadataKey(field));
  }
  if (!summary) {
    return;
  }
  replaceMetadata(db, fields.map((field) => [
    dashboardMaterialSummaryMetadataKey(field),
    String(summary[field])
  ]));
}

function replaceDashboardProductionSummaryMetadata(
  db: DatabaseSync,
  input: { average_video_process_ms: number } | null
): void {
  const key = dashboardProductionSummaryMetadataKey("average_video_process_ms");
  db.prepare("DELETE FROM metadata WHERE key = ?").run(key);
  if (!input) {
    return;
  }
  replaceMetadata(db, [[key, String(Math.max(0, Math.round(input.average_video_process_ms)))]]);
}

function readDashboardProductionAverageFromMetadata(
  metadata: Map<string, string>
): number | null {
  return readNonNegativeIntegerMetadata(
    metadata,
    dashboardProductionSummaryMetadataKey("average_video_process_ms")
  );
}

function replacePreprocessJobSnapshotMetadataAndRows(
  db: DatabaseSync,
  rows: AdminReadModelStorePreprocessJobSnapshot[] | null
): void {
  db.prepare("DELETE FROM metadata WHERE key = ?").run(preprocessJobSnapshotMetadataKey("complete"));
  db.prepare("DELETE FROM metadata WHERE key = ?").run(preprocessJobSnapshotMetadataKey("row_count"));
  replaceDashboardProductionSummaryMetadata(db, null);
  db.exec("DELETE FROM preprocess_job_status");

  if (!rows) {
    replaceMetadata(db, [
      [preprocessJobSnapshotMetadataKey("complete"), "false"],
      [preprocessJobSnapshotMetadataKey("row_count"), "0"]
    ]);
    return;
  }

  for (const row of rows) {
    upsertPreprocessJobStatusRow(db, row);
  }
  replaceDashboardProductionSummaryMetadata(db, {
    average_video_process_ms: dashboardProductionAverageProcessMsFromRows(rows)
  });
  replaceMetadata(db, [
    [preprocessJobSnapshotMetadataKey("complete"), "true"],
    [preprocessJobSnapshotMetadataKey("row_count"), String(rows.length)]
  ]);
}

function clearPreprocessProcessHistoryDefaultMetadata(db: DatabaseSync): void {
  for (const field of ["window_days", "generated_at", "summary_json", "filter_options_json"] as const) {
    db.prepare("DELETE FROM metadata WHERE key = ?").run(processHistoryDefaultMetadataKey(field));
  }
}

function replacePreprocessProcessHistoryDefaultMetadata(input: {
  db: DatabaseSync;
  rows: StorePreprocessProcessHistoryRow[];
  generated_at: string;
}): void {
  const filters = normalizeProcessHistoryFilters();
  const windowStartAt = preprocessProcessHistoryWindowStart({
    now: input.generated_at,
    window_days: PROCESS_HISTORY_DEFAULT_WINDOW_DAYS
  });
  const trackedItems = sortProcessHistoryItems(
    input.rows
      .map(processHistoryItemFromProjectionRow)
      .filter((item) => processHistoryItemTrackedInWindow({
        item,
        window_start_at: windowStartAt
      }))
  );
  const items = trackedItems.slice(0, PROCESS_HISTORY_DEFAULT_PAGE_LIMIT);
  const summary = summarizePreprocessProcessHistory({
    items,
    tracked_items: trackedItems,
    window_start_at: windowStartAt
  });
  const filterOptions = processHistoryFilterOptions({
    items: trackedItems,
    filters
  });

  replaceMetadata(input.db, [
    [processHistoryDefaultMetadataKey("window_days"), String(PROCESS_HISTORY_DEFAULT_WINDOW_DAYS)],
    [processHistoryDefaultMetadataKey("generated_at"), input.generated_at],
    [processHistoryDefaultMetadataKey("summary_json"), JSON.stringify(summary)],
    [processHistoryDefaultMetadataKey("filter_options_json"), JSON.stringify(filterOptions)]
  ]);
}

function markPreprocessProcessHistoryProjectionIncomplete(db: DatabaseSync): void {
  db.prepare("DELETE FROM metadata WHERE key = ?").run(processHistoryProjectionMetadataKey("complete"));
  db.prepare("DELETE FROM metadata WHERE key = ?").run(processHistoryProjectionMetadataKey("row_count"));
  clearPreprocessProcessHistoryDefaultMetadata(db);
  db.exec("DELETE FROM preprocess_process_history");
  replaceMetadata(db, [
    [processHistoryProjectionMetadataKey("complete"), "false"],
    [processHistoryProjectionMetadataKey("row_count"), "0"]
  ]);
}

function replacePreprocessProcessHistoryProjectionRows(
  db: DatabaseSync,
  rows: StorePreprocessProcessHistoryRow[] | null,
  generatedAt: string
): void {
  db.prepare("DELETE FROM metadata WHERE key = ?").run(processHistoryProjectionMetadataKey("complete"));
  db.prepare("DELETE FROM metadata WHERE key = ?").run(processHistoryProjectionMetadataKey("row_count"));
  clearPreprocessProcessHistoryDefaultMetadata(db);
  db.exec("DELETE FROM preprocess_process_history");

  if (!rows) {
    replaceMetadata(db, [
      [processHistoryProjectionMetadataKey("complete"), "false"],
      [processHistoryProjectionMetadataKey("row_count"), "0"]
    ]);
    return;
  }

  for (const row of rows) {
    upsertPreprocessProcessHistoryRow(db, row);
  }
  replaceMetadata(db, [
    [processHistoryProjectionMetadataKey("complete"), "true"],
    [processHistoryProjectionMetadataKey("row_count"), String(rows.length)]
  ]);
  replacePreprocessProcessHistoryDefaultMetadata({
    db,
    rows,
    generated_at: generatedAt
  });
}

function replacePreprocessProcessHistoryProjectionFromTables(input: {
  db: DatabaseSync;
  expected_row_count: number;
  generated_at: string;
}): void {
  const sourceRows = input.db.prepare(`
    SELECT
      source_video_id,
      preprocess_status,
      title,
      relative_path,
      visible_to_cutters,
      duration_ms,
      cover_path,
      source_folder_name,
      manifest_json,
      position
    FROM source_video_status
    ORDER BY position
  `).all() as unknown as StoreSourceVideoRow[];
  const jobRows = input.db.prepare(`
    SELECT source_video_id, claimed_at, completed_at, indexed_at, failed_at
    FROM preprocess_job_status
  `).all() as unknown as AdminReadModelStorePreprocessJobSnapshot[];

  if (
    sourceRows.length !== input.expected_row_count ||
    jobRows.length !== input.expected_row_count
  ) {
    markPreprocessProcessHistoryProjectionIncomplete(input.db);
    return;
  }

  replacePreprocessProcessHistoryProjectionRows(
    input.db,
    processHistoryProjectionRowsFromInput({
      source_rows: sourceRows,
      preprocess_jobs: jobRows
    }),
    input.generated_at
  );
}

function readCompleteSourceVideoManifestRows(
  db: DatabaseSync,
  input: {
    expected_row_count: number;
    library_updated_at: string;
  }
): SourceVideoManifest[] | null {
  try {
    const metadata = readMetadata(db);
    const metadataVideoCount = readNonNegativeIntegerMetadata(metadata, "video_count");
    if (
      metadataVideoCount !== input.expected_row_count ||
      metadata.get("library_updated_at") !== input.library_updated_at
    ) {
      return null;
    }

    const rows = db.prepare(`
      SELECT manifest_json
      FROM source_video_status
      WHERE manifest_json <> ''
    `).all() as Array<{ manifest_json: string }>;

    if (rows.length !== input.expected_row_count) {
      return null;
    }

    const seen = new Set<string>();
    const manifests: SourceVideoManifest[] = [];
    for (const row of rows) {
      const parsed = JSON.parse(row.manifest_json) as SourceVideoManifest;
      const validation = validateSourceVideoManifest(parsed);
      if (!validation.ok || seen.has(parsed.source_video_id)) {
        return null;
      }
      seen.add(parsed.source_video_id);
      manifests.push(parsed);
    }

    return manifests.sort((left, right) =>
      numericSourceVideoId(left.source_video_id) - numericSourceVideoId(right.source_video_id)
    );
  } catch {
    return null;
  }
}

function readCompletePreprocessJobSnapshotRows(
  db: DatabaseSync,
  expectedRowCount: number
): AdminReadModelStorePreprocessJobSnapshot[] | null {
  try {
    const metadata = readMetadata(db);
    const snapshotComplete = metadata.get(preprocessJobSnapshotMetadataKey("complete")) === "true";
    const snapshotRowCount = readNonNegativeIntegerMetadata(
      metadata,
      preprocessJobSnapshotMetadataKey("row_count")
    );

    if (
      !snapshotComplete ||
      snapshotRowCount !== expectedRowCount ||
      readPreprocessJobStatusRowCount(db) !== expectedRowCount
    ) {
      return null;
    }

    const rows = db.prepare(`
      SELECT source_video_id, claimed_at, completed_at, indexed_at, failed_at
      FROM preprocess_job_status
    `).all() as Array<{
      source_video_id: string;
      claimed_at: string;
      completed_at: string;
      indexed_at: string;
      failed_at: string;
    }>;

    if (rows.length !== expectedRowCount) {
      return null;
    }

    return rows.sort((left, right) =>
      numericSourceVideoId(left.source_video_id) - numericSourceVideoId(right.source_video_id)
    );
  } catch {
    return null;
  }
}

function markPreprocessJobSnapshotIncompleteMetadata(db: DatabaseSync): void {
  replaceDashboardProductionSummaryMetadata(db, null);
  replaceMetadata(db, [
    [preprocessJobSnapshotMetadataKey("complete"), "false"],
    [preprocessJobSnapshotMetadataKey("row_count"), "0"]
  ]);
  markPreprocessProcessHistoryProjectionIncomplete(db);
}

function upsertSourceVideoStatusRow(db: DatabaseSync, row: StoreSourceVideoRow): void {
  db.prepare(`
    INSERT INTO source_video_status
      (
        source_video_id,
        preprocess_status,
        title,
        relative_path,
        visible_to_cutters,
        duration_ms,
        cover_path,
        source_folder_name,
        manifest_json,
        position
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_video_id) DO UPDATE SET
      preprocess_status = excluded.preprocess_status,
      title = excluded.title,
      relative_path = excluded.relative_path,
      visible_to_cutters = excluded.visible_to_cutters,
      duration_ms = excluded.duration_ms,
      cover_path = excluded.cover_path,
      source_folder_name = excluded.source_folder_name,
      manifest_json = excluded.manifest_json,
      position = excluded.position
  `).run(
    row.source_video_id,
    row.preprocess_status,
    row.title,
    row.relative_path,
    row.visible_to_cutters,
    row.duration_ms,
    row.cover_path,
    row.source_folder_name,
    row.manifest_json,
    row.position
  );
}

function upsertPreprocessJobStatusRow(
  db: DatabaseSync,
  row: AdminReadModelStorePreprocessJobSnapshot
): void {
  db.prepare(`
    INSERT INTO preprocess_job_status
      (
        source_video_id,
        claimed_at,
        completed_at,
        indexed_at,
        failed_at
      )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(source_video_id) DO UPDATE SET
      claimed_at = excluded.claimed_at,
      completed_at = excluded.completed_at,
      indexed_at = excluded.indexed_at,
      failed_at = excluded.failed_at
  `).run(
    row.source_video_id,
    row.claimed_at ?? "",
    row.completed_at ?? "",
    row.indexed_at ?? "",
    row.failed_at ?? ""
  );
}

function upsertPreprocessProcessHistoryRow(
  db: DatabaseSync,
  row: StorePreprocessProcessHistoryRow
): void {
  db.prepare(`
    INSERT INTO preprocess_process_history
      (
        source_video_id,
        title,
        preprocess_status,
        source_folder_name,
        visible_to_cutters,
        claimed_at,
        completed_at,
        indexed_at,
        failed_at,
        last_event_at,
        last_event_type,
        elapsed_ms,
        active_flag,
        completed_flag,
        failed_flag
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_video_id) DO UPDATE SET
      title = excluded.title,
      preprocess_status = excluded.preprocess_status,
      source_folder_name = excluded.source_folder_name,
      visible_to_cutters = excluded.visible_to_cutters,
      claimed_at = excluded.claimed_at,
      completed_at = excluded.completed_at,
      indexed_at = excluded.indexed_at,
      failed_at = excluded.failed_at,
      last_event_at = excluded.last_event_at,
      last_event_type = excluded.last_event_type,
      elapsed_ms = excluded.elapsed_ms,
      active_flag = excluded.active_flag,
      completed_flag = excluded.completed_flag,
      failed_flag = excluded.failed_flag
  `).run(
    row.source_video_id,
    row.title,
    row.preprocess_status,
    row.source_folder_name,
    row.visible_to_cutters,
    row.claimed_at,
    row.completed_at,
    row.indexed_at,
    row.failed_at,
    row.last_event_at,
    row.last_event_type,
    row.elapsed_ms,
    row.active_flag,
    row.completed_flag,
    row.failed_flag
  );
}

function readMetadata(db: DatabaseSync): Map<string, string> {
  const rows = db.prepare("SELECT key, value FROM metadata").all() as Array<{
    key: string;
    value: string;
  }>;
  return new Map(rows.map((row) => [row.key, row.value]));
}

function readCountsFromMetadata(metadata: Map<string, string>): Record<PreprocessStatus, number> | null {
  const counts = emptyCounts();
  for (const status of adminSourceVideoStatusList) {
    const raw = metadata.get(statusCountMetadataKey(status));
    if (raw === undefined) {
      return null;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    counts[status] = parsed;
  }
  return counts;
}

function readCountsFromTable(db: DatabaseSync): Record<PreprocessStatus, number> {
  const counts = emptyCounts();
  const rows = db.prepare(`
    SELECT preprocess_status, COUNT(*) AS count
    FROM source_video_status
    GROUP BY preprocess_status
  `).all() as Array<{
    preprocess_status: PreprocessStatus;
    count: number;
  }>;

  for (const row of rows) {
    if (adminSourceVideoStatusList.includes(row.preprocess_status)) {
      counts[row.preprocess_status] = Number(row.count);
    }
  }

  return counts;
}

function readCounts(db: DatabaseSync, metadata: Map<string, string>): Record<PreprocessStatus, number> {
  return readCountsFromMetadata(metadata) ?? readCountsFromTable(db);
}

function readNonNegativeIntegerMetadata(
  metadata: Map<string, string>,
  key: string
): number | null {
  const raw = metadata.get(key);
  if (raw === undefined) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function readDashboardMaterialSummaryFromMetadata(
  metadata: Map<string, string>
): AdminReadModelStoreDashboardMaterialSummary | null {
  const fields: Array<keyof AdminReadModelStoreDashboardMaterialSummary> = [
    "video_count",
    "ready_video_count",
    "total_duration_ms",
    "ready_duration_ms",
    "unprocessed_duration_ms",
    "total_size_bytes"
  ];
  const summary = {} as AdminReadModelStoreDashboardMaterialSummary;
  for (const field of fields) {
    const value = readNonNegativeIntegerMetadata(
      metadata,
      dashboardMaterialSummaryMetadataKey(field)
    );
    if (value === null) {
      return null;
    }
    summary[field] = value;
  }
  return summary;
}

function readDashboardMaterialSummaryFromTable(input: {
  db: DatabaseSync;
  library: LibraryCounts;
}): AdminReadModelStoreDashboardMaterialSummary | null {
  const rows = input.db.prepare(`
    SELECT source_video_id, preprocess_status, duration_ms, manifest_json
    FROM source_video_status
    ORDER BY position
  `).all() as Array<{
    source_video_id: string;
    preprocess_status: PreprocessStatus;
    duration_ms: number;
    manifest_json: string;
  }>;

  if (rows.length !== input.library.video_count) {
    return null;
  }

  const manifests: SourceVideoManifest[] = [];
  for (const row of rows) {
    const manifest = parseStoreManifest(row);
    if (!manifest) {
      return null;
    }
    manifests.push(manifest);
  }

  return dashboardMaterialSummaryFromManifests({
    model: buildAdminSourceVideoStatusReadModel({
      library: input.library,
      manifests,
      default_page_limit: Math.max(1, Math.min(20, manifests.length))
    }),
    manifests
  });
}

function timestampMs(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nextUtcDate(date: string): string {
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) {
    return date;
  }
  return new Date(parsed + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function preprocessProcessHistoryEvent(input: {
  claimed_at: string;
  completed_at: string;
  indexed_at: string;
  failed_at: string;
}): {
  last_event_at: string;
  last_event_type: AdminReadModelStorePreprocessProcessHistoryEvent;
} {
  if (input.failed_at) {
    return {
      last_event_at: input.failed_at,
      last_event_type: "failed"
    };
  }
  if (input.indexed_at) {
    return {
      last_event_at: input.indexed_at,
      last_event_type: "indexed"
    };
  }
  if (input.completed_at) {
    return {
      last_event_at: input.completed_at,
      last_event_type: "completed"
    };
  }
  if (input.claimed_at) {
    return {
      last_event_at: input.claimed_at,
      last_event_type: "claimed"
    };
  }
  return {
    last_event_at: "",
    last_event_type: "status"
  };
}

function preprocessProcessElapsedMs(input: {
  claimed_at: string;
  completed_at: string;
  indexed_at: string;
  failed_at: string;
}): number {
  const startedMs = timestampMs(input.claimed_at);
  const finishedMs = timestampMs(input.indexed_at || input.completed_at || input.failed_at);
  if (startedMs === null || finishedMs === null || finishedMs < startedMs) {
    return 0;
  }
  return finishedMs - startedMs;
}

function dashboardProductionAverageProcessMsFromRows(
  rows: AdminReadModelStorePreprocessJobSnapshot[]
): number {
  const durations: number[] = [];
  for (const row of rows) {
    const startedMs = timestampMs(row.claimed_at);
    const finishedMs = timestampMs(row.indexed_at || row.completed_at);
    if (startedMs !== null && finishedMs !== null && finishedMs >= startedMs) {
      durations.push(finishedMs - startedMs);
    }
  }

  return durations.length > 0
    ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length)
    : 0;
}

function preprocessProcessHistoryWindowStart(input: {
  now: string;
  window_days: number;
}): string {
  const nowMs = timestampMs(input.now) ?? Date.now();
  return new Date(nowMs - input.window_days * 24 * 60 * 60 * 1000).toISOString();
}

const PROCESS_HISTORY_SOURCE_FOLDER_SUMMARY_LIMIT = 8;
const PROCESS_HISTORY_DAILY_TREND_LIMIT = 14;
const PROCESS_HISTORY_SOURCE_FOLDER_FILTER_OPTION_LIMIT = 64;
const PROCESS_HISTORY_DEFAULT_WINDOW_DAYS = 30;
const PROCESS_HISTORY_DEFAULT_PAGE_LIMIT = 20;
const PREPROCESS_PROCESS_HISTORY_EVENT_ORDER: AdminReadModelStorePreprocessProcessHistoryEvent[] = [
  "failed",
  "indexed",
  "completed",
  "claimed",
  "status"
];

function normalizeProcessHistoryFilters(
  filters?: Partial<AdminReadModelStorePreprocessProcessHistoryFilters>
): AdminReadModelStorePreprocessProcessHistoryFilters {
  return {
    source_folder_name: filters?.source_folder_name?.trim() ?? "",
    preprocess_status: filters?.preprocess_status ?? "",
    event_type: filters?.event_type ?? ""
  };
}

function isCompletedProcessHistoryItem(item: AdminReadModelStorePreprocessProcessHistoryItem): boolean {
  return Boolean(item.completed_at || item.indexed_at);
}

function isFailedProcessHistoryItem(item: AdminReadModelStorePreprocessProcessHistoryItem): boolean {
  return Boolean(item.failed_at);
}

function isActiveProcessHistoryItem(item: AdminReadModelStorePreprocessProcessHistoryItem): boolean {
  return item.preprocess_status === "queued" || item.preprocess_status === "processing";
}

function averagePositiveElapsedMs(items: AdminReadModelStorePreprocessProcessHistoryItem[]): number {
  const durations = items.map((item) => item.elapsed_ms).filter((elapsedMs) => elapsedMs > 0);
  return durations.length > 0
    ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length)
    : 0;
}

function newestProcessHistoryEventAt(items: AdminReadModelStorePreprocessProcessHistoryItem[]): string {
  return items
    .map((item) => item.last_event_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? "";
}

function processHistoryItemMatchesFilters(input: {
  item: AdminReadModelStorePreprocessProcessHistoryItem;
  filters: AdminReadModelStorePreprocessProcessHistoryFilters;
}): boolean {
  if (
    input.filters.source_folder_name &&
    input.item.source_folder_name !== input.filters.source_folder_name
  ) {
    return false;
  }

  if (
    input.filters.preprocess_status &&
    input.item.preprocess_status !== input.filters.preprocess_status
  ) {
    return false;
  }

  if (
    input.filters.event_type &&
    input.item.last_event_type !== input.filters.event_type
  ) {
    return false;
  }

  return true;
}

function filterProcessHistoryItems(input: {
  items: AdminReadModelStorePreprocessProcessHistoryItem[];
  filters: AdminReadModelStorePreprocessProcessHistoryFilters;
}): AdminReadModelStorePreprocessProcessHistoryItem[] {
  return input.items.filter((item) => processHistoryItemMatchesFilters({ item, filters: input.filters }));
}

function processHistoryFilterOptions(input: {
  items: AdminReadModelStorePreprocessProcessHistoryItem[];
  filters: AdminReadModelStorePreprocessProcessHistoryFilters;
}): AdminReadModelStorePreprocessProcessHistoryFilterOptions {
  const folderCounts = new Map<string, {
    count: number;
    newest_event_at: string;
  }>();
  const statuses = new Set<PreprocessStatus>();
  const eventTypes = new Set<AdminReadModelStorePreprocessProcessHistoryEvent>();

  for (const item of input.items) {
    const sourceFolderName = item.source_folder_name || "未归类";
    const current = folderCounts.get(sourceFolderName) ?? {
      count: 0,
      newest_event_at: ""
    };
    folderCounts.set(sourceFolderName, {
      count: current.count + 1,
      newest_event_at: item.last_event_at > current.newest_event_at ? item.last_event_at : current.newest_event_at
    });
    statuses.add(item.preprocess_status);
    eventTypes.add(item.last_event_type);
  }

  const sourceFolderNames = [...folderCounts.entries()]
    .sort((left, right) =>
      right[1].count - left[1].count
      || right[1].newest_event_at.localeCompare(left[1].newest_event_at)
      || left[0].localeCompare(right[0])
    )
    .slice(0, PROCESS_HISTORY_SOURCE_FOLDER_FILTER_OPTION_LIMIT)
    .map(([name]) => name);

  if (
    input.filters.source_folder_name &&
    !sourceFolderNames.includes(input.filters.source_folder_name)
  ) {
    sourceFolderNames.push(input.filters.source_folder_name);
  }

  return {
    source_folder_names: sourceFolderNames,
    preprocess_statuses: adminSourceVideoStatusList.filter((status) => statuses.has(status)),
    event_types: PREPROCESS_PROCESS_HISTORY_EVENT_ORDER.filter((eventType) => eventTypes.has(eventType))
  };
}

function summarizeProcessHistorySourceFolders(
  items: AdminReadModelStorePreprocessProcessHistoryItem[]
): AdminReadModelStorePreprocessProcessHistorySourceFolderSummary[] {
  const grouped = new Map<string, AdminReadModelStorePreprocessProcessHistoryItem[]>();
  for (const item of items) {
    const sourceFolderName = item.source_folder_name || "未归类";
    grouped.set(sourceFolderName, [...(grouped.get(sourceFolderName) ?? []), item]);
  }

  return [...grouped.entries()]
    .map(([sourceFolderName, sourceItems]) => ({
      source_folder_name: sourceFolderName,
      tracked_count: sourceItems.length,
      completed_count: sourceItems.filter(isCompletedProcessHistoryItem).length,
      failed_count: sourceItems.filter(isFailedProcessHistoryItem).length,
      active_count: sourceItems.filter(isActiveProcessHistoryItem).length,
      average_process_ms: averagePositiveElapsedMs(sourceItems),
      newest_event_at: newestProcessHistoryEventAt(sourceItems)
    }))
    .sort((left, right) =>
      right.tracked_count - left.tracked_count
      || right.failed_count - left.failed_count
      || right.active_count - left.active_count
      || right.newest_event_at.localeCompare(left.newest_event_at)
      || left.source_folder_name.localeCompare(right.source_folder_name)
    )
    .slice(0, PROCESS_HISTORY_SOURCE_FOLDER_SUMMARY_LIMIT);
}

function summarizeProcessHistoryDailyTrend(
  items: AdminReadModelStorePreprocessProcessHistoryItem[]
): AdminReadModelStorePreprocessProcessHistoryTrendBucket[] {
  const grouped = new Map<string, AdminReadModelStorePreprocessProcessHistoryItem[]>();
  for (const item of items) {
    if (!item.last_event_at) {
      continue;
    }
    const date = item.last_event_at.slice(0, 10);
    grouped.set(date, [...(grouped.get(date) ?? []), item]);
  }

  return [...grouped.entries()]
    .map(([date, dateItems]) => ({
      date,
      tracked_count: dateItems.length,
      completed_count: dateItems.filter(isCompletedProcessHistoryItem).length,
      failed_count: dateItems.filter(isFailedProcessHistoryItem).length,
      active_count: dateItems.filter(isActiveProcessHistoryItem).length,
      average_process_ms: averagePositiveElapsedMs(dateItems)
    }))
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, PROCESS_HISTORY_DAILY_TREND_LIMIT);
}

function readDashboardProductionSummaryFromTable(input: {
  db: DatabaseSync;
  today: string;
  average_video_process_ms?: number | null;
}): AdminReadModelStoreDashboardProductionSummary {
  const todayStart = input.today;
  const tomorrowStart = nextUtcDate(input.today);
  const averageFromMetadata = input.average_video_process_ms ?? null;

  const completedRow = input.db.prepare(`
    SELECT COUNT(*) AS completed_today_count
    FROM (
      SELECT source_video_id
      FROM preprocess_job_status
      WHERE completed_at >= ? AND completed_at < ?
      UNION
      SELECT source_video_id
      FROM preprocess_job_status
      WHERE indexed_at >= ? AND indexed_at < ?
    )
  `).get(todayStart, tomorrowStart, todayStart, tomorrowStart) as {
    completed_today_count: number;
  };
  const failedRow = input.db.prepare(`
    SELECT COUNT(*) AS failed_today_count
    FROM preprocess_job_status
    WHERE failed_at >= ? AND failed_at < ?
  `).get(todayStart, tomorrowStart) as {
    failed_today_count: number;
  };
  const averageRow = averageFromMetadata === null
    ? input.db.prepare(`
      WITH job_durations AS (
        SELECT
          claimed_at,
          COALESCE(NULLIF(indexed_at, ''), NULLIF(completed_at, '')) AS finished_at
        FROM preprocess_job_status
      )
      SELECT
        COALESCE(ROUND(AVG(
          CASE
            WHEN claimed_at != ''
              AND finished_at IS NOT NULL
              AND julianday(finished_at) >= julianday(claimed_at)
            THEN (julianday(finished_at) - julianday(claimed_at)) * 86400000.0
            ELSE NULL
          END
        )), 0) AS average_video_process_ms
      FROM job_durations
    `).get() as {
      average_video_process_ms: number;
    }
    : { average_video_process_ms: averageFromMetadata };

  return {
    completed_today_count: Math.max(0, Math.floor(completedRow.completed_today_count)),
    failed_today_count: Math.max(0, Math.floor(failedRow.failed_today_count)),
    average_video_process_ms: Math.max(0, Math.round(averageRow.average_video_process_ms))
  };
}

function readPreprocessProcessHistoryTrackedItemsFromTable(input: {
  db: DatabaseSync;
  now: string;
  window_days: number;
  limit?: number;
}): AdminReadModelStorePreprocessProcessHistoryItem[] {
  const cutoff = preprocessProcessHistoryWindowStart(input);
  const limitSql = input.limit && input.limit > 0 ? "LIMIT ?" : "";
  const params: Array<string | number> = [cutoff];
  if (input.limit && input.limit > 0) {
    params.push(Math.max(1, Math.floor(input.limit)));
  }
  const rows = input.db.prepare(`
    SELECT
      source_video_id,
      title,
      preprocess_status,
      source_folder_name,
      visible_to_cutters,
      claimed_at,
      completed_at,
      indexed_at,
      failed_at,
      last_event_at,
      last_event_type,
      elapsed_ms
    FROM preprocess_process_history
    WHERE
      last_event_at >= ?
      OR active_flag = 1
    ORDER BY
      last_event_at DESC,
      source_video_id DESC
    ${limitSql}
  `).all(...params) as Array<{
    source_video_id: string;
    title: string;
    preprocess_status: PreprocessStatus;
    source_folder_name: string;
    visible_to_cutters: number;
    claimed_at: string;
    completed_at: string;
    indexed_at: string;
    failed_at: string;
    last_event_at: string;
    last_event_type: AdminReadModelStorePreprocessProcessHistoryEvent;
    elapsed_ms: number;
  }>;

  return rows.map(processHistoryItemFromProjectionRow);
}

function processHistoryDefaultAvailable(input: {
  metadata: Map<string, string>;
  now: string;
  window_days: number;
  filters: AdminReadModelStorePreprocessProcessHistoryFilters;
}): boolean {
  if (
    input.window_days !== PROCESS_HISTORY_DEFAULT_WINDOW_DAYS ||
    input.filters.source_folder_name ||
    input.filters.preprocess_status ||
    input.filters.event_type
  ) {
    return false;
  }
  const generatedAt = input.metadata.get(processHistoryDefaultMetadataKey("generated_at")) ?? "";
  return input.metadata.get(processHistoryDefaultMetadataKey("window_days")) === String(PROCESS_HISTORY_DEFAULT_WINDOW_DAYS) &&
    generatedAt.slice(0, 10) === input.now.slice(0, 10);
}

function readPrecomputedProcessHistoryDefault(input: {
  metadata: Map<string, string>;
  items: AdminReadModelStorePreprocessProcessHistoryItem[];
}): Pick<AdminReadModelStorePreprocessProcessHistory, "filter_options" | "summary"> | null {
  try {
    const summary = JSON.parse(
      input.metadata.get(processHistoryDefaultMetadataKey("summary_json")) ?? ""
    ) as AdminReadModelStorePreprocessProcessHistorySummary;
    const filterOptions = JSON.parse(
      input.metadata.get(processHistoryDefaultMetadataKey("filter_options_json")) ?? ""
    ) as AdminReadModelStorePreprocessProcessHistoryFilterOptions;

    return {
      filter_options: filterOptions,
      summary: {
        ...summary,
        returned_count: input.items.length,
        completed_count: input.items.filter(isCompletedProcessHistoryItem).length,
        failed_count: input.items.filter(isFailedProcessHistoryItem).length,
        active_count: input.items.filter(isActiveProcessHistoryItem).length,
        average_process_ms: averagePositiveElapsedMs(input.items)
      }
    };
  } catch {
    return null;
  }
}

function summarizePreprocessProcessHistory(
  input: {
    items: AdminReadModelStorePreprocessProcessHistoryItem[];
    tracked_items: AdminReadModelStorePreprocessProcessHistoryItem[];
    window_start_at: string;
  }
): AdminReadModelStorePreprocessProcessHistorySummary {
  const statusCounts = emptyCounts();
  const eventCounts = emptyProcessHistoryEventCounts();
  const trackedEventTimes: string[] = [];

  for (const item of input.tracked_items) {
    statusCounts[item.preprocess_status] += 1;
    eventCounts[item.last_event_type] += 1;
    if (item.last_event_at) {
      trackedEventTimes.push(item.last_event_at);
    }
  }

  trackedEventTimes.sort();

  return {
    returned_count: input.items.length,
    completed_count: input.items.filter(isCompletedProcessHistoryItem).length,
    failed_count: input.items.filter(isFailedProcessHistoryItem).length,
    active_count: input.items.filter(isActiveProcessHistoryItem).length,
    average_process_ms: averagePositiveElapsedMs(input.items),
    tracked_count: input.tracked_items.length,
    tracked_completed_count: input.tracked_items.filter(isCompletedProcessHistoryItem).length,
    tracked_failed_count: input.tracked_items.filter(isFailedProcessHistoryItem).length,
    tracked_active_count: input.tracked_items.filter(isActiveProcessHistoryItem).length,
    tracked_average_process_ms: averagePositiveElapsedMs(input.tracked_items),
    window_start_at: input.window_start_at,
    newest_event_at: trackedEventTimes[trackedEventTimes.length - 1] ?? "",
    oldest_event_at: trackedEventTimes[0] ?? "",
    status_counts: statusCounts,
    event_counts: eventCounts,
    source_folder_summaries: summarizeProcessHistorySourceFolders(input.tracked_items),
    daily_trend: summarizeProcessHistoryDailyTrend(input.tracked_items)
  };
}

function readSourceVideoStatusRowCount(db: DatabaseSync): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM source_video_status").get() as { count: number };
  return Number(row.count);
}

function readPreprocessJobStatusRowCount(db: DatabaseSync): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM preprocess_job_status").get() as { count: number };
  return Number(row.count);
}

function readPreprocessProcessHistoryProjectionRowCount(db: DatabaseSync): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM preprocess_process_history").get() as { count: number };
  return Number(row.count);
}

export async function writeAdminSourceVideoManifestToReadModelStore(input: {
  library_root: string;
  library: LibraryCounts & { updated_at?: string } | null;
  manifest: SourceVideoManifest;
  generated_at?: string;
}): Promise<AdminReadModelStoreWriteThroughResult> {
  return writeAdminSourceVideoManifestsToReadModelStore({
    library_root: input.library_root,
    library: input.library,
    manifests: [input.manifest],
    generated_at: input.generated_at
  });
}

export async function writeAdminSourceVideoManifestsToReadModelStore(input: {
  library_root: string;
  library: LibraryCounts & { updated_at?: string } | null;
  manifests: SourceVideoManifest[];
  preprocess_jobs?: AdminReadModelStorePreprocessJobSnapshot[];
  generated_at?: string;
}): Promise<AdminReadModelStoreWriteThroughResult> {
  if (!input.library) {
    return {
      applied: false,
      reason: "counts_mismatch"
    };
  }

  for (const manifest of input.manifests) {
    const validation = validateSourceVideoManifest(manifest);
    if (!validation.ok) {
      return {
        applied: false,
        reason: "invalid_manifest"
      };
    }
  }
  if (input.preprocess_jobs) {
    const manifestIds = new Set(input.manifests.map((manifest) => manifest.source_video_id));
    const seenJobIds = new Set<string>();
    for (const job of input.preprocess_jobs) {
      if (!manifestIds.has(job.source_video_id) || seenJobIds.has(job.source_video_id)) {
        return {
          applied: false,
          reason: "invalid_manifest"
        };
      }
      seenJobIds.add(job.source_video_id);
    }
  }

  if (!(await fileExists(adminReadModelStorePath(input.library_root)))) {
    return {
      applied: false,
      reason: "missing"
    };
  }

  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(adminReadModelStorePath(input.library_root));
    createSchema(db);
    db.exec("BEGIN");
    const generatedAt = input.generated_at ?? new Date().toISOString();

    const rowCountBefore = readSourceVideoStatusRowCount(db);
    if (rowCountBefore !== input.library.video_count) {
      db.exec("ROLLBACK");
      return {
        applied: false,
        reason: "row_count_mismatch"
      };
    }
    const metadataBefore = readMetadata(db);
    const hadCompleteJobSnapshot =
      metadataBefore.get(preprocessJobSnapshotMetadataKey("complete")) === "true";

    for (const manifest of input.manifests) {
      upsertSourceVideoStatusRow(db, storeSourceVideoRowFromManifest(manifest));
    }
    if (input.preprocess_jobs) {
      for (const job of input.preprocess_jobs) {
        upsertPreprocessJobStatusRow(db, job);
      }
    }

    const rowCountAfter = readSourceVideoStatusRowCount(db);
    const counts = readCountsFromTable(db);
    if (rowCountAfter !== input.library.video_count || !countsMatchLibrary(counts, input.library)) {
      db.exec("ROLLBACK");
      return {
        applied: false,
        reason: "counts_mismatch"
      };
    }
    replaceMetadata(db, storeMetadataRows({
      generated_at: generatedAt,
      library_updated_at: input.library.updated_at ?? "",
      video_count: input.library.video_count,
      counts_by_status: counts
    }));
    replaceDashboardMaterialSummaryMetadata(db, readDashboardMaterialSummaryFromTable({
      db,
      library: input.library
    }));
    if (input.preprocess_jobs && hadCompleteJobSnapshot && readPreprocessJobStatusRowCount(db) === input.library.video_count) {
      replaceDashboardProductionSummaryMetadata(db, {
        average_video_process_ms: readDashboardProductionSummaryFromTable({
          db,
          today: generatedAt.slice(0, 10)
        }).average_video_process_ms
      });
      replaceMetadata(db, [
        [preprocessJobSnapshotMetadataKey("complete"), "true"],
        [preprocessJobSnapshotMetadataKey("row_count"), String(input.library.video_count)]
      ]);
      replacePreprocessProcessHistoryProjectionFromTables({
        db,
        expected_row_count: input.library.video_count,
        generated_at: generatedAt
      });
    } else {
      markPreprocessJobSnapshotIncompleteMetadata(db);
    }

    db.exec("COMMIT");
    return {
      applied: true,
      reason: "updated"
    };
  } catch {
    try {
      db?.exec("ROLLBACK");
    } catch {
      // Transaction may not have started.
    }
    return {
      applied: false,
      reason: "unreadable"
    };
  } finally {
    db?.close();
  }
}

function nonReadyStatuses(statuses: PreprocessStatus[]): PreprocessStatus[] | null {
  if (statuses.length === 0) {
    return null;
  }

  const nonReady = new Set<PreprocessStatus>(adminNonReadySourceVideoStatusList);
  return statuses.every((status) => nonReady.has(status)) ? statuses : null;
}

function statusPlaceholders(statuses: PreprocessStatus[]): string {
  return statuses.map(() => "?").join(", ");
}

function statusOrderCase(statuses: PreprocessStatus[]): string {
  return statuses.map((_, index) => `WHEN ? THEN ${index}`).join(" ");
}

interface StoreManifestRowsReadResult {
  manifests: SourceVideoManifest[];
  missing_source_video_ids: string[];
}

function readStatusManifestRows(input: {
  db: DatabaseSync;
  status: PreprocessStatus;
  offset: number;
  limit: number;
  direction: "asc" | "desc";
}): StoreManifestRowsReadResult {
  if (input.limit <= 0) {
    return {
      manifests: [],
      missing_source_video_ids: []
    };
  }

  const orderDirection = input.direction === "desc" ? "DESC" : "ASC";
  const rows = input.db.prepare(`
    SELECT source_video_id, preprocess_status, manifest_json
    FROM source_video_status
    WHERE preprocess_status = ?
    ORDER BY position ${orderDirection}
    LIMIT ? OFFSET ?
  `).all(input.status, input.limit, input.offset) as Array<{
    source_video_id: string;
    preprocess_status: PreprocessStatus;
    manifest_json: string;
  }>;

  const manifests: SourceVideoManifest[] = [];
  const missingSourceVideoIds: string[] = [];
  for (const row of rows) {
    const manifest = parseStoreManifest(row);
    if (!manifest) {
      missingSourceVideoIds.push(row.source_video_id);
      continue;
    }
    manifests.push(manifest);
  }

  return {
    manifests,
    missing_source_video_ids: missingSourceVideoIds
  };
}

function statusPageSlices(input: {
  statuses: PreprocessStatus[];
  counts_by_status: Record<PreprocessStatus, number>;
  offset: number;
  limit: number;
  direction: "asc" | "desc";
}): Array<{
  status: PreprocessStatus;
  offset: number;
  limit: number;
  direction: "asc" | "desc";
}> {
  const slices: Array<{
    status: PreprocessStatus;
    offset: number;
    limit: number;
    direction: "asc" | "desc";
  }> = [];
  let remainingOffset = Math.max(0, input.offset);
  let remainingLimit = input.limit;

  for (const status of input.statuses) {
    if (remainingLimit <= 0) {
      break;
    }
    const count = input.counts_by_status[status] ?? 0;
    if (remainingOffset >= count) {
      remainingOffset -= count;
      continue;
    }

    const sliceOffset = remainingOffset;
    const sliceLimit = Math.min(remainingLimit, count - sliceOffset);
    if (sliceLimit > 0) {
      slices.push({
        status,
        offset: sliceOffset,
        limit: sliceLimit,
        direction: input.direction
      });
    }
    remainingLimit -= sliceLimit;
    remainingOffset = 0;
  }

  return slices;
}

function parseStoreManifest(row: {
  source_video_id: string;
  preprocess_status: PreprocessStatus;
  manifest_json: string;
}): SourceVideoManifest | null {
  if (!row.manifest_json) {
    return null;
  }

  try {
    const parsed = JSON.parse(row.manifest_json);
    const validation = validateSourceVideoManifest(parsed);
    if (
      !validation.ok ||
      parsed.source_video_id !== row.source_video_id ||
      parsed.preprocess_status !== row.preprocess_status
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function storeQueryCandidateBatchSize(input: {
  offset: number;
  limit: number;
}): number {
  const requestedCount = input.limit > 0
    ? Math.max(1, input.offset + input.limit)
    : 128;
  return Math.max(50, Math.min(500, requestedCount * 2));
}

function readStoreManifestRows(input: {
  db: DatabaseSync;
  statuses: PreprocessStatus[];
  counts_by_status: Record<PreprocessStatus, number>;
  offset: number;
  limit: number;
  query?: string;
}): StoreManifestRowsReadResult {
  const placeholders = statusPlaceholders(input.statuses);
  const normalizedQuery = input.query?.trim() ?? "";
  if (!normalizedQuery) {
    const manifests: SourceVideoManifest[] = [];
    const missingSourceVideoIds: string[] = [];
    for (const slice of statusPageSlices({
      statuses: input.statuses,
      counts_by_status: input.counts_by_status,
      offset: input.offset,
      limit: input.limit,
      direction: "asc"
    })) {
      const rows = readStatusManifestRows({
        db: input.db,
        status: slice.status,
        offset: slice.offset,
        limit: slice.limit,
        direction: slice.direction
      });
      if (rows.missing_source_video_ids.length > 0) {
        missingSourceVideoIds.push(...rows.missing_source_video_ids);
      }
      manifests.push(...rows.manifests);
    }
    return {
      manifests,
      missing_source_video_ids: missingSourceVideoIds
    };
  }

  const orderCase = statusOrderCase(input.statuses);
  const queryPattern = `%${escapeSqliteLike(normalizedQuery.toLocaleLowerCase())}%`;
  const statement = input.db.prepare(`
    SELECT source_video_id, preprocess_status, manifest_json
    FROM source_video_status
    WHERE preprocess_status IN (${placeholders})
      AND (
        lower(source_video_id) LIKE ? ESCAPE '\\'
        OR lower(title) LIKE ? ESCAPE '\\'
        OR lower(relative_path) LIKE ? ESCAPE '\\'
        OR lower(source_folder_name) LIKE ? ESCAPE '\\'
        OR lower(manifest_json) LIKE ? ESCAPE '\\'
      )
    ORDER BY CASE preprocess_status ${orderCase} ELSE ${input.statuses.length} END, position
    LIMIT ? OFFSET ?
  `);
  const requestedEnd = input.limit > 0 ? input.offset + input.limit : Number.POSITIVE_INFINITY;
  const candidateBatchSize = storeQueryCandidateBatchSize(input);
  let candidateOffset = 0;
  const manifests: SourceVideoManifest[] = [];
  const missingSourceVideoIds: string[] = [];
  while (manifests.length < requestedEnd) {
    const rows = statement.all(
      ...input.statuses,
      queryPattern,
      queryPattern,
      queryPattern,
      queryPattern,
      queryPattern,
      ...input.statuses,
      candidateBatchSize,
      candidateOffset
    ) as Array<{
      source_video_id: string;
      preprocess_status: PreprocessStatus;
      manifest_json: string;
    }>;

    if (rows.length === 0) {
      break;
    }

    candidateOffset += rows.length;
    for (const row of rows) {
      const manifest = parseStoreManifest(row);
      if (!manifest) {
        missingSourceVideoIds.push(row.source_video_id);
        continue;
      }
      if (adminSourceVideoMatchesListFilter(manifest, {
        query: normalizedQuery
      })) {
        manifests.push(manifest);
        if (manifests.length >= requestedEnd) {
          break;
        }
      }
    }

    if (missingSourceVideoIds.length > 0) {
      break;
    }

    if (rows.length < candidateBatchSize) {
      break;
    }
  }

  return {
    manifests: missingSourceVideoIds.length > 0
      ? []
      : manifests.slice(input.offset, requestedEnd),
    missing_source_video_ids: missingSourceVideoIds
  };
}

const adminPreprocessJobStoreStatuses: PreprocessStatus[] = [
  "processing",
  "queued",
  "failed",
  "index-required",
  "ready"
];

function countPreprocessJobStoreRows(counts: Record<PreprocessStatus, number>): number {
  return adminPreprocessJobStoreStatuses
    .reduce((total, status) => total + counts[status], 0);
}

function readPreprocessJobStoreManifestRows(input: {
  db: DatabaseSync;
  counts_by_status: Record<PreprocessStatus, number>;
  offset: number;
  limit: number;
}): SourceVideoManifest[] | null {
  const manifests: SourceVideoManifest[] = [];
  for (const slice of statusPageSlices({
    statuses: adminPreprocessJobStoreStatuses,
    counts_by_status: input.counts_by_status,
    offset: input.offset,
    limit: input.limit,
    direction: "asc"
  })) {
    const rows = readStatusManifestRows({
      db: input.db,
      status: slice.status,
      offset: slice.offset,
      limit: slice.limit,
      direction: slice.status === "failed" || slice.status === "index-required" ? "desc" : "asc"
    });
    if (rows.missing_source_video_ids.length > 0) {
      return null;
    }
    manifests.push(...rows.manifests);
  }

  return manifests;
}

function readPreprocessJobSnapshotRowsForManifests(input: {
  db: DatabaseSync;
  metadata: Map<string, string>;
  library: LibraryCounts;
  manifests: SourceVideoManifest[];
}): AdminReadModelStorePreprocessJobSnapshot[] {
  if (input.metadata.get(preprocessJobSnapshotMetadataKey("complete")) !== "true") {
    return [];
  }
  const snapshotRowCount = readNonNegativeIntegerMetadata(
    input.metadata,
    preprocessJobSnapshotMetadataKey("row_count")
  );
  if (snapshotRowCount !== input.library.video_count) {
    return [];
  }
  if (input.manifests.length === 0) {
    return [];
  }

  const ids = input.manifests.map((manifest) => manifest.source_video_id);
  const placeholders = ids.map(() => "?").join(", ");
  const rows = input.db.prepare(`
    SELECT source_video_id, claimed_at, completed_at, indexed_at, failed_at
    FROM preprocess_job_status
    WHERE source_video_id IN (${placeholders})
  `).all(...ids) as Array<{
    source_video_id: string;
    claimed_at: string;
    completed_at: string;
    indexed_at: string;
    failed_at: string;
  }>;
  const byId = new Map(rows.map((row) => [row.source_video_id, row]));
  if (byId.size !== ids.length) {
    return [];
  }

  return ids
    .map((sourceVideoId) => byId.get(sourceVideoId))
    .filter((row): row is {
      source_video_id: string;
      claimed_at: string;
      completed_at: string;
      indexed_at: string;
      failed_at: string;
    } => row !== undefined);
}

function statusFromError(libraryRoot: string, exists: boolean, error: unknown): AdminReadModelStoreStatus {
  const currentVideoCount = 0;
  return {
    schema_version: ADMIN_READ_MODEL_STORE_SCHEMA_VERSION,
    storage: "sqlite",
    path: adminReadModelStorePath(libraryRoot),
    freshness: exists ? "unreadable" : "missing",
    exists,
    generated_at: "",
    library_updated_at: "",
    current_library_updated_at: "",
    video_count: 0,
    current_video_count: 0,
    counts_by_status: emptyCounts(),
    projections: unavailableProjectionStatusSet(currentVideoCount),
    invalidated_at: "",
    invalidation_reason: "",
    last_error: error instanceof Error ? error.message : String(error)
  };
}

function projectionReadiness(input: {
  status: AdminReadModelStoreProjectionStatus;
  reason: AdminReadModelStoreProjectionReason;
  video_count: number;
  current_video_count: number;
}): AdminReadModelStoreProjectionReadiness {
  const ready = input.status === "ready";
  const unavailable = input.status === "unavailable";
  return {
    status: input.status,
    reason: input.reason,
    scan_mode: ready || unavailable ? "no-scan" : "full-reconcile",
    requires_background_reconcile: !ready && !unavailable,
    safe_for_page_request: ready || !unavailable,
    video_count: input.video_count,
    current_video_count: input.current_video_count
  };
}

function unavailableProjectionStatusSet(
  currentVideoCount: number
): AdminReadModelStoreProjectionStatusSet {
  return {
    material_summary: projectionReadiness({
      status: "unavailable",
      reason: "store_unavailable",
      video_count: 0,
      current_video_count: currentVideoCount
    }),
    production_summary: projectionReadiness({
      status: "unavailable",
      reason: "store_unavailable",
      video_count: 0,
      current_video_count: currentVideoCount
    }),
    process_history: projectionReadiness({
      status: "unavailable",
      reason: "store_unavailable",
      video_count: 0,
      current_video_count: currentVideoCount
    })
  };
}

function projectionStatusSetFromMetadata(input: {
  library: (LibraryCounts & { updated_at?: string }) | null;
  metadata: Map<string, string>;
}): AdminReadModelStoreProjectionStatusSet {
  const currentVideoCount = input.library?.video_count ?? 0;
  const materialSummary = readDashboardMaterialSummaryFromMetadata(input.metadata);
  const materialStatus = !materialSummary
    ? projectionReadiness({
        status: "missing",
        reason: "missing_metadata",
        video_count: 0,
        current_video_count: currentVideoCount
      })
    : input.library && (
      materialSummary.video_count !== input.library.video_count ||
      materialSummary.ready_video_count !== input.library.ready_video_count
    )
      ? projectionReadiness({
          status: "stale",
          reason: "row_count_mismatch",
          video_count: materialSummary.video_count,
          current_video_count: currentVideoCount
        })
      : projectionReadiness({
          status: "ready",
          reason: "ready",
          video_count: materialSummary.video_count,
          current_video_count: currentVideoCount
        });

  const productionComplete =
    input.metadata.get(preprocessJobSnapshotMetadataKey("complete")) === "true";
  const productionRowCount = readNonNegativeIntegerMetadata(
    input.metadata,
    preprocessJobSnapshotMetadataKey("row_count")
  );
  const productionStatus = !productionComplete
    ? projectionReadiness({
        status: "incomplete",
        reason: "snapshot_incomplete",
        video_count: productionRowCount ?? 0,
        current_video_count: currentVideoCount
      })
    : input.library && productionRowCount !== input.library.video_count
      ? projectionReadiness({
          status: "stale",
          reason: "row_count_mismatch",
          video_count: productionRowCount ?? 0,
          current_video_count: currentVideoCount
        })
      : projectionReadiness({
          status: "ready",
          reason: "ready",
          video_count: productionRowCount ?? currentVideoCount,
          current_video_count: currentVideoCount
        });

  const processHistoryRawComplete = input.metadata.get(processHistoryProjectionMetadataKey("complete"));
  const processHistoryComplete = processHistoryRawComplete === "true";
  const processHistoryRowCount = readNonNegativeIntegerMetadata(
    input.metadata,
    processHistoryProjectionMetadataKey("row_count")
  );
  const processHistoryStatus = processHistoryRawComplete === undefined
    ? projectionReadiness({
        status: "missing",
        reason: "missing_metadata",
        video_count: 0,
        current_video_count: currentVideoCount
      })
    : !processHistoryComplete
      ? projectionReadiness({
          status: "incomplete",
          reason: "snapshot_incomplete",
          video_count: processHistoryRowCount ?? 0,
          current_video_count: currentVideoCount
        })
      : input.library && processHistoryRowCount !== input.library.video_count
        ? projectionReadiness({
            status: "stale",
            reason: "row_count_mismatch",
            video_count: processHistoryRowCount ?? 0,
            current_video_count: currentVideoCount
          })
        : projectionReadiness({
            status: "ready",
            reason: "ready",
            video_count: processHistoryRowCount ?? currentVideoCount,
            current_video_count: currentVideoCount
          });

  return {
    material_summary: materialStatus,
    production_summary: productionStatus,
    process_history: processHistoryStatus
  };
}

function statusFromMetadata(input: {
  store_path: string;
  library: (LibraryCounts & { updated_at?: string }) | null;
  metadata: Map<string, string>;
  counts: Record<PreprocessStatus, number>;
}): AdminReadModelStoreStatus {
  const videoCount = Number.parseInt(input.metadata.get("video_count") ?? "0", 10) || 0;
  const invalidatedAt = input.metadata.get("invalidated_at") ?? "";
  const invalidationReason = input.metadata.get("invalidation_reason") ?? "";
  const countsMatch = input.library
    ? countsMatchLibrary(input.counts, input.library)
    : true;
  const freshness: AdminReadModelStoreFreshness = !invalidatedAt &&
    countsMatch &&
    (!input.library || input.metadata.get("library_updated_at") === (input.library.updated_at ?? "")) &&
    (!input.library || videoCount === input.library.video_count)
    ? "fresh"
    : "stale";

  return {
    schema_version: ADMIN_READ_MODEL_STORE_SCHEMA_VERSION,
    storage: "sqlite",
    path: input.store_path,
    freshness,
    exists: true,
    generated_at: input.metadata.get("generated_at") ?? "",
    library_updated_at: input.metadata.get("library_updated_at") ?? "",
    current_library_updated_at: input.library?.updated_at ?? "",
    video_count: videoCount,
    current_video_count: input.library?.video_count ?? 0,
    counts_by_status: input.counts,
    projections: projectionStatusSetFromMetadata({
      library: input.library,
      metadata: input.metadata
    }),
    invalidated_at: invalidatedAt,
    invalidation_reason: invalidationReason,
    last_error: ""
  };
}

export async function readAdminReadModelStoreStatus(input: {
  library_root: string;
  library: LibraryCounts & { updated_at?: string } | null;
}): Promise<AdminReadModelStoreStatus> {
  const storePath = adminReadModelStorePath(input.library_root);
  const exists = await fileExists(storePath);
  if (!exists) {
    return statusFromError(input.library_root, false, "admin read model store is missing");
  }

  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(`file:${storePath}?mode=ro`);
    const metadata = readMetadata(db);
    const counts = readCounts(db, metadata);
    return statusFromMetadata({
      store_path: storePath,
      library: input.library,
      metadata,
      counts
    });
  } catch (error) {
    return statusFromError(input.library_root, exists, error);
  } finally {
    db?.close();
  }
}

export async function readAdminDashboardMaterialSummaryFromStore(input: {
  library_root: string;
  library: LibraryCounts & { updated_at?: string } | null;
}): Promise<AdminReadModelStoreDashboardMaterialSummary | null> {
  if (!input.library) {
    return null;
  }

  const storePath = adminReadModelStorePath(input.library_root);
  if (!(await fileExists(storePath))) {
    return null;
  }

  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(`file:${storePath}?mode=ro`);
    const metadata = readMetadata(db);
    const counts = readCounts(db, metadata);
    const status = statusFromMetadata({
      store_path: storePath,
      library: input.library,
      metadata,
      counts
    });
    if (status.freshness !== "fresh") {
      return null;
    }
    const summary = readDashboardMaterialSummaryFromMetadata(metadata);
    if (
      !summary ||
      summary.video_count !== input.library.video_count ||
      summary.ready_video_count !== input.library.ready_video_count
    ) {
      return null;
    }
    return summary;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export async function readAdminDashboardProductionSummaryFromStore(input: {
  library_root: string;
  library: LibraryCounts & { updated_at?: string } | null;
  now: string;
}): Promise<AdminReadModelStoreDashboardProductionSummary | null> {
  if (!input.library) {
    return null;
  }

  const storePath = adminReadModelStorePath(input.library_root);
  if (!(await fileExists(storePath))) {
    return null;
  }

  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(`file:${storePath}?mode=ro`);
    const metadata = readMetadata(db);
    const counts = readCounts(db, metadata);
    const status = statusFromMetadata({
      store_path: storePath,
      library: input.library,
      metadata,
      counts
    });
    if (status.freshness !== "fresh") {
      return null;
    }
    if (metadata.get(preprocessJobSnapshotMetadataKey("complete")) !== "true") {
      return null;
    }
    const snapshotRowCount = readNonNegativeIntegerMetadata(
      metadata,
      preprocessJobSnapshotMetadataKey("row_count")
    );
    if (snapshotRowCount !== input.library.video_count) {
      return null;
    }
    return readDashboardProductionSummaryFromTable({
      db,
      today: input.now.slice(0, 10),
      average_video_process_ms: readDashboardProductionAverageFromMetadata(metadata)
    });
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function processHistoryReadinessFromStatus(input: {
  status: AdminReadModelStoreStatus;
  reason: AdminReadModelStorePreprocessProcessHistoryReadinessReason;
  expected_job_snapshot_rows: number;
  snapshot_complete?: boolean;
  snapshot_metadata_row_count?: number | null;
  snapshot_table_row_count?: number | null;
  projection_complete?: boolean;
  projection_metadata_row_count?: number | null;
  projection_table_row_count?: number | null;
}): AdminReadModelStorePreprocessProcessHistoryReadiness {
  const snapshotMetadataRowCount = input.snapshot_metadata_row_count ?? null;
  const snapshotTableRowCount = input.snapshot_table_row_count ?? null;
  const projectionMetadataRowCount = input.projection_metadata_row_count ?? null;
  const projectionTableRowCount = input.projection_table_row_count ?? null;
  const metadataRowCountMatches = snapshotMetadataRowCount === input.expected_job_snapshot_rows;
  const tableRowCountMatches = snapshotTableRowCount === input.expected_job_snapshot_rows;
  const projectionRowCountMatches =
    projectionMetadataRowCount === input.expected_job_snapshot_rows &&
    projectionTableRowCount === input.expected_job_snapshot_rows;

  return {
    source: "admin-read-model-store",
    store_path: input.status.path,
    store_exists: input.status.exists,
    store_freshness: input.status.freshness,
    generated_at: input.status.generated_at,
    library_updated_at: input.status.library_updated_at,
    current_library_updated_at: input.status.current_library_updated_at,
    scan_mode: "no-scan",
    ready_for_process_history: input.reason === "ready",
    reason: input.reason,
    expected_job_snapshot_rows: input.expected_job_snapshot_rows,
    snapshot_complete: input.snapshot_complete ?? false,
    snapshot_metadata_row_count: snapshotMetadataRowCount,
    snapshot_table_row_count: snapshotTableRowCount,
    projection_complete: input.projection_complete ?? false,
    projection_metadata_row_count: projectionMetadataRowCount,
    projection_table_row_count: projectionTableRowCount,
    metadata_row_count_matches: metadataRowCountMatches,
    table_row_count_matches: tableRowCountMatches,
    projection_row_count_matches: projectionRowCountMatches,
    last_error: input.status.last_error
  };
}

export async function readAdminPreprocessProcessHistoryReadinessFromStore(input: {
  library_root: string;
  library: LibraryCounts & { updated_at?: string } | null;
}): Promise<AdminReadModelStorePreprocessProcessHistoryReadiness> {
  const status = await readAdminReadModelStoreStatus({
    library_root: input.library_root,
    library: input.library
  });
  const expectedRows = input.library?.video_count ?? 0;

  if (!input.library) {
    return processHistoryReadinessFromStatus({
      status,
      reason: "missing_library",
      expected_job_snapshot_rows: expectedRows
    });
  }

  if (status.freshness === "missing") {
    return processHistoryReadinessFromStatus({
      status,
      reason: "store_missing",
      expected_job_snapshot_rows: expectedRows
    });
  }
  if (status.freshness === "unreadable") {
    return processHistoryReadinessFromStatus({
      status,
      reason: "store_unreadable",
      expected_job_snapshot_rows: expectedRows
    });
  }
  if (status.freshness !== "fresh") {
    return processHistoryReadinessFromStatus({
      status,
      reason: "store_stale",
      expected_job_snapshot_rows: expectedRows
    });
  }

  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(`file:${adminReadModelStorePath(input.library_root)}?mode=ro`);
    const metadata = readMetadata(db);
    const snapshotComplete = metadata.get(preprocessJobSnapshotMetadataKey("complete")) === "true";
    const snapshotMetadataRowCount = readNonNegativeIntegerMetadata(
      metadata,
      preprocessJobSnapshotMetadataKey("row_count")
    );
    const snapshotTableRowCount = readPreprocessJobStatusRowCount(db);
    const projectionComplete = metadata.get(processHistoryProjectionMetadataKey("complete")) === "true";
    const projectionMetadataRowCount = readNonNegativeIntegerMetadata(
      metadata,
      processHistoryProjectionMetadataKey("row_count")
    );
    const projectionTableRowCount = projectionComplete
      ? readPreprocessProcessHistoryProjectionRowCount(db)
      : null;

    if (!snapshotComplete) {
      return processHistoryReadinessFromStatus({
        status,
        reason: "snapshot_incomplete",
        expected_job_snapshot_rows: expectedRows,
        snapshot_complete: snapshotComplete,
        snapshot_metadata_row_count: snapshotMetadataRowCount,
        snapshot_table_row_count: snapshotTableRowCount,
        projection_complete: projectionComplete,
        projection_metadata_row_count: projectionMetadataRowCount,
        projection_table_row_count: projectionTableRowCount
      });
    }

    if (snapshotMetadataRowCount !== expectedRows) {
      return processHistoryReadinessFromStatus({
        status,
        reason: "snapshot_row_count_mismatch",
        expected_job_snapshot_rows: expectedRows,
        snapshot_complete: snapshotComplete,
        snapshot_metadata_row_count: snapshotMetadataRowCount,
        snapshot_table_row_count: snapshotTableRowCount,
        projection_complete: projectionComplete,
        projection_metadata_row_count: projectionMetadataRowCount,
        projection_table_row_count: projectionTableRowCount
      });
    }

    if (snapshotTableRowCount !== expectedRows) {
      return processHistoryReadinessFromStatus({
        status,
        reason: "table_row_count_mismatch",
        expected_job_snapshot_rows: expectedRows,
        snapshot_complete: snapshotComplete,
        snapshot_metadata_row_count: snapshotMetadataRowCount,
        snapshot_table_row_count: snapshotTableRowCount,
        projection_complete: projectionComplete,
        projection_metadata_row_count: projectionMetadataRowCount,
        projection_table_row_count: projectionTableRowCount
      });
    }

    if (!projectionComplete) {
      return processHistoryReadinessFromStatus({
        status,
        reason: "projection_incomplete",
        expected_job_snapshot_rows: expectedRows,
        snapshot_complete: snapshotComplete,
        snapshot_metadata_row_count: snapshotMetadataRowCount,
        snapshot_table_row_count: snapshotTableRowCount,
        projection_complete: projectionComplete,
        projection_metadata_row_count: projectionMetadataRowCount,
        projection_table_row_count: projectionTableRowCount
      });
    }

    if (
      projectionMetadataRowCount !== expectedRows ||
      projectionTableRowCount !== expectedRows
    ) {
      return processHistoryReadinessFromStatus({
        status,
        reason: "projection_row_count_mismatch",
        expected_job_snapshot_rows: expectedRows,
        snapshot_complete: snapshotComplete,
        snapshot_metadata_row_count: snapshotMetadataRowCount,
        snapshot_table_row_count: snapshotTableRowCount,
        projection_complete: projectionComplete,
        projection_metadata_row_count: projectionMetadataRowCount,
        projection_table_row_count: projectionTableRowCount
      });
    }

    return processHistoryReadinessFromStatus({
      status,
      reason: "ready",
      expected_job_snapshot_rows: expectedRows,
      snapshot_complete: snapshotComplete,
      snapshot_metadata_row_count: snapshotMetadataRowCount,
      snapshot_table_row_count: snapshotTableRowCount,
      projection_complete: projectionComplete,
      projection_metadata_row_count: projectionMetadataRowCount,
      projection_table_row_count: projectionTableRowCount
    });
  } catch (error) {
    return processHistoryReadinessFromStatus({
      status: {
        ...status,
        freshness: "unreadable",
        last_error: error instanceof Error ? error.message : String(error)
      },
      reason: "store_unreadable",
      expected_job_snapshot_rows: expectedRows
    });
  } finally {
    db?.close();
  }
}

export async function readAdminPreprocessProcessHistoryFromStore(input: {
  library_root: string;
  library: LibraryCounts & { updated_at?: string } | null;
  now: string;
  window_days: number;
  limit: number;
  filters?: Partial<AdminReadModelStorePreprocessProcessHistoryFilters>;
}): Promise<AdminReadModelStorePreprocessProcessHistory | null> {
  if (!input.library || input.limit <= 0 || input.window_days <= 0) {
    return null;
  }

  const status = await readAdminReadModelStoreStatus({
    library_root: input.library_root,
    library: input.library
  });
  if (status.freshness !== "fresh") {
    return null;
  }

  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(`file:${adminReadModelStorePath(input.library_root)}?mode=ro`);
    const metadata = readMetadata(db);
    if (metadata.get(preprocessJobSnapshotMetadataKey("complete")) !== "true") {
      return null;
    }
    const snapshotRowCount = readNonNegativeIntegerMetadata(
      metadata,
      preprocessJobSnapshotMetadataKey("row_count")
    );
    const tableRowCount = readPreprocessJobStatusRowCount(db);
    if (snapshotRowCount !== input.library.video_count || tableRowCount !== input.library.video_count) {
      return null;
    }
    const projectionComplete = metadata.get(processHistoryProjectionMetadataKey("complete")) === "true";
    const projectionRowCount = readNonNegativeIntegerMetadata(
      metadata,
      processHistoryProjectionMetadataKey("row_count")
    );
    if (
      !projectionComplete ||
      projectionRowCount !== input.library.video_count ||
      readPreprocessProcessHistoryProjectionRowCount(db) !== input.library.video_count
    ) {
      return null;
    }

    const filters = normalizeProcessHistoryFilters(input.filters);
    if (processHistoryDefaultAvailable({
      metadata,
      now: input.now,
      window_days: input.window_days,
      filters
    })) {
      const items = readPreprocessProcessHistoryTrackedItemsFromTable({
        db,
        now: input.now,
        window_days: input.window_days,
        limit: input.limit
      });
      const precomputed = readPrecomputedProcessHistoryDefault({
        metadata,
        items
      });
      if (precomputed) {
        return {
          source: "admin-read-model-store",
          generated_at: status.generated_at,
          library_updated_at: status.library_updated_at,
          window_days: input.window_days,
          limit: input.limit,
          filters,
          filter_options: precomputed.filter_options,
          summary: precomputed.summary,
          items
        };
      }
    }

    const trackedItems = readPreprocessProcessHistoryTrackedItemsFromTable({
      db,
      now: input.now,
      window_days: input.window_days
    });
    const filteredItems = filterProcessHistoryItems({
      items: trackedItems,
      filters
    });
    const items = filteredItems.slice(0, input.limit);

    return {
      source: "admin-read-model-store",
      generated_at: status.generated_at,
      library_updated_at: status.library_updated_at,
      window_days: input.window_days,
      limit: input.limit,
      filters,
      filter_options: processHistoryFilterOptions({
        items: trackedItems,
        filters
      }),
      summary: summarizePreprocessProcessHistory({
        items,
        tracked_items: filteredItems,
        window_start_at: preprocessProcessHistoryWindowStart({
          now: input.now,
          window_days: input.window_days
        })
      }),
      items
    };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export async function readAdminSourceVideoStatusesPageFromStoreWithReadiness(input: {
  library_root: string;
  library: LibraryCounts & { updated_at?: string } | null;
  statuses: PreprocessStatus[];
  offset: number;
  limit: number;
  query?: string;
}): Promise<AdminReadModelStoreSourceVideoPageReadResult> {
  const statuses = nonReadyStatuses(input.statuses);
  if (!statuses) {
    return {
      page: null,
      miss_reason: "unsupported-status",
      freshness: "not-applicable"
    };
  }

  const storePath = adminReadModelStorePath(input.library_root);
  const exists = await fileExists(storePath);
  if (!exists) {
    return {
      page: null,
      miss_reason: "store-not-fresh",
      freshness: "missing"
    };
  }

  let lastError: unknown = null;
  for (const [attemptIndex, delayMs] of ADMIN_STATUS_STORE_PAGE_READ_RETRY_DELAYS_MS.entries()) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    try {
      return readAdminSourceVideoStatusesPageFromStoreAttempt({
        store_path: storePath,
        library: input.library,
        statuses,
        offset: input.offset,
        limit: input.limit,
        query: input.query
      });
    } catch (error) {
      lastError = error;
      if (
        !isTransientSqliteReadError(error) ||
        attemptIndex === ADMIN_STATUS_STORE_PAGE_READ_RETRY_DELAYS_MS.length - 1
      ) {
        break;
      }
    }
  }

  void lastError;
  return {
    page: null,
    miss_reason: "unreadable-store",
    freshness: "unreadable"
  };
}

function readAdminSourceVideoStatusesPageFromStoreAttempt(input: {
  store_path: string;
  library: LibraryCounts & { updated_at?: string } | null;
  statuses: PreprocessStatus[];
  offset: number;
  limit: number;
  query?: string;
}): AdminReadModelStoreSourceVideoPageReadResult {
  let db: DatabaseSync | undefined;
  try {
    db = openReadOnlyAdminReadModelStore(input.store_path);
    const metadata = readMetadata(db);
    const status = statusFromMetadata({
      store_path: input.store_path,
      library: input.library,
      metadata,
      counts: readCounts(db, metadata)
    });
    if (status.freshness !== "fresh") {
      return {
        page: null,
        miss_reason: "store-not-fresh",
        freshness: status.freshness
      };
    }

    const manifests = readStoreManifestRows({
      db,
      statuses: input.statuses,
      counts_by_status: status.counts_by_status,
      offset: input.offset,
      limit: input.limit,
      query: input.query
    });

    if (manifests.missing_source_video_ids.length > 0) {
      return {
        page: null,
        miss_reason: "incomplete-manifest-rows",
        freshness: status.freshness,
        missing_source_video_ids: manifests.missing_source_video_ids
      };
    }

    return {
      page: {
        source: "admin-read-model-store",
        manifests: manifests.manifests
      },
      miss_reason: "",
      freshness: status.freshness
    };
  } finally {
    db?.close();
  }
}

export async function readAdminSourceVideoStatusesPageFromStore(input: {
  library_root: string;
  library: LibraryCounts & { updated_at?: string } | null;
  statuses: PreprocessStatus[];
  offset: number;
  limit: number;
  query?: string;
}): Promise<AdminReadModelStoreSourceVideoPage | null> {
  return (await readAdminSourceVideoStatusesPageFromStoreWithReadiness(input)).page;
}

export async function readAdminSourceVideoStatusPageFromStoreWithReadiness(input: {
  library_root: string;
  library: LibraryCounts & { updated_at?: string } | null;
  status: PreprocessStatus;
  offset: number;
  limit: number;
  query?: string;
}): Promise<AdminReadModelStoreSourceVideoPageReadResult> {
  return readAdminSourceVideoStatusesPageFromStoreWithReadiness({
    library_root: input.library_root,
    library: input.library,
    statuses: [input.status],
    offset: input.offset,
    limit: input.limit,
    query: input.query
  });
}

export async function readAdminSourceVideoStatusPageFromStore(input: {
  library_root: string;
  library: LibraryCounts & { updated_at?: string } | null;
  status: PreprocessStatus;
  offset: number;
  limit: number;
  query?: string;
}): Promise<AdminReadModelStoreSourceVideoPage | null> {
  return (await readAdminSourceVideoStatusPageFromStoreWithReadiness({
    library_root: input.library_root,
    library: input.library,
    status: input.status,
    offset: input.offset,
    limit: input.limit,
    query: input.query
  })).page;
}

export async function readAdminPreprocessJobManifestPageFromStore(input: {
  library_root: string;
  library: LibraryCounts & { updated_at?: string } | null;
  offset: number;
  limit: number;
}): Promise<AdminReadModelStorePreprocessJobPage | null> {
  if (input.limit <= 0) {
    return null;
  }

  const storePath = adminReadModelStorePath(input.library_root);
  if (!(await fileExists(storePath))) {
    return null;
  }

  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(`file:${storePath}?mode=ro`);
    const metadata = readMetadata(db);
    const status = statusFromMetadata({
      store_path: storePath,
      library: input.library,
      metadata,
      counts: readCounts(db, metadata)
    });
    if (status.freshness !== "fresh") {
      return null;
    }

    const observableJobCount = countPreprocessJobStoreRows(status.counts_by_status);
    if (observableJobCount <= 0 || input.offset >= observableJobCount) {
      return null;
    }

    const manifests = readPreprocessJobStoreManifestRows({
      db,
      counts_by_status: status.counts_by_status,
      offset: input.offset,
      limit: input.limit
    });

    const readySnapshotManifests = manifests
      ? manifests.filter((manifest) => manifest.preprocess_status === "ready")
      : [];

    return manifests ? {
      source: "admin-read-model-store",
      manifests,
      preprocess_jobs: input.library && readySnapshotManifests.length > 0
        ? readPreprocessJobSnapshotRowsForManifests({
            db,
            metadata,
            library: input.library,
            manifests: readySnapshotManifests
          })
        : []
    } : null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}
