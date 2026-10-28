import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  applyCutterAccountMigration,
  rollbackCutterAccountMigration
} from "../../library-fs/src/cutter-account-migration.ts";
import { accountDirectory } from "../../library-fs/src/cutter-account-lock.ts";
import {
  createCutterAccounts,
  type CutterAccountConnection
} from "../../library-fs/src/cutter-account-client.ts";
import * as localAccounts from "../../library-fs/src/cutter-users.ts";
import {
  createCutterAccountService,
  resolveCutterAccountServiceConfigFromEnv,
  type CutterAccountService
} from "./cutter-account-service.ts";
import {
  listCutterUsersForAdmin,
  listCutterUsersWithTiersForAdmin,
  readCutterAccountEntitlementsForAdmin,
  runAdminDisableCutterUserCommand
} from "./admin-cutter-user-commands.ts";

const CLIENT_TOKEN = "fixture-client-token";
const ADMIN_TOKEN = "fixture-admin-token";
const REGISTRATION = {
  username: "alice",
  password: "Fixture12345",
  device_id: "device-1",
  device_name: "夹具设备"
};

async function listen(service: CutterAccountService): Promise<string> {
  await new Promise<void>((resolve) => service.server.listen(0, "127.0.0.1", resolve));
  const address = service.server.address();
  assert.ok(address && typeof address === "object");
  return "http://127.0.0.1:" + (address as { port: number }).port;
}

async function fixture(t: TestContext): Promise<{
  root: string; legacy: string; state: string; cleanups: Array<() => Promise<void>>;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mixlab-account-prod-"));
  const cleanups: Array<() => Promise<void>> = [];
  t.after(async () => {
    for (const cleanup of cleanups.reverse()) {
      await cleanup();
    }
    await rm(root, { recursive: true, force: true });
  });
  return { root, legacy: path.join(root, "legacy"), state: path.join(root, "state"), cleanups };
}

async function callRaw(
  baseUrl: string,
  operation: string,
  args: unknown[],
  token: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(baseUrl + "/accounts/v1", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ operation, args })
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

function flagEnv(baseUrl: string): NodeJS.ProcessEnv {
  return {
    MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL: baseUrl,
    MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN: CLIENT_TOKEN,
    MIXLAB_CUTTER_ACCOUNTS_SERVICE_ADMIN_TOKEN: ADMIN_TOKEN
  } as NodeJS.ProcessEnv;
}

function connection(baseUrl: string): CutterAccountConnection {
  return { base_url: baseUrl, token: CLIENT_TOKEN, admin_token: ADMIN_TOKEN };
}

test("split tokens enforce roles and allow admin superset", async (t) => {
  const { state, cleanups, legacy } = await fixture(t);
  const service = await createCutterAccountService({
    state_root: state,
    client_token: CLIENT_TOKEN,
    admin_token: ADMIN_TOKEN,
    warn: () => undefined
  });
  cleanups.push(() => service.close());
  const baseUrl = await listen(service);
  assert.equal(service.legacy_single_token, false);

  const registered = await callRaw(baseUrl, "register", [{ ...REGISTRATION, now: new Date().toISOString() }], CLIENT_TOKEN);
  assert.equal(registered.status, 200);
  const userId = (registered.body.result as { user_id: string }).user_id;

  for (const operation of ["list", "approve", "disable", "reset_password", "get_entitlements"]) {
    const denied = await callRaw(baseUrl, operation, operation === "approve" ? [{ user_id: userId }] : operation === "reset_password" ? [{ user_id: userId, new_password: "Changed12345" }] : [], CLIENT_TOKEN);
    assert.equal(denied.status, 403, operation);
    assert.equal((denied.body.error as { code: string }).code, "admin_required", operation);
  }

  const approved = await callRaw(baseUrl, "approve", [{ user_id: userId }], ADMIN_TOKEN);
  assert.equal(approved.status, 200);
  const clientList = await callRaw(baseUrl, "login", [{ ...REGISTRATION, now: new Date().toISOString() }], CLIENT_TOKEN);
  assert.equal((clientList.body.result as { ok: boolean }).ok, true);
  const adminList = await callRaw(baseUrl, "list", [], ADMIN_TOKEN);
  assert.equal((adminList.body.result as { users: unknown[] }).users.length, 1);
  assert.ok(legacy.length > 0);
});

test("legacy single-token configuration stays compatible and logs deprecation", async (t) => {
  const { state, cleanups } = await fixture(t);
  const warnings: string[] = [];
  const service = await createCutterAccountService({
    state_root: state,
    token: CLIENT_TOKEN,
    warn: (message) => warnings.push(message)
  });
  cleanups.push(() => service.close());
  assert.equal(service.legacy_single_token, true);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /单 token 兼容模式/);
  const baseUrl = await listen(service);
  const registered = await callRaw(baseUrl, "register", [{ ...REGISTRATION, now: new Date().toISOString() }], CLIENT_TOKEN);
  const userId = (registered.body.result as { user_id: string }).user_id;
  // In legacy mode the single token is the admin+client superset.
  const approved = await callRaw(baseUrl, "approve", [{ user_id: userId }], CLIENT_TOKEN);
  assert.equal(approved.status, 200);
});

test("service config resolver requires client token and rejects equal split tokens", () => {
  const legacy = resolveCutterAccountServiceConfigFromEnv({
    MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN: "client-only"
  } as NodeJS.ProcessEnv);
  assert.equal(legacy.legacy_single_token, true);
  assert.equal(legacy.admin_token, "client-only");

  const split = resolveCutterAccountServiceConfigFromEnv({
    MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN: "client",
    MIXLAB_CUTTER_ACCOUNTS_SERVICE_ADMIN_TOKEN: "admin"
  } as NodeJS.ProcessEnv);
  assert.equal(split.legacy_single_token, false);
  assert.equal(split.client_token, "client");
  assert.equal(split.admin_token, "admin");

  assert.throws(
    () => resolveCutterAccountServiceConfigFromEnv({
      MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN: "same",
      MIXLAB_CUTTER_ACCOUNTS_SERVICE_ADMIN_TOKEN: "same"
    } as NodeJS.ProcessEnv),
    /必须与 client token 不同/
  );
  assert.throws(
    () => resolveCutterAccountServiceConfigFromEnv({} as NodeJS.ProcessEnv),
    /必须配置/
  );
});

test("read providers follow the flag: legacy when off, service when on, fail-closed when unavailable", async (t) => {
  const { legacy, state, cleanups } = await fixture(t);
  const timestamp = new Date().toISOString();
  const legacyUser = await localAccounts.registerCutterAccount(legacy, {
    username: "legacy-only",
    password: "Fixture12345",
    device_id: "legacy-device",
    device_name: "旧设备",
    now: timestamp
  });
  await localAccounts.approveCutterUser(legacy, { user_id: legacyUser.user_id, now: timestamp });
  await applyCutterAccountMigration({ legacy_root: legacy, state_root: state, legacy_writers_stopped: true });

  const service = await createCutterAccountService({
    state_root: state,
    client_token: CLIENT_TOKEN,
    admin_token: ADMIN_TOKEN,
    warn: () => undefined
  });
  cleanups.push(() => service.close());
  const baseUrl = await listen(service);
  const accounts = createCutterAccounts(connection(baseUrl));

  // Add a service-only user; legacy store must stay unchanged.
  const serviceUser = await accounts.registerCutterAccount("ignored", { ...REGISTRATION, username: "service-only", now: timestamp });
  await accounts.approveCutterUser("ignored", { user_id: serviceUser.user_id, now: timestamp });

  const flagged = await listCutterUsersForAdmin({ library_root: legacy, env: flagEnv(baseUrl) });
  assert.deepEqual(
    flagged.users.map((user) => user.username).sort(),
    ["legacy-only", "service-only"].sort()
  );

  const legacyOnly = await listCutterUsersForAdmin({ library_root: legacy, env: {} as NodeJS.ProcessEnv });
  assert.deepEqual(legacyOnly.users.map((user) => user.username), ["legacy-only"]);
  assert.equal(
    (await listCutterUsersWithTiersForAdmin({ library_root: legacy, env: {} as NodeJS.ProcessEnv })).users.every(
      (user) => user.tier === "ordinary"
    ),
    true
  );

  // Entitlements read path resolves the service authority.
  await callRaw(baseUrl, "set_entitlements", [{ user_id: serviceUser.user_id, tier: "pro" }], ADMIN_TOKEN);
  const entitlements = await readCutterAccountEntitlementsForAdmin({ library_root: legacy, env: flagEnv(baseUrl) });
  assert.equal(entitlements.accounts[serviceUser.user_id], "pro");
  const localEntitlements = await readCutterAccountEntitlementsForAdmin({ library_root: legacy, env: {} as NodeJS.ProcessEnv });
  assert.deepEqual(localEntitlements.accounts, {});

  // Service unavailable => fail closed (no silent legacy fallback).
  const unavailable = createCutterAccounts({ base_url: "http://127.0.0.1:9", token: CLIENT_TOKEN });
  await assert.rejects(
    () => listCutterUsersForAdmin({ library_root: legacy, accounts: unavailable }),
    (error) => {
      assert.equal((error as { code?: string }).code, "account_service_unavailable");
      return true;
    }
  );
});

test("E2E: migrate -> flag on read path -> login -> disable -> rollback", async (t) => {
  const { legacy, state, cleanups } = await fixture(t);
  const timestamp = new Date().toISOString();
  const original = await localAccounts.registerCutterAccount(legacy, {
    username: "alice",
    password: "Fixture12345",
    device_id: "device-1",
    device_name: "夹具设备",
    now: timestamp
  });
  await localAccounts.approveCutterUser(legacy, { user_id: original.user_id, now: timestamp });
  const legacyRawBefore = await readFile(path.join(accountDirectory(legacy), "users.json"), "utf8");

  const applied = await applyCutterAccountMigration({ legacy_root: legacy, state_root: state, legacy_writers_stopped: true });
  assert.equal(applied.applied, true);

  const service = await createCutterAccountService({
    state_root: state,
    client_token: CLIENT_TOKEN,
    admin_token: ADMIN_TOKEN,
    warn: () => undefined
  });
  cleanups.push(() => service.close());
  const baseUrl = await listen(service);
  const accounts = createCutterAccounts(connection(baseUrl));

  const read = await listCutterUsersForAdmin({ library_root: legacy, env: flagEnv(baseUrl) });
  assert.deepEqual(read.users.map((user) => user.username), ["alice"]);

  const login = await accounts.loginCutterAccount("ignored", {
    username: "alice",
    password: "Fixture12345",
    device_id: "device-1",
    device_name: "夹具设备",
    now: timestamp
  });
  assert.equal(login.ok, true);

  const disabled = await runAdminDisableCutterUserCommand({
    library_root: legacy,
    now: timestamp,
    user_id: original.user_id,
    accounts
  });
  assert.equal(disabled.status, "disabled");
  const denied = await accounts.loginCutterAccount("ignored", {
    username: "alice",
    password: "Fixture12345",
    device_id: "device-1",
    device_name: "夹具设备",
    now: timestamp
  });
  assert.equal(denied.ok, false);

  await service.close();
  const rollback = await rollbackCutterAccountMigration({
    legacy_root: legacy,
    state_root: state,
    legacy_writers_stopped: true
  });
  assert.equal(rollback.rolled_back, true);
  assert.equal(
    await readFile(path.join(accountDirectory(legacy), "users.json"), "utf8"),
    legacyRawBefore
  );
  const legacyAfter = await listCutterUsersForAdmin({ library_root: legacy, env: {} as NodeJS.ProcessEnv });
  assert.equal(legacyAfter.users[0]?.status, "approved");
});
