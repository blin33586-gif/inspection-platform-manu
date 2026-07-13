import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production compose passes explicit legacy member credentials to the API", async () => {
  const compose = await readFile(new URL("../../../../docker-compose.yml", import.meta.url), "utf8");

  assert.match(compose, /MEMBER_USERNAME:\s*\$\{MEMBER_USERNAME\}/);
  assert.match(compose, /MEMBER_PASSWORD:\s*\$\{MEMBER_PASSWORD\}/);
});
