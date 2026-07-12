import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
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

      const photoData = input.action === "archive"
        ? { distributionStatus: "archived", archiveObjectId: archiveObject!.id }
        : { distributionStatus: "ignored", archiveObjectId: null };
      let transitionedFromPending = false;
      if (photo.distributionStatus === "pending") {
        const transition = await database.taskPhoto.updateMany({
          where: { id: photoId, taskId, distributionStatus: "pending" },
          data: photoData,
        });
        transitionedFromPending = transition.count === 1;
        if (!transitionedFromPending) {
          throw new ConflictException("照片已由其他操作完成分发，请刷新后重试");
        }
      } else {
        await database.taskPhoto.update({ where: { id: photoId }, data: photoData });
      }

      const updated = await database.taskPhoto.findUnique({ where: { id: photoId } });
      if (!updated) throw new NotFoundException("任务照片不存在");

      const task = transitionedFromPending
        ? await database.inspectionTask.update({
            where: { id: taskId },
            data: { pendingPhotoCount: { decrement: 1 } },
          })
        : await database.inspectionTask.findUnique({ where: { id: taskId } });
      if (!task) throw new NotFoundException("巡检任务不存在");
      const pendingPhotoCount = Math.max(0, task.pendingPhotoCount);
      await database.inspectionTask.update({
        where: { id: taskId },
        data: {
          ...(pendingPhotoCount !== task.pendingPhotoCount ? { pendingPhotoCount } : {}),
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
