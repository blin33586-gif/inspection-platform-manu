export type ObjectType = "community" | "road" | "point" | "street";

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

export interface IssueSummary {
  id: string;
  title: string;
  objectName: string;
  category: string;
  status: IssueStatus;
  severity: Severity;
  foundAt: string;
}

export interface ReportSummary {
  id: string;
  title: string;
  reportDate: string;
  reportType: ReportType;
  relatedObjectName: string;
  issueCount: number;
  fileName?: string | null;
  originalFileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  processStatus?: string | null;
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
  processStatus: string;
  hotAreaCount: number;
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
