FROM node:24-bookworm-slim AS build

WORKDIR /app

ARG MIXLAB_BUILD_SHA=local
ARG MIXLAB_BUILD_VERSION=local
ARG MIXLAB_IMAGE_TAG=local
ARG MIXLAB_ADMIN_DOCKER_MVP_MODE=v0.1

ENV VITE_MIXLAB_ADMIN_API_BASE_URL=/
ENV VITE_MIXLAB_ADMIN_DOCKER_MVP_MODE=${MIXLAB_ADMIN_DOCKER_MVP_MODE}
ENV VITE_MIXLAB_BUILD_SHA=${MIXLAB_BUILD_SHA}
ENV VITE_MIXLAB_BUILD_VERSION=${MIXLAB_BUILD_VERSION}
ENV VITE_MIXLAB_IMAGE_TAG=${MIXLAB_IMAGE_TAG}

COPY package.json package-lock.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci --ignore-scripts
RUN npm run build:admin-web

FROM nginx:1.27-alpine

ARG MIXLAB_BUILD_SHA=local
ARG MIXLAB_BUILD_VERSION=local

LABEL org.opencontainers.image.revision=${MIXLAB_BUILD_SHA}
LABEL org.opencontainers.image.version=${MIXLAB_BUILD_VERSION}

COPY docker/nginx/admin-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin-web/dist /usr/share/nginx/html
