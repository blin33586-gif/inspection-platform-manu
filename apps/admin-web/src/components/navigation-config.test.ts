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

function cssDeclarations(styles: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(rule, `missing CSS rule: ${selector}`);

  return Object.fromEntries(
    rule[1]
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separator = declaration.indexOf(":");
        return [declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim()];
      }),
  );
}

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
  assert.deepEqual(accountNavigation("member"), [
    { to: "/projects", label: "切换项目" },
    { to: "/map-assets", label: "地图" },
    { to: "/audit-logs", label: "操作日志" },
  ]);
});

test("platform administrator receives member management after the shared account actions", () => {
  assert.deepEqual(accountNavigation("platform_admin"), [
    { to: "/projects", label: "切换项目" },
    { to: "/map-assets", label: "地图" },
    { to: "/audit-logs", label: "操作日志" },
    { to: "/platform/members", label: "人员管理" },
  ]);
});

test("shell renders the role-aware account navigation and member label", () => {
  assert.match(shellSource, /accountNavigation\(user\?\.role\)/);
  assert.match(shellSource, /accountNavItems\.map/);
  assert.match(shellSource, /项目成员/);
  assert.doesNotMatch(shellSource, /ACCOUNT_NAV_ITEMS\.map/);
  assert.doesNotMatch(shellSource, /只读/);
});

test("account menu follows hover and focus without a persistent click toggle", () => {
  const accountMenuSource = shellSource.slice(
    shellSource.indexOf('className={`account-menu'),
    shellSource.indexOf('<button className="logout-button"'),
  );

  assert.match(accountMenuSource, /onMouseEnter=\{\(\) => setIsAccountMenuOpen\(true\)\}/);
  assert.match(accountMenuSource, /onMouseLeave=\{\(\) => setIsAccountMenuOpen\(false\)\}/);
  assert.match(accountMenuSource, /onFocus=\{\(\) => setIsAccountMenuOpen\(true\)\}/);
  assert.match(accountMenuSource, /onBlur=\{\(event\) => \{/);
  assert.doesNotMatch(accountMenuSource, /setIsAccountMenuOpen\(\(value\) => !value\)/);
  assert.doesNotMatch(globalStyles, /\.account-menu:focus-within \.account-dropdown/);
  assert.match(globalStyles, /\.account-menu\.open \.account-menu-trigger/);
});

test("account dropdown uses the compact white navigation style", () => {
  const dropdown = cssDeclarations(globalStyles, ".account-dropdown");
  assert.equal(dropdown["min-width"], "148px");
  assert.equal(dropdown.padding, "6px");
  assert.equal(dropdown["border-radius"], "14px");
  assert.equal(dropdown.background, "#ffffff");

  const item = cssDeclarations(globalStyles, ".account-dropdown a");
  assert.equal(item.padding, "9px 10px");
  assert.equal(item["border-radius"], "9px");
  assert.equal(item["font-size"], "13px");
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

  const accountDropdown = cssDeclarations(responsiveNavigationStyles, ".project-pill .account-dropdown");
  assert.equal(accountDropdown.left, "auto");
  assert.equal(accountDropdown.right, "0");

  const projectArchiveDropdown = cssDeclarations(responsiveNavigationStyles, ".nav-dropdown");
  assert.equal(projectArchiveDropdown.left, "0");
  assert.equal(projectArchiveDropdown.right, "auto");
});
