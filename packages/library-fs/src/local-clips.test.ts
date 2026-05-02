import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  allocateNextLocalClipId,
  buildLocalClipArtifactPaths,
  getLocalClipDetail,
  listLocalClips,
  writeLocalClipManifest
} from "./index.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdir(path.join(os.tmpdir(), `mixlab-local-clips-${Date.now()}-`), {
    recursive: true
  }).then((root) => {
    if (!root) {
      throw new Error("failed to create library root");
    }

    return root;
  });
}

test("allocates stable local clip ids and artifact paths", async () => {
  const libraryRoot = await makeLibraryRoot();

  assert.equal(await allocateNextLocalClipId(libraryRoot), "LC000001");

  const firstPaths = buildLocalClipArtifactPaths({
    library_root: libraryRoot,
    local_clip_id: "LC000001"
  });

  assert.equal(
    firstPaths.media_path,
    ".mixlab-library/local-clips/LC000001/clip.mp4"
  );
  assert.equal(
    firstPaths.media_file_path,
    path.join(libraryRoot, ".mixlab-library", "local-clips", "LC000001", "clip.mp4")
  );

  await mkdir(path.dirname(firstPaths.media_file_path), { recursive: true });
  await writeFile(firstPaths.media_file_path, "clip-bytes");
  await writeLocalClipManifest({
    library_root: libraryRoot,
    local_clip_id: "LC000001",
    title: "C0018 00:11-00:35",
    source_video_id: "V000001",
    source_title: "C0018",
    source_relative_path: "C0018.MP4",
    begin_ms: 11_000,
    end_ms: 35_000,
    selected_text: "股权融资，激励团队。",
    cut_mode: "copy",
    media_path: firstPaths.media_path,
    created_at: "2026-05-02T08:00:00Z"
  });

  assert.equal(await allocateNextLocalClipId(libraryRoot), "LC000002");
});

test("lists and reads local clips with absolute media paths", async () => {
  const libraryRoot = await makeLibraryRoot();

  for (const item of [
    {
      local_clip_id: "LC000001",
      title: "片段 1",
      created_at: "2026-05-02T08:00:00Z"
    },
    {
      local_clip_id: "LC000002",
      title: "片段 2",
      created_at: "2026-05-02T09:00:00Z"
    }
  ]) {
    const paths = buildLocalClipArtifactPaths({
      library_root: libraryRoot,
      local_clip_id: item.local_clip_id
    });
    await mkdir(path.dirname(paths.media_file_path), { recursive: true });
    await writeFile(paths.media_file_path, `${item.local_clip_id}-bytes`);
    await writeLocalClipManifest({
      library_root: libraryRoot,
      local_clip_id: item.local_clip_id,
      title: item.title,
      source_video_id: "V000001",
      source_title: "C0018",
      source_relative_path: "C0018.MP4",
      begin_ms: 1_000,
      end_ms: 3_000,
      selected_text: "测试文案",
      cut_mode: "copy",
      media_path: paths.media_path,
      created_at: item.created_at
    });
  }

  const clips = await listLocalClips({ library_root: libraryRoot });
  assert.equal(clips.local_clip_count, 2);
  assert.deepEqual(
    clips.clips.map((clip) => clip.local_clip_id),
    ["LC000002", "LC000001"]
  );
  assert.equal(clips.clips[0]?.duration_ms, 2_000);
  assert.equal(
    clips.clips[0]?.media_file_path,
    path.join(libraryRoot, ".mixlab-library", "local-clips", "LC000002", "clip.mp4")
  );

  const detail = await getLocalClipDetail({
    library_root: libraryRoot,
    local_clip_id: "LC000001"
  });
  assert.equal(detail?.title, "片段 1");
  assert.equal(detail?.selected_text, "测试文案");

  const missing = await getLocalClipDetail({
    library_root: libraryRoot,
    local_clip_id: "LC999999"
  });
  assert.equal(missing, null);
});

test("rejects invalid local clip manifests before writing", async () => {
  const libraryRoot = await makeLibraryRoot();

  await assert.rejects(
    () =>
      writeLocalClipManifest({
        library_root: libraryRoot,
        local_clip_id: "LC000001",
        title: "片段 1",
        source_video_id: "V000001",
        source_title: "C0018",
        source_relative_path: "C0018.MP4",
        begin_ms: 1_000,
        end_ms: 3_000,
        selected_text: "测试文案",
        cut_mode: "copy",
        media_path: "../outside.mp4",
        created_at: "2026-05-02T08:00:00Z"
      }),
    /media_path must be portable/
  );
});
