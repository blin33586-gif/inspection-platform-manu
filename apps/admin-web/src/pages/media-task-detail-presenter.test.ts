import assert from "node:assert/strict";
import test from "node:test";
import { toMediaTaskDetail } from "./media-task-detail-presenter.js";

test("maps a persisted video into detail metadata and a protected video URL", () => {
  const detail = toMediaTaskDetail({
    id: "media-1",
    kind: "video",
    originalFileName: "flight.mp4",
    mimeType: "video/mp4",
    fileSize: 1024,
    createdAt: "2026-07-11T10:00:00.000Z",
    jobs: [{
      id: "job-1",
      status: "completed",
      progress: 100,
      inputJson: JSON.stringify({ intervalSeconds: 1 }),
      outputJson: JSON.stringify({ frameCount: 8 }),
    }],
    frames: [{ id: "frame-1", kind: "frame", originalFileName: "frame-1.jpg" }],
  }, (path) => `api:${path}`);

  assert.equal(detail.kindLabel, "视频");
  assert.equal(detail.status, "已完成");
  assert.equal(detail.intervalLabel, "每 1 秒抽 1 帧");
  assert.equal(detail.assetCountLabel, "8 帧");
  assert.equal(detail.videoUrl, "api:/media-assets/media-1/content");
});

test("maps an image bundle without a video URL", () => {
  const detail = toMediaTaskDetail({
    id: "bundle-1",
    kind: "image_bundle",
    originalFileName: "photos.zip",
    mimeType: "application/zip",
    fileSize: 2048,
    createdAt: "2026-07-11T10:00:00.000Z",
    jobs: [{
      id: "job-2",
      status: "running",
      progress: 40,
      inputJson: "{}",
      outputJson: JSON.stringify({ imageCount: 5 }),
    }],
    frames: [],
  }, (path) => `api:${path}`);

  assert.equal(detail.kindLabel, "图片包");
  assert.equal(detail.status, "分析中");
  assert.equal(detail.intervalLabel, "图片包解压");
  assert.equal(detail.assetCountLabel, "5 张");
  assert.equal(detail.videoUrl, null);
});
