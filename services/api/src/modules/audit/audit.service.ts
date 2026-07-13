import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { currentActorUsername, currentProjectId } from "../auth/project-context.js";

interface RecordAuditInput {
  action: string;
  targetType: string;
  targetId?: string | null;
  summary: string;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async record(input: RecordAuditInput) {
    return this.database.auditLog.create({
      data: {
        projectId: currentProjectId(),
        id: `audit-${randomUUID()}`,
        actor: currentActorUsername(),
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        summary: input.summary,
      },
    });
  }

  async list(filters: { keyword?: string; action?: string; targetType?: string } = {}) {
    const logs = await this.database.auditLog.findMany({
      where: {
        projectId: currentProjectId(),
        ...(filters.action ? { action: { contains: filters.action } } : {}),
        ...(filters.targetType ? { targetType: filters.targetType } : {}),
        ...(filters.keyword
          ? {
              OR: [
                { actor: { contains: filters.keyword } },
                { action: { contains: filters.keyword } },
                { summary: { contains: filters.keyword } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return logs.map((log) => ({
      id: log.id,
      actor: log.actor,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      summary: log.summary,
      reviewStatus: log.reviewStatus as "pending" | "confirmed" | "canceled" | null,
      reviewedBy: log.reviewedBy,
      reviewedAt: log.reviewedAt?.toISOString() ?? null,
      createdAt: log.createdAt.toISOString(),
    }));
  }
}
