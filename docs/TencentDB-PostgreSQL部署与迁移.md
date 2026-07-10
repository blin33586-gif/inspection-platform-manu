# 巡检宝 TencentDB for PostgreSQL 部署与迁移

## 技术决策

巡检宝的主业务数据库采用 **腾讯云 TencentDB for PostgreSQL**，应用层使用 Prisma 7、`pg` 和 `@prisma/adapter-pg` 访问。SQLite 仅保留为本次迁移的来源文件，不再作为生产运行数据库。

PostgreSQL 适合巡检宝的多用户任务、问题闭环、报告、媒体元数据和审计日志等关联数据。后续需要地图空间查询时可引入 PostGIS；视频分析队列和缓存使用 Redis，大文件使用腾讯云 COS 或服务器挂载存储，不放入数据库字段。

## 腾讯云资源配置

1. 创建 TencentDB for PostgreSQL 实例，地域与巡检宝 CVM 保持一致。
2. 将 PostgreSQL 实例与 CVM 放入同一 VPC，通过内网地址连接。
3. 创建数据库 `xunjianbao` 与专用业务账号 `xunjianbao_app`，账号仅授予该数据库的读写权限。
4. 数据库安全组仅允许巡检宝 CVM 的安全组访问 TCP `5432`；不要为业务流量开启数据库公网地址。
5. 在控制台开启自动备份、日志备份和监控告警；如启用 SSL，连接串加入 `sslmode=require`。

生产 `.env` 示例：

```env
DATABASE_URL=postgresql://xunjianbao_app:URL编码后的强密码@腾讯云数据库内网地址:5432/xunjianbao?schema=public&sslmode=require
API_PORT=3010
VITE_API_BASE_URL=/api/v1
ADMIN_USERNAME=单独设置的管理员账号
ADMIN_PASSWORD=强密码
AUTH_SECRET=随机生成的长密钥
```

## 首次切换步骤

切换窗口内停止旧 API 写入，保留 SQLite 和上传文件的备份。迁移脚本只允许导入到空的 PostgreSQL 数据库，避免重复写入。

```bash
cd /opt/xunjianbao
cp .env.example .env
nano .env

corepack pnpm --filter @xunjianbao/api db:generate
corepack pnpm --filter @xunjianbao/api db:deploy

SQLITE_SOURCE_PATH=/opt/xunjianbao/backup/xunjianbao.db \
corepack pnpm --filter @xunjianbao/api db:migrate-sqlite
```

迁移脚本会按外键依赖顺序写入所有业务表，并将 PostgreSQL 各表记录数与 SQLite 来源逐表核对。上传的报告、照片、地图瓦片和视频文件不在数据库内，需单独同步：

```bash
rsync -a /opt/xunjianbao-backup/storage/ /opt/xunjianbao/services/api/storage/
```

完成后启动服务并验证：

```bash
docker compose up -d --build
curl http://127.0.0.1:3010/api/v1/health
```

## 本机验证环境

本机已安装 PostgreSQL 16，并创建数据库 `xunjianbao`。默认开发连接是：

```text
postgresql://xunjianbao:本机开发密码@127.0.0.1:5432/xunjianbao?schema=public
```

日常开发启动：

```bash
brew services start postgresql@16
corepack pnpm --filter @xunjianbao/api db:deploy
corepack pnpm dev:api
```

若使用 Docker 做本地一体化验证：

```bash
docker compose -f docker-compose.yml -f docker-compose.local-postgres.yml up --build
```

## 运行维护

- 业务数据库始终通过 VPC 内网访问，不向互联网开放 `5432`。
- 每次发布前执行 `db:deploy`，不要在生产环境执行 `db:migrate` 或 `db:push`。
- 腾讯云自动备份之外，建议每周保留一份逻辑备份：`pg_dump -Fc`。
- 上传文件使用独立存储卷；视频分析量上来后迁移到腾讯云 COS，并在数据库中保存对象键和元数据。
- Redis 是第二阶段组件，用于视频抽帧、AI 识别、报告生成的异步任务，不替代 PostgreSQL。
