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
npm run smoke:cutter-api-web
npm run smoke:searchd-concurrency
npm run smoke:searchd-nas-rehearsal
npm run smoke:searchd-scale
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

`worker:preprocess-library` is the production-shaped public-library preprocessing worker. It is skipped by default. A real run requires `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=1`, `DASHSCOPE_API_KEY`, and `MIXLAB_PREPROCESS_LIBRARY_ROOT` pointing at a library root containing `source-videos/`. Each run scans for newly added videos, claims up to `MIXLAB_PREPROCESS_WORKER_LIMIT` unprocessed videos, probes media metadata with bundled ffprobe, extracts ASR audio with the selected `MIXLAB_PREPROCESS_AUDIO_MODE`, uploads audio through DashScope temporary storage, writes transcript/SRT artifacts, and moves successful videos to hidden `index-required`. Per-video failures are written as hidden `failed` records and do not stop later videos. `MIXLAB_PREPROCESS_FILE_IDENTITY_MODE=stat` is the default fast identity mode for large libraries; set it to `sha256` only when exact full-file hashing is required. `MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL=25` is the default library-count refresh throttle for large NAS runs: successful items refresh aggregate `library.json` counts every 25 claims and once at the end, while failures still refresh immediately.

`worker:publish-ready` is the production-shaped ready-publication worker. It is skipped by default. A real run requires `MIXLAB_ENABLE_READY_PUBLISH_WORKER=1` and `MIXLAB_PREPROCESS_LIBRARY_ROOT`. It scans `index-required` videos, generates `cover.jpg` with bundled FFmpeg, writes `keyframes.json`, publishes a new immutable SQLite source transcript index package, and only then marks complete videos as cutter-visible `ready`. Incomplete videos remain hidden.

`dev:admin-web` starts the formal management console MVP. It uses fixture data by default and can point to a future backend with `VITE_MIXLAB_ADMIN_API_BASE_URL`. `visual:admin-web` opens the admin app in local Chrome at 1536x1024 and saves dashboard/source/preprocess/Doctor/cutter-user/settings screenshots under `docs/acceptance/artifacts/m5-admin-console/`.

`server:admin-api` and `server:cutter-api` refuse to start when the public library root or cutter workspace is under `/tmp`, `/private/tmp`, `/var/tmp`, or the process temporary directory. Formal runs must use a persistent public-library root such as a mounted drive, NAS, or `~/Library/Application Support/MixLab V3/PublicLibrary`; cutter local exports should stay in a persistent workspace such as `~/Movies/MixLabLocal`. This guard prevents a reboot or system cache cleanup from deleting preprocessed transcripts, covers, indexes, login approvals, or local cut results. Automated tests and throwaway smoke runs are the only place to opt in to temporary paths with `MIXLAB_ALLOW_TEMP_RUNTIME_PATHS=1`.

When packaging MixLab as desktop apps, the first-run setup must not silently create the public library in a temporary folder. The management app should ask the administrator to choose or create the public-library root and persist that selection in the app's user configuration. The cutter app should either receive the approved public-library/API endpoint from the administrator flow or let the cutter choose only a local workspace for exports; it must never own or mutate the public library.

`server:cutter-api` starts the local cutter-side HTTP bridge and loads `.env.local` before resolving runtime paths. Set `MIXLAB_CUTTER_LIBRARY_ROOT` or reuse `MIXLAB_PREPROCESS_LIBRARY_ROOT`; optional `MIXLAB_CUTTER_API_HOST` and `MIXLAB_CUTTER_API_PORT` default to `127.0.0.1:3789`. `MIXLAB_CUTTER_WORKSPACE_ROOT` enables the local cutter workspace; when it is omitted the server now defaults to the current user's `Movies/MixLabLocal` folder so cut jobs and local reusable materials do not silently turn off after a restart. The server exposes ready-only JSON APIs at `/cutter/source-library`, `/cutter/source-videos/:source_video_id`, and `/cutter/source-search`, plus `/media`, `/cover`, and `/subtitles.srt` endpoints for playback and preview. Source media supports HTTP Range requests for browser video playback. Search and full transcript detail can prefer a local `searchd` service when `MIXLAB_SEARCHD_BASE_URL` or `MIXLAB_CUTTER_SEARCHD_BASE_URL` is set; the searchd response keeps the same first-batch/cursor JSON semantics and reports `search_mode: "searchd"`, while detail responses use the current local index transcript and manifest-validated media paths. If searchd is not configured, or a first-page request fails while searchd is restarting, Cutter API falls back to the immutable SQLite index package pointed to by `.mixlab-library/indexes/source-transcript-index/current.json`, then filters hits through the current ready/artifact visibility guard. If a hand-built fixture has no current index yet, the bridge falls back to the legacy in-memory transcript scan for debugging only. In workspace mode `/cutter/clip-lists` persists cut-list rows, `/cutter/cut-jobs` submits and lists local jobs, `/cutter/cut-jobs/run-next` executes one pending job, `/cutter/cut-jobs/:cut_job_id/retry` returns failed jobs to the waiting queue, and `/cutter/local-clips` lists workspace exports backed by `export-clips/<export_clip_id>/export-clip.json`. Cutter exports write only to the local workspace; the public library remains read-only.

`server:searchd` starts the local Rust/Tantivy search service. Run it with `npm run server:searchd -- --library-root /path/to/public-library --cache-root /path/to/local-cache`, then point Cutter API at it with `MIXLAB_SEARCHD_BASE_URL=http://127.0.0.1:3799`. Searchd reads `.mixlab-library/indexes/source-transcript-index/current.json`, loads the current `index.sqlite` package, builds a local Tantivy gram index under the cache root, and exposes `/health`, `/source-search`, and `/source-videos/{source_video_id}/detail`. It preserves the same first-batch/cursor response shape used by Cutter API, returns complete transcript detail from the loaded local index, and reloads when the current index version changes. Without `--cache-root`, searchd keeps the Tantivy index in memory for throwaway debugging.

The Windows cutter desktop package now bundles both local engine processes: `cutter-api-sidecar-x86_64-pc-windows-msvc.exe` and `mixlab-searchd-x86_64-pc-windows-msvc.exe`. On engine startup the Tauri host starts searchd on `127.0.0.1:3799`, stores the derived Tantivy cache under `<local_workspace_root>/.mixlab-searchd`, passes `MIXLAB_SEARCHD_BASE_URL=http://127.0.0.1:3799` into the Cutter API sidecar, and keeps the public library read-only. Packaging must run `build:sidecar`, `build:searchd`, `prepare:cutter-desktop:windows-assets`, and `verify:cutter-desktop:windows-assets` before the NSIS installer build so both processes and FFmpeg assets are present.

`smoke:cutter-api-web` creates a temporary ready public library and cutter workspace, generates a real playable MP4 with bundled FFmpeg, publishes the current SQLite transcript index, starts real searchd, starts Cutter API plus cutter-web in API mode, injects an approved cutter session, and verifies the browser path: search text through searchd, load complete transcript detail from the local index, select transcript, cut with real FFmpeg, refresh local reusable materials, and keep local materials first in search results.

`smoke:searchd-concurrency` creates a temporary indexed public library with 50 source videos, starts real searchd plus Cutter API, and runs 50 concurrent approved-cutter flows through `/cutter/source-search` and `/cutter/source-videos/:source_video_id`. It requires every response to stay on `search_mode: "searchd"` / `transcript.provider: "sqlite-index"`, requires each search response to expose at least 50 public material groups, and reports p50/p95/max latency with a broad p95 guard for obvious regressions. Set `MIXLAB_SEARCHD_CONCURRENCY_REPORT_PATH=./captures/50-editor-report.json` to write a clean ACC-009-shaped JSON report for the NAS evidence collector instead of copying JSON from console output. Set `MIXLAB_SEARCHD_CONCURRENCY_RUN_ROOT=/path/to/acceptance-run-root` to place the generated library, workspace, and searchd cache directories under a target-mounted folder instead of the system temp directory.

`smoke:searchd-nas-rehearsal` is the final-scale ACC-009 wrapper around the same 50-editor closed loop. It defaults to 2,000 indexed source videos and 24 transcript segments per video, rejects lower-scale environment overrides, writes `captures/50-editor-report.json`, and preserves the per-editor search-hit-to-full-transcript-location rows required by `validate:target-evidence`. Set `MIXLAB_SEARCHD_NAS_REHEARSAL_RUN_ROOT=/path/to/acceptance-run-root` or `MIXLAB_SEARCHD_CONCURRENCY_RUN_ROOT=/path/to/acceptance-run-root` to place generated data under a NAS/SMB-mounted acceptance folder.

`smoke:searchd-scale` creates a temporary synthetic transcript index with 2,000 source videos and 48,000 transcript segments by default, starts real searchd plus Cutter API, and verifies high-hit keyword search, unique-keyword video定位, and complete transcript detail through the local index. Tune the default scale with `MIXLAB_SCALE_SMOKE_VIDEOS`, `MIXLAB_SCALE_SMOKE_SEGMENTS_PER_VIDEO`, and `MIXLAB_SCALE_SMOKE_SEARCH_RUNS`.

`dev:cutter-web` starts the formal cutter-side browser workspace. It uses fixture data by default so the Apple-HIG workbench can be reviewed without a backend. Set `VITE_MIXLAB_CUTTER_API_BASE_URL=http://127.0.0.1:3789` to bind it to `server:cutter-api`. In API mode, the source gallery/search/detail read ready public sources, the cut list submits `clip-list.json` rows through `/cutter/clip-lists`, queue submission uses `/cutter/cut-jobs`, the cut-task page can refresh project tasks, and completed exports refresh the local library from `/cutter/local-clips`. The current cutter surface includes startup project home, search-select-cut material locator, cut tasks, local reusable materials, ready-only public source gallery, source detail with complete transcript, and settings. `visual:cutter-web` opens the cutter app in local Chrome at 1536x1024 and saves screenshots under `docs/acceptance/artifacts/m4-cutter-workbench/`.

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
