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
            {
              taskPhotoId: "photo-2",
              sortIndex: 0,
              taskPhoto: {
                id: "photo-2",
                mediaAssetId: "media-2",
                capturedAt: new Date("2026-07-11T08:00:00.000Z"),
                videoTimestampMs: 3200,
                latitude: 31.2,
                longitude: 121.4,
                mediaAsset: { fileName: "frame-2.jpg", originalFileName: "frame-2.jpg" },
                annotationDocument: { issueDescription: "广告牌破损", latitude: 31.21, longitude: 121.41 },
                sourceIssues: [{ id: "issue-2", title: "广告牌破损", category: "广告牌", description: "需要处置" }],
              },
            },
            {
              taskPhotoId: "photo-1",
              sortIndex: 1,
              taskPhoto: {
                id: "photo-1",
                mediaAssetId: "media-1",
                capturedAt: null,
                videoTimestampMs: null,
                latitude: null,
                longitude: null,
                mediaAsset: { fileName: "frame-1.jpg", originalFileName: "frame-1.jpg" },
                annotationDocument: null,
                sourceIssues: [],
              },
            },
          ],
        };
      },
    },
  };
  const repository = new InspectionReadRepository(database as never);

  const result = await repository.report("report-1");

  assert.deepEqual(query?.where, { id: "report-1", projectId: "quyang" });
  assert.equal((query?.include as { photos: { orderBy: { sortIndex: string } } }).photos.orderBy.sortIndex, "asc");
  assert.equal(result?.taskId, "task-1");
  assert.deepEqual(result?.taskPhotoIds, ["photo-2", "photo-1"]);
  assert.equal(result?.contentSummary, "综合巡检结果");
  assert.equal(result?.photos?.[0].issueCardId, "issue-2");
  assert.equal(result?.photos?.[0].issueDescription, "广告牌破损");
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
