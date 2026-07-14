# Report PDF Important Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收紧报告 PDF 图片、并发队列、真实路径、长文本和 HTTP 鉴权边界。

**Architecture:** 所有图片在 HTML 嵌入前统一通过 sharp 受控预览流水线；导出门控使用单并发、有界队列和等待超时。文件先做 storage 词法约束，再用 realpath 做真实路径约束；长文本使用可见省略策略，文件名按 UTF-8 字节截断。

**Tech Stack:** TypeScript、NestJS、sharp、Puppeteer、Node test runner。

## Global Constraints

- 每类行为先增加失败测试并观察 RED。
- 单图最大 10 MiB，累计输入最大 50 MiB，像素最大 20,000,000。
- 预览最长边不超过 2000px，JPEG 质量 82。
- 实际 PDF 导出并发为 1，等待队列最多 3，默认等待 15 秒。

---

### Task 1: 受控图片预览

**Files:**
- Modify: `services/api/src/modules/reports/report-pdf.service.test.ts`
- Modify: `services/api/src/modules/reports/report-pdf.service.ts`

**Interfaces:**
- Produces: 单图/累计/像素上限常量和统一 JPEG 预览数据 URL。

- [ ] 增加单图过大、总量降低、超像素和最长边/格式受控测试。
- [ ] 运行测试并确认当前原图直嵌行为失败。
- [ ] 使用 `sharp(bytes, { limitInputPixels: 20_000_000 }).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 })` 生成预览。
- [ ] 运行聚焦测试到 GREEN。

### Task 2: 有界导出门控

**Files:**
- Modify: `services/api/src/modules/reports/report-pdf.service.test.ts`
- Modify: `services/api/src/modules/reports/report-pdf.service.ts`

**Interfaces:**
- Produces: `createConcurrencyGate(limit, { maxQueue, waitTimeoutMs })`，队列满返回 429，等待超时返回 503。

- [ ] 增加队列满和等待超时测试并观察失败。
- [ ] 实现可移除的等待项、定时器清理和单并发默认门控。
- [ ] 运行门控测试到 GREEN。

### Task 3: realpath 路径约束

**Files:**
- Modify: `services/api/src/modules/reports/report-pdf.service.test.ts`
- Modify: `services/api/src/modules/reports/report-pdf.service.ts`

- [ ] 创建 storage 内指向外部文件的符号链接测试并观察服务错误地读取。
- [ ] 在读取前 `realpath`，再次确认真实路径仍位于 storage 根。
- [ ] 运行路径测试到 GREEN。

### Task 4: 长文本和 UTF-8 文件名

**Files:**
- Modify: `services/api/src/modules/reports/report-create.service.test.ts`
- Modify: `services/api/src/modules/reports/report-create.service.ts`
- Modify: `services/api/src/modules/reports/report-pdf-template.test.ts`
- Modify: `services/api/src/modules/reports/report-pdf-template.ts`

- [ ] 增加标题长度、CSS 多行省略和 UTF-8 字节限制测试并观察失败。
- [ ] 报告写入拒绝超过 200 字符标题；标题和摘要启用 Chromium 多行省略；PDF 文件名不超过 180 UTF-8 字节并保留 `.pdf`。
- [ ] 运行聚焦测试到 GREEN。

### Task 5: Nest HTTP 鉴权路由

**Files:**
- Modify: `services/api/src/modules/reports/reports.controller.test.ts`

- [ ] 启动最小 Nest HTTP 测试应用，覆盖无令牌 401、无项目头 400、越权项目 403、正确项目头 200。
- [ ] 确认成功请求收到 PDF MIME、attachment 和 `%PDF` 字节。

### Task 6: 验证与提交

**Files:**
- Modify: `.superpowers/sdd/report-pdf-report.md`

- [ ] 重跑报告测试、前端现有逻辑测试、shared/API/admin-web 类型检查。
- [ ] 用真实 Chrome 验证长标题 A4 页数。
- [ ] 追加 RED/GREEN 证据，检查 diff，提交当前 worktree。
