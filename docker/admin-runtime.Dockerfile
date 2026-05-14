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
