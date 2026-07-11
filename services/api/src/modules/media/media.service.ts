import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { DatabaseService } from "../../database/database.service.js";

interface UploadedFileLike {
  filename: string;
  originalname: string;
  mimetype: string;
  path: string;
  size: number;
}

const allowedVideoExtensions = new Set([".mp4", ".mov"]);

@Injectable()
export class MediaService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async createFrameExtractionJob(mediaId: string, intervalSeconds: number) {
    this.validateInterval(intervalSeconds);
    const media = await this.database.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException("视频媒体不存在");
    if (media.kind !== "video") throw new BadRequestException("只有视频可以创建抽帧任务");

    return this.queueFrameExtraction(media, intervalSeconds);
  }

  async createVideoFromUpload(file: UploadedFileLike | undefined, intervalSeconds: number) {
    if (!file) throw new BadRequestException("请选择要上传的视频");
    this.validateInterval(intervalSeconds);

    const extension = extname(file.originalname).toLowerCase();
    if (!allowedVideoExtensions.has(extension)) {
      await rm(file.path, { force: true });
      throw new BadRequestException("仅支持 MP4 或 MOV 视频");
    }

    const id = `media-${randomUUID()}`;
    const storedFileName = `${id}${extension}`;
    const storagePath = join("storage/media/videos", storedFileName);
    await mkdir("storage/media/videos", { recursive: true });
    await rename(file.path, storagePath);

    try {
      const asset = await this.database.mediaAsset.create({
        data: {
          id,
          kind: "video",
          originalFileName: file.originalname,
          storagePath,
          mimeType: file.mimetype || (extension === ".mov" ? "video/quicktime" : "video/mp4"),
          fileSize: file.size,
        },
      });
      const job = await this.queueFrameExtraction(asset, intervalSeconds);
      await this.database.auditLog.create({
        data: {
          id: `audit-${randomUUID()}`,
          actor: "admin",
          action: "media.video.upload",
          targetType: "mediaAsset",
          targetId: asset.id,
          summary: `上传巡检视频「${asset.originalFileName}」并创建抽帧任务`,
        },
      });
      return { asset, job };
    } catch (error) {
      await rm(storagePath, { force: true });
      throw error;
    }
  }

  async listVideos() {
    return this.database.mediaAsset.findMany({
      where: { kind: "video" },
      include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });
  }

  async jobDetail(id: string) {
    const job = await this.database.mediaProcessingJob.findUnique({ where: { id }, include: { media: true } });
    if (!job) throw new NotFoundException("媒体处理任务不存在");
    return job;
  }

  async retryJob(id: string) {
    const job = await this.database.mediaProcessingJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException("媒体处理任务不存在");
    if (job.jobType !== "frame_extract") throw new BadRequestException("该任务不支持视频抽帧重试");
    if (job.status !== "failed") throw new BadRequestException("只有失败的任务可以重试");

    return this.database.mediaProcessingJob.update({
      where: { id },
      data: { status: "queued", progress: 0, errorMessage: null, startedAt: null, completedAt: null },
    });
  }

  private queueFrameExtraction(media: { id: string; storagePath: string }, intervalSeconds: number) {
    this.validateInterval(intervalSeconds);
    const dedupeKey = `frame_extract:${media.id}:${intervalSeconds}`;
    return this.database.mediaProcessingJob.upsert({
      where: { dedupeKey },
      create: {
        id: `job-frame-${media.id}-${intervalSeconds}`,
        jobType: "frame_extract",
        status: "queued",
        dedupeKey,
        mediaId: media.id,
        inputJson: JSON.stringify({
          mediaId: media.id,
          sourcePath: media.storagePath,
          intervalSeconds,
        }),
      },
      update: {},
    });
  }

  private validateInterval(intervalSeconds: number) {
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 2 || intervalSeconds > 5) {
      throw new BadRequestException("抽帧间隔必须为 2 至 5 秒");
    }
  }
}
