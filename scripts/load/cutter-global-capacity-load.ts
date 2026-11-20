/**
 * 0.19 跨进程全局容量门禁：50 个独立 Node 进程（等价 50 台剪辑师客户端）争抢同一 NAS 共享目录 slot。
 *
 * 用法：
 *   node --import tsx scripts/load/cutter-global-capacity-load.ts --clients=50 --slots=4 --hold-ms=300 --report=docs/operations/xxx
 *
 * 通过条件（本地/等价环境）：50 进程全部完成；全局 active 峰值 <= slots；出现排队；结束无 lease/queue 残留。
 * 真实 0.19 发布门禁仍需 Windows 构建机 + 真实 NAS 10 分钟 50 客户端压测签字；0.18.34 不发布。
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GlobalCutCapacityCoordinator,
  resolveGlobalCutCapacityConfig
} from "../../packages/cutter-local/src/cut-capacity-coordinator.ts";

function argValue(name: string, fallback: number): number {
  const match = process.argv.find((value) => value.startsWith("--" + name + "="));
  const parsed = match ? Number.parseInt(match.split("=")[1] ?? "", 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function argString(name: string): string | undefined {
  const match = process.argv.find((value) => value.startsWith("--" + name + "="));
  return match ? match.split("=").slice(1).join("=") : undefined;
}
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CLIENTS = argValue("clients", 50);
const SLOTS = argValue("slots", 4);
const HOLD_MS = argValue("hold-ms", 300);
const REPORT = argString("report");

async function main(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mixlab-global-process-load-"));
  const workerPath = fileURLToPath(new URL("./global-capacity-worker.ts", import.meta.url));
  const coordinator = new GlobalCutCapacityCoordinator(
    resolveGlobalCutCapacityConfig({ root, max_slots: SLOTS, env: {} })
  );
  await coordinator.ensureAvailable();
  const startedAt = Date.now();
  const cpuStart = process.cpuUsage();
  const children = Array.from({ length: CLIENTS }, (_, index) =>
    spawn(process.execPath, ["--import", "tsx", workerPath], {
      env: {
        ...process.env,
        MIXLAB_LOAD_GLOBAL_ROOT: root,
        MIXLAB_LOAD_GLOBAL_SLOTS: String(SLOTS),
        MIXLAB_LOAD_HOLD_MS: String(HOLD_MS),
        MIXLAB_LOAD_CLIENT_ID: "cutter-" + (index + 1)
      },
      stdio: ["ignore", "pipe", "pipe"]
    })
  );

  let peakActive = 0;
  let peakWaiting = 0;
  let polling = true;
  const poller = (async () => {
    while (polling) {
      const snapshot = await coordinator.snapshot();
      peakActive = Math.max(peakActive, snapshot.active_count);
      peakWaiting = Math.max(peakWaiting, snapshot.waiting_count);
      await delay(40);
    }
  })();

  const results = await Promise.all(
    children.map(
      (child) =>
        new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
          let stdout = "";
          let stderr = "";
          child.stdout?.on("data", (chunk) => (stdout += String(chunk)));
          child.stderr?.on("data", (chunk) => (stderr += String(chunk)));
          child.on("close", (code) => resolve({ code, stdout, stderr }));
        })
    )
  );
  polling = false;
  await poller;

  const finalSnapshot = await coordinator.snapshot();
  const wallMs = Date.now() - startedAt;
  const cpu = process.cpuUsage(cpuStart);
  const okCount = results.filter((result) => result.code === 0).length;
  const failed = results.filter((result) => result.code !== 0);
  const slotFiles = (await readdir(path.join(root, "slots"))).filter((name) => name.endsWith(".lock"));
  const queueFiles = (await readdir(path.join(root, "queue"))).filter((name) => name.endsWith(".json"));
  const pass =
    okCount === CLIENTS &&
    peakActive <= SLOTS &&
    peakActive >= 1 &&
    peakWaiting >= 1 &&
    finalSnapshot.active_count === 0 &&
    finalSnapshot.waiting_count === 0 &&
    slotFiles.length === 0 &&
    queueFiles.length === 0;
  const report = {
    generated_at: new Date().toISOString(),
    kind: "cross-process-global-capacity",
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      clients: CLIENTS,
      global_slots: SLOTS,
      hold_ms: HOLD_MS
    },
    global_capacity: {
      peak_active: peakActive,
      peak_waiting: peakWaiting,
      final_active: finalSnapshot.active_count,
      final_waiting: finalSnapshot.waiting_count,
      leftover_slot_files: slotFiles.length,
      leftover_queue_files: queueFiles.length
    },
    workers: { succeeded: okCount, failed: failed.length, failed_samples: failed.slice(0, 3).map((item) => item.stderr.slice(0, 500)) },
    resources: { wall_ms: wallMs, cpu_user_ms: Math.round(cpu.user / 1000), cpu_system_ms: Math.round(cpu.system / 1000) },
    gate: {
      cross_process_smoke_pass: pass,
      release_gate: "0.19 发布门禁未通过：需 Windows 构建机 + 真实 NAS 10 分钟 50 客户端压测报告并签字；0.18.34 不发布"
    }
  };
  const markdown = [
    "# 0.19 跨进程全局容量 smoke（" + report.generated_at + "）",
    "",
    "- 环境：" + JSON.stringify(report.environment) + "（50 个独立 Node 进程争抢同一共享目录 slot，等价 50 剪辑师客户端）",
    "- 全局容量：active 峰值 **" + peakActive + "/" + SLOTS + "**，等待峰值 " + peakWaiting + "，结束 active " + finalSnapshot.active_count + "，残留 slot/queue 文件 " + slotFiles.length + "/" + queueFiles.length,
    "- worker：" + okCount + "/" + CLIENTS + " 成功，失败 " + failed.length,
    "- 资源：wall " + wallMs + "ms，CPU user " + report.resources.cpu_user_ms + "ms / sys " + report.resources.cpu_system_ms + "ms",
    "- 跨进程 smoke：**" + (pass ? "PASS" : "FAIL") + "**",
    "- 发布门禁：**BLOCKED** —— " + report.gate.release_gate,
    "",
    "> 真实门禁：Windows 构建机 + 真实 NAS 公共库共享目录、50 客户端、10 分钟搜索 + 50 剪切，搜索 p95<150ms、全局 active 峰值≤配置 slot、无租约泄漏、searchd 不重启循环，并由测试负责人签字。"
  ].join("\n");
  console.log(JSON.stringify(report, null, 2));
  if (REPORT) {
    const base = REPORT.replace(/\.json$/, "");
    await mkdir(path.dirname(base), { recursive: true });
    await writeFile(base + ".json", JSON.stringify(report, null, 2));
    await writeFile(base + ".md", markdown + "\n");
    console.log("report written to " + base);
  }
  if (!pass) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
