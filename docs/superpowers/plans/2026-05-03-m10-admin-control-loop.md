# M10 Admin Control Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the management console persist public-library source-folder and runtime-policy settings through real Admin API controls.

**Architecture:** Keep `.mixlab-library/admin-settings.json` as the source of truth for admin configuration. Add small Library-FS mutation helpers, expose them through focused Admin API routes, bind the typed admin web client, then convert Settings page controls from display-only to editable state that saves through the API.

**Tech Stack:** TypeScript, Node HTTP server, React 19, Node test runner, existing `@mixlab/library-fs`, `@mixlab/admin-api`, `@mixlab/admin-web`, and visual screenshot scripts.

---

## Scope Check

This M is admin-control-loop work. It must not redesign the management IA, and it must not start the M11 worker supervisor or M12 cutter workflow. Source folder and runtime-policy persistence are the core deliverable.

## File Structure

### Modified Files

- `/Users/allen/Documents/mixlab/packages/library-fs/src/admin-settings.ts`
  - Add patch/update/remove helpers.
  - Preserve scan stats unless source path changes.
  - Reject non-absolute source paths and removal of `src_default`.

- `/Users/allen/Documents/mixlab/packages/library-fs/src/admin-settings.test.ts`
  - Add failing tests for update, remove, runtime policy, and validation.

- `/Users/allen/Documents/mixlab/packages/admin-api/src/index.ts`
  - Add settings mutation routes.

- `/Users/allen/Documents/mixlab/packages/admin-api/src/index.test.ts`
  - Cover settings mutation routes and Chinese validation errors.

- `/Users/allen/Documents/mixlab/apps/admin-web/src/api.ts`
  - Add typed client methods for saving settings and source folders.
  - Add fixture client methods.

- `/Users/allen/Documents/mixlab/apps/admin-web/src/api.test.ts`
  - Cover client endpoints and fixture transitions.

- `/Users/allen/Documents/mixlab/apps/admin-web/src/app/AdminApp.tsx`
  - Add settings save handler and refresh dashboard data after save.

- `/Users/allen/Documents/mixlab/apps/admin-web/src/features/settings/SettingsPage.tsx`
  - Replace read-only setting rows with editable controls.

- `/Users/allen/Documents/mixlab/apps/admin-web/src/features/admin-ui-contract.ts`
  - Update settings control reasons from M9B placeholder wording to M10 real save behavior.

- `/Users/allen/Documents/mixlab/apps/admin-web/src/admin-app.test.ts`
  - Assert editable settings controls render in Chinese and handlers enable save.

- `/Users/allen/Documents/mixlab/scripts/visual/check-admin-web-screenshots.ts`
  - Update visual assertion for editable settings controls if needed.

## Task 1: Library-FS Settings Mutations

**Files:**
- Modify: `/Users/allen/Documents/mixlab/packages/library-fs/src/admin-settings.ts`
- Modify: `/Users/allen/Documents/mixlab/packages/library-fs/src/admin-settings.test.ts`

- [ ] **Step 1: Write failing helper tests**

Add tests that prove:

- `updateAdminSettings` saves library name, runtime policy, and source folders.
- Changing a source folder path clears its scan stats.
- `removeAdminSourceFolder` rejects `src_default`.
- Source folder paths must be absolute.

- [ ] **Step 2: Run failing helper tests**

Run:

```bash
node --test --import tsx packages/library-fs/src/admin-settings.test.ts
```

Expected: fail because helper functions are not exported.

- [ ] **Step 3: Implement helper functions**

Add exported helpers in `admin-settings.ts`:

- `updateAdminSettings`
- `updateAdminSourceFolder`
- `removeAdminSourceFolder`
- `updateAdminRuntimePolicy`

Use existing `writeAdminSettings` validation and add absolute-path validation before writing.

- [ ] **Step 4: Verify helper tests**

Run:

```bash
node --test --import tsx packages/library-fs/src/admin-settings.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/library-fs/src/admin-settings.ts packages/library-fs/src/admin-settings.test.ts
git commit -m "feat(library-fs): add admin settings mutation helpers"
```

## Task 2: Admin API Settings Mutation Routes

**Files:**
- Modify: `/Users/allen/Documents/mixlab/packages/admin-api/src/index.ts`
- Modify: `/Users/allen/Documents/mixlab/packages/admin-api/src/index.test.ts`

- [ ] **Step 1: Write failing API route tests**

Add tests for:

- `PATCH /api/admin/settings/config`
- `POST /api/admin/settings/source-folders`
- `PATCH /api/admin/settings/source-folders/:id`
- `DELETE /api/admin/settings/source-folders/:id`
- Chinese `400 invalid_request` for blank path and deleting `src_default`.

- [ ] **Step 2: Run failing API tests**

Run:

```bash
node --test --import tsx packages/admin-api/src/index.test.ts
```

Expected: new tests fail with `not_found`.

- [ ] **Step 3: Implement API routes**

Import the new Library-FS helpers. Parse JSON bodies with existing `readRequestJson`, map validation errors to `400 invalid_request`, and return `apiOk(savedSettings)`.

- [ ] **Step 4: Verify API tests**

Run:

```bash
node --test --import tsx packages/admin-api/src/index.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add packages/admin-api/src/index.ts packages/admin-api/src/index.test.ts
git commit -m "feat(admin-api): persist admin settings"
```

## Task 3: Admin Web API Client And Fixture Settings

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/api.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/api.test.ts`

- [ ] **Step 1: Write failing client tests**

Add client tests proving:

- `saveAdminSettings` calls `PATCH /api/admin/settings/config`.
- `addSourceFolder` calls `POST /api/admin/settings/source-folders`.
- `updateSourceFolder` calls `PATCH /api/admin/settings/source-folders/:id`.
- `removeSourceFolder` calls `DELETE /api/admin/settings/source-folders/:id`.
- Fixture client mutates in-memory settings and dashboard data reflects the change.

- [ ] **Step 2: Run failing client tests**

Run:

```bash
node --test --import tsx apps/admin-web/src/api.test.ts
```

Expected: fail because methods do not exist.

- [ ] **Step 3: Implement typed client methods**

Extend `AdminApiClient`, runtime client, and fixture client with the four settings methods. Add a generic `deleteJson` helper for DELETE.

- [ ] **Step 4: Verify client tests**

Run:

```bash
node --test --import tsx apps/admin-web/src/api.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/admin-web/src/api.ts apps/admin-web/src/api.test.ts
git commit -m "feat(admin-web): add settings API client"
```

## Task 4: Editable Settings Page

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/features/settings/SettingsPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/app/AdminApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/features/admin-ui-contract.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/admin-app.test.ts`

- [ ] **Step 1: Write failing render and shell tests**

Add tests that assert the Settings page renders:

- `素材库名称` input.
- `新增素材来源`.
- `保存设置`.
- `移除`.
- `启用素材来源`.
- concurrency numeric input.
- audio mode select.

Add shell test that `AdminApp` passes `onSaveAdminSettings` into `SettingsPage`.

- [ ] **Step 2: Run failing admin web tests**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts
```

Expected: fail because the controls and handler do not exist.

- [ ] **Step 3: Implement editable SettingsPage**

Convert Settings page to local form state initialized from `data.settings`. Add source-folder row editing, add/remove buttons, runtime policy controls, and save button. Keep artifact library and secret editing read-only/native-boundary.

- [ ] **Step 4: Wire AdminApp action**

Add `onSaveAdminSettings` handler that calls `client.saveAdminSettings`, shows a Chinese notice, and refreshes dashboard data.

- [ ] **Step 5: Verify admin web tests**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 4**

```bash
git add apps/admin-web/src/features/settings/SettingsPage.tsx apps/admin-web/src/app/AdminApp.tsx apps/admin-web/src/features/admin-ui-contract.ts apps/admin-web/src/admin-app.test.ts
git commit -m "feat(admin-web): make settings editable"
```

## Task 5: Visual Verification And Runtime Smoke

**Files:**
- Modify: `/Users/allen/Documents/mixlab/scripts/visual/check-admin-web-screenshots.ts`
- Modify screenshots under `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m5-admin-console`

- [ ] **Step 1: Update visual assertions if needed**

Ensure settings screenshot requires `新增素材来源` and `保存设置`.

- [ ] **Step 2: Run focused verification**

Run:

```bash
node --test --import tsx packages/library-fs/src/admin-settings.test.ts packages/admin-api/src/index.test.ts apps/admin-web/src/api.test.ts apps/admin-web/src/admin-app.test.ts apps/admin-web/src/features/admin-ui-contract.test.ts
npm run typecheck
npm run build:admin-web
npm run visual:admin-web
```

Expected: all pass and settings screenshot refreshes.

- [ ] **Step 3: Runtime smoke**

Start or reuse local servers and verify:

```bash
curl -sS http://127.0.0.1:3889/api/admin/settings/config
curl -sS -X PATCH http://127.0.0.1:3889/api/admin/settings/config \
  -H 'Content-Type: application/json' \
  -d '{"library_name":"主素材库","runtime_policy":{"audio_mode":"mp3_16k_mono_64k","concurrent_jobs":1,"auto_scan_enabled":false,"auto_queue_enabled":false,"auto_publish_index_enabled":true}}'
curl -I http://127.0.0.1:5174/
```

Expected: Admin API returns `ok: true`; Web returns HTTP 200.

- [ ] **Step 4: Commit verification**

```bash
git add scripts/visual/check-admin-web-screenshots.ts docs/acceptance/artifacts/m5-admin-console
git commit -m "test: verify M10 admin settings loop"
```

## Final Acceptance

1. Open `http://127.0.0.1:5174/#/settings`.
2. Confirm Settings is still the last page in admin navigation.
3. Confirm page has editable source folder name/path/enabled state.
4. Add a new source folder row.
5. Save settings.
6. Refresh the browser and confirm the saved row remains.
7. Disable a source folder, save, scan source videos, and confirm only enabled folders are scanned.
8. Change audio mode and concurrency, save, refresh, and confirm values persist.
9. Confirm no secret value is visible.
10. Confirm all visible labels are Chinese.

## Self-Review

- Spec coverage: source-folder configuration, runtime policy save, path validation, and scan linkage are covered.
- Placeholder scan: no TBD/TODO placeholders are used.
- Type consistency: `AdminSettingsConfig`, `AdminSourceFolder`, and `runtime_policy` names match existing admin-web API types.
