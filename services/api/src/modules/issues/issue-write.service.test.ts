import assert from "node:assert/strict";
import test from "node:test";
import type { IssueStatus } from "@xunjianbao/shared";
import { runAsMember } from "../../test-support/auth-context.js";
import { IssueWriteService } from "./issue-write.service.js";

test("rejects read-only terminal statuses when creating an issue", async () => {
  let transactionCalls = 0;
  const database = {
    $transaction: async () => {
      transactionCalls += 1;
      throw new Error("transaction must not start for an invalid initial status");
    },
  };
  const service = new IssueWriteService(database as never, {} as never, {} as never);
  const terminalStatuses: IssueStatus[] = ["verified", "ignored", "archived"];

  for (const status of terminalStatuses) {
    await assert.rejects(
      () => runAsMember(() => service.create({ title: "占道堆物", category: "市容", status })),
      /新建问题不能使用已闭环、暂不处理或已归档状态/,
    );
  }

  assert.equal(transactionCalls, 0);
});
