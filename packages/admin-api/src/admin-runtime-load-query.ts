import { spawnSync } from "node:child_process";
import { statfs } from "node:fs/promises";
import { cpus, freemem, loadavg, networkInterfaces, totalmem } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { preprocessDiskBlockUsagePercent } from "./admin-release-gates.ts";

export type RuntimeLoadStatus = "healthy" | "attention" | "blocked";

export interface RuntimeCpuTimesSample {
  idle_ms: number;
  total_ms: number;
}

export interface AdminRuntimeLoadMetricsDeps {
  cpu_times_sample?: () => RuntimeCpuTimesSample;
  sample_cpu_usage_percent?: () => Promise<number>;
  memory_total_bytes?: () => number;
  memory_available_bytes?: () => number;
  read_macos_memory_pressure_free_percent?: () => number | null;
  disk_usage?: (libraryRoot: string) => Promise<{ total: number; available: number }>;
  load_average_1m?: () => number;
  active_network_interface_count?: () => number;
  uptime_seconds?: () => number;
}

export interface GetAdminRuntimeLoadMetricsInput {
  library_root: string;
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  deps?: AdminRuntimeLoadMetricsDeps;
}

export function runtimeCpuUsagePercentFromSamples(
  previous: RuntimeCpuTimesSample,
  current: RuntimeCpuTimesSample
): number {
  const totalDelta = current.total_ms - previous.total_ms;
  const idleDelta = current.idle_ms - previous.idle_ms;

  if (totalDelta <= 0 || idleDelta < 0) {
    return 0;
  }

  const busyRatio = 1 - (idleDelta / totalDelta);
  return Math.min(100, Math.max(0, Math.round(busyRatio * 100)));
}

function runtimeCpuTimesSample(): RuntimeCpuTimesSample {
  return cpus().reduce<RuntimeCpuTimesSample>(
    (sample, cpu) => {
      const totalMs = Object.values(cpu.times).reduce((total, value) => total + value, 0);

      return {
        idle_ms: sample.idle_ms + cpu.times.idle,
        total_ms: sample.total_ms + totalMs
      };
    },
    { idle_ms: 0, total_ms: 0 }
  );
}

export async function sampleRuntimeCpuUsagePercent(
  deps: Pick<AdminRuntimeLoadMetricsDeps, "cpu_times_sample"> = {}
): Promise<number> {
  const cpuTimesSample = deps.cpu_times_sample ?? runtimeCpuTimesSample;
  const previous = cpuTimesSample();
  await delay(250);
  return runtimeCpuUsagePercentFromSamples(previous, cpuTimesSample());
}

export function runtimeMemoryMetricsFromMacosPressureLevel(input: {
  total_bytes: number;
  free_percent: number;
}): { total_bytes: number; used_bytes: number; available_bytes: number; usage_percent: number } {
  const freePercent = Math.min(100, Math.max(0, Math.round(input.free_percent)));
  const availableBytes = Math.round(input.total_bytes * (freePercent / 100));
  const usedBytes = Math.max(0, input.total_bytes - availableBytes);

  return {
    total_bytes: input.total_bytes,
    used_bytes: usedBytes,
    available_bytes: availableBytes,
    usage_percent: input.total_bytes > 0 ? Math.round((usedBytes / input.total_bytes) * 100) : 0
  };
}

function readMacosMemoryPressureFreePercent(): number | null {
  if (process.platform !== "darwin") {
    return null;
  }

  const result = spawnSync("sysctl", ["-n", "kern.memorystatus_level"], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return null;
  }

  const value = Number.parseInt(result.stdout.trim(), 10);
  return Number.isInteger(value) ? value : null;
}

function runtimeMemoryMetrics(
  deps: Pick<
    AdminRuntimeLoadMetricsDeps,
    "memory_total_bytes" | "memory_available_bytes" | "read_macos_memory_pressure_free_percent"
  > = {}
): {
  total_bytes: number;
  used_bytes: number;
  available_bytes: number;
  usage_percent: number;
} {
  const memoryTotal = deps.memory_total_bytes?.() ?? totalmem();
  const macosFreePercent = deps.read_macos_memory_pressure_free_percent
    ? deps.read_macos_memory_pressure_free_percent()
    : readMacosMemoryPressureFreePercent();

  if (macosFreePercent !== null) {
    return runtimeMemoryMetricsFromMacosPressureLevel({
      total_bytes: memoryTotal,
      free_percent: macosFreePercent
    });
  }

  const memoryAvailable = deps.memory_available_bytes?.() ?? freemem();
  const memoryUsed = Math.max(0, memoryTotal - memoryAvailable);

  return {
    total_bytes: memoryTotal,
    used_bytes: memoryUsed,
    available_bytes: memoryAvailable,
    usage_percent: memoryTotal > 0 ? Math.round((memoryUsed / memoryTotal) * 100) : 0
  };
}

function statusFromPercent(value: number, attentionAt: number, blockedAt: number): RuntimeLoadStatus {
  if (value >= blockedAt) {
    return "blocked";
  }

  if (value >= attentionAt) {
    return "attention";
  }

  return "healthy";
}

function worstRuntimeStatus(statuses: RuntimeLoadStatus[]): RuntimeLoadStatus {
  if (statuses.includes("blocked")) {
    return "blocked";
  }

  if (statuses.includes("attention")) {
    return "attention";
  }

  return "healthy";
}

function activeNetworkInterfaceCount(): number {
  return Object.values(networkInterfaces()).filter((entries) =>
    (entries ?? []).some((entry) => !entry.internal)
  ).length;
}

async function diskUsage(libraryRoot: string): Promise<{ total: number; available: number }> {
  try {
    const stats = await statfs(libraryRoot);
    return {
      total: Number(stats.blocks) * Number(stats.bsize),
      available: Number(stats.bavail) * Number(stats.bsize)
    };
  } catch {
    return {
      total: 0,
      available: 0
    };
  }
}

export async function getAdminRuntimeLoadMetrics(input: GetAdminRuntimeLoadMetricsInput) {
  const deps = input.deps ?? {};
  const now = input.now?.() ?? new Date().toISOString();
  const loadAverage1m = deps.load_average_1m?.() ?? loadavg()[0] ?? 0;
  const cpuUsagePercent = await (
    deps.sample_cpu_usage_percent?.() ?? sampleRuntimeCpuUsagePercent(deps)
  );
  const cpuStatus = statusFromPercent(cpuUsagePercent, 70, 90);

  const memory = runtimeMemoryMetrics(deps);
  const memoryUsagePercent = memory.usage_percent;
  const memoryStatus = statusFromPercent(memoryUsagePercent, 75, 90);

  const disk = await (deps.disk_usage?.(input.library_root) ?? diskUsage(input.library_root));
  const diskUsed = Math.max(0, disk.total - disk.available);
  const diskUsagePercent = disk.total > 0 ? Math.round((diskUsed / disk.total) * 100) : 0;
  const diskBlockedAt = preprocessDiskBlockUsagePercent(input.env ?? process.env);
  const diskStatus = statusFromPercent(diskUsagePercent, Math.max(1, diskBlockedAt - 12), diskBlockedAt);

  const activeInterfaceCount = deps.active_network_interface_count?.() ?? activeNetworkInterfaceCount();
  const networkStatus: RuntimeLoadStatus = activeInterfaceCount > 0 ? "healthy" : "blocked";
  const serviceStatus: RuntimeLoadStatus = "healthy";

  return {
    overall_status: worstRuntimeStatus([cpuStatus, memoryStatus, diskStatus, networkStatus, serviceStatus]),
    cpu: {
      usage_percent: cpuUsagePercent,
      load_average_1m: Number(loadAverage1m.toFixed(2)),
      status: cpuStatus,
      label: cpuStatus === "healthy" ? "负荷正常" : cpuStatus === "attention" ? "负荷偏高" : "负荷过高"
    },
    memory: {
      total_bytes: memory.total_bytes,
      used_bytes: memory.used_bytes,
      available_bytes: memory.available_bytes,
      usage_percent: memoryUsagePercent,
      status: memoryStatus,
      label: memoryStatus === "healthy" ? "内存充足" : memoryStatus === "attention" ? "内存偏紧" : "内存不足"
    },
    disk: {
      total_bytes: disk.total,
      available_bytes: disk.available,
      usage_percent: diskUsagePercent,
      status: diskStatus,
      label: diskStatus === "healthy" ? "空间充足" : diskStatus === "attention" ? "空间偏紧" : "空间不足"
    },
    network: {
      active_interface_count: activeInterfaceCount,
      status: networkStatus,
      label: activeInterfaceCount > 0 ? "网络可用" : "网络不可用"
    },
    service: {
      uptime_seconds: Math.round(deps.uptime_seconds?.() ?? process.uptime()),
      heartbeat_at: now,
      status: serviceStatus,
      label: "服务运行中"
    }
  };
}
