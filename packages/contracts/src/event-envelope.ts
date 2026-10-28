/**
 * Event Envelope v1: usage/analytics events are written locally first (outbox) and then
 * ingested in batches. event_id is the idempotency key; the server must deduplicate it.
 */
export const EVENT_ENVELOPE_SCHEMA_VERSION = "1.0";

export type MixlabEventTypeV1 =
  | "search"
  | "view_source_video"
  | "view_transcript"
  | "select_transcript_span"
  | "add_to_cut_list"
  | "submit_cut_job"
  | "cut_success"
  | "cut_failure"
  | "create_local_clip"
  | "reuse_local_clip";

export interface EventEnvelopeV1 {
  schema_version: "1.0";
  event_id: string;
  event_type: MixlabEventTypeV1;
  occurred_at: string;
  device_id: string;
  user_id: string;
  payload: Record<string, unknown>;
  client: {
    product: "cutter" | "smart-cutter" | "admin";
    version: string;
    contract_version: string;
  };
}

const EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const MAX_PAYLOAD_BYTES = 8192;

export function validateEventEnvelopeV1(value: unknown): EventEnvelopeV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("event envelope must be an object");
  }
  const event = value as Record<string, unknown>;
  if (event.schema_version !== EVENT_ENVELOPE_SCHEMA_VERSION) {
    throw new Error("event envelope schema_version must be 1.0");
  }
  if (typeof event.event_id !== "string" || !EVENT_ID_PATTERN.test(event.event_id)) {
    throw new Error("event envelope event_id must be a stable 8-128 char id");
  }
  if (typeof event.event_type !== "string") {
    throw new Error("event envelope event_type is required");
  }
  if (typeof event.occurred_at !== "string" || Number.isNaN(Date.parse(event.occurred_at))) {
    throw new Error("event envelope occurred_at must be an ISO timestamp");
  }
  for (const field of ["device_id", "user_id"] as const) {
    if (typeof event[field] !== "string") {
      throw new Error(`event envelope ${field} is required`);
    }
  }
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    throw new Error("event envelope payload must be an object");
  }
  if (Buffer.byteLength(JSON.stringify(event.payload), "utf8") > MAX_PAYLOAD_BYTES) {
    throw new Error("event envelope payload must be at most 8 KiB");
  }
  const client = event.client;
  if (!client || typeof client !== "object" || Array.isArray(client)) {
    throw new Error("event envelope client is required");
  }
  const clientRecord = client as Record<string, unknown>;
  for (const field of ["product", "version", "contract_version"] as const) {
    if (typeof clientRecord[field] !== "string") {
      throw new Error(`event envelope client.${field} is required`);
    }
  }
  return event as unknown as EventEnvelopeV1;
}
