import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildCutterSidecarPlan,
  windowsSidecarExecutableName
} from "./build-cutter-sidecar.ts";
import {
  requiredWindowsRuntimeAssets,
  verifyWindowsRuntimeAssets
} from "./verify-windows-runtime-assets.ts";
import {
  assertWindowsRuntimeAssetHost,
  createWindowsRuntimeAssetCopyPlan,
  prepareWindowsRuntimeAssets
} from "./prepare-windows-runtime-assets.ts";
import {
  assertWindowsPackagingHost,
  createWindowsDesktopPackagePlan,
  npmCommandForPlatform,
  packageWindowsDesktop
} from "./package-windows-desktop.ts";

test("build sidecar plan targets a Windows x64 executable for Tauri sidecar naming", () => {
  assert.equal(windowsSidecarExecutableName(), "cutter-api-sidecar-x86_64-pc-windows-msvc.exe");
  assert.deepEqual(buildCutterSidecarPlan("/repo"), {
    source_entry: path.join("/repo", "packages/cutter-api/src/desktop-sidecar.ts"),
    bundled_entry: path.join("/repo", "apps/cutter-desktop/src-tauri/binaries/cutter-api-sidecar.bundle.mjs"),
    executable_output: path.join(
      "/repo",
      "apps/cutter-desktop/src-tauri/binaries/cutter-api-sidecar-x86_64-pc-windows-msvc.exe"
    ),
    pkg_binary: path.join("/repo", "node_modules/.bin", process.platform === "win32" ? "pkg.cmd" : "pkg"),
    pkg_target: "node22-win-x64"
  });
});

test("runtime asset verifier reports missing Windows desktop assets", async () => {
  const root = await mkdir(path.join(os.tmpdir(), `mixlab-runtime-assets-${Date.now()}`), { recursive: true });
  const result = await verifyWindowsRuntimeAssets(root);

  assert.equal(result.status, "fail");
  assert.deepEqual(result.missing.sort(), requiredWindowsRuntimeAssets(root).sort());
});

test("runtime asset verifier passes when all required Windows desktop assets exist", async () => {
  const root = await mkdir(path.join(os.tmpdir(), `mixlab-runtime-assets-${Date.now()}`), { recursive: true });
  for (const asset of requiredWindowsRuntimeAssets(root)) {
    await mkdir(path.dirname(asset), { recursive: true });
    await writeFile(asset, "placeholder");
  }

  const result = await verifyWindowsRuntimeAssets(root);
  assert.deepEqual(result, { status: "pass", missing: [] });
});

test("root package exposes cutter desktop lifecycle scripts", async () => {
  const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

  assert.equal(packageJson.scripts["dev:cutter-desktop"], "npm run dev -w @mixlab/cutter-desktop");
  assert.equal(
    packageJson.scripts["build:cutter-desktop"],
    "npm run package:cutter-desktop:windows"
  );
  assert.equal(
    packageJson.scripts["package:cutter-desktop:windows"],
    "tsx scripts/desktop/package-windows-desktop.ts"
  );
  assert.equal(
    packageJson.scripts["prepare:cutter-desktop:windows-assets"],
    "tsx scripts/desktop/prepare-windows-runtime-assets.ts"
  );
  assert.equal(
    packageJson.scripts["verify:cutter-desktop:windows-assets"],
    "tsx scripts/desktop/verify-windows-runtime-assets.ts"
  );
});

test("Windows runtime asset preparation copies bundled FFmpeg binaries into Tauri resources", () => {
  assert.deepEqual(
    createWindowsRuntimeAssetCopyPlan("/repo", {
      ffmpeg_path: String.raw`C:\tools\ffmpeg.exe`,
      ffprobe_path: String.raw`C:\tools\ffprobe.exe`,
      source: "bundled-static"
    }),
    [
      {
        label: "copy ffmpeg.exe",
        source_path: String.raw`C:\tools\ffmpeg.exe`,
        target_path: path.join("/repo", "apps/cutter-desktop/src-tauri/binaries/ffmpeg.exe")
      },
      {
        label: "copy ffprobe.exe",
        source_path: String.raw`C:\tools\ffprobe.exe`,
        target_path: path.join("/repo", "apps/cutter-desktop/src-tauri/binaries/ffprobe.exe")
      }
    ]
  );
});

test("Windows runtime asset preparation fails early on non-Windows hosts", () => {
  assert.throws(
    () => assertWindowsRuntimeAssetHost("darwin"),
    /Windows 打包机/
  );
});

test("Windows runtime asset preparation executes copy operations on Windows", async () => {
  const copies: string[] = [];

  await prepareWindowsRuntimeAssets({
    repo_root: "/repo",
    platform: "win32",
    runtime: {
      ffmpeg_path: String.raw`C:\tools\ffmpeg.exe`,
      ffprobe_path: String.raw`C:\tools\ffprobe.exe`,
      source: "bundled-static"
    },
    ensure_directory: async () => {
      // no-op for the command-order unit test
    },
    copy_file: async (sourcePath, targetPath) => {
      copies.push(`${sourcePath} -> ${targetPath}`);
    }
  });

  assert.deepEqual(copies, [
    `${String.raw`C:\tools\ffmpeg.exe`} -> ${path.join("/repo", "apps/cutter-desktop/src-tauri/binaries/ffmpeg.exe")}`,
    `${String.raw`C:\tools\ffprobe.exe`} -> ${path.join("/repo", "apps/cutter-desktop/src-tauri/binaries/ffprobe.exe")}`
  ]);
});

test("Windows desktop package plan runs the required build steps in order", () => {
  assert.equal(npmCommandForPlatform("win32"), "npm.cmd");
  assert.equal(npmCommandForPlatform("darwin"), "npm");
  assert.deepEqual(createWindowsDesktopPackagePlan("/repo"), [
    { label: "build cutter web", command: "npm", args: ["run", "build:cutter-web"], cwd: "/repo" },
    {
      label: "build cutter API sidecar exe",
      command: "npm",
      args: ["run", "build:sidecar", "-w", "@mixlab/cutter-desktop"],
      cwd: "/repo"
    },
    {
      label: "prepare Windows runtime assets",
      command: "npm",
      args: ["run", "prepare:cutter-desktop:windows-assets"],
      cwd: "/repo"
    },
    {
      label: "verify Windows runtime assets",
      command: "npm",
      args: ["run", "verify:cutter-desktop:windows-assets"],
      cwd: "/repo"
    },
    {
      label: "build Tauri NSIS installer",
      command: "npm",
      args: ["run", "tauri:build", "-w", "@mixlab/cutter-desktop"],
      cwd: "/repo"
    }
  ]);
});

test("Windows desktop packaging fails early on non-Windows hosts", () => {
  assert.throws(
    () => assertWindowsPackagingHost("darwin"),
    /Windows 打包机/
  );
});

test("Windows desktop packaging executes all plan steps on Windows", async () => {
  const calls: string[] = [];

  await packageWindowsDesktop({
    repo_root: "/repo",
    platform: "win32",
    run_command: async (step) => {
      calls.push(`${step.command} ${step.args.join(" ")}`);
    }
  });

  assert.deepEqual(calls, [
    "npm.cmd run build:cutter-web",
    "npm.cmd run build:sidecar -w @mixlab/cutter-desktop",
    "npm.cmd run prepare:cutter-desktop:windows-assets",
    "npm.cmd run verify:cutter-desktop:windows-assets",
    "npm.cmd run tauri:build -w @mixlab/cutter-desktop"
  ]);
});

test("GitHub Actions workflow packages the Windows desktop installer as a downloadable artifact", async () => {
  const workflow = await readFile(
    path.join(process.cwd(), ".github/workflows/cutter-desktop-windows.yml"),
    "utf8"
  );

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /runs-on:\s*windows-latest/);
  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /dtolnay\/rust-toolchain@stable/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run package:cutter-desktop:windows/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /apps\/cutter-desktop\/src-tauri\/target\/release\/bundle\/nsis\/\*.exe/);
});
