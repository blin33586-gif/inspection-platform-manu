import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, actions }: PageHeaderProps) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {actions ? <div className="top-actions">{actions}</div> : null}
    </header>
  );
}
