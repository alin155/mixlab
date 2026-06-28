# Admin Docker NAS Desktop Readonly Observation

Generated: 2026-06-28T18:54:10Z

Mode: nas-docker-desktop-readonly-observation

Result: blocked

Docker deploy allowed: no

## Safety

This was a read-only NAS desktop and Admin Web observation. No NAS files were written, no Docker containers were started or stopped, no images were pushed or pulled, no preprocessing was started, and no Cutter release/index was published. Credentials, cookies, tokens, and browser storage state were not written to this report.

## Target

- NAS desktop: `http://192.168.1.27:9999/desktop/#/`
- NAS Admin Web: `http://192.168.1.27:18080`
- Desktop title: `DXP8800PRO-DB07`

## Docker UI Observations

- Docker service status: `服务运行正常`
- Project count: `1/1`
- Container count: `3/3`
- Local image count: `2`
- Docker data size: `1.3 GB`
- Compose project: `mixlab-server`

## Containers

| Container | Status | Image | Created | Uptime | Key observation |
| --- | --- | --- | --- | --- | --- |
| `mixlab-server-admin-web-1` | `运行中` | `ghcr.io/alin155/mixlab-admin-web:latest` | `2026-06-26 04:46:18` | `Up 2 days` | NAS `18080` maps to container `80/TCP`. |
| `mixlab-server-admin-api-1` | `运行中` | `ghcr.io/alin155/mixlab-admin-runtime:latest` | `2026-06-26 04:49:06` | `Up 2 days` | `/data/PublicLibrary` mounted read-write; `MIXLAB_ADMIN_API_PORT=3889`; no NAS port mapping shown. |
| `mixlab-server-admin-worker-1` | `运行中` | `ghcr.io/alin155/mixlab-admin-runtime:latest` | `2026-06-26 04:49:08` | `Up 2 days` | `/data/PublicLibrary` mounted read-write; library preprocess worker and ready publish worker are enabled. |

## Worker Flags

The running NAS worker shows:

- `MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=1`
- `MIXLAB_ENABLE_READY_PUBLISH_WORKER=1`
- `MIXLAB_ADMIN_LIBRARY_ROOT=/data/PublicLibrary`
- `MIXLAB_WORKER_POLL_INTERVAL_SECONDS=60`

This is not the MVP-safe default expected for the current candidate. MVP staging still requires worker flags disabled by default and external env/inspect proof.

## Local Images

| Image | Tag | Size |
| --- | --- | --- |
| `ghcr.io/alin155/mixlab-admin-runtime` | `latest` | `1.3GB` |
| `ghcr.io/alin155/mixlab-admin-web` | `latest` | `46.2MB` |

The current NAS stack is using mutable `latest` tags, not the fixed candidate tag `97f2d513a4a27315929b4d964320d4170b4b4631`.

## Admin Web GET Probe

Live readonly report: `docs/acceptance/artifacts/admin-docker-release-live-readonly-20260628T185228Z.json`

- Web root: HTTP `200`
- Library root: `/data/PublicLibrary`
- Total videos: `11394`
- Ready videos: `10471`
- Queued videos: `904`
- Index-required videos: `19`
- Current index: `v010471`
- Disk status: `blocked`, about `98%`
- Missing current contract endpoints: `/api/admin/auth/status`, `/api/admin/release-gates`, `/api/admin/data-loading/plan`

## Release Readiness

Readiness report: `docs/acceptance/artifacts/admin-docker-release-readiness-summary-20260628T185327Z.json`

- `release_review_ready=false`
- `docker_upload_allowed=false`

Conclusion: NAS Docker desktop is reachable and observable, but the running stack is still the old latest-tagged Admin deployment with enabled worker flags and missing current Admin API contract endpoints. The current Admin Docker MVP candidate is not staged or deployed.
