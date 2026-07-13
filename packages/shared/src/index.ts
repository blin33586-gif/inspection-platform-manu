export type ObjectType = "community" | "road" | "point" | "street";

export const MAP_HOT_AREA_COLOR_OPTIONS = [
  { value: "#1677ff", label: "蓝色" },
  { value: "#13c2c2", label: "青色" },
  { value: "#52c41a", label: "绿色" },
  { value: "#fa8c16", label: "橙色" },
  { value: "#f5222d", label: "红色" },
  { value: "#722ed1", label: "紫色" },
] as const;

export type MapHotAreaColor = (typeof MAP_HOT_AREA_COLOR_OPTIONS)[number]["value"];

export type IssueStatus =
  | "pending"
  | "processing"
  | "rectified"
  | "verified"
  | "ignored"
  | "archived";

export type Severity = "normal" | "medium" | "high";

export type ReportType = "community" | "road" | "point" | "comprehensive";

export interface DashboardSummary {
  inspectionsThisMonth: number;
  issuesThisMonth: number;
  pendingIssues: number;
}

export interface ManagedObjectSummary {
  id: string;
  name: string;
  objectType: ObjectType;
  status: string;
  issueCount: number;
  reportCount: number;
}

export type ArchiveIssueState = "open" | "completed";

export interface ManagedObjectArchiveIssue {
  id: string;
  title: string;
  category: string;
  severity: Severity;
  state: ArchiveIssueState;
  stateLabel: "未闭环" | "已完成";
  foundAt: string;
  updatedAt: string;
  sourceLabel: string;
}

export interface ManagedObjectArchiveOverview {
  objectId: string;
  totalIssues: number;
  openIssues: number;
  completedIssues: number;
  reportCount: number;
  latestInspectionAt: string | null;
  latestInspectionSource: string | null;
  issues: ManagedObjectArchiveIssue[];
}

export interface PointSummary {
  id: string;
  name: string;
  pointType: string;
  relatedObjectName: string;
  status: string;
  issueCount: number;
  reportCount: number;
}

export interface IssueSummary {
  id: string;
  title: string;
  objectName: string;
  category: string;
  status: IssueStatus;
  severity: Severity;
  foundAt: string;
  description?: string | null;
  locationName?: string | null;
  cardImageUrl?: string | null;
}

export interface IssueAttachmentSummary {
  id: string;
  issueId: string;
  attachmentType: string;
  fileName: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  remark?: string | null;
  createdAt: string;
}

export interface ReportSummary {
  id: string;
  taskId?: string | null;
  taskPhotoIds?: string[];
  title: string;
  reportDate: string;
  reportType: ReportType;
  relatedObjectName: string;
  issueCount: number;
  contentSummary?: string | null;
  fileName?: string | null;
  originalFileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  processStatus?: string | null;
  photos?: ReportPhotoSummary[];
}

export interface ReportPhotoSummary {
  taskPhotoId: string;
  mediaAssetId: string;
  fileName: string;
  capturedAt?: string | null;
  videoTimestampMs?: number | null;
  issueDescription?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  issueCardId?: string | null;
  issueTitle?: string | null;
  issueCategory?: string | null;
}

export interface MapAssetSummary {
  id: string;
  name: string;
  mapType: string;
  sourceType?: string;
  fileName?: string | null;
  originalFileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  tileMetadata?: TileMapMetadata | null;
  isActive?: boolean;
  processStatus: string;
  hotAreaCount: number;
}

export interface TileMapMetadata {
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  bounds: {
    west: number;
    east: number;
    north: number;
    south: number;
  };
}

export interface MapHotAreaSummary {
  id: string;
  label: string;
  objectType: ObjectType;
  objectId?: string | null;
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  polygon?: string | null;
  color?: MapHotAreaColor | null;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface AuditLogSummary {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  summary: string;
  reviewStatus?: "pending" | "confirmed" | "canceled" | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}
