import type {
  ArchiveIssueState,
  ManagedObjectArchiveIssue,
  Severity,
} from "@xunjianbao/shared";

export type ArchiveIssueFilter = "all" | ArchiveIssueState;

export function filterArchiveIssues(issues: ManagedObjectArchiveIssue[], filter: ArchiveIssueFilter) {
  return filter === "all" ? issues : issues.filter((issue) => issue.state === filter);
}

export function formatArchiveDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

export function formatLatestInspectionTime(value: string | null) {
  return value ? formatArchiveDateTime(value) : "暂无";
}

export function issueSeverityTone(severity: Severity) {
  if (severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "info";
}
