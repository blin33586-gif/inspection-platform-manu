FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/media-contracts/package.json packages/media-contracts/tsconfig.json ./packages/media-contracts/
COPY packages/media-contracts/src ./packages/media-contracts/src
COPY packages/map-core/package.json packages/map-core/tsconfig.json ./packages/map-core/
COPY packages/map-core/src ./packages/map-core/src
COPY services/api/package.json services/api/tsconfig.json services/api/prisma.config.ts ./services/api/
COPY services/api/prisma ./services/api/prisma
COPY services/api/src ./services/api/src

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @xunjianbao/api db:generate
RUN pnpm build:api

WORKDIR /app/services/api

ENV API_PORT=3010
ENV NODE_ENV=production

EXPOSE 3010

CMD ["sh", "-c", "mkdir -p storage/reports storage/map-assets && pnpm db:deploy && pnpm start"]
