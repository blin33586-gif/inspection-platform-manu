import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MapAssetUploadService } from "./map-asset-upload.service.js";

async function runUpload(fileName: string) {
  const tempDirectory = await mkdtemp(join(tmpdir(), "xunjianbao-map-upload-"));
  const tempPath = join(tempDirectory, fileName);
  await writeFile(tempPath, "map-source");

  const createCalls: Array<{ data: Record<string, unknown> }> = [];
  const upsertCalls: Array<Record<string, unknown>> = [];
  const database = {
    mapAsset: {
      create: async (input: { data: Record<string, unknown> }) => {
        createCalls.push(input);
        return {
          id: input.data.id,
          name: input.data.name,
          mapType: input.data.mapType,
          sourceType: input.data.sourceType,
          fileName: input.data.fileName,
          originalFileName: input.data.originalFileName,
          mimeType: input.data.mimeType,
          fileSize: input.data.fileSize,
          processStatus: input.data.processStatus,
          hotAreaCount: input.data.hotAreaCount,
        };
      },
    },
    mediaProcessingJob: {
      upsert: async (input: Record<string, unknown>) => {
        upsertCalls.push(input);
      },
    },
  };
  const auditService = { record: async () => undefined };
  const service = new MapAssetUploadService(database as never, auditService as never);

  try {
    await service.createFromUpload({
      filename: fileName,
      originalname: fileName,
      mimetype: fileName.endsWith(".tif") ? "image/tiff" : "image/png",
      path: tempPath,
      size: 10,
    }, {});

    return { createCalls, upsertCalls };
  } finally {
    const storedPath = createCalls[0]?.data.storagePath;
    if (typeof storedPath === "string") await rm(storedPath, { force: true });
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

test("queues a TIF upload once with a durable tile job", async () => {
  const { createCalls, upsertCalls } = await runUpload("street-base.tif");

  assert.equal(createCalls.length, 1);
  assert.equal(upsertCalls.length, 1);
  assert.deepEqual(upsertCalls[0].where, { dedupeKey: `tiff_tile:${createCalls[0].data.id}:v1` });
  assert.deepEqual(upsertCalls[0].create, {
    projectId: "quyang",
    id: `job-tiff-${createCalls[0].data.id}`,
    jobType: "tiff_tile",
    status: "queued",
    dedupeKey: `tiff_tile:${createCalls[0].data.id}:v1`,
    inputJson: JSON.stringify({
      mapAssetId: createCalls[0].data.id,
      sourcePath: createCalls[0].data.storagePath,
      minZoom: 16,
      maxZoom: 19,
    }),
  });
});

test("does not queue tile processing for a direct image upload", async () => {
  const { upsertCalls } = await runUpload("street-base.png");
  assert.equal(upsertCalls.length, 0);
});
