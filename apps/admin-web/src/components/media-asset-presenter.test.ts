import assert from "node:assert/strict";
import test from "node:test";
import { formatMediaCaption, toMediaGalleryItem } from "./media-asset-presenter.js";

test("uses a video timestamp for frame captions", () => {
  assert.equal(formatMediaCaption({ kind: "frame", videoTimestampMs: 6000, originalFileName: "frame.jpg" }), "00:06");
  assert.equal(formatMediaCaption({ kind: "frame", videoTimestampMs: 3_726_000, originalFileName: "frame.jpg" }), "01:02:06");
});

test("uses the original filename for extracted ZIP images", () => {
  assert.equal(formatMediaCaption({ kind: "image", videoTimestampMs: null, originalFileName: "北区-01.jpg" }), "北区-01.jpg");
});

test("maps a child asset to a gallery item with a protected content URL", () => {
  const item = toMediaGalleryItem({
    id: "frame-1",
    kind: "frame",
    originalFileName: "frame.jpg",
    mimeType: "image/jpeg",
    fileSize: 42,
    videoTimestampMs: 3000,
    createdAt: "2026-07-11T08:00:00.000Z",
  }, "/api/v1/media-assets/frame-1/content?token=test");

  assert.equal(item.caption, "00:03");
  assert.equal(item.contentUrl, "/api/v1/media-assets/frame-1/content?token=test");
});
