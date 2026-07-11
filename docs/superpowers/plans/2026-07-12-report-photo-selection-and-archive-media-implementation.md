# Report Photo Selection And Archive Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让报告编写页可从任务照片池全选或部分选图，并让小区、街道和重点点位档案照片墙读取与分发真实媒体库照片。

**Architecture:** `TaskPhoto` 继续作为唯一照片业务记录，新增 `ReportPhoto` 保存报告选图关系。后端提供任务照片、待分发照片和档案照片查询；前端报告选择器与档案工作台都调用这些真实接口，不复制 `MediaAsset` 文件。

**Tech Stack:** PostgreSQL, Prisma 7, NestJS, React 18, Ant Design 5, TypeScript, Node test runner, pnpm workspace

## Global Constraints

- 一张 `TaskPhoto` 最多关联一个 `archiveObjectId`。
- 一个 `InspectionTask` 最多对应一份 `InspectionReport`。
- 默认选择任务中 `pending` 与 `archived` 照片，`ignored` 默认不选。
- 报告与照片关系保存必须使用同一数据库事务。
- 不复制或移动已有媒体文件。
- 小区、街道和重点点位共用同一套档案照片实现。
- 每个任务完成测试、提交并推送后再进入下一任务。

---

### Task 1: ReportPhoto 数据模型与迁移

**Files:**
- Modify: `services/api/prisma/schema.prisma`
- Create: `services/api/prisma/migrations/20260712090000_report_photos/migration.sql`
- Create: `services/api/prisma/report-photo-schema.test.ts`

**Interfaces:**
- Consumes: `InspectionReport.id`, `TaskPhoto.id`
- Produces: Prisma `ReportPhoto` model and `InspectionReport.photos`

- [ ] **Step 1: 编写失败的模型测试**

```ts
test("defines unique report photo links", async () => {
  const schema = await readFile(new URL("./schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /model ReportPhoto/);
  assert.match(schema, /@@unique\(\[reportId, taskPhotoId\]\)/);
  assert.match(schema, /photos\s+ReportPhoto\[\]/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test prisma/report-photo-schema.test.ts`

Expected: FAIL，因为 `ReportPhoto` 尚不存在。

- [ ] **Step 3: 添加 Prisma 模型与 SQL 迁移**

```prisma
model ReportPhoto {
  id          String   @id
  reportId    String
  taskPhotoId String
  sortIndex   Int
  createdAt   DateTime @default(now())

  report    InspectionReport @relation(fields: [reportId], references: [id], onDelete: Cascade)
  taskPhoto TaskPhoto        @relation(fields: [taskPhotoId], references: [id], onDelete: Cascade)

  @@unique([reportId, taskPhotoId])
  @@index([reportId, sortIndex])
  @@index([taskPhotoId])
}
```

Migration creates the table, unique index, sort index, and both foreign keys with cascade delete for relationship rows only.

- [ ] **Step 4: 生成客户端并运行验证**

Run: `corepack pnpm db:generate`

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test prisma/report-photo-schema.test.ts`

Expected: PASS.

- [ ] **Step 5: 提交并推送**

```bash
git add services/api/prisma
git commit -m "feat: add report photo relationships"
git push origin codex/real-workflow-v1
```

### Task 2: 报告照片事务保存与恢复

**Files:**
- Modify: `services/api/src/modules/reports/report-create.service.ts`
- Modify: `services/api/src/modules/reports/report-create.service.test.ts`
- Modify: `services/api/src/database/inspection-read.repository.ts`

**Interfaces:**
- Consumes: `SubmitTaskReportInput.taskId`, `SubmitTaskReportInput.taskPhotoIds`
- Produces: transactionally saved `ReportPhoto[]`; report detail field `taskPhotoIds: string[]`

- [ ] **Step 1: 添加跨任务校验和完整替换测试**

```ts
test("replaces report photos only with photos from the same task", async () => {
  const result = await service.submit({
    taskId: "task-1",
    title: "综合报告",
    reportDate: "2026-07-12",
    taskPhotoIds: ["photo-1", "photo-2"],
  });
  assert.deepEqual(result.taskPhotoIds, ["photo-1", "photo-2"]);
  assert.deepEqual(deleteManyCall.where, { reportId: "report-1" });
  assert.equal(createManyCall.data[1].sortIndex, 1);
});
```

Also test duplicate IDs and a photo belonging to another task return `BadRequestException` without report writes.

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-create.service.test.ts`

Expected: FAIL，因为输入尚无 `taskPhotoIds`，服务未写关系。

- [ ] **Step 3: 在事务中验证并替换关系**

```ts
export interface SubmitTaskReportInput {
  taskId?: string;
  title?: string;
  reportDate?: string;
  relatedObjectName?: string;
  issueCount?: number;
  contentSummary?: string;
  taskPhotoIds?: string[];
}
```

Inside one interactive transaction:

```ts
const uniqueIds = [...new Set(input.taskPhotoIds ?? [])];
const validPhotoCount = await tx.taskPhoto.count({
  where: { id: { in: uniqueIds }, taskId: input.taskId },
});
if (validPhotoCount !== uniqueIds.length) throw new BadRequestException("报告照片必须属于当前任务");
const report = await tx.inspectionReport.upsert(...);
await tx.reportPhoto.deleteMany({ where: { reportId: report.id } });
await tx.reportPhoto.createMany({
  data: uniqueIds.map((taskPhotoId, sortIndex) => ({
    id: `report-photo-${randomUUID()}`,
    reportId: report.id,
    taskPhotoId,
    sortIndex,
  })),
});
```

Return `{ ...report, taskPhotoIds: uniqueIds }`.

- [ ] **Step 4: 扩展报告详情读取**

`InspectionReadRepository.report(id)` includes `photos` ordered by `sortIndex` and maps them to `taskPhotoIds`.

- [ ] **Step 5: 运行测试和 API 构建**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/reports/report-create.service.test.ts`

Run: `corepack pnpm --filter @xunjianbao/api build`

Expected: PASS.

- [ ] **Step 6: 提交并推送**

```bash
git add services/api/src/modules/reports services/api/src/database/inspection-read.repository.ts
git commit -m "feat: persist report photo selections"
git push origin codex/real-workflow-v1
```

### Task 3: 待分发照片与档案照片查询接口

**Files:**
- Create: `services/api/src/modules/inspection-tasks/task-photo-read.service.ts`
- Create: `services/api/src/modules/inspection-tasks/task-photo-read.service.test.ts`
- Modify: `services/api/src/modules/inspection-tasks/inspection-tasks.controller.ts`
- Modify: `services/api/src/modules/inspection-tasks/inspection-tasks.module.ts`

**Interfaces:**
- Produces: `GET /task-photos`; `GET /managed-objects/:objectId/photos`
- Returns: `{ items, page, pageSize, total }` with `task`, `mediaAsset`, and `archiveObject`

- [ ] **Step 1: 编写查询条件测试**

```ts
test("lists only pending photos for media distribution", async () => {
  await service.listPending({ page: "1", pageSize: "40" });
  assert.deepEqual(findManyCall.where, { distributionStatus: "pending" });
});

test("lists only photos archived to one object", async () => {
  await service.listForArchive("c-yutian", {});
  assert.deepEqual(findManyCall.where, {
    archiveObjectId: "c-yutian",
    distributionStatus: "archived",
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/inspection-tasks/task-photo-read.service.test.ts`

Expected: FAIL，因为服务不存在。

- [ ] **Step 3: 实现分页服务**

Both methods include:

```ts
include: {
  mediaAsset: true,
  archiveObject: true,
  task: { select: { id: true, name: true, taskDate: true, sourceType: true } },
}
```

Order by `capturedAt`, `videoTimestampMs`, then `createdAt`.

- [ ] **Step 4: 添加两个控制器路由**

```ts
@Get("task-photos")
listPendingPhotos(@Query() query) { ... }

@Get("managed-objects/:objectId/photos")
listArchivePhotos(@Param("objectId") objectId, @Query() query) { ... }
```

Use a dedicated controller under the inspection task module so paths remain explicit.

- [ ] **Step 5: 运行测试和构建**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/inspection-tasks/task-photo-read.service.test.ts`

Run: `corepack pnpm --filter @xunjianbao/api build`

Expected: PASS.

- [ ] **Step 6: 提交并推送**

```bash
git add services/api/src/modules/inspection-tasks
git commit -m "feat: expose pending and archived task photos"
git push origin codex/real-workflow-v1
```

### Task 4: 报告任务照片选择器

**Files:**
- Create: `apps/admin-web/src/components/TaskPhotoSelector.tsx`
- Create: `apps/admin-web/src/pages/task-photo-selection.ts`
- Create: `apps/admin-web/src/pages/task-photo-selection.test.ts`
- Modify: `apps/admin-web/src/pages/ReportWritePage.tsx`
- Modify: `apps/admin-web/src/styles/global.css`

**Interfaces:**
- Consumes: `GET /inspection-tasks/:taskId/photos?page=N&pageSize=100`
- Produces: ordered `selectedTaskPhotoIds: string[]` and report `PhotoItem[]`

- [ ] **Step 1: 编写选择状态测试**

```ts
test("defaults to non-ignored photos and preserves cross-page selection", () => {
  const initial = defaultSelectedPhotoIds([
    { id: "p1", distributionStatus: "pending" },
    { id: "p2", distributionStatus: "archived" },
    { id: "p3", distributionStatus: "ignored" },
  ]);
  assert.deepEqual([...initial], ["p1", "p2"]);
  assert.deepEqual(togglePhoto(initial, "p3"), new Set(["p1", "p2", "p3"]));
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/pages/task-photo-selection.test.ts`

Expected: FAIL，因为选择模型不存在。

- [ ] **Step 3: 实现纯选择模型和选择器组件**

The selector receives:

```ts
interface TaskPhotoSelectorProps {
  open: boolean;
  taskId: string;
  initialSelectedIds: string[];
  onCancel: () => void;
  onConfirm: (photos: TaskPhotoOption[]) => void;
}
```

It fetches all pages in batches of 100, renders 4-column lazy thumbnail cards, and keeps selection in a `Set<string>` independent of filters.

- [ ] **Step 4: 接入报告编写页**

- Replace single `mediaId` loading as the only source with task photo selection.
- Keep `mediaId` as initial preselection when entered from one photo.
- Add “选择任务照片” beside the task select and show `已选 N 张`.
- On task change, clear `photos`, `annotations`, `photoDescriptions`, `photoCoordinates`, and open the selector.
- On confirm, map selected `mediaAsset` records through `toReportPhoto` and set `selectedTaskPhotoIds`.
- Submit `taskPhotoIds: selectedTaskPhotoIds` to `POST /reports`.

- [ ] **Step 5: 运行前端测试和构建**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/pages/task-photo-selection.test.ts`

Run: `corepack pnpm --filter @xunjianbao/admin-web build`

Expected: PASS.

- [ ] **Step 6: 提交并推送**

```bash
git add apps/admin-web/src/components/TaskPhotoSelector.tsx apps/admin-web/src/pages/ReportWritePage.tsx apps/admin-web/src/pages/task-photo-selection.ts apps/admin-web/src/pages/task-photo-selection.test.ts apps/admin-web/src/styles/global.css
git commit -m "feat: select task photos for reports"
git push origin codex/real-workflow-v1
```

### Task 5: 档案照片墙接入真实媒体库

**Files:**
- Create: `apps/admin-web/src/components/archive-photo-adapter.ts`
- Create: `apps/admin-web/src/components/archive-photo-adapter.test.ts`
- Modify: `apps/admin-web/src/components/ProjectArchiveWorkspace.tsx`
- Modify: `apps/admin-web/src/pages/ManagedObjectDetailPage.tsx`
- Modify: `apps/admin-web/src/pages/CommunitiesPage.tsx`
- Modify: `apps/admin-web/src/pages/RoadsPage.tsx`
- Modify: `apps/admin-web/src/pages/PointsPage.tsx`

**Interfaces:**
- Consumes: `GET /managed-objects/:id/photos`, `GET /task-photos?status=pending`
- Mutates: `PATCH /inspection-tasks/:taskId/photos/:photoId/distribution`

- [ ] **Step 1: 编写真实照片映射测试**

```ts
test("maps an archived task photo to an archive wall card", () => {
  const item = toArchivePhotoItem(record, getContentUrl);
  assert.equal(item.thumbnailUrl, "api:/media-assets/media-1/content");
  assert.equal(item.sourceName, "7月巡检");
  assert.equal(item.taskId, "task-1");
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/components/archive-photo-adapter.test.ts`

Expected: FAIL，因为适配器不存在。

- [ ] **Step 3: 实现真实媒体适配器**

Map `TaskPhoto` response to the existing visual card contract and retain `taskId` and `taskPhotoId` for distribution calls.

- [ ] **Step 4: 删除本地关联状态并接入接口**

- Remove `mediaItems`, `defaultLinkedMediaIds`, and `linkedMediaIds` from `ProjectArchiveWorkspace`.
- Fetch archived photos whenever `activeItem.id` changes.
- Fetch pending photos when the media modal opens.
- “推送” calls the existing distribution endpoint with `{ action: "archive", archiveObjectId: activeItem.id }`.
- After success, reload archived and pending photos.
- Remove demo `mediaLibraryItems` props from community, road, point list and detail pages.

- [ ] **Step 5: 运行测试和前端构建**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/components/archive-photo-adapter.test.ts`

Run: `corepack pnpm --filter @xunjianbao/admin-web build`

Expected: PASS.

- [ ] **Step 6: 提交并推送**

```bash
git add apps/admin-web/src/components apps/admin-web/src/pages
git commit -m "feat: connect archive walls to media library"
git push origin codex/real-workflow-v1
```

### Task 6: 迁移、全链路验收与文档更新

**Files:**
- Modify: `docs/modules/inspection-task-center.md`

**Interfaces:**
- Verifies all interfaces produced in Tasks 1-5.

- [ ] **Step 1: 应用数据库迁移**

Run: `corepack pnpm db:deploy`

Expected: migration `20260712090000_report_photos` applied once.

- [ ] **Step 2: 运行全量测试与构建**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test prisma/report-photo-schema.test.ts src/modules/reports/report-create.service.test.ts src/modules/inspection-tasks/task-photo-read.service.test.ts`

Run: `corepack pnpm --filter @xunjianbao/media-worker test`

Run: `corepack pnpm -r build`

Expected: all tests and builds pass.

- [ ] **Step 3: 浏览器验收报告选图**

- Open `/reports/write`.
- Select the historical DJI task.
- Verify the selector defaults to all non-ignored photos.
- Clear selection, select a subset, confirm, and verify only those photos appear in the annotation strip.
- Submit and verify `/reports` contains one report for the task.

- [ ] **Step 4: 浏览器验收档案照片**

- Open `/communities/c-yutian`.
- Open “从媒体库推送”.
- Archive one pending photo.
- Verify it appears in the wall and remains after reload.
- Verify the same photo no longer appears in the pending list.

- [ ] **Step 5: 更新模块文档**

Document `ReportPhoto`, report photo selection, archive photo queries, and the no-copy rule in `docs/modules/inspection-task-center.md`.

- [ ] **Step 6: 最终提交并推送**

```bash
git add docs/modules/inspection-task-center.md
git commit -m "docs: document report and archive photo links"
git push origin codex/real-workflow-v1
```
