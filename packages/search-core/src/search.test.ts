import assert from "node:assert/strict";
import test from "node:test";
import { buildTranscriptSearchIndex, searchTranscripts } from "./index.ts";

const index = buildTranscriptSearchIndex([
  {
    source_video_id: "V000001",
    title: "老板现金流课程",
    duration_ms: 3_600_000,
    segments: [
      {
        segment_id: "V000001-S000001",
        index: 0,
        begin_ms: 10_000,
        end_ms: 14_000,
        begin_char: 0,
        end_char: 16,
        normalized_begin_char: 0,
        normalized_end_char: 15,
        text: "现金流，是企业的血液。",
        normalized_text: "现金流是企业的血液",
        confidence: 0.96
      },
      {
        segment_id: "V000001-S000002",
        index: 1,
        begin_ms: 14_000,
        end_ms: 18_500,
        begin_char: 16,
        end_char: 33,
        normalized_begin_char: 15,
        normalized_end_char: 31,
        text: "不是账面数字。",
        normalized_text: "不是账面数字",
        confidence: 0.95
      }
    ]
  },
  {
    source_video_id: "V000002",
    title: "组织增长课",
    duration_ms: 2_400_000,
    segments: [
      {
        segment_id: "V000002-S000001",
        index: 0,
        begin_ms: 20_000,
        end_ms: 24_000,
        begin_char: 0,
        end_char: 12,
        normalized_begin_char: 0,
        normalized_end_char: 12,
        text: "组织效率决定增长。",
        normalized_text: "组织效率决定增长",
        confidence: 0.94
      }
    ]
  }
]);

test("search ignores punctuation and groups hits by source video", () => {
  const result = searchTranscripts(index, { query: "现金流，是企业的血液", limit: 20 });

  assert.equal(result.query, "现金流，是企业的血液");
  assert.equal(result.normalized_query, "现金流是企业的血液");
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0]?.source_video_id, "V000001");
  assert.equal(result.groups[0]?.hit_count, 1);
  assert.equal(result.groups[0]?.best_excerpt, "现金流，是企业的血液。");
  assert.deepEqual(result.groups[0]?.hit_segments[0]?.match_ranges, [[0, 10]]);
  assert.equal(result.groups[0]?.hit_segments[0]?.match_type, "exact");
});

test("search returns multiple grouped source videos without sentence waterfall shape", () => {
  const multiIndex = buildTranscriptSearchIndex([
    ...index.videos,
    {
      source_video_id: "V000003",
      title: "企业财务课",
      duration_ms: 1_800_000,
      segments: [
        {
          segment_id: "V000003-S000001",
          index: 0,
          begin_ms: 30_000,
          end_ms: 35_000,
          begin_char: 0,
          end_char: 14,
          normalized_begin_char: 0,
          normalized_end_char: 13,
          text: "现金流管理要看周期。",
          normalized_text: "现金流管理要看周期",
          confidence: 0.93
        }
      ]
    }
  ]);

  const result = searchTranscripts(multiIndex, { query: "现金流", limit: 20 });

  assert.equal(result.groups.length, 2);
  assert.deepEqual(
    result.groups.map((group) => group.source_video_id),
    ["V000001", "V000003"]
  );
  assert.equal(result.groups[0]?.hit_segments.length, 1);
  assert.equal(result.groups[1]?.hit_segments.length, 1);
});

test("search matches long natural text across adjacent transcript segments", () => {
  const result = searchTranscripts(index, {
    query: "现金流是企业的血液不是账面数字",
    limit: 20
  });

  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0]?.source_video_id, "V000001");
  assert.equal(result.groups[0]?.hit_count, 1);
  assert.deepEqual(
    result.groups[0]?.hit_segments.map((segment) => segment.segment_id),
    ["V000001-S000001", "V000001-S000002"]
  );
  assert.equal(result.groups[0]?.best_excerpt, "现金流，是企业的血液。不是账面数字。");
});

test("search can anchor a long pasted query when its beginning is not in the transcript", () => {
  const longIndex = buildTranscriptSearchIndex([
    {
      source_video_id: "V000020",
      title: "平台合伙人课",
      duration_ms: 3_600_000,
      segments: [
        {
          segment_id: "V000020-S000001",
          index: 0,
          begin_ms: 100_000,
          end_ms: 108_000,
          begin_char: 0,
          end_char: 30,
          normalized_begin_char: 0,
          normalized_end_char: 27,
          text: "未来中国将走向一个阶段，叫企业平台化，员工老板创业化。",
          normalized_text: "未来中国将走向一个阶段叫企业平台化员工老板创业化",
          confidence: 0.96
        },
        {
          segment_id: "V000020-S000002",
          index: 1,
          begin_ms: 108_000,
          end_ms: 116_000,
          begin_char: 30,
          end_char: 62,
          normalized_begin_char: 27,
          normalized_end_char: 57,
          text: "你要防备的是你的同行推出平台合伙人，把你的优质人才卷到他的平台上。",
          normalized_text: "你要防备的是你的同行推出平台合伙人把你的优质人才卷到他的平台上",
          confidence: 0.95
        },
        {
          segment_id: "V000020-S000003",
          index: 2,
          begin_ms: 116_000,
          end_ms: 124_000,
          begin_char: 62,
          end_char: 95,
          normalized_begin_char: 57,
          normalized_end_char: 89,
          text: "所以我们再提出来叫做企业平台化，员工老板创业化。",
          normalized_text: "所以我们再提出来叫做企业平台化员工老板创业化",
          confidence: 0.94
        }
      ]
    }
  ]);

  const result = searchTranscripts(longIndex, {
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
  assert.equal(result.groups[0]?.hit_segments[0]?.match_type, "tolerant");
});

test("search tolerates one ASR-style character error in medium-length original text", () => {
  const result = searchTranscripts(index, {
    query: "现金流是企业的血夜",
    limit: 20
  });

  assert.deepEqual(
    result.groups.map((group) => group.source_video_id),
    ["V000001"]
  );
  assert.equal(result.groups[0]?.hit_count, 1);
});

test("search does not tolerate a one-character error in very short text", () => {
  const result = searchTranscripts(index, {
    query: "组织校率",
    limit: 20
  });

  assert.deepEqual(result.groups, []);
});

test("search ranks exact and concentrated matches ahead of weaker tolerant matches", () => {
  const rankedIndex = buildTranscriptSearchIndex([
    {
      source_video_id: "V000010",
      title: "ASR 有误课程",
      duration_ms: 3_600_000,
      segments: [
        {
          segment_id: "V000010-S000001",
          index: 0,
          begin_ms: 10_000,
          end_ms: 14_000,
          begin_char: 0,
          end_char: 16,
          normalized_begin_char: 0,
          normalized_end_char: 15,
          text: "现金流，是企业的血夜。",
          normalized_text: "现金流是企业的血夜",
          confidence: 0.88
        }
      ]
    },
    ...index.videos
  ]);

  const result = searchTranscripts(rankedIndex, {
    query: "现金流，是企业的血液",
    limit: 20
  });

  assert.deepEqual(
    result.groups.map((group) => group.source_video_id),
    ["V000001", "V000010"]
  );
});

test("empty or punctuation-only queries return no groups", () => {
  assert.deepEqual(searchTranscripts(index, { query: " ，。  ", limit: 20 }), {
    query: " ，。  ",
    normalized_query: "",
    groups: []
  });
});
