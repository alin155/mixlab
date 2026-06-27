import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { validateNasDockerComposeStatic } from "./nas-docker-compose-static.ts";

test("NAS Docker compose static validation accepts the deployment files", async () => {
  const result = await validateNasDockerComposeStatic();

  assert.deepEqual(result, {
    ok: true,
    errors: [],
    compose_path: "deploy/nas/mixlab/docker-compose.yml",
    env_example_path: "deploy/nas/mixlab/.env.example"
  });
});

test("NAS Docker deployment docs preserve MVP v0.1 disabled-worker staging guidance", async () => {
  const deploymentDoc = await readFile("docs/deployment/m19-nas-docker.md", "utf8");

  assert.match(deploymentDoc, /Admin Docker MVP v0\.1/);
  assert.match(deploymentDoc, /MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0/);
  assert.match(deploymentDoc, /MIXLAB_ENABLE_READY_PUBLISH_WORKER=0/);
  assert.match(deploymentDoc, /MIXLAB_ADMIN_DOCKER_MVP_MODE=v0\.1/);
  assert.match(deploymentDoc, /MIXLAB_ADMIN_LIBRARY_ROOT=\/data\/PublicLibrary/);
  assert.match(deploymentDoc, /Leave `DASHSCOPE_API_KEY` blank for the first MVP v0\.1 staging run/);
  assert.match(deploymentDoc, /Required only for a separately approved controlled preprocess canary/);
  assert.match(deploymentDoc, /current ready count remains `10471`/);
  assert.match(deploymentDoc, /current Cutter index\s+remains `v010471`/);
  assert.match(deploymentDoc, /Do not add or approve a source video/);
  assert.match(deploymentDoc, /Do not.*enable workers.*publish\s+ready indexes/s);
  assert.doesNotMatch(deploymentDoc, /`MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER`\s*\|\s*`1`/);
  assert.doesNotMatch(deploymentDoc, /`MIXLAB_ENABLE_READY_PUBLISH_WORKER`\s*\|\s*`1`/);
  assert.doesNotMatch(deploymentDoc, /^6\. Fill `DASHSCOPE_API_KEY`\./m);
  assert.doesNotMatch(deploymentDoc, /Confirm worker output appears under `\.mixlab-library\/`/);
  assert.doesNotMatch(deploymentDoc, /Confirm `current\.json` exists after ready publication/);
});

test("NAS Docker compose static validation rejects drift from target deployment contract", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mixlab-nas-compose-static-"));
  const composePath = path.join(tempRoot, "docker-compose.yml");
  const envPath = path.join(tempRoot, ".env.example");
  const compose = await readFile("deploy/nas/mixlab/docker-compose.yml", "utf8");
  const env = await readFile("deploy/nas/mixlab/.env.example", "utf8");

  await writeFile(
    composePath,
    compose
      .replace("MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL: ${MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL:-25}", "")
      .replaceAll("MIXLAB_ADMIN_DOCKER_MVP_MODE: ${MIXLAB_ADMIN_DOCKER_MVP_MODE:-v0.1}", "MIXLAB_ADMIN_DOCKER_MVP_MODE: off")
      .replace("MIXLAB_PREPROCESS_LIBRARY_ROOT: /data/PublicLibrary", "")
      .replace("MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: ${MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER:-0}", "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: ${MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER:-1}")
      .replace("MIXLAB_ENABLE_READY_PUBLISH_WORKER: ${MIXLAB_ENABLE_READY_PUBLISH_WORKER:-0}", "MIXLAB_ENABLE_READY_PUBLISH_WORKER: ${MIXLAB_ENABLE_READY_PUBLISH_WORKER:-1}")
      .replace('command: ["npm", "run", "worker:admin-loop"]', 'command: ["npm", "run", "server:admin-api"]'),
    "utf8"
  );
  await writeFile(
    envPath,
    env
      .replace("MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1", "MIXLAB_ADMIN_DOCKER_MVP_MODE=off")
      .replace("MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL=25", "MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL=1")
      .replace("MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=0", "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=1")
      .replace("MIXLAB_ENABLE_READY_PUBLISH_WORKER=0", "MIXLAB_ENABLE_READY_PUBLISH_WORKER=1")
      .replace("MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT=92", "MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT=99")
      .replace("DASHSCOPE_API_KEY=", "DASHSCOPE_API_KEY=sk-should-not-be-in-example"),
    "utf8"
  );

  const result = await validateNasDockerComposeStatic({
    composePath,
    envExamplePath: envPath
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /admin-worker must use the mounted \/data\/PublicLibrary root/);
  assert.match(result.errors.join("\n"), /admin-api must default to Docker MVP mode v0\.1/);
  assert.match(result.errors.join("\n"), /admin-worker must default to Docker MVP mode v0\.1/);
  assert.match(result.errors.join("\n"), /\.env\.example MIXLAB_ADMIN_DOCKER_MVP_MODE must be "v0\.1"/);
  assert.match(result.errors.join("\n"), /admin-worker standalone workers must default disabled/);
  assert.match(result.errors.join("\n"), /admin-worker must depend on admin-api and run worker:admin-loop/);
  assert.match(result.errors.join("\n"), /\.env\.example MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL must be "25"/);
  assert.match(result.errors.join("\n"), /\.env\.example MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER must be "0"/);
  assert.match(result.errors.join("\n"), /\.env\.example MIXLAB_ENABLE_READY_PUBLISH_WORKER must be "0"/);
  assert.match(result.errors.join("\n"), /\.env\.example MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT must be "92"/);
  assert.match(result.errors.join("\n"), /\.env\.example DASHSCOPE_API_KEY must be blank/);
});

test("NAS Docker compose static validation rejects externally exposed runtime services", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "mixlab-nas-compose-ports-"));
  const composePath = path.join(tempRoot, "docker-compose.yml");
  const envPath = path.join(tempRoot, ".env.example");
  const compose = await readFile("deploy/nas/mixlab/docker-compose.yml", "utf8");
  const env = await readFile("deploy/nas/mixlab/.env.example", "utf8");

  await writeFile(
    composePath,
    compose
      .replace(
        "    volumes:\n      - ${PUBLIC_LIBRARY_HOST_PATH}:/data/PublicLibrary\n    healthcheck:",
        "    ports:\n      - \"3889:3889\"\n    volumes:\n      - ${PUBLIC_LIBRARY_HOST_PATH}:/data/PublicLibrary\n    healthcheck:"
      )
      .replace(
        "  admin-worker:\n    image: ghcr.io/alin155/mixlab-admin-runtime:${MIXLAB_IMAGE_TAG:-latest}\n    restart: unless-stopped\n    depends_on:\n      - admin-api\n    env_file:\n      - .env\n    environment:",
        "  admin-worker:\n    image: ghcr.io/alin155/mixlab-admin-runtime:${MIXLAB_IMAGE_TAG:-latest}\n    restart: unless-stopped\n    depends_on:\n      - admin-api\n    env_file:\n      - .env\n    expose:\n      - \"3889\"\n    environment:"
      ),
    "utf8"
  );
  await writeFile(envPath, env, "utf8");

  const result = await validateNasDockerComposeStatic({
    composePath,
    envExamplePath: envPath
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /admin-api must not publish host ports/);
  assert.match(result.errors.join("\n"), /admin-worker must not publish host ports/);
});
