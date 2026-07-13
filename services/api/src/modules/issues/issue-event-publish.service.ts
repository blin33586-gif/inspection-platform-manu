import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { renderIssueCard } from "./issue-card-renderer.js";
import type { PublishIssueEventInput, PublishIssueEventResult } from "./issue-event-publish.types.js";
import { deriveIssueShareToken, hashShareToken } from "./issue-share-token.js";
import { currentProjectId } from "../auth/project-context.js";

type CardRenderer = typeof renderIssueCard;

interface IssueCardRecord {
  id: string;
  title: string;
  category: string;
  description: string | null;
  locationName: string | null;
  foundAt: Date;
  sourceTaskPhotoId: string | null;
  sourceAnnotationVersion: number | null;
  cardStoragePath: string | null;
}

interface IssuePhotoRecord {
  mediaAsset: { storagePath: string; previewStoragePath: string | null };
  annotationDocument: { id: string; currentVersion: number; annotationJson: string } | null;
}

@Injectable()
export class IssueEventPublishService {
  private readonly storageRoot: string;
  private readonly cardRenderer: CardRenderer;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Optional() @Inject("ISSUE_CARD_STORAGE_ROOT") storageRoot?: string,
    @Optional() @Inject("ISSUE_CARD_RENDERER") cardRenderer?: CardRenderer,
  ) {
    this.storageRoot = resolve(storageRoot ?? resolve(process.cwd(), "storage"));
    this.cardRenderer = cardRenderer ?? renderIssueCard;
  }

  async publish(photoId: string, actor: string, input: PublishIssueEventInput): Promise<PublishIssueEventResult> {
    this.validate(input);
    const existing = await this.database.issue.findUnique({ where: { publishIdempotencyKey: input.idempotencyKey, projectId: currentProjectId() } });
    if (existing) {
      await this.ensureCard(existing, actor);
      return this.result(existing.id);
    }

    const photo = await this.requirePhoto(photoId);
    if (!photo.annotationDocument) throw new BadRequestException("请先保存图片标注");
    if (photo.annotationDocument.currentVersion !== input.expectedAnnotationVersion) {
      throw new ConflictException("标注已更新，请刷新后重试");
    }
    const foundAt = new Date(input.foundAt);
    if (Number.isNaN(foundAt.getTime())) throw new BadRequestException("发现时间无效");

    const id = `is-${randomUUID()}`;
    const token = this.token(id);
    const issue = await this.database.issue.create({
      data: {
        projectId: currentProjectId(),
        id,
        title: input.description.slice(0, 60),
        category: input.category.trim(),
        status: "pending",
        severity: "normal",
        foundAt,
        description: input.description.trim(),
        locationName: input.locationName.trim(),
        sourceTaskPhotoId: photoId,
        sourceAnnotationVersion: input.expectedAnnotationVersion,
        longitude: photo.annotationDocument.longitude,
        latitude: photo.annotationDocument.latitude,
        shareTokenHash: hashShareToken(token),
        shareEnabled: true,
        publishIdempotencyKey: input.idempotencyKey,
        publishedAt: new Date(),
      },
    });
    await this.audit.record({
      actor,
      action: "issue.event.publish",
      targetType: "issue",
      targetId: issue.id,
      summary: `推送问题「${issue.title}」`,
    });

    await this.generateCard(issue, photo, photo.annotationDocument.annotationJson, actor);
    return this.result(id);
  }

  private async ensureCard(issue: IssueCardRecord, actor: string) {
    if (issue.cardStoragePath) return;
    if (!issue.sourceTaskPhotoId || !issue.sourceAnnotationVersion) {
      throw new ConflictException("问题缺少原始照片或标注版本，无法生成分享卡");
    }
    const photo = await this.requirePhoto(issue.sourceTaskPhotoId);
    if (!photo.annotationDocument) throw new ConflictException("问题的原始标注已不存在");
    const annotationJson = await this.readAnnotationVersion(photo, issue.sourceAnnotationVersion);
    await this.generateCard(issue, photo, annotationJson, actor);
  }

  private async requirePhoto(photoId: string) {
    const photo = await this.database.taskPhoto.findUnique({
      where: { id: photoId, task: { projectId: currentProjectId() } },
      include: { mediaAsset: true, annotationDocument: true },
    });
    if (!photo) throw new NotFoundException("任务照片不存在");
    return photo;
  }

  private async readAnnotationVersion(photo: IssuePhotoRecord, version: number) {
    const document = photo.annotationDocument;
    if (!document) throw new ConflictException("问题的原始标注已不存在");
    if (document.currentVersion === version) return document.annotationJson;
    const snapshot = await this.database.photoAnnotationVersion.findUnique({
      where: { documentId_version: { documentId: document.id, version } },
      select: { annotationJson: true },
    });
    if (!snapshot) throw new ConflictException("问题的原始标注版本已不存在");
    return snapshot.annotationJson;
  }

  private async generateCard(issue: IssueCardRecord, photo: IssuePhotoRecord, annotationJson: string, actor: string) {
    const token = this.token(issue.id);
    const finalStoragePath = `storage/issues/cards/${issue.id}.png`;
    const finalPath = this.resolveStoragePath(finalStoragePath);
    const tempPath = `${finalPath}.${randomUUID()}.tmp`;
    try {
      const sourceStoragePath = photo.mediaAsset.previewStoragePath || photo.mediaAsset.storagePath;
      const source = await readFile(this.resolveStoragePath(sourceStoragePath));
      const png = await this.cardRenderer({
        annotatedPhoto: source,
        annotationJson,
        locationName: issue.locationName ?? "未命名点位",
        foundAt: issue.foundAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }),
        category: issue.category,
        description: issue.description ?? issue.title,
        shareUrl: this.shareUrl(token),
      });
      await mkdir(dirname(finalPath), { recursive: true });
      await writeFile(tempPath, png);
      await rename(tempPath, finalPath);
      await this.database.issue.update({
        where: { id: issue.id, projectId: currentProjectId() },
        data: { cardStoragePath: finalStoragePath, cardMimeType: "image/png", cardFileSize: png.length },
      });
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      await this.audit.record({
        actor,
        action: "issue.card.failed",
        targetType: "issue",
        targetId: issue.id,
        summary: `问题卡生成失败：${error instanceof Error ? error.message : "unknown"}`,
      });
      throw new InternalServerErrorException("问题已创建，但分享卡生成失败，请重试");
    }
  }

  private resolveStoragePath(storagePath: string) {
    const normalized = storagePath.replace(/\\/g, "/").replace(/^storage\//, "");
    const absolutePath = resolve(this.storageRoot, normalized);
    const pathFromRoot = relative(this.storageRoot, absolutePath);
    if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`)) {
      throw new BadRequestException("问题卡文件路径无效");
    }
    return absolutePath;
  }

  private validate(input: PublishIssueEventInput) {
    if (!input.idempotencyKey?.trim() || !input.locationName?.trim() || !input.category?.trim() || !input.description?.trim()) {
      throw new BadRequestException("请完整填写事件信息");
    }
    if (!Number.isInteger(input.expectedAnnotationVersion) || input.expectedAnnotationVersion < 1) {
      throw new BadRequestException("标注版本无效");
    }
  }

  private token(id: string) {
    return deriveIssueShareToken(id, process.env.AUTH_SECRET || "xunjianbao-development-share-secret");
  }

  private shareUrl(token: string) {
    return `${process.env.PUBLIC_APP_URL || "http://localhost:5182"}/s/issue/${token}`;
  }

  private result(id: string) {
    const token = this.token(id);
    return {
      issueId: id,
      shareUrl: this.shareUrl(token),
      cardImageUrl: `/api/v1/public/issues/${token}/card.png`,
      issueDetailUrl: `/issues/${id}`,
    };
  }
}
