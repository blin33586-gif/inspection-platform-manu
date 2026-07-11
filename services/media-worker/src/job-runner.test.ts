import assert from "node:assert/strict";
import test from "node:test";
import { JobRunner } from "./job-runner.js";

test("processes an archive extraction job into child media assets", async () => {
  const completedUpdates: Array<Record<string, unknown>> = [];
  const createdAssets: Array<Record<string, unknown>> = [];
  const findFirstCalls: Array<Record<string, unknown>> = [];
  const job = {
    id: "job-archive-media-1",
    jobType: "archive_extract",
    status: "queued",
    inputJson: JSON.stringify({ mediaId: "media-1", sourcePath: "storage/media/archives/media-1.zip" }),
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
    in: ["tiff_tile", "frame_extract", "archive_extract"],
  });
  const assetData = createdAssets[0].data as Array<Record<string, unknown>>;
  assert.equal(assetData[0].kind, "image");
  assert.equal(assetData[0].parentMediaId, "media-1");
  const completed = completedUpdates.find((input) => (
    (input.data as Record<string, unknown>).status === "completed"
  ));
  assert.ok(completed);
  assert.match(String((completed.data as Record<string, unknown>).outputJson), /"imageCount":1/);
});
