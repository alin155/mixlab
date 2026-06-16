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

and:

```json
{
  "suite": "launch_app_probe",
  "options": {
    "api_ready_timeout_ms": 60000
  }
}
```

and:

```json
{
  "suite": "launch_runner",
  "options": {
    "port": 3800,
    "version_expected": "0.1.7"
  }
}
```

`launch_runner` starts a second Runner from `<share_root>/runner/MixLabWindowsTestRunner.exe`
on a backup port and verifies `http://127.0.0.1:<port>/version`. This is the
foundation for safe future self-upgrades: bring up the new Runner on a side port,
verify it, then move traffic back to the primary port.

Reports are written to:

```text
<share_root>/reports/<run_id>/
```

The packaged Windows executable uses `src/cli.ts` as its entry point. `src/index.ts`
is library code for tests and imports.
