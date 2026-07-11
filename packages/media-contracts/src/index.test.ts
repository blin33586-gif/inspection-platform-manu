import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyAnnotationDocument } from "./index.js";

test("creates a versioned empty annotation document", () => {
  assert.deepEqual(createEmptyAnnotationDocument("media-1", 4000, 3000), {
    version: 1,
    mediaId: "media-1",
    imageWidth: 4000,
    imageHeight: 3000,
    annotations: [],
  });
});
