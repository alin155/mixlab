import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildManifest,
  buildReleaseNotesDraft,
  collectArtifact,
  formatJson,
  hashTree,
  parseArgs,
  renderManifestMarkdown,
  repoSnapshot
} from "./lib.mjs";
import {
  applyRollbackTargets,
  productRollbackTarget
} from "./release-manifest.mjs";

function writeFile(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

function writeJson(filePath, value) {
  writeFile(filePath, JSON.stringify(value, null, 2) + "\n");
}

function tempDir(prefix) {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fakeSnapshot(overrides = {}) {
  return {
    key: "mixlab",
    available: true,
    head: "a".repeat(40),
    head_short: "aaaaaaaa",
    branch: "main",
    describe: "v0.1.0-3-gaaaaaaaa-dirty",
    head_committed_at: "2026-10-26T00:00:00.000Z",
    dirty: true,
    changed_file_count: 3,
    untracked_count: 1,
    dirty_sample: [" M apps/admin-web/src/x.ts"],
    latest_tags: ["v0.1.0"],
    previous_tag: "v0.1.0",
    rollback_target: "v0.1.0-3-gaaaaaaaa-dirty",
    ...overrides
  };
}

function repoSnapshots() {
  return {
    mixlab: fakeSnapshot(),
    cutter: fakeSnapshot({
      key: "cutter",
      available: false,
      error: "repo missing or not a git worktree",
      dirty: false,
      changed_file_count: 0,
      head: "",
      rollback_target: ""
    }),
    "smart-cutter": fakeSnapshot({
      key: "smart-cutter",
      available: false,
      error: "repo missing or not a git worktree",
      dirty: false,
      changed_file_count: 0,
      head: "",
      rollback_target: ""
    })
  };
}

function versionsConfig(overrides = {}) {
  return {
    schema_version: "1.0",
    default_train: "weekly",
    release_trains: {
      weekly: { cadence: "每周" },
      monthly: { cadence: "每月" }
    },
    contracts: {
      expected_package_version: "1.0.0",
      contract_version: "1.0.0"
    },
    library_format: {
      expected_package_version: "0.1.0"
    },
    service_clients: { status: "planned" },
    products: [
      {
        product: "admin-web",
        display_name: "管理端 Web",
        repo: "mixlab",
        package_path: "apps/admin-web",
        train: "weekly",
        version_source: "package-json",
        expected_version: "0.1.0",
        artifact: {
          kind: "web-dist",
          paths: ["apps/admin-web/dist/assets"],
          extensions: [".js", ".css"]
        }
      },
      {
        product: "contracts",
        display_name: "共享契约",
        repo: "mixlab",
        package_path: "packages/contracts",
        train: "monthly",
        version_source: "package-json",
        expected_version: "1.0.0",
        artifact: {
          kind: "source-tree",
          paths: ["packages/contracts/src"],
          extensions: [".ts"]
        }
      },
      {
        product: "service-clients",
        display_name: "服务客户端（planned）",
        repo: "mixlab",
        package_path: "packages/service-clients",
        train: "monthly",
        version_source: "package-json",
        expected_version: "",
        status: "planned",
        artifact: { kind: "not-configured", paths: [], extensions: [] }
      }
    ],
    ...overrides
  };
}

function makeSyntheticMixlab() {
  const root = tempDir("mixlab-release-");
  writeJson(path.join(root, "apps/admin-web/package.json"), {
    name: "@mixlab/admin-web",
    version: "0.1.0"
  });
  writeFile(path.join(root, "apps/admin-web/dist/assets/index-abc.js"), "console.log('a');\n");
  writeFile(path.join(root, "apps/admin-web/dist/assets/index-abc.css"), ".x{color:red}\n");
  writeJson(path.join(root, "packages/contracts/package.json"), {
    name: "@mixlab/contracts",
    version: "1.0.0"
  });
  writeFile(path.join(root, "packages/contracts/src/capabilities.ts"), 'export const CONTRACT_VERSION = "1.0.0";\n');
  writeJson(path.join(root, "packages/library-format/package.json"), {
    name: "@mixlab/library-format",
    version: "0.1.0"
  });
  writeFile(path.join(root, "packages/library-format/src/index.ts"), "export const format = 1;\n");
  return root;
}

test("parseArgs supports manifest and notes flags", () => {
  const args = parseArgs([
    "--dry-run",
    "--release-train",
    "monthly",
    "--out-dir",
    "dist/release",
    "--repo-mixlab",
    "/tmp/mixlab",
    "--now",
    "2026-10-27T00:00:00.000Z"
  ]);
  assert.equal(args.dryRun, true);
  assert.equal(args.releaseTrain, "monthly");
  assert.equal(args.outDir, "dist/release");
  assert.equal(args.now, "2026-10-27T00:00:00.000Z");
  assert.equal(args.repoPaths.mixlab, "/tmp/mixlab");
  assert.throws(() => parseArgs(["--unknown-flag"]), /unknown argument/);
});

test("hashTree and collectArtifact hash synthetic artifacts deterministically", () => {
  const root = makeSyntheticMixlab();
  const first = collectArtifact(root, {
    kind: "web-dist",
    paths: ["apps/admin-web/dist/assets"],
    extensions: [".js", ".css"]
  });
  const second = collectArtifact(root, {
    kind: "web-dist",
    paths: ["apps/admin-web/dist/assets"],
    extensions: [".js", ".css"]
  });

  assert.equal(first.status, "ok");
  assert.equal(first.file_count, 2);
  assert.equal(first.hash, second.hash);
  assert.match(first.hash, /^[0-9a-f]{64}$/);

  const missing = collectArtifact(root, {
    kind: "desktop-bundle",
    paths: ["apps/cutter-desktop/src-tauri/target/release/bundle"],
    extensions: [".msi"]
  });
  assert.equal(missing.status, "missing");
  assert.equal(missing.hash, "");

  const tree = hashTree(path.join(root, "packages/contracts/src"), { extensions: [".ts"] });
  assert.equal(tree.status, "ok");
  assert.equal(tree.file_count, 1);
});

test("repoSnapshot marks missing worktrees without throwing", () => {
  const missing = repoSnapshot("cutter", path.join(os.tmpdir(), "definitely-missing-mixlab-cutter"));
  assert.equal(missing.available, false);
  assert.equal(missing.dirty, false);
  assert.equal(missing.rollback_target, "");
  assert.match(missing.error, /missing|not a git/);
});

test("buildManifest keeps dirty workspaces explicit and records rollback targets", () => {
  const root = makeSyntheticMixlab();
  const repoPaths = {
    mixlab: root,
    cutter: path.join(os.tmpdir(), "definitely-missing-mixlab-cutter"),
    "smart-cutter": path.join(os.tmpdir(), "definitely-missing-smart-cutter")
  };
  const manifest = buildManifest({
    versionsConfig: versionsConfig(),
    repoPaths,
    repoSnapshots: repoSnapshots(),
    contractVersion: "1.0.0",
    libraryFormatVersion: "",
    releaseTrain: "weekly",
    now: "2026-10-27T00:00:00.000Z"
  });

  assert.equal(manifest.schema_version, "1.0");
  assert.equal(manifest.generated_at, "2026-10-27T00:00:00.000Z");
  assert.equal(manifest.release_train, "weekly");
  assert.equal(manifest.dirty_workspace, true);
  assert.deepEqual(manifest.dirty_repos, ["mixlab"]);
  assert.equal(manifest.rollback_targets.mixlab, "v0.1.0-3-gaaaaaaaa-dirty");
  assert.equal(manifest.products.length, 3);

  const admin = manifest.products.find((product) => product.product === "admin-web");
  assert.equal(admin.version, "0.1.0");
  assert.equal(admin.version_status, "match");
  assert.equal(admin.artifact_status, "ok");
  assert.match(admin.artifact_hash, /^[0-9a-f]{64}$/);

  const planned = manifest.products.find((product) => product.product === "service-clients");
  assert.equal(planned.version_status, "planned");
  assert.equal(planned.artifact_status, "not-configured");

  assert.ok(manifest.checks.warnings.some((warning) => warning.includes("mixlab is dirty")));
  assert.ok(manifest.checks.warnings.some((warning) => warning.includes("cutter")));
  assert.equal(manifest.checks.errors.length, 0);
});

test("buildManifest reports version drift and contract drift as errors", () => {
  const root = makeSyntheticMixlab();
  const repoPaths = {
    mixlab: root,
    cutter: root,
    "smart-cutter": root
  };
  const driftingVersions = versionsConfig({
    release_trains: { weekly: { cadence: "每周" } }
  });
  driftingVersions.products[0].expected_version = "0.2.0";

  const manifest = buildManifest({
    versionsConfig: driftingVersions,
    repoPaths,
    repoSnapshots: repoSnapshots(),
    contractVersion: "2.0.0",
    libraryFormatVersion: "",
    releaseTrain: "weekly",
    now: "2026-10-27T00:00:00.000Z"
  });

  assert.ok(manifest.checks.errors.some((error) => error.includes("admin-web") && error.includes("drift")));
  assert.ok(manifest.checks.errors.some((error) => error.includes("CONTRACT_VERSION drift")));
  assert.ok(manifest.checks.errors.some((error) => error.includes("contracts package version drift") === false));
});

test("markdown and JSON renderers keep dirty and rollback visible", () => {
  const root = makeSyntheticMixlab();
  const manifest = buildManifest({
    versionsConfig: versionsConfig(),
    repoPaths: { mixlab: root, cutter: root, "smart-cutter": root },
    repoSnapshots: repoSnapshots(),
    contractVersion: "1.0.0",
    libraryFormatVersion: "",
    releaseTrain: "weekly",
    now: "2026-10-27T00:00:00.000Z"
  });
  const markdown = renderManifestMarkdown(manifest);
  assert.match(markdown, /# MixLab Release Manifest/);
  assert.match(markdown, /dirty_workspace: true/);
  assert.match(markdown, /admin-web/);
  assert.match(markdown, /v0\.1\.0-3-gaaaaaaaa-dirty/);

  const json = formatJson(manifest);
  const parsed = JSON.parse(json);
  assert.equal(parsed.dirty_workspace, true);
  assert.equal(parsed.schema_version, "1.0");
});

test("release notes draft marks dirty workspaces and lists repo commits", () => {
  const manifest = buildManifest({
    versionsConfig: versionsConfig(),
    repoPaths: {
      mixlab: makeSyntheticMixlab(),
      cutter: path.join(os.tmpdir(), "missing-cutter"),
      "smart-cutter": path.join(os.tmpdir(), "missing-smart")
    },
    repoSnapshots: repoSnapshots(),
    contractVersion: "1.0.0",
    libraryFormatVersion: "",
    releaseTrain: "weekly",
    now: "2026-10-27T00:00:00.000Z"
  });
  const draft = buildReleaseNotesDraft({
    manifest,
    repoLogs: {
      mixlab: ["- aaaaaaaa feat: contract integration"],
      cutter: [],
      "smart-cutter": []
    },
    since: "14 days ago"
  });

  assert.match(draft, /# MixLab Release Notes \(draft\)/);
  assert.match(draft, /since: 14 days ago/);
  assert.match(draft, /feat: contract integration/);
  assert.match(draft, /WARNING: working tree dirty/);
  assert.match(draft, /feature flags remain default-off/);
});

test("release-manifest tool emits commit+artifact digest rollback targets with dirty marker", () => {
  const root = makeSyntheticMixlab();
  const manifest = buildManifest({
    versionsConfig: versionsConfig(),
    repoPaths: { mixlab: root, cutter: root, "smart-cutter": root },
    repoSnapshots: repoSnapshots(),
    contractVersion: "1.0.0",
    libraryFormatVersion: "",
    releaseTrain: "weekly",
    now: "2026-10-27T00:00:00.000Z"
  });
  applyRollbackTargets(manifest);

  const head = "a".repeat(40);
  const admin = manifest.products.find((product) => product.product === "admin-web");
  assert.ok(admin);
  assert.equal(productRollbackTarget(admin), head + "+" + admin.artifact_hash + " (dirty)");
  assert.match(admin.rollback_target, /^a{40}\+[0-9a-f]{64} \(dirty\)$/);

  const planned = manifest.products.find((product) => product.product === "service-clients");
  assert.ok(planned);
  assert.equal(planned.rollback_target, head + "+none (dirty)");

  const mixlabRepo = manifest.repos.find((repo) => repo.key === "mixlab");
  assert.ok(mixlabRepo);
  assert.match(mixlabRepo.rollback_target, /^a{40}\+[0-9a-f]{64} \(dirty\)$/);
  assert.equal(manifest.rollback_targets.mixlab, mixlabRepo.rollback_target);
  assert.equal(manifest.rollback_targets.cutter, "unknown+none");

  const markdown = renderManifestMarkdown(manifest);
  assert.match(markdown, /\+[0-9a-f]{64}/);
  assert.match(markdown, /\(dirty\)/);

  const dirtySnapshotClean = repoSnapshot("mixlab", root);
  assert.equal(typeof dirtySnapshotClean.rollback_target, "string");
});

