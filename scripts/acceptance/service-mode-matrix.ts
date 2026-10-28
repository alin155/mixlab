/**
 * Round5 service-mode acceptance matrix (admin/cutter/smart account + usage event services).
 *
 * Runs the admin account service and usage (event) service IN-PROCESS on ephemeral loopback
 * ports with private temp state roots; no real deployment, no NAS, no production data.
 *
 * Coverage:
 *  A. flag OFF / legacy: shared-library users.json account path (admin + cutter client + smart
 *     client), legacy local usage-event path (no usage service configured).
 *  B. account service flag ON: register/login/validate/list/approve/disable via the service
 *     client, wrong-token rejection, service-down fail-closed (no silent users.json fallback).
 *  C. usage service flag ON: outbox delivery + ACK, duplicate event_id idempotency, metrics via
 *     admin token, client token cannot read metrics, offline retention + catch-up, destination
 *     (store identity) change fail-closed, batch/payload capacity bounds.
 *
 * Usage: node --import tsx scripts/acceptance/service-mode-matrix.ts [--json]
 * Exit code 0 = all PASS, 1 = any FAIL. A human-readable table is printed at the end.
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CONTRACT_VERSION, type EventEnvelopeV1, type MixlabEventTypeV1 } from "../../packages/contracts/src/index.ts";
import { createCutterAccountService } from "../../packages/admin-api/src/cutter-account-service.ts";
import { createUsageService } from "../../packages/admin-api/src/usage-service.ts";
import {
  appendUsageEvent,
  approveCutterUser,
  disableCutterUser,
  listCutterUsers,
  loginCutterAccount,
  readUsageMetrics,
  registerCutterAccount,
  validateCutterSession
} from "../../packages/library-fs/src/index.ts";
import { createCutterAccounts, createCutterAccountsFromEnv } from "../../packages/library-fs/src/cutter-account-client.ts";
import { UsageOutbox } from "../../packages/library-fs/src/usage-outbox.ts";
import {
  UsageServiceClientError,
  postUsageServiceEvents,
  readUsageServiceHealth,
  readUsageServiceMetrics,
  usageServiceFromEnv,
  type UsageServiceConnection
} from "../../packages/library-fs/src/usage-service-client.ts";
import { canonicalUsageEvent } from "../../packages/library-fs/src/usage-service-store.ts";

const SMART_REPO = process.env.MIXLAB_SMART_CUTTER_REPO ?? "/Users/huaqihang/Documents/Codex/implementations/mixlab-smart-cutter";
const CLIENT_TOKEN = "matrix-usage-client-token";
const ADMIN_TOKEN = "matrix-usage-admin-token";
const ACCOUNT_TOKEN = "matrix-account-token";

interface Row { area: string; scenario: string; status: "PASS" | "FAIL" | "SKIP"; detail: string }
const rows: Row[] = [];
const cleanups: Array<() => Promise<void> | void> = [];
async function cleanupAll(): Promise<void> {
  for (const cleanup of cleanups.reverse()) {
    try { await cleanup(); } catch { /* best effort */ }
  }
}
let usageBootError = "";
/** Event-service checks are skipped (not hidden) when the service cannot boot in this runtime. */
function requiresUsageService(area: string, scenario: string): boolean {
  return area === "usage-service" && !scenario.includes("offline retention (no service)") && !scenario.includes("boot:");
}
async function check(area: string, scenario: string, action: () => Promise<string> | string): Promise<void> {
  if (usageBootError && requiresUsageService(area, scenario)) {
    rows.push({ area, scenario, status: "SKIP", detail: `blocked: usage service boot failed — ${usageBootError}` });
    return;
  }
  const started = Date.now();
  console.log(`[RUN] ${area} :: ${scenario}`);
  const timeout = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("check timed out after 20s")), 20_000);
    timer.unref?.();
  });
  try {
    const detail = await Promise.race([Promise.resolve().then(action), timeout]);
    rows.push({ area, scenario, status: "PASS", detail: `${detail} (${Date.now() - started}ms)` });
    console.log(`[PASS] ${area} :: ${scenario}`);
  } catch (error) {
    rows.push({ area, scenario, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
    console.log(`[FAIL] ${area} :: ${scenario} -> ${error instanceof Error ? error.message : String(error)}`);
  }
}
function equal(actual: unknown, expected: unknown, label: string): void {
  assert.equal(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
async function freeTemp(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function listen(server: { listen(port: number, host: string, cb: () => void): unknown; address(): unknown }): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  const address = server.address() as { port: number };
  return address.port;
}
/** Reserve and immediately release an ephemeral loopback port (simulates an unreachable service). */
async function reserveClosedPort(): Promise<number> {
  const { createServer } = await import("node:net");
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}
interface WaitForOptions {
  timeout_ms?: number;
  initial_interval_ms?: number;
  max_interval_ms?: number;
  /** Optional driver executed before every poll (used to force outbox delivery instead of relying on its 2s timer). */
  on_poll?: (attempt: number) => Promise<void> | void;
}

/**
 * Bounded polling with exponential backoff. Never waits forever; a transient throw/timeout inside
 * the predicate is retried until the deadline and surfaced in the final error. The Round7 fix for
 * the destination-change flake: callers can pass a larger window and drive outbox.flush() on every
 * poll, so a loaded CI machine cannot miss the outbox timer window.
 */
async function waitFor<T>(predicate: () => Promise<T | null | undefined | false> | T | null | undefined | false, label: string, timeout_or_options: number | WaitForOptions = 15_000): Promise<T> {
  const options: WaitForOptions = typeof timeout_or_options === "number" ? { timeout_ms: timeout_or_options } : timeout_or_options;
  const timeout_ms = options.timeout_ms ?? 15_000;
  const deadline = Date.now() + timeout_ms;
  let interval = Math.max(5, options.initial_interval_ms ?? 25);
  const maxInterval = Math.max(interval, options.max_interval_ms ?? 1_000);
  let attempt = 0;
  let lastError = "";
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      if (options.on_poll) await options.on_poll(attempt);
      const value = await predicate();
      if (value !== null && value !== undefined && value !== false) return value as T;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise(resolve => setTimeout(resolve, interval));
    interval = Math.min(maxInterval, Math.round(interval * 1.5));
  }
  throw new Error(`waitFor timed out after ${timeout_ms}ms (${attempt} polls): ${label}${lastError ? " (last error: " + lastError + ")" : ""}`);
}
function envelope(event_type: MixlabEventTypeV1, payload: Record<string, unknown> = {}): EventEnvelopeV1 {
  return {
    schema_version: "1.0",
    event_id: `evt_matrix_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    event_type,
    occurred_at: new Date().toISOString(),
    device_id: "matrix-device",
    user_id: "CU000001",
    payload: { username: "matrix-user", ...payload },
    client: { product: "cutter", version: "0.19.0", contract_version: CONTRACT_VERSION }
  };
}

async function main(): Promise<void> {
  // ---------------------------------------------------------------------------------------------
  // A. flag OFF / legacy paths
  // ---------------------------------------------------------------------------------------------
  const legacyLibrary = await freeTemp("mixlab-matrix-legacy-library-");
  const registration = { username: "matrix-legacy", password: "matrix-pass-123", device_id: "matrix-device", device_name: "matrix", now: new Date().toISOString() };
  let legacyUserId = "";
  let legacySessionToken = "";

  await check("flag-off", "legacy shared users.json: register -> pending -> approve -> login -> validate -> list", async () => {
    const registered = await registerCutterAccount(legacyLibrary, registration);
    legacyUserId = registered.user_id;
    equal(registered.status, "pending", "registered status");
    const pendingLogin = await loginCutterAccount(legacyLibrary, registration);
    equal(pendingLogin.ok, false, "pending login must be refused");
    assert.match(String((pendingLogin as { reason?: string }).reason), /审核/);
    await approveCutterUser(legacyLibrary, { user_id: legacyUserId, now: new Date().toISOString() });
    const login = await loginCutterAccount(legacyLibrary, registration);
    equal(login.ok, true, "approved login");
    if (!login.ok) throw new Error(login.reason);
    legacySessionToken = login.session.session_token;
    const validation = await validateCutterSession(legacyLibrary, { device_id: "matrix-device", session_token: legacySessionToken, now: new Date().toISOString(), touch: false });
    equal(validation.ok, true, "validate approved session");
    const users = await listCutterUsers(legacyLibrary);
    equal(users.users.length, 1, "list users");
    return `user=${legacyUserId}, session validated, users=${users.users.length}`;
  });

  await check("flag-off", "cutter account client env OFF -> local mode, legacy login works, no HTTP service", async () => {
    const client = createCutterAccountsFromEnv({});
    equal(client.mode, "local", "cutter client mode");
    const login = await client.loginCutterAccount(legacyLibrary, registration);
    equal(login.ok, true, "cutter local login");
    return "cutter client mode=local, legacy login ok";
  });

  await check("flag-off", "flag flip detection: env URL set -> cutter client mode=service (not used yet)", async () => {
    const client = createCutterAccountsFromEnv({ MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL: "http://127.0.0.1:3891", MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN: "t" });
    equal(client.mode, "service", "cutter client mode with URL");
    return "env flag switches cutter client to service mode";
  });

  await check("flag-off", "smart account client env OFF -> local mode and reads the same legacy users.json", async () => {
    const module = await import(pathToFileURL(path.join(SMART_REPO, "packages/smart-cutter/src/cutter-account-client.ts")).href);
    const client = module.createSmartAccountClientFromEnv({});
    equal(client.mode, "local", "smart client mode");
    const login = await client.login(legacyLibrary, registration);
    equal(login.ok, true, "smart legacy login via shared users.json");
    const validation = await client.validate(legacyLibrary, { device_id: "matrix-device", session_token: legacySessionToken, now: new Date().toISOString() });
    equal(validation.ok, true, "smart legacy validate");
    return "smart mode=local, legacy login/validate ok (cross-repo schema compatible)";
  });

  await check("flag-off", "legacy usage path: usageServiceFromEnv({}) undefined + appendUsageEvent/readUsageMetrics", async () => {
    equal(usageServiceFromEnv({}), undefined, "no usage service configured");
    await appendUsageEvent(legacyLibrary, {
      event_id: "evt_matrix_legacy_usage_0001",
      user_id: "CU000001",
      username: "matrix-user",
      device_id: "matrix-device",
      event_type: "cut_success",
      occurred_at: new Date().toISOString()
    });
    const metrics = await readUsageMetrics(legacyLibrary);
    equal(metrics.cut_success_count, 1, "legacy metrics cut_success_count");
    return "legacy local usage-events path works without a service";
  });

  // ---------------------------------------------------------------------------------------------
  // B. account service flag ON
  // ---------------------------------------------------------------------------------------------
  const accountState = await freeTemp("mixlab-matrix-account-state-");
  const accountService = await createCutterAccountService({ state_root: accountState, token: ACCOUNT_TOKEN });
  cleanups.push(() => accountService.close());
  const accountPort = await listen(accountService.server);
  const accountConnection = { base_url: `http://127.0.0.1:${accountPort}`, token: ACCOUNT_TOKEN };
  const accountClient = createCutterAccounts(accountConnection);
  const accountInput = { username: "matrix-service", password: "matrix-pass-123", device_id: "matrix-device", device_name: "matrix", now: new Date().toISOString() };
  let serviceUser: { user_id: string } | null = null;
  let serviceSession = "";

  await check("account-service", "service client: register -> pending login refused", async () => {
    const registered = await accountClient.registerCutterAccount("/ignored", accountInput as never);
    serviceUser = registered;
    equal(registered.status, "pending", "service register pending");
    const login = await accountClient.loginCutterAccount("/ignored", accountInput as never);
    equal(login.ok, false, "pending service login refused");
    return `user=${registered.user_id}, pending login refused`;
  });

  await check("account-service", "admin operation via service: approve, login, validate, list", async () => {
    await accountClient.approveCutterUser("/ignored", { user_id: serviceUser!.user_id, now: new Date().toISOString() } as never);
    const login = await accountClient.loginCutterAccount("/ignored", accountInput as never);
    equal(login.ok, true, "approved service login");
    if (!login.ok) throw new Error(login.reason);
    serviceSession = login.session.session_token;
    const validation = await accountClient.validateCutterSession("/ignored", { device_id: "matrix-device", session_token: serviceSession, now: new Date().toISOString(), touch: false } as never);
    equal(validation.ok, true, "service validate");
    const listed = await accountClient.listCutterUsers("/ignored") as { users: Array<{ user_id: string; status: string }> };
    equal(listed.users.length, 1, "service list users");
    equal(listed.users[0]!.status, "approved", "listed status approved");
    return "approve -> login -> validate -> list all via /accounts/v1";
  });

  await check("account-service", "disable via service: validate/login fail-closed with account reason", async () => {
    await accountClient.disableCutterUser("/ignored", { user_id: serviceUser!.user_id, now: new Date().toISOString() } as never);
    const validation = await accountClient.validateCutterSession("/ignored", { device_id: "matrix-device", session_token: serviceSession, now: new Date().toISOString(), touch: false } as never);
    equal(validation.ok, false, "disabled session invalid (sessions revoked on disable)");
    assert.match(String((validation as { reason?: string }).reason), /登录凭证无效|停用/);
    const login = await accountClient.loginCutterAccount("/ignored", accountInput as never);
    equal(login.ok, false, "disabled login refused");
    assert.match(String((login as { reason?: string }).reason), /停用/);
    return "disabled account: session revoked + login refused with 停用 reason";
  });

  await check("account-service", "wrong service token -> service_auth (401), no fallback", async () => {
    const bad = createCutterAccounts({ base_url: accountConnection.base_url, token: "wrong-token" });
    await assert.rejects(
      bad.listCutterUsers("/ignored") as Promise<unknown>,
      (error: unknown) => (error as { code?: string; status?: number }).code === "service_auth" && (error as { status?: number }).status === 401
    );
    return "wrong token rejected with service_auth/401";
  });

  await check("account-service", "service unavailable -> account_service_unavailable, shared users.json not written", async () => {
    await accountService.close();
    const isolatedLibrary = await freeTemp("mixlab-matrix-account-isolated-library-");
    const client = createCutterAccounts(accountConnection);
    await assert.rejects(
      client.validateCutterSession(isolatedLibrary, { device_id: "matrix-device", session_token: serviceSession, now: new Date().toISOString(), touch: false } as never),
      (error: unknown) => (error as { code?: string; status?: number }).code === "account_service_unavailable" && (error as { status?: number }).status === 503
    );
    const usersFile = path.join(isolatedLibrary, ".mixlab-library", "cutter-users", "users.json");
    const exists = await stat(usersFile).then(() => true, () => false);
    equal(exists, false, "no silent fallback users.json write");
    return "fail-closed 503 account_service_unavailable; no users.json fallback";
  });

  // ---------------------------------------------------------------------------------------------
  // C. usage (event) service flag ON
  // ---------------------------------------------------------------------------------------------
  const usageState = await freeTemp("mixlab-matrix-usage-state-");
  let usageService: Awaited<ReturnType<typeof createUsageService>> | null = null;
  let clientConnection: UsageServiceConnection;
  let adminConnection: UsageServiceConnection;
  try {
    usageService = await createUsageService({ state_root: usageState, client_token: CLIENT_TOKEN, admin_token: ADMIN_TOKEN });
  } catch (error) {
    usageBootError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    rows.push({ area: "usage-service", scenario: "boot: in-process usage service on temp state root", status: "FAIL",
      detail: `${usageBootError} — admin Round4 candidate bug: packages/library-fs/src/usage-service-store.ts:424 calls new DatabaseSync(path, undefined); Node >=26 requires an options object (fix: pass { ...(read_only ? { readOnly: true } : {}) }). Event-service rows stay SKIPPED until that production fix lands (outside round5 allowed scope).` });
  }
  if (usageService) {
    cleanups.push(() => usageService?.close());
    const usagePort = await listen(usageService.server);
    clientConnection = { base_url: `http://127.0.0.1:${usagePort}`, token: CLIENT_TOKEN, admin_token: ADMIN_TOKEN };
    adminConnection = { base_url: `http://127.0.0.1:${usagePort}`, token: ADMIN_TOKEN, admin_token: ADMIN_TOKEN };
  } else {
    clientConnection = { base_url: "http://127.0.0.1:1", token: CLIENT_TOKEN };
    adminConnection = { base_url: "http://127.0.0.1:1", token: ADMIN_TOKEN };
  }

  await check("usage-service", "health + identity (loopback, temp state root)", async () => {
    const health = await readUsageServiceHealth(clientConnection);
    equal(health.status, "ok", "health status");
    equal(health.service, "mixlab-usage-service", "service name");
    assert.ok(health.store_id.length > 0);
    return `store_id=${health.store_id}, schema=${health.schema_version}, contract=${health.contract_version}`;
  });

  const outboxRoot = await freeTemp("mixlab-matrix-usage-outbox-");
  const outbox = new UsageOutbox(outboxRoot, clientConnection);
  cleanups.push(() => outbox.close());
  const batch = [
    envelope("search", { query: "现金流", result_status: "success", search_mode: "sqlite-index", search_elapsed_ms: 12, search_page_type: "first" }),
    envelope("cut_success", { source_video_id: "V000001", selected_duration_ms: 1700 }),
    envelope("cut_failure", { source_video_id: "V000002", selected_duration_ms: 800 })
  ];

  await check("usage-service", "outbox enqueue -> flush -> ACK (pending drains, store pinned)", async () => {
    for (const event of batch) await outbox.enqueue(event);
    await waitFor(async () => (await outbox.status()).total === 3, "outbox total=3");
    await outbox.flush();
    const status = await waitFor(async () => { const value = await outbox.status(); return value.pending === 0 ? value : null; }, "outbox pending=0");
    equal(status.total, 3, "outbox total");
    assert.ok(status.store_id.length > 0, "outbox destination store_id pinned");
    return `delivered=3, acknowledged=3, store_id=${status.store_id}`;
  });

  await check("usage-service", "admin metrics: admin token reads metrics, client token forbidden", async () => {
    const metrics = await readUsageServiceMetrics(adminConnection);
    equal(metrics.event_count, 3, "metrics event_count");
    equal(metrics.store_id, usageService.store_id, "metrics store_id");
    await assert.rejects(
      readUsageServiceMetrics({ base_url: clientConnection.base_url, token: CLIENT_TOKEN }),
      (error: unknown) => (error as UsageServiceClientError).code === "admin_required" && (error as UsageServiceClientError).status === 403
    );
    return "admin metrics ok (event_count=3); client token -> admin_required/403";
  });

  await check("usage-service", "duplicate event_id idempotency: re-post acknowledged without duplication", async () => {
    const ack = await postUsageServiceEvents(clientConnection, batch);
    equal(ack.inserted, 0, "re-post inserted");
    equal(ack.duplicate_count, 3, "re-post duplicate_count");
    equal(ack.acknowledged.length, 3, "re-post acknowledged count");
    return "re-post: inserted=0, duplicate_count=3, acknowledged=3";
  });

  await check("usage-service", "client token / wrong token rejected on ingest", async () => {
    await assert.rejects(
      postUsageServiceEvents({ base_url: clientConnection.base_url, token: "wrong-token" }, [envelope("search", { query: "x" })]),
      (error: unknown) => (error as UsageServiceClientError).code === "AUTH_REQUIRED" && (error as UsageServiceClientError).status === 401
    );
    return "wrong bearer -> AUTH_REQUIRED/401";
  });

  await check("usage-service", "capacity bounds: >100 events per batch rejected (413), >8KiB event rejected", async () => {
    const tooMany = Array.from({ length: 101 }, () => envelope("search", { query: "batch" }));
    await assert.rejects(
      postUsageServiceEvents(clientConnection, tooMany),
      (error: unknown) => (error as UsageServiceClientError).code === "BATCH_TOO_LARGE" && (error as UsageServiceClientError).status === 413
    );
    await assert.rejects(async () => canonicalUsageEvent(envelope("search", { query: "x".repeat(9000) })), /8 KiB|8192|字节/);
    return "101-event batch -> BATCH_TOO_LARGE/413; 9KB payload -> VALIDATION_FAILED";
  });

  await check("usage-service", "offline retention (no service): pending kept + last_error recorded", async () => {
    // Independent of the usage-service boot: an unreachable service must never lose local events.
    const offlineRoot = await freeTemp("mixlab-matrix-usage-offline-");
    const closedPort = await reserveClosedPort();
    const offlineConnection: UsageServiceConnection = { base_url: `http://127.0.0.1:${closedPort}`, token: CLIENT_TOKEN };
    const offlineOutbox = new UsageOutbox(offlineRoot, offlineConnection);
    cleanups.push(() => offlineOutbox.close());
    await offlineOutbox.enqueue(envelope("search", { query: "offline-1" }));
    await waitFor(async () => (await offlineOutbox.status()).pending === 1, "offline outbox pending=1");
    await offlineOutbox.flush();
    const status = await waitFor(async () => { const value = await offlineOutbox.status(); return value.last_error.length ? value : null; }, "offline error recorded");
    equal(status.pending, 1, "events retained while service unreachable");
    assert.ok(["usage_service_unavailable", "usage_delivery_failed"].includes(status.last_error), `last_error=${status.last_error}`);
    return `pending=1 retained, last_error=${status.last_error}: no data loss while offline`;
  });

  await check("usage-service", "destination identity change fail-closed, then recovery with original service", async () => {
    const identityRoot = await freeTemp("mixlab-matrix-usage-identity-");
    const serviceAState = await freeTemp("mixlab-matrix-usage-identity-a-");
    const serviceBState = await freeTemp("mixlab-matrix-usage-identity-b-");
    const serviceA = await createUsageService({ state_root: serviceAState, client_token: CLIENT_TOKEN });
    const portA = await listen(serviceA.server);
    const connA: UsageServiceConnection = { base_url: `http://127.0.0.1:${portA}`, token: CLIENT_TOKEN };
    const outboxA = new UsageOutbox(identityRoot, connA);
    await outboxA.enqueue(envelope("search", { query: "pin-destination" }));
    // Drive delivery explicitly: do not depend on the outbox 2s timer under load.
    await waitFor(async () => (await outboxA.status()).pending === 0, "pin outbox pending=0", {
      timeout_ms: 30_000, initial_interval_ms: 25, max_interval_ms: 500,
      on_poll: async () => { await outboxA.flush().catch(() => undefined); }
    });
    const serviceB = await createUsageService({ state_root: serviceBState, client_token: CLIENT_TOKEN });
    const portB = await listen(serviceB.server);
    const connB: UsageServiceConnection = { base_url: `http://127.0.0.1:${portB}`, token: CLIENT_TOKEN };
    const outboxB = new UsageOutbox(identityRoot, connB);
    await outboxB.enqueue(envelope("search", { query: "should-stay-pending" }));
    const destinationStatus = await waitFor(async () => {
      const status = await outboxB.status();
      return status.last_error === "usage_destination_changed" ? status : null;
    }, "destination change error", {
      timeout_ms: 45_000, initial_interval_ms: 50, max_interval_ms: 1_000,
      on_poll: async () => { await outboxB.flush().catch(() => undefined); }
    });
    const pendingB = destinationStatus.pending;
    assert.ok(pendingB >= 1, "events retained on destination change");
    await outboxB.close();
    const outboxRecovery = new UsageOutbox(identityRoot, connA);
    await waitFor(async () => (await outboxRecovery.status()).pending === 0, "recovery pending=0", {
      timeout_ms: 45_000, initial_interval_ms: 50, max_interval_ms: 1_000,
      on_poll: async () => { await outboxRecovery.flush().catch(() => undefined); }
    });
    await outboxRecovery.close();
    await outboxA.close();
    await serviceA.close(); await serviceB.close();
    return `destination change -> last_error=usage_destination_changed, pending=${pendingB}; recovered with original store`;
  });

  await check("usage-service", "outbox sqlite lives in private local root (no SMB/public-library path)", async () => {
    await waitFor(async () => (await outbox.status()).total >= 3, "outbox total");
    const db = await stat(path.join(outboxRoot, "outbox.sqlite"));
    assert.ok(db.isFile(), "outbox sqlite present");
    return `outbox.sqlite in private temp root (${db.size} bytes)`;
  });

  // ---------------------------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------------------------
  const json = process.argv.includes("--json");
  if (json) {
    for (const row of rows) console.log(JSON.stringify(row));
  } else {
    console.log("\n=== SERVICE-MODE MATRIX (admin/cutter/smart) ===");
    const width = Math.max(...rows.map(row => row.scenario.length), 10);
    for (const row of rows) {
      console.log(`[${row.status}] ${row.area.padEnd(16)} ${row.scenario.padEnd(width)}  ${row.detail}`);
    }
  }
  const passed = rows.filter(row => row.status === "PASS").length;
  const failed = rows.length - passed;
  console.log(`\nMATRIX_RESULT: ${failed === 0 ? "PASS" : "FAIL"} (${passed}/${rows.length} checks passed, ${failed} failed)`);
  console.log(`log: private temp state roots under ${os.tmpdir()}/mixlab-matrix-* (auto-cleaned on success)`);
  await cleanupAll();
  if (failed > 0) process.exitCode = 1;
}

main().catch(async (error: unknown) => {
  console.error("MATRIX_CRASH:", error instanceof Error ? error.stack : String(error));
  await cleanupAll();
  process.exitCode = 1;
});
