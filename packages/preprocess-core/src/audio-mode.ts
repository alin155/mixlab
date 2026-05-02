import type { AudioExtractionFormat } from "../../ffmpeg-core/src/index.ts";

export type PreprocessAudioModeId =
  | "mp3_16k_mono_64k"
  | "wav_16k_mono_pcm_s16le";

export interface PreprocessAudioMode {
  id: PreprocessAudioModeId;
  label: string;
  audio_format: AudioExtractionFormat;
  extension: AudioExtractionFormat;
  sample_rate_hz: number;
  channels: number;
  audio_bitrate?: string;
  content_type: string;
}

export const DEFAULT_PREPROCESS_AUDIO_MODE_ID: PreprocessAudioModeId = "mp3_16k_mono_64k";

export const PREPROCESS_AUDIO_MODES: PreprocessAudioMode[] = [
  {
    id: "mp3_16k_mono_64k",
    label: "MP3 16 kHz mono 64 kbps",
    audio_format: "mp3",
    extension: "mp3",
    sample_rate_hz: 16_000,
    channels: 1,
    audio_bitrate: "64k",
    content_type: "audio/mpeg"
  },
  {
    id: "wav_16k_mono_pcm_s16le",
    label: "WAV 16 kHz mono PCM s16le",
    audio_format: "wav",
    extension: "wav",
    sample_rate_hz: 16_000,
    channels: 1,
    content_type: "audio/wav"
  }
];

const MODES_BY_ID = new Map(
  PREPROCESS_AUDIO_MODES.map((mode) => [mode.id, mode])
);

export function resolvePreprocessAudioMode(modeId?: string): PreprocessAudioMode {
  const selectedModeId = modeId?.trim() || DEFAULT_PREPROCESS_AUDIO_MODE_ID;
  const mode = MODES_BY_ID.get(selectedModeId as PreprocessAudioModeId);

  if (!mode) {
    throw new Error(`unknown preprocess audio mode: ${selectedModeId}`);
  }

  return mode;
}
