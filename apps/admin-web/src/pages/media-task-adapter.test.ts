import assert from "node:assert/strict";
import test from "node:test";
import { toMediaTaskViewModel, toPersistedVideoTask } from "./media-task-adapter.js";

test("maps a completed extraction job to a persisted media-library task", () => {
  assert.deepEqual(toPersistedVideoTask({
    id: "media-video-1",
    originalFileName: "DJI_FLIGHT.MP4",
    createdAt: "2026-07-11T08:00:00.000Z",
    jobs: [{
      id: "job-frame-media-video-1-3",
      status: "completed",
      progress: 100,
      inputJson: JSON.stringify({ intervalSeconds: 3 }),
      outputJson: JSON.stringify({ frameCount: 120 }),
      errorMessage: null,
    }],
  }), {
    id: "media-video-1",
    jobId: "job-frame-media-video-1-3",
    videoName: "DJI_FLIGHT.MP4",
    frameIntervalSec: 3,
    frameCount: 120,
    status: "已完成",
    progress: 100,
    errorMessage: null,
  });
});

test("maps a completed video into a unified media task", () => {
  assert.deepEqual(toMediaTaskViewModel({
    id: "media-video-1",
    kind: "video",
    originalFileName: "DJI_FLIGHT.MP4",
    mimeType: "video/mp4",
    fileSize: 1024,
    createdAt: "2026-07-11T08:00:00.000Z",
    jobs: [{
      id: "job-frame-1",
      status: "completed",
      progress: 100,
      inputJson: JSON.stringify({ intervalSeconds: 3 }),
      outputJson: JSON.stringify({ frameCount: 120 }),
      errorMessage: null,
    }],
    frames: [{ id: "frame-1", kind: "frame", originalFileName: "frame.jpg" }],
  }), {
    id: "media-video-1",
    jobId: "job-frame-1",
    assetKind: "video",
    kindLabel: "视频",
    originalFileName: "DJI_FLIGHT.MP4",
    frameIntervalSec: 3,
    assetCount: 120,
    posterAssetId: "frame-1",
    status: "已完成",
    progress: 100,
    errorMessage: null,
  });
});

test("maps an image bundle into a unified media task", () => {
  const task = toMediaTaskViewModel({
    id: "media-bundle-1",
    kind: "image_bundle",
    originalFileName: "曲阳巡检照片.zip",
    mimeType: "application/zip",
    fileSize: 2048,
    createdAt: "2026-07-11T09:00:00.000Z",
    jobs: [{
      id: "job-archive-1",
      status: "completed",
      progress: 100,
      inputJson: "{}",
      outputJson: JSON.stringify({ imageCount: 18 }),
      errorMessage: null,
    }],
    frames: [{ id: "image-1", kind: "image", originalFileName: "photo.jpg" }],
  });

  assert.equal(task.assetKind, "image_bundle");
  assert.equal(task.kindLabel, "图片包");
  assert.equal(task.assetCount, 18);
  assert.equal(task.posterAssetId, "image-1");
});
