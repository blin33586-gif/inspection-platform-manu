import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { DatabaseService } from "../../database/database.service.js";

export interface InspectionTaskPurgeResult {
  taskId: string;
  deletedReportCount: number;
  deletedPhotoCount: number;
  deletedMediaCount: number;
  deletedJobCount: number;
}

@Injectable()
export class InspectionTaskDeletionService {
  private readonly storageRoot: string;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional() @Inject("INSPECTION_TASK_STORAGE_ROOT") storageRoot?: string,
  ) {
    this.storageRoot = resolve(storageRoot ?? resolve(process.cwd(), "storage"));
  }

  async purge(taskId: string): Promise<InspectionTaskPurgeResult> {
    const storagePaths = new Set<string>();
    const result = await this.database.$transaction(async (transaction) => {
      const database = transaction as DatabaseService;
      const task = await database.inspectionTask.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          name: true,
          sourceMediaId: true,
          photos: { select: { id: true, mediaAssetId: true } },
          report: { select: { id: true } },
        },
      });
      if (!task) throw new NotFoundException("巡检任务不存在");

      const jobs = await database.mediaProcessingJob.findMany({
        where: {
          OR: [
            { mediaId: task.sourceMediaId ?? undefined },
            { dedupeKey: { contains: `:${taskId}` } },
            { inputJson: { contains: taskId } },
            { outputJson: { contains: taskId } },
          ],
        },
        select: { id: true, mediaId: true, inputJson: true, outputJson: true },
      });

      const mediaIds = new Set<string>();
      if (task.sourceMediaId) mediaIds.add(task.sourceMediaId);
      task.photos.forEach((photo) => mediaIds.add(photo.mediaAssetId));
      jobs.forEach((job) => {
        if (job.mediaId) mediaIds.add(job.mediaId);
        collectMediaIds(job.inputJson).forEach((id) => mediaIds.add(id));
        collectMediaIds(job.outputJson).forEach((id) => mediaIds.add(id));
      });

      const mediaAssets = mediaIds.size
        ? await database.mediaAsset.findMany({
          where: {
            OR: [
              { id: { in: [...mediaIds] } },
              { parentMediaId: { in: [...mediaIds] } },
            ],
          },
          select: { id: true, storagePath: true, previewStoragePath: true },
        })
        : [];
      mediaAssets.forEach((asset) => {
        if (asset.storagePath) storagePaths.add(asset.storagePath);
        if (asset.previewStoragePath) storagePaths.add(asset.previewStoragePath);
      });

      const deletedReports = await database.inspectionReport.deleteMany({ where: { taskId } });
      const deletedJobs = jobs.length
        ? await database.mediaProcessingJob.deleteMany({ where: { id: { in: jobs.map((job) => job.id) } } })
        : { count: 0 };
      const deletedMedia = mediaAssets.length
        ? await database.mediaAsset.deleteMany({
          where: {
            OR: [
              { id: { in: mediaAssets.map((asset) => asset.id) } },
              { parentMediaId: { in: mediaAssets.map((asset) => asset.id) } },
            ],
          },
        })
        : { count: 0 };
      const deletedPhotos = await database.taskPhoto.deleteMany({ where: { taskId } });
      await database.inspectionTask.delete({ where: { id: taskId } });
      await database.auditLog.create({
        data: {
          id: `audit-${randomUUID()}`,
          actor: "admin",
          action: "inspectionTask.purge",
          targetType: "inspectionTask",
          targetId: taskId,
          summary: `彻底删除任务「${task.name}」，清理 ${deletedPhotos.count} 张照片、${deletedReports.count} 份报告、${deletedMedia.count} 个素材文件、${deletedJobs.count} 个后台任务`,
        },
      });

      return {
        taskId,
        deletedReportCount: deletedReports.count,
        deletedPhotoCount: deletedPhotos.count,
        deletedMediaCount: deletedMedia.count,
        deletedJobCount: deletedJobs.count,
      };
    });

    await Promise.all([...storagePaths].map((path) => this.removeStoredFile(path)));
    return result;
  }

  private async removeStoredFile(storagePath: string) {
    const absolutePath = this.toStorageAbsolutePath(storagePath);
    if (!absolutePath) return;
    await rm(absolutePath, { force: true });
  }

  private toStorageAbsolutePath(storagePath: string) {
    const localPath = storagePath.replace(/\\/g, "/").replace(/^storage\//, "");
    const absolutePath = resolve(this.storageRoot, localPath);
    const rootWithSeparator = this.storageRoot.endsWith(sep) ? this.storageRoot : `${this.storageRoot}${sep}`;
    if (absolutePath !== this.storageRoot && !absolutePath.startsWith(rootWithSeparator)) return null;
    return absolutePath;
  }
}

function collectMediaIds(rawJson: string | null): string[] {
  if (!rawJson) return [];
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    const ids: string[] = [];
    collectMediaIdsFromValue(parsed, ids);
    return ids;
  } catch {
    return [];
  }
}

function collectMediaIdsFromValue(value: unknown, ids: string[], key = "") {
  if (typeof value === "string") {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.endsWith("mediaid") || normalizedKey.endsWith("mediaids")) ids.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectMediaIdsFromValue(item, ids, key));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.entries(value).forEach(([entryKey, entryValue]) => collectMediaIdsFromValue(entryValue, ids, entryKey));
}
