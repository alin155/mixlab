import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readUsageMetrics } from "../../packages/library-fs/src/usage-events.ts";
import { repairUsageEvents } from "./usage-events-repair.ts";

function storedEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_id: "evt-1",
    user_id: "CU000001",
    username: "editor",
    device_id: "device-1",
    event_type: "search",
    occurred_at: "2026-06-25T10:00:00.000Z",
    result_status: "success",
    ...overrides
  };
}

async function makeRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-usage-events-repair-"));
}

function eventsPath(root: string): string {
  return path.join(root, ".mixlab-library", "usage-events", "events.ndjson");
}

async function writeEvents(root: string, lines: string[]): Promise<void> {
  await mkdir(path.dirname(eventsPath(root)), { recursive: true });
  await writeFile(eventsPath(root), `${lines.join("\n")}\n`, "utf8");
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

test("usage-events repair dry-run reports malformed lines without rewriting", async () => {
  const root = await makeRoot();
  const artifactsDir = path.join(root, "artifacts");
  const original = [
    JSON.stringify(storedEvent({ event_id: "evt-valid-1" })),
    "{bad-json",
    JSON.stringify(storedEvent({ event_id: "evt-valid-2", query: "cashflow" }))
  ];
  await writeEvents(root, original);

  const report = await repairUsageEvents({
    libraryRoot: root,
    artifactsDir,
    now: new Date("2026-06-25T10:00:00.000Z")
  });

  assert.equal(report.ok, false);
  assert.equal(report.mode, "dry-run");
  assert.equal(report.changed, false);
  assert.equal(report.malformed_line_count, 1);
  assert.deepEqual(report.malformed_lines, [2]);
  assert.equal(await readFile(eventsPath(root), "utf8"), `${original.join("\n")}\n`);
  assert.equal(report.backup_path, "");
  assert.equal(report.quarantine_path, "");
  assert.equal(await exists(report.report_json_path), true);
  assert.equal(await exists(report.report_md_path), true);
});

test("usage-events repair apply backs up original file and quarantines malformed lines", async () => {
  const root = await makeRoot();
  const artifactsDir = path.join(root, "artifacts");
  const validFirst = JSON.stringify(storedEvent({ event_id: "evt-valid-1" }));
  const validSecond = JSON.stringify(storedEvent({ event_id: "evt-valid-2", event_type: "cut_success" }));
  const missingEventId = JSON.stringify(storedEvent({ event_id: undefined }));
  const original = [
    validFirst,
    "{bad-json",
    missingEventId,
    validSecond
  ];
  await writeEvents(root, original);

  const report = await repairUsageEvents({
    libraryRoot: root,
    artifactsDir,
    apply: true,
    now: new Date("2026-06-25T10:01:00.000Z")
  });

  assert.equal(report.ok, true);
  assert.equal(report.mode, "apply");
  assert.equal(report.changed, true);
  assert.equal(report.malformed_line_count, 2);
  assert.deepEqual(report.malformed_lines, [2, 3]);
  assert.equal(report.rewrite_strategy, "rename");
  assert.equal(await readFile(eventsPath(root), "utf8"), `${validFirst}\n${validSecond}\n`);
  assert.equal(await readFile(report.backup_path, "utf8"), `${original.join("\n")}\n`);

  const quarantine = await readFile(report.quarantine_path, "utf8");
  assert.match(quarantine, /"line_number":2/);
  assert.match(quarantine, /"line_number":3/);
  assert.match(quarantine, /bad-json/);

  const metrics = await readUsageMetrics(root);
  assert.equal(metrics.event_store.malformed_line_count, 0);
  assert.equal(metrics.event_store.valid_line_count, 2);
});

test("usage-events repair apply leaves a clean file unchanged", async () => {
  const root = await makeRoot();
  const artifactsDir = path.join(root, "artifacts");
  const original = [
    JSON.stringify(storedEvent({ event_id: "evt-valid-1" })),
    JSON.stringify(storedEvent({ event_id: "evt-valid-2", event_type: "add_to_cut_list" }))
  ];
  await writeEvents(root, original);

  const report = await repairUsageEvents({
    libraryRoot: root,
    artifactsDir,
    apply: true,
    now: new Date("2026-06-25T10:02:00.000Z")
  });

  assert.equal(report.ok, true);
  assert.equal(report.changed, false);
  assert.equal(report.malformed_line_count, 0);
  assert.equal(report.backup_path, "");
  assert.equal(report.quarantine_path, "");
  assert.equal(report.rewrite_strategy, "none");
  assert.equal(await readFile(eventsPath(root), "utf8"), `${original.join("\n")}\n`);
});
