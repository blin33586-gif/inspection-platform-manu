import assert from "node:assert/strict";
import test from "node:test";
import { describeTilePackage } from "./tile-package-metadata.js";

test("describes an XYZ tile package and derives its map bounds", () => {
  const metadata = describeTilePackage([
    "16/54882/26765.png",
    "16/54883/26766.png",
    "17/109764/53530.png",
    "17/109765/53531.png",
  ]);

  assert.equal(metadata.minZoom, 16);
  assert.equal(metadata.maxZoom, 17);
  assert.equal(metadata.tileCount, 4);
  assert.deepEqual(metadata.bounds, {
    west: 121.475830078125,
    east: 121.48681640625,
    north: 31.29263405889953,
    south: 31.283245492650785,
  });
});

test("rejects a tile package with files outside the z/x/y.png structure", () => {
  assert.throws(
    () => describeTilePackage(["16/54882/26765.png", "readme.txt"]),
    /z\/x\/y\.png/,
  );
});

test("rejects a tile package with traversal paths", () => {
  assert.throws(
    () => describeTilePackage(["16/54882/26765.png", "../17/109764/53530.png"]),
    /z\/x\/y\.png/,
  );
});
