import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readUsageMetrics } from "./index.ts";
import { UsageServiceStore } from "./usage-service-store.ts";
import {
  importLegacyUsageEvents,
  type UsageMigrationProgress
} from "./usage-service-migration.ts";

async function makeRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-usage-migration-"));
}

function legacyEvent(input: {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  user_id?: string;
  username?: string;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ...(input.event_id ? { event_id: input.event_id } : {}),
    user_id: input.user_id ?? "CU000001",
    username: input.username ?? "小王",
    device_id: "device-1",
    event_type: input.event_type ?? "search",
    occurred_at: input.occurred_at ?? "2026-10-27T08:00:00.000Z",
    ...(input.extra ?? {})
  };
}

async function writeLegacyUsageEvents(root: string, lines: string[]): Promise<string> {
  const target = path.join(root, ".mixlab-library", "usage-events", "events.ndjson");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, lines.join("\n") + "\n", "utf8");
  return target;
}

function mixedLines(): string[] {
  return [
    JSON.stringify(legacyEvent({ event_id: "evt-legacy-1", extra: { query: "现金流", result_status: "success", search_mode: "searchd", search_elapsed_ms: 20 } })),
    JSON.stringify(legacyEvent({
      event_id: "evt-legacy-2",
      event_type: "cut_success",
      occurred_at: "2026-10-28T09:00:00.000Z",
      user_id: "CU000002",
      username: "小李",
      extra: { cut_job_id: "job-1" }
    })),
    JSON.stringify(legacyEvent({ event_type: "search", extra: { query: "组织效率", result_status: "empty" } })),
    "{ this is not json",
    JSON.stringify(legacyEvent({ event_id: "evt-legacy-bad", event_type: "not_a_real_event" }))
  ];
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

test("legacy usage migration dry-run validates without creating state or touching the source", async () => {
  const legacyRoot = await makeRoot();
  const stateRoot = await makeRoot();
  const sourcePath = await writeLegacyUsageEvents(legacyRoot, mixedLines());
  const sourceBefore = await readFile(sourcePath, "utf8");
  const sourceStatBefore = await stat(sourcePath);

  try {
    const report = await importLegacyUsageEvents({
      legacy_root: legacyRoot,
      state_root: stateRoot,
      mode: "dry-run"
    });

    assert.equal(report.mode, "dry-run");
    assert.equal(report.source_path, ".mixlab-library/usage-events/events.ndjson");
    assert.equal(report.total_lines, 5);
    assert.equal(report.valid_event_count, 3);
    assert.equal(report.malformed_line_count, 2);
    assert.equal(report.malformed_samples.length, 2);
    assert.equal(report.imported_event_count, 0);
    assert.equal(report.already_imported, false);
    assert.equal(report.store_id, "");
    assert.equal(await pathExists(path.join(stateRoot, "events.sqlite")), false);
    assert.equal(await readFile(sourcePath, "utf8"), sourceBefore);
    assert.equal((await stat(sourcePath)).mtimeMs, sourceStatBefore.mtimeMs);
  } finally {
    await rm(legacyRoot, { recursive: true, force: true });
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("legacy usage migration apply is idempotent and metrics match the legacy projection", async () => {
  const legacyRoot = await makeRoot();
  const stateRoot = await makeRoot();
  const sourcePath = await writeLegacyUsageEvents(legacyRoot, mixedLines());
  const sourceBefore = await readFile(sourcePath, "utf8");
  const progress: UsageMigrationProgress[] = [];

  try {
    await assert.rejects(
      () => importLegacyUsageEvents({
        legacy_root: legacyRoot,
        state_root: stateRoot,
        mode: "apply"
      }),
      /旧事件写入者已停止/
    );

    const report = await importLegacyUsageEvents({
      legacy_root: legacyRoot,
      state_root: stateRoot,
      mode: "apply",
      legacy_writers_stopped: true,
      on_progress: (item) => progress.push(item)
    });

    assert.equal(report.mode, "apply");
    assert.equal(report.valid_event_count, 3);
    assert.equal(report.malformed_line_count, 2);
    assert.equal(report.imported_event_count, 3);
    assert.equal(report.already_imported, false);
    assert.equal(report.store_id.length > 0, true);
    assert.equal(await readFile(sourcePath, "utf8"), sourceBefore);
    assert.equal(progress.some((item) => item.stage === "reading"), true);
    assert.equal(progress.some((item) => item.stage === "importing"), true);

    const store = new UsageServiceStore(stateRoot);

    try {
      assert.equal(store.metrics().event_count, 3);
    } finally {
      store.close();
    }

    const second = await importLegacyUsageEvents({
      legacy_root: legacyRoot,
      state_root: stateRoot,
      mode: "apply",
      legacy_writers_stopped: true
    });
    assert.equal(second.already_imported, true);
    assert.equal(second.imported_event_count, 0);
    assert.equal(second.duplicate_event_count, 3);

    await writeFile(sourcePath, sourceBefore + JSON.stringify(legacyEvent({
      event_id: "evt-legacy-appended"
    })) + "\n", "utf8");
    await assert.rejects(
      () => importLegacyUsageEvents({
        legacy_root: legacyRoot,
        state_root: stateRoot,
        mode: "apply",
        legacy_writers_stopped: true
      }),
      /旧事件源在迁移后发生变化/
    );
  } finally {
    await rm(legacyRoot, { recursive: true, force: true });
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("legacy usage migration requires independent source and state roots", async () => {
  const legacyRoot = await makeRoot();

  try {
    await assert.rejects(
      () => importLegacyUsageEvents({
        legacy_root: legacyRoot,
        state_root: path.join(legacyRoot, "state"),
        mode: "dry-run"
      }),
      /两个互相独立的绝对路径/
    );
  } finally {
    await rm(legacyRoot, { recursive: true, force: true });
  }
});

test("migrated usage metrics match the legacy projection for fully identified events", async () => {
  const legacyRoot = await makeRoot();
  const stateRoot = await makeRoot();
  const lines = [
    JSON.stringify(legacyEvent({
      event_id: "evt-parity-1",
      extra: {
        query: "现金流",
        result_status: "success",
        search_mode: "searchd",
        search_elapsed_ms: 20
      }
    })),
    JSON.stringify(legacyEvent({
      event_id: "evt-parity-2",
      event_type: "cut_success",
      occurred_at: "2026-10-28T09:00:00.000Z",
      user_id: "CU000002",
      username: "小李",
      extra: { cut_job_id: "job-1" }
    }))
  ];
  await writeLegacyUsageEvents(legacyRoot, lines);

  try {
    await importLegacyUsageEvents({
      legacy_root: legacyRoot,
      state_root: stateRoot,
      mode: "apply",
      legacy_writers_stopped: true
    });

    const store = new UsageServiceStore(stateRoot);

    try {
      const serviceMetrics = store.metrics().metrics;
      const legacyMetrics = await readUsageMetrics(legacyRoot);
      assert.equal(serviceMetrics.search_request_count, legacyMetrics.search_request_count);
      assert.equal(serviceMetrics.search_hit_count, legacyMetrics.search_hit_count);
      assert.equal(serviceMetrics.cut_success_count, legacyMetrics.cut_success_count);
      assert.equal(serviceMetrics.active_user_count, legacyMetrics.active_user_count);
      assert.deepEqual(
        serviceMetrics.users.map((user) => [user.user_id, user.search_request_count, user.cut_success_count]),
        legacyMetrics.users.map((user) => [user.user_id, user.search_request_count, user.cut_success_count])
      );
    } finally {
      store.close();
    }
  } finally {
    await rm(legacyRoot, { recursive: true, force: true });
    await rm(stateRoot, { recursive: true, force: true });
  }
});
