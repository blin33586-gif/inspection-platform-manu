import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MediaService } from "./media.service.js";
import { runAsMember } from "../../test-support/auth-context.js";

function createService() {
  const upsertCalls: Array<Record<string, unknown>> = [];
  const database = {
    mediaAsset: {
      findUnique: async () => ({
        id: "media-video-1",
        kind: "video",
        storagePath: "storage/media/videos/media-video-1.mp4",
      }),
    },
    mediaProcessingJob: {
      upsert: async (input: Record<string, unknown>) => {
        upsertCalls.push(input);
        return { id: "job-frame-media-video-1-3", status: "queued", progress: 0 };
      },
    },
  };
  return { service: new MediaService(database as never), upsertCalls };
}

test("creates an idempotent frame extraction job", async () => {
  const { service, upsertCalls } = createService();

  const job = await service.createFrameExtractionJob("media-video-1", 3);

  assert.equal(job.id, "job-frame-media-video-1-3");
  assert.deepEqual(upsertCalls[0].where, { dedupeKey: "frame_extract:media-video-1:3" });
  assert.deepEqual(upsertCalls[0].create, {
    projectId: "quyang",
    id: "job-frame-media-video-1-3",
    jobType: "frame_extract",
    status: "queued",
    dedupeKey: "frame_extract:media-video-1:3",
    mediaId: "media-video-1",
    inputJson: JSON.stringify({
      mediaId: "media-video-1",
      sourcePath: "storage/media/videos/media-video-1.mp4",
      intervalSeconds: 3,
    }),
  });
});

test("accepts one-to-five-second frame intervals and rejects values outside the range", async () => {
  const { service, upsertCalls } = createService();

  await service.createFrameExtractionJob("media-video-1", 1);
  await service.createFrameExtractionJob("media-video-1", 5);

  assert.equal(upsertCalls.length, 2);
  assert.deepEqual(upsertCalls.map((call) => call.where), [
    { dedupeKey: "frame_extract:media-video-1:1" },
    { dedupeKey: "frame_extract:media-video-1:5" },
  ]);
  await assert.rejects(() => service.createFrameExtractionJob("media-video-1", 0), /1 至 5 秒/);
  await assert.rejects(() => service.createFrameExtractionJob("media-video-1", 6), /1 至 5 秒/);
});

test("stores an uploaded MOV video and automatically queues extraction", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "xunjianbao-video-upload-"));
  const tempPath = join(tempDirectory, "flight.mov");
  await writeFile(tempPath, "video-source");
  const assetCreates: Array<{ data: Record<string, unknown> }> = [];
  const jobUpserts: Array<Record<string, unknown>> = [];
  const database = {
    mediaAsset: {
      create: async (input: { data: Record<string, unknown> }) => {
        assetCreates.push(input);
        return input.data;
      },
    },
    mediaProcessingJob: {
      upsert: async (input: Record<string, unknown>) => {
        jobUpserts.push(input);
        return input.create;
      },
    },
    auditLog: { create: async () => undefined },
  };
  const service = new MediaService(database as never);

  try {
    const result = await runAsMember(() => service.createVideoFromUpload({
      filename: "flight.mov",
      originalname: "DJI_FLIGHT.MOV",
      mimetype: "video/quicktime",
      path: tempPath,
      size: 12,
    }, 4));

    assert.equal(result.asset.kind, "video");
    assert.equal(result.asset.originalFileName, "DJI_FLIGHT.MOV");
    assert.equal(jobUpserts.length, 1);
    assert.match(String((jobUpserts[0].create as Record<string, unknown>).dedupeKey), /^frame_extract:media-.*:4$/);
  } finally {
    const storagePath = assetCreates[0]?.data.storagePath;
    if (typeof storagePath === "string") await rm(storagePath, { force: true });
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test("requeues a failed frame extraction job", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const database = {
    mediaProcessingJob: {
      findUnique: async () => ({ id: "job-frame-1", jobType: "frame_extract", status: "failed" }),
      update: async (input: Record<string, unknown>) => {
        updates.push(input);
        return { id: "job-frame-1", status: "queued", progress: 0 };
      },
    },
  };
  const service = new MediaService(database as never);

  const job = await service.retryJob("job-frame-1");

  assert.equal(job.status, "queued");
  assert.deepEqual(updates[0].data, {
    status: "queued",
    progress: 0,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
  });
});

test("stores an uploaded ZIP and automatically queues archive extraction", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "xunjianbao-archive-upload-"));
  const tempPath = join(tempDirectory, "photos.zip");
  await writeFile(tempPath, "zip-source");
  const assetCreates: Array<{ data: Record<string, unknown> }> = [];
  const jobUpserts: Array<Record<string, unknown>> = [];
  const database = {
    mediaAsset: {
      create: async (input: { data: Record<string, unknown> }) => {
        assetCreates.push(input);
        return input.data;
      },
    },
    mediaProcessingJob: {
      upsert: async (input: Record<string, unknown>) => {
        jobUpserts.push(input);
        return input.create;
      },
    },
    auditLog: { create: async () => undefined },
  };
  const service = new MediaService(database as never);

  try {
    const result = await runAsMember(() => service.createMediaFromUpload({
      filename: "photos.zip",
      originalname: "曲阳巡检照片.zip",
      mimetype: "application/zip",
      path: tempPath,
      size: 18,
    }, 3));

    assert.equal(result.asset.kind, "image_bundle");
    assert.equal(result.asset.originalFileName, "曲阳巡检照片.zip");
    assert.equal((jobUpserts[0].create as Record<string, unknown>).jobType, "archive_extract");
    assert.match(String((jobUpserts[0].create as Record<string, unknown>).dedupeKey), /^archive_extract:media-/);
  } finally {
    const storagePath = assetCreates[0]?.data.storagePath;
    if (typeof storagePath === "string") await rm(storagePath, { force: true });
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test("lists top-level media tasks with their latest processing job", async () => {
  const findManyCalls: Array<Record<string, unknown>> = [];
  const database = {
    mediaAsset: {
      findMany: async (input: Record<string, unknown>) => {
        findManyCalls.push(input);
        return [];
      },
    },
  };
  const service = new MediaService(database as never);

  await service.listTasks();

  assert.deepEqual(findManyCalls[0].where, {
    projectId: "quyang",
    parentMediaId: null,
    kind: { in: ["video", "image_bundle"] },
  });
  assert.deepEqual(findManyCalls[0].include, {
    jobs: { orderBy: { createdAt: "desc" }, take: 1 },
    frames: { orderBy: [{ videoTimestampMs: "asc" }, { createdAt: "asc" }], take: 1 },
  });
});

test("lists task children in preview order", async () => {
  const findManyCalls: Array<Record<string, unknown>> = [];
  const database = {
    mediaAsset: {
      findUnique: async () => ({ id: "media-parent-1", kind: "video" }),
      findMany: async (input: Record<string, unknown>) => {
        findManyCalls.push(input);
        return [];
      },
    },
  };
  const service = new MediaService(database as never);

  await service.listChildren("media-parent-1");

  assert.deepEqual(findManyCalls[0], {
    where: { projectId: "quyang", parentMediaId: "media-parent-1", kind: { in: ["frame", "image"] } },
    orderBy: [{ videoTimestampMs: "asc" }, { createdAt: "asc" }],
  });
});

test("returns one persisted media asset", async () => {
  const findUniqueCalls: Array<Record<string, unknown>> = [];
  const database = {
    mediaAsset: {
      findUnique: async (input: Record<string, unknown>) => {
        findUniqueCalls.push(input);
        return { id: "media-video-1", kind: "video", originalFileName: "flight.mp4", jobs: [], frames: [] };
      },
    },
  };
  const service = new MediaService(database as never);

  const asset = await service.getAsset("media-video-1");

  assert.equal(asset.id, "media-video-1");
  assert.deepEqual(findUniqueCalls[0], {
    where: { id: "media-video-1", projectId: "quyang" },
    include: {
      jobs: { orderBy: { createdAt: "desc" }, take: 1 },
      frames: { orderBy: [{ videoTimestampMs: "asc" }, { createdAt: "asc" }], take: 1 },
    },
  });
});

test("requeues a failed archive extraction job", async () => {
  const database = {
    mediaProcessingJob: {
      findUnique: async () => ({ id: "job-archive-1", jobType: "archive_extract", status: "failed" }),
      update: async () => ({ id: "job-archive-1", status: "queued", progress: 0 }),
    },
  };
  const service = new MediaService(database as never);

  const job = await service.retryJob("job-archive-1");

  assert.equal(job.status, "queued");
});

test("requeues a failed direct image preparation job", async () => {
  const database = {
    mediaProcessingJob: {
      findUnique: async () => ({ id: "job-image-1", jobType: "image_prepare", status: "failed" }),
      update: async () => ({ id: "job-image-1", status: "queued", progress: 0 }),
    },
  };
  const service = new MediaService(database as never);

  const job = await service.retryJob("job-image-1");

  assert.equal(job.status, "queued");
});
