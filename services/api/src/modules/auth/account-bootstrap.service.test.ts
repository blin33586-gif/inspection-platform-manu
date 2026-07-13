import assert from "node:assert/strict";
import test from "node:test";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AuthModule } from "./auth.module.js";
import { AccountBootstrapService } from "./account-bootstrap.service.js";
import { verifyPassword } from "./password-hash.js";

@Module({ imports: [AuthModule] })
class MissingDatabaseTestModule {}

interface StoredAccount {
  id: string;
  username: string;
  passwordHash: string;
  name: string;
  phone: string;
  role: string;
  status?: string;
}

interface StoredMembership {
  id: string;
  userId: string;
  projectId: string;
}

function createDatabase(accounts: StoredAccount[] = [], memberships: StoredMembership[] = []) {
  return {
    accounts,
    memberships,
    userAccount: {
      findFirst: async ({ where }: { where: { role?: string; OR?: Array<{ id?: string; username?: string; role?: string }> } }) =>
        accounts.find((account) => (
          (where.role !== undefined && account.role === where.role)
          || where.OR?.some((candidate) => (
            candidate.id === account.id || candidate.username === account.username || candidate.role === account.role
          ))
        )) ?? null,
      create: async ({ data }: {
        data: StoredAccount & {
          memberships?: { create: Array<{ id: string; projectId: string }> };
        };
      }) => {
        const { memberships: nestedMemberships, ...account } = data;
        accounts.push(account);
        for (const membership of nestedMemberships?.create ?? []) {
          memberships.push({ ...membership, userId: account.id });
        }
        return account;
      },
    },
  };
}

test("fails module assembly when the database provider is missing", async () => {
  await assert.rejects(
    async () => {
      const app = await NestFactory.createApplicationContext(MissingDatabaseTestModule, {
        logger: false,
        abortOnError: false,
      });
      await app.close();
    },
    /Nest can't resolve dependencies of the AccountBootstrapService/,
  );
});

test("creates configured legacy accounts once and assigns the member to both projects", async () => {
  const original = {
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    MEMBER_USERNAME: process.env.MEMBER_USERNAME,
    MEMBER_PASSWORD: process.env.MEMBER_PASSWORD,
  };
  process.env.ADMIN_USERNAME = "configured-admin";
  process.env.ADMIN_PASSWORD = "configured-admin-password";
  process.env.MEMBER_USERNAME = "configured-member";
  process.env.MEMBER_PASSWORD = "configured-member-password-2026";

  try {
    const database = createDatabase();
    const service = new AccountBootstrapService(database as never, {
      ADMIN_USERNAME: "configured-admin",
      ADMIN_PASSWORD: "configured-admin-password",
      MEMBER_USERNAME: "configured-member",
      MEMBER_PASSWORD: "configured-member-password-2026",
    });

    await service.onModuleInit();
    await service.onModuleInit();

    assert.equal(database.accounts.length, 2);
    const administrator = database.accounts.find((account) => account.role === "platform_admin");
    const member = database.accounts.find((account) => account.role === "member");
    assert.equal(administrator?.username, "configured-admin");
    assert.equal(administrator?.name, "项目管理员");
    assert.equal(administrator?.phone, "");
    assert.equal(member?.username, "configured-member");
    assert.equal(member?.name, "项目成员");
    assert.equal(member?.phone, "");
    assert.equal(await verifyPassword("configured-admin-password", administrator?.passwordHash ?? ""), true);
    assert.equal(await verifyPassword("configured-member-password-2026", member?.passwordHash ?? ""), true);
    assert.deepEqual(
      database.memberships.map(({ projectId }) => projectId).sort(),
      ["jinshan", "quyang"],
    );
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("does not replace an existing administrator or alter an existing legacy member", async () => {
  const accounts: StoredAccount[] = [
    { id: "existing-admin", username: "owner", passwordHash: "existing", name: "Owner", phone: "", role: "platform_admin" },
    { id: "existing-member", username: "member", passwordHash: "existing", name: "Member", phone: "", role: "member" },
  ];
  const database = createDatabase(accounts);

  await new AccountBootstrapService(database as never, {
    NODE_ENV: "production",
    ADMIN_USERNAME: "new-owner",
    ADMIN_PASSWORD: "new-owner-password-2026",
    AUTH_SECRET: "production-secret",
  }).onModuleInit();

  assert.deepEqual(database.accounts, accounts);
  assert.equal(database.memberships.length, 0);
});

test("production refuses to create a project-wide legacy member without explicit strong credentials", async () => {
  const accounts: StoredAccount[] = [
    { id: "existing-admin", username: "owner", passwordHash: "existing", name: "Owner", phone: "", role: "platform_admin" },
  ];
  const database = createDatabase(accounts);

  await assert.rejects(
    () => new AccountBootstrapService(database as never, {
      NODE_ENV: "production",
      ADMIN_USERNAME: "owner",
      ADMIN_PASSWORD: "owner-password-2026",
      AUTH_SECRET: "production-secret",
    }).onModuleInit(),
    /MEMBER_USERNAME and MEMBER_PASSWORD/,
  );
  assert.equal(database.accounts.length, 1);
  assert.equal(database.memberships.length, 0);
});

test("API bootstrap without NODE_ENV uses safe-mode credentials on a fresh database", async () => {
  const database = createDatabase();

  await assert.rejects(
    () => new AccountBootstrapService(database as never, {}).onModuleInit(),
    /ADMIN_USERNAME and ADMIN_PASSWORD/,
  );
  assert.equal(database.accounts.length, 0);
  assert.equal(database.memberships.length, 0);
});

test("production does not require member credentials when the persisted legacy member already exists", async () => {
  const accounts: StoredAccount[] = [
    { id: "existing-admin", username: "owner", passwordHash: "admin-existing", name: "Owner", phone: "", role: "platform_admin" },
    { id: "legacy-member", username: "renamed-member", passwordHash: "member-existing", name: "Member", phone: "", role: "member" },
  ];
  const database = createDatabase(accounts);

  await new AccountBootstrapService(database as never, {
    NODE_ENV: "production",
    ADMIN_USERNAME: "owner",
    ADMIN_PASSWORD: "owner-password-2026",
    AUTH_SECRET: "production-secret",
  }).onModuleInit();

  assert.equal(database.accounts.length, 2);
  assert.equal(database.accounts[1].passwordHash, "member-existing");
  assert.equal(database.memberships.length, 0);
});
