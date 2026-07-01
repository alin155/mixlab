import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runAdminDockerNasReturnedEvidencePrecheck } from "./admin-docker-nas-returned-evidence-precheck.ts";

const IMAGE_TAG = "0636039e0fc601af83b88cff9140bf2db8b6fec1";

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function makeReturnedDir(overrides: Partial<Record<string, string | unknown>> = {}): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mixlab-returned-evidence-"));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "admin-docker-current.env"), String(overrides["admin-docker-current.env"] ?? `MIXLAB_IMAGE_TAG=${IMAGE_TAG}\n`));
  await writeJson(path.join(dir, "admin-docker-current.inspect.json"), overrides["admin-docker-current.inspect.json"] ?? [
    serviceInspect("admin-web", `ghcr.io/alin155/mixlab-admin-web:${IMAGE_TAG}`),
    serviceInspect("admin-api", `ghcr.io/alin155/mixlab-admin-runtime:${IMAGE_TAG}`),
    serviceInspect("admin-worker", `ghcr.io/alin155/mixlab-admin-runtime:${IMAGE_TAG}`)
  ]);
  await writeFile(path.join(dir, "admin-worker.env"), String(overrides["admin-worker.env"] ?? [
    "MIXLAB_ADMIN_DOCKER_MVP_MODE=off",
    "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0",
    "MIXLAB_ENABLE_READY_PUBLISH_WORKER=0"
  ].join("\n")));
  await writeJson(path.join(dir, "admin-worker.inspect.json"), overrides["admin-worker.inspect.json"] ?? [
    {
      Name: "/mixlab-admin-worker-1",
      Config: {
        Image: `ghcr.io/alin155/mixlab-admin-runtime:${IMAGE_TAG}`,
        Env: [
          "MIXLAB_ADMIN_DOCKER_MVP_MODE=off",
          "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0",
          "MIXLAB_ENABLE_READY_PUBLISH_WORKER=0",
          "MIXLAB_ADMIN_LIBRARY_ROOT=/data/PublicLibrary",
          "MIXLAB_PREPROCESS_LIBRARY_ROOT=/data/PublicLibrary"
        ]
      }
    }
  ]);
  await writeJson(path.join(dir, "admin-docker-disk-proof.json"), overrides["admin-docker-disk-proof.json"] ?? {
    schema_version: "1.0",
    mode: "admin-docker-nas-release-inputs-collector",
    expected_library_root: "/data/PublicLibrary",
    thresholds: {
      attention_usage_percent: 87,
      block_usage_percent: 92
    },
    checks: [
      diskCheck("admin-api-library-root", "admin-api", 61),
      diskCheck("admin-worker-library-root", "admin-worker", 62)
    ]
  });
  await writeFile(path.join(dir, "MANIFEST.txt"), String(overrides["MANIFEST.txt"] ?? [
    "schema_version=1.0",
    "mode=admin-docker-nas-release-inputs-collector",
    "collected_at=2026-06-28T00:00:00Z",
    "push_execution_allowed=false",
    "docker_deploy_allowed=false",
    "nas_writes_allowed=false",
    "worker_start_allowed=false",
    "secret_sanitization=sanitized-only",
    "forbidden_full_env=true",
    "forbidden_full_docker_inspect=true",
    "forbidden_secrets=true"
  ].join("\n")));
  await writeFile(path.join(dir, "README.md"), "# returned evidence\n");
  return dir;
}

function serviceInspect(service: string, image: string): unknown {
  return {
    Name: `/mixlab-${service}-1`,
    Config: {
      Image: image,
      Labels: {
        "com.docker.compose.service": service
      }
    }
  };
}

function diskCheck(id: string, service: string, usagePercent: number): unknown {
  return {
    id,
    scope: "container",
    service,
    path: "/data/PublicLibrary",
    filesystem: "/dev/md0",
    total_1k_blocks: 1000,
    used_1k_blocks: 600,
    available_1k_blocks: 400,
    usage_percent: usagePercent
  };
}

function hostDiskCheck(): unknown {
  return {
    id: "host-public-library",
    scope: "host",
    service: "",
    path: "/volume1/MixLab/PublicLibrary",
    filesystem: "/dev/md0",
    total_1k_blocks: 1000,
    used_1k_blocks: 600,
    available_1k_blocks: 400,
    usage_percent: 60
  };
}

test("returned evidence precheck accepts sanitized collector output shape", async () => {
  const report = await runAdminDockerNasReturnedEvidencePrecheck({
    returned_dir: await makeReturnedDir()
  });

  assert.equal(report.precheck_passed, true);
  assert.equal(report.result.status, "pass");
  assert.deepEqual(report.issues, []);
});

test("returned evidence precheck accepts optional host disk proof path", async () => {
  const report = await runAdminDockerNasReturnedEvidencePrecheck({
    returned_dir: await makeReturnedDir({
      "admin-docker-disk-proof.json": {
        schema_version: "1.0",
        mode: "admin-docker-nas-release-inputs-collector",
        expected_library_root: "/data/PublicLibrary",
        thresholds: {
          attention_usage_percent: 87,
          block_usage_percent: 92
        },
        checks: [
          diskCheck("admin-api-library-root", "admin-api", 61),
          diskCheck("admin-worker-library-root", "admin-worker", 62),
          hostDiskCheck()
        ]
      }
    })
  });

  assert.equal(report.precheck_passed, true);
  assert.deepEqual(report.issues, []);
});

test("returned evidence precheck accepts unsafe worker root values as proof-level evidence", async () => {
  const report = await runAdminDockerNasReturnedEvidencePrecheck({
    returned_dir: await makeReturnedDir({
      "admin-worker.inspect.json": [
        {
          Name: "/mixlab-admin-worker-1",
          Config: {
            Image: `ghcr.io/alin155/mixlab-admin-runtime:${IMAGE_TAG}`,
            Env: [
              "MIXLAB_ADMIN_DOCKER_MVP_MODE=",
              "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=1",
              "MIXLAB_ENABLE_READY_PUBLISH_WORKER=1",
              "MIXLAB_ADMIN_LIBRARY_ROOT=/data/PublicLibrary",
              "MIXLAB_PREPROCESS_LIBRARY_ROOT="
            ]
          }
        }
      ]
    })
  });

  assert.equal(report.precheck_passed, true);
  assert.deepEqual(report.issues, []);
});

test("returned evidence precheck requires container disk checks for API and worker", async () => {
  const apiHostCheck = {
    ...hostDiskCheck() as Record<string, unknown>,
    id: "admin-api-library-root"
  };
  const report = await runAdminDockerNasReturnedEvidencePrecheck({
    returned_dir: await makeReturnedDir({
      "admin-docker-disk-proof.json": {
        schema_version: "1.0",
        mode: "admin-docker-nas-release-inputs-collector",
        expected_library_root: "/data/PublicLibrary",
        checks: [
          apiHostCheck,
          diskCheck("admin-worker-library-root", "admin-worker", 62)
        ]
      }
    })
  });

  assert.equal(report.precheck_passed, false);
  assert.ok(report.issues.some((issue) => issue.code === "disk-proof-checks"));
});

test("returned evidence precheck rejects full current inspect env output", async () => {
  const report = await runAdminDockerNasReturnedEvidencePrecheck({
    returned_dir: await makeReturnedDir({
      "admin-docker-current.inspect.json": [
        {
          ...serviceInspect("admin-api", `ghcr.io/alin155/mixlab-admin-runtime:${IMAGE_TAG}`),
          Config: {
            Image: `ghcr.io/alin155/mixlab-admin-runtime:${IMAGE_TAG}`,
            Labels: {
              "com.docker.compose.service": "admin-api"
            },
            Env: ["DASHSCOPE_API_KEY"]
          }
        }
      ]
    })
  });

  assert.equal(report.precheck_passed, false);
  assert.ok(report.issues.some((issue) => issue.code === "returned-file-sensitive-field"));
  assert.ok(report.issues.some((issue) => issue.code === "inspect-env-present"));
});

test("returned evidence precheck rejects unexpected worker env keys", async () => {
  const report = await runAdminDockerNasReturnedEvidencePrecheck({
    returned_dir: await makeReturnedDir({
      "admin-worker.env": [
        "MIXLAB_ADMIN_DOCKER_MVP_MODE=off",
        "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0",
        "MIXLAB_ENABLE_READY_PUBLISH_WORKER=0",
        "MIXLAB_ADMIN_LIBRARY_ROOT=/data/PublicLibrary"
      ].join("\n")
    })
  });

  assert.equal(report.precheck_passed, false);
  assert.ok(report.issues.some((issue) => issue.code === "env-extra-keys"));
});

test("returned evidence precheck rejects unsafe manifest flags", async () => {
  const report = await runAdminDockerNasReturnedEvidencePrecheck({
    returned_dir: await makeReturnedDir({
      "MANIFEST.txt": [
        "schema_version=1.0",
        "mode=admin-docker-nas-release-inputs-collector",
        "push_execution_allowed=true",
        "docker_deploy_allowed=false",
        "nas_writes_allowed=false",
        "worker_start_allowed=false",
        "secret_sanitization=sanitized-only",
        "forbidden_full_env=true",
        "forbidden_full_docker_inspect=true",
        "forbidden_secrets=true"
      ].join("\n")
    })
  });

  assert.equal(report.precheck_passed, false);
  assert.ok(report.issues.some((issue) => issue.code === "manifest-safety-flag"));
});
