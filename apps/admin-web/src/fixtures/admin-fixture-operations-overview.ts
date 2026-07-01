import type {
  AdminDashboardMetrics,
  AdminCutterCompatibilityProofReadiness,
  AdminDataLoadingPlan,
  AdminDiskSpaceProtectionReadiness,
  AdminGateStatus,
  AdminLibraryStatus,
  AdminOperationsOverview,
  AdminProcessingRecoveryReadiness,
  AdminPreprocessJobsResponse,
  AdminPreprocessSafetyStatus,
  AdminReleaseGate,
  AdminSourceVideo,
  AdminUsageEventsRepairReadiness,
  AdminUsageEventStoreHealth,
  AdminVersionHealthParityReadiness,
  AdminWorkerEnvProofReadiness
} from "../api.ts";
import { cloneDataLoadingPlan } from "./admin-fixture-clone.ts";

export interface FixtureOperationsOverviewInput {
  status: AdminLibraryStatus;
  jobs: AdminPreprocessJobsResponse;
  sourceVideos: AdminSourceVideo[];
  metrics: AdminDashboardMetrics;
  dataLoadingPlan: AdminDataLoadingPlan;
}

export function fixtureOperationsOverview(input: FixtureOperationsOverviewInput): AdminOperationsOverview {
  const { dataLoadingPlan, jobs, metrics, sourceVideos, status } = input;
  const usageEventStore: AdminUsageEventStoreHealth = {
    line_count: metrics.usage.event_store.line_count,
    valid_line_count: metrics.usage.event_store.valid_line_count,
    malformed_line_count: metrics.usage.event_store.malformed_line_count,
    malformed_lines: [...metrics.usage.event_store.malformed_lines],
    warning: metrics.usage.event_store.warning
  };
  const usageEventsRepair: AdminUsageEventsRepairReadiness = {
    repair_required: usageEventStore.malformed_line_count > 0,
    status: usageEventStore.malformed_line_count > 0 ? "dry-run-required" : "clean",
    events_path: `${status.root_path}/.mixlab-library/usage-events/events.ndjson`,
    projection_path: `${status.root_path}/.mixlab-library/admin-read-model/usage-metrics.sqlite`,
    dry_run_command: `npx tsx scripts/acceptance/usage-events-repair.ts --library-root '${status.root_path}'`,
    apply_command: `npx tsx scripts/acceptance/usage-events-repair.ts --library-root '${status.root_path}' --apply`,
    artifacts_pattern: "docs/acceptance/artifacts/usage-events-repair-*.{json,md}",
    backup_directory: `${status.root_path}/.mixlab-library/usage-events/backups`,
    quarantine_directory: `${status.root_path}/.mixlab-library/usage-events/quarantine`,
    safe_scope: "usage-events-only",
    mutates_ready_assets: false,
    mutates_cutter_protocol: false,
    notes: usageEventStore.malformed_line_count > 0
      ? [
          "Dry-run is required before Docker upload and does not rewrite NAS data.",
          "Apply mode must be reviewed before rewriting usage-events.",
          "This repair does not touch ready artifacts or Cutter protocols."
        ]
      : [
          "No malformed usage-events rows were found.",
          "The repair tool remains available for future dry-run evidence."
        ]
  };
  const diskUsagePercent = status.disk_total_bytes > 0
    ? Math.round(((status.disk_total_bytes - status.disk_available_bytes) / status.disk_total_bytes) * 100)
    : 100;
  const diskBlocked = diskUsagePercent >= 92;
  const diskAttention = diskUsagePercent >= 87;
  const diskStatus = diskBlocked ? "blocked" : diskAttention ? "attention" : "healthy";
  const diskSpaceProtection: AdminDiskSpaceProtectionReadiness = {
    status: diskStatus,
    safe_to_preprocess: !diskBlocked,
    preprocess_write_blocked: diskBlocked,
    release_blocked: diskStatus !== "healthy",
    library_root: status.root_path,
    total_bytes: status.disk_total_bytes,
    available_bytes: status.disk_available_bytes,
    used_bytes: Math.max(0, status.disk_total_bytes - status.disk_available_bytes),
    usage_percent: diskUsagePercent,
    block_usage_percent: 92,
    attention_usage_percent: 87,
    last_error: "",
    threshold_env_var: "MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT",
    write_block_scope: "preprocess-and-docker-upload",
    preflight_endpoints: [
      "GET /api/admin/release-gates",
      "GET /api/admin/preprocess/safety",
      "GET /api/admin/library/status"
    ],
    starts_workers: false,
    mutates_ready_assets: false,
    mutates_cutter_protocol: false,
    notes: diskBlocked
      ? [
          "Disk usage is at or above the configured block threshold.",
          "This fixture contract does not mutate ready assets or Cutter protocols."
        ]
      : [
          "Disk usage is below the configured block threshold.",
          "Archive GET-only preflight evidence before Docker upload review."
      ]
  };
  const versionHealthParity: AdminVersionHealthParityReadiness = {
    status: "incomplete",
    metadata_complete: false,
    build_sha: "fixture",
    build_version: "fixture",
    image_tag: "",
    expected_services: ["admin-web", "admin-api", "admin-worker"],
    health_preflight_endpoints: [
      "GET /",
      "GET /health",
      "GET /api/admin/release-gates"
    ],
    live_probe_command: "npx tsx scripts/acceptance/admin-docker-release-live-readonly.ts",
    external_proof_required: [
      "docker compose ps admin-web admin-api admin-worker",
      "docker inspect admin-web/admin-api/admin-worker image tags and health state",
      "admin-worker env proof for standalone worker flags and /data/PublicLibrary roots",
      "rollback image tag recorded before any deploy rehearsal"
    ],
    static_compose_gate: "image-tag-static-parity",
    safe_scope: "version-health-only",
    starts_workers: false,
    mutates_ready_assets: false,
    mutates_cutter_protocol: false,
    notes: [
      "Fixture mode intentionally does not claim Docker image parity.",
      "Live Docker parity requires archived external container health and image evidence."
    ]
  };
  const adminWorkerEnvProof: AdminWorkerEnvProofReadiness = {
    proof_required: true,
    status: "external-proof-required",
    expected_service: "admin-worker",
    required_env_flags: {
      MIXLAB_ADMIN_DOCKER_MVP_MODE: "off",
      MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: "0",
      MIXLAB_ENABLE_READY_PUBLISH_WORKER: "0"
    },
    required_library_roots: {
      MIXLAB_ADMIN_LIBRARY_ROOT: "/data/PublicLibrary",
      MIXLAB_PREPROCESS_LIBRARY_ROOT: "/data/PublicLibrary"
    },
    env_file_name: "admin-worker.env",
    inspect_json_name: "admin-worker.inspect.json",
    env_file_variable: "MIXLAB_ADMIN_WORKER_ENV_FILE",
    inspect_json_variable: "MIXLAB_ADMIN_WORKER_INSPECT_JSON",
    proof_command: "npx tsx scripts/acceptance/admin-worker-env-proof.ts",
    collection_commands: [
      "docker compose --env-file .env -f docker-compose.yml exec admin-worker env | sort > admin-worker.env",
      "docker inspect $(docker compose --env-file .env -f docker-compose.yml ps -q admin-worker) > admin-worker.inspect.json",
      "MIXLAB_ADMIN_WORKER_ENV_FILE=<path>/admin-worker.env MIXLAB_ADMIN_WORKER_INSPECT_JSON=<path>/admin-worker.inspect.json npm run validate:admin-worker-env-proof"
    ],
    artifacts_pattern: "docs/acceptance/artifacts/admin-worker-env-proof-*.{json,md}",
    safe_scope: "admin-worker-env-only",
    starts_workers: false,
    records_secrets: false,
    mutates_ready_assets: false,
    mutates_cutter_protocol: false,
    notes: [
      "Fixture mode intentionally keeps admin-worker env proof as external evidence.",
      "The proof report records only worker flags, Docker roots, image, and container name."
    ]
  };
  const cutterCompatibilityProof: AdminCutterCompatibilityProofReadiness = {
    proof_required: true,
    status: "external-proof-required",
    expected_ready_count: 10471,
    expected_auth_mode: "reviewed",
    required_reports: {
      windows_acceptance_env_var: "MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT",
      real_cut_env_var: "MIXLAB_CUTTER_REAL_CUT_REPORT",
      optional_desktop_screenshot_env_var: "MIXLAB_CUTTER_DESKTOP_SCREENSHOT_REPORT",
      expected_ready_count_env_var: "MIXLAB_CUTTER_EXPECTED_READY_COUNT",
      expected_release_version_env_var: "MIXLAB_CUTTER_EXPECTED_RELEASE_VERSION"
    },
    required_evidence: [
      "Windows Runner windows_acceptance report with status=passed.",
      "Cutter runtime/auth evidence showing auth_mode=reviewed and local_trusted=false.",
      "Public library evidence showing at least 10471 ready videos are visible to Cutter.",
      "Source-library first page, public search, and transcript detail evidence.",
      "Windows Runner real_cut_smoke report with status=passed and a completed output clip."
    ],
    proof_command: "npx tsx scripts/acceptance/admin-cutter-compatibility-proof.ts",
    artifacts_pattern: "docs/acceptance/artifacts/admin-cutter-compatibility-proof-*.{json,md}",
    safe_scope: "cutter-compatibility-only",
    requires_staged_candidate: true,
    contacts_windows_runner: false,
    contacts_docker: false,
    starts_workers: false,
    mutates_ready_assets: false,
    mutates_cutter_protocol: false,
    notes: [
      "Fixture mode intentionally keeps Cutter compatibility proof as external evidence.",
      "The proof reads archived Windows Runner reports and does not change Cutter protocols."
    ]
  };
  const processingBlocked = status.processing_video_count > 0 && jobs.supervisor.state !== "running";
  const usageBlocked = usageEventStore.malformed_line_count > 0;
  const processingSourceVideoIds = sourceVideos
    .filter((video) => video.preprocess_status === "processing")
    .map((video) => video.source_video_id);
  const processingRecovery: AdminProcessingRecoveryReadiness = {
    recovery_required: processingBlocked,
    status: processingBlocked ? "preflight-required" : "clear",
    processing_count: status.processing_video_count,
    source_video_ids: processingSourceVideoIds,
    sample_truncated: status.processing_video_count > processingSourceVideoIds.length,
    preflight_endpoints: [
      "GET /api/admin/preprocess/safety",
      "GET /api/admin/source-videos?status=processing&limit=20",
      "GET /api/admin/preprocess/jobs?limit=20"
    ],
    bulk_recovery_endpoint: "POST /api/admin/preprocess/recover-processing",
    single_recovery_endpoints: processingSourceVideoIds.map((sourceVideoId) =>
      `POST /api/admin/source-videos/${sourceVideoId}/recover-processing`
    ),
    supervisor_must_be_idle: true,
    safe_scope: "processing-to-queued-only",
    mutates_ready_assets: false,
    mutates_cutter_protocol: false,
    notes: processingBlocked
      ? [
          "Run GET preflight endpoints before recovery.",
          "Recovery requires idle supervisor and remains a reviewed maintenance action.",
          "Recovery only moves processing rows back to queued."
        ]
      : [
          "No processing rows require recovery."
        ]
  };
  const gates: AdminReleaseGate[] = [
    {
      code: "runtime-path-profile",
      status: "attention",
      message: "Fixture 使用本机路径；Docker 发布前需要确认 /data/PublicLibrary 映射。",
      details: { library_root: status.root_path }
    },
    {
      code: "build-version-health",
      status: "attention",
      message: "Fixture 缺少正式镜像版本信息。",
      details: {
        sha: "fixture",
        version: "fixture",
        image_tag: "",
        version_health_parity: versionHealthParity
      }
    },
    {
      code: "admin-worker-env-proof",
      status: "attention",
      message: "Fixture 不能证明运行中 admin-worker 环境，需要外部 env/inspect 证据。",
      details: {
        env_proof_readiness: adminWorkerEnvProof
      }
    },
    {
      code: "cutter-compatibility-proof",
      status: "attention",
      message: "Fixture 不能证明 Windows Cutter 兼容性，需要外部 acceptance/real-cut 证据。",
      details: {
        cutter_proof_readiness: cutterCompatibilityProof
      }
    },
    {
      code: "preprocess-disk",
      status: diskBlocked ? "blocked" : diskAttention ? "attention" : "pass",
      message: diskBlocked
        ? "公共素材库磁盘空间不足。"
        : diskAttention
          ? "公共素材库磁盘空间接近门禁。"
          : "公共素材库磁盘空间通过门禁。",
      details: {
        usage_percent: diskUsagePercent,
        block_usage_percent: 92,
        disk_space_protection: diskSpaceProtection
      }
    },
    {
      code: "processing-recovery",
      status: processingBlocked ? "blocked" : "pass",
      message: processingBlocked
        ? "存在 processing 任务，需要先只读预检并恢复到队列。"
        : "没有需要恢复的 processing 任务。",
      details: {
        processing_count: status.processing_video_count,
        recovery_readiness: processingRecovery
      }
    },
    {
      code: "usage-events-tolerance",
      status: usageBlocked ? "blocked" : "pass",
      message: usageBlocked
        ? "usage-events 存在格式错误，Docker 发布前需要 dry-run 和修复归档。"
        : "usage-events 可正常读取，修复工具处于待命状态。",
      details: {
        ...usageEventStore,
        repair_readiness: usageEventsRepair
      }
    },
    {
      code: "current-index",
      status: status.current_index_version ? "pass" : "blocked",
      message: status.current_index_version ? "当前索引指针通过基础门禁。" : "缺少当前索引。",
      details: { current_index_version: status.current_index_version }
    },
    {
      code: "scan-protection",
      status: "pass",
      message: "扫描 apply 已接入保护模式。",
      details: { scan_preview_endpoint: "/api/admin/library/scan-preview" }
    }
  ];
  const blockedGateCount = gates.filter((gate) => gate.status === "blocked").length;
  const attentionGateCount = gates.filter((gate) => gate.status === "attention").length;
  const overallStatus: AdminGateStatus = blockedGateCount > 0
    ? "blocked"
    : attentionGateCount > 0
      ? "attention"
      : "pass";
  const safety: AdminPreprocessSafetyStatus = {
    checked_at: "2024-05-07T10:00:00.000Z",
    safe_to_start: !diskBlocked && !processingBlocked,
    status: diskBlocked || processingBlocked ? "blocked" : "healthy",
    disk: {
      total_bytes: status.disk_total_bytes,
      available_bytes: status.disk_available_bytes,
      used_bytes: Math.max(0, status.disk_total_bytes - status.disk_available_bytes),
      usage_percent: diskUsagePercent,
      block_usage_percent: 92,
      status: diskBlocked ? "blocked" : "healthy",
      last_error: ""
    },
    processing: {
      checked: true,
      processing_count: status.processing_video_count,
      source_video_ids: processingSourceVideoIds
    },
    blockers: [
      ...(diskBlocked
        ? [{ code: "disk-space-blocked", message: "公共素材库磁盘空间不足。", source_video_ids: [] }]
        : []),
      ...(processingBlocked
        ? [{
            code: "processing-needs-recovery",
            message: "存在处理中任务需要先恢复。",
            source_video_ids: processingSourceVideoIds
          }]
        : [])
    ]
  };

  return {
    schema_version: "1.0",
    generated_at: "2024-05-07T10:00:00.000Z",
    title: "管理端运行保护中心",
    summary: {
      overall_status: overallStatus,
      release_allowed: overallStatus === "pass",
      blocked_gate_count: blockedGateCount,
      attention_gate_count: attentionGateCount,
      ready_video_count: status.ready_video_count,
      queued_video_count: status.queued_video_count,
      processing_video_count: status.processing_video_count,
      index_required_video_count: status.index_required_video_count,
      current_index_version: status.current_index_version
    },
    next_actions: gates
      .filter((gate) => gate.status === "blocked" || gate.status === "attention")
      .map((gate) => ({
        key: gate.code,
        label: gate.message,
        detail: "请查看对应门禁详情并处理后重新验证。",
        route: "protection"
      })),
    protection: {
      checked_at: "2024-05-07T10:00:00.000Z",
      mode: "preprocess-protection-v1",
      ready_video_count: status.ready_video_count,
      processing_video_count: status.processing_video_count,
      queued_video_count: status.queued_video_count,
      index_required_video_count: status.index_required_video_count,
      current_index_version: status.current_index_version,
      scan_apply_requires_preview: true,
      ready_asset_policy: {
        immutable_status: "ready",
        allowed_ready_mutations: ["metadata", "cover", "ready -> ready"],
        blocked_ready_mutations: ["ready -> queued", "ready -> processing", "scan apply removing ready manifest"]
      },
      scan_preview_endpoint: "/api/admin/library/scan-preview",
      release_gates_endpoint: "/api/admin/release-gates"
    },
    release: {
      checked_at: "2024-05-07T10:00:00.000Z",
      overall_status: overallStatus,
      release_allowed: overallStatus === "pass",
      gates,
      build: { sha: "fixture", version: "fixture", image_tag: "" },
      runtime: { library_root: status.root_path, path_profile: "local" },
      safety,
      usage_event_store: usageEventStore,
      usage_events_repair: usageEventsRepair,
      processing_recovery: processingRecovery,
      disk_space_protection: diskSpaceProtection,
      version_health_parity: versionHealthParity,
      admin_worker_env_proof: adminWorkerEnvProof,
      cutter_compatibility_proof: cutterCompatibilityProof
    },
    read_model: {
      schema_version: "1.0",
      generated_at: "2024-05-07T10:00:00.000Z",
      admin_read_model: {
        schema_version: "1.0",
        storage: "sqlite",
        path: "/fixture/.mixlab-library/admin-read-model/admin.sqlite",
        freshness: "fresh",
        exists: true,
        generated_at: "2024-05-07T10:00:00.000Z",
        library_updated_at: status.updated_at,
        current_library_updated_at: status.updated_at,
        video_count: status.video_count,
        current_video_count: status.video_count,
        counts_by_status: {
          ready: status.ready_video_count,
          processing: status.processing_video_count,
          queued: status.queued_video_count,
          unprocessed: status.unprocessed_video_count,
          failed: status.failed_video_count,
          "index-required": status.index_required_video_count
        },
        invalidated_at: "",
        invalidation_reason: "",
        last_error: "",
        reconciliation: {
          store_path: "/fixture/.mixlab-library/admin-read-model/admin.sqlite",
          action: "none",
          reason: "fresh",
          scan_mode: "no-scan",
          requires_background_reconcile: false,
          safe_for_page_request: true
        }
      },
      source_video_status: {
        name: "source-video-status-read-model-v1",
        storage: "persistent-json",
        path: "/fixture/.mixlab-library/admin/read-models/source-video-status-read-model-v1.json",
        freshness: "fresh",
        memory_cache: "fresh",
        persisted: "fresh",
        generated_at: "2024-05-07T10:00:00.000Z",
        library_updated_at: status.updated_at,
        current_library_updated_at: status.updated_at,
        video_count: status.video_count,
        current_video_count: status.video_count,
        counts_by_status: {
          ready: status.ready_video_count,
          processing: status.processing_video_count,
          queued: status.queued_video_count,
          unprocessed: status.unprocessed_video_count,
          failed: status.failed_video_count,
          "index-required": status.index_required_video_count
        },
        cache_ttl_ms: 30_000
      }
    },
    data_loading: cloneDataLoadingPlan(dataLoadingPlan)
  };
}
