import type { PreprocessStatus, SourceVideoManifest } from "../../protocol/src/index.ts";
import { AdminReadyProtectionError } from "./admin-protection.ts";
import type { AdminScanMode } from "./admin-scan-modes.ts";

export type AdminCommandName =
  | "settings-config"
  | "source-folder-add"
  | "source-folder-update"
  | "source-folder-remove"
  | "library-init"
  | "library-scan"
  | "preprocess-queue-unprocessed"
  | "preprocess-queue-unprocessed-pipeline"
  | "preprocess-retry-failed"
  | "preprocess-recover-processing"
  | "preprocess-worker-claim"
  | "preprocess-worker-stage"
  | "preprocess-worker-complete"
  | "preprocess-worker-fail"
  | "preprocess-worker-refresh-counts"
  | "source-video-queue"
  | "source-video-retry"
  | "source-video-recover-processing"
  | "source-video-publish"
  | "preprocess-supervisor-publish-ready"
  | "source-video-cover"
  | "index-repair"
  | "source-video-metadata"
  | "read-model-reconcile"
  | "command-snapshot-restore"
  | "admin-auth-register"
  | "admin-auth-login"
  | "admin-auth-logout"
  | "cutter-user-approve"
  | "cutter-user-disable"
  | "cutter-user-password-reset";

export interface AdminTransitionCommandSpec {
  command: AdminCommandName;
  scope: "bulk" | "single";
  from: PreprocessStatus[];
  to: PreprocessStatus;
  reason: string;
}

export type AdminCommandScanMode = AdminScanMode;

export type AdminCommandMutationTarget =
  | "admin-settings"
  | "runtime-secrets"
  | "source-folder-config"
  | "library-manifest"
  | "source-video-manifest"
  | "source-video-artifact"
  | "preprocess-job"
  | "preprocess-job-log"
  | "index-release"
  | "admin-user-store"
  | "admin-session-store"
  | "cutter-user-store"
  | "read-model-cache";

export interface AdminCommandContract {
  command: AdminCommandName;
  method: "POST" | "PATCH" | "DELETE";
  scope: "library" | "bulk" | "single";
  scan_mode: AdminCommandScanMode;
  requires_writer_lease: true;
  requires_scan_preview: boolean;
  requires_inactive_supervisor: boolean;
  invalidates_source_video_read_model: boolean;
  mutation_targets: AdminCommandMutationTarget[];
}

export type AdminReadModelInvalidationReason =
  | "none"
  | "source-folder-scope-change"
  | "library-scan-or-init"
  | "source-video-manifest-change"
  | "read-model-rebuild";

export interface AdminReadModelInvalidationPolicy {
  command: AdminCommandName;
  invalidates_source_video_read_model: boolean;
  requires_read_model_reconcile: boolean;
  reason: AdminReadModelInvalidationReason;
  scan_mode: AdminCommandScanMode;
  mutation_targets: AdminCommandMutationTarget[];
}

export interface AdminCommandBlock {
  error_code: "invalid_request" | "admin_mvp_command_blocked";
  message: string;
}

export type AdminDockerMvpMode = "off" | "v0.1";

export interface AdminDockerMvpCommandBlock extends AdminCommandBlock {
  error_code: "admin_mvp_command_blocked";
  details: {
    mode: AdminDockerMvpMode;
    command: AdminCommandName;
    policy: "docker-mvp-v0.1";
    allowed_surface: string[];
  };
}

export class AdminDockerMvpCommandBlockedError extends Error {
  readonly code = "admin_mvp_command_blocked";
  readonly details: AdminDockerMvpCommandBlock["details"];

  constructor(block: AdminDockerMvpCommandBlock) {
    super(block.message);
    this.name = "AdminDockerMvpCommandBlockedError";
    this.details = block.details;
  }
}

const commandContracts = {
  "settings-config": {
    command: "settings-config",
    method: "PATCH",
    scope: "library",
    scan_mode: "no-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["admin-settings", "runtime-secrets", "source-folder-config", "read-model-cache"]
  },
  "source-folder-add": {
    command: "source-folder-add",
    method: "POST",
    scope: "library",
    scan_mode: "no-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["admin-settings", "source-folder-config", "read-model-cache"]
  },
  "source-folder-update": {
    command: "source-folder-update",
    method: "PATCH",
    scope: "library",
    scan_mode: "no-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["admin-settings", "source-folder-config", "read-model-cache"]
  },
  "source-folder-remove": {
    command: "source-folder-remove",
    method: "DELETE",
    scope: "library",
    scan_mode: "no-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["admin-settings", "source-folder-config", "read-model-cache"]
  },
  "library-init": {
    command: "library-init",
    method: "POST",
    scope: "library",
    scan_mode: "no-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["library-manifest", "read-model-cache"]
  },
  "library-scan": {
    command: "library-scan",
    method: "POST",
    scope: "library",
    scan_mode: "folder-scan",
    requires_writer_lease: true,
    requires_scan_preview: true,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["library-manifest", "source-video-manifest", "read-model-cache"]
  },
  "preprocess-queue-unprocessed": {
    command: "preprocess-queue-unprocessed",
    method: "POST",
    scope: "bulk",
    scan_mode: "status-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "read-model-cache"]
  },
  "preprocess-queue-unprocessed-pipeline": {
    command: "preprocess-queue-unprocessed-pipeline",
    method: "POST",
    scope: "bulk",
    scan_mode: "status-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "read-model-cache"]
  },
  "preprocess-retry-failed": {
    command: "preprocess-retry-failed",
    method: "POST",
    scope: "bulk",
    scan_mode: "status-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "read-model-cache"]
  },
  "preprocess-recover-processing": {
    command: "preprocess-recover-processing",
    method: "POST",
    scope: "bulk",
    scan_mode: "status-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: true,
    invalidates_source_video_read_model: true,
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "read-model-cache"]
  },
  "preprocess-worker-claim": {
    command: "preprocess-worker-claim",
    method: "POST",
    scope: "single",
    scan_mode: "status-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: [
      "library-manifest",
      "source-video-manifest",
      "preprocess-job",
      "preprocess-job-log",
      "read-model-cache"
    ]
  },
  "preprocess-worker-stage": {
    command: "preprocess-worker-stage",
    method: "POST",
    scope: "single",
    scan_mode: "single-id",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: false,
    mutation_targets: ["preprocess-job", "preprocess-job-log"]
  },
  "preprocess-worker-complete": {
    command: "preprocess-worker-complete",
    method: "POST",
    scope: "single",
    scan_mode: "single-id",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: [
      "library-manifest",
      "source-video-manifest",
      "source-video-artifact",
      "preprocess-job",
      "preprocess-job-log",
      "read-model-cache"
    ]
  },
  "preprocess-worker-fail": {
    command: "preprocess-worker-fail",
    method: "POST",
    scope: "single",
    scan_mode: "single-id",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: [
      "library-manifest",
      "source-video-manifest",
      "preprocess-job",
      "preprocess-job-log",
      "read-model-cache"
    ]
  },
  "preprocess-worker-refresh-counts": {
    command: "preprocess-worker-refresh-counts",
    method: "POST",
    scope: "library",
    scan_mode: "status-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["library-manifest", "read-model-cache"]
  },
  "source-video-queue": {
    command: "source-video-queue",
    method: "POST",
    scope: "single",
    scan_mode: "single-id",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "read-model-cache"]
  },
  "source-video-retry": {
    command: "source-video-retry",
    method: "POST",
    scope: "single",
    scan_mode: "single-id",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "read-model-cache"]
  },
  "source-video-recover-processing": {
    command: "source-video-recover-processing",
    method: "POST",
    scope: "single",
    scan_mode: "single-id",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: true,
    invalidates_source_video_read_model: true,
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "read-model-cache"]
  },
  "source-video-publish": {
    command: "source-video-publish",
    method: "POST",
    scope: "single",
    scan_mode: "single-id",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "index-release", "read-model-cache"]
  },
  "preprocess-supervisor-publish-ready": {
    command: "preprocess-supervisor-publish-ready",
    method: "POST",
    scope: "bulk",
    scan_mode: "status-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: [
      "library-manifest",
      "source-video-manifest",
      "source-video-artifact",
      "preprocess-job",
      "index-release",
      "read-model-cache"
    ]
  },
  "source-video-cover": {
    command: "source-video-cover",
    method: "PATCH",
    scope: "single",
    scan_mode: "single-id",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["source-video-artifact", "source-video-manifest", "read-model-cache"]
  },
  "index-repair": {
    command: "index-repair",
    method: "POST",
    scope: "bulk",
    scan_mode: "status-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["library-manifest", "source-video-manifest", "preprocess-job", "index-release", "read-model-cache"]
  },
  "source-video-metadata": {
    command: "source-video-metadata",
    method: "PATCH",
    scope: "single",
    scan_mode: "single-id",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["source-video-manifest", "read-model-cache"]
  },
  "read-model-reconcile": {
    command: "read-model-reconcile",
    method: "POST",
    scope: "library",
    scan_mode: "full-reconcile",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: true,
    mutation_targets: ["read-model-cache"]
  },
  "command-snapshot-restore": {
    command: "command-snapshot-restore",
    method: "POST",
    scope: "library",
    scan_mode: "no-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: true,
    invalidates_source_video_read_model: true,
    mutation_targets: [
      "admin-settings",
      "source-folder-config",
      "library-manifest",
      "source-video-manifest",
      "source-video-artifact",
      "preprocess-job",
      "index-release",
      "read-model-cache"
    ]
  },
  "admin-auth-register": {
    command: "admin-auth-register",
    method: "POST",
    scope: "single",
    scan_mode: "no-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: false,
    mutation_targets: ["admin-user-store", "admin-session-store"]
  },
  "admin-auth-login": {
    command: "admin-auth-login",
    method: "POST",
    scope: "single",
    scan_mode: "no-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: false,
    mutation_targets: ["admin-user-store", "admin-session-store"]
  },
  "admin-auth-logout": {
    command: "admin-auth-logout",
    method: "POST",
    scope: "single",
    scan_mode: "no-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: false,
    mutation_targets: ["admin-session-store"]
  },
  "cutter-user-approve": {
    command: "cutter-user-approve",
    method: "POST",
    scope: "single",
    scan_mode: "no-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: false,
    mutation_targets: ["cutter-user-store"]
  },
  "cutter-user-disable": {
    command: "cutter-user-disable",
    method: "POST",
    scope: "single",
    scan_mode: "no-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: false,
    mutation_targets: ["cutter-user-store"]
  },
  "cutter-user-password-reset": {
    command: "cutter-user-password-reset",
    method: "POST",
    scope: "single",
    scan_mode: "no-scan",
    requires_writer_lease: true,
    requires_scan_preview: false,
    requires_inactive_supervisor: false,
    invalidates_source_video_read_model: false,
    mutation_targets: ["cutter-user-store"]
  }
} satisfies Record<AdminCommandName, AdminCommandContract>;

const transitionCommandSpecs = {
  "preprocess-queue-unprocessed": {
    command: "preprocess-queue-unprocessed",
    scope: "bulk",
    from: ["unprocessed"],
    to: "queued",
    reason: "queued-by-admin"
  },
  "preprocess-queue-unprocessed-pipeline": {
    command: "preprocess-queue-unprocessed-pipeline",
    scope: "bulk",
    from: ["unprocessed"],
    to: "queued",
    reason: "queued-by-pipeline"
  },
  "preprocess-retry-failed": {
    command: "preprocess-retry-failed",
    scope: "bulk",
    from: ["failed"],
    to: "queued",
    reason: "retry-by-admin"
  },
  "preprocess-recover-processing": {
    command: "preprocess-recover-processing",
    scope: "bulk",
    from: ["processing"],
    to: "queued",
    reason: "recover-processing-by-admin"
  },
  "source-video-queue": {
    command: "source-video-queue",
    scope: "single",
    from: ["unprocessed"],
    to: "queued",
    reason: "queued-by-admin"
  },
  "source-video-retry": {
    command: "source-video-retry",
    scope: "single",
    from: ["failed"],
    to: "queued",
    reason: "retry-by-admin"
  },
  "source-video-recover-processing": {
    command: "source-video-recover-processing",
    scope: "single",
    from: ["processing"],
    to: "queued",
    reason: "recover-processing-by-admin"
  }
} satisfies Partial<Record<AdminCommandName, AdminTransitionCommandSpec>>;

const supervisorInactiveRequiredCommands = new Set<AdminCommandName>([
  "preprocess-recover-processing",
  "source-video-recover-processing",
  "command-snapshot-restore"
]);

const dockerMvpAllowedCommands = new Set<AdminCommandName>([
  "preprocess-queue-unprocessed",
  "preprocess-queue-unprocessed-pipeline",
  "preprocess-retry-failed",
  "preprocess-recover-processing",
  "preprocess-worker-claim",
  "preprocess-worker-stage",
  "preprocess-worker-complete",
  "preprocess-worker-fail",
  "preprocess-worker-refresh-counts",
  "source-video-queue",
  "source-video-retry",
  "source-video-recover-processing",
  "admin-auth-register",
  "admin-auth-login",
  "admin-auth-logout",
  "cutter-user-approve",
  "cutter-user-disable",
  "cutter-user-password-reset"
]);

const dockerMvpAllowedSurface = [
  "管理端登录",
  "剪辑师管理",
  "受控预处理队列",
  "预处理 worker 状态写入"
];

export const adminCommandNames = Object.keys(commandContracts) as AdminCommandName[];

export function adminCommandContract(command: AdminCommandName): AdminCommandContract {
  return commandContracts[command];
}

export function adminTransitionCommandSpec(command: keyof typeof transitionCommandSpecs): AdminTransitionCommandSpec {
  return transitionCommandSpecs[command];
}

export function adminCommandRequiresInactiveSupervisor(command: AdminCommandName): boolean {
  return commandContracts[command].requires_inactive_supervisor || supervisorInactiveRequiredCommands.has(command);
}

export function adminCommandRequiresScanPreview(command: AdminCommandName): boolean {
  return commandContracts[command].requires_scan_preview;
}

export function adminCommandInvalidatesSourceVideoReadModel(command: AdminCommandName): boolean {
  return commandContracts[command].invalidates_source_video_read_model;
}

export function adminCommandReadModelInvalidationPolicy(command: AdminCommandName): AdminReadModelInvalidationPolicy {
  const contract = commandContracts[command];
  const mutationTargets = contract.mutation_targets as readonly AdminCommandMutationTarget[];
  if (!contract.invalidates_source_video_read_model) {
    return {
      command,
      invalidates_source_video_read_model: false,
      requires_read_model_reconcile: false,
      reason: "none",
      scan_mode: contract.scan_mode,
      mutation_targets: [...mutationTargets]
    };
  }

  if (command === "read-model-reconcile") {
    return {
      command,
      invalidates_source_video_read_model: true,
      requires_read_model_reconcile: false,
      reason: "read-model-rebuild",
      scan_mode: contract.scan_mode,
      mutation_targets: [...mutationTargets]
    };
  }

  if (command === "command-snapshot-restore") {
    return {
      command,
      invalidates_source_video_read_model: true,
      requires_read_model_reconcile: true,
      reason: "read-model-rebuild",
      scan_mode: contract.scan_mode,
      mutation_targets: [...mutationTargets]
    };
  }

  if (mutationTargets.includes("source-folder-config")) {
    return {
      command,
      invalidates_source_video_read_model: true,
      requires_read_model_reconcile: true,
      reason: "source-folder-scope-change",
      scan_mode: contract.scan_mode,
      mutation_targets: [...mutationTargets]
    };
  }

  if (mutationTargets.includes("library-manifest") && contract.scope === "library") {
    return {
      command,
      invalidates_source_video_read_model: true,
      requires_read_model_reconcile: true,
      reason: "library-scan-or-init",
      scan_mode: contract.scan_mode,
      mutation_targets: [...mutationTargets]
    };
  }

  return {
    command,
    invalidates_source_video_read_model: true,
    requires_read_model_reconcile: false,
    reason: "source-video-manifest-change",
    scan_mode: contract.scan_mode,
    mutation_targets: [...mutationTargets]
  };
}

export function adminCommandRequiresReadModelReconcile(command: AdminCommandName): boolean {
  return adminCommandReadModelInvalidationPolicy(command).requires_read_model_reconcile;
}

export function resolveAdminDockerMvpMode(
  env: Record<string, string | undefined> = process.env
): AdminDockerMvpMode {
  const rawMode = env.MIXLAB_ADMIN_DOCKER_MVP_MODE?.trim().toLowerCase();
  return rawMode === "v0.1" || rawMode === "docker-mvp-v0.1" || rawMode === "true"
    ? "v0.1"
    : "off";
}

export function adminDockerMvpCommandBlock(input: {
  command: AdminCommandName;
  mode: AdminDockerMvpMode;
}): AdminDockerMvpCommandBlock | null {
  if (input.mode === "off" || dockerMvpAllowedCommands.has(input.command)) {
    return null;
  }

  return {
    error_code: "admin_mvp_command_blocked",
    message: `Docker MVP v0.1 已阻断高风险管理端命令：${input.command}`,
    details: {
      mode: input.mode,
      command: input.command,
      policy: "docker-mvp-v0.1",
      allowed_surface: dockerMvpAllowedSurface
    }
  };
}

export function assertAdminDockerMvpCommandAllowed(input: {
  command: AdminCommandName;
  mode: AdminDockerMvpMode;
}): void {
  const block = adminDockerMvpCommandBlock(input);
  if (block) {
    throw new AdminDockerMvpCommandBlockedError(block);
  }
}

export function isAdminDockerMvpCommandBlockedError(
  error: unknown
): error is AdminDockerMvpCommandBlockedError {
  return error instanceof AdminDockerMvpCommandBlockedError ||
    (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "admin_mvp_command_blocked"
    );
}

export function adminRecoverProcessingSupervisorBlock(input: {
  command: AdminCommandName;
  supervisor_state: string;
}): AdminCommandBlock | null {
  if (
    adminCommandRequiresInactiveSupervisor(input.command) &&
    (input.supervisor_state === "running" || input.supervisor_state === "stopping")
  ) {
    return {
      error_code: "invalid_request",
      message: "预处理流水线仍在运行，不能恢复正在处理的任务。"
    };
  }

  return null;
}

export function protectedReadyTransitionManifests(input: {
  manifests: SourceVideoManifest[];
  from: PreprocessStatus[];
  to: PreprocessStatus;
  requested_source_video_ids?: ReadonlySet<string> | null;
}): SourceVideoManifest[] {
  return input.manifests.filter((manifest) =>
    manifest.preprocess_status === "ready" &&
    input.to !== "ready" &&
    (
      input.from.includes("ready") ||
      (input.requested_source_video_ids ? input.requested_source_video_ids.has(manifest.source_video_id) : false)
    )
  );
}

export function assertAdminTransitionAllowed(input: {
  manifests: SourceVideoManifest[];
  from: PreprocessStatus[];
  to: PreprocessStatus;
  requested_source_video_ids?: ReadonlySet<string> | null;
}): void {
  const protectedReadyManifests = protectedReadyTransitionManifests(input);
  if (protectedReadyManifests.length === 0) {
    return;
  }

  throw new AdminReadyProtectionError(
    protectedReadyManifests.map((manifest) => manifest.source_video_id),
    input.to
  );
}
