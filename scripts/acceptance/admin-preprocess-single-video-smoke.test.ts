import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  runAdminPreprocessSingleVideoSmoke,
  waitForSingleVideoSmokePostFiles
} from "./admin-preprocess-single-video-smoke.ts";

const BASE_URL = "http://192.168.1.27:18080";
const SOURCE_VIDEO_ID = "V006190";

function libraryStatus(input: {
  ready_video_count?: number;
  queued_video_count?: number;
  processing_video_count?: number;
  index_required_video_count?: number;
  current_index_version?: string;
} = {}) {
  return {
    root_path: "/data/PublicLibrary",
    video_count: 11394,
    ready_video_count: input.ready_video_count ?? 10471,
    queued_video_count: input.queued_video_count ?? 904,
    processing_video_count: input.processing_video_count ?? 0,
    index_required_video_count: input.index_required_video_count ?? 19,
    current_index_version: input.current_index_version ?? "v010471"
  };
}

function sourceDetail(input: {
  status?: string;
  visible?: boolean;
} = {}) {
  const status = input.status ?? "queued";
  const visible = input.visible ?? false;
  return {
    source_video: {
      source_video_id: SOURCE_VIDEO_ID,
      title: "0Q9A2832",
      relative_path: "陶矜2/2024年素材/2403上海花絮/100CANON/0Q9A2832.MP4",
      file_size: 20000620,
      preprocess_status: status,
      visible_to_cutters: visible
    },
    technical: {
      duration_ms: 0,
      width: 0,
      height: 0,
      fps: 0,
      codec: "",
      file_size: 20000620,
      relative_path: "陶矜2/2024年素材/2403上海花絮/100CANON/0Q9A2832.MP4"
    },
    visibility: {
      visible_to_cutters: visible
    },
    preprocess: {
      status,
      job_id: "J006190",
      stage: status,
      attempt: 3,
      started_at: "",
      completed_at: "",
      failed_at: "",
      error_stage: "",
      error_message: ""
    },
    artifacts: {
      transcript: { exists: false },
      subtitles: { exists: false },
      cover: { exists: false },
      keyframes: { exists: false },
      index_version: ""
    },
    transcript: {
      full_text: "should not be written in full",
      segment_count: 0,
      character_count: 0
    }
  };
}

function readinessReport() {
  return {
    schema_version: "1.0",
    mode: "admin-preprocess-production-readiness",
    phase_0_1_readiness_ready: true,
    single_video_smoke_review_ready: true,
    observed: {
      ready_video_count: 10471,
      current_index_version: "v010471"
    },
    result: {
      status: "ready-for-single-video-review"
    }
  };
}

async function createFixtureFiles(tempDir: string) {
  const mountRoot = path.join(tempDir, "PublicLibrary");
  await writeFile(
    path.join(tempDir, "readiness.json"),
    `${JSON.stringify(readinessReport())}\n`,
    "utf8"
  );
  await mkdir(path.join(mountRoot, ".mixlab-library"), { recursive: true });
  await writeFile(
    path.join(mountRoot, ".mixlab-library", "library.json"),
    `${JSON.stringify(libraryStatus())}\n`,
    "utf8"
  );
  await mkdir(path.join(mountRoot, ".mixlab-library", "videos", SOURCE_VIDEO_ID), { recursive: true });
  await mkdir(path.join(mountRoot, ".mixlab-library", "logs"), { recursive: true });
  await mkdir(path.join(mountRoot, ".mixlab-library", "admin-read-model"), { recursive: true });
  await writeFile(
    path.join(mountRoot, ".mixlab-library", "videos", SOURCE_VIDEO_ID, "source-video.json"),
    `${JSON.stringify({
      source_video_id: SOURCE_VIDEO_ID,
      preprocess_status: "queued",
      visible_to_cutters: false
    })}\n`,
    "utf8"
  );
  await writeFile(
    path.join(mountRoot, ".mixlab-library", "videos", SOURCE_VIDEO_ID, "preprocess-job.json"),
    `${JSON.stringify({ source_video_id: SOURCE_VIDEO_ID, status: "queued" })}\n`,
    "utf8"
  );
  await writeFile(
    path.join(mountRoot, ".mixlab-library", "logs", `${SOURCE_VIDEO_ID}.log`),
    "queued\n",
    "utf8"
  );
  await writeFile(
    path.join(mountRoot, ".mixlab-library", "admin-read-model", "admin.sqlite"),
    "sqlite fixture",
    "utf8"
  );

  return {
    mountRoot,
    readinessPath: path.join(tempDir, "readiness.json")
  };
}

async function writePostExecuteFixtureFiles(mountRoot: string): Promise<void> {
  const videoRoot = path.join(mountRoot, ".mixlab-library", "videos", SOURCE_VIDEO_ID);
  await writeFile(
    path.join(videoRoot, "source-video.json"),
    `${JSON.stringify({
      source_video_id: SOURCE_VIDEO_ID,
      preprocess_status: "index-required",
      visible_to_cutters: false,
      transcript_path: `.mixlab-library/videos/${SOURCE_VIDEO_ID}/transcript.json`,
      srt_path: `.mixlab-library/videos/${SOURCE_VIDEO_ID}/subtitles.srt`
    })}\n`,
    "utf8"
  );
  await writeFile(
    path.join(videoRoot, "preprocess-job.json"),
    `${JSON.stringify({
      source_video_id: SOURCE_VIDEO_ID,
      status: "index-required",
      attempt: 3,
      worker_id: "admin-smoke-fixture",
      completed_at: "2026-06-29T00:00:30.000Z"
    })}\n`,
    "utf8"
  );
  await writeFile(
    path.join(mountRoot, ".mixlab-library", "library.json"),
    `${JSON.stringify(libraryStatus({
      queued_video_count: 903,
      index_required_video_count: 20
    }))}\n`,
    "utf8"
  );
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: status < 400, data }), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function dryRunFetch(input: {
  library_status?: unknown;
  source_detail?: unknown;
  seen?: Array<{ method: string; path: string; token: string; body: string }>;
} = {}): typeof fetch {
  return async (resource, init) => {
    const url = new URL(String(resource));
    const headers = new Headers(init?.headers);
    const requestPath = `${url.pathname}${url.search}`;
    input.seen?.push({
      method: init?.method ?? "GET",
      path: requestPath,
      token: headers.get("X-MixLab-Admin-Session-Token") ?? "",
      body: typeof init?.body === "string" ? init.body : ""
    });

    if (url.pathname === "/api/admin/auth/status") {
      return jsonResponse({ auth_mode: "password", authenticated: true });
    }
    if (url.pathname === "/api/admin/library/status") {
      return jsonResponse(input.library_status ?? libraryStatus());
    }
    if (url.pathname === "/api/admin/preprocess/safety") {
      return jsonResponse({
        status: "healthy",
        safe_to_start: true,
        disk: { status: "healthy", usage_percent: 68, block_usage_percent: 92 },
        processing: { processing_count: 0, source_video_ids: [] },
        blockers: []
      });
    }
    if (url.pathname === "/api/admin/preprocess/supervisor/status") {
      return jsonResponse({ state: "idle" });
    }
    if (requestPath === "/api/admin/source-videos?status=processing&limit=20") {
      return jsonResponse([]);
    }
    if (url.pathname === `/api/admin/source-videos/${SOURCE_VIDEO_ID}`) {
      return jsonResponse(input.source_detail ?? sourceDetail());
    }

    return jsonResponse({}, 404);
  };
}

test("single-video smoke dry-run captures snapshot and never sends POST or leaks session tokens", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-single-smoke-"));
  const { mountRoot, readinessPath } = await createFixtureFiles(tempDir);
  const seen: Array<{ method: string; path: string; token: string; body: string }> = [];

  try {
    const report = await runAdminPreprocessSingleVideoSmoke({
      base_url: BASE_URL,
      source_video_id: SOURCE_VIDEO_ID,
      session_token: "fixture-admin-session-token",
      readiness_report_path: readinessPath,
      library_mount_root: mountRoot,
      output_dir: tempDir,
      date: new Date("2026-06-29T00:00:00.000Z"),
      fetch_impl: dryRunFetch({ seen })
    });
    const json = await readFile(report.artifacts?.json_path ?? "", "utf8");
    const markdown = await readFile(report.artifacts?.markdown_path ?? "", "utf8");

    assert.equal(report.result.status, "dry-run-ready");
    assert.equal(report.dry_run_ready, true);
    assert.equal(report.mutates_nas_files, false);
    assert.equal(seen.every((item) => item.method === "GET"), true);
    assert.equal(seen.some((item) => item.token === "fixture-admin-session-token"), true);
    assert.ok(report.snapshot.copied_files.some((item) => item.relative_path === ".mixlab-library/library.json"));
    assert.ok(report.snapshot.copied_files.some((item) => item.relative_path === `.mixlab-library/videos/${SOURCE_VIDEO_ID}/source-video.json`));
    assert.doesNotMatch(json, /fixture-admin-session-token/);
    assert.doesNotMatch(markdown, /fixture-admin-session-token/);
    assert.doesNotMatch(json, /should not be written in full/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("single-video smoke execute posts only the selected source video and verifies postcheck", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-single-smoke-"));
  const { mountRoot, readinessPath } = await createFixtureFiles(tempDir);
  const seen: Array<{ method: string; path: string; token: string; body: string }> = [];
  let supervisorCalls = 0;
  let libraryCalls = 0;
  let detailCalls = 0;
  const fakeFetch: typeof fetch = async (resource, init) => {
    const url = new URL(String(resource));
    const headers = new Headers(init?.headers);
    const requestPath = `${url.pathname}${url.search}`;
    const body = typeof init?.body === "string" ? init.body : "";
    seen.push({
      method: init?.method ?? "GET",
      path: requestPath,
      token: headers.get("X-MixLab-Admin-Session-Token") ?? "",
      body
    });

    if (url.pathname === "/api/admin/auth/status") {
      return jsonResponse({ auth_mode: "password", authenticated: true });
    }
    if (url.pathname === "/api/admin/library/status") {
      libraryCalls += 1;
      return jsonResponse(libraryStatus(libraryCalls === 1
        ? {}
        : {
            queued_video_count: 903,
            index_required_video_count: 20
          }));
    }
    if (url.pathname === "/api/admin/preprocess/safety") {
      return jsonResponse({
        status: "healthy",
        safe_to_start: true,
        disk: { status: "healthy" },
        processing: { processing_count: 0, source_video_ids: [] },
        blockers: []
      });
    }
    if (url.pathname === "/api/admin/preprocess/supervisor/status") {
      supervisorCalls += 1;
      return jsonResponse(supervisorCalls === 1
        ? { state: "idle" }
        : {
            state: "idle",
            last_result: {
              total_claimed_count: 1,
              succeeded_count: 1,
              failed_count: 0
            }
          });
    }
    if (requestPath === "/api/admin/source-videos?status=processing&limit=20") {
      return jsonResponse([]);
    }
    if (url.pathname === `/api/admin/source-videos/${SOURCE_VIDEO_ID}`) {
      detailCalls += 1;
      return jsonResponse(detailCalls === 1
        ? sourceDetail()
        : sourceDetail({ status: "index-required", visible: false }));
    }
    if (url.pathname === "/api/admin/preprocess/supervisor/start") {
      await writePostExecuteFixtureFiles(mountRoot);
      return jsonResponse({ state: "running" });
    }
    if (url.pathname === `/api/admin/preprocess/jobs/J${SOURCE_VIDEO_ID.slice(1)}/log`) {
      return jsonResponse({
        source_video_id: SOURCE_VIDEO_ID,
        path: `.mixlab-library/logs/${SOURCE_VIDEO_ID}.log`,
        exists: true,
        content: "queued\nprocessing\nindex-required\n"
      });
    }

    return jsonResponse({}, 404);
  };

  try {
    const report = await runAdminPreprocessSingleVideoSmoke({
      base_url: BASE_URL,
      source_video_id: SOURCE_VIDEO_ID,
      session_token: "fixture-admin-session-token",
      readiness_report_path: readinessPath,
      library_mount_root: mountRoot,
      execute: true,
      poll_interval_ms: 1,
      poll_timeout_ms: 1000,
      post_file_wait_interval_ms: 1,
      post_file_wait_timeout_ms: 5,
      output_dir: tempDir,
      date: new Date("2026-06-29T00:00:00.000Z"),
      fetch_impl: fakeFetch
    });
    const startCalls = seen.filter((item) => item.method === "POST");

    assert.equal(report.result.status, "passed");
    assert.equal(report.single_video_smoke_passed, true);
    assert.equal(report.mutates_nas_files, true);
    assert.deepEqual(startCalls.map((item) => item.path), ["/api/admin/preprocess/supervisor/start"]);
    assert.deepEqual(JSON.parse(startCalls[0]?.body ?? "{}"), {
      limit: 1,
      source_video_id: SOURCE_VIDEO_ID
    });
    assert.equal(report.observed.source_status_after, "index-required");
    assert.equal(report.observed.ready_video_count_after, 10471);
    assert.equal(report.observed.current_index_version_after, "v010471");
    assert.equal(
      report.gates.find((item) => item.id === "post-smoke-nas-file-persistence")?.status,
      "pass"
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("single-video smoke fails execute when API succeeds but direct NAS files do not persist", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-single-smoke-"));
  const { mountRoot, readinessPath } = await createFixtureFiles(tempDir);
  let supervisorCalls = 0;
  let libraryCalls = 0;
  let detailCalls = 0;
  const fakeFetch: typeof fetch = async (resource, init) => {
    const url = new URL(String(resource));
    const requestPath = `${url.pathname}${url.search}`;

    if (url.pathname === "/api/admin/auth/status") {
      return jsonResponse({ auth_mode: "password", authenticated: true });
    }
    if (url.pathname === "/api/admin/library/status") {
      libraryCalls += 1;
      return jsonResponse(libraryStatus(libraryCalls === 1
        ? {}
        : {
            queued_video_count: 903,
            index_required_video_count: 20
          }));
    }
    if (url.pathname === "/api/admin/preprocess/safety") {
      return jsonResponse({
        status: "healthy",
        safe_to_start: true,
        disk: { status: "healthy" },
        processing: { processing_count: 0, source_video_ids: [] },
        blockers: []
      });
    }
    if (url.pathname === "/api/admin/preprocess/supervisor/status") {
      supervisorCalls += 1;
      return jsonResponse(supervisorCalls === 1
        ? { state: "idle" }
        : {
            state: "idle",
            last_result: {
              total_claimed_count: 1,
              succeeded_count: 1,
              failed_count: 0
            }
          });
    }
    if (requestPath === "/api/admin/source-videos?status=processing&limit=20") {
      return jsonResponse([]);
    }
    if (url.pathname === `/api/admin/source-videos/${SOURCE_VIDEO_ID}`) {
      detailCalls += 1;
      return jsonResponse(detailCalls === 1
        ? sourceDetail()
        : sourceDetail({ status: "index-required", visible: false }));
    }
    if (url.pathname === "/api/admin/preprocess/supervisor/start") {
      return jsonResponse({ state: "running" });
    }
    if (url.pathname === `/api/admin/preprocess/jobs/J${SOURCE_VIDEO_ID.slice(1)}/log`) {
      return jsonResponse({
        source_video_id: SOURCE_VIDEO_ID,
        path: `.mixlab-library/logs/${SOURCE_VIDEO_ID}.log`,
        exists: true,
        content: "queued\nprocessing\nindex-required\n"
      });
    }

    return jsonResponse({}, 404);
  };

  try {
    const report = await runAdminPreprocessSingleVideoSmoke({
      base_url: BASE_URL,
      source_video_id: SOURCE_VIDEO_ID,
      session_token: "fixture-admin-session-token",
      readiness_report_path: readinessPath,
      library_mount_root: mountRoot,
      execute: true,
      poll_interval_ms: 1,
      poll_timeout_ms: 1000,
      post_file_wait_interval_ms: 1,
      post_file_wait_timeout_ms: 5,
      output_dir: tempDir,
      date: new Date("2026-06-29T00:00:00.000Z"),
      fetch_impl: fakeFetch
    });

    assert.equal(report.result.status, "failed");
    assert.equal(report.single_video_smoke_passed, false);
    assert.equal(
      report.gates.find((item) => item.id === "post-smoke-nas-file-persistence")?.status,
      "fail"
    );
    assert.equal(report.post_file_check.source_video_manifest.fields.preprocess_status, "queued");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("single-video smoke can classify an API-safe old direct NAS view as SMB stale follow-up", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-single-smoke-"));
  const { mountRoot, readinessPath } = await createFixtureFiles(tempDir);
  let supervisorCalls = 0;
  let libraryCalls = 0;
  let detailCalls = 0;
  const fakeFetch: typeof fetch = async (resource, init) => {
    const url = new URL(String(resource));
    const requestPath = `${url.pathname}${url.search}`;

    if (url.pathname === "/api/admin/auth/status") {
      return jsonResponse({ auth_mode: "password", authenticated: true });
    }
    if (url.pathname === "/api/admin/library/status") {
      libraryCalls += 1;
      return jsonResponse(libraryStatus(libraryCalls === 1
        ? {}
        : {
            queued_video_count: 903,
            index_required_video_count: 20
          }));
    }
    if (url.pathname === "/api/admin/preprocess/safety") {
      return jsonResponse({
        status: "healthy",
        safe_to_start: true,
        disk: { status: "healthy" },
        processing: { processing_count: 0, source_video_ids: [] },
        blockers: []
      });
    }
    if (url.pathname === "/api/admin/preprocess/supervisor/status") {
      supervisorCalls += 1;
      return jsonResponse(supervisorCalls === 1
        ? { state: "idle" }
        : {
            state: "idle",
            last_result: {
              total_claimed_count: 1,
              succeeded_count: 1,
              failed_count: 0
            }
          });
    }
    if (requestPath === "/api/admin/source-videos?status=processing&limit=20") {
      return jsonResponse([]);
    }
    if (url.pathname === `/api/admin/source-videos/${SOURCE_VIDEO_ID}`) {
      detailCalls += 1;
      return jsonResponse(detailCalls === 1
        ? sourceDetail()
        : sourceDetail({ status: "index-required", visible: false }));
    }
    if (url.pathname === "/api/admin/preprocess/supervisor/start") {
      return jsonResponse({ state: "running" });
    }
    if (url.pathname === `/api/admin/preprocess/jobs/J${SOURCE_VIDEO_ID.slice(1)}/log`) {
      return jsonResponse({
        source_video_id: SOURCE_VIDEO_ID,
        path: `.mixlab-library/logs/${SOURCE_VIDEO_ID}.log`,
        exists: true,
        content: "queued\nprocessing\nindex-required\n"
      });
    }

    return jsonResponse({}, 404);
  };

  try {
    const report = await runAdminPreprocessSingleVideoSmoke({
      base_url: BASE_URL,
      source_video_id: SOURCE_VIDEO_ID,
      session_token: "fixture-admin-session-token",
      readiness_report_path: readinessPath,
      library_mount_root: mountRoot,
      execute: true,
      allow_smb_stale_post_file_view: true,
      poll_interval_ms: 1,
      poll_timeout_ms: 1000,
      post_file_wait_interval_ms: 1,
      post_file_wait_timeout_ms: 5,
      output_dir: tempDir,
      date: new Date("2026-06-29T00:00:00.000Z"),
      fetch_impl: fakeFetch
    });
    const postFileGate = report.gates.find((item) => item.id === "post-smoke-nas-file-persistence");

    assert.equal(report.result.status, "passed");
    assert.equal(report.single_video_smoke_passed, true);
    assert.equal(report.post_file_check_policy.allow_smb_stale_post_file_view, true);
    assert.equal(postFileGate?.status, "needs-follow-up");
    assert.equal(postFileGate?.blocks_execute, false);
    assert.ok(report.summary.needs_follow_up >= 1);
    assert.deepEqual(report.summary.execute_blockers, []);
    assert.match(postFileGate?.evidence ?? "", /diagnosis=smb-stale-post-file-view-suspected/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("single-video smoke postcheck can refresh a stale SMB view once", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-single-smoke-"));
  const { mountRoot } = await createFixtureFiles(tempDir);

  try {
    const check = await waitForSingleVideoSmokePostFiles({
      library_mount_root: mountRoot,
      source_video_id: SOURCE_VIDEO_ID,
      expected_ready_count: 10471,
      expected_index_required_count: 20,
      timeout_ms: 50,
      interval_ms: 1,
      refresh_post_file_view: async () => {
        await writePostExecuteFixtureFiles(mountRoot);
        return {
          attempted: true,
          exit_code: 0,
          error: ""
        };
      }
    });

    assert.equal(check.status, "checked");
    assert.equal(check.attempt_count, 2);
    assert.equal(check.refresh_command_configured, true);
    assert.equal(check.refresh_attempted, true);
    assert.equal(check.refresh_exit_code, 0);
    assert.equal(check.source_video_manifest.fields.preprocess_status, "index-required");
    assert.equal(check.preprocess_job.fields.status, "index-required");
    assert.equal(check.library_manifest.fields.index_required_video_count, 20);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("single-video smoke fails hard when the ready or index baseline drifts", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-single-smoke-"));
  const { mountRoot, readinessPath } = await createFixtureFiles(tempDir);

  try {
    const report = await runAdminPreprocessSingleVideoSmoke({
      base_url: BASE_URL,
      source_video_id: SOURCE_VIDEO_ID,
      session_token: "fixture-admin-session-token",
      readiness_report_path: readinessPath,
      library_mount_root: mountRoot,
      output_dir: tempDir,
      date: new Date("2026-06-29T00:00:00.000Z"),
      fetch_impl: dryRunFetch({
        library_status: libraryStatus({
          ready_video_count: 10470,
          current_index_version: "v010470"
        })
      })
    });

    assert.equal(report.result.status, "failed");
    assert.ok(report.summary.dry_run_blockers.includes("baseline-before-preserved"));
    assert.equal(
      report.gates.find((item) => item.id === "baseline-before-preserved")?.status,
      "fail"
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("single-video smoke blocks candidates that are already ready or visible to Cutter", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-single-smoke-"));
  const { mountRoot, readinessPath } = await createFixtureFiles(tempDir);

  try {
    const report = await runAdminPreprocessSingleVideoSmoke({
      base_url: BASE_URL,
      source_video_id: SOURCE_VIDEO_ID,
      session_token: "fixture-admin-session-token",
      readiness_report_path: readinessPath,
      library_mount_root: mountRoot,
      output_dir: tempDir,
      date: new Date("2026-06-29T00:00:00.000Z"),
      fetch_impl: dryRunFetch({
        source_detail: sourceDetail({ status: "ready", visible: true })
      })
    });

    assert.equal(report.result.status, "blocked");
    assert.ok(report.summary.dry_run_blockers.includes("candidate-is-queued-and-hidden"));
    assert.equal(report.observed.source_status_before, "ready");
    assert.equal(report.observed.source_visible_before, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
