import assert from "node:assert/strict";
import test from "node:test";
import { JobRunner } from "./job-runner.js";

test("accepts one-to-five-second frame extraction inputs", () => {
  const runner = new JobRunner({} as never);
  const parseFrameInput = (runner as unknown as {
    parseFrameInput(rawInput: string): { intervalSeconds: number };
  }).parseFrameInput.bind(runner);

  assert.equal(parseFrameInput(JSON.stringify({
    mediaId: "media-video-1",
    sourcePath: "storage/media/videos/media-video-1.mp4",
    intervalSeconds: 1,
  })).intervalSeconds, 1);
  assert.equal(parseFrameInput(JSON.stringify({
    mediaId: "media-video-1",
    sourcePath: "storage/media/videos/media-video-1.mp4",
    intervalSeconds: 5,
  })).intervalSeconds, 5);
  assert.throws(() => parseFrameInput(JSON.stringify({
    mediaId: "media-video-1",
    sourcePath: "storage/media/videos/media-video-1.mp4",
    intervalSeconds: 0,
  })), /视频抽帧任务参数无效/);
  assert.throws(() => parseFrameInput(JSON.stringify({
    mediaId: "media-video-1",
    sourcePath: "storage/media/videos/media-video-1.mp4",
    intervalSeconds: 6,
  })), /视频抽帧任务参数无效/);
});

test("processes an archive extraction job into child media assets", async () => {
  const completedUpdates: Array<Record<string, unknown>> = [];
  const createdAssets: Array<Record<string, unknown>> = [];
  const createdTaskPhotos: Array<Record<string, unknown>> = [];
  const taskUpdates: Array<Record<string, unknown>> = [];
  const findFirstCalls: Array<Record<string, unknown>> = [];
  const job = {
    id: "job-archive-media-1",
    jobType: "archive_extract",
    status: "queued",
    inputJson: JSON.stringify({
      inspectionTaskId: "task-1",
      mediaId: "media-1",
      sourcePath: "storage/media/archives/media-1.zip",
    }),
  };
  const database = {
    mediaProcessingJob: {
      findFirst: async (input: Record<string, unknown>) => {
        findFirstCalls.push(input);
        return job;
      },
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => job,
      update: async (input: Record<string, unknown>) => {
        completedUpdates.push(input);
        return input;
      },
    },
    mediaAsset: {
      createMany: async (input: Record<string, unknown>) => {
        createdAssets.push(input);
        return { count: 1 };
      },
    },
    taskPhoto: {
      createMany: async (input: Record<string, unknown>) => {
        createdTaskPhotos.push(input);
        return { count: 1 };
      },
    },
    inspectionTask: {
      update: async (input: Record<string, unknown>) => {
        taskUpdates.push(input);
        return input;
      },
    },
    auditLog: { create: async (input: Record<string, unknown>) => input },
    $transaction: async (operations: unknown[]) => operations,
  };
  const runner = new JobRunner(database as never, "/tmp/xunjianbao-storage", {
    extractArchiveImages: async () => [{
      fileName: "photo.jpg",
      storagePath: "/tmp/xunjianbao-storage/media/images/media-1/photo.jpg",
      mimeType: "image/jpeg" as const,
      fileSize: 42,
      sortIndex: 0,
    }],
  });

  const processed = await runner.processNext();

  assert.equal(processed, true);
  assert.deepEqual((findFirstCalls[0].where as Record<string, unknown>).jobType, {
    in: ["tiff_tile", "frame_extract", "archive_extract", "image_prepare"],
  });
  const assetData = createdAssets[0].data as Array<Record<string, unknown>>;
  assert.equal(assetData[0].kind, "image");
  assert.equal(assetData[0].parentMediaId, "media-1");
  assert.equal(assetData[0].projectId, "quyang");
  const photoData = createdTaskPhotos[0].data as Array<Record<string, unknown>>;
  assert.equal(photoData[0].taskId, "task-1");
  assert.equal(photoData[0].mediaAssetId, "image-media-1-1");
  assert.equal(photoData[0].distributionStatus, "pending");
  assert.deepEqual(taskUpdates[0], {
    where: { id: "task-1", projectId: "quyang" },
    data: { processStatus: "ready_for_distribution", photoCount: 1, pendingPhotoCount: 1 },
  });
  const completed = completedUpdates.find((input) => (
    (input.data as Record<string, unknown>).status === "completed"
  ));
  assert.ok(completed);
  assert.match(String((completed.data as Record<string, unknown>).outputJson), /"imageCount":1/);
});

test("prepares direct images before they enter the task photo pool", async () => {
  const completedUpdates: Array<Record<string, unknown>> = [];
  const assetUpdates: Array<Record<string, unknown>> = [];
  const createdTaskPhotos: Array<Record<string, unknown>> = [];
  const taskUpdates: Array<Record<string, unknown>> = [];
  const job = {
    id: "job-image-prepare-1",
    jobType: "image_prepare",
    status: "queued",
    inputJson: JSON.stringify({
      inspectionTaskId: "task-direct-1",
      mediaIds: ["media-direct-1"],
    }),
  };
  const database = {
    mediaProcessingJob: {
      findFirst: async () => job,
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => job,
      update: async (input: Record<string, unknown>) => {
        completedUpdates.push(input);
        return input;
      },
    },
    mediaAsset: {
      findMany: async () => [{
        id: "media-direct-1",
        originalFileName: "inspection.heic",
        storagePath: "storage/media/task-images/task-direct-1/media-direct-1.heic",
      }],
      update: async (input: Record<string, unknown>) => {
        assetUpdates.push(input);
        return input;
      },
    },
    taskPhoto: {
      createMany: async (input: Record<string, unknown>) => {
        createdTaskPhotos.push(input);
        return { count: 1 };
      },
    },
    inspectionTask: {
      update: async (input: Record<string, unknown>) => {
        taskUpdates.push(input);
        return input;
      },
    },
    auditLog: { create: async (input: Record<string, unknown>) => input },
    $transaction: async (operations: unknown[]) => operations,
  };
  const runner = new JobRunner(database as never, "/tmp/xunjianbao-storage", {
    prepareInspectionImage: async () => ({
      mimeType: "image/heif",
      previewStoragePath: "/tmp/xunjianbao-storage/media/previews/media-direct-1.jpg",
      previewMimeType: "image/jpeg",
      previewFileSize: 30,
    }),
  });

  assert.equal(await runner.processNext(), true);
  assert.equal((assetUpdates[0].data as Record<string, unknown>).previewMimeType, "image/jpeg");
  const photoData = createdTaskPhotos[0].data as Array<Record<string, unknown>>;
  assert.equal(photoData[0].mediaAssetId, "media-direct-1");
  assert.deepEqual(taskUpdates[0], {
    where: { id: "task-direct-1", projectId: "quyang" },
    data: { processStatus: "ready_for_distribution", photoCount: 1, pendingPhotoCount: 1 },
  });
  const completed = completedUpdates.find((input) => (input.data as Record<string, unknown>).status === "completed");
  assert.ok(completed);
});

test("writes extracted video frames into the task photo pool", async () => {
  const photoBatches: Array<Record<string, unknown>> = [];
  const taskUpdates: Array<Record<string, unknown>> = [];
  const job = {
    id: "job-frame-media-2",
    jobType: "frame_extract",
    status: "queued",
    inputJson: JSON.stringify({
      inspectionTaskId: "task-2",
      mediaId: "media-2",
      sourcePath: "storage/media/videos/media-2.mp4",
      intervalSeconds: 3,
    }),
  };
  const database = {
    mediaProcessingJob: {
      findFirst: async () => job,
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => job,
      update: async (input: Record<string, unknown>) => input,
    },
    mediaAsset: { createMany: async () => ({ count: 2 }) },
    taskPhoto: {
      createMany: async (input: Record<string, unknown>) => {
        photoBatches.push(input);
        return { count: 2 };
      },
    },
    inspectionTask: {
      update: async (input: Record<string, unknown>) => {
        taskUpdates.push(input);
        return input;
      },
    },
    auditLog: { create: async (input: Record<string, unknown>) => input },
    $transaction: async (operations: unknown[]) => operations,
  };
  const runner = new JobRunner(database as never, "/tmp/xunjianbao-storage", {
    extractVideoFrames: async () => [
      { fileName: "frame-0000000001.jpg", storagePath: "/tmp/frame-1.jpg", fileSize: 10, timestampMs: 0 },
      { fileName: "frame-0000000002.jpg", storagePath: "/tmp/frame-2.jpg", fileSize: 12, timestampMs: 3000 },
    ],
    enrichExtractedFrames: async (_path, frames) => ({ frames: frames.map((frame) => ({ ...frame, telemetry: null })), stats: {} }),
  });

  assert.equal(await runner.processNext(), true);
  const photos = photoBatches[0].data as Array<Record<string, unknown>>;
  assert.deepEqual(photos.map((photo) => photo.videoTimestampMs), [0, 3000]);
  assert.equal(photos.every((photo) => photo.taskId === "task-2" && photo.distributionStatus === "pending"), true);
  assert.deepEqual(taskUpdates[0], {
    where: { id: "task-2", projectId: "quyang" },
    data: { processStatus: "ready_for_distribution", photoCount: 2, pendingPhotoCount: 2 },
  });
});
