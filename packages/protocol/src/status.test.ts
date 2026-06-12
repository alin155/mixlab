import assert from "node:assert/strict";
import test from "node:test";
import {
  isVideoVisibleToCutters,
  validateClipListManifest,
  validateExportClipManifest,
  validateLibraryCounts,
  validateLocalClipManifest,
  validateSourceVideoManifest,
  type ClipListManifest,
  type LibraryCounts,
  type PreprocessStatus,
  type SourceVideoManifest
} from "./index.ts";

function manifest(status: PreprocessStatus, visibleToCutters: boolean): SourceVideoManifest {
  return {
    source_video_id: "V000001",
    title: "老板现金流课程",
    relative_path: "课程/老板现金流课程.mp4",
    logical_uri: "library://source-video/V000001",
    duration_ms: 3_600_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1_234_567_890,
    content_hash: "sha256:example",
    preprocess_status: status,
    visible_to_cutters: visibleToCutters,
    transcript_path: "library://video/V000001/transcript.json",
    srt_path: "library://video/V000001/transcript.srt",
    keyframes_path: "library://video/V000001/keyframes.json",
    cover_path: "library://video/V000001/covers/cover.jpg"
  };
}

test("only ready videos with cutter visibility enabled are visible to cutters", () => {
  assert.equal(isVideoVisibleToCutters(manifest("ready", true)), true);

  const hiddenStatuses: PreprocessStatus[] = [
    "unprocessed",
    "queued",
    "processing",
    "failed",
    "index-required"
  ];

  for (const status of hiddenStatuses) {
    assert.equal(isVideoVisibleToCutters(manifest(status, true)), false);
  }

  assert.equal(isVideoVisibleToCutters(manifest("ready", false)), false);
});

test("library counts must include index-required videos and add up to total", () => {
  const counts: LibraryCounts = {
    video_count: 10,
    ready_video_count: 2,
    processing_video_count: 1,
    queued_video_count: 2,
    unprocessed_video_count: 3,
    failed_video_count: 1,
    index_required_video_count: 1
  };

  assert.deepEqual(validateLibraryCounts(counts), {
    ok: true,
    expected_total: 10,
    actual_total: 10,
    message: "library counts are consistent"
  });
});

test("library count validation reports mismatches clearly", () => {
  const counts: LibraryCounts = {
    video_count: 10,
    ready_video_count: 2,
    processing_video_count: 1,
    queued_video_count: 2,
    unprocessed_video_count: 3,
    failed_video_count: 1,
    index_required_video_count: 0
  };

  assert.deepEqual(validateLibraryCounts(counts), {
    ok: false,
    expected_total: 10,
    actual_total: 9,
    message: "video_count is 10 but status counts add up to 9"
  });
});

test("source video validation rejects unsafe ready artifact paths", () => {
  const result = validateSourceVideoManifest({
    ...manifest("ready", true),
    transcript_path: "/tmp/transcript.json",
    cover_path: "../cover.jpg"
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /transcript_path must be portable/);
  assert.match(result.errors.join("\n"), /cover_path must be portable/);
});

test("source video validation rejects unsafe source folder relative paths", () => {
  const result = validateSourceVideoManifest({
    ...manifest("unprocessed", false),
    source_folder_id: "src_002",
    source_folder_relative_path: "../课程.mp4"
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /source_folder_relative_path must be portable/);
});

test("source video validation accepts safe source folder metadata", () => {
  const result = validateSourceVideoManifest({
    ...manifest("unprocessed", false),
    source_folder_id: "src_002",
    source_folder_relative_path: "课程/现金流.mp4"
  });

  assert.deepEqual(result, {
    ok: true,
    errors: []
  });
});

test("source video validation accepts public metadata fields", () => {
  const result = validateSourceVideoManifest({
    ...manifest("ready", true),
    description: "公司股权课程精选",
    tags: ["股权", "融资"],
    lecturer: "李老师",
    course: "股权设计",
    category: "企业治理"
  });

  assert.deepEqual(result, {
    ok: true,
    errors: []
  });
});

test("source video validation rejects malformed public metadata fields", () => {
  const result = validateSourceVideoManifest({
    ...manifest("ready", true),
    tags: ["股权", ""],
    lecturer: "   "
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /tags must contain non-empty strings/);
  assert.match(result.errors.join("\n"), /lecturer must be a non-empty string/);
});

test("validates local clip manifests", () => {
  const valid = validateLocalClipManifest({
    schema_version: "1.0",
    local_clip_id: "LC000001",
    title: "片段 1",
    source_video_id: "V000001",
    source_title: "C0018",
    source_relative_path: "C0018.MP4",
    begin_ms: 1000,
    end_ms: 3000,
    duration_ms: 2000,
    selected_text: "测试文案",
    cut_mode: "smart",
    media_path: ".mixlab-library/local-clips/LC000001/clip.mp4",
    created_at: "2026-05-02T08:00:00Z"
  });
  assert.deepEqual(valid, {
    ok: true,
    errors: []
  });

  const invalid = validateLocalClipManifest({
    schema_version: "1.0",
    local_clip_id: "bad",
    title: "",
    source_video_id: "V000001",
    source_title: "C0018",
    source_relative_path: "/absolute/source.mp4",
    begin_ms: 3000,
    end_ms: 1000,
    duration_ms: 1,
    selected_text: "",
    cut_mode: "bad" as never,
    media_path: "../clip.mp4",
    created_at: "2026-05-02T08:00:00Z"
  });

  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join("\n"), /local_clip_id must use LC000001 format/);
  assert.match(invalid.errors.join("\n"), /end_ms must be greater than begin_ms/);
  assert.match(invalid.errors.join("\n"), /media_path must be portable/);
  assert.match(invalid.errors.join("\n"), /cut_mode must be copy, smart, or precise/);
});

test("validates export clip manifests", () => {
  const valid = validateExportClipManifest({
    export_clip_id: "E000001",
    library_id: "lib_main_001",
    source_video_id: "V000001",
    source_title: "老板现金流课程",
    begin_ms: 10_000,
    end_ms: 45_000,
    selected_text: "现金流是企业的血液。",
    output_file: "exports/E000001_现金流是企业的血液.mp4",
    created_at: "2026-05-02T08:00:00Z",
    cut_mode: "copy"
  });
  assert.deepEqual(valid, {
    ok: true,
    errors: []
  });

  const invalid = validateExportClipManifest({
    export_clip_id: "bad",
    library_id: "",
    source_video_id: "V000001",
    source_title: "",
    begin_ms: 45_000,
    end_ms: 10_000,
    selected_text: "",
    output_file: "/tmp/export.mp4",
    created_at: "",
    cut_mode: "turbo" as never
  });

  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join("\n"), /export_clip_id must use E000001 format/);
  assert.match(invalid.errors.join("\n"), /output_file must be portable/);
  assert.match(invalid.errors.join("\n"), /end_ms must be greater than begin_ms/);
  assert.match(invalid.errors.join("\n"), /cut_mode must be copy, smart, or precise/);
});

test("validates clip-list manifests", () => {
  const valid: ClipListManifest = {
    schema_version: "1.0",
    clip_list_id: "CL20260502-0001",
    library_id: "lib_main_001",
    project_id: "project-001",
    title: "现金流混剪",
    item_count: 2,
    created_at: "2026-05-02T08:00:00Z",
    updated_at: "2026-05-02T08:00:00Z",
    items: [
      {
        item_id: "CLI000001",
        order: 1,
        source_video_id: "V000001",
        source_title: "老板现金流课程",
        source_relative_path: "source-videos/C0018.mp4",
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S000002",
        begin_ms: 10_000,
        end_ms: 45_000,
        selected_text: "现金流是企业的血液。",
        cut_mode: "smart",
        pre_roll_ms: 250,
        post_roll_ms: 400
      },
      {
        item_id: "CLI000002",
        order: 2,
        source_video_id: "E000001",
        source_title: "本地素材 E000001",
        source_relative_path: ".mixlab-library/videos/E000001.mp4",
        start_segment_id: "E000001-S000001",
        end_segment_id: "E000001-S000001",
        begin_ms: 0,
        end_ms: 12_000,
        selected_text: "复用本地片段。",
        cut_mode: "copy",
        pre_roll_ms: 0,
        post_roll_ms: 0
      }
    ]
  };

  assert.deepEqual(validateClipListManifest(valid), {
    ok: true,
    errors: []
  });

  const invalid: ClipListManifest = {
    ...valid,
    schema_version: "2.0" as never,
    clip_list_id: "bad",
    library_id: "",
    project_id: "../bad",
    title: "",
    item_count: 4,
    created_at: "",
    updated_at: "",
    items: [
      {
        ...valid.items[0]!,
        item_id: "bad",
        order: 3,
        source_title: "",
        source_relative_path: "../source.mp4",
        begin_ms: 45_000,
        end_ms: 10_000,
        selected_text: "",
        cut_mode: "turbo" as never,
        pre_roll_ms: -1
      }
    ]
  };

  const result = validateClipListManifest(invalid);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /schema_version must be 1.0/);
  assert.match(result.errors.join("\n"), /clip_list_id must use CLYYYYMMDD-0001 format/);
  assert.match(result.errors.join("\n"), /project_id must be a safe project identifier/);
  assert.match(result.errors.join("\n"), /item_count must equal items.length/);
  assert.match(result.errors.join("\n"), /items\[0\]\.item_id must use CLI000001 format/);
  assert.match(result.errors.join("\n"), /items\[0\]\.source_relative_path must be portable/);
  assert.match(result.errors.join("\n"), /items\[0\]\.end_ms must be greater than begin_ms/);
  assert.match(result.errors.join("\n"), /items\[0\]\.cut_mode must be copy, smart, or precise/);

  const malformedItem = validateClipListManifest({
    ...valid,
    item_count: 1,
    items: [null as never]
  });
  assert.equal(malformedItem.ok, false);
  assert.match(malformedItem.errors.join("\n"), /items\[0\] must be an object/);
});
