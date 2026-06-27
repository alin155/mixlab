import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminSourceVideoCommandRouteDeps,
  createAdminSourceVideoCommandRouteServerDeps
} from "./admin-source-video-command-route-deps.ts";

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

interface TestActor {
  id: string;
}

interface TestMedia {
  kind: "test-media";
}

interface TestRuntimeSupervisorStatus {
  internal_state: "running" | "stopped";
  temporary_result_count: number;
}

interface TestPublicSupervisorStatus {
  state: "running" | "stopped";
}

test("source-video command route deps preserve command context and injected helpers", async () => {
  const actor: TestActor = { id: "admin-1" };
  const media: TestMedia = { kind: "test-media" };
  const now = () => "2026-06-26T22:45:01.000Z";
  const calls: Array<{ name: string; input: unknown }> = [];
  const clearedPages: string[] = [];
  const clearedIndexes: string[] = [];
  const deps = createAdminSourceVideoCommandRouteDeps<
    TestApiInput,
    TestManifest,
    TestPublicSourceVideo,
    TestActor,
    TestMedia
  >({
    library_id: "mixlab",
    library_name: "MixLab",
    command_now: "2026-06-26T22:45:00.000Z",
    actor,
    now,
    media,
    read_request_json: async () => ({
      title: "现金流管理"
    }),
    async run_cover_command(input) {
      calls.push({ name: "cover", input });
      return {
        source_video_id: input.source_video_id,
        title: "封面"
      };
    },
    async run_metadata_command(input) {
      calls.push({ name: "metadata", input });
      return {
        source_video_id: input.source_video_id,
        title: String(input.body.title)
      };
    },
    async run_transition_command(input) {
      calls.push({ name: "transition", input });
      return {
        affected_count: 1
      };
    },
    read_preprocess_supervisor_status: () => ({
      state: "stopped"
    }),
    recover_processing_supervisor_block(input) {
      calls.push({ name: "recover-block", input });
      return null;
    },
    async run_publish_command(input) {
      calls.push({ name: "publish", input: {
        ...input,
        invalidate_index_version_cache: "function"
      } });
      input.invalidate_index_version_cache();
      return {
        published_count: 1
      };
    },
    to_public_source_video: (manifest) => ({
      id: manifest.source_video_id,
      title: manifest.title
    }),
    clear_source_video_page_cache(libraryRoot) {
      clearedPages.push(libraryRoot);
    },
    clear_index_version_cache(libraryRoot) {
      clearedIndexes.push(libraryRoot);
    }
  });

  const apiInput: TestApiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-1"
  };
  const requestBody = await deps.read_request_json();
  const cover = await deps.run_cover_command({
    api_input: apiInput,
    source_video_id: "V000123",
    body: requestBody
  });
  const metadata = await deps.run_metadata_command({
    api_input: apiInput,
    source_video_id: "V000124",
    body: {
      title: "标题"
    }
  });
  const transition = await deps.run_transition_command({
    api_input: apiInput,
    source_video_id: "V000125",
    command: "source-video-retry"
  });
  const supervisor = deps.read_preprocess_supervisor_status();
  const block = deps.recover_processing_supervisor_block({
    command: "source-video-recover-processing",
    supervisor_state: supervisor.state
  });
  const publish = await deps.run_publish_command({
    api_input: apiInput,
    source_video_id: "V000126"
  });
  deps.clear_source_video_page_cache(apiInput.library_root);

  assert.deepEqual(cover, {
    source_video_id: "V000123",
    title: "封面"
  });
  assert.deepEqual(metadata, {
    source_video_id: "V000124",
    title: "标题"
  });
  assert.deepEqual(transition, {
    affected_count: 1
  });
  assert.equal(block, null);
  assert.deepEqual(publish, {
    published_count: 1
  });
  assert.deepEqual(deps.to_public_source_video(metadata), {
    id: "V000124",
    title: "标题"
  });
  assert.deepEqual(clearedPages, ["/tmp/PublicLibrary"]);
  assert.deepEqual(clearedIndexes, ["/tmp/PublicLibrary"]);
  assert.deepEqual(calls, [
    {
      name: "cover",
      input: {
        library_root: "/tmp/PublicLibrary",
        source_video_id: "V000123",
        command_now: "2026-06-26T22:45:00.000Z",
        actor,
        now,
        body: {
          title: "现金流管理"
        }
      }
    },
    {
      name: "metadata",
      input: {
        library_root: "/tmp/PublicLibrary",
        source_video_id: "V000124",
        command_now: "2026-06-26T22:45:00.000Z",
        actor,
        now,
        body: {
          title: "标题"
        }
      }
    },
    {
      name: "transition",
      input: {
        library_root: "/tmp/PublicLibrary",
        source_video_id: "V000125",
        command_now: "2026-06-26T22:45:00.000Z",
        actor,
        now,
        library_id: "mixlab",
        library_name: "MixLab",
        command: "source-video-retry"
      }
    },
    {
      name: "recover-block",
      input: {
        command: "source-video-recover-processing",
        supervisor_state: "stopped"
      }
    },
    {
      name: "publish",
      input: {
        library_root: "/tmp/PublicLibrary",
        source_video_id: "V000126",
        command_now: "2026-06-26T22:45:00.000Z",
        actor,
        now,
        library_id: "mixlab",
        media,
        invalidate_index_version_cache: "function"
      }
    }
  ]);
});

test("source-video command route server deps project supervisor status before recover blocking", async () => {
  const actor: TestActor = { id: "admin-1" };
  const media: TestMedia = { kind: "test-media" };
  const calls: Array<{ name: string; input: unknown }> = [];
  const deps = createAdminSourceVideoCommandRouteServerDeps<
    TestApiInput,
    TestManifest,
    TestPublicSourceVideo,
    TestActor,
    TestMedia,
    TestRuntimeSupervisorStatus,
    TestPublicSupervisorStatus
  >({
    library_id: "mixlab",
    library_name: "MixLab",
    command_now: "2026-06-27T03:30:00.000Z",
    actor,
    media,
    read_request_json: async () => ({
      title: "现金流管理"
    }),
    async run_cover_command(input) {
      calls.push({ name: "cover", input });
      return null;
    },
    async run_metadata_command(input) {
      calls.push({ name: "metadata", input });
      return null;
    },
    async run_transition_command(input) {
      calls.push({ name: "transition", input });
      return {
        affected_count: 0
      };
    },
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
    recover_processing_supervisor_block(input) {
      calls.push({ name: "recover-block", input });
      return input.supervisor_state === "running"
        ? {
            error_code: "supervisor_running",
            message: "预处理主管正在运行"
          }
        : null;
    },
    async run_publish_command(input) {
      calls.push({ name: "publish", input });
      return {
        published_count: 0
      };
    },
    to_public_source_video: (manifest) => ({
      id: manifest.source_video_id,
      title: manifest.title
    }),
    clear_source_video_page_cache() {},
    clear_index_version_cache() {}
  });

  const apiInput: TestApiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-server"
  };
  const supervisor = deps.read_preprocess_supervisor_status();
  const block = deps.recover_processing_supervisor_block({
    command: "source-video-recover-processing",
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
      name: "recover-block",
      input: {
        command: "source-video-recover-processing",
        supervisor_state: "running"
      }
    }
  ]);
  assert.equal(apiInput.library_root, "/tmp/PublicLibrary");
});
