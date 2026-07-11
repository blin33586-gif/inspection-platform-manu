# Real Task Center Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the media-library demo surface with a database-backed inspection task center supporting real filters, statistics, video/ZIP/image task creation, and task photos produced by upload, extraction, or archive expansion.

**Architecture:** Introduce `InspectionTask` as the business batch and `TaskPhoto` as the business photo, while retaining `MediaAsset` and `MediaProcessingJob` as storage and technical processing primitives. A new inspection-task API owns task creation and reads; the worker writes generated photos back to the task. The React task center consumes only inspection-task APIs and contains no demo task or event arrays.

**Tech Stack:** PostgreSQL, Prisma 7, NestJS, Multer, FFmpeg worker, React 18, React Router, Ant Design, Node test runner, TypeScript.

## Global Constraints

- A task records source and batch information but never links directly to a community, road, or point.
- Sources are exactly `manual`, `drone`, `camera`, and `glasses`.
- Input types are exactly `video`, `archive`, and `images`.
- A video task accepts one MP4/MOV and must queue frame extraction.
- An archive task accepts one ZIP and must queue safe extraction.
- An image task accepts one or more JPG/JPEG/PNG and creates task photos immediately.
- A task cannot mix input types.
- Task photos start in `pending`; archive distribution is implemented in phase 2.
- Existing top-level videos and ZIP files must be backfilled as historical tasks without deleting media.
- No AI issue detection, photo distribution UI, or report generation is implemented in phase 1.

---

### Task 1: Add the Inspection Task Schema and Historical Backfill

**Files:**
- Modify: `services/api/prisma/schema.prisma`
- Create: `services/api/prisma/migrations/20260711193000_real_inspection_tasks/migration.sql`
- Modify: `services/api/prisma/seed.ts`

**Interfaces:**
- Produces Prisma models `InspectionTask` and `TaskPhoto`.
- Adds optional unique `InspectionReport.taskId` for real generated-report statistics and phase 3 compatibility.
- Preserves existing `MediaAsset` and `MediaProcessingJob` identifiers and files.

- [ ] **Step 1: Add a schema contract test**

Create `services/api/prisma/task-schema.test.ts` that reads `schema.prisma` and asserts the presence of:

```ts
assert.match(schema, /model InspectionTask/);
assert.match(schema, /sourceType\s+String/);
assert.match(schema, /model TaskPhoto/);
assert.match(schema, /distributionStatus\s+String/);
assert.match(schema, /taskId\s+String\?\s+@unique/);
```

- [ ] **Step 2: Run the schema test and verify it fails**

```bash
corepack pnpm --filter @xunjianbao/api exec tsx --test prisma/task-schema.test.ts
```

Expected: assertions fail because the models do not exist.

- [ ] **Step 3: Add Prisma models and relations**

Use these business fields:

```prisma
model InspectionTask {
  id                String   @id
  name              String
  taskDate          DateTime
  sourceType        String
  inputType         String
  processStatus     String
  sourceMediaId     String?  @unique
  photoCount        Int      @default(0)
  pendingPhotoCount Int      @default(0)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  sourceMedia MediaAsset?       @relation("InspectionTaskSource", fields: [sourceMediaId], references: [id], onDelete: SetNull)
  photos      TaskPhoto[]
  report      InspectionReport?

  @@index([taskDate])
  @@index([sourceType])
  @@index([processStatus])
  @@index([createdAt])
}

model TaskPhoto {
  id                 String   @id
  taskId             String
  mediaAssetId       String   @unique
  distributionStatus String   @default("pending")
  archiveObjectId    String?
  capturedAt         DateTime?
  videoTimestampMs   Int?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  task          InspectionTask @relation(fields: [taskId], references: [id], onDelete: Cascade)
  mediaAsset    MediaAsset      @relation("TaskPhotoMedia", fields: [mediaAssetId], references: [id], onDelete: Cascade)
  archiveObject ManagedObject?  @relation(fields: [archiveObjectId], references: [id], onDelete: SetNull)

  @@index([taskId, distributionStatus])
  @@index([archiveObjectId])
  @@index([capturedAt])
}
```

Add the corresponding named relations to `MediaAsset` and `ManagedObject`, plus `InspectionReport.taskId String? @unique` and its relation.

- [ ] **Step 4: Write migration SQL with backfill**

Create tables, indexes, and foreign keys. Insert one historical task for every top-level `MediaAsset.kind IN ('video', 'image_bundle')`. Use `manual` source, derive input type from media kind, derive status and counts from the newest processing job, and insert child frame/image rows as pending `TaskPhoto` records. Use deterministic IDs `task-<mediaId>` and `photo-<mediaId>` so deployment is idempotent at the migration level.

- [ ] **Step 5: Generate Prisma Client and run tests**

```bash
corepack pnpm db:generate
corepack pnpm --filter @xunjianbao/api exec tsx --test prisma/task-schema.test.ts
corepack pnpm --filter @xunjianbao/api build
```

- [ ] **Step 6: Commit**

```bash
git add services/api/prisma
git commit -m "feat: add real inspection task schema"
```

### Task 2: Create Real Tasks from Video, ZIP, and Images

**Files:**
- Create: `services/api/src/modules/inspection-tasks/inspection-task-input.ts`
- Create: `services/api/src/modules/inspection-tasks/inspection-task-input.test.ts`
- Create: `services/api/src/modules/inspection-tasks/inspection-task-write.service.ts`
- Create: `services/api/src/modules/inspection-tasks/inspection-task-write.service.test.ts`
- Create: `services/api/src/modules/inspection-tasks/inspection-tasks.controller.ts`
- Create: `services/api/src/modules/inspection-tasks/inspection-tasks.module.ts`
- Modify: `services/api/src/app.module.ts`

**Interfaces:**
- Produces `POST /inspection-tasks` multipart endpoint with `files`, `name`, `taskDate`, `sourceType`, `inputType`, and optional `intervalSeconds`.
- Produces `InspectionTask` and technical media/job records in one database transaction after storage preparation.

- [ ] **Step 1: Write failing input validation tests**

Cover:

```ts
validateTaskInput({ sourceType: "manual", inputType: "video", files: [mp4] });
validateTaskInput({ sourceType: "drone", inputType: "archive", files: [zip] });
validateTaskInput({ sourceType: "camera", inputType: "images", files: [jpg, png] });
```

Reject unsupported sources, mixed extensions, multiple videos, multiple ZIPs, empty image sets, and interval values outside 1-5.

- [ ] **Step 2: Run tests and verify failure**

Expected: missing validator module or assertions fail.

- [ ] **Step 3: Implement the pure validator**

Return a normalized input with parsed date, source, input type, interval, and validated files. Error messages must identify allowed file types and one-file limits.

- [ ] **Step 4: Write failing task-write service tests**

Verify:

- video creates one source `MediaAsset`, one `InspectionTask`, one `frame_extract` job, and an audit record;
- ZIP creates one source asset, one task, one `archive_extract` job;
- direct images create one task, one media asset and one `TaskPhoto` per file, no processing job, `processStatus = ready_for_distribution`, and real photo counts;
- task rows never contain an archive object ID.

- [ ] **Step 5: Implement storage and transactional task creation**

Prepare deterministic storage under:

```text
storage/media/videos/<mediaId>.<ext>
storage/media/archives/<mediaId>.zip
storage/media/task-images/<taskId>/<mediaId>.<ext>
```

Move files before the transaction and remove prepared files on transaction failure. Job input must include `inspectionTaskId`, `mediaId`, source path, and interval when applicable.

- [ ] **Step 6: Add the multipart controller and module**

Use `FilesInterceptor("files", 500, ...)`. Return the created task. Keep `/media-assets/upload` for backward compatibility but remove it from the real task-center UI.

- [ ] **Step 7: Run API tests and build**

```bash
corepack pnpm --filter @xunjianbao/api test
corepack pnpm --filter @xunjianbao/api build
```

- [ ] **Step 8: Commit**

```bash
git add services/api/src/modules/inspection-tasks services/api/src/app.module.ts
git commit -m "feat: create unified inspection tasks"
```

### Task 3: Write Generated Frames and ZIP Images into the Task Photo Pool

**Files:**
- Modify: `services/media-worker/src/job-runner.test.ts`
- Modify: `services/media-worker/src/job-runner.ts`

**Interfaces:**
- Consumes optional `inspectionTaskId` in frame/archive job input.
- Produces `TaskPhoto` rows and updates `InspectionTask.photoCount`, `pendingPhotoCount`, and `processStatus`.
- Retains fallback lookup by `sourceMediaId` for historical jobs.

- [ ] **Step 1: Write failing worker tests**

For frame and archive jobs assert that one transaction includes:

```ts
database.taskPhoto.createMany({ data: generatedPhotoRows, skipDuplicates: true });
database.inspectionTask.update({
  where: { id: taskId },
  data: { processStatus: "ready_for_distribution", photoCount: count, pendingPhotoCount: count },
});
```

Also verify worker failure updates the matching inspection task to `failed`.

- [ ] **Step 2: Run worker tests and verify failure**

- [ ] **Step 3: Implement task lookup and photo writes**

Generate deterministic `TaskPhoto` IDs from media IDs. Use the generated frame timestamp as `videoTimestampMs`; direct ZIP images have null timestamp. Do not set an archive object.

- [ ] **Step 4: Run worker tests and build**

```bash
corepack pnpm --filter @xunjianbao/media-worker test
corepack pnpm --filter @xunjianbao/media-worker build
```

- [ ] **Step 5: Commit**

```bash
git add services/media-worker/src
git commit -m "feat: populate inspection task photos"
```

### Task 4: Add Real Task Queries, Filters, and Statistics

**Files:**
- Create: `services/api/src/modules/inspection-tasks/inspection-task-read.service.ts`
- Create: `services/api/src/modules/inspection-tasks/inspection-task-read.service.test.ts`
- Modify: `services/api/src/modules/inspection-tasks/inspection-tasks.controller.ts`

**Interfaces:**
- Produces `GET /inspection-tasks` with query `keyword`, `sourceType`, `processStatus`, `uploadStart`, `uploadEnd`, `page`, and `pageSize`.
- Produces `GET /inspection-tasks/:id` and `GET /inspection-tasks/:id/photos`.
- List response includes real filtered `stats` and paged `items`.

- [ ] **Step 1: Write failing query-builder tests**

Verify upload date bounds map to `createdAt.gte/lte`, keyword searches task/file names, source and status remain independent, and pagination is capped.

- [ ] **Step 2: Write failing statistics tests**

Require four real counts using the same filter scope:

```ts
{
  taskCount,
  processingTaskCount,
  pendingPhotoCount,
  generatedReportCount,
}
```

No values may come from frontend constants.

- [ ] **Step 3: Implement list, detail, and photo reads**

Include source media metadata and latest job in task summaries. Task photos include their media asset and current archive object summary, ready for phase 2.

- [ ] **Step 4: Run API tests and build**

- [ ] **Step 5: Commit**

```bash
git add services/api/src/modules/inspection-tasks
git commit -m "feat: query real inspection tasks"
```

### Task 5: Replace the Media Library Demo UI with the Real Task Center

**Files:**
- Create: `apps/admin-web/src/pages/inspection-task-presenter.ts`
- Create: `apps/admin-web/src/pages/inspection-task-presenter.test.ts`
- Create: `apps/admin-web/src/components/InspectionTaskCreateModal.tsx`
- Rewrite: `apps/admin-web/src/pages/MediaLibraryPage.tsx`
- Modify: `apps/admin-web/src/pages/MediaTaskDetailPage.tsx`
- Modify: `apps/admin-web/src/pages/media-library-detail.css`
- Modify: `apps/admin-web/src/pages/media-library-navigation.ts`

**Interfaces:**
- Consumes only `/inspection-tasks` endpoints for business task data.
- Produces a real date range filter, source/status filters, four real statistics, real task cards, and a task creation modal.

- [ ] **Step 1: Write failing presenter and upload-contract tests**

Verify source labels, input labels, status labels, date formatting, task-detail paths, and accepted file rules for video/ZIP/images.

- [ ] **Step 2: Run focused frontend tests and verify failure**

- [ ] **Step 3: Implement the task creation modal**

Form fields:

- task name;
- task date;
- source;
- input type;
- 1-5 second interval for video only;
- one file for video/ZIP or multiple files for images.

The submit button remains disabled until the file selection matches the input type. On success close the modal and navigate to the new task detail.

- [ ] **Step 4: Rewrite the task center page around real API data**

- Rename heading to “巡检任务中心”.
- Replace the upload-date button with Ant Design `RangePicker`.
- Remove `demoVideoTasks`, fake issue events, fake review categories, event cards, and category manager.
- Render only API task items.
- Display task source instead of “待关联项目”.
- Render real statistics returned by the API.
- Preserve polling only while a task is queued or processing.

- [ ] **Step 5: Switch the detail page to task and task-photo endpoints**

Keep video playback and gallery behavior. Direct images and ZIP images use the same photo pool. Show `pending`, `archived`, and `ignored` status labels without enabling phase 2 distribution actions yet.

- [ ] **Step 6: Run frontend tests and production build**

```bash
corepack pnpm --filter @xunjianbao/api exec tsx --test \
  ../../apps/admin-web/src/pages/inspection-task-presenter.test.ts \
  ../../apps/admin-web/src/pages/media-library-navigation.test.ts \
  ../../apps/admin-web/src/components/media-asset-presenter.test.ts
corepack pnpm --filter @xunjianbao/admin-web build
```

- [ ] **Step 7: Commit**

```bash
git add apps/admin-web/src
git commit -m "feat: replace media demo with real task center"
```

### Task 6: Migration Acceptance, Browser Verification, and Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/开发阶段记录.md`

**Interfaces:**
- Verifies phase 1 against the approved specification and freezes the module boundary before phase 2.

- [ ] **Step 1: Apply the migration to the local PostgreSQL database**

```bash
corepack pnpm db:deploy
```

Verify historical media becomes inspection tasks and existing files remain accessible.

- [ ] **Step 2: Real API acceptance**

Create one direct-image task with multiple images and verify:

- one task row;
- one `TaskPhoto` per image;
- source and dates are stored;
- real statistics update.

Use the existing real video task to verify historical backfill and frame count.

- [ ] **Step 3: Browser acceptance**

Verify at `http://127.0.0.1:5181/media-library`:

- title is “巡检任务中心”;
- upload date is a real range picker;
- task/source/status filters change API results;
- statistics match API values;
- no demo task, fake event, fake category, or “待关联项目” text remains;
- new task accepts video, ZIP, one image, and multiple images according to its type;
- clicking a real task opens its detail and task-photo pool.

- [ ] **Step 4: Remove only acceptance-test data**

Delete test-created task/media/photo records and files by their exact IDs; do not delete user media or historical backfill.

- [ ] **Step 5: Run full verification**

```bash
corepack pnpm --filter @xunjianbao/api test
corepack pnpm --filter @xunjianbao/media-worker test
corepack pnpm build
git diff --check
```

- [ ] **Step 6: Update docs, commit, and push**

Record the real task model, supported inputs, real filter/statistics contract, historical migration, and the phase 2 boundary.

```bash
git add README.md docs/开发阶段记录.md
git commit -m "docs: record real inspection task center"
git push origin codex/real-workflow-v1
```
