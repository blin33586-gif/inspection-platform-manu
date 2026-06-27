import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";

interface UploadedFileLike {
  filename: string;
  originalname: string;
  mimetype: string;
  path: string;
  size: number;
}

interface UploadIssueAttachmentInput {
  attachmentType?: string;
  remark?: string;
}

const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf", ".doc", ".docx"]);
const allowedAttachmentTypes = new Set(["现场照片", "整改照片", "复查照片", "附件"]);

@Injectable()
export class IssueAttachmentService {
  private readonly finalDir = "storage/issues";

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async list(issueId: string) {
    await this.ensureIssue(issueId);
    const attachments = await this.database.issueAttachment.findMany({
      where: { issueId },
      orderBy: { createdAt: "desc" },
    });

    return attachments.map((attachment) => ({
      id: attachment.id,
      issueId: attachment.issueId,
      attachmentType: attachment.attachmentType,
      fileName: attachment.fileName,
      originalFileName: attachment.originalFileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      remark: attachment.remark,
      createdAt: attachment.createdAt.toISOString(),
    }));
  }

  async create(issueId: string, file: UploadedFileLike | undefined, input: UploadIssueAttachmentInput) {
    const issue = await this.ensureIssue(issueId);
    if (!file) throw new BadRequestException("Issue attachment file is required");

    const extension = extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      await this.removeTempFile(file.path);
      throw new BadRequestException("Only image, PDF and Word files are supported");
    }

    await mkdir(this.finalDir, { recursive: true });
    const id = `ia-${randomUUID()}`;
    const storedFileName = `${id}${extension}`;
    const storagePath = join(this.finalDir, storedFileName);
    await rename(file.path, storagePath);

    const attachmentType = input.attachmentType && allowedAttachmentTypes.has(input.attachmentType)
      ? input.attachmentType
      : "现场照片";

    const attachment = await this.database.issueAttachment.create({
      data: {
        id,
        issueId,
        attachmentType,
        fileName: storedFileName,
        originalFileName: file.originalname,
        storagePath,
        mimeType: file.mimetype,
        fileSize: file.size,
        remark: input.remark?.trim() || null,
      },
    });

    await this.auditService.record({
      action: "issue.attachment.upload",
      targetType: "issueAttachment",
      targetId: attachment.id,
      summary: `为问题「${issue.title}」上传${attachment.attachmentType}「${attachment.originalFileName}」`,
    });

    return {
      id: attachment.id,
      issueId: attachment.issueId,
      attachmentType: attachment.attachmentType,
      fileName: attachment.fileName,
      originalFileName: attachment.originalFileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      remark: attachment.remark,
      createdAt: attachment.createdAt.toISOString(),
    };
  }

  async file(id: string) {
    return this.database.issueAttachment.findUnique({
      where: { id },
      select: { storagePath: true, originalFileName: true, fileName: true },
    });
  }

  private async ensureIssue(issueId: string) {
    const issue = await this.database.issue.findUnique({ where: { id: issueId } });
    if (!issue) throw new NotFoundException("Issue not found");
    return issue;
  }

  private async removeTempFile(path: string) {
    await rm(path, { force: true });
  }
}
