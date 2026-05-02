import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  allocateNextExportClipId,
  buildExportClipArtifactPaths,
  buildExportClipFileName,
  getExportClipDetail,
  listExportClips,
  writeExportClipManifest
} from "./export-manifest.ts";

async function makeWorkspaceRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-local-export-"));
}

test("allocates export ids and writes valid workspace-relative export manifests", async () => {
  const workspaceRoot = await makeWorkspaceRoot();

  assert.equal(await allocateNextExportClipId(workspaceRoot), "E000001");
  assert.equal(
    buildExportClipFileName({
      export_clip_id: "E000001",
      selected_text: "现金流，是企业的血液。不是账面数字/非法",
      extension: ".mp4"
    }),
    "E000001_现金流，是企业的血液。不是账面数字_非法.mp4"
  );

  const paths = buildExportClipArtifactPaths({
    workspace_root: workspaceRoot,
    export_clip_id: "E000001",
    selected_text: "现金流，是企业的血液。"
  });
  await mkdir(path.dirname(paths.media_file_path), { recursive: true });
  await writeFile(paths.media_file_path, "clip-bytes");

  const manifest = await writeExportClipManifest({
    workspace_root: workspaceRoot,
    export_clip_id: "E000001",
    library_id: "lib_main_001",
    source_video_id: "V000001",
    source_title: "01_现金流",
    begin_ms: 1000,
    end_ms: 5200,
    selected_text: "现金流，是企业的血液。",
    cut_mode: "smart",
    output_file: paths.output_file,
    created_at: "2026-05-02T10:00:00Z"
  });

  assert.equal(manifest.local_clip_id, "E000001");
  assert.equal(
    manifest.output_file,
    "export-clips/E000001/E000001_现金流，是企业的血液.mp4"
  );
  assert.equal(
    manifest.media_file_path,
    path.join(workspaceRoot, "export-clips", "E000001", "E000001_现金流，是企业的血液.mp4")
  );
  assert.equal(JSON.parse(await readFile(paths.manifest_file_path, "utf8")).export_clip_id, "E000001");
  assert.equal(await allocateNextExportClipId(workspaceRoot), "E000002");
});

test("lists and reads export clips newest first", async () => {
  const workspaceRoot = await makeWorkspaceRoot();

  for (const [exportClipId, createdAt] of [
    ["E000001", "2026-05-02T10:00:00Z"],
    ["E000002", "2026-05-02T10:10:00Z"]
  ] as const) {
    const paths = buildExportClipArtifactPaths({
      workspace_root: workspaceRoot,
      export_clip_id: exportClipId,
      selected_text: "现金流，是企业的血液。"
    });
    await mkdir(path.dirname(paths.media_file_path), { recursive: true });
    await writeFile(paths.media_file_path, "clip-bytes");
    await writeExportClipManifest({
      workspace_root: workspaceRoot,
      export_clip_id: exportClipId,
      library_id: "lib_main_001",
      source_video_id: "V000001",
      source_title: "01_现金流",
      begin_ms: 1000,
      end_ms: 5200,
      selected_text: "现金流，是企业的血液。",
      cut_mode: "copy",
      output_file: paths.output_file,
      created_at: createdAt
    });
  }

  const catalog = await listExportClips({ workspace_root: workspaceRoot });
  assert.equal(catalog.local_clip_count, 2);
  assert.deepEqual(
    catalog.clips.map((clip) => clip.export_clip_id),
    ["E000002", "E000001"]
  );

  const detail = await getExportClipDetail({
    workspace_root: workspaceRoot,
    export_clip_id: "E000001"
  });
  assert.equal(detail?.source_video_id, "V000001");
  assert.equal(detail?.duration_ms, 4200);
});

test("rejects export output paths that escape the cutter workspace", async () => {
  const workspaceRoot = await makeWorkspaceRoot();

  await assert.rejects(
    writeExportClipManifest({
      workspace_root: workspaceRoot,
      export_clip_id: "E000001",
      library_id: "lib_main_001",
      source_video_id: "V000001",
      source_title: "01_现金流",
      begin_ms: 1000,
      end_ms: 5200,
      selected_text: "现金流",
      cut_mode: "precise",
      output_file: "../escaped.mp4",
      created_at: "2026-05-02T10:00:00Z"
    }),
    /output_file must be workspace-relative/
  );
});
