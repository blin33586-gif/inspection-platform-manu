import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { IssueStatus, Severity } from "@xunjianbao/shared";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { AuditService } from "../audit/audit.service.js";
import { currentProjectId, requireCurrentIdentity } from "../auth/project-context.js";

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
    const actor = requireCurrentIdentity().username;
    const projectId = currentProjectId();
    if (!input.title?.trim()) throw new BadRequestException("Issue title is required");
    if (!input.category?.trim()) throw new BadRequestException("Issue category is required");

    const status = input.status && allowedStatuses.includes(input.status) ? input.status : "pending";
    const severity = input.severity && allowedSeverities.includes(input.severity) ? input.severity : "normal";
    const foundAt = input.foundAt ? new Date(input.foundAt) : new Date();
    if (Number.isNaN(foundAt.getTime())) throw new BadRequestException("Invalid found date");

    const objectId = input.objectId?.trim() || null;
    const issue = await this.database.$transaction(async (transaction) => {
      if (objectId) {
        const object = await transaction.managedObject.findUnique({ where: { id: objectId, projectId } });
        if (!object) throw new NotFoundException("Managed object not found");
      }
      const created = await transaction.issue.create({
        data: {
          projectId,
          id: `is-${randomUUID()}`,
          title: input.title!.trim(),
          category: input.category!.trim(),
          status,
          severity,
          foundAt,
          objectId,
        },
      });
      if (objectId) {
        await transaction.managedObject.update({
          where: { id: objectId, projectId },
          data: { issueCount: { increment: 1 } },
        });
      }
      await transaction.auditLog.create({
        data: {
          projectId, id: `audit-${randomUUID()}`, actor,
          action: "issue.create", targetType: "issue", targetId: created.id,
          summary: `新增问题「${created.title}」`,
        },
      });
      return created;
    });

    const summary = await this.readRepository.issue(issue.id);
    return summary;
  }
}
