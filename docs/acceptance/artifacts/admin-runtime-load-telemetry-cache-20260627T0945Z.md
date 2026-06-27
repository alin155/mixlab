# Admin Runtime Load Telemetry Cache 2026-06-27T09:45Z

## Scope

R.237 adds a short-lived runtime-load telemetry cache at the Admin dashboard read facade boundary. It avoids repeated synchronous CPU sampling during the same route-load window while preserving the first real runtime probe.

This is a Query/runtime-telemetry optimization, not an asset cache and not a Docker release.

## Safety

- No NAS data mutation.
- No source-video manifest rewrite.
- No read-model schema change.
- No scan/apply/reconcile start or cancel.
- No worker execution.
- No Docker deployment.
- No Cutter release/index/search protocol change.

## Implementation

- File: `packages/admin-api/src/admin-dashboard-read-facade.ts`
- TTL: `2000ms`
- Cache key: `library_root`
- Pending reads: coalesced per library root.
- Clear path: `clear_dashboard_metrics_cache(...)`

The low-level `getAdminRuntimeLoadMetrics(...)` still performs real CPU, memory, disk, network, and service probing. The cache only wraps the Admin Query facade that is shared by Dashboard and Preprocess Jobs.

## Evidence

Before R.237, `admin-real-nas-performance-20260627T093828Z` showed:

- `preprocess_jobs` p95: `490.8ms`
- `runtime_load` total: `528ms`
- `runtime_load` max: `266ms`
- `dashboard_metrics` p95: `939ms`

After R.237, `admin-real-nas-performance-20260627T094520Z` shows:

- `preprocess_jobs` p95: `497.8ms`
- `preprocess_jobs` cold: `497.8ms`
- `preprocess_jobs` warm: `225.4ms`
- `runtime_load` warm: `0ms`
- `preprocess_job_page` average: `217.5ms`
- `dashboard_metrics` p95: `690.4ms`
- Runtime component contracts: pass
- Runtime repair endpoints: `0`
- Slow endpoint gates: `0`

The isolated gate artifact `admin-real-nas-performance-isolated-20260627T094519Z` passed with `20` endpoints, `0` failed samples, `0` slow gates, `0` runtime repair endpoints, and `0` runtime component contract failures.

## Verification

```text
node --test --import tsx packages/admin-api/src/admin-dashboard-read-facade.test.ts packages/admin-api/src/admin-dashboard-read-services.test.ts packages/admin-api/src/admin-runtime-load-query.test.ts packages/admin-api/src/admin-preprocess-jobs-read-facade.test.ts packages/admin-api/src/admin-slow-read-routes.test.ts
```

Result: `17` tests passed.

```text
MIXLAB_ADMIN_PERF_PROGRESS=true MIXLAB_ADMIN_PERF_WARM_SAMPLES=1 node --import tsx scripts/acceptance/admin-real-nas-performance-isolated.ts
```

Result: passed.

## Remaining Gaps

- `preprocess_job_page` remains about `217ms` per sampled request and should be evaluated in the next Query/store slice.
- Source-video status routes still do not expose component timings.
- Docker release gates remain blocked until the full release gate sequence passes.
