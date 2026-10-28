#!/usr/bin/env node
/**
 * MixLab Unreleased changelog draft (no external dependencies, read-only git).
 *
 * Groups commits from the three repos into products:
 *   shared  -> mixlab: packages/contracts, packages/library-format, packages/service-clients
 *   admin   -> mixlab: apps/admin-web, packages/admin-api
 *   cutter  -> cutter repo (all commits)
 *   smart   -> smart-cutter repo (all commits)
 *
 * Merge commits and empty subjects are excluded. The output is a draft:
 * always review before publishing and never treat a dirty-workspace draft as release evidence.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const CHANGELOG_GROUPS = [
  {
    key: "shared",
    label: "共享契约与库格式",
    repo: "mixlab",
    paths: ["packages/contracts", "packages/library-format", "packages/service-clients"]
  },
  { key: "admin", label: "管理端", repo: "mixlab", paths: ["apps/admin-web", "packages/admin-api"] },
  { key: "cutter", label: "剪辑端", repo: "cutter", paths: [] },
  { key: "smart", label: "智能剪辑端", repo: "smart-cutter", paths: [] }
];

export const PRODUCT_KEYS = ["shared", "admin", "cutter", "smart"];

export const DEFAULT_REPO_PATHS = {
  mixlab: path.resolve(import.meta.dirname, "..", ".."),
  cutter: "/Users/huaqihang/Documents/mixlab-cutter",
  "smart-cutter": "/Users/huaqihang/Documents/Codex/implementations/mixlab-smart-cutter"
};

export function resolveRepoPaths(overrides = {}, env = process.env) {
  return {
    mixlab: overrides.mixlab || env.MIXLAB_REPO || DEFAULT_REPO_PATHS.mixlab,
    cutter: overrides.cutter || env.MIXLAB_CUTTER_REPO || DEFAULT_REPO_PATHS.cutter,
    "smart-cutter": overrides["smart-cutter"] || env.MIXLAB_SMART_REPO || DEFAULT_REPO_PATHS["smart-cutter"]
  };
}

function runGit(repoPath, args) {
  const result = spawnSync("git", args, {
    cwd: repoPath,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });

  if (result.error) {
    return { ok: false, error: String(result.error.message || result.error) };
  }
  if (result.status !== 0) {
    return { ok: false, error: (result.stderr || "").trim() || "git exited " + String(result.status) };
  }

  return { ok: true, stdout: (result.stdout || "").trim() };
}

/**
 * Filters git log output into commit entries.
 * Excludes merge commits (defense in depth; git log is already called with --no-merges),
 * empty lines and empty subjects.
 */
export function filterCommitLines(output) {
  const commits = [];

  for (const rawLine of String(output || "").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const parts = line.split("\t");
    if (parts.length < 3) {
      continue;
    }

    const hash = parts[0];
    const date = parts[1];
    const subject = parts.slice(2).join(" ").trim();

    if (!hash || !subject) {
      continue;
    }
    if (subject === "Merge" || subject.startsWith("Merge ") || subject.startsWith("merge ")) {
      continue;
    }

    commits.push({ hash, date, subject });
  }

  return commits;
}

export function repoInfo(repoPath) {
  if (!existsSync(path.join(repoPath, ".git"))) {
    return { available: false, head: "", branch: "", dirty: false, changed_file_count: 0 };
  }

  const head = runGit(repoPath, ["rev-parse", "--short", "HEAD"]);
  const branch = runGit(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = runGit(repoPath, ["status", "--porcelain"]);

  return {
    available: true,
    head: head.ok ? head.stdout : "",
    branch: branch.ok ? branch.stdout : "",
    dirty: status.ok ? status.stdout.length > 0 : false,
    changed_file_count: status.ok && status.stdout ? status.stdout.split("\n").filter(Boolean).length : 0
  };
}

export function collectProductCommits(input) {
  const { groups, repoPaths, since } = input;
  const sections = [];
  const unavailable = [];

  for (const group of groups) {
    const repoPath = repoPaths[group.repo];
    const info = repoInfo(repoPath);

    if (!info.available) {
      unavailable.push({ key: group.key, repo: group.repo, reason: "repo missing or not a git worktree" });
      sections.push({
        key: group.key,
        label: group.label,
        repo: group.repo,
        head: "",
        branch: "",
        dirty: false,
        changed_file_count: 0,
        commits: [],
        unavailable: true
      });
      continue;
    }

    const gitArgs = ["log", "--no-merges", "--date=short", "--pretty=format:%h%x09%ad%x09%s", "--since=" + since];
    if (group.paths.length > 0) {
      gitArgs.push("--", ...group.paths);
    }

    const result = runGit(repoPath, gitArgs);

    sections.push({
      key: group.key,
      label: group.label,
      repo: group.repo,
      head: info.head,
      branch: info.branch,
      dirty: info.dirty,
      changed_file_count: info.changed_file_count,
      commits: result.ok ? filterCommitLines(result.stdout) : [],
      unavailable: false,
      error: result.ok ? "" : result.error
    });
  }

  return { sections, unavailable };
}

export function renderChangelogMarkdown(input) {
  const lines = [];
  lines.push("# Unreleased");
  lines.push("");
  lines.push("- generated_at: " + input.generatedAt);
  lines.push("- window_since: " + input.since);
  lines.push("- note: draft only; merge commits are excluded, dirty workspaces are marked, review before publishing.");
  lines.push("");

  for (const section of input.sections) {
    lines.push("## " + section.label + " (" + section.key + ")");
    lines.push("");

    if (section.unavailable) {
      lines.push("- repo " + section.repo + " unavailable; no changelog entries collected.");
    } else if (section.commits.length === 0) {
      lines.push("- no changes in window");
    } else {
      for (const commit of section.commits) {
        lines.push("- " + commit.subject + " (" + commit.hash + ", " + commit.date + ")");
      }
    }

    if (section.dirty) {
      lines.push("");
      lines.push("> WARNING: " + section.repo + " working tree is dirty (" + String(section.changed_file_count) + " entries) at draft time; draft is not release evidence.");
    }

    lines.push("");
  }

  lines.push("## Repo snapshot");
  lines.push("");
  for (const section of input.sections) {
    lines.push(
      "- " + section.repo + ": " + (section.head || "unknown") +
      (section.branch ? " (" + section.branch + ")" : "") +
      (section.dirty ? ", dirty" : ", clean") +
      (section.unavailable ? ", unavailable" : "")
    );
  }
  lines.push("");

  return lines.join("\n");
}

export function parseCliArgs(argv) {
  const args = {
    product: "all",
    since: "7 days ago",
    outFile: "",
    dryRun: false,
    help: false,
    repoPaths: {}
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    switch (current) {
      case "--product":
        args.product = next || "all";
        index += 1;
        break;
      case "--since":
        args.since = next || "7 days ago";
        index += 1;
        break;
      case "--out":
        args.outFile = next || "";
        index += 1;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--repo-mixlab":
        args.repoPaths.mixlab = next || "";
        index += 1;
        break;
      case "--repo-cutter":
        args.repoPaths.cutter = next || "";
        index += 1;
        break;
      case "--repo-smart-cutter":
        args.repoPaths["smart-cutter"] = next || "";
        index += 1;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error("unknown argument: " + current);
    }
  }

  return args;
}

function printHelp() {
  console.log("MixLab Unreleased changelog draft (read-only git, no external dependencies)");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/release/changelog-entry.mjs --product all --since \"7 days ago\"");
  console.log("  node scripts/release/changelog-entry.mjs --product shared --out dist/release/changelog.md");
  console.log("");
  console.log("Options:");
  console.log("  --product <" + PRODUCT_KEYS.join("|") + "|all>  default all");
  console.log("  --since <git since>                  default \"7 days ago\"");
  console.log("  --out <file>                         write markdown draft to file (default stdout)");
  console.log("  --dry-run                            accepted for parity; never writes unless --out is set");
  console.log("  --repo-mixlab/--repo-cutter/--repo-smart-cutter override repo roots");
}

export function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);

  if (args.help) {
    printHelp();
    return 0;
  }

  if (args.product !== "all" && !PRODUCT_KEYS.includes(args.product)) {
    console.error("changelog-entry: unknown product " + args.product + " (expected " + PRODUCT_KEYS.join("|") + "|all)");
    return 1;
  }

  const groups = args.product === "all"
    ? CHANGELOG_GROUPS
    : CHANGELOG_GROUPS.filter((group) => group.key === args.product);
  const repoPaths = resolveRepoPaths(args.repoPaths, process.env);
  const collected = collectProductCommits({ groups, repoPaths, since: args.since });
  const markdown = renderChangelogMarkdown({
    generatedAt: new Date().toISOString(),
    since: args.since,
    sections: collected.sections
  });

  if (args.outFile) {
    mkdirSync(path.dirname(args.outFile), { recursive: true });
    writeFileSync(args.outFile, markdown + "\n", "utf8");
    console.log("wrote " + args.outFile);
    return 0;
  }

  process.stdout.write(markdown + "\n");
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error("changelog-entry failed: " + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}

