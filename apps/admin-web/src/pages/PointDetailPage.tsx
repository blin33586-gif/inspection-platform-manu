import { useMemo } from "react";
import { Button, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Link, useParams } from "react-router-dom";
import type { IssueStatus, IssueSummary, PageResult, PointSummary, ReportSummary } from "@xunjianbao/shared";
import { points, issues, reports } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const emptyIssues: PageResult<IssueSummary> = { items: [], page: 1, pageSize: 20, total: 0 };
const emptyReports: PageResult<ReportSummary> = { items: [], page: 1, pageSize: 20, total: 0 };

function fallbackPoint(id: string | undefined): PointSummary {
  return points.find((item) => item.id === id) ?? points[0];
}

function statusLabel(value: IssueStatus) {
  if (value === "pending") return "待处理";
  if (value === "processing") return "处理中";
  if (value === "rectified") return "已整改";
  if (value === "verified") return "复查通过";
  if (value === "ignored") return "忽略";
  return "归档";
}

function fallbackIssuesFor(pointName: string): PageResult<IssueSummary> {
  const items = issues.filter((item) => item.objectName === pointName);
  return { ...emptyIssues, items, total: items.length };
}

function fallbackReportsFor(pointName: string): PageResult<ReportSummary> {
  const items = reports.filter((item) => item.relatedObjectName === pointName);
  return { ...emptyReports, items, total: items.length };
}

export function PointDetailPage() {
  const { id } = useParams();
  const fallback = useMemo(() => fallbackPoint(id), [id]);
  const fallbackIssuePage = useMemo(() => fallbackIssuesFor(fallback.name), [fallback.name]);
  const fallbackReportPage = useMemo(() => fallbackReportsFor(fallback.name), [fallback.name]);
  const { data: point } = useApiResource<PointSummary>(`/points/${id}`, fallback);
  const { data: relatedIssues, loading } = useApiResource<PageResult<IssueSummary>>(`/points/${id}/issues`, fallbackIssuePage);
  const { data: relatedReports } = useApiResource<PageResult<ReportSummary>>(`/points/${id}/reports`, fallbackReportPage);

  const issueColumns: ColumnsType<IssueSummary> = [
    { title: "问题", dataIndex: "title", render: (value: string, record) => <Link className="text-link compact-link" to={`/issues/${record.id}`}>{value}</Link> },
    { title: "类型", dataIndex: "category" },
    {
      title: "状态",
      dataIndex: "status",
      render: (value: IssueStatus) => (
        <Tag color={value === "pending" ? "orange" : value === "verified" ? "green" : "blue"}>{statusLabel(value)}</Tag>
      ),
    },
    { title: "发现时间", dataIndex: "foundAt" },
  ];

  return (
    <>
      <PageHeader eyebrow="POINT DETAIL" title={point.name} actions={<Button href="/points">返回点位列表</Button>} />

      <section className="content-section">
        <div className="detail-layout">
          <article className="detail-hero">
            <div className="detail-title">
              <span className="status pending">{point.status}</span>
              <h4>{point.pointType}</h4>
              <p>点位档案用于管理广告牌、河道绿化、重点设施等位置的巡检问题、报告和复查资料。</p>
            </div>
            <div className="detail-kpis">
              <div><span>关联对象</span><strong>{point.relatedObjectName}</strong></div>
              <div><span>发现问题</span><strong>{point.issueCount}</strong></div>
              <div><span>关联报告</span><strong>{point.reportCount}</strong></div>
              <div><span>点位状态</span><strong>{point.status}</strong></div>
            </div>
          </article>

          <aside className="timeline-panel">
            <h4>关联报告</h4>
            <div className="timeline">
              {relatedReports.items.length ? relatedReports.items.map((report) => (
                <div key={report.id}>
                  <time>{report.reportDate.slice(5)}</time>
                  <strong>{report.title}</strong>
                  <span>{report.issueCount} 个问题</span>
                </div>
              )) : <p className="empty-note">暂无关联报告</p>}
            </div>
          </aside>
        </div>
      </section>

      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">RELATED ISSUES</p>
            <h3>关联问题</h3>
          </div>
          <Button type="primary" href="/issues">查看问题台账</Button>
        </div>
        <Table rowKey="id" columns={issueColumns} dataSource={relatedIssues.items} loading={loading} pagination={false} className="data-table" />
      </section>
    </>
  );
}
