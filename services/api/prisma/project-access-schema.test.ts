import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const schema = readFileSync(resolve(import.meta.dirname, "schema.prisma"), "utf8");

test("defines projects and project ownership for every top-level business record", () => {
  assert.match(schema, /model Project \{/);
  for (const model of [
    "DashboardMetric",
    "IssueCategoryStat",
    "ManagedObject",
    "Issue",
    "InspectionReport",
    "MapAsset",
    "MediaProcessingJob",
    "MediaAsset",
    "InspectionTask",
    "AuditLog",
  ]) {
    const block = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
    assert.match(block, /projectId\s+String/, `${model} must own a projectId`);
    assert.match(block, /@@index\(\[projectId/, `${model} must index projectId`);
  }
});

test("stores project-specific archive dimensions", () => {
  const project = schema.match(/model Project \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(project, /archiveDimensions\s+Json/);
  assert.match(project, /customerType\s+String/);
});
