import assert from "node:assert/strict";
import test from "node:test";
import {
  effectiveReportTaskPhotoIds,
  mergeReportTaskOptions,
  reportWritePath,
  toEditableReportDraft,
} from "./report-edit-state.js";

test("restores saved report fields and its exact ordered task photo selection", () => {
  assert.deepEqual(toEditableReportDraft({
    id: "report-1",
    taskId: "task-1",
    taskPhotoIds: ["photo-3", "photo-1"],
    title: "7 月综合巡检报告",
    reportDate: "2026-07-12",
    relatedObjectName: "曲阳路街道",
    issueCount: 4,
    contentSummary: "发现 4 处疑似问题",
  }), {
    title: "7 月综合巡检报告",
    reportDate: "2026-07-12",
    reportArea: "曲阳路街道",
    issueCount: 4,
    contentSummary: "发现 4 处疑似问题",
    taskPhotoIds: ["photo-3", "photo-1"],
  });
});

test("builds an encoded report editing route for an existing task", () => {
  assert.equal(reportWritePath("task/曲阳"), "/reports/write?taskId=task%2F%E6%9B%B2%E9%98%B3");
});

test("keeps restored photo ids effective when the selector is canceled", () => {
  assert.deepEqual(effectiveReportTaskPhotoIds({
    currentTaskId: "task-1",
    workspaceTaskId: null,
    workspacePhotoIds: [],
    restoredTaskId: "task-1",
    restoredPhotoIds: ["photo-3", "photo-1"],
  }), ["photo-3", "photo-1"]);
});

test("uses confirmed workspace ids instead of the restored selection", () => {
  assert.deepEqual(effectiveReportTaskPhotoIds({
    currentTaskId: "task-1",
    workspaceTaskId: "task-1",
    workspacePhotoIds: ["photo-2"],
    restoredTaskId: "task-1",
    restoredPhotoIds: ["photo-3", "photo-1"],
  }), ["photo-2"]);
});

test("adds a directly loaded historical task outside the newest task page", () => {
  assert.deepEqual(mergeReportTaskOptions(
    [{ id: "task-new", name: "最新任务" }],
    { id: "task-old", name: "历史任务" },
  ), [
    { id: "task-new", name: "最新任务" },
    { id: "task-old", name: "历史任务" },
  ]);
});
