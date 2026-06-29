import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerPostReleaseSmokeReport,
  buildPostReleaseSmokeProbeDefinitions,
  runAdminDockerPostReleaseSmoke,
  type PostReleaseSmokeProbeResult
} from "./admin-docker-post-release-smoke.ts";

const TARGET = "9c015b9105e97954240020781f79daae3f954bde";
const BASE_URL = "http://192.168.1.27:8080";

function probe(input: {
  name: PostReleaseSmokeProbeResult["name"];
  path: string;
  data?: unknown;
  ok?: boolean;
  status?: number | null;
  error_code?: string;
  message?: string;
}): PostReleaseSmokeProbeResult {
  return {
    name: input.name,
    method: "GET",
    path: input.path,
    duration_ms: 10,
    http_status: input.status === undefined ? input.ok === false ? 401 : 200 : input.status,
    ok: input.ok !== false,
    api_ok: input.ok === false ? false : true,
    response_bytes: 256,
    content_type: input.name === "admin_web_root" ? "text/html" : "application/json",
    data: input.data ?? null,
    error_code: input.error_code,
    message: input.message
  };
}

function successfulRequests(overrides: Partial<Record<PostReleaseSmokeProbeResult["name"], PostReleaseSmokeProbeResult>> = {}): PostReleaseSmokeProbeResult[] {
  const requests: PostReleaseSmokeProbeResult[] = [
    probe({
      name: "admin_web_root",
      path: "/"
    }),
    probe({
      name: "health",
      path: "/health",
      data: {
        ok: true,
        service: "admin-api",
        build: {
          sha: TARGET,
          version: "2026.06.29",
          image_tag: `ghcr.io/alin155/mixlab-admin-api:${TARGET}`
        },
        runtime: {
          library_root: "/data/PublicLibrary",
          path_profile: "docker"
        }
      }
    }),
    probe({
      name: "auth_status",
      path: "/api/admin/auth/status",
      data: {
        auth_mode: "password",
        authenticated: true,
        user_present: true
      }
    }),
    probe({
      name: "library_status",
      path: "/api/admin/library/status",
      data: {
        root_path: "/data/PublicLibrary",
        current_index_version: "v010471",
        video_count: 11394,
        ready_video_count: 10471
      }
    }),
    probe({
      name: "release_gates",
      path: "/api/admin/release-gates",
      data: {
        overall_status: "pass",
        release_allowed: true,
        docker_upload_allowed: false,
        build: {
          sha: TARGET,
          version: "2026.06.29",
          image_tag: `ghcr.io/alin155/mixlab-admin-api:${TARGET}`
        },
        gates: [
          { code: "build-version-health", status: "pass" },
          { code: "preprocess-disk", status: "pass" }
        ]
      }
    }),
    probe({
      name: "data_loading_plan",
      path: "/api/admin/data-loading/plan",
      data: {
        strategy: "shell-first-route-owned-v1"
      }
    }),
    probe({
      name: "cutter_users",
      path: "/api/admin/cutter-users",
      data: {
        user_count: 2,
        status_counts: {
          approved: 1,
          pending: 1
        }
      }
    }),
    probe({
      name: "preprocess_safety",
      path: "/api/admin/preprocess/safety",
      data: {
        status: "healthy"
      }
    }),
    probe({
      name: "preprocess_supervisor_status",
      path: "/api/admin/preprocess/supervisor/status",
      data: {
        state: "idle"
      }
    }),
    probe({
      name: "preprocess_jobs",
      path: "/api/admin/preprocess/jobs?limit=20",
      data: {
        job_count: 3,
        status_counts: {
          queued: 2,
          failed: 1
        }
      }
    })
  ];

  return requests.map((request) => overrides[request.name] ?? request);
}

function report(input: {
  base_url?: string;
  session_token_present?: boolean;
  expected_target_image_tag?: string;
  requests?: PostReleaseSmokeProbeResult[];
} = {}) {
  return buildAdminDockerPostReleaseSmokeReport({
    generated_at: "2026-06-29T00:00:00.000Z",
    command: "test",
    base_url: input.base_url ?? BASE_URL,
    expected_library_root: "/data/PublicLibrary",
    expected_ready_count: 10471,
    expected_index_version: "v010471",
    expected_target_image_tag: input.expected_target_image_tag ?? TARGET,
    session_token_present: input.session_token_present ?? true,
    requests: input.requests ?? successfulRequests()
  });
}

test("post-release smoke probe definitions are GET-only and avoid command endpoints", () => {
  const definitions = buildPostReleaseSmokeProbeDefinitions();

  assert.equal(definitions.every((item) => item.method === "GET"), true);
  assert.doesNotMatch(
    definitions.map((item) => item.path).join("\n"),
    /\/(?:scan|apply|publish|repair|queue|retry|recover|start|stop|cancel)(?:\/|$|\?)/
  );
  assert.deepEqual(
    definitions.map((item) => `${item.method} ${item.path}`),
    [
      "GET /",
      "GET /health",
      "GET /api/admin/auth/status",
      "GET /api/admin/library/status",
      "GET /api/admin/release-gates",
      "GET /api/admin/data-loading/plan",
      "GET /api/admin/cutter-users",
      "GET /api/admin/preprocess/safety",
      "GET /api/admin/preprocess/supervisor/status",
      "GET /api/admin/preprocess/jobs?limit=20"
    ]
  );
});

test("post-release smoke is ready when final URL, session, target image, and invariants pass", () => {
  const built = report();

  assert.equal(built.post_release_smoke_ready, true);
  assert.equal(built.result.status, "ready");
  assert.deepEqual(built.summary.mvp_completion_blockers, []);
  assert.equal(built.image_push_allowed, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.preprocess_execution_allowed, false);
  assert.equal(built.mutates_nas_files, false);
  assert.equal(built.observed.ready_video_count, 10471);
  assert.equal(built.observed.current_index_version, "v010471");
});

test("post-release smoke blocks missing session proof without approving MVP completion", () => {
  const built = report({
    session_token_present: false,
    requests: successfulRequests({
      auth_status: probe({
        name: "auth_status",
        path: "/api/admin/auth/status",
        data: {
          auth_mode: "password",
          authenticated: false,
          user_present: false
        }
      })
    })
  });

  assert.equal(built.post_release_smoke_ready, false);
  assert.equal(built.result.status, "blocked");
  assert.ok(built.summary.mvp_completion_blockers.includes("admin-session-proven"));
  assert.equal(built.gates.find((item) => item.id === "admin-session-proven")?.status, "blocked");
});

test("post-release smoke treats missing final URL as blocked instead of failed", () => {
  const built = report({
    base_url: "",
    session_token_present: false,
    expected_target_image_tag: "",
    requests: []
  });

  assert.equal(built.post_release_smoke_ready, false);
  assert.equal(built.result.status, "blocked");
  assert.equal(built.summary.failed, 0);
  assert.ok(built.summary.mvp_completion_blockers.includes("final-admin-target"));
  assert.ok(built.summary.mvp_completion_blockers.includes("final-url-required-requests"));
  assert.equal(built.gates.find((item) => item.id === "final-url-required-requests")?.status, "blocked");
});

test("post-release smoke fails unsafe targets and invariant drift", () => {
  const built = report({
    base_url: "http://127.0.0.1:5176",
    requests: successfulRequests({
      library_status: probe({
        name: "library_status",
        path: "/api/admin/library/status",
        data: {
          root_path: "/data/PublicLibrary",
          current_index_version: "v010470",
          video_count: 11394,
          ready_video_count: 10470
        }
      })
    })
  });

  assert.equal(built.result.status, "failed");
  assert.ok(built.summary.mvp_completion_blockers.includes("final-admin-target"));
  assert.ok(built.summary.mvp_completion_blockers.includes("public-library-invariants"));
  assert.equal(built.gates.find((item) => item.id === "final-admin-target")?.status, "fail");
  assert.equal(built.gates.find((item) => item.id === "public-library-invariants")?.status, "fail");
});

test("post-release smoke writes artifacts without leaking session tokens", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-post-release-smoke-"));
  const seen: Array<{ path: string; token: string }> = [];
  const fakeFetch: typeof fetch = async (resource, init) => {
    const url = new URL(String(resource));
    const headers = new Headers(init?.headers);
    seen.push({
      path: `${url.pathname}${url.search}`,
      token: headers.get("X-MixLab-Admin-Session-Token") ?? ""
    });

    if (url.pathname === "/") {
      return new Response("<html></html>", {
        status: 200,
        headers: {
          "content-type": "text/html"
        }
      });
    }

    const request = successfulRequests().find((item) => item.path === `${url.pathname}${url.search}`);
    return new Response(JSON.stringify({
      ok: true,
      data: request?.data ?? {}
    }), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    });
  };

  try {
    const built = await runAdminDockerPostReleaseSmoke({
      base_url: BASE_URL,
      expected_target_image_tag: TARGET,
      session_token: "secret-admin-session-token",
      output_dir: tempDir,
      date: new Date("2026-06-29T00:00:00.000Z"),
      fetch_impl: fakeFetch
    });
    const json = await readFile(built.artifacts?.json_path ?? "", "utf8");
    const markdown = await readFile(built.artifacts?.markdown_path ?? "", "utf8");

    assert.equal(built.result.status, "ready");
    assert.ok(seen.some((item) => item.path === "/api/admin/cutter-users" && item.token === "secret-admin-session-token"));
    assert.doesNotMatch(json, /secret-admin-session-token/);
    assert.doesNotMatch(markdown, /secret-admin-session-token/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
