#!/bin/sh
set -eu

KIT_DIR="${1:-.}"

if [ ! -d "$KIT_DIR" ]; then
  echo "Evidence kit directory is missing: $KIT_DIR" >&2
  exit 1
fi

if [ ! -f "$KIT_DIR/MANIFEST.json" ]; then
  echo "MANIFEST.json is missing from $KIT_DIR" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required for this manifest self-check. Copy the kit back to the repository and run npm run validate:evidence-kit-manifest if node is unavailable here." >&2
  exit 2
fi

node - "$KIT_DIR" <<'NODE'
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const kitDir = path.resolve(process.argv[2]);
const manifestPath = path.join(kitDir, "MANIFEST.json");
const issues = [];

function issue(message) {
  issues.push(message);
}

function portableRelativePath(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  if (path.isAbsolute(value) || value.includes("\\") || /^[A-Za-z]:/.test(value)) return false;
  return value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function portablePath(value) {
  return value.split(path.sep).join("/");
}

function collectFiles(root, current = root) {
  const files = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(root, entryPath));
    } else if (entry.isFile()) {
      files.push(portablePath(path.relative(root, entryPath)));
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  issue("MANIFEST.json is not valid JSON: " + error.message);
}

if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
  issue("MANIFEST.json must contain a JSON object");
} else {
  if (manifest.schema_version !== 1) issue("MANIFEST.json schema_version must be 1");
  if (manifest.artifact_name !== "mixlab-target-evidence-kit") {
    issue("MANIFEST.json artifact_name must be mixlab-target-evidence-kit");
  }
  if (manifest.generated_by !== "npm run package:evidence-kit") {
    issue("MANIFEST.json generated_by must be npm run package:evidence-kit");
  }
  if (!Array.isArray(manifest.files)) issue("MANIFEST.json files must be an array");

  const listedPaths = new Set();
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  for (const [index, file] of files.entries()) {
    const prefix = "MANIFEST.json files[" + index + "]";
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      issue(prefix + " must be an object");
      continue;
    }
    if (!portableRelativePath(file.path)) {
      issue(prefix + ".path must be a portable relative path");
      continue;
    }
    if (file.path === "MANIFEST.json") issue("MANIFEST.json must not list itself");
    if (listedPaths.has(file.path)) issue("MANIFEST.json contains duplicate file path: " + file.path);
    listedPaths.add(file.path);

    if (typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      issue(prefix + ".sha256 must be a lowercase 64-character sha256 hex digest");
    }
    if (!Number.isInteger(file.size_bytes) || file.size_bytes < 0) {
      issue(prefix + ".size_bytes must be a non-negative integer");
    }
    if (typeof file.executable !== "boolean") issue(prefix + ".executable must be a boolean");

    const filePath = path.join(kitDir, ...file.path.split("/"));
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      issue(file.path + " is listed in MANIFEST.json but missing from the evidence kit");
      continue;
    }

    const stat = fs.statSync(filePath);
    if (file.size_bytes !== stat.size) issue(file.path + " size_bytes does not match the packaged file");
    if (file.executable !== ((stat.mode & 0o111) !== 0)) {
      issue(file.path + " executable flag does not match the packaged file");
    }
    if (/^[a-f0-9]{64}$/.test(String(file.sha256)) && file.sha256 !== sha256File(filePath)) {
      issue(file.path + " sha256 does not match the packaged file");
    }
  }

  const expected = new Set(["MANIFEST.json", ...listedPaths]);
  for (const actualFile of collectFiles(kitDir)) {
    if (!expected.has(actualFile)) {
      issue(actualFile + " exists in the evidence kit but is not listed in MANIFEST.json");
    }
  }
}

if (issues.length > 0) {
  console.log("MixLab evidence kit manifest self-check found " + issues.length + " issue(s):");
  for (const item of issues.slice(0, 100)) console.log("- " + item);
  if (issues.length > 100) console.log("- ... " + (issues.length - 100) + " more");
  process.exit(1);
}

console.log("MixLab evidence kit manifest self-check passed for " + kitDir + ".");
NODE
