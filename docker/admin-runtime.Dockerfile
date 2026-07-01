FROM node:24-bookworm-slim

WORKDIR /app

ARG MIXLAB_BUILD_SHA=local
ARG MIXLAB_BUILD_VERSION=local
ARG MIXLAB_IMAGE_TAG=local
ARG MIXLAB_ADMIN_DOCKER_MVP_MODE=off

ENV MIXLAB_FFMPEG_PATH=/usr/bin/ffmpeg
ENV MIXLAB_FFPROBE_PATH=/usr/bin/ffprobe
ENV MIXLAB_ADMIN_DOCKER_MVP_MODE=${MIXLAB_ADMIN_DOCKER_MVP_MODE}
ENV MIXLAB_BUILD_SHA=${MIXLAB_BUILD_SHA}
ENV MIXLAB_BUILD_VERSION=${MIXLAB_BUILD_VERSION}
ENV MIXLAB_IMAGE_TAG=${MIXLAB_IMAGE_TAG}

LABEL org.opencontainers.image.revision=${MIXLAB_BUILD_SHA}
LABEL org.opencontainers.image.version=${MIXLAB_BUILD_VERSION}

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.json ./
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY apps/cutter-desktop/package.json apps/cutter-desktop/package.json
COPY apps/cutter-web/package.json apps/cutter-web/package.json
COPY apps/ui-fixtures/package.json apps/ui-fixtures/package.json
COPY packages/admin-api/package.json packages/admin-api/package.json
COPY packages/asr-core/package.json packages/asr-core/package.json
COPY packages/cutter-api/package.json packages/cutter-api/package.json
COPY packages/cutter-local/package.json packages/cutter-local/package.json
COPY packages/desktop-runtime/package.json packages/desktop-runtime/package.json
COPY packages/doctor-core/package.json packages/doctor-core/package.json
COPY packages/ffmpeg-core/package.json packages/ffmpeg-core/package.json
COPY packages/library-fs/package.json packages/library-fs/package.json
COPY packages/oss-core/package.json packages/oss-core/package.json
COPY packages/preprocess-core/package.json packages/preprocess-core/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/runtime-config/package.json packages/runtime-config/package.json
COPY packages/search-core/package.json packages/search-core/package.json
COPY packages/search-sqlite/package.json packages/search-sqlite/package.json
COPY packages/ui-foundation/package.json packages/ui-foundation/package.json
COPY packages/windows-test-runner/package.json packages/windows-test-runner/package.json

RUN npm ci --ignore-scripts

COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

ENV NODE_ENV=production

CMD ["npm", "run", "server:admin-api"]
