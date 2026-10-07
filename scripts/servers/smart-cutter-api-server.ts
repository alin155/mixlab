import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SmartCore, createSmartServer } from "../../packages/smart-cutter/src/index.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runtime = process.env.MIXLAB_SMART_AI_ROOT || path.join(repo, "apps/smart-cutter-desktop/src-tauri/runtime");
const core = new SmartCore({
  state_root: process.env.MIXLAB_SMART_STATE_ROOT || path.join(os.homedir(), ".mixlab-smart-cutter"),
  workspace_root: process.env.MIXLAB_SMART_WORKSPACE_ROOT,
  auth_mode: process.env.MIXLAB_SMART_AUTH_MODE === "local_trusted" ? "local_trusted" : "reviewed",
  ai: {
    python: process.env.MIXLAB_SMART_PYTHON || path.join(runtime, "python", process.platform === "win32" ? "python.exe" : "bin/python"),
    script: process.env.MIXLAB_SMART_AI_SCRIPT || path.join(repo, "scripts/smart-cutter/ai-worker.py"),
    models: path.join(runtime, "models")
  }
});
await core.initialize();
const port = Number(process.env.MIXLAB_SMART_PORT || 3792);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("invalid smart API port");
const server = createSmartServer(core, process.env.MIXLAB_SMART_API_TOKEN || "");
server.listen(port, "127.0.0.1", () => console.log(JSON.stringify({ event: "smart_cutter_started", version: "0.1.0", url: `http://127.0.0.1:${port}` })));
let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return; closing = true;
  await core.close(); server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });
