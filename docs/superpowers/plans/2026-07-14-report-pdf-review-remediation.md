# Report PDF Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复报告 PDF 复核中的资源保护、路径安全、内容一致性、长标题分页、接口契约和前端下载交互问题。

**Architecture:** 保留 API 侧 Chromium HTML 打印引擎。将报告照片页的标题、视频时间、经纬度、默认说明和页脚文案集中到 `@xunjianbao/shared`，页面与服务端模板使用同一模型；API 在读取图片和启动 Chromium 前执行路径、页数、累计字节、处理并发及全局导出并发限制。

**Tech Stack:** TypeScript、NestJS、React、Node test runner、Puppeteer/Chromium、Poppler `pdfinfo`。

## Global Constraints

- 所有行为修改先写测试并实际观察目标失败，再写生产代码。
- PDF 保持封面一页、每张照片一页，服务端继续使用 HTML 打印引擎。
- 所有数据库文件路径只能位于 `process.cwd()/storage`。
- 前端报告加载完成前不得导出，下载文件名优先采用响应 `Content-Disposition`。

---

### Task 1: 资源与路径保护

**Files:**
- Modify: `services/api/src/modules/reports/report-pdf.service.test.ts`
- Modify: `services/api/src/modules/reports/report-pdf.service.ts`

**Interfaces:**
- Produces: `resolveReportStoragePath(storagePath, cwd?)`、`createConcurrencyGate(limit)`、照片页数和累计输入字节常量。

- [ ] 增加路径逃逸、超页数、超累计字节、图片处理并发上限及导出并发门控测试。
- [ ] 运行聚焦测试，确认分别因缺少校验或并发失控而失败。
- [ ] 实现 storage 根校验、最多 100 张照片、累计最多 100 MiB、最多 2 张图片并发处理和全局最多 2 个 PDF 导出。
- [ ] 运行聚焦测试，确认全部通过。

### Task 2: 共享报告页模型与 HTML 一致性

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `services/api/src/modules/reports/report-pdf-template.test.ts`
- Modify: `services/api/src/modules/reports/report-pdf-template.ts`
- Modify: `services/api/src/modules/reports/report-pdf.service.ts`
- Modify: `apps/admin-web/src/pages/ReportDetailPage.tsx`

**Interfaces:**
- Produces: `buildReportPhotoPageModel(input)`，包含 `indexLabel`、`title`、`videoTime`、`coordinates`、`description`、`footer`。

- [ ] 增加服务端 HTML 视频时间、经纬度、页脚及共享默认文案测试。
- [ ] 运行测试，确认遗漏字段导致失败。
- [ ] 在共享包实现统一格式规则，并让服务端模板和 React 页面共同消费。
- [ ] 运行聚焦测试和共享包类型检查。

### Task 3: 固定封面与真实 Chromium 验证

**Files:**
- Modify: `services/api/src/modules/reports/report-pdf-template.test.ts`
- Modify: `services/api/src/modules/reports/report-pdf-template.ts`

- [ ] 增加封面固定 A4 高度、标题预留区与溢出约束测试并观察失败。
- [ ] 实现固定 297mm 封面和有界标题区域。
- [ ] 用本机 Chrome 生成极端长标题 PDF，并用 `pdfinfo` 断言 A4 且页数等于封面加照片页。

### Task 4: 控制器响应契约

**Files:**
- Create: `services/api/src/modules/reports/reports.controller.test.ts`
- Modify: `services/api/src/modules/reports/reports.controller.ts`（仅在测试暴露契约缺口时）

- [ ] 增加项目范围查询、`application/pdf`、attachment `Content-Disposition` 和非空 PDF 字节测试。
- [ ] 运行并观察测试在当前缺少覆盖或契约缺口处失败。
- [ ] 最小修复并运行服务/控制器聚焦测试。

### Task 5: 前端下载交互

**Files:**
- Modify: `apps/admin-web/src/pages/report-export.test.ts`
- Modify: `apps/admin-web/src/pages/report-export.ts`
- Modify: `apps/admin-web/src/api/client.ts`
- Modify: `apps/admin-web/src/pages/ReportDetailPage.tsx`

**Interfaces:**
- Produces: `getContentDispositionFileName(header, fallback)`、可注入下载保存边界、单飞导出保护。

- [ ] 增加重复导出、鉴权和项目请求头、错误透传、响应文件名、对象 URL 清理测试并观察失败。
- [ ] 实现响应文件名解析、finally 清理、单飞保护；页面使用 `hasLoaded` 禁用按钮。
- [ ] 运行前端聚焦测试。

### Task 6: 验证、报告与提交

**Files:**
- Modify: `.superpowers/sdd/report-pdf-report.md`

- [ ] 运行报告模块全部测试、前端相关测试、共享/API/Web 类型检查。
- [ ] 运行真实 Chromium 长标题 A4 页数验证并记录证据。
- [ ] 清除报告行尾空白，追加每类 RED/GREEN 命令与结果。
- [ ] 检查 diff 只位于当前 worktree，提交全部修复。
