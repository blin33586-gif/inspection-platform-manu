import assert from "node:assert/strict";
import test from "node:test";
import { runAsMember } from "../../test-support/auth-context.js";
import { IssueRectificationService } from "./issue-rectification.service.js";

function createClosureDatabase(rectificationCount: number) {
  let issueLookup: Record<string, unknown> | undefined;
  let countCall: Record<string, unknown> | undefined;
  let updateCall: { where: Record<string, unknown>; data: Record<string, unknown> } | undefined;
  let audit: Record<string, unknown> | undefined;
  const issue = { id: rectificationCount === 0 ? "is-1" : "is-2", projectId: "quyang", title: "占道堆物", status: "processing" };
  const database: any = {
    issue: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        issueLookup = where;
        return where.id === issue.id && where.projectId === "quyang" ? issue : null;
      },
      update: async (call: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        updateCall = call;
        return { ...issue, ...call.data };
      },
    },
    issueRectificationRecord: {
      count: async (call: Record<string, unknown>) => {
        countCall = call;
        return rectificationCount;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audit = data;
        return data;
      },
    },
  };
  database.$transaction = async (callback: (transaction: typeof database) => Promise<unknown>) => callback(database);
  return {
    database,
    calls: () => ({ issueLookup, countCall, updateCall, audit }),
  };
}

test("requires a rectification record before closing an issue", async () => {
  const { database, calls } = createClosureDatabase(0);
  const service = new IssueRectificationService(database);

  await assert.rejects(() => runAsMember(() => service.close("is-1")), /至少提交一条整改记录/);

  assert.deepEqual(calls().issueLookup, { id: "is-1", projectId: "quyang" });
  assert.deepEqual(calls().countCall, { where: { issueId: "is-1", issue: { projectId: "quyang" } } });
  assert.equal(calls().updateCall, undefined);
});

test("closes an issue and records an audit inside the project boundary", async () => {
  const { database, calls } = createClosureDatabase(1);
  const service = new IssueRectificationService(database);

  const result = await runAsMember(() => service.close("is-2"));

  assert.equal(result.status, "verified");
  assert.deepEqual(calls().updateCall?.where, { id: "is-2", projectId: "quyang" });
  assert.equal(calls().updateCall?.data.status, "verified");
  assert.equal(calls().audit?.action, "issue.close");
});

test("scopes rectification photo access to the current project", async () => {
  let query: Record<string, unknown> | undefined;
  const database = {
    issueAttachment: {
      findFirst: async (call: Record<string, unknown>) => {
        query = call;
        return { storagePath: "storage/issues/photo.jpg", originalFileName: "photo.jpg", fileName: "ia-photo.jpg", mimeType: "image/jpeg" };
      },
    },
  };
  const service = new IssueRectificationService(database as never);

  const photo = await runAsMember(() => service.photo("ia-photo"));

  assert.equal(photo?.mimeType, "image/jpeg");
  assert.deepEqual(query, {
    where: { id: "ia-photo", rectificationRecordId: { not: null }, issue: { projectId: "quyang" } },
    select: { storagePath: true, originalFileName: true, fileName: true, mimeType: true },
  });
});
