import { useMemo, useState } from "react";
import { Button, message, Space, Tag } from "antd";
import { useParams } from "react-router-dom";
import type { IssueStatus, IssueSummary } from "@xunjianbao/shared";
import { patchJsonApi } from "../api/client";
import { issues } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const allowedNextStatuses: Array<{ label: string; value: IssueStatus }> = [
  { label: "处理中", value: "processing" },
  { label: "已整改", value: "rectified" },
  { label: "复查通过", value: "verified" },
  { label: "忽略", value: "ignored" },
];

function fallbackIssue(id: string | undefined): IssueSummary {
  return issues.find((item) => item.id === id) ?? issues[0];
}

function statusLabel(value: IssueStatus) {
  if (value === "pending") return "待处理";
  if (value === "processing") return "处理中";
  if (value === "rectified") return "已整改";
  if (value === "verified") return "复查通过";
  if (value === "ignored") return "忽略";
  return "归档";
}

function statusColor(value: IssueStatus) {
  if (value === "pending") return "orange";
  if (value === "verified" || value === "rectified") return "green";
  if (value === "ignored" || value === "archived") return "default";
  return "blue";
}

export function IssueDetailPage() {
  const { id } = useParams();
  const fallback = useMemo(() => fallbackIssue(id), [id]);
  const { data: issue, reload } = useApiResource<IssueSummary>(`/issues/${id}`, fallback);
  const [updatingStatus, setUpdatingStatus] = useState<IssueStatus | null>(null);

  const updateStatus = async (status: IssueStatus) => {
    if (!id) return;
    setUpdatingStatus(status);
    try {
      await patchJsonApi<IssueSummary>(`/issues/${id}/status`, { status });
      message.success("状态已更新");
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "更新失败");
    } finally {
      setUpdatingStatus(null);
    }
  };

  return (
    <>
      <PageHeader eyebrow="ISSUE DETAIL" title={issue.title} actions={<Button href="/issues">返回问题台账</Button>} />

      <section className="content-section">
        <div className="detail-layout">
          <article className="detail-hero">
            <div className="detail-title">
              <Tag color={statusColor(issue.status)}>{statusLabel(issue.status)}</Tag>
              <h4>{issue.objectName}</h4>
              <p>{issue.category}问题，发现时间 {issue.foundAt}。后续可继续补现场照片、处置说明、复查记录和责任单位。</p>
            </div>
            <div className="detail-kpis">
              <div><span>问题类型</span><strong>{issue.category}</strong></div>
              <div><span>严重程度</span><strong>{issue.severity}</strong></div>
              <div><span>当前状态</span><strong>{statusLabel(issue.status)}</strong></div>
              <div><span>发现日期</span><strong>{issue.foundAt.slice(5)}</strong></div>
            </div>
          </article>

          <aside className="timeline-panel">
            <h4>状态推进</h4>
            <Space direction="vertical" className="status-action-list">
              {allowedNextStatuses.map((item) => (
                <Button
                  block
                  key={item.value}
                  loading={updatingStatus === item.value}
                  onClick={() => updateStatus(item.value)}
                  type={item.value === "verified" ? "primary" : "default"}
                >
                  {item.label}
                </Button>
              ))}
            </Space>
          </aside>
        </div>
      </section>
    </>
  );
}
