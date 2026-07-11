import assert from "node:assert/strict";
import test from "node:test";
import { toPersistedVideoTask } from "./media-task-adapter.js";

test("maps a completed extraction job to a persisted media-library task", () => {
  assert.deepEqual(toPersistedVideoTask({
    id: "media-video-1",
    originalFileName: "DJI_FLIGHT.MP4",
    createdAt: "2026-07-11T08:00:00.000Z",
    jobs: [{
      id: "job-frame-media-video-1-3",
      status: "completed",
      progress: 100,
      inputJson: JSON.stringify({ intervalSeconds: 3 }),
      outputJson: JSON.stringify({ frameCount: 120 }),
      errorMessage: null,
    }],
  }), {
    id: "media-video-1",
    jobId: "job-frame-media-video-1-3",
    videoName: "DJI_FLIGHT.MP4",
    frameIntervalSec: 3,
    frameCount: 120,
    status: "已完成",
    progress: 100,
    errorMessage: null,
  });
});
