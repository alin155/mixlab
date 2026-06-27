import type {
  AdminCommandMutationTarget,
  AdminCommandName
} from "./admin-command-guard.ts";
import type { AdminScanMode } from "./admin-scan-modes.ts";

export type AdminWorkerWritePathOwner =
  | "admin-supervisor-pipeline"
  | "standalone-preprocess-worker"
  | "standalone-ready-publish-worker"
  | "docker-worker-loop"
  | "library-fs-lifecycle";

export type AdminWorkerWriterLeaseCoverage = "full" | "partial" | "none";

export type AdminWorkerAuditSurface =
  | "command-audit"
  | "worker-stdout"
  | "preprocess-job-log"
  | "none";

export type AdminWorkerRuntimePolicyFlag =
  | "auto_scan_enabled"
  | "auto_queue_enabled"
  | "auto_publish_index_enabled"
  | "audio_mode"
  | "concurrent_jobs";

export type AdminWorkerMutationTarget =
  | AdminCommandMutationTarget
  | "preprocess-job-log"
  | "keyframes-artifact"
  | "cover-artifact"
  | "transcript-artifact"
  | "asr-audio-artifact"
  | "index-package"
  | "index-current-pointer"
  | "cutter-release"
  | "worker-process";

export interface AdminWorkerWritePathAuditEntry {
  id: string;
  owner: AdminWorkerWritePathOwner;
  entrypoint: string;
  functions: string[];
  scan_mode: AdminScanMode;
  writer_lease_coverage: AdminWorkerWriterLeaseCoverage;
  command_names: AdminCommandName[];
  audit_surfaces: AdminWorkerAuditSurface[];
  mutation_targets: AdminWorkerMutationTarget[];
  status_transitions: string[];
  visible_to_cutters_effect: "none" | "hide" | "show";
  safe_for_page_request: boolean;
  requires_explicit_enable_flag: boolean;
  runtime_policy_flags_used: AdminWorkerRuntimePolicyFlag[];
  runtime_policy_flags_not_enforced: AdminWorkerRuntimePolicyFlag[];
  gap: string;
}

export const adminWorkerWritePathAuditEntries: readonly AdminWorkerWritePathAuditEntry[] = [
  {
    id: "docker-worker-loop-spawn",
    owner: "docker-worker-loop",
    entrypoint: "scripts/docker/admin-worker-loop.ts",
    functions: [
      "applyAdminRuntimeSecretsToEnv",
      "buildAdminWorkerCycle",
      "spawnSync(workerCommand)"
    ],
    scan_mode: "no-scan",
    writer_lease_coverage: "none",
    command_names: [],
    audit_surfaces: ["worker-stdout"],
    mutation_targets: ["worker-process"],
    status_transitions: [],
    visible_to_cutters_effect: "none",
    safe_for_page_request: false,
    requires_explicit_enable_flag: false,
    runtime_policy_flags_used: [],
    runtime_policy_flags_not_enforced: [],
    gap: "The loop only refreshes runtime secrets and spawns enabled workers; spawned workers own any library mutation contracts."
  },
  {
    id: "admin-supervisor-pipeline-scan-and-queue",
    owner: "admin-supervisor-pipeline",
    entrypoint: "packages/admin-api/src/admin-preprocess-pipeline.ts::runAdminPreprocessPipeline",
    functions: [
      "runAdminLibraryScanCommand",
      "runAdminPipelineQueueCommand"
    ],
    scan_mode: "folder-scan",
    writer_lease_coverage: "full",
    command_names: ["library-scan", "preprocess-queue-unprocessed-pipeline"],
    audit_surfaces: ["command-audit"],
    mutation_targets: [
      "library-manifest",
      "source-video-manifest",
      "preprocess-job",
      "read-model-cache"
    ],
    status_transitions: ["unprocessed -> queued"],
    visible_to_cutters_effect: "hide",
    safe_for_page_request: false,
    requires_explicit_enable_flag: false,
    runtime_policy_flags_used: [
      "auto_scan_enabled",
      "auto_queue_enabled"
    ],
    runtime_policy_flags_not_enforced: [],
    gap: "The Admin supervisor pipeline enforces auto_scan_enabled and auto_queue_enabled, and both scan/init and auto-queue writes are command-covered; scan and queue remain separate command transactions rather than one atomic pipeline transaction."
  },
  {
    id: "admin-supervisor-worker-cycle",
    owner: "admin-supervisor-pipeline",
    entrypoint: "packages/admin-api/src/admin-preprocess-pipeline.ts::createRealPreprocessRunner",
    functions: [
      "runLibraryTextPreprocessWorker",
      "createAdminWorkerLifecycleCommands",
      "runAdminWorkerClaimCommand",
      "runAdminWorkerStageCommand",
      "runAdminWorkerCompleteCommand",
      "assertAdminWorkerTextArtifactCommitReady",
      "runAdminWorkerFailCommand",
      "runAdminWorkerRefreshCountsCommand"
    ],
    scan_mode: "single-id",
    writer_lease_coverage: "partial",
    command_names: [
      "preprocess-worker-claim",
      "preprocess-worker-stage",
      "preprocess-worker-complete",
      "preprocess-worker-fail",
      "preprocess-worker-refresh-counts"
    ],
    audit_surfaces: ["command-audit", "preprocess-job-log"],
    mutation_targets: [
      "library-manifest",
      "source-video-manifest",
      "preprocess-job",
      "preprocess-job-log",
      "transcript-artifact",
      "asr-audio-artifact"
    ],
    status_transitions: [
      "queued -> processing",
      "processing -> index-required",
      "processing -> failed"
    ],
    visible_to_cutters_effect: "hide",
    safe_for_page_request: false,
    requires_explicit_enable_flag: false,
    runtime_policy_flags_used: [
      "audio_mode",
      "concurrent_jobs"
    ],
    runtime_policy_flags_not_enforced: [],
    gap: "The Admin supervisor default lifecycle short writes are wrapped by system-only command runtime snapshots/audit, and the complete command now verifies and snapshots required text artifacts before committing index-required state; long-running media/ASR work, ASR audio, and raw generated artifact writes intentionally remain outside the writer lease."
  },
  {
    id: "admin-supervisor-publish-cycle",
    owner: "admin-supervisor-pipeline",
    entrypoint: "packages/admin-api/src/admin-preprocess-pipeline.ts::runAdminPreprocessPipeline",
    functions: [
      "runAdminSupervisorPublishCommand",
      "publishReadyPreparedVideos",
      "completeReadyVisualArtifacts",
      "publishIndexRequiredSourceVideos",
      "publishIndexPackage",
      "publishReadySourceVideo",
      "publishCutterRelease"
    ],
    scan_mode: "status-scan",
    writer_lease_coverage: "full",
    command_names: ["preprocess-supervisor-publish-ready"],
    audit_surfaces: ["command-audit", "preprocess-job-log"],
    mutation_targets: [
      "library-manifest",
      "source-video-manifest",
      "preprocess-job",
      "preprocess-job-log",
      "source-video-artifact",
      "keyframes-artifact",
      "cover-artifact",
      "index-release",
      "index-package",
      "index-current-pointer",
      "cutter-release",
      "read-model-cache"
    ],
    status_transitions: ["index-required -> ready"],
    visible_to_cutters_effect: "show",
    safe_for_page_request: false,
    requires_explicit_enable_flag: false,
    runtime_policy_flags_used: ["auto_publish_index_enabled"],
    runtime_policy_flags_not_enforced: [],
    gap: "The Admin supervisor publish cycle enforces auto_publish_index_enabled and is wrapped in runAdminCommand with writer lease, snapshot, and command audit; scan/init and standalone worker publication remain separate command-boundary decisions."
  },
  {
    id: "standalone-preprocess-worker",
    owner: "standalone-preprocess-worker",
    entrypoint: "scripts/workers/preprocess-library-worker.ts",
    functions: [
      "inspectPreprocessSafety",
      "runLibraryTextPreprocessWorker",
      "scanSourceVideos",
      "createAdminWorkerLifecycleCommands",
      "runAdminWorkerClaimCommand",
      "runAdminWorkerStageCommand",
      "runAdminWorkerCompleteCommand",
      "runAdminWorkerFailCommand",
      "runAdminWorkerRefreshCountsCommand"
    ],
    scan_mode: "folder-scan",
    writer_lease_coverage: "partial",
    command_names: [
      "preprocess-worker-claim",
      "preprocess-worker-stage",
      "preprocess-worker-complete",
      "preprocess-worker-fail",
      "preprocess-worker-refresh-counts"
    ],
    audit_surfaces: ["command-audit", "worker-stdout", "preprocess-job-log"],
    mutation_targets: [
      "library-manifest",
      "source-video-manifest",
      "preprocess-job",
      "preprocess-job-log",
      "transcript-artifact",
      "asr-audio-artifact"
    ],
    status_transitions: [
      "unprocessed -> processing",
      "queued -> processing",
      "processing -> index-required",
      "processing -> failed"
    ],
    visible_to_cutters_effect: "hide",
    safe_for_page_request: false,
    requires_explicit_enable_flag: true,
    runtime_policy_flags_used: [],
    runtime_policy_flags_not_enforced: [],
    gap: "The standalone worker is guarded by MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER, NAS Docker defaults the flag to 0, and safety checks run before work starts; it now routes short lifecycle writes through Admin command snapshots/audit, while non-MVP scan-before-claim and long media/ASR artifact work remain outside the writer lease. In Docker MVP v0.1 it forces scan_before_claim=false and claim_statuses=[queued]."
  },
  {
    id: "standalone-ready-publish-worker",
    owner: "standalone-ready-publish-worker",
    entrypoint: "scripts/workers/publish-ready-worker.ts",
    functions: [
      "inspectPreprocessSafety",
      "completeReadyVisualArtifacts",
      "publishIndexRequiredSourceVideos",
      "publishIndexPackage",
      "publishReadySourceVideo",
      "publishCutterRelease"
    ],
    scan_mode: "status-scan",
    writer_lease_coverage: "none",
    command_names: [],
    audit_surfaces: ["worker-stdout", "preprocess-job-log"],
    mutation_targets: [
      "library-manifest",
      "source-video-manifest",
      "preprocess-job",
      "preprocess-job-log",
      "source-video-artifact",
      "keyframes-artifact",
      "cover-artifact",
      "index-release",
      "index-package",
      "index-current-pointer",
      "cutter-release"
    ],
    status_transitions: ["index-required -> ready"],
    visible_to_cutters_effect: "show",
    safe_for_page_request: false,
    requires_explicit_enable_flag: true,
    runtime_policy_flags_used: [],
    runtime_policy_flags_not_enforced: [],
    gap: "The standalone publish worker is guarded by MIXLAB_ENABLE_READY_PUBLISH_WORKER, NAS Docker defaults the flag to 0, the Docker loop refuses to schedule it in Docker MVP v0.1, and the script exits before publishing in MVP mode. Outside MVP, publication remains outside Admin command snapshots/audit."
  },
  {
    id: "library-fs-preprocess-lifecycle-primitives",
    owner: "library-fs-lifecycle",
    entrypoint: "packages/library-fs/src/preprocess-lifecycle.ts",
    functions: [
      "claimNextPreprocessJob",
      "updatePreprocessJobStage",
      "completePreprocessArtifacts",
      "failPreprocessJob",
      "completeReadyVisualArtifacts",
      "publishReadySourceVideo",
      "refreshLibraryCounts"
    ],
    scan_mode: "single-id",
    writer_lease_coverage: "none",
    command_names: [],
    audit_surfaces: ["preprocess-job-log"],
    mutation_targets: [
      "library-manifest",
      "source-video-manifest",
      "preprocess-job",
      "preprocess-job-log",
      "source-video-artifact",
      "keyframes-artifact",
      "cover-artifact"
    ],
    status_transitions: [
      "queued -> processing",
      "unprocessed -> processing",
      "processing -> index-required",
      "processing -> failed",
      "index-required -> ready"
    ],
    visible_to_cutters_effect: "show",
    safe_for_page_request: false,
    requires_explicit_enable_flag: false,
    runtime_policy_flags_used: [],
    runtime_policy_flags_not_enforced: [],
    gap: "These low-level primitives enforce status preconditions but are intentionally not command services; callers must provide the higher-level gate, lock, snapshot, and audit policy."
  }
];

export function adminWorkerWritePathAuditKeys(): string[] {
  return adminWorkerWritePathAuditEntries.map((entry) => entry.id).sort();
}

export function adminWorkerWritePathAuditEntry(id: string): AdminWorkerWritePathAuditEntry | null {
  return adminWorkerWritePathAuditEntries.find((entry) => entry.id === id) ?? null;
}

export function adminWorkerWritePathEntriesWithGaps(): AdminWorkerWritePathAuditEntry[] {
  return adminWorkerWritePathAuditEntries.filter((entry) => entry.gap.trim() !== "");
}
