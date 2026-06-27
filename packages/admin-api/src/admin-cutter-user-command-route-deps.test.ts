import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminCutterUserCommandRouteDeps,
  createAdminCutterUserCommandRouteServerDeps
} from "./admin-cutter-user-command-route-deps.ts";

interface TestApiInput {
  library_root: string;
  request_id: string;
}

interface TestActor {
  id: string;
}

interface TestApprovalCommandResult {
  status: "approved";
  user: TestUserRecord;
  session: {
    user_id: string;
    device_id: string;
    created_at: string;
    last_seen_at: string;
  };
}

interface TestApprovalRouteResult {
  status: "approved";
  public_user: TestPublicUser;
  session_device_id: string;
}

interface TestUserRecord {
  user_id: string;
  status: "pending" | "approved" | "disabled";
  password_hash: string;
}

interface TestPublicUser {
  user_id: string;
  status: "pending" | "approved" | "disabled";
}

test("cutter user command route deps preserve command contexts and projections", async () => {
  const actor: TestActor = { id: "admin-1" };
  const calls: Array<{ name: string; input: unknown }> = [];
  const deps = createAdminCutterUserCommandRouteDeps<
    TestApiInput,
    TestActor,
    TestApprovalCommandResult,
    TestApprovalRouteResult,
    TestUserRecord,
    TestPublicUser
  >({
    command_now: "2026-06-26T23:59:00.000Z",
    actor,
    read_request_json: async () => ({
      new_password: "Cutter67890"
    }),
    async run_approve_cutter_user_command(input) {
      calls.push({ name: "approve", input });
      return {
        status: "approved",
        user: {
          user_id: input.user_id,
          status: "approved",
          password_hash: "redacted"
        },
        session: {
          user_id: input.user_id,
          device_id: "device-a",
          created_at: input.now,
          last_seen_at: input.now
        }
      };
    },
    async run_disable_cutter_user_command(input) {
      calls.push({ name: "disable", input });
      return {
        user_id: input.user_id,
        status: "disabled",
        password_hash: "redacted"
      };
    },
    async run_reset_cutter_user_password_command(input) {
      calls.push({ name: "password", input });
      return {
        user_id: input.user_id,
        status: "approved",
        password_hash: `changed:${input.new_password}`
      };
    },
    project_approve_result(result) {
      calls.push({ name: "project-approve", input: result });
      return {
        status: result.status,
        public_user: {
          user_id: result.user.user_id,
          status: result.user.status
        },
        session_device_id: result.session.device_id
      };
    },
    project_public_user(user) {
      calls.push({ name: "project-user", input: user });
      return {
        user_id: user.user_id,
        status: user.status
      };
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-1"
  };
  const requestBody = await deps.read_request_json();
  const approved = await deps.run_approve_cutter_user({
    api_input: apiInput,
    user_id: "CU000001"
  });
  const disabled = await deps.run_disable_cutter_user({
    api_input: apiInput,
    user_id: "CU000002"
  });
  const passwordReset = await deps.run_reset_cutter_user_password({
    api_input: apiInput,
    user_id: "CU000003",
    new_password: "Cutter12345"
  });

  assert.deepEqual(requestBody, {
    new_password: "Cutter67890"
  });
  assert.deepEqual(approved, {
    status: "approved",
    public_user: {
      user_id: "CU000001",
      status: "approved"
    },
    session_device_id: "device-a"
  });
  assert.deepEqual(disabled, {
    user_id: "CU000002",
    status: "disabled"
  });
  assert.deepEqual(passwordReset, {
    user_id: "CU000003",
    status: "approved"
  });
  assert.deepEqual(calls, [
    {
      name: "approve",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-26T23:59:00.000Z",
        actor,
        user_id: "CU000001"
      }
    },
    {
      name: "project-approve",
      input: {
        status: "approved",
        user: {
          user_id: "CU000001",
          status: "approved",
          password_hash: "redacted"
        },
        session: {
          user_id: "CU000001",
          device_id: "device-a",
          created_at: "2026-06-26T23:59:00.000Z",
          last_seen_at: "2026-06-26T23:59:00.000Z"
        }
      }
    },
    {
      name: "disable",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-26T23:59:00.000Z",
        actor,
        user_id: "CU000002"
      }
    },
    {
      name: "project-user",
      input: {
        user_id: "CU000002",
        status: "disabled",
        password_hash: "redacted"
      }
    },
    {
      name: "password",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-26T23:59:00.000Z",
        actor,
        user_id: "CU000003",
        new_password: "Cutter12345"
      }
    },
    {
      name: "project-user",
      input: {
        user_id: "CU000003",
        status: "approved",
        password_hash: "changed:Cutter12345"
      }
    }
  ]);
});

test("cutter user command route server deps wire direct services and projections", async () => {
  const actor: TestActor = { id: "admin-2" };
  const calls: Array<{ name: string; input: unknown }> = [];
  const deps = createAdminCutterUserCommandRouteServerDeps<
    TestApiInput,
    TestActor,
    TestApprovalCommandResult,
    TestApprovalRouteResult,
    TestUserRecord,
    TestPublicUser
  >({
    command_now: "2026-06-27T04:30:00.000Z",
    actor,
    read_request_json: async () => ({
      new_password: "Cutter24680"
    }),
    async run_approve_cutter_user_service(input) {
      calls.push({ name: "approve-service", input });
      return {
        status: "approved",
        user: {
          user_id: input.user_id,
          status: "approved",
          password_hash: "redacted"
        },
        session: {
          user_id: input.user_id,
          device_id: "device-b",
          created_at: input.now,
          last_seen_at: input.now
        }
      };
    },
    async run_disable_cutter_user_service(input) {
      calls.push({ name: "disable-service", input });
      return {
        user_id: input.user_id,
        status: "disabled",
        password_hash: "redacted"
      };
    },
    async run_reset_cutter_user_password_service(input) {
      calls.push({ name: "password-service", input });
      return {
        user_id: input.user_id,
        status: "approved",
        password_hash: `changed:${input.new_password}`
      };
    },
    project_approve_result(result) {
      calls.push({ name: "project-approve", input: result });
      return {
        status: result.status,
        public_user: {
          user_id: result.user.user_id,
          status: result.user.status
        },
        session_device_id: result.session.device_id
      };
    },
    project_public_user(user) {
      calls.push({ name: "project-user", input: user });
      return {
        user_id: user.user_id,
        status: user.status
      };
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-2"
  };
  const requestBody = await deps.read_request_json();
  const approved = await deps.run_approve_cutter_user({
    api_input: apiInput,
    user_id: "CU000004"
  });
  const disabled = await deps.run_disable_cutter_user({
    api_input: apiInput,
    user_id: "CU000005"
  });
  const passwordReset = await deps.run_reset_cutter_user_password({
    api_input: apiInput,
    user_id: "CU000006",
    new_password: "Cutter13579"
  });

  assert.deepEqual(requestBody, {
    new_password: "Cutter24680"
  });
  assert.deepEqual(approved, {
    status: "approved",
    public_user: {
      user_id: "CU000004",
      status: "approved"
    },
    session_device_id: "device-b"
  });
  assert.deepEqual(disabled, {
    user_id: "CU000005",
    status: "disabled"
  });
  assert.deepEqual(passwordReset, {
    user_id: "CU000006",
    status: "approved"
  });
  assert.deepEqual(calls, [
    {
      name: "approve-service",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-27T04:30:00.000Z",
        actor,
        user_id: "CU000004"
      }
    },
    {
      name: "project-approve",
      input: {
        status: "approved",
        user: {
          user_id: "CU000004",
          status: "approved",
          password_hash: "redacted"
        },
        session: {
          user_id: "CU000004",
          device_id: "device-b",
          created_at: "2026-06-27T04:30:00.000Z",
          last_seen_at: "2026-06-27T04:30:00.000Z"
        }
      }
    },
    {
      name: "disable-service",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-27T04:30:00.000Z",
        actor,
        user_id: "CU000005"
      }
    },
    {
      name: "project-user",
      input: {
        user_id: "CU000005",
        status: "disabled",
        password_hash: "redacted"
      }
    },
    {
      name: "password-service",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-27T04:30:00.000Z",
        actor,
        user_id: "CU000006",
        new_password: "Cutter13579"
      }
    },
    {
      name: "project-user",
      input: {
        user_id: "CU000006",
        status: "approved",
        password_hash: "changed:Cutter13579"
      }
    }
  ]);
});
