import assert from "node:assert/strict";
import test from "node:test";
import { runWithProjectContext } from "../modules/auth/project-context.js";
import { InspectionReadRepository } from "./inspection-read.repository.js";

test("adds the current project to customer-facing list and detail queries", async () => {
  const calls: Array<{ model: string; input: Record<string, unknown> }> = [];
  const database = {
    dashboardMetric: {
      findMany: async (input: Record<string, unknown>) => {
        calls.push({ model: "dashboardMetric", input });
        return [];
      },
    },
    managedObject: {
      findMany: async (input: Record<string, unknown>) => {
        calls.push({ model: "managedObject", input });
        return [];
      },
    },
    issue: {
      findUnique: async (input: Record<string, unknown>) => {
        calls.push({ model: "issue", input });
        return null;
      },
    },
    inspectionReport: {
      findUnique: async (input: Record<string, unknown>) => {
        calls.push({ model: "inspectionReport", input });
        return null;
      },
    },
    mapAsset: {
      findMany: async (input: Record<string, unknown>) => {
        calls.push({ model: "mapAsset", input });
        return [];
      },
    },
  };
  const repository = new InspectionReadRepository(database as never);

  await runWithProjectContext({ projectId: "jinshan" }, async () => {
    await repository.dashboardSummary();
    await repository.managedObjects("community");
    await repository.issue("issue-1");
    await repository.report("report-1");
    await repository.mapAssets();
  });

  assert.deepEqual(calls[0].input.where, { projectId: "jinshan" });
  assert.deepEqual(calls[1].input.where, { projectId: "jinshan", objectType: "community" });
  assert.deepEqual(calls[2].input.where, { id: "issue-1", projectId: "jinshan" });
  assert.deepEqual(calls[3].input.where, { id: "report-1", projectId: "jinshan" });
  assert.deepEqual(calls[4].input.where, { projectId: "jinshan" });
});
