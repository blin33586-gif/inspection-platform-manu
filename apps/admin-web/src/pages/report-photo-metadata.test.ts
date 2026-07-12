import assert from "node:assert/strict";
import test from "node:test";
import { resolvePhotoCapturedAt, resolvePhotoCoordinateText } from "./report-photo-metadata.js";

test("falls back to task photo telemetry when an empty annotation has no coordinates", () => {
  assert.equal(resolvePhotoCoordinateText(
    { latitude: null, longitude: null, altitude: null },
    { latitude: 31.229247, longitude: 121.634603, absoluteAltitudeMeters: 96.474 },
  ), "31.229247, 121.634603, 96.474");
});

test("prefers explicitly saved annotation coordinates over telemetry", () => {
  assert.equal(resolvePhotoCoordinateText(
    { latitude: 31.2, longitude: 121.5, altitude: 20 },
    { latitude: 31.229247, longitude: 121.634603, absoluteAltitudeMeters: 96.474 },
  ), "31.2, 121.5, 20");
});

test("shows telemetry capture time instead of the media upload time", () => {
  assert.equal(
    resolvePhotoCapturedAt("2026/7/11 14:11:06", "2026-07-08T08:12:57.018Z"),
    "2026/7/8 16:12:57",
  );
});
