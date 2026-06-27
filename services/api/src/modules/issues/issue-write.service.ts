import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { IssueStatus, Severity } from "@xunjianbao/shared";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { AuditService } from "../audit/audit.service.js";

interface CreateIssueInput {
  title?: string;
  category?: string;
  status?: IssueStatus;
  severity?: Severity;
  foundAt?: string;
  objectId?: string;
}

const allowedStatuses: IssueStatus[] = ["pending", "processing", "rectified", "verified", "ignored", "archived"];
const allowedSeverities: Severity[] = ["normal", "medium", "high"];

@Injectable()
export class IssueWriteService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(InspectionReadRepository) private readonly readRepository: InspectionReadRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async create(input: CreateIssueInput) {
    if (!input.title?.trim()) throw new BadRequestException("Issue title is required");
    if (!input.category?.trim()) throw new BadRequestException("Issue category is required");

    const status = input.status && allowedStatuses.includes(input.status) ? input.status : "pending";
    const severity = input.severity && allowedSeverities.includes(input.severity) ? input.severity : "normal";
    const foundAt = input.foundAt ? new Date(input.foundAt) : new Date();
    if (Number.isNaN(foundAt.getTime())) throw new BadRequestException("Invalid found date");

    const objectId = input.objectId?.trim() || null;
    if (objectId) {
      const object = await this.database.managedObject.findUnique({ where: { id: objectId } });
      if (!object) throw new NotFoundException("Managed object not found");
    }

    const issue = await this.database.issue.create({
      data: {
        id: `is-${randomUUID()}`,
        title: input.title.trim(),
        category: input.category.trim(),
        status,
        severity,
        foundAt,
        objectId,
      },
    });

    if (objectId) {
      await this.database.managedObject.update({
        where: { id: objectId },
        data: { issueCount: { increment: 1 } },
      });
    }

    const summary = await this.readRepository.issue(issue.id);
    await this.auditService.record({
      action: "issue.create",
      targetType: "issue",
      targetId: issue.id,
      summary: `新增问题「${issue.title}」`,
    });

    return summary;
  }
}
