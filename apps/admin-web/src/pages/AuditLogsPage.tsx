import { Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { AuditLogSummary, PageResult } from "@xunjianbao/shared";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const fallbackAuditLogs: PageResult<AuditLogSummary> = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
};

const columns: ColumnsType<AuditLogSummary> = [
  { title: "时间", dataIndex: "createdAt", render: (value: string) => new Date(value).toLocaleString() },
  { title: "操作人", dataIndex: "actor" },
  { title: "动作", dataIndex: "action", render: (value: string) => <Tag color="blue">{value}</Tag> },
  { title: "对象", dataIndex: "targetType" },
  { title: "说明", dataIndex: "summary" },
];

export function AuditLogsPage() {
  const { data, loading } = useApiResource("/audit-logs", fallbackAuditLogs);

  return (
    <>
      <PageHeader eyebrow="AUDIT LOGS" title="操作审计" />
      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">RECENT ACTIVITIES</p>
            <h3>最近操作记录</h3>
          </div>
        </div>
        <Table rowKey="id" columns={columns} dataSource={data.items} loading={loading} pagination={false} className="data-table" />
      </section>
    </>
  );
}
