import assert from "node:assert/strict";
import test from "node:test";
import type { IssueStatus, Severity } from "@xunjianbao/shared";
import { runAsMember } from "../../test-support/auth-context.js";
import { IssueWriteService } from "./issue-write.service.js";

interface IssueRecord {
  id: string;
  projectId: string;
  title: string;
  objectId: string | null;
  category: string;
  status: IssueStatus;
  severity: Severity;
  foundAt: Date;
  description: string | null;
  locationName: string | null;
  cardStoragePath: string | null;
}

function createMetadataFixture(overrides: Partial<IssueRecord> = {}) {
  let issue: IssueRecord = {
    id: "is-1",
    projectId: "quyang",
    title: "道路堆物",
    objectId: "old",
    category: "市容环境",
    status: "verified",
    severity: "normal",
    foundAt: new Date("2026-07-07T01:00:00.000Z"),
    description: null,
    locationName: null,
    cardStoragePath: null,
    ...overrides,
  };
  const objects = [
    { id: "old", projectId: "quyang", name: "旧道路", objectType: "road", status: "稳定", issueCount: 1, reportCount: 0 },
    { id: "r-new", projectId: "quyang", name: "新道路", objectType: "road", status: "稳定", issueCount: 0, reportCount: 0 },
    { id: "foreign", projectId: "jinshan", name: "其他项目道路", objectType: "road", status: "稳定", issueCount: 0, reportCount: 0 },
  ];
  const counterWrites: string[] = [];
  const audits: Array<Record<string, unknown>> = [];
  const issueWrites: Array<Record<string, unknown>> = [];
  let transactionCalls = 0;
  let transactionResult: unknown;

  const transaction = {
    issue: {
      findUnique: async ({ where }: { where: { id: string; projectId: string } }) =>
        issue.id === where.id && issue.projectId === where.projectId ? issue : null,
      update: async ({ data }: { data: Partial<IssueRecord> }) => {
        issueWrites.push(data);
        issue = { ...issue, ...data };
        return issue;
      },
    },
    managedObject: {
      findUnique: async ({ where }: { where: { id: string; projectId: string } }) =>
        objects.find((object) => object.id === where.id && object.projectId === where.projectId) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; projectId: string; issueCount?: { gt: number } }; data: { issueCount: { decrement: number } } }) => {
        const object = objects.find((candidate) => candidate.id === where.id && candidate.projectId === where.projectId);
        if (!object || (where.issueCount && object.issueCount <= where.issueCount.gt)) return { count: 0 };
        object.issueCount -= data.issueCount.decrement;
        counterWrites.push(`${where.id}:-${data.issueCount.decrement}`);
        return { count: 1 };
      },
      update: async ({ where, data }: { where: { id: string; projectId: string }; data: { issueCount: { increment: number } } }) => {
        const object = objects.find((candidate) => candidate.id === where.id && candidate.projectId === where.projectId);
        if (!object) throw new Error("managed object not found");
        object.issueCount += data.issueCount.increment;
        counterWrites.push(`${where.id}:+${data.issueCount.increment}`);
        return object;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return data;
      },
    },
  };
  const database = {
    $transaction: async (callback: (client: typeof transaction) => unknown) => {
      transactionCalls += 1;
      transactionResult = await callback(transaction);
      return transactionResult;
    },
  };
  const readRepository = {
    issue: async (id: string) => {
      if (id !== issue.id) return null;
      const object = objects.find((candidate) => candidate.id === issue.objectId && candidate.projectId === issue.projectId);
      return {
        id: issue.id,
        title: issue.title,
        objectId: issue.objectId,
        objectName: object?.name ?? "未关联对象",
        category: issue.category,
        status: issue.status,
        severity: issue.severity,
        foundAt: issue.foundAt.toISOString(),
        description: issue.description,
        locationName: issue.locationName,
        cardImageUrl: null,
      };
    },
  };
  const service = new IssueWriteService(database as never, readRepository as never, {} as never);

  return {
    service,
    counterWrites,
    audits,
    issueWrites,
    transactionCalls: () => transactionCalls,
    transactionResult: () => transactionResult,
  };
}

test("rejects read-only terminal statuses when creating an issue", async () => {
  let transactionCalls = 0;
  const database = {
    $transaction: async () => {
      transactionCalls += 1;
      throw new Error("transaction must not start for an invalid initial status");
    },
  };
  const service = new IssueWriteService(database as never, {} as never, {} as never);
  const terminalStatuses: IssueStatus[] = ["verified", "ignored", "archived"];

  for (const status of terminalStatuses) {
    await assert.rejects(
      () => runAsMember(() => service.create({ title: "占道堆物", category: "市容", status })),
      /新建问题不能使用已闭环、暂不处理或已归档状态/,
    );
  }

  assert.equal(transactionCalls, 0);
});

test("updates issue metadata without changing a verified status", async () => {
  const { service, counterWrites, audits, issueWrites, transactionResult } = createMetadataFixture();

  const result = await runAsMember(() => service.updateMetadata("is-1", {
    objectId: "r-new",
    category: "占道经营",
    severity: "high",
    foundAt: "2026-07-08T09:35:00+08:00",
  }));

  assert.equal(result?.status, "verified");
  assert.equal(result?.objectId, "r-new");
  assert.equal(result?.foundAt, "2026-07-08T01:35:00.000Z");
  assert.deepEqual(counterWrites, ["old:-1", "r-new:+1"]);
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.action, "issue.metadata.update");
  assert.match(String(audits[0]?.summary), /关联对象/);
  assert.match(String(audits[0]?.summary), /问题类别/);
  assert.match(String(audits[0]?.summary), /严重程度/);
  assert.match(String(audits[0]?.summary), /发现时间/);
  assert.equal("status" in (issueWrites[0] ?? {}), false);
  assert.deepEqual(transactionResult(), { issueId: "is-1", changed: true });
});

test("clears an issue object association and only decrements the old counter", async () => {
  const { service, counterWrites, audits } = createMetadataFixture();

  const result = await runAsMember(() => service.updateMetadata("is-1", { objectId: null }));

  assert.equal(result?.objectId, null);
  assert.equal(result?.objectName, "未关联对象");
  assert.equal(result?.status, "verified");
  assert.deepEqual(counterWrites, ["old:-1"]);
  assert.equal(audits.length, 1);
});

test("rejects an issue object from another project", async () => {
  const { service, counterWrites, audits, issueWrites, transactionCalls } = createMetadataFixture();

  await assert.rejects(
    () => runAsMember(() => service.updateMetadata("is-1", { objectId: "foreign" })),
    /对象.*不存在|Managed object not found/,
  );

  assert.equal(transactionCalls(), 1);
  assert.deepEqual(counterWrites, []);
  assert.deepEqual(issueWrites, []);
  assert.deepEqual(audits, []);
});

test("rejects blank or over-100-character categories before starting a transaction", async () => {
  const { service, transactionCalls } = createMetadataFixture();

  await assert.rejects(
    () => runAsMember(() => service.updateMetadata("is-1", { category: "   " })),
    /类别|category/i,
  );
  await assert.rejects(
    () => runAsMember(() => service.updateMetadata("is-1", { category: "类".repeat(101) })),
    /100/,
  );

  assert.equal(transactionCalls(), 0);
});

test("rejects invalid severity and time before starting a transaction", async () => {
  const { service, transactionCalls } = createMetadataFixture();

  await assert.rejects(
    () => runAsMember(() => service.updateMetadata("is-1", { severity: "critical" as Severity })),
    /严重程度|severity/i,
  );
  await assert.rejects(
    () => runAsMember(() => service.updateMetadata("is-1", { foundAt: "not-a-date" })),
    /发现时间|found date/i,
  );
  await assert.rejects(
    () => runAsMember(() => service.updateMetadata("is-1", { foundAt: null } as never)),
    /发现时间|found date/i,
  );

  assert.equal(transactionCalls(), 0);
});

test("performs no issue, audit, or counter writes for an unchanged normalized save", async () => {
  const { service, counterWrites, audits, issueWrites, transactionResult } = createMetadataFixture({
    category: "占道经营",
    foundAt: new Date("2026-07-08T01:35:00.000Z"),
  });

  const result = await runAsMember(() => service.updateMetadata("is-1", {
    objectId: " old ",
    category: "  占道经营  ",
    severity: "normal",
    foundAt: "2026-07-08T09:35:00+08:00",
  }));

  assert.equal(result?.status, "verified");
  assert.deepEqual(counterWrites, []);
  assert.deepEqual(issueWrites, []);
  assert.deepEqual(audits, []);
  assert.deepEqual(transactionResult(), { issueId: "is-1", changed: false });
});
