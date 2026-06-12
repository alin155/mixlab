import { copyFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface SearchdSidecarBuildPlan {
  cargo_manifest: string;
  release_binary: string;
  executable_output: string;
}

export interface BuildSearchdSidecarInput {
  repo_root?: string;
  run_command?: (command: string, args: string[], cwd: string) => Promise<void>;
  copy_file?: (sourcePath: string, targetPath: string) => Promise<void>;
  ensure_directory?: (directoryPath: string) => Promise<void>;
}

export function windowsSearchdExecutableName(): string {
  return "mixlab-searchd-x86_64-pc-windows-msvc.exe";
}

export function buildSearchdSidecarPlan(
  repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
): SearchdSidecarBuildPlan {
  return {
    cargo_manifest: path.join(repoRoot, "packages/searchd/Cargo.toml"),
    release_binary: path.join(repoRoot, "packages/searchd/target/release/mixlab-searchd.exe"),
    executable_output: path.join(
      repoRoot,
      "apps/cutter-desktop/src-tauri/binaries",
      windowsSearchdExecutableName()
    )
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

export async function buildSearchdSidecarExecutable(
  input: BuildSearchdSidecarInput = {}
): Promise<SearchdSidecarBuildPlan> {
  const repoRoot = input.repo_root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const plan = buildSearchdSidecarPlan(repoRoot);
  const runner = input.run_command ?? runCommand;
  const ensureDirectory =
    input.ensure_directory ??
    (async (directoryPath: string) => {
      await mkdir(directoryPath, { recursive: true });
    });
  const copier = input.copy_file ?? copyFile;

  await runner("cargo", ["build", "--manifest-path", plan.cargo_manifest, "--release"], repoRoot);
  await ensureDirectory(path.dirname(plan.executable_output));
  await copier(plan.release_binary, plan.executable_output);

  return plan;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void buildSearchdSidecarExecutable().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
