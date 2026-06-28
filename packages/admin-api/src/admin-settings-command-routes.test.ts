import assert from "node:assert/strict";
import test from "node:test";
import type {
  AdminSettings,
  AdminRuntimePolicy
} from "../../library-fs/src/index.ts";
import {
  handleAdminSettingsCommandRoutes,
  matchAdminSettingsConfigPath,
  matchAdminSettingsSourceFolderPath,
  type AdminSettingsCommandRouteDeps,
  type AdminSettingsConfigRouteCommandInput,
  type AdminSourceFolderAddRouteCommandInput,
  type AdminSourceFolderRemoveRouteCommandInput,
  type AdminSourceFolderUpdateRouteCommandInput
} from "./admin-settings-command-routes.ts";

interface TestApiInput {
  library_root: string;
  request_id: string;
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
    source_folders: [
      {
        id: "src_default",
        name: "默认素材来源",
        path: "/tmp/PublicLibrary/source-videos",
        enabled: true
      }
    ],
    artifact_library: {
      mode: "default",
      path: "/tmp/PublicLibrary/.mixlab-library",
      migration_required: false
    },
    runtime_policy: runtimePolicy,
    updated_at: "2026-06-26T09:00:00.000Z",
    ...input
  };
}

function makeDeps(
  overrides: Partial<AdminSettingsCommandRouteDeps<TestApiInput>> = {}
): AdminSettingsCommandRouteDeps<TestApiInput> {
  return {
    read_request_json: async () => ({
      library_name: "测试素材库"
    }),
    run_settings_config_command: async () => settings({ library_name: "测试素材库" }),
    run_source_folder_add_command: async () => settings(),
    run_source_folder_update_command: async () => settings(),
    run_source_folder_remove_command: async () => settings(),
    ...overrides
  };
}

function callRoute(input: {
  method?: string;
  pathname: string;
  deps?: AdminSettingsCommandRouteDeps<TestApiInput>;
}) {
  return handleAdminSettingsCommandRoutes({
    method: input.method ?? "PATCH",
    pathname: input.pathname,
    api_input: {
      library_root: "/tmp/PublicLibrary",
      request_id: "req-1"
    },
    deps: input.deps ?? makeDeps()
  });
}

test("settings command routes match only write endpoints", () => {
  assert.equal(matchAdminSettingsConfigPath("/api/admin/settings/config"), true);
  assert.equal(matchAdminSettingsConfigPath("/api/admin/settings/config/extra"), false);
  assert.equal(matchAdminSettingsSourceFolderPath("/api/admin/settings/source-folders/src_default"), "src_default");
  assert.equal(matchAdminSettingsSourceFolderPath("/api/admin/settings/source-folders/src_123"), "src_123");
  assert.equal(matchAdminSettingsSourceFolderPath("/api/admin/settings/source-folders/default"), null);
});

test("settings config route parses config and runtime-secret patches", async () => {
  let commandInput: AdminSettingsConfigRouteCommandInput<TestApiInput> | undefined;
  const result = await callRoute({
    pathname: "/api/admin/settings/config",
    deps: makeDeps({
      read_request_json: async () => ({
        library_name: "生产素材库",
        runtime_policy: {
          ...runtimePolicy,
          concurrent_jobs: 2
        },
        asr: {
          dashscope_api_key: "test-secret"
        }
      }),
      run_settings_config_command: async (input) => {
        commandInput = input;
        return settings({ library_name: String(input.mutation.settings_patch.library_name ?? "") });
      }
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.deepEqual(commandInput, {
    api_input: {
      library_root: "/tmp/PublicLibrary",
      request_id: "req-1"
    },
    mutation: {
      settings_patch: {
        library_name: "生产素材库",
        runtime_policy: {
          ...runtimePolicy,
          concurrent_jobs: 2
        }
      },
      runtime_secrets_patch: {
        dashscope_api_key: "test-secret"
      }
    }
  });
  assert.equal(result.status_code, 200);
  assert.deepEqual(result.body, {
    ok: true,
    data: settings({ library_name: "生产素材库" })
  });
});

test("settings source-folder routes call add update and remove commands", async () => {
  const addCalls: Array<AdminSourceFolderAddRouteCommandInput<TestApiInput>> = [];
  const updateCalls: Array<AdminSourceFolderUpdateRouteCommandInput<TestApiInput>> = [];
  const removeCalls: Array<AdminSourceFolderRemoveRouteCommandInput<TestApiInput>> = [];
  const add = await callRoute({
    method: "POST",
    pathname: "/api/admin/settings/source-folders",
    deps: makeDeps({
      read_request_json: async () => ({
        name: "新增来源",
        path: "/tmp/PublicLibrary/source-videos-extra"
      }),
      run_source_folder_add_command: async (input) => {
        addCalls.push(input);
        return settings({
          source_folders: [
            ...settings().source_folders,
            {
              id: "src_002",
              ...input.folder
            }
          ]
        });
      }
    })
  });
  const update = await callRoute({
    method: "PATCH",
    pathname: "/api/admin/settings/source-folders/src_002",
    deps: makeDeps({
      read_request_json: async () => ({
        name: "已更新来源",
        enabled: false
      }),
      run_source_folder_update_command: async (input) => {
        updateCalls.push(input);
        return settings();
      }
    })
  });
  const remove = await callRoute({
    method: "DELETE",
    pathname: "/api/admin/settings/source-folders/src_002",
    deps: makeDeps({
      run_source_folder_remove_command: async (input) => {
        removeCalls.push(input);
        return settings();
      }
    })
  });

  assert.equal(add.handled, true);
  assert.equal(update.handled, true);
  assert.equal(remove.handled, true);
  assert.deepEqual(addCalls, [
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      },
      folder: {
        name: "新增来源",
        path: "/tmp/PublicLibrary/source-videos-extra",
        enabled: true
      }
    }
  ]);
  assert.deepEqual(updateCalls, [
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      },
      source_folder_id: "src_002",
      patch: {
        name: "已更新来源",
        enabled: false
      }
    }
  ]);
  assert.deepEqual(removeCalls, [
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      },
      source_folder_id: "src_002"
    }
  ]);
  if (add.handled) {
    assert.equal(add.status_code, 200);
    assert.equal(add.body.ok, true);
  }
  if (update.handled) {
    assert.equal(update.status_code, 200);
    assert.equal(update.body.ok, true);
  }
  if (remove.handled) {
    assert.equal(remove.status_code, 200);
    assert.equal(remove.body.ok, true);
  }
});

test("settings command routes preserve mutation error mapping", async () => {
  const invalidJson = await callRoute({
    pathname: "/api/admin/settings/config",
    deps: makeDeps({
      read_request_json: async () => {
        throw new SyntaxError("bad json");
      }
    })
  });
  const invalidBody = await callRoute({
    method: "POST",
    pathname: "/api/admin/settings/source-folders",
    deps: makeDeps({
      read_request_json: async () => []
    })
  });
  const missing = await callRoute({
    method: "PATCH",
    pathname: "/api/admin/settings/source-folders/src_999",
    deps: makeDeps({
      read_request_json: async () => ({
        name: "不存在"
      }),
      run_source_folder_update_command: async () => {
        throw new Error("素材来源不存在");
      }
    })
  });

  assert.equal(invalidJson.handled, true);
  if (invalidJson.handled) {
    assert.equal(invalidJson.status_code, 400);
    assert.deepEqual(invalidJson.body, {
      ok: false,
      error_code: "invalid_request",
      message: "请求 JSON 格式无效"
    });
  }
  assert.equal(invalidBody.handled, true);
  if (invalidBody.handled) {
    assert.equal(invalidBody.status_code, 400);
    assert.deepEqual(invalidBody.body, {
      ok: false,
      error_code: "invalid_request",
      message: "请求内容必须是对象"
    });
  }
  assert.equal(missing.handled, true);
  if (missing.handled) {
    assert.equal(missing.status_code, 404);
    assert.deepEqual(missing.body, {
      ok: false,
      error_code: "not_found",
      message: "素材来源不存在"
    });
  }

  await assert.rejects(
    () => callRoute({
      pathname: "/api/admin/settings/config",
      deps: makeDeps({
        run_settings_config_command: async () => {
          throw new Error("unexpected failure");
        }
      })
    }),
    /unexpected failure/
  );
});

test("settings command routes map docker mvp command blocks to conflict responses", async () => {
  const details = {
    mode: "v0.1",
    command: "settings-config",
    policy: "docker-mvp-v0.1",
    allowed_surface: ["管理端登录", "剪辑师管理", "受控预处理队列"]
  };
  const result = await callRoute({
    pathname: "/api/admin/settings/config",
    deps: makeDeps({
      run_settings_config_command: async () => {
        throw Object.assign(new Error("Docker MVP v0.1 已阻断高风险管理端命令：settings-config"), {
          code: "admin_mvp_command_blocked",
          details
        });
      }
    })
  });

  assert.equal(result.handled, true);
  if (result.handled) {
    assert.equal(result.status_code, 409);
    assert.deepEqual(result.body, {
      ok: false,
      error_code: "admin_mvp_command_blocked",
      message: "Docker MVP v0.1 已阻断高风险管理端命令：settings-config",
      details
    });
  }
});

test("settings command routes ignore reads malformed ids and unrelated paths", async () => {
  let commandCalls = 0;
  const deps = makeDeps({
    run_settings_config_command: async () => {
      commandCalls += 1;
      return settings();
    },
    run_source_folder_add_command: async () => {
      commandCalls += 1;
      return settings();
    },
    run_source_folder_update_command: async () => {
      commandCalls += 1;
      return settings();
    },
    run_source_folder_remove_command: async () => {
      commandCalls += 1;
      return settings();
    }
  });

  assert.deepEqual(await callRoute({
    method: "GET",
    pathname: "/api/admin/settings/config",
    deps
  }), { handled: false });
  assert.deepEqual(await callRoute({
    method: "DELETE",
    pathname: "/api/admin/settings/source-folders",
    deps
  }), { handled: false });
  assert.deepEqual(await callRoute({
    method: "PATCH",
    pathname: "/api/admin/settings/source-folders/source_002",
    deps
  }), { handled: false });
  assert.deepEqual(await callRoute({
    method: "PATCH",
    pathname: "/api/admin/other",
    deps
  }), { handled: false });
  assert.equal(commandCalls, 0);
});
