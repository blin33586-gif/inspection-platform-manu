import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { DatabaseService } from "../../database/database.service.js";
import { currentProjectId, requireCurrentIdentity } from "../auth/project-context.js";

export interface UploadedFileLike {
  filename: string;
  originalname: string;
  mimetype: string;
  path: string;
  size: number;
}

interface CreateRectificationInput {
  description?: string;
}

interface RectificationPhoto {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
}

interface RectificationRecord {
  id: string;
  issueId: string;
  description: string;
  createdBy: string;
  createdAt: Date;
  photos: RectificationPhoto[];
}

const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

@Injectable()
export class IssueRectificationService {
  private readonly finalDir: string;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional() @Inject("ISSUE_RECTIFICATION_STORAGE_ROOT") storageRoot?: string,
  ) {
    this.finalDir = resolve(storageRoot ?? process.cwd(), "storage/issues");
  }

  async list(issueId: string) {
    await this.ensureIssue(issueId);
    const records = await this.database.issueRectificationRecord.findMany({
      where: { issueId },
      orderBy: { createdAt: "desc" },
      include: { photos: { orderBy: { createdAt: "asc" } } },
    });
    return records.map((record) => this.toSummary(record));
  }

  async create(issueId: string, files: UploadedFileLike[], input: CreateRectificationInput) {
    const actor = requireCurrentIdentity().username;
    const projectId = currentProjectId();
    let description: string;
    let issue: { id: string; title: string; status: string };

    try {
      description = input.description?.trim() ?? "";
      if (!description) throw new BadRequestException("请填写整改说明");
      if (files.length < 1) throw new BadRequestException("至少上传 1 张整改照片");
      if (files.length > 6) throw new BadRequestException("一次最多上传 6 张整改照片");
      if (files.some((file) => !allowedExtensions.has(extname(file.originalname).toLowerCase()))) {
        throw new BadRequestException("仅支持 PNG、JPG、JPEG 和 WEBP 格式");
      }
      issue = await this.ensureIssue(issueId, projectId);
      if (issue.status === "verified") throw new BadRequestException("问题已闭环，不能继续提交整改记录");
    } catch (error) {
      await this.removeFiles(files.map((file) => file.path));
      throw error;
    }

    await mkdir(this.finalDir, { recursive: true });
    const movedFiles: Array<UploadedFileLike & { id: string; fileName: string; storagePath: string }> = [];
    try {
      for (const file of files) {
        const id = `ia-${randomUUID()}`;
        const extension = extname(file.originalname).toLowerCase();
        const fileName = `${id}${extension}`;
        const storagePath = join(this.finalDir, fileName);
        await rename(file.path, storagePath);
        movedFiles.push({ ...file, id, fileName, storagePath });
      }
    } catch (error) {
      await this.removeFiles([
        ...movedFiles.map((file) => file.storagePath),
        ...files.map((file) => file.path),
      ]);
      throw error;
    }

    const id = `irr-${randomUUID()}`;
    let created: RectificationRecord;
    try {
      created = await this.database.$transaction(async (transaction) => {
        const record = await transaction.issueRectificationRecord.create({
          data: { id, issueId, description, createdBy: actor },
        });
        const photos = [];
        for (const file of movedFiles) {
          photos.push(await transaction.issueAttachment.create({
            data: {
              id: file.id,
              issueId,
              rectificationRecordId: id,
              attachmentType: "整改照片",
              fileName: file.fileName,
              originalFileName: file.originalname,
              storagePath: file.storagePath,
              mimeType: file.mimetype,
              fileSize: file.size,
              remark: null,
            },
          }));
        }
        await transaction.auditLog.create({
          data: {
            projectId,
            id: `audit-${randomUUID()}`,
            actor,
            action: "issue.rectification.create",
            targetType: "issueRectificationRecord",
            targetId: id,
            summary: `为问题「${issue.title}」提交整改记录，共 ${photos.length} 张照片`,
          },
        });
        return { ...record, photos };
      });
    } catch (error) {
      await this.removeFiles(movedFiles.map((file) => file.storagePath));
      throw error;
    }

    return this.toSummary(created);
  }

  private toSummary(record: RectificationRecord) {
    return {
      id: record.id,
      issueId: record.issueId,
      description: record.description,
      createdBy: record.createdBy,
      createdAt: record.createdAt.toISOString(),
      photos: record.photos.map((photo) => ({
        id: photo.id,
        originalFileName: photo.originalFileName,
        mimeType: photo.mimeType,
        fileSize: photo.fileSize,
        imageUrl: `/issues/rectifications/photos/${photo.id}/file`,
      })),
    };
  }

  private async ensureIssue(issueId: string, projectId = currentProjectId()) {
    const issue = await this.database.issue.findUnique({ where: { id: issueId, projectId } });
    if (!issue) throw new NotFoundException("Issue not found");
    return issue;
  }

  private async removeFiles(paths: string[]) {
    await Promise.all(paths.map((path) => rm(path, { force: true })));
  }
}
