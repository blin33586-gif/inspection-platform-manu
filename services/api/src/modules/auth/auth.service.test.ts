import assert from "node:assert/strict";
import test from "node:test";
import { AuthService } from "./auth.service.js";
import { hashPassword } from "./password-hash.js";

interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  name: string;
  role: "platform_admin" | "member";
  status: "active" | "disabled";
  tokenVersion: number;
  memberships: Array<{ projectId: string }>;
  lastLoginAt: Date | null;
}

const projects = [
  {
    id: "quyang",
    name: "曲阳街道城管巡检项目",
    shortName: "曲阳街道",
    customerType: "街道城管",
    archiveDimensions: [
      { key: "community", label: "小区档案" },
      { key: "road", label: "道路街面" },
      { key: "point", label: "重点点位" },
    ],
  },
  {
    id: "jinshan",
    name: "金山化工园区项目",
    shortName: "金山化工园区",
    customerType: "化工园区",
    archiveDimensions: [
      { key: "community", label: "企业档案" },
      { key: "road", label: "道路档案" },
      { key: "point", label: "河道档案" },
    ],
  },
];

async function createFixture(role: StoredUser["role"] = "member") {
  const user: StoredUser = {
    id: role === "platform_admin" ? "platform-admin" : "member-1",
    username: role === "platform_admin" ? "admin" : "member",
    passwordHash: await hashPassword(role === "platform_admin" ? "admin-password-2026" : "member-password-2026"),
    name: role === "platform_admin" ? "项目管理员" : "项目成员",
    role,
    status: "active",
    tokenVersion: 3,
    memberships: role === "member" ? [{ projectId: "jinshan" }] : [],
    lastLoginAt: null,
  };

  const database = {
    userAccount: {
      findUnique: async ({ where }: { where: { username?: string; id?: string } }) => {
        if (where.username !== undefined) return where.username === user.username ? user : null;
        return where.id === user.id ? user : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: { lastLoginAt: Date } }) => {
        assert.equal(where.id, user.id);
        user.lastLoginAt = data.lastLoginAt;
        return user;
      },
    },
    project: {
      findMany: async ({ where }: { where?: { memberships?: { some?: { userId?: string } } } } = {}) => {
        const userId = where?.memberships?.some?.userId;
        if (!userId) return projects;
        return projects.filter((project) => user.memberships.some((membership) => membership.projectId === project.id));
      },
    },
  };

  return { user, database, service: new AuthService(database as never) };
}

test("member receives only current database memberships", async () => {
  const { service } = await createFixture();

  const result = await service.login({ username: "member", password: "member-password-2026" });

  assert.equal(result.user.role, "member");
  assert.deepEqual(result.user.projectIds, ["jinshan"]);
});

test("login records the successful login time", async () => {
  const fixture = await createFixture();

  await fixture.service.login({ username: "member", password: "member-password-2026" });

  assert.ok(fixture.user.lastLoginAt instanceof Date);
});

test("authentication reloads the account and its current memberships", async () => {
  const fixture = await createFixture();
  const login = await fixture.service.login({ username: "member", password: "member-password-2026" });
  fixture.user.memberships = [{ projectId: "quyang" }];

  assert.deepEqual(await fixture.service.authenticateToken(login.token), {
    id: "member-1",
    sub: "member-1",
    name: "项目成员",
    role: "member",
    tokenVersion: 3,
    projectIds: ["quyang"],
  });
});

test("disabled or version-changed accounts invalidate an existing token immediately", async (t) => {
  await t.test("disabled account", async () => {
    const fixture = await createFixture();
    const login = await fixture.service.login({ username: "member", password: "member-password-2026" });
    fixture.user.status = "disabled";
    assert.equal(await fixture.service.authenticateToken(login.token), null);
  });

  await t.test("version-changed account", async () => {
    const fixture = await createFixture();
    const login = await fixture.service.login({ username: "member", password: "member-password-2026" });
    fixture.user.tokenVersion += 1;
    assert.equal(await fixture.service.authenticateToken(login.token), null);
  });
});

test("project list follows the database access rules", async (t) => {
  await t.test("member sees only membership projects", async () => {
    const { service } = await createFixture();
    const items = await service.projectsFor({
      id: "member-1",
      sub: "member-1",
      name: "项目成员",
      role: "member",
      tokenVersion: 3,
      projectIds: ["jinshan"],
    });
    assert.deepEqual(items.map((project) => project.id), ["jinshan"]);
  });

  await t.test("platform administrator sees every project", async () => {
    const { service } = await createFixture("platform_admin");
    const items = await service.projectsFor({
      id: "platform-admin",
      sub: "platform-admin",
      name: "项目管理员",
      role: "platform_admin",
      tokenVersion: 3,
      projectIds: [],
    });
    assert.deepEqual(items.map((project) => project.id), ["quyang", "jinshan"]);
  });
});
