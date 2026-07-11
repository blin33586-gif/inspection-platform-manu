import assert from "node:assert/strict";
import test from "node:test";
import { InspectionTaskDistributionService } from "./inspection-task-distribution.service.js";

function databaseFixture() {
  const updates: Array<Record<string, unknown>> = [];
  const taskUpdates: Array<Record<string, unknown>> = [];
  const database = {
    taskPhoto: {
      findFirst: async () => ({ id: "photo-1", taskId: "task-1", archiveObjectId: null, distributionStatus: "pending" }),
      update: async (input: Record<string, unknown>) => (updates.push(input), input),
      count: async () => 4,
    },
    managedObject: { findUnique: async () => ({ id: "community-1", name: "玉田新村", type: "community" }) },
    inspectionTask: { update: async (input: Record<string, unknown>) => (taskUpdates.push(input), input) },
    auditLog: { create: async (input: Record<string, unknown>) => input },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(database),
  };
  return { database, updates, taskUpdates };
}

test("archives one photo to exactly one managed object and recalculates pending count", async () => {
  const { database, updates, taskUpdates } = databaseFixture();
  const service = new InspectionTaskDistributionService(database as never);

  await service.update("task-1", "photo-1", { action: "archive", archiveObjectId: "community-1" });

  assert.deepEqual(updates[0], {
    where: { id: "photo-1" },
    data: { distributionStatus: "archived", archiveObjectId: "community-1" },
  });
  assert.deepEqual(taskUpdates[0], {
    where: { id: "task-1" },
    data: { pendingPhotoCount: 4, processStatus: "ready_for_distribution" },
  });
});

test("ignores a photo without linking it to an archive", async () => {
  const { database, updates } = databaseFixture();
  const service = new InspectionTaskDistributionService(database as never);

  await service.update("task-1", "photo-1", { action: "ignore" });

  assert.deepEqual(updates[0], {
    where: { id: "photo-1" },
    data: { distributionStatus: "ignored", archiveObjectId: null },
  });
});
