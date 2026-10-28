import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  createCutterAccountsFromEnv,
  type CutterAccounts,
  type CutterSessionRecord,
  type CutterUserRecord
} from "../../library-fs/src/index.ts";
import { registerCutterAccount } from "../../library-fs/src/cutter-users.ts";
import {
  runAdminApproveCutterUserCommand,
  runAdminDisableCutterUserCommand,
  runAdminResetCutterUserPasswordCommand
} from "./admin-cutter-user-commands.ts";

function userRecord(overrides: Partial<CutterUserRecord> = {}): CutterUserRecord {
  return {
    user_id: "CU000001",
    username: "fixture",
    display_name: "夹具",
    status: "approved",
    applied_at: "",
    approved_at: "2026-10-27T00:00:00.000Z",
    rejected_at: "",
    disabled_at: "",
    last_login_at: "",
    last_used_at: "",
    note: "",
    devices: [],
    ...overrides
  };
}

function serviceAccounts(calls: string[]): CutterAccounts {
  return {
    mode: "service",
    async approveCutterUser(_root, input) {
      calls.push("approve:" + input.user_id);
      return {
        status: "approved",
        user: userRecord({ user_id: input.user_id, status: "approved" }),
        session: {
          user_id: input.user_id,
          device_id: "device-1",
          session_token: "token",
          created_at: "",
          last_seen_at: ""
        } satisfies CutterSessionRecord
      };
    },
    async disableCutterUser(_root, input) {
      calls.push("disable:" + input.user_id);
      return userRecord({ user_id: input.user_id, status: "disabled" });
    },
    async resetCutterUserPassword(_root, input) {
      calls.push("reset:" + input.user_id);
      return userRecord({ user_id: input.user_id });
    },
    async registerCutterAccount() {
      throw new Error("unexpected register");
    },
    async loginCutterAccount() {
      throw new Error("unexpected login");
    },
    async logoutCutterSession() {
      throw new Error("unexpected logout");
    },
    async changeCutterAccountPassword() {
      throw new Error("unexpected password change");
    },
    async createCutterLoginApplication() {
      throw new Error("unexpected application");
    },
    async ensureCutterSessionForDevice() {
      throw new Error("unexpected device session");
    },
    async validateCutterSession() {
      throw new Error("unexpected validate");
    },
    async listCutterUsers() {
      throw new Error("unexpected list");
    },
    async listCutterUsersWithTiers() {
      throw new Error("unexpected list with tiers");
    },
    async getCutterAccountEntitlements() {
      throw new Error("unexpected entitlements");
    },
    async refreshCutterSession() {
      throw new Error("unexpected refresh");
    }
  };
}

async function fixture(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-user-command-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

test("feature flag defaults to the legacy shared users.json path", async () => {
  const accounts = createCutterAccountsFromEnv({} as NodeJS.ProcessEnv);
  assert.equal(accounts.mode, "local");
  const enabled = createCutterAccountsFromEnv({
    MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL: "http://127.0.0.1:3891",
    MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN: "token"
  } as NodeJS.ProcessEnv);
  assert.equal(enabled.mode, "service");
});

test("local mode admin commands still mutate the legacy users.json", async (t) => {
  const libraryRoot = await fixture(t);
  const previousUrl = process.env.MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL;
  const previousToken = process.env.MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN;
  delete process.env.MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL;
  delete process.env.MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN;
  t.after(() => {
    if (previousUrl !== undefined) {
      process.env.MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL = previousUrl;
    }
    if (previousToken !== undefined) {
      process.env.MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN = previousToken;
    }
  });

  const timestamp = "2026-10-27T00:00:00.000Z";
  const user = await registerCutterAccount(libraryRoot, {
    username: "legacy-local",
    password: "Fixture12345",
    device_id: "device-1",
    device_name: "夹具设备",
    now: timestamp
  });
  const approved = await runAdminApproveCutterUserCommand({
    library_root: libraryRoot,
    now: timestamp,
    user_id: user.user_id
  });
  assert.equal(approved.status, "approved");
  assert.equal(approved.user.status, "approved");
  assert.equal(
    await exists(path.join(libraryRoot, ".mixlab-library", "cutter-users", "users.json")),
    true
  );
});

test("service mode admin commands route to the account client and do not snapshot the stale shared store", async (t) => {
  const libraryRoot = await fixture(t);
  const calls: string[] = [];
  const accounts = serviceAccounts(calls);

  const approved = await runAdminApproveCutterUserCommand({
    library_root: libraryRoot,
    now: "2026-10-27T00:00:00.000Z",
    user_id: "CU000001",
    accounts
  });
  assert.equal(approved.status, "approved");
  assert.deepEqual(calls, ["approve:CU000001"]);

  const disabled = await runAdminDisableCutterUserCommand({
    library_root: libraryRoot,
    now: "2026-10-27T00:00:00.000Z",
    user_id: "CU000001",
    accounts
  });
  assert.equal(disabled.status, "disabled");
  const reset = await runAdminResetCutterUserPasswordCommand({
    library_root: libraryRoot,
    now: "2026-10-27T00:00:00.000Z",
    user_id: "CU000001",
    new_password: "Changed12345",
    accounts
  });
  assert.equal(reset.user_id, "CU000001");
  assert.deepEqual(calls, ["approve:CU000001", "disable:CU000001", "reset:CU000001"]);

  // No legacy store is created: the service is authoritative.
  assert.equal(
    await exists(path.join(libraryRoot, ".mixlab-library", "cutter-users", "users.json")),
    false
  );
  // Command audit still runs even when the shared store snapshot is skipped.
  const operationLog = path.join(libraryRoot, ".mixlab-library", "admin", "operation-log", "events.ndjson");
  assert.equal(await exists(operationLog), true);
});
