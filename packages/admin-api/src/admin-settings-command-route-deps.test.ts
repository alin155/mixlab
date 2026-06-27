import assert from "node:assert/strict";
import test from "node:test";
import type {
  AdminRuntimePolicy,
  AdminSettings
} from "../../library-fs/src/index.ts";
import {
  createAdminSettingsCommandRouteDeps,
  createAdminSettingsCommandRouteServerDeps
} from "./admin-settings-command-route-deps.ts";

interface TestApiInput {
  library_root: string;
  request_id: string;
}

interface TestActor {
  id: string;
}

interface TestLibraryManifest {
  video_count: number;
}

const runtimePolicy: AdminRuntimePolicy = {
  audio_mode: "mp3_16k_mono_64k",
  concurrent_jobs: 1,
  auto_scan_enabled: false,
  auto_queue_enabled: false,
  auto_publish_index_enabled: true
};

function settings(input?: Partial<AdminSettings>): AdminSettings {
  return {
    schema_version: "1.0",
    library_name: "主素材库",
    source_folders: [],
    artifact_library: {
      mode: "default",
      path: "/tmp/PublicLibrary/.mixlab-library",
      migration_required: false
    },
    runtime_policy: runtimePolicy,
    updated_at: "2026-06-26T23:55:00.000Z",
    ...input
  };
}

test("settings command route deps preserve command contexts and helpers", async () => {
  const actor: TestActor = { id: "admin-1" };
  const calls: Array<{ name: string; input: unknown }> = [];
  const deps = createAdminSettingsCommandRouteDeps<
    TestApiInput,
    AdminSettings,
    TestActor,
    TestLibraryManifest
  >({
    command_now: "2026-06-26T23:55:00.000Z",
    invalidated_at: "2026-06-26T23:55:01.000Z",
    actor,
    read_request_json: async () => ({
      library_name: "测试素材库"
    }),
    async refresh_runtime_secrets() {
      calls.push({ name: "refresh-secrets", input: null });
    },
    async read_library_manifest(libraryRoot) {
      calls.push({ name: "manifest", input: libraryRoot });
      return {
        video_count: 12
      };
    },
    async run_settings_config_command(input) {
      calls.push({
        name: "config",
        input: {
          library_root: input.library_root,
          now: input.now,
          invalidated_at: input.invalidated_at,
          actor: input.actor,
          mutation: input.mutation,
          has_refresh_runtime_secrets: typeof input.refresh_runtime_secrets === "function",
          has_read_library_manifest: typeof input.read_library_manifest === "function"
        }
      });
      await input.refresh_runtime_secrets();
      calls.push({
        name: "config-manifest",
        input: await input.read_library_manifest()
      });
      return settings({
        library_name: String(input.mutation.settings_patch.library_name ?? "")
      });
    },
    async run_source_folder_add_command(input) {
      calls.push({
        name: "add",
        input: {
          library_root: input.library_root,
          now: input.now,
          invalidated_at: input.invalidated_at,
          actor: input.actor,
          folder: input.folder,
          has_read_library_manifest: typeof input.read_library_manifest === "function"
        }
      });
      calls.push({
        name: "add-manifest",
        input: await input.read_library_manifest()
      });
      return settings();
    },
    async run_source_folder_update_command(input) {
      calls.push({
        name: "update",
        input: {
          library_root: input.library_root,
          now: input.now,
          invalidated_at: input.invalidated_at,
          actor: input.actor,
          source_folder_id: input.source_folder_id,
          patch: input.patch,
          has_read_library_manifest: typeof input.read_library_manifest === "function"
        }
      });
      return settings();
    },
    async run_source_folder_remove_command(input) {
      calls.push({
        name: "remove",
        input: {
          library_root: input.library_root,
          now: input.now,
          invalidated_at: input.invalidated_at,
          actor: input.actor,
          source_folder_id: input.source_folder_id,
          has_read_library_manifest: typeof input.read_library_manifest === "function"
        }
      });
      return settings();
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-1"
  };
  const requestBody = await deps.read_request_json();
  const config = await deps.run_settings_config_command({
    api_input: apiInput,
    mutation: {
      settings_patch: {
        library_name: "测试素材库"
      }
    }
  });
  await deps.run_source_folder_add_command({
    api_input: apiInput,
    folder: {
      name: "新增来源",
      path: "/tmp/PublicLibrary/source-videos-extra",
      enabled: true
    }
  });
  await deps.run_source_folder_update_command({
    api_input: apiInput,
    source_folder_id: "src_002",
    patch: {
      enabled: false
    }
  });
  await deps.run_source_folder_remove_command({
    api_input: apiInput,
    source_folder_id: "src_002"
  });

  assert.deepEqual(requestBody, {
    library_name: "测试素材库"
  });
  assert.equal(config.library_name, "测试素材库");
  assert.deepEqual(calls, [
    {
      name: "config",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-26T23:55:00.000Z",
        invalidated_at: "2026-06-26T23:55:01.000Z",
        actor,
        mutation: {
          settings_patch: {
            library_name: "测试素材库"
          }
        },
        has_refresh_runtime_secrets: true,
        has_read_library_manifest: true
      }
    },
    {
      name: "refresh-secrets",
      input: null
    },
    {
      name: "manifest",
      input: "/tmp/PublicLibrary"
    },
    {
      name: "config-manifest",
      input: {
        video_count: 12
      }
    },
    {
      name: "add",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-26T23:55:00.000Z",
        invalidated_at: "2026-06-26T23:55:01.000Z",
        actor,
        folder: {
          name: "新增来源",
          path: "/tmp/PublicLibrary/source-videos-extra",
          enabled: true
        },
        has_read_library_manifest: true
      }
    },
    {
      name: "manifest",
      input: "/tmp/PublicLibrary"
    },
    {
      name: "add-manifest",
      input: {
        video_count: 12
      }
    },
    {
      name: "update",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-26T23:55:00.000Z",
        invalidated_at: "2026-06-26T23:55:01.000Z",
        actor,
        source_folder_id: "src_002",
        patch: {
          enabled: false
        },
        has_read_library_manifest: true
      }
    },
    {
      name: "remove",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-26T23:55:00.000Z",
        invalidated_at: "2026-06-26T23:55:01.000Z",
        actor,
        source_folder_id: "src_002",
        has_read_library_manifest: true
      }
    }
  ]);
});

test("settings command route server deps wire direct command services without route-local wrappers", async () => {
  const actor: TestActor = { id: "admin-2" };
  const calls: Array<{ name: string; input: unknown }> = [];
  const deps = createAdminSettingsCommandRouteServerDeps<
    TestApiInput,
    AdminSettings,
    TestActor,
    TestLibraryManifest
  >({
    command_now: "2026-06-27T03:50:00.000Z",
    invalidated_at: "2026-06-27T03:50:01.000Z",
    actor,
    read_request_json: async () => ({
      library_name: "服务装配素材库"
    }),
    async refresh_runtime_secrets() {
      calls.push({ name: "refresh-secrets", input: null });
    },
    async read_library_manifest(libraryRoot) {
      calls.push({ name: "manifest", input: libraryRoot });
      return {
        video_count: 18
      };
    },
    async run_settings_config_service(input) {
      calls.push({
        name: "config-service",
        input: {
          library_root: input.library_root,
          now: input.now,
          invalidated_at: input.invalidated_at,
          actor: input.actor,
          mutation: input.mutation,
          has_refresh_runtime_secrets: typeof input.refresh_runtime_secrets === "function",
          has_read_library_manifest: typeof input.read_library_manifest === "function"
        }
      });
      await input.refresh_runtime_secrets();
      calls.push({
        name: "config-manifest",
        input: await input.read_library_manifest()
      });
      return settings({
        library_name: String(input.mutation.settings_patch.library_name ?? "")
      });
    },
    async run_source_folder_add_service(input) {
      calls.push({
        name: "add-service",
        input: {
          library_root: input.library_root,
          now: input.now,
          invalidated_at: input.invalidated_at,
          actor: input.actor,
          folder: input.folder,
          has_read_library_manifest: typeof input.read_library_manifest === "function"
        }
      });
      return settings();
    },
    async run_source_folder_update_service(input) {
      calls.push({
        name: "update-service",
        input: {
          library_root: input.library_root,
          now: input.now,
          invalidated_at: input.invalidated_at,
          actor: input.actor,
          source_folder_id: input.source_folder_id,
          patch: input.patch,
          has_read_library_manifest: typeof input.read_library_manifest === "function"
        }
      });
      return settings();
    },
    async run_source_folder_remove_service(input) {
      calls.push({
        name: "remove-service",
        input: {
          library_root: input.library_root,
          now: input.now,
          invalidated_at: input.invalidated_at,
          actor: input.actor,
          source_folder_id: input.source_folder_id,
          has_read_library_manifest: typeof input.read_library_manifest === "function"
        }
      });
      return settings();
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-2"
  };
  const requestBody = await deps.read_request_json();
  const config = await deps.run_settings_config_command({
    api_input: apiInput,
    mutation: {
      settings_patch: {
        library_name: "服务装配素材库"
      }
    }
  });
  await deps.run_source_folder_add_command({
    api_input: apiInput,
    folder: {
      name: "新增来源",
      path: "/tmp/PublicLibrary/source-videos-extra",
      enabled: true
    }
  });
  await deps.run_source_folder_update_command({
    api_input: apiInput,
    source_folder_id: "src_003",
    patch: {
      name: "更新来源"
    }
  });
  await deps.run_source_folder_remove_command({
    api_input: apiInput,
    source_folder_id: "src_003"
  });

  assert.deepEqual(requestBody, {
    library_name: "服务装配素材库"
  });
  assert.equal(config.library_name, "服务装配素材库");
  assert.deepEqual(calls, [
    {
      name: "config-service",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-27T03:50:00.000Z",
        invalidated_at: "2026-06-27T03:50:01.000Z",
        actor,
        mutation: {
          settings_patch: {
            library_name: "服务装配素材库"
          }
        },
        has_refresh_runtime_secrets: true,
        has_read_library_manifest: true
      }
    },
    {
      name: "refresh-secrets",
      input: null
    },
    {
      name: "manifest",
      input: "/tmp/PublicLibrary"
    },
    {
      name: "config-manifest",
      input: {
        video_count: 18
      }
    },
    {
      name: "add-service",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-27T03:50:00.000Z",
        invalidated_at: "2026-06-27T03:50:01.000Z",
        actor,
        folder: {
          name: "新增来源",
          path: "/tmp/PublicLibrary/source-videos-extra",
          enabled: true
        },
        has_read_library_manifest: true
      }
    },
    {
      name: "update-service",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-27T03:50:00.000Z",
        invalidated_at: "2026-06-27T03:50:01.000Z",
        actor,
        source_folder_id: "src_003",
        patch: {
          name: "更新来源"
        },
        has_read_library_manifest: true
      }
    },
    {
      name: "remove-service",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-27T03:50:00.000Z",
        invalidated_at: "2026-06-27T03:50:01.000Z",
        actor,
        source_folder_id: "src_003",
        has_read_library_manifest: true
      }
    }
  ]);
});
