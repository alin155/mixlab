# Admin Docker NAS Release Inputs From Desktop Readonly

This directory is generated from a Playwright-observed NAS Docker Desktop
readonly report, not from a host-level docker compose collector.

Source desktop report:
docs/acceptance/artifacts/admin-docker-nas-desktop-readonly-refresh-20260628T193000Z.json

Source live-readonly report:
docs/acceptance/artifacts/admin-docker-release-live-readonly-20260628T190333Z.json

Safety rules:
- This evidence must not approve Docker upload or deploy by itself.
- Do not include NAS passwords, cookies, tokens, API keys, or full Docker inspect output.
- Use this path only to convert already-observed desktop/container facts into
  the same sanitized file shape consumed by the existing local validators.
- Positive release approval still requires the normal gates to pass.
