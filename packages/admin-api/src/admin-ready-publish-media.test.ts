import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultReadyPublishMedia,
  runAdminReadyPublishProcess
} from "./admin-ready-publish-media.ts";

test("default ready publish media builds a cover plan and runs ffmpeg", async () => {
  const calls: Array<{ executable: string; args: string[] }> = [];
  const media = createDefaultReadyPublishMedia({
    resolve_ffmpeg_runtime() {
      return {
        source: "bundled-static",
        ffmpeg_path: "/tmp/ffmpeg",
        ffprobe_path: "/tmp/ffprobe"
      };
    },
    build_cover_image_plan(input) {
      assert.deepEqual(input, {
        source_path: "/library/source.mp4",
        output_path: "/library/.mixlab-library/videos/V000001/cover.jpg",
        at_ms: 1500,
        width: 960
      });
      return {
        executable: "ffmpeg",
        args: ["-i", input.source_path, "-vf", `scale=${input.width}:-1`, input.output_path]
      };
    },
    run_process(executable, args) {
      calls.push({ executable, args });
    }
  });

  await media.create_cover({
    source_path: "/library/source.mp4",
    output_path: "/library/.mixlab-library/videos/V000001/cover.jpg",
    at_ms: 1500,
    width: 960
  });

  assert.deepEqual(calls, [
    {
      executable: "/tmp/ffmpeg",
      args: [
        "-i",
        "/library/source.mp4",
        "-vf",
        "scale=960:-1",
        "/library/.mixlab-library/videos/V000001/cover.jpg"
      ]
    }
  ]);
});

test("ready publish process keeps the existing non-zero exit failure message", () => {
  assert.throws(
    () => runAdminReadyPublishProcess("/path/that/does/not/exist/ffmpeg", ["-version"]),
    /\/path\/that\/does\/not\/exist\/ffmpeg 执行失败/
  );
});
