import assert from "node:assert/strict";
import test from "node:test";
import {
  currentIdentity,
  currentProjectId,
  runWithProjectContext,
} from "./project-context.js";

test("keeps the selected project and identity across async work", async () => {
  await runWithProjectContext({
    projectId: "jinshan",
    identity: {
      id: "member-1",
      sub: "member-1",
      name: "项目成员",
      role: "member",
      tokenVersion: 3,
      projectIds: ["jinshan"],
    },
  }, async () => {
    await Promise.resolve();
    assert.equal(currentProjectId(), "jinshan");
    assert.equal(currentIdentity()?.role, "member");
  });
});

test("uses quyang only for direct service calls outside an HTTP request", () => {
  assert.equal(currentProjectId(), "quyang");
});
