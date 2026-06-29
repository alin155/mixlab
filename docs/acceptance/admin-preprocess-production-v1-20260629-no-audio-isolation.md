# Admin Preprocess Production v1 - No-Audio Isolation

Generated: 2026-06-29

## Summary

This batch kept the Cutter-visible baseline protected while exposing a real preprocess edge case: very short videos with no audio stream can fail during `text-preprocess` on the currently deployed NAS runtime.

Local code now handles that edge case by writing empty transcript/subtitle artifacts when FFmpeg clearly reports that the source has no audio stream. The fix is verified locally but is not active on the NAS Docker runtime until a new admin runtime image is deployed.

## Live Batch Result

- Dry-run: `docs/acceptance/artifacts/admin-preprocess-maintenance-window-smoke-20260629T210321Z.json`
- Execute: `docs/acceptance/artifacts/admin-preprocess-maintenance-window-smoke-20260629T210333Z.json`
- Requested IDs: `V005167`, `V006278`, `V006180`, `V006276`, `V006160`
- Succeeded: `V005167`, `V006278`
- Failed and isolated: `V006180`
- Not attempted after failure: `V006276`, `V006160`

## Protected Baseline

- Ready count: `10471`
- Current Cutter index: `v010471`
- Processing count: `0`
- After execute: queued `873`, index-required `49`
- Windows Cutter acceptance: `docs/acceptance/artifacts/windows_acceptance-20260629T211810Z-bf821d39/report.json`
- Windows observed: status `passed`, runner `0.1.32`, available videos `10471`, release `v010471`, search index `v010471`

## Failure Cause

`V006180` failed at `text-preprocess` because FFmpeg could not extract audio:

```text
Output file #0 does not contain any stream
```

The source is a very short MP4 with video/timecode data but no usable audio stream. This should not block preprocessing permanently; it should produce empty text artifacts and move to `index-required`.

## Local Fix

- `packages/preprocess-core/src/index.ts`
  - Detects explicit no-audio extraction errors.
  - Removes temporary audio files.
  - Writes empty `transcript.json` and `subtitles.srt`.
  - Returns a successful zero-segment preprocess result.
  - Leaves ordinary FFmpeg failures unchanged.

- `packages/preprocess-core/src/index.test.ts`
  - Covers no-audio fallback.
  - Confirms upload and ASR are skipped.
  - Confirms temporary audio is cleaned.

## Verification

- `node --test --import tsx packages/preprocess-core/src/index.test.ts packages/preprocess-core/src/library-worker.test.ts`
- `node --test --import tsx scripts/acceptance/admin-preprocess-post-batch-proof.test.ts`
- `npm run typecheck`
- Post-batch proof for successful IDs: `docs/acceptance/artifacts/admin-preprocess-post-batch-proof-20260629T211824Z.json`

## Current Gate

Next small batch remains allowed only for controlled 5-item batches. Scale-up is still blocked by Mac SMB direct post-file follow-up, and the no-audio fix must be deployed to NAS Docker before retrying `V006180` or similar failed no-audio videos.
