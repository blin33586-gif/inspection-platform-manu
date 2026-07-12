import assert from "node:assert/strict";
import test from "node:test";
import { detectImageFormat, isSupportedImageFileName, shouldIgnoreArchiveEntry } from "./image-format.js";

test("recognizes the accepted image file extensions", () => {
  ["a.jpg", "a.jpeg", "a.jfif", "a.png", "a.webp", "a.gif", "a.bmp", "a.tif", "a.tiff", "a.heic", "a.heif"].forEach((fileName) => {
    assert.equal(isSupportedImageFileName(fileName), true);
  });
  assert.equal(isSupportedImageFileName("a.svg"), false);
});

test("ignores macOS archive metadata without ignoring regular nested files", () => {
  assert.equal(shouldIgnoreArchiveEntry("__MACOSX/._photo.png"), true);
  assert.equal(shouldIgnoreArchiveEntry("photos/._photo.png"), true);
  assert.equal(shouldIgnoreArchiveEntry("photos/.DS_Store"), true);
  assert.equal(shouldIgnoreArchiveEntry("photos/photo.png"), false);
});

test("marks non-browser-safe image formats for preview generation", () => {
  assert.deepEqual(detectImageFormat("photo.bmp", Buffer.from([0x42, 0x4d])), {
    mimeType: "image/bmp",
    requiresPreview: true,
  });
  assert.deepEqual(detectImageFormat("photo.webp", Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), {
    mimeType: "image/webp",
    requiresPreview: false,
  });
});
