import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SHARE_ROOT = "/Users/huaqihang/Public/MixLabWindowsBuilds";
const ALLOWED_ACTIONS = new Set([
  "ping",
  "collect_logs",
  "probe_api",
  "capture_screenshot",
  "stop_app",
  "launch_app",
  "install_latest",
  "install_latest_and_smoke",
  "smoke_test",
  "restart_agent",
  "restart_watchdog"
]);

interface CommandPayload {
  schema_version: "1.0";
  command_id: string;
  action: string;
  payload: Record<string, unknown>;
}

function usage(): string {
  return [
    "Usage:",
    "  tsx scripts/desktop/issue-windows-shared-command.ts <action> [--share-root <path>] [--command-id <id>] [--payload-json <json>]",
    "",
    `Default share root: ${DEFAULT_SHARE_ROOT}`,
    `Allowed actions: ${[...ALLOWED_ACTIONS].join(", ")}`
  ].join("\n");
}

function parseArgs(argv: string[]): {
  action: string;
  shareRoot: string;
  commandId?: string;
  payload: Record<string, unknown>;
} {
  const [action, ...rest] = argv;
  if (!action || action === "--help" || action === "-h") {
    throw new Error(usage());
  }
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error(`Unsupported action "${action}".\n${usage()}`);
  }

  let shareRoot = DEFAULT_SHARE_ROOT;
  let commandId: string | undefined;
  let payload: Record<string, unknown> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const next = rest[index + 1];
    if (arg === "--share-root") {
      if (!next) {
        throw new Error("--share-root requires a path");
      }
      shareRoot = next;
      index += 1;
      continue;
    }
    if (arg === "--command-id") {
      if (!next) {
        throw new Error("--command-id requires a value");
      }
      commandId = next;
      index += 1;
      continue;
    }
    if (arg === "--payload-json") {
      if (!next) {
        throw new Error("--payload-json requires a JSON object");
      }
      const parsed = JSON.parse(next) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("--payload-json must be a JSON object");
      }
      payload = parsed as Record<string, unknown>;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }

  return {
    action,
    shareRoot,
    commandId,
    payload
  };
}

function defaultCommandId(action: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${action}-${stamp}`;
}

async function writeCommand(input: {
  action: string;
  shareRoot: string;
  commandId?: string;
  payload: Record<string, unknown>;
}): Promise<{ commandPath: string; queueCommandPath: string; command: CommandPayload }> {
  const controlDir = path.join(input.shareRoot, "control");
  const queueDir = path.join(controlDir, "commands");
  await mkdir(controlDir, { recursive: true });
  await mkdir(queueDir, { recursive: true });
  const commandPath = path.join(controlDir, "cutter-command.json");
  const command: CommandPayload = {
    schema_version: "1.0",
    command_id: input.commandId ?? defaultCommandId(input.action),
    action: input.action,
    payload: input.payload
  };
  const commandText = `${JSON.stringify(command, null, 2)}\n`;
  const safeCommandId = command.command_id.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const queueCommandPath = path.join(queueDir, `${safeCommandId}.json`);
  const queueTempPath = `${queueCommandPath}.${process.pid}.tmp`;
  await writeFile(queueTempPath, commandText, "utf8");
  try {
    await rename(queueTempPath, queueCommandPath);
  } catch (error) {
    await rm(queueTempPath, { force: true });
    throw error;
  }

  const legacyTempPath = `${commandPath}.${process.pid}.tmp`;
  await writeFile(legacyTempPath, commandText, "utf8");
  try {
    await rename(legacyTempPath, commandPath);
  } catch {
    await rm(legacyTempPath, { force: true });
  }

  return { commandPath, queueCommandPath, command };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const { commandPath, queueCommandPath, command } = await writeCommand(parsed);
  console.log(JSON.stringify({
    ok: true,
    command_path: commandPath,
    queue_command_path: queueCommandPath,
    command_id: command.command_id,
    action: command.action
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
