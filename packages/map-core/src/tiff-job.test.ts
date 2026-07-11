import assert from "node:assert/strict";
import test from "node:test";
import { createTiffTileJob } from "./tiff-job.js";

test("builds an idempotent TIF tile job", () => {
  assert.deepEqual(createTiffTileJob("map-1", "storage/map-assets/map-1.tif"), {
    dedupeKey: "tiff_tile:map-1:v1",
    jobType: "tiff_tile",
    mapAssetId: "map-1",
    sourcePath: "storage/map-assets/map-1.tif",
    minZoom: 16,
    maxZoom: 19,
  });
});
