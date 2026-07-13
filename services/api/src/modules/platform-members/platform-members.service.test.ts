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
  createError?: unknown;
} = {}) {
  const fixture: {
    updatedAccount?: Record<string, unknown>;
    audit?: Record<string, unknown>;
    createdAccount?: Record<string, unknown>;
    updateCalls: number;
    membershipDeleteCalls: number;
    membershipCreateCalls: number;
    auditCalls: number;
  } = {
    updateCalls: 0,
    membershipDeleteCalls: 0,
    membershipCreateCalls: 0,
    auditCalls: 0,
  };
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
        if (options.createError) throw options.createError;
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
        fixture.updateCalls += 1;
        fixture.updatedAccount = data;
        return memberAccount({
          ...account,
          ...data,
          tokenVersion: account.tokenVersion + ("tokenVersion" in data ? 1 : 0),
        });
      },
    },
    projectMembership: {
      deleteMany: async () => {
        fixture.membershipDeleteCalls += 1;
        return { count: 1 };
      },
      createMany: async () => {
        fixture.membershipCreateCalls += 1;
        return { count: 1 };
      },
    },
    platformAuditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        fixture.auditCalls += 1;
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

test("maps a concurrent username unique constraint violation to a conflict", async () => {
  const { service } = createFixture({
    createError: { code: "P2002", meta: { target: ["username"] } },
  });

  await assert.rejects(
    () => service.create(validCreateInput),
    (error: any) => error?.getStatus?.() === 409 && error.message === "用户名已存在",
  );
});

test("does not misreport unrelated database failures as username conflicts", async () => {
  const databaseError = { code: "P2002", meta: { target: ["phone"] } };
  const { service } = createFixture({ createError: databaseError });

  await assert.rejects(
    () => service.create(validCreateInput),
    (error) => error === databaseError,
  );
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

test("rejects project IDs that are not non-empty strings", async () => {
  const { service } = createFixture();

  for (const projectIds of [["jinshan", 42], ["jinshan", {}], ["jinshan", "  "]]) {
    await assert.rejects(
      () => service.create({ ...validCreateInput, projectIds } as never),
      (error: any) => error?.getStatus?.() === 400 && /项目 ID.*非空字符串/.test(error.message),
    );
  }
});

test("rejects duplicate project IDs instead of silently deduplicating them", async () => {
  const { service } = createFixture();

  await assert.rejects(
    () => service.update("member-1", { projectIds: ["jinshan", "jinshan"] }),
    (error: any) => error?.getStatus?.() === 400 && /项目 ID.*重复/.test(error.message),
  );
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

test("does not rebuild memberships or invalidate sessions for the same project set", async () => {
  const account = memberAccount({
    memberships: [
      { projectId: "jinshan", project: projects.jinshan },
      { projectId: "quyang", project: projects.quyang },
    ],
  });
  const { service, fixture } = createFixture({ account });

  const member = await service.update(
    "member-1",
    { projectIds: ["quyang", "jinshan"] },
    "platform-admin",
  );

  assert.deepEqual(member.projectIds, ["jinshan", "quyang"]);
  assert.equal(fixture.membershipDeleteCalls, 0);
  assert.equal(fixture.membershipCreateCalls, 0);
  assert.equal(fixture.updateCalls, 0);
  assert.equal(fixture.auditCalls, 0);
});

test("does not invalidate sessions or audit when status is unchanged", async () => {
  const { service, fixture } = createFixture();

  await service.update("member-1", { status: "active" }, "platform-admin");

  assert.equal(fixture.updateCalls, 0);
  assert.equal(fixture.auditCalls, 0);
});

test("audits only the real profile change when status and projects are unchanged", async () => {
  const { service, fixture } = createFixture();

  await service.update(
    "member-1",
    { name: "李四", status: "active", projectIds: ["jinshan"] },
    "platform-admin",
  );

  assert.equal(fixture.membershipDeleteCalls, 0);
  assert.equal(fixture.membershipCreateCalls, 0);
  assert.equal(fixture.audit?.action, "member.profile.update");
  assert.equal("tokenVersion" in (fixture.updatedAccount ?? {}), false);
  assert.doesNotMatch(String(fixture.audit?.summary), /状态|项目/);
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

test("rejects non-string create fields with a bad request", async () => {
  for (const [field, value] of [
    ["name", 42],
    ["phone", {}],
    ["username", 42],
    ["password", {}],
  ] as const) {
    const { service } = createFixture();
    await assert.rejects(
      () => service.create({ ...validCreateInput, [field]: value } as never),
      (error: any) => error?.getStatus?.() === 400,
    );
  }
});

test("rejects non-string update fields with a bad request", async () => {
  for (const input of [
    { name: 42 },
    { phone: {} },
    { status: 42 },
    { status: {} },
    { projectIds: {} },
  ]) {
    const { service } = createFixture();
    await assert.rejects(
      () => service.update("member-1", input as never),
      (error: any) => error?.getStatus?.() === 400,
    );
  }
});

test("rejects a non-string reset password with a bad request before hashing", async () => {
  const { service } = createFixture();

  await assert.rejects(
    () => service.resetPassword("member-1", { password: {} } as never),
    (error: any) => error?.getStatus?.() === 400,
  );
});
