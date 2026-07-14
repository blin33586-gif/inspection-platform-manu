import assert from "node:assert/strict";
import test from "node:test";
import type { IssueStatus, Severity } from "@xunjianbao/shared";
import { runAsMember } from "../../test-support/auth-context.js";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
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

function createMetadataFixture(
  overrides: Partial<IssueRecord> = {},
  refreshCard: (id: string) => Promise<void> = async () => undefined,
) {
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
    $queryRaw: async (_strings: TemplateStringsArray, id: string, projectId: string) =>
      issue.id === id && issue.projectId === projectId ? [{ id: issue.id }] : [],
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
  const refreshCalls: string[] = [];
  const publisher = {
    refreshCard: async (id: string) => {
      refreshCalls.push(id);
      await refreshCard(id);
    },
  };
  const service = new IssueWriteService(database as never, readRepository as never, {} as never, publisher as never);

  return {
    service,
    counterWrites,
    audits,
    issueWrites,
    refreshCalls,
    transactionCalls: () => transactionCalls,
    transactionResult: () => transactionResult,
  };
}

function createConcurrentAssociationFixture() {
  let issue: IssueRecord = {
    id: "is-concurrent",
    projectId: "quyang",
    title: "并发关联测试",
    objectId: "old",
    category: "市容环境",
    status: "pending",
    severity: "normal",
    foundAt: new Date("2026-07-14T01:00:00.000Z"),
    description: null,
    locationName: null,
    cardStoragePath: null,
  };
  const objects = new Map([
    ["old", { id: "old", projectId: "quyang", name: "旧对象", issueCount: 1 }],
    ["target-b", { id: "target-b", projectId: "quyang", name: "目标 B", issueCount: 0 }],
    ["target-c", { id: "target-c", projectId: "quyang", name: "目标 C", issueCount: 0 }],
  ]);
  let unlockedReads = 0;
  let releaseUnlockedReads: (() => void) | undefined;
  const unlockedReadBarrier = new Promise<void>((resolve) => { releaseUnlockedReads = resolve; });
  let lockTail = Promise.resolve();
  let lockCalls = 0;
  const audits: Array<Record<string, unknown>> = [];

  const database = {
    $transaction: async (callback: (transaction: any) => Promise<unknown>) => {
      let hasIssueLock = false;
      let releaseIssueLock: (() => void) | undefined;
      const transaction = {
        $queryRaw: async (_strings: TemplateStringsArray, lockedIssueId: string, lockedProjectId: string) => {
          const previous = lockTail;
          lockTail = new Promise<void>((resolve) => { releaseIssueLock = resolve; });
          await previous;
          hasIssueLock = true;
          lockCalls += 1;
          return issue.id === lockedIssueId && issue.projectId === lockedProjectId ? [{ id: issue.id }] : [];
        },
        issue: {
          findUnique: async ({ where }: { where: { id: string; projectId: string } }) => {
            if (issue.id !== where.id || issue.projectId !== where.projectId) return null;
            if (hasIssueLock) return { ...issue };
            const staleSnapshot = { ...issue };
            unlockedReads += 1;
            if (unlockedReads === 2) releaseUnlockedReads?.();
            await unlockedReadBarrier;
            return staleSnapshot;
          },
          update: async ({ data }: { data: Partial<IssueRecord> }) => {
            issue = { ...issue, ...data };
            return { ...issue };
          },
        },
        managedObject: {
          findUnique: async ({ where }: { where: { id: string; projectId: string } }) => {
            const object = objects.get(where.id);
            return object?.projectId === where.projectId ? { ...object } : null;
          },
          updateMany: async ({ where }: { where: { id: string; projectId: string; issueCount: { gt: number } } }) => {
            const object = objects.get(where.id);
            if (!object || object.projectId !== where.projectId || object.issueCount <= where.issueCount.gt) return { count: 0 };
            object.issueCount -= 1;
            return { count: 1 };
          },
          update: async ({ where }: { where: { id: string; projectId: string } }) => {
            const object = objects.get(where.id);
            if (!object || object.projectId !== where.projectId) throw new Error("managed object not found");
            object.issueCount += 1;
            return { ...object };
          },
        },
        auditLog: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            audits.push(data);
            return data;
          },
        },
      };
      try {
        return await callback(transaction);
      } finally {
        releaseIssueLock?.();
      }
    },
  };
  const readRepository = {
    issue: async () => ({
      id: issue.id,
      title: issue.title,
      objectId: issue.objectId,
      objectName: issue.objectId ? objects.get(issue.objectId)?.name ?? "未关联对象" : "未关联对象",
      category: issue.category,
      status: issue.status,
      severity: issue.severity,
      foundAt: issue.foundAt.toISOString(),
      description: issue.description,
      locationName: issue.locationName,
      cardImageUrl: null,
    }),
  };
  const service = new IssueWriteService(
    database as never,
    readRepository as never,
    {} as never,
    { refreshCard: async () => undefined } as never,
  );

  return {
    service,
    issue: () => ({ ...issue }),
    counts: () => Object.fromEntries(Array.from(objects, ([id, object]) => [id, object.issueCount])),
    lockCalls: () => lockCalls,
    audits,
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
  const service = new IssueWriteService(database as never, {} as never, {} as never, {} as never);
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
  const { service, counterWrites, audits, issueWrites, transactionResult, refreshCalls } = createMetadataFixture();

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
  assert.deepEqual(refreshCalls, ["is-1"]);
});

test("serializes concurrent association changes to different targets and keeps every counter consistent", async () => {
  const fixture = createConcurrentAssociationFixture();

  await Promise.all([
    runAsMember(() => fixture.service.updateMetadata("is-concurrent", { objectId: "target-b" })),
    runAsMember(() => fixture.service.updateMetadata("is-concurrent", { objectId: "target-c" })),
  ]);

  const finalObjectId = fixture.issue().objectId;
  const counts = fixture.counts();
  assert.ok(finalObjectId === "target-b" || finalObjectId === "target-c");
  assert.deepEqual(counts, {
    old: 0,
    "target-b": finalObjectId === "target-b" ? 1 : 0,
    "target-c": finalObjectId === "target-c" ? 1 : 0,
  });
  assert.equal(fixture.lockCalls(), 2);
});

test("does not increment the same target twice under concurrent association changes", async () => {
  const fixture = createConcurrentAssociationFixture();

  await Promise.all([
    runAsMember(() => fixture.service.updateMetadata("is-concurrent", { objectId: "target-b" })),
    runAsMember(() => fixture.service.updateMetadata("is-concurrent", { objectId: "target-b" })),
  ]);

  assert.equal(fixture.issue().objectId, "target-b");
  assert.deepEqual(fixture.counts(), { old: 0, "target-b": 1, "target-c": 0 });
  assert.equal(fixture.lockCalls(), 2);
  assert.equal(fixture.audits.length, 1);
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

test("rejects incomplete ISO foundAt values before starting a transaction", async () => {
  const { service, transactionCalls } = createMetadataFixture();
  const incompleteTimes = [
    "2026-07-08",
    "2026-07-08T09:35",
    "2026-07-08T09:35:00",
    "2026-07-08T09:35+08:00",
    "2026-07-08 09:35:00+08:00",
  ];

  for (const foundAt of incompleteTimes) {
    await assert.rejects(
      () => runAsMember(() => service.updateMetadata("is-1", { foundAt })),
      /发现时间|found date/i,
    );
  }

  assert.equal(transactionCalls(), 0);
});

test("performs no issue, audit, counter, or card writes for an unchanged normalized save", async () => {
  const { service, counterWrites, audits, issueWrites, transactionResult, refreshCalls } = createMetadataFixture({
    category: "占道经营",
    foundAt: new Date("2026-07-08T01:35:00.000Z"),
  });

  const result = await runAsMember(() => service.updateMetadata("is-1", {
    objectId: " old ",
    category: "  占道经营  ",
    severity: "normal",
    foundAt: "2026-07-08T01:35:00.000Z",
  }));

  assert.equal(result?.status, "verified");
  assert.deepEqual(counterWrites, []);
  assert.deepEqual(issueWrites, []);
  assert.deepEqual(audits, []);
  assert.deepEqual(transactionResult(), { issueId: "is-1", changed: false });
  assert.deepEqual(refreshCalls, []);
});

test("returns committed metadata when card refresh fails after recording its failure", async () => {
  const cardAudits: Array<Record<string, unknown>> = [];
  const { service, audits, refreshCalls } = createMetadataFixture({}, async (id) => {
    cardAudits.push({ action: "issue.card.failed", targetId: id });
    throw new Error("card refresh failed");
  });

  const result = await runAsMember(() => service.updateMetadata("is-1", { category: "占道经营" }));

  assert.equal(result?.category, "占道经营");
  assert.deepEqual(refreshCalls, ["is-1"]);
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.action, "issue.metadata.update");
  assert.deepEqual(cardAudits, [{ action: "issue.card.failed", targetId: "is-1" }]);
});

test("versions every issue summary card URL with the business updatedAt epoch", async () => {
  const updatedAt = new Date("2026-07-14T02:03:04.567Z");
  const record = {
    id: "is-card",
    projectId: "quyang",
    title: "道路堆物",
    objectId: null,
    object: null,
    category: "市容环境",
    status: "pending",
    severity: "normal",
    foundAt: new Date("2026-07-08T01:35:00.000Z"),
    description: null,
    locationName: null,
    cardStoragePath: "storage/issues/cards/is-card.png",
    updatedAt,
  };
  const database = {
    issue: {
      findMany: async () => [record],
      findUnique: async () => record,
      updateMany: async () => ({ count: 1 }),
    },
  };
  const repository = new InspectionReadRepository(database as never);

  const [listed, detailed, statusUpdated] = await runAsMember(async () => {
    const [listedIssue] = await repository.issues();
    return [listedIssue, await repository.issue(record.id), await repository.updateIssueStatus(record.id, "processing")];
  });
  const expected = `/api/v1/issues/${record.id}/card.png?v=${updatedAt.getTime()}`;

  assert.equal(listed?.cardImageUrl, expected);
  assert.equal(detailed?.cardImageUrl, expected);
  assert.equal(statusUpdated?.cardImageUrl, expected);
});
