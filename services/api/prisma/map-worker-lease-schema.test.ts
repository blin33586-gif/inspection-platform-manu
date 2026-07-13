import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("schema persists the global map worker lease and per-attempt job heartbeat", async () => {
  const schema = await readFile(new URL("./schema.prisma", import.meta.url), "utf8");

  assert.match(schema, /model MapWorkerLease\s*\{/);
  for (const field of ["leaseOwner", "attemptId", "leaseExpiresAt", "heartbeatAt"]) {
    assert.match(schema, new RegExp(`${field}\\s+String\\?|${field}\\s+DateTime\\?`));
  }
});

test("migration normalizes duplicate active maps before creating a partial unique index", async () => {
  const migration = await readFile(
    new URL("./migrations/20260714020000_map_worker_leases/migration.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /ROW_NUMBER\(\) OVER\s*\(\s*PARTITION BY "projectId"/i);
  assert.match(migration, /UPDATE "MapAsset"[\s\S]*SET "isActive" = false/i);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "MapAsset_one_active_per_project"[\s\S]*WHERE "isActive" = true/i,
  );
  assert.ok(
    migration.indexOf('SET "isActive" = false') < migration.indexOf('CREATE UNIQUE INDEX "MapAsset_one_active_per_project"'),
  );
});

test("lease migration requeues legacy running map jobs and their running assets", async () => {
  const migration = await readFile(
    new URL("./migrations/20260714020000_map_worker_leases/migration.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /UPDATE "MediaProcessingJob"[\s\S]*"status" = 'queued'[\s\S]*"leaseOwner" = NULL[\s\S]*"attemptId" = NULL[\s\S]*"heartbeatAt" = NULL[\s\S]*"jobType" IN \('tiff_tile', 'map_tile_package'\)[\s\S]*"status" = 'running'/i);
  assert.match(migration, /UPDATE "MapAsset"[\s\S]*"processStatus" = 'queued'[\s\S]*"processStatus" = 'running'/i);
});
