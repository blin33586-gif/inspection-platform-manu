import assert from "node:assert/strict";
import test from "node:test";
import { ManagedObjectArchiveService } from "./managed-object-archive.service.js";

test("builds an archive overview from issues linked to one managed object", async () => {
  const service = new ManagedObjectArchiveService({
    managedObject: {
      findUnique: async () => ({ id: "road-1", reportCount: 8 }),
    },
    issue: {
      findMany: async () => [
        {
          id: "issue-open",
          title: "广告牌破损",
          category: "广告牌",
          status: "pending",
          severity: "high",
          foundAt: new Date("2026-07-12T08:00:00.000Z"),
          updatedAt: new Date("2026-07-12T09:00:00.000Z"),
          sourceTaskPhoto: { task: { sourceType: "drone" } },
        },
        {
          id: "issue-done",
          title: "非机动车乱停放",
          category: "街面秩序",
          status: "verified",
          severity: "normal",
          foundAt: new Date("2026-07-11T08:00:00.000Z"),
          updatedAt: new Date("2026-07-13T10:00:00.000Z"),
          sourceTaskPhoto: { task: { sourceType: "manual" } },
        },
      ],
    },
    inspectionReport: {
      count: async () => 2,
    },
  } as never);

  const overview = await service.overview("road-1");

  assert.equal(overview.totalIssues, 2);
  assert.equal(overview.openIssues, 1);
  assert.equal(overview.completedIssues, 1);
  assert.equal(overview.reportCount, 2);
  assert.equal(overview.latestInspectionAt, "2026-07-12T08:00:00.000Z");
  assert.equal(overview.latestInspectionSource, "无人机");
  assert.deepEqual(overview.issues.map((issue) => issue.stateLabel), ["未闭环", "已完成"]);
});

test("returns an empty real-data overview when the archive has no issues", async () => {
  const service = new ManagedObjectArchiveService({
    managedObject: { findUnique: async () => ({ id: "road-2", reportCount: 0 }) },
    issue: { findMany: async () => [] },
    inspectionReport: { count: async () => 0 },
  } as never);

  const overview = await service.overview("road-2");

  assert.equal(overview.totalIssues, 0);
  assert.equal(overview.latestInspectionAt, null);
  assert.deepEqual(overview.issues, []);
});
