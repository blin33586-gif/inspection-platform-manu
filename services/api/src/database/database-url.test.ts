import assert from "node:assert/strict";
import test from "node:test";
import { resolveDatabaseUrl } from "./database-url.js";

test("accepts a PostgreSQL connection URL", () => {
  assert.equal(
    resolveDatabaseUrl({ DATABASE_URL: "postgresql://xunjianbao:password@127.0.0.1:5432/xunjianbao?schema=public" }),
    "postgresql://xunjianbao:password@127.0.0.1:5432/xunjianbao?schema=public",
  );
});

test("rejects the legacy SQLite connection URL", () => {
  assert.throws(
    () => resolveDatabaseUrl({ DATABASE_URL: "file:./dev.db" }),
    /DATABASE_URL must be a PostgreSQL connection URL/,
  );
});

test("requires an explicit database URL in production", () => {
  assert.throws(
    () => resolveDatabaseUrl({ NODE_ENV: "production" }),
    /DATABASE_URL must be configured in production/,
  );
});
