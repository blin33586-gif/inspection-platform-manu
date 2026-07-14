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
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { renderIssueCard } from "./issue-card-renderer.js";
import type { PublishIssueEventInput, PublishIssueEventResult } from "./issue-event-publish.types.js";
import { deriveIssueShareToken, hashShareToken } from "./issue-share-token.js";
import { currentProjectId, requireCurrentIdentity } from "../auth/project-context.js";

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
  updatedAt: Date;
}

interface IssuePhotoRecord {
  mediaAsset: { storagePath: string; previewStoragePath: string | null };
  annotationDocument: { id: string; currentVersion: number; annotationJson: string } | null;
}

@Injectable()
export class IssueEventPublishService {
  private readonly storageRoot: string;
  private readonly cardRenderer: CardRenderer;
  private readonly cardRefreshes = new Map<string, Promise<void>>();

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Optional() @Inject("ISSUE_CARD_STORAGE_ROOT") storageRoot?: string,
    @Optional() @Inject("ISSUE_CARD_RENDERER") cardRenderer?: CardRenderer,
  ) {
    this.storageRoot = resolve(storageRoot ?? resolve(process.cwd(), "storage"));
    this.cardRenderer = cardRenderer ?? renderIssueCard;
  }

  async publish(photoId: string, input: PublishIssueEventInput): Promise<PublishIssueEventResult> {
    const identity = requireCurrentIdentity();
    const projectId = currentProjectId();
    this.validate(input);
    const existing = await this.database.issue.findUnique({ where: { publishIdempotencyKey: input.idempotencyKey, projectId } });
    if (existing) {
      await this.ensureCard(existing, projectId, identity.username);
      return this.result(existing.id);
    }

    const photo = await this.requirePhoto(photoId, projectId);
    if (!photo.annotationDocument) throw new BadRequestException("请先保存图片标注");
    const annotationDocument = photo.annotationDocument;
    if (annotationDocument.currentVersion !== input.expectedAnnotationVersion) {
      throw new ConflictException("标注已更新，请刷新后重试");
    }
    const foundAt = new Date(input.foundAt);
    if (Number.isNaN(foundAt.getTime())) throw new BadRequestException("发现时间无效");

    const id = `is-${randomUUID()}`;
    const token = this.token(id);
    const issue = await this.database.$transaction(async (transaction) => {
      const created = await transaction.issue.create({
        data: {
          projectId,
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
          longitude: annotationDocument.longitude,
          latitude: annotationDocument.latitude,
          shareTokenHash: hashShareToken(token),
          shareEnabled: true,
          publishIdempotencyKey: input.idempotencyKey,
          publishedAt: new Date(),
        },
      });
      await transaction.auditLog.create({
        data: {
          projectId,
          id: `audit-${randomUUID()}`,
          actor: identity.username,
          action: "issue.event.publish",
          targetType: "issue",
          targetId: created.id,
          summary: `推送问题「${created.title}」`,
        },
      });
      return created;
    });

    const written = await this.generateCard(issue, photo, annotationDocument.annotationJson, projectId, identity.username);
    if (!written) await this.queueCardRefresh(issue.id, projectId, identity.username, true);
    return this.result(id);
  }

  async refreshCard(issueId: string): Promise<void> {
    const identity = requireCurrentIdentity();
    const projectId = currentProjectId();
    await this.queueCardRefresh(issueId, projectId, identity.username, false);
  }

  private async queueCardRefresh(issueId: string, projectId: string, actor: string, cardRequired: boolean): Promise<void> {
    const previous = this.cardRefreshes.get(issueId) ?? Promise.resolve();
    const refresh = previous
      .catch(() => undefined)
      .then(() => this.refreshCurrentCard(issueId, projectId, actor, cardRequired));
    this.cardRefreshes.set(issueId, refresh);
    try {
      await refresh;
    } finally {
      if (this.cardRefreshes.get(issueId) === refresh) this.cardRefreshes.delete(issueId);
    }
  }

  private async refreshCurrentCard(issueId: string, projectId: string, actor: string, cardRequired: boolean): Promise<void> {
    while (true) {
      const issue = await this.database.issue.findUnique({ where: { id: issueId, projectId } });
      if (!issue || (!cardRequired && !issue.cardStoragePath) || !issue.sourceTaskPhotoId || !issue.sourceAnnotationVersion) return;

      const photo = await this.requirePhoto(issue.sourceTaskPhotoId, projectId);
      if (!photo.annotationDocument) return;
      const annotationJson = await this.readAnnotationVersion(photo, issue.sourceAnnotationVersion);
      const written = await this.generateCard(issue, photo, annotationJson, projectId, actor);
      if (written) return;
    }
  }

  async ensureFreshCard(issueId: string): Promise<void> {
    const projectId = currentProjectId();
    const issue = await this.database.issue.findUnique({ where: { id: issueId, projectId } });
    if (!issue?.cardStoragePath) return;

    const cardPath = this.resolveStoragePath(issue.cardStoragePath);
    const cardStat = await stat(cardPath).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    });
    if (cardStat && cardStat.mtimeMs >= issue.updatedAt.getTime()) return;
    await this.refreshCard(issueId);
  }

  private async ensureCard(issue: IssueCardRecord, projectId: string, actor: string) {
    if (issue.cardStoragePath) return;
    if (!issue.sourceTaskPhotoId || !issue.sourceAnnotationVersion) {
      throw new ConflictException("问题缺少原始照片或标注版本，无法生成分享卡");
    }
    const photo = await this.requirePhoto(issue.sourceTaskPhotoId, projectId);
    if (!photo.annotationDocument) throw new ConflictException("问题的原始标注已不存在");
    const annotationJson = await this.readAnnotationVersion(photo, issue.sourceAnnotationVersion);
    const written = await this.generateCard(issue, photo, annotationJson, projectId, actor);
    if (!written) await this.queueCardRefresh(issue.id, projectId, actor, true);
  }

  private async requirePhoto(photoId: string, projectId: string) {
    const photo = await this.database.taskPhoto.findUnique({
      where: { id: photoId, task: { projectId } },
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

  private async generateCard(issue: IssueCardRecord, photo: IssuePhotoRecord, annotationJson: string, projectId: string, actor: string) {
    const token = this.token(issue.id);
    const candidateStoragePath = `storage/issues/cards/${issue.id}-${issue.updatedAt.getTime()}-${randomUUID()}.png`;
    const candidatePath = this.resolveStoragePath(candidateStoragePath);
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
      await mkdir(dirname(candidatePath), { recursive: true });
      await writeFile(candidatePath, png);
      const current = await this.database.issue.findUnique({
        where: { id: issue.id, projectId },
        select: { updatedAt: true },
      });
      if (!current || current.updatedAt.getTime() !== issue.updatedAt.getTime()) {
        await rm(candidatePath, { force: true });
        return false;
      }
      const persisted = await this.database.issue.updateMany({
        where: {
          id: issue.id,
          projectId,
          updatedAt: issue.updatedAt,
          cardStoragePath: issue.cardStoragePath,
        },
        data: {
          cardStoragePath: candidateStoragePath,
          cardMimeType: "image/png",
          cardFileSize: png.length,
          updatedAt: issue.updatedAt,
        },
      });
      if (persisted.count !== 1) {
        await rm(candidatePath, { force: true });
        return false;
      }
      if (issue.cardStoragePath && issue.cardStoragePath !== candidateStoragePath) {
        try {
          await rm(this.resolveStoragePath(issue.cardStoragePath), { force: true });
        } catch {
          // The database pointer already references the immutable candidate. Old-file cleanup is best effort.
        }
      }
      return true;
    } catch (error) {
      await rm(candidatePath, { force: true }).catch(() => undefined);
      await this.database.auditLog.create({
        data: {
          projectId,
          id: `audit-${randomUUID()}`,
          actor,
          action: "issue.card.failed",
          targetType: "issue",
          targetId: issue.id,
          summary: `问题卡生成失败：${error instanceof Error ? error.message : "unknown"}`,
        },
      });
      throw new InternalServerErrorException("问题卡刷新失败，请重试");
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
