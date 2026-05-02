import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import {
  buildFfmpegAudioExtractionPlan,
  buildFfmpegCoverImagePlan,
  buildFfmpegCutPlan,
  buildFfprobeSourceMetadataPlan,
  formatSeconds,
  parseFfprobeSourceMetadata,
  resolveFfmpegRuntime
} from "./index.ts";

test("formats milliseconds as ffmpeg seconds", () => {
  assert.equal(formatSeconds(10_000), "10.000");
  assert.equal(formatSeconds(90_123), "90.123");
});

test("builds fast copy cut command with input seeking and stream copy", () => {
  assert.deepEqual(
    buildFfmpegCutPlan({
      source_path: "/source/课程.mp4",
      output_path: "/exports/001.mp4",
      begin_ms: 10_000,
      end_ms: 45_000,
      cut_mode: "copy"
    }),
    {
      executable: "ffmpeg",
      args: [
        "-hide_banner",
        "-y",
        "-ss",
        "10.000",
        "-i",
        "/source/课程.mp4",
        "-t",
        "35.000",
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
        "/exports/001.mp4"
      ]
    }
  );
});

test("builds precise cut command with re-encoding", () => {
  assert.deepEqual(
    buildFfmpegCutPlan({
      source_path: "/source/课程.mp4",
      output_path: "/exports/001.mp4",
      begin_ms: 10_000,
      end_ms: 45_000,
      cut_mode: "precise"
    }),
    {
      executable: "ffmpeg",
      args: [
        "-hide_banner",
        "-y",
        "-i",
        "/source/课程.mp4",
        "-ss",
        "10.000",
        "-t",
        "35.000",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "/exports/001.mp4"
      ]
    }
  );
});

test("rejects invalid cut ranges", () => {
  assert.throws(
    () =>
      buildFfmpegCutPlan({
        source_path: "/source/课程.mp4",
        output_path: "/exports/001.mp4",
        begin_ms: 45_000,
        end_ms: 10_000,
        cut_mode: "copy"
      }),
    /end_ms must be greater than begin_ms/
  );
});

test("builds ASR-friendly mono mp3 audio extraction command", () => {
  assert.deepEqual(
    buildFfmpegAudioExtractionPlan({
      source_path: "/source/课程.mp4",
      output_path: "/tmp/V000001/audio.mp3",
      output_format: "mp3"
    }),
    {
      executable: "ffmpeg",
      args: [
        "-hide_banner",
        "-y",
        "-i",
        "/source/课程.mp4",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-codec:a",
        "libmp3lame",
        "-b:a",
        "64k",
        "/tmp/V000001/audio.mp3"
      ]
    }
  );
});

test("builds ASR-friendly mono mp3 audio extraction command with custom bitrate", () => {
  assert.deepEqual(
    buildFfmpegAudioExtractionPlan({
      source_path: "/source/课程.mp4",
      output_path: "/tmp/V000001/audio.mp3",
      output_format: "mp3",
      audio_bitrate: "32k"
    }).args,
    [
      "-hide_banner",
      "-y",
      "-i",
      "/source/课程.mp4",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "32k",
      "/tmp/V000001/audio.mp3"
    ]
  );
});

test("builds ASR-friendly mono m4a audio extraction command", () => {
  assert.deepEqual(
    buildFfmpegAudioExtractionPlan({
      source_path: "/source/课程.mp4",
      output_path: "/tmp/V000001/audio.m4a",
      output_format: "m4a",
      audio_bitrate: "48k"
    }).args,
    [
      "-hide_banner",
      "-y",
      "-i",
      "/source/课程.mp4",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-codec:a",
      "aac",
      "-b:a",
      "48k",
      "/tmp/V000001/audio.m4a"
    ]
  );
});

test("builds ASR-friendly mono wav audio extraction command", () => {
  assert.deepEqual(
    buildFfmpegAudioExtractionPlan({
      source_path: "/source/课程.mp4",
      output_path: "/tmp/V000001/audio.wav",
      output_format: "wav",
      sample_rate_hz: 16_000
    }).args,
    [
      "-hide_banner",
      "-y",
      "-i",
      "/source/课程.mp4",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-codec:a",
      "pcm_s16le",
      "/tmp/V000001/audio.wav"
    ]
  );
});

test("rejects invalid audio extraction bitrate values", () => {
  assert.throws(
    () =>
      buildFfmpegAudioExtractionPlan({
        source_path: "/source/课程.mp4",
        output_path: "/tmp/V000001/audio.mp3",
        output_format: "mp3",
        audio_bitrate: "64 kbps"
      }),
    /audio_bitrate must look like an ffmpeg bitrate/
  );
});

test("rejects invalid audio extraction sample rates", () => {
  assert.throws(
    () =>
      buildFfmpegAudioExtractionPlan({
        source_path: "/source/课程.mp4",
        output_path: "/tmp/V000001/audio.mp3",
        output_format: "mp3",
        sample_rate_hz: 0
      }),
    /sample_rate_hz must be greater than 0/
  );
});

test("builds cover image extraction command", () => {
  assert.deepEqual(
    buildFfmpegCoverImagePlan({
      source_path: "/source/课程.mp4",
      output_path: "/tmp/V000001/cover.jpg",
      at_ms: 1_500,
      width: 640,
      quality: 3
    }),
    {
      executable: "ffmpeg",
      args: [
        "-hide_banner",
        "-y",
        "-ss",
        "1.500",
        "-i",
        "/source/课程.mp4",
        "-frames:v",
        "1",
        "-vf",
        "scale=640:-2",
        "-q:v",
        "3",
        "/tmp/V000001/cover.jpg"
      ]
    }
  );
});

test("rejects invalid cover image extraction settings", () => {
  assert.throws(
    () =>
      buildFfmpegCoverImagePlan({
        source_path: "/source/课程.mp4",
        output_path: "/tmp/V000001/cover.jpg",
        at_ms: -1
      }),
    /at_ms must be greater than or equal to 0/
  );
});

test("resolves bundled ffmpeg and ffprobe runtime paths", () => {
  const runtime = resolveFfmpegRuntime();

  assert.equal(runtime.source, "bundled-static");
  assert.equal(existsSync(runtime.ffmpeg_path), true);
  assert.equal(existsSync(runtime.ffprobe_path), true);
});

test("builds ffprobe source metadata command", () => {
  assert.deepEqual(
    buildFfprobeSourceMetadataPlan({
      source_path: "/source/课程.mp4"
    }),
    {
      executable: "ffprobe",
      args: [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        "/source/课程.mp4"
      ]
    }
  );
});

test("parses source video metadata from ffprobe json", () => {
  assert.deepEqual(
    parseFfprobeSourceMetadata(
      JSON.stringify({
        format: {
          duration: "149.650"
        },
        streams: [
          {
            codec_type: "audio",
            codec_name: "aac"
          },
          {
            codec_type: "video",
            codec_name: "h264",
            width: 1920,
            height: 1080,
            avg_frame_rate: "30000/1001"
          }
        ]
      })
    ),
    {
      duration_ms: 149_650,
      width: 1920,
      height: 1080,
      fps: 29.97,
      codec: "h264"
    }
  );
});

test("rejects ffprobe metadata without a video stream", () => {
  assert.throws(
    () =>
      parseFfprobeSourceMetadata(
        JSON.stringify({
          format: {
            duration: "149.650"
          },
          streams: [
            {
              codec_type: "audio",
              codec_name: "aac"
            }
          ]
        })
      ),
    /ffprobe output did not include a video stream/
  );
});
