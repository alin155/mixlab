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
MIXLAB_WINDOWS_TEST_RUNNER_TOKEN
MIXLAB_WINDOWS_TEST_RUNNER_REQUIRE_CONFIRM
MIXLAB_WINDOWS_TEST_RUNNER_REQUIRE_INSTALLER_SHA256
MIXLAB_WINDOWS_TEST_RUNNER_MAX_BODY_BYTES
MIXLAB_WINDOWS_TEST_RUNNER_ALLOWED_ORIGINS
```

Default port:

```text
3799
```

## Security defaults

- Default bind address is `127.0.0.1`. Binding to `0.0.0.0` or a LAN address **requires**
  `MIXLAB_WINDOWS_TEST_RUNNER_TOKEN` (at least 16 characters) or the Runner refuses to start.
- Every endpoint except `GET /health` requires `Authorization: Bearer <token>`
  (or `X-MixLab-Runner-Token`). `/health` only reports liveness.
- Browser requests with an `Origin` header are accepted only for loopback origins or
  origins listed in `MIXLAB_WINDOWS_TEST_RUNNER_ALLOWED_ORIGINS`.
- Request bodies are limited by `MIXLAB_WINDOWS_TEST_RUNNER_MAX_BODY_BYTES` (default 1 MiB).
- Destructive suites (`real_cut_smoke`, `windows_acceptance`, `desktop_ui_screenshot_smoke`,
  `desktop_incident_diagnostics`, `install_latest_and_smoke`) must carry `"confirm": true`.
- `install_latest_and_smoke` only accepts `installer_path` values inside the share root and
  requires `installer_sha256` when `MIXLAB_WINDOWS_TEST_RUNNER_REQUIRE_INSTALLER_SHA256=1`
  (default on for LAN/token deployments).
- Never expose this Runner to the public internet. Prefer loopback-only access or a
  dedicated isolated test Windows machine.

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
