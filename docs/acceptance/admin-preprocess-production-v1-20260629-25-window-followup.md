# Admin Preprocess Production v1 - 25 Item Window Follow-up

Generated: 2026-06-29T20:35:00Z

## Scope

This run continued Preprocess Production v1 after the previous 10-item maintenance window. The intent was to validate a 25-item controlled maintenance window without publishing a Cutter index, enabling automatic workers, changing Docker deployment state, or changing the ready Cutter release.

## Selected Window

Selected 25 queued, non-empty source videos from a bounded Admin API list and verified their source files through the mounted NAS library path before execution.

Initial selected IDs:

```text
V005615,V002357,V001843,V005166,V002985,V006161,V005104,V006260,V005167,V006278,V006180,V006276,V006160,V006185,V006277,V006183,V006176,V006158,V006194,V006191,V006178,V002428,V002049,V002054,V002089
```

## Result

The full 25-item window did not pass as a window. The controlled supervisor path successfully processed 3 source videos before the run was stopped by the post-execute SMB file persistence gate:

```text
V005615,V002357,V001843
```

Observed Admin API state after those 3 successful preprocess executions:

```text
ready=10471
queued=881
processing=0
index_required=42
current_index=v010471
```

The Cutter release/index was not published or rebuilt. The processed videos remained `visible_to_cutters=false`.

## Blocker

Each execution completed through the Admin supervisor and API/read-model layer, but the same long-running Mac acceptance process continued to read stale SMB file contents for `source-video.json`, `preprocess-job.json`, and sometimes `library.json`. The stale read presented old `queued` JSON plus trailing NUL padding, causing the `post-smoke-nas-file-persistence` gate to fail.

After the acceptance process exited, a fresh Mac process could read the same files as `index-required` with no NUL padding. This indicates a post-write visibility issue in the Mac SMB verification path, not a confirmed Admin preprocess execution failure.

## Cutter Compatibility

Windows acceptance after the run passed:

```text
windows_acceptance-20260629T203259Z-8475f45c
runner_version=0.1.32
available_video_count=10471
release=v010471
search_backend=searchd
pending=0
running=0
done=49
failed=4
```

## Evidence

- Pre-window readiness: `docs/acceptance/artifacts/admin-preprocess-production-readiness-20260629T200816Z.json`
- 25-item dry run: `docs/acceptance/artifacts/admin-preprocess-maintenance-window-smoke-20260629T200932Z.json`
- First execute attempt: `docs/acceptance/artifacts/admin-preprocess-maintenance-window-smoke-20260629T200955Z.json`
- 24-item dry run after excluding `V005615`: `docs/acceptance/artifacts/admin-preprocess-maintenance-window-smoke-20260629T201418Z.json`
- 24-item execute attempt: `docs/acceptance/artifacts/admin-preprocess-maintenance-window-smoke-20260629T201433Z.json`
- Single-item refresh-command experiment: `docs/acceptance/artifacts/admin-preprocess-maintenance-window-smoke-20260629T202634Z.json`
- Windows acceptance: `docs/acceptance/artifacts/windows_acceptance-20260629T203259Z-8475f45c/report.json`

## Next Required Work

Before running another 25+ item maintenance window, fix the acceptance strategy for post-write NAS evidence. The next gate should separate:

- Admin API/container truth: immediate supervisor/API/read-model success.
- Direct NAS file truth: delayed fresh-process verification after the write window.
- Mac SMB client truth: diagnostic-only evidence when it lags container truth.

Do not continue large-batch preprocessing until this false-negative path is handled, because it makes the current maintenance-window script stop after successful items and hides the real production signal.
