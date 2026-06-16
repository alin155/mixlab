import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface WindowsTestRunnerPackagePlan {
  source_entry: string;
  bundled_entry: string;
  dist_dir: string;
  executable_output: string;
  shared_runner_dir: string;
  shared_executable_output: string;
  local_manifest_output: string;
  shared_manifest_output: string;
  pkg_binary: string;
  pkg_target: "node22-win-x64";
}

export interface WindowsTestRunnerManifest {
  schema_version: "1.0";
  runner: "mixlab-windows-test-runner";
  version: string;
  built_at: string;
  executable_file: string;
  sha256: string;
  default_port: 3799;
  start_command: string;
}

export interface PackageWindowsTestRunnerInput {
  repo_root?: string;
  share_root?: string;
  skip_package?: boolean;
  platform?: NodeJS.Platform | string;
  built_at?: string;
  run_command?: (command: string, args: string[], cwd: string) => Promise<void>;
  copy_file?: (source: string, target: string) => Promise<void>;
  write_file?: (target: string, contents: string) => Promise<void>;
  sha256_file?: (target: string) => Promise<string>;
}

export function windowsTestRunnerExecutableName(): string {
  return "MixLabWindowsTestRunner.exe";
}

export function defaultWindowsBuildShareRoot(): string {
  return process.env.MIXLAB_WINDOWS_BUILDS_ROOT
    ?? process.env.MIXLAB_WINDOWS_TEST_RUNNER_SHARE_ROOT
    ?? "/Users/huaqihang/Public/MixLabWindowsBuilds";
}

export function pkgCommandForPlatform(
  repoRoot: string,
  platform: NodeJS.Platform | string = process.platform
): string {
  return path.join(repoRoot, "node_modules", ".bin", platform === "win32" ? "pkg.cmd" : "pkg");
}

export function assertWindowsTestRunnerPackageHost(platform: NodeJS.Platform | string = process.platform): void {
  if (platform === "win32") {
    return;
  }

  throw new Error(
    [
      "Windows Test Runner exe 必须在 Windows 打包机上构建。",
      `当前平台: ${platform}`,
      "Mac 侧可以执行 --skip-package 做 bundle 和 manifest 自检，但不能作为正式 Windows Runner exe 产出。",
      "请在 Windows 10/11 64-bit 或 GitHub Actions windows-latest 上执行:",
      "npm run package:windows-test-runner"
    ].join("\n")
  );
}

export function buildWindowsTestRunnerPackagePlan(
  repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  shareRoot = defaultWindowsBuildShareRoot(),
  platform: NodeJS.Platform | string = process.platform
): WindowsTestRunnerPackagePlan {
  const distDir = path.join(repoRoot, "dist", "windows-test-runner");
  const sharedRunnerDir = path.join(shareRoot, "runner");
  return {
    source_entry: path.join(repoRoot, "packages/windows-test-runner/src/index.ts"),
    bundled_entry: path.join(distDir, "mixlab-windows-test-runner.bundle.mjs"),
    dist_dir: distDir,
    executable_output: path.join(distDir, windowsTestRunnerExecutableName()),
    shared_runner_dir: sharedRunnerDir,
    shared_executable_output: path.join(sharedRunnerDir, windowsTestRunnerExecutableName()),
    local_manifest_output: path.join(distDir, "latest.json"),
    shared_manifest_output: path.join(sharedRunnerDir, "latest.json"),
    pkg_binary: pkgCommandForPlatform(repoRoot, platform),
    pkg_target: "node22-win-x64"
  };
}

async function readRunnerVersion(repoRoot: string): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(path.join(repoRoot, "packages/windows-test-runner/package.json"), "utf8")
  ) as { version?: string };
  return packageJson.version ?? "0.0.0";
}

export function createWindowsTestRunnerManifest(input: {
  version: string;
  built_at: string;
  sha256: string;
}): WindowsTestRunnerManifest {
  return {
    schema_version: "1.0",
    runner: "mixlab-windows-test-runner",
    version: input.version,
    built_at: input.built_at,
    executable_file: windowsTestRunnerExecutableName(),
    sha256: input.sha256,
    default_port: 3799,
    start_command: windowsTestRunnerExecutableName()
  };
}

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

export async function packageWindowsTestRunner(input: PackageWindowsTestRunnerInput = {}): Promise<{
  plan: WindowsTestRunnerPackagePlan;
  manifest: WindowsTestRunnerManifest;
  shared_published: boolean;
}> {
  const repoRoot = input.repo_root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const platform = input.platform ?? process.platform;
  if (!input.skip_package) {
    assertWindowsTestRunnerPackageHost(platform);
  }

  const plan = buildWindowsTestRunnerPackagePlan(
    repoRoot,
    input.share_root ?? defaultWindowsBuildShareRoot(),
    platform
  );
  const runner = input.run_command ?? runCommand;
  const copy = input.copy_file ?? copyFile;
  const write = input.write_file ?? ((target, contents) => writeFile(target, contents, "utf8"));
  const hashFile = input.sha256_file ?? sha256File;

  await mkdir(plan.dist_dir, { recursive: true });
  if (!input.skip_package) {
    await mkdir(plan.shared_runner_dir, { recursive: true });
  }

  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: [plan.source_entry],
    outfile: plan.bundled_entry,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    sourcemap: false
  });

  if (!input.skip_package) {
    await runner(
      plan.pkg_binary,
      [
        plan.bundled_entry,
        "--targets",
        plan.pkg_target,
        "--output",
        plan.executable_output
      ],
      repoRoot
    );
    await copy(plan.executable_output, plan.shared_executable_output);
  }

  const manifest = createWindowsTestRunnerManifest({
    version: await readRunnerVersion(repoRoot),
    built_at: input.built_at ?? new Date().toISOString(),
    sha256: input.skip_package ? "" : await hashFile(plan.executable_output)
  });
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  await write(plan.local_manifest_output, manifestText);
  if (!input.skip_package) {
    await write(plan.shared_manifest_output, manifestText);
  }

  return { plan, manifest, shared_published: !input.skip_package };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void packageWindowsTestRunner({
    skip_package: process.argv.includes("--skip-package")
  }).then(({ plan, manifest, shared_published }) => {
    console.log(JSON.stringify({
      ok: true,
      shared_published,
      executable_output: plan.executable_output,
      shared_executable_output: plan.shared_executable_output,
      shared_manifest_output: plan.shared_manifest_output,
      manifest
    }, null, 2));
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
