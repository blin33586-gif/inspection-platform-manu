import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import { sanitizeMapProcessingFailureMessage, type TileMapMetadata } from "@xunjianbao/shared";
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
  removePath?: typeof rm;
}

interface MapOutputDirectories {
  temporaryDirectory: string;
  finalDirectory: string;
  promoted: boolean;
}

export class JobRunner {
  private readonly extractVideoFramesHandler: NonNullable<JobRunnerHandlers["extractVideoFrames"]>;
  private readonly extractArchiveImagesHandler: NonNullable<JobRunnerHandlers["extractArchiveImages"]>;
  private readonly prepareInspectionImageHandler: NonNullable<JobRunnerHandlers["prepareInspectionImage"]>;
  private readonly enrichExtractedFramesHandler: NonNullable<JobRunnerHandlers["enrichExtractedFrames"]>;
  private readonly extractTilePackageHandler: NonNullable<JobRunnerHandlers["extractTilePackage"]>;
  private readonly runTiffTileJobHandler: NonNullable<JobRunnerHandlers["runTiffTileJob"]>;
  private readonly removePathHandler: NonNullable<JobRunnerHandlers["removePath"]>;
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
    this.removePathHandler = handlers.removePath ?? rm;
  }

  async processNext() {
    if (this.processing) return false;
    this.processing = true;
    try {
      const job = await this.claimOne();
      if (!job) return false;

      try {
        const projectId = job.projectId || "quyang";
        if (job.jobType === "tiff_tile" || job.jobType === "map_tile_package") {
          const mapAssetId = this.readMapAssetId(job.inputJson);
          if (mapAssetId) await this.markMapJobRunning(projectId, mapAssetId);
        }
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
    const errorMessage = sanitizeMapProcessingFailureMessage(error instanceof Error ? error.message : error);
    await Promise.allSettled([
      Promise.resolve().then(() => this.database.mediaProcessingJob.update({
        where: { id: jobId },
        data: { status: "failed", errorMessage },
      })),
      Promise.resolve().then(() => this.database.mapAsset.updateMany({
        where: { id: mapAssetId, projectId, processStatus: { in: ["queued", "running"] } },
        data: { processStatus: "failed", errorMessage, isActive: false },
      })),
    ]);
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message.slice(0, 1000) : "媒体处理失败";
  }

  private async markMapJobRunning(projectId: string, mapAssetId: string) {
    await this.database.mapAsset.updateMany({
      where: { id: mapAssetId, projectId, processStatus: "queued" },
      data: { processStatus: "running", errorMessage: null },
    });
  }

  private async claimOne() {
    const skippedCandidateIds: string[] = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = await this.database.mediaProcessingJob.findFirst({
        where: {
          jobType: { in: ["tiff_tile", "map_tile_package", "frame_extract", "archive_extract", "image_prepare"] },
          status: "queued",
          ...(skippedCandidateIds.length ? { id: { notIn: skippedCandidateIds } } : {}),
        },
        orderBy: { createdAt: "asc" },
      });
      if (!candidate) return null;

      const claim = await this.database.mediaProcessingJob.updateMany({
        where: { id: candidate.id, status: "queued" },
        data: { status: "running", attempts: { increment: 1 }, startedAt: new Date(), errorMessage: null },
      });
      if (claim.count === 1) {
        return this.database.mediaProcessingJob.findUnique({ where: { id: candidate.id } });
      }
      skippedCandidateIds.push(candidate.id);
    }
    return null;
  }

  private async processTiffJob(jobId: string, projectId: string, rawInput: string) {
    const input = this.parseTiffInput(rawInput);
    const sourcePath = await this.validateMapJobSource(projectId, "tiff_tile", input);
    const directories = await this.prepareMapOutput(jobId, input.mapAssetId);
    try {
      const result = await this.runTiffTileJobHandler({
        sourcePath,
        outputDirectory: directories.temporaryDirectory,
        minZoom: input.minZoom,
        maxZoom: input.maxZoom,
      });
      await this.finishMapJob(jobId, projectId, input.mapAssetId, result.metadata, directories);
    } catch (error) {
      await this.cleanupOwnedMapOutput(directories);
      throw error;
    }
  }

  private async processMapTilePackageJob(jobId: string, projectId: string, rawInput: string) {
    const input = this.parseMapTilePackageInput(rawInput);
    const sourcePath = await this.validateMapJobSource(projectId, "map_tile_package", input);
    const directories = await this.prepareMapOutput(jobId, input.mapAssetId);
    try {
      const metadata = await this.extractTilePackageHandler({
        sourcePath,
        outputDirectory: directories.temporaryDirectory,
      });
      await this.finishMapJob(jobId, projectId, input.mapAssetId, metadata, directories);
    } catch (error) {
      await this.cleanupOwnedMapOutput(directories);
      throw error;
    }
  }

  private async prepareMapOutput(jobId: string, mapAssetId: string) {
    const directories = this.mapOutputDirectories(jobId, mapAssetId);
    await mkdir(resolve(this.storageRoot, "map-tiles"), { recursive: true });
    return directories;
  }

  private async finishMapJob(
    jobId: string,
    projectId: string,
    mapAssetId: string,
    metadata: TileMapMetadata,
    directories: MapOutputDirectories,
  ) {
    await this.assertFinalDirectoryAbsent(directories.finalDirectory);
    await rename(directories.temporaryDirectory, directories.finalDirectory);
    directories.promoted = true;
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

  private async cleanupOwnedMapOutput(directories: MapOutputDirectories) {
    const ownedPaths = [directories.temporaryDirectory];
    if (directories.promoted) ownedPaths.push(directories.finalDirectory);
    await Promise.allSettled(ownedPaths.map(async (path) => (
      this.removePathHandler(path, { recursive: true, force: true })
    )));
  }

  private async assertFinalDirectoryAbsent(finalDirectory: string) {
    try {
      await lstat(finalDirectory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    throw new Error("地图瓦片最终目录已存在，拒绝覆盖");
  }

  private async validateMapJobSource(
    projectId: string,
    jobType: "tiff_tile" | "map_tile_package",
    input: TiffJobInput | MapTilePackageJobInput,
  ) {
    const mapAsset = await this.database.mapAsset.findUnique({
      where: { id: input.mapAssetId, projectId },
    });
    if (!mapAsset) throw new Error("地图资产在当前项目中不存在");

    const expectedSourceType = jobType === "tiff_tile" ? "tiff" : "tile";
    if (mapAsset.sourceType !== expectedSourceType) throw new Error("地图任务类型与资产源类型不匹配");
    if (mapAsset.processStatus !== "queued" && mapAsset.processStatus !== "running") {
      throw new Error("地图资产当前处理状态不允许执行该任务");
    }
    if (!mapAsset.storagePath) throw new Error("地图资产源文件路径缺失");

    const payloadSourcePath = this.toStoragePath(input.sourcePath);
    const storedSourcePath = this.toStoragePath(mapAsset.storagePath);
    if (payloadSourcePath !== storedSourcePath) throw new Error("地图任务源文件路径与资产记录不匹配");
    return storedSourcePath;
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

  private mapOutputDirectories(jobId: string, mapAssetId: string): MapOutputDirectories {
    if (!this.isSafeMapAssetId(mapAssetId)) throw new Error("地图资产编号无效");
    const safeJobId = jobId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "job";
    return {
      temporaryDirectory: resolve(this.storageRoot, "map-tiles", `.tmp-${mapAssetId}-${safeJobId}-${randomUUID()}`),
      finalDirectory: resolve(this.storageRoot, "map-tiles", mapAssetId),
      promoted: false,
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
