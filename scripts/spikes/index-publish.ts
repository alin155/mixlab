import { mkdtemp, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { publishIndexPackage, readCurrentIndexPointer } from "../../packages/library-fs/src/index.ts";

async function listTree(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const lines: string[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const childPath = path.join(root, entry.name);
    lines.push(`${prefix}${entry.name}${entry.isDirectory() ? "/" : ""}`);

    if (entry.isDirectory()) {
      lines.push(...(await listTree(childPath, `${prefix}  `)));
    }
  }

  return lines;
}

async function main(): Promise<void> {
  const libraryRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-index-spike-"));

  await publishIndexPackage({
    library_root: libraryRoot,
    manifest: {
      index_version: "v000001",
      library_id: "lib_main_001",
      created_at: "2026-05-01T00:00:00Z",
      ready_video_count: 1,
      source_video_ids: ["V000001"],
      schema_version: "1.0"
    },
    index_sqlite_bytes: Buffer.from("sqlite-spike-v1")
  });

  await publishIndexPackage({
    library_root: libraryRoot,
    manifest: {
      index_version: "v000002",
      library_id: "lib_main_001",
      created_at: "2026-05-01T00:05:00Z",
      ready_video_count: 2,
      source_video_ids: ["V000001", "V000002"],
      schema_version: "1.0"
    },
    index_sqlite_bytes: Buffer.from("sqlite-spike-v2")
  });

  const indexRoot = path.join(
    libraryRoot,
    ".mixlab-library",
    "indexes",
    "source-transcript-index"
  );
  const current = await readCurrentIndexPointer(libraryRoot);
  const currentJson = await readFile(path.join(indexRoot, "current.json"), "utf8");

  console.log(`Library root: ${libraryRoot}`);
  console.log("\nIndex tree:");
  console.log((await listTree(indexRoot)).map((line) => `  ${line}`).join("\n"));
  console.log("\nCurrent pointer:");
  console.log(JSON.stringify(current, null, 2));
  console.log("\ncurrent.json:");
  console.log(currentJson.trim());
}

await main();
