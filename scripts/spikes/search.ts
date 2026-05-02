import { buildTranscriptSearchIndex, searchTranscripts } from "../../packages/search-core/src/index.ts";

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
    title: "企业财务课",
    duration_ms: 1_800_000,
    segments: [
      {
        segment_id: "V000002-S000001",
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

const query = process.argv.slice(2).join(" ") || "现金流，是企业的血液";
const result = searchTranscripts(index, { query, limit: 20 });

console.log(JSON.stringify(result, null, 2));
