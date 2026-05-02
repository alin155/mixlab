import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PREPROCESS_AUDIO_MODE_ID,
  PREPROCESS_AUDIO_MODES,
  resolvePreprocessAudioMode
} from "./audio-mode.ts";

test("exposes only the admin-selectable production audio modes", () => {
  assert.equal(DEFAULT_PREPROCESS_AUDIO_MODE_ID, "mp3_16k_mono_64k");
  assert.deepEqual(
    PREPROCESS_AUDIO_MODES.map((mode) => ({
      id: mode.id,
      audio_format: mode.audio_format,
      audio_bitrate: mode.audio_bitrate,
      content_type: mode.content_type
    })),
    [
      {
        id: "mp3_16k_mono_64k",
        audio_format: "mp3",
        audio_bitrate: "64k",
        content_type: "audio/mpeg"
      },
      {
        id: "wav_16k_mono_pcm_s16le",
        audio_format: "wav",
        audio_bitrate: undefined,
        content_type: "audio/wav"
      }
    ]
  );
});

test("resolves omitted mode to the mp3 production default", () => {
  assert.equal(resolvePreprocessAudioMode().id, "mp3_16k_mono_64k");
});

test("rejects audio modes that are not admin-selectable for preprocessing", () => {
  assert.throws(
    () => resolvePreprocessAudioMode("m4a_aac_16k_mono_48k"),
    /unknown preprocess audio mode: m4a_aac_16k_mono_48k/
  );
});
