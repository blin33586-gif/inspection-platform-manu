import assert from "node:assert/strict";
import test from "node:test";
import { getMediaPreviewMode } from "./media-task-preview.js";

test("renders video only while a video task is hovered", () => {
  assert.equal(getMediaPreviewMode("video", false), "poster");
  assert.equal(getMediaPreviewMode("video", true), "video");
  assert.equal(getMediaPreviewMode("image_bundle", true), "poster");
});
