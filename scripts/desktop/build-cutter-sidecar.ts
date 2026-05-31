import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface CutterSidecarBuildPlan {
  source_entry: string;
  bundled_entry: string;
  executable_output: string;
  pkg_binary: string;
  pkg_target: "node22-win-x64";
}

export function windowsSidecarExecutableName(): string {
  return "cutter-api-sidecar-x86_64-pc-windows-msvc.exe";
}

const windowsGuiSubsystem = 2;
const peSubsystemOffsetFromPeHeader = 0x5c;

export interface WindowsPeSubsystemPatchResult {
  previous_subsystem: number;
  next_subsystem: number;
}

function peHeaderOffset(buffer: Buffer): number {
  if (buffer.length < 0x40 || buffer.toString("ascii", 0, 2) !== "MZ") {
    throw new Error("不是有效的 Windows PE 可执行文件：缺少 MZ 头");
  }

  const offset = buffer.readUInt32LE(0x3c);
  if (offset < 0 || offset + peSubsystemOffsetFromPeHeader + 2 > buffer.length) {
    throw new Error("不是有效的 Windows PE 可执行文件：PE 头偏移无效");
  }

  if (buffer.toString("ascii", offset, offset + 4) !== "PE\0\0") {
    throw new Error("不是有效的 Windows PE 可执行文件：缺少 PE 签名");
  }

  return offset;
}

export function readWindowsPeSubsystem(buffer: Buffer): number {
  const offset = peHeaderOffset(buffer);
  return buffer.readUInt16LE(offset + peSubsystemOffsetFromPeHeader);
}

export function setWindowsPeSubsystemToGui(buffer: Buffer): WindowsPeSubsystemPatchResult {
  const offset = peHeaderOffset(buffer);
  const previousSubsystem = buffer.readUInt16LE(offset + peSubsystemOffsetFromPeHeader);
  buffer.writeUInt16LE(windowsGuiSubsystem, offset + peSubsystemOffsetFromPeHeader);
  return {
    previous_subsystem: previousSubsystem,
    next_subsystem: windowsGuiSubsystem
  };
}

async function patchWindowsSidecarToGuiSubsystem(executablePath: string): Promise<WindowsPeSubsystemPatchResult> {
  const executable = await readFile(executablePath);
  const result = setWindowsPeSubsystemToGui(executable);
  if (result.previous_subsystem !== result.next_subsystem) {
    await writeFile(executablePath, executable);
  }
  return result;
}

export function buildCutterSidecarPlan(repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")): CutterSidecarBuildPlan {
  return {
    source_entry: path.join(repoRoot, "packages/cutter-api/src/desktop-sidecar.ts"),
    bundled_entry: path.join(repoRoot, "apps/cutter-desktop/src-tauri/binaries/cutter-api-sidecar.bundle.mjs"),
    executable_output: path.join(
      repoRoot,
      "apps/cutter-desktop/src-tauri/binaries",
      windowsSidecarExecutableName()
    ),
    pkg_binary: path.join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "pkg.cmd" : "pkg"),
    pkg_target: "node22-win-x64"
  };
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

export async function buildCutterSidecarExecutable(input: {
  repo_root?: string;
  skip_package?: boolean;
} = {}): Promise<CutterSidecarBuildPlan> {
  const repoRoot = input.repo_root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const plan = buildCutterSidecarPlan(repoRoot);
  await mkdir(path.dirname(plan.bundled_entry), { recursive: true });

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
    await runCommand(
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
    const patchResult = await patchWindowsSidecarToGuiSubsystem(plan.executable_output);
    console.log(
      `[M18 Windows Desktop] sidecar PE subsystem: ${patchResult.previous_subsystem} -> ${patchResult.next_subsystem}`
    );
  }

  return plan;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void buildCutterSidecarExecutable({ skip_package: process.argv.includes("--skip-package") }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
