import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("defines structured rectification records", async () => {
  const schema = await readFile(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /model IssueRectificationRecord/);
  assert.match(schema, /rectificationRecordId\s+String\?/);
  assert.match(schema, /rectificationRecords\s+IssueRectificationRecord\[\]/);
});
