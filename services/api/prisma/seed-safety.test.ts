import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("seed never deletes existing business records", async () => {
  const seed = await readFile(new URL("./seed.ts", import.meta.url), "utf8");

  assert.doesNotMatch(seed, /\.deleteMany\s*\(/);
});

test("seed inserts fixture collections idempotently", async () => {
  const seed = await readFile(new URL("./seed.ts", import.meta.url), "utf8");
  const createManyCalls = seed.match(/\.createMany\s*\(/g) ?? [];
  const skipDuplicateOptions = seed.match(/skipDuplicates:\s*true/g) ?? [];

  assert.ok(createManyCalls.length > 0);
  assert.equal(skipDuplicateOptions.length, createManyCalls.length);
});

test("seed does not reset existing account profiles or credentials", async () => {
  const seed = await readFile(new URL("./seed.ts", import.meta.url), "utf8");

  assert.doesNotMatch(seed, /update:\s*(?:administratorData|memberData)/);
});
