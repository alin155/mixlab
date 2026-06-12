import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVIDENCE_KIT_DIR } from "./package-evidence-kit.ts";
import { TARGET_EVIDENCE_KIT_ARTIFACT_NAME } from "./target-evidence.ts";

interface EvidenceKitManifestFile {
  path: unknown;
  sha256: unknown;
  size_bytes: unknown;
  executable: unknown;
}

interface EvidenceKitManifest {
  schema_version?: unknown;
  artifact_name?: unknown;
  generated_by?: unknown;
  source_commit_sha?: unknown;
  github_actions_run_url?: unknown;
  files?: unknown;
}

export interface EvidenceKitManifestValidationReport {
  ok: boolean;
  errors: string[];
  manifest_path: string;
  file_count: number;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function toPortablePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function isPortableRelativePath(value: string): boolean {
  if (value.length === 0 || value.startsWith("/") || value.includes("\\") || /^[A-Za-z]:/.test(value)) {
    return false;
  }

  return value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

async function collectFiles(rootDir: string, currentDir = rootDir): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(rootDir, entryPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(toPortablePath(path.relative(rootDir, entryPath)));
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function parseManifest(rawManifest: string, manifestPath: string, errors: string[]): EvidenceKitManifest | null {
  try {
    const manifest = JSON.parse(rawManifest) as EvidenceKitManifest;
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      errors.push(`${manifestPath}: MANIFEST.json must contain a JSON object`);
      return null;
    }

    return manifest;
  } catch {
    errors.push(`${manifestPath}: MANIFEST.json is not valid JSON`);
    return null;
  }
}

export async function validateEvidenceKitManifest(
  kitDir = EVIDENCE_KIT_DIR
): Promise<EvidenceKitManifestValidationReport> {
  const manifestPath = path.join(kitDir, "MANIFEST.json");
  const errors: string[] = [];
  let manifestRaw = "";

  try {
    manifestRaw = await readFile(manifestPath, "utf8");
  } catch {
    return {
      ok: false,
      errors: [`${manifestPath}: MANIFEST.json is missing`],
      manifest_path: manifestPath,
      file_count: 0
    };
  }

  const manifest = parseManifest(manifestRaw, manifestPath, errors);
  if (!manifest) {
    return {
      ok: false,
      errors,
      manifest_path: manifestPath,
      file_count: 0
    };
  }

  if (manifest.schema_version !== 1) {
    errors.push("MANIFEST.json schema_version must be 1");
  }
  if (manifest.artifact_name !== TARGET_EVIDENCE_KIT_ARTIFACT_NAME) {
    errors.push(`MANIFEST.json artifact_name must be ${TARGET_EVIDENCE_KIT_ARTIFACT_NAME}`);
  }
  if (manifest.generated_by !== "npm run package:evidence-kit") {
    errors.push("MANIFEST.json generated_by must be npm run package:evidence-kit");
  }
  if (typeof manifest.source_commit_sha !== "string") {
    errors.push("MANIFEST.json source_commit_sha must be a string");
  }
  if (typeof manifest.github_actions_run_url !== "string") {
    errors.push("MANIFEST.json github_actions_run_url must be a string");
  }
  if (!Array.isArray(manifest.files)) {
    errors.push("MANIFEST.json files must be an array");
  }

  const manifestFiles = Array.isArray(manifest.files)
    ? manifest.files as EvidenceKitManifestFile[]
    : [];
  const listedPaths = new Set<string>();

  for (const [index, file] of manifestFiles.entries()) {
    const prefix = `MANIFEST.json files[${index}]`;
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof file.path !== "string" || !isPortableRelativePath(file.path)) {
      errors.push(`${prefix}.path must be a portable relative path`);
      continue;
    }
    if (file.path === "MANIFEST.json") {
      errors.push("MANIFEST.json must not list itself");
    }
    if (listedPaths.has(file.path)) {
      errors.push(`MANIFEST.json contains duplicate file path: ${file.path}`);
    }
    listedPaths.add(file.path);

    if (typeof file.sha256 !== "string" || !SHA256_PATTERN.test(file.sha256)) {
      errors.push(`${prefix}.sha256 must be a lowercase 64-character sha256 hex digest`);
    }
    if (!Number.isInteger(file.size_bytes) || Number(file.size_bytes) < 0) {
      errors.push(`${prefix}.size_bytes must be a non-negative integer`);
    }
    if (typeof file.executable !== "boolean") {
      errors.push(`${prefix}.executable must be a boolean`);
    }

    const filePath = path.join(kitDir, ...file.path.split("/"));
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        errors.push(`${file.path} must be a file`);
        continue;
      }
      if (file.size_bytes !== fileStat.size) {
        errors.push(`${file.path} size_bytes does not match the packaged file`);
      }
      if (file.executable !== ((fileStat.mode & 0o111) !== 0)) {
        errors.push(`${file.path} executable flag does not match the packaged file`);
      }
      if (typeof file.sha256 === "string" && SHA256_PATTERN.test(file.sha256)) {
        const actualSha256 = await sha256File(filePath);
        if (file.sha256 !== actualSha256) {
          errors.push(`${file.path} sha256 does not match the packaged file`);
        }
      }
    } catch {
      errors.push(`${file.path} is listed in MANIFEST.json but missing from the evidence kit`);
    }
  }

  let actualFiles: string[] = [];
  try {
    actualFiles = await collectFiles(kitDir);
  } catch {
    errors.push(`${kitDir}: evidence kit directory is not readable`);
  }

  const expectedActualFiles = new Set(["MANIFEST.json", ...listedPaths]);
  for (const actualFile of actualFiles) {
    if (!expectedActualFiles.has(actualFile)) {
      errors.push(`${actualFile} exists in the evidence kit but is not listed in MANIFEST.json`);
    }
  }
  for (const listedPath of listedPaths) {
    if (!actualFiles.includes(listedPath)) {
      errors.push(`${listedPath} is listed in MANIFEST.json but was not found during directory scan`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    manifest_path: manifestPath,
    file_count: manifestFiles.length
  };
}

async function main(): Promise<void> {
  const [, , kitDir = EVIDENCE_KIT_DIR] = process.argv;
  const report = await validateEvidenceKitManifest(kitDir);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
