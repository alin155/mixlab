import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("server script passes cutter workspace root into the API server", async () => {
  const script = await readFile(
    path.join(process.cwd(), "scripts", "servers", "cutter-api-server.ts"),
    "utf8"
  );
  const envExample = await readFile(path.join(process.cwd(), ".env.example"), "utf8");

  assert.match(script, /workspace_root:\s*config\.workspace_root/);
  assert.match(script, /"\/cutter\/cut-jobs"/);
  assert.match(envExample, /MIXLAB_CUTTER_WORKSPACE_ROOT=/);
});

test("admin and cutter server scripts reject temporary runtime roots", async () => {
  const adminScript = await readFile(
    path.join(process.cwd(), "scripts", "servers", "admin-api-server.ts"),
    "utf8"
  );
  const cutterScript = await readFile(
    path.join(process.cwd(), "scripts", "servers", "cutter-api-server.ts"),
    "utf8"
  );
  const envExample = await readFile(path.join(process.cwd(), ".env.example"), "utf8");

  assert.match(adminScript, /assertPersistentRuntimePath/);
  assert.match(cutterScript, /assertPersistentRuntimePath/);
  assert.match(envExample, /MIXLAB_ALLOW_TEMP_RUNTIME_PATHS=0/);
});
