import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";

export interface PhotoDistributionInput {
  action?: "archive" | "ignore";
  archiveObjectId?: string;
}

@Injectable()
export class InspectionTaskDistributionService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async update(taskId: string, photoId: string, input: PhotoDistributionInput) {
    if (!input.action || !new Set(["archive", "ignore"]).has(input.action)) {
      throw new BadRequestException("请选择归档或忽略操作");
    }
    if (input.action === "archive" && !input.archiveObjectId) {
      throw new BadRequestException("请选择要关联的对象档案");
    }

    return this.database.$transaction(async (transaction) => {
      const database = transaction as DatabaseService;
      const photo = await database.taskPhoto.findFirst({ where: { id: photoId, taskId } });
      if (!photo) throw new NotFoundException("任务照片不存在");

      let archiveObject: { id: string; name: string; objectType: string } | null = null;
      if (input.action === "archive") {
        archiveObject = await database.managedObject.findUnique({
          where: { id: input.archiveObjectId },
          select: { id: true, name: true, objectType: true },
        });
        if (!archiveObject) throw new NotFoundException("对象档案不存在");
      }

      const updated = await database.taskPhoto.update({
        where: { id: photoId },
        data: input.action === "archive"
          ? { distributionStatus: "archived", archiveObjectId: archiveObject!.id }
          : { distributionStatus: "ignored", archiveObjectId: null },
      });
      const pendingPhotoCount = await database.taskPhoto.count({
        where: { taskId, distributionStatus: "pending" },
      });
      await database.inspectionTask.update({
        where: { id: taskId },
        data: {
          pendingPhotoCount,
          processStatus: pendingPhotoCount > 0 ? "ready_for_distribution" : "completed",
        },
      });
      await database.auditLog.create({
        data: {
          id: `audit-${randomUUID()}`,
          actor: "admin",
          action: input.action === "archive" ? "taskPhoto.archive" : "taskPhoto.ignore",
          targetType: "taskPhoto",
          targetId: photoId,
          summary: input.action === "archive"
            ? `照片已归入「${archiveObject!.name}」档案`
            : "照片已标记为忽略",
        },
      });
      return { photo: updated, pendingPhotoCount, archiveObject };
    });
  }
}
