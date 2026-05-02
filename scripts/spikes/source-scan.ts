import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scanSourceVideos } from "../../packages/library-fs/src/index.ts";

async function writeDummyVideo(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "mixlab-spike-video-bytes");
}

async function listTree(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const lines: string[] = [];

  for (const entry of entries.sort((left, right) => {
    if (left.isDirectory() !== right.isDirectory()) {
      return left.isDirectory() ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  })) {
    const childPath = path.join(root, entry.name);
    lines.push(`${prefix}${entry.name}${entry.isDirectory() ? "/" : ""}`);

    if (entry.isDirectory()) {
      lines.push(...(await listTree(childPath, `${prefix}  `)));
    }
  }

  return lines;
}

async function main(): Promise<void> {
  const libraryRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-source-scan-"));

  await writeDummyVideo(path.join(libraryRoot, "source-videos", "课程", "老板现金流.mp4"));
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "访谈.mov"));
  await writeFile(path.join(libraryRoot, "source-videos", "说明.txt"), "not a video");

  const firstScan = await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-01T00:00:00Z"
  });

  await writeDummyVideo(path.join(libraryRoot, "source-videos", "新增课程", "成交复盘.mp4"));

  const secondScan = await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-01T00:05:00Z"
  });

  const mixlabRoot = path.join(libraryRoot, ".mixlab-library");
  const libraryJson = await readFile(path.join(mixlabRoot, "library.json"), "utf8");
  const firstManifest = await readFile(
    path.join(mixlabRoot, "videos", "V000001", "source-video.json"),
    "utf8"
  );

  console.log(`Library root: ${libraryRoot}`);
  console.log("\nFirst scan:");
  console.log(JSON.stringify(firstScan, null, 2));
  console.log("\nSecond scan after adding one video:");
  console.log(JSON.stringify(secondScan, null, 2));
  console.log("\n.mixlab-library tree:");
  console.log((await listTree(mixlabRoot)).map((line) => `  ${line}`).join("\n"));
  console.log("\nlibrary.json:");
  console.log(libraryJson.trim());
  console.log("\nV000001/source-video.json:");
  console.log(firstManifest.trim());
}

await main();
