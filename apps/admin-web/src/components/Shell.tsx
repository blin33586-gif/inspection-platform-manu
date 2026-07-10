import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearSession, getUser } from "../auth/session";

const navItems = [
  { to: "/", label: "地图总览" },
];

const workflowNavItems = [
  { to: "/media-library", label: "媒体库" },
  { to: "/reports", label: "巡检报告" },
  { to: "/issues", label: "已发现问题" },
  { to: "/map-assets", label: "地图" },
  { to: "/audit-logs", label: "审计" },
];

const projectNavItems = [
  { to: "/communities", label: "小区档案" },
  { to: "/roads", label: "道路街面" },
  { to: "/points", label: "重点点位" },
];

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const isHome = location.pathname === "/";
  const isProjectActive = projectNavItems.some((item) => (
    location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
  ));

  const logout = () => {
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <div className={`app-shell ${isHome ? "home-shell" : ""}`}>
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
            <div className={`nav-menu ${isProjectActive ? "active" : ""}`}>
              <button aria-haspopup="menu" className="nav-menu-trigger" type="button">
                项目
                <span aria-hidden="true">⌄</span>
              </button>
              <div className="nav-dropdown" role="menu">
                {projectNavItems.map((item) => (
                  <NavLink key={item.to} role="menuitem" to={item.to}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
            {workflowNavItems.map((item) => (
              <NavLink key={item.to} to={item.to}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="project-pill">
            <div>
              <span>Dock 3 / 曲阳路街道</span>
              <strong>{user?.name ?? "管理员"}</strong>
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
