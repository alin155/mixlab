#!/usr/bin/env node
/**
 * Write the Cutter Phase 1 update manifest (update.json).
 *
 * Usage:
 *   node scripts/dev/write-cutter-update-manifest.mjs \
 *     --version 0.18.27 \
 *     --installer "MixLab Cutter_0.18.27_x64-setup-abc123.exe" \
 *     --sha256 <sha256> \
 *     --size-bytes 59000000 \
 *     --notes-file docs/handoff/RELEASE-0.18.27.md \
 *     --out "/Volumes/MixLab/安装包/MixLab Cutter/update.json"
 */
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

function fail(message) {
  console.error(message);
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
const version = args.version;
const installer = args.installer;
const sha256 = (args.sha256 || "").toLowerCase();
const out = args.out;
if (!version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  fail("--version must be a semver version");
}
if (!installer || path.basename(installer) !== installer || !installer.toLowerCase().endsWith(".exe")) {
  fail("--installer must be a bare .exe filename");
}
if (!/^[0-9a-f]{64}$/.test(sha256)) fail("--sha256 must be 64 hex chars");
if (!out) fail("--out is required");

let sizeBytes = Number(args["size-bytes"] || "0");
let installerSha256 = sha256;
const installerPath = path.resolve(args["installer-path"] || "");
if (args["installer-path"]) {
  const info = await stat(installerPath).catch(() => null);
  if (!info || !info.isFile()) fail("installer path is not a file: " + installerPath);
  if (!sizeBytes) sizeBytes = info.size;
  const digest = createHash("sha256").update(await readFile(installerPath)).digest("hex");
  if (args.sha256 && digest !== installerSha256) {
    fail("sha256 does not match installer file: " + digest);
  }
  installerSha256 = digest;
}
if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) fail("--size-bytes must be a positive integer");

let notes = args.notes || "";
if (args["notes-file"]) {
  notes = await readFile(path.resolve(args["notes-file"]), "utf8");
}
notes = notes.trim();
if (!notes) fail("--notes or --notes-file is required");

const payload = {
  schema_version: "1.0",
  version,
  min_supported_version: args["min-supported-version"] || "0.18.0",
  installer,
  sha256: installerSha256,
  size_bytes: sizeBytes,
  release_notes: notes,
  published_at: args["published-at"] || new Date().toISOString()
};

await writeFile(path.resolve(out), JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ ok: true, out: path.resolve(out), version, installer, sha256: installerSha256, size_bytes: sizeBytes }, null, 2));
