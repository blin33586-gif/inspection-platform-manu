# Final Review Refix Report

Date: 2026-07-14 (Asia/Shanghai)

Status: **GREEN — the requested Critical/Important A, D1–D4, and E1–E2 findings are closed.** Minor findings were not included.

## A. Safe seed and deployment credentials

- Seed and API account bootstrap now permit public development defaults only when `NODE_ENV` is explicitly `development` or `test`.
- Missing `NODE_ENV` uses safe mode. A fresh database requires explicit administrator and member credentials; member credentials must meet the production-strength rule.
- Docker Compose uses required-variable interpolation for both member credentials, so interpolation fails before container startup when either is absent.
- `.env.example` and README now document private administrator/member logins and strong member passwords rather than publishing the development member password.
- Regression coverage exercises both fresh-database paths: the seed CLI and `AccountBootstrapService` used by the API.

## D. Map worker migration, recovery, and fencing

- The undeployed lease migration requeues legacy running map jobs, clears owner/attempt/expiry/heartbeat state, and changes running map assets back to queued.
- Every staging directory contains an attempt marker. Rename promotes the marker with the tiles; crash recovery removes a promoted final directory only when the marker matches the expired attempt.
- A foreign-attempt final directory and a marker-free published final directory are never removed. The marker is deleted only after the database publication transaction commits.
- Success and failure transactions begin with a conditional job update fenced by job id, running status, lease owner, attempt id, and a non-expired lease. A zero count aborts the transaction before any map asset mutation.
- Recovery renews the database-global lease in the background, renews again after each potentially large cleanup, and revalidates ownership immediately before claim. Losing ownership stops claim.

## E. Service authorization and audited writes

- Every public `PlatformMembersService` method requires a captured `platform_admin` identity before validation, password hashing, or database access.
- Platform audit `actorId` comes from that captured identity. Controllers do not accept or forward an actor id.
- Issue publication and media upload now write their business record/job and audit row in the same database transaction. Audit failure rolls back the records; upload cleanup removes the moved durable file.
- The same identity-first and transaction ordering was applied to audited task, issue, managed-object, map, report, and attachment write services found by the source scan.
- Direct-call regressions prove member/missing contexts cannot reach platform-member storage and missing media identity cannot move the upload or write the database.

## TDD evidence

The new regressions were run before implementation and failed for the intended reasons:

- seed/API bootstrap accepted public defaults when `NODE_ENV` was absent;
- Compose accepted missing member variables;
- the migration left legacy map work running;
- crash recovery left an attempt-owned promoted final directory;
- success had no first-statement database fence and stale failure mutated the replacement asset;
- recovery did not heartbeat/revalidate the global lease;
- direct member/missing contexts reached platform-member methods;
- issue/media audit failure left committed business rows/jobs, and an unauthenticated media call moved its file.

After the minimal fixes, focused results were:

- seed/API/Compose credentials: 10 passed;
- migration schema checks: 3 passed;
- worker lease/job runner: 28 passed;
- platform members, issue publication, and media upload: 36 passed;
- affected API fixture/transaction checks: 41 passed.

## Full verification

| Check | Result |
| --- | --- |
| API tests | 186 passed, 0 failed |
| Media-worker tests | 55 passed, 0 failed |
| Admin-web TypeScript tests | 77 passed, 0 failed |
| Workspace `pnpm typecheck` | exit 0 |
| Workspace `pnpm build` | exit 0 |
| Prisma client generation | exit 0 |
| Prisma schema validation | valid |
| `git diff --check` | exit 0 |
| Separate post-write `auditService.record` source scan | no matches |

The admin production build retains the known non-blocking warning for the approximately 1.5 MB main JavaScript chunk.

## PostgreSQL migration proof

- A fresh temporary PostgreSQL database applied all 17 repository migrations with `prisma migrate deploy`.
- A second pre-lease legacy database was populated with a running map job, a running map asset, and two active maps before applying the lease migration.
- After migration, the job was queued and its lease owner, attempt id, lease expiry, and heartbeat were null; the running asset was queued.
- Duplicate active maps were normalized to one active row. Attempting to make a second row active raised PostgreSQL `unique_violation` for the partial unique index.
- Both temporary databases were removed after verification.

## Remaining concerns

- No requested Critical/Important item remains open.
- Minor findings remain outside this change set.
- File-system rename and PostgreSQL commit cannot be one atomic operation; the attempt marker plus fenced crash recovery is the explicit recovery protocol for that boundary.
