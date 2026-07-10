import assert from "node:assert/strict";
import test from "node:test";
import { parseMapGeometry } from "./map-geometry.js";

test("accepts a road line with two valid longitude and latitude coordinates", () => {
  const geometry = parseMapGeometry(JSON.stringify({
    shape: "line",
    coordinates: [[31.287, 121.486], [31.286, 121.49]],
  }));

  assert.deepEqual(geometry, {
    shape: "line",
    coordinates: [[31.287, 121.486], [31.286, 121.49]],
  });
});

test("requires three points when a community area is saved", () => {
  assert.throws(
    () => parseMapGeometry(JSON.stringify({ shape: "polygon", coordinates: [[31.287, 121.486], [31.286, 121.49]] })),
    /至少需要 3 个点/,
  );
});

test("rejects coordinate values outside the geographic range", () => {
  assert.throws(
    () => parseMapGeometry(JSON.stringify({ shape: "line", coordinates: [[95, 121.486], [31.286, 121.49]] })),
    /经纬度坐标无效/,
  );
});
