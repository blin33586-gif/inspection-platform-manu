# Issue Metadata Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make issue association, category, severity, and occurrence time editable from the issue detail page while keeping the issue library card and derived PNG synchronized.

**Architecture:** Add one project-scoped metadata update method in `IssueWriteService`, expose current-project managed-object options, and return full ISO timestamps plus the persisted `objectId` in the shared issue summary. The frontend uses a single explicit edit mode and saves all four fields together. Published issue cards are regenerated from the authoritative issue record after a material edit and are requested with a versioned URL.

**Tech Stack:** NestJS, Prisma/PostgreSQL, React 18, Ant Design 5, TypeScript, Node test runner, Sharp.

## Global Constraints

- The editable fields are exactly `objectId`, `category`, `severity`, and `foundAt`.
- Severity labels are exactly `严重 / 重要 / 轻微`, mapped to `high / medium / normal` without changing stored enum values.
- Association options come only from the current project and may be cleared to `未关联对象`.
- Category is trimmed, required, and limited to 100 characters.
- Occurrence time is edited in China local time and stored as a standard timestamp.
- Closed, ignored, and archived issues may correct metadata without changing status, closure state, or rectification records.
- Association changes update old and new managed-object `issueCount` values in the same database transaction.
- Material changes create one project-scoped audit entry; an unchanged save creates none.
- A published card with source photo and annotation is regenerated after metadata changes, and its browser URL is versioned.
- Manually created issues without a card remain cardless.
- Existing rectification, attachment, and closure behavior must not be redesigned.

---

### Task 1: Project-scoped metadata write contract

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `services/api/src/database/inspection-read.repository.ts`
- Modify: `services/api/src/modules/issues/issue-write.service.ts`
- Modify: `services/api/src/modules/issues/issues.controller.ts`
- Modify: `services/api/src/modules/managed-objects/managed-objects.controller.ts`
- Test: `services/api/src/modules/issues/issue-write.service.test.ts`
- Test: `services/api/src/database/project-isolation.test.ts`

**Interfaces:**
- Produces: `IssueSummary.objectId: string | null` and full ISO `IssueSummary.foundAt`.
- Produces: `IssueWriteService.updateMetadata(id: string, input: UpdateIssueMetadataInput): Promise<IssueSummary | null>`.
- Produces: `PATCH /api/v1/issues/:id` with `{ objectId: string | null; category: string; severity: Severity; foundAt: string }`.
- Produces: `GET /api/v1/managed-objects` returning `ManagedObjectSummary[]` for the selected project.

- [ ] **Step 1: Write failing service tests**

Add tests that construct an issue with `status: "verified"` and prove that `updateMetadata`:

```ts
const result = await runAsMember(() => service.updateMetadata("is-1", {
  objectId: "r-new",
  category: "占道经营",
  severity: "high",
  foundAt: "2026-07-08T09:35:00+08:00",
}));
assert.equal(result?.status, "verified");
assert.equal(result?.objectId, "r-new");
assert.deepEqual(counterWrites, ["old:-1", "r-new:+1"]);
assert.equal(audits.length, 1);
```

Add separate assertions for clearing `objectId`, rejecting an object from another project, rejecting blank or over-100-character categories, rejecting invalid severity/time, and producing no audit/counter writes for an unchanged save.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/issues/issue-write.service.test.ts
```

Expected: failures because `updateMetadata` does not exist.

- [ ] **Step 3: Extend the shared and read contracts**

Update `IssueSummary`:

```ts
export interface IssueSummary {
  id: string;
  title: string;
  objectId: string | null;
  objectName: string;
  category: string;
  status: IssueStatus;
  severity: Severity;
  foundAt: string;
  // existing optional fields remain unchanged
}
```

In every issue mapper, return `objectId: issue.objectId` and `foundAt: issue.foundAt.toISOString()`. Add `allManagedObjects()` to `InspectionReadRepository`, selecting every managed object with `projectId: currentProjectId()` and ordering by `objectType`, then `name`.

- [ ] **Step 4: Implement the transactional update**

Add this exact input boundary:

```ts
export interface UpdateIssueMetadataInput {
  objectId?: string | null;
  category?: string;
  severity?: Severity;
  foundAt?: string;
}
```

Validate all four fields before entering the transaction. Inside the transaction, load the issue with `{ id, projectId }`, validate a non-null target object with the same `projectId`, compare normalized values, and return without writes when nothing changed. When association changes, decrement the old object's count only when greater than zero and increment the new object's count. Update the issue without touching `status`; create one audit row with action `issue.metadata.update` and a Chinese summary listing changed labels.

- [ ] **Step 5: Expose the two endpoints**

Add:

```ts
@Patch(":id")
async update(@Param("id") id: string, @Body() body: UpdateIssueMetadataInput) {
  const item = await this.issueWriteService.updateMetadata(id, body);
  if (!item) throw new NotFoundException("Issue not found");
  return ok(item);
}
```

Add `GET /managed-objects` to `ManagedObjectsController`, inject `InspectionReadRepository`, and return `ok(await readRepository.allManagedObjects())`.

- [ ] **Step 6: Verify GREEN and project isolation**

Run:

```bash
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/issues/issue-write.service.test.ts src/database/project-isolation.test.ts
corepack pnpm --filter @xunjianbao/api typecheck
```

Expected: all selected tests pass and typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/index.ts services/api/src/database/inspection-read.repository.ts services/api/src/modules/issues/issue-write.service.ts services/api/src/modules/issues/issues.controller.ts services/api/src/modules/managed-objects/managed-objects.controller.ts services/api/src/modules/issues/issue-write.service.test.ts services/api/src/database/project-isolation.test.ts
git commit -m "feat: edit project-scoped issue metadata"
```

---

### Task 2: Synchronize the derived issue card

**Files:**
- Modify: `services/api/src/modules/issues/issue-event-publish.service.ts`
- Modify: `services/api/src/modules/issues/issue-write.service.ts`
- Modify: `services/api/src/database/inspection-read.repository.ts`
- Test: `services/api/src/modules/issues/issue-event-publish.service.test.ts`
- Test: `services/api/src/modules/issues/issue-write.service.test.ts`

**Interfaces:**
- Consumes: `IssueWriteService.updateMetadata` from Task 1.
- Produces: `IssueEventPublishService.refreshCard(issueId: string): Promise<void>`.
- Produces: versioned `cardImageUrl`, `/api/v1/issues/:id/card.png?v=<updatedAtEpoch>`.

- [ ] **Step 1: Write failing card refresh tests**

Add a test with an existing published issue, source photo, and historical annotation version. Call:

```ts
await runAsMember(() => service.refreshCard("issue-1"));
assert.equal(rendered.category, "新的问题类型");
assert.equal(rendered.foundAt, "2026/7/8 09:35:00");
assert.deepEqual(await readFile(cardPath), Buffer.from("new-card"));
```

Add a test proving an issue with `cardStoragePath: null` and no source photo returns without rendering, and a write-service test proving refresh is requested only after a material update.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/issues/issue-event-publish.service.test.ts src/modules/issues/issue-write.service.test.ts
```

Expected: failures because `refreshCard` does not exist and metadata updates do not call it.

- [ ] **Step 3: Implement refresh and versioning**

Make `refreshCard(issueId)` load the current-project issue. If it has no existing card, source photo, or source annotation version, return. Otherwise reuse `requirePhoto`, `readAnnotationVersion`, and `generateCard` so rendering uses the updated authoritative category and occurrence time.

Inject the publisher into `IssueWriteService` and call `refreshCard(id)` after a material transaction succeeds. Re-read the final summary after refresh. Version all issue summary card URLs with the final `updatedAt` epoch:

```ts
cardImageUrl: issue.cardStoragePath
  ? `/api/v1/issues/${issue.id}/card.png?v=${issue.updatedAt.getTime()}`
  : null,
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
corepack pnpm --filter @xunjianbao/api exec tsx --test src/modules/issues/issue-event-publish.service.test.ts src/modules/issues/issue-write.service.test.ts
corepack pnpm --filter @xunjianbao/api typecheck
```

Expected: selected tests pass and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/modules/issues/issue-event-publish.service.ts services/api/src/modules/issues/issue-write.service.ts services/api/src/database/inspection-read.repository.ts services/api/src/modules/issues/issue-event-publish.service.test.ts services/api/src/modules/issues/issue-write.service.test.ts
git commit -m "feat: refresh cards after issue edits"
```

---

### Task 3: Detail-page editor and synchronized library display

**Files:**
- Modify: `apps/admin-web/src/pages/IssueDetailPage.tsx`
- Modify: `apps/admin-web/src/pages/IssuesPage.tsx`
- Modify: `apps/admin-web/src/pages/issue-detail-presenter.ts`
- Modify: `apps/admin-web/src/pages/issue-detail-presenter.test.ts`
- Modify: `apps/admin-web/src/styles/global.css`

**Interfaces:**
- Consumes: `GET /managed-objects`, `PATCH /issues/:id`, `IssueSummary.objectId`, ISO `IssueSummary.foundAt`, and versioned `cardImageUrl`.
- Produces: one explicit edit mode for all four metadata fields.

- [ ] **Step 1: Write failing presenter and page-contract tests**

Add pure presenter tests:

```ts
assert.equal(issueSeverityLabel("high"), "严重");
assert.equal(issueSeverityLabel("medium"), "重要");
assert.equal(issueSeverityLabel("normal"), "轻微");
assert.equal(toLocalDateTimeInput("2026-07-08T01:35:00.000Z"), "2026-07-08T09:35");
```

Extend the page contract to require `编辑信息`, `保存修改`, `取消`, the `/managed-objects` resource, `patchJsonApi(.../issues/${id})`, severity options, `Input type="datetime-local"`, and use of `issue.cardImageUrl` in `IssuesPage`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
corepack pnpm --filter @xunjianbao/admin-web exec tsx --test src/pages/issue-detail-presenter.test.ts
```

Expected: failures for missing presenter functions and edit controls.

- [ ] **Step 3: Implement presenter helpers**

Add:

```ts
export const severityOptions = [
  { value: "high", label: "严重" },
  { value: "medium", label: "重要" },
  { value: "normal", label: "轻微" },
] as const;

export function issueSeverityLabel(value: Severity) {
  return severityOptions.find((item) => item.value === value)?.label ?? "轻微";
}

export function toLocalDateTimeInput(iso: string) {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
```

- [ ] **Step 4: Implement the unified edit mode**

Load `PageResult`-free `ManagedObjectSummary[]` from `/managed-objects`. Add an `editing` state and an Ant Design form with:

```ts
interface IssueMetadataForm {
  objectId: string | null;
  category: string;
  severity: Severity;
  foundAt: string;
}
```

Clicking `编辑信息` initializes the form from the current issue. The association `Select` is clearable and shows current-project object names; category uses `Input maxLength={100}`; severity uses the exact three options; occurrence time uses `<Input type="datetime-local" />`. Saving calls `PATCH /issues/:id`, shows success, exits edit mode, and reloads the issue. Failure keeps edit mode and user input.

Keep the closure button and rectification read-only rules unchanged. Display severity through `issueSeverityLabel` and display time with `toLocaleString("zh-CN", { hour12: false })`.

- [ ] **Step 5: Synchronize the issue library**

Use the API-provided versioned image URL:

```tsx
<img
  src={getApiUrl(issue.cardImageUrl?.replace("/api/v1", "") ?? `/issues/${issue.id}/card.png`)}
  alt={issue.title}
/>
```

Format the ISO occurrence time for people instead of printing the raw ISO string. The category and object/location line continues to read directly from the returned `IssueSummary`.

- [ ] **Step 6: Add responsive styles**

Keep the existing overview dimensions. Add compact form spacing, two-column desktop fields, one-column fields below 600px, and right-aligned save/cancel buttons that wrap without overflow.

- [ ] **Step 7: Verify GREEN**

Run:

```bash
corepack pnpm --filter @xunjianbao/admin-web exec tsx --test src/pages/issue-detail-presenter.test.ts
corepack pnpm --filter @xunjianbao/admin-web typecheck
```

Expected: selected tests pass and typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/admin-web/src/pages/IssueDetailPage.tsx apps/admin-web/src/pages/IssuesPage.tsx apps/admin-web/src/pages/issue-detail-presenter.ts apps/admin-web/src/pages/issue-detail-presenter.test.ts apps/admin-web/src/styles/global.css
git commit -m "feat: edit issue metadata from detail"
```

---

### Task 4: Integrated verification

**Files:**
- Modify only if a test exposes a defect in the files owned by Tasks 1–3.

**Interfaces:**
- Consumes all previous task outputs.
- Produces verified browser behavior and a clean branch ready to push.

- [ ] **Step 1: Run the complete automated checks**

```bash
corepack pnpm --filter @xunjianbao/api test
corepack pnpm --filter @xunjianbao/admin-web exec tsx --test 'src/**/*.test.ts'
corepack pnpm typecheck
corepack pnpm build
git diff --check
```

Expected: zero failures and zero type/build errors.

- [ ] **Step 2: Restart the stable stack**

```bash
corepack pnpm dev:stop
corepack pnpm dev:stable
```

Expected: API, admin frontend, and worker report ready.

- [ ] **Step 3: Verify the real pointed issue**

Using the existing issue `is-0e287b30-f1c9-4f6e-9460-47032a5593b0` in project `quyang`, verify edit mode, association options, all three severity labels, corrected date-time, save/cancel behavior, preserved `verified` state, preserved rectification record, updated issue library text, and a changed versioned card URL/PNG. Restore any temporary metadata values if the verification is not intended as the user's final content.

- [ ] **Step 4: Request independent review and fix findings**

Review the complete diff against the design file. Critical and Important findings must be fixed and re-reviewed; Minor findings must be either fixed or explicitly documented before push.

- [ ] **Step 5: Commit integration fixes and push**

```bash
git status --short
git push origin codex/real-workflow-v1
```

Expected: only the pre-existing `.backups/` remains untracked and the remote branch reaches the final local commit.
