import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const RELEASE_MANIFEST_SCHEMA_VERSION = "1.0";
export const DEFAULT_RELEASE_TRAIN = "weekly";
export const REPO_KEYS = ["mixlab", "cutter", "smart-cutter"];

const SCRIPT_DIR = import.meta.dirname;
const MIXLAB_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

export const DEFAULT_REPO_PATHS = {
  mixlab: MIXLAB_ROOT,
  cutter: "/Users/huaqihang/Documents/mixlab-cutter",
  "smart-cutter": "/Users/huaqihang/Documents/Codex/implementations/mixlab-smart-cutter"
};

const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  "rev-parse",
  "status",
  "log",
  "describe",
  "tag",
  "show",
  "diff",
  "ls-files",
  "hash-object",
  "merge-base"
]);

export function resolveRepoPaths(overrides = {}, env = process.env) {
  return {
    mixlab: overrides.mixlab || env.MIXLAB_REPO || DEFAULT_REPO_PATHS.mixlab,
    cutter: overrides.cutter || env.MIXLAB_CUTTER_REPO || DEFAULT_REPO_PATHS.cutter,
    "smart-cutter": overrides["smart-cutter"] || env.MIXLAB_SMART_REPO || DEFAULT_REPO_PATHS["smart-cutter"]
  };
}

export function runGit(repoPath, args) {
  if (!Array.isArray(args) || args.length === 0 || !READ_ONLY_GIT_SUBCOMMANDS.has(args[0])) {
    throw new Error("release tooling only allows read-only git subcommands, got: " + String(args && args[0]));
  }

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

export function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function writeFileSafe(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

export function listFilesRecursive(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const stat = statSync(directory);
  if (!stat.isDirectory()) {
    return [directory];
  }

  const files = [];
  for (const entry of readdirSync(directory).sort()) {
    const child = path.join(directory, entry);
    const childStat = statSync(child);
    if (childStat.isDirectory()) {
      files.push(...listFilesRecursive(child));
    } else if (childStat.isFile()) {
      files.push(child);
    }
  }
  return files;
}

export function hashTree(directory, options = {}) {
  const files = listFilesRecursive(directory)
    .filter((file) => options.extensions ? options.extensions.includes(path.extname(file).toLowerCase()) : true)
    .sort();
  const entries = files.map((file) => ({
    path: path.relative(directory, file).split(path.sep).join("/"),
    size: statSync(file).size,
    sha256: sha256File(file)
  }));

  return {
    status: entries.length > 0 ? "ok" : "missing",
    hash: entries.length > 0 ? sha256Text(entries.map((entry) => entry.path + ":" + entry.sha256).join("\n")) : "",
    file_count: entries.length,
    files: entries
  };
}

export function collectArtifact(repoPath, spec) {
  if (!spec || !Array.isArray(spec.paths) || spec.paths.length === 0) {
    return { status: "not-configured", hash: "", file_count: 0, files: [] };
  }

  const extensions = Array.isArray(spec.extensions)
    ? spec.extensions.map((extension) => extension.toLowerCase())
    : null;
  const collected = [];

  for (const relativePath of spec.paths) {
    const absolute = path.join(repoPath, relativePath);

    if (!existsSync(absolute)) {
      continue;
    }

    for (const file of listFilesRecursive(absolute)) {
      if (extensions && !extensions.includes(path.extname(file).toLowerCase())) {
        continue;
      }
      collected.push(file);
    }
  }

  const unique = [...new Set(collected)].sort();
  const files = unique.map((file) => ({
    path: path.relative(repoPath, file).split(path.sep).join("/"),
    size: statSync(file).size,
    sha256: sha256File(file),
    modified_at: new Date(statSync(file).mtimeMs).toISOString()
  }));
  const latestMtimeMs = files.length > 0
    ? Math.max(...unique.map((file) => statSync(file).mtimeMs))
    : 0;

  return {
    status: files.length > 0 ? "ok" : "missing",
    kind: spec.kind || "files",
    hash: files.length > 0 ? sha256Text(files.map((file) => file.path + ":" + file.sha256).join("\n")) : "",
    file_count: files.length,
    newest_file_modified_at: files.length > 0 ? new Date(latestMtimeMs).toISOString() : "",
    files
  };
}

function safeGit(repoPath, args) {
  const result = runGit(repoPath, args);
  return result.ok ? result.stdout : "";
}

export function repoSnapshot(repoKey, repoPath) {
  const isRepo = existsSync(path.join(repoPath, ".git"));

  if (!isRepo) {
    return {
      key: repoKey,
      available: false,
      error: "repo missing or not a git worktree",
      head: "",
      branch: "",
      describe: "",
      head_committed_at: "",
      dirty: false,
      changed_file_count: 0,
      untracked_count: 0,
      dirty_sample: [],
      latest_tags: [],
      rollback_target: ""
    };
  }

  const head = safeGit(repoPath, ["rev-parse", "HEAD"]);
  const headShort = safeGit(repoPath, ["rev-parse", "--short", "HEAD"]);
  const branch = safeGit(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const describe = safeGit(repoPath, ["describe", "--tags", "--always", "--dirty"]);
  const headCommittedAt = safeGit(repoPath, ["log", "-1", "--format=%cI"]);
  const statusOutput = safeGit(repoPath, ["status", "--porcelain", "--untracked-files=normal"]);
  const statusLines = statusOutput ? statusOutput.split("\n").filter(Boolean) : [];
  const untrackedCount = statusLines.filter((line) => line.startsWith("??")).length;
  const latestTags = safeGit(repoPath, ["tag", "--sort=-creatordate"])
    .split("\n")
    .filter(Boolean)
    .slice(0, 5);
  const previousTag = safeGit(repoPath, ["describe", "--tags", "--abbrev=0", "HEAD"]);

  return {
    key: repoKey,
    available: true,
    head,
    head_short: headShort,
    branch,
    describe,
    head_committed_at: headCommittedAt,
    dirty: statusLines.length > 0,
    changed_file_count: statusLines.length,
    untracked_count: untrackedCount,
    dirty_sample: statusLines.slice(0, 10),
    latest_tags: latestTags,
    previous_tag: previousTag,
    rollback_target: describe || head
  };
}

export function readPackageVersion(repoPath, appPath) {
  const packageJsonPath = path.join(repoPath, appPath, "package.json");
  if (!existsSync(packageJsonPath)) {
    return null;
  }

  const manifest = readJson(packageJsonPath);
  return {
    name: typeof manifest.name === "string" ? manifest.name : "",
    version: typeof manifest.version === "string" ? manifest.version : "",
    private: manifest.private === true,
    package_json_path: path.join(appPath, "package.json")
  };
}

export function parseContractVersion(contractsRepoPath) {
  const capabilitiesPath = path.join(contractsRepoPath, "packages", "contracts", "src", "capabilities.ts");
  if (!existsSync(capabilitiesPath)) {
    return "";
  }

  const source = readFileSync(capabilitiesPath, "utf8");
  const match = /export const CONTRACT_VERSION = "([^"]+)"/.exec(source);
  return match ? match[1] : "";
}

export function loadVersionsConfig(mixlabRoot) {
  return readJson(path.join(mixlabRoot, "scripts", "release", "versions.json"));
}

function compareVersionStrings(actual, expected) {
  const parse = (value) => String(value || "").split("-")[0].split(".").map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(actual);
  const right = parse(expected);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference !== 0) {
      return difference > 0 ? 1 : -1;
    }
  }
  return 0;
}

export function evaluateVersionChecks(options) {
  const { versionsConfig, repoSnapshots, contractVersion } = options;
  const errors = [];
  const warnings = [];

  for (const repo of Object.values(repoSnapshots)) {
    if (!repo.available) {
      warnings.push("repo " + repo.key + " is not available: " + repo.error);
      continue;
    }
    if (repo.dirty) {
      warnings.push("repo " + repo.key + " is dirty (" + repo.changed_file_count + " changed/untracked entries)");
    }
  }

  const trainNames = Object.keys(versionsConfig.release_trains || {});
  const manifestTrain = versionsConfig.default_train;
  if (!trainNames.includes(manifestTrain)) {
    errors.push("default release train " + String(manifestTrain) + " is not defined in release_trains");
  }

  const expectedContract = versionsConfig.contracts && versionsConfig.contracts.contract_version;
  if (expectedContract && contractVersion && contractVersion !== expectedContract) {
    errors.push("contracts CONTRACT_VERSION drift: repo=" + contractVersion + " expected=" + expectedContract);
  }

  return { errors, warnings };
}

export function buildProductManifest(options) {
  const { versionsConfig, repoPaths, repoSnapshots } = options;
  const products = [];

  for (const product of versionsConfig.products || []) {
    const repoPath = repoPaths[product.repo];
    const snapshot = repoSnapshots[product.repo];
    const packageInfo = product.package_path
      ? readPackageVersion(repoPath, product.package_path)
      : null;
    const artifact = collectArtifact(repoPath, product.artifact || {});
    const planned = product.status === "planned";
    let versionStatus = "match";

    if (planned) {
      versionStatus = packageInfo || artifact.status === "ok" ? "unexpected-present" : "planned";
    } else if (!packageInfo && product.version_source === "package-json") {
      versionStatus = "missing";
    } else if (product.expected_version && packageInfo && compareVersionStrings(packageInfo.version, product.expected_version) !== 0) {
      versionStatus = "drift";
    }

    products.push({
      product: product.product,
      display_name: product.display_name || product.product,
      repo: product.repo,
      train: product.train,
      package: packageInfo ? packageInfo.name : product.package_name || "",
      package_path: product.package_path || "",
      version: packageInfo ? packageInfo.version : "",
      expected_version: product.expected_version || "",
      version_source: product.version_source || "",
      version_status: versionStatus,
      artifact_kind: artifact.kind || "not-configured",
      artifact_status: artifact.status,
      artifact_hash: artifact.hash,
      artifact_file_count: artifact.file_count,
      artifact_newest_modified_at: artifact.newest_file_modified_at || "",
      artifact_files_sample: (artifact.files || []).slice(0, 5),
      rollback_target: snapshot ? snapshot.rollback_target : "",
      repo_head: snapshot ? snapshot.head : "",
      repo_dirty: snapshot ? snapshot.dirty : false
    });
  }

  return products;
}

export function buildManifest(options) {
  const {
    versionsConfig,
    repoPaths,
    repoSnapshots,
    contractVersion,
    libraryFormatVersion,
    releaseTrain,
    now
  } = options;
  const products = buildProductManifest({ versionsConfig, repoPaths, repoSnapshots });
  const checks = evaluateVersionChecks({ versionsConfig, repoSnapshots, contractVersion });
  const dirtyRepos = Object.values(repoSnapshots).filter((repo) => repo.dirty).map((repo) => repo.key);

  for (const product of products) {
    if (product.version_status === "drift") {
      checks.errors.push(
        "version drift: " + product.product + " repo=" + product.version + " expected=" + product.expected_version +
        " (update scripts/release/versions.json intentionally when bumping)"
      );
    }
    if (product.version_status === "missing") {
      checks.errors.push("version missing: " + product.product + " package.json not found at " + product.package_path);
    }
  }

  const contractsPackageVersion = readPackageVersionVersion(repoPaths.mixlab, "packages/contracts");
  const libraryFormatPackageVersion = readPackageVersionVersion(repoPaths.mixlab, "packages/library-format");
  const expectedContractsPackageVersion = versionsConfig.contracts && versionsConfig.contracts.expected_package_version;
  const expectedLibraryFormatPackageVersion = versionsConfig.library_format && versionsConfig.library_format.expected_package_version;

  if (expectedContractsPackageVersion && contractsPackageVersion &&
    compareVersionStrings(contractsPackageVersion, expectedContractsPackageVersion) !== 0) {
    checks.errors.push(
      "contracts package version drift: repo=" + contractsPackageVersion + " expected=" + expectedContractsPackageVersion
    );
  }
  if (expectedLibraryFormatPackageVersion && libraryFormatPackageVersion &&
    compareVersionStrings(libraryFormatPackageVersion, expectedLibraryFormatPackageVersion) !== 0) {
    checks.errors.push(
      "library-format package version drift: repo=" + libraryFormatPackageVersion + " expected=" + expectedLibraryFormatPackageVersion
    );
  }
  const artifactWarnings = [];

  for (const product of products) {
    if (product.artifact_status === "missing" && product.train !== "contract-only") {
      artifactWarnings.push(product.product + ": build artifact missing (run the product build before release)");
    }
    if (product.artifact_newest_modified_at && product.repo_head) {
      const snapshot = repoSnapshots[product.repo];
      if (snapshot && snapshot.head_committed_at && product.artifact_newest_modified_at < snapshot.head_committed_at) {
        artifactWarnings.push(product.product + ": build artifact is older than repo HEAD commit; rebuild before release");
      }
    }
  }

  return {
    schema_version: RELEASE_MANIFEST_SCHEMA_VERSION,
    generated_at: now,
    release_train: releaseTrain,
    generator: "scripts/release/release-manifest.mjs",
    dirty_workspace: dirtyRepos.length > 0,
    dirty_repos: dirtyRepos,
    contracts: {
      package_version: contractsPackageVersion,
      contract_version: contractVersion,
      source_path: "packages/contracts/src"
    },
    library_format: {
      package_version: libraryFormatPackageVersion,
      source_path: "packages/library-format/src"
    },
    service_clients: versionsConfig.service_clients || { status: "planned", note: "Phase 3 package not present in repo" },
    repos: REPO_KEYS.map((key) => repoSnapshots[key]),
    products,
    checks: {
      errors: checks.errors,
      warnings: [...checks.warnings, ...artifactWarnings]
    },
    rollback_targets: Object.fromEntries(REPO_KEYS.map((key) => [key, repoSnapshots[key].rollback_target || ""]))
  };
}

function readPackageVersionVersion(repoPath, appPath) {
  const info = readPackageVersion(repoPath, appPath);
  return info ? info.version : "";
}

export function renderManifestMarkdown(manifest) {
  const lines = [];
  lines.push("# MixLab Release Manifest");
  lines.push("");
  lines.push("- schema: " + manifest.schema_version);
  lines.push("- generated_at: " + manifest.generated_at);
  lines.push("- release_train: " + manifest.release_train);
  lines.push("- dirty_workspace: " + (manifest.dirty_workspace ? "true (" + manifest.dirty_repos.join(", ") + ")" : "false"));
  lines.push("- contracts: " + manifest.contracts.package_version + " / contract " + manifest.contracts.contract_version);
  lines.push("- library_format: " + manifest.library_format.package_version);
  lines.push("");
  lines.push("## Repos");
  lines.push("");
  lines.push("| repo | head | branch | dirty | changes | rollback_target |");
  lines.push("|---|---|---|---|---|---|");
  for (const repo of manifest.repos || []) {
    lines.push("| " + repo.key + " | " + (repo.head ? repo.head.slice(0, 12) : "missing") + " | " + (repo.branch || "-") + " | " + (repo.dirty ? "yes" : "no") + " | " + String(repo.changed_file_count || 0) + " | " + (repo.rollback_target || "-").replaceAll("|", "/") + " |");
  }
  lines.push("");
  lines.push("## Products");
  lines.push("");
  lines.push("| product | repo | version | expected | status | artifact | rollback_target |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const product of manifest.products || []) {
    lines.push("| " + product.product + " | " + product.repo + " | " + (product.version || "-") + " | " + (product.expected_version || "-") + " | " + product.version_status + " | " + product.artifact_status + " / " + (product.artifact_hash ? product.artifact_hash.slice(0, 12) : "-") + " | " + (product.rollback_target || "-").replaceAll("|", "/") + " |");
  }
  lines.push("");
  lines.push("## Checks");
  lines.push("");
  if ((manifest.checks.errors || []).length === 0 && (manifest.checks.warnings || []).length === 0) {
    lines.push("- no errors or warnings");
  } else {
    for (const error of manifest.checks.errors || []) {
      lines.push("- ERROR: " + error);
    }
    for (const warning of manifest.checks.warnings || []) {
      lines.push("- WARN: " + warning);
    }
  }
  lines.push("");
  lines.push("Rollback targets are the per-repo git describe/HEAD captured at manifest time; dirty workspaces are explicit, not releasable by the train process until committed or captured as a patch.");
  lines.push("");
  return lines.join("\n");
}

export function formatJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

export function parseArgs(argv) {
  const args = {
    dryRun: false,
    check: false,
    jsonOnly: false,
    help: false,
    outDir: "",
    releaseTrain: "",
    now: "",
    since: "",
    manifestPath: "",
    outFile: "",
    repoPaths: {}
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--check":
        args.check = true;
        break;
      case "--json":
        args.jsonOnly = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--out-dir":
        args.outDir = next || "";
        index += 1;
        break;
      case "--out":
        args.outFile = next || "";
        index += 1;
        break;
      case "--release-train":
        args.releaseTrain = next || "";
        index += 1;
        break;
      case "--now":
        args.now = next || "";
        index += 1;
        break;
      case "--since":
        args.since = next || "";
        index += 1;
        break;
      case "--manifest":
        args.manifestPath = next || "";
        index += 1;
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
      default:
        throw new Error("unknown argument: " + current);
    }
  }

  return args;
}

export function buildReleaseNotesDraft(input) {
  const { manifest, repoLogs, since } = input;
  const lines = [];
  lines.push("# MixLab Release Notes (draft)");
  lines.push("");
  lines.push("- generated_at: " + manifest.generated_at);
  lines.push("- release_train: " + manifest.release_train);
  lines.push("- since: " + (since || "n/a"));
  lines.push("- dirty_workspace: " + String(manifest.dirty_workspace));
  lines.push("");
  lines.push("## Products");
  lines.push("");
  for (const product of manifest.products || []) {
    lines.push("- " + product.display_name + " (" + product.product + ") v" + (product.version || "n/a") + " — " + product.version_status + ", artifact " + product.artifact_status + ", rollback " + (product.rollback_target || "n/a"));
  }
  lines.push("");
  for (const repo of manifest.repos || []) {
    lines.push("## " + repo.key + " (" + (repo.head ? repo.head.slice(0, 12) : "missing") + ")");
    lines.push("");
    if (!repo.available) {
      lines.push("- repo unavailable: " + repo.error);
    } else {
      const commits = repoLogs[repo.key] || [];
      if (commits.length === 0) {
        lines.push("- no commits in window");
      } else {
        for (const commit of commits) {
          lines.push("- " + commit);
        }
      }
      if (repo.dirty) {
        lines.push("");
        lines.push("> WARNING: working tree dirty at manifest time (" + repo.changed_file_count + " entries); notes are a draft and must not be published as-is.");
      }
    }
    lines.push("");
  }
  lines.push("## Release checklist");
  lines.push("");
  lines.push("- [ ] dirty workspaces resolved or captured as patch");
  lines.push("- [ ] artifacts rebuilt from the recorded commits");
  lines.push("- [ ] contracts/library-format additive check passed");
  lines.push("- [ ] rollback targets verified against previous release manifest");
  lines.push("- [ ] feature flags remain default-off for new capabilities");
  lines.push("");
  return lines.join("\n");
}

