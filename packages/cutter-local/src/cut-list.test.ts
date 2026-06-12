import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  listClipLists,
  readClipList,
  writeClipList
} from "./cut-list.ts";

async function makeWorkspaceRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-local-list-"));
}

test("writes ordered cut-list rows with stable local item ids", async () => {
  const workspaceRoot = await makeWorkspaceRoot();

  const list = await writeClipList({
    workspace_root: workspaceRoot,
    library_id: "lib_main_001",
    title: "现金流混剪",
    items: [
      {
        source_video_id: "V000001",
        source_title: "01_现金流",
        source_relative_path: "source-videos/01_现金流.mp4",
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S000002",
        begin_ms: 1000,
        end_ms: 5200,
        selected_text: "现金流，是企业的血液。不是账面数字。",
        cut_mode: "smart"
      },
      {
        source_video_id: "V000002",
        source_title: "02_组织增长",
        source_relative_path: "source-videos/02_组织增长.mp4",
        start_segment_id: "V000002-S000001",
        end_segment_id: "V000002-S000001",
        begin_ms: 800,
        end_ms: 3100,
        selected_text: "组织效率决定增长。",
        cut_mode: "copy"
      }
    ],
    now: "2026-05-02T10:00:00Z"
  });

  assert.equal(list.clip_list_id, "CL20260502-0001");
  assert.equal(list.item_count, 2);
  assert.deepEqual(
    list.items.map((item) => [item.item_id, item.order]),
    [["CLI000001", 1], ["CLI000002", 2]]
  );
  assert.equal(list.items[0]?.pre_roll_ms, 0);
  assert.equal(list.items[0]?.post_roll_ms, 0);

  const persisted = JSON.parse(
    await readFile(
      path.join(workspaceRoot, "clip-lists", "CL20260502-0001", "clip-list.json"),
      "utf8"
    )
  );
  assert.equal(persisted.items[0].source_relative_path, "source-videos/01_现金流.mp4");
});

test("serializes concurrent clip-list id allocation per workspace", async () => {
  const workspaceRoot = await makeWorkspaceRoot();
  const lists = await Promise.all(Array.from({ length: 20 }, (_, index) =>
    writeClipList({
      workspace_root: workspaceRoot,
      library_id: "lib_main_001",
      title: `并发片单 ${index + 1}`,
      items: [
        {
          source_video_id: "V000001",
          source_title: "01_现金流",
          source_relative_path: "source-videos/01_现金流.mp4",
          start_segment_id: "V000001-S000001",
          end_segment_id: "V000001-S000001",
          begin_ms: 1000,
          end_ms: 2200,
          selected_text: "现金流",
          cut_mode: "copy"
        }
      ],
      now: "2026-05-02T10:00:00Z"
    })
  ));

  assert.deepEqual(
    lists.map((list) => list.clip_list_id).sort(),
    Array.from({ length: 20 }, (_, index) => `CL20260502-${String(index + 1).padStart(4, "0")}`)
  );
  assert.equal((await listClipLists({ workspace_root: workspaceRoot })).clip_list_count, 20);
});

test("lists and reads clip lists newest first", async () => {
  const workspaceRoot = await makeWorkspaceRoot();

  await writeClipList({
    workspace_root: workspaceRoot,
    library_id: "lib_main_001",
    title: "第一组",
    items: [
      {
        source_video_id: "V000001",
        source_title: "01_现金流",
        source_relative_path: "source-videos/01_现金流.mp4",
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S000001",
        begin_ms: 1000,
        end_ms: 2000,
        selected_text: "现金流",
        cut_mode: "smart"
      }
    ],
    now: "2026-05-02T10:00:00Z"
  });
  await writeClipList({
    workspace_root: workspaceRoot,
    library_id: "lib_main_001",
    title: "第二组",
    items: [
      {
        source_video_id: "V000002",
        source_title: "02_组织增长",
        source_relative_path: "source-videos/02_组织增长.mp4",
        start_segment_id: "V000002-S000001",
        end_segment_id: "V000002-S000001",
        begin_ms: 1000,
        end_ms: 2600,
        selected_text: "组织增长",
        cut_mode: "precise"
      }
    ],
    now: "2026-05-02T10:05:00Z"
  });

  const catalog = await listClipLists({ workspace_root: workspaceRoot });
  assert.equal(catalog.clip_list_count, 2);
  assert.deepEqual(
    catalog.clip_lists.map((clipList) => clipList.clip_list_id),
    ["CL20260502-0002", "CL20260502-0001"]
  );

  const detail = await readClipList({
    workspace_root: workspaceRoot,
    clip_list_id: "CL20260502-0001"
  });
  assert.equal(detail?.title, "第一组");
});

test("rejects unsafe source relative paths in cut lists", async () => {
  const workspaceRoot = await makeWorkspaceRoot();

  await assert.rejects(
    writeClipList({
      workspace_root: workspaceRoot,
      library_id: "lib_main_001",
      title: "逃逸路径",
      items: [
        {
          source_video_id: "V000001",
          source_title: "01_现金流",
          source_relative_path: "../source-videos/01_现金流.mp4",
          start_segment_id: "V000001-S000001",
          end_segment_id: "V000001-S000001",
          begin_ms: 1000,
          end_ms: 2000,
          selected_text: "现金流",
          cut_mode: "smart"
        }
      ],
      now: "2026-05-02T10:00:00Z"
    }),
    /source_relative_path must be portable/
  );
});

test("rejects malformed persisted clip-list manifests", async () => {
  const workspaceRoot = await makeWorkspaceRoot();
  const manifestDirectory = path.join(workspaceRoot, "clip-lists", "CL20260502-0001");
  await mkdir(manifestDirectory, { recursive: true });
  await writeFile(
    path.join(manifestDirectory, "clip-list.json"),
    `${JSON.stringify({
      schema_version: "1.0",
      clip_list_id: "CL20260502-0001",
      library_id: "lib_main_001",
      title: "坏片单",
      item_count: 1,
      created_at: "2026-05-02T10:00:00Z",
      updated_at: "2026-05-02T10:00:00Z",
      items: [
        {
          item_id: "CLI000001",
          order: 1,
          source_video_id: "V000001",
          source_title: "01_现金流",
          source_relative_path: "/absolute/source.mp4",
          start_segment_id: "V000001-S000001",
          end_segment_id: "V000001-S000001",
          begin_ms: 1000,
          end_ms: 2000,
          selected_text: "现金流",
          cut_mode: "smart",
          pre_roll_ms: 0,
          post_roll_ms: 0
        }
      ]
    })}\n`,
    "utf8"
  );

  await assert.rejects(
    readClipList({
      workspace_root: workspaceRoot,
      clip_list_id: "CL20260502-0001"
    }),
    /source_relative_path must be portable/
  );
});
