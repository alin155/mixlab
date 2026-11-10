import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(toolDir, "dist", "MixLabCutterRepairTool.exe");
const targetDir = path.resolve(toolDir, "..", "src-tauri", "binaries");
const target = path.join(targetDir, "MixLab Cutter 修复工具.exe");

if (!existsSync(source)) {
  throw new Error("repair tool executable not found: " + source);
}
mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);
console.log("[repair tool] copied resource to " + target);
