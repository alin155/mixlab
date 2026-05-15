# M19 NAS Docker Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Ship the first NAS Docker deployment path for MixLab management side: NAS runs `admin-web`, `admin-api`, and `admin-worker`; the Windows cutter desktop app keeps using the existing local cutter service. The NAS deployment reads and writes the shared public library at `/data/PublicLibrary` and generates `current.json` inside the managed library index.

**Architecture:** One reusable runtime image for API and worker, one static web image with Nginx reverse proxy, one Docker Compose bundle for the NAS GUI, and one GitHub Actions workflow that publishes public GHCR images for first-phase NAS deployment.

**Tech Stack:** Node 24, npm workspaces, TypeScript, Vite, Nginx, Docker Compose, GitHub Actions, GHCR.

---

## Task 1: Add Admin Worker Loop

**Files:**
- `packages/runtime-config/src/docker-worker.ts`
- `packages/runtime-config/src/docker-worker.test.ts`
- `scripts/docker/admin-worker-loop.ts`
- `package.json`

**Step 1: Add tested worker-loop helpers**

Create `packages/runtime-config/src/docker-worker.ts`:

```ts
export interface AdminWorkerCommand {
  name: string;
  command: string[];
  enabled: boolean;
}

export function parseWorkerPollIntervalSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const rawValue = env.MIXLAB_WORKER_POLL_INTERVAL_SECONDS?.trim();
  if (!rawValue) return 60;

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("MIXLAB_WORKER_POLL_INTERVAL_SECONDS must be a positive integer");
  }

  return parsed;
}

export function resolveNpmExecutable(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export function buildAdminWorkerCycle(env: NodeJS.ProcessEnv = process.env): AdminWorkerCommand[] {
  const npm = resolveNpmExecutable();
  return [
    {
      name: "preprocess-library",
      command: [npm, "run", "worker:preprocess-library"],
      enabled: env.MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER === "1",
    },
    {
      name: "publish-ready",
      command: [npm, "run", "worker:publish-ready"],
      enabled: env.MIXLAB_ENABLE_READY_PUBLISH_WORKER === "1",
    },
  ];
}
```

Create `packages/runtime-config/src/docker-worker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildAdminWorkerCycle,
  parseWorkerPollIntervalSeconds,
  resolveNpmExecutable,
} from "./docker-worker";

describe("docker worker config", () => {
  it("uses a 60 second default poll interval", () => {
    expect(parseWorkerPollIntervalSeconds({})).toBe(60);
  });

  it("parses a configured positive poll interval", () => {
    expect(parseWorkerPollIntervalSeconds({ MIXLAB_WORKER_POLL_INTERVAL_SECONDS: "15" })).toBe(15);
  });

  it("rejects invalid poll intervals", () => {
    expect(() => parseWorkerPollIntervalSeconds({ MIXLAB_WORKER_POLL_INTERVAL_SECONDS: "0" })).toThrow(
      "positive integer",
    );
    expect(() => parseWorkerPollIntervalSeconds({ MIXLAB_WORKER_POLL_INTERVAL_SECONDS: "abc" })).toThrow(
      "positive integer",
    );
  });

  it("resolves the npm command for Windows and Unix platforms", () => {
    expect(resolveNpmExecutable("win32")).toBe("npm.cmd");
    expect(resolveNpmExecutable("linux")).toBe("npm");
    expect(resolveNpmExecutable("darwin")).toBe("npm");
  });

  it("builds disabled commands by default", () => {
    expect(buildAdminWorkerCycle({}).map((command) => [command.name, command.enabled])).toEqual([
      ["preprocess-library", false],
      ["publish-ready", false],
    ]);
  });

  it("enables configured worker commands", () => {
    expect(
      buildAdminWorkerCycle({
        MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: "1",
        MIXLAB_ENABLE_READY_PUBLISH_WORKER: "1",
      }).map((command) => [command.name, command.enabled]),
    ).toEqual([
      ["preprocess-library", true],
      ["publish-ready", true],
    ]);
  });
});
```

**Step 2: Add the Docker worker entry script**

Create `scripts/docker/admin-worker-loop.ts`:

```ts
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { buildAdminWorkerCycle, parseWorkerPollIntervalSeconds } from "../../packages/runtime-config/src/docker-worker";

function logEvent(event: Record<string, unknown>) {
  console.log(JSON.stringify({ time: new Date().toISOString(), ...event }));
}

const intervalSeconds = parseWorkerPollIntervalSeconds(process.env);

logEvent({
  event: "admin-worker-loop-started",
  intervalSeconds,
});

while (true) {
  const commands = buildAdminWorkerCycle(process.env);
  for (const workerCommand of commands) {
    if (!workerCommand.enabled) {
      logEvent({ event: "worker-skipped", worker: workerCommand.name });
      continue;
    }

    logEvent({ event: "worker-started", worker: workerCommand.name, command: workerCommand.command.join(" ") });
    const result = spawnSync(workerCommand.command[0], workerCommand.command.slice(1), {
      env: process.env,
      stdio: "inherit",
    });

    if (result.error) {
      logEvent({ event: "worker-error", worker: workerCommand.name, message: result.error.message });
      continue;
    }

    logEvent({ event: "worker-finished", worker: workerCommand.name, exitCode: result.status ?? 0 });
  }

  await sleep(intervalSeconds * 1000);
}
```

**Step 3: Add package script**

Add this script to `package.json`:

```json
"worker:admin-loop": "tsx scripts/docker/admin-worker-loop.ts"
```

**Step 4: Verify**

Run:

```bash
npm run typecheck
npm test
```

Expected result: typecheck succeeds and the new worker config tests pass.

---

## Task 2: Add Docker Images

**Files:**
- `.dockerignore`
- `docker/admin-runtime.Dockerfile`
- `docker/admin-web.Dockerfile`
- `docker/nginx/admin-web.conf`

**Step 1: Add Docker ignore rules**

Create `.dockerignore`:

```dockerignore
.git
.worktrees
node_modules
**/node_modules
dist
**/dist
.env
.env.*
.DS_Store
.codex-context
.superpowers/brainstorm
```

**Step 2: Add API and worker runtime image**

Create `docker/admin-runtime.Dockerfile`:

```dockerfile
FROM node:24-bookworm-slim

WORKDIR /app

ENV MIXLAB_FFMPEG_PATH=/usr/bin/ffmpeg
ENV MIXLAB_FFPROBE_PATH=/usr/bin/ffprobe

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

RUN npm ci --ignore-scripts

ENV NODE_ENV=production

CMD ["npm", "run", "server:admin-api"]
```

**Step 3: Add admin web image**

Create `docker/admin-web.Dockerfile`:

```dockerfile
FROM node:24-bookworm-slim AS build

WORKDIR /app

ENV VITE_MIXLAB_ADMIN_API_BASE_URL=/

COPY package.json package-lock.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci --ignore-scripts
RUN npm run build:admin-web

FROM nginx:1.27-alpine

COPY docker/nginx/admin-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin-web/dist /usr/share/nginx/html
```

**Step 4: Add same-origin API proxy**

Create `docker/nginx/admin-web.conf`:

```nginx
server {
  listen 80;
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  location /api/admin/ {
    proxy_pass http://admin-api:3889/api/admin/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

**Step 5: Verify locally when Docker is available**

Run:

```bash
docker build -f docker/admin-runtime.Dockerfile -t mixlab-admin-runtime:local .
docker build -f docker/admin-web.Dockerfile -t mixlab-admin-web:local .
```

Expected result: both images build without requiring NAS-level FFmpeg installation.

---

## Task 3: Add NAS Compose Bundle

**Files:**
- `deploy/nas/mixlab/docker-compose.yml`
- `deploy/nas/mixlab/.env.example`

**Step 1: Add Compose services**

Create `deploy/nas/mixlab/docker-compose.yml`:

```yaml
services:
  admin-api:
    image: ghcr.io/alin155/mixlab-admin-runtime:${MIXLAB_IMAGE_TAG:-latest}
    restart: unless-stopped
    env_file:
      - .env
    environment:
      MIXLAB_ADMIN_API_HOST: 0.0.0.0
      MIXLAB_ADMIN_API_PORT: 3889
      MIXLAB_ADMIN_LIBRARY_ROOT: /data/PublicLibrary
      MIXLAB_FFMPEG_PATH: /usr/bin/ffmpeg
      MIXLAB_FFPROBE_PATH: /usr/bin/ffprobe
    volumes:
      - ${PUBLIC_LIBRARY_HOST_PATH}:/data/PublicLibrary

  admin-worker:
    image: ghcr.io/alin155/mixlab-admin-runtime:${MIXLAB_IMAGE_TAG:-latest}
    restart: unless-stopped
    depends_on:
      - admin-api
    env_file:
      - .env
    environment:
      MIXLAB_ADMIN_LIBRARY_ROOT: /data/PublicLibrary
      MIXLAB_FFMPEG_PATH: /usr/bin/ffmpeg
      MIXLAB_FFPROBE_PATH: /usr/bin/ffprobe
      MIXLAB_WORKER_POLL_INTERVAL_SECONDS: ${MIXLAB_WORKER_POLL_INTERVAL_SECONDS:-60}
      MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: ${MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER:-1}
      MIXLAB_ENABLE_READY_PUBLISH_WORKER: ${MIXLAB_ENABLE_READY_PUBLISH_WORKER:-1}
    volumes:
      - ${PUBLIC_LIBRARY_HOST_PATH}:/data/PublicLibrary
    command: ["npm", "run", "worker:admin-loop"]

  admin-web:
    image: ghcr.io/alin155/mixlab-admin-web:${MIXLAB_IMAGE_TAG:-latest}
    restart: unless-stopped
    depends_on:
      - admin-api
    ports:
      - "${MIXLAB_ADMIN_WEB_PORT:-8080}:80"
```

**Step 2: Add NAS environment example**

Create `deploy/nas/mixlab/.env.example`:

```dotenv
PUBLIC_LIBRARY_HOST_PATH=/volume1/MixLab/PublicLibrary
MIXLAB_IMAGE_TAG=latest
MIXLAB_ADMIN_WEB_PORT=8080
MIXLAB_WORKER_POLL_INTERVAL_SECONDS=60
MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER=1
MIXLAB_ENABLE_READY_PUBLISH_WORKER=1

DASHSCOPE_API_KEY=
```

**Step 3: Verify Compose syntax when Docker is available**

Run:

```bash
cp deploy/nas/mixlab/.env.example deploy/nas/mixlab/.env
docker compose -f deploy/nas/mixlab/docker-compose.yml --env-file deploy/nas/mixlab/.env config
rm deploy/nas/mixlab/.env
```

Expected result: Compose resolves all services and volume mounts without syntax errors.

---

## Task 4: Add GHCR Publishing Workflow

**Files:**
- `.github/workflows/docker-admin.yml`

**Step 1: Add GitHub Actions workflow**

Create `.github/workflows/docker-admin.yml`:

```yaml
name: Build Admin Docker Images

on:
  workflow_dispatch:
  push:
    branches:
      - main
    paths:
      - ".github/workflows/docker-admin.yml"
      - "apps/admin-web/**"
      - "apps/admin-api/**"
      - "packages/**"
      - "scripts/**"
      - "docker/**"
      - "package.json"
      - "package-lock.json"
      - "tsconfig.json"

permissions:
  contents: read
  packages: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push admin runtime
        uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/admin-runtime.Dockerfile
          push: true
          tags: |
            ghcr.io/alin155/mixlab-admin-runtime:latest
            ghcr.io/alin155/mixlab-admin-runtime:${{ github.sha }}

      - name: Build and push admin web
        uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/admin-web.Dockerfile
          push: true
          tags: |
            ghcr.io/alin155/mixlab-admin-web:latest
            ghcr.io/alin155/mixlab-admin-web:${{ github.sha }}
```

**Step 2: Verify workflow syntax by inspection**

Run:

```bash
git diff -- .github/workflows/docker-admin.yml
```

Expected result: workflow builds only on manual dispatch or relevant main-branch changes, and publishes both GHCR images.

---

## Task 5: Add Operator Documentation

**Files:**
- `docs/deployment/m19-nas-docker.md`

**Step 1: Add NAS deployment guide**

Create `docs/deployment/m19-nas-docker.md` with these sections:

```md
# M19 NAS Docker Deployment

## Deployment Goal

Run MixLab management services on the NAS while keeping the Windows cutter desktop app independent.

## NAS Folder Contract

- NAS shared folder: `共享文件夹/MixLab/PublicLibrary`
- Container path: `/data/PublicLibrary`
- Generated index: `/data/PublicLibrary/.mixlab-library/indexes/source-transcript-index/current.json`

## Services

- `admin-web`: browser UI, exposed by default on NAS port `8080`
- `admin-api`: internal API service on container port `3889`
- `admin-worker`: recurring preprocessing and ready-publish worker

## First Deployment

1. Copy `deploy/nas/mixlab/docker-compose.yml` to the NAS Docker app project folder.
2. Copy `deploy/nas/mixlab/.env.example` as `.env`.
3. Edit `.env` and set `PUBLIC_LIBRARY_HOST_PATH` to the NAS absolute path of `MixLab/PublicLibrary`.
4. Fill `DASHSCOPE_API_KEY`.
5. Log in to GHCR from the NAS Docker app if private images are enabled.
6. Start the Compose project.
7. Open `http://NAS_IP:8080`.

## Update

1. Pull the latest images.
2. Restart the Compose project.
3. Confirm `admin-worker` logs show worker cycle output.
4. Confirm `current.json` exists under `.mixlab-library/indexes/source-transcript-index/`.

## Rollback

Set `MIXLAB_IMAGE_TAG` to a known Git SHA image tag and restart the Compose project.

## What M19 Does Not Move

The cutter desktop app and local `cutter-api` stay on the editor machine. NAS Docker only covers management-side library preprocessing and management UI/API.
```

**Step 2: Verify documentation consistency**

Run:

```bash
rg -n "PublicLibrary|current.json|admin-worker|cutter-api|GHCR|8080" docs/deployment/m19-nas-docker.md deploy/nas/mixlab docker .github/workflows/docker-admin.yml
```

Expected result: paths and service names match the approved M19 design.

---

## Final Verification

Run from `/Users/allen/Documents/mixlab/.worktrees/m19-nas-docker-deployment`:

```bash
npm run typecheck
npm test
npm run build:admin-web
docker build -f docker/admin-runtime.Dockerfile -t mixlab-admin-runtime:local .
docker build -f docker/admin-web.Dockerfile -t mixlab-admin-web:local .
cp deploy/nas/mixlab/.env.example deploy/nas/mixlab/.env
docker compose -f deploy/nas/mixlab/docker-compose.yml --env-file deploy/nas/mixlab/.env config
rm deploy/nas/mixlab/.env
```

If local Docker is unavailable, run all non-Docker checks locally and rely on the GitHub Actions workflow for image-build verification after push.

---

## Implementation Notes

- Do not change cutter desktop behavior in M19.
- Do not require NAS-level FFmpeg installation; Docker images install FFmpeg internally.
- Do not require DDNS, UGREENLink remote access, or public exposure in M19.
- Keep `current.json` generated by worker logic, not manually authored by the user.
- Preserve the web app path; Docker work must not break local Vite usage.
