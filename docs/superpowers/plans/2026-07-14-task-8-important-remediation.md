# Task 8 Important Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement each fix with an observed RED before production changes.

**Goal:** Preserve pending legacy TIFF lifecycle state during migration and prevent absolute server paths from escaping the shared map-failure sanitizer.

**Architecture:** The pending-job migration runs before terminal legacy normalization and correlates `MediaProcessingJob` to `MapAsset` by project plus `inputJson` map asset id. The shared sanitizer remains the only policy implementation used by worker persistence, API responses, and UI presentation; its technical-path detector is widened without changing approved user-facing mappings or the 120-character cap.

**Tech Stack:** PostgreSQL migration SQL, TypeScript, Node test runner, pnpm workspace.

## Global Constraints

- Do not modify an already deployed migration; `20260714003000_map_status_contract` is still undeployed and may be corrected in place.
- Use the PostgreSQL column's actual `TEXT` representation with non-throwing text extraction so one malformed legacy payload cannot abort the migration.
- Match pending jobs by both `projectId` and `mapAssetId`, and preserve queued/running according to job status.
- Keep the shared sanitizer reused by worker, API, and UI, with single-line output capped at 120 characters.

---

### Task 1: Preserve pending legacy TIFF states

**Files:**
- Modify: `services/api/prisma/map-status-contract.test.ts`
- Modify: `services/api/prisma/migrations/20260714003000_map_status_contract/migration.sql`

**Interfaces:**
- Consumes: `MediaProcessingJob(projectId, jobType, status, inputJson TEXT)` and `MapAsset(projectId, id, processStatus)`.
- Produces: pending `uploaded` TIFF assets normalized to job `queued`/`running` before remaining legacy terminal states become `published`.

- [x] Add a migration contract test requiring the pending TIFF update to precede terminal normalization, safely extract `mapAssetId` from `inputJson` text without a JSON cast, match project and asset id, and retain `queued`/`running` status.
- [x] Run `corepack pnpm --filter @xunjianbao/api exec tsx --test prisma/map-status-contract.test.ts` and observe the expected assertion failure.
- [x] Add the minimal correlated pending-job SQL before the existing terminal update, with running taking precedence if duplicate pending jobs exist.
- [x] Re-run the focused migration test and confirm it passes.

### Task 2: Block absolute-path bypasses in the shared sanitizer

**Files:**
- Modify: `apps/admin-web/src/pages/map-upload-presenter.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: arbitrary failure strings from worker/API/UI boundaries.
- Produces: approved safe Chinese failure text or the generic fallback, always one line and at most 120 characters.

- [x] Add table-driven UI-facing tests for Unix paths after Chinese punctuation/parentheses/newlines, `file:` URLs, Windows backslash/forward-slash drive paths, and UNC paths.
- [x] Run the focused presenter test and observe failures for punctuation/file URL/forward-slash path bypasses.
- [x] Replace the boundary-sensitive path checks with absolute Unix, file URL, drive-path, and UNC detectors that work at any message position.
- [x] Re-run the focused presenter test and confirm all bypass cases use the generic fallback while readable safe Chinese text remains capped.

### Task 3: Full verification and report

**Files:**
- Modify: `.superpowers/sdd/task-8-report.md`

**Interfaces:**
- Consumes: both green fixes.
- Produces: fresh focused/full-suite/build evidence and review handoff.

- [x] Run focused migration and presenter tests.
- [x] Run full admin-web, API, and media-worker tests.
- [x] Run workspace typecheck and production build.
- [x] Run `git diff --check`, inspect the final diff, append evidence and residual concerns to the report, then commit the scoped changes.
