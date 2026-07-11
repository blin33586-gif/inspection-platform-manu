import assert from "node:assert/strict";
import test from "node:test";
import { buildGdalTileCommand } from "./gdal-tile-generator.js";

test("generates XYZ tiles from a COG source", () => {
  assert.deepEqual(buildGdalTileCommand("source.tif", "tiles", 16, 19), {
    command: "gdal2tiles.py",
    args: ["--xyz", "--zoom=16-19", "--resampling=average", "source.tif", "tiles"],
  });
});
