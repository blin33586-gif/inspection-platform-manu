import assert from "node:assert/strict";
import test from "node:test";
import {
  canModifyProject,
  projectArchiveNavigation,
  type SessionProject,
} from "./project-access.js";

const jinshan: SessionProject = {
  id: "jinshan",
  name: "金山化工园区项目",
  shortName: "金山化工园区",
  customerType: "化工园区",
  archiveDimensions: [
    { key: "community", label: "企业档案" },
    { key: "road", label: "道路档案" },
    { key: "point", label: "河道档案" },
  ],
};

test("members are read-only and administrators can modify", () => {
  assert.equal(canModifyProject("admin"), true);
  assert.equal(canModifyProject("member"), false);
});

test("builds archive navigation from the selected project dimensions", () => {
  assert.deepEqual(projectArchiveNavigation(jinshan), [
    { to: "/communities", label: "企业档案" },
    { to: "/roads", label: "道路档案" },
    { to: "/points", label: "河道档案" },
  ]);
});
