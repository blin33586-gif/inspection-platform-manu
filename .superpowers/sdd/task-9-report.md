# Task 9 Migration, Regression, and Acceptance Report

Date: 2026-07-14 (Asia/Shanghai)

Overall status: **PARTIAL — migration, seed, regression, HTTP authorization, and real map processing passed; required browser visual acceptance is externally blocked because no browser backend is available.**

## 1. Database safety, backup, migration, and seed

- Source database: current local PostgreSQL development database `xunjianbao`.
- Pre-change logical backup: `/Users/bolin/Documents/巡检宝/.backups/task-9/xunjianbao-before-platform-members-map-20260714-004853.dump`.
- Backup SHA-256: `7af1216f55d06db4d1481067c35e25ea1384d72739b5a39f0bb6387d4baa62f5`.
- Recovery proof: the custom archive was restored into a temporary database and its core counts matched the source before that temporary database was removed.
- Pre-migration counts: `Project=2`, `InspectionTask=2`, `Issue=12`, `MediaAsset=92`, `MapAsset=2`.
- Applied migrations:
  - `20260713210000_platform_accounts`
  - `20260713220000_map_upload_history`
  - `20260714003000_map_status_contract`
- Applied migration count moved from 13 to 16.

The first real seed run exposed a critical pre-existing safety defect: `seed.ts` deleted business tables before recreating fixtures (`Issue` dropped from 12 to 4). The development database was immediately recovered from the verified backup, migrated again, and checked at `Issue=12`, `MediaAsset=92`, and `AuditLog=79`.

The seed was then repaired with TDD:

- no `deleteMany` calls in seed;
- fixture collections use `skipDuplicates: true`;
- existing account profiles and password hashes are not overwritten;
- focused safety test was observed failing before the fix and passing after it.

Repaired seed was run twice against the restored/migrated development database. Both post-seed snapshots were identical: `Project=2`, `InspectionTask=2`, `Issue=12`, `MediaAsset=92`, `MapAsset=2`, `AuditLog=79`, `UserAccount=2`, `ProjectMembership=2`.

Fix commit: `7204ceb932f8e77eddd64a3a2af22a99b6a2345c` (`fix: make database seed non-destructive`).

## 2. Fresh regression and workspace verification

All commands were run from `/Users/bolin/Documents/巡检宝/.worktrees/platform-members-map` after the seed fix.

| Verification | Result |
| --- | --- |
| API test suite | 162 passed, 0 failed |
| Media worker test suite | 43 passed, 0 failed |
| Admin web TypeScript tests | 77 passed, 0 failed |
| Workspace `pnpm typecheck` | exit 0 |
| Workspace `pnpm build` | exit 0 |
| Prisma schema validation | valid |
| `git diff --check` | exit 0 |

The documented Vite chunk-size warning occurred and is the explicitly accepted warning. The original relative admin test command resolved paths from the API package and failed to find files; rerunning with absolute paths inside this worktree produced the 77/77 result above.

## 3. Isolated acceptance stack

To avoid disturbing the existing `5183` frontend and `3010` API, acceptance used a post-migration database copy named `xunjianbao_task9_acceptance` and this worktree only:

- frontend: `http://127.0.0.1:5193/` — HTTP 200;
- API: `http://127.0.0.1:3011/api/v1` — `/health` HTTP 200;
- worker: this worktree, the acceptance database copy, and this worktree's API storage directory.

The original `5183`/`3010` listeners remained present throughout acceptance.

## 4. HTTP authorization and account-safety evidence

The temporary acceptance member was left disabled in the isolated acceptance database.

| Check | Observed result |
| --- | --- |
| Administrator project list | HTTP 200, exactly `quyang,jinshan` |
| Administrator member list | HTTP 200; no `password` or `passwordHash` key |
| Create temporary member | HTTP 201, assigned only `quyang`; safe response fields |
| Member login and project list | HTTP 201/200, role `member`, exactly `quyang` |
| Member `/platform/members` | HTTP 403, `Platform administrator required` |
| Member request to unassigned `jinshan` | HTTP 403, `Project access denied` |
| Member read inside assigned `quyang` | HTTP 200 |
| Member POST/PATCH/DELETE inside assigned project | HTTP 201/200/200 using a temporary map hot area |
| Change membership to `jinshan` | HTTP 200; old token immediately HTTP 401 |
| Login after membership change | HTTP 201, exactly `jinshan` |
| Reset password | HTTP 201; prior token and prior password both HTTP 401 |
| Login with reset password | HTTP 201 |
| Disable member | HTTP 200, status `disabled`; token and subsequent login both HTTP 401 |

## 5. Real XYZ ZIP map acceptance and memory

GDAL is not installed (`gdal2tiles.py` absent), so no TIFF conversion was attempted, as required.

Valid fixture:

- ZIP size: 33,738 bytes;
- one existing valid PNG at `17/109766/53529.png`;
- upload HTTP 201 and immediate map/history status `queued` with `hasProcessing=true`;
- history contains uploader `项目管理员` and creation time `2026-07-13T16:55:23.604Z`;
- after the worker ran: `processStatus=published`, `isActive=true`, and active-map ID matched the new map;
- direct current-view tile request returned HTTP 200 with 33,338 bytes.

Invalid fixture:

- ZIP size: 723 bytes with a non-XYZ entry;
- upload HTTP 201 and immediate status `queued`;
- final status `failed` with readable reason `ZIP 瓦片目录必须为 z/x/y.png，且坐标有效`;
- the previously active valid map remained active.

Memory snapshots around these tiny fixtures:

- API RSS: approximately 72 MB before upload, 107 MB immediately after multipart upload, and 78 MB after processing;
- worker RSS after valid processing: approximately 60 MB;
- worker RSS after invalid processing: approximately 59 MB.

The bounded fixtures did not show growth proportional to expanded map content. The valid job's transient `running` state completed before the polling sample captured it; real `queued` and final `published/current` states were observed, while the worker regression suite covers the running/processing path.

## 6. Browser acceptance blocker

The required Browser skill was used exactly as instructed. Runtime setup succeeded, but URL selection returned:

`No browser is available`

The required bootstrap troubleshooting was then read and `agent.browsers.list()` was called once; it returned `[]`. The skill explicitly forbids substituting an unrelated browser-control surface, so no screenshots or visual claims were fabricated.

Consequently, these items remain unverified in a real browser:

- desktop login → project selection → member management visual flow;
- administrator and member account menus at approximately 825 px, including visible/expandable `更多` and no horizontal overflow;
- task-center removal of the fake bell, fixed 12, duplicate project block, and inert sort ornament;
- map page showing only upload and history sections;
- dashboard network inspection proving only current-view tiles are requested.

Automated admin tests covering the account menu, 825 px CSS rule, removed task ornaments, member UI state, and simplified map presenter all passed, but they are not a substitute for the required browser acceptance.

Shortest re-verification once a browser backend is available:

1. Start the isolated API on 3011 and frontend on 5193 against an acceptance database copy.
2. Open `http://127.0.0.1:5193/` in the in-app browser.
3. Log in as administrator, select both projects, open `更多 → 人员管理`, and create/edit/reset/disable a fresh temporary member.
4. Log in as that member and confirm only the assigned project plus project write actions.
5. Repeat administrator and member shell checks at an approximately 825 px viewport and save screenshots.
6. Inspect the task center, map page, and dashboard network tile requests; save screenshots/network evidence.

## 7. Residual risks

- Required browser visual acceptance and screenshots are outstanding solely because no browser backend was exposed to this task.
- The real valid map job's transient `running` state was not sampled due to the intentionally tiny fixture and fast local processing.
- TIFF conversion remains unexecuted because GDAL is unavailable; this was an explicit acceptance boundary, not an unexpected failure.
