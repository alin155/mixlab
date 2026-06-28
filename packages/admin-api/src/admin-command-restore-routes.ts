import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  adminCommandSnapshotRoot
} from "./admin-command-snapshot.ts";
import type {
  AdminCommandSnapshotRestoreResult
} from "./admin-command-restore.ts";
import type {
  AdminCommandRestorePlan
} from "./admin-command-restore-plan.ts";
import {
  adminDockerMvpCommandBlockedRouteError,
  apiError,
  apiOk,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";

export interface AdminCommandRestoreRouteApiInput {
  library_root: string;
}

export interface AdminCommandRestoreRouteSupervisorStatus {
  state: string;
}

export interface AdminCommandRestoreRouteSupervisorBlock {
  error_code: string;
  message: string;
}

export interface AdminCommandRestoreRouteCommandInput<
  TApiInput extends AdminCommandRestoreRouteApiInput
> {
  api_input: TApiInput;
  snapshot_id: string;
  snapshot_manifest_path: string;
}

export interface AdminCommandRestoreRouteDeps<
  TApiInput extends AdminCommandRestoreRouteApiInput,
  TRestorePlan extends AdminCommandRestorePlan,
  TRestoreResult extends AdminCommandSnapshotRestoreResult
> {
  resolve_snapshot_manifest_path(input: {
    api_input: TApiInput;
    snapshot_id: string;
  }): Promise<string | null>;
  plan_restore(input: AdminCommandRestoreRouteCommandInput<TApiInput>): Promise<TRestorePlan>;
  run_restore(input: AdminCommandRestoreRouteCommandInput<TApiInput>): Promise<TRestoreResult>;
  read_preprocess_supervisor_status(): AdminCommandRestoreRouteSupervisorStatus;
  restore_supervisor_block(input: {
    command: "command-snapshot-restore";
    supervisor_state: string;
  }): AdminCommandRestoreRouteSupervisorBlock | null;
}

export type AdminCommandRestoreRouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

export interface HandleAdminCommandRestoreRoutesInput<
  TApiInput extends AdminCommandRestoreRouteApiInput,
  TRestorePlan extends AdminCommandRestorePlan,
  TRestoreResult extends AdminCommandSnapshotRestoreResult
> {
  method: string;
  pathname: string;
  api_input: TApiInput;
  deps: AdminCommandRestoreRouteDeps<TApiInput, TRestorePlan, TRestoreResult>;
}

export function matchAdminCommandSnapshotRestorePlanPath(pathname: string): string | null {
  const match = /^\/api\/admin\/command-snapshots\/([A-Za-z0-9._-]+)\/restore-plan$/.exec(pathname);
  const snapshotId = match?.[1];
  return snapshotId && snapshotIdIsSafe(snapshotId) ? snapshotId : null;
}

export function matchAdminCommandSnapshotRestorePath(pathname: string): string | null {
  const match = /^\/api\/admin\/command-snapshots\/([A-Za-z0-9._-]+)\/restore$/.exec(pathname);
  const snapshotId = match?.[1];
  return snapshotId && snapshotIdIsSafe(snapshotId) ? snapshotId : null;
}

function snapshotIdIsSafe(snapshotId: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(snapshotId) && !/^\.+$/.test(snapshotId);
}

function commandSnapshotNotFound(): AdminCommandRestoreRouteResult {
  return {
    handled: true,
    status_code: 404,
    body: apiError("not_found", "命令快照不存在")
  };
}

function restoreBlockedResult(input: {
  message: string;
  details: Record<string, unknown>;
}): AdminCommandRestoreRouteResult {
  return {
    handled: true,
    status_code: 409,
    body: apiError("restore_blocked", input.message, input.details)
  };
}

async function findSnapshotManifestById(input: {
  library_root: string;
  snapshot_id: string;
}): Promise<string | null> {
  if (!snapshotIdIsSafe(input.snapshot_id)) {
    return null;
  }

  const root = adminCommandSnapshotRoot(input.library_root);
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }

  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const directory of directories) {
    const manifestPath = path.join(root, directory, "snapshot.json");
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      continue;
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { snapshot_id?: unknown }).snapshot_id === "string" &&
      (parsed as { snapshot_id: string }).snapshot_id === input.snapshot_id
    ) {
      return manifestPath;
    }
  }

  return null;
}

export function resolveAdminCommandSnapshotManifestPath(input: {
  library_root: string;
  snapshot_id: string;
}): Promise<string | null> {
  return findSnapshotManifestById(input);
}

export async function handleAdminCommandRestoreRoutes<
  TApiInput extends AdminCommandRestoreRouteApiInput,
  TRestorePlan extends AdminCommandRestorePlan,
  TRestoreResult extends AdminCommandSnapshotRestoreResult
>(
  input: HandleAdminCommandRestoreRoutesInput<TApiInput, TRestorePlan, TRestoreResult>
): Promise<AdminCommandRestoreRouteResult> {
  const planSnapshotId = matchAdminCommandSnapshotRestorePlanPath(input.pathname);
  if (input.method === "GET" && planSnapshotId) {
    const snapshotManifestPath = await input.deps.resolve_snapshot_manifest_path({
      api_input: input.api_input,
      snapshot_id: planSnapshotId
    });
    if (!snapshotManifestPath) {
      return commandSnapshotNotFound();
    }

    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.plan_restore({
        api_input: input.api_input,
        snapshot_id: planSnapshotId,
        snapshot_manifest_path: snapshotManifestPath
      }))
    };
  }

  const restoreSnapshotId = matchAdminCommandSnapshotRestorePath(input.pathname);
  if (input.method === "POST" && restoreSnapshotId) {
    const supervisorStatus = input.deps.read_preprocess_supervisor_status();
    const supervisorBlock = input.deps.restore_supervisor_block({
      command: "command-snapshot-restore",
      supervisor_state: supervisorStatus.state
    });
    if (supervisorBlock) {
      return {
        handled: true,
        status_code: 409,
        body: apiError(supervisorBlock.error_code, supervisorBlock.message)
      };
    }

    const snapshotManifestPath = await input.deps.resolve_snapshot_manifest_path({
      api_input: input.api_input,
      snapshot_id: restoreSnapshotId
    });
    if (!snapshotManifestPath) {
      return commandSnapshotNotFound();
    }

    const restoreInput = {
      api_input: input.api_input,
      snapshot_id: restoreSnapshotId,
      snapshot_manifest_path: snapshotManifestPath
    };
    const plan = await input.deps.plan_restore(restoreInput);
    if (!plan.can_restore) {
      return restoreBlockedResult({
        message: "命令快照恢复被阻断。",
        details: { plan }
      });
    }

    let restore: TRestoreResult;
    try {
      restore = await input.deps.run_restore(restoreInput);
    } catch (error) {
      const dockerMvpBlock = adminDockerMvpCommandBlockedRouteError(error);
      if (dockerMvpBlock) {
        return {
          handled: true,
          ...dockerMvpBlock
        };
      }

      throw error;
    }
    if (restore.status === "blocked") {
      return restoreBlockedResult({
        message: "命令快照恢复被阻断。",
        details: { restore }
      });
    }

    return {
      handled: true,
      status_code: 200,
      body: apiOk(restore)
    };
  }

  return { handled: false };
}
