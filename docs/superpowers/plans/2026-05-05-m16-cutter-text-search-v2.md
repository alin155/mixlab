# M16 Cutter Text Search V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade cutter search from segment-only exact matching to natural transcript matching that supports cross-segment long text and ASR-tolerant original-text matching.

**Architecture:** Add a focused transcript matching layer in `packages/search-core` that works on full normalized transcript text while preserving segment/time mapping. Reuse that layer from SQLite search and fallback artifact search, then keep cutter UI consuming the existing grouped result shape.

**Tech Stack:** TypeScript, Node test runner, `node:sqlite`, existing MixLab protocol/search/library packages.

---

### Task 1: Search Core Natural Transcript Matching

**Files:**
- Modify: `packages/search-core/src/index.ts`
- Test: `packages/search-core/src/search.test.ts`

- [ ] Write failing tests for:
  - A long query spanning two adjacent transcript segments returns one grouped video and both covered segments.
  - A 10-character query with one ASR-style wrong character still matches.
  - A 4-character query with one wrong character does not match.
  - More relevant results sort before weaker matches.
- [ ] Implement `searchTranscripts` using full-video normalized text instead of per-segment-only matching.
- [ ] Preserve `hit_segments`, `match_ranges`, `best_excerpt`, and `hit_count` so existing consumers keep working.

### Task 2: SQLite Search Uses the Same Matcher

**Files:**
- Modify: `packages/search-sqlite/src/index.ts`
- Test: `packages/search-sqlite/src/index.test.ts`

- [ ] Write failing tests for cross-segment and tolerant matching against a real SQLite index.
- [ ] Read candidate source videos from the SQLite index with their ordered segments.
- [ ] Reuse `searchTranscripts` for result generation and ranking.

### Task 3: Library Search Keeps Public Visibility and Enrichment

**Files:**
- Modify: `packages/library-fs/src/cutter-source-library.ts`
- Test: `packages/library-fs/src/search-sqlite-integration.test.ts`
- Test: `packages/library-fs/src/cutter-source-library.test.ts`

- [ ] Add integration tests proving published public videos can be found by cross-segment long text and tolerant text.
- [ ] Keep ready/public visibility filtering and enrichment with cover paths and transcript character count.
- [ ] Ensure fallback artifact search uses the same matching behavior.

### Task 4: Cutter Web Local/Public Search Consistency

**Files:**
- Modify: `apps/cutter-web/src/state/material-locator.ts`
- Test: `apps/cutter-web/src/cutter-state.test.ts`

- [ ] Add tests showing local material search uses the same normalization and tolerant matching principles for selected text.
- [ ] Keep local materials grouped above public materials.
- [ ] Keep the existing candidate/result UI shape.

### Task 5: Verification and Runtime Restart

**Files:**
- No code changes expected.

- [ ] Run focused tests for `search-core`, `search-sqlite`, `library-fs`, and cutter state.
- [ ] Run cutter web tests and `npm run typecheck`.
- [ ] Restart the local cutter/admin services if compiled server code changed.
- [ ] Report exactly what is ready for user testing.
