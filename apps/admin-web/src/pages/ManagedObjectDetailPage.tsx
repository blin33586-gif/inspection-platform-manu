import { useMemo } from "react";
import { Button, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Link, useParams } from "react-router-dom";
import type { IssueStatus, IssueSummary, ManagedObjectSummary, PageResult, ReportSummary } from "@xunjianbao/shared";
import { getApiUrl } from "../api/client";
import { communities, issues, reports, roads } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

interface ManagedObjectDetailPageProps {
  objectType: "community" | "road";
}

const emptyIssues: PageResult<IssueSummary> = { items: [], page: 1, pageSize: 20, total: 0 };
const emptyReports: PageResult<ReportSummary> = { items: [], page: 1, pageSize: 20, total: 0 };

function statusClass(status: string) {
  if (status === "重点") return "urgent";
  if (status === "稳定") return "done";
  return "pending";
}

function statusLabel(value: IssueStatus) {
  if (value === "pending") return "待处理";
  if (value === "processing") return "处理中";
  if (value === "rectified") return "已整改";
  if (value === "verified") return "复查通过";
  if (value === "ignored") return "忽略";
  return "归档";
}

function fallbackObject(objectType: "community" | "road", id: string | undefined): ManagedObjectSummary {
  const source = objectType === "community" ? communities : roads;
  return source.find((item) => item.id === id) ?? source[0];
}

function fallbackIssuesFor(objectName: string): PageResult<IssueSummary> {
  const items = issues.filter((item) => item.objectName === objectName);
  return { ...emptyIssues, items, total: items.length };
}

function fallbackReportsFor(objectName: string): PageResult<ReportSummary> {
  const items = reports.filter((item) => item.relatedObjectName === objectName);
  return { ...emptyReports, items, total: items.length };
}

export function ManagedObjectDetailPage({ objectType }: ManagedObjectDetailPageProps) {
  const { id } = useParams();
  const basePath = objectType === "community" ? "communities" : "roads";
  const listPath = objectType === "community" ? "/communities" : "/roads";
  const label = objectType === "community" ? "小区" : "道路";
  const fallback = useMemo(() => fallbackObject(objectType, id), [id, objectType]);
  const fallbackIssuePage = useMemo(() => fallbackIssuesFor(fallback.name), [fallback.name]);
  const fallbackReportPage = useMemo(() => fallbackReportsFor(fallback.name), [fallback.name]);

  const { data: object } = useApiResource<ManagedObjectSummary>(`/${basePath}/${id}`, fallback);
  const { data: relatedIssues, loading: issuesLoading } = useApiResource<PageResult<IssueSummary>>(
    `/${basePath}/${id}/issues`,
    fallbackIssuePage,
  );
  const { data: relatedReports } = useApiResource<PageResult<ReportSummary>>(
    `/${basePath}/${id}/reports`,
    fallbackReportPage,
  );

  const pendingCount = relatedIssues.items.filter((item) => item.status === "pending" || item.status === "processing").length;

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
      <PageHeader
        eyebrow={objectType === "community" ? "COMMUNITY DETAIL" : "ROAD DETAIL"}
        title={`${object.name}${label}档案`}
        actions={<Button href={listPath}>返回列表</Button>}
      />

      <section className="content-section">
        <div className="detail-layout">
          <article className="detail-hero">
            <div className="detail-title">
              <span className={`status ${statusClass(object.status)}`}>{object.status}</span>
              <h4>{object.name}</h4>
              <p>{objectType === "community" ? "集中查看该小区的巡检问题、关联报告和复查状态。" : "集中查看该道路的街面问题、广告牌巡检和关联报告。"}</p>
            </div>
            <div className="detail-kpis">
              <div><span>发现问题</span><strong>{object.issueCount}</strong></div>
              <div><span>待跟进</span><strong>{pendingCount}</strong></div>
              <div><span>关联报告</span><strong>{object.reportCount}</strong></div>
              <div><span>当前状态</span><strong>{object.status}</strong></div>
            </div>
          </article>

          <aside className="timeline-panel">
            <h4>关联报告</h4>
            <div className="timeline">
              {relatedReports.items.length ? relatedReports.items.map((report) => (
                <div key={report.id}>
                  <time>{report.reportDate.slice(5)}</time>
                  <strong>{report.title}</strong>
                  <span>{report.issueCount} 个问题 / {report.processStatus === "uploaded" ? "已上传" : "已归档"}</span>
                  {report.fileName ? <a className="text-link" href={getApiUrl(`/reports/${report.id}/file`)}>下载文件</a> : null}
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
        <Table
          rowKey="id"
          columns={issueColumns}
          dataSource={relatedIssues.items}
          loading={issuesLoading}
          pagination={false}
          className="data-table"
        />
      </section>
    </>
  );
}
