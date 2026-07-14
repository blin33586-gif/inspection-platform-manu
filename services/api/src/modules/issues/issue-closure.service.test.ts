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
    $queryRaw: async () => {
      issueLookup = { id: issue.id, projectId: "quyang" };
      return [{ id: issue.id, title: issue.title, status: issue.status }];
    },
    issue: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        issueLookup = where;
        return where.id === issue.id && where.projectId === "quyang" ? issue : null;
      },
      updateMany: async (call: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        updateCall = call;
        Object.assign(issue, call.data);
        return { count: 1 };
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
  assert.equal(result.projectId, "quyang");
  assert.deepEqual(calls().updateCall?.where, { id: "is-2", projectId: "quyang", status: { notIn: ["verified", "ignored", "archived"] } });
  assert.equal(calls().updateCall?.data.status, "verified");
  assert.equal(calls().audit?.action, "issue.close");
});

test("rejects closure for ignored or archived issues", async () => {
  for (const status of ["ignored", "archived"]) {
    const issue = { id: `is-${status}`, projectId: "quyang", title: "终态问题", status };
    const database: any = {
      issue: { findUnique: async () => issue },
      $transaction: async (callback: (transaction: any) => Promise<unknown>) => callback({
        $queryRaw: async () => [issue],
      }),
    };
    const service = new IssueRectificationService(database);

    await assert.rejects(
      () => runAsMember(() => service.close(issue.id)),
      /当前状态不能提交整改记录或确认闭环/,
    );
  }
});

test("serializes concurrent closure and writes exactly one closure audit", async () => {
  const issue = { id: "is-2", projectId: "quyang", title: "占道堆物", status: "processing" };
  const audits: Array<Record<string, unknown>> = [];
  const operations: string[] = [];
  let transactionTail = Promise.resolve();
  const database: any = {
    $transaction: async (callback: (transaction: any) => Promise<unknown>) => {
      const previous = transactionTail;
      let release: () => void = () => {};
      transactionTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        return await callback({
          $queryRaw: async () => {
            operations.push("lock");
            return [{ ...issue }];
          },
          issueRectificationRecord: {
            count: async () => {
              operations.push("count");
              return 1;
            },
          },
          issue: {
            updateMany: async () => {
              operations.push("update");
              if (issue.status === "verified") return { count: 0 };
              issue.status = "verified";
              return { count: 1 };
            },
            findUnique: async () => ({ ...issue }),
          },
          auditLog: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              audits.push(data);
              return data;
            },
          },
        });
      } finally {
        release();
      }
    },
  };
  const service = new IssueRectificationService(database);

  const [first, second] = await Promise.all([
    runAsMember(() => service.close("is-2")),
    runAsMember(() => service.close("is-2")),
  ]);

  assert.equal(first.status, "verified");
  assert.equal(second.status, "verified");
  assert.equal(audits.length, 1);
  assert.deepEqual(operations, ["lock", "count", "update", "lock"]);
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
