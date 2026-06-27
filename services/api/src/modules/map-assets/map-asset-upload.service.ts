import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";

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

const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"]);

@Injectable()
export class MapAssetUploadService {
  private readonly finalDir = "storage/map-assets";

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async createFromUpload(file: UploadedFileLike | undefined, input: CreateMapAssetInput) {
    if (!file) throw new BadRequestException("Map file is required");

    const extension = extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      await this.removeTempFile(file.path);
      throw new BadRequestException("Only image and TIF/TIFF map files are supported");
    }

    await mkdir(this.finalDir, { recursive: true });

    const id = `map-${randomUUID()}`;
    const storedFileName = `${id}${extension}`;
    const storagePath = join(this.finalDir, storedFileName);
    await rename(file.path, storagePath);

    const sourceType = extension === ".tif" || extension === ".tiff" ? "tiff" : "image";
    const asset = await this.database.mapAsset.create({
      data: {
        id,
        name: input.name?.trim() || this.nameFromFile(file.originalname),
        mapType: input.mapType?.trim() || "未分类地图",
        sourceType,
        fileName: storedFileName,
        originalFileName: file.originalname,
        storagePath,
        mimeType: file.mimetype,
        fileSize: file.size,
        processStatus: "uploaded",
        hotAreaCount: 0,
      },
      select: {
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
      },
    });

    await this.auditService.record({
      action: "map.upload",
      targetType: "mapAsset",
      targetId: asset.id,
      summary: `上传地图资产「${asset.name}」`,
    });

    return asset;
  }

  private nameFromFile(fileName: string) {
    return fileName.replace(/\.[^.]+$/, "") || "未命名地图";
  }

  private async removeTempFile(path: string) {
    await rm(path, { force: true });
  }
}
