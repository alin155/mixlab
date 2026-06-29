# Admin Cutter Staged Proof Plan

Generated: 2026-06-29T03:26:00.529Z
Mode: admin-cutter-staged-proof-plan
Result: ready-for-staged-cutter-proof
Plan ready: yes
Docker upload allowed: no

This is a plan-only artifact. It does not contact Windows Runner, Docker, NAS, Admin API, or Cutter API; it does not record Cutter auth values.

## Inputs

- Runner base URL: http://192.168.1.20:3799
- Candidate image tag: 73ab7b355051d7325174111f955cd8356d42787d
- Expected ready count: 10471
- Expected release version: v010471
- Real cut query: 第一场
- Include desktop screenshot: yes

## Request Templates

### 1. windows_acceptance

Prove Cutter public library, search, transcript detail, reviewed auth, and cache remain compatible with the staged Admin Docker candidate.

Endpoint: POST http://192.168.1.20:3799/runs

```json
{
  "suite": "windows_acceptance",
  "options": {
    "auth_headers": {
      "device_id": "<approved-cutter-device-id>",
      "session_token": "<approved-cutter-session-token>"
    }
  }
}
```

Report path: <share_root>/reports/<windows_acceptance_run_id>/report.json

### 2. real_cut_smoke

Prove Cutter can still create and complete a real public-library cut after the staged Admin Docker candidate.

Endpoint: POST http://192.168.1.20:3799/runs

```json
{
  "suite": "real_cut_smoke",
  "options": {
    "auth_headers": {
      "device_id": "<approved-cutter-device-id>",
      "session_token": "<approved-cutter-session-token>"
    },
    "query": "第一场",
    "cut_mode": "copy",
    "max_duration_ms": 1500
  }
}
```

Report path: <share_root>/reports/<real_cut_smoke_run_id>/report.json

### 3. desktop_ui_screenshot_smoke

Optional UI smoke evidence for the staged Cutter desktop state.

Endpoint: POST http://192.168.1.20:3799/runs

```json
{
  "suite": "desktop_ui_screenshot_smoke",
  "options": {
    "auth_headers": {
      "device_id": "<approved-cutter-device-id>",
      "session_token": "<approved-cutter-session-token>"
    }
  }
}
```

Report path: <share_root>/reports/<desktop_ui_screenshot_smoke_run_id>/report.json

## Command Templates

### Preflight

```bash
curl --noproxy '*' -sS 'http://192.168.1.20:3799/health'
curl --noproxy '*' -sS 'http://192.168.1.20:3799/version'
Confirm the staged Admin Docker candidate is already deployed to the staging target and live-readonly/parity probes are rerun before starting these Cutter checks.
```

### Start Runs

```bash
# Start windows_acceptance; copy the returned run.id into the matching <..._run_id> placeholder below.
curl --noproxy '*' -sS -X POST 'http://192.168.1.20:3799/runs' -H 'content-type: application/json' --data-raw '{"suite":"windows_acceptance","options":{"auth_headers":{"device_id":"<approved-cutter-device-id>","session_token":"<approved-cutter-session-token>"}}}'
```

```bash
# Start real_cut_smoke; copy the returned run.id into the matching <..._run_id> placeholder below.
curl --noproxy '*' -sS -X POST 'http://192.168.1.20:3799/runs' -H 'content-type: application/json' --data-raw '{"suite":"real_cut_smoke","options":{"auth_headers":{"device_id":"<approved-cutter-device-id>","session_token":"<approved-cutter-session-token>"},"query":"第一场","cut_mode":"copy","max_duration_ms":1500}}'
```

```bash
# Start desktop_ui_screenshot_smoke; copy the returned run.id into the matching <..._run_id> placeholder below.
curl --noproxy '*' -sS -X POST 'http://192.168.1.20:3799/runs' -H 'content-type: application/json' --data-raw '{"suite":"desktop_ui_screenshot_smoke","options":{"auth_headers":{"device_id":"<approved-cutter-device-id>","session_token":"<approved-cutter-session-token>"}}}'
```

### Poll Reports

```bash
curl --noproxy '*' -sS 'http://192.168.1.20:3799/runs/<windows_acceptance_run_id>/report' > '<share_root>/reports/<windows_acceptance_run_id>/report.json'
curl --noproxy '*' -sS 'http://192.168.1.20:3799/runs/<real_cut_smoke_run_id>/report' > '<share_root>/reports/<real_cut_smoke_run_id>/report.json'
curl --noproxy '*' -sS 'http://192.168.1.20:3799/runs/<desktop_ui_screenshot_smoke_run_id>/report' > '<share_root>/reports/<desktop_ui_screenshot_smoke_run_id>/report.json'
```

### Validate Proof

```bash
MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT='<share_root>/reports/<windows_acceptance_run_id>/report.json' \
MIXLAB_CUTTER_REAL_CUT_REPORT='<share_root>/reports/<real_cut_smoke_run_id>/report.json' \
MIXLAB_CUTTER_EXPECTED_READY_COUNT=10471 \
MIXLAB_CUTTER_EXPECTED_RELEASE_VERSION=v010471 \
MIXLAB_CUTTER_DESKTOP_SCREENSHOT_REPORT='<share_root>/reports/<desktop_ui_screenshot_smoke_run_id>/report.json' \
npm run validate:admin-cutter-compatibility-proof
```

## Gates

| Gate | Category | Status | Blocks Plan | Evidence | Required Evidence |
| --- | --- | --- | --- | --- | --- |
plan-no-side-effects | safety | pass | no | This report only writes a local plan artifact; it does not contact Windows Runner, Docker, NAS, Admin API, or Cutter API. | n/a
candidate-image-tag-provided | input | pass | no | candidate_image_tag=73ab7b355051d7325174111f955cd8356d42787d | Set MIXLAB_DOCKER_TARGET_IMAGE_TAG or provide the candidate image tag from the accepted Admin Docker smoke artifact.
runner-base-url-mac-reachable | runner | pass | no | runner_base_url=http://192.168.1.20:3799 | Use the Windows LAN address from the environment registry, not Mac localhost.
expected-ready-count-positive | input | pass | no | expected_ready_count=10471 | MVP compatibility proof must assert the current ready baseline.
expected-release-version-provided | input | pass | no | expected_release_version=v010471 | MVP v0.1 must prove Cutter release/index did not drift.
required-suites-planned | proof | pass | no | suites=windows_acceptance, real_cut_smoke, desktop_ui_screenshot_smoke | Plan must include both windows_acceptance and real_cut_smoke.
auth-values-not-recorded | safety | pass | no | Request templates contain placeholders for approved Cutter auth headers only. | n/a
proof-command-prepared | proof | pass | no | validate:admin-cutter-compatibility-proof command template is present. | Plan must end with the existing proof validator.

## Next Actions

- After the staged Admin Docker candidate 73ab7b355051d7325174111f955cd8356d42787d exists, run the preflight commands against the Windows Runner.
- Start windows_acceptance and real_cut_smoke with an already approved Cutter session; do not store auth values in artifacts.
- Validate that Cutter still sees at least 10471 ready videos and release/index v010471.
- Run the generated validate:admin-cutter-compatibility-proof command and archive the accepted proof before Docker MVP final review.

## Artifacts

- JSON: docs/acceptance/artifacts/admin-cutter-staged-proof-plan-20260629T032600Z.json
- Markdown: docs/acceptance/artifacts/admin-cutter-staged-proof-plan-20260629T032600Z.md
