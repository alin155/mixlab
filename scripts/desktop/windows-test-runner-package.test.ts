import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertWindowsTestRunnerPackageHost,
  buildWindowsTestRunnerPackagePlan,
  createWindowsTestRunnerManifest,
  defaultWindowsBuildShareRoot,
  packageWindowsTestRunner,
  pkgCommandForPlatform,
  windowsTestRunnerExecutableName
} from "./package-windows-test-runner.ts";

test("Windows Test Runner package plan targets a standalone Windows exe and shared runner manifest", () => {
  assert.equal(windowsTestRunnerExecutableName(), "MixLabWindowsTestRunner.exe");
  assert.equal(pkgCommandForPlatform("/repo", "win32"), path.join("/repo", "node_modules/.bin/pkg.cmd"));
  assert.equal(pkgCommandForPlatform("/repo", "darwin"), path.join("/repo", "node_modules/.bin/pkg"));
  assert.deepEqual(buildWindowsTestRunnerPackagePlan("/repo", "/share", "win32"), {
    source_entry: path.join("/repo", "packages/windows-test-runner/src/cli.ts"),
    bundled_entry: path.join("/repo", "dist/windows-test-runner/mixlab-windows-test-runner.bundle.mjs"),
    dist_dir: path.join("/repo", "dist/windows-test-runner"),
    executable_output: path.join("/repo", "dist/windows-test-runner/MixLabWindowsTestRunner.exe"),
    shared_runner_dir: path.join("/share", "runner"),
    shared_executable_output: path.join("/share", "runner/MixLabWindowsTestRunner.exe"),
    local_manifest_output: path.join("/repo", "dist/windows-test-runner/latest.json"),
    shared_manifest_output: path.join("/share", "runner/latest.json"),
    pkg_binary: path.join("/repo", "node_modules/.bin/pkg.cmd"),
    pkg_target: "node22-win-x64"
  });
});

test("Windows Test Runner manifest exposes stable launch metadata", () => {
  assert.deepEqual(createWindowsTestRunnerManifest({
    version: "0.1.0",
    built_at: "2026-06-16T00:00:00.000Z",
    sha256: "abc"
  }), {
    schema_version: "1.0",
    runner: "mixlab-windows-test-runner",
    version: "0.1.0",
    built_at: "2026-06-16T00:00:00.000Z",
    executable_file: "MixLabWindowsTestRunner.exe",
    sha256: "abc",
    default_port: 3799,
    start_command: "MixLabWindowsTestRunner.exe"
  });
});

test("root package exposes Windows Test Runner lifecycle scripts", async () => {
  const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

  assert.equal(packageJson.scripts["dev:windows-test-runner"], "npm run dev -w @mixlab/windows-test-runner");
  assert.equal(packageJson.scripts["test:windows-test-runner"], "npm run test -w @mixlab/windows-test-runner && node --test --import tsx scripts/desktop/windows-test-runner-package.test.ts");
  assert.equal(packageJson.scripts["package:windows-test-runner"], "tsx scripts/desktop/package-windows-test-runner.ts");
});

test("Windows Test Runner launcher does not map UNC shares with pushd", async () => {
  const launcher = await readFile(
    path.join(process.cwd(), "scripts/desktop/start-windows-test-runner.cmd"),
    "utf8"
  );

  assert.match(launcher, /set "SHARE_ROOT=%~dp0"/);
  assert.doesNotMatch(launcher, /\bpushd\b/i);
  assert.doesNotMatch(launcher, /\bpopd\b/i);
});

test("default Windows Test Runner shared root follows the existing handoff folder", () => {
  assert.equal(defaultWindowsBuildShareRoot(), "/Users/huaqihang/Public/MixLabWindowsBuilds");
});

test("Windows Test Runner exe packaging fails early on non-Windows hosts", () => {
  assert.throws(
    () => assertWindowsTestRunnerPackageHost("darwin"),
    /Windows Test Runner exe 必须在 Windows 打包机上构建/
  );
  assert.doesNotThrow(() => assertWindowsTestRunnerPackageHost("win32"));
});

test("skip-package bundle self-check does not publish an incomplete shared manifest", async () => {
  const root = await mkdir(path.join(os.tmpdir(), `mixlab-runner-package-${Date.now()}`), { recursive: true });
  const repoRoot = path.join(root, "repo");
  const shareRoot = path.join(root, "share");

  await mkdir(path.join(repoRoot, "packages/windows-test-runner/src"), { recursive: true });
  await writeFile(
    path.join(repoRoot, "packages/windows-test-runner/package.json"),
    JSON.stringify({ version: "9.9.9" }),
    "utf8"
  );
  await writeFile(
    path.join(repoRoot, "packages/windows-test-runner/src/index.ts"),
    "export function startWindowsTestRunner() { console.log('runner self-check'); }\n",
    "utf8"
  );
  await writeFile(
    path.join(repoRoot, "packages/windows-test-runner/src/cli.ts"),
    "import { startWindowsTestRunner } from './index.ts'; startWindowsTestRunner();\n",
    "utf8"
  );

  const result = await packageWindowsTestRunner({
    repo_root: repoRoot,
    share_root: shareRoot,
    skip_package: true,
    built_at: "2026-06-16T00:00:00.000Z"
  });

  const localManifest = await readFile(result.plan.local_manifest_output, "utf8");
  assert.equal(result.shared_published, false);
  assert.match(localManifest, /"version": "9.9.9"/);
  await assert.rejects(() => readFile(result.plan.shared_manifest_output, "utf8"), /ENOENT/);
});

test("GitHub Actions workflow packages the Windows Test Runner exe as a downloadable artifact", async () => {
  const workflow = await readFile(
    path.join(process.cwd(), ".github/workflows/windows-test-runner.yml"),
    "utf8"
  );

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /branches:\s*\n\s*- main\s*\n\s*- "codex\/\*\*"/);
  assert.match(workflow, /runs-on:\s*windows-latest/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run test:windows-test-runner/);
  assert.match(workflow, /npm run package:windows-test-runner/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /dist\/windows-test-runner\/MixLabWindowsTestRunner\.exe/);
  assert.match(workflow, /dist\/windows-test-runner\/latest\.json/);
});
