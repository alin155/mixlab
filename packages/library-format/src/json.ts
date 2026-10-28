import { LibraryFormatError } from "./errors.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse JSON text; errors never echo raw content (may contain private paths/text). */
export function parseJsonText(text: unknown, label = "JSON 文件"): unknown {
  if (typeof text !== "string" || text.trim() === "") {
    throw new LibraryFormatError("FORMAT_INVALID", `${label}内容为空`, { label });
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new LibraryFormatError("FORMAT_INVALID", `${label}不是合法的 JSON`, { label });
  }
}

export function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new LibraryFormatError("FORMAT_INVALID", `${label}必须是 JSON 对象`, { label });
  }

  return value;
}

export function requireStringField(
  record: Record<string, unknown>,
  field: string,
  label: string,
  options: { allowEmpty?: boolean; maxLength?: number } = {}
): string {
  const value = record[field];
  const maxLength = options.maxLength ?? 4096;

  if (
    typeof value !== "string" ||
    value.includes("\0") ||
    value.length > maxLength ||
    (!options.allowEmpty && value.trim() === "")
  ) {
    throw new LibraryFormatError("FORMAT_INVALID", `${label}字段 ${field} 无效`, { label, field });
  }

  return value;
}

export function optionalStringField(
  record: Record<string, unknown>,
  field: string,
  label: string
): string | undefined {
  const value = record[field];

  if (value === undefined) {
    return undefined;
  }

  return requireStringField(record, field, label);
}

export function requireNonNegativeInteger(
  record: Record<string, unknown>,
  field: string,
  label: string
): number {
  const value = record[field];

  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new LibraryFormatError("FORMAT_INVALID", `${label}字段 ${field} 必须是非负整数`, { label, field });
  }

  return value as number;
}

export function requireBoolean(record: Record<string, unknown>, field: string, label: string): boolean {
  const value = record[field];

  if (typeof value !== "boolean") {
    throw new LibraryFormatError("FORMAT_INVALID", `${label}字段 ${field} 必须是布尔值`, { label, field });
  }

  return value;
}

export function requireStringArray(record: Record<string, unknown>, field: string, label: string): string[] {
  const value = record[field];

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new LibraryFormatError("FORMAT_INVALID", `${label}字段 ${field} 必须是字符串数组`, { label, field });
  }

  return value as string[];
}
