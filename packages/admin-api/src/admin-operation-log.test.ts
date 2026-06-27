import assert from "node:assert/strict";
import { appendFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  adminOperationLogPath,
  appendAdminOperationLogEvent,
  readAdminOperationLog
} from "./admin-operation-log.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-operation-log-"));
}

test("admin operation log appends ndjson events and reads newest first", async () => {
  const libraryRoot = await makeLibraryRoot();

  await appendAdminOperationLogEvent({
    library_root: libraryRoot,
    event_id: "evt-001",
    occurred_at: "2026-06-25T12:00:00.000Z",
    area: "read-model",
    action: "read-model-reconcile",
    event_type: "started",
    message: "开始读模型对账。",
    details: {
      phase: "starting"
    }
  });
  await appendAdminOperationLogEvent({
    library_root: libraryRoot,
    event_id: "evt-002",
    occurred_at: "2026-06-25T12:00:01.000Z",
    area: "read-model",
    action: "read-model-reconcile",
    event_type: "succeeded",
    message: "读模型对账完成。",
    details: {
      phase: "completed",
      snapshot_video_count: 1
    }
  });

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-25T12:00:02.000Z",
    limit: 1
  });

  assert.equal(log.path, adminOperationLogPath(libraryRoot));
  assert.equal(log.total_line_count, 2);
  assert.equal(log.malformed_line_count, 0);
  assert.equal(log.truncated, true);
  assert.deepEqual(log.events.map((event) => event.event_id), ["evt-002"]);
  assert.equal(log.events[0]?.details.snapshot_video_count, 1);
});

test("admin operation log tolerates malformed lines without hiding valid events", async () => {
  const libraryRoot = await makeLibraryRoot();
  const logPath = adminOperationLogPath(libraryRoot);

  await appendAdminOperationLogEvent({
    library_root: libraryRoot,
    event_id: "evt-valid",
    occurred_at: "2026-06-25T12:00:00.000Z",
    area: "read-model",
    action: "read-model-reconcile",
    event_type: "started",
    message: "开始读模型对账。",
    details: {}
  });
  await appendFile(logPath, "not-json\n{\"schema_version\":\"1.0\"}\n", "utf8");

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-25T12:00:03.000Z",
    limit: 10
  });

  assert.equal(log.total_line_count, 3);
  assert.equal(log.malformed_line_count, 2);
  assert.deepEqual(log.events.map((event) => event.event_id), ["evt-valid"]);
});

test("admin operation log preserves read-model invalidation details", async () => {
  const libraryRoot = await makeLibraryRoot();

  await appendAdminOperationLogEvent({
    library_root: libraryRoot,
    event_id: "evt-invalidate",
    occurred_at: "2026-06-25T12:00:00.000Z",
    area: "read-model",
    action: "read-model-invalidate",
    event_type: "succeeded",
    message: "Admin read model 已标记为需要对账。",
    details: {
      command: "source-folder-update",
      invalidation_reason: "source-folder-scope-change",
      stale_mark_applied: true,
      stale_mark_result: "invalidated"
    }
  });

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-25T12:00:01.000Z",
    limit: 10
  });

  assert.equal(log.events[0]?.action, "read-model-invalidate");
  assert.equal(log.events[0]?.event_type, "succeeded");
  assert.equal(log.events[0]?.details.command, "source-folder-update");
  assert.equal(log.events[0]?.details.invalidation_reason, "source-folder-scope-change");
});

test("admin operation log can return a warming result while a slow route read refreshes cache", async () => {
  const libraryRoot = await makeLibraryRoot();
  const event = {
    schema_version: "1.0",
    event_id: "evt-slow",
    occurred_at: "2026-06-25T12:00:00.000Z",
    area: "system",
    action: "operation-log-tail",
    event_type: "succeeded",
    message: "操作记录尾部读取完成。",
    details: {
      source: "slow-loader"
    }
  };
  let readCount = 0;
  const slowRead = async () => {
    readCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return `${JSON.stringify(event)}\n`;
  };

  const warming = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-25T12:00:01.000Z",
    limit: 10,
    max_wait_ms: 5,
    cache_ttl_ms: 5_000,
    read_text: slowRead
  });

  assert.equal(warming.read_mode, "warming");
  assert.equal(warming.cache_status, "warming");
  assert.equal(warming.complete, false);
  assert.equal(warming.refresh_in_progress, true);
  assert.deepEqual(warming.events, []);

  await new Promise((resolve) => setTimeout(resolve, 50));

  const cached = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-25T12:00:02.000Z",
    limit: 10,
    max_wait_ms: 5,
    cache_ttl_ms: 5_000,
    read_text: slowRead
  });

  assert.equal(readCount, 1);
  assert.equal(cached.read_mode, "full-file");
  assert.equal(cached.cache_status, "hit");
  assert.equal(cached.complete, true);
  assert.equal(cached.refresh_in_progress, false);
  assert.deepEqual(cached.events.map((item) => item.event_id), ["evt-slow"]);
  assert.equal(cached.generated_at, "2026-06-25T12:00:02.000Z");
});
