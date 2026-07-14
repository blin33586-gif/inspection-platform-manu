import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
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

const imageFormats = {
  jpeg: { extension: ".jpg", mimeType: "image/jpeg" },
  png: { extension: ".png", mimeType: "image/png" },
  webp: { extension: ".webp", mimeType: "image/webp" },
} as const;
const MAX_RECTIFICATION_IMAGE_PIXELS = 40_000_000;
const RECTIFICATION_THUMBNAIL_WIDTH = 480;
const RECTIFICATION_THUMBNAIL_HEIGHT = 360;

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
    const temporaryPaths = files.map((file) => file.path);
    const movedFiles: Array<UploadedFileLike & { id: string; fileName: string; storagePath: string; detectedMimeType: string }> = [];
    let preserveMovedFiles = false;
    try {
      const actor = requireCurrentIdentity().username;
      const projectId = currentProjectId();
      const description = input.description?.trim() ?? "";
      if (!description) throw new BadRequestException("请填写整改说明");
      if (files.length < 1) throw new BadRequestException("至少上传 1 张整改照片");
      if (files.length > 6) throw new BadRequestException("一次最多上传 6 张整改照片");
      const validatedFiles = await Promise.all(files.map(async (file) => {
        let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
        try {
          metadata = await sharp(file.path, { limitInputPixels: MAX_RECTIFICATION_IMAGE_PIXELS }).metadata();
        } catch {
          throw new BadRequestException("无法识别整改照片");
        }
        if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_RECTIFICATION_IMAGE_PIXELS) {
          throw new BadRequestException("整改照片像素过高");
        }
        const detected = imageFormats[metadata.format as keyof typeof imageFormats];
        if (!detected) throw new BadRequestException("仅支持 JPEG、PNG 和 WebP 图片");
        return { ...file, extension: detected.extension, detectedMimeType: detected.mimeType };
      }));
      const issue = await this.ensureIssue(issueId, projectId);
      this.assertWritable(issue.status);

      await mkdir(this.finalDir, { recursive: true });
      for (const file of validatedFiles) {
        const id = `ia-${randomUUID()}`;
        const fileName = `${id}${file.extension}`;
        const storagePath = join(this.finalDir, fileName);
        await rename(file.path, storagePath);
        movedFiles.push({ ...file, id, fileName, storagePath });
      }

      const id = `irr-${randomUUID()}`;
      let created: RectificationRecord;
      try {
        created = await this.database.$transaction(async (transaction) => {
          const [lockedIssue] = await transaction.$queryRaw<Array<{ id: string; title: string; status: string }>>`
            SELECT "id", "title", "status"
            FROM "Issue"
            WHERE "id" = ${issueId} AND "projectId" = ${projectId}
            FOR UPDATE
          `;
          if (!lockedIssue) throw new NotFoundException("Issue not found");
          this.assertWritable(lockedIssue.status);
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
                mimeType: file.detectedMimeType,
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
              summary: `为问题「${lockedIssue.title}」提交整改记录，共 ${photos.length} 张照片`,
            },
          });
          return { ...record, photos };
        });
      } catch (transactionError) {
        try {
          const committed = await this.database.issueRectificationRecord.findUnique({
            where: { id },
            include: { photos: { orderBy: { createdAt: "asc" } } },
          });
          if (committed) {
            preserveMovedFiles = true;
            return this.toSummary(committed);
          }
        } catch {
          preserveMovedFiles = true;
        }
        throw transactionError;
      }

      return this.toSummary(created);
    } catch (error) {
      await this.removeFiles([
        ...temporaryPaths,
        ...(preserveMovedFiles ? [] : movedFiles.map((file) => file.storagePath)),
      ]);
      throw error;
    }
  }

  async close(issueId: string) {
    const actor = requireCurrentIdentity().username;
    const projectId = currentProjectId();
    return this.database.$transaction(async (transaction) => {
      const [issue] = await transaction.$queryRaw<Array<{ id: string; title: string; status: string }>>`
        SELECT "id", "title", "status"
        FROM "Issue"
        WHERE "id" = ${issueId} AND "projectId" = ${projectId}
        FOR UPDATE
      `;
      if (!issue) throw new NotFoundException("Issue not found");
      if (issue.status === "verified") {
        const alreadyClosed = await transaction.issue.findUnique({ where: { id: issueId, projectId } });
        if (!alreadyClosed) throw new NotFoundException("Issue not found");
        return alreadyClosed;
      }
      this.assertWritable(issue.status);
      const recordCount = await transaction.issueRectificationRecord.count({
        where: { issueId, issue: { projectId } },
      });
      if (recordCount < 1) throw new BadRequestException("请至少提交一条整改记录后再闭环");

      const updated = await transaction.issue.updateMany({
        where: { id: issueId, projectId, status: { notIn: ["verified", "ignored", "archived"] } },
        data: { status: "verified" },
      });
      if (updated.count === 0) {
        const current = await transaction.issue.findUnique({ where: { id: issueId, projectId } });
        if (current?.status === "verified") return current;
        throw new BadRequestException("问题状态已变化，请刷新后重试");
      }
      await transaction.auditLog.create({
        data: {
          projectId,
          id: `audit-${randomUUID()}`,
          actor,
          action: "issue.close",
          targetType: "issue",
          targetId: issueId,
          summary: `确认闭环问题「${issue.title}」`,
        },
      });
      const closed = await transaction.issue.findUnique({ where: { id: issueId, projectId } });
      if (!closed) throw new NotFoundException("Issue not found");
      return closed;
    });
  }

  async photo(photoId: string) {
    return this.database.issueAttachment.findFirst({
      where: { id: photoId, rectificationRecordId: { not: null }, issue: { projectId: currentProjectId() } },
      select: { storagePath: true, originalFileName: true, fileName: true, mimeType: true },
    });
  }

  async thumbnail(photoId: string) {
    const photo = await this.photo(photoId);
    if (!photo?.storagePath) throw new NotFoundException("File not found");
    try {
      return await sharp(resolve(process.cwd(), photo.storagePath), { limitInputPixels: MAX_RECTIFICATION_IMAGE_PIXELS })
        .rotate()
        .resize({
          width: RECTIFICATION_THUMBNAIL_WIDTH,
          height: RECTIFICATION_THUMBNAIL_HEIGHT,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 76, progressive: true })
        .toBuffer();
    } catch {
      throw new NotFoundException("File not found");
    }
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
        thumbnailUrl: `/issues/rectifications/photos/${photo.id}/thumbnail`,
      })),
    };
  }

  private async ensureIssue(issueId: string, projectId = currentProjectId()) {
    const issue = await this.database.issue.findUnique({ where: { id: issueId, projectId } });
    if (!issue) throw new NotFoundException("Issue not found");
    return issue;
  }

  private assertWritable(status: string) {
    if (status === "verified") throw new BadRequestException("问题已闭环，不能继续提交整改记录");
    if (status === "ignored" || status === "archived") {
      throw new BadRequestException("当前状态不能提交整改记录或确认闭环");
    }
  }

  private async removeFiles(paths: string[]) {
    await Promise.all(paths.map((path) => rm(path, { force: true })));
  }
}
