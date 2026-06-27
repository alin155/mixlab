FROM node:24-bookworm-slim

WORKDIR /app

ARG MIXLAB_BUILD_SHA=local
ARG MIXLAB_BUILD_VERSION=local
ARG MIXLAB_IMAGE_TAG=local
ARG MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1

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
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

RUN npm ci --ignore-scripts

ENV NODE_ENV=production

CMD ["npm", "run", "server:admin-api"]
