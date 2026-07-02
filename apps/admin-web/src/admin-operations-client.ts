import type {
  MixlabDoctorExport,
  MixlabDoctorReport
} from "../../../packages/doctor-core/src/index.ts";
import { deleteJson, getJson, getJsonWithMeta, listQuery, sendJson } from "./admin-http.ts";
import type {
  AdminActionResult,
  AdminCommandRestorePlan,
  AdminCommandSnapshotRestoreResult,
  AdminDashboardMetrics,
  AdminDataLoadingPlan,
  AdminIndexVersionsResponse,
  AdminLibraryStatus,
  AdminOperationLogResponse,
  AdminOperationsOverview,
  AdminPathCheck,
  AdminPreprocessJobLog,
  AdminPreprocessJobsResponse,
  AdminPreprocessProcessHistoryOptions,
  AdminPreprocessProcessHistoryResponse,
  AdminPreprocessSupervisorStatus,
  AdminReadModelReconcilerCancelResult,
  AdminReadModelReconcilerStartResult,
  AdminReadModelReconcilerStatus,
  AdminRuntimeDiagnosticsHistoryOptions,
  AdminRuntimeDiagnosticsHistoryResponse,
  AdminRuntimeSettings,
  AdminSettingsConfig,
  AdminSettingsConfigUpdate,
  AdminSourceFolderCreate,
  AdminSourceFolderUpdate
} from "./api.ts";

export const ADMIN_PREPROCESS_JOB_DEFAULT_LOAD_LIMIT = 20;
export const ADMIN_PREPROCESS_PROCESS_HISTORY_DEFAULT_LOAD_LIMIT = 20;

export interface AdminOperationsClientContext {
  fetchImpl: typeof fetch;
  baseUrl: string;
  protectedHeaders?: HeadersInit;
}

export interface AdminOperationsClientMethods {
  getLibraryStatus(): Promise<AdminLibraryStatus>;
  getDataLoadingPlan(): Promise<AdminDataLoadingPlan>;
  getOperationsOverview(): Promise<AdminOperationsOverview>;
  getReadModelReconcileStatus(): Promise<AdminReadModelReconcilerStatus>;
  startReadModelReconcile(): Promise<AdminReadModelReconcilerStartResult>;
  cancelReadModelReconcile(): Promise<AdminReadModelReconcilerCancelResult>;
  getOperationLog(options?: { limit?: number }): Promise<AdminOperationLogResponse>;
  getCommandSnapshotRestorePlan(snapshotId: string): Promise<AdminCommandRestorePlan>;
  restoreCommandSnapshot(snapshotId: string): Promise<AdminCommandSnapshotRestoreResult>;
  getPathChecks(): Promise<AdminPathCheck[]>;
  getAdminSettings(): Promise<AdminSettingsConfig>;
  saveAdminSettings(settings: AdminSettingsConfigUpdate): Promise<AdminSettingsConfig>;
  addSourceFolder(folder: AdminSourceFolderCreate): Promise<AdminSettingsConfig>;
  updateSourceFolder(sourceFolderId: string, patch: AdminSourceFolderUpdate): Promise<AdminSettingsConfig>;
  removeSourceFolder(sourceFolderId: string): Promise<AdminSettingsConfig>;
  getDashboardMetrics(): Promise<AdminDashboardMetrics>;
  listPreprocessJobs(options?: { limit?: number; offset?: number }): Promise<AdminPreprocessJobsResponse>;
  listPreprocessProcessHistory(
    options?: AdminPreprocessProcessHistoryOptions
  ): Promise<AdminPreprocessProcessHistoryResponse>;
  getPreprocessJobLog(jobId: string): Promise<AdminPreprocessJobLog>;
  listIndexVersions(): Promise<AdminIndexVersionsResponse>;
  getDoctorReport(): Promise<MixlabDoctorReport>;
  getRuntimeDiagnosticsHistory(
    options?: AdminRuntimeDiagnosticsHistoryOptions
  ): Promise<AdminRuntimeDiagnosticsHistoryResponse>;
  getRuntimeSettings(): Promise<AdminRuntimeSettings>;
  initializeLibrary(): Promise<AdminActionResult>;
  scanSourceVideos(): Promise<AdminActionResult>;
  queueUnprocessedVideos(): Promise<AdminActionResult>;
  retryFailedVideos(): Promise<AdminActionResult>;
  recoverProcessingVideos(): Promise<AdminActionResult>;
  getPreprocessSupervisorStatus(): Promise<AdminPreprocessSupervisorStatus>;
  startPreprocessSupervisor(
    limit?: number,
    options?: {
      queue_unprocessed_limit?: number;
      source_video_ids?: string[];
      asr_mode?: "default" | "long-task";
    }
  ): Promise<AdminPreprocessSupervisorStatus>;
  stopPreprocessSupervisor(): Promise<AdminPreprocessSupervisorStatus>;
  repairIndex(options?: { limit?: number }): Promise<AdminActionResult>;
  runDoctor(): Promise<MixlabDoctorReport>;
  exportDoctorReport(): Promise<MixlabDoctorExport>;
  testAsrConfig(): Promise<AdminActionResult>;
}

function processHistoryQuery(options?: AdminPreprocessProcessHistoryOptions): string {
  const params = new URLSearchParams();

  if (options?.limit) {
    params.set("limit", String(options.limit));
  }

  if (options?.window_days) {
    params.set("window_days", String(options.window_days));
  }

  if (options?.source_folder_name?.trim()) {
    params.set("source_folder_name", options.source_folder_name.trim());
  }

  if (options?.preprocess_status && options.preprocess_status !== "all") {
    params.set("preprocess_status", options.preprocess_status);
  }

  if (options?.event_type && options.event_type !== "all") {
    params.set("event_type", options.event_type);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function runtimeDiagnosticsHistoryQuery(options?: AdminRuntimeDiagnosticsHistoryOptions): string {
  const params = new URLSearchParams();

  if (options?.limit) {
    params.set("limit", String(options.limit));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function createAdminOperationsClientMethods({
  fetchImpl,
  baseUrl,
  protectedHeaders
}: AdminOperationsClientContext): AdminOperationsClientMethods {
  return {
    getLibraryStatus: () =>
      getJson<AdminLibraryStatus>(fetchImpl, baseUrl, "/api/admin/library/status", protectedHeaders),
    getDataLoadingPlan: () =>
      getJson<AdminDataLoadingPlan>(fetchImpl, baseUrl, "/api/admin/data-loading/plan", protectedHeaders),
    getOperationsOverview: () =>
      getJson<AdminOperationsOverview>(fetchImpl, baseUrl, "/api/admin/operations/overview", protectedHeaders),
    getReadModelReconcileStatus: () =>
      getJson<AdminReadModelReconcilerStatus>(
        fetchImpl,
        baseUrl,
        "/api/admin/read-model/reconcile/status",
        protectedHeaders
      ),
    startReadModelReconcile: () =>
      sendJson<AdminReadModelReconcilerStartResult>(
        fetchImpl,
        baseUrl,
        "/api/admin/read-model/reconcile",
        "POST",
        undefined,
        protectedHeaders
      ),
    cancelReadModelReconcile: () =>
      sendJson<AdminReadModelReconcilerCancelResult>(
        fetchImpl,
        baseUrl,
        "/api/admin/read-model/reconcile/cancel",
        "POST",
        undefined,
        protectedHeaders
      ),
    getOperationLog: (options) => {
      const params = new URLSearchParams();
      if (options?.limit !== undefined) {
        params.set("limit", String(options.limit));
      }
      const query = params.toString();
      return getJson<AdminOperationLogResponse>(
        fetchImpl,
        baseUrl,
        `/api/admin/operation-log${query ? `?${query}` : ""}`,
        protectedHeaders
      );
    },
    getCommandSnapshotRestorePlan: (snapshotId) =>
      getJson<AdminCommandRestorePlan>(
        fetchImpl,
        baseUrl,
        `/api/admin/command-snapshots/${encodeURIComponent(snapshotId)}/restore-plan`,
        protectedHeaders
      ),
    restoreCommandSnapshot: (snapshotId) =>
      sendJson<AdminCommandSnapshotRestoreResult>(
        fetchImpl,
        baseUrl,
        `/api/admin/command-snapshots/${encodeURIComponent(snapshotId)}/restore`,
        "POST",
        undefined,
        protectedHeaders
      ),
    getPathChecks: () =>
      getJson<AdminPathCheck[]>(fetchImpl, baseUrl, "/api/admin/library/path-checks", protectedHeaders),
    getAdminSettings: () =>
      getJson<AdminSettingsConfig>(fetchImpl, baseUrl, "/api/admin/settings/config", protectedHeaders),
    saveAdminSettings: (settingsUpdate) =>
      sendJson<AdminSettingsConfig>(
        fetchImpl,
        baseUrl,
        "/api/admin/settings/config",
        "PATCH",
        settingsUpdate,
        protectedHeaders
      ),
    addSourceFolder: (folder) =>
      sendJson<AdminSettingsConfig>(
        fetchImpl,
        baseUrl,
        "/api/admin/settings/source-folders",
        "POST",
        folder,
        protectedHeaders
      ),
    updateSourceFolder: (sourceFolderId, patch) =>
      sendJson<AdminSettingsConfig>(
        fetchImpl,
        baseUrl,
        `/api/admin/settings/source-folders/${sourceFolderId}`,
        "PATCH",
        patch,
        protectedHeaders
      ),
    removeSourceFolder: (sourceFolderId) =>
      deleteJson<AdminSettingsConfig>(
        fetchImpl,
        baseUrl,
        `/api/admin/settings/source-folders/${sourceFolderId}`,
        protectedHeaders
      ),
    getDashboardMetrics: () =>
      getJson<AdminDashboardMetrics>(fetchImpl, baseUrl, "/api/admin/dashboard/metrics", protectedHeaders),
    listPreprocessJobs: async (options) => {
      const result = await getJsonWithMeta<AdminPreprocessJobsResponse>(
        fetchImpl,
        baseUrl,
        `/api/admin/preprocess/jobs${listQuery(options ?? { limit: ADMIN_PREPROCESS_JOB_DEFAULT_LOAD_LIMIT })}`,
        protectedHeaders
      );

      return result.meta?.runtime
        ? { ...result.data, runtime: result.meta.runtime }
        : result.data;
    },
    listPreprocessProcessHistory: (options) =>
      getJson<AdminPreprocessProcessHistoryResponse>(
        fetchImpl,
        baseUrl,
        `/api/admin/preprocess/process-history${processHistoryQuery(
          options ?? { limit: ADMIN_PREPROCESS_PROCESS_HISTORY_DEFAULT_LOAD_LIMIT, window_days: 30 }
        )}`,
        protectedHeaders
      ),
    getPreprocessJobLog: (jobId) =>
      getJson<AdminPreprocessJobLog>(fetchImpl, baseUrl, `/api/admin/preprocess/jobs/${jobId}/log`, protectedHeaders),
    listIndexVersions: async () => {
      const result = await getJsonWithMeta<AdminIndexVersionsResponse>(
        fetchImpl,
        baseUrl,
        "/api/admin/index/versions",
        protectedHeaders
      );

      return result.meta?.runtime
        ? { ...result.data, runtime: result.meta.runtime }
        : result.data;
    },
    getDoctorReport: () =>
      getJson<MixlabDoctorReport>(fetchImpl, baseUrl, "/api/admin/doctor/report", protectedHeaders),
    getRuntimeDiagnosticsHistory: (options) =>
      getJson<AdminRuntimeDiagnosticsHistoryResponse>(
        fetchImpl,
        baseUrl,
        `/api/admin/runtime/diagnostics/history${runtimeDiagnosticsHistoryQuery(options)}`,
        protectedHeaders
      ),
    getRuntimeSettings: () =>
      getJson<AdminRuntimeSettings>(fetchImpl, baseUrl, "/api/admin/settings/runtime", protectedHeaders),
    initializeLibrary: () =>
      sendJson<AdminActionResult>(fetchImpl, baseUrl, "/api/admin/library/init", "POST", undefined, protectedHeaders),
    scanSourceVideos: () =>
      sendJson<AdminActionResult>(fetchImpl, baseUrl, "/api/admin/library/scan", "POST", undefined, protectedHeaders),
    queueUnprocessedVideos: () =>
      sendJson<AdminActionResult>(
        fetchImpl,
        baseUrl,
        "/api/admin/preprocess/queue-unprocessed",
        "POST",
        undefined,
        protectedHeaders
      ),
    retryFailedVideos: () =>
      sendJson<AdminActionResult>(fetchImpl, baseUrl, "/api/admin/preprocess/retry-failed", "POST", undefined, protectedHeaders),
    recoverProcessingVideos: () =>
      sendJson<AdminActionResult>(
        fetchImpl,
        baseUrl,
        "/api/admin/preprocess/recover-processing",
        "POST",
        undefined,
        protectedHeaders
      ),
    getPreprocessSupervisorStatus: () =>
      getJson<AdminPreprocessSupervisorStatus>(
        fetchImpl,
        baseUrl,
        "/api/admin/preprocess/supervisor/status",
        protectedHeaders
      ),
    startPreprocessSupervisor: (limit, options) =>
      sendJson<AdminPreprocessSupervisorStatus>(
        fetchImpl,
        baseUrl,
        "/api/admin/preprocess/supervisor/start",
        "POST",
        {
          ...(limit ? { limit } : {}),
          ...(options?.queue_unprocessed_limit ? { queue_unprocessed_limit: options.queue_unprocessed_limit } : {}),
          ...(options?.source_video_ids?.length ? { source_video_ids: options.source_video_ids } : {}),
          ...(options?.asr_mode ? { asr_mode: options.asr_mode } : {})
        },
        protectedHeaders
      ),
    stopPreprocessSupervisor: () =>
      sendJson<AdminPreprocessSupervisorStatus>(
        fetchImpl,
        baseUrl,
        "/api/admin/preprocess/supervisor/stop",
        "POST",
        undefined,
        protectedHeaders
      ),
    repairIndex: (options) =>
      sendJson<AdminActionResult>(
        fetchImpl,
        baseUrl,
        "/api/admin/index/repair",
        "POST",
        options?.limit ? { limit: options.limit } : undefined,
        protectedHeaders
      ),
    runDoctor: () =>
      sendJson<MixlabDoctorReport>(fetchImpl, baseUrl, "/api/admin/doctor/run", "POST", undefined, protectedHeaders),
    exportDoctorReport: () =>
      sendJson<MixlabDoctorExport>(fetchImpl, baseUrl, "/api/admin/doctor/export", "POST", undefined, protectedHeaders),
    testAsrConfig: () =>
      sendJson<AdminActionResult>(fetchImpl, baseUrl, "/api/admin/settings/test-asr", "POST", undefined, protectedHeaders)
  };
}
