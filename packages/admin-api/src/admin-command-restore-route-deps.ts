import type {
  AdminCommandRestoreRouteApiInput,
  AdminCommandRestoreRouteDeps,
  AdminCommandRestoreRouteSupervisorBlock,
  AdminCommandRestoreRouteSupervisorStatus
} from "./admin-command-restore-routes.ts";
import type { AdminCommandSnapshotRestoreResult } from "./admin-command-restore.ts";
import type { AdminCommandRestorePlan } from "./admin-command-restore-plan.ts";

interface CommandRestoreContext<TActor> {
  library_root: string;
  now: string;
  actor?: TActor;
}

export interface CreateAdminCommandRestoreRouteDepsInput<
  TApiInput extends AdminCommandRestoreRouteApiInput,
  TActor,
  TManifest,
  TOperationLogAppender,
  TRestorePlan extends AdminCommandRestorePlan,
  TRestoreResult extends AdminCommandSnapshotRestoreResult
> {
  restore_now: string;
  plan_generated_at(): string;
  invalidated_at(): string;
  holder?: string;
  actor?: TActor;
  resolve_snapshot_manifest_path(input: {
    library_root: string;
    snapshot_id: string;
  }): Promise<string | null>;
  plan_restore_command(input: {
    library_root: string;
    snapshot_manifest_path: string;
    generated_at: string;
  }): Promise<TRestorePlan>;
  run_restore_command(input: CommandRestoreContext<TActor> & {
    snapshot_manifest_path: string;
    invalidated_at: string;
    holder?: string;
    read_library_manifest(): Promise<TManifest | null>;
    append_operation_log_event: TOperationLogAppender;
  }): Promise<TRestoreResult>;
  read_library_manifest(libraryRoot: string): Promise<TManifest | null>;
  append_operation_log_event: TOperationLogAppender;
  read_preprocess_supervisor_status(): AdminCommandRestoreRouteSupervisorStatus;
  restore_supervisor_block(input: {
    command: "command-snapshot-restore";
    supervisor_state: string;
  }): AdminCommandRestoreRouteSupervisorBlock | null;
}

export interface CreateAdminCommandRestoreRouteServerDepsInput<
  TApiInput extends AdminCommandRestoreRouteApiInput,
  TActor,
  TManifest,
  TOperationLogAppender,
  TRestorePlan extends AdminCommandRestorePlan,
  TRestoreResult extends AdminCommandSnapshotRestoreResult,
  TSupervisorRuntimeStatus,
  TSupervisorPublicStatus extends AdminCommandRestoreRouteSupervisorStatus
> extends Omit<
  CreateAdminCommandRestoreRouteDepsInput<
    TApiInput,
    TActor,
    TManifest,
    TOperationLogAppender,
    TRestorePlan,
    TRestoreResult
  >,
  "read_preprocess_supervisor_status"
> {
  read_preprocess_supervisor_status(): TSupervisorRuntimeStatus;
  to_public_preprocess_supervisor_status(status: TSupervisorRuntimeStatus): TSupervisorPublicStatus;
}

export function createAdminCommandRestoreRouteDeps<
  TApiInput extends AdminCommandRestoreRouteApiInput,
  TActor,
  TManifest,
  TOperationLogAppender,
  TRestorePlan extends AdminCommandRestorePlan,
  TRestoreResult extends AdminCommandSnapshotRestoreResult
>(
  input: CreateAdminCommandRestoreRouteDepsInput<
    TApiInput,
    TActor,
    TManifest,
    TOperationLogAppender,
    TRestorePlan,
    TRestoreResult
  >
): AdminCommandRestoreRouteDeps<TApiInput, TRestorePlan, TRestoreResult> {
  function restoreContext(apiInput: TApiInput): CommandRestoreContext<TActor> {
    return {
      library_root: apiInput.library_root,
      now: input.restore_now,
      actor: input.actor
    };
  }

  return {
    resolve_snapshot_manifest_path({ api_input, snapshot_id }) {
      return input.resolve_snapshot_manifest_path({
        library_root: api_input.library_root,
        snapshot_id
      });
    },
    plan_restore({ api_input, snapshot_manifest_path }) {
      return input.plan_restore_command({
        library_root: api_input.library_root,
        snapshot_manifest_path,
        generated_at: input.plan_generated_at()
      });
    },
    run_restore({ api_input, snapshot_manifest_path }) {
      return input.run_restore_command({
        ...restoreContext(api_input),
        snapshot_manifest_path,
        invalidated_at: input.invalidated_at(),
        holder: input.holder,
        read_library_manifest() {
          return input.read_library_manifest(api_input.library_root);
        },
        append_operation_log_event: input.append_operation_log_event
      });
    },
    read_preprocess_supervisor_status: input.read_preprocess_supervisor_status,
    restore_supervisor_block: input.restore_supervisor_block
  };
}

export function createAdminCommandRestoreRouteServerDeps<
  TApiInput extends AdminCommandRestoreRouteApiInput,
  TActor,
  TManifest,
  TOperationLogAppender,
  TRestorePlan extends AdminCommandRestorePlan,
  TRestoreResult extends AdminCommandSnapshotRestoreResult,
  TSupervisorRuntimeStatus,
  TSupervisorPublicStatus extends AdminCommandRestoreRouteSupervisorStatus
>(
  input: CreateAdminCommandRestoreRouteServerDepsInput<
    TApiInput,
    TActor,
    TManifest,
    TOperationLogAppender,
    TRestorePlan,
    TRestoreResult,
    TSupervisorRuntimeStatus,
    TSupervisorPublicStatus
  >
): AdminCommandRestoreRouteDeps<TApiInput, TRestorePlan, TRestoreResult> {
  const {
    read_preprocess_supervisor_status,
    to_public_preprocess_supervisor_status,
    ...routeDepsInput
  } = input;

  return createAdminCommandRestoreRouteDeps({
    ...routeDepsInput,
    read_preprocess_supervisor_status() {
      return to_public_preprocess_supervisor_status(read_preprocess_supervisor_status());
    }
  });
}
