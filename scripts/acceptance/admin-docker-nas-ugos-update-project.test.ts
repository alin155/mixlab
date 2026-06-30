import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runAdminDockerNasUgosUpdateProject } from "./admin-docker-nas-ugos-update-project.ts";

const OLD_TAG = "7f522691369862093257c228b4fdace00e20d1fa";
const TARGET_TAG = "7a5a9d10703ccdbfd499932f15c7d8d9e5026c78";

function composeContent(tag = OLD_TAG): string {
  return [
    "services:",
    "  admin-api:",
    `    image: ghcr.io/alin155/mixlab-admin-runtime:${tag}`,
    "    environment:",
    `      MIXLAB_IMAGE_TAG: \"${tag}\"`,
    "      MIXLAB_ADMIN_DOCKER_MVP_MODE: \"v0.1\"",
    "      MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: \"0\"",
    "      MIXLAB_ENABLE_READY_PUBLISH_WORKER: \"0\"",
    "      MIXLAB_PREPROCESS_LIBRARY_ROOT: \"/data/PublicLibrary\"",
    "    volumes:",
    "      - /volume1/MixLab/PublicLibrary:/data/PublicLibrary",
    "  admin-web:",
    `    image: ghcr.io/alin155/mixlab-admin-web:${tag}`,
    "  admin-worker:",
    `    image: ghcr.io/alin155/mixlab-admin-runtime:${tag}`,
    "    environment:",
    `      MIXLAB_IMAGE_TAG: \"${tag}\"`,
    "      MIXLAB_ADMIN_DOCKER_MVP_MODE: \"v0.1\"",
    "      MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: \"0\"",
    "      MIXLAB_ENABLE_READY_PUBLISH_WORKER: \"0\"",
    "      MIXLAB_PREPROCESS_LIBRARY_ROOT: \"/data/PublicLibrary\"",
    "    volumes:",
    "      - /volume1/MixLab/PublicLibrary:/data/PublicLibrary"
  ].join("\n");
}

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
  projectContent?: string;
  healthTag?: string;
  updateCode?: string;
} = {}): {
  fetchImpl: typeof fetch;
  calls: string[];
  updateBodies: Array<Record<string, unknown>>;
} {
  const calls: string[] = [];
  const updateBodies: Array<Record<string, unknown>> = [];
  const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
    const parsed = new URL(String(url));
    calls.push(`${init?.method ?? "GET"} ${parsed.pathname}`);

    if (parsed.pathname.endsWith("/ugreen/v1/docker/compose/GetProjectInfoV2")) {
      return jsonResponse(envelope({
        name: "mixlab-server",
        path: "/volume1/docker/mixlab-server/docker-compose.yaml",
        status: 4,
        content: input.projectContent ?? composeContent()
      }));
    }

    if (parsed.pathname.endsWith("/ugreen/v1/docker/compose/UpdateProject")) {
      updateBodies.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {});
      return jsonResponse({
        code: input.updateCode ?? "200",
        msg: input.updateCode === "500" ? "update failed" : "success",
        data: { accepted: input.updateCode !== "500" }
      });
    }

    if (parsed.pathname.endsWith("/health")) {
      return jsonResponse({
        ok: true,
        data: {
          ok: true,
          status: "healthy",
          build: {
            image_tag: input.healthTag ?? TARGET_TAG
          }
        }
      });
    }

    return jsonResponse(envelope({ ok: true }));
  };

  return { fetchImpl: fetchImpl as typeof fetch, calls, updateBodies };
}

test("UGOS project update dry-run retags compose without submitting UpdateProject", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-ugos-update-dry-"));
  const fake = fakeFetch();
  const report = await runAdminDockerNasUgosUpdateProject({
    target_image_tag: TARGET_TAG,
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
  assert.equal(report.execution.update_submitted, false);
  assert.equal(report.execution.latest_images, false);
  assert.equal(report.execution.public_library_touched, false);
  assert.equal(report.execution.preprocess_started, false);
  assert.ok(report.observations.after_images.every((image) => image.endsWith(`:${TARGET_TAG}`)));
  assert.ok(report.observations.worker_lines_after.some((line) => line.includes("MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: \"0\"")));
  assert.ok(report.observations.worker_lines_after.some((line) => line.includes("MIXLAB_ENABLE_READY_PUBLISH_WORKER: \"0\"")));
  assert.ok(!fake.calls.some((item) => item.includes("UpdateProject")));
  assert.deepEqual(report.summary.update_blockers, []);

  const json = await readFile(report.artifacts?.json_path ?? "", "utf8");
  assert.doesNotMatch(json, /redacted-test-token/);
});

test("UGOS project update can apply explicit docker mvp command allowlist", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-ugos-update-allowlist-"));
  const fake = fakeFetch();
  const report = await runAdminDockerNasUgosUpdateProject({
    target_image_tag: TARGET_TAG,
    execute: true,
    output_dir: outputDir,
    generated_at: "2026-06-30T00:00:00.000Z",
    command: "test",
    fetchImpl: fake.fetchImpl,
    health_poll_attempts: 2,
    health_poll_interval_ms: 1,
    env: {
      MIXLAB_UGOS_TOKEN: "redacted-test-token",
      MIXLAB_ADMIN_DOCKER_MVP_ALLOW_COMMANDS: "source-video-publish"
    } as NodeJS.ProcessEnv
  });

  assert.equal(report.result.status, "updated");
  assert.equal(report.target.docker_mvp_allow_commands, "source-video-publish");
  assert.equal(fake.updateBodies.length, 1);
  const projectContent = String(fake.updateBodies[0]?.projectContent);
  assert.equal((projectContent.match(/MIXLAB_ADMIN_DOCKER_MVP_ALLOW_COMMANDS: "source-video-publish"/g) ?? []).length, 2);
  assert.ok(report.observations.worker_lines_after.some((line) => line.includes("MIXLAB_ADMIN_DOCKER_MVP_ALLOW_COMMANDS: \"source-video-publish\"")));
  assert.deepEqual(report.summary.update_blockers, []);

  const json = await readFile(report.artifacts?.json_path ?? "", "utf8");
  assert.doesNotMatch(json, /redacted-test-token/);
});

test("UGOS project update submits UpdateProject with latestImages false and verifies target health", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-ugos-update-exec-"));
  const fake = fakeFetch();
  const report = await runAdminDockerNasUgosUpdateProject({
    target_image_tag: TARGET_TAG,
    execute: true,
    output_dir: outputDir,
    generated_at: "2026-06-30T00:00:00.000Z",
    command: "test",
    fetchImpl: fake.fetchImpl,
    health_poll_attempts: 2,
    health_poll_interval_ms: 1,
    env: {
      MIXLAB_UGOS_TOKEN: "redacted-test-token"
    } as NodeJS.ProcessEnv
  });

  assert.equal(report.result.status, "updated");
  assert.equal(report.execution.update_submitted, true);
  assert.equal(fake.updateBodies.length, 1);
  assert.equal(fake.updateBodies[0]?.projectName, "mixlab-server");
  assert.equal(fake.updateBodies[0]?.runProject, true);
  assert.equal(fake.updateBodies[0]?.latestImages, false);
  assert.match(String(fake.updateBodies[0]?.projectContent), new RegExp(`mixlab-admin-runtime:${TARGET_TAG}`));
  assert.match(String(fake.updateBodies[0]?.projectContent), new RegExp(`mixlab-admin-web:${TARGET_TAG}`));
  assert.doesNotMatch(String(fake.updateBodies[0]?.projectContent), /MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: \"1\"/);
  assert.equal(report.observations.health.at(-1)?.image_tag, TARGET_TAG);
  assert.deepEqual(report.summary.update_blockers, []);
});

test("UGOS project update blocks execution when target tag is missing", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-ugos-update-missing-tag-"));
  const fake = fakeFetch();
  const report = await runAdminDockerNasUgosUpdateProject({
    target_image_tag: "",
    execute: true,
    output_dir: outputDir,
    generated_at: "2026-06-30T00:00:00.000Z",
    command: "test",
    fetchImpl: fake.fetchImpl,
    env: {
      MIXLAB_UGOS_TOKEN: "redacted-test-token"
    } as NodeJS.ProcessEnv
  });

  assert.equal(report.result.status, "blocked");
  assert.equal(report.execution.update_submitted, false);
  assert.ok(report.summary.update_blockers.includes("target-image-tag-declared"));
  assert.ok(!fake.calls.some((item) => item.includes("UpdateProject")));
});

test("UGOS project update blocks when compose would enable preprocess worker", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-ugos-update-worker-"));
  const fake = fakeFetch({
    projectContent: composeContent().replaceAll("MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: \"0\"", "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: \"1\"")
  });
  const report = await runAdminDockerNasUgosUpdateProject({
    target_image_tag: TARGET_TAG,
    execute: true,
    output_dir: outputDir,
    generated_at: "2026-06-30T00:00:00.000Z",
    command: "test",
    fetchImpl: fake.fetchImpl,
    env: {
      MIXLAB_UGOS_TOKEN: "redacted-test-token"
    } as NodeJS.ProcessEnv
  });

  assert.equal(report.result.status, "blocked");
  assert.equal(report.execution.update_submitted, false);
  assert.ok(report.summary.update_blockers.includes("worker-flags-disabled"));
  assert.ok(!fake.calls.some((item) => item.includes("UpdateProject")));
});
