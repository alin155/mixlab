import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  runAdminPreprocessPostBatchProof
} from "./admin-preprocess-post-batch-proof.ts";

const BASE_URL = "http://192.168.1.27:18080";
const IDS = ["V005166", "V002985"];

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: status >= 200 && status < 300, data }), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

function buildFetch(input: {
  ready_count?: number;
  queued_count?: number;
  index_required_count?: number;
  index_version?: string;
  source_status?: string;
  source_visible?: boolean;
} = {}): typeof fetch {
  const readyCount = input.ready_count ?? 10471;
  const queuedCount = input.queued_count ?? 876;
  const indexRequiredCount = input.index_required_count ?? 47;
  const indexVersion = input.index_version ?? "v010471";
  const sourceStatus = input.source_status ?? "index-required";
  const sourceVisible = input.source_visible ?? false;

  return async (url) => {
    const parsed = new URL(String(url));
    const route = `${parsed.pathname}${parsed.search}`;

    if (route === "/api/admin/auth/status") {
      return jsonResponse({
        authenticated: true,
        user: {
          user_id: "AU000001"
        }
      });
    }
    if (route === "/api/admin/library/status") {
      return jsonResponse({
        root_path: "/data/PublicLibrary",
        ready_video_count: readyCount,
        queued_video_count: queuedCount,
        processing_video_count: 0,
        index_required_video_count: indexRequiredCount,
        current_index_version: indexVersion
      });
    }
    if (route === "/api/admin/preprocess/supervisor/status") {
      return jsonResponse({
        state: "idle",
        running: false
      });
    }
    if (route === "/api/admin/source-videos?status=processing&limit=20") {
      return jsonResponse([]);
    }
    if (route.startsWith("/api/admin/source-videos/V")) {
      const sourceVideoId = route.split("/").at(-1) ?? "";
      return jsonResponse({
        source_video: {
          source_video_id: sourceVideoId,
          preprocess_status: sourceStatus,
          visible_to_cutters: sourceVisible
        },
        preprocess: {
          status: sourceStatus
        },
        artifacts: {
          index_version: indexVersion,
          artifact_complete: true
        }
      });
    }

    return jsonResponse({ error: "not found" }, 404);
  };
}

async function writeJson(root: string, relativePath: string, value: unknown, suffix = ""): Promise<void> {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}${suffix}`, "utf8");
}

async function writeSmbFixture(input: {
  root: string;
  source_status: string;
  job_status: string;
  source_visible?: boolean;
  ready_count?: number;
  queued_count: number;
  index_required_count: number;
  current_index_version?: string;
  omit_current_index_version?: boolean;
  nul_suffix?: boolean;
}): Promise<void> {
  const readyCount = input.ready_count ?? 10471;
  const currentIndexVersion = input.current_index_version ?? "v010471";
  const sourceVisible = input.source_visible ?? false;
  const libraryManifest: Record<string, unknown> = {
    video_count: 11394,
    ready_video_count: readyCount,
    queued_video_count: input.queued_count,
    processing_video_count: 0,
    index_required_video_count: input.index_required_count
  };
  if (!input.omit_current_index_version) {
    libraryManifest.current_index_version = currentIndexVersion;
  }
  await writeJson(input.root, ".mixlab-library/library.json", libraryManifest, input.nul_suffix ? "\u0000" : "");

  for (const sourceVideoId of IDS) {
    await writeJson(input.root, `.mixlab-library/videos/${sourceVideoId}/source-video.json`, {
      source_video_id: sourceVideoId,
      preprocess_status: input.source_status,
      visible_to_cutters: sourceVisible
    }, input.nul_suffix ? "\u0000" : "");
    await writeJson(input.root, `.mixlab-library/videos/${sourceVideoId}/preprocess-job.json`, {
      source_video_id: sourceVideoId,
      status: input.job_status
    }, input.nul_suffix ? "\u0000" : "");
  }
}

async function writeWindowsAcceptanceReport(input: {
  dir: string;
  status?: string;
  available_video_count?: number;
  release_version?: string;
}): Promise<string> {
  const reportPath = path.join(input.dir, "windows-acceptance.json");
  const releaseVersion = input.release_version ?? "v010471";
  const appRuntimeSmoke = {
    checks: [
      {
        id: "runtime_status",
        body: {
          data: {
            available_video_count: input.available_video_count ?? 10471,
            release_cache: {
              active_release_version: releaseVersion,
              search_index_version: releaseVersion
            },
            search_backend: {
              index_version: releaseVersion
            }
          }
        }
      },
      {
        id: "source_library_first_page",
        body: {
          data: {
            available_video_count: input.available_video_count ?? 10471
          }
        }
      }
    ]
  };
  await writeFile(reportPath, `${JSON.stringify({
    schema_version: "1.0",
    suite: "windows_acceptance",
    status: input.status ?? "passed",
    runner_version: "0.1.32",
    app_runtime_smoke: appRuntimeSmoke,
    windows_acceptance: {
      api_base_url: "http://127.0.0.1:3789",
      app_runtime_smoke: appRuntimeSmoke
    }
  }, null, 2)}\n`, "utf8");
  return reportPath;
}

async function writeRealCutReport(input: {
  dir: string;
  status?: string;
  source_video_id?: string;
  run_next_status?: string;
  output_file?: string;
}): Promise<string> {
  const reportPath = path.join(input.dir, "real-cut.json");
  await writeFile(reportPath, `${JSON.stringify({
    schema_version: "1.0",
    suite: "real_cut_smoke",
    status: input.status ?? "passed",
    runner_version: "0.1.34",
    real_cut_smoke: {
      selected_source_video_id: input.source_video_id ?? IDS[0],
      query: "fixture query",
      run_next_status: input.run_next_status ?? "done",
      output_file: input.output_file ?? "export-clips/E000001/001-fixture.mp4",
      phase_timings: [
        {
          phase_id: "resolve_source",
          status: "done"
        },
        {
          phase_id: "cut_media",
          status: "done"
        }
      ]
    }
  }, null, 2)}\n`, "utf8");
  return reportPath;
}

test("post-batch proof treats API-safe stale SMB direct reads as follow-up, not scale-up blocker", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-post-batch-"));
  const secret = "fixture-secret-token";

  try {
    await writeSmbFixture({
      root: tempDir,
      source_status: "queued",
      job_status: "queued",
      queued_count: 881,
      index_required_count: 42,
      nul_suffix: true
    });
    const windowsReport = await writeWindowsAcceptanceReport({ dir: tempDir });
    const report = await runAdminPreprocessPostBatchProof({
      base_url: BASE_URL,
      source_video_ids: IDS,
      expected_queued_count: 876,
      expected_index_required_count: 47,
      session_token: secret,
      library_mount_root: tempDir,
      windows_acceptance_report_path: windowsReport,
      output_dir: tempDir,
      date: new Date("2026-06-29T21:00:00.000Z"),
      fetch_impl: buildFetch()
    });

    assert.equal(report.status, "passed-with-follow-up");
    assert.equal(report.next_small_batch_allowed, true);
    assert.equal(report.scale_up_allowed, true);
    assert.equal(report.summary.scale_up_blockers.includes("smb-direct-post-files"), false);
    assert.equal(report.source_items.every((item) => item.smb_status === "stale-follow-up"), true);
    const saved = await readFile(report.artifacts?.json_path ?? "", "utf8");
    assert.equal(saved.includes(secret), false);
    assert.equal(saved.includes("session_token_present"), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("post-batch proof fails when Admin API ready baseline drifts", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-post-batch-"));

  try {
    await writeSmbFixture({
      root: tempDir,
      source_status: "index-required",
      job_status: "index-required",
      queued_count: 876,
      index_required_count: 47
    });
    const windowsReport = await writeWindowsAcceptanceReport({ dir: tempDir });
    const report = await runAdminPreprocessPostBatchProof({
      base_url: BASE_URL,
      source_video_ids: IDS,
      expected_queued_count: 876,
      expected_index_required_count: 47,
      library_mount_root: tempDir,
      windows_acceptance_report_path: windowsReport,
      output_dir: tempDir,
      date: new Date("2026-06-29T21:00:00.000Z"),
      fetch_impl: buildFetch({
        ready_count: 10470
      })
    });

    assert.equal(report.status, "failed");
    assert.equal(report.next_small_batch_allowed, false);
    assert.equal(report.summary.next_small_batch_blockers.includes("api-library-baseline-preserved"), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("post-batch proof fails when Windows Cutter acceptance no longer sees preserved release", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-post-batch-"));

  try {
    await writeSmbFixture({
      root: tempDir,
      source_status: "index-required",
      job_status: "index-required",
      queued_count: 876,
      index_required_count: 47
    });
    const windowsReport = await writeWindowsAcceptanceReport({
      dir: tempDir,
      available_video_count: 10470
    });
    const report = await runAdminPreprocessPostBatchProof({
      base_url: BASE_URL,
      source_video_ids: IDS,
      expected_queued_count: 876,
      expected_index_required_count: 47,
      library_mount_root: tempDir,
      windows_acceptance_report_path: windowsReport,
      output_dir: tempDir,
      date: new Date("2026-06-29T21:00:00.000Z"),
      fetch_impl: buildFetch()
    });

    assert.equal(report.status, "failed");
    assert.equal(report.next_small_batch_allowed, false);
    assert.equal(report.summary.next_small_batch_blockers.includes("windows-cutter-acceptance"), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("post-batch proof passes when API, SMB and Windows evidence all match", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-post-batch-"));

  try {
    await writeSmbFixture({
      root: tempDir,
      source_status: "index-required",
      job_status: "index-required",
      queued_count: 876,
      index_required_count: 47
    });
    const windowsReport = await writeWindowsAcceptanceReport({ dir: tempDir });
    const report = await runAdminPreprocessPostBatchProof({
      base_url: BASE_URL,
      source_video_ids: IDS,
      expected_queued_count: 876,
      expected_index_required_count: 47,
      library_mount_root: tempDir,
      windows_acceptance_report_path: windowsReport,
      output_dir: tempDir,
      date: new Date("2026-06-29T21:00:00.000Z"),
      fetch_impl: buildFetch()
    });

    assert.equal(report.status, "passed");
    assert.equal(report.next_small_batch_allowed, true);
    assert.equal(report.scale_up_allowed, true);
    assert.equal(report.summary.next_small_batch_blockers.length, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("post-batch proof supports post-publish ready visible evidence", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-post-batch-"));

  try {
    await writeSmbFixture({
      root: tempDir,
      source_status: "ready",
      job_status: "ready",
      source_visible: true,
      ready_count: 10475,
      queued_count: 794,
      index_required_count: 114,
      current_index_version: "v010475",
      omit_current_index_version: true
    });
    const windowsReport = await writeWindowsAcceptanceReport({
      dir: tempDir,
      available_video_count: 10475,
      release_version: "v010475"
    });
    const realCutReport = await writeRealCutReport({
      dir: tempDir,
      source_video_id: IDS[1]
    });
    const report = await runAdminPreprocessPostBatchProof({
      base_url: BASE_URL,
      source_video_ids: IDS,
      proof_phase: "post-publish",
      expected_ready_count: 10475,
      expected_index_version: "v010475",
      expected_queued_count: 794,
      expected_index_required_count: 114,
      library_mount_root: tempDir,
      windows_acceptance_report_path: windowsReport,
      real_cut_report_path: realCutReport,
      output_dir: tempDir,
      date: new Date("2026-06-30T14:40:00.000Z"),
      fetch_impl: buildFetch({
        ready_count: 10475,
        queued_count: 794,
        index_required_count: 114,
        index_version: "v010475",
        source_status: "ready",
        source_visible: true
      })
    });

    assert.equal(report.status, "passed");
    assert.equal(report.target.proof_phase, "post-publish");
    assert.equal(report.next_small_batch_allowed, true);
    assert.equal(report.scale_up_allowed, true);
    assert.equal(report.summary.next_small_batch_blockers.length, 0);
    assert.equal(report.gates.some((item) => item.id === "api-selected-sources-ready-visible" && item.status === "pass"), true);
    assert.equal(report.gates.some((item) => item.id === "windows-real-cut-published-source" && item.status === "pass"), true);
    assert.equal(report.source_items.every((item) => item.api_preprocess_status === "ready" && item.api_visible_to_cutters === true), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("post-publish proof blocks when real cut evidence is missing", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-post-batch-"));

  try {
    await writeSmbFixture({
      root: tempDir,
      source_status: "ready",
      job_status: "ready",
      source_visible: true,
      ready_count: 10475,
      queued_count: 794,
      index_required_count: 114,
      current_index_version: "v010475",
      omit_current_index_version: true
    });
    const windowsReport = await writeWindowsAcceptanceReport({
      dir: tempDir,
      available_video_count: 10475,
      release_version: "v010475"
    });
    const report = await runAdminPreprocessPostBatchProof({
      base_url: BASE_URL,
      source_video_ids: IDS,
      proof_phase: "post-publish",
      expected_ready_count: 10475,
      expected_index_version: "v010475",
      expected_queued_count: 794,
      expected_index_required_count: 114,
      library_mount_root: tempDir,
      windows_acceptance_report_path: windowsReport,
      output_dir: tempDir,
      date: new Date("2026-06-30T14:41:00.000Z"),
      fetch_impl: buildFetch({
        ready_count: 10475,
        queued_count: 794,
        index_required_count: 114,
        index_version: "v010475",
        source_status: "ready",
        source_visible: true
      })
    });

    assert.equal(report.status, "blocked");
    assert.equal(report.next_small_batch_allowed, false);
    assert.equal(report.summary.next_small_batch_blockers.includes("windows-real-cut-published-source"), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
