import assert from "node:assert/strict";
import test from "node:test";
import { createShareToken, hashShareToken } from "./issue-share-token.js";

test("creates an opaque token whose stored hash can be reproduced", () => {
  const created = createShareToken();

  assert.match(created.token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(created.hash, created.token);
  assert.equal(hashShareToken(created.token), created.hash);
});
