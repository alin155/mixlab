import path from "node:path";
import { loadEnvFile } from "../../packages/runtime-config/src/index.ts";

export async function loadProjectEnv(): Promise<void> {
  await loadEnvFile({
    file_path: path.resolve(process.cwd(), ".env.local"),
    optional: true
  });
}
