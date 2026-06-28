import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearSession, getUser } from "../auth/session";

const navItems = [
  { to: "/", label: "首页" },
  { to: "/communities", label: "小区" },
  { to: "/roads", label: "道路" },
  { to: "/points", label: "点位" },
  { to: "/reports", label: "报告" },
  { to: "/issues", label: "问题" },
  { to: "/map-assets", label: "地图" },
  { to: "/audit-logs", label: "审计" },
];

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const isHome = location.pathname === "/";

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
          </nav>

          <div className="project-pill">
            <div>
              <span>曲阳路街道</span>
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
