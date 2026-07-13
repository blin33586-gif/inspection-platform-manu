import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { canModifyProject, projectArchiveNavigation } from "../auth/project-access";
import { clearSession, getCurrentProject, getUser } from "../auth/session";
import { ACCOUNT_NAV_ITEMS, PRIMARY_NAV_ITEMS } from "./navigation-config";

const navItems = [
  { to: "/", label: "地图总览" },
];

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const project = getCurrentProject();
  const projectNavItems = projectArchiveNavigation(project);
  const canModify = canModifyProject(user?.role);
  const isHome = location.pathname === "/";
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const isProjectActive = projectNavItems.some((item) => (
    location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
  ));
  const isAccountActive = ACCOUNT_NAV_ITEMS.some((item) => (
    location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
  ));

  const logout = () => {
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <div className={`app-shell ${isHome ? "home-shell" : ""} ${canModify ? "" : "read-only-shell"}`}>
      <header className="global-nav">
        <div className="global-nav-inner">
          <NavLink className="nav-brand" to="/">
            <span className="brand-mark">巡</span>
            <strong>巡检宝</strong>
          </NavLink>

          <nav className="nav" aria-label="主导航">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === "/"}>
                {item.label}
              </NavLink>
            ))}
            <div
              className={`nav-menu ${isProjectActive ? "active" : ""} ${isProjectMenuOpen ? "open" : ""}`}
              onMouseEnter={() => setIsProjectMenuOpen(true)}
              onMouseLeave={() => setIsProjectMenuOpen(false)}
              onFocus={() => setIsProjectMenuOpen(true)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setIsProjectMenuOpen(false);
              }}
            >
              <button
                aria-expanded={isProjectMenuOpen}
                aria-haspopup="menu"
                className="nav-menu-trigger"
                type="button"
                onClick={() => setIsProjectMenuOpen((value) => !value)}
              >
                档案库
                <span aria-hidden="true">⌄</span>
              </button>
              <div className="nav-dropdown" role="menu">
                {projectNavItems.map((item) => (
                  <NavLink key={item.to} role="menuitem" to={item.to} onClick={() => setIsProjectMenuOpen(false)}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
            {PRIMARY_NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="project-pill">
            <div>
              <span>{project?.shortName ?? "未选择项目"}</span>
              <strong>{user?.name ?? "用户"} · {canModify ? "管理员" : "只读"}</strong>
            </div>
            <div className={`account-menu ${isAccountActive ? "active" : ""} ${isAccountMenuOpen ? "open" : ""}`}>
              <button
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="menu"
                className="account-menu-trigger"
                type="button"
                onClick={() => setIsAccountMenuOpen((value) => !value)}
              >
                更多
                <span aria-hidden="true">⌄</span>
              </button>
              <div className="nav-dropdown account-dropdown" role="menu">
                <NavLink role="menuitem" to="/projects" onClick={() => setIsAccountMenuOpen(false)}>
                  切换项目
                </NavLink>
                {ACCOUNT_NAV_ITEMS.map((item) => (
                  <NavLink key={item.to} role="menuitem" to={item.to} onClick={() => setIsAccountMenuOpen(false)}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
            <button className="logout-button" type="button" onClick={logout}>退出</button>
          </div>
        </div>
      </header>

      <main className={`main ${isHome ? "home-main" : ""}`}>
        <Outlet />
      </main>
    </div>
  );
}
