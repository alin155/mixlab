/** Capability table v1: server advertises features and limits; clients must degrade explicitly. */
export const CONTRACT_VERSION = "1.0.0";

export interface CapabilityTableV1 {
  contract_version: string;
  server_version: string;
  server_product: "admin" | "cutter" | "smart-cutter";
  min_client_version: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  generated_at: string;
}

export const DEFAULT_CAPABILITY_LIMITS = {
  event_batch_max: 100,
  page_max: 200,
  upload_max_bytes: 16 * 1024 * 1024,
  request_body_max_bytes: 1024 * 1024
} as const;

export function isCapabilityTableV1(value: unknown): value is CapabilityTableV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.contract_version === "string" &&
    typeof candidate.server_version === "string" &&
    typeof candidate.server_product === "string" &&
    typeof candidate.min_client_version === "string" &&
    candidate.features !== null &&
    typeof candidate.features === "object" &&
    !Array.isArray(candidate.features) &&
    Object.values(candidate.features as Record<string, unknown>).every((value) => typeof value === "boolean") &&
    candidate.limits !== null &&
    typeof candidate.limits === "object" &&
    !Array.isArray(candidate.limits) &&
    Object.values(candidate.limits as Record<string, unknown>).every((value) => typeof value === "number" && Number.isFinite(value)) &&
    typeof candidate.generated_at === "string"
  );
}

/** A client that does not understand a capability must not guess; it degrades to the legacy path. */
export function capabilityEnabled(table: CapabilityTableV1 | null | undefined, feature: string): boolean {
  return Boolean(table?.features?.[feature]);
}
