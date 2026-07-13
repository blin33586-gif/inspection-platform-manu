import assert from "node:assert/strict";
import test from "node:test";
import { seedLegacyAccounts } from "./seed-accounts.js";

function createDatabase() {
  const accounts: Array<Record<string, unknown>> = [];
  const memberships: Array<{ id: string; userId: string; projectId: string }> = [];
  return {
    accounts,
    memberships,
    userAccount: {
      findFirst: async ({ where }: { where: { role?: string; OR?: Array<{ id?: string; username?: string; role?: string }> } }) =>
        accounts.find((account) => account.role === where.role || where.OR?.some((item) => (
          item.id === account.id || item.username === account.username || item.role === account.role
        ))) ?? null,
      create: async ({ data }: { data: Record<string, unknown> & { memberships?: { create: Array<{ id: string; projectId: string }> } } }) => {
        const { memberships: nested, ...account } = data;
        accounts.push(account);
        for (const membership of nested?.create ?? []) {
          memberships.push({ ...membership, userId: String(account.id) });
        }
        return account;
      },
    },
  };
}

test("seeding an existing legacy member never restores a revoked project membership", async () => {
  const database = createDatabase();
  const env = {
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "admin-password-2026",
    MEMBER_USERNAME: "member",
    MEMBER_PASSWORD: "member-password-2026",
  };

  await seedLegacyAccounts(database as never, env);
  assert.deepEqual(database.memberships.map((membership) => membership.projectId).sort(), ["jinshan", "quyang"]);

  database.memberships.splice(database.memberships.findIndex((membership) => membership.projectId === "jinshan"), 1);
  await seedLegacyAccounts(database as never, env);

  assert.deepEqual(database.memberships.map((membership) => membership.projectId), ["quyang"]);
  assert.equal(database.accounts.length, 2);
});

test("seed CLI without an explicit development environment refuses public default credentials on a fresh database", async () => {
  const database = createDatabase();
  await assert.rejects(
    () => seedLegacyAccounts(database as never, {
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "admin-password-2026",
    }),
    /MEMBER_USERNAME and MEMBER_PASSWORD/,
  );
  assert.equal(database.accounts.length, 0, "credential validation must finish before bootstrap writes");
});

test("only explicit development and test environments may use legacy development defaults", async () => {
  for (const NODE_ENV of ["development", "test"]) {
    const database = createDatabase();
    await seedLegacyAccounts(database as never, { NODE_ENV });
    assert.deepEqual(database.accounts.map((account) => account.username), ["admin", "member"]);
  }
});
