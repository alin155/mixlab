import assert from "node:assert/strict";
import test from "node:test";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import {
  getAdminRuntimeSettings,
  type AdminRuntimeSettingsQueryDeps
} from "./admin-runtime-settings-query.ts";

function manifest(sourceVideoId: string): SourceVideoManifest {
  return { source_video_id: sourceVideoId } as SourceVideoManifest;
}

function baseDeps(): AdminRuntimeSettingsQueryDeps {
  return {
    async read_admin_settings() {
      return {
        runtime_policy: {
          audio_mode: "wav_16k_mono_pcm_s16le"
        }
      };
    },
    async read_library_manifest() {
      return {
        video_count: 3,
        ready_video_count: 0,
        unprocessed_video_count: 0,
        queued_video_count: 0,
        processing_video_count: 0,
        failed_video_count: 3,
        index_required_video_count: 0
      };
    },
    async read_all_source_video_manifests() {
      return [manifest("V000001"), manifest("V000002"), manifest("V000003")];
    },
    async read_preprocess_job(_libraryRoot, sourceVideoId) {
      const jobs = {
        V000001: {
          source_video_id: "V000001",
          error_stage: "asr",
          error_message: "较早失败",
          failed_at: "2026-05-02T10:00:00.000Z"
        },
        V000002: {
          source_video_id: "V000002",
          error_stage: "asr",
          error_message: "最新失败",
          stage_updated_at: "2026-05-02T11:00:00.000Z"
        },
        V000003: {
          source_video_id: "V000003",
          error_stage: "ffmpeg",
          error_message: "非 ASR 失败",
          failed_at: "2026-05-02T12:00:00.000Z"
        }
      } as const;
      return jobs[sourceVideoId as keyof typeof jobs] ?? null;
    },
    resolve_ffmpeg_runtime() {
      return {
        source: "bundled:test",
        ffmpeg_path: "/tmp/ffmpeg",
        ffprobe_path: "/tmp/ffprobe"
      };
    },
    read_runtime_version(executablePath) {
      return executablePath.endsWith("ffprobe") ? "ffprobe version test" : "ffmpeg version test";
    }
  };
}

test("runtime settings query reports runtime binaries, ASR config, and latest ASR failure", async () => {
  const runtime = await getAdminRuntimeSettings({
    library_root: "/tmp/mixlab-runtime-settings",
    env: {
      DASHSCOPE_API_KEY: "  sk-test  ",
      MIXLAB_ASR_MODEL: "paraformer-test"
    },
    max_asr_failure_scan_manifests: 100,
    deps: baseDeps()
  });

  assert.equal(runtime.ffmpeg.available, true);
  assert.equal(runtime.ffmpeg.source, "bundled");
  assert.equal(runtime.ffmpeg.version, "ffmpeg version test");
  assert.equal(runtime.ffprobe.version, "ffprobe version test");
  assert.equal(runtime.asr.model, "paraformer-test");
  assert.equal(runtime.asr.audio_mode, "wav_16k_mono_pcm_s16le");
  assert.equal(runtime.asr.dashscope_api_key_configured, true);
  assert.equal(runtime.asr.last_failure_reason, "V000002 最新失败");
});

test("runtime settings query skips ASR failure manifest scan for large libraries", async () => {
  let manifestReadCount = 0;
  const deps = {
    ...baseDeps(),
    async read_library_manifest() {
      return {
        video_count: 101,
        ready_video_count: 100,
        unprocessed_video_count: 0,
        queued_video_count: 0,
        processing_video_count: 0,
        failed_video_count: 1,
        index_required_video_count: 0
      };
    },
    async read_all_source_video_manifests() {
      manifestReadCount += 1;
      return [manifest("V000001")];
    }
  };

  const runtime = await getAdminRuntimeSettings({
    library_root: "/tmp/mixlab-runtime-settings-large",
    env: {},
    max_asr_failure_scan_manifests: 100,
    deps
  });

  assert.equal(runtime.asr.last_failure_reason, "");
  assert.equal(manifestReadCount, 0);
});

test("runtime settings query keeps ASR settings when runtime resolution fails", async () => {
  const deps = {
    ...baseDeps(),
    resolve_ffmpeg_runtime() {
      throw new Error("ffmpeg missing");
    }
  };

  const runtime = await getAdminRuntimeSettings({
    library_root: "/tmp/mixlab-runtime-settings-missing",
    env: {},
    max_asr_failure_scan_manifests: 100,
    deps
  });

  assert.equal(runtime.ffmpeg.available, false);
  assert.equal(runtime.ffmpeg.source, "missing");
  assert.equal(runtime.ffmpeg.last_error, "ffmpeg missing");
  assert.equal(runtime.ffprobe.available, false);
  assert.equal(runtime.asr.model, "paraformer-v2");
  assert.equal(runtime.asr.dashscope_api_key_configured, false);
  assert.equal(runtime.asr.last_failure_reason, "V000002 最新失败");
});
