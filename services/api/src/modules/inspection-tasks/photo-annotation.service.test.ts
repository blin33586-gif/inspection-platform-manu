import assert from "node:assert/strict";
import test from "node:test";
import { PhotoAnnotationService } from "./photo-annotation.service.js";

const annotationJson = JSON.stringify({
  canvasVersion: 1,
  elements: [{ id: "rect-1", type: "rectangle", x: 0.1, y: 0.2, width: 0.3, height: 0.4, color: "#ef4444" }],
});

interface AnnotationDocumentRecord {
  id: string;
  taskPhotoId: string;
  currentVersion: number;
  annotationJson: string;
  issueDescription: string | null;
  longitude: number | null;
  latitude: number | null;
  altitude: number | null;
  source: string;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

function databaseFixture(options: { currentVersion?: number } = {}) {
  const versions: Array<Record<string, unknown>> = [];
  const documents: Array<Record<string, unknown>> = [];
  const audit: Array<Record<string, unknown>> = [];
  const current: AnnotationDocumentRecord | null = options.currentVersion === undefined ? null : {
    id: "annotation-1",
    taskPhotoId: "photo-1",
    currentVersion: options.currentVersion,
    annotationJson,
    issueDescription: "原问题说明",
    longitude: 121.468,
    latitude: 31.286,
    altitude: 86.5,
    source: "manual",
    createdBy: "admin",
    updatedBy: "admin",
    createdAt: new Date("2026-07-12T00:00:00.000Z"),
    updatedAt: new Date("2026-07-12T00:00:00.000Z"),
  };
  let latest = current ? { ...current } : null;
  const database = {
    taskPhoto: { findUnique: async () => ({ id: "photo-1" }) },
    photoAnnotationDocument: {
      findUnique: async (input: { where: { id?: string; taskPhotoId?: string } }) => (
        input.where.id ? latest : current
      ),
      create: async (input: Record<string, unknown>) => (
        documents.push(input),
        {
          id: "annotation-1",
          ...(input.data as Record<string, unknown>),
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      ),
      updateMany: async (input: Record<string, unknown>) => {
        documents.push(input);
        if (current) {
          const data = input.data as {
            currentVersion: { increment: number };
            annotationJson: string;
            issueDescription: string | null;
            longitude: number | null;
            latitude: number | null;
            altitude: number | null;
            source: string;
            updatedBy: string;
          };
          latest = {
            ...current,
            currentVersion: current.currentVersion + data.currentVersion.increment,
            annotationJson: data.annotationJson,
            issueDescription: data.issueDescription,
            longitude: data.longitude,
            latitude: data.latitude,
            altitude: data.altitude,
            source: data.source,
            updatedBy: data.updatedBy,
          };
        }
        return { count: 1 };
      },
      findMany: async () => current ? [current] : [],
    },
    photoAnnotationVersion: {
      create: async (input: Record<string, unknown>) => (versions.push(input), input),
      findMany: async () => versions,
      findFirst: async () => versions[0] ?? null,
    },
    auditLog: { create: async (input: Record<string, unknown>) => (audit.push(input), input) },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(database),
  };
  return { database, documents, versions, audit };
}

test("creates the first current annotation document at version one", async () => {
  const { database, documents, audit } = databaseFixture();
  const service = new PhotoAnnotationService(database as never);

  const result = await service.save("photo-1", "admin", {
    expectedVersion: 0,
    annotationJson: JSON.parse(annotationJson),
    issueDescription: "楼顶堆料",
    longitude: 121.468,
    latitude: 31.286,
    altitude: 86.5,
    source: "manual",
  });

  assert.equal(result.currentVersion, 1);
  assert.equal((documents[0].data as { currentVersion: number }).currentVersion, 1);
  assert.equal(audit.length, 1);
});

test("snapshots the prior document when saving the next annotation version", async () => {
  const { database, documents, versions } = databaseFixture({ currentVersion: 1 });
  const service = new PhotoAnnotationService(database as never);

  const result = await service.save("photo-1", "admin", {
    expectedVersion: 1,
    annotationJson: JSON.parse(annotationJson),
    issueDescription: "更新后的问题说明",
    source: "manual",
  });

  assert.equal(result.currentVersion, 2);
  assert.equal((versions[0].data as { version: number }).version, 1);
  assert.deepEqual((documents[0].data as { currentVersion: { increment: number } }).currentVersion, { increment: 1 });
});

test("rejects a stale writer without changing the current annotation", async () => {
  const { database, documents, versions, audit } = databaseFixture({ currentVersion: 2 });
  const service = new PhotoAnnotationService(database as never);

  await assert.rejects(
    () => service.save("photo-1", "admin", {
      expectedVersion: 1,
      annotationJson: JSON.parse(annotationJson),
      source: "manual",
    }),
    /标注已被其他用户更新/,
  );

  assert.equal(documents.length, 0);
  assert.equal(versions.length, 0);
  assert.equal(audit.length, 0);
});

test("returns a virtual empty document for a photo without saved annotations", async () => {
  const { database } = databaseFixture();
  const service = new PhotoAnnotationService(database as never);

  assert.deepEqual(await service.getCurrent("photo-1"), {
    taskPhotoId: "photo-1",
    currentVersion: 0,
    annotationJson: { canvasVersion: 1, elements: [] },
    issueDescription: null,
    longitude: null,
    latitude: null,
    altitude: null,
    source: "manual",
    createdBy: null,
    updatedBy: null,
    createdAt: null,
    updatedAt: null,
  });
});

test("returns both the current and an immutable historical annotation version", async () => {
  const { database } = databaseFixture({ currentVersion: 2 });
  database.photoAnnotationVersion.findFirst = async () => ({
    version: 1,
    annotationJson,
    issueDescription: "原问题说明",
    longitude: 121.468,
    latitude: 31.286,
    altitude: 86.5,
    source: "manual",
    createdBy: "admin",
    createdAt: new Date("2026-07-12T00:00:00.000Z"),
  });
  const service = new PhotoAnnotationService(database as never);

  assert.equal((await service.getVersion("photo-1", 2)).version, 2);
  assert.equal((await service.getVersion("photo-1", 1)).version, 1);
});
