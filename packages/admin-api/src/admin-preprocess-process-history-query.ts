import type {
  LibraryCounts,
  PreprocessStatus
} from "../../protocol/src/index.ts";
import type {
  AdminReadModelStorePreprocessProcessHistory,
  AdminReadModelStorePreprocessProcessHistoryEvent,
  AdminReadModelStorePreprocessProcessHistoryReadiness
} from "./admin-read-model-store.ts";

export type AdminPreprocessProcessHistoryLibrary = (LibraryCounts & { updated_at?: string }) | null;

export interface AdminPreprocessProcessHistoryFilters {
  source_folder_name: string;
  preprocess_status: PreprocessStatus | "";
  event_type: AdminReadModelStorePreprocessProcessHistoryEvent | "";
}

export interface AdminPreprocessProcessHistoryQueryInput {
  library_root: string;
  now: string;
  window_days: number;
  limit: number;
  source_folder_name: string;
  preprocess_status: PreprocessStatus | "";
  event_type: AdminReadModelStorePreprocessProcessHistoryEvent | "";
}

export interface AdminPreprocessProcessHistoryReadinessInput {
  library_root: string;
  checked_at?: string;
}

export interface AdminPreprocessProcessHistoryQueryDeps {
  read_library_manifest(libraryRoot: string): Promise<AdminPreprocessProcessHistoryLibrary>;
  read_process_history_from_store(input: {
    library_root: string;
    library: AdminPreprocessProcessHistoryLibrary;
    now: string;
    window_days: number;
    limit: number;
    filters: AdminPreprocessProcessHistoryFilters;
  }): Promise<AdminReadModelStorePreprocessProcessHistory | null>;
  read_process_history_readiness_from_store(input: {
    library_root: string;
    library: AdminPreprocessProcessHistoryLibrary;
  }): Promise<AdminReadModelStorePreprocessProcessHistoryReadiness>;
}

export interface AdminPreprocessProcessHistoryResponse {
  schema_version: "1.0";
  generated_at: string;
  library_updated_at?: string;
  data_source: "admin-read-model";
  actual_data_source: "admin-read-model";
  cache_status: "hit" | "miss";
  scan_mode: "no-scan";
  scan_reason: "route-owned-page";
  history_available: boolean;
  window_days: number;
  limit: number;
  filters: AdminPreprocessProcessHistoryFilters;
  filter_options: AdminReadModelStorePreprocessProcessHistory["filter_options"];
  summary: AdminReadModelStorePreprocessProcessHistory["summary"];
  items: AdminReadModelStorePreprocessProcessHistory["items"];
}

export type AdminPreprocessProcessHistoryReadinessResponse =
  AdminReadModelStorePreprocessProcessHistoryReadiness & {
    schema_version: "1.0";
    checked_at: string;
    data_source: "admin-read-model";
    actual_data_source: "admin-read-model";
    scan_mode: "no-scan";
    scan_reason: "read-model-health";
  };

function emptyPreprocessProcessHistoryResponse(input: {
  generated_at: string;
  window_days: number;
  limit: number;
  filters: AdminPreprocessProcessHistoryFilters;
}): AdminPreprocessProcessHistoryResponse {
  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    data_source: "admin-read-model",
    actual_data_source: "admin-read-model",
    cache_status: "miss",
    scan_mode: "no-scan",
    scan_reason: "route-owned-page",
    history_available: false,
    window_days: input.window_days,
    limit: input.limit,
    filters: input.filters,
    filter_options: {
      source_folder_names: [],
      preprocess_statuses: [],
      event_types: []
    },
    summary: {
      returned_count: 0,
      completed_count: 0,
      failed_count: 0,
      active_count: 0,
      average_process_ms: 0,
      tracked_count: 0,
      tracked_completed_count: 0,
      tracked_failed_count: 0,
      tracked_active_count: 0,
      tracked_average_process_ms: 0,
      window_start_at: "",
      newest_event_at: "",
      oldest_event_at: "",
      status_counts: {
        unprocessed: 0,
        queued: 0,
        processing: 0,
        ready: 0,
        failed: 0,
        "index-required": 0
      },
      event_counts: {
        failed: 0,
        indexed: 0,
        completed: 0,
        claimed: 0,
        status: 0
      },
      source_folder_summaries: [],
      daily_trend: []
    },
    items: []
  };
}

export async function readAdminPreprocessProcessHistoryQuery(
  deps: AdminPreprocessProcessHistoryQueryDeps,
  input: AdminPreprocessProcessHistoryQueryInput
): Promise<AdminPreprocessProcessHistoryResponse> {
  const library = await deps.read_library_manifest(input.library_root);
  const filters = {
    source_folder_name: input.source_folder_name,
    preprocess_status: input.preprocess_status,
    event_type: input.event_type
  };
  const history = await deps.read_process_history_from_store({
    library_root: input.library_root,
    library,
    now: input.now,
    window_days: input.window_days,
    limit: input.limit,
    filters
  });

  if (!history) {
    return emptyPreprocessProcessHistoryResponse({
      generated_at: input.now,
      window_days: input.window_days,
      limit: input.limit,
      filters
    });
  }

  return {
    schema_version: "1.0",
    generated_at: history.generated_at,
    library_updated_at: history.library_updated_at,
    data_source: "admin-read-model",
    actual_data_source: "admin-read-model",
    cache_status: "hit",
    scan_mode: "no-scan",
    scan_reason: "route-owned-page",
    history_available: true,
    window_days: history.window_days,
    limit: history.limit,
    filters: history.filters,
    filter_options: history.filter_options,
    summary: history.summary,
    items: history.items
  };
}

export async function readAdminPreprocessProcessHistoryReadinessQuery(
  deps: AdminPreprocessProcessHistoryQueryDeps,
  input: AdminPreprocessProcessHistoryReadinessInput
): Promise<AdminPreprocessProcessHistoryReadinessResponse> {
  const library = await deps.read_library_manifest(input.library_root);
  const readiness = await deps.read_process_history_readiness_from_store({
    library_root: input.library_root,
    library
  });
  return {
    ...readiness,
    schema_version: "1.0",
    checked_at: input.checked_at ?? new Date().toISOString(),
    data_source: "admin-read-model",
    actual_data_source: "admin-read-model",
    scan_mode: "no-scan",
    scan_reason: "read-model-health"
  };
}
