import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InspectionTaskDeletionService } from "./inspection-task-deletion.service.js";
import { runAsMember } from "../../test-support/auth-context.js";

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

test("purges a task, its owned records, and its storage files", async () => {
  const root = await mkdtemp(join(tmpdir(), "xunjianbao-task-delete-"));
  const storageRoot = join(root, "storage");
  await mkdir(join(storageRoot, "media", "videos"), { recursive: true });
  await mkdir(join(storageRoot, "media", "frames"), { recursive: true });
  await mkdir(join(storageRoot, "media", "task-images", "task-1"), { recursive: true });
  await mkdir(join(storageRoot, "issues", "cards"), { recursive: true });
  await mkdir(join(storageRoot, "issues"), { recursive: true });
  await mkdir(join(storageRoot, "reports"), { recursive: true });
  const files = [
    join(storageRoot, "media", "videos", "media-source.mp4"),
    join(storageRoot, "media", "frames", "media-frame.jpg"),
    join(storageRoot, "media", "task-images", "task-1", "media-direct.jpg"),
    join(storageRoot, "media", "task-images", "task-1", "media-direct-preview.jpg"),
    join(storageRoot, "issues", "cards", "issue-1.png"),
    join(storageRoot, "issues", "issue-attachment.jpg"),
    join(storageRoot, "reports", "report-1.pdf"),
  ];
  await Promise.all(files.map((file) => writeFile(file, "asset")));

  const calls: string[] = [];
  const database = {
    inspectionTask: {
      findUnique: async () => ({
        id: "task-1",
        name: "测试任务",
        sourceMediaId: "media-source",
        photos: [{ id: "photo-frame", mediaAssetId: "media-frame" }],
        report: { id: "rp-1", storagePath: "storage/reports/report-1.pdf" },
      }),
      delete: async ({ where }: { where: { id: string } }) => (calls.push(`task:${where.id}`), { id: where.id }),
    },
    mediaProcessingJob: {
      findMany: async () => [
        {
          id: "job-1",
          mediaId: "media-source",
          inputJson: JSON.stringify({ inspectionTaskId: "task-1", mediaId: "media-source" }),
          outputJson: JSON.stringify({ frameMediaIds: ["media-frame"] }),
        },
        {
          id: "job-2",
          mediaId: null,
          inputJson: JSON.stringify({ inspectionTaskId: "task-1", mediaIds: ["media-direct"] }),
          outputJson: null,
        },
      ],
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => (calls.push(`jobs:${where.id.in.join(",")}`), { count: where.id.in.length }),
    },
    mediaAsset: {
      findMany: async () => [
        {
          id: "media-source",
          storagePath: "storage/media/videos/media-source.mp4",
          previewStoragePath: null,
        },
        {
          id: "media-frame",
          storagePath: "storage/media/frames/media-frame.jpg",
          previewStoragePath: null,
        },
        {
          id: "media-direct",
          storagePath: "storage/media/task-images/task-1/media-direct.jpg",
          previewStoragePath: "storage/media/task-images/task-1/media-direct-preview.jpg",
        },
      ],
      deleteMany: async () => (calls.push("media"), { count: 3 }),
    },
    inspectionReport: {
      deleteMany: async ({ where }: { where: { taskId: string } }) => (calls.push(`reports:${where.taskId}`), { count: 1 }),
    },
    issue: {
      findMany: async () => [{ id: "issue-1", cardStoragePath: "storage/issues/cards/issue-1.png" }],
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => (calls.push(`issues:${where.id.in.join(",")}`), { count: 1 }),
    },
    issueAttachment: {
      findMany: async () => [{ id: "attachment-1", storagePath: "storage/issues/issue-attachment.jpg" }],
      deleteMany: async ({ where }: { where: { issueId: { in: string[] } } }) => (calls.push(`attachments:${where.issueId.in.join(",")}`), { count: 1 }),
    },
    taskPhoto: {
      deleteMany: async ({ where }: { where: { taskId: string } }) => (calls.push(`photos:${where.taskId}`), { count: 1 }),
    },
    auditLog: { create: async ({ data }: { data: { action: string; summary: string } }) => (calls.push(`${data.action}:${data.summary}`), data) },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(database),
  };

  const service = new InspectionTaskDeletionService(database as never, storageRoot);
  const result = await runAsMember(() => service.purge("task-1"));

  assert.deepEqual(result, {
    taskId: "task-1",
    deletedReportCount: 1,
    deletedPhotoCount: 1,
    deletedMediaCount: 3,
    deletedJobCount: 2,
    deletedIssueCount: 1,
  });
  assert.deepEqual(calls, [
    "reports:task-1",
    "attachments:issue-1",
    "issues:issue-1",
    "jobs:job-1,job-2",
    "media",
    "photos:task-1",
    "task:task-1",
    "inspectionTask.purge:彻底删除任务「测试任务」，清理 1 张照片、1 份报告、1 个关联问题、3 个素材文件、2 个后台任务",
  ]);
  assert.deepEqual(await Promise.all(files.map(exists)), [false, false, false, false, false, false, false]);
});

test("rejects deleting a missing task", async () => {
  const database = {
    inspectionTask: { findUnique: async () => null },
    mediaProcessingJob: { findMany: async () => [] },
    mediaAsset: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    inspectionReport: { deleteMany: async () => ({ count: 0 }) },
    issue: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    issueAttachment: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    taskPhoto: { deleteMany: async () => ({ count: 0 }) },
    auditLog: { create: async () => undefined },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(database),
  };

  const service = new InspectionTaskDeletionService(database as never, join(tmpdir(), "missing-storage"));

  await assert.rejects(service.purge("missing-task"), /巡检任务不存在/);
});
