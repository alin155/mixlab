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

Phase 2 adds non-destructive Windows desktop acceptance suites:

```json
{
  "suite": "app_runtime_smoke"
}
```

```json
{
  "suite": "real_data_smoke",
  "options": {
    "queries": ["第一场", "现金流", "中国", "2026"]
  }
}
```

```json
{
  "suite": "cache_smoke"
}
```

```json
{
  "suite": "windows_acceptance"
}
```

For packaged builds that run the Cutter API in reviewed login mode, pass an
approved cutter session so protected real-data checks do not fall back to the
old local-trusted assumption:

```json
{
  "suite": "windows_acceptance",
  "options": {
    "auth_headers": {
      "device_id": "approved-device-id",
      "session_token": "approved-session-token"
    }
  }
}
```

`windows_acceptance` runs the non-destructive application checks in order:
runtime, real data, then cache. It does not create cut jobs or write local
workspace output.

Reports are written to:

```text
<share_root>/reports/<run_id>/
```

The packaged Windows executable uses `src/cli.ts` as its entry point. `src/index.ts`
is library code for tests and imports.
