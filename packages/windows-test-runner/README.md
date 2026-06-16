# MixLab Windows Test Runner

Long-running Windows-side HTTP runner for MixLab desktop acceptance tests.

## Development

```bash
npm run dev -w @mixlab/windows-test-runner
```

## Runtime Environment

```text
MIXLAB_WINDOWS_TEST_RUNNER_HOST
MIXLAB_WINDOWS_TEST_RUNNER_PORT
MIXLAB_WINDOWS_TEST_RUNNER_SHARE_ROOT
MIXLAB_WINDOWS_TEST_RUNNER_REPORTS_ROOT
MIXLAB_CUTTER_API_BASE_URL
```

Default port:

```text
3799
```

## Phase 1 API

```text
GET  /health
GET  /version
GET  /status
POST /runs
GET  /runs/:id
GET  /runs/:id/report
```

Phase 1 supports:

```json
{
  "suite": "probe_api"
}
```

Reports are written to:

```text
<share_root>/reports/<run_id>/
```

The packaged Windows executable uses `src/cli.ts` as its entry point. `src/index.ts`
is library code for tests and imports.
