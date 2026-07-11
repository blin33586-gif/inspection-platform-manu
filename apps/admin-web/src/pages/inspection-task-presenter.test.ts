import assert from "node:assert/strict";
import test from "node:test";
import { toInspectionTaskViewModel, type InspectionTaskRecord } from "./inspection-task-presenter.js";

test("presents a real task without archive association", () => {
  const task: InspectionTaskRecord = {
    id: "task-1",
    name: "7月11日无人机巡检",
    taskDate: "2026-07-11T00:00:00.000Z",
    sourceType: "drone",
    inputType: "video",
    processStatus: "ready_for_distribution",
    sourceMediaId: "media-1",
    photoCount: 86,
    pendingPhotoCount: 86,
    createdAt: "2026-07-11T04:00:00.000Z",
    sourceMedia: {
      id: "media-1",
      originalFileName: "flight.mp4",
      kind: "video",
      jobs: [{ id: "job-1", progress: 100, status: "completed", errorMessage: null }],
    },
    photos: [{ mediaAsset: { id: "frame-1" } }],
    report: null,
  };

  assert.deepEqual(toInspectionTaskViewModel(task), {
    id: "task-1",
    name: "7月11日无人机巡检",
    sourceLabel: "无人机",
    sourceTone: "blue",
    inputLabel: "视频",
    statusLabel: "待分发",
    statusTone: "review",
    photoCount: 86,
    pendingPhotoCount: 86,
    progress: 100,
    originalFileName: "flight.mp4",
    posterAssetId: "frame-1",
    sourceMediaId: "media-1",
    jobId: "job-1",
    errorMessage: null,
    taskDateLabel: "2026-07-11",
    createdAtLabel: "2026-07-11 12:00",
    reportId: null,
  });
});
