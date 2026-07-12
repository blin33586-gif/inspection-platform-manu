# 标注版本化保存实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为任务照片建立真实、可版本回溯、可并发保护的标注保存能力，并让报告编写页读取和保存统一标注。

**Architecture:** 以 `TaskPhoto` 为唯一照片主体，新增当前标注文档和不可修改版本快照两张表。NestJS 提供读取、保存和历史查询接口，保存使用 `expectedVersion` 乐观锁；React 报告画布把当前本地标注转换为统一相对坐标 JSON，并在显式保存时写入服务端。

**Tech Stack:** PostgreSQL、Prisma 7、NestJS 10、React 18、TypeScript 5、Ant Design 5、Node `node:test`、tsx。

## Global Constraints

- 仅实现第一阶段标注真实保存，不创建疑似事件、AI 合并或复核中心。
- 一张 `TaskPhoto` 只有一个当前标注文档，文件不复制。
- 所有标注坐标是 `0..1` 相对坐标；服务端拒绝越界坐标和未知元素类型。
- 每次显式保存必须使用 `expectedVersion`；冲突返回 HTTP 409，旧页面不得覆盖新页面。
- 旧版本只读且不可修改；报告后续可引用具体版本。
- 本模块完成并通过测试后提交 Git，不重做上一阶段媒体任务模块。

---

## 文件结构

| 文件 | 责任 |
| --- | --- |
| `services/api/prisma/schema.prisma` | 标注文档和版本快照关系、唯一约束和索引。 |
| `services/api/prisma/migrations/<timestamp>_photo_annotation_versioning/migration.sql` | 对 PostgreSQL 的新增表迁移。 |
| `packages/media-contracts/src/annotation-document.ts` | 共享标注 JSON、输入、版本 DTO 与校验函数。 |
| `services/api/src/modules/inspection-tasks/photo-annotation.service.ts` | 当前标注读取、历史查询、乐观锁保存和审计。 |
| `services/api/src/modules/inspection-tasks/photo-annotation.controller.ts` | REST 路由与 HTTP 409 映射。 |
| `services/api/src/modules/inspection-tasks/photo-annotation.service.test.ts` | 标注保存、历史快照、非法 JSON、并发冲突测试。 |
| `apps/admin-web/src/pages/report-annotation-state.ts` | 报告页面与共享标注 DTO 的转换和版本合并纯函数。 |
| `apps/admin-web/src/pages/report-annotation-state.test.ts` | 转换、恢复、冲突后未保存草稿保留测试。 |
| `apps/admin-web/src/pages/ReportWritePage.tsx` | 按任务照片加载、显示和显式保存标注。 |
| `apps/admin-web/src/lib/api.ts` | 复用现有请求层，不新增第二套 HTTP 客户端。 |

## Task 1: 共享标注契约与数据库迁移

**Files:**
- Create: `packages/media-contracts/src/annotation-document.ts`
- Modify: `packages/media-contracts/src/index.ts`
- Create: `packages/media-contracts/src/annotation-document.test.ts`
- Modify: `services/api/prisma/schema.prisma`
- Create: `services/api/prisma/migrations/<timestamp>_photo_annotation_versioning/migration.sql`

**Consumes:** 当前 `TaskPhoto.id` 和 `packages/media-contracts` 导出入口。

**Produces:** `AnnotationDocumentPayload`、`AnnotationElement`、`AnnotationSource`、`validateAnnotationDocument()`，以及 `PhotoAnnotationDocument` / `PhotoAnnotationVersion` Prisma 模型。

- [ ] **Step 1: 写失败的共享契约测试**

```ts
test("accepts relative rectangle, arrow, and text elements", () => {
  assert.doesNotThrow(() => validateAnnotationDocument({
    canvasVersion: 1,
    elements: [
      { id: "rect-1", type: "rectangle", x: 0.1, y: 0.2, width: 0.3, height: 0.4, color: "#ef4444" },
      { id: "arrow-1", type: "arrow", x: 0.1, y: 0.2, endX: 0.7, endY: 0.8, color: "#f59e0b" },
      { id: "text-1", type: "text", x: 0.5, y: 0.5, text: "堆料", color: "#2563eb" },
    ],
  }));
});

test("rejects an element outside the normalized canvas", () => {
  assert.throws(() => validateAnnotationDocument({
    canvasVersion: 1,
    elements: [{ id: "bad", type: "text", x: 1.1, y: 0.5, text: "越界", color: "#2563eb" }],
  }), /坐标/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @xunjianbao/media-contracts test`

Expected: FAIL，因为 `annotation-document.ts` 和 `validateAnnotationDocument` 尚不存在。

- [ ] **Step 3: 最小实现共享契约**

```ts
export type AnnotationSource = "manual" | "ai";
export type AnnotationElement =
  | { id: string; type: "rectangle"; x: number; y: number; width: number; height: number; color: string; text?: string }
  | { id: string; type: "arrow"; x: number; y: number; endX: number; endY: number; color: string; text?: string }
  | { id: string; type: "text"; x: number; y: number; color: string; text: string; width?: number };

export interface AnnotationDocumentPayload {
  canvasVersion: 1;
  elements: AnnotationElement[];
}

export function validateAnnotationDocument(value: AnnotationDocumentPayload): AnnotationDocumentPayload {
  // 逐项校验 type、稳定 id、颜色字符串与所有坐标 0..1，失败抛出中文错误。
  return value;
}
```

新增 Prisma 模型：当前文档对 `taskPhotoId` 加 `@unique`；版本表对 `[documentId, version]` 加 `@@unique`，并在 `TaskPhoto` 上建立 `annotationDocument` 关系。

- [ ] **Step 4: 运行迁移与共享测试**

Run: `corepack pnpm db:migrate && corepack pnpm --filter @xunjianbao/media-contracts test`

Expected: Prisma Client 生成成功；共享测试全部通过。

- [ ] **Step 5: 提交底座**

```bash
git add packages/media-contracts services/api/prisma
git commit -m "feat(annotation): add versioned annotation schema"
```

## Task 2: 标注读写接口与版本乐观锁

**Files:**
- Create: `services/api/src/modules/inspection-tasks/photo-annotation.service.ts`
- Create: `services/api/src/modules/inspection-tasks/photo-annotation.controller.ts`
- Create: `services/api/src/modules/inspection-tasks/photo-annotation.service.test.ts`
- Modify: `services/api/src/modules/inspection-tasks/inspection-tasks.module.ts`

**Consumes:** Task 1 的 Prisma 模型和 `validateAnnotationDocument()`。

**Produces:** `GET /task-photos/:photoId/annotation`、`GET /task-photos/:photoId/annotation/versions`、`GET /task-photos/:photoId/annotation/versions/:version`、`PUT /task-photos/:photoId/annotation`。

- [ ] **Step 1: 写失败的服务测试**

```ts
test("saves an annotation snapshot and increments the current version", async () => {
  const result = await service.save("photo-1", "admin", {
    expectedVersion: 1,
    annotationJson: validAnnotationJson,
    issueDescription: "楼顶堆料",
    longitude: 121.468,
    latitude: 31.286,
    altitude: 86.5,
    source: "manual",
  });

  assert.equal(result.currentVersion, 2);
  assert.equal(transaction.photoAnnotationVersion.create.mock.calls[0][0].data.version, 1);
});

test("rejects a stale annotation writer without changing current content", async () => {
  await assert.rejects(
    () => service.save("photo-1", "admin", { ...validInput, expectedVersion: 1 }),
    { status: 409 },
  );
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @xunjianbao/api test -- photo-annotation.service.test.ts`

Expected: FAIL，因为服务和控制器尚不存在。

- [ ] **Step 3: 最小实现读取、保存、历史查询与审计**

```ts
async save(photoId: string, actor: string, input: SavePhotoAnnotationInput) {
  validateAnnotationDocument(input.annotationJson);
  return this.database.$transaction(async (tx) => {
    const current = await tx.photoAnnotationDocument.findUnique({ where: { taskPhotoId: photoId } });
    const version = current?.currentVersion ?? 1;
    if (input.expectedVersion !== version) throw new ConflictException("标注已被其他用户更新，请刷新后再保存");
    if (current) await tx.photoAnnotationVersion.create({ data: snapshot(current) });
    return tx.photoAnnotationDocument.upsert({ /* currentVersion: version + 1 */ });
  });
}
```

控制器从已登录用户读取操作者；读取不存在照片返回 404；保存写 `annotation.saved` 与 `annotation.conflict` 操作日志。

- [ ] **Step 4: 运行 API 标注与现有任务测试**

Run: `corepack pnpm --filter @xunjianbao/api test`

Expected: PASS；现有任务、报告、媒体接口测试不回归。

- [ ] **Step 5: 提交 API 模块**

```bash
git add services/api/src/modules/inspection-tasks
git commit -m "feat(annotation): persist task photo annotations"
```

## Task 3: 报告画布接入真实标注

**Files:**
- Create: `apps/admin-web/src/pages/report-annotation-state.ts`
- Create: `apps/admin-web/src/pages/report-annotation-state.test.ts`
- Modify: `apps/admin-web/src/pages/ReportWritePage.tsx`
- Modify: `apps/admin-web/src/styles/global.css`

**Consumes:** Task 2 API 和 Task 1 的 `AnnotationDocumentPayload`。

**Produces:** 报告页按当前任务照片加载同一份标注；“暂存”持久化当前照片说明与画布；版本冲突不丢弃本地草稿。

- [ ] **Step 1: 写失败的前端状态测试**

```ts
test("converts a report rectangle from percent coordinates to a normalized document", () => {
  assert.deepEqual(toAnnotationPayload([{ id: 1, shape: "rect", x: 25, y: 50, width: 20, height: 10, tone: "danger" }]), {
    canvasVersion: 1,
    elements: [{ id: "annotation-1", type: "rectangle", x: 0.25, y: 0.5, width: 0.2, height: 0.1, color: "#ef4444" }],
  });
});

test("restores an arrow and its text from a persisted document", () => {
  assert.equal(fromAnnotationPayload(persisted).at(0)?.shape, "arrow");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `corepack pnpm --filter @xunjianbao/admin-web test -- report-annotation-state.test.ts`

Expected: FAIL，因为状态转换文件尚不存在。

- [ ] **Step 3: 实现纯转换函数与页面加载保存**

```ts
useEffect(() => {
  if (!activePhoto?.taskPhotoId) return;
  return getApi<AnnotationResponse>(`/task-photos/${activePhoto.taskPhotoId}/annotation`, controller.signal)
    .then((document) => restoreActivePhoto(document));
}, [activePhoto?.taskPhotoId]);

async function saveActiveAnnotation() {
  await putApi(`/task-photos/${activePhoto.taskPhotoId}/annotation`, {
    expectedVersion: activeAnnotationVersion,
    annotationJson: toAnnotationPayload(activePhotoAnnotations),
    issueDescription: activePhoto.description,
    source: "manual",
  });
}
```

保存成功后更新 `currentVersion`；HTTP 409 时保留画布和说明，显示“标注已被其他用户更新，请刷新后再保存”；增加只读“历史版本”入口并请求版本列表。

- [ ] **Step 4: 运行前端测试和构建**

Run: `corepack pnpm --filter @xunjianbao/admin-web test && corepack pnpm --filter @xunjianbao/admin-web build`

Expected: PASS；产物生成成功。

- [ ] **Step 5: 提交前端标注接入**

```bash
git add apps/admin-web
git commit -m "feat(report): save versioned photo annotations"
```

## Task 4: 全链路验证、文档与模块锁定

**Files:**
- Modify: `README.md`
- Modify: `docs/modules/inspection-task-center.md`
- Modify: `docs/开发阶段记录.md`

**Consumes:** Tasks 1 至 3 的真实接口与页面。

**Produces:** 用户可复核的验收记录、部署说明和完成的 Git 备份。

- [ ] **Step 1: 写端到端验收清单**

```text
1. 选择任务照片，添加矩形、箭头、文字和照片说明，点击暂存。
2. 刷新报告页，确认画布、说明和版本号恢复。
3. 以第二个浏览器窗口打开相同照片，先保存一次，再回到第一个窗口保存。
4. 确认第一个窗口收到冲突提示且未覆盖第二个窗口内容。
5. 打开历史版本，确认可查看旧内容且不可编辑。
```

- [ ] **Step 2: 执行完整验证**

Run: `corepack pnpm -r test && corepack pnpm db:deploy && corepack pnpm -r build && git diff --check`

Expected: 全部通过，迁移无待应用项，工作区无格式错误。

- [ ] **Step 3: 更新文档**

在 README 与任务模块文档中写明标注为任务照片统一数据、历史版本、保存冲突提示和生产迁移步骤；在开发阶段记录中标记第一阶段已锁定。

- [ ] **Step 4: 提交并推送第一阶段**

```bash
git add README.md docs
git commit -m "docs: record annotation persistence module"
git push origin codex/real-workflow-v1
```
