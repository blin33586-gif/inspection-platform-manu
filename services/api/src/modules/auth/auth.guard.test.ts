import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AuthGuard } from "./auth.guard.js";
import type { AuthIdentity, AuthService } from "./auth.service.js";

function contextFor(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

function guardFor(identity: AuthIdentity) {
  const auth = {
    authenticateToken: async () => identity,
  } as unknown as AuthService;
  return new AuthGuard(auth);
}

const member: AuthIdentity = {
  id: "member-1",
  sub: "member-1",
  name: "项目成员",
  role: "member",
  tokenVersion: 3,
  projectIds: ["jinshan"],
};

const administrator: AuthIdentity = {
  id: "platform-admin",
  sub: "platform-admin",
  name: "项目管理员",
  role: "platform_admin",
  tokenVersion: 1,
  projectIds: [],
};

function protectedRequest(path: string, projectId?: string, method = "GET") {
  return {
    method,
    path,
    headers: {
      authorization: "Bearer signed-token",
      ...(projectId ? { "x-project-id": projectId } : {}),
    },
    query: {},
  };
}

test("requires a selected project for protected business requests", async () => {
  await assert.rejects(
    guardFor(administrator).canActivate(contextFor(protectedRequest("/api/v1/dashboard/summary"))),
    BadRequestException,
  );
});

test("member can write inside an assigned project", async () => {
  const request = protectedRequest("/api/v1/issues/is-001/status", "jinshan", "PATCH");

  assert.equal(await guardFor(member).canActivate(contextFor(request)), true);
  assert.equal((request as { projectId?: string }).projectId, "jinshan");
});

test("member cannot access an unassigned project", async () => {
  await assert.rejects(
    guardFor(member).canActivate(contextFor(protectedRequest("/api/v1/issues", "quyang"))),
    ForbiddenException,
  );
});

test("platform routes require the platform administrator", async (t) => {
  await t.test("member is forbidden", async () => {
    await assert.rejects(
      guardFor(member).canActivate(contextFor(protectedRequest("/api/v1/platform/members"))),
      (error: unknown) => error instanceof ForbiddenException
        && error.message === "Platform administrator required",
    );
  });

  await t.test("administrator needs no selected project", async () => {
    assert.equal(
      await guardFor(administrator).canActivate(contextFor(protectedRequest("/api/v1/platform/members"))),
      true,
    );
  });
});

test("platform route authorization follows Express case-insensitive routing", async (t) => {
  await t.test("mixed-case platform route rejects a member", async () => {
    await assert.rejects(
      guardFor(member).canActivate(contextFor(protectedRequest("/api/v1/Platform/members"))),
      (error: unknown) => error instanceof ForbiddenException
        && error.message === "Platform administrator required",
    );
  });

  await t.test("mixed-case platform route allows an administrator", async () => {
    assert.equal(
      await guardFor(administrator).canActivate(contextFor(protectedRequest("/api/v1/Platform/members"))),
      true,
    );
  });
});

test("platform namespace matching keeps an exact path boundary", async () => {
  const request = protectedRequest("/api/v1/Platform-foo", "jinshan");

  assert.equal(await guardFor(member).canActivate(contextFor(request)), true);
  assert.equal((request as { projectId?: string }).projectId, "jinshan");
});

test("authenticated users can list their projects without selecting one", async () => {
  assert.equal(
    await guardFor(member).canActivate(contextFor(protectedRequest("/api/v1/auth/projects"))),
    true,
  );
});

test("project list exemption follows Express case-insensitive routing", async () => {
  assert.equal(
    await guardFor(member).canActivate(contextFor(protectedRequest("/api/v1/Auth/projects"))),
    true,
  );
});
