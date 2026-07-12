import assert from "node:assert/strict";
import test from "node:test";
import { TaskPhotoReadService, type TaskPhotoQuery } from "./task-photo-read.service.js";

test("lists pending task photos with a deterministic order and browser-safe media details", async () => {
  const calls: Array<{ method: string; input: Record<string, unknown> }> = [];
  const database = {
    taskPhoto: {
      findMany: async (input: Record<string, unknown>) => {
        calls.push({ method: "findMany", input });
        return [{ id: "photo-1" }];
      },
      count: async (input: Record<string, unknown>) => {
        calls.push({ method: "count", input });
        return 6;
      },
    },
  };
  const service = new TaskPhotoReadService(database as never);

  const untrustedQuery = { status: "archived", page: "2", pageSize: "5" } as unknown as TaskPhotoQuery;
  const result = await service.list(untrustedQuery);

  assert.deepEqual(result, { items: [{ id: "photo-1" }], page: 2, pageSize: 5, total: 6 });
  const listInput = calls.find((call) => call.method === "findMany")?.input;
  assert.deepEqual(listInput?.where, { distributionStatus: "pending" });
  assert.equal(listInput?.skip, 5);
  assert.equal(listInput?.take, 5);
  assert.deepEqual(listInput?.include, {
    mediaAsset: {
      select: {
        id: true,
        kind: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        createdAt: true,
      },
    },
    archiveObject: true,
    task: { select: { id: true, name: true, taskDate: true, sourceType: true } },
  });
  assert.deepEqual(listInput?.orderBy, [
    { capturedAt: "desc" },
    { videoTimestampMs: "asc" },
    { createdAt: "desc" },
    { id: "asc" },
  ]);
});

test("lists only photos archived to the requested managed object", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const database = {
    managedObject: { findUnique: async () => ({ id: "community-1" }) },
    taskPhoto: {
      findMany: async (input: Record<string, unknown>) => (calls.push(input), [{ id: "photo-1" }]),
      count: async () => 1,
    },
  };
  const service = new TaskPhotoReadService(database as never);

  const result = await service.listForArchive("community-1", { pageSize: "20" });

  assert.equal(result.total, 1);
  assert.deepEqual(calls[0].where, {
    archiveObjectId: "community-1",
    distributionStatus: "archived",
  });
});

test("rejects an unknown archive object", async () => {
  const database = {
    managedObject: { findUnique: async () => null },
  };
  const service = new TaskPhotoReadService(database as never);

  await assert.rejects(service.listForArchive("missing", {}), /档案对象不存在/);
});
