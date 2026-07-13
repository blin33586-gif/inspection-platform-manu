import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("migrates legacy map states into the canonical lifecycle", async () => {
  const migration = await readFile(
    new URL("./migrations/20260714003000_map_status_contract/migration.sql", import.meta.url),
    "utf8",
  );
  const seed = await readFile(new URL("./seed.ts", import.meta.url), "utf8");

  assert.match(migration, /processStatus"\s+IN\s+\('processed',\s*'uploaded',\s*'ready'\)/);
  assert.match(migration, /SET\s+"processStatus"\s*=\s*'published'/);
  assert.doesNotMatch(seed, /processStatus:\s*"(?:processed|uploaded|ready)"/);
});
