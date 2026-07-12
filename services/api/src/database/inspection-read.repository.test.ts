import assert from "node:assert/strict";
import test from "node:test";
import { InspectionReadRepository } from "./inspection-read.repository.js";

test("returns task and ordered photo ids in report detail", async () => {
  let query: Record<string, unknown> | undefined;
  const database = {
    inspectionReport: {
      findUnique: async (input: Record<string, unknown>) => {
        query = input;
        return {
          id: "report-1",
          title: "7月巡检综合报告",
          reportDate: new Date("2026-07-11T00:00:00.000Z"),
          reportType: "comprehensive",
          relatedObjectName: "曲阳路街道",
          issueCount: 3,
          contentSummary: "综合巡检结果",
          fileName: null,
          originalFileName: null,
          mimeType: null,
          fileSize: null,
          processStatus: "completed",
          taskId: "task-1",
          photos: [
            { taskPhotoId: "photo-2", sortIndex: 0 },
            { taskPhotoId: "photo-1", sortIndex: 1 },
          ],
        };
      },
    },
  };
  const repository = new InspectionReadRepository(database as never);

  const result = await repository.report("report-1");

  assert.deepEqual(query, {
    where: { id: "report-1" },
    include: { photos: { orderBy: { sortIndex: "asc" } } },
  });
  assert.equal(result?.taskId, "task-1");
  assert.deepEqual(result?.taskPhotoIds, ["photo-2", "photo-1"]);
  assert.equal(result?.contentSummary, "综合巡检结果");
});

test("includes the task id in report list rows so reports can be edited", async () => {
  const database = {
    inspectionReport: {
      findMany: async () => [{
        id: "report-1",
        taskId: "task-1",
        title: "7月巡检综合报告",
        reportDate: new Date("2026-07-11T00:00:00.000Z"),
        reportType: "comprehensive",
        relatedObjectName: "曲阳路街道",
        issueCount: 3,
        fileName: null,
        originalFileName: null,
        mimeType: null,
        fileSize: null,
        processStatus: "completed",
      }],
    },
  };
  const repository = new InspectionReadRepository(database as never);

  const [report] = await repository.reports();

  assert.equal(report.taskId, "task-1");
});
