import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runWithProjectContext } from "../auth/project-context.js";
import { AuditService } from "./audit.service.js";

const memberIdentity = {
  id: "member-42",
  sub: "member-42",
  username: "member.wu",
  name: "吴成员",
  role: "member" as const,
  tokenVersion: 1,
  projectIds: ["quyang"],
};

test("business audit records the authenticated member username rather than admin", async () => {
  let created: Record<string, unknown> | undefined;
  const database = {
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created = data;
        return data;
      },
    },
  };
  const service = new AuditService(database as never);

  await runWithProjectContext({ projectId: "quyang", identity: memberIdentity }, () => service.record({
    action: "issue.create",
    targetType: "issue",
    targetId: "issue-1",
    summary: "成员新增问题",
  }));

  assert.equal(created?.actor, "member.wu");
});

test("business write paths contain no hard-coded admin actor or client-supplied actor", async () => {
  const files = [
    "../inspection-tasks/inspection-task-write.service.ts",
    "../inspection-tasks/inspection-task-deletion.service.ts",
    "../inspection-tasks/inspection-task-distribution.service.ts",
    "../inspection-tasks/photo-annotation.controller.ts",
    "../issues/issue-event.controller.ts",
    "../media/media.service.ts",
    "../managed-objects/managed-object-deletion.service.ts",
    "../managed-objects/managed-objects.controller.ts",
    "./audit.controller.ts",
  ];
  for (const path of files) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /actor:\s*["']admin["']|["']admin["']\s*,\s*(?:input|body)|body\.actor|actor\s*=\s*["']/);
  }
});
