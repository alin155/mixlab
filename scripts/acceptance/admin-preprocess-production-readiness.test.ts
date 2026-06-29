import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminPreprocessProductionReadinessReport,
  buildPreprocessReadinessProbeDefinitions,
  runAdminPreprocessProductionReadiness,
  type PreprocessReadinessProbeResult
} from "./admin-preprocess-production-readiness.ts";

const BASE_URL = "http://192.168.1.27:18080";

function probe(input: {
  name: PreprocessReadinessProbeResult["name"];
  path: string;
  data?: unknown;
  ok?: boolean;
  status?: number | null;
  error_code?: string;
  message?: string;
}): PreprocessReadinessProbeResult {
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

function workerProof() {
  return {
    schema_version: "1.0",
    mode: "admin-worker-env-proof",
    proof_accepted: true,
    observations: {
      image: "ghcr.io/alin155/mixlab-admin-runtime:5a50922bc82f1b6728f247ed33e5885ab8cf6bef"
    },
    result: {
      status: "accepted"
    }
  };
}

function windowsAcceptance() {
  return {
    schema_version: "1.0",
    suite: "windows_acceptance",
    status: "passed",
    runner_version: "0.1.32",
    app_runtime_smoke: {
      checks: [
        {
          id: "runtime_status",
          body: {
            data: {
              available_video_count: 10471,
              release_cache: {
                active_release_version: "v010471",
                ready_video_count: 10471
              },
              search_backend: {
                index_version: "v010471"
              }
            }
          }
        }
      ]
    }
  };
}

function successfulRequests(
  overrides: Partial<Record<PreprocessReadinessProbeResult["name"], PreprocessReadinessProbeResult>> = {}
): PreprocessReadinessProbeResult[] {
  const requests: PreprocessReadinessProbeResult[] = [
    probe({
      name: "admin_web_root",
      path: "/"
    }),
    probe({
      name: "health",
      path: "/health",
      data: {
        status: "healthy"
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
        video_count: 11394,
        ready_video_count: 10471,
        queued_video_count: 904,
        processing_video_count: 0,
        index_required_video_count: 19,
        current_index_version: "v010471"
      }
    }),
    probe({
      name: "release_gates",
      path: "/api/admin/release-gates",
      data: {
        overall_status: "attention",
        release_allowed: false,
        gates: [
          { code: "preprocess-disk", status: "pass" },
          { code: "current-index", status: "pass" }
        ]
      }
    }),
    probe({
      name: "data_loading_plan",
      path: "/api/admin/data-loading/plan",
      data: {
        strategy: "shell-first-route-owned-v1",
        hidden_full_scan_allowed: false
      }
    }),
    probe({
      name: "preprocess_safety",
      path: "/api/admin/preprocess/safety",
      data: {
        status: "healthy",
        safe_to_start: true,
        disk: {
          status: "healthy",
          usage_percent: 68,
          block_usage_percent: 92
        },
        processing: {
          processing_count: 0,
          source_video_ids: []
        },
        blockers: []
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
        job_count: 20,
        status_counts: {
          queued: 20
        }
      }
    }),
    probe({
      name: "source_videos_processing",
      path: "/api/admin/source-videos?status=processing&limit=20",
      data: {
        returned_count: 0,
        source_video_ids: []
      }
    }),
    probe({
      name: "source_videos_queued",
      path: "/api/admin/source-videos?status=queued&limit=1",
      data: {
        returned_count: 1,
        source_video_ids: ["V010472"]
      }
    }),
    probe({
      name: "source_videos_index_required",
      path: "/api/admin/source-videos?status=index-required&limit=1",
      data: {
        returned_count: 1,
        source_video_ids: ["V010471"]
      }
    }),
    probe({
      name: "runtime_settings",
      path: "/api/admin/settings/runtime",
      data: {
        ffmpeg: {
          available: true
        },
        ffprobe: {
          available: true
        },
        asr: {
          dashscope_api_key_configured: true
        }
      }
    })
  ];

  return requests.map((request) => overrides[request.name] ?? request);
}

function report(input: {
  base_url?: string;
  session_token_present?: boolean;
  requests?: PreprocessReadinessProbeResult[];
  worker_env_proof_report_path?: string;
  worker_env_proof_report?: unknown;
  cutter_windows_acceptance_report_path?: string;
  cutter_windows_acceptance_report?: unknown;
} = {}) {
  return buildAdminPreprocessProductionReadinessReport({
    generated_at: "2026-06-29T00:00:00.000Z",
    command: "test",
    base_url: input.base_url ?? BASE_URL,
    expected_library_root: "/data/PublicLibrary",
    expected_ready_count: 10471,
    expected_index_version: "v010471",
    session_token_present: input.session_token_present ?? true,
    requests: input.requests ?? successfulRequests(),
    worker_env_proof_report_path: input.worker_env_proof_report_path ?? "worker-proof.json",
    worker_env_proof_report: input.worker_env_proof_report ?? workerProof(),
    cutter_windows_acceptance_report_path: input.cutter_windows_acceptance_report_path ?? "windows-acceptance/report.json",
    cutter_windows_acceptance_report: input.cutter_windows_acceptance_report ?? windowsAcceptance()
  });
}

test("preprocess production readiness probes are GET-only and avoid command endpoints", () => {
  const definitions = buildPreprocessReadinessProbeDefinitions();

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
      "GET /api/admin/preprocess/safety",
      "GET /api/admin/preprocess/supervisor/status",
      "GET /api/admin/preprocess/jobs?limit=20",
      "GET /api/admin/source-videos?status=processing&limit=20",
      "GET /api/admin/source-videos?status=queued&limit=1",
      "GET /api/admin/source-videos?status=index-required&limit=1",
      "GET /api/admin/settings/runtime"
    ]
  );
});

test("preprocess production readiness becomes ready for single-video review when Phase 0/1 gates pass", () => {
  const built = report();

  assert.equal(built.result.status, "ready-for-single-video-review");
  assert.equal(built.phase_0_1_readiness_ready, true);
  assert.equal(built.single_video_smoke_review_ready, true);
  assert.equal(built.single_video_smoke_allowed, false);
  assert.equal(built.production_batch_allowed, false);
  assert.equal(built.preprocess_execution_allowed, false);
  assert.equal(built.worker_start_allowed, false);
  assert.equal(built.mutates_nas_files, false);
  assert.deepEqual(built.summary.phase_0_1_blockers, []);
  assert.ok(built.summary.single_video_smoke_blockers.includes("pre-smoke-snapshot-required"));
  assert.equal(built.observed.ready_video_count, 10471);
  assert.equal(built.observed.queued_video_count, 904);
  assert.equal(built.observed.cutter_visible_ready_count, 10471);
});

test("preprocess production readiness fails if ready/index baseline drifts", () => {
  const built = report({
    requests: successfulRequests({
      library_status: probe({
        name: "library_status",
        path: "/api/admin/library/status",
        data: {
          root_path: "/data/PublicLibrary",
          video_count: 11394,
          ready_video_count: 10470,
          queued_video_count: 904,
          processing_video_count: 0,
          index_required_video_count: 19,
          current_index_version: "v010470"
        }
      })
    })
  });

  assert.equal(built.result.status, "failed");
  assert.equal(built.phase_0_1_readiness_ready, false);
  assert.ok(built.summary.phase_0_1_blockers.includes("ready-index-baseline-preserved"));
  assert.equal(
    built.gates.find((item) => item.id === "ready-index-baseline-preserved")?.status,
    "fail"
  );
});

test("preprocess production readiness blocks active processing before smoke", () => {
  const built = report({
    requests: successfulRequests({
      library_status: probe({
        name: "library_status",
        path: "/api/admin/library/status",
        data: {
          root_path: "/data/PublicLibrary",
          video_count: 11394,
          ready_video_count: 10471,
          queued_video_count: 903,
          processing_video_count: 1,
          index_required_video_count: 19,
          current_index_version: "v010471"
        }
      }),
      source_videos_processing: probe({
        name: "source_videos_processing",
        path: "/api/admin/source-videos?status=processing&limit=20",
        data: {
          returned_count: 1,
          source_video_ids: ["V001440"]
        }
      })
    })
  });

  assert.equal(built.result.status, "blocked");
  assert.equal(built.phase_0_1_readiness_ready, false);
  assert.ok(built.summary.phase_0_1_blockers.includes("no-active-processing-before-smoke"));
});

test("preprocess production readiness writes artifacts without leaking session tokens", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-preprocess-readiness-"));
  const workerPath = path.join(tempDir, "worker-proof.json");
  const windowsPath = path.join(tempDir, "windows-acceptance.json");
  await writeFile(workerPath, `${JSON.stringify(workerProof())}\n`, "utf8");
  await writeFile(windowsPath, `${JSON.stringify(windowsAcceptance())}\n`, "utf8");
  const rawByPath = new Map<string, unknown>([
    ["/api/admin/auth/status", { auth_mode: "password", authenticated: true }],
    ["/api/admin/library/status", {
      root_path: "/data/PublicLibrary",
      video_count: 11394,
      ready_video_count: 10471,
      queued_video_count: 904,
      processing_video_count: 0,
      index_required_video_count: 19,
      current_index_version: "v010471"
    }],
    ["/api/admin/release-gates", { overall_status: "attention", release_allowed: false, gates: [] }],
    ["/api/admin/data-loading/plan", { strategy: "shell-first-route-owned-v1", hidden_full_scan_allowed: false }],
    ["/api/admin/preprocess/safety", {
      status: "healthy",
      safe_to_start: true,
      disk: { status: "healthy", usage_percent: 68, block_usage_percent: 92 },
      processing: { processing_count: 0, source_video_ids: [] },
      blockers: []
    }],
    ["/api/admin/preprocess/supervisor/status", { state: "idle" }],
    ["/api/admin/preprocess/jobs?limit=20", { jobs: [{ preprocess_status: "queued" }] }],
    ["/api/admin/source-videos?status=processing&limit=20", []],
    ["/api/admin/source-videos?status=queued&limit=1", [{ source_video_id: "V010472", preprocess_status: "queued" }]],
    ["/api/admin/source-videos?status=index-required&limit=1", [{ source_video_id: "V010471", preprocess_status: "index-required" }]],
    ["/api/admin/settings/runtime", {
      ffmpeg: { available: true },
      ffprobe: { available: true },
      asr: { dashscope_api_key_configured: true }
    }],
    ["/health", { status: "healthy" }]
  ]);
  const seen: Array<{ path: string; token: string }> = [];
  const fakeFetch: typeof fetch = async (resource, init) => {
    const url = new URL(String(resource));
    const headers = new Headers(init?.headers);
    const requestPath = `${url.pathname}${url.search}`;
    seen.push({
      path: requestPath,
      token: headers.get("X-MixLab-Admin-Session-Token") ?? ""
    });

    if (url.pathname === "/") {
      return new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" }
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      data: rawByPath.get(requestPath) ?? {}
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const built = await runAdminPreprocessProductionReadiness({
      base_url: BASE_URL,
      session_token: "fixture-admin-session-token",
      worker_env_proof_report_path: workerPath,
      cutter_windows_acceptance_report_path: windowsPath,
      output_dir: tempDir,
      date: new Date("2026-06-29T00:00:00.000Z"),
      fetch_impl: fakeFetch
    });
    const json = await readFile(built.artifacts?.json_path ?? "", "utf8");
    const markdown = await readFile(built.artifacts?.markdown_path ?? "", "utf8");

    assert.equal(built.result.status, "ready-for-single-video-review");
    assert.ok(seen.some((item) => item.path === "/api/admin/settings/runtime" && item.token === "fixture-admin-session-token"));
    assert.doesNotMatch(json, /fixture-admin-session-token/);
    assert.doesNotMatch(markdown, /fixture-admin-session-token/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
