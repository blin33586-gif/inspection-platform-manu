# 报告 PDF 导出与长标题排版交付报告

工作区：`/Users/bolin/Documents/巡检宝/.worktrees/report-pdf`  
分支：`codex/report-pdf`  
执行日期：2026-07-14

## 前置检查

- 已确认当前目录是 linked worktree：Git 目录为 `/Users/bolin/Documents/巡检宝/.git/worktrees/report-pdf`，公共 Git 目录为 `/Users/bolin/Documents/巡检宝/.git`。
- 已确认分支为 `codex/report-pdf`。
- 已执行 `corepack pnpm db:generate`，Prisma Client v7.8.0 生成成功。
- 基线命令 `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/*.test.ts` 被根目录 zsh 提前展开，报 `no matches found`；改用明确测试文件后，原有 `report-create.service.test.ts` 3/3 通过。后续聚焦测试使用子包内 shell 展开，避免壳层假失败。

## Task 1：PDF browser runtime

提交：`d70a755 build: add report PDF browser runtime`

改动文件：

- `pnpm-lock.yaml`
- `services/api/Dockerfile`
- `services/api/package.json`
- `services/api/src/modules/reports/pdf-browser-runtime.test.ts`
- `services/api/src/modules/reports/pdf-browser-runtime.ts`

RED：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/pdf-browser-runtime.test.ts
```

结果：退出码 1；`ERR_MODULE_NOT_FOUND`，缺少 `pdf-browser-runtime.js`，符合预期。

GREEN：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/pdf-browser-runtime.test.ts
```

结果：3 tests，3 pass，0 fail。已添加 `puppeteer-core@^24.15.0` 直接依赖；API 镜像安装 Chromium 与 Noto CJK 字体，并设置 `/usr/bin/chromium`。

## Task 2：Self-contained report HTML renderer

提交：`b2aae25 feat: render printable report PDF HTML`

改动文件：

- `services/api/src/modules/reports/report-pdf-template.test.ts`
- `services/api/src/modules/reports/report-pdf-template.ts`

RED：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf-template.test.ts
```

结果：退出码 1；`ERR_MODULE_NOT_FOUND`，缺少 `report-pdf-template.js`，符合预期。

GREEN：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf-template.test.ts
corepack pnpm --filter @xunjianbao/api typecheck
```

结果：渲染器 2/2 通过，API 类型检查退出码 0。实现 A4 无边距页面、封面、每图一页、长标题任意断行、HTML 五类字符转义和安全 PDF 文件名。

## Task 3：Project-scoped PDF endpoint

提交：`9f7764e feat: export generated reports as PDF`

改动文件：

- `services/api/src/modules/reports/report-pdf-template.ts`
- `services/api/src/modules/reports/report-pdf.service.test.ts`
- `services/api/src/modules/reports/report-pdf.service.ts`
- `services/api/src/modules/reports/reports.controller.ts`
- `services/api/src/modules/reports/reports.module.ts`

RED：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf.service.test.ts
```

结果：退出码 1；`ERR_MODULE_NOT_FOUND`，缺少 `report-pdf.service.js`，符合预期。

实现后的第一次测试仍保持红灯：期望 `历史任务_DJI_0003.pdf`，实际为 `历史任务 _ DJI_0003.pdf`。随后仅补充下划线两侧空白归一化。

GREEN：

```sh
corepack pnpm --filter @xunjianbao/api exec sh -c 'tsx --test src/modules/reports/*.test.ts'
corepack pnpm --filter @xunjianbao/api typecheck
```

结果：报告模块 9/9 通过，API 类型检查退出码 0。查询条件包含 `{ id, projectId }`；图片按问题卡、媒体预览、原始媒体顺序选择；不支持的图片 MIME 经 sharp 转 JPEG；Puppeteer 使用 A4/CSS 页尺寸/背景打印并在 `finally` 关闭；新增认证范围内的 `GET /reports/:id/pdf`。

## Task 4：Download action and responsive title layout

提交：`32695b1 fix: download report PDFs and wrap long titles`

改动文件：

- `apps/admin-web/src/api/client.ts`
- `apps/admin-web/src/pages/ReportDetailPage.tsx`
- `apps/admin-web/src/pages/report-export.test.ts`
- `apps/admin-web/src/pages/report-export.ts`
- `apps/admin-web/src/styles/global.css`

RED：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/pages/report-export.test.ts
```

结果：退出码 1；`ERR_MODULE_NOT_FOUND`，缺少 `report-export.js`，符合预期。

GREEN：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/pages/report-export.test.ts
corepack pnpm --filter @xunjianbao/admin-web typecheck
```

结果：文件名测试 1/1 通过，前端类型检查退出码 0。下载请求复用认证和项目请求头，错误复用 `parseApiError`，对象 URL 与临时 anchor 均清理；页面提供独立“导出 PDF”和“打印”按钮；标题和 900px 断点规则已加入。

## Task 5：自动化与本地 PDF 可行性验证

未产生修复提交。

执行：

```sh
corepack pnpm --filter @xunjianbao/api exec sh -c 'tsx --test src/modules/reports/*.test.ts'
corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/pages/report-export.test.ts
corepack pnpm --filter @xunjianbao/api typecheck && corepack pnpm --filter @xunjianbao/admin-web typecheck
```

结果：API 报告测试 9/9 通过；前端导出测试 1/1 通过；两端类型检查均退出码 0。

未启动或停止共享的 5183/3010 服务。使用本机 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` 直接加载纯 HTML 模板并生成 `/tmp/report-pdf-smoke.pdf`：

- 文件头：`%PDF`
- 文件大小：104,110 字节
- 页数：2（封面 1 页 + 照片 1 页）
- 页面尺寸：594.96 × 841.92 pt（A4）

## 未完成事项与风险

- 按任务边界，未在共享开发栈登录、未请求真实报告 `rp-55895eee-827c-42fd-b327-77086d27f46b`；真实鉴权下载、响应大于 1 KB 的端到端验收由主代理完成。
- 未做共享前端 825px 真实浏览器截图验收；主代理需确认顶栏与 A4 预览中的长标题均不越界，且导出、打印按钮可见。
- 已验证本机 Chrome 生成链路，但未执行 API Docker 镜像构建；Alpine Chromium 与 `font-noto-cjk` 的仓库可用性仍应由部署流水线验证。
