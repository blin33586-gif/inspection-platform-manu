export interface PublishIssueEventInput {
  idempotencyKey: string;
  expectedAnnotationVersion: number;
  locationName: string;
  foundAt: string;
  category: string;
  description: string;
}

export interface PublishIssueEventResult {
  issueId: string;
  shareUrl: string;
  cardImageUrl: string;
  issueDetailUrl: string;
}

export interface PublicIssueShareRecord {
  locationName: string;
  foundAt: string;
  category: string;
  description: string;
  longitude: number | null;
  latitude: number | null;
  evidenceImageUrl: string;
  cardUrl: string;
}
