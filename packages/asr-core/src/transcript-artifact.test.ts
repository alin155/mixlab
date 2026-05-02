import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSrtFromTranscriptArtifact,
  convertDashScopeTranscriptionToMixlabTranscript,
  formatSrtTimestamp
} from "./index.ts";

const dashScopeResult = {
  file_url: "https://example.com/audio.mp3",
  properties: {
    original_duration_in_milliseconds: 6_000
  },
  transcripts: [
    {
      channel_id: 0,
      content_duration_in_milliseconds: 5_600,
      text: "现金流，是企业的血液。不是账面数字。",
      sentences: [
        {
          begin_time: 100,
          end_time: 2_600,
          text: "现金流，是企业的血液。",
          sentence_id: 1
        },
        {
          begin_time: 2_600,
          end_time: 5_600,
          text: "不是账面数字。",
          sentence_id: 2
        }
      ]
    }
  ]
};

test("converts DashScope sentence timestamps into MixLab transcript segments", () => {
  const transcript = convertDashScopeTranscriptionToMixlabTranscript({
    source_video_id: "V000001",
    model: "paraformer-v2",
    generated_at: "2026-05-02T00:00:00Z",
    result: dashScopeResult
  });

  assert.equal(transcript.schema_version, "1.0");
  assert.equal(transcript.source_video_id, "V000001");
  assert.equal(transcript.provider, "dashscope");
  assert.equal(transcript.model, "paraformer-v2");
  assert.equal(transcript.duration_ms, 6_000);
  assert.equal(transcript.full_text, "现金流，是企业的血液。不是账面数字。");
  assert.deepEqual(transcript.segments, [
    {
      segment_id: "V000001-S000001",
      index: 0,
      begin_ms: 100,
      end_ms: 2_600,
      begin_char: 0,
      end_char: 11,
      normalized_begin_char: 0,
      normalized_end_char: 9,
      text: "现金流，是企业的血液。",
      normalized_text: "现金流是企业的血液",
      confidence: 1
    },
    {
      segment_id: "V000001-S000002",
      index: 1,
      begin_ms: 2_600,
      end_ms: 5_600,
      begin_char: 11,
      end_char: 18,
      normalized_begin_char: 9,
      normalized_end_char: 15,
      text: "不是账面数字。",
      normalized_text: "不是账面数字",
      confidence: 1
    }
  ]);
});

test("formats SRT timestamps and subtitle blocks from MixLab transcript segments", () => {
  const transcript = convertDashScopeTranscriptionToMixlabTranscript({
    source_video_id: "V000001",
    model: "paraformer-v2",
    generated_at: "2026-05-02T00:00:00Z",
    result: dashScopeResult
  });

  assert.equal(formatSrtTimestamp(3_723_045), "01:02:03,045");
  assert.equal(
    buildSrtFromTranscriptArtifact(transcript),
    [
      "1",
      "00:00:00,100 --> 00:00:02,600",
      "现金流，是企业的血液。",
      "",
      "2",
      "00:00:02,600 --> 00:00:05,600",
      "不是账面数字。",
      ""
    ].join("\n")
  );
});

test("falls back to transcript-level text when DashScope sentences are absent", () => {
  const transcript = convertDashScopeTranscriptionToMixlabTranscript({
    source_video_id: "V000009",
    model: "paraformer-v2",
    generated_at: "2026-05-02T00:00:00Z",
    result: {
      properties: {
        original_duration_in_milliseconds: 4_000
      },
      transcripts: [
        {
          text: "没有句级时间戳时也要保留文案。",
          content_duration_in_milliseconds: 3_800
        }
      ]
    }
  });

  assert.deepEqual(
    transcript.segments.map((segment) => ({
      segment_id: segment.segment_id,
      begin_ms: segment.begin_ms,
      end_ms: segment.end_ms,
      text: segment.text
    })),
    [
      {
        segment_id: "V000009-S000001",
        begin_ms: 0,
        end_ms: 3_800,
        text: "没有句级时间戳时也要保留文案。"
      }
    ]
  );
});
