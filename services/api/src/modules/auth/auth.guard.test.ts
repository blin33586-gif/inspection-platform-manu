import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";

function contextFor(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

test("requires an allowed project for protected business requests", () => {
  const auth = new AuthService();
  const token = auth.login({ username: "admin", password: "xunjianbao2026" }).token;
  const guard = new AuthGuard(auth);

  assert.throws(() => guard.canActivate(contextFor({
    method: "GET",
    path: "/api/v1/dashboard/summary",
    headers: { authorization: `Bearer ${token}` },
    query: {},
  })), BadRequestException);

  assert.throws(() => guard.canActivate(contextFor({
    method: "GET",
    path: "/api/v1/dashboard/summary",
    headers: { authorization: `Bearer ${token}`, "x-project-id": "unknown" },
    query: {},
  })), ForbiddenException);
});

test("blocks member writes while allowing reads", () => {
  const auth = new AuthService();
  const token = auth.login({ username: "member", password: "xunjianbao-member-2026" }).token;
  const guard = new AuthGuard(auth);
  const headers = { authorization: `Bearer ${token}`, "x-project-id": "quyang" };

  assert.equal(guard.canActivate(contextFor({
    method: "GET",
    path: "/api/v1/issues",
    headers,
    query: {},
  })), true);

  assert.throws(() => guard.canActivate(contextFor({
    method: "PATCH",
    path: "/api/v1/issues/is-001/status",
    headers,
    query: {},
  })), ForbiddenException);
});

test("allows authenticated users to read their project list before selecting one", () => {
  const auth = new AuthService();
  const token = auth.login({ username: "member", password: "xunjianbao-member-2026" }).token;
  const guard = new AuthGuard(auth);

  assert.equal(guard.canActivate(contextFor({
    method: "GET",
    path: "/api/v1/auth/projects",
    headers: { authorization: `Bearer ${token}` },
    query: {},
  })), true);
});
