import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  applyCutterAccountMigration
} from "../../library-fs/src/cutter-account-migration.ts";
import {
  createCutterAccountsLegacy,
  cutterAccountsServiceFromEnv
} from "../../library-fs/src/cutter-account-client.ts";
import * as localAccounts from "../../library-fs/src/cutter-users.ts";
import {
  createCutterAccountService,
  readCutterAccountEntitlements,
  type CutterAccountService
} from "./cutter-account-service.ts";

const TOKEN = "fixture-account-token";

async function listen(service: CutterAccountService): Promise<string> {
  await new Promise<void>((resolve) => service.server.listen(0, "127.0.0.1", resolve));
  const address = service.server.address();
  assert.ok(address && typeof address === "object");
  return "http://127.0.0.1:" + (address as { port: number }).port;
}

async function callService(
  baseUrl: string,
  operation: string,
  args: unknown[],
  options: { token?: string; origin?: string } = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(baseUrl + "/accounts/v1", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + (options.token ?? TOKEN),
      ...(options.origin ? { Origin: options.origin } : {})
    },
    body: JSON.stringify({ operation, args })
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function fixture(t: TestContext): Promise<{
  root: string;
  state: string;
  legacy: string;
  cleanups: Array<() => Promise<void>>;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mixlab-account-service-"));
  const cleanups: Array<() => Promise<void>> = [];
  t.after(async () => {
    for (const cleanup of cleanups.reverse()) {
      await cleanup();
    }
    await rm(root, { recursive: true, force: true });
  });
  return { root, state: path.join(root, "state"), legacy: path.join(root, "legacy"), cleanups };
}

const registration = {
  username: "alice",
  password: "Fixture12345",
  device_id: "device-1",
  device_name: "夹具设备"
};

test("account service exposes login/register/validate/refresh/logout/list/approve/disable/reset/entitlements", async (t) => {
  const { state, cleanups } = await fixture(t);
  const service = await createCutterAccountService({ state_root: state, token: TOKEN });
  cleanups.push(() => service.close());
  const baseUrl = await listen(service);

  const registered = await callService(baseUrl, "register", [registration]);
  assert.equal(registered.status, 200);
  const user = registered.body.result as { user_id: string; username: string; password_hash?: string };
  assert.equal(user.username, "alice");
  assert.equal("password_hash" in user, false);
  assert.equal(JSON.stringify(registered.body).includes("password_hash"), false);

  const pendingLogin = await callService(baseUrl, "login", [registration]);
  const pendingResult = pendingLogin.body.result as { ok: boolean };
  assert.equal(pendingResult.ok, false);

  const approved = await callService(baseUrl, "approve", [{ user_id: user.user_id }]);
  assert.equal(approved.status, 200);

  const login = await callService(baseUrl, "login", [registration]);
  const loginResult = login.body.result as {
    ok: true;
    user: { user_id: string };
    session: { session_token: string; device_id: string };
  };
  assert.equal(loginResult.ok, true);
  const sessionToken = loginResult.session.session_token;

  const validated = await callService(baseUrl, "validate", [{
    device_id: registration.device_id,
    session_token: sessionToken
  }]);
  assert.equal((validated.body.result as { ok: boolean }).ok, true);

  const refreshed = await callService(baseUrl, "refresh", [{
    device_id: registration.device_id,
    session_token: sessionToken
  }]);
  const refreshResult = refreshed.body.result as { ok: boolean; refreshed_at: string };
  assert.equal(refreshResult.ok, true);
  assert.equal(typeof refreshResult.refreshed_at, "string");

  const listed = await callService(baseUrl, "list", []);
  assert.deepEqual(
    (listed.body.result as { users: Array<{ user_id: string }> }).users.map((item) => item.user_id),
    [user.user_id]
  );

  const reset = await callService(baseUrl, "reset_password", [{
    user_id: user.user_id,
    new_password: "Changed12345"
  }]);
  assert.equal(reset.status, 200);
  const loginWithNewPassword = await callService(baseUrl, "login", [{
    ...registration,
    password: "Changed12345"
  }]);
  assert.equal((loginWithNewPassword.body.result as { ok: boolean }).ok, true);

  const entitlementsSet = await callService(baseUrl, "set_entitlements", [{
    user_id: user.user_id,
    tier: "pro"
  }]);
  assert.equal(entitlementsSet.status, 200);
  const entitlements = await readCutterAccountEntitlements(state);
  assert.equal(entitlements.accounts[user.user_id], "pro");
  const listWithTiers = await callService(baseUrl, "list_with_tiers", []);
  assert.equal(
    (listWithTiers.body.result as { users: Array<{ tier: string }> }).users[0]?.tier,
    "pro"
  );

  const disabled = await callService(baseUrl, "disable", [{ user_id: user.user_id }]);
  assert.equal(disabled.status, 200);
  const disabledLogin = await callService(baseUrl, "login", [{
    ...registration,
    password: "Changed12345"
  }]);
  assert.equal((disabledLogin.body.result as { ok: boolean }).ok, false);

  const logout = await callService(baseUrl, "logout", [{ session_token: sessionToken }]);
  assert.equal(logout.status, 200);
  const afterLogout = await callService(baseUrl, "validate", [{
    device_id: registration.device_id,
    session_token: sessionToken
  }]);
  assert.equal((afterLogout.body.result as { ok: boolean }).ok, false);
});

test("account service rejects bad token, browser origins and non-POST routes", async (t) => {
  const { state, cleanups } = await fixture(t);
  const service = await createCutterAccountService({ state_root: state, token: TOKEN });
  cleanups.push(() => service.close());
  const baseUrl = await listen(service);

  const badToken = await callService(baseUrl, "list", [], { token: "wrong-token" });
  assert.equal(badToken.status, 401);
  assert.equal((badToken.body.error as { code: string }).code, "service_auth");

  const withOrigin = await callService(baseUrl, "list", [], { origin: "https://evil.example" });
  assert.equal(withOrigin.status, 403);
  assert.equal((withOrigin.body.error as { code: string }).code, "local_only");

  const getResponse = await fetch(baseUrl + "/accounts/v1", {
    headers: { Authorization: "Bearer " + TOKEN }
  });
  assert.equal(getResponse.status, 404);
});

test("account service is private-state only and feature flag switches clients to it", async (t) => {
  const { root, state, legacy, cleanups } = await fixture(t);
  const service = await createCutterAccountService({ state_root: state, token: TOKEN });
  cleanups.push(() => service.close());
  const baseUrl = await listen(service);

  const client = createCutterAccountsLegacy({ base_url: baseUrl, token: TOKEN });
  assert.equal(client.mode, "service");
  const clientNow = new Date().toISOString();
  const registered = await client.registerCutterAccount("ignored", { ...registration, now: clientNow });
  await client.approveCutterUser("ignored", { user_id: registered.user_id, now: clientNow });
  const login = await client.loginCutterAccount("ignored", { ...registration, now: clientNow });
  assert.equal(login.ok, true);
  const users = await client.listCutterUsers("ignored");
  assert.equal(users.users.some((user) => user.user_id === registered.user_id), true);

  // Legacy shared-library file is never created by the service-mode client.
  await assert.rejects(stat(path.join(legacy, ".mixlab-library", "cutter-users", "users.json")), {
    code: "ENOENT"
  });
  assert.ok((await readFile(path.join(state, ".mixlab-library", "cutter-users", "users.json"), "utf8")).includes("alice"));
  assert.ok(root.length > 0);
});

test("feature flag resolver is default-off, validates loopback URL and surfaces unavailable service", async () => {
  assert.equal(cutterAccountsServiceFromEnv({} as NodeJS.ProcessEnv), undefined);
  assert.deepEqual(
    cutterAccountsServiceFromEnv({
      MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL: "http://127.0.0.1:3891",
      MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN: "token"
    } as NodeJS.ProcessEnv),
    { base_url: "http://127.0.0.1:3891", token: "token" }
  );
  assert.throws(
    () => cutterAccountsServiceFromEnv({
      MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL: "http://127.0.0.1:3891"
    } as NodeJS.ProcessEnv),
    /SERVICE_TOKEN/
  );
  for (const badUrl of [
    "https://127.0.0.1:3891",
    "http://10.0.0.5:3891",
    "http://127.0.0.1:3891/path"
  ]) {
    assert.throws(
      () => crateAccountsForTest(badUrl),
      /本机 HTTP 根地址/
    );
  }

  const client = createCutterAccountsLegacy({
    base_url: "http://127.0.0.1:9",
    token: "token"
  });
  await assert.rejects(
    () => client.listCutterUsers("ignored"),
    (error) => {
      assert.equal((error as { code?: string }).code, "account_service_unavailable");
      return true;
    }
  );
});

function crateAccountsForTest(url: string) {
  return createCutterAccountsLegacy({ base_url: url, token: "token" });
}

test("migrated users can log in through the account service", async (t) => {
  const { state, legacy, cleanups } = await fixture(t);
  const timestamp = new Date().toISOString();
  const localUser = await localAccounts.registerCutterAccount(legacy, {
    username: "migrated",
    password: "Fixture12345",
    device_id: "legacy-device",
    device_name: "旧设备",
    now: timestamp
  });
  await localAccounts.approveCutterUser(legacy, { user_id: localUser.user_id, now: timestamp });

  const applied = await applyCutterAccountMigration({
    legacy_root: legacy,
    state_root: state,
    legacy_writers_stopped: true
  });
  assert.equal(applied.applied, true);

  const service = await createCutterAccountService({ state_root: state, token: TOKEN });
  cleanups.push(() => service.close());
  const baseUrl = await listen(service);
  const login = await callService(baseUrl, "login", [{
    username: "migrated",
    password: "Fixture12345",
    device_id: "legacy-device",
    device_name: "旧设备"
  }]);
  assert.equal((login.body.result as { ok: boolean }).ok, true);
});
