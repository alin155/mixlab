import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminCommandRestoreRouteDeps,
  createAdminCommandRestoreRouteServerDeps
} from "./admin-command-restore-route-deps.ts";
import type { AdminCommandSnapshotRestoreResult } from "./admin-command-restore.ts";
import type { AdminCommandRestorePlan } from "./admin-command-restore-plan.ts";

interface TestApiInput {
  library_root: string;
  request_id: string;
}

interface TestActor {
  id: string;
}

interface TestManifest {
  total: number;
  ready: number;
}

interface TestRuntimeSupervisorStatus {
  internal_state: "idle" | "running";
  temporary_result_count: number;
}

interface TestPublicSupervisorStatus {
  state: "idle" | "running";
}

type TestOperationLogAppender = (input: { message: string }) => Promise<{ event_id: string }>;

function makePlan(input?: Partial<AdminCommandRestorePlan>): AdminCommandRestorePlan {
  return {
    schema_version: "1.0",
    generated_at: "2026-06-27T00:10:00.000Z",
    can_restore: true,
    command: "settings-config",
    snapshot_id: "snap-1",
    snapshot_kind: "file-capture",
    snapshot_manifest_relative_path: ".mixlab-library/admin/command-snapshots/snap/snapshot.json",
    file_count: 1,
    restorable_file_count: 1,
    blocked_file_count: 0,
    blockers: [],
    files: [
      {
        label: "admin-settings",
        can_restore: true,
        status: "restorable",
        source_relative_path: ".mixlab-library/admin-settings.json",
        snapshot_relative_path: ".mixlab-library/admin/command-snapshots/snap/files/001-admin-settings",
        target_status: "exists",
        snapshot_status: "exists",
        blockers: []
      }
    ],
    ...input
  };
}

function makeRestore(input?: Partial<AdminCommandSnapshotRestoreResult>): AdminCommandSnapshotRestoreResult {
  return {
    schema_version: "1.0",
    restored_at: "2026-06-27T00:11:00.000Z",
    status: "restored",
    restored_file_count: 1,
    blocked_file_count: 0,
    blockers: [],
    plan: makePlan(),
    files: [
      {
        label: "admin-settings",
        restored: true,
        source_relative_path: ".mixlab-library/admin-settings.json",
        snapshot_relative_path: ".mixlab-library/admin/command-snapshots/snap/files/001-admin-settings"
      }
    ],
    ...input
  };
}

test("command restore route deps preserve restore contexts and helpers", async () => {
  const actor: TestActor = { id: "admin-1" };
  const appender: TestOperationLogAppender = async (input) => ({ event_id: input.message });
  const calls: Array<{ name: string; input: unknown }> = [];
  const deps = createAdminCommandRestoreRouteDeps<
    TestApiInput,
    TestActor,
    TestManifest,
    TestOperationLogAppender,
    AdminCommandRestorePlan,
    AdminCommandSnapshotRestoreResult
  >({
    restore_now: "2026-06-27T00:11:00.000Z",
    plan_generated_at: () => {
      calls.push({ name: "plan-clock", input: null });
      return "2026-06-27T00:10:00.000Z";
    },
    invalidated_at: () => {
      calls.push({ name: "invalidate-clock", input: null });
      return "2026-06-27T00:11:01.000Z";
    },
    holder: "admin-api",
    actor,
    async resolve_snapshot_manifest_path(input) {
      calls.push({ name: "resolve", input });
      return `${input.library_root}/.mixlab-library/admin/command-snapshots/${input.snapshot_id}/snapshot.json`;
    },
    async plan_restore_command(input) {
      calls.push({ name: "plan", input });
      return makePlan({
        generated_at: input.generated_at,
        snapshot_id: "snap-1"
      });
    },
    async run_restore_command(input) {
      calls.push({
        name: "restore",
        input: {
          library_root: input.library_root,
          now: input.now,
          actor: input.actor,
          holder: input.holder,
          invalidated_at: input.invalidated_at,
          snapshot_manifest_path: input.snapshot_manifest_path,
          has_read_library_manifest: typeof input.read_library_manifest === "function",
          has_append_operation_log_event: typeof input.append_operation_log_event === "function"
        }
      });
      calls.push({
        name: "restore-manifest",
        input: await input.read_library_manifest()
      });
      calls.push({
        name: "restore-log",
        input: await input.append_operation_log_event({ message: "restore-started" })
      });
      return makeRestore({
        restored_at: input.now
      });
    },
    async read_library_manifest(libraryRoot) {
      calls.push({ name: "manifest", input: libraryRoot });
      return {
        total: 11394,
        ready: 10471
      };
    },
    append_operation_log_event: appender,
    read_preprocess_supervisor_status: () => {
      calls.push({ name: "supervisor-status", input: null });
      return { state: "idle" };
    },
    restore_supervisor_block(input) {
      calls.push({ name: "supervisor-block", input });
      return null;
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-1"
  };
  const resolved = await deps.resolve_snapshot_manifest_path({
    api_input: apiInput,
    snapshot_id: "snap-1"
  });
  const plan = await deps.plan_restore({
    api_input: apiInput,
    snapshot_id: "snap-1",
    snapshot_manifest_path: resolved ?? ""
  });
  const supervisorStatus = deps.read_preprocess_supervisor_status();
  const supervisorBlock = deps.restore_supervisor_block({
    command: "command-snapshot-restore",
    supervisor_state: supervisorStatus.state
  });
  const restore = await deps.run_restore({
    api_input: apiInput,
    snapshot_id: "snap-1",
    snapshot_manifest_path: resolved ?? ""
  });

  assert.equal(resolved, "/tmp/PublicLibrary/.mixlab-library/admin/command-snapshots/snap-1/snapshot.json");
  assert.equal(plan.generated_at, "2026-06-27T00:10:00.000Z");
  assert.equal(supervisorBlock, null);
  assert.equal(restore.restored_at, "2026-06-27T00:11:00.000Z");
  assert.deepEqual(calls, [
    {
      name: "resolve",
      input: {
        library_root: "/tmp/PublicLibrary",
        snapshot_id: "snap-1"
      }
    },
    {
      name: "plan-clock",
      input: null
    },
    {
      name: "plan",
      input: {
        library_root: "/tmp/PublicLibrary",
        snapshot_manifest_path: "/tmp/PublicLibrary/.mixlab-library/admin/command-snapshots/snap-1/snapshot.json",
        generated_at: "2026-06-27T00:10:00.000Z"
      }
    },
    {
      name: "supervisor-status",
      input: null
    },
    {
      name: "supervisor-block",
      input: {
        command: "command-snapshot-restore",
        supervisor_state: "idle"
      }
    },
    {
      name: "invalidate-clock",
      input: null
    },
    {
      name: "restore",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-27T00:11:00.000Z",
        actor,
        holder: "admin-api",
        invalidated_at: "2026-06-27T00:11:01.000Z",
        snapshot_manifest_path: "/tmp/PublicLibrary/.mixlab-library/admin/command-snapshots/snap-1/snapshot.json",
        has_read_library_manifest: true,
        has_append_operation_log_event: true
      }
    },
    {
      name: "manifest",
      input: "/tmp/PublicLibrary"
    },
    {
      name: "restore-manifest",
      input: {
        total: 11394,
        ready: 10471
      }
    },
    {
      name: "restore-log",
      input: {
        event_id: "restore-started"
      }
    }
  ]);
});

test("command restore route server deps project supervisor status before restore blocking", () => {
  const actor: TestActor = { id: "admin-1" };
  const appender: TestOperationLogAppender = async (input) => ({ event_id: input.message });
  const calls: Array<{ name: string; input: unknown }> = [];
  const deps = createAdminCommandRestoreRouteServerDeps<
    TestApiInput,
    TestActor,
    TestManifest,
    TestOperationLogAppender,
    AdminCommandRestorePlan,
    AdminCommandSnapshotRestoreResult,
    TestRuntimeSupervisorStatus,
    TestPublicSupervisorStatus
  >({
    restore_now: "2026-06-27T03:35:00.000Z",
    plan_generated_at: () => "2026-06-27T03:34:00.000Z",
    invalidated_at: () => "2026-06-27T03:35:01.000Z",
    holder: "admin-api",
    actor,
    async resolve_snapshot_manifest_path(input) {
      calls.push({ name: "resolve", input });
      return `${input.library_root}/${input.snapshot_id}/snapshot.json`;
    },
    async plan_restore_command(input) {
      calls.push({ name: "plan", input });
      return makePlan({
        generated_at: input.generated_at,
        snapshot_id: "snap-1"
      });
    },
    async run_restore_command(input) {
      calls.push({ name: "restore", input });
      return makeRestore({
        restored_at: input.now
      });
    },
    async read_library_manifest(libraryRoot) {
      calls.push({ name: "manifest", input: libraryRoot });
      return {
        total: 11394,
        ready: 10471
      };
    },
    append_operation_log_event: appender,
    read_preprocess_supervisor_status() {
      calls.push({ name: "supervisor-runtime", input: null });
      return {
        internal_state: "running",
        temporary_result_count: 7
      };
    },
    to_public_preprocess_supervisor_status(status) {
      calls.push({ name: "supervisor-public", input: status });
      return {
        state: status.internal_state
      };
    },
    restore_supervisor_block(input) {
      calls.push({ name: "restore-block", input });
      return input.supervisor_state === "running"
        ? {
            error_code: "supervisor_running",
            message: "预处理主管正在运行"
          }
        : null;
    }
  });

  const supervisor = deps.read_preprocess_supervisor_status();
  const block = deps.restore_supervisor_block({
    command: "command-snapshot-restore",
    supervisor_state: supervisor.state
  });

  assert.deepEqual(supervisor, {
    state: "running"
  });
  assert.deepEqual(block, {
    error_code: "supervisor_running",
    message: "预处理主管正在运行"
  });
  assert.deepEqual(calls, [
    {
      name: "supervisor-runtime",
      input: null
    },
    {
      name: "supervisor-public",
      input: {
        internal_state: "running",
        temporary_result_count: 7
      }
    },
    {
      name: "restore-block",
      input: {
        command: "command-snapshot-restore",
        supervisor_state: "running"
      }
    }
  ]);
});
