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
  assert.equal(packageJson.version, "0.18.5");
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
  assert.equal(config.version, "0.18.5");
  assert.equal((config.build as Record<string, unknown>).frontendDist, "../../cutter-web/dist");
  assert.equal((config.build as Record<string, unknown>).beforeBuildCommand, undefined);

  const bundle = config.bundle as Record<string, unknown>;
  assert.deepEqual(bundle.targets, ["nsis"]);
  assert.deepEqual(bundle.icon, [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.ico"
  ]);
  assert.deepEqual(bundle.externalBin, ["binaries/cutter-api-sidecar"]);
  assert.deepEqual(bundle.resources, [
    "binaries/cutter-api-sidecar-x86_64-pc-windows-msvc.exe",
    "binaries/ffmpeg.exe",
    "binaries/ffprobe.exe",
    "resources/default-desktop-config.json"
  ]);

  const windows = bundle.windows as Record<string, unknown>;
  const nsis = windows.nsis as Record<string, unknown>;
  assert.equal(nsis.installerIcon, "icons/icon.ico");
  assert.equal(nsis.uninstallerIcon, "icons/icon.ico");
});

test("Windows installer icon asset is present for tauri-build", async () => {
  const icon = await readFile(path.join(appRoot, "src-tauri/icons/icon.ico"));

  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
  assert.ok(icon.readUInt16LE(4) >= 4);
});

test("Windows app icon png assets are present for executable and shortcut resources", async () => {
  for (const relativePath of [
    "src-tauri/icons/32x32.png",
    "src-tauri/icons/128x128.png",
    "src-tauri/icons/128x128@2x.png"
  ]) {
    const icon = await readFile(path.join(appRoot, relativePath));
    assert.equal(icon.subarray(1, 4).toString("ascii"), "PNG");
  }
});

test("Windows desktop host is GUI-subsystem and owns sidecar and directory process launches", async () => {
  const source = await readFile(path.join(appRoot, "src-tauri/src/main.rs"), "utf8");

  assert.match(source, /windows_subsystem\s*=\s*"windows"/);
  assert.match(source, /CREATE_NO_WINDOW/);
  assert.match(source, /MIXLAB_FFMPEG_PATH/);
  assert.match(source, /MIXLAB_FFPROBE_PATH/);
  assert.match(source, /fn desktop_app_version/);
  assert.match(source, /desktop_host_log/);
  assert.match(source, /GET \/health HTTP\/1\.1/);
  assert.doesNotMatch(source, /tcp_endpoint_is_reachable/);
  assert.match(source, /parent\.join\("resources"\)\.join\("binaries"\)\.join\(SIDECAR_EXECUTABLE_NAME\)/);
  assert.match(source, /fn desktop_start_engine/);
  assert.match(source, /fn desktop_open_directory/);
  assert.match(source, /desktop_start_engine,\s*\n\s*desktop_open_directory/);
});

test("tauri capability keeps sidecar and directory launch behind native commands", async () => {
  const capability = await readJson("src-tauri/capabilities/default.json");
  assert.deepEqual(capability.permissions, ["core:default", "dialog:default"]);

  const packageJson = await readJson("package.json");
  assert.equal((packageJson.dependencies as Record<string, string>)["@tauri-apps/plugin-shell"], undefined);
  assert.equal((packageJson.dependencies as Record<string, string>)["@tauri-apps/plugin-opener"], undefined);
});
