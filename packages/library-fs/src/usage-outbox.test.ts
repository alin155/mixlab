import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  UsageOutbox,
  canonicalUsageOutboxEvent,
  DEFAULT_USAGE_OUTBOX_BATCH_SIZE
} from "./usage-outbox.ts";

const CLIENT_TOKEN = "test-usage-token";

interface FakeUsageService {
  url: string;
  events: Array<{ event_id: string }>;
  batches: number;
  close: () => Promise<void>;
}

async function startFakeUsageService(options: {
  token?: string;
  fail_first?: number;
  ack_mode?: "all" | "partial";
  store_id?: string;
} = {}): Promise<FakeUsageService> {
  const expectedToken = options.token ?? CLIENT_TOKEN;
  const storeId = options.store_id ?? "store-1";
  const events: Array<{ event_id: string }> = [];
  const state = { failures: options.fail_first ?? 0, batches: 0 };

  const server: Server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(value));
    };

    if (request.headers.authorization !== `Bearer ${expectedToken}`) {
      send(401, { error: { code: "service_auth", message: "token invalid" } });
      return;
    }

    if (request.method === "GET" && request.url === "/usage/v1/identity") {
      send(200, { store_id: storeId });
      return;
    }

    if (request.method === "POST" && request.url === "/usage/v1/events") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        version: number;
        events: Array<{ event_id: string }>;
      };
      state.batches += 1;

      if (state.failures > 0) {
        state.failures -= 1;
        send(503, { error: { code: "usage_service_unavailable", message: "busy" } });
        return;
      }

      if (request.headers["x-mixlab-usage-store"] !== storeId) {
        send(409, { error: { code: "usage_destination_changed", message: "store mismatch" } });
        return;
      }

      events.push(...body.events);
      // partial 模式模拟服务端 ACK 不完整：不返回完整 acknowledgement，客户端必须保留事件。
      const acknowledged = options.ack_mode === "partial"
        ? []
        : body.events.map((event) => event.event_id);
      send(200, { store_id: storeId, acknowledged });
      return;
    }

    send(404, { error: { code: "route_missing" } });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };

  return {
    url: `http://127.0.0.1:${address.port}`,
    events,
    get batches() {
      return state.batches;
    },
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
}

async function makeRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    user_id: "CU-1",
    username: "剪辑师",
    device_id: "device-1",
    event_type: "search",
    occurred_at: "2026-05-11T10:00:00.000Z",
    query: "现金流",
    result_status: "success",
    ...overrides
  };
}

async function waitFor(check: () => Promise<boolean> | boolean, timeoutMs = 3000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("waitFor timeout");
}

test("outbox persists events locally, delivers a batch, and deletes acknowledged rows", async () => {
  const service = await startFakeUsageService();
  const root = await makeRoot("mixlab-usage-outbox-");
  const outbox = new UsageOutbox(root, { base_url: service.url, token: CLIENT_TOKEN }, {
    flush_interval_ms: 20
  });

  try {
    const first = await outbox.enqueue(event() as never);
    const second = await outbox.enqueue(event({ event_type: "view_source_video", source_video_id: "V000001" }) as never);
    assert.match(first.event_id ?? "", /^[0-9a-f-]{36}$/);
    assert.notEqual(first.event_id, second.event_id);

    await waitFor(async () => (await outbox.status()).pending === 0);
    assert.equal(service.events.length, 2);
    assert.deepEqual(service.events.map((item) => item.event_id).sort(), [first.event_id!, second.event_id!].sort());
    // 两次 enqueue 可能各自触发一次上报（视事件循环时序），批次数量不固定，但事件必须全部送达。
    assert.ok(service.batches >= 1);

    const status = await outbox.status();
    assert.equal(status.total, 0);
    assert.equal(status.pending, 0);
    assert.equal(status.last_error, "");
  } finally {
    await outbox.close();
    await service.close();
  }
});

test("outbox survives process restart and delivers the backlog after the service returns", async () => {
  const root = await makeRoot("mixlab-usage-outbox-restart-");
  const deadService = await startFakeUsageService();
  const deadUrl = deadService.url;
  await deadService.close();

  const offlineOutbox = new UsageOutbox(root, { base_url: deadUrl, token: CLIENT_TOKEN }, {
    flush_interval_ms: 20,
    max_retry_delay_ms: 60
  });
  await offlineOutbox.enqueue(event({ event_type: "cut_success" }) as never);
  await offlineOutbox.enqueue(event({ event_type: "cut_failure" }) as never);
  const beforeClose = await offlineOutbox.status();
  assert.equal(beforeClose.pending, 2);
  await offlineOutbox.close();

  // 重新打开同一目录（模拟进程重启）后仍有待投递事件（此时服务仍不可用，不会删事件）。
  const verifier = new UsageOutbox(root, { base_url: deadUrl, token: CLIENT_TOKEN }, {
    flush_interval_ms: 5000,
    max_retry_delay_ms: 5000
  });
  try {
    assert.equal((await verifier.status()).pending, 2);
  } finally {
    await verifier.close();
  }

  const service = await startFakeUsageService();
  const restarted = new UsageOutbox(root, { base_url: service.url, token: CLIENT_TOKEN }, {
    flush_interval_ms: 20
  });

  try {
    await waitFor(async () => (await restarted.status()).pending === 0);
    assert.equal(service.events.length, 2);
  } finally {
    await restarted.close();
    await service.close();
  }
});

test("outbox retries with backoff after transient service failures", async () => {
  const service = await startFakeUsageService({ fail_first: 2 });
  const root = await makeRoot("mixlab-usage-outbox-retry-");
  const outbox = new UsageOutbox(root, { base_url: service.url, token: CLIENT_TOKEN }, {
    flush_interval_ms: 10,
    max_retry_delay_ms: 40
  });

  try {
    await outbox.enqueue(event() as never);
    await waitFor(async () => (await outbox.status()).pending === 0, 5000);
    // 至少发生过一次失败重试（不同运行环境的事件循环时序会影响精确批次数）。
    assert.ok(service.batches >= 2);
    assert.equal(service.events.length, 1);
    assert.equal((await outbox.status()).last_error, "");
  } finally {
    await outbox.close();
    await service.close();
  }
});

test("outbox keeps events pending when the ACK is incomplete", async () => {
  const service = await startFakeUsageService({ ack_mode: "partial" });
  const root = await makeRoot("mixlab-usage-outbox-ack-");
  const outbox = new UsageOutbox(root, { base_url: service.url, token: CLIENT_TOKEN }, {
    flush_interval_ms: 20
  });

  try {
    await outbox.enqueue(event() as never);
    await outbox.enqueue(event({ event_type: "view_source_video" }) as never);
    await outbox.flush();
    const status = await outbox.status();
    assert.equal(status.pending, 2);
    assert.equal(status.last_error, "usage_ack_incomplete");
  } finally {
    await outbox.close();
    await service.close();
  }
});

test("outbox deduplicates by event_id and rejects conflicting payload", async () => {
  const root = await makeRoot("mixlab-usage-outbox-dedup-");
  // Use an unreachable service so the background flush can never delete rows while the
  // test asserts local deduplication state (delivery semantics are covered elsewhere).
  const outbox = new UsageOutbox(root, { base_url: "http://127.0.0.1:9", token: CLIENT_TOKEN }, {
    flush_interval_ms: 60_000
  });

  try {
    const value = event({ event_id: "11111111-1111-4111-8111-111111111111" });
    await outbox.enqueue(value as never);
    await outbox.enqueue(value as never);
    assert.equal((await outbox.status()).pending, 1);

    await assert.rejects(
      () => outbox.enqueue(event({ event_id: "11111111-1111-4111-8111-111111111111", query: "不同内容" }) as never),
      /内容冲突/
    );
  } finally {
    await outbox.close();
  }
});

test("outbox drops oldest events beyond the capacity limit and records dropped count", async () => {
  const root = await makeRoot("mixlab-usage-outbox-cap-");
  const outbox = new UsageOutbox(root, { base_url: "http://127.0.0.1:9", token: CLIENT_TOKEN }, {
    flush_interval_ms: 60_000,
    max_events: 3
  });

  try {
    for (let index = 0; index < 5; index += 1) {
      await outbox.enqueue(event({ event_id: `22222222-2222-4222-8222-00000000000${index}` }) as never);
    }
    const status = await outbox.status();
    assert.equal(status.total, 3);
    assert.equal(status.dropped, 2);
  } finally {
    await outbox.close();
  }
});

test("outbox enqueue never blocks on an unreachable service", async () => {
  // 端口 9 通常无监听：连接立即失败，用来模拟断网/服务不可用。
  const root = await makeRoot("mixlab-usage-outbox-offline-");
  const outbox = new UsageOutbox(root, { base_url: "http://127.0.0.1:9", token: CLIENT_TOKEN }, {
    flush_interval_ms: 50
  });

  try {
    const startedAt = Date.now();
    await outbox.enqueue(event() as never);
    const elapsedMs = Date.now() - startedAt;
    assert.ok(elapsedMs < 500, `enqueue took ${elapsedMs}ms`);
    assert.equal((await outbox.status()).pending, 1);
  } finally {
    await outbox.close();
  }
});

test("outbox rejects unsafe roots and invalid events", async () => {
  const urlRoot = await makeRoot("mixlab-usage-outbox-url-");
  const tokenRoot = await makeRoot("mixlab-usage-outbox-token-");

  assert.throws(
    () => new UsageOutbox("relative/path", { base_url: "http://127.0.0.1:1", token: CLIENT_TOKEN }),
    /本机绝对路径/
  );
  assert.throws(
    () => new UsageOutbox(urlRoot, { base_url: "http://10.0.0.5:1", token: CLIENT_TOKEN }),
    /本机 HTTP/
  );
  assert.throws(
    () => new UsageOutbox(tokenRoot, { base_url: "http://127.0.0.1:1", token: "" }),
    /缺少客户端令牌/
  );
  assert.throws(() => canonicalUsageOutboxEvent(event({ event_type: "bad" })), /event_type/);
  assert.throws(() => canonicalUsageOutboxEvent(event({ selected_duration_ms: -1 })), /selected_duration_ms/);
  assert.equal(DEFAULT_USAGE_OUTBOX_BATCH_SIZE, 100);
});
