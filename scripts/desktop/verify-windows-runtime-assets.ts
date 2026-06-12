import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { windowsSidecarExecutableName } from "./build-cutter-sidecar.ts";
import { windowsSearchdExecutableName } from "./build-searchd-sidecar.ts";

export interface RuntimeAssetVerificationResult {
  status: "pass" | "fail";
  missing: string[];
}

export function requiredWindowsRuntimeAssets(repoRoot: string): string[] {
  return [
    path.join(repoRoot, "apps/cutter-desktop/src-tauri/binaries", windowsSidecarExecutableName()),
    path.join(repoRoot, "apps/cutter-desktop/src-tauri/binaries", windowsSearchdExecutableName()),
    path.join(repoRoot, "apps/cutter-desktop/src-tauri/binaries/ffmpeg.exe"),
    path.join(repoRoot, "apps/cutter-desktop/src-tauri/binaries/ffprobe.exe"),
    path.join(repoRoot, "apps/cutter-desktop/src-tauri/resources/default-desktop-config.json"),
    path.join(repoRoot, "apps/cutter-web/dist/index.html")
  ];
}

export async function verifyWindowsRuntimeAssets(repoRoot: string): Promise<RuntimeAssetVerificationResult> {
  const missing: string[] = [];

  for (const asset of requiredWindowsRuntimeAssets(repoRoot)) {
    try {
      await access(asset);
    } catch {
      missing.push(asset);
    }
  }

  return {
    status: missing.length === 0 ? "pass" : "fail",
    missing
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  void verifyWindowsRuntimeAssets(repoRoot).then((result) => {
    if (result.status === "pass") {
      console.log("Windows desktop runtime assets are present.");
      return;
    }

    console.error("Missing Windows desktop runtime assets:");
    for (const asset of result.missing) {
      console.error(`- ${asset}`);
    }
    process.exitCode = 1;
  });
}
