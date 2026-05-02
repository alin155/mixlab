import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createAdminApiServer } from "./index.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-api-"));
}

async function withServer(
  libraryRoot: string,
  callback: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createAdminApiServer({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    now: () => "2026-05-02T12:00:00.000Z",
    env: {
      DASHSCOPE_API_KEY: "sk-test-secret",
      MIXLAB_ASR_MODEL: "paraformer-v2"
    } as NodeJS.ProcessEnv
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  assert.ok(address && typeof address === "object");

  try {
    await callback(`http://127.0.0.1:${(address as AddressInfo).port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function postJson(baseUrl: string, pathName: string, body: unknown = {}): Promise<any> {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  return response.json();
}

async function patchJson(baseUrl: string, pathName: string, body: unknown): Promise<any> {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  return response.json();
}

test("initializes, scans, and reports a public library dashboard", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeFile(path.join(libraryRoot, "source-videos", "cashflow.mp4"), "video");

  await withServer(libraryRoot, async (baseUrl) => {
    assert.equal((await postJson(baseUrl, "/api/admin/library/init")).ok, true);
    const scan = await postJson(baseUrl, "/api/admin/library/scan");
    assert.equal(scan.data.new_video_count, 1);

    const status = await (await fetch(`${baseUrl}/api/admin/library/status`)).json();
    assert.equal(status.ok, true);
    assert.equal(status.data.library_id, "lib_main_001");
    assert.equal(status.data.video_count, 1);
    assert.equal(status.data.unprocessed_video_count, 1);

    const videos = await (await fetch(`${baseUrl}/api/admin/source-videos`)).json();
    assert.equal(videos.data[0].source_video_id, "V000001");
    assert.equal(videos.data[0].preprocess_status, "unprocessed");
    assert.equal(videos.data[0].visible_to_cutters, false);
  });
});

test("queues unprocessed videos and lets admin edit public source metadata", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeFile(path.join(libraryRoot, "source-videos", "cashflow.mp4"), "video");

  await withServer(libraryRoot, async (baseUrl) => {
    await postJson(baseUrl, "/api/admin/library/init");
    await postJson(baseUrl, "/api/admin/library/scan");

    const queued = await postJson(baseUrl, "/api/admin/preprocess/queue-unprocessed");
    assert.equal(queued.data.affected_count, 1);

    const metadata = await patchJson(baseUrl, "/api/admin/source-videos/V000001/metadata", {
      title: "现金流管理",
      tags: ["现金流", "财务"],
      description: "剪辑端卡片说明",
      lecturer: "李老师",
      course: "经营课",
      category: "财务"
    });
    assert.equal(metadata.data.title, "现金流管理");
    assert.deepEqual(metadata.data.tags, ["现金流", "财务"]);

    const manifest = JSON.parse(
      await readFile(
        path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json"),
        "utf8"
      )
    );
    assert.equal(manifest.preprocess_status, "queued");
    assert.equal(manifest.title, "现金流管理");
    assert.equal(manifest.visible_to_cutters, false);
  });
});
