import type { IssueStatus } from "@xunjianbao/shared";

export type IssueLibraryStatus = "pending" | "processed";

export function issueLibraryStatus(status: IssueStatus): IssueLibraryStatus {
  return status === "pending" ? "pending" : "processed";
}

export function issueStatusPatch(status: IssueLibraryStatus): IssueStatus {
  return status === "pending" ? "pending" : "verified";
}
