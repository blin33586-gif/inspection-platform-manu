import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { DatabaseService } from "../../database/database.service.js";
import { currentProjectId, requireCurrentIdentity } from "../auth/project-context.js";

interface UploadedFileLike {
  filename: string;
  originalname: string;
  mimetype: string;
  path: string;
  size: number;
}

const allowedVideoExtensions = new Set([".mp4", ".mov"]);
const archiveExtension = ".zip";

@Injectable()
export class MediaService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async createMediaFromUpload(file: UploadedFileLike | undefined, intervalSeconds: number) {
    requireCurrentIdentity();
    if (!file) throw new BadRequestException("请选择要上传的素材");

    const extension = extname(file.originalname).toLowerCase();
    if (allowedVideoExtensions.has(extension)) return this.createVideoFromUpload(file, intervalSeconds);
    if (extension === archiveExtension) return this.createArchiveFromUpload(file);

    await rm(file.path, { force: true });
    throw new BadRequestException("仅支持 MP4、MOV 或 ZIP 文件");
  }

  async createFrameExtractionJob(mediaId: string, intervalSeconds: number) {
    this.validateInterval(intervalSeconds);
    const media = await this.database.mediaAsset.findUnique({ where: { id: mediaId, projectId: currentProjectId() } });
    if (!media) throw new NotFoundException("视频媒体不存在");
    if (media.kind !== "video") throw new BadRequestException("只有视频可以创建抽帧任务");

    return this.queueFrameExtraction(media, intervalSeconds);
  }

  async createVideoFromUpload(file: UploadedFileLike | undefined, intervalSeconds: number) {
    const identity = requireCurrentIdentity();
    const projectId = currentProjectId();
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
      return await this.database.$transaction(async (transaction) => {
        const asset = await transaction.mediaAsset.create({
          data: {
            projectId,
            id,
            kind: "video",
            originalFileName: file.originalname,
            storagePath,
            mimeType: file.mimetype || (extension === ".mov" ? "video/quicktime" : "video/mp4"),
            fileSize: file.size,
          },
        });
        const job = await this.queueFrameExtraction(asset, intervalSeconds, transaction, projectId);
        await transaction.auditLog.create({
          data: {
            projectId,
            id: `audit-${randomUUID()}`,
            actor: identity.username,
            action: "media.video.upload",
            targetType: "mediaAsset",
            targetId: asset.id,
            summary: `上传巡检视频「${asset.originalFileName}」并创建抽帧任务`,
          },
        });
        return { asset, job };
      });
    } catch (error) {
      await rm(storagePath, { force: true });
      throw error;
    }
  }

  async createArchiveFromUpload(file: UploadedFileLike) {
    const identity = requireCurrentIdentity();
    const projectId = currentProjectId();
    const id = `media-${randomUUID()}`;
    const storedFileName = `${id}${archiveExtension}`;
    const storagePath = join("storage/media/archives", storedFileName);
    await mkdir("storage/media/archives", { recursive: true });
    await rename(file.path, storagePath);

    try {
      return await this.database.$transaction(async (transaction) => {
        const asset = await transaction.mediaAsset.create({
          data: {
            projectId,
            id,
            kind: "image_bundle",
            originalFileName: file.originalname,
            storagePath,
            mimeType: file.mimetype || "application/zip",
            fileSize: file.size,
          },
        });
        const job = await this.queueArchiveExtraction(asset, transaction, projectId);
        await transaction.auditLog.create({
          data: {
            projectId,
            id: `audit-${randomUUID()}`,
            actor: identity.username,
            action: "media.archive.upload",
            targetType: "mediaAsset",
            targetId: asset.id,
            summary: `上传巡检图片包「${asset.originalFileName}」并创建解压任务`,
          },
        });
        return { asset, job };
      });
    } catch (error) {
      await rm(storagePath, { force: true });
      throw error;
    }
  }

  async listTasks() {
    return this.database.mediaAsset.findMany({
      where: { projectId: currentProjectId(), parentMediaId: null, kind: { in: ["video", "image_bundle"] } },
      include: {
        jobs: { orderBy: { createdAt: "desc" }, take: 1 },
        frames: { orderBy: [{ videoTimestampMs: "asc" }, { createdAt: "asc" }], take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async listChildren(parentId: string) {
    const projectId = currentProjectId();
    const parent = await this.database.mediaAsset.findUnique({ where: { id: parentId, projectId } });
    if (!parent || parent.parentMediaId) throw new NotFoundException("媒体任务不存在");

    return this.database.mediaAsset.findMany({
      where: { projectId, parentMediaId: parentId, kind: { in: ["frame", "image"] } },
      orderBy: [{ videoTimestampMs: "asc" }, { createdAt: "asc" }],
    });
  }

  async getAsset(id: string) {
    const asset = await this.database.mediaAsset.findUnique({
      where: { id, projectId: currentProjectId() },
      include: {
        jobs: { orderBy: { createdAt: "desc" }, take: 1 },
        frames: { orderBy: [{ videoTimestampMs: "asc" }, { createdAt: "asc" }], take: 1 },
      },
    });
    if (!asset) throw new NotFoundException("媒体素材不存在");
    return asset;
  }

  async listVideos() {
    return this.database.mediaAsset.findMany({
      where: { projectId: currentProjectId(), kind: "video" },
      include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });
  }

  async jobDetail(id: string) {
    const job = await this.database.mediaProcessingJob.findUnique({ where: { id, projectId: currentProjectId() }, include: { media: true } });
    if (!job) throw new NotFoundException("媒体处理任务不存在");
    return job;
  }

  async retryJob(id: string) {
    const projectId = currentProjectId();
    const job = await this.database.mediaProcessingJob.findUnique({ where: { id, projectId } });
    if (!job) throw new NotFoundException("媒体处理任务不存在");
    if (!new Set(["frame_extract", "archive_extract", "image_prepare"]).has(job.jobType)) {
      throw new BadRequestException("该媒体处理任务不支持重试");
    }
    if (job.status !== "failed") throw new BadRequestException("只有失败的任务可以重试");

    return this.database.mediaProcessingJob.update({
      where: { id, projectId },
      data: { status: "queued", progress: 0, errorMessage: null, startedAt: null, completedAt: null },
    });
  }

  private queueFrameExtraction(
    media: { id: string; storagePath: string },
    intervalSeconds: number,
    database: Pick<DatabaseService, "mediaProcessingJob"> = this.database,
    projectId = currentProjectId(),
  ) {
    this.validateInterval(intervalSeconds);
    const dedupeKey = `frame_extract:${media.id}:${intervalSeconds}`;
    return database.mediaProcessingJob.upsert({
      where: { dedupeKey },
      create: {
        projectId,
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

  private queueArchiveExtraction(
    media: { id: string; storagePath: string },
    database: Pick<DatabaseService, "mediaProcessingJob"> = this.database,
    projectId = currentProjectId(),
  ) {
    const dedupeKey = `archive_extract:${media.id}`;
    return database.mediaProcessingJob.upsert({
      where: { dedupeKey },
      create: {
        projectId,
        id: `job-archive-${media.id}`,
        jobType: "archive_extract",
        status: "queued",
        dedupeKey,
        mediaId: media.id,
        inputJson: JSON.stringify({ mediaId: media.id, sourcePath: media.storagePath }),
      },
      update: {},
    });
  }

  private validateInterval(intervalSeconds: number) {
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1 || intervalSeconds > 5) {
      throw new BadRequestException("抽帧间隔必须为 1 至 5 秒");
    }
  }
}
