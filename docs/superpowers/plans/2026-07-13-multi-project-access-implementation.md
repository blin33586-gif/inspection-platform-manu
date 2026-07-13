# 巡检宝多项目登录与权限 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加登录后的项目选择、管理员/只读成员权限和曲阳/金山项目数据隔离，并移除档案处置时间线。

**Architecture:** 认证令牌携带角色和允许访问的项目；前端通过 `X-Project-Id` 发送当前项目；后端全局守卫验证项目访问和写权限。核心业务记录保存 `projectId`，所有主业务入口按项目过滤。

**Tech Stack:** NestJS 10、Prisma 7、PostgreSQL、React 18、React Router 6、Ant Design、Node test runner。

## Global Constraints

- 保留当前工作区未提交的档案真实数据改动。
- 不重新设计已稳定的地图、任务库、问题库和报告流程。
- 成员权限必须由后端强制执行。
- 旧数据全部归入曲阳项目。
- 本阶段不做处置时间线。

---

### Task 1: 认证令牌、项目访问与只读权限

**Files:**
- Modify: `services/api/src/modules/auth/auth.service.ts`
- Modify: `services/api/src/modules/auth/auth.guard.ts`
- Modify: `services/api/src/modules/auth/auth.controller.ts`
- Test: `services/api/src/modules/auth/auth.service.test.ts`
- Test: `services/api/src/modules/auth/auth.guard.test.ts`

- [ ] 先写失败测试：管理员和成员均能登录，令牌能还原角色和项目，成员写请求被拒绝。
- [ ] 运行测试并确认因新能力缺失而失败。
- [ ] 实现带过期时间的签名令牌、项目列表接口、项目请求头校验和成员写保护。
- [ ] 重跑认证测试并确认通过。

### Task 2: 项目模型与核心数据项目字段

**Files:**
- Modify: `services/api/prisma/schema.prisma`
- Create: `services/api/prisma/migrations/20260713190000_multi_project_access/migration.sql`
- Modify: `services/api/prisma/seed.ts`
- Test: `services/api/prisma/project-access-schema.test.ts`

- [ ] 先写失败的结构测试，要求项目表、核心业务表 `projectId` 和项目索引存在。
- [ ] 运行结构测试并确认失败。
- [ ] 增加项目模型和迁移，把既有数据归入 `quyang`，插入 `jinshan` 项目和三类示例档案。
- [ ] 生成 Prisma Client 并重跑结构测试。

### Task 3: 主业务读取与写入按项目隔离

**Files:**
- Modify: `services/api/src/database/inspection-read.repository.ts`
- Modify: `services/api/src/modules/managed-objects/*.ts`
- Modify: `services/api/src/modules/issues/*.ts`
- Modify: `services/api/src/modules/reports/*.ts`
- Modify: `services/api/src/modules/map-assets/*.ts`
- Modify: `services/api/src/modules/inspection-tasks/*.ts`
- Modify: `services/api/src/modules/media/*.ts`
- Modify: `services/api/src/modules/audit/*.ts`
- Test: `services/api/src/database/project-isolation.test.ts`

- [ ] 先写失败测试，证明曲阳请求不能读取金山对象，金山请求不能读取曲阳对象。
- [ ] 运行测试并确认失败原因是查询缺少项目条件。
- [ ] 为主列表、详情、创建、更新和删除加入当前 `projectId` 条件。
- [ ] 重跑项目隔离测试和现有 API 测试。

### Task 4: 前端会话、项目选择与项目化导航

**Files:**
- Modify: `apps/admin-web/src/auth/session.ts`
- Modify: `apps/admin-web/src/api/client.ts`
- Modify: `apps/admin-web/src/pages/LoginPage.tsx`
- Create: `apps/admin-web/src/pages/ProjectSelectPage.tsx`
- Modify: `apps/admin-web/src/App.tsx`
- Modify: `apps/admin-web/src/components/Shell.tsx`
- Create: `apps/admin-web/src/auth/project-access.test.ts`

- [ ] 先写失败测试，覆盖当前项目保存、请求头生成和管理员/成员能力判断。
- [ ] 运行测试并确认失败。
- [ ] 登录后跳转项目选择页；选中后保存项目；API 自动附加项目请求头；顶部提供切换项目入口。
- [ ] 重跑前端单元测试和类型检查。

### Task 5: 金山档案维度、成员只读界面与时间线移除

**Files:**
- Modify: `apps/admin-web/src/components/Shell.tsx`
- Modify: `apps/admin-web/src/components/ProjectArchiveWorkspace.tsx`
- Create: `apps/admin-web/src/components/project-archive-overview-presenter.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/admin-web/src/components/project-archive-overview-presenter.test.ts`

- [ ] 先调整失败测试，明确档案概览只包含真实 KPI 和问题列表，不包含处置时间线。
- [ ] 实现真实概览展示，删除模拟问题和处置时间线。
- [ ] 根据当前项目显示曲阳或金山档案维度；成员隐藏编辑、删除和解除关联操作。
- [ ] 运行前端类型检查和构建。

### Task 6: 验收

- [ ] 运行 API 全量测试。
- [ ] 运行全仓类型检查和前端构建。
- [ ] 部署迁移并启动本地服务。
- [ ] 浏览器验证管理员、成员、两个项目切换、数据隔离和时间线移除。
- [ ] 检查 `git diff`，只保留本轮范围内文件。
