# 巡检宝项目运行与打包说明

本项目是一个 Node.js monorepo，包含前端、后端服务、共享类型包和 PostgreSQL 数据库。

## 1. 项目结构

```text
inspection-platform-manu/
├── apps/admin-web/          # 前端管理端，React + Vite + Ant Design
├── services/api/            # 后端服务，NestJS + Prisma + PostgreSQL
├── packages/shared/         # 前后端共享 TypeScript 类型
├── prototype/               # 早期原型资料
├── docs/                    # 开发阶段记录
├── docker-compose.yml       # Docker 编排文件
├── pnpm-workspace.yaml      # workspace 配置
├── pnpm-lock.yaml           # pnpm 锁定文件
└── package.json             # 根脚本入口
```

## 2. 先说明 npm / pnpm 的关系

当前项目推荐使用 `pnpm`，不是直接使用 `npm`。

原因：

- 根目录 `package.json` 已声明 `"packageManager": "pnpm@11.7.0"`。
- 项目使用 `pnpm-workspace.yaml` 管理 `apps/*`、`services/*`、`packages/*`。
- 后端和前端依赖了本地包：`@xunjianbao/shared: "workspace:*"`。
- 根目录脚本本身也是通过 `pnpm --filter ...` 调用子项目。

所以不要直接执行：

```bash
npm install
npm run build
```

正确做法是：先用 Node 自带的 Corepack 启用 pnpm，然后用 pnpm 运行项目。

```bash
corepack enable
corepack prepare pnpm@11.7.0 --activate
pnpm -v
```

如果服务器没有 Corepack，也可以临时用 npm 安装 pnpm：

```bash
npm install -g pnpm@11.7.0
```

后续所有命令都用 `pnpm` 执行。

## 3. 本地首次安装

在项目根目录执行：

```bash
cd /path/to/inspection-platform-manu
cp .env.example .env
corepack enable
corepack prepare pnpm@11.7.0 --activate
pnpm install --frozen-lockfile
```

如果安装过程中 pnpm 提示是否允许构建脚本，允许以下依赖：

```text
@nestjs/core
@prisma/engines
better-sqlite3
esbuild
prisma
```

当前 `pnpm-workspace.yaml` 已经写了 `allowBuilds`，正常情况下不需要重复处理。

本地长期调试建议使用稳定后台启动方式，避免关闭终端后前端或 API 一并退出：

```bash
pnpm dev:stable
pnpm dev:status
pnpm dev:stop
```

默认访问地址为 `http://127.0.0.1:5183/`，运行日志保存在项目根目录 `.runtime/`。

## 4. 环境变量

根目录 `.env.example` 内容如下：

```env
DATABASE_URL=postgresql://xunjianbao:change-me@127.0.0.1:5432/xunjianbao?schema=public
API_PORT=3010
VITE_API_BASE_URL=http://127.0.0.1:3010/api/v1
PUBLIC_APP_URL=http://127.0.0.1:5182
ADMIN_USERNAME=replace-with-private-admin-login
ADMIN_PASSWORD=replace-with-strong-admin-password-2026
MEMBER_USERNAME=replace-with-private-member-login
MEMBER_PASSWORD=replace-with-strong-member-password-2026
AUTH_SECRET=change-me-before-production
```

本地开发可以直接复制：

```bash
cp .env.example .env
```

生产环境必须修改：

```env
DATABASE_URL=postgresql://xunjianbao_app:URL编码后的强密码@腾讯云数据库内网地址:5432/xunjianbao?schema=public&sslmode=require
API_PORT=3010
VITE_API_BASE_URL=/api/v1
PUBLIC_APP_URL=https://你的巡检宝域名
ADMIN_USERNAME=你的管理员账号
ADMIN_PASSWORD=强密码
MEMBER_USERNAME=单独设置的成员账号
MEMBER_PASSWORD=至少 12 位且同时包含字母和数字的强密码
AUTH_SECRET=一串随机长密钥
```

说明：

- `DATABASE_URL`：PostgreSQL 连接串；生产环境使用腾讯云 TencentDB for PostgreSQL 的内网地址。
- `API_PORT`：后端服务端口，默认 `3010`。
- `VITE_API_BASE_URL`：前端请求 API 的地址。
- `PUBLIC_APP_URL`：二维码和问题分享链接使用的巡检宝公网地址，生产环境必须填写 HTTPS 域名。
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`：管理端登录账号密码，不要保留示例值。
- `MEMBER_USERNAME` / `MEMBER_PASSWORD`：全新库初始化的成员账号密码；密码至少 12 位并同时包含字母和数字。Docker Compose 缺少任一项会在启动容器前失败。
- `AUTH_SECRET`：登录 token 签名密钥，生产环境必须改。

## 5. 数据库初始化

后端使用 Prisma + PostgreSQL。本地可连接 Homebrew PostgreSQL 或通过 Docker 启动 PostgreSQL；腾讯云生产环境使用 TencentDB for PostgreSQL。

首次运行前执行：

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

命令含义：

- `pnpm db:generate`：生成 Prisma Client。
- `pnpm db:migrate`：在本地开发库创建并应用 Prisma 数据库迁移。
- `pnpm db:seed`：写入演示数据。正式生产环境如果不想要演示数据，可以不执行。

生产发布使用 `pnpm db:deploy`，只应用已提交的迁移文件；不要在生产环境执行 `db:migrate`、`db:push` 或 `db:seed`。

从原有 SQLite 系统切换时，先备份旧库与上传文件，再执行一次 `pnpm db:migrate-sqlite` 导入历史业务记录。具体步骤见 [TencentDB-PostgreSQL 部署与迁移](docs/TencentDB-PostgreSQL部署与迁移.md)。

## 6. 本地开发运行

推荐一次启动前端、后端和媒体工作进程：

```bash
pnpm dev
```

该命令会先应用已提交的数据库迁移，再同时启动三个服务。媒体库的视频上传与 FFmpeg 抽帧、图片 ZIP 解压以及地图瓦片处理都依赖媒体工作进程，不要只启动前端与后端。

媒体库当前支持三类统一任务：

- `MP4`、`MOV` 视频：上传时可选择 `1-5 秒/帧`，默认 `3 秒/帧`；上传后自动创建离线抽帧任务，任务卡片支持鼠标悬停静音预览。
- `ZIP` 图片包：接收 `JPG`、`JPEG`、`JFIF`、`PNG`、`WebP`、`GIF`、`BMP`、`TIF`、`TIFF`、`HEIC`、`HEIF`，后台安全解压并将子目录图片平铺为同一任务的素材。
- 直接图片：使用与 ZIP 相同的格式与文件头校验规则，后台统一整理为任务照片。

ZIP 会自动忽略 macOS 生成的 `__MACOSX/`、`._*` 和 `.DS_Store` 元数据文件。系统不会只凭扩展名接收图片：每个文件都会校验实际文件头，避免伪造扩展名进入媒体库。

`WebP`、`GIF` 等浏览器可直接显示的格式保留原件；`BMP`、`TIF`、`TIFF`、`HEIC`、`HEIF` 同时保留原文件，并由媒体 Worker 生成 JPEG 预览图，供媒体库、报告和后续 AI 识别使用。生产 Worker 镜像已安装 `FFmpeg` 和 `libheif-examples`（提供 `heif-convert`）；自行部署 Worker 时也必须提供这两个运行依赖。

点击真实任务会进入 `/media-library/:taskId` 独立详情页。详情页可播放原始视频，并展示抽帧照片或图片包照片。进入报告编写后，可按待分发、已归档、已忽略筛选任务照片，默认选中全部非忽略照片，也可以只选择其中一部分进入标注画布。再次编辑已有综合报告时，会恢复原报告字段和精确的有序选图，不会用默认全选覆盖历史结果。

任务照片只保存一份物理文件。报告通过 `ReportPhoto` 保存有序选图关系；小区、道路和重点点位档案通过 `TaskPhoto.archiveObjectId` 保存唯一归档关系，不复制 `MediaAsset` 文件。

照片标注以 `TaskPhoto` 为统一数据源：矩形、箭头、文字、颜色、逐项说明、整图问题描述和经纬度都会保存到 PostgreSQL。每次在报告页点击“暂存”都会形成新版本，旧版本不可修改；并发页面使用版本号保护，旧页面不能覆盖新标注。报告页可查看当前照片的历史版本。

需要分别启动时，先启动后端：

```bash
pnpm dev:api
```

后端地址：

```text
http://127.0.0.1:3010/api/v1
```

再开第二个终端启动媒体工作进程：

```bash
pnpm dev:worker
```

最后开第三个终端启动前端：

```bash
pnpm dev:admin
```

前端地址以 Vite 终端实际输出为准，例如：

```text
http://127.0.0.1:5181
```

登录账号密码来自 `.env`：

```text
admin / xunjianbao2026
```

如果你改了 `.env`，以后按新账号密码登录。

## 7. 打包构建

构建全部模块：

```bash
pnpm build
```

单独构建前端：

```bash
pnpm build:admin
```

前端打包产物目录：

```text
apps/admin-web/dist/
```

单独检查后端：

```bash
pnpm build:api
```

注意：当前后端 `build` 是 TypeScript 类型检查，不会输出 `dist`。生产运行仍然通过 `tsx src/main.ts` 启动源码。

## 8. 本地预览前端生产包

先构建：

```bash
pnpm build:admin
```

再预览：

```bash
pnpm --filter @xunjianbao/admin-web preview -- --host 127.0.0.1 --port 5182
```

访问：

```text
http://127.0.0.1:5182
```

如果要让生产前端通过同域名 `/api/v1` 访问后端，构建时使用：

```bash
VITE_API_BASE_URL=/api/v1 pnpm build:admin
```

## 9. 腾讯云 CVM 手动部署方案

推荐使用一台腾讯云 CVM，系统选择 Ubuntu 22.04 或 Ubuntu 24.04。

服务器需要安装：

```bash
sudo apt update
sudo apt install -y git nginx
```

安装 Node.js 建议用 Node 22 LTS 或 Node 24：

```bash
node -v
npm -v
corepack enable
corepack prepare pnpm@11.7.0 --activate
pnpm -v
```

上传或拉取项目：

```bash
cd /opt
git clone <你的仓库地址> xunjianbao
cd /opt/xunjianbao
```

安装依赖：

```bash
pnpm install --frozen-lockfile
```

配置生产环境变量：

```bash
cp .env.example .env
nano .env
```

建议生产 `.env`：

```env
DATABASE_URL=postgresql://xunjianbao_app:URL编码后的强密码@腾讯云数据库内网地址:5432/xunjianbao?schema=public&sslmode=require
API_PORT=3010
VITE_API_BASE_URL=/api/v1
PUBLIC_APP_URL=https://你的巡检宝域名
ADMIN_USERNAME=admin
ADMIN_PASSWORD=换成强密码
MEMBER_USERNAME=换成私有成员账号
MEMBER_PASSWORD=至少12位且包含字母和数字的强密码
AUTH_SECRET=换成随机长字符串
```

初始化数据库：

```bash
pnpm db:generate
pnpm --filter @xunjianbao/api db:deploy
```

全新环境可执行 `pnpm db:seed` 写入演示数据；seed 在未显式设置 `NODE_ENV=development` 或 `NODE_ENV=test` 时按生产安全模式运行，必须提供私有的管理员和成员凭据，绝不会使用公开开发密码。从旧 SQLite 切换时使用 `pnpm --filter @xunjianbao/api db:migrate-sqlite`，不要同时执行 seed。

构建前端：

```bash
VITE_API_BASE_URL=/api/v1 pnpm build:admin
```

启动后端建议使用 PM2：

```bash
npm install -g pm2
pm2 start "pnpm start:api" --name xunjianbao-api
pm2 save
pm2 startup
```

检查后端：

```bash
curl http://127.0.0.1:3010/api/v1/dashboard
```

## 10. Nginx 配置

创建配置文件：

```bash
sudo nano /etc/nginx/sites-available/xunjianbao.conf
```

写入：

```nginx
server {
  listen 80;
  server_name 你的域名或服务器公网 IP;

  root /opt/xunjianbao/apps/admin-web/dist;
  index index.html;

  client_max_body_size 200m;

  location /api/v1/ {
    proxy_pass http://127.0.0.1:3010/api/v1/;
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

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/xunjianbao.conf /etc/nginx/sites-enabled/xunjianbao.conf
sudo nginx -t
sudo systemctl reload nginx
```

访问：

```text
http://你的域名或服务器公网 IP
```

腾讯云安全组需要放通：

```text
22   SSH 登录
80   HTTP 访问
443  HTTPS 访问
```

## 11. HTTPS

如果已经有域名，建议配置 HTTPS。可以使用腾讯云 SSL 证书或 Let's Encrypt。

基本流程：

1. 域名解析到 CVM 公网 IP。
2. 腾讯云控制台申请 SSL 证书。
3. 下载 Nginx 证书文件。
4. 修改 Nginx 配置监听 `443 ssl`。
5. HTTP 自动跳转 HTTPS。

HTTPS 配置好后，前端仍建议使用：

```env
VITE_API_BASE_URL=/api/v1
```

这样浏览器不会出现跨域问题。

## 12. Docker 方案注意事项

仓库里已有：

```text
docker-compose.yml
apps/admin-web/Dockerfile
services/api/Dockerfile
```

但是当前后端代码在 `services/api/src/main.ts` 中监听：

```ts
await app.listen(port, "127.0.0.1");
```

这适合宿主机本地运行和 Nginx 本机反代，不适合 Docker 容器之间互相访问。如果要用 `docker compose up -d`，建议先把监听地址改成可配置：

```ts
const host = process.env.API_HOST ?? "127.0.0.1";
await app.listen(port, host);
```

然后 Docker 环境设置：

```env
API_HOST=0.0.0.0
```

否则 `admin-web` 容器里的 Nginx 可能访问不到 `api:3010`。

如果只是自己手动部署到腾讯云，优先按第 9-10 节的宿主机 + Nginx 方案，不必用 Docker。

## 13. 备份内容

正式使用后至少备份三类内容：

```text
/opt/xunjianbao/services/api/storage # 上传的报告、地图等文件
/opt/xunjianbao/.env                 # 生产环境配置
```

数据库使用 TencentDB 自动备份与日志备份；建议每周额外保留一份逻辑备份：

```bash
pg_dump "$DATABASE_URL" -Fc -f /data/backup/xunjianbao-$(date +%F).dump
```

腾讯云实例配置、SQLite 数据迁移和本机验证步骤见 [TencentDB-PostgreSQL 部署与迁移](docs/TencentDB-PostgreSQL部署与迁移.md)。

## 14. 常用命令速查

安装依赖：

```bash
pnpm install --frozen-lockfile
```

初始化数据库：

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

开发运行：

```bash
pnpm dev:api
pnpm dev:admin
```

构建：

```bash
pnpm build
pnpm build:admin
pnpm build:api
```

生产后端：

```bash
pnpm start:api
```

PM2 查看状态：

```bash
pm2 status
pm2 logs xunjianbao-api
pm2 restart xunjianbao-api
```

Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status nginx
```

## 15. 当前模块说明

前端目前已经包含：

- 地图总览
- 小区档案
- 道路街面
- 重点点位
- 巡检报告
- 报告编写
- 待跟进线索
- 地图资产
- 操作日志

后端目前包含：

- 登录认证
- dashboard 数据
- 小区、道路、点位查询
- 问题台账
- 统一巡检任务、视频抽帧与 ZIP 图片解压
- 任务照片分发和唯一档案归属
- 综合报告提交、任务选图和查询
- 地图资产上传和查询
- 审计日志
- PostgreSQL 数据库存储（腾讯云 TencentDB for PostgreSQL）

报告编写页提交后会写入 PostgreSQL，并按任务唯一更新综合报告。所选照片关系与报告主体在同一事务中替换；档案照片墙读取真实归档照片，“从媒体库推送”会持久化照片的唯一档案归属。待分发照片采用稳定分页和专用索引；并发分发通过“待分发到终态”的条件更新和原子递减维护任务计数。
