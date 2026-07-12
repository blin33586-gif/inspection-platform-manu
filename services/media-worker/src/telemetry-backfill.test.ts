import assert from "node:assert/strict";
import test from "node:test";
import { backfillMediaTelemetry, readMediaIdArgument } from "./telemetry-backfill.js";

test("requires an explicit media id for the backfill command", () => {
  assert.equal(readMediaIdArgument(["node", "telemetry-backfill.ts"]), null);
  assert.equal(readMediaIdArgument(["node", "telemetry-backfill.ts", "--media-id", "video-1"]), "video-1");
});

test("persists refreshed JPEG size while backfilling telemetry", async () => {
  const calls: Array<{ operation: string; data: unknown }> = [];
  const database = {
    mediaAsset: {
      findUnique: async () => ({
        id: "video-1",
        kind: "video",
        storagePath: "storage/media/videos/video-1.mp4",
        frames: [{
          id: "frame-1",
          originalFileName: "frame-1.jpg",
          storagePath: "storage/media/frames/video-1/frame-1.jpg",
          fileSize: 10,
          videoTimestampMs: 0,
          taskPhoto: { id: "photo-1" },
        }],
      }),
      update: ({ data }: { data: unknown }) => (calls.push({ operation: "media", data }), Promise.resolve()),
    },
    taskPhoto: {
      update: ({ data }: { data: unknown }) => (calls.push({ operation: "photo", data }), Promise.resolve()),
    },
    taskPhotoTelemetry: {
      upsert: ({ update }: { update: unknown }) => (calls.push({ operation: "telemetry", data: update }), Promise.resolve()),
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  };
  const telemetry = {
    timestampMs: 0,
    matchOffsetMs: 0,
    capturedAt: new Date("2026-07-08T08:12:57.018Z"),
    latitude: 31.2,
    longitude: 121.6,
    relativeAltitudeMeters: 80,
    absoluteAltitudeMeters: 96,
    gimbalYawDegrees: -67,
    gimbalPitchDegrees: -30,
    gimbalRollDegrees: 0,
    focalLengthMillimeters: 40,
    digitalZoomRatio: 1,
  };

  const result = await backfillMediaTelemetry("video-1", database as never, "/storage", async () => ({
    frames: [{ fileName: "frame-1.jpg", storagePath: "/storage/media/frames/video-1/frame-1.jpg", fileSize: 99, timestampMs: 0, telemetry }],
    stats: {
      telemetrySource: "dji_subtitle",
      telemetrySampleCount: 1,
      telemetryMatchedFrameCount: 1,
      telemetryUnmatchedFrameCount: 0,
      telemetryWarningCount: 0,
      exifWrittenFrameCount: 1,
      exifFailedFrameCount: 0,
    },
  }));

  assert.equal(result.updated, 1);
  assert.deepEqual(calls.find((call) => call.operation === "media")?.data, { fileSize: 99 });
});
