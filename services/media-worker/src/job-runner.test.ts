import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { JobRunner } from "./job-runner.js";

const mapMetadata = {
  minZoom: 1,
  maxZoom: 1,
  tileCount: 1,
  bounds: { west: -180, east: 0, north: 85.0511287798066, south: 0 },
};

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
    in: ["tiff_tile", "map_tile_package", "frame_extract", "archive_extract", "image_prepare"],
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

test("successfully extracts a map package and atomically activates it only for its project", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-map-runner-"));
  const sourcePath = join(storageRoot, "map-assets/map-new.zip");
  await mkdir(join(storageRoot, "map-assets"), { recursive: true });
  await writeFile(sourcePath, "source-retained");
  const job = {
    id: "job-map-new",
    projectId: "jinshan",
    jobType: "map_tile_package",
    inputJson: JSON.stringify({ mapAssetId: "map-new", sourcePath: "storage/map-assets/map-new.zip" }),
  };
  const deactivations: Array<Record<string, unknown>> = [];
  const activations: Array<Record<string, unknown>> = [];
  const transactions: unknown[][] = [];
  const findFirstCalls: Array<Record<string, unknown>> = [];
  const database = {
    mediaProcessingJob: {
      findFirst: async (input: Record<string, unknown>) => { findFirstCalls.push(input); return job; },
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => job,
      update: (input: Record<string, unknown>) => ({ kind: "job", input }),
    },
    mapAsset: {
      updateMany: (input: Record<string, unknown>) => { deactivations.push(input); return { kind: "deactivate", input }; },
      update: (input: Record<string, unknown>) => { activations.push(input); return { kind: "activate", input }; },
    },
    auditLog: { create: (input: Record<string, unknown>) => ({ kind: "audit", input }) },
    $transaction: async (operations: unknown[]) => { transactions.push(operations); return operations; },
  };
  const outputDirectories: string[] = [];
  const runner = new JobRunner(database as never, storageRoot, {
    extractTilePackage: async ({ outputDirectory }) => {
      outputDirectories.push(outputDirectory);
      await mkdir(join(outputDirectory, "1/0"), { recursive: true });
      await writeFile(join(outputDirectory, "1/0/0.png"), "tile");
      return mapMetadata;
    },
  });

  try {
    assert.equal(await runner.processNext(), true);
    assert.match(outputDirectories[0], /map-tiles\/\.tmp-map-new$/);
    assert.deepEqual((findFirstCalls[0].where as Record<string, unknown>).jobType, {
      in: ["tiff_tile", "map_tile_package", "frame_extract", "archive_extract", "image_prepare"],
    });
    assert.deepEqual(deactivations[0], {
      where: { projectId: "jinshan", isActive: true },
      data: { isActive: false },
    });
    assert.deepEqual(activations[0].where, { id: "map-new", projectId: "jinshan" });
    assert.equal((activations[0].data as Record<string, unknown>).isActive, true);
    assert.equal((activations[0].data as Record<string, unknown>).processStatus, "published");
    assert.ok((activations[0].data as Record<string, unknown>).activatedAt instanceof Date);
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].length, 4);
    assert.equal(await readFile(join(storageRoot, "map-tiles/map-new/1/0/0.png"), "utf8"), "tile");
    await assert.rejects(() => stat(join(storageRoot, "map-tiles/.tmp-map-new")), { code: "ENOENT" });
    assert.equal(await readFile(sourcePath, "utf8"), "source-retained");
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test("keeps map work globally serial within the worker", async () => {
  let findFirstCalls = 0;
  let release!: () => void;
  let notifyStarted!: () => void;
  const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const job = {
    id: "job-map-serial",
    projectId: "jinshan",
    jobType: "map_tile_package",
    inputJson: JSON.stringify({ mapAssetId: "map-serial", sourcePath: "storage/map-assets/map-serial.zip" }),
  };
  const database = {
    mediaProcessingJob: {
      findFirst: async () => { findFirstCalls += 1; return job; },
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => job,
      update: (input: unknown) => input,
    },
    mapAsset: {
      updateMany: (input: unknown) => input,
      update: (input: unknown) => input,
    },
    auditLog: { create: (input: unknown) => input },
    $transaction: async (operations: unknown[]) => operations,
  };
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-map-serial-"));
  await mkdir(join(storageRoot, "map-assets"), { recursive: true });
  await writeFile(join(storageRoot, "map-assets/map-serial.zip"), "source");
  const runner = new JobRunner(database as never, storageRoot, {
    extractTilePackage: async ({ outputDirectory }) => {
      notifyStarted();
      await gate;
      await mkdir(outputDirectory, { recursive: true });
      return mapMetadata;
    },
  });

  try {
    const first = runner.processNext();
    await started;
    const second = runner.processNext();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(findFirstCalls, 1);
    release();
    assert.deepEqual(await Promise.all([first, second]), [true, false]);
  } finally {
    release();
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test("failed map processing cleans partial outputs, preserves the source and never deactivates the old map", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-map-failed-"));
  const sourcePath = join(storageRoot, "map-assets/map-failed.zip");
  await mkdir(join(storageRoot, "map-assets"), { recursive: true });
  await writeFile(sourcePath, "source-retained");
  const job = {
    id: "job-map-failed",
    projectId: "jinshan",
    jobType: "map_tile_package",
    inputJson: JSON.stringify({ mapAssetId: "map-failed", sourcePath: "storage/map-assets/map-failed.zip" }),
  };
  const mapUpdates: Array<Record<string, unknown>> = [];
  const jobUpdates: Array<Record<string, unknown>> = [];
  let deactivateCalls = 0;
  const database = {
    mediaProcessingJob: {
      findFirst: async () => job,
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => job,
      update: (input: Record<string, unknown>) => { jobUpdates.push(input); return input; },
    },
    mapAsset: {
      updateMany: (input: unknown) => { deactivateCalls += 1; return input; },
      update: (input: Record<string, unknown>) => { mapUpdates.push(input); return input; },
    },
    auditLog: { create: (input: unknown) => input },
    $transaction: async (operations: unknown[]) => operations,
  };
  const runner = new JobRunner(database as never, storageRoot, {
    extractTilePackage: async ({ outputDirectory }) => {
      await mkdir(outputDirectory, { recursive: true });
      await writeFile(join(outputDirectory, "partial.png"), "partial");
      throw new Error("瓦片包包含无效路径");
    },
  });

  try {
    assert.equal(await runner.processNext(), true);
    assert.equal(deactivateCalls, 0);
    assert.deepEqual(mapUpdates[0].where, { id: "map-failed", projectId: "jinshan" });
    assert.equal((mapUpdates[0].data as Record<string, unknown>).processStatus, "failed");
    assert.match(String((mapUpdates[0].data as Record<string, unknown>).errorMessage), /无效路径/);
    assert.equal((jobUpdates[0].data as Record<string, unknown>).status, "failed");
    await assert.rejects(() => stat(join(storageRoot, "map-tiles/.tmp-map-failed")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(storageRoot, "map-tiles/map-failed")), { code: "ENOENT" });
    assert.equal(await readFile(sourcePath, "utf8"), "source-retained");
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test("activation transaction failure rolls back the old map and cleans the renamed output", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-map-activation-failed-"));
  await mkdir(join(storageRoot, "map-assets"), { recursive: true });
  await writeFile(join(storageRoot, "map-assets/map-activation-failed.zip"), "source-retained");
  const job = {
    id: "job-map-activation-failed",
    projectId: "jinshan",
    jobType: "map_tile_package",
    inputJson: JSON.stringify({
      mapAssetId: "map-activation-failed",
      sourcePath: "storage/map-assets/map-activation-failed.zip",
    }),
  };
  let transactionCalls = 0;
  const mapUpdates: Array<Record<string, unknown>> = [];
  const database = {
    mediaProcessingJob: {
      findFirst: async () => job,
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => job,
      update: (input: Record<string, unknown>) => input,
    },
    mapAsset: {
      updateMany: (input: Record<string, unknown>) => input,
      update: (input: Record<string, unknown>) => { mapUpdates.push(input); return input; },
    },
    auditLog: { create: (input: unknown) => input },
    $transaction: async (operations: unknown[]) => {
      transactionCalls += 1;
      if (transactionCalls === 1) throw new Error("激活事务失败");
      return operations;
    },
  };
  const runner = new JobRunner(database as never, storageRoot, {
    extractTilePackage: async ({ outputDirectory }) => {
      await mkdir(join(outputDirectory, "1/0"), { recursive: true });
      await writeFile(join(outputDirectory, "1/0/0.png"), "tile");
      return mapMetadata;
    },
  });

  try {
    assert.equal(await runner.processNext(), true);
    assert.equal(transactionCalls, 2);
    const failedUpdate = mapUpdates.find((input) => (
      (input.data as Record<string, unknown>).processStatus === "failed"
    ));
    assert.ok(failedUpdate);
    assert.match(String((failedUpdate.data as Record<string, unknown>).errorMessage), /激活事务失败/);
    await assert.rejects(() => stat(join(storageRoot, "map-tiles/map-activation-failed")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(storageRoot, "map-tiles/.tmp-map-activation-failed")), { code: "ENOENT" });
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
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
