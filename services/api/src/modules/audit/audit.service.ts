import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";

interface RecordAuditInput {
  actor?: string;
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
        id: `audit-${randomUUID()}`,
        actor: input.actor ?? "曲阳路街道管理员",
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        summary: input.summary,
      },
    });
  }

  async list() {
    const logs = await this.database.auditLog.findMany({
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
      createdAt: log.createdAt.toISOString(),
    }));
  }
}
