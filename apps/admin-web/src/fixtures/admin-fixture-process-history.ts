import type {
  AdminPreprocessProcessHistoryEvent,
  AdminPreprocessProcessHistoryFilterOptions,
  AdminPreprocessProcessHistoryFilters,
  AdminPreprocessProcessHistoryItem,
  AdminPreprocessProcessHistoryOptions,
  AdminPreprocessProcessHistoryResponse,
  AdminPreprocessProcessHistorySourceFolderSummary,
  AdminPreprocessProcessHistorySummary,
  AdminPreprocessProcessHistoryTrendBucket,
  AdminPreprocessStatus
} from "../api.ts";

function isCompletedProcessHistoryItem(item: AdminPreprocessProcessHistoryItem): boolean {
  return Boolean(item.completed_at || item.indexed_at);
}

function isFailedProcessHistoryItem(item: AdminPreprocessProcessHistoryItem): boolean {
  return Boolean(item.failed_at || item.preprocess_status === "failed");
}

function isActiveProcessHistoryItem(item: AdminPreprocessProcessHistoryItem): boolean {
  return item.preprocess_status === "processing" || item.preprocess_status === "queued";
}

function averagePositiveProcessHistoryElapsedMs(items: AdminPreprocessProcessHistoryItem[]): number {
  const elapsedItems = items.filter((item) => item.elapsed_ms > 0);
  return elapsedItems.length
    ? Math.round(elapsedItems.reduce((total, item) => total + item.elapsed_ms, 0) / elapsedItems.length)
    : 0;
}

function newestProcessHistoryEventAt(items: AdminPreprocessProcessHistoryItem[]): string {
  return items.map((item) => item.last_event_at).filter(Boolean).sort().at(-1) ?? "";
}

function summarizeProcessHistorySourceFolders(
  items: AdminPreprocessProcessHistoryItem[]
): AdminPreprocessProcessHistorySourceFolderSummary[] {
  const grouped = new Map<string, AdminPreprocessProcessHistoryItem[]>();
  for (const item of items) {
    const folderName = item.source_folder_name || "未归类";
    grouped.set(folderName, [...(grouped.get(folderName) ?? []), item]);
  }

  return [...grouped.entries()]
    .map(([folderName, folderItems]) => ({
      source_folder_name: folderName,
      tracked_count: folderItems.length,
      completed_count: folderItems.filter(isCompletedProcessHistoryItem).length,
      failed_count: folderItems.filter(isFailedProcessHistoryItem).length,
      active_count: folderItems.filter(isActiveProcessHistoryItem).length,
      average_process_ms: averagePositiveProcessHistoryElapsedMs(folderItems),
      newest_event_at: newestProcessHistoryEventAt(folderItems)
    }))
    .sort((left, right) =>
      right.tracked_count - left.tracked_count
      || right.failed_count - left.failed_count
      || right.active_count - left.active_count
      || right.newest_event_at.localeCompare(left.newest_event_at)
      || left.source_folder_name.localeCompare(right.source_folder_name)
    )
    .slice(0, 8);
}

function summarizeProcessHistoryDailyTrend(
  items: AdminPreprocessProcessHistoryItem[]
): AdminPreprocessProcessHistoryTrendBucket[] {
  const grouped = new Map<string, AdminPreprocessProcessHistoryItem[]>();
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
      average_process_ms: averagePositiveProcessHistoryElapsedMs(dateItems)
    }))
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 14);
}

function normalizeProcessHistoryFilters(
  options?: AdminPreprocessProcessHistoryOptions
): AdminPreprocessProcessHistoryFilters {
  return {
    source_folder_name: options?.source_folder_name?.trim() ?? "",
    preprocess_status: options?.preprocess_status && options.preprocess_status !== "all"
      ? options.preprocess_status
      : "",
    event_type: options?.event_type && options.event_type !== "all"
      ? options.event_type
      : ""
  };
}

function processHistoryItemMatchesFilters(input: {
  item: AdminPreprocessProcessHistoryItem;
  filters: AdminPreprocessProcessHistoryFilters;
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

function processHistoryFilterOptions(
  items: AdminPreprocessProcessHistoryItem[],
  filters: AdminPreprocessProcessHistoryFilters
): AdminPreprocessProcessHistoryFilterOptions {
  const folderNames = [...new Set(items.map((item) => item.source_folder_name || "未归类"))].sort();
  if (filters.source_folder_name && !folderNames.includes(filters.source_folder_name)) {
    folderNames.push(filters.source_folder_name);
  }

  const statusOrder: AdminPreprocessStatus[] = [
    "unprocessed",
    "queued",
    "processing",
    "ready",
    "failed",
    "index-required"
  ];
  const eventOrder: AdminPreprocessProcessHistoryEvent[] = [
    "failed",
    "indexed",
    "completed",
    "claimed",
    "status"
  ];
  const statuses = new Set(items.map((item) => item.preprocess_status));
  const eventTypes = new Set(items.map((item) => item.last_event_type));

  return {
    source_folder_names: folderNames.slice(0, 64),
    preprocess_statuses: statusOrder.filter((status) => statuses.has(status)),
    event_types: eventOrder.filter((eventType) => eventTypes.has(eventType))
  };
}

function summarizeProcessHistoryItems(
  items: AdminPreprocessProcessHistoryItem[]
): AdminPreprocessProcessHistorySummary {
  const completedItems = items.filter(isCompletedProcessHistoryItem);
  const averageProcessMs = averagePositiveProcessHistoryElapsedMs(completedItems);
  const statusCounts: Record<AdminPreprocessStatus, number> = {
    unprocessed: 0,
    queued: 0,
    processing: 0,
    ready: 0,
    failed: 0,
    "index-required": 0
  };
  const eventCounts: Record<AdminPreprocessProcessHistoryEvent, number> = {
    failed: 0,
    indexed: 0,
    completed: 0,
    claimed: 0,
    status: 0
  };
  const eventTimes = items.map((item) => item.last_event_at).filter(Boolean).sort();

  for (const item of items) {
    statusCounts[item.preprocess_status] += 1;
    eventCounts[item.last_event_type] += 1;
  }

  return {
    returned_count: items.length,
    completed_count: completedItems.length,
    failed_count: items.filter(isFailedProcessHistoryItem).length,
    active_count: items.filter(isActiveProcessHistoryItem).length,
    average_process_ms: averageProcessMs,
    tracked_count: items.length,
    tracked_completed_count: completedItems.length,
    tracked_failed_count: items.filter(isFailedProcessHistoryItem).length,
    tracked_active_count: items.filter(isActiveProcessHistoryItem).length,
    tracked_average_process_ms: averageProcessMs,
    window_start_at: "",
    newest_event_at: eventTimes[eventTimes.length - 1] ?? "",
    oldest_event_at: eventTimes[0] ?? "",
    status_counts: statusCounts,
    event_counts: eventCounts,
    source_folder_summaries: summarizeProcessHistorySourceFolders(items),
    daily_trend: summarizeProcessHistoryDailyTrend(items)
  };
}

export function clonePreprocessProcessHistory(
  value: AdminPreprocessProcessHistoryResponse,
  options?: AdminPreprocessProcessHistoryOptions
): AdminPreprocessProcessHistoryResponse {
  const limit = options?.limit && options.limit > 0
    ? Math.floor(options.limit)
    : value.limit;
  const windowDays = options?.window_days && options.window_days > 0
    ? Math.floor(options.window_days)
    : value.window_days;
  const filters = normalizeProcessHistoryFilters(options);
  const allItems = value.items.map((item) => ({ ...item }));
  const filteredItems = allItems.filter((item) => processHistoryItemMatchesFilters({ item, filters }));
  const items = filteredItems.slice(0, limit);

  return {
    ...value,
    window_days: windowDays,
    limit,
    filters,
    filter_options: processHistoryFilterOptions(allItems, filters),
    summary: summarizeProcessHistoryItems(items),
    items
  };
}
