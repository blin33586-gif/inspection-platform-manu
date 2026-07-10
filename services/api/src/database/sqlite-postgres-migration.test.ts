import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLegacySqliteRow } from "./sqlite-postgres-migration.js";

test("normalizes SQLite timestamp and boolean values for PostgreSQL import", () => {
  const normalized = normalizeLegacySqliteRow({
    id: "map-street-main",
    createdAt: "2026-07-10T19:08:35.465+00:00",
    isActive: 1,
  });

  assert.ok(normalized.createdAt instanceof Date);
  assert.equal(normalized.createdAt.toISOString(), "2026-07-10T19:08:35.465Z");
  assert.equal(normalized.isActive, true);
});
