import assert from "node:assert/strict";
import test from "node:test";
import {
  handleAdminSourceVideoMediaRoutes,
  matchAdminSourceVideoCoverPath,
  type AdminSourceVideoMediaRouteDeps
} from "./admin-source-video-media-routes.ts";

interface TestApiInput {
  library_root: string;
  request_id: string;
}

interface TestResponse {
  id: string;
}

function callRoute(input: {
  method?: string;
  pathname: string;
  deps?: AdminSourceVideoMediaRouteDeps<TestApiInput, TestResponse>;
}) {
  const apiInput: TestApiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-1"
  };
  const response: TestResponse = {
    id: "response-1"
  };

  return handleAdminSourceVideoMediaRoutes({
    method: input.method ?? "GET",
    pathname: input.pathname,
    api_input: apiInput,
    response,
    deps: input.deps ?? {
      write_cover: async () => undefined
    }
  });
}

test("source-video media routes handle cover GET through injected streaming writer", async () => {
  const calls: Array<{
    api_input: TestApiInput;
    response: TestResponse;
    source_video_id: string;
  }> = [];

  const result = await callRoute({
    pathname: "/api/admin/source-videos/V000123/cover",
    deps: {
      write_cover: async (input) => {
        calls.push(input);
      }
    }
  });

  assert.deepEqual(result, {
    handled: true
  });
  assert.deepEqual(calls, [
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      },
      response: {
        id: "response-1"
      },
      source_video_id: "V000123"
    }
  ]);
});

test("source-video cover path matcher returns only strict six-digit ids", () => {
  assert.equal(matchAdminSourceVideoCoverPath("/api/admin/source-videos/V000123/cover"), "V000123");
  assert.equal(matchAdminSourceVideoCoverPath("/api/admin/source-videos/V123/cover"), null);
  assert.equal(matchAdminSourceVideoCoverPath("/api/admin/source-videos/V000123"), null);
  assert.equal(matchAdminSourceVideoCoverPath("/api/admin/source-videos/V000123/cover/extra"), null);
});

test("source-video media routes ignore cover writes and unrelated paths", async () => {
  let writeCalls = 0;
  const deps: AdminSourceVideoMediaRouteDeps<TestApiInput, TestResponse> = {
    write_cover: async () => {
      writeCalls += 1;
    }
  };

  assert.deepEqual(await callRoute({
    method: "PATCH",
    pathname: "/api/admin/source-videos/V000123/cover",
    deps
  }), {
    handled: false
  });

  assert.deepEqual(await callRoute({
    pathname: "/api/admin/source-videos/V000123",
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

  assert.equal(writeCalls, 0);
});
