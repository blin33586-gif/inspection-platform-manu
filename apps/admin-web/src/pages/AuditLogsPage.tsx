import { useState } from "react";
import { Input, Select, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { AuditLogSummary, PageResult } from "@xunjianbao/shared";
import { withQuery } from "../api/client";
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
  const [keyword, setKeyword] = useState("");
  const [action, setAction] = useState<string | undefined>();
  const [targetType, setTargetType] = useState<string | undefined>();
  const { data, loading } = useApiResource(withQuery("/audit-logs", { keyword, action, targetType }), fallbackAuditLogs);

  return (
    <>
      <PageHeader eyebrow="AUDIT LOGS" title="操作审计" />
      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">RECENT ACTIVITIES</p>
            <h3>最近操作记录</h3>
          </div>
          <div className="filter-controls audit-filter-controls">
            <Input.Search
              placeholder="搜索人员、动作、说明"
              allowClear
              onSearch={setKeyword}
              onChange={(event) => !event.target.value && setKeyword("")}
            />
            <Select
              allowClear
              placeholder="动作"
              value={action}
              onChange={setAction}
              options={[
                { label: "状态变更", value: "issue.status.update" },
                { label: "上传报告", value: "report.upload" },
                { label: "上传地图", value: "map.upload" },
                { label: "新增热区", value: "map.hot_area.create" },
              ]}
            />
            <Select
              allowClear
              placeholder="对象"
              value={targetType}
              onChange={setTargetType}
              options={[
                { label: "问题", value: "issue" },
                { label: "报告", value: "report" },
                { label: "地图", value: "map_asset" },
                { label: "热区", value: "map_hot_area" },
              ]}
            />
          </div>
        </div>
        <Table rowKey="id" columns={columns} dataSource={data.items} loading={loading} pagination={false} className="data-table" />
      </section>
    </>
  );
}
