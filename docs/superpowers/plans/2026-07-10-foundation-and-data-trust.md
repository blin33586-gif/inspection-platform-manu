# 巡检宝工程基线与数据可信度实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让巡检宝在开始接入真实媒体和巡检任务前，具备可部署的 API 入口、健康检查、生产环境配置校验和不再静默伪造数据的前端请求状态。

**Architecture:** 后端把运行环境解析和 Nest 应用创建拆开，测试可以直接验证配置规则和健康接口；前端把 API 错误转换成结构化错误，并由统一错误视图阻断样例数据继续作为真实业务数据展示。当前 SQLite 和本地文件存储保持不变，本模块不新增媒体、任务或 AI 数据表。

**Tech Stack:** React 18、Vite 5、TypeScript 5、Ant Design 5、NestJS 10、Prisma 7、Node `node:test`、tsx。

## Global Constraints

- 保持 Apple 风格的干净页面层级与稳重的政务蓝色体系。
- API 请求失败不得静默回退为样例数据。
- 未开放能力不得显示“操作成功”。
- API 在容器和本地反向代理环境监听 `0.0.0.0`。
- 生产环境缺少明确管理员账号、密码或签名密钥时必须拒绝启动。
- 不提交 `.env`、数据库文件、上传文件、密钥和 `backups/`。
- 每项任务执行 TDD，完成后运行类型检查和对应测试。

---

## File Structure

- Create: `services/api/src/config/runtime-config.ts` — 解析端口、监听地址、生产密钥要求。
- Create: `services/api/src/config/runtime-config.test.ts` — 运行环境规则的 Node 单元测试。
- Create: `services/api/src/modules/health/health.controller.ts` — 未鉴权健康检查。
- Create: `services/api/src/modules/health/health.module.ts` — 健康模块注册。
- Create: `services/api/src/modules/health/health.controller.test.ts` — 健康响应测试。
- Modify: `services/api/src/main.ts` — 使用运行配置、正确监听和启动失败处理。
- Modify: `services/api/src/app.module.ts` — 注册健康模块。
- Modify: `services/api/src/modules/auth/auth.guard.ts` — 放行健康检查。
- Modify: `services/api/package.json` — 增加 `test` 脚本。
- Create: `apps/admin-web/src/api/api-client-error.ts` — 结构化 API 错误类型。
- Create: `apps/admin-web/src/components/ApiResourceError.tsx` — 统一错误页和重试按钮。
- Modify: `apps/admin-web/src/api/client.ts` — 为所有请求抛出 `ApiClientError`。
- Modify: `apps/admin-web/src/hooks/useApiResource.ts` — 暴露 `loading`、`error`、`hasLoaded`，不在失败时覆盖为样例数据。
- Modify: `apps/admin-web/src/pages/DashboardPage.tsx` — API 失败显示错误页。
- Modify: `apps/admin-web/src/pages/CommunitiesPage.tsx`、`RoadsPage.tsx`、`PointsPage.tsx`、`IssuesPage.tsx`、`ReportsPage.tsx`、`MapAssetsPage.tsx`、`AuditLogsPage.tsx` — 列表页 API 失败显示错误页。
- Modify: `apps/admin-web/src/pages/ManagedObjectDetailPage.tsx`、`PointDetailPage.tsx`、`IssueDetailPage.tsx`、`ReportDetailPage.tsx`、`MapAssetDetailPage.tsx` — 详情 API 失败显示错误页，不展示第一条样例。
- Modify: `apps/admin-web/src/auth/session.ts` — 增加可复用的未授权会话清理函数。
- Modify: `docs/开发阶段记录.md` — 记录模块验收结果。

## Task 1: 可测试的后端运行配置与健康检查

**Files:**
- Create: `services/api/src/config/runtime-config.ts`
- Create: `services/api/src/config/runtime-config.test.ts`
- Create: `services/api/src/modules/health/health.controller.ts`
- Create: `services/api/src/modules/health/health.module.ts`
- Create: `services/api/src/modules/health/health.controller.test.ts`
- Modify: `services/api/src/main.ts`
- Modify: `services/api/src/app.module.ts`
- Modify: `services/api/src/modules/auth/auth.guard.ts`
- Modify: `services/api/package.json`

**Interfaces:**
- Produces: `resolveRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfig`。
- Produces: `RuntimeConfig = { port: number; host: string; isProduction: boolean; adminUsername?: string; adminPassword?: string; authSecret?: string }`。
- Produces: `GET /api/v1/health -> { code: 0, message: "ok", data: { status: "ok" } }`。

- [ ] **Step 1: 编写失败的运行配置测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { resolveRuntimeConfig } from "./runtime-config.js";

test("production requires explicit credentials and signing secret", () => {
  assert.throws(
    () => resolveRuntimeConfig({ NODE_ENV: "production" }),
    /ADMIN_USERNAME, ADMIN_PASSWORD and AUTH_SECRET/,
  );
});

test("development listens on all interfaces by default", () => {
  const config = resolveRuntimeConfig({});
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 3010);
});
```

- [ ] **Step 2: 运行测试并确认失败原因是模块不存在**

Run: `./node_modules/.bin/tsx --test src/config/runtime-config.test.ts`

Expected: FAIL with `Cannot find module './runtime-config.js'`.

- [ ] **Step 3: 实现运行配置**

```ts
export interface RuntimeConfig {
  port: number;
  host: string;
  isProduction: boolean;
}

export function resolveRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfig {
  const isProduction = env.NODE_ENV === "production";
  if (isProduction && (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD || !env.AUTH_SECRET)) {
    throw new Error("Production requires ADMIN_USERNAME, ADMIN_PASSWORD and AUTH_SECRET");
  }

  const port = Number(env.API_PORT ?? env.PORT ?? 3010);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("API_PORT must be a valid TCP port");

  return { port, host: env.API_HOST ?? "0.0.0.0", isProduction };
}
```

- [ ] **Step 4: 添加健康控制器并注册**

```ts
@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return ok({ status: "ok" });
  }
}
```

`HealthModule` 导入控制器；`AppModule` 导入 `HealthModule`；`AuthGuard` 对 `/api/v1/health` 返回 `true`；`main.ts` 调用 `resolveRuntimeConfig(process.env)` 后执行 `app.listen(config.port, config.host)`。

- [ ] **Step 5: 增加测试脚本并验证通过**

在 `services/api/package.json` 添加：

```json
"test": "tsx --test src/**/*.test.ts"
```

Run: `./node_modules/.bin/tsx --test src/config/runtime-config.test.ts src/modules/health/health.controller.test.ts`

Expected: PASS with all tests green.

- [ ] **Step 6: 提交任务**

```bash
git add services/api/package.json services/api/src/config services/api/src/modules/health services/api/src/main.ts services/api/src/app.module.ts services/api/src/modules/auth/auth.guard.ts
git commit -m "feat: add runtime validation and health endpoint"
```

## Task 2: 结构化前端 API 错误与会话失效处理

**Files:**
- Create: `apps/admin-web/src/api/api-client-error.ts`
- Modify: `apps/admin-web/src/api/client.ts`
- Modify: `apps/admin-web/src/auth/session.ts`
- Modify: `apps/admin-web/src/hooks/useApiResource.ts`

**Interfaces:**
- Produces: `class ApiClientError extends Error { status: number; message: string }`。
- Produces: `useApiResource<T>(path: string, initialData: T): ApiResourceState<T>`，其中 `hasLoaded` 仅在远端成功返回后为 `true`。
- Consumes: `clearSession()`，在状态码为 `401` 时清理无效会话。

- [ ] **Step 1: 编写失败的 API 错误测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError } from "./api-client-error.js";

test("keeps HTTP status and readable API message", () => {
  const error = new ApiClientError(422, "文件格式不支持");
  assert.equal(error.status, 422);
  assert.equal(error.message, "文件格式不支持");
});
```

- [ ] **Step 2: 运行测试并确认模块缺失**

Run: `../../services/api/node_modules/.bin/tsx --test src/api/api-client-error.test.ts`

Expected: FAIL with `Cannot find module './api-client-error.js'`.

- [ ] **Step 3: 实现错误类型和请求错误解析**

```ts
export class ApiClientError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiClientError";
  }
}
```

在 `client.ts` 中添加 `parseApiError(response)`：优先读取 JSON 响应的 `message`，读取失败时使用 `请求失败（HTTP ${response.status}）`；四个请求函数在 `!response.ok` 时抛出该错误。

- [ ] **Step 4: 让资源钩子保留错误而不伪装成功**

`useApiResource` 的初始化数据只用于首次加载骨架；请求失败时保留 `error`，设置 `loading: false`、`hasLoaded: false`，不把 `data` 重设为 `fallback`。当错误状态为 `401` 时执行 `clearSession()`。

- [ ] **Step 5: 运行错误类型测试与前端类型检查**

Run: `../../services/api/node_modules/.bin/tsx --test src/api/api-client-error.test.ts`

Expected: PASS.

Run: `./node_modules/.bin/tsc --noEmit`

Expected: exit code `0`.

- [ ] **Step 6: 提交任务**

```bash
git add apps/admin-web/src/api apps/admin-web/src/auth/session.ts apps/admin-web/src/hooks/useApiResource.ts
git commit -m "feat: expose API failures to the frontend"
```

## Task 3: 统一错误视图并移除列表页静默样例展示

**Files:**
- Create: `apps/admin-web/src/components/ApiResourceError.tsx`
- Modify: `apps/admin-web/src/pages/DashboardPage.tsx`
- Modify: `apps/admin-web/src/pages/CommunitiesPage.tsx`
- Modify: `apps/admin-web/src/pages/RoadsPage.tsx`
- Modify: `apps/admin-web/src/pages/PointsPage.tsx`
- Modify: `apps/admin-web/src/pages/IssuesPage.tsx`
- Modify: `apps/admin-web/src/pages/ReportsPage.tsx`
- Modify: `apps/admin-web/src/pages/MapAssetsPage.tsx`
- Modify: `apps/admin-web/src/pages/AuditLogsPage.tsx`

**Interfaces:**
- Produces: `<ApiResourceError error={Error} onRetry={() => void} />`。
- Consumes: 每个页面 `useApiResource` 返回的 `error` 和 `reload`。

- [ ] **Step 1: 编写失败的错误文本测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { getApiErrorCopy } from "./ApiResourceError.js";

test("maps unauthorized errors to an explicit login instruction", () => {
  assert.equal(getApiErrorCopy({ status: 401 } as Error & { status: number }), "登录状态已失效，请重新登录后再试");
});
```

- [ ] **Step 2: 运行测试并确认模块缺失**

Run: `../../services/api/node_modules/.bin/tsx --test src/components/ApiResourceError.test.ts`

Expected: FAIL with `Cannot find module './ApiResourceError.js'`.

- [ ] **Step 3: 实现统一错误视图**

```tsx
export function getApiErrorCopy(error: Error & { status?: number }) {
  if (error.status === 401) return "登录状态已失效，请重新登录后再试";
  return error.message || "数据加载失败，请检查服务连接后重试";
}

export function ApiResourceError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return <Result status="error" title="数据暂时无法加载" subTitle={getApiErrorCopy(error as Error & { status?: number })} extra={<Button type="primary" onClick={onRetry}>重新加载</Button>} />;
}
```

- [ ] **Step 4: 在八个列表页阻断样例数据渲染**

每个页面从对应资源钩子解构 `error` 和 `reload`，在页面主体渲染前加入：

```tsx
if (error) return <ApiResourceError error={error} onRetry={reload} />;
```

同一页面的多个请求只要任一请求失败，就显示统一错误视图；成功后继续使用原有页面布局。

- [ ] **Step 5: 运行测试、类型检查和生产构建**

Run: `../../services/api/node_modules/.bin/tsx --test src/components/ApiResourceError.test.ts`

Expected: PASS.

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vite build`

Expected: exit code `0`.

- [ ] **Step 6: 提交任务**

```bash
git add apps/admin-web/src/components/ApiResourceError.tsx apps/admin-web/src/pages/DashboardPage.tsx apps/admin-web/src/pages/CommunitiesPage.tsx apps/admin-web/src/pages/RoadsPage.tsx apps/admin-web/src/pages/PointsPage.tsx apps/admin-web/src/pages/IssuesPage.tsx apps/admin-web/src/pages/ReportsPage.tsx apps/admin-web/src/pages/MapAssetsPage.tsx apps/admin-web/src/pages/AuditLogsPage.tsx
git commit -m "fix: show API failures instead of sample data"
```

## Task 4: 详情页错误边界与不存在资源处理

**Files:**
- Modify: `apps/admin-web/src/pages/ManagedObjectDetailPage.tsx`
- Modify: `apps/admin-web/src/pages/PointDetailPage.tsx`
- Modify: `apps/admin-web/src/pages/IssueDetailPage.tsx`
- Modify: `apps/admin-web/src/pages/ReportDetailPage.tsx`
- Modify: `apps/admin-web/src/pages/MapAssetDetailPage.tsx`

**Interfaces:**
- Consumes: `<ApiResourceError>` 和 `useApiResource` 的 `error`、`reload`。
- Produces: 404 和网络故障时不再显示第一条样例详情。

- [ ] **Step 1: 编写失败的 404 文本测试**

```ts
test("maps missing resources to an explicit not-found instruction", () => {
  assert.equal(getApiErrorCopy({ status: 404 } as Error & { status: number }), "该条资料不存在，可能已被删除或没有访问权限");
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `../../services/api/node_modules/.bin/tsx --test src/components/ApiResourceError.test.ts`

Expected: FAIL because `getApiErrorCopy` has not mapped `404`.

- [ ] **Step 3: 扩展错误视图并接入五个详情页**

在 `getApiErrorCopy` 加入：

```ts
if (error.status === 404) return "该条资料不存在，可能已被删除或没有访问权限";
```

五个详情页均在读取资源后优先渲染 `<ApiResourceError error={error} onRetry={reload} />`。不保留 `fallback[0]`、`?? fallback` 或静态详情替代逻辑。

- [ ] **Step 4: 运行测试和全量前端构建**

Run: `../../services/api/node_modules/.bin/tsx --test src/components/ApiResourceError.test.ts`

Expected: PASS.

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vite build`

Expected: exit code `0`.

- [ ] **Step 5: 浏览器验收**

1. 登录管理端。
2. 临时访问一个不存在的报告详情地址。
3. 页面显示“不存在”错误和“重新加载”按钮。
4. 恢复有效地址后，页面重新显示真实详情。
5. 停止 API 或使用不可达 API 地址时，列表页显示错误页，不出现样例列表。

- [ ] **Step 6: 提交任务**

```bash
git add apps/admin-web/src/components/ApiResourceError.tsx apps/admin-web/src/pages/ManagedObjectDetailPage.tsx apps/admin-web/src/pages/PointDetailPage.tsx apps/admin-web/src/pages/IssueDetailPage.tsx apps/admin-web/src/pages/ReportDetailPage.tsx apps/admin-web/src/pages/MapAssetDetailPage.tsx
git commit -m "fix: prevent fallback detail data on request errors"
```

## Task 5: 模块验收和记录

**Files:**
- Modify: `docs/开发阶段记录.md`

**Interfaces:**
- Consumes: Task 1 至 Task 4 的测试和浏览器验收结果。
- Produces: 可回溯的模块 1 验收记录。

- [ ] **Step 1: 执行完整验证**

Run: `./node_modules/.bin/tsx --test src/config/runtime-config.test.ts src/modules/health/health.controller.test.ts`

Expected: PASS.

Run: `../../services/api/node_modules/.bin/tsx --test src/api/api-client-error.test.ts src/components/ApiResourceError.test.ts`

Expected: PASS.

Run: `./node_modules/.bin/tsc --noEmit`

Expected: exit code `0` in `services/api` and `apps/admin-web`.

Run: `./node_modules/.bin/vite build`

Expected: exit code `0` in `apps/admin-web`.

- [ ] **Step 2: 更新阶段记录**

在 `docs/开发阶段记录.md` 增加“真实业务闭环模块 1：工程与数据可信度”章节，记录：健康检查地址、生产环境启动校验、API 错误页面、浏览器验收结果和对应提交号。

- [ ] **Step 3: 提交模块**

```bash
git add docs/开发阶段记录.md
git commit -m "docs: record workflow foundation acceptance"
```

## Self-Review

- 规格第 3、9、10 和 11 节分别由 Task 2 至 Task 5 覆盖；媒体资产、任务、复核和报告持久化在后续独立计划处理。
- 所有新增类型、函数和路径均在相应任务中首次定义，后续任务没有引用未声明接口。
- `ApiClientError.status`、`getApiErrorCopy`、`RuntimeConfig` 和 `resolveRuntimeConfig` 在所有后续任务中使用相同名称和参数。
