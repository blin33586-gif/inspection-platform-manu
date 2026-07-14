import type { IssueStatus, Severity } from "@xunjianbao/shared";

const statusLabels: Record<IssueStatus, string> = {
  pending: "待处理",
  processing: "处理中",
  rectified: "已整改",
  verified: "已闭环",
  ignored: "已忽略",
  archived: "已归档",
};

export function getIssueDetailStatusLabel(status: IssueStatus) {
  return statusLabels[status];
}

export function isIssueReadOnly(status: IssueStatus) {
  return status === "verified" || status === "ignored" || status === "archived";
}

export function canCloseIssue(status: IssueStatus, recordCount: number) {
  return recordCount > 0 && !isIssueReadOnly(status);
}

export const severityOptions = [
  { value: "high", label: "严重" },
  { value: "medium", label: "重要" },
  { value: "normal", label: "轻微" },
] as const;

export function issueSeverityLabel(value: Severity) {
  return severityOptions.find((item) => item.value === value)?.label ?? "轻微";
}

export function toLocalDateTimeInput(iso: string) {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
