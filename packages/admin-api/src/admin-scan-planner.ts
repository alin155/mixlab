import {
  previewSourceVideoScan,
  AdminWriterLeaseError,
  type SourceVideoScanPreviewResult
} from "../../library-fs/src/index.ts";
import {
  adminCommandContract,
  adminCommandRequiresScanPreview
} from "./admin-command-guard.ts";
import {
  runAdminLibraryScanCommand,
  type AdminLibraryScanCommandResult
} from "./admin-library-commands.ts";
import type { AdminCommandActor } from "./admin-command-audit.ts";

interface AdminLibraryScanPlannerContext {
  library_root: string;
  library_id: string;
  library_name: string;
  command_now: string;
  now?: () => string;
  actor?: AdminCommandActor;
}

export class AdminScanApplyBlockedError extends Error {
  readonly code = "scan_blocked";

  constructor(message: string, readonly preview: SourceVideoScanPreviewResult) {
    super(message);
    this.name = "AdminScanApplyBlockedError";
  }
}

function currentTime(input: AdminLibraryScanPlannerContext): string {
  return input.now ? input.now() : input.command_now;
}

export async function runAdminLibraryScanPreviewCommand(
  input: AdminLibraryScanPlannerContext
): Promise<SourceVideoScanPreviewResult> {
  const scanNow = currentTime(input);
  return previewSourceVideoScan({
    library_root: input.library_root,
    library_id: input.library_id,
    library_name: input.library_name,
    now: scanNow
  });
}

export async function runAdminLibraryScanApplyCommand(
  input: AdminLibraryScanPlannerContext
): Promise<AdminLibraryScanCommandResult> {
  const command = adminCommandContract("library-scan");

  try {
    return await runAdminLibraryScanCommand(input);
  } catch (error) {
    if (error instanceof AdminWriterLeaseError || !adminCommandRequiresScanPreview(command.command)) {
      throw error;
    }

    const preview = await runAdminLibraryScanPreviewCommand(input);
    if (!preview.blocked) {
      throw error;
    }

    throw new AdminScanApplyBlockedError(
      error instanceof Error ? error.message : "扫描被保护模式阻断",
      preview
    );
  }
}
