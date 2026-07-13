import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
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

function queuedMapAsset(
  id: string,
  projectId: string,
  storagePath: string,
  overrides: Partial<Record<"sourceType" | "processStatus", string>> = {},
) {
  return {
    id,
    projectId,
    storagePath,
    sourceType: "tile",
    processStatus: "queued",
    ...overrides,
  };
}

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
      findUnique: async () => queuedMapAsset("map-new", "jinshan", "storage/map-assets/map-new.zip"),
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
    assert.match(outputDirectories[0], /map-tiles\/\.tmp-map-new-job-map-new-[a-f0-9-]+$/);
    assert.deepEqual((findFirstCalls[0].where as Record<string, unknown>).jobType, {
      in: ["tiff_tile", "map_tile_package", "frame_extract", "archive_extract", "image_prepare"],
    });
    assert.deepEqual(deactivations.find((input) => (input.where as Record<string, unknown>).isActive === true), {
      where: { projectId: "jinshan", isActive: true },
      data: { isActive: false },
    });
    assert.deepEqual(deactivations.find((input) => (input.data as Record<string, unknown>).processStatus === "running"), {
      where: { id: "map-new", projectId: "jinshan", processStatus: "queued" },
      data: { processStatus: "running", errorMessage: null },
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
      findUnique: async () => queuedMapAsset("map-serial", "jinshan", "storage/map-assets/map-serial.zip"),
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
      findUnique: async () => queuedMapAsset("map-failed", "jinshan", "storage/map-assets/map-failed.zip"),
      updateMany: (input: Record<string, unknown>) => {
        const where = input.where as Record<string, unknown>;
        if (where.isActive === true) deactivateCalls += 1;
        else mapUpdates.push(input);
        return input;
      },
      update: (input: Record<string, unknown>) => { mapUpdates.push(input); return input; },
    },
    auditLog: { create: (input: unknown) => input },
    $transaction: async (operations: unknown[]) => operations,
  };
  const runner = new JobRunner(database as never, storageRoot, {
    extractTilePackage: async ({ outputDirectory }) => {
      await mkdir(outputDirectory, { recursive: true });
      await writeFile(join(outputDirectory, "partial.png"), "partial");
      throw new Error("gdal2tiles.py failed: /Users/worker/private/source.tif\nTraceback: secret");
    },
  });

  try {
    assert.equal(await runner.processNext(), true);
    assert.equal(deactivateCalls, 0);
    const failedUpdate = mapUpdates.find((input) => (
      (input.data as Record<string, unknown>).processStatus === "failed"
    ));
    assert.ok(failedUpdate);
    assert.deepEqual(failedUpdate.where, {
      id: "map-failed",
      projectId: "jinshan",
      processStatus: { in: ["queued", "running"] },
    });
    assert.equal(
      (failedUpdate.data as Record<string, unknown>).errorMessage,
      "地图处理失败，请重新上传；如仍失败请联系管理员",
    );
    assert.equal((jobUpdates[0].data as Record<string, unknown>).status, "failed");
    assert.equal(
      (jobUpdates[0].data as Record<string, unknown>).errorMessage,
      "地图处理失败，请重新上传；如仍失败请联系管理员",
    );
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
      findUnique: async () => queuedMapAsset(
        "map-activation-failed",
        "jinshan",
        "storage/map-assets/map-activation-failed.zip",
      ),
      updateMany: (input: Record<string, unknown>) => { mapUpdates.push(input); return input; },
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
    assert.equal(transactionCalls, 1);
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

test("rejects a map asset id that does not belong to the job project before reading its source", async () => {
  const job = {
    id: "job-cross-project",
    projectId: "jinshan",
    jobType: "map_tile_package",
    inputJson: JSON.stringify({
      mapAssetId: "map-from-another-project",
      sourcePath: "storage/map-assets/other.zip",
    }),
  };
  const assetLookups: Array<Record<string, unknown>> = [];
  const jobUpdates: Array<Record<string, unknown>> = [];
  let extractorCalled = false;
  const database = {
    mediaProcessingJob: {
      findFirst: async () => job,
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => job,
      update: async (input: Record<string, unknown>) => { jobUpdates.push(input); return input; },
    },
    mapAsset: {
      findUnique: async (input: Record<string, unknown>) => { assetLookups.push(input); return null; },
      updateMany: async (input: Record<string, unknown>) => input,
      update: async (input: Record<string, unknown>) => input,
    },
    auditLog: { create: async (input: unknown) => input },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  const runner = new JobRunner(database as never, "/tmp/xunjianbao-storage", {
    extractTilePackage: async () => {
      extractorCalled = true;
      throw new Error("handler should not run");
    },
  });

  assert.equal(await runner.processNext(), true);
  assert.deepEqual(assetLookups[0], {
    where: { id: "map-from-another-project", projectId: "jinshan" },
  });
  assert.equal(extractorCalled, false);
  assert.match(String((jobUpdates[0].data as Record<string, unknown>).errorMessage), /地图资产.*不存在/);
});

test("rejects a payload source path that differs from the project map asset storage path", async () => {
  const job = {
    id: "job-path-tampered",
    projectId: "jinshan",
    jobType: "map_tile_package",
    inputJson: JSON.stringify({
      mapAssetId: "map-path-tampered",
      sourcePath: "storage/map-assets/other-project.zip",
    }),
  };
  const jobUpdates: Array<Record<string, unknown>> = [];
  let extractorCalled = false;
  const database = {
    mediaProcessingJob: {
      findFirst: async () => job,
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => job,
      update: async (input: Record<string, unknown>) => { jobUpdates.push(input); return input; },
    },
    mapAsset: {
      findUnique: async () => queuedMapAsset(
        "map-path-tampered",
        "jinshan",
        "storage/map-assets/map-path-tampered.zip",
      ),
      updateMany: async (input: Record<string, unknown>) => input,
      update: async (input: Record<string, unknown>) => input,
    },
    auditLog: { create: async (input: unknown) => input },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  const runner = new JobRunner(database as never, "/tmp/xunjianbao-storage", {
    extractTilePackage: async () => {
      extractorCalled = true;
      throw new Error("handler should not run");
    },
  });

  assert.equal(await runner.processNext(), true);
  assert.equal(extractorCalled, false);
  assert.match(String((jobUpdates[0].data as Record<string, unknown>).errorMessage), /源文件路径.*不匹配/);
});

test("rejects map jobs whose asset source type or process status is not allowed", async () => {
  for (const [label, overrides, expected] of [
    ["源类型", { sourceType: "tiff" }, /任务类型.*不匹配/],
    ["处理状态", { processStatus: "published" }, /处理状态不允许/],
  ] as const) {
    const job = {
      id: `job-invalid-${label}`,
      projectId: "jinshan",
      jobType: "map_tile_package",
      inputJson: JSON.stringify({
        mapAssetId: "map-invalid-state",
        sourcePath: "storage/map-assets/map-invalid-state.zip",
      }),
    };
    const jobUpdates: Array<Record<string, unknown>> = [];
    const assetFailureWrites: Array<Record<string, unknown>> = [];
    let extractorCalled = false;
    const database = {
      mediaProcessingJob: {
        findFirst: async () => job,
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => job,
        update: async (input: Record<string, unknown>) => { jobUpdates.push(input); return input; },
      },
      mapAsset: {
        findUnique: async () => queuedMapAsset(
          "map-invalid-state",
          "jinshan",
          "storage/map-assets/map-invalid-state.zip",
          overrides,
        ),
        updateMany: async (input: Record<string, unknown>) => { assetFailureWrites.push(input); return input; },
        update: async (input: Record<string, unknown>) => input,
      },
      auditLog: { create: async (input: unknown) => input },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    };
    const runner = new JobRunner(database as never, "/tmp/xunjianbao-storage", {
      extractTilePackage: async () => {
        extractorCalled = true;
        throw new Error("handler should not run");
      },
    });

    assert.equal(await runner.processNext(), true);
    assert.equal(extractorCalled, false);
    assert.match(String((jobUpdates[0].data as Record<string, unknown>).errorMessage), expected);
    assert.deepEqual(assetFailureWrites[0].where, {
      id: "map-invalid-state",
      projectId: "jinshan",
      processStatus: "queued",
    });
  }
});

test("preserves the processing error when temporary-output cleanup also fails", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-map-cleanup-failed-"));
  const job = {
    id: "job-cleanup-failed",
    projectId: "jinshan",
    jobType: "map_tile_package",
    inputJson: JSON.stringify({
      mapAssetId: "map-cleanup-failed",
      sourcePath: "storage/map-assets/map-cleanup-failed.zip",
    }),
  };
  const jobUpdates: Array<Record<string, unknown>> = [];
  let cleanupAttempts = 0;
  const database = {
    mediaProcessingJob: {
      findFirst: async () => job,
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => job,
      update: async (input: Record<string, unknown>) => { jobUpdates.push(input); return input; },
    },
    mapAsset: {
      findUnique: async () => queuedMapAsset(
        "map-cleanup-failed",
        "jinshan",
        "storage/map-assets/map-cleanup-failed.zip",
      ),
      updateMany: async (input: Record<string, unknown>) => input,
      update: async (input: Record<string, unknown>) => input,
    },
    auditLog: { create: async (input: unknown) => input },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  const runner = new JobRunner(database as never, storageRoot, {
    extractTilePackage: async ({ outputDirectory }) => {
      await mkdir(outputDirectory, { recursive: true });
      throw new Error("原始处理错误");
    },
    removePath: () => {
      cleanupAttempts += 1;
      throw new Error("清理失败");
    },
  });

  try {
    assert.equal(await runner.processNext(), true);
    assert.equal(cleanupAttempts, 1);
    assert.equal((jobUpdates[0].data as Record<string, unknown>).errorMessage, "原始处理错误");
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test("marks the job failed even when persisting the map asset error fails", async () => {
  const job = {
    id: "job-asset-update-failed",
    projectId: "jinshan",
    jobType: "map_tile_package",
    inputJson: JSON.stringify({
      mapAssetId: "map-asset-update-failed",
      sourcePath: "storage/map-assets/map-asset-update-failed.zip",
    }),
  };
  const jobUpdates: Array<Record<string, unknown>> = [];
  let failureTransactionCalls = 0;
  const database = {
    mediaProcessingJob: {
      findFirst: async () => job,
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => job,
      update: async (input: Record<string, unknown>) => { jobUpdates.push(input); return input; },
    },
    mapAsset: {
      findUnique: async () => queuedMapAsset(
        "map-asset-update-failed",
        "jinshan",
        "storage/map-assets/map-asset-update-failed.zip",
      ),
      updateMany: (input: Record<string, unknown>) => {
        if ((input.data as Record<string, unknown>).processStatus === "failed") {
          throw new Error("地图错误状态写入失败");
        }
        return input;
      },
      update: () => { throw new Error("地图错误状态写入失败"); },
    },
    auditLog: { create: async (input: unknown) => input },
    $transaction: async (operations: Promise<unknown>[]) => {
      failureTransactionCalls += 1;
      return Promise.all(operations);
    },
  };
  const runner = new JobRunner(database as never, "/tmp/xunjianbao-storage", {
    extractTilePackage: async () => { throw new Error("瓦片处理失败"); },
  });

  assert.equal(await runner.processNext(), true);
  assert.equal(failureTransactionCalls, 0);
  assert.equal((jobUpdates[0].data as Record<string, unknown>).status, "failed");
  assert.equal((jobUpdates[0].data as Record<string, unknown>).errorMessage, "瓦片处理失败");
});

test("never replaces or removes an existing final tile directory", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-map-final-exists-"));
  const finalDirectory = join(storageRoot, "map-tiles/map-final-exists");
  await mkdir(finalDirectory, { recursive: true });
  await writeFile(join(finalDirectory, "sentinel.txt"), "existing-published-map");
  const job = {
    id: "job-final-exists",
    projectId: "jinshan",
    jobType: "map_tile_package",
    inputJson: JSON.stringify({
      mapAssetId: "map-final-exists",
      sourcePath: "storage/map-assets/map-final-exists.zip",
    }),
  };
  const database = {
    mediaProcessingJob: {
      findFirst: async () => job,
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => job,
      update: async (input: Record<string, unknown>) => input,
    },
    mapAsset: {
      findUnique: async () => queuedMapAsset(
        "map-final-exists",
        "jinshan",
        "storage/map-assets/map-final-exists.zip",
      ),
      updateMany: async (input: Record<string, unknown>) => input,
      update: async (input: Record<string, unknown>) => input,
    },
    auditLog: { create: async (input: unknown) => input },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  const runner = new JobRunner(database as never, storageRoot, {
    extractTilePackage: async ({ outputDirectory }) => {
      await mkdir(join(outputDirectory, "1/0"), { recursive: true });
      await writeFile(join(outputDirectory, "1/0/0.png"), "new-tile");
      return mapMetadata;
    },
  });

  try {
    assert.equal(await runner.processNext(), true);
    assert.equal(await readFile(join(finalDirectory, "sentinel.txt"), "utf8"), "existing-published-map");
    assert.deepEqual((await readdir(join(storageRoot, "map-tiles"))).filter((name) => name.startsWith(".tmp-")), []);
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test("uses different job-scoped staging directories for two jobs targeting the same asset", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-map-distinct-staging-"));
  const jobs = ["job-map-a", "job-map-b"].map((id) => ({
    id,
    projectId: "jinshan",
    jobType: "map_tile_package",
    inputJson: JSON.stringify({
      mapAssetId: "map-same-asset",
      sourcePath: "storage/map-assets/map-same-asset.zip",
    }),
  }));
  let nextJob = 0;
  const outputDirectories: string[] = [];
  const database = {
    mediaProcessingJob: {
      findFirst: async () => jobs[nextJob++] ?? null,
      updateMany: async () => ({ count: 1 }),
      findUnique: async ({ where }: { where: { id: string } }) => jobs.find((job) => job.id === where.id) ?? null,
      update: async (input: Record<string, unknown>) => input,
    },
    mapAsset: {
      findUnique: async () => queuedMapAsset(
        "map-same-asset",
        "jinshan",
        "storage/map-assets/map-same-asset.zip",
      ),
      updateMany: async (input: Record<string, unknown>) => input,
      update: async (input: Record<string, unknown>) => input,
    },
    auditLog: { create: async (input: unknown) => input },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  const runner = new JobRunner(database as never, storageRoot, {
    extractTilePackage: async ({ outputDirectory }) => {
      outputDirectories.push(outputDirectory);
      throw new Error("故意停在 staging 阶段");
    },
  });

  try {
    assert.equal(await runner.processNext(), true);
    assert.equal(await runner.processNext(), true);
    assert.equal(outputDirectories.length, 2);
    assert.notEqual(outputDirectories[0], outputDirectories[1]);
    assert.match(outputDirectories[0], /job-map-a/);
    assert.match(outputDirectories[1], /job-map-b/);
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test("continues to the next queued job after a claim compare-and-swap loses a race", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-map-claim-race-"));
  const jobs = ["job-lost-race", "job-claimed"].map((id) => ({
    id,
    projectId: "jinshan",
    jobType: "map_tile_package",
    inputJson: JSON.stringify({
      mapAssetId: "map-claim-race",
      sourcePath: "storage/map-assets/map-claim-race.zip",
    }),
  }));
  let candidateIndex = 0;
  let claimAttempts = 0;
  const handledJobs: string[] = [];
  const database = {
    mediaProcessingJob: {
      findFirst: async () => jobs[candidateIndex++] ?? null,
      updateMany: async () => ({ count: ++claimAttempts === 1 ? 0 : 1 }),
      findUnique: async ({ where }: { where: { id: string } }) => jobs.find((job) => job.id === where.id) ?? null,
      update: async (input: Record<string, unknown>) => input,
    },
    mapAsset: {
      findUnique: async () => queuedMapAsset(
        "map-claim-race",
        "jinshan",
        "storage/map-assets/map-claim-race.zip",
      ),
      updateMany: async (input: Record<string, unknown>) => input,
      update: async (input: Record<string, unknown>) => input,
    },
    auditLog: { create: async (input: unknown) => input },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  const runner = new JobRunner(database as never, storageRoot, {
    extractTilePackage: async ({ outputDirectory }) => {
      handledJobs.push(outputDirectory);
      await mkdir(join(outputDirectory, "1/0"), { recursive: true });
      await writeFile(join(outputDirectory, "1/0/0.png"), "tile");
      return mapMetadata;
    },
  });

  try {
    assert.equal(await runner.processNext(), true);
    assert.equal(claimAttempts, 2);
    assert.match(handledJobs[0], /job-claimed/);
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
