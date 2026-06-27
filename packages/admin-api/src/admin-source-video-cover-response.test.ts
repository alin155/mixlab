import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import { apiError, type AdminApiErrorEnvelope } from "./admin-route-adapter.ts";
import { writeAdminSourceVideoCoverResponse } from "./admin-source-video-cover-response.ts";

interface TestResponse {
  id: string;
}

function sourceVideoManifest(input: {
  source_video_id: string;
  cover_path?: string;
}): SourceVideoManifest {
  return {
    source_video_id: input.source_video_id,
    title: "Video",
    relative_path: "course/video.mp4",
    logical_uri: `library://source-video/${input.source_video_id}`,
    duration_ms: 60_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1024,
    content_hash: "hash",
    preprocess_status: "ready",
    visible_to_cutters: true,
    transcript_path: "artifacts/transcript.json",
    srt_path: "artifacts/transcript.srt",
    keyframes_path: "artifacts/keyframes.json",
    cover_path: input.cover_path ?? ""
  };
}

function makeHarness(input: {
  manifest?: SourceVideoManifest | null;
  manifest_error?: Error;
  resolved_path?: string | null;
  existing_files?: string[];
} = {}) {
  const writes: Array<{
    status_code: number;
    body: AdminApiErrorEnvelope;
  }> = [];
  const streams: Array<{
    status_code: number;
    headers: Record<string, string>;
    file_path: string;
  }> = [];
  const existingFiles = new Set(input.existing_files ?? []);
  const response: TestResponse = { id: "response-1" };

  return {
    response,
    writes,
    streams,
    deps: {
      async read_source_video_manifest() {
        if (input.manifest_error) {
          throw input.manifest_error;
        }
        if (input.manifest === undefined) {
          return sourceVideoManifest({
            source_video_id: "V000001",
            cover_path: "artifacts/V000001/cover.jpg"
          });
        }
        if (!input.manifest) {
          throw new Error("missing manifest");
        }
        return input.manifest;
      },
      resolve_artifact_path(resolveInput: {
        library_root: string;
        source_video_id: string;
        artifact_path: string;
        fallback_file_name?: string;
      }) {
        if (input.resolved_path !== undefined) {
          return input.resolved_path;
        }
        return path.join(resolveInput.library_root, resolveInput.artifact_path);
      },
      async file_exists(filePath: string) {
        return existingFiles.has(filePath);
      },
      image_content_type(filePath: string) {
        return filePath.endsWith(".png") ? "image/png" : "image/jpeg";
      },
      write_json(_response: TestResponse, statusCode: number, body: AdminApiErrorEnvelope) {
        writes.push({ status_code: statusCode, body });
      },
      write_stream(streamInput: {
        response: TestResponse;
        status_code: number;
        headers: Record<string, string>;
        file_path: string;
      }) {
        streams.push({
          status_code: streamInput.status_code,
          headers: streamInput.headers,
          file_path: streamInput.file_path
        });
      },
      api_error: apiError
    }
  };
}

test("admin source-video cover response streams existing cover files with CORS and content type", async () => {
  const libraryRoot = "/tmp/PublicLibrary";
  const coverPath = path.join(libraryRoot, "artifacts", "V000001", "cover.jpg");
  const harness = makeHarness({
    existing_files: [coverPath]
  });

  await writeAdminSourceVideoCoverResponse({
    response: harness.response,
    api_input: { library_root: libraryRoot },
    source_video_id: "V000001",
    deps: harness.deps
  });

  assert.deepEqual(harness.writes, []);
  assert.deepEqual(harness.streams, [{
    status_code: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "image/jpeg"
    },
    file_path: coverPath
  }]);
});

test("admin source-video cover response returns the same not-found envelope for missing manifest or cover", async () => {
  for (const harness of [
    makeHarness({ manifest_error: new Error("missing manifest") }),
    makeHarness({ manifest: sourceVideoManifest({ source_video_id: "V000002" }) }),
    makeHarness({ resolved_path: null }),
    makeHarness({ existing_files: [] })
  ]) {
    await writeAdminSourceVideoCoverResponse({
      response: harness.response,
      api_input: { library_root: "/tmp/PublicLibrary" },
      source_video_id: "V000002",
      deps: harness.deps
    });

    assert.deepEqual(harness.streams, []);
    assert.deepEqual(harness.writes, [{
      status_code: 404,
      body: {
        ok: false,
        error_code: "not_found",
        message: "封面不存在"
      }
    }]);
  }
});

test("admin source-video cover response uses resolver output and projected image type", async () => {
  const coverPath = "/tmp/PublicLibrary/.mixlab-library/videos/V000003/custom.png";
  const harness = makeHarness({
    manifest: sourceVideoManifest({
      source_video_id: "V000003",
      cover_path: "library://video/V000003/custom.png"
    }),
    resolved_path: coverPath,
    existing_files: [coverPath]
  });

  await writeAdminSourceVideoCoverResponse({
    response: harness.response,
    api_input: { library_root: "/tmp/PublicLibrary" },
    source_video_id: "V000003",
    deps: harness.deps
  });

  assert.deepEqual(harness.streams, [{
    status_code: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "image/png"
    },
    file_path: coverPath
  }]);
});
