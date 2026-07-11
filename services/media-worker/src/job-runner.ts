import { randomUUID } from "node:crypto";
import { relative, resolve, sep } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { runTiffTileJob } from "./gdal-tile-generator.js";

interface TiffJobInput {
  mapAssetId: string;
  sourcePath: string;
  minZoom: number;
  maxZoom: number;
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
      const input = this.parseTiffInput(job.inputJson);
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
          where: { id: job.id },
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
      where: { jobType: "tiff_tile", status: "queued" },
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

  private parseTiffInput(rawInput: string): TiffJobInput {
    const input = JSON.parse(rawInput) as Partial<TiffJobInput>;
    if (!input.mapAssetId || !input.sourcePath || !Number.isInteger(input.minZoom) || !Number.isInteger(input.maxZoom)) {
      throw new Error("TIF 瓦片任务参数无效");
    }
    return input as TiffJobInput;
  }

  private toStoragePath(storedPath: string) {
    const normalized = storedPath.replace(/^storage\//, "");
    const absolutePath = resolve(this.storageRoot, normalized);
    if (relative(this.storageRoot, absolutePath).startsWith(`..${sep}`)) throw new Error("地图源文件路径无效");
    return absolutePath;
  }
}
