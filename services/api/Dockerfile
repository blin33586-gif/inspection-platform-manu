FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY services/api/package.json services/api/tsconfig.json services/api/prisma.config.ts ./services/api/
COPY services/api/prisma ./services/api/prisma
COPY services/api/src ./services/api/src

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @xunjianbao/api db:generate
RUN pnpm build:api

WORKDIR /app/services/api

ENV API_PORT=3010
ENV DATABASE_URL=file:/data/xunjianbao.db

EXPOSE 3010

CMD ["sh", "-c", "mkdir -p /data storage/reports storage/map-assets && pnpm db:push && pnpm start"]
