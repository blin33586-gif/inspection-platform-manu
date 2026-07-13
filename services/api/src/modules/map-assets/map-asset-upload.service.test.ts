import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { runWithProjectContext } from "../auth/project-context.js";
import * as mapAssetsController from "./map-assets.controller.js";
import { MapAssetUploadService } from "./map-asset-upload.service.js";

type Role = "member" | "platform_admin";

async function runUpload(fileName: string, options: {
  method?: "unified" | "compatibility";
  projectId?: string;
  role?: Role;
  mapCreateError?: Error;
  jobError?: Error;
  input?: Record<string, unknown>;
} = {}) {
  const tempDirectory = await mkdtemp(join(tmpdir(), "xunjianbao-map-upload-"));
  const tempPath = join(tempDirectory, basename(fileName));
  await writeFile(tempPath, "map-source");

  const createCalls: Array<{ data: Record<string, unknown> }> = [];
  const upsertCalls: Array<Record<string, unknown>> = [];
  const updateCalls: Array<Record<string, unknown>> = [];
  const database = {
    mapAsset: {
      create: async (input: { data: Record<string, unknown> }) => {
        createCalls.push(input);
        if (options.mapCreateError) throw options.mapCreateError;
        return {
          id: input.data.id,
          name: input.data.name,
          mapType: input.data.mapType,
          sourceType: input.data.sourceType,
          fileName: input.data.fileName,
          originalFileName: input.data.originalFileName,
          mimeType: input.data.mimeType,
          fileSize: input.data.fileSize,
          processStatus: input.data.processStatus,
          hotAreaCount: input.data.hotAreaCount,
          createdAt: new Date("2026-07-13T14:00:00.000Z"),
          activatedAt: null,
          errorMessage: null,
          uploadedBy: { name: options.role === "platform_admin" ? "平台管理员" : "项目成员" },
        };
      },
      update: async (input: Record<string, unknown>) => {
        updateCalls.push(input);
      },
    },
    mediaProcessingJob: {
      upsert: async (input: Record<string, unknown>) => {
        upsertCalls.push(input);
        if (options.jobError) throw options.jobError;
      },
    },
  };
  const auditService = { record: async () => undefined };
  const service = new MapAssetUploadService(database as never, auditService as never);

  try {
    const upload = () => service.createFromUpload({
      filename: basename(tempPath),
      originalname: fileName,
      mimetype: fileName.endsWith(".zip") ? "application/zip" : "image/tiff",
      path: tempPath,
      size: 10,
    }, options.input ?? {});
    const compatibilityUpload = () => service.createTilePackageFromUpload({
      filename: basename(tempPath),
      originalname: fileName,
      mimetype: "application/zip",
      path: tempPath,
      size: 10,
    }, options.input ?? {});

    const result = await runWithProjectContext({
      projectId: options.projectId ?? "jinshan",
      identity: {
        id: options.role === "platform_admin" ? "account-admin" : "account-member",
        sub: options.role === "platform_admin" ? "account-admin" : "account-member",
        name: options.role === "platform_admin" ? "平台管理员" : "项目成员",
        role: options.role ?? "member",
        tokenVersion: 1,
        projectIds: [options.projectId ?? "jinshan"],
      },
    }, options.method === "compatibility" ? compatibilityUpload : upload);
    const storedContent = typeof createCalls[0]?.data.storagePath === "string"
      ? await readFile(createCalls[0].data.storagePath, "utf8")
      : null;

    return { createCalls, upsertCalls, updateCalls, result, tempPath, storedContent };
  } finally {
    const storedPath = createCalls[0]?.data.storagePath;
    if (typeof storedPath === "string") await rm(storedPath, { force: true });
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

test("uses Multer disk destination so the API never buffers the whole upload", () => {
  const options = (mapAssetsController as unknown as { MAP_UPLOAD_OPTIONS?: Record<string, unknown> }).MAP_UPLOAD_OPTIONS;
  assert.equal(options?.dest, "storage/map-assets/tmp");
  assert.equal(options ? "storage" in options : false, false);
});

test("queues a TIFF without reading it into memory and records authenticated uploader", async () => {
  const { createCalls, upsertCalls, storedContent } = await runUpload("street-base.tif");

  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].data.projectId, "jinshan");
  assert.equal(createCalls[0].data.uploadedByAccountId, "account-member");
  assert.equal(createCalls[0].data.processStatus, "queued");
  assert.equal(upsertCalls.length, 1);
  assert.deepEqual(upsertCalls[0].where, { dedupeKey: `tiff_tile:${createCalls[0].data.id}:v1` });
  assert.deepEqual(upsertCalls[0].create, {
    projectId: "jinshan",
    id: `job-tiff-${createCalls[0].data.id}`,
    jobType: "tiff_tile",
    status: "queued",
    dedupeKey: `tiff_tile:${createCalls[0].data.id}:v1`,
    inputJson: JSON.stringify({
      mapAssetId: createCalls[0].data.id,
      sourcePath: createCalls[0].data.storagePath,
      minZoom: 16,
      maxZoom: 19,
    }),
  });
  assert.equal(storedContent, "map-source");
});

test("queues an XYZ ZIP for worker-side validation without inspecting the archive", async () => {
  const { createCalls, upsertCalls } = await runUpload("street-tiles.zip");

  assert.equal(createCalls[0].data.sourceType, "tile");
  assert.equal(createCalls[0].data.processStatus, "queued");
  assert.deepEqual(upsertCalls[0].create, {
    projectId: "jinshan",
    id: `job-map-package-${createCalls[0].data.id}`,
    jobType: "map_tile_package",
    status: "queued",
    dedupeKey: `map_tile_package:${createCalls[0].data.id}:v1`,
    inputJson: JSON.stringify({
      mapAssetId: createCalls[0].data.id,
      sourcePath: createCalls[0].data.storagePath,
    }),
  });
});

test("keeps the old tile-package method as a unified upload wrapper", async () => {
  const { upsertCalls } = await runUpload("street-tiles.zip", { method: "compatibility" });
  assert.equal((upsertCalls[0].create as { jobType: string }).jobType, "map_tile_package");
});

test("accepts both project members and platform administrators without trusting uploader input", async () => {
  const member = await runUpload("member.tiff", { input: { uploadedByAccountId: "spoofed" } });
  const admin = await runUpload("admin.tif", { role: "platform_admin", input: { uploadedByAccountId: "spoofed" } });

  assert.equal(member.createCalls[0].data.uploadedByAccountId, "account-member");
  assert.equal(admin.createCalls[0].data.uploadedByAccountId, "account-admin");
});

test("rejects PNG/JPEG uploads and removes their temporary files", async () => {
  for (const fileName of ["street-base.png", "street-base.jpeg"]) {
    const tempDirectory = await mkdtemp(join(tmpdir(), "xunjianbao-map-invalid-"));
    const tempPath = join(tempDirectory, fileName);
    await writeFile(tempPath, "not-allowed");
    const service = new MapAssetUploadService({} as never, { record: async () => undefined } as never);

    await assert.rejects(() => service.createFromUpload({ filename: fileName, originalname: fileName, mimetype: "image/png", path: tempPath, size: 11 }, {}), /TIF\/TIFF.*XYZ ZIP/);
    await assert.rejects(access(tempPath));
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test("uses generated safe storage names even when the original name contains a path", async () => {
  const { createCalls } = await runUpload("../../outside.tif");
  const storagePath = createCalls[0].data.storagePath as string;
  assert.match(basename(storagePath), /^map-[0-9a-f-]+\.tif$/);
  assert.equal(storagePath.includes(".."), false);
});

test("removes the durable file when creating upload history fails", async () => {
  let storedPath = "";
  const tempDirectory = await mkdtemp(join(tmpdir(), "xunjianbao-map-failed-"));
  const tempPath = join(tempDirectory, "failed.tif");
  await writeFile(tempPath, "map-source");
  const database = {
    mapAsset: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        storedPath = data.storagePath as string;
        throw new Error("database unavailable");
      },
    },
  };
  const service = new MapAssetUploadService(database as never, { record: async () => undefined } as never);

  await assert.rejects(() => runWithProjectContext({
    projectId: "jinshan",
    identity: { id: "account-member", sub: "account-member", name: "成员", role: "member", tokenVersion: 1, projectIds: ["jinshan"] },
  }, () => service.createFromUpload({ filename: "failed.tif", originalname: "failed.tif", mimetype: "image/tiff", path: tempPath, size: 10 }, {})), /database unavailable/);
  await assert.rejects(access(storedPath));
  await assert.rejects(access(tempPath));
  await rm(tempDirectory, { recursive: true, force: true });
});

test("marks upload history failed with the queue failure reason", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "xunjianbao-map-queue-failed-"));
  const tempPath = join(tempDirectory, "queue-failed.zip");
  await writeFile(tempPath, "map-source");
  let updateInput: Record<string, unknown> | undefined;
  let storedPath = "";
  const database = {
    mapAsset: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        storedPath = data.storagePath as string;
        return { id: data.id, name: data.name };
      },
      update: async (input: Record<string, unknown>) => {
        updateInput = input;
      },
    },
    mediaProcessingJob: {
      upsert: async () => {
        throw new Error("queue unavailable");
      },
    },
  };
  const service = new MapAssetUploadService(database as never, { record: async () => undefined } as never);

  await assert.rejects(() => runWithProjectContext({
    projectId: "jinshan",
    identity: { id: "account-member", sub: "account-member", name: "成员", role: "member", tokenVersion: 1, projectIds: ["jinshan"] },
  }, () => service.createFromUpload({ filename: "queue-failed.zip", originalname: "queue-failed.zip", mimetype: "application/zip", path: tempPath, size: 10 }, {})), /queue unavailable/);
  assert.ok(updateInput);
  const failedAssetId = (updateInput.where as { id: string }).id;
  assert.deepEqual(updateInput, {
    where: { id: failedAssetId, projectId: "jinshan" },
    data: { processStatus: "failed", errorMessage: "queue unavailable" },
  });
  assert.equal(await readFile(storedPath, "utf8"), "map-source");
  await rm(storedPath, { force: true });
  await rm(tempDirectory, { recursive: true, force: true });
});

test("records activation time when publishing a tile map in the selected project", async () => {
  let activatedUpdate: Record<string, unknown> | undefined;
  const database = {
    mapAsset: {
      findUnique: async () => ({
        id: "map-1",
        name: "金山瓦片",
        sourceType: "tile",
        tilePath: "storage/map-tiles/map-1",
        tileMetadata: "{}",
      }),
      updateMany: async () => ({ count: 1 }),
      update: async (input: Record<string, unknown>) => {
        activatedUpdate = input;
        return {};
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  };
  const service = new MapAssetUploadService(database as never, { record: async () => undefined } as never);

  await runWithProjectContext({ projectId: "jinshan" }, () => service.publishTileMap("map-1"));

  assert.ok(activatedUpdate);
  assert.deepEqual(activatedUpdate.where, { id: "map-1", projectId: "jinshan" });
  assert.equal((activatedUpdate.data as { isActive: boolean }).isActive, true);
  assert.ok((activatedUpdate.data as { activatedAt?: unknown }).activatedAt instanceof Date);
});
