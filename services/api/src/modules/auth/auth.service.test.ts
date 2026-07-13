import assert from "node:assert/strict";
import test from "node:test";
import { AuthService } from "./auth.service.js";

test("logs in administrator and read-only member with both project memberships", () => {
  const service = new AuthService();

  const administrator = service.login({ username: "admin", password: "xunjianbao2026" });
  const member = service.login({ username: "member", password: "xunjianbao-member-2026" });

  assert.equal(administrator.user.role, "admin");
  assert.equal(member.user.role, "member");
  assert.deepEqual(administrator.user.projectIds, ["quyang", "jinshan"]);
  assert.deepEqual(member.user.projectIds, ["quyang", "jinshan"]);
});

test("verifies a signed token into an access payload", () => {
  const service = new AuthService();
  const result = service.login({ username: "member", password: "xunjianbao-member-2026" });

  assert.deepEqual(service.verifyToken(result.token), {
    sub: "member",
    name: "项目成员",
    role: "member",
    projectIds: ["quyang", "jinshan"],
  });
});

test("lists only projects included in the verified identity", () => {
  const service = new AuthService();

  assert.deepEqual(service.projectsFor({
    sub: "member",
    name: "项目成员",
    role: "member",
    projectIds: ["jinshan"],
  }).map((project) => project.id), ["jinshan"]);
});
