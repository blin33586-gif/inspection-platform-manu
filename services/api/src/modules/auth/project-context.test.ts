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
      sub: "member",
      name: "项目成员",
      role: "member",
      projectIds: ["quyang", "jinshan"],
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
