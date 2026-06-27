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
}
