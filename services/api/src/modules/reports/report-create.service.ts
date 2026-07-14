import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { currentProjectId, requireCurrentIdentity } from "../auth/project-context.js";

export interface SubmitTaskReportInput {
  taskId?: string;
  taskPhotoIds?: string[];
  title?: string;
  reportDate?: string;
  relatedObjectName?: string;
  issueCount?: number;
  contentSummary?: string;
}

@Injectable()
export class ReportCreateService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async submit(input: SubmitTaskReportInput) {
    const actor = requireCurrentIdentity().username;
    const projectId = currentProjectId();
    if (!input.taskId) throw new BadRequestException("请选择报告所属任务");
    if (input.taskPhotoIds !== undefined && !Array.isArray(input.taskPhotoIds)) {
      throw new BadRequestException("报告照片格式无效");
    }
    const taskPhotoIds = input.taskPhotoIds ?? [];
    if (taskPhotoIds.some((id) => typeof id !== "string" || !id.trim())) {
      throw new BadRequestException("报告照片格式无效");
    }
    if (new Set(taskPhotoIds).size !== taskPhotoIds.length) {
      throw new BadRequestException("报告照片不能重复");
    }

    const title = input.title?.trim();
    if (!title) throw new BadRequestException("请输入报告名称");
    if (Array.from(title).length > 200) throw new BadRequestException("报告名称不能超过 200 个字符");
    const reportDate = parseReportDate(input.reportDate);
    const issueCount = Number.isInteger(input.issueCount) && input.issueCount! >= 0 ? input.issueCount! : 0;
    const common = {
      title,
      reportDate,
      reportType: "comprehensive",
      relatedObjectName: input.relatedObjectName?.trim() || "当前项目",
      issueCount,
      contentSummary: input.contentSummary?.trim() || null,
      processStatus: "completed",
    };

    const result = await this.database.$transaction(async (transaction) => {
      const task = await transaction.inspectionTask.findUnique({ where: { id: input.taskId, projectId } });
      if (!task) throw new NotFoundException("巡检任务不存在");

      if (taskPhotoIds.length > 0) {
        const matchedPhotos = await transaction.taskPhoto.findMany({
          where: {
            taskId: input.taskId,
            id: { in: taskPhotoIds },
          },
          select: { id: true },
        });
        if (matchedPhotos.length !== taskPhotoIds.length) {
          throw new BadRequestException("所选照片不属于当前任务");
        }
      }

      const report = await transaction.inspectionReport.upsert({
        where: { taskId: input.taskId },
        create: {
          projectId,
          id: `rp-${randomUUID()}`,
          taskId: input.taskId,
          ...common,
        },
        update: common,
      });

      await transaction.reportPhoto.deleteMany({ where: { reportId: report.id } });
      if (taskPhotoIds.length > 0) {
        await transaction.reportPhoto.createMany({
          data: taskPhotoIds.map((taskPhotoId, sortIndex) => ({
            id: `rpp-${randomUUID()}`,
            reportId: report.id,
            taskPhotoId,
            sortIndex,
          })),
        });
      }

      await transaction.auditLog.create({
        data: {
          projectId, id: `audit-${randomUUID()}`, actor,
          action: "report.task.submit", targetType: "report", targetId: report.id,
          summary: `提交任务「${task.name}」综合报告「${title}」`,
        },
      });

      return {
        report: { ...report, taskPhotoIds },
        taskName: task.name,
      };
    });
    return result.report;
  }
}

function parseReportDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException("报告日期格式无效");
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) throw new BadRequestException("报告日期格式无效");
  return date;
}
