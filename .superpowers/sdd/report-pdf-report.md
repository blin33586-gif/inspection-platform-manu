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

## 复核修复：资源、路径与并发保护

实现内容：

- 报告最多 100 张照片，超限在读图前以“报告照片不能超过 100 张”拒绝。
- 所有源照片累计最多 100 MiB，先读取文件元数据再开始读图，超限以“报告照片文件总大小不能超过 100 MB”拒绝。
- 图片读取/转换使用固定 2 路 worker，不再对全部照片直接 `Promise.all`。
- 进程级 PDF 导出门控固定为 2 路，限制图片处理和 Chromium 生成链路的总体并发。
- 数据库存储路径只接受 `process.cwd()/storage` 下的相对路径；绝对路径、非 `storage/` 路径和 `..` 逃逸均以中文错误拒绝。

RED：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf.service.test.ts
```

首次路径测试退出码 1，报 `resolveReportStoragePath` 未导出；资源测试退出码 1，报上限和门控导出不存在，符合预期。

GREEN：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf.service.test.ts
```

结果：6 tests，6 pass，0 fail。覆盖 storage 根约束、超照片页数、超累计字节、全局导出门控、最多两路图片处理、项目范围查询和生成 HTML 元数据。

## 复核修复：共享报告模型与 PDF 内容一致性

实现内容：

- 新增 `@xunjianbao/shared` 报告文案常量和照片页模型。
- Web 页面与服务端 PDF 共同消费标题回退、问题序号、视频时间、六位经纬度、默认说明、页脚及封面/字段文案。
- 服务端查询将 `videoTimestampMs`、标注优先的经纬度和问题说明传入共享模型；PDF HTML 输出对应字段和页脚。

RED：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-presentation.test.ts
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf-template.test.ts
```

共享模型测试先以模块不存在退出码 1；PDF 模板测试随后因缺少“视频时间点”字段失败，文案常量测试因 `REPORT_DOCUMENT_COPY` 未导出失败，均符合预期。

GREEN：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-presentation.test.ts src/modules/reports/report-pdf-template.test.ts
```

结果：7 tests，7 pass，0 fail。服务测试另验证数据库字段实际进入最终 PDF HTML。

## 复核修复：固定封面与真实 Chromium

实现内容：

- 封面和照片页固定为 `210mm × 297mm`，封面超出内容隐藏，不再由极端长标题撑出额外页。
- 标题预留区固定最大 86mm，保持任意位置换行并限制纵向溢出；摘要区也设置有界高度。

RED：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf-template.test.ts
```

结果：退出码 1；长标题测试未找到封面固定 297mm 高度和标题有界区域，符合预期。

GREEN 与真实浏览器验证：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf-template.test.ts
corepack pnpm --filter @xunjianbao/api exec tsx -e '<使用本机 Google Chrome 渲染重复 240 次的极端长标题及 1 张照片>'
pdfinfo /tmp/report-pdf-long-title-review.pdf | rg '^(Pages|Page size|File size)'
```

结果：模板 4/4 通过；真实 Chrome PDF 为 2 页（封面 1 页 + 照片 1 页），`594.96 × 841.92 pt (A4)`，134,477 字节。

## 复核修复：控制器响应契约

RED：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/reports.controller.test.ts
```

结果：退出码 1；响应只有 `filename*`，缺少 ASCII `filename` 下载回退。

GREEN：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/reports.controller.test.ts src/modules/reports/report-pdf.service.test.ts
```

结果：6 tests，6 pass，0 fail。覆盖 `{ id, projectId }` 查询、`application/pdf`、attachment `Content-Disposition`、UTF-8 文件名和非空 `%PDF` 字节。

## 复核修复：前端下载交互

实现内容：

- 下载文件名优先解析响应 `Content-Disposition` 的 RFC 5987 `filename*`，再回退普通 `filename` 和页面标题。
- 下载请求继续复用 Bearer 鉴权头和 `X-Project-Id` 项目头。
- 单飞执行器防止瞬时重复导出，保持原始错误向上传递；报告 `hasLoaded` 前按钮禁用。
- 临时 anchor 与对象 URL 在成功、点击异常或挂载异常时均由 `finally` 清理。

RED：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/api/file-download.test.ts ../../apps/admin-web/src/pages/report-export.test.ts
```

首次退出码 1，缺少下载边界模块及单飞/加载状态导出；异常清理补充测试随后以对象 URL 未释放失败，符合预期。

GREEN：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/api/file-download.test.ts ../../apps/admin-web/src/pages/report-export.test.ts
```

结果：7 tests，7 pass，0 fail。

## 复核修复最终验证

```sh
corepack pnpm --filter @xunjianbao/api exec sh -c 'tsx --test src/modules/reports/*.test.ts'
corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/api/file-download.test.ts ../../apps/admin-web/src/pages/report-export.test.ts
corepack pnpm --filter @xunjianbao/shared typecheck
corepack pnpm --filter @xunjianbao/api typecheck
corepack pnpm --filter @xunjianbao/admin-web typecheck
```

结果：报告模块 20/20 通过；前端相关测试 7/7 通过；shared、API、admin-web 三端类型检查均退出码 0。

## 第二轮复核：受控图片预览

实现内容：

- 单张源图片最大 10 MiB，累计输入最大 50 MiB，解码像素最大 20,000,000。
- 所有图片格式在嵌入 HTML 前统一经过 sharp：自动旋转、最长边 2000px、禁止放大、JPEG 质量 82。
- 浏览器可直接显示的 PNG、WebP、GIF、SVG 等格式也不再绕过预览流水线。

RED：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf.service.test.ts
```

结果：退出码 1；缺少单图、像素和预览边长常量。补齐测试后，原实现还会直接嵌入 SVG 而不是生成受控 JPEG，符合预期。

GREEN：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf.service.test.ts
```

结果：图片资源、门控和路径测试合计 13/13 通过；测试实际解码生成的预览并确认格式为 JPEG、宽高均不超过 2000px。

## 第二轮复核：有界导出队列

实现内容：

- 进程级实际 PDF 导出并发由 2 降为 1。
- 默认等待队列最多 3 个请求，队列满立即返回中文 429。
- 默认等待时间最长 15 秒，超时从队列移除并返回中文 503。

RED：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf.service.test.ts
```

结果：退出码 1；`REPORT_PDF_EXPORT_CONCURRENCY` 未导出，原门控也忽略队列上限和等待超时配置。

GREEN：

同一聚焦命令中，单并发、队列满 429、等待超时 503 和槽位释放测试全部通过。

## 第二轮复核：realpath 路径约束

RED：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf.service.test.ts
```

结果：12/13 通过；storage 内指向外部临时目录的符号链接被错误读取，测试报 `Missing expected rejection`。

GREEN：

读取前先 `realpath`，再以绝对真实路径重新验证 storage 根。聚焦测试 13/13 通过，符号链接逃逸以“报告照片真实路径不在 storage 目录内”拒绝。

## 第二轮复核：长文本与 UTF-8 文件名

实现内容：

- 任务报告写入前拒绝超过 200 个 Unicode 字符的标题。
- 封面标题和摘要使用 Chromium 多行省略号；标题 6 行，摘要按 48mm 实际高度调整为 6 行，避免先被高度静默裁切。
- PDF 文件名按 UTF-8 完整字符截断，总长度不超过 180 字节并完整保留 `.pdf`。

RED：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf-template.test.ts src/modules/reports/report-create.service.test.ts
```

结果：3 个目标失败，分别为超长标题进入数据库流程、文件名超过 180 字节、模板缺少多行省略规则。摘要行数校准测试另观察到 8 行超过 48mm 区域，随后改为 6 行。

GREEN：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf-template.test.ts src/modules/reports/report-create.service.test.ts
```

结果：9/9 通过；摘要行数校准后模板聚焦测试 5/5 通过。

## 第二轮复核：Nest HTTP 鉴权路由

新增最小 Nest HTTP 测试应用，使用真实 `AuthGuard`、`ProjectContextInterceptor` 和 `ReportsController` 路由，验证：

- 无令牌：401。
- 有效令牌但无项目头：400。
- 成员选择无权项目：403。
- 有效令牌和 `X-Project-Id: quyang`：200，项目上下文为 `quyang`，返回 `application/pdf`、attachment 和 `%PDF` 字节。

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/reports.controller.test.ts
```

结果：2/2 通过。首次执行的唯一失败是测试错误地预期 PDF 附带 charset；按 Express 实际且正确的 `application/pdf` 修正断言后通过，未为测试修改生产响应。

## 第二轮真实 Chromium 验证

使用本机 Google Chrome 渲染重复 240 次的标题、重复 300 次的摘要和 1 张照片：

```text
title:   clientHeight=246, scrollHeight=6529, lineClamp=6, textOverflow=ellipsis
summary: clientHeight=113, scrollHeight=3208, lineClamp=6, textOverflow=ellipsis
Pages: 2
Page size: 594.96 x 841.92 pts (A4)
File size: 152,989 bytes
```

验证长文本确实发生溢出并由显式省略规则处理，封面仍固定 1 页，整份 PDF 为封面 1 页加照片 1 页。

## 第二轮最终验证

```sh
corepack pnpm --filter @xunjianbao/api exec sh -c 'tsx --test src/modules/reports/*.test.ts'
corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/api/file-download.test.ts ../../apps/admin-web/src/pages/report-export.test.ts
corepack pnpm --filter @xunjianbao/shared typecheck
corepack pnpm --filter @xunjianbao/api typecheck
corepack pnpm --filter @xunjianbao/admin-web typecheck
```

结果：报告模块 30/30 通过；前端既有导出逻辑测试 7/7 通过；shared、API、admin-web 类型检查均退出码 0。

## 整合环境修复：storage 根目录符号链接

根因：整合环境的 worktree `storage` 本身指向原项目媒体仓库。旧实现对照片执行 `realpath` 后，却仍与未解析的 worktree `storage` 字符串比较，因此合法媒体被误判为越界。

修复：新增异步 `resolveStoredPath`，先对数据库相对路径做词法约束，再分别 `realpath(storageRoot)` 和 `realpath(file)`，最后在同一 canonical 路径空间比较。内部符号链接逃逸仍由相同边界拒绝。

RED：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf.service.test.ts
```

结果：退出码 1；新增测试引用的 `resolveStoredPath` 尚不存在。实现初次运行还暴露 macOS `/var` canonical 为 `/private/var` 及包装记录取值错误，按真实 `realpath` 结果和数据结构做最小校正。

GREEN：

```sh
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-pdf.service.test.ts
```

结果：14/14 通过；覆盖 storage 根 symlink 内合法文件允许，以及 storage 内部 symlink 指向外部仍拒绝。
