import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("migrates legacy map states into the canonical lifecycle", async () => {
  const migration = await readFile(
    new URL("./migrations/20260714003000_map_status_contract/migration.sql", import.meta.url),
    "utf8",
  );
  const seed = await readFile(new URL("./seed.ts", import.meta.url), "utf8");

  const pendingTiffUpdate = migration.indexOf('WITH "pendingTiffJobs"');
  const terminalNormalization = migration.indexOf('SET "processStatus" = \'published\'');

  assert.notEqual(pendingTiffUpdate, -1, "migration must restore pending TIFF states before terminal normalization");
  assert.notEqual(terminalNormalization, -1, "migration must retain legacy terminal normalization");
  assert.ok(pendingTiffUpdate < terminalNormalization, "pending TIFF assets must leave uploaded before uploaded becomes published");
  assert.match(migration, /"jobType"\s*=\s*'tiff_tile'/);
  assert.match(migration, /"status"\s+IN\s+\('queued',\s*'running'\)/);
  assert.match(migration, /substring\(job\."inputJson"\s+FROM\s+'"mapAssetId"/);
  assert.doesNotMatch(migration, /"inputJson"::jsonb/, "malformed legacy payloads must not abort the migration");
  assert.match(migration, /asset\."projectId"\s*=\s*pending\."projectId"/);
  assert.match(migration, /asset\."id"\s*=\s*pending\."mapAssetId"/);
  assert.match(migration, /SET\s+"processStatus"\s*=\s*pending\."status"/);
  assert.match(migration, /SET\s+"processStatus"\s*=\s*'published'/);
  const terminalSet = migration.indexOf('SET "processStatus" = \'published\'');
  const terminalStart = migration.lastIndexOf('UPDATE "MapAsset"', terminalSet);
  const terminalEnd = migration.indexOf(";", terminalSet);
  const terminalStatement = migration.slice(terminalStart, terminalEnd);
  assert.match(terminalStatement, /"processStatus"\s+IN\s+\('processed',\s*'ready'\)/);
  assert.match(terminalStatement, /"processStatus"\s*=\s*'uploaded'\s+AND\s+NOT EXISTS/s);
  assert.match(terminalStatement, /pending\."projectId"\s*=\s*asset\."projectId"/);
  assert.match(terminalStatement, /substring\(pending\."inputJson"\s+FROM\s+'"mapAssetId"[\s\S]+?=\s*asset\."id"/);
  assert.doesNotMatch(seed, /processStatus:\s*"(?:processed|uploaded|ready)"/);
});

test("uses non-throwing payload extraction so malformed job JSON cannot block status migration", async () => {
  const migration = await readFile(
    new URL("./migrations/20260714003000_map_status_contract/migration.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /substring\([^)]*"inputJson"\s+FROM\s+'"mapAssetId"\[\[:space:\]\]\*:\[\[:space:\]\]\*"\(\[A-Za-z0-9\._-\]\+\)"'\)/);
  assert.equal((migration.match(/"inputJson"\s+IS\s+JSON\s+OBJECT/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /::jsonb|jsonb_extract|json_extract/);
});
