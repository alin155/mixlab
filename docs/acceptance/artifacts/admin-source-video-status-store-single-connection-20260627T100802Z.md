# Admin Source Video Status Store Single Connection 2026-06-27T10:08Z

## Scope

R.240 optimizes the `status_store_page` component identified by R.239 for `/api/admin/source-videos` status lists.

This is a GET read-path optimization. It does not mutate NAS data, rebuild the read model, deploy Docker, change list result semantics, or alter Cutter protocols.

## Implementation

- `packages/admin-api/src/admin-read-model-store.ts`
  - `readAdminSourceVideoStatusesPageFromStoreWithReadiness(...)` now opens `admin.sqlite` once and uses the same connection for metadata/freshness and page rows.
  - It reuses the shared `statusFromMetadata(...)` freshness contract.
  - It preserves existing miss reasons and freshness semantics:
    - `unsupported-status`
    - `store-not-fresh`
    - `incomplete-manifest-rows`
    - `unreadable-store`

## Performance Evidence

Before R.240: `admin-real-nas-performance-20260627T100455Z`
After R.240: `admin-real-nas-performance-20260627T100802Z`

| endpoint | before p95 | after p95 | status_store_page before avg | status_store_page after avg | change |
| --- | ---: | ---: | ---: | ---: | ---: |
| `source_videos_processing` | `67.6ms` | `69.1ms` | `66.5ms` | `67.0ms` | `-0.5ms` |
| `source_videos_index_required` | `222.6ms` | `189.5ms` | `219.5ms` | `186.5ms` | `+33.0ms` |
| `source_videos_queued` | `177.8ms` | `145.8ms` | `172.0ms` | `142.0ms` | `+30.0ms` |
| `source_videos_failed` | `72.2ms` | `74.0ms` | `69.0ms` | `69.5ms` | `-0.5ms` |

The improvement is meaningful for populated status lists (`index-required`, `queued`) and mostly neutral for empty lists (`processing`, `failed`), which are already dominated by fixed SQLite/SMB read overhead.

## Verification

```text
node --test --import tsx packages/admin-api/src/admin-read-model-store.test.ts packages/admin-api/src/admin-source-video-status-page-query.test.ts packages/admin-api/src/admin-source-video-routes.test.ts packages/admin-api/src/admin-source-video-read-facade.test.ts
```

Result: `58` tests passed.

```text
npm run typecheck
```

Result: passed.

```text
npm run validate:admin-real-nas-performance-isolated
```

Result: passed. Artifact: `admin-real-nas-performance-isolated-20260627T100801Z`; runtime component contracts all passed.

```text
npm run audit:admin-redundancy-governance
```

Result: governance audit generated `admin-redundancy-governance-audit-20260627T100834Z`; broad cleanup remains blocked as expected.

## Remaining Gaps

- `status_store_page` is still the dominant source-video status-list component.
- If lower repeated-read latency is required, the next slice should evaluate an explicit short-TTL read-model page cache with write-through invalidation semantics.
- Dashboard `production_summary` remains a separate Query optimization candidate.
- This does not complete route-loader restructuring, Protection Gate coverage, UI IA, redundancy cleanup, Docker release gates, or full Admin Architecture v1.
