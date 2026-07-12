import { GoneException, Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { hashShareToken } from "./issue-share-token.js";

@Injectable()
export class IssuePublicReadService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}
  async issue(token: string) {
    const issue = await this.lookup(token);
    return { locationName: issue.locationName!, foundAt: issue.foundAt.toISOString(), category: issue.category, description: issue.description!, longitude: issue.longitude, latitude: issue.latitude, evidenceImageUrl: `/api/v1/public/issues/${token}/evidence`, cardUrl: `/api/v1/public/issues/${token}/card.png`, cardDownloadUrl: `/api/v1/public/issues/${token}/card-download.png` };
  }
  async evidence(token: string) { const issue = await this.lookup(token); return { storagePath: issue.sourceTaskPhoto!.mediaAsset.previewStoragePath || issue.sourceTaskPhoto!.mediaAsset.storagePath, mimeType: issue.sourceTaskPhoto!.mediaAsset.previewMimeType || issue.sourceTaskPhoto!.mediaAsset.mimeType, fileName: issue.sourceTaskPhoto!.mediaAsset.originalFileName, originalFileName: issue.sourceTaskPhoto!.mediaAsset.originalFileName }; }
  async card(token: string) { const issue = await this.lookup(token); return { storagePath: issue.cardStoragePath, mimeType: issue.cardMimeType, fileName: `${issue.id}.png`, originalFileName: `${issue.id}.png` }; }
  private async lookup(token: string) { const issue = await this.database.issue.findUnique({ where: { shareTokenHash: hashShareToken(token) }, include: { sourceTaskPhoto: { include: { mediaAsset: true } } } }); if (!issue?.shareEnabled || !issue.sourceTaskPhoto) throw new GoneException("分享已失效"); return issue; }
}
