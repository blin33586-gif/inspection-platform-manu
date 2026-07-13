import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { currentProjectId } from "../auth/project-context.js";

type DeletionDecision = "confirm" | "cancel";

@Injectable()
export class ManagedObjectDeletionService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async requestDeletion(objectId: string, actor = "曲阳路街道管理员") {
    const projectId = currentProjectId();
    const object = await this.database.managedObject.findUnique({ where: { id: objectId, projectId } });
    if (!object) throw new NotFoundException("档案不存在");

    const existing = await this.database.auditLog.findFirst({
      where: {
        projectId,
        action: "managedObject.delete.request",
        targetId: objectId,
        reviewStatus: "pending",
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;

    return this.database.auditLog.create({
      data: {
        projectId,
        id: `audit-${randomUUID()}`,
        actor,
        action: "managedObject.delete.request",
        targetType: object.objectType,
        targetId: object.id,
        summary: `申请删除${this.objectTypeLabel(object.objectType)}档案「${object.name}」`,
        reviewStatus: "pending",
      },
    });
  }

  async reviewDeletion(auditId: string, decision: DeletionDecision, actor = "曲阳路街道管理员") {
    const projectId = currentProjectId();
    if (!new Set<DeletionDecision>(["confirm", "cancel"]).has(decision)) {
      throw new BadRequestException("审批决定无效");
    }

    return this.database.$transaction(async (transaction) => {
      const database = transaction as DatabaseService;
      const request = await database.auditLog.findUnique({ where: { id: auditId, projectId } });
      if (!request || request.action !== "managedObject.delete.request") {
        throw new NotFoundException("删除申请不存在");
      }
      if (request.reviewStatus !== "pending") throw new ConflictException("该删除申请已经处理");

      if (decision === "cancel") {
        return database.auditLog.update({
          where: { id: auditId, projectId },
          data: { reviewStatus: "canceled", reviewedBy: actor, reviewedAt: new Date() },
        });
      }

      if (!request.targetId) throw new BadRequestException("删除申请缺少档案标识");
      const object = await database.managedObject.findUnique({ where: { id: request.targetId, projectId } });
      if (!object) throw new NotFoundException("档案不存在或已删除");

      const linkedPhotos = await database.taskPhoto.findMany({
        where: { archiveObjectId: object.id },
        select: { taskId: true },
      });
      await database.taskPhoto.updateMany({
        where: { archiveObjectId: object.id },
        data: { archiveObjectId: null, distributionStatus: "pending" },
      });
      await database.issue.updateMany({ where: { projectId, objectId: object.id }, data: { objectId: null } });
      await database.inspectionReport.updateMany({ where: { projectId, relatedObjectId: object.id }, data: { relatedObjectId: null } });
      await database.mapHotArea.updateMany({ where: { objectId: object.id }, data: { objectId: null } });

      const taskIds = [...new Set(linkedPhotos.map((photo) => photo.taskId))];
      for (const taskId of taskIds) {
        const pendingPhotoCount = await database.taskPhoto.count({
          where: { taskId, distributionStatus: "pending" },
        });
        await database.inspectionTask.update({
          where: { id: taskId, projectId },
          data: { pendingPhotoCount, processStatus: "ready_for_distribution" },
        });
      }

      await database.managedObject.delete({ where: { id: object.id, projectId } });
      return database.auditLog.update({
        where: { id: auditId, projectId },
        data: { reviewStatus: "confirmed", reviewedBy: actor, reviewedAt: new Date() },
      });
    });
  }

  private objectTypeLabel(objectType: string) {
    if (objectType === "community") return "小区";
    if (objectType === "road") return "道路";
    if (objectType === "point") return "重点点位";
    return "街道";
  }
}
