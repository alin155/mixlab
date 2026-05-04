import assert from "node:assert/strict";
import test from "node:test";
import {
  createCutterApiClient,
  formatDuration,
  formatFileSize,
  normalizeApiBaseUrl,
  type CutterApiClient
} from "./api.ts";
import {
  loadCutterWorkbenchData,
  resolveLocalClipUrls,
  resolveSearchResponseUrls
} from "./fixture-client.ts";

function makeJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
}

test("normalizes cutter API base URLs without trailing slash", () => {
  assert.equal(normalizeApiBaseUrl(" http://127.0.0.1:3789/ "), "http://127.0.0.1:3789");
  assert.equal(normalizeApiBaseUrl(""), "");
});

test("loads source library, source detail, and search through cutter API", async () => {
  const requests: string[] = [];
  const client = createCutterApiClient({
    base_url: "http://127.0.0.1:3789/",
    fetch: async (url) => {
      requests.push(String(url));

      if (String(url).endsWith("/cutter/source-library")) {
        return makeJsonResponse({
          schema_version: "1.0",
          data: {
            library_id: "lib_main_001",
            available_video_count: 1,
            videos: [
              {
                source_video_id: "V000001",
                title: "现金流",
                duration_ms: 12_000,
                cover_url: "/cutter/source-videos/V000001/cover",
                media_url: "/cutter/source-videos/V000001/media",
                detail_url: "/cutter/source-videos/V000001",
                subtitles_url: "/cutter/source-videos/V000001/subtitles.srt"
              }
            ]
          }
        });
      }

      if (String(url).endsWith("/cutter/source-videos/V000001")) {
        return makeJsonResponse({
          schema_version: "1.0",
          data: {
            source_video_id: "V000001",
            title: "现金流",
            duration_ms: 12_000,
            media_url: "/cutter/source-videos/V000001/media",
            cover_url: "/cutter/source-videos/V000001/cover",
            transcript: {
              full_text: "现金流，是企业的血液。",
              segments: [
                {
                  segment_id: "V000001-S000001",
                  begin_ms: 1000,
                  end_ms: 3600,
                  text: "现金流，是企业的血液。"
                }
              ]
            },
            keyframes: {
              keyframes_ms: [0, 5000, 10000]
            }
          }
        });
      }

      if (String(url).includes("/cutter/source-search?")) {
        assert.equal(String(url), "http://127.0.0.1:3789/cutter/source-search?query=%E7%8E%B0%E9%87%91%E6%B5%81&limit=7");
        return makeJsonResponse({
          schema_version: "1.0",
          data: {
            query: "现金流",
            normalized_query: "现金流",
            groups: [
              {
                source_video_id: "V000001",
                title: "现金流",
                hit_count: 1,
                best_excerpt: "现金流，是企业的血液。",
                hit_segments: []
              }
            ]
          }
        });
      }

      if (String(url).endsWith("/cutter/local-clips")) {
        return makeJsonResponse({
          schema_version: "1.0",
          data: {
            local_clip_count: 1,
            clips: [
              {
                local_clip_id: "LC000001",
                title: "C0018 00:11-00:35",
                duration_ms: 24_000,
                media_url: "/cutter/local-clips/LC000001/media",
                detail_url: "/cutter/local-clips/LC000001"
              }
            ]
          }
        });
      }

      throw new Error(`unexpected request ${String(url)}`);
    }
  });

  const library = await client.listSourceLibrary();
  const detail = await client.getSourceVideoDetail("V000001");
  const search = await client.searchSourceLibrary("现金流", 7);
  const clips = await client.listLocalClips();

  assert.deepEqual(requests.slice(0, 2), [
    "http://127.0.0.1:3789/cutter/source-library",
    "http://127.0.0.1:3789/cutter/source-videos/V000001"
  ]);
  assert.equal(library.available_video_count, 1);
  assert.equal(library.library_id, "lib_main_001");
  assert.equal(detail.transcript.full_text, "现金流，是企业的血液。");
  assert.equal(search.groups[0]?.source_video_id, "V000001");
  assert.equal(clips.local_clip_count, 1);
  assert.equal(clips.clips[0]?.local_clip_id, "LC000001");
});

test("workbench data resolves Cutter API media URLs before rendering", async () => {
  const client = {
    async listSourceLibrary() {
      return {
        library_id: "lib_main_001",
        available_video_count: 1,
        videos: [
          {
            source_video_id: "V000001",
            title: "现金流",
            duration_ms: 12_000,
            cover_url: "/cutter/source-videos/V000001/cover",
            media_url: "/cutter/source-videos/V000001/media",
            detail_url: "/cutter/source-videos/V000001",
            subtitles_url: "/cutter/source-videos/V000001/subtitles.srt"
          }
        ]
      };
    },
    async getSourceVideoDetail() {
      return {
        source_video_id: "V000001",
        title: "现金流",
        duration_ms: 12_000,
        cover_url: "/cutter/source-videos/V000001/cover",
        media_url: "/cutter/source-videos/V000001/media",
        detail_url: "/cutter/source-videos/V000001",
        subtitles_url: "/cutter/source-videos/V000001/subtitles.srt",
        transcript: {
          full_text: "现金流，是企业的血液。",
          segments: [
            {
              segment_id: "V000001-S000001",
              begin_ms: 1000,
              end_ms: 3600,
              text: "现金流，是企业的血液。"
            }
          ]
        },
        keyframes: {
          keyframes_ms: [0, 5000, 10000]
        }
      };
    },
    async searchSourceLibrary() {
      return {
        query: "现金流",
        normalized_query: "现金流",
        groups: [
          {
            source_video_id: "V000001",
            title: "现金流",
            hit_count: 1,
            best_excerpt: "现金流，是企业的血液。",
            hit_segments: [],
            cover_url: "/cutter/source-videos/V000001/cover",
            media_url: "/cutter/source-videos/V000001/media",
            detail_url: "/cutter/source-videos/V000001",
            subtitles_url: "/cutter/source-videos/V000001/subtitles.srt"
          }
        ]
      };
    },
    async listLocalClips() {
      return {
        local_clip_count: 1,
        clips: [
          {
            local_clip_id: "LC000001",
            title: "现金流片段",
            media_url: "/cutter/local-clips/LC000001/media",
            detail_url: "/cutter/local-clips/LC000001"
          }
        ]
      };
    },
    async getRuntimeStatus() {
      return {
        mode: "api",
        mode_label: "真实 Cutter API 模式",
        api_ready: true,
        generated_at: "2026-05-04T10:00:00.000Z",
        library_id: "lib_main_001",
        library_root_label: "source-library",
        available_video_count: 1,
        workspace_enabled: true,
        workspace_root_label: "cutter-workspace",
        local_clip_count: 1,
        ffmpeg_status: "可用",
        ffmpeg_source: "内置",
        current_user: {
          user_id: "CU000001",
          username: "剪辑师A",
          display_name: "剪辑师A"
        }
      };
    },
    resolveApiUrl(pathOrUrl: string) {
      return pathOrUrl.startsWith("http")
        ? pathOrUrl
        : `http://127.0.0.1:3789${pathOrUrl}`;
    }
  } as Partial<CutterApiClient> as CutterApiClient;

  const data = await loadCutterWorkbenchData(client);

  assert.equal(data.library.videos[0]?.cover_url, "http://127.0.0.1:3789/cutter/source-videos/V000001/cover");
  assert.equal(data.library.videos[0]?.media_url, "http://127.0.0.1:3789/cutter/source-videos/V000001/media");
  assert.equal(data.primaryDetail.cover_url, "http://127.0.0.1:3789/cutter/source-videos/V000001/cover");
  assert.equal(data.primaryDetail.media_url, "http://127.0.0.1:3789/cutter/source-videos/V000001/media");
  assert.equal(data.search.groups[0]?.cover_url, "http://127.0.0.1:3789/cutter/source-videos/V000001/cover");
  assert.equal(data.localClips.clips[0]?.media_url, "http://127.0.0.1:3789/cutter/local-clips/LC000001/media");
});

test("runtime search results resolve media URLs before rendering", () => {
  const client = {
    resolveApiUrl(pathOrUrl: string) {
      return pathOrUrl.startsWith("http")
        ? pathOrUrl
        : `http://127.0.0.1:3789${pathOrUrl}`;
    }
  } as Partial<CutterApiClient> as CutterApiClient;

  const search = resolveSearchResponseUrls(client, {
    query: "现金流",
    normalized_query: "现金流",
    groups: [
      {
        source_video_id: "V000001",
        title: "现金流",
        hit_count: 1,
        best_excerpt: "现金流，是企业的血液。",
        hit_segments: [],
        cover_url: "/cutter/source-videos/V000001/cover",
        media_url: "/cutter/source-videos/V000001/media",
        detail_url: "/cutter/source-videos/V000001",
        subtitles_url: "/cutter/source-videos/V000001/subtitles.srt"
      }
    ]
  });

  assert.equal(search.groups[0]?.cover_url, "http://127.0.0.1:3789/cutter/source-videos/V000001/cover");
  assert.equal(search.groups[0]?.media_url, "http://127.0.0.1:3789/cutter/source-videos/V000001/media");
});

test("runtime local clip refresh resolves media URLs before rendering", () => {
  const client = {
    resolveApiUrl(pathOrUrl: string) {
      return pathOrUrl.startsWith("http")
        ? pathOrUrl
        : `http://127.0.0.1:3789${pathOrUrl}`;
    }
  } as Partial<CutterApiClient> as CutterApiClient;

  const clip = resolveLocalClipUrls(client, {
    local_clip_id: "LC000001",
    title: "现金流片段",
    media_url: "/cutter/local-clips/LC000001/media",
    detail_url: "/cutter/local-clips/LC000001"
  });

  assert.equal(clip.media_url, "http://127.0.0.1:3789/cutter/local-clips/LC000001/media");
  assert.equal(clip.detail_url, "http://127.0.0.1:3789/cutter/local-clips/LC000001");
});

test("workbench data loads preferred source video detail when route carries an id", async () => {
  const detailRequests: string[] = [];
  const client = {
    async listSourceLibrary() {
      return {
        library_id: "lib_main_001",
        available_video_count: 2,
        videos: [
          {
            source_video_id: "V000001",
            title: "现金流",
            duration_ms: 12_000,
            cover_url: "/cutter/source-videos/V000001/cover",
            media_url: "/cutter/source-videos/V000001/media",
            detail_url: "/cutter/source-videos/V000001",
            subtitles_url: "/cutter/source-videos/V000001/subtitles.srt"
          },
          {
            source_video_id: "V000002",
            title: "组织增长",
            duration_ms: 18_000,
            cover_url: "/cutter/source-videos/V000002/cover",
            media_url: "/cutter/source-videos/V000002/media",
            detail_url: "/cutter/source-videos/V000002",
            subtitles_url: "/cutter/source-videos/V000002/subtitles.srt"
          }
        ]
      };
    },
    async getSourceVideoDetail(sourceVideoId: string) {
      detailRequests.push(sourceVideoId);
      return {
        source_video_id: sourceVideoId,
        title: sourceVideoId === "V000002" ? "组织增长" : "现金流",
        duration_ms: sourceVideoId === "V000002" ? 18_000 : 12_000,
        cover_url: `/cutter/source-videos/${sourceVideoId}/cover`,
        media_url: `/cutter/source-videos/${sourceVideoId}/media`,
        detail_url: `/cutter/source-videos/${sourceVideoId}`,
        subtitles_url: `/cutter/source-videos/${sourceVideoId}/subtitles.srt`,
        transcript: {
          full_text: sourceVideoId === "V000002" ? "组织增长来自流程。" : "现金流，是企业的血液。",
          segments: []
        },
        keyframes: {
          keyframes_ms: []
        }
      };
    },
    async searchSourceLibrary() {
      return {
        query: "现金流",
        normalized_query: "现金流",
        groups: []
      };
    },
    async listLocalClips() {
      return {
        local_clip_count: 0,
        clips: []
      };
    },
    async getRuntimeStatus() {
      return {
        mode: "api",
        mode_label: "真实 Cutter API 模式",
        api_ready: true,
        generated_at: "2026-05-04T10:00:00.000Z",
        library_id: "lib_main_001",
        library_root_label: "source-library",
        available_video_count: 2,
        workspace_enabled: true,
        workspace_root_label: "cutter-workspace",
        local_clip_count: 0,
        ffmpeg_status: "可用",
        ffmpeg_source: "内置",
        current_user: {
          user_id: "CU000001",
          username: "剪辑师A",
          display_name: "剪辑师A"
        }
      };
    },
    resolveApiUrl(pathOrUrl: string) {
      return pathOrUrl;
    }
  } as Partial<CutterApiClient> as CutterApiClient;

  const data = await loadCutterWorkbenchData(client, {
    preferredSourceVideoId: "V000002"
  });

  assert.deepEqual(detailRequests, ["V000002"]);
  assert.equal(data.primaryDetail.source_video_id, "V000002");
  assert.equal(data.primaryDetail.title, "组织增长");
});

test("creates local clips through cutter API", async () => {
  const client = createCutterApiClient({
    base_url: "http://127.0.0.1:3789",
    fetch: async (url, init) => {
      assert.equal(String(url), "http://127.0.0.1:3789/cutter/local-clips");
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        source_video_id: "V000001",
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S000002",
        pre_roll_ms: 250,
        post_roll_ms: 400,
        cut_mode: "copy"
      });

      return makeJsonResponse(
        {
          schema_version: "1.0",
          data: {
            local_clip_id: "LC000001",
            title: "C0018 00:00-00:06",
            media_url: "/cutter/local-clips/LC000001/media",
            detail_url: "/cutter/local-clips/LC000001"
          }
        },
        {
          status: 201
        }
      );
    }
  });

  const clip = await client.createLocalClip({
    source_video_id: "V000001",
    start_segment_id: "V000001-S000001",
    end_segment_id: "V000001-S000002",
    pre_roll_ms: 250,
    post_roll_ms: 400,
    cut_mode: "copy"
  });

  assert.equal(clip.local_clip_id, "LC000001");
});

test("creates clip lists and manages workspace cut jobs through cutter API", async () => {
  const requests: Array<{ url: string; method: string | undefined; body: unknown }> = [];
  const client = createCutterApiClient({
    base_url: "http://127.0.0.1:3789/",
    fetch: async (url, init) => {
      requests.push({
        url: String(url),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });

      if (String(url).endsWith("/cutter/clip-lists")) {
        return makeJsonResponse(
          {
            schema_version: "1.0",
            data: {
              schema_version: "1.0",
              clip_list_id: "CL20260502-0001",
              library_id: "lib_main_001",
              title: "现金流清单",
              item_count: 1,
              created_at: "2026-05-02T10:00:00Z",
              updated_at: "2026-05-02T10:00:00Z",
              items: []
            }
          },
          { status: 201 }
        );
      }

      if (String(url).endsWith("/cutter/cut-jobs/run-next")) {
        return makeJsonResponse({
          schema_version: "1.0",
          data: {
            cut_job_id: "CJ20260502-0001",
            clip_list_id: "CL20260502-0001",
            status: "done",
            export_clip_id: "E000001"
          }
        });
      }

      if (String(url).endsWith("/cutter/cut-jobs") && init?.method === "POST") {
        return makeJsonResponse(
          {
            schema_version: "1.0",
            data: {
              submitted_count: 1,
              jobs: [
                {
                  cut_job_id: "CJ20260502-0001",
                  clip_list_id: "CL20260502-0001",
                  status: "pending"
                }
              ]
            }
          },
          { status: 201 }
        );
      }

      if (String(url).endsWith("/cutter/cut-jobs")) {
        return makeJsonResponse({
          schema_version: "1.0",
          data: {
            job_count: 1,
            jobs: [
              {
                cut_job_id: "CJ20260502-0001",
                clip_list_id: "CL20260502-0001",
                status: "done"
              }
            ]
          }
        });
      }

      throw new Error(`unexpected request ${String(url)}`);
    }
  });

  const item = {
    source_video_id: "V000001",
    source_title: "现金流",
    source_relative_path: "source-videos/01_现金流.mp4",
    start_segment_id: "V000001-S000001",
    end_segment_id: "V000001-S000001",
    begin_ms: 1000,
    end_ms: 3600,
    selected_text: "现金流，是企业的血液。",
    cut_mode: "smart" as const
  };

  const clipList = await client.createClipList({
    library_id: "lib_main_001",
    title: "现金流清单",
    items: [item]
  });
  const submission = await client.submitCutJobs({
    clip_list_id: clipList.clip_list_id
  });
  const jobs = await client.listCutJobs();
  const run = await client.runNextCutJob();

  assert.equal(clipList.clip_list_id, "CL20260502-0001");
  assert.equal(submission.submitted_count, 1);
  assert.equal(jobs.jobs[0]?.status, "done");
  assert.equal(run?.export_clip_id, "E000001");
  assert.deepEqual(requests.map((request) => [request.url, request.method]), [
    ["http://127.0.0.1:3789/cutter/clip-lists", "POST"],
    ["http://127.0.0.1:3789/cutter/cut-jobs", "POST"],
    ["http://127.0.0.1:3789/cutter/cut-jobs", undefined],
    ["http://127.0.0.1:3789/cutter/cut-jobs/run-next", "POST"]
  ]);
  assert.deepEqual(requests[0]?.body, {
    library_id: "lib_main_001",
    title: "现金流清单",
    items: [item]
  });
});

test("run-next cut job request keeps cutter auth headers and accepts an empty queue", async () => {
  let observedDevice = "";
  let observedSession = "";
  const client = createCutterApiClient({
    base_url: "http://127.0.0.1:3789",
    auth: {
      device_id: "device-001",
      session_token: "session-001"
    },
    fetch: async (url, init) => {
      assert.equal(String(url), "http://127.0.0.1:3789/cutter/cut-jobs/run-next");
      assert.equal(init?.method, "POST");
      const headers = new Headers(init?.headers);
      observedDevice = headers.get("X-MixLab-Device-Id") ?? "";
      observedSession = headers.get("X-MixLab-Session-Token") ?? "";
      return makeJsonResponse({ schema_version: "1.0", data: null });
    }
  });

  assert.equal(await client.runNextCutJob(), null);
  assert.equal(observedDevice, "device-001");
  assert.equal(observedSession, "session-001");
});

test("retry cut job request keeps cutter auth headers", async () => {
  let observedDevice = "";
  let observedSession = "";
  const client = createCutterApiClient({
    base_url: "http://127.0.0.1:3789",
    auth: {
      device_id: "device-001",
      session_token: "session-001"
    },
    fetch: async (url, init) => {
      assert.equal(String(url), "http://127.0.0.1:3789/cutter/cut-jobs/CJ20260504-0001/retry");
      assert.equal(init?.method, "POST");
      const headers = new Headers(init?.headers);
      observedDevice = headers.get("X-MixLab-Device-Id") ?? "";
      observedSession = headers.get("X-MixLab-Session-Token") ?? "";
      return makeJsonResponse({
        schema_version: "1.0",
        data: {
          cut_job_id: "CJ20260504-0001",
          clip_list_id: "CL20260504-0001",
          status: "pending"
        }
      });
    }
  });

  const retried = await client.retryCutJob("CJ20260504-0001");

  assert.equal(retried.status, "pending");
  assert.equal(observedDevice, "device-001");
  assert.equal(observedSession, "session-001");
});

test("loads cutter runtime status with approved session headers", async () => {
  let observedDevice = "";
  let observedSession = "";
  const client = createCutterApiClient({
    base_url: "http://127.0.0.1:3789",
    auth: {
      device_id: "device-001",
      session_token: "session-001"
    },
    fetch: async (url, init) => {
      assert.equal(String(url), "http://127.0.0.1:3789/cutter/runtime-status");
      const headers = new Headers(init?.headers);
      observedDevice = headers.get("X-MixLab-Device-Id") ?? "";
      observedSession = headers.get("X-MixLab-Session-Token") ?? "";
      return makeJsonResponse({
        schema_version: "1.0",
        data: {
          mode: "api",
          mode_label: "真实 Cutter API 模式",
          api_ready: true,
          generated_at: "2026-05-04T10:00:00.000Z",
          library_id: "lib_main_001",
          library_root_label: "source-library",
          available_video_count: 1,
          workspace_enabled: true,
          workspace_root_label: "cutter-workspace",
          local_clip_count: 1,
          ffmpeg_status: "可用",
          ffmpeg_source: "内置",
          current_user: {
            user_id: "CU000001",
            username: "剪辑师A",
            display_name: "剪辑师A"
          }
        }
      });
    }
  });

  const status = await client.getRuntimeStatus();

  assert.equal(status.mode_label, "真实 Cutter API 模式");
  assert.equal(status.current_user.username, "剪辑师A");
  assert.equal(observedDevice, "device-001");
  assert.equal(observedSession, "session-001");
});

test("supports cutter login requests and backend-shaped login status", async () => {
  const requests: Array<{ url: string; method: string | undefined; headers: Headers; body: unknown }> = [];
  const client = createCutterApiClient({
    base_url: "http://127.0.0.1:3789/",
    auth: {
      device_id: "device-001",
      session_token: "session-001"
    },
    fetch: async (url, init) => {
      requests.push({
        url: String(url),
        method: init?.method,
        headers: new Headers(init?.headers),
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });

      if (String(url).endsWith("/cutter/auth/request-login")) {
        return makeJsonResponse(
          {
            schema_version: "1.0",
            data: {
              user: {
                user_id: "CU000001",
                username: "小王",
                display_name: "小王",
                status: "approved",
                applied_at: "2026-05-03T08:00:00Z",
                approved_at: "2026-05-03T08:05:00Z",
                rejected_at: "",
                disabled_at: "",
                last_login_at: "2026-05-03T08:05:00Z",
                last_used_at: "",
                note: "",
                devices: [
                  {
                    device_id: "device-001",
                    device_name: "MacBook Pro",
                    status: "active",
                    first_seen_at: "2026-05-03T08:00:00Z",
                    last_login_at: "2026-05-03T08:05:00Z"
                  }
                ]
              },
              session: {
                user_id: "CU000001",
                device_id: "device-001",
                session_token: "session-001",
                created_at: "2026-05-03T08:05:00Z",
                last_seen_at: "2026-05-03T08:06:00Z"
              }
            }
          },
          { status: 200 }
        );
      }

      if (String(url).endsWith("/cutter/auth/status")) {
        return makeJsonResponse({
          schema_version: "1.0",
          data: {
            ok: true,
            user: {
              user_id: "CU000001",
              username: "xiaowang",
              display_name: "小王",
              status: "approved",
              applied_at: "2026-05-03T08:00:00Z",
              approved_at: "2026-05-03T08:05:00Z",
              rejected_at: "",
              disabled_at: "",
              last_login_at: "2026-05-03T08:05:00Z",
              last_used_at: "",
              note: "",
              devices: [
                {
                  device_id: "device-001",
                  device_name: "MacBook Pro",
                  status: "active",
                  first_seen_at: "2026-05-03T08:00:00Z",
                  last_login_at: "2026-05-03T08:05:00Z"
                }
              ]
            }
          }
        });
      }

      throw new Error(`unexpected request ${String(url)}`);
    }
  });

  const application = await client.requestLogin({
    username: "小王",
    device_id: "device-001",
    device_name: "MacBook Pro"
  });
  const status = await client.getLoginStatus();

  assert.equal(application.user.status, "approved");
  assert.equal(application.user.user_id, "CU000001");
  assert.equal(application.user.devices[0]?.device_id, "device-001");
  assert.equal(application.session?.session_token, "session-001");
  assert.equal(status.ok, true);
  assert.equal(status.user?.status, "approved");
  assert.equal(status.user?.devices[0]?.device_id, "device-001");
  assert.equal("recordUsageEvent" in client, false);
  assert.deepEqual(requests.map((request) => [request.url, request.method]), [
    ["http://127.0.0.1:3789/cutter/auth/request-login", "POST"],
    ["http://127.0.0.1:3789/cutter/auth/status", undefined]
  ]);
  assert.deepEqual(requests[0]?.body, {
    username: "小王",
    device_id: "device-001",
    device_name: "MacBook Pro"
  });
  assert.equal(requests[0]?.headers.get("x-mixlab-device-id"), null);
  assert.equal(requests[1]?.headers.get("x-mixlab-device-id"), "device-001");
  assert.equal(requests[1]?.headers.get("x-mixlab-session-token"), "session-001");
});

test("attaches cutter auth headers to protected data and control requests", async () => {
  const requests: Array<{ url: string; method: string | undefined; headers: Headers }> = [];
  const client = createCutterApiClient({
    base_url: "http://127.0.0.1:3789",
    auth: {
      device_id: "device-001",
      session_token: "session-001"
    },
    fetch: async (url, init) => {
      requests.push({
        url: String(url),
        method: init?.method,
        headers: new Headers(init?.headers)
      });

      if (String(url).endsWith("/cutter/source-library")) {
        return makeJsonResponse({
          schema_version: "1.0",
          data: { available_video_count: 0, videos: [] }
        });
      }

      if (String(url).endsWith("/cutter/source-videos/V000001")) {
        return makeJsonResponse({
          schema_version: "1.0",
          data: {
            source_video_id: "V000001",
            title: "现金流",
            duration_ms: 12_000,
            media_url: "/media",
            cover_url: "/cover",
            detail_url: "/detail",
            subtitles_url: "/subtitles",
            transcript: { full_text: "", segments: [] },
            keyframes: { keyframes_ms: [] }
          }
        });
      }

      if (String(url).includes("/cutter/source-search?")) {
        return makeJsonResponse({
          schema_version: "1.0",
          data: { query: "现金流", normalized_query: "现金流", groups: [] }
        });
      }

      if (String(url).endsWith("/cutter/local-clips") && init?.method === "POST") {
        return makeJsonResponse({
          schema_version: "1.0",
          data: {
            local_clip_id: "LC000001",
            title: "片段",
            media_url: "/media",
            detail_url: "/detail"
          }
        });
      }

      if (String(url).endsWith("/cutter/local-clips/LC000001")) {
        return makeJsonResponse({
          schema_version: "1.0",
          data: {
            local_clip_id: "LC000001",
            title: "片段",
            media_url: "/media",
            detail_url: "/detail"
          }
        });
      }

      if (String(url).endsWith("/cutter/local-clips")) {
        return makeJsonResponse({
          schema_version: "1.0",
          data: { local_clip_count: 0, clips: [] }
        });
      }

      if (String(url).endsWith("/cutter/clip-lists")) {
        return makeJsonResponse({
          schema_version: "1.0",
          data: {
            schema_version: "1.0",
            clip_list_id: "CL000001",
            library_id: "lib_main_001",
            title: "清单",
            item_count: 0,
            created_at: "2026-05-03T08:00:00Z",
            updated_at: "2026-05-03T08:00:00Z",
            items: []
          }
        });
      }

      if (String(url).endsWith("/cutter/cut-jobs/run-next")) {
        return makeJsonResponse({ schema_version: "1.0", data: null });
      }

      if (String(url).endsWith("/cutter/cut-jobs") && init?.method === "POST") {
        return makeJsonResponse({
          schema_version: "1.0",
          data: { submitted_count: 0, jobs: [] }
        });
      }

      if (String(url).endsWith("/cutter/cut-jobs")) {
        return makeJsonResponse({
          schema_version: "1.0",
          data: { job_count: 0, jobs: [] }
        });
      }

      throw new Error(`unexpected request ${String(url)}`);
    }
  });

  await client.listSourceLibrary();
  await client.getSourceVideoDetail("V000001");
  await client.searchSourceLibrary("现金流");
  await client.listLocalClips();
  await client.getLocalClipDetail("LC000001");
  await client.createLocalClip({
    source_video_id: "V000001",
    start_segment_id: "S001",
    end_segment_id: "S002"
  });
  await client.createClipList({ library_id: "lib_main_001", title: "清单", items: [] });
  await client.submitCutJobs({ clip_list_id: "CL000001" });
  await client.listCutJobs();
  await client.runNextCutJob();

  for (const request of requests) {
    assert.equal(request.headers.get("x-mixlab-device-id"), "device-001", request.url);
    assert.equal(request.headers.get("x-mixlab-session-token"), "session-001", request.url);
  }

  for (const request of requests.filter((request) => request.method === "POST" && !request.url.endsWith("/run-next"))) {
    assert.equal(request.headers.get("content-type"), "application/json", request.url);
  }
});

test("throws readable API errors", async () => {
  const client = createCutterApiClient({
    base_url: "",
    fetch: async () =>
      makeJsonResponse(
        {
          error: {
            code: "source_video_not_found",
            message: "Source video not found"
          }
        },
        {
          status: 404
        }
      )
  });

  await assert.rejects(() => client.getSourceVideoDetail("V000404"), {
    name: "CutterApiError",
    message: "Source video not found"
  });
});

test("formats durations and file sizes for dense media cards", () => {
  assert.equal(formatDuration(65_432), "01:05");
  assert.equal(formatDuration(3_726_000), "1:02:06");
  assert.equal(formatFileSize(495_019_386), "472.1 MB");
});
