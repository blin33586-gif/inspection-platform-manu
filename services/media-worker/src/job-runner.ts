import { randomUUID } from "node:crypto";
import { basename, relative, resolve, sep } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { extractVideoFrames } from "./ffmpeg-frame-extractor.js";
import { runTiffTileJob } from "./gdal-tile-generator.js";

interface TiffJobInput {
  mapAssetId: string;
  sourcePath: string;
  minZoom: number;
  maxZoom: number;
}

interface FrameExtractionJobInput {
  mediaId: string;
  sourcePath: string;
  intervalSeconds: number;
}

export class JobRunner {
  constructor(
    private readonly database: PrismaClient,
    private readonly storageRoot = resolve(process.cwd(), "../api/storage"),
  ) {}

  async processNext() {
    const job = await this.claimOne();
    if (!job) return false;

    try {
      if (job.jobType === "tiff_tile") await this.processTiffJob(job.id, job.inputJson);
      else if (job.jobType === "frame_extract") await this.processFrameJob(job.id, job.inputJson);
      else throw new Error(`不支持的媒体任务类型：${job.jobType}`);
    } catch (error) {
      await this.database.mediaProcessingJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "瓦片处理失败",
        },
      });
    }

    return true;
  }

  private async claimOne() {
    const candidate = await this.database.mediaProcessingJob.findFirst({
      where: { jobType: { in: ["tiff_tile", "frame_extract"] }, status: "queued" },
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

  private async processTiffJob(jobId: string, rawInput: string) {
    const input = this.parseTiffInput(rawInput);
    const sourcePath = this.toStoragePath(input.sourcePath);
    const tilePath = resolve(this.storageRoot, "map-tiles", input.mapAssetId);
    const result = await runTiffTileJob({
      sourcePath,
      outputDirectory: tilePath,
      minZoom: input.minZoom,
      maxZoom: input.maxZoom,
    });
    const publicTilePath = `storage/map-tiles/${input.mapAssetId}`;

    await this.database.$transaction([
      this.database.mediaProcessingJob.update({
        where: { id: jobId },
        data: {
          status: "completed",
          progress: 100,
          completedAt: new Date(),
          errorMessage: null,
          outputJson: JSON.stringify({ tilePath: publicTilePath, cogPath: result.cogPath, metadata: result.metadata }),
        },
      }),
      this.database.mapAsset.update({
        where: { id: input.mapAssetId },
        data: {
          sourceType: "tile",
          tilePath: publicTilePath,
          tileMetadata: JSON.stringify(result.metadata),
          processStatus: "ready",
        },
      }),
      this.database.auditLog.create({
        data: {
          id: `audit-${randomUUID()}`,
          actor: "system",
          action: "map.tiles.ready",
          targetType: "mapAsset",
          targetId: input.mapAssetId,
          summary: "TIF 地图瓦片处理完成，等待发布",
        },
      }),
    ]);
  }

  private async processFrameJob(jobId: string, rawInput: string) {
    const input = this.parseFrameInput(rawInput);
    const sourcePath = this.toStoragePath(input.sourcePath);
    const outputDirectory = resolve(this.storageRoot, "media", "frames", input.mediaId);
    const frames = await extractVideoFrames(sourcePath, outputDirectory, input.intervalSeconds);
    const publicDirectory = `storage/media/frames/${input.mediaId}`;

    await this.database.$transaction([
      this.database.mediaAsset.createMany({
        data: frames.map((frame) => ({
          id: `frame-${input.mediaId}-${frame.timestampMs}`,
          kind: "frame",
          originalFileName: frame.fileName,
          storagePath: `${publicDirectory}/${basename(frame.storagePath)}`,
          mimeType: "image/jpeg",
          fileSize: frame.fileSize,
          parentMediaId: input.mediaId,
          videoTimestampMs: frame.timestampMs,
        })),
        skipDuplicates: true,
      }),
      this.database.mediaProcessingJob.update({
        where: { id: jobId },
        data: {
          status: "completed",
          progress: 100,
          completedAt: new Date(),
          errorMessage: null,
          outputJson: JSON.stringify({ frameCount: frames.length, frameDirectory: publicDirectory }),
        },
      }),
      this.database.auditLog.create({
        data: {
          id: `audit-${randomUUID()}`,
          actor: "system",
          action: "media.frames.ready",
          targetType: "mediaAsset",
          targetId: input.mediaId,
          summary: `视频抽帧完成，共生成 ${frames.length} 张证据帧`,
        },
      }),
    ]);
  }

  private parseTiffInput(rawInput: string): TiffJobInput {
    const input = JSON.parse(rawInput) as Partial<TiffJobInput>;
    if (!input.mapAssetId || !input.sourcePath || !Number.isInteger(input.minZoom) || !Number.isInteger(input.maxZoom)) {
      throw new Error("TIF 瓦片任务参数无效");
    }
    return input as TiffJobInput;
  }

  private parseFrameInput(rawInput: string): FrameExtractionJobInput {
    const input = JSON.parse(rawInput) as Partial<FrameExtractionJobInput>;
    if (!input.mediaId || !input.sourcePath || !Number.isInteger(input.intervalSeconds) || input.intervalSeconds! < 2 || input.intervalSeconds! > 5) {
      throw new Error("视频抽帧任务参数无效");
    }
    return input as FrameExtractionJobInput;
  }

  private toStoragePath(storedPath: string) {
    const normalized = storedPath.replace(/^storage\//, "");
    const absolutePath = resolve(this.storageRoot, normalized);
    if (relative(this.storageRoot, absolutePath).startsWith(`..${sep}`)) throw new Error("地图源文件路径无效");
    return absolutePath;
  }
}
