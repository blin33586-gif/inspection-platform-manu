# Archive Issue Report Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build archive deletion approval, archive photo unlinking, a two-state PNG issue library, and printable HTML report pages.

**Architecture:** Keep each workflow behind a small interface. Managed object deletion is requested and reviewed through the audit module; photo unlinking extends the existing distribution module; issue cards are read through the issue module; report pages consume enriched report read models.

**Tech Stack:** NestJS, Prisma/PostgreSQL, React, Ant Design, TypeScript, node:test.

## Global Constraints

- Removing a photo from an archive must not delete the source media.
- Managed object deletion requires an operation-log approval.
- Report output is HTML-first and printable as PDF.
- Existing map and task-upload modules are not changed.

---

### Task 1: Managed object deletion approval

**Files:**
- Modify: `services/api/prisma/schema.prisma`
- Create: `services/api/prisma/migrations/*_managed_object_deletion_review/migration.sql`
- Create: `services/api/src/modules/managed-objects/managed-object-deletion.service.ts`
- Create: `services/api/src/modules/managed-objects/managed-object-deletion.service.test.ts`
- Create: `services/api/src/modules/managed-objects/managed-objects.controller.ts`
- Modify: `services/api/src/modules/managed-objects/managed-objects.module.ts`
- Modify: `services/api/src/modules/audit/audit.controller.ts`
- Modify: `services/api/src/modules/audit/audit.service.ts`

**Interfaces:**
- Produces: `requestDeletion(objectId)` and `reviewDeletion(auditId, decision)`.

- [ ] Write a failing service test for request, confirm, cancel, relation cleanup, and duplicate prevention.
- [ ] Run the focused test and confirm the missing implementation failure.
- [ ] Add audit review fields, migration, service, and controller endpoints.
- [ ] Run the focused test and API typecheck.

### Task 2: Archive photo unlinking and archive UI

**Files:**
- Modify: `services/api/src/modules/inspection-tasks/inspection-task-distribution.service.ts`
- Modify: `services/api/src/modules/inspection-tasks/inspection-task-distribution.service.test.ts`
- Modify: `apps/admin-web/src/components/ProjectArchiveWorkspace.tsx`
- Modify: `apps/admin-web/src/styles/global.css`

**Interfaces:**
- Consumes: existing task photo distribution endpoint.
- Produces: distribution action `unarchive` returning the photo to pending.

- [ ] Write a failing distribution test for unarchive and pending-count restoration.
- [ ] Run the focused test and confirm failure.
- [ ] Implement unarchive and wire delete request/photo unlink controls.
- [ ] Verify focused tests and admin typecheck.

### Task 3: Operation log review UI

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/admin-web/src/pages/AuditLogsPage.tsx`

**Interfaces:**
- Consumes: audit review fields and review endpoint.
- Produces: confirm/cancel controls only for pending deletion requests.

- [ ] Add shared audit review fields.
- [ ] Add review actions and reload behavior.
- [ ] Verify admin typecheck.

### Task 4: Two-state PNG issue library

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `services/api/src/database/inspection-read.repository.ts`
- Modify: `services/api/src/modules/issues/issues.controller.ts`
- Create: `apps/admin-web/src/pages/issue-library-presenter.ts`
- Create: `apps/admin-web/src/pages/issue-library-presenter.test.ts`
- Modify: `apps/admin-web/src/pages/IssuesPage.tsx`
- Modify: `apps/admin-web/src/styles/global.css`

**Interfaces:**
- Produces: card-only issue query, private card image endpoint, and `pending/processed` presentation mapping.

- [ ] Write failing presenter tests for historical status mapping.
- [ ] Run focused tests and confirm failure.
- [ ] Implement card-only query, card image endpoint, card grid, and two actions.
- [ ] Verify focused tests and typechecks.

### Task 5: Printable HTML report pages

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `services/api/src/database/inspection-read.repository.ts`
- Modify: `apps/admin-web/src/pages/ReportWritePage.tsx`
- Modify: `apps/admin-web/src/pages/ReportDetailPage.tsx`
- Modify: `apps/admin-web/src/styles/global.css`

**Interfaces:**
- Produces: enriched report photos and post-submit navigation to `/reports/:id`.

- [ ] Add report photo read-model coverage to the existing repository/service tests.
- [ ] Implement enriched report detail and submit navigation.
- [ ] Build A4 HTML pages with print CSS and original-photo fallback.
- [ ] Verify API tests, admin tests, production build, migrations, and browser workflows.

### Task 6: Integration and delivery

- [ ] Run API and frontend focused tests.
- [ ] Run workspace typecheck and production build.
- [ ] Apply database migrations and restart the stable local stack.
- [ ] Verify all four workflows in the browser at desktop and narrow viewport.
- [ ] Commit and push `codex/real-workflow-v1`.
