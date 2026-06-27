import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAdminDockerNasImageProofReport,
  runAdminDockerNasImageProof,
  toMarkdown
} from "./admin-docker-nas-image-proof.ts";

const STABLE_TAG = "acf896c6d16ec1503237f3afa854afff60a191b3";

function envFile(tag = STABLE_TAG): string {
  return [
    "PUBLIC_LIBRARY_HOST_PATH=/volume1/MixLab/PublicLibrary",
    `MIXLAB_IMAGE_TAG=${tag}`,
    "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0",
    "MIXLAB_ENABLE_READY_PUBLISH_WORKER=0",
    "DASHSCOPE_API_KEY=secret-that-must-not-appear"
  ].join("\n");
}

function inspectJson(input: {
  tag?: string;
  webTag?: string;
  omit?: string;
} = {}): string {
  const runtimeTag = input.tag ?? STABLE_TAG;
  const webTag = input.webTag ?? runtimeTag;
  const containers = [
    {
      Name: "/mixlab-admin-api-1",
      Config: {
        Image: `ghcr.io/alin155/mixlab-admin-runtime:${runtimeTag}`,
        Labels: {
          "com.docker.compose.service": "admin-api"
        }
      }
    },
    {
      Name: "/mixlab-admin-worker-1",
      Config: {
        Image: `ghcr.io/alin155/mixlab-admin-runtime:${runtimeTag}`,
        Labels: {
          "com.docker.compose.service": "admin-worker"
        }
      }
    },
    {
      Name: "/mixlab-admin-web-1",
      Config: {
        Image: `ghcr.io/alin155/mixlab-admin-web:${webTag}`,
        Labels: {
          "com.docker.compose.service": "admin-web"
        }
      }
    }
  ].filter((container) => container.Config.Labels["com.docker.compose.service"] !== input.omit);

  return JSON.stringify(containers, null, 2);
}

function report(input: {
  env?: string;
  inspect?: string;
} = {}) {
  return buildAdminDockerNasImageProofReport({
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test",
    env_file_path: input.env === undefined ? undefined : "admin-docker-current.env",
    env_file_raw: input.env,
    inspect_json_path: input.inspect === undefined ? undefined : "admin-docker-current.inspect.json",
    inspect_json_raw: input.inspect
  });
}

test("NAS image proof stays blocked and gives collection instructions when evidence is missing", () => {
  const built = report();

  assert.equal(built.proof_accepted, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.result.status, "blocked");
  assert.ok(built.summary.release_input_blockers.includes("nas-env-file-provided"));
  assert.ok(built.summary.release_input_blockers.includes("nas-inspect-json-provided"));
  assert.ok(built.collection_instructions.some((item) => item.includes("admin-docker-nas-release-inputs-collector.sh")));
  assert.ok(built.collection_instructions.some((item) => item.includes("grep '^MIXLAB_IMAGE_TAG='")));
  assert.equal(built.collection_instructions.some((item) => item.includes("cp .env")), false);
  assert.equal(built.collection_instructions.some((item) => item.includes("{{json .Config.Env}}")), false);
  assert.equal(built.collection_instructions.some((item) => item.includes("DASHSCOPE_API_KEY")), false);
});

test("NAS image proof accepts a stable current tag for current and rollback inputs", () => {
  const built = report({
    env: envFile(),
    inspect: inspectJson()
  });

  assert.equal(built.proof_accepted, true);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.result.status, "accepted");
  assert.deepEqual(built.summary.release_input_blockers, []);
  assert.equal(built.release_inputs.current_image_tag, STABLE_TAG);
  assert.equal(built.release_inputs.rollback_image_tag, STABLE_TAG);
  assert.match(built.release_inputs.workflow_inputs, new RegExp(`current_image_tag=${STABLE_TAG}`));
  assert.equal(built.observations.services.length, 3);
  assert.equal(JSON.stringify(built).includes("DASHSCOPE_API_KEY"), false);
  assert.equal(JSON.stringify(built).includes("secret-that-must-not-appear"), false);
});

test("NAS image proof blocks latest because GitHub push updates latest", () => {
  const built = report({
    env: envFile("latest"),
    inspect: inspectJson({ tag: "latest" })
  });

  assert.equal(built.proof_accepted, false);
  assert.ok(built.summary.release_input_blockers.includes("current-tag-stable-for-rollback"));
  assert.equal(built.release_inputs.current_image_tag, "");
});

test("NAS image proof blocks inconsistent service tags", () => {
  const built = report({
    env: envFile(),
    inspect: inspectJson({ webTag: "different-tag" })
  });

  assert.equal(built.proof_accepted, false);
  assert.ok(built.summary.release_input_blockers.includes("admin-image-tags-consistent"));
  assert.deepEqual(built.observations.inconsistent_tags, [STABLE_TAG, "different-tag"]);
});

test("NAS image proof blocks when a required service is missing", () => {
  const built = report({
    env: envFile(),
    inspect: inspectJson({ omit: "admin-worker" })
  });

  assert.equal(built.proof_accepted, false);
  assert.ok(built.summary.release_input_blockers.includes("all-admin-services-present"));
  assert.deepEqual(built.observations.missing_services, ["admin-worker"]);
});

test("NAS image proof markdown and CLI expose release input outputs", async () => {
  const markdown = toMarkdown(report({
    env: envFile(),
    inspect: inspectJson()
  }));

  assert.match(markdown, /Admin Docker NAS Image Proof/);
  assert.match(markdown, new RegExp(`current_image_tag: ${STABLE_TAG}`));
  assert.match(markdown, /Docker deploy allowed: no/);

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-nas-image-proof-"));
  const envPath = path.join(tempRoot, "admin-docker-current.env");
  const inspectPath = path.join(tempRoot, "admin-docker-current.inspect.json");

  await writeFile(envPath, envFile());
  await writeFile(inspectPath, inspectJson());

  const built = await runAdminDockerNasImageProof({
    env_file_path: envPath,
    inspect_json_path: inspectPath,
    output_dir: tempRoot,
    generated_at: "2026-06-27T00:00:00.000Z",
    command: "test"
  });

  assert.equal(built.proof_accepted, true);
  assert.equal(built.artifacts?.json_path, path.join(tempRoot, "admin-docker-nas-image-proof-20260627T000000Z.json"));
  assert.match(await readFile(built.artifacts?.markdown_path ?? "", "utf8"), /workflow inputs/);
});
