import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IssueEventPublishService } from "./issue-event-publish.service.js";
import { IssuesController } from "./issues.controller.js";
import { runAsMember } from "../../test-support/auth-context.js";

test("retries a missing share card without creating a duplicate issue", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-issue-publish-"));
  await mkdir(join(storageRoot, "media"), { recursive: true });
  await writeFile(join(storageRoot, "media", "photo.jpg"), "photo");
  let createCount = 0;
  let renderedAnnotation = "";
  const existingIssue = {
    id: "issue-1",
    title: "施工车辆",
    category: "施工车辆",
    description: "发现施工车辆",
    locationName: "曲阳路",
    foundAt: new Date("2026-07-13T02:00:00.000Z"),
    sourceTaskPhotoId: "photo-1",
    sourceAnnotationVersion: 1,
    cardStoragePath: null,
    updatedAt: new Date("2026-07-13T02:00:00.000Z"),
  };
  const database = {
    issue: {
      findUnique: async () => existingIssue,
      create: async () => { createCount++; return existingIssue; },
      updateMany: async () => ({ count: 1 }),
    },
    taskPhoto: {
      findUnique: async () => ({
        id: "photo-1",
        mediaAsset: {
          storagePath: "storage/media/photo.jpg",
          previewStoragePath: null,
        },
        annotationDocument: {
          id: "document-1",
          currentVersion: 2,
          annotationJson: JSON.stringify({ canvasVersion: 1, elements: [{ id: "new", type: "text", x: 0, y: 0, text: "新标注", color: "#ef4444" }] }),
        },
      }),
    },
    photoAnnotationVersion: {
      findUnique: async () => ({
        annotationJson: JSON.stringify({ canvasVersion: 1, elements: [{ id: "old", type: "text", x: 0, y: 0, text: "推送时标注", color: "#ef4444" }] }),
      }),
    },
  };
  const audit = { record: async () => undefined };
  const renderer = async (input: { annotationJson?: string }) => {
    renderedAnnotation = input.annotationJson ?? "";
    return Buffer.from("png-card");
  };
  const service = new IssueEventPublishService(database as never, audit as never, storageRoot, renderer as never);

  const result = await runAsMember(() => service.publish("photo-1", {
    idempotencyKey: "retry-key",
    expectedAnnotationVersion: 1,
    locationName: "曲阳路",
    foundAt: "2026-07-13T10:00",
    category: "施工车辆",
    description: "发现施工车辆",
  }));

  assert.equal(result.issueId, "issue-1");
  assert.equal(createCount, 0);
  assert.match(renderedAnnotation, /推送时标注/);
  assert.deepEqual(await readFile(join(storageRoot, "issues", "cards", "issue-1.png")), Buffer.from("png-card"));
});

test("rolls back a newly published issue when its audit row cannot be written", async () => {
  const issues: Array<Record<string, unknown>> = [];
  const photo = {
    id: "photo-atomic",
    mediaAsset: { storagePath: "storage/media/photo.jpg", previewStoragePath: null },
    annotationDocument: {
      id: "document-atomic", currentVersion: 1, annotationJson: "{}",
      longitude: null, latitude: null,
    },
  };
  const database: any = {
    issue: {
      findUnique: async () => null,
      create: async ({ data }: any) => { issues.push(data); return data; },
    },
    taskPhoto: { findUnique: async () => photo },
    auditLog: { create: async () => { throw new Error("audit unavailable"); } },
  };
  database.$transaction = async (callback: any) => {
    const staged: Array<Record<string, unknown>> = [];
    const transaction = {
      ...database,
      issue: { ...database.issue, create: async ({ data }: any) => { staged.push(data); return data; } },
    };
    const result = await callback(transaction);
    issues.push(...staged);
    return result;
  };
  const service = new IssueEventPublishService(database, { record: async () => { throw new Error("audit unavailable"); } } as never);

  await assert.rejects(() => runAsMember(() => service.publish("photo-atomic", {
    idempotencyKey: "atomic-key",
    expectedAnnotationVersion: 1,
    locationName: "曲阳路",
    foundAt: "2026-07-14T10:00:00+08:00",
    category: "施工车辆",
    description: "发现施工车辆",
  })), /audit unavailable/);
  assert.equal(issues.length, 0);
});

function publishedIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: "issue-1",
    projectId: "quyang",
    title: "施工车辆",
    category: "新的问题类型",
    description: "发现施工车辆",
    locationName: "曲阳路",
    foundAt: new Date("2026-07-08T01:35:00.000Z"),
    sourceTaskPhotoId: "photo-1",
    sourceAnnotationVersion: 1,
    cardStoragePath: "storage/issues/cards/issue-1.png",
    cardMimeType: "image/png",
    cardFileSize: 8,
    updatedAt: new Date("2026-07-14T02:00:00.000Z"),
    ...overrides,
  };
}

function issuePhoto() {
  return {
    id: "photo-1",
    mediaAsset: { storagePath: "storage/media/photo.jpg", previewStoragePath: null },
    annotationDocument: {
      id: "document-1",
      currentVersion: 2,
      annotationJson: JSON.stringify({ version: "current" }),
    },
  };
}

test("refreshes an existing card from authoritative metadata and preserves its business version", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-issue-refresh-"));
  await mkdir(join(storageRoot, "media"), { recursive: true });
  await mkdir(join(storageRoot, "issues", "cards"), { recursive: true });
  await writeFile(join(storageRoot, "media", "photo.jpg"), "photo");
  await writeFile(join(storageRoot, "issues", "cards", "issue-1.png"), "old-card");
  const issue = publishedIssue();
  const audits: Array<Record<string, unknown>> = [];
  let persistedData: Record<string, unknown> | undefined;
  let persistedWhere: Record<string, unknown> | undefined;
  let rendered: Record<string, unknown> | undefined;
  const database = {
    issue: {
      findUnique: async () => ({ ...issue }),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        persistedWhere = where;
        persistedData = data;
        return { count: 1 };
      },
    },
    taskPhoto: { findUnique: async () => issuePhoto() },
    photoAnnotationVersion: {
      findUnique: async () => ({ annotationJson: JSON.stringify({ version: "published" }) }),
    },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => (audits.push(data), data) },
  };
  const renderer = async (input: Record<string, unknown>) => {
    rendered = input;
    return Buffer.from("new-card");
  };
  const service = new IssueEventPublishService(database as never, {} as never, storageRoot, renderer as never);

  await runAsMember(() => service.refreshCard("issue-1"));

  assert.equal(rendered?.category, "新的问题类型");
  assert.equal(rendered?.foundAt, "2026/7/8 09:35:00");
  assert.match(String(rendered?.annotationJson), /published/);
  assert.deepEqual(await readFile(join(storageRoot, "issues", "cards", "issue-1.png")), Buffer.from("new-card"));
  assert.deepEqual(persistedData?.updatedAt, issue.updatedAt);
  assert.deepEqual(persistedWhere?.updatedAt, issue.updatedAt);
  assert.equal(audits.length, 0);
});

test("leaves a cardless issue cardless without loading or rendering source media", async () => {
  let renders = 0;
  let photoReads = 0;
  const database = {
    issue: { findUnique: async () => publishedIssue({ cardStoragePath: null }) },
    taskPhoto: { findUnique: async () => { photoReads += 1; return issuePhoto(); } },
  };
  const service = new IssueEventPublishService(
    database as never,
    {} as never,
    undefined,
    (async () => { renders += 1; return Buffer.from("unexpected"); }) as never,
  );

  await runAsMember(() => service.refreshCard("issue-1"));

  assert.equal(photoReads, 0);
  assert.equal(renders, 0);
});

test("records a card failure audit when refresh rendering fails", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-issue-refresh-failure-"));
  await mkdir(join(storageRoot, "media"), { recursive: true });
  await writeFile(join(storageRoot, "media", "photo.jpg"), "photo");
  const audits: Array<Record<string, unknown>> = [];
  const issue = publishedIssue();
  const database = {
    issue: { findUnique: async () => issue },
    taskPhoto: { findUnique: async () => issuePhoto() },
    photoAnnotationVersion: { findUnique: async () => ({ annotationJson: "{}" }) },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => (audits.push(data), data) },
  };
  const service = new IssueEventPublishService(
    database as never,
    {} as never,
    storageRoot,
    (async () => { throw new Error("renderer unavailable"); }) as never,
  );

  await assert.rejects(
    () => runAsMember(() => service.refreshCard("issue-1")),
    /refresh|card|renderer|分享卡|问题卡/i,
  );
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.action, "issue.card.failed");
  assert.match(String(audits[0]?.summary), /renderer unavailable/);
});

test("ensureFreshCard retries an existing card whose file is older than the business version", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-issue-ensure-fresh-"));
  const cardPath = join(storageRoot, "issues", "cards", "issue-1.png");
  await mkdir(join(storageRoot, "media"), { recursive: true });
  await mkdir(join(storageRoot, "issues", "cards"), { recursive: true });
  await writeFile(join(storageRoot, "media", "photo.jpg"), "photo");
  await writeFile(cardPath, "old-card");
  await utimes(cardPath, new Date("2026-07-14T01:00:00.000Z"), new Date("2026-07-14T01:00:00.000Z"));
  const issue = publishedIssue();
  let renders = 0;
  const database = {
    issue: {
      findUnique: async () => issue,
      updateMany: async () => ({ count: 1 }),
    },
    taskPhoto: { findUnique: async () => issuePhoto() },
    photoAnnotationVersion: { findUnique: async () => ({ annotationJson: "{}" }) },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => data },
  };
  const service = new IssueEventPublishService(
    database as never,
    {} as never,
    storageRoot,
    (async () => { renders += 1; return Buffer.from("fresh-card"); }) as never,
  );

  await runAsMember(() => service.ensureFreshCard("issue-1"));
  await runAsMember(() => service.ensureFreshCard("issue-1"));

  assert.equal(renders, 1);
  assert.deepEqual(await readFile(cardPath), Buffer.from("fresh-card"));
});

test("discards an older concurrent render instead of overwriting the newest card", async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), "xunjianbao-issue-refresh-race-"));
  const cardPath = join(storageRoot, "issues", "cards", "issue-1.png");
  await mkdir(join(storageRoot, "media"), { recursive: true });
  await mkdir(join(storageRoot, "issues", "cards"), { recursive: true });
  await writeFile(join(storageRoot, "media", "photo.jpg"), "photo");
  await writeFile(cardPath, "initial-card");
  let current = publishedIssue({ category: "旧类型", updatedAt: new Date("2026-07-14T02:00:00.000Z") });
  let releaseOld: ((value: Buffer) => void) | undefined;
  let markOldStarted: (() => void) | undefined;
  const oldStarted = new Promise<void>((resolve) => { markOldStarted = resolve; });
  const renderedCategories: string[] = [];
  let activeRenders = 0;
  let maxConcurrentRenders = 0;
  const renderer = async (input: { category: string }) => {
    activeRenders += 1;
    maxConcurrentRenders = Math.max(maxConcurrentRenders, activeRenders);
    renderedCategories.push(input.category);
    try {
      if (renderedCategories.length === 1) {
        markOldStarted?.();
        return await new Promise<Buffer>((resolve) => { releaseOld = resolve; });
      }
      return Buffer.from("new-card");
    } finally {
      activeRenders -= 1;
    }
  };
  const database = {
    issue: {
      findUnique: async () => ({ ...current }),
      updateMany: async ({ where, data }: { where: { updatedAt: Date }; data: Record<string, unknown> }) => {
        if (current.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
        current = { ...current, ...data };
        return { count: 1 };
      },
    },
    taskPhoto: { findUnique: async () => issuePhoto() },
    photoAnnotationVersion: { findUnique: async () => ({ annotationJson: "{}" }) },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => data },
  };
  const service = new IssueEventPublishService(database as never, {} as never, storageRoot, renderer as never);

  const olderRefresh = runAsMember(() => service.refreshCard("issue-1"));
  await oldStarted;
  current = publishedIssue({ category: "新类型", updatedAt: new Date("2026-07-14T03:00:00.000Z") });
  const newerRefresh = runAsMember(() => service.refreshCard("issue-1"));
  releaseOld?.(Buffer.from("old-card"));
  await Promise.all([olderRefresh, newerRefresh]);

  assert.notDeepEqual(await readFile(cardPath), Buffer.from("old-card"));
  assert.equal(renderedCategories[0], "旧类型");
  assert.ok(renderedCategories.slice(1).every((category) => category === "新类型"));
  assert.equal(maxConcurrentRenders, 1);
});

test("protected card reads request freshness before resolving the stored file", async () => {
  let freshnessChecks = 0;
  const database = { issue: { findUnique: async () => null } };
  const publisher = { ensureFreshCard: async () => { freshnessChecks += 1; } };
  const controller = new IssuesController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    database as never,
    publisher as never,
  );

  await assert.rejects(
    () => runAsMember(() => controller.card("issue-1", {} as never)),
    /File not found/,
  );
  assert.equal(freshnessChecks, 1);
});
