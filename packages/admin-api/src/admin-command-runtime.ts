import {
  withAdminWriterLease
} from "../../library-fs/src/index.ts";
import {
  appendAdminCommandAuditEventBestEffort,
  type AdminCommandActor
} from "./admin-command-audit.ts";
import {
  assertAdminDockerMvpCommandAllowed,
  adminCommandContract,
  resolveAdminDockerMvpAllowedCommands,
  resolveAdminDockerMvpMode,
  type AdminDockerMvpMode,
  type AdminCommandName
} from "./admin-command-guard.ts";
import {
  adminCommandSnapshotUnavailable,
  createAdminCommandSnapshotBestEffort,
  type AdminCommandSnapshotFileInput,
  type AdminCommandSnapshotResult,
  type CreateAdminCommandSnapshotInput
} from "./admin-command-snapshot.ts";
import type {
  AdminOperationLogAppendInput,
  AdminOperationLogEvent
} from "./admin-operation-log.ts";

export interface RunAdminCommandInput {
  library_root: string;
  command: AdminCommandName;
  now: string;
  holder?: string;
  actor?: AdminCommandActor;
  docker_mvp_mode?: AdminDockerMvpMode;
  docker_mvp_allowed_commands?: readonly AdminCommandName[];
  snapshot_files?: AdminCommandSnapshotFileInput[];
  snapshot_files_provider?: () => Promise<AdminCommandSnapshotFileInput[]>;
  append_operation_log_event?: (input: AdminOperationLogAppendInput) => Promise<AdminOperationLogEvent>;
  create_command_snapshot?: (input: CreateAdminCommandSnapshotInput) => Promise<AdminCommandSnapshotResult>;
}

export function adminCommandHolder(processId = process.pid): string {
  return `admin-api:${processId}`;
}

export async function runAdminCommand<T>(
  input: RunAdminCommandInput,
  operation: () => Promise<T>
): Promise<T> {
  const contract = adminCommandContract(input.command);
  const holder = input.holder ?? adminCommandHolder();
  const dockerMvpMode = input.docker_mvp_mode ?? resolveAdminDockerMvpMode();
  const dockerMvpAllowedCommands = input.docker_mvp_allowed_commands ?? resolveAdminDockerMvpAllowedCommands();
  const baseAuditInput = {
    library_root: input.library_root,
    command: input.command,
    occurred_at: input.now,
    holder,
    actor: input.actor,
    append_operation_log_event: input.append_operation_log_event
  };
  let snapshot: AdminCommandSnapshotResult | undefined;

  try {
    assertAdminDockerMvpCommandAllowed({
      command: input.command,
      mode: dockerMvpMode,
      allowed_commands: dockerMvpAllowedCommands
    });

    const executeCommand = async () => {
      try {
        const snapshotInput = {
          library_root: input.library_root,
          command: input.command,
          created_at: input.now,
          holder,
          files: input.snapshot_files_provider
            ? await input.snapshot_files_provider()
            : input.snapshot_files
        };
        snapshot = await (
          input.create_command_snapshot ?? createAdminCommandSnapshotBestEffort
        )(snapshotInput).catch((error: unknown) => adminCommandSnapshotUnavailable(error));
      } catch (error) {
        snapshot = adminCommandSnapshotUnavailable(error);
      }

      await appendAdminCommandAuditEventBestEffort({
        ...baseAuditInput,
        snapshot,
        event_type: "started"
      });

      return operation();
    };

    const result = contract.requires_writer_lease
      ? await withAdminWriterLease({
        library_root: input.library_root,
        holder,
        reason: contract.command,
        now: input.now
      }, executeCommand)
      : await executeCommand();

    await appendAdminCommandAuditEventBestEffort({
      ...baseAuditInput,
      snapshot,
      event_type: "succeeded"
    });
    return result;
  } catch (error) {
    await appendAdminCommandAuditEventBestEffort({
      ...baseAuditInput,
      snapshot,
      event_type: "failed",
      error
    });
    throw error;
  }
}
