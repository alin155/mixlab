# M6 Search SQLite Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace cutter search's preview in-memory scan with a production-shaped SQLite/n-gram read model that follows the immutable `current.json` index package contract.

**Architecture:** Add a new `@mixlab/search-sqlite` package that builds a single-file SQLite source transcript index from ready source videos and searches it with normalized text plus n-gram candidate narrowing. Update ready publication to write real SQLite bytes into versioned index packages, and update cutter library search to read the current SQLite index while still filtering results through ready-only manifest/artifact visibility.

**Tech Stack:** TypeScript, Node `node:sqlite` `DatabaseSync`, JSON manifests, existing `@mixlab/protocol`, `@mixlab/library-fs`, `@mixlab/cutter-api`, `node:test`.

---

## Scope Guard

This step is **M6 Search, SQLite, And Index Productionization**.

Spec sources:
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/05_技术栈选型.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/10_搜索与文案阅读器规格.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/18_API接口草案.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/20_开发落地路线与技术护栏.md`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/19_增量预处理与可见性规则.md`

Traceability IDs:
- `ARCH-002`
- `LIB-003`
- `LIB-004`
- `LIB-006`
- `LIB-007`
- `CUTTER-004`
- `ACC-004`
- `ACC-005`

Explicitly not doing in M6:
- M7 local cutting queue, export execution, or `export-clip.json`.
- Go admin backend search package. The current repo has no Go service yet; the TypeScript core read model is the authoritative stepping stone.
- Semantic search, AI recommendation, vector database, or fuzzy expansion.
- New UI surfaces; M4/M5 visual screenshots are re-run only as regression checks.

Acceptance commands:
- `npm run typecheck`
- `npm test`
- `npm run build:cutter-web`
- `npm run build:admin-web`
- `npm run build:ui-fixtures`
- `npm run visual:ui-foundation`
- `npm run visual:admin-web`
- `npm run visual:cutter-web`

## File Structure

Create:
- `packages/search-sqlite/package.json` - workspace package metadata.
- `packages/search-sqlite/src/index.ts` - SQLite index builder, metadata reader, n-gram search.
- `packages/search-sqlite/src/index.test.ts` - TDD coverage for SQLite build/search behavior.
- `packages/library-fs/src/search-sqlite-integration.test.ts` - ready publication and cutter refresh integration.
- `docs/acceptance/m6-search-sqlite-index.md` - M6 acceptance record.

Modify:
- `packages/library-fs/package.json` - depend on `@mixlab/search-sqlite`.
- `packages/library-fs/src/index.ts` - build real `index.sqlite` bytes during ready publication and expose current index path helpers.
- `packages/library-fs/src/cutter-source-library.ts` - search current SQLite package first and keep ready-only visibility filtering.
- `packages/library-fs/src/ready-publisher.test.ts` - assert the published index is searchable SQLite.
- `packages/cutter-api/src/index.test.ts` - keep API search green through the SQLite-backed path.
- `package-lock.json` - workspace metadata after `npm install`.
- `README.md` - document SQLite-backed cutter search.
- `docs/spec-traceability.md` - update M6-related statuses.

## Task 1: Plan Lock

**Files:**
- Create: `docs/superpowers/plans/2026-05-02-m6-search-sqlite-index.md`

- [x] **Step 1: Save this implementation plan**

The plan fixes M6 scope and prevents drifting into M7 queue/export work.

## Task 2: SQLite Search Package Tests

**Files:**
- Create: `packages/search-sqlite/src/index.test.ts`
- Create later: `packages/search-sqlite/src/index.ts`

- [x] **Step 1: Write failing tests**

Tests must cover:
- Building a SQLite index file from ready transcript inputs.
- Reading index metadata.
- Searching with punctuation-insensitive normalized query.
- Returning grouped source-video results with original text and match ranges.
- Chinese n-gram candidate narrowing while preserving single-character query support.

- [x] **Step 2: Run RED**

Run: `node --test --import tsx packages/search-sqlite/src/index.test.ts`

Expected: FAIL because `packages/search-sqlite/src/index.ts` does not exist.

## Task 3: SQLite Search Package Implementation

**Files:**
- Create: `packages/search-sqlite/package.json`
- Create: `packages/search-sqlite/src/index.ts`
- Modify: `package-lock.json`

- [x] **Step 1: Implement schema and builder**

Schema:
- `metadata(key text primary key, value text not null)`
- `source_videos(position integer, source_video_id text primary key, title text, duration_ms integer, relative_path text, cover_path text)`
- `segments(source_video_id text, segment_id text primary key, segment_index integer, begin_ms integer, end_ms integer, text text, normalized_text text)`
- `segment_ngrams(gram text, segment_id text, source_video_id text)`

- [x] **Step 2: Implement search**

Search normalizes the query with `normalizeTranscriptText`, uses the first query gram for candidate narrowing when possible, verifies `instr(normalized_text, normalized_query) > 0`, then returns the existing grouped result shape.

- [x] **Step 3: Run GREEN**

Run: `node --test --import tsx packages/search-sqlite/src/index.test.ts`

Expected: PASS.

## Task 4: Ready Publisher Integration Tests

**Files:**
- Create: `packages/library-fs/src/search-sqlite-integration.test.ts`
- Modify later: `packages/library-fs/src/index.ts`
- Modify later: `packages/library-fs/src/cutter-source-library.ts`

- [x] **Step 1: Write failing integration tests**

Tests must cover:
- `publishIndexRequiredSourceVideos` writes a real searchable SQLite index package.
- A second publish switches `current.json` and cutter search sees the new ready video without restarting the caller.
- Hidden `index-required` or incomplete videos remain absent from search.

- [x] **Step 2: Run RED**

Run: `node --test --import tsx packages/library-fs/src/search-sqlite-integration.test.ts`

Expected: FAIL because ready publisher still writes JSON placeholder bytes.

## Task 5: Library FS And Cutter Search Integration

**Files:**
- Modify: `packages/library-fs/package.json`
- Modify: `packages/library-fs/src/index.ts`
- Modify: `packages/library-fs/src/cutter-source-library.ts`
- Modify: `packages/library-fs/src/ready-publisher.test.ts`
- Modify: `packages/cutter-api/src/index.test.ts`

- [x] **Step 1: Build SQLite bytes during ready publication**

Collect all source videos that will be ready in the new package, read each transcript, and call `createSourceTranscriptSqliteIndexBytes`.

- [x] **Step 2: Search via current SQLite package**

Add `resolveCurrentSourceTranscriptIndexFilePath(libraryRoot)` and call `searchSourceTranscriptSqliteIndex`.

- [x] **Step 3: Keep visibility filtering**

Build a map of currently cutter-readable ready cards and drop any SQLite result whose source id is not currently visible. This protects stale indexes and missing artifacts.

- [x] **Step 4: Preserve development fallback**

If no `current.json`/`index.sqlite` exists, use the old in-memory implementation so old tests and hand-built fixture libraries remain debuggable. Published ready workflows must use SQLite.

- [x] **Step 5: Run integration GREEN**

Run: `node --test --import tsx packages/library-fs/src/search-sqlite-integration.test.ts packages/library-fs/src/cutter-source-library.test.ts packages/cutter-api/src/index.test.ts`

Expected: PASS.

## Task 6: Documentation, Traceability, And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/spec-traceability.md`
- Create: `docs/acceptance/m6-search-sqlite-index.md`

- [x] **Step 1: Document behavior**

README must state that ready publication writes a versioned SQLite transcript index and cutter search reads the current package, with in-memory fallback only for legacy fixtures.

- [x] **Step 2: Update traceability**

Mark M6 SQLite read model as accepted/partial where appropriate:
- `LIB-004` partial or accepted if incremental ready refresh test passes.
- `CUTTER-004` remains accepted with stronger backend evidence.
- `ACC-004` partial.
- `ACC-005` partial/accepted for automated search/document core behavior, not full manual acceptance.

- [x] **Step 3: Add acceptance record**

Include scope, commands, and known deferrals.

- [x] **Step 4: Run full verification**

Run all acceptance commands listed in this plan.

- [x] **Step 5: Stage, secret-check, commit**

Run:
```bash
git add .
git diff --cached --name-only | rg '(^|/)\\.env|\\.local|secret|key' || true
git commit -m "feat: add M6 sqlite search index"
```

Expected: no secret files staged and commit succeeds.

## Self-Review

Spec coverage:
- SQLite/n-gram search read model maps to `05` and `20`.
- Grouped source-video search maps to `10` and `18`.
- Ready-only visibility maps to `10`, `19`, and `20`.
- Current index package refresh maps to `20`.

Intentional gaps:
- Go admin backend search package is deferred because the Go backend is not created yet.
- Full transcript UI highlighter remains M4/M7 polish; M6 returns original text and normalized match ranges for UI use.
- M7 queue/export work is out of scope.

Placeholder scan:
- No placeholder acceptance criteria.
- No unowned files.

Type consistency:
- `@mixlab/search-sqlite` returns the same `TranscriptSearchResult`/group shape as `@mixlab/search-core`, so `library-fs` and `cutter-api` do not need response shape changes.
