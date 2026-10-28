import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  accountsServiceFromEnv,
  accountsServiceMode,
  accountServiceUrl,
  createCutterAccountsClient,
  mapAccountServiceErrorDefault
} from "./cutter-account-client.ts";
import {
  createContractUsageServiceClient,
  usageServiceFromEnv,
  usageServiceUrl
} from "./usage-service-client.ts";

test("legacy usage client parses env, validates loopback url and reads admin metrics path", async () => {
  assert.equal(usageServiceFromEnv({}), undefined);
  assert.deepEqual(usageServiceFromEnv({ MIXLAB_USAGE_SERVICE_URL: "http://127.0.0.1:3900", MIXLAB_USAGE_SERVICE_TOKEN: "t" }), { base_url: "http://127.0.0.1:3900", token: "t" });
  assert.throws(() => usageServiceUrl({ base_url: "http://10.0.0.5:1", token: "t" }), /本机 HTTP/);

  const paths: string[] = [];
  const server = createServer((request, response) => {
    paths.push(String(request.url));
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ metrics: { ok: true } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const api = createContractUsageServiceClient();
    const connection = { base_url: "http://127.0.0.1:" + (server.address() as { port: number }).port, token: "t" };
    await api.requestUsageService(connection, "/usage/v1/identity");
    assert.deepEqual(paths, ["/usage/v1/identity"]);
    assert.throws(() => api.usageServiceUrl({ base_url: "http://127.0.0.1:1", token: "" }), /缺少客户端令牌/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("contract usage client maps service failures to contract error codes", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { code: "service_auth", message: "bad" } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const api = createContractUsageServiceClient();
    const connection = { base_url: "http://127.0.0.1:" + (server.address() as { port: number }).port, token: "t" };
    await assert.rejects(
      () => api.requestUsageService(connection, "/usage/v1/identity"),
      (error: unknown) => (error as { code?: string }).code === "AGENT_UNAVAILABLE" && (error as { status?: number }).status === 401 && (error as { service_code?: string }).service_code === "service_auth"
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("account factory is local-only by default and proxies configured operations with stable request shape", async () => {
  const local = {
    mode: "local" as const,
    loginCutterAccount: async (_root: string, input: { username: string }) => ({ ok: true, user: input.username }),
    validateCutterSession: async () => ({ ok: false, reason: "local" })
  };
  assert.equal(createCutterAccountsClient({ local }), local);
  assert.equal(accountsServiceMode(undefined), "local-users-file");
  assert.deepEqual(
    accountsServiceFromEnv({ MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL: "http://127.0.0.1:1", MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN: "t" }, {
      url_env_names: ["MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL"], token_env_names: ["MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN"]
    }),
    { base_url: "http://127.0.0.1:1", token: "t" }
  );
  assert.throws(() => accountServiceUrl({ base_url: "http://10.0.0.5:1", token: "t" }), /本机 HTTP/);

  const requests: Array<{ operation?: string; auth?: string; args?: unknown[] }> = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { operation: string; args: unknown[] };
    requests.push({ operation: body.operation, auth: request.headers.authorization, args: body.args });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ result: { ok: true, operation: body.operation } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const accounts = createCutterAccountsClient({
      connection: { base_url: "http://127.0.0.1:" + (server.address() as { port: number }).port, token: "account-token" },
      local,
      operation_names: { loginCutterAccount: "login", validateCutterSession: "validate" }
    });
    assert.equal(accounts.mode, "service");
    assert.deepEqual(await accounts.loginCutterAccount("/lib", { username: "alice" }), { ok: true, operation: "login" });
    assert.deepEqual(requests[0], { operation: "login", auth: "Bearer account-token", args: [{ username: "alice" }] });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("account factory fails closed and maps service errors", async () => {
  const local = { loginCutterAccount: async (_root: string) => ({ ok: true }) };
  const accounts = createCutterAccountsClient({
    connection: { base_url: "http://127.0.0.1:9", token: "t" },
    local
  });
  await assert.rejects(
    () => accounts.loginCutterAccount("/lib"),
    (error: unknown) => (error as { code?: string }).code === "AGENT_UNAVAILABLE" && (error as { service_area?: string }).service_area === "accounts"
  );
  const mapped = mapAccountServiceErrorDefault({ status: 403, service_code: "admin_required", message: "admin" });
  assert.equal(mapped.code, "AUTH_FORBIDDEN");
});


test("account client picks the admin token for admin operations when split tokens are configured", async () => {
  const seen: Array<{ authorization?: string; operation?: string }> = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { operation: string };
    seen.push({ authorization: request.headers.authorization, operation: body.operation });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ result: { ok: true } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const client = createCutterAccountsClient({
    connection: { base_url: `http://127.0.0.1:${port}`, token: "client-token", admin_token: "admin-token" },
    local: { loginCutterAccount: async (_root: string) => ({ ok: false }), listCutterUsers: async (_root: string) => ({ users: [] }) },
    operation_names: { loginCutterAccount: "login", listCutterUsers: "list" }
  });
  try {
    await client.loginCutterAccount("/tmp/library");
    await client.listCutterUsers("/tmp/library");
    assert.equal(seen[0]?.operation, "login");
    assert.equal(seen[0]?.authorization, "Bearer client-token");
    assert.equal(seen[1]?.operation, "list");
    assert.equal(seen[1]?.authorization, "Bearer admin-token");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("account client falls back to the primary token when no admin token is configured", async () => {
  const seen: Array<string | undefined> = [];
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* drain */ }
    seen.push(request.headers.authorization);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ result: { ok: true } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const client = createCutterAccountsClient({
    connection: { base_url: `http://127.0.0.1:${port}`, token: "only-token" },
    local: { approveCutterUser: async (_root: string, _userId?: string) => ({ ok: false }) },
    operation_names: { approveCutterUser: "approve" }
  });
  try {
    await client.approveCutterUser("/tmp/library", "CU000001");
    assert.equal(seen[0], "Bearer only-token");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});


test("account client rejects malformed responses instead of resolving undefined", async () => {
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* drain */ }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const base = { base_url: `http://127.0.0.1:${port}`, token: "t" };
  const local = { loginCutterAccount: async (_root: string) => ({ ok: false }) };

  // Missing result: must throw instead of silently resolving undefined.
  const missing = createCutterAccountsClient({ connection: base, local });
  try {
    await assert.rejects(
      () => (missing.loginCutterAccount as (root: string) => Promise<unknown>)("/tmp/library"),
      (error: unknown) => Boolean(error) && (error as { code?: string }).code === "AGENT_UNAVAILABLE"
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // Non-JSON body: must throw a retryable unavailable error (HTTP 503 class).
  const server2 = createServer(async (request, response) => {
    for await (const _chunk of request) { /* drain */ }
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("not-json");
  });
  await new Promise<void>((resolve) => server2.listen(0, "127.0.0.1", resolve));
  const port2 = (server2.address() as { port: number }).port;
  const invalid = createCutterAccountsClient({ connection: { base_url: `http://127.0.0.1:${port2}`, token: "t" }, local });
  try {
    await assert.rejects(
      () => (invalid.loginCutterAccount as (root: string) => Promise<unknown>)("/tmp/library"),
      (error: unknown) => (error as { code?: string }).code === "AGENT_UNAVAILABLE"
    );
  } finally {
    await new Promise<void>((resolve) => server2.close(() => resolve()));
  }
});
