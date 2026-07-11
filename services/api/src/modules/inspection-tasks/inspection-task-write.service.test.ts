import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InspectionTaskWriteService } from "./inspection-task-write.service.js";
import type { TaskUploadFile } from "./inspection-task-input.js";

function createDatabase() {
  const calls = {
    tasks: [] as Array<Record<string, unknown>>,
    assets: [] as Array<Record<string, unknown>>,
    assetBatches: [] as Array<Array<Record<string, unknown>>>,
    photoBatches: [] as Array<Array<Record<string, unknown>>>,
    jobs: [] as Array<Record<string, unknown>>,
    audits: [] as Array<Record<string, unknown>>,
  };
  const database = {
    inspectionTask: { create: async ({ data }: { data: Record<string, unknown> }) => (calls.tasks.push(data), data) },
    mediaAsset: {
      create: async ({ data }: { data: Record<string, unknown> }) => (calls.assets.push(data), data),
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => (calls.assetBatches.push(data), { count: data.length }),
    },
    taskPhoto: { createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => (calls.photoBatches.push(data), { count: data.length }) },
    mediaProcessingJob: { create: async ({ data }: { data: Record<string, unknown> }) => (calls.jobs.push(data), data) },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => (calls.audits.push(data), data) },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(database),
  };
  return { database, calls };
}

async function makeUpload(directory: string, name: string): Promise<TaskUploadFile> {
  const path = join(directory, name);
  await writeFile(path, `content-${name}`);
  return { filename: name, originalname: name, mimetype: "application/octet-stream", path, size: 20 };
}

test("creates video and archive tasks with mandatory processing jobs", async () => {
  const root = await mkdtemp(join(tmpdir(), "xunjianbao-task-write-"));
  const videoInput = await makeUpload(root, "flight.mp4");
  const archiveInput = await makeUpload(root, "photos.zip");
  const { database, calls } = createDatabase();
  const service = new InspectionTaskWriteService(database as never, join(root, "storage"));

  try {
    await service.create({ name: "视频任务", taskDate: "2026-07-11", sourceType: "drone", inputType: "video", intervalSeconds: "2" }, [videoInput]);
    await service.create({ name: "图片包任务", taskDate: "2026-07-11", sourceType: "manual", inputType: "archive" }, [archiveInput]);

    assert.deepEqual(calls.tasks.map((item) => item.inputType), ["video", "archive"]);
    assert.deepEqual(calls.jobs.map((item) => item.jobType), ["frame_extract", "archive_extract"]);
    assert.equal(calls.tasks.every((item) => !("archiveObjectId" in item)), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("creates one ready task and pending task photos for multiple direct images", async () => {
  const root = await mkdtemp(join(tmpdir(), "xunjianbao-task-images-"));
  const images = [await makeUpload(root, "a.jpg"), await makeUpload(root, "b.png")];
  const { database, calls } = createDatabase();
  const service = new InspectionTaskWriteService(database as never, join(root, "storage"));

  try {
    const result = await service.create({ name: "图片任务", taskDate: "2026-07-11", sourceType: "glasses", inputType: "images" }, images);

    assert.equal(result.processStatus, "ready_for_distribution");
    assert.equal(calls.tasks[0].photoCount, 2);
    assert.equal(calls.tasks[0].pendingPhotoCount, 2);
    assert.equal(calls.assetBatches[0].length, 2);
    assert.equal(calls.photoBatches[0].length, 2);
    assert.equal(calls.photoBatches[0].every((item) => item.distributionStatus === "pending" && item.archiveObjectId === null), true);
    assert.equal(calls.jobs.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
