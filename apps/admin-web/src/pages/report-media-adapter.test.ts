import assert from "node:assert/strict";
import test from "node:test";
import { toReportPhoto } from "./report-media-adapter.js";

test("maps a persisted media asset into a report photo", () => {
  const photo = toReportPhoto({
    id: "frame-1",
    kind: "frame",
    originalFileName: "frame-0000000003.jpg",
    mimeType: "image/jpeg",
    fileSize: 1280,
    createdAt: "2026-07-11T08:00:00.000Z",
  }, 1, "/api/v1/media-assets/frame-1/content?token=test");

  assert.deepEqual(photo, {
    id: 1,
    label: "frame-0000000003.jpg",
    state: "待标注",
    variant: "persisted",
    url: "/api/v1/media-assets/frame-1/content?token=test",
    fileName: "frame-0000000003.jpg",
    fileSize: 1280,
    uploadedAt: "2026/7/11 16:00:00",
  });
});

test("rejects a parent video as a report photo", () => {
  assert.throws(() => toReportPhoto({
    id: "video-1",
    kind: "video",
    originalFileName: "flight.mp4",
    mimeType: "video/mp4",
    fileSize: 1024,
    createdAt: "2026-07-11T08:00:00.000Z",
  }, 1, "/video"), /仅支持图片素材/);
});
