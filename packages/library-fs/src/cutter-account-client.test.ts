import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import * as localUsers from "./cutter-users.ts";
import {
  accountServiceFromEnv,
  accountsServiceMode,
  createCutterAccounts
} from "./cutter-account-client.ts";

test("account service connection is parsed from env (primary + legacy names)", () => {
  assert.equal(accountServiceFromEnv({}), undefined);
  assert.deepEqual(
    accountServiceFromEnv({
      MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL: "http://127.0.0.1:3901",
      MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN: "client-token"
    }),
    { base_url: "http://127.0.0.1:3901", token: "client-token" }
  );
  assert.deepEqual(
    accountServiceFromEnv({
      MIXLAB_ACCOUNT_SERVICE_URL: "http://127.0.0.1:3901",
      MIXLAB_ACCOUNT_SERVICE_TOKEN: "legacy-token"
    }),
    { base_url: "http://127.0.0.1:3901", token: "legacy-token" }
  );
  assert.equal(accountsServiceMode(undefined), "local-users-file");
});

test("local account mode keeps using cutter-users implementations", () => {
  const accounts = createCutterAccounts(undefined);
  assert.equal(accounts.loginCutterAccount, localUsers.loginCutterAccount);
  assert.equal(accounts.validateCutterSession, localUsers.validateCutterSession);
  assert.equal(accounts.registerCutterAccount, localUsers.registerCutterAccount);
});

test("account service client proxies operations and maps errors to contract codes", async () => {
  const requests: Array<{ operation?: string; args?: unknown[]; auth?: string }> = [];
  let mode: "ok" | "unauthorized" | "invalid" | "admin" = "ok";
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      operation: string;
      args: unknown[];
    };
    requests.push({ operation: body.operation, args: body.args, auth: request.headers.authorization });

    if (mode === "unauthorized") {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { code: "service_auth", message: "bad token" } }));
      return;
    }
    if (mode === "invalid") {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { code: "account_operation", message: "账号操作失败" } }));
      return;
    }
    if (mode === "admin") {
      response.writeHead(403, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { code: "admin_required", message: "需要管理凭据" } }));
      return;
    }

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ result: { ok: true, operation: body.operation } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const accounts = createCutterAccounts({
    base_url: `http://127.0.0.1:${address.port}`,
    token: "account-token"
  });

  try {
    const result = await accounts.loginCutterAccount("/library", {
      username: "剪辑师",
      password: "secret",
      device_id: "device-1"
    } as never);
    // The public local API keeps camelCase names, but the isolated service RPC uses snake_case.
    assert.deepEqual(result, { ok: true, operation: "login" });
    assert.equal(requests[0]?.operation, "login");
    assert.equal(requests[0]?.auth, "Bearer account-token");
    assert.deepEqual(requests[0]?.args, [{ username: "剪辑师", password: "secret", device_id: "device-1" }]);

    mode = "unauthorized";
    await assert.rejects(
      () => accounts.validateCutterSession("/library", { device_id: "d", session_token: "t" } as never),
      (error: unknown) =>
        (error as { code?: string }).code === "AGENT_UNAVAILABLE" &&
        (error as { service_area?: string }).service_area === "accounts"
    );

    mode = "invalid";
    await assert.rejects(
      () => accounts.loginCutterAccount("/library", { username: "a", password: "b" } as never),
      (error: unknown) =>
        (error as { code?: string }).code === "VALIDATION_FAILED" &&
        /账号操作失败/.test((error as Error).message)
    );

    mode = "admin";
    await assert.rejects(
      () => accounts.listCutterUsers("/library"),
      (error: unknown) => (error as { code?: string }).code === "AUTH_FORBIDDEN"
    );

    const offline = createCutterAccounts({ base_url: "http://127.0.0.1:9", token: "account-token" });
    await assert.rejects(
      () => offline.loginCutterAccount("/library", {} as never),
      (error: unknown) => (error as { code?: string }).code === "AGENT_UNAVAILABLE"
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
