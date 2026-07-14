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

export interface IssueRectificationPhotoSummary {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  imageUrl: string;
}

export interface IssueRectificationRecordSummary {
  id: string;
  issueId: string;
  description: string;
  createdBy: string;
  createdAt: string;
  photos: IssueRectificationPhotoSummary[];
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
  uploadedByName?: string | null;
  createdAt: string;
  activatedAt?: string | null;
  errorMessage?: string | null;
}

export type MapAssetProcessStatus = "queued" | "running" | "published" | "failed";

export interface MapAssetPageResult extends PageResult<MapAssetSummary> {
  hasProcessing: boolean;
}

export const MAP_PROCESSING_FAILURE_FALLBACK = "地图处理失败，请重新上传；如仍失败请联系管理员";

export function normalizeMapAssetProcessStatus(status: string): MapAssetProcessStatus {
  if (status === "queued" || status === "running" || status === "published" || status === "failed") return status;
  if (status === "processing") return "running";
  if (status === "processed" || status === "uploaded" || status === "ready") return "published";
  return "failed";
}

export function sanitizeMapProcessingFailureMessage(value: unknown) {
  const message = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!message) return MAP_PROCESSING_FAILURE_FALLBACK;
  if (/ZIP 条目数量超过|ZIP 展开大小超过/.test(message)) return "ZIP 瓦片包过大，请精简后重新上传";
  if (/重复瓦片坐标/.test(message)) return "ZIP 包含重复瓦片坐标，请检查后重新上传";
  if (/瓦片路径无效|瓦片目录结构无效|仅支持 z\/x\/y|瓦片坐标超出有效范围/.test(message)) {
    return "ZIP 瓦片目录必须为 z/x/y.png，且坐标有效";
  }
  if (/PNG 内容无效/.test(message)) return "ZIP 中包含无效 PNG 瓦片，请检查后重新上传";
  if (/未找到 PNG 瓦片/.test(message)) return "ZIP 中未找到有效 PNG 瓦片";
  if (/GDAL 未生成有效/.test(message)) return "TIF 未生成有效地图瓦片，请检查坐标系和图像内容";
  if (
    /gdal|proj(?:ection)?|traceback|stderr|prisma|sql|database|\b(?:select|insert|update|delete)\b/i.test(message)
    || /\bfile:(?:\/{2,}|\\{2,})/i.test(message)
    || /(?<![A-Za-z0-9._~%/\\-])\/[^/\s"'<>()[\]{}，。；：！？、]+(?:\/[^/\s"'<>()[\]{}，。；：！？、]+)*/.test(message)
    || /[A-Za-z]:[\\/][^\s"'<>()[\]{}，。；：！？、]+/.test(message)
    || /\\\\[^\\\s"'<>]+\\[^\\\s"'<>]+/.test(message)
    || /\bat\s+\S+\s*\(/.test(message)
  ) {
    return MAP_PROCESSING_FAILURE_FALLBACK;
  }
  if (!/[\u3400-\u9fff]/.test(message)) return MAP_PROCESSING_FAILURE_FALLBACK;
  return message.slice(0, 120) || MAP_PROCESSING_FAILURE_FALLBACK;
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
