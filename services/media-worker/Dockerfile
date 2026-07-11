FROM node:24-bookworm-slim

WORKDIR /app

RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends gdal-bin \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/map-core/package.json packages/map-core/tsconfig.json ./packages/map-core/
COPY packages/map-core/src ./packages/map-core/src
COPY services/media-worker/package.json services/media-worker/tsconfig.json ./services/media-worker/
COPY services/media-worker/src ./services/media-worker/src

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @xunjianbao/media-worker build

WORKDIR /app/services/media-worker

ENV NODE_ENV=production
ENV STORAGE_ROOT=/app/services/api/storage

CMD ["pnpm", "start"]
