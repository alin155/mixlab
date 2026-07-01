import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runAdminDockerNasReturnedEvidencePrecheck } from "./admin-docker-nas-returned-evidence-precheck.ts";
import { runAdminDockerNasUgosReturnedEvidence } from "./admin-docker-nas-ugos-returned-evidence.ts";
import { runAdminWorkerEnvProof } from "./admin-worker-env-proof.ts";

const IMAGE_TAG = "0636039e0fc601af83b88cff9140bf2db8b6fec1";
const RUNTIME_IMAGE = `ghcr.io/alin155/mixlab-admin-runtime:${IMAGE_TAG}`;
const WEB_IMAGE = `ghcr.io/alin155/mixlab-admin-web:${IMAGE_TAG}`;

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
    msg: "ok",
    data
  };
}

function container(id: string, name: string, image: string): Record<string, unknown> {
  const split = image.split(":");
  return {
    containerId: id,
    containerName: name,
    imageName: split.slice(0, -1).join(":"),
    imageVersion: split.at(-1),
    tag: image
  };
}

function fakeFetch(input: {
  workerEnv?: Array<Record<string, string>>;
  diskUsage?: number;
} = {}): typeof fetch {
  const workerEnv = input.workerEnv ?? [
    { variable: "MIXLAB_ADMIN_DOCKER_MVP_MODE", price: "off" },
    { variable: "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER", price: "0" },
    { variable: "MIXLAB_ENABLE_READY_PUBLISH_WORKER", price: "0" },
    { variable: "MIXLAB_ADMIN_LIBRARY_ROOT", price: "/data/PublicLibrary" },
    { variable: "MIXLAB_PREPROCESS_LIBRARY_ROOT", price: "/data/PublicLibrary" },
    { variable: "DASHSCOPE_API_KEY", price: "should-not-be-written" }
  ];

  return async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/ugreen/v1/docker/container/ContainerListV2")) {
      return jsonResponse(envelope({
        result: [
          container("web", "mixlab-server-admin-web-1", WEB_IMAGE),
          container("api", "mixlab-server-admin-api-1", RUNTIME_IMAGE),
          container("worker", "mixlab-server-admin-worker-1", RUNTIME_IMAGE)
        ],
        total: 3
      }));
    }

    if (parsed.pathname.endsWith("/ugreen/v1/docker/container/GetContainerById")) {
      const id = parsed.searchParams.get("containerId");
      if (id === "worker") {
        return jsonResponse(envelope({
          ...container("worker", "mixlab-server-admin-worker-1", RUNTIME_IMAGE),
          environmentVariables: workerEnv
        }));
      }
      if (id === "api") {
        return jsonResponse(envelope(container("api", "mixlab-server-admin-api-1", RUNTIME_IMAGE)));
      }
      return jsonResponse(envelope(container("web", "mixlab-server-admin-web-1", WEB_IMAGE)));
    }

    if (parsed.pathname.endsWith("/api/admin/library/status")) {
      return jsonResponse({
        ok: true,
        data: {
          root_path: "/data/PublicLibrary",
          disk_total_bytes: 1000,
          disk_available_bytes: 350
        }
      });
    }

    if (parsed.pathname.endsWith("/api/admin/dashboard/metrics")) {
      return jsonResponse({
        ok: true,
        data: {
          runtime_load: {
            disk: {
              usage_percent: input.diskUsage ?? 65
            }
          }
        }
      });
    }

    return new Response("not found", { status: 404 });
  };
}

test("UGOS returned-evidence collector writes sanitized precheck-ready files", async () => {
  const outputParent = await mkdtemp(path.join(os.tmpdir(), "mixlab-ugos-returned-"));
  const report = await runAdminDockerNasUgosReturnedEvidence({
    ugos_base_url: "http://192.168.1.27:9999",
    admin_live_base_url: "http://192.168.1.27:18080",
    output_parent_dir: outputParent,
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test",
    fetchImpl: fakeFetch()
  });

  assert.equal(report.result.status, "generated");
  assert.equal(report.push_execution_allowed, false);
  assert.equal(report.docker_deploy_allowed, false);
  assert.equal(report.docker_runtime_touched, false);
  assert.equal(report.observations.image_tag, IMAGE_TAG);
  assert.equal(report.observations.disk_usage_percent, 65);

  const returnedDir = report.artifacts?.returned_dir ?? "";
  const files = (await readdir(returnedDir)).sort();
  assert.deepEqual(files, [
    "MANIFEST.txt",
    "README.md",
    "admin-docker-current.env",
    "admin-docker-current.inspect.json",
    "admin-docker-disk-proof.json",
    "admin-worker.env",
    "admin-worker.inspect.json"
  ]);

  const currentInspect = await readFile(path.join(returnedDir, "admin-docker-current.inspect.json"), "utf8");
  const workerInspect = await readFile(path.join(returnedDir, "admin-worker.inspect.json"), "utf8");
  assert.doesNotMatch(currentInspect, /Env/);
  assert.doesNotMatch(workerInspect, /DASHSCOPE|API_KEY|should-not-be-written/);
  assert.match(workerInspect, /MIXLAB_PREPROCESS_LIBRARY_ROOT=\/data\/PublicLibrary/);

  const precheck = await runAdminDockerNasReturnedEvidencePrecheck({
    returned_dir: returnedDir
  });
  assert.equal(precheck.precheck_passed, true);
});

test("UGOS returned-evidence collector preserves missing worker env values for worker proof blockers", async () => {
  const outputParent = await mkdtemp(path.join(os.tmpdir(), "mixlab-ugos-returned-missing-"));
  const report = await runAdminDockerNasUgosReturnedEvidence({
    ugos_base_url: "http://192.168.1.27:9999",
    admin_live_base_url: "http://192.168.1.27:18080",
    output_parent_dir: outputParent,
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test",
    fetchImpl: fakeFetch({
      workerEnv: [
        { variable: "MIXLAB_ADMIN_LIBRARY_ROOT", price: "/data/PublicLibrary" },
        { variable: "DASHSCOPE_API_KEY", price: "should-not-be-written" }
      ],
      diskUsage: 98
    })
  });

  assert.equal(report.result.status, "generated");
  assert.equal(report.observations.worker_allowlisted_env.MIXLAB_PREPROCESS_LIBRARY_ROOT, "");
  assert.equal(report.observations.disk_usage_percent, 98);

  const returnedDir = report.artifacts?.returned_dir ?? "";
  const workerEnv = await readFile(path.join(returnedDir, "admin-worker.env"), "utf8");
  const workerInspect = await readFile(path.join(returnedDir, "admin-worker.inspect.json"), "utf8");
  assert.match(workerEnv, /MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=\n/);
  assert.match(workerInspect, /MIXLAB_PREPROCESS_LIBRARY_ROOT="/);
  assert.doesNotMatch(workerInspect, /DASHSCOPE|API_KEY|should-not-be-written/);

  const precheck = await runAdminDockerNasReturnedEvidencePrecheck({
    returned_dir: returnedDir
  });
  assert.equal(precheck.precheck_passed, true);

  const workerProof = await runAdminWorkerEnvProof({
    env_file_path: path.join(returnedDir, "admin-worker.env"),
    inspect_json_path: path.join(returnedDir, "admin-worker.inspect.json"),
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test",
    output_dir: outputParent
  });
  assert.equal(workerProof.proof_accepted, false);
  assert.ok(workerProof.summary.upload_blockers.includes("env-file-worker-flags-disabled"));
  assert.ok(workerProof.summary.upload_blockers.includes("inspect-worker-flags-disabled"));
  assert.ok(workerProof.summary.upload_blockers.includes("admin-worker-library-roots"));
});
