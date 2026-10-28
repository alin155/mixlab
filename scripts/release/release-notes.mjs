#!/usr/bin/env node
import path from "node:path";
import {
  REPO_KEYS,
  buildManifest,
  buildReleaseNotesDraft,
  loadVersionsConfig,
  parseArgs,
  parseContractVersion,
  readJson,
  resolveRepoPaths,
  repoSnapshot,
  runGit,
  writeFileSafe,
  formatJson
} from "./lib.mjs";

function printHelp() {
  console.log("MixLab release notes draft generator (read-only)");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/release/release-notes.mjs --dry-run");
  console.log("  node scripts/release/release-notes.mjs --since \"14 days ago\" --out dist/release/release-notes.md");
  console.log("  node scripts/release/release-notes.mjs --manifest dist/release/release-manifest.json --dry-run");
}

function collectRepoLogs(repoPaths, repoSnapshots, since) {
  const logs = {};

  for (const key of REPO_KEYS) {
    const snapshot = repoSnapshots[key];
    if (!snapshot.available) {
      logs[key] = [];
      continue;
    }

    const result = runGit(repoPaths[key], [
      "log",
      "--no-merges",
      "--pretty=format:%h %s",
      "-n",
      "200",
      "--since=" + since
    ]);
    logs[key] = result.ok && result.stdout
      ? result.stdout.split("\n").filter(Boolean).map((line) => "- " + line)
      : [];
  }

  return logs;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const repoPaths = resolveRepoPaths(args.repoPaths, process.env);
  const mixlabRoot = repoPaths.mixlab;
  const since = args.since || "30 days ago";
  let manifest;

  if (args.manifestPath) {
    manifest = readJson(args.manifestPath);
  } else {
    const versionsConfig = loadVersionsConfig(mixlabRoot);
    const releaseTrain = args.releaseTrain || versionsConfig.default_train;
    const now = args.now || new Date().toISOString();
    const repoSnapshots = {};
    for (const key of REPO_KEYS) {
      repoSnapshots[key] = repoSnapshot(key, repoPaths[key]);
    }
    manifest = buildManifest({
      versionsConfig,
      repoPaths,
      repoSnapshots,
      contractVersion: parseContractVersion(mixlabRoot),
      libraryFormatVersion: "",
      releaseTrain,
      now
    });
  }

  const repoSnapshots = Object.fromEntries(manifest.repos.map((repo) => [repo.key, repo]));
  const draft = buildReleaseNotesDraft({
    manifest,
    repoLogs: collectRepoLogs(repoPaths, repoSnapshots, since),
    since
  });

  if (args.outFile && !args.dryRun) {
    writeFileSafe(args.outFile, draft);
    console.log("wrote " + args.outFile);
    return;
  }

  process.stdout.write(draft);
  process.stdout.write("\n[dry-run] draft only; pass --out <file> without --dry-run to persist.\n");
}

try {
  main();
} catch (error) {
  console.error("release-notes failed: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}

