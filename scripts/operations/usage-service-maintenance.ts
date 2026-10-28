import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  UsageServiceError,
  UsageServiceStore,
  acquireUsageServiceOwner,
  resolveUsageServiceCapacityConfig,
  type UsageServiceMaintenanceStatus,
  type UsageServicePruneResult
} from "../../packages/library-fs/src/usage-service-store.ts";

export interface UsageMaintenanceReport {
  operation: "prune" | "status";
  store_id: string;
  total_events: number;
  retention_days: number;
  max_events: number;
  maintenance: UsageServicePruneResult | null;
  status: UsageServiceMaintenanceStatus | null;
}

export interface UsageMaintenanceInput {
  state_root: string;
  operation: "prune" | "status";
  mode: "dry-run" | "apply";
  retention_days?: number;
  max_events?: number;
  compact?: boolean;
}

function parseNonNegativeInteger(raw: string, label: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new UsageServiceError("VALIDATION_FAILED", label + " 必须是非负整数");
  }

  return Number.parseInt(raw, 10);
}

export function parseUsageMaintenanceArgs(argv: string[]): UsageMaintenanceInput {
  const [operation, stateRoot, ...rest] = argv;

  if ((operation !== "prune" && operation !== "status") || !stateRoot) {
    throw new UsageServiceError(
      "VALIDATION_FAILED",
      "用法：prune <state_root> [--dry-run|--apply] [--retention-days N] [--max-events N] [--compact] | status <state_root>"
    );
  }

  const input: UsageMaintenanceInput = {
    state_root: stateRoot,
    operation,
    mode: "dry-run"
  };

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index] as string;

    if (argument === "--apply") {
      input.mode = "apply";
      continue;
    }
    if (argument === "--dry-run") {
      input.mode = "dry-run";
      continue;
    }
    if (argument === "--compact") {
      input.compact = true;
      continue;
    }
    if (argument === "--retention-days") {
      input.retention_days = parseNonNegativeInteger(rest[index + 1] ?? "", "--retention-days");
      index += 1;
      continue;
    }
    if (argument === "--max-events") {
      input.max_events = parseNonNegativeInteger(rest[index + 1] ?? "", "--max-events");
      index += 1;
      continue;
    }

    throw new UsageServiceError("VALIDATION_FAILED", "未知参数：" + argument);
  }

  return input;
}

/**
 * Maintenance CLI helper. `prune` requires exclusive ownership (stop the service first);
 * `status` is read-only and can inspect a live service WAL database.
 */
export async function runUsageServiceMaintenance(
  input: UsageMaintenanceInput
): Promise<UsageMaintenanceReport> {
  const capacity = resolveUsageServiceCapacityConfig(process.env);
  const retentionDays = input.retention_days ?? capacity.retention_days;
  const maxEvents = input.max_events ?? capacity.max_events;

  if (input.operation === "status") {
    let store: UsageServiceStore;

    try {
      store = new UsageServiceStore(input.state_root, {
        retention_days: retentionDays,
        max_events: maxEvents,
        auto_prune: false,
        read_only: true
      });
    } catch {
      throw new UsageServiceError(
        "STORE_UNAVAILABLE",
        "统计服务状态不存在或不可读，请先启动服务/执行迁移",
        404
      );
    }

    try {
      const status = store.maintenanceStatus();
      return {
        operation: "status",
        store_id: status.store_id,
        total_events: status.total_events,
        retention_days: status.retention_days,
        max_events: status.max_events,
        maintenance: status.last_maintenance,
        status
      };
    } finally {
      store.close();
    }
  }

  const unlock = await acquireUsageServiceOwner(input.state_root);
  let store: UsageServiceStore;

  try {
    store = new UsageServiceStore(input.state_root, {
      retention_days: retentionDays,
      max_events: maxEvents,
      auto_prune: false
    });
  } catch (error) {
    unlock();
    throw error;
  }

  try {
    const maintenance = store.prune({
      mode: input.mode,
      retention_days: retentionDays,
      max_events: maxEvents,
      ...(input.compact ? { compact: true } : {})
    });
    const status = store.maintenanceStatus();

    return {
      operation: "prune",
      store_id: store.id,
      total_events: status.total_events,
      retention_days: status.retention_days,
      max_events: status.max_events,
      maintenance,
      status
    };
  } finally {
    store.close();
    unlock();
  }
}

export async function runUsageServiceMaintenanceCli(argv: string[]): Promise<number> {
  try {
    const input = parseUsageMaintenanceArgs(argv);
    const report = await runUsageServiceMaintenance(input);
    console.log(JSON.stringify(report, null, 2));
    return 0;
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      code: (error as { code?: string }).code ?? "usage_maintenance_failed"
    }));
    return 1;
  }
}

const isDirectRun = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  process.exitCode = await runUsageServiceMaintenanceCli(process.argv.slice(2));
}
