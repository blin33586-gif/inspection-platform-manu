import { BadRequestException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { createTiffTileJob } from "@xunjianbao/map-core";
import { sanitizeMapProcessingFailureMessage } from "@xunjianbao/shared";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { currentIdentity, currentProjectId } from "../auth/project-context.js";

interface UploadedFileLike {
  filename: string;
  originalname: string;
  mimetype: string;
  path: string;
  size: number;
}

interface CreateMapAssetInput {
  name?: string;
  mapType?: string;
}

interface CreatedMapAsset {
  id: string;
  name: string;
  mapType: string;
  sourceType: string;
  fileName: string | null;
  originalFileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  processStatus: string;
  hotAreaCount: number;
  createdAt: Date;
  activatedAt: Date | null;
  errorMessage: string | null;
  uploadedBy: { name: string } | null;
}

const allowedExtensions = new Set([".tif", ".tiff", ".zip"]);
export const MAP_UPLOAD_TEMP_DIR = "storage/map-assets/tmp";

@Injectable()
export class MapAssetUploadService {
  private readonly finalDir = "storage/map-assets";

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async createFromUpload(file: UploadedFileLike | undefined, input: CreateMapAssetInput) {
    const identity = currentIdentity();
    if (!identity) throw new UnauthorizedException("缺少已认证的上传用户");
    const projectId = currentProjectId();
    if (!file) throw new BadRequestException("Map file is required");
    this.assertManagedTempPath(file.path);

    const extension = extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      await this.removeTempFile(file.path);
      throw new BadRequestException("仅支持 TIF/TIFF 底图或 XYZ ZIP 瓦片包");
    }

    const id = `map-${randomUUID()}`;
    const storedFileName = `${id}${extension}`;
    const storagePath = join(this.finalDir, storedFileName);
    const sourceType = extension === ".zip" ? "tile" : "tiff";
    const assetData = {
      projectId,
      id,
      name: input.name?.trim() || this.nameFromFile(file.originalname),
      mapType: input.mapType?.trim() || "未分类地图",
      sourceType,
      fileName: storedFileName,
      originalFileName: file.originalname,
      storagePath,
      mimeType: extension === ".zip" ? file.mimetype || "application/zip" : file.mimetype,
      fileSize: file.size,
      isActive: false,
      processStatus: "queued",
      hotAreaCount: 0,
      uploadedByAccountId: identity.id,
      errorMessage: null,
    };
    const assetSelect = {
      id: true,
      name: true,
      mapType: true,
      sourceType: true,
      fileName: true,
      originalFileName: true,
      mimeType: true,
      fileSize: true,
      processStatus: true,
      hotAreaCount: true,
      createdAt: true,
      activatedAt: true,
      errorMessage: true,
      uploadedBy: { select: { name: true } },
    } as const;

    try {
      await mkdir(this.finalDir, { recursive: true });
      await rename(file.path, storagePath);
    } catch (error) {
      await this.cleanupUploadFiles(file.path, storagePath);
      throw error;
    }

    let historyCreatedInTransaction = false;
    let auditFailed = false;
    let asset: CreatedMapAsset;
    try {
      asset = await this.database.$transaction(async (transaction) => {
        const createdAsset = await transaction.mapAsset.create({ data: assetData, select: assetSelect });
        historyCreatedInTransaction = true;

        if (sourceType === "tiff") {
          const job = createTiffTileJob(createdAsset.id, storagePath);
          await transaction.mediaProcessingJob.upsert({
            where: { dedupeKey: job.dedupeKey },
            create: {
              projectId,
              id: `job-tiff-${createdAsset.id}`,
              jobType: job.jobType,
              status: "queued",
              dedupeKey: job.dedupeKey,
              inputJson: JSON.stringify({
                mapAssetId: job.mapAssetId,
                sourcePath: job.sourcePath,
                minZoom: job.minZoom,
                maxZoom: job.maxZoom,
              }),
            },
            update: {},
          });
        } else {
          const dedupeKey = `map_tile_package:${createdAsset.id}:v1`;
          await transaction.mediaProcessingJob.upsert({
            where: { dedupeKey },
            create: {
              projectId,
              id: `job-map-package-${createdAsset.id}`,
              jobType: "map_tile_package",
              status: "queued",
              dedupeKey,
              inputJson: JSON.stringify({ mapAssetId: createdAsset.id, sourcePath: storagePath }),
            },
            update: {},
          });
        }

        try {
          await transaction.auditLog.create({
            data: {
              projectId,
              id: `audit-${randomUUID()}`,
              actor: identity.username,
              action: "map.upload",
              targetType: "mapAsset",
              targetId: createdAsset.id,
              summary: `上传地图资产「${createdAsset.name}」`,
            },
          });
        } catch (error) {
          auditFailed = true;
          throw error;
        }

        return createdAsset;
      });
    } catch (error) {
      if (auditFailed) {
        await this.cleanupUploadFiles(file.path, storagePath);
        throw error;
      }
      if (!historyCreatedInTransaction) {
        await this.cleanupUploadFiles(file.path, storagePath);
        throw error;
      }

      const errorMessage = sanitizeMapProcessingFailureMessage(error instanceof Error ? error.message : error);
      try {
        await this.database.mapAsset.create({
          data: { ...assetData, processStatus: "failed", errorMessage },
          select: { id: true },
        });
      } catch {
        await this.cleanupUploadFiles(file.path, storagePath);
      }
      throw error;
    }

    const { uploadedBy, ...summary } = asset;
    return {
      ...summary,
      uploadedByName: uploadedBy?.name ?? null,
      createdAt: summary.createdAt.toISOString(),
      activatedAt: summary.activatedAt?.toISOString() ?? null,
    };
  }

  async createTilePackageFromUpload(file: UploadedFileLike | undefined, input: CreateMapAssetInput) {
    if (!file) throw new BadRequestException("瓦片 ZIP 文件不能为空");
    this.assertManagedTempPath(file.path);
    if (extname(file.originalname).toLowerCase() !== ".zip") {
      await this.removeTempFile(file.path);
      throw new BadRequestException("仅支持上传 ZIP 格式瓦片包");
    }
    return this.createFromUpload(file, input);
  }

  async publishTileMap(id: string) {
    const identity = currentIdentity();
    if (!identity) throw new UnauthorizedException("缺少已认证的上传用户");
    const projectId = currentProjectId();
    const mapAsset = await this.database.mapAsset.findUnique({ where: { id, projectId } });
    if (!mapAsset || mapAsset.sourceType !== "tile" || !mapAsset.tilePath || !mapAsset.tileMetadata) {
      throw new NotFoundException("可发布的瓦片底图不存在");
    }

    await this.database.$transaction(async (transaction) => {
      await transaction.mapAsset.updateMany({
        where: { projectId, sourceType: "tile", isActive: true },
        data: { isActive: false },
      });
      await transaction.mapAsset.update({
        where: { id, projectId },
        data: { isActive: true, processStatus: "published", activatedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          projectId, id: `audit-${randomUUID()}`, actor: identity.username,
          action: "map.tiles.publish", targetType: "mapAsset", targetId: id,
          summary: `发布首页离线底图「${mapAsset.name}」`,
        },
      });
    });
  }

  private assertManagedTempPath(path: string) {
    const tempRoot = resolve(process.cwd(), MAP_UPLOAD_TEMP_DIR);
    const candidatePath = resolve(process.cwd(), path);
    if (!candidatePath.startsWith(`${tempRoot}${sep}`)) {
      throw new BadRequestException("上传文件不在受管临时目录内");
    }
  }

  private async cleanupUploadFiles(tempPath: string, storagePath: string) {
    this.assertManagedTempPath(tempPath);
    await Promise.allSettled([
      rm(tempPath, { force: true }),
      rm(storagePath, { force: true }),
    ]);
  }

  private nameFromFile(fileName: string) {
    return fileName.replace(/\.[^.]+$/, "") || "未命名地图";
  }

  private async removeTempFile(path: string) {
    this.assertManagedTempPath(path);
    await rm(path, { force: true });
  }
}
