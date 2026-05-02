# MixLab V3

MixLab V3 is a local/LAN video material search and clip export system for editing teams.

Current implementation status:

- `packages/protocol`: shared public-library protocol primitives.
- `packages/library-fs`: file-system helpers for source-video scanning, unprocessed manifest creation, immutable index package publishing, and `current.json` switching.
- `packages/search-core`: normalized transcript search that groups hits by original video.
- `packages/search-sqlite`: SQLite/n-gram source transcript index builder and search reader for versioned ready index packages.
- `packages/ffmpeg-core`: FFmpeg cut command planning for `copy`, `smart`, and `precise` modes.
- `packages/cutter-local`: cutter-side local workspace persistence for clip lists, cut jobs, reusable export clips, and `export-clip.json`.
- `packages/asr-core`: Aliyun Bailian / DashScope Paraformer request planning and secret-safe request redaction.
- `packages/doctor-core`: non-UI health diagnostics for public-library paths, manifests, ready artifacts, current index, FFmpeg/FFprobe, ASR config, and local clip manifests.
- `packages/ui-foundation`: Apple-HIG inspired shared tokens, layout primitives, React components, and design-contract guards for formal UI work.
- `packages/cutter-api`: local cutter-side HTTP bridge for ready source-video catalog, detail, transcript search, cover, subtitles, and range-capable source media streaming.
- `apps/admin-web`: formal management console MVP for dashboard, public library settings, source metadata governance, preprocessing jobs, index publication, Doctor, and runtime/ASR settings.
- `apps/cutter-web`: formal cutter-side React workspace for ready-only public source gallery, source detail and complete transcript reading, grouped search, cut list, local reusable clips, cut queue, and settings.
- `apps/ui-fixtures`: non-product visual acceptance fixtures for cutter/admin UI direction and screenshot checks.
- TDD coverage for ready visibility, library count consistency, cross-platform path resolution, transcript normalization, segment span selection, versioned read-only index package validation, search result grouping, FFmpeg command plans, FFmpeg bundled runtime detection, and DashScope ASR request construction.

Important product-status note:

- The cutter web app now has the formal M4 product UI surface. M7 adds workspace-backed local clipping, cut-list persistence, cut jobs, and export manifests through the local API bridge. Native Tauri packaging and desktop open/reveal commands remain later milestones.
- Formal product UI must follow `/Users/allen/Desktop/MixLab_V3_开发交付规格书/21_视觉与交互设计规范.md`.
- Formal cutter UI must align with `/Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/cutter-workbench-apple-hig.png`.
- Formal admin UI must align with `/Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/admin-console-apple-hig.png`.

## Spec-Driven Development Rules

Development is now governed by:

- `docs/superpowers/plans/2026-05-02-mixlab-v3-spec-driven-delivery.md`
- `docs/spec-traceability.md`

Before changing code, every task must declare:

```text
This step:
Spec sources:
Hi-fi screen:
Files to change:
Explicitly not doing:
Acceptance:
```

No feature or UI work should proceed unless it maps to a traceability ID. UI work must include screenshot review against the relevant hi-fi reference. The cutter end must never expose non-ready videos and must never write to the public library.

## Commands

```bash
npm install
npm test
npm run typecheck
```

## Spike Commands

```bash
npm run spike:index-publish
npm run spike:source-scan
npm run spike:preprocess-lifecycle
npm run spike:cutter-catalog
npm run spike:path-resolution
npm run spike:search -- "现金流，是企业的血液"
npm run spike:ffmpeg-plan
npm run spike:ffmpeg-real-cut
npm run spike:ffmpeg-extract-audio
npm run spike:oss-upload-plan
npm run spike:oss-client-factory
npm run spike:oss-live-upload
npm run spike:asr-request
npm run spike:dashscope-temp-upload
npm run spike:asr-live-run
npm run spike:asr-artifact-write
npm run spike:audio-format-benchmark
npm run spike:preprocess-live-batch
npm run spike:preprocess-live-text-pipeline
npm run spike:preprocess-text-pipeline
npm run worker:preprocess-library
npm run worker:publish-ready
npm run server:cutter-api
npm run dev:admin-web
npm run build:admin-web
npm run visual:admin-web
npm run dev:cutter-web
npm run build:cutter-web
npm run visual:cutter-web
npm run build:ui-fixtures
npm run visual:ui-foundation
```

`spike:ffmpeg-plan` prints command strategy and detects system plus bundled `ffmpeg` / `ffprobe` availability.

`spike:source-scan` creates a temporary public-library folder, scans `source-videos`, writes unprocessed `source-video.json` manifests, and proves rescans preserve existing source-video IDs while adding new videos.

`spike:preprocess-lifecycle` demonstrates the resumable source-video state chain: unprocessed videos are claimed as hidden processing jobs, completed artifacts become `index-required`, and only indexed videos become cutter-visible `ready` records.

`spike:cutter-catalog` demonstrates the cutter-side read model: only `ready` and `visible_to_cutters` source videos appear, along with the available source-video count.

`spike:ffmpeg-real-cut` creates a synthetic source video and validates real local `copy` and `precise` clip export using bundled static FFmpeg.

`spike:ffmpeg-extract-audio` creates a synthetic source video with audio and validates local 16 kHz mono MP3/WAV extraction for the ASR upload step.

`spike:oss-upload-plan` demonstrates the OSS upload boundary with a fake Aliyun OSS compatible client, including object-key generation, signed URL output, and secret-safe config redaction.

`spike:oss-client-factory` imports and constructs the real `ali-oss` client from runtime config without performing an upload.

`spike:oss-live-upload` is the controlled real-upload check. It is skipped by default and only uploads when `MIXLAB_ENABLE_LIVE_OSS_UPLOAD=1` plus the OSS bucket, endpoint, and access-key environment variables are present. Signed URL query strings are redacted in logs.

`spike:asr-request` prints a redacted DashScope Paraformer request. Set `DASHSCOPE_API_KEY` and `MIXLAB_ASR_AUDIO_URL` locally when moving from dry-run to live ASR integration.

`spike:dashscope-temp-upload` is the controlled real DashScope temporary-file upload check. It is skipped by default and only uploads a local audio file when `MIXLAB_ENABLE_LIVE_DASHSCOPE_TEMP_UPLOAD=1`, `DASHSCOPE_API_KEY`, and `MIXLAB_TEMP_UPLOAD_FILE` are present.

`spike:asr-live-run` is the controlled real DashScope ASR check. It is skipped by default and only submits a real ASR task when `MIXLAB_ENABLE_LIVE_ASR=1`, `DASHSCOPE_API_KEY`, and `MIXLAB_ASR_AUDIO_URL` are present. `MIXLAB_ASR_AUDIO_URL` must already be an `http(s)` or `oss://` URL, so local audio still goes through the OSS upload boundary first.

`spike:asr-artifact-write` uses a simulated DashScope task response to validate the local transcript/SRT conversion and writes those artifacts into `.mixlab-library/videos/<source_video_id>/`.

`spike:audio-format-benchmark` is the controlled real audio-format benchmark. It is skipped by default. A real run requires `MIXLAB_ENABLE_LIVE_AUDIO_FORMAT_BENCHMARK=1`, `DASHSCOPE_API_KEY`, and `MIXLAB_AUDIO_BENCHMARK_SOURCE_VIDEO_PATH`. It extracts the same source video into `mp3_16k_mono_64k`, `mp3_16k_mono_32k`, `m4a_aac_16k_mono_48k`, and `wav_16k_mono_pcm_s16le`, uploads each audio file through DashScope temporary storage, runs ASR, writes transcript/SRT artifacts, and reports file size, stage timings, and text similarity against the WAV baseline.

`spike:preprocess-live-text-pipeline` is the controlled real end-to-end text preprocessing check. It is skipped by default. A real run requires `MIXLAB_ENABLE_LIVE_PREPROCESS=1`, `DASHSCOPE_API_KEY`, and `MIXLAB_PREPROCESS_SOURCE_VIDEO_PATH`. `MIXLAB_PREPROCESS_AUDIO_MODE` selects the administrator-facing preprocessing mode: `mp3_16k_mono_64k` by default, or `wav_16k_mono_pcm_s16le` for high-fidelity baseline runs. It extracts local audio with bundled FFmpeg, uploads the audio through DashScope temporary storage, submits DashScope ASR with the returned `oss://` URL, and writes transcript/SRT artifacts under the selected library root.

`spike:preprocess-live-batch` is the controlled real directory-level text preprocessing check. It is skipped by default. A real run requires `MIXLAB_ENABLE_LIVE_PREPROCESS_BATCH=1`, `DASHSCOPE_API_KEY`, and `MIXLAB_PREPROCESS_SOURCE_DIR`. It uses the same `MIXLAB_PREPROCESS_AUDIO_MODE` choices as the single-video pipeline, recursively scans the source directory, ignores unsupported files such as macOS `._` resource-fork entries, can restrict the run with `MIXLAB_PREPROCESS_BATCH_LIMIT` or `MIXLAB_PREPROCESS_BATCH_FILE_NAMES`, processes videos sequentially, continues after per-video failures, and writes a JSON run summary under `.mixlab-library/preprocess-runs/`.

`spike:preprocess-text-pipeline` runs the text preprocessing pipeline with real bundled FFmpeg audio extraction plus fake OSS/DashScope adapters, then updates the source-video manifest to `index-required`.

`worker:preprocess-library` is the production-shaped public-library preprocessing worker. It is skipped by default. A real run requires `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=1`, `DASHSCOPE_API_KEY`, and `MIXLAB_PREPROCESS_LIBRARY_ROOT` pointing at a library root containing `source-videos/`. Each run scans for newly added videos, claims up to `MIXLAB_PREPROCESS_WORKER_LIMIT` unprocessed videos, probes media metadata with bundled ffprobe, extracts ASR audio with the selected `MIXLAB_PREPROCESS_AUDIO_MODE`, uploads audio through DashScope temporary storage, writes transcript/SRT artifacts, and moves successful videos to hidden `index-required`. Per-video failures are written as hidden `failed` records and do not stop later videos. `MIXLAB_PREPROCESS_FILE_IDENTITY_MODE=stat` is the default fast identity mode for large libraries; set it to `sha256` only when exact full-file hashing is required.

`worker:publish-ready` is the production-shaped ready-publication worker. It is skipped by default. A real run requires `MIXLAB_ENABLE_READY_PUBLISH_WORKER=1` and `MIXLAB_PREPROCESS_LIBRARY_ROOT`. It scans `index-required` videos, generates `cover.jpg` with bundled FFmpeg, writes `keyframes.json`, publishes a new immutable SQLite source transcript index package, and only then marks complete videos as cutter-visible `ready`. Incomplete videos remain hidden.

`dev:admin-web` starts the formal management console MVP. It uses fixture data by default and can point to a future backend with `VITE_MIXLAB_ADMIN_API_BASE_URL`. `visual:admin-web` opens the admin app in local Chrome at 1536x1024 and saves dashboard/settings/source/jobs/index/Doctor screenshots under `docs/acceptance/artifacts/m5-admin-console/`.

`server:cutter-api` starts the local cutter-side HTTP bridge. Set `MIXLAB_CUTTER_LIBRARY_ROOT` or reuse `MIXLAB_PREPROCESS_LIBRARY_ROOT`; optional `MIXLAB_CUTTER_API_HOST` and `MIXLAB_CUTTER_API_PORT` default to `127.0.0.1:3789`. The server exposes ready-only JSON APIs at `/cutter/source-library`, `/cutter/source-videos/:source_video_id`, and `/cutter/source-search`, plus `/media`, `/cover`, and `/subtitles.srt` endpoints for playback and preview. Source media supports HTTP Range requests for browser video playback. Search reads the immutable SQLite index package pointed to by `.mixlab-library/indexes/source-transcript-index/current.json`, then filters hits through the current ready/artifact visibility guard. If a hand-built fixture has no current index yet, the bridge falls back to the legacy in-memory transcript scan for debugging only. Set `MIXLAB_CUTTER_WORKSPACE_ROOT` to enable the M7 cutter-local workspace: `/cutter/clip-lists` persists cut-list rows, `/cutter/cut-jobs` submits and lists local jobs, `/cutter/cut-jobs/run-next` executes one pending job, and `/cutter/local-clips` lists workspace exports backed by `export-clips/<export_clip_id>/export-clip.json`. In this mode cutter exports write only to the local workspace; the public library remains read-only. Without `MIXLAB_CUTTER_WORKSPACE_ROOT`, the legacy preview local-clip route remains available for older fixtures.

`dev:cutter-web` starts the formal cutter-side browser workspace. It uses fixture data by default so the Apple-HIG workbench can be reviewed without a backend. Set `VITE_MIXLAB_CUTTER_API_BASE_URL=http://127.0.0.1:3789` to bind it to `server:cutter-api`. The M4 surface includes independent pages for the ready-only public source gallery, source detail and complete transcript, grouped search, local cut list, local reusable clip library, cut queue, and settings. `visual:cutter-web` opens the cutter app in local Chrome at 1536x1024 and saves screenshots under `docs/acceptance/artifacts/m4-cutter-workbench/`.

`build:ui-fixtures` builds the M3 formal UI foundation fixture app. `visual:ui-foundation` opens the fixture app in local Chrome at 1536x1024, captures cutter/admin reference screenshots, and saves them under `docs/acceptance/artifacts/m3-ui-foundation/`. These fixtures are design acceptance scaffolding, not the final cutter or admin products.

## Implementation Order

The project follows the delivery specs in:

```text
/Users/allen/Desktop/MixLab_V3_开发交付规格书
```

Implementation starts with:

1. Public protocol core.
2. Ready visibility and release rules.
3. Versioned read-only index packages.
4. Path resolution.
5. Transcript and segment span selection.
6. Admin and cutter apps built on top of the shared protocol.
