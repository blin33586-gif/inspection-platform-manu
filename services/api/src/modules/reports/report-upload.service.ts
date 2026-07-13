import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { ReportType } from "@xunjianbao/shared";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { currentProjectId, requireCurrentIdentity } from "../auth/project-context.js";

interface UploadedFileLike {
  filename: string;
  originalname: string;
  mimetype: string;
  path: string;
  size: number;
}

interface CreateReportInput {
  title?: string;
  reportDate?: string;
  reportType?: ReportType;
  relatedObjectName?: string;
  issueCount?: string;
  contentSummary?: string;
}

const allowedExtensions = new Set([".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".webp"]);
const allowedReportTypes: ReportType[] = ["community", "road", "point", "comprehensive"];

@Injectable()
export class ReportUploadService {
  private readonly finalDir = "storage/reports";

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async createFromUpload(file: UploadedFileLike | undefined, input: CreateReportInput) {
    const actor = requireCurrentIdentity().username;
    const projectId = currentProjectId();
    if (!file) throw new BadRequestException("Report file is required");

    const extension = extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      await this.removeTempFile(file.path);
      throw new BadRequestException("Only PDF, Word and image report files are supported");
    }

    await mkdir(this.finalDir, { recursive: true });

    const id = `rp-${randomUUID()}`;
    const storedFileName = `${id}${extension}`;
    const storagePath = join(this.finalDir, storedFileName);
    await rename(file.path, storagePath);

    const relatedObject = input.relatedObjectName
      ? await this.database.managedObject.findFirst({ where: { projectId, name: input.relatedObjectName.trim() } })
      : null;

    const reportDate = input.reportDate ? new Date(input.reportDate) : new Date();
    if (Number.isNaN(reportDate.getTime())) {
      throw new BadRequestException("Invalid report date");
    }

    const reportType = input.reportType && allowedReportTypes.includes(input.reportType)
      ? input.reportType
      : "comprehensive";

    let report;
    try {
      report = await this.database.$transaction(async (transaction) => {
        const created = await transaction.inspectionReport.create({
          data: {
            projectId, id, title: input.title?.trim() || this.titleFromFile(file.originalname), reportDate, reportType,
            relatedObjectId: relatedObject?.id, relatedObjectName: relatedObject?.name ?? input.relatedObjectName?.trim() ?? "未关联对象",
            issueCount: this.parseIssueCount(input.issueCount), contentSummary: input.contentSummary?.trim(),
            fileName: storedFileName, originalFileName: file.originalname, storagePath, mimeType: file.mimetype,
            fileSize: file.size, processStatus: "uploaded",
          },
          select: { id: true, title: true, reportDate: true, reportType: true, relatedObjectName: true, issueCount: true, fileName: true, originalFileName: true, mimeType: true, fileSize: true, processStatus: true },
        });
        await transaction.auditLog.create({
          data: { projectId, id: `audit-${randomUUID()}`, actor, action: "report.upload", targetType: "report", targetId: created.id, summary: `上传巡检报告「${created.title}」` },
        });
        return created;
      });
    } catch (error) {
      await rm(storagePath, { force: true });
      throw error;
    }

    return {
      ...report,
      reportDate: report.reportDate.toISOString().slice(0, 10),
    };
  }

  private titleFromFile(fileName: string) {
    return fileName.replace(/\.[^.]+$/, "") || "未命名报告";
  }

  private parseIssueCount(value: string | undefined) {
    if (!value) return 0;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  private async removeTempFile(path: string) {
    await rm(path, { force: true });
  }
}
