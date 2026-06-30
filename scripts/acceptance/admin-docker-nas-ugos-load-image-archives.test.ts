import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runAdminDockerNasUgosLoadImageArchives } from "./admin-docker-nas-ugos-load-image-archives.ts";

const TAG = "7a5a9d10703ccdbfd499932f15c7d8d9e5026c78";
const RUNTIME = `ghcr.io/alin155/mixlab-admin-runtime:${TAG}`;
const WEB = `ghcr.io/alin155/mixlab-admin-web:${TAG}`;

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function envelope(data: unknown): unknown {
  return {
    code: "200",
    msg: "success",
    data
  };
}

function fakeFetch(input: {
  imagesPresentInitially?: boolean;
  failLoad?: boolean;
} = {}): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  let loadCalled = false;
  let loadPathCalls = 0;
  const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
    const parsed = new URL(String(url));
    calls.push(`${init?.method ?? "GET"} ${parsed.pathname}`);

    if (parsed.pathname.endsWith("/ugreen/v1/docker/image/ShowLocalImageV2")) {
      const visible = input.imagesPresentInitially || loadCalled;
      return jsonResponse(envelope({
        result: visible
          ? [
              { imageName: "ghcr.io/alin155/mixlab-admin-runtime", imageVersion: TAG, tag: RUNTIME },
              { imageName: "ghcr.io/alin155/mixlab-admin-web", imageVersion: TAG, tag: WEB }
            ]
          : []
      }));
    }

    if (parsed.pathname.endsWith("/ugreen/v1/docker/image/CheckPath")) {
      return jsonResponse(envelope({ ok: true }));
    }

    if (parsed.pathname.endsWith("/ugreen/v1/docker/image/LoadPaths")) {
      if (input.failLoad) {
        return jsonResponse({
          code: "500",
          msg: "load failed",
          data: null
        });
      }
      loadCalled = true;
      return jsonResponse(envelope({ accepted: true }));
    }

    if (parsed.pathname.endsWith("/ugreen/v1/docker/image/LoadPath")) {
      if (input.failLoad) {
        return jsonResponse({
          code: "500",
          msg: "load failed",
          data: null
        });
      }
      loadPathCalls += 1;
      if (loadPathCalls >= 2) {
        loadCalled = true;
      }
      return jsonResponse(envelope({ accepted: true }));
    }

    return jsonResponse(envelope({ ok: true }));
  };

  return { fetchImpl: fetchImpl as typeof fetch, calls };
}

test("UGOS image archive loader dry-run does not call LoadPaths", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-ugos-load-dry-"));
  const fake = fakeFetch();
  const report = await runAdminDockerNasUgosLoadImageArchives({
    image_tag: TAG,
    archive_dir: `/volume1/MixLab/docker-image-transfer/${TAG}`,
    execute: false,
    output_dir: outputDir,
    generated_at: "2026-06-30T00:00:00.000Z",
    command: "test",
    fetchImpl: fake.fetchImpl,
    env: {
      MIXLAB_UGOS_TOKEN: "redacted-test-token"
    } as NodeJS.ProcessEnv
  });

  assert.equal(report.result.status, "dry-run-ready");
  assert.equal(report.execution.execute_requested, false);
  assert.equal(report.execution.load_strategy, "paths");
  assert.equal(report.execution.load_submitted, false);
  assert.equal(report.execution.docker_images_touched, false);
  assert.equal(report.execution.container_runtime_touched, false);
  assert.equal(report.execution.public_library_touched, false);
  assert.ok(!fake.calls.some((item) => item.includes("LoadPaths")));
  assert.ok(fake.calls.some((item) => item.includes("CheckPath")));

  const json = await readFile(report.artifacts?.json_path ?? "", "utf8");
  assert.doesNotMatch(json, /redacted-test-token/);
});

test("UGOS image archive loader executes LoadPaths and verifies local images", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-ugos-load-exec-"));
  const fake = fakeFetch();
  const report = await runAdminDockerNasUgosLoadImageArchives({
    image_tag: TAG,
    archive_paths: [
      `/volume1/MixLab/docker-image-transfer/${TAG}/mixlab-admin-runtime-${TAG}.tar.gz`,
      `/volume1/MixLab/docker-image-transfer/${TAG}/mixlab-admin-web-${TAG}.tar.gz`
    ],
    execute: true,
    output_dir: outputDir,
    generated_at: "2026-06-30T00:00:00.000Z",
    command: "test",
    fetchImpl: fake.fetchImpl,
    poll_attempts: 2,
    poll_interval_ms: 1,
    env: {
      MIXLAB_UGOS_TOKEN: "redacted-test-token"
    } as NodeJS.ProcessEnv
  });

  assert.equal(report.result.status, "loaded");
  assert.equal(report.execution.load_submitted, true);
  assert.equal(report.execution.docker_images_touched, true);
  assert.equal(report.execution.docker_compose_touched, false);
  assert.equal(report.execution.preprocess_started, false);
  assert.equal(report.observations.after_presence.runtime, true);
  assert.equal(report.observations.after_presence.web, true);
  assert.ok(fake.calls.some((item) => item.includes("LoadPaths")));
  assert.ok(!report.summary.load_blockers.length);
});

test("UGOS image archive loader can load archives one by one with LoadPath", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-ugos-load-sequential-"));
  const fake = fakeFetch();
  const report = await runAdminDockerNasUgosLoadImageArchives({
    image_tag: TAG,
    archive_paths: [
      `/volume1/MixLab/docker-image-transfer/${TAG}/mixlab-admin-runtime-${TAG}.tar.gz`,
      `/volume1/MixLab/docker-image-transfer/${TAG}/mixlab-admin-web-${TAG}.tar.gz`
    ],
    execute: true,
    load_strategy: "path-sequential",
    output_dir: outputDir,
    generated_at: "2026-06-30T00:00:00.000Z",
    command: "test",
    fetchImpl: fake.fetchImpl,
    poll_attempts: 2,
    poll_interval_ms: 1,
    env: {
      MIXLAB_UGOS_TOKEN: "redacted-test-token"
    } as NodeJS.ProcessEnv
  });

  assert.equal(report.result.status, "loaded");
  assert.equal(report.execution.load_strategy, "path-sequential");
  assert.equal(report.observations.load_calls.length, 2);
  assert.ok(report.observations.load_calls.every((item) => item.name.startsWith("LoadPath:")));
  assert.ok(fake.calls.filter((item) => item.includes("LoadPath")).length === 2);
});

test("UGOS image archive loader blocks when LoadPaths rejects", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-ugos-load-blocked-"));
  const fake = fakeFetch({ failLoad: true });
  const report = await runAdminDockerNasUgosLoadImageArchives({
    image_tag: TAG,
    execute: true,
    output_dir: outputDir,
    generated_at: "2026-06-30T00:00:00.000Z",
    command: "test",
    fetchImpl: fake.fetchImpl,
    poll_attempts: 1,
    poll_interval_ms: 1,
    env: {
      MIXLAB_UGOS_TOKEN: "redacted-test-token"
    } as NodeJS.ProcessEnv
  });

  assert.equal(report.result.status, "blocked");
  assert.equal(report.execution.load_submitted, false);
  assert.ok(report.summary.load_blockers.includes("loadpaths-api-accepted"));
  assert.ok(report.summary.load_blockers.includes("target-images-present-after-load"));
});
