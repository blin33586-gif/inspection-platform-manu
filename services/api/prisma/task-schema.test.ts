import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

test("defines the real inspection task and task photo schema", async () => {
  const schemaPath = fileURLToPath(new URL("./schema.prisma", import.meta.url));
  const schema = await readFile(schemaPath, "utf8");

  assert.match(schema, /model InspectionTask/);
  assert.match(schema, /sourceType\s+String/);
  assert.match(schema, /inputType\s+String/);
  assert.match(schema, /model TaskPhoto/);
  assert.match(schema, /distributionStatus\s+String/);
  assert.match(schema, /archiveObjectId\s+String\?/);
  assert.match(schema, /taskId\s+String\?\s+@unique/);
  assert.match(schema, /@@index\(\[distributionStatus, capturedAt\(sort: Desc\), videoTimestampMs, createdAt\(sort: Desc\), id\], map: "task_photo_pending_feed_idx"\)/);
  assert.match(schema, /@@index\(\[taskId, videoTimestampMs, createdAt, id\], map: "task_photo_task_order_idx"\)/);
  assert.match(schema, /annotationDocument\s+PhotoAnnotationDocument\?/);
  assert.match(schema, /model PhotoAnnotationDocument\s*\{/);
  assert.match(schema, /taskPhotoId\s+String\s+@unique/);
  assert.match(schema, /currentVersion\s+Int\s+@default\(1\)/);
  assert.match(schema, /versions\s+PhotoAnnotationVersion\[\]/);
  assert.match(schema, /model PhotoAnnotationVersion\s*\{/);
  assert.match(schema, /@@unique\(\[documentId, version\]\)/);
});
