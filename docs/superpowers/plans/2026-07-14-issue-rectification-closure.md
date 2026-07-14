# Issue Rectification Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized issue detail page with a compact work page that stores photo-and-text rectification records and closes an issue only through a separate confirmed action.

**Architecture:** A new `IssueRectificationRecord` groups one description, actor, timestamp, and one-to-six existing `IssueAttachment` rows through an explicit relation. New project-scoped endpoints list and create records and close an issue; the React page presents compact issue metadata, a chronological record feed, and a separate closure control.

**Tech Stack:** Prisma 7, PostgreSQL, NestJS 10 multipart upload, React 18, Ant Design 5, Node test runner, responsive CSS.

## Global Constraints

- A rectification record requires non-empty text and 1–6 image files.
- Creating a record never changes the issue to `verified`.
- Closing requires at least one rectification record and a second confirmation in the UI.
- `verified` is displayed as “已闭环” on the issue detail page.
- Closed issues are read-only; reopening is outside this plan.
- Original attachments and rectification records remain separate in the UI and API.
- Every read and write is restricted to the current project.

---

### Task 1: Rectification persistence contract

**Files:**
- Modify: `services/api/prisma/schema.prisma`
- Create: `services/api/prisma/migrations/20260714090000_issue_rectification_records/migration.sql`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: Prisma `IssueRectificationRecord` model
- Produces: nullable `IssueAttachment.rectificationRecordId`
- Produces: shared `IssueRectificationRecordSummary` and `IssueRectificationPhotoSummary`

- [ ] **Step 1: Add the failing schema expectations to a source test**

Create `services/api/src/modules/issues/issue-rectification-schema.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("defines structured rectification records", async () => {
  const schema = await readFile(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /model IssueRectificationRecord/);
  assert.match(schema, /rectificationRecordId\s+String\?/);
  assert.match(schema, /rectificationRecords\s+IssueRectificationRecord\[\]/);
});
```

- [ ] **Step 2: Run the schema test and verify it fails**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/issues/issue-rectification-schema.test.ts`

Expected: FAIL because the model is absent.

- [ ] **Step 3: Add the model, relation, migration, and shared types**

Use this Prisma shape:

```prisma
model IssueRectificationRecord {
  id          String   @id
  issueId     String
  description String
  createdBy   String
  createdAt   DateTime @default(now())

  issue  Issue             @relation(fields: [issueId], references: [id], onDelete: Cascade)
  photos IssueAttachment[]

  @@index([issueId, createdAt])
}
```

Add `rectificationRecords IssueRectificationRecord[]` to `Issue` and this nullable relation to `IssueAttachment`:

```prisma
rectificationRecordId String?
rectificationRecord   IssueRectificationRecord? @relation(fields: [rectificationRecordId], references: [id], onDelete: Cascade)
@@index([rectificationRecordId])
```

Add shared summaries:

```ts
export interface IssueRectificationPhotoSummary {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  imageUrl: string;
}

export interface IssueRectificationRecordSummary {
  id: string;
  issueId: string;
  description: string;
  createdBy: string;
  createdAt: string;
  photos: IssueRectificationPhotoSummary[];
}
```

- [ ] **Step 4: Generate Prisma and run the schema test**

Run: `corepack pnpm db:generate`

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/issues/issue-rectification-schema.test.ts`

Expected: test passes.

- [ ] **Step 5: Commit the persistence contract**

```bash
git add services/api/prisma/schema.prisma services/api/prisma/migrations/20260714090000_issue_rectification_records/migration.sql services/api/src/modules/issues/issue-rectification-schema.test.ts packages/shared/src/index.ts
git commit -m "feat: add issue rectification record model"
```

### Task 2: Record creation and listing service

**Files:**
- Create: `services/api/src/modules/issues/issue-rectification.service.ts`
- Test: `services/api/src/modules/issues/issue-rectification.service.test.ts`
- Modify: `services/api/src/modules/issues/issue-attachment.service.ts`

**Interfaces:**
- Produces: `IssueRectificationService.list(issueId: string)`
- Produces: `IssueRectificationService.create(issueId: string, files: UploadedFileLike[], input: { description?: string })`
- Existing attachment listing changes to `where: { issueId, rectificationRecordId: null }`

- [ ] **Step 1: Write failing service tests**

Cover these assertions with a fake transactional database and `runAsMember(...)`:

```ts
await assert.rejects(() => service.create("is-1", [], { description: "已完成整改" }), /至少上传 1 张整改照片/);
await assert.rejects(() => service.create("is-1", [imageFile], { description: "  " }), /请填写整改说明/);
await assert.rejects(() => service.create("is-closed", [imageFile], { description: "已完成整改" }), /问题已闭环/);
assert.equal(createdRecord.description, "已完成整改");
assert.equal(createdRecord.createdBy, "member");
assert.equal(createdRecord.photos.length, 1);
assert.equal(audit.action, "issue.rectification.create");
```

Also assert `list("is-1")` uses issue project scoping and returns records ordered by `{ createdAt: "desc" }`.

- [ ] **Step 2: Run the service tests and verify they fail**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/issues/issue-rectification.service.test.ts`

Expected: FAIL because the service is missing.

- [ ] **Step 3: Implement atomic multi-photo creation**

The service must validate before moving files:

```ts
const description = input.description?.trim();
if (!description) throw new BadRequestException("请填写整改说明");
if (files.length < 1) throw new BadRequestException("至少上传 1 张整改照片");
if (files.length > 6) throw new BadRequestException("一次最多上传 6 张整改照片");
if (issue.status === "verified") throw new BadRequestException("问题已闭环，不能继续提交整改记录");
```

Accept only `.png`, `.jpg`, `.jpeg`, and `.webp`. Move all files into `storage/issues`, then create the record, its linked `IssueAttachment` rows with `attachmentType: "整改照片"`, and the audit row in one Prisma transaction. If the transaction fails, remove every moved file. Map photo URLs to `/issues/rectifications/photos/:photoId/file`.

Update original attachment listing to exclude `rectificationRecordId` rows.

- [ ] **Step 4: Run issue service tests and typecheck**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/issues/issue-rectification.service.test.ts`

Run: `corepack pnpm --filter @xunjianbao/api typecheck`

Expected: tests pass and typecheck exits 0.

- [ ] **Step 5: Commit the service**

```bash
git add services/api/src/modules/issues/issue-rectification.service.ts services/api/src/modules/issues/issue-rectification.service.test.ts services/api/src/modules/issues/issue-attachment.service.ts
git commit -m "feat: store issue rectification records"
```

### Task 3: Rectification and closure endpoints

**Files:**
- Modify: `services/api/src/modules/issues/issues.controller.ts`
- Modify: `services/api/src/modules/issues/issues.module.ts`
- Modify: `services/api/src/modules/issues/issue-rectification.service.ts`
- Test: `services/api/src/modules/issues/issue-closure.service.test.ts`

**Interfaces:**
- Produces: `GET /issues/:id/rectifications`
- Produces: `POST /issues/:id/rectifications` with multipart `files` and `description`
- Produces: `PATCH /issues/:id/close`
- Produces: `GET /issues/rectifications/photos/:photoId/file`

- [ ] **Step 1: Write failing closure tests**

```ts
await assert.rejects(() => runAsMember(() => service.close("is-1")), /至少提交一条整改记录/);
assert.equal((await runAsMember(() => service.close("is-2"))).status, "verified");
assert.equal(updateCall.data.status, "verified");
assert.equal(audit.action, "issue.close");
```

The fake database must return the issue only when `{ id, projectId: "quyang" }` matches and return a rectification count of 0 or 1 for the two cases.

- [ ] **Step 2: Run the closure test and verify it fails**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/issues/issue-closure.service.test.ts`

Expected: FAIL because `close` is missing.

- [ ] **Step 3: Implement closure and routes**

Use `FilesInterceptor("files", 6, { dest: "storage/issues/tmp", limits: { fileSize: 20 * 1024 * 1024 } })` for creation. The close method must count records inside the current project boundary and update to `verified` only when count is positive.

Controller signatures:

```ts
@Get(":id/rectifications")
async rectifications(@Param("id") id: string) { return ok(await this.rectificationService.list(id)); }

@Post(":id/rectifications")
@UseInterceptors(FilesInterceptor("files", 6, uploadOptions))
async createRectification(@Param("id") id: string, @UploadedFiles() files: UploadedFileLike[], @Body() body: { description?: string }) {
  return ok(await this.rectificationService.create(id, files ?? [], body));
}

@Patch(":id/close")
async close(@Param("id") id: string) { return ok(await this.rectificationService.close(id)); }
```

Use `sendInlineStoredFile` for photo viewing after verifying the photo belongs to an issue in the current project.

- [ ] **Step 4: Run focused API checks**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/issues/issue-*.test.ts`

Run: `corepack pnpm --filter @xunjianbao/api typecheck`

Expected: all focused tests pass and typecheck exits 0.

- [ ] **Step 5: Commit the API**

```bash
git add services/api/src/modules/issues/issues.controller.ts services/api/src/modules/issues/issues.module.ts services/api/src/modules/issues/issue-rectification.service.ts services/api/src/modules/issues/issue-closure.service.test.ts
git commit -m "feat: expose issue rectification closure workflow"
```

### Task 4: Compact issue-detail presenter

**Files:**
- Create: `apps/admin-web/src/pages/issue-detail-presenter.ts`
- Test: `apps/admin-web/src/pages/issue-detail-presenter.test.ts`

**Interfaces:**
- Produces: `getIssueDetailStatusLabel(status: IssueStatus): string`
- Produces: `canCloseIssue(status: IssueStatus, recordCount: number): boolean`
- Produces: `isIssueReadOnly(status: IssueStatus): boolean`

- [ ] **Step 1: Write the failing presenter tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { canCloseIssue, getIssueDetailStatusLabel, isIssueReadOnly } from "./issue-detail-presenter.js";

test("maps verified to the user-facing closed state", () => {
  assert.equal(getIssueDetailStatusLabel("verified"), "已闭环");
});

test("requires a record before closure", () => {
  assert.equal(canCloseIssue("pending", 0), false);
  assert.equal(canCloseIssue("processing", 1), true);
  assert.equal(canCloseIssue("verified", 1), false);
});

test("makes closed issues read-only", () => {
  assert.equal(isIssueReadOnly("verified"), true);
  assert.equal(isIssueReadOnly("pending"), false);
});
```

- [ ] **Step 2: Run the presenter tests and verify they fail**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/pages/issue-detail-presenter.test.ts`

Expected: FAIL because the presenter is missing.

- [ ] **Step 3: Implement the pure presenter helpers**

Use a complete `Record<IssueStatus, string>` mapping with `verified: "已闭环"`. Implement `canCloseIssue` as `recordCount > 0 && !isIssueReadOnly(status)` and treat `verified`, `ignored`, and `archived` as read-only.

- [ ] **Step 4: Run the presenter tests**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/pages/issue-detail-presenter.test.ts`

Expected: all presenter tests pass.

- [ ] **Step 5: Commit the presenter**

```bash
git add apps/admin-web/src/pages/issue-detail-presenter.ts apps/admin-web/src/pages/issue-detail-presenter.test.ts
git commit -m "test: define issue detail closure presentation"
```

### Task 5: Compact detail page and rectification feed

**Files:**
- Modify: `apps/admin-web/src/pages/IssueDetailPage.tsx`
- Modify: `apps/admin-web/src/styles/global.css`

**Interfaces:**
- Consumes: `IssueRectificationRecordSummary`, `postFormApi`, `patchJsonApi`, and presenter helpers
- Produces: compact issue overview, original attachment section, rectification timeline, multi-photo form, confirmed closure action

- [ ] **Step 1: Replace the page resource and form state**

Load records with:

```ts
const rectificationResource = useApiResource<IssueRectificationRecordSummary[]>(`/issues/${id}/rectifications`, []);
const [form] = Form.useForm<{ description?: string; files?: UploadFile[] }>();
```

Use `Upload` with `multiple`, `maxCount={6}`, `accept=".png,.jpg,.jpeg,.webp"`, and append every `originFileObj` to `FormData` under `files`.

- [ ] **Step 2: Implement page structure and actions**

Render `PageHeader` without `eyebrow`:

```tsx
<PageHeader title={issue.title} actions={<Button href="/issues">返回问题库</Button>} />
```

Build one compact overview card with a status tag and a definition list for关联对象、问题类型、严重程度、发现时间. Replace the old status button column with one “确认闭环” button wrapped in `Popconfirm`; disable it when `canCloseIssue(...)` is false and explain “请先提交至少一条整改记录”.

Render rectification records as cards containing actor, localized time, description, and `Image.PreviewGroup` thumbnails. When read-only, hide the submission form and show “该问题已闭环，整改记录已锁定”.

- [ ] **Step 3: Add compact responsive styles**

Add page-scoped classes instead of changing shared card sizing:

```css
.issue-detail-overview { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 20px; padding: 20px; }
.issue-detail-meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 16px 0 0; }
.issue-detail-meta div { min-height: 70px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 8px; background: #fbfdff; }
.rectification-feed { display: grid; gap: 14px; }
.rectification-photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 10px; }
.rectification-photo-grid img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; }
@media (max-width: 900px) {
  .issue-detail-overview, .issue-detail-meta { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: Run frontend checks**

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/pages/issue-detail-presenter.test.ts`

Run: `corepack pnpm --filter @xunjianbao/admin-web typecheck`

Expected: tests pass and typecheck exits 0.

- [ ] **Step 5: Commit the page**

```bash
git add apps/admin-web/src/pages/IssueDetailPage.tsx apps/admin-web/src/styles/global.css
git commit -m "feat: add compact issue rectification workspace"
```

### Task 6: End-to-end closure verification

**Files:**
- Modify only if verification exposes a defect in Task 1–5 files.

**Interfaces:**
- Consumes: migrated database, running API, admin web.
- Produces: persisted record and verified closed issue.

- [ ] **Step 1: Deploy the migration and run focused tests**

Run: `corepack pnpm db:deploy`

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/issues/issue-*.test.ts`

Run: `corepack pnpm --filter @xunjianbao/api exec tsx --test ../../apps/admin-web/src/pages/issue-detail-presenter.test.ts`

Expected: migration applies and all focused tests pass.

- [ ] **Step 2: Verify the browser workflow**

At 825px width, open `is-0e287b30-f1c9-4f6e-9460-47032a5593b0`. Confirm the title has no English eyebrow, the overview fits in the first screen, and the layout is one column without horizontal overflow.

Submit one description and two image files. Confirm one record appears with both thumbnails, actor, and time after refresh. Confirm the issue status has not changed yet.

- [ ] **Step 3: Verify closure**

Use “确认闭环”, accept the second confirmation, and confirm the status becomes “已闭环”, the submission form disappears, and the historical record remains after refresh.

- [ ] **Step 4: Run typechecks and commit verification fixes if any**

Run: `corepack pnpm --filter @xunjianbao/api typecheck && corepack pnpm --filter @xunjianbao/admin-web typecheck`

Expected: exit code 0.

```bash
git add services/api packages/shared apps/admin-web
git commit -m "fix: harden issue rectification closure flow"
```
