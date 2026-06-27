import { LayoutDashboard, Map, FileText, AlertTriangle, Building2, Route, Database } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "首页驾驶舱", icon: LayoutDashboard },
  { to: "/communities", label: "小区档案", icon: Building2 },
  { to: "/roads", label: "道路街面", icon: Route },
  { to: "/reports", label: "巡检报告", icon: FileText },
  { to: "/issues", label: "问题台账", icon: AlertTriangle },
  { to: "/map-assets", label: "地图资产", icon: Map },
];

export function Shell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">巡</div>
          <div>
            <strong>巡检宝</strong>
            <span>无人机巡检平台</span>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.to === "/"}>
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="side-card">
          <Database size={18} />
          <span>当前项目</span>
          <strong>上海市虹口区曲阳路街道</strong>
          <p>正式工程基座：路由、页面、共享类型和模拟数据。</p>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
