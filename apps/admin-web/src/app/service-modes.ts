export type AdminServiceMode = "legacy" | "service" | "unknown";
export type AdminServiceModeSource = "capabilities" | "health" | "default";

export interface AdminServiceModeDescriptor {
  mode: AdminServiceMode;
  mode_label: string;
  migration_status: string;
  migration_label: string;
  migrated_count?: number;
  pending_count?: number;
  legacy_write_enabled?: boolean;
  notes: string[];
}

export interface AdminServiceModes {
  source: AdminServiceModeSource;
  accounts: AdminServiceModeDescriptor;
  usage: AdminServiceModeDescriptor;
  generated_at?: string;
}

const MODE_LABELS: Record<AdminServiceMode, string> = {
  legacy: "旧共享文件模式",
  service: "独立服务模式",
  unknown: "模式未知"
};

const MIGRATION_LABELS: Record<string, string> = {
  done: "迁移完成",
  complete: "迁移完成",
  completed: "迁移完成",
  migrated: "迁移完成",
  in_progress: "迁移中",
  running: "迁移中",
  pending: "待迁移",
  not_started: "未开始迁移",
  not_required: "无需迁移",
  required: "需要迁移",
  failed: "迁移失败",
  blocked: "迁移受阻",
  unknown: "迁移状态未知"
};

export function adminServiceModeLabel(mode: AdminServiceMode): string {
  return MODE_LABELS[mode];
}

export function adminMigrationStatusLabel(status: string): string {
  const normalized = status.trim().toLowerCase();
  return MIGRATION_LABELS[normalized] ?? (normalized ? `迁移状态：${status}` : "迁移状态未知");
}

function normalizeMode(value: unknown): AdminServiceMode {
  if (typeof value !== "string") {
    return "unknown";
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "service" || normalized === "services" || normalized === "service-v1" ||
    normalized === "server" || normalized === "v1" || normalized === "split") {
    return "service";
  }

  if (normalized === "legacy" || normalized === "file" || normalized === "files" ||
    normalized === "shared-file" || normalized === "shared_file" || normalized === "manifest") {
    return "legacy";
  }

  return "unknown";
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function firstBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDescriptor(entry: unknown, fallbackNote: string): AdminServiceModeDescriptor {
  if (typeof entry === "string") {
    const mode = normalizeMode(entry);
    return {
      mode,
      mode_label: MODE_LABELS[mode],
      migration_status: "",
      migration_label: "迁移状态未知",
      notes: mode === "unknown" ? [`服务端返回了无法识别的模式值「${entry}」`] : []
    };
  }

  if (!isRecord(entry)) {
    return {
      mode: "legacy",
      mode_label: MODE_LABELS.legacy,
      migration_status: "unknown",
      migration_label: MIGRATION_LABELS.unknown,
      notes: [fallbackNote]
    };
  }

  const mode = normalizeMode(
    entry.mode ?? entry.service_mode ?? entry.serviceMode ?? entry.mode_name ??
    entry.backend ?? entry.storage ?? entry.kind ?? entry.type
  );
  const migrationStatus = firstString(
    entry.migration_status,
    entry.migrationStatus,
    entry.migration_state,
    entry.migration,
    entry.migrated_status
  );
  const notes = [
    ...(Array.isArray(entry.notes) ? entry.notes.filter((note): note is string => typeof note === "string") : []),
    ...(typeof entry.message === "string" && entry.message.trim() ? [entry.message.trim()] : []),
    ...(mode === "unknown" ? [fallbackNote] : [])
  ];

  return {
    mode,
    mode_label: MODE_LABELS[mode],
    migration_status: migrationStatus,
    migration_label: adminMigrationStatusLabel(migrationStatus),
    ...(firstNumber(entry.migrated_count, entry.migration_completed_count, entry.service_record_count) !== undefined
      ? { migrated_count: firstNumber(entry.migrated_count, entry.migration_completed_count, entry.service_record_count) }
      : {}),
    ...(firstNumber(entry.pending_count, entry.migration_pending_count, entry.legacy_record_count) !== undefined
      ? { pending_count: firstNumber(entry.pending_count, entry.migration_pending_count, entry.legacy_record_count) }
      : {}),
    ...(firstBoolean(entry.legacy_write_enabled, entry.legacy_writers_enabled, entry.legacy_writes_enabled, entry.has_legacy_writers) !== undefined
      ? { legacy_write_enabled: firstBoolean(entry.legacy_write_enabled, entry.legacy_writers_enabled, entry.legacy_writes_enabled, entry.has_legacy_writers) }
      : {}),
    notes
  };
}

interface LocatedServiceEntry {
  accounts?: unknown;
  usage?: unknown;
  generated_at?: string;
}

function locateServiceEntries(candidate: unknown): LocatedServiceEntry | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const containers: Record<string, unknown>[] = [candidate];
  for (const key of ["services", "service_modes", "serviceModes", "service_status", "serviceStatus", "data"]) {
    const nested = candidate[key];
    if (isRecord(nested)) {
      containers.push(nested);
    }
  }

  let located: LocatedServiceEntry | null = null;

  for (const container of containers) {
    const accounts = container.accounts_service ?? container.accountsService ?? container.accounts;
    const usage = container.usage_service ?? container.usageService ?? container.usage;

    if (accounts !== undefined || usage !== undefined) {
      located = {
        ...(accounts !== undefined ? { accounts } : {}),
        ...(usage !== undefined ? { usage } : {}),
        ...(firstString(candidate.generated_at, candidate.generatedAt)
          ? { generated_at: firstString(candidate.generated_at, candidate.generatedAt) }
          : {})
      };
      break;
    }
  }

  return located;
}

function defaultDescriptor(note: string): AdminServiceModeDescriptor {
  return {
    mode: "legacy",
    mode_label: MODE_LABELS.legacy,
    migration_status: "unknown",
    migration_label: MIGRATION_LABELS.unknown,
    notes: [note]
  };
}

function mergeLocated(
  located: LocatedServiceEntry,
  source: AdminServiceModeSource
): Omit<AdminServiceModes, "accounts" | "usage"> & { accounts: AdminServiceModeDescriptor; usage: AdminServiceModeDescriptor } {
  return {
    source,
    accounts: located.accounts !== undefined
      ? parseDescriptor(located.accounts, "服务端未提供账号服务模式详情，按旧共享文件模式处理。")
      : defaultDescriptor("服务端未提供账号服务模式信息，按旧共享文件模式处理。"),
    usage: located.usage !== undefined
      ? parseDescriptor(located.usage, "服务端未提供事件服务模式详情，按旧共享文件模式处理。")
      : defaultDescriptor("服务端未提供事件服务模式信息，按旧共享文件模式处理。"),
    ...(located.generated_at ? { generated_at: located.generated_at } : {})
  };
}

/**
 * 从 capabilities 与 /health 返回中解析账号/事件服务模式与迁移状态。
 * 优先级：capabilities → health → 缺省旧共享文件模式（不阻塞页面）。
 */
export function parseAdminServiceModes(input: {
  capabilities?: unknown;
  health?: unknown;
}): AdminServiceModes {
  const capabilityEntries = locateServiceEntries(input.capabilities);

  if (capabilityEntries) {
    return mergeLocated(capabilityEntries, "capabilities");
  }

  const healthEntries = locateServiceEntries(input.health);

  if (healthEntries) {
    return mergeLocated(healthEntries, "health");
  }

  return {
    source: "default",
    accounts: defaultDescriptor("服务端未提供账号服务模式信息，按旧共享文件模式运行。"),
    usage: defaultDescriptor("服务端未提供事件服务模式信息，按旧共享文件模式运行。")
  };
}

export interface AdminServiceModeRow {
  label: string;
  value: string;
}

export function adminServiceModeRows(messages: AdminServiceModes): AdminServiceModeRow[] {
  const sourceLabel = messages.source === "capabilities"
    ? "服务端 capabilities"
    : messages.source === "health"
      ? "服务端 health"
      : "缺省（服务端未提供模式信息）";
  const detail = (descriptor: AdminServiceModeDescriptor): string => {
    const parts = [descriptor.mode_label, descriptor.migration_label];

    if (descriptor.migrated_count !== undefined) {
      parts.push(`已迁移 ${descriptor.migrated_count} 条`);
    }
    if (descriptor.pending_count !== undefined && descriptor.pending_count > 0) {
      parts.push(`待迁移 ${descriptor.pending_count} 条`);
    }
    if (descriptor.legacy_write_enabled === true) {
      parts.push("仍有旧共享文件写入");
    }

    return parts.join(" · ");
  };

  return [
    { label: "账号服务模式", value: detail(messages.accounts) },
    { label: "事件服务模式", value: detail(messages.usage) },
    { label: "模式来源", value: sourceLabel },
    ...(messages.generated_at ? [{ label: "采集时间", value: messages.generated_at }] : [])
  ];
}

export function adminServiceModesSummary(messages: AdminServiceModes): string {
  return `账号：${messages.accounts.mode_label}（${messages.accounts.migration_label}）；事件：${messages.usage.mode_label}（${messages.usage.migration_label}）`;
}

export function adminServiceModesProvided(messages: AdminServiceModes): boolean {
  return messages.source !== "default";
}
