import assert from "node:assert/strict";
import test from "node:test";
import {
  handleAdminSourceVideoCommandRoutes,
  matchAdminSourceVideoPublishPath,
  matchAdminSourceVideoQueuePath,
  matchAdminSourceVideoRecoverProcessingPath,
  matchAdminSourceVideoMetadataPath,
  matchAdminSourceVideoRetryPath,
  type AdminSourceVideoCommandRouteCommandInput,
  type AdminSourceVideoCommandRouteDeps,
  type AdminSourceVideoTransitionRouteCommandInput
} from "./admin-source-video-command-routes.ts";

interface TestApiInput {
  library_root: string;
  request_id: string;
}

interface TestManifest {
  source_video_id: string;
  title: string;
}

interface TestPublicSourceVideo {
  id: string;
  title: string;
}

function makeDeps(
  overrides: Partial<AdminSourceVideoCommandRouteDeps<TestApiInput, TestManifest, TestPublicSourceVideo>> = {}
): AdminSourceVideoCommandRouteDeps<TestApiInput, TestManifest, TestPublicSourceVideo> {
  return {
    read_request_json: async () => ({
      title: "现金流管理"
    }),
    run_cover_command: async (input) => ({
      source_video_id: input.source_video_id,
      title: "封面已更新"
    }),
    run_metadata_command: async (input) => ({
      source_video_id: input.source_video_id,
      title: typeof input.body.title === "string" ? input.body.title : "未命名"
    }),
    run_transition_command: async (input) => ({
      affected_count: 1,
      source_video_ids: [input.source_video_id],
      command: input.command
    }),
    read_preprocess_supervisor_status: () => ({
      state: "stopped"
    }),
    recover_processing_supervisor_block: () => null,
    run_publish_command: async (input) => ({
      source_video_id: input.source_video_id,
      published_count: 1
    }),
    to_public_source_video: (manifest) => ({
      id: manifest.source_video_id,
      title: manifest.title
    }),
    clear_source_video_page_cache: () => undefined,
    ...overrides
  };
}

function callRoute(input: {
  method?: string;
  pathname: string;
  deps?: AdminSourceVideoCommandRouteDeps<TestApiInput, TestManifest, TestPublicSourceVideo>;
}) {
  return handleAdminSourceVideoCommandRoutes({
    method: input.method ?? "PATCH",
    pathname: input.pathname,
    api_input: {
      library_root: "/tmp/PublicLibrary",
      request_id: "req-1"
    },
    deps: input.deps ?? makeDeps()
  });
}

test("source-video command routes handle cover patch with injected command service", async () => {
  const coverCalls: Array<AdminSourceVideoCommandRouteCommandInput<TestApiInput>> = [];
  const cleared: string[] = [];
  const result = await callRoute({
    pathname: "/api/admin/source-videos/V000123/cover",
    deps: makeDeps({
      read_request_json: async () => ({
        image_base64: "abc",
        content_type: "image/png"
      }),
      run_cover_command: async (input) => {
        coverCalls.push(input);
        return {
          source_video_id: input.source_video_id,
          title: "封面已更新"
        };
      },
      clear_source_video_page_cache: (libraryRoot) => {
        cleared.push(libraryRoot);
      }
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.deepEqual(coverCalls, [
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      },
      source_video_id: "V000123",
      body: {
        image_base64: "abc",
        content_type: "image/png"
      }
    }
  ]);
  assert.deepEqual(cleared, ["/tmp/PublicLibrary"]);
  assert.equal(result.status_code, 200);
  assert.deepEqual(result.body, {
    ok: true,
    data: {
      id: "V000123",
      title: "封面已更新"
    }
  });
});

test("source-video command routes preserve cover not-found and invalid-request behavior", async () => {
  const missing = await callRoute({
    pathname: "/api/admin/source-videos/V000404/cover",
    deps: makeDeps({
      run_cover_command: async () => null
    })
  });

  assert.equal(missing.handled, true);
  if (missing.handled) {
    assert.equal(missing.status_code, 404);
    assert.deepEqual(missing.body, {
      ok: false,
      error_code: "not_found",
      message: "原视频不存在"
    });
  }

  const invalidJson = await callRoute({
    pathname: "/api/admin/source-videos/V000123/cover",
    deps: makeDeps({
      read_request_json: async () => {
        throw new SyntaxError("bad json");
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

  const invalidImage = await callRoute({
    pathname: "/api/admin/source-videos/V000123/cover",
    deps: makeDeps({
      run_cover_command: async () => {
        throw new Error("内容与类型不匹配");
      }
    })
  });

  assert.equal(invalidImage.handled, true);
  if (invalidImage.handled) {
    assert.equal(invalidImage.status_code, 400);
    assert.deepEqual(invalidImage.body, {
      ok: false,
      error_code: "invalid_request",
      message: "内容与类型不匹配"
    });
  }
});

test("source-video command routes preserve docker mvp command blocks through cover catch", async () => {
  const result = await callRoute({
    pathname: "/api/admin/source-videos/V000123/cover",
    deps: makeDeps({
      run_cover_command: async () => {
        throw Object.assign(new Error("Docker MVP v0.1 已阻断高风险管理端命令：source-video-cover"), {
          code: "admin_mvp_command_blocked",
          details: {
            mode: "v0.1",
            command: "source-video-cover",
            policy: "docker-mvp-v0.1",
            allowed_surface: ["管理端登录", "剪辑师管理", "受控预处理队列"]
          }
        });
      }
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.equal(result.status_code, 409);
  assert.deepEqual(result.body, {
    ok: false,
    error_code: "admin_mvp_command_blocked",
    message: "Docker MVP v0.1 已阻断高风险管理端命令：source-video-cover",
    details: {
      mode: "v0.1",
      command: "source-video-cover",
      policy: "docker-mvp-v0.1",
      allowed_surface: ["管理端登录", "剪辑师管理", "受控预处理队列"]
    }
  });
});

test("source-video command routes handle metadata patch with injected command service", async () => {
  let metadataCall:
    | (AdminSourceVideoCommandRouteCommandInput<TestApiInput> & { body: Record<string, unknown> })
    | undefined;
  const cleared: string[] = [];
  const result = await callRoute({
    pathname: "/api/admin/source-videos/V000321/metadata",
    deps: makeDeps({
      read_request_json: async () => ({
        title: "现金流管理新版",
        tags: ["现金流", "财务"]
      }),
      run_metadata_command: async (input) => {
        metadataCall = input;
        return {
          source_video_id: input.source_video_id,
          title: String(input.body.title)
        };
      },
      clear_source_video_page_cache: (libraryRoot) => {
        cleared.push(libraryRoot);
      }
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.deepEqual(metadataCall, {
    api_input: {
      library_root: "/tmp/PublicLibrary",
      request_id: "req-1"
    },
    source_video_id: "V000321",
    body: {
      title: "现金流管理新版",
      tags: ["现金流", "财务"]
    }
  });
  assert.deepEqual(cleared, ["/tmp/PublicLibrary"]);
  assert.equal(result.status_code, 200);
  assert.deepEqual(result.body, {
    ok: true,
    data: {
      id: "V000321",
      title: "现金流管理新版"
    }
  });
});

test("source-video command routes preserve metadata not-found and outer error behavior", async () => {
  const missing = await callRoute({
    pathname: "/api/admin/source-videos/V000404/metadata",
    deps: makeDeps({
      run_metadata_command: async () => null
    })
  });

  assert.equal(missing.handled, true);
  if (missing.handled) {
    assert.equal(missing.status_code, 404);
    assert.deepEqual(missing.body, {
      ok: false,
      error_code: "not_found",
      message: "原视频不存在"
    });
  }

  await assert.rejects(
    () => callRoute({
      pathname: "/api/admin/source-videos/V000123/metadata",
      deps: makeDeps({
        read_request_json: async () => {
          throw new SyntaxError("bad json");
        }
      })
    }),
    SyntaxError
  );
});

test("source-video command routes handle queue and retry transition posts", async () => {
  const transitionCalls: Array<AdminSourceVideoTransitionRouteCommandInput<TestApiInput>> = [];
  const cleared: string[] = [];
  const queue = await callRoute({
    method: "POST",
    pathname: "/api/admin/source-videos/V000123/queue",
    deps: makeDeps({
      run_transition_command: async (input) => {
        transitionCalls.push(input);
        return {
          affected_count: 1,
          source_video_ids: [input.source_video_id]
        };
      },
      clear_source_video_page_cache: (libraryRoot) => {
        cleared.push(libraryRoot);
      }
    })
  });
  const retry = await callRoute({
    method: "POST",
    pathname: "/api/admin/source-videos/V000321/retry",
    deps: makeDeps({
      run_transition_command: async (input) => {
        transitionCalls.push(input);
        return {
          affected_count: 0,
          source_video_ids: []
        };
      },
      clear_source_video_page_cache: (libraryRoot) => {
        cleared.push(libraryRoot);
      }
    })
  });

  assert.equal(queue.handled, true);
  assert.equal(retry.handled, true);
  assert.deepEqual(transitionCalls, [
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      },
      source_video_id: "V000123",
      command: "source-video-queue"
    },
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      },
      source_video_id: "V000321",
      command: "source-video-retry"
    }
  ]);
  assert.deepEqual(cleared, ["/tmp/PublicLibrary", "/tmp/PublicLibrary"]);
  if (queue.handled) {
    assert.equal(queue.status_code, 200);
    assert.deepEqual(queue.body, {
      ok: true,
      data: {
        affected_count: 1,
        source_video_ids: ["V000123"],
        message: "已将 V000123 加入预处理队列。"
      }
    });
  }
  if (retry.handled) {
    assert.equal(retry.status_code, 200);
    assert.deepEqual(retry.body, {
      ok: true,
      data: {
        affected_count: 0,
        source_video_ids: [],
        message: "V000321 当前状态不能重试。"
      }
    });
  }
});

test("source-video command routes block recover-processing while supervisor is active", async () => {
  let transitionCalls = 0;
  let clearCalls = 0;
  const result = await callRoute({
    method: "POST",
    pathname: "/api/admin/source-videos/V000123/recover-processing",
    deps: makeDeps({
      read_preprocess_supervisor_status: () => ({
        state: "running"
      }),
      recover_processing_supervisor_block: (input) => input.supervisor_state === "running"
        ? {
            error_code: "invalid_request",
            message: "预处理流水线仍在运行，不能恢复正在处理的任务。"
          }
        : null,
      run_transition_command: async (input) => {
        transitionCalls += 1;
        return {
          affected_count: 1,
          source_video_ids: [input.source_video_id]
        };
      },
      clear_source_video_page_cache: () => {
        clearCalls += 1;
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
  assert.equal(transitionCalls, 0);
  assert.equal(clearCalls, 0);
});

test("source-video command routes handle recover-processing and publish posts", async () => {
  const transitionCalls: Array<AdminSourceVideoTransitionRouteCommandInput<TestApiInput>> = [];
  const publishCalls: Array<{ api_input: TestApiInput; source_video_id: string }> = [];
  const supervisorStates: string[] = [];
  const cleared: string[] = [];
  const recover = await callRoute({
    method: "POST",
    pathname: "/api/admin/source-videos/V000123/recover-processing",
    deps: makeDeps({
      read_preprocess_supervisor_status: () => ({
        state: "stopped",
        worker_id: ""
      }),
      recover_processing_supervisor_block: (input) => {
        supervisorStates.push(input.supervisor_state);
        return null;
      },
      run_transition_command: async (input) => {
        transitionCalls.push(input);
        return {
          affected_count: 1,
          source_video_ids: [input.source_video_id]
        };
      },
      clear_source_video_page_cache: (libraryRoot) => {
        cleared.push(libraryRoot);
      }
    })
  });
  const publish = await callRoute({
    method: "POST",
    pathname: "/api/admin/source-videos/V000999/publish",
    deps: makeDeps({
      run_publish_command: async (input) => {
        publishCalls.push(input);
        return {
          source_video_id: input.source_video_id,
          published_count: 1,
          index_version: "v010500"
        };
      },
      clear_source_video_page_cache: (libraryRoot) => {
        cleared.push(libraryRoot);
      }
    })
  });

  assert.equal(recover.handled, true);
  assert.equal(publish.handled, true);
  assert.deepEqual(supervisorStates, ["stopped"]);
  assert.deepEqual(transitionCalls, [
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      },
      source_video_id: "V000123",
      command: "source-video-recover-processing"
    }
  ]);
  assert.deepEqual(publishCalls, [
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      },
      source_video_id: "V000999"
    }
  ]);
  assert.deepEqual(cleared, ["/tmp/PublicLibrary", "/tmp/PublicLibrary"]);
  if (recover.handled) {
    assert.equal(recover.status_code, 200);
    assert.deepEqual(recover.body, {
      ok: true,
      data: {
        affected_count: 1,
        source_video_ids: ["V000123"],
        message: "已将 V000123 从处理中恢复到预处理队列。"
      }
    });
  }
  if (publish.handled) {
    assert.equal(publish.status_code, 200);
    assert.deepEqual(publish.body, {
      ok: true,
      data: {
        source_video_id: "V000999",
        published_count: 1,
        index_version: "v010500"
      }
    });
  }
});

test("source-video command routes ignore reads malformed ids and unrelated paths", async () => {
  let commandCalls = 0;
  const deps = makeDeps({
    run_cover_command: async (input) => {
      commandCalls += 1;
      return {
        source_video_id: input.source_video_id,
        title: "封面已更新"
      };
    },
    run_metadata_command: async (input) => {
      commandCalls += 1;
      return {
        source_video_id: input.source_video_id,
        title: String(input.body.title ?? "")
      };
    },
    run_transition_command: async (input) => {
      commandCalls += 1;
      return {
        affected_count: 1,
        source_video_ids: [input.source_video_id]
      };
    },
    run_publish_command: async (input) => {
      commandCalls += 1;
      return {
        source_video_id: input.source_video_id,
        published_count: 1
      };
    }
  });

  assert.equal(matchAdminSourceVideoMetadataPath("/api/admin/source-videos/V000123/metadata"), "V000123");
  assert.equal(matchAdminSourceVideoQueuePath("/api/admin/source-videos/V000123/queue"), "V000123");
  assert.equal(matchAdminSourceVideoRetryPath("/api/admin/source-videos/V000123/retry"), "V000123");
  assert.equal(
    matchAdminSourceVideoRecoverProcessingPath("/api/admin/source-videos/V000123/recover-processing"),
    "V000123"
  );
  assert.equal(matchAdminSourceVideoPublishPath("/api/admin/source-videos/V000123/publish"), "V000123");
  assert.equal(matchAdminSourceVideoMetadataPath("/api/admin/source-videos/V123/metadata"), null);
  assert.equal(matchAdminSourceVideoQueuePath("/api/admin/source-videos/V123/queue"), null);
  assert.equal(matchAdminSourceVideoRetryPath("/api/admin/source-videos/V123/retry"), null);
  assert.equal(matchAdminSourceVideoRecoverProcessingPath("/api/admin/source-videos/V123/recover-processing"), null);
  assert.equal(matchAdminSourceVideoPublishPath("/api/admin/source-videos/V123/publish"), null);
  assert.deepEqual(await callRoute({
    method: "GET",
    pathname: "/api/admin/source-videos/V000123/cover",
    deps
  }), {
    handled: false
  });
  assert.deepEqual(await callRoute({
    pathname: "/api/admin/source-videos/V123/metadata",
    deps
  }), {
    handled: false
  });
  assert.deepEqual(await callRoute({
    method: "GET",
    pathname: "/api/admin/source-videos/V000123/queue",
    deps
  }), {
    handled: false
  });
  assert.deepEqual(await callRoute({
    method: "POST",
    pathname: "/api/admin/source-videos/V123/publish",
    deps
  }), {
    handled: false
  });
  assert.deepEqual(await callRoute({
    pathname: "/api/admin/preprocess/jobs/J000123/log",
    deps
  }), {
    handled: false
  });
  assert.equal(commandCalls, 0);
});
