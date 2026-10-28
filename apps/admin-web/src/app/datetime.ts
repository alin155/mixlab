const LEGACY_LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

export interface AdminDateTimeFormatOptions {
  withSeconds?: boolean;
  compact?: boolean;
  timeZone?: string;
  fallback?: string;
}

function padTwo(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatAdminLocalTimeZoneLabel(date = new Date()): string {
  const offsetMinutes = -date.getTimezoneOffset();

  if (offsetMinutes === 0) {
    return "UTC";
  }

  const sign = offsetMinutes > 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);

  return `UTC${sign}${padTwo(Math.floor(absolute / 60))}:${padTwo(absolute % 60)}`;
}

function intlParts(date: Date, timeZone?: string, withSeconds = false): { date: string; time: string; zone: string } {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    ...(timeZone ? { timeZone } : {}),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: false
  });
  const parts = new Map(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    date: `${parts.get("year") ?? "----"}-${parts.get("month") ?? "--"}-${parts.get("day") ?? "--"}`,
    time: `${parts.get("hour") ?? "--"}:${parts.get("minute") ?? "--"}${withSeconds ? `:${parts.get("second") ?? "--"}` : ""}`,
    zone: timeZone ?? formatAdminLocalTimeZoneLabel(date)
  };
}

/**
 * 统一时间展示：
 * - 服务端返回的“无时区本地时间字符串”（形如 2024-05-07 10:27:03）按原样展示；
 * - ISO 时间（带 Z 或偏移）转换为目标/本地时区，并在末尾标注时区；
 * - 非法值回退 fallback 或原字符串。
 */
export function formatAdminDateTime(value: string, options: AdminDateTimeFormatOptions = {}): string {
  const trimmed = (value ?? "").trim();
  const fallback = options.fallback ?? "—";

  if (!trimmed) {
    return fallback;
  }

  const legacyMatch = LEGACY_LOCAL_DATE_TIME_PATTERN.exec(trimmed);

  if (legacyMatch && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const [, year, month, day, hour, minute, second] = legacyMatch;

    if (!hour || !minute) {
      return options.compact ? `${month}-${day}` : `${year}-${month}-${day}`;
    }

    const time = options.withSeconds && second ? `${hour}:${minute}:${second}` : `${hour}:${minute}`;

    return options.compact ? `${month}-${day} ${time}` : `${year}-${month}-${day} ${time}`;
  }

  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  const parts = intlParts(date, options.timeZone, options.withSeconds ?? false);

  return options.compact
    ? `${parts.date.slice(5)} ${parts.time}（${parts.zone}）`
    : `${parts.date} ${parts.time}（${parts.zone}）`;
}

export function formatAdminEventTime(value: string): string {
  return formatAdminDateTime(value, { withSeconds: true });
}
