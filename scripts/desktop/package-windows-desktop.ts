import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface WindowsDesktopPackageStep {
  label: string;
  command: string;
  args: string[];
  cwd: string;
}

export interface PackageWindowsDesktopInput {
  repo_root?: string;
  platform?: NodeJS.Platform | string;
  run_command?: (step: WindowsDesktopPackageStep) => Promise<void>;
}

export function npmCommandForPlatform(platform: NodeJS.Platform | string = process.platform): string {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export function assertWindowsPackagingHost(platform: NodeJS.Platform | string = process.platform): void {
  if (platform === "win32") {
    return;
  }

  throw new Error(
    [
      "Windows 桌面版安装包必须在 Windows 打包机上构建。",
      `当前平台: ${platform}`,
      "请在 Windows 10/11 64-bit 机器上准备 Node.js/npm、Rust/Tauri、Windows 版 FFmpeg/FFprobe 运行资产后执行:",
      "npm run package:cutter-desktop:windows"
    ].join("\n")
  );
}

export function createWindowsDesktopPackagePlan(
  repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
): WindowsDesktopPackageStep[] {
  return [
    {
      label: "build cutter web",
      command: "npm",
      args: ["run", "build:cutter-web"],
      cwd: repoRoot
    },
    {
      label: "build cutter API sidecar exe",
      command: "npm",
      args: ["run", "build:sidecar", "-w", "@mixlab/cutter-desktop"],
      cwd: repoRoot
    },
    {
      label: "build searchd sidecar exe",
      command: "npm",
      args: ["run", "build:searchd", "-w", "@mixlab/cutter-desktop"],
      cwd: repoRoot
    },
    {
      label: "prepare Windows runtime assets",
      command: "npm",
      args: ["run", "prepare:cutter-desktop:windows-assets"],
      cwd: repoRoot
    },
    {
      label: "verify Windows runtime assets",
      command: "npm",
      args: ["run", "verify:cutter-desktop:windows-assets"],
      cwd: repoRoot
    },
    {
      label: "build Tauri NSIS installer",
      command: "npm",
      args: ["run", "tauri:build", "-w", "@mixlab/cutter-desktop"],
      cwd: repoRoot
    }
  ];
}

function runCommand(step: WindowsDesktopPackageStep, platform: NodeJS.Platform | string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      cwd: step.cwd,
      stdio: "inherit",
      shell: platform === "win32"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${step.command} ${step.args.join(" ")} exited with ${code}`));
    });
  });
}

export async function packageWindowsDesktop(input: PackageWindowsDesktopInput = {}): Promise<void> {
  const platform = input.platform ?? process.platform;
  assertWindowsPackagingHost(platform);

  const repoRoot = input.repo_root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const npmCommand = npmCommandForPlatform(platform);
  const plan = createWindowsDesktopPackagePlan(repoRoot).map((step) => ({
    ...step,
    command: step.command === "npm" ? npmCommand : step.command
  }));
  const runner = input.run_command ?? ((step: WindowsDesktopPackageStep) => runCommand(step, platform));

  for (const step of plan) {
    console.log(`\n[M18 Windows Desktop] ${step.label}`);
    await runner(step);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void packageWindowsDesktop().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
