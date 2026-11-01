#!/usr/bin/env node
/**
 * Stage a MixLab Cutter release and its update manifest.
 *
 * This script intentionally does NOT update LATEST*.txt. LATEST is promoted only
 * after Mac review and the real upgrade/update acceptance pass.
 *
 * Usage:
 *   node scripts/dev/publish-cutter-release.mjs \
 *     --version 0.18.28 \
 *     --installer-path "/path/MixLab Cutter_0.18.28_x64-setup.exe" \
 *     --notes-file docs/handoff/RELEASE-0.18.28.md \
 *     --dist-root "/Volumes/MixLab/安装包/MixLab Cutter" \
 *     --commit <sha>
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

function fail(message) {
  console.error("publish-cutter-release: " + message);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) fail("unexpected argument: " + key);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) fail("missing value for " + key);
    out[key.slice(2)] = value;
    i += 1;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const version = String(args.version || "").trim();
const installerPath = path.resolve(String(args["installer-path"] || ""));
const distRoot = path.resolve(String(args["dist-root"] || ""));
if (!/^\d+\.\d+\.\d+$/.test(version)) fail("--version must be semver, e.g. 0.18.28");
if (!distRoot) fail("--dist-root is required");
if (!args["notes-file"]) fail("--notes-file is required");
const installer = await stat(installerPath).catch(() => null);
if (!installer?.isFile()) fail("installer not found: " + installerPath);
const installerName = path.basename(installerPath);
if (!installerName.toLowerCase().endsWith(".exe")) fail("installer must be an .exe");
const notes = (await readFile(path.resolve(args["notes-file"]), "utf8")).trim();
if (!notes) fail("notes file is empty");
const digest = createHash("sha256").update(await readFile(installerPath)).digest("hex");
const sizeBytes = installer.size;
const publishedAt = args["published-at"] || new Date().toISOString();
const versionDir = path.join(distRoot, version);
const versionInstaller = path.join(versionDir, installerName);
const rootInstaller = path.join(distRoot, installerName);
const manifestPath = path.join(distRoot, "update.json");

if (args["dry-run"] !== undefined) {
  console.log(JSON.stringify({ ok: true, dry_run: true, version, installerName, sha256: digest, size_bytes: sizeBytes }, null, 2));
  process.exit(0);
}

await mkdir(versionDir, { recursive: true });
await copyFile(installerPath, versionInstaller);
await copyFile(installerPath, rootInstaller);

// Installer must live next to update.json because the Phase 1 updater resolves
// manifest.installer relative to the manifest directory.
if (path.dirname(rootInstaller) !== distRoot) fail("root installer is not next to update.json");

await writeFile(
  path.join(versionDir, "SHA256SUMS.txt"),
  digest + "  " + installerName + "\n",
  "utf8"
);

const manifest = {
  schema_version: "1.0",
  version,
  min_supported_version: String(args["min-supported-version"] || "0.18.20"),
  installer: installerName,
  sha256: digest,
  size_bytes: sizeBytes,
  release_notes: notes.length > 12000 ? notes.slice(0, 12000) + "\n…" : notes,
  published_at: publishedAt,
  commit: String(args.commit || "").trim()
};
const tempManifest = manifestPath + ".tmp-" + process.pid;
await writeFile(tempManifest, JSON.stringify(manifest, null, 2) + "\n", "utf8");
await rename(tempManifest, manifestPath);

console.log(JSON.stringify({
  ok: true,
  version,
  installerName,
  installer_path: versionInstaller,
  root_installer_path: rootInstaller,
  update_manifest: manifestPath,
  sha256: digest,
  size_bytes: sizeBytes,
  latests_unchanged: true
}, null, 2));
