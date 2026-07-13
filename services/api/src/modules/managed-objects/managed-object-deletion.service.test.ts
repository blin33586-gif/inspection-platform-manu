import assert from "node:assert/strict";
import test from "node:test";
import { ManagedObjectDeletionService } from "./managed-object-deletion.service.js";

function databaseFixture() {
  const calls: string[] = [];
  const pendingRequest = {
    id: "audit-delete-1",
    action: "managedObject.delete.request",
    targetType: "community",
    targetId: "community-1",
    reviewStatus: "pending",
    summary: "申请删除小区档案「玉田新村」",
  };
  const database = {
    managedObject: {
      findUnique: async () => ({ id: "community-1", name: "玉田新村", objectType: "community" }),
      delete: async () => (calls.push("managedObject.delete"), { id: "community-1" }),
    },
    auditLog: {
      findFirst: async () => null,
      findUnique: async () => pendingRequest,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ ...data, createdAt: new Date() }),
      update: async ({ data }: { data: { reviewStatus: string } }) => (calls.push(`audit.${data.reviewStatus}`), { ...pendingRequest, ...data }),
    },
    taskPhoto: {
      findMany: async () => [{ taskId: "task-1" }, { taskId: "task-1" }],
      updateMany: async () => (calls.push("taskPhoto.unarchive"), { count: 2 }),
      count: async () => 2,
    },
    issue: { updateMany: async () => (calls.push("issue.unlink"), { count: 1 }) },
    inspectionReport: { updateMany: async () => (calls.push("report.unlink"), { count: 1 }) },
    mapHotArea: { updateMany: async () => (calls.push("hotArea.unlink"), { count: 1 }) },
    inspectionTask: {
      update: async () => (calls.push("task.recount"), { id: "task-1" }),
    },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(database),
  };
  return { database, calls };
}

test("creates one pending deletion request without deleting the archive", async () => {
  const { database, calls } = databaseFixture();
  const service = new ManagedObjectDeletionService(database as never);

  const request = await service.requestDeletion("community-1", "admin");

  assert.equal(request.reviewStatus, "pending");
  assert.equal(request.targetId, "community-1");
  assert.deepEqual(calls, []);
});

test("confirms deletion by unlinking retained records and returning photos to pending", async () => {
  const { database, calls } = databaseFixture();
  const service = new ManagedObjectDeletionService(database as never);

  await service.reviewDeletion("audit-delete-1", "confirm", "admin");

  assert.deepEqual(calls, [
    "taskPhoto.unarchive",
    "issue.unlink",
    "report.unlink",
    "hotArea.unlink",
    "task.recount",
    "managedObject.delete",
    "audit.confirmed",
  ]);
});

test("cancels a deletion request without changing archive data", async () => {
  const { database, calls } = databaseFixture();
  const service = new ManagedObjectDeletionService(database as never);

  await service.reviewDeletion("audit-delete-1", "cancel", "admin");

  assert.deepEqual(calls, ["audit.canceled"]);
});
