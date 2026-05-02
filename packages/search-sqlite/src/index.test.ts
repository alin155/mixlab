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

  assert.deepEqual(
    searchSourceTranscriptSqliteIndex({
      index_file_path: dbPath,
      query: "现金流，是企业的血液",
      limit: 20
    }),
    {
      query: "现金流，是企业的血液",
      normalized_query: "现金流是企业的血液",
      groups: [
        {
          source_video_id: "V000001",
          title: "老板现金流课程",
          duration_ms: 3_600_000,
          hit_count: 1,
          best_excerpt: "现金流，是企业的血液。",
          hit_segments: [
            {
              segment_id: "V000001-S000001",
              begin_ms: 10_000,
              end_ms: 14_000,
              text: "现金流，是企业的血液。",
              match_ranges: [[0, 8]]
            }
          ]
        }
      ]
    }
  );
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
