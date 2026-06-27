import { useMemo } from "react";
import { Button, Descriptions, Tag } from "antd";
import { useParams } from "react-router-dom";
import type { ReportSummary } from "@xunjianbao/shared";
import { getApiUrl } from "../api/client";
import { reports } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

function fallbackReport(id: string | undefined): ReportSummary {
  return reports.find((item) => item.id === id) ?? reports[0];
}

function reportTypeLabel(value: ReportSummary["reportType"]) {
  if (value === "community") return "小区巡检";
  if (value === "road") return "道路巡检";
  if (value === "point") return "重点点位";
  return "综合报告";
}

function processStatusLabel(value: string | null | undefined) {
  if (value === "uploaded") return "已上传";
  if (value === "processed") return "已处理";
  return "已归档";
}

function formatFileSize(value: number | null | undefined) {
  if (!value) return "-";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function ReportDetailPage() {
  const { id } = useParams();
  const fallback = useMemo(() => fallbackReport(id), [id]);
  const { data: report } = useApiResource<ReportSummary>(`/reports/${id}`, fallback);

  return (
    <>
      <PageHeader eyebrow="REPORT DETAIL" title={report.title} actions={<Button href="/reports">返回报告列表</Button>} />

      <section className="content-section split-section">
        <article className="report-detail-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">BASIC INFO</p>
              <h3>报告信息</h3>
            </div>
            <Tag color={report.processStatus === "uploaded" ? "blue" : "green"}>{processStatusLabel(report.processStatus)}</Tag>
          </div>
          <Descriptions column={1} bordered className="detail-descriptions">
            <Descriptions.Item label="报告日期">{report.reportDate}</Descriptions.Item>
            <Descriptions.Item label="报告类型">{reportTypeLabel(report.reportType)}</Descriptions.Item>
            <Descriptions.Item label="关联对象">{report.relatedObjectName}</Descriptions.Item>
            <Descriptions.Item label="关联问题数">{report.issueCount}</Descriptions.Item>
            <Descriptions.Item label="原始文件名">{report.originalFileName ?? report.fileName ?? "样例报告"}</Descriptions.Item>
            <Descriptions.Item label="文件大小">{formatFileSize(report.fileSize)}</Descriptions.Item>
          </Descriptions>
          {report.fileName ? <a className="download-link detail-download" href={getApiUrl(`/reports/${report.id}/file`)}>下载报告文件</a> : null}
        </article>

        <article className="report-preview">
          <div className="section-head">
            <div>
              <p className="eyebrow">REPORT SUMMARY</p>
              <h3>报告摘要</h3>
            </div>
          </div>
          <div className="pdf-card report-detail-card">
            <span>{report.mimeType?.includes("pdf") ? "PDF" : "REPORT"}</span>
            <strong>{report.relatedObjectName}</strong>
            <p>本报告关联 {report.issueCount} 个巡检问题。后续可继续接入报告正文解析、现场照片、整改建议和在线预览。</p>
          </div>
        </article>
      </section>
    </>
  );
}
