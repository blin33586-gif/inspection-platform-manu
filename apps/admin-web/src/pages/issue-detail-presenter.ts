import type { IssueStatus } from "@xunjianbao/shared";

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
