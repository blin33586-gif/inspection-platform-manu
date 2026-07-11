import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MediaService } from "./media.service.js";

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

test("rejects a frame interval outside two to five seconds", async () => {
  const { service } = createService();
  await assert.rejects(() => service.createFrameExtractionJob("media-video-1", 1), /2 至 5 秒/);
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
    const result = await service.createVideoFromUpload({
      filename: "flight.mov",
      originalname: "DJI_FLIGHT.MOV",
      mimetype: "video/quicktime",
      path: tempPath,
      size: 12,
    }, 4);

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
