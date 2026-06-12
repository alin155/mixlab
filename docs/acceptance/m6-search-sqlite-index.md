# M6 Search SQLite Index Acceptance Record

Date: 2026-05-02
Updated: 2026-06-03

## Scope

This milestone productionizes the cutter search read model by replacing per-search preview transcript scanning with a versioned SQLite/n-gram source transcript index.

Spec sources:

- `05_技术栈选型.md`
- `10_搜索与文案阅读器规格.md`
- `18_API接口草案.md`
- `19_增量预处理与可见性规则.md`
- `20_开发落地路线与技术护栏.md`

Traceability IDs:

- `ARCH-002`
- `LIB-003`
- `LIB-004`
- `LIB-006`
- `LIB-007`
- `CUTTER-004`
- `ACC-004`
- `ACC-005`

## Implemented

- New `@mixlab/search-sqlite` package.
- SQLite schema for source videos, transcript segments, metadata, and segment n-grams.
- Punctuation-insensitive Chinese search using normalized text, n-gram candidate narrowing, and exact normalized verification.
- Grouped source-video search result shape compatible with the existing cutter API contract.
- Ready publication now writes real `index.sqlite` bytes into immutable `source-transcript-index/v000xxx/`.
- Cutter search reads `.mixlab-library/indexes/source-transcript-index/current.json` and switches to the current SQLite package per request.
- Cutter search still filters SQLite hits through current ready/artifact visibility so stale or broken records remain hidden.
- Legacy in-memory fallback is kept only for hand-built fixture libraries without a current index package.

## Explicitly Not Implemented In M6

- M7 local cutting queue, export execution, and `export-clip.json`.
- Go admin backend search package, because the Go service does not exist yet.
- Semantic/vector search or AI recommendation.
- New UI surfaces.

## Verification Commands

```bash
node --test --import tsx packages/search-sqlite/src/index.test.ts
node --test --import tsx packages/library-fs/src/search-sqlite-integration.test.ts packages/library-fs/src/cutter-source-library.test.ts packages/cutter-api/src/index.test.ts
node --test --import tsx packages/library-fs/src/ready-publisher.test.ts
npm run typecheck
npm test
npm run build:cutter-web
npm run build:admin-web
npm run build:ui-fixtures
npm run visual:ui-foundation
npm run visual:admin-web
npm run visual:cutter-web
npm run smoke:searchd-concurrency
npm run smoke:searchd-scale
```

Result:

- `node --test --import tsx packages/search-sqlite/src/index.test.ts`: passed.
- `node --test --import tsx packages/library-fs/src/search-sqlite-integration.test.ts packages/library-fs/src/cutter-source-library.test.ts packages/cutter-api/src/index.test.ts`: passed.
- `node --test --import tsx packages/library-fs/src/ready-publisher.test.ts`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed, 598/598 tests.
- `npm run smoke:searchd-concurrency`: passed; 50 active editors completed search, full transcript detail, transcript selection, cut submission, and local clip creation across 50 public source videos with p95 search 115.4ms, detail 96.8ms, and cut submit 130.6ms against 1,500ms SLAs.
- `npm run smoke:searchd-scale`: passed; 2,000 indexed source videos / 48,000 transcript segments stayed under SLA with p95 Cutter API search 558.5ms, searchd internal search 118ms, detail 7ms, and direct full-transcript location check 1.5ms search / 2.8ms detail.
- `npm run build:cutter-web`: passed.
- `npm run build:admin-web`: passed.
- `npm run build:ui-fixtures`: passed.
- `npm run visual:ui-foundation`: passed and regenerated M3 screenshots.
- `npm run visual:admin-web`: passed and regenerated M5 screenshots.
- `npm run visual:cutter-web`: passed and regenerated M4 screenshots.

## Acceptance Criteria

- Ready publication produces a real SQLite transcript index package.
- `current.json` switch makes newly ready videos searchable without restarting the cutter caller.
- Search results include only cutter-visible ready videos.
- Search returns grouped source-video results with original transcript text and normalized match ranges.
- Hidden `index-required`, unprocessed, processing, queued, or failed videos do not appear in search.
- 50-editor concurrency smoke stays under the product latency budget for search, full transcript detail, selection, and cut submission.
- Large-index smoke locates a keyword inside a full transcript from thousands of source materials without leaving the searchd API boundary.

## Known Remaining Work

- The future Go management backend should use the same SQLite schema/contract or document a compatible migration.
- Full document-reader UI highlight navigation remains a later cutter polish task.
