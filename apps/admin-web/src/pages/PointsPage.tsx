import { Button, Tag } from "antd";
import { Link } from "react-router-dom";
import type { PageResult, PointSummary } from "@xunjianbao/shared";
import { points } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const fallbackPoints: PageResult<PointSummary> = {
  items: points,
  page: 1,
  pageSize: 20,
  total: points.length,
};

function statusColor(status: string) {
  if (status === "待复查") return "orange";
  if (status === "重点") return "red";
  if (status === "稳定") return "green";
  return "blue";
}

export function PointsPage() {
  const { data } = useApiResource("/points", fallbackPoints);

  return (
    <>
      <PageHeader eyebrow="KEY POINTS" title="重点点位" actions={<Button type="primary">新增点位</Button>} />
      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">POINT ARCHIVES</p>
            <h3>广告牌、河道、重点设施</h3>
          </div>
        </div>
        <div className="card-grid">
          {data.items.map((item) => (
            <Link className="archive-card-link" to={`/points/${item.id}`} key={item.id}>
              <article className="archive-card point-card">
                <Tag color={statusColor(item.status)}>{item.status}</Tag>
                <h4>{item.name}</h4>
                <p>{item.pointType} / 关联 {item.relatedObjectName}，用于沉淀广告牌、河道绿化、重点设施等点位巡检资料。</p>
                <div className="mini-stats">
                  <span>问题 {item.issueCount}</span>
                  <span>报告 {item.reportCount}</span>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
