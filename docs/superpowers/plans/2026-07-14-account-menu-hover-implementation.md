# 顶部“更多”悬浮菜单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将顶部“更多”改为与主导航一致的紧凑白色悬浮菜单，并保证鼠标移开后立即关闭。

**Architecture:** 保留现有 `Shell`、权限导航数据和路由结构，仅让 `isAccountMenuOpen` 由容器的鼠标与焦点事件控制。CSS 继续复用 `nav-dropdown` 的定位与过渡，同时用 `account-dropdown` 的更高优先级规则覆盖为紧凑白色菜单。

**Tech Stack:** React 18、React Router、TypeScript、CSS、Node test runner

## Global Constraints

- 仅调整顶部右侧“更多”菜单。
- 保留“切换项目、地图、操作日志、人员管理”的现有权限和导航逻辑。
- 不重构“档案库”菜单，不改数据、接口或权限。
- 鼠标进入显示，离开整个菜单区域后关闭；点击触发器不得永久锁定菜单。
- 键盘焦点进入时显示，离开整个区域后关闭。
- 使用白色背景、浅灰蓝细边框、轻阴影、紧凑间距和浅蓝悬浮项。

---

## File Structure

- `apps/admin-web/src/components/Shell.tsx`：控制“更多”菜单的鼠标与键盘状态。
- `apps/admin-web/src/styles/global.css`：定义紧凑白色面板、菜单项及悬浮状态。
- `apps/admin-web/src/components/navigation-config.test.ts`：锁定交互事件、非持久点击行为、视觉声明与 825px 边界。

### Task 1: 统一“更多”菜单的悬浮交互与视觉

**Files:**
- Modify: `apps/admin-web/src/components/Shell.tsx:88-106`
- Modify: `apps/admin-web/src/styles/global.css:209-248`
- Test: `apps/admin-web/src/components/navigation-config.test.ts`

**Interfaces:**
- Consumes: `accountNavigation(role)` 返回的现有导航项；`isAccountMenuOpen: boolean`。
- Produces: 由 `onMouseEnter`、`onMouseLeave`、`onFocus`、`onBlur` 驱动的 `account-menu open` 状态；CSS 选择器 `.account-dropdown` 与 `.account-dropdown a`。

- [ ] **Step 1: 写入失败的交互和样式测试**

在 `navigation-config.test.ts` 中增加：

```ts
test("account menu follows hover and focus without a persistent click toggle", () => {
  const accountMenuSource = shellSource.slice(
    shellSource.indexOf('<div className={`account-menu'),
    shellSource.indexOf('<button className="logout-button"'),
  );

  assert.match(accountMenuSource, /onMouseEnter=\{\(\) => setIsAccountMenuOpen\(true\)\}/);
  assert.match(accountMenuSource, /onMouseLeave=\{\(\) => setIsAccountMenuOpen\(false\)\}/);
  assert.match(accountMenuSource, /onFocus=\{\(\) => setIsAccountMenuOpen\(true\)\}/);
  assert.match(accountMenuSource, /onBlur=\{\(event\) => \{/);
  assert.doesNotMatch(accountMenuSource, /setIsAccountMenuOpen\(\(value\) => !value\)/);
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
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run:

```bash
pnpm --filter @xunjianbao/api exec tsx --test /Users/bolin/Documents/巡检宝/apps/admin-web/src/components/navigation-config.test.ts
```

Expected: FAIL；交互测试提示缺少 `onMouseEnter`，样式测试提示当前 `min-width` 或 `padding` 不符合新设计。

- [ ] **Step 3: 实现最小交互改动**

将 `Shell.tsx` 的账号菜单容器改为：

```tsx
<div
  className={`account-menu ${isAccountActive ? "active" : ""} ${isAccountMenuOpen ? "open" : ""}`}
  onMouseEnter={() => setIsAccountMenuOpen(true)}
  onMouseLeave={() => setIsAccountMenuOpen(false)}
  onFocus={() => setIsAccountMenuOpen(true)}
  onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setIsAccountMenuOpen(false);
  }}
>
```

删除“更多”按钮上的持久切换处理：

```tsx
<button
  aria-expanded={isAccountMenuOpen}
  aria-haspopup="menu"
  className="account-menu-trigger"
  type="button"
>
```

- [ ] **Step 4: 实现紧凑白色菜单样式**

在 `global.css` 中用以下声明覆盖账号菜单：

```css
.account-dropdown {
  top: calc(100% + 7px);
  right: 0;
  min-width: 148px;
  padding: 6px;
  border: 1px solid rgba(33, 74, 121, 0.12);
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 14px 32px rgba(20, 49, 88, 0.14);
}

.account-dropdown a {
  min-height: 36px;
  padding: 9px 10px;
  border-radius: 9px;
  color: #303642;
  font-size: 13px;
  line-height: 1.2;
}

.account-dropdown a:hover,
.account-dropdown a.active {
  color: var(--blue-700);
  background: rgba(0, 113, 227, 0.08);
}
```

保留 `.account-menu.open .account-dropdown`、`:focus-within` 和现有 825px 右对齐规则。

- [ ] **Step 5: 运行局部测试并确认通过**

Run:

```bash
pnpm --filter @xunjianbao/api exec tsx --test /Users/bolin/Documents/巡检宝/apps/admin-web/src/components/navigation-config.test.ts
```

Expected: PASS；导航配置、悬浮交互、紧凑样式和 825px 边界全部通过。

- [ ] **Step 6: 运行管理端回归和类型检查**

Run:

```bash
rg --files apps/admin-web/src | rg '\.test\.(ts|tsx)$' | while read -r file; do realpath "$file"; done | tr '\n' '\0' | xargs -0 pnpm --filter @xunjianbao/api exec tsx --test
pnpm --filter @xunjianbao/admin-web typecheck
git diff --check
```

Expected: 管理端测试全部 PASS，TypeScript 退出码为 0，`git diff --check` 无输出。

- [ ] **Step 7: 在当前页面验证交互**

在 `http://127.0.0.1:5183/` 验证：

1. 鼠标移入“更多”，白色紧凑菜单出现。
2. 鼠标从按钮移向菜单时不闪退。
3. 鼠标离开按钮与菜单整体区域后菜单消失。
4. “切换项目、地图、操作日志、人员管理”仍按权限显示并可导航。
5. 825px 宽度下菜单右对齐且不超出视口。

- [ ] **Step 8: 提交实现**

```bash
git add apps/admin-web/src/components/Shell.tsx apps/admin-web/src/styles/global.css apps/admin-web/src/components/navigation-config.test.ts
git commit -m "fix: unify account menu hover behavior"
```

