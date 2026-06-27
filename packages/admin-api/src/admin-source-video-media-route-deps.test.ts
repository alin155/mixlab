import assert from "node:assert/strict";
import test from "node:test";
import { createAdminSourceVideoMediaRouteDeps } from "./admin-source-video-media-route-deps.ts";

interface TestApiInput {
  library_root: string;
  request_id: string;
}

interface TestResponse {
  id: string;
}

test("source-video media route deps adapt cover writer arguments", async () => {
  const calls: Array<{
    response: TestResponse;
    api_input: TestApiInput;
    source_video_id: string;
  }> = [];
  const deps = createAdminSourceVideoMediaRouteDeps<TestApiInput, TestResponse>({
    write_cover(response, apiInput, sourceVideoId) {
      calls.push({
        response,
        api_input: apiInput,
        source_video_id: sourceVideoId
      });
      return Promise.resolve();
    }
  });

  await deps.write_cover({
    api_input: {
      library_root: "/tmp/PublicLibrary",
      request_id: "req-1"
    },
    response: {
      id: "response-1"
    },
    source_video_id: "V000123"
  });

  assert.deepEqual(calls, [{
    response: {
      id: "response-1"
    },
    api_input: {
      library_root: "/tmp/PublicLibrary",
      request_id: "req-1"
    },
    source_video_id: "V000123"
  }]);
});
