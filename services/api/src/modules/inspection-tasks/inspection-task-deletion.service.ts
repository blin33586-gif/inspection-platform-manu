import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { DatabaseService } from "../../database/database.service.js";
import { currentProjectId } from "../auth/project-context.js";

export interface InspectionTaskPurgeResult {
  taskId: string;
  deletedReportCount: number;
  deletedPhotoCount: number;
  deletedIssueCount: number;
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
    const projectId = currentProjectId();
    const storagePaths = new Set<string>();
    const result = await this.database.$transaction(async (transaction) => {
      const database = transaction as DatabaseService;
      const task = await database.inspectionTask.findUnique({
        where: { id: taskId, projectId },
        select: {
          id: true,
          name: true,
          sourceMediaId: true,
          photos: { select: { id: true, mediaAssetId: true } },
          report: { select: { id: true, storagePath: true } },
        },
      });
      if (!task) throw new NotFoundException("巡检任务不存在");
      if (task.report?.storagePath) storagePaths.add(task.report.storagePath);

      const jobs = await database.mediaProcessingJob.findMany({
        where: {
          projectId,
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
            projectId,
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

      const photoIds = task.photos.map((photo) => photo.id);
      const issues = photoIds.length
        ? await database.issue.findMany({
          where: { projectId, sourceTaskPhotoId: { in: photoIds } },
          select: { id: true, cardStoragePath: true },
        })
        : [];
      issues.forEach((issue) => {
        if (issue.cardStoragePath) storagePaths.add(issue.cardStoragePath);
      });
      const issueIds = issues.map((issue) => issue.id);
      const issueAttachments = issueIds.length
        ? await database.issueAttachment.findMany({
          where: { issueId: { in: issueIds } },
          select: { storagePath: true },
        })
        : [];
      issueAttachments.forEach((attachment) => storagePaths.add(attachment.storagePath));

      const deletedReports = await database.inspectionReport.deleteMany({ where: { projectId, taskId } });
      if (issueIds.length) {
        await database.issueAttachment.deleteMany({ where: { issueId: { in: issueIds } } });
      }
      const deletedIssues = issueIds.length
        ? await database.issue.deleteMany({ where: { projectId, id: { in: issueIds } } })
        : { count: 0 };
      const deletedJobs = jobs.length
        ? await database.mediaProcessingJob.deleteMany({ where: { projectId, id: { in: jobs.map((job) => job.id) } } })
        : { count: 0 };
      const deletedMedia = mediaAssets.length
        ? await database.mediaAsset.deleteMany({
          where: {
            projectId,
            OR: [
              { id: { in: mediaAssets.map((asset) => asset.id) } },
              { parentMediaId: { in: mediaAssets.map((asset) => asset.id) } },
            ],
          },
        })
        : { count: 0 };
      const deletedPhotos = await database.taskPhoto.deleteMany({ where: { taskId } });
      await database.inspectionTask.delete({ where: { id: taskId, projectId } });
      await database.auditLog.create({
        data: {
          projectId,
          id: `audit-${randomUUID()}`,
          actor: "admin",
          action: "inspectionTask.purge",
          targetType: "inspectionTask",
          targetId: taskId,
          summary: `彻底删除任务「${task.name}」，清理 ${deletedPhotos.count} 张照片、${deletedReports.count} 份报告、${deletedIssues.count} 个关联问题、${deletedMedia.count} 个素材文件、${deletedJobs.count} 个后台任务`,
        },
      });

      return {
        taskId,
        deletedReportCount: deletedReports.count,
        deletedPhotoCount: deletedPhotos.count,
        deletedIssueCount: deletedIssues.count,
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
