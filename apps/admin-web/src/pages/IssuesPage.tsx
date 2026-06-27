import { useState } from "react";
import { Button, message, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { IssueStatus, IssueSummary, PageResult } from "@xunjianbao/shared";
import { patchJsonApi } from "../api/client";
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
  const { data, loading, reload } = useApiResource("/issues", fallbackIssues);

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
          <div className="filter-bar"><button className="active">全部</button><button>待处理</button><button>处理中</button><button>复查通过</button></div>
        </div>
        <Table rowKey="id" columns={columns} dataSource={data.items} loading={loading} pagination={false} className="data-table" />
      </section>
    </>
  );
}
