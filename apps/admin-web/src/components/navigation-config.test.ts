import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { accountNavigation, ACCOUNT_NAV_ITEMS, PRIMARY_NAV_ITEMS } from "./navigation-config.js";

const shellSource = readFileSync(new URL("./Shell.tsx", import.meta.url), "utf8");
const mediaLibrarySource = readFileSync(new URL("../pages/MediaLibraryPage.tsx", import.meta.url), "utf8");
const globalStyles = readFileSync(new URL("../styles/global.css", import.meta.url), "utf8");
const responsiveNavigationStyles = globalStyles.slice(
  globalStyles.indexOf("@media (max-width: 900px)"),
  globalStyles.indexOf(".issue-push-result"),
);

test("keeps business modules in the primary navigation", () => {
  assert.deepEqual(PRIMARY_NAV_ITEMS, [
    { to: "/media-library", label: "任务库" },
    { to: "/reports", label: "报告库" },
    { to: "/issues", label: "问题库" },
  ]);
});

test("moves map and operation logs into the account menu", () => {
  assert.deepEqual(ACCOUNT_NAV_ITEMS, [
    { to: "/map-assets", label: "地图" },
    { to: "/audit-logs", label: "操作日志" },
  ]);
});

test("project members retain account menu actions", () => {
  assert.deepEqual(accountNavigation("member").map((item) => item.label), ["切换项目", "地图", "操作日志"]);
});

test("platform administrator also sees member management", () => {
  assert.equal(accountNavigation("platform_admin").some((item) => item.label === "人员管理"), true);
});

test("shell renders the role-aware account navigation and member label", () => {
  assert.match(shellSource, /accountNavigation\(user\?\.role\)/);
  assert.match(shellSource, /accountNavItems\.map/);
  assert.match(shellSource, /项目成员/);
  assert.doesNotMatch(shellSource, /ACCOUNT_NAV_ITEMS\.map/);
  assert.doesNotMatch(shellSource, /只读/);
});

test("task center omits decorative and inert controls", () => {
  for (const token of ["Bell", "ChevronDown", "ListChecks", "media-notice", "按上传时间排序"]) {
    assert.equal(mediaLibrarySource.includes(token), false, `unexpected task-center token: ${token}`);
  }
  assert.doesNotMatch(mediaLibrarySource, /<strong>\{project\?\.shortName \?\? "当前项目"\}<\/strong>/);
  assert.match(mediaLibrarySource, /placeholder="搜索任务名称或原始文件名"/);
  assert.match(mediaLibrarySource, />新建任务<\/Button>/);
  assert.match(mediaLibrarySource, />巡检报告<\/Button>/);
  assert.match(mediaLibrarySource, /real-task-stat-grid/);
  assert.match(mediaLibrarySource, /real-task-card/);
});

test("task center styles omit selectors for removed controls", () => {
  assert.doesNotMatch(globalStyles, /\.media-notice\b/);
  assert.doesNotMatch(globalStyles, /\.media-top-actions\b/);
  assert.doesNotMatch(globalStyles, /\.media-topbar\s+span/);
  assert.doesNotMatch(globalStyles, /\.video-task-toolbar\s*>\s*div/);
});

test("825px navigation hides only project details and keeps the account menu visible", () => {
  assert.match(responsiveNavigationStyles, /\.project-pill\s*>\s*div:first-child\s*\{\s*display:\s*none;/);
  assert.match(responsiveNavigationStyles, /\.project-pill\s+\.account-menu\s*\{\s*display:\s*block;/);
  assert.doesNotMatch(responsiveNavigationStyles, /\.project-pill\s+div\s*\{\s*display:\s*none;/);
});
