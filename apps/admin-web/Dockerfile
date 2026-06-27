FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable

ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY apps/admin-web/package.json apps/admin-web/tsconfig.json apps/admin-web/vite.config.ts apps/admin-web/index.html ./apps/admin-web/
COPY apps/admin-web/src ./apps/admin-web/src

RUN pnpm install --frozen-lockfile
RUN pnpm build:admin

FROM nginx:1.27-alpine

COPY apps/admin-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin-web/dist /usr/share/nginx/html

EXPOSE 80
