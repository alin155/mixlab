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
