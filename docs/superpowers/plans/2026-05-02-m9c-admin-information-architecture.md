# M9C Admin Information Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the management console around the approved Chinese-first information architecture, add cutter-user approval login, add user-bound usage statistics, and expose source-video preprocessing detail pages.

**Architecture:** Keep public library protocol files as the source of truth, and add small focused filesystem modules for management settings, cutter users, and usage events under `.mixlab-library`. Admin API owns management, diagnostics, user approval, metrics, and source-video detail endpoints; Cutter API owns login application/status and records authenticated usage events. Admin Web and Cutter Web stay React/Vite apps with typed clients and fixture clients.

**Tech Stack:** TypeScript, React 19, Node HTTP servers, Node test runner, Vite, Playwright visual checks, existing `@mixlab/library-fs`, `@mixlab/protocol`, `@mixlab/admin-api`, and `@mixlab/cutter-api`.

---

## Scope Check

The approved M9C spec spans three related subsystems:

- Admin IA and Chinese UI.
- Cutter login approval.
- User-bound usage statistics.

They are related enough to implement as one milestone because the dashboard statistics depend on user-bound events and the new "剪辑师用户" page depends on login approval. The tasks are still split into independently testable commits so regressions are contained.

## File Structure

### New Files

- `/Users/allen/Documents/mixlab/packages/library-fs/src/admin-settings.ts`
  - Reads/writes `.mixlab-library/admin-settings.json`.
  - Stores logical library display name, source folders, artifact root mode, runtime policy, and path-check projections.
- `/Users/allen/Documents/mixlab/packages/library-fs/src/cutter-users.ts`
  - Reads/writes `.mixlab-library/cutter-users/users.json`.
  - Creates login applications, approves/rejects/disables/restores users, creates sessions, validates sessions.
- `/Users/allen/Documents/mixlab/packages/library-fs/src/usage-events.ts`
  - Appends usage events to `.mixlab-library/usage-events/events.ndjson`.
  - Aggregates global and per-user usage statistics.
- `/Users/allen/Documents/mixlab/apps/admin-web/src/app/chinese.ts`
  - Central Chinese label mapping for statuses, stages, runtime sources, diagnosis labels, and validation values.
- `/Users/allen/Documents/mixlab/apps/admin-web/src/features/cutter-users/CutterUsersPage.tsx`
  - Admin user approval, status management, and user usage summary.
- `/Users/allen/Documents/mixlab/apps/admin-web/src/features/source-detail/AdminSourceDetailPage.tsx`
  - Admin-only source-video detail page with preprocessing artifacts and transcript statistics.
- `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/login/CutterLoginGate.tsx`
  - Login application, pending state, rejected state, disabled state, and auto-login gate.
- `/Users/allen/Documents/mixlab/apps/cutter-web/src/auth.ts`
  - Local storage wrapper for user id, device id, session token, and display name.

### Modified Files

- `/Users/allen/Documents/mixlab/packages/library-fs/src/index.ts`
  - Export new settings/user/event modules.
- `/Users/allen/Documents/mixlab/packages/library-fs/src/scanner.ts`
  - Scan every enabled admin source folder instead of only the fixed `source-videos` directory.
  - Preserve the single `.mixlab-library` artifact store.
- `/Users/allen/Documents/mixlab/packages/library-fs/src/scanner.test.ts`
  - Cover multiple source folders, disabled folders, stable ids, and source-folder scan statistics.
- `/Users/allen/Documents/mixlab/packages/admin-api/src/index.ts`
  - Add settings, metrics, source detail, user approval, user stats, and Chinese diagnosis response endpoints.
  - Fix admin cover serving path resolution.
- `/Users/allen/Documents/mixlab/packages/admin-api/src/index.test.ts`
  - Cover new endpoints and cover image behavior.
- `/Users/allen/Documents/mixlab/packages/cutter-api/src/index.ts`
  - Add cutter auth endpoints, session enforcement, and usage-event recording.
- `/Users/allen/Documents/mixlab/packages/cutter-api/src/index.test.ts`
  - Cover login application/status, approved session access, disabled user lockout, and event recording.
- `/Users/allen/Documents/mixlab/apps/admin-web/src/api.ts`
  - Add typed admin settings, metrics, source detail, cutter users, and usage stats.
  - Resolve relative media URLs against Admin API base URL.
- `/Users/allen/Documents/mixlab/apps/admin-web/src/api.test.ts`
  - Cover new client paths, media URL resolution, and fixture transitions.
- `/Users/allen/Documents/mixlab/apps/admin-web/src/app/navigation.ts`
  - Navigation becomes: 仪表盘, 原视频管理, 预处理队列, 索引与发布, 健康诊断, 剪辑师用户, 设置.
  - Keep legacy hash redirects for `library-settings` and `index-publish`.
- `/Users/allen/Documents/mixlab/apps/admin-web/src/app/AdminApp.tsx`
  - Route new pages and remove path from toolbar.
- `/Users/allen/Documents/mixlab/apps/admin-web/src/features/dashboard/DashboardPage.tsx`
  - Add material scale, transcript/index, production capacity, user usage, and risk summary.
- `/Users/allen/Documents/mixlab/apps/admin-web/src/features/settings/SettingsPage.tsx`
  - Merge former public-library settings into final Settings page.
- `/Users/allen/Documents/mixlab/apps/admin-web/src/features/source-videos/SourceVideosPage.tsx`
  - Chinese status labels, clickable rows, cover fallback.
- `/Users/allen/Documents/mixlab/apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx`
  - Add unprocessed queue context and affected range near queue buttons.
- `/Users/allen/Documents/mixlab/apps/admin-web/src/features/doctor/DoctorPage.tsx`
  - Chinese diagnosis explanation layer.
- `/Users/allen/Documents/mixlab/apps/admin-web/src/features/index-publish/IndexPublishPage.tsx`
  - Rename visible text to 索引与发布 and Chineseize fields.
- `/Users/allen/Documents/mixlab/apps/admin-web/src/features/shared.tsx`
  - Add reusable Chinese cover fallback, detail panels, section rows, and metric cards if needed.
- `/Users/allen/Documents/mixlab/apps/admin-web/src/admin-app.test.ts`
  - Update all render tests to reject English UI strings and cover new pages.
- `/Users/allen/Documents/mixlab/apps/cutter-web/src/api.ts`
  - Add auth methods and authenticated headers for protected cutter requests.
- `/Users/allen/Documents/mixlab/apps/cutter-web/src/api.test.ts`
  - Cover auth request/status and auth headers.
- `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
  - Wrap workbench in `CutterLoginGate`, emit front-end usage events for selection actions.
- `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`
  - Cover login gate and authenticated user display.
- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m5-admin-console/*.png`
  - Refresh admin visual artifacts.
- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m6-cutter-workbench/*.png`
  - Refresh cutter visual artifacts if login gate changes initial screen.

## Task 1: Library-FS Admin Settings

**Files:**
- Create: `/Users/allen/Documents/mixlab/packages/library-fs/src/admin-settings.ts`
- Modify: `/Users/allen/Documents/mixlab/packages/library-fs/src/index.ts`
- Test: `/Users/allen/Documents/mixlab/packages/library-fs/src/admin-settings.test.ts`

- [ ] **Step 1: Write failing settings tests**

Create `/Users/allen/Documents/mixlab/packages/library-fs/src/admin-settings.test.ts`:

```ts
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addAdminSourceFolder,
  readAdminSettings,
  writeAdminSettings
} from "./admin-settings.ts";

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "mixlab-admin-settings-"));
  await mkdir(path.join(root, "source-videos"), { recursive: true });
  return root;
}

test("creates default admin settings with one default source folder", async () => {
  const root = await makeRoot();
  const settings = await readAdminSettings(root);

  assert.equal(settings.library_name, "主素材库");
  assert.equal(settings.artifact_library.mode, "default");
  assert.equal(settings.source_folders.length, 1);
  assert.equal(settings.source_folders[0]?.name, "默认素材来源");
  assert.equal(settings.source_folders[0]?.path, path.join(root, "source-videos"));
  assert.equal(settings.source_folders[0]?.enabled, true);
});

test("persists multiple source folders without changing the single artifact library", async () => {
  const root = await makeRoot();
  const next = await addAdminSourceFolder(root, {
    name: "课程素材",
    path: "/Volumes/CourseVideos",
    enabled: true,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  });

  assert.equal(next.source_folders.length, 2);
  assert.equal(next.artifact_library.path, path.join(root, ".mixlab-library"));

  const raw = await readFile(path.join(root, ".mixlab-library", "admin-settings.json"), "utf8");
  assert.match(raw, /课程素材/);
});

test("rejects empty source folder names and paths", async () => {
  const root = await makeRoot();
  const current = await readAdminSettings(root);

  await assert.rejects(
    () => writeAdminSettings(root, {
      ...current,
      source_folders: [{ id: "src_bad", name: "", path: "", enabled: true }]
    }),
    /素材来源名称和路径不能为空/
  );
});
```

- [ ] **Step 2: Run failing settings tests**

Run:

```bash
node --test --import tsx packages/library-fs/src/admin-settings.test.ts
```

Expected: fail because `admin-settings.ts` does not exist.

- [ ] **Step 3: Implement settings module**

Create `/Users/allen/Documents/mixlab/packages/library-fs/src/admin-settings.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface AdminSourceFolder {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  last_scanned_at?: string;
  discovered_video_count?: number;
  new_unprocessed_count?: number;
}

export interface AdminArtifactLibrarySettings {
  mode: "default" | "custom";
  path: string;
  migration_required: boolean;
}

export interface AdminRuntimePolicy {
  audio_mode: "mp3_16k_mono_64k" | "wav_16k_mono_pcm_s16le";
  concurrent_jobs: number;
  auto_scan_enabled: boolean;
  auto_queue_enabled: boolean;
  auto_publish_index_enabled: boolean;
}

export interface AdminSettings {
  schema_version: "1.0";
  library_name: string;
  source_folders: AdminSourceFolder[];
  artifact_library: AdminArtifactLibrarySettings;
  runtime_policy: AdminRuntimePolicy;
  updated_at: string;
}

function mixlabRoot(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library");
}

function settingsPath(libraryRoot: string): string {
  return path.join(mixlabRoot(libraryRoot), "admin-settings.json");
}

function defaultSettings(libraryRoot: string): AdminSettings {
  return {
    schema_version: "1.0",
    library_name: "主素材库",
    source_folders: [
      {
        id: "src_default",
        name: "默认素材来源",
        path: path.join(libraryRoot, "source-videos"),
        enabled: true,
        last_scanned_at: "",
        discovered_video_count: 0,
        new_unprocessed_count: 0
      }
    ],
    artifact_library: {
      mode: "default",
      path: mixlabRoot(libraryRoot),
      migration_required: false
    },
    runtime_policy: {
      audio_mode: "mp3_16k_mono_64k",
      concurrent_jobs: 1,
      auto_scan_enabled: false,
      auto_queue_enabled: false,
      auto_publish_index_enabled: true
    },
    updated_at: ""
  };
}

function validate(settings: AdminSettings): void {
  for (const folder of settings.source_folders) {
    if (!folder.name.trim() || !folder.path.trim()) {
      throw new Error("素材来源名称和路径不能为空");
    }
  }

  if (!settings.artifact_library.path.trim()) {
    throw new Error("预处理产物库路径不能为空");
  }
}

export async function readAdminSettings(libraryRoot: string): Promise<AdminSettings> {
  try {
    return JSON.parse(await readFile(settingsPath(libraryRoot), "utf8")) as AdminSettings;
  } catch {
    return defaultSettings(libraryRoot);
  }
}

export async function writeAdminSettings(
  libraryRoot: string,
  settings: AdminSettings
): Promise<AdminSettings> {
  validate(settings);
  const next = { ...settings, updated_at: new Date().toISOString() };
  await mkdir(mixlabRoot(libraryRoot), { recursive: true });
  await writeFile(settingsPath(libraryRoot), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function addAdminSourceFolder(
  libraryRoot: string,
  folder: Omit<AdminSourceFolder, "id">
): Promise<AdminSettings> {
  const current = await readAdminSettings(libraryRoot);
  const nextId = `src_${String(current.source_folders.length + 1).padStart(3, "0")}`;
  return writeAdminSettings(libraryRoot, {
    ...current,
    source_folders: [...current.source_folders, { ...folder, id: nextId }]
  });
}
```

- [ ] **Step 4: Export settings module**

Modify `/Users/allen/Documents/mixlab/packages/library-fs/src/index.ts`:

```ts
export * from "./admin-settings.ts";
```

- [ ] **Step 5: Verify settings tests**

Run:

```bash
node --test --import tsx packages/library-fs/src/admin-settings.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit settings module**

Run:

```bash
git add packages/library-fs/src/admin-settings.ts packages/library-fs/src/admin-settings.test.ts packages/library-fs/src/index.ts
git commit -m "feat(library): add admin settings model"
```

## Task 2: Library Scanner Uses Configured Source Folders

**Files:**
- Modify: `/Users/allen/Documents/mixlab/packages/library-fs/src/scanner.ts`
- Modify: `/Users/allen/Documents/mixlab/packages/library-fs/src/scanner.test.ts`

- [ ] **Step 1: Add failing multi-source scanner tests**

Add to the top-level imports in `/Users/allen/Documents/mixlab/packages/library-fs/src/scanner.test.ts`:

```ts
import {
  addAdminSourceFolder,
  readAdminSettings
} from "./admin-settings.ts";
```

Append this test to `/Users/allen/Documents/mixlab/packages/library-fs/src/scanner.test.ts`:

```ts
test("scans every enabled admin source folder into one artifact library", async () => {
  const libraryRoot = await makeLibraryRoot();
  const courseSource = path.join(libraryRoot, "course-source");
  const disabledSource = path.join(libraryRoot, "disabled-source");

  await writeDummyFile(path.join(libraryRoot, "source-videos", "默认素材.mp4"));
  await writeDummyFile(path.join(courseSource, "课程", "现金流.mp4"));
  await writeDummyFile(path.join(disabledSource, "隐藏素材.mp4"));

  await addAdminSourceFolder(libraryRoot, {
    name: "课程素材",
    path: courseSource,
    enabled: true,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  });
  const withDisabled = await addAdminSourceFolder(libraryRoot, {
    name: "停用来源",
    path: disabledSource,
    enabled: false,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  });

  assert.equal(withDisabled.source_folders.length, 3);

  const result = await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  assert.deepEqual(result, {
    total_video_count: 2,
    new_video_count: 2,
    existing_video_count: 0,
    source_video_ids: ["V000001", "V000002"]
  });

  const first = await readJson<{ relative_path: string }>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );
  const second = await readJson<{ relative_path: string }>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "source-video.json")
  );
  const settings = await readAdminSettings(libraryRoot);

  assert.equal(first.relative_path, "默认素材.mp4");
  assert.equal(second.relative_path, "src_002/课程/现金流.mp4");
  assert.equal(settings.artifact_library.path, path.join(libraryRoot, ".mixlab-library"));
  assert.equal(settings.source_folders[0]?.discovered_video_count, 1);
  assert.equal(settings.source_folders[1]?.discovered_video_count, 1);
  assert.equal(settings.source_folders[1]?.new_unprocessed_count, 1);
  assert.equal(settings.source_folders[2]?.discovered_video_count, 0);
});
```

- [ ] **Step 2: Run failing scanner tests**

Run:

```bash
node --test --import tsx packages/library-fs/src/scanner.test.ts
```

Expected: fail because scanner still reads only the fixed `source-videos` directory.

- [ ] **Step 3: Import admin settings into scanner**

In `/Users/allen/Documents/mixlab/packages/library-fs/src/scanner.ts`, add:

```ts
import {
  readAdminSettings,
  writeAdminSettings,
  type AdminSourceFolder
} from "./admin-settings.ts";
```

Then add helper types and functions:

```ts
interface ScanFolderRuntime {
  folder: AdminSourceFolder;
  is_default_source: boolean;
}

interface SourceFileRow {
  folder: ScanFolderRuntime;
  file_path: string;
}

interface SourceFolderScanStats {
  discovered_video_count: number;
  new_unprocessed_count: number;
}

async function readEnabledScanFolders(libraryRoot: string): Promise<ScanFolderRuntime[]> {
  const settings = await readAdminSettings(libraryRoot);
  return settings.source_folders
    .filter((folder) => folder.enabled)
    .map((folder) => ({
      folder,
      is_default_source: folder.id === "src_default" && folder.path === sourceVideosRoot(libraryRoot)
    }));
}

function toSourceFolderRelativePath(row: SourceFileRow): string {
  const relativePath = toLibraryRelativePath(row.folder.folder.path, row.file_path);
  return row.folder.is_default_source
    ? relativePath
    : `${row.folder.folder.id}/${relativePath}`;
}

async function writeSourceFolderScanStats(input: {
  library_root: string;
  now: string;
  stats: Map<string, SourceFolderScanStats>;
}): Promise<void> {
  const settings = await readAdminSettings(input.library_root);
  await writeAdminSettings(input.library_root, {
    ...settings,
    source_folders: settings.source_folders.map((folder) => {
      const stats = input.stats.get(folder.id);
      return stats
        ? {
            ...folder,
            last_scanned_at: input.now,
            discovered_video_count: stats.discovered_video_count,
            new_unprocessed_count: stats.new_unprocessed_count
          }
        : folder;
    })
  });
}
```

- [ ] **Step 4: Scan enabled folders and keep one artifact store**

Replace the first scan block in `scanSourceVideos`:

```ts
const sourceRoot = sourceVideosRoot(input.library_root);
const files = await listVideoFiles(sourceRoot);
```

with:

```ts
const scanFolders = await readEnabledScanFolders(input.library_root);
const files: SourceFileRow[] = [];
const folderStats = new Map<string, SourceFolderScanStats>();

for (const folder of scanFolders) {
  let folderFiles: string[] = [];
  try {
    folderFiles = await listVideoFiles(folder.folder.path);
  } catch {
    folderFiles = [];
  }
  folderStats.set(folder.folder.id, {
    discovered_video_count: folderFiles.length,
    new_unprocessed_count: 0
  });
  files.push(...folderFiles.map((file_path) => ({ folder, file_path })));
}
```

Then update the loop:

```ts
for (const row of files) {
  const relativePath = toSourceFolderRelativePath(row);
  const existingManifest = existing.byRelativePath.get(relativePath);

  if (existingManifest) {
    manifests.push(existingManifest);
    existingVideoCount += 1;
    continue;
  }

  const manifest = await createUnprocessedManifest({
    source_video_id: formatSourceVideoId(nextNumericId),
    relative_path: relativePath,
    file_path: row.file_path
  });

  const stats = folderStats.get(row.folder.folder.id);
  if (stats) {
    stats.new_unprocessed_count += 1;
  }

  nextNumericId += 1;
  newVideoCount += 1;
  manifests.push(manifest);
}
```

After `writeLibraryManifest(...)`, add:

```ts
await writeSourceFolderScanStats({
  library_root: input.library_root,
  now: input.now,
  stats: folderStats
});
```

- [ ] **Step 5: Verify scanner tests**

Run:

```bash
node --test --import tsx packages/library-fs/src/scanner.test.ts packages/library-fs/src/admin-settings.test.ts
```

Expected: scanner and settings tests pass.

- [ ] **Step 6: Commit scanner source-folder behavior**

Run:

```bash
git add packages/library-fs/src/scanner.ts packages/library-fs/src/scanner.test.ts packages/library-fs/src/admin-settings.ts
git commit -m "feat(library): scan configured source folders"
```

## Task 3: Cutter Users Model

**Files:**
- Create: `/Users/allen/Documents/mixlab/packages/library-fs/src/cutter-users.ts`
- Create: `/Users/allen/Documents/mixlab/packages/library-fs/src/cutter-users.test.ts`
- Modify: `/Users/allen/Documents/mixlab/packages/library-fs/src/index.ts`

- [ ] **Step 1: Write failing cutter-user tests**

Create `/Users/allen/Documents/mixlab/packages/library-fs/src/cutter-users.test.ts`:

```ts
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  approveCutterUser,
  createCutterLoginApplication,
  disableCutterUser,
  listCutterUsers,
  validateCutterSession
} from "./cutter-users.ts";

async function makeRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-cutter-users-"));
}

test("creates pending login application and approves it into a reusable session", async () => {
  const root = await makeRoot();
  const application = await createCutterLoginApplication(root, {
    username: "小王",
    device_id: "device-1",
    device_name: "Allen Mac",
    now: "2026-05-02T10:00:00.000Z"
  });

  assert.equal(application.status, "pending");
  assert.equal((await listCutterUsers(root)).users.length, 1);

  const approved = await approveCutterUser(root, {
    user_id: application.user_id,
    now: "2026-05-02T10:01:00.000Z"
  });

  assert.equal(approved.status, "approved");
  assert.equal(approved.session.user_id, application.user_id);

  const session = await validateCutterSession(root, {
    device_id: "device-1",
    session_token: approved.session.session_token,
    now: "2026-05-02T10:02:00.000Z"
  });

  assert.equal(session.ok, true);
  assert.equal(session.user?.username, "小王");
});

test("disabled users cannot keep using existing sessions", async () => {
  const root = await makeRoot();
  const application = await createCutterLoginApplication(root, {
    username: "小李",
    device_id: "device-2",
    device_name: "Windows Workstation",
    now: "2026-05-02T10:00:00.000Z"
  });
  const approved = await approveCutterUser(root, {
    user_id: application.user_id,
    now: "2026-05-02T10:01:00.000Z"
  });

  await disableCutterUser(root, {
    user_id: application.user_id,
    now: "2026-05-02T10:03:00.000Z"
  });

  const session = await validateCutterSession(root, {
    device_id: "device-2",
    session_token: approved.session.session_token,
    now: "2026-05-02T10:04:00.000Z"
  });

  assert.equal(session.ok, false);
  assert.equal(session.reason, "用户已停用");
});
```

- [ ] **Step 2: Run failing cutter-user tests**

Run:

```bash
node --test --import tsx packages/library-fs/src/cutter-users.test.ts
```

Expected: fail because `cutter-users.ts` does not exist.

- [ ] **Step 3: Implement cutter-user model**

Create `/Users/allen/Documents/mixlab/packages/library-fs/src/cutter-users.ts` with these exported types and functions:

```ts
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type CutterUserStatus = "pending" | "approved" | "rejected" | "disabled";

export interface CutterDeviceRecord {
  device_id: string;
  device_name: string;
  status: "active" | "disabled";
  first_seen_at: string;
  last_login_at: string;
}

export interface CutterUserRecord {
  user_id: string;
  username: string;
  display_name: string;
  status: CutterUserStatus;
  applied_at: string;
  approved_at: string;
  rejected_at: string;
  disabled_at: string;
  last_login_at: string;
  last_used_at: string;
  note: string;
  devices: CutterDeviceRecord[];
}

export interface CutterSessionRecord {
  user_id: string;
  device_id: string;
  session_token: string;
  created_at: string;
  last_seen_at: string;
}

interface CutterUserStore {
  schema_version: "1.0";
  users: CutterUserRecord[];
  sessions: CutterSessionRecord[];
}

function usersPath(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "cutter-users", "users.json");
}

async function readStore(libraryRoot: string): Promise<CutterUserStore> {
  try {
    return JSON.parse(await readFile(usersPath(libraryRoot), "utf8")) as CutterUserStore;
  } catch {
    return { schema_version: "1.0", users: [], sessions: [] };
  }
}

async function writeStore(libraryRoot: string, store: CutterUserStore): Promise<void> {
  await mkdir(path.dirname(usersPath(libraryRoot)), { recursive: true });
  await writeFile(usersPath(libraryRoot), `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function createUserId(sequence: number): string {
  return `CU${String(sequence).padStart(6, "0")}`;
}

export async function createCutterLoginApplication(
  libraryRoot: string,
  input: { username: string; device_id: string; device_name: string; now: string }
): Promise<CutterUserRecord> {
  const username = input.username.trim();
  if (!username) {
    throw new Error("用户名不能为空");
  }

  const store = await readStore(libraryRoot);
  const existing = store.users.find((user) => user.username === username);

  if (existing) {
    if (!existing.devices.some((device) => device.device_id === input.device_id)) {
      existing.devices.push({
        device_id: input.device_id,
        device_name: input.device_name,
        status: "active",
        first_seen_at: input.now,
        last_login_at: ""
      });
    }
    await writeStore(libraryRoot, store);
    return existing;
  }

  const user: CutterUserRecord = {
    user_id: createUserId(store.users.length + 1),
    username,
    display_name: username,
    status: "pending",
    applied_at: input.now,
    approved_at: "",
    rejected_at: "",
    disabled_at: "",
    last_login_at: "",
    last_used_at: "",
    note: "",
    devices: [{
      device_id: input.device_id,
      device_name: input.device_name,
      status: "active",
      first_seen_at: input.now,
      last_login_at: ""
    }]
  };
  store.users.push(user);
  await writeStore(libraryRoot, store);
  return user;
}

export async function approveCutterUser(
  libraryRoot: string,
  input: { user_id: string; now: string }
): Promise<{ status: "approved"; user: CutterUserRecord; session: CutterSessionRecord }> {
  const store = await readStore(libraryRoot);
  const user = store.users.find((candidate) => candidate.user_id === input.user_id);
  if (!user) {
    throw new Error("剪辑师用户不存在");
  }

  user.status = "approved";
  user.approved_at = input.now;
  user.last_login_at = input.now;
  const firstDevice = user.devices[0];
  if (!firstDevice) {
    throw new Error("剪辑师设备不存在");
  }
  firstDevice.last_login_at = input.now;

  const session: CutterSessionRecord = {
    user_id: user.user_id,
    device_id: firstDevice.device_id,
    session_token: randomUUID(),
    created_at: input.now,
    last_seen_at: input.now
  };
  store.sessions.push(session);
  await writeStore(libraryRoot, store);
  return { status: "approved", user, session };
}

export async function disableCutterUser(
  libraryRoot: string,
  input: { user_id: string; now: string }
): Promise<CutterUserRecord> {
  const store = await readStore(libraryRoot);
  const user = store.users.find((candidate) => candidate.user_id === input.user_id);
  if (!user) {
    throw new Error("剪辑师用户不存在");
  }
  user.status = "disabled";
  user.disabled_at = input.now;
  await writeStore(libraryRoot, store);
  return user;
}

export async function listCutterUsers(libraryRoot: string): Promise<{ users: CutterUserRecord[] }> {
  const store = await readStore(libraryRoot);
  return { users: store.users };
}

export async function validateCutterSession(
  libraryRoot: string,
  input: { device_id: string; session_token: string; now: string }
): Promise<{ ok: true; user: CutterUserRecord } | { ok: false; reason: string }> {
  const store = await readStore(libraryRoot);
  const session = store.sessions.find(
    (candidate) =>
      candidate.device_id === input.device_id &&
      candidate.session_token === input.session_token
  );
  if (!session) {
    return { ok: false, reason: "登录凭证无效" };
  }

  const user = store.users.find((candidate) => candidate.user_id === session.user_id);
  if (!user) {
    return { ok: false, reason: "用户不存在" };
  }
  if (user.status === "disabled") {
    return { ok: false, reason: "用户已停用" };
  }
  if (user.status !== "approved") {
    return { ok: false, reason: "用户尚未通过审核" };
  }

  session.last_seen_at = input.now;
  user.last_login_at = input.now;
  const device = user.devices.find((candidate) => candidate.device_id === input.device_id);
  if (device) {
    device.last_login_at = input.now;
  }
  await writeStore(libraryRoot, store);
  return { ok: true, user };
}
```

- [ ] **Step 4: Export cutter-user model**

Modify `/Users/allen/Documents/mixlab/packages/library-fs/src/index.ts`:

```ts
export * from "./cutter-users.ts";
```

- [ ] **Step 5: Verify cutter-user tests**

Run:

```bash
node --test --import tsx packages/library-fs/src/cutter-users.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit cutter-user model**

Run:

```bash
git add packages/library-fs/src/cutter-users.ts packages/library-fs/src/cutter-users.test.ts packages/library-fs/src/index.ts
git commit -m "feat(library): add cutter user approvals"
```

## Task 4: Usage Event Store

**Files:**
- Create: `/Users/allen/Documents/mixlab/packages/library-fs/src/usage-events.ts`
- Create: `/Users/allen/Documents/mixlab/packages/library-fs/src/usage-events.test.ts`
- Modify: `/Users/allen/Documents/mixlab/packages/library-fs/src/index.ts`

- [ ] **Step 1: Write failing usage-event tests**

Create `/Users/allen/Documents/mixlab/packages/library-fs/src/usage-events.test.ts`:

```ts
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendUsageEvent,
  readUsageMetrics,
  type MixlabUsageEvent
} from "./usage-events.ts";

async function makeRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-usage-events-"));
}

test("aggregates global and per-user cutter usage events", async () => {
  const root = await makeRoot();
  const base: Omit<MixlabUsageEvent, "event_id" | "event_type" | "occurred_at"> = {
    user_id: "CU000001",
    username: "小王",
    device_id: "device-1",
    source_video_id: "V000001",
    cut_job_id: "",
    query: "",
    selected_duration_ms: 0,
    result_status: "success"
  };

  await appendUsageEvent(root, { ...base, event_type: "search", occurred_at: "2026-05-02T10:00:00.000Z", query: "现金流" });
  await appendUsageEvent(root, { ...base, event_type: "select_transcript_span", occurred_at: "2026-05-02T10:01:00.000Z", selected_duration_ms: 8000 });
  await appendUsageEvent(root, { ...base, event_type: "cut_success", occurred_at: "2026-05-02T10:02:00.000Z", cut_job_id: "CJ20260502-0001" });

  const metrics = await readUsageMetrics(root);

  assert.equal(metrics.search_request_count, 1);
  assert.equal(metrics.transcript_selection_count, 1);
  assert.equal(metrics.cut_success_count, 1);
  assert.equal(metrics.active_user_count, 1);
  assert.equal(metrics.users[0]?.user_id, "CU000001");
  assert.equal(metrics.users[0]?.search_request_count, 1);
});
```

- [ ] **Step 2: Run failing usage-event tests**

Run:

```bash
node --test --import tsx packages/library-fs/src/usage-events.test.ts
```

Expected: fail because `usage-events.ts` does not exist.

- [ ] **Step 3: Implement usage-event store**

Create `/Users/allen/Documents/mixlab/packages/library-fs/src/usage-events.ts`:

```ts
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type MixlabUsageEventType =
  | "search"
  | "view_source_video"
  | "view_transcript"
  | "select_transcript_span"
  | "add_to_cut_list"
  | "submit_cut_job"
  | "cut_success"
  | "cut_failure"
  | "create_local_clip"
  | "reuse_local_clip";

export interface MixlabUsageEvent {
  event_id?: string;
  user_id: string;
  username: string;
  device_id: string;
  event_type: MixlabUsageEventType;
  occurred_at: string;
  source_video_id: string;
  cut_job_id: string;
  query: string;
  selected_duration_ms: number;
  result_status: "success" | "empty" | "failure";
}

export interface UserUsageMetrics {
  user_id: string;
  username: string;
  search_request_count: number;
  transcript_selection_count: number;
  cut_submission_count: number;
  cut_success_count: number;
  local_clip_count: number;
  last_used_at: string;
}

export interface UsageMetrics {
  search_request_count: number;
  search_hit_count: number;
  search_empty_count: number;
  source_detail_view_count: number;
  transcript_selection_count: number;
  cut_submission_count: number;
  cut_success_count: number;
  cut_failure_count: number;
  local_clip_count: number;
  active_user_count: number;
  recent_keywords: string[];
  most_used_source_video_ids: string[];
  users: UserUsageMetrics[];
}

function eventsPath(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "usage-events", "events.ndjson");
}

async function readEvents(libraryRoot: string): Promise<MixlabUsageEvent[]> {
  try {
    const raw = await readFile(eventsPath(libraryRoot), "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as MixlabUsageEvent);
  } catch {
    return [];
  }
}

export async function appendUsageEvent(
  libraryRoot: string,
  event: MixlabUsageEvent
): Promise<MixlabUsageEvent> {
  if (!event.user_id.trim() || !event.device_id.trim()) {
    throw new Error("使用事件必须绑定剪辑师用户和设备");
  }
  const next = { ...event, event_id: event.event_id ?? randomUUID() };
  const filePath = eventsPath(libraryRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  const previous = await readEvents(libraryRoot);
  await writeFile(filePath, `${previous.map((item) => JSON.stringify(item)).join("\n")}${previous.length ? "\n" : ""}${JSON.stringify(next)}\n`, "utf8");
  return next;
}

export async function readUsageMetrics(libraryRoot: string): Promise<UsageMetrics> {
  const events = await readEvents(libraryRoot);
  const users = new Map<string, UserUsageMetrics>();
  const sourceCounts = new Map<string, number>();
  const keywords: string[] = [];

  for (const event of events) {
    const current = users.get(event.user_id) ?? {
      user_id: event.user_id,
      username: event.username,
      search_request_count: 0,
      transcript_selection_count: 0,
      cut_submission_count: 0,
      cut_success_count: 0,
      local_clip_count: 0,
      last_used_at: ""
    };

    if (event.event_type === "search") current.search_request_count += 1;
    if (event.event_type === "select_transcript_span") current.transcript_selection_count += 1;
    if (event.event_type === "submit_cut_job") current.cut_submission_count += 1;
    if (event.event_type === "cut_success") current.cut_success_count += 1;
    if (event.event_type === "create_local_clip") current.local_clip_count += 1;
    current.last_used_at = event.occurred_at > current.last_used_at ? event.occurred_at : current.last_used_at;
    users.set(event.user_id, current);

    if (event.source_video_id) {
      sourceCounts.set(event.source_video_id, (sourceCounts.get(event.source_video_id) ?? 0) + 1);
    }
    if (event.query.trim()) {
      keywords.unshift(event.query.trim());
    }
  }

  return {
    search_request_count: events.filter((event) => event.event_type === "search").length,
    search_hit_count: events.filter((event) => event.event_type === "search" && event.result_status === "success").length,
    search_empty_count: events.filter((event) => event.event_type === "search" && event.result_status === "empty").length,
    source_detail_view_count: events.filter((event) => event.event_type === "view_source_video").length,
    transcript_selection_count: events.filter((event) => event.event_type === "select_transcript_span").length,
    cut_submission_count: events.filter((event) => event.event_type === "submit_cut_job").length,
    cut_success_count: events.filter((event) => event.event_type === "cut_success").length,
    cut_failure_count: events.filter((event) => event.event_type === "cut_failure").length,
    local_clip_count: events.filter((event) => event.event_type === "create_local_clip").length,
    active_user_count: users.size,
    recent_keywords: [...new Set(keywords)].slice(0, 8),
    most_used_source_video_ids: [...sourceCounts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 8),
    users: [...users.values()].sort((a, b) => b.last_used_at.localeCompare(a.last_used_at))
  };
}
```

- [ ] **Step 4: Export usage-event store**

Modify `/Users/allen/Documents/mixlab/packages/library-fs/src/index.ts`:

```ts
export * from "./usage-events.ts";
```

- [ ] **Step 5: Verify usage-event tests**

Run:

```bash
node --test --import tsx packages/library-fs/src/usage-events.test.ts
```

Expected: 1 test passes.

- [ ] **Step 6: Commit usage-event store**

Run:

```bash
git add packages/library-fs/src/usage-events.ts packages/library-fs/src/usage-events.test.ts packages/library-fs/src/index.ts
git commit -m "feat(library): add usage event metrics"
```

## Task 5: Admin API Settings, Metrics, Source Detail, Users

**Files:**
- Modify: `/Users/allen/Documents/mixlab/packages/admin-api/src/index.ts`
- Modify: `/Users/allen/Documents/mixlab/packages/admin-api/src/index.test.ts`

- [ ] **Step 1: Add failing Admin API tests**

Append tests to `/Users/allen/Documents/mixlab/packages/admin-api/src/index.test.ts`:

```ts
test("serves settings, source detail, usage metrics, and cutter users", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeFile(path.join(libraryRoot, "source-videos", "cashflow.mp4"), "video");

  await withServer(libraryRoot, async (baseUrl) => {
    await postJson(baseUrl, "/api/admin/library/init");
    await postJson(baseUrl, "/api/admin/library/scan");

    const settings = await (await fetch(`${baseUrl}/api/admin/settings/config`)).json();
    assert.equal(settings.ok, true);
    assert.equal(settings.data.source_folders[0].name, "默认素材来源");

    const detail = await (await fetch(`${baseUrl}/api/admin/source-videos/V000001`)).json();
    assert.equal(detail.ok, true);
    assert.equal(detail.data.source_video.source_video_id, "V000001");
    assert.equal(detail.data.visibility.label, "剪辑师暂不可见");

    const users = await (await fetch(`${baseUrl}/api/admin/cutter-users`)).json();
    assert.equal(users.ok, true);
    assert.deepEqual(users.data.users, []);

    const metrics = await (await fetch(`${baseUrl}/api/admin/dashboard/metrics`)).json();
    assert.equal(metrics.ok, true);
    assert.equal(metrics.data.material.video_count, 1);
  });
});
```

- [ ] **Step 2: Run failing Admin API tests**

Run:

```bash
node --test --import tsx packages/admin-api/src/index.test.ts
```

Expected: fail with route not found for new endpoints.

- [ ] **Step 3: Import new library helpers**

Replace the existing import from `/Users/allen/Documents/mixlab/packages/library-fs/src/index.ts` in `/Users/allen/Documents/mixlab/packages/admin-api/src/index.ts` with:

```ts
import {
  approveCutterUser,
  disableCutterUser,
  listCutterUsers,
  publishIndexRequiredSourceVideos,
  readAdminSettings,
  readAllSourceVideoManifests,
  readUsageMetrics,
  scanSourceVideos
} from "../../library-fs/src/index.ts";
```

- [ ] **Step 4: Add source detail builder**

Add helper in `/Users/allen/Documents/mixlab/packages/admin-api/src/index.ts`:

```ts
async function getAdminSourceVideoDetail(libraryRoot: string, sourceVideoId: string) {
  const manifest = (await readAllSourceVideoManifests(libraryRoot)).find(
    (candidate) => candidate.source_video_id === sourceVideoId
  );

  if (!manifest) {
    throw new Error("原视频不存在");
  }

  const job = await readPreprocessJob(libraryRoot, sourceVideoId);
  const transcriptPath = manifest.transcript_path
    ? path.join(libraryRoot, manifest.transcript_path)
    : "";
  let transcript: { full_text: string; segment_count: number; character_count: number } = {
    full_text: "",
    segment_count: 0,
    character_count: 0
  };

  try {
    const raw = JSON.parse(await readFile(transcriptPath, "utf8")) as {
      full_text?: string;
      segments?: Array<{ text: string }>;
    };
    const fullText = raw.full_text ?? raw.segments?.map((segment) => segment.text).join("") ?? "";
    transcript = {
      full_text: fullText,
      segment_count: raw.segments?.length ?? 0,
      character_count: fullText.length
    };
  } catch {
    // Detail page displays missing transcript as incomplete artifact.
  }

  return {
    source_video: toAdminSourceVideo(manifest),
    technical: {
      duration_ms: manifest.duration_ms,
      width: manifest.width,
      height: manifest.height,
      fps: manifest.fps,
      codec: manifest.codec,
      file_size: manifest.file_size,
      content_hash: manifest.content_hash,
      relative_path: manifest.relative_path
    },
    visibility: {
      visible_to_cutters: manifest.visible_to_cutters,
      label: manifest.visible_to_cutters ? "剪辑师可见" : "剪辑师暂不可见",
      reason: manifest.preprocess_status === "ready" ? "" : "原视频尚未完成可搜索发布"
    },
    preprocess: {
      status: manifest.preprocess_status,
      job_id: `J${manifest.source_video_id.slice(1)}`,
      stage: jobStageFromManifest(manifest, job),
      attempt: job?.attempt ?? 0,
      started_at: job?.claimed_at ?? "",
      completed_at: job?.completed_at ?? job?.indexed_at ?? "",
      failed_at: job?.failed_at ?? "",
      error_stage: job?.error_stage ?? "",
      error_message: job?.error_message ?? ""
    },
    artifacts: {
      transcript: Boolean(manifest.transcript_path),
      subtitles: Boolean(manifest.srt_path),
      cover: Boolean(manifest.cover_path),
      keyframes: Boolean(manifest.keyframes_path),
      index_version: await readCurrentIndexVersion(libraryRoot)
    },
    transcript
  };
}
```

- [ ] **Step 5: Add dashboard metrics builder**

Add helper in `/Users/allen/Documents/mixlab/packages/admin-api/src/index.ts`:

```ts
async function getAdminDashboardMetrics(libraryRoot: string) {
  const manifests = await readAllSourceVideoManifests(libraryRoot);
  const usage = await readUsageMetrics(libraryRoot);
  const totalDurationMs = manifests.reduce((sum, manifest) => sum + manifest.duration_ms, 0);
  const readyDurationMs = manifests
    .filter((manifest) => manifest.preprocess_status === "ready")
    .reduce((sum, manifest) => sum + manifest.duration_ms, 0);
  const totalBytes = manifests.reduce((sum, manifest) => sum + manifest.file_size, 0);

  return {
    material: {
      video_count: manifests.length,
      ready_video_count: manifests.filter((manifest) => manifest.preprocess_status === "ready").length,
      total_duration_ms: totalDurationMs,
      ready_duration_ms: readyDurationMs,
      unprocessed_duration_ms: manifests
        .filter((manifest) => manifest.preprocess_status === "unprocessed")
        .reduce((sum, manifest) => sum + manifest.duration_ms, 0),
      total_size_bytes: totalBytes
    },
    transcript: {
      transcript_video_count: manifests.filter((manifest) => Boolean(manifest.transcript_path)).length,
      character_count: 0,
      segment_count: 0,
      current_index_version: await readCurrentIndexVersion(libraryRoot)
    },
    production: {
      completed_today_count: 0,
      failed_today_count: 0,
      average_video_process_ms: 0,
      estimated_queue_done_at: ""
    },
    usage,
    risk: {
      failed_video_count: manifests.filter((manifest) => manifest.preprocess_status === "failed").length,
      index_required_video_count: manifests.filter((manifest) => manifest.preprocess_status === "index-required").length
    }
  };
}
```

- [ ] **Step 6: Register Admin API routes**

Add routes before final not-found in `/Users/allen/Documents/mixlab/packages/admin-api/src/index.ts`:

```ts
if (request.method === "GET" && url.pathname === "/api/admin/settings/config") {
  writeJson(response, 200, apiOk(await readAdminSettings(input.library_root)));
  return;
}

if (request.method === "GET" && url.pathname === "/api/admin/dashboard/metrics") {
  writeJson(response, 200, apiOk(await getAdminDashboardMetrics(input.library_root)));
  return;
}

const detailMatch = /^\/api\/admin\/source-videos\/(V\d{6})$/.exec(url.pathname);
if (request.method === "GET" && detailMatch) {
  writeJson(response, 200, apiOk(await getAdminSourceVideoDetail(input.library_root, detailMatch[1] ?? "")));
  return;
}

if (request.method === "GET" && url.pathname === "/api/admin/cutter-users") {
  writeJson(response, 200, apiOk(await listCutterUsers(input.library_root)));
  return;
}

const approveUserMatch = /^\/api\/admin\/cutter-users\/(CU\d{6})\/approve$/.exec(url.pathname);
if (request.method === "POST" && approveUserMatch) {
  writeJson(response, 200, apiOk(await approveCutterUser(input.library_root, {
    user_id: approveUserMatch[1] ?? "",
    now: now()
  })));
  return;
}

const disableUserMatch = /^\/api\/admin\/cutter-users\/(CU\d{6})\/disable$/.exec(url.pathname);
if (request.method === "POST" && disableUserMatch) {
  writeJson(response, 200, apiOk(await disableCutterUser(input.library_root, {
    user_id: disableUserMatch[1] ?? "",
    now: now()
  })));
  return;
}
```

- [ ] **Step 7: Fix admin cover path resolution**

Change `writeCover` in `/Users/allen/Documents/mixlab/packages/admin-api/src/index.ts`:

```ts
const coverPath = path.join(input.library_root, manifest.cover_path);
```

to:

```ts
const coverPath = manifest.cover_path.startsWith("library://")
  ? path.join(input.library_root, ".mixlab-library", "videos", sourceVideoId, "cover.jpg")
  : path.join(input.library_root, manifest.cover_path);
```

Keep the later `fileExists` guard.

- [ ] **Step 8: Verify Admin API tests**

Run:

```bash
node --test --import tsx packages/admin-api/src/index.test.ts
```

Expected: all Admin API tests pass.

- [ ] **Step 9: Commit Admin API expansion**

Run:

```bash
git add packages/admin-api/src/index.ts packages/admin-api/src/index.test.ts
git commit -m "feat(admin-api): expose settings metrics users and source detail"
```

## Task 6: Cutter API Auth And Usage Events

**Files:**
- Modify: `/Users/allen/Documents/mixlab/packages/cutter-api/src/index.ts`
- Modify: `/Users/allen/Documents/mixlab/packages/cutter-api/src/index.test.ts`

- [ ] **Step 1: Add failing Cutter API auth tests**

Append to `/Users/allen/Documents/mixlab/packages/cutter-api/src/index.test.ts`:

```ts
test("requires approved cutter login before serving protected catalog routes", async () => {
  const fixture = await createReadyLibraryFixture();
  await withServer(fixture.libraryRoot, async (baseUrl) => {
    const blocked = await fetch(`${baseUrl}/cutter/source-library`);
    assert.equal(blocked.status, 401);

    const application = await postJson(baseUrl, "/cutter/auth/request-login", {
      username: "小王",
      device_id: "device-1",
      device_name: "Allen Mac"
    });
    assert.equal(application.data.status, "pending");
  });
});
```

Use the same ready-library fixture helper already used by the existing cutter API tests. If the helper is currently nested inside another test, move it to file scope without changing its behavior.

- [ ] **Step 2: Run failing Cutter API auth tests**

Run:

```bash
node --test --import tsx packages/cutter-api/src/index.test.ts
```

Expected: fail because auth routes and protection do not exist.

- [ ] **Step 3: Import auth and event helpers**

Replace the existing import from `/Users/allen/Documents/mixlab/packages/library-fs/src/index.ts` in `/Users/allen/Documents/mixlab/packages/cutter-api/src/index.ts` with:

```ts
import {
  appendUsageEvent,
  allocateNextLocalClipId,
  buildLocalClipArtifactPaths,
  createCutterLoginApplication,
  getCutterSourceVideoDetail,
  getLocalClipDetail,
  listCutterSourceLibrary,
  listLocalClips,
  searchCutterSourceLibrary,
  validateCutterSession,
  writeLocalClipManifest,
  type CutterSourceLibrarySearchGroup,
  type CutterSourceVideoCard,
  type CutterSourceVideoDetail,
  type LocalClipView
} from "../../library-fs/src/index.ts";
```

- [ ] **Step 4: Add auth request parser**

Add body interface:

```ts
interface CutterLoginRequestBody {
  username?: unknown;
  device_id?: unknown;
  device_name?: unknown;
}
```

Add parser:

```ts
async function readRequestJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}
```

- [ ] **Step 5: Add auth guard**

Add helper:

```ts
async function requireCutterSession(
  libraryRoot: string,
  request: IncomingMessage,
  now: string
): Promise<{ ok: true; user_id: string; username: string; device_id: string } | { ok: false; reason: string }> {
  const deviceId = String(request.headers["x-mixlab-device-id"] ?? "");
  const token = String(request.headers["x-mixlab-session-token"] ?? "");
  const result = await validateCutterSession(libraryRoot, {
    device_id: deviceId,
    session_token: token,
    now
  });
  return result.ok
    ? { ok: true, user_id: result.user.user_id, username: result.user.username, device_id: deviceId }
    : { ok: false, reason: result.reason };
}
```

- [ ] **Step 6: Add auth routes**

First update `setCorsHeaders` in `/Users/allen/Documents/mixlab/packages/cutter-api/src/index.ts`:

```ts
response.setHeader("Access-Control-Allow-Headers", "Content-Type,Range,X-MixLab-Device-Id,X-MixLab-Session-Token");
```

Then add auth routes in server route handling before protected endpoints:

```ts
if (request.method === "POST" && url.pathname === "/cutter/auth/request-login") {
  const body = (await readRequestJson(request)) as CutterLoginRequestBody;
  const application = await createCutterLoginApplication(input.library_root, {
    username: String(body.username ?? ""),
    device_id: String(body.device_id ?? ""),
    device_name: String(body.device_name ?? "剪辑端设备"),
    now: input.now?.() ?? new Date().toISOString()
  });
  writeJson(response, 200, apiResponse(application));
  return;
}

if (request.method === "GET" && url.pathname === "/cutter/auth/status") {
  const result = await requireCutterSession(input.library_root, request, input.now?.() ?? new Date().toISOString());
  writeJson(response, result.ok ? 200 : 401, apiResponse(result));
  return;
}
```

- [ ] **Step 7: Protect catalog and cutting routes**

Before every non-auth `/cutter/*` route except media streaming if the app needs thumbnails before login, call:

```ts
const session = await requireCutterSession(input.library_root, request, input.now?.() ?? new Date().toISOString());
if (!session.ok) {
  writeError(response, 401, "login_required", session.reason);
  return;
}
```

For first implementation, protect:

- `/cutter/source-library`
- `/cutter/source-videos/:id`
- `/cutter/source-search`
- `/cutter/local-clips`
- `/cutter/clip-lists`
- `/cutter/cut-jobs`

- [ ] **Step 8: Record API-derived usage events**

After successful search route:

```ts
await appendUsageEvent(input.library_root, {
  user_id: session.user_id,
  username: session.username,
  device_id: session.device_id,
  event_type: "search",
  occurred_at: input.now?.() ?? new Date().toISOString(),
  source_video_id: "",
  cut_job_id: "",
  query,
  selected_duration_ms: 0,
  result_status: result.groups.length ? "success" : "empty"
});
```

After source detail route, append `view_source_video`. After cut submission route, append `submit_cut_job`. After `runNextCutJob`, append `cut_success` or `cut_failure`.

- [ ] **Step 9: Verify Cutter API tests**

Run:

```bash
node --test --import tsx packages/cutter-api/src/index.test.ts
```

Expected: all Cutter API tests pass after updating existing tests to include approved session headers.

- [ ] **Step 10: Commit Cutter API auth**

Run:

```bash
git add packages/cutter-api/src/index.ts packages/cutter-api/src/index.test.ts
git commit -m "feat(cutter-api): require approved cutter login"
```

## Task 7: Admin Web API Client And Fixture Data

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/api.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/api.test.ts`

- [ ] **Step 1: Add failing admin client tests**

Add tests to `/Users/allen/Documents/mixlab/apps/admin-web/src/api.test.ts`:

```ts
test("resolves admin media URLs against the admin API base URL", async () => {
  const client = createAdminApiClient({
    base_url: "http://127.0.0.1:3889",
    fetch: async () => new Response(JSON.stringify({
      ok: true,
      data: [{
        source_video_id: "V000001",
        title: "测试",
        file_name: "a.mp4",
        relative_path: "a.mp4",
        cover_url: "/api/admin/source-videos/V000001/cover",
        duration_ms: 1,
        file_size: 1,
        preprocess_status: "ready",
        visible_to_cutters: true,
        tags: [],
        description: "",
        lecturer: "",
        course: "",
        category: "",
        updated_at: ""
      }]
    }))
  });

  const videos = await client.listSourceVideos();
  assert.equal(videos[0]?.cover_url, "http://127.0.0.1:3889/api/admin/source-videos/V000001/cover");
});

test("fixture admin data includes cutter users, metrics, settings, and source detail", async () => {
  const client = createFixtureAdminApiClient();
  assert.equal((await client.getAdminSettings()).source_folders[0]?.name, "默认素材来源");
  assert.equal((await client.listCutterUsers()).users[0]?.username, "小王");
  assert.equal((await client.getDashboardMetrics()).usage.active_user_count > 0, true);
  assert.equal((await client.getSourceVideoDetail("P000042")).visibility.label, "剪辑师可见");
});
```

- [ ] **Step 2: Run failing admin client tests**

Run:

```bash
node --test --import tsx apps/admin-web/src/api.test.ts
```

Expected: fail because new methods/types do not exist.

- [ ] **Step 3: Add admin client types**

In `/Users/allen/Documents/mixlab/apps/admin-web/src/api.ts`, add interfaces matching Admin API:

```ts
export interface AdminSourceFolder {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  last_scanned_at?: string;
  discovered_video_count?: number;
  new_unprocessed_count?: number;
}

export interface AdminSettingsConfig {
  schema_version: "1.0";
  library_name: string;
  source_folders: AdminSourceFolder[];
  artifact_library: {
    mode: "default" | "custom";
    path: string;
    migration_required: boolean;
  };
  runtime_policy: {
    audio_mode: "mp3_16k_mono_64k" | "wav_16k_mono_pcm_s16le";
    concurrent_jobs: number;
    auto_scan_enabled: boolean;
    auto_queue_enabled: boolean;
    auto_publish_index_enabled: boolean;
  };
  updated_at: string;
}

export interface UserUsageMetrics {
  user_id: string;
  username: string;
  search_request_count: number;
  transcript_selection_count: number;
  cut_submission_count: number;
  cut_success_count: number;
  local_clip_count: number;
  last_used_at: string;
}

export interface UsageMetrics {
  search_request_count: number;
  search_hit_count: number;
  search_empty_count: number;
  source_detail_view_count: number;
  transcript_selection_count: number;
  cut_submission_count: number;
  cut_success_count: number;
  cut_failure_count: number;
  local_clip_count: number;
  active_user_count: number;
  recent_keywords: string[];
  most_used_source_video_ids: string[];
  users: UserUsageMetrics[];
}

export interface AdminDashboardMetrics {
  material: {
    video_count: number;
    ready_video_count: number;
    total_duration_ms: number;
    ready_duration_ms: number;
    unprocessed_duration_ms: number;
    total_size_bytes: number;
  };
  transcript: {
    transcript_video_count: number;
    character_count: number;
    segment_count: number;
    current_index_version: string;
  };
  production: {
    completed_today_count: number;
    failed_today_count: number;
    average_video_process_ms: number;
    estimated_queue_done_at: string;
  };
  usage: UsageMetrics;
  risk: {
    failed_video_count: number;
    index_required_video_count: number;
  };
}

export interface AdminSourceVideoDetail {
  source_video: AdminSourceVideo;
  technical: {
    duration_ms: number;
    width: number;
    height: number;
    fps: number;
    codec: string;
    file_size: number;
    content_hash: string;
    relative_path: string;
  };
  visibility: {
    visible_to_cutters: boolean;
    label: string;
    reason: string;
  };
  preprocess: {
    status: AdminPreprocessStatus;
    job_id: string;
    stage: string;
    attempt: number;
    started_at: string;
    completed_at: string;
    failed_at: string;
    error_stage: string;
    error_message: string;
  };
  artifacts: {
    transcript: boolean;
    subtitles: boolean;
    cover: boolean;
    keyframes: boolean;
    index_version: string;
  };
  transcript: {
    full_text: string;
    segment_count: number;
    character_count: number;
  };
}

export interface AdminCutterUsersResponse { users: AdminCutterUser[] }
export interface AdminCutterUser {
  user_id: string;
  username: string;
  display_name: string;
  status: "pending" | "approved" | "rejected" | "disabled";
  applied_at: string;
  approved_at: string;
  rejected_at: string;
  disabled_at: string;
  last_login_at: string;
  last_used_at: string;
  note: string;
  devices: Array<{
    device_id: string;
    device_name: string;
    status: "active" | "disabled";
    first_seen_at: string;
    last_login_at: string;
  }>;
}

export interface AdminCutterUserApprovalResult {
  status: "approved";
  user: AdminCutterUser;
  session: {
    user_id: string;
    device_id: string;
    session_token: string;
    created_at: string;
    last_seen_at: string;
  };
}
```

- [ ] **Step 4: Extend AdminApiClient**

Add methods:

```ts
getAdminSettings(): Promise<AdminSettingsConfig>;
getDashboardMetrics(): Promise<AdminDashboardMetrics>;
getSourceVideoDetail(sourceVideoId: string): Promise<AdminSourceVideoDetail>;
listCutterUsers(): Promise<AdminCutterUsersResponse>;
approveCutterUser(userId: string): Promise<AdminCutterUserApprovalResult>;
disableCutterUser(userId: string): Promise<AdminCutterUser>;
```

- [ ] **Step 5: Resolve media URLs**

Add:

```ts
function resolveMediaUrl(baseUrl: string, pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl) || pathOrUrl.startsWith("data:")) {
    return pathOrUrl;
  }
  return `${baseUrl.replace(/\/$/, "")}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}
```

In `listSourceVideos` and `getSourceVideoDetail`, map `cover_url` through `resolveMediaUrl`.

- [ ] **Step 6: Update fixture client**

Fixture client must return:

- Settings with two source folders.
- Metrics with nonzero material stats and "尚未开始记录" only where no events exist.
- Cutter users including one pending and one approved.
- Source detail for the selected ready video.

- [ ] **Step 7: Verify admin client tests**

Run:

```bash
node --test --import tsx apps/admin-web/src/api.test.ts
```

Expected: all admin client tests pass.

- [ ] **Step 8: Commit admin client expansion**

Run:

```bash
git add apps/admin-web/src/api.ts apps/admin-web/src/api.test.ts
git commit -m "feat(admin-web): add settings metrics users and source detail client"
```

## Task 8: Admin Navigation, Chinese Labels, And Page Restructure

**Files:**
- Create: `/Users/allen/Documents/mixlab/apps/admin-web/src/app/chinese.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/app/navigation.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/app/AdminApp.tsx`
- Modify: all admin feature pages listed in File Structure
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/admin-app.test.ts`

- [ ] **Step 1: Add failing Chinese IA render tests**

Update `/Users/allen/Documents/mixlab/apps/admin-web/src/admin-app.test.ts`:

```ts
test("admin navigation follows M9C order and keeps settings last", () => {
  const labels = ADMIN_NAV_ITEMS.map((item) => item.label);
  assert.deepEqual(labels, ["仪表盘", "原视频管理", "预处理队列", "索引与发布", "健康诊断", "剪辑师用户", "设置"]);
});

test("admin rendered pages do not expose English UI labels", async () => {
  const data = await fixtureData();
  const html = [
    renderToStaticMarkup(h(DashboardPage, { data })),
    renderToStaticMarkup(h(SourceVideosPage, { data })),
    renderToStaticMarkup(h(PreprocessJobsPage, { data })),
    renderToStaticMarkup(h(IndexPublishPage, { data })),
    renderToStaticMarkup(h(DoctorPage, { data })),
    renderToStaticMarkup(h(SettingsPage, { data }))
  ].join("\n");

  for (const forbidden of ["Ready", "Processing", "Queued", "Unprocessed", "Failed", "Index Required", "Doctor", "ASR", "API Key"]) {
    assert.equal(html.includes(forbidden), false, `${forbidden} should be Chineseized`);
  }
});
```

- [ ] **Step 2: Run failing admin render tests**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts
```

Expected: fail on old navigation and English labels.

- [ ] **Step 3: Add Chinese label helpers**

Create `/Users/allen/Documents/mixlab/apps/admin-web/src/app/chinese.ts`:

```ts
import type { AdminPreprocessStatus } from "../api.ts";

export function preprocessStatusLabel(status: AdminPreprocessStatus): string {
  return {
    ready: "已可用",
    processing: "处理中",
    queued: "队列中",
    unprocessed: "未处理",
    failed: "处理失败",
    "index-required": "待发布索引"
  }[status];
}

export function jobStageLabel(stage: string): string {
  return {
    "extract-audio": "提取音频",
    asr: "语音转文字",
    "build-transcript": "生成文案",
    "build-srt": "生成字幕",
    "build-keyframes": "生成关键帧",
    "build-cover": "生成封面",
    "build-index": "更新搜索索引",
    "publish-ready": "发布可用",
    "queued-by-admin": "管理员加入队列",
    "retry-by-admin": "管理员重试"
  }[stage] ?? stage;
}

export function booleanLabel(value: boolean): string {
  return value ? "是" : "否";
}

export function runtimeSourceLabel(source: string): string {
  return source === "bundled" ? "内置" : source === "custom" ? "自定义" : source === "missing" ? "缺失" : "系统路径";
}
```

- [ ] **Step 4: Update navigation**

Modify `/Users/allen/Documents/mixlab/apps/admin-web/src/app/navigation.ts`:

```ts
export type AdminRoute =
  | "dashboard"
  | "source-videos"
  | "source-detail"
  | "preprocess-jobs"
  | "index-publish"
  | "doctor"
  | "cutter-users"
  | "settings";

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { route: "dashboard", label: "仪表盘", icon: "dashboard" },
  { route: "source-videos", label: "原视频管理", icon: "video" },
  { route: "preprocess-jobs", label: "预处理队列", icon: "queue" },
  { route: "index-publish", label: "索引与发布", icon: "index" },
  { route: "doctor", label: "健康诊断", icon: "doctor" },
  { route: "cutter-users", label: "剪辑师用户", icon: "users" },
  { route: "settings", label: "设置", icon: "settings" }
];

export function routeFromHash(hash: string): AdminRoute {
  const route = hash.replace(/^#\/?/, "");
  if (route === "library-settings") return "settings";
  if (route === "index-health") return "index-publish";
  return ROUTES.has(route as AdminRoute) ? (route as AdminRoute) : "dashboard";
}
```

- [ ] **Step 5: Remove full path from toolbar**

In `/Users/allen/Documents/mixlab/apps/admin-web/src/app/AdminApp.tsx`, change toolbar props:

```tsx
libraryLabel={data?.status.name ?? "主素材库"}
healthLabel={data?.doctor.summary.fail ? "需处理" : "健康"}
```

Do not pass `root_path` into toolbar visible text.

- [ ] **Step 6: Update pages to Chinese labels**

Use helpers from `app/chinese.ts` in:

- `DashboardPage.tsx`
- `SourceVideosPage.tsx`
- `PreprocessJobsPage.tsx`
- `DoctorPage.tsx`
- `IndexPublishPage.tsx`
- `SettingsPage.tsx`

Replace all user-facing English labels. Examples:

```tsx
{ label: "已可用", value: data.status.ready_video_count, caption: "剪辑师可搜索" }
{ label: "语音转文字", value: data.runtime.asr.provider_label }
{ label: "接口密钥", value: redactConfiguredSecret(data.runtime.asr.dashscope_api_key_configured) }
```

- [ ] **Step 7: Merge public library settings into SettingsPage**

Remove visible dependency on `LibrarySettingsPage` from navigation and route handling. Keep the file only if tests still import it; otherwise delete it after tests are updated.

`SettingsPage` sections must be:

- 素材来源
- 预处理产物库
- 运行策略
- 路径与权限校验

- [ ] **Step 8: Verify admin render tests**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts
```

Expected: admin render tests pass.

- [ ] **Step 9: Commit admin IA restructure**

Run:

```bash
git add apps/admin-web/src/app/chinese.ts apps/admin-web/src/app/navigation.ts apps/admin-web/src/app/AdminApp.tsx apps/admin-web/src/features apps/admin-web/src/admin-app.test.ts
git commit -m "feat(admin-web): restructure Chinese management IA"
```

## Task 9: Admin Source Detail Page

**Files:**
- Create: `/Users/allen/Documents/mixlab/apps/admin-web/src/features/source-detail/AdminSourceDetailPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/app/AdminApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/features/source-videos/SourceVideosPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/admin-app.test.ts`

- [ ] **Step 1: Add failing source detail render test**

Add to `/Users/allen/Documents/mixlab/apps/admin-web/src/admin-app.test.ts`:

```ts
test("admin source detail renders complete preprocessing data in Chinese", async () => {
  const data = await fixtureData();
  const detail = await createFixtureAdminApiClient().getSourceVideoDetail("P000042");
  const html = renderToStaticMarkup(h(AdminSourceDetailPage, { detail }));

  for (const text of ["原视频详情", "基本信息", "预处理状态", "产物完整性", "文案数据", "视觉数据", "公开元数据", "剪辑师可见"]) {
    assert.match(html, new RegExp(text));
  }
});
```

- [ ] **Step 2: Run failing source detail test**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts
```

Expected: fail because page does not exist.

- [ ] **Step 3: Implement AdminSourceDetailPage**

Create `/Users/allen/Documents/mixlab/apps/admin-web/src/features/source-detail/AdminSourceDetailPage.tsx`:

```tsx
import { GroupedForm, InspectorPanel } from "@mixlab/ui-foundation";
import type { AdminSourceVideoDetail } from "../../api.ts";
import { preprocessStatusLabel, jobStageLabel, booleanLabel } from "../../app/chinese.ts";
import { AdminPageHeader } from "../shared.tsx";

export function AdminSourceDetailPage({ detail }: { detail: AdminSourceVideoDetail }) {
  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader title="原视频详情" eyebrow={detail.source_video.source_video_id} />
        <GroupedForm
          groups={[
            {
              title: "基本信息",
              rows: [
                { label: "标题", value: detail.source_video.title },
                { label: "文件名", value: detail.source_video.file_name },
                { label: "来源内相对路径", value: detail.technical.relative_path },
                { label: "分辨率", value: `${detail.technical.width} × ${detail.technical.height}` },
                { label: "编码格式", value: detail.technical.codec },
                { label: "剪辑师可见", value: booleanLabel(detail.visibility.visible_to_cutters) }
              ]
            },
            {
              title: "预处理状态",
              rows: [
                { label: "当前状态", value: preprocessStatusLabel(detail.source_video.preprocess_status) },
                { label: "当前阶段", value: jobStageLabel(detail.preprocess.stage) },
                { label: "任务编号", value: detail.preprocess.job_id },
                { label: "重试次数", value: detail.preprocess.attempt }
              ]
            },
            {
              title: "产物完整性",
              rows: [
                { label: "文案", value: booleanLabel(detail.artifacts.transcript) },
                { label: "字幕", value: booleanLabel(detail.artifacts.subtitles) },
                { label: "封面", value: booleanLabel(detail.artifacts.cover) },
                { label: "关键帧", value: booleanLabel(detail.artifacts.keyframes) },
                { label: "索引版本", value: detail.artifacts.index_version }
              ]
            },
            {
              title: "文案数据",
              rows: [
                { label: "文案字数", value: detail.transcript.character_count },
                { label: "分段数量", value: detail.transcript.segment_count }
              ]
            }
          ]}
        />
      </div>
      <InspectorPanel title="视觉数据">
        <img className="admin-inspector-cover" src={detail.source_video.cover_url} alt="" />
        <p className="admin-note">{detail.transcript.full_text || "暂无完整文案"}</p>
      </InspectorPanel>
    </>
  );
}
```

- [ ] **Step 4: Route source detail**

In `AdminApp.tsx`, maintain selected source detail state and route when clicking a row. Minimal implementation:

```tsx
const [selectedSourceVideoId, setSelectedSourceVideoId] = useState("");
const [sourceDetail, setSourceDetail] = useState<AdminSourceVideoDetail | null>(null);
```

When `route === "source-detail"` load `client.getSourceVideoDetail(selectedSourceVideoId || data?.source_videos[0]?.source_video_id || "")`.

- [ ] **Step 5: Make rows navigate**

In `SourceVideosPage`, add prop:

```ts
onOpenSourceDetail?: (sourceVideoId: string) => void;
```

Pass it to `SourceVideoTable` and use row click to call it.

- [ ] **Step 6: Verify source detail tests**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts
```

Expected: source detail tests pass.

- [ ] **Step 7: Commit source detail page**

Run:

```bash
git add apps/admin-web/src/features/source-detail/AdminSourceDetailPage.tsx apps/admin-web/src/app/AdminApp.tsx apps/admin-web/src/features/source-videos/SourceVideosPage.tsx apps/admin-web/src/admin-app.test.ts
git commit -m "feat(admin-web): add source preprocessing detail page"
```

## Task 10: Cutter Web Login Gate And Auth Client

**Files:**
- Create: `/Users/allen/Documents/mixlab/apps/cutter-web/src/auth.ts`
- Create: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/login/CutterLoginGate.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/api.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/api.test.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`

- [ ] **Step 1: Add failing cutter auth client tests**

In `/Users/allen/Documents/mixlab/apps/cutter-web/src/api.test.ts`, add:

```ts
test("cutter API client submits login applications and attaches auth headers", async () => {
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];
  const client = createCutterApiClient({
    base_url: "http://127.0.0.1:3789",
    auth: { device_id: "device-1", session_token: "token-1" },
    fetch: async (url, init) => {
      requests.push({ url: String(url), headers: Object.fromEntries(new Headers(init?.headers)) });
      return new Response(JSON.stringify({ schema_version: "1.0", data: { status: "pending" } }));
    }
  });

  await client.requestLogin({ username: "小王", device_id: "device-1", device_name: "Allen Mac" });
  await client.listSourceLibrary();

  assert.equal(requests[0]?.url, "http://127.0.0.1:3789/cutter/auth/request-login");
  assert.equal(requests[1]?.headers["x-mixlab-device-id"], "device-1");
  assert.equal(requests[1]?.headers["x-mixlab-session-token"], "token-1");
});
```

- [ ] **Step 2: Run failing cutter auth client tests**

Run:

```bash
node --test --import tsx apps/cutter-web/src/api.test.ts
```

Expected: fail because auth methods/input do not exist.

- [ ] **Step 3: Implement auth storage**

Create `/Users/allen/Documents/mixlab/apps/cutter-web/src/auth.ts`:

```ts
export interface CutterAuthSession {
  user_id: string;
  username: string;
  device_id: string;
  session_token: string;
}

export const CUTTER_AUTH_STORAGE_KEY = "mixlab.cutter.auth";

export function createDeviceId(): string {
  const existing = window.localStorage.getItem("mixlab.cutter.device_id");
  if (existing) return existing;
  const next = `device-${crypto.randomUUID()}`;
  window.localStorage.setItem("mixlab.cutter.device_id", next);
  return next;
}

export function readCutterAuthSession(): CutterAuthSession | null {
  const raw = window.localStorage.getItem(CUTTER_AUTH_STORAGE_KEY);
  return raw ? JSON.parse(raw) as CutterAuthSession : null;
}

export function writeCutterAuthSession(session: CutterAuthSession): void {
  window.localStorage.setItem(CUTTER_AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearCutterAuthSession(): void {
  window.localStorage.removeItem(CUTTER_AUTH_STORAGE_KEY);
}
```

- [ ] **Step 4: Extend CutterApiClient**

In `/Users/allen/Documents/mixlab/apps/cutter-web/src/api.ts`, extend input:

```ts
export interface CutterApiClientInput {
  base_url: string;
  fetch?: typeof fetch;
  auth?: { device_id: string; session_token: string };
}
```

Add methods:

```ts
export interface CutterLoginRequest {
  username: string;
  device_id: string;
  device_name: string;
}

export interface CutterLoginApplication {
  user_id: string;
  username: string;
  display_name: string;
  status: "pending" | "approved" | "rejected" | "disabled";
}

export interface CutterLoginStatus {
  ok: boolean;
  user_id?: string;
  username?: string;
  reason?: string;
}

export interface CutterUsageEventInput {
  event_type:
    | "view_transcript"
    | "select_transcript_span"
    | "add_to_cut_list"
    | "create_local_clip"
    | "reuse_local_clip";
  source_video_id?: string;
  selected_duration_ms?: number;
  result_status?: "success" | "empty" | "failure";
}

requestLogin(input: CutterLoginRequest): Promise<CutterLoginApplication>;
getLoginStatus(): Promise<CutterLoginStatus>;
recordUsageEvent(event: CutterUsageEventInput): Promise<CutterUsageEventInput>;
```

Add headers to protected requests:

```ts
function authHeaders(auth?: { device_id: string; session_token: string }): HeadersInit {
  return auth
    ? {
        "X-MixLab-Device-Id": auth.device_id,
        "X-MixLab-Session-Token": auth.session_token
      }
    : {};
}
```

- [ ] **Step 5: Implement CutterLoginGate**

Create `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/login/CutterLoginGate.tsx`:

```tsx
import { useState } from "react";

export function CutterLoginGate({
  onApply,
  children,
  status
}: {
  status: "unknown" | "pending" | "approved" | "rejected" | "disabled";
  onApply: (username: string) => void;
  children: React.ReactNode;
}) {
  const [username, setUsername] = useState("");

  if (status === "approved") {
    return <>{children}</>;
  }

  return (
    <main className="cutter-login-gate">
      <section className="cutter-login-panel">
        <h1>申请使用剪辑师工作台</h1>
        <p>{status === "pending" ? "申请已提交，请等待管理员审核。" : "请输入用户名，提交后由管理员审核。"}</p>
        <input
          aria-label="用户名"
          value={username}
          onChange={(event) => setUsername(event.currentTarget.value)}
          disabled={status === "pending"}
        />
        <button type="button" onClick={() => onApply(username)} disabled={status === "pending"}>
          提交申请
        </button>
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Wrap CutterApp**

In `CutterApp.tsx`, read auth session. In runtime API mode with no approved session, render `CutterLoginGate`. Fixture mode can default to approved fixture user so local UI tests still render workbench.

- [ ] **Step 7: Verify cutter web tests**

Run:

```bash
node --test --import tsx apps/cutter-web/src/api.test.ts apps/cutter-web/src/cutter-app.test.ts
```

Expected: cutter web tests pass.

- [ ] **Step 8: Commit cutter login gate**

Run:

```bash
git add apps/cutter-web/src/auth.ts apps/cutter-web/src/features/login/CutterLoginGate.tsx apps/cutter-web/src/api.ts apps/cutter-web/src/api.test.ts apps/cutter-web/src/app/CutterApp.tsx apps/cutter-web/src/cutter-app.test.ts
git commit -m "feat(cutter-web): add approved login gate"
```

## Task 11: Admin Cutter Users Page

**Files:**
- Create: `/Users/allen/Documents/mixlab/apps/admin-web/src/features/cutter-users/CutterUsersPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/app/AdminApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/admin-app.test.ts`

- [ ] **Step 1: Add failing cutter-users page test**

Add:

```ts
test("cutter users page renders login applications and user metrics", async () => {
  const data = await fixtureData();
  const html = renderToStaticMarkup(h(CutterUsersPage, {
    users: await createFixtureAdminApiClient().listCutterUsers(),
    metrics: (await createFixtureAdminApiClient().getDashboardMetrics()).usage,
    onApprove: () => {},
    onDisable: () => {}
  }));

  for (const text of ["剪辑师用户", "待审核", "已通过", "设备", "搜索次数", "剪切成功", "最近使用"]) {
    assert.match(html, new RegExp(text));
  }
});
```

- [ ] **Step 2: Run failing page test**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts
```

Expected: fail because `CutterUsersPage` does not exist.

- [ ] **Step 3: Implement CutterUsersPage**

Create `/Users/allen/Documents/mixlab/apps/admin-web/src/features/cutter-users/CutterUsersPage.tsx`:

```tsx
import { InspectorPanel } from "@mixlab/ui-foundation";
import type { AdminCutterUsersResponse, UsageMetrics } from "../../api.ts";
import { AdminControlButton, AdminPageHeader, MetricBand } from "../shared.tsx";

function userStatusLabel(status: string): string {
  return {
    pending: "待审核",
    approved: "已通过",
    rejected: "已拒绝",
    disabled: "已停用"
  }[status] ?? status;
}

export function CutterUsersPage({
  users,
  metrics,
  onApprove,
  onDisable
}: {
  users: AdminCutterUsersResponse;
  metrics: UsageMetrics;
  onApprove: (userId: string) => void;
  onDisable: (userId: string) => void;
}) {
  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader title="剪辑师用户" eyebrow="登录申请与使用统计" />
        <MetricBand items={[
          { label: "活跃用户", value: metrics.active_user_count, caption: "有使用记录" },
          { label: "搜索次数", value: metrics.search_request_count, caption: "全部剪辑端" },
          { label: "剪切成功", value: metrics.cut_success_count, caption: "生成本地素材" }
        ]} />
        <section className="admin-list-panel">
          {users.users.map((user) => (
            <div className="admin-row" key={user.user_id}>
              <strong>{user.display_name}</strong>
              <span>{userStatusLabel(user.status)}</span>
              <span>设备 {user.devices.length}</span>
              {user.status === "pending" ? <AdminControlButton label="通过申请" state="m9b-api" onClick={() => onApprove(user.user_id)} /> : null}
              {user.status === "approved" ? <AdminControlButton label="停用用户" state="m9b-api" onClick={() => onDisable(user.user_id)} /> : null}
            </div>
          ))}
        </section>
      </div>
      <InspectorPanel title="用户统计">
        {metrics.users.map((user) => (
          <p className="admin-note" key={user.user_id}>
            {user.username}：搜索 {user.search_request_count}，选段 {user.transcript_selection_count}，剪切成功 {user.cut_success_count}，最近使用 {user.last_used_at || "暂无"}
          </p>
        ))}
      </InspectorPanel>
    </>
  );
}
```

- [ ] **Step 4: Route CutterUsersPage in AdminApp**

Load `client.listCutterUsers()` and `client.getDashboardMetrics()` as part of dashboard data or route-specific state, then render `CutterUsersPage` when route is `cutter-users`.

- [ ] **Step 5: Verify cutter-users page tests**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts
```

Expected: all admin render tests pass.

- [ ] **Step 6: Commit cutter-users page**

Run:

```bash
git add apps/admin-web/src/features/cutter-users/CutterUsersPage.tsx apps/admin-web/src/app/AdminApp.tsx apps/admin-web/src/admin-app.test.ts
git commit -m "feat(admin-web): add cutter user management page"
```

## Task 12: Dashboard, Queue Context, Doctor Explanations, Visual Polish

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/features/dashboard/DashboardPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/features/doctor/DoctorPage.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/styles.css`
- Modify: `/Users/allen/Documents/mixlab/scripts/visual/check-admin-web-screenshots.ts`

- [ ] **Step 1: Add failing dashboard/queue/doctor assertions**

Update `apps/admin-web/src/admin-app.test.ts` to assert:

```ts
for (const text of ["原视频总时长", "文案总字数", "搜索请求", "活跃剪辑师", "风险摘要"]) {
  assert.match(dashboardHtml, new RegExp(text));
}

for (const text of ["未处理原视频", "将加入", "预计总时长", "素材来源"]) {
  assert.match(queueHtml, new RegExp(text));
}

for (const text of ["检查目的", "失败影响", "处理建议", "公共素材库根目录"]) {
  assert.match(doctorHtml, new RegExp(text));
}
```

- [ ] **Step 2: Run failing admin tests**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts
```

Expected: fail until pages render expanded sections.

- [ ] **Step 3: Expand DashboardPage**

Dashboard must render five sections:

- 素材规模
- 文案与索引
- 预处理产能
- 剪辑端使用
- 风险摘要

Use `data.metrics` from `AdminDashboardData`; if the property is not yet included in `loadAdminDashboardData`, update loader to fetch metrics.

- [ ] **Step 4: Expand PreprocessJobsPage**

Add context panel before action buttons:

```tsx
<MetricBand items={[
  { label: "未处理原视频", value: data.status.unprocessed_video_count, caption: "等待加入队列" },
  { label: "将加入", value: data.status.unprocessed_video_count, caption: "点击后进入队列" },
  { label: "预计总时长", value: formatDuration(data.metrics.material.unprocessed_duration_ms), caption: "按原视频时长估算" }
]} />
```

- [ ] **Step 5: Add Doctor explanation map**

In `DoctorPage.tsx`, map check ids to Chinese explanation:

```ts
const DOCTOR_EXPLANATIONS = {
  "public-root": { name: "公共素材库根目录", purpose: "确认管理端能访问素材库根目录", impact: "不可访问时无法扫描、预处理和发布", suggestion: "检查移动硬盘或网络盘是否挂载" },
  "source-videos-readable": { name: "素材来源可读性", purpose: "确认原视频目录可读取", impact: "不可读时无法扫描新增视频", suggestion: "检查文件夹权限" },
  "mixlab-library-writable": { name: "预处理产物库可写性", purpose: "确认文案、索引和日志可以写入", impact: "不可写时预处理无法完成", suggestion: "检查磁盘权限和剩余空间" }
} as const;
```

For unknown ids, show "技术检查项" with the original message in 技术详情.

- [ ] **Step 6: Verify admin expanded tests**

Run:

```bash
node --test --import tsx apps/admin-web/src/admin-app.test.ts
```

Expected: admin page tests pass.

- [ ] **Step 7: Commit dashboard and explanations**

Run:

```bash
git add apps/admin-web/src/features/dashboard/DashboardPage.tsx apps/admin-web/src/features/preprocess-jobs/PreprocessJobsPage.tsx apps/admin-web/src/features/doctor/DoctorPage.tsx apps/admin-web/src/styles.css apps/admin-web/src/admin-app.test.ts
git commit -m "feat(admin-web): expand dashboard queue and diagnosis context"
```

## Task 13: Verification, Visuals, And Runtime Smoke

**Files:**
- Modify screenshots under `/Users/allen/Documents/mixlab/docs/acceptance/artifacts`
- No source files unless verification catches issues.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
node --test --import tsx \
  packages/library-fs/src/admin-settings.test.ts \
  packages/library-fs/src/cutter-users.test.ts \
  packages/library-fs/src/usage-events.test.ts \
  packages/admin-api/src/index.test.ts \
  packages/cutter-api/src/index.test.ts \
  apps/admin-web/src/api.test.ts \
  apps/admin-web/src/admin-app.test.ts \
  apps/cutter-web/src/api.test.ts \
  apps/cutter-web/src/cutter-app.test.ts
```

Expected: all targeted tests pass.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 4: Build admin and cutter web**

Run:

```bash
npm run build:admin-web
npm run build:cutter-web
```

Expected: both Vite builds succeed.

- [ ] **Step 5: Run visual checks**

Run:

```bash
npm run visual:admin-web
npm run visual:cutter-web
```

Expected: screenshots generated, nonblank, and no major overflow.

- [ ] **Step 6: Start local runtime servers**

Run:

```bash
screen -S mixlab-admin-api -X quit || true
screen -S mixlab-admin-web -X quit || true
screen -S mixlab-cutter-api -X quit || true
screen -S mixlab-cutter-web -X quit || true

screen -dmS mixlab-admin-api zsh -lc 'cd /Users/allen/Documents/mixlab && MIXLAB_ADMIN_LIBRARY_ROOT=/tmp/mixlab-live-worker-library.KdzZK0 MIXLAB_ADMIN_API_HOST=127.0.0.1 MIXLAB_ADMIN_API_PORT=3889 npm run server:admin-api >/tmp/mixlab-admin-api.log 2>&1'
screen -dmS mixlab-admin-web zsh -lc 'cd /Users/allen/Documents/mixlab && VITE_MIXLAB_ADMIN_API_BASE_URL=http://127.0.0.1:3889 npm run dev -w @mixlab/admin-web -- --host 127.0.0.1 --port 5174 --strictPort >/tmp/mixlab-admin-web.log 2>&1'
screen -dmS mixlab-cutter-api zsh -lc 'cd /Users/allen/Documents/mixlab && MIXLAB_CUTTER_LIBRARY_ROOT=/tmp/mixlab-live-worker-library.KdzZK0 MIXLAB_CUTTER_API_HOST=127.0.0.1 MIXLAB_CUTTER_API_PORT=3789 npm run server:cutter-api >/tmp/mixlab-cutter-api.log 2>&1'
screen -dmS mixlab-cutter-web zsh -lc 'cd /Users/allen/Documents/mixlab && VITE_MIXLAB_CUTTER_API_BASE_URL=http://127.0.0.1:3789 npm run dev -w @mixlab/cutter-web -- --host 127.0.0.1 --port 5173 --strictPort >/tmp/mixlab-cutter-web.log 2>&1'
```

- [ ] **Step 7: Curl smoke tests**

Run:

```bash
curl -sS http://127.0.0.1:3889/api/admin/settings/config
curl -sS http://127.0.0.1:3889/api/admin/dashboard/metrics
curl -sS http://127.0.0.1:3889/api/admin/cutter-users
curl -I http://127.0.0.1:5174/
curl -I http://127.0.0.1:5173/
```

Expected: Admin endpoints return `ok: true`; web pages return HTTP 200.

- [ ] **Step 8: Commit verification artifacts**

Run:

```bash
git add docs/acceptance/artifacts apps packages scripts package.json .env.example
git commit -m "test: verify M9C admin IA and cutter login"
```

Only include files actually changed by visual checks or required fixes.

## Final Acceptance Script

1. Open `http://127.0.0.1:5174/`.
2. Confirm left navigation order is: 仪表盘, 原视频管理, 预处理队列, 索引与发布, 健康诊断, 剪辑师用户, 设置.
3. Confirm no visible page shows English labels such as Ready, Processing, Doctor, ASR, API Key.
4. Confirm toolbar shows no `/tmp` and no full local path.
5. Confirm dashboard shows source totals, duration totals, transcript/index stats, production capacity, cutter usage, and risk summary.
6. Confirm source list covers display; broken covers show a Chinese fallback image.
7. Click a source video and confirm the admin source detail page shows preprocessing status, artifacts, transcript stats, and public metadata.
8. Confirm queue page shows unprocessed count, affected count, and estimated total duration before queue action.
9. Confirm diagnosis page shows Chinese check purpose, failure impact, suggestion, and technical detail.
10. Open `http://127.0.0.1:5173/` with no login session.
11. Confirm cutter web shows login application page.
12. Submit a username.
13. Open Admin "剪辑师用户", approve the application.
14. Refresh cutter web and confirm workbench auto-enters and shows current username.
15. Run a search, view a source detail, add a transcript span, submit a cut list.
16. Confirm Admin dashboard and "剪辑师用户" show user-bound usage counts.

## Self-Review

- Spec coverage:
  - Multiple source folders with one artifact library: Tasks 1, 2, 8, and 12.
  - Chinese UI: Tasks 8 and 12.
  - Settings last and merged public library settings: Task 8.
  - Dashboard expanded metrics: Tasks 5, 7, and 12.
  - Source detail page: Tasks 5, 7, and 9.
  - Cutter login approval: Tasks 3, 6, 10, and 11.
  - User-bound usage stats: Tasks 4, 6, 7, 11, and 12.
  - Cover fix: Tasks 5 and 7.
- Placeholder scan:
  - No empty marker keywords remain.
  - All new client interfaces are explicit in Task 7.
- Type consistency:
  - User ids use `CU000001`.
  - Source ids use existing `V000001` runtime and fixture `P000042`.
  - Usage event names match Task 4 and Task 6.
