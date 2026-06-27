# Admin Source Videos Runtime Components 2026-06-27T10:04Z

## Scope

R.239 adds component-level runtime evidence for `/api/admin/source-videos` status lists, especially:

- `status=processing`
- `status=index-required`
- `status=queued`

This is an Admin Query/read-model observability slice. It does not change list results, response `data` shape, NAS files, Docker deployment, or Cutter protocols.

## Implementation

- `packages/admin-api/src/admin-source-video-status-page-query.ts`
  - Emits `library_counts`, `status_store_page`, `status_read_model`, and `manifest_id_page` components.
- `packages/admin-api/src/admin-source-video-read-facade.ts`
  - Carries status-page `component_timings` up to `read_source_video_list_with_runtime_meta(...)`.
- `packages/admin-api/src/admin-source-video-routes.ts`
  - Passes source-video component timings into `meta.runtime.components`.
- `scripts/acceptance/admin-real-nas-performance.ts`
  - Adds required component contracts for `source_videos_processing`, `source_videos_index_required`, and `source_videos_queued`.

## Live Evidence

Artifact: `admin-real-nas-performance-20260627T100455Z`.

Observed route/component timings:

| endpoint | p95 | main component | component avg | component max | detail |
| --- | ---: | --- | ---: | ---: | --- |
| `source_videos_processing` | `67.6ms` | `status_store_page` | `66.5ms` | `67.0ms` | `manifests=0` |
| `source_videos_index_required` | `222.6ms` | `status_store_page` | `219.5ms` | `221.0ms` | `manifests=19` |
| `source_videos_queued` | `177.8ms` | `status_store_page` | `172.0ms` | `174.0ms` | `manifests=20` |
| `source_videos_failed` | `72.2ms` | `status_store_page` | `69.0ms` | `69.0ms` | `manifests=0` |

Component contract gates passed:

- `source_videos_processing`: `library_counts`, `status_store_page`
- `source_videos_index_required`: `library_counts`, `status_store_page`
- `source_videos_queued`: `library_counts`, `status_store_page`

## Verification

```text
node --test --import tsx packages/admin-api/src/admin-source-video-status-page-query.test.ts packages/admin-api/src/admin-source-video-routes.test.ts packages/admin-api/src/admin-source-video-read-facade.test.ts scripts/acceptance/admin-real-nas-performance.test.ts scripts/acceptance/admin-real-nas-performance-isolated.test.ts
```

Result: `33` tests passed.

```text
npm run typecheck
```

Result: passed.

```text
npm run validate:admin-real-nas-performance-isolated
```

Result: passed. Artifact: `admin-real-nas-performance-isolated-20260627T100454Z`; `runtime_component_contract_failed_count=0`.

```text
npm run audit:admin-redundancy-governance
```

Result: governance audit generated `admin-redundancy-governance-audit-20260627T100518Z`; broad cleanup remains blocked as expected.

## Conclusion

The slow source-video status lists are now measurable by component. On the observed NAS read model, the dominant cost is `status_store_page`, not `library_counts` or frontend rendering. The next performance slice should target read-model status-page reads over SMB, or explicitly add a short-lived read-model page cache if the route refresh model requires lower repeated-read latency.

## Remaining Gaps

- The default first page still does not emit source-video components because it uses the default-page path, not status-page query.
- This slice does not optimize `status_store_page`; it makes the bottleneck visible and gated.
- This does not complete Protection Gate coverage, route-loader restructuring, UI IA, redundancy cleanup, Docker release gates, or full Admin Architecture v1.
