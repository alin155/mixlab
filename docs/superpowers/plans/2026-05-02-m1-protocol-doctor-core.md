# M1 Protocol And Doctor Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This plan is intentionally scoped to one milestone only.

**Goal:** Complete the M1 non-UI contract layer so later admin and cutter UI work cannot reinterpret visibility, manifests, paths, runtime status, or diagnostics.

**Architecture:** Protocol owns portable manifest contracts and validators. Library FS owns file-backed catalog reads and must hide malformed or incomplete ready records from cutters. Doctor Core reads the public-library folder, validates manifests, checks derived visibility state, checks artifact/index/path/runtime/ASR health, and returns a redacted JSON report for future admin UI use.

**Tech Stack:** TypeScript packages in the existing npm workspace, Node built-in test runner, filesystem-backed fixture libraries, bundled `ffmpeg-static` / `ffprobe-static`, environment-based DashScope config checks.

---

## Step Guard

This M starts with this step declaration:

```text
This step: M1 Protocol And Doctor Core
Spec sources: 06, 07, 12, 19, 20, 22
Hi-fi screen: none; M1 is non-UI infrastructure
Files to change: packages/protocol, packages/library-fs, packages/doctor-core, package.json, docs
Explicitly not doing: admin UI, cutter UI rebuild, Go service, Tauri shell, SQLite FTS
Acceptance: npm run typecheck; npm test; doctor report fixture tests; cutter catalog hides incomplete ready records
```

---

## Task 1: Protocol Manifest Validators

**Files:**

- Modify: `packages/protocol/src/types.ts`
- Modify: `packages/protocol/src/status.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/src/status.test.ts`

**Steps:**

- [x] Add failing tests proving:
  - `validateSourceVideoManifest` rejects non-ready visible records.
  - `validateSourceVideoManifest` rejects ready records with absolute/traversal artifact paths.
  - `validateSourceVideoManifest` accepts optional public metadata fields: `description`, `tags`, `lecturer`, `course`, `category`.
  - `validateLocalClipManifest` rejects invalid local clip ids, unsafe `media_path`, and invalid time ranges.
  - `validateExportClipManifest` rejects invalid export ids, unsafe `output_file`, invalid time ranges, and unknown cut modes.
- [x] Run:

```bash
node --test --import tsx packages/protocol/src/status.test.ts
```

Expected: new tests fail because validators/types do not exist yet.

- [x] Add protocol types:
  - `CutMode = "copy" | "smart" | "precise"`
  - `SourceVideoPublicMetadata`
  - `LocalClipManifest`
  - `ExportClipManifest`
- [x] Implement validators in `packages/protocol/src/status.ts`.
- [x] Export new types and validators from `packages/protocol/src/index.ts`.
- [x] Re-run the protocol test.

Expected: all protocol tests pass.

## Task 2: Cutter Ready Read Guard

**Files:**

- Modify: `packages/library-fs/src/cutter-source-library.ts`
- Test: `packages/library-fs/src/cutter-source-library.test.ts`

**Steps:**

- [x] Add failing test proving a manifest marked `ready + visible_to_cutters=true` is excluded from list/detail/search when transcript, SRT, keyframes, cover, or source media is missing.
- [x] Run:

```bash
node --test --import tsx packages/library-fs/src/cutter-source-library.test.ts
```

Expected: new test fails because list currently trusts ready metadata without checking artifact readability.

- [x] Add async cutter-readable guard:
  - protocol manifest validator must pass.
  - source video file must exist.
  - transcript, SRT, keyframes, and cover paths must be safe library-relative paths or resolvable portable paths.
  - required artifacts must exist as files.
- [x] Use the guard in list, detail, and search.
- [x] Re-run the cutter source library test.

Expected: all cutter source library tests pass.

## Task 3: Doctor Core Package

**Files:**

- Create: `packages/doctor-core/package.json`
- Create: `packages/doctor-core/src/index.ts`
- Create: `packages/doctor-core/src/index.test.ts`
- Modify: `package.json`
- Modify: `docs/spec-traceability.md`

**Steps:**

- [x] Add failing tests proving Doctor:
  - reports public root, `source-videos`, `.mixlab-library`, library counts, source manifests, current index, FFmpeg, FFprobe, and ASR config checks.
  - reports an incomplete ready video as a failure.
  - reports configured DashScope key without exposing the key value.
  - reports malformed local clips rather than silently losing them.
- [x] Run:

```bash
node --test --import tsx packages/doctor-core/src/index.test.ts
```

Expected: package or tests fail because Doctor Core does not exist yet.

- [x] Implement `runMixlabDoctor(input)` returning:

```ts
{
  schema_version: "1.0",
  generated_at: string,
  library_root: string,
  summary: { pass: number; warn: number; fail: number },
  checks: Array<{
    check_id: string;
    label: string;
    status: "pass" | "warn" | "fail";
    message: string;
    details?: Record<string, unknown>;
  }>
}
```

- [x] Ensure Doctor details contain booleans such as `dashscope_api_key_configured` rather than secret values.
- [x] Export Doctor types and function from `packages/doctor-core/src/index.ts`.
- [x] Re-run Doctor tests.

Expected: Doctor tests pass.

## Task 4: Library FS Local Clip Validation

**Files:**

- Modify: `packages/library-fs/src/local-clips.ts`
- Test: `packages/library-fs/src/local-clips.test.ts`

**Steps:**

- [x] Add failing tests proving `writeLocalClipManifest` rejects unsafe media paths and invalid local clip manifests through the shared protocol validator.
- [x] Run:

```bash
node --test --import tsx packages/library-fs/src/local-clips.test.ts
```

Expected: new tests fail if the writer does not call the shared validator.

- [x] Call `validateLocalClipManifest` before writing local clip manifests.
- [x] Re-run local clip tests.

Expected: local clip tests pass.

## Task 5: M1 Verification And Acceptance Record

**Files:**

- Create: `docs/acceptance/m1-protocol-doctor-core.md`
- Modify: `docs/spec-traceability.md`

**Steps:**

- [x] Update traceability statuses for M1 items that are now implemented.
- [x] Create M1 acceptance record with changed files, tests, and any known gaps.
- [x] Run:

```bash
npm run typecheck
npm test
```

Expected:

```text
typecheck: pass
npm test: pass
```

---

## Stop Conditions

Stop and report a blocker only if:

- A test cannot be made to fail for the intended reason.
- Doctor would need to transmit secrets or modify unrelated user files.
- A required behavior contradicts the specs.
- Full verification fails after the M1 implementation is complete.
