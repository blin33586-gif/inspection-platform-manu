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

test("seed mirrors the bootstrapped accounts and member projects", async () => {
  const seed = await readFile(new URL("./seed.ts", import.meta.url), "utf8");
  assert.match(seed, /hashPassword/);
  assert.match(seed, /id:\s*"platform-admin"/);
  assert.match(seed, /id:\s*"legacy-member"/);
  assert.match(seed, /id:\s*"legacy-member-quyang"/);
  assert.match(seed, /id:\s*"legacy-member-jinshan"/);
});
