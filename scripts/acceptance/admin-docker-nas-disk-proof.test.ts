import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerNasDiskProofReport,
  runAdminDockerNasDiskProof,
  toMarkdown
} from "./admin-docker-nas-disk-proof.ts";

function diskProof(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema_version: "1.0",
    mode: "admin-docker-nas-release-inputs-collector",
    expected_library_root: "/data/PublicLibrary",
    thresholds: {
      attention_usage_percent: 87,
      block_usage_percent: 92
    },
    checks: [
      {
        id: "admin-api-library-root",
        scope: "container",
        service: "admin-api",
        path: "/data/PublicLibrary",
        filesystem: "/dev/md0",
        total_bytes: 1000,
        used_bytes: 600,
        available_bytes: 400,
        usage_percent: 60
      },
      {
        id: "admin-worker-library-root",
        scope: "container",
        service: "admin-worker",
        path: "/data/PublicLibrary",
        filesystem: "/dev/md0",
        total_1k_blocks: 1000,
        used_1k_blocks: 650,
        available_1k_blocks: 350,
        capacity_percent: 65
      },
      {
        id: "host-public-library",
        scope: "host",
        service: "",
        path: "/volume1/MixLab/PublicLibrary",
        filesystem: "/dev/md0",
        total_bytes: 1000,
        used_bytes: 700,
        available_bytes: 300,
        usage_percent: 70
      }
    ],
    ...overrides
  }, null, 2);
}

function report(input: {
  path?: string;
  raw?: string;
} = {}) {
  return buildAdminDockerNasDiskProofReport({
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test",
    disk_proof_json_path: input.path,
    disk_proof_json_raw: input.raw
  });
}

test("NAS disk proof stays blocked when proof JSON is missing", () => {
  const built = report();

  assert.equal(built.proof_accepted, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.result.status, "blocked");
  assert.ok(built.summary.staging_execution_blockers.includes("nas-disk-proof-json-provided"));
  assert.ok(built.summary.staging_execution_blockers.includes("nas-disk-required-container-checks-present"));
  assert.ok(built.collection_instructions.some((item) => item.includes("admin-docker-disk-proof.json")));
});

test("NAS disk proof accepts sanitized df evidence below attention threshold", () => {
  const built = report({
    path: "admin-docker-disk-proof.json",
    raw: diskProof()
  });

  assert.equal(built.proof_accepted, true);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.result.status, "accepted");
  assert.deepEqual(built.summary.staging_execution_blockers, []);
  assert.equal(built.observations.max_usage_percent, 70);
  assert.equal(built.observations.min_available_bytes, 300);
  assert.deepEqual(built.observations.missing_required_checks, []);
  assert.match(toMarkdown(built), /NAS disk proof is accepted/);
});

test("NAS disk proof blocks high usage and wrong Docker library root", () => {
  const built = report({
    path: "admin-docker-disk-proof.json",
    raw: diskProof({
      expected_library_root: "/Volumes/MixLab/PublicLibrary",
      checks: [
        {
          id: "admin-api-library-root",
          scope: "container",
          service: "admin-api",
          path: "/data/PublicLibrary",
          filesystem: "/dev/md0",
          total_bytes: 1000,
          used_bytes: 910,
          available_bytes: 90,
          usage_percent: 91
        },
        {
          id: "admin-worker-library-root",
          scope: "container",
          service: "admin-worker",
          path: "/data/PublicLibrary",
          filesystem: "/dev/md0",
          total_bytes: 1000,
          used_bytes: 930,
          available_bytes: 70,
          usage_percent: 93
        }
      ]
    })
  });

  assert.equal(built.proof_accepted, false);
  assert.ok(built.summary.staging_execution_blockers.includes("nas-disk-library-root-is-docker-root"));
  assert.ok(built.summary.staging_execution_blockers.includes("nas-disk-below-attention-threshold"));
  assert.ok(built.summary.staging_execution_blockers.includes("nas-disk-below-block-threshold"));
  assert.equal(built.observations.max_usage_percent, 93);
});

test("NAS disk proof CLI writes JSON and Markdown", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-nas-disk-proof-"));
  const proofPath = path.join(tempRoot, "admin-docker-disk-proof.json");

  await writeFile(proofPath, `${diskProof()}\n`);

  const built = await runAdminDockerNasDiskProof({
    disk_proof_json_path: proofPath,
    output_dir: tempRoot,
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test"
  });

  assert.equal(built.proof_accepted, true);
  assert.equal(built.artifacts?.json_path, path.join(tempRoot, "admin-docker-nas-disk-proof-20260628T000000Z.json"));
  assert.match(await readFile(built.artifacts?.markdown_path ?? "", "utf8"), /Admin Docker NAS Disk Proof/);
});
