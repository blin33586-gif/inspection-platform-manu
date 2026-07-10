import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { describeTilePackage, normalizeTilePackagePath } from "./tile-package-metadata.js";

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
const execFileAsync = promisify(execFile);

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

  async createTilePackageFromUpload(file: UploadedFileLike | undefined, input: CreateMapAssetInput) {
    if (!file) throw new BadRequestException("瓦片 ZIP 文件不能为空");
    if (extname(file.originalname).toLowerCase() !== ".zip") {
      await this.removeTempFile(file.path);
      throw new BadRequestException("仅支持上传 ZIP 格式瓦片包");
    }

    const entries = await this.listArchiveEntries(file.path);
    const tileEntries = entries.filter((entry) => !entry.endsWith("/") && !this.isArchiveMetadata(entry));
    const metadata = describeTilePackage(tileEntries);
    const normalizedPaths = tileEntries.map(normalizeTilePackagePath);
    if (new Set(normalizedPaths).size !== normalizedPaths.length) {
      await this.removeTempFile(file.path);
      throw new BadRequestException("瓦片包中存在重复瓦片坐标");
    }

    const id = `map-${randomUUID()}`;
    const storedFileName = `${id}.zip`;
    const storagePath = join(this.finalDir, storedFileName);
    const tilePath = join("storage/map-tiles", id);

    await mkdir(this.finalDir, { recursive: true });
    await rename(file.path, storagePath);

    try {
      await this.extractTiles(storagePath, tilePath, tileEntries);
      const asset = await this.database.mapAsset.create({
        data: {
          id,
          name: input.name?.trim() || this.nameFromFile(file.originalname),
          mapType: input.mapType?.trim() || "街道总览",
          sourceType: "tile",
          fileName: storedFileName,
          originalFileName: file.originalname,
          storagePath,
          mimeType: file.mimetype || "application/zip",
          fileSize: file.size,
          tilePath,
          tileMetadata: JSON.stringify(metadata),
          isActive: false,
          processStatus: "ready",
          hotAreaCount: 0,
        },
      });

      await this.auditService.record({
        action: "map.tiles.upload",
        targetType: "mapAsset",
        targetId: asset.id,
        summary: `上传离线瓦片底图「${asset.name}」，共 ${metadata.tileCount} 张瓦片`,
      });

      return asset;
    } catch (error) {
      await Promise.all([rm(storagePath, { force: true }), rm(tilePath, { recursive: true, force: true })]);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException("瓦片包解压失败，请检查 ZIP 文件是否完整");
    }
  }

  async publishTileMap(id: string) {
    const mapAsset = await this.database.mapAsset.findUnique({ where: { id } });
    if (!mapAsset || mapAsset.sourceType !== "tile" || !mapAsset.tilePath || !mapAsset.tileMetadata) {
      throw new NotFoundException("可发布的瓦片底图不存在");
    }

    await this.database.$transaction([
      this.database.mapAsset.updateMany({
        where: { sourceType: "tile", isActive: true },
        data: { isActive: false },
      }),
      this.database.mapAsset.update({
        where: { id },
        data: { isActive: true, processStatus: "published" },
      }),
    ]);

    await this.auditService.record({
      action: "map.tiles.publish",
      targetType: "mapAsset",
      targetId: id,
      summary: `发布首页离线底图「${mapAsset.name}」`,
    });
  }

  private async listArchiveEntries(archivePath: string) {
    try {
      const { stdout } = await execFileAsync("unzip", ["-Z1", archivePath], { maxBuffer: 32 * 1024 * 1024 });
      return stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
    } catch {
      await this.removeTempFile(archivePath);
      throw new BadRequestException("无法读取瓦片 ZIP 文件");
    }
  }

  private async extractTiles(archivePath: string, tilePath: string, archiveEntries: string[]) {
    const tileRoot = resolve(process.cwd(), tilePath);
    const stagingPath = `${tileRoot}-staging-${randomUUID()}`;
    await mkdir(stagingPath, { recursive: true });

    try {
      await execFileAsync("unzip", ["-qq", archivePath, "-d", stagingPath], { maxBuffer: 32 * 1024 * 1024 });
      for (const archiveEntry of archiveEntries) {
        const destinationPath = resolve(tileRoot, normalizeTilePackagePath(archiveEntry));
        if (!destinationPath.startsWith(`${tileRoot}${sep}`)) throw new BadRequestException("瓦片路径无效");

        const sourcePath = resolve(stagingPath, archiveEntry);
        const fileStat = await lstat(sourcePath);
        if (!fileStat.isFile()) throw new BadRequestException("瓦片包包含非图片文件");

        await mkdir(dirname(destinationPath), { recursive: true });
        await rename(sourcePath, destinationPath);
      }
    } finally {
      await rm(stagingPath, { recursive: true, force: true });
    }
  }

  private isArchiveMetadata(entry: string) {
    return entry.startsWith("__MACOSX/") || entry.endsWith("/.DS_Store") || entry === ".DS_Store";
  }

  private nameFromFile(fileName: string) {
    return fileName.replace(/\.[^.]+$/, "") || "未命名地图";
  }

  private async removeTempFile(path: string) {
    await rm(path, { force: true });
  }
}
