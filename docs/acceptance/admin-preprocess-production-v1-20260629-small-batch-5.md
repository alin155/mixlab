# Admin Preprocess Production v1 - 5 Item Small Batch Follow-Up

Generated: 2026-06-29T20:55:00Z

## Scope

This follow-up validates the next controlled production preprocessing step after the SMB post-file visibility issue was separated from Admin API truth.

The run intentionally did not publish a Cutter index, did not modify ready assets, did not change Docker deployment state, and did not enable automatic long-running workers.

## Code Change

- Added an explicit SMB-stale post-file policy to the single-video smoke.
- The default remains strict.
- When `ALLOW_SMB_STALE_POST_FILE_VIEW` is explicitly enabled, a post-file mismatch can become `needs-follow-up` only after supervisor execution, API postcheck, ready count, processing count, target visibility, and Cutter index baseline are already proven safe.
- The same policy is now passed through small-batch and maintenance-window smoke scripts.

## Live Execution

Input candidates:

- `V005166`
- `V002985`
- `V006161`
- `V005104`
- `V006260`

Before execution:

- `ready_video_count=10471`
- `queued_video_count=881`
- `processing_video_count=0`
- `index_required_video_count=42`
- `current_index_version=v010471`

After execution:

- `ready_video_count=10471`
- `queued_video_count=876`
- `processing_video_count=0`
- `index_required_video_count=47`
- `current_index_version=v010471`

Result:

- Maintenance window status: `passed`
- Requested count: `5`
- Passed batches: `1`
- Blockers: none
- NAS files mutated: yes, limited to the selected preprocessing records and library status
- Cutter release/index publish: not run

## Evidence

- Dry-run window: `docs/acceptance/artifacts/admin-preprocess-maintenance-window-smoke-20260629T204357Z.json`
- Execute window: `docs/acceptance/artifacts/admin-preprocess-maintenance-window-smoke-20260629T204609Z.json`
- Execute batch: `docs/acceptance/artifacts/admin-preprocess-small-batch-smoke-20260629T204709Z.json`
- Windows acceptance: `docs/acceptance/artifacts/windows_acceptance-20260629T205152Z-e24dbadd/report.json`

## Direct File Visibility

Admin API proved all 5 selected videos reached `index-required` and remained hidden from Cutter.

Fresh Mac SMB direct reads immediately after the run showed:

- `V005166`, `V002985`, `V006161`, and `V005104`: direct source/job files were `index-required` and contained no NUL padding.
- `V006260` and `.mixlab-library/library.json`: Mac SMB still showed an older view with queued counts and NUL padding on the selected source/job files.

This confirms the earlier diagnosis: Mac SMB direct reads can lag behind Admin API/container state and can still show stale padded JSON after successful Docker-side writes. This is not acceptable as the only production truth source for large-run approval.

## Cutter Compatibility

Windows Runner `windows_acceptance-20260629T205152Z-e24dbadd` passed.

Observed:

- `runner_version=0.1.32`
- `available_video_count=10471`
- `source_library_count=10471`

The small preprocessing batch did not change the Cutter-visible ready release.

## Next Gate

The next production step can be another controlled 5 to 10 item batch only if:

- Admin API baseline remains `ready=10471`, `processing=0`, `index=v010471`.
- Selected candidates are still queued and hidden before execution.
- Windows Cutter acceptance remains green after execution.
- SMB-stale post-file cases are tracked as follow-up evidence, not ignored.

Do not start unattended long-running preprocessing until there is a stronger container-side or NAS-side file verification path for post-write file truth.
