import {
  appendAdminOperationLogEvent,
  type AdminOperationLogAppendInput,
  type AdminOperationLogArea,
  type AdminOperationLogEvent,
  type AdminOperationLogEventType
} from "./admin-operation-log.ts";
import {
  adminCommandContract,
  adminCommandReadModelInvalidationPolicy,
  type AdminCommandName
} from "./admin-command-guard.ts";
import type {
  AdminCommandSnapshotResult
} from "./admin-command-snapshot.ts";

export type AdminCommandAuditEventType = Extract<
  AdminOperationLogEventType,
  "started" | "succeeded" | "failed"
>;

export interface AdminCommandAuditInput {
  library_root: string;
  command: AdminCommandName;
  occurred_at: string;
  event_type: AdminCommandAuditEventType;
  holder: string;
  actor?: AdminCommandActor;
  error?: unknown;
  snapshot?: AdminCommandSnapshotResult;
  append_operation_log_event?: (input: AdminOperationLogAppendInput) => Promise<AdminOperationLogEvent>;
}

export type AdminCommandActorKind = "admin-user" | "system" | "unknown";

export type AdminCommandActorSource =
  | "admin-session"
  | "auth-disabled"
  | "system-task"
  | "runtime-holder";

export interface AdminCommandActor {
  kind: AdminCommandActorKind;
  source: AdminCommandActorSource;
  admin_id?: string;
  username?: string;
  display_name?: string;
  role?: string;
  label?: string;
}

const commandAreaByName = {
  "settings-config": "settings",
  "source-folder-add": "settings",
  "source-folder-update": "settings",
  "source-folder-remove": "settings",
  "library-init": "system",
  "library-scan": "protection",
  "preprocess-queue-unprocessed": "preprocess",
  "preprocess-queue-unprocessed-pipeline": "preprocess",
  "preprocess-retry-failed": "preprocess",
  "preprocess-recover-processing": "preprocess",
  "preprocess-worker-claim": "preprocess",
  "preprocess-worker-stage": "preprocess",
  "preprocess-worker-complete": "preprocess",
  "preprocess-worker-fail": "preprocess",
  "preprocess-worker-refresh-counts": "preprocess",
  "source-video-queue": "preprocess",
  "source-video-retry": "preprocess",
  "source-video-recover-processing": "preprocess",
  "source-video-publish": "release",
  "preprocess-supervisor-publish-ready": "release",
  "source-video-cover": "protection",
  "index-repair": "release",
  "source-video-metadata": "protection",
  "read-model-reconcile": "read-model",
  "command-snapshot-restore": "protection",
  "admin-auth-register": "system",
  "admin-auth-login": "system",
  "admin-auth-logout": "system",
  "cutter-user-approve": "users",
  "cutter-user-disable": "users",
  "cutter-user-password-reset": "users"
} satisfies Record<AdminCommandName, AdminOperationLogArea>;

export function adminCommandAuditArea(command: AdminCommandName): AdminOperationLogArea {
  return commandAreaByName[command];
}

function eventMessage(command: AdminCommandName, eventType: AdminCommandAuditEventType): string {
  switch (eventType) {
    case "started":
      return `Admin command ${command} started.`;
    case "succeeded":
      return `Admin command ${command} succeeded.`;
    case "failed":
      return `Admin command ${command} failed.`;
  }
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (!error) {
    return {};
  }

  if (typeof error === "object") {
    const candidate = error as {
      name?: unknown;
      code?: unknown;
      message?: unknown;
    };
    return {
      error_name: typeof candidate.name === "string" ? candidate.name : "Error",
      error_code: typeof candidate.code === "string" ? candidate.code : "",
      error_message: typeof candidate.message === "string" ? candidate.message : "Command failed."
    };
  }

  return {
    error_name: "Error",
    error_code: "",
    error_message: typeof error === "string" ? error : "Command failed."
  };
}

function snapshotDetails(snapshot: AdminCommandSnapshotResult | undefined): Record<string, unknown> {
  if (!snapshot) {
    return {};
  }

  if (snapshot.created) {
    return {
      command_snapshot: {
        created: true,
        reason: snapshot.reason,
        snapshot_kind: snapshot.snapshot_kind,
        rollback_status: snapshot.rollback_status,
        snapshot_id: snapshot.snapshot_id,
        manifest_relative_path: snapshot.manifest_relative_path,
        requested_file_count: snapshot.requested_file_count,
        captured_file_count: snapshot.captured_file_count,
        missing_file_count: snapshot.missing_file_count,
        skipped_file_count: snapshot.skipped_file_count,
        failed_file_count: snapshot.failed_file_count
      }
    };
  }

  return {
    command_snapshot: {
      created: false,
      reason: snapshot.reason,
      snapshot_kind: snapshot.snapshot_kind,
      rollback_status: snapshot.rollback_status,
      error_name: snapshot.error_name,
      error_code: snapshot.error_code,
      error_message: snapshot.error_message
    }
  };
}

function cleanOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function adminCommandActorFromHolder(holder: string): AdminCommandActor {
  return {
    kind: "unknown",
    source: "runtime-holder",
    label: holder
  };
}

export function adminCommandSystemActor(label: string, source: "auth-disabled" | "system-task" = "system-task"): AdminCommandActor {
  return {
    kind: "system",
    source,
    label
  };
}

function auditActorDetails(actor: AdminCommandActor | undefined, holder: string): AdminCommandActor {
  const candidate = actor ?? adminCommandActorFromHolder(holder);
  return {
    kind: candidate.kind,
    source: candidate.source,
    ...(cleanOptionalString(candidate.admin_id) ? { admin_id: cleanOptionalString(candidate.admin_id) } : {}),
    ...(cleanOptionalString(candidate.username) ? { username: cleanOptionalString(candidate.username) } : {}),
    ...(cleanOptionalString(candidate.display_name) ? { display_name: cleanOptionalString(candidate.display_name) } : {}),
    ...(cleanOptionalString(candidate.role) ? { role: cleanOptionalString(candidate.role) } : {}),
    ...(cleanOptionalString(candidate.label) ? { label: cleanOptionalString(candidate.label) } : {})
  };
}

export function adminCommandAuditDetails(input: {
  command: AdminCommandName;
  holder: string;
  actor?: AdminCommandActor;
  error?: unknown;
  snapshot?: AdminCommandSnapshotResult;
}): Record<string, unknown> {
  const contract = adminCommandContract(input.command);
  const readModelPolicy = adminCommandReadModelInvalidationPolicy(input.command);

  return {
    command: contract.command,
    holder: input.holder,
    actor: auditActorDetails(input.actor, input.holder),
    lease_reason: contract.command,
    method: contract.method,
    scope: contract.scope,
    scan_mode: contract.scan_mode,
    requires_scan_preview: contract.requires_scan_preview,
    requires_inactive_supervisor: contract.requires_inactive_supervisor,
    invalidates_source_video_read_model: contract.invalidates_source_video_read_model,
    mutation_targets: [...contract.mutation_targets],
    read_model_invalidation: {
      invalidates_source_video_read_model: readModelPolicy.invalidates_source_video_read_model,
      requires_read_model_reconcile: readModelPolicy.requires_read_model_reconcile,
      reason: readModelPolicy.reason
    },
    ...snapshotDetails(input.snapshot),
    ...errorDetails(input.error)
  };
}

export async function appendAdminCommandAuditEvent(
  input: AdminCommandAuditInput
): Promise<AdminOperationLogEvent> {
  const appendOperationLogEvent = input.append_operation_log_event ?? appendAdminOperationLogEvent;

  return appendOperationLogEvent({
    library_root: input.library_root,
    occurred_at: input.occurred_at,
    area: adminCommandAuditArea(input.command),
    action: input.command,
    event_type: input.event_type,
    message: eventMessage(input.command, input.event_type),
    details: adminCommandAuditDetails({
      command: input.command,
      holder: input.holder,
      actor: input.actor,
      error: input.error,
      snapshot: input.snapshot
    })
  });
}

export async function appendAdminCommandAuditEventBestEffort(
  input: AdminCommandAuditInput
): Promise<void> {
  try {
    await appendAdminCommandAuditEvent(input);
  } catch {
    // Operation-log write failure must never block the protected command itself.
  }
}
