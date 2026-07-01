import { createReadStream } from "node:fs";
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from "node:http";
import { exportMixlabDoctorReport, runMixlabDoctor } from "../../doctor-core/src/index.ts";
import {
  applyAdminRuntimeSecretsToEnv,
  assertPreprocessSafeToStart,
  listCutterUsers,
  publicCutterUser,
  readAdminSettings,
  readAllSourceVideoManifests,
  readPreprocessJobLog,
  readSourceVideoManifest,
  readUsageMetrics,
  validateAdminSession,
  AdminWriterLeaseError
} from "../../library-fs/src/index.ts";
import {
  type PreprocessStatus,
  type SourceVideoManifest
} from "../../protocol/src/index.ts";
import {
  createPreprocessSupervisor,
  type PreprocessSupervisorRunner
} from "./preprocess-supervisor.ts";
import {
  AdminReadyProtectionError
} from "./admin-protection.ts";
import {
  appendAdminOperationLogEvent,
  readAdminOperationLog
} from "./admin-operation-log.ts";
import {
  adminCommandSystemActor,
  type AdminCommandActor
} from "./admin-command-audit.ts";
import {
  isPublicAdminMediaRoute,
  jsonBytes,
  readAdminRequestJson as readRequestJson,
  requireAdminSession,
  writeAdminJson as writeJson,
  writeAdminNoContent as writeNoContent
} from "./admin-http-session.ts";
import {
  runAdminApproveCutterUserCommand,
  runAdminDisableCutterUserCommand,
  runAdminResetCutterUserPasswordCommand,
  type AdminApproveCutterUserResult
} from "./admin-cutter-user-commands.ts";
import {
  ADMIN_SOURCE_VIDEO_ROUTE_DEFAULT_LIMIT
} from "./admin-data-loading-plan.ts";
import {
  AdminDockerMvpCommandBlockedError,
  adminRecoverProcessingSupervisorBlock
} from "./admin-command-guard.ts";
import { runAdminCommand } from "./admin-command-runtime.ts";
import {
  createAdminReadModelServerFacade
} from "./admin-read-model-server-facade.ts";
import {
  runAdminLibraryInitCommand
} from "./admin-library-commands.ts";
import {
  runAdminLibraryScanApplyCommand,
  runAdminLibraryScanPreviewCommand
} from "./admin-scan-planner.ts";
import {
  runAdminSettingsConfigCommand,
  runAdminSourceFolderAddCommand,
  runAdminSourceFolderRemoveCommand,
  runAdminSourceFolderUpdateCommand
} from "./admin-settings-commands.ts";
import {
  runAdminBulkTransitionCommand,
  runAdminSourceVideoTransitionCommand
} from "./admin-transition-commands.ts";
import {
  runAdminIndexRepairCommand,
  runAdminSourceVideoPublishCommand,
  type ReadyPublishMedia
} from "./admin-publish-commands.ts";
import { createDefaultReadyPublishMedia } from "./admin-ready-publish-media.ts";
import {
  assertRealPreprocessStartReady,
  createRealPreprocessRunner
} from "./admin-preprocess-pipeline.ts";
import {
  runAdminSourceVideoCoverCommand,
  runAdminSourceVideoMetadataCommand
} from "./admin-source-video-commands.ts";
import {
  planAdminReadModelStoreReconciliation,
  readAdminDashboardMaterialSummaryFromStore,
  readAdminDashboardProductionSummaryFromStore,
  readAdminPreprocessJobManifestPageFromStore,
  readAdminPreprocessProcessHistoryReadinessFromStore,
  readAdminPreprocessProcessHistoryFromStore,
  readAdminReadModelStoreStatus,
  readAdminSourceVideoStatusPageFromStoreWithReadiness,
  readAdminSourceVideoStatusesPageFromStoreWithReadiness,
  writeAdminSourceVideoManifestsToReadModelStore
} from "./admin-read-model-store.ts";
import {
  createAdminSourceVideoRouteServerDeps
} from "./admin-source-video-route-deps.ts";
import {
  createAdminPreprocessJobsReadServices
} from "./admin-preprocess-jobs-read-services.ts";
import {
  readIndexedAdminSourceVideoIdSet,
  readIndexedAdminSourceVideoManifestMapByIds
} from "./admin-source-video-index-query.ts";
import {
  clearAdminSourceVideoDefaultPageCache
} from "./admin-source-video-default-page-query.ts";
import {
  createAdminSourceVideoReadFacade
} from "./admin-source-video-read-facade.ts";
import {
  clearAdminIndexVersionCache,
  listAdminIndexVersionsWithRuntimeMeta
} from "./admin-index-versions-query.ts";
import {
  createAdminDashboardReadServices
} from "./admin-dashboard-read-services.ts";
import {
  createAdminHealthReadServices
} from "./admin-health-read-services.ts";
import {
  createAdminProtectionReadServices
} from "./admin-protection-read-services.ts";
import {
  adminFileExists,
  adminImageContentType,
  resolveAdminVideoArtifactPath
} from "./admin-source-video-artifact-path.ts";
import {
  writeAdminSourceVideoCoverResponse
} from "./admin-source-video-cover-response.ts";
import {
  toPublicPreprocessSupervisorStatus as publicPreprocessSupervisorStatus
} from "./admin-preprocess-supervisor-status.ts";
import {
  createAdminPrimarySourceVideosPathReader
} from "./admin-primary-source-videos-path.ts";
import {
  adminLibraryManifestPath as libraryManifestPath,
  adminMixlabRoot as mixlabRoot,
  adminSourceTranscriptIndexRoot as sourceTranscriptIndexRoot,
  adminSourceVideosRoot as sourceVideosRoot,
  adminVideosRoot as videosRoot
} from "./admin-library-paths.ts";
import {
  isNotFoundError,
  readAdminJsonFile as readJsonFile,
  readAdminLibraryManifest as readLibraryManifest,
  readAdminPreprocessJob as readPreprocessJob,
  type AdminLibraryManifest as LibraryManifest
} from "./admin-file-fact-readers.ts";
import {
  readAdminCurrentIndexMetadata as readCurrentIndexMetadata,
  readAdminCurrentIndexVersion as readCurrentIndexVersion
} from "./admin-current-index-query.ts";
import {
  createAdminSourceVideoManifestReader
} from "./admin-source-video-manifest-cache.ts";
import {
  getAdminSourceVideoDetail,
  readAdminSourceVideoTranscriptSummary,
  toAdminSourceVideo
} from "./admin-source-video-detail-query.ts";
import {
  createAdminSourceVideoStatusReadModelRuntime
} from "./admin-source-video-status-read-model-runtime.ts";
import {
  readAdminRuntimeDiagnosticsHistory
} from "./admin-runtime-observability.ts";
import {
  getAdminRuntimeSettings
} from "./admin-runtime-settings-query.ts";
import {
  createDefaultAdminRuntimeDiagnosticsRecorder
} from "./admin-runtime-diagnostics-recorder.ts";
import {
  apiError,
  apiOk
} from "./admin-route-adapter.ts";
import {
  dispatchAdminJsonRoutes
} from "./admin-json-route-dispatcher.ts";
import {
  handleAdminReadModelRoutes
} from "./admin-read-model-routes.ts";
import {
  handleAdminSourceVideoRoutes
} from "./admin-source-video-routes.ts";
import {
  handleAdminSourceVideoMediaRoutes
} from "./admin-source-video-media-routes.ts";
import { createAdminSourceVideoMediaRouteDeps } from "./admin-source-video-media-route-deps.ts";
import {
  handleAdminSourceVideoCommandRoutes
} from "./admin-source-video-command-routes.ts";
import {
  createAdminSourceVideoCommandRouteServerDeps
} from "./admin-source-video-command-route-deps.ts";
import {
  handleAdminSlowReadRoutes
} from "./admin-slow-read-routes.ts";
import {
  createAdminSlowReadRouteServerDeps
} from "./admin-slow-read-route-deps.ts";
import {
  handleAdminSystemReadRoutes
} from "./admin-system-read-routes.ts";
import {
  createAdminSystemReadRouteServerDeps
} from "./admin-system-read-route-deps.ts";
import {
  handleAdminPreprocessReadRoutes
} from "./admin-preprocess-read-routes.ts";
import {
  createAdminPreprocessReadRouteServerDeps
} from "./admin-preprocess-read-route-deps.ts";
import {
  handleAdminPreprocessCommandRoutes
} from "./admin-preprocess-command-routes.ts";
import {
  createAdminPreprocessCommandRouteServerDeps
} from "./admin-preprocess-command-route-deps.ts";
import {
  handleAdminSettingsCommandRoutes
} from "./admin-settings-command-routes.ts";
import {
  createAdminSettingsCommandRouteServerDeps
} from "./admin-settings-command-route-deps.ts";
import {
  handleAdminLibraryCommandRoutes
} from "./admin-library-command-routes.ts";
import {
  createAdminLibraryCommandRouteServerDeps
} from "./admin-library-command-route-deps.ts";
import {
  handleAdminIndexCommandRoutes
} from "./admin-index-command-routes.ts";
import {
  createAdminIndexCommandRouteServerDeps
} from "./admin-index-command-route-deps.ts";
import {
  handleAdminCutterUserCommandRoutes
} from "./admin-cutter-user-command-routes.ts";
import {
  createAdminCutterUserCommandRouteServerDeps
} from "./admin-cutter-user-command-route-deps.ts";
import {
  handleAdminCommandRestoreRoutes,
  resolveAdminCommandSnapshotManifestPath
} from "./admin-command-restore-routes.ts";
import {
  createAdminCommandRestoreRouteServerDeps
} from "./admin-command-restore-route-deps.ts";
import {
  handleAdminRuntimeDiagnosticRoutes
} from "./admin-runtime-diagnostic-routes.ts";
import {
  createAdminRuntimeDiagnosticRouteServerDeps
} from "./admin-runtime-diagnostic-route-deps.ts";
import {
  handleAdminRuntimeObservabilityRoutes
} from "./admin-runtime-observability-routes.ts";
import {
  createAdminRuntimeObservabilityRouteServerDeps
} from "./admin-runtime-observability-route-deps.ts";
import {
  handleAdminProtectionReadRoutes
} from "./admin-protection-read-routes.ts";
import {
  createAdminProtectionReadRouteServerDeps
} from "./admin-protection-read-route-deps.ts";
import {
  adminSessionTokenFromRequest,
  handleAdminAuthRoutes,
  isPublicAdminAuthRoute
} from "./admin-auth-routes.ts";
import {
  createAdminAuthRouteServerDeps
} from "./admin-auth-route-deps.ts";
import {
  planAdminCommandSnapshotRestore,
  type AdminCommandRestorePlan
} from "./admin-command-restore-plan.ts";
import {
  restoreAdminCommandSnapshot,
  type AdminCommandSnapshotRestoreResult
} from "./admin-command-restore.ts";

export {
  runAdminPreprocessPipeline
} from "./admin-preprocess-pipeline.ts";
export type {
  AdminPreprocessWorkerCycleInput,
  RunAdminPreprocessPipelineInput,
  RunAdminPreprocessPipelineResult
} from "./admin-preprocess-pipeline.ts";

export interface CreateAdminApiServerInput {
  library_root: string;
  library_id?: string;
  library_name?: string;
  auth_mode?: "password" | "disabled";
  now?: () => string;
  env?: NodeJS.ProcessEnv;
  preprocess_runner?: PreprocessSupervisorRunner;
  ready_publish_media?: ReadyPublishMedia;
}

const ADMIN_MANIFEST_CACHE_TTL_MS = 30_000;
const ADMIN_MANIFEST_READ_CONCURRENCY = 24;
const ADMIN_FILTERED_SCAN_BATCH_SIZE = ADMIN_MANIFEST_READ_CONCURRENCY * 4;
const ADMIN_FILTERED_QUERY_SCAN_BATCH_LIMIT = 8;
const ADMIN_FULL_TRANSCRIPT_METRICS_MAX_MANIFESTS = 100;
const ADMIN_FULL_DASHBOARD_METRICS_MAX_MANIFESTS = 100;
const ADMIN_SOURCE_VIDEO_PAGE_SCAN_AHEAD = 200;
const ADMIN_INDEX_VERSION_FAST_PATH_MIN_ORDINAL = 1_000;

function isAdminReadOnlyProbe(headers: IncomingHttpHeaders): boolean {
  const raw = headers["x-mixlab-admin-read-only-probe"];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
  return value === "true" || value === "1";
}

const sourceVideoManifestReader = createAdminSourceVideoManifestReader({
  cache_ttl_ms: ADMIN_MANIFEST_CACHE_TTL_MS,
  manifest_read_concurrency: ADMIN_MANIFEST_READ_CONCURRENCY,
  source_videos_root: videosRoot,
  read_source_video_manifest: readSourceVideoManifest
});

const primarySourceVideosPath = createAdminPrimarySourceVideosPathReader({
  read_settings: readAdminSettings,
  source_videos_root: sourceVideosRoot
});

const sourceVideoStatusReadModelRuntime = createAdminSourceVideoStatusReadModelRuntime({
  cache_ttl_ms: ADMIN_MANIFEST_CACHE_TTL_MS,
  default_page_limit: ADMIN_SOURCE_VIDEO_ROUTE_DEFAULT_LIMIT,
  page_scan_ahead: ADMIN_SOURCE_VIDEO_PAGE_SCAN_AHEAD,
  manifest_read_concurrency: ADMIN_MANIFEST_READ_CONCURRENCY,
  read_library_manifest: readLibraryManifest,
  read_indexed_ready_id_set(libraryRoot) {
    return readIndexedAdminSourceVideoIdSet({
      library_root: libraryRoot,
      read_current_index_version: readCurrentIndexVersion,
      index_root_from_library_root: sourceTranscriptIndexRoot
    });
  },
  read_indexed_manifest_map_by_ids(readerInput) {
    return readIndexedAdminSourceVideoManifestMapByIds({
      ...readerInput,
      read_current_index_version: readCurrentIndexVersion,
      index_root_from_library_root: sourceTranscriptIndexRoot
    });
  },
  read_sorted_source_video_ids(libraryRoot) {
    return sourceVideoManifestReader.read_sorted_source_video_ids(libraryRoot);
  },
  read_manifests_by_ids(readerInput) {
    return sourceVideoManifestReader.read_manifests_by_ids(readerInput);
  },
  read_all_manifests(libraryRoot) {
    return sourceVideoManifestReader.read_all_manifests(libraryRoot);
  },
  read_manifest_page(readerInput) {
    return sourceVideoManifestReader.read_manifest_page(readerInput);
  },
  cache_manifests(libraryRoot, manifests) {
    sourceVideoManifestReader.cache_manifests(libraryRoot, manifests);
  },
  cache_all_manifests(libraryRoot, manifests) {
    sourceVideoManifestReader.cache_all_manifests(libraryRoot, manifests);
  },
  clear_default_page_cache: clearAdminSourceVideoDefaultPageCache
});

const sourceVideoReadFacade = createAdminSourceVideoReadFacade({
  manifest_read_concurrency: ADMIN_MANIFEST_READ_CONCURRENCY,
  manifest_cache_ttl_ms: ADMIN_MANIFEST_CACHE_TTL_MS,
  filtered_scan_batch_size: ADMIN_FILTERED_SCAN_BATCH_SIZE,
  filtered_query_scan_batch_limit: ADMIN_FILTERED_QUERY_SCAN_BATCH_LIMIT,
  source_video_page_scan_ahead: ADMIN_SOURCE_VIDEO_PAGE_SCAN_AHEAD,
  source_video_route_default_limit: ADMIN_SOURCE_VIDEO_ROUTE_DEFAULT_LIMIT,
  manifest_reader: sourceVideoManifestReader,
  status_read_model_runtime: sourceVideoStatusReadModelRuntime,
  read_library_manifest: readLibraryManifest,
  read_current_index_version: readCurrentIndexVersion,
  source_transcript_index_root: sourceTranscriptIndexRoot,
  read_status_page_from_store: readAdminSourceVideoStatusPageFromStoreWithReadiness,
  read_statuses_page_from_store: readAdminSourceVideoStatusesPageFromStoreWithReadiness,
  read_preprocess_job_manifest_page_from_store: readAdminPreprocessJobManifestPageFromStore,
  write_source_video_manifests_to_store: writeAdminSourceVideoManifestsToReadModelStore
});

const clearAdminSourceVideoPageCache = sourceVideoReadFacade.clear_source_video_page_cache;
const readCachedSourceVideoManifests = sourceVideoReadFacade.read_cached_source_video_manifests;
const readAdminSourceVideoManifestsByIds = sourceVideoReadFacade.read_manifests_by_ids;
const readAllAdminSourceVideoManifests = sourceVideoReadFacade.read_all_manifests;
const readAdminSourceVideoStatusReadModel = sourceVideoReadFacade.read_status_read_model;
const refreshAdminSourceVideoStatusReadModelInBackground =
  sourceVideoReadFacade.refresh_status_read_model_in_background;
const readPreprocessJobManifestPageWithRuntimeMeta =
  sourceVideoReadFacade.read_preprocess_job_manifest_page_with_runtime_meta;
const readAdminSourceVideoListWithRuntimeMeta =
  sourceVideoReadFacade.read_source_video_list_with_runtime_meta;

async function readTranscriptSummary(
  libraryRoot: string,
  manifest: SourceVideoManifest
) {
  return readAdminSourceVideoTranscriptSummary({
    library_root: libraryRoot,
    manifest,
    resolve_artifact_path: resolveAdminVideoArtifactPath,
    read_json_file: readJsonFile,
    is_not_found_error: isNotFoundError
  });
}

const dashboardReadServices = createAdminDashboardReadServices<CreateAdminApiServerInput>({
  full_transcript_metrics_max_manifests: ADMIN_FULL_TRANSCRIPT_METRICS_MAX_MANIFESTS,
  full_dashboard_metrics_max_manifests: ADMIN_FULL_DASHBOARD_METRICS_MAX_MANIFESTS,
  read_library_manifest: readLibraryManifest,
  read_source_video_manifests: readCachedSourceVideoManifests,
  read_current_index_version: readCurrentIndexVersion,
  read_primary_source_videos_path: primarySourceVideosPath,
  mixlab_library_path: mixlabRoot,
  read_status_read_model_store: readAdminReadModelStoreStatus,
  refresh_status_read_model_in_background: refreshAdminSourceVideoStatusReadModelInBackground,
  read_material_summary(libraryRoot, library) {
    return readAdminDashboardMaterialSummaryFromStore({
      library_root: libraryRoot,
      library
    });
  },
  read_production_summary(libraryRoot, library, now) {
    return readAdminDashboardProductionSummaryFromStore({
      library_root: libraryRoot,
      library,
      now
    });
  },
  read_manifests: readCachedSourceVideoManifests,
  read_current_index_metadata: readCurrentIndexMetadata,
  read_transcript_summary: readTranscriptSummary,
  read_preprocess_job: readPreprocessJob,
  read_usage_metrics: readUsageMetrics
});

const healthReadServices = createAdminHealthReadServices<CreateAdminApiServerInput>({
  read_source_video_status_read_model: readAdminSourceVideoStatusReadModel,
  read_primary_source_videos_path: primarySourceVideosPath
});

const protectionReadServices = createAdminProtectionReadServices<
  CreateAdminApiServerInput,
  Awaited<ReturnType<typeof dashboardReadServices.read_library_status>>
>({
  read_library_manifest: readLibraryManifest,
  read_current_index_version: readCurrentIndexVersion,
  read_primary_source_videos_path: primarySourceVideosPath,
  read_library_status: dashboardReadServices.read_library_status,
  read_preprocess_safety: healthReadServices.read_preprocess_safety,
  read_usage_metrics: readUsageMetrics,
  read_settings_config: readAdminSettings,
  mixlab_library_path: mixlabRoot,
  library_manifest_path: libraryManifestPath
});

const preprocessJobsReadServices = createAdminPreprocessJobsReadServices<CreateAdminApiServerInput>({
  read_admin_settings: readAdminSettings,
  read_library_manifest: readLibraryManifest,
  read_preprocess_job_manifest_page: readPreprocessJobManifestPageWithRuntimeMeta,
  read_all_source_video_manifests: readCachedSourceVideoManifests,
  read_preprocess_job: readPreprocessJob,
  read_runtime_load: dashboardReadServices.read_runtime_load_metrics
});

function toAdminApproveCutterUserResponse(result: AdminApproveCutterUserResult) {
  return {
    status: result.status,
    user: publicCutterUser(result.user),
    session: {
      user_id: result.session.user_id,
      device_id: result.session.device_id,
      created_at: result.session.created_at,
      last_seen_at: result.session.last_seen_at
    }
  };
}

async function getSourceVideoDetail(libraryRoot: string, sourceVideoId: string) {
  return getAdminSourceVideoDetail({
    library_root: libraryRoot,
    source_video_id: sourceVideoId,
    readers: {
      read_source_video_manifest: readSourceVideoManifest,
      read_preprocess_job: readPreprocessJob,
      read_json_file: readJsonFile,
      resolve_artifact_path: resolveAdminVideoArtifactPath,
      file_exists: adminFileExists,
      is_not_found_error: isNotFoundError
    }
  });
}

async function writeCover(response: ServerResponse, input: CreateAdminApiServerInput, sourceVideoId: string): Promise<void> {
  return writeAdminSourceVideoCoverResponse({
    response,
    api_input: input,
    source_video_id: sourceVideoId,
    deps: {
      read_source_video_manifest: readSourceVideoManifest,
      resolve_artifact_path: resolveAdminVideoArtifactPath,
      file_exists: adminFileExists,
      image_content_type: adminImageContentType,
      write_json: writeJson,
      api_error: apiError,
      write_stream(streamInput) {
        streamInput.response.writeHead(streamInput.status_code, streamInput.headers);
        createReadStream(streamInput.file_path).pipe(streamInput.response);
      }
    }
  });
}

export function createAdminApiServer(input: CreateAdminApiServerInput): Server {
  const libraryId = input.library_id ?? "lib_main_001";
  const libraryName = input.library_name ?? "MixLab 公共素材库";
  const env = input.env ?? process.env;
  const now = () => input.now?.() ?? new Date().toISOString();
  const readyPublishMedia = input.ready_publish_media ?? createDefaultReadyPublishMedia();
  const supervisor = createPreprocessSupervisor({
    worker_id: `admin-worker-${process.pid}`,
    now,
    runner: input.preprocess_runner ?? createRealPreprocessRunner({
      library_root: input.library_root,
      library_id: libraryId,
      library_name: libraryName,
      env,
      now,
      media: readyPublishMedia,
      clear_source_video_page_cache: clearAdminSourceVideoPageCache
    })
  });
  const refreshRuntimeSecrets = () => applyAdminRuntimeSecretsToEnv(input.library_root, env);
  const readModelServerFacade = createAdminReadModelServerFacade({
    library_root: input.library_root,
    default_page_limit: ADMIN_SOURCE_VIDEO_ROUTE_DEFAULT_LIMIT,
    manifest_cache_ttl_ms: ADMIN_MANIFEST_CACHE_TTL_MS,
    now,
    deps: {
      clear_source_video_page_cache: clearAdminSourceVideoPageCache,
      read_library_manifest: readLibraryManifest,
      read_all_source_video_manifests: readAllAdminSourceVideoManifests,
      read_preprocess_job: readPreprocessJob,
      append_operation_log_event: appendAdminOperationLogEvent,
      read_admin_read_model_store_status: readAdminReadModelStoreStatus,
      plan_admin_read_model_store_reconciliation: planAdminReadModelStoreReconciliation,
      read_source_video_status_read_model_status(statusInput) {
        return sourceVideoStatusReadModelRuntime.status(statusInput);
      },
      get_protection_status: protectionReadServices.read_protection_status,
      get_release_gates: protectionReadServices.read_release_gates,
      read_operation_log: readAdminOperationLog
    }
  });

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

      if (request.method === "OPTIONS") {
        writeNoContent(response);
        return;
      }

      const requestNow = now();
      const runtimeDiagnosticsRecorder = createDefaultAdminRuntimeDiagnosticsRecorder({
        recorded_at: requestNow
      });
      const readOnlyProbe = isAdminReadOnlyProbe(request.headers);

      const authRoute = await handleAdminAuthRoutes({
        method: request.method ?? "",
        pathname: url.pathname,
        search_params: url.searchParams,
        now: requestNow,
        api_input: input,
        session_token: adminSessionTokenFromRequest(request),
        deps: createAdminAuthRouteServerDeps({
          now: requestNow,
          read_request_json() {
            return readRequestJson(request);
          },
          read_health: healthReadServices.read_health
        })
      });
      if (authRoute.handled) {
        writeJson(response, authRoute.status_code, authRoute.body);
        return;
      }

      let requestActor = adminCommandSystemActor("管理端登录已关闭", "auth-disabled");

      if (
        url.pathname.startsWith("/api/admin/") &&
        !isPublicAdminAuthRoute(request.method, url.pathname) &&
        !isPublicAdminMediaRoute(request.method, url.pathname)
      ) {
        const authenticatedActor = await requireAdminSession({
          api_input: input,
          request,
          response,
          now: requestNow,
          deps: {
            validate_admin_session: validateAdminSession,
            write_json: writeJson
          }
        });
        if (!authenticatedActor) {
          return;
        }
        requestActor = authenticatedActor;
      }

      const readRoute = await dispatchAdminJsonRoutes([
        () => handleAdminSystemReadRoutes({
          method: request.method ?? "",
          pathname: url.pathname,
          api_input: input,
          deps: createAdminSystemReadRouteServerDeps({
            env,
            diagnostic_now: now,
            read_library_status_service: dashboardReadServices.read_library_status,
            read_settings_config_service: readAdminSettings,
            refresh_runtime_secrets_service: refreshRuntimeSecrets,
            read_runtime_settings_service({ library_root, env }) {
              return getAdminRuntimeSettings({
                library_root,
                env,
                max_asr_failure_scan_manifests: ADMIN_FULL_DASHBOARD_METRICS_MAX_MANIFESTS
              });
            },
            read_doctor_report_service({ library_root, now: diagnosticNow, env }) {
              return runMixlabDoctor({
                library_root,
                now: diagnosticNow,
                env
              });
            },
            list_cutter_users_service: listCutterUsers,
            project_public_cutter_user: publicCutterUser
          })
        }),
        () => handleAdminRuntimeObservabilityRoutes({
          method: request.method ?? "",
          pathname: url.pathname,
          search_params: url.searchParams,
          request_now: requestNow,
          api_input: input,
          deps: createAdminRuntimeObservabilityRouteServerDeps({
            read_runtime_diagnostics_history_service: readAdminRuntimeDiagnosticsHistory
          })
        }),
        () => handleAdminProtectionReadRoutes({
          method: request.method ?? "",
          pathname: url.pathname,
          api_input: input,
          deps: createAdminProtectionReadRouteServerDeps({
            read_protection_status_service: protectionReadServices.read_protection_status,
            read_release_gates_service: protectionReadServices.read_release_gates,
            read_path_checks_service: protectionReadServices.read_path_checks
          })
        }),
        () => handleAdminReadModelRoutes({
          method: request.method ?? "GET",
          pathname: url.pathname,
          search_params: url.searchParams,
          request_now: requestNow,
          api_input: input,
          deps: readModelServerFacade.read_model_route_deps
        }),
        () => handleAdminSlowReadRoutes({
          method: request.method ?? "",
          pathname: url.pathname,
          search_params: url.searchParams,
          api_input: input,
          deps: createAdminSlowReadRouteServerDeps({
            read_dashboard_metrics: dashboardReadServices.read_dashboard_metrics,
            read_preprocess_jobs_with_runtime_meta: preprocessJobsReadServices.read_preprocess_jobs_with_runtime_meta,
            read_preprocess_supervisor_status: () => supervisor.status(),
            to_public_preprocess_supervisor_status: publicPreprocessSupervisorStatus,
            read_index_versions: listAdminIndexVersionsWithRuntimeMeta,
            record_runtime_diagnostic: readOnlyProbe ? undefined : runtimeDiagnosticsRecorder
          })
        }),
        () => handleAdminSourceVideoRoutes({
          method: request.method ?? "",
          pathname: url.pathname,
          search_params: url.searchParams,
          disable_store_repair: readOnlyProbe,
          api_input: input,
          deps: createAdminSourceVideoRouteServerDeps({
            read_source_video_list_service: readAdminSourceVideoListWithRuntimeMeta,
            project_public_source_video: toAdminSourceVideo,
            read_source_video_detail_service: getSourceVideoDetail,
            record_runtime_diagnostic: readOnlyProbe ? undefined : runtimeDiagnosticsRecorder
          })
        }),
        () => handleAdminPreprocessReadRoutes({
          method: request.method ?? "",
          pathname: url.pathname,
          search_params: url.searchParams,
          request_now: requestNow,
          api_input: input,
          deps: createAdminPreprocessReadRouteServerDeps({
            read_source_video_detail: getSourceVideoDetail,
            read_preprocess_job_log: readPreprocessJobLog,
            read_preprocess_supervisor_status: () => supervisor.status(),
            to_public_preprocess_supervisor_status: publicPreprocessSupervisorStatus,
            read_preprocess_safety: healthReadServices.read_preprocess_safety,
            read_library_manifest: readLibraryManifest,
            read_process_history_from_store: readAdminPreprocessProcessHistoryFromStore,
            read_process_history_readiness_from_store: readAdminPreprocessProcessHistoryReadinessFromStore
          })
        })
      ]);
      if (readRoute.handled) {
        writeJson(response, readRoute.status_code, readRoute.body);
        return;
      }

      const settingsCommandRoute = await handleAdminSettingsCommandRoutes({
        method: request.method ?? "",
        pathname: url.pathname,
        api_input: input,
        deps: createAdminSettingsCommandRouteServerDeps({
          command_now: requestNow,
          invalidated_at: now(),
          actor: requestActor,
          read_request_json() {
            return readRequestJson(request);
          },
          refresh_runtime_secrets: refreshRuntimeSecrets,
          read_library_manifest: readLibraryManifest,
          run_settings_config_service: runAdminSettingsConfigCommand,
          run_source_folder_add_service: runAdminSourceFolderAddCommand,
          run_source_folder_update_service: runAdminSourceFolderUpdateCommand,
          run_source_folder_remove_service: runAdminSourceFolderRemoveCommand
        })
      });
      if (settingsCommandRoute.handled) {
        writeJson(response, settingsCommandRoute.status_code, settingsCommandRoute.body);
        return;
      }

      const sourceVideoMediaRoute = await handleAdminSourceVideoMediaRoutes({
        method: request.method ?? "",
        pathname: url.pathname,
        api_input: input,
        response,
        deps: createAdminSourceVideoMediaRouteDeps({
          write_cover: writeCover
        })
      });
      if (sourceVideoMediaRoute.handled) {
        return;
      }

      const sourceVideoCommandRoute = await handleAdminSourceVideoCommandRoutes({
        method: request.method ?? "",
        pathname: url.pathname,
        api_input: input,
        deps: createAdminSourceVideoCommandRouteServerDeps({
          library_id: libraryId,
          library_name: libraryName,
          command_now: requestNow,
          actor: requestActor,
          now,
          media: readyPublishMedia,
          read_request_json: () => readRequestJson(request),
          run_cover_command: runAdminSourceVideoCoverCommand,
          run_metadata_command: runAdminSourceVideoMetadataCommand,
          run_transition_command: runAdminSourceVideoTransitionCommand,
          read_preprocess_supervisor_status: () => supervisor.status(),
          to_public_preprocess_supervisor_status: publicPreprocessSupervisorStatus,
          recover_processing_supervisor_block: adminRecoverProcessingSupervisorBlock,
          run_publish_command: runAdminSourceVideoPublishCommand,
          to_public_source_video: toAdminSourceVideo,
          clear_source_video_page_cache: clearAdminSourceVideoPageCache,
          clear_index_version_cache: clearAdminIndexVersionCache
        })
      });
      if (sourceVideoCommandRoute.handled) {
        writeJson(response, sourceVideoCommandRoute.status_code, sourceVideoCommandRoute.body);
        return;
      }

      const preprocessCommandRoute = await handleAdminPreprocessCommandRoutes({
        method: request.method ?? "",
        pathname: url.pathname,
        api_input: input,
        deps: createAdminPreprocessCommandRouteServerDeps({
          library_id: libraryId,
          library_name: libraryName,
          command_now: requestNow,
          actor: requestActor,
          now,
          read_request_json() {
            return readRequestJson(request);
          },
          read_admin_settings(libraryRoot) {
            return readAdminSettings(libraryRoot);
          },
          refresh_runtime_secrets: refreshRuntimeSecrets,
          preprocess_runner_available: Boolean(input.preprocess_runner),
          env,
          assert_real_preprocess_start_ready: assertRealPreprocessStartReady,
          read_preprocess_safety: healthReadServices.read_preprocess_safety,
          assert_preprocess_safe_to_start: assertPreprocessSafeToStart,
          start_preprocess_supervisor: (startInput) => supervisor.start(startInput),
          stop_preprocess_supervisor: () => supervisor.stop(),
          read_preprocess_supervisor_status: () => supervisor.status(),
          to_public_preprocess_supervisor_status: publicPreprocessSupervisorStatus,
          run_bulk_transition_command({
            library_root,
            library_id,
            library_name,
            command,
            command_now,
            actor,
            now: commandNow
          }) {
            return runAdminBulkTransitionCommand({
              library_root,
              library_id,
              library_name,
              command,
              command_now,
              actor,
              now: commandNow
            });
          },
          recover_processing_supervisor_block({ command, supervisor_state }) {
            return adminRecoverProcessingSupervisorBlock({
              command,
              supervisor_state
            });
          },
          clear_source_video_page_cache: clearAdminSourceVideoPageCache
        })
      });
      if (preprocessCommandRoute.handled) {
        writeJson(response, preprocessCommandRoute.status_code, preprocessCommandRoute.body);
        return;
      }

      const libraryCommandRoute = await handleAdminLibraryCommandRoutes({
        method: request.method ?? "",
        pathname: url.pathname,
        api_input: input,
        deps: createAdminLibraryCommandRouteServerDeps({
          library_id: libraryId,
          library_name: libraryName,
          command_now: requestNow,
          actor: requestActor,
          now,
          run_library_init_service: runAdminLibraryInitCommand,
          run_library_scan_apply_service: runAdminLibraryScanApplyCommand,
          run_library_scan_preview_service: runAdminLibraryScanPreviewCommand,
          schedule_read_model_reconcile_after_scan:
            readModelServerFacade.schedule_read_model_reconcile_after_scan,
          clear_source_video_page_cache: clearAdminSourceVideoPageCache
        })
      });
      if (libraryCommandRoute.handled) {
        writeJson(response, libraryCommandRoute.status_code, libraryCommandRoute.body);
        return;
      }

      const indexCommandRoute = await handleAdminIndexCommandRoutes({
        method: request.method ?? "",
        pathname: url.pathname,
        api_input: input,
        deps: createAdminIndexCommandRouteServerDeps({
          library_id: libraryId,
          command_now: requestNow,
          actor: requestActor,
          now,
          media: readyPublishMedia,
          read_request_json: () => readRequestJson(request),
          run_index_repair_service: runAdminIndexRepairCommand,
          clear_index_version_cache: clearAdminIndexVersionCache,
          clear_source_video_page_cache: clearAdminSourceVideoPageCache
        })
      });
      if (indexCommandRoute.handled) {
        writeJson(response, indexCommandRoute.status_code, indexCommandRoute.body);
        return;
      }

      const runtimeDiagnosticRoute = await handleAdminRuntimeDiagnosticRoutes({
        method: request.method ?? "",
        pathname: url.pathname,
        api_input: input,
        deps: createAdminRuntimeDiagnosticRouteServerDeps({
          env,
          diagnostic_now: now,
          refresh_runtime_secrets: refreshRuntimeSecrets,
          run_doctor_report: runMixlabDoctor,
          export_doctor_report: exportMixlabDoctorReport,
          read_dashscope_api_key(diagnosticEnv: NodeJS.ProcessEnv) {
            return diagnosticEnv.DASHSCOPE_API_KEY;
          }
        })
      });
      if (runtimeDiagnosticRoute.handled) {
        writeJson(response, runtimeDiagnosticRoute.status_code, runtimeDiagnosticRoute.body);
        return;
      }

      const cutterUserCommandRoute = await handleAdminCutterUserCommandRoutes({
        method: request.method ?? "",
        pathname: url.pathname,
        api_input: input,
        deps: createAdminCutterUserCommandRouteServerDeps({
          command_now: requestNow,
          actor: requestActor,
          read_request_json() {
            return readRequestJson(request);
          },
          run_approve_cutter_user_service: runAdminApproveCutterUserCommand,
          run_disable_cutter_user_service: runAdminDisableCutterUserCommand,
          run_reset_cutter_user_password_service: runAdminResetCutterUserPasswordCommand,
          project_approve_result: toAdminApproveCutterUserResponse,
          project_public_user: publicCutterUser
        })
      });
      if (cutterUserCommandRoute.handled) {
        writeJson(response, cutterUserCommandRoute.status_code, cutterUserCommandRoute.body);
        return;
      }

      const commandRestoreRoute = await handleAdminCommandRestoreRoutes({
        method: request.method ?? "",
        pathname: url.pathname,
        api_input: input,
        deps: createAdminCommandRestoreRouteServerDeps<
          CreateAdminApiServerInput,
          AdminCommandActor,
          LibraryManifest,
          typeof appendAdminOperationLogEvent,
          AdminCommandRestorePlan,
          AdminCommandSnapshotRestoreResult,
          ReturnType<typeof supervisor.status>,
          ReturnType<typeof publicPreprocessSupervisorStatus>
        >({
          restore_now: requestNow,
          plan_generated_at: now,
          invalidated_at: now,
          holder: "admin-api",
          actor: requestActor,
          resolve_snapshot_manifest_path({ library_root, snapshot_id }) {
            return resolveAdminCommandSnapshotManifestPath({
              library_root,
              snapshot_id
            });
          },
          plan_restore_command({ library_root, snapshot_manifest_path, generated_at }) {
            return planAdminCommandSnapshotRestore({
              library_root,
              snapshot_manifest_path,
              generated_at
            });
          },
          run_restore_command({
            library_root,
            snapshot_manifest_path,
            now: restoreNow,
            invalidated_at,
            holder,
            actor,
            read_library_manifest,
            append_operation_log_event
          }) {
            return restoreAdminCommandSnapshot({
              library_root,
              snapshot_manifest_path,
              now: restoreNow,
              invalidated_at,
              holder,
              actor,
              read_library_manifest,
              append_operation_log_event
            });
          },
          read_library_manifest(libraryRoot) {
            return readLibraryManifest(libraryRoot);
          },
          append_operation_log_event: appendAdminOperationLogEvent,
          read_preprocess_supervisor_status() {
            return supervisor.status();
          },
          to_public_preprocess_supervisor_status: publicPreprocessSupervisorStatus,
          restore_supervisor_block({ command, supervisor_state }) {
            return adminRecoverProcessingSupervisorBlock({
              command,
              supervisor_state
            });
          }
        })
      });
      if (commandRestoreRoute.handled) {
        writeJson(response, commandRestoreRoute.status_code, commandRestoreRoute.body);
        return;
      }

      writeJson(response, 404, apiError("not_found", "路由不存在"));
    } catch (error) {
      if (error instanceof AdminWriterLeaseError) {
        writeJson(response, 409, apiError(error.code, error.message, error.details));
        return;
      }

      if (error instanceof AdminReadyProtectionError) {
        writeJson(response, 409, apiError(error.code, error.message, {
          source_video_ids: error.source_video_ids
        }));
        return;
      }

      if (error instanceof AdminDockerMvpCommandBlockedError) {
        writeJson(response, 409, apiError(error.code, error.message, error.details));
        return;
      }

      writeJson(response, 500, apiError("internal_error", (error as Error).message));
    }
  });
}
