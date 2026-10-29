import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  readUsageServiceMetrics,
  requestUsageService,
  usageServiceFromEnv,
  usageServiceMode,
  usageServiceUrl
} from "./usage-service-client.ts";

test("usage service connection is parsed from env with role-specific token", () => {
  assert.equal(usageServiceFromEnv({}), undefined);
  assert.deepEqual(
    usageServiceFromEnv({ MIXLAB_USAGE_SERVICE_URL: "http://127.0.0.1:3900", MIXLAB_USAGE_SERVICE_TOKEN: "client-token" }),
    { base_url: "http://127.0.0.1:3900", token: "client-token" }
  );
  assert.equal(
    usageServiceFromEnv(
      { MIXLAB_USAGE_SERVICE_URL: "http://127.0.0.1:3900", MIXLAB_USAGE_SERVICE_ADMIN_TOKEN: "admin-token" },
      "admin"
    )?.token,
    "admin-token"
  );
  assert.equal(usageServiceMode(undefined), "legacy-ndjson");
  assert.equal(
    usageServiceMode({ base_url: "http://127.0.0.1:3900", token: "t" }),
    "isolated-service"
  );
});

test("usage service url only accepts credentialed loopback root addresses", () => {
  assert.throws(
    () => usageServiceUrl({ base_url: "http://192.168.1.20:3900", token: "t" }),
    /本机 HTTP/
  );
  assert.throws(
    () => usageServiceUrl({ base_url: "https://127.0.0.1:3900", token: "t" }),
    /本机 HTTP/
  );
  assert.throws(
    () => usageServiceUrl({ base_url: "http://127.0.0.1:3900/sub", token: "t" }),
    /本机 HTTP/
  );
  assert.throws(
    () => usageServiceUrl({ base_url: "http://127.0.0.1:3900", token: "" }),
    /缺少客户端令牌/
  );
});

test("usage service client sends bearer auth and maps failures to contract codes", async () => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url} auth=${request.headers.authorization ?? ""}`);
    if (request.url === "/usage/v1/identity") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ store_id: "store-1" }));
      return;
    }
    if (request.url === "/usage/v1/metrics") {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { code: "service_auth", message: "bad token" } }));
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { code: "route_missing" } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const connection = { base_url: `http://127.0.0.1:${address.port}`, token: "t-1" };

  try {
    const identity = await requestUsageService<{ store_id: string }>(connection, "/usage/v1/identity");
    assert.equal(identity.store_id, "store-1");
    assert.equal(requests[0], "GET /usage/v1/identity auth=Bearer t-1");

    await assert.rejects(
      () => readUsageServiceMetrics(connection),
      (error: unknown) =>
        (error as { code?: string }).code === "AGENT_UNAVAILABLE" &&
        (error as { status?: number }).status === 401 &&
        (error as { service_code?: string }).service_code === "service_auth"
    );

    await assert.rejects(
      () => requestUsageService({ base_url: "http://127.0.0.1:9", token: "t-1" }, "/usage/v1/identity"),
      (error: unknown) =>
        (error as { code?: string }).code === "AGENT_UNAVAILABLE" &&
        (error as { service_code?: string }).service_code === "usage_service_unavailable"
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
