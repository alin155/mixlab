import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminLibraryCommandRouteDeps,
  createAdminLibraryCommandRouteServerDeps
} from "./admin-library-command-route-deps.ts";

interface TestApiInput {
  library_root: string;
  request_id: string;
}

interface TestLibraryManifest {
  library_id: string;
  name: string;
}

interface TestScanPreview {
  blocked: boolean;
}

interface TestReadModelHandoff {
  command: string;
  stale_mark: {
    applied: boolean;
  };
}

interface TestScanApplyResult {
  total_video_count: number;
  new_video_count: number;
  read_model: TestReadModelHandoff | null;
}

interface TestReconcileSchedule {
  requested: boolean;
  policy: string;
}

interface TestActor {
  id: string;
}

test("library command route deps preserve command context and handoff helpers", async () => {
  const actor: TestActor = { id: "admin-1" };
  const now = () => "2026-06-26T23:40:01.000Z";
  const calls: Array<{ name: string; input: unknown }> = [];
  const cleared: string[] = [];

  const deps = createAdminLibraryCommandRouteDeps<
    TestApiInput,
    TestLibraryManifest,
    TestScanPreview,
    TestReadModelHandoff,
    TestScanApplyResult,
    TestReconcileSchedule,
    TestActor
  >({
    library_id: "mixlab",
    library_name: "MixLab",
    command_now: "2026-06-26T23:40:00.000Z",
    actor,
    now,
    async run_library_init_command(input) {
      calls.push({ name: "init", input });
      return {
        library_id: input.library_id,
        name: input.library_name
      };
    },
    async run_library_scan_apply_command(input) {
      calls.push({ name: "scan-apply", input });
      return {
        total_video_count: 2,
        new_video_count: 1,
        read_model: {
          command: "library-scan",
          stale_mark: {
            applied: true
          }
        }
      };
    },
    async run_library_scan_preview_command(input) {
      calls.push({ name: "scan-preview", input });
      return {
        blocked: false
      };
    },
    schedule_read_model_reconcile_after_scan(input) {
      calls.push({ name: "reconcile", input });
      return {
        requested: Boolean(input.handoff),
        policy: "post-scan-reconcile-v1"
      };
    },
    clear_source_video_page_cache(libraryRoot) {
      cleared.push(libraryRoot);
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-1"
  };
  const init = await deps.run_library_init_command({ api_input: apiInput });
  const preview = await deps.run_library_scan_preview_command({ api_input: apiInput });
  const scanApply = await deps.run_library_scan_apply_command({ api_input: apiInput });
  const reconcile = deps.schedule_read_model_reconcile_after_scan({
    handoff: scanApply.read_model
  });
  deps.clear_source_video_page_cache(apiInput.library_root);

  assert.deepEqual(init, {
    library_id: "mixlab",
    name: "MixLab"
  });
  assert.deepEqual(preview, {
    blocked: false
  });
  assert.deepEqual(scanApply, {
    total_video_count: 2,
    new_video_count: 1,
    read_model: {
      command: "library-scan",
      stale_mark: {
        applied: true
      }
    }
  });
  assert.deepEqual(reconcile, {
    requested: true,
    policy: "post-scan-reconcile-v1"
  });
  assert.deepEqual(cleared, ["/tmp/PublicLibrary"]);
  assert.deepEqual(calls, [
    {
      name: "init",
      input: {
        library_root: "/tmp/PublicLibrary",
        library_id: "mixlab",
        library_name: "MixLab",
        command_now: "2026-06-26T23:40:00.000Z",
        actor,
        now
      }
    },
    {
      name: "scan-preview",
      input: {
        library_root: "/tmp/PublicLibrary",
        library_id: "mixlab",
        library_name: "MixLab",
        command_now: "2026-06-26T23:40:00.000Z",
        actor,
        now
      }
    },
    {
      name: "scan-apply",
      input: {
        library_root: "/tmp/PublicLibrary",
        library_id: "mixlab",
        library_name: "MixLab",
        command_now: "2026-06-26T23:40:00.000Z",
        actor,
        now
      }
    },
    {
      name: "reconcile",
      input: {
        handoff: {
          command: "library-scan",
          stale_mark: {
            applied: true
          }
        }
      }
    }
  ]);
});

test("library command route deps preserve null read-model handoff", async () => {
  const scheduled: Array<TestReadModelHandoff | null> = [];
  const deps = createAdminLibraryCommandRouteDeps<
    TestApiInput,
    TestLibraryManifest,
    TestScanPreview,
    TestReadModelHandoff,
    TestScanApplyResult,
    TestReconcileSchedule,
    TestActor
  >({
    library_id: "mixlab",
    library_name: "MixLab",
    command_now: "2026-06-26T23:41:00.000Z",
    async run_library_init_command() {
      return {
        library_id: "mixlab",
        name: "MixLab"
      };
    },
    async run_library_scan_apply_command() {
      return {
        total_video_count: 0,
        new_video_count: 0,
        read_model: null
      };
    },
    async run_library_scan_preview_command() {
      return {
        blocked: false
      };
    },
    schedule_read_model_reconcile_after_scan({ handoff }) {
      scheduled.push(handoff);
      return {
        requested: false,
        policy: "post-scan-reconcile-v1"
      };
    },
    clear_source_video_page_cache() {
      return undefined;
    }
  });

  const scanApply = await deps.run_library_scan_apply_command({
    api_input: {
      library_root: "/tmp/PublicLibrary",
      request_id: "req-1"
    }
  });
  const reconcile = deps.schedule_read_model_reconcile_after_scan({
    handoff: scanApply.read_model
  });

  assert.deepEqual(scheduled, [null]);
  assert.deepEqual(reconcile, {
    requested: false,
    policy: "post-scan-reconcile-v1"
  });
});

test("library command route server deps wire direct command services and handoff helpers", async () => {
  const actor: TestActor = { id: "admin-2" };
  const now = () => "2026-06-27T04:10:01.000Z";
  const calls: Array<{ name: string; input: unknown }> = [];
  const cleared: string[] = [];

  const deps = createAdminLibraryCommandRouteServerDeps<
    TestApiInput,
    TestLibraryManifest,
    TestScanPreview,
    TestReadModelHandoff,
    TestScanApplyResult,
    TestReconcileSchedule,
    TestActor
  >({
    library_id: "mixlab",
    library_name: "MixLab",
    command_now: "2026-06-27T04:10:00.000Z",
    actor,
    now,
    async run_library_init_service(input) {
      calls.push({ name: "init-service", input });
      return {
        library_id: input.library_id,
        name: input.library_name
      };
    },
    async run_library_scan_apply_service(input) {
      calls.push({ name: "scan-apply-service", input });
      return {
        total_video_count: 8,
        new_video_count: 2,
        read_model: {
          command: "library-scan",
          stale_mark: {
            applied: true
          }
        }
      };
    },
    async run_library_scan_preview_service(input) {
      calls.push({ name: "scan-preview-service", input });
      return {
        blocked: false
      };
    },
    schedule_read_model_reconcile_after_scan(input) {
      calls.push({ name: "reconcile-service", input });
      return {
        requested: Boolean(input.handoff),
        policy: "post-scan-reconcile-v1"
      };
    },
    clear_source_video_page_cache(libraryRoot) {
      cleared.push(libraryRoot);
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-2"
  };
  const init = await deps.run_library_init_command({ api_input: apiInput });
  const preview = await deps.run_library_scan_preview_command({ api_input: apiInput });
  const scanApply = await deps.run_library_scan_apply_command({ api_input: apiInput });
  const reconcile = deps.schedule_read_model_reconcile_after_scan({
    handoff: scanApply.read_model
  });
  deps.clear_source_video_page_cache(apiInput.library_root);

  assert.deepEqual(init, {
    library_id: "mixlab",
    name: "MixLab"
  });
  assert.deepEqual(preview, {
    blocked: false
  });
  assert.deepEqual(scanApply, {
    total_video_count: 8,
    new_video_count: 2,
    read_model: {
      command: "library-scan",
      stale_mark: {
        applied: true
      }
    }
  });
  assert.deepEqual(reconcile, {
    requested: true,
    policy: "post-scan-reconcile-v1"
  });
  assert.deepEqual(cleared, ["/tmp/PublicLibrary"]);
  assert.deepEqual(calls, [
    {
      name: "init-service",
      input: {
        library_root: "/tmp/PublicLibrary",
        library_id: "mixlab",
        library_name: "MixLab",
        command_now: "2026-06-27T04:10:00.000Z",
        actor,
        now
      }
    },
    {
      name: "scan-preview-service",
      input: {
        library_root: "/tmp/PublicLibrary",
        library_id: "mixlab",
        library_name: "MixLab",
        command_now: "2026-06-27T04:10:00.000Z",
        actor,
        now
      }
    },
    {
      name: "scan-apply-service",
      input: {
        library_root: "/tmp/PublicLibrary",
        library_id: "mixlab",
        library_name: "MixLab",
        command_now: "2026-06-27T04:10:00.000Z",
        actor,
        now
      }
    },
    {
      name: "reconcile-service",
      input: {
        handoff: {
          command: "library-scan",
          stale_mark: {
            applied: true
          }
        }
      }
    }
  ]);
});
