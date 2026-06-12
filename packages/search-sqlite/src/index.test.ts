import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { TranscriptSegment } from "../../protocol/src/index.ts";
import {
  createSourceTranscriptSqliteIndexBytes,
  readSourceTranscriptSqliteIndexMetadata,
  searchSourceTranscriptSqliteIndex,
  writeSourceTranscriptSqliteIndex
} from "./index.ts";

async function makeDbPath(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mixlab-search-sqlite-"));
  return path.join(dir, "index.sqlite");
}

function segment(input: {
  source_video_id: string;
  index: number;
  begin_ms: number;
  end_ms: number;
  text: string;
  normalized_text: string;
}): TranscriptSegment {
  return {
    segment_id: `${input.source_video_id}-S${String(input.index + 1).padStart(6, "0")}`,
    index: input.index,
    begin_ms: input.begin_ms,
    end_ms: input.end_ms,
    begin_char: 0,
    end_char: input.text.length,
    normalized_begin_char: 0,
    normalized_end_char: input.normalized_text.length,
    text: input.text,
    normalized_text: input.normalized_text,
    confidence: 0.96
  };
}

const videos = [
  {
    source_video_id: "V000001",
    title: "老板现金流课程",
    duration_ms: 3_600_000,
    relative_path: "source-videos/现金流.mp4",
    cover_path: ".mixlab-library/videos/V000001/cover.jpg",
    segments: [
      segment({
        source_video_id: "V000001",
        index: 0,
        begin_ms: 10_000,
        end_ms: 14_000,
        text: "现金流，是企业的血液。",
        normalized_text: "现金流是企业的血液"
      }),
      segment({
        source_video_id: "V000001",
        index: 1,
        begin_ms: 14_000,
        end_ms: 18_500,
        text: "不是账面数字。",
        normalized_text: "不是账面数字"
      })
    ]
  },
  {
    source_video_id: "V000002",
    title: "组织增长课",
    duration_ms: 2_400_000,
    relative_path: "source-videos/组织增长.mov",
    cover_path: ".mixlab-library/videos/V000002/cover.jpg",
    segments: [
      segment({
        source_video_id: "V000002",
        index: 0,
        begin_ms: 20_000,
        end_ms: 24_000,
        text: "组织效率决定增长。",
        normalized_text: "组织效率决定增长"
      })
    ]
  }
];

test("builds a SQLite transcript index and reads metadata", async () => {
  const dbPath = await makeDbPath();

  await writeSourceTranscriptSqliteIndex({
    index_file_path: dbPath,
    library_id: "lib_main_001",
    index_version: "v000001",
    created_at: "2026-05-02T00:00:00Z",
    videos
  });

  assert.equal((await stat(dbPath)).isFile(), true);
  assert.deepEqual(readSourceTranscriptSqliteIndexMetadata(dbPath), {
    library_id: "lib_main_001",
    index_version: "v000001",
    created_at: "2026-05-02T00:00:00Z",
    source_video_count: 2,
    segment_count: 3,
    schema_version: "1.0"
  });
});

test("searches grouped source videos with punctuation-insensitive Chinese matching", async () => {
  const dbPath = await makeDbPath();

  await writeSourceTranscriptSqliteIndex({
    index_file_path: dbPath,
    library_id: "lib_main_001",
    index_version: "v000001",
    created_at: "2026-05-02T00:00:00Z",
    videos
  });

  const result = searchSourceTranscriptSqliteIndex({
    index_file_path: dbPath,
    query: "现金流，是企业的血液",
    limit: 20
  });

  assert.equal(result.query, "现金流，是企业的血液");
  assert.equal(result.normalized_query, "现金流是企业的血液");
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0]?.source_video_id, "V000001");
  assert.equal(result.groups[0]?.hit_count, 1);
  assert.equal(result.groups[0]?.best_excerpt, "现金流，是企业的血液。");
  assert.equal(result.groups[0]?.relative_path, "source-videos/现金流.mp4");
  assert.equal(result.groups[0]?.cover_path, ".mixlab-library/videos/V000001/cover.jpg");
  assert.equal(result.groups[0]?.transcript_character_count, 18);
  assert.deepEqual(result.groups[0]?.hit_segments[0]?.match_ranges, [[0, 10]]);
  assert.equal(result.groups[0]?.hit_segments[0]?.match_type, "exact");
});

test("uses ngram-backed search while preserving single-character query support", async () => {
  const dbPath = await makeDbPath();

  await writeSourceTranscriptSqliteIndex({
    index_file_path: dbPath,
    library_id: "lib_main_001",
    index_version: "v000001",
    created_at: "2026-05-02T00:00:00Z",
    videos
  });

  assert.deepEqual(
    searchSourceTranscriptSqliteIndex({
      index_file_path: dbPath,
      query: "组织",
      limit: 20
    }).groups.map((group) => group.source_video_id),
    ["V000002"]
  );

  assert.deepEqual(
    searchSourceTranscriptSqliteIndex({
      index_file_path: dbPath,
      query: "血",
      limit: 20
    }).groups.map((group) => group.source_video_id),
    ["V000001"]
  );
});

test("returns first search page quickly with an opaque cursor for the next batch", async () => {
  const dbPath = await makeDbPath();
  const pagedVideos = [
    videos[0]!,
    {
      source_video_id: "V000003",
      title: "现金流回款课",
      duration_ms: 1_800_000,
      relative_path: "source-videos/回款.mp4",
      cover_path: ".mixlab-library/videos/V000003/cover.jpg",
      segments: [
        segment({
          source_video_id: "V000003",
          index: 0,
          begin_ms: 30_000,
          end_ms: 34_000,
          text: "现金流回款周期要缩短。",
          normalized_text: "现金流回款周期要缩短"
        })
      ]
    },
    {
      source_video_id: "V000004",
      title: "现金流预算课",
      duration_ms: 1_600_000,
      relative_path: "source-videos/预算.mp4",
      cover_path: ".mixlab-library/videos/V000004/cover.jpg",
      segments: [
        segment({
          source_video_id: "V000004",
          index: 0,
          begin_ms: 40_000,
          end_ms: 44_000,
          text: "现金流预算要先于投放。",
          normalized_text: "现金流预算要先于投放"
        })
      ]
    }
  ];

  await writeSourceTranscriptSqliteIndex({
    index_file_path: dbPath,
    library_id: "lib_main_001",
    index_version: "v000001",
    created_at: "2026-05-02T00:00:00Z",
    videos: pagedVideos
  });

  const firstPage = searchSourceTranscriptSqliteIndex({
    index_file_path: dbPath,
    query: "现金流",
    limit: 2
  });

  assert.deepEqual(
    firstPage.groups.map((group) => group.source_video_id),
    ["V000001", "V000003"]
  );
  assert.equal(firstPage.returned_count, 2);
  assert.equal(firstPage.limit, 2);
  assert.equal(firstPage.index_version, "v000001");
  assert.equal(firstPage.has_more, true);
  assert.notEqual(firstPage.next_cursor, "");
  assert.equal(firstPage.search_ms >= 0, true);

  const secondPage = searchSourceTranscriptSqliteIndex({
    index_file_path: dbPath,
    query: "现金流",
    limit: 2,
    cursor: firstPage.next_cursor
  });

  assert.deepEqual(
    secondPage.groups.map((group) => group.source_video_id),
    ["V000004"]
  );
  assert.equal(secondPage.has_more, false);
  assert.equal(secondPage.next_cursor, "");
});

test("searches long natural text across adjacent SQLite transcript segments", async () => {
  const dbPath = await makeDbPath();

  await writeSourceTranscriptSqliteIndex({
    index_file_path: dbPath,
    library_id: "lib_main_001",
    index_version: "v000001",
    created_at: "2026-05-02T00:00:00Z",
    videos
  });

  const result = searchSourceTranscriptSqliteIndex({
    index_file_path: dbPath,
    query: "现金流是企业的血液不是账面数字",
    limit: 20
  });

  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0]?.source_video_id, "V000001");
  assert.deepEqual(
    result.groups[0]?.hit_segments.map((segment) => segment.segment_id),
    ["V000001-S000001", "V000001-S000002"]
  );
});

test("searches SQLite transcripts from a long pasted query with unmatched leading text", async () => {
  const dbPath = await makeDbPath();
  const longVideos = [
    {
      source_video_id: "V000020",
      title: "平台合伙人课",
      duration_ms: 3_600_000,
      relative_path: "source-videos/平台合伙人.mp4",
      cover_path: ".mixlab-library/videos/V000020/cover.jpg",
      segments: [
        segment({
          source_video_id: "V000020",
          index: 0,
          begin_ms: 100_000,
          end_ms: 108_000,
          text: "未来中国将走向一个阶段，叫企业平台化，员工老板创业化。",
          normalized_text: "未来中国将走向一个阶段叫企业平台化员工老板创业化"
        }),
        segment({
          source_video_id: "V000020",
          index: 1,
          begin_ms: 108_000,
          end_ms: 116_000,
          text: "你要防备的是你的同行推出平台合伙人，把你的优质人才卷到他的平台上。",
          normalized_text: "你要防备的是你的同行推出平台合伙人把你的优质人才卷到他的平台上"
        }),
        segment({
          source_video_id: "V000020",
          index: 2,
          begin_ms: 116_000,
          end_ms: 124_000,
          text: "所以我们再提出来叫做企业平台化，员工老板创业化。",
          normalized_text: "所以我们再提出来叫做企业平台化员工老板创业化"
        })
      ]
    }
  ];

  await writeSourceTranscriptSqliteIndex({
    index_file_path: dbPath,
    library_id: "lib_main_001",
    index_version: "v000001",
    created_at: "2026-05-02T00:00:00Z",
    videos: longVideos
  });

  const result = searchSourceTranscriptSqliteIndex({
    index_file_path: dbPath,
    query:
      "这段开头来自用户粘贴内容，但在素材转写里已经被剪掉了，还有几句话也没有被识别到。" +
      "未来中国将走向一个阶段，叫企业平台化，员工老板创业化。你要防备的是你的同行推出平台合伙人，" +
      "把你的优质人才卷到他的平台上。所以我们再提出来叫做企业平台化，员工老板创业化。",
    limit: 20
  });

  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0]?.source_video_id, "V000020");
  assert.deepEqual(
    result.groups[0]?.hit_segments.map((segment) => segment.segment_id),
    ["V000020-S000001", "V000020-S000002", "V000020-S000003"]
  );
});

test("searches SQLite transcripts with ASR-tolerant original text matching", async () => {
  const dbPath = await makeDbPath();

  await writeSourceTranscriptSqliteIndex({
    index_file_path: dbPath,
    library_id: "lib_main_001",
    index_version: "v000001",
    created_at: "2026-05-02T00:00:00Z",
    videos
  });

  assert.deepEqual(
    searchSourceTranscriptSqliteIndex({
      index_file_path: dbPath,
      query: "现金流是企业的血夜",
      limit: 20
    }).groups.map((group) => group.source_video_id),
    ["V000001"]
  );

  assert.deepEqual(
    searchSourceTranscriptSqliteIndex({
      index_file_path: dbPath,
      query: "组织校率",
      limit: 20
    }).groups,
    []
  );
});

test("can return immutable SQLite package bytes", async () => {
  const bytes = await createSourceTranscriptSqliteIndexBytes({
    library_id: "lib_main_001",
    index_version: "v000027",
    created_at: "2026-05-02T00:00:00Z",
    videos
  });

  assert.equal(Buffer.isBuffer(bytes), true);
  assert.equal(bytes.subarray(0, 16).toString("utf8"), "SQLite format 3\u0000");
});
