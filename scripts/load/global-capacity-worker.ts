/**
 * 0.19 跨进程全局容量协调 worker：50 个此类进程并发争抢同一 NAS 共享目录上的全局 slot。
 * 由 scripts/load/cutter-global-capacity-load.ts 以子进程方式启动。
 */
import { randomUUID } from "node:crypto";
import {
  GlobalCapacityAbortedError,
  GlobalCutCapacityCoordinator,
  GlobalCapacityUnavailableError,
  resolveGlobalCutCapacityConfig
} from "../../packages/cutter-local/src/cut-capacity-coordinator.ts";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("missing env " + name);
  return value;
}

async function main(): Promise<void> {
  const root = requiredEnv("MIXLAB_LOAD_GLOBAL_ROOT");
  const slots = Number.parseInt(process.env.MIXLAB_LOAD_GLOBAL_SLOTS ?? "4", 10);
  const holdMs = Number.parseInt(process.env.MIXLAB_LOAD_HOLD_MS ?? "300", 10);
  const coordinator = new GlobalCutCapacityCoordinator(
    resolveGlobalCutCapacityConfig({ root, max_slots: slots })
  );
  const clientId = process.env.MIXLAB_LOAD_CLIENT_ID ?? "worker-" + process.pid + "-" + randomUUID().slice(0, 8);

  try {
    const lease = await coordinator.acquire({ client_id: clientId, job_id: "job-" + clientId });
    const startedAt = Date.now();
    while (Date.now() - startedAt < holdMs) {
      const alive = await coordinator.heartbeat(lease);
      if (!alive) throw new Error("lease lost");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await coordinator.release(lease);
    process.stdout.write(JSON.stringify({ ok: true, client_id: clientId, slot: lease.slot_index }) + "\n");
  } catch (error) {
    if (error instanceof GlobalCapacityUnavailableError || error instanceof GlobalCapacityAbortedError) {
      process.stdout.write(JSON.stringify({ ok: false, unavailable: true, error: error.message }) + "\n");
      process.exitCode = 2;
      return;
    }
    throw error;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
