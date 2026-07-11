import assert from "node:assert/strict";
import test from "node:test";
import { ReportCreateService } from "./report-create.service.js";

test("replaces ordered report photo links in the report transaction", async () => {
  const upserts: Array<Record<string, unknown>> = [];
  const deletions: Array<Record<string, unknown>> = [];
  const creations: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const transaction = {
    inspectionTask: { findUnique: async () => ({ id: "task-1", name: "7月巡检" }) },
    taskPhoto: {
      findMany: async () => [
        { id: "photo-1", taskId: "task-1" },
        { id: "photo-2", taskId: "task-1" },
      ],
    },
    inspectionReport: {
      upsert: async (input: Record<string, unknown>) => {
        upserts.push(input);
        return { id: "report-1", taskId: "task-1", title: "7月巡检综合报告" };
      },
    },
    reportPhoto: {
      deleteMany: async (input: Record<string, unknown>) => (deletions.push(input), { count: 0 }),
      createMany: async (input: Record<string, unknown>) => (creations.push(input), { count: 2 }),
    },
  };
  const database = {
    $transaction: async (callback: (client: typeof transaction) => unknown) => callback(transaction),
  };
  const auditService = { record: async (input: Record<string, unknown>) => (audits.push(input), input) };
  const service = new ReportCreateService(database as never, auditService as never);

  const result = await service.submit({
    taskId: "task-1",
    title: "7月巡检综合报告",
    reportDate: "2026-07-11",
    relatedObjectName: "曲阳路街道",
    issueCount: 3,
    contentSummary: "综合巡检结果",
    taskPhotoIds: ["photo-2", "photo-1"],
  });

  assert.equal(result.id, "report-1");
  assert.deepEqual(result.taskPhotoIds, ["photo-2", "photo-1"]);
  assert.deepEqual((upserts[0].where as Record<string, unknown>), { taskId: "task-1" });
  assert.equal((upserts[0].create as Record<string, unknown>).reportType, "comprehensive");
  assert.equal((upserts[0].update as Record<string, unknown>).issueCount, 3);
  assert.deepEqual(deletions, [{ where: { reportId: "report-1" } }]);
  const createdRows = creations[0].data as Array<Record<string, unknown>>;
  assert.equal(typeof createdRows[0].id, "string");
  assert.equal(typeof createdRows[1].id, "string");
  assert.deepEqual(createdRows.map(({ id: _id, ...row }) => row), [
    { reportId: "report-1", taskPhotoId: "photo-2", sortIndex: 0 },
    { reportId: "report-1", taskPhotoId: "photo-1", sortIndex: 1 },
  ]);
  assert.equal(audits[0].targetId, "report-1");
});

test("rejects duplicate report photo selections", async () => {
  const service = new ReportCreateService({} as never, { record: async () => undefined } as never);

  await assert.rejects(
    service.submit({
      taskId: "task-1",
      title: "7月巡检综合报告",
      reportDate: "2026-07-11",
      taskPhotoIds: ["photo-1", "photo-1"],
    }),
    /报告照片不能重复/,
  );
});

test("rejects photos that do not belong to the selected task", async () => {
  const transaction = {
    inspectionTask: { findUnique: async () => ({ id: "task-1", name: "7月巡检" }) },
    taskPhoto: { findMany: async () => [{ id: "photo-1", taskId: "task-1" }] },
  };
  const database = {
    $transaction: async (callback: (client: typeof transaction) => unknown) => callback(transaction),
  };
  const service = new ReportCreateService(database as never, { record: async () => undefined } as never);

  await assert.rejects(
    service.submit({
      taskId: "task-1",
      title: "7月巡检综合报告",
      reportDate: "2026-07-11",
      taskPhotoIds: ["photo-1", "photo-other-task"],
    }),
    /所选照片不属于当前任务/,
  );
});
