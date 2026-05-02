# MixLab V3 Spec-Driven Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver MixLab V3 as a two-end local/LAN product that follows `/Users/allen/Desktop/MixLab_V3_开发交付规格书` instead of evolving from ad hoc feature additions.

**Architecture:** Public-library JSON manifests and immutable ready indexes remain the system contract. The management end owns public-library writes, preprocessing, metadata, index publication, and diagnostics; the cutter end consumes only ready public assets and writes only to the cutter's local workspace. Current TypeScript code is treated as validated core/prototype code; production-facing UI and services must be brought back under the documented Apple-HIG product shape.

**Tech Stack:** TypeScript monorepo, Vite, React for formal frontends, Tauri for the cutter desktop shell, Go for the production-shaped management backend unless a written change request is accepted, SQLite WAL/FTS5 for persisted task/search state, FFmpeg/FFprobe bundled or configurable, DashScope Paraformer ASR through temporary upload storage.

---

## 0. Non-Negotiable Operating Rules

Every implementation step must start with this card before code changes:

```text
This step:
Spec sources:
Hi-fi screen:
Files to change:
Explicitly not doing:
Acceptance:
```

No step may proceed if it cannot name at least one source spec. UI work must name the exact hi-fi reference image:

- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/cutter-workbench-apple-hig.png`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/admin-console-apple-hig.png`

Each milestone must end with:

```bash
npm run typecheck
npm test
```

Frontend milestones must also end with:

```bash
npm run build:cutter-web
```

When `apps/admin-web` exists, frontend milestones must also run:

```bash
npm run build:admin-web
```

Formal UI acceptance always requires a browser screenshot review against `21_视觉与交互设计规范.md`. A working HTTP endpoint is not a UI acceptance substitute.

---

## 1. Current Baseline Classification

### 1.1 Validated And Keep

These are aligned with the specs and should be retained as core assets:

- `packages/protocol`: public protocol primitives.
- `packages/library-fs`: scanning, manifests, lifecycle, ready publisher, cutter visible read model, local clip metadata.
- `packages/search-core`: Chinese text normalization and grouped search behavior.
- `packages/ffmpeg-core`: cut/audio/cover/metadata command planning and bundled runtime detection.
- `packages/asr-core`: DashScope temporary upload, ASR submit/poll/result conversion, redaction.
- `packages/preprocess-core`: single and batch text preprocessing worker logic.
- `packages/cutter-api`: current local bridge for ready-only source library and local clips.

Evidence on 2026-05-02:

```bash
npm test
# pass 134, fail 0
```

### 1.2 Validated But Not Final Product Shape

These are useful development previews, not final deliverables:

- `apps/cutter-web`: currently validates source browsing, playback, transcript, one-click local clip creation, and local clips. It does not yet satisfy the full Apple-HIG cutter workbench,待剪清单,剪切队列,设置, or video-document interaction model.
- `scripts/workers/preprocess-library-worker.ts`: production-shaped prototype. It proves the flow but still needs management-end task orchestration, logs, retry control, and UI integration.
- `scripts/workers/publish-ready-worker.ts`: production-shaped prototype. It needs management-end index publication controls and diagnostics integration.

### 1.3 Not Yet Delivered

These are required by the specs and remain formal work:

- Material management end UI and API.
- Formal Apple-HIG cutter workbench UI.
- Public metadata editing: cover, tags, description, lecturer, course, category.
- Cutter 待剪清单 as a first-class persisted model.
- Cutter 剪切队列 as an async local queue.
- Export `export-clip.json` parity with `07_数据模型与Manifest.md`.
- Admin Doctor diagnostics and exportable report.
- SQLite WAL/FTS5 production index/task persistence.
- Tauri desktop shell and local file/folder actions.
- Go management backend parity or written change request.
- Stage acceptance reports from `14_验收标准与测试剧本.md`.

---

## 2. Spec Traceability Map

| Track | Source Specs | Current State | Required End State |
|---|---|---|---|
| Product boundary | `00`, `01`, `02`, `15` | Mostly understood, not enforced in plan gates | No scope outside first-version search/read/select/cut/reuse flow |
| Deployment | `03`, `12`, `13` | Path core tests exist | Mobile disk, Mac mini SMB, Windows path, NAS stages tested in order |
| Architecture | `04`, `05`, `18` | TS services exist; Go/Tauri not yet formalized | API boundary stable; final desktop/runtime approach documented and implemented |
| Public library | `06`, `07`, `19`, `20` | Strong core implementation | Manifest validation, ready publication, immutable index, and doctor checks complete |
| Management end | `08`, `18`, `21`, `22` | Not started as product UI | Apple-HIG admin console with dashboard/settings/videos/tasks/index/doctor/settings |
| Cutter end | `09`, `10`, `11`, `18`, `21` | Engineering preview exists | Apple-HIG cutter workbench with public library/search/queue/local library/settings |
| Acceptance | `14`, `16` | Unit tests exist | Scripted stage reports, screenshots, and delivery artifacts |

---

## 3. Revised Milestones

### M0R: Re-Baseline And Plan Freeze

**Goal:** Stop ad hoc development and make the specs executable.

**Spec sources:** `00`, `13`, `14`, `16`, `20`, `21`

**Files:**

- Create: `docs/superpowers/plans/2026-05-02-mixlab-v3-spec-driven-delivery.md`
- Create: `docs/spec-traceability.md`
- Create: `docs/acceptance/stage-0-rebaseline.md`
- Modify: `README.md`

**Steps:**

- [ ] Create this delivery plan.
- [ ] Create `docs/spec-traceability.md` with requirement IDs for admin, cutter, protocol, preprocessing, deployment, and acceptance.
- [ ] Mark every current implemented capability as `validated-core`, `preview-ui`, or `not-delivered`.
- [ ] Add a README section named `Spec-Driven Development Rules` that points to this plan and the traceability file.
- [ ] Run:

```bash
npm run typecheck
npm test
```

**Acceptance:**

- No new feature work begins until `docs/spec-traceability.md` exists.
- Every next milestone references requirement IDs from `docs/spec-traceability.md`.

### M1: Protocol And Runtime Hardening

**Goal:** Finish the non-UI contract layer so management and cutter UI can be built without reinterpreting rules.

**Spec sources:** `06`, `07`, `12`, `19`, `20`, `22`

**Files:**

- Modify: `packages/protocol/src/index.ts`
- Modify: `packages/library-fs/src/*.ts`
- Modify: `packages/preprocess-core/src/*.ts`
- Modify: `packages/ffmpeg-core/src/index.ts`
- Create: `packages/doctor-core/src/index.ts`
- Create: `packages/doctor-core/src/index.test.ts`
- Modify: `package.json`

**Steps:**

- [ ] Add missing manifest validators for `export-clip.json`, local clip metadata, and management public metadata fields.
- [ ] Add derived-state checks: `ready` implies searchable artifacts exist; non-ready implies `visible_to_cutters=false`.
- [ ] Add Doctor core checks for path readability, public-library write boundary, manifest validity, index current pointer, FFmpeg/FFprobe, DashScope config redaction, and state counts.
- [ ] Add tests proving malformed ready records are reported by Doctor and are not shown to cutters.
- [ ] Add tests proving public-library absolute paths are not written into portable manifests.
- [ ] Run:

```bash
npm run typecheck
npm test
```

**Acceptance:**

- Doctor core can produce a JSON report without UI.
- Cutter-visible catalog still contains only `ready + visible_to_cutters=true`.
- No cutter-local feature writes into the public library.

### M2: Management End Backend And API

**Goal:** Create the management control plane before building the formal admin UI.

**Spec sources:** `04`, `05`, `08`, `18`, `19`, `22`

**Files:**

- Create: `apps/admin-service-go/README.md`
- Create: `apps/admin-service-go/cmd/mixlab-admin/main.go`
- Create: `apps/admin-service-go/internal/api/*.go`
- Create: `apps/admin-service-go/internal/library/*.go`
- Create: `apps/admin-service-go/internal/jobs/*.go`
- Create: `apps/admin-service-go/internal/doctor/*.go`
- Create: `apps/admin-service-go/internal/config/*.go`
- Modify: `package.json`
- Create: `scripts/servers/admin-api-dev.ts` only as a temporary adapter if Go parity needs staged migration.

**Steps:**

- [ ] Implement admin status API: public library counts, current index version, disk summary, active jobs.
- [ ] Implement library initialize and scan API.
- [ ] Implement source video list/detail/update-metadata API.
- [ ] Implement preprocessing start/pause/retry API with a single writer queue.
- [ ] Implement ready publication API.
- [ ] Implement Doctor API returning exportable JSON.
- [ ] Implement secret-safe ASR config read/write flow. API keys must not appear in logs, screenshots, or Doctor output.
- [ ] Add integration tests for API responses against fixture libraries.

**Acceptance:**

- Admin service can operate a fixture library without using the cutter API.
- Failed preprocessing records readable error messages and does not stop later videos.
- API contract matches `18_API接口草案.md` or has a documented spec change request.

### M3: Formal UI Foundation

**Goal:** Establish the shared Apple-HIG visual system before rebuilding either product UI.

**Spec sources:** `21`

**Files:**

- Create: `packages/ui-foundation/package.json`
- Create: `packages/ui-foundation/src/tokens.css`
- Create: `packages/ui-foundation/src/layout.css`
- Create: `packages/ui-foundation/src/components.tsx`
- Create: `packages/ui-foundation/src/index.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`

**Steps:**

- [ ] Add macOS window chrome primitives, translucent sidebar, unified toolbar, inspector, segmented control, grouped form, gallery grid, source table, status row, and media panel primitives.
- [ ] Encode the forbidden UI patterns from `21_视觉与交互设计规范.md`: no marketing hero, no heavy dashboard cards, no pure table public source library, no sentence waterfall search.
- [ ] Add visual fixture pages for cutter and admin using fake data.
- [ ] Run browser screenshot checks at 1536x1024 against both hi-fi images.

**Acceptance:**

- Formal UI starts from reusable primitives, not one-off CSS.
- The cutter and admin pages share visual language but keep different information priorities.

### M4: Formal Cutter Workbench

**Goal:** Replace the engineering preview with the full cutter workbench shape from the hi-fi reference.

**Spec sources:** `09`, `10`, `11`, `18`, `21`

**Hi-fi:** `assets/ui/cutter-workbench-apple-hig.png`

**Files:**

- Replace or migrate: `apps/cutter-web/src/main.ts`
- Replace or migrate: `apps/cutter-web/src/styles.css`
- Modify: `apps/cutter-web/src/api.ts`
- Create: `apps/cutter-web/src/app/*.tsx`
- Create: `apps/cutter-web/src/state/*.ts`
- Create: `apps/cutter-web/src/features/public-library/*.tsx`
- Create: `apps/cutter-web/src/features/source-detail/*.tsx`
- Create: `apps/cutter-web/src/features/search/*.tsx`
- Create: `apps/cutter-web/src/features/cut-list/*.tsx`
- Create: `apps/cutter-web/src/features/local-library/*.tsx`
- Create: `apps/cutter-web/src/features/cut-queue/*.tsx`
- Create: `apps/cutter-web/src/features/settings/*.tsx`
- Modify: `apps/cutter-web/package.json`

**Steps:**

- [ ] Migrate formal UI to React + TypeScript + Vite.
- [ ] Implement six independent pages: 公共原素材库, 搜索与文案, 待剪清单, 本地素材库, 剪切队列, 设置.
- [ ] Public library page must be gallery-first, ready-only, and use admin-configured cover/tags/description.
- [ ] Source detail page must show video, complete transcript, highlights, continuous segment selection, and right inspector.
- [ ] Search page must group by source video and open full transcript context.
- [ ] Cut list must persist segment spans and allow reorder/delete/clear/submit.
- [ ] Cut queue must run local jobs without blocking search.
- [ ] Local library must search/open/reuse exported local clips.
- [ ] Settings must show public library mount path, local workspace path, FFmpeg status, default cut mode, local concurrency, and Doctor entry.
- [ ] Screenshot check each of the six hi-fi panels at 1536x1024.

**Acceptance:**

- The public source library is not a backend dashboard.
- Search result shape is not a sentence waterfall.
- Cutting a continuous multi-sentence selection creates one segment span.
- Cutter does not write to the public library.

### M5: Formal Management Console

**Goal:** Build the admin product that governs public assets, preprocessing, indexes, and health.

**Spec sources:** `08`, `18`, `19`, `21`, `22`

**Hi-fi:** `assets/ui/admin-console-apple-hig.png`

**Files:**

- Create: `apps/admin-web/package.json`
- Create: `apps/admin-web/index.html`
- Create: `apps/admin-web/tsconfig.json`
- Create: `apps/admin-web/src/api.ts`
- Create: `apps/admin-web/src/main.tsx`
- Create: `apps/admin-web/src/app/*.tsx`
- Create: `apps/admin-web/src/features/dashboard/*.tsx`
- Create: `apps/admin-web/src/features/library-settings/*.tsx`
- Create: `apps/admin-web/src/features/source-videos/*.tsx`
- Create: `apps/admin-web/src/features/preprocess-jobs/*.tsx`
- Create: `apps/admin-web/src/features/index-publish/*.tsx`
- Create: `apps/admin-web/src/features/doctor/*.tsx`
- Create: `apps/admin-web/src/features/settings/*.tsx`
- Modify: `package.json`

**Steps:**

- [ ] Implement dashboard with restrained counts: total, ready, processing, queued, unprocessed, failed, index-required, disk usage, active task, index version.
- [ ] Implement public library settings with root path, source-videos path, `.mixlab-library` path, library id, protocol version, path checks, permission checks.
- [ ] Implement source video management with cover, filename, relative path, duration, status, cutter visibility, tags, description, lecturer, course, category.
- [ ] Implement preprocessing jobs with active, queued, completed, failed/retry, stage, log path, error reason.
- [ ] Implement index publication page with current pointer, historical versions, ready count, schema version, validation result, atomic current switch.
- [ ] Implement Doctor page with JSON export and readable warnings/errors.
- [ ] Implement ASR settings page with provider, model, audio mode, key configured status, last failure reason, and redacted diagnostics.
- [ ] Screenshot check against all six admin hi-fi panels at 1536x1024.

**Acceptance:**

- Admin owns public metadata needed by the cutter gallery.
- Admin clearly distinguishes ready, failed, and index-required.
- Admin can show that one failed video does not block later preprocessing.

### M6: Search, SQLite, And Index Productionization

**Goal:** Replace preview in-memory search with a production-shaped indexed read model.

**Spec sources:** `05`, `10`, `18`, `20`

**Files:**

- Create: `packages/search-sqlite/package.json`
- Create: `packages/search-sqlite/src/index.ts`
- Create: `packages/search-sqlite/src/index.test.ts`
- Modify: `packages/library-fs/src/ready-publisher.ts`
- Modify: `packages/cutter-api/src/index.ts`
- Modify: `apps/admin-service-go/internal/search/*.go`

**Steps:**

- [ ] Build SQLite WAL fixture database from ready transcript index packages.
- [ ] Add FTS5 or n-gram indexing for Chinese transcript search.
- [ ] Preserve punctuation-insensitive matching and original-text display.
- [ ] Keep grouped-by-video result shape.
- [ ] Add tests proving unprocessed, queued, processing, failed, and index-required videos are absent from search.

**Acceptance:**

- A cutter refresh sees newly ready videos without full application restart.
- Search returns source groups with transcript anchors and context.

### M7: Local Cutting, Queue, And Export Manifests

**Goal:** Make cutter-side local output match the specs, not only one-click preview clipping.

**Spec sources:** `07`, `09`, `11`, `14`, `21`

**Files:**

- Modify: `packages/library-fs/src/local-clips.ts`
- Create: `packages/cutter-local/src/cut-list.ts`
- Create: `packages/cutter-local/src/cut-queue.ts`
- Create: `packages/cutter-local/src/export-manifest.ts`
- Create: `packages/cutter-local/src/*.test.ts`
- Modify: `packages/cutter-api/src/index.ts`
- Modify: `apps/cutter-web/src/features/cut-list/*.tsx`
- Modify: `apps/cutter-web/src/features/cut-queue/*.tsx`
- Modify: `apps/cutter-web/src/features/local-library/*.tsx`

**Steps:**

- [ ] Persist cut-list rows separately from completed local clips.
- [ ] Submit rows to async cut queue with pending/running/done/failed/retry.
- [ ] Generate `export-clip.json` for every completed export.
- [ ] Keep search and source browsing usable while queue runs.
- [ ] Add open-file and open-folder hooks for Tauri desktop shell.

**Acceptance:**

- `14_验收标准与测试剧本.md` sections 6 and 7 pass.
- Export output is traceable to source video, segment ids, time range, selected text, cut mode, and generated file path.

### M8: Desktop Shell And Runtime Distribution

**Goal:** Turn development web previews into installable local products.

**Spec sources:** `03`, `05`, `11`, `12`, `13`, `22`

**Files:**

- Create: `apps/cutter-desktop/src-tauri/*`
- Create: `apps/admin-desktop/README.md` or documented admin packaging path.
- Modify: `apps/cutter-web/src/features/settings/*.tsx`
- Modify: `packages/ffmpeg-core/src/index.ts`
- Create: `docs/runtime/ffmpeg-distribution.md`
- Create: `docs/runtime/dashscope-asr.md`

**Steps:**

- [ ] Package cutter workbench in Tauri for macOS.
- [ ] Add secure local commands for FFmpeg execution, opening files/folders, and path checks.
- [ ] Bundle or locate FFmpeg/FFprobe and show status in settings.
- [ ] Document admin runtime packaging and service startup/shutdown.
- [ ] Ensure API keys are stored outside git and are redacted in logs and diagnostics.

**Acceptance:**

- A non-technical cutter can launch the app and pass connection checks.
- The app does not require manual FFmpeg installation.

### M9: Stage Acceptance On Mobile Disk And Mac Mini

**Goal:** Prove the first real deployment route before Windows or NAS.

**Spec sources:** `03`, `13`, `14`, `16`

**Files:**

- Create: `docs/acceptance/stage-1-single-mac-mobile-disk.md`
- Create: `docs/acceptance/stage-2-mac-mini-mobile-disk.md`
- Create: `scripts/acceptance/run-stage-1.ts`
- Create: `scripts/acceptance/run-stage-2.ts`

**Steps:**

- [ ] Run management initialization test.
- [ ] Run at least 3-video preprocessing test.
- [ ] Run cutter connection test.
- [ ] Run 10-video incremental visibility test.
- [ ] Run search/document test.
- [ ] Run continuous selection and cutting test.
- [ ] Run local export reuse test.
- [ ] Record screenshots, command outputs, video counts, and failures.

**Acceptance:**

- Stage 1 and Stage 2 reports exist.
- Reports include pass/fail status for every section of `14_验收标准与测试剧本.md` that applies before Windows/NAS.

### M10: Team Trial, Windows, NAS, And Stability

**Goal:** Follow the later spec stages only after mobile-disk trial is accepted.

**Spec sources:** `03`, `12`, `13`, `14`, `16`, `17`

**Files:**

- Create: `docs/acceptance/stage-3-team-trial.md`
- Create: `docs/acceptance/stage-4-windows-cutter.md`
- Create: `docs/acceptance/stage-5-nas-final.md`
- Create: `docs/ops/backup-and-restore.md`
- Create: `docs/ops/troubleshooting.md`

**Steps:**

- [ ] Run at least 3 real cutter trials and collect timing metrics.
- [ ] Build and test Windows cutter with drive-letter, UNC, Chinese path, and FFmpeg checks.
- [ ] Move from mobile disk to NAS only after the cutter team accepts the flow.
- [ ] Verify NAS SMB permissions and multi-user search/cut.
- [ ] Add operational backup, restore, log export, and troubleshooting docs.

**Acceptance:**

- No NAS stage starts before team trial approval.
- Switching mobile disk to NAS changes only path configuration, not data structure or code.

---

## 4. Immediate Next Execution Order

The next five implementation units must happen in this order:

1. M0R traceability and README guardrails.
2. M1 Doctor core and missing manifest validation.
3. M3 UI foundation.
4. M5 management console MVP, because the admin end owns public metadata and preprocessing control.
5. M4 formal cutter workbench rebuild, using the existing cutter API but replacing the preview UI shape.

This order intentionally pauses feature additions to the current preview UI.

---

## 5. Stop Conditions

Stop and re-plan before coding if any of the following occur:

- A proposed feature cannot map to a spec file and section.
- A UI step cannot map to one of the two hi-fi reference images.
- A step would make cutter write public-library files.
- A step exposes non-ready videos to cutter list/search/detail.
- A step stores public-library absolute paths in portable manifests.
- A step changes technology stack or milestone order without a written change request.
- A test or screenshot reveals traditional dashboard styling in the cutter workbench.

---

## 6. Reporting Format From Now On

Every progress report must include:

```text
Milestone:
Spec IDs touched:
Files changed:
Tests/screenshots run:
What is accepted:
What remains:
Deviation from specs:
```

If there is no deviation, write:

```text
Deviation from specs: none found in this step.
```

