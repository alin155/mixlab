import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { EventEnvelopeV1 } from "../../contracts/src/index.ts";
import {
  USAGE_SERVICE_MAX_BATCH_EVENTS,
  UsageServiceError,
  UsageServiceStore,
  acquireUsageServiceOwner,
  canonicalUsageEvent,
  prepareUsagePrivateRoot
} from "./usage-service-store.ts";
import { validateUsageEvent, type MixlabUsageEvent } from "./usage-events.ts";

const LEGACY_USAGE_EVENTS_RELATIVE_PATH = ".mixlab-library/usage-events/events.ndjson";
const LEGACY_CLIENT_CONTRACT_VERSION = "1.0.0";
const MAX_MALFORMED_SAMPLES = 20;
const IMPORT_CHUNK_SIZE = USAGE_SERVICE_MAX_BATCH_EVENTS;

export type UsageMigrationMode = "dry-run" | "apply";

export interface UsageMigrationProgress {
  stage: "reading" | "validating" | "importing";
  total_lines: number;
  processed_lines: number;
  valid_event_count: number;
  malformed_line_count: number;
}

export interface UsageMigrationMalformedSample {
  line: number;
  reason: string;
}

export interface LegacyUsageImportReport {
  mode: UsageMigrationMode;
  source_path: typeof LEGACY_USAGE_EVENTS_RELATIVE_PATH;
  source_digest: string;
  total_lines: number;
  blank_line_count: number;
  valid_event_count: number;
  malformed_line_count: number;
  malformed_samples: UsageMigrationMalformedSample[];
  duplicate_event_count: number;
  imported_event_count: number;
  already_imported: boolean;
  store_id: string;
  legacy_writers_stopped: boolean;
}

function digestText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function assertSeparateRoots(legacyRoot: string, stateRoot: string): void {
  const contains = (parent: string, child: string): boolean => {
    const relative = path.relative(parent, child);
    return relative === "" || (
      relative !== ".." &&
      !relative.startsWith(".." + path.sep) &&
      !path.isAbsolute(relative)
    );
  };

  if (
    !path.isAbsolute(legacyRoot) ||
    !path.isAbsolute(stateRoot) ||
    contains(legacyRoot, stateRoot) ||
    contains(stateRoot, legacyRoot)
  ) {
    throw new UsageServiceError(
      "VALIDATION_FAILED",
      "统计迁移需要两个互相独立的绝对路径（旧事件源与服务私有状态）"
    );
  }
}

function isEventEnvelopeShape(value: Record<string, unknown>): boolean {
  return value.schema_version === "1.0" &&
    typeof value.event_id === "string" &&
    typeof value.event_type === "string" &&
    typeof value.occurred_at === "string" &&
    typeof value.user_id === "string" &&
    typeof value.device_id === "string" &&
    Boolean(value.payload) &&
    typeof value.payload === "object" &&
    Boolean(value.client) &&
    typeof value.client === "object";
}

function legacyEventToEnvelope(
  value: Record<string, unknown>,
  lineNumber: number,
  sourceDigest: string
): EventEnvelopeV1 {
  const eventId = typeof value.event_id === "string" && value.event_id.trim()
    ? value.event_id.trim()
    : "legacy-" + digestText(sourceDigest + ":" + lineNumber).slice(0, 32);
  const event: MixlabUsageEvent = validateUsageEvent(
    { ...value, event_id: eventId },
    { require_event_id: true }
  );
  const payload: Record<string, unknown> = {
    username: event.username
  };

  for (const key of [
    "source_video_id",
    "cut_job_id",
    "query",
    "search_mode",
    "search_page_type",
    "result_status"
  ] as const) {
    const fieldValue = event[key];
    if (fieldValue !== undefined) {
      payload[key] = fieldValue;
    }
  }

  for (const key of ["search_elapsed_ms", "selected_duration_ms"] as const) {
    const fieldValue = event[key];
    if (fieldValue !== undefined) {
      payload[key] = fieldValue;
    }
  }

  return {
    schema_version: "1.0",
    event_id: event.event_id as string,
    event_type: event.event_type,
    occurred_at: event.occurred_at,
    device_id: event.device_id,
    user_id: event.user_id,
    payload,
    client: {
      product: "cutter",
      version: "legacy",
      contract_version: LEGACY_CLIENT_CONTRACT_VERSION
    }
  };
}

export async function readLegacyUsageEventsRaw(legacyRoot: string): Promise<{
  raw: string;
  digest: string;
  exists: boolean;
}> {
  const sourcePath = path.join(legacyRoot, LEGACY_USAGE_EVENTS_RELATIVE_PATH);
  let raw: string;

  try {
    raw = await readFile(sourcePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { raw: "", digest: digestText(""), exists: false };
    }
    throw new UsageServiceError("STORE_UNAVAILABLE", "旧统计事件文件读取失败", 500);
  }

  return { raw, digest: digestText(raw), exists: true };
}

function parseLegacyLines(input: {
  raw: string;
  sourceDigest: string;
  on_progress?: (progress: UsageMigrationProgress) => void;
}): {
  envelopes: EventEnvelopeV1[];
  total_lines: number;
  blank_line_count: number;
  valid_event_count: number;
  malformed_line_count: number;
  malformed_samples: UsageMigrationMalformedSample[];
  duplicate_event_count: number;
} {
  const rawLines = input.raw.split(/\r?\n/u);
  const envelopes: EventEnvelopeV1[] = [];
  const malformedSamples: UsageMigrationMalformedSample[] = [];
  const seenEventIds = new Set<string>();
  let totalLines = 0;
  let blankLineCount = 0;
  let validEventCount = 0;
  let malformedLineCount = 0;
  let duplicateEventCount = 0;

  for (const [index, line] of rawLines.entries()) {
    if (line.trim() === "") {
      blankLineCount += 1;
      continue;
    }

    totalLines += 1;
    const lineNumber = index + 1;

    try {
      const parsed = JSON.parse(line) as unknown;

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("事件必须是 JSON 对象");
      }

      const record = parsed as Record<string, unknown>;
      const envelope = isEventEnvelopeShape(record)
        ? record as unknown as EventEnvelopeV1
        : legacyEventToEnvelope(record, lineNumber, input.sourceDigest);
      canonicalUsageEvent(envelope);

      if (seenEventIds.has(envelope.event_id)) {
        duplicateEventCount += 1;
      } else {
        seenEventIds.add(envelope.event_id);
      }

      envelopes.push(envelope);
      validEventCount += 1;
    } catch (error) {
      malformedLineCount += 1;
      if (malformedSamples.length < MAX_MALFORMED_SAMPLES) {
        malformedSamples.push({
          line: lineNumber,
          reason: error instanceof Error ? error.message : "事件格式无效"
        });
      }
    }

    if (totalLines % 500 === 0) {
      input.on_progress?.({
        stage: "validating",
        total_lines: totalLines,
        processed_lines: totalLines,
        valid_event_count: validEventCount,
        malformed_line_count: malformedLineCount
      });
    }
  }

  return {
    envelopes,
    total_lines: totalLines,
    blank_line_count: blankLineCount,
    valid_event_count: validEventCount,
    malformed_line_count: malformedLineCount,
    malformed_samples: malformedSamples,
    duplicate_event_count: duplicateEventCount
  };
}

/**
 * Import legacy usage-events NDJSON into the isolated usage service state.
 * The legacy file is only read (never written/moved). Dry-run validates without creating state.
 */
export async function importLegacyUsageEvents(input: {
  legacy_root: string;
  state_root: string;
  mode: UsageMigrationMode;
  legacy_writers_stopped?: boolean;
  on_progress?: (progress: UsageMigrationProgress) => void;
}): Promise<LegacyUsageImportReport> {
  assertSeparateRoots(input.legacy_root, input.state_root);
  const legacyWritersStopped = input.legacy_writers_stopped === true;

  if (input.mode === "apply" && !legacyWritersStopped) {
    throw new UsageServiceError(
      "VALIDATION_FAILED",
      "应用迁移前必须确认旧事件写入者已停止（--legacy-writers-stopped）"
    );
  }

  const snapshot = await readLegacyUsageEventsRaw(input.legacy_root);
  input.on_progress?.({
    stage: "reading",
    total_lines: 0,
    processed_lines: 0,
    valid_event_count: 0,
    malformed_line_count: 0
  });
  const parsed = parseLegacyLines({
    raw: snapshot.raw,
    sourceDigest: snapshot.digest,
    ...(input.on_progress ? { on_progress: input.on_progress } : {})
  });

  if (input.mode === "dry-run") {
    return {
      mode: "dry-run",
      source_path: LEGACY_USAGE_EVENTS_RELATIVE_PATH,
      source_digest: snapshot.digest,
      total_lines: parsed.total_lines,
      blank_line_count: parsed.blank_line_count,
      valid_event_count: parsed.valid_event_count,
      malformed_line_count: parsed.malformed_line_count,
      malformed_samples: parsed.malformed_samples,
      duplicate_event_count: parsed.duplicate_event_count,
      imported_event_count: 0,
      already_imported: false,
      store_id: "",
      legacy_writers_stopped: legacyWritersStopped
    };
  }

  await prepareUsagePrivateRoot(input.state_root);
  const unlock = await acquireUsageServiceOwner(input.state_root);
  let store: UsageServiceStore;

  try {
    store = new UsageServiceStore(input.state_root);
  } catch (error) {
    unlock();
    throw error;
  }

  try {
    const existingImport = store.db.prepare(
      "SELECT digest FROM imports WHERE source_root = ?"
    ).get(input.legacy_root) as { digest: string } | undefined;
    const alreadyImported = existingImport?.digest === snapshot.digest;
    let importedEventCount = 0;
    let duplicateEventCount = parsed.duplicate_event_count;

    for (let start = 0; start < parsed.envelopes.length; start += IMPORT_CHUNK_SIZE) {
      const chunk = parsed.envelopes.slice(start, start + IMPORT_CHUNK_SIZE);
      const result = store.ingest(chunk, {
        root: input.legacy_root,
        digest: snapshot.digest,
        imported_at: new Date().toISOString()
      });
      importedEventCount += result.inserted;
      duplicateEventCount += result.duplicate_count;
      input.on_progress?.({
        stage: "importing",
        total_lines: parsed.total_lines,
        processed_lines: Math.min(start + chunk.length, parsed.envelopes.length),
        valid_event_count: parsed.valid_event_count,
        malformed_line_count: parsed.malformed_line_count
      });
    }

    if (parsed.envelopes.length === 0) {
      store.recordImportSource({
        root: input.legacy_root,
        digest: snapshot.digest,
        imported_at: new Date().toISOString()
      });
    }

    const after = await readLegacyUsageEventsRaw(input.legacy_root);

    if (after.digest !== snapshot.digest) {
      throw new UsageServiceError(
        "SOURCE_CHANGED",
        "旧事件源在迁移过程中发生变化，请停止写入后重试",
        409
      );
    }

    return {
      mode: "apply",
      source_path: LEGACY_USAGE_EVENTS_RELATIVE_PATH,
      source_digest: snapshot.digest,
      total_lines: parsed.total_lines,
      blank_line_count: parsed.blank_line_count,
      valid_event_count: parsed.valid_event_count,
      malformed_line_count: parsed.malformed_line_count,
      malformed_samples: parsed.malformed_samples,
      duplicate_event_count: duplicateEventCount,
      imported_event_count: importedEventCount,
      already_imported: alreadyImported,
      store_id: store.id,
      legacy_writers_stopped: legacyWritersStopped
    };
  } finally {
    store.close();
    unlock();
  }
}
