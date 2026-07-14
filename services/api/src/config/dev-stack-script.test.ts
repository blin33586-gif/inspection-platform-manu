import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("stable development startup regenerates Prisma before deploying migrations", async () => {
  const script = await readFile(new URL("../../../../scripts/dev-stack.sh", import.meta.url), "utf8");
  const generateAt = script.indexOf('DATABASE_URL="$DATABASE_URL" corepack pnpm db:generate');
  const deployAt = script.indexOf('DATABASE_URL="$DATABASE_URL" corepack pnpm db:deploy');

  assert.ok(generateAt >= 0, "missing Prisma client generation");
  assert.ok(deployAt > generateAt, "Prisma generation must run before migration deployment");
});
