import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { renderIssueCard } from "./issue-card-renderer.js";
import type { PublishIssueEventInput, PublishIssueEventResult } from "./issue-event-publish.types.js";
import { deriveIssueShareToken, hashShareToken } from "./issue-share-token.js";

@Injectable()
export class IssueEventPublishService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(AuditService) private readonly audit: AuditService) {}

  async publish(photoId: string, actor: string, input: PublishIssueEventInput): Promise<PublishIssueEventResult> {
    this.validate(input);
    const existing = await this.database.issue.findUnique({ where: { publishIdempotencyKey: input.idempotencyKey } });
    if (existing) return this.result(existing.id);
    const photo = await this.database.taskPhoto.findUnique({ where: { id: photoId }, include: { mediaAsset: true, annotationDocument: true } });
    if (!photo) throw new NotFoundException("任务照片不存在");
    if (!photo.annotationDocument) throw new BadRequestException("请先保存图片标注");
    if (photo.annotationDocument.currentVersion !== input.expectedAnnotationVersion) throw new ConflictException("标注已更新，请刷新后重试");
    const id = `is-${randomUUID()}`;
    const token = deriveIssueShareToken(id, process.env.AUTH_SECRET || "xunjianbao-development-share-secret");
    const foundAt = new Date(input.foundAt);
    if (Number.isNaN(foundAt.getTime())) throw new BadRequestException("发现时间无效");
    const issue = await this.database.issue.create({ data: {
      id, title: input.description.slice(0, 60), category: input.category.trim(), status: "pending", severity: "normal", foundAt,
      description: input.description.trim(), locationName: input.locationName.trim(), sourceTaskPhotoId: photoId,
      sourceAnnotationVersion: input.expectedAnnotationVersion, longitude: photo.annotationDocument.longitude,
      latitude: photo.annotationDocument.latitude, shareTokenHash: hashShareToken(token), shareEnabled: true,
      publishIdempotencyKey: input.idempotencyKey, publishedAt: new Date(),
    } });
    try {
      const sourcePath = photo.mediaAsset.previewStoragePath || photo.mediaAsset.storagePath;
      const source = await readFile(resolve(process.cwd(), sourcePath));
      const shareUrl = this.shareUrl(token);
      const png = await renderIssueCard({ annotatedPhoto: source, annotationJson: photo.annotationDocument.annotationJson, locationName: input.locationName, foundAt: input.foundAt.replace("T", " ").slice(0, 16), category: input.category, description: input.description, shareUrl });
      const finalPath = `storage/issues/cards/${id}.png`;
      const tempPath = `${finalPath}.${randomUUID()}.tmp`;
      await mkdir(dirname(resolve(process.cwd(), finalPath)), { recursive: true });
      await writeFile(resolve(process.cwd(), tempPath), png);
      await rename(resolve(process.cwd(), tempPath), resolve(process.cwd(), finalPath));
      await this.database.issue.update({ where: { id }, data: { cardStoragePath: finalPath, cardMimeType: "image/png", cardFileSize: png.length } });
    } catch (error) {
      await rm(resolve(process.cwd(), `storage/issues/cards/${id}.tmp`), { force: true }).catch(() => undefined);
      await this.audit.record({ action: "issue.card.failed", targetType: "issue", targetId: id, summary: `问题卡生成失败：${error instanceof Error ? error.message : "unknown"}` });
    }
    await this.audit.record({ action: "issue.event.publish", targetType: "issue", targetId: issue.id, summary: `推送问题「${issue.title}」` });
    return this.result(id);
  }

  private validate(input: PublishIssueEventInput) {
    if (!input.idempotencyKey?.trim() || !input.locationName?.trim() || !input.category?.trim() || !input.description?.trim()) throw new BadRequestException("请完整填写事件信息");
    if (!Number.isInteger(input.expectedAnnotationVersion) || input.expectedAnnotationVersion < 1) throw new BadRequestException("标注版本无效");
  }
  private token(id: string) { return deriveIssueShareToken(id, process.env.AUTH_SECRET || "xunjianbao-development-share-secret"); }
  private shareUrl(token: string) { return `${process.env.PUBLIC_APP_URL || "http://localhost:5180"}/s/issue/${token}`; }
  private result(id: string) { const token = this.token(id); return { issueId: id, shareUrl: this.shareUrl(token), cardImageUrl: `/api/v1/public/issues/${token}/card.png`, issueDetailUrl: `/issues/${id}` }; }
}
