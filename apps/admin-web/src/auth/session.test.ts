import assert from "node:assert/strict";
import test from "node:test";
import type { SessionProject } from "./project-access.js";
import { clearSession, getCurrentProject, getToken, getUser, saveCurrentProject, saveSession } from "./session.js";

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
});

const project: SessionProject = {
  id: "jinshan",
  name: "金山化工园区项目",
  shortName: "金山化工园区",
  customerType: "化工园区",
  archiveDimensions: [],
};

test.afterEach(() => {
  clearSession();
  values.clear();
});

test("platform administrators can select every project", () => {
  saveSession("token", {
    username: "admin",
    name: "平台管理员",
    role: "platform_admin",
    projectIds: [],
  });

  assert.equal(saveCurrentProject(project), true);
  assert.deepEqual(getCurrentProject(), project);
});

test("members can only select assigned projects", () => {
  saveSession("token", {
    username: "member",
    name: "项目成员",
    role: "member",
    projectIds: [],
  });

  assert.equal(saveCurrentProject(project), false);
  assert.equal(getCurrentProject(), null);
});

test("invalid persisted users clear the whole local session", async (t) => {
  const invalidUsers: Array<[string, string | null]> = [
    ["missing user", null],
    ["legacy admin role", JSON.stringify({ username: "admin", name: "平台管理员", role: "admin", projectIds: [] })],
    ["unknown role", JSON.stringify({ username: "admin", name: "平台管理员", role: "owner", projectIds: [] })],
    ["incomplete user", JSON.stringify({ username: "member", name: "项目成员", role: "member" })],
  ];

  for (const [name, rawUser] of invalidUsers) {
    await t.test(name, () => {
      values.set("xunjianbao_token", "stale-token");
      if (rawUser) values.set("xunjianbao_user", rawUser);
      values.set("xunjianbao_project", JSON.stringify(project));

      assert.equal(getUser(), null);
      assert.equal(getToken(), null);
      assert.equal(values.has("xunjianbao_user"), false);
      assert.equal(values.has("xunjianbao_project"), false);
    });
  }
});
