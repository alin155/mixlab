import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  buildAdminWorkerCycle,
  parseWorkerPollIntervalSeconds,
} from "../../packages/runtime-config/src/docker-worker.ts";
import { applyAdminRuntimeSecretsToEnv } from "../../packages/library-fs/src/index.ts";

function logEvent(event: Record<string, unknown>) {
  console.log(JSON.stringify({ time: new Date().toISOString(), ...event }));
}

const intervalSeconds = parseWorkerPollIntervalSeconds(process.env);

function optionalTrimmed(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

async function refreshRuntimeSecrets(): Promise<void> {
  const libraryRoot = optionalTrimmed(process.env.MIXLAB_ADMIN_LIBRARY_ROOT)
    ?? optionalTrimmed(process.env.MIXLAB_PREPROCESS_LIBRARY_ROOT);

  if (!libraryRoot) {
    return;
  }

  try {
    await applyAdminRuntimeSecretsToEnv(libraryRoot, process.env);
  } catch (error) {
    logEvent({
      event: "admin-runtime-secrets-error",
      message: error instanceof Error ? error.message : "failed to read runtime secrets",
    });
  }
}

logEvent({
  event: "admin-worker-loop-started",
  intervalSeconds,
});

while (true) {
  await refreshRuntimeSecrets();
  const commands = buildAdminWorkerCycle(process.env);
  for (const workerCommand of commands) {
    if (!workerCommand.enabled) {
      logEvent({ event: "worker-skipped", worker: workerCommand.name });
      continue;
    }

    logEvent({ event: "worker-started", worker: workerCommand.name, command: workerCommand.command.join(" ") });
    const result = spawnSync(workerCommand.command[0], workerCommand.command.slice(1), {
      env: process.env,
      stdio: "inherit",
    });

    if (result.error) {
      logEvent({ event: "worker-error", worker: workerCommand.name, message: result.error.message });
      continue;
    }

    logEvent({ event: "worker-finished", worker: workerCommand.name, exitCode: result.status ?? 0 });
  }

  await sleep(intervalSeconds * 1000);
}
