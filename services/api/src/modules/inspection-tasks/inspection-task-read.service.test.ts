import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInspectionTaskWhere,
  InspectionTaskReadService,
} from "./inspection-task-read.service.js";

test("builds real keyword, source, status, and upload-date filters", () => {
  assert.deepEqual(buildInspectionTaskWhere({
    keyword: "曲阳",
    sourceType: "drone",
    processStatus: "ready_for_distribution",
    uploadStart: "2026-07-01",
    uploadEnd: "2026-07-11",
  }), {
    AND: [
      { OR: [{ name: { contains: "曲阳" } }, { sourceMedia: { originalFileName: { contains: "曲阳" } } }] },
      { sourceType: "drone" },
      { processStatus: "ready_for_distribution" },
      {
        createdAt: {
          gte: new Date("2026-07-01T00:00:00+08:00"),
          lte: new Date("2026-07-11T23:59:59.999+08:00"),
        },
      },
    ],
  });
});

test("returns paged tasks and statistics from database counts", async () => {
  const calls: Array<{ model: string; input: Record<string, unknown> }> = [];
  const database = {
    inspectionTask: {
      findMany: async (input: Record<string, unknown>) => (calls.push({ model: "findMany", input }), [{ id: "task-1" }]),
      count: async (input: Record<string, unknown>) => {
        calls.push({ model: "taskCount", input });
        return calls.filter((call) => call.model === "taskCount").length === 1 ? 7 : 2;
      },
    },
    taskPhoto: {
      count: async (input: Record<string, unknown>) => (calls.push({ model: "photoCount", input }), 12),
    },
    inspectionReport: {
      count: async (input: Record<string, unknown>) => (calls.push({ model: "reportCount", input }), 3),
    },
  };
  const service = new InspectionTaskReadService(database as never);

  const result = await service.list({ sourceType: "manual", page: "2", pageSize: "5" });

  assert.deepEqual(result.items, [{ id: "task-1" }]);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 5);
  assert.equal(result.total, 7);
  assert.deepEqual(result.stats, {
    taskCount: 7,
    processingTaskCount: 2,
    pendingPhotoCount: 12,
    generatedReportCount: 3,
  });
  assert.equal(calls.find((call) => call.model === "findMany")?.input.skip, 5);
});

test("orders task photos deterministically when timestamps are tied", async () => {
  let photoQuery: Record<string, unknown> | undefined;
  const database = {
    inspectionTask: { findUnique: async () => ({ id: "task-1" }) },
    taskPhoto: {
      findMany: async (input: Record<string, unknown>) => (photoQuery = input, []),
      count: async () => 0,
    },
  };
  const service = new InspectionTaskReadService(database as never);

  await service.photos("task-1", { pageSize: "100" });

  assert.deepEqual(photoQuery?.orderBy, [
    { videoTimestampMs: "asc" },
    { createdAt: "asc" },
    { id: "asc" },
  ]);
});
