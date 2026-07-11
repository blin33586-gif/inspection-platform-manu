import assert from "node:assert/strict";
import test from "node:test";
import { ReportCreateService } from "./report-create.service.js";

test("upserts one comprehensive report per task", async () => {
  const upserts: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const database = {
    inspectionTask: { findUnique: async () => ({ id: "task-1", name: "7月巡检" }) },
    inspectionReport: {
      upsert: async (input: Record<string, unknown>) => {
        upserts.push(input);
        return { id: "report-1", taskId: "task-1", title: "7月巡检综合报告" };
      },
    },
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
  });

  assert.equal(result.id, "report-1");
  assert.deepEqual((upserts[0].where as Record<string, unknown>), { taskId: "task-1" });
  assert.equal((upserts[0].create as Record<string, unknown>).reportType, "comprehensive");
  assert.equal((upserts[0].update as Record<string, unknown>).issueCount, 3);
  assert.equal(audits[0].targetId, "report-1");
});
