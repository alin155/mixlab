import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getFileIdentity, hashFileSha256 } from "./file-hash.ts";

async function makeRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mixlab-file-hash-"));
}

test("hashes local files with sha256 prefix", async () => {
  const root = await makeRoot();

  const filePath = path.join(root, "source.mp4");
  await writeFile(filePath, "mixlab");

  assert.equal(
    await hashFileSha256(filePath),
    "sha256:6ee040147a5059533e22f613ccdcb1eb433c7eb3a50e2385f92a44ad0fff24d3"
  );
});

test("builds a fast stat file identity without reading the full file", async () => {
  const root = await makeRoot();
  const filePath = path.join(root, "source.mp4");

  await writeFile(filePath, "abc");

  assert.match(await getFileIdentity(filePath, "stat"), /^stat:size:3:mtime_ms:\d+$/);
});

test("can use sha256 when an exact content hash is required", async () => {
  const root = await makeRoot();
  const filePath = path.join(root, "source.mp4");

  await writeFile(filePath, "mixlab");

  assert.equal(
    await getFileIdentity(filePath, "sha256"),
    "sha256:6ee040147a5059533e22f613ccdcb1eb433c7eb3a50e2385f92a44ad0fff24d3"
  );
});
