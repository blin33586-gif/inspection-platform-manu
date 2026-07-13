import { Inject, Injectable, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { DatabaseService } from "../../database/database.service.js";
import {
  validateTaskInput,
  type InspectionTaskInputBody,
  type NormalizedTaskInput,
  type TaskUploadFile,
} from "./inspection-task-input.js";
import { currentProjectId } from "../auth/project-context.js";

@Injectable()
export class InspectionTaskWriteService {
  private readonly storageRoot: string;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional() @Inject("INSPECTION_TASK_STORAGE_ROOT") storageRoot?: string,
  ) {
    this.storageRoot = resolve(storageRoot ?? resolve(process.cwd(), "storage"));
  }

  async create(body: InspectionTaskInputBody, files: TaskUploadFile[] | undefined) {
    const input = validateTaskInput(body, files);
    if (input.inputType === "images") return this.createImageTask(input);
    return this.createProcessedTask(input);
  }

  private async createProcessedTask(input: NormalizedTaskInput) {
    const projectId = currentProjectId();
    const taskId = `task-${randomUUID()}`;
    const mediaId = `media-${randomUUID()}`;
    const source = input.files[0];
    const extension = extname(source.originalname).toLowerCase();
    const folder = input.inputType === "video" ? "videos" : "archives";
    const relativePath = join("storage/media", folder, `${mediaId}${extension}`);
    const destination = join(this.storageRoot, "media", folder, `${mediaId}${extension}`);
    await mkdir(join(this.storageRoot, "media", folder), { recursive: true });
    await rename(source.path, destination);

    try {
      return await this.database.$transaction(async (transaction) => {
        const database = transaction as DatabaseService;
        await database.mediaAsset.create({
          data: {
            projectId,
            id: mediaId,
            kind: input.inputType === "video" ? "video" : "image_bundle",
            originalFileName: source.originalname,
            storagePath: relativePath,
            mimeType: source.mimetype || defaultMimeType(extension),
            fileSize: source.size,
          },
        });
        const task = await database.inspectionTask.create({
          data: {
            projectId,
            id: taskId,
            name: input.name,
            taskDate: input.taskDate,
            sourceType: input.sourceType,
            inputType: input.inputType,
            processStatus: "queued",
            sourceMediaId: mediaId,
            photoCount: 0,
            pendingPhotoCount: 0,
          },
        });
        const jobType = input.inputType === "video" ? "frame_extract" : "archive_extract";
        await database.mediaProcessingJob.create({
          data: {
            projectId,
            id: `job-${randomUUID()}`,
            jobType,
            status: "queued",
            dedupeKey: `${jobType}:${taskId}`,
            mediaId,
            inputJson: JSON.stringify({
              inspectionTaskId: taskId,
              mediaId,
              sourcePath: relativePath,
              ...(input.intervalSeconds ? { intervalSeconds: input.intervalSeconds } : {}),
            }),
          },
        });
        await this.writeAudit(database, taskId, `创建任务「${input.name}」并进入后台处理`);
        return task;
      });
    } catch (error) {
      await rm(destination, { force: true });
      throw error;
    }
  }

  private async createImageTask(input: NormalizedTaskInput) {
    const projectId = currentProjectId();
    const taskId = `task-${randomUUID()}`;
    const directory = join(this.storageRoot, "media", "task-images", taskId);
    await mkdir(directory, { recursive: true });
    const movedFiles: Array<{ file: TaskUploadFile; mediaId: string; relativePath: string; destination: string }> = [];

    try {
      for (const file of input.files) {
        const mediaId = `media-${randomUUID()}`;
        const extension = extname(file.originalname).toLowerCase();
        const fileName = `${mediaId}${extension}`;
        const destination = join(directory, fileName);
        await rename(file.path, destination);
        movedFiles.push({
          file,
          mediaId,
          destination,
          relativePath: join("storage/media/task-images", taskId, fileName),
        });
      }

      return await this.database.$transaction(async (transaction) => {
        const database = transaction as DatabaseService;
        await database.mediaAsset.createMany({
          data: movedFiles.map(({ file, mediaId, relativePath }) => ({
            projectId,
            id: mediaId,
            kind: "image",
            originalFileName: file.originalname,
            storagePath: relativePath,
            mimeType: file.mimetype || defaultMimeType(extname(file.originalname).toLowerCase()),
            fileSize: file.size,
          })),
        });
        const task = await database.inspectionTask.create({
          data: {
            projectId,
            id: taskId,
            name: input.name,
            taskDate: input.taskDate,
            sourceType: input.sourceType,
            inputType: input.inputType,
            processStatus: "queued",
            photoCount: 0,
            pendingPhotoCount: 0,
          },
        });
        await database.mediaProcessingJob.create({
          data: {
            projectId,
            id: `job-${randomUUID()}`,
            jobType: "image_prepare",
            status: "queued",
            dedupeKey: `image_prepare:${taskId}`,
            inputJson: JSON.stringify({ inspectionTaskId: taskId, mediaIds: movedFiles.map((item) => item.mediaId) }),
          },
        });
        await this.writeAudit(database, taskId, `创建图片任务「${input.name}」，共 ${movedFiles.length} 张，等待后台校验与预览处理`);
        return task;
      });
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  private writeAudit(database: DatabaseService, taskId: string, summary: string) {
    return database.auditLog.create({
      data: {
        projectId: currentProjectId(),
        id: `audit-${randomUUID()}`,
        actor: "admin",
        action: "inspectionTask.create",
        targetType: "inspectionTask",
        targetId: taskId,
        summary,
      },
    });
  }
}

function defaultMimeType(extension: string) {
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".zip") return "application/zip";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".bmp") return "image/bmp";
  if (extension === ".tif" || extension === ".tiff") return "image/tiff";
  if (extension === ".heic" || extension === ".heif") return "image/heif";
  return "image/jpeg";
}
