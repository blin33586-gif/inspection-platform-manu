import type { IssueStatus } from "@xunjianbao/shared";

export type IssueLibraryStatus = "pending" | "processed";

export function issueLibraryStatus(status: IssueStatus): IssueLibraryStatus {
  return status === "pending" ? "pending" : "processed";
}
