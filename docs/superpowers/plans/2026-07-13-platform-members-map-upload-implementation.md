# Platform Members and Lightweight Map Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hard-coded accounts with database-backed platform member management, give members full rights inside assigned projects, keep “更多” visible, remove fake task controls, and simplify project maps to low-memory upload plus history with automatic activation.

**Architecture:** PostgreSQL stores the single platform administrator, members, project memberships, session versions, and platform audit records. NestJS authenticates every request against current database state, while the existing serial media worker handles TIFF and XYZ ZIP jobs from disk and atomically activates only complete maps. React adds a platform-only member page, keeps project actions under “更多”, removes fake task chrome, and reduces map management to one uploader and a polling history table.

**Tech Stack:** TypeScript 5.8, NestJS 10, Prisma 7/PostgreSQL, React 18, Ant Design 5, Node.js `crypto.scrypt`, Node test runner through `tsx --test`, GDAL child processes, `yauzl` lazy ZIP streams.

## Global Constraints

- There is exactly one `platform_admin`; all other accounts have role `member`.
- Platform administrators can access every project and exclusively manage member accounts.
- Members can access only assigned projects and have full business CRUD rights inside them.
- Passwords are never returned or logged; store only salted `scrypt` hashes.
- “更多” remains visible to both roles at approximately 825 px viewport width; map management stays inside it.
- Remove the task page’s fake bell, fixed `12`, duplicate project dropdown, and non-functional sort ornament without inventing replacement behavior.
- Map UI accepts only `.tif`, `.tiff`, and XYZ `z/x/y.png` `.zip` packages.
- Uploads go directly to disk; map jobs are serial; the API and browser never buffer an entire map file.
- Keep the old active map until a new map finishes successfully; failures must not change the active map.
- Do not add multiple administrators, self-service registration, granular module roles, GeoServer, object storage, manual publishing, or rollback UI.

---

### Task 1: Account Schema, Password Hashing, and Bootstrap

**Files:**
- Create: `services/api/prisma/account-schema.test.ts`
- Create: `services/api/prisma/migrations/20260713210000_platform_accounts/migration.sql`
- Create: `services/api/src/modules/auth/password-hash.ts`
- Create: `services/api/src/modules/auth/password-hash.test.ts`
- Create: `services/api/src/modules/auth/account-bootstrap.service.ts`
- Create: `services/api/src/modules/auth/account-bootstrap.service.test.ts`
- Modify: `services/api/prisma/schema.prisma`
- Modify: `services/api/prisma/seed.ts`
- Modify: `services/api/src/modules/auth/auth.module.ts`

**Interfaces:**
- Produces: `hashPassword(password: string): Promise<string>` and `verifyPassword(password: string, encoded: string): Promise<boolean>`.
- Produces: Prisma models `UserAccount`, `ProjectMembership`, and `PlatformAuditLog`.
- Produces: one `platform_admin` row and one migrated `member` row with both existing projects on an empty account database.

- [ ] **Step 1: Write failing account schema and password tests**

```ts
// services/api/src/modules/auth/password-hash.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password-hash.js";

test("stores a salted scrypt hash and never the plain password", async () => {
  const encoded = await hashPassword("member-password-2026");
  assert.match(encoded, /^scrypt\$/);
  assert.doesNotMatch(encoded, /member-password-2026/);
  assert.equal(await verifyPassword("member-password-2026", encoded), true);
  assert.equal(await verifyPassword("wrong", encoded), false);
});
```

```ts
// services/api/prisma/account-schema.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("defines database accounts, project memberships, and platform audit", async () => {
  const schema = await readFile(new URL("./schema.prisma", import.meta.url), "utf8");
  for (const model of ["model UserAccount", "model ProjectMembership", "model PlatformAuditLog"]) {
    assert.match(schema, new RegExp(model));
  }
  assert.match(schema, /tokenVersion\s+Int\s+@default\(1\)/);
  assert.match(schema, /@@unique\(\[userId, projectId\]\)/);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm --filter @xunjianbao/api exec tsx --test src/modules/auth/password-hash.test.ts prisma/account-schema.test.ts`

Expected: FAIL because the password module and account models do not exist.

- [ ] **Step 3: Implement password hashing and Prisma models**

```ts
// services/api/src/modules/auth/password-hash.ts
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [kind, saltText, hashText] = encoded.split("$");
  if (kind !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = await scrypt(password, Buffer.from(saltText, "base64url"), expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
```

Add these Prisma models and relations:

```prisma
model UserAccount {
  id             String   @id
  username       String   @unique
  passwordHash   String
  name           String
  phone          String
  role           String
  status         String   @default("active")
  tokenVersion   Int      @default(1)
  lastLoginAt    DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  memberships    ProjectMembership[]
  platformAudits PlatformAuditLog[] @relation("PlatformAuditActor")
  @@index([role, status])
}

model ProjectMembership {
  id        String   @id
  userId    String
  projectId String
  createdAt DateTime @default(now())
  user      UserAccount @relation(fields: [userId], references: [id], onDelete: Cascade)
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@unique([userId, projectId])
  @@index([projectId])
}

model PlatformAuditLog {
  id        String   @id
  actorId   String
  action    String
  targetId  String?
  summary   String
  createdAt DateTime @default(now())
  actor     UserAccount @relation("PlatformAuditActor", fields: [actorId], references: [id])
  @@index([createdAt])
}
```

The migration must add a PostgreSQL partial unique index:

```sql
CREATE UNIQUE INDEX "UserAccount_single_platform_admin"
ON "UserAccount" ("role") WHERE "role" = 'platform_admin';
```

Add `memberships ProjectMembership[]` to the existing `Project` model.

- [ ] **Step 4: Implement idempotent account bootstrap**

`AccountBootstrapService.onModuleInit()` must create the configured/default `admin` only when no platform administrator exists, create the legacy `member` only when no member with that username exists, and assign that member to `quyang` and `jinshan`. Use `hashPassword`; never log passwords. Register the service in `AuthModule` and mirror the same rows in `prisma/seed.ts`.

- [ ] **Step 5: Run schema, password, and bootstrap tests**

Run: `pnpm --filter @xunjianbao/api exec tsx --test src/modules/auth/password-hash.test.ts src/modules/auth/account-bootstrap.service.test.ts prisma/account-schema.test.ts`

Expected: PASS.

- [ ] **Step 6: Generate and validate Prisma client**

Run: `pnpm db:generate && pnpm --filter @xunjianbao/api exec prisma validate --config prisma.config.ts`

Expected: Prisma generation succeeds and reports the schema is valid.

- [ ] **Step 7: Commit**

```bash
git add services/api/prisma services/api/src/modules/auth
git commit -m "feat: add persistent platform accounts"
```

---

### Task 2: Database Authentication and Project Authorization

**Files:**
- Modify: `services/api/src/modules/auth/auth.service.ts`
- Modify: `services/api/src/modules/auth/auth.service.test.ts`
- Modify: `services/api/src/modules/auth/auth.guard.ts`
- Modify: `services/api/src/modules/auth/auth.guard.test.ts`
- Modify: `services/api/src/modules/auth/auth.controller.ts`
- Modify: `services/api/src/modules/auth/project-context.ts`
- Modify: `services/api/src/modules/auth/project-context.test.ts`
- Modify: `services/api/src/modules/auth/project-context.interceptor.ts`

**Interfaces:**
- Consumes: `verifyPassword` from Task 1 and Prisma `UserAccount` memberships.
- Produces: `AuthIdentity { id, sub, name, role, tokenVersion, projectIds }` with role `platform_admin | member`.
- Produces: async `authenticateToken(token): Promise<AuthIdentity | null>` and `projectsFor(identity): Promise<ProjectAccessItem[]>`.

- [ ] **Step 1: Rewrite authentication tests for database state**

Add fixtures proving:

```ts
test("member receives only current database memberships", async () => {
  const result = await service.login({ username: "member", password: "member-password-2026" });
  assert.equal(result.user.role, "member");
  assert.deepEqual(result.user.projectIds, ["jinshan"]);
});

test("disabled or version-changed accounts invalidate an existing token immediately", async () => {
  const login = await service.login({ username: "member", password: "member-password-2026" });
  fixture.user.status = "disabled";
  assert.equal(await service.authenticateToken(login.token), null);
});
```

Update guard tests so member PATCH succeeds in an assigned project, unassigned projects return 403, `/api/v1/platform/*` is platform-admin-only, and `/auth/projects` needs no selected project.

- [ ] **Step 2: Run focused auth tests and verify RED**

Run: `pnpm --filter @xunjianbao/api exec tsx --test src/modules/auth/auth.service.test.ts src/modules/auth/auth.guard.test.ts src/modules/auth/project-context.test.ts`

Expected: FAIL because authentication is synchronous, hard-coded, and members are read-only.

- [ ] **Step 3: Implement database-backed async authentication**

The signed token payload must be:

```ts
interface SignedPayload {
  sub: string;          // UserAccount.id
  ver: number;          // tokenVersion
  exp: number;
  iat: number;
}
```

`authenticateToken` verifies HMAC, loads the active account with memberships, compares `ver`, then builds current identity. `login` verifies the scrypt hash and updates `lastLoginAt`. `projectsFor` queries all projects for `platform_admin` and only membership projects for `member`.

- [ ] **Step 4: Implement authorization rules**

Make `AuthGuard.canActivate` async. After authentication:

```ts
if (request.path === "/api/v1/auth/projects") return true;
if (request.path.startsWith("/api/v1/platform/")) {
  if (identity.role !== "platform_admin") throw new ForbiddenException("Platform administrator required");
  return true;
}
if (!projectId) throw new BadRequestException("Project selection required");
if (identity.role !== "platform_admin" && !identity.projectIds.includes(projectId)) {
  throw new ForbiddenException("Project access denied");
}
request.projectId = projectId;
return true;
```

Remove every HTTP-method restriction for members. Update the controller to `await` login and project queries, and propagate the expanded identity through async request context.

- [ ] **Step 5: Run focused auth tests and API typecheck**

Run: `pnpm --filter @xunjianbao/api exec tsx --test src/modules/auth/auth.service.test.ts src/modules/auth/auth.guard.test.ts src/modules/auth/project-context.test.ts && pnpm --filter @xunjianbao/api typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/modules/auth
git commit -m "feat: enforce database project access"
```

---

### Task 3: Platform Member Management API

**Files:**
- Create: `services/api/src/modules/platform-members/platform-members.module.ts`
- Create: `services/api/src/modules/platform-members/platform-members.controller.ts`
- Create: `services/api/src/modules/platform-members/platform-members.service.ts`
- Create: `services/api/src/modules/platform-members/platform-members.service.test.ts`
- Modify: `services/api/src/app.module.ts`

**Interfaces:**
- Produces: `GET /api/v1/platform/members`.
- Produces: `POST /api/v1/platform/members` with `{ name, phone, username, password, projectIds }`.
- Produces: `PATCH /api/v1/platform/members/:id` with `{ name, phone, projectIds, status }`.
- Produces: `POST /api/v1/platform/members/:id/reset-password` with `{ password }`.

- [ ] **Step 1: Write service tests for validation and session invalidation**

```ts
test("creates a member with at least one project and no password in the response", async () => {
  const member = await service.create({
    name: "张三", phone: "13800138000", username: "zhangsan",
    password: "member-password-2026", projectIds: ["jinshan"],
  });
  assert.deepEqual(member.projectIds, ["jinshan"]);
  assert.equal("passwordHash" in member, false);
});

test("changing projects increments tokenVersion and records platform audit", async () => {
  await service.update("member-1", { projectIds: ["quyang"] });
  assert.equal(fixture.updatedAccount.tokenVersion.increment, 1);
  assert.equal(fixture.audit.action, "member.projects.update");
});
```

Also assert duplicate usernames, invalid phone numbers, passwords shorter than 8 characters, empty project arrays, unknown projects, and attempts to edit the platform administrator are rejected.

- [ ] **Step 2: Run the service test and verify RED**

Run: `pnpm --filter @xunjianbao/api exec tsx --test src/modules/platform-members/platform-members.service.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement focused service and controller**

Use one transaction per create/update/reset. Return this safe DTO only:

```ts
export interface PlatformMemberDto {
  id: string;
  name: string;
  phone: string;
  username: string;
  status: "active" | "disabled";
  projectIds: string[];
  projectNames: string[];
  createdAt: string;
}
```

Every membership/status/password change increments `tokenVersion`. Audit summaries may include member name and project names but never password input or `passwordHash`.

- [ ] **Step 4: Register module and run tests/typecheck**

Run: `pnpm --filter @xunjianbao/api exec tsx --test src/modules/platform-members/platform-members.service.test.ts && pnpm --filter @xunjianbao/api typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/app.module.ts services/api/src/modules/platform-members
git commit -m "feat: add platform member management api"
```

---

### Task 4: Platform Member Management UI

**Files:**
- Create: `apps/admin-web/src/pages/PlatformMembersPage.tsx`
- Create: `apps/admin-web/src/pages/platform-member-state.ts`
- Create: `apps/admin-web/src/pages/platform-member-state.test.ts`
- Modify: `apps/admin-web/src/App.tsx`
- Modify: `apps/admin-web/src/pages/ProjectSelectPage.tsx`
- Modify: `apps/admin-web/src/auth/project-access.ts`
- Modify: `apps/admin-web/src/auth/project-access.test.ts`
- Modify: `apps/admin-web/src/auth/session.ts`
- Modify: `apps/admin-web/src/styles/global.css`

**Interfaces:**
- Consumes: platform member endpoints from Task 3 and `/auth/projects` from Task 2.
- Produces: `/platform/members`, accessible only when session role is `platform_admin`.
- Produces: `canManagePlatform(role): boolean`; project members remain full project editors.

- [ ] **Step 1: Write failing frontend state tests**

```ts
test("only the platform administrator can manage members", () => {
  assert.equal(canManagePlatform("platform_admin"), true);
  assert.equal(canManagePlatform("member"), false);
});

test("member payload requires an account, phone, password, and project", () => {
  assert.deepEqual(validateMemberDraft({ name: "", phone: "", username: "", password: "", projectIds: [] }), [
    "请输入姓名", "请输入正确手机号", "请输入登录账号", "密码至少 8 位", "至少选择一个项目",
  ]);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter @xunjianbao/api exec tsx --test /Users/bolin/Documents/巡检宝/apps/admin-web/src/auth/project-access.test.ts /Users/bolin/Documents/巡检宝/apps/admin-web/src/pages/platform-member-state.test.ts`

Expected: FAIL because platform member state and the new role do not exist.

- [ ] **Step 3: Implement role/session changes and route guard**

Change `ProjectRole` to `"platform_admin" | "member"`. Replace read-only helpers with:

```ts
export const canModifyProject = (role?: string) => role === "platform_admin" || role === "member";
export const canManagePlatform = (role?: string) => role === "platform_admin";
```

Add `RequirePlatformAdmin` in `App.tsx`; route `/platform/members` inside `RequireAuth` but outside `RequireProject`.

- [ ] **Step 4: Implement member list and dialogs**

`PlatformMembersPage` renders a table for name, phone, username, project tags, status, and created time. Add create/edit/reset/status dialogs. Password inputs use `type="password"`; member responses are typed without password fields. The project selector is `mode="multiple"` and requires at least one value.

Add a platform management button on `ProjectSelectPage` only for the platform administrator.

- [ ] **Step 5: Run frontend tests, typecheck, and build**

Run: `pnpm --filter @xunjianbao/api exec tsx --test /Users/bolin/Documents/巡检宝/apps/admin-web/src/auth/project-access.test.ts /Users/bolin/Documents/巡检宝/apps/admin-web/src/pages/platform-member-state.test.ts && pnpm --filter @xunjianbao/admin-web build`

Expected: tests PASS and Vite build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src
git commit -m "feat: add platform member management ui"
```

---

### Task 5: Keep “更多” Visible and Remove Fake Task Controls

**Files:**
- Modify: `apps/admin-web/src/components/Shell.tsx`
- Modify: `apps/admin-web/src/components/navigation-config.ts`
- Modify: `apps/admin-web/src/components/navigation-config.test.ts`
- Modify: `apps/admin-web/src/pages/MediaLibraryPage.tsx`
- Modify: `apps/admin-web/src/styles/global.css`

**Interfaces:**
- Consumes: `canManagePlatform` and new roles from Task 4.
- Produces: the same “更多” menu for both roles, with platform management appended only for `platform_admin`.

- [ ] **Step 1: Extend navigation tests**

```ts
test("project members retain account menu actions", () => {
  assert.deepEqual(accountNavigation("member").map((item) => item.label), ["切换项目", "地图", "操作日志"]);
});

test("platform administrator also sees member management", () => {
  assert.equal(accountNavigation("platform_admin").some((item) => item.label === "人员管理"), true);
});
```

- [ ] **Step 2: Run navigation tests and verify RED**

Run: `pnpm --filter @xunjianbao/api exec tsx --test /Users/bolin/Documents/巡检宝/apps/admin-web/src/components/navigation-config.test.ts`

Expected: FAIL because `accountNavigation` does not exist.

- [ ] **Step 3: Implement navigation and responsive fix**

Create `accountNavigation(role)` from stable items. In the `max-width: 900px` rule, replace the broad selector that hides every project-pill `div`:

```css
.project-pill > div:first-child { display: none; }
.project-pill .account-menu { display: block; }
```

Keep the “更多” trigger visible at 825 px and label members as “项目成员”, not “只读”.

- [ ] **Step 4: Remove fake task controls**

Delete `Bell`, `ChevronDown`, the `media-notice` markup, duplicate project name block, and the inert “按上传时间排序” toolbar element from `MediaLibraryPage.tsx`. Keep functional filters, new task, reports, statistics, and task cards. Remove now-unused CSS selectors.

- [ ] **Step 5: Run tests and frontend build**

Run: `pnpm --filter @xunjianbao/api exec tsx --test /Users/bolin/Documents/巡检宝/apps/admin-web/src/components/navigation-config.test.ts && pnpm --filter @xunjianbao/admin-web build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src/components apps/admin-web/src/pages/MediaLibraryPage.tsx apps/admin-web/src/styles/global.css
git commit -m "fix: keep account menu visible and remove fake controls"
```

---

### Task 6: Unified Project Map Upload and History API

**Files:**
- Create: `services/api/prisma/migrations/20260713220000_map_upload_history/migration.sql`
- Modify: `services/api/prisma/schema.prisma`
- Modify: `services/api/prisma/project-access-schema.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `services/api/src/modules/map-assets/map-asset-upload.service.ts`
- Modify: `services/api/src/modules/map-assets/map-asset-upload.service.test.ts`
- Modify: `services/api/src/modules/map-assets/map-assets.controller.ts`
- Modify: `services/api/src/database/inspection-read.repository.ts`
- Modify: `services/api/src/database/inspection-read.repository.test.ts`

**Interfaces:**
- Consumes: `currentIdentity()` and selected project.
- Produces: one `POST /api/v1/map-assets/upload` accepting only TIFF/TIFF or XYZ ZIP.
- Produces: history fields `uploadedByName`, `createdAt`, `activatedAt`, and `errorMessage` in `MapAssetSummary`.
- Produces: job types `tiff_tile` and `map_tile_package` with map asset id and source path.

- [ ] **Step 1: Write failing schema and upload tests**

Extend schema tests to require `uploadedByAccountId`, `errorMessage`, and `activatedAt` on `MapAsset`. Add service tests:

```ts
test("queues TIFF without reading it into memory", async () => {
  const asset = await service.createFromUpload(tiffFile, { name: "金山底图" });
  assert.equal(asset.processStatus, "queued");
  assert.equal(jobCreate.data.jobType, "tiff_tile");
});

test("queues an XYZ ZIP for worker-side validation", async () => {
  await service.createFromUpload(zipFile, { name: "金山瓦片" });
  assert.equal(jobCreate.data.jobType, "map_tile_package");
});
```

Assert PNG/JPEG uploads are rejected and temp files are removed.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter @xunjianbao/api exec tsx --test prisma/project-access-schema.test.ts src/modules/map-assets/map-asset-upload.service.test.ts src/database/inspection-read.repository.test.ts`

Expected: FAIL on missing fields and ZIP queue behavior.

- [ ] **Step 3: Add map history fields and safe DTO**

Add optional uploader relation and:

```prisma
uploadedByAccountId String?
errorMessage        String?
activatedAt         DateTime?
uploadedBy          UserAccount? @relation(fields: [uploadedByAccountId], references: [id], onDelete: SetNull)
```

Add the opposite `uploadedMaps MapAsset[]` relation to `UserAccount` in the same schema change.

Extend `MapAssetSummary` with `uploadedByName?: string | null`, `createdAt: string`, `activatedAt?: string | null`, and `errorMessage?: string | null`. Select them in repository list/detail queries.

- [ ] **Step 4: Make upload disk-only and queue both formats**

Restrict extensions to `.tif`, `.tiff`, and `.zip`. Move the completed Multer temp file into `storage/map-assets`, create the history record with status `queued`, then create the matching worker job. Do not inspect or extract ZIP in the API service. Keep the old tile-package endpoint as a compatibility wrapper calling the unified method.

- [ ] **Step 5: Run tests, generate Prisma, and typecheck**

Run: `pnpm db:generate && pnpm --filter @xunjianbao/api exec tsx --test prisma/project-access-schema.test.ts src/modules/map-assets/map-asset-upload.service.test.ts src/database/inspection-read.repository.test.ts && pnpm --filter @xunjianbao/api typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/api/prisma packages/shared/src/index.ts services/api/src/modules/map-assets services/api/src/database
git commit -m "feat: queue lightweight project map uploads"
```

---

### Task 7: Low-Memory Map Worker and Automatic Activation

**Files:**
- Create: `services/media-worker/src/map-tile-package-extractor.ts`
- Create: `services/media-worker/src/map-tile-package-extractor.test.ts`
- Modify: `services/media-worker/src/gdal-tile-generator.ts`
- Modify: `services/media-worker/src/gdal-tile-generator.test.ts`
- Modify: `services/media-worker/src/job-runner.ts`
- Modify: `services/media-worker/src/job-runner.test.ts`

**Interfaces:**
- Consumes: queued `tiff_tile` and `map_tile_package` jobs from Task 6.
- Produces: `extractTilePackage({ sourcePath, outputDirectory }): Promise<TileMapMetadata>` using lazy ZIP entry streams.
- Produces: transactionally activated `MapAsset` with `processStatus="published"`, `isActive=true`, and `activatedAt`.

- [ ] **Step 1: Write failing streaming and activation tests**

```ts
test("extracts XYZ entries lazily and rejects traversal", async () => {
  const metadata = await extractTilePackage({ sourcePath: fixtureZip, outputDirectory });
  assert.equal(metadata.tileCount, 2);
  await assert.rejects(() => extractTilePackage({ sourcePath: traversalZip, outputDirectory }), /路径无效/);
});

test("successful map processing atomically replaces only the current project map", async () => {
  await runner.processNext();
  assert.deepEqual(deactivateCall.where, { projectId: "jinshan", isActive: true });
  assert.equal(activateCall.data.isActive, true);
  assert.equal(activateCall.data.processStatus, "published");
});
```

Add failure coverage proving the old map remains active and the new map stores `failed` plus a readable reason.

- [ ] **Step 2: Run worker tests and verify RED**

Run: `pnpm --filter @xunjianbao/media-worker exec tsx --test src/map-tile-package-extractor.test.ts src/gdal-tile-generator.test.ts src/job-runner.test.ts`

Expected: FAIL because ZIP map jobs and automatic activation are absent.

- [ ] **Step 3: Implement lazy XYZ ZIP extraction**

Use `yauzl.open(..., { lazyEntries: true })`. Validate every file against `^\d{1,2}/\d+/\d+\.png$`, reject absolute/traversal paths, create parent directories, and pipe one `openReadStream` to one file at a time before calling `readEntry()` again. Track only coordinate keys and incremental min/max zoom/bounds; never collect tile buffers.

- [ ] **Step 4: Bound GDAL and tile metadata memory**

Replace recursive `readdir` with a zoom/x directory walk that processes one directory listing at a time. Launch GDAL with one process and bounded cache:

```ts
env: { ...process.env, GDAL_CACHEMAX: "128" }
args: ["--xyz", "--processes=1", `--zoom=${minZoom}-${maxZoom}`, "--resampling=average", source, output]
```

Capture only a bounded error tail from child processes rather than unbounded stdout.

- [ ] **Step 5: Implement worker job, cleanup, and auto-activation**

Add `map_tile_package` to `claimOne`. Both map processors write into `storage/map-tiles/.tmp-<assetId>` and rename to the final directory only after validation. In one Prisma transaction: deactivate current map rows for the same project, update the new map to active/published with metadata and activation time, complete the job, and add project audit. On exception, remove temporary output, mark only the new map failed, and leave the old active row unchanged.

- [ ] **Step 6: Run worker tests and typecheck**

Run: `pnpm --filter @xunjianbao/media-worker test && pnpm --filter @xunjianbao/media-worker typecheck`

Expected: PASS with no failed tests.

- [ ] **Step 7: Commit**

```bash
git add services/media-worker/src
git commit -m "feat: process project maps with bounded memory"
```

---

### Task 8: Simplified Map Upload and History Page

**Files:**
- Create: `apps/admin-web/src/pages/map-upload-presenter.ts`
- Create: `apps/admin-web/src/pages/map-upload-presenter.test.ts`
- Rewrite: `apps/admin-web/src/pages/MapAssetsPage.tsx`
- Modify: `apps/admin-web/src/styles/global.css`

**Interfaces:**
- Consumes: unified map upload and map history DTO from Task 6.
- Produces: a two-section project page with uploader and paged/polling history.

- [ ] **Step 1: Write failing presenter tests**

```ts
test("presents the five approved map states", () => {
  assert.equal(mapStatusLabel({ processStatus: "queued", isActive: false }), "等待处理");
  assert.equal(mapStatusLabel({ processStatus: "running", isActive: false }), "处理中");
  assert.equal(mapStatusLabel({ processStatus: "published", isActive: true }), "当前使用");
  assert.equal(mapStatusLabel({ processStatus: "failed", isActive: false }), "处理失败");
});

test("accepts only TIFF and ZIP names", () => {
  assert.equal(isSupportedMapFile("park.tif"), true);
  assert.equal(isSupportedMapFile("tiles.zip"), true);
  assert.equal(isSupportedMapFile("photo.jpg"), false);
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm --filter @xunjianbao/api exec tsx --test /Users/bolin/Documents/巡检宝/apps/admin-web/src/pages/map-upload-presenter.test.ts`

Expected: FAIL because the presenter is missing.

- [ ] **Step 3: Implement presenter and rewrite page**

The new page contains:

```tsx
<PageHeader eyebrow="PROJECT MAP" title="地图管理" />
<Form form={form} layout="vertical" onFinish={submitUpload}>
  <Form.Item name="name" label="地图名称" rules={[{ required: true, message: "请输入地图名称" }]}>
    <Input />
  </Form.Item>
  <Form.Item name="file" label="地图文件" valuePropName="fileList" rules={[{ required: true, message: "请选择地图文件" }]}>
    <Upload accept=".tif,.tiff,.zip" beforeUpload={() => false} maxCount={1}>
      <Button>选择文件</Button>
    </Upload>
  </Form.Item>
  <Button htmlType="submit" type="primary">上传地图</Button>
</Form>
<Table rowKey="id" columns={historyColumns} dataSource={history.items} />
```

Implement those elements directly in `MapAssetsPage.tsx` without retaining the pipeline, map-type filters, ordinary image modal, publish button, detail/download buttons, or hot-area modal. Show `errorMessage` under failed status. Poll the list every 3 seconds only while any row is queued/running, and stop polling on unmount or when no row is active.

- [ ] **Step 4: Run presenter tests and frontend build**

Run: `pnpm --filter @xunjianbao/api exec tsx --test /Users/bolin/Documents/巡检宝/apps/admin-web/src/pages/map-upload-presenter.test.ts && pnpm --filter @xunjianbao/admin-web build`

Expected: PASS and successful Vite build.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/pages/MapAssetsPage.tsx apps/admin-web/src/pages/map-upload-presenter* apps/admin-web/src/styles/global.css
git commit -m "feat: simplify project map management"
```

---

### Task 9: Migration, Full Regression, and Browser Acceptance

**Files:**
- Update: `docs/superpowers/plans/2026-07-13-platform-members-map-upload-implementation.md` checkboxes

**Interfaces:**
- Consumes: all prior tasks.
- Produces: migrated local database, running local services, and evidence for every acceptance rule.

- [x] **Step 1: Run all tests fresh**

Run:

```bash
pnpm --filter @xunjianbao/api test
pnpm --filter @xunjianbao/media-worker test
rg --files /Users/bolin/Documents/巡检宝/apps/admin-web/src -g '*.test.ts' -0 | xargs -0 pnpm --filter @xunjianbao/api exec tsx --test
```

Expected: zero failures.

- [x] **Step 2: Run full workspace verification**

Run:

```bash
pnpm typecheck
pnpm build
pnpm --filter @xunjianbao/api exec prisma validate --config prisma.config.ts
git diff --check
```

Expected: all commands exit 0; the existing Vite bundle-size warning is acceptable, but TypeScript or build errors are not.

- [x] **Step 3: Apply migrations and restart stable services**

Task 9 used isolated ports `5193`/`3011` and an acceptance database copy so the existing `5183`/`3010` stack remained untouched.

Run: `pnpm dev:stop && pnpm db:deploy && pnpm dev:stable && pnpm dev:status`

Expected: both new migrations apply, then frontend, API, and worker report healthy.

- [x] **Step 4: Verify API authorization and account safety**

Using local requests, verify:

- platform administrator lists both projects and members;
- member lists only assigned projects;
- member can POST/PATCH/DELETE inside an assigned project;
- member receives 403 for an unassigned project and every `/platform/*` route;
- member API responses contain neither `password` nor `passwordHash`;
- changing membership invalidates the old token.

- [ ] **Step 5: Verify browser flows at desktop and 825 px**

Blocked on 2026-07-14: the required Browser runtime reported `No browser is available`, and `agent.browsers.list()` returned `[]`. HTTP acceptance was completed, but visual browser acceptance and screenshots were not substituted with another tool.

Check login → project selection → platform members → member create/edit/reset/disable. At a viewport around 825 px, verify both roles see “更多”. On the task page verify the fake notification/project block and inert sorting ornament are absent.

- [ ] **Step 6: Verify map success/failure behavior**

Partial on 2026-07-14: real valid and invalid ZIP uploads, history, active-map preservation, tile HTTP response, and process memory were verified. The tiny valid ZIP moved from queued to published too quickly to capture the transient running state, and dashboard network inspection requires the blocked Browser runtime.

Upload a small valid XYZ ZIP and confirm: queued → processing → current; history shows uploader and time; the dashboard loads only tile requests for the current view. Upload an invalid ZIP and confirm it becomes failed while the prior active map still renders. Inspect worker/API process memory during the fixture uploads and confirm it does not grow in proportion to uncompressed map content.

- [x] **Step 7: Commit any verification-only corrections**

```bash
git add -A
git commit -m "test: verify platform access and map workflow"
```

Skip this commit when verification required no file changes.
