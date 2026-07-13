import assert from "node:assert/strict";
import test from "node:test";
import { PlatformMembersService } from "./platform-members.service.js";

const projects = {
  jinshan: { id: "jinshan", name: "金山项目" },
  quyang: { id: "quyang", name: "曲阳项目" },
};

function memberAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "member-1",
    name: "张三",
    phone: "13800138000",
    username: "zhangsan",
    passwordHash: "must-not-leak",
    role: "member",
    status: "active",
    tokenVersion: 1,
    createdAt: new Date("2026-07-13T08:00:00.000Z"),
    memberships: [
      { projectId: "jinshan", project: projects.jinshan },
    ],
    ...overrides,
  };
}

function createFixture(options: {
  duplicateUsername?: boolean;
  account?: ReturnType<typeof memberAccount>;
  availableProjectIds?: string[];
} = {}) {
  const fixture: {
    updatedAccount?: Record<string, unknown>;
    audit?: Record<string, unknown>;
    createdAccount?: Record<string, unknown>;
  } = {};
  const account = options.account ?? memberAccount();
  const availableProjectIds = options.availableProjectIds ?? Object.keys(projects);

  const transaction = {
    project: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in
          .filter((id) => availableProjectIds.includes(id))
          .map((id) => projects[id as keyof typeof projects]),
    },
    userAccount: {
      findFirst: async () => ({ id: "platform-admin" }),
      findUnique: async ({ where }: { where: { id?: string; username?: string } }) => {
        if (where.username) return options.duplicateUsername ? account : null;
        if (where.id === "platform-admin") {
          return memberAccount({ id: "platform-admin", role: "platform_admin" });
        }
        return where.id === account.id ? account : null;
      },
      create: async ({ data }: { data: Record<string, any> }) => {
        const created = memberAccount({
          ...data,
          createdAt: new Date("2026-07-13T08:00:00.000Z"),
          memberships: data.memberships.create.map((membership: { projectId: string }) => ({
            projectId: membership.projectId,
            project: projects[membership.projectId as keyof typeof projects],
          })),
        });
        fixture.createdAccount = data;
        return created;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        fixture.updatedAccount = data;
        return memberAccount({
          ...account,
          ...data,
          tokenVersion: account.tokenVersion + ("tokenVersion" in data ? 1 : 0),
        });
      },
    },
    projectMembership: {
      deleteMany: async () => ({ count: 1 }),
      createMany: async () => ({ count: 1 }),
    },
    platformAuditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        fixture.audit = data;
        return data;
      },
    },
  };

  const database = {
    userAccount: {
      findMany: async () => [account],
    },
    $transaction: async (callback: (client: typeof transaction) => unknown) => callback(transaction),
  };

  return {
    fixture,
    service: new PlatformMembersService(database as never),
  };
}

const validCreateInput = {
  name: "张三",
  phone: "13800138000",
  username: "zhangsan",
  password: "member-password-2026",
  projectIds: ["jinshan"],
};

test("creates a member with at least one project and no password in the response", async () => {
  const { service, fixture } = createFixture();

  const member = await service.create(validCreateInput, "platform-admin");

  assert.deepEqual(member.projectIds, ["jinshan"]);
  assert.equal("password" in member, false);
  assert.equal("passwordHash" in member, false);
  assert.equal("password" in (fixture.audit ?? {}), false);
  assert.equal("passwordHash" in (fixture.audit ?? {}), false);
  assert.doesNotMatch(JSON.stringify(fixture.audit), /member-password-2026|must-not-leak/);
});

test("lists only safe member fields", async () => {
  const { service } = createFixture();

  const [member] = await service.list();

  assert.deepEqual(member.projectNames, ["金山项目"]);
  assert.equal("passwordHash" in member, false);
  assert.equal("tokenVersion" in member, false);
  assert.equal("role" in member, false);
});

test("rejects duplicate usernames", async () => {
  const { service } = createFixture({ duplicateUsername: true });
  await assert.rejects(() => service.create(validCreateInput), /用户名已存在/);
});

test("rejects invalid phone numbers", async () => {
  const { service } = createFixture();
  await assert.rejects(() => service.create({ ...validCreateInput, phone: "123" }), /手机号/);
  await assert.rejects(() => service.update("member-1", { phone: "123" }), /手机号/);
});

test("rejects passwords shorter than 8 characters", async () => {
  const { service } = createFixture();
  await assert.rejects(
    () => service.create({ ...validCreateInput, password: "short" }),
    /密码.*8/,
  );
  await assert.rejects(() => service.resetPassword("member-1", { password: "short" }), /密码.*8/);
});

test("rejects empty project arrays", async () => {
  const { service } = createFixture();
  await assert.rejects(() => service.create({ ...validCreateInput, projectIds: [] }), /至少.*项目/);
  await assert.rejects(() => service.update("member-1", { projectIds: [] }), /至少.*项目/);
});

test("rejects unknown projects", async () => {
  const { service } = createFixture({ availableProjectIds: ["jinshan"] });
  await assert.rejects(
    () => service.create({ ...validCreateInput, projectIds: ["missing"] }),
    /项目不存在/,
  );
  await assert.rejects(() => service.update("member-1", { projectIds: ["missing"] }), /项目不存在/);
});

test("rejects attempts to edit or reset the platform administrator", async () => {
  const { service } = createFixture();
  await assert.rejects(() => service.update("platform-admin", { name: "新名称" }), /平台管理员不可编辑/);
  await assert.rejects(
    () => service.resetPassword("platform-admin", { password: "new-password" }),
    /平台管理员不可编辑/,
  );
});

test("changing projects increments tokenVersion and records platform audit", async () => {
  const { service, fixture } = createFixture();

  const member = await service.update("member-1", { projectIds: ["quyang"] }, "platform-admin");

  assert.deepEqual(fixture.updatedAccount?.tokenVersion, { increment: 1 });
  assert.equal(fixture.audit?.action, "member.projects.update");
  assert.deepEqual(member.projectIds, ["quyang"]);
});

test("changing status increments tokenVersion and records platform audit", async () => {
  const { service, fixture } = createFixture();

  await service.update("member-1", { status: "disabled" }, "platform-admin");

  assert.deepEqual(fixture.updatedAccount?.tokenVersion, { increment: 1 });
  assert.equal(fixture.audit?.action, "member.status.update");
});

test("resetting a password increments tokenVersion and never writes the password to audit", async () => {
  const { service, fixture } = createFixture();

  const member = await service.resetPassword(
    "member-1",
    { password: "new-member-password" },
    "platform-admin",
  );

  assert.deepEqual(fixture.updatedAccount?.tokenVersion, { increment: 1 });
  assert.equal(fixture.audit?.action, "member.password.reset");
  assert.doesNotMatch(JSON.stringify(fixture.audit), /new-member-password|must-not-leak/);
  assert.equal("passwordHash" in member, false);
});
