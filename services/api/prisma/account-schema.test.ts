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

test("keeps role as a Prisma String and constrains its PostgreSQL values", async () => {
  const schema = await readFile(new URL("./schema.prisma", import.meta.url), "utf8");
  const migration = await readFile(
    new URL("./migrations/20260713210000_platform_accounts/migration.sql", import.meta.url),
    "utf8",
  );

  assert.match(schema, /role\s+String/);
  assert.doesNotMatch(schema, /enum\s+(?:UserAccount)?Role\b/);
  assert.match(
    migration,
    /CONSTRAINT "UserAccount_role_check" CHECK \("role" IN \('platform_admin', 'member'\)\)/,
  );
});

test("seed mirrors the bootstrapped accounts and member projects", async () => {
  const seed = await readFile(new URL("./seed.ts", import.meta.url), "utf8");
  const accountSeed = await readFile(new URL("./seed-accounts.ts", import.meta.url), "utf8");
  assert.match(seed, /seedLegacyAccounts\(prisma, process\.env\)/);
  assert.match(accountSeed, /hashPassword/);
  assert.match(accountSeed, /id:\s*"platform-admin"/);
  assert.match(accountSeed, /id:\s*"legacy-member"/);
  assert.match(accountSeed, /id:\s*"legacy-member-quyang"/);
  assert.match(accountSeed, /id:\s*"legacy-member-jinshan"/);
});
