import assert from "node:assert/strict";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { AddressInfo } from "node:net";
import type { EventEnvelopeV1 } from "../../contracts/src/index.ts";
import { UsageOutbox } from "../../library-fs/src/usage-outbox.ts";
import { createUsageService, type UsageServiceHandle } from "./usage-service.ts";

const CLIENT_TOKEN = "client-token-usage-service-test";
const ADMIN_TOKEN = "admin-token-usage-service-test";

async function makeRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

function envelope(input: {
  event_id: string;
  event_type?: EventEnvelopeV1["event_type"];
  occurred_at?: string;
  user_id?: string;
  payload?: Record<string, unknown>;
}): EventEnvelopeV1 {
  return {
    schema_version: "1.0",
    event_id: input.event_id,
    event_type: input.event_type ?? "search",
    occurred_at: input.occurred_at ?? "2026-10-27T10:00:00.000Z",
    device_id: "device-1",
    user_id: input.user_id ?? "CU000001",
    payload: input.payload ?? { username: "小王", query: "现金流", result_status: "success" },
    client: { product: "cutter", version: "0.1.0", contract_version: "1.0.0" }
  };
}

interface RunningService {
  service: UsageServiceHandle;
  base_url: string;
}

async function startService(
  stateRoot: string,
  options: {
    retention_days?: number;
    max_events?: number;
    max_query_events?: number;
  } = {}
): Promise<RunningService> {
  const service = await createUsageService({
    state_root: stateRoot,
    client_token: CLIENT_TOKEN,
    admin_token: ADMIN_TOKEN,
    ...options
  });
  service.server.listen(0, "127.0.0.1");
  await once(service.server, "listening");
  const address = service.server.address() as AddressInfo;
  return { service, base_url: "http://127.0.0.1:" + address.port };
}

async function fetchJson(input: {
  base_url: string;
  pathname: string;
  method?: string;
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(input.base_url + input.pathname, {
    method: input.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(input.token ? { Authorization: "Bearer " + input.token } : {}),
      ...(input.headers ?? {})
    },
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) })
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>
  };
}

function postEvents(base_url: string, token: string | undefined, events: unknown[]) {
  return fetchJson({
    base_url,
    pathname: "/v1/events",
    method: "POST",
    ...(token ? { token } : {}),
    body: { schema_version: "1.0", events }
  });
}

test("usage service health is loopback-only and never exposes the private state path", async () => {
  const stateRoot = await makeRoot("mixlab-usage-service-health-");
  const running = await startService(stateRoot);

  try {
    const health = await fetchJson({ base_url: running.base_url, pathname: "/health" });
    assert.equal(health.status, 200);
    assert.equal(health.body.status, "ok");
    assert.equal(health.body.service, "mixlab-usage-service");
    assert.equal(typeof health.body.store_id, "string");
    assert.equal(health.body.contract_version, "1.0.0");
    assert.equal(JSON.stringify(health.body).includes(stateRoot), false);
  } finally {
    await running.service.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("usage service authenticates ingest/admin metrics and deduplicates event ids", async () => {
  const stateRoot = await makeRoot("mixlab-usage-service-auth-");
  const running = await startService(stateRoot);

  try {
    const batch = [
      envelope({ event_id: "evt-http-1" }),
      envelope({
        event_id: "evt-http-2",
        event_type: "cut_success",
        user_id: "CU000002",
        occurred_at: "2026-10-28T10:00:00.000Z",
        payload: { username: "小李", cut_job_id: "job-1" }
      })
    ];

    const anonymous = await postEvents(running.base_url, undefined, batch);
    assert.equal(anonymous.status, 401);
    const wrongToken = await postEvents(running.base_url, "wrong-token", batch);
    assert.equal(wrongToken.status, 401);

    const ingested = await postEvents(running.base_url, CLIENT_TOKEN, batch);
    assert.equal(ingested.status, 200);
    assert.equal(ingested.body.inserted, 2);
    assert.equal(ingested.body.duplicate_count, 0);

    const duplicate = await postEvents(running.base_url, CLIENT_TOKEN, batch);
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.inserted, 0);
    assert.equal(duplicate.body.duplicate_count, 2);

    const clientMetrics = await fetchJson({
      base_url: running.base_url,
      pathname: "/v1/metrics",
      token: CLIENT_TOKEN
    });
    assert.equal(clientMetrics.status, 403);

    const adminMetrics = await fetchJson({
      base_url: running.base_url,
      pathname: "/v1/metrics",
      token: ADMIN_TOKEN
    });
    assert.equal(adminMetrics.status, 200);
    assert.equal(adminMetrics.body.event_count, 2);
    const metrics = adminMetrics.body.metrics as Record<string, unknown>;
    assert.equal(metrics.search_request_count, 1);
    assert.equal(metrics.cut_success_count, 1);
    assert.equal(metrics.active_user_count, 2);

    const filtered = await fetchJson({
      base_url: running.base_url,
      pathname: "/v1/metrics?from=2026-10-28T00%3A00%3A00.000Z&to=2026-10-28T23%3A59%3A59.999Z",
      token: ADMIN_TOKEN
    });
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.event_count, 1);

    const invalidFilter = await fetchJson({
      base_url: running.base_url,
      pathname: "/v1/metrics?from=not-a-date",
      token: ADMIN_TOKEN
    });
    assert.equal(invalidFilter.status, 400);
    assert.equal((invalidFilter.body.error as { code?: string }).code, "VALIDATION_FAILED");
  } finally {
    await running.service.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("usage service rejects conflicts, invalid batches and oversized payloads", async () => {
  const stateRoot = await makeRoot("mixlab-usage-service-invalid-");
  const running = await startService(stateRoot);

  try {
    await postEvents(running.base_url, CLIENT_TOKEN, [envelope({ event_id: "evt-invalid-base" })]);

    const conflict = await postEvents(running.base_url, CLIENT_TOKEN, [
      envelope({ event_id: "evt-invalid-base", payload: { username: "篡改", result_status: "failure" } })
    ]);
    assert.equal(conflict.status, 409);
    assert.equal((conflict.body.error as { code?: string }).code, "EVENT_ID_CONFLICT");

    const invalidEnvelope = await postEvents(running.base_url, CLIENT_TOKEN, [{ schema_version: "1.0" }]);
    assert.equal(invalidEnvelope.status, 400);
    assert.equal((invalidEnvelope.body.error as { code?: string }).code, "VALIDATION_FAILED");

    const tooMany = await postEvents(
      running.base_url,
      CLIENT_TOKEN,
      Array.from({ length: 101 }, (_, index) => envelope({ event_id: "evt-invalid-batch-" + index }))
    );
    assert.equal(tooMany.status, 413);
    assert.equal((tooMany.body.error as { code?: string }).code, "BATCH_TOO_LARGE");

    const badJson = await fetchJson({
      base_url: running.base_url,
      pathname: "/v1/events",
      method: "POST",
      token: CLIENT_TOKEN
    });
    assert.equal(badJson.status, 400);
  } finally {
    await running.service.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("usage service rejects non-loopback origin/host requests", async () => {
  const stateRoot = await makeRoot("mixlab-usage-service-loopback-");
  const running = await startService(stateRoot);
  const url = new URL(running.base_url);

  function rawRequest(headers: Record<string, string>): Promise<number> {
    return new Promise((resolve, reject) => {
      const request = httpRequest({
        host: url.hostname,
        port: Number(url.port),
        path: "/health",
        method: "GET",
        headers
      }, (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      });
      request.on("error", reject);
      request.end();
    });
  }

  try {
    assert.equal(await rawRequest({ Host: "example.com" }), 403);
    assert.equal(await rawRequest({ Host: url.host, Origin: "http://evil.example" }), 403);
    assert.equal(await rawRequest({ Host: url.host }), 200);
  } finally {
    await running.service.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("usage service state persists across restart and stays single-owner", async () => {
  const stateRoot = await makeRoot("mixlab-usage-service-restart-");
  const first = await startService(stateRoot);
  const storeId = first.service.store_id;

  try {
    await postEvents(first.base_url, CLIENT_TOKEN, [
      envelope({ event_id: "evt-restart-http-1" })
    ]);
    await assert.rejects(
      () => createUsageService({
        state_root: stateRoot,
        client_token: CLIENT_TOKEN,
        admin_token: ADMIN_TOKEN
      }),
      /统计服务仍在运行/
    );
  } finally {
    await first.service.close();
  }

  const second = await startService(stateRoot);

  try {
    assert.equal(second.service.store_id, storeId);
    const metrics = await fetchJson({
      base_url: second.base_url,
      pathname: "/v1/metrics",
      token: ADMIN_TOKEN
    });
    assert.equal(metrics.status, 200);
    assert.equal(metrics.body.event_count, 1);
    assert.equal(metrics.body.store_id, storeId);
  } finally {
    await second.service.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("usage outbox persists locally and delivers acknowledged events", async () => {
  const stateRoot = await makeRoot("mixlab-usage-service-outbox-state-");
  const outboxRoot = await makeRoot("mixlab-usage-service-outbox-");
  const running = await startService(stateRoot);
  const outbox = new UsageOutbox(outboxRoot, {
    base_url: running.base_url,
    token: CLIENT_TOKEN
  });

  try {
    await outbox.enqueue(envelope({ event_id: "evt-outbox-1" }));
    await outbox.enqueue(envelope({ event_id: "evt-outbox-2", event_type: "cut_failure" }));
    await outbox.enqueue(envelope({ event_id: "evt-outbox-1" }));
    await outbox.flush();

    const status = await outbox.status();
    assert.equal(status.total, 2);
    assert.equal(status.pending, 0);
    assert.equal(status.last_error, "");
    assert.equal(status.store_id.length > 0, true);

    const metrics = await fetchJson({
      base_url: running.base_url,
      pathname: "/v1/metrics",
      token: ADMIN_TOKEN
    });
    assert.equal(metrics.body.event_count, 2);

    await assert.rejects(
      () => outbox.enqueue({ schema_version: "1.0" }),
      /事件信封无效/
    );
  } finally {
    await outbox.close();
    await running.service.close();
    await rm(stateRoot, { recursive: true, force: true });
    await rm(outboxRoot, { recursive: true, force: true });
  }
});

test("usage service maintenance endpoint prunes by retention with admin token", async () => {
  const stateRoot = await makeRoot("mixlab-usage-service-maintenance-");
  const running = await startService(stateRoot, { retention_days: 30, max_events: 0 });

  try {
    await postEvents(running.base_url, CLIENT_TOKEN, [
      envelope({ event_id: "evt-maint-old", occurred_at: "2026-09-01T00:00:00.000Z" }),
      envelope({ event_id: "evt-maint-recent", occurred_at: "2026-10-26T00:00:00.000Z" })
    ]);

    const forbidden = await fetchJson({
      base_url: running.base_url,
      pathname: "/v1/maintenance",
      method: "POST",
      token: CLIENT_TOKEN,
      body: { mode: "dry-run" }
    });
    assert.equal(forbidden.status, 403);
    assert.equal((forbidden.body.error as { code?: string }).code, "admin_required");

    const dryRun = await fetchJson({
      base_url: running.base_url,
      pathname: "/v1/maintenance",
      method: "POST",
      token: ADMIN_TOKEN,
      body: { mode: "dry-run" }
    });
    assert.equal(dryRun.status, 200);
    const dryRunMaintenance = dryRun.body.maintenance as Record<string, unknown>;
    assert.equal(dryRunMaintenance.deleted_by_retention, 1);
    assert.equal(dryRunMaintenance.total_before, 2);
    assert.equal(dryRunMaintenance.total_after, 1);

    const beforeApply = await fetchJson({
      base_url: running.base_url,
      pathname: "/v1/metrics",
      token: ADMIN_TOKEN
    });
    assert.equal(beforeApply.body.event_count, 2);

    const applied = await fetchJson({
      base_url: running.base_url,
      pathname: "/v1/maintenance",
      method: "POST",
      token: ADMIN_TOKEN,
      body: { mode: "apply", compact: true }
    });
    assert.equal(applied.status, 200);
    const appliedMaintenance = applied.body.maintenance as Record<string, unknown>;
    assert.equal(appliedMaintenance.deleted_total, 1);
    assert.equal(appliedMaintenance.compacted, true);
    assert.equal(appliedMaintenance.total_after, 1);

    const afterApply = await fetchJson({
      base_url: running.base_url,
      pathname: "/v1/metrics",
      token: ADMIN_TOKEN
    });
    assert.equal(afterApply.body.event_count, 1);

    const invalid = await fetchJson({
      base_url: running.base_url,
      pathname: "/v1/maintenance",
      method: "POST",
      token: ADMIN_TOKEN,
      body: { mode: "prune-now" }
    });
    assert.equal(invalid.status, 400);
    assert.equal((invalid.body.error as { code?: string }).code, "VALIDATION_FAILED");
  } finally {
    await running.service.close();
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("usage service metrics support last_days and enforce the query cap with a stable error code", async () => {
  const stateRoot = await makeRoot("mixlab-usage-service-last-days-");
  const running = await startService(stateRoot, { max_events: 0, retention_days: 0 });

  try {
    const now = new Date();
    const recent = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
    const older = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    await postEvents(running.base_url, CLIENT_TOKEN, [
      envelope({ event_id: "evt-last-days-recent", occurred_at: recent }),
      envelope({ event_id: "evt-last-days-older", occurred_at: older })
    ]);

    const lastDay = await fetchJson({
      base_url: running.base_url,
      pathname: "/v1/metrics?last_days=1",
      token: ADMIN_TOKEN
    });
    assert.equal(lastDay.status, 200);
    assert.equal(lastDay.body.event_count, 1);

    const conflict = await fetchJson({
      base_url: running.base_url,
      pathname: "/v1/metrics?last_days=1&from=2026-10-01T00%3A00%3A00.000Z",
      token: ADMIN_TOKEN
    });
    assert.equal(conflict.status, 400);
    assert.equal((conflict.body.error as { code?: string }).code, "VALIDATION_FAILED");

    const invalid = await fetchJson({
      base_url: running.base_url,
      pathname: "/v1/metrics?last_days=0",
      token: ADMIN_TOKEN
    });
    assert.equal(invalid.status, 400);
  } finally {
    await running.service.close();
    await rm(stateRoot, { recursive: true, force: true });
  }

  const cappedRoot = await makeRoot("mixlab-usage-service-query-cap-");
  const capped = await startService(cappedRoot, {
    retention_days: 0,
    max_events: 0,
    max_query_events: 2
  });

  try {
    await postEvents(capped.base_url, CLIENT_TOKEN, [
      envelope({ event_id: "evt-capped-1" }),
      envelope({ event_id: "evt-capped-2" }),
      envelope({ event_id: "evt-capped-3" })
    ]);
    const tooLarge = await fetchJson({
      base_url: capped.base_url,
      pathname: "/v1/metrics",
      token: ADMIN_TOKEN
    });
    assert.equal(tooLarge.status, 413);
    assert.equal((tooLarge.body.error as { code?: string }).code, "QUERY_TOO_LARGE");
  } finally {
    await capped.service.close();
    await rm(cappedRoot, { recursive: true, force: true });
  }
});
