import { createHash } from "node:crypto";
import { LibraryFormatError } from "./errors.ts";

export const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

export function sha256Hex(input: string | Uint8Array): string {
  const hash = createHash("sha256");
  hash.update(typeof input === "string" ? Buffer.from(input, "utf8") : input);
  return hash.digest("hex");
}

/** Canonical prefixed form used by file hashes: sha256:<64 lowercase hex>. */
export function sha256Prefixed(input: string | Uint8Array): string {
  return `sha256:${sha256Hex(input)}`;
}

export function normalizeSha256(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const bare = value.trim().toLowerCase().replace(/^sha256:/, "");
  return SHA256_HEX_PATTERN.test(bare) ? bare : null;
}

export function isSha256(value: unknown): boolean {
  return normalizeSha256(value) !== null;
}

export function assertSha256(value: unknown, label = "sha256"): string {
  const normalized = normalizeSha256(value);

  if (!normalized) {
    throw new LibraryFormatError("HASH_INVALID", `${label}必须是小写 64 位 sha256`, { label });
  }

  return normalized;
}
