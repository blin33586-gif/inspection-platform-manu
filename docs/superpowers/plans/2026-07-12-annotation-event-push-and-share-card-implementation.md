# 图片标注事件推送与分享卡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从单张已保存标注的任务照片一键创建待处理问题，并生成系统留存、可下载、带免登录二维码的 PNG 分享卡。

**Architecture:** 在 `TaskPhoto` 与 `Issue` 之间建立固定标注版本的证据关系，由后端事件发布模块的单一接口编排问题创建、分享令牌、二维码与 PNG 生成。前端只负责字段确认、调用发布接口和展示预览；公开页使用不可猜测令牌读取单条只读数据。

**Tech Stack:** PostgreSQL、Prisma 7、NestJS 10、React 18、TypeScript 5、Ant Design 5、Sharp、QRCode、Node `node:test`、tsx。

## Global Constraints

- 只实现“单张已标注照片→问题台账＋分享卡”，不实现 AI 合并、多照片事件或整份日报。
- 问题必须引用提交时的具体标注版本，后续标注修改不改变已发布证据。
- 分享页无需登录，但只能通过密码安全令牌访问单条只读内容。
- PNG 固定使用 70% 标注照片，底部左侧四项字段，右下角二维码。
- 一次幂等提交只创建一条问题；卡片失败可重试，不重复创建问题。
- 缺少坐标允许发布，公开页的地图与导航按钮保持禁用。
- 不暴露物理存储路径、审计记录、操作者或后台编辑入口。

---

## 文件结构

| 文件 | 责任 |
| --- | --- |
| `services/api/prisma/schema.prisma` | 问题证据、分享令牌、卡片文件元数据和幂等键。 |
| `services/api/prisma/migrations/<timestamp>_issue_event_share_card/migration.sql` | PostgreSQL 结构迁移。 |
| `services/api/src/modules/issues/issue-event-publish.types.ts` | 发布输入、结果和公开 DTO。 |
| `services/api/src/modules/issues/issue-share-token.ts` | 安全令牌生成与 SHA-256 哈希。 |
| `services/api/src/modules/issues/issue-card-renderer.ts` | 标注图、字段和二维码合成 PNG。 |
| `services/api/src/modules/issues/issue-event-publish.service.ts` | 幂等发布编排、数据库事务、卡片存储与审计。 |
| `services/api/src/modules/issues/issue-public-read.service.ts` | 按令牌读取最小只读数据、证据图和卡片。 |
| `services/api/src/modules/issues/issue-event.controller.ts` | 需登录的发布、卡片下载和分享撤销接口。 |
| `services/api/src/modules/issues/issue-public.controller.ts` | 无需登录的单条只读、图片与卡片接口。 |
| `apps/admin-web/src/pages/issue-event-push-state.ts` | 弹窗默认值、校验和返回结果类型。 |
| `apps/admin-web/src/components/IssueEventPushModal.tsx` | 四字段确认与结果预览。 |
| `apps/admin-web/src/pages/ReportWritePage.tsx` | 当前照片的“事件推送”入口与状态接入。 |
| `apps/admin-web/src/pages/PublicIssueSharePage.tsx` | 免登录只读页与地图／导航操作。 |
| `apps/admin-web/src/App.tsx` | 公开路由放在登录守卫之外。 |

## Task 1: 数据模型、共享契约与令牌

**Files:**
- Modify: `services/api/prisma/schema.prisma`
- Create: `services/api/prisma/migrations/<timestamp>_issue_event_share_card/migration.sql`
- Create: `services/api/src/modules/issues/issue-event-publish.types.ts`
- Create: `services/api/src/modules/issues/issue-share-token.ts`
- Test: `services/api/src/modules/issues/issue-share-token.test.ts`
- Modify: `services/api/package.json`

**Interfaces:**
- Consumes: `TaskPhoto.id`, `PhotoAnnotationDocument.currentVersion`, `PhotoAnnotationVersion.version`, `Issue.id`.
- Produces: `PublishIssueEventInput`, `PublishIssueEventResult`, `PublicIssueShareRecord`, `createShareToken(): { token: string; hash: string }`, `hashShareToken(token: string): string`.

- [ ] **Step 1: 写令牌红灯测试**

```ts
test("creates an opaque token whose stored hash can be reproduced", () => {
  const created = createShareToken();
  assert.match(created.token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(created.hash, created.token);
  assert.equal(hashShareToken(created.token), created.hash);
});
```

- [ ] **Step 2: 运行并确认 RED**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/issues/issue-share-token.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `issue-share-token.js`.

- [ ] **Step 3: 实现类型与令牌**

```ts
export function hashShareToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createShareToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashShareToken(token) };
}
```

`PublishIssueEventInput` 固定包含 `idempotencyKey`、`expectedAnnotationVersion`、`locationName`、`foundAt`、`category`、`description`；结果固定返回 `issueId`、`shareUrl`、`cardImageUrl`、`issueDetailUrl`。

- [ ] **Step 4: 增加 Prisma 字段与迁移**

`Issue` 新增 `description`、`locationName`、`sourceTaskPhotoId`、`sourceAnnotationVersion`、`longitude`、`latitude`、`shareTokenHash @unique`、`shareEnabled`、`cardStoragePath`、`cardMimeType`、`cardFileSize`、`publishedAt`、`publishIdempotencyKey @unique`，并建立 `TaskPhoto` 关系和查询索引。

- [ ] **Step 5: 安装图片依赖并生成 Prisma Client**

Run: `corepack pnpm --filter @xunjianbao/api add sharp qrcode && corepack pnpm --filter @xunjianbao/api add -D @types/qrcode && corepack pnpm --filter @xunjianbao/api db:generate`

Expected: lockfile updates; Prisma Client generation exits `0`.

- [ ] **Step 6: 验证并提交**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/issues/issue-share-token.test.ts && corepack pnpm --filter @xunjianbao/api build`

Expected: token test and API typecheck PASS.

Commit: `git commit -m "feat(issue): add event sharing data contract"`

## Task 2: 可测试的 PNG 卡片生成模块

**Files:**
- Create: `services/api/src/modules/issues/issue-card-renderer.ts`
- Test: `services/api/src/modules/issues/issue-card-renderer.test.ts`
- Create: `services/api/src/modules/issues/issue-card-layout.ts`

**Interfaces:**
- Consumes: `RenderIssueCardInput` with annotated photo bytes, location, time, category, description, QR URL.
- Produces: `renderIssueCard(input): Promise<Buffer>` and `buildIssueCardSvg(input): string`.

- [ ] **Step 1: 写布局与 PNG 红灯测试**

```ts
test("keeps a 70 percent photo region and a reserved QR column", () => {
  const svg = buildIssueCardSvg(sampleInput);
  assert.match(svg, /data-role="photo"[^>]*height="980"/);
  assert.match(svg, /data-role="qr"[^>]*x="930"/);
  assert.match(svg, />扫码查看问题详情</);
});

test("renders a valid PNG", async () => {
  const output = await renderIssueCard(sampleInput);
  assert.deepEqual([...output.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
```

- [ ] **Step 2: 运行并确认 RED**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/issues/issue-card-renderer.test.ts`

Expected: FAIL because renderer modules do not exist.

- [ ] **Step 3: 实现确定性 SVG 布局**

使用 `1200 x 1400` 画布，顶栏 `84px`，照片区 `980px`，底部 `336px`；底部右侧二维码列从 `x=930` 开始。所有文本先 XML escape，长文本通过 `wrapText(text, maxChars, maxLines)` 折行并截断。

- [ ] **Step 4: 实现 Sharp 合成**

```ts
const qrDataUrl = await QRCode.toDataURL(input.shareUrl, { errorCorrectionLevel: "M", margin: 1, width: 180 });
return sharp({ create: { width: 1200, height: 1400, channels: 4, background: "#ffffff" } })
  .composite([{ input: annotatedPhoto, top: 84, left: 0 }, { input: Buffer.from(buildIssueCardSvg({ ...input, qrDataUrl })) }])
  .png()
  .toBuffer();
```

- [ ] **Step 5: 验证并提交**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/issues/issue-card-renderer.test.ts && corepack pnpm --filter @xunjianbao/api build`

Expected: layout, PNG signature and typecheck PASS.

Commit: `git commit -m "feat(issue): render share card png"`

## Task 3: 事件发布与公开只读接口

**Files:**
- Create: `services/api/src/modules/issues/issue-event-publish.service.ts`
- Create: `services/api/src/modules/issues/issue-public-read.service.ts`
- Create: `services/api/src/modules/issues/issue-event.controller.ts`
- Create: `services/api/src/modules/issues/issue-public.controller.ts`
- Test: `services/api/src/modules/issues/issue-event-publish.service.test.ts`
- Test: `services/api/src/modules/issues/issue-public-read.service.test.ts`
- Modify: `services/api/src/modules/issues/issues.module.ts`
- Modify: `services/api/src/modules/auth/auth.guard.ts`

**Interfaces:**
- Consumes: Task 1 data model and Task 2 `renderIssueCard()`.
- Produces: `publish(photoId, actor, input)`, `readByToken(token)`, authenticated publish/revoke/download routes, public JSON/photo/card routes.

- [ ] **Step 1: 写发布红灯测试**

```ts
test("creates one pending issue and reuses it for the same idempotency key", async () => {
  const first = await service.publish("photo-1", "admin", validInput);
  const second = await service.publish("photo-1", "admin", validInput);
  assert.equal(first.issueId, second.issueId);
  assert.equal(createdIssues.length, 1);
});

test("rejects a stale annotation version before creating an issue", async () => {
  await assert.rejects(() => service.publish("photo-1", "admin", { ...validInput, expectedAnnotationVersion: 2 }), /标注已更新/);
  assert.equal(createdIssues.length, 0);
});
```

- [ ] **Step 2: 运行并确认 RED**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/issues/issue-event-publish.service.test.ts`

Expected: FAIL because publish module does not exist.

- [ ] **Step 3: 实现发布事务与卡片失败重试**

`publish()` 先按幂等键查找已有问题，再校验照片归属、当前标注版本和必填字段。数据库事务写入 `pending` 问题、明文令牌对应哈希、证据快照与坐标。事务后生成 PNG 并原子移入 `storage/issues/cards`；失败时记录审计并保留可重试状态。

- [ ] **Step 4: 写公开读红灯测试**

```ts
test("returns only the public issue fields for an enabled token", async () => {
  const result = await publicRead.readByToken(rawToken);
  assert.deepEqual(Object.keys(result).sort(), ["cardUrl", "category", "description", "evidenceImageUrl", "foundAt", "latitude", "locationName", "longitude"]);
});

test("rejects a revoked token", async () => {
  await assert.rejects(() => publicRead.readByToken(revokedToken), /分享已失效/);
});
```

- [ ] **Step 5: 实现公开读取与路由绕过规则**

`IssuePublicController` 只有 `public/issues/:shareToken`、`evidence`、`card.png` 三类路由。在现有认证守卫中仅对这些精确路由免鉴权，其他 `issues` 接口继续需登录。

- [ ] **Step 6: 运行 API 回归并提交**

Run: `corepack pnpm --filter @xunjianbao/api test && corepack pnpm --filter @xunjianbao/api build`

Expected: all API tests and typecheck PASS.

Commit: `git commit -m "feat(issue): publish annotated photo events"`

## Task 4: 标注页事件推送与结果预览

**Files:**
- Create: `apps/admin-web/src/pages/issue-event-push-state.ts`
- Test: `apps/admin-web/src/pages/issue-event-push-state.test.ts`
- Create: `apps/admin-web/src/components/IssueEventPushModal.tsx`
- Modify: `apps/admin-web/src/pages/ReportWritePage.tsx`
- Modify: `apps/admin-web/src/styles/global.css`

**Interfaces:**
- Consumes: `POST /task-photos/:photoId/publish-issue` and `PublishIssueEventResult`.
- Produces: `buildIssuePushDefaults()`, `validateIssuePushDraft()`, event push modal and result preview actions.

- [ ] **Step 1: 写前端状态红灯测试**

```ts
test("prefills saved annotation fields and rejects an empty description", () => {
  const draft = buildIssuePushDefaults({ locationName: "北门", foundAt: "2026-07-12T11:06:00+08:00", category: "暴露垃圾", description: "" });
  assert.equal(draft.locationName, "北门");
  assert.deepEqual(validateIssuePushDraft(draft), { description: "请填写问题描述" });
});
```

- [ ] **Step 2: 运行并确认 RED**

Run: `corepack pnpm --filter @xunjianbao/admin-web exec tsx --test src/pages/issue-event-push-state.test.ts`

Expected: FAIL because state module does not exist.

- [ ] **Step 3: 实现状态模块与弹窗**

弹窗仅展示点位／区域、发现时间、问题类型和问题描述。提交时生成 `crypto.randomUUID()` 作为幂等键；请求失败后重试沿用原键。成功后不关闭弹窗，改为显示卡片图像与下载、复制链接、问题详情三个动作。

- [ ] **Step 4: 接入报告编写页**

“事件推送”放在当前图片问题描述区的操作行。无真实 `taskPhotoId`、问题描述为空、没有已保存标注版本或存在未保存改动时禁用。

- [ ] **Step 5: 验证并提交**

Run: `corepack pnpm --filter @xunjianbao/admin-web exec tsx --test src/pages/issue-event-push-state.test.ts && corepack pnpm --filter @xunjianbao/admin-web build`

Expected: state test, TypeScript and Vite build PASS.

Commit: `git commit -m "feat(report): push annotated photo as issue"`

## Task 5: 免登录只读问题页

**Files:**
- Create: `apps/admin-web/src/pages/public-issue-share-state.ts`
- Test: `apps/admin-web/src/pages/public-issue-share-state.test.ts`
- Create: `apps/admin-web/src/pages/PublicIssueSharePage.tsx`
- Modify: `apps/admin-web/src/App.tsx`
- Modify: `apps/admin-web/src/styles/global.css`

**Interfaces:**
- Consumes: `GET /public/issues/:shareToken`.
- Produces: public route `/s/issue/:shareToken`, `buildTencentMapUrl()` and `buildTencentNavigationUrl()`.

- [ ] **Step 1: 写地图链接红灯测试**

```ts
test("builds location and navigation links only when coordinates exist", () => {
  assert.match(buildTencentMapUrl({ latitude: 31.28821, longitude: 121.49132, title: "小区北门" })!, /apis\.map\.qq\.com\/uri\/v1\/marker/);
  assert.match(buildTencentNavigationUrl({ latitude: 31.28821, longitude: 121.49132, title: "小区北门" })!, /apis\.map\.qq\.com\/uri\/v1\/routeplan/);
  assert.equal(buildTencentMapUrl({ latitude: null, longitude: null, title: "小区北门" }), null);
});
```

- [ ] **Step 2: 运行并确认 RED**

Run: `corepack pnpm --filter @xunjianbao/admin-web exec tsx --test src/pages/public-issue-share-state.test.ts`

Expected: FAIL because public share state module does not exist.

- [ ] **Step 3: 实现只读页与公开路由**

页面只呈现标注证据图、点位、发现时间、类型和描述。地图与导航使用腾讯地图 URI Scheme；无坐标时按钮禁用。请求返回 404/410 时显示“分享已失效”，不跳转登录页。

- [ ] **Step 4: 验证并提交**

Run: `corepack pnpm --filter @xunjianbao/admin-web exec tsx --test src/pages/public-issue-share-state.test.ts && corepack pnpm --filter @xunjianbao/admin-web build`

Expected: public state test and production build PASS.

Commit: `git commit -m "feat(issue): add public share page"`

## Task 6: 全链路验收与模块锁定

**Files:**
- Modify: `docs/modules/inspection-task-center.md`
- Modify: `docs/开发阶段记录.md`
- Modify: `docs/巡检宝功能模块清单.md`

**Interfaces:**
- Consumes: Tasks 1-5 complete behavior.
- Produces: verified module record and explicit boundary for future work.

- [ ] **Step 1: 运行完整自动验证**

Run: `corepack pnpm --filter @xunjianbao/api test && corepack pnpm --filter @xunjianbao/api build && corepack pnpm --filter @xunjianbao/admin-web build && git diff --check`

Expected: all commands exit `0`; no failing tests, TypeScript errors, Vite failures or whitespace errors.

- [ ] **Step 2: 执行真实浏览器验收**

1. 打开真实任务报告编写页并选择任务照片。
2. 保存标注和问题描述。
3. 推送事件，确认问题台账只新增一条。
4. 预览并下载 PNG，确认照片约占 70%、二维码不与文字重叠。
5. 使用无登录浏览器打开分享链接，确认只读数据与地图／导航。
6. 重复同一提交，确认没有重复问题。

- [ ] **Step 3: 更新文档并提交**

记录新能力、验证命令、实际浏览器验收、已知限制与模块边界。

Commit: `git commit -m "docs: lock annotation event sharing module"`
