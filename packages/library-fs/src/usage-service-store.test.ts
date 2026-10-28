import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { EventEnvelopeV1 } from "../../contracts/src/index.ts";
import {
  UsageServiceError,
  UsageServiceStore,
  acquireUsageServiceOwner,
  canonicalUsageEvent,
  DEFAULT_USAGE_SERVICE_MAX_EVENTS,
  DEFAULT_USAGE_SERVICE_RETENTION_DAYS,
  resolveUsageServiceCapacityConfig
} from "./usage-service-store.ts";

async function makeStateRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-usage-service-store-"));
}

function envelope(input: {
  event_id: string;
  event_type?: EventEnvelopeV1["event_type"];
  occurred_at?: string;
  user_id?: string;
  device_id?: string;
  payload?: Record<string, unknown>;
}): EventEnvelopeV1 {
  return {
    schema_version: "1.0",
    event_id: input.event_id,
    event_type: input.event_type ?? "search",
    occurred_at: input.occurred_at ?? "2026-10-27T08:00:00.000Z",
    device_id: input.device_id ?? "device-1",
    user_id: input.user_id ?? "CU000001",
    payload: input.payload ?? { username: "小王", query: "现金流", result_status: "success" },
    client: {
      product: "cutter",
      version: "0.1.0",
      contract_version: "1.0.0"
    }
  };
}

test("usage service store ingests envelopes idempotently and aggregates per user and day", async () => {
  const stateRoot = await makeStateRoot();
  const store = new UsageServiceStore(stateRoot);

  try {
    const batch = [
      envelope({ event_id: "evt-search-1" }),
      envelope({
        event_id: "evt-search-2",
        user_id: "CU000002",
        occurred_at: "2026-10-28T09:30:00.000Z",
        payload: { username: "小李", query: "组织效率", result_status: "empty" }
      }),
      envelope({
        event_id: "evt-cut-1",
        event_type: "cut_success",
        payload: { username: "小王", cut_job_id: "job-1" }
      })
    ];

    const first = store.ingest(batch);
    assert.equal(first.store_id, store.id);
    assert.equal(first.inserted, 3);
    assert.equal(first.duplicate_count, 0);
    assert.deepEqual(first.acknowledged, ["evt-search-1", "evt-search-2", "evt-cut-1"]);

    const metrics = store.metrics();
    assert.equal(metrics.store_id, store.id);
    assert.equal(metrics.event_count, 3);
    assert.equal(metrics.metrics.search_request_count, 2);
    assert.equal(metrics.metrics.search_empty_count, 1);
    assert.equal(metrics.metrics.cut_success_count, 1);
    assert.equal(metrics.metrics.active_user_count, 2);
    assert.equal(metrics.metrics.users.length, 2);
    assert.deepEqual(metrics.by_day.map((bucket) => [bucket.date, bucket.event_count]), [
      ["2026-10-27", 2],
      ["2026-10-28", 1]
    ]);

    const duplicate = store.ingest(batch);
    assert.equal(duplicate.inserted, 0);
    assert.equal(duplicate.duplicate_count, 3);
    assert.equal(duplicate.acknowledged.length, 3);
    assert.equal(store.metrics().event_count, 3);
  } finally {
    store.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("usage service store rejects conflicting event ids and invalid batches atomically", async () => {
  const stateRoot = await makeStateRoot();
  const store = new UsageServiceStore(stateRoot);

  try {
    store.ingest([envelope({ event_id: "evt-conflict-1" })]);

    assert.throws(
      () => store.ingest([
        envelope({ event_id: "evt-conflict-new" }),
        envelope({ event_id: "evt-conflict-1", payload: { username: "篡改", result_status: "failure" } })
      ]),
      (error: unknown) => error instanceof UsageServiceError &&
        error.code === "EVENT_ID_CONFLICT" &&
        error.status === 409
    );
    // The batch is all-or-nothing: the new event must not be persisted.
    assert.equal(store.metrics().event_count, 1);

    assert.throws(
      () => store.ingest([{ ...envelope({ event_id: "evt-invalid" }), schema_version: "2.0" }]),
      (error: unknown) => error instanceof UsageServiceError && error.code === "VALIDATION_FAILED"
    );
    assert.throws(
      () => store.ingest([envelope({ event_id: "bad id" })]),
      (error: unknown) => error instanceof UsageServiceError && error.code === "VALIDATION_FAILED"
    );
    assert.throws(
      () => store.ingest([]),
      (error: unknown) => error instanceof UsageServiceError && error.code === "VALIDATION_FAILED"
    );
    assert.throws(
      () => store.ingest(Array.from({ length: 101 }, (_, index) =>
        envelope({ event_id: "evt-batch-" + index })
      )),
      (error: unknown) => error instanceof UsageServiceError && error.code === "BATCH_TOO_LARGE"
    );
  } finally {
    store.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("usage service store persists events and store id across restart", async () => {
  const stateRoot = await makeStateRoot();
  const firstStore = new UsageServiceStore(stateRoot);
  const firstId = firstStore.id;
  firstStore.ingest([envelope({ event_id: "evt-restart-1" })]);
  const firstMetrics = firstStore.metrics(undefined, { generated_at: "2026-10-27T08:30:00.000Z" });
  firstStore.close();

  const secondStore = new UsageServiceStore(stateRoot);

  try {
    assert.equal(secondStore.id, firstId);
    const secondMetrics = secondStore.metrics(undefined, { generated_at: "2026-10-27T08:31:00.000Z" });
    assert.equal(secondMetrics.metrics.search_request_count, firstMetrics.metrics.search_request_count);
    assert.equal(secondMetrics.metrics.active_user_count, firstMetrics.metrics.active_user_count);
    assert.equal(secondMetrics.event_count, 1);
  } finally {
    secondStore.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("usage service metrics support time and user filters", async () => {
  const stateRoot = await makeStateRoot();
  const store = new UsageServiceStore(stateRoot);

  try {
    store.ingest([
      envelope({ event_id: "evt-range-1", occurred_at: "2026-10-27T08:00:00.000Z" }),
      envelope({
        event_id: "evt-range-2",
        user_id: "CU000002",
        occurred_at: "2026-10-28T08:00:00.000Z"
      }),
      envelope({ event_id: "evt-range-3", occurred_at: "2026-10-29T08:00:00.000Z" })
    ]);

    const filtered = store.metrics({
      from: "2026-10-28T00:00:00.000Z",
      to: "2026-10-28T23:59:59.999Z"
    });
    assert.equal(filtered.event_count, 1);
    assert.equal(filtered.metrics.active_user_count, 1);
    assert.deepEqual(filtered.query, {
      from: "2026-10-28T00:00:00.000Z",
      to: "2026-10-28T23:59:59.999Z"
    });

    const byUser = store.metrics({ user_id: "CU000001" });
    assert.equal(byUser.event_count, 2);
    assert.equal(byUser.metrics.users[0]?.user_id, "CU000001");

    assert.throws(
      () => store.metrics({ from: "not-a-date" }),
      (error: unknown) => error instanceof UsageServiceError && error.code === "VALIDATION_FAILED"
    );
    assert.throws(
      () => store.metrics({
        from: "2026-10-29T00:00:00.000Z",
        to: "2026-10-28T00:00:00.000Z"
      }),
      (error: unknown) => error instanceof UsageServiceError && error.code === "VALIDATION_FAILED"
    );
  } finally {
    store.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("usage service owner lock is exclusive and released on demand", async () => {
  const stateRoot = await makeStateRoot();
  const unlock = await acquireUsageServiceOwner(stateRoot);

  try {
    await assert.rejects(
      () => acquireUsageServiceOwner(stateRoot),
      /统计服务仍在运行/
    );
  } finally {
    unlock();
  }

  const unlockAgain = await acquireUsageServiceOwner(stateRoot);
  unlockAgain();
  await rm(stateRoot, { recursive: true, force: true });
});

test("canonical usage events validate the shared contract envelope", () => {
  const valid = envelope({
    event_id: "evt-canonical-1",
    payload: {
      username: " 小王 ",
      query: "现金流",
      result_status: "success",
      search_mode: "searchd",
      search_elapsed_ms: 42,
      extra_field: "ignored"
    }
  });
  const canonical = canonicalUsageEvent(valid);
  assert.equal(canonical.event.event_id, "evt-canonical-1");
  assert.equal(canonical.event.username, "小王");
  assert.equal(canonical.event.query, "现金流");
  assert.equal(canonical.event.search_elapsed_ms, 42);

  const fallbackUsername = canonicalUsageEvent(envelope({
    event_id: "evt-canonical-2",
    payload: { result_status: "success" }
  }));
  assert.equal(fallbackUsername.event.username, "CU000001");

  assert.throws(
    () => canonicalUsageEvent({ schema_version: "1.0" }),
    (error: unknown) => error instanceof UsageServiceError && error.code === "VALIDATION_FAILED"
  );
});

test("retention pruning deletes only events older than the cutoff and records counters", async () => {
  const stateRoot = await makeStateRoot();
  const now = "2026-10-27T00:00:00.000Z";
  const store = new UsageServiceStore(stateRoot, {
    retention_days: 30,
    max_events: 0,
    auto_prune: false,
    now
  });

  try {
    store.ingest([
      envelope({ event_id: "evt-older", occurred_at: "2026-09-01T00:00:00.000Z" }),
      envelope({ event_id: "evt-boundary", occurred_at: "2026-09-27T00:00:00.000Z" }),
      envelope({ event_id: "evt-recent", occurred_at: "2026-10-20T00:00:00.000Z" })
    ]);

    const dryRun = store.prune({ mode: "dry-run", now });
    assert.equal(dryRun.deleted_by_retention, 1);
    assert.equal(dryRun.deleted_by_capacity, 0);
    assert.equal(dryRun.total_before, 3);
    assert.equal(dryRun.total_after, 2);
    assert.equal(store.metrics().event_count, 3);
    assert.equal(dryRun.cutoff, "2026-09-27T00:00:00.000Z");

    const applied = store.prune({ mode: "apply", now });
    assert.equal(applied.deleted_total, 1);
    assert.equal(applied.total_after, 2);
    assert.equal(store.metrics().event_count, 2);
    assert.deepEqual(store.metrics().metrics.users.map((user) => user.user_id), ["CU000001"]);

    const status = store.maintenanceStatus();
    assert.equal(status.total_events, 2);
    assert.equal(status.last_maintenance?.deleted_by_retention, 1);
    assert.equal(status.last_maintenance?.mode, "apply");
  } finally {
    store.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("capacity pruning keeps the newest events up to max_events", async () => {
  const stateRoot = await makeStateRoot();
  const store = new UsageServiceStore(stateRoot, {
    retention_days: 0,
    max_events: 3,
    auto_prune: false
  });

  try {
    store.ingest([
      envelope({ event_id: "evt-cap-1", occurred_at: "2026-10-01T00:00:00.000Z" }),
      envelope({ event_id: "evt-cap-2", occurred_at: "2026-10-02T00:00:00.000Z" }),
      envelope({ event_id: "evt-cap-3", occurred_at: "2026-10-03T00:00:00.000Z" }),
      envelope({ event_id: "evt-cap-4", occurred_at: "2026-10-04T00:00:00.000Z" }),
      envelope({ event_id: "evt-cap-5", occurred_at: "2026-10-05T00:00:00.000Z" })
    ]);

    const result = store.prune({ mode: "apply" });
    assert.equal(result.deleted_by_retention, 0);
    assert.equal(result.deleted_by_capacity, 2);
    assert.equal(result.total_after, 3);
    assert.equal(store.metrics().event_count, 3);

    const rows = store.db.prepare("SELECT event_id FROM events ORDER BY sequence").all() as Array<{
      event_id: string;
    }>;
    assert.deepEqual(rows.map((row) => row.event_id), ["evt-cap-3", "evt-cap-4", "evt-cap-5"]);
  } finally {
    store.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("zero retention and zero capacity mean unlimited", async () => {
  const stateRoot = await makeStateRoot();
  const store = new UsageServiceStore(stateRoot, {
    retention_days: 0,
    max_events: 0,
    auto_prune: false
  });

  try {
    store.ingest([
      envelope({ event_id: "evt-unlimited-old", occurred_at: "2020-01-01T00:00:00.000Z" }),
      envelope({ event_id: "evt-unlimited-new", occurred_at: "2026-10-27T00:00:00.000Z" })
    ]);
    const result = store.prune({ mode: "apply", now: "2026-10-27T00:00:00.000Z" });
    assert.equal(result.deleted_total, 0);
    assert.equal(result.total_after, 2);
    assert.equal(store.metrics().event_count, 2);
  } finally {
    store.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("startup applies configured retention before serving", async () => {
  const stateRoot = await makeStateRoot();
  const seedStore = new UsageServiceStore(stateRoot, {
    retention_days: 0,
    max_events: 0,
    auto_prune: false
  });
  seedStore.ingest([
    envelope({ event_id: "evt-startup-old", occurred_at: "2026-01-01T00:00:00.000Z" }),
    envelope({ event_id: "evt-startup-new", occurred_at: "2026-10-26T00:00:00.000Z" })
  ]);
  seedStore.close();

  const store = new UsageServiceStore(stateRoot, {
    retention_days: 30,
    max_events: 0,
    now: "2026-10-27T00:00:00.000Z"
  });

  try {
    assert.equal(store.metrics().event_count, 1);
    assert.equal(store.maintenanceStatus().last_maintenance?.deleted_by_retention, 1);
  } finally {
    store.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("ingest-time capacity prune keeps the newest bounded batch", async () => {
  const stateRoot = await makeStateRoot();
  const store = new UsageServiceStore(stateRoot, {
    retention_days: 0,
    max_events: 2
  });

  try {
    const result = store.ingest([
      envelope({ event_id: "evt-ingest-1" }),
      envelope({ event_id: "evt-ingest-2" }),
      envelope({ event_id: "evt-ingest-3" })
    ]);
    assert.equal(result.inserted, 3);
    assert.deepEqual(result.maintenance, {
      deleted_by_retention: 0,
      deleted_by_capacity: 1
    });
    assert.equal(store.metrics().event_count, 2);
  } finally {
    store.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("metrics support last_days and reject conflicting or oversized queries", async () => {
  const stateRoot = await makeStateRoot();
  const now = "2026-10-27T00:00:00.000Z";
  const store = new UsageServiceStore(stateRoot, {
    retention_days: 0,
    max_events: 0,
    auto_prune: false,
    max_query_events: 2
  });

  try {
    store.ingest([
      envelope({ event_id: "evt-window-old", occurred_at: "2026-10-20T00:00:00.000Z" }),
      envelope({ event_id: "evt-window-new-1", occurred_at: "2026-10-26T12:00:00.000Z" }),
      envelope({ event_id: "evt-window-new-2", occurred_at: "2026-10-26T18:00:00.000Z" })
    ]);

    const recent = store.metrics({ last_days: 1 }, { generated_at: now });
    assert.equal(recent.event_count, 2);
    assert.equal(recent.query.last_days, 1);
    assert.equal(recent.query.from, "2026-10-26T00:00:00.000Z");

    assert.throws(
      () => store.metrics({ last_days: 0 }, { generated_at: now }),
      (error: unknown) => error instanceof UsageServiceError && error.code === "VALIDATION_FAILED"
    );
    assert.throws(
      () => store.metrics({ last_days: 3, from: "2026-10-20T00:00:00.000Z" }, { generated_at: now }),
      (error: unknown) => error instanceof UsageServiceError && error.code === "VALIDATION_FAILED"
    );
    assert.throws(
      () => store.metrics(undefined, { generated_at: now }),
      (error: unknown) => error instanceof UsageServiceError &&
        error.code === "QUERY_TOO_LARGE" &&
        error.status === 413
    );
  } finally {
    store.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("capacity env defaults and overrides resolve safely", () => {
  assert.equal(DEFAULT_USAGE_SERVICE_RETENTION_DAYS, 180);
  assert.equal(DEFAULT_USAGE_SERVICE_MAX_EVENTS, 500_000);
  assert.deepEqual(resolveUsageServiceCapacityConfig({} as NodeJS.ProcessEnv), {
    retention_days: 180,
    max_events: 500_000
  });
  assert.deepEqual(resolveUsageServiceCapacityConfig({
    MIXLAB_USAGE_SERVICE_RETENTION_DAYS: "30",
    MIXLAB_USAGE_SERVICE_MAX_EVENTS: "1000"
  } as NodeJS.ProcessEnv), {
    retention_days: 30,
    max_events: 1000
  });
  assert.throws(
    () => resolveUsageServiceCapacityConfig({
      MIXLAB_USAGE_SERVICE_RETENTION_DAYS: "-1"
    } as NodeJS.ProcessEnv),
    (error: unknown) => error instanceof UsageServiceError && error.code === "VALIDATION_FAILED"
  );
});
