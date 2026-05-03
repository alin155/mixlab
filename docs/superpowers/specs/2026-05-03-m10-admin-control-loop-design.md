# M10 Admin Control Loop Design

## Goal

M10 turns the management console from a mostly read-only control room into a real local control loop for public-library configuration. The administrator can maintain source folders and runtime policy in the Settings page, persist those choices through Admin API, and use the saved settings to drive scanning and preprocessing decisions.

## Scope

M10 covers the admin side only. Cutter workbench workflows remain unchanged except where user-bound usage data already flows into admin metrics.

Included:

- Settings page edits for library name, source folders, source enablement, and runtime policy.
- Admin API persistence for settings.
- Library-FS mutation helpers for source folders and runtime policy.
- Source-folder path validation before saving and after scanning.
- UI contract updates so controls move from classified placeholders to real actions where the backend exists.
- Focused regression tests, visual refresh, and runtime smoke.

Deferred from M10:

- Long-running preprocessing worker supervision. That is M11.
- Full cutter-side workflow improvements. That is M12.
- Search relevance and synonym improvements. That is M13.
- Native file picker and secret editing. Native shell boundary remains explicit.

## Product Behavior

The Settings page becomes the administrator's configuration surface:

- The "素材来源" section shows editable rows for name, path, and enabled state.
- "新增素材来源" appends a new editable source row.
- "移除" removes non-default source rows.
- The default source can be renamed and disabled, but not removed.
- "保存设置" persists source folders and runtime policy.
- "扫描源视频" scans the enabled source folders from saved settings.
- "测试语音识别配置" remains a backend config check.
- "编辑接口密钥" remains disabled/native-boundary because secrets must not be edited in browser UI.

The administrator must never confuse public source folders with the artifact library:

- Multiple source folders feed original videos into the public library.
- The artifact library remains a single `.mixlab-library` store by default.
- Custom artifact-root migration is not implemented in M10; if the custom mode appears in existing data, it is displayed read-only with migration warning.

## Data Model

M10 keeps the existing `AdminSettings` schema:

- `library_name`
- `source_folders[]`
- `artifact_library`
- `runtime_policy`
- `updated_at`

New Library-FS helpers mutate this schema safely:

- `updateAdminSettings(libraryRoot, patch)`
- `updateAdminSourceFolder(libraryRoot, folderId, patch)`
- `removeAdminSourceFolder(libraryRoot, folderId)`
- `updateAdminRuntimePolicy(libraryRoot, patch)`

The helpers preserve scan stats unless the source path changes. If path changes, `last_scanned_at`, `discovered_video_count`, and `new_unprocessed_count` are cleared because prior stats describe the old path.

## API Design

Add these Admin API routes:

- `PATCH /api/admin/settings/config`
  - Body accepts `library_name`, `source_folders`, and `runtime_policy`.
  - Response returns the saved `AdminSettings`.
  - Validation errors return `400 invalid_request` with Chinese message.

- `POST /api/admin/settings/source-folders`
  - Body accepts `{ name, path, enabled }`.
  - Response returns the saved `AdminSettings`.

- `PATCH /api/admin/settings/source-folders/:sourceFolderId`
  - Body accepts `{ name?, path?, enabled? }`.
  - Response returns the saved `AdminSettings`.

- `DELETE /api/admin/settings/source-folders/:sourceFolderId`
  - Removes a non-default source folder.
  - Response returns the saved `AdminSettings`.

The UI may use the full-config route for "保存设置" and the source-folder routes later for more granular updates. Both exist so tests can verify the domain API independent of React UI.

## UI Design

Settings remains the last admin page and keeps the Apple/HIG-style dense utility layout. It is not a landing page and not a marketing page.

Layout:

- Main column: editable form for source folders, artifact library summary, runtime policy, ASR summary.
- Inspector: path and permission checks, safety note, action stack.

Controls:

- Text inputs for source name and path.
- Checkbox/toggle for enabled.
- Numeric input for concurrency.
- Select for audio mode.
- Checkboxes for auto scan, auto queue, auto publish index.
- Buttons for add/remove/save/scan/test.

All visible labels stay Chinese.

## Error Handling

Settings validation errors are Chinese and actionable:

- Source folder name/path cannot be blank.
- Source folder IDs cannot duplicate.
- Source folder path must be absolute.
- Runtime concurrency must be a positive integer.
- Audio mode must be one of the two production modes.
- Default source cannot be removed.

The frontend shows failed save messages through the existing admin action notice path without exposing raw English protocol errors.

## Testing

M10 follows TDD:

- Library-FS tests first for helper behavior and validation.
- Admin API tests first for settings routes.
- Admin Web API tests for typed client methods.
- Admin render tests for editable controls and Chinese-only UI.
- Runtime smoke after implementation.

Required verification:

- `node --test --import tsx packages/library-fs/src/admin-settings.test.ts packages/admin-api/src/index.test.ts apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts`
- `npm run typecheck`
- `npm test`
- `npm run build:admin-web`
- `npm run visual:admin-web`

## Self-Review

- No settings work writes secrets.
- No cutter UI scope is included.
- The default source remains protected from deletion.
- Multiple source folders remain independent from the single artifact library.
- Every browser-facing label added by M10 is Chinese.
