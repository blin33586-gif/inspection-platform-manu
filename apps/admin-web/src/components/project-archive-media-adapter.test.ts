import assert from "node:assert/strict";
import test from "node:test";
import { toProjectArchiveMediaItem } from "./project-archive-media-adapter.js";

test("maps a real task photo into an archive media card", () => {
  const item = toProjectArchiveMediaItem({
    id: "photo-1",
    taskId: "task-1",
    mediaAssetId: "media-1",
    distributionStatus: "archived",
    archiveObjectId: "community-1",
    capturedAt: "2026-07-11T08:00:00.000Z",
    videoTimestampMs: 3000,
    mediaAsset: {
      id: "media-1",
      originalFileName: "frame-0000000002.jpg",
      mimeType: "image/jpeg",
      fileSize: 2048,
      createdAt: "2026-07-11T07:59:00.000Z",
    },
    archiveObject: { id: "community-1", name: "赤峰小区", objectType: "community" },
    task: { id: "task-1", name: "7月无人机巡检", taskDate: "2026-07-11", sourceType: "drone" },
  }, "/api/v1/media-assets/media-1/content");

  assert.deepEqual(item, {
    id: "photo-1",
    taskId: "task-1",
    taskPhotoId: "photo-1",
    mediaAssetId: "media-1",
    title: "frame-0000000002.jpg",
    linkedObjectId: "community-1",
    linkedObjectName: "赤峰小区",
    issueTitle: "7月无人机巡检",
    status: "已归档",
    capturedAt: "2026-07-11 16:00",
    sourceName: "无人机",
    thumbnailUrl: "/api/v1/media-assets/media-1/content",
    fileName: "frame-0000000002.jpg",
  });
});

test("labels an unassigned manual photo as pending", () => {
  const item = toProjectArchiveMediaItem({
    id: "photo-2",
    taskId: "task-2",
    mediaAssetId: "media-2",
    distributionStatus: "pending",
    archiveObjectId: null,
    capturedAt: null,
    videoTimestampMs: null,
    mediaAsset: {
      id: "media-2",
      originalFileName: "manual.jpg",
      mimeType: "image/jpeg",
      fileSize: 1024,
      createdAt: "2026-07-11T08:00:00.000Z",
    },
    archiveObject: null,
    task: { id: "task-2", name: "人工上传任务", taskDate: "2026-07-11", sourceType: "manual" },
  }, "/media-2");

  assert.equal(item.status, "待分发");
  assert.equal(item.linkedObjectName, "尚未归档");
  assert.equal(item.sourceName, "人工上传");
});
