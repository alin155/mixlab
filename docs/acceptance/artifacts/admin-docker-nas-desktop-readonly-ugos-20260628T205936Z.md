# Admin Docker NAS Desktop Readonly UGOS Observation

Generated: 2026-06-28T20:59:36.403Z
Result: blocked
Docker deploy allowed: no
Docker runtime touched: no

## Containers

| Name | Status | Image | Project | RAM | Ports |
| --- | --- | --- | --- | --- | --- |
| mixlab-server-admin-worker-1 | Running | ghcr.io/alin155/mixlab-admin-runtime:latest | mixlab-server | 90.8MB/7.4GB | none |
| mixlab-server-admin-api-1 | Running | ghcr.io/alin155/mixlab-admin-runtime:latest | mixlab-server | 865.7MB/7.4GB | none |
| mixlab-server-admin-web-1 | Running | ghcr.io/alin155/mixlab-admin-web:latest | mixlab-server | 5.5MB/7.4GB | none |

## Worker Env Allowlist

- MIXLAB_ADMIN_LIBRARY_ROOT=/data/PublicLibrary
- MIXLAB_FFMPEG_PATH=/usr/bin/ffmpeg
- MIXLAB_FFPROBE_PATH=/usr/bin/ffprobe
- MIXLAB_WORKER_POLL_INTERVAL_SECONDS=60
- MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=1
- MIXLAB_ENABLE_READY_PUBLISH_WORKER=1
- NODE_ENV=production

Safety: no NAS password, cookies, tokens, API keys, full env, or full Docker inspect output is written to this artifact.
