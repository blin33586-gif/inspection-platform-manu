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
