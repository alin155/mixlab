import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import {
  buildFfmpegAudioExtractionPlan,
  buildFfmpegCoverImagePlan,
  buildFfmpegCutPlan,
  buildFfprobeFirstFramePtsPlan,
  buildFfprobeKeyframePlan,
  buildFfprobeOutputVerificationPlan,
  buildFfprobeSourceMetadataPlan,
  decideCopyCutMode,
  formatSeconds,
  parseFfprobeFirstFramePts,
  parseFfprobeKeyframeTimes,
  parseFfprobeOutputProbe,
  parseFfprobeSourceMetadata,
  resolveFfmpegTimeoutMs,
  resolveFfmpegRuntime
} from "./index.ts";

test("formats milliseconds as ffmpeg seconds", () => {
  assert.equal(formatSeconds(10_000), "10.000");
  assert.equal(formatSeconds(90_123), "90.123");
});

test("builds fast copy cut command with input seeking, video copy, and mp4-safe audio", () => {
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
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-avoid_negative_ts",
        "make_zero",
        "-movflags",
        "+faststart",
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

test("builds output verification ffprobe plan with duration, streams, and start time", () => {
  assert.deepEqual(
    buildFfprobeOutputVerificationPlan({ output_path: "/exports/out.mp4" }),
    {
      executable: "ffprobe",
      args: [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_entries",
        "format=duration,start_time:stream=codec_type,duration,start_time",
        "/exports/out.mp4"
      ]
    }
  );
});

test("parses output verification probe with video and audio streams", () => {
  const probe = parseFfprobeOutputProbe(JSON.stringify({
    format: { duration: "2.021000" },
    streams: [
      { codec_type: "video", codec_name: "h264", duration: "2.000000", start_time: "0.000000" },
      { codec_type: "audio", codec_name: "aac", duration: "2.021000", start_time: "0.000000" }
    ]
  }));

  assert.deepEqual(probe, {
    duration_ms: 2021,
    has_video_stream: true,
    has_audio_stream: true,
    video_duration_ms: 2000,
    audio_duration_ms: 2021,
    video_start_ms: 0
  });
});

test("parses output verification probe for video without audio track", () => {
  const probe = parseFfprobeOutputProbe(JSON.stringify({
    format: { duration: "1.500000" },
    streams: [{ codec_type: "video", duration: "1.500000", start_time: "0.000000" }]
  }));

  assert.deepEqual(probe, {
    duration_ms: 1500,
    has_video_stream: true,
    has_audio_stream: false,
    video_duration_ms: 1500,
    video_start_ms: 0
  });
});

test("builds first frame pts plan that reads a single packet", () => {
  assert.deepEqual(
    buildFfprobeFirstFramePtsPlan({ output_path: "/exports/out.mp4" }),
    {
      executable: "ffprobe",
      args: [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "packet=pts_time",
        "-read_intervals",
        "%+#1",
        "-print_format",
        "json",
        "/exports/out.mp4"
      ]
    }
  );
});

test("parses first frame pts from packet probe output", () => {
  assert.equal(parseFfprobeFirstFramePts(JSON.stringify({ packets: [{ pts_time: "0.000000" }] })), 0);
  assert.equal(parseFfprobeFirstFramePts(JSON.stringify({ packets: [{ pts_time: "0.120000" }] })), 120);
  assert.equal(parseFfprobeFirstFramePts(JSON.stringify({ packets: [] })), undefined);
});

test("builds keyframe probe plan around the requested begin point", () => {
  const plan = buildFfprobeKeyframePlan({
    source_path: "/source/long-gop.mp4",
    begin_ms: 12_500
  });

  assert.deepEqual(plan, {
    executable: "ffprobe",
    args: [
      "-v",
      "error",
      "-print_format",
      "json",
      "-select_streams",
      "v:0",
      "-skip_frame",
      "nokey",
      "-show_entries",
      "frame=pts_time",
      "-read_intervals",
      "2.500%13.500",
      "/source/long-gop.mp4"
    ]
  });
});

test("parses and de-duplicates keyframe timestamps", () => {
  assert.deepEqual(
    parseFfprobeKeyframeTimes(JSON.stringify({
      frames: [
        { pts_time: "0.000000" },
        { pts_time: "2.000000" },
        { pts_time: "2.000000" },
        { pts_time: "4.500000" }
      ]
    })),
    [0, 2000, 4500]
  );
});

test("decideCopyCutMode keeps copy when begin is near a keyframe", () => {
  assert.deepEqual(
    decideCopyCutMode({
      cut_mode: "copy",
      begin_ms: 3_200,
      keyframe_times_ms: [0, 3_000, 6_000]
    }),
    { cut_mode_used: "copy", keyframe_distance_ms: 200 }
  );
});

test("decideCopyCutMode degrades copy to precise when keyframe distance exceeds threshold", () => {
  const decision = decideCopyCutMode({
    cut_mode: "copy",
    begin_ms: 4_800,
    keyframe_times_ms: [0, 2_000]
  });

  assert.equal(decision.cut_mode_used, "precise");
  assert.equal(decision.keyframe_distance_ms, 2_800);
  assert.match(decision.degrade_reason ?? "", /自动降级为精准剪切/);
  assert.match(decision.degrade_reason ?? "", /2800ms/);
});

test("decideCopyCutMode keeps copy when the first keyframe is within 1000ms after the start", () => {
  assert.deepEqual(
    decideCopyCutMode({
      cut_mode: "copy",
      begin_ms: 0,
      keyframe_times_ms: [40, 2_000, 4_000]
    }),
    { cut_mode_used: "copy", keyframe_distance_ms: 40 }
  );
});

test("decideCopyCutMode degrades when the first keyframe is more than 1000ms after the start", () => {
  const decision = decideCopyCutMode({
    cut_mode: "copy",
    begin_ms: 0,
    keyframe_times_ms: [1_500, 3_000]
  });

  assert.equal(decision.cut_mode_used, "precise");
  assert.equal(decision.keyframe_distance_ms, 1_500);
  assert.match(decision.degrade_reason ?? "", /1000ms/);
});

test("decideCopyCutMode does not copy when the cut ends before the first keyframe", () => {
  const decision = decideCopyCutMode({
    cut_mode: "copy",
    begin_ms: 0,
    end_ms: 30,
    keyframe_times_ms: [40]
  });

  assert.equal(decision.cut_mode_used, "precise");
  assert.match(decision.degrade_reason ?? "", /晚于剪切终点/);
});

test("decideCopyCutMode degrades when no keyframe could be located and leaves non-copy modes unchanged", () => {
  assert.deepEqual(
    decideCopyCutMode({ cut_mode: "copy", begin_ms: 4_800, keyframe_times_ms: [] }),
    { cut_mode_used: "precise", degrade_reason: "无法定位源视频关键帧，已自动降级为精准剪切" }
  );
  assert.deepEqual(
    decideCopyCutMode({ cut_mode: "smart", begin_ms: 4_800, keyframe_times_ms: [] }),
    { cut_mode_used: "smart" }
  );
});

test("estimates ffmpeg timeout from cut range with configurable upper bound", () => {
  assert.equal(resolveFfmpegTimeoutMs({ range_ms: 10_000 }), 140_000);
  assert.equal(resolveFfmpegTimeoutMs({ range_ms: 10_000, max_ms: 60_000 }), 60_000);
  assert.equal(resolveFfmpegTimeoutMs({ range_ms: 0 }), 120_000);
  assert.equal(resolveFfmpegTimeoutMs({ range_ms: -50 }), 120_000);
  assert.equal(resolveFfmpegTimeoutMs({ range_ms: 10_000, max_ms: 1_000 }), 30_000);
  assert.equal(resolveFfmpegTimeoutMs({ range_ms: 60 * 60 * 1000 }), 2 * 60 * 60 * 1000);
});
