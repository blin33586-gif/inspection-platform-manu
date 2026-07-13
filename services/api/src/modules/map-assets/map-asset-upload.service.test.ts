import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { runWithProjectContext } from "../auth/project-context.js";
import * as mapAssetsController from "./map-assets.controller.js";
import { MapAssetUploadService } from "./map-asset-upload.service.js";

type Role = "member" | "platform_admin";
type TestFileFilter = (request: unknown, file: { originalname: string }, callback: (error: Error | null, accepted: boolean) => void) => void;

const uploadTempRoot = resolve(process.cwd(), "storage/map-assets/tmp");

async function createUploadTempDirectory(prefix: string) {
  await mkdir(uploadTempRoot, { recursive: true });
  return mkdtemp(join(uploadTempRoot, prefix));
}

function runFileFilter(fileFilter: TestFileFilter | undefined, originalname: string) {
  const results: Array<{ error: Error | null; accepted: boolean }> = [];
  fileFilter?.({}, { originalname }, (error, accepted) => {
    results.push({ error, accepted });
  });
  return results[0];
}

async function runUpload(fileName: string, options: {
  method?: "unified" | "compatibility";
  projectId?: string;
  role?: Role;
  mapCreateError?: Error;
  jobError?: Error;
  input?: Record<string, unknown>;
} = {}) {
  const tempDirectory = await createUploadTempDirectory("xunjianbao-map-upload-");
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
    $transaction: async (operation: (transaction: Record<string, unknown>) => Promise<unknown>) => operation(database as unknown as Record<string, unknown>),
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
        username: options.role === "platform_admin" ? "admin" : "member",
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

test("Multer rejects unsupported extensions before writing them to disk", () => {
  const unifiedOptions = (mapAssetsController as unknown as {
    MAP_UPLOAD_OPTIONS?: { fileFilter?: TestFileFilter };
  }).MAP_UPLOAD_OPTIONS;
  assert.equal(typeof unifiedOptions?.fileFilter, "function");

  const result = runFileFilter(unifiedOptions?.fileFilter, "street.png");

  assert.match(result?.error?.message ?? "", /TIF\/TIFF.*ZIP/);
  assert.equal(result?.accepted, false);
});

test("Multer accepts supported extensions case-insensitively on the unified route", () => {
  const fileFilter = (mapAssetsController as unknown as {
    MAP_UPLOAD_OPTIONS?: { fileFilter?: TestFileFilter };
  }).MAP_UPLOAD_OPTIONS?.fileFilter;

  for (const originalname of ["base.TIF", "base.TiFf", "tiles.ZIP"]) {
    assert.deepEqual(runFileFilter(fileFilter, originalname), { error: null, accepted: true });
  }
});

test("map history response exposes project-wide processing outside the current page", async () => {
  const controller = new mapAssetsController.MapAssetsController(
    {} as never,
    {
      mapAssets: async () => [{ id: "map-terminal", processStatus: "published" }],
      hasActiveMapProcessing: async () => true,
    } as never,
    {} as never,
    {} as never,
  );

  const response = await controller.list({ page: "2", pageSize: "1" });

  assert.equal(response.data.hasProcessing, true);
  assert.equal(response.data.page, 2);
  assert.deepEqual(response.data.items, []);
});

test("the legacy tile-package Multer boundary remains ZIP-only", () => {
  const fileFilter = (mapAssetsController as unknown as {
    TILE_PACKAGE_UPLOAD_OPTIONS?: { fileFilter?: TestFileFilter };
  }).TILE_PACKAGE_UPLOAD_OPTIONS?.fileFilter;
  assert.equal(typeof fileFilter, "function");

  const result = runFileFilter(fileFilter, "base.tif");
  assert.match(result?.error?.message ?? "", /ZIP/);
  assert.equal(result?.accepted, false);
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

test("rejects TIFF through the old tile-package service wrapper", async () => {
  await assert.rejects(() => runUpload("street-base.tif", { method: "compatibility" }), /ZIP/);
});

test("accepts both project members and platform administrators without trusting uploader input", async () => {
  const member = await runUpload("member.tiff", { input: { uploadedByAccountId: "spoofed" } });
  const admin = await runUpload("admin.tif", { role: "platform_admin", input: { uploadedByAccountId: "spoofed" } });

  assert.equal(member.createCalls[0].data.uploadedByAccountId, "account-member");
  assert.equal(admin.createCalls[0].data.uploadedByAccountId, "account-admin");
});

test("rejects PNG/JPEG uploads and removes their temporary files", async () => {
  for (const fileName of ["street-base.png", "street-base.jpeg"]) {
    const tempDirectory = await createUploadTempDirectory("xunjianbao-map-invalid-");
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
  const tempDirectory = await createUploadTempDirectory("xunjianbao-map-failed-");
  const tempPath = join(tempDirectory, "failed.tif");
  await writeFile(tempPath, "map-source");
  const database = {
    mapAsset: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        storedPath = data.storagePath as string;
        throw new Error("database unavailable");
      },
    },
    $transaction: async (operation: (transaction: Record<string, unknown>) => Promise<unknown>) => operation(database as unknown as Record<string, unknown>),
  };
  const service = new MapAssetUploadService(database as never, { record: async () => undefined } as never);

  await assert.rejects(() => runWithProjectContext({
    projectId: "jinshan",
    identity: { id: "account-member", sub: "account-member", username: "member", name: "成员", role: "member", tokenVersion: 1, projectIds: ["jinshan"] },
  }, () => service.createFromUpload({ filename: "failed.tif", originalname: "failed.tif", mimetype: "image/tiff", path: tempPath, size: 10 }, {})), /database unavailable/);
  await assert.rejects(access(storedPath));
  await assert.rejects(access(tempPath));
  await rm(tempDirectory, { recursive: true, force: true });
});

test("atomically rolls back queued history and preserves a failed history when job creation fails", async () => {
  const tempDirectory = await createUploadTempDirectory("xunjianbao-map-queue-failed-");
  const tempPath = join(tempDirectory, "queue-failed.zip");
  await writeFile(tempPath, "map-source");
  const records = new Map<string, Record<string, unknown>>();
  let transactionCalls = 0;
  let storedPath = "";
  const createAsset = async ({ data }: { data: Record<string, unknown> }, target: Map<string, Record<string, unknown>>) => {
    storedPath = data.storagePath as string;
    target.set(data.id as string, { ...data });
    return {
      ...data,
      createdAt: new Date("2026-07-13T14:00:00.000Z"),
      activatedAt: null,
      uploadedBy: { name: "成员" },
    };
  };
  const database = {
    mapAsset: {
      create: async (input: { data: Record<string, unknown> }) => createAsset(input, records),
    },
    mediaProcessingJob: {
      upsert: async () => {
        throw new Error("queue unavailable");
      },
    },
    $transaction: async (operation: (transaction: Record<string, unknown>) => Promise<unknown>) => {
      transactionCalls += 1;
      const stagedRecords = new Map(records);
      const transaction = {
        mapAsset: { create: async (input: { data: Record<string, unknown> }) => createAsset(input, stagedRecords) },
        mediaProcessingJob: { upsert: async () => { throw new Error("queue unavailable"); } },
      };
      const result = await operation(transaction);
      records.clear();
      for (const [id, record] of stagedRecords) records.set(id, record);
      return result;
    },
  };
  const service = new MapAssetUploadService(database as never, { record: async () => undefined } as never);

  await assert.rejects(() => runWithProjectContext({
    projectId: "jinshan",
    identity: { id: "account-member", sub: "account-member", username: "member", name: "成员", role: "member", tokenVersion: 1, projectIds: ["jinshan"] },
  }, () => service.createFromUpload({ filename: "queue-failed.zip", originalname: "queue-failed.zip", mimetype: "application/zip", path: tempPath, size: 10 }, {})), /queue unavailable/);
  assert.equal(transactionCalls, 1);
  assert.equal(records.size, 1);
  const [failedRecord] = records.values();
  assert.equal(failedRecord.processStatus, "failed");
  assert.equal(failedRecord.errorMessage, "地图处理失败，请重新上传；如仍失败请联系管理员");
  assert.equal(await readFile(storedPath, "utf8"), "map-source");
  await rm(storedPath, { force: true });
  await rm(tempDirectory, { recursive: true, force: true });
});

test("never masks the original job error or leaves queued history when failed-history persistence also fails", async () => {
  const tempDirectory = await createUploadTempDirectory("xunjianbao-map-double-failed-");
  const tempPath = join(tempDirectory, "double-failed.tif");
  await writeFile(tempPath, "map-source");
  const records = new Map<string, Record<string, unknown>>();
  let standaloneCreateCalls = 0;
  let storedPath = "";
  const database = {
    mapAsset: {
      create: async () => {
        standaloneCreateCalls += 1;
        throw new Error("failed history unavailable");
      },
    },
    $transaction: async (operation: (transaction: Record<string, unknown>) => Promise<unknown>) => {
      const stagedRecords = new Map(records);
      return operation({
        mapAsset: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            storedPath = data.storagePath as string;
            stagedRecords.set(data.id as string, { ...data });
            return {
              ...data,
              createdAt: new Date("2026-07-13T14:00:00.000Z"),
              activatedAt: null,
              uploadedBy: { name: "成员" },
            };
          },
        },
        mediaProcessingJob: { upsert: async () => { throw new Error("queue unavailable"); } },
      });
    },
  };
  const service = new MapAssetUploadService(database as never, { record: async () => undefined } as never);

  await assert.rejects(() => runWithProjectContext({
    projectId: "jinshan",
    identity: { id: "account-member", sub: "account-member", username: "member", name: "成员", role: "member", tokenVersion: 1, projectIds: ["jinshan"] },
  }, () => service.createFromUpload({ filename: "double-failed.tif", originalname: "double-failed.tif", mimetype: "image/tiff", path: tempPath, size: 10 }, {})), /queue unavailable/);
  assert.equal(standaloneCreateCalls, 1);
  assert.equal(records.size, 0);
  await assert.rejects(access(storedPath));
  await assert.rejects(access(tempPath));
  await rm(tempDirectory, { recursive: true, force: true });
});

test("refuses to rename or remove a supplied file outside the configured Multer temp root", async () => {
  const outsideDirectory = await mkdtemp(join(tmpdir(), "xunjianbao-map-outside-"));
  const outsidePath = join(outsideDirectory, "outside.tif");
  await writeFile(outsidePath, "must-remain");
  const service = new MapAssetUploadService({} as never, { record: async () => undefined } as never);

  try {
    await assert.rejects(() => runWithProjectContext({
      projectId: "jinshan",
      identity: { id: "account-member", sub: "account-member", username: "member", name: "成员", role: "member", tokenVersion: 1, projectIds: ["jinshan"] },
    }, () => service.createFromUpload({ filename: "outside.tif", originalname: "outside.tif", mimetype: "image/tiff", path: outsidePath, size: 10 }, {})), /临时目录/);
    assert.equal(await readFile(outsidePath, "utf8"), "must-remain");
  } finally {
    await rm(outsideDirectory, { recursive: true, force: true });
  }
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
