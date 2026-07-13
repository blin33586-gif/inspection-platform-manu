import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IssueEventPublishService } from "./issue-event-publish.service.js";
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
  };
  const database = {
    issue: {
      findUnique: async () => existingIssue,
      create: async () => { createCount++; return existingIssue; },
      update: async ({ data }: { data: Record<string, unknown> }) => ({ ...existingIssue, ...data }),
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
