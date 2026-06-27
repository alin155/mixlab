import assert from "node:assert/strict";
import test from "node:test";
import {
  getAdminRuntimeLoadMetrics,
  runtimeCpuUsagePercentFromSamples,
  runtimeMemoryMetricsFromMacosPressureLevel
} from "./admin-runtime-load-query.ts";

test("runtime CPU load uses sampled busy time instead of load average saturation", () => {
  assert.equal(
    runtimeCpuUsagePercentFromSamples(
      { idle_ms: 1_000, total_ms: 10_000 },
      { idle_ms: 1_350, total_ms: 11_000 }
    ),
    65
  );
});

test("runtime memory load uses macOS memory pressure availability when present", () => {
  assert.deepEqual(
    runtimeMemoryMetricsFromMacosPressureLevel({
      total_bytes: 16_000,
      free_percent: 61
    }),
    {
      total_bytes: 16_000,
      available_bytes: 9_760,
      used_bytes: 6_240,
      usage_percent: 39
    }
  );
});

test("runtime load query projects status labels from injected system metrics", async () => {
  const metrics = await getAdminRuntimeLoadMetrics({
    library_root: "/tmp/mixlab-runtime-load",
    env: {
      MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT: "90"
    },
    now: () => "2026-06-27T00:00:00.000Z",
    deps: {
      async sample_cpu_usage_percent() {
        return 71;
      },
      load_average_1m() {
        return 3.456;
      },
      memory_total_bytes() {
        return 1000;
      },
      read_macos_memory_pressure_free_percent() {
        return null;
      },
      memory_available_bytes() {
        return 80;
      },
      async disk_usage() {
        return {
          total: 1000,
          available: 150
        };
      },
      active_network_interface_count() {
        return 0;
      },
      uptime_seconds() {
        return 12.2;
      }
    }
  });

  assert.equal(metrics.overall_status, "blocked");
  assert.equal(metrics.cpu.status, "attention");
  assert.equal(metrics.cpu.load_average_1m, 3.46);
  assert.equal(metrics.memory.status, "blocked");
  assert.equal(metrics.disk.status, "attention");
  assert.equal(metrics.network.status, "blocked");
  assert.equal(metrics.service.uptime_seconds, 12);
  assert.equal(metrics.service.heartbeat_at, "2026-06-27T00:00:00.000Z");
});
