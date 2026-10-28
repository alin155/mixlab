import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { EventEnvelopeV1 } from "../../contracts/src/index.ts";
import { importLegacyUsageEvents } from "../../library-fs/src/usage-service-migration.ts";
import { UsageServiceStore } from "../../library-fs/src/usage-service-store.ts";
import {
  parseUsageMaintenanceArgs,
  runUsageServiceMaintenance
} from "../../../scripts/operations/usage-service-maintenance.ts";
import {
  runUsageServiceMigrationCli,
  verifyMigratedUsageMetrics
} from "../../../scripts/operations/usage-service-migration.ts";

async function makeRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

function envelope(input: {
  event_id: string;
  occurred_at?: string;
  payload?: Record<string, unknown>;
}): EventEnvelopeV1 {
  return {
    schema_version: "1.0",
    event_id: input.event_id,
    event_type: "search",
    occurred_at: input.occurred_at ?? "2026-10-27T00:00:00.000Z",
    device_id: "device-1",
    user_id: "CU000001",
    payload: input.payload ?? { username: "小王", query: "现金流", result_status: "success" },
    client: { product: "cutter", version: "0.1.0", contract_version: "1.0.0" }
  };
}

function legacyLine(eventId: string | undefined, occurredAt: string): string {
  return JSON.stringify({
    ...(eventId ? { event_id: eventId } : {}),
    user_id: "CU000001",
    username: "小王",
    device_id: "device-1",
    event_type: "search",
    occurred_at: occurredAt,
    query: "现金流",
    result_status: "success"
  });
}

async function writeLegacyEvents(legacyRoot: string, lines: string[]): Promise<void> {
  const targetDir = path.join(legacyRoot, ".mixlab-library", "usage-events");
  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, "events.ndjson"), lines.join("\n") + "\n", "utf8");
}

async function withSuppressedConsole<T>(operation: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => undefined;
  console.error = () => undefined;

  try {
    return await operation();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

test("maintenance CLI helper supports read-only status, dry-run and apply pruning", async () => {
  const stateRoot = await makeRoot("mixlab-usage-maintenance-cli-");
  const seed = new UsageServiceStore(stateRoot, {
    retention_days: 0,
    max_events: 0,
    auto_prune: false
  });
  seed.ingest([
    envelope({ event_id: "evt-cli-old", occurred_at: "2026-09-01T00:00:00.000Z" }),
    envelope({ event_id: "evt-cli-recent", occurred_at: "2026-10-26T00:00:00.000Z" })
  ]);
  seed.close();

  try {
    const status = await runUsageServiceMaintenance({
      state_root: stateRoot,
      operation: "status",
      mode: "dry-run"
    });
    assert.equal(status.total_events, 2);
    assert.equal(status.maintenance, null);

    const dryRun = await runUsageServiceMaintenance({
      state_root: stateRoot,
      operation: "prune",
      mode: "dry-run",
      retention_days: 30
    });
    assert.equal(dryRun.maintenance?.deleted_by_retention, 1);
    assert.equal(dryRun.total_events, 2);

    const applied = await runUsageServiceMaintenance({
      state_root: stateRoot,
      operation: "prune",
      mode: "apply",
      retention_days: 30,
      compact: true
    });
    assert.equal(applied.maintenance?.deleted_total, 1);
    assert.equal(applied.total_events, 1);
    assert.equal(applied.status?.last_maintenance?.deleted_by_retention, 1);

    assert.throws(
      () => parseUsageMaintenanceArgs(["prune"]),
      /用法/
    );
    assert.throws(
      () => parseUsageMaintenanceArgs(["prune", stateRoot, "--retention-days", "-1"]),
      /非负整数/
    );
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("migration --verify compares service aggregation with the legacy projection", async () => {
  const legacyRoot = await makeRoot("mixlab-usage-verify-legacy-");
  const stateRoot = await makeRoot("mixlab-usage-verify-state-");
  await writeLegacyEvents(legacyRoot, [
    legacyLine("evt-verify-1", "2026-10-26T08:00:00.000Z"),
    legacyLine("evt-verify-2", "2026-10-26T09:00:00.000Z")
  ]);

  try {
    await importLegacyUsageEvents({
      legacy_root: legacyRoot,
      state_root: stateRoot,
      mode: "apply",
      legacy_writers_stopped: true
    });

    const verification = await verifyMigratedUsageMetrics({
      legacy_root: legacyRoot,
      state_root: stateRoot
    });
    assert.equal(verification.status, "match");
    assert.deepEqual(verification.mismatched_fields, []);
    assert.equal(verification.known_differences.missing_event_id_lines, 0);
    assert.equal(verification.compared_fields.length > 0, true);

    const exitCode = await withSuppressedConsole(() =>
      runUsageServiceMigrationCli(["import", legacyRoot, stateRoot, "--verify"])
    );
    assert.equal(exitCode, 0);
  } finally {
    await rm(legacyRoot, { recursive: true, force: true });
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("migration --verify reports known differences and real mismatches", async () => {
  const knownLegacyRoot = await makeRoot("mixlab-usage-verify-known-legacy-");
  const knownStateRoot = await makeRoot("mixlab-usage-verify-known-state-");
  const mismatchLegacyRoot = await makeRoot("mixlab-usage-verify-mismatch-legacy-");
  const mismatchStateRoot = await makeRoot("mixlab-usage-verify-mismatch-state-");
  await writeLegacyEvents(knownLegacyRoot, [
    legacyLine("evt-known-1", "2026-10-26T08:00:00.000Z"),
    legacyLine(undefined, "2026-10-26T09:00:00.000Z")
  ]);

  try {
    await importLegacyUsageEvents({
      legacy_root: knownLegacyRoot,
      state_root: knownStateRoot,
      mode: "apply",
      legacy_writers_stopped: true
    });
    const known = await verifyMigratedUsageMetrics({
      legacy_root: knownLegacyRoot,
      state_root: knownStateRoot
    });
    assert.equal(known.status, "known-difference");
    assert.equal(known.known_differences.missing_event_id_lines, 1);
    assert.equal(known.mismatched_fields.length > 0, true);

    await writeLegacyEvents(mismatchLegacyRoot, [
      legacyLine("evt-mismatch-1", "2026-10-26T08:00:00.000Z")
    ]);
    await importLegacyUsageEvents({
      legacy_root: mismatchLegacyRoot,
      state_root: mismatchStateRoot,
      mode: "apply",
      legacy_writers_stopped: true
    });

    const extraStore = new UsageServiceStore(mismatchStateRoot, {
      retention_days: 0,
      max_events: 0,
      auto_prune: false
    });
    extraStore.ingest([envelope({ event_id: "evt-mismatch-extra" })]);
    extraStore.close();

    const mismatch = await verifyMigratedUsageMetrics({
      legacy_root: mismatchLegacyRoot,
      state_root: mismatchStateRoot
    });
    assert.equal(mismatch.status, "mismatch");
    const exitCode = await withSuppressedConsole(() =>
      runUsageServiceMigrationCli(["import", mismatchLegacyRoot, mismatchStateRoot, "--verify"])
    );
    assert.equal(exitCode, 1);
  } finally {
    await rm(knownLegacyRoot, { recursive: true, force: true });
    await rm(knownStateRoot, { recursive: true, force: true });
    await rm(mismatchLegacyRoot, { recursive: true, force: true });
    await rm(mismatchStateRoot, { recursive: true, force: true });
  }
});
