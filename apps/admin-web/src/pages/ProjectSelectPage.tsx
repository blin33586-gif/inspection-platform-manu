import { Button, Spin, message } from "antd";
import { Building2, Factory, LogOut, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getApi } from "../api/client";
import { canManagePlatform, type SessionProject } from "../auth/project-access";
import { clearSession, getUser, saveCurrentProject } from "../auth/session";

export function ProjectSelectPage() {
  const navigate = useNavigate();
  const user = getUser();
  const [projects, setProjects] = useState<SessionProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getApi<SessionProject[]>("/auth/projects")
      .then(setProjects)
      .catch((error: unknown) => message.error(error instanceof Error ? error.message : "项目读取失败"))
      .finally(() => setLoading(false));
  }, []);

  const enterProject = (project: SessionProject) => {
    if (!saveCurrentProject(project)) {
      message.error("当前账号没有该项目的访问权限");
      return;
    }
    navigate("/", { replace: true });
  };

  const logout = () => {
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <main className="project-select-page">
      <section className="project-select-shell">
        <header className="project-select-header">
          <div className="brand login-brand">
            <div className="brand-mark">巡</div>
            <div>
              <strong>巡检宝</strong>
              <span>多项目巡检管理平台</span>
            </div>
          </div>
          <div className="project-select-actions">
            {canManagePlatform(user?.role) ? (
              <Button icon={<Users size={15} />} onClick={() => navigate("/platform/members")}>平台成员管理</Button>
            ) : null}
            <Button icon={<LogOut size={15} />} onClick={logout}>退出登录</Button>
          </div>
        </header>
        <div className="project-select-copy">
          <p className="eyebrow">PROJECT ACCESS</p>
          <h1>选择要进入的项目</h1>
          <p>{user?.name ?? "用户"} · {canManagePlatform(user?.role) ? "平台管理员" : "项目成员"}</p>
        </div>
        {loading ? (
          <div className="project-select-loading"><Spin /><span>正在读取可访问项目</span></div>
        ) : (
          <div className="project-select-grid">
            {projects.map((project) => {
              const isIndustry = project.id === "jinshan";
              const Icon = isIndustry ? Factory : Building2;
              return (
                <article className="project-select-card" key={project.id}>
                  <div className={`project-select-icon ${isIndustry ? "industry" : "street"}`}><Icon size={28} /></div>
                  <div>
                    <span>{project.customerType}</span>
                    <h2>{project.name}</h2>
                    <p>{project.archiveDimensions.map((item) => item.label).join(" · ")}</p>
                  </div>
                  <div className="project-select-access"><ShieldCheck size={15} />数据库独立视图</div>
                  <Button type="primary" size="large" onClick={() => enterProject(project)}>进入项目</Button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
