import { useState } from "react";
import { Button, Input, message, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { IssueStatus, IssueSummary, PageResult } from "@xunjianbao/shared";
import { patchJsonApi, withQuery } from "../api/client";
import { issues } from "../data";
import { PageHeader } from "../components/PageHeader";
import { useApiResource } from "../hooks/useApiResource";

const fallbackIssues: PageResult<IssueSummary> = {
  items: issues,
  page: 1,
  pageSize: 20,
  total: issues.length,
};

function statusLabel(value: IssueStatus) {
  if (value === "pending") return "待处理";
  if (value === "processing") return "处理中";
  if (value === "rectified") return "已整改";
  if (value === "verified") return "复查通过";
  if (value === "ignored") return "忽略";
  return "归档";
}

export function IssuesPage() {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<IssueStatus | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { data, loading, reload } = useApiResource(withQuery("/issues", { keyword, status, page, pageSize }), fallbackIssues);

  const searchKeyword = (value: string) => {
    setKeyword(value);
    setPage(1);
  };

  const changeStatus = (value: IssueStatus | undefined) => {
    setStatus(value);
    setPage(1);
  };

  const updateStatus = async (id: string, status: IssueStatus) => {
    setUpdatingId(id);
    try {
      await patchJsonApi<IssueSummary>(`/issues/${id}/status`, { status });
      message.success("状态已更新");
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "更新失败");
    } finally {
      setUpdatingId(null);
    }
  };

  const columns: ColumnsType<IssueSummary> = [
    { title: "对象", dataIndex: "objectName" },
    { title: "问题", dataIndex: "title" },
    { title: "类型", dataIndex: "category" },
    {
      title: "状态",
      dataIndex: "status",
      render: (value: IssueStatus) => (
        <Tag color={value === "pending" ? "orange" : value === "verified" ? "green" : "blue"}>{statusLabel(value)}</Tag>
      ),
    },
    { title: "发现时间", dataIndex: "foundAt" },
    {
      title: "操作",
      render: (_, record) => (
        <Space>
          <Button size="small" loading={updatingId === record.id} onClick={() => updateStatus(record.id, "processing")}>处理中</Button>
          <Button size="small" type="primary" loading={updatingId === record.id} onClick={() => updateStatus(record.id, "verified")}>复查通过</Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageHeader eyebrow="ISSUE LEDGER" title="问题台账" actions={<Button type="primary">新增问题</Button>} />
      <section className="content-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">ALL ISSUES</p>
            <h3>重点问题列表</h3>
          </div>
          <div className="filter-controls">
            <Input.Search
              placeholder="搜索对象、问题、类型"
              allowClear
              onSearch={searchKeyword}
              onChange={(event) => !event.target.value && searchKeyword("")}
            />
            <Select
              allowClear
              placeholder="状态"
              value={status}
              onChange={changeStatus}
              options={[
                { label: "待处理", value: "pending" },
                { label: "处理中", value: "processing" },
                { label: "复查通过", value: "verified" },
                { label: "已整改", value: "rectified" },
              ]}
            />
          </div>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data.items}
          loading={loading}
          pagination={{
            current: data.page,
            pageSize: data.pageSize,
            total: data.total,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            },
          }}
          className="data-table"
        />
      </section>
    </>
  );
}
