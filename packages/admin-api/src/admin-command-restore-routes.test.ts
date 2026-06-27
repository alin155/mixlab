import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createAdminCommandSnapshot
} from "./admin-command-snapshot.ts";
import {
  handleAdminCommandRestoreRoutes,
  matchAdminCommandSnapshotRestorePath,
  matchAdminCommandSnapshotRestorePlanPath,
  resolveAdminCommandSnapshotManifestPath,
  type AdminCommandRestoreRouteCommandInput,
  type AdminCommandRestoreRouteDeps
} from "./admin-command-restore-routes.ts";
import type { AdminCommandSnapshotRestoreResult } from "./admin-command-restore.ts";
import type { AdminCommandRestorePlan } from "./admin-command-restore-plan.ts";

interface TestApiInput {
  library_root: string;
  request_id: string;
}

type TestDeps = AdminCommandRestoreRouteDeps<TestApiInput, AdminCommandRestorePlan, AdminCommandSnapshotRestoreResult>;

function makePlan(overrides: Partial<AdminCommandRestorePlan> = {}): AdminCommandRestorePlan {
  return {
    schema_version: "1.0",
    generated_at: "2026-06-26T00:01:00.000Z",
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
    ...overrides
  };
}

function makeRestore(overrides: Partial<AdminCommandSnapshotRestoreResult> = {}): AdminCommandSnapshotRestoreResult {
  const plan = makePlan();
  return {
    schema_version: "1.0",
    restored_at: "2026-06-26T00:02:00.000Z",
    status: "restored",
    restored_file_count: 1,
    blocked_file_count: 0,
    blockers: [],
    plan,
    files: [
      {
        label: "admin-settings",
        restored: true,
        source_relative_path: ".mixlab-library/admin-settings.json",
        snapshot_relative_path: ".mixlab-library/admin/command-snapshots/snap/files/001-admin-settings"
      }
    ],
    ...overrides
  };
}

function makeDeps(overrides: Partial<TestDeps> = {}): TestDeps {
  return {
    resolve_snapshot_manifest_path: async ({ snapshot_id }) => `/tmp/PublicLibrary/snapshots/${snapshot_id}/snapshot.json`,
    plan_restore: async ({ snapshot_id }) => makePlan({ snapshot_id }),
    run_restore: async () => makeRestore(),
    read_preprocess_supervisor_status: () => ({ state: "idle" }),
    restore_supervisor_block: () => null,
    ...overrides
  };
}

function callRoute(input: {
  method?: string;
  pathname: string;
  deps?: TestDeps;
}) {
  return handleAdminCommandRestoreRoutes({
    method: input.method ?? "GET",
    pathname: input.pathname,
    api_input: {
      library_root: "/tmp/PublicLibrary",
      request_id: "req-1"
    },
    deps: input.deps ?? makeDeps()
  });
}

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-command-restore-routes-"));
}

async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
}

test("command restore routes match only restore plan and restore endpoints", async () => {
  assert.equal(
    matchAdminCommandSnapshotRestorePlanPath("/api/admin/command-snapshots/snap-1/restore-plan"),
    "snap-1"
  );
  assert.equal(
    matchAdminCommandSnapshotRestorePath("/api/admin/command-snapshots/snap-1/restore"),
    "snap-1"
  );
  assert.equal(matchAdminCommandSnapshotRestorePath("/api/admin/command-snapshots/snap-1/restore-plan"), null);
  assert.equal(matchAdminCommandSnapshotRestorePlanPath("/api/admin/command-snapshots/snap-1/restore"), null);
  assert.equal(matchAdminCommandSnapshotRestorePath("/api/admin/command-snapshots/snap-1/restore/extra"), null);
  assert.equal(matchAdminCommandSnapshotRestorePath("/api/admin/command-snapshots/../restore"), null);

  assert.deepEqual(await callRoute({
    method: "POST",
    pathname: "/api/admin/command-snapshots/snap-1/restore-plan"
  }), {
    handled: false
  });
  assert.deepEqual(await callRoute({
    method: "GET",
    pathname: "/api/admin/command-snapshots/snap-1/restore"
  }), {
    handled: false
  });
  assert.deepEqual(await callRoute({
    method: "GET",
    pathname: "/api/admin/command-snapshots/snap-1"
  }), {
    handled: false
  });
});

test("restore plan route resolves the snapshot manifest and returns the injected plan", async () => {
  const calls: Array<AdminCommandRestoreRouteCommandInput<TestApiInput>> = [];
  const result = await callRoute({
    pathname: "/api/admin/command-snapshots/snap-2/restore-plan",
    deps: makeDeps({
      resolve_snapshot_manifest_path: async ({ api_input, snapshot_id }) => {
        assert.equal(api_input.request_id, "req-1");
        assert.equal(snapshot_id, "snap-2");
        return "/tmp/PublicLibrary/snapshots/snap-2/snapshot.json";
      },
      plan_restore: async (input) => {
        calls.push(input);
        return makePlan({ snapshot_id: input.snapshot_id });
      }
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }
  assert.equal(result.status_code, 200);
  assert.deepEqual(calls, [
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      },
      snapshot_id: "snap-2",
      snapshot_manifest_path: "/tmp/PublicLibrary/snapshots/snap-2/snapshot.json"
    }
  ]);
  assert.equal((result.body as { ok: true; data: AdminCommandRestorePlan }).data.snapshot_id, "snap-2");
});

test("restore routes return not found when the snapshot id cannot be resolved", async () => {
  const deps = makeDeps({
    resolve_snapshot_manifest_path: async () => null
  });

  const plan = await callRoute({
    pathname: "/api/admin/command-snapshots/missing/restore-plan",
    deps
  });
  const restore = await callRoute({
    method: "POST",
    pathname: "/api/admin/command-snapshots/missing/restore",
    deps
  });

  for (const result of [plan, restore]) {
    assert.equal(result.handled, true);
    if (result.handled) {
      assert.equal(result.status_code, 404);
      assert.deepEqual(result.body, {
        ok: false,
        error_code: "not_found",
        message: "命令快照不存在"
      });
    }
  }
});

test("restore route blocks while preprocess supervisor is active before reading the snapshot", async () => {
  let resolveCalls = 0;
  let restoreCalls = 0;
  const result = await callRoute({
    method: "POST",
    pathname: "/api/admin/command-snapshots/snap-3/restore",
    deps: makeDeps({
      read_preprocess_supervisor_status: () => ({ state: "running" }),
      restore_supervisor_block: ({ command, supervisor_state }) => {
        assert.equal(command, "command-snapshot-restore");
        assert.equal(supervisor_state, "running");
        return {
          error_code: "invalid_request",
          message: "预处理流水线仍在运行，不能恢复正在处理的任务。"
        };
      },
      resolve_snapshot_manifest_path: async () => {
        resolveCalls += 1;
        return "/tmp/PublicLibrary/snapshots/snap-3/snapshot.json";
      },
      run_restore: async () => {
        restoreCalls += 1;
        return makeRestore();
      }
    })
  });

  assert.equal(result.handled, true);
  if (result.handled) {
    assert.equal(result.status_code, 409);
    assert.deepEqual(result.body, {
      ok: false,
      error_code: "invalid_request",
      message: "预处理流水线仍在运行，不能恢复正在处理的任务。"
    });
  }
  assert.equal(resolveCalls, 0);
  assert.equal(restoreCalls, 0);
});

test("restore route preflights the plan and does not execute blocked restores", async () => {
  let restoreCalls = 0;
  const blockedPlan = makePlan({
    can_restore: false,
    blocked_file_count: 1,
    restorable_file_count: 0,
    blockers: ["snapshot_file_missing"],
    files: [
      {
        ...makePlan().files[0]!,
        can_restore: false,
        status: "blocked",
        snapshot_status: "missing",
        blockers: ["snapshot_file_missing"]
      }
    ]
  });
  const result = await callRoute({
    method: "POST",
    pathname: "/api/admin/command-snapshots/snap-4/restore",
    deps: makeDeps({
      plan_restore: async () => blockedPlan,
      run_restore: async () => {
        restoreCalls += 1;
        return makeRestore();
      }
    })
  });

  assert.equal(result.handled, true);
  if (result.handled) {
    assert.equal(result.status_code, 409);
    assert.deepEqual(result.body, {
      ok: false,
      error_code: "restore_blocked",
      message: "命令快照恢复被阻断。",
      details: {
        plan: blockedPlan
      }
    });
  }
  assert.equal(restoreCalls, 0);
});

test("restore route returns success for restored results and conflict for late blocked results", async () => {
  const calls: Array<AdminCommandRestoreRouteCommandInput<TestApiInput>> = [];
  const restored = await callRoute({
    method: "POST",
    pathname: "/api/admin/command-snapshots/snap-5/restore",
    deps: makeDeps({
      run_restore: async (input) => {
        calls.push(input);
        return makeRestore();
      }
    })
  });

  assert.equal(restored.handled, true);
  if (restored.handled) {
    assert.equal(restored.status_code, 200);
    assert.equal((restored.body as { ok: true; data: AdminCommandSnapshotRestoreResult }).data.status, "restored");
  }
  assert.equal(calls[0]?.snapshot_id, "snap-5");

  const blockedRestore = makeRestore({
    status: "blocked",
    restored_file_count: 0,
    blocked_file_count: 1,
    blockers: ["restore_plan_blocked"],
    files: []
  });
  const blocked = await callRoute({
    method: "POST",
    pathname: "/api/admin/command-snapshots/snap-6/restore",
    deps: makeDeps({
      run_restore: async () => blockedRestore
    })
  });

  assert.equal(blocked.handled, true);
  if (blocked.handled) {
    assert.equal(blocked.status_code, 409);
    assert.deepEqual(blocked.body, {
      ok: false,
      error_code: "restore_blocked",
      message: "命令快照恢复被阻断。",
      details: {
        restore: blockedRestore
      }
    });
  }
});

test("restore route resolver finds a snapshot manifest by snapshot id without absolute path input", async () => {
  const libraryRoot = await makeLibraryRoot();
  const settingsPath = path.join(libraryRoot, ".mixlab-library", "admin-settings.json");
  await writeText(settingsPath, "{\"library_name\":\"before\"}\n");
  const snapshot = await createAdminCommandSnapshot({
    library_root: libraryRoot,
    command: "settings-config",
    created_at: "2026-06-26T00:00:00.000Z",
    holder: "test-holder",
    snapshot_id: "route-resolve-ok",
    files: [{
      label: "admin-settings",
      file_path: settingsPath
    }]
  });
  await writeText(
    path.join(libraryRoot, ".mixlab-library", "admin", "command-snapshots", "malformed", "snapshot.json"),
    "{bad json"
  );

  assert.equal(await resolveAdminCommandSnapshotManifestPath({
    library_root: libraryRoot,
    snapshot_id: "route-resolve-ok"
  }), snapshot.manifest_path);
  assert.equal(await resolveAdminCommandSnapshotManifestPath({
    library_root: libraryRoot,
    snapshot_id: "../unsafe"
  }), null);
  assert.equal(await resolveAdminCommandSnapshotManifestPath({
    library_root: libraryRoot,
    snapshot_id: "missing"
  }), null);
});
