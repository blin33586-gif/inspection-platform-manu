import assert from "node:assert/strict";
import test from "node:test";
import { TaskPhotoReadService } from "./task-photo-read.service.js";

test("lists pending task photos with task and media details", async () => {
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

  const result = await service.list({ status: "pending", page: "2", pageSize: "5" });

  assert.deepEqual(result, { items: [{ id: "photo-1" }], page: 2, pageSize: 5, total: 6 });
  const listInput = calls.find((call) => call.method === "findMany")?.input;
  assert.deepEqual(listInput?.where, { distributionStatus: "pending" });
  assert.equal(listInput?.skip, 5);
  assert.equal(listInput?.take, 5);
  assert.deepEqual(listInput?.include, {
    mediaAsset: true,
    archiveObject: true,
    task: { select: { id: true, name: true, taskDate: true, sourceType: true } },
  });
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
