import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { currentProjectId, requireCurrentIdentity } from "../auth/project-context.js";

export interface PhotoDistributionInput {
  action?: "archive" | "ignore" | "unarchive";
  archiveObjectId?: string;
}

@Injectable()
export class InspectionTaskDistributionService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async update(taskId: string, photoId: string, input: PhotoDistributionInput) {
    const actor = requireCurrentIdentity().username;
    const projectId = currentProjectId();
    if (!input.action || !new Set(["archive", "ignore", "unarchive"]).has(input.action)) {
      throw new BadRequestException("请选择归档、忽略或解除归档操作");
    }
    if (input.action === "archive" && !input.archiveObjectId) {
      throw new BadRequestException("请选择要关联的对象档案");
    }

    return this.database.$transaction(async (transaction) => {
      const database = transaction as DatabaseService;
      const photo = await database.taskPhoto.findFirst({ where: { id: photoId, taskId, task: { projectId } } });
      if (!photo) throw new NotFoundException("任务照片不存在");

      let archiveObject: { id: string; name: string; objectType: string } | null = null;
      if (input.action === "archive") {
        archiveObject = await database.managedObject.findUnique({
          where: { id: input.archiveObjectId, projectId },
          select: { id: true, name: true, objectType: true },
        });
        if (!archiveObject) throw new NotFoundException("对象档案不存在");
      }

      const photoData = input.action === "archive"
        ? { distributionStatus: "archived", archiveObjectId: archiveObject!.id }
        : input.action === "unarchive"
          ? { distributionStatus: "pending", archiveObjectId: null }
          : { distributionStatus: "ignored", archiveObjectId: null };
      let transitionedFromPending = false;
      const transitionedToPending = input.action === "unarchive" && photo.distributionStatus !== "pending";
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
            where: { id: taskId, projectId },
            data: { pendingPhotoCount: { decrement: 1 } },
          })
        : transitionedToPending
          ? await database.inspectionTask.update({
              where: { id: taskId, projectId },
              data: { pendingPhotoCount: { increment: 1 } },
            })
        : await database.inspectionTask.findUnique({ where: { id: taskId, projectId } });
      if (!task) throw new NotFoundException("巡检任务不存在");
      const pendingPhotoCount = Math.max(0, task.pendingPhotoCount);
      await database.inspectionTask.update({
        where: { id: taskId, projectId },
        data: {
          ...(pendingPhotoCount !== task.pendingPhotoCount ? { pendingPhotoCount } : {}),
          processStatus: transitionedToPending || pendingPhotoCount > 0 ? "ready_for_distribution" : "completed",
        },
      });
      await database.auditLog.create({
        data: {
          id: `audit-${randomUUID()}`,
          projectId,
          actor,
          action: input.action === "archive" ? "taskPhoto.archive" : input.action === "unarchive" ? "taskPhoto.unarchive" : "taskPhoto.ignore",
          targetType: "taskPhoto",
          targetId: photoId,
          summary: input.action === "archive"
            ? `照片已归入「${archiveObject!.name}」档案`
            : input.action === "unarchive"
              ? "照片已解除档案关联并返回待分发"
              : "照片已标记为忽略",
        },
      });
      return { photo: updated, pendingPhotoCount, archiveObject };
    });
  }
}
