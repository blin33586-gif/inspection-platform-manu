import assert from "node:assert/strict";
import test from "node:test";
import { InspectionTaskDistributionService } from "./inspection-task-distribution.service.js";

function databaseFixture() {
  const updates: Array<Record<string, unknown>> = [];
  const conditionalUpdates: Array<Record<string, unknown>> = [];
  const taskUpdates: Array<Record<string, unknown>> = [];
  const database = {
    taskPhoto: {
      findFirst: async () => ({ id: "photo-1", taskId: "task-1", archiveObjectId: null, distributionStatus: "pending" }),
      update: async (input: Record<string, unknown>) => (updates.push(input), input),
      updateMany: async (input: Record<string, unknown>) => (conditionalUpdates.push(input), { count: 1 }),
      findUnique: async () => ({ id: "photo-1", taskId: "task-1", archiveObjectId: "community-1", distributionStatus: "archived" }),
      count: async () => 4,
    },
    managedObject: { findUnique: async () => ({ id: "community-1", name: "玉田新村", type: "community" }) },
    inspectionTask: {
      update: async (input: Record<string, unknown>) => {
        taskUpdates.push(input);
        return { id: "task-1", pendingPhotoCount: 3, processStatus: "ready_for_distribution" };
      },
      findUnique: async () => ({ id: "task-1", pendingPhotoCount: 3, processStatus: "ready_for_distribution" }),
    },
    auditLog: { create: async (input: Record<string, unknown>) => input },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(database),
  };
  return { database, updates, conditionalUpdates, taskUpdates };
}

test("archives one pending photo and atomically decrements the task pending count", async () => {
  const { database, conditionalUpdates, taskUpdates } = databaseFixture();
  const service = new InspectionTaskDistributionService(database as never);

  await service.update("task-1", "photo-1", { action: "archive", archiveObjectId: "community-1" });

  assert.deepEqual(conditionalUpdates[0], {
    where: { id: "photo-1", taskId: "task-1", distributionStatus: "pending" },
    data: { distributionStatus: "archived", archiveObjectId: "community-1" },
  });
  assert.deepEqual(taskUpdates[0], {
    where: { id: "task-1" },
    data: { pendingPhotoCount: { decrement: 1 } },
  });
  assert.deepEqual(taskUpdates[1], {
    where: { id: "task-1" },
    data: { processStatus: "ready_for_distribution" },
  });
});

test("ignores a photo without linking it to an archive", async () => {
  const { database, conditionalUpdates } = databaseFixture();
  const service = new InspectionTaskDistributionService(database as never);

  await service.update("task-1", "photo-1", { action: "ignore" });

  assert.deepEqual(conditionalUpdates[0], {
    where: { id: "photo-1", taskId: "task-1", distributionStatus: "pending" },
    data: { distributionStatus: "ignored", archiveObjectId: null },
  });
});

test("rejects a stale concurrent distribution without decrementing or writing a false audit", async () => {
  const { database, taskUpdates } = databaseFixture();
  database.taskPhoto.updateMany = async () => ({ count: 0 });
  const service = new InspectionTaskDistributionService(database as never);

  await assert.rejects(
    service.update("task-1", "photo-1", { action: "archive", archiveObjectId: "community-1" }),
    /照片已由其他操作完成分发，请刷新后重试/,
  );

  assert.equal(taskUpdates.some((input) => (
    JSON.stringify(input).includes('"decrement":1')
  )), false);
});
