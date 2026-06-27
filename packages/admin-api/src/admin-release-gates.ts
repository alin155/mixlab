import {
  DEFAULT_PREPROCESS_DISK_BLOCK_USAGE_PERCENT,
  usageMetricsSummaryProjectionPath,
  type PreprocessSafetyStatus,
  type UsageMetrics
} from "../../library-fs/src/index.ts";
import path from "node:path";
import type { LibraryCounts } from "../../protocol/src/index.ts";

export type AdminGateStatus = "pass" | "attention" | "blocked";
export type AdminRuntimePathProfile = "docker" | "mac-smb" | "local";

export interface AdminBuildInfo {
  sha: string;
  version: string;
  image_tag: string;
}

export interface AdminRuntimeInfo {
  library_root: string;
  source_videos_path: string;
  path_profile: AdminRuntimePathProfile;
}

export interface AdminReleaseGate {
  code: string;
  status: AdminGateStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface AdminUsageEventsRepairReadiness {
  repair_required: boolean;
  status: "clean" | "dry-run-required";
  events_path: string;
  projection_path: string;
  dry_run_command: string;
  apply_command: string;
  artifacts_pattern: string;
  backup_directory: string;
  quarantine_directory: string;
  safe_scope: "usage-events-only";
  mutates_ready_assets: false;
  mutates_cutter_protocol: false;
  notes: string[];
}

export interface AdminProcessingRecoveryReadiness {
  recovery_required: boolean;
  status: "clear" | "preflight-required";
  processing_count: number;
  source_video_ids: string[];
  sample_truncated: boolean;
  preflight_endpoints: string[];
  bulk_recovery_endpoint: string;
  single_recovery_endpoints: string[];
  supervisor_must_be_idle: true;
  safe_scope: "processing-to-queued-only";
  mutates_ready_assets: false;
  mutates_cutter_protocol: false;
  notes: string[];
}

export interface AdminDiskSpaceProtectionReadiness {
  status: PreprocessSafetyStatus["disk"]["status"];
  safe_to_preprocess: boolean;
  preprocess_write_blocked: boolean;
  release_blocked: boolean;
  library_root: string;
  total_bytes: number;
  available_bytes: number;
  used_bytes: number;
  usage_percent: number;
  block_usage_percent: number;
  attention_usage_percent: number;
  last_error: string;
  threshold_env_var: "MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT";
  write_block_scope: "preprocess-and-docker-upload";
  preflight_endpoints: string[];
  starts_workers: false;
  mutates_ready_assets: false;
  mutates_cutter_protocol: false;
  notes: string[];
}

export interface AdminVersionHealthParityReadiness {
  status: "ready" | "incomplete";
  metadata_complete: boolean;
  build_sha: string;
  build_version: string;
  image_tag: string;
  expected_services: Array<"admin-web" | "admin-api" | "admin-worker">;
  health_preflight_endpoints: string[];
  live_probe_command: string;
  external_proof_required: string[];
  static_compose_gate: "image-tag-static-parity";
  safe_scope: "version-health-only";
  starts_workers: false;
  mutates_ready_assets: false;
  mutates_cutter_protocol: false;
  notes: string[];
}

export interface AdminWorkerEnvProofReadiness {
  proof_required: true;
  status: "external-proof-required";
  expected_service: "admin-worker";
  required_env_flags: {
    MIXLAB_ADMIN_DOCKER_MVP_MODE: "v0.1";
    MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: "0";
    MIXLAB_ENABLE_READY_PUBLISH_WORKER: "0";
  };
  required_library_roots: {
    MIXLAB_ADMIN_LIBRARY_ROOT: "/data/PublicLibrary";
    MIXLAB_PREPROCESS_LIBRARY_ROOT: "/data/PublicLibrary";
  };
  env_file_name: "admin-worker.env";
  inspect_json_name: "admin-worker.inspect.json";
  env_file_variable: "MIXLAB_ADMIN_WORKER_ENV_FILE";
  inspect_json_variable: "MIXLAB_ADMIN_WORKER_INSPECT_JSON";
  proof_command: "npx tsx scripts/acceptance/admin-worker-env-proof.ts";
  collection_commands: string[];
  artifacts_pattern: "docs/acceptance/artifacts/admin-worker-env-proof-*.{json,md}";
  safe_scope: "admin-worker-env-only";
  starts_workers: false;
  records_secrets: false;
  mutates_ready_assets: false;
  mutates_cutter_protocol: false;
  notes: string[];
}

export interface AdminCutterCompatibilityProofReadiness {
  proof_required: true;
  status: "external-proof-required";
  expected_ready_count: number;
  expected_auth_mode: "reviewed";
  required_reports: {
    windows_acceptance_env_var: "MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT";
    real_cut_env_var: "MIXLAB_CUTTER_REAL_CUT_REPORT";
    optional_desktop_screenshot_env_var: "MIXLAB_CUTTER_DESKTOP_SCREENSHOT_REPORT";
    expected_ready_count_env_var: "MIXLAB_CUTTER_EXPECTED_READY_COUNT";
    expected_release_version_env_var: "MIXLAB_CUTTER_EXPECTED_RELEASE_VERSION";
  };
  required_evidence: string[];
  proof_command: "npx tsx scripts/acceptance/admin-cutter-compatibility-proof.ts";
  artifacts_pattern: "docs/acceptance/artifacts/admin-cutter-compatibility-proof-*.{json,md}";
  safe_scope: "cutter-compatibility-only";
  requires_staged_candidate: true;
  contacts_windows_runner: false;
  contacts_docker: false;
  starts_workers: false;
  mutates_ready_assets: false;
  mutates_cutter_protocol: false;
  notes: string[];
}

export interface AdminReleaseGatesStatus {
  checked_at: string;
  overall_status: AdminGateStatus;
  release_allowed: boolean;
  gates: AdminReleaseGate[];
  build: AdminBuildInfo;
  runtime: AdminRuntimeInfo;
  safety: PreprocessSafetyStatus;
  usage_event_store: UsageMetrics["event_store"];
  usage_events_repair: AdminUsageEventsRepairReadiness;
  processing_recovery: AdminProcessingRecoveryReadiness;
  disk_space_protection: AdminDiskSpaceProtectionReadiness;
  version_health_parity: AdminVersionHealthParityReadiness;
  admin_worker_env_proof: AdminWorkerEnvProofReadiness;
  cutter_compatibility_proof: AdminCutterCompatibilityProofReadiness;
}

function optionalEnv(env: NodeJS.ProcessEnv, key: string): string {
  return typeof env[key] === "string" ? env[key]!.trim() : "";
}

export function preprocessDiskBlockUsagePercent(env: NodeJS.ProcessEnv): number {
  const raw = optionalEnv(env, "MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT");
  if (!raw) {
    return DEFAULT_PREPROCESS_DISK_BLOCK_USAGE_PERCENT;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed)
    ? parsed
    : DEFAULT_PREPROCESS_DISK_BLOCK_USAGE_PERCENT;
}

export function buildInfo(env: NodeJS.ProcessEnv): AdminBuildInfo {
  return {
    sha: optionalEnv(env, "MIXLAB_BUILD_SHA") || optionalEnv(env, "GITHUB_SHA") || "local",
    version: optionalEnv(env, "MIXLAB_BUILD_VERSION") || optionalEnv(env, "npm_package_version") || "local",
    image_tag: optionalEnv(env, "MIXLAB_IMAGE_TAG")
  };
}

export function pathProfile(libraryRoot: string): AdminRuntimePathProfile {
  if (libraryRoot.startsWith("/data/")) {
    return "docker";
  }

  if (libraryRoot.startsWith("/Volumes/")) {
    return "mac-smb";
  }

  return "local";
}

function worstGateStatus(statuses: AdminGateStatus[]): AdminGateStatus {
  if (statuses.includes("blocked")) {
    return "blocked";
  }

  if (statuses.includes("attention")) {
    return "attention";
  }

  return "pass";
}

function safetyLevelToGateStatus(status: PreprocessSafetyStatus["status"]): AdminGateStatus {
  return status === "blocked" ? "blocked" : status === "attention" ? "attention" : "pass";
}

function usageEventsPath(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "usage-events", "events.ndjson");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function buildUsageEventsRepairReadiness(input: {
  library_root: string;
  usage: UsageMetrics;
}): AdminUsageEventsRepairReadiness {
  const eventsPath = usageEventsPath(input.library_root);
  const usageEventsDir = path.dirname(eventsPath);
  const repairRequired = input.usage.event_store.malformed_line_count > 0;
  const libraryRootArg = shellQuote(input.library_root);

  return {
    repair_required: repairRequired,
    status: repairRequired ? "dry-run-required" : "clean",
    events_path: eventsPath,
    projection_path: usageMetricsSummaryProjectionPath(input.library_root),
    dry_run_command: `npx tsx scripts/acceptance/usage-events-repair.ts --library-root ${libraryRootArg}`,
    apply_command: `npx tsx scripts/acceptance/usage-events-repair.ts --library-root ${libraryRootArg} --apply`,
    artifacts_pattern: "docs/acceptance/artifacts/usage-events-repair-*.{json,md}",
    backup_directory: path.join(usageEventsDir, "backups"),
    quarantine_directory: path.join(usageEventsDir, "quarantine"),
    safe_scope: "usage-events-only",
    mutates_ready_assets: false,
    mutates_cutter_protocol: false,
    notes: repairRequired
      ? [
          "Dry-run is required before Docker upload and does not rewrite NAS data.",
          "Apply mode must be a reviewed maintenance action; it creates a backup and quarantines malformed rows.",
          "This repair affects usage analytics history only, not source-video manifests, ready artifacts, release indexes, or Cutter read protocols."
        ]
      : [
          "No malformed usage-events rows were found.",
          "The repair tool remains available for future dry-run evidence without changing NAS data.",
          "The usage metrics projection is derived and rebuildable; source-video manifests and Cutter protocols remain the facts for assets."
        ]
  };
}

export function buildProcessingRecoveryReadiness(input: {
  safety: PreprocessSafetyStatus;
}): AdminProcessingRecoveryReadiness {
  const recoveryRequired = input.safety.processing.checked &&
    input.safety.processing.processing_count > 0;
  const sourceVideoIds = [...input.safety.processing.source_video_ids];

  return {
    recovery_required: recoveryRequired,
    status: recoveryRequired ? "preflight-required" : "clear",
    processing_count: input.safety.processing.processing_count,
    source_video_ids: sourceVideoIds,
    sample_truncated: input.safety.processing.processing_count > sourceVideoIds.length,
    preflight_endpoints: [
      "GET /api/admin/preprocess/safety",
      "GET /api/admin/source-videos?status=processing&limit=20",
      "GET /api/admin/preprocess/jobs?limit=20"
    ],
    bulk_recovery_endpoint: "POST /api/admin/preprocess/recover-processing",
    single_recovery_endpoints: sourceVideoIds.map((sourceVideoId) =>
      `POST /api/admin/source-videos/${sourceVideoId}/recover-processing`
    ),
    supervisor_must_be_idle: true,
    safe_scope: "processing-to-queued-only",
    mutates_ready_assets: false,
    mutates_cutter_protocol: false,
    notes: recoveryRequired
      ? [
          "Run the listed GET preflight endpoints before any recovery command.",
          "Recovery is a separately reviewed maintenance action and requires the preprocess supervisor to be idle.",
          "The recovery command moves stuck processing rows back to queued; it must not mutate ready assets, release indexes, or Cutter protocols."
        ]
      : [
          "No processing rows currently require recovery.",
          "The recovery command remains available as a separately reviewed maintenance action if processing rows appear later."
        ]
  };
}

export function buildDiskSpaceProtectionReadiness(input: {
  library_root: string;
  safety: PreprocessSafetyStatus;
}): AdminDiskSpaceProtectionReadiness {
  const disk = input.safety.disk;
  const blockedByDisk = disk.status === "blocked";
  const releaseBlocked = disk.status !== "healthy";
  const attentionUsagePercent = Math.max(1, disk.block_usage_percent - 5);
  const notes = disk.last_error
    ? [
        "The library root must be readable before Docker upload or preprocessing can be reviewed.",
        "This contract is read-only and does not start workers or mutate NAS data.",
        "Ready assets, release indexes, and Cutter protocols are outside the disk-space protection write scope."
      ]
    : blockedByDisk
      ? [
          "Disk usage is at or above the configured block threshold; new preprocessing writes and Docker upload review remain blocked.",
          "Free or expand NAS storage, then rerun GET-only release-gate evidence before any deploy decision.",
          "This protection does not mutate ready assets, source-video manifests, release indexes, or Cutter protocols."
        ]
      : disk.status === "attention"
        ? [
            "Disk usage is close to the configured block threshold; Docker upload review remains blocked until capacity is reviewed.",
            "Preprocessing can only continue while the disk gate stays below the block threshold.",
            "This protection records preflight evidence without starting workers or changing Cutter-facing data."
          ]
        : [
            "Disk usage is below the attention and block thresholds.",
            "The same GET-only preflight endpoints should be archived before Docker upload review.",
            "This protection does not mutate ready assets, source-video manifests, release indexes, or Cutter protocols."
          ];

  return {
    status: disk.status,
    safe_to_preprocess: !blockedByDisk,
    preprocess_write_blocked: blockedByDisk,
    release_blocked: releaseBlocked,
    library_root: input.library_root,
    total_bytes: disk.total_bytes,
    available_bytes: disk.available_bytes,
    used_bytes: disk.used_bytes,
    usage_percent: disk.usage_percent,
    block_usage_percent: disk.block_usage_percent,
    attention_usage_percent: attentionUsagePercent,
    last_error: disk.last_error,
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
    notes
  };
}

export function buildVersionHealthParityReadiness(input: {
  build: AdminBuildInfo;
}): AdminVersionHealthParityReadiness {
  const metadataComplete = input.build.sha !== "local" &&
    input.build.version !== "local" &&
    Boolean(input.build.image_tag);

  return {
    status: metadataComplete ? "ready" : "incomplete",
    metadata_complete: metadataComplete,
    build_sha: input.build.sha,
    build_version: input.build.version,
    image_tag: input.build.image_tag,
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
    notes: metadataComplete
      ? [
          "The Admin API exposes build sha, build version, and image tag metadata.",
          "Live Docker parity still requires external admin-web/admin-api/admin-worker image and health proof before upload review.",
          "This contract is read-only and does not start containers, enable workers, mutate NAS data, or change Cutter protocols."
        ]
      : [
          "Build sha, build version, or image tag metadata is incomplete.",
          "Docker upload review requires matching admin-web/admin-api/admin-worker image and health evidence from the NAS host.",
          "Do not treat a local build or a reachable Admin Web page as live Docker version parity."
        ]
  };
}

export function buildAdminWorkerEnvProofReadiness(): AdminWorkerEnvProofReadiness {
  return {
    proof_required: true,
    status: "external-proof-required",
    expected_service: "admin-worker",
    required_env_flags: {
      MIXLAB_ADMIN_DOCKER_MVP_MODE: "v0.1",
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
      "Admin API GET endpoints cannot prove the running admin-worker container environment.",
      "Export env and docker inspect evidence on the NAS host, then run the proof command locally without pasting secrets into reports or chat.",
      "The proof only validates disabled standalone worker flags and Docker /data/PublicLibrary roots; it does not start workers, deploy Docker, mutate ready assets, or change Cutter protocols."
    ]
  };
}

export function buildCutterCompatibilityProofReadiness(input: {
  ready_video_count: number;
}): AdminCutterCompatibilityProofReadiness {
  const expectedReadyCount = Math.max(10471, input.ready_video_count);

  return {
    proof_required: true,
    status: "external-proof-required",
    expected_ready_count: expectedReadyCount,
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
      `Public library evidence showing at least ${expectedReadyCount} ready videos are visible to Cutter.`,
      "Source-library first page, public search, and transcript detail evidence.",
      "Windows Runner real_cut_smoke report with status=passed, run-next done, output file produced, and resolve_source/cut_media phases done."
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
      "Admin API GET endpoints cannot prove Windows Cutter compatibility after a Docker release candidate.",
      "Run Windows acceptance and real cut smoke only after a separately gated staged candidate exists; this contract only describes the archived evidence required.",
      "The proof reads archived reports and must not mutate NAS data, ready assets, release indexes, or Cutter protocols."
    ]
  };
}

export function buildAdminReleaseGates(input: {
  checked_at: string;
  build: AdminBuildInfo;
  runtime: AdminRuntimeInfo;
  library: Pick<LibraryCounts, "ready_video_count" | "index_required_video_count"> & {
    current_index_version: string;
  };
  safety: PreprocessSafetyStatus;
  usage: UsageMetrics;
}): AdminReleaseGatesStatus {
  const gates: AdminReleaseGate[] = [];
  const usageEventsRepair = buildUsageEventsRepairReadiness({
    library_root: input.runtime.library_root,
    usage: input.usage
  });
  const processingRecovery = buildProcessingRecoveryReadiness({
    safety: input.safety
  });
  const diskSpaceProtection = buildDiskSpaceProtectionReadiness({
    library_root: input.runtime.library_root,
    safety: input.safety
  });
  const versionHealthParity = buildVersionHealthParityReadiness({
    build: input.build
  });
  const adminWorkerEnvProof = buildAdminWorkerEnvProofReadiness();
  const cutterCompatibilityProof = buildCutterCompatibilityProofReadiness({
    ready_video_count: input.library.ready_video_count
  });

  gates.push({
    code: "runtime-path-profile",
    status: input.runtime.path_profile === "local" ? "attention" : "pass",
    message: input.runtime.path_profile === "docker"
      ? "Docker 公共素材库路径使用 /data 配置。"
      : input.runtime.path_profile === "mac-smb"
        ? "Mac 本机公共素材库路径使用 /Volumes SMB 挂载。"
        : "当前是本机 local 路径；Docker 上传前必须确认容器内映射为 /data/PublicLibrary。",
    details: input.runtime as unknown as Record<string, unknown>
  });

  gates.push({
    code: "build-version-health",
    status: input.build.sha === "local" || input.build.version === "local" || !input.build.image_tag
      ? "attention"
      : "pass",
    message: input.build.sha === "local" || input.build.version === "local"
      ? "当前构建缺少正式版本信息；Docker 发布前需要镜像 tag、commit sha 和版本号。"
      : input.build.image_tag
        ? "构建版本信息完整。"
        : "缺少 Docker 镜像 tag，发布前需要补齐。",
    details: {
      ...input.build,
      version_health_parity: versionHealthParity
    }
  });

  gates.push({
    code: "admin-worker-env-proof",
    status: "attention",
    message: "Docker 发布前需要外部 admin-worker env/inspect 证明，确认独立 worker 默认关闭且容器路径为 /data/PublicLibrary。",
    details: {
      env_proof_readiness: adminWorkerEnvProof
    }
  });

  gates.push({
    code: "cutter-compatibility-proof",
    status: "attention",
    message: "Docker 发布前需要外部 Cutter 兼容性证明，确认 Windows Cutter 仍可读取 release/index/search 并完成真实剪切。",
    details: {
      cutter_proof_readiness: cutterCompatibilityProof
    }
  });

  gates.push({
    code: "preprocess-disk",
    status: safetyLevelToGateStatus(input.safety.disk.status),
    message: input.safety.disk.status === "blocked"
      ? "公共素材库磁盘空间不足，禁止继续预处理或 Docker 发布。"
      : input.safety.disk.status === "attention"
        ? "公共素材库磁盘空间接近门禁，发布前需要关注。"
        : "公共素材库磁盘空间通过门禁。",
    details: {
      ...input.safety.disk,
      disk_space_protection: diskSpaceProtection
    }
  });

  gates.push({
    code: "processing-recovery",
    status: input.safety.processing.checked && input.safety.processing.processing_count > 0 ? "blocked" : "pass",
    message: input.safety.processing.checked && input.safety.processing.processing_count > 0
      ? `存在 ${input.safety.processing.processing_count} 个 processing 任务；Docker 发布前必须先完成只读预检并恢复到队列。`
      : "没有需要恢复的 processing 任务。",
    details: {
      ...input.safety.processing,
      recovery_readiness: processingRecovery
    }
  });

  gates.push({
    code: "usage-events-tolerance",
    status: input.usage.event_store.malformed_line_count > 0 ? "blocked" : "pass",
    message: input.usage.event_store.malformed_line_count > 0
      ? `usage-events 有 ${input.usage.event_store.malformed_line_count} 行格式错误；Docker 发布前必须先运行 dry-run 并在确认后修复或归档。`
      : "usage-events 可正常读取，修复工具处于待命状态。",
    details: {
      ...input.usage.event_store,
      repair_readiness: usageEventsRepair
    }
  });

  gates.push({
    code: "current-index",
    status: input.library.ready_video_count > 0 && !input.library.current_index_version ? "blocked" : "pass",
    message: input.library.ready_video_count > 0 && !input.library.current_index_version
      ? "已有 ready 视频但没有 current index，剪辑端发布索引不完整。"
      : "当前索引指针通过基础门禁。",
    details: {
      ready_video_count: input.library.ready_video_count,
      index_required_video_count: input.library.index_required_video_count,
      current_index_version: input.library.current_index_version
    }
  });

  gates.push({
    code: "scan-protection",
    status: "pass",
    message: "扫描 apply 已接入 scan-preview 和 ready manifest 删除阻断。",
    details: {
      scan_preview_endpoint: "/api/admin/library/scan-preview",
      scan_apply_endpoint: "/api/admin/library/scan"
    }
  });

  const overallStatus = worstGateStatus(gates.map((gate) => gate.status));

  return {
    checked_at: input.checked_at,
    overall_status: overallStatus,
    release_allowed: overallStatus === "pass",
    gates,
    build: input.build,
    runtime: input.runtime,
    safety: input.safety,
    usage_event_store: input.usage.event_store,
    usage_events_repair: usageEventsRepair,
    processing_recovery: processingRecovery,
    disk_space_protection: diskSpaceProtection,
    version_health_parity: versionHealthParity,
    admin_worker_env_proof: adminWorkerEnvProof,
    cutter_compatibility_proof: cutterCompatibilityProof
  };
}

export function adminOperationActionForGate(gate: AdminReleaseGate): {
  key: string;
  label: string;
  detail: string;
  route: string;
} {
  const labels: Record<string, { label: string; detail: string; route: string }> = {
    "preprocess-disk": {
      label: "释放或扩容 NAS 存储空间",
      detail: "先读取 release-gates、preprocess safety 和 library status；磁盘门禁阻塞时不允许继续预处理或上传 Docker 管理端。",
      route: "protection"
    },
    "processing-recovery": {
      label: "恢复卡住的预处理任务",
      detail: "先读取 safety、processing 列表和预处理队列；确认 supervisor idle 后再执行恢复命令。",
      route: "preprocess-jobs"
    },
    "usage-events-tolerance": {
      label: "修复或归档 usage-events 坏行",
      detail: "先运行 usage-events repair dry-run 归档证据；确认后再用 apply 备份并隔离坏行。",
      route: "protection"
    },
    "current-index": {
      label: "修复当前剪辑端索引",
      detail: "已有 ready 视频但 current index 不完整时，剪辑端搜索不可作为发布依据。",
      route: "preprocess-jobs"
    },
    "build-version-health": {
      label: "补齐正式镜像版本信息",
      detail: "Docker 发布前需要镜像 tag、commit sha、版本号，以及 admin-web/admin-api/admin-worker 的 live health/version 证明。",
      route: "protection"
    },
    "admin-worker-env-proof": {
      label: "采集 admin-worker 环境证明",
      detail: "导出 admin-worker.env 和 admin-worker.inspect.json，确认独立 worker flag 为 0、路径为 /data/PublicLibrary，且报告不记录密钥。",
      route: "protection"
    },
    "cutter-compatibility-proof": {
      label: "采集 Cutter 兼容性证明",
      detail: "在独立 staged candidate 后归档 Windows acceptance 和 real_cut_smoke，确认 reviewed 登录、10471+ ready、搜索/文稿/真实剪切仍可用。",
      route: "protection"
    },
    "runtime-path-profile": {
      label: "确认本机和 Docker 路径隔离",
      detail: "本机应使用 /Volumes，Docker 应使用 /data/PublicLibrary。",
      route: "settings"
    }
  };
  const mapped = labels[gate.code] ?? {
    label: gate.message,
    detail: "请查看发布门禁详情。",
    route: "protection"
  };

  return {
    key: gate.code,
    ...mapped
  };
}
