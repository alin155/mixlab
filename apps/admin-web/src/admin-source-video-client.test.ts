import assert from "node:assert/strict";
import test from "node:test";
import { createAdminSourceVideoClientMethods } from "./admin-source-video-client.ts";
import { resolveMediaUrl } from "./admin-source-video-media.ts";
import type {
  AdminApiEnvelope,
  AdminArtifactDetail,
  AdminSourceVideo,
  AdminSourceVideoDetail
} from "./api.ts";

function sourceVideo(overrides: Partial<AdminSourceVideo> = {}): AdminSourceVideo {
  return {
    source_video_id: "V000001",
    title: "现金流",
    file_name: "cashflow.mp4",
    relative_path: "source-videos/cashflow.mp4",
    cover_url: "/api/admin/source-videos/V000001/cover",
    duration_ms: 120_000,
    file_size: 4096,
    preprocess_status: "ready",
    visible_to_cutters: true,
    tags: [],
    description: "",
    lecturer: "",
    course: "",
    category: "",
    updated_at: "",
    ...overrides
  };
}

function sourceVideoDetail(video: AdminSourceVideo): AdminSourceVideoDetail {
  const artifact = (path: string, exists = true): AdminArtifactDetail => ({
    path,
    file_path: path ? `/Volumes/PublicLibrary/${path}` : "",
    exists
  });

  return {
    source_video: video,
    technical: {
      duration_ms: video.duration_ms,
      width: 1920,
      height: 1080,
      fps: 25,
      codec: "h264",
      file_size: video.file_size,
      content_hash: "sample-content-hash",
      relative_path: video.relative_path
    },
    visibility: {
      visible_to_cutters: video.visible_to_cutters,
      label: "已发布",
      reason: "当前索引可见"
    },
    preprocess: {
      status: "ready",
      job_id: "J000001",
      stage: "indexed",
      attempt: 1,
      started_at: "2024-05-07T09:00:00.000Z",
      completed_at: "2024-05-07T10:00:00.000Z",
      failed_at: "",
      error_stage: "",
      error_message: ""
    },
    artifacts: {
      transcript: artifact(".mixlab-library/videos/V000001/transcript.json"),
      subtitles: artifact(".mixlab-library/videos/V000001/subtitles.vtt", false),
      cover: artifact(".mixlab-library/videos/V000001/cover.jpg"),
      keyframes: artifact(".mixlab-library/videos/V000001/keyframes.json"),
      index_version: "v000027"
    },
    transcript: {
      full_text: "现金流课程文案",
      segment_count: 12,
      character_count: 128
    }
  };
}

test("source-video media URL resolver preserves safe URLs and blocks unsupported schemes", () => {
  assert.equal(
    resolveMediaUrl("http://127.0.0.1:3889", "/api/admin/source-videos/V000001/cover"),
    "http://127.0.0.1:3889/api/admin/source-videos/V000001/cover"
  );
  assert.equal(resolveMediaUrl("/", "covers/V000002.jpg"), "/covers/V000002.jpg");
  assert.equal(resolveMediaUrl("/", "data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
  assert.equal(resolveMediaUrl("/", "data:text/html;base64,AAAA"), "");
  assert.equal(resolveMediaUrl("/", "javascript:alert(1)"), "");
  assert.equal(resolveMediaUrl("/", "file:///tmp/cover.jpg"), "");
});

test("source-video client preserves list query, runtime meta, and media URL resolution", async () => {
  const requests: Array<{ pathname: string; search: string; method: string; token: string | null }> = [];
  const client = createAdminSourceVideoClientMethods({
    baseUrl: "http://127.0.0.1:3889",
    protectedHeaders: {
      "X-MixLab-Admin-Session-Token": "admin-session-001"
    },
    fetchImpl: async (url, init) => {
      const parsed = new URL(String(url));
      requests.push({
        pathname: parsed.pathname,
        search: parsed.search,
        method: init?.method ?? "GET",
        token: new Headers(init?.headers).get("x-mixlab-admin-session-token")
      });

      const envelope: AdminApiEnvelope<AdminSourceVideo[]> = {
        ok: true,
        data: [sourceVideo()],
        meta: {
          runtime: {
            schema_version: "1.0",
            endpoint: "/api/admin/source-videos",
            method: "GET",
            duration_ms: 42,
            scan_mode: "paged-list",
            data_source: "admin-read-model",
            scan_reason: "route-owned-page",
            actual_data_source: "admin-read-model",
            cache_status: "hit",
            result_count: 1,
            offset: 20,
            limit: 20,
            slow: false,
            slow_reason: ""
          }
        }
      };
      return new Response(JSON.stringify(envelope), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  const result = await client.listSourceVideosWithRuntime({
    limit: 20,
    offset: 20,
    query: "  现金流  ",
    status: "processing"
  });

  assert.equal(result.source_videos[0]?.cover_url, "http://127.0.0.1:3889/api/admin/source-videos/V000001/cover");
  assert.equal(result.runtime?.scan_mode, "paged-list");
  assert.deepEqual(requests, [
    {
      pathname: "/api/admin/source-videos",
      search: "?limit=20&offset=20&query=%E7%8E%B0%E9%87%91%E6%B5%81&status=processing",
      method: "GET",
      token: "admin-session-001"
    }
  ]);
});

test("source-video client can request source videos as a read-only probe", async () => {
  const requests: Array<{ search: string; token: string | null; readOnlyProbe: string | null }> = [];
  const client = createAdminSourceVideoClientMethods({
    baseUrl: "http://127.0.0.1:3889",
    protectedHeaders: {
      "X-MixLab-Admin-Session-Token": "admin-session-001"
    },
    fetchImpl: async (url, init) => {
      const parsed = new URL(String(url));
      const headers = new Headers(init?.headers);
      requests.push({
        search: parsed.search,
        token: headers.get("x-mixlab-admin-session-token"),
        readOnlyProbe: headers.get("x-mixlab-admin-read-only-probe")
      });

      const envelope: AdminApiEnvelope<AdminSourceVideo[]> = {
        ok: true,
        data: [sourceVideo({ preprocess_status: "index-required", visible_to_cutters: false })]
      };
      return new Response(JSON.stringify(envelope), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  const result = await client.listSourceVideosReadOnly({
    limit: 20,
    status: "index-required"
  });

  assert.equal(result[0]?.preprocess_status, "index-required");
  assert.deepEqual(requests, [
    {
      search: "?limit=20&status=index-required",
      token: "admin-session-001",
      readOnlyProbe: "true"
    }
  ]);
});

test("source-video client forwards explicit manifest fallback policy", async () => {
  const requests: Array<{ search: string }> = [];
  const client = createAdminSourceVideoClientMethods({
    baseUrl: "http://127.0.0.1:3889",
    fetchImpl: async (url) => {
      const parsed = new URL(String(url));
      requests.push({ search: parsed.search });

      const envelope: AdminApiEnvelope<AdminSourceVideo[]> = {
        ok: true,
        data: [],
        meta: {
          runtime: {
            schema_version: "1.0",
            endpoint: "/api/admin/source-videos",
            method: "GET",
            duration_ms: 12,
            scan_mode: "paged-list",
            data_source: "admin-read-model",
            scan_reason: "route-owned-page",
            actual_data_source: "admin-read-model",
            cache_status: "miss",
            result_count: 0,
            offset: 0,
            limit: 20,
            slow: false,
            slow_reason: "",
            fallback_reason: "manifest-fallback:forbidden"
          }
        }
      };
      return new Response(JSON.stringify(envelope), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  await client.listSourceVideosWithRuntime({
    limit: 20,
    status: "index-required",
    manifest_fallback: "forbid"
  });

  assert.deepEqual(requests, [{
    search: "?limit=20&status=index-required&manifest_fallback=forbid"
  }]);
});

test("source-video client preserves detail, command, metadata, and cover endpoints", async () => {
  const requests: Array<{ pathname: string; method: string; token: string | null; body?: unknown }> = [];
  const client = createAdminSourceVideoClientMethods({
    baseUrl: "http://127.0.0.1:3889",
    protectedHeaders: {
      "X-MixLab-Admin-Session-Token": "admin-session-001"
    },
    fetchImpl: async (url, init) => {
      const parsed = new URL(String(url));
      requests.push({
        pathname: parsed.pathname,
        method: init?.method ?? "GET",
        token: new Headers(init?.headers).get("x-mixlab-admin-session-token"),
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });

      const data = parsed.pathname.endsWith("/metadata") || parsed.pathname.endsWith("/cover")
        ? sourceVideo({ title: "新标题" })
        : parsed.pathname === "/api/admin/source-videos/V000001"
          ? sourceVideoDetail(sourceVideo())
          : { ok: true, message: "ok", affected_count: 1 };

      return new Response(JSON.stringify({ ok: true, data }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  const detail = await client.getSourceVideoDetail("V000001");
  await client.queueSourceVideo("V000001");
  await client.retrySourceVideo("V000001");
  await client.recoverProcessingSourceVideo("V000001");
  await client.publishSourceVideo("V000001");
  const metadata = await client.updateSourceVideoMetadata("V000001", {
    title: "新标题",
    tags: ["财务"]
  });
  const cover = await client.updateSourceVideoCover("V000001", {
    image_base64: "AAAA",
    content_type: "image/png"
  });

  assert.equal(detail.source_video.cover_url, "http://127.0.0.1:3889/api/admin/source-videos/V000001/cover");
  assert.equal(metadata.cover_url, "http://127.0.0.1:3889/api/admin/source-videos/V000001/cover");
  assert.equal(cover.cover_url, "http://127.0.0.1:3889/api/admin/source-videos/V000001/cover");
  assert.deepEqual(requests.map((request) => [request.pathname, request.method]), [
    ["/api/admin/source-videos/V000001", "GET"],
    ["/api/admin/source-videos/V000001/queue", "POST"],
    ["/api/admin/source-videos/V000001/retry", "POST"],
    ["/api/admin/source-videos/V000001/recover-processing", "POST"],
    ["/api/admin/source-videos/V000001/publish", "POST"],
    ["/api/admin/source-videos/V000001/metadata", "PATCH"],
    ["/api/admin/source-videos/V000001/cover", "PATCH"]
  ]);
  assert.equal(requests.every((request) => request.token === "admin-session-001"), true);
  assert.deepEqual(requests[5]?.body, {
    title: "新标题",
    tags: ["财务"]
  });
  assert.deepEqual(requests[6]?.body, {
    image_base64: "AAAA",
    content_type: "image/png"
  });
});
