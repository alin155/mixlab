import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildVersionPlan,
  bumpSemverVersion,
  isValidSemver,
  parseCliArgs as parseBumpArgs,
  parseSemver,
  renderPlanText,
  writeVersionPlan
} from "./version-bump.mjs";
import {
  filterCommitLines,
  parseCliArgs as parseChangelogArgs,
  renderChangelogMarkdown
} from "./changelog-entry.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BUMP_SCRIPT = path.join(SCRIPT_DIR, "version-bump.mjs");
const CHANGELOG_SCRIPT = path.join(SCRIPT_DIR, "changelog-entry.mjs");

function tempDir(prefix) {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writePackage(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function makeRepos() {
  const mixlab = tempDir("mixlab-versioning-");
  const cutter = tempDir("cutter-versioning-");
  const smart = tempDir("smart-versioning-");

  writePackage(path.join(mixlab, "apps/admin-web/package.json"), { name: "@mixlab/admin-web", version: "0.1.0" });
  writePackage(path.join(mixlab, "packages/admin-api/package.json"), { name: "@mixlab/admin-api", version: "0.1.0" });
  writePackage(path.join(mixlab, "packages/contracts/package.json"), { name: "@mixlab/contracts", version: "1.0.0" });
  writePackage(path.join(mixlab, "packages/library-format/package.json"), { name: "@mixlab/library-format", version: "0.1.0" });
  writePackage(path.join(mixlab, "packages/service-clients/package.json"), { name: "@mixlab/service-clients", version: "1.0.0" });

  writePackage(path.join(cutter, "apps/cutter-web/package.json"), { name: "@mixlab/cutter-web", version: "0.1.0" });
  writePackage(path.join(cutter, "apps/cutter-desktop/package.json"), { name: "@mixlab/cutter-desktop", version: "0.18.10" });

  writePackage(path.join(smart, "apps/smart-cutter-web/package.json"), { name: "@mixlab/smart-cutter-web", version: "0.1.0" });
  writePackage(path.join(smart, "apps/smart-cutter-desktop/package.json"), { name: "@mixlab/smart-cutter-desktop", version: "0.1.0" });

  return {
    mixlab,
    cutter,
    "smart-cutter": smart,
    readVersion(relativePath) {
      const repo = relativePath.startsWith("apps/cutter") || relativePath.startsWith("packages/cutter")
        ? cutter
        : relativePath.startsWith("apps/smart")
          ? smart
          : mixlab;
      return JSON.parse(readFileSync(path.join(repo, relativePath), "utf8")).version;
    }
  };
}

test("semver parsing and bumping is strict", () => {
  assert.equal(isValidSemver("0.1.0"), true);
  assert.equal(isValidSemver("0.18.10"), true);
  assert.equal(isValidSemver("1.2.3-beta.1"), true);
  assert.equal(isValidSemver("v0.1.0"), false);
  assert.equal(isValidSemver("1.2"), false);
  assert.equal(isValidSemver("1.2.3.4"), false);
  assert.equal(isValidSemver("01.2.3"), false);
  assert.equal(isValidSemver(""), false);
  assert.equal(parseSemver("1.2.3-beta.1").prerelease, "beta.1");
  assert.equal(bumpSemverVersion("0.1.0", "patch"), "0.1.1");
  assert.equal(bumpSemverVersion("0.1.0", "minor"), "0.2.0");
  assert.equal(bumpSemverVersion("0.18.10", "patch"), "0.18.11");
  assert.equal(bumpSemverVersion("1.0.0", "major"), "2.0.0");
  assert.equal(bumpSemverVersion("1.2.3-beta.1", "patch"), "1.2.4");
  assert.throws(() => bumpSemverVersion("1.2", "patch"), /invalid semver/);
  assert.throws(() => bumpSemverVersion("1.2.3", "banana"), /invalid bump/);
});

test("buildVersionPlan resolves products and rejects additive-only major bumps", () => {
  const repos = makeRepos();
  const adminPlan = buildVersionPlan({
    product: "admin",
    bump: "patch",
    repoPaths: repos
  });

  assert.equal(adminPlan.ok, true);
  assert.equal(adminPlan.entries.length, 2);
  assert.deepEqual(
    adminPlan.entries.map((entry) => [entry.file, entry.before, entry.after]),
    [
      ["apps/admin-web/package.json", "0.1.0", "0.1.1"],
      ["packages/admin-api/package.json", "0.1.0", "0.1.1"]
    ]
  );

  const contractsMajor = buildVersionPlan({
    product: "contracts",
    bump: "major",
    repoPaths: repos
  });
  assert.equal(contractsMajor.ok, false);
  assert.match(contractsMajor.errors.join("\n"), /additive-only/);
  assert.match(contractsMajor.errors.join("\n"), /--allow-breaking/);

  const allowedMajor = buildVersionPlan({
    product: "contracts",
    bump: "major",
    allowBreaking: true,
    repoPaths: repos
  });
  assert.equal(allowedMajor.ok, true);
  assert.equal(allowedMajor.entries[0].after, "2.0.0");

  const unknown = buildVersionPlan({ product: "nope", bump: "patch", repoPaths: repos });
  assert.equal(unknown.ok, false);
  assert.match(unknown.errors.join("\n"), /unknown product/);

  const unknownBump = buildVersionPlan({ product: "admin", bump: "banana", repoPaths: repos });
  assert.match(unknownBump.errors.join("\n"), /unknown bump/);
});

test("all products plan skips missing products and reports warnings", () => {
  const repos = makeRepos();
  const missingCutter = tempDir("cutter-missing-");
  const plan = buildVersionPlan({
    product: "all",
    bump: "minor",
    repoPaths: { mixlab: repos.mixlab, cutter: missingCutter, "smart-cutter": repos["smart-cutter"] }
  });

  assert.equal(plan.ok, true);
  assert.ok(plan.warnings.some((warning) => warning.includes("cutter")));
  assert.ok(plan.entries.some((entry) => entry.product === "admin"));
  assert.ok(plan.entries.some((entry) => entry.product === "contracts"));
  assert.ok(plan.entries.every((entry) => entry.product !== "cutter"));
});

test("invalid versions abort the whole plan", () => {
  const repos = makeRepos();
  writePackage(path.join(repos.mixlab, "apps/admin-web/package.json"), { name: "@mixlab/admin-web", version: "1.0" });
  const plan = buildVersionPlan({ product: "admin", bump: "patch", repoPaths: repos });
  assert.equal(plan.ok, false);
  assert.match(plan.errors.join("\n"), /invalid semver/);
  assert.throws(() => writeVersionPlan(plan), /refusing to write/);
  assert.equal(repos.readVersion("apps/admin-web/package.json"), "1.0");
});

test("writeVersionPlan persists only planned changes and keeps file shape", () => {
  const repos = makeRepos();
  const plan = buildVersionPlan({ product: "admin", bump: "patch", repoPaths: repos });
  assert.equal(repos.readVersion("apps/admin-web/package.json"), "0.1.0");

  const written = writeVersionPlan(plan);
  assert.equal(written.length, 2);
  assert.equal(repos.readVersion("apps/admin-web/package.json"), "0.1.1");
  assert.equal(repos.readVersion("packages/admin-api/package.json"), "0.1.1");

  const packageJson = JSON.parse(readFileSync(path.join(repos.mixlab, "apps/admin-web/package.json"), "utf8"));
  assert.equal(packageJson.name, "@mixlab/admin-web");
  assert.equal(packageJson.version, "0.1.1");
});

test("plan text distinguishes dry-run and write modes", () => {
  const repos = makeRepos();
  const plan = buildVersionPlan({ product: "contracts", bump: "minor", repoPaths: repos });
  const dryRunText = renderPlanText(plan, { write: false });
  const writeText = renderPlanText(plan, { write: true });

  assert.match(dryRunText, /dry-run/);
  assert.match(dryRunText, /1\.0\.0 -> 1\.1\.0/);
  assert.match(dryRunText, /no files written/);
  assert.match(writeText, /release:check/);
  assert.match(writeText, /release:changelog/);
});

test("cli argument parsing and help smoke tests stay read-only", () => {
  const bumpArgs = parseBumpArgs(["--product", "admin", "--bump", "patch", "--write", "--allow-breaking"]);
  assert.equal(bumpArgs.product, "admin");
  assert.equal(bumpArgs.bump, "patch");
  assert.equal(bumpArgs.write, true);
  assert.equal(bumpArgs.dryRun, false);
  assert.equal(bumpArgs.allowBreaking, true);

  const changelogArgs = parseChangelogArgs(["--product", "shared", "--since", "3 days ago", "--out", "/tmp/changelog.md"]);
  assert.equal(changelogArgs.product, "shared");
  assert.equal(changelogArgs.since, "3 days ago");
  assert.equal(changelogArgs.outFile, "/tmp/changelog.md");

  const bumpHelp = spawnSync(process.execPath, [BUMP_SCRIPT, "--help"], { encoding: "utf8" });
  assert.equal(bumpHelp.status, 0);
  assert.match(bumpHelp.stdout, /Usage:/);
  assert.match(bumpHelp.stdout, /Product mapping:/);

  const bumpList = spawnSync(process.execPath, [BUMP_SCRIPT, "--list-products"], { encoding: "utf8" });
  assert.equal(bumpList.status, 0);
  const products = JSON.parse(bumpList.stdout);
  assert.ok(products.some((product) => product.product === "contracts"));

  const changelogHelp = spawnSync(process.execPath, [CHANGELOG_SCRIPT, "--help"], { encoding: "utf8" });
  assert.equal(changelogHelp.status, 0);
  assert.match(changelogHelp.stdout, /Unreleased changelog/);
});

test("changelog filtering excludes merge commits and empty subjects", () => {
  const output = [
    "abc1234\t2026-10-26\tfeat: add capability gate",
    "def5678\t2026-10-26\tMerge branch 'feature/x'",
    "",
    "   ",
    "badlinewithouttabs",
    "ghi9012\t2026-10-27\t"
  ].join("\n");

  const commits = filterCommitLines(output);
  assert.equal(commits.length, 1);
  assert.equal(commits[0].hash, "abc1234");
  assert.equal(commits[0].subject, "feat: add capability gate");
  assert.equal(commits[0].date, "2026-10-26");
});

test("changelog markdown groups sections, marks dirty repos, and keeps drafts explicit", () => {
  const markdown = renderChangelogMarkdown({
    generatedAt: "2026-10-27T00:00:00.000Z",
    since: "7 days ago",
    sections: [
      {
        key: "admin",
        label: "管理端",
        repo: "mixlab",
        head: "abc1234",
        branch: "main",
        dirty: true,
        changed_file_count: 4,
        commits: [{ hash: "abc1234", date: "2026-10-26", subject: "feat: version tooling" }],
        unavailable: false
      },
      {
        key: "cutter",
        label: "剪辑端",
        repo: "cutter",
        head: "",
        branch: "",
        dirty: false,
        changed_file_count: 0,
        commits: [],
        unavailable: true
      }
    ]
  });

  assert.match(markdown, /^# Unreleased/m);
  assert.match(markdown, /## 管理端 \(admin\)/);
  assert.match(markdown, /feat: version tooling \(abc1234, 2026-10-26\)/);
  assert.match(markdown, /WARNING: mixlab working tree is dirty/);
  assert.match(markdown, /repo cutter unavailable/);
  assert.match(markdown, /## Repo snapshot/);
  assert.match(markdown, /cutter: unknown, clean, unavailable/);
});

