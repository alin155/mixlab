import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  evaluateAdminDockerLocalSmokeStaticContract,
  renderAdminDockerLocalSmokeMarkdown,
  runAdminDockerLocalSmoke,
  shouldFailAdminDockerLocalSmokeCommand,
  type CommandResult
} from "./admin-docker-local-smoke.ts";

function commandResult(input: {
  command: string;
  args: string[];
  ok?: boolean;
  stdout?: string;
  stderr?: string;
  message?: string;
}): CommandResult {
  const ok = input.ok !== false;

  return {
    command: input.command,
    args: input.args,
    exit_code: ok ? 0 : 1,
    stdout: input.stdout ?? "",
    stderr: input.stderr ?? "",
    duration_ms: 1,
    ok,
    error_code: ok ? undefined : "mock_failed",
    message: ok ? undefined : input.message ?? "mock command failed"
  };
}

function releaseGates(): unknown {
  return {
    admin_worker_env_proof: {
      required_env_flags: {
        MIXLAB_ADMIN_DOCKER_MVP_MODE: "off",
        MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: "0",
        MIXLAB_ENABLE_READY_PUBLISH_WORKER: "0"
      },
      required_library_roots: {
        MIXLAB_ADMIN_LIBRARY_ROOT: "/data/PublicLibrary",
        MIXLAB_PREPROCESS_LIBRARY_ROOT: "/data/PublicLibrary"
      }
    }
  };
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}

test("local Docker smoke static contract passes for current Docker files", async () => {
  const staticContract = await evaluateAdminDockerLocalSmokeStaticContract();

  assert.equal(staticContract.ok, true);
  assert.equal(staticContract.checks.every((check) => check.status === "pass"), true);
  assert.ok(staticContract.checks.some((check) => check.id === "runtime-dockerfile-mvp-arg"));
  assert.ok(staticContract.checks.some((check) => check.id === "web-dockerfile-mvp-vite-env"));
  assert.ok(staticContract.checks.some((check) => check.id === "nas-compose-static-contract"));
});

test("local Docker smoke reports blocked when Docker is unavailable and run is not requested", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-local-smoke-blocked-"));
  try {
    const report = await runAdminDockerLocalSmoke({
      cwd: process.cwd(),
      generated_at: "2026-06-27T00:00:00.000Z",
      command: "test",
      env: {
        ...process.env,
        MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_WORK_ROOT: tempDir
      },
      commandRunner: async (command, args) => commandResult({
        command,
        args,
        ok: false,
        message: "docker command not found"
      })
    });

    assert.equal(report.result.status, "blocked");
    assert.equal(report.local_smoke_passed, false);
    assert.equal(report.docker_upload_allowed, false);
    assert.equal(report.nas_live_evidence, false);
    assert.equal(report.build_identity.image_tag, "local-admin-docker-production");
    assert.equal(report.build_identity.mvp_mode, "off");
    assert.equal(report.probes.length, 0);
    assert.ok(report.summary.local_smoke_blockers.includes("explicit-run-requested"));
    assert.ok(report.summary.local_smoke_blockers.includes("docker-cli-available"));
    assert.ok(report.summary.docker_upload_blockers.includes("local-smoke-not-nas-live-evidence"));

    const markdown = renderAdminDockerLocalSmokeMarkdown(report);
    assert.match(markdown, /local Docker candidate smoke only/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("local Docker smoke can pass full build compose probe flow with mocked Docker", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-local-smoke-pass-"));
  const commands: string[] = [];

  try {
    const report = await runAdminDockerLocalSmoke({
      cwd: process.cwd(),
      generated_at: "2026-06-27T00:00:00.000Z",
      command: "test",
      env: {
        ...process.env,
        MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_RUN: "1",
        MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_WORK_ROOT: tempDir,
        MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_WEB_PORT: "18082",
        MIXLAB_BUILD_SHA: "smoked-sha",
        MIXLAB_BUILD_VERSION: "smoked-version",
        MIXLAB_IMAGE_TAG: "smoked-image-tag"
      },
      commandRunner: async (command, args) => {
        commands.push([command, ...args].join(" "));

        if (args[0] === "--version") {
          return commandResult({ command, args, stdout: "Docker version 28.0.0" });
        }

        if (args[0] === "compose" && args[1] === "version") {
          return commandResult({ command, args, stdout: "Docker Compose version v2.36.0" });
        }

        if (args[0] === "build") {
          return commandResult({ command, args, stdout: "build ok" });
        }

        if (args[0] === "compose" && args.includes("up")) {
          return commandResult({ command, args, stdout: "compose up ok" });
        }

        if (args[0] === "compose" && args.includes("exec")) {
          return commandResult({
            command,
            args,
            stdout: [
              "MIXLAB_ADMIN_DOCKER_MVP_MODE=off",
              "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0",
              "MIXLAB_ENABLE_READY_PUBLISH_WORKER=0",
              "MIXLAB_ADMIN_LIBRARY_ROOT=/data/PublicLibrary",
              "MIXLAB_PREPROCESS_LIBRARY_ROOT=/data/PublicLibrary"
            ].join("\n")
          });
        }

        if (args[0] === "compose" && args.includes("down")) {
          return commandResult({ command, args, stdout: "compose down ok" });
        }

        return commandResult({ command, args });
      },
      fetcher: async (input) => {
        const url = new URL(String(input));

        if (url.pathname === "/") {
          return new Response("<!doctype html><title>MixLab Admin</title>", {
            status: 200,
            headers: {
              "content-type": "text/html"
            }
          });
        }

        if (url.pathname === "/api/admin/auth/status") {
          return jsonResponse({
            auth_mode: "disabled",
            authenticated: true
          });
        }

        if (url.pathname === "/api/admin/library/status") {
          return jsonResponse({
            root_path: "/data/PublicLibrary",
            current_index_version: ""
          });
        }

        if (url.pathname === "/api/admin/release-gates") {
          return jsonResponse(releaseGates());
        }

        if (url.pathname === "/api/admin/data-loading/plan") {
          return jsonResponse({
            hidden_full_scan_allowed: false
          });
        }

        return new Response("not found", { status: 404 });
      }
    });

    assert.equal(report.result.status, "accepted");
    assert.equal(report.local_smoke_passed, true);
    assert.equal(report.docker_upload_allowed, false);
    assert.deepEqual(report.build_identity, {
      image_tag: "smoked-image-tag",
      build_sha: "smoked-sha",
      build_version: "smoked-version",
      mvp_mode: "off"
    });
    assert.equal(report.observations.web_url, "http://127.0.0.1:18082/");
    assert.equal(report.probes.length, 5);
    assert.equal(report.worker_env.flags.MIXLAB_ADMIN_DOCKER_MVP_MODE, "off");
    assert.ok(commands.some((command) => command.includes("docker/admin-runtime.Dockerfile")));
    assert.ok(commands.some((command) => command.includes("docker/admin-web.Dockerfile")));
    assert.ok(commands.some((command) => command.includes("compose") && command.includes("up")));
    assert.ok(commands.some((command) => command.includes("compose") && command.includes("down")));
    assert.ok(report.summary.docker_upload_blockers.includes("local-smoke-not-nas-live-evidence"));
    assert.deepEqual(report.summary.local_smoke_blockers, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("local Docker smoke command only fails blocked reports when require-pass mode is enabled", async () => {
  const blockedReport = await runAdminDockerLocalSmoke({
    cwd: process.cwd(),
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test",
    commandRunner: async (command, args) => commandResult({
      command,
      args,
      ok: false,
      message: "docker command not found"
    })
  });

  assert.equal(shouldFailAdminDockerLocalSmokeCommand(blockedReport, {}), false);
  assert.equal(shouldFailAdminDockerLocalSmokeCommand(blockedReport, {
    MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_REQUIRE_PASS: "1"
  }), true);

  const passedReport = {
    ...blockedReport,
    local_smoke_passed: true
  };

  assert.equal(shouldFailAdminDockerLocalSmokeCommand(passedReport, {
    MIXLAB_ADMIN_DOCKER_LOCAL_SMOKE_REQUIRE_PASS: "1"
  }), false);
});
