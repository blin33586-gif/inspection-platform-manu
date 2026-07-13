# Final Review A–E Fix Report

Date: 2026-07-14 (Asia/Shanghai)

Overall status: **GREEN — all Critical and Important findings A–E are fixed and verified.** No Minor finding was included in this change set.

## 1. Findings and fixes

### A. Production legacy-member credentials

- Added one shared legacy-member credential resolver for runtime validation, application bootstrap, and Prisma seed.
- Production never falls back to the documented development member password. Creating the legacy member requires an explicit username/password pair and a password of at least 12 characters containing letters and numbers.
- Production may omit those variables only when a persisted member already exists; application bootstrap then preserves that account unchanged.
- `docker-compose.yml` now passes `MEMBER_USERNAME` and `MEMBER_PASSWORD` into the API container.
- Bootstrap validates all required credentials before the first account write, so a rejected startup does not partially create an administrator.

### B. Login timing side channel

- Login now selects either the account's structurally valid scrypt hash or a fixed valid dummy scrypt hash.
- Every login attempt performs exactly one expensive password verification before account existence, status, or role is rejected.
- Regression coverage includes missing, disabled, unsupported-role, malformed-hash, and valid accounts.

### C. Seed restoring revoked access

- Account bootstrap and Prisma seed share `seedLegacyAccounts`.
- Existing administrators and members are never overwritten.
- The two legacy memberships are created only with a newly created legacy member; rerunning seed cannot restore a revoked project membership.
- Production credential validation completes before any bootstrap account write.

### D. Multi-worker map serialization and crash recovery

- Added a persistent `MapWorkerLease` global lease and per-job owner, attempt, expiry, and heartbeat fields.
- Every map attempt receives an attempt-specific staging directory. Recovery removes only that expired attempt's directory, then compare-and-swap requeues its job and map history.
- Independent workers must acquire the same database-global lease before claiming map work; long work renews both the global and job leases.
- Final promotion verifies lease ownership immediately before promoting output. A stale runner cannot fail or complete the replacement attempt after losing ownership.
- Migration normalizes pre-existing duplicate active maps and adds a PostgreSQL partial unique index enforcing one active map per project.

### E. Authenticated audit identity

- `AuthIdentity` now carries the persisted username.
- Business audit rows derive their actor from the authenticated async request context; hard-coded `admin`, display-name fallbacks, and client-supplied actors were removed.
- Platform-member audits likewise require the authenticated platform administrator ID and no longer fall back to an arbitrary administrator account.
- Covered paths include task create/delete/distribution, photo annotation, issue publication, media upload, archive deletion review, shared audit service, and platform-member changes.

## 2. TDD evidence

Regression tests were added before each corresponding implementation and observed failing for the intended reason. Notable RED evidence included:

- production bootstrap wrote an administrator before rejecting missing member credentials;
- the old seed-structure test looked only in `seed.ts` after account logic moved into the shared module;
- login rejection paths did not all exercise the same password-verification path;
- independent `JobRunner` instances could overlap map work and running jobs had no recoverable attempt lease;
- business writes recorded `admin` or accepted an actor supplied by the client.

After the fixes, the final focused checks passed:

| Focused verification | Result |
| --- | --- |
| Account schema, seed credentials/access, and auth timing | 20 passed, 0 failed |
| Job runner plus map lease coordinator | 22 passed, 0 failed |

## 3. Full verification

All checks below were run from `/Users/bolin/Documents/巡检宝/.worktrees/platform-members-map` after the final code change.

| Verification | Result |
| --- | --- |
| API test suite | 179 passed, 0 failed |
| Media-worker test suite | 49 passed, 0 failed |
| Admin-web TypeScript tests | 77 passed, 0 failed |
| Workspace `pnpm typecheck` | exit 0 |
| Workspace `pnpm build` | exit 0 |
| Prisma client generation | exit 0 |
| Prisma schema validation | valid |
| `git diff --check` | exit 0 |
| Hard-coded/client-supplied actor source scan | no matches |

The admin production build still reports the previously known large-chunk warning for the approximately 1.5 MB main bundle. This is non-blocking and unrelated to A–E.

## 4. Real PostgreSQL migration proof

A new temporary PostgreSQL database was created, all 17 repository migrations were applied with `prisma migrate deploy`, and the database was removed afterward.

Observed after migration:

- `MediaProcessingJob` contains `leaseOwner`, `attemptId`, `leaseExpiresAt`, and `heartbeatAt`;
- `MapWorkerLease` was created;
- `MapAsset_one_active_per_project` exists;
- inserting one active map succeeded, while inserting a second active map for the same project failed with PostgreSQL's duplicate-key error for `MapAsset_one_active_per_project`.

## 5. Remaining boundaries

- This report closes only the Critical and Important final-review findings A–E.
- Previously recorded Minor findings and the pre-existing browser-backend/TIFF acceptance boundaries remain outside this fix set.
