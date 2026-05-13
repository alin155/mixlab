import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath: string) {
  return JSON.parse(await readFile(path.join(appRoot, relativePath), "utf8")) as Record<string, unknown>;
}

test("cutter desktop package exposes Windows desktop scripts only", async () => {
  const packageJson = await readJson("package.json");
  assert.equal(packageJson.name, "@mixlab/cutter-desktop");
  assert.deepEqual(Object.keys(packageJson.scripts as Record<string, string>).sort(), [
    "build:sidecar",
    "build:web",
    "dev",
    "tauri:build",
    "tauri:dev"
  ]);
});

test("tauri config embeds cutter web dist and Windows exe installer target", async () => {
  const config = await readJson("src-tauri/tauri.conf.json");
  assert.equal((config.build as Record<string, unknown>).frontendDist, "../../cutter-web/dist");
  assert.equal((config.build as Record<string, unknown>).beforeBuildCommand, undefined);

  const bundle = config.bundle as Record<string, unknown>;
  assert.deepEqual(bundle.targets, ["nsis"]);
  assert.deepEqual(bundle.externalBin, ["binaries/cutter-api-sidecar"]);
  assert.deepEqual(bundle.resources, [
    "binaries/ffmpeg.exe",
    "binaries/ffprobe.exe",
    "resources/default-desktop-config.json"
  ]);
});

test("Windows installer icon asset is present for tauri-build", async () => {
  const icon = await readFile(path.join(appRoot, "src-tauri/icons/icon.ico"));

  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
  assert.equal(icon.readUInt16LE(4), 1);
});

test("tauri capability allows only the cutter api sidecar with config argument", async () => {
  const capability = await readJson("src-tauri/capabilities/default.json");
  const permission = (capability.permissions as unknown[]).find((entry) => {
    return typeof entry === "object" && entry !== null && (entry as Record<string, unknown>).identifier === "shell:allow-spawn";
  }) as Record<string, unknown> | undefined;

  assert.ok(permission);
  assert.deepEqual(permission.allow, [
    {
      name: "binaries/cutter-api-sidecar",
      sidecar: true,
      args: ["--config", { validator: "^[^\\0]+$" }]
    }
  ]);
});
