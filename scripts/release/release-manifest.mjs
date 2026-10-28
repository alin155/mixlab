#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPO_KEYS,
  buildManifest,
  formatJson,
  hashTree,
  loadVersionsConfig,
  parseArgs,
  parseContractVersion,
  renderManifestMarkdown,
  resolveRepoPaths,
  repoSnapshot,
  runGit,
  sha256Text,
  writeFileSafe
} from "./lib.mjs";

function printHelp() {
  console.log("MixLab release manifest generator (read-only; never publishes)");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/release/release-manifest.mjs --dry-run");
  console.log("  node scripts/release/release-manifest.mjs --check");
  console.log("  node scripts/release/release-manifest.mjs --out-dir dist/release");
  console.log("");
  console.log("Options:");
  console.log("  --dry-run                print JSON + markdown, write nothing");
  console.log("  --check                  validate versions/trains/contract and exit non-zero on errors");
  console.log("  --json                   print JSON only");
  console.log("  --out-dir <dir>          write release-manifest.json and release-manifest.md (non dry-run)");
  console.log("  --release-train <name>   weekly | biweekly | monthly (default from versions.json)");
  console.log("  --now <iso>              deterministic generated_at timestamp");
  console.log("  --repo-mixlab <path>     override repo root");
  console.log("  --repo-cutter <path>     override repo root");
  console.log("  --repo-smart-cutter <path> override repo root");
}

function annotateArtifactTracking(manifest, repoPaths, runReadOnlyGit) {
  const trackedCache = new Map();

  for (const product of manifest.products) {
    const repoPath = repoPaths[product.repo];
    if (!trackedCache.has(product.repo)) {
      const listed = runReadOnlyGit(repoPath, ["ls-files"]);
      trackedCache.set(product.repo, listed.ok ? new Set(listed.stdout.split("\n").filter(Boolean)) : new Set());
    }

    const tracked = trackedCache.get(product.repo);
    const sample = product.artifact_files_sample || [];
    const trackedSample = sample.filter((file) => tracked.has(file.path));
    product.artifact_tracked_sample_count = trackedSample.length;
    product.artifact_sample_count = sample.length;

    if (sample.length > 0 && trackedSample.length === 0) {
      manifest.checks.warnings.push(
        product.product + ": sampled build artifacts are not tracked in git (likely ignored dist); ensure they are rebuilt from the recorded HEAD before release"
      );
    }
  }
}


function dirtyMarker(dirty) {
  return dirty ? " (dirty)" : "";
}

/**
 * Rollback target format (Round6): <commit>+<artifact_sha256>, with a "(dirty)" marker when the
 * recorded workspace was dirty. The artifact digest for a product is the same sha256 recorded in
 * artifact_hash; repo-level targets hash all artifact digests belonging to that repo.
 */
export function productRollbackTarget(product) {
  const commit = product.repo_head || "unknown";
  const digest = product.artifact_hash || "none";
  return commit + "+" + digest + dirtyMarker(Boolean(product.repo_dirty));
}

export function applyRollbackTargets(manifest) {
  const productsByRepo = new Map();

  for (const product of manifest.products || []) {
    product.rollback_target = productRollbackTarget(product);
    const products = productsByRepo.get(product.repo) || [];
    products.push(product);
    productsByRepo.set(product.repo, products);
  }

  const repos = new Map((manifest.repos || []).map((repo) => [repo.key, repo]));

  for (const [key, repo] of repos) {
    const digests = (productsByRepo.get(key) || [])
      .map((product) => product.artifact_hash)
      .filter(Boolean)
      .sort();
    const digest = digests.length > 0 ? sha256Text(digests.join("\n")) : "none";
    const target = (repo.head || "unknown") + "+" + digest + dirtyMarker(Boolean(repo.dirty));
    repo.rollback_target = target;
    if (manifest.rollback_targets && Object.prototype.hasOwnProperty.call(manifest.rollback_targets, key)) {
      manifest.rollback_targets[key] = target;
    }
  }

  return manifest;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const repoPaths = resolveRepoPaths(args.repoPaths, process.env);
  const mixlabRoot = repoPaths.mixlab;
  const versionsConfig = loadVersionsConfig(mixlabRoot);
  const releaseTrain = args.releaseTrain || versionsConfig.default_train;

  if (!versionsConfig.release_trains || !versionsConfig.release_trains[releaseTrain]) {
    throw new Error("unknown release train: " + releaseTrain);
  }

  const now = args.now || new Date().toISOString();
  const repoSnapshots = {};
  for (const key of REPO_KEYS) {
    repoSnapshots[key] = repoSnapshot(key, repoPaths[key]);
  }

  const contractVersion = parseContractVersion(mixlabRoot);
  const manifest = buildManifest({
    versionsConfig,
    repoPaths,
    repoSnapshots,
    contractVersion,
    libraryFormatVersion: "",
    releaseTrain,
    now
  });

  manifest.contracts.source_hash = hashTree(path.join(mixlabRoot, "packages", "contracts", "src"), {
    extensions: [".ts"]
  }).hash;
  manifest.library_format.source_hash = hashTree(path.join(mixlabRoot, "packages", "library-format", "src"), {
    extensions: [".ts"]
  }).hash;

  annotateArtifactTracking(manifest, repoPaths, runGit);
  // Round6: emit commit+artifact_digest rollback targets (dirty workspaces are annotated).
  applyRollbackTargets(manifest);

  if (args.check) {
    console.log("MixLab release manifest check");
    console.log("release_train: " + (manifest.release_train || "n/a"));
    for (const repo of manifest.repos) {
      console.log("repo " + repo.key + ": " + (repo.available ? (repo.head ? repo.head.slice(0, 12) : "no-head") : "missing") + (repo.dirty ? " [dirty " + repo.changed_file_count + "]" : ""));
    }
    console.log("products: " + String(manifest.products.length));
    for (const product of manifest.products) {
      console.log("  " + product.product + ": version=" + (product.version || "-") + " expected=" + (product.expected_version || "-") + " status=" + product.version_status + " artifact=" + product.artifact_status);
    }
    console.log("errors: " + String(manifest.checks.errors.length));
    for (const error of manifest.checks.errors) {
      console.log("  ERROR " + error);
    }
    console.log("warnings: " + String(manifest.checks.warnings.length));
    for (const warning of manifest.checks.warnings) {
      console.log("  WARN " + warning);
    }
    console.log("RESULT: " + (manifest.checks.errors.length === 0 ? "PASS" : "FAIL"));
    process.exitCode = manifest.checks.errors.length === 0 ? 0 : 1;
    return;
  }

  const json = formatJson(manifest);
  const markdown = renderManifestMarkdown(manifest);

  if (args.outDir && !args.dryRun) {
    writeFileSafe(path.join(args.outDir, "release-manifest.json"), json);
    writeFileSafe(path.join(args.outDir, "release-manifest.md"), markdown);
    console.log("wrote " + path.join(args.outDir, "release-manifest.json"));
    console.log("wrote " + path.join(args.outDir, "release-manifest.md"));
    return;
  }

  if (args.jsonOnly) {
    process.stdout.write(json);
    return;
  }

  process.stdout.write(json);
  process.stdout.write("\n---\n\n");
  process.stdout.write(markdown);

  if (args.dryRun || !args.outDir) {
    process.stdout.write("\n[dry-run] no files written; pass --out-dir <dir> without --dry-run to persist the manifest.\n");
  }
}

const isDirectRun = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error("release-manifest failed: " + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}

