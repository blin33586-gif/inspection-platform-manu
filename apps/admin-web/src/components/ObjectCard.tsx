import { Link } from "react-router-dom";
import type { ManagedObjectSummary } from "@xunjianbao/shared";

interface ObjectCardProps {
  item: ManagedObjectSummary;
  to: string;
}

export function ObjectCard({ item, to }: ObjectCardProps) {
  const statusClass = item.status === "重点" ? "urgent" : item.status === "稳定" ? "done" : "pending";

  return (
    <Link className="archive-card-link" to={to}>
      <article className="archive-card">
        <span className={`status ${statusClass}`}>{item.status}</span>
        <h4>{item.name}</h4>
        <p>{item.objectType === "community" ? "小区巡检档案，关联问题、报告和照片。" : "道路街面档案，关联广告牌、占道经营和重点点位。"}</p>
        <div className="mini-stats">
          <span>本月问题 {item.issueCount}</span>
          <span>报告 {item.reportCount}</span>
        </div>
      </article>
    </Link>
  );
}
