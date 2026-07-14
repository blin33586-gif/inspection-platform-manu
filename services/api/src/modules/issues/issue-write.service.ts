import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { IssueStatus, IssueSummary, Severity } from "@xunjianbao/shared";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { InspectionReadRepository } from "../../database/inspection-read.repository.js";
import { AuditService } from "../audit/audit.service.js";
import { currentProjectId, requireCurrentIdentity } from "../auth/project-context.js";
import { IssueEventPublishService } from "./issue-event-publish.service.js";

interface CreateIssueInput {
  title?: string;
  category?: string;
  status?: IssueStatus;
  severity?: Severity;
  foundAt?: string;
  objectId?: string;
}

export interface UpdateIssueMetadataInput {
  objectId?: string | null;
  category?: string;
  severity?: Severity;
  foundAt?: string;
}

const allowedStatuses: IssueStatus[] = ["pending", "processing", "rectified", "verified", "ignored", "archived"];
const readOnlyTerminalStatuses = new Set<IssueStatus>(["verified", "ignored", "archived"]);
const allowedSeverities: Severity[] = ["normal", "medium", "high"];
const fullIsoFoundAtPattern = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/;

@Injectable()
export class IssueWriteService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(InspectionReadRepository) private readonly readRepository: InspectionReadRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(IssueEventPublishService) private readonly publisher: IssueEventPublishService,
  ) {}

  async create(input: CreateIssueInput) {
    const actor = requireCurrentIdentity().username;
    const projectId = currentProjectId();
    if (!input.title?.trim()) throw new BadRequestException("Issue title is required");
    if (!input.category?.trim()) throw new BadRequestException("Issue category is required");
    if (input.status && readOnlyTerminalStatuses.has(input.status)) {
      throw new BadRequestException("新建问题不能使用已闭环、暂不处理或已归档状态");
    }

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

  async updateMetadata(id: string, input: UpdateIssueMetadataInput): Promise<IssueSummary | null> {
    let objectId = input.objectId;
    if (objectId !== undefined && objectId !== null) {
      if (typeof objectId !== "string" || !objectId.trim()) {
        throw new BadRequestException("关联对象无效");
      }
      objectId = objectId.trim();
    }

    let category = input.category;
    if (category !== undefined) {
      if (typeof category !== "string" || !category.trim()) {
        throw new BadRequestException("问题类别不能为空");
      }
      category = category.trim();
      if (Array.from(category).length > 100) {
        throw new BadRequestException("问题类别不能超过 100 个字符");
      }
    }

    if (input.severity !== undefined && !allowedSeverities.includes(input.severity)) {
      throw new BadRequestException("严重程度无效");
    }

    let foundAt: Date | undefined;
    if (input.foundAt !== undefined) {
      if (typeof input.foundAt !== "string" || !input.foundAt.trim()) {
        throw new BadRequestException("发现时间无效");
      }
      const normalizedFoundAt = input.foundAt.trim();
      const match = fullIsoFoundAtPattern.exec(normalizedFoundAt);
      const calendarDate = new Date("2000-01-01T00:00:00.000Z");
      if (match) {
        calendarDate.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      }
      foundAt = new Date(normalizedFoundAt);
      if (
        !match
        || calendarDate.getUTCFullYear() !== Number(match[1])
        || calendarDate.getUTCMonth() !== Number(match[2]) - 1
        || calendarDate.getUTCDate() !== Number(match[3])
        || Number.isNaN(foundAt.getTime())
      ) {
        throw new BadRequestException("发现时间无效");
      }
    }

    const actor = requireCurrentIdentity().username;
    const projectId = currentProjectId();
    const metadataUpdate = await this.database.$transaction(async (transaction) => {
      const [lockedIssue] = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Issue"
        WHERE "id" = ${id} AND "projectId" = ${projectId}
        FOR UPDATE
      `;
      if (!lockedIssue) return { issueId: null, changed: false };
      const issue = await transaction.issue.findUnique({ where: { id, projectId } });
      if (!issue) return { issueId: null, changed: false };

      if (objectId !== undefined && objectId !== null) {
        const object = await transaction.managedObject.findUnique({ where: { id: objectId, projectId } });
        if (!object) throw new NotFoundException("关联对象不存在");
      }

      const data: { objectId?: string | null; category?: string; severity?: Severity; foundAt?: Date } = {};
      const changedLabels: string[] = [];
      if (objectId !== undefined && objectId !== issue.objectId) {
        data.objectId = objectId;
        changedLabels.push("关联对象");
      }
      if (category !== undefined && category !== issue.category) {
        data.category = category;
        changedLabels.push("问题类别");
      }
      if (input.severity !== undefined && input.severity !== issue.severity) {
        data.severity = input.severity;
        changedLabels.push("严重程度");
      }
      if (foundAt !== undefined && foundAt.getTime() !== issue.foundAt.getTime()) {
        data.foundAt = foundAt;
        changedLabels.push("发现时间");
      }
      if (changedLabels.length === 0) return { issueId: issue.id, changed: false };

      if (data.objectId !== undefined) {
        if (issue.objectId) {
          await transaction.managedObject.updateMany({
            where: { id: issue.objectId, projectId, issueCount: { gt: 0 } },
            data: { issueCount: { decrement: 1 } },
          });
        }
        if (data.objectId) {
          await transaction.managedObject.update({
            where: { id: data.objectId, projectId },
            data: { issueCount: { increment: 1 } },
          });
        }
      }

      await transaction.issue.update({ where: { id, projectId }, data });
      await transaction.auditLog.create({
        data: {
          projectId,
          id: `audit-${randomUUID()}`,
          actor,
          action: "issue.metadata.update",
          targetType: "issue",
          targetId: id,
          summary: `更新问题「${issue.title}」基础信息：${changedLabels.join("、")}`,
        },
      });
      return { issueId: issue.id, changed: true };
    });

    if (!metadataUpdate.issueId) return null;
    if (metadataUpdate.changed) {
      await this.publisher.refreshCard(metadataUpdate.issueId).catch(() => undefined);
    }
    return this.readRepository.issue(metadataUpdate.issueId);
  }
}
