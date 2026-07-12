import assert from "node:assert/strict";
import test from "node:test";
import { buildTelemetryExtractCommand, findTelemetryStreamIndex } from "./ffmpeg-video-telemetry.js";

test("selects a mov_text telemetry stream", () => {
  assert.equal(findTelemetryStreamIndex({ streams: [{ index: 1, codec_name: "data" }, { index: 2, codec_name: "mov_text" }] }), 2);
  assert.deepEqual(buildTelemetryExtractCommand("flight.mp4", "/tmp/flight.srt", 2), {
    command: "ffmpeg", args: ["-v", "error", "-i", "flight.mp4", "-map", "0:2", "-y", "/tmp/flight.srt"],
  });
});

test("returns no stream when captions are absent", () => {
  assert.equal(findTelemetryStreamIndex({ streams: [{ index: 0, codec_name: "h264" }] }), null);
});
