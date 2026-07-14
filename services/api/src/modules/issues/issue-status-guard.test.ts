import assert from "node:assert/strict";
import test from "node:test";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { runAsMember } from "../../test-support/auth-context.js";
import { IssuesController } from "./issues.controller.js";

function createController(readRepository: Record<string, unknown>) {
  return new IssuesController(
    readRepository as never,
    { record: async () => undefined } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { ensureFreshCard: async () => undefined } as never,
  );
}

test("general status endpoint cannot mark an issue verified", async () => {
  let updateCalls = 0;
  const controller = createController({
    updateIssueStatus: async () => {
      updateCalls += 1;
      return null;
    },
  });

  await assert.rejects(
    () => runAsMember(() => controller.updateStatus("is-1", { status: "verified" })),
    /确认闭环接口/,
  );
  assert.equal(updateCalls, 0);
});

test("general status endpoint cannot reopen an already closed issue", async () => {
  let auditCalls = 0;
  const controller = new IssuesController(
    {
      updateIssueStatus: async () => null,
      issue: async () => ({ id: "is-closed", title: "已闭环问题", status: "verified" }),
    } as never,
    { record: async () => { auditCalls += 1; } } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { ensureFreshCard: async () => undefined } as never,
  );

  await assert.rejects(
    () => runAsMember(() => controller.updateStatus("is-closed", { status: "pending" })),
    /已闭环问题不能重新打开/,
  );
  assert.equal(auditCalls, 0);
});

test("status persistence uses a conditional update that excludes verified issues", async () => {
  let updateCall: Record<string, unknown> | undefined;
  const database = {
    issue: {
      updateMany: async (call: Record<string, unknown>) => {
        updateCall = call;
        return { count: 0 };
      },
      findUnique: async () => ({
        id: "is-closed",
        projectId: "quyang",
        title: "已闭环问题",
        status: "verified",
        severity: "normal",
        foundAt: new Date("2026-07-14T00:00:00.000Z"),
        description: null,
        locationName: null,
        cardStoragePath: null,
        object: null,
      }),
    },
  };
  const repository = new InspectionReadRepository(database as never);

  const result = await runAsMember(() => repository.updateIssueStatus("is-closed", "pending"));

  assert.equal(result, null);
  assert.deepEqual(updateCall, {
    where: { id: "is-closed", projectId: "quyang", status: { not: "verified" } },
    data: { status: "pending" },
  });
});
