import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveFfmpegRuntime,
  type FfmpegRuntime
} from "../../packages/ffmpeg-core/src/index.ts";

export interface WindowsRuntimeAssetCopyOperation {
  label: string;
  source_path: string;
  target_path: string;
}

export interface PrepareWindowsRuntimeAssetsInput {
  repo_root?: string;
  platform?: NodeJS.Platform | string;
  runtime?: FfmpegRuntime;
  ensure_directory?: (directoryPath: string) => Promise<void>;
  copy_file?: (sourcePath: string, targetPath: string) => Promise<void>;
}

export function assertWindowsRuntimeAssetHost(platform: NodeJS.Platform | string = process.platform): void {
  if (platform === "win32") {
    return;
  }

  throw new Error(
    [
      "Windows 运行资产必须在 Windows 打包机上准备。",
      `当前平台: ${platform}`,
      "请通过 GitHub Actions 或 Windows 10/11 64-bit 打包机执行:",
      "npm run package:cutter-desktop:windows"
    ].join("\n")
  );
}

export function createWindowsRuntimeAssetCopyPlan(
  repoRoot: string,
  runtime: FfmpegRuntime
): WindowsRuntimeAssetCopyOperation[] {
  const targetDir = path.join(repoRoot, "apps/cutter-desktop/src-tauri/binaries");

  return [
    {
      label: "copy ffmpeg.exe",
      source_path: runtime.ffmpeg_path,
      target_path: path.join(targetDir, "ffmpeg.exe")
    },
    {
      label: "copy ffprobe.exe",
      source_path: runtime.ffprobe_path,
      target_path: path.join(targetDir, "ffprobe.exe")
    }
  ];
}

export async function prepareWindowsRuntimeAssets(
  input: PrepareWindowsRuntimeAssetsInput = {}
): Promise<WindowsRuntimeAssetCopyOperation[]> {
  const platform = input.platform ?? process.platform;
  assertWindowsRuntimeAssetHost(platform);

  const repoRoot = input.repo_root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const runtime = input.runtime ?? resolveFfmpegRuntime();
  const operations = createWindowsRuntimeAssetCopyPlan(repoRoot, runtime);
  const ensureDirectory = input.ensure_directory ?? ((directoryPath: string) => mkdir(directoryPath, { recursive: true }).then(() => undefined));
  const copy = input.copy_file ?? copyFile;

  for (const operation of operations) {
    await ensureDirectory(path.dirname(operation.target_path));
    console.log(`[M18 Windows Desktop] ${operation.label}`);
    await copy(operation.source_path, operation.target_path);
  }

  return operations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void prepareWindowsRuntimeAssets().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
