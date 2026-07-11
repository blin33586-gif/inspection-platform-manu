import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("defines unique report photo links", async () => {
  const schema = await readFile(new URL("./schema.prisma", import.meta.url), "utf8");

  assert.match(schema, /model ReportPhoto\s*\{/);
  assert.match(schema, /@@unique\(\[reportId, taskPhotoId\]\)/);
  assert.match(schema, /photos\s+ReportPhoto\[\]/);
  assert.match(schema, /reportPhotos\s+ReportPhoto\[\]/);
});
