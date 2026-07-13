import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password-hash.js";

test("stores a salted scrypt hash and never the plain password", async () => {
  const encoded = await hashPassword("member-password-2026");
  assert.match(encoded, /^scrypt\$/);
  assert.doesNotMatch(encoded, /member-password-2026/);
  assert.equal(await verifyPassword("member-password-2026", encoded), true);
  assert.equal(await verifyPassword("wrong", encoded), false);
});
