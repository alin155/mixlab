import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runSourceVideoTextPreprocess } from "./index.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mixlab-preprocess-core-"));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function requireString(value: unknown, message: string): string {
  assert.equal(typeof value, "string", message);
  return value as string;
}

test("extracts audio, uploads it, runs ASR, and writes transcript artifacts", async () => {
  const libraryRoot = await makeLibraryRoot();
  const sourceVideoPath = path.join(libraryRoot, "source-videos", "课程", "老板现金流.mp4");
  const commands: Array<{ executable: string; args: string[] }> = [];
  const uploadedFiles: Array<{ local_file_path: string; object_key: string }> = [];
  const sleeps: number[] = [];
  const stages: string[] = [];
  let queryCount = 0;

  await mkdir(path.dirname(sourceVideoPath), { recursive: true });
  await writeFile(sourceVideoPath, "fake-video");

  const result = await runSourceVideoTextPreprocess({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    source_video_id: "V000001",
    source_video_path: sourceVideoPath,
    ffmpeg_path: "/bin/ffmpeg",
    audio_format: "mp3",
    oss_object_key_prefix: "mixlab-stage",
    now: "2026-05-02T00:00:00Z",
    async on_stage(stage) {
      stages.push(stage);
    },
    command_runner: {
      async run(executable, args) {
        commands.push({ executable, args });
        const outputPath = args.at(-1);

        if (!outputPath) {
          throw new Error("missing output path");
        }

        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, "fake-audio");
      }
    },
    uploader: {
      async uploadAsrAudio(input) {
        if (!input.object_key) {
          throw new Error("legacy OSS test expected an object key");
        }

        uploadedFiles.push({
          local_file_path: input.local_file_path,
          object_key: input.object_key
        });

        return {
          object_key: input.object_key,
          file_url: `https://oss.example.com/${input.object_key}`,
          url_mode: "signed-url"
        };
      }
    },
    asr_http: {
      async requestJson(request) {
        if (request.url.endsWith("/transcription")) {
          return {
            output: {
              task_id: "task-123"
            }
          };
        }

        queryCount += 1;

        if (queryCount === 1) {
          return {
            output: {
              task_status: "RUNNING"
            }
          };
        }

        return {
          output: {
            task_status: "SUCCEEDED",
            results: [
              {
                transcription_url: "https://example.com/transcription.json"
              }
            ]
          }
        };
      },
      async getJson() {
        return {
          properties: {
            original_duration_in_milliseconds: 3_000
          },
          transcripts: [
            {
              text: "现金流，是企业的血液。",
              sentences: [
                {
                  begin_time: 0,
                  end_time: 3_000,
                  text: "现金流，是企业的血液。"
                }
              ]
            }
          ]
        };
      }
    },
    asr: {
      api_key: "sk-test-secret",
      model: "paraformer-v2",
      max_poll_attempts: 3,
      poll_interval_ms: 1500,
      async sleep(milliseconds) {
        sleeps.push(milliseconds);
      }
    }
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0]?.executable, "/bin/ffmpeg");
  const extractedAudioPath = requireString(commands[0]?.args.at(-1), "expected ffmpeg output path");
  const finalAudioPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "videos",
    "V000001",
    "asr-audio",
    "audio.mp3"
  );

  assert.notEqual(extractedAudioPath, finalAudioPath);
  assert.equal(path.dirname(extractedAudioPath), path.dirname(finalAudioPath));
  assert.match(extractedAudioPath, /audio\.tmp-.+\.mp3$/);
  assert.deepEqual(uploadedFiles, [
    {
      local_file_path: finalAudioPath,
      object_key: "mixlab-stage/lib_main_001/asr-audio/V000001/audio.mp3"
    }
  ]);
  assert.equal(await readFile(finalAudioPath, "utf8"), "fake-audio");
  assert.equal(
    (await readdir(path.dirname(finalAudioPath))).some((entry) => entry.includes(".tmp-")),
    false
  );
  assert.deepEqual(result, {
    source_video_id: "V000001",
    audio_path: ".mixlab-library/videos/V000001/asr-audio/audio.mp3",
    audio_object_key: "mixlab-stage/lib_main_001/asr-audio/V000001/audio.mp3",
    audio_file_url:
      "https://oss.example.com/mixlab-stage/lib_main_001/asr-audio/V000001/audio.mp3",
    asr_task_id: "task-123",
    transcription_url: "https://example.com/transcription.json",
    transcript_path: ".mixlab-library/videos/V000001/transcript.json",
    srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
    duration_ms: 3_000,
    segment_count: 1
  });
  assert.deepEqual(sleeps, [1500]);
  assert.deepEqual(stages, ["extract-audio", "upload-audio", "asr", "write-transcript"]);
  assert.match(
    await readFile(path.join(libraryRoot, result.transcript_path), "utf8"),
    /现金流，是企业的血液。/
  );
});

test("supports DashScope temporary uploaders without caller-provided object keys", async () => {
  const libraryRoot = await makeLibraryRoot();
  const sourceVideoPath = path.join(libraryRoot, "source-videos", "课程", "老板现金流.mp4");
  const uploadedInputs: unknown[] = [];

  await mkdir(path.dirname(sourceVideoPath), { recursive: true });
  await writeFile(sourceVideoPath, "fake-video");

  const result = await runSourceVideoTextPreprocess({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    source_video_id: "V000001",
    source_video_path: sourceVideoPath,
    ffmpeg_path: "/bin/ffmpeg",
    audio_format: "mp3",
    now: "2026-05-02T00:00:00Z",
    command_runner: {
      async run(_executable, args) {
        const outputPath = args.at(-1);

        if (!outputPath) {
          throw new Error("missing output path");
        }

        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, "fake-audio");
      }
    },
    uploader: {
      async uploadAsrAudio(input) {
        uploadedInputs.push(input);

        return {
          object_key: "dashscope-instant/dir/audio.mp3",
          file_url: "oss://dashscope-instant/dir/audio.mp3",
          url_mode: "dashscope-temporary-oss"
        };
      }
    },
    asr_http: {
      async requestJson(request) {
        if (request.url.endsWith("/transcription")) {
          return {
            output: {
              task_id: "task-123"
            }
          };
        }

        return {
          output: {
            task_status: "SUCCEEDED",
            results: [
              {
                transcription_url: "https://example.com/transcription.json"
              }
            ]
          }
        };
      },
      async getJson() {
        return {
          properties: {
            original_duration_in_milliseconds: 3_000
          },
          transcripts: [
            {
              text: "临时上传链路。",
              sentences: [
                {
                  begin_time: 0,
                  end_time: 3_000,
                  text: "临时上传链路。"
                }
              ]
            }
          ]
        };
      }
    },
    asr: {
      api_key: "sk-test-secret",
      model: "paraformer-v2"
    }
  });

  assert.deepEqual(uploadedInputs, [
    {
      local_file_path: path.join(
        libraryRoot,
        ".mixlab-library",
        "videos",
        "V000001",
        "asr-audio",
        "audio.mp3"
      ),
      content_type: "audio/mpeg"
    }
  ]);
  assert.equal(result.audio_object_key, "dashscope-instant/dir/audio.mp3");
  assert.equal(result.audio_file_url, "oss://dashscope-instant/dir/audio.mp3");
});

test("writes empty text artifacts when DashScope reports no valid fragment", async () => {
  const libraryRoot = await makeLibraryRoot();
  const sourceVideoPath = path.join(libraryRoot, "source-videos", "花絮", "无可识别语音.mp4");
  const downloadedUrls: string[] = [];

  await mkdir(path.dirname(sourceVideoPath), { recursive: true });
  await writeFile(sourceVideoPath, "fake-video");

  const result = await runSourceVideoTextPreprocess({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    source_video_id: "V000001",
    source_video_path: sourceVideoPath,
    ffmpeg_path: "/bin/ffmpeg",
    now: "2026-05-02T00:00:00Z",
    command_runner: {
      async run(_executable, args) {
        const outputPath = args.at(-1);

        if (!outputPath) {
          throw new Error("missing output path");
        }

        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, "fake-audio");
      }
    },
    uploader: {
      async uploadAsrAudio(input) {
        return {
          object_key: "dashscope-instant/dir/audio.mp3",
          file_url: "oss://dashscope-instant/dir/audio.mp3",
          url_mode: "dashscope-temporary-oss"
        };
      }
    },
    asr_http: {
      async requestJson(request) {
        if (request.url.endsWith("/transcription")) {
          return {
            output: {
              task_id: "task-123"
            }
          };
        }

        return {
          output: {
            task_status: "FAILED",
            message: "SUCCESS_WITH_NO_VALID_FRAGMENT"
          }
        };
      },
      async getJson(url) {
        downloadedUrls.push(url);
        throw new Error("no-valid-fragment results should not download JSON");
      }
    },
    asr: {
      api_key: "sk-test-secret",
      model: "paraformer-v2"
    }
  });

  assert.equal(result.segment_count, 0);
  assert.equal(result.duration_ms, 0);
  assert.equal(result.transcription_url, "dashscope://no-valid-fragment/task-123");
  assert.equal(await readFile(path.join(libraryRoot, result.srt_path), "utf8"), "");
  assert.deepEqual(
    JSON.parse(await readFile(path.join(libraryRoot, result.transcript_path), "utf8")),
    {
      schema_version: "1.0",
      source_video_id: "V000001",
      provider: "dashscope",
      model: "paraformer-v2",
      generated_at: "2026-05-02T00:00:00Z",
      duration_ms: 0,
      full_text: "",
      segments: []
    }
  );
  assert.deepEqual(downloadedUrls, []);
});

test("uses audio/mp4 content type for m4a audio extraction", async () => {
  const libraryRoot = await makeLibraryRoot();
  const sourceVideoPath = path.join(libraryRoot, "source-videos", "课程", "老板现金流.mp4");
  const uploadedInputs: unknown[] = [];

  await mkdir(path.dirname(sourceVideoPath), { recursive: true });
  await writeFile(sourceVideoPath, "fake-video");

  const result = await runSourceVideoTextPreprocess({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    source_video_id: "V000001",
    source_video_path: sourceVideoPath,
    ffmpeg_path: "/bin/ffmpeg",
    audio_format: "m4a",
    now: "2026-05-02T00:00:00Z",
    command_runner: {
      async run(_executable, args) {
        const outputPath = args.at(-1);

        if (!outputPath) {
          throw new Error("missing output path");
        }

        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, "fake-audio");
      }
    },
    uploader: {
      async uploadAsrAudio(input) {
        uploadedInputs.push(input);

        return {
          object_key: "dashscope-instant/dir/audio.m4a",
          file_url: "oss://dashscope-instant/dir/audio.m4a",
          url_mode: "dashscope-temporary-oss"
        };
      }
    },
    asr_http: {
      async requestJson(request) {
        if (request.url.endsWith("/transcription")) {
          return {
            output: {
              task_id: "task-123"
            }
          };
        }

        return {
          output: {
            task_status: "SUCCEEDED",
            results: [
              {
                transcription_url: "https://example.com/transcription.json"
              }
            ]
          }
        };
      },
      async getJson() {
        return {
          properties: {
            original_duration_in_milliseconds: 3_000
          },
          transcripts: [
            {
              text: "M4A 临时上传链路。",
              sentences: [
                {
                  begin_time: 0,
                  end_time: 3_000,
                  text: "M4A 临时上传链路。"
                }
              ]
            }
          ]
        };
      }
    },
    asr: {
      api_key: "sk-test-secret",
      model: "paraformer-v2"
    }
  });

  assert.deepEqual(uploadedInputs, [
    {
      local_file_path: path.join(
        libraryRoot,
        ".mixlab-library",
        "videos",
        "V000001",
        "asr-audio",
        "audio.m4a"
      ),
      content_type: "audio/mp4"
    }
  ]);
  assert.equal(result.audio_path, ".mixlab-library/videos/V000001/asr-audio/audio.m4a");
});

test("uses the selected wav production audio mode for preprocessing", async () => {
  const libraryRoot = await makeLibraryRoot();
  const sourceVideoPath = path.join(libraryRoot, "source-videos", "课程", "老板现金流.mp4");
  const commands: Array<{ executable: string; args: string[] }> = [];
  const uploadedInputs: unknown[] = [];

  await mkdir(path.dirname(sourceVideoPath), { recursive: true });
  await writeFile(sourceVideoPath, "fake-video");

  const result = await runSourceVideoTextPreprocess({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    source_video_id: "V000001",
    source_video_path: sourceVideoPath,
    ffmpeg_path: "/bin/ffmpeg",
    audio_mode: "wav_16k_mono_pcm_s16le",
    now: "2026-05-02T00:00:00Z",
    command_runner: {
      async run(executable, args) {
        commands.push({ executable, args });
        const outputPath = args.at(-1);

        if (!outputPath) {
          throw new Error("missing output path");
        }

        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, "fake-audio");
      }
    },
    uploader: {
      async uploadAsrAudio(input) {
        uploadedInputs.push(input);

        return {
          object_key: "dashscope-instant/dir/audio.wav",
          file_url: "oss://dashscope-instant/dir/audio.wav",
          url_mode: "dashscope-temporary-oss"
        };
      }
    },
    asr_http: {
      async requestJson(request) {
        if (request.url.endsWith("/transcription")) {
          return {
            output: {
              task_id: "task-123"
            }
          };
        }

        return {
          output: {
            task_status: "SUCCEEDED",
            results: [
              {
                transcription_url: "https://example.com/transcription.json"
              }
            ]
          }
        };
      },
      async getJson() {
        return {
          properties: {
            original_duration_in_milliseconds: 3_000
          },
          transcripts: [
            {
              text: "WAV 高保真模式。",
              sentences: [
                {
                  begin_time: 0,
                  end_time: 3_000,
                  text: "WAV 高保真模式。"
                }
              ]
            }
          ]
        };
      }
    },
    asr: {
      api_key: "sk-test-secret",
      model: "paraformer-v2"
    }
  });

  const commandArgs = commands[0]?.args ?? [];
  const finalAudioPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "videos",
    "V000001",
    "asr-audio",
    "audio.wav"
  );
  const extractedAudioPath = requireString(commandArgs.at(-1), "expected ffmpeg output path");

  assert.deepEqual(commandArgs.slice(0, -1), [
    "-hide_banner",
    "-y",
    "-i",
    sourceVideoPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-codec:a",
    "pcm_s16le"
  ]);
  assert.notEqual(extractedAudioPath, finalAudioPath);
  assert.equal(path.dirname(extractedAudioPath), path.dirname(finalAudioPath));
  assert.match(extractedAudioPath, /audio\.tmp-.+\.wav$/);
  assert.deepEqual(uploadedInputs, [
    {
      local_file_path: finalAudioPath,
      content_type: "audio/wav"
    }
  ]);
  assert.equal(result.audio_path, ".mixlab-library/videos/V000001/asr-audio/audio.wav");
});

test("cleans temporary audio when extraction fails before upload", async () => {
  const libraryRoot = await makeLibraryRoot();
  const sourceVideoPath = path.join(libraryRoot, "source-videos", "课程", "老板现金流.mp4");
  const finalAudioPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "videos",
    "V000001",
    "asr-audio",
    "audio.mp3"
  );
  let temporaryAudioPath = "";

  await mkdir(path.dirname(sourceVideoPath), { recursive: true });
  await writeFile(sourceVideoPath, "fake-video");

  await assert.rejects(() => runSourceVideoTextPreprocess({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    source_video_id: "V000001",
    source_video_path: sourceVideoPath,
    ffmpeg_path: "/bin/ffmpeg",
    audio_format: "mp3",
    now: "2026-05-02T00:00:00Z",
    command_runner: {
      async run(_executable, args) {
        const outputPath = args.at(-1);

        if (!outputPath) {
          throw new Error("missing output path");
        }

        temporaryAudioPath = outputPath;
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, "partial-audio");
        throw new Error("ffmpeg failed");
      }
    },
    uploader: {
      async uploadAsrAudio() {
        throw new Error("upload should not run after extraction failure");
      }
    },
    asr_http: {
      async requestJson() {
        throw new Error("ASR submit should not run after extraction failure");
      },
      async getJson() {
        throw new Error("ASR result fetch should not run after extraction failure");
      }
    },
    asr: {
      api_key: "sk-test-secret",
      model: "paraformer-v2"
    }
  }), /ffmpeg failed/);

  assert.match(temporaryAudioPath, /audio\.tmp-.+\.mp3$/);
  assert.equal(await pathExists(temporaryAudioPath), false);
  assert.equal(await pathExists(finalAudioPath), false);
});
