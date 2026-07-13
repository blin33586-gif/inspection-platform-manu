import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { TileMapMetadata } from "@xunjianbao/shared";
import { extractArchiveImages, type ExtractedArchiveImage } from "./archive-image-extractor.js";
import { extractVideoFrames, type ExtractedFrame } from "./ffmpeg-frame-extractor.js";
import { enrichExtractedFrames, type EnrichedFrame } from "./frame-telemetry-enrichment.js";
import { runTiffTileJob } from "./gdal-tile-generator.js";
import { extractTilePackage, type ExtractTilePackageInput } from "./map-tile-package-extractor.js";
import {
  prepareInspectionImage,
  type PreparedInspectionImage,
  type PrepareInspectionImageInput,
} from "./image-preview.js";

interface TiffJobInput {
  mapAssetId: string;
  sourcePath: string;
  minZoom: number;
  maxZoom: number;
}

interface MapTilePackageJobInput {
  mapAssetId: string;
  sourcePath: string;
}

interface FrameExtractionJobInput {
  inspectionTaskId?: string;
  mediaId: string;
  sourcePath: string;
  intervalSeconds: number;
}

interface ArchiveExtractionJobInput {
  inspectionTaskId?: string;
  mediaId: string;
  sourcePath: string;
}

interface ImagePrepareJobInput {
  inspectionTaskId: string;
  mediaIds: string[];
}

interface JobRunnerHandlers {
  extractVideoFrames?: (
    inputPath: string,
    outputDirectory: string,
    intervalSeconds: number,
  ) => Promise<ExtractedFrame[]>;
  extractArchiveImages?: (
    inputPath: string,
    outputDirectory: string,
  ) => Promise<ExtractedArchiveImage[]>;
  prepareInspectionImage?: (input: PrepareInspectionImageInput) => Promise<PreparedInspectionImage>;
  enrichExtractedFrames?: (videoPath:string, frames:ExtractedFrame[]) => Promise<{frames:EnrichedFrame[];stats:Record<string,unknown>}>;
  extractTilePackage?: (input: ExtractTilePackageInput) => Promise<TileMapMetadata>;
  runTiffTileJob?: typeof runTiffTileJob;
}

export class JobRunner {
  private readonly extractVideoFramesHandler: NonNullable<JobRunnerHandlers["extractVideoFrames"]>;
  private readonly extractArchiveImagesHandler: NonNullable<JobRunnerHandlers["extractArchiveImages"]>;
  private readonly prepareInspectionImageHandler: NonNullable<JobRunnerHandlers["prepareInspectionImage"]>;
  private readonly enrichExtractedFramesHandler: NonNullable<JobRunnerHandlers["enrichExtractedFrames"]>;
  private readonly extractTilePackageHandler: NonNullable<JobRunnerHandlers["extractTilePackage"]>;
  private readonly runTiffTileJobHandler: NonNullable<JobRunnerHandlers["runTiffTileJob"]>;
  private processing = false;

  constructor(
    private readonly database: PrismaClient,
    private readonly storageRoot = resolve(process.cwd(), "../api/storage"),
    handlers: JobRunnerHandlers = {},
  ) {
    this.extractVideoFramesHandler = handlers.extractVideoFrames ?? extractVideoFrames;
    this.extractArchiveImagesHandler = handlers.extractArchiveImages ?? extractArchiveImages;
    this.prepareInspectionImageHandler = handlers.prepareInspectionImage ?? prepareInspectionImage;
    this.enrichExtractedFramesHandler = handlers.enrichExtractedFrames ?? enrichExtractedFrames;
    this.extractTilePackageHandler = handlers.extractTilePackage ?? extractTilePackage;
    this.runTiffTileJobHandler = handlers.runTiffTileJob ?? runTiffTileJob;
  }

  async processNext() {
    if (this.processing) return false;
    this.processing = true;
    try {
      const job = await this.claimOne();
      if (!job) return false;

      try {
        const projectId = job.projectId || "quyang";
        if (job.jobType === "tiff_tile") await this.processTiffJob(job.id, projectId, job.inputJson);
        else if (job.jobType === "map_tile_package") await this.processMapTilePackageJob(job.id, projectId, job.inputJson);
        else if (job.jobType === "frame_extract") await this.processFrameJob(job.id, projectId, job.inputJson);
        else if (job.jobType === "archive_extract") await this.processArchiveJob(job.id, projectId, job.inputJson);
        else if (job.jobType === "image_prepare") await this.processImagePrepareJob(job.id, projectId, job.inputJson);
        else throw new Error(`不支持的媒体任务类型：${job.jobType}`);
      } catch (error) {
        const projectId = job.projectId || "quyang";
        if (job.jobType === "tiff_tile" || job.jobType === "map_tile_package") {
          const mapAssetId = this.readMapAssetId(job.inputJson);
          if (mapAssetId) await this.failMapJob(job.id, projectId, mapAssetId, error);
          else await this.failJob(job.id, error);
        } else {
          await this.failJob(job.id, error);
          const inspectionTaskId = this.readInspectionTaskId(job.inputJson);
          if (inspectionTaskId) {
            await this.database.inspectionTask.updateMany({
              where: { id: inspectionTaskId, projectId },
              data: { processStatus: "failed" },
            });
          }
        }
      }

      return true;
    } finally {
      this.processing = false;
    }
  }

  private async failJob(jobId: string, error: unknown) {
    await this.database.mediaProcessingJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorMessage: this.errorMessage(error),
      },
    });
  }

  private async failMapJob(jobId: string, projectId: string, mapAssetId: string, error: unknown) {
    const { temporaryDirectory, finalDirectory } = this.mapOutputDirectories(mapAssetId);
    await Promise.all([
      rm(temporaryDirectory, { recursive: true, force: true }),
      rm(finalDirectory, { recursive: true, force: true }),
    ]);
    const errorMessage = this.errorMessage(error);
    await this.database.$transaction([
      this.database.mediaProcessingJob.update({
        where: { id: jobId },
        data: { status: "failed", errorMessage },
      }),
      this.database.mapAsset.update({
        where: { id: mapAssetId, projectId },
        data: { processStatus: "failed", errorMessage, isActive: false },
      }),
    ]);
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message.slice(0, 1000) : "媒体处理失败";
  }

  private async claimOne() {
    const candidate = await this.database.mediaProcessingJob.findFirst({
      where: { jobType: { in: ["tiff_tile", "map_tile_package", "frame_extract", "archive_extract", "image_prepare"] }, status: "queued" },
      orderBy: { createdAt: "asc" },
    });
    if (!candidate) return null;

    const claim = await this.database.mediaProcessingJob.updateMany({
      where: { id: candidate.id, status: "queued" },
      data: { status: "running", attempts: { increment: 1 }, startedAt: new Date(), errorMessage: null },
    });
    if (claim.count !== 1) return null;

    return this.database.mediaProcessingJob.findUnique({ where: { id: candidate.id } });
  }

  private async processTiffJob(jobId: string, projectId: string, rawInput: string) {
    const input = this.parseTiffInput(rawInput);
    const sourcePath = this.toStoragePath(input.sourcePath);
    const { temporaryDirectory } = await this.prepareMapOutput(input.mapAssetId);
    const result = await this.runTiffTileJobHandler({
      sourcePath,
      outputDirectory: temporaryDirectory,
      minZoom: input.minZoom,
      maxZoom: input.maxZoom,
    });
    await this.finishMapJob(jobId, projectId, input.mapAssetId, result.metadata);
  }

  private async processMapTilePackageJob(jobId: string, projectId: string, rawInput: string) {
    const input = this.parseMapTilePackageInput(rawInput);
    const sourcePath = this.toStoragePath(input.sourcePath);
    const { temporaryDirectory } = await this.prepareMapOutput(input.mapAssetId);
    const metadata = await this.extractTilePackageHandler({ sourcePath, outputDirectory: temporaryDirectory });
    await this.finishMapJob(jobId, projectId, input.mapAssetId, metadata);
  }

  private async prepareMapOutput(mapAssetId: string) {
    const directories = this.mapOutputDirectories(mapAssetId);
    await mkdir(resolve(this.storageRoot, "map-tiles"), { recursive: true });
    await rm(directories.temporaryDirectory, { recursive: true, force: true });
    return directories;
  }

  private async finishMapJob(jobId: string, projectId: string, mapAssetId: string, metadata: TileMapMetadata) {
    const { temporaryDirectory, finalDirectory } = this.mapOutputDirectories(mapAssetId);
    await rm(finalDirectory, { recursive: true, force: true });
    await rename(temporaryDirectory, finalDirectory);
    const publicTilePath = `storage/map-tiles/${mapAssetId}`;
    const activatedAt = new Date();
    await this.database.$transaction([
      this.database.mapAsset.updateMany({
        where: { projectId, isActive: true },
        data: { isActive: false },
      }),
      this.database.mapAsset.update({
        where: { id: mapAssetId, projectId },
        data: {
          projectId,
          sourceType: "tile",
          tilePath: publicTilePath,
          tileMetadata: JSON.stringify(metadata),
          processStatus: "published",
          isActive: true,
          activatedAt,
          errorMessage: null,
        },
      }),
      this.database.mediaProcessingJob.update({
        where: { id: jobId },
        data: {
          status: "completed",
          progress: 100,
          completedAt: activatedAt,
          errorMessage: null,
          outputJson: JSON.stringify({ tilePath: publicTilePath, metadata }),
        },
      }),
      this.database.auditLog.create({
        data: {
          projectId,
          id: `audit-${randomUUID()}`,
          actor: "system",
          action: "map.tiles.published",
          targetType: "mapAsset",
          targetId: mapAssetId,
          summary: "地图瓦片处理完成并自动启用",
        },
      }),
    ]);
  }

  private async processFrameJob(jobId: string, projectId: string, rawInput: string) {
    const input = this.parseFrameInput(rawInput);
    const inspectionTaskId = await this.resolveInspectionTaskId(input.inspectionTaskId, input.mediaId, projectId);
    const sourcePath = this.toStoragePath(input.sourcePath);
    const outputDirectory = resolve(this.storageRoot, "media", "frames", input.mediaId);
    const extractedFrames = await this.extractVideoFramesHandler(sourcePath, outputDirectory, input.intervalSeconds);
    const { frames, stats } = await this.enrichExtractedFramesHandler(sourcePath, extractedFrames);
    const publicDirectory = `storage/media/frames/${input.mediaId}`;

    const frameRows = frames.map((frame) => ({
      projectId,
      id: `frame-${input.mediaId}-${frame.timestampMs}`,
      kind: "frame",
      originalFileName: frame.fileName,
      storagePath: `${publicDirectory}/${basename(frame.storagePath)}`,
      mimeType: "image/jpeg",
      fileSize: frame.fileSize,
      parentMediaId: input.mediaId,
      videoTimestampMs: frame.timestampMs,
    }));
    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.database.mediaAsset.createMany({
        data: frameRows,
        skipDuplicates: true,
      }),
      this.database.mediaProcessingJob.update({
        where: { id: jobId },
        data: {
          projectId,
          status: "completed",
          progress: 100,
          completedAt: new Date(),
          errorMessage: null,
          outputJson: JSON.stringify({ frameCount: frames.length, frameDirectory: publicDirectory, ...stats }),
        },
      }),
      this.database.auditLog.create({
        data: {
          projectId,
          id: `audit-${randomUUID()}`,
          actor: "system",
          action: "media.frames.ready",
          targetType: "mediaAsset",
          targetId: input.mediaId,
          summary: `视频抽帧完成，共生成 ${frames.length} 张证据帧`,
        },
      }),
    ];
    if (inspectionTaskId) {
      operations.splice(1, 0,
        this.database.taskPhoto.createMany({
          data: frameRows.map((frame, index) => ({
            id: `photo-${frame.id}`,
            taskId: inspectionTaskId,
            mediaAssetId: frame.id,
            distributionStatus: "pending",
            archiveObjectId: null,
            videoTimestampMs: frame.videoTimestampMs,
            capturedAt: frames[index].telemetry?.capturedAt,
            latitude: frames[index].telemetry?.latitude,
            longitude: frames[index].telemetry?.longitude,
            absoluteAltitudeMeters: frames[index].telemetry?.absoluteAltitudeMeters,
            relativeAltitudeMeters: frames[index].telemetry?.relativeAltitudeMeters,
          })),
          skipDuplicates: true,
        }),
        this.database.inspectionTask.update({
          where: { id: inspectionTaskId, projectId },
          data: {
            processStatus: "ready_for_distribution",
            photoCount: frameRows.length,
            pendingPhotoCount: frameRows.length,
          },
        }),
      );
      for (const frame of frames) if (frame.telemetry) operations.splice(-1,0,this.database.taskPhotoTelemetry.upsert({where:{taskPhotoId:`photo-${frameRows.find(row=>row.videoTimestampMs===frame.timestampMs)!.id}`},create:{id:`telemetry-${frameRows.find(row=>row.videoTimestampMs===frame.timestampMs)!.id}`,taskPhotoId:`photo-${frameRows.find(row=>row.videoTimestampMs===frame.timestampMs)!.id}`,source:"dji_subtitle",sourceTimestampMs:frame.telemetry.timestampMs,matchOffsetMs:frame.telemetry.matchOffsetMs,capturedAt:frame.telemetry.capturedAt,latitude:frame.telemetry.latitude,longitude:frame.telemetry.longitude,relativeAltitudeMeters:frame.telemetry.relativeAltitudeMeters,absoluteAltitudeMeters:frame.telemetry.absoluteAltitudeMeters,gimbalYawDegrees:frame.telemetry.gimbalYawDegrees,gimbalPitchDegrees:frame.telemetry.gimbalPitchDegrees,gimbalRollDegrees:frame.telemetry.gimbalRollDegrees,focalLengthMillimeters:frame.telemetry.focalLengthMillimeters,digitalZoomRatio:frame.telemetry.digitalZoomRatio},update:{sourceTimestampMs:frame.telemetry.timestampMs,matchOffsetMs:frame.telemetry.matchOffsetMs,capturedAt:frame.telemetry.capturedAt,latitude:frame.telemetry.latitude,longitude:frame.telemetry.longitude,relativeAltitudeMeters:frame.telemetry.relativeAltitudeMeters,absoluteAltitudeMeters:frame.telemetry.absoluteAltitudeMeters,gimbalYawDegrees:frame.telemetry.gimbalYawDegrees,gimbalPitchDegrees:frame.telemetry.gimbalPitchDegrees,gimbalRollDegrees:frame.telemetry.gimbalRollDegrees,focalLengthMillimeters:frame.telemetry.focalLengthMillimeters,digitalZoomRatio:frame.telemetry.digitalZoomRatio}}));
    }
    await this.database.$transaction(operations);
  }

  private async processArchiveJob(jobId: string, projectId: string, rawInput: string) {
    const input = this.parseArchiveInput(rawInput);
    const inspectionTaskId = await this.resolveInspectionTaskId(input.inspectionTaskId, input.mediaId, projectId);
    const sourcePath = this.toStoragePath(input.sourcePath);
    const outputDirectory = resolve(this.storageRoot, "media", "images", input.mediaId);
    const images = await this.extractArchiveImagesHandler(sourcePath, outputDirectory);
    const publicDirectory = `storage/media/images/${input.mediaId}`;

    const imageRows = images.map((image) => ({
      projectId,
      id: `image-${input.mediaId}-${image.sortIndex + 1}`,
      kind: "image",
      originalFileName: image.fileName,
      storagePath: `${publicDirectory}/${basename(image.storagePath)}`,
      mimeType: image.mimeType,
      fileSize: image.fileSize,
      previewStoragePath: image.previewStoragePath ? `${publicDirectory}/previews/${basename(image.previewStoragePath)}` : null,
      previewMimeType: image.previewMimeType ?? null,
      previewFileSize: image.previewFileSize ?? null,
      parentMediaId: input.mediaId,
    }));
    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.database.mediaAsset.createMany({
        data: imageRows,
        skipDuplicates: true,
      }),
      this.database.mediaProcessingJob.update({
        where: { id: jobId },
        data: {
          projectId,
          status: "completed",
          progress: 100,
          completedAt: new Date(),
          errorMessage: null,
          outputJson: JSON.stringify({ imageCount: images.length, imageDirectory: publicDirectory }),
        },
      }),
      this.database.auditLog.create({
        data: {
          projectId,
          id: `audit-${randomUUID()}`,
          actor: "system",
          action: "media.archive.ready",
          targetType: "mediaAsset",
          targetId: input.mediaId,
          summary: `图片包解压完成，共生成 ${images.length} 张巡检照片`,
        },
      }),
    ];
    if (inspectionTaskId) {
      operations.splice(1, 0,
        this.database.taskPhoto.createMany({
          data: imageRows.map((image) => ({
            id: `photo-${image.id}`,
            taskId: inspectionTaskId,
            mediaAssetId: image.id,
            distributionStatus: "pending",
            archiveObjectId: null,
          })),
          skipDuplicates: true,
        }),
        this.database.inspectionTask.update({
          where: { id: inspectionTaskId, projectId },
          data: {
            processStatus: "ready_for_distribution",
            photoCount: imageRows.length,
            pendingPhotoCount: imageRows.length,
          },
        }),
      );
    }
    await this.database.$transaction(operations);
  }

  private async processImagePrepareJob(jobId: string, projectId: string, rawInput: string) {
    const input = this.parseImagePrepareInput(rawInput);
    const assets = await this.database.mediaAsset.findMany({
      where: { projectId, id: { in: input.mediaIds } },
      select: { id: true, originalFileName: true, storagePath: true },
    });
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const orderedAssets = input.mediaIds.map((id) => assetsById.get(id));
    if (orderedAssets.some((asset) => !asset)) throw new Error("直接上传图片素材不存在");

    const prepared = [] as Array<{ id: string; prepared: PreparedInspectionImage }>;
    for (const asset of orderedAssets) {
      const source = asset!;
      prepared.push({
        id: source.id,
        prepared: await this.prepareInspectionImageHandler({
          sourcePath: this.toStoragePath(source.storagePath),
          originalFileName: source.originalFileName,
          previewDirectory: resolve(this.storageRoot, "media", "previews"),
          previewFileName: `${source.id}.jpg`,
        }),
      });
    }

    const operations: Prisma.PrismaPromise<unknown>[] = [
      ...prepared.map(({ id, prepared: result }) => this.database.mediaAsset.update({
        where: { id, projectId },
        data: {
          mimeType: result.mimeType,
          previewStoragePath: result.previewStoragePath ? `storage/media/previews/${basename(result.previewStoragePath)}` : null,
          previewMimeType: result.previewMimeType ?? null,
          previewFileSize: result.previewFileSize ?? null,
        },
      })),
      this.database.taskPhoto.createMany({
        data: prepared.map(({ id }) => ({
          id: `photo-${id}`,
          taskId: input.inspectionTaskId,
          mediaAssetId: id,
          distributionStatus: "pending",
          archiveObjectId: null,
        })),
        skipDuplicates: true,
      }),
      this.database.inspectionTask.update({
        where: { id: input.inspectionTaskId, projectId },
        data: { processStatus: "ready_for_distribution", photoCount: prepared.length, pendingPhotoCount: prepared.length },
      }),
      this.database.mediaProcessingJob.update({
        where: { id: jobId },
        data: {
          projectId,
          status: "completed",
          progress: 100,
          completedAt: new Date(),
          errorMessage: null,
          outputJson: JSON.stringify({ imageCount: prepared.length, preparedImageCount: prepared.length }),
        },
      }),
      this.database.auditLog.create({
        data: {
          projectId,
          id: `audit-${randomUUID()}`,
          actor: "system",
          action: "media.images.ready",
          targetType: "inspectionTask",
          targetId: input.inspectionTaskId,
          summary: `直接上传图片校验完成，共生成 ${prepared.length} 张巡检照片`,
        },
      }),
    ];
    await this.database.$transaction(operations);
  }

  private parseTiffInput(rawInput: string): TiffJobInput {
    const input = JSON.parse(rawInput) as Partial<TiffJobInput>;
    if (!this.isSafeMapAssetId(input.mapAssetId) || !input.sourcePath || !Number.isInteger(input.minZoom) || !Number.isInteger(input.maxZoom)) {
      throw new Error("TIF 瓦片任务参数无效");
    }
    return input as TiffJobInput;
  }

  private parseMapTilePackageInput(rawInput: string): MapTilePackageJobInput {
    const input = JSON.parse(rawInput) as Partial<MapTilePackageJobInput>;
    if (!this.isSafeMapAssetId(input.mapAssetId) || !input.sourcePath) {
      throw new Error("ZIP 瓦片任务参数无效");
    }
    return input as MapTilePackageJobInput;
  }

  private parseFrameInput(rawInput: string): FrameExtractionJobInput {
    const input = JSON.parse(rawInput) as Partial<FrameExtractionJobInput>;
    if (!input.mediaId || !input.sourcePath || !Number.isInteger(input.intervalSeconds) || input.intervalSeconds! < 1 || input.intervalSeconds! > 5) {
      throw new Error("视频抽帧任务参数无效");
    }
    return input as FrameExtractionJobInput;
  }

  private parseArchiveInput(rawInput: string): ArchiveExtractionJobInput {
    const input = JSON.parse(rawInput) as Partial<ArchiveExtractionJobInput>;
    if (!input.mediaId || !input.sourcePath) throw new Error("图片包解压任务参数无效");
    return input as ArchiveExtractionJobInput;
  }

  private parseImagePrepareInput(rawInput: string): ImagePrepareJobInput {
    const input = JSON.parse(rawInput) as Partial<ImagePrepareJobInput>;
    if (!input.inspectionTaskId || !Array.isArray(input.mediaIds) || !input.mediaIds.length || input.mediaIds.some((id) => !id)) {
      throw new Error("直接图片预览任务参数无效");
    }
    return input as ImagePrepareJobInput;
  }

  private async resolveInspectionTaskId(inputTaskId: string | undefined, mediaId: string, projectId: string) {
    if (inputTaskId) return inputTaskId;
    const task = await this.database.inspectionTask.findUnique({
      where: { sourceMediaId: mediaId, projectId },
      select: { id: true },
    });
    return task?.id ?? null;
  }

  private readInspectionTaskId(rawInput: string) {
    try {
      const input = JSON.parse(rawInput) as { inspectionTaskId?: unknown };
      return typeof input.inspectionTaskId === "string" ? input.inspectionTaskId : null;
    } catch {
      return null;
    }
  }

  private readMapAssetId(rawInput: string) {
    try {
      const input = JSON.parse(rawInput) as { mapAssetId?: unknown };
      return this.isSafeMapAssetId(input.mapAssetId) ? input.mapAssetId : null;
    } catch {
      return null;
    }
  }

  private isSafeMapAssetId(value: unknown): value is string {
    return typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value);
  }

  private mapOutputDirectories(mapAssetId: string) {
    if (!this.isSafeMapAssetId(mapAssetId)) throw new Error("地图资产编号无效");
    return {
      temporaryDirectory: resolve(this.storageRoot, "map-tiles", `.tmp-${mapAssetId}`),
      finalDirectory: resolve(this.storageRoot, "map-tiles", mapAssetId),
    };
  }

  private toStoragePath(storedPath: string) {
    const normalized = storedPath.replace(/^storage\//, "");
    const absolutePath = resolve(this.storageRoot, normalized);
    const relativePath = relative(this.storageRoot, absolutePath);
    if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) throw new Error("媒体源文件路径无效");
    return absolutePath;
  }
}
