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
      findFirst: async ({ where }: { where: { role: string } }) =>
        accounts.find((account) => account.role === where.role) ?? null,
      findUnique: async ({ where }: { where: { username: string } }) =>
        accounts.find((account) => account.username === where.username) ?? null,
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
  process.env.MEMBER_PASSWORD = "configured-member-password";

  try {
    const database = createDatabase();
    const service = new AccountBootstrapService(database as never);

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
    assert.equal(await verifyPassword("configured-member-password", member?.passwordHash ?? ""), true);
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

  await new AccountBootstrapService(database as never).onModuleInit();

  assert.deepEqual(database.accounts, accounts);
  assert.equal(database.memberships.length, 0);
});
